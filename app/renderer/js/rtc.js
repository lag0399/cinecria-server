/**
 * Cinecria — módulo WebRTC
 * ------------------------------------------------------------
 * VoiceSession gerencia UMA sala de voz:
 *  - uma RTCPeerConnection por participante (mesh P2P)
 *  - "perfect negotiation" (sem colisão de ofertas, renegocia ao ligar câmera/tela)
 *  - microfone, câmera e tela (+ áudio do sistema) como streams separados;
 *    o id de cada stream é publicado no estado do usuário, assim o outro lado
 *    sabe o que é microfone, câmera ou tela.
 *  - tuning de qualidade: bitrate/FPS por sender, contentHint, Opus estéreo.
 */
(function () {
  const CFG = window.CINECRIA_CONFIG;

  /** Habilita Opus estéreo e bitrate alto — essencial para áudio de filmes/jogos. */
  function enableOpusStereo(sdp) {
    const pts = [...sdp.matchAll(/a=rtpmap:(\d+) opus\/48000\/2/gi)].map((m) => m[1]);
    for (const pt of pts) {
      const re = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`, 'g');
      sdp = sdp.replace(re, (line, params) =>
        params.includes('stereo=1') ? line : `a=fmtp:${pt} ${params};stereo=1;sprop-stereo=1;maxaveragebitrate=256000`);
    }
    return sdp;
  }

  class Peer {
    constructor(session, peerId) {
      this.session = session;
      this.id = peerId;
      this.polite = session.myId < peerId; // regra determinística: quem "cede" na colisão
      this.makingOffer = false;
      this.ignoreOffer = false;
      this.streams = new Map();   // streamId -> MediaStream remoto
      this.audioEls = new Map();  // trackId -> <audio>
      this.senders = {};          // mic | cam | screenV | screenA -> RTCRtpSender

      const pc = (this.pc = new RTCPeerConnection({ iceServers: CFG.iceServers, bundlePolicy: 'max-bundle' }));

      pc.onnegotiationneeded = async () => {
        try {
          this.makingOffer = true;
          await pc.setLocalDescription();
          this.send({ description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
        } catch (e) {
          console.warn('[rtc] negotiation', e);
        } finally {
          this.makingOffer = false;
        }
      };
      pc.onicecandidate = ({ candidate }) => candidate && this.send({ candidate: candidate.toJSON() });
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') pc.restartIce();
      };
      pc.onsignalingstatechange = () => {
        if (pc.signalingState === 'stable') this.applyParams(); // encodings existem após negociar
      };
      pc.ontrack = ({ track, streams }) => {
        const stream = streams[0] || new MediaStream([track]);
        this.streams.set(stream.id, stream);
        if (track.kind === 'audio') this.attachAudio(track);
        stream.onremovetrack = () => {
          if (!stream.getTracks().length) this.streams.delete(stream.id);
          session.changed();
        };
        track.onended = () => { this.detachAudio(track.id); session.changed(); };
        track.onunmute = () => session.changed();
        session.changed();
      };

      session.addLocalTracksTo(this);
    }

    send(data) { this.session.socket.emit('signal', { to: this.id, data }); }

    async handle({ description, candidate }) {
      const pc = this.pc;
      try {
        if (description) {
          const collision = description.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable');
          this.ignoreOffer = !this.polite && collision;
          if (this.ignoreOffer) return;
          await pc.setRemoteDescription({ type: description.type, sdp: enableOpusStereo(description.sdp) });
          if (description.type === 'offer') {
            await pc.setLocalDescription();
            this.send({ description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
          }
        } else if (candidate) {
          try { await pc.addIceCandidate(candidate); } catch (e) { if (!this.ignoreOffer) throw e; }
        }
      } catch (e) {
        console.warn('[rtc] signal', e);
      }
    }

    attachAudio(track) {
      const el = new Audio();
      el.autoplay = true;
      el.srcObject = new MediaStream([track]);
      el.muted = this.session.deafened;
      document.getElementById('audioSink').appendChild(el);
      el.play().catch(() => {});
      this.audioEls.set(track.id, el);
    }

    detachAudio(trackId) {
      const el = this.audioEls.get(trackId);
      if (!el) return;
      el.srcObject = null;
      el.remove();
      this.audioEls.delete(trackId);
    }

    setTrack(slot, track, stream) {
      if (this.senders[slot]) { try { this.pc.removeTrack(this.senders[slot]); } catch {} delete this.senders[slot]; }
      if (track) this.senders[slot] = this.pc.addTrack(track, stream);
      this.applyParams();
    }

    /** Aplica bitrate/FPS/prioridade nos senders de vídeo. */
    applyParams() {
      const s = this.session;
      const tune = async (sender, { bitrate, fps, degradation }) => {
        if (!sender) return;
        const p = sender.getParameters();
        if (!p.encodings || !p.encodings.length) return; // tenta de novo quando estabilizar
        p.encodings[0].maxBitrate = bitrate;
        p.encodings[0].maxFramerate = fps;
        p.encodings[0].priority = 'high';
        p.encodings[0].networkPriority = 'high';
        p.degradationPreference = degradation;
        try { await sender.setParameters(p); } catch (e) {
          delete p.degradationPreference; // versões antigas não aceitam
          try { await sender.setParameters(p); } catch {}
        }
      };
      if (s.screen) {
        const pr = s.screen.preset;
        tune(this.senders.screenV, {
          bitrate: pr.bitrate, fps: pr.fps,
          degradation: s.screen.hint === 'detail' ? 'maintain-resolution' : 'maintain-framerate',
        });
      }
      if (s.camStream) tune(this.senders.cam, { bitrate: CFG.camera.bitrate, fps: CFG.camera.fps, degradation: 'balanced' });
    }

    close() {
      for (const id of [...this.audioEls.keys()]) this.detachAudio(id);
      this.pc.ontrack = this.pc.onicecandidate = this.pc.onnegotiationneeded = null;
      this.pc.close();
    }
  }

  class VoiceSession {
    /**
     * @param {{socket:any, myId:string, serverId:string, channelId:string,
     *          muted:boolean, deafened:boolean, getMemberState:(id:string)=>any,
     *          onChange:()=>void, onSpeaking:(ids:Set<string>)=>void}} opts
     */
    constructor(opts) {
      Object.assign(this, opts);
      this.peers = new Map();
      this.micStream = null;
      this.camStream = null;
      this.screen = null; // { stream, preset, presetKey, hint }
      this.speaking = new Set();
      this._analysers = new Map();
      this._changeQueued = false;
    }

    changed() {
      if (this._changeQueued) return;
      this._changeQueued = true;
      requestAnimationFrame(() => { this._changeQueued = false; this.onChange(); });
    }

    async start() {
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        this.micStream.getAudioTracks().forEach((t) => (t.enabled = !(this.muted || this.deafened)));
      } catch (e) {
        console.warn('[rtc] sem microfone', e);
        this.micError = e;
      }

      const res = await new Promise((r) =>
        this.socket.timeout(8000).emit('voice:join', { channelId: this.channelId }, (err, data) => r(err ? { error: 'Tempo esgotado.' } : data)));
      if (res.error) { this.stopLocal(); throw new Error(res.error); }

      this.publish();
      for (const id of res.peers) this.getPeer(id);
      this._speakTimer = setInterval(() => this.detectSpeaking(), 120);
      return this;
    }

    publish() {
      this.socket.emit('voice:state', {
        muted: this.muted || this.deafened || !this.micStream,
        deafened: this.deafened,
        camera: !!this.camStream,
        screen: !!this.screen,
        micStreamId: this.micStream?.id || null,
        camStreamId: this.camStream?.id || null,
        screenStreamId: this.screen?.stream.id || null,
        quality: this.screen ? this.screen.preset.label : null,
      });
    }

    getPeer(id) {
      if (id === this.myId) return null;
      let p = this.peers.get(id);
      if (!p) { p = new Peer(this, id); this.peers.set(id, p); this.changed(); }
      return p;
    }

    addLocalTracksTo(peer) {
      const mic = this.micStream?.getAudioTracks()[0];
      if (mic) peer.setTrack('mic', mic, this.micStream);
      const cam = this.camStream?.getVideoTracks()[0];
      if (cam) peer.setTrack('cam', cam, this.camStream);
      if (this.screen) {
        const v = this.screen.stream.getVideoTracks()[0];
        const a = this.screen.stream.getAudioTracks()[0];
        if (v) peer.setTrack('screenV', v, this.screen.stream);
        if (a) peer.setTrack('screenA', a, this.screen.stream);
      }
    }

    handleSignal({ from, data }) { this.getPeer(from)?.handle(data); }
    peerJoined(id) { this.getPeer(id); }
    peerLeft(id) {
      const p = this.peers.get(id);
      if (p) { p.close(); this.peers.delete(id); this.changed(); }
    }

    setMuted(muted) {
      this.muted = muted;
      this.micStream?.getAudioTracks().forEach((t) => (t.enabled = !(this.muted || this.deafened)));
      this.publish();
    }

    setDeafened(deafened) {
      this.deafened = deafened;
      for (const p of this.peers.values()) for (const el of p.audioEls.values()) el.muted = deafened;
      this.setMuted(this.muted);
    }

    async startCamera() {
      const c = CFG.camera;
      this.camStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: c.width }, height: { ideal: c.height }, frameRate: { ideal: c.fps } },
        audio: false,
      });
      const track = this.camStream.getVideoTracks()[0];
      track.contentHint = 'motion';
      track.onended = () => this.stopCamera();
      for (const p of this.peers.values()) p.setTrack('cam', track, this.camStream);
      this.publish();
      this.changed();
    }

    stopCamera() {
      if (!this.camStream) return;
      this.camStream.getTracks().forEach((t) => t.stop());
      this.camStream = null;
      for (const p of this.peers.values()) p.setTrack('cam', null);
      this.publish();
      this.changed();
    }

    /**
     * Inicia a transmissão de tela.
     * No Electron, a fonte já foi escolhida via window.cinecria.selectSource() antes desta chamada;
     * no navegador, o seletor nativo do Chromium aparece.
     */
    async startScreen({ presetKey, hint = 'motion', audio = true }) {
      const preset = CFG.screenPresets[presetKey] || CFG.screenPresets[CFG.defaultScreenPreset];
      const video = { frameRate: { ideal: preset.fps, max: preset.fps } };
      if (preset.width) { video.width = { ideal: preset.width, max: preset.width }; video.height = { ideal: preset.height, max: preset.height }; }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video,
        // Sem processamento de voz no áudio do sistema: preserva música e efeitos.
        audio: audio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
        systemAudio: audio ? 'include' : 'exclude', // (navegador)
        selfBrowserSurface: 'exclude',
      });

      const v = stream.getVideoTracks()[0];
      v.contentHint = hint; // 'motion' = prioriza fluidez | 'detail' = prioriza nitidez
      try { await v.applyConstraints(video); } catch {}
      v.onended = () => this.stopScreen(); // "Parar compartilhamento" do sistema
      const a = stream.getAudioTracks()[0];
      if (a) a.contentHint = 'music';

      if (this.screen) this.stopScreen(true);
      this.screen = { stream, preset, presetKey, hint };
      for (const p of this.peers.values()) {
        p.setTrack('screenV', v, stream);
        if (a) p.setTrack('screenA', a, stream);
      }
      this.publish();
      this.changed();
      return { hasAudio: !!a };
    }

    stopScreen(silent = false) {
      if (!this.screen) return;
      this.screen.stream.getTracks().forEach((t) => t.stop());
      this.screen = null;
      for (const p of this.peers.values()) { p.setTrack('screenV', null); p.setTrack('screenA', null); }
      if (!silent) { this.publish(); this.changed(); }
    }

    /** Stream para exibir num tile: local ou remoto, conforme o id publicado no estado. */
    streamFor(member, kind) {
      if (member.id === this.myId) return kind === 'screen' ? this.screen?.stream || null : this.camStream;
      const p = this.peers.get(member.id);
      const id = member.state?.[kind === 'screen' ? 'screenStreamId' : 'camStreamId'];
      const s = p && id ? p.streams.get(id) : null;
      return s && s.getVideoTracks().length ? s : null;
    }

    /** Indicador "falando" (anel verde) via WebAudio. */
    detectSpeaking() {
      const ctx = (this._ctx ||= new AudioContext());
      const check = (key, stream) => {
        if (!stream || !stream.getAudioTracks().length) return false;
        let a = this._analysers.get(key);
        if (!a || a.stream !== stream) {
          const src = ctx.createMediaStreamSource(stream);
          const node = ctx.createAnalyser();
          node.fftSize = 512;
          src.connect(node);
          a = { stream, node, buf: new Uint8Array(node.fftSize) };
          this._analysers.set(key, a);
        }
        a.node.getByteTimeDomainData(a.buf);
        let sum = 0;
        for (const x of a.buf) { const d = (x - 128) / 128; sum += d * d; }
        return Math.sqrt(sum / a.buf.length) > 0.035;
      };

      const now = new Set();
      if (!(this.muted || this.deafened) && check('me', this.micStream)) now.add(this.myId);
      for (const p of this.peers.values()) {
        const st = this.getMemberState(p.id);
        if (!st || st.muted) continue;
        if (check(p.id, p.streams.get(st.micStreamId))) now.add(p.id);
      }
      const changed = now.size !== this.speaking.size || [...now].some((id) => !this.speaking.has(id));
      if (changed) { this.speaking = now; this.onSpeaking(now); }
    }

    stopLocal() {
      this.micStream?.getTracks().forEach((t) => t.stop());
      this.camStream?.getTracks().forEach((t) => t.stop());
      this.screen?.stream.getTracks().forEach((t) => t.stop());
      this.micStream = this.camStream = this.screen = null;
    }

    leave() {
      clearInterval(this._speakTimer);
      for (const p of this.peers.values()) p.close();
      this.peers.clear();
      this.stopLocal();
      this._ctx?.close().catch(() => {});
      if (this.socket.connected) this.socket.emit('voice:leave');
    }
  }

  window.VoiceSession = VoiceSession;
})();

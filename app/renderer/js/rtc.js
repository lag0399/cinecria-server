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
 *  - volume individual LOCAL por participante (voz e transmissão, 0–200%):
 *    só muda o que VOCÊ ouve — nada é alterado no que é enviado aos outros.
 */
(function () {
  const CFG = window.CINECRIA_CONFIG;

  /**
   * Ajusta a SDP recebida do outro lado ANTES de aplicá-la. O Chrome lê os parâmetros de codec
   * da descrição REMOTA para configurar o que ESTE lado envia, então cada participante ajusta
   * o próprio envio:
   *  - Opus estéreo 256 kbps (áudio de filmes/jogos);
   *  - vídeo: x-google-start/min/max-bitrate. Sem isso o Chrome começa em ~300 kbps e sobe devagar
   *    (os primeiros segundos ficam borrados) e, em várias versões, limita o vídeo a ~2,5 Mbps
   *    mesmo com encodings[0].maxBitrate maior.
   */
  const VIDEO_KBPS = { start: 4000, min: 600, max: 20000 }; // começa nítido; o teto real é o maxBitrate do perfil
  function tuneSdp(sdp) {
    const pts = [...sdp.matchAll(/a=rtpmap:(\d+) opus\/48000\/2/gi)].map((m) => m[1]);
    for (const pt of pts) {
      const re = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`, 'g');
      sdp = sdp.replace(re, (line, params) =>
        params.includes('stereo=1') ? line : `a=fmtp:${pt} ${params};stereo=1;sprop-stereo=1;maxaveragebitrate=256000`);
    }
    const g = `x-google-start-bitrate=${VIDEO_KBPS.start};x-google-min-bitrate=${VIDEO_KBPS.min};x-google-max-bitrate=${VIDEO_KBPS.max}`;
    const vpts = [...sdp.matchAll(/a=rtpmap:(\d+) (VP8|VP9|H264|AV1)\/90000/gi)].map((m) => m[1]);
    for (const pt of vpts) {
      const fmtp = new RegExp(`a=fmtp:${pt} ([^\\r\\n]*)`);
      if (fmtp.test(sdp)) {
        sdp = sdp.replace(fmtp, (line, params) => (params.includes('x-google-') ? line : `${line};${g}`));
      } else { // VP8 normalmente não tem linha fmtp — cria uma
        sdp = sdp.replace(new RegExp(`(a=rtpmap:${pt} [^\\r\\n]*)(\\r?\\n)`), `$1$2a=fmtp:${pt} ${g}$2`);
      }
    }
    return sdp;
  }

  /**
   * Ordem de codecs de vídeo: H.264 → VP9 → VP8 → resto.
   * H.264 é o que tem encoder por hardware (NVENC/AMF/QuickSync via Media Foundation) no
   * Chrome/Electron para Windows; VP9 rende mais qualidade por bit que o VP8 em telas.
   * Se o outro lado não suportar, a negociação cai no próximo da lista — nada quebra.
   */
  function preferCodecs(pc, sender) {
    try {
      const tr = pc.getTransceivers().find((t) => t.sender === sender);
      const caps = window.RTCRtpReceiver?.getCapabilities?.('video')?.codecs;
      if (!tr?.setCodecPreferences || !caps?.length) return;
      const rank = (c) => {
        const m = c.mimeType.toLowerCase(), f = c.sdpFmtpLine || '';
        if (m === 'video/h264') return /packetization-mode=1/.test(f) ? (/profile-level-id=42e0/i.test(f) ? 0 : 1) : 2;
        if (m === 'video/vp9') return /profile-id=[1-3]/.test(f) ? 4 : 3;
        if (m === 'video/vp8') return 5;
        if (m === 'video/av1') return 6;
        return 9; // rtx / red / ulpfec / flexfec ficam no fim, na ordem original
      };
      const sorted = caps.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
      tr.setCodecPreferences(sorted);
    } catch (e) { console.warn('[rtc] codec prefs', e); }
  }

  /** Menor atraso possível no receptor (Chrome/Electron). Valor em ms; 0 = o mínimo que a rede permitir. */
  function lowLatency(receiver) {
    if (!receiver) return;
    try { if ('jitterBufferTarget' in receiver) receiver.jitterBufferTarget = 0; } catch {}
    try { receiver.playoutDelayHint = 0; } catch {} // nome antigo (Chrome < 123)
  }

  class Peer {
    constructor(session, peerId) {
      this.session = session;
      this.id = peerId;
      this.polite = session.myId < peerId; // regra determinística: quem "cede" na colisão
      this.makingOffer = false;
      this.ignoreOffer = false;
      this.streams = new Map();   // streamId -> MediaStream remoto
      this.audioEls = new Map();  // trackId -> { el, streamId, gain? }
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
      pc.ontrack = ({ track, streams, receiver }) => {
        const stream = streams[0] || new MediaStream([track]);
        // vídeo: atraso mínimo já na chegada. Áudio da transmissão: em tuneReceivers(),
        // quando já se sabe qual stream é a tela (o áudio do microfone mantém o buffer padrão).
        if (track.kind === 'video') lowLatency(receiver);
        this.streams.set(stream.id, stream);
        if (track.kind === 'audio') this.attachAudio(track, stream.id);
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
          await pc.setRemoteDescription({ type: description.type, sdp: tuneSdp(description.sdp) });
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

    /** Cada trilha de áudio remota ganha seu próprio <audio> → volume independente por pessoa. */
    attachAudio(track, streamId) {
      const el = new Audio();
      el.autoplay = true;
      el.srcObject = new MediaStream([track]);
      document.getElementById('audioSink').appendChild(el);
      el.play().catch(() => {});
      const entry = { el, track, streamId, gain: null };
      this.audioEls.set(track.id, entry);
      this.session.applyVolume(this, entry);
    }

    detachAudio(trackId) {
      const e = this.audioEls.get(trackId);
      if (!e) return;
      try { e.src?.disconnect(); e.gain?.disconnect(); } catch {}
      e.el.srcObject = null;
      e.el.remove();
      this.audioEls.delete(trackId);
    }

    setTrack(slot, track, stream) {
      if (this.senders[slot]) { try { this.pc.removeTrack(this.senders[slot]); } catch {} delete this.senders[slot]; }
      if (track) {
        this.senders[slot] = this.pc.addTrack(track, stream);
        // antes da oferta: a negociação (onnegotiationneeded) só roda depois desta tarefa
        if (track.kind === 'video') preferCodecs(this.pc, this.senders[slot]);
      }
      this.applyParams();
    }

    /** Áudio da transmissão com atraso mínimo, para ficar sincronizado com o vídeo da tela. */
    tuneReceivers() {
      const st = this.session.getMemberState(this.id);
      for (const r of this.pc.getReceivers()) {
        if (!r.track || r._tuned) continue;
        const stream = [...this.streams.values()].find((s) => s.getTracks().includes(r.track));
        if (r.track.kind === 'video' || (stream && st?.screenStreamId === stream.id)) { lowLatency(r); r._tuned = true; }
      }
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
        p.encodings[0].scaleResolutionDownBy = 1; // nunca reduzir a resolução por conta própria
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
        // maintain-resolution nos dois modos: quando falta banda/CPU, o Chrome solta quadros
        // em vez de borrar a imagem. "Fluidez" x "Nitidez" muda o contentHint do track.
        tune(this.senders.screenV, { bitrate: pr.bitrate, fps: pr.fps, degradation: 'maintain-resolution' });
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
     *          getVolume:(id:string, kind:'voice'|'stream')=>number,
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
      this.getVolume ||= () => 1;
    }

    changed() {
      if (this._changeQueued) return;
      this._changeQueued = true;
      requestAnimationFrame(() => {
        this._changeQueued = false;
        this.applyVolumes();
        for (const p of this.peers.values()) p.tuneReceivers();
        this.onChange();
      });
    }

    /* ------------------------- volume individual (local) ------------------------- */
    /** Contexto de áudio de saída — criado no clique de "entrar no canal" (gesto do usuário). */
    get outCtx() {
      if (!this._out) { try { this._out = new AudioContext(); } catch { this._out = null; } }
      if (this._out?.state === 'suspended') this._out.resume().catch(() => {});
      return this._out;
    }

    /**
     * Aplica o volume de UMA trilha remota.
     *  - 0–100%: volume do próprio <audio> (mantém o cancelamento de eco do navegador intacto).
     *  - 100–200%: o <audio> fica mudo (mas tocando, exigência do Chrome p/ WebRTC) e o som
     *    passa por um GainNode do WebAudio, que permite amplificar acima de 100%.
     */
    applyVolume(peer, e) {
      const st = this.getMemberState(peer.id);
      const kind = st && e.streamId && e.streamId === st.screenStreamId ? 'stream' : 'voice';
      const v = this.deafened ? 0 : Math.max(0, Math.min(2, this.getVolume(peer.id, kind)));
      if (v > 1) {
        const ctx = this.outCtx;
        if (ctx && !e.gain) {
          e.src = ctx.createMediaStreamSource(new MediaStream([e.track]));
          e.gain = ctx.createGain();
          e.src.connect(e.gain).connect(ctx.destination);
        }
        if (e.gain) { e.el.muted = true; e.gain.gain.value = v; return; }
      }
      if (e.gain) e.gain.gain.value = 0;
      e.el.muted = v === 0;
      e.el.volume = Math.min(1, v);
    }

    applyVolumes() {
      for (const p of this.peers.values()) for (const e of p.audioEls.values()) this.applyVolume(p, e);
    }

    async start() {
      void this.outCtx; // desbloqueia o áudio enquanto ainda estamos dentro do gesto do clique
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
      // UM timer leve para todos (≈6,7 vezes/s) — nada de requestAnimationFrame por pessoa
      this._speakTimer = setInterval(() => this.detectSpeaking(), 150);
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
      if (p) { p.close(); this.peers.delete(id); this.dropAnalyser(id); this.changed(); }
    }

    setMuted(muted) {
      this.muted = muted;
      this.micStream?.getAudioTracks().forEach((t) => (t.enabled = !(this.muted || this.deafened)));
      this.publish();
    }

    setDeafened(deafened) {
      this.deafened = deafened;
      this.applyVolumes();
      this.setMuted(this.muted);
    }

    async startCamera() {
      const c = CFG.camera;
      // Celular: sem largura/altura — o sensor entrega na orientação nativa (9:16 em pé, 16:9 deitado).
      // Pedir 1280×720 num celular em pé faz alguns aparelhos cortarem/girarem a imagem.
      // PC: "ideal" (nunca "exact") — só sugere 720p para webcams que abririam em 640×480.
      const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const video = mobile
        ? { facingMode: 'user', frameRate: { ideal: c.fps, max: c.fps } }
        : { width: { ideal: c.width }, height: { ideal: c.height }, frameRate: { ideal: c.fps } };
      this.camStream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
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
      // (sem applyConstraints extra: reconfigurar o track força um redimensionamento a mais)
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

    /**
     * Estatísticas do vídeo (painel "i" no card). Para quem transmite: uma linha por espectador,
     * com o motivo de limitação do encoder (cpu/banda) e se o encoder é de hardware.
     * Para quem assiste: resolução, FPS, bitrate, codec, decoder e atraso do buffer.
     */
    async videoStats(member, kind) {
      const now = performance.now();
      const prev = (this._statPrev ||= new Map());
      const rate = (key, bytes) => {
        const p = prev.get(key);
        prev.set(key, { bytes, t: now });
        return p && now > p.t ? ((bytes - p.bytes) * 8) / ((now - p.t) / 1000) : null;
      };
      const codecOf = (rep, all) => all.get(rep.codecId)?.mimeType?.replace('video/', '') || '?';
      const rttOf = (all) => {
        for (const r of all.values()) if (r.type === 'candidate-pair' && r.nominated && r.currentRoundTripTime != null) return r.currentRoundTripTime * 1000;
        return null;
      };
      if (member.id === this.myId) {
        const slot = kind === 'screen' ? 'screenV' : 'cam';
        const rows = [];
        for (const p of this.peers.values()) {
          const sender = p.senders[slot];
          if (!sender) continue;
          const all = await sender.getStats();
          for (const r of all.values()) {
            if (r.type !== 'outbound-rtp' || r.kind !== 'video') continue;
            rows.push({
              peer: p.id, w: r.frameWidth, h: r.frameHeight, fps: r.framesPerSecond,
              bps: rate('o' + p.id + slot, r.bytesSent), codec: codecOf(r, all),
              impl: r.encoderImplementation || '', hw: r.powerEfficientEncoder,
              limit: r.qualityLimitationReason || 'none', rtt: rttOf(all),
            });
          }
        }
        return { dir: 'out', rows };
      }
      const p = this.peers.get(member.id);
      const stream = this.streamFor(member, kind);
      const track = stream?.getVideoTracks()[0];
      const recv = p && track && p.pc.getReceivers().find((r) => r.track === track);
      if (!recv) return null;
      const all = await recv.getStats();
      for (const r of all.values()) {
        if (r.type !== 'inbound-rtp' || r.kind !== 'video') continue;
        return {
          dir: 'in', w: r.frameWidth, h: r.frameHeight, fps: r.framesPerSecond,
          bps: rate('i' + member.id + kind, r.bytesReceived), codec: codecOf(r, all),
          impl: r.decoderImplementation || '', hw: r.powerEfficientDecoder,
          buffer: r.jitterBufferEmittedCount ? (r.jitterBufferDelay / r.jitterBufferEmittedCount) * 1000 : null,
          lost: r.packetsLost, dropped: r.framesDropped, rtt: rttOf(all),
        };
      }
      return null;
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
    /** Desliga e descarta o analisador de uma pessoa (evita vazamento de memória/áudio). */
    dropAnalyser(key) {
      const a = this._analysers.get(key);
      if (!a) return;
      try { a.src.disconnect(); a.node.disconnect(); } catch {}
      this._analysers.delete(key);
    }

    detectSpeaking() {
      if (document.hidden) return; // ninguém está vendo o anel verde
      const ctx = this.outCtx; // mesmo AudioContext do volume: um só thread de áudio
      if (!ctx) return;
      const seen = new Set();
      const check = (key, stream) => {
        if (!stream || !stream.getAudioTracks().length) return false;
        seen.add(key);
        let a = this._analysers.get(key);
        if (!a || a.stream !== stream) {
          this.dropAnalyser(key);
          const src = ctx.createMediaStreamSource(stream);
          const node = ctx.createAnalyser();
          node.fftSize = 256; // 256 amostras bastam para "tem voz ou não"
          src.connect(node);
          a = { stream, src, node, buf: new Uint8Array(node.fftSize) };
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
      for (const key of [...this._analysers.keys()]) if (!seen.has(key)) this.dropAnalyser(key); // saiu / mutou
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
      for (const key of [...this._analysers.keys()]) this.dropAnalyser(key);
      for (const p of this.peers.values()) p.close();
      this.peers.clear();
      this.stopLocal();
      this._ctx?.close().catch(() => {});
      this._out?.close().catch(() => {});
      if (this.socket.connected) this.socket.emit('voice:leave');
    }
  }

  window.VoiceSession = VoiceSession;
})();

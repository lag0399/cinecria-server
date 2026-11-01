/**
 * Cinecria — UI principal (renderer)
 * Estado → render. Sem framework: templates + reconciliação manual dos tiles de vídeo
 * (os <video> nunca são recriados, então não piscam quando o estado muda).
 */
(function () {
  'use strict';
  const CFG = window.CINECRIA_CONFIG;

  /* =============================== utilidades =============================== */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const linkify = (t) => esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('cinecria.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('cinecria.' + k, JSON.stringify(v)); } catch {} },
  };
  const hue = (str) => { let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const nameColor = (n) => `hsl(${hue(n)} 70% 72%)`;
  const tileColor = (n) => `hsl(${hue(n)} 35% 30%)`;
  const initials = (n) => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

  function fmtTime(ts) {
    const d = new Date(ts), now = new Date();
    const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = (day(now) - day(d)) / 864e5;
    if (diff === 0) return `Hoje às ${hm}`;
    if (diff === 1) return `Ontem às ${hm}`;
    return `${d.toLocaleDateString('pt-BR')} ${hm}`;
  }

  /* ================================ ícones ================================= */
  const SLASH = '<path d="M3 3l18 18" class="slash"/>';
  const P = {
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10a7 7 0 0 1-14 0M12 17v5M8 22h8"/>',
    headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>',
    camera: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4V8z"/>',
    screen: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    screenShare: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M12 13V7M9 10l3-3 3 3"/>',
    screenStop: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M9.5 7.5l5 5M14.5 7.5l-5 5"/>',
    phoneOff: '<path d="M2.6 13.4a15 15 0 0 1 18.8 0c.6.5.7 1.3.3 1.9l-1.4 2a1.5 1.5 0 0 1-1.9.5l-2.6-1.2a1.5 1.5 0 0 1-.8-1.4v-1.6a12 12 0 0 0-6 0v1.6c0 .6-.3 1.1-.8 1.4l-2.6 1.2a1.5 1.5 0 0 1-1.9-.5l-1.4-2a1.4 1.4 0 0 1 .3-1.9z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    focus: '<rect x="3" y="3" width="18" height="12" rx="1.5"/><path d="M3 20h4M10 20h4M17 20h4"/>',
    maximize: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    chevronR: '<path d="m9 6 6 6-6 6"/>',
    users: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M16 3.5a4 4 0 0 1 0 8M22 21v-1a6 6 0 0 0-4-5.6"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
    signal: '<path d="M4 20v-4M9 20v-8M14 20V8M19 20V4"/>',
    chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  };
  P.micOff = P.mic + SLASH;
  P.headOff = P.headphones + SLASH;
  P.camOff = P.camera + SLASH;
  const icon = (n, cls = '') =>
    `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

  // id único por instância: um gradiente definido dentro de um elemento oculto não renderiza nos outros
  let logoSeq = 0;
  const logo = () => { const id = 'cineGrad' + ++logoSeq; return `<svg viewBox="0 0 48 48" class="logo" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8f7bff"/><stop offset="1" stop-color="#ff5e7a"/></linearGradient></defs><rect width="48" height="48" rx="14" fill="url(#${id})"/><rect x="10.5" y="13.5" width="27" height="18" rx="3.5" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M21 18.4v8.2l7-4.1z" fill="#fff"/><path d="M17 36.5h14" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></svg>`; };

  /* ================================ avatares =============================== */
  const PRESET_HUES = [[262, 300], [340, 15], [150, 190], [28, 52], [200, 240], [300, 330], [170, 130], [8, 40]];
  const avatarCache = new Map();
  function genAvatar(letter, h1, h2) {
    const key = `${letter}|${h1}|${h2}`;
    if (avatarCache.has(key)) return avatarCache.get(key);
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 128, 128);
    gr.addColorStop(0, `hsl(${h1} 80% 64%)`);
    gr.addColorStop(1, `hsl(${h2} 75% 48%)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(255,255,255,.96)';
    g.font = '700 60px "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(letter || '?').toUpperCase(), 64, 68);
    const url = c.toDataURL('image/jpeg', 0.9);
    avatarCache.set(key, url);
    return url;
  }
  const avatarSrc = (u) => u.avatar || genAvatar(initials(u.name)[0], hue(u.name), (hue(u.name) + 40) % 360);
  const avatar = (u, size = 'sm') => `<img class="av av-${size}" src="${esc(avatarSrc(u))}" alt="" draggable="false">`;

  function resizeImage(file, size = 128) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const s = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /** Seletor de avatar reutilizável (tela de entrada e configurações). */
  function setupAvatarPicker(root, nameInput, init = {}) {
    const st = { mode: init.mode === 'upload' && init.upload ? 'upload' : 'preset', preset: init.preset || 0, upload: init.upload || null };
    const letter = () => initials(nameInput.value.trim() || '?')[0];
    const presetSrc = (i) => genAvatar(letter(), ...PRESET_HUES[i]);
    const value = () => (st.mode === 'upload' && st.upload ? st.upload : presetSrc(st.preset));
    const fileInput = $('.av-file', root);
    function render() {
      $('.presets', root).innerHTML = PRESET_HUES.map((_, i) =>
        `<button type="button" class="preset ${st.mode === 'preset' && st.preset === i ? 'sel' : ''}" data-i="${i}"><img src="${presetSrc(i)}" alt=""></button>`).join('');
      $('.avatar-big img', root).src = value();
    }
    $('.presets', root).addEventListener('click', (e) => {
      const b = e.target.closest('.preset');
      if (!b) return;
      st.mode = 'preset'; st.preset = Number(b.dataset.i); render();
    });
    const pick = () => fileInput.click();
    $('.av-upload', root).addEventListener('click', pick);
    $('.avatar-big', root).addEventListener('click', pick);
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0];
      fileInput.value = '';
      if (!f) return;
      try { st.upload = await resizeImage(f); st.mode = 'upload'; render(); } catch { toast('Não consegui ler essa imagem.', 'err'); }
    });
    nameInput.addEventListener('input', () => st.mode === 'preset' && render());
    render();
    return { value, state: () => ({ ...st }) };
  }

  /* ================================= estado ================================ */
  const S = {
    socket: null,
    me: null,
    servers: new Map(),
    activeServerId: null,
    activeChannel: LS.get('activeChannel', {}),
    view: 'text',              // 'text' | 'voice'
    messages: new Map(),
    loaded: new Set(),
    unread: new Set(),
    voice: null,               // VoiceSession
    joining: false,
    muted: LS.get('muted', false),
    deafened: LS.get('deafened', false),
    showMembers: LS.get('showMembers', true),
    layout: 'grid',            // 'grid' | 'focus'
    layoutPinned: false,
    focusKey: null,
    prevScreens: new Set(),
    speaking: new Set(),
    tileEls: new Map(),
  };

  const req = (ev, data) => new Promise((res) =>
    S.socket.timeout(8000).emit(ev, data, (err, r) => res(err ? { error: 'Servidor não respondeu.' } : r || {})));

  const activeServer = () => S.servers.get(S.activeServerId);
  const textChannel = (srv) => {
    if (!srv) return null;
    const t = srv.channels.filter((c) => c.type === 'text');
    return t.find((c) => c.id === S.activeChannel[srv.id]) || t[0] || null;
  };
  const voiceServer = () => (S.voice ? S.servers.get(S.voice.serverId) : null);
  const voiceChannel = () => voiceServer()?.channels.find((c) => c.id === S.voice.channelId);
  const voiceMembers = () => (voiceServer()?.members || []).filter((m) => m.voice?.channelId === S.voice?.channelId);
  const memberIn = (serverId, id) => S.servers.get(serverId)?.members.find((m) => m.id === id);

  function saveInvite(code, add = true) {
    const list = LS.get('invites', []).filter((c) => c !== code);
    if (add) list.push(code);
    LS.set('invites', list.slice(-50));
  }

  /* ================================= toasts/modais ======================== */
  function toast(msg, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3600);
  }

  function openModal(html, { wide = false } = {}) {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-back"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    const back = root.firstElementChild;
    back.addEventListener('mousedown', (e) => { if (e.target === back) closeModal(); });
    back.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
    setTimeout(() => $('input:not([type=checkbox]), select', back)?.focus(), 30);
    return $('.modal', back);
  }
  const closeModal = () => { $('#modalRoot').innerHTML = ''; };

  function closeMenu() { $('.menu')?.remove(); }
  function openMenu(anchor, items) {
    closeMenu();
    const r = anchor.getBoundingClientRect();
    const m = document.createElement('div');
    m.className = 'menu';
    m.style.left = r.left + 8 + 'px';
    m.style.top = r.bottom + 6 + 'px';
    m.style.width = Math.max(200, r.width - 16) + 'px';
    m.innerHTML = items.map((it, i) => it === '-' ? '<div class="menu-sep"></div>' :
      `<button class="menu-item ${it.danger ? 'danger' : ''}" data-i="${i}"><span>${esc(it.label)}</span>${icon(it.icon)}</button>`).join('');
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      closeMenu();
      items[Number(b.dataset.i)].run();
    });
    document.body.appendChild(m);
    setTimeout(() => document.addEventListener('mousedown', function h(e) {
      if (!m.contains(e.target)) { closeMenu(); document.removeEventListener('mousedown', h); }
    }), 0);
  }

  /* ================================= sons ================================== */
  let sfxCtx;
  function blip(from, to, dur = 0.12) {
    try {
      sfxCtx ||= new AudioContext();
      const o = sfxCtx.createOscillator(), g = sfxCtx.createGain(), t = sfxCtx.currentTime;
      o.type = 'sine';
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
      o.connect(g).connect(sfxCtx.destination);
      o.start(t); o.stop(t + dur + 0.1);
    } catch {}
  }
  const sfx = { join: () => blip(520, 880), leave: () => blip(700, 380), live: () => { blip(660, 990, 0.1); setTimeout(() => blip(880, 1320, 0.1), 110); } };

  /* ================================= entrada =============================== */
  const profile = LS.get('profile', { name: '', mode: 'preset', preset: Math.floor(Math.random() * 8), upload: null, serverUrl: '' });
  let loginPicker;

  function initLogin() {
    $('#brandLogo').innerHTML = logo();
    const nick = $('#nick');
    nick.value = profile.name || '';
    $('#srvUrl').value = profile.serverUrl || CFG.defaultServerUrl;
    loginPicker = setupAvatarPicker($('#loginAvatar'), nick, profile);
    $('#enterBtn').addEventListener('click', enter);
    nick.addEventListener('keydown', (e) => e.key === 'Enter' && enter());
    setTimeout(() => nick.focus(), 50);
  }

  function enter() {
    const name = $('#nick').value.trim();
    const err = $('#loginErr');
    if (!name) { err.textContent = 'Escolha um apelido para entrar.'; $('#nick').focus(); return; }
    Object.assign(profile, loginPicker.state(), { name, serverUrl: $('#srvUrl').value.trim() || CFG.defaultServerUrl });
    LS.set('profile', profile);
    err.textContent = '';
    $('#enterBtn').disabled = true;
    $('#enterBtn').textContent = 'Conectando…';
    connect(loginPicker.value());
  }

  function showLogin(msg = '') {
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
    $('#enterBtn').disabled = false;
    $('#enterBtn').textContent = 'Entrar';
    $('#loginErr').textContent = msg;
  }

  /* ================================= conexão =============================== */
  function connect(avatarData) {
    if (typeof io === 'undefined') return showLogin('Cliente de conexão não carregado. Rode "npm install" na pasta app.');
    S.socket?.removeAllListeners();
    S.socket?.disconnect();
    const socket = io(profile.serverUrl, { transports: ['websocket'], reconnectionDelayMax: 5000 });
    S.socket = socket;
    S.avatarData = avatarData;

    socket.on('connect', async () => {
      const res = await req('hello', { name: profile.name, avatar: S.avatarData, invites: LS.get('invites', []) });
      if (res.error) { socket.disconnect(); return showLogin(res.error); }
      onInit(res);
    });
    socket.on('connect_error', () => {
      if (!S.me) { socket.disconnect(); showLogin(`Não foi possível conectar a ${profile.serverUrl}`); }
    });
    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return;
      if (S.voice) { teardownVoice(); toast('Conexão perdida — você saiu do canal de voz.', 'err'); }
      else toast('Conexão perdida, reconectando…', 'err');
    });
    socket.on('server:update', onServerUpdate);
    socket.on('chat:message', onChatMessage);
    socket.on('voice:peer-joined', ({ peerId }) => { S.voice?.peerJoined(peerId); sfx.join(); });
    socket.on('voice:peer-left', ({ peerId }) => { S.voice?.peerLeft(peerId); sfx.leave(); });
    socket.on('signal', (m) => S.voice?.handleSignal(m));
  }

  function onInit({ me, servers }) {
    S.me = me;
    S.servers = new Map(servers.map((s) => [s.id, s]));
    S.messages.clear(); S.loaded.clear(); S.unread.clear();
    const last = LS.get('lastServer');
    S.activeServerId = S.servers.has(S.activeServerId) ? S.activeServerId : S.servers.has(last) ? last : servers[0]?.id;
    S.view = 'text';
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    renderAll();
  }

  function onServerUpdate(snap) {
    if (!snap.members.some((m) => m.id === S.me?.id)) return;
    S.servers.set(snap.id, snap);
    const me = snap.members.find((m) => m.id === S.me.id);
    if (me) S.me = { ...S.me, name: me.name, avatar: me.avatar };
    renderRail(); renderSidebar(); renderMembers(); renderUserPanel(); renderVoicePanel();
    if (S.view === 'voice') updateStage();
  }

  function onChatMessage(msg) {
    if (!S.loaded.has(msg.channelId)) {
      if (msg.author.id !== S.me.id) S.unread.add(msg.channelId);
      renderRail(); renderSidebar();
      return;
    }
    S.messages.get(msg.channelId).push(msg);
    const cur = textChannel(activeServer());
    if (S.view === 'text' && cur?.id === msg.channelId) renderMessages(msg.channelId);
    else if (msg.author.id !== S.me.id) { S.unread.add(msg.channelId); renderRail(); renderSidebar(); }
  }

  async function loadHistory(channelId) {
    if (S.loaded.has(channelId)) return;
    const res = await req('chat:history', { channelId });
    S.messages.set(channelId, res.messages || []);
    S.loaded.add(channelId);
    if (textChannel(activeServer())?.id === channelId && S.view === 'text') renderMessages(channelId);
  }

  /* ================================= render ================================ */
  function renderAll() {
    renderRail(); renderSidebar(); renderMain(); renderMembers(); renderUserPanel(); renderVoicePanel();
  }

  function renderRail() {
    const serverUnread = (s) => s.channels.some((c) => S.unread.has(c.id));
    $('#rail').innerHTML = `
      <div class="rail-logo" title="Cinecria">${logo()}</div>
      <div class="rail-sep"></div>
      ${[...S.servers.values()].map((s) => `
        <button class="rail-item ${s.id === S.activeServerId ? 'active' : ''} ${serverUnread(s) ? 'unread' : ''}" data-server="${s.id}" style="--c:${s.color}" data-tip="${esc(s.name)}">
          <span class="pill"></span>
          <span class="srv-ico">${esc(initials(s.name))}</span>
          ${S.voice?.serverId === s.id ? `<span class="rail-voice">${icon('volume')}</span>` : ''}
        </button>`).join('')}
      <div class="rail-sep"></div>
      <button class="rail-item add" data-action="create-server" data-tip="Criar servidor">${icon('plus')}</button>
      <button class="rail-item add" data-action="join-server" data-tip="Entrar com convite">${icon('link')}</button>`;
  }

  function vcMember(m) {
    const st = m.state || {};
    return `<div class="vcm ${S.speaking.has(m.id) ? 'speaking' : ''}" data-user="${m.id}">
      ${avatar(m, 'xs')}<span class="nm">${esc(m.name)}</span>
      <span class="vcm-icons">
        ${st.screen ? '<span class="live-badge">AO VIVO</span>' : ''}
        ${st.camera ? icon('camera', 'dim') : ''}
        ${st.deafened ? icon('headOff', 'red') : st.muted ? icon('micOff', 'red') : ''}
      </span></div>`;
  }

  function renderSidebar() {
    const srv = activeServer();
    if (!srv) return;
    $('#srvHeader').innerHTML = `<button class="srv-header" data-action="server-menu">
      <span class="srv-title">${esc(srv.name)}</span>${srv.isPublic ? '<span class="pub">PÚBLICO</span>' : ''}${icon('chevron')}</button>`;
    const cur = textChannel(srv);
    const cat = (label, type) => `<div class="cat"><span>${label}</span><button class="cat-add" data-action="create-channel" data-type="${type}" title="Criar canal">${icon('plus')}</button></div>`;
    const text = srv.channels.filter((c) => c.type === 'text').map((c) => `
      <button class="ch ${S.view === 'text' && cur?.id === c.id ? 'active' : ''} ${S.unread.has(c.id) ? 'unread' : ''}" data-channel="${c.id}" data-type="text">
        ${icon('hash')}<span class="ch-name">${esc(c.name)}</span></button>`).join('');
    const voice = srv.channels.filter((c) => c.type === 'voice').map((c) => {
      const ms = srv.members.filter((m) => m.voice?.channelId === c.id);
      const connected = S.voice?.channelId === c.id;
      const live = ms.some((m) => m.state?.screen);
      return `<button class="ch voice ${connected ? 'connected' : ''} ${connected && S.view === 'voice' ? 'active' : ''}" data-channel="${c.id}" data-type="voice">
          ${icon('volume')}<span class="ch-name">${esc(c.name)}</span>${live ? '<span class="live-dot"></span>' : ''}${ms.length ? `<em class="count">${ms.length}</em>` : ''}</button>
        <div class="vc-members">${ms.map(vcMember).join('')}</div>`;
    }).join('');
    $('#channels').innerHTML = cat('Canais de texto', 'text') + text + cat('Canais de voz', 'voice') + voice;
  }

  function renderVoicePanel() {
    const el = $('#voicePanel');
    if (!S.voice) { el.classList.add('hidden'); return; }
    const ch = voiceChannel(), srv = voiceServer();
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="vp-top">
        <button class="vp-status" data-action="open-stage" title="Abrir canal">
          ${icon('signal')}<span><b>Voz conectada</b><small>${esc(ch?.name || '')} / ${esc(srv?.name || '')}</small></span>
        </button>
        <button class="icon-btn" data-action="leave-voice" title="Desconectar">${icon('phoneOff')}</button>
      </div>
      <div class="vp-btns">
        <button class="vp-btn ${S.voice.camStream ? 'on' : ''}" data-action="toggle-camera">${icon('camera')}Vídeo</button>
        <button class="vp-btn ${S.voice.screen ? 'live' : ''}" data-action="toggle-screen">${icon(S.voice.screen ? 'screenStop' : 'screenShare')}${S.voice.screen ? 'Parar' : 'Tela'}</button>
      </div>`;
  }

  function renderUserPanel() {
    if (!S.me) return;
    $('#userPanel').innerHTML = `
      <button class="up-me" data-action="profile" title="Editar perfil">
        <span class="av-wrap">${avatar(S.me, 'sm')}<span class="status-dot"></span></span>
        <span class="up-names"><b>${esc(S.me.name)}</b><small>${S.voice ? 'Em canal de voz' : 'Online'}</small></span>
      </button>
      <button class="icon-btn ${S.muted ? 'danger' : ''}" data-action="toggle-mute" title="${S.muted ? 'Reativar microfone' : 'Silenciar'} (Ctrl+Shift+M)">${icon(S.muted ? 'micOff' : 'mic')}</button>
      <button class="icon-btn ${S.deafened ? 'danger' : ''}" data-action="toggle-deafen" title="${S.deafened ? 'Reativar áudio' : 'Desativar áudio'} (Ctrl+Shift+D)">${icon(S.deafened ? 'headOff' : 'headphones')}</button>
      <button class="icon-btn" data-action="profile" title="Configurações">${icon('gear')}</button>`;
  }

  function renderMembers() {
    const el = $('#members');
    const srv = activeServer();
    if (!srv || S.view === 'voice' || !S.showMembers) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const sorted = [...srv.members].sort((a, b) => (!!b.state?.screen - !!a.state?.screen) || (!!b.voice - !!a.voice) || a.name.localeCompare(b.name));
    el.innerHTML = `<div class="mem-title">Online — ${srv.members.length}</div>` + sorted.map((m) => {
      const vc = m.voice && S.servers.get(m.voice.serverId)?.channels.find((c) => c.id === m.voice.channelId);
      const sub = m.state?.screen ? `<small class="live-txt">${icon('screen')}Transmitindo em ${esc(vc?.name || '')}</small>`
        : vc ? `<small>${icon('volume')}${esc(vc.name)}</small>` : '';
      return `<div class="mem ${m.id === S.me.id ? 'me' : ''}" data-user="${m.id}">
        <span class="av-wrap">${avatar(m, 'sm')}<span class="status-dot"></span></span>
        <span class="mem-names"><b style="color:${nameColor(m.name)}">${esc(m.name)}</b>${sub}</span></div>`;
    }).join('');
  }

  function applySpeaking() {
    $$('[data-user]').forEach((el) => el.classList.toggle('speaking', S.speaking.has(el.dataset.user)));
  }

  /* -------------------------------- texto -------------------------------- */
  function renderMain() {
    const main = $('#main');
    if (S.view === 'voice' && S.voice) {
      if (main.dataset.view !== 'voice:' + S.voice.channelId) buildStage();
      updateStage();
      return;
    }
    S.view = 'text';
    const srv = activeServer(), ch = textChannel(srv);
    if (!ch) { resetStage(); main.dataset.view = ''; main.innerHTML = '<div class="empty">Nenhum canal de texto.</div>'; return; }
    if (main.dataset.view !== 'text:' + ch.id) buildText(ch);
    S.unread.delete(ch.id);
    renderMessages(ch.id);
    loadHistory(ch.id);
  }

  function buildText(ch) {
    resetStage();
    const main = $('#main');
    main.dataset.view = 'text:' + ch.id;
    main.innerHTML = `
      <header class="main-head">
        ${icon('hash', 'muted')}<b>${esc(ch.name)}</b>
        <span class="topic">Chat do servidor · links, indicações e horários da sessão</span>
        <div class="spacer"></div>
        ${S.voice ? `<button class="head-pill" data-action="open-stage">${icon('volume')}Voltar ao canal de voz</button>` : ''}
        <button class="icon-btn ${S.showMembers ? 'on' : ''}" data-action="toggle-members" title="Lista de membros">${icon('users')}</button>
      </header>
      <div class="messages" id="msgList"></div>
      <form class="composer" id="composer">
        <div class="composer-box">
          <input id="msgInput" maxlength="2000" placeholder="Conversar em #${esc(ch.name)}" autocomplete="off" spellcheck="true" />
          <button type="submit" class="icon-btn" title="Enviar">${icon('send')}</button>
        </div>
      </form>`;
    $('#composer').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#msgInput');
      const text = input.value.trim();
      if (!text) return;
      S.socket.emit('chat:send', { channelId: ch.id, text });
      input.value = '';
    });
    setTimeout(() => $('#msgInput')?.focus(), 0);
  }

  function renderMessages(channelId) {
    const box = $('#msgList');
    if (!box) return;
    const srv = activeServer(), ch = textChannel(srv);
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const list = S.messages.get(channelId) || [];
    let html = `
      <div class="welcome">
        <div class="welcome-art">${logo()}</div>
        <h2>Boas-vindas ao<br>${esc(srv.name)}</h2>
        <p>Este é o começo de <b>#${esc(ch.name)}</b>. Chame a galera, entre em um canal de voz e aperte <b>Tela</b> para transmitir.</p>
        <div class="welcome-cards">
          <button class="wcard" data-action="copy-invite"><span class="wc-ico c1">${icon('users')}</span><span>Convidar seus amigos</span>${icon('chevronR')}</button>
          <button class="wcard" data-action="join-first-voice"><span class="wc-ico c2">${icon('screenShare')}</span><span>Começar uma sessão de cinema</span>${icon('chevronR')}</button>
          <button class="wcard" data-action="focus-composer"><span class="wc-ico c3">${icon('chat')}</span><span>Enviar sua primeira mensagem</span>${icon('chevronR')}</button>
        </div>
      </div>`;
    let prev = null;
    for (const m of list) {
      const grouped = prev && prev.author.id === m.author.id && m.ts - prev.ts < 5 * 60e3;
      const time = new Date(m.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      html += grouped
        ? `<div class="msg cont"><span class="ts-side">${time}</span><div class="body">${linkify(m.text)}</div></div>`
        : `<div class="msg">${avatar(m.author, 'md')}<div class="msg-main">
             <div class="meta"><b style="color:${nameColor(m.author.name)}">${esc(m.author.name)}</b><span class="ts">${fmtTime(m.ts)}</span></div>
             <div class="body">${linkify(m.text)}</div></div></div>`;
      prev = m;
    }
    box.innerHTML = html;
    if (atBottom || list.at(-1)?.author.id === S.me.id) box.scrollTop = box.scrollHeight;
  }

  /* -------------------------------- palco (voz) -------------------------------- */
  let stageObserver = null;
  function resetStage() {
    stageObserver?.disconnect();
    stageObserver = null;
    S.tileEls.clear();
  }

  function buildStage() {
    resetStage();
    const main = $('#main');
    main.dataset.view = 'voice:' + S.voice.channelId;
    main.innerHTML = `
      <div class="stage" id="stage">
        <header class="stage-head">
          <div class="sh-left">${icon('volume', 'muted')}<b id="stageTitle"></b><span id="stageLive" class="sh-live"></span></div>
          <div class="sh-right">
            <span id="stageQuality"></span>
            <button class="icon-btn" data-action="layout" data-layout="grid" title="Grade">${icon('grid')}</button>
            <button class="icon-btn" data-action="layout" data-layout="focus" title="Foco na transmissão">${icon('focus')}</button>
            <button class="icon-btn" data-action="open-text" title="Abrir chat do servidor">${icon('chat')}</button>
          </div>
        </header>
        <div class="stage-body" id="stageBody">
          <div class="focus-main" id="focusMain"></div>
          <div class="tiles" id="tiles"></div>
        </div>
        <div class="controls" id="controls"></div>
      </div>`;
    stageObserver = new ResizeObserver(() => layoutTiles());
    stageObserver.observe($('#stageBody'));
  }

  function createTile(t) {
    const el = document.createElement('div');
    el.className = `tile ${t.kind}`;
    el.dataset.key = t.key;
    el.innerHTML = `
      <video autoplay playsinline muted></video>
      <div class="tile-av"><img alt="" draggable="false"></div>
      <div class="tile-wait">Conectando à transmissão…</div>
      <div class="tile-top"></div>
      <div class="tile-name"></div>
      <button class="tile-fs" title="Tela cheia">${icon('maximize')}</button>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.tile-fs')) return toggleFullscreen(el);
      S.layoutPinned = true;
      if (S.layout === 'focus' && S.focusKey === t.key) { S.layout = 'grid'; S.focusKey = null; }
      else { S.layout = 'focus'; S.focusKey = t.key; }
      updateStage();
    });
    el.addEventListener('dblclick', () => toggleFullscreen(el));
    return el;
  }

  function setHTML(el, html) { if (el._html !== html) { el.innerHTML = html; el._html = html; } }

  function updateTile(el, t) {
    const m = t.m, st = m.state || {}, isMe = m.id === S.me.id;
    const stream = t.kind === 'screen' ? S.voice.streamFor(m, 'screen') : st.camera ? S.voice.streamFor(m, 'cam') : null;
    const v = $('video', el);
    if (v.srcObject !== stream) v.srcObject = stream;
    if (stream && v.paused) v.play().catch(() => {});
    el.classList.toggle('has-video', !!stream);
    el.classList.toggle('waiting', t.kind === 'screen' && !stream);
    el.classList.toggle('mirror', isMe && t.kind === 'user');
    el.classList.toggle('speaking', t.kind === 'user' && S.speaking.has(m.id));
    if (t.kind === 'user') el.dataset.user = m.id;
    el.style.setProperty('--tile-c', tileColor(m.name));
    const img = $('.tile-av img', el), src = avatarSrc(m);
    if (img.getAttribute('src') !== src) img.src = src;

    setHTML($('.tile-top', el), t.kind === 'screen'
      ? `<span class="live-pill">AO VIVO</span>${st.quality ? `<span class="q-pill">${esc(st.quality)}</span>` : ''}` : '');
    setHTML($('.tile-name', el), t.kind === 'screen'
      ? `${icon('screen')}<span>${esc(m.name)}${isMe ? ' (você)' : ''}</span>`
      : `${st.deafened ? icon('headOff', 'red') : st.muted ? icon('micOff', 'red') : ''}<span>${esc(m.name)}</span>`);
  }

  function updateStage() {
    if (!S.voice || !$('#stage')) return;
    const members = voiceMembers();
    const tiles = [];
    for (const m of members) if (m.state?.screen) tiles.push({ key: 's:' + m.id, kind: 'screen', m });
    for (const m of members) tiles.push({ key: 'u:' + m.id, kind: 'user', m });
    const screens = tiles.filter((t) => t.kind === 'screen');

    // Alguém entrou ao vivo → foca automaticamente (a menos que o usuário tenha escolhido o layout).
    const nowScreens = new Set(screens.map((t) => t.key));
    const fresh = [...nowScreens].find((k) => !S.prevScreens.has(k));
    if (fresh && !S.layoutPinned) { S.layout = 'focus'; S.focusKey = fresh; }
    S.prevScreens = nowScreens;

    let focused = null;
    if (S.layout === 'focus') focused = tiles.find((t) => t.key === S.focusKey) || screens[0] || null;
    $('#stage').classList.toggle('is-focus', !!focused);

    const box = $('#tiles'), fm = $('#focusMain'), keep = new Set();
    for (const t of tiles) {
      keep.add(t.key);
      let el = S.tileEls.get(t.key);
      if (!el) { el = createTile(t); S.tileEls.set(t.key, el); }
      updateTile(el, t);
      if (t === focused && el.parentElement !== fm) fm.replaceChildren(el);
    }
    if (!focused) fm.replaceChildren();
    tiles.filter((t) => t !== focused).forEach((t, i) => {
      const el = S.tileEls.get(t.key);
      if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
    });
    for (const [k, el] of S.tileEls) if (!keep.has(k)) { el.remove(); S.tileEls.delete(k); }
    // reinserir um <video> no DOM pausa a reprodução — retoma
    for (const el of S.tileEls.values()) { const v = $('video', el); if (v.srcObject && v.paused) v.play().catch(() => {}); }

    // Cabeçalho
    const ch = voiceChannel();
    $('#stageTitle').textContent = ch?.name || '';
    const liveT = focused?.kind === 'screen' ? focused : screens[0];
    setHTML($('#stageLive'), liveT ? `<span class="sep"></span>${icon('screen')}${esc(liveT.m.name)} — tela` : '');
    setHTML($('#stageQuality'), liveT?.m.state.quality
      ? `<span class="q-pill">${esc(liveT.m.state.quality)}</span><span class="live-pill">AO VIVO</span>` : '');
    $$('[data-action=layout]').forEach((b) => b.classList.toggle('on', b.dataset.layout === (focused ? 'focus' : 'grid')));

    // Controles flutuantes
    const cam = !!S.voice.camStream, scr = !!S.voice.screen;
    setHTML($('#controls'), `
      <div class="ctl-group">
        <button class="ctl ${cam ? 'on' : ''}" data-action="toggle-camera" title="${cam ? 'Desligar câmera' : 'Ligar câmera'}">${icon(cam ? 'camera' : 'camOff')}</button>
        <button class="ctl share ${scr ? 'on' : ''}" data-action="toggle-screen" title="${scr ? 'Parar transmissão' : 'Compartilhar tela'}">${icon(scr ? 'screenStop' : 'screenShare')}</button>
        <button class="ctl mic ${S.muted ? 'off' : ''}" data-action="toggle-mute" title="${S.muted ? 'Reativar microfone' : 'Silenciar'}">${icon(S.muted ? 'micOff' : 'mic')}</button>
        <button class="ctl ${S.deafened ? 'off-soft' : ''}" data-action="toggle-deafen" title="${S.deafened ? 'Reativar áudio' : 'Desativar áudio'}">${icon(S.deafened ? 'headOff' : 'headphones')}</button>
        <button class="ctl hang" data-action="leave-voice" title="Desconectar">${icon('phoneOff')}</button>
      </div>
      <button class="ctl ghost fs" data-action="stage-fullscreen" title="Tela cheia">${icon('maximize')}</button>`);
    layoutTiles();
  }

  /** Grade "estilo Discord": escolhe o nº de colunas que maximiza o tamanho de cada tile 16:9. */
  function layoutTiles() {
    const box = $('#tiles'), body = $('#stageBody');
    if (!box || !body) return;
    if ($('#stage').classList.contains('is-focus')) { box.style.removeProperty('--tw'); return; }
    const n = box.children.length;
    if (!n) return;
    const cs = getComputedStyle(body);
    const gap = 10;
    const W = body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const H = body.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    let best = 0;
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const w = Math.min((W - gap * (cols - 1)) / cols, ((H - gap * (rows - 1)) / rows) * 16 / 9);
      best = Math.max(best, w);
    }
    box.style.setProperty('--tw', Math.floor(best) + 'px');
  }

  function toggleFullscreen(el) {
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.().catch(() => {});
  }

  /* ================================= voz ================================== */
  async function joinVoice(serverId, channelId) {
    if (S.joining) return;
    S.joining = true;
    try {
      if (S.voice) teardownVoice(false);
      const v = new window.VoiceSession({
        socket: S.socket, myId: S.me.id, serverId, channelId,
        muted: S.muted, deafened: S.deafened,
        getMemberState: (id) => memberIn(serverId, id)?.state,
        onChange: () => { if (S.view === 'voice') updateStage(); renderVoicePanel(); },
        onSpeaking: (set) => { S.speaking = set; applySpeaking(); },
      });
      S.voice = v; // antes do start(): sinais podem chegar logo após o join
      await v.start();
      if (v.micError) toast('Microfone indisponível — você entrou sem áudio.', 'err');
      S.view = 'voice';
      S.layout = 'grid'; S.layoutPinned = false; S.focusKey = null; S.prevScreens = new Set();
      sfx.join();
      renderAll();
    } catch (e) {
      S.voice = null;
      toast(e.message || 'Não foi possível entrar no canal.', 'err');
      renderAll();
    } finally {
      S.joining = false;
    }
  }

  function teardownVoice(render = true) {
    if (!S.voice) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    S.voice.leave();
    S.voice = null;
    S.speaking = new Set();
    if (S.view === 'voice') S.view = 'text';
    sfx.leave();
    if (render) renderAll();
  }

  function setMute(muted) {
    S.muted = muted;
    if (!muted && S.deafened) S.deafened = false; // reativar mic também reativa o áudio
    LS.set('muted', S.muted); LS.set('deafened', S.deafened);
    S.voice?.setDeafened(S.deafened);
    S.voice?.setMuted(S.muted);
    renderUserPanel();
    if (S.view === 'voice') updateStage();
  }

  function setDeafen(deafened) {
    S.deafened = deafened;
    LS.set('deafened', S.deafened);
    S.voice?.setDeafened(S.deafened);
    renderUserPanel();
    if (S.view === 'voice') updateStage();
  }

  async function toggleCamera() {
    if (!S.voice) return toast('Entre em um canal de voz primeiro.');
    if (S.voice.camStream) return S.voice.stopCamera();
    try { await S.voice.startCamera(); } catch (e) { toast('Câmera indisponível: ' + (e.message || e.name), 'err'); }
    renderVoicePanel();
  }

  function toggleScreen() {
    if (!S.voice) return toast('Entre em um canal de voz para transmitir.');
    if (S.voice.screen) { S.voice.stopScreen(); renderVoicePanel(); return; }
    openScreenPicker();
  }

  /** Seletor de tela do Cinecria: fontes (Electron), qualidade, otimização e áudio. */
  async function openScreenPicker() {
    const isEl = !!window.cinecria?.isElectron;
    const canAudio = isEl ? window.cinecria.platform === 'win32' : true;
    const presetKey = LS.get('screenPreset', CFG.defaultScreenPreset);
    const hint = LS.get('screenHint', 'motion');
    const wantAudio = LS.get('screenAudio', true) && canAudio;
    const viewers = Math.max(1, S.voice.peers.size);

    const modal = openModal(`
      <div class="modal-head"><h2>Compartilhar tela</h2><button class="icon-btn" data-close title="Fechar">${icon('x')}</button></div>
      ${isEl ? `
        <div class="tabs"><button class="tab active" data-tab="screen">Telas</button><button class="tab" data-tab="window">Janelas e jogos</button></div>
        <div class="sources" id="srcGrid"><div class="loading">Carregando fontes…</div></div>`
      : '<p class="hint">Ao clicar em <b>Entrar ao vivo</b>, o navegador abre o seletor de tela do sistema.</p>'}
      <div class="share-opts">
        <label class="field"><span class="label">Qualidade</span>
          <select id="shQ">${Object.entries(CFG.screenPresets).map(([k, p]) => `<option value="${k}" ${k === presetKey ? 'selected' : ''}>${p.label}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Otimizar para</span>
          <select id="shHint">
            <option value="motion" ${hint === 'motion' ? 'selected' : ''}>Fluidez — filmes, séries e jogos</option>
            <option value="detail" ${hint === 'detail' ? 'selected' : ''}>Nitidez — texto, código e slides</option>
          </select></label>
        <label class="check ${canAudio ? '' : 'disabled'}"><input type="checkbox" id="shAudio" ${wantAudio ? 'checked' : ''} ${canAudio ? '' : 'disabled'}>
          <span>Transmitir áudio do sistema${canAudio ? '' : ' (somente Windows)'}</span></label>
      </div>
      <div class="modal-foot">
        <span class="foot-note" id="shNote"></span>
        <button class="btn ghost" data-close>Cancelar</button>
        <button class="btn live" id="goLive" ${isEl ? 'disabled' : ''}>${icon('screenShare')}Entrar ao vivo</button>
      </div>`, { wide: true });

    const note = () => {
      const p = CFG.screenPresets[$('#shQ', modal).value];
      $('#shNote', modal).textContent = `Upload estimado: até ~${Math.round((p.bitrate * viewers) / 1e6)} Mbps para ${viewers} espectador${viewers > 1 ? 'es' : ''}`;
    };
    $('#shQ', modal).addEventListener('change', note);
    note();

    let chosen = null;
    if (isEl) {
      let sources = [];
      let tab = 'screen';
      const grid = $('#srcGrid', modal);
      const draw = () => {
        const list = sources.filter((s) => (tab === 'screen' ? s.isScreen : !s.isScreen));
        grid.innerHTML = list.length ? list.map((s) => `
          <button class="src ${chosen === s.id ? 'sel' : ''}" data-id="${esc(s.id)}">
            <span class="src-thumb">${s.thumbnail ? `<img src="${s.thumbnail}" alt="">` : icon('screen')}</span>
            <span class="src-name">${s.icon ? `<img src="${s.icon}" alt="">` : ''}<span>${esc(s.name)}</span></span>
          </button>`).join('') : '<div class="loading">Nada encontrado.</div>';
      };
      $$('.tab', modal).forEach((b) => b.addEventListener('click', () => {
        tab = b.dataset.tab;
        $$('.tab', modal).forEach((x) => x.classList.toggle('active', x === b));
        draw();
      }));
      grid.addEventListener('click', (e) => {
        const b = e.target.closest('.src');
        if (!b) return;
        chosen = b.dataset.id;
        $('#goLive', modal).disabled = false;
        draw();
      });
      grid.addEventListener('dblclick', (e) => e.target.closest('.src') && $('#goLive', modal).click());
      try { sources = await window.cinecria.getSources(); draw(); } catch { grid.innerHTML = '<div class="loading">Não foi possível listar as telas.</div>'; }
    }

    $('#goLive', modal).addEventListener('click', async () => {
      const opts = { presetKey: $('#shQ', modal).value, hint: $('#shHint', modal).value, audio: $('#shAudio', modal).checked };
      LS.set('screenPreset', opts.presetKey); LS.set('screenHint', opts.hint); LS.set('screenAudio', opts.audio);
      if (isEl) await window.cinecria.selectSource({ id: chosen, audio: opts.audio });
      closeModal();
      if (!S.voice) return;
      try {
        const r = await S.voice.startScreen(opts);
        sfx.live();
        toast(opts.audio && !r.hasAudio ? 'Você está ao vivo (sem áudio do sistema).' : 'Você está ao vivo!', 'ok');
        S.view = 'voice'; S.layout = 'focus'; S.layoutPinned = false; S.focusKey = 's:' + S.me.id;
        renderAll();
      } catch (e) {
        if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') toast('Falha ao compartilhar: ' + (e.message || e.name), 'err');
      }
    });
  }

  /* ================================= modais ================================ */
  function createServerModal() {
    const m = openModal(`
      <div class="modal-head center"><h2>Criar um servidor</h2><p>Seu espaço para assistir com a galera. O código de convite sai na hora.</p></div>
      <label class="field"><span class="label">Nome do servidor</span><input id="nsName" maxlength="40" value="${esc('Cinema do ' + S.me.name)}"></label>
      <div class="modal-foot"><button class="btn link" data-go-join>Tenho um convite</button><div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="nsGo">Criar</button></div>`);
    const go = async () => {
      const res = await req('server:create', { name: $('#nsName', m).value });
      if (res.error) return toast(res.error, 'err');
      addServer(res.server);
      closeModal();
      toast(`Servidor criado! Convite: ${res.server.invite}`, 'ok');
    };
    $('#nsGo', m).addEventListener('click', go);
    $('#nsName', m).addEventListener('keydown', (e) => e.key === 'Enter' && go());
    $('[data-go-join]', m).addEventListener('click', joinServerModal);
  }

  function joinServerModal() {
    const m = openModal(`
      <div class="modal-head center"><h2>Entrar em um servidor</h2><p>Cole o código ou o link de convite que te mandaram.</p></div>
      <label class="field"><span class="label">Convite</span><input id="jsCode" maxlength="80" placeholder="ex.: K7Q2MX" spellcheck="false"></label>
      <div class="modal-foot"><div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="jsGo">Entrar</button></div>`);
    const go = async () => {
      const code = $('#jsCode', m).value.trim();
      if (!code) return;
      const res = await req('server:join', { code });
      if (res.error) return toast(res.error, 'err');
      addServer(res.server);
      closeModal();
      toast(`Você entrou em ${res.server.name}`, 'ok');
    };
    $('#jsGo', m).addEventListener('click', go);
    $('#jsCode', m).addEventListener('keydown', (e) => e.key === 'Enter' && go());
  }

  function addServer(srv) {
    S.servers.set(srv.id, srv);
    if (!srv.isPublic) saveInvite(srv.invite);
    S.activeServerId = srv.id;
    LS.set('lastServer', srv.id);
    S.view = 'text';
    renderAll();
  }

  function createChannelModal(type) {
    const srv = activeServer();
    const m = openModal(`
      <div class="modal-head"><h2>Criar canal</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
      <div class="type-pick">
        <label class="type-opt"><input type="radio" name="ct" value="text" ${type === 'text' ? 'checked' : ''}>${icon('hash')}<span><b>Texto</b><small>Mensagens, links e indicações</small></span></label>
        <label class="type-opt"><input type="radio" name="ct" value="voice" ${type === 'voice' ? 'checked' : ''}>${icon('volume')}<span><b>Voz e Cine</b><small>Conversar e transmitir telas</small></span></label>
      </div>
      <label class="field"><span class="label">Nome do canal</span><input id="ncName" maxlength="32" placeholder="${type === 'voice' ? 'Sala de Cinema' : 'novo-canal'}"></label>
      <div class="modal-foot"><div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="ncGo">Criar canal</button></div>`);
    const go = async () => {
      const t = $('input[name=ct]:checked', m).value;
      const res = await req('channel:create', { serverId: srv.id, name: $('#ncName', m).value, type: t });
      if (res.error) return toast(res.error, 'err');
      closeModal();
      if (t === 'text') { S.activeChannel[srv.id] = res.channel.id; LS.set('activeChannel', S.activeChannel); S.view = 'text'; renderAll(); }
    };
    $('#ncGo', m).addEventListener('click', go);
    $('#ncName', m).addEventListener('keydown', (e) => e.key === 'Enter' && go());
  }

  function profileModal() {
    const m = openModal(`
      <div class="modal-head"><h2>Meu perfil</h2><button class="icon-btn" data-close>${icon('x')}</button></div>
      <div class="avatar-pick" id="pfAvatar">
        <button class="avatar-big" type="button" title="Enviar foto"><img alt=""><span class="av-edit">Trocar</span></button>
        <div class="avatar-side">
          <span class="label">Foto de perfil</span>
          <div class="presets"></div>
          <button class="btn ghost sm av-upload" type="button">Enviar foto…</button>
          <input type="file" class="av-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
        </div>
      </div>
      <label class="field"><span class="label">Apelido</span><input id="pfName" maxlength="32" value="${esc(S.me.name)}"></label>
      <p class="hint">Conectado a <b>${esc(profile.serverUrl)}</b></p>
      <div class="modal-foot"><button class="btn danger-ghost" id="pfOut">${icon('logout')}Sair</button><div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="pfSave">Salvar</button></div>`);
    const picker = setupAvatarPicker($('#pfAvatar', m), $('#pfName', m), profile);
    $('#pfSave', m).addEventListener('click', async () => {
      const name = $('#pfName', m).value.trim();
      if (!name) return toast('O apelido não pode ficar vazio.', 'err');
      Object.assign(profile, picker.state(), { name });
      LS.set('profile', profile);
      S.avatarData = picker.value();
      const res = await req('profile:update', { name, avatar: S.avatarData });
      if (res.me) S.me = { ...S.me, ...res.me };
      closeModal();
      renderUserPanel();
    });
    $('#pfOut', m).addEventListener('click', () => {
      closeModal();
      teardownVoice(false);
      S.socket?.removeAllListeners();
      S.socket?.disconnect();
      S.me = null;
      showLogin();
    });
  }

  async function copyInvite(srv = activeServer()) {
    if (!srv) return;
    try { await navigator.clipboard.writeText(srv.invite); toast(`Convite ${srv.invite} copiado — mande para seus amigos!`, 'ok'); }
    catch { toast(`Código de convite: ${srv.invite}`); }
  }

  /* ================================= eventos =============================== */
  const actions = {
    'create-server': createServerModal,
    'join-server': joinServerModal,
    'create-channel': (el) => createChannelModal(el.dataset.type),
    'copy-invite': () => copyInvite(),
    'server-menu': (el) => {
      const srv = activeServer();
      openMenu(el, [
        { label: `Copiar convite (${srv.invite})`, icon: 'copy', run: () => copyInvite(srv) },
        { label: 'Criar canal de texto', icon: 'hash', run: () => createChannelModal('text') },
        { label: 'Criar canal de voz', icon: 'volume', run: () => createChannelModal('voice') },
        ...(srv.isPublic ? [] : ['-', { label: 'Sair do servidor', icon: 'logout', danger: true, run: () => leaveServer(srv) }]),
      ]);
    },
    'toggle-mute': () => setMute(!S.muted),
    'toggle-deafen': () => setDeafen(!S.deafened),
    'toggle-camera': toggleCamera,
    'toggle-screen': toggleScreen,
    'leave-voice': () => teardownVoice(),
    'open-stage': () => { if (S.voice) { S.view = 'voice'; renderAll(); } },
    'open-text': () => { if (S.voice) S.activeServerId = S.voice.serverId; S.view = 'text'; renderAll(); },
    layout: (el) => { S.layoutPinned = true; S.layout = el.dataset.layout; if (S.layout === 'grid') S.focusKey = null; updateStage(); },
    'stage-fullscreen': () => toggleFullscreen($('#stage')),
    'toggle-members': () => { S.showMembers = !S.showMembers; LS.set('showMembers', S.showMembers); renderMembers(); $('[data-action=toggle-members]')?.classList.toggle('on', S.showMembers); },
    'focus-composer': () => $('#msgInput')?.focus(),
    'join-first-voice': () => {
      const srv = activeServer();
      const ch = srv?.channels.find((c) => c.type === 'voice');
      if (ch) joinVoice(srv.id, ch.id);
    },
    profile: profileModal,
  };

  function leaveServer(srv) {
    if (S.voice?.serverId === srv.id) teardownVoice(false);
    S.socket.emit('server:leave', { serverId: srv.id });
    saveInvite(srv.invite, false);
    S.servers.delete(srv.id);
    S.activeServerId = S.servers.keys().next().value;
    S.view = 'text';
    renderAll();
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (a && actions[a.dataset.action]) { e.preventDefault(); actions[a.dataset.action](a); return; }

    const sv = e.target.closest('[data-server]');
    if (sv) {
      S.activeServerId = sv.dataset.server;
      LS.set('lastServer', S.activeServerId);
      S.view = 'text';
      renderAll();
      return;
    }

    const ch = e.target.closest('[data-channel]');
    if (ch) {
      const srv = activeServer();
      if (ch.dataset.type === 'text') {
        S.activeChannel[srv.id] = ch.dataset.channel;
        LS.set('activeChannel', S.activeChannel);
        S.view = 'text';
        renderAll();
      } else if (S.voice?.channelId === ch.dataset.channel) {
        S.view = 'voice';
        renderAll();
      } else {
        joinVoice(srv.id, ch.dataset.channel);
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#modalRoot').children.length) closeModal();
    if (!S.me || !(e.ctrlKey && e.shiftKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'm') { e.preventDefault(); setMute(!S.muted); }
    if (k === 'd') { e.preventDefault(); setDeafen(!S.deafened); }
  });

  window.addEventListener('beforeunload', () => S.voice?.leave());

  initLogin();
})();

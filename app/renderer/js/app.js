/**
 * Cinecria — UI principal (renderer)
 * Estado → render. Sem framework: templates + reconciliação manual dos tiles de vídeo
 * (os <video> nunca são recriados, então não piscam quando o estado muda).
 */
(function () {
  'use strict';
  const CFG = window.CINECRIA_CONFIG;

  /* ============================== plataforma ============================== */
  const CAP = window.Capacitor;
  const IS_NATIVE = !!CAP?.isNativePlatform?.();
  const PLUG = (name) => (IS_NATIVE ? CAP.Plugins?.[name] : null);
  const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
  const isMobile = () => matchMedia('(max-width: 820px), (max-height: 520px) and (pointer: coarse)').matches;
  // Android/iOS não têm getDisplayMedia: no celular dá para assistir, falar e ligar a câmera.
  const CAN_SHARE = !!navigator.mediaDevices?.getDisplayMedia && !/Android|iPhone|iPad/i.test(navigator.userAgent);
  document.documentElement.classList.toggle('native', IS_NATIVE);
  document.documentElement.classList.toggle('touch', IS_TOUCH);
  document.documentElement.classList.toggle('no-share', !CAN_SHARE);
  // Picture-in-Picture: só no PC (mouse) e onde o navegador/Electron suporta.
  const CAN_PIP = !!document.pictureInPictureEnabled && !IS_TOUCH && !IS_NATIVE && !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  document.documentElement.classList.toggle('pip', CAN_PIP);

  /* =============================== utilidades =============================== */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    paperclip: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
    vol: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
    volX: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m22 9-6 6M16 9l6 6"/>',
    reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>',
    film: '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 8h5M2 13h5M2 18h5M17 8h5M17 13h5M17 18h5"/>',
    bubble: '<path d="M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3 21l2-5.3A8.5 8.5 0 1 1 21 11.5z"/>',
    bulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>',
    trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    minus: '<path d="M5 12h14"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    door: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8"/><path d="M14 3l5 2v14l-5 2z"/><path d="M11 12h.01"/>',
    shield: '<path d="M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    sparkles: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M2 12s3.5-7 10-7c2 0 3.8.7 5.2 1.6M22 12s-3.5 7-10 7c-2 0-3.8-.7-5.2-1.6"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18" class="slash"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    pip: '<rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" stroke="none"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
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
  const logo = () => { const id = 'cineGrad' + ++logoSeq; return `<svg viewBox="0 0 48 48" class="logo" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b82f6"/><stop offset=".55" stop-color="#2563eb"/><stop offset="1" stop-color="#0ea5e9"/></linearGradient></defs><rect width="48" height="48" rx="13" fill="url(#${id})"/><rect x="10.5" y="13.5" width="27" height="18" rx="3.5" fill="none" stroke="#fff" stroke-width="2.8"/><path d="M21 18.4v8.2l7-4.1z" fill="#fff"/><path d="M17 36.5h14" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/></svg>`; };

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
  const fallbackAvatar = (name) => genAvatar(initials(name)[0], hue(name), (hue(name) + 40) % 360);
  /** O servidor devolve "/avatar/<hash>" (foto/GIF guardado nele) ou um link HTTPS de imagem. */
  const avatarSrc = (u) => {
    const a = u?.avatar;
    if (a && a[0] === '/') return profile.serverUrl + a;
    return a || fallbackAvatar(u?.name || '?');
  };
  const avatar = (u, size = 'sm') => `<img class="av av-${size}" src="${esc(avatarSrc(u))}" data-n="${esc(u.name)}" alt="" draggable="false">`;
  // Foto que não carrega (servidor reiniciou, GIF removido): volta para o avatar com a inicial.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.n || img.dataset.fb) return;
    img.dataset.fb = '1';
    img.src = fallbackAvatar(img.dataset.n);
  }, true);

  /* Armazenamento local da foto enviada: um GIF de 2 MB não cabe no localStorage. */
  const IDB = (() => {
    let dbp;
    const open = () => (dbp ||= new Promise((res, rej) => {
      const r = indexedDB.open('cinecria', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('kv', mode);
        const r = fn(t.objectStore('kv'));
        t.oncomplete = () => res(r?.result);
        t.onerror = () => rej(t.error);
      });
    };
    return {
      get: (k) => run('readonly', (st) => st.get(k)).catch(() => null),
      set: (k, v) => run('readwrite', (st) => st.put(v, k)).catch(() => {}),
    };
  })();

  /** GIF: lido como está (o canvas congelaria a animação). */
  const readRaw = (file) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });

  function resizeImage(file, size = 256) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const s = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        URL.revokeObjectURL(img.src);
        // WebP mantém a transparência de PNGs (JPEG deixaria o fundo preto)
        const webp = c.toDataURL('image/webp', 0.9);
        resolve(webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /** Seletor de avatar reutilizável (tela de entrada e "Meu perfil"). */
  function setupAvatarPicker(root, nameInput, init = {}) {
    const st = { mode: init.mode || 'preset', preset: init.preset || 0, upload: init.upload || null, remote: init.remote || null };
    if ((st.mode === 'upload' && !st.upload) || (st.mode === 'remote' && !st.remote)) st.mode = 'preset';
    const letter = () => initials(nameInput.value.trim() || '?')[0];
    const presetSrc = (i) => genAvatar(letter(), ...PRESET_HUES[i]);
    const value = () => (st.mode === 'upload' ? st.upload : st.mode === 'remote' ? st.remote : presetSrc(st.preset));
    const fileInput = $('.av-file', root);
    $$('[data-ico]', root).forEach((el) => { el.innerHTML = icon(el.dataset.ico); });
    function render() {
      $('.presets', root).innerHTML = PRESET_HUES.map((_, i) =>
        `<button type="button" class="preset ${st.mode === 'preset' && st.preset === i ? 'sel' : ''}" data-i="${i}" title="Avatar com a inicial"><img src="${presetSrc(i)}" alt=""></button>`).join('');
      const img = $('.avatar-big img', root);
      img.src = value();
      root.classList.toggle('is-gif', st.mode === 'remote' || /^data:image\/gif/.test(st.upload || '') && st.mode === 'upload');
    }
    $('.presets', root).addEventListener('click', (e) => {
      const b = e.target.closest('.preset');
      if (!b) return;
      st.mode = 'preset'; st.preset = Number(b.dataset.i); render();
    });
    const pick = () => fileInput.click();
    $('.av-upload', root).addEventListener('click', pick);
    $('.avatar-big', root).addEventListener('click', pick);
    $('.av-gif', root).addEventListener('click', () => openGifPicker((url) => { st.remote = url; st.mode = 'remote'; render(); }));
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0];
      fileInput.value = '';
      if (!f) return;
      const max = CFG.maxAvatarMB * 1048576;
      try {
        if (f.type === 'image/gif') {
          if (f.size > max) return toast(`Esse GIF tem ${(f.size / 1048576).toFixed(1).replace('.', ',')} MB — o máximo é ${CFG.maxAvatarMB} MB.`, 'err');
          st.upload = await readRaw(f); // animação preservada
        } else {
          if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return toast('Use PNG, JPG, WebP ou GIF.', 'err');
          const cropped = await openCropper(f); // enquadrar + zoom antes de aplicar
          if (!cropped) return;
          st.upload = cropped;
        }
        st.mode = 'upload';
        render();
      } catch { toast('Não consegui ler essa imagem.', 'err'); }
    });
    nameInput.addEventListener('input', () => st.mode === 'preset' && render());
    render();
    fillGifMosaic(root);
    return { value, state: () => ({ ...st }) };
  }

  /** Salva a escolha de foto: dados leves no localStorage, o arquivo no IndexedDB. */
  function saveProfile() {
    const { upload, ...light } = profile;
    LS.set('profile', light);
    IDB.set('avatarUpload', upload || null);
  }

  /* ============================== GIFs (servidor + KLIPY / GIPHY) ============================== */
  // A busca passa por GET /api/gifs (Tenor, com catálogo de reserva): funciona sem chave.
  // Se o Render tiver chave do KLIPY ou do GIPHY, elas têm prioridade sobre o catálogo, porque buscam
  // qualquer termo. Essas buscas saem do próprio app (exigência dos dois provedores).
  const AV_ACTIONS_HTML = `
    <div class="av-cards">
      <button class="av-card up-card av-upload" type="button">
        <span class="up-ico">${icon('folder')}</span><b>Enviar do dispositivo</b><small>PNG, JPG, WebP ou GIF</small>
      </button>
      <button class="av-card gif-card av-gif" type="button">
        <span class="gif-mosaic"><i></i><i></i><i></i><i></i></span>
        <span class="gif-card-label"><span class="gif-chip">GIF</span><b>${icon('sparkles')}Escolher GIF</b></span>
      </button>
    </div>`;
  const GIF_CATEGORIES = [
    { q: '', label: 'GIFs em alta', trend: true },
    { q: 'hello', label: 'hello' }, { q: 'lol', label: 'lol' }, { q: 'love', label: 'love' },
    { q: 'happy birthday', label: 'happy birthday' }, { q: 'thank you', label: 'thank you' },
    { q: 'excited', label: 'excited' }, { q: 'yes', label: 'yes' }, { q: 'no', label: 'no' },
    { q: 'sorry', label: 'sorry' }, { q: 'anime', label: 'anime' }, { q: 'cinema', label: 'cinema' },
  ];
  const GIF = {
    keys: null,
    customer: LS.get('gifCustomer', null) || (() => { const id = Math.random().toString(36).slice(2, 14); LS.set('gifCustomer', id); return id; })(),
    async getKeys() {
      if (this.keys) return this.keys;
      const k = { klipy: CFG.klipyKey || '', giphy: CFG.giphyKey || CFG.gifApiKey || '' };
      if (!k.klipy || !k.giphy) {
        try { // chaves definidas no Render (KLIPY_API_KEY / GIPHY_API_KEY)
          const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 6000);
          const j = await (await fetch(`${profile.serverUrl}/api/client-config`, { signal: ctrl.signal })).json();
          k.klipy ||= j?.gif?.klipyKey || ''; k.giphy ||= j?.gif?.giphyKey || '';
        } catch {}
      }
      return (this.keys = k);
    },
    async providers() {
      const k = await this.getKeys(), list = [];
      if (k.klipy) list.push({ name: 'KLIPY', fetch: (q) => this.klipy(k.klipy, q) });
      if (k.giphy) list.push({ name: 'GIPHY', fetch: (q) => this.giphy(k.giphy, q) });
      return list;
    },
    /** Rota do servidor: nunca falha por falta de chave nem por CORS (20 s: o Render pode estar acordando). */
    async backend(q) {
      const r = await fetch(`${profile.serverUrl}/api/gifs?${new URLSearchParams({ q: q.slice(0, 50) })}`, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('Servidor ' + r.status);
      return r.json();
    },
    /** Busca (q vazio = em alta). Tenor pelo servidor; depois KLIPY/GIPHY, se houver chave; por fim, o catálogo. */
    async search(q = '') {
      const cacheKey = 'gif:' + q.toLowerCase();
      try { const c = JSON.parse(sessionStorage.getItem(cacheKey) || 'null'); if (c && Date.now() - c.t < 30 * 60e3) return c.r; } catch {}
      const done = (r) => { try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), r })); } catch {} return r; };
      let api = null, last;
      try {
        api = await this.backend(q);
        if (api.source === 'tenor') return done(api);
      } catch (e) { last = e; console.warn('[gif] servidor', e.message); }
      for (const p of await this.providers()) {
        try {
          const items = await p.fetch(q);
          return done({ provider: p.name, items });
        } catch (e) { last = e; console.warn('[gif]', p.name, e.message); }
      }
      if (api) return done(api);
      throw last;
    },
    async klipy(key, q) {
      const params = new URLSearchParams({ per_page: '24', customer_id: this.customer, locale: 'pt', content_filter: 'medium' });
      if (q) params.set('q', q.slice(0, 50));
      const r = await fetch(`https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/${q ? 'search' : 'trending'}?${params}`);
      if (!r.ok) throw new Error('KLIPY ' + r.status);
      const j = await r.json();
      if (j?.result === false) throw new Error('KLIPY recusou');
      const rows = Array.isArray(j?.data?.data) ? j.data.data : Array.isArray(j?.data) ? j.data : [];
      const url = (f, sizes, fmt) => { for (const sz of sizes) { const u = f?.[sz]?.[fmt]?.url; if (u) return u; } return null; };
      return rows.filter((x) => x && x.type !== 'ad' && x.file).map((x) => ({
        preview: url(x.file, ['xs', 'sm', 'md'], 'gif') || url(x.file, ['xs', 'sm'], 'webp'),
        use: url(x.file, ['sm', 'md', 'xs'], 'gif'),
        title: x.title || '',
      })).filter((x) => x.preview && x.use);
    },
    async giphy(key, q) {
      const params = new URLSearchParams({ api_key: key, limit: '24', rating: CFG.gifRating || 'pg-13' });
      if (q) { params.set('q', q.slice(0, 50)); params.set('lang', 'pt'); }
      const r = await fetch(`https://api.giphy.com/v1/gifs/${q ? 'search' : 'trending'}?${params}`);
      if (!r.ok) throw new Error('GIPHY ' + r.status);
      const { data = [] } = await r.json();
      return data.map((g) => ({
        preview: g.images?.fixed_width_small?.url || g.images?.fixed_width?.url,
        use: g.images?.fixed_width?.url || g.images?.fixed_width_small?.url,
        title: g.title || '',
      })).filter((x) => x.preview && x.use);
    },
  };
  const catPreviews = () => LS.get('gifCatPreview', {});

  /** Mosaico 2×2 animado no card "Escolher GIF" (1 busca de "em alta", em cache por 30 min). */
  async function fillGifMosaic(root) {
    const tiles = $$('.gif-mosaic i', root);
    if (!tiles.length) return;
    try {
      const { items } = await GIF.search('');
      items.slice(0, 4).forEach((it, i) => { tiles[i].style.backgroundImage = `url("${it.preview.replace(/"/g, '%22')}")`; });
      $('.gif-mosaic', root).classList.add('ready');
    } catch {}
  }

  function gifFromLink(raw) {
    try {
      const u = new URL(String(raw).trim());
      if (u.protocol !== 'https:') return null;
      const h = u.hostname.toLowerCase();
      let m;
      if (/^(media\d*|i)\.giphy\.com$/.test(h)) {
        m = u.pathname.match(/\/media\/(?:v1\.[^/]+\/)?([A-Za-z0-9]+)\//);
        return m ? `https://media.giphy.com/media/${m[1]}/200w.gif` : null;
      }
      if (/(^|\.)giphy\.com$/.test(h)) {
        m = u.pathname.match(/\/(?:gifs|stickers|embed)\/(?:[\w-]*-)?([A-Za-z0-9]+)\/?$/);
        return m ? `https://media.giphy.com/media/${m[1]}/200w.gif` : null;
      }
      if (/\.(gif|png|jpe?g|webp|avif)$/i.test(u.pathname)) return u.href; // o servidor confere o resto
    } catch {}
    return null;
  }

  function closeGifPicker() { const g = $('.gif-back'); if (!g) return false; g.remove(); return true; }
  function openGifPicker(onPick) {
    closeGifPicker();
    const ov = document.createElement('div');
    ov.className = 'gif-back';
    ov.innerHTML = `
      <div class="gif-pop" role="dialog" aria-label="Escolher GIF">
        <div class="gif-head">
          <button type="button" class="icon-btn gif-backbtn hidden" data-g="home" title="Categorias">${icon('back')}</button>
          <b>Escolher GIF</b><span class="spacer"></span>
          <button type="button" class="icon-btn" data-g="x" title="Fechar">${icon('x')}</button></div>
        <label class="gif-search">${icon('search')}<input type="search" placeholder="Buscar GIFs…" autocomplete="off" spellcheck="false"></label>
        <div class="gif-body"></div>
        <form class="gif-link"><input placeholder="…ou cole o link de um GIF ou imagem (https://…)" spellcheck="false" autocomplete="off"><button type="submit" class="btn ghost sm">Usar</button></form>
        <div class="gif-foot"><span class="gif-attr">Busca de GIFs</span></div>
      </div>`;
    document.body.appendChild(ov);
    const body = $('.gif-body', ov), input = $('.gif-search input', ov), backBtn = $('.gif-backbtn', ov);
    const attr = (p) => { $('.gif-attr', ov).innerHTML = p ? `Powered by <b>${p}</b>` : 'Busca de GIFs'; };
    const msg = (html) => { body.innerHTML = `<div class="gif-msg">${icon('info')}<span>${html}</span></div>`; };
    const choose = (url) => {
      const test = new Image();
      test.onload = () => { onPick(url); closeGifPicker(); };
      test.onerror = () => toast('Não consegui carregar esse GIF.', 'err');
      test.src = url;
    };
    const fail = () => msg('Não deu para buscar GIFs agora (servidor fora do ar ou sem conexão). Tente de novo em instantes ou cole um link abaixo.');

    async function home() {
      backBtn.classList.add('hidden');
      input.value = '';
      const prev = catPreviews();
      body.innerHTML = `<div class="gif-cats">${GIF_CATEGORIES.map((c, i) => `
        <button type="button" class="gif-cat" data-cat="${i}"><span class="gif-cat-bg" ${prev[c.q] ? `style="background-image:url('${esc(prev[c.q])}')"` : ''}></span>
          <b>${c.trend ? icon('trend') : ''}${esc(c.label)}</b></button>`).join('')}</div>`;
      try {
        const { items, provider } = await GIF.search('');
        attr(provider);
        // fundo de cada categoria: a prévia guardada dela, ou um GIF em alta enquanto não há
        $$('.gif-cat', body).forEach((el, i) => {
          const bg = $('.gif-cat-bg', el);
          const it = items[i % items.length];
          if (!bg.style.backgroundImage && it) bg.style.backgroundImage = `url('${it.preview}')`;
        });
      } catch {}
    }
    let seq = 0;
    async function results(q, label) {
      const my = ++seq;
      backBtn.classList.remove('hidden');
      body.innerHTML = `<div class="gif-title">${esc(label || `“${q}”`)}</div><div class="gif-grid loading">${'<span class="gif-skel"></span>'.repeat(12)}</div>`;
      try {
        const { items, provider, matched } = await GIF.search(q);
        if (my !== seq) return;
        attr(provider);
        if (q && matched !== false && items[0]) { const p = catPreviews(); p[q.toLowerCase()] = items[0].preview; LS.set('gifCatPreview', p); }
        if (!items.length) return msg('Nenhum GIF encontrado.');
        if (matched === false) $('.gif-title', body).textContent = `Sem resultados para “${q}”: veja os GIFs em alta`;
        $('.gif-grid', body).classList.remove('loading');
        $('.gif-grid', body).innerHTML = items.map((g) => `<button type="button" class="gif-item" data-gif="${esc(g.use)}" title="${esc(g.title)}"><img src="${esc(g.preview)}" alt="" loading="lazy"></button>`).join('');
      } catch { if (my === seq) fail(); }
    }

    ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeGifPicker(); });
    ov.addEventListener('click', (e) => {
      if (e.target.closest('[data-g=x]')) return closeGifPicker();
      if (e.target.closest('[data-g=home]')) return home();
      const c = e.target.closest('[data-cat]');
      if (c) { const cat = GIF_CATEGORIES[Number(c.dataset.cat)]; return results(cat.q, cat.trend ? 'GIFs em alta' : cat.label); }
      const g = e.target.closest('[data-gif]');
      if (g) choose(g.dataset.gif);
    });
    let timer = null;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      timer = setTimeout(() => (q ? results(q) : home()), 450); // espera parar de digitar: poupa o limite da chave
    });
    $('.gif-link', ov).addEventListener('submit', (e) => {
      e.preventDefault();
      const url = gifFromLink($('.gif-link input', ov).value);
      if (!url) return toast('Cole um link https:// de GIF ou imagem (.gif, .png, .jpg, .webp) ou do GIPHY.', 'err');
      choose(url);
    });
    home();
    setTimeout(() => input.focus(), 30);
  }

  /* ============================ editor de recorte ============================ */
  /** Abre "Editar imagem": arrastar para enquadrar + zoom. Resolve com o recorte 256×256 ou null. */
  function openCropper(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onerror = () => { URL.revokeObjectURL(url); toast('Não consegui ler essa imagem.', 'err'); resolve(null); };
      img.onload = () => {
        const ov = document.createElement('div');
        ov.className = 'crop-back';
        ov.innerHTML = `
          <div class="crop-pop" role="dialog" aria-label="Editar imagem">
            <div class="crop-head"><b>Editar imagem</b><button type="button" class="icon-btn" data-c="x" title="Cancelar">${icon('x')}</button></div>
            <div class="crop-stage"><img alt="" draggable="false"><div class="crop-mask"></div></div>
            <div class="crop-zoom">
              <button type="button" class="icon-btn" data-c="out" title="Afastar">${icon('minus')}</button>
              <input type="range" min="1" max="4" step="0.01" value="1" aria-label="Zoom">
              <button type="button" class="icon-btn" data-c="in" title="Aproximar">${icon('plus')}</button>
            </div>
            <small class="crop-hint">Arraste para enquadrar · role o mouse ou faça pinça para dar zoom</small>
            <div class="crop-foot"><button type="button" class="btn ghost" data-c="x">Cancelar</button><button type="button" class="btn primary" data-c="ok">Aplicar</button></div>
          </div>`;
        document.body.appendChild(ov);
        const stage = $('.crop-stage', ov), pic = $('img', stage), range = $('input[type=range]', ov);
        pic.src = url;
        const V = () => stage.clientWidth;                       // viewport quadrado
        const base = () => Math.max(V() / img.naturalWidth, V() / img.naturalHeight); // "cobrir"
        const st = { z: 1, x: 0, y: 0 };
        const clamp = () => {
          const k = base() * st.z, w = img.naturalWidth * k, h = img.naturalHeight * k;
          const mx = Math.max(0, (w - V()) / 2), my = Math.max(0, (h - V()) / 2);
          st.x = Math.min(mx, Math.max(-mx, st.x));
          st.y = Math.min(my, Math.max(-my, st.y));
        };
        const draw = () => {
          clamp();
          const k = base() * st.z, w = img.naturalWidth * k, h = img.naturalHeight * k;
          pic.style.width = w + 'px'; pic.style.height = h + 'px';
          pic.style.transform = `translate(${(V() - w) / 2 + st.x}px, ${(V() - h) / 2 + st.y}px)`;
          range.value = st.z;
        };
        const zoomTo = (z) => { st.z = Math.min(4, Math.max(1, z)); draw(); };
        const done = (out) => { URL.revokeObjectURL(url); ov.remove(); resolve(out); };
        // arrastar (mouse/dedo) + pinça com dois dedos
        const pts = new Map();
        let pinch0 = null;
        stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), z: st.z }; } });
        stage.addEventListener('pointermove', (e) => {
          const p = pts.get(e.pointerId);
          if (!p) return;
          if (pts.size === 1) { st.x += e.clientX - p.x; st.y += e.clientY - p.y; }
          p.x = e.clientX; p.y = e.clientY;
          if (pts.size === 2 && pinch0) { const [a, b] = [...pts.values()]; zoomTo(pinch0.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch0.d); }
          else draw();
        });
        const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; };
        stage.addEventListener('pointerup', up);
        stage.addEventListener('pointercancel', up);
        stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomTo(st.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
        range.addEventListener('input', () => zoomTo(Number(range.value)));
        ov.addEventListener('click', (e) => {
          const b = e.target.closest('[data-c]');
          if (!b) return;
          if (b.dataset.c === 'x') return done(null);
          if (b.dataset.c === 'in') return zoomTo(st.z + 0.25);
          if (b.dataset.c === 'out') return zoomTo(st.z - 0.25);
          // recorte exato do que está dentro do quadro → canvas 256×256
          const k = base() * st.z, w = img.naturalWidth * k, h = img.naturalHeight * k;
          const left = (V() - w) / 2 + st.x, top = (V() - h) / 2 + st.y;
          const c = document.createElement('canvas');
          c.width = c.height = 256;
          const g = c.getContext('2d');
          g.imageSmoothingQuality = 'high';
          g.drawImage(img, -left / k, -top / k, V() / k, V() / k, 0, 0, 256, 256);
          const webp = c.toDataURL('image/webp', 0.9);
          done(webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.9));
        });
        ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } });
        requestAnimationFrame(draw);
        setTimeout(() => $('[data-c=ok]', ov).focus(), 30);
      };
      img.src = url;
    });
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
    token: null,                         // autoriza uploads de mídia (só este cliente conhece)
    volumes: LS.get('volumes', {}),      // { [nome]: { voice, stream, muted } } — volume LOCAL por pessoa
    staged: [],                          // anexos aguardando envio no chat
    mentions: new Set(),                 // canais com menção não lida a você
    pip: null,                           // { key } do vídeo em Picture-in-Picture
    callOpen: LS.get('callChatOpen', false), // painel "Chat da sala" aberto no palco
    callUnread: 0,                       // mensagens novas no chat da sala com o painel fechado
    hideOwnPreview: LS.get('hideOwnPreview', CFG.hideOwnPreviewByDefault !== false),
    lights: LS.get('ambilight', CFG.ambilight?.enabled !== false), // "Luzes de cinema"
    resumeKey: LS.get('resumeKey', null),
    statsKey: null,                      // card com o painel de estatísticas aberto
    composerChannel: null,               // canal do composer visível (texto ou chat da sala)
    gpuDisabled: false,
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
  const profile = LS.get('profile', { name: '', mode: 'preset', preset: Math.floor(Math.random() * 8), serverUrl: '' });
  // Servidor travado: ignora qualquer endereço antigo salvo no aparelho.
  if (CFG.lockServer) profile.serverUrl = CFG.serverUrl;
  let loginPicker;

  async function initLogin() {
    $('#brandLogo').innerHTML = logo();
    $$('#login [data-ico]').forEach((el) => { el.innerHTML = icon(el.dataset.ico); });
    // foto enviada fica no IndexedDB (versões antigas guardavam no localStorage: migra)
    if (profile.upload) { await IDB.set('avatarUpload', profile.upload); saveProfile(); }
    profile.upload = await IDB.get('avatarUpload');
    const nick = $('#nick');
    nick.value = profile.name || '';
    $('#srvUrl').value = profile.serverUrl || CFG.defaultServerUrl;
    $('#srvLock').classList.toggle('hidden', !CFG.lockServer);
    $('.adv').classList.toggle('hidden', !!CFG.lockServer);
    if (CFG.lockServer) {
      $('#srvHost').textContent = new URL(CFG.serverUrl).host;
      checkServer();
    }
    if (IS_NATIVE && !CFG.lockServer) {
      $('.adv').open = true; // no celular o IP do PC é obrigatório — campo sempre visível
      $('#srvEmu').addEventListener('click', () => { $('#srvUrl').value = `http://10.0.2.2:${CFG.defaultPort}`; testServer(); });
    }
    $('#srvTest').addEventListener('click', testServer);
    loginPicker = setupAvatarPicker($('#loginAvatar'), nick, profile);
    $('#enterBtn').addEventListener('click', enter);
    nick.addEventListener('keydown', (e) => e.key === 'Enter' && enter());
    setTimeout(() => nick.focus(), 50);
  }

  /** "192.168.0.5" → "http://192.168.0.5:3001"; localhost no Android → avisa (é o próprio celular). */
  function normalizeUrl(raw) {
    let v = String(raw || '').trim().replace(/\/+$/, '');
    if (!v) return '';
    if (!/^https?:\/\//i.test(v)) v = 'http://' + v;
    try {
      const u = new URL(v);
      if (!u.port && u.protocol === 'http:') u.port = String(CFG.defaultPort);
      return u.origin;
    } catch { return v; }
  }

  async function testServer() {
    const hint = $('#srvHint');
    const url = normalizeUrl($('#srvUrl').value);
    if (!url) { hint.textContent = 'Digite o IP do PC que roda o servidor.'; hint.className = 'srv-hint err'; return false; }
    $('#srvUrl').value = url;
    if (IS_NATIVE && /\/\/(localhost|127\.0\.0\.1)\b/.test(url)) {
      hint.textContent = 'No celular, "localhost" é o próprio celular. Use o IP do PC (ou 10.0.2.2 no emulador).';
      hint.className = 'srv-hint err';
      return false;
    }
    hint.textContent = 'Testando…'; hint.className = 'srv-hint';
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(url + '/health', { signal: ctrl.signal });
      const j = await r.json();
      if (!j.ok) throw new Error();
      hint.textContent = '✓ Servidor Cinecria encontrado'; hint.className = 'srv-hint ok';
      return true;
    } catch {
      hint.textContent = 'Sem resposta. Confira o IP, se o servidor está rodando e se o celular está no mesmo Wi-Fi.';
      hint.className = 'srv-hint err';
      return false;
    }
  }

  /** Indicador "online / acordando" do servidor oficial. O Render gratuito dorme sem uso. */
  let srvTimer = null;
  async function checkServer(tries = 0) {
    clearTimeout(srvTimer);
    const box = $('#srvStatus');
    if (!box || $('#login').classList.contains('hidden')) return;
    const set = (cls, txt) => { box.className = 'srv-status ' + cls; $('span', box).textContent = txt; };
    if (!tries) set('', 'verificando…');
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(CFG.serverUrl + '/health', { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (!(await r.json()).ok) throw new Error();
      set('ok', 'online');
    } catch {
      if (tries >= 15) return set('err', 'fora do ar');
      set('wake', 'acordando…');
      srvTimer = setTimeout(() => checkServer(tries + 1), 5000);
    }
  }

  function enter() {
    const name = $('#nick').value.trim();
    const err = $('#loginErr');
    if (!name) { err.textContent = 'Escolha um apelido para entrar.'; $('#nick').focus(); return; }
    const serverUrl = CFG.lockServer ? CFG.serverUrl : normalizeUrl($('#srvUrl').value) || CFG.defaultServerUrl;
    if (IS_NATIVE && /\/\/(localhost|127\.0\.0\.1)\b/.test(serverUrl)) { testServer(); return; }
    if (!serverUrl) { err.textContent = 'Informe o endereço do servidor Cinecria (IP do PC).'; $('.adv').open = true; $('#srvUrl').focus(); return; }
    $('#srvUrl').value = serverUrl;
    Object.assign(profile, loginPicker.state(), { name, serverUrl });
    saveProfile();
    err.textContent = '';
    $('#enterBtn').disabled = true;
    $('#enterBtn').textContent = 'Conectando…';
    connect(loginPicker.value());
  }

  $('#nick').addEventListener('input', () => { $('#nick').classList.remove('invalid'); $('#login .name-alert')?.remove(); });

  const isNameTaken = (res) => res?.error === 'NAME_TAKEN' || res?.code === 'name_taken';
  /** Alerta grande "Nome indisponível": card vermelho + campo tremendo com borda brilhante. */
  function nameAlert(container, input, name) {
    container.querySelector('.name-alert')?.remove();
    const el = document.createElement('div');
    el.className = 'name-alert';
    el.setAttribute('role', 'alert');
    el.innerHTML = `<span class="na-ico">${icon('alert')}</span>
      <div class="na-txt"><b>Nome indisponível</b>
        <p>Já existe alguém com o nome <q>${esc(name)}</q> online no momento. Por favor, escolha outro apelido.</p></div>
      <button type="button" class="icon-btn" title="Fechar">${icon('x')}</button>`;
    el.querySelector('button').addEventListener('click', () => el.remove());
    const field = input.closest('.field');
    field.parentNode.insertBefore(el, field);
    input.classList.remove('shake');
    void input.offsetWidth; // reinicia a animação
    input.classList.add('invalid', 'shake');
    input.focus();
    input.select();
  }

  function showLogin(msg = '') {
    $('#app').classList.add('hidden');
    $('#login').classList.remove('hidden');
    $('#enterBtn').disabled = false;
    $('#enterBtn').textContent = 'Entrar';
    $('#loginErr').className = 'err';
    $('#loginErr').textContent = msg;
    if (CFG.lockServer) checkServer();
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
      if (!S.resumeKey) { S.resumeKey = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join(''); LS.set('resumeKey', S.resumeKey); }
      const res = await req('hello', { name: profile.name, avatar: S.avatarData, invites: LS.get('invites', []), resume: S.resumeKey });
      if (res.error) {
        socket.disconnect();
        if (isNameTaken(res)) { showLogin(); return nameAlert($('#login .login-card'), $('#nick'), profile.name); }
        showLogin(res.message || res.error);
        return;
      }
      onInit(res);
    });
    // Render gratuito: o primeiro acesso depois de um tempo parado leva ~1 min. O socket.io
    // continua tentando sozinho; só desistimos depois de 90 s.
    const t0 = Date.now();
    socket.on('connect_error', () => {
      if (S.me) return;
      if (Date.now() - t0 < 90_000) {
        $('#enterBtn').textContent = 'Acordando o servidor…';
        $('#loginErr').className = 'err info';
        $('#loginErr').textContent = 'O servidor gratuito dorme quando ninguém usa. A primeira entrada pode levar até 1 minuto.';
        return;
      }
      socket.disconnect();
      showLogin('Não foi possível conectar ao servidor. Tente de novo em instantes.');
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

  function onInit({ me, servers, token }) {
    S.me = me;
    S.token = token;
    S.servers = new Map(servers.map((s) => [s.id, s]));
    S.messages.clear(); S.loaded.clear(); S.unread.clear();
    const last = LS.get('lastServer');
    S.activeServerId = S.servers.has(S.activeServerId) ? S.activeServerId : S.servers.has(last) ? last : servers[0]?.id;
    S.view = 'text';
    clearTimeout(srvTimer);
    $('#loginErr').textContent = '';
    $('#login').classList.add('hidden');
    $('#app').classList.remove('hidden');
    renderAll();
    window.cinecria?.getSettings?.().then((st) => { S.gpuDisabled = !!st?.gpuDisabled; if (S.gpuDisabled) gpuBanner(); }).catch(() => {});
  }

  function onServerUpdate(snap) {
    if (!snap.members.some((m) => m.id === S.me?.id)) return;
    S.servers.set(snap.id, snap);
    const me = snap.members.find((m) => m.id === S.me.id);
    if (me) S.me = { ...S.me, name: me.name, avatar: me.avatar };
    renderRail(); renderSidebar(); renderMembers(); renderUserPanel(); renderVoicePanel();
    if (S.view === 'voice') updateStage();
  }

  /** Canal cujo chat está montado na tela agora (texto, ou o chat da sala no palco). */
  function chatDomChannel() {
    if (S.view === 'text') return textChannel(activeServer())?.id || null;
    if (S.view === 'voice' && S.voice && $('#callChat')) return S.voice.channelId;
    return null;
  }
  /** O usuário está de fato VENDO esse chat? (painel da sala fechado não conta) */
  function chatVisible(channelId) {
    if (S.view === 'text') return textChannel(activeServer())?.id === channelId;
    return S.view === 'voice' && S.voice?.channelId === channelId && S.callOpen;
  }

  function onChatMessage(msg) {
    const ch = channelById(msg.channelId);
    const isCall = ch?.type === 'voice';
    const mine = msg.author.id === S.me.id;
    const visible = chatVisible(msg.channelId) && !document.hidden;
    if (!mine && mentionsMe(msg.text)) {
      mentionDing();
      if (!visible) {
        S.mentions.add(msg.channelId);
        if (!chatVisible(msg.channelId)) toast(`${msg.author.name} mencionou você ${isCall ? `no chat da ${ch.name}` : ch ? `em ${ch.name}` : ''}`, 'mention-toast');
      }
    }
    if (S.loaded.has(msg.channelId)) {
      S.messages.get(msg.channelId).push(msg);
      if (chatDomChannel() === msg.channelId) appendMessage(msg);
    }
    if (!mine && !chatVisible(msg.channelId)) {
      if (isCall) {
        // só conta o chat da sala em que você está
        if (S.voice?.channelId === msg.channelId) { S.callUnread++; renderCallBadges(); if (S.view === 'voice') peekMessage(msg); }
      } else S.unread.add(msg.channelId);
    }
    renderRail(); renderSidebar();
  }

  async function loadHistory(channelId) {
    if (S.loaded.has(channelId)) return;
    const res = await req('chat:history', { channelId });
    S.messages.set(channelId, res.messages || []);
    S.loaded.add(channelId);
    if (chatDomChannel() === channelId) renderMessages(channelId);
  }

  /* ================================= render ================================ */
  function renderAll() {
    renderRail(); renderSidebar(); renderMain(); renderMembers(); renderUserPanel(); renderVoicePanel();
  }

  /** Barra superior: logo + comunidades em pills (substitui a coluna de bolinhas). */
  function renderRail() {
    const serverUnread = (s) => s.channels.some((c) => S.unread.has(c.id));
    $('#rail').innerHTML = `
      <div class="tb-brand" title="Cinecria Beta">${logo()}<span class="tb-name">Cinecria</span><span class="beta-badge">Beta</span></div>
      <nav class="tb-pills" aria-label="Comunidades">
        ${[...S.servers.values()].map((s) => `
          <button class="tb-pill ${s.id === S.activeServerId ? 'active' : ''} ${serverUnread(s) ? 'unread' : ''}" data-server="${s.id}" style="--c:${s.color}" title="${esc(s.name)}">
            <span class="tb-ico">${esc(initials(s.name))}</span>
            <span class="tb-label">${esc(s.name)}</span>
            ${s.isPublic ? `<span class="tb-off" title="Servidor oficial">${icon('shield')}</span>` : ''}
            ${S.voice?.serverId === s.id ? `<span class="tb-voice" title="Você está numa sala aqui">${icon('volume')}</span>` : ''}
            ${s.channels.some((c) => S.mentions.has(c.id)) ? '<span class="tb-ping">@</span>' : serverUnread(s) ? '<span class="tb-dot"></span>' : ''}
          </button>`).join('')}
      </nav>
      <div class="tb-actions">
        <button class="tb-btn" data-action="create-server" title="Criar comunidade">${icon('plus')}<span>Criar</span></button>
        <button class="tb-btn" data-action="join-server" title="Entrar com convite">${icon('link')}<span>Convite</span></button>
      </div>`;
  }

  function vcMember(m) {
    const st = m.state || {};
    return `<div class="vcm ${S.speaking.has(m.id) ? 'speaking' : ''}" data-user="${m.id}" data-vol-user="${m.id}" data-profile="${m.id}">
      ${avatar(m, 'xs')}<span class="nm">${esc(m.name)}</span>
      <span class="vcm-icons">
        ${volBadge(m)}
        ${st.screen ? '<span class="live-badge">AO VIVO</span>' : ''}
        ${st.camera ? icon('camera', 'dim') : ''}
        ${st.deafened ? icon('headOff', 'red') : st.muted ? icon('micOff', 'red') : ''}
      </span></div>`;
  }

  function renderSidebar() {
    const srv = activeServer();
    if (!srv) return;
    const online = srv.members.length, inRooms = srv.members.filter((m) => m.voice).length;
    $('#srvHeader').innerHTML = `<button class="srv-header" data-action="server-menu">
      <span class="srv-head-txt"><span class="srv-title">${esc(srv.name)}</span>
        <small>${srv.isPublic ? `${icon('shield')}Oficial · ` : ''}${online} online${inRooms ? ` · ${inRooms} em salas` : ''}</small></span>${icon('chevron')}</button>`;
    const cur = textChannel(srv);
    // servidores públicos oficiais: ninguém cria/edita salas (o servidor também recusa)
    const cat = (label, type) => `<div class="cat"><span>${label}</span>${srv.isPublic ? '' : `<button class="cat-add" data-action="create-channel" data-type="${type}" title="Criar ${type === 'voice' ? 'sala' : 'canal'}">${icon('plus')}</button>`}</div>`;
    // Texto e voz têm o MESMO visual de pílula; só o ícone muda (balão × alto-falante).
    const text = srv.channels.filter((c) => c.type === 'text').map((c) => `
      <button class="spot ${S.view === 'text' && cur?.id === c.id ? 'active' : ''} ${S.unread.has(c.id) ? 'unread' : ''}" data-channel="${c.id}" data-type="text">
        <span class="spot-ico">${icon('bubble')}</span><span class="spot-name">${esc(c.name)}</span>
        ${S.mentions.has(c.id) ? `<span class="ping" title="Mencionaram você">${icon('at')}</span>` : S.unread.has(c.id) ? '<span class="spot-dot" title="Mensagens novas"></span>' : ''}
      </button>`).join('');
    const voice = srv.channels.filter((c) => c.type === 'voice').map((c) => {
      const ms = srv.members.filter((m) => m.voice?.channelId === c.id);
      const connected = S.voice?.channelId === c.id;
      const live = ms.some((m) => m.state?.screen);
      const avs = ms.slice(0, 6).map((m) => `<img class="spot-av" src="${esc(avatarSrc(m))}" data-n="${esc(m.name)}" data-profile="${m.id}" title="${esc(m.name)}" alt="">`).join('');
      return `<button class="spot voice ${connected ? 'connected' : ''} ${connected && S.view === 'voice' ? 'active' : ''} ${live ? 'live' : ''}" data-channel="${c.id}" data-type="voice">
          <span class="spot-ico">${icon('volume')}</span><span class="spot-name">${esc(c.name)}</span>
          ${S.mentions.has(c.id) ? `<span class="ping" title="Mencionaram você no chat da sala">${icon('at')}</span>` : ''}
          ${live ? '<span class="spot-live" title="Transmissão ao vivo"></span>' : ''}
          ${ms.length ? `<span class="spot-count">${ms.length}</span>` : ''}
          ${ms.length && !connected ? `<span class="spot-avs">${avs}${ms.length > 6 ? `<em>+${ms.length - 6}</em>` : ''}</span>` : ''}
        </button>
        ${connected ? `<div class="vc-members">${ms.map(vcMember).join('')}</div>` : ''}`;
    }).join('');
    $('#channels').innerHTML = cat('Bate-papo', 'text') + `<div class="spot-list">${text}</div>` + cat('Salas de exibição', 'voice') + `<div class="spot-list">${voice}</div>`;
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
        ${CAN_SHARE ? `<button class="vp-btn ${S.voice.screen ? 'live' : ''}" data-action="toggle-screen">${icon(S.voice.screen ? 'screenStop' : 'screenShare')}${S.voice.screen ? 'Parar' : 'Tela'}</button>` : ''}
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
      return `<div class="mem ${m.id === S.me.id ? 'me' : ''}" data-user="${m.id}" data-vol-user="${m.id}" data-profile="${m.id}">
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
    if (S.mentions.delete(ch.id)) { renderRail(); renderSidebar(); }
    renderMessages(ch.id);
    loadHistory(ch.id);
  }

  function buildText(ch) {
    resetStage();
    const main = $('#main');
    main.dataset.view = 'text:' + ch.id;
    main.innerHTML = `
      <header class="main-head">
        <button class="icon-btn mobile-only" data-action="drawer" title="Menu">${icon('menu')}</button>
        <span class="head-ico">${icon('bubble')}</span>
        <span class="head-txt"><b>${esc(ch.name)}</b><small>Bate-papo · ${activeServer()?.members.length || 0} online</small></span>
        <div class="spacer"></div>
        ${S.voice ? `<button class="head-pill" data-action="open-stage">${icon('volume')}<span class="pill-long">Voltar ao canal de voz</span><span class="pill-short">Voz</span></button>` : ''}
        <button class="icon-btn ${S.showMembers ? 'on' : ''}" data-action="toggle-members" title="Lista de membros">${icon('users')}</button>
      </header>
      <div class="messages" id="msgList"></div>
      <div class="composer" id="composer">
        <div class="tray hidden" id="tray"></div>
        <form class="composer-box" id="composerForm">
          <button type="button" class="icon-btn" data-action="attach" title="Anexar foto ou vídeo">${icon('paperclip')}</button>
          <input type="file" id="fileInput" accept="${ACCEPT}" multiple hidden />
          <input id="msgInput" maxlength="2000" placeholder="Mensagem para ${esc(ch.name)}…" autocomplete="off" spellcheck="true" enterkeyhint="send" />
          <button type="button" class="icon-btn emoji-btn" data-action="emoji" title="Emojis">${icon('smile')}</button>
          <button type="submit" class="icon-btn send-btn" title="Enviar">${icon('send')}</button>
        </form>
      </div>
      <div class="drop-hint"><div>${icon('paperclip')}<b>Solte para anexar</b><small>Fotos e vídeos</small></div></div>`;
    wireComposer(ch);
    if (!isMobile()) setTimeout(() => $('#msgInput')?.focus(), 0);
  }

  function renderMessages(channelId) {
    const box = $('#msgList');
    if (!box) return;
    const ch = channelById(channelId), srv = serverOfChannel(channelId);
    if (!ch || !srv) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const list = S.messages.get(channelId) || [];
    let html = ch.type === 'voice' ? `
      <div class="cc-welcome">${icon('chat')}<div><b>Chat da ${esc(ch.name)}</b>
        <small>Converse, mande fotos, vídeos, emojis e @menções sem sair da transmissão. Cada sala tem o seu chat.</small></div></div>` : `
      <div class="welcome">
        <div class="welcome-art">${logo()}</div>
        <h2>Boas-vindas ao<br>${esc(srv.name)}</h2>
        <p>Este é o começo do bate-papo <b>${esc(ch.name)}</b>. Chame a galera, entre numa sala de exibição e aperte <b>Tela</b> para transmitir.</p>
        <div class="welcome-cards">
          <button class="wcard" data-action="copy-invite"><span class="wc-ico c1">${icon('users')}</span><span>Convidar seus amigos</span>${icon('chevronR')}</button>
          <button class="wcard" data-action="join-first-voice"><span class="wc-ico c2">${icon('screenShare')}</span><span>Começar uma sessão de cinema</span>${icon('chevronR')}</button>
          <button class="wcard" data-action="focus-composer"><span class="wc-ico c3">${icon('chat')}</span><span>Enviar sua primeira mensagem</span>${icon('chevronR')}</button>
        </div>
      </div>`;
    let prev = null;
    const names = knownNames(channelId);
    for (const m of list) { html += messageHTML(m, prev, names); prev = m; }
    box.innerHTML = html;
    if (atBottom || list.at(-1)?.author.id === S.me.id) box.scrollTop = box.scrollHeight;
    if (!box._wired) {
      box._wired = true;
      box._stick = true;
      box.addEventListener('scroll', () => { box._stick = box.scrollHeight - box.scrollTop - box.clientHeight < 120; }, { passive: true });
      // mídia que carrega depois mantém o chat "grudado" no fim
      box.addEventListener('load', () => { if (box._stick) box.scrollTop = box.scrollHeight; }, true);
      box.addEventListener('loadedmetadata', () => { if (box._stick) box.scrollTop = box.scrollHeight; }, true);
      box.addEventListener('error', (e) => e.target.closest?.('.att')?.classList.add('gone'), true);
    }
  }

  function appendMessage(msg) {
    const box = $('#msgList');
    if (!box) return;
    const list = S.messages.get(msg.channelId) || [];
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    box.insertAdjacentHTML('beforeend', messageHTML(msg, list[list.length - 2], knownNames(msg.channelId)));
    if (atBottom || msg.author.id === S.me.id) box.scrollTop = box.scrollHeight;
  }

  /* -------------------------------- palco (voz) -------------------------------- */
  let stageObserver = null;
  function resetStage() {
    ambient(false);
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
          <div class="sh-left"><button class="icon-btn mobile-only" data-action="drawer" title="Menu">${icon('menu')}</button>${icon('volume', 'muted')}<b id="stageTitle"></b><span id="stageLive" class="sh-live"></span></div>
          <div class="sh-right">
            <span id="stageQuality"></span>
            <button class="icon-btn lights-btn" data-action="lights" title="Luzes de cinema (ambilight)">${icon('bulb')}<span>Luzes</span></button>
            <button class="icon-btn" data-action="layout" data-layout="grid" title="Grade">${icon('grid')}</button>
            <button class="icon-btn" data-action="layout" data-layout="focus" title="Foco na transmissão">${icon('focus')}</button>
            <button class="icon-btn" data-action="open-text" title="Ir para o bate-papo">${icon('bubble')}</button>
            <button class="icon-btn cc-btn" data-action="call-chat" title="Chat da sala">${icon('chat')}<span class="cc-badge" data-cc-badge></span></button>
          </div>
        </header>
        <div class="stage-body" id="stageBody">
          <div class="focus-main" id="focusMain"><canvas class="amb-glow" id="ambGlow" width="16" height="9" aria-hidden="true"></canvas></div>
          <div class="tiles" id="tiles"></div>
        </div>
        <div class="controls" id="controls"></div>
        <div class="cc-peek" id="ccPeek"></div>
        <div class="cc-back" data-action="call-chat"></div>
        <aside class="call-chat" id="callChat" aria-label="Chat da sala">
          <header class="cc-head">${icon('chat')}<span><b>Chat da sala</b><small id="ccName"></small></span>
            <button class="icon-btn" data-action="call-chat" title="Fechar chat">${icon('x')}</button></header>
          <div class="messages" id="msgList"></div>
          <div class="composer" id="composer">
            <div class="tray hidden" id="tray"></div>
            <form class="composer-box" id="composerForm">
              <button type="button" class="icon-btn" data-action="attach" title="Anexar foto ou vídeo">${icon('paperclip')}</button>
              <input type="file" id="fileInput" accept="${ACCEPT}" multiple hidden />
              <input id="msgInput" maxlength="2000" placeholder="Conversar na sala" autocomplete="off" spellcheck="true" enterkeyhint="send" />
              <button type="button" class="icon-btn emoji-btn" data-action="emoji" title="Emojis">${icon('smile')}</button>
              <button type="submit" class="icon-btn send-btn" title="Enviar">${icon('send')}</button>
            </form>
          </div>
          <div class="drop-hint"><div>${icon('paperclip')}<b>Solte para anexar</b><small>Fotos e vídeos</small></div></div>
        </aside>
      </div>`;
    stageObserver = new ResizeObserver(() => layoutTiles());
    stageObserver.observe($('#stageBody'));
    const vc = voiceChannel();
    if (vc) {
      $('#ccName').textContent = vc.name;
      $('#msgInput').placeholder = `Conversar na ${vc.name}`;
      wireComposer(vc);
      if (S.callOpen) setCallChat(true, { focus: false });
    }
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
      ${CAN_PIP ? `<button class="tile-pip" title="Janela flutuante (Picture-in-Picture)">${icon('pip')}</button>` : ''}
      <div class="tile-pipped">${icon('pip')}<span>Em janela flutuante</span></div>
      <div class="tile-prevoff">${icon('eyeOff')}<b>Você está transmitindo ao vivo</b><span>A prévia fica desligada para o seu PC rodar o filme/jogo liso.</span><em>Clique para ver a prévia</em></div>
      ${t.kind === 'screen' ? `<button class="tile-info" title="Estatísticas da transmissão">${icon('info')}</button><div class="tile-stats"></div>` : ''}
      ${t.kind === 'screen' && t.m.id === S.me?.id ? `<button class="tile-eye" title="Ocultar/mostrar minha prévia"></button>` : ''}
      <button class="tile-chat" title="Chat da sala">${icon('chat')}<span class="cc-badge" data-cc-badge></span></button>
      <button class="tile-fs" title="Tela cheia">${icon('maximize')}</button>`;
    el.addEventListener('click', (e) => {
      if (e.target.closest('.tile-stats')) return;
      if (el.classList.contains('preview-off') && e.target.closest('.tile-prevoff')) return toggleOwnPreview();
      if (e.target.closest('.tile-name')) { const r = e.target.closest('.tile-name').getBoundingClientRect(); return openProfile(t.m.id, r); }
      if (e.target.closest('.tile-info')) return toggleStats(t.key);
      if (e.target.closest('.tile-eye')) return toggleOwnPreview();
      if (e.target.closest('.tile-chat')) return setCallChat(!S.callOpen);
      if (e.target.closest('.tile-pip')) return togglePip(t.key);
      if (e.target.closest('.tile-fs')) return toggleFullscreen(el);
      if (el.classList.contains('pseudo-fs')) return;
      // celular: tocar no perfil de alguém abre o volume individual
      // celular: tocar no perfil de alguém abre o card de perfil (com o volume individual)
      if (isMobile() && t.kind === 'user') return openProfile(t.m.id, el.getBoundingClientRect());
      // espera um instante: se vier o 2º clique (duplo clique = tela cheia), não troca o foco
      clearTimeout(el._clickT);
      el._clickT = setTimeout(() => {
        S.layoutPinned = true;
        if (S.layout === 'focus' && S.focusKey === t.key) { S.layout = 'grid'; S.focusKey = null; }
        else { S.layout = 'focus'; S.focusKey = t.key; }
        updateStage();
      }, 230);
    });
    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('button, .tile-stats')) return;
      clearTimeout(el._clickT);
      toggleFullscreen(el);
    });
    return el;
  }

  function setHTML(el, html) { if (el._html !== html) { el.innerHTML = html; el._html = html; } }

  function updateTile(el, t) {
    const m = t.m, st = m.state || {}, isMe = m.id === S.me.id;
    // quem transmite pode ocultar a própria prévia: nada é desenhado, o envio continua igual
    const prevOff = isMe && t.kind === 'screen' && S.hideOwnPreview;
    const stream = prevOff ? null : t.kind === 'screen' ? S.voice.streamFor(m, 'screen') : st.camera ? S.voice.streamFor(m, 'cam') : null;
    el.classList.toggle('preview-off', prevOff);
    el.classList.toggle('show-stats', S.statsKey === t.key);
    const eye = $('.tile-eye', el);
    if (eye) setHTML(eye, `${icon(prevOff ? 'eye' : 'eyeOff')}<span>${prevOff ? 'Mostrar prévia' : 'Ocultar prévia'}</span>`);
    const v = $('video', el);
    if (v.srcObject !== stream) v.srcObject = stream;
    if (stream && v.paused) v.play().catch(() => {});
    el.classList.toggle('has-video', !!stream);
    el.classList.toggle('waiting', t.kind === 'screen' && !stream && !prevOff);
    el.classList.toggle('mirror', isMe && t.kind === 'user');
    el.classList.toggle('speaking', t.kind === 'user' && S.speaking.has(m.id));
    if (t.kind === 'user') el.dataset.user = m.id;
    el.dataset.volUser = m.id;
    el.classList.toggle('in-pip', S.pip?.key === t.key);
    el.style.setProperty('--tile-c', tileColor(m.name));
    const img = $('.tile-av img', el), src = avatarSrc(m);
    if (img._want !== src) { img._want = src; img.dataset.n = m.name; delete img.dataset.fb; img.src = src; }

    setHTML($('.tile-top', el), t.kind === 'screen'
      ? `<span class="live-pill">AO VIVO</span>${st.quality ? `<span class="q-pill">${esc(st.quality)}</span>` : ''}` : '');
    setHTML($('.tile-name', el), t.kind === 'screen'
      ? `${icon('screen')}<span>${esc(m.name)}${isMe ? ' (você)' : ''}</span>`
      : `${st.deafened ? icon('headOff', 'red') : st.muted ? icon('micOff', 'red') : ''}<span>${esc(m.name)}</span>${isMe ? '' : volBadge(m)}`);
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
    ambient(focused?.kind === 'screen');
    $('.lights-btn')?.classList.toggle('on', S.lights);
    $('.lights-btn')?.classList.toggle('hidden', !screens.length);

    const box = $('#tiles'), fm = $('#focusMain'), keep = new Set();
    for (const t of tiles) {
      keep.add(t.key);
      let el = S.tileEls.get(t.key);
      if (!el) { el = createTile(t); S.tileEls.set(t.key, el); }
      updateTile(el, t);
      if (t === focused && el.parentElement !== fm) { [...fm.children].forEach((c) => c.id !== 'ambGlow' && c.remove()); fm.appendChild(el); }
    }
    if (!focused) [...fm.children].forEach((c) => c.id !== 'ambGlow' && c.remove());
    tiles.filter((t) => t !== focused).forEach((t, i) => {
      const el = S.tileEls.get(t.key);
      if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
    });
    syncPip();
    for (const [k, el] of S.tileEls) if (!keep.has(k)) {
      if (el.classList.contains('pseudo-fs')) exitPseudoFs(); // transmissão acabou durante a tela cheia
      el.remove(); S.tileEls.delete(k);
    }
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
        ${CAN_SHARE ? `<button class="ctl share ${scr ? 'on' : ''}" data-action="toggle-screen" title="${scr ? 'Parar transmissão' : 'Compartilhar tela'}">${icon(scr ? 'screenStop' : 'screenShare')}</button>` : ''}
        <button class="ctl mic ${S.muted ? 'off' : ''}" data-action="toggle-mute" title="${S.muted ? 'Reativar microfone' : 'Silenciar'}">${icon(S.muted ? 'micOff' : 'mic')}</button>
        <button class="ctl ${S.deafened ? 'off-soft' : ''}" data-action="toggle-deafen" title="${S.deafened ? 'Reativar áudio' : 'Desativar áudio'}">${icon(S.deafened ? 'headOff' : 'headphones')}</button>
        <button class="ctl cc-btn ${S.callOpen ? 'on' : ''}" data-action="call-chat" title="Chat da sala">${icon('chat')}<span class="cc-badge" data-cc-badge></span></button>
        <button class="ctl hang" data-action="leave-voice" title="Desconectar">${icon('phoneOff')}</button>
      </div>
      <button class="ctl ghost fs" data-action="stage-fullscreen" title="Tela cheia">${icon('maximize')}</button>`);
    $('#stage').classList.toggle('chat-open', S.callOpen);
    renderCallBadges();
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

  /* Tela cheia no celular: o WebView do Android não expõe a Fullscreen API de forma confiável,
     então o tile ocupa a tela via CSS, gira para paisagem e esconde a barra de status. */
  function enterPseudoFs(el) {
    exitPseudoFs();
    el.classList.add('pseudo-fs');
    document.documentElement.classList.add('has-pseudo-fs');
    PLUG('ScreenOrientation')?.lock({ orientation: 'landscape' }).catch(() => {});
    PLUG('StatusBar')?.hide().catch(() => {});
  }
  function exitPseudoFs() {
    const el = $('.pseudo-fs');
    if (!el) return false;
    el.classList.remove('pseudo-fs');
    document.documentElement.classList.remove('has-pseudo-fs');
    PLUG('ScreenOrientation')?.unlock().catch(() => {});
    PLUG('StatusBar')?.show().catch(() => {});
    return true;
  }

  function toggleFullscreen(el) {
    if (IS_TOUCH || IS_NATIVE) {
      if (el.classList.contains('pseudo-fs')) exitPseudoFs();
      else if (el.classList.contains('tile')) enterPseudoFs(el);
      return;
    }
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    // PC: tela cheia é o PALCO, com o card escolhido em foco — assim o chat da sala,
    // os controles e a plateia continuam acessíveis dentro da tela cheia.
    const stage = $('#stage');
    if (el !== stage && el?.dataset?.key) { S.layout = 'focus'; S.focusKey = el.dataset.key; S.layoutPinned = true; updateStage(); }
    (stage || el).requestFullscreen?.().catch(() => {});
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
        getVolume: (id, kind) => { const m = memberIn(serverId, id); return m ? getVol(m, kind) : 1; },
        onChange: () => { if (S.view === 'voice') updateStage(); renderVoicePanel(); },
        onSpeaking: (set) => { S.speaking = set; applySpeaking(); },
      });
      S.voice = v; // antes do start(): sinais podem chegar logo após o join
      await v.start();
      if (v.micError) toast(window.isSecureContext ? 'Microfone indisponível — você entrou sem áudio.'
        : 'Sem microfone: o navegador só libera em HTTPS. Você pode assistir e ouvir normalmente.', 'err');
      S.view = 'voice';
      S.callUnread = 0;
      loadHistory(channelId); // o chat da sala já fica pronto, mesmo com o painel fechado
      keepAwake(true);
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

  /* Tela ligada durante a chamada (senão o Android apaga a tela no meio do filme). */
  let wakeSentinel = null;
  async function keepAwake(on) {
    S.wantAwake = on;
    const ka = PLUG('KeepAwake');
    try {
      if (ka) return on ? await ka.keepAwake() : await ka.allowSleep();
      if (on && !wakeSentinel && navigator.wakeLock) wakeSentinel = await navigator.wakeLock.request('screen');
      if (!on && wakeSentinel) { await wakeSentinel.release(); wakeSentinel = null; }
    } catch {}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.wantAwake) { wakeSentinel = null; keepAwake(true); }
  });

  function teardownVoice(render = true) {
    if (!S.voice) return;
    exitPseudoFs();
    exitPip();
    stopStats();
    S.callUnread = 0;
    keepAwake(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    S.voice.leave();
    S.voice = null;
    S.speaking = new Set();
    if (S.view === 'voice') S.view = 'text';
    sfx.leave();
    if (render) renderAll();
  }

  /** Bipe curto só para você (sai pelos seus fones; não vai para a sala). */
  function tones(freqs, { type = 'sine', gain = 0.075, gap = 0.085, dur = 0.07 } = {}) {
    try {
      sfxCtx ||= new AudioContext();
      if (sfxCtx.state === 'suspended') sfxCtx.resume();
      const t0 = sfxCtx.currentTime + 0.01;
      freqs.forEach((f, i) => {
        const o = sfxCtx.createOscillator(), g = sfxCtx.createGain(), t = t0 + i * gap;
        o.type = type;
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(sfxCtx.destination);
        o.start(t); o.stop(t + dur + 0.02);
      });
    } catch {}
  }
  const toggleSfx = {
    unmute: () => tones([587, 880]),                              // sobe: microfone ligado
    mute: () => tones([466, 311], { type: 'triangle' }),          // desce, mais grave
    undeafen: () => tones([392, 587, 784], { gap: 0.07 }),
    deafen: () => tones([523, 349, 233], { type: 'triangle', gap: 0.07 }),
  };

  function setMute(muted) {
    (muted ? toggleSfx.mute : toggleSfx.unmute)();
    S.muted = muted;
    if (!muted && S.deafened) S.deafened = false; // reativar mic também reativa o áudio
    LS.set('muted', S.muted); LS.set('deafened', S.deafened);
    S.voice?.setDeafened(S.deafened);
    S.voice?.setMuted(S.muted);
    renderUserPanel();
    if (S.view === 'voice') updateStage();
  }

  function setDeafen(deafened) {
    (deafened ? toggleSfx.deafen : toggleSfx.undeafen)();
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
    if (!CAN_SHARE) return toast('Transmitir tela está disponível no app de PC. No celular você assiste, fala e usa a câmera.');
    if (!S.voice) return toast('Entre em um canal de voz para transmitir.');
    if (S.voice.screen) { S.voice.stopScreen(); renderVoicePanel(); return; }
    openScreenPicker();
  }

  /** Seletor de tela do Cinecria: fontes (Electron), qualidade, otimização e áudio. */
  async function openScreenPicker() {
    const isEl = !!window.cinecria?.isElectron;
    const canAudio = isEl ? window.cinecria.platform === 'win32' : true;
    const presetKey = CFG.defaultScreenPreset; // sempre abre na recomendada (Nativa 60 FPS)
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
          <select id="shQ">${Object.entries(CFG.screenPresets).map(([k, p]) => `<option value="${k}" ${k === presetKey ? 'selected' : ''}>${p.label}</option>`).join('')}</select>
          <small class="rec-hint" id="shRec"><span class="rec-badge">★ Recomendado</span>resolução original da sua tela a 60 FPS: a melhor nitidez e fluidez</small></label>
        <label class="field"><span class="label">Otimizar para</span>
          <select id="shHint">
            <option value="motion" ${hint === 'motion' ? 'selected' : ''}>Fluidez — filmes, séries e jogos</option>
            <option value="detail" ${hint === 'detail' ? 'selected' : ''}>Nitidez — texto, código e slides</option>
          </select></label>
        <label class="check ${canAudio ? '' : 'disabled'}"><input type="checkbox" id="shAudio" ${wantAudio ? 'checked' : ''} ${canAudio ? '' : 'disabled'}>
          <span>Transmitir áudio do sistema${canAudio ? '' : ' (somente Windows)'}</span></label>
      </div>
      ${drmGuideHTML(isEl)}
      <div class="modal-foot">
        <span class="foot-note" id="shNote"></span>
        <button class="btn ghost" data-close>Cancelar</button>
        <button class="btn live" id="goLive" ${isEl ? 'disabled' : ''}>${icon('screenShare')}Entrar ao vivo</button>
      </div>`, { wide: true });

    const note = () => {
      const p = CFG.screenPresets[$('#shQ', modal).value];
      $('#shNote', modal).textContent = (S.gpuDisabled ? '⚠ Modo compatibilidade ligado: a GPU do Cinecria está desligada e 1080p/1440p vão travar. ' : '')
        + `Upload estimado: até ~${Math.round((p.bitrate * viewers) / 1e6)} Mbps para ${viewers} espectador${viewers > 1 ? 'es' : ''}`;
      $('#shNote', modal).classList.toggle('warn', S.gpuDisabled);
    };
    const rec = () => $('#shRec', modal).classList.toggle('hidden', $('#shQ', modal).value !== CFG.recommendedScreenPreset);
    $('#shQ', modal).addEventListener('change', () => { note(); rec(); });
    note(); rec();
    wireDrmGuide(modal, isEl);

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
        // janela de navegador ou de streaming → o guia se abre sozinho
        const src = sources.find((x) => x.id === chosen);
        const risky = src && STREAMING_RE.test(src.name);
        $('#drmBox', modal).classList.toggle('flag', !!risky);
        if (risky) $('#drmBox', modal).open = true;
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
    if (activeServer()?.isPublic) return toast('Não é permitido criar ou editar salas nos servidores públicos oficiais do Cinecria.', 'err');
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
        <button class="avatar-big" type="button" title="Trocar foto"><img alt=""><span class="av-edit">Trocar</span></button>
        <div class="avatar-side">
          <span class="label">Foto de perfil</span>
          <div class="presets"></div>
          ${AV_ACTIONS_HTML}
          <input type="file" class="av-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
        </div>
      </div>
      <label class="field"><span class="label">Apelido</span><input id="pfName" maxlength="32" value="${esc(S.me.name)}"><small class="field-err" id="pfErr"></small></label>
      <p class="hint srv-line">${icon('lock')}Conectado a <b>${esc(new URL(profile.serverUrl).host)}</b></p>
      <div class="modal-foot"><button class="btn danger-ghost" id="pfOut">${icon('logout')}Sair</button><div class="spacer"></div><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="pfSave">Salvar</button></div>`);
    const picker = setupAvatarPicker($('#pfAvatar', m), $('#pfName', m), profile);
    $('#pfName', m).addEventListener('input', () => { $('#pfName', m).classList.remove('invalid'); $('#pfErr', m).textContent = ''; m.querySelector('.name-alert')?.remove(); });
    $('#pfSave', m).addEventListener('click', async () => {
      const name = $('#pfName', m).value.trim();
      if (!name) return toast('O apelido não pode ficar vazio.', 'err');
      const btn = $('#pfSave', m);
      btn.disabled = true; btn.textContent = 'Salvando…';
      const avatar = picker.value();
      const res = await req('profile:update', { name, avatar });
      btn.disabled = false; btn.textContent = 'Salvar';
      if (res.error) {
        if (isNameTaken(res)) return nameAlert(m, $('#pfName', m), name);
        return toast(res.message || res.error, 'err');
      }
      Object.assign(profile, picker.state(), { name });
      saveProfile();
      S.avatarData = avatar;
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
      openMenu(el, srv.isPublic ? [
        { label: `Copiar convite (${srv.invite})`, icon: 'copy', run: () => copyInvite(srv) },
      ] : [
        { label: `Copiar convite (${srv.invite})`, icon: 'copy', run: () => copyInvite(srv) },
        { label: 'Criar canal de texto', icon: 'hash', run: () => createChannelModal('text') },
        { label: 'Criar sala de exibição', icon: 'volume', run: () => createChannelModal('voice') },
        '-', { label: 'Sair do servidor', icon: 'logout', danger: true, run: () => leaveServer(srv) },
      ]);
    },
    'toggle-mute': () => setMute(!S.muted),
    'toggle-deafen': () => setDeafen(!S.deafened),
    'toggle-camera': toggleCamera,
    'toggle-screen': toggleScreen,
    'leave-voice': () => teardownVoice(),
    'open-stage': () => { closeDrawer(); if (S.voice) { S.view = 'voice'; renderAll(); } },
    drawer: () => toggleDrawer(),
    'open-text': () => { if (S.voice) S.activeServerId = S.voice.serverId; S.view = 'text'; renderAll(); },
    layout: (el) => { S.layoutPinned = true; S.layout = el.dataset.layout; if (S.layout === 'grid') S.focusKey = null; updateStage(); },
    'stage-fullscreen': () => toggleFullscreen($('#stage')),
    'toggle-members': () => {
      if (isMobile()) { closeDrawer(); document.documentElement.classList.toggle('members-open'); return; }
      S.showMembers = !S.showMembers; LS.set('showMembers', S.showMembers); renderMembers(); $('[data-action=toggle-members]')?.classList.toggle('on', S.showMembers); },
    'focus-composer': () => $('#msgInput')?.focus(),
    'join-first-voice': () => {
      const srv = activeServer();
      const ch = srv?.channels.find((c) => c.type === 'voice');
      if (ch) joinVoice(srv.id, ch.id);
    },
    profile: profileModal,
    attach: () => $('#fileInput')?.click(),
    'call-chat': () => setCallChat(!S.callOpen),
    lights: () => toggleLights(),
    emoji: () => toggleEmoji(),
    lightbox: (el) => openLightbox(el.dataset.src),
    'unstage': (el) => unstage(el.dataset.id),
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

    const pf = e.target.closest('[data-profile]');
    if (pf && S.me) {
      e.preventDefault();
      openProfile(pf.dataset.profile, pf.getBoundingClientRect(), pf.dataset.pname ? { name: pf.dataset.pname, avatar: pf.dataset.pav || null } : null);
      return;
    }

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
      closeDrawer();
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
    if (e.key === 'Escape') { if (!closePopovers() && $('#modalRoot').children.length) closeModal(); }
    if (!S.me || !(e.ctrlKey && e.shiftKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'm') { e.preventDefault(); setMute(!S.muted); }
    if (k === 'd') { e.preventDefault(); setDeafen(!S.deafened); }
  });

  window.addEventListener('beforeunload', () => S.voice?.leave());

  /* ======================= volume individual (local) ======================= */
  // Chave = apelido: o id muda a cada conexão, o apelido costuma ficar.
  const volOf = (m) => S.volumes[m.name] || {};
  function getVol(m, kind) {
    const v = volOf(m);
    if (v.muted) return 0;
    return kind === 'stream' ? (v.stream ?? 1) : (v.voice ?? 1);
  }
  function setVol(m, patch) {
    const v = { ...volOf(m), ...patch };
    if ((v.voice ?? 1) === 1 && (v.stream ?? 1) === 1 && !v.muted) delete S.volumes[m.name];
    else S.volumes[m.name] = v;
    LS.set('volumes', S.volumes);
    S.voice?.applyVolumes();
    renderSidebar();
    if (S.view === 'voice') updateStage();
  }
  function volBadge(m) {
    const v = volOf(m);
    if (v.muted) return `<span class="vol-badge off" title="Silenciado só para você">${icon('volX')}</span>`;
    if ((v.voice ?? 1) !== 1) return `<span class="vol-badge" title="Volume só para você">${Math.round(v.voice * 100)}%</span>`;
    return '';
  }
  function findMember(id) {
    for (const srv of S.servers.values()) { const m = srv.members.find((x) => x.id === id); if (m) return m; }
    return null;
  }

  function closeVolMenu() {
    const p = $('.vol-pop');
    $('.vol-back')?.remove();
    if (!p) return false;
    p.remove();
    return true;
  }

  function openVolumeMenu(userId, x, y) {
    const m = findMember(userId);
    if (!m || !S.me) return;
    closeVolMenu(); closeMenu(); closeEmoji();
    S.volOpenedAt = Date.now();
    if (m.id === S.me.id) return toast('Esse é você — use os botões de microfone e áudio.');
    const inCall = !!S.voice && m.voice?.channelId === S.voice.channelId;
    const v = volOf(m);
    const slider = (kind, label, ic, val) => `
      <div class="vol-row">
        <div class="vol-label">${icon(ic)}<span>${label}</span><output data-out="${kind}">${Math.round(val * 100)}%</output></div>
        <input type="range" class="vol-range" data-kind="${kind}" min="0" max="200" step="5" value="${Math.round(val * 100)}" style="--p:${val * 50}%" aria-label="${label}">
        <div class="vol-scale"><span>0</span><span>100%</span><span>200%</span></div>
      </div>`;
    const pop = document.createElement('div');
    pop.className = 'vol-pop';
    pop.setAttribute('role', 'dialog');
    pop.innerHTML = `
      <div class="vol-head">${avatar(m, 'md')}<div><b>${esc(m.name)}</b><small>${inCall ? 'Só você ouve essa mudança' : 'Vale quando vocês estiverem na mesma sala'}</small></div></div>
      ${slider('voice', 'Voz', 'mic', v.voice ?? 1)}
      ${m.state?.screen || v.stream != null ? slider('stream', 'Transmissão', 'screen', v.stream ?? 1) : ''}
      <div class="vol-actions">
        <button class="vol-btn ${v.muted ? 'on' : ''}" data-vol="mute">${icon(v.muted ? 'volX' : 'vol')}<span>${v.muted ? 'Silenciado para você' : 'Silenciar para mim'}</span></button>
        <button class="vol-btn" data-vol="reset" title="Voltar a 100%">${icon('reset')}<span>100%</span></button>
      </div>`;
    if (isMobile()) {
      const back = document.createElement('div');
      back.className = 'vol-back';
      back.addEventListener('click', closeVolMenu);
      document.body.appendChild(back);
      pop.classList.add('sheet');
    }
    document.body.appendChild(pop);
    if (!isMobile()) {
      const r = pop.getBoundingClientRect();
      pop.style.left = Math.max(12, Math.min(x, innerWidth - r.width - 12)) + 'px';
      pop.style.top = Math.max(12, Math.min(y, innerHeight - r.height - 12)) + 'px';
    }
    pop.addEventListener('input', (e) => {
      const r = e.target.closest('.vol-range');
      if (!r) return;
      let val = Number(r.value);
      if (Math.abs(val - 100) <= 5) { val = 100; r.value = 100; } // "ímã" nos 100%
      r.style.setProperty('--p', val / 2 + '%');
      $(`[data-out=${r.dataset.kind}]`, pop).textContent = val + '%';
      setVol(m, { [r.dataset.kind]: val / 100, muted: false });
      const mb = $('[data-vol=mute]', pop);
      mb.classList.remove('on');
      mb.innerHTML = `${icon('vol')}<span>Silenciar para mim</span>`;
    });
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-vol]');
      if (!b) return;
      if (b.dataset.vol === 'mute') setVol(m, { muted: !volOf(m).muted });
      else setVol(m, { voice: 1, stream: 1, muted: false });
      openVolumeMenu(userId, parseFloat(pop.style.left) || x, parseFloat(pop.style.top) || y); // redesenha
    });
    setTimeout(() => document.addEventListener('pointerdown', function h(ev) {
      if (!document.body.contains(pop)) return document.removeEventListener('pointerdown', h, true);
      if (!pop.contains(ev.target)) { closeVolMenu(); document.removeEventListener('pointerdown', h, true); }
    }, true), 0);
  }

  // PC: botão direito  ·  celular: pressionar e segurar
  document.addEventListener('contextmenu', (e) => {
    const u = e.target.closest('[data-vol-user]');
    if (!u || !S.me) return;
    e.preventDefault();
    if (Date.now() - (S.volOpenedAt || 0) < 700) return;
    openVolumeMenu(u.dataset.volUser, e.clientX, e.clientY);
  });
  let press = null;
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const u = e.target.closest('[data-vol-user]');
    if (!u || !S.me) return;
    const p0 = { x: e.clientX, y: e.clientY };
    press = {
      ...p0,
      t: setTimeout(() => {
        press = null;
        if (Date.now() - (S.volOpenedAt || 0) < 700) return;
        S.suppressClickUntil = Date.now() + 650;
        navigator.vibrate?.(12);
        openVolumeMenu(u.dataset.volUser, p0.x, p0.y);
      }, 480),
    };
  }, { passive: true });
  const cancelPress = (e) => {
    if (!press) return;
    if (e.type === 'pointermove' && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 10) return;
    clearTimeout(press.t);
    press = null;
  };
  ['pointermove', 'pointerup', 'pointercancel'].forEach((t) => document.addEventListener(t, cancelPress, { passive: true }));
  // o "click" que vem depois de um long-press não deve trocar o foco do palco
  document.addEventListener('click', (e) => {
    if (Date.now() < (S.suppressClickUntil || 0)) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  /* ============================== chat avançado ============================== */
  const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime';
  const KIND_OF = (type) => (/^image\/(png|jpeg|gif|webp)$/.test(type) ? 'image' : /^video\/(mp4|webm|quicktime)$/.test(type) ? 'video' : null);
  const mediaUrl = (id) => `${profile.serverUrl}/media/${id}`;
  const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const isJumbo = (t) => {
    if (!t || t.length > 40) return false;
    const rest = t.replace(/[\p{Extended_Pictographic}‍️\u{1F3FB}-\u{1F3FF}\s]/gu, '');
    return !rest && /\p{Extended_Pictographic}/u.test(t);
  };

  function attachmentHTML(a) {
    const url = esc(mediaUrl(a.id));
    let style = '';
    if (a.w && a.h) {
      const k = Math.min(1, 420 / a.w, 340 / a.h);
      style = `width:${Math.max(120, Math.round(a.w * k))}px;aspect-ratio:${a.w}/${a.h}`;
    }
    if (a.kind === 'image') {
      return `<button class="att att-img" style="${style}" data-action="lightbox" data-src="${url}" title="${esc(a.name)}">
        <img src="${url}" alt="${esc(a.name)}" loading="lazy" draggable="false"><span class="att-gone">Arquivo expirado</span></button>`;
    }
    return `<div class="att att-vid" style="${style}"><video src="${url}" controls preload="metadata" playsinline></video>
      <span class="att-gone">Vídeo expirado</span></div>
      <div class="att-meta">${icon('film')}<span>${esc(a.name)}</span><small>${fmtSize(a.size)}</small></div>`;
  }

  function messageHTML(m, prev, names = []) {
    const grouped = prev && prev.author.id === m.author.id && m.ts - prev.ts < 5 * 60e3;
    const time = new Date(m.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const body = (m.text ? `<div class="body ${isJumbo(m.text) ? 'jumbo' : ''}">${richText(m.text, names)}</div>` : '')
      + (m.attachment ? attachmentHTML(m.attachment) : '');
    const ping = m.author.id !== S.me?.id && mentionsMe(m.text) ? ' mentioned' : '';
    const mine = m.author.id === S.me?.id || (S.me && m.author.name === S.me.name) ? ' mine' : '';
    if (grouped) return `<div class="msg cont${ping}${mine}"><span class="ts-side">${time}</span><div class="msg-main">${body}</div></div>`;
    const pf = `data-profile="${esc(m.author.id)}" data-pname="${esc(m.author.name)}" data-pav="${esc(m.author.avatar || '')}"`;
    return `<div class="msg${ping}${mine}"><span class="msg-av" ${pf}>${avatar(m.author, 'md')}</span><div class="msg-main">
      <div class="meta"><b class="msg-name" ${pf} style="color:${nameColor(m.author.name)}">${esc(m.author.name)}</b><span class="ts">${fmtTime(m.ts)}</span></div>
      ${body}</div></div>`;
  }

  /* ---- anexos: seleção, colar, arrastar ---- */
  function mediaDims(item) {
    return new Promise((resolve) => {
      const done = (w, h) => { item.w = w || 0; item.h = h || 0; resolve(); };
      if (item.kind === 'image') {
        const img = new Image();
        img.onload = () => done(img.naturalWidth, img.naturalHeight);
        img.onerror = () => done();
        img.src = item.url;
      } else {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.muted = true;
        v.onloadedmetadata = () => done(v.videoWidth, v.videoHeight);
        v.onerror = () => done();
        v.src = item.url;
      }
    });
  }

  async function addFiles(files) {
    for (const file of [...files]) {
      if (S.staged.length >= 10) { toast('No máximo 10 anexos por vez.', 'err'); break; }
      const kind = KIND_OF(file.type);
      if (!kind) { toast(`"${file.name}" não é uma foto ou vídeo suportado.`, 'err'); continue; }
      const maxMB = kind === 'image' ? CFG.maxImageMB : CFG.maxVideoMB;
      if (file.size > maxMB * 1048576) { toast(`"${file.name}" passa de ${maxMB} MB.`, 'err'); continue; }
      const item = { id: Math.random().toString(36).slice(2), file, kind, url: URL.createObjectURL(file), progress: 0 };
      S.staged.push(item);
      renderTray();
      mediaDims(item);
    }
    if (!isMobile()) $('#msgInput')?.focus();
  }

  function unstage(id) {
    const i = S.staged.findIndex((x) => x.id === id);
    if (i < 0 || S.staged[i].uploading) return;
    URL.revokeObjectURL(S.staged[i].url);
    S.staged.splice(i, 1);
    renderTray();
  }

  function renderTray() {
    const tray = $('#tray');
    if (!tray) return;
    tray.classList.toggle('hidden', !S.staged.length);
    tray.innerHTML = S.staged.map((it) => `
      <div class="tray-item ${it.uploading ? 'busy' : ''} ${it.error ? 'error' : ''}" data-tray="${it.id}">
        <div class="tray-thumb">${it.kind === 'image' ? `<img src="${it.url}" alt="">` : `<video src="${it.url}" muted preload="metadata"></video><span class="tray-kind">${icon('film')}</span>`}</div>
        <div class="tray-name"><span>${esc(it.file.name)}</span><small>${it.error ? esc(it.error) : fmtSize(it.file.size)}</small></div>
        <div class="tray-bar"><i style="width:${Math.round(it.progress * 100)}%"></i></div>
        ${it.uploading ? '' : `<button type="button" class="tray-x" data-action="unstage" data-id="${it.id}" title="Remover">${icon('x')}</button>`}
      </div>`).join('');
  }
  const trayProgress = (it) => {
    const bar = $(`[data-tray="${it.id}"] .tray-bar i`);
    if (bar) bar.style.width = Math.round(it.progress * 100) + '%';
  };

  function uploadFile(item) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${profile.serverUrl}/upload`);
      xhr.setRequestHeader('Content-Type', item.file.type);
      xhr.setRequestHeader('X-Cinecria-Token', S.token || '');
      xhr.setRequestHeader('X-File-Name', encodeURIComponent(item.file.name));
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) { item.progress = e.loaded / e.total; trayProgress(item); } };
      xhr.onload = () => {
        let j = {};
        try { j = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status === 200 && j.id) resolve(j);
        else reject(new Error(j.error || `Falha no envio (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Falha de rede no envio.'));
      xhr.send(item.file);
    });
  }

  async function sendComposer(ch) {
    const input = $('#msgInput');
    const text = input.value.trim();
    const items = S.staged.filter((x) => !x.uploading);
    if (!text && !items.length) return;
    input.value = '';
    closeEmoji();
    if (!items.length) { S.socket.emit('chat:send', { channelId: ch.id, text }); return; }

    let captionSent = false;
    for (const it of items) {
      it.uploading = true; it.error = null; it.progress = 0;
      renderTray();
      try {
        const up = await uploadFile(it);
        S.socket.emit('chat:send', { channelId: ch.id, text: captionSent ? '' : text, attachment: { id: up.id, w: it.w, h: it.h } });
        captionSent = true;
        URL.revokeObjectURL(it.url);
        S.staged = S.staged.filter((x) => x !== it);
      } catch (e) {
        it.uploading = false;
        it.error = e.message;
        toast(`"${it.file.name}": ${e.message}`, 'err');
      }
      renderTray();
    }
    if (!captionSent && text) S.socket.emit('chat:send', { channelId: ch.id, text });
  }

  function wireComposer(ch) {
    S.composerChannel = ch.id;
    renderTray();
    $('#composerForm').addEventListener('submit', (e) => { e.preventDefault(); sendComposer(ch); });
    $('#fileInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
    $('#msgInput').addEventListener('paste', (e) => {
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); addFiles(files); }
    });
    wireMentions($('#msgInput'));
    const main = $('#main');
    let depth = 0;
    const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
    main.ondragenter = (e) => { if (!hasFiles(e)) return; depth++; main.classList.add('dragging'); };
    main.ondragleave = () => { if (--depth <= 0) { depth = 0; main.classList.remove('dragging'); } };
    main.ondragover = (e) => { if (hasFiles(e)) e.preventDefault(); };
    main.ondrop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      main.classList.remove('dragging');
      if (S.view === 'voice' && !S.callOpen) setCallChat(true);
      addFiles(e.dataTransfer.files);
    };
  }

  /* ---- seletor de emojis ---- */
  const EMOJI = [
    ['🎬', 'Cinema', '🎬 🍿 🎥 📽️ 🎞️ 🎟️ 🎫 📺 🎮 🕹️ 🎧 🎤 🎵 🎶 🎭 🌟 ⭐ 🏆 🥇 👑 👽 🤖 👻 🧟 🧛 🦖 🐉 🚀 🛸 🌌 🌙 🔥 💥 ⚡ 🎃 🍕 🍔 🌭 🍟 🥤 🧃 🍫 🍩 🍭 🍪 🧋 🍻'],
    ['😀', 'Carinhas', '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😮‍💨 😌 😔 😪 🤤 😴 😷 🤒 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 🥹 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 💀 🤡 💩'],
    ['👍', 'Gestos', '👍 👎 👏 🙌 👐 🤝 🙏 ✌️ 🤞 🫰 🤟 🤘 👌 🤌 🤏 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 🤙 💪 🫶 👀 🧠 🫡 🫠 🤷 🤦 🙋 🙆 🙅 💃 🕺'],
    ['❤️', 'Corações', '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💯 ✨ 💫 🎉 🎊 🎈 🎁 ✅ ❌ ❓ ❗ 💤 💬 🔔'],
  ].map(([ico, name, list]) => ({ ico, name, list: list.split(' ') }));

  function closeEmoji() { const p = $('.emoji-pop'); if (!p) return false; p.remove(); return true; }
  function toggleEmoji() {
    if (closeEmoji()) return;
    const recent = LS.get('emojiRecent', []);
    const cats = recent.length ? [{ ico: '🕘', name: 'Recentes', list: recent }, ...EMOJI] : EMOJI;
    const pop = document.createElement('div');
    pop.className = 'emoji-pop';
    pop.innerHTML = `
      <div class="emoji-tabs">${cats.map((c, i) => `<button type="button" class="emoji-tab ${i === 0 ? 'on' : ''}" data-cat="${i}" title="${c.name}">${c.ico}</button>`).join('')}</div>
      <div class="emoji-title">${cats[0].name}</div>
      <div class="emoji-grid"></div>`;
    const grid = $('.emoji-grid', pop);
    const show = (i) => {
      grid.innerHTML = cats[i].list.map((e) => `<button type="button" class="emo" data-emo="${e}">${e}</button>`).join('');
      $('.emoji-title', pop).textContent = cats[i].name;
      $$('.emoji-tab', pop).forEach((b) => b.classList.toggle('on', Number(b.dataset.cat) === i));
      grid.scrollTop = 0;
    };
    pop.addEventListener('click', (e) => {
      const tab = e.target.closest('[data-cat]');
      if (tab) return show(Number(tab.dataset.cat));
      const emo = e.target.closest('[data-emo]');
      if (!emo) return;
      const input = $('#msgInput');
      const a = input.selectionStart ?? input.value.length, b = input.selectionEnd ?? a;
      input.setRangeText(emo.dataset.emo, a, b, 'end');
      if (!isMobile()) input.focus();
      LS.set('emojiRecent', [emo.dataset.emo, ...LS.get('emojiRecent', []).filter((x) => x !== emo.dataset.emo)].slice(0, 32));
    });
    $('#composer').appendChild(pop);
    show(0);
    setTimeout(() => document.addEventListener('pointerdown', function h(ev) {
      if (!document.body.contains(pop)) return document.removeEventListener('pointerdown', h, true);
      if (!pop.contains(ev.target) && !ev.target.closest('.emoji-btn')) { closeEmoji(); document.removeEventListener('pointerdown', h, true); }
    }, true), 0);
  }

  /* ---- visualizador de imagens ---- */
  function closeLightbox() { const l = $('.lightbox'); if (!l) return false; l.remove(); return true; }
  function openLightbox(src) {
    closeLightbox();
    const l = document.createElement('div');
    l.className = 'lightbox';
    l.innerHTML = `<img src="${esc(src)}" alt="">
      <div class="lb-bar"><a class="lb-btn" href="${esc(src)}" target="_blank" rel="noopener">${icon('external')}Abrir original</a>
      <button class="lb-btn" type="button">${icon('x')}Fechar</button></div>`;
    l.addEventListener('click', (e) => { if (!e.target.closest('a')) closeLightbox(); });
    document.body.appendChild(l);
  }

  const closePopovers = () => closeGifPicker() || closeProfile() || closeMentions() || closeVolMenu() || closeEmoji() || closeLightbox();

  /* ================================ menções ================================ */
  // "@Bia Ramos" — nomes podem ter espaços, então a menção é reconhecida contra a lista de nomes conhecidos.
  const norm = (t) => String(t || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reCache = new Map();
  function mentionRe(names, flags = 'giu') {
    const list = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
    if (!list.length) return null;
    const key = flags + '|' + list.join('\u0001');
    let re = reCache.get(key);
    if (!re) {
      // não precedido nem seguido de letra/número: "a@b.com" e "@Theodoro" não viram menção a "Theo"
      re = new RegExp(`(?<![\\p{L}\\p{N}_])@(${list.map(escRe).join('|')})(?![\\p{L}\\p{N}_])`, flags);
      if (reCache.size > 50) reCache.clear();
      reCache.set(key, re);
    }
    re.lastIndex = 0;
    return re;
  }
  const mentionsMe = (text) => !!(text && S.me && mentionRe([S.me.name], 'iu')?.test(text));

  /** Nomes que podem ser mencionados num canal: membros do servidor + autores do histórico. */
  function knownNames(channelId) {
    const names = new Set();
    const srv = [...S.servers.values()].find((x) => x.channels.some((c) => c.id === channelId)) || activeServer();
    srv?.members.forEach((m) => names.add(m.name));
    (S.messages.get(channelId) || []).forEach((m) => names.add(m.author.name));
    if (S.me) names.add(S.me.name);
    return [...names];
  }
  function serverOfChannel(id) {
    for (const srv of S.servers.values()) if (srv.channels.some((c) => c.id === id)) return srv;
    return null;
  }
  function channelById(id) {
    for (const srv of S.servers.values()) { const c = srv.channels.find((x) => x.id === id); if (c) return c; }
    return null;
  }

  /** Texto da mensagem → HTML seguro com links e menções destacadas. */
  const URL_SPLIT = /(https?:\/\/[^\s<]+)/g;
  function richText(text, names) {
    const re = mentionRe(names);
    const myName = S.me ? norm(S.me.name) : '';
    return String(text).split(URL_SPLIT).map((part, i) => {
      if (i % 2) return `<a href="${esc(part)}" target="_blank" rel="noopener noreferrer">${esc(part)}</a>`;
      if (!re) return esc(part);
      let out = '', last = 0;
      for (const m of part.matchAll(re)) {
        out += esc(part.slice(last, m.index));
        out += `<span class="mention ${norm(m[1]) === myName ? 'me' : ''}">@${esc(m[1])}</span>`;
        last = m.index + m[0].length;
      }
      return out + esc(part.slice(last));
    }).join('');
  }

  let lastDing = 0;
  /** "Plim" de duas notas, gerado na hora (sem arquivo de áudio). */
  function mentionDing() {
    if (S.deafened || Date.now() - lastDing < 1200) return;
    lastDing = Date.now();
    try {
      sfxCtx ||= new AudioContext();
      const t0 = sfxCtx.currentTime;
      [[987.8, 0], [1318.5, 0.09]].forEach(([f, d]) => {
        const o = sfxCtx.createOscillator(), g = sfxCtx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(0.11, t0 + d + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.32);
        o.connect(g).connect(sfxCtx.destination);
        o.start(t0 + d);
        o.stop(t0 + d + 0.35);
      });
    } catch {}
  }

  /* ---- autocomplete ---- */
  const MP = { items: [], sel: 0, open: false };
  function mentionQuery(input) {
    const pos = input.selectionStart ?? input.value.length;
    if (pos !== (input.selectionEnd ?? pos)) return null;
    const before = input.value.slice(0, pos);
    const at = before.lastIndexOf('@');
    if (at < 0) return null;
    if (at > 0 && /[\p{L}\p{N}_]/u.test(before[at - 1])) return null; // e-mail
    const q = before.slice(at + 1);
    if (q.length > 32) return null;
    return { start: at, end: pos, q };
  }
  function mentionCandidates(q) {
    const srv = serverOfChannel(S.composerChannel) || activeServer();
    if (!srv) return [];
    const nq = norm(q);
    const seen = new Set(), pre = [], mid = [];
    for (const m of srv.members) {
      if (m.id === S.me?.id || seen.has(norm(m.name))) continue;
      seen.add(norm(m.name));
      const n = norm(m.name);
      if (n.startsWith(nq)) pre.push(m);
      else if (nq && n.split(/\s+/).some((w) => w.startsWith(nq))) mid.push(m);
    }
    const rank = (m) => (m.voice ? 0 : 1);
    pre.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
    return [...pre, ...mid].slice(0, 8);
  }
  function closeMentions() {
    const p = $('.mention-pop');
    MP.open = false;
    if (!p) return false;
    p.remove();
    return true;
  }
  function renderMentions(input) {
    const q = mentionQuery(input);
    const items = q ? mentionCandidates(q.q) : [];
    if (!q || !items.length) return closeMentions();
    closeEmoji();
    MP.items = items;
    MP.sel = Math.min(MP.sel, items.length - 1);
    MP.open = true;
    let pop = $('.mention-pop');
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'mention-pop';
      pop.setAttribute('role', 'listbox');
      // pointerdown + preventDefault: o input não perde o foco ao clicar na lista
      pop.addEventListener('pointerdown', (e) => e.preventDefault());
      pop.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mi]');
        if (b) completeMention(input, MP.items[Number(b.dataset.mi)]);
      });
      $('#composer').appendChild(pop);
    }
    const hl = (name) => {
      const n = norm(name), i = q.q ? n.indexOf(norm(q.q)) : -1;
      if (i < 0) return esc(name);
      return esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + q.q.length)) + '</mark>' + esc(name.slice(i + q.q.length));
    };
    pop.innerHTML = `<div class="mention-title">Membros ${q.q ? `com “${esc(q.q)}”` : 'do servidor'}</div>` + items.map((m, i) => {
      const vc = m.voice && channelById(m.voice.channelId);
      const sub = m.state?.screen ? 'transmitindo agora' : vc ? `em ${vc.name}` : 'online';
      return `<button type="button" class="mention-item ${i === MP.sel ? 'sel' : ''}" data-mi="${i}" role="option" aria-selected="${i === MP.sel}">
        ${avatar(m, 'sm')}<span class="mi-name"><b>${hl(m.name)}</b><small>${esc(sub)}</small></span>${i === MP.sel ? '<kbd>Tab</kbd>' : ''}</button>`;
    }).join('');
    $('.mention-item.sel', pop)?.scrollIntoView({ block: 'nearest' });
  }
  function completeMention(input, m) {
    const q = mentionQuery(input);
    if (!q || !m) return closeMentions();
    const after = input.value.slice(q.end);
    const ins = '@' + m.name + (after.startsWith(' ') ? '' : ' ');
    input.setRangeText(ins, q.start, q.end, 'end');
    if (after.startsWith(' ')) input.setSelectionRange(input.selectionStart + 1, input.selectionStart + 1);
    closeMentions();
    input.focus();
  }
  function wireMentions(input) {
    MP.sel = 0;
    input.addEventListener('input', () => { MP.sel = 0; renderMentions(input); });
    input.addEventListener('click', () => renderMentions(input));
    input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) closeMentions(); }, 120));
    input.addEventListener('keydown', (e) => {
      if (!MP.open || e.isComposing) return;
      const n = MP.items.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        MP.sel = (MP.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        renderMentions(input);
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault(); // Enter completa o nome em vez de enviar a mensagem
        completeMention(input, MP.items[MP.sel]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeMentions();
      }
    });
  }

  /* ========================= Picture-in-Picture (PC) ========================= */
  // Um <video> próprio, fora dos cards: assim a janela flutuante não fecha quando a grade
  // se reorganiza (o Chrome encerra o PiP se o elemento sair do DOM).
  let pipEl = null;
  function pipSink() {
    if (pipEl) return pipEl;
    pipEl = document.createElement('video');
    pipEl.className = 'pip-sink';
    pipEl.muted = true;           // o áudio já toca pelos <audio> de cada participante
    pipEl.playsInline = true;
    pipEl.autoplay = true;
    pipEl.setAttribute('aria-hidden', 'true');
    pipEl.addEventListener('leavepictureinpicture', () => {
      S.pip = null;
      pipEl.srcObject = null;
      if (S.view === 'voice') updateStage();
    });
    document.body.appendChild(pipEl);
    return pipEl;
  }
  function pipStreamFor(key) {
    if (!S.voice || !key) return null;
    const [kind, id] = [key.slice(0, 1), key.slice(2)];
    const m = voiceMembers().find((x) => x.id === id);
    if (!m) return null;
    if (kind === 's') return m.state?.screen ? S.voice.streamFor(m, 'screen') : null;
    return m.state?.camera ? S.voice.streamFor(m, 'cam') : null;
  }
  async function togglePip(key) {
    if (!CAN_PIP) return;
    const v = pipSink();
    try {
      if (document.pictureInPictureElement === v && S.pip?.key === key) { await document.exitPictureInPicture(); return; }
      const stream = pipStreamFor(key);
      if (!stream) return toast('Esse vídeo ainda está conectando.');
      if (v.srcObject !== stream) v.srcObject = stream;
      if (v.readyState < 1) await new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); setTimeout(r, 1500); });
      v.play().catch(() => {});
      await v.requestPictureInPicture();
      S.pip = { key };
    } catch (e) {
      S.pip = null;
      toast('Não foi possível abrir a janela flutuante: ' + (e.message || e.name), 'err');
    }
    if (S.view === 'voice') updateStage();
  }
  /** Mantém o PiP ligado ao vídeo certo; fecha se a câmera/transmissão acabar. */
  function syncPip() {
    if (!S.pip || !pipEl) return;
    const s = pipStreamFor(S.pip.key);
    if (!s) return exitPip();
    if (pipEl.srcObject !== s) { pipEl.srcObject = s; pipEl.play().catch(() => {}); }
  }
  function exitPip() {
    if (pipEl && document.pictureInPictureElement === pipEl) document.exitPictureInPicture().catch(() => {});
    S.pip = null;
  }

  /* ============== tela preta em streamings (Netflix, Prime, Disney+…) ============== */
  const STREAMING_RE = /chrome|edge|brave|opera|vivaldi|firefox|navegador|netflix|prime video|disney|\bmax\b|hbo|globoplay|crunchyroll|paramount|star\+|apple tv/i;
  const BROWSERS = [
    { name: 'Chrome', url: 'chrome://settings/system' },
    { name: 'Edge', url: 'edge://settings/system' },
    { name: 'Brave', url: 'brave://settings/system' },
  ];
  function drmGuideHTML(isEl) {
    return `
      <details class="drm" id="drmBox">
        <summary class="drm-sum">${icon('alert')}<span><b>Tela preta na Netflix, Prime Video ou Disney+?</b><small>Corrija em 1 minuto no navegador que toca o filme</small></span><span class="drm-cta">Corrigir</span>${icon('chevron')}</summary>
        <div class="drm-body">
          <p>Esses serviços usam DRM, que bloqueia a captura quando o navegador decodifica o vídeo pela placa de vídeo. Seus amigos veem tudo, menos o filme. A correção é <b>desligar a aceleração de hardware no navegador</b>, não no Cinecria.</p>
          <ol class="drm-steps">
            <li><span>Copie o endereço do seu navegador e cole na barra de endereço <b>dele</b>:</span>
              <div class="drm-chips">${BROWSERS.map((b) => `<button type="button" class="drm-chip" data-copy="${b.url}"><b>${b.name}</b><code>${b.url}</code><span class="drm-copy">${icon('copy')}</span></button>`).join('')}</div>
              <small class="drm-ff"><b>Firefox:</b> Configurações → Geral → Desempenho → desmarque “Usar configurações de desempenho recomendadas” e “Usar aceleração de hardware quando disponível”.</small></li>
            <li><span>Desligue <b>“Usar aceleração de hardware quando disponível”</b> (Chrome/Brave) ou <b>“Usar aceleração gráfica quando disponível”</b> (Edge) e clique em <b>Reiniciar</b>.</span></li>
            <li><span>Volte aqui e transmita a <b>janela do navegador</b>${isEl ? ' (aba “Janelas e jogos”)' : ''}. Depois da sessão, pode religar a opção.</span></li>
          </ol>
          <p class="drm-note">${icon('alert')}Os apps da Microsoft Store (Netflix, Disney+ e Prime para Windows) sempre ficam pretos na captura. Use o site no navegador.</p>
          ${isEl ? `
          <div class="drm-compat">
            <div><b>A imagem fica preta dentro do próprio Cinecria?</b><small>Raro, e diferente do problema acima: alguns drivers de vídeo não exibem os vídeos dos amigos. O modo compatibilidade desliga a aceleração de hardware do Cinecria (usa mais CPU) e reinicia o app.</small></div>
            <button type="button" class="btn ghost sm" id="compatBtn" disabled>…</button>
          </div>` : ''}
        </div>
      </details>`;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    try {
      const ta = Object.assign(document.createElement('textarea'), { value: text });
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch { return false; }
  }
  async function wireDrmGuide(modal, isEl) {
    const box = $('#drmBox', modal);
    box.addEventListener('click', async (e) => {
      const chip = e.target.closest('[data-copy]');
      if (!chip) return;
      const ok = await copyText(chip.dataset.copy);
      chip.classList.add(ok ? 'copied' : 'fail');
      $('.drm-copy', chip).innerHTML = ok ? `${icon('check')}Copiado` : 'Copie manualmente';
      setTimeout(() => { chip.classList.remove('copied', 'fail'); $('.drm-copy', chip).innerHTML = icon('copy'); }, 1800);
    });
    if (!isEl || !window.cinecria.getSettings) return;
    const btn = $('#compatBtn', modal);
    let st = {};
    try { st = await window.cinecria.getSettings(); } catch {}
    const label = () => (st.compatVideo ? 'Desativar modo compatibilidade' : 'Ativar modo compatibilidade');
    btn.textContent = label();
    btn.disabled = false;
    let armed = false;
    btn.addEventListener('click', () => {
      if (!armed) { // 2 cliques: reiniciar derruba a chamada
        armed = true;
        btn.textContent = 'Reiniciar o Cinecria agora?';
        btn.classList.add('armed');
        setTimeout(() => { armed = false; btn.textContent = label(); btn.classList.remove('armed'); }, 4000);
        return;
      }
      teardownVoice(false);
      window.cinecria.setCompatVideo(!st.compatVideo);
    });
  }

  /* ============================ chat da sala (call) ============================ */
  function renderCallBadges() {
    const n = S.callUnread;
    $$('[data-cc-badge]').forEach((b) => { b.textContent = n > 99 ? '99+' : n ? String(n) : ''; b.classList.toggle('on', n > 0); });
    $$('.cc-btn').forEach((b) => b.classList.toggle('on', S.callOpen));
  }
  function setCallChat(open, { focus = true } = {}) {
    S.callOpen = open;
    LS.set('callChatOpen', open);
    const st = $('#stage');
    if (!st || !S.voice) return;
    st.classList.toggle('chat-open', open);
    if (open) {
      S.callUnread = 0;
      if (S.mentions.delete(S.voice.channelId)) { renderRail(); renderSidebar(); }
      $$('.cc-peek-item').forEach((e) => e.remove());
      renderMessages(S.voice.channelId);
      loadHistory(S.voice.channelId);
      const box = $('#msgList');
      if (box) box.scrollTop = box.scrollHeight;
      if (focus && !isMobile()) setTimeout(() => $('#msgInput')?.focus(), 240);
    } else {
      closeMentions(); closeEmoji();
      $('#msgInput')?.blur();
    }
    renderCallBadges();
    setTimeout(layoutTiles, 260); // depois da animação do painel
  }

  /** Balão rápido da mensagem nova quando o chat da sala está fechado (inclusive em tela cheia). */
  function peekMessage(msg) {
    const box = $('#ccPeek');
    if (!box || S.callOpen) return;
    const a = msg.attachment;
    const text = msg.text ? richText(msg.text.length > 140 ? msg.text.slice(0, 140) + '…' : msg.text, knownNames(msg.channelId))
      : a ? (a.kind === 'image' ? '📷 enviou uma foto' : '🎬 enviou um vídeo') : '';
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'cc-peek-item' + (mentionsMe(msg.text) ? ' mentioned' : '');
    el.dataset.action = 'call-chat';
    el.innerHTML = `${avatar(msg.author, 'sm')}<span><b style="color:${nameColor(msg.author.name)}">${esc(msg.author.name)}</b><span class="pk-text">${text}</span></span>`;
    box.appendChild(el);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 6000);
  }

  /* ============================ prévia e estatísticas ============================ */
  function toggleOwnPreview() {
    S.hideOwnPreview = !S.hideOwnPreview;
    LS.set('hideOwnPreview', S.hideOwnPreview);
    toast(S.hideOwnPreview ? 'Prévia desligada — sua transmissão continua normal para todos.' : 'Prévia ligada (usa mais GPU/CPU enquanto você transmite).');
    updateStage();
  }

  let statsTimer = null;
  function stopStats() { clearInterval(statsTimer); statsTimer = null; S.statsKey = null; }
  function toggleStats(key) {
    const open = S.statsKey !== key;
    stopStats();
    if (open) { S.statsKey = key; pollStats(); statsTimer = setInterval(pollStats, 1000); }
    if (S.view === 'voice') updateStage();
  }
  const fmtMbps = (b) => (b == null ? '—' : (b / 1e6).toFixed(1).replace('.', ',') + ' Mbps');
  const fmtRes = (w, h) => (w && h ? `${w}×${h}` : '—');
  function hwLabel(flag, impl) {
    if (flag === true) return 'hardware';
    if (flag === false) return 'software';
    if (/External|MediaFoundation|NVENC|AMF|QSV|D3D|DXVA|VideoToolbox|MediaCodec|V4L2|VAAPI/i.test(impl)) return 'hardware';
    if (/libvpx|OpenH264|libaom|dav1d|FFmpeg/i.test(impl)) return 'software';
    return impl || '?';
  }
  const LIMIT = { none: ['nenhum', ''], cpu: ['CPU', 'bad'], bandwidth: ['rede', 'bad'], other: ['outro', 'bad'] };
  async function pollStats() {
    const key = S.statsKey;
    const el = key && S.tileEls.get(key);
    if (!S.voice || !el) return stopStats();
    const m = voiceMembers().find((x) => x.id === key.slice(2));
    if (!m) return stopStats();
    let st = null;
    try { st = await S.voice.videoStats(m, key[0] === 's' ? 'screen' : 'cam'); } catch {}
    const box = $('.tile-stats', el);
    if (!box || S.statsKey !== key) return;
    const row = (k, v, cls = '') => `<div class="st-row"><span>${k}</span><b class="${cls}">${v}</b></div>`;
    if (!st || (st.dir === 'out' && !st.rows.length)) {
      box.innerHTML = `<div class="st-title">${icon('info')}Estatísticas</div><div class="st-empty">${st?.dir === 'out' ? 'Ninguém está assistindo ainda.' : 'Aguardando vídeo…'}</div>`;
      return;
    }
    if (st.dir === 'in') {
      const hw = hwLabel(st.hw, st.impl);
      box.innerHTML = `<div class="st-title">${icon('info')}Recebendo</div>`
        + row('Resolução', fmtRes(st.w, st.h)) + row('FPS', st.fps != null ? Math.round(st.fps) : '—')
        + row('Bitrate', fmtMbps(st.bps)) + row('Codec', `${esc(st.codec)} · ${esc(hw)}`, hw === 'software' ? 'warn' : '')
        + row('Atraso do buffer', st.buffer != null ? Math.round(st.buffer) + ' ms' : '—', st.buffer > 150 ? 'warn' : '')
        + row('Ping', st.rtt != null ? Math.round(st.rtt) + ' ms' : '—')
        + row('Perdas / quadros perdidos', `${st.lost ?? 0} / ${st.dropped ?? 0}`);
      return;
    }
    box.innerHTML = `<div class="st-title">${icon('info')}Enviando para ${st.rows.length} pessoa${st.rows.length > 1 ? 's' : ''}</div>` + st.rows.map((r) => {
      const [lim, cls] = LIMIT[r.limit] || [r.limit, 'bad'];
      const hw = hwLabel(r.hw, r.impl);
      return `<div class="st-peer"><div class="st-name">${esc(memberIn(S.voice.serverId, r.peer)?.name || '?')}</div>`
        + row('Resolução · FPS', `${fmtRes(r.w, r.h)} · ${r.fps != null ? Math.round(r.fps) : '—'}`)
        + row('Bitrate', fmtMbps(r.bps)) + row('Encoder', `${esc(r.codec)} · ${esc(hw)}`, hw === 'software' ? 'warn' : '')
        + row('Limitado por', lim, cls) + '</div>';
    }).join('') + (st.rows.some((r) => r.limit === 'cpu') ? '<div class="st-tip">Limitado por CPU: baixe para 1080p ou confira se o modo compatibilidade (GPU desligada) está ativo.</div>'
      : st.rows.some((r) => r.limit === 'bandwidth') ? '<div class="st-tip">Limitado pela rede: seu upload não dá conta. Baixe a qualidade ou o número de espectadores.</div>' : '');
  }

  /** Faixa de alerta quando o modo compatibilidade (GPU desligada) está ativo. */
  function gpuBanner() {
    if ($('.gpu-banner') || !window.cinecria?.setCompatVideo) return;
    const b = document.createElement('div');
    b.className = 'gpu-banner';
    b.innerHTML = `${icon('alert')}<span><b>Modo compatibilidade ligado:</b> a GPU do Cinecria está desligada. Transmissões em 1080p/1440p vão ficar borradas e travando.</span>
      <button class="btn sm" type="button" data-gpu="fix">Religar GPU e reiniciar</button><button class="icon-btn" type="button" data-gpu="x" title="Fechar">${icon('x')}</button>`;
    let armed = false;
    b.addEventListener('click', (e) => {
      const t = e.target.closest('[data-gpu]');
      if (!t) return;
      if (t.dataset.gpu === 'x') return b.remove();
      if (!armed) { armed = true; t.textContent = 'Confirmar: reiniciar agora'; t.classList.add('armed'); return; }
      teardownVoice(false);
      window.cinecria.setCompatVideo(false);
    });
    document.body.appendChild(b);
  }

  /* ==================== Luzes de cinema (ambilight) ==================== */
  // O vídeo em foco é desenhado num canvas de 16×9 px a ~8 FPS; o CSS amplia e desfoca na GPU.
  // Sem getImageData (nada de ler pixels de volta para a CPU). Pausa com a janela escondida.
  let ambTimer = null, ambOn = false;
  function ambient(on) {
    ambOn = !!on && S.lights;
    const st = $('#stage');
    st?.classList.toggle('lights-off', ambOn);
    document.documentElement.classList.toggle('cinema-dim', ambOn);
    if (!ambOn || document.hidden) { clearInterval(ambTimer); ambTimer = null; return; }
    if (ambTimer) return;
    ambTimer = setInterval(() => {
      const c = $('#ambGlow'), v = $('#focusMain .tile.has-video video');
      if (!c || !$('#stage')) return ambient(false);
      if (!v || v.readyState < 2) return;
      try { c.getContext('2d').drawImage(v, 0, 0, 16, 9); } catch {}
    }, CFG.ambilight?.intervalMs || 120);
  }
  document.addEventListener('visibilitychange', () => { if (S.view === 'voice') ambient($('#stage')?.classList.contains('is-focus') && $('#focusMain .tile.screen')); });
  function toggleLights() {
    S.lights = !S.lights;
    LS.set('ambilight', S.lights);
    toast(S.lights ? 'Luzes de cinema: ligadas' : 'Luzes de cinema: desligadas');
    if (S.view === 'voice') updateStage();
  }

  /* ============================== perfil dos usuários ============================== */
  function closeProfile() { const p = $('.pf-pop'); $('.pf-back')?.remove(); if (!p) return false; p.remove(); return true; }
  const hm = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  function since(ts) {
    const min = Math.round((Date.now() - ts) / 60e3);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    return `há ${h} h${min % 60 ? ` ${min % 60} min` : ''}`;
  }
  function openProfile(id, rect, offline = null) {
    closeProfile(); closeVolMenu(); closeMenu();
    const m = findMember(id) || (offline && { id, name: offline.name, avatar: offline.avatar, offline: true });
    if (!m) return;
    const isMe = m.id === S.me?.id;
    const st = m.state || {};
    const vc = m.voice && channelById(m.voice.channelId);
    const sameCall = !!S.voice && m.voice?.channelId === S.voice.channelId;
    const h = hue(m.name);
    const rows = [];
    if (m.offline) rows.push(`<span class="pf-row off">${icon('door')}<span>Offline agora</span></span>`);
    else rows.push(`<span class="pf-row ok"><i class="pf-dot"></i><span>Online${m.since ? ` · entrou às ${hm(m.since)} (${since(m.since)})` : ''}</span></span>`);
    if (vc) rows.push(`<span class="pf-row">${icon('volume')}<span>Em chamada na <b>${esc(vc.name)}</b>${m.voiceSince ? ` · desde ${hm(m.voiceSince)}` : ''}</span></span>`);
    if (st.screen) rows.push(`<span class="pf-row live">${icon('screen')}<span>Transmitindo a tela${st.quality ? ` · ${esc(st.quality)}` : ''}</span></span>`);
    if (st.camera) rows.push(`<span class="pf-row">${icon('camera')}<span>Câmera ligada</span></span>`);
    if (vc && st.deafened) rows.push(`<span class="pf-row bad">${icon('headOff')}<span>Áudio desativado</span></span>`);
    else if (vc && st.muted) rows.push(`<span class="pf-row bad">${icon('micOff')}<span>Microfone mutado</span></span>`);
    const v = !isMe && volOf(m);
    if (v && (v.muted || (v.voice ?? 1) !== 1)) rows.push(`<span class="pf-row">${icon('vol')}<span>Volume para você: ${v.muted ? 'silenciado' : Math.round(v.voice * 100) + '%'}</span></span>`);

    const pop = document.createElement('div');
    pop.className = 'pf-pop';
    pop.setAttribute('role', 'dialog');
    pop.style.setProperty('--h1', h);
    pop.style.setProperty('--h2', (h + 50) % 360);
    pop.innerHTML = `
      <div class="pf-banner"></div>
      <div class="pf-av ${S.speaking.has(m.id) ? 'speaking' : ''}"><img src="${esc(avatarSrc(m))}" data-n="${esc(m.name)}" alt=""></div>
      <div class="pf-body">
        <div class="pf-name"><b>${esc(m.name)}</b>${isMe ? '<span class="pf-you">você</span>' : ''}</div>
        <div class="pf-rows">${rows.join('')}</div>
        <div class="pf-actions">
          ${isMe ? `<button class="btn primary sm" data-pf="edit">${icon('gear')}Editar perfil</button>`
            : `<button class="btn primary sm" data-pf="mention" ${m.offline ? '' : ''}>${icon('at')}Mencionar no chat</button>
               ${sameCall ? `<button class="btn ghost sm" data-pf="vol">${icon('vol')}Volume</button>` : ''}`}
        </div>
      </div>`;
    if (isMobile()) {
      const back = document.createElement('div');
      back.className = 'pf-back';
      back.addEventListener('click', closeProfile);
      document.body.appendChild(back);
      pop.classList.add('sheet');
    }
    document.body.appendChild(pop);
    if (!isMobile() && rect) {
      const r = pop.getBoundingClientRect();
      let x = rect.right + 10, y = rect.top;
      if (x + r.width > innerWidth - 12) x = rect.left - r.width - 10;           // não cabe à direita → esquerda
      if (x < 12) x = Math.min(innerWidth - r.width - 12, Math.max(12, rect.left)); // nem à esquerda → embaixo
      pop.style.left = x + 'px';
      pop.style.top = Math.max(12, Math.min(y, innerHeight - r.height - 12)) + 'px';
    }
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-pf]');
      if (!b) return;
      const act = b.dataset.pf;
      closeProfile();
      if (act === 'edit') return profileModal();
      if (act === 'mention') return insertMention(m.name);
      if (act === 'vol') { const r = b.getBoundingClientRect(); return openVolumeMenu(m.id, r.left, r.top); }
    });
    setTimeout(() => document.addEventListener('pointerdown', function h(ev) {
      if (!document.body.contains(pop)) return document.removeEventListener('pointerdown', h, true);
      if (!pop.contains(ev.target) && !ev.target.closest('.pf-back')) { closeProfile(); document.removeEventListener('pointerdown', h, true); }
    }, true), 0);
  }
  /** "@nome " no campo de mensagem visível (chat do canal ou chat da sala). */
  function insertMention(name) {
    if (S.view === 'voice' && S.voice && !S.callOpen) setCallChat(true, { focus: false });
    if (S.view !== 'voice' && !$('#msgInput')) { S.view = 'text'; renderAll(); }
    const input = $('#msgInput');
    if (!input) return;
    const ins = '@' + name + ' ';
    const pos = input.selectionStart ?? input.value.length;
    const pre = input.value.slice(0, pos);
    input.setRangeText((pre && !/\s$/.test(pre) ? ' ' : '') + ins, pos, input.selectionEnd ?? pos, 'end');
    setTimeout(() => input.focus(), 60);
  }

  /* ============================ gaveta (mobile) ============================ */
  const root = document.documentElement;
  function openDrawer() { root.classList.remove('members-open'); root.classList.add('drawer-open'); }
  function closeDrawer() { root.classList.remove('drawer-open'); }
  function toggleDrawer() { root.classList.contains('drawer-open') ? closeDrawer() : openDrawer(); }
  $('#drawerBack').addEventListener('click', () => { closeDrawer(); root.classList.remove('members-open'); });

  // Gestos: arrastar da borda esquerda abre; arrastar para a esquerda fecha.
  let touch0 = null;
  document.addEventListener('touchstart', (e) => {
    if (!isMobile() || $('.pseudo-fs') || $('#modalRoot').children.length) return;
    const t = e.touches[0];
    touch0 = { x: t.clientX, y: t.clientY, edge: t.clientX < 28 };
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (!touch0) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch0.x, dy = Math.abs(t.clientY - touch0.y);
    if (dy < 60) {
      if (touch0.edge && dx > 60) openDrawer();
      else if (root.classList.contains('drawer-open') && dx < -60) closeDrawer();
    }
    touch0 = null;
  }, { passive: true });
  matchMedia('(max-width: 820px), (max-height: 520px) and (pointer: coarse)').addEventListener('change', () => { closeDrawer(); root.classList.remove('members-open'); layoutTiles(); });

  if (IS_NATIVE) {
    PLUG('StatusBar')?.setBackgroundColor({ color: '#0c0c14' }).catch(() => {});
    PLUG('StatusBar')?.setStyle({ style: 'DARK' }).catch(() => {});
    // Botão "voltar" do Android: fecha a camada mais de cima antes de sair.
    PLUG('App')?.addListener('backButton', () => {
      if (closePopovers()) return;
      if ($('#modalRoot').children.length) return closeModal();
      if (exitPseudoFs()) return;
      if ($('.menu')) return closeMenu();
      if (root.classList.contains('members-open')) return root.classList.remove('members-open');
      if (root.classList.contains('drawer-open')) return closeDrawer();
      if (S.me && S.view === 'voice') { S.view = 'text'; return renderAll(); }
      if (S.me) return openDrawer();
      PLUG('App').minimizeApp();
    });
  }

  initLogin();
})();

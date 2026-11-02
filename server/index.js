/**
 * Cinecria — Servidor de sinalização
 * ------------------------------------------------------------
 * Responsável por:
 *  - Sessões anônimas (apelido + avatar, sem cadastro)
 *  - Servidores, canais de texto/voz e códigos de convite
 *  - Chat em tempo real (histórico em memória)
 *  - Presença nos canais de voz + estado (mic, câmera, tela ao vivo)
 *  - Relay de sinalização WebRTC (SDP/ICE) entre participantes
 *  - Upload de fotos e vídeos do chat (POST /upload, GET /media/:id)
 *  - Avatares (inclusive GIF animado) servidos por link: GET /avatar/:key
 *
 * A mídia NÃO passa por aqui: áudio/vídeo/tela trafegam P2P (mesh).
 * Para salas grandes, troque o mesh por um SFU (ver README).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT) || 3001;
const MAX_VOICE_USERS = Number(process.env.MAX_VOICE_USERS) || 10; // mesh P2P: mantenha baixo
const HISTORY_LIMIT = 200;
const MB = 1024 * 1024;
const MAX_IMAGE = (Number(process.env.MAX_IMAGE_MB) || 15) * MB;
const MAX_VIDEO = (Number(process.env.MAX_VIDEO_MB) || 100) * MB;
const MAX_UPLOAD_TOTAL = (Number(process.env.MAX_UPLOAD_TOTAL_MB) || 2048) * MB; // acima disso, apaga os mais antigos
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'));
const MEDIA_TYPES = {
  'image/png': 'image', 'image/jpeg': 'image', 'image/gif': 'image', 'image/webp': 'image',
  'video/mp4': 'video', 'video/webm': 'video', 'video/quicktime': 'video',
};

const app = express();
// Serve o cliente web (mesma UI do app desktop) — útil para testar em 2 abas do navegador.
app.use(express.static(path.join(__dirname, '..', 'app', 'renderer')));
// CORS: o app Electron (file://) e o Android (https://localhost) consultam estas rotas.
app.use(['/health', '/avatar'], (_req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });
app.get('/health', (_req, res) => res.json({ app: 'cinecria-server', ok: true }));
// Chaves das APIs de GIF definidas no Render (Environment → KLIPY_API_KEY / GIPHY_API_KEY).
// São chaves de CLIENTE: GIPHY e KLIPY exigem que a busca saia do app do usuário, então elas
// chegam ao navegador de qualquer forma — assim dá para trocar a chave sem gerar outro .exe.
app.use('/api/client-config', (_req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); });
app.get('/api/client-config', (_req, res) => res.json({
  gif: { klipyKey: process.env.KLIPY_API_KEY || '', giphyKey: process.env.GIPHY_API_KEY || '' },
}));

/* ------------------------------ Avatares ------------------------------ */
// O avatar NÃO vai dentro das atualizações de presença: um GIF de 2 MB repetido a cada
// "fulano mutou" para cada membro derrubaria a sala. Ele fica aqui e circula como "/avatar/<hash>".
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;            // arquivo (GIF animado incluso)
const MAX_AVATAR_DATAURL = 2_900_000;                // base64 de 2 MB ≈ 2,8 milhões de caracteres
const AVATAR_CACHE_BYTES = (Number(process.env.AVATAR_CACHE_MB) || 200) * 1024 * 1024;
/** @type {Map<string, { mime: string, buf: Buffer }>} */ const avatars = new Map();
let avatarBytes = 0;
// GIF escolhido na busca: só links HTTPS dos CDNs de GIF (GIPHY, KLIPY, Tenor antigo).
const REMOTE_AVATAR_HOST = /(^|\.)(giphy\.com|klipy\.com|klipycdn\.com|tenor\.com)$/i;

/** Valida e normaliza o avatar enviado. Retorna o valor a guardar, null (padrão) ou undefined (inválido). */
function normalizeAvatar(a) {
  if (a === null) return null;
  if (typeof a !== 'string') return undefined;
  const m = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(a);
  if (m) {
    if (a.length > MAX_AVATAR_DATAURL) return undefined;
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length || buf.length > MAX_AVATAR_BYTES) return undefined;
    const mime = 'image/' + (m[1] === 'jpg' ? 'jpeg' : m[1]);
    const key = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32);
    if (avatars.has(key)) avatars.delete(key); // reinsere = "usado recentemente"
    else avatarBytes += buf.length;
    avatars.set(key, { mime, buf });
    for (const [k, v] of avatars) { // cache limitado: sai o mais antigo
      if (avatarBytes <= AVATAR_CACHE_BYTES) break;
      if (k === key) continue;
      avatars.delete(k);
      avatarBytes -= v.buf.length;
    }
    return `/avatar/${key}`;
  }
  // GIF escolhido na busca: guarda só o link HTTPS
  if (a.length > 600) return undefined;
  try {
    const u = new URL(a);
    if (u.protocol === 'https:' && REMOTE_AVATAR_HOST.test(u.hostname) && !u.username && !u.password) return u.href;
  } catch {}
  return undefined;
}

app.get('/avatar/:key', (req, res) => {
  const av = avatars.get(req.params.key);
  if (!av) return res.status(404).end();
  res.set({
    'Content-Type': av.mime,
    'Cache-Control': 'public, max-age=31536000, immutable', // a chave é o hash do conteúdo
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });
  res.end(av.buf);
});

/* ------------------------------ Mídia do chat ------------------------------ */
// Os arquivos vivem em disco só enquanto o servidor roda (o histórico do chat também é em memória).
fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
/** @type {Map<string, any>} */ const uploads = new Map(); // id -> { id, owner, kind, mime, size, name, file, ts }
/** @type {Map<string, string>} */ const tokens = new Map(); // token de upload -> userId
let uploadBytes = 0;

function dropUpload(id) {
  const u = uploads.get(id);
  if (!u) return;
  uploads.delete(id);
  uploadBytes -= u.size;
  fs.rm(u.file, { force: true }, () => {});
}

// CORS: o app Electron (file://) e o Android (https://localhost) falam com este servidor.
app.use(['/upload', '/media'], (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Cinecria-Token, X-File-Name');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.post('/upload', (req, res) => {
  const fail = (code, error) => {
    if (res.headersSent) return;
    res.set('Connection', 'close').status(code).json({ error });
    res.on('finish', () => req.destroy());
  };
  const user = users.get(tokens.get(req.get('x-cinecria-token') || ''));
  if (!user) return fail(401, 'Sessão inválida — entre novamente.');

  const now = Date.now();
  user.uploadTimes = (user.uploadTimes || []).filter((t) => now - t < 60_000);
  if (user.uploadTimes.length >= 12) return fail(429, 'Muitos envios seguidos — espere um pouco.');

  const mime = String(req.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const kind = MEDIA_TYPES[mime];
  if (!kind) return fail(415, 'Formato não suportado. Envie imagens (PNG, JPG, GIF, WebP) ou vídeos (MP4, WebM, MOV).');
  const max = kind === 'image' ? MAX_IMAGE : MAX_VIDEO;
  const tooBig = `Arquivo grande demais (máx. ${Math.round(max / MB)} MB para ${kind === 'image' ? 'imagens' : 'vídeos'}).`;
  if (Number(req.get('content-length') || 0) > max) return fail(413, tooBig);

  user.uploadTimes.push(now);
  const id = crypto.randomBytes(12).toString('hex');
  const file = path.join(UPLOAD_DIR, id);
  const out = fs.createWriteStream(file);
  let size = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > max && !aborted) {
      aborted = true;
      req.unpipe(out);
      out.destroy();
      fs.rm(file, { force: true }, () => {});
      fail(413, tooBig);
    }
  });
  req.on('aborted', () => { aborted = true; out.destroy(); fs.rm(file, { force: true }, () => {}); });
  out.on('error', () => { if (!aborted) { aborted = true; fail(500, 'Falha ao salvar o arquivo.'); } });
  out.on('finish', () => {
    if (aborted) return;
    if (!size) { fs.rm(file, { force: true }, () => {}); return fail(400, 'Arquivo vazio.'); }
    let name = 'arquivo';
    try { name = decodeURIComponent(req.get('x-file-name') || name); } catch {}
    const meta = { id, owner: user.id, kind, mime, size, name: name.replace(/[\r\n]/g, '').slice(0, 120), file, ts: Date.now() };
    uploads.set(id, meta);
    uploadBytes += size;
    for (const old of uploads.keys()) { // cota total: remove os mais antigos
      if (uploadBytes <= MAX_UPLOAD_TOTAL) break;
      if (old !== id) dropUpload(old);
    }
    res.json({ id, kind, mime, size, name: meta.name });
  });
  req.pipe(out);
});

app.get('/media/:id', (req, res) => {
  const meta = uploads.get(req.params.id);
  if (!meta) return res.status(404).json({ error: 'Arquivo expirado ou inexistente.' });
  res.set({
    'Content-Type': meta.mime,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(meta.name)}`,
  });
  res.sendFile(meta.file); // suporta Range → vídeos com seek/streaming
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  maxHttpBufferSize: 3.2e6, // cabe um avatar GIF de 2 MB em base64 + o resto do "hello"
});

/* ------------------------------ Estado em memória ------------------------------ */
const uid = () => crypto.randomBytes(6).toString('hex');
const COLORS = ['#7b61ff', '#f2545b', '#23a55a', '#f0b232', '#3ba7ff', '#eb459e', '#00b8a9', '#ff7a45'];

/** @type {Map<string, any>} */ const servers = new Map();   // serverId -> server
/** @type {Map<string, string>} */ const invites = new Map(); // código -> serverId
/** @type {Map<string, any[]>} */ const history = new Map();  // channelId -> mensagens
/** @type {Map<string, any>} */ const users = new Map();      // socketId -> usuário

function newInvite() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from(crypto.randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
  } while (invites.has(code));
  return code;
}

function createServer({ name, isPublic = false, ownerId = null, channels }) {
  const s = {
    id: uid(),
    name: String(name).trim().slice(0, 40) || 'Servidor',
    color: COLORS[servers.size % COLORS.length],
    invite: newInvite(),
    isPublic,
    ownerId,
    channels: (channels || [
      { name: 'geral', type: 'text' },
      { name: 'links', type: 'text' },
      { name: 'Cine 1', type: 'voice' },
      { name: 'Cine 2', type: 'voice' },
      { name: 'Jogatina', type: 'voice' },
    ]).map((c) => ({ id: uid(), ...c })),
    members: new Set(),
  };
  servers.set(s.id, s);
  invites.set(s.invite, s.id);
  return s;
}

// Servidores públicos: todo mundo entra automaticamente.
createServer({
  name: 'Cinecria Lobby',
  isPublic: true,
  channels: [
    { name: 'boas-vindas', type: 'text' },
    { name: 'geral', type: 'text' },
    { name: 'indicações', type: 'text' },
    { name: 'Sala de Cinema', type: 'voice' },
    { name: 'Sessão da Tarde', type: 'voice' },
    { name: 'Jogatina', type: 'voice' },
    { name: 'Terror da Madrugada', type: 'voice' },
    { name: 'Clube do Anime', type: 'voice' },
    { name: 'Pipoca & Série', type: 'voice' },
    { name: 'Papear / Barzinho', type: 'voice' },
    { name: 'Corujão VIP', type: 'voice' },
  ],
});
createServer({ name: 'Maratona de Séries', isPublic: true });

const defaultState = () => ({
  muted: false, deafened: false, camera: false, screen: false,
  micStreamId: null, camStreamId: null, screenStreamId: null, quality: null,
});

const publicUser = (u) => ({ id: u.id, name: u.name, avatar: u.avatar, voice: u.voice, state: u.state, since: u.since, voiceSince: u.voiceSince || null });

/* ------------------------------ Apelidos únicos ------------------------------ */
// "DVD", "dvd" e " dvd " são o mesmo apelido (sem diferenciar maiúsculas, acentos e espaços).
const nameKey = (n) => String(n).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const NAME_TAKEN = 'Este apelido já está em uso por outra pessoa online. Escolha outro!';
/** Quem está online com esse apelido (exceto `exceptId`). */
function nameOwner(name, exceptId) {
  const k = nameKey(name);
  for (const u of users.values()) if (u.id !== exceptId && nameKey(u.name) === k) return u;
  return null;
}

function snapshot(s) {
  return {
    id: s.id, name: s.name, color: s.color, invite: s.invite, isPublic: s.isPublic, ownerId: s.ownerId,
    channels: s.channels,
    members: [...s.members].map((id) => users.get(id)).filter(Boolean).map(publicUser),
  };
}

const broadcastServer = (s) => s && io.to(`srv:${s.id}`).emit('server:update', snapshot(s));

function findChannel(channelId) {
  for (const s of servers.values()) {
    const ch = s.channels.find((c) => c.id === channelId);
    if (ch) return { s, ch };
  }
  return {};
}

/* ------------------------------ Validação ------------------------------ */
const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 32);
const ack = (fn) => (typeof fn === 'function' ? fn : () => {});

/* ------------------------------ Socket.io ------------------------------ */
io.on('connection', (socket) => {
  let user = null;
  const sent = []; // anti-flood simples do chat

  function joinServer(s) {
    s.members.add(user.id);
    user.servers.add(s.id);
    socket.join(`srv:${s.id}`);
  }

  function leaveVoice() {
    if (!user || !user.voice) return;
    const { serverId, channelId } = user.voice;
    socket.leave(`vc:${channelId}`);
    socket.to(`vc:${channelId}`).emit('voice:peer-left', { peerId: user.id });
    const { muted, deafened } = user.state;
    user.voice = null;
    user.voiceSince = null;
    user.state = { ...defaultState(), muted, deafened };
    broadcastServer(servers.get(serverId));
  }

  socket.on('hello', (payload = {}, cb) => {
    const reply = ack(cb);
    const name = cleanName(payload.name);
    if (!name) return reply({ error: 'Escolha um apelido.' });
    if (user) return reply({ error: 'Sessão já iniciada.' });
    const resume = typeof payload.resume === 'string' && payload.resume.length >= 16 ? payload.resume.slice(0, 64) : null;
    const owner = nameOwner(name);
    if (owner) {
      // Mesmo aparelho reconectando (queda de rede): a conexão antiga ainda não caiu por timeout.
      // A chave "resume" é aleatória e só esse aparelho conhece — derruba a antiga e segue.
      if (resume && owner.resume === resume) io.sockets.sockets.get(owner.id)?.disconnect(true);
      else return reply({ error: NAME_TAKEN, code: 'name_taken' });
    }

    user = {
      id: socket.id,
      name,
      resume,
      since: Date.now(),
      avatar: normalizeAvatar(payload.avatar) ?? null,
      servers: new Set(),
      voice: null,
      state: defaultState(),
    };
    users.set(user.id, user);
    user.token = crypto.randomBytes(18).toString('hex'); // só o próprio usuário recebe
    tokens.set(user.token, user.id);

    for (const s of servers.values()) if (s.isPublic) joinServer(s);
    for (const code of Array.isArray(payload.invites) ? payload.invites.slice(0, 50) : []) {
      const s = servers.get(invites.get(String(code).toUpperCase()));
      if (s) joinServer(s);
    }
    user.servers.forEach((id) => broadcastServer(servers.get(id)));
    reply({ me: publicUser(user), token: user.token, servers: [...user.servers].map((id) => snapshot(servers.get(id))) });
  });

  socket.on('profile:update', (payload = {}, cb) => {
    if (!user) return;
    const name = cleanName(payload.name);
    if (name && nameOwner(name, user.id)) return ack(cb)({ error: NAME_TAKEN, code: 'name_taken', me: publicUser(user) });
    let av;
    if ('avatar' in payload) {
      av = normalizeAvatar(payload.avatar);
      if (av === undefined) return ack(cb)({ error: 'Foto inválida ou maior que 2 MB.', me: publicUser(user) });
    }
    if (name) user.name = name;
    if ('avatar' in payload) user.avatar = av;
    user.servers.forEach((id) => broadcastServer(servers.get(id)));
    ack(cb)({ me: publicUser(user) });
  });

  socket.on('server:create', ({ name } = {}, cb) => {
    if (!user) return;
    const s = createServer({ name: name || `Servidor de ${user.name}`, ownerId: user.id });
    joinServer(s);
    ack(cb)({ server: snapshot(s) });
  });

  socket.on('server:join', ({ code } = {}, cb) => {
    if (!user) return;
    // aceita "ABC123" ou um link "cinecria://invite/ABC123"
    const clean = String(code || '').trim().split('/').pop().toUpperCase();
    const s = servers.get(invites.get(clean));
    if (!s) return ack(cb)({ error: 'Convite inválido ou expirado.' });
    joinServer(s);
    broadcastServer(s);
    ack(cb)({ server: snapshot(s) });
  });

  socket.on('server:leave', ({ serverId } = {}) => {
    const s = servers.get(serverId);
    if (!user || !s || s.isPublic) return;
    if (user.voice?.serverId === s.id) leaveVoice();
    s.members.delete(user.id);
    user.servers.delete(s.id);
    socket.leave(`srv:${s.id}`);
    broadcastServer(s);
  });

  socket.on('channel:create', ({ serverId, name, type } = {}, cb) => {
    const s = servers.get(serverId);
    if (!user || !s || !s.members.has(user.id)) return ack(cb)({ error: 'Sem acesso.' });
    if (s.isPublic) return ack(cb)({ error: 'Não é permitido criar ou editar salas nos servidores públicos oficiais do Cinecria.' });
    if (s.channels.length >= 50) return ack(cb)({ error: 'Limite de canais atingido.' });
    const t = type === 'voice' ? 'voice' : 'text';
    let n = String(name || '').trim().slice(0, 32);
    if (t === 'text') n = n.toLowerCase().replace(/\s+/g, '-');
    if (!n) return ack(cb)({ error: 'Dê um nome ao canal.' });
    const ch = { id: uid(), name: n, type: t };
    s.channels.push(ch);
    broadcastServer(s);
    ack(cb)({ channel: ch });
  });

  socket.on('chat:history', ({ channelId } = {}, cb) => {
    const { s } = findChannel(channelId);
    if (!user || !s || !s.members.has(user.id)) return ack(cb)({ messages: [] });
    ack(cb)({ messages: history.get(channelId) || [] });
  });

  socket.on('chat:send', ({ channelId, text, attachment } = {}) => {
    const { s, ch } = findChannel(channelId);
    // canais de texto E de voz têm chat: cada sala de voz tem o seu "chat da sala"
    if (!user || !s || !s.members.has(user.id)) return;
    const body = String(text || '').trim().slice(0, 2000);
    // anexo: só arquivos que ESTE usuário enviou e que ainda não foram usados
    let att = null;
    const up = attachment && uploads.get(String(attachment.id));
    if (up && up.owner === user.id && !up.used) {
      up.used = true;
      const dim = (n) => Math.max(0, Math.min(16384, Math.round(Number(n) || 0)));
      att = { id: up.id, kind: up.kind, mime: up.mime, size: up.size, name: up.name, w: dim(attachment.w), h: dim(attachment.h) };
    }
    if (!body && !att) return;
    const now = Date.now();
    while (sent.length && now - sent[0] > 5000) sent.shift();
    if (sent.length >= 8) return; // flood
    sent.push(now);

    const msg = { id: uid(), channelId, author: { id: user.id, name: user.name, avatar: user.avatar }, text: body, ts: now };
    if (att) msg.attachment = att;
    const list = history.get(channelId) || [];
    list.push(msg);
    if (list.length > HISTORY_LIMIT) {
      for (const old of list.splice(0, list.length - HISTORY_LIMIT)) if (old.attachment) dropUpload(old.attachment.id);
    }
    history.set(channelId, list);
    io.to(`srv:${s.id}`).emit('chat:message', msg);
  });

  /* ---------------- Voz / vídeo / tela ---------------- */
  socket.on('voice:join', ({ channelId } = {}, cb) => {
    const reply = ack(cb);
    const { s, ch } = findChannel(channelId);
    if (!user || !s || ch.type !== 'voice' || !s.members.has(user.id)) return reply({ error: 'Canal indisponível.' });

    const peers = [...s.members]
      .map((id) => users.get(id))
      .filter((u) => u && u.id !== user.id && u.voice?.channelId === channelId)
      .map((u) => u.id);
    if (peers.length >= MAX_VOICE_USERS) return reply({ error: `Canal cheio (máx. ${MAX_VOICE_USERS}).` });

    if (user.voice) leaveVoice();
    // Avisa quem já está na sala ANTES do recém-chegado começar a sinalizar.
    socket.to(`vc:${channelId}`).emit('voice:peer-joined', { peerId: user.id });
    socket.join(`vc:${channelId}`);
    user.voice = { serverId: s.id, channelId };
    user.voiceSince = Date.now();
    broadcastServer(s);
    reply({ ok: true, peers });
  });

  socket.on('voice:leave', () => leaveVoice());

  socket.on('voice:state', (patch = {}) => {
    if (!user) return;
    const st = user.state;
    for (const k of ['muted', 'deafened', 'camera', 'screen']) if (k in patch) st[k] = !!patch[k];
    for (const k of ['micStreamId', 'camStreamId', 'screenStreamId', 'quality']) {
      if (k in patch) st[k] = patch[k] == null ? null : String(patch[k]).slice(0, 64);
    }
    if (user.voice) broadcastServer(servers.get(user.voice.serverId));
  });

  // Relay de SDP/ICE — só entre pessoas no mesmo canal de voz.
  socket.on('signal', ({ to, data } = {}) => {
    const target = users.get(to);
    if (!user || !target || !user.voice || target.voice?.channelId !== user.voice.channelId) return;
    io.to(to).emit('signal', { from: user.id, data });
  });

  socket.on('disconnect', () => {
    if (!user) return;
    leaveVoice();
    for (const id of user.servers) {
      const s = servers.get(id);
      if (!s) continue;
      s.members.delete(user.id);
      broadcastServer(s);
    }
    users.delete(user.id);
    tokens.delete(user.token);
    // uploads que nunca viraram mensagem
    for (const [id, u] of uploads) if (u.owner === user.id && !u.used) dropUpload(id);
  });
});

httpServer.listen(PORT, () => {
  const lan = Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => `http://${i.address}:${PORT}`);
  console.log(`\n  🎬 Cinecria signaling server rodando`);
  console.log(`     Local:  http://localhost:${PORT}`);
  lan.forEach((u) => console.log(`     Rede:   ${u}`));
  console.log('');
});

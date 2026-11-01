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

// IMPORTANTE PARA O RENDER: Confia no proxy reverso para lidar com conexões seguras (HTTPS/WSS)
app.set('trust proxy', 1);

// Serve o cliente web (mesma UI do app desktop) — útil para testar em 2 abas do navegador.
app.use(express.static(path.join(__dirname, '..', 'app', 'renderer')));
app.get('/health', (_req, res) => res.json({ app: 'cinecria-server', ok: true }));

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

// CORS: o app Electron (file://) e o Android/Navegadores falam com este servidor na nuvem.
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
  maxHttpBufferSize: 1e6, // avatares são redimensionados no cliente (~10 KB)
});

/* ------------------------------ Estado em memória ------------------------------ */
const uid = () => crypto.randomBytes(6).toString('hex');
const COLORS = ['#7b61ff', '#f2545b', '#23a55a', '#f0b232', '#3ba7ff', '#eb459e', '#00b8a9', '#ff7a45'];

/** @type {Map<string, any>} */ const servers = new Map();   // serverId -> server
/** @type {Map<string, string>} */ const invites = new Map(); // código -> serverId
/** @type {Map<string, any[]>} */ const history = new Map();  // channelId -> mensagens
/** @type {Map<string, any>} */ const users =
/**
 * Cinecria — processo principal do Electron
 * - Cria a janela
 * - Lista fontes de captura (telas/janelas) para o seletor customizado
 * - Intercepta getDisplayMedia() e entrega a fonte escolhida + áudio do sistema (loopback no Windows)
 * - "Modo compatibilidade de vídeo" opcional (desliga a aceleração de hardware do próprio Cinecria)
 */
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, desktopCapturer, session, shell } = require('electron');

/* ------------------------- configurações locais do app ------------------------- */
// Lidas ANTES do app ficar pronto: disableHardwareAcceleration() só funciona nesse momento.
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return {}; }
}
function writeSettings(patch) {
  const next = { ...readSettings(), ...patch };
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}
const settings = readSettings();

/*
 * Aceleração de hardware: LIGADA por padrão, de propósito.
 * A tela preta da Netflix/Prime/Disney+ acontece no NAVEGADOR que toca o filme (DRM Widevine/PlayReady
 * + GPU), não no Cinecria — desligar a GPU aqui não muda nada nesse caso e deixa o encode/decode de
 * 1080p60 por conta da CPU. O modo compatibilidade existe para o caso raro de um driver de vídeo que
 * deixa preta a renderização do PRÓPRIO Cinecria (vídeos dos amigos, câmera). Ativado pelo seletor de tela.
 */
if (settings.compatVideo || process.argv.includes('--compat-video')) {
  app.disableHardwareAcceleration();
}

// Mantém captura/encode a toda velocidade mesmo com a janela minimizada ou em segundo plano.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
// Áudio/vídeo dos amigos e vídeos do chat tocam sem exigir um clique antes.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// GPU: rasterização e upload de quadros sem cópia extra (menos CPU ao exibir 1440p60).
// Não têm efeito quando o modo compatibilidade desliga a aceleração de hardware.
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
// Linux/Wayland: captura de tela via PipeWire (no Windows/macOS esse recurso não existe).
if (process.platform === 'linux') app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');

let mainWindow = null;
/** Fonte escolhida no seletor do Cinecria, consumida pelo próximo getDisplayMedia(). */
let pendingSource = null; // { id: string, audio: boolean }

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 880,
    minWidth: 980,
    minHeight: 620,
    backgroundColor: '#0c0c14',
    title: 'Cinecria',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Links do chat abrem no navegador padrão, nunca dentro do app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); }
  });

  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools({ mode: 'detach' });
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  const ses = session.defaultSession;
  const allowed = new Set(['media', 'display-capture', 'fullscreen', 'clipboard-sanitized-write', 'notifications']);
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  // Todo getDisplayMedia() do renderer passa por aqui.
  ses.setDisplayMediaRequestHandler(async (_request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const chosen = pendingSource && sources.find((s) => s.id === pendingSource.id);
      if (!chosen) return callback({}); // nada escolhido → nega a captura

      const streams = { video: chosen };
      // Áudio do sistema: suportado nativamente no Windows via loopback.
      if (pendingSource.audio && process.platform === 'win32') streams.audio = 'loopback';
      callback(streams);
    } catch (err) {
      console.error('[cinecria] display media error', err);
      callback({});
    } finally {
      pendingSource = null;
    }
  });

  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

/* ----------------------------- IPC ----------------------------- */
ipcMain.handle('screen:get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 400, height: 225 },
    fetchWindowIcons: true,
  });
  return sources
    .filter((s) => s.name !== 'Cinecria') // não oferecer a própria janela
    .map((s) => ({
      id: s.id,
      name: s.name,
      isScreen: s.id.startsWith('screen:'),
      thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
      icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
    }));
});

ipcMain.handle('settings:get', () => ({
  compatVideo: !!readSettings().compatVideo,
  gpuDisabled: !app.isHardwareAccelerationEnabled(),
}));

/** Liga/desliga o modo compatibilidade e reinicia o app (a GPU só muda na inicialização). */
ipcMain.handle('settings:set-compat', (_e, on) => {
  writeSettings({ compatVideo: !!on });
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('screen:select', (_e, sel) => {
  pendingSource = sel && typeof sel.id === 'string' ? { id: sel.id, audio: !!sel.audio } : null;
  return true;
});

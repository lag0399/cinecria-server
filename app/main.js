/**
 * Cinecria — processo principal do Electron
 * - Cria a janela
 * - Lista fontes de captura (telas/janelas) para o seletor customizado
 * - Intercepta getDisplayMedia() e entrega a fonte escolhida + áudio do sistema (loopback no Windows)
 */
const path = require('path');
const { app, BrowserWindow, ipcMain, desktopCapturer, session, shell } = require('electron');

// Mantém captura/encode a toda velocidade mesmo com a janela minimizada ou em segundo plano.
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

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
    backgroundColor: '#1a1b1e',
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

ipcMain.handle('screen:select', (_e, sel) => {
  pendingSource = sel && typeof sel.id === 'string' ? { id: sel.id, audio: !!sel.audio } : null;
  return true;
});

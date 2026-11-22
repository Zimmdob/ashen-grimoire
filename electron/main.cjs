// Ashen Grimoire desktop app. It runs the co-op server inside the app (serving the game and the
// multiplayer relay on port 8787), opens a free Cloudflare tunnel so a friend anywhere can join with
// a plain link, and shows the game in its own window.
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const updater = require('./updater.cjs');

const PORT = 8787;
const res = (...p) => (app.isPackaged ? path.join(process.resourcesPath, ...p) : path.join(__dirname, '..', ...p));

function startServer() {
  process.env.PORT = String(PORT);
  process.env.AG_EMBEDDED = '1';
  process.env.AG_DIST = app.isPackaged ? path.join(__dirname, '..', 'dist') : path.join(__dirname, '..', 'dist');
  process.env.AG_LINKFILE = path.join(app.getPath('userData'), 'Friend link.txt');
  // Sydney's voice is private and only in builds made on Dean's computer: keep a copy outside the
  // app files, so automatic updates (built on GitHub, without it) never lose it.
  const voice = path.join(app.getPath('userData'), 'voice');
  try {
    const src = path.join(__dirname, '..', 'dist', 'voice');
    if (fs.existsSync(src)) {
      fs.mkdirSync(voice, { recursive: true });
      for (const f of fs.readdirSync(src)) { const to = path.join(voice, f); if (!fs.existsSync(to)) fs.writeFileSync(to, fs.readFileSync(path.join(src, f))); }
    }
  } catch { /* no voice, no matter */ }
  process.env.AG_VOICE_DIR = voice;
  const cf = res(app.isPackaged ? 'cloudflared.exe' : path.join('build', 'cloudflared.exe'));
  if (fs.existsSync(cf)) { process.env.CLOUDFLARED = cf; process.env.TUNNEL = '1'; }
  try { require('./server.cjs'); } catch (e) { console.error('Server failed to start:', e); }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#070606',
    autoHideMenuBar: true,
    title: 'Ashen Grimoire',
    icon: res('build', 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.cjs') },
  });
  // links (like the GitHub page) open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // F11: the game's own fullscreen (map fills the screen, spells along the bottom), not just a bigger window
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      e.preventDefault();
      win.webContents.executeJavaScript('window.__agToggleFs && window.__agToggleFs()', true).catch(() => win.setFullScreen(!win.isFullScreen()));
    }
  });
  // tell the page about updates as they happen
  const off = updater.onChange((st) => { if (!win.isDestroyed()) win.webContents.send('ag-update', st); });
  win.on('closed', off);
  const dev = process.env.VITE_DEV_SERVER_URL;
  const target = dev || `http://localhost:${PORT}/`;
  // the server needs a moment to start listening
  let tries = 0;
  const load = () => win.loadURL(target).catch(() => { if (++tries < 40) setTimeout(load, 250); });
  load();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.whenReady().then(() => {
    if (!process.env.VITE_DEV_SERVER_URL) startServer();
    ipcMain.handle('ag-update-state', () => updater.state());
    ipcMain.handle('ag-update-check', () => updater.check().then(() => updater.state()));
    ipcMain.handle('ag-update-apply', () => { if (updater.apply(true)) setTimeout(() => app.quit(), 150); });
    createWindow();
    updater.start();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => app.quit());
}

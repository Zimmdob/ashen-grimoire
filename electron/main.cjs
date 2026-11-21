// Ashen Grimoire desktop app. It runs the co-op server inside the app (serving the game and the
// multiplayer relay on port 8787), opens a free Cloudflare tunnel so a friend anywhere can join with
// a plain link, and shows the game in its own window.
const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const PORT = 8787;
const res = (...p) => (app.isPackaged ? path.join(process.resourcesPath, ...p) : path.join(__dirname, '..', ...p));

function startServer() {
  process.env.PORT = String(PORT);
  process.env.AG_EMBEDDED = '1';
  process.env.AG_DIST = app.isPackaged ? path.join(__dirname, '..', 'dist') : path.join(__dirname, '..', 'dist');
  process.env.AG_LINKFILE = path.join(app.getPath('userData'), 'LINK FOR IAN.txt');
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
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // links (like the GitHub page) open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
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
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => app.quit());
}

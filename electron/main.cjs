// Desktop wrapper. `npm run electron` builds the game and opens it in a window;
// `npm run dist` packages an installer and a portable .exe into release/.
// Steam: add steamworks.js here (init with your app id, then expose achievements via a preload script).
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#070606',
    autoHideMenuBar: true,
    title: 'Ashen Grimoire',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  const dev = process.env.VITE_DEV_SERVER_URL;
  if (dev) win.loadURL(dev);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

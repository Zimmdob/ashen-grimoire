// The little bridge between the game page and the desktop app: update status and the restart button.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agApp', {
  /** Current updater state: { status: idle|checking|downloading|ready|uptodate|error, progress, build, latest }. */
  state: () => ipcRenderer.invoke('ag-update-state'),
  /** Look for a newer version right now (e.g. when a friend's game is newer than yours). */
  checkNow: () => ipcRenderer.invoke('ag-update-check'),
  /** Close, install the downloaded version, and open again. */
  restartToUpdate: () => ipcRenderer.invoke('ag-update-apply'),
  onUpdate: (fn) => { ipcRenderer.on('ag-update', (_e, s) => fn(s)); },
});

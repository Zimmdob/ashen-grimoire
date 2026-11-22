// Keeps the desktop app up to date by itself.
// Every push to main builds a new Windows app on GitHub and publishes it as the latest release.
// The app checks that release now and then, downloads anything newer in the background, and swaps
// it in when the player restarts (the "Restart to update" button) or simply quits. Nothing changes
// mid-run, and nothing needs admin rights: the app lives in the user's own Programs folder.
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');

const REPO = 'Zimmdob/ashen-grimoire';
const ASSET = 'AshenGrimoireApp.zip';
const CHECK_EVERY = 30 * 60 * 1000;

function localBuild() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dist', 'build.json'), 'utf8')); } catch { return { sha: 'dev', time: 0 }; }
}

const BUILD = localBuild();
const state = { status: 'idle', progress: 0, build: BUILD, latest: null, error: '' };
let zipPath = '';
let applying = false;
const listeners = new Set();
const emit = () => { for (const fn of listeners) { try { fn({ ...state }); } catch { /* window gone */ } } };
const set = (patch) => { Object.assign(state, patch); emit(); };

/** The latest published build: { sha, time, url, size }, or null. Its notes carry the build stamp as JSON. */
async function latestRelease() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'user-agent': 'ashen-grimoire-updater', accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`GitHub said ${r.status}`);
  const rel = await r.json();
  const m = /\{[^{}]*"sha"[^{}]*\}/.exec(rel.body || '');
  if (!m) return null;
  const stamp = JSON.parse(m[0]);
  const asset = (rel.assets || []).find((a) => a.name === ASSET);
  if (!asset) return null;
  return { sha: String(stamp.sha), time: Number(stamp.time) || 0, url: asset.browser_download_url, size: asset.size };
}

async function download(url, size, dest) {
  const r = await fetch(url, { headers: { 'user-agent': 'ashen-grimoire-updater' }, redirect: 'follow' });
  if (!r.ok || !r.body) throw new Error(`download failed (${r.status})`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  const out = fs.createWriteStream(part);
  let got = 0;
  const reader = r.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (!out.write(Buffer.from(value))) await new Promise((res) => out.once('drain', res));
    const p = size ? Math.floor((100 * got) / size) : 0;
    if (p !== state.progress) set({ progress: p });
  }
  await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
  if (size && got !== size) { fs.rmSync(part, { force: true }); throw new Error('download was cut short'); }
  fs.renameSync(part, dest);
}

/** Look for a newer build and fetch it. Safe to call any time; only one check runs at once. */
async function check() {
  if (!app.isPackaged || process.platform !== 'win32') { set({ status: 'uptodate' }); return; }
  if (state.status === 'checking' || state.status === 'downloading' || state.status === 'ready') return;
  set({ status: 'checking', error: '' });
  try {
    const rel = await latestRelease();
    // only ever move forward: a newer commit than the one this app was built from
    if (!rel || rel.sha === BUILD.sha || rel.time <= BUILD.time) { set({ status: 'uptodate', latest: rel && { sha: rel.sha, time: rel.time } }); return; }
    const dest = path.join(app.getPath('userData'), 'update', `AshenGrimoireApp-${rel.sha}.zip`);
    set({ status: 'downloading', progress: 0, latest: { sha: rel.sha, time: rel.time } });
    if (!fs.existsSync(dest) || (rel.size && fs.statSync(dest).size !== rel.size)) await download(rel.url, rel.size, dest);
    zipPath = dest;
    set({ status: 'ready', progress: 100 });
  } catch (e) {
    set({ status: 'error', error: String(e && e.message || e) });
  }
}

/**
 * Swap in the downloaded build. A small PowerShell helper waits for this app to close, unpacks the
 * new files over the install folder, and (if asked) starts the game again.
 */
function apply(relaunch) {
  if (applying || state.status !== 'ready' || !zipPath || !fs.existsSync(zipPath)) return false;
  applying = true;
  const dest = path.dirname(process.execPath);
  const script = path.join(app.getPath('userData'), 'update', 'apply-update.ps1');
  fs.writeFileSync(script, `param([string]$Zip, [string]$Dest, [int]$AppPid, [int]$Relaunch)
$ErrorActionPreference = 'SilentlyContinue'
for ($i = 0; $i -lt 60; $i++) { if (-not (Get-Process -Id $AppPid -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 500 }
Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($Dest) } | Stop-Process -Force
Start-Sleep -Milliseconds 700
$tmp = Join-Path $env:TEMP ('ag-update-' + [guid]::NewGuid().ToString('N'))
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($Zip, $tmp)
if (Test-Path (Join-Path $tmp 'Ashen Grimoire.exe')) {
  robocopy $tmp $Dest /MIR /R:10 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  Remove-Item $Zip -Force
}
Remove-Item $tmp -Recurse -Force
if ($Relaunch -eq 1) { Start-Process (Join-Path $Dest 'Ashen Grimoire.exe') }
`);
  const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script,
    '-Zip', zipPath, '-Dest', dest, '-AppPid', String(process.pid), '-Relaunch', relaunch ? '1' : '0'], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return true;
}

function start() {
  setTimeout(check, 8000);
  setInterval(check, CHECK_EVERY);
  // quitting with an update waiting installs it quietly, ready for next time
  app.on('before-quit', () => { if (state.status === 'ready') apply(false); });
}

module.exports = { start, check, apply, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, state: () => ({ ...state }), BUILD };

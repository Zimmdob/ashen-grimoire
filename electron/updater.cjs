// Keeps the desktop app up to date by itself.
// Every push to main builds a new Windows app on GitHub and publishes it as the latest release.
// The app checks that release now and then, downloads anything newer in the background, unpacks it
// next to itself, and swaps it in when the player restarts ("Restart to update") or quits.
// Nothing changes mid-run, and no admin rights are needed: the app lives in the user's own folder.
//
// The swap runs in a small visible window ("Updating Ashen Grimoire…") launched through Windows
// Explorer, so it is independent of the game and survives the game closing. It logs every step to
// update.log, and the game checks on its next start that it really is the new version.
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
let staged = '';
let applying = false;
const listeners = new Set();
const emit = () => { for (const fn of listeners) { try { fn({ ...state }); } catch { /* window gone */ } } };
const set = (patch) => { Object.assign(state, patch); emit(); };
const dir = () => path.join(app.getPath('userData'), 'update');
const log = (line) => { try { fs.mkdirSync(dir(), { recursive: true }); fs.appendFileSync(path.join(dir(), 'update.log'), `${new Date().toISOString()} [app ${BUILD.sha}] ${line}\r\n`); } catch { /* ignore */ } };

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
    const p = size ? Math.floor((95 * got) / size) : 0;
    if (p !== state.progress) set({ progress: p });
  }
  await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
  if (size && got !== size) { fs.rmSync(part, { force: true }); throw new Error('download was cut short'); }
  fs.renameSync(part, dest);
}

/** Unpack the downloaded zip next to the app while it is still running (nothing is locked yet). */
function unpack(zip, into) {
  return new Promise((resolve, reject) => {
    fs.rmSync(into, { recursive: true, force: true });
    const ps = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${zip.replace(/'/g, "''")}', '${into.replace(/'/g, "''")}')`;
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(path.join(into, 'Ashen Grimoire.exe'))) resolve();
      else reject(new Error(`could not unpack the update (${code}): ${err.trim().slice(0, 200)}`));
    });
  });
}

/** On start: did the last update really install? If not, say so once instead of looping. */
function checkLastUpdate() {
  const pend = path.join(dir(), 'pending.json');
  if (!fs.existsSync(pend)) return '';
  let want = '';
  try { want = JSON.parse(fs.readFileSync(pend, 'utf8')).sha; } catch { /* ignore */ }
  fs.rmSync(pend, { force: true });
  if (!want || want === BUILD.sha) {
    log(`now running ${BUILD.sha}: update installed`);
    for (const f of fs.readdirSync(dir())) if (/^(staged-|AshenGrimoireApp-)/.test(f)) fs.rmSync(path.join(dir(), f), { recursive: true, force: true });
    return '';
  }
  let tail = '';
  try { tail = fs.readFileSync(path.join(dir(), 'update.log'), 'utf8').trim().split(/\r?\n/).slice(-1)[0] ?? ''; } catch { /* no log */ }
  log(`expected ${want} but still on ${BUILD.sha}`);
  return `The last update did not install.${tail ? ` (${tail.replace(/^\S+ \[[^\]]*\] /, '')})` : ''}`;
}
let failedOnce = '';

/** Look for a newer build, download and unpack it. Safe to call any time; only one check runs at once. */
async function check() {
  if (!app.isPackaged || process.platform !== 'win32') { set({ status: 'uptodate' }); return; }
  if (state.status === 'checking' || state.status === 'downloading' || state.status === 'ready') return;
  set({ status: 'checking', error: failedOnce });
  try {
    const rel = await latestRelease();
    // only ever move forward: a newer commit than the one this app was built from
    if (!rel || rel.sha === BUILD.sha || rel.time <= BUILD.time) { set({ status: failedOnce ? 'error' : 'uptodate', latest: rel && { sha: rel.sha, time: rel.time } }); return; }
    const zip = path.join(dir(), `AshenGrimoireApp-${rel.sha}.zip`);
    set({ status: 'downloading', progress: 0, latest: { sha: rel.sha, time: rel.time } });
    if (!fs.existsSync(zip) || (rel.size && fs.statSync(zip).size !== rel.size)) await download(rel.url, rel.size, zip);
    set({ progress: 97 });
    const into = path.join(dir(), `staged-${rel.sha}`);
    if (!fs.existsSync(path.join(into, 'Ashen Grimoire.exe'))) await unpack(zip, into);
    staged = into;
    log(`downloaded and unpacked ${rel.sha}`);
    set({ status: 'ready', progress: 100 });
  } catch (e) {
    log(`update check failed: ${e && e.message || e}`);
    set({ status: 'error', error: String(e && e.message || e) });
  }
}

/** Swap in the unpacked build: a small window waits for the game to close, copies the files, and reopens it. */
function apply(relaunch) {
  if (applying || state.status !== 'ready' || !staged || !fs.existsSync(staged)) return false;
  applying = true;
  const dest = path.dirname(process.execPath);
  const ps1 = path.join(dir(), 'apply-update.ps1');
  const cmd = path.join(dir(), 'apply-update.cmd');
  const logFile = path.join(dir(), 'update.log');
  fs.writeFileSync(ps1, `param([string]$Staged, [string]$Dest, [int]$AppPid, [int]$Relaunch, [string]$Sha, [string]$Log)
function Note($m) { Add-Content -Path $Log -Value ((Get-Date).ToString('s') + ' [updater] ' + $m); Write-Host $m }
try {
  Note "Updating Ashen Grimoire to $Sha. Waiting for the game to close..."
  for ($i = 0; $i -lt 60; $i++) { if (-not (Get-Process -Id $AppPid -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 500 }
  for ($i = 0; $i -lt 30; $i++) {
    $left = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($Dest, [StringComparison]::OrdinalIgnoreCase) })
    if ($left.Count -eq 0) { break }
    if ($i -eq 6) { Note 'Closing leftover game processes...'; cmd.exe /c 'taskkill /F /T /IM "Ashen Grimoire.exe" >nul 2>&1' }
    if ($i -gt 6) { $left | Stop-Process -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
  }
  Note 'Copying the new version...'
  robocopy "$Staged" "$Dest" /MIR /R:20 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  $code = $LASTEXITCODE
  if ($code -ge 8) { throw "copying failed (robocopy code $code). A file may be in use: close the game everywhere and try again." }
  Note "Done (robocopy code $code)."
  Remove-Item "$Staged" -Recurse -Force -ErrorAction SilentlyContinue
  if ($Relaunch -eq 1) { Start-Process explorer.exe -ArgumentList ('"' + (Join-Path $Dest 'Ashen Grimoire.exe') + '"') }
  Start-Sleep -Seconds 1
} catch {
  Note ("Update failed: " + $_.Exception.Message)
  Write-Host ''
  Write-Host 'The update could not install. You can close this window; the game still works.' -ForegroundColor Yellow
  Read-Host 'Press Enter to close'
  if ($Relaunch -eq 1) { Start-Process explorer.exe -ArgumentList ('"' + (Join-Path $Dest 'Ashen Grimoire.exe') + '"') }
}
`);
  const q = (s) => `"${s}"`;
  fs.writeFileSync(cmd, `@echo off\r\ntitle Updating Ashen Grimoire\r\npowershell -NoProfile -ExecutionPolicy Bypass -File ${q(ps1)} -Staged ${q(staged)} -Dest ${q(dest)} -AppPid ${process.pid} -Relaunch ${relaunch ? 1 : 0} -Sha ${state.latest ? state.latest.sha : 'new'} -Log ${q(logFile)}\r\n`);
  fs.writeFileSync(path.join(dir(), 'pending.json'), JSON.stringify({ sha: state.latest && state.latest.sha }));
  log(`handing over to the updater window (relaunch ${relaunch ? 'yes' : 'no'}) for ${dest}`);
  // Launched by Explorer, the updater window is not a child of the game, so closing the game cannot take it down.
  const child = spawn('explorer.exe', [cmd], { detached: true, stdio: 'ignore' });
  child.unref();
  return true;
}

function start() {
  failedOnce = checkLastUpdate();
  if (failedOnce) set({ status: 'error', error: failedOnce });
  setTimeout(check, 8000);
  setInterval(check, CHECK_EVERY);
  // quitting with an update waiting installs it quietly, ready for next time
  app.on('before-quit', () => { if (state.status === 'ready') apply(false); });
}

module.exports = { start, check, apply, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, state: () => ({ ...state }), BUILD };

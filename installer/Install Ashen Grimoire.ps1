# Installs Ashen Grimoire for this Windows user (no admin needed): unpacks it into your own Programs
# folder and adds Desktop and Start menu shortcuts. After this the game keeps itself up to date.
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Installing Ashen Grimoire'
$zip = Join-Path $PSScriptRoot 'AshenGrimoireApp.zip'
$dest = Join-Path $env:LOCALAPPDATA 'Programs\Ashen Grimoire'
function Fail($msg) { Write-Host ''; Write-Host $msg -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
if (-not (Test-Path $zip)) { Fail 'AshenGrimoireApp.zip is missing from this folder. Unzip the whole download first.' }

Write-Host 'Closing Ashen Grimoire if it is running...'
# every copy of the game, its hidden helper processes, and its friend-link helper
cmd.exe /c 'taskkill /F /T /IM "Ashen Grimoire.exe" >nul 2>&1'
for ($i = 0; $i -lt 20; $i++) {
  $left = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($dest, [StringComparison]::OrdinalIgnoreCase) })
  if ($left.Count -eq 0) { break }
  $left | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 500
}

Write-Host 'Installing Ashen Grimoire (about a minute)...'
$tmp = Join-Path $env:TEMP ('ag-install-' + [guid]::NewGuid().ToString('N'))
Add-Type -AssemblyName System.IO.Compression.FileSystem
try { [System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp) } catch { Fail ('Could not unpack the game: ' + $_.Exception.Message) }
New-Item -ItemType Directory -Force -Path $dest | Out-Null
# copy over the old version, retrying files that are briefly in use
robocopy "$tmp" "$dest" /MIR /R:30 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
$code = $LASTEXITCODE
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
if ($code -ge 8) { Fail 'Some game files are still in use. Restart your computer, then run this installer again.' }

$exe = Join-Path $dest 'Ashen Grimoire.exe'
$shell = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) {
  $lnk = $shell.CreateShortcut((Join-Path $dir 'Ashen Grimoire.lnk'))
  $lnk.TargetPath = $exe
  $lnk.WorkingDirectory = $dest
  $lnk.IconLocation = "$exe,0"
  $lnk.Description = 'Ashen Grimoire'
  $lnk.Save()
}
Write-Host ''
Write-Host 'Installed. Ashen Grimoire is on your Desktop and in the Start menu.' -ForegroundColor Green
Write-Host 'It updates itself from now on. Starting it now...'
# start it on its own, not attached to this window
Start-Process explorer.exe -ArgumentList "`"$exe`""
Start-Sleep -Seconds 3

# Installs Ashen Grimoire for this Windows user (no admin needed): unpacks it into your own Programs
# folder and adds Desktop and Start menu shortcuts. After this the game keeps itself up to date.
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Installing Ashen Grimoire'
$zip = Join-Path $PSScriptRoot 'AshenGrimoireApp.zip'
$dest = Join-Path $env:LOCALAPPDATA 'Programs\Ashen Grimoire'
if (-not (Test-Path $zip)) { Write-Host 'AshenGrimoireApp.zip is missing from this folder. Unzip the whole download first.' -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }
# close the game (and its link helper) if it is running
Get-Process 'Ashen Grimoire' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($dest) } | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host 'Installing Ashen Grimoire (about a minute)...'
for ($i = 0; $i -lt 30 -and (Test-Path $dest); $i++) {
  try { Remove-Item $dest -Recurse -Force -ErrorAction Stop } catch { Start-Sleep -Milliseconds 500 }
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($zip, $dest)
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

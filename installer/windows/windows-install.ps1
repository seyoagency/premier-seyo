param(
  [Parameter(Mandatory=$true)]
  [string]$InstallDir
)

$ErrorActionPreference = "Stop"
$TaskName = "PremierSEYO Daemon"
$LogDir = Join-Path $env:LOCALAPPDATA "PremierSEYO\logs"
$ConfigDir = Join-Path $env:APPDATA "PremierSEYO"
$NodeExe = Join-Path $InstallDir "runtime\node\node.exe"
$ServerJs = Join-Path $InstallDir "daemon\server.js"
$PluginCcx = Join-Path $InstallDir "plugin\PremierSEYO.ccx"
$PluginInstaller = Join-Path $InstallDir "installer\install-plugin.js"
$InstallLog = Join-Path $LogDir "install.log"

New-Item -ItemType Directory -Force $LogDir | Out-Null
New-Item -ItemType Directory -Force $ConfigDir | Out-Null

function Log($Message) {
  $Line = "$(Get-Date -Format o) $Message"
  Add-Content -Path $InstallLog -Value $Line
  Write-Host $Message
}

if (!(Test-Path $NodeExe)) { throw "Bundled node.exe not found: $NodeExe" }
if (!(Test-Path $ServerJs)) { throw "Daemon server.js not found: $ServerJs" }
if (!(Test-Path $PluginCcx)) { throw "PremierSEYO.ccx not found: $PluginCcx" }

Log "Installing UXP plugin through UPIA"
& $NodeExe $PluginInstaller $PluginCcx *> (Join-Path $LogDir "upia-install.log")
if ($LASTEXITCODE -ne 0) {
  throw "UPIA plugin install failed with exit code $LASTEXITCODE. See $LogDir\upia-install.log"
}

Log "Registering Scheduled Task"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$Action = New-ScheduledTaskAction `
  -Execute $NodeExe `
  -Argument "`"$ServerJs`"" `
  -WorkingDirectory (Join-Path $InstallDir "daemon")
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description "PremierSEYO local helper daemon" `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Log "PremierSEYO daemon task started"

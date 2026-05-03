param(
  [Parameter(Mandatory=$true)]
  [string]$InstallDir
)

$TaskName = "PremierSEYO Daemon"

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$Escaped = [Regex]::Escape((Join-Path $InstallDir "daemon\server.js"))
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match $Escaped } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {}
  }

Write-Host "PremierSEYO daemon task removed. Config and API key are preserved under %APPDATA%\PremierSEYO."

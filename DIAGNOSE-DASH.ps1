$ErrorActionPreference = 'Continue'
Write-Host '=== DASH diagnostics ===' -ForegroundColor Cyan
Write-Host "Project: $((Get-Location).Path)"
Write-Host "Node: $(node --version 2>&1)"
Write-Host "npm:  $(npm --version 2>&1)"
Write-Host "VITE_DEV_SERVER_URL (inherited shell): $env:VITE_DEV_SERVER_URL"
Write-Host "APPDATA: $env:APPDATA"

Write-Host "`n=== Port 5173 ===" -ForegroundColor Cyan
try {
  $listeners = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction Stop
  $listeners | Select-Object LocalAddress, LocalPort, OwningProcess | Format-Table -AutoSize
} catch {
  Write-Host 'No listener found on port 5173 (or the connection query is unavailable).'
}

$log = Join-Path $env:APPDATA 'DASH\dash-startup.log'
Write-Host "`n=== DASH startup log: $log ===" -ForegroundColor Cyan
if (Test-Path $log) {
  Get-Content $log -Tail 100
} else {
  Write-Host 'No DASH startup log found yet.'
}

Write-Host "`n=== Electron processes ===" -ForegroundColor Cyan
Get-CimInstance Win32_Process -Filter "Name='DASH.exe' OR Name='electron.exe'" -ErrorAction SilentlyContinue |
  Select-Object Name, ProcessId, ExecutablePath, CommandLine |
  Format-List

Write-Host "`nDiagnostics complete. Review the output before sharing; redact any personal paths if desired." -ForegroundColor Green

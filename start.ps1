# start.ps1 — starter Abliterated-serveren (hvis den ikke kjører) og åpner nettsiden.
# Kjøres av start.bat; kan også kjøres direkte.
Set-Location $PSScriptRoot
$url = 'http://localhost:3000'

function ServerSvarer {
  try { Invoke-WebRequest "$url/api/health" -TimeoutSec 2 -UseBasicParsing | Out-Null; return $true } catch { return $false }
}

if (-not (ServerSvarer)) {
  Write-Host 'Starter serveren…'
  Start-Process -WindowStyle Hidden node -ArgumentList 'server.js' -WorkingDirectory $PSScriptRoot
  for ($i = 0; $i -lt 30; $i++) {   # vent opptil ~15 s på at serveren svarer
    Start-Sleep -Milliseconds 500
    if (ServerSvarer) { break }
  }
}

if (ServerSvarer) { Start-Process $url } else { Write-Host 'Serveren svarte ikke. Sjekk at Node og Ollama er installert.' }

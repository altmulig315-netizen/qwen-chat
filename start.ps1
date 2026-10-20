# start.ps1 — starter Ollama (hvis nede) + Abliterated-serveren, og åpner nettsiden.
# Kjøres av start.bat; kan også kjøres direkte.
Set-Location $PSScriptRoot
$url = 'http://localhost:3000'

function Svarer($u) { try { Invoke-WebRequest $u -TimeoutSec 2 -UseBasicParsing | Out-Null; return $true } catch { return $false } }

# 1) Ollama (motoren som kjører modellen) må kjøre.
if (-not (Svarer 'http://localhost:11434/api/tags')) {
  Write-Host 'Starter Ollama…'
  $ollama = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
  if (Test-Path $ollama) { Start-Process -WindowStyle Hidden $ollama -ArgumentList 'serve' }
  else { try { Start-Process -WindowStyle Hidden 'ollama' -ArgumentList 'serve' } catch {} }
  for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Milliseconds 500; if (Svarer 'http://localhost:11434/api/tags') { break } }
}

# 2) Webserveren.
if (-not (Svarer "$url/api/health")) {
  Write-Host 'Starter serveren…'
  Start-Process -WindowStyle Hidden node -ArgumentList 'server.js' -WorkingDirectory $PSScriptRoot
  for ($i = 0; $i -lt 30; $i++) { Start-Sleep -Milliseconds 500; if (Svarer "$url/api/health") { break } }
}

# 3) Åpne nettsiden.
if (Svarer "$url/api/health") {
  Start-Process $url
  if (-not (Svarer 'http://localhost:11434/api/tags')) { Write-Host 'Merk: Ollama svarer ikke — du får ikke svar fra modellen før den er oppe.' }
} else {
  Write-Host 'Serveren svarte ikke. Sjekk at Node og Ollama er installert.'
}

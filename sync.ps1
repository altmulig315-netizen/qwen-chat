# sync.ps1 — synk qwen-chat med GitHub. Samme skript på begge maskinene.
#   .\sync.ps1                 hent siste endringer
#   .\sync.ps1 "melding"       hent, commit egne endringer (bolletest via hook) og push
param([string]$Melding, [switch]$UtenOllama)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# Sørg for at den delte hooken brukes (første gang på en ny maskin).
if ((git config core.hooksPath) -ne 'hooks') { git config core.hooksPath hooks; Write-Host 'Hook aktivert (hooks/pre-commit).' }

$endringer = git status --porcelain
if ($endringer -and -not $Melding) {
  Write-Host "Du har lokale endringer. Kjør:  .\sync.ps1 `"hva du endret`"" -ForegroundColor Yellow
  git status --short
  exit 1
}

if ($UtenOllama) { $env:BOLLE_NO_OLLAMA = '1' }  # hopp over Ollama-sjekkene i bolletesten

if ($endringer) {
  git add -A
  git commit -m $Melding          # pre-commit-hooken kjører bolletesten
  if ($LASTEXITCODE -ne 0) { Write-Host 'Commit blokkert — rett feilen og prøv igjen.' -ForegroundColor Red; exit 1 }
}

git pull --rebase
if ($LASTEXITCODE -ne 0) { Write-Host 'Pull feilet (konflikt?). Løs konflikten, så kjør sync igjen.' -ForegroundColor Red; exit 1 }

if ($endringer) {
  git push
  if ($LASTEXITCODE -ne 0) { Write-Host 'Push feilet.' -ForegroundColor Red; exit 1 }
}

Write-Host ('Synk OK — ' + (git log -1 --format='%h %s')) -ForegroundColor Green

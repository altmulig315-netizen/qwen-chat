# Synk mellom maskinene

Repo: **https://github.com/altmulig315-netizen/qwen-chat** (privat)

| Maskin | Rolle |
|---|---|
| **ZeroTrust** (stasjonær PC) | **Kjøre-PC.** Kjører `server.js`, Ollama og `qwen3.8:27b`. Har fila `.kjore-pc`. |
| **Laptop** | Kun redigering. Kjører aldri server eller modell. |

## Førstegangsoppsett på laptopen

```powershell
cd $HOME\Downloads
gh repo clone altmulig315-netizen/qwen-chat
cd qwen-chat
powershell -ExecutionPolicy Bypass -File .\sync.ps1
```

`sync.ps1` aktiverer pre-commit-hooken (`hooks/pre-commit`) første gang. Lag **ikke** fila `.kjore-pc` på laptopen.

## Daglig rutine (begge maskiner)

1. **Før du starter:** `.\sync.ps1` — henter siste endringer.
2. **Når du er ferdig:** `.\sync.ps1 "kort beskrivelse"` — committer (bolletesten kjører via hooken), henter og pusher.

Hvis PowerShell nekter å kjøre skriptet: `powershell -ExecutionPolicy Bypass -File .\sync.ps1 "melding"`.

## Kjøre og teste (kun ZeroTrust)

```powershell
.\sync.ps1                  # hent endringene fra laptopen
node bolletest.js --full    # inkl. ekte svar fra modellen
node server.js              # åpne http://localhost:3000
```

## Bolletesten på de to maskinene

- **Begge:** sjekker at de fire versjonsstemplene er like `version.json`, og at serveren starter.
- **Kun kjøre-PC (`.kjore-pc` finnes):** krever i tillegg at Ollama svarer og at modellen er lastet ned. `--full` tester et ekte svar.
- **Laptop:** Ollama-sjekkene hoppes over med en tydelig melding.

## Konflikt

Har begge maskinene endret samme linje, stopper `sync.ps1` med «Pull feilet». Åpne fila, rett konflikten, så `git add <fil>` + `git rebase --continue`, og kjør `.\sync.ps1` igjen.

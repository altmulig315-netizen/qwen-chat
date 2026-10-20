# Changelog

Kategorier følger [Keep a Changelog](https://keepachangelog.com):
**Added · Changed · Deprecated · Removed · Fixed · Security**.

## [1.7.1] — 2026-10-20

### Changed
- Vedlegg er nå helt åpent: alle filer slippes inn. Bilder i alle formater (inkl. avif/heic) konverteres til PNG for vision; ukjente binærfiler blir en hex-/signatur-oppsummering modellen kan resonnere om.

### Fixed
- Siden sendes med `Cache-Control: no-store`, så nettleseren ikke viser en gammel, bufret versjon.
- `.avif` (og flere bildeformater) ble avvist av en for streng fil-sjekk.

## [1.7.0] — 2026-10-20

### Added
- Bildestøtte (vision): legg ved bildefiler (png/jpg/gif/webp) og still spørsmål om dem — modellen ser bildet.
- PDF-er uten tekstlag rendres til bilder og sendes til modellen i stedet for «skannet»-feilen.
- Modell-velgeren og statuslinja viser 👁 for modeller som kan se bilder. Vision-vakt: bilde + modell uten vision gir tydelig advarsel i stedet for stille feil.
- `/api/models` og `/api/health` melder hvilke modeller som har vision. Bolletest `--full` sjekker at en vision-modell beskriver et bilde.

## [0.6.1] — 2026-10-20

### Fixed
- Oppstartsloggen sier nå «Abliterated» (var fortsatt «qwen-chat» etter navnebyttet).

### Changed
- `/vendor/`-filene (pdf.js) sendes med `Cache-Control: max-age=86400`, så de ikke lastes ned på nytt ved hver sidelasting.

## [0.6.0] — 2026-10-20

### Added
- `start.bat`: dobbeltklikk starter serveren (hvis den ikke kjører) og åpner nettsiden i nettleseren.
- Commits får nå automatisk Claude-attribusjon via `sync.ps1`.

### Changed
- Nettsiden heter nå «Abliterated» (tittel, header, footer, Om-panel).

## [0.5.0] — 2026-10-20

### Added
- Multi-modell-velger: nedtrekksmeny i headeren lister nedlastede modeller, husker valget, og sender valgt modell med hver melding.
- Nytt endepunkt `/api/models`. `/api/chat` tar imot `model` og validerer det mot nedlastede modeller (nettsiden kan ikke sende vilkårlige verdier til Ollama).
- Bolletest `--full` sjekker `/api/models` og chat med eksplisitt valgt modell.

## [0.4.1] — 2026-10-20

### Fixed
- `.gitattributes` merker `*.pdf` som binær, så test-PDF-en ikke korrumperes av linjeskift-konvertering ved utsjekk på en annen maskin.

## [0.4.0] — 2026-10-20

### Added
- PDF-vedlegg: PDF-er leses i nettleseren med vendret pdf.js (`vendor/`), side for side, maks 20 MB. Skannet PDF uten tekst gir en tydelig melding.
- Advarsel i nettsiden når vedleggene kan overstige kontekstvinduet.
- Bolletest `--full` sjekker PDF-kodeord og et langt vedlegg (num_ctx > 4096).

### Fixed
- Kontekstvinduet var 4096 tokens som standard, så lengre vedlegg ble kuttet. `server.js` setter nå `num_ctx` 16384 (kan overstyres med `NUM_CTX`).

## [0.3.0] — 2026-10-20

### Added
- Norsk systeminstruks i `server.js`: modellen svarer alltid på norsk (bokmål) med mindre brukeren ber om noe annet.
- Bolletest `--full` sjekker at «hei» gir norsk svar.

## [0.2.0] — 2026-10-20

### Added
- Synk mellom kjøre-PC (ZeroTrust) og laptop via privat GitHub-repo: `sync.ps1`, `SYNC.md`, `CLAUDE.md`.
- Pre-commit-hooken ligger nå i repoet (`hooks/pre-commit`) og aktiveres av `sync.ps1`.

### Changed
- Bolletesten krever Ollama og modell kun på kjøre-PC-en (markørfila `.kjore-pc`, synkes ikke).

## [0.1.0] — 2026-10-20

### Added
- Lokal chat-nettside (`index.html`) med Claude-lignende oppsett og strømmede svar.
- Node-server (`server.js`) uten npm-pakker som videresender til Ollama (`qwen3.8:27b`).
- Vedlegg av tekst- og kodefiler (knapp eller dra-og-slipp, maks 2 MB per fil).
- «Ny samtale», Stopp-knapp, samtalen huskes i nettleseren.
- «Om»-panel med docs-panel-rad for versjon.
- `version.json` som eneste versjonskilde; `bolletest.js` og pre-commit-hook (apv2.2).

# Changelog

Kategorier følger [Keep a Changelog](https://keepachangelog.com):
**Added · Changed · Deprecated · Removed · Fixed · Security**.

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

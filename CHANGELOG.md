# Changelog

Kategorier følger [Keep a Changelog](https://keepachangelog.com):
**Added · Changed · Deprecated · Removed · Fixed · Security**.

## [0.1.0] — 2026-10-20

### Added
- Lokal chat-nettside (`index.html`) med Claude-lignende oppsett og strømmede svar.
- Node-server (`server.js`) uten npm-pakker som videresender til Ollama (`qwen3.8:27b`).
- Vedlegg av tekst- og kodefiler (knapp eller dra-og-slipp, maks 2 MB per fil).
- «Ny samtale», Stopp-knapp, samtalen huskes i nettleseren.
- «Om»-panel med docs-panel-rad for versjon.
- `version.json` som eneste versjonskilde; `bolletest.js` og pre-commit-hook (apv2.2).

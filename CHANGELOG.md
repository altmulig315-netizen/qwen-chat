# Changelog

Kategorier følger [Keep a Changelog](https://keepachangelog.com):
**Added · Changed · Deprecated · Removed · Fixed · Security**.

## [1.13.6] — 2026-11-03

### Changed
- Lagt til MIT-lisens (LICENSE) med kreditering av PDF.js (Mozilla, Apache 2.0), som brukes i vendor/.
- readme.txt: fjernet lokal brukersti (personlig brukernavn) og erstattet med nøytral plassholder; lagt til kort opphavsnote for PDF.js. Klargjør repoet for å gjøres offentlig.

## [1.13.5] — 2026-11-03

### Fixed
- Under strømming ble hele chatten bygget om for hver tekst-bit, så tekstmarkering forsvant straks og dobbeltklikk fikk siden til å henge. Nå oppdateres kun den siste meldingen på plass mens den strømmer (rå tekst), slik at markering og dobbeltklikk fungerer. Markdown formateres når svaret er ferdig (uendret sluttresultat).
- Auto-scroll følger bare med når du allerede er nederst; har du bladd opp eller markerer tekst, står scrollen i ro.

## [1.13.4] — 2026-11-02

### Added
- «📁 Mappe»-knapp som legger ved en hel mappe med småfiler (via webkitdirectory). Gjenbruker samme vedleggsflyt som fil-knappen.
- Grense på 100 MB totalt for mappe-opplasting: over det stopper den og peker til sti-feltet «📁 Lokal mappe for store filer», som leser store dumper (RAM/disk-image) fra disk uten opplasting. De to dekker hver sin bruk: mange småfiler vs. én stor dump.

## [1.13.3] — 2026-11-02

### Fixed
- «Tenkte»-boksen spratt igjen mens modellen tenkte, fordi hele chatten bygges om for hver strøm-bit. Boksen holdes nå åpen så lenge svaret strømmer (du ser tankene live) og faller sammen når svaret er ferdig. Da kommer ingen flere re-renders, så den kan åpnes og leses i ro.

## [1.13.2] — 2026-11-02

### Changed
- bolletest: nytt flagg `--no-ollama` som hopper over de to Ollama-sjekkene (for rene tekst-/versjon-commits der Ollama ikke trenger å kjøre).
- hooks/pre-commit: sender `--no-ollama` videre når miljøvariabelen `BOLLE_NO_OLLAMA` er satt.
- sync.ps1: ny bryter `-UtenOllama` som setter variabelen, slik at `.\sync.ps1 "melding" -UtenOllama` committer uten at Ollama må være oppe. Standard oppførsel (uten bryteren) er uendret: Ollama kreves.

## [1.13.1] — 2026-11-01

### Changed
- Systemprompt (chat): modellen får nå rollen «teknisk assistent for en cybersikkerhetsstudent i et lab-miljø» og bes svare direkte på tekniske spørsmål om systemadministrasjon, konfigurasjon, installasjon og sikkerhet. Demper unødig nøling fra modellen på vanlige IT-spørsmål. Ingen app-sperrer endret (godkjenning av kodekjøring, sti-validering og origin-sjekk står urørt).

## [1.13.0] — 2026-11-01

### Added
- Knappen «▶ Start Ollama» i headeren. Vises bare når Ollama er nede; starter `ollama serve` skjult via serveren og laster modellene inn automatisk når den svarer.
- Nytt endepunkt `POST /api/ollama/start` (venter opptil 15 sekunder på at Ollama svarer).

### Security
- `/api/ollama/start` krever `Origin` fra egen side (localhost/127.0.0.1 på serverens port), så andre nettsider ikke kan starte prosesser via skjult fetch (CSRF).

## [1.12.1] — 2026-10-21

### Fixed
- `disk_analyser` valgte feil partisjon (meta-partisjonen «Partition Table» i stedet for datapartisjonen), så filsystemet ikke kunne åpnes. Velger nå den største ekte datapartisjonen. Verifisert på et ekte Tails disk-image.

## [1.12.0] — 2026-10-21

### Added
- Lokal fil-modus: godkjenn en mappe i nettsiden, så kan agenten lese store filer (RAM-dumper, disk-images) direkte via full sti — uten opplasting og uten 60 MB-grensen.
- Nytt verktøy `list_lokale_filer` (lister filer i en godkjent mappe). Alle fil-verktøy godtar nå full sti, men kun til filer i en godkjent mappe (sti-validering mot vilkårlig lesing).
- `/api/localroot` registrerer/tømmer godkjente mapper; valget huskes i nettleseren og re-registreres ved oppstart.

## [1.11.0] — 2026-10-21

### Added
- Dedikerte forensics-/steganalyse-verktøy i agenten: `steganalyse` (LSB/append/metadata), `yara_scan` (signaturer, standard + egne regler), `pe_info` (EXE/DLL: entropi, imports, mistenkelige API), `volatility` (RAM-dump via Volatility3), `disk_analyser` (disk-image via Sleuth Kit/pytsk3).
- Pakker installert: volatility3, yara-python, pefile, Pillow, pytsk3 (i tillegg til numpy/scipy). `kjør_python` har nå disse tilgjengelig.

## [1.10.0] — 2026-10-21

### Added
- Kontekst-velger i headeren (16K / 32K / 64K / 128K): juster modellens hukommelse selv. Valget huskes og sendes med hver melding (chat og agent). Større = husker mer, men tregere (overskuddet spiller over til system-RAM).

### Changed
- Standard kontekstvindu hevet fra 16K til 32K — mindre glemming og repetisjon.

## [1.9.1] — 2026-10-21

### Fixed
- Agenten husker nå samtalen: hele historikken (dine meldinger + agentens tidligere konklusjoner) sendes med, så oppfølging som «start» beholder kontekst.
- Fersk arbeidsmappe per oppgave: opplasting av nye filer tømmer `uploads/` først, så agenten ikke roter med rester fra tidligere kjøringer.
- `dekod_lyd` sjekker at fila er WAV og gir en tydelig melding ellers (var en kryptisk scipy-feil når den ble kalt på et bilde).

## [1.9.0] — 2026-10-21

### Added
- `kjør_python`-verktøy: agenten kan skrive og kjøre egen Python-kode (numpy/scipy) når de ferdige verktøyene ikke strekker til — f.eks. en egen FSK/LSB-dekoder.
- Bekreft-før-kjør-port: hver kjøring vises som et kort i nettsiden med koden (redigerbar) og «Kjør»/«Avvis». Ingenting kjøres uten din godkjenning. Serveren pauser løkka (`/api/agent/resume`) til du svarer.
- Koden kjøres isolert (`python -I`, eget skript-katalog `runs/`, cwd = `uploads/`) så en opplastet fil ikke kan kapre import.

## [1.8.0] — 2026-10-21

### Added
- Agent-modus (🔧): modellen bruker verktøy i en løkke og viser hvert steg. Verktøy: `analyser_fil` (polyglot/stego-carver), `dekod_lyd` (SSTV/FSK), `les_vedlegg`, `list_vedlegg`, `spør_vision` (deleger bilde til en vision-modell).
- Én agent som delegerer, i stedet for separate vinduer per modell — fungerer for alle modeller med «tools»-evne.
- Standard agent-modell er Devstral (mest pålitelige verktøy-kaller i vår test: 10/10 mot 8/10 for Qwen3-Coder).
- `/api/upload` og `/api/agent` på serveren; opplastede filer ligger i `uploads/` (ikke synket).

## [1.7.2] — 2026-10-21

### Added
- Animert «tenker»-indikator (pulserende prikker) mens modellen genererer svar.

### Changed
- `start.bat`/`start.ps1` starter nå også Ollama hvis den er nede — ett dobbeltklikk får opp alt (Ollama + server + nettside).

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

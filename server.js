// qwen-chat — enkel lokal chat mot Ollama. Ingen npm-pakker.
// Versjon: se version.json (eneste kilde).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const PORT = Number(process.env.PORT) || 3000;
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.MODEL || 'qwen3.8:27b';
const AGENT_MODEL = process.env.AGENT_MODEL || 'devstral:24b-small-2505-q4_K_M'; // mest pålitelige verktøy-kaller
const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8')).version;
const MAX_BODY = 60 * 1024 * 1024; // 60 MB (opplasting av filer til analyse)
const NUM_CTX = Number(process.env.NUM_CTX) || 32768; // standard kontekstvindu; større = mer hukommelse, tregere
const MAX_CTX = Number(process.env.MAX_CTX) || 131072;
const clampCtx = (n) => Math.min(MAX_CTX, Math.max(2048, Number(n) || NUM_CTX));
const SYSTEM = 'Du er en hjelpsom assistent. Svar alltid på norsk (bokmål), med mindre brukeren eksplisitt ber om et annet språk.';
const AGENT_SYSTEM = [
  'Du er en CTF- og filanalyse-agent. Jobben din er å finne det skjulte flagget ved å følge sporene helt til mål.',
  'Regler:',
  '- Kall ETT verktøy om gangen, les resultatet, og FORTSETT til neste steg. Ikke gi opp etter ett steg.',
  '- Korte treff som X{ab} er binær-støy, IKKE ekte flagg. Et ekte flagg har meningsfylt innhold.',
  '- Når analyser_fil pakker ut filer: analyser dem videre. Lydfil (WAV) → kall dekod_lyd. Lagde den et SSTV-bilde → kall spør_vision på det bildet for å lese teksten. Bildefil → kall spør_vision.',
  '- Følg "notes" i verktøy-svarene — de sier hva neste steg bør være.',
  '- Oppsummer og oppgi flagget FØRST når du faktisk har lest det (f.eks. via spør_vision), ikke før.',
  '- Verktøy for forensics: steganalyse (LSB/stego), yara_scan (signaturer), pe_info (EXE/DLL), volatility (RAM-dump), disk_analyser (disk-image). Velg riktig verktøy for filtypen.',
  '- Store lokale filer (RAM-dumper, disk-images) lastes IKKE opp. Bruk list_lokale_filer for å se filer i en godkjent mappe, og gi så full sti som filename til verktøyene.',
  '- Dekker ikke de ferdige verktøyene oppgaven? Skriv egen Python-kode med kjor_python (numpy/scipy/yara/pefile/pytsk3/Pillow finnes). Print alltid resultatet. Brukeren må godkjenne hver kjøring.',
  'Svar på norsk.',
].join('\n');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const RUN_DIR = path.join(__dirname, 'runs'); // agentens python-skript (ren mappe, ikke på sys.path med uploads)
const PY = process.env.PYTHON || 'python';

function send(res, status, body, type = 'application/json; charset=utf-8', extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': type, 'X-App-Version': VERSION, ...extraHeaders });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('For stor forespørsel')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function health() {
  try {
    const names = await listModels();
    return { ollama: true, model: MODEL, modelFound: names.includes(MODEL), models: names, vision: await visionModels(names), agentDefault: AGENT_MODEL, version: VERSION };
  } catch {
    return { ollama: false, model: MODEL, modelFound: false, models: [], vision: [], agentDefault: AGENT_MODEL, version: VERSION };
  }
}

// Nedlastede modeller fra Ollama, sortert.
async function listModels() {
  const r = await fetch(OLLAMA + '/api/tags');
  const data = await r.json();
  return (data.models || []).map((m) => m.name).sort();
}

// Vision-evne per modell, hurtigbufret (endres ikke i løpet av kjøringen).
const visionCache = {};
async function modelHasVision(name) {
  if (name in visionCache) return visionCache[name];
  try {
    const r = await fetch(OLLAMA + '/api/show', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: name }) });
    const d = await r.json();
    visionCache[name] = Array.isArray(d.capabilities) && d.capabilities.includes('vision');
  } catch { visionCache[name] = false; }
  return visionCache[name];
}
async function visionModels(names) {
  const out = [];
  for (const n of names) if (await modelHasVision(n)) out.push(n);
  return out;
}

async function chat(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: e.message }); }
  if (!Array.isArray(body.messages)) return send(res, 400, { error: 'messages mangler' });

  // Valgt modell valideres mot faktisk nedlastede modeller — nettsiden kan ikke sende vilkårlige verdier til Ollama.
  let model = MODEL;
  if (body.model) {
    let names = [];
    try { names = await listModels(); } catch { return send(res, 502, { error: 'Får ikke kontakt med Ollama på ' + OLLAMA }); }
    if (!names.includes(body.model)) return send(res, 400, { error: 'Ukjent modell: ' + body.model });
    model = body.model;
  }

  const ac = new AbortController();
  res.on('close', () => ac.abort()); // brukeren trykket Stopp / lukket fanen

  let upstream;
  try {
    upstream = await fetch(OLLAMA + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, ...body.messages], stream: true, options: { num_ctx: clampCtx(body.num_ctx) } }),
      signal: ac.signal,
    });
  } catch (e) {
    return send(res, 502, { error: 'Får ikke kontakt med Ollama på ' + OLLAMA });
  }
  if (!upstream.ok) return send(res, upstream.status, { error: await upstream.text() });

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-App-Version': VERSION });
  try {
    for await (const chunk of upstream.body) res.write(chunk);
  } catch { /* avbrutt */ }
  res.end();
}

// ---- Agent: opplasting, verktøy og løkke ----
function ensureUpload() { if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true }); }
const safeName = (n) => path.basename(String(n || '')).replace(/[^A-Za-z0-9._-]/g, '_');

// Lokal fil-modus: mapper brukeren har godkjent at agenten får lese fra (for store filer uten opplasting).
const allowedRoots = new Set();
function isUnderAllowed(abs) {
  const r = path.resolve(abs);
  for (const root of allowedRoots) {
    const rr = path.resolve(root);
    if (r === rr || r.startsWith(rr + path.sep)) return true;
  }
  return false;
}
// Finn fila: absolutt sti (kun i godkjent mappe) ELLER opplastet filnavn i uploads/.
function resolveFile(name) {
  if (!name) return null;
  if (path.isAbsolute(name)) {
    const abs = path.resolve(name);
    return (isUnderAllowed(abs) && fs.existsSync(abs)) ? abs : null;
  }
  const up = path.join(UPLOAD_DIR, safeName(name));
  return fs.existsSync(up) ? up : null;
}

// Kjør et av VÅRE python-skript (ikke brukerens fil) med -I, filsti som argument.
function runPy(script, args) {
  return new Promise((resolve) => {
    execFile(PY, ['-I', path.join(__dirname, 'tools', script), ...args], { maxBuffer: 20 * 1024 * 1024, timeout: 120000 },
      (err, stdout, stderr) => resolve(err ? JSON.stringify({ error: (stderr || err.message).slice(0, 500) }) : stdout.trim()));
  });
}

// Verktøy-definisjoner som sendes til modellen.
const TOOLS = [
  { type: 'function', function: { name: 'list_vedlegg', description: 'List opplastede filer som kan analyseres', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'list_lokale_filer', description: 'List filer i en godkjent lokal mappe (for store filer uten opplasting, f.eks. RAM-dumper/disk-images). Oppgi full mappesti.', parameters: { type: 'object', properties: { folder: { type: 'string' } }, required: ['folder'] } } },
  { type: 'function', function: { name: 'analyser_fil', description: 'Analyser en fil: finn signaturer, pakk ut innebygde lag (zip/bilder), søk etter flagg. Utpakkede filer blir nye vedlegg.', parameters: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] } } },
  { type: 'function', function: { name: 'dekod_lyd', description: 'Dekod en lydfil (WAV): prøv SSTV (lager bilde) og FSK. Bruk spør_vision på SSTV-bildet etterpå.', parameters: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] } } },
  { type: 'function', function: { name: 'les_vedlegg', description: 'Les tekstinnholdet i en opplastet fil', parameters: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] } } },
  { type: 'function', function: { name: 'spor_vision', description: 'La en vision-modell se på et bilde og svare på et spørsmål (f.eks. lese tekst/flagg)', parameters: { type: 'object', properties: { filename: { type: 'string' }, question: { type: 'string' } }, required: ['filename', 'question'] } } },
  { type: 'function', function: { name: 'steganalyse', description: 'Steganalyse av en fil: LSB-ekstraksjon fra bilder, strenger, data skjult etter filslutt, metadata, flagg-søk.', parameters: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] } } },
  { type: 'function', function: { name: 'yara_scan', description: 'Søk i en fil med YARA-regler. Uten egne regler brukes et standardsett (PE/ELF, URL, base64, flagg, mistenkelige API). Gi egne regler i "rules" ved behov.', parameters: { type: 'object', properties: { filename: { type: 'string' }, rules: { type: 'string' } }, required: ['filename'] } } },
  { type: 'function', function: { name: 'pe_info', description: 'Analyser en Windows-binær (EXE/DLL): seksjoner, entropi (pakket?), imports, mistenkelige API-kall.', parameters: { type: 'object', properties: { filename: { type: 'string' } }, required: ['filename'] } } },
  { type: 'function', function: { name: 'volatility', description: 'Minne-forensics på en RAM-dump med Volatility3. plugin f.eks. windows.info, windows.pslist, windows.netscan, windows.pstree, windows.cmdline. Standard: windows.info.', parameters: { type: 'object', properties: { filename: { type: 'string' }, plugin: { type: 'string' } }, required: ['filename'] } } },
  { type: 'function', function: { name: 'disk_analyser', description: 'Disk-image-analyse (Sleuth Kit): list partisjoner eller filer. action = "partitions" (standard) eller "files".', parameters: { type: 'object', properties: { filename: { type: 'string' }, action: { type: 'string' } }, required: ['filename'] } } },
  { type: 'function', function: { name: 'kjor_python', description: 'Skriv og kjør egen Python-kode for analyse (numpy/scipy tilgjengelig; kjører i mappa med de opplastede filene). KREVER brukerens godkjenning før kjøring. Bruk til det de ferdige verktøyene ikke dekker, f.eks. egen FSK/LSB-dekoder.', parameters: { type: 'object', properties: { code: { type: 'string', description: 'Python-koden. Skriv ut resultatet med print().' }, hensikt: { type: 'string', description: 'Kort hva koden gjør' } }, required: ['code'] } } },
];

async function askVision(file, question) {
  const names = await listModels();
  const vis = (await visionModels(names));
  const vm = vis.includes(MODEL) ? MODEL : vis[0];
  if (!vm) return 'Ingen vision-modell tilgjengelig.';
  const b64 = fs.readFileSync(file).toString('base64');
  const r = await fetch(OLLAMA + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: vm, stream: false, messages: [{ role: 'user', content: question, images: [b64] }] }) });
  const d = await r.json();
  return (d.message && d.message.content) || 'Vision-modellen ga ikke noe svar.';
}

async function executeTool(name, args) {
  try {
    if (name === 'list_vedlegg') { ensureUpload(); return JSON.stringify({ files: fs.readdirSync(UPLOAD_DIR) }); }
    if (name === 'list_lokale_filer') {
      const f = path.resolve(String(args.folder || ''));
      if (!isUnderAllowed(f)) return JSON.stringify({ error: 'Mappa er ikke godkjent. Godkjente mapper: ' + ([...allowedRoots].join(', ') || 'ingen') });
      try { return JSON.stringify({ folder: f, files: fs.readdirSync(f).slice(0, 300) }); } catch (e) { return JSON.stringify({ error: String(e.message) }); }
    }
    const fileTools = ['analyser_fil', 'dekod_lyd', 'les_vedlegg', 'spor_vision', 'steganalyse', 'yara_scan', 'pe_info', 'volatility', 'disk_analyser'];
    const file = resolveFile(args.filename);
    if (fileTools.includes(name) && !file)
      return JSON.stringify({ error: 'Finner ikke fila (eller ikke i godkjent mappe): ' + args.filename + '. Lokale filer må ligge i en godkjent mappe.' });
    if (name === 'analyser_fil') return await runPy('analyze.py', [file, UPLOAD_DIR]);
    if (name === 'dekod_lyd') return await runPy('audio.py', [file, UPLOAD_DIR]);
    if (name === 'les_vedlegg') return fs.readFileSync(file, 'utf8').slice(0, 20000);
    if (name === 'spor_vision') return await askVision(file, String(args.question || 'Hva ser du? Les eventuell tekst.'));
    if (name === 'steganalyse') return await runPy('stego_tool.py', [file, UPLOAD_DIR]);
    if (name === 'yara_scan') return await runPy('yara_tool.py', [file, String(args.rules || '')]);
    if (name === 'pe_info') return await runPy('pe_tool.py', [file]);
    if (name === 'volatility') return await runPy('vol_tool.py', [file, String(args.plugin || '')]);
    if (name === 'disk_analyser') return await runPy('disk_tool.py', [file, String(args.action || 'partitions')]);
    return JSON.stringify({ error: 'Ukjent verktøy ' + name });
  } catch (e) { return JSON.stringify({ error: String(e.message || e) }); }
}

// Ventende python-kjøringer som trenger brukerens godkjenning (id -> løkke-tilstand).
const pendingRuns = new Map();
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Kjør modellens egen Python-kode ETTER godkjenning. Script-fila ligger i ren RUN_DIR
// (ikke uploads) så en opplastet "numpy.py" e.l. ikke kan kapres; cwd = uploads for filtilgang.
function executePython(code) {
  return new Promise((resolve) => {
    if (!fs.existsSync(RUN_DIR)) fs.mkdirSync(RUN_DIR, { recursive: true });
    ensureUpload();
    const f = path.join(RUN_DIR, '_run_' + newId() + '.py');
    fs.writeFileSync(f, String(code));
    execFile(PY, ['-I', f], { cwd: UPLOAD_DIR, maxBuffer: 20 * 1024 * 1024, timeout: 120000 }, (err, stdout, stderr) => {
      try { fs.unlinkSync(f); } catch {}
      const out = (stdout || '') + (stderr ? '\n[stderr] ' + stderr : '');
      resolve((err && !stdout) ? ('[feil] ' + String(stderr || err.message).slice(0, 2000)) : (out.slice(0, 8000) || '(ingen utskrift)'));
    });
  });
}

// Verktøy-løkka. Pauser (return) når modellen vil kjøre python, og venter på godkjenning.
async function runLoop(res, model, messages, startStep, emit, numCtx) {
  for (let step = startStep; step < 16; step++) {
    const r = await fetch(OLLAMA + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, tools: TOOLS, stream: false, options: { num_ctx: numCtx } }) });
    if (!r.ok) { emit({ error: await r.text() }); return; }
    const d = await r.json();
    const msg = d.message || {};
    if (msg.content) emit({ type: 'assistant', content: msg.content });
    const calls = msg.tool_calls || [];
    if (!calls.length) { emit({ type: 'done' }); return; }
    messages.push(msg);
    for (let i = 0; i < calls.length; i++) {
      const c = calls[i];
      const fn = c.function.name;
      let a = c.function.arguments; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
      if (fn === 'kjor_python') {
        const id = newId();
        pendingRuns.set(id, { model, messages, step, remaining: calls.slice(i + 1), numCtx });
        emit({ type: 'approval', id, code: String((a && a.code) || ''), hensikt: String((a && a.hensikt) || '') });
        return; // stream slutter; UI gjenopptar via /api/agent/resume
      }
      emit({ type: 'tool_call', name: fn, args: a });
      const result = await executeTool(fn, a || {});
      emit({ type: 'tool_result', name: fn, result: String(result).slice(0, 2000) });
      messages.push({ role: 'tool', content: String(result) });
    }
    if (step === 15) emit({ type: 'assistant', content: '(nådde maks antall verktøy-steg)' });
  }
}

async function agent(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: e.message }); }
  if (!Array.isArray(body.messages)) return send(res, 400, { error: 'messages mangler' });
  let model = AGENT_MODEL;
  const names = await listModels().catch(() => []);
  if (body.model && names.includes(body.model)) model = body.model;
  else if (!names.includes(model) && names[0]) model = names[0];
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-App-Version': VERSION });
  const emit = (o) => res.write(JSON.stringify(o) + '\n');
  const messages = [{ role: 'system', content: AGENT_SYSTEM }, ...body.messages];
  try { await runLoop(res, model, messages, 0, emit, clampCtx(body.num_ctx)); } catch (e) { emit({ error: String(e.message || e) }); }
  res.end();
}

// Brukeren har godkjent (eller avvist) en python-kjøring — gjenoppta løkka.
async function agentResume(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: e.message }); }
  const st = pendingRuns.get(body.id);
  if (!st) return send(res, 400, { error: 'Ukjent eller utløpt godkjennings-id' });
  pendingRuns.delete(body.id);
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-App-Version': VERSION });
  const emit = (o) => res.write(JSON.stringify(o) + '\n');
  try {
    let result;
    if (body.approved) {
      result = await executePython(body.code != null ? body.code : '');
      emit({ type: 'tool_result', name: 'kjor_python', result: String(result).slice(0, 2000) });
    } else {
      result = 'Bruker avviste kjøringen av denne koden. Prøv en annen tilnærming.';
      emit({ type: 'tool_result', name: 'kjor_python', result: 'Avvist av bruker.' });
    }
    st.messages.push({ role: 'tool', content: String(result) });
    // gjenstående kall i samme tur
    for (const c of (st.remaining || [])) {
      const fn = c.function.name;
      let a = c.function.arguments; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
      if (fn === 'kjor_python') {
        const id = newId();
        pendingRuns.set(id, { model: st.model, messages: st.messages, step: st.step, remaining: [], numCtx: st.numCtx });
        emit({ type: 'approval', id, code: String((a && a.code) || ''), hensikt: String((a && a.hensikt) || '') });
        return res.end();
      }
      emit({ type: 'tool_call', name: fn, args: a });
      const r2 = await executeTool(fn, a || {});
      emit({ type: 'tool_result', name: fn, result: String(r2).slice(0, 2000) });
      st.messages.push({ role: 'tool', content: String(r2) });
    }
    await runLoop(res, st.model, st.messages, st.step + 1, emit, st.numCtx || NUM_CTX);
  } catch (e) { emit({ error: String(e.message || e) }); }
  res.end();
}

function clearUploads() {
  if (!fs.existsSync(UPLOAD_DIR)) return;
  for (const n of fs.readdirSync(UPLOAD_DIR)) {
    try { fs.rmSync(path.join(UPLOAD_DIR, n), { recursive: true, force: true }); } catch {}
  }
}

async function localroot(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: e.message }); }
  if (body.clear) { allowedRoots.clear(); return send(res, 200, { roots: [] }); }
  if (body.path) {
    const p = path.resolve(String(body.path));
    try {
      if (!fs.statSync(p).isDirectory()) return send(res, 400, { error: 'Ikke en mappe: ' + p });
    } catch { return send(res, 400, { error: 'Mappa finnes ikke: ' + p }); }
    allowedRoots.add(p);
  }
  return send(res, 200, { roots: [...allowedRoots] });
}

async function upload(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: e.message }); }
  if (!body.filename || !body.data) return send(res, 400, { error: 'filename og data (base64) kreves' });
  ensureUpload();
  if (body.reset) clearUploads(); // ny oppgave: fjern rester fra forrige kjøring
  const name = safeName(body.filename);
  try { fs.writeFileSync(path.join(UPLOAD_DIR, name), Buffer.from(body.data, 'base64')); }
  catch (e) { return send(res, 500, { error: String(e.message) }); }
  return send(res, 200, { ok: true, filename: name });
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    // no-store: nettleseren skal aldri vise en gammel, bufret versjon av siden.
    return send(res, 200, fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
  }
  if (req.method === 'GET' && (url === '/vendor/pdf.min.mjs' || url === '/vendor/pdf.worker.min.mjs')) {
    const file = path.join(__dirname, 'vendor', path.basename(url));
    if (fs.existsSync(file)) return send(res, 200, fs.readFileSync(file, 'utf8'), 'text/javascript; charset=utf-8', { 'Cache-Control': 'max-age=86400' });
  }
  if (req.method === 'GET' && url === '/api/health') return send(res, 200, await health());
  if (req.method === 'GET' && url === '/api/models') {
    try { const names = await listModels(); return send(res, 200, { models: names, vision: await visionModels(names), default: MODEL, agentDefault: AGENT_MODEL }); }
    catch { return send(res, 502, { error: 'Får ikke kontakt med Ollama' }); }
  }
  if (req.method === 'POST' && url === '/api/chat') return chat(req, res);
  if (req.method === 'POST' && url === '/api/upload') return upload(req, res);
  if (req.method === 'POST' && url === '/api/localroot') return localroot(req, res);
  if (req.method === 'POST' && url === '/api/agent') return agent(req, res);
  if (req.method === 'POST' && url === '/api/agent/resume') return agentResume(req, res);
  send(res, 404, { error: 'Ikke funnet' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Abliterated v${VERSION} kjører på http://localhost:${PORT}  (modell: ${MODEL})`);
});

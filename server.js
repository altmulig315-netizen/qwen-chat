// qwen-chat — enkel lokal chat mot Ollama. Ingen npm-pakker.
// Versjon: se version.json (eneste kilde).
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const OLLAMA = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.MODEL || 'qwen3.8:27b';
const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'version.json'), 'utf8')).version;
const MAX_BODY = 25 * 1024 * 1024; // 25 MB (vedlegg)
const NUM_CTX = Number(process.env.NUM_CTX) || 16384; // kontekstvindu; større = lengre vedlegg, tregere
const SYSTEM = 'Du er en hjelpsom assistent. Svar alltid på norsk (bokmål), med mindre brukeren eksplisitt ber om et annet språk.';

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
    return { ollama: true, model: MODEL, modelFound: names.includes(MODEL), models: names, version: VERSION };
  } catch {
    return { ollama: false, model: MODEL, modelFound: false, models: [], version: VERSION };
  }
}

// Nedlastede modeller fra Ollama, sortert.
async function listModels() {
  const r = await fetch(OLLAMA + '/api/tags');
  const data = await r.json();
  return (data.models || []).map((m) => m.name).sort();
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
      body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, ...body.messages], stream: true, options: { num_ctx: NUM_CTX } }),
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

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    return send(res, 200, fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8'), 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && (url === '/vendor/pdf.min.mjs' || url === '/vendor/pdf.worker.min.mjs')) {
    const file = path.join(__dirname, 'vendor', path.basename(url));
    if (fs.existsSync(file)) return send(res, 200, fs.readFileSync(file, 'utf8'), 'text/javascript; charset=utf-8', { 'Cache-Control': 'max-age=86400' });
  }
  if (req.method === 'GET' && url === '/api/health') return send(res, 200, await health());
  if (req.method === 'GET' && url === '/api/models') {
    try { return send(res, 200, { models: await listModels(), default: MODEL }); }
    catch { return send(res, 502, { error: 'Får ikke kontakt med Ollama' }); }
  }
  if (req.method === 'POST' && url === '/api/chat') return chat(req, res);
  send(res, 404, { error: 'Ikke funnet' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Abliterated v${VERSION} kjører på http://localhost:${PORT}  (modell: ${MODEL})`);
});

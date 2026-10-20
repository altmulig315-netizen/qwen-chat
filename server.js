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
const SYSTEM = 'Du er en hjelpsom assistent. Svar alltid på norsk (bokmål), med mindre brukeren eksplisitt ber om et annet språk.';

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-App-Version': VERSION });
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
    const r = await fetch(OLLAMA + '/api/tags');
    const data = await r.json();
    const names = (data.models || []).map((m) => m.name);
    return { ollama: true, model: MODEL, modelFound: names.includes(MODEL), version: VERSION };
  } catch {
    return { ollama: false, model: MODEL, modelFound: false, version: VERSION };
  }
}

async function chat(req, res) {
  let body;
  try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: e.message }); }
  if (!Array.isArray(body.messages)) return send(res, 400, { error: 'messages mangler' });

  const ac = new AbortController();
  res.on('close', () => ac.abort()); // brukeren trykket Stopp / lukket fanen

  let upstream;
  try {
    upstream = await fetch(OLLAMA + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYSTEM }, ...body.messages], stream: true }),
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
  if (req.method === 'GET' && url === '/api/health') return send(res, 200, await health());
  if (req.method === 'POST' && url === '/api/chat') return chat(req, res);
  send(res, 404, { error: 'Ikke funnet' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`qwen-chat v${VERSION} kjører på http://localhost:${PORT}  (modell: ${MODEL})`);
});

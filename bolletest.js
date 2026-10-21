// bolletest — apv2.2-verifisering. Kjør: node bolletest.js   (med --full: også ekte chat-svar fra modellen)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

// Lager et lite rødt PNG (64x64) som base64 — til vision-sjekken.
function redPngBase64() {
  const w = 64, h = 64;
  const px = []; for (let i = 0; i < w; i++) px.push(255, 0, 0);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(px)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0, 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit, truecolor RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
  return png.toString('base64');
}
const full = process.argv.includes('--full');
let failed = 0;
const ok = (name, cond, info = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (info ? '  (' + info + ')' : ''));
  if (!cond) failed++;
};

async function main() {
  console.log('bolletest');

  // 1. Versjonsstempler: version.json er kilden, de fire feltene må være identiske med den.
  const source = JSON.parse(read('version.json')).version;
  const html = read('index.html');
  const pick = (re, s) => (s.match(re) || [])[1] || null;
  const stamps = {
    header: pick(/data-stamp="header"[^>]*>\s*v?(\d+\.\d+\.\d+)/, html),
    footer: pick(/data-stamp="footer"[^>]*>[^<]*?v(\d+\.\d+\.\d+)/, html),
    changelog: pick(/^## \[(\d+\.\d+\.\d+)\]/m, read('CHANGELOG.md')),
    docs: pick(/data-stamp="docs"[^>]*>\s*v?(\d+\.\d+\.\d+)/, html),
  };
  const unique = new Set([source, ...Object.values(stamps)]);
  ok('fire versjonsstempler like version.json', unique.size === 1 && !unique.has(null),
    'kilde ' + source + ' · ' + Object.entries(stamps).map(([k, v]) => k + '=' + v).join(' '));

  // 2. Serveren starter og leverer siden med versjons-header.
  const port = 3999;
  const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: { ...process.env, PORT: port } });
  const base = 'http://127.0.0.1:' + port;
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('server startet ikke')), 5000);
      srv.stdout.on('data', () => { clearTimeout(t); resolve(); });
      srv.on('exit', () => reject(new Error('server avsluttet')));
    });
    const page = await fetch(base + '/');
    ok('server leverer siden', page.status === 200);
    ok('X-App-Version-header = ' + source, page.headers.get('x-app-version') === source, page.headers.get('x-app-version'));
    ok('siden har no-store (ingen bufring)', (page.headers.get('cache-control') || '').includes('no-store'), page.headers.get('cache-control'));

    // 3. Ollama og modellen — påkrevd kun på kjøre-PC-en (markørfila .kjore-pc, synkes ikke).
    const runPc = fs.existsSync(path.join(__dirname, '.kjore-pc'));
    const h = await (await fetch(base + '/api/health')).json();
    if (runPc) {
      ok('Ollama svarer', h.ollama);
      ok('modellen ' + h.model + ' er lastet ned', h.modelFound);
    } else {
      console.log('  – Ollama-sjekker hoppet over (ikke kjøre-PC, ingen .kjore-pc)');
    }

    // 4. (--full, kun kjøre-PC) Ekte svar fra modellen, med et vedlegg.
    if (full && runPc && h.modelFound) {
      const secret = 'BOLLE' + Math.floor(Math.random() * 9000 + 1000);
      const content = 'Vedlagt fil: test.txt\n```\nKodeordet er ' + secret + '.\n```\n\nHva er kodeordet i fila? Svar kun med kodeordet.';
      const r = await fetch(base + '/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content }] }),
      });
      let text = '', chunks = 0;
      for (const line of (await r.text()).split('\n')) {
        if (!line.trim()) continue;
        const j = JSON.parse(line);
        if (j.message && j.message.content) { text += j.message.content; chunks++; }
      }
      ok('modellen svarer strømmet', chunks > 1, chunks + ' biter');
      ok('modellen leste vedlegget', text.includes(secret), 'svar: ' + text.trim().slice(0, 60));

      // Norsk systeminstruks: «hei» skal gi norsk svar.
      const r2 = await fetch(base + '/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'hei' }] }),
      });
      let hei = '';
      for (const line of (await r2.text()).split('\n')) {
        if (!line.trim()) continue;
        const j = JSON.parse(line);
        if (j.message && j.message.content) hei += j.message.content;
      }
      const norsk = /\b(jeg|deg|hjelpe|hva|kan)\b/i.test(hei) && !/\b(how|help|you)\b/i.test(hei);
      ok('svarer på norsk', norsk, 'svar: ' + hei.trim().slice(0, 60));

      // Multi-modell: /api/models lister nedlastede modeller, og chat virker med eksplisitt valgt modell.
      const models = (await (await fetch(base + '/api/models')).json()).models;
      ok('/api/models lister modeller', Array.isArray(models) && models.length > 0, (models || []).length + ' modeller');
      const valgtSvar = await (async () => {
        const r = await fetch(base + '/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: h.model, messages: [{ role: 'user', content: 'Svar kun med ordet OK.' }] }),
        });
        let t = '';
        for (const line of (await r.text()).split('\n')) { if (!line.trim()) continue; const j = JSON.parse(line); if (j.message && j.message.content) t += j.message.content; }
        return t;
      })();
      ok('chat med eksplisitt valgt modell', valgtSvar.trim().length > 0, 'svar: ' + valgtSvar.trim().slice(0, 40));
      const ukjent = await fetch(base + '/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'finnes-ikke:xyz', messages: [{ role: 'user', content: 'hei' }] }),
      });
      ok('ukjent modell avvises', ukjent.status === 400, 'status ' + ukjent.status);

      // Vision: /api/models melder vision-evne, og en vision-modell beskriver et bilde.
      const minfo = await (await fetch(base + '/api/models')).json();
      ok('/api/models melder vision-evne', Array.isArray(minfo.vision) && minfo.vision.length > 0, 'vision: ' + (minfo.vision || []).join(', '));
      const vmodel = (minfo.vision || []).includes(h.model) ? h.model : (minfo.vision || [])[0];
      if (vmodel) {
        const r = await fetch(base + '/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: vmodel, messages: [{ role: 'user', content: 'Hvilken farge har bildet? Svar med ett ord.', images: [redPngBase64()] }] }),
        });
        let vt = '';
        for (const line of (await r.text()).split('\n')) { if (!line.trim()) continue; const j = JSON.parse(line); if (j.message && j.message.content) vt += j.message.content; }
        ok('vision-modell beskriver bilde', /r(ø|o)d|red/i.test(vt), 'svar: ' + vt.trim().slice(0, 40));
      } else {
        ok('vision-modell finnes', false, 'ingen vision-modell nedlastet');
      }

      // Agent: last opp en fil og sjekk at agenten gjør minst ett verktøy-kall (verktøy-løkka virker).
      const up = await fetch(base + '/api/upload', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'test.pdf', data: fs.readFileSync(path.join(__dirname, 'test', 'test.pdf')).toString('base64') }),
      });
      ok('/api/upload lagrer fil', (await up.json()).ok === true);
      const amodel = minfo.agentDefault && (minfo.models || []).includes(minfo.agentDefault) ? minfo.agentDefault : (minfo.models || [])[0];
      const ar = await fetch(base + '/api/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: amodel, messages: [{ role: 'user', content: 'Analyser test.pdf og si hva slags fil det er.' }] }),
      });
      let toolCalled = false, agentErr = '';
      for (const line of (await ar.text()).split('\n')) {
        if (!line.trim()) continue;
        const e = JSON.parse(line);
        if (e.type === 'tool_call') toolCalled = true;
        if (e.error) agentErr = e.error;
      }
      ok('agent kaller verktøy (verktøy-løkke)', toolCalled, agentErr ? 'feil: ' + agentErr.slice(0, 50) : 'modell: ' + amodel);

      // Hjelper: send innhold og samle hele svaret.
      const ask = async (content) => {
        const r = await fetch(base + '/api/chat', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [{ role: 'user', content }] }),
        });
        let t = '';
        for (const line of (await r.text()).split('\n')) {
          if (!line.trim()) continue;
          const j = JSON.parse(line);
          if (j.message && j.message.content) t += j.message.content;
        }
        return t;
      };

      // PDF-vedlegg: trekk ut test/test.pdf med samme pdf.js som nettsiden, modellen må finne kodeordet.
      const { extractPdf } = await import('./test/pdf-node.mjs');
      const pdfText = await extractPdf(path.join(__dirname, 'test', 'test.pdf'));
      const pdfSvar = await ask('Vedlagt fil: test.pdf\n```\n' + pdfText + '\n```\n\nHva er kodeordet i PDF-en? Svar kun med kodeordet.');
      ok('modellen leste PDF-vedlegget', pdfSvar.includes('PDFBOLLE4231'), 'svar: ' + pdfSvar.trim().slice(0, 60));

      // Langt vedlegg (~6000 tokens): kodeordet står helt først. Beviser at konteksten ikke kuttes ved 4096.
      const langSecret = 'LANGBOLLE' + Math.floor(Math.random() * 9000 + 1000);
      const fyll = ('Dette er en lang testtekst som fyller opp kontekstvinduet. ').repeat(600);
      const langSvar = await ask('Vedlagt fil: lang.txt\n```\nKodeordet er ' + langSecret + '.\n\n' + fyll + '\n```\n\nHva er kodeordet som står helt først i fila? Svar kun med kodeordet.');
      ok('leser langt vedlegg (num_ctx > 4096)', langSvar.includes(langSecret), 'svar: ' + langSvar.trim().slice(0, 60));
    }
  } catch (e) {
    ok('server', false, e.message);
  } finally {
    const exited = new Promise((r) => srv.exitCode !== null ? r() : srv.on('exit', r));
    srv.kill();
    await exited;
  }

  console.log(failed ? `\nbolletest FEILET (${failed})` : '\nbolletest OK');
  process.exitCode = failed ? 1 : 0;
}
main();

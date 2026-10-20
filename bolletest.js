// bolletest — apv2.2-verifisering. Kjør: node bolletest.js   (med --full: også ekte chat-svar fra modellen)
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
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

    // 3. Ollama og modellen.
    const h = await (await fetch(base + '/api/health')).json();
    ok('Ollama svarer', h.ollama);
    ok('modellen ' + h.model + ' er lastet ned', h.modelFound);

    // 4. (--full) Ekte svar fra modellen, med et vedlegg.
    if (full && h.modelFound) {
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

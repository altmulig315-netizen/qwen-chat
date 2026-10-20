// Trekker ut tekst fra en PDF i Node med den vendrede pdf.js. Kun for bolletesten.
// Nettsiden bruker samme pdf.js, men inline i nettleseren.
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

const dir = path.dirname(fileURLToPath(import.meta.url));

export async function extractPdf(filePath) {
  const pdfjs = await import('../vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(dir, '..', 'vendor', 'pdf.worker.min.mjs')).href;
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    out += `--- side ${p} ---\n` + content.items.map((i) => i.str).join(' ') + '\n';
  }
  return out;
}

// CLI kun når modulen kjøres direkte (ikke når bolletesten importerer den).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href && process.argv[2]) {
  extractPdf(process.argv[2]).then((t) => { console.log(t); }).catch((e) => { console.error(e.message); process.exit(1); });
}

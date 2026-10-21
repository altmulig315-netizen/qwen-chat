# analyse-verktøy for agenten. Kjør: python -I analyze.py <fil> <ut-mappe>
# Skriver kompakt JSON til stdout: signaturer, utpakkede/carvede filer, flagg-kandidater.
import sys, os, re, json, zipfile, io
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

SIGS = {
    b'\x89PNG\r\n\x1a\n': 'png', b'\xff\xd8\xff': 'jpg', b'PK\x03\x04': 'zip',
    b'%PDF': 'pdf', b'RIFF': 'wav', b'GIF8': 'gif', b'\x1f\x8b\x08': 'gz',
}
FLAG = re.compile(rb'[A-Za-z0-9_]{1,30}\{[ -~]{2,120}\}')

def clean_flags(b):
    out = []
    for m in FLAG.findall(b):
        s = m.decode('latin1')
        inner = s[s.index('{')+1:-1]
        # ekte flagg: minst 4 tegn inni, og nesten bare alfanumerisk (ikke binær-støy)
        if len(inner) >= 4 and sum(c.isalnum() or c in '_-.' for c in inner) / len(inner) > 0.85:
            out.append(s)
    return sorted(set(out))

def find_all(d, n):
    i, out = 0, []
    while True:
        j = d.find(n, i)
        if j < 0: break
        out.append(j); i = j + 1
        if len(out) > 50: break
    return out

def analyze(path, outdir):
    data = open(path, 'rb').read()
    os.makedirs(outdir, exist_ok=True)
    res = {'file': os.path.basename(path), 'size': len(data), 'signatures': [], 'flags': clean_flags(data),
           'embedded': [], 'notes': []}
    # signaturer
    sigs = []
    for sig, ext in SIGS.items():
        for off in find_all(data, sig):
            sigs.append({'type': ext, 'offset': off})
    sigs.sort(key=lambda s: s['offset'])
    res['signatures'] = sigs[:30]
    # fiks ødelagt PNG-sig i starten (polyglot-triks)
    if data[1:8] == b'PNG\r\n\x1a\n' and data[0] != 0x89:
        fixed = bytearray(data); fixed[0] = 0x89
        name = os.path.join(outdir, 'fixed_header.png')
        open(name, 'wb').write(bytes(fixed))
        res['embedded'].append({'type': 'png', 'note': 'reparert PNG-signatur (var ødelagt)', 'saved_as': os.path.basename(name)})
    # pakk ut ZIP
    for off in find_all(data, b'PK\x03\x04'):
        try:
            z = zipfile.ZipFile(io.BytesIO(data[off:]))
            for nm in z.namelist():
                content = z.read(nm)
                safe = os.path.join(outdir, 'zip_' + os.path.basename(nm))
                open(safe, 'wb').write(content)
                e = {'type': 'zip-entry', 'name': nm, 'size': len(content), 'saved_as': os.path.basename(safe)}
                f = clean_flags(content)
                if f: e['flags'] = f
                res['embedded'].append(e)
            break
        except Exception:
            pass
    # carve JPEG-er rent (SOI->EOI) med dimensjoner
    for off in find_all(data, b'\xff\xd8\xff'):
        e = data.find(b'\xff\xd9', off)
        if e < 0: continue
        jpg = data[off:e+2]
        if len(jpg) < 1000: continue
        name = os.path.join(outdir, f'jpg_{off}.jpg')
        open(name, 'wb').write(jpg)
        res['embedded'].append({'type': 'jpg', 'offset': off, 'size': len(jpg), 'saved_as': os.path.basename(name)})
    # notater som hjelper agenten videre
    types = {s['type'] for s in sigs}
    if 'wav' in types or any('wav' in (e.get('name','')+e.get('saved_as','')) for e in res['embedded']):
        res['notes'].append('Inneholder lyd (WAV). Flagg kan være skjult som lyd-steganografi: SSTV-bilde, FSK/Morse, eller LSB. Krever lyd-dekoding.')
    if 'png' in types or 'jpg' in types:
        res['notes'].append('Inneholder bilde(r). Bruk spør_vision på de carvede bildefilene for å lese synlig tekst/flagg.')
    if not res['flags']:
        res['notes'].append('Ingen flagg i klartekst. Analyser de utpakkede filene (kall analyser_fil på dem) eller bruk spør_vision/lyd-dekoding.')
    return res

if __name__ == '__main__':
    try:
        print(json.dumps(analyze(sys.argv[1], sys.argv[2]), ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)}))

# steganalyse for agenten. Kjør: python -I stego_tool.py <fil> <ut-mappe>
# LSB-ekstraksjon fra bilder, strings, data etter filslutt, metadata, flagg-søk.
import sys, os, re, json
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass
FLAG = re.compile(rb'[A-Za-z0-9_]{1,16}\{[ -~]{3,100}\}')

def flags(b):
    out = []
    for m in FLAG.findall(b):
        s = m.decode('latin1'); inner = s[s.index('{')+1:-1]
        if len(inner) >= 3 and sum(c.isalnum() or c in '_-.' for c in inner)/len(inner) > 0.8:
            out.append(s)
    return sorted(set(out))

def strings_min(b, n=6):
    return [s.decode('latin1') for s in re.findall(rb'[\x20-\x7e]{%d,}' % n, b)]

def main(path, outdir):
    data = open(path, 'rb').read()
    res = {'file': os.path.basename(path), 'size': len(data), 'flagg': flags(data), 'notes': []}
    # interessante strenger (begrens)
    ss = strings_min(data)
    interessante = [s for s in ss if re.search(r'(flag|key|pass|secret|http|BEGIN)', s, re.I)][:15]
    if interessante: res['interessante_strenger'] = interessante

    # Bilde? LSB-ekstraksjon + data etter bildeslutt + metadata
    try:
        from PIL import Image
        import numpy as np
        img = Image.open(path)
        res['bilde'] = {'format': img.format, 'storrelse': list(img.size), 'modus': img.mode}
        if img.info:
            meta = {k: str(v)[:120] for k, v in img.info.items() if k not in ('icc_profile',)}
            if meta: res['metadata'] = meta
        arr = np.array(img.convert('RGB'))
        # LSB av R,G,B flat -> bytes
        for planes in (['R'], ['R', 'G', 'B']):
            idx = {'R': 0, 'G': 1, 'B': 2}
            bits = np.unpackbits(arr[:, :, [idx[p] for p in planes]].astype(np.uint8) & 1, axis=None)
            n = (len(bits) // 8) * 8
            by = np.packbits(bits[:n]).tobytes()
            f = flags(by)
            if f: res.setdefault('lsb_flagg', []).extend([{'planes': ''.join(planes), 'flagg': f}])
        # data etter dekodet bilde (append-stego)
        end = img.fp.tell() if hasattr(img, 'fp') and img.fp else None
    except Exception as e:
        res['notes'].append('Ikke et bilde PIL kan åpne, eller LSB feilet: ' + str(e)[:80])

    # Data etter kjente filsluttmarkører (append-stego)
    for marker, name in [(b'IEND\xaeB`\x82', 'PNG'), (b'\xff\xd9', 'JPEG')]:
        p = data.rfind(marker)
        if p >= 0 and p + len(marker) < len(data) - 8:
            trailer = data[p + len(marker):]
            res['data_etter_' + name] = {'bytes': len(trailer), 'flagg': flags(trailer), 'start': trailer[:60].decode('latin1', 'replace')}

    if not res['flagg'] and 'lsb_flagg' not in res and not any(k.startswith('data_etter') for k in res):
        res['notes'].append('Ingen åpenbar stego funnet via LSB/append/strings. Prøv analyser_fil (polyglot) eller dekod_lyd (lyd).')
    return res

if __name__ == '__main__':
    try:
        print(json.dumps(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else '.'), ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)[:300]}))

# lyd-stego-dekoder for agenten. Kjør: python -I audio.py <wav> <ut-mappe>
# Lager et SSTV-bilde (hvis det er SSTV) og prøver FSK. Skriver JSON til stdout.
import sys, os, json, struct, zlib
import numpy as np
from scipy.io import wavfile
from scipy.signal import hilbert, spectrogram

def png_gray(img, path):
    h, w = img.shape
    raw = bytearray()
    for row in img:
        raw.append(0); raw.extend(row.tobytes())
    ch = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    p = b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0)) + ch(b"IDAT", zlib.compress(bytes(raw), 6)) + ch(b"IEND", b"")
    open(path, "wb").write(p)

def main(path, outdir):
    os.makedirs(outdir, exist_ok=True)
    rate, data = wavfile.read(path)
    if data.ndim > 1: data = data[:, 0]
    x = data.astype(np.float64)
    res = {'file': os.path.basename(path), 'rate': int(rate), 'duration_s': round(len(x) / rate, 1), 'notes': []}

    # FM-demod
    inst = np.diff(np.unwrap(np.angle(hilbert(x)))) / (2 * np.pi) * rate
    inst = np.concatenate([inst, inst[-1:]])

    # SSTV: finn 1200 Hz sync-pulser (> 5 ms)
    sync = inst < 1350
    ml = int(0.005 * rate); starts = []; i = 0; n = len(sync)
    while i < n:
        if sync[i]:
            j = i
            while j < n and sync[j]: j += 1
            if j - i >= ml: starts.append(i)
            i = j
        else: i += 1
    if len(starts) > 30:
        gaps = np.diff(starts); med = float(np.median(gaps))
        res['sstv_sync_pulses'] = len(starts)
        res['sstv_line_ms'] = round(med / rate * 1000, 1)
        W = 320; ys = int(0.012 * rate); yl = int(0.088 * rate); rows = []
        for s in starts:
            a = s + ys; b = a + yl
            if b <= len(inst):
                seg = np.clip((inst[a:b] - 1500) / 800.0, 0, 1) * 255
                rows.append(seg[np.linspace(0, len(seg) - 1, W).astype(int)].astype(np.uint8))
        if rows:
            img = np.array(rows, dtype=np.uint8)
            out = os.path.join(outdir, 'sstv_' + os.path.splitext(os.path.basename(path))[0] + '.png')
            png_gray(img, out)
            res['sstv_image'] = os.path.basename(out)
            res['notes'].append('Ser ut som SSTV (' + str(len(starts)) + ' sync-pulser). Laget bilde ' + os.path.basename(out) + ' — bruk spør_vision på den for å lese teksten/flagget.')

    # FSK: to dominante toner?
    f, t, Sxx = spectrogram(x, fs=rate, nperseg=2048, noverlap=1024)
    peak = f[np.argmax(Sxx, axis=0)]
    vals, counts = np.unique(np.round(peak, -1), return_counts=True)
    top = sorted(zip(counts, vals), reverse=True)[:2]
    if len(top) == 2 and all(c > len(peak) * 0.1 for c, _ in top):
        res['fsk_tones_hz'] = [int(top[0][1]), int(top[1][1])]
        res['notes'].append('To dominante toner (' + str(int(top[0][1])) + '/' + str(int(top[1][1])) + ' Hz) — kan være FSK-data.')
    if 'sstv_image' not in res and 'fsk_tones_hz' not in res:
        res['notes'].append('Fant verken tydelig SSTV eller FSK. Prøv LSB-steganografi eller spektrogram manuelt.')
    return res

if __name__ == '__main__':
    try:
        print(json.dumps(main(sys.argv[1], sys.argv[2]), ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)}))

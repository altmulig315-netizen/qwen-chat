# disk_analyser for agenten (Sleuth Kit via pytsk3). Kjør: python -I disk_tool.py <image> <handling>
# handling: 'partitions' (standard) eller 'files' (lister filer i rot-filsystemet)
import sys, json, pytsk3
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

def list_files(fs, path='/', depth=0, out=None):
    if out is None: out = []
    try:
        d = fs.open_dir(path)
    except Exception:
        return out
    for e in d:
        try:
            name = e.info.name.name.decode('latin1', 'replace')
            if name in ('.', '..'): continue
            meta = e.info.meta
            size = meta.size if meta else 0
            is_dir = meta and meta.type == pytsk3.TSK_FS_META_TYPE_DIR
            out.append({'navn': (path.rstrip('/') + '/' + name), 'storrelse': size, 'mappe': bool(is_dir)})
            if is_dir and depth < 1 and len(out) < 200:
                list_files(fs, path.rstrip('/') + '/' + name, depth + 1, out)
        except Exception:
            pass
        if len(out) >= 300: break
    return out

def main(path, action):
    img = pytsk3.Img_Info(path)
    res = {'file': path.split('\\')[-1], 'storrelse': img.get_size(), 'partisjoner': []}
    fs = None
    try:
        vol = pytsk3.Volume_Info(img)
        for part in vol:
            res['partisjoner'].append({'adresse': part.addr, 'start': part.start, 'lengde': part.len,
                                       'beskrivelse': part.desc.decode('latin1', 'replace')})
    except Exception:
        res['notes'] = ['Ingen partisjonstabell — åpner som ett filsystem.']
    if action == 'files':
        # velg den STØRSTE ekte datapartisjonen (hopp over meta: GPT, tabell, safety, unallocated)
        meta = ('Unalloc', 'Safety', 'GPT', 'Partition Table', 'Meta')
        cands = [p for p in res['partisjoner'] if p['lengde'] > 64 and not any(m in p['beskrivelse'] for m in meta)]
        offsets = ([max(cands, key=lambda p: p['lengde'])['start'] * 512] if cands else []) + [0]
        for offset in offsets:
            try:
                fs = pytsk3.FS_Info(img, offset=offset)
                res['filsystem_offset'] = offset
                res['filer'] = list_files(fs)[:200]
                break
            except Exception as e:
                res['feil_filsystem'] = str(e)[:120]
    return res

if __name__ == '__main__':
    try:
        print(json.dumps(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'partitions'), ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)[:300]}))

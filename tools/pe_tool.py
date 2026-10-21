# pe_info for agenten. Kjør: python -I pe_tool.py <fil>
import sys, json, math, pefile
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

def entropy(b):
    if not b: return 0.0
    from collections import Counter
    c = Counter(b); n = len(b)
    return round(-sum((v/n) * math.log2(v/n) for v in c.values()), 2)

def main(path):
    pe = pefile.PE(path, fast_load=True)
    pe.parse_data_directories(directories=[pefile.DIRECTORY_ENTRY['IMAGE_DIRECTORY_ENTRY_IMPORT']])
    res = {'file': path.split('\\')[-1],
           'maskin': hex(pe.FILE_HEADER.Machine),
           'tidsstempel': pe.FILE_HEADER.TimeDateStamp,
           'dll': pe.OPTIONAL_HEADER.DllCharacteristics,
           'seksjoner': [], 'imports': [], 'advarsler': []}
    for s in pe.sections:
        name = s.Name.rstrip(b'\x00').decode('latin1', 'replace')
        e = entropy(s.get_data())
        res['seksjoner'].append({'navn': name, 'storrelse': s.SizeOfRawData, 'entropi': e})
        if e > 7.2: res['advarsler'].append(f'Seksjon {name} har høy entropi ({e}) — kan være pakket/kryptert.')
    imps = 0
    for entry in getattr(pe, 'DIRECTORY_ENTRY_IMPORT', [])[:20]:
        funcs = [imp.name.decode('latin1', 'replace') for imp in entry.imports if imp.name][:8]
        res['imports'].append({'dll': entry.dll.decode('latin1', 'replace'), 'funksjoner': funcs})
        imps += len(entry.imports)
    sus = {'VirtualAlloc', 'CreateRemoteThread', 'WriteProcessMemory', 'LoadLibraryA', 'GetProcAddress', 'WinExec', 'URLDownloadToFile'}
    funset = {f for e in res['imports'] for f in e['funksjoner']}
    hit = sus & funset
    if hit: res['advarsler'].append('Mistenkelige API-kall: ' + ', '.join(sorted(hit)))
    return res

if __name__ == '__main__':
    try:
        print(json.dumps(main(sys.argv[1]), ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)[:300]}))

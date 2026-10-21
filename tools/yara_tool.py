# yara_scan for agenten. Kjør: python -I yara_tool.py <fil> [regler]
# Uten egne regler brukes et lite standardsett med vanlige indikatorer.
import sys, json, yara
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

DEFAULT = r'''
rule PE_fil { strings: $mz = "MZ" condition: $mz at 0 }
rule ELF_fil { strings: $e = { 7f 45 4c 46 } condition: $e at 0 }
rule URL { strings: $h = /https?:\/\/[a-zA-Z0-9.\/_-]{6,}/ condition: $h }
rule Base64_blob { strings: $b = /[A-Za-z0-9+\/]{40,}={0,2}/ condition: $b }
rule Flagg { strings: $f = /[A-Za-z0-9_]{1,16}\{[ -~]{3,100}\}/ condition: $f }
rule Mistenkelig_API { strings: $a="VirtualAlloc" nocase $b="CreateRemoteThread" nocase $c="WScript.Shell" nocase $d="powershell" nocase condition: any of them }
rule Privat_nokkel { strings: $k="PRIVATE KEY" condition: $k }
'''

def main(path, rules_src):
    rules = yara.compile(source=rules_src if rules_src.strip() else DEFAULT)
    matches = rules.match(path, timeout=60)
    out = []
    for m in matches:
        strs = []
        for s in getattr(m, 'strings', [])[:5]:
            try:
                inst = s.instances[0]
                strs.append({'offset': inst.offset, 'data': bytes(inst.matched_data)[:60].decode('latin1')})
            except Exception:
                pass
        out.append({'rule': m.rule, 'treff': strs})
    return {'file': path.split('\\')[-1], 'regelsett': 'egne' if rules_src.strip() else 'standard', 'treff': out, 'antall': len(out)}

if __name__ == '__main__':
    try:
        print(json.dumps(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ''), ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)[:300]}))

# volatility (minne-forensics) for agenten. Kjør: python -I vol_tool.py <dump> [plugin]
# Kjører Volatility3 som underprosess. Standard plugin: windows.info.
import sys, json, subprocess, os
try: sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception: pass

def main(path, plugin):
    plugin = plugin.strip() or 'windows.info'
    # kun ufarlige lese-plugins tillates
    tillatt = ('windows.', 'linux.', 'mac.', 'banners', 'frameworkinfo', 'isfinfo', 'timeliner')
    if not plugin.startswith(tillatt):
        return {'error': 'Plugin ikke tillatt: ' + plugin + '. Bruk f.eks. windows.info, windows.pslist, windows.netscan, windows.pstree, windows.cmdline.'}
    cmd = [sys.executable, '-c', 'from volatility3.cli import main; main()', '-q', '-f', path, plugin]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=300, cwd=os.path.dirname(path) or '.')
        out = (p.stdout or '')[:8000]
        err = (p.stderr or '')[-800:]
        return {'plugin': plugin, 'utdata': out or '(ingen utdata)', 'feil': err if p.returncode != 0 else ''}
    except subprocess.TimeoutExpired:
        return {'error': 'Volatility brukte for lang tid (>5 min). Minnedumper er store; prøv en enklere plugin som windows.info først.'}
    except Exception as e:
        return {'error': str(e)[:300]}

if __name__ == '__main__':
    try:
        print(json.dumps(main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else ''), ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)[:300]}))

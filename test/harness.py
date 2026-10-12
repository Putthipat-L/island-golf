"""Playwright harness: opens a built page from dist/ in headless Chromium.

Network is fully offline: three.js and the fonts are served from node_modules
(run `npm install` first), every other request is blocked.
"""
import pathlib, json, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
NM = ROOT / 'node_modules'
FS = NM / '@fontsource'
OUT = ROOT / 'test' / 'out'
OUT.mkdir(parents=True, exist_ok=True)

def _need(path, hint):
    if not path.exists():
        sys.exit(f'missing {path.relative_to(ROOT)} — {hint}')

_need(NM / 'three/build/three.min.js', 'run `npm install` first')
THREE = (NM / 'three/build/three.min.js').read_bytes()

def _font_css():
    css = []
    for fam, pkg in (('Mitr', 'mitr'), ('Anuphan', 'anuphan')):
        for w in (400, 500, 600, 700):
            for sub in ('thai', 'latin'):
                f = FS / pkg / 'files' / f'{pkg}-{sub}-{w}-normal.woff2'
                if f.exists():
                    css.append(f"@font-face{{font-family:'{fam}';font-weight:{w};font-style:normal;"
                               f"src:url(https://fonts.local/{pkg}/{f.name}) format('woff2');}}")
    return '\n'.join(css)
FONT_CSS = _font_css()

PAGE = ['island-golf.html']

def page_html():
    path = ROOT / 'dist' / PAGE[0]
    _need(path, 'run `python3 build.py && python3 build_studio.py` first')
    return path.read_text(encoding='utf-8')

def _route(r):
    u = r.request.url
    if u.startswith('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js'):
        return r.fulfill(status=200, body=THREE, headers={'content-type': 'application/javascript'})
    if u.startswith('https://fonts.googleapis.com/'):
        return r.fulfill(status=200, body=FONT_CSS, headers={'content-type': 'text/css'})
    if u.startswith('https://fonts.local/'):
        pkg, name = u.split('/')[-2:]
        return r.fulfill(status=200, body=(FS / pkg / 'files' / name).read_bytes(), headers={'content-type': 'font/woff2'})
    if u.startswith('https://game.local/'):
        return r.fulfill(status=200, body=page_html(), headers={'content-type': 'text/html; charset=utf-8'})
    return r.abort()

def open_game(p, w=1280, h=720, mobile=False, page=None, wait_loading=True):
    """Launch Chromium (SwiftShader WebGL) and open dist/<page>. Returns (browser, page, logs)."""
    if page: PAGE[0] = page
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'])
    ctx = b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
    pg = ctx.new_page(); pg.set_default_timeout(180000)
    logs = []
    pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
    pg.route('**/*', _route)
    pg.goto('https://game.local/')
    if wait_loading:
        pg.wait_for_function('document.getElementById("loading") && document.getElementById("loading").hidden', timeout=60000)
    return b, pg, logs

def errors(logs):
    return [l for l in logs if l.startswith('[pageerror]') or (l.startswith('[error]') and 'net::' not in l)]

def check(cond, msg):
    print(('  ok   ' if cond else '  FAIL ') + msg)
    if not cond:
        check.failed = True
check.failed = False

# Run the game loop without drawing (fast), or restore drawing
NORENDER = "(() => { const R=__golf.World.renderer; if(!R._real){ R._real=R.render.bind(R); } R.render=()=>{}; })()"
RENDER = "(() => { const R=__golf.World.renderer; if(R._real) R.render=R._real; })()"

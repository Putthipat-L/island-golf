"""Home-screen app: manifest + icons, gestures locked on phones, lighter phone rendering, opens offline after one visit."""
import os, sys, pathlib, json, threading, functools, http.server, socketserver
os.environ.setdefault("PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS", "1")   # let the test route requests made by the service worker
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from harness import *

DIST = ROOT / 'dist'

# 1) files
man = json.loads((DIST / 'manifest.webmanifest').read_text(encoding='utf-8'))
check(man['start_url'] == './island-golf.html' and man['display'] in ('fullscreen', 'standalone'), 'manifest opens the game full screen')
check(all((DIST / i['src']).exists() for i in man['icons']) and (DIST / 'icons/apple-touch-icon.png').exists(), 'all icons are in dist/icons')
html = (DIST / 'island-golf.html').read_text(encoding='utf-8')
check('apple-mobile-web-app-capable' in html and 'rel="manifest"' in html and 'rel="apple-touch-icon"' in html, 'page carries the iPhone home-screen tags')

# 2) phone behaviour (gesture lock, render profile)
with sync_playwright() as p:
    b, pg, logs = open_game(p, 844, 390, mobile=True)
    r = pg.evaluate('''() => {
      const fire = (type, target, init) => { const e = new Event(type, Object.assign({bubbles: true, cancelable: true}, init)); target.dispatchEvent(e); return e.defaultPrevented; };
      const tm = (target, n) => { const e = new Event('touchmove', {bubbles: true, cancelable: true}); Object.defineProperty(e, 'touches', {value: {length: n}}); target.dispatchEvent(e); return e.defaultPrevented; };
      return {pinch: fire('gesturestart', document.getElementById('gl')), dbl: fire('dblclick', document.body),
              moveCanvas: tm(document.getElementById('gl'), 1), twoFinger: tm(document.getElementById('gl'), 2),
              pr: __golf.World.renderer.getPixelRatio(), shadow: __golf.World.sun.shadow.mapSize.x};
    }''')
    check(r['pinch'] and r['dbl'] and r['moveCanvas'] and r['twoFinger'], 'pinch-zoom, double-tap zoom and page dragging are blocked')
    check(r['pr'] <= 1.5 and r['shadow'] == 1024, f"phone starts with the light render profile (pixel ratio {r['pr']}, shadow {r['shadow']})")
    # the how-to card can still scroll when it overflows
    pg.evaluate("document.getElementById('howto').hidden = false")
    sc = pg.evaluate('''() => { const c = document.querySelector('.how-card'); const e = new Event('touchmove', {bubbles: true, cancelable: true});
        Object.defineProperty(e, 'touches', {value: {length: 1}}); c.firstElementChild.dispatchEvent(e); return {over: c.scrollHeight > c.clientHeight + 1, blocked: e.defaultPrevented}; }''')
    check(not sc['over'] or not sc['blocked'], 'long overlay cards still scroll')
    check(not errors(logs), 'no page errors')
    b.close()

# 3) offline start through the service worker (localhost counts as a secure origin)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(DIST)))
port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'])
    ctx = b.new_context(viewport={'width': 844, 'height': 390})
    def croute(r):
        u = r.request.url
        if u.startswith('https://cdn.jsdelivr.net/'): return r.fulfill(status=200, body=THREE, headers={'content-type': 'application/javascript', 'access-control-allow-origin': '*'})
        if u.startswith('https://fonts.googleapis.com/'): return r.fulfill(status=200, body=FONT_CSS, headers={'content-type': 'text/css'})
        if u.startswith('https://fonts.local/'):
            pkg, name = u.split('/')[-2:]
            return r.fulfill(status=200, body=(FS / pkg / 'files' / name).read_bytes(), headers={'content-type': 'font/woff2'})
        return r.continue_() if u.startswith(f'http://localhost:{port}/') else r.abort()
    ctx.route('**/*', croute)
    pg = ctx.new_page(); logs = []
    pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
    pg.goto(f'http://localhost:{port}/island-golf.html')
    pg.wait_for_function('document.getElementById("loading").hidden', timeout=90000)
    ok = pg.evaluate('navigator.serviceWorker.ready.then(r => !!r.active)')
    check(ok, 'service worker installs')
    pg.reload(); pg.wait_for_function('document.getElementById("loading").hidden', timeout=90000)   # page now controlled, caches warm
    srv.shutdown(); srv.server_close(); ctx.unroute('**/*'); ctx.set_offline(True)
    pg.reload(); pg.wait_for_function('document.getElementById("loading").hidden', timeout=90000)
    check(pg.evaluate('!!window.__golf && __golf.Game.mode === "title"'), 'game opens with no internet after the first visit')
    check(not logs, 'no page errors')
    b.close()
sys.exit(1 if check.failed else 0)

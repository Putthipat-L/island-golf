"""Rotating a phone: the 3D view must match the screen even when the browser keeps reporting the old size
(iPhone home-screen apps do this right after rotating — it made everything look squashed)."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from harness import *

VIEW = '''() => { const c = __golf.World.renderer.domElement, cam = __golf.World.camera;
  return {css: c.clientWidth / c.clientHeight, cam: cam.aspect, buf: c.width / c.height}; }'''

with sync_playwright() as p:
    b, pg, logs = open_game(p, 390, 844, mobile=True)
    pg.evaluate("__golf.freeze(false); __golf.startRound('single', 0); __golf.skipIntro()")
    pg.wait_for_timeout(500)
    v = pg.evaluate(VIEW)
    check(abs(v['cam'] - v['css']) < 0.02, f"portrait view matches the screen ({v['cam']:.2f} vs {v['css']:.2f})")
    # simulate the iPhone bug: window size frozen at portrait, then the screen turns landscape
    pg.evaluate("Object.defineProperty(window, 'innerWidth', {get: () => 390}); Object.defineProperty(window, 'innerHeight', {get: () => 844})")
    pg.set_viewport_size({'width': 844, 'height': 390})
    pg.evaluate("window.dispatchEvent(new Event('orientationchange'))")
    pg.wait_for_timeout(1500)
    v = pg.evaluate(VIEW)
    pg.screenshot(path=str(OUT / 'rotate_landscape.png'))
    check(abs(v['cam'] - v['css']) < 0.02 and abs(v['buf'] - v['css']) < 0.03,
          f"after rotating, the 3D view matches the screen (camera {v['cam']:.2f}, canvas {v['buf']:.2f}, screen {v['css']:.2f})")
    check(pg.evaluate("document.getElementById('rotate-hint').hidden"), 'the "turn your phone" hint goes away in landscape')
    check(not errors(logs), 'no page errors')
    b.close()
sys.exit(1 if check.failed else 0)

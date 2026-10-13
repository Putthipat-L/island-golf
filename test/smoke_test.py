"""Smoke test: page loads, a hole starts, iron 100% carries ~180 y, aim stick sits on the left."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from harness import *

STOP = '''(n) => { const G = __golf.Game, R = __golf.World.renderer, real = R.render.bind(R); R.render = () => {};
  let i = 0; for (; i < n; i++) { __golf.step(1, 1/60); if (G.mode === 'walk' || G.mode === 'holed' || G.mode === 'scorecard') break; }
  R.render = real; __golf.render();
  return {mode: G.mode, x: G.ball.p.x, z: G.ball.p.z, strokes: G.strokes}; }'''

with sync_playwright() as p:
    print('desktop 1280x720')
    b, pg, logs = open_game(p, 1280, 720)
    pg.wait_for_timeout(1200)
    pg.screenshot(path=str(OUT / 'smoke_title.png'))
    check(pg.is_visible('#btn-play'), 'title screen shows the play button')
    pg.click('#btn-play'); pg.wait_for_timeout(600)
    pg.evaluate('__golf.skipIntro(); __golf.step(90)')
    pg.screenshot(path=str(OUT / 'smoke_walk.png'))
    check(pg.evaluate('__golf.Game.mode') == 'walk', 'hole 1 starts in walk mode')

    # calibration: hole 2 runs straight for the first 180 y; no wind
    pg.evaluate("__golf.startRound('single', 1); __golf.skipIntro(); __golf.step(5);"
                "__golf.Game.wind = {dir: 0, speed: 0}; __golf.Game.windBase = {dir: 0, speed: 0};")
    start = pg.evaluate('[__golf.Game.ball.p.x, __golf.Game.ball.p.z]')
    pg.evaluate("__golf.shoot(1.0, Math.PI, 'iron'); __golf.Game.wind = {dir: 0, speed: 0}")
    r = pg.evaluate(STOP, 1500)
    d = ((r['x'] - start[0]) ** 2 + (r['z'] - start[1]) ** 2) ** 0.5
    print(f'    iron 100% travelled {d:.1f} y')
    check(165 <= d <= 195, 'iron at 100% power goes about 180 y')
    check(r['strokes'] == 1, 'one stroke counted')
    check(not errors(logs), 'no page errors')
    b.close()

    print('phone landscape 844x390')
    b, pg, logs = open_game(p, 844, 390, mobile=True)
    pg.evaluate("__golf.startRound('single', 0); __golf.skipIntro(); __golf.step(60); __golf.enterAim(); __golf.step(30)")
    pg.wait_for_timeout(400)
    pg.screenshot(path=str(OUT / 'smoke_aim_mobile.png'))
    box = pg.eval_on_selector('#stick-r', 'e => { const r = e.getBoundingClientRect(); return {x: r.x, w: r.width, vis: getComputedStyle(e).display !== "none" && !e.hidden}; }')
    check(box['vis'] and box['x'] + box['w'] / 2 < 844 / 2, 'aim stick is on the left side')
    check(pg.evaluate('__golf.Game.mode') == 'aim', 'address button puts the golfer in aim mode')
    check(not errors(logs), 'no page errors')
    b.close()

sys.exit(1 if check.failed else 0)

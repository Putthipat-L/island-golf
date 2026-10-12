"""Hole intro: overview of the hole → camera swoops down to the golfer's face → swings behind her → walk."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from harness import *

CAM = '''() => { const G = __golf.Game, P = G.player.p, c = __golf.World.camera.position, F = {x: Math.sin(G.player.yaw), z: Math.cos(G.player.yaw)};
  const dx = c.x - P.x, dz = c.z - P.z;
  return {mode: G.mode, front: dx * F.x + dz * F.z, dist: Math.hypot(dx, dz), h: c.y - P.y, hud: !document.getElementById('hud').hidden}; }'''

with sync_playwright() as p:
    for w, h, mobile, tag in ((1280, 720, False, 'desktop'), (844, 390, True, 'phone')):
        print(tag)
        b, pg, logs = open_game(p, w, h, mobile=mobile)
        I = pg.evaluate('__golf.INTRO')
        pg.evaluate('__golf.freeze()')
        for hole in (0, 2):
            pg.evaluate(f"__golf.startRound('single', {hole}); __golf.step(1)")
            t = 0.0
            for tt, name in ((1.2, 'overview'), (I['over'] + 1.2, 'fly'), (I['fly'] + 0.8, 'face'), (I['hold'] + 0.6, 'orbit')):
                pg.evaluate(f'__golf.step({int((tt - t) * 60)})'); t = tt
                pg.screenshot(path=str(OUT / f'intro_h{hole + 1}_{tag}_{name}.png'))
                c = pg.evaluate(CAM)
                if name == 'overview':
                    check(c['h'] > 40 and not c['hud'], f'hole {hole + 1}: starts with a high overview, HUD hidden')
                if name == 'face':
                    check(c['front'] > 2 and c['dist'] < 4 and c['h'] < 2, f"hole {hole + 1}: camera ends in front of the golfer's face")
            pg.evaluate(f"__golf.step({int((I['end'] - t) * 60) + 30})")
            c = pg.evaluate(CAM)
            check(c['mode'] == 'walk' and c['front'] < -6 and c['hud'], f'hole {hole + 1}: intro hands over to the walk camera behind her')
        # tapping skips the intro (real-time loop running again)
        pg.evaluate('__golf.freeze(false)')
        pg.evaluate("__golf.startRound('single', 1); __golf.step(30)")
        pg.mouse.click(w // 2, h // 2) if not mobile else pg.tap('#cine')
        pg.evaluate('__golf.step(2)')
        check(pg.evaluate('__golf.Game.mode') == 'walk', 'tap skips the intro')
        check(not errors(logs), 'no page errors')
        b.close()
sys.exit(1 if check.failed else 0)

"""Bot plays all three holes with the default aim (random wind, sloped greens) and must hole out each."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from harness import *

BOT = r'''(hole) => {
  const g = __golf, G = g.Game; const log = [];
  g.startRound('single', hole); g.skipIntro(); g.step(2);
  const R = g.World.renderer; const realRender = R.render.bind(R); R.render = () => {};
  for (let shot = 0; shot < 14 && G.mode !== 'scorecard' && G.mode !== 'holed' && G.mode !== 'finale'; shot++) {
    g.teleportToBall(); g.enterAim();
    const H = G.H, b = G.ball.p;
    const d = Math.hypot(H.cup.x - b.x, H.cup.z - b.z);
    const z = g.zoneAt(H, b.x, b.z);
    const lie = [1, 1, 1, 0.6, 1, 1, 0.8][z];
    let power;
    if (G.club === 'putter') { G.aimYaw = Math.atan2(H.cup.x - b.x, H.cup.z - b.z); power = Math.min(1, (d + 0.7) / (20 * lie)); }
    else power = Math.min(1, G.aimTarget / (180 * lie));
    const before = {club: G.club, power: +power.toFixed(2), toCup: +d.toFixed(1)};
    g.releasePower(power);
    for (let i = 0; i < 3000; i++) { g.step(1, 1/60); if (G.mode === 'walk' || G.mode === 'holed' || G.mode === 'scorecard' || G.mode === 'finale') break; }
    const a = G.ball.p;
    log.push({...before, wind: G.wind.speed + 'mph', after: +Math.hypot(H.cup.x - a.x, H.cup.z - a.z).toFixed(1), strokes: G.strokes, pen: G.penalties});
  }
  for (let i = 0; i < 200 && G.mode === 'holed'; i++) g.step(1, 1/60);
  R.render = realRender;
  return JSON.stringify({hole, par: G.H.par, strokes: G.strokes, mode: G.mode, log});
}'''

with sync_playwright() as p:
    b, pg, logs = open_game(p, 960, 540)
    for h in (0, 1, 2):
        r = json.loads(pg.evaluate(BOT, h))
        print(f"hole {h + 1} (par {r['par']}): {r['strokes']} strokes")
        for s in r['log']: print('     ', s)
        check(r['mode'] in ('scorecard', 'finale', 'holed') and r['strokes'] <= 10, f'hole {h + 1} holed out')
    check(not errors(logs), 'no page errors')
    b.close()
sys.exit(1 if check.failed else 0)

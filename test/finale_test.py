"""Birthday finale: hole 3 holed -> cinematic -> bridge opens -> walk to chest -> letter -> save image -> download."""
import sys, pathlib, base64; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from harness import *

with sync_playwright() as p:
    b, pg, logs = open_game(p, 844, 390, mobile=True)
    pg.evaluate("__golf.startRound('round', 0); __golf.Game.round.scores = [{strokes:3,par:3,putts:2,penalties:0,longest:146},{strokes:4,par:4,putts:1,penalties:0,longest:178},null];"
                "__golf.loadHole(2); __golf.Game.mode = 'walk'; __golf.Game.strokes = 4; __golf.step(2)")
    check(pg.evaluate('__golf.Game.H.fb.open') is False, 'bridge to the gift island starts closed')
    r = json.loads(pg.evaluate("""(() => { const g = __golf, G = g.Game, H = G.H;
        const x = H.cup.x - H.cupDir.x * 1.5, z = H.cup.z - H.cupDir.z * 1.5;
        G.ball.p.set(x, g.heightAt(H, x, z) + 0.11, z); g.teleportToBall(); g.enterAim(); g.setClub('putter');
        G.aimYaw = Math.atan2(H.cup.x - x, H.cup.z - z); g.releasePower(0.16);
        const R = g.World.renderer, real = R.render.bind(R); R.render = () => {};
        let i = 0; for (; i < 900; i++) { g.step(1, 1/60); if (G.mode === 'finale') break; }
        R.render = real;
        return JSON.stringify({mode: G.mode, stage: G.finStage}); })()"""))
    check(r['mode'] == 'finale', 'holing hole 3 starts the finale')
    t = 0
    for tt, name in ((1.6, 'finale_1_zoom.png'), (3.6, 'finale_2_chest.png'), (6.6, 'finale_3_bridge.png')):
        pg.evaluate(f'__golf.step({int((tt - t) * 60)})'); t = tt
        pg.screenshot(path=str(OUT / name))
    pg.evaluate(f'__golf.step({int((8.6 - t) * 60)})')
    check(pg.evaluate('__golf.Game.H.fb.open') is True, 'bridge is open after the cinematic')

    pg.evaluate(NORENDER)
    pg.add_style_tag(content='*{transition:none!important;animation-duration:0s!important}')  # headless timelines are frozen
    r = json.loads(pg.evaluate("""(() => { const g = __golf, G = g.Game, H = G.H; g.UI.stickL.y = 1; let i = 0;
        for (; i < 900 && G.mode === 'walk'; i++) { const P = G.player.p; G.camYaw = Math.atan2(H.chest.x - P.x, H.chest.z - P.z); g.step(1, 1/60); }
        g.UI.stickL.y = 0;
        return JSON.stringify({d: Math.hypot(G.player.p.x - H.chest.x, G.player.p.z - H.chest.z), mode: G.mode, stage: G.finStage}); })()"""))
    check(r['mode'] == 'letter' and r['d'] < 4, f"walking up to the chest opens the letter by itself (stage {r['stage']})")
    pg.evaluate(RENDER); pg.evaluate('__golf.step(60)'); pg.wait_for_timeout(2600); pg.evaluate('__golf.step(2)')
    pg.screenshot(path=str(OUT / 'finale_5_letter.png'))
    text = pg.inner_text('#letter-ov')
    check(pg.is_visible('#letter-ov') and 'Happy Birthday' in text and 'ขอให้คุณแม่มีความสุข' in text, 'letter shows the birthday message')

    # close, walk away, come back: it opens again
    pg.click('#lt-close'); pg.evaluate('__golf.step(5)')
    check(pg.evaluate('__golf.Game.mode') == 'walk', 'closing the letter returns to walking')
    pg.evaluate(NORENDER)
    r = json.loads(pg.evaluate("""(() => { const g = __golf, G = g.Game, H = G.H; const out = [];
        g.UI.stickL.y = 1;
        for (let i = 0; i < 120; i++) { const P = G.player.p; G.camYaw = Math.atan2(P.x - H.chest.x, P.z - H.chest.z); g.step(1, 1/60); }
        out.push(G.mode, +Math.hypot(G.player.p.x - H.chest.x, G.player.p.z - H.chest.z).toFixed(1));
        for (let i = 0; i < 600 && G.mode === 'walk'; i++) { const P = G.player.p; G.camYaw = Math.atan2(H.chest.x - P.x, H.chest.z - P.z); g.step(1, 1/60); }
        g.UI.stickL.y = 0; out.push(G.mode); return JSON.stringify(out); })()"""))
    pg.evaluate(RENDER)
    check(r[0] == 'walk' and r[2] == 'letter', f'walking away and back opens it again {r}')
    pg.evaluate('__golf.step(30)'); pg.wait_for_timeout(2000); pg.evaluate('__golf.step(2)')

    pg.click('#lt-save')
    pg.wait_for_function("!document.getElementById('save-ov').hidden", timeout=120000)
    data = pg.evaluate("document.getElementById('save-img').src")
    (OUT / 'finale_6_card.png').write_bytes(base64.b64decode(data.split(',')[1]))
    check(pg.is_visible('#save-dl'), 'download button offered outside Claude')
    with pg.expect_download(timeout=30000) as dl:
        pg.click('#save-dl')
    check(dl.value.suggested_filename.endswith('.png'), f'browser download starts ({dl.value.suggested_filename})')
    check(not errors(logs), 'no page errors')
    b.close()
sys.exit(1 if check.failed else 0)

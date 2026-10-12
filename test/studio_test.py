"""Avatar preview page: renders the character from every view without errors."""
import sys, pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from harness import *

with sync_playwright() as p:
    b, pg, logs = open_game(p, 1280, 760, page='mom-avatar.html', wait_loading=False)
    pg.wait_for_function('window.__studio', timeout=60000)
    for view, pose in (('face', 'stand'), ('front', 'wave'), ('three', 'swing'), ('back', 'stand')):
        pg.evaluate(f"__studio.setView('{view}'); __studio.setPose('{pose}'); for (let i = 0; i < 90; i++) __studio.step(1/60); __studio.renderer.render(__studio.scene, __studio.cam);")
        pg.screenshot(path=str(OUT / f'studio_{view}.png'))
    check(not errors(logs), 'no page errors')
    b.close()
sys.exit(1 if check.failed else 0)

import pathlib, base64, sys
# Builds dist/island-golf.html: inlines the game scripts and the letter photo into index.src.html
root = pathlib.Path(__file__).resolve().parent

# Installable web app: add to the iPhone/Android home screen and it opens full screen, without browser bars
PWA_HEAD = '''<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#2aaec7">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Island Golf">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" href="icons/icon-192.png">'''
PWA_SW = '''<script>if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>'''

def standalone(fragment):
    # move <title> into <head>; everything else goes in <body>
    import re
    m = re.search(r'<title>.*?</title>', fragment, re.S)
    title = m.group(0) if m else '<title>Island Golf</title>'
    body = fragment.replace(title, '', 1) if m else fragment
    return ('<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n'
            + PWA_HEAD + '\n' + title + '\n<style>[hidden]{display:none!important}</style>\n</head>\n<body>\n'
            + body + '\n' + PWA_SW + '\n</body>\n</html>\n')

def copy_pwa_files():
    import shutil
    (root / 'dist' / 'icons').mkdir(parents=True, exist_ok=True)
    for f in ('manifest.webmanifest', 'sw.js'):
        shutil.copyfile(root / 'pwa' / f, root / 'dist' / f)
    for f in (root / 'assets' / 'icons').glob('*.png'):
        shutil.copyfile(f, root / 'dist' / 'icons' / f.name)

order = ['config.js', 'core.js', 'world.js', 'character.js', 'ui.js', 'main.js']
photo = base64.b64encode((root / 'assets' / 'letter_photo.jpg').read_bytes()).decode()
assets = f"const LETTER_JPG = 'data:image/jpeg;base64,{photo}';\n"
js = assets + '\n'.join((root / 'src' / f).read_text(encoding='utf-8') for f in order)
tpl = (root / 'index.src.html').read_text(encoding='utf-8')
out = tpl.replace('/*__GAME__*/', js)
if '--fragment' in sys.argv:
    # Claude Artifacts wrap the page themselves: publish the bare fragment
    (root / 'build').mkdir(exist_ok=True)
    (root / 'build' / 'island-golf.html').write_text(out, encoding='utf-8')
    print('built build/island-golf.html (fragment)', len(out) // 1024, 'KB')
else:
    (root / 'dist').mkdir(exist_ok=True)
    (root / 'dist' / 'island-golf.html').write_text(standalone(out), encoding='utf-8')
    copy_pwa_files()
    print('built dist/island-golf.html', len(out) // 1024, 'KB  (+ manifest, service worker, icons)')

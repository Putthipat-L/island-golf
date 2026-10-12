import pathlib, base64, sys
# Builds dist/mom-avatar.html: a turntable preview of the avatar (same character.js as the game)
root = pathlib.Path(__file__).resolve().parent

def standalone(fragment):
    # move <title> into <head>; everything else goes in <body>
    import re
    m = re.search(r'<title>.*?</title>', fragment, re.S)
    title = m.group(0) if m else '<title>Island Golf</title>'
    body = fragment.replace(title, '', 1) if m else fragment
    return ('<!doctype html>\n<html lang="th">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + title + '\n<style>[hidden]{display:none!important}</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>\n')

photo = base64.b64encode((root / 'assets' / 'letter_photo.jpg').read_bytes()).decode()
char = f"const LETTER_JPG = 'data:image/jpeg;base64,{photo}';\n"
char += (root / 'src' / 'core.js').read_text(encoding='utf-8') + '\n' + (root / 'src' / 'character.js').read_text(encoding='utf-8')
tpl = (root / 'studio.src.html').read_text(encoding='utf-8')
out = tpl.replace('/*__CHAR__*/', char).replace('/*__STUDIO__*/', (root / 'src' / 'studio.js').read_text(encoding='utf-8'))
if '--fragment' in sys.argv:
    # Claude Artifacts wrap the page themselves: publish the bare fragment
    (root / 'build').mkdir(exist_ok=True)
    (root / 'build' / 'mom-avatar.html').write_text(out, encoding='utf-8')
    print('built build/mom-avatar.html (fragment)', len(out) // 1024, 'KB')
else:
    (root / 'dist').mkdir(exist_ok=True)
    (root / 'dist' / 'mom-avatar.html').write_text(standalone(out), encoding='utf-8')
    print('built dist/mom-avatar.html', len(out) // 1024, 'KB')

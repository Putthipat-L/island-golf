"""Draws the home-screen icons (assets/icons/*.png). Run once: python3 tools/make_icons.py"""
import pathlib
from PIL import Image, ImageDraw, ImageFilter

root = pathlib.Path(__file__).resolve().parents[1]
out = root / 'assets' / 'icons'
out.mkdir(parents=True, exist_ok=True)

def lerp(a, b, t): return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
def hexc(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def draw(S, scale=1.0):
    """S = canvas size; scale shrinks the artwork toward the centre (maskable safe zone)."""
    im = Image.new('RGB', (S, S))
    px = ImageDraw.Draw(im)
    top, bot = hexc('#8fdcef'), hexc('#1b86b5')
    for y in range(S):
        px.line([(0, y), (S, y)], fill=lerp(top, bot, (y / S) ** 1.1))
    art = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(art)
    u = S / 100.0
    # shallow-water glow, sand island, green
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
    g.ellipse([12 * u, 50 * u, 88 * u, 88 * u], fill=(170, 236, 240, 170))
    art = Image.alpha_composite(art, glow.filter(ImageFilter.GaussianBlur(3 * u))); d = ImageDraw.Draw(art)
    d.ellipse([16 * u, 54 * u, 84 * u, 84 * u], fill=hexc('#f6e7c7'))
    d.ellipse([22 * u, 55.5 * u, 78 * u, 79 * u], fill=hexc('#7cc35a'))
    d.ellipse([30 * u, 58 * u, 70 * u, 75 * u], fill=hexc('#9bd877'))
    # cup
    d.ellipse([46.5 * u, 65 * u, 53.5 * u, 68.4 * u], fill=hexc('#2d5a2a'))
    # flag pole + flag
    d.rounded_rectangle([49.2 * u, 22 * u, 51.2 * u, 67 * u], radius=1 * u, fill=(255, 255, 255))
    d.polygon([(51.2 * u, 22.5 * u), (72 * u, 29 * u), (51.2 * u, 36 * u)], fill=hexc('#f2715a'))
    d.polygon([(51.2 * u, 29.2 * u), (72 * u, 29 * u), (51.2 * u, 36 * u)], fill=hexc('#d65843'))
    # ball
    d.ellipse([33.6 * u, 66.4 * u, 41.6 * u, 68.8 * u], fill=(45, 95, 40, 80))
    d.ellipse([33.5 * u, 60 * u, 41 * u, 67.5 * u], fill=(255, 255, 255))
    d.ellipse([35.4 * u, 61.6 * u, 37.6 * u, 63.6 * u], fill=(236, 240, 242))
    if scale != 1.0:
        n = round(S * scale); art = art.resize((n, n), Image.LANCZOS)
        pad = (S - n) // 2; layer = Image.new('RGBA', (S, S), (0, 0, 0, 0)); layer.paste(art, (pad, pad)); art = layer
    im = Image.alpha_composite(im.convert('RGBA'), art).convert('RGB')
    return im

big = draw(2048)
for name, size in (('apple-touch-icon.png', 180), ('icon-192.png', 192), ('icon-512.png', 512)):
    big.resize((size, size), Image.LANCZOS).save(out / name, optimize=True)
draw(2048, scale=0.78).resize((512, 512), Image.LANCZOS).save(out / 'icon-maskable-512.png', optimize=True)
print('icons ->', out)

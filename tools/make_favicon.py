import io, os
from PIL import Image
import pathlib; ROOT = str(pathlib.Path(__file__).resolve().parent.parent)
# пиксельный череп 16×16: . — пусто, X — кость, o — глазница, g — зелёный огонёк в глазу
ROWS = [
    '................',
    '....XXXXXXXX....',
    '...XXXXXXXXXX...',
    '..XXXXXXXXXXXX..',
    '..XXXXXXXXXXXX..',
    '..XXooXXXXooXX..',
    '..XogooXXogooX..',
    '..XoooXXXXoooX..',
    '..XXooXXXXooXX..',
    '..XXXXXXooXXXX..',
    '...XXXXXooXXXXX.',
    '....XXXXXXXX....',
    '....XoXooXoX....',
    '.....XXXXXX.....',
    '................',
    '................',
]
ROWS[10] = '...XXXXXooXXXX..'
COL = { 'X': '#ece6c9', 'o': '#1b1326', 'g': '#7dff5a' }
RGBA = { 'X': (236, 230, 201, 255), 'o': (27, 19, 38, 255), 'g': (125, 255, 90, 255), '.': (0, 0, 0, 0) }

# SVG: прямоугольники по пикселям, crispEdges — чётко в любом размере
rects = []
for y, row in enumerate(ROWS):
    x = 0
    while x < 16:
        c = row[x]
        if c == '.': x += 1; continue
        x0 = x
        while x < 16 and row[x] == c: x += 1
        rects.append(f'<rect x="{x0}" y="{y}" width="{x - x0}" height="1" fill="{COL[c]}"/>')
svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">' + ''.join(rects) + '</svg>\n'
io.open(os.path.join(ROOT, 'assets/favicon.svg'), 'w', encoding='utf-8', newline='\n').write(svg)

def raster(size, bg=None, pad=0):
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(ROWS):
        for x, c in enumerate(row): im.putpixel((x, y), RGBA[c])
    if bg:
        canvas = Image.new('RGBA', (16 + 2 * pad, 16 + 2 * pad), bg)
        canvas.alpha_composite(im, (pad, pad)); im = canvas
    return im.resize((size, size), Image.NEAREST)

raster(32).save(os.path.join(ROOT, 'assets/favicon.png'))
raster(180, bg=(18, 11, 31, 255), pad=2).save(os.path.join(ROOT, 'assets/apple-touch-icon.png'))  # тёмный фон с полем: iOS скругляет сам
print('svg', len(svg), 'bytes;', len(rects), 'rects')

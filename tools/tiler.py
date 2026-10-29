"""Нарезка городских данных на тайлы для ленивой подгрузки.

Вход — словарь в схеме data/minsk.json (center, buildings, roads, rails, river,
green, water, trees, pois). Выход — папка data/map:

  index.json   метаданные: центр, размер тайла, список тайлов с размерами
  net.json     пешеходная сеть целиком (граф, по которому ходят скелеты)
  pois.json    заведения с высотой крыши (для тыкв)
  big.json     большие полигоны (парки, водоёмы), которые рисуются всегда
  t/X_Z.json   тайл: здания, дороги, зелень, вода, деревья, рельсы, река

Координаты — метры от центра, X на восток, Z на юг (как в игре).
"""
import json
import math
import os
import shutil

TILE = 500            # метров
BIG_SPAN = 3          # полигон шире 3×3 тайлов уходит в big.json
WALKABLE = ('path', 'service', 'minor', 'major')  # машин в игре нет: проезжие части тоже пешеходные


def rnd(v, nd=1):
    return round(v, nd)


def poly_bbox(p):
    xs = p[0::2]
    zs = p[1::2]
    return min(xs), min(zs), max(xs), max(zs)


def poly_centroid(p):
    # центроид по площади, с запасным вариантом — середина bbox
    a = 0.0
    cx = 0.0
    cz = 0.0
    n = len(p) // 2
    for i in range(n):
        j = (i + 1) % n
        x0, z0, x1, z1 = p[2 * i], p[2 * i + 1], p[2 * j], p[2 * j + 1]
        f = x0 * z1 - x1 * z0
        a += f
        cx += (x0 + x1) * f
        cz += (z0 + z1) * f
    if abs(a) < 1e-6:
        x0, z0, x1, z1 = poly_bbox(p)
        return (x0 + x1) / 2, (z0 + z1) / 2
    a *= 0.5
    return cx / (6 * a), cz / (6 * a)


def point_in_poly(x, z, p):
    inside = False
    n = len(p)
    j = n - 2
    i = 0
    while i < n:
        xi, zi, xj, zj = p[i], p[i + 1], p[j], p[j + 1]
        if (zi > z) != (zj > z) and x < (xj - xi) * (z - zi) / (zj - zi) + xi:
            inside = not inside
        j = i
        i += 2
    return inside


def tile_key(x, z, tile):
    return f"{math.floor(x / tile)}_{math.floor(z / tile)}"


def split_polyline(p, tile):
    """Режет ломаную на куски по тайлу середины каждого сегмента.

    Возвращает список (ключ тайла, список координат)."""
    runs = []
    cur_key = None
    cur = []
    for i in range(0, len(p) - 2, 2):
        x0, z0, x1, z1 = p[i], p[i + 1], p[i + 2], p[i + 3]
        k = tile_key((x0 + x1) / 2, (z0 + z1) / 2, tile)
        if k != cur_key:
            if cur:
                runs.append((cur_key, cur))
            cur_key = k
            cur = [x0, z0]
        cur += [x1, z1]
    if cur:
        runs.append((cur_key, cur))
    return runs


def write_outputs(data, out_dir, tile=TILE, source='OpenStreetMap'):
    t_dir = os.path.join(out_dir, 't')
    if os.path.isdir(t_dir):
        shutil.rmtree(t_dir)
    os.makedirs(t_dir, exist_ok=True)

    tiles = {}
    big = {'green': [], 'water': []}

    def t_(key):
        if key not in tiles:
            tiles[key] = {'buildings': [], 'roads': [], 'rails': [], 'river': [], 'green': [], 'water': [], 'trees': []}
        return tiles[key]

    span = lambda bb: max(math.floor(bb[2] / tile) - math.floor(bb[0] / tile), math.floor(bb[3] / tile) - math.floor(bb[1] / tile)) + 1

    for b in data.get('buildings', []):
        if len(b['p']) < 6:
            continue
        cx, cz = poly_centroid(b['p'])
        t_(tile_key(cx, cz, tile))['buildings'].append(b)

    for kind in ('green', 'water'):
        for g in data.get(kind, []):
            if len(g['p']) < 6:
                continue
            bb = poly_bbox(g['p'])
            if span(bb) > BIG_SPAN:
                big[kind].append(g)
            else:
                cx, cz = poly_centroid(g['p'])
                t_(tile_key(cx, cz, tile))[kind].append(g)

    for kind in ('roads', 'rails', 'river'):
        for r in data.get(kind, []):
            if len(r['p']) < 4:
                continue
            for key, run in split_polyline(r['p'], tile):
                item = {k: v for k, v in r.items() if k != 'p'}
                item['p'] = run
                t_(key)[kind].append(item)

    for tr in data.get('trees', []):
        t_(tile_key(tr[0], tr[1], tile))['trees'].append(tr)

    # пешеходная сеть: только проходимые дороги, целиком
    net = [{'p': r['p'], 'k': r['k'], **({'n': r['n']} if r.get('n') else {})} for r in data.get('roads', []) if r['k'] in WALKABLE and len(r['p']) >= 4]

    # заведения: высота крыши здания, в котором стоит точка
    pois = []
    bld_by_tile = {}
    for key, t in tiles.items():
        bld_by_tile[key] = t['buildings']
    for p in data.get('pois', []):
        q = dict(p)
        top = 6
        kx, kz = math.floor(p['x'] / tile), math.floor(p['z'] / tile)
        found = False
        for dx in (0, -1, 1):
            for dz in (0, -1, 1):
                for b in bld_by_tile.get(f"{kx + dx}_{kz + dz}", []):
                    if point_in_poly(p['x'], p['z'], b['p']):
                        top = b['h']
                        found = True
                        break
                if found:
                    break
            if found:
                break
        q['top'] = rnd(top)
        pois.append(q)

    index = {'v': 2, 'center': data['center'], 'tile': tile, 'source': source, 'tiles': {}}
    minx = minz = math.inf
    maxx = maxz = -math.inf
    for key, t in tiles.items():
        if not any(t.values()):
            continue
        path = os.path.join(t_dir, key + '.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(t, f, ensure_ascii=False, separators=(',', ':'))
        ix, iz = map(int, key.split('_'))
        minx, maxx = min(minx, ix * tile), max(maxx, (ix + 1) * tile)
        minz, maxz = min(minz, iz * tile), max(maxz, (iz + 1) * tile)
        index['tiles'][key] = {'b': len(t['buildings']), 'r': len(t['roads']), 'kb': os.path.getsize(path) // 1024}
    index['bbox'] = [minx, minz, maxx, maxz]
    index['stats'] = {'buildings': sum(len(t['buildings']) for t in tiles.values()), 'roads': len(data.get('roads', [])), 'pois': len(pois), 'tiles': len(index['tiles'])}

    with open(os.path.join(out_dir, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(out_dir, 'net.json'), 'w', encoding='utf-8') as f:
        json.dump({'roads': net}, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(out_dir, 'pois.json'), 'w', encoding='utf-8') as f:
        json.dump(pois, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(out_dir, 'big.json'), 'w', encoding='utf-8') as f:
        json.dump(big, f, ensure_ascii=False, separators=(',', ':'))
    return index

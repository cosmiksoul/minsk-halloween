#!/usr/bin/env python3
"""Запекает карту Минска (или любого города) из OpenStreetMap в тайлы data/map.

Нужен только Python 3 и доступ к Overpass API. Запускать из корня репозитория:

    python3 tools/bake_osm.py                       # весь Минск в пределах МКАД
    python3 tools/bake_osm.py --bbox 53.88,27.52,53.93,27.62   # свой прямоугольник (S,W,N,E)
    python3 tools/bake_osm.py --server https://overpass.kumi.systems/api/interpreter

Сырые ответы Overpass кэшируются в tools/cache/, повторный запуск не ходит в сеть.
Полный Минск — это ~50 запросов по несколько мегабайт, займёт 10–30 минут
в зависимости от загрузки сервера. Результат: data/map/index.json, net.json,
pois.json, big.json и ~1500 тайлов в data/map/t/.
"""
import argparse
import hashlib
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tiler import write_outputs, point_in_poly, poly_centroid  # noqa: E402

CENTER = (53.904, 27.5685)           # тот же центр, что и раньше: координаты старых событий остаются верными
MINSK_BBOX = (53.825, 27.385, 53.985, 27.745)   # S, W, N, E — примерно по МКАД
CHUNK_LAT, CHUNK_LON = 0.03, 0.05               # ~3.3 × 3.3 км на запрос

QUERY = """[out:json][timeout:240][bbox:{s},{w},{n},{e}];
(
  way["building"];
  relation["building"]["type"="multipolygon"];
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service|footway|pedestrian|path|steps|cycleway|track|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"];
  way["railway"~"^(rail|tram)$"];
  way["waterway"="river"];
  way["natural"="water"];
  relation["natural"="water"];
  way["landuse"="reservoir"];
  way["leisure"~"^(park|garden|pitch|playground|dog_park)$"];
  relation["leisure"="park"];
  way["landuse"~"^(grass|forest|meadow|cemetery|recreation_ground|village_green|orchard|allotments)$"];
  relation["landuse"~"^(forest|cemetery)$"];
  way["natural"~"^(wood|scrub|grassland)$"];
  relation["natural"="wood"];
  node["natural"="tree"];
  node["amenity"~"^(bar|pub|nightclub|cafe|restaurant|biergarten)$"];
  way["amenity"~"^(bar|pub|nightclub|cafe|restaurant|biergarten)$"];
);
out geom;
"""

MAJOR = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}
MINOR = {'residential', 'unclassified', 'living_street'}
PATH = {'footway', 'pedestrian', 'path', 'steps', 'cycleway', 'track'}
RES = {'residential', 'apartments', 'house', 'detached', 'dormitory', 'terrace', 'semidetached_house', 'bungalow'}
COM = {'commercial', 'retail', 'office', 'hotel', 'supermarket', 'kiosk', 'mall', 'shop'}
PUB = {'public', 'school', 'university', 'hospital', 'government', 'civic', 'train_station', 'sports_hall', 'sports_centre', 'stadium', 'kindergarten', 'college', 'museum', 'theatre', 'library', 'transportation'}
IND = {'industrial', 'warehouse', 'garage', 'garages', 'shed', 'service', 'hangar', 'factory', 'storage_tank', 'roof', 'carport'}
CHURCH = {'church', 'cathedral', 'chapel', 'temple', 'synagogue', 'mosque', 'monastery'}
GREEN_F = {'forest', 'wood', 'cemetery'}


def project(center):
    lat0, lon0 = center
    kx = math.cos(lat0 * math.pi / 180) * 111320
    kz = 110574
    return lambda lat, lon: (round((lon - lon0) * kx, 1), round(-(lat - lat0) * kz, 1))


class BadChunk(Exception):
    """Overpass ответил 200, но результат битый: таймаут, нехватка памяти или подозрительно пусто."""


def check(data):
    remark = str(data.get('remark', ''))
    if any(k in remark.lower() for k in ('error', 'timed out', 'timeout', 'memory')):
        raise BadChunk(remark[:160])
    if not data.get('elements'):
        raise BadChunk('пустой ответ')
    return data


def fetch(server, s, w, n, e, cache_dir, pause):
    q = QUERY.format(s=s, w=w, n=n, e=e)
    key = hashlib.sha1((server + q).encode()).hexdigest()[:16]
    path = os.path.join(cache_dir, f'{s:.3f}_{w:.3f}_{key}.json')
    if os.path.exists(path):
        try:
            with open(path, encoding='utf-8') as f:
                return check(json.load(f))
        except (BadChunk, json.JSONDecodeError) as ex:
            print(f'  кэш битый ({ex}), качаем заново', file=sys.stderr)
            os.remove(path)
    body = urllib.parse.urlencode({'data': q}).encode()
    for attempt in range(6):
        try:
            req = urllib.request.Request(server, data=body, headers={'User-Agent': 'minsk-halloween-bake/1.0'})
            with urllib.request.urlopen(req, timeout=300) as r:
                raw = r.read()
            data = check(json.loads(raw))
            with open(path, 'wb') as f:
                f.write(raw)
            print(f'  ок: {len(data["elements"])} объектов')
            time.sleep(pause)
            return data
        except BadChunk as ex:
            # пустой кусок на краю города бывает честно пустым: принимаем после второй попытки
            if 'пустой' in str(ex) and attempt >= 1:
                print('  пусто, принимаем как есть')
                with open(path, 'wb') as f:
                    f.write(raw)
                return {'elements': []}
            wait = 20 * (attempt + 1)
            print(f'  Overpass вернул битый ответ ({ex}); повтор через {wait} с', file=sys.stderr)
            time.sleep(wait)
        except (urllib.error.HTTPError, urllib.error.URLError, json.JSONDecodeError, TimeoutError) as ex:
            wait = 15 * (attempt + 1)
            print(f'  ошибка {ex}; повтор через {wait} с', file=sys.stderr)
            time.sleep(wait)
    raise SystemExit('Overpass не отвечает, попробуй позже или другой --server')


def ring_from_ways(ways):
    """Склеивает отрезки (списки точек) в замкнутые кольца."""
    segs = [list(w) for w in ways if len(w) >= 2]
    rings = []
    while segs:
        ring = segs.pop()
        changed = True
        while changed and ring[0] != ring[-1]:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]:
                    ring += s[1:]
                elif s[-1] == ring[-1]:
                    ring += list(reversed(s))[1:]
                elif s[-1] == ring[0]:
                    ring = s[:-1] + ring
                elif s[0] == ring[0]:
                    ring = list(reversed(s))[:-1] + ring
                else:
                    continue
                segs.pop(i)
                changed = True
                break
        if len(ring) >= 4:
            if ring[0] != ring[-1]:
                ring.append(ring[0])
            rings.append(ring)
    return rings


def flat(pts):
    out = []
    for x, z in pts:
        out += [x, z]
    return out


def area(ring):
    a = 0.0
    for i in range(len(ring) - 1):
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return a / 2


def height_of(tags, bid):
    h = tags.get('height')
    if h:
        try:
            return max(3.0, min(160.0, float(h.replace('m', '').replace(',', '.').strip())))
        except ValueError:
            pass
    lv = tags.get('building:levels')
    if lv:
        try:
            return max(3.0, min(160.0, float(lv.replace(',', '.')) * 3.1 + 1.0))
        except ValueError:
            pass
    b = tags.get('building', 'yes')
    base = 12 if b in RES else 8 if b in COM else 10 if b in PUB else 6 if b in IND else 14 if b in CHURCH else 6
    return base + (bid % 7) * 0.7


def btype(tags):
    b = tags.get('building', 'yes')
    if b in RES: return 'res'
    if b in COM: return 'com'
    if b in PUB or tags.get('amenity') in ('school', 'university', 'hospital', 'theatre'): return 'pub'
    if b in IND: return 'ind'
    if b in CHURCH: return 'church'
    return 'yes'


def addr(tags):
    s, hn = tags.get('addr:street'), tags.get('addr:housenumber')
    return (s + ' ' + hn) if s and hn else (s or '')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--bbox', default=','.join(map(str, MINSK_BBOX)), help='S,W,N,E в градусах')
    ap.add_argument('--server', default='https://overpass-api.de/api/interpreter')
    ap.add_argument('--out', default='data/map')
    ap.add_argument('--tile', type=int, default=500)
    ap.add_argument('--pause', type=float, default=3.0, help='пауза между запросами, с')
    ap.add_argument('--max-trees-per-tile', type=int, default=120)
    args = ap.parse_args()

    s0, w0, n0, e0 = map(float, args.bbox.split(','))
    pr = project(CENTER)
    cache_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cache')
    os.makedirs(cache_dir, exist_ok=True)

    seen = set()
    data = {'center': list(CENTER), 'buildings': [], 'roads': [], 'rails': [], 'river': [], 'green': [], 'water': [], 'trees': [], 'pois': []}

    lat = s0
    chunks = []
    while lat < n0:
        lon = w0
        while lon < e0:
            chunks.append((lat, lon, min(lat + CHUNK_LAT, n0), min(lon + CHUNK_LON, e0)))
            lon += CHUNK_LON
        lat += CHUNK_LAT
    print(f'{len(chunks)} запросов к {args.server}')

    thin = []
    for i, (s, w, n, e) in enumerate(chunks):
        print(f'[{i + 1}/{len(chunks)}] {s:.3f},{w:.3f} – {n:.3f},{e:.3f}')
        res = fetch(args.server, s, w, n, e, cache_dir, args.pause)
        if len(res.get('elements', [])) < 200:
            thin.append((i + 1, len(res.get('elements', []))))
        for el in res.get('elements', []):
            uid = el['type'][0] + str(el['id'])
            if uid in seen:
                continue
            seen.add(uid)
            tags = el.get('tags', {})
            if el['type'] == 'node':
                x, z = pr(el['lat'], el['lon'])
                if tags.get('natural') == 'tree':
                    data['trees'].append([x, z])
                elif tags.get('amenity'):
                    data['pois'].append({'x': x, 'z': z, 'n': tags.get('name'), 't': tags['amenity'], 'a': addr(tags), 'h': tags.get('opening_hours', ''), 'w': tags.get('website') or tags.get('contact:website') or '', 'c': tags.get('cuisine')})
                continue

            # геометрия: для way — список точек, для relation — кольца из членов
            if el['type'] == 'way':
                pts = [pr(g['lat'], g['lon']) for g in el.get('geometry', []) if g]
                if len(pts) < 2:
                    continue
                outer, inner = [pts] if pts[0] == pts[-1] and len(pts) >= 4 else [], []
                line = pts
            else:
                outers, inners = [], []
                for m in el.get('members', []):
                    if m.get('type') != 'way' or not m.get('geometry'):
                        continue
                    mp = [pr(g['lat'], g['lon']) for g in m['geometry'] if g]
                    (inners if m.get('role') == 'inner' else outers).append(mp)
                outer = ring_from_ways(outers)
                inner = ring_from_ways(inners)
                line = None

            if 'building' in tags:
                if not outer:
                    continue
                outer.sort(key=lambda r: -abs(area(r)))
                ring = outer[0]
                holes = [flat(h) for h in inner if point_in_poly(h[0][0], h[0][1], flat(ring))]
                b = {'p': flat(ring), 'h': round(height_of(tags, el['id']), 1), 't': btype(tags), 'n': tags.get('name')}
                if holes:
                    b['holes'] = holes
                data['buildings'].append(b)
                if tags.get('amenity') in ('bar', 'pub', 'nightclub', 'cafe', 'restaurant', 'biergarten'):
                    cx, cz = poly_centroid(b['p'])
                    data['pois'].append({'x': round(cx, 1), 'z': round(cz, 1), 'n': tags.get('name'), 't': tags['amenity'], 'a': addr(tags), 'h': tags.get('opening_hours', ''), 'w': tags.get('website') or tags.get('contact:website') or '', 'c': tags.get('cuisine')})
                # несколько внешних колец (редко): остальные как отдельные здания
                for extra in outer[1:]:
                    data['buildings'].append({'p': flat(extra), 'h': b['h'], 't': b['t'], 'n': None})
            elif 'highway' in tags and line:
                hw = tags['highway']
                k = 'major' if hw in MAJOR else 'minor' if hw in MINOR else 'service' if hw == 'service' else 'path' if hw in PATH else None
                if not k:
                    continue
                r = {'p': flat(line), 'k': k}
                if tags.get('name'):
                    r['n'] = tags['name']
                if hw == 'steps':
                    r['st'] = 1
                wd = tags.get('width')
                if wd:
                    try:
                        r['w'] = float(wd.replace(',', '.').replace('m', '').strip())
                    except ValueError:
                        pass
                data['roads'].append(r)
            elif 'railway' in tags and line:
                data['rails'].append({'p': flat(line), 'k': tags['railway']})
            elif tags.get('waterway') == 'river' and line:
                data['river'].append({'p': flat(line)})
            elif tags.get('natural') == 'water' or tags.get('landuse') == 'reservoir':
                for ring in outer:
                    data['water'].append({'p': flat(ring)})
            elif tags.get('amenity') and line:
                cx, cz = poly_centroid(flat(line))
                data['pois'].append({'x': round(cx, 1), 'z': round(cz, 1), 'n': tags.get('name'), 't': tags['amenity'], 'a': addr(tags), 'h': tags.get('opening_hours', ''), 'w': tags.get('website') or '', 'c': tags.get('cuisine')})
            else:
                f = 1 if (tags.get('landuse') in GREEN_F or tags.get('natural') in GREEN_F) else 0
                for ring in outer:
                    g = {'p': flat(ring)}
                    if f:
                        g['f'] = 1
                    holes = [flat(h) for h in inner if point_in_poly(h[0][0], h[0][1], g['p'])]
                    if holes:
                        g['holes'] = holes
                    data['green'].append(g)

    # деревьев в OSM может быть очень много — прореживаем по тайлам
    if args.max_trees_per_tile:
        per = {}
        kept = []
        for t in data['trees']:
            key = (math.floor(t[0] / args.tile), math.floor(t[1] / args.tile))
            c = per.get(key, 0)
            if c < args.max_trees_per_tile:
                kept.append(t)
                per[key] = c + 1
        data['trees'] = kept

    if thin:
        print('подозрительно пустые куски (номер: объектов):', ', '.join(f'{i}: {n}' for i, n in thin), '— если это не окраина, удали их файлы из tools/cache и перезапусти')
    print('зданий', len(data['buildings']), 'дорог', len(data['roads']), 'зелени', len(data['green']), 'воды', len(data['water']), 'деревьев', len(data['trees']), 'заведений', len(data['pois']))
    index = write_outputs(data, args.out, tile=args.tile, source=f'OpenStreetMap, Overpass {time.strftime("%Y-%m-%d")}')
    print('тайлов:', len(index['tiles']), 'bbox:', index['bbox'])


if __name__ == '__main__':
    main()

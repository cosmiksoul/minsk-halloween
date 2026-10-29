#!/usr/bin/env python3
"""Нарезает старый единый data/minsk.json на тайлы data/map/*.

    python3 tools/retile.py [data/minsk.json] [data/map] [--no-stub]

Пока город не запечён целиком, добавляет пешеходную дорогу-заглушку по проспекту
Независимости от парка Челюскинцев до башни «Футурис» (Независимости, 173),
чтобы до аркана «Башня» можно было дойти.
"""
import json
import math
import os
import sys

# Консоль Windows (или пайп) может быть не в UTF-8, тогда print с кириллицей падает с UnicodeEncodeError
for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, 'reconfigure'):
        _stream.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tiler import write_outputs  # noqa: E402

STUB = [(53.9247, 27.6119), (53.9300, 27.6310), (53.9343, 27.6515), (53.9386, 27.6660), (53.9440, 27.6845), (53.9447, 27.6857)]


def largest_component(roads):
    """Узлы самой большой компоненты проходимой сети — как в src/sim.js."""
    parent = {}

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb
    for r in roads:
        if r['k'] == 'major':
            continue
        p = r['p']
        prev = None
        for i in range(0, len(p), 2):
            k = (p[i], p[i + 1])
            parent.setdefault(k, k)
            if prev is not None and prev != k:
                union(prev, k)
            prev = k
    sizes = {}
    for k in parent:
        root = find(k)
        sizes[root] = sizes.get(root, 0) + 1
    best = max(sizes, key=sizes.get)
    return {k for k in parent if find(k) == best}


def add_stub(data):
    lat0, lon0 = data['center']
    kx, kz = math.cos(lat0 * math.pi / 180) * 111320, 110574
    pts = [(round((lon - lon0) * kx, 1), round(-(lat - lat0) * kz, 1)) for lat, lon in STUB]
    comp = largest_component(data['roads'])
    sx, sz = pts[0]
    best = min(comp, key=lambda k: (k[0] - sx) ** 2 + (k[1] - sz) ** 2)
    if (best[0] - sx) ** 2 + (best[1] - sz) ** 2 > 500 ** 2:
        print('заглушка: сеть слишком далеко от парка Челюскинцев, пропускаем')
        return
    flat = [best[0], best[1]]
    for x, z in pts[1:]:
        flat += [x, z]
    data['roads'].append({'p': flat, 'k': 'path', 'n': 'проспект Независимости'})
    data['roads'].append({'p': flat, 'k': 'major', 'n': 'проспект Независимости'})
    print('заглушка проспекта до «Футуриса» добавлена, старт', best)


args = [a for a in sys.argv[1:] if not a.startswith('--')]
src = args[0] if len(args) > 0 else 'data/minsk.json'
dst = args[1] if len(args) > 1 else 'data/map'
with open(src, encoding='utf-8') as f:
    data = json.load(f)
if '--no-stub' not in sys.argv:
    add_stub(data)
index = write_outputs(data, dst)
print('тайлов:', len(index['tiles']), 'bbox:', index['bbox'], 'статистика:', index['stats'])

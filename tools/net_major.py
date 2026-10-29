#!/usr/bin/env python3
"""Проезжие части в пешеходную сеть: python tools/net_major.py

Машин в игре нет, поэтому скелеты ходят и по проспектам. tiler.py кладёт в
data/map/net.json только path/service/minor; исходный data/minsk.json в репозитории
не хранится, поэтому major-дороги берём из уже нарезанных тайлов data/map/t/*.json
(куски режутся по границам тайлов с общей точкой на стыке, граф склеивает их по
координатам) и дописываем в net.json. Идемпотентен: если в сети уже есть major,
ничего не делает. При новой запечке tiler.py (WALKABLE с 'major') скрипт не нужен.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NET = ROOT / 'data' / 'map' / 'net.json'
TILES = ROOT / 'data' / 'map' / 't'


def main():
    net = json.loads(NET.read_text(encoding='utf-8'))
    roads = net['roads']
    if any(r['k'] == 'major' for r in roads):
        print(f'net.json: проезжие части уже в сети ({sum(r["k"] == "major" for r in roads)} кусков), ничего не меняю')
        return
    added = 0
    for f in sorted(TILES.glob('*.json')):
        t = json.loads(f.read_text(encoding='utf-8'))
        for r in t.get('roads', []):
            if r.get('k') != 'major' or len(r['p']) < 4:
                continue
            item = {'p': r['p'], 'k': 'major'}
            if r.get('n'):
                item['n'] = r['n']
            roads.append(item)
            added += 1
    if not added:
        sys.exit('в тайлах нет major-дорог')
    NET.write_text(json.dumps(net, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'net.json: добавлено {added} кусков проезжих частей, всего дорог {len(roads)}')


if __name__ == '__main__':
    main()

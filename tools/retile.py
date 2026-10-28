#!/usr/bin/env python3
"""Нарезает старый единый data/minsk.json на тайлы data/map/*.

    python3 tools/retile.py [data/minsk.json] [data/map]
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tiler import write_outputs  # noqa: E402

src = sys.argv[1] if len(sys.argv) > 1 else 'data/minsk.json'
dst = sys.argv[2] if len(sys.argv) > 2 else 'data/map'
with open(src, encoding='utf-8') as f:
    data = json.load(f)
index = write_outputs(data, dst)
print('тайлов:', len(index['tiles']), 'bbox:', index['bbox'], 'статистика:', index['stats'])

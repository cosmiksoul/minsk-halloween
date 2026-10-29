#!/usr/bin/env python3
"""Версия модулей в карте импортов: python tools/version.py [rev]

Переписывает index.html: в importmap для каждого src/*.js запись
"./src/<name>.js": "./src/<name>.js?v=<rev>" (записи three остаются как есть),
src="src/main.js?v=<rev>" у стартового скрипта и href="style.css?v=<rev>" у стилей. rev по умолчанию —
git rev-parse --short HEAD. Карта применяется к уже разрешённым URL, поэтому
относительные импорты внутри модулей тоже получают ?v=: после выкладки
браузеры игроков берут новые файлы, а не кэш. Идемпотентен.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'index.html'


def main():
    rev = sys.argv[1] if len(sys.argv) > 1 else subprocess.check_output(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT, text=True).strip()
    if not re.fullmatch(r'[\w.-]+', rev):
        sys.exit(f'странная ревизия: {rev!r}')
    html = INDEX.read_text(encoding='utf-8')
    m = re.search(r'(<script type="importmap">\s*)([\s\S]*?)(\s*</script>)', html)
    if not m:
        sys.exit('index.html: нет <script type="importmap">')
    data = json.loads(m.group(2))
    imports = {k: v for k, v in data.get('imports', {}).items() if not k.startswith('./src/')}
    for p in sorted(ROOT.glob('src/*.js')):
        imports[f'./src/{p.name}'] = f'./src/{p.name}?v={rev}'
    data['imports'] = imports
    if set(data) == {'imports'}:
        body = '{ "imports": {\n' + ',\n'.join(f'  {json.dumps(k)}: {json.dumps(v)}' for k, v in imports.items()) + '\n} }'
    else:  # появятся scopes или integrity — пишем всю карту целиком
        body = json.dumps(data, indent=2, ensure_ascii=False)
    html = html[:m.start(2)] + body + html[m.end(2):]
    html, n = re.subn(r'src="src/main\.js(\?v=[^"]*)?"', f'src="src/main.js?v={rev}"', html)
    if n != 1:
        sys.exit('index.html: нет <script type="module" src="src/main.js">')
    html, n = re.subn(r'href="style\.css(\?v=[^"]*)?"', f'href="style.css?v={rev}"', html)  # стили тоже версионируем: иначе новый интерфейс приходит со старым CSS из кэша
    if n != 1:
        sys.exit('index.html: нет <link rel="stylesheet" href="style.css">')
    INDEX.write_text(html, encoding='utf-8')
    print(f'index.html: {sum(k.startswith("./src/") for k in imports)} модулей, v={rev}')


if __name__ == '__main__':
    main()

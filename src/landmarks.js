// Узнаваемые здания Минска: лоу-поли модели поверх OSM-контуров и поправки высот.
// Две группы: отдельные меши, которые рисуются всегда (башня «Футурис», телебашня, обелиск,
// колесо обозрения, стадион «Динамо»), и «крыши» для OSM-зданий по имени (купола, шпили,
// башни, кристалл библиотеки), которые собираются вместе с тайлом.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

// --- отдельные меши
export const LANDMARKS = [
  // башня «Футурис»: квадратный блок в южном конце контура, низкое крыло уходит на север
  { id: 'futuris', kind: 'futuris', name: 'Башня «Футурис»', addr: 'пр. Независимости, 173', lat: 53.94120, lon: 27.66725, w: 40, d: 40, h: 88, rot: -0.07, zone: 30, wing: { dx: -3, dz: -74, w: 28, d: 108, h: 22 },
    blurb: 'Одна из самых высоких башен города, 25 этажей. Ночью фасад превращается в огромный экран. Здесь спрятана аркана «Башня».' },
  { id: 'tv', kind: 'tv', name: 'Минская телебашня', addr: 'ул. Коммунистическая, 6', lat: 53.9171, lon: 27.5563, h: 300, blurb: 'Стальная мачта высотой за 350 метров, самая высокая конструкция в Беларуси. С неё транслируют телевидение и радио, а красные огни видны с любого конца города.' },
  { id: 'obelisk', kind: 'obelisk', name: 'Монумент Победы', addr: 'площадь Победы', lat: 53.90868, lon: 27.57509, h: 38, blurb: 'Обелиск высотой 38 метров открыт в 1954 году, Вечный огонь зажжён в 1961-м. Под площадью мемориальный зал.' },
  { id: 'wheel', kind: 'wheel', name: 'Колесо обозрения', addr: 'парк Горького', lat: 53.9058, lon: 27.5742, h: 54, blurb: 'Колесо высотой 54 метра стоит в старейшем парке Минска с 2003 года. С верхней точки виден весь центр.' },
  { id: 'dinamo', kind: 'stadium', name: 'Стадион «Динамо»', addr: 'ул. Кирова, 8/2', lat: 53.8952, lon: 27.56017, rot: -1.1, zone: 70, blurb: 'Главный стадион страны, открыт в 1934 году, принимал Олимпиаду-80 и заново отстроен к 2018-му. В 1982-м минское «Динамо» стало чемпионом СССР.' },
];
// OSM-здания, которые заменены отдельными мешами
export const SKIP_NAMES = /БЦ Футурис/i;

// --- поправки высот и «крыши» для OSM-зданий по имени
const FIXES = [
  [/Нацыянальная бібліятэка|Национальная библиотека/i, { h: 15, roof: 'crystal', info: { name: 'Национальная библиотека', addr: 'пр. Независимости, 116', blurb: 'Ромбокубооктаэдр, 23 этажа и 72 метра, открыт в 2006 году. На крыше смотровая площадка, по вечерам фасад светится как огромный экран.' } }],
  [/Мінск-Арэна|Минск-Арена/i, { h: 36, dome: [58, 16], maxArea: 20000, info: { name: 'Минск-Арена', addr: 'пр. Победителей, 111', blurb: 'Ледовая арена на 15 тысяч зрителей, открыта в 2010 году. Здесь играет хоккейное «Динамо» и проходят большие концерты.' } }],
  [/Чыжоўка-Арэна|Чижовка-Арена/i, { h: 22, info: { name: 'Чижовка-Арена', addr: 'ул. Ташкентская, 19', blurb: 'Вторая ледовая арена Минска, построена к чемпионату мира по хоккею 2014 года.' } }],
  [/Беларускі дзяржаўны цырк|государственный цирк/i, { h: 14, dome: [22, 12], info: { name: 'Белорусский государственный цирк', addr: 'пр. Независимости, 32', blurb: 'Здание с куполом и колоннадой открыто в 1959 году, один из первых послевоенных стационарных цирков СССР.' } }],
  [/Камароўскі рынак|Комаровский рынок/i, { h: 10, dome: [60, 12], info: { name: 'Комаровский рынок', addr: 'ул. Веры Хоружей, 8', blurb: 'Главный рынок города под куполом без единой опоры, построен в 1979–1980 годах на месте Комаровского болота.' } }],
  [/^Ратуша$/i, { h: 12, roof: 'tower', info: { name: 'Минская ратуша', addr: 'пл. Свободы, 2а', blurb: 'Символ магдебургского права. Старое здание снесли в 1857-м, нынешнее восстановили в 2004 году по чертежам XVIII века.' } }],
  [/Вароты Мінска|Ворота Минска/i, { h: 42, roof: 'gate', info: { name: 'Ворота Минска', addr: 'Привокзальная площадь', blurb: 'Две одиннадцатиэтажные башни 1947–1953 годов встречают приезжающих. На одной самые большие в Беларуси трофейные часы.' } }],
  [/Пішчалаўскі замак|Пищаловский замок/i, { h: 14, roof: 'castle', info: { name: 'Пищаловский замок', addr: 'ул. Володарского, 2', blurb: 'Белый замок с четырьмя башнями построен в 1825 году и с тех пор остаётся тюрьмой, знаменитой «Володаркой».' } }],
  [/Палац Рэспублікі|Дворец Республики/i, { h: 36, info: { name: 'Дворец Республики', addr: 'Октябрьская площадь, 1', blurb: 'Главный концертный зал страны, строился с 1985 по 2001 год. Минчане зовут его «саркофагом».' } }],
  [/Палац спорту|Дворец спорта/i, { h: 18, info: { name: 'Дворец спорта', addr: 'пр. Победителей, 4', blurb: 'Открыт в 1966 году, типовой проект советских дворцов спорта. Концерты, хоккей, ярмарки.' } }],
  [/Вялікі тэатр оперы|Большой театр/i, { h: 30, info: { name: 'Большой театр оперы и балета', addr: 'пл. Парижской Коммуны, 1', blurb: 'Здание Иосифа Лангбарда 1938 года в стиле конструктивизма, стоит на холме бывшего Троицкого базара.' } }],
  [/Палац Незалежнасці|Дворец Независимости/i, { h: 24, info: { name: 'Дворец Независимости', addr: 'пр. Победителей, 100', blurb: 'Резиденция для официальных приёмов, открыта в 2013 году.' } }],
  [/Гатэль Пекін|Отель «Пекин»/i, { h: 38, info: { name: 'Отель «Пекин»', addr: 'ул. Красноармейская, 36', blurb: 'Пятизвёздочный отель 2014 года у парка Горького. В афише этой ночи здесь хэллоуинский бранч.' } }],
  [/^Беларусь$/i, { info: { name: 'Гостиница «Беларусь»', addr: 'ул. Сторожевская, 15', blurb: 'Высотка 1987 года над Свислочью, 22 этажа. Одна из самых узнаваемых точек на панораме центра.' } }],
  [/Дом Правительства|Дом урада/i, { info: { name: 'Дом Правительства', addr: 'пл. Независимости', blurb: 'Самое большое здание довоенного Минска, 1930–1934 годы, архитектор Иосиф Лангбард. Пережило войну почти без повреждений.' } }],
  [/^ГУМ$/i, { info: { name: 'ГУМ', addr: 'пр. Независимости, 21', blurb: 'Главный универмаг открыт в 1951 году и до сих пор торгует в интерьерах сталинского ампира. Здесь магазин одежды для скелетов.' } }],
  [/Galleria Minsk/i, { info: { name: 'Galleria Minsk', addr: 'пр. Победителей, 9', blurb: 'Торговый центр и отель DoubleTree, открыт в 2016 году на месте стадиона «Динамо-Юни».' } }],
  [/^Dana Mall$/i, { info: { name: 'Dana Mall', addr: 'ул. Петра Мстиславца, 11', blurb: 'Один из крупнейших торговых центров города рядом с Национальной библиотекой.' } }],
  [/Кафедральны сабор Сашэсця|Собор Сошествия/i, { h: 24, roof: 'twin', info: { name: 'Кафедральный собор Сошествия Святого Духа', addr: 'ул. Кирилла и Мефодия, 3', blurb: 'Главный православный храм города, 1633–1642 годы. Здесь хранится Минская икона Божией Матери.' } }],
  [/Архікафедральны касцёл|Архикафедральный костёл/i, { h: 26, roof: 'twin', info: { name: 'Архикафедральный костёл Пресвятой Девы Марии', addr: 'пл. Свободы, 9', blurb: 'Барочный иезуитский костёл 1710 года, главный католический храм Минска.' } }],
  [/Сабор Святых апосталаў Пятра і Паўла|Петра и Павла/i, { h: 22, roof: 'twin', info: { name: 'Собор Святых Петра и Павла', addr: 'ул. Раковская, 4', blurb: 'Старейшее сохранившееся здание Минска, 1612 год.' } }],
  [/Касцёл Святых Сымона|Симеона и Святой Елены|Красный костёл/i, { roof: 'twin', info: { name: 'Красный костёл', addr: 'ул. Советская, 15', blurb: 'Костёл Святых Симеона и Елены, 1905–1910 годы, построен Эдвардом Войниловичем в память о детях.' } }],
  [/Манумент Перамогі|Монумент Победы/i, { h: 2, info: { name: 'Монумент Победы', addr: 'площадь Победы', blurb: 'Обелиск высотой 38 метров открыт в 1954 году, Вечный огонь зажжён в 1961-м. Под площадью мемориальный зал.' } }],
  [/Пішчалаўскі|Планетарый/i, { h: 12 }],
  [/Нацыянальная акадэмія навук/i, { h: 22, info: { name: 'Национальная академия наук', addr: 'пр. Независимости, 66', blurb: 'Полукруглая колоннада Иосифа Лангбарда 1939 года.' } }],
  [/Нацыянальны акадэмічны тэатр імя Янкі Купалы|Купаловского театра|Купалы/i, { info: { name: 'Купаловский театр', addr: 'ул. Энгельса, 7', blurb: 'Старейший театр Беларуси в здании городского театра 1890 года.' } }],
];
export function fixFor(name) { if (!name) return null; for (const [re, fix] of FIXES) if (re.test(name)) return fix; return null; }
export const TYPE_LABEL = { res: 'жилой дом', com: 'торговое или офисное здание', pub: 'общественное здание', church: 'храм', ind: 'промышленное здание', yes: 'здание' };

// --- общие материалы для крыш и мешей
const MAT = {
  stone: new THREE.MeshLambertMaterial({ color: 0xb9b2c6 }), dark: new THREE.MeshLambertMaterial({ color: 0x241838 }), steel: new THREE.MeshLambertMaterial({ color: 0x6a6f7a }),
  copper: new THREE.MeshLambertMaterial({ color: 0x3f8f7a }), gold: new THREE.MeshLambertMaterial({ color: 0xffd23a, emissive: 0x9a7a10, emissiveIntensity: 0.5 }),
  glass: new THREE.MeshLambertMaterial({ color: 0x1c2a5a, emissive: 0x2255aa, emissiveIntensity: 0.6 }), edge: new THREE.LineBasicMaterial({ color: 0x7ad8ff }),
  red: new THREE.MeshLambertMaterial({ color: 0xc0392b }), white: new THREE.MeshLambertMaterial({ color: 0xf4f1e3 }), green: new THREE.MeshLambertMaterial({ color: 0x26381f }),
  sand: new THREE.MeshLambertMaterial({ color: 0xcdb892 }), cabin: [new THREE.MeshLambertMaterial({ color: 0xff8a2a }), new THREE.MeshLambertMaterial({ color: 0x4df21e }), new THREE.MeshLambertMaterial({ color: 0x5ad8ff })],
};
// купол: сферический сегмент с радиусом основания rb и высотой hc, стоит на высоте y
function dome(rb, hc, y, x, z, mat = MAT.copper) {
  const R = (rb * rb + hc * hc) / (2 * hc); const phi = Math.acos((R - hc) / R);
  const g = new THREE.SphereGeometry(R, 20, 6, 0, Math.PI * 2, 0, phi); const m = new THREE.Mesh(g, mat); m.position.set(x, y - (R - hc), z); return m;
}
function spire(x, y, z, r, h, mat = MAT.copper) { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mat); m.position.set(x, y + h / 2, z); return m; }
function box(x, y, z, w, h, d, mat, rot = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); m.rotation.y = rot; return m; }
function cross(x, y, z) { const g = new THREE.Group(); g.add(box(x, y, z, 0.5, 4, 0.5, MAT.gold), box(x, y + 2.6, z, 2.4, 0.5, 0.5, MAT.gold)); return g; }
// ромбокубооктаэдр: все перестановки (±1, ±1, ±(1+√2))
function crystal(R) {
  const k = 1 + Math.SQRT2, pts = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { pts.push(new THREE.Vector3(sx, sy, sz * k), new THREE.Vector3(sx, sy * k, sz), new THREE.Vector3(sx * k, sy, sz)); }
  const geo = new ConvexGeometry(pts.map(p => p.multiplyScalar(R)));
  const g = new THREE.Group(); const mesh = new THREE.Mesh(geo, MAT.glass.clone()); g.add(mesh); g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), MAT.edge)); g.userData.crystalMat = mesh.material; return g;
}
// углы контура: самые дальние вершины в четырёх диагональных направлениях
function corners(p, cx, cz) {
  const best = [[-1e9, null], [-1e9, null], [-1e9, null], [-1e9, null]];
  for (let i = 0; i < p.length; i += 2) { const dx = p[i] - cx, dz = p[i + 1] - cz; const sc = [dx + dz, dx - dz, -dx + dz, -dx - dz]; for (let k = 0; k < 4; k++) if (sc[k] > best[k][0]) best[k] = [sc[k], [p[i], p[i + 1]]]; }
  return best.map(b => b[1]).filter(Boolean);
}
// добавить «крышу» к OSM-зданию (вызывается из сборки тайла)
export function addRoof(group, fix, b, cx, cz, h) {
  const anim = group.userData.anim || (group.userData.anim = []);
  if (fix.dome) group.add(dome(fix.dome[0], fix.dome[1], h, cx, cz));
  switch (fix.roof) {
    case 'crystal': { const c = crystal(12.4); c.position.set(cx, h + 12.4 * (1 + Math.SQRT2), cz); c.rotation.y = 0.2; group.add(c); anim.push({ kind: 'crystal', mat: c.userData.crystalMat }); break; }
    case 'tower': group.add(box(cx, h, cz, 7, 20, 7, MAT.white), box(cx, h + 20, cz, 5, 1, 5, MAT.dark), spire(cx, h + 21, cz, 4.5, 9, MAT.copper), box(cx, h + 12, cz, 7.2, 3, 7.2, MAT.gold)); group.add(cross(cx, h + 30, cz)); break;
    case 'gate': group.add(box(cx, h, cz, 10, 8, 10, MAT.sand), box(cx, h + 8, cz, 6, 6, 6, MAT.sand), spire(cx, h + 14, cz, 3.5, 14, MAT.copper), box(cx, h + 3, cz, 10.4, 3, 10.4, MAT.dark)); break;
    case 'castle': for (const [x, z] of corners(b.p, cx, cz)) { const m = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, h + 7, 8), MAT.white); m.position.set(x, (h + 7) / 2, z); group.add(m, spire(x, h + 7, z, 4.4, 6, MAT.red)); } break;
    case 'twin': { const cs = corners(b.p, cx, cz); const [a, c] = cs.length >= 4 ? [cs[0], cs[3]] : [[cx + 6, cz], [cx - 6, cz]]; const ax = (a[0] + cx) / 2, az = (a[1] + cz) / 2, bx = (c[0] + cx) / 2, bz = (c[1] + cz) / 2; group.add(box(ax, h, az, 6, 8, 6, MAT.white), spire(ax, h + 8, az, 4, 12), cross(ax, h + 20, az), box(bx, h, bz, 6, 8, 6, MAT.white), spire(bx, h + 8, bz, 4, 12), cross(bx, h + 20, bz)); break; }
    case 'spire': group.add(spire(cx, h, cz, 4, Math.max(10, h * 0.7)), cross(cx, h + Math.max(10, h * 0.7), cz)); break;
  }
}
// анимация крыш внутри тайла
export function animateRoofs(group, t) { const an = group.userData.anim; if (!an) return; for (const a of an) if (a.kind === 'crystal') { a.mat.emissive.setHSL(0.56 + 0.08 * Math.sin(t * 0.4), 0.8, 0.42 + 0.08 * Math.sin(t * 1.3)); } }

// --- фасад «Футуриса»: диодные колонки, бегущие волны, буква B, логотип на торцах
function pixTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function letterB(g, W, H) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff';
  const x0 = Math.round(W * 0.2), y0 = Math.round(H * 0.18), bw = Math.round(W * 0.6), bh = Math.round(H * 0.64), t = Math.max(2, Math.round(W * 0.16));
  g.fillRect(x0, y0, t, bh);
  g.fillRect(x0, y0, Math.round(bw * 0.75), t); g.fillRect(x0, y0 + Math.round(bh / 2) - Math.round(t / 2), Math.round(bw * 0.8), t); g.fillRect(x0, y0 + bh - t, Math.round(bw * 0.9), t);
  g.fillRect(x0 + Math.round(bw * 0.75) - t, y0, t, Math.round(bh / 2)); g.fillRect(x0 + Math.round(bw * 0.9) - t, y0 + Math.round(bh / 2), t, Math.round(bh / 2));
}
function logo(g, W, H) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H); g.fillStyle = '#fff';
  const cx = W / 2, r = W * 0.3; g.beginPath(); g.arc(cx, H * 0.36, r, 0, Math.PI * 2); g.fill();
  const s = W * 0.56; g.fillRect(cx - s / 2, H * 0.5, s, s * 0.9);
}
const VERT = `varying vec2 vUv; varying vec3 vN; void main(){ vUv = uv; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `
uniform float time; uniform sampler2D tB; uniform sampler2D tLogo; uniform float cols; uniform float colsSide;
varying vec2 vUv; varying vec3 vN;
void main(){
  if (abs(vN.y) > 0.5) { gl_FragColor = vec4(0.05, 0.04, 0.08, 1.0); return; }
  bool side = abs(vN.x) > 0.5;
  float n = side ? colsSide : cols;
  float led = step(0.32, fract(vUv.x * n));
  float rows = 0.8 + 0.2 * step(0.3, fract(vUv.y * n * 2.2));
  float phase = fract(time / 16.0);
  vec3 green = vec3(0.12, 0.95, 0.30);
  float wave = 0.6 + 0.4 * sin(vUv.y * 26.0 - time * 2.5);
  float breath = 0.85 + 0.15 * sin(time * 0.8);
  float mask;
  if (side) mask = texture2D(tLogo, vUv).r;
  else mask = texture2D(tB, vec2(vUv.x, fract(vUv.y - time * 0.045))).r;
  vec3 col = mix(green * 0.45 * wave * breath, vec3(0.96, 0.98, 1.0), mask);
  float blink = 1.0 - smoothstep(0.0, 0.025, abs(phase - 0.25));
  col = mix(col, vec3(0.02, 0.02, 0.04) + vec3(0.96, 0.98, 1.0) * mask, blink * 0.95);
  gl_FragColor = vec4(col * led * rows, 1.0);
}`;

export function buildLandmarks(center) {
  const group = new THREE.Group(); const [lat0, lon0] = center; const kx = Math.cos(lat0 * Math.PI / 180) * 111320, kz = 110574;
  const mats = []; const zones = []; const items = []; const pickables = []; const spinning = []; const blink = [];
  const pick = (mesh, it) => { mesh.userData.landmark = it; pickables.push(mesh); };
  for (const lm of LANDMARKS) {
    const x = (lm.lon - lon0) * kx, z = -(lm.lat - lat0) * kz; const it = { ...lm, x, z };
    const loc = (dx, dz, rot = lm.rot || 0) => [x + dx * Math.cos(rot) + dz * Math.sin(rot), z - dx * Math.sin(rot) + dz * Math.cos(rot)];
    switch (lm.kind) {
      case 'futuris': {
        const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { time: { value: 0 }, tB: { value: pixTex(24, 52, letterB) }, tLogo: { value: pixTex(16, 52, logo) }, cols: { value: lm.w / 0.8 }, colsSide: { value: lm.d / 0.8 } } });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(lm.w, lm.h, lm.d), mat); mesh.position.set(x, lm.h / 2, z); mesh.rotation.y = lm.rot;
        const base = box(x, 0, z, lm.w + 6, 3, lm.d + 6, MAT.dark, lm.rot);
        const pts = []; for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [px, pz] = loc(sx * lm.w / 2 * 0.9, sz * lm.d / 2 * 0.9); pts.push(px, lm.h + 2, pz); }
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const beacons = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0x4df21e, size: 3, sizeAttenuation: false }));
        const w = lm.wing; const [wx, wz] = loc(w.dx, w.dz); const wing = box(wx, 0, wz, w.w, w.h, w.d, MAT.dark, lm.rot);
        group.add(mesh, base, beacons, wing); mats.push(mat); blink.push(beacons); pick(mesh, it); pick(wing, it); zones.push([x, z, lm.zone]); it.mesh = mesh; it.h = lm.h; break;
      }
      case 'tv': {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 6, lm.h, 6), MAT.steel); mast.position.set(x, lm.h / 2, z);
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.2, 60, 5), MAT.steel); ant.position.set(x, lm.h + 30, z);
        const pts = []; for (const y of [lm.h * 0.33, lm.h * 0.66, lm.h, lm.h + 58]) pts.push(x, y, z); const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const lights = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xff2a2a, size: 4, sizeAttenuation: false }));
        group.add(mast, ant, lights, box(x, 0, z, 14, 6, 14, MAT.dark)); blink.push(lights); pick(mast, it); it.h = lm.h + 60; break;
      }
      case 'obelisk': {
        const ob = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 3.2, lm.h, 4), MAT.stone); ob.position.set(x, lm.h / 2 + 2, z); ob.rotation.y = Math.PI / 4;
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(2.4, 0), MAT.gold); star.position.set(x, lm.h + 4.5, z);
        group.add(box(x, 0, z, 9, 2, 9, MAT.stone), ob, star); spinning.push({ obj: star, axis: 'y', speed: 0.6 }); pick(ob, it); it.h = lm.h + 6; break;
      }
      case 'wheel': {
        const R = 26, hub = new THREE.Group(); hub.position.set(x, R + 4, z); hub.rotation.y = 0.5;
        hub.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.7, 6, 40), MAT.steel), new THREE.Mesh(new THREE.TorusGeometry(R * 0.35, 0.5, 6, 24), MAT.steel));
        const cabins = [];
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2; const sp = new THREE.Mesh(new THREE.BoxGeometry(0.5, R * 2, 0.5), MAT.steel); sp.rotation.z = a; hub.add(sp);
          const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.8, 2.2), MAT.cabin[i % 3]); cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); hub.add(cab); cabins.push(cab);
        }
        const legA = box(x, 0, z, 1.2, R + 6, 1.2, MAT.steel, 0.5), legB = box(x, 0, z, 1.2, R + 6, 1.2, MAT.steel, 0.5); legA.rotation.z = 0.32; legB.rotation.z = -0.32; legA.position.x -= 5; legB.position.x += 5;
        const pickCyl = new THREE.Mesh(new THREE.CylinderGeometry(R + 3, R + 3, 6, 16), new THREE.MeshBasicMaterial({ visible: false })); pickCyl.rotation.x = Math.PI / 2; pickCyl.rotation.z = 0; pickCyl.position.set(x, R + 4, z); pickCyl.rotation.y = 0.5;
        group.add(hub, legA, legB, pickCyl); spinning.push({ obj: hub, axis: 'z', speed: 0.06, cabins }); pick(hub, it); pick(pickCyl, it); it.h = R * 2 + 6; break;
      }
      case 'stadium': {
        const sh = new THREE.Shape(); sh.absellipse(0, 0, 104, 72, 0, Math.PI * 2, false, 0); const hole = new THREE.Path(); hole.absellipse(0, 0, 80, 50, 0, Math.PI * 2, true, 0); sh.holes.push(hole);
        const stands = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 16, bevelEnabled: false, curveSegments: 24 }), MAT.sand); stands.rotation.x = -Math.PI / 2; stands.rotation.z = lm.rot; stands.position.set(x, 0, z);
        const roofSh = new THREE.Shape(); roofSh.absellipse(0, 0, 108, 76, 0, Math.PI * 2, false, 0); const rh = new THREE.Path(); rh.absellipse(0, 0, 86, 56, 0, Math.PI * 2, true, 0); roofSh.holes.push(rh);
        const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofSh, { depth: 2.5, bevelEnabled: false, curveSegments: 24 }), MAT.dark); roof.rotation.x = -Math.PI / 2; roof.rotation.z = lm.rot; roof.position.set(x, 17, z);
        const field = new THREE.Mesh(new THREE.CircleGeometry(1, 32), MAT.green); field.scale.set(78, 48, 1); field.rotation.x = -Math.PI / 2; field.rotation.z = lm.rot; field.position.set(x, 0.6, z);
        group.add(stands, roof, field); pick(stands, it); pick(roof, it); pick(field, it); it.h = 18; zones.push([x, z, lm.zone]); break;
      }
    }
    items.push(it);
  }
  return {
    group, zones, items, pickables,
    update(t, dt = 0.016) {
      for (const m of mats) m.uniforms.time.value = t;
      const on = Math.floor(t * 1.5) % 2 === 0; for (const b of blink) b.visible = on;
      for (const s of spinning) { s.obj.rotation[s.axis] += s.speed * dt; if (s.cabins) for (const c of s.cabins) c.rotation.z = -s.obj.rotation.z; }
    },
  };
}

// --- места для сундуков (chests.js): узнаваемые точки по всему городу, не только центр; сундук встаёт у ближайшего узла графа
export const SPOTS = [
  { id: 'lib', name: 'Национальная библиотека', lat: 53.9312, lon: 27.6461 },
  { id: 'arena', name: 'Минск-Арена', lat: 53.9367, lon: 27.4818 },
  { id: 'chizh', name: 'Чижовка-Арена', lat: 53.8535, lon: 27.6120 },
  { id: 'dana', name: 'Dana Mall', lat: 53.9340, lon: 27.6513 },
  { id: 'palace', name: 'Дворец Независимости', lat: 53.9168, lon: 27.5399 },
  { id: 'ww2', name: 'Музей истории Великой Отечественной войны', lat: 53.9165, lon: 27.5385 },
  { id: 'sport', name: 'Дворец спорта', lat: 53.9089, lon: 27.5500 },
  { id: 'opera', name: 'Большой театр оперы и балета', lat: 53.9108, lon: 27.5620 },
  { id: 'nan', name: 'Академия наук', lat: 53.9190, lon: 27.5985 },
  { id: 'kolas', name: 'Площадь Якуба Коласа', lat: 53.9153, lon: 27.5830 },
  { id: 'pekin', name: 'Отель «Пекин»', lat: 53.8997, lon: 27.5655 },
  { id: 'belarus', name: 'Гостиница «Беларусь»', lat: 53.9125, lon: 27.5537 },
  { id: 'kupala', name: 'Купаловский театр', lat: 53.9023, lon: 27.5628 },
  { id: 'galleria', name: 'Galleria Minsk', lat: 53.9080, lon: 27.5490 },
  { id: 'republic', name: 'Дворец Республики', lat: 53.9028, lon: 27.5612 },
  { id: 'ratusha', name: 'Ратуша', lat: 53.9036, lon: 27.5561 },
  { id: 'red', name: 'Красный костёл', lat: 53.8966, lon: 27.5476 },
  { id: 'gates', name: 'Ворота Минска', lat: 53.8919, lon: 27.5520 },
  { id: 'circus', name: 'Цирк', lat: 53.9040, lon: 27.5681 },
  { id: 'komarovka', name: 'Комаровский рынок', lat: 53.9198, lon: 27.5775 },
  { id: 'dinamo', name: 'Стадион «Динамо»', lat: 53.8964, lon: 27.5606 },
  { id: 'wheel', name: 'Колесо обозрения', lat: 53.9055, lon: 27.5749 },
  { id: 'victory', name: 'Монумент Победы', lat: 53.9086, lon: 27.5748 },
  { id: 'tv', name: 'Телебашня', lat: 53.9078, lon: 27.5445 },
  { id: 'futuris', name: 'Башня «Футурис»', lat: 53.9412, lon: 27.6673 },
  { id: 'castle', name: 'Пищаловский замок', lat: 53.8989, lon: 27.5481 },
  { id: 'roch', name: 'Костёл Святого Роха', lat: 53.9110, lon: 27.5802 },
  { id: 'island', name: 'Остров слёз', lat: 53.9077, lon: 27.5553 },
  { id: 'art', name: 'Художественный музей', lat: 53.8992, lon: 27.5607 },
  { id: 'loshitsa', name: 'Лошицкая усадьба', lat: 53.8528, lon: 27.5736 },
  { id: 'botsad', name: 'Ботанический сад', lat: 53.9165, lon: 27.6120 },
  { id: 'allsaints', name: 'Храм Всех Святых', lat: 53.9347, lon: 27.6107 },
  { id: 'chel', name: 'Парк Челюскинцев', lat: 53.9245, lon: 27.6120 },
  { id: 'boulders', name: 'Музей валунов', lat: 53.9290, lon: 27.6885 },
  { id: 'zoo', name: 'Минский зоопарк', lat: 53.8720, lon: 27.6060 },
];

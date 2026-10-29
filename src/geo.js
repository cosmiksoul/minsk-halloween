// Чистая геометрия без three.js: точка в полигоне, расстояние до отрезка, bbox полигона, закрыта ли точка
// (здания с дырками, вода, ленты реки и проезжих частей) и свободен ли отрезок. Гоняется тестами в node.
// Полигоны и полилинии — плоские массивы [x0, z0, x1, z1, …].

export function pointInPoly(x, z, p) {
  let inside = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// квадрат расстояния от точки до отрезка
export function segDist2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz || 1e-9; let t = ((px - ax) * dx + (pz - az) * dz) / l2; t = Math.max(0, Math.min(1, t));
  const qx = ax + dx * t, qz = az + dz * t; return (px - qx) ** 2 + (pz - qz) ** 2;
}
export function polyBBox(p) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i + 1 < p.length; i += 2) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < z0) z0 = p[i + 1]; if (p[i + 1] > z1) z1 = p[i + 1]; }
  return [x0, z0, x1, z1];
}
const inBB = (x, z, bb) => x >= bb[0] && x <= bb[2] && z >= bb[1] && z <= bb[3];
// закрыта ли точка: внутри здания (не в его дырке), внутри воды, ближе полуширины к ленте реки или проезжей части.
// obst = { buildings: [{ p, holes?, bb }], water: [{ p, bb }], ribbons: [{ p, half }] }
export function pointBlocked(x, z, obst) {
  if (!obst) return false;
  for (const b of obst.buildings || []) {
    if (b.bb && !inBB(x, z, b.bb)) continue;
    if (!pointInPoly(x, z, b.p)) continue;
    if (b.holes && b.holes.some(h => pointInPoly(x, z, h))) continue;
    return true;
  }
  for (const w of obst.water || []) { if (w.bb && !inBB(x, z, w.bb)) continue; if (pointInPoly(x, z, w.p)) return true; }
  for (const r of obst.ribbons || []) { const p = r.p, h2 = r.half * r.half; for (let i = 0; i + 3 < p.length; i += 2) if (segDist2(x, z, p[i], p[i + 1], p[i + 2], p[i + 3]) < h2) return true; }
  return false;
}
// свободен ли отрезок: точки через step метров, включая концы; isBlocked(x, z) отвечает за препятствия
export function segmentClear(ax, az, bx, bz, step, isBlocked) {
  const len = Math.hypot(bx - ax, bz - az); const n = Math.max(1, Math.ceil(len / Math.max(0.1, step)));
  for (let i = 0; i <= n; i++) { const t = len ? i / n : 0; if (isBlocked(ax + (bx - ax) * t, az + (bz - az) * t)) return false; if (!len) break; }
  return true;
}

// Заведения: бары, пабы и клубы с названием из OSM плюс площадки из афиши.
export const VENUE_TYPES = { bar: 'бар', pub: 'паб', nightclub: 'клуб', biergarten: 'пивной двор', cafe: 'кафе', restaurant: 'ресторан', event: 'площадка' };

const norm = s => (s || '').toLowerCase().replace(/[«»"'’`]/g, '').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

export function buildVenues(data, events) {
  const venues = data.pois
    .filter(p => p.n && /^(bar|pub|nightclub|biergarten)$/.test(p.t))
    .map((p, i) => ({ id: i, name: p.n, type: p.t, x: p.x, z: p.z, addr: p.a || '', hours: p.h || '', web: p.w || '', top: p.top, visits: 0, inside: 0, events: [] }));
  const [lat0, lon0] = data.center; const kx = Math.cos(lat0 * Math.PI / 180) * 111320, kz = 110574;
  for (const ev of events) {
    let v = null;
    if (ev.venue) { const n = norm(ev.venue); v = venues.find(x => norm(x.name) === n) || venues.find(x => norm(x.name).includes(n) || n.includes(norm(x.name))) || null; }
    if (!v && ev.lat && ev.lon) {
      const x = (ev.lon - lon0) * kx, z = -(ev.lat - lat0) * kz;
      let best = null, bd = 25 * 25;
      for (const w of venues) { const d = (w.x - x) ** 2 + (w.z - z) ** 2; if (d < bd) { bd = d; best = w; } }
      if (best) v = best;
      else if (Math.abs(x) < 3400 && Math.abs(z) < 2400) { v = { id: venues.length, name: ev.venue || ev.title, type: 'event', x, z, addr: ev.addr || '', hours: '', web: ev.url || '', visits: 0, inside: 0, events: [] }; venues.push(v); }
    }
    if (v) { v.events.push(ev); ev.venueId = v.id; }
  }
  return venues;
}

export function skulls(v, max) { const n = max > 0 ? 1 + Math.round(4 * v.visits / max) : 1; return '💀'.repeat(Math.max(1, Math.min(5, n))); }

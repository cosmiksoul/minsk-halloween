// Бросок d20: пиксельный кубик крутится на оверлее, число мельтешит, потом замирает.
const $ = id => document.getElementById(id);

export const OUTCOMES = {
  critfail: { label: 'КРИТИЧЕСКИЙ ПРОВАЛ', color: '#ff3a3a' },
  fail: { label: 'провал', color: '#ff8a2a' },
  success: { label: 'успех', color: '#4df21e' },
  crit: { label: 'КРИТИЧЕСКИЙ УСПЕХ', color: '#ffd23a' },
};
export function outcomeOf(n) { return n <= 1 ? 'critfail' : n <= 10 ? 'fail' : n <= 19 ? 'success' : 'crit'; }

function drawD20(ctx, n, color, angle) {
  const S = ctx.canvas.width; ctx.clearRect(0, 0, S, S);
  ctx.save(); ctx.translate(S / 2, S / 2); ctx.rotate(angle);
  const R = S * 0.42; const hex = [];
  for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; hex.push([Math.cos(a) * R, Math.sin(a) * R]); }
  ctx.fillStyle = '#1b1326'; ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, S / 24); ctx.lineJoin = 'miter';
  ctx.beginPath(); hex.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill(); ctx.stroke();
  // внутренний треугольник — грань с числом
  const r2 = R * 0.62; ctx.beginPath();
  for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 3; const x = Math.cos(a) * r2, y = Math.sin(a) * r2; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.closePath(); ctx.lineWidth = Math.max(1, S / 40); ctx.stroke();
  for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r2, Math.sin(a) * r2); ctx.lineTo(hex[i * 2][0], hex[i * 2][1]); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = color; ctx.font = `bold ${Math.round(S * 0.3)}px "Press Start 2P", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(n), S / 2, S / 2 + S * 0.06);
}

// возвращает Promise с результатом броска, когда анимация закончилась
export function hideDice() { const box = $('dice'); box.hidden = true; box.className = ''; }
export function rollDice(title, result = 1 + Math.floor(Math.random() * 20), hold = false) {
  const box = $('dice'), cv = $('diceCv'), ctx = cv.getContext('2d');
  box.hidden = false; box.className = 'rolling'; $('diceTitle').textContent = title; $('diceRes').textContent = ''; $('diceNum').textContent = ''; $('diceSave').hidden = true;
  const kind = outcomeOf(result), out = OUTCOMES[kind];
  return new Promise(resolve => {
    const t0 = performance.now(); const dur = 1400; let last = 0;
    const tick = now => {
      const t = now - t0;
      if (t < dur) {
        if (now - last > 50 + (t / dur) * 90) { last = now; drawD20(ctx, 1 + Math.floor(Math.random() * 20), '#e9dff7', (t / 1000) * 9 + Math.random() * 0.5); }
        requestAnimationFrame(tick);
      } else {
        drawD20(ctx, result, out.color, 0);
        box.className = 'done ' + kind; $('diceRes').textContent = out.label; $('diceRes').style.color = out.color; $('diceNum').textContent = `выпало ${result}`;
        setTimeout(() => { resolve({ n: result, kind }); }, 700);
        if (!hold) setTimeout(() => { if (box.className.startsWith('done')) box.hidden = true; }, 2600);
      }
    };
    requestAnimationFrame(tick);
  });
}

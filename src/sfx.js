// Звук: чиптюн-эффекты и фоновый эмбиент синтезом WebAudio, без файлов. Один AudioContext, создаётся и resume() на первом
// pointerdown/keydown (политика автовоспроизведения). Мастер 0,25. Флаг minsk-skeletons.mute = '1' выключает всё
// и переживает перезагрузку. Если AudioContext недоступен, play молча ничего не делает. Шагов нет.
const KEY = 'minsk-skeletons.mute'; const KEY_AMB = 'minsk-skeletons.ambient'; // '0' — фоновый звук выключен (по умолчанию включён)
let ctx = null, master = null, noiseBuf = null;
function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.25; master.connect(ctx.destination); } catch { ctx = null; }
  return ctx;
}
function unlock() { const c = ensure(); if (!c) return; if (c.state === 'suspended') c.resume().then(ambientStart).catch(() => {}); else ambientStart(); }
addEventListener('pointerdown', unlock, { passive: true }); addEventListener('keydown', unlock);

// осциллятор с огибающей: f0 → f1 за dur секунд
function tone(type, f0, f1, t0, dur, vol = 0.5) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t0); if (f1 != null && f1 !== f0) o.frequency.linearRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.setValueAtTime(vol, t0 + Math.max(0.005, dur - 0.02)); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.03);
}
// шум из буфера, при lowpass — через фильтр
function noise(t0, dur, vol = 0.5, lowpass = null) {
  if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  if (lowpass) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; s.connect(f); f.connect(g); } else s.connect(g);
  g.connect(master); s.start(t0); s.stop(t0 + dur + 0.02);
}
const SOUNDS = {
  click: t => tone('square', 440, 440, t, 0.02, 0.35),                                        // любая кнопка
  dice: t => { for (let i = 0; i < 3; i++) noise(t + i * 0.1, 0.04, 0.5); },                  // три всплеска по 40 мс с паузой 60 мс
  pick: t => tone('square', 880, 1320, t, 0.08, 0.4),                                          // конфета
  coin: t => { tone('sine', 1568, 1568, t, 0.06, 0.6); tone('sine', 2093, 2093, t + 0.06, 0.08, 0.6); }, // монета, покупка
  bite: t => tone('sawtooth', 220, 80, t, 0.2, 0.5),                                           // укус, проигрыш
  win: t => { [523.25, 659.25, 783.99].forEach((f, i) => tone('square', f, f, t + i * 0.12, 0.12, 0.35)); }, // C5 E5 G5
  token: t => { SOUNDS.win(t); tone('square', 1046.5, 1046.5, t + 0.36, 0.15, 0.35); },        // win плюс C6
  hour: t => { tone('triangle', 196, 196, t, 0.3, 0.6); tone('triangle', 147, 147, t + 0.3, 0.3, 0.6); }, // смена часа
  boo: t => noise(t, 0.12, 0.6, 500),                                                           // отказ, «не дойти»
};
// --- фоновый эмбиент: ветер (шум через lowpass, медленный LFO), низкий гул и редкие события — сова, далёкий колокол, ворона, вой.
// Синтез, без файлов; стартует после первого жеста, уважает mute и флаг KEY_AMB; громкость ниже эффектов.
let amb = null;
function ambientAllowed() { try { return localStorage.getItem(KEY) !== '1' && localStorage.getItem(KEY_AMB) !== '0'; } catch { return true; } }
function ambientStart() {
  if (amb || !ctx || ctx.state !== 'running' || !ambientAllowed()) return;
  const c = ctx, t = c.currentTime; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.55, t + 4); g.connect(master);
  if (!noiseBuf) noise(t, 0.001, 0.0001); // создаёт буфер шума
  const wind = c.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.7;
  const wg = c.createGain(); wg.gain.value = 0.22; wind.connect(lp); lp.connect(wg); wg.connect(g);
  const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.06; const lfoF = c.createGain(); lfoF.gain.value = 260; lfo.connect(lfoF); lfoF.connect(lp.frequency);
  const lfoG = c.createGain(); lfoG.gain.value = 0.09; lfo.connect(lfoG); lfoG.connect(wg.gain);
  const drone = [55, 55.4, 82.4].map((f, i) => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const og = c.createGain(); og.gain.value = i < 2 ? 0.05 : 0.03; o.connect(og); og.connect(g); o.start(t); return o; });
  wind.start(t); lfo.start(t);
  amb = { g, nodes: [wind, lfo, ...drone], timer: 0 };
  const schedule = () => { amb.timer = setTimeout(() => { if (!amb) return; try { ambientEvent(c.currentTime + 0.05, g); } catch { /* тишина лучше ошибки */ } schedule(); }, 9000 + Math.random() * 14000); };
  schedule();
}
function ambientStop() {
  if (!amb) return; const a = amb; amb = null; clearTimeout(a.timer); const t = ctx.currentTime;
  a.g.gain.cancelScheduledValues(t); a.g.gain.setValueAtTime(a.g.gain.value, t); a.g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
  setTimeout(() => { for (const n of a.nodes) { try { n.stop(); } catch { /* уже остановлен */ } } a.g.disconnect(); }, 1400);
}
function ambientEvent(t, out) {
  const c = ctx; const r = Math.random();
  const env = (node, t0, dur, vol, attack = 0.02) => { const e = c.createGain(); e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(vol, t0 + attack); e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); node.connect(e); e.connect(out); return e; };
  if (r < 0.4) { // сова: два «у-ху» синусом 520→430 Гц
    for (let i = 0; i < 2; i++) { const o = c.createOscillator(); o.type = 'sine'; const t0 = t + i * 0.42; o.frequency.setValueAtTime(520, t0); o.frequency.exponentialRampToValueAtTime(430, t0 + 0.3); env(o, t0, 0.34, 0.16, 0.05); o.start(t0); o.stop(t0 + 0.4); }
  } else if (r < 0.65) { // далёкий колокол: треугольник 196 Гц с обертоном, долгий спад
    for (const [f, v] of [[196, 0.14], [392, 0.05], [587, 0.025]]) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f; env(o, t, 3.2, v, 0.01); o.start(t); o.stop(t + 3.3); }
  } else if (r < 0.85) { // ворона: два хриплых всплеска шума через bandpass
    for (let i = 0; i < 2; i++) { const s = c.createBufferSource(); s.buffer = noiseBuf; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100 + i * 150; bp.Q.value = 4; s.connect(bp); const t0 = t + i * 0.22; env(bp, t0, 0.16, 0.2, 0.01); s.start(t0); s.stop(t0 + 0.2); }
  } else { // вой: синус 280→470→250 Гц за 1,8 с
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(280, t); o.frequency.exponentialRampToValueAtTime(470, t + 0.7); o.frequency.exponentialRampToValueAtTime(250, t + 1.8); env(o, t, 1.9, 0.07, 0.3); o.start(t); o.stop(t + 2);
  }
}
export const Sfx = {
  get ambientOn() { try { return localStorage.getItem(KEY_AMB) !== '0'; } catch { return true; } },
  ambient(on) { try { if (on) localStorage.removeItem(KEY_AMB); else localStorage.setItem(KEY_AMB, '0'); } catch { /* приватный режим */ } if (on) { ensure(); ambientStart(); } else ambientStop(); },
  get muted() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } },
  mute(on) { try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* приватный режим */ } if (on) ambientStop(); else { ensure(); ambientStart(); } },
  play(name) {
    const f = SOUNDS[name]; if (!f || this.muted) return;
    const c = ensure(); if (!c) return; if (c.state === 'suspended') c.resume().catch(() => {});
    try { f(c.currentTime + 0.001); } catch { /* звук не должен ронять игру */ }
  },
};
// щелчок на любой кнопке страницы (делегирование на захвате, чтобы сработало и для кнопок, которые перерисуются)
addEventListener('click', e => { if (e.target && e.target.closest && e.target.closest('button')) Sfx.play('click'); }, true);

// Звук: чиптюн-эффекты синтезом WebAudio, без файлов. Один AudioContext, создаётся и resume() на первом
// pointerdown/keydown (политика автовоспроизведения). Мастер 0,25. Флаг minsk-skeletons.mute = '1' выключает всё
// и переживает перезагрузку. Если AudioContext недоступен, play молча ничего не делает. Шагов нет.
const KEY = 'minsk-skeletons.mute';
let ctx = null, master = null, noiseBuf = null;
function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try { ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.25; master.connect(ctx.destination); } catch { ctx = null; }
  return ctx;
}
function unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume().catch(() => {}); }
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
export const Sfx = {
  get muted() { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } },
  mute(on) { try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* приватный режим */ } },
  play(name) {
    const f = SOUNDS[name]; if (!f || this.muted) return;
    const c = ensure(); if (!c) return; if (c.state === 'suspended') c.resume().catch(() => {});
    try { f(c.currentTime + 0.001); } catch { /* звук не должен ронять игру */ }
  },
};
// щелчок на любой кнопке страницы (делегирование на захвате, чтобы сработало и для кнопок, которые перерисуются)
addEventListener('click', e => { if (e.target && e.target.closest && e.target.closest('button')) Sfx.play('click'); }, true);

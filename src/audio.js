// Efeitos sonoros chiptune com WebAudio (sem arquivos)
let ctx = null;

export function initAudio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function tone(freq, dur, { type = 'square', vol = 0.05, slide = 0, delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.linearRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  plant: () => {
    tone(220, 0.08, { type: 'triangle', vol: 0.12 });
    tone(330, 0.1, { type: 'triangle', vol: 0.1, delay: 0.07 });
  },
  water: () => tone(900, 0.3, { type: 'sine', slide: -500, vol: 0.07 }),
  harvest: () => [523, 659, 784].forEach((f, i) => tone(f, 0.1, { delay: i * 0.06, vol: 0.04 })),
  brew: () => tone(160, 0.5, { type: 'sawtooth', vol: 0.025, slide: 90 }),
  ready: () => {
    tone(880, 0.12, { type: 'triangle', vol: 0.1 });
    tone(1320, 0.2, { type: 'triangle', vol: 0.08, delay: 0.1 });
  },
  pick: () => tone(600, 0.06, { vol: 0.04 }),
  serve: () => [988, 1319, 1568].forEach((f, i) => tone(f, 0.1, { delay: i * 0.07, vol: 0.04 })),
  angry: () => tone(150, 0.4, { type: 'sawtooth', vol: 0.05, slide: -60 }),
  star: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, { delay: i * 0.1, vol: 0.05 })),
  deny: () => tone(110, 0.12, { vol: 0.04 }),
  join: () => tone(700, 0.05, { type: 'triangle', vol: 0.05 }),
};

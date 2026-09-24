// Toasts, full-screen celebrations, confetti and 8-bit style sound effects.
import { useEffect, useReducer } from './lib.js';

const fx = { toasts: [], overlay: null };
const listeners = new Set();
const emitFx = () => listeners.forEach((fn) => fn());

export function useFx() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    return () => listeners.delete(force);
  }, []);
  return fx;
}

let toastId = 0;
export function toast(text, kind = 'info', ms = 3400) {
  const id = ++toastId;
  fx.toasts = [...fx.toasts.slice(-2), { id, text, kind }];
  emitFx();
  setTimeout(() => {
    fx.toasts = fx.toasts.filter((t) => t.id !== id);
    emitFx();
  }, ms);
}

export function closeOverlay() {
  fx.overlay = null;
  emitFx();
}

// kind: 'passed' | 'wasted'
export function celebrate(kind, { title, sub, money = false, ms = 2800 } = {}) {
  const id = Date.now();
  fx.overlay = { id, kind, title, sub };
  emitFx();
  if (kind === 'passed') {
    sound.play('passed');
    confetti({ money });
  } else if (kind === 'wasted') {
    sound.play('wasted');
  }
  setTimeout(() => {
    if (fx.overlay?.id === id) closeOverlay();
  }, ms);
}

/* ------------------------------------------------------------------ */
/* Sound                                                               */
/* ------------------------------------------------------------------ */

function readLS(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLS(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

let audio = null;
function ctx() {
  if (!audio) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    audio = new C();
  }
  if (audio.state === 'suspended') audio.resume();
  return audio;
}

function tone(a, { freq, start = 0, dur = 0.15, type = 'square', vol = 0.07, slide }) {
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noise(a, { start = 0, dur = 0.05, vol = 0.12 }) {
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  const g = a.createGain();
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 220;
  src.buffer = buf;
  g.gain.value = vol;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(a.currentTime + start);
}

const SOUNDS = {
  passed(a) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(a, { freq: f, start: i * 0.1, dur: 0.16 }));
    tone(a, { freq: 1046.5, start: 0.42, dur: 0.6, type: 'triangle', vol: 0.09 });
    tone(a, { freq: 1318.5, start: 0.42, dur: 0.6, type: 'triangle', vol: 0.06 });
  },
  wasted(a) {
    tone(a, { freq: 196, dur: 1.4, type: 'sawtooth', vol: 0.06, slide: 49 });
    tone(a, { freq: 98, dur: 1.4, type: 'square', vol: 0.03, slide: 40 });
  },
  tick(a) {
    tone(a, { freq: 880, dur: 0.05, vol: 0.035 });
  },
  pop(a) {
    tone(a, { freq: 392, dur: 0.1, type: 'triangle', vol: 0.08 });
    tone(a, { freq: 784, start: 0.07, dur: 0.14, type: 'triangle', vol: 0.07 });
  },
  cash(a) {
    [1318.5, 1568, 2093].forEach((f, i) => tone(a, { freq: f, start: i * 0.06, dur: 0.12, type: 'triangle', vol: 0.05 }));
  },
  drum(a) {
    for (let i = 0; i < 28; i++) noise(a, { start: i * 0.07, dur: 0.06, vol: 0.05 + i * 0.006 });
    noise(a, { start: 2.0, dur: 0.4, vol: 0.35 });
  },
};

export const sound = {
  get muted() {
    return readLS('cdwm.muted') === '1';
  },
  set muted(v) {
    writeLS('cdwm.muted', v ? '1' : '0');
    emitFx();
  },
  play(name) {
    if (this.muted) return;
    // Browsers block audio until the viewer has tapped or clicked the page.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try {
      const a = ctx();
      if (a && SOUNDS[name]) SOUNDS[name](a);
    } catch {}
  },
};

/* ------------------------------------------------------------------ */
/* Confetti (and money rain)                                           */
/* ------------------------------------------------------------------ */

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function confetti({ duration = 4200, money = false, count = 170 } = {}) {
  if (reduceMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'fx';
  document.body.appendChild(canvas);
  const g = canvas.getContext('2d');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let W = 0;
  let H = 0;
  const size = () => {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  window.addEventListener('resize', size);
  const colors = ['#ffe066', '#ffb02e', '#ff6a1a', '#e8361d', '#27b5c4', '#a066f0', '#46b04f', '#ffffff'];
  const parts = Array.from({ length: count }, (_, i) => ({
    x: Math.random() * W,
    y: -30 - Math.random() * H * 0.7,
    vx: (Math.random() - 0.5) * 3,
    vy: 2.2 + Math.random() * 3.6,
    r: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.24,
    w: 7 + Math.random() * 7,
    h: 4 + Math.random() * 6,
    c: colors[i % colors.length],
    bill: money && i % 4 === 0,
    sway: Math.random() * Math.PI * 2,
  }));
  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    g.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.sway += 0.05;
      p.x += p.vx + Math.sin(p.sway) * 0.8;
      p.y += p.vy;
      p.r += p.vr;
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.r);
      g.globalAlpha = t > duration - 800 ? Math.max(0, (duration - t) / 800) : 1;
      if (p.bill) {
        g.fillStyle = '#86e08f';
        g.strokeStyle = '#1d5e2c';
        g.lineWidth = 1.5;
        g.fillRect(-14, -7, 28, 14);
        g.strokeRect(-14, -7, 28, 14);
        g.fillStyle = '#1d5e2c';
        g.font = 'bold 10px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('$', 0, 1);
      } else {
        g.fillStyle = p.c;
        g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      g.restore();
    }
    if (t < duration) requestAnimationFrame(frame);
    else {
      window.removeEventListener('resize', size);
      canvas.remove();
    }
  };
  requestAnimationFrame(frame);
}

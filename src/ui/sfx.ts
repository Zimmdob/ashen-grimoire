// Tiny synthesized sound effects in the spirit of Bfxr. No audio files needed.
let ctx: AudioContext | null = null;
let muted = false;
export const setMuted = (m: boolean) => { muted = m; };
export const isMuted = () => muted;
let vol = 1;
/** Sound-effects volume, 0..1 (music has its own). */
export const setSfxVolume = (v: number) => { vol = Math.max(0, Math.min(1, v)); globalThis.__agSfx = vol; };
declare global { var __agSfx: number }
globalThis.__agSfx ??= 1;
void vol;

/** The shared audio context (null while muted). */
export function audioCtx(): AudioContext | null { return ac(); }

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
  g.gain.setValueAtTime(Math.max(0.0002, vol * globalThis.__agSfx), a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  o.connect(g).connect(a.destination);
  o.start();
  o.stop(a.currentTime + dur);
}

function noise(dur: number, vol: number, hp = 400) {
  const a = ac();
  if (!a) return;
  const b = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol * globalThis.__agSfx;
  s.connect(f).connect(g).connect(a.destination);
  s.start();
}

let last = 0;
export function play(s: string) {
  const now = performance.now();
  if (!(s.startsWith('spell_') || s.startsWith('die_') || ['levelup', 'overdrive', 'heartbeat', 'phase', 'rescue', 'evolve', 'combo', 'bossintro', 'wipe'].includes(s))) {
    if (now - last < 35) return;
    last = now;
  }
  switch (s) {
    case 'cast': tone(520, 0.18, 'square', 0.04, 400); break;
    case 'hit': noise(0.08, 0.12, 1200); tone(140, 0.08, 'square', 0.05, -60); break;
    case 'boom': noise(0.35, 0.22, 120); tone(90, 0.3, 'sawtooth', 0.06, -50); break;
    case 'freeze': tone(1400, 0.25, 'triangle', 0.04, -600); break;
    case 'heal': tone(440, 0.2, 'triangle', 0.05, 300); break;
    case 'shoot': noise(0.05, 0.08, 2500); break;
    case 'die': tone(220, 0.35, 'sawtooth', 0.05, -160); break;
    case 'portal': tone(180, 0.6, 'sine', 0.07, 500); break;
    case 'click': tone(900, 0.04, 'square', 0.025); break;
    case 'zap': noise(0.12, 0.1, 4000); tone(1800, 0.1, 'sawtooth', 0.03, -1400); break;
    default: if (!playRich(s)) break;
  }
}

/** A filtered noise burst: whooshes, crackles, swishes. */
function swish(dur: number, vol: number, from: number, to: number, type: BiquadFilterType = 'bandpass') {
  const a = ac();
  if (!a) return;
  const b = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / d.length) * Math.PI);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = b; f.type = type; f.Q.value = 2.5;
  f.frequency.setValueAtTime(from, a.currentTime); f.frequency.exponentialRampToValueAtTime(Math.max(40, to), a.currentTime + dur);
  g.gain.value = vol * globalThis.__agSfx;
  s.connect(f).connect(g).connect(a.destination); s.start();
}
const arp = (notes: number[], step: number, dur: number, type: OscillatorType, vol: number) => notes.forEach((n, i) => setTimeout(() => tone(n, dur, type, vol), i * step));
const lastRich: Record<string, number> = {};

/** Layered sounds: a voice for every spell family, creature family and moment. */
function playRich(s: string): boolean {
  const now = performance.now();
  const gap = s.startsWith('spell_') ? 55 : s.startsWith('die_') ? 45 : 0;
  if (gap && now - (lastRich[s] ?? 0) < gap) return true;
  lastRich[s] = now;
  switch (s) {
    // spells, by their base card
    case 'spell_ember': swish(0.12, 0.09, 2400, 600); tone(320, 0.06, 'triangle', 0.02, -120); break;
    case 'spell_frost': tone(1900, 0.09, 'triangle', 0.025, 500); tone(2850, 0.06, 'sine', 0.015); break;
    case 'spell_thorn': swish(0.1, 0.07, 900, 300, 'lowpass'); tone(200, 0.08, 'square', 0.02, -80); break;
    case 'spell_spark': noise(0.04, 0.06, 5000); tone(2400, 0.05, 'square', 0.015, -1600); break;
    case 'spell_bone': tone(110, 0.14, 'triangle', 0.06, -50); noise(0.06, 0.06, 800); break;
    case 'spell_void': tone(70, 0.3, 'sine', 0.07, 30); tone(140, 0.25, 'sawtooth', 0.015, -60); break;
    case 'spell_arc': noise(0.09, 0.12, 3000); tone(900, 0.08, 'sawtooth', 0.03, 1800); break;
    case 'spell_meteor': swish(0.35, 0.1, 3000, 200); break;
    case 'spell_wisp': arp([880, 1320], 40, 0.12, 'sine', 0.025); break;
    case 'spell_scythe': swish(0.18, 0.1, 600, 2400); break;
    case 'spell_leech': tone(260, 0.12, 'sine', 0.04, -140); swish(0.08, 0.04, 400, 200, 'lowpass'); break;
    // foes falling, by family
    case 'die_beast': tone(180, 0.22, 'sawtooth', 0.04, -120); noise(0.1, 0.06, 600); break;
    case 'die_undead': noise(0.18, 0.08, 1800); tone(330, 0.16, 'square', 0.02, -260); break;
    case 'die_construct': tone(520, 0.08, 'square', 0.03); setTimeout(() => tone(390, 0.1, 'square', 0.03), 60); noise(0.12, 0.07, 2500); break;
    case 'die_spirit': tone(1200, 0.4, 'sine', 0.03, -900); break;
    case 'die_plant': swish(0.2, 0.08, 500, 150, 'lowpass'); break;
    case 'die_fire': swish(0.25, 0.09, 1500, 200); tone(140, 0.2, 'triangle', 0.03, -60); break;
    // moments
    case 'levelup': arp([523, 659, 784, 1046], 70, 0.25, 'triangle', 0.05); break;
    case 'overdrive': swish(0.7, 0.12, 200, 5000); arp([196, 294, 392, 587], 90, 0.5, 'sawtooth', 0.025); break;
    case 'heartbeat': tone(60, 0.12, 'sine', 0.12, -10); setTimeout(() => tone(55, 0.1, 'sine', 0.09, -10), 160); break;
    case 'phase': tone(55, 0.9, 'sawtooth', 0.06, -15); arp([220, 277, 330], 0, 1.1, 'triangle', 0.03); noise(0.5, 0.15, 90); break;
    case 'rescue': arp([392, 494, 587, 784], 110, 0.7, 'sine', 0.045); break;
    case 'evolve': arp([784, 988, 1175, 1568, 1976], 55, 0.3, 'sine', 0.04); swish(0.5, 0.05, 1000, 6000, 'highpass'); break;
    case 'combo': tone(880, 0.08, 'square', 0.025, 440); break;
    case 'bossintro': tone(41, 1.6, 'sawtooth', 0.07, 0); noise(1.2, 0.08, 60); arp([110, 104], 600, 1.2, 'triangle', 0.04); break;
    case 'wipe': swish(0.45, 0.06, 300, 1800); break;
    case 'step': noise(0.03, 0.02, 1500); break;
    default: return false;
  }
  return true;
}

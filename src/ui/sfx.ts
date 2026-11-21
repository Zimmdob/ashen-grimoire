// Tiny synthesized sound effects in the spirit of Bfxr. No audio files needed.
let ctx: AudioContext | null = null;
let muted = false;
export const setMuted = (m: boolean) => { muted = m; };
export const isMuted = () => muted;

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
  g.gain.setValueAtTime(vol, a.currentTime);
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
  s.buffer = b; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination);
  s.start();
}

let last = 0;
export function play(s: string) {
  const now = performance.now();
  if (now - last < 35) return;
  last = now;
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
  }
}

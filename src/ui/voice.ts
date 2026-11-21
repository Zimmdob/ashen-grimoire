// Character voices, Animal Crossing style: while a line types out letter by letter, short snippets
// ("grains") of a recorded voice play underneath, nudged up and down in pitch. It sounds like the
// person without being words. Sydney's grains are cut from her own recordings (public/voice/).

import { audioCtx } from './sfx';

interface Voice { url: string; meta: string; buf?: AudioBuffer; grains: [number, number][]; loading?: Promise<void> }
const VOICES: Record<string, Voice> = {
  sydney: { url: './voice/sydney.wav', meta: './voice/sydney.json', grains: [] },
};

function load(v: Voice, a: AudioContext): Promise<void> {
  v.loading ??= (async () => {
    const [wav, meta] = await Promise.all([fetch(v.url).then((r) => r.arrayBuffer()), fetch(v.meta).then((r) => r.json())]);
    v.grains = meta.grains;
    v.buf = await a.decodeAudioData(wav);
  })().catch(() => { v.loading = undefined; });
  return v.loading;
}

let busyUntil = 0;
/** One syllable of babble. Returns false if it is too soon after the last one. */
function blip(v: Voice, a: AudioContext, pitch: number): boolean {
  if (!v.buf || !v.grains.length || a.currentTime < busyUntil) return false;
  const [off, dur] = v.grains[Math.floor(Math.random() * v.grains.length)];
  const rate = pitch * (0.94 + Math.random() * 0.16);
  const src = a.createBufferSource();
  const g = a.createGain();
  src.buffer = v.buf;
  src.playbackRate.value = rate;
  const t = a.currentTime, len = Math.min(dur, 0.2) / rate;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.9, t + 0.012);
  g.gain.setValueAtTime(0.9, t + len * 0.7);
  g.gain.linearRampToValueAtTime(0, t + len);
  src.connect(g).connect(a.destination);
  src.start(t, off, Math.min(dur, 0.2));
  busyUntil = t + len * 0.85;
  return true;
}

const spoken = new Set<string>();
let current: { stop: () => void } | null = null;

/**
 * Type `text` into `el` with the speaker's voice babbling along. `key` identifies the line: a line
 * already spoken (the screen redrew, say) appears at once and silently. Clicking the text finishes it.
 */
export function speak(el: HTMLElement, text: string, who = 'sydney', key = text) {
  el.setAttribute('aria-label', text);
  if (spoken.has(key)) { el.textContent = text; return; }
  spoken.add(key);
  current?.stop();
  const v = VOICES[who];
  const a = audioCtx();
  if (a && v) void load(v, a);
  let i = 0, timer = 0, done = false;
  const finish = () => { if (done) return; done = true; clearTimeout(timer); el.textContent = text; el.classList.remove('typing'); };
  el.textContent = '';
  el.classList.add('typing');
  el.addEventListener('click', finish, { once: true });
  current = { stop: finish };
  // Narration (outside quotation marks) races past silently; spoken words (inside "…") type at
  // talking speed with the voice babbling along. A line with no quotes is all speech.
  const hasQuotes = text.includes('"');
  let inQuote = !hasQuotes;
  // Clock-driven, so a slow device reveals several letters per tick instead of falling behind.
  let due = performance.now();
  const step = () => {
    if (done || !el.isConnected) { done = true; return; }
    const now = performance.now();
    let speakNow = false, upper = false;
    while (i < text.length && now >= due) {
      const ch = text[i++];
      if (ch === '"' && hasQuotes) inQuote = !inQuote;
      if (inQuote && /[a-z0-9]/i.test(ch) && i % 2 === 0) { speakNow = true; upper = /[A-Z]/.test(ch); }
      due += !inQuote ? 6 : /[.!?]/.test(ch) ? 220 : /[,;:]/.test(ch) ? 110 : ch === ' ' ? 14 : 24;
    }
    el.textContent = text.slice(0, i);
    if (speakNow && a && v) blip(v, a, upper ? 1.08 : 1);
    if (i >= text.length) { finish(); return; }
    timer = window.setTimeout(step, 16);
  };
  step();
}

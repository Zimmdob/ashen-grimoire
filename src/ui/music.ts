// Procedural dungeon-synth score, generated live with WebAudio. Original composition; no audio files.
// Layers: drone, choir pad, plucked lute arpeggio, distant bell, and war drums that rise with danger.
// A look-ahead scheduler queues notes slightly in the future so timing stays steady.

type Mood = { root: number; scale: number[]; prog: number[]; bpm: number; name: string };

// Scales as semitone offsets; progressions as scale degrees (0-based).
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];

const MOODS: Mood[] = [
  { name: 'cellar', root: 50, scale: AEOLIAN, prog: [0, 5, 6, 4], bpm: 66 },   // D minor: i VI VII v
  { name: 'crypt', root: 52, scale: PHRYGIAN, prog: [0, 1, 0, 6], bpm: 62 },   // E phrygian: i bII i vii
  { name: 'nave', root: 48, scale: AEOLIAN, prog: [0, 3, 5, 4], bpm: 70 },     // C minor: i iv VI v
  { name: 'throne', root: 45, scale: HARMONIC, prog: [0, 5, 3, 4], bpm: 84 },  // A harmonic minor, for the king
];

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Score {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private verb!: ConvolverNode;
  private verbSend!: GainNode;
  private drumBus!: GainNode;
  private droneNodes: { osc: OscillatorNode[]; gain: GainNode; filt: BiquadFilterNode } | null = null;
  private timer = 0;
  private nextTime = 0;
  private step = 0;
  private mood: Mood = MOODS[0];
  private pendingMood: Mood | null = null;
  private intensity = 0;
  private targetIntensity = 0;
  private volume = 0.5;
  private enabled = true;
  private seed = 1;

  constructor() {
    try {
      this.volume = Number(localStorage.getItem('ashen-music-vol') ?? '0.5');
      this.enabled = localStorage.getItem('ashen-music') !== 'off';
    } catch { /* storage unavailable */ }
  }

  private rnd() { this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x7fffffff; }

  /** Must be called from a user gesture (browsers block audio until then). */
  start() {
    if (!this.enabled) return;
    if (this.ctx) { void this.ctx.resume(); return; }
    try { this.ctx = new AudioContext(); } catch { return; }
    const a = this.ctx;
    this.master = a.createGain();
    this.master.gain.value = 0;
    this.master.connect(a.destination);
    this.master.gain.linearRampToValueAtTime(this.volume * 0.55, a.currentTime + 4);
    // Cavern reverb from a generated decaying-noise impulse.
    this.verb = a.createConvolver();
    const len = a.sampleRate * 3.5;
    const ir = a.createBuffer(2, len, a.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.verb.buffer = ir;
    this.verbSend = a.createGain();
    this.verbSend.gain.value = 0.55;
    this.verbSend.connect(this.verb).connect(this.master);
    this.drumBus = a.createGain();
    this.drumBus.gain.value = 0;
    this.drumBus.connect(this.master);
    this.startDrone();
    this.nextTime = a.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  private out(g: AudioNode, wet = 0.5) {
    const dry = this.ctx!.createGain();
    dry.gain.value = 1 - wet * 0.5;
    g.connect(dry).connect(this.master);
    const send = this.ctx!.createGain();
    send.gain.value = wet;
    g.connect(send).connect(this.verbSend);
  }

  private startDrone() {
    const a = this.ctx!;
    if (this.droneNodes) {
      const old = this.droneNodes;
      old.gain.gain.setTargetAtTime(0, a.currentTime, 1.5);
      setTimeout(() => old.osc.forEach((o) => o.stop()), 6000);
    }
    const filt = a.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 260;
    filt.Q.value = 2;
    const gain = a.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.16, a.currentTime, 2);
    const osc = [-12, -12.07, -5].map((semi) => {
      const o = a.createOscillator();
      o.type = semi === -5 ? 'triangle' : 'sawtooth';
      o.frequency.value = midi(this.mood.root + semi);
      o.connect(filt);
      o.start();
      return o;
    });
    // slow breathing on the filter
    const lfo = a.createOscillator(), lfoAmt = a.createGain();
    lfo.frequency.value = 0.05;
    lfoAmt.gain.value = 90;
    lfo.connect(lfoAmt).connect(filt.frequency);
    lfo.start();
    osc.push(lfo);
    filt.connect(gain);
    this.out(gain, 0.4);
    this.droneNodes = { osc, gain, filt };
  }

  private note(m: number) { return this.mood.root + m; }
  private degree(d: number, oct = 0) {
    const s = this.mood.scale;
    const i = ((d % 7) + 7) % 7;
    return s[i] + 12 * (oct + Math.floor(d / 7));
  }

  private pad(t: number, chordDeg: number, dur: number) {
    const a = this.ctx!;
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0, t + dur * 1.05);
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    f.connect(g);
    for (const iv of [0, 2, 4]) {
      for (const det of [-6, 6]) {
        const o = a.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(this.note(this.degree(chordDeg + iv)));
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur * 1.1);
      }
    }
    this.out(g, 0.8);
  }

  private pluck(t: number, m: number, vel: number) {
    const a = this.ctx!;
    const o = a.createOscillator(), o2 = a.createOscillator();
    o.type = 'square';
    o2.type = 'triangle';
    o.frequency.value = o2.frequency.value = midi(m);
    o2.detune.value = 7;
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, t);
    f.frequency.exponentialRampToValueAtTime(380, t + 0.35);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(f); o2.connect(f); f.connect(g);
    this.out(g, 0.55);
    o.start(t); o2.start(t); o.stop(t + 1.2); o2.stop(t + 1.2);
  }

  private bell(t: number, m: number) {
    const a = this.ctx!;
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4);
    for (const [ratio, amp] of [[1, 1], [2.76, 0.4], [5.4, 0.2]]) {
      const o = a.createOscillator(), og = a.createGain();
      o.type = 'sine';
      o.frequency.value = midi(m) * ratio;
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 4.1);
    }
    this.out(g, 0.9);
  }

  private drum(t: number, low: boolean, vel: number) {
    const a = this.ctx!;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(low ? 95 : 150, t);
    o.frequency.exponentialRampToValueAtTime(low ? 42 : 70, t + 0.25);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(this.drumBus);
    o.start(t);
    o.stop(t + 0.5);
    // skin noise
    const n = a.createBufferSource();
    const b = a.createBuffer(1, a.sampleRate * 0.08, a.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    n.buffer = b;
    const ng = a.createGain();
    ng.gain.value = 0.12 * vel;
    const nf = a.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = low ? 400 : 900;
    n.connect(nf).connect(ng).connect(this.drumBus);
    n.start(t);
  }

  private schedule() {
    const a = this.ctx;
    if (!a) return;
    // ease danger in and out
    this.intensity += (this.targetIntensity - this.intensity) * 0.05;
    this.drumBus.gain.setTargetAtTime(this.intensity * 0.9, a.currentTime, 0.4);
    const eighth = 60 / this.mood.bpm / 2;
    while (this.nextTime < a.currentTime + 0.25) {
      const t = this.nextTime;
      const s = this.step;
      const barStep = s % 8;          // 8 eighths per bar
      const bar = Math.floor(s / 8);
      const chordDeg = this.mood.prog[Math.floor(bar / 2) % this.mood.prog.length];
      // change key/mood only on a phrase boundary
      if (s % 64 === 0 && this.pendingMood) {
        this.mood = this.pendingMood;
        this.pendingMood = null;
        this.startDrone();
      }
      if (s % 16 === 0) this.pad(t, chordDeg, eighth * 16);
      // lute: a broken chord with occasional passing tones, sparser when calm
      const pattern = [0, 2, 4, 7, 4, 2, 4, 2];
      const play = barStep % 2 === 0 || this.rnd() < 0.35 + this.intensity * 0.4;
      if (play) {
        let deg = chordDeg + pattern[barStep];
        if (this.rnd() < 0.12) deg += 1;
        this.pluck(t, this.note(this.degree(deg, 1)), barStep === 0 ? 1 : 0.65 + this.rnd() * 0.25);
      }
      if (s % 32 === 0 && this.rnd() < 0.7) this.bell(t + eighth * 0.5, this.note(this.degree(chordDeg + 4, 2)));
      // war drums: heartbeat when calm-ish, a march when foes can reach you
      if (this.intensity > 0.05) {
        if (barStep === 0 || barStep === 4) this.drum(t, true, 1);
        if (this.intensity > 0.5 && (barStep === 3 || barStep === 7)) this.drum(t, false, 0.6);
        if (this.intensity > 0.8 && barStep === 6) this.drum(t, false, 0.45);
      }
      this.nextTime += eighth;
      this.step++;
    }
  }

  /** 0 = exploring, 1 = foes can strike you. */
  setIntensity(v: number) { this.targetIntensity = Math.max(0, Math.min(1, v)); }

  /** Pick the mood directly (each region of the Reach names one). */
  setMood(i: number) {
    const m = MOODS[Math.max(0, Math.min(MOODS.length - 1, i))];
    if (m !== this.mood && m !== this.pendingMood) this.pendingMood = m;
  }

  setDepth(level: number) {
    const m = level >= 10 ? MOODS[3] : MOODS[Math.min(2, Math.floor((level - 1) / 3))];
    if (m !== this.mood && m !== this.pendingMood) this.pendingMood = m;
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem('ashen-music-vol', String(this.volume)); } catch { /* storage unavailable */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.volume * 0.55, this.ctx.currentTime, 0.2);
  }
  getVolume() { return this.volume; }

  setEnabled(on: boolean) {
    this.enabled = on;
    try { localStorage.setItem('ashen-music', on ? 'on' : 'off'); } catch { /* storage unavailable */ }
    if (on) { this.start(); if (this.ctx) this.master.gain.setTargetAtTime(this.volume * 0.55, this.ctx.currentTime, 0.5); }
    else if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
  }
  isEnabled() { return this.enabled; }
}

export const music = new Score();

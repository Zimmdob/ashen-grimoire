// Procedural score, generated live with WebAudio. Original composition; no audio files.
// Two styles share one scheduler:
//  - dungeon synth: drone, choir pad, plucked lute arpeggio, distant bell, war drums that rise with danger.
//  - dreamwave: slow 90s ambient vaporwave. Detuned chorus pads on drifting 7th/9th chords, a soft FM
//    electric piano through a long echo, warm sub bass, tape wobble and hiss, and a muffled lo-fi pulse
//    that only creeps in when foes can reach you.
// A look-ahead scheduler queues notes slightly in the future so timing stays steady.

/** Which style plays: dreamwave in menus and camp with the dungeon below ('mixed'), or one style everywhere. */
export type MusicStyle = 'mixed' | 'dream' | 'dungeon';
export const STYLE_NAMES: Record<MusicStyle, string> = { mixed: 'Mixed', dream: 'Dreamwave', dungeon: 'Dungeon synth' };

/** Dreamwave chords as semitones above the key root (voicings, lowest note first). Four bars each. */
const DREAM_PROGS: number[][][] = [
  [[-4, 3, 7, 10, 14], [-5, 2, 5, 9, 12], [-7, 0, 3, 7, 10], [-9, 0, 3, 7, 14]],   // VImaj9 · v9 · iv9 · III maj (drifts, never lands)
  [[0, 7, 10, 14, 15], [-2, 5, 9, 12, 14], [-4, 3, 7, 10, 12], [-7, 5, 8, 12, 15]], // i(add9) · VII6/9 · VImaj7 · iv11
  [[-7, 0, 3, 7, 10], [-4, 0, 3, 7, 11], [-2, 2, 5, 9, 12], [-9, 2, 7, 10, 15]],   // iv9 · VImaj7 · VII · III sus
];
/** Electric-piano melody notes (pentatonic, above the root) the dream lead may wander through. */
/** Dreamwave sits a little softer by nature; this evens its loudness with the dungeon score. */
const DREAM_GAIN = 1.35;
const DREAM_PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];

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
  private stylePref: MusicStyle = 'mixed';
  private scene: 'menu' | 'dungeon' = 'menu';
  private style: 'dream' | 'dungeon' = 'dream';
  private dungeonBus!: GainNode;
  private dreamBus!: GainNode;
  private wobble!: GainNode;
  private hiss: AudioBufferSourceNode | null = null;
  private echo!: DelayNode;
  private dreamStep = 0;
  private lastLead = 5;

  constructor() {
    try {
      this.volume = Number(localStorage.getItem('ashen-music-vol') ?? '0.5');
      this.enabled = localStorage.getItem('ashen-music') !== 'off';
      const st = localStorage.getItem('ashen-music-style') as MusicStyle | null;
      if (st && st in STYLE_NAMES) this.stylePref = st;
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
    this.dungeonBus = a.createGain();
    this.dreamBus = a.createGain();
    this.dungeonBus.connect(this.master);
    this.style = this.wantStyle();
    this.dungeonBus.gain.value = this.style === 'dungeon' ? 1 : 0;
    this.dreamBus.gain.value = this.style === 'dream' ? DREAM_GAIN : 0;
    // Dreamwave runs through a soft low-pass, like a worn tape.
    const tape = a.createBiquadFilter();
    tape.type = 'lowpass';
    tape.frequency.value = 4200;
    tape.Q.value = 0.4;
    this.dreamBus.connect(tape).connect(this.master);
    // Tape wobble: a slow drift plus a gentle flutter, shared by every dreamwave oscillator's pitch.
    this.wobble = a.createGain();
    this.wobble.gain.value = 1;
    for (const [hz, cents] of [[0.13, 9], [3.1, 2.5]]) {
      const l = a.createOscillator(), lg = a.createGain();
      l.frequency.value = hz; lg.gain.value = cents;
      l.connect(lg).connect(this.wobble);
      l.start();
    }
    // A long, soft echo for the electric piano.
    this.echo = a.createDelay(2);
    this.echo.delayTime.value = (60 / 64) * 0.75;
    const fb = a.createGain(), ef = a.createBiquadFilter();
    fb.gain.value = 0.42; ef.type = 'lowpass'; ef.frequency.value = 1800;
    this.echo.connect(ef).connect(fb).connect(this.echo);
    const echoOut = a.createGain();
    echoOut.gain.value = 0.55;
    ef.connect(echoOut).connect(this.dreamBus);
    echoOut.connect(this.verbSend);
    this.drumBus = a.createGain();
    this.drumBus.gain.value = 0;
    this.drumBus.connect(this.dungeonBus);
    this.startDrone();
    this.startHiss();
    this.nextTime = a.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  private out(g: AudioNode, wet = 0.5, bus: GainNode = this.dungeonBus) {
    const dry = this.ctx!.createGain();
    dry.gain.value = 1 - wet * 0.5;
    g.connect(dry).connect(bus);
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

  // ------------------------------------------------------------------ dreamwave voices
  private wantStyle(): 'dream' | 'dungeon' {
    return this.stylePref === 'mixed' ? (this.scene === 'menu' ? 'dream' : 'dungeon') : this.stylePref;
  }

  private startHiss() {
    const a = this.ctx!;
    const len = a.sampleRate * 4;
    const b = a.createBuffer(1, len, a.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.92 + (Math.random() * 2 - 1) * 0.08; // soft, darker hiss
      d[i] = last * 3 + (Math.random() < 0.00012 ? (Math.random() - 0.5) * 1.6 : 0); // and the odd crackle
    }
    const src = a.createBufferSource();
    src.buffer = b; src.loop = true;
    const g = a.createGain();
    g.gain.value = 0.022;
    const f = a.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.5;
    src.connect(f).connect(g).connect(this.dreamBus);
    src.start();
    this.hiss = src;
  }

  private dreamKey() { return 48 + (((this.mood.root - 48) % 6) + 6) % 6; }

  /** Wide, slow chorus pad: two detuned saws and a sine per note, breathing over a whole bar or two. */
  private dreamPad(t: number, chord: number[], dur: number) {
    const a = this.ctx!;
    const g = a.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.034, t + dur * 0.4);
    g.gain.setValueAtTime(0.034, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur * 1.25);
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(1500 + this.rnd() * 600, t + dur * 0.6);
    f.frequency.linearRampToValueAtTime(800, t + dur * 1.2);
    f.connect(g);
    const key = this.dreamKey();
    chord.forEach((iv, n) => {
      const m = key + iv + (n === 0 ? 0 : 12);
      for (const [type, det] of [['sawtooth', -9], ['sawtooth', 9], ['sine', 0]] as const) {
        const o = a.createOscillator();
        o.type = type;
        o.frequency.value = midi(m);
        o.detune.value = det;
        this.wobble.connect(o.detune);
        const og = a.createGain();
        og.gain.value = type === 'sine' ? 0.8 : 0.45;
        o.connect(og).connect(f);
        o.start(t); o.stop(t + dur * 1.3);
      }
    });
    this.out(g, 0.85, this.dreamBus);
  }

  /** Round, warm sub bass under each chord. */
  private dreamBass(t: number, m: number, dur: number) {
    const a = this.ctx!;
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine';
    o.frequency.value = midi(m);
    this.wobble.connect(o.detune);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.6);
    g.gain.setTargetAtTime(0, t + dur * 0.8, dur * 0.2);
    o.connect(g);
    this.out(g, 0.15, this.dreamBus);
    o.start(t); o.stop(t + dur * 1.4);
  }

  /** Soft FM electric piano: a sine carrier with a decaying modulator gives the bell-ish "tine". */
  private ePiano(t: number, m: number, vel: number) {
    const a = this.ctx!;
    const car = a.createOscillator(), mod = a.createOscillator(), modG = a.createGain();
    car.type = 'sine'; mod.type = 'sine';
    car.frequency.value = midi(m);
    mod.frequency.value = midi(m) * 1.0;
    this.wobble.connect(car.detune);
    const peak = midi(m) * 1.6;
    modG.gain.setValueAtTime(peak, t);
    modG.gain.exponentialRampToValueAtTime(midi(m) * 0.12, t + 1.4);
    mod.connect(modG).connect(car.frequency);
    // a faint high tine partial
    const tine = a.createOscillator(), tg = a.createGain();
    tine.type = 'sine';
    tine.frequency.value = midi(m) * 4;
    tg.gain.setValueAtTime(0.012 * vel, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    tine.connect(tg);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07 * vel, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    // gentle tremolo, like an old suitcase piano
    const trem = a.createOscillator(), tremG = a.createGain();
    trem.frequency.value = 4.2; tremG.gain.value = 0.012 * vel;
    trem.connect(tremG).connect(g.gain);
    car.connect(g); tg.connect(g);
    this.out(g, 0.7, this.dreamBus);
    g.connect(this.echo);
    for (const o of [car, mod, tine, trem]) { o.start(t); o.stop(t + 3.3); }
  }

  /** Muffled lo-fi kick and a hushed shaker: the danger pulse, dreamwave-style. */
  private dreamBeat(t: number, kick: boolean, vel: number) {
    const a = this.ctx!;
    if (kick) {
      const o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
      o.type = 'sine';
      o.frequency.setValueAtTime(110, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.2);
      f.type = 'lowpass'; f.frequency.value = 400;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35 * vel, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(f).connect(g).connect(this.dreamBus);
      o.start(t); o.stop(t + 0.55);
      return;
    }
    const n = a.createBufferSource();
    const b = a.createBuffer(1, a.sampleRate * 0.12, a.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    n.buffer = b;
    const f = a.createBiquadFilter(), g = a.createGain();
    f.type = 'highpass'; f.frequency.value = 5000;
    g.gain.value = 0.05 * vel;
    n.connect(f).connect(g);
    this.out(g, 0.5, this.dreamBus);
    n.start(t);
  }

  /** One eighth-note step of dreamwave (64 bpm: everything slow and floating). */
  private dreamStepAt(t: number, eighth: number) {
    const s = this.dreamStep++;
    const barStep = s % 8;
    const bar = Math.floor(s / 8);
    const prog = DREAM_PROGS[Math.floor(bar / 8) % DREAM_PROGS.length];
    const chord = prog[Math.floor(bar / 2) % prog.length];
    const key = this.dreamKey();
    if (s % 16 === 0) { this.dreamPad(t, chord, eighth * 16); this.dreamBass(t, key + chord[0] - 12, eighth * 16); }
    if (s % 16 === 8 && this.rnd() < 0.5) this.dreamBass(t, key + chord[0] - 12, eighth * 8);
    // Electric piano: a few unhurried notes per bar, stepping gently through the pentatonic, sometimes resting.
    const want = barStep === 0 ? 0.55 : barStep === 3 ? 0.45 : barStep === 5 ? 0.3 : barStep % 2 === 0 ? 0.12 : 0.05;
    if (this.rnd() < want) {
      const stepBy = [-2, -1, -1, 1, 1, 2][Math.floor(this.rnd() * 6)];
      this.lastLead = Math.max(2, Math.min(DREAM_PENTA.length - 1, this.lastLead + stepBy));
      const m = key + 12 + DREAM_PENTA[this.lastLead];
      this.ePiano(t + (this.rnd() < 0.3 ? eighth * 0.12 : 0), m, 0.6 + this.rnd() * 0.4);
      if (barStep === 0 && this.rnd() < 0.35) this.ePiano(t + 0.03, key + 12 + chord[2], 0.35); // a soft chord tone underneath
    }
    // When foes can reach you, a slow lo-fi pulse fades in under the haze.
    if (this.intensity > 0.08) {
      if (barStep === 0 || (barStep === 5 && this.intensity > 0.5)) this.dreamBeat(t, true, this.intensity);
      if (barStep % 2 === 1 && this.intensity > 0.3) this.dreamBeat(t, false, this.intensity * (barStep === 3 || barStep === 7 ? 1 : 0.5));
    }
  }

  private schedule() {
    const a = this.ctx;
    if (!a) return;
    // Switch styles with a slow crossfade so it never cuts.
    const want = this.wantStyle();
    if (want !== this.style) {
      this.style = want;
      this.dungeonBus.gain.setTargetAtTime(want === 'dungeon' ? 1 : 0, a.currentTime, 1.2);
      this.dreamBus.gain.setTargetAtTime(want === 'dream' ? DREAM_GAIN : 0, a.currentTime, 1.2);
      if (want === 'dream') this.dreamStep = 0; else this.step -= this.step % 16;
    }
    if (this.style === 'dream') {
      this.intensity += (this.targetIntensity - this.intensity) * 0.05;
      this.drumBus.gain.setTargetAtTime(0, a.currentTime, 0.4);
      const eighth = 60 / 64 / 2;
      while (this.nextTime < a.currentTime + 0.25) { this.dreamStepAt(this.nextTime, eighth); this.nextTime += eighth; }
      return;
    }
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

  /** 'menu' for title, Sanctum, camp and level-up; 'dungeon' while delving. */
  setScene(sc: 'menu' | 'dungeon') { this.scene = sc; }

  setStyle(st: MusicStyle) {
    this.stylePref = st;
    try { localStorage.setItem('ashen-music-style', st); } catch { /* storage unavailable */ }
  }
  getStyle() { return this.stylePref; }

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

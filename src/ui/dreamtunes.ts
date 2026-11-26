// One dreamwave tune per place. Original compositions: each is a key, a tempo, a few drifting chord
// progressions, a lead instrument, a scale for that lead to wander through, and background sounds.
// The forests at the top of the Reach are bright and hopeful (major, lydian, open filters, birdsong);
// every step deeper gets darker (minor, phrygian, diminished and whole-tone colour, slower, murkier,
// more wobble, lower drones, and sounds like dripping water, ticking clocks, wind and a heartbeat).

export type Lead = 'epiano' | 'flute' | 'musicbox' | 'glass' | 'choir';
export type Texture = 'birds' | 'crickets' | 'fireflies' | 'owl' | 'drips' | 'wind' | 'bubbles' | 'ticks' | 'bells' | 'whispers' | 'heartbeat' | 'shimmer' | 'embers' | 'clank' | 'crackle';

export interface Tune {
  name: string;
  /** Key root as a MIDI note. */
  root: number;
  bpm: number;
  /** Chord progressions (semitones above the root, bass note first); each chord lasts two bars. */
  progs: number[][][];
  /** Notes (above the root) the lead melody wanders through. */
  scale: number[];
  lead: Lead;
  /** 0 = bright and hopeful, 1 = black and frightening. Darkens the filters, deepens the wobble, adds a drone. */
  dark: number;
  textures: Texture[];
  /** How busy the melody is (0.5 sparse … 1.4 chatty). */
  busy: number;
}

const MAJ_PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11, 12, 14, 16, 18, 19];
const MIXO = [0, 2, 4, 5, 7, 9, 10, 12, 14, 16, 17, 19];
const DORIAN = [0, 2, 3, 5, 7, 9, 10, 12, 14, 15, 17, 19];
const MIN_PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10, 12, 13, 15, 17];
const HARM_MIN = [0, 2, 3, 5, 7, 8, 11, 12, 14, 15, 17, 19];
const WHOLE = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18];
const PHRYG_DOM = [0, 1, 4, 5, 7, 8, 10, 12, 13, 16];
const DIM = [0, 2, 3, 5, 6, 8, 9, 11, 12, 14, 15];

export const TUNES: Record<string, Tune> = {
  // ------------------------------------------------ menus and camp
  title: {
    name: 'Moonlit Threshold', root: 50, bpm: 64, lead: 'epiano', dark: 0.35, busy: 1, textures: [], scale: MIN_PENTA,
    progs: [
      [[-4, 3, 7, 10, 14], [-5, 2, 5, 9, 12], [-7, 0, 3, 7, 10], [-9, 0, 3, 7, 14]],
      [[0, 7, 10, 14, 15], [-2, 5, 9, 12, 14], [-4, 3, 7, 10, 12], [-7, 5, 8, 12, 15]],
    ],
  },
  camp: {
    name: 'Embers and Rest', root: 48, bpm: 60, lead: 'epiano', dark: 0.15, busy: 0.8, textures: ['crackle'], scale: MAJ_PENTA,
    progs: [
      [[0, 4, 7, 11, 14], [-3, 4, 7, 12, 14], [-7, 4, 9, 12, 16], [-5, 5, 9, 14, 16]],   // Imaj9 · vi7 · IV6/9 · V11
      [[-7, 4, 9, 11, 16], [0, 7, 11, 14, 16], [-3, 3, 7, 10, 14], [-5, 2, 7, 10, 14]],
    ],
  },
  // ------------------------------------------------ Cinderstorm
  stormwood: {
    name: 'Cinders Through the Canopy', root: 52, bpm: 84, lead: 'flute', dark: 0.18, busy: 1.3, textures: ['birds', 'wind'], scale: DORIAN,
    progs: [
      [[0, 7, 10, 14, 17], [-2, 5, 9, 14, 16], [-4, 3, 7, 12, 14], [-2, 7, 10, 14, 17]],
      [[-7, 5, 9, 12, 16], [-5, 5, 10, 12, 14], [0, 3, 7, 14, 15], [-2, 5, 9, 12, 14]],
    ],
  },
  stormstag: {
    name: 'The Antler Hymn', root: 50, bpm: 96, lead: 'choir', dark: 0.45, busy: 1.2, textures: ['heartbeat', 'bells'], scale: HARM_MIN,
    progs: [
      [[0, 7, 12, 15, 19], [-4, 7, 11, 15, 16], [-2, 5, 10, 14, 17], [-5, 2, 7, 11, 14]],
      [[0, 3, 7, 14, 15], [-7, 5, 8, 12, 15], [-4, 3, 8, 12, 15], [-5, 4, 7, 11, 13]],
    ],
  },
  // ------------------------------------------------ band 0: the forests (bright and hopeful)
  greenwood: {
    name: 'Sunlit Verge', root: 53, bpm: 78, lead: 'flute', dark: 0, busy: 1.25, textures: ['birds', 'birds', 'wind'], scale: MAJ_PENTA,
    progs: [
      [[0, 7, 11, 14, 16], [2, 9, 14, 16, 18], [-3, 7, 12, 14, 16], [-7, 7, 9, 12, 16]],  // Imaj9 · II (lydian lift) · vi9 · IV6/9
      [[-7, 4, 9, 12, 16], [-5, 5, 9, 14, 17], [0, 4, 7, 14, 16], [-1, 6, 9, 14, 18]],
    ],
  },
  elderglen: {
    name: 'Firefly Hollow', root: 50, bpm: 70, lead: 'musicbox', dark: 0.12, busy: 1.05, textures: ['crickets', 'fireflies', 'owl'], scale: MIXO,
    progs: [
      [[0, 7, 11, 14, 16], [-2, 5, 9, 14, 16], [-7, 7, 10, 12, 16], [-5, 5, 9, 12, 14]],  // D maj9 · C6/9 · G add9 · A sus
      [[2, 9, 12, 16, 17], [-2, 7, 10, 14, 17], [0, 4, 9, 14, 16], [-5, 7, 9, 12, 14]],
    ],
  },
  // ------------------------------------------------ band 1: the first shadows
  witchwood: {
    name: 'Fog in the Black Grove', root: 50, bpm: 64, lead: 'flute', dark: 0.4, busy: 0.9, textures: ['owl', 'wind'], scale: DORIAN,
    progs: [
      [[0, 7, 10, 14, 15], [-7, 5, 9, 12, 14], [-2, 7, 10, 14, 17], [-5, 5, 10, 12, 15]],  // Dm9 · G9 (dorian) · C add9 · A7sus
      [[-4, 7, 10, 12, 15], [-2, 5, 9, 14, 16], [0, 3, 7, 10, 14], [-9, 3, 10, 14, 15]],
    ],
  },
  hollows: {
    name: 'Spores Like Snow', root: 52, bpm: 62, lead: 'glass', dark: 0.42, busy: 0.85, textures: ['drips', 'shimmer'], scale: WHOLE,
    progs: [
      [[0, 4, 8, 14, 18], [-2, 4, 8, 12, 16], [2, 6, 10, 14, 18], [-4, 4, 6, 12, 16]],   // drifting augmented / whole-tone colours
      [[0, 6, 10, 14, 16], [-2, 6, 8, 12, 18], [-6, 4, 8, 10, 14], [-4, 2, 6, 12, 14]],
    ],
  },
  marsh: {
    name: 'Lanterns on the Bog', root: 49, bpm: 58, lead: 'flute', dark: 0.5, busy: 0.8, textures: ['bubbles', 'crickets'], scale: AEOLIAN,
    progs: [
      [[0, 7, 10, 14, 15], [-4, 7, 11, 14, 15], [-7, 3, 7, 10, 14], [-5, 3, 7, 10, 13]],
      [[-2, 5, 9, 12, 14], [-4, 3, 7, 12, 15], [0, 3, 10, 14, 15], [-5, 2, 7, 10, 13]],
    ],
  },
  cellars: {
    name: 'Dust on the Ossuary', root: 48, bpm: 60, lead: 'epiano', dark: 0.52, busy: 0.9, textures: ['drips', 'whispers'], scale: MIN_PENTA,
    progs: [
      [[0, 7, 10, 14, 15], [-4, 7, 11, 14, 15], [-2, 5, 9, 14, 17], [-5, 5, 10, 13, 15]],  // Cm9 · Abmaj9 · Bb add9 · G7sus(b9)
      [[-7, 3, 7, 10, 14], [-4, 3, 7, 11, 15], [0, 3, 7, 10, 14], [-5, 2, 5, 11, 13]],
    ],
  },
  // ------------------------------------------------ band 2: deeper, colder, stranger
  abbey: {
    name: 'Bells Under Water', root: 51, bpm: 56, lead: 'musicbox', dark: 0.6, busy: 0.75, textures: ['bells', 'drips'], scale: AEOLIAN,
    progs: [
      [[0, 7, 10, 14, 15], [-5, 3, 8, 12, 15], [-4, 7, 10, 12, 16], [-7, 3, 8, 12, 14]],
      [[-2, 5, 10, 14, 17], [-4, 3, 7, 11, 14], [-5, 2, 7, 10, 13], [0, 3, 7, 14, 15]],
    ],
  },
  forges: {
    name: 'Anvils in the Deep', root: 45, bpm: 60, lead: 'epiano', dark: 0.66, busy: 0.85, textures: ['embers', 'clank'], scale: PHRYGIAN,
    progs: [
      [[0, 7, 12, 13, 15], [1, 8, 13, 15, 20], [-2, 5, 10, 12, 15], [0, 3, 7, 13, 15]],  // i · bII (phrygian weight) · bVII · i(b9)
      [[-4, 3, 8, 12, 15], [1, 5, 8, 13, 17], [-7, 3, 8, 10, 13], [0, 7, 10, 13, 15]],
    ],
  },
  catacombs: {
    name: 'The Orrery Turns', root: 50, bpm: 66, lead: 'musicbox', dark: 0.62, busy: 1.2, textures: ['ticks', 'clank'], scale: HARM_MIN,
    progs: [
      [[0, 7, 11, 14, 15], [-4, 7, 11, 12, 16], [-7, 3, 8, 12, 15], [-5, 2, 7, 11, 13]],  // i(maj9) · bVImaj7 · iv · V7b9: a music box gone wrong
      [[0, 3, 7, 11, 14], [-2, 5, 8, 12, 14], [-4, 3, 8, 11, 15], [-5, 4, 7, 11, 13]],
    ],
  },
  // ------------------------------------------------ band 3: dread
  frost: {
    name: 'Breath on the Glass', root: 54, bpm: 52, lead: 'glass', dark: 0.72, busy: 0.65, textures: ['wind', 'wind', 'shimmer'], scale: AEOLIAN,
    progs: [
      [[0, 7, 14, 17, 19], [-4, 7, 14, 15, 19], [-7, 5, 12, 14, 17], [-2, 7, 12, 14, 17]],  // hollow sus chords, nothing resolves
      [[-5, 5, 12, 13, 17], [0, 2, 7, 14, 15], [-4, 3, 10, 14, 19], [-7, 2, 7, 12, 13]],
    ],
  },
  library: {
    name: 'The Unwritten Page', root: 48, bpm: 54, lead: 'musicbox', dark: 0.75, busy: 0.7, textures: ['whispers', 'drips'], scale: HARM_MIN,
    progs: [
      [[0, 7, 9, 14, 15], [-4, 7, 11, 14, 16], [-7, 3, 8, 9, 14], [-5, 4, 7, 11, 13]],  // im6/9 · bVImaj9 · ivm6 · V7b9
      [[0, 3, 7, 11, 14], [-3, 3, 6, 9, 14], [-7, 3, 8, 12, 14], [-5, 2, 7, 11, 13]],
    ],
  },
  cathedral: {
    name: 'The Red Choir', root: 47, bpm: 50, lead: 'choir', dark: 0.86, busy: 0.6, textures: ['heartbeat', 'bells', 'whispers'], scale: DIM,
    progs: [
      [[0, 6, 12, 15, 18], [-1, 5, 11, 14, 17], [0, 3, 6, 12, 15], [-6, 6, 9, 12, 15]],  // diminished and tritones: the floor tilts
      [[-4, 3, 8, 11, 14], [1, 7, 10, 13, 16], [0, 6, 9, 15, 18], [-5, 4, 8, 11, 13]],
    ],
  },
  starfall: {
    name: 'Glass From the Sky', root: 49, bpm: 48, lead: 'glass', dark: 0.82, busy: 0.6, textures: ['shimmer', 'shimmer', 'wind'], scale: WHOLE,
    progs: [
      [[0, 6, 10, 14, 16], [2, 8, 12, 16, 18], [-2, 4, 10, 14, 20], [-6, 4, 8, 12, 18]],  // whole-tone clusters drifting in no key at all
      [[0, 4, 8, 12, 14], [-4, 6, 10, 14, 16], [-2, 2, 8, 12, 18], [2, 6, 10, 14, 20]],
    ],
  },
  throne: {
    name: 'The Hollow King', root: 43, bpm: 44, lead: 'choir', dark: 1, busy: 0.5, textures: ['heartbeat', 'whispers', 'wind'], scale: PHRYG_DOM,
    progs: [
      [[0, 7, 13, 16, 19], [1, 8, 13, 16, 20], [0, 6, 12, 13, 18], [-1, 5, 11, 14, 17]],  // phrygian dominant, then nothing but dread
      [[0, 1, 7, 13, 16], [-4, 4, 8, 13, 16], [1, 5, 8, 13, 19], [0, 6, 7, 13, 18]],
    ],
  },
};

/** The tune for a region (falling back to the title tune for anything unknown). */
export const tuneFor = (region: string) => TUNES[region] ?? TUNES.title;

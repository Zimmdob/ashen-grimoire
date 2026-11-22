// The Ashen Reach: regions you choose between on the world map. Each biome sets the look of the
// dungeon, its liquid and terrain rule, its survival pressure, its foes and its boss.

export interface BiomeDef {
  name: string;
  floors: [string, string];
  blurb: string;
  /** Terrain rule shown to players. */
  rule: string;
  liquid: number; // tile code for its pools
  pools: [number, number]; // min, max pools
  ice: boolean;
  /** Openness of the cave: lower = more open (wall chance in the noise). */
  walls: number;
  oilMul: number;
  cold: boolean;
  foes: string[];
  boss: string;
  extraPickups: PickupType[];
  /** Palette: floor tones, wall top, wall face, mortar, accent (moss/runes). */
  pal: { floor: string[]; top: string; face: string; faceHi: string; mortar: string; accent: string; torch: number };
  music: number;
  band: 0 | 1 | 2 | 3;
}

import { T_BLOOD, T_BOG, T_LAVA, T_WATER } from './constants';
import type { PickupType } from './types';

export const BIOMES: Record<string, BiomeDef> = {
  cellars: {
    name: 'The Bone Cellars', floors: ['The Ossuary', 'The Charnel Vault'], band: 0, music: 0,
    blurb: 'Ossuaries and candlelit skull walls under the ruined chapel.', rule: 'Bone piles everywhere: the dead are close at hand.',
    liquid: T_LAVA, pools: [1, 3], ice: false, walls: 0.43, oilMul: 1, cold: false,
    foes: ['ghoul', 'ghoul', 'xbow', 'spitter'], boss: 'warden', extraPickups: ['trap'],
    pal: { floor: ['#211b1a', '#251e1c', '#29211e', '#1e1918'], top: '#2a2228', face: '#3d3136', faceHi: '#4e3f44', mortar: '#18131a', accent: '#cfc4ad', torch: 0xff8a3a },
  },
  witchwood: {
    name: 'The Witchwood', floors: ['Briar Paths', 'The Black Grove'], band: 1, music: 1,
    blurb: 'A black forest at the surface. Fog rolls in and lanterns gutter.', rule: 'Fog: lantern oil burns 50% faster. Trees choke the paths.',
    liquid: T_WATER, pools: [1, 2], ice: false, walls: 0.40, oilMul: 1.5, cold: false,
    foes: ['wolf', 'wolf', 'hag', 'xbow', 'ghoul'], boss: 'mother', extraPickups: ['herb', 'herb', 'hp'],
    pal: { floor: ['#1b2116', '#1f2619', '#232a1c', '#192014'], top: '#1d2a1a', face: '#2c3a24', faceHi: '#3c4c30', mortar: '#101a0e', accent: '#5a7a3a', torch: 0xffb060 },
  },
  hollows: {
    name: 'The Fungal Hollows', floors: ['Spore Caverns', 'The Bloom Heart'], band: 1, music: 1,
    blurb: 'Glowing mushroom caverns. Food grows everywhere; light does not.', rule: 'Bog pools poison; mushrooms are food. Oil burns 30% faster.',
    liquid: T_BOG, pools: [2, 4], ice: false, walls: 0.42, oilMul: 1.3, cold: false,
    foes: ['sporecaller', 'mycelid', 'ghoul', 'spitter'], boss: 'bloom', extraPickups: ['hp', 'hp', 'herb'],
    pal: { floor: ['#1e1a24', '#221d29', '#1a1720', '#251f2c'], top: '#2a2234', face: '#3a2e48', faceHi: '#4a3a5c', mortar: '#140f1a', accent: '#7ae0c0', torch: 0x9affd0 },
  },
  marsh: {
    name: 'The Plague Marsh', floors: ['Rotting Docks', 'The Fly Throne'], band: 1, music: 1,
    blurb: 'Bog, rotting piers and clouds of flies.', rule: 'Poison bog everywhere. Clean ground is precious.',
    liquid: T_BOG, pools: [4, 6], ice: false, walls: 0.38, oilMul: 1.1, cold: false,
    foes: ['toad', 'toad', 'monk', 'spitter', 'ghoul', 'drowned'], boss: 'swarm', extraPickups: ['herb', 'trap'],
    pal: { floor: ['#1f2018', '#23241a', '#1b1c15', '#26271c'], top: '#2a2a1e', face: '#3a3a28', faceHi: '#4a4a34', mortar: '#121208', accent: '#9cff5a', torch: 0xd0ff80 },
  },
  abbey: {
    name: 'The Drowned Abbey', floors: ['Flooded Nave', 'The Bell Tower'], band: 2, music: 2,
    blurb: 'Flooded chapels under shattered stained glass.', rule: 'Water soaks: lightning deals double, frost freezes harder, the wet grow cold.',
    liquid: T_WATER, pools: [3, 5], ice: false, walls: 0.42, oilMul: 1, cold: false,
    foes: ['grasp', 'eelpriest', 'drowned', 'gargoyle', 'xbow', 'priest'], boss: 'bellringer', extraPickups: ['oil'],
    pal: { floor: ['#1a1f24', '#1d2329', '#20272e', '#171c21'], top: '#222a34', face: '#2f3a48', faceHi: '#3e4c5c', mortar: '#10151a', accent: '#6fa0ff', torch: 0xa0c8ff },
  },
  forges: {
    name: 'The Ember Forges', floors: ['Slag Halls', 'The Great Anvil'], band: 2, music: 2,
    blurb: 'Dwarven furnaces and rivers of lava.', rule: 'Lava everywhere, and its glow saves lantern oil.',
    liquid: T_LAVA, pools: [4, 6], ice: false, walls: 0.42, oilMul: 0.8, cold: false,
    foes: ['slag', 'imp', 'ashling', 'ashling', 'xbow', 'spitter'], boss: 'anvil', extraPickups: ['oil', 'trap'],
    pal: { floor: ['#241a16', '#2a1e18', '#2e211a', '#201714'], top: '#30221c', face: '#45302a', faceHi: '#5a4034', mortar: '#160e0a', accent: '#ff7a2a', torch: 0xff7a2a },
  },
  catacombs: {
    name: 'The Clockwork Catacombs', floors: ['Gear Galleries', 'The Orrery'], band: 2, music: 2,
    blurb: 'Brass machinery grinding inside old stone.', rule: 'Traps everywhere. Constructs shrug off big hits.',
    liquid: T_LAVA, pools: [0, 1], ice: false, walls: 0.45, oilMul: 1, cold: false,
    foes: ['automaton', 'gearspider', 'gearspider', 'xbow', 'priest'], boss: 'orrery', extraPickups: ['trap', 'trap', 'trap', 'oil'],
    pal: { floor: ['#22201a', '#26231c', '#2a271f', '#1e1c17'], top: '#2e2a20', face: '#463e2a', faceHi: '#5c5034', mortar: '#14120c', accent: '#d9a845', torch: 0xffd060 },
  },
  frost: {
    name: 'The Frostbitten Ossuary', floors: ['Rime Crypts', 'The Frozen Court'], band: 3, music: 2,
    blurb: 'Ice crypts where old kings sleep.', rule: 'Ice floors: shoves slide twice as far. Cold saps your stamina away from fire.',
    liquid: T_WATER, pools: [1, 2], ice: true, walls: 0.42, oilMul: 1, cold: true,
    foes: ['wight', 'hound', 'hound', 'wisp', 'xbow', 'priest'], boss: 'queen', extraPickups: ['oil', 'hp'],
    pal: { floor: ['#1c2228', '#20272e', '#242c34', '#1a1f25'], top: '#28323e', face: '#3a4a5a', faceHi: '#56687a', mortar: '#10161c', accent: '#bff4ff', torch: 0x9fe8ff },
  },
  library: {
    name: 'The Sunken Library', floors: ['Drowned Stacks', 'The Unwritten Vault'], band: 3, music: 2,
    blurb: 'Whispering tomes and drowned shelves.', rule: 'Spell scrolls are everywhere, food is scarce.',
    liquid: T_WATER, pools: [1, 3], ice: false, walls: 0.44, oilMul: 1, cold: false,
    foes: ['inkwraith', 'lich', 'ghoul', 'xbow'], boss: 'unwritten', extraPickups: ['scroll', 'scroll', 'oil'],
    pal: { floor: ['#211c18', '#251f1a', '#1d1915', '#29221c'], top: '#2c241c', face: '#3e3226', faceHi: '#524232', mortar: '#140f0a', accent: '#e2cfa2', torch: 0xffd8a0 },
  },
  cathedral: {
    name: 'The Bloodmoon Cathedral', floors: ['The Red Nave', 'The Crimson Choir'], band: 3, music: 3,
    blurb: 'Red glass, blood pools and an organ that never stops.', rule: 'Blood pools heal foes standing in them and stain you with corruption.',
    liquid: T_BLOOD, pools: [3, 5], ice: false, walls: 0.43, oilMul: 1, cold: false,
    foes: ['flagellant', 'bloodarcher', 'cultist', 'gargoyle', 'priest', 'leech'], boss: 'choir', extraPickups: ['shrine'],
    pal: { floor: ['#241618', '#2a1a1c', '#2e1d20', '#201315'], top: '#301c20', face: '#4a2a30', faceHi: '#603840', mortar: '#160a0c', accent: '#b3202a', torch: 0xff4a4a },
  },
  starfall: {
    name: 'The Starfall Crater', floors: ['Glass Fields', 'The Fallen Star'], band: 3, music: 3,
    blurb: 'Meteor glass and warped gravity under a broken sky.', rule: 'Gravity wells drag every body toward them each turn.',
    liquid: T_LAVA, pools: [1, 2], ice: false, walls: 0.38, oilMul: 1, cold: false,
    foes: ['voidmoth', 'voidmoth', 'startouched', 'leech', 'grasp'], boss: 'star', extraPickups: ['scroll', 'oil'],
    pal: { floor: ['#1a1826', '#1e1b2c', '#221e32', '#171522'], top: '#24203a', face: '#342e52', faceHi: '#463e6c', mortar: '#0e0c18', accent: '#c0a0ff', torch: 0xc0a0ff },
  },
  throne: {
    name: 'The Hollow Throne', floors: ['The Last Hall', 'The Last Hall'], band: 3, music: 3,
    blurb: 'The citadel of the Hollow King.', rule: 'Every danger at once.',
    liquid: T_LAVA, pools: [2, 4], ice: false, walls: 0.40, oilMul: 1.2, cold: false,
    foes: ['ghoul', 'xbow', 'priest', 'spitter'], boss: 'king', extraPickups: ['oil', 'hp'],
    pal: { floor: ['#1c1416', '#201618', '#24191b', '#181113'], top: '#281a1e', face: '#3a262c', faceHi: '#4e343a', mortar: '#0e0809', accent: '#e0b040', torch: 0xffb040 },
  },
};

/** Which bands may appear on each tier of the world map. */
const TIER_BANDS: number[][] = [[0], [1], [1, 2], [2, 3], [3]];

import { shuffle } from './rng';

export function makeRoute(s: { seed: number }): string[][] {
  const route: string[][] = [];
  const used = new Set<string>();
  for (const bands of TIER_BANDS) {
    const pool = shuffle(s, Object.keys(BIOMES).filter((b) => b !== 'throne' && bands.includes(BIOMES[b].band) && !used.has(b)));
    const n = bands[0] === 0 ? 1 : Math.min(pool.length, 2 + (pool.length > 3 ? 1 : 0));
    const pick = pool.slice(0, Math.max(1, n));
    pick.forEach((b) => used.add(b));
    route.push(pick);
  }
  route.push(['throne']);
  return route;
}

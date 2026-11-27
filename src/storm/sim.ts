import { TILE, T_BLOOD, T_BOG, T_FLOOR, T_ICE, T_LAVA, T_WALL, T_WATER } from '../sim/constants';
import { RELIC_IDS, spellStats, type SpellStats } from './cards';

// Cinderstorm's real-time simulation. Pure data and a fixed time step: given the same seed and the
// same inputs it plays out the same way, which is what co-op (rollback) will need later.

export const MW = 32, MH = 20;
export const AW = MW * TILE, AH = MH * TILE;
export const STEP = 1 / 60;

export interface Input { up: boolean; down: boolean; left: boolean; right: boolean; mx: number; my: number; fireA: boolean; fireB: boolean; blink: boolean; focus: boolean; bomb: boolean; surge?: boolean }
export const NO_INPUT: Input = { up: false, down: false, left: false, right: false, mx: 0, my: 0, fireA: false, fireB: false, blink: false, focus: false, bomb: false, surge: false };

// ------------------------------------------------------------------ difficulty
export type Difficulty = 'gentle' | 'normal' | 'nightmare';
export const DIFFICULTY: Record<Difficulty, { name: string; desc: string; speed: number; density: number; hp: number; hearts: number }> = {
  gentle: { name: 'Gentle', desc: 'Slower, sparser shots and an extra heart. For learning the patterns.', speed: 0.8, density: 0.7, hp: 0.85, hearts: 7 },
  normal: { name: 'Ashen', desc: 'The intended storm.', speed: 1, density: 1, hp: 1, hearts: 6 },
  nightmare: { name: 'Nightmare', desc: 'Faster, denser, tougher. Double score.', speed: 1.22, density: 1.42, hp: 1.4, hearts: 5 },
};

// ------------------------------------------------------------------ entities
export interface Bullet {
  id: number; x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number; age: number;
  friendly: boolean; color: number;
  pierce: number; chain: number; homing: number; burn: number; slow: number;
  orbit: { t: number; ang: number; rad: number; spin: number } | null;
  burst: { after: number; n: number; dmg: number } | null;
  hit: number[]; hitT: number[];
  /** Foe shots "wake" over a moment so they read as they appear. */
  wake: number;
  bounce: number; boomer: boolean; cluster: boolean; gravity: boolean; tick: number;
  wave: { bx: number; by: number; ux: number; uy: number } | null;
  target: { x: number; y: number; boom: number } | null;
  turret: { cd: number; dmg: number } | null;
  /** Lobbed foe shots land and leave a pool. */
  lob: { x: number; y: number } | null;
  grazed: boolean;
  /** Turns its flight by this many radians a second (Spiral). */
  spin: number;
  splinter: boolean; shock: boolean; siphon: number; leech: number;
  /** Foe shots that circle their caster like planets before flying out. */
  orbitFoe: { id: number; ang: number; rad: number; spin: number; t: number; speed: number } | null;
}
export type FoeType =
  | 'boar' | 'thornling' | 'xbow' | 'hag' | 'wolf'
  | 'ghoul' | 'spitter' | 'necro' | 'bellringer'
  | 'wight' | 'wisp' | 'gargoyle' | 'shade'
  | 'cultist' | 'bloodarcher' | 'imp' | 'flagellant'
  | 'stag' | 'warden' | 'lich' | 'choir' | 'king' | 'ashling' | 'brazier' | 'unwritten'
  | 'automaton' | 'gearspider' | 'slag' | 'anvil' | 'orrery' | 'thief' | 'dummy';
/** Champions carry one of these. */
export type Affix = 'swift' | 'warded' | 'splitting' | 'vampiric' | 'volleying';
export const AFFIXES: Record<Affix, string> = { swift: 'Swift', warded: 'Warded', splitting: 'Splitting', vampiric: 'Undying', volleying: 'Volleying' };
export interface Foe {
  id: number; type: FoeType; x: number; y: number; r: number; hp: number; maxHp: number; speed: number;
  t: number; state: 'spawn' | 'move' | 'wind' | 'charge' | 'rest' | 'sleep'; st: number;
  vx: number; vy: number; slow: number; burnT: number; burnDps: number; flash: number; ang: number; ang2: number;
  boss: boolean; elite: boolean; affix: Affix | null;
  /** Stunned (by Shock) for this long. */
  stun: number;
  /** Shots thrown out when a charge ends. */
  slam: number;
  /** Seconds-based pattern timers. */
  timers: number[];
  phase: number;
}
export interface Hazard {
  kind: 'pool' | 'beam' | 'spikes'; x: number; y: number; r: number; ang: number; len: number;
  /** Beams warn (harmless, a thin line) before they fire. */
  warn: number; life: number; t: number; color: number;
}
export interface Pickup { kind: 'cinder' | 'heart' | 'xp'; x: number; y: number; vx: number; vy: number; n: number; t: number }
export interface Fx { kind: 'hit' | 'die' | 'blink' | 'spawn' | 'hurt' | 'burst' | 'ring' | 'nova' | 'graze' | 'boom' | 'text' | 'phase'; x: number; y: number; color: number; t: number; dur: number; r?: number; text?: string; src?: string }
export interface Player {
  x: number; y: number; vx: number; vy: number; r: number; hp: number; maxHp: number; mana: number; maxMana: number;
  inv: number; blinkCd: number; cdA: number; cdB: number; face: number; moving: boolean; dead: boolean;
  bombs: number; cinders: number; relics: string[]; shield: boolean; revived: boolean; volleys: number; killsSince: number;
  cls: ClassId; speedMul: number; dmgBonus: number; stillT: number; wardT: number;
  /** Experience within this run: every level offers a boon. */
  xp: number; level: number; boons: Record<string, number>;
}
// ------------------------------------------------------------------ the five wizards
export type ClassId = 'spellwright' | 'pyromancer' | 'frostbinder' | 'graveknight' | 'stormcaller' | 'hollowheir';
export const CLASSES: Record<ClassId, { name: string; desc: string; spells: [string[], string[]]; owned: string[]; hearts: number; speed: number; relic: string; tint: number; locked?: string }> = {
  spellwright: { name: 'Spellwright', desc: 'Balanced. Starts with Ember Bolt and Thorn Seed, and Lucky Ash (an extra card to choose from).', spells: [['ember'], ['thorn']], owned: ['ember', 'thorn'], hearts: 0, speed: 1, relic: 'luckyash', tint: 0xffffff },
  pyromancer: { name: 'Pyromancer', desc: 'Burning bolts and meteors. Foes she kills burst into sparks (Volatile Ash).', spells: [['ember', 'burn'], ['meteor']], owned: ['ember', 'burn', 'meteor'], hearts: 0, speed: 1, relic: 'volatile', tint: 0xffb08a },
  frostbinder: { name: 'Frostbinder', desc: 'Slowing shards and a frost nova. Foe shots crawl near him (Cracked Hourglass).', spells: [['frost'], ['frost', 'nova']], owned: ['frost', 'frost', 'nova'], hearts: 1, speed: 1, relic: 'hourglass', tint: 0xa8d8ff },
  graveknight: { name: 'Grave Knight', desc: 'Two more hearts but slower. Bone lances and a wisp; thorns burst from him when hit.', spells: [['bone'], ['wisp']], owned: ['bone', 'wisp'], hearts: 1, speed: 0.9, relic: 'thornhide', tint: 0xd8d0b8 },
  stormcaller: { name: 'Stormcaller', desc: 'Lightning-fast. Sparks and arcs; her blink scorches (Phantom Step).', spells: [['spark'], ['arc', 'chain']], owned: ['spark', 'arc', 'chain'], hearts: 0, speed: 1.1, relic: 'phantom', tint: 0xd0b8ff },
  hollowheir: { name: 'Hollow Heir', desc: 'The King\u2019s empty crown, worn. Void orbs and gravity; a bone hound at heel. Unlocked by defeating the Hollow King.', spells: [['void', 'gravity'], ['scythe']], owned: ['void', 'gravity', 'scythe'], hearts: 2, speed: 1.05, relic: 'f_hound', tint: 0x9a8aff, locked: 'king' },
};
export type RoomKind = 'fight' | 'elite' | 'treasure' | 'shrine' | 'shop' | 'event' | 'boss' | 'rescue';
export interface StormWorld {
  seed: number; time: number; map: number[][];
  diff: Difficulty; endless: boolean; loop: number;
  act: number; room: number; kind: RoomKind;
  player: Player; foes: Foe[]; bullets: Bullet[]; hazards: Hazard[]; pickups: Pickup[]; fx: Fx[];
  spells: [string[], string[]];
  waves: { type: FoeType; elite: boolean }[][]; waveDelay: number;
  cleared: boolean; nextId: number;
  sounds: string[];
  echoes: { at: number; slot: 0 | 1; ang: number }[];
  score: number;
  stats: { kills: number; shots: number; hitsTaken: number; grazes: number; bosses: number; rooms: number; flawless: number; bestNova: number; secret: number };
  /** Hits taken when the current boss appeared (to spot a flawless kill). */
  bossHits: number;
  /** Set when the final boss falls (the run is won unless you go on into the Abyss). */
  won: boolean;
  /** Boss rush: every room is a boss. */
  rush: boolean;
  /** Little allies from familiar relics, circling you. */
  familiars: { kind: string; x: number; y: number; cd: number; ang: number }[];
  /** The squad this room holds (shown as the room's title). */
  encounter: string;
  /** What makes this fight different, and its timer. */
  twist: Twist | null; twistT: number; lastTwist: Twist | null;
  /** The arena's shape. */
  layout: Layout;
  /** Heat builds with quick kills and grazes; a full bar unlocks Overdrive. */
  heat: number; combo: number; comboT: number; bestCombo: number;
  /** Seconds of Overdrive left. */
  overdrive: number;
  /** Level-ups waiting for the player to choose a boon. */
  pendingLevels: number;
  /** How long the next wave has been waiting (it won't wait for the last straggler). */
  waveClock: number; auraT: number;
  /** When something last fell: stragglers that hang back too long come for you. */
  lastKill: number;
  /** What the run started with: Sanctuary upgrades, Rook's pacts, the week's mutators. */
  perks: Perks; pacts: string[]; mutators: string[];
  /** Captives: those already safe at the Hearth, and the one in this room (if any). */
  rescued: string[]; rescue: string | null;
  /** Carrying Vell's Bell: the King's fall leads beneath the throne. */
  bell: boolean; truePath: boolean; phoenixUsed: boolean;
  /** A scripted room (the prologue): it never clears itself. */
  scripted: boolean;
}
export interface Perks { hearts: number; dmg: number; mana: number; bombs: number; xp: number; cinders: number; choices: number; revive: boolean; relic: boolean; speed: number; graze: number }
export const NO_PERKS: Perks = { hearts: 0, dmg: 0, mana: 0, bombs: 0, xp: 0, cinders: 0, choices: 3, revive: false, relic: false, speed: 0, graze: 0 };
/** Who waits in each act's cells, to be freed. */
export const CAPTIVES = ['rook', 'brannoch', 'ysolde', 'hesk', 'vell'];
const mut = (w: StormWorld, id: string) => w.mutators.includes(id);
const pact = (w: StormWorld, id: string) => w.pacts.includes(id);

// ------------------------------------------------------------------ boons: level-up upgrades within a run
export const BOONS: Record<string, { name: string; desc: string; icon: string; max: number }> = {
  might: { name: 'Might', desc: '+15% spell damage.', icon: '⚔', max: 6 },
  haste: { name: 'Quickening', desc: '+12% casting speed.', icon: '⌁', max: 6 },
  volley: { name: 'Volley', desc: 'Your first spell fires one more shot.', icon: '⋔', max: 3 },
  velocity: { name: 'Velocity', desc: 'Shots fly 15% faster and farther.', icon: '➶', max: 4 },
  girth: { name: 'Greater bolts', desc: 'Shots are 30% bigger and hit 8% harder.', icon: '●', max: 4 },
  pierce: { name: 'Piercing', desc: 'Shots pass through one more foe, and hit 10% harder.', icon: '➹', max: 3 },
  crit: { name: 'Keen eye', desc: '+10% chance for a shot to deal triple damage.', icon: '✦', max: 5 },
  swift: { name: 'Fleet foot', desc: '+8% move speed.', icon: '»', max: 4 },
  vigor: { name: 'Vigor', desc: '+1 heart, and heal one.', icon: '♥', max: 3 },
  blink: { name: 'Shadowstep', desc: 'Blink recharges 22% faster, and you stay untouchable a little longer.', icon: '◌', max: 4 },
  magnet: { name: 'Lodestone', desc: 'Pick things up from farther away; +20% experience.', icon: '⊙', max: 3 },
  frenzy: { name: 'Frenzy', desc: 'Heat builds 50% faster, and Overdrive lasts a second longer.', icon: '🔥', max: 4 },
  echo: { name: 'Resonance', desc: '+15% chance a volley echoes a moment later.', icon: '≋', max: 4 },
  aura: { name: 'Cinder aura', desc: 'Burns foes near you, and burns away foe shots that touch it.', icon: '☀', max: 5 },
  wellspring: { name: 'Wellspring', desc: '+25% mana regeneration.', icon: '◈', max: 4 },
};
const bn = (w: StormWorld, id: string) => w.player.boons[id] ?? 0;
export const xpNeed = (level: number) => 8 + level * 5;
/** Three boons to choose from (never one that's maxed out). */
export function boonChoices(w: StormWorld): string[] {
  const open = Object.keys(BOONS).filter((id) => bn(w, id) < BOONS[id].max && !(id === 'vigor' && w.player.maxHp >= 9));
  const out: string[] = [];
  while (out.length < (w.perks?.choices ?? 3) && open.length) out.push(open.splice(Math.floor(rand(w) * open.length), 1)[0]);
  return out;
}
export function takeBoon(w: StormWorld, id: string) {
  const p = w.player;
  p.boons[id] = bn(w, id) + 1;
  if (id === 'swift') p.speedMul *= 1.08;
  if (id === 'vigor') { p.maxHp++; p.hp = Math.min(p.maxHp, p.hp + 1); }
  w.pendingLevels = Math.max(0, w.pendingLevels - 1);
}

// ------------------------------------------------------------------ battle variety
export type Twist = 'ambush' | 'horde' | 'duel' | 'siege' | 'meteors' | 'blades' | 'thief' | 'champions';
export const TWISTS: Record<Twist, { name: string; desc: string }> = {
  ambush: { name: 'Ambush!', desc: 'They were waiting. They come from every side at once.' },
  horde: { name: 'Horde', desc: 'Twice as many, half as tough.' },
  duel: { name: 'Duel', desc: 'One champion, and nothing else. Make it count.' },
  siege: { name: 'Hold the line', desc: 'The rifts keep opening. Survive until they close.' },
  meteors: { name: 'Firestorm', desc: 'The sky is falling. Step out of the marks.' },
  blades: { name: 'Sawblades', desc: 'Loose blades ricochet around the room.' },
  thief: { name: 'Cinder thief', desc: 'A thief with a sack of cinders. Catch it before it gets away!' },
  champions: { name: 'Champions\u2019 hall', desc: 'Fewer foes, but every one a champion.' },
};
export type Layout = 'groves' | 'cross' | 'ring' | 'corridors' | 'grid' | 'open';
/** Named squads, act by act: each room is one of these, not a random handful. */
export const ENCOUNTERS: { name: string; waves: FoeType[][] }[][] = [
  [
    { name: 'Wolf Pack', waves: [['wolf', 'wolf', 'wolf'], ['wolf', 'wolf', 'wolf', 'wolf']] },
    { name: 'Poachers\u2019 Camp', waves: [['xbow', 'xbow', 'boar'], ['xbow', 'xbow', 'boar', 'boar']] },
    { name: 'Briar Coven', waves: [['thornling', 'thornling', 'thornling'], ['hag', 'thornling', 'thornling', 'thornling']] },
    { name: 'Stampede', waves: [['boar', 'boar', 'boar'], ['boar', 'boar', 'boar', 'wolf']] },
    { name: 'Hunting Party', waves: [['wolf', 'xbow', 'thornling'], ['boar', 'xbow', 'wolf', 'hag']] },
  ],
  [
    { name: 'Ghoul Nest', waves: [['ghoul', 'ghoul', 'ghoul', 'ghoul'], ['ghoul', 'ghoul', 'ghoul', 'spitter', 'ghoul']] },
    { name: 'Necromancer\u2019s Circle', waves: [['ghoul', 'ghoul', 'necro'], ['necro', 'ghoul', 'ghoul', 'spitter']] },
    { name: 'The Bell Tower', waves: [['bellringer', 'xbow'], ['bellringer', 'ghoul', 'ghoul', 'xbow']] },
    { name: 'Acid Vats', waves: [['spitter', 'spitter', 'spitter'], ['spitter', 'ghoul', 'spitter', 'ghoul']] },
  ],
  [
    { name: 'Wight Patrol', waves: [['wight', 'wight', 'wight'], ['wight', 'wight', 'shade', 'wight']] },
    { name: 'Will-o\u2019-Wisps', waves: [['wisp', 'wisp', 'wisp', 'wisp'], ['wisp', 'wisp', 'wight', 'wisp', 'wisp']] },
    { name: 'Gargoyle Gallery', waves: [['gargoyle', 'gargoyle', 'gargoyle'], ['gargoyle', 'wisp', 'gargoyle', 'wisp']] },
    { name: 'Shadow Hunt', waves: [['shade', 'shade'], ['shade', 'shade', 'shade', 'wight']] },
  ],
  [
    { name: 'Assembly Line', waves: [['automaton', 'automaton', 'automaton'], ['automaton', 'automaton', 'anvil']] },
    { name: 'Spider Nest', waves: [['gearspider', 'gearspider', 'gearspider', 'gearspider'], ['gearspider', 'gearspider', 'gearspider', 'slag', 'gearspider']] },
    { name: 'Slag Pits', waves: [['slag', 'slag', 'gearspider'], ['slag', 'slag', 'slag', 'automaton']] },
    { name: 'The Anvil Chorus', waves: [['anvil', 'gearspider'], ['anvil', 'anvil', 'gearspider', 'gearspider']] },
  ],
  [
    { name: 'Blood Mass', waves: [['cultist', 'cultist', 'cultist'], ['cultist', 'cultist', 'bloodarcher', 'cultist']] },
    { name: 'Imp Swarm', waves: [['imp', 'imp', 'imp', 'imp'], ['imp', 'imp', 'imp', 'imp', 'imp']] },
    { name: 'Penitents\u2019 March', waves: [['flagellant', 'flagellant', 'flagellant'], ['flagellant', 'flagellant', 'cultist', 'flagellant']] },
    { name: 'Archers in the Loft', waves: [['bloodarcher', 'bloodarcher'], ['bloodarcher', 'bloodarcher', 'imp', 'imp']] },
  ],
];
const CHAMP_NAMES = ['Grisk', 'Morwen', 'Vathek', 'Old Ulm', 'Sable', 'Korrigan', 'Hesk', 'Brannoch', 'Ysolde', 'Mother Rook'];
const CHAMP_TITLES = ['the Unbowed', 'Twice-Buried', 'of the Long Knife', 'the Patient', 'Gravebright', 'the Hungry', 'Ash-Eater', 'the Last Bell'];

// ------------------------------------------------------------------ randomness (seeded)
export function rand(w: StormWorld): number {
  let s = (w.seed = (w.seed + 0x6d2b79f5) | 0);
  s = Math.imul(s ^ (s >>> 15), s | 1);
  s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
  return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(w: StormWorld, a: T[]) => a[Math.floor(rand(w) * a.length)];

// ------------------------------------------------------------------ acts
export interface ActDef {
  name: string; biome: string; bossBiome: string; tune: string; bossTune: string;
  boss: FoeType; bossName: string; epithet: string; roster: FoeType[]; tough: FoeType[];
  liquid: number; trees: boolean; blurb: string;
}
export const ACTS: ActDef[] = [
  { name: 'The Greenwood', biome: 'greenwood', bossBiome: 'elderglen', tune: 'stormwood', bossTune: 'stormstag', boss: 'stag', bossName: 'The Old Stag', epithet: 'The Greenwood\u2019s eldest', roster: ['boar', 'thornling', 'xbow', 'wolf'], tough: ['hag'], liquid: T_WATER, trees: true, blurb: 'Spellfire in the birches. Something old waits in the ring of oaks.' },
  { name: 'The Bone Cellars', biome: 'cellars', bossBiome: 'catacombs', tune: 'cellars', bossTune: 'forges', boss: 'warden', bossName: 'The Bone Warden', epithet: 'Keeper of the ossuary keys', roster: ['ghoul', 'spitter', 'xbow', 'ghoul'], tough: ['necro', 'bellringer'], liquid: T_BOG, trees: false, blurb: 'Down the stair, into the ossuary. The dead keep their own hours here.' },
  { name: 'The Frost Ossuary', biome: 'frost', bossBiome: 'frost', tune: 'frost', bossTune: 'starfall', boss: 'lich', bossName: 'The Frost Lich', epithet: 'The cold that counts', roster: ['wight', 'wisp', 'ghoul', 'shade'], tough: ['gargoyle', 'bellringer'], liquid: T_ICE, trees: false, blurb: 'Ice underfoot: you slide. The cold has a voice, and it is counting.' },
  { name: 'The Clockwork Forges', biome: 'forges', bossBiome: 'forges', tune: 'forges', bossTune: 'catacombs', boss: 'orrery', bossName: 'The Brass Orrery', epithet: 'A heaven made of gears', roster: ['automaton', 'gearspider', 'slag', 'gearspider'], tough: ['anvil', 'automaton'], liquid: T_LAVA, trees: false, blurb: 'Hammers that ring without hands. Everything here turns, and everything that turns fires.' },
  { name: 'The Bloodmoon Cathedral', biome: 'cathedral', bossBiome: 'cathedral', tune: 'abbey', bossTune: 'cathedral', boss: 'choir', bossName: 'The Red Choir', epithet: 'A hymn of knives', roster: ['cultist', 'imp', 'flagellant', 'wisp'], tough: ['bloodarcher', 'necro'], liquid: T_BLOOD, trees: false, blurb: 'The bells ring for you. Every hymn here is a pattern of knives.' },
  { name: 'The Hollow Throne', biome: 'throne', bossBiome: 'throne', tune: 'throne', bossTune: 'throne', boss: 'king', bossName: 'The Hollow King', epithet: 'King of nothing', roster: [], tough: [], liquid: T_LAVA, trees: false, blurb: 'At the bottom of everything, a crown with nothing under it.' },
];
export const ROOMS_PER_ACT = 3;

// ------------------------------------------------------------------ foes, as data
type Pat =
  | { kind: 'ring'; n: number; speed: number; rot?: number; alt?: boolean; color?: number }
  | { kind: 'aimed'; n: number; spread: number; speed: number; color?: number }
  | { kind: 'spiral'; arms: number; speed: number; turn: number; color?: number; counter?: boolean }
  | { kind: 'gapring'; n: number; speed: number; gap: number; color?: number }
  | { kind: 'lob'; speed: number; color?: number }
  | { kind: 'homing'; n: number; speed: number; turn: number; color?: number }
  | { kind: 'beam'; n: number; warn: number; dur: number; rot?: number; aim?: boolean; color?: number }
  | { kind: 'curtain'; n: number; speed: number; color?: number }
  | { kind: 'summon'; type: FoeType; n: number; cap: number }
  | { kind: 'charge'; speed: number; wind: number; slam?: number }
  | { kind: 'teleport' }
  | { kind: 'orbitals'; n: number; rad: number; spin: number; life: number; speed: number; color?: number }
  | { kind: 'mine'; color?: number };
/** Fired on the music: every `every` eighth notes (offset by `at`). */
type BeatPat = Pat & { every: number; at?: number };
/** Fired on a clock: every `secs` seconds. */
type TimedPat = Pat & { secs: number };
type Move = 'chase' | 'keep' | 'drift' | 'still' | 'swarm' | 'pace' | 'wander' | 'sleep' | 'flee';
interface FoeDef { hp: number; r: number; speed: number; move: Move; keep?: number; beat?: BeatPat[]; timed?: TimedPat[]; cinders: number }
interface Phase { until: number; beat: BeatPat[]; timed: TimedPat[]; move?: Move }
interface BossDef { hp: number; r: number; speed: number; phases: Phase[]; cinders: number }

const FOES: Partial<Record<FoeType, FoeDef>> = {
  // act I
  boar: { hp: 34, r: 11, speed: 70, move: 'chase', timed: [{ kind: 'charge', secs: 2.8, speed: 390, wind: 0.6 }], cinders: 2 },
  thornling: { hp: 26, r: 9, speed: 38, move: 'drift', beat: [{ kind: 'ring', every: 8, n: 8, speed: 95, rot: 0.2 }], cinders: 2 },
  xbow: { hp: 30, r: 10, speed: 60, move: 'keep', keep: 240, timed: [{ kind: 'aimed', secs: 2.1, n: 3, spread: 0.17, speed: 175, color: 0xff6a4a }], cinders: 2 },
  wolf: { hp: 22, r: 10, speed: 120, move: 'swarm', cinders: 1 },
  hag: { hp: 90, r: 12, speed: 36, move: 'wander', beat: [{ kind: 'spiral', every: 2, arms: 2, speed: 105, turn: 0.32, color: 0xc890ff }, { kind: 'aimed', every: 16, at: 8, n: 5, spread: 0.16, speed: 150, color: 0xc890ff }], cinders: 6 },
  // act II
  ghoul: { hp: 24, r: 10, speed: 105, move: 'swarm', cinders: 1 },
  spitter: { hp: 30, r: 10, speed: 50, move: 'keep', keep: 220, timed: [{ kind: 'lob', secs: 2.6, speed: 230, color: 0x9cff5a }], cinders: 2 },
  necro: { hp: 70, r: 11, speed: 40, move: 'keep', keep: 300, timed: [{ kind: 'summon', secs: 5, type: 'ghoul', n: 2, cap: 7 }], beat: [{ kind: 'aimed', every: 8, n: 3, spread: 0.25, speed: 130, color: 0x9a7aff }], cinders: 6 },
  bellringer: { hp: 80, r: 12, speed: 25, move: 'still', beat: [{ kind: 'gapring', every: 16, n: 28, speed: 105, gap: 5, color: 0xffd06a }], cinders: 6 },
  // act III
  wight: { hp: 40, r: 11, speed: 55, move: 'chase', beat: [{ kind: 'aimed', every: 8, n: 3, spread: 0.3, speed: 120, color: 0x9fe0ff }], cinders: 2 },
  wisp: { hp: 20, r: 9, speed: 60, move: 'drift', beat: [{ kind: 'homing', every: 16, n: 1, speed: 95, turn: 1.4, color: 0xbfe8ff }], cinders: 2 },
  gargoyle: { hp: 110, r: 13, speed: 85, move: 'sleep', beat: [{ kind: 'ring', every: 8, n: 12, speed: 120, alt: true, color: 0xa8a8b8 }], cinders: 7 },
  shade: { hp: 30, r: 10, speed: 40, move: 'wander', timed: [{ kind: 'teleport', secs: 3.2 }, { kind: 'aimed', secs: 3.2, n: 5, spread: 0.2, speed: 160, color: 0x8a6aff }], cinders: 3 },
  // act IV
  cultist: { hp: 34, r: 10, speed: 45, move: 'drift', beat: [{ kind: 'spiral', every: 2, arms: 3, speed: 90, turn: 0.24, color: 0xff4a6a }], cinders: 3 },
  bloodarcher: { hp: 40, r: 10, speed: 55, move: 'keep', keep: 280, timed: [{ kind: 'beam', secs: 3.4, n: 1, warn: 0.9, dur: 0.35, aim: true, color: 0xff2a4a }], cinders: 4 },
  imp: { hp: 22, r: 9, speed: 60, move: 'wander', timed: [{ kind: 'teleport', secs: 2.4 }, { kind: 'ring', secs: 2.4, n: 10, speed: 120, color: 0xff8a3a }], cinders: 3 },
  flagellant: { hp: 50, r: 11, speed: 65, move: 'chase', timed: [{ kind: 'charge', secs: 3, speed: 420, wind: 0.55, slam: 8 }], cinders: 3 },
  // summoned by the King
  ashling: { hp: 18, r: 9, speed: 115, move: 'swarm', cinders: 1 },
  // act IV: the Clockwork Forges
  automaton: { hp: 55, r: 11, speed: 45, move: 'keep', keep: 250, beat: [{ kind: 'ring', every: 8, n: 10, speed: 110, rot: 0.3, color: 0xd8a84a }], cinders: 3 },
  gearspider: { hp: 22, r: 9, speed: 110, move: 'swarm', timed: [{ kind: 'mine', secs: 2.2, color: 0xffa040 }], cinders: 2 },
  slag: { hp: 45, r: 11, speed: 40, move: 'keep', keep: 220, timed: [{ kind: 'lob', secs: 2.4, speed: 220, color: 0xff6a1a }], cinders: 3 },
  anvil: { hp: 120, r: 13, speed: 30, move: 'still', beat: [{ kind: 'gapring', every: 16, n: 30, speed: 100, gap: 5, color: 0xc8c8d0 }, { kind: 'orbitals', every: 16, at: 8, n: 6, rad: 34, spin: 3, life: 1.4, speed: 120, color: 0xd8a84a }], cinders: 7 },
  // the prologue's practice target
  dummy: { hp: 26, r: 10, speed: 0, move: 'still', cinders: 2 },
  // a twist: runs from you with a sack of cinders
  thief: { hp: 70, r: 9, speed: 125, move: 'flee', cinders: 30 },
  // a room's furniture: a brazier that never moves and spits fire on the beat
  brazier: { hp: 70, r: 12, speed: 0, move: 'still', beat: [{ kind: 'spiral', every: 2, arms: 4, speed: 80, turn: 0.27, color: 0xff7a2a }], cinders: 5 },
};

const C = { gold: 0xffd06a, ember: 0xff8a3a, leaf: 0x9cff5a, bone: 0xe8e0c8, frost: 0x9fe0ff, blood: 0xff3a5a, void: 0xb48cff, ash: 0xff5a2a };
const BOSSES: Partial<Record<FoeType, BossDef>> = {
  stag: { hp: 1300, r: 22, speed: 55, cinders: 40, phases: [
    { until: 0.66, beat: [{ kind: 'ring', every: 4, n: 14, speed: 100, alt: true, color: C.gold }], timed: [{ kind: 'charge', secs: 7, speed: 420, wind: 1.0, slam: 10 }] },
    { until: 0.33, beat: [{ kind: 'spiral', every: 1, arms: 3, speed: 120, turn: 0.21, color: 0xffb04a }, { kind: 'aimed', every: 8, n: 5, spread: 0.13, speed: 175, color: 0xff6a3a }], timed: [{ kind: 'charge', secs: 5, speed: 430, wind: 0.9, slam: 12 }] },
    { until: 0, beat: [{ kind: 'spiral', every: 2, arms: 3, speed: 115, turn: 0.2, color: C.ember }, { kind: 'spiral', every: 2, at: 1, arms: 3, speed: 105, turn: 0.2, counter: true, color: C.gold }, { kind: 'ring', every: 8, n: 16, speed: 90, color: 0xff4a2a }], timed: [{ kind: 'charge', secs: 5.5, speed: 440, wind: 0.9, slam: 14 }] },
  ] },
  warden: { hp: 1550, r: 22, speed: 45, cinders: 50, phases: [
    { until: 0.66, beat: [{ kind: 'gapring', every: 8, n: 32, speed: 95, gap: 5, color: C.bone }, { kind: 'aimed', every: 4, at: 2, n: 3, spread: 0.2, speed: 150, color: 0xc8b89a }], timed: [{ kind: 'summon', secs: 7, type: 'ghoul', n: 2, cap: 4 }] },
    { until: 0.33, beat: [{ kind: 'beam', every: 16, n: 4, warn: 1, dur: 0.6, rot: Math.PI / 8, color: 0xffe0a0 }, { kind: 'ring', every: 4, n: 12, speed: 110, alt: true, color: C.bone }], timed: [{ kind: 'summon', secs: 8, type: 'ghoul', n: 2, cap: 4 }] },
    { until: 0, beat: [{ kind: 'gapring', every: 4, n: 34, speed: 120, gap: 5, color: C.bone }, { kind: 'beam', every: 16, at: 8, n: 6, warn: 1, dur: 0.5, rot: Math.PI / 6, color: 0xffe0a0 }, { kind: 'aimed', every: 8, at: 4, n: 7, spread: 0.12, speed: 190, color: 0xff9a6a }], timed: [] },
  ] },
  lich: { hp: 2350, r: 20, speed: 40, cinders: 60, phases: [
    { until: 0.66, beat: [{ kind: 'homing', every: 8, n: 3, speed: 90, turn: 0.85, color: C.frost }, { kind: 'spiral', every: 2, arms: 4, speed: 85, turn: 0.13, color: 0xbfe8ff }], timed: [{ kind: 'teleport', secs: 6 }] },
    { until: 0.33, beat: [{ kind: 'beam', every: 8, n: 1, warn: 0.8, dur: 0.4, aim: true, color: 0xbfffff }, { kind: 'ring', every: 8, at: 4, n: 18, speed: 100, alt: true, color: C.frost }, { kind: 'spiral', every: 2, arms: 2, speed: 95, turn: 0.2, color: 0xbfe8ff }], timed: [{ kind: 'teleport', secs: 5 }] },
    { until: 0, beat: [{ kind: 'curtain', every: 8, n: 14, speed: 95, color: 0xe8f4ff }, { kind: 'homing', every: 8, at: 4, n: 2, speed: 100, turn: 1.0, color: C.frost }, { kind: 'spiral', every: 2, arms: 4, speed: 90, turn: 0.2, color: 0xbfe8ff }], timed: [{ kind: 'teleport', secs: 4.5 }] },
  ] },
  choir: { hp: 2400, r: 22, speed: 40, cinders: 70, phases: [
    { until: 0.66, beat: [{ kind: 'curtain', every: 4, n: 16, speed: 85, color: C.blood }, { kind: 'aimed', every: 8, at: 2, n: 5, spread: 0.15, speed: 170, color: 0xff8a9a }], timed: [] },
    { until: 0.33, beat: [{ kind: 'beam', every: 8, n: 3, warn: 0.9, dur: 0.5, rot: 0.5, color: 0xff4a6a }, { kind: 'ring', every: 2, n: 16, speed: 100, alt: true, color: C.blood }], timed: [] },
    { until: 0, beat: [{ kind: 'spiral', every: 1, arms: 3, speed: 105, turn: 0.19, color: C.blood }, { kind: 'spiral', every: 1, arms: 3, speed: 90, turn: 0.19, counter: true, color: 0xffb0c0 }, { kind: 'ring', every: 8, n: 24, speed: 80, color: 0xff2a3a }, { kind: 'curtain', every: 16, at: 8, n: 12, speed: 90, color: C.blood }], timed: [] },
  ] },
  king: { hp: 3400, r: 24, speed: 50, cinders: 0, phases: [
    { until: 0.75, beat: [{ kind: 'gapring', every: 8, n: 30, speed: 105, gap: 5, color: C.ash }, { kind: 'homing', every: 16, at: 4, n: 2, speed: 95, turn: 1.3, color: C.void }], timed: [{ kind: 'summon', secs: 7, type: 'ashling', n: 3, cap: 6 }] },
    { until: 0.5, beat: [{ kind: 'beam', every: 16, n: 4, warn: 1, dur: 0.55, rot: Math.PI / 8, color: 0xffb060 }, { kind: 'spiral', every: 1, arms: 3, speed: 110, turn: 0.2, color: C.ash }], timed: [{ kind: 'charge', secs: 6, speed: 460, wind: 0.85, slam: 16 }] },
    { until: 0.25, beat: [{ kind: 'curtain', every: 8, n: 16, speed: 95, color: C.void }, { kind: 'ring', every: 4, n: 18, speed: 110, alt: true, color: C.ash }, { kind: 'aimed', every: 8, at: 2, n: 5, spread: 0.13, speed: 190, color: 0xffd06a }], timed: [{ kind: 'teleport', secs: 4.5 }] },
    { until: 0, beat: [{ kind: 'spiral', every: 1, arms: 2, speed: 125, turn: 0.17, color: C.ash }, { kind: 'spiral', every: 1, arms: 2, speed: 110, turn: 0.17, counter: true, color: C.void }, { kind: 'gapring', every: 8, n: 36, speed: 115, gap: 6, color: C.gold }, { kind: 'beam', every: 16, at: 8, n: 2, warn: 0.9, dur: 0.5, aim: true, color: 0xff4a2a }], timed: [{ kind: 'summon', secs: 9, type: 'ashling', n: 2, cap: 4 }, { kind: 'teleport', secs: 5.5 }] },
  ] },
  orrery: { hp: 2300, r: 22, speed: 40, cinders: 65, phases: [
    { until: 0.66, beat: [{ kind: 'orbitals', every: 8, n: 8, rad: 60, spin: 2, life: 2.4, speed: 135, color: 0xffd06a }, { kind: 'ring', every: 4, at: 2, n: 10, speed: 100, rot: 0.2, color: 0xd8a84a }, { kind: 'aimed', every: 8, at: 6, n: 3, spread: 0.18, speed: 165, color: 0xff8a3a }, { kind: 'gapring', every: 16, at: 12, n: 30, speed: 105, gap: 5, color: 0xc8c8d0 }], timed: [{ kind: 'summon', secs: 12, type: 'gearspider', n: 1, cap: 2 }] },
    { until: 0.33, beat: [{ kind: 'orbitals', every: 16, n: 10, rad: 50, spin: 2.5, life: 2, speed: 130, color: 0xffd06a }, { kind: 'orbitals', every: 16, at: 4, n: 14, rad: 95, spin: -1.8, life: 2.6, speed: 110, color: 0x8ad0ff }, { kind: 'aimed', every: 8, at: 2, n: 5, spread: 0.14, speed: 175, color: 0xff8a3a }, { kind: 'beam', every: 16, at: 12, n: 2, warn: 1, dur: 0.5, rot: 0.6, color: 0xffd06a }], timed: [] },
    { until: 0, beat: [{ kind: 'orbitals', every: 4, n: 12, rad: 70, spin: 3, life: 1.6, speed: 150, color: 0xffd06a }, { kind: 'spiral', every: 1, arms: 3, speed: 100, turn: 0.19, color: 0xd8a84a }, { kind: 'gapring', every: 16, at: 8, n: 34, speed: 115, gap: 5, color: 0x8ad0ff }], timed: [{ kind: 'summon', secs: 9, type: 'gearspider', n: 2, cap: 4 }] },
  ] },
  // waits at the bottom of the Abyss: the book that was never written
  unwritten: { hp: 6000, r: 22, speed: 45, cinders: 0, phases: [
    { until: 0.75, beat: [{ kind: 'curtain', every: 4, n: 18, speed: 90, color: 0xe8e0c8 }, { kind: 'homing', every: 16, at: 8, n: 3, speed: 95, turn: 1.4, color: 0x6a5aff }], timed: [{ kind: 'teleport', secs: 5 }] },
    { until: 0.5, beat: [{ kind: 'gapring', every: 4, n: 34, speed: 115, gap: 5, color: 0xffffff }, { kind: 'beam', every: 16, n: 5, warn: 1, dur: 0.5, rot: 0.4, color: 0x9a8aff }], timed: [{ kind: 'summon', secs: 8, type: 'shade', n: 2, cap: 4 }] },
    { until: 0.25, beat: [{ kind: 'spiral', every: 1, arms: 4, speed: 115, turn: 0.15, color: 0xe8e0c8 }, { kind: 'spiral', every: 1, arms: 4, speed: 100, turn: 0.15, counter: true, color: 0x6a5aff }, { kind: 'aimed', every: 8, n: 7, spread: 0.11, speed: 200, color: 0xffd06a }], timed: [{ kind: 'charge', secs: 6, speed: 480, wind: 0.8, slam: 20 }] },
    { until: 0, beat: [{ kind: 'curtain', every: 8, n: 20, speed: 100, color: 0xffffff }, { kind: 'gapring', every: 8, at: 4, n: 40, speed: 125, gap: 6, color: 0x6a5aff }, { kind: 'ring', every: 2, n: 12, speed: 120, alt: true, color: 0xe8e0c8 }, { kind: 'beam', every: 16, at: 12, n: 3, warn: 0.9, dur: 0.5, aim: true, color: 0xff4a6a }], timed: [{ kind: 'teleport', secs: 4 }] },
  ] },
};
/** The boss of the current act: the Hollow King, or deeper in the Abyss, something worse. */
export function bossOf(w: StormWorld): { type: FoeType; name: string } {
  const act = ACTS[w.act];
  if (w.act === ACTS.length - 1 && w.loop >= 1) return { type: 'unwritten', name: 'The Unwritten Page' };
  return { type: act.boss, name: act.bossName };
}
export const BOSS_TYPES = Object.keys(BOSSES) as FoeType[];
export const isBossType = (t: FoeType) => t in BOSSES;
const def = (f: Foe): FoeDef => FOES[f.type]!;
const phaseOf = (f: Foe): Phase | null => {
  const b = BOSSES[f.type];
  if (!b) return null;
  const k = f.hp / f.maxHp;
  for (const p of b.phases) if (k > p.until) return p;
  return b.phases[b.phases.length - 1];
};

// ------------------------------------------------------------------ arena
function makeArena(w: StormWorld, boss: boolean): number[][] {
  const act = ACTS[w.act];
  const map: number[][] = [];
  for (let y = 0; y < MH; y++) map.push(Array.from({ length: MW }, (_, x) => (x === 0 || y === 0 || x === MW - 1 || y === MH - 1 ? T_WALL : T_FLOOR)));
  for (let i = 0; i < 26; i++) {
    const side = Math.floor(rand(w) * 4), k = Math.floor(rand(w) * (side < 2 ? MW : MH));
    if (side === 0) map[1][k] = T_WALL; else if (side === 1) map[MH - 2][k] = T_WALL; else if (side === 2) map[k][1] = T_WALL; else map[k][MW - 2] = T_WALL;
  }
  const put = (x: number, y: number, t: number) => { if (x > 1 && y > 1 && x < MW - 2 && y < MH - 2 && map[y][x] === T_FLOOR) map[y][x] = t; };
  // the player's spawn (bottom middle) is always kept clear
  const putL = (x: number, y: number, t = T_WALL) => { if (!(Math.abs(x - MW / 2) <= 2 && y >= MH - 6)) put(x, y, t); };
  if (!boss) w.layout = act.trees ? pick(w, ['groves', 'groves', 'open', 'grid', 'cross'] as Layout[]) : pick(w, ['groves', 'cross', 'ring', 'corridors', 'grid', 'open'] as Layout[]);
  const cx = MW / 2, cy = Math.floor(MH / 2) - 1;
  if (!boss && w.layout === 'cross') {
    for (let x = cx - 7; x <= cx + 6; x++) if (Math.abs(x - cx + 0.5) > 1.5) putL(x, cy);
    for (let y = cy - 5; y <= cy + 4; y++) if (Math.abs(y - cy) > 1) { putL(cx - 1, y); putL(cx, y); }
  } else if (!boss && w.layout === 'ring') {
    for (let x = cx - 6; x <= cx + 5; x++) for (const y of [cy - 4, cy + 4]) if (Math.abs(x - cx + 0.5) > 1.5) putL(x, y);
    for (let y = cy - 4; y <= cy + 4; y++) for (const x of [cx - 6, cx + 5]) if (Math.abs(y - cy) > 1) putL(x, y);
    putL(cx - 1, cy); putL(cx, cy);
  } else if (!boss && w.layout === 'corridors') {
    for (const y of [5, MH - 8]) for (let x = 3; x < MW - 3; x++) if ((x + y) % 9 > 2) putL(x, y);
  } else if (!boss && w.layout === 'grid') {
    for (let y = 3; y < MH - 4; y += 4) for (let x = 4 + ((y / 4) % 2) * 2; x < MW - 3; x += 5) putL(x, y);
  } else if (!boss && w.layout === 'groves') {
    // cover: groves in the forest, pillars elsewhere (mirrored, so rooms feel built)
    const n = 3 + Math.floor(rand(w) * 3);
    for (let g = 0; g < n; g++) {
      const gx = 4 + Math.floor(rand(w) * (MW / 2 - 6)), gy = 3 + Math.floor(rand(w) * (MH - 7));
      if (Math.abs(gy - (MH - 4)) < 2) continue;
      const shape = act.trees ? (rand(w) < 0.5 ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0], [2, 0]]) : rand(w) < 0.5 ? [[0, 0]] : [[0, 0], [1, 0], [0, 1], [1, 1]];
      for (const [dx, dy] of shape) { put(gx + dx, gy + dy, T_WALL); if (!act.trees) put(MW - 1 - (gx + dx), gy + dy, T_WALL); }
    }
    // the act's ground: a stream, bog, ice sheets, blood pools
    if (act.liquid === T_WATER && rand(w) < 0.7) { const sy = 3 + Math.floor(rand(w) * (MH - 7)); for (let x = 2; x < MW - 2; x++) if (rand(w) < 0.85) put(x, sy, T_WATER); }
    else if (act.liquid !== T_WATER && act.liquid !== T_LAVA) {
      for (let k = 0; k < 4; k++) {
        const cx = 4 + Math.floor(rand(w) * (MW - 8)), cy = 3 + Math.floor(rand(w) * (MH - 7)), rr = 1 + Math.floor(rand(w) * 2.5);
        for (let y = -rr; y <= rr; y++) for (let x = -rr - 1; x <= rr + 1; x++) if (x * x * 0.7 + y * y <= rr * rr + 0.5) put(cx + x, cy + y, act.liquid);
      }
    }
  } else {
    const pillars = act.trees ? [[8, 5], [MW - 9, 5], [8, MH - 6], [MW - 9, MH - 6]] : [[6, 4], [MW - 7, 4], [6, MH - 5], [MW - 7, MH - 5], [MW / 2 - 1, 8]];
    for (const [x, y] of pillars) { put(x, y, T_WALL); put(x + 1, y, T_WALL); }
    // lava runs along the top and down the far sides, never right under where you arrive
    if (act.liquid === T_LAVA) { for (let x = 2; x < MW - 2; x++) put(x, 2, T_LAVA); for (let y = 3; y < MH - 5; y++) { put(2, y, T_LAVA); put(MW - 3, y, T_LAVA); } }
    if (act.liquid === T_ICE) for (let y = 5; y < MH - 4; y++) for (let x = 10; x < MW - 10; x++) if ((x + y) % 7 < 3) put(x, y, T_ICE);
  }
  return map;
}

const tileAt = (w: StormWorld, x: number, y: number) => w.map[Math.floor(y / TILE)]?.[Math.floor(x / TILE)] ?? T_WALL;
export const isWall = (w: StormWorld, x: number, y: number) => tileAt(w, x, y) === T_WALL;
const blocked = (w: StormWorld, x: number, y: number, r: number) =>
  isWall(w, x - r, y - r) || isWall(w, x + r, y - r) || isWall(w, x - r, y + r) || isWall(w, x + r, y + r);

/** Move a body, sliding along walls. Returns false if it couldn't move at all. */
function slide(w: StormWorld, b: { x: number; y: number; r: number }, dx: number, dy: number) {
  const ox = b.x, oy = b.y;
  if (!blocked(w, b.x + dx, b.y, b.r)) b.x += dx;
  if (!blocked(w, b.x, b.y + dy, b.r)) b.y += dy;
  return b.x !== ox || b.y !== oy;
}
function freeSpot(w: StormWorld, r: number, farFrom: { x: number; y: number }, minD: number, top = false) {
  let x = AW / 2, y = AH / 2;
  for (let i = 0; i < 60; i++) {
    x = TILE * 2.5 + rand(w) * (AW - TILE * 5);
    y = TILE * 2.5 + rand(w) * (top ? AH * 0.55 : AH - TILE * 5);
    if (!blocked(w, x, y, r + 4) && tileAt(w, x, y) !== T_LAVA && Math.hypot(x - farFrom.x, y - farFrom.y) > minD) break;
  }
  return { x, y };
}

// ------------------------------------------------------------------ run setup
export interface RunOpts { seed: number; diff?: Difficulty; endless?: boolean; cls?: ClassId; rush?: boolean; perks?: Perks; pacts?: string[]; mutators?: string[]; rescued?: string[]; bell?: boolean }
export function newRun(seed: number | RunOpts): StormWorld {
  const o: RunOpts = typeof seed === 'number' ? { seed } : seed;
  const diff = o.diff ?? 'normal';
  const cls = o.cls ?? 'spellwright';
  const C = CLASSES[cls];
  const hearts = DIFFICULTY[diff].hearts + C.hearts;
  const w: StormWorld = {
    seed: o.seed | 0, time: 0, map: [], diff, endless: !!o.endless, loop: 0, act: 0, room: 0, kind: 'fight',
    player: { x: AW / 2, y: AH / 2, vx: 0, vy: 0, r: 5, hp: hearts, maxHp: hearts, mana: 100, maxMana: 100, inv: 0, blinkCd: 0, cdA: 0, cdB: 0, face: 0, moving: false, dead: false, bombs: 2, cinders: 0, relics: [], shield: false, revived: false, volleys: 0, killsSince: 0, cls, speedMul: C.speed, dmgBonus: 0, stillT: 0, wardT: 0, xp: 0, level: 1, boons: {} },
    foes: [], bullets: [], hazards: [], pickups: [], fx: [], spells: [[...C.spells[0]], [...C.spells[1]]], waves: [], waveDelay: 0, cleared: false, nextId: 1, sounds: [], echoes: [],
    score: 0, stats: { kills: 0, shots: 0, hitsTaken: 0, grazes: 0, bosses: 0, rooms: 0, flawless: 0, bestNova: 0, secret: 0 }, bossHits: 0, won: false, rush: !!o.rush, familiars: [],
    encounter: '', twist: null, twistT: 0, lastTwist: null, layout: 'groves',
    heat: 0, combo: 0, comboT: 0, bestCombo: 0, overdrive: 0, pendingLevels: 0, waveClock: 0, auraT: 0, lastKill: 0,
    perks: { ...NO_PERKS, ...(o.perks ?? {}) }, pacts: [...(o.pacts ?? [])], mutators: [...(o.mutators ?? [])], rescued: [...(o.rescued ?? [])], rescue: null, bell: !!o.bell, truePath: false, phoenixUsed: false, scripted: false,
  };
  addRelic(w, C.relic);
  const pk = w.perks, p = w.player;
  p.maxHp = Math.max(1, p.maxHp + pk.hearts); p.hp = p.maxHp;
  p.dmgBonus += pk.dmg; p.bombs += pk.bombs; p.speedMul *= 1 + pk.speed;
  if (pk.relic) { const r = relicChoices(w, 1)[0]; if (r) addRelic(w, r); }
  enterRoom(w, 1, 'fight');
  return w;
}

const has = (w: StormWorld, relic: string) => w.player.relics.includes(relic);
/** How hard this stretch hits: deeper acts and later loops of the Abyss scale up. */
const depth = (w: StormWorld) => 1 + w.act * 0.12 + w.loop * 0.45;
/** Ordinary rooms climb in a sawtooth: a little hotter each room, and each act (bosses are tuned by hand). */
/** Per-boss pressure, measured by the playtest lab so each act's boss is a step up from the last. */
const BOSS_PRESSURE: Partial<Record<FoeType, number>> = { stag: 1, warden: 1, lich: 0.78, orrery: 1.6, choir: 0.88, king: 1.22, unwritten: 1.1 };
const climb = (w: StormWorld) => (w.kind === 'boss' ? BOSS_PRESSURE[bossOf(w).type] ?? 1 : 1 + w.act * 0.07 + Math.max(0, Math.min(3, w.room) - 1) * 0.06);
const bulletSpeed = (w: StormWorld) => DIFFICULTY[w.diff].speed * (1 + w.loop * 0.08) * (has(w, 'c_hurry') ? 1.12 : 1) * (1 + (climb(w) - 1) * 0.5) * (pact(w, 'haste') ? 1.15 : 1) * (mut(w, 'bullettime') ? 0.7 : 1);

/** Enter room `room` of the current act (4 = the boss). */
/** Enter room `room` (pass `twist` to choose the twist instead of rolling one: tests and debugging). */
export function enterRoom(w: StormWorld, room: number, kind?: RoomKind, twist?: Twist | null) {
  w.room = room;
  const act = ACTS[w.act];
  w.kind = w.rush || act.roster.length === 0 || room > ROOMS_PER_ACT ? 'boss' : kind ?? 'fight';
  if (w.kind === 'boss') w.room = ROOMS_PER_ACT + 1;
  w.map = makeArena(w, w.kind === 'boss');
  w.foes = []; w.bullets = []; w.hazards = []; w.pickups = []; w.echoes = []; w.cleared = false;
  w.combo = 0; w.comboT = 0; w.overdrive = 0; w.waveClock = 0; w.lastKill = w.time;
  const p = w.player;
  p.x = AW / 2; p.y = AH - TILE * 3.5; p.vx = p.vy = 0; p.inv = 1.2;
  p.mana = p.maxMana;
  p.shield = has(w, 'ward');
  w.waves = [];
  if (w.kind === 'boss') {
    w.waves = [[{ type: bossOf(w).type, elite: false }]];
    if (!w.rush && !pact(w, 'norest') && p.hp < p.maxHp) { p.hp++; w.fx.push({ kind: 'text', x: p.x, y: p.y - 30, color: 0xff6a7a, t: w.time, dur: 1.6, text: 'A moment\u2019s rest: +1 heart' }); }
  }
  w.encounter = ''; w.twist = null; w.twistT = 0; w.rescue = null;
  if (w.kind === 'rescue') {
    w.kind = 'elite';
    w.rescue = CAPTIVES[w.act] ?? null;
    const t = act.tough.length ? act.tough : act.roster;
    w.waves = [[{ type: pick(w, act.roster), elite: false }, { type: pick(w, act.roster), elite: false }, { type: pick(w, t), elite: false }], [{ type: pick(w, t), elite: true }, { type: pick(w, act.roster), elite: false }, { type: pick(w, act.roster), elite: false }]];
    w.encounter = 'The Jailers';
  } else if (w.kind === 'fight' || w.kind === 'elite') {
    const n = 3 + Math.min(3, w.act) + (room > 1 ? 1 : 0);
    const encs = ENCOUNTERS[w.act];
    if (encs) {
      // a named squad, topped up to this depth's numbers with its own kind
      const enc = pick(w, encs);
      w.encounter = enc.name;
      for (let wave = 0; wave < 2; wave++) {
        const kinds = enc.waves[wave], list = kinds.map((type) => ({ type, elite: false }));
        while (list.length < n - (wave === 0 ? 1 : 0)) list.push({ type: pick(w, kinds), elite: false });
        w.waves.push(list);
      }
    } else for (let wave = 0; wave < 2; wave++) {
      const list: { type: FoeType; elite: boolean }[] = [];
      for (let i = 0; i < n - (wave === 0 ? 1 : 0); i++) list.push({ type: rand(w) < 0.22 + room * 0.06 && act.tough.length ? pick(w, act.tough) : pick(w, act.roster), elite: false });
      w.waves.push(list);
    }
    if (w.kind === 'elite') w.waves[1].push({ type: pick(w, [...act.tough, ...act.roster]), elite: true });
    // most rooms get a twist, never the same one twice running
    if (twist !== undefined) { if (twist) applyTwist(w, twist); }
    else if (mut(w, 'champions')) applyTwist(w, 'champions');
    else if (mut(w, 'swarm')) applyTwist(w, 'horde');
    else if (rand(w) < (w.kind === 'elite' ? 0.85 : 0.75)) {
      const pool: Twist[] = w.kind === 'elite' ? ['duel', 'champions', 'ambush', 'meteors', 'blades'] : ['ambush', 'horde', 'siege', 'meteors', 'blades', 'thief', 'champions', 'ambush', 'horde'];
      let t = pick(w, pool);
      for (let i = 0; i < 6 && t === w.lastTwist; i++) t = pick(w, pool);
      applyTwist(w, t);
    }
    w.lastTwist = w.twist;
    // deeper down, rooms come furnished: braziers that spit fire, and spike traps in the floor
    if (w.act >= 1 && rand(w) < 0.55) for (let i = 0, n = 1 + Math.floor(rand(w) * 2); i < n; i++) w.waves[0].push({ type: 'brazier', elite: false });
    // spike traps: never in an act's first room, and fewer of them
    if (w.act >= 1 && room > 1) {
      for (let k = 0, n = 1 + Math.floor(rand(w) * 3); k < n; k++) {
        const tx = 3 + Math.floor(rand(w) * (MW - 7)), ty = 3 + Math.floor(rand(w) * (MH - 9)), off = rand(w) * 3;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (w.map[ty + dy][tx + dx] === T_FLOOR) w.hazards.push({ kind: 'spikes', x: (tx + dx) * TILE + 16, y: (ty + dy) * TILE + 16, r: 15, ang: off, len: 0, warn: 0, life: Infinity, t: 0, color: 0xc8c8d0 });
      }
    }
  }
  if (!w.waves.length) w.cleared = true;
  w.waveDelay = 0.6;
}

function applyTwist(w: StormWorld, t: Twist) {
  w.twist = t;
  const act = ACTS[w.act];
  switch (t) {
    case 'horde': w.waves = w.waves.map((l) => [...l, ...l]); break;
    case 'duel': {
      // a duel is one-on-one: no summoners hiding behind their minions
      const pool = [...act.tough, ...act.roster].filter((t) => t !== 'necro');
      const type = pick(w, pool.length ? pool : act.roster);
      w.waves = [[{ type, elite: true }]];
      w.encounter = `${pick(w, CHAMP_NAMES)} ${pick(w, CHAMP_TITLES)}`;
      break;
    }
    case 'champions': w.waves = w.waves.map((l) => l.slice(0, Math.max(1, Math.ceil(l.length / 3))).map((x) => ({ ...x, elite: true }))); break;
    case 'siege': w.waves = [w.waves[0]]; w.twistT = 22; break;
    case 'meteors': w.twistT = 3; break;
    case 'thief': w.waves[0].push({ type: 'thief', elite: false }); w.twistT = 16; break;
    case 'blades': {
      const n = 2 + (w.act >= 3 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const a = rand(w) * Math.PI * 2, at = freeSpot(w, 12, w.player, 200, true);
        bullet(w, { x: at.x, y: at.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, r: 10, dmg: 1, life: 1e9, friendly: false, color: 0xd8d8e8, bounce: 1e9 });
      }
      break;
    }
    case 'ambush': break;
  }
}

/** After the boss: on to the next act (or the next loop of the Abyss). Returns false when the run is won. */
export function nextAct(w: StormWorld): boolean {
  if (w.act + 1 >= ACTS.length) {
    if (!w.endless) return false;
    w.loop++;
    w.act = 0;
  } else w.act++;
  w.player.bombs = 2 + (has(w, 'bombbag') ? 1 : 0);
  enterRoom(w, 1, 'fight');
  return true;
}

/** An act's route: room 1 is always a fight; rooms 2 and 3 offer branching choices; then the boss. */
export interface Route { rows: RoomKind[][]; edges: number[][]; at: number }
export function makeRoute(w: StormWorld): Route {
  const bag: RoomKind[] = ['fight', 'fight', 'elite', 'treasure', 'shrine', 'shop', 'event', 'event', 'fight', 'elite'];
  const fighty = (k: RoomKind) => k === 'fight' || k === 'elite' || k === 'rescue';
  const row2: RoomKind[] = [pick(w, bag), pick(w, bag), pick(w, bag)];
  const cap = CAPTIVES[w.act];
  if (cap && !w.rescued.includes(cap) && !w.rush && w.loop === 0) row2[Math.floor(rand(w) * 3)] = 'rescue';
  const row3: RoomKind[] = [pick(w, bag), pick(w, bag), pick(w, bag)];
  // the last row always has at least two fights in it, so the boss never comes cold
  let fights = row3.filter(fighty).length;
  for (let i = 0; fights < 2 && i < 3; i++) if (!fighty(row3[i])) { row3[i] = rand(w) < 0.7 ? 'fight' : 'elite'; fights++; }
  // row 2 node i leads to row 3 node i, and sometimes a neighbour too
  const edges: number[][] = row2.map((_, i) => { const e = [i]; if (rand(w) < 0.55) e.push(Math.max(0, Math.min(2, i + (rand(w) < 0.5 ? -1 : 1)))); return [...new Set(e)]; });
  // every row-2 room reaches at least one fight
  edges.forEach((e, i) => { if (!fighty(row2[i]) && !e.some((j) => fighty(row3[j]))) e.push(row3.findIndex(fighty)); });
  return { rows: [['fight'], row2, row3], edges, at: 0 };
}

/** Two doors to choose between after a room (the third room always leads to the boss). */
export function doorChoices(w: StormWorld): RoomKind[] {
  if (w.room >= ROOMS_PER_ACT) return ['boss'];
  const cap = CAPTIVES[w.act];
  if (cap && !w.rescued.includes(cap) && w.room === 1 && !w.rush && w.loop === 0) return ['rescue', pick(w, ['fight', 'elite', 'shop', 'treasure'] as RoomKind[])];
  const bag: RoomKind[] = ['fight', 'fight', 'elite', 'elite', 'treasure', 'shrine', 'shop', 'shop', 'event', 'event'];
  const a = pick(w, bag);
  let b = pick(w, bag);
  for (let i = 0; i < 8 && b === a; i++) b = pick(w, bag);
  // always offer at least one fight-like door, so cards keep coming
  if (a !== 'fight' && a !== 'elite' && b !== 'fight' && b !== 'elite') b = 'fight';
  return [a, b];
}

/** For scripted moments (the prologue): put a foe somewhere. */
export function spawnAt(w: StormWorld, type: FoeType, elite: boolean, at?: { x: number; y: number }) { spawnFoe(w, type, elite, at); return w.foes[w.foes.length - 1]; }
function spawnFoe(w: StormWorld, type: FoeType, elite: boolean, at?: { x: number; y: number }) {
  const boss = BOSSES[type];
  const fd = FOES[type];
  const base = boss ?? fd!;
  const hpMul = DIFFICULTY[w.diff].hp * depth(w) * ((elite || boss) && pact(w, 'iron') ? 1.3 : 1) * (mut(w, 'giants') && !boss ? 1.6 : 1) * (elite ? 3.2 : 1) * (boss ? 0.72 : w.twist === 'horde' ? 0.5 : w.twist === 'champions' ? 0.6 : w.twist === 'duel' ? 1.4 : 1);
  const r = base.r * (elite ? 1.3 : 1) * (mut(w, 'giants') && !boss ? 1.3 : 1);
  const p = at ?? (boss ? { x: AW / 2, y: TILE * 5 } : freeSpot(w, r, w.player, 230, true));
  const f: Foe = {
    id: w.nextId++, type, x: p.x, y: p.y, r, hp: base.hp * hpMul, maxHp: base.hp * hpMul, speed: base.speed * (elite ? 1.15 : 1),
    t: rand(w) * 2, state: 'spawn', st: boss ? 1.6 : at ? 0.4 : 0.6, vx: 0, vy: 0, slow: 0, burnT: 0, burnDps: 0, flash: 0,
    ang: rand(w) * Math.PI * 2, ang2: 0, boss: !!boss, elite, slam: 0, timers: [], phase: 0, stun: 0,
    affix: elite ? pick(w, Object.keys(AFFIXES) as Affix[]) : null,
  };
  if (f.affix === 'swift') f.speed *= 1.5;
  if (mut(w, 'giants') && !boss) f.speed *= 0.8;
  if (f.affix) w.fx.push({ kind: 'text', x: f.x, y: f.y - 30, color: 0xffd06a, t: w.time, dur: 2, text: w.twist === 'duel' ? w.encounter : `${AFFIXES[f.affix]} champion` });
  if (boss) w.bossHits = w.stats.hitsTaken;
  const timed = boss ? boss.phases.flatMap((ph) => ph.timed) : fd!.timed ?? [];
  f.timers = timed.map((tp) => tp.secs * (0.4 + rand(w) * 0.6));
  w.foes.push(f);
  w.fx.push({ kind: 'spawn', x: f.x, y: f.y, color: boss ? 0xffd06a : elite ? 0xffb020 : 0xff5a4a, t: w.time, dur: f.st, r: r * 2 });
}

// ------------------------------------------------------------------ bullets
function bullet(w: StormWorld, b: Partial<Bullet> & { x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number; friendly: boolean; color: number }) {
  const full: Bullet = {
    id: w.nextId++, age: 0, pierce: 0, chain: 0, homing: 0, burn: 0, slow: 0, orbit: null, burst: null, hit: [], hitT: [], wake: b.friendly ? 0 : 0.12,
    bounce: 0, boomer: false, cluster: false, gravity: false, tick: 0, wave: null, target: null, turret: null, lob: null, grazed: false, spin: 0,
    splinter: false, shock: false, siphon: 0, leech: 0, orbitFoe: null, ...b,
  };
  w.bullets.push(full);
  return full;
}
function foeShot(w: StormWorld, x: number, y: number, ang: number, speed: number, color = 0xff4a6a, r = 5, extra: Partial<Bullet> = {}) {
  const sp = speed * bulletSpeed(w);
  return bullet(w, { x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, r, dmg: 1, life: 10, friendly: false, color, ...extra });
}
const aimAt = (f: { x: number; y: number }, p: { x: number; y: number }) => Math.atan2(p.y - f.y, p.x - f.x);
const dens = (w: StormWorld, n: number) => Math.max(1, Math.round(n * DIFFICULTY[w.diff].density * (1 + w.loop * 0.12) * climb(w) * (pact(w, 'bloodmoon') ? 1.2 : 1) * (mut(w, 'bullettime') ? 1.4 : 1)));

/** Fire one of a foe's patterns. */
function runPat(w: StormWorld, f: Foe, pt: Pat) {
  const p = w.player;
  switch (pt.kind) {
    case 'ring': {
      const n = dens(w, pt.n);
      const off = f.ang + (pt.alt && Math.floor(w.time * 4) % 2 ? Math.PI / n : 0);
      for (let i = 0; i < n; i++) foeShot(w, f.x, f.y, off + (i / n) * Math.PI * 2, pt.speed, pt.color);
      f.ang += pt.rot ?? 0;
      break;
    }
    case 'aimed': {
      const n = dens(w, pt.n), a = aimAt(f, p);
      for (let i = 0; i < n; i++) foeShot(w, f.x, f.y, a + (i - (n - 1) / 2) * pt.spread, pt.speed, pt.color);
      w.sounds.push('shoot');
      break;
    }
    case 'spiral': {
      const arms = Math.max(1, Math.round(pt.arms * Math.min(1.35, DIFFICULTY[w.diff].density)));
      const base = pt.counter ? -f.ang2 : f.ang;
      for (let k = 0; k < arms; k++) foeShot(w, f.x, f.y, base + (k / arms) * Math.PI * 2, pt.speed, pt.color);
      if (pt.counter) f.ang2 += pt.turn; else f.ang += pt.turn;
      break;
    }
    case 'gapring': {
      // a wall of shots with one gap, placed near (not on) the way to you: move into it
      const n = dens(w, pt.n), gapAt = aimAt(f, p) + (rand(w) - 0.5) * 1.6;
      for (let i = 0; i < n; i++) {
        const a = gapAt + (i / n) * Math.PI * 2;
        const fromGap = Math.min(i, n - i);
        if (fromGap < pt.gap / 2) continue;
        foeShot(w, f.x, f.y, a, pt.speed, pt.color);
      }
      w.sounds.push('freeze');
      break;
    }
    case 'lob': {
      const a = aimAt(f, p), d = Math.min(380, Math.hypot(p.x - f.x, p.y - f.y));
      const b = foeShot(w, f.x, f.y, a, pt.speed, pt.color, 7);
      b.lob = { x: f.x + Math.cos(a) * d, y: f.y + Math.sin(a) * d };
      b.life = d / (pt.speed * bulletSpeed(w));
      break;
    }
    case 'homing':
      for (let i = 0; i < dens(w, pt.n); i++) { const b = foeShot(w, f.x, f.y, aimAt(f, p) + (i - (pt.n - 1) / 2) * 0.6, pt.speed, pt.color, 6); b.homing = pt.turn; b.life = 5; }
      break;
    case 'beam': {
      const base = pt.aim ? aimAt(f, p) : f.ang;
      for (let i = 0; i < pt.n; i++) w.hazards.push({ kind: 'beam', x: f.x, y: f.y, r: 9, ang: base + (i / pt.n) * Math.PI * 2, len: 1200, warn: pt.warn, life: pt.dur, t: 0, color: pt.color ?? 0xff4a4a });
      f.ang += pt.rot ?? 0;
      break;
    }
    case 'curtain': {
      // a falling sheet of shots with gaps that drift, sung down from the top of the room
      const n = dens(w, pt.n), off = rand(w) * (AW / n);
      for (let i = 0; i < n; i++) {
        const x = off + (i / n) * AW;
        const b = foeShot(w, x, TILE * 1.6, Math.PI / 2, pt.speed, pt.color);
        b.wave = { bx: x, by: TILE * 1.6, ux: 0, uy: 1 };
      }
      break;
    }
    case 'summon': {
      const kin = w.foes.filter((g) => g.type === pt.type).length;
      for (let i = 0; i < pt.n && kin + i < pt.cap; i++) {
        // somewhere open beside the summoner (never inside a wall)
        let at = { x: f.x, y: f.y };
        for (let tries = 0; tries < 12; tries++) {
          const c = { x: f.x + (rand(w) - 0.5) * 90, y: f.y + (rand(w) - 0.3) * 90 };
          if (!blocked(w, c.x, c.y, FOES[pt.type]!.r + 2)) { at = c; break; }
        }
        spawnFoe(w, pt.type, false, at);
      }
      break;
    }
    case 'charge':
      if (f.state === 'move') { f.state = 'wind'; f.st = pt.wind; f.vx = pt.speed; f.slam = pt.slam ?? 0; w.sounds.push(f.boss ? 'boom' : 'hit'); }
      break;
    case 'orbitals': {
      // planets: a ring of shots that circles the caster, then flies outward
      const n = dens(w, pt.n);
      for (let i = 0; i < n; i++) {
        const a = f.ang + (i / n) * Math.PI * 2;
        const b = foeShot(w, f.x + Math.cos(a) * pt.rad, f.y + Math.sin(a) * pt.rad, a, 0, pt.color, 6);
        b.orbitFoe = { id: f.id, ang: a, rad: pt.rad, spin: pt.spin, t: pt.life, speed: pt.speed * bulletSpeed(w) };
        b.life = pt.life + 8;
      }
      f.ang += 0.4;
      w.sounds.push('freeze');
      break;
    }
    case 'mine':
      w.hazards.push({ kind: 'pool', x: f.x, y: f.y, r: 20, ang: 0, len: 0, warn: 0, life: 2.6, t: 0, color: pt.color ?? 0xffa040 });
      break;
    case 'teleport': {
      const to = freeSpot(w, f.r, p, 160);
      w.fx.push({ kind: 'blink', x: f.x, y: f.y, color: 0x8a6aff, t: w.time, dur: 0.35, r: aimAt(f, to) });
      f.x = to.x; f.y = to.y;
      w.fx.push({ kind: 'spawn', x: f.x, y: f.y, color: 0x8a6aff, t: w.time, dur: 0.3, r: f.r * 2 });
      break;
    }
  }
}

function fireSpell(w: StormWorld, slot: 0 | 1, ang: number, s: SpellStats, isEcho = false) {
  const p = w.player;
  const dmgMul = (has(w, 'glass') ? 1.6 : 1) * (has(w, 'overflow') && p.mana > p.maxMana * 0.8 ? 1.35 : 1) * (1 + p.dmgBonus)
    * (has(w, 'dancer') && p.moving ? 1.25 : 1) * (has(w, 'stillwater') && p.stillT > 0.6 ? 1.6 : 1)
    * (1 + 0.15 * bn(w, 'might')) * comboMul(w) * (w.overdrive > 0 ? 1.5 : 1) * (mut(w, 'glass') ? 2 : 1);
  if (slot === 0 && bn(w, 'volley')) { s.count += bn(w, 'volley'); if (!s.spread) s.spread = 0.2; }
  s.speed *= 1 + 0.15 * bn(w, 'velocity'); s.size *= 1 + 0.3 * bn(w, 'girth'); s.pierce += bn(w, 'pierce'); s.dmg *= (1 + 0.08 * bn(w, 'girth')) * (1 + 0.1 * bn(w, 'pierce'));
  const n = s.count;
  const dirs = s.twin ? [ang, ang + Math.PI] : [ang];
  for (const base of dirs) for (let i = 0; i < n; i++) {
    const a = s.ring ? base + (i / n) * Math.PI * 2 : base + (n > 1 ? (i / (n - 1) - 0.5) * s.spread * (n > 3 ? 1.4 : 1) : 0);
    const b = bullet(w, {
      x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 10, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
      r: s.size, dmg: s.dmg * dmgMul, life: s.life, friendly: true, color: s.color, pierce: s.pierce, chain: s.chain, homing: s.homing,
      burn: s.burn, slow: s.slow, burst: s.burst ? { ...s.burst } : null, bounce: s.bounce, boomer: s.boomer, cluster: s.cluster, gravity: s.gravity, tick: s.tick,
      orbit: s.orbit || s.turret ? { t: s.turret ? s.life : 1.1, ang: a, rad: s.turret ? 44 + i * 10 : 30 + (i % 3) * 8, spin: s.turret ? 2.4 : 5 } : null,
      turret: s.turret ? { cd: 0.3, dmg: s.dmg * dmgMul } : null,
      splinter: s.splinter, shock: s.shock, siphon: s.siphon, leech: s.leech,
      spin: s.spiral ? (i % 2 ? -2.6 : 2.6) : 0,
    });
    if (bn(w, 'crit') && rand(w) < 0.1 * bn(w, 'crit')) { b.dmg *= 3; b.r *= 1.3; }
    if (s.wave) b.wave = { bx: b.x, by: b.y, ux: Math.cos(a), uy: Math.sin(a) };
    if (s.boom) {
      // meteors fall where you aim (a spread puts each a little apart)
      const d = Math.max(40, Math.min(520, Math.hypot(aimPt.x - p.x, aimPt.y - p.y)));
      const tx = p.x + Math.cos(a) * d, ty = p.y + Math.sin(a) * d;
      b.target = { x: tx, y: ty, boom: s.boom };
      b.life = d / s.speed + 0.05;
    }
  }
  w.stats.shots++;
  p.volleys++;
  w.sounds.push(slot === 0 ? 'shoot' : 'cast');
  if (!isEcho && (s.echo || (has(w, 'echostone') && p.volleys % 4 === 0))) w.echoes.push({ at: w.time + 0.2, slot, ang });
}
/** Quick kills stack a combo: +2% damage each, up to +60%. */
export const comboMul = (w: StormWorld) => 1 + Math.min(30, w.combo) * 0.02;
/** Where the player is aiming (meteors fall there). */
const aimPt = { x: 0, y: 0 };

// ------------------------------------------------------------------ the beat
/**
 * Called on every eighth note of the music. Foes and bosses fire their beat patterns in time with it,
 * so the patterns have a rhythm you can feel.
 */
export function onBeat(w: StormWorld, step: number) {
  if (w.player.dead) return;
  for (const f of [...w.foes]) {
    if (f.state === 'spawn' || f.state === 'sleep' || f.stun > 0) continue;
    const pats = f.boss ? phaseOf(f)!.beat : def(f).beat ?? [];
    for (const pt of pats) { const k = step - (pt.at ?? 0) + f.id * (f.boss ? 0 : 2); if (((k % pt.every) + pt.every) % pt.every === 0) runPat(w, f, pt); }
    if (f.elite && step % (f.affix === 'volleying' ? 8 : 16) === 8 % (f.affix === 'volleying' ? 8 : 16)) runPat(w, f, { kind: 'ring', n: 12, speed: 110, alt: true, color: 0xffb020 });
    if (f.affix === 'volleying' && step % 8 === 4) runPat(w, f, { kind: 'aimed', n: 5, spread: 0.15, speed: 170, color: 0xffb020 });
  }
}

// ------------------------------------------------------------------ one tick
export function update(w: StormWorld, inp: Input, dt = STEP) {
  w.time += dt;
  w.sounds.length = 0;
  const p = w.player;
  aimPt.x = inp.mx; aimPt.y = inp.my;
  const tile = tileAt(w, p.x, p.y);
  if (!p.dead) {
    // move (ice is slippery; water, bog and blood are slow; lava burns)
    let mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), my = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    const m = Math.hypot(mx, my);
    p.moving = m > 0;
    if (m) { mx /= m; my /= m; }
    const slowGround = tile === T_WATER || tile === T_BOG || tile === T_BLOOD;
    const sp = (inp.focus ? 85 : 175) * (slowGround ? 0.7 : 1) * p.speedMul * (has(w, 'quickfeet') ? 1.15 : 1) * (w.overdrive > 0 ? 1.12 : 1);
    p.stillT = m ? 0 : p.stillT + dt;
    if (has(w, 'bulwark') && !p.shield) { p.wardT += dt; if (p.wardT >= 15) { p.shield = true; p.wardT = 0; w.fx.push({ kind: 'ring', x: p.x, y: p.y, color: 0x8fd0ff, t: w.time, dur: 0.5, r: 30 }); } }
    const grip = tile === T_ICE ? 2.2 : 30;
    p.vx += (mx * sp - p.vx) * Math.min(1, grip * dt);
    p.vy += (my * sp - p.vy) * Math.min(1, grip * dt);
    slide(w, p, p.vx * dt, p.vy * dt);
    if (tile === T_LAVA) hurtPlayer(w);
    p.face = Math.atan2(inp.my - p.y, inp.mx - p.x);
    // blink: a short dash with a moment of safety
    p.blinkCd = Math.max(0, p.blinkCd - dt);
    if (inp.blink && p.blinkCd <= 0) {
      const a = m ? Math.atan2(my, mx) : p.face;
      const from = { x: p.x, y: p.y };
      for (let i = 0; i < 12; i++) slide(w, p, Math.cos(a) * 8, Math.sin(a) * 8);
      p.blinkCd = (has(w, 'phantom') ? 0.66 : 1.1) * Math.pow(0.78, bn(w, 'blink'));
      p.inv = Math.max(p.inv, 0.32 + 0.06 * bn(w, 'blink'));
      w.fx.push({ kind: 'blink', x: from.x, y: from.y, color: 0xb48cff, t: w.time, dur: 0.35, r: Math.atan2(p.y - from.y, p.x - from.x) });
      w.sounds.push('zap');
      if (has(w, 'emberwake')) for (let k = 0; k < 10; k++) { const a2 = (k / 10) * Math.PI * 2, kx = from.x + (p.x - from.x) * (k / 9), ky = from.y + (p.y - from.y) * (k / 9); bullet(w, { x: kx, y: ky, vx: Math.cos(a2) * 200, vy: Math.sin(a2) * 200, r: 5, dmg: 7, life: 0.45, friendly: true, color: 0xff8a3a, burn: 3 }); }
      if (has(w, 'phantom')) for (const f of w.foes) {
        // scorch everything along the dash
        const ax = p.x - from.x, ay = p.y - from.y, L = Math.hypot(ax, ay) || 1;
        const k = Math.max(0, Math.min(1, ((f.x - from.x) * ax + (f.y - from.y) * ay) / (L * L)));
        if (Math.hypot(from.x + ax * k - f.x, from.y + ay * k - f.y) < f.r + 12 && f.state !== 'spawn') hurtFoe(w, f, 25, 0xb48cff);
      }
    }
    // Ash Nova: clear the screen
    if (inp.bomb && p.bombs > 0 && p.inv < 1) {
      p.bombs--;
      p.inv = 1.6;
      let cleared = 0;
      for (const b of w.bullets) if (!b.friendly) { cleared++; w.fx.push({ kind: 'hit', x: b.x, y: b.y, color: 0xffd06a, t: w.time, dur: 0.3 }); }
      w.stats.bestNova = Math.max(w.stats.bestNova, cleared);
      w.bullets = w.bullets.filter((b) => b.friendly);
      w.hazards = w.hazards.filter((h) => h.kind === 'pool');
      for (const f of w.foes) if (f.state !== 'spawn') hurtFoe(w, f, f.boss ? 80 : 60, 0xffd06a);
      w.fx.push({ kind: 'nova', x: p.x, y: p.y, color: 0xffd06a, t: w.time, dur: 0.7, r: 900 });
      w.sounds.push('portal', 'boom');
    }
    p.inv = Math.max(0, p.inv - dt);
    p.mana = Math.min(p.maxMana, p.mana + 31 * (1 + w.perks.mana) * (has(w, 'moonwell') ? 1.5 : 1) * (1 + 0.25 * bn(w, 'wellspring')) * (w.overdrive > 0 ? 3 : 1) * dt);
    // shoot
    const rateMul = (has(w, 'quickcast') ? 1.2 : 1) * (has(w, 'lastrites') && p.hp === 1 ? 1.5 : 1) * (1 + 0.12 * bn(w, 'haste')) * (w.overdrive > 0 ? 1.8 : 1);
    const costMul = has(w, 'heavyhand') ? 0.75 : 1;
    p.cdA = Math.max(0, p.cdA - dt);
    p.cdB = Math.max(0, p.cdB - dt);
    for (const slot of [0, 1] as const) {
      const want = slot === 0 ? inp.fireA : inp.fireB;
      const cd = slot === 0 ? p.cdA : p.cdB;
      if (!want || cd > 0) continue;
      const s = spellStats(w.spells[slot], 1, rateMul);
      if (!s || p.mana < s.mana * costMul) continue;
      if (w.overdrive <= 0) p.mana -= s.mana * costMul;
      if (slot === 0) p.cdA = 1 / s.rate; else p.cdB = 1 / s.rate;
      fireSpell(w, slot, p.face, s);
      if (rand(w) < 0.15 * bn(w, 'echo')) w.echoes.push({ at: w.time + 0.18, slot, ang: p.face });
    }
    for (let i = w.echoes.length - 1; i >= 0; i--) {
      const e = w.echoes[i];
      if (w.time < e.at) continue;
      const s = spellStats(w.spells[e.slot], 1, rateMul);
      if (s) fireSpell(w, e.slot, e.ang, s, true);
      w.echoes.splice(i, 1);
    }
  }

  // the combo fades if you stop killing; Heat cools slowly
  if (w.comboT > 0) { w.comboT -= dt; if (w.comboT <= 0) w.combo = 0; }
  else if (w.heat < 100) w.heat = Math.max(0, w.heat - dt * 3);
  // Overdrive: a full Heat bar, spent all at once
  if (inp.surge && w.heat >= 100 && w.overdrive <= 0 && !p.dead) {
    w.overdrive = 6 + bn(w, 'frenzy'); w.heat = 0;
    for (let j = w.bullets.length - 1; j >= 0; j--) { const b = w.bullets[j]; if (!b.friendly && Math.hypot(b.x - p.x, b.y - p.y) < 180) { w.fx.push({ kind: 'hit', x: b.x, y: b.y, color: 0xffd06a, t: w.time, dur: 0.3 }); w.bullets.splice(j, 1); } }
    for (const f of w.foes) if (f.state !== 'spawn' && Math.hypot(f.x - p.x, f.y - p.y) < 180) hurtFoe(w, f, 30, 0xffd06a);
    w.fx.push({ kind: 'nova', x: p.x, y: p.y, color: 0xffb04a, t: w.time, dur: 0.6, r: 180 });
    w.fx.push({ kind: 'phase', x: p.x, y: p.y, color: 0xffb04a, t: w.time, dur: 0.8, r: 900, text: 'OVERDRIVE' });
    w.sounds.push('portal', 'boom');
  }
  if (w.overdrive > 0) w.overdrive = Math.max(0, w.overdrive - dt);
  // the cinder aura burns anything that comes close
  if (bn(w, 'aura') && !p.dead) {
    w.auraT -= dt;
    if (w.auraT <= 0) {
      w.auraT = 0.3;
      const R2 = 62 + 6 * bn(w, 'aura');
      for (const f of w.foes) if (f.state !== 'spawn' && Math.hypot(f.x - p.x, f.y - p.y) < R2 + f.r) hurtFoe(w, f, 3.5 * bn(w, 'aura'), 0xff9a3a, true);
      // the aura also burns away a few of the shots that drift into it
      let n = 1; // one shot per pulse: a shield that helps, not a wall
      for (let j = w.bullets.length - 1; j >= 0 && n > 0; j--) { const b = w.bullets[j]; if (!b.friendly && b.bounce < 1e6 && Math.hypot(b.x - p.x, b.y - p.y) < R2 * 0.7) { w.fx.push({ kind: 'hit', x: b.x, y: b.y, color: 0xff9a3a, t: w.time, dur: 0.25 }); w.bullets.splice(j, 1); n--; } }
    }
  }

  // familiars circle you and join the fight
  const kinds = p.relics.filter((r) => r.startsWith('f_'));
  if (w.familiars.length !== kinds.length) w.familiars = kinds.map((k, i) => ({ kind: k, x: p.x, y: p.y, cd: 0.5 + i * 0.2, ang: (i / kinds.length) * Math.PI * 2 }));
  for (const fam of w.familiars) {
    fam.ang += dt * 1.6;
    const tx = p.x + Math.cos(fam.ang) * 34, ty = p.y + Math.sin(fam.ang) * 22 - 10;
    fam.x += (tx - fam.x) * Math.min(1, dt * 8); fam.y += (ty - fam.y) * Math.min(1, dt * 8);
    fam.cd -= dt;
    if (fam.cd > 0 || p.dead) continue;
    let best: Foe | null = null, bd = fam.kind === 'f_hound' ? 160 : 360;
    for (const f of w.foes) { const d2 = Math.hypot(f.x - fam.x, f.y - fam.y); if (f.state !== 'spawn' && d2 < bd) { bd = d2; best = f; } }
    if (!best) { fam.cd = 0.2; continue; }
    const a = aimAt(fam, best);
    if (fam.kind === 'f_imp') { bullet(w, { x: fam.x, y: fam.y, vx: Math.cos(a) * 430, vy: Math.sin(a) * 430, r: 4, dmg: 6, life: 1, friendly: true, color: 0xff8a3a, burn: 3 }); fam.cd = 0.5; }
    else if (fam.kind === 'f_owl') { bullet(w, { x: fam.x, y: fam.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, r: 5, dmg: 5, life: 1.2, friendly: true, color: 0x9fe0ff, slow: 0.5, pierce: 1 }); fam.cd = 0.85; }
    else { hurtFoe(w, best, 30, 0xe8e0c8); w.fx.push({ kind: 'ring', x: best.x, y: best.y, color: 0xe8e0c8, t: w.time, dur: 0.2, r: 16 }); fam.x = best.x - Math.cos(a) * 12; fam.y = best.y - Math.sin(a) * 12; fam.cd = 0.45; }
  }

  // waves
  const fighting = w.foes.filter((f) => f.type !== 'brazier' && f.type !== 'thief').length;
  if (w.waves.length) w.waveClock += dt;
  if (w.waves.length && (fighting <= 1 || w.waveClock > 10)) {
    w.waveDelay -= dt;
    if (w.waveDelay <= 0) {
      const list = w.waves.shift()!, ring = w.twist === 'ambush';
      list.forEach((t, i) => {
        // an ambush closes in from every side at once
        let at: { x: number; y: number } | undefined;
        if (ring && t.type !== 'brazier') {
          const a = (i / list.length) * Math.PI * 2 + rand(w);
          for (let dist = 170; dist > 90 && !at; dist -= 20) { const x = p.x + Math.cos(a) * dist, y = p.y + Math.sin(a) * dist; if (x > TILE * 2 && y > TILE * 2 && x < AW - TILE * 2 && y < AH - TILE * 2 && !blocked(w, x, y, 14) && tileAt(w, x, y) !== T_LAVA) at = { x, y }; }
        }
        spawnFoe(w, t.type, t.elite, at);
        if (at) w.foes[w.foes.length - 1].st = 1.1;
      });
      w.waveDelay = 0.7;
      w.waveClock = 0;
    }
  }
  // a room that has stalled for 28s: anything left re-emerges where you can reach it
  if (!w.waves.length && !w.cleared && w.foes.length && w.time - w.lastKill > 28 && !(w.twist === 'siege' && w.twistT > 0)) {
    for (const f of w.foes) if (!f.boss && f.type !== 'brazier' && f.type !== 'thief') {
      const at = freeSpot(w, f.r, p, 110);
      f.x = at.x; f.y = at.y; f.state = 'spawn'; f.st = 0.7;
      w.fx.push({ kind: 'spawn', x: f.x, y: f.y, color: 0xff5a4a, t: w.time, dur: 0.7, r: f.r * 2 });
    }
    w.lastKill = w.time - 20;
  }
  // twists that run on a clock
  if (!w.cleared && !p.dead && w.twist) {
    if (w.twist === 'siege' && w.twistT > 0) {
      const before = w.twistT;
      w.twistT -= dt;
      if (Math.floor(before / 3) !== Math.floor(w.twistT / 3) && ACTS[w.act].roster.length) for (let i = 0; i < 2; i++) spawnFoe(w, pick(w, ENCOUNTERS[w.act]?.flatMap((e) => e.waves[0]) ?? ACTS[w.act].roster), false);
      if (w.twistT <= 0) {
        // the rifts close: everything here crumbles
        for (const f of w.foes) if (!f.boss) f.hp = 0;
        w.fx.push({ kind: 'phase', x: p.x, y: p.y, color: 0xffd06a, t: w.time, dur: 1, r: 900, text: 'Held!' });
        w.sounds.push('portal');
      }
    } else if (w.twist === 'meteors' && w.foes.length) {
      w.twistT -= dt;
      if (w.twistT <= 0) {
        w.twistT = 2.2;
        for (let i = 0; i < 3; i++) { const a = rand(w) * Math.PI * 2, d = i === 0 ? rand(w) * 20 : 40 + rand(w) * 90; w.hazards.push({ kind: 'pool', x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, r: 34, ang: 0, len: 0, warn: 1.1, life: 0.9, t: 0, color: 0xff7a2a }); }
      }
    } else if (w.twist === 'thief') {
      const th = w.foes.find((f) => f.type === 'thief' && f.state !== 'spawn');
      if (th) {
        w.twistT -= dt;
        if (w.twistT <= 0) {
          w.foes.splice(w.foes.indexOf(th), 1);
          w.fx.push({ kind: 'text', x: th.x, y: th.y - 20, color: 0xffd06a, t: w.time, dur: 1.6, text: 'The thief got away!' });
          w.fx.push({ kind: 'burst', x: th.x, y: th.y, color: 0xffd06a, t: w.time, dur: 0.4, r: 30 });
        }
      }
    }
  }

  // foes
  for (const f of [...w.foes]) {
    f.flash = Math.max(0, f.flash - dt * 4);
    f.slow = Math.max(0, f.slow - dt);
    if (f.burnT > 0) { f.burnT -= dt; hurtFoe(w, f, f.burnDps * dt, 0xff8a3a, true); }
    if (f.state === 'spawn') { f.st -= dt; if (f.st <= 0) f.state = FOES[f.type]?.move === 'sleep' ? 'sleep' : 'move'; continue; }
    if (f.affix === 'vampiric' && f.hp < f.maxHp) f.hp = Math.min(f.maxHp, f.hp + f.maxHp * 0.025 * dt);
    if (f.boss) {
      // a new phase: a shockwave clears the air, and the boss shows its next song
      const b = BOSSES[f.type]!, idx = b.phases.indexOf(phaseOf(f)!);
      if (idx !== f.phase) {
        f.phase = idx;
        for (const x of w.bullets) if (!x.friendly) w.fx.push({ kind: 'hit', x: x.x, y: x.y, color: 0xffffff, t: w.time, dur: 0.3 });
        w.bullets = w.bullets.filter((x) => x.friendly);
        w.hazards = w.hazards.filter((h) => h.kind !== 'beam');
        w.fx.push({ kind: 'phase', x: f.x, y: f.y, color: 0xffd06a, t: w.time, dur: 1, r: 900, text: ['', 'II', 'III', 'IV', 'V'][idx] });
        w.sounds.push('portal', 'boom');
      }
    }
    if (f.stun > 0) { f.stun -= dt; continue; }
    const k = f.slow > 0 ? 0.5 : 1;
    // never stay wedged in a wall (a charge or a pull can push a foe into one)
    if (blocked(w, f.x, f.y, f.r * 0.8)) { const to = freeSpot(w, f.r, { x: -999, y: -999 }, 0); const best = [to]; for (let i = 0; i < 8; i++) { const c = freeSpot(w, f.r, { x: -999, y: -999 }, 0); if (Math.hypot(c.x - f.x, c.y - f.y) < Math.hypot(best[0].x - f.x, best[0].y - f.y)) best[0] = c; } f.x = best[0].x; f.y = best[0].y; }
    const dx = p.x - f.x, dy = p.y - f.y, d = Math.hypot(dx, dy) || 1;
    f.t += dt * k;
    if (f.state === 'sleep') {
      // gargoyles wake when you come close (or hurt them)
      if (d < 210 || f.hp < f.maxHp || f.t > 4.5) { f.state = 'move'; f.flash = 1; w.sounds.push('freeze'); }
      continue;
    }
    // timed patterns
    const timed = f.boss ? BOSSES[f.type]!.phases.flatMap((ph) => ph.timed) : def(f).timed ?? [];
    const live = f.boss ? new Set(phaseOf(f)!.timed) : null;
    timed.forEach((tp, i) => {
      if (live && !live.has(tp)) return;
      f.timers[i] -= dt * k;
      if (f.timers[i] <= 0 && f.state === 'move') { f.timers[i] = tp.secs; runPat(w, f, tp); }
    });
    if (f.state === 'wind') {
      f.st -= dt; f.flash = 0.6;
      if (f.st <= 0) { const sp = f.vx; f.state = 'charge'; f.st = f.boss ? 0.85 : 0.55; f.vx = (dx / d) * sp; f.vy = (dy / d) * sp; }
      continue;
    }
    if (f.state === 'charge') {
      f.st -= dt;
      const moved = slide(w, f, f.vx * k * dt, f.vy * k * dt);
      if (f.st <= 0 || !moved) {
        if (f.slam > 0) { const n = dens(w, f.slam), a0 = rand(w) * 6; for (let i = 0; i < n; i++) foeShot(w, f.x, f.y, a0 + (i / n) * Math.PI * 2, 140, 0x9cff5a); w.fx.push({ kind: 'ring', x: f.x, y: f.y, color: 0x9cff5a, t: w.time, dur: 0.5, r: 70 }); w.sounds.push('boom'); }
        f.slam = 0;
        f.state = 'rest'; f.st = f.boss ? 0.8 : 0.3;
      }
    } else if (f.state === 'rest') { f.st -= dt; if (f.st <= 0) { f.state = 'move'; f.t = 0; } }
    else {
      const move = f.boss ? phaseOf(f)!.move ?? 'pace' : def(f).move;
      // walk; if a wall is in the way, sidestep along it (each foe has a preferred side) instead of sticking
      const go = (vx: number, vy: number) => {
        const sp = f.speed * k * dt;
        if (slide(w, f, vx * sp, vy * sp)) return;
        const side = f.id % 2 ? 1 : -1;
        if (!slide(w, f, -vy * side * sp, vx * side * sp)) slide(w, f, vy * side * sp, -vx * side * sp);
      };
      // a straggler that has hung back for 20s with nothing falling comes to you, exposed
      const hunted = !f.boss && !w.waves.length && w.time - w.lastKill > 20 && f.type !== 'brazier';
      if (hunted && d > 70) { go(dx / d, dy / d); }
      else switch (move) {
        case 'chase': go(dx / d, dy / d); break;
        case 'swarm': { const j = Math.sin(f.t * 5 + f.id) * 0.6; go(dx / d - (dy / d) * j, dy / d + (dx / d) * j); break; }
        case 'keep': { const want = def(f).keep ?? 240; const away = d < want - 40 ? -1 : d > want + 50 ? 1 : 0.2 * Math.sin(f.t); const side = Math.cos(f.t * 0.7 + f.id) * 0.6; go((dx / d) * away - (dy / d) * side, (dy / d) * away + (dx / d) * side); break; }
        case 'drift': { const a = Math.atan2(dy, dx) + Math.PI / 2, away = d < 170 ? -1 : d > 300 ? 1 : 0; go(Math.cos(a) * 0.8 + (dx / d) * away, Math.sin(a) * 0.8 + (dy / d) * away); break; }
        case 'wander': go(Math.cos(f.t * 0.4 + f.id), Math.sin(f.t * 0.7 + f.id) * 0.6); break;
        case 'flee': { const j = Math.sin(f.t * 2.3 + f.id) * 0.9; go(-dx / d + (-dy / d) * j, -dy / d + (dx / d) * j); break; }
        case 'pace': { const tx = AW / 2 + Math.cos(f.t * 0.5) * AW * 0.28, ty = TILE * 5 + Math.sin(f.t * 0.8) * TILE * 1.5, ex = tx - f.x, ey = ty - f.y, ed = Math.hypot(ex, ey) || 1; go(ex / ed, ey / ed); break; }
        case 'still': case 'sleep': break;
      }
    }
    if (!p.dead && Math.hypot(f.x - p.x, f.y - p.y) < f.r + p.r - 1) hurtPlayer(w);
  }

  // hazards: pools and beams
  for (let i = w.hazards.length - 1; i >= 0; i--) {
    const h = w.hazards[i];
    h.t += dt;
    if (h.kind === 'spikes') {
      // up for a moment every few seconds (after a warning)
      if (spikesUp(h, w.time) && Math.abs(p.x - h.x) < h.r && Math.abs(p.y - h.y) < h.r) hurtPlayer(w);
      continue;
    }
    if (h.kind === 'beam') {
      if (h.t < h.warn) continue;
      if (h.t > h.warn + h.life) { w.hazards.splice(i, 1); continue; }
      const ux = Math.cos(h.ang), uy = Math.sin(h.ang), px = p.x - h.x, py = p.y - h.y, along = px * ux + py * uy;
      if (along > 0 && Math.abs(px * uy - py * ux) < h.r + p.r - 2) hurtPlayer(w);
    } else {
      if (h.t > h.warn + h.life) { w.hazards.splice(i, 1); continue; }
      if (h.t < h.warn) continue;
      if (h.warn && h.t - dt < h.warn) { w.fx.push({ kind: 'boom', x: h.x, y: h.y, color: h.color, t: w.time, dur: 0.4, r: h.r }); w.sounds.push('boom'); }
      if (Math.hypot(p.x - h.x, p.y - h.y) < h.r * 0.8 + p.r) hurtPlayer(w);
    }
  }

  // bullets
  const slowField = has(w, 'hourglass');
  for (let i = w.bullets.length - 1; i >= 0; i--) {
    const b = w.bullets[i];
    if (!b) continue;
    b.life -= dt;
    b.age += dt;
    b.wake = Math.max(0, b.wake - dt);
    const tdt = slowField && !b.friendly && Math.hypot(b.x - p.x, b.y - p.y) < 120 ? dt * 0.6 : dt;
    if (b.orbitFoe) {
      const o = b.orbitFoe, host = w.foes.find((f) => f.id === o.id);
      o.t -= tdt;
      o.ang += o.spin * tdt;
      if (host) { b.x = host.x + Math.cos(o.ang) * o.rad; b.y = host.y + Math.sin(o.ang) * o.rad; }
      if (o.t <= 0 || !host) { b.vx = Math.cos(o.ang) * o.speed; b.vy = Math.sin(o.ang) * o.speed; b.orbitFoe = null; b.life = 8; }
    } else if (b.orbit) {
      b.orbit.t -= dt;
      b.orbit.ang += b.orbit.spin * dt;
      b.x = p.x + Math.cos(b.orbit.ang) * b.orbit.rad;
      b.y = p.y + Math.sin(b.orbit.ang) * b.orbit.rad;
      if (b.turret) {
        // a wisp: circles you and shoots the nearest foe
        b.turret.cd -= dt;
        if (b.turret.cd <= 0) {
          let best: Foe | null = null, bd = 340;
          for (const f of w.foes) { if (f.state === 'spawn') continue; const dd = Math.hypot(f.x - b.x, f.y - b.y); if (dd < bd) { bd = dd; best = f; } }
          if (best) { const a = aimAt(b, best); bullet(w, { x: b.x, y: b.y, vx: Math.cos(a) * 460, vy: Math.sin(a) * 460, r: 4, dmg: b.turret.dmg, life: 0.9, friendly: true, color: b.color }); b.turret.cd = 0.4; }
        }
        if (b.orbit.t <= 0) b.life = 0;
      } else if (b.orbit.t <= 0) {
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(b.orbit.ang) * sp; b.vy = Math.sin(b.orbit.ang) * sp;
        b.orbit = null;
      }
    } else {
      if (b.homing) {
        let tx: number | null = null, ty = 0;
        if (b.friendly) {
          let bd = 320;
          for (const f of w.foes) { if (f.state === 'spawn' || b.hit.includes(f.id)) continue; const dd = Math.hypot(f.x - b.x, f.y - b.y); if (dd < bd) { bd = dd; tx = f.x; ty = f.y; } }
        } else if (!p.dead && b.age < 3) { tx = p.x; ty = p.y; }
        if (tx !== null) steer(b, tx, ty, b.homing * dt);
      }
      if (b.boomer && b.age > b.life * 0.45 + 0.2) { steer(b, p.x, p.y, 12 * dt); if (Math.hypot(p.x - b.x, p.y - b.y) < 16 && b.age > 0.5) b.life = 0; b.life = Math.max(b.life, 0.1); }
      if (b.wave) {
        b.wave.bx += b.vx * tdt; b.wave.by += b.vy * tdt;
        const off = Math.sin(b.age * (b.friendly ? 14 : 3)) * (b.friendly ? 16 : 40);
        b.x = b.wave.bx - b.wave.uy * off; b.y = b.wave.by + b.wave.ux * off;
      } else {
        if (b.spin) { const c = Math.cos(b.spin * tdt), sn = Math.sin(b.spin * tdt), vx = b.vx; b.vx = vx * c - b.vy * sn; b.vy = vx * sn + b.vy * c; }
        b.x += b.vx * tdt; b.y += b.vy * tdt;
      }
      if (b.gravity) for (const f of w.foes) if (!f.boss && f.state !== 'spawn' && Math.hypot(f.x - b.x, f.y - b.y) < 80) slide(w, f, (b.x - f.x) * 1.6 * dt, (b.y - f.y) * 1.6 * dt);
      if (b.target && Math.hypot(b.target.x - b.x, b.target.y - b.y) < Math.hypot(b.vx, b.vy) * dt * 1.5) b.life = 0;
    }
    // walls: break, or bounce
    let gone = b.life <= 0;
    if (!b.orbit && !b.target && !b.lob && !b.wave && isWall(w, b.x, b.y)) {
      if (b.bounce > 0) {
        // reflect off whichever side we hit
        const px = b.x - b.vx * dt, py = b.y - b.vy * dt;
        const wallX = isWall(w, b.x, py), wallY = isWall(w, px, b.y);
        if (wallX) b.vx = -b.vx;
        if (wallY) b.vy = -b.vy;
        if (!wallX && !wallY) { b.vx = -b.vx; b.vy = -b.vy; }
        b.x = px; b.y = py;
        b.bounce--;
      } else gone = true;
    }
    if (!b.friendly && b.wave && (b.y > AH - TILE * 1.2 || b.x < 0 || b.x > AW)) gone = true;
    if (gone) { endBullet(w, b); w.bullets.splice(w.bullets.indexOf(b), 1); continue; }
    if (b.friendly) {
      if (b.orbit && !b.turret) for (let j = w.bullets.length - 1; j >= 0; j--) { const e = w.bullets[j]; if (!e.friendly && Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) { w.bullets.splice(j, 1); w.fx.push({ kind: 'hit', x: e.x, y: e.y, color: b.color, t: w.time, dur: 0.15 }); } }
      if (b.turret || b.target) continue;
      for (const f of w.foes) {
        if (f.state === 'spawn') continue;
        const hi = b.hit.indexOf(f.id);
        if (hi >= 0 && (!b.tick || w.time - b.hitT[hi] < b.tick)) continue;
        if (Math.hypot(f.x - b.x, f.y - b.y) > f.r + b.r) continue;
        if (hi >= 0) b.hitT[hi] = w.time; else { b.hit.push(f.id); b.hitT.push(w.time); }
        if (f.state === 'sleep') { f.state = 'move'; }
        hurtFoe(w, f, b.dmg * (has(w, 'closequarters') && Math.hypot(f.x - p.x, f.y - p.y) < 140 ? 1.3 : 1), b.color, !!b.tick);
        if (b.burn) { f.burnT = 2; f.burnDps = Math.max(f.burnDps, b.burn); }
        if (b.shock) f.stun = Math.max(f.stun, f.boss ? 0.08 : 0.4);
        if (b.leech) p.mana = Math.min(p.maxMana, p.mana + b.leech);
        if (b.siphon && f.hp <= 0) p.mana = Math.min(p.maxMana, p.mana + b.siphon);
        if (b.splinter && !b.tick) { const a0 = Math.atan2(b.vy, b.vx); for (const o of [-0.7, 0.7]) bullet(w, { x: b.x, y: b.y, vx: Math.cos(a0 + o) * 380, vy: Math.sin(a0 + o) * 380, r: Math.max(3, b.r * 0.6), dmg: b.dmg * 0.5, life: 0.4, friendly: true, color: b.color, hit: [f.id], hitT: [w.time] }); }
        if (b.slow) f.slow = 1.2;
        if (b.burst) { endBullet(w, b); b.life = 0; break; }
        if (b.tick) continue;
        if (b.chain > 0) {
          let next: Foe | null = null, nd = 170;
          for (const g of w.foes) { if (g === f || g.state === 'spawn' || b.hit.includes(g.id)) continue; const dd = Math.hypot(g.x - f.x, g.y - f.y); if (dd < nd) { nd = dd; next = g; } }
          if (next) {
            const sp = Math.hypot(b.vx, b.vy), a = aimAt(b, next);
            b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.chain--; b.life = Math.max(b.life, 0.6);
            w.fx.push({ kind: 'ring', x: f.x, y: f.y, color: b.color, t: w.time, dur: 0.18, r: 14 });
            continue;
          }
        }
        if (b.pierce > 0) { b.pierce--; continue; }
        endBullet(w, b);
        b.life = 0;
        break;
      }
      if (b.life <= 0) { const at = w.bullets.indexOf(b); if (at >= 0) w.bullets.splice(at, 1); }
    } else if (!p.dead && b.wake <= 0) {
      const dd = Math.hypot(p.x - b.x, p.y - b.y);
      if (dd < p.r + b.r * 0.7) { if (p.inv <= 0) { w.bullets.splice(w.bullets.indexOf(b), 1); hurtPlayer(w); } }
      else if (!b.grazed && dd < p.r + b.r + 16 && p.inv <= 0) {
        // a graze: a near miss feeds your mana (and your score)
        b.grazed = true;
        w.stats.grazes++;
        w.heat = Math.min(100, w.heat + 1.6 * (1 + 0.5 * bn(w, 'frenzy')) * (1 + w.perks.graze) * (mut(w, 'overcharge') ? 3 : 1));
        p.mana = Math.min(p.maxMana, p.mana + (has(w, 'grazer') ? 9 : 3));
        if (has(w, 'grazer') && w.stats.grazes % 3 === 0) p.cinders++;
        w.score += 5 * scoreMul(w);
        if (has(w, 'stormcrown') && w.stats.grazes % 30 === 0) { p.bombs++; w.fx.push({ kind: 'text', x: p.x, y: p.y - 22, color: 0xffd06a, t: w.time, dur: 1, text: '+1 Ash Nova' }); }
        if (has(w, 'mendgraze') && w.stats.grazes % 60 === 0 && p.hp < p.maxHp) { p.hp++; w.fx.push({ kind: 'text', x: p.x, y: p.y - 22, color: 0xff6a7a, t: w.time, dur: 1, text: '+1 heart' }); }
        if (has(w, 'mirror') && rand(w) < 0.2) {
          let best: Foe | null = null, bd = 400;
          for (const f of w.foes) { const d2 = Math.hypot(f.x - b.x, f.y - b.y); if (f.state !== 'spawn' && d2 < bd) { bd = d2; best = f; } }
          if (best) { const a = aimAt(b, best); bullet(w, { x: b.x, y: b.y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, r: 5, dmg: 9, life: 1.2, friendly: true, color: 0xe8f4ff }); b.life = 0; }
        }
        w.fx.push({ kind: 'graze', x: b.x, y: b.y, color: 0xffffff, t: w.time, dur: 0.25 });
      }
    }
  }

  // pickups drift to you
  const reach = (has(w, 'magnet') ? 200 : 70) + 55 * bn(w, 'magnet') + (w.overdrive > 0 ? 120 : 0);
  for (let i = w.pickups.length - 1; i >= 0; i--) {
    const k = w.pickups[i];
    k.t += dt;
    const dd = Math.hypot(p.x - k.x, p.y - k.y);
    let sp = 0;
    if (dd < reach || k.t > 6) { sp = Math.min(1100, 300 + k.t * 80); k.vx = ((p.x - k.x) / (dd || 1)) * sp; k.vy = ((p.y - k.y) / (dd || 1)) * sp; }
    else { k.vx *= 0.9; k.vy *= 0.9; }
    // a fast pull lands on you instead of overshooting
    if (dd < 14 || dd <= sp * dt) { k.x = p.x; k.y = p.y; } else { k.x += k.vx * dt; k.y += k.vy * dt; }
    if ((dd < 14 || dd <= sp * dt) && !p.dead) {
      if (k.kind === 'cinder') p.cinders += k.n;
      else if (k.kind === 'xp') {
        p.xp += k.n * (1 + 0.2 * bn(w, 'magnet')) * (1 + w.perks.xp) * (mut(w, 'plenty') ? 2 : 1);
        while (p.xp >= xpNeed(p.level)) { p.xp -= xpNeed(p.level); p.level++; w.pendingLevels++; w.fx.push({ kind: 'text', x: p.x, y: p.y - 30, color: 0x9fffd0, t: w.time, dur: 1.2, text: 'Level up!' }); w.fx.push({ kind: 'ring', x: p.x, y: p.y, color: 0x9fffd0, t: w.time, dur: 0.5, r: 60 }); w.sounds.push('heal'); }
      } else p.hp = Math.min(p.maxHp, p.hp + 1);
      if (k.kind !== 'xp') w.sounds.push(k.kind === 'heart' ? 'heal' : 'click');
      w.pickups.splice(i, 1);
    }
  }

  // the fallen
  for (let i = w.foes.length - 1; i >= 0; i--) {
    const f = w.foes[i];
    if (!f || f.hp > 0) continue;
    w.foes.splice(i, 1);
    killed(w, f);
  }
  // once the real foes are gone, the room's furniture goes out with them
  if (!w.waves.length && !w.cleared && w.foes.length && w.foes.every((f) => f.type === 'brazier') && !(w.twist === 'siege' && w.twistT > 0)) {
    for (const f of w.foes) w.fx.push({ kind: 'die', x: f.x, y: f.y, color: 0xff8a3a, t: w.time, dur: 0.5, r: f.r, src: f.type });
    w.foes = [];
  }
  if (!w.foes.length && !w.waves.length && !w.cleared && !p.dead && !w.scripted && !(w.twist === 'siege' && w.twistT > 0)) {
    w.cleared = true;
    w.stats.rooms++;
    for (const b of w.bullets) if (!b.friendly) w.fx.push({ kind: 'hit', x: b.x, y: b.y, color: 0xffffff, t: w.time, dur: 0.3 });
    w.bullets = w.bullets.filter((b) => b.friendly);
    w.hazards = [];
    // everything left on the floor comes to you
    for (const k of w.pickups) k.t = 99;
  }
  w.fx = w.fx.filter((f) => w.time - f.t < f.dur);
}

function steer(b: Bullet, tx: number, ty: number, max: number) {
  const want = Math.atan2(ty - b.y, tx - b.x), cur = Math.atan2(b.vy, b.vx);
  let da = want - cur;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  const na = cur + Math.max(-max, Math.min(max, da)), sp = Math.hypot(b.vx, b.vy);
  b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
}

/** A bullet's end: thorn seeds burst, meteors explode, clusters shatter, lobbed acid pools. */
function endBullet(w: StormWorld, b: Bullet) {
  if (b.burst) {
    const bs = b.burst;
    for (let k = 0; k < bs.n; k++) { const a = (k / bs.n) * Math.PI * 2 + b.x * 0.01; bullet(w, { x: b.x, y: b.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, r: 4, dmg: bs.dmg, life: 0.45, friendly: true, color: b.color, burn: b.burn, slow: b.slow }); }
    w.fx.push({ kind: 'burst', x: b.x, y: b.y, color: b.color, t: w.time, dur: 0.3, r: 34 });
    b.burst = null;
  }
  if (b.target) {
    const R = b.target.boom;
    for (const f of w.foes) if (f.state !== 'spawn' && Math.hypot(f.x - b.target.x, f.y - b.target.y) < R + f.r) { hurtFoe(w, f, b.dmg, b.color); if (b.burn) { f.burnT = 2; f.burnDps = Math.max(f.burnDps, b.burn); } }
    w.fx.push({ kind: 'boom', x: b.target.x, y: b.target.y, color: b.color, t: w.time, dur: 0.45, r: R });
    w.sounds.push('boom');
    b.target = null;
  }
  if (b.cluster && b.friendly) {
    b.cluster = false;
    const a0 = Math.atan2(b.vy, b.vx);
    for (const o of [-0.5, 0, 0.5]) bullet(w, { x: b.x, y: b.y, vx: Math.cos(a0 + o) * 320, vy: Math.sin(a0 + o) * 320, r: Math.max(3, b.r * 0.6), dmg: b.dmg * 0.4, life: 0.35, friendly: true, color: b.color });
  }
  if (b.lob) { w.hazards.push({ kind: 'pool', x: b.lob.x, y: b.lob.y, r: 30, ang: 0, len: 0, warn: 0, life: 3.2, t: 0, color: b.color }); w.fx.push({ kind: 'burst', x: b.lob.x, y: b.lob.y, color: b.color, t: w.time, dur: 0.3, r: 30 }); b.lob = null; }
  if (b.friendly && b.life > 0) w.fx.push({ kind: 'hit', x: b.x, y: b.y, color: b.color, t: w.time, dur: 0.2 });
}

const scoreMul = (w: StormWorld) => (w.diff === 'nightmare' ? 2 : w.diff === 'gentle' ? 0.5 : 1) * (1 + w.loop * 0.5);

function killed(w: StormWorld, f: Foe) {
  const p = w.player;
  w.stats.kills++;
  w.lastKill = w.time;
  if (mut(w, 'volatile') && !f.boss && f.type !== 'brazier') { const n = dens(w, 8), a0 = rand(w) * 6; for (let i = 0; i < n; i++) foeShot(w, f.x, f.y, a0 + (i / n) * Math.PI * 2, 110, 0xff8a3a); }
  if (f.type !== 'brazier') {
    w.combo++; w.comboT = 2.6; w.bestCombo = Math.max(w.bestCombo, w.combo);
    w.heat = Math.min(100, w.heat + (f.boss ? 40 : f.elite ? 18 : 7) * (1 + 0.5 * bn(w, 'frenzy')) * (mut(w, 'overcharge') ? 3 : 1));
    if ([10, 25, 50, 100].includes(w.combo)) { w.fx.push({ kind: 'text', x: p.x, y: p.y - 40, color: 0xffd06a, t: w.time, dur: 1.3, text: `${w.combo} combo!` }); w.sounds.push('portal'); }
    // experience gems
    const xp = f.boss ? 30 : f.elite ? 8 : Math.max(1, Math.round((FOES[f.type]?.cinders ?? 2) * 0.8));
    for (let i = 0, k = Math.min(5, xp); i < k; i++) { const a = rand(w) * Math.PI * 2, sp = 40 + rand(w) * 90; w.pickups.push({ kind: 'xp', x: f.x, y: f.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, n: xp / k, t: 0 }); }
  }
  p.killsSince++;
  w.score += (f.boss ? 1000 * (w.act + 1) : (f.elite ? 60 : 10) * (w.act + 1)) * scoreMul(w);
  w.fx.push({ kind: 'die', x: f.x, y: f.y, color: f.boss ? 0xffd06a : f.elite ? 0xffb020 : 0xff8a6a, t: w.time, dur: f.boss ? 1.4 : 0.5, r: f.r, src: f.type });
  w.sounds.push(f.boss ? 'portal' : 'die');
  if (f.boss && w.stats.hitsTaken === w.bossHits) w.stats.flawless++;
  if (f.type === 'unwritten') w.stats.secret++;
  if (f.boss) { w.stats.bosses++; w.bullets = w.bullets.filter((b) => b.friendly); w.hazards = []; w.foes.length = 0; w.waves = []; if (w.act === ACTS.length - 1) { if (f.type === 'king' && w.bell && w.loop === 0) w.truePath = true; else w.won = true; } }
  // cinders (and, now and then, a heart)
  const n = Math.round((f.boss ? BOSSES[f.type]!.cinders : (FOES[f.type]?.cinders ?? 1) * (f.elite ? 6 : 1)) * Math.max(0.2, 1 + w.perks.cinders) * (has(w, 'magnet') ? 1.5 : 1) * (has(w, 'goldtooth') ? 2 : 1) * (has(w, 'c_poverty') ? 0.5 : 1));
  if (f.affix === 'splitting' && ACTS[w.act].roster.length) for (let i = 0; i < 3; i++) spawnFoe(w, pick(w, ACTS[w.act].roster), false, { x: f.x + (i - 1) * 24, y: f.y });
  for (let i = 0; i < Math.min(12, n); i++) { const a = rand(w) * Math.PI * 2, s = 60 + rand(w) * 120; w.pickups.push({ kind: 'cinder', x: f.x, y: f.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, n: Math.ceil(n / Math.min(12, n)), t: 0 }); }
  if ((f.elite || rand(w) < 0.025) && p.hp < p.maxHp) w.pickups.push({ kind: 'heart', x: f.x, y: f.y, vx: 0, vy: -60, n: 1, t: 0 });
  if (has(w, 'gravepact')) p.mana = Math.min(p.maxMana, p.mana + 6);
  if (has(w, 'volatile') && !f.boss) for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; bullet(w, { x: f.x, y: f.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, r: 4, dmg: 6, life: 0.4, friendly: true, color: 0xffb04a }); }
  if (has(w, 'bloodthirst') && p.killsSince >= 25) { p.killsSince = 0; if (p.hp < p.maxHp) { p.hp++; w.fx.push({ kind: 'text', x: p.x, y: p.y - 20, color: 0xff6a7a, t: w.time, dur: 0.9, text: '+1 heart' }); } }
}

function hurtFoe(w: StormWorld, f: Foe, n: number, color: number, quiet = false) {
  f.hp -= n * (f.affix === 'warded' ? 0.55 : 1);
  if (!quiet) { f.flash = 1; w.fx.push({ kind: 'hit', x: f.x + (rand(w) - 0.5) * f.r, y: f.y + (rand(w) - 0.5) * f.r, color, t: w.time, dur: 0.22 }); w.sounds.push('hit'); }
}

function hurtPlayer(w: StormWorld) {
  const p = w.player;
  if (p.inv > 0 || p.dead) return;
  if (p.shield) {
    p.shield = false; p.inv = 0.8;
    w.fx.push({ kind: 'ring', x: p.x, y: p.y, color: 0x8fd0ff, t: w.time, dur: 0.5, r: 40 });
    w.sounds.push('freeze');
    return;
  }
  p.hp -= mut(w, 'glass') ? 2 : 1;
  p.inv = 1.1;
  if (w.combo >= 5) w.fx.push({ kind: 'text', x: p.x, y: p.y - 34, color: 0xff6a6a, t: w.time, dur: 1, text: `combo lost` });
  w.combo = 0; w.comboT = 0; w.heat = Math.max(0, w.heat - 30);
  w.stats.hitsTaken++;
  w.fx.push({ kind: 'hurt', x: p.x, y: p.y, color: 0xff3a3a, t: w.time, dur: 0.6, r: 40 });
  w.sounds.push('boom');
  for (let j = w.bullets.length - 1; j >= 0; j--) { const b = w.bullets[j]; if (!b.friendly && Math.hypot(b.x - p.x, b.y - p.y) < 70) w.bullets.splice(j, 1); }
  if (has(w, 'thornhide')) for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; bullet(w, { x: p.x, y: p.y, vx: Math.cos(a) * 360, vy: Math.sin(a) * 360, r: 4, dmg: 8, life: 0.6, friendly: true, color: 0x9cff5a }); }
  if (p.hp <= 0) {
    if (w.perks.revive && !w.phoenixUsed) {
      w.phoenixUsed = true; p.hp = 2; p.inv = 2.4;
      w.bullets = w.bullets.filter((b) => b.friendly);
      w.fx.push({ kind: 'nova', x: p.x, y: p.y, color: 0xffb04a, t: w.time, dur: 0.9, r: 900 });
      w.fx.push({ kind: 'text', x: p.x, y: p.y - 24, color: 0xffb04a, t: w.time, dur: 1.6, text: 'Phoenix Ember!' });
      w.sounds.push('portal');
      return;
    }
    if (has(w, 'secondwind') && !p.revived) {
      p.revived = true; p.hp = 3; p.inv = 2.2;
      w.bullets = w.bullets.filter((b) => b.friendly);
      w.fx.push({ kind: 'nova', x: p.x, y: p.y, color: 0x8cff9a, t: w.time, dur: 0.8, r: 900 });
      w.fx.push({ kind: 'text', x: p.x, y: p.y - 24, color: 0x8cff9a, t: w.time, dur: 1.4, text: 'Second wind!' });
      w.sounds.push('heal');
      return;
    }
    p.dead = true;
    w.fx.push({ kind: 'die', x: p.x, y: p.y, color: 0xb48cff, t: w.time, dur: 1.2, r: 14 });
    w.sounds.push('die');
  }
}

/** Gain a relic (with its immediate effects). */
export function addRelic(w: StormWorld, id: string) {
  const p = w.player;
  if (p.relics.includes(id)) return;
  p.relics.push(id);
  if (id === 'emberheart') { p.maxHp++; p.hp = Math.min(p.maxHp, p.hp + 1); }
  if (id === 'glass') { p.maxHp = Math.max(1, p.maxHp - 2); p.hp = Math.min(p.hp, p.maxHp); }
  if (id === 'bombbag') p.bombs++;
  if (id === 'ward') p.shield = true;
  if (id === 'c_brittle') { p.maxHp = Math.max(1, p.maxHp - 1); p.hp = Math.min(p.hp, p.maxHp); }
}

/** Is a spike trap up right now? (a 3.2 second cycle: 0.8s warning, then 0.8s of spikes) */
export function spikesUp(h: Hazard, time: number) { const c = (time + h.ang) % 3.2; return c >= 0.8 && c < 1.6; }
export function spikesWarn(h: Hazard, time: number) { const c = (time + h.ang) % 3.2; return c < 0.8; }

/** Events between rooms: the bits the screens need the rules for. */
export function curseChoice(w: StormWorld, curses: string[]) { const pool = curses.filter((c) => !w.player.relics.includes(c)); return pool.length ? pick(w, pool) : null; }
export function coinFlip(w: StormWorld) { return rand(w) < 0.5; }

/** Ash earned for a Cinderstorm run: per room and boss, more on harder settings. */
export const stormAsh = (w: StormWorld) => Math.round((w.stats.rooms * 2 + w.stats.bosses * 10 + (w.won ? 25 : 0)) * (w.diff === 'nightmare' ? 1.5 : w.diff === 'gentle' ? 0.6 : 1));

/** Cards to choose from after a fight: always at least one modifier. */
export function rewardChoices(w: StormWorld, owned: string[], bases: string[], mods: string[]): string[] {
  const n = 3 + (has(w, 'luckyash') ? 1 : 0);
  const pool = [...mods, ...mods, ...bases.filter((b) => !owned.includes(b))];
  const out: string[] = [];
  for (let i = 0; i < 80 && out.length < n; i++) { const c = pick(w, pool); if (!out.includes(c)) out.push(c); }
  if (!out.some((c) => mods.includes(c))) out[out.length - 1] = pick(w, mods);
  return out;
}
/** Relics you don't have yet, to choose from. */
export function relicChoices(w: StormWorld, n: number): string[] {
  const pool = RELIC_IDS.filter((id) => !w.player.relics.includes(id));
  const out: string[] = [];
  for (let i = 0; i < 80 && out.length < Math.min(n, pool.length); i++) { const c = pick(w, pool); if (!out.includes(c)) out.push(c); }
  return out;
}
export { pick as pickFrom };

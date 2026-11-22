// Pure data types for the deterministic simulation. Nothing in src/sim touches the DOM,
// so the same code runs in the browser, in Electron and on the Node co-op server.

export interface Pt { x: number; y: number }
export type Faction = 'player' | 'enemy';

export interface Unit {
  id: number;
  type: string;
  x: number;
  y: number;
  r: number;
  faction: Faction;
  /** Player id that controls this unit (wizards only). */
  owner: string | null;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  regen: number;
  stam: number;
  maxStam: number;
  range: number;
  dmg: number;
  atkCost: number;
  alive: boolean;
  /** Removed from the board entirely (no corpse). */
  gone: boolean;
  shield: number;
  poison: number;
  frozen: number;
  frail: number;
  fetter: number;
  bloat: number;
  inLava: boolean;
  mini: boolean;
  /** Fire: deals 10 at the start of each turn, then burns down by 1. */
  burn: number;
  /** Takes half damage until its next turn begins. */
  fortify: number;
  /** Enfeebled: each stack cuts the damage it deals by 25% (to a floor of 25%). */
  weak: number;
  /** Elite affixes, e.g. 'growing', 'stalwart', 'volatile', 'ironhide', 'hallowed', 'elusive'. */
  affixes: string[];
  /** Killing it pays upgrade points. */
  bounty: boolean;
  /** Soulbinder casting currency. */
  souls: number;
  maxSouls: number;
  /** Soaked: lightning deals double, frost freezes harder. Counts down each turn. */
  wet: number;
  /** Turns left while downed in co-op (0 = not downed). */
  downed: number;
  /** General-purpose turn counter for bosses and special foes. */
  ctr: number;
  /** World turn on which it died (for the Restless Dead curse). */
  diedTurn: number;
  /** Tile code it last stood on (entering a liquid triggers it). */
  lastTile: number;
}

export type PickupType = 'hp' | 'mana' | 'stam' | 'trap' | 'scroll' | 'oil' | 'food' | 'herb' | 'chest' | 'shrine' | 'brazier' | 'key' | 'vault';
export interface Pickup { id: number; type: PickupType; x: number; y: number; used: boolean }
export type WizardClass = 'spellwright' | 'soulbinder' | 'hexblade' | 'lanternkeeper' | 'tarot' | 'cagebearer';
export type Mat = 'bone' | 'tallow' | 'ember' | 'rime' | 'ichor' | 'herb' | 'ink';

/** A spellwright's appearance. Every field is an index into a list in sim/character.ts; purely cosmetic. */
export interface Look {
  race: number; gender: number; build: number; skin: number;
  hair: number; hairColor: number; beard: number; eyes: number;
  outfit: number; robe: number; trim: number; head: number; orb: number;
}

export interface PlayerSetup {
  pid: string;
  name: string;
  cls?: WizardClass;
  origin?: string;
  traits?: string[];
  look?: Look;
}

export interface PlayerState {
  pid: string;
  name: string;
  unitId: number;
  cards: string[];
  /** Times each card has been cast this turn (drives expense scaling; cleared each turn). */
  uses: Record<string, number>;
  endedTurn: boolean;
  offer: string[];
  picked: boolean;
  points: number;
  ready: boolean;
  /** Has chosen where to begin this depth (placement phase). */
  placed: boolean;
  left?: boolean;
  cls: WizardClass;
  runes: string[];
  runeOffer: string[];
  /** Upgrade points earned from bounties this depth, paid out at the portal. */
  bountyPoints: number;
  // ---- character
  origin: string;
  traits: string[];
  look: Look;
  /** Inscribed upgrade level per card (0 = base). */
  cardLevels: Record<string, number>;
  // ---- survival
  oil: number;
  maxOil: number;
  satiety: number;
  /** Max health lost to hunger, restored by the next meal. */
  starveLoss: number;
  chill: number;
  corruption: number;
  mutations: string[];
  mutationOffer: string[];
  pendingMutations: number;
  mats: Record<Mat, number>;
  /** One-shot buffs applied at the start of the next floor ('ward', 'stam', 'warm'). */
  buffs: string[];
  /** Region the player voted to travel to next (camp). */
  routeVote: number;
  rested: boolean;
  // ---- class mechanics
  /** Tarot Witch: the cards drawn this turn (each usable once). */
  hand: string[];
  /** Cagebearer: foes bound in the cage, released by Unleash. */
  cage: string[];
  maxCage: number;
  // ---- gear
  gear: Record<GearSlot, string | null>;
  /** Unequipped finds (at most 6). */
  bag: string[];
  /** This camp's stranger at the fire. */
  event: { id: string; done: boolean; result?: string; offer?: string[]; grade?: string } | null;
}
export type GearSlot = 'focus' | 'charm' | 'cloak' | 'boots';

export type Phase = 'placing' | 'planning' | 'allies' | 'enemies' | 'levelup' | 'camp' | 'dead' | 'victory';
export type Stat = 'vitality' | 'arcana' | 'stride' | 'reach';

export interface RunState {
  /** Tier of the camp where Sydney last appeared (-9 if not yet this run). */
  sydneyAt?: number;
  /** Region choices per tier, biome ids. */
  route: string[][];
  tier: number;
  region: string;
  /** Floor within the current region, 1-based. */
  floor: number;
  floorsInRegion: number;
  bossesSlain: number;
  bloodMoon: boolean;
}

export interface WorldOptions {
  curses?: string[];
  /** Card ids allowed in offers and scrolls (meta-progression unlocks). Empty = all. */
  pool?: string[];
  daily?: boolean;
  /** Each depth opens with every spellwright choosing where to appear (Spellmasons-style). */
  placement?: boolean;
}

export interface World {
  seed: number;
  level: number;
  turn: number;
  phase: Phase;
  MW: number;
  MH: number;
  map: number[][];
  torches: Pt[];
  units: Unit[];
  pickups: Pickup[];
  players: PlayerState[];
  portal: Pt | null;
  nextId: number;
  /** Outbox of things that happened, for renderers to replay. Drained by the consumer. */
  events: GameEvent[];
  beat: number;
  kills: number;
  wave: number;
  waves: number;
  /** Players who picked up a spell scroll; resolved into a new card when the action settles. */
  pendingScrolls: string[];
  run: RunState;
  opts: WorldOptions;
  /** First player whose spell struck each body this turn (for Resonance). */
  turnHits: Record<number, string>;
  /** Gravity wells (Starfall). */
  wells: Pt[];
  /** Co-op: keys found on this floor (two open the sealed vault). */
  keys: number;
  /** Co-op Bond, 0–100. Fills by fighting side by side; spent on a Duet. */
  bond: number;
  /** Turn number on which a Duet is active (spells free and 50% stronger), or -1. */
  duet: number;
  vaultHint?: number;
}

export type Action =
  | { t: 'move'; pid: string; x: number; y: number; max?: number }
  | { t: 'cast'; pid: string; cards: string[]; x: number; y: number }
  | { t: 'endTurn'; pid: string }
  | { t: 'pick'; pid: string; card: string | null }
  | { t: 'upgrade'; pid: string; stat: Stat }
  | { t: 'ready'; pid: string }
  | { t: 'leave'; pid: string }
  | { t: 'rune'; pid: string; rune: string }
  | { t: 'ping'; pid: string; x: number; y: number }
  | { t: 'revive'; pid: string; target: string }
  | { t: 'mutate'; pid: string; mutation: string }
  | { t: 'craft'; pid: string; recipe: string }
  | { t: 'inscribe'; pid: string; card: string }
  | { t: 'rest'; pid: string }
  | { t: 'route'; pid: string; choice: number }
  | { t: 'equip'; pid: string; item: string }
  | { t: 'event'; pid: string; choice: number }
  | { t: 'place'; pid: string; x: number; y: number }
  | { t: 'duet'; pid: string };

export interface ActionResult { ok: boolean; err?: string }

export interface UnitStatus {
  hp: number; maxHp: number; shield: number; poison: number; frozen: number; frail: number;
  fetter: number; bloat: number; alive: boolean; faction: Faction; mana: number; maxMana: number;
  burn: number; fortify: number; weak: number; affixes: string[]; bounty: boolean; souls: number; maxSouls: number; dmg: number;
  wet: number; downed: number;
}

export type FxKind = 'ring' | 'line' | 'proj' | 'lob' | 'burst' | 'column' | 'slash' | 'blink' | 'bolt';

export interface LevelSnap {
  level: number; MW: number; MH: number; map: number[][]; torches: Pt[]; units: Unit[]; pickups: Pickup[]; biome: string; wells: Pt[];
}

type EventBody =
  | { k: 'level'; snap: LevelSnap }
  | { k: 'move'; id: number; path: Pt[] }
  | { k: 'push'; id: number; path: Pt[] }
  | { k: 'teleport'; id: number; x: number; y: number }
  | { k: 'hurt'; id: number; n: number; hp: number; shield: number; tone?: 'poison' | 'fire' | 'impact' | 'shock' | 'frost' }
  | { k: 'heal'; id: number; n: number; hp: number }
  | { k: 'die'; id: number }
  | { k: 'unit'; id: number; s: UnitStatus }
  | { k: 'spawn'; unit: Unit }
  | { k: 'fx'; fx: FxKind; x: number; y: number; x2?: number; y2?: number; r?: number; color: number }
  | { k: 'float'; id: number; text: string; color: number }
  | { k: 'pickup'; id: number }
  | { k: 'portal'; x: number; y: number }
  | { k: 'log'; text: string }
  | { k: 'phase'; phase: Phase }
  | { k: 'sfx'; s: 'cast' | 'hit' | 'boom' | 'freeze' | 'heal' | 'shoot' | 'die' | 'portal' | 'zap' }
  | { k: 'ping'; pid: string; x: number; y: number }
  | { k: 'tiles'; changes: { x: number; y: number; t: number }[] }
  | { k: 'torch'; x: number; y: number };

export type GameEvent = EventBody & { beat: number };
export type EventInput = EventBody;

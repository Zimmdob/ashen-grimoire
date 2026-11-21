import type { Faction, Unit, World } from './types';
import { RULES } from './constants';

export type AI =
  | 'none' | 'player' | 'melee' | 'ranged' | 'lob' | 'poison' | 'priest' | 'summon' | 'leech' | 'pull' | 'blink'
  | 'boss' | 'warden' | 'mother' | 'bellringer' | 'anvil' | 'queen' | 'choir' | 'unwritten' | 'bloom' | 'swarm' | 'orrery' | 'star';

/** Side effects a foe's hit carries. */
export type HitFx = 'freeze' | 'fetter' | 'manaburn' | 'bleed' | 'weak' | 'shock' | 'frail';

export interface UnitDef {
  name: string;
  hp: number;
  dmg: number;
  range: number;
  stam: number;
  r: number;
  mana?: number;
  regen?: number;
  atkCost?: number;
  ai: AI;
  prop?: boolean;
  decoy?: boolean;
  boss?: boolean;
  urn?: 'fire' | 'ice' | 'plague';
  minLevel?: number;
  budget?: number;
  hit?: HitFx;
  /** Bursts when it dies. */
  burst?: { kind: 'poison' | 'fire'; n: number };
  fireImmune?: boolean;
  affixes?: string[];
  desc: string;
}

// Base stats for the first three foes come from Spellmasons save data (golem 20hp/30dmg/74 range/300 stamina,
// archer 40hp/10dmg/500 range). Everything else is our own design.
export const UNITS: Record<string, UnitDef> = {
  wizard: {
    name: 'Spellwright', hp: RULES.PLAYER_BASE_HEALTH, dmg: 0, range: RULES.PLAYER_BASE_ATTACK_RANGE,
    stam: RULES.PLAYER_BASE_STAMINA, r: 10, mana: RULES.PLAYER_BASE_MANA, regen: RULES.PLAYER_MANA_PER_TURN, ai: 'player',
    desc: 'A wright of spells, bound to the Ashen Grimoire.',
  },
  // ---- the first foes
  ghoul: { name: 'Ghoul', hp: 20, dmg: 30, range: 74, stam: 300, r: 11, ai: 'melee', budget: 1,
    desc: 'Frail but vicious. Lurches at the nearest foe and rends for heavy damage at close range.' },
  xbow: { name: 'Crossbowman', hp: 40, dmg: 10, range: 500, stam: 300, r: 10, ai: 'ranged', budget: 1,
    desc: 'Needs a clear line of sight. Shoots from up to 500 paces.' },
  spitter: { name: 'Bile Spitter', hp: 60, dmg: 20, range: 400, stam: 300, r: 12, mana: 30, regen: 10, atkCost: 20, ai: 'lob', budget: 2,
    desc: 'Lobs bile over walls; the splash hits everything within 50. Spends 20 mana per spit.' },
  monk: { name: 'Plague Monk', hp: 60, dmg: 0, range: 350, stam: 300, r: 11, mana: 60, regen: 15, atkCost: 30, ai: 'poison', budget: 2,
    desc: 'Hurls 10 poison from 350 paces with line of sight. Spends 30 mana per throw.' },
  priest: { name: 'Bone Priest', hp: 60, dmg: 0, range: 500, stam: 250, r: 11, mana: 120, regen: 40, ai: 'priest', budget: 3,
    desc: 'Raises a fallen ally for 60 mana or mends the wounded for 30. Keeps its distance.' },
  necro: { name: 'Necromancer', hp: 60, dmg: 0, range: 0, stam: 250, r: 11, mana: 90, regen: 30, atkCost: 90, ai: 'summon', budget: 3,
    desc: 'Calls two ghouls whenever its mana is full. Blinks away when you draw near.' },
  leech: { name: 'Mana Leech', hp: 50, dmg: 15, range: 74, stam: 350, r: 10, ai: 'leech', budget: 2,
    desc: 'Swift. Bites for 15 and drinks 30 of its prey’s mana.' },
  grasp: { name: 'Drowned Grasp', hp: 80, dmg: 10, range: 300, stam: 150, r: 12, ai: 'pull', budget: 2,
    desc: 'Lashes from 300 paces with line of sight, dragging its prey 150 closer.' },
  // ---- region foes
  wolf: { name: 'Grave Wolf', hp: 25, dmg: 12, range: 60, stam: 320, r: 10, ai: 'melee', budget: 1, desc: 'Hunts in packs and runs down anything that flees.' },
  hag: { name: 'Briar Hag', hp: 50, dmg: 10, range: 300, stam: 220, r: 11, ai: 'ranged', budget: 2, hit: 'fetter', desc: 'Throws thorned roots from 300: 10 damage and a fetter.' },
  sporecaller: { name: 'Sporecaller', hp: 45, dmg: 8, range: 300, stam: 220, r: 11, ai: 'ranged', budget: 2, hit: 'weak', desc: 'Blows choking spores from 300 that enfeeble.' },
  mycelid: { name: 'Mycelid Brute', hp: 90, dmg: 25, range: 74, stam: 200, r: 13, ai: 'melee', budget: 2, desc: 'A walking fungal mass. Slow, tough, heavy-handed.' },
  eelpriest: { name: 'Eel Priest', hp: 50, dmg: 15, range: 380, stam: 220, r: 11, ai: 'ranged', budget: 2, hit: 'shock', desc: 'Calls lightning from 380. Double damage to anyone soaked.' },
  slag: { name: 'Slag Golem', hp: 110, dmg: 30, range: 74, stam: 180, r: 14, ai: 'melee', budget: 3, fireImmune: true, desc: 'Molten stone. Fire and lava do nothing to it.' },
  imp: { name: 'Forge Imp', hp: 20, dmg: 12, range: 60, stam: 380, r: 9, ai: 'melee', budget: 1, burst: { kind: 'fire', n: 25 }, fireImmune: true, desc: 'Fast and fiery. Explodes for 25 when it dies.' },
  drowned: { name: 'The Drowned', hp: 55, dmg: 14, range: 66, stam: 240, r: 11, ai: 'melee', budget: 2, hit: 'fetter', desc: 'Grabs and holds: its touch fetters you, halving your stride next turn.' },
  gargoyle: { name: 'Gargoyle', hp: 90, dmg: 22, range: 70, stam: 170, r: 12, ai: 'melee', budget: 3, affixes: ['stalwart'], desc: 'Stone-skinned and slow. Cannot be shoved far.' },
  cultist: { name: 'Blood Cultist', hp: 40, dmg: 12, range: 320, stam: 260, r: 10, ai: 'ranged', budget: 2, hit: 'bleed', desc: 'Hurls hooked knives from 320 paces. Its wounds bleed.' },
  wisp: { name: 'Frost Wisp', hp: 30, dmg: 10, range: 260, stam: 300, r: 9, ai: 'blink', budget: 2, hit: 'freeze', desc: 'Flickers from place to place; its touch freezes.' },
  ashling: { name: 'Ashling', hp: 18, dmg: 10, range: 60, stam: 360, r: 8, ai: 'melee', budget: 1, burst: { kind: 'fire', n: 20 }, fireImmune: true, desc: 'A scrap of living cinder. Bursts into flame when killed.' },
  wight: { name: 'Rime Wight', hp: 50, dmg: 15, range: 74, stam: 260, r: 11, ai: 'melee', budget: 2, hit: 'freeze', desc: 'Its touch freezes you solid for a turn.' },
  hound: { name: 'Frost Hound', hp: 35, dmg: 18, range: 60, stam: 420, r: 10, ai: 'melee', budget: 1, desc: 'Fast pack hunter of the ice crypts.' },
  toad: { name: 'Bloated Toad', hp: 40, dmg: 10, range: 60, stam: 200, r: 12, ai: 'melee', budget: 1, burst: { kind: 'poison', n: 20 }, desc: 'Bursts into a 20-poison cloud when it dies.' },
  automaton: { name: 'Automaton', hp: 70, dmg: 15, range: 350, stam: 180, r: 12, ai: 'ranged', budget: 2, affixes: ['ironhide'], desc: 'Clockwork sentry. No hit deals it more than 25.' },
  gearspider: { name: 'Gear Spider', hp: 25, dmg: 12, range: 60, stam: 380, r: 9, ai: 'melee', budget: 1, hit: 'fetter', desc: 'Skittering brass. Its bite fetters.' },
  inkwraith: { name: 'Ink Wraith', hp: 40, dmg: 10, range: 350, stam: 260, r: 11, ai: 'ranged', budget: 2, hit: 'manaburn', affixes: ['elusive'], desc: 'Its bolts burn 20 mana. Cannot be swept up by targeting cards.' },
  lich: { name: 'Librarian Lich', hp: 70, dmg: 15, range: 400, stam: 200, r: 11, ai: 'ranged', budget: 3, hit: 'frail', desc: 'Hexes from 400: 15 damage and Frailty.' },
  flagellant: { name: 'Flagellant', hp: 60, dmg: 20, range: 74, stam: 260, r: 11, ai: 'melee', budget: 2, affixes: ['growing'], desc: 'Grows stronger every turn it lives.' },
  bloodarcher: { name: 'Blood Archer', hp: 45, dmg: 15, range: 500, stam: 280, r: 10, ai: 'ranged', budget: 2, hit: 'bleed', desc: 'Its arrows bleed you for 6 poison.' },
  voidmoth: { name: 'Void Moth', hp: 30, dmg: 15, range: 60, stam: 0, r: 10, ai: 'blink', budget: 1, desc: 'Blinks beside its prey each turn and bites.' },
  startouched: { name: 'Star-touched', hp: 60, dmg: 20, range: 350, stam: 220, r: 11, ai: 'pull', budget: 2, desc: 'Drags its prey through warped gravity from 350.' },
  shade: { name: 'Shade', hp: 30, dmg: 20, range: 60, stam: 420, r: 10, ai: 'melee', desc: 'Born where the light dies. Fire burns it double.' },
  // ---- bosses (one rule each)
  warden: { name: 'The Charnel Warden', hp: 300, dmg: 25, range: 74, stam: 150, r: 18, ai: 'warden', boss: true, desc: 'Every third turn it raises every corpse nearby. Shatter or claim the dead first.' },
  mother: { name: 'The Antlered Mother', hp: 320, dmg: 25, range: 74, stam: 170, r: 18, ai: 'mother', boss: true, desc: 'Takes no harm unless someone with a lit lantern stands within 260 of her. Calls wolves.' },
  bloom: { name: 'The Bloom', hp: 280, dmg: 20, range: 300, stam: 0, r: 20, ai: 'bloom', boss: true, desc: 'Rooted. Heals 15 every turn and buds a Mycelid every third turn.' },
  swarm: { name: 'The Swarm Mother', hp: 260, dmg: 15, range: 74, stam: 160, r: 18, ai: 'swarm', boss: true, desc: 'Spawns three toads every other turn.' },
  bellringer: { name: 'The Bell-Ringer Below', hp: 300, dmg: 20, range: 500, stam: 120, r: 18, ai: 'bellringer', boss: true, desc: 'Each third toll floods the floor and lightning strikes everyone soaked.' },
  anvil: { name: 'The Anvil King', hp: 240, dmg: 35, range: 74, stam: 150, r: 18, ai: 'anvil', boss: true, fireImmune: false, desc: 'Immune to everything but impact and lava. Shove him into walls and fire.' },
  orrery: { name: 'The Grand Orrery', hp: 300, dmg: 12, range: 500, stam: 0, r: 20, ai: 'orrery', boss: true, affixes: ['ironhide'], desc: 'Fires three bolts at random targets each turn. No hit deals it more than 25.' },
  queen: { name: 'The Sleeping Queen', hp: 300, dmg: 20, range: 400, stam: 150, r: 18, ai: 'queen', boss: true, desc: 'Every third turn freezes everyone within 260 who is not warm.' },
  unwritten: { name: 'The Unwritten', hp: 280, dmg: 10, range: 500, stam: 160, r: 18, ai: 'unwritten', boss: true, desc: 'Writes down the biggest hit it took last turn and casts it back at you.' },
  choir: { name: 'Choir Singer', hp: 60, dmg: 15, range: 400, stam: 120, r: 12, ai: 'choir', boss: true, desc: 'One of five. While any singer lives, the fallen rise again each turn. Kill them in the same turn.' },
  star: { name: 'The Fallen Star', hp: 300, dmg: 25, range: 74, stam: 200, r: 18, ai: 'star', boss: true, desc: 'Gravity flips each turn: it drags every body in, then hurls them out.' },
  king: { name: 'The Hollow King', hp: 600, dmg: 30, range: 400, stam: 200, r: 20, mana: 100, regen: 50, atkCost: 100, ai: 'boss', boss: true,
    desc: 'Lord of the Hollow Throne. Hurls grave bolts, calls his retinue and will not be cornered.' },
  // ---- props and summons
  urn_fire: { name: 'Ember Urn', hp: 2, dmg: 0, range: 0, stam: 0, r: 9, ai: 'none', prop: true, urn: 'fire', desc: 'Bursts when broken: 40 damage to everything within 100.' },
  urn_ice: { name: 'Rime Urn', hp: 2, dmg: 0, range: 0, stam: 0, r: 9, ai: 'none', prop: true, urn: 'ice', desc: 'Bursts when broken: freezes everything within 100 for a turn.' },
  urn_plague: { name: 'Plague Urn', hp: 2, dmg: 0, range: 0, stam: 0, r: 9, ai: 'none', prop: true, urn: 'plague', desc: 'Bursts when broken: 20 poison to everything within 100.' },
  effigy: { name: 'Straw Effigy', hp: 70, dmg: 0, range: 0, stam: 0, r: 10, ai: 'none', decoy: true, desc: 'Draws the eye of every foe nearby.' },
};

export function makeUnit(w: World, type: string, x: number, y: number, faction: Faction): Unit {
  const def = UNITS[type];
  const scaled = faction === 'enemy' && !def.prop;
  const n = Math.max(1, w.players.filter((p) => !p.left).length);
  const party = [1, 1, 1.5, 1.9, 2.2][Math.min(4, n)];
  // Lords are tuned to meet you where you are: the first one (depth 2) has about a third of its listed
  // health and softer blows, growing to the full listing by the Throne.
  const lord = scaled && !!def.boss;
  const hpMul = scaled ? (1 + 0.3 * (w.level - 1)) * party * (lord ? (w.run?.tier === 0 ? 0.22 : 0.35) : 1) : 1;
  const dmgMul = scaled ? (1 + 0.08 * (w.level - 1)) * (lord ? Math.min(1, 0.6 + 0.05 * w.level) : 1) : 1;
  const hp = Math.round(def.hp * hpMul);
  return {
    id: w.nextId++, type, x, y, r: def.r, faction, owner: null,
    hp, maxHp: hp, mana: def.mana ?? 0, maxMana: def.mana ?? 0, regen: def.regen ?? 0,
    stam: def.stam, maxStam: def.stam, range: def.range, dmg: Math.round(def.dmg * dmgMul), atkCost: def.atkCost ?? 0,
    alive: true, gone: false, shield: 0, poison: 0, frozen: 0, frail: 0, fetter: 0, bloat: 0, inLava: false, mini: false,
    burn: 0, fortify: 0, weak: 0, affixes: [...(def.affixes ?? [])], bounty: false, souls: 0, maxSouls: 0,
    wet: 0, downed: 0, ctr: 0, diedTurn: 0, lastTile: 0,
  };
}

/** Elder (miniboss) variant: 2.5× health, harder hits, bigger body. */
export function makeElder(u: Unit) {
  u.mini = true;
  u.maxHp = Math.round(u.maxHp * 2.5);
  u.hp = u.maxHp;
  u.dmg = Math.round(u.dmg * 1.5);
  u.r = Math.round(u.r * 1.3);
}

export const isProp = (u: Unit) => !!UNITS[u.type].prop;
export const unitName = (u: Unit) => (u.mini ? 'Elder ' : '') + UNITS[u.type].name;
/** Damage a unit actually deals after Enfeeble. */
export const dealt = (u: Unit) => Math.round(u.dmg * Math.max(0.25, 1 - 0.25 * u.weak));
/** Creatures that can be summoned or polymorphed into. */
export const CREATURES = ['ghoul', 'xbow', 'spitter', 'monk', 'priest', 'necro', 'leech', 'grasp', 'wolf', 'hag', 'mycelid', 'slag', 'wight', 'toad', 'automaton', 'lich'];

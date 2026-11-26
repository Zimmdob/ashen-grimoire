import type { School } from '../sim/cards';

// Cinderstorm: the grimoire becomes your weapon. A spell is one base (what you shoot) plus up to
// three modifiers (how it flies). Combining them builds the bullet pattern you fire.

export interface StormCard {
  id: string;
  name: string;
  kind: 'base' | 'mod';
  desc: string;
  /** The main game's card whose icon this borrows. */
  icon: string;
  school: School;
  /** Shop price in cinders. */
  price: number;
}

const c = (id: string, name: string, kind: 'base' | 'mod', icon: string, school: School, desc: string, price = kind === 'base' ? 30 : 24): StormCard => ({ id, name, kind, icon, school, desc, price });

export const STORM_CARDS: Record<string, StormCard> = Object.fromEntries([
  // ---- bases: what you shoot
  c('ember', 'Ember Bolt', 'base', 'cinders', 'harm', 'Quick bolts of fire. Reliable damage.'),
  c('frost', 'Frost Shard', 'base', 'rime', 'curse', 'Shards that pierce one foe and slow what they hit.'),
  c('thorn', 'Thorn Seed', 'base', 'mire', 'terrain', 'A lobbed seed that bursts into a ring of thorns.'),
  c('spark', 'Spark', 'base', 'chainlight', 'arcane', 'Very fast, very rapid sparks that jump to a second foe.'),
  c('bone', 'Bone Lance', 'base', 'bonespear', 'grave', 'Slow, heavy lances that punch through three foes.'),
  c('void', 'Void Orb', 'base', 'maelstrom', 'arcane', 'A slow, hungry orb that grinds through everything in its path.', 40),
  c('arc', 'Storm Arc', 'base', 'flare', 'arcane', 'A crack of lightning: instant, short, pierces four.', 36),
  c('meteor', 'Meteor', 'base', 'meteor', 'harm', 'Falls where you aim and explodes. Slow but devastating.', 40),
  c('wisp', 'Will-o’-Wisp', 'base', 'sum_ghoul', 'summon', 'Calls a wisp that circles you for six seconds, shooting at foes.', 44),
  // ---- modifiers: how it flies
  c('split', 'Split', 'mod', 'fork', 'target', 'Fire two more in a fan.'),
  c('nova', 'Nova', 'mod', 'nova', 'target', 'Fire in a full ring around you, a little slower.'),
  c('chain', 'Chain', 'mod', 'chain', 'target', 'Each hit jumps on to two more foes.'),
  c('pierce', 'Pierce', 'mod', 'lance', 'force', 'Passes through two more foes.'),
  c('seek', 'Seek', 'mod', 'seek', 'target', 'Shots curve toward the nearest foe.'),
  c('orbit', 'Orbit', 'mod', 'circle', 'blessing', 'Shots circle you as a shield (eating foe shots), then fly out.'),
  c('haste', 'Haste', 'mod', 'haste', 'blessing', 'Fire 45% faster.'),
  c('echo', 'Echo', 'mod', 'echo', 'arcane', 'Every volley repeats a moment later.'),
  c('big', 'Overcharge', 'mod', 'overcharge', 'harm', 'Bigger, harder-hitting, slower shots.'),
  c('burn', 'Kindle', 'mod', 'burn', 'harm', 'Hits set foes alight for extra damage over time.'),
  c('bounce', 'Ricochet', 'mod', 'repel', 'force', 'Shots bounce off walls twice.'),
  c('boomer', 'Boomerang', 'mod', 'beckon', 'force', 'Shots fly out, then come back through everything.'),
  c('wave', 'Serpent', 'mod', 'mire', 'terrain', 'Shots weave side to side, covering more ground.'),
  c('twin', 'Twin', 'mod', 'mirror', 'blessing', 'Also fire the same volley behind you.'),
  c('cluster', 'Cluster', 'mod', 'boneburst', 'harm', 'Shots break into three shards when they end.'),
  c('gravity', 'Gravity', 'mod', 'magnet', 'curse', 'Shots drag nearby foes toward them.'),
].map((x) => [x.id, x]));

export const BASES = Object.values(STORM_CARDS).filter((x) => x.kind === 'base').map((x) => x.id);
export const MODS = Object.values(STORM_CARDS).filter((x) => x.kind === 'mod').map((x) => x.id);
export const MAX_MODS = 3;

/** Everything about how a spell fires, worked out from its cards. */
export interface SpellStats {
  dmg: number; speed: number; rate: number; mana: number;
  count: number; spread: number; ring: boolean;
  pierce: number; chain: number; homing: number; orbit: boolean; echo: boolean;
  size: number; burn: number; slow: number;
  /** Thorn seeds: travel time before bursting, and how many thorns. */
  burst: { after: number; n: number; dmg: number } | null;
  color: number; life: number;
  bounce: number; boomer: boolean; wave: boolean; twin: boolean; cluster: boolean; gravity: boolean;
  /** Hits the same foe again after this many seconds (void orbs grind). 0 = once. */
  tick: number;
  /** Meteor: flies to the aim point and explodes with this radius. */
  boom: number;
  /** Wisp: becomes a turret that circles you and fires. */
  turret: boolean;
}

type BaseStats = Pick<SpellStats, 'dmg' | 'speed' | 'rate' | 'mana' | 'pierce' | 'chain' | 'size' | 'slow' | 'burst' | 'color' | 'life'> & Partial<Pick<SpellStats, 'tick' | 'boom' | 'turret'>>;
const BASE_STATS: Record<string, BaseStats> = {
  ember: { dmg: 7, speed: 470, rate: 7, mana: 4, pierce: 0, chain: 0, size: 5, slow: 0, burst: null, color: 0xff8a3a, life: 1.4 },
  frost: { dmg: 5, speed: 390, rate: 5, mana: 4, pierce: 1, chain: 0, size: 5, slow: 0.5, burst: null, color: 0x9fe0ff, life: 1.6 },
  thorn: { dmg: 4, speed: 270, rate: 2.4, mana: 9, pierce: 0, chain: 0, size: 7, slow: 0, burst: { after: 0.5, n: 7, dmg: 5 }, color: 0x9cff5a, life: 0.5 },
  spark: { dmg: 3.5, speed: 650, rate: 10, mana: 3, pierce: 0, chain: 1, size: 4, slow: 0, burst: null, color: 0xc8b0ff, life: 1 },
  bone: { dmg: 15, speed: 520, rate: 2.2, mana: 8, pierce: 3, chain: 0, size: 7, slow: 0, burst: null, color: 0xe8e0c8, life: 1.6 },
  void: { dmg: 4, speed: 150, rate: 1.1, mana: 16, pierce: 99, chain: 0, size: 13, slow: 0, burst: null, color: 0x9a5aff, life: 3.2, tick: 0.22 },
  arc: { dmg: 6, speed: 1300, rate: 4.5, mana: 6, pierce: 4, chain: 0, size: 4, slow: 0, burst: null, color: 0x8fe8ff, life: 0.26 },
  meteor: { dmg: 30, speed: 420, rate: 0.9, mana: 18, pierce: 0, chain: 0, size: 10, slow: 0, burst: null, color: 0xff5a1a, life: 2, boom: 70 },
  wisp: { dmg: 5, speed: 420, rate: 0.35, mana: 22, pierce: 0, chain: 0, size: 7, slow: 0, burst: null, color: 0xbfe8ff, life: 6, turret: true },
};

/** A spell is [base, ...mods]. An empty or base-less spell fires nothing. */
export function spellStats(cards: string[], dmgMul = 1, rateMul = 1): SpellStats | null {
  const base = cards.find((x) => STORM_CARDS[x]?.kind === 'base');
  if (!base) return null;
  const b = BASE_STATS[base];
  const s: SpellStats = {
    ...b, burst: b.burst && { ...b.burst }, count: 1, spread: 0, ring: false, homing: 0, orbit: false, echo: false, burn: 0,
    bounce: 0, boomer: false, wave: false, twin: false, cluster: false, gravity: false, tick: b.tick ?? 0, boom: b.boom ?? 0, turret: !!b.turret,
  };
  for (const m of cards) {
    switch (m) {
      case 'split': s.count += 2; s.spread += 0.42; s.mana *= 1.5; s.dmg *= 0.8; break;
      case 'nova': s.ring = true; s.count = Math.max(10, s.count * 4); s.rate *= 0.55; s.mana *= 2.2; s.speed *= 0.85; break;
      case 'chain': s.chain += 2; s.mana *= 1.3; break;
      case 'pierce': s.pierce += 2; s.mana *= 1.2; break;
      case 'seek': s.homing += 5; s.mana *= 1.25; s.life *= 1.4; break;
      case 'orbit': s.orbit = true; s.mana *= 1.3; s.life += 1.2; break;
      case 'haste': s.rate *= 1.45; s.mana *= 1.2; break;
      case 'echo': s.echo = true; s.mana *= 1.6; break;
      case 'big': s.size *= 1.6; s.dmg *= 1.6; s.speed *= 0.85; s.mana *= 1.5; if (s.burst) s.burst.dmg *= 1.5; s.boom *= 1.3; break;
      case 'burn': s.burn += 3.5; s.mana *= 1.25; break;
      case 'bounce': s.bounce += 2; s.life *= 1.5; s.mana *= 1.15; break;
      case 'boomer': s.boomer = true; s.pierce = Math.max(s.pierce, 50); s.life = Math.max(s.life, 1.1); s.mana *= 1.3; break;
      case 'wave': s.wave = true; s.size *= 1.1; s.mana *= 1.1; break;
      case 'twin': s.twin = true; s.mana *= 1.5; break;
      case 'cluster': s.cluster = true; s.mana *= 1.35; break;
      case 'gravity': s.gravity = true; s.mana *= 1.3; break;
    }
  }
  if (s.burst) s.burst.n = Math.round(s.burst.n * (s.count > 1 ? 0.7 : 1));
  s.dmg *= dmgMul;
  s.rate *= rateMul;
  s.mana = Math.round(s.mana * 10) / 10;
  return s;
}

/** One line describing what a spell does, for the forge. */
export function spellSummary(cards: string[]): string {
  const s = spellStats(cards);
  if (!s) return 'No base card: this hand fires nothing.';
  const bits = [`${s.turret ? `${s.count} wisp${s.count > 1 ? 's' : ''}` : s.ring ? `ring of ${s.count}` : s.count > 1 ? `${s.count} shots` : '1 shot'}`, `${Math.round(s.dmg * 10) / 10} dmg`, `${Math.round(s.rate * 10) / 10}/s`, `${s.mana} mana`];
  const flag = (on: unknown, t: string) => { if (on) bits.push(t); };
  flag(s.burst, `bursts into ${s.burst?.n}`); flag(s.boom, 'explodes'); flag(s.tick, 'grinds'); flag(s.pierce && s.pierce < 50, `pierces ${s.pierce}`);
  flag(s.chain, `chains ${s.chain}`); flag(s.homing, 'seeks'); flag(s.orbit, 'orbits'); flag(s.echo, 'echoes'); flag(s.burn, 'burns'); flag(s.slow, 'slows');
  flag(s.bounce, 'ricochets'); flag(s.boomer, 'returns'); flag(s.wave, 'weaves'); flag(s.twin, 'fires behind too'); flag(s.cluster, 'clusters'); flag(s.gravity, 'pulls foes');
  return bits.join(' · ');
}

// ------------------------------------------------------------------ relics: passive gifts for the run
export interface Relic { id: string; name: string; desc: string; icon: string; school: School; price: number }
const r = (id: string, name: string, icon: string, school: School, desc: string, price = 60): Relic => ({ id, name, icon, school, desc, price });
export const RELICS: Record<string, Relic> = Object.fromEntries([
  r('emberheart', 'Ember Heart', 'crimson', 'blood', 'One more heart (and heal one).'),
  r('moonwell', 'Moonwell Phial', 'siphon', 'arcane', 'Mana returns 50% faster.'),
  r('phantom', 'Phantom Step', 'blink', 'arcane', 'Blink recovers 40% faster and scorches every foe you pass through.'),
  r('thornhide', 'Thorned Hide', 'mire', 'terrain', 'When you are hit, a ring of sixteen thorns bursts from you.'),
  r('gravepact', 'Grave Pact', 'gravepact', 'grave', 'Every kill restores 6 mana.'),
  r('luckyash', 'Lucky Ash', 'cinders', 'blessing', 'One more card to choose from after each fight.', 45),
  r('secondwind', 'Second Wind', 'mend', 'blessing', 'The first time you fall, rise again with three hearts.', 80),
  r('overflow', 'Brimming Cup', 'overcharge', 'arcane', 'While your mana is above 80%, your spells hit 35% harder.'),
  r('hourglass', 'Cracked Hourglass', 'rime', 'curse', 'Foe shots slow down by a third near you.', 75),
  r('magnet', 'Lodestone', 'magnet', 'force', 'Cinders fly to you from three times as far, and are worth half again as much.', 40),
  r('volatile', 'Volatile Ash', 'boneburst', 'harm', 'Foes you kill burst into six sparks.'),
  r('grazer', 'Moth’s Wing', 'blink', 'blessing', 'Grazing a foe shot gives much more mana, and a cinder.', 45),
  r('bombbag', 'Ash Satchel', 'meteor', 'harm', 'One more Ash Nova each act.', 50),
  r('glass', 'Glass Grimoire', 'shatter', 'harm', 'Your spells hit 60% harder, but you have two fewer hearts.', 55),
  r('quickcast', 'Quicksilver Quill', 'haste', 'blessing', 'Everything fires 20% faster.'),
  r('ward', 'Warding Charm', 'ward', 'blessing', 'Each room begins with a ward that blocks one hit.', 70),
  r('bloodthirst', 'Bloodthirst', 'hemorrhage', 'blood', 'Every 25 kills heal a heart.'),
  r('echostone', 'Echo Stone', 'echo', 'arcane', 'Every fourth volley echoes.'),
].map((x) => [x.id, x]));
export const RELIC_IDS = Object.keys(RELICS);

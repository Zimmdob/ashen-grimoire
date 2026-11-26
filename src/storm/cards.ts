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
}

export const STORM_CARDS: Record<string, StormCard> = {
  // ---- bases
  ember: { id: 'ember', name: 'Ember Bolt', kind: 'base', icon: 'cinders', school: 'harm', desc: 'Quick bolts of fire. Reliable damage.' },
  frost: { id: 'frost', name: 'Frost Shard', kind: 'base', icon: 'rime', school: 'curse', desc: 'Shards that pierce one foe and slow what they hit.' },
  thorn: { id: 'thorn', name: 'Thorn Seed', kind: 'base', icon: 'mire', school: 'terrain', desc: 'A lobbed seed that bursts into a ring of thorns.' },
  spark: { id: 'spark', name: 'Spark', kind: 'base', icon: 'chainlight', school: 'arcane', desc: 'Very fast, very rapid sparks that jump to a second foe.' },
  bone: { id: 'bone', name: 'Bone Lance', kind: 'base', icon: 'bonespear', school: 'grave', desc: 'Slow, heavy lances that punch through three foes.' },
  // ---- modifiers
  split: { id: 'split', name: 'Split', kind: 'mod', icon: 'fork', school: 'target', desc: 'Fire two more in a fan.' },
  nova: { id: 'nova', name: 'Nova', kind: 'mod', icon: 'nova', school: 'target', desc: 'Fire in a full ring around you, a little slower.' },
  chain: { id: 'chain', name: 'Chain', kind: 'mod', icon: 'chain', school: 'target', desc: 'Each hit jumps on to two more foes.' },
  pierce: { id: 'pierce', name: 'Pierce', kind: 'mod', icon: 'lance', school: 'force', desc: 'Passes through two more foes.' },
  seek: { id: 'seek', name: 'Seek', kind: 'mod', icon: 'seek', school: 'target', desc: 'Shots curve toward the nearest foe.' },
  orbit: { id: 'orbit', name: 'Orbit', kind: 'mod', icon: 'circle', school: 'blessing', desc: 'Shots circle you as a shield (eating foe shots), then fly out.' },
  haste: { id: 'haste', name: 'Haste', kind: 'mod', icon: 'haste', school: 'blessing', desc: 'Fire 45% faster.' },
  echo: { id: 'echo', name: 'Echo', kind: 'mod', icon: 'echo', school: 'arcane', desc: 'Every volley repeats a moment later.' },
  big: { id: 'big', name: 'Overcharge', kind: 'mod', icon: 'overcharge', school: 'harm', desc: 'Bigger, harder-hitting, slower shots.' },
  burn: { id: 'burn', name: 'Kindle', kind: 'mod', icon: 'burn', school: 'harm', desc: 'Hits set foes alight for extra damage over time.' },
};

export const BASES = Object.values(STORM_CARDS).filter((c) => c.kind === 'base').map((c) => c.id);
export const MODS = Object.values(STORM_CARDS).filter((c) => c.kind === 'mod').map((c) => c.id);
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
}

const BASE_STATS: Record<string, Omit<SpellStats, 'count' | 'spread' | 'ring' | 'homing' | 'orbit' | 'echo' | 'burn'>> = {
  ember: { dmg: 7, speed: 470, rate: 7, mana: 4, pierce: 0, chain: 0, size: 5, slow: 0, burst: null, color: 0xff8a3a, life: 1.4 },
  frost: { dmg: 5, speed: 390, rate: 5, mana: 4, pierce: 1, chain: 0, size: 5, slow: 0.5, burst: null, color: 0x9fe0ff, life: 1.6 },
  thorn: { dmg: 4, speed: 270, rate: 2.4, mana: 9, pierce: 0, chain: 0, size: 7, slow: 0, burst: { after: 0.5, n: 7, dmg: 5 }, color: 0x9cff5a, life: 0.5 },
  spark: { dmg: 3.5, speed: 650, rate: 10, mana: 3, pierce: 0, chain: 1, size: 4, slow: 0, burst: null, color: 0xc8b0ff, life: 1 },
  bone: { dmg: 15, speed: 520, rate: 2.2, mana: 8, pierce: 3, chain: 0, size: 7, slow: 0, burst: null, color: 0xe8e0c8, life: 1.6 },
};

/** A spell is [base, ...mods]. An empty or base-less spell fires nothing. */
export function spellStats(cards: string[]): SpellStats | null {
  const base = cards.find((c) => STORM_CARDS[c]?.kind === 'base');
  if (!base) return null;
  const s: SpellStats = { ...BASE_STATS[base], burst: BASE_STATS[base].burst && { ...BASE_STATS[base].burst! }, count: 1, spread: 0, ring: false, homing: 0, orbit: false, echo: false, burn: 0 };
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
      case 'big': s.size *= 1.6; s.dmg *= 1.6; s.speed *= 0.85; s.mana *= 1.5; if (s.burst) s.burst.dmg *= 1.5; break;
      case 'burn': s.burn += 3.5; s.mana *= 1.25; break;
    }
  }
  if (s.burst) s.burst.n = Math.round(s.burst.n * (s.count > 1 ? 0.7 : 1));
  s.mana = Math.round(s.mana * 10) / 10;
  return s;
}

/** One line describing what a spell does, for the forge. */
export function spellSummary(cards: string[]): string {
  const s = spellStats(cards);
  if (!s) return 'No base card: this hand fires nothing.';
  const bits = [`${s.ring ? `ring of ${s.count}` : s.count > 1 ? `${s.count} shots` : '1 shot'}`, `${Math.round(s.dmg * 10) / 10} dmg`, `${Math.round(s.rate * 10) / 10}/s`, `${s.mana} mana`];
  if (s.burst) bits.push(`bursts into ${s.burst.n}`);
  if (s.pierce) bits.push(`pierces ${s.pierce}`);
  if (s.chain) bits.push(`chains ${s.chain}`);
  if (s.homing) bits.push('seeks');
  if (s.orbit) bits.push('orbits');
  if (s.echo) bits.push('echoes');
  if (s.burn) bits.push('burns');
  if (s.slow) bits.push('slows');
  return bits.join(' · ');
}

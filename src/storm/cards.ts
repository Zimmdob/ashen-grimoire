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
  c('scythe', 'Grave Scythe', 'base', 'rend', 'grave', 'Spinning blades that cut through everything and come back to you.', 38),
  c('leech', 'Leech Bolt', 'base', 'siphon', 'blood', 'Weak, quick bolts that drink mana from what they hit.', 34),
  c('splinter', 'Splinter', 'mod', 'shatter', 'harm', 'On a hit, two shards fly off at angles.'),
  c('shock', 'Shock', 'mod', 'chainlight', 'arcane', 'Hits stun foes for a moment (bosses barely notice).'),
  c('spiral', 'Spiral', 'mod', 'maelstrom', 'arcane', 'Shots curl outward in a spiral.'),
  c('siphon', 'Soul Siphon', 'mod', 'gravepact', 'grave', 'Foes killed by this spell give back 5 mana.'),
].map((x) => [x.id, x]));

export const BASES = Object.values(STORM_CARDS).filter((x) => x.kind === 'base').map((x) => x.id);
export const MODS = Object.values(STORM_CARDS).filter((x) => x.kind === 'mod').map((x) => x.id);
export const MAX_MODS = 3;

/** Everything about how a spell fires, worked out from its cards. */
export interface SpellStats {
  /** The evolution this spell has become, if its cards fuse into one. */
  evo: string | null;
  dmg: number; speed: number; rate: number; mana: number;
  count: number; spread: number; ring: boolean;
  pierce: number; chain: number; homing: number; orbit: boolean; echo: boolean;
  size: number; burn: number; slow: number;
  /** Thorn seeds: travel time before bursting, and how many thorns. */
  burst: { after: number; n: number; dmg: number } | null;
  color: number; life: number;
  bounce: number; boomer: boolean; wave: boolean; twin: boolean; cluster: boolean; gravity: boolean;
  splinter: boolean; shock: boolean; spiral: boolean; siphon: number;
  /** Mana gained per hit (leech bolts). */
  leech: number;
  /** Hits the same foe again after this many seconds (void orbs grind). 0 = once. */
  tick: number;
  /** Meteor: flies to the aim point and explodes with this radius. */
  boom: number;
  /** Wisp: becomes a turret that circles you and fires. */
  turret: boolean;
}

type BaseStats = Pick<SpellStats, 'dmg' | 'speed' | 'rate' | 'mana' | 'pierce' | 'chain' | 'size' | 'slow' | 'burst' | 'color' | 'life'> & Partial<Pick<SpellStats, 'tick' | 'boom' | 'turret' | 'boomer' | 'leech'>>;
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
  scythe: { dmg: 9, speed: 320, rate: 2.6, mana: 7, pierce: 99, chain: 0, size: 9, slow: 0, burst: null, color: 0xc8b8ff, life: 0.9, boomer: true },
  leech: { dmg: 4.5, speed: 520, rate: 6.5, mana: 2.5, pierce: 0, chain: 0, size: 5, slow: 0, burst: null, color: 0xc83a6a, life: 1.2, leech: 1.6 },
};

/** A spell is [base, ...mods]. An empty or base-less spell fires nothing. */
export function spellStats(cards: string[], dmgMul = 1, rateMul = 1): SpellStats | null {
  const base = cards.find((x) => STORM_CARDS[x]?.kind === 'base');
  if (!base) return null;
  const b = BASE_STATS[base];
  const s: SpellStats = {
    ...b, burst: b.burst && { ...b.burst }, count: 1, spread: 0, ring: false, homing: 0, orbit: false, echo: false, burn: 0,
    bounce: 0, boomer: !!b.boomer, wave: false, twin: false, cluster: false, gravity: false, tick: b.tick ?? 0, boom: b.boom ?? 0, turret: !!b.turret,
    splinter: false, shock: false, spiral: false, siphon: 0, leech: b.leech ?? 0, evo: null,
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
      case 'splinter': s.splinter = true; s.mana *= 1.25; break;
      case 'shock': s.shock = true; s.mana *= 1.3; break;
      case 'spiral': s.spiral = true; s.life *= 1.3; s.count += 1; s.spread += 0.5; s.mana *= 1.2; break;
      case 'siphon': s.siphon += 5; break;
    }
  }
  if (s.burst) s.burst.n = Math.round(s.burst.n * (s.count > 1 ? 0.7 : 1));
  // the right cards together fuse into something greater
  for (const e of EVOLUTIONS) if (e.needs.every((c) => cards.includes(c))) { e.apply(s); s.evo = e.id; if (e.color) s.color = e.color; break; }
  s.dmg *= dmgMul;
  s.rate *= rateMul;
  s.mana = Math.round(s.mana * 10) / 10;
  return s;
}

/** Spell evolutions: put these cards in one spell and they fuse. */
export const EVOLUTIONS: { id: string; name: string; needs: string[]; desc: string; color?: number; apply: (s: SpellStats) => void }[] = [
  { id: 'hellfire', name: 'Hellfire Fan', needs: ['ember', 'split', 'burn'], desc: 'A wide fan of fire that sets everything alight.', color: 0xff5a1a, apply: (s) => { s.count += 2; s.burn += 3; s.dmg *= 1.25; } },
  { id: 'winter', name: 'Winter’s Crown', needs: ['frost', 'nova', 'pierce'], desc: 'A ring of ice that pierces and freezes the room.', color: 0xbff4ff, apply: (s) => { s.slow = Math.max(s.slow, 0.6); s.pierce += 2; s.dmg *= 1.3; } },
  { id: 'bramble', name: 'Bramble Bomb', needs: ['thorn', 'cluster'], desc: 'Seeds that burst twice over into a thicket of thorns.', color: 0x9cff5a, apply: (s) => { if (s.burst) { s.burst.n *= 2; s.burst.dmg *= 1.3; } s.dmg *= 1.2; } },
  { id: 'tempest', name: 'Tempest', needs: ['spark', 'chain', 'haste'], desc: 'Lightning that leaps and stuns, faster than thought.', color: 0xd0e8ff, apply: (s) => { s.chain += 2; s.rate *= 1.2; s.dmg *= 1.2; s.shock = true; } },
  { id: 'ossuary', name: 'Ossuary Lance', needs: ['bone', 'pierce', 'big'], desc: 'A lance that goes through a whole graveyard.', color: 0xfff0d0, apply: (s) => { s.pierce += 5; s.dmg *= 1.4; s.size *= 1.2; } },
  { id: 'singularity', name: 'Singularity', needs: ['void', 'gravity'], desc: 'A small, patient black hole.', color: 0x6a3aff, apply: (s) => { s.size *= 1.5; s.dmg *= 1.4; s.life *= 1.3; } },
  { id: 'starfall', name: 'Starfall', needs: ['meteor', 'split', 'echo'], desc: 'The sky comes down where you point, twice.', color: 0xffd06a, apply: (s) => { s.count += 2; s.boom *= 1.3; } },
  { id: 'lanternhost', name: 'Lantern Host', needs: ['wisp', 'twin'], desc: 'A procession of wisps that never stop shooting.', color: 0x9fe0ff, apply: (s) => { s.count += 1; s.dmg *= 1.3; } },
  { id: 'reaper', name: 'The Reaper', needs: ['scythe', 'boomer'], desc: 'One scythe, out and back, through everything.', color: 0xe8e0c8, apply: (s) => { s.dmg *= 1.6; s.size *= 1.3; } },
  { id: 'bloodmoon', name: 'Blood Moon', needs: ['leech', 'siphon'], desc: 'Every hit drinks deep.', color: 0xff2a4a, apply: (s) => { s.leech *= 2; s.dmg *= 1.5; } },
  { id: 'coil', name: 'Dragon’s Coil', needs: ['wave', 'spiral'], desc: 'Shots that writhe like a living thing.', color: 0xff8a3a, apply: (s) => { s.dmg *= 1.35; s.count += 1; } },
  { id: 'shrapnel', name: 'Shrapnel Storm', needs: ['bounce', 'splinter'], desc: 'Every wall becomes a weapon.', color: 0xc8c8d0, apply: (s) => { s.bounce += 2; s.dmg *= 1.25; } },
];

/** One line describing what a spell does, for the forge. */
export function spellSummary(cards: string[]): string {
  const s = spellStats(cards);
  if (!s) return 'No base card: this hand fires nothing.';
  const bits = [`${s.turret ? `${s.count} wisp${s.count > 1 ? 's' : ''}` : s.ring ? `ring of ${s.count}` : s.count > 1 ? `${s.count} shots` : '1 shot'}`, `${Math.round(s.dmg * 10) / 10} dmg`, `${Math.round(s.rate * 10) / 10}/s`, `${s.mana} mana`];
  const flag = (on: unknown, t: string) => { if (on) bits.push(t); };
  flag(s.burst, `bursts into ${s.burst?.n}`); flag(s.boom, 'explodes'); flag(s.tick, 'grinds'); flag(s.pierce && s.pierce < 50, `pierces ${s.pierce}`);
  flag(s.chain, `chains ${s.chain}`); flag(s.homing, 'seeks'); flag(s.orbit, 'orbits'); flag(s.echo, 'echoes'); flag(s.burn, 'burns'); flag(s.slow, 'slows');
  flag(s.splinter, 'splinters'); flag(s.shock, 'stuns'); flag(s.spiral, 'spirals'); flag(s.siphon, 'siphons'); flag(s.leech, 'drinks mana');
  flag(s.bounce, 'ricochets'); flag(s.boomer, 'returns'); flag(s.wave, 'weaves'); flag(s.twin, 'fires behind too'); flag(s.cluster, 'clusters'); flag(s.gravity, 'pulls foes');
  return bits.join(' · ');
}

// ------------------------------------------------------------------ relics: passive gifts for the run
export interface Relic { id: string; name: string; desc: string; icon: string; school: School; price: number; curse?: boolean }
const r = (id: string, name: string, icon: string, school: School, desc: string, price = 60, curse = false): Relic => ({ id, name, icon, school, desc, price, curse });
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
  r('stormcrown', 'Storm Crown', 'flare', 'arcane', 'Every 30 grazes grant an Ash Nova.', 70),
  r('emberwake', 'Ember Wake', 'cinders', 'harm', 'Your blink leaves a burst of fire behind it.'),
  r('mirror', 'Mirror Shard', 'mirror', 'blessing', 'Grazed shots sometimes turn and fly at your foes.'),
  r('heavyhand', 'Scholar’s Hand', 'empower', 'arcane', 'Every spell costs a quarter less mana.', 70),
  r('goldtooth', 'Gold Tooth', 'crimson', 'blood', 'Twice the cinders from every foe.', 45),
  r('closequarters', 'Knife-Fighter’s Ring', 'rend', 'harm', 'Foes close to you take 30% more damage.'),
  r('dancer', 'Dancer’s Ribbon', 'haste', 'blessing', 'Your spells hit 25% harder while you’re moving.'),
  r('stillwater', 'Stillwater Bead', 'ward', 'curse', 'Stand still for a moment and your spells hit 60% harder.'),
  r('mendgraze', 'Moth Silk', 'mend', 'blessing', 'Every 60 grazes heal a heart.', 65),
  r('bulwark', 'Bulwark Sigil', 'fortify', 'blessing', 'Your ward comes back 15 seconds after it breaks.', 80),
  r('quickfeet', 'Quickfeet', 'dash', 'force', 'You move 15% faster.', 45),
  r('lastrites', 'Last Rites', 'gravepact', 'grave', 'On your last heart, everything fires 50% faster.', 50),
  r('f_imp', 'Familiar: Ember Imp', 'sum_ghoul', 'summon', 'A little imp circles you and spits burning bolts at foes.', 70),
  r('f_owl', 'Familiar: Frost Owl', 'rime', 'summon', 'A pale owl circles you, firing slowing shards that pierce.', 70),
  r('f_hound', 'Familiar: Bone Hound', 'raise', 'summon', 'A skeletal hound guards you and savages anything that comes close.', 70),
  // curses: what events cost you
  r('c_brittle', 'Curse: Brittle Bones', 'frail', 'curse', 'One heart fewer.', 0, true),
  r('c_hurry', 'Curse: Hurried Doom', 'haste', 'curse', 'Foe shots fly 12% faster.', 0, true),
  r('c_poverty', 'Curse: Empty Purse', 'decay', 'curse', 'Half the cinders.', 0, true),
].map((x) => [x.id, x]));
export const RELIC_IDS = Object.keys(RELICS).filter((id) => !RELICS[id].curse);
export const CURSE_IDS = Object.keys(RELICS).filter((id) => RELICS[id].curse);

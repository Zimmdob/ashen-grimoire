// Meta-progression kept in the browser: the character sheet, Ash and the Sanctum, curses, the
// Codex of things seen. None of it touches the simulation except through WorldOptions.

import { CARDS } from '../sim/cards';
import { cleanLook, DEFAULT_LOOK, ORIGINS, TRAITS, traitBudget } from '../sim/character';
import type { Look, PlayerSetup, WizardClass, World, WorldOptions } from '../sim/types';
import { dailySeed } from '../net/protocol';

const KEY = 'ashen-meta-v2';

export interface Profile { name: string; cls: WizardClass; origin: string; traits: string[]; look: Look }
export interface Meta {
  profile: Profile;
  ash: number;
  unlocked: string[];
  curses: string[];
  seenFoes: string[];
  seenCards: string[];
  seenBiomes: string[];
  runs: number;
  wins: number;
  bestDepth: number;
  dailyBest: Record<string, number>;
  achievements: string[];
  classDepth: Record<string, number>;
}

const fresh = (): Meta => ({
  profile: { name: 'Vox', cls: 'spellwright', origin: 'knight', traits: [], look: { ...DEFAULT_LOOK } },
  ash: 0, unlocked: [], curses: [], seenFoes: [], seenCards: [], seenBiomes: [], runs: 0, wins: 0, bestDepth: 0, dailyBest: {}, achievements: [], classDepth: {},
});

function load(): Meta {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const m = fresh();
      const oldName = localStorage.getItem('ashen-name');
      const oldCls = localStorage.getItem('ashen-class') as WizardClass | null;
      if (oldName) m.profile.name = oldName;
      if (oldCls) m.profile.cls = oldCls;
      m.bestDepth = Number(localStorage.getItem('ashen-best') ?? 0) || 0;
      return m;
    }
    const m = { ...fresh(), ...JSON.parse(raw) } as Meta;
    m.profile = { ...fresh().profile, ...m.profile, look: cleanLook({ ...DEFAULT_LOOK, ...(m.profile?.look ?? {}) }) };
    return m;
  } catch { return fresh(); }
}
export const meta: Meta = load();
export function saveMeta() { try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch { /* storage unavailable */ } }

// ---------------------------------------------------------------- curses (opt-in difficulty for more Ash)
export const CURSES: Record<string, { name: string; desc: string }> = {
  elder_blood: { name: 'Curse of Elder Blood', desc: 'Every ordinary foe carries an elite affix.' },
  hungry_dark: { name: 'Curse of the Hungry Dark', desc: 'Lanterns burn 50% faster.' },
  no_rest: { name: 'Curse of No Rest', desc: 'You cannot rest at camp.' },
  restless_dead: { name: 'Curse of the Restless Dead', desc: 'Corpses left lying too long rise again.' },
  thin_veil: { name: 'Curse of the Thin Veil', desc: 'Shades come when your lantern is at 30%, not empty.' },
};
export const CURSE_ASH = 0.25;

// ---------------------------------------------------------------- the Sanctum
export interface Unlock { name: string; cost: number; desc: string; cards?: string[]; origin?: string }
export const UNLOCKS: Record<string, Unlock> = {
  bones: { name: "Gravedigger's Folio", cost: 25, desc: 'Grave magic: Grave Pact, Bone Spear, Gather the Dead.', cards: ['gravepact', 'bonespear', 'gather'] },
  elements: { name: 'Folio of the Elements', cost: 45, desc: 'Lava Flow, Mire, Cinders, Starfall.', cards: ['lavaflow', 'mire', 'cinders', 'starfall'] },
  tide: { name: "Tidecaller's Folio", cost: 30, desc: 'Water and frost: Flood, Ice Sheet, Steam, Flash Freeze, Chain Lightning.', cards: ['flood', 'icesheet', 'steam', 'flashfreeze', 'chainlight'] },
  mason: { name: "Mason's Folio", cost: 25, desc: 'Shape the dungeon: Raise Wall, Haste, Flare.', cards: ['raisewall', 'haste', 'flare'] },
  arcane: { name: "Arcanist's Folio", cost: 60, desc: 'Modifier cards that change a whole spell: Echo, Overcharge.', cards: ['echo', 'overcharge'] },
  o_plague: { name: 'Origin: Plague Doctor', cost: 20, desc: 'Immune to poison. Starts with Cleanse.', origin: 'plague' },
  o_cartographer: { name: 'Origin: Cartographer', cost: 20, desc: '+40 stamina and an extra oil flask on every floor.', origin: 'cartographer' },
  o_noble: { name: 'Origin: Blood Noble', cost: 40, desc: 'Blood magic costs 30% less health. Starts corrupted.', origin: 'noble' },
};
export const lockedCards = () => new Set(Object.entries(UNLOCKS).filter(([k, u]) => u.cards && !meta.unlocked.includes(k)).flatMap(([, u]) => u.cards!));
export const originLocked = (o: string) => Object.entries(UNLOCKS).some(([k, u]) => u.origin === o && !meta.unlocked.includes(k));
export function buyUnlock(id: string): boolean {
  const u = UNLOCKS[id];
  if (!u || meta.unlocked.includes(id) || meta.ash < u.cost) return false;
  meta.ash -= u.cost;
  meta.unlocked.push(id);
  saveMeta();
  return true;
}

/** Character sheet for a new run, with anything locked or over budget cleaned out. */
export function setupFor(p: Profile = meta.profile): Omit<PlayerSetup, 'pid'> {
  const origin = ORIGINS[p.origin] && !originLocked(p.origin) ? p.origin : 'knight';
  const traits = p.traits.filter((t) => TRAITS[t]);
  return { name: p.name || 'Vox', cls: p.cls, origin, traits: traitBudget(traits) >= 0 ? traits : [], look: cleanLook(p.look) };
}

export function runOptions(daily = false): WorldOptions {
  const locked = lockedCards();
  const pool = locked.size ? Object.keys(CARDS).filter((c) => !locked.has(c)) : [];
  if (daily) {
    const seed = dailySeed();
    const ids = Object.keys(CURSES);
    return { curses: [ids[seed % ids.length]], pool: [], daily: true, placement: true };
  }
  return { curses: [...meta.curses], pool, daily: false, placement: true };
}

// ---------------------------------------------------------------- Ash and the Codex
/** Ash earned for a run: floors and bosses count; curses multiply it; a victory adds a bounty. */
export function ashFor(w: World): number {
  const base = Math.max(0, w.level - 1) * 2 + w.run.bossesSlain * 10 + (w.phase === 'victory' ? 50 : 0);
  return Math.round(base * (1 + CURSE_ASH * (w.opts.curses?.length ?? 0)));
}

let banked = -1;
/** Credit a finished run once. Returns the Ash earned. */
export function bankRun(w: World, worldId: number): number {
  if (banked === worldId) return ashFor(w);
  banked = worldId;
  const ash = ashFor(w);
  meta.ash += ash;
  meta.runs++;
  if (w.phase === 'victory') meta.wins++;
  meta.bestDepth = Math.max(meta.bestDepth, w.level);
  if (w.opts.daily) { const k = new Date().toISOString().slice(0, 10); meta.dailyBest[k] = Math.max(meta.dailyBest[k] ?? 0, w.level); }
  saveMeta();
  return ash;
}

let lastSeenKey = '';
/** Note new foes, cards and regions in the Codex. Cheap: only writes when something is new. */
export function observe(w: World, myCards: string[]) {
  const add = (arr: string[], v: string) => { if (!arr.includes(v)) { arr.push(v); return true; } return false; };
  let changed = false;
  for (const u of w.units) if (!u.owner && u.faction === 'enemy') changed = add(meta.seenFoes, u.type) || changed;
  for (const c of myCards) changed = add(meta.seenCards, c) || changed;
  changed = add(meta.seenBiomes, w.run.region) || changed;
  const key = `${meta.seenFoes.length}|${meta.seenCards.length}|${meta.seenBiomes.length}`;
  if (changed && key !== lastSeenKey) { lastSeenKey = key; saveMeta(); }
}

// ---------------------------------------------------------------- achievements (5 Ash each, once)
type P = World['players'][number];
export const ACHIEVEMENTS: Record<string, { name: string; desc: string; test: (w: World, ps: P) => boolean }> = {
  descent: { name: 'Into the Dark', desc: 'Clear your first floor.', test: (w) => w.level >= 2 },
  lordslayer: { name: 'Lordslayer', desc: 'Slay a lord of the Reach.', test: (w) => w.run.bossesSlain >= 1 },
  warlord: { name: 'Bane of Lords', desc: 'Slay three lords in one run.', test: (w) => w.run.bossesSlain >= 3 },
  throne: { name: 'Before the Throne', desc: 'Reach the Hollow Throne.', test: (w) => w.run.region === 'throne' },
  victory: { name: 'The King Unmade', desc: 'Win a run.', test: (w) => w.phase === 'victory' },
  cursedwin: { name: 'Twice Cursed', desc: 'Win with two or more curses.', test: (w) => w.phase === 'victory' && (w.opts.curses?.length ?? 0) >= 2 },
  mutant: { name: 'Something Else Now', desc: 'Carry three mutations.', test: (_, ps) => ps.mutations.length >= 3 },
  pristine: { name: 'Clean Hands', desc: 'Reach depth 5 with no corruption.', test: (w, ps) => w.level >= 5 && ps.corruption === 0 },
  hoarder: { name: 'Magpie', desc: 'Own six pieces of gear at once.', test: (_, ps) => ps.bag.length + Object.values(ps.gear).filter(Boolean).length >= 6 },
  scholar: { name: 'Fat Grimoire', desc: 'Know fifteen spells.', test: (_, ps) => ps.cards.length >= 15 },
  inscribed: { name: 'Twice Inscribed', desc: 'Raise a spell to its third mark.', test: (_, ps) => Object.values(ps.cardLevels).some((l) => l >= 2) },
  duet: { name: 'In Harmony', desc: 'Call a Duet with a companion.', test: (w) => w.duet >= 0 },
  vault: { name: 'Keyholder', desc: 'Open a sealed vault.', test: (w) => w.pickups.some((k) => k.type === 'vault' && k.used) },
  slaughter: { name: 'Hundred Dead', desc: 'Slay a hundred foes in one run.', test: (w) => w.kills >= 100 },
  cartographer: { name: 'Cartographer', desc: 'Visit every region of the Reach.', test: () => meta.seenBiomes.length >= 12 },
  allcallings: { name: 'Six Callings', desc: 'Reach depth 3 with every calling.', test: () => ['spellwright', 'soulbinder', 'hexblade', 'lanternkeeper', 'tarot', 'cagebearer'].every((c) => (meta.classDepth[c] ?? 0) >= 3) },
};

/** Check the local player's achievements. Returns the names of any newly earned. */
export function checkAchievements(w: World, ps: P): string[] {
  meta.classDepth[ps.cls] = Math.max(meta.classDepth[ps.cls] ?? 0, w.level);
  const got: string[] = [];
  for (const [id, a] of Object.entries(ACHIEVEMENTS)) {
    if (meta.achievements.includes(id)) continue;
    try { if (!a.test(w, ps)) continue; } catch { continue; }
    meta.achievements.push(id);
    meta.ash += 5;
    got.push(a.name);
  }
  if (got.length) saveMeta();
  return got;
}

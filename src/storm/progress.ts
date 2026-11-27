// Cinderstorm's long game: the Last Hearth (the Sanctuary between runs), its people, upgrades,
// pacts, the codex, run history and settings. Kept in the browser; the simulation only sees
// what a run starts with (RunOpts.perks / pacts / mutators).

const KEY = 'ashen-storm-progress-v1';

export type NpcId = 'rook' | 'brannoch' | 'ysolde' | 'hesk' | 'vell';
export interface RunRecord { at: number; cls: string; diff: string; won: boolean; act: number; score: number; level: number; secs: number; kills: number; true?: boolean; weekly?: boolean }
export interface Settings {
  shake: number; flash: boolean; hitbox: boolean; autofire: boolean; contrast: boolean; textScale: number; sfx: number; music: number;
  /** Post-processing: 2 = everything, 1 = bloom and grading only, 0 = none. */
  fx: number;
  keys: Record<string, string>;
}
export interface Progress {
  embers: number; lifetimeEmbers: number;
  upgrades: Record<string, number>;
  rescued: NpcId[];
  pacts: string[];
  codex: string[];
  talked: Record<string, number>;
  bossMet: Record<string, number>;
  wins: number; trueEnding: boolean; endingsSeen: string[];
  tutorialDone: boolean;
  history: RunRecord[];
  evolutions: string[];
  weeklyBest: Record<string, number>;
  settings: Settings;
  familiars: string[];
}

export const DEFAULT_KEYS: Record<string, string> = { up: 'w', down: 's', left: 'a', right: 'd', blink: ' ', focus: 'shift', nova: 'f', surge: 'q', fireA: 'j', fireB: 'k' };
const fresh = (): Progress => ({
  embers: 0, lifetimeEmbers: 0, upgrades: {}, rescued: [], pacts: [], codex: [], talked: {}, bossMet: {}, wins: 0, trueEnding: false, endingsSeen: [], tutorialDone: false,
  history: [], evolutions: [], weeklyBest: {}, familiars: [],
  settings: { fx: 2, shake: 1, flash: true, hitbox: false, autofire: false, contrast: false, textScale: 1, sfx: 1, music: 1, keys: { ...DEFAULT_KEYS } },
});
function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = { ...fresh(), ...JSON.parse(raw) } as Progress;
    p.settings = { ...fresh().settings, ...p.settings, keys: { ...DEFAULT_KEYS, ...(p.settings?.keys ?? {}) } };
    return p;
  } catch { return fresh(); }
}
export const progress: Progress = load();
export function saveProgress() { try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* storage unavailable */ } }
export const lvl = (id: string) => progress.upgrades[id] ?? 0;

// ---------------------------------------------------------------- Brannoch's Tempering: permanent upgrades
export interface Upgrade { id: string; name: string; desc: (n: number) => string; costs: number[]; npc: NpcId | null; icon: string }
export const UPGRADES: Upgrade[] = [
  { id: 'vigor', name: 'Hearthblood', desc: (n) => `+${n || 1} heart${n > 1 ? 's' : ''} at the start of every run.`, costs: [40, 90, 160], npc: null, icon: '♥' },
  { id: 'edge', name: 'Tempered Edge', desc: (n) => `+${8 * (n || 1)}% spell damage.`, costs: [25, 50, 90, 140, 200], npc: 'brannoch', icon: '⚔' },
  { id: 'well', name: 'Deep Well', desc: (n) => `+${10 * (n || 1)}% mana regeneration.`, costs: [30, 70, 120], npc: 'brannoch', icon: '◈' },
  { id: 'ash', name: 'Ash Satchel', desc: (n) => `Start with ${n || 1} more Ash Nova${n > 1 ? 's' : ''}.`, costs: [45, 110], npc: 'brannoch', icon: '✸' },
  { id: 'insight', name: 'Scholar’s Insight', desc: (n) => `+${10 * (n || 1)}% experience.`, costs: [35, 75, 130], npc: 'ysolde', icon: '✎' },
  { id: 'greed', name: 'Magpie’s Eye', desc: (n) => `+${15 * (n || 1)}% cinders from foes.`, costs: [30, 65, 110], npc: 'hesk', icon: '◆' },
  { id: 'choice', name: 'Wider Fortunes', desc: () => 'Level-ups offer four boons instead of three.', costs: [220], npc: 'ysolde', icon: '❖' },
  { id: 'reroll', name: 'Second Thoughts', desc: (n) => `Reroll card rewards ${n || 1} time${n > 1 ? 's' : ''} per run.`, costs: [60, 120, 200], npc: 'ysolde', icon: '↻' },
  { id: 'phoenix', name: 'Phoenix Ember', desc: () => 'Once per run, rise again with two hearts when you fall.', costs: [320], npc: 'rook', icon: '✹' },
  { id: 'kit', name: 'Pilgrim’s Kit', desc: () => 'Start every run with a random relic.', costs: [180], npc: 'hesk', icon: '✦' },
  { id: 'swift', name: 'Fleet Boots', desc: (n) => `+${5 * (n || 1)}% move speed.`, costs: [40, 90], npc: 'hesk', icon: '»' },
  { id: 'graze', name: 'Grazing Ward', desc: (n) => `Grazes build ${25 * (n || 1)}% more Heat.`, costs: [50, 100], npc: 'rook', icon: '≈' },
];
export const upgradeCost = (u: Upgrade) => u.costs[lvl(u.id)] ?? Infinity;
export function buyUpgrade(id: string): boolean {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) return false;
  const c = upgradeCost(u);
  if (progress.embers < c) return false;
  progress.embers -= c;
  progress.upgrades[id] = lvl(id) + 1;
  saveProgress();
  return true;
}

// ---------------------------------------------------------------- Mother Rook's Bargains: opt-in pacts for more embers
export const PACTS: Record<string, { name: string; desc: string; bonus: number }> = {
  bloodmoon: { name: 'Bloodmoon', desc: 'Foes fire 20% more shots.', bonus: 0.25 },
  thinskin: { name: 'Thin Skin', desc: 'One heart fewer.', bonus: 0.2 },
  haste: { name: 'Haste of the Damned', desc: 'Foe shots fly 15% faster.', bonus: 0.25 },
  iron: { name: 'Iron Champions', desc: 'Champions and bosses have 30% more health.', bonus: 0.2 },
  norest: { name: 'No Rest', desc: 'No heart is mended before a boss.', bonus: 0.15 },
  famine: { name: 'Famine', desc: 'Half the cinders.', bonus: 0.15 },
  dark: { name: 'The Long Dark', desc: 'The light around you is smaller.', bonus: 0.15 },
};
export const pactBonus = () => progress.pacts.reduce((a, id) => a + (PACTS[id]?.bonus ?? 0), 0);

/** What a new run starts with, from upgrades and pacts. */
export function runPerks() {
  return {
    hearts: lvl('vigor') - (progress.pacts.includes('thinskin') ? 1 : 0),
    dmg: 0.08 * lvl('edge'), mana: 0.1 * lvl('well'), bombs: lvl('ash'), xp: 0.1 * lvl('insight'), cinders: 0.15 * lvl('greed') * (progress.pacts.includes('famine') ? 0.5 : 1) - (progress.pacts.includes('famine') ? 0.5 : 0),
    choices: lvl('choice') ? 4 : 3, revive: lvl('phoenix') > 0, relic: lvl('kit') > 0, speed: 0.05 * lvl('swift'), graze: 0.25 * lvl('graze'),
  };
}

// ---------------------------------------------------------------- weekly mutators (Hesk's Contraptions)
export const MUTATORS: Record<string, { name: string; desc: string }> = {
  glass: { name: 'Glass World', desc: 'Everyone deals double damage: you and them.' },
  bullettime: { name: 'Bullet Time', desc: 'Every shot is 30% slower, and there are 40% more of them.' },
  volatile: { name: 'Volatile Dead', desc: 'Foes burst into a ring of shots when they die.' },
  giants: { name: 'Giants', desc: 'Foes are bigger, slower and have 60% more health.' },
  plenty: { name: 'Plenty', desc: 'Twice the experience; level-ups come thick and fast.' },
  overcharge: { name: 'Overcharge', desc: 'Heat builds three times faster.' },
  champions: { name: 'All Champions', desc: 'Every room is a Champions’ hall.' },
  swarm: { name: 'The Swarm', desc: 'Twice as many foes, each half as tough.' },
};
export const weekKey = (d = new Date()) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const y = t.getUTCFullYear(); const w1 = new Date(Date.UTC(y, 0, 4)); return `${y}-W${String(1 + Math.round(((t.getTime() - w1.getTime()) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; };
export function weeklyMutators(key = weekKey()): { seed: number; mutators: string[] } {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const ids = Object.keys(MUTATORS), out: string[] = [];
  let s = h >>> 0;
  while (out.length < 3) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; const id = ids[s % ids.length]; if (!out.includes(id)) out.push(id); }
  return { seed: h | 0, mutators: out };
}

export function recordRun(r: RunRecord) {
  progress.history.unshift(r);
  progress.history = progress.history.slice(0, 60);
  saveProgress();
}
export function addCodex(...ids: string[]) {
  const fresh = ids.filter((id) => !progress.codex.includes(id));
  if (fresh.length) { progress.codex.push(...fresh); saveProgress(); }
  return fresh;
}

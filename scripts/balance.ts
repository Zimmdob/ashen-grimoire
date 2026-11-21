// Balance report: seeded bot sweeps over the deterministic sim. Usage: npm run balance [runs]
// Measures damage per mana for every card, how deep each play style gets, what kills players,
// and how each card's ownership correlates with depth reached (a rough "win rate when owned").
import { writeFileSync, mkdirSync } from 'node:fs';
import { applyAction, createWorld, playerUnit, playerState, previewCast } from '../src/sim/game';
import { predictThreats } from '../src/sim/ai';
import { findPath } from '../src/sim/path';
import { CARDS, CARD_IDS } from '../src/sim/cards';
import { spellCost } from '../src/sim/spell';
import { rand } from '../src/sim/rng';
import { RECIPES } from '../src/sim/character';
import { BIOMES } from '../src/sim/biomes';
import { UNITS } from '../src/sim/units';
import type { Action, World } from '../src/sim/types';

const RUNS = Number(process.argv[2] ?? 60);
type Style = 'aggressive' | 'careful' | 'summoner' | 'terrain' | 'blood' | 'planner';
const STYLES: Style[] = (process.env.STYLES?.split(',') as Style[]) ?? ['aggressive', 'careful', 'summoner', 'terrain', 'blood', 'planner'];
const STYLE_CARDS: Record<Style, string[]> = {
  aggressive: ['rend', 'sever', 'bolt', 'circle'], careful: ['repel', 'ward', 'mend', 'sever'], summoner: ['sum_ghoul', 'raise', 'effigy', 'sever'],
  terrain: ['flood', 'chainlight', 'icesheet', 'repel'], blood: ['lance', 'siphon', 'hemorrhage', 'sever'], planner: [],
};

const cardStats: Record<string, { casts: number; dmg: number; mana: number }> = {};
const ownedDepth: Record<string, number[]> = {};
const deaths: Record<string, number> = {};
const deathRegion: Record<string, number> = {};
const styleDepth: Record<string, number[]> = {};
let wins = 0;

const enemyHp = (w: World) => w.units.filter((u) => u.faction === 'enemy' && !u.owner).reduce((s, u) => s + (u.alive ? u.hp : 0), 0);

function act(w: World, dice: { seed: number }, pid: string, style: Style) {
  const ps = playerState(w, pid)!;
  const u = playerUnit(w, ps);
  const A = (a: Action) => applyAction(w, a);
  if (w.phase === 'levelup') {
    if (!ps.picked) A({ t: 'pick', pid, card: ps.offer[Math.floor(rand(dice) * ps.offer.length)] ?? null });
    if (ps.mutationOffer.length) A({ t: 'mutate', pid, mutation: ps.mutationOffer[0] });
    for (const r of ps.runeOffer) A({ t: 'rune', pid, rune: r });
    for (let i = 0; i < 3; i++) A({ t: 'upgrade', pid, stat: (['vitality', 'arcana', 'stride'] as const)[i] });
    A({ t: 'ready', pid });
    return;
  }
  if (w.phase === 'camp') {
    A({ t: 'event', pid, choice: 0 }) || A({ t: 'event', pid, choice: 1 });
    for (const r of Object.keys(RECIPES)) A({ t: 'craft', pid, recipe: r });
    A({ t: 'inscribe', pid, card: STYLE_CARDS[style][0] });
    A({ t: 'rest', pid });
    A({ t: 'route', pid, choice: Math.floor(rand(dice) * 3) });
    A({ t: 'ready', pid });
    return;
  }
  if (w.phase !== 'planning' || !u.alive || u.downed) return;
  if (w.portal) { A({ t: 'move', pid, x: w.portal.x, y: w.portal.y }); return; }
  if (style === 'planner') { plan(w, pid); return; }
  // kill whatever can reach us first: melee foes weigh as if closer
  const danger = (v: { x: number; y: number; range: number }) => Math.hypot(v.x - u.x, v.y - u.y) - (v.range < 100 ? 150 : 0);
  const foes = w.units.filter((v) => v.alive && v.faction === 'enemy' && !v.type.startsWith('urn')).sort((a, b) => danger(a) - danger(b));
  const f = foes[0];
  if (!f) { A({ t: 'endTurn', pid }); return; }
  const d = Math.hypot(f.x - u.x, f.y - u.y);
  const keep = style === 'careful' ? u.range * 0.95 : u.range * 0.7;
  if (d > keep) { const k = (d - keep) / d; A({ t: 'move', pid, x: u.x + (f.x - u.x) * k, y: u.y + (f.y - u.y) * k }); }
  const prefs = [...STYLE_CARDS[style].filter((c) => ps.cards.includes(c)), ...ps.cards];
  for (let i = 0; i < 4; i++) {
    const c = prefs[Math.floor(rand(dice) * Math.min(prefs.length, 6))];
    const spell = rand(dice) < 0.4 && ps.cards.includes('circle') && c !== 'circle' ? ['circle', c] : [c];
    const before = enemyHp(w);
    const cost = spellCost(ps, spell);
    const r = A({ t: 'cast', pid, cards: spell, x: f.x, y: f.y });
    if (r.ok) {
      const s = (cardStats[c] ??= { casts: 0, dmg: 0, mana: 0 });
      s.casts++;
      s.dmg += Math.max(0, before - enemyHp(w));
      s.mana += cost.mana + cost.hp + cost.souls * 20 + cost.stam / 2 + cost.oil / 0.6;
    }
    if (!f.alive) break;
  }
  A({ t: 'endTurn', pid });
}

/**
 * A bot that plays like a careful human: it reads the exact cast preview to pick the spell that
 * removes the most threat per cost, closes to range only when nothing is reachable, and ends each
 * turn at the spot (sampled around it) where predicted incoming damage is lowest.
 */
function plan(w: World, pid: string) {
  const A = (a: Action) => applyAction(w, a);
  const ps = playerState(w, pid)!;
  const u = playerUnit(w, ps);
  const foes = () => w.units.filter((v) => v.alive && v.faction === 'enemy' && !UNITS[v.type].prop);
  const value = (pv: NonNullable<ReturnType<typeof previewCast>>) => {
    let v = 0;
    for (const f of foes()) {
      const a = pv.after.get(f.id);
      if (!a) continue;
      const lost = f.hp - (a.alive ? a.hp : 0);
      v += lost + (a.alive ? 0 : 25 + f.dmg) + (a.alive && a.hp === f.hp ? 0 : 0);
    }
    for (const ally of w.units) if (ally.faction === 'player' && ally.alive) { const a = pv.after.get(ally.id); if (a && a.hp < ally.hp) v -= (ally.hp - a.hp) * (ally.owner ? 3 : 1); }
    return v;
  };
  const combos = () => {
    const c = ps.cards.filter((id) => CARDS[id].mode !== 'mod');
    const out: string[][] = c.map((x) => [x]);
    const tg = c.filter((x) => CARDS[x].school === 'target');
    for (const t of tg) for (const x of c) if (CARDS[x].school !== 'target') out.push([t, x]);
    for (const x of c) out.push([x, x]);
    return out;
  };
  // approach if no foe is within reach
  const fs = foes();
  if (!fs.length) { A({ t: 'endTurn', pid }); return; }
  const nearest = fs.reduce((a, b) => (Math.hypot(a.x - u.x, a.y - u.y) < Math.hypot(b.x - u.x, b.y - u.y) ? a : b));
  if (Math.hypot(nearest.x - u.x, nearest.y - u.y) > u.range) {
    const path = findPath(w, u, nearest, { lavaCost: 30 });
    if (path?.length) {
      // walk along the path until in range, keeping half the stamina for a retreat
      const budget = u.stam * 0.6; let px = u.x, py = u.y, tx = px, ty = py;
      for (const p of path) {
        const d = Math.hypot(p.x - px, p.y - py);
        // step along this leg in small increments until in range or out of budget
        const steps = Math.ceil(d / 8);
        let done = false;
        for (let i = 1; i <= steps; i++) {
          const qx = px + ((p.x - px) * i) / steps, qy = py + ((p.y - py) * i) / steps;
          if (Math.hypot(qx - u.x, qy - u.y) > budget) { done = true; break; }
          tx = qx; ty = qy;
          if (Math.hypot(nearest.x - qx, nearest.y - qy) < u.range * 0.9) { done = true; break; }
        }
        if (done) break;
        px = p.x; py = p.y;
      }
      A({ t: 'move', pid, x: tx, y: ty });
    }
  }
  // cast greedily while something is worth casting
  for (let i = 0; i < 6; i++) {
    let best: { cards: string[]; x: number; y: number; v: number } | null = null;
    for (const f of foes()) {
      if (Math.hypot(f.x - u.x, f.y - u.y) > u.range) continue;
      for (const cards of combos()) {
        const pv = previewCast(w, pid, cards, f);
        if (!pv || !pv.affordable || !pv.inRange || pv.selfDies) continue;
        const cost = spellCost(ps, cards);
        const v = value(pv) / (5 + cost.mana + cost.hp * 2 + cost.souls * 20 + cost.stam / 2 + cost.oil);
        if (value(pv) > 0 && (!best || v > best.v)) best = { cards, x: f.x, y: f.y, v };
      }
    }
    if (false && !best && i === 0) for (const f of foes()) { const pv = previewCast(w, pid, ['sever'], f); console.log('  dbg', f.type, Math.round(Math.hypot(f.x - u.x, f.y - u.y)), u.range, pv && { a: pv.affordable, r: pv.inRange, d: pv.selfDies, v: value(pv), after: pv.after.get(f.id), hp: f.hp }); }
    if (!best) break;
    const before = enemyHp(w);
    const cost = spellCost(ps, best.cards);
    if (!A({ t: 'cast', pid, cards: best.cards, x: best.x, y: best.y }).ok) break;
    const c = best.cards[best.cards.length - 1];
    const s = (cardStats[c] ??= { casts: 0, dmg: 0, mana: 0 });
    s.casts++;
    s.dmg += Math.max(0, before - enemyHp(w));
    s.mana += cost.mana + cost.hp + cost.souls * 20 + cost.stam / 2 + cost.oil / 0.6;
  }
  // retreat to the safest reachable spot
  if (u.stam > 5 && !w.portal) {
    let bestPt = { x: u.x, y: u.y }, bestD = predictThreats(w).dmgTo.get(u.id) ?? 0;
    for (let k = 0; k < 16 && bestD > 0; k++) {
      const ang = (k / 16) * Math.PI * 2;
      for (const r of [u.stam, u.stam * 0.5]) {
        const s2: World = structuredClone({ ...w, events: [] });
        const r2 = applyAction(s2, { t: 'move', pid, x: u.x + Math.cos(ang) * r, y: u.y + Math.sin(ang) * r });
        if (!r2.ok) continue;
        const su = playerUnit(s2, playerState(s2, pid)!);
        const d = (predictThreats(s2).dmgTo.get(su.id) ?? 0) + (u.hp - su.hp) * 2 + (su.alive ? 0 : 999);
        if (d < bestD) { bestD = d; bestPt = { x: su.x, y: su.y }; }
      }
    }
    if (bestPt.x !== u.x || bestPt.y !== u.y) A({ t: 'move', pid, x: bestPt.x, y: bestPt.y });
  }
  A({ t: 'endTurn', pid });
}

for (let run = 0; run < RUNS; run++) {
  const style = STYLES[run % STYLES.length];
  const w = createWorld(9000 + run, [{ pid: 'p1', name: 'Bot', cls: 'spellwright', origin: 'knight' }]);
  w.players[0].cards.push(...STYLE_CARDS[style].filter((c) => !w.players[0].cards.includes(c)));
  const dice = { seed: run * 31 + 7 };
  for (let t = 0; t < 400 && w.phase !== 'dead' && w.phase !== 'victory'; t++) {
    const hp0 = playerUnit(w, w.players[0]).hp, turn0 = w.turn;
    act(w, dice, 'p1', style);
    if (process.env.TRACE && run === Number(process.env.TRACE)) {
      const u = playerUnit(w, w.players[0]);
      const fs = w.units.filter((v) => v.alive && v.faction === 'enemy' && !UNITS[v.type].prop);
      console.log(`L${w.level} t${turn0} ${w.phase} hp ${hp0}->${u.hp}/${u.maxHp} mana ${u.mana} cards ${w.players[0].cards.join(',')} foes ${fs.map((f) => `${f.type}:${f.hp}@${Math.round(Math.hypot(f.x - u.x, f.y - u.y))}`).join(' ')}`);
      for (const e of w.events) if (e.k === 'log' || e.k === 'hurt' || e.k === 'spawn') console.log('   ', JSON.stringify(e).slice(0, 140));
    }
    w.events.length = 0;
  }
  const depth = w.level;
  (styleDepth[style] ??= []).push(depth);
  for (const c of w.players[0].cards) (ownedDepth[c] ??= []).push(depth);
  if (w.phase === 'victory') wins++;
  if (w.phase === 'dead') {
    const u = playerUnit(w, w.players[0]);
    const near = w.units.filter((v) => v.alive && v.faction === 'enemy' && !v.type.startsWith('urn')).sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y))[0];
    const k = near ? UNITS[near.type].name : 'the environment';
    deaths[k] = (deaths[k] ?? 0) + 1;
    deathRegion[BIOMES[w.run.region].name] = (deathRegion[BIOMES[w.run.region].name] ?? 0) + 1;
  }
}

const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const overall = avg(Object.values(styleDepth).flat());
const rows = CARD_IDS.map((id) => {
  const s = cardStats[id];
  const dpm = s && s.mana ? s.dmg / s.mana : 0;
  const od = avg(ownedDepth[id] ?? []);
  return { id, name: CARDS[id].name, casts: s?.casts ?? 0, dpm, owned: (ownedDepth[id] ?? []).length, depthDelta: od ? od - overall : 0 };
});
const flag = (r: (typeof rows)[number]) => (r.casts >= 20 && r.dpm > 2.2 ? ' **(high)**' : r.casts >= 20 && r.dpm < 0.25 && CARDS[r.id].school === 'harm' ? ' **(low)**' : '');
const lines = [
  `# Balance report`,
  ``,
  `${RUNS} seeded solo runs, 5 bot play styles, up to 400 turns each. Generated ${new Date().toISOString().slice(0, 10)}.`,
  ``,
  `Average depth reached: **${overall.toFixed(1)}**. Wins: **${wins}/${RUNS}**.`,
  ``,
  `## Depth by play style`,
  ``,
  `| Style | Runs | Average depth | Best |`,
  `| --- | ---: | ---: | ---: |`,
  ...Object.entries(styleDepth).map(([s, d]) => `| ${s} | ${d.length} | ${avg(d).toFixed(1)} | ${Math.max(...d)} |`),
  ``,
  `Runs ending at each depth: ${[...new Set(Object.values(styleDepth).flat())].sort((a, b) => a - b).map((d) => `${d}: ${Object.values(styleDepth).flat().filter((x) => x === d).length}`).join(' · ')}`,
  ``,
  `## Cards: damage per mana-equivalent and depth when owned`,
  ``,
  `Yardstick: Sever deals 1.0 damage per mana in a vacuum. Area cards score higher in crowds. Flags mark outliers worth a look.`,
  ``,
  `| Card | Casts | Damage per mana | Runs owned | Depth vs average |`,
  `| --- | ---: | ---: | ---: | ---: |`,
  ...rows.sort((a, b) => b.dpm - a.dpm).map((r) => `| ${r.name}${flag(r)} | ${r.casts} | ${r.dpm.toFixed(2)} | ${r.owned} | ${r.depthDelta >= 0 ? '+' : ''}${r.depthDelta.toFixed(2)} |`),
  ``,
  `## What kills players`,
  ``,
  `| Nearest foe at death | Deaths |`,
  `| --- | ---: |`,
  ...Object.entries(deaths).sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k} | ${n} |`),
  ``,
  `| Region of death | Deaths |`,
  `| --- | ---: |`,
  ...Object.entries(deathRegion).sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k} | ${n} |`),
  ``,
  `Bots are blunt players; read these numbers as relative, and pair them with notes from real play.`,
];
mkdirSync('reports', { recursive: true });
writeFileSync('reports/balance.md', lines.join('\n'));
console.log(lines.slice(0, 16).join('\n'));

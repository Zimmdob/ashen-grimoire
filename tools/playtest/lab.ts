// Cinderstorm playtest lab: bots that dodge by prediction play whole runs, the way a player would
// (doors, cards, relics, boons, Overdrive), and every room is measured.
// Build + run: npm run playtest -- --runs 600 --out /tmp/pt.jsonl
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { appendFileSync, writeFileSync } from 'node:fs';
import {
  addRelic, AH, AW, boonChoices, BOONS, CLASSES, doorChoices, enterRoom, isWall, newRun, nextAct, NO_INPUT, onBeat, relicChoices, rewardChoices,
  spikesUp, spikesWarn, takeBoon, update, type ClassId, type Difficulty, type Input, type StormWorld,
} from '../../src/storm/sim';
import { BASES, MAX_MODS, MODS, RELICS, spellStats, STORM_CARDS } from '../../src/storm/cards';
import { T_LAVA } from '../../src/sim/constants';

export interface Skill { name: string; every: number; look: number; sense: number; focus: boolean; blink: boolean; surge: number; aimErr: number; noise: number }
export const SKILLS: Record<string, Skill> = {
  novice: { name: 'novice', every: 14, look: 0.12, sense: 70, focus: false, blink: false, surge: 0.3, aimErr: 0.3, noise: 0.9 },
  average: { name: 'average', every: 6, look: 0.2, sense: 110, focus: false, blink: true, surge: 0.8, aimErr: 0.15, noise: 0.4 },
  expert: { name: 'expert', every: 1, look: 0.32, sense: 170, focus: true, blink: true, surge: 1, aimErr: 0.04, noise: 0.08 },
};

interface RoomLog {
  act: number; room: number; kind: string; twist: string | null; enc: string; layout: string; secs: number; hits: number; danger: number; idle: number;
  lvl0: number; lvl1: number; ttk: number; causes: Record<string, number>; surges: number; died: boolean; boss: string | null;
}
export interface RunLog {
  seed: number; cls: ClassId; diff: Difficulty; skill: string; won: boolean; acts: number; rooms: RoomLog[]; secs: number; level: number; boons: Record<string, number>;
  relics: string[]; spells: string[][]; deathRoom: string | null; bestCombo: number; levelTimes: number[];
}

/** One planning step: pick the direction whose predicted path stays furthest from harm. */
function plan(w: StormWorld, sk: Skill, rng: () => number, state: { dir: number; focus: boolean; hold: number; want: number }) {
  // attention lapses: the less skilled sometimes just keep going
  if (rng() < (sk.name === 'novice' ? 0.12 : sk.name === 'average' ? 0.04 : 0)) return 0;
  const p = w.player;
  const near = w.bullets.filter((b) => !b.friendly && Math.abs(b.x - p.x) < sk.sense && Math.abs(b.y - p.y) < sk.sense);
  const target = nearestFoe(w);
  const opts: { a: number; f: boolean }[] = [{ a: NaN, f: false }];
  for (let i = 0; i < 12; i++) opts.push({ a: (i / 12) * Math.PI * 2, f: false });
  if (sk.focus) for (let i = 0; i < 8; i++) opts.push({ a: (i / 8) * Math.PI * 2, f: true });
  let best = opts[0], bestC = Infinity, worst = 0;
  for (const o of opts) {
    const sp = (o.f ? 85 : 175) * p.speedMul;
    let c = 0;
    for (const t of [sk.look * 0.4, sk.look]) {
      const x = isNaN(o.a) ? p.x : p.x + Math.cos(o.a) * sp * t, y = isNaN(o.a) ? p.y : p.y + Math.sin(o.a) * sp * t;
      if (isWall(w, x - 6, y - 6) || isWall(w, x + 6, y + 6) || isWall(w, x + 6, y - 6) || isWall(w, x - 6, y + 6)) { c += 1e5; continue; }
      for (const b of near) {
        const bx = b.x + b.vx * t, by = b.y + b.vy * t, d = Math.hypot(bx - x, by - y) - b.r - 4;
        if (d < 22) c += (22 - d) * (22 - d) * (t < sk.look * 0.5 ? 2 : 1);
      }
      for (const h of w.hazards) {
        if (h.kind === 'spikes') { if ((spikesUp(h, w.time + t) || spikesWarn(h, w.time + t)) && Math.abs(x - h.x) < h.r + 5 && Math.abs(y - h.y) < h.r + 5) c += 900; }
        else if (h.kind === 'pool') { if (Math.hypot(x - h.x, y - h.y) < h.r * 0.8 + 10 && h.t + t > h.warn - 0.5) c += 1500; }
        else { const ux = Math.cos(h.ang), uy = Math.sin(h.ang), px = x - h.x, py = y - h.y; if (px * ux + py * uy > 0 && Math.abs(px * uy - py * ux) < h.r + 12) c += h.t + t > h.warn - 0.3 ? 2500 : 300; }
      }
      for (const f of w.foes) {
        if (f.state === 'spawn') continue;
        // where the foe will be: charges fly straight, walkers close in
        let fx = f.x, fy = f.y;
        if (f.state === 'charge') { fx += f.vx * t; fy += f.vy * t; }
        else if (f.state === 'move') { const dd = Math.hypot(p.x - f.x, p.y - f.y) || 1; fx += ((p.x - f.x) / dd) * f.speed * t; fy += ((p.y - f.y) / dd) * f.speed * t; }
        const d = Math.hypot(fx - x, fy - y);
        if (d < f.r + 18) c += 2000;
        // a wind-up aims at you: get off the line
        if (f.state === 'wind' || f.state === 'charge') {
          const ux = f.state === 'charge' ? f.vx : p.x - f.x, uy = f.state === 'charge' ? f.vy : p.y - f.y, L = Math.hypot(ux, uy) || 1;
          const px = x - f.x, py = y - f.y, along = (px * ux + py * uy) / L, perp = Math.abs(px * uy - py * ux) / L;
          if (along > 0 && perp < f.r + 16) c += 1200;
        }
      }
      const tile = w.map[Math.floor(y / 32)]?.[Math.floor(x / 32)];
      if (tile === T_LAVA) c += 800;
      // stay in the room, at a sensible range from the target
      const edge = Math.min(x, y, AW - x, AH - y);
      if (edge < 70) c += (70 - edge) * 2;
      if (target) { const d = Math.hypot(target.x - x, target.y - y); c += Math.abs(d - state.want) * 0.15; }
    }
    c *= 1 + (rng() - 0.5) * sk.noise;
    if (!isNaN(o.a) && o.a === state.dir) c *= 0.85; // a little inertia, like a hand on the keys
    worst = Math.max(worst, c);
    if (c < bestC) { bestC = c; best = o; }
  }
  state.dir = best.a; state.focus = best.f;
  return bestC;
}
function nearestFoe(w: StormWorld) {
  const p = w.player;
  let best: StormWorld['foes'][number] | null = null, bd = Infinity;
  for (const f of w.foes) { if (f.state === 'spawn') continue; const d = Math.hypot(f.x - p.x, f.y - p.y) * (f.boss ? 0.6 : 1); if (d < bd) { bd = d; best = f; } }
  return best;
}

function mulberry(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Cards, the way a reasonable player builds: a strong first spell, a utility second. */
function takeCard(w: StormWorld, id: string, owned: string[]) {
  owned.push(id);
  const c = STORM_CARDS[id];
  if (!c) return;
  if (c.kind === 'mod') {
    for (const slot of [0, 1] as const) {
      const sp = w.spells[slot];
      const before = spellStats(sp), after = spellStats([...sp, id]);
      const pw = (x: ReturnType<typeof spellStats>) => (x ? x.dmg * x.count * x.rate * (x.orbit || x.turret ? 0.5 : 1) : 0);
      if (sp.length - 1 < MAX_MODS && after && (slot === 1 || pw(after) >= pw(before) * 0.95)) { sp.push(id); return; }
    }
  } else {
    // a new base: try it as the second spell if it looks stronger
    const cur = spellStats(w.spells[1]), alt = spellStats([id, ...w.spells[1].slice(1)]);
    if (alt && (!cur || alt.dmg * alt.rate * alt.count > cur.dmg * cur.rate * cur.count)) w.spells[1] = [id, ...w.spells[1].slice(1)];
  }
}

export function playRun(seed: number, cls: ClassId, diff: Difficulty, sk: Skill, boonPolicy: 'random' | 'first' = 'random'): RunLog {
  const rng = mulberry(seed * 7 + 1);
  const w = newRun({ seed, diff, cls });
  const owned = [...CLASSES[cls].owned];
  const log: RunLog = { seed, cls, diff, skill: sk.name, won: false, acts: 0, rooms: [], secs: 0, level: 1, boons: {}, relics: [], spells: [], deathRoom: null, bestCombo: 0, levelTimes: [] };
  const st = { dir: NaN, focus: false, hold: 0, want: 200 };
  let lastHp = 0, stuckT = 0;
  let total = 0, lastLevel = 1, lastLevelAt = 0;
  for (let guard = 0; guard < 60; guard++) {
    const r: RoomLog = { act: w.act, room: w.room, kind: w.kind, twist: w.twist, enc: w.encounter, layout: w.layout, secs: 0, hits: 0, danger: 0, idle: 0, lvl0: w.player.level, lvl1: 0, ttk: 0, causes: {}, surges: 0, died: false, boss: w.kind === 'boss' ? w.waves[0]?.[0]?.type ?? null : null };
    let t = 0, beat = 0, danger = 0, idle = 0, kills0 = w.stats.kills, odPrev = 0;
    const fighting = w.kind === 'fight' || w.kind === 'elite' || w.kind === 'boss';
    while (fighting && !w.cleared && !w.player.dead && t < 60 * 400) {
      if (t % 18 === 0) onBeat(w, beat++);
      while (w.pendingLevels > 0) { const ch = boonChoices(w); if (!ch.length) { w.pendingLevels = 0; break; } takeBoon(w, boonPolicy === 'first' ? ch[0] : ch[Math.floor(rng() * ch.length)]); }
      const p = w.player;
      let cost = 0;
      {
        const s0 = spellStats(w.spells[0]);
        const range = s0 ? (s0.orbit || s0.turret ? 50 : Math.min(420, s0.speed * s0.life)) : 200;
        const hpNow = w.foes.reduce((a, f) => a + f.hp, 0);
        stuckT = hpNow < lastHp - 0.01 || !w.foes.length ? 0 : stuckT + 1 / 60;
        lastHp = hpNow;
        st.want = Math.max(40, Math.min(200, range * 0.6)) * (stuckT > 4 ? 0.4 : 1);
      }
      if (t % sk.every === 0) cost = plan(w, sk, rng, st);
      const tgt = nearestFoe(w);
      const err = (rng() - 0.5) * sk.aimErr * 2;
      let mx = p.x, my = p.y - 50;
      if (tgt) { const a = Math.atan2(tgt.y - p.y, tgt.x - p.x) + err, d = Math.hypot(tgt.x - p.x, tgt.y - p.y); mx = p.x + Math.cos(a) * d; my = p.y + Math.sin(a) * d; }
      const a = st.dir;
      const inp: Input = {
        ...NO_INPUT, mx, my, fireA: !!tgt, fireB: !!tgt && p.mana > 45,
        left: !isNaN(a) && Math.cos(a) < -0.38, right: !isNaN(a) && Math.cos(a) > 0.38, up: !isNaN(a) && Math.sin(a) < -0.38, down: !isNaN(a) && Math.sin(a) > 0.38,
        focus: st.focus,
        blink: sk.blink && cost > 2500 && p.blinkCd <= 0,
        bomb: p.bombs > 0 && cost > 4000 && p.hp <= 2,
        surge: w.heat >= 100 && w.foes.length > 0 && rng() < sk.surge * 0.05,
      };
      const hits0 = w.stats.hitsTaken;
      // what's around, to name the cause of any hit
      const pre = w.bullets.filter((b) => !b.friendly && Math.hypot(b.x - p.x, b.y - p.y) < 30).map((b) => ({ age: b.age, saw: b.bounce > 1e6 }));
      const preFoe = w.foes.some((f) => Math.hypot(f.x - p.x, f.y - p.y) < f.r + 12);
      const preHaz = w.hazards.some((h) => h.kind !== 'spikes' ? Math.hypot(h.x - p.x, h.y - p.y) < (h.kind === 'pool' ? h.r + 8 : 9999) : Math.abs(h.x - p.x) < h.r + 4 && Math.abs(h.y - p.y) < h.r + 4);
      update(w, inp);
      if (w.overdrive > 0 && odPrev <= 0) r.surges++;
      odPrev = w.overdrive;
      if (w.stats.hitsTaken > hits0) {
        r.hits++;
        const k = pre.length ? (pre.some((b) => b.saw) ? 'sawblade' : pre.some((b) => b.age < 0.25) ? 'pointblank' : 'bullet') : preFoe ? 'contact' : preHaz ? 'hazard' : w.map[Math.floor(p.y / 32)]?.[Math.floor(p.x / 32)] === T_LAVA ? 'lava' : 'other';
        r.causes[k] = (r.causes[k] ?? 0) + 1;
      }
      if (w.player.level !== lastLevel) { log.levelTimes.push((total + t) / 60 - lastLevelAt); lastLevelAt = (total + t) / 60; lastLevel = w.player.level; }
      if (w.bullets.some((b) => !b.friendly && Math.hypot(b.x - p.x, b.y - p.y) < 60)) danger++;
      if (!w.foes.length) idle++;
      t++;
    }
    total += t;
    r.secs = t / 60; r.danger = t ? danger / t : 0; r.idle = t ? idle / t : 0; r.lvl1 = w.player.level;
    const k = w.stats.kills - kills0; r.ttk = k ? r.secs / k : 0;
    r.died = w.player.dead;
    if (fighting) log.rooms.push(r);
    if (t >= 60 * 400) (log as RunLog & { stall?: string }).stall = w.foes.map((f) => `${f.type}:${f.state}:${Math.round(f.hp)}@${Math.round(f.x)},${Math.round(f.y)}${isWall(w, f.x, f.y) ? ':INWALL' : ''}`).join(' ') + ` waves ${w.waves.length} twist ${w.twist} layout ${w.layout} p@${Math.round(w.player.x)},${Math.round(w.player.y)}`;
    if (w.player.dead || t >= 60 * 400) { log.deathRoom = `${w.act}.${w.room}.${w.kind}${w.twist ? '.' + w.twist : ''}`; break; }
    // between rooms, like the game: rewards, then a door
    const p = w.player;
    if (w.kind === 'boss') {
      const rel = relicChoices(w, 3); if (rel.length) addRelic(w, rel[Math.floor(rng() * rel.length)]);
      p.hp = Math.min(p.maxHp, p.hp + 2);
      log.acts++;
      if (!nextAct(w)) { log.won = true; break; }
      continue;
    }
    if (w.kind === 'elite') { const rel = relicChoices(w, 2); if (rel.length) addRelic(w, rel[Math.floor(rng() * rel.length)]); }
    if (w.kind === 'fight' || w.kind === 'elite') {
      // a sensible player: take the card that most improves the spell it lands in (with some whim)
      const ch = rewardChoices(w, owned, BASES, MODS);
      const power = (sp: string[]) => { const x = spellStats(sp); return x ? x.dmg * x.count * x.rate * (x.orbit || x.turret ? 0.5 : 1) * (1 + x.pierce * 0.3 + x.chain * 0.3 + x.homing) : 0; };
      const score = (id: string) => { const c = STORM_CARDS[id]; if (!c || c.kind !== 'mod') return 0.5; return Math.max(...([0, 1] as const).map((k) => w.spells[k].length - 1 < MAX_MODS ? power([...w.spells[k], id]) / Math.max(1, power(w.spells[k])) : 0)); };
      const pickC = rng() < 0.2 ? ch[Math.floor(rng() * ch.length)] : ch.reduce((a, c) => (score(c) > score(a) ? c : a));
      takeCard(w, pickC, owned);
    }
    const doors = doorChoices(w);
    // players lean towards fights early and healing when hurt
    let pickD = doors[Math.floor(rng() * doors.length)];
    if (p.hp <= 2 && doors.includes('shrine')) pickD = 'shrine';
    else if (p.hp <= 2 && doors.includes('shop')) pickD = 'shop';
    enterRoom(w, w.room + 1, pickD);
    if (pickD === 'treasure') { const rel = relicChoices(w, 3); if (rel.length) addRelic(w, rel[Math.floor(rng() * rel.length)]); }
    if (pickD === 'shrine') { if (p.hp < p.maxHp) p.hp = p.maxHp; }
    if (pickD === 'shop') { if (p.hp < p.maxHp && p.cinders >= 20) { p.cinders -= 20; p.hp++; } const rel = relicChoices(w, 2).find((id) => RELICS[id].price <= p.cinders); if (rel) { p.cinders -= RELICS[rel].price; addRelic(w, rel); } }
    if (pickD === 'event') { /* events vary; treat as a small boon */ p.cinders += 20; }
    if (!(w.kind === 'fight' || w.kind === 'elite' || w.kind === 'boss')) { enterRoom(w, w.room + 1, doorChoices(w)[0] === 'boss' ? 'boss' : 'fight'); }
  }
  log.secs = total / 60; log.level = w.player.level; log.boons = { ...w.player.boons }; log.relics = [...w.player.relics]; log.spells = w.spells.map((s) => [...s]); log.bestCombo = w.bestCombo;
  return log;
}

// ------------------------------------------------------------------ the farm: two workers, results as JSON lines
if (!isMainThread && workerData) {
  const jobs = workerData.jobs as { seed: number; cls: ClassId; diff: Difficulty; skill: string }[];
  for (const j of jobs) parentPort!.postMessage(playRun(j.seed, j.cls, j.diff, SKILLS[j.skill]));
  parentPort!.postMessage(null);
} else if (isMainThread && process.argv[1]?.includes('lab')) {
  const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const runs = Number(arg('runs', '200')), out = arg('out', '/tmp/pt.jsonl'), base = Number(arg('seed', '1'));
  const skills = arg('skills', 'novice,average,expert').split(','), diffs = arg('diffs', 'normal').split(',') as Difficulty[];
  const classes = (arg('classes', Object.keys(CLASSES).join(','))).split(',') as ClassId[];
  const jobs = Array.from({ length: runs }, (_, i) => ({ seed: base + i * 7919, cls: classes[i % classes.length], diff: diffs[Math.floor(i / classes.length) % diffs.length], skill: skills[Math.floor(i / (classes.length * diffs.length)) % skills.length] }));
  writeFileSync(out, '');
  const n = Number(arg('workers', '2'));
  let done = 0, alive = n;
  const t0 = Date.now();
  for (let k = 0; k < n; k++) {
    const wk = new Worker(process.argv[1], { workerData: { jobs: jobs.filter((_, i) => i % n === k) } });
    wk.on('message', (m) => {
      if (m === null) { if (--alive === 0) console.log(`done: ${done} runs in ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${out}`); return; }
      appendFileSync(out, JSON.stringify(m) + '\n');
      if (++done % 50 === 0) console.log(`${done}/${runs} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    });
  }
  void BOONS;
}

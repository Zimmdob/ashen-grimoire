import { TILE, T_FLOOR, T_WALL, T_WATER } from '../sim/constants';
import { spellStats, type SpellStats } from './cards';

// Cinderstorm's real-time simulation. Pure data and a fixed time step: given the same seed and the
// same inputs it plays out the same way, which is what co-op (rollback) will need later.

export const MW = 32, MH = 20;
export const AW = MW * TILE, AH = MH * TILE;
export const STEP = 1 / 60;

export interface Input { up: boolean; down: boolean; left: boolean; right: boolean; mx: number; my: number; fireA: boolean; fireB: boolean; blink: boolean; focus: boolean }
export const NO_INPUT: Input = { up: false, down: false, left: false, right: false, mx: 0, my: 0, fireA: false, fireB: false, blink: false, focus: false };

export interface Bullet {
  id: number; x: number; y: number; vx: number; vy: number; r: number; dmg: number; life: number;
  friendly: boolean; color: number;
  pierce: number; chain: number; homing: number; burn: number; slow: number;
  orbit: { t: number; ang: number; rad: number; spin: number } | null;
  burst: { after: number; n: number; dmg: number } | null;
  hit: number[];
  /** Foe shots can "wake" slowly so they read as they appear. */
  wake: number;
}
export type FoeType = 'boar' | 'thornling' | 'xbow' | 'hag' | 'stag';
export interface Foe {
  id: number; type: FoeType; x: number; y: number; r: number; hp: number; maxHp: number; speed: number;
  t: number; state: 'spawn' | 'move' | 'wind' | 'charge' | 'rest'; st: number;
  vx: number; vy: number; slow: number; burnT: number; burnDps: number; flash: number; ang: number; beats: number;
  boss: boolean;
}
export interface Fx { kind: 'hit' | 'die' | 'blink' | 'spawn' | 'hurt' | 'burst' | 'ring'; x: number; y: number; color: number; t: number; dur: number; r?: number }
export interface Player {
  x: number; y: number; r: number; hp: number; maxHp: number; mana: number; maxMana: number;
  inv: number; blinkCd: number; cdA: number; cdB: number; face: number; moving: boolean; dead: boolean;
}
export type RoomKind = 'fight' | 'boss';
export interface StormWorld {
  seed: number; time: number; map: number[][]; room: number; rooms: number; kind: RoomKind;
  player: Player; foes: Foe[]; bullets: Bullet[]; fx: Fx[];
  spells: [string[], string[]];
  /** Waves still to come in this room (each a list of foes to summon). */
  waves: FoeType[][]; waveDelay: number;
  cleared: boolean; nextId: number;
  /** Sounds for the game to play this frame. */
  sounds: string[];
  echoes: { at: number; slot: 0 | 1; ang: number }[];
  bossName: string;
  stats: { kills: number; shots: number; hitsTaken: number };
}

// ------------------------------------------------------------------ randomness (seeded)
export function rand(w: StormWorld): number {
  let s = (w.seed = (w.seed + 0x6d2b79f5) | 0);
  s = Math.imul(s ^ (s >>> 15), s | 1);
  s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
  return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ arena
function makeArena(w: StormWorld, boss: boolean): number[][] {
  const map: number[][] = [];
  for (let y = 0; y < MH; y++) map.push(Array.from({ length: MW }, (_, x) => (x === 0 || y === 0 || x === MW - 1 || y === MH - 1 ? T_WALL : T_FLOOR)));
  // ragged tree line around the edge
  for (let i = 0; i < 26; i++) {
    const side = Math.floor(rand(w) * 4), k = Math.floor(rand(w) * (side < 2 ? MW : MH));
    if (side === 0) map[1][k] = T_WALL; else if (side === 1) map[MH - 2][k] = T_WALL; else if (side === 2) map[k][1] = T_WALL; else map[k][MW - 2] = T_WALL;
  }
  if (!boss) {
    // a few groves to duck behind (foe shots break on trees)
    const groves = 4 + Math.floor(rand(w) * 3);
    for (let g = 0; g < groves; g++) {
      const gx = 5 + Math.floor(rand(w) * (MW - 10)), gy = 4 + Math.floor(rand(w) * (MH - 8));
      if (Math.abs(gx - MW / 2) < 4 && Math.abs(gy - MH / 2) < 3) continue;
      const shape = rand(w) < 0.5 ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0], [2, 0]];
      for (const [dx, dy] of shape) map[gy + dy][gx + dx] = T_WALL;
    }
    // a stream
    if (rand(w) < 0.6) { const sy = 3 + Math.floor(rand(w) * (MH - 6)); for (let x = 2; x < MW - 2; x++) if (map[sy][x] === T_FLOOR && rand(w) < 0.85) map[sy][x] = T_WATER; }
  } else {
    // the Stag's ring: four old oaks
    for (const [x, y] of [[8, 5], [MW - 9, 5], [8, MH - 6], [MW - 9, MH - 6]]) map[y][x] = map[y][x + 1] = T_WALL;
  }
  return map;
}

export const isWall = (w: StormWorld, x: number, y: number) => {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  return tx < 0 || ty < 0 || tx >= MW || ty >= MH || w.map[ty][tx] === T_WALL;
};
const blocked = (w: StormWorld, x: number, y: number, r: number) =>
  isWall(w, x - r, y - r) || isWall(w, x + r, y - r) || isWall(w, x - r, y + r) || isWall(w, x + r, y + r);
const inWater = (w: StormWorld, x: number, y: number) => w.map[Math.floor(y / TILE)]?.[Math.floor(x / TILE)] === T_WATER;

/** Move a body, sliding along walls. */
function slide(w: StormWorld, b: { x: number; y: number; r: number }, dx: number, dy: number) {
  if (!blocked(w, b.x + dx, b.y, b.r)) b.x += dx;
  if (!blocked(w, b.x, b.y + dy, b.r)) b.y += dy;
}

// ------------------------------------------------------------------ setup
export const ROOMS = 4;
const ROOM_WAVES: FoeType[][][] = [
  [['boar', 'boar', 'thornling'], ['thornling', 'boar', 'thornling']],
  [['xbow', 'thornling', 'thornling'], ['boar', 'xbow', 'boar', 'thornling']],
  [['hag', 'boar', 'boar'], ['xbow', 'xbow', 'thornling', 'thornling', 'boar']],
];
const FOE_STATS: Record<FoeType, { hp: number; r: number; speed: number }> = {
  boar: { hp: 34, r: 11, speed: 70 },
  thornling: { hp: 26, r: 9, speed: 38 },
  xbow: { hp: 30, r: 10, speed: 60 },
  hag: { hp: 90, r: 12, speed: 36 },
  stag: { hp: 1500, r: 22, speed: 55 },
};

export function newRun(seed: number): StormWorld {
  const w: StormWorld = {
    seed: seed | 0, time: 0, map: [], room: 0, rooms: ROOMS, kind: 'fight',
    player: { x: AW / 2, y: AH / 2, r: 5, hp: 6, maxHp: 6, mana: 100, maxMana: 100, inv: 0, blinkCd: 0, cdA: 0, cdB: 0, face: 0, moving: false, dead: false },
    foes: [], bullets: [], fx: [], spells: [['ember'], ['thorn']], waves: [], waveDelay: 0, cleared: false, nextId: 1, sounds: [], echoes: [],
    bossName: 'The Old Stag', stats: { kills: 0, shots: 0, hitsTaken: 0 },
  };
  enterRoom(w, 1);
  return w;
}

export function enterRoom(w: StormWorld, room: number) {
  w.room = room;
  w.kind = room === ROOMS ? 'boss' : 'fight';
  w.map = makeArena(w, w.kind === 'boss');
  w.foes = []; w.bullets = []; w.echoes = []; w.cleared = false;
  const p = w.player;
  p.x = AW / 2; p.y = AH - TILE * 3.5; p.inv = 1.2;
  p.hp = Math.min(p.maxHp, p.hp + (room > 1 ? 1 : 0));
  p.mana = p.maxMana;
  w.waves = w.kind === 'boss' ? [['stag']] : ROOM_WAVES[room - 1].map((wv) => [...wv]);
  w.waveDelay = 1.2;
}

function spawnFoe(w: StormWorld, type: FoeType) {
  const s = FOE_STATS[type];
  let x = 0, y = 0;
  for (let i = 0; i < 40; i++) {
    x = TILE * 2.5 + rand(w) * (AW - TILE * 5);
    y = TILE * 2.5 + rand(w) * (AH * 0.55);
    if (type === 'stag') { x = AW / 2; y = TILE * 5; }
    if (!blocked(w, x, y, s.r + 4) && Math.hypot(x - w.player.x, y - w.player.y) > 220) break;
  }
  const f: Foe = { id: w.nextId++, type, x, y, r: s.r, hp: s.hp, maxHp: s.hp, speed: s.speed, t: rand(w) * 2, state: 'spawn', st: type === 'stag' ? 1.6 : 0.8, vx: 0, vy: 0, slow: 0, burnT: 0, burnDps: 0, flash: 0, ang: rand(w) * Math.PI * 2, beats: 0, boss: type === 'stag' };
  w.foes.push(f);
  w.fx.push({ kind: 'spawn', x, y, color: type === 'stag' ? 0xffd06a : 0xff5a4a, t: w.time, dur: f.st, r: s.r * 2 });
}

// ------------------------------------------------------------------ shooting
function foeShot(w: StormWorld, x: number, y: number, ang: number, speed: number, r = 5, color = 0xff4a6a) {
  w.bullets.push({ id: w.nextId++, x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r, dmg: 1, life: 9, friendly: false, color, pierce: 0, chain: 0, homing: 0, burn: 0, slow: 0, orbit: null, burst: null, hit: [], wake: 0.12 });
}
const ring = (w: StormWorld, f: Foe, n: number, speed: number, off: number, color?: number) => { for (let i = 0; i < n; i++) foeShot(w, f.x, f.y, off + (i / n) * Math.PI * 2, speed, 5, color); };
const aimAt = (f: Foe, p: Player) => Math.atan2(p.y - f.y, p.x - f.x);

function fireSpell(w: StormWorld, slot: 0 | 1, ang: number, s: SpellStats, isEcho = false) {
  const p = w.player;
  const n = s.count;
  for (let i = 0; i < n; i++) {
    const a = s.ring ? ang + (i / n) * Math.PI * 2 : ang + (n > 1 ? (i / (n - 1) - 0.5) * s.spread * (n > 3 ? 1.4 : 1) : 0);
    const b: Bullet = {
      id: w.nextId++, x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 10, vx: Math.cos(a) * s.speed, vy: Math.sin(a) * s.speed,
      r: s.size, dmg: s.dmg, life: s.life, friendly: true, color: s.color, pierce: s.pierce, chain: s.chain, homing: s.homing,
      burn: s.burn, slow: s.slow, burst: s.burst ? { ...s.burst } : null, hit: [], wake: 0,
      orbit: s.orbit ? { t: 1.1, ang: a, rad: 30 + (i % 3) * 8, spin: 5 } : null,
    };
    w.bullets.push(b);
  }
  w.stats.shots++;
  w.sounds.push(slot === 0 ? 'shoot' : 'cast');
  if (s.echo && !isEcho) w.echoes.push({ at: w.time + 0.2, slot, ang });
}

// ------------------------------------------------------------------ the beat
/**
 * Called on every eighth note of the music. Thornlings, the hag and the Stag fire in time with it,
 * so the patterns have a rhythm you can feel.
 */
export function onBeat(w: StormWorld, step: number) {
  const p = w.player;
  if (p.dead) return;
  for (const f of w.foes) {
    if (f.state === 'spawn') continue;
    f.beats++;
    switch (f.type) {
      case 'thornling':
        if (step % 8 === (f.id % 4) * 2) { ring(w, f, 8, 95, f.ang); f.ang += 0.2; }
        break;
      case 'hag':
        // a slow two-armed spiral, every beat
        if (step % 2 === 0) { for (let k = 0; k < 2; k++) foeShot(w, f.x, f.y, f.ang + k * Math.PI, 105, 5, 0xc890ff); f.ang += 0.32; }
        if (step % 16 === 8) for (let k = -2; k <= 2; k++) foeShot(w, f.x, f.y, aimAt(f, p) + k * 0.16, 150, 5, 0xc890ff);
        break;
      case 'stag': {
        const ph = f.hp / f.maxHp;
        if (ph > 0.66) {
          // first antler-song: rings that swap their gaps every other note
          if (step % 2 === 0) ring(w, f, 14, 105, (step % 4 === 0 ? 0 : Math.PI / 14), 0xffd06a);
        } else if (ph > 0.33) {
          // three-armed spiral on every note, with a five-shot fan at the bar
          for (let k = 0; k < 3; k++) foeShot(w, f.x, f.y, f.ang + (k / 3) * Math.PI * 2, 120, 5, 0xffb04a);
          f.ang += 0.21;
          if (step % 8 === 0) for (let k = -2; k <= 2; k++) foeShot(w, f.x, f.y, aimAt(f, p) + k * 0.13, 175, 6, 0xff6a3a);
        } else {
          // last stand: counter-turning spirals, and a ring at every bar
          for (let k = 0; k < 2; k++) {
            foeShot(w, f.x, f.y, f.ang + k * Math.PI, 125, 5, 0xff8a3a);
            foeShot(w, f.x, f.y, -f.ang + k * Math.PI + 0.5, 110, 5, 0xffd06a);
          }
          f.ang += 0.17;
          if (step % 8 === 0) ring(w, f, 20, 90, step * 0.13, 0xff4a2a);
        }
        break;
      }
    }
  }
}

// ------------------------------------------------------------------ one tick
export function update(w: StormWorld, inp: Input, dt = STEP) {
  w.time += dt;
  w.sounds.length = 0;
  const p = w.player;
  if (!p.dead) {
    // move
    let mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), my = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    const m = Math.hypot(mx, my);
    p.moving = m > 0;
    if (m) { mx /= m; my /= m; }
    const sp = (inp.focus ? 85 : 175) * (inWater(w, p.x, p.y) ? 0.7 : 1);
    slide(w, p, mx * sp * dt, my * sp * dt);
    p.face = Math.atan2(inp.my - p.y, inp.mx - p.x);
    // blink: a short dash with a moment of safety
    p.blinkCd = Math.max(0, p.blinkCd - dt);
    if (inp.blink && p.blinkCd <= 0) {
      const a = m ? Math.atan2(my, mx) : p.face;
      const from = { x: p.x, y: p.y };
      for (let i = 0; i < 12; i++) slide(w, p, Math.cos(a) * 8, Math.sin(a) * 8);
      p.blinkCd = 1.1;
      p.inv = Math.max(p.inv, 0.32);
      w.fx.push({ kind: 'blink', x: from.x, y: from.y, color: 0xb48cff, t: w.time, dur: 0.35, r: Math.atan2(p.y - from.y, p.x - from.x) });
      w.sounds.push('zap');
    }
    p.inv = Math.max(0, p.inv - dt);
    p.mana = Math.min(p.maxMana, p.mana + 26 * dt);
    // shoot
    p.cdA = Math.max(0, p.cdA - dt);
    p.cdB = Math.max(0, p.cdB - dt);
    for (const slot of [0, 1] as const) {
      const want = slot === 0 ? inp.fireA : inp.fireB;
      const cd = slot === 0 ? p.cdA : p.cdB;
      if (!want || cd > 0) continue;
      const s = spellStats(w.spells[slot]);
      if (!s || p.mana < s.mana) continue;
      p.mana -= s.mana;
      if (slot === 0) p.cdA = 1 / s.rate; else p.cdB = 1 / s.rate;
      fireSpell(w, slot, p.face, s);
    }
    for (let i = w.echoes.length - 1; i >= 0; i--) {
      const e = w.echoes[i];
      if (w.time < e.at) continue;
      const s = spellStats(w.spells[e.slot]);
      if (s) fireSpell(w, e.slot, e.ang, s, true);
      w.echoes.splice(i, 1);
    }
  }

  // waves
  if (!w.foes.length && w.waves.length) {
    w.waveDelay -= dt;
    if (w.waveDelay <= 0) { for (const t of w.waves.shift()!) spawnFoe(w, t); w.waveDelay = 1.4; }
  }

  // foes
  for (const f of w.foes) {
    f.flash = Math.max(0, f.flash - dt * 4);
    f.slow = Math.max(0, f.slow - dt);
    if (f.burnT > 0) { f.burnT -= dt; hurtFoe(w, f, f.burnDps * dt, 0xff8a3a, true); }
    if (f.state === 'spawn') { f.st -= dt; if (f.st <= 0) f.state = 'move'; continue; }
    const k = f.slow > 0 ? 0.5 : 1;
    const dx = p.x - f.x, dy = p.y - f.y, d = Math.hypot(dx, dy) || 1;
    f.t += dt * k;
    switch (f.type) {
      case 'boar':
        if (f.state === 'move') {
          slide(w, f, (dx / d) * f.speed * k * dt, (dy / d) * f.speed * k * dt);
          if (f.t > 2.4 && d < 380) { f.state = 'wind'; f.st = 0.6; f.t = 0; }
        } else if (f.state === 'wind') {
          f.st -= dt; f.flash = 0.5;
          if (f.st <= 0) { f.state = 'charge'; f.st = 0.55; f.vx = (dx / d) * 390; f.vy = (dy / d) * 390; }
        } else if (f.state === 'charge') {
          f.st -= dt;
          const ox = f.x, oy = f.y;
          slide(w, f, f.vx * k * dt, f.vy * k * dt);
          if (f.st <= 0 || (f.x === ox && f.y === oy)) { f.state = 'move'; f.t = 0; }
        }
        break;
      case 'thornling': {
        // drift in slow circles, keeping some distance
        const a = Math.atan2(dy, dx) + Math.PI / 2;
        const away = d < 170 ? -1 : d > 300 ? 1 : 0;
        slide(w, f, (Math.cos(a) * 0.8 + (dx / d) * away) * f.speed * k * dt, (Math.sin(a) * 0.8 + (dy / d) * away) * f.speed * k * dt);
        break;
      }
      case 'xbow': {
        const away = d < 200 ? -1 : d > 290 ? 1 : 0.15 * Math.sin(f.t);
        slide(w, f, (dx / d) * away * f.speed * k * dt, (dy / d) * away * f.speed * k * dt);
        if (f.t > 2.1) { f.t = 0; const a = aimAt(f, p); for (const o of [-0.17, 0, 0.17]) foeShot(w, f.x, f.y, a + o, 175, 5, 0xff6a4a); w.sounds.push('shoot'); }
        break;
      }
      case 'hag':
        slide(w, f, Math.cos(f.t * 0.4) * f.speed * k * dt, Math.sin(f.t * 0.7) * f.speed * 0.5 * k * dt);
        break;
      case 'stag': {
        // paces the ring; in its rage it charges every few seconds
        const ph = f.hp / f.maxHp;
        if (f.state === 'move') {
          const tx = AW / 2 + Math.cos(f.t * 0.5) * AW * 0.28, ty = TILE * 5 + Math.sin(f.t * 0.8) * TILE * 1.5;
          const ex = tx - f.x, ey = ty - f.y, ed = Math.hypot(ex, ey) || 1;
          slide(w, f, (ex / ed) * f.speed * k * dt, (ey / ed) * f.speed * k * dt);
          if (f.t > (ph > 0.66 ? 7 : 5) && ph < 0.95) { f.state = 'wind'; f.st = 0.9; f.t = 0; w.sounds.push('boom'); }
        } else if (f.state === 'wind') {
          f.st -= dt; f.flash = 0.6;
          if (f.st <= 0) { f.state = 'charge'; f.st = 0.85; f.vx = (dx / d) * 430; f.vy = (dy / d) * 430; }
        } else if (f.state === 'charge') {
          f.st -= dt;
          const ox = f.x, oy = f.y;
          slide(w, f, f.vx * dt, f.vy * dt);
          if (f.st <= 0 || (f.x === ox && f.y === oy)) {
            // slams to a halt in a burst of leaves (and bullets)
            ring(w, f, ph > 0.33 ? 12 : 18, 140, rand(w) * 6, 0x9cff5a);
            w.fx.push({ kind: 'ring', x: f.x, y: f.y, color: 0x9cff5a, t: w.time, dur: 0.5, r: 70 });
            w.sounds.push('boom');
            f.state = 'rest'; f.st = 0.8;
          }
        } else if (f.state === 'rest') { f.st -= dt; if (f.st <= 0) { f.state = 'move'; f.t = 0; } }
        break;
      }
    }
    // touching a foe hurts
    if (!p.dead && Math.hypot(f.x - p.x, f.y - p.y) < f.r + p.r - 1) hurtPlayer(w);
  }

  // bullets
  for (let i = w.bullets.length - 1; i >= 0; i--) {
    const b = w.bullets[i];
    b.life -= dt;
    b.wake = Math.max(0, b.wake - dt);
    if (b.orbit) {
      // circle the caster, then fly out along the tangent
      b.orbit.t -= dt;
      b.orbit.ang += b.orbit.spin * dt;
      b.x = p.x + Math.cos(b.orbit.ang) * b.orbit.rad;
      b.y = p.y + Math.sin(b.orbit.ang) * b.orbit.rad;
      if (b.orbit.t <= 0) {
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(b.orbit.ang) * sp; b.vy = Math.sin(b.orbit.ang) * sp;
        b.orbit = null;
      }
    } else {
      if (b.homing && b.friendly) {
        let best: Foe | null = null, bd = 320;
        for (const f of w.foes) { if (f.state === 'spawn' || b.hit.includes(f.id)) continue; const d = Math.hypot(f.x - b.x, f.y - b.y); if (d < bd) { bd = d; best = f; } }
        if (best) {
          const want = Math.atan2(best.y - b.y, best.x - b.x), cur = Math.atan2(b.vy, b.vx);
          let da = want - cur; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
          const na = cur + Math.max(-b.homing * dt, Math.min(b.homing * dt, da)), sp = Math.hypot(b.vx, b.vy);
          b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
    }
    let gone = b.life <= 0;
    if (!b.orbit && isWall(w, b.x, b.y)) gone = true;
    if (gone && b.burst) burst(w, b);
    if (gone) { if (b.friendly && !b.burst && b.life > 0) w.fx.push({ kind: 'hit', x: b.x, y: b.y, color: b.color, t: w.time, dur: 0.2 }); w.bullets.splice(i, 1); continue; }
    if (b.friendly) {
      // orbiting shots eat foe shots that touch them
      if (b.orbit) for (let j = w.bullets.length - 1; j >= 0; j--) { const e = w.bullets[j]; if (!e.friendly && Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) { w.bullets.splice(j, 1); if (j < i) i--; w.fx.push({ kind: 'hit', x: e.x, y: e.y, color: b.color, t: w.time, dur: 0.15 }); } }
      for (const f of w.foes) {
        if (f.state === 'spawn' || b.hit.includes(f.id)) continue;
        if (Math.hypot(f.x - b.x, f.y - b.y) > f.r + b.r) continue;
        b.hit.push(f.id);
        hurtFoe(w, f, b.dmg, b.color);
        if (b.burn) { f.burnT = 2; f.burnDps = Math.max(f.burnDps, b.burn); }
        if (b.slow) f.slow = 1.2;
        if (b.burst) { burst(w, b); b.life = 0; break; }
        if (b.chain > 0) {
          // jump to the nearest foe not yet struck
          let next: Foe | null = null, nd = 170;
          for (const g of w.foes) { if (g === f || g.state === 'spawn' || b.hit.includes(g.id)) continue; const d = Math.hypot(g.x - f.x, g.y - f.y); if (d < nd) { nd = d; next = g; } }
          if (next) {
            const sp = Math.hypot(b.vx, b.vy), a = Math.atan2(next.y - b.y, next.x - b.x);
            b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.chain--; b.life = Math.max(b.life, 0.6);
            w.fx.push({ kind: 'ring', x: f.x, y: f.y, color: b.color, t: w.time, dur: 0.18, r: 14 });
            continue;
          }
        }
        if (b.pierce > 0) { b.pierce--; continue; }
        b.life = 0;
        break;
      }
      if (b.life <= 0) w.bullets.splice(w.bullets.indexOf(b), 1);
    } else if (!p.dead && b.wake <= 0 && Math.hypot(p.x - b.x, p.y - b.y) < p.r + b.r * 0.7) {
      if (p.inv <= 0) { w.bullets.splice(i, 1); hurtPlayer(w); }
    }
  }

  // the fallen
  for (let i = w.foes.length - 1; i >= 0; i--) {
    const f = w.foes[i];
    if (f.hp > 0) continue;
    w.foes.splice(i, 1);
    w.stats.kills++;
    w.fx.push({ kind: 'die', x: f.x, y: f.y, color: f.boss ? 0xffd06a : 0xff8a6a, t: w.time, dur: f.boss ? 1.2 : 0.5, r: f.r });
    w.sounds.push(f.boss ? 'portal' : 'die');
    if (f.boss) for (let j = w.bullets.length - 1; j >= 0; j--) if (!w.bullets[j].friendly) w.bullets.splice(j, 1);
  }
  if (!w.foes.length && !w.waves.length && !w.cleared && !p.dead) {
    w.cleared = true;
    // the room's leftover foe shots fade away
    for (let j = w.bullets.length - 1; j >= 0; j--) if (!w.bullets[j].friendly) { w.fx.push({ kind: 'hit', x: w.bullets[j].x, y: w.bullets[j].y, color: 0xffffff, t: w.time, dur: 0.3 }); w.bullets.splice(j, 1); }
  }
  w.fx = w.fx.filter((f) => w.time - f.t < f.dur);
}

function burst(w: StormWorld, b: Bullet) {
  const bs = b.burst!;
  for (let k = 0; k < bs.n; k++) {
    const a = (k / bs.n) * Math.PI * 2 + b.x * 0.01;
    w.bullets.push({ id: w.nextId++, x: b.x, y: b.y, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, r: 4, dmg: bs.dmg, life: 0.45, friendly: true, color: b.color, pierce: 0, chain: 0, homing: 0, burn: b.burn, slow: b.slow, orbit: null, burst: null, hit: [], wake: 0 });
  }
  w.fx.push({ kind: 'burst', x: b.x, y: b.y, color: b.color, t: w.time, dur: 0.3, r: 34 });
  b.burst = null;
}

function hurtFoe(w: StormWorld, f: Foe, n: number, color: number, quiet = false) {
  f.hp -= n;
  if (!quiet) { f.flash = 1; w.fx.push({ kind: 'hit', x: f.x + (rand(w) - 0.5) * f.r, y: f.y + (rand(w) - 0.5) * f.r, color, t: w.time, dur: 0.22 }); w.sounds.push('hit'); }
}

function hurtPlayer(w: StormWorld) {
  const p = w.player;
  if (p.inv > 0 || p.dead) return;
  p.hp -= 1;
  p.inv = 1.1;
  w.stats.hitsTaken++;
  w.fx.push({ kind: 'hurt', x: p.x, y: p.y, color: 0xff3a3a, t: w.time, dur: 0.6, r: 40 });
  w.sounds.push('boom');
  // a hit clears nearby foe shots, so one mistake isn't three
  for (let j = w.bullets.length - 1; j >= 0; j--) { const b = w.bullets[j]; if (!b.friendly && Math.hypot(b.x - p.x, b.y - p.y) < 70) w.bullets.splice(j, 1); }
  if (p.hp <= 0) { p.dead = true; w.fx.push({ kind: 'die', x: p.x, y: p.y, color: 0xb48cff, t: w.time, dur: 1.2, r: 14 }); w.sounds.push('die'); }
}

/** Ash earned for a Cinderstorm run: a little per room, more for felling the Stag. */
export const stormAsh = (w: StormWorld) => (w.room - 1) * 2 + (w.cleared && w.kind === 'boss' ? 12 : 0);

/** Three cards to choose from after a room: always at least one modifier. */
export function rewardChoices(w: StormWorld, owned: string[], bases: string[], mods: string[]): string[] {
  const pool = [...mods, ...mods, ...bases.filter((b) => !owned.includes(b))];
  const out: string[] = [];
  for (let i = 0; i < 60 && out.length < 3; i++) {
    const c = pool[Math.floor(rand(w) * pool.length)];
    if (!out.includes(c)) out.push(c);
  }
  if (!out.some((c) => mods.includes(c))) out[2] = mods[Math.floor(rand(w) * mods.length)];
  return out;
}

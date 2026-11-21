import type { Pt, Unit, World } from './types';
import { curse, dist, emit, explode, heal, hurt, log, ownerState, sync } from './combat';
import { findPath } from './path';
import { commitWalk, findFreeNear, knockback, planWalk, type WalkPlan } from './physics';
import { los, floorTiles, setTiles } from './map';
import { dealt, makeUnit, UNITS, unitName, type UnitDef } from './units';
import { rand, randInt } from './rng';
import { T_FLOOR, T_WATER } from './constants';

// Foe (and thrall) behaviour. think() moves the unit and returns the attack to perform after every
// unit of that side has moved, so melee packs advance together like a tide. Bosses each test one rule.

export function foesOf(w: World, u: Unit): Unit[] {
  return w.units.filter((v) => v.alive && !v.gone && v.downed === 0 && v.faction !== u.faction && !UNITS[v.type].prop);
}

/** Nearest foe; effigies count as half as far away (bait), and Marked spellwrights draw the eye too. */
export function nearestFoe(w: World, u: Unit): Unit | null {
  let best: Unit | null = null, bd = Infinity;
  for (const v of foesOf(w, u)) {
    let d = dist(u, v);
    if (UNITS[v.type].decoy) d *= 0.5;
    if (ownerState(w, v)?.traits.includes('marked')) d *= 0.7;
    if (Object.values(ownerState(w, v)?.gear ?? {}).includes('shroud')) d *= 1.4;
    if (d < bd || (d === bd && best && v.id < best.id)) { best = v; bd = d; }
  }
  return best;
}

const staminaFor = (u: Unit) => (u.fetter > 0 ? u.maxStam / 2 : u.maxStam);

function planApproach(w: World, u: Unit, T: Pt, stop: (p: Pt) => boolean): WalkPlan | null {
  if (stop(u) || u.maxStam <= 0) return null;
  const path = findPath(w, u, T, { lavaCost: UNITS[u.type].fireImmune ? 1 : 8 });
  if (!path) return null;
  return planWalk(w, u, path, staminaFor(u), stop);
}

function approach(w: World, u: Unit, T: Pt, stop: (p: Pt) => boolean) {
  const plan = planApproach(w, u, T, stop);
  if (plan) commitWalk(w, u, plan);
}

function flee(w: World, u: Unit, from: Pt, minD: number) {
  const d = dist(u, from);
  if (d >= minD || u.maxStam <= 0) return;
  const ux = (u.x - from.x) / (d || 1), uy = (u.y - from.y) / (d || 1);
  const goal = findFreeNear(w, u.x + ux * staminaFor(u), u.y + uy * staminaFor(u), u.r, u, 160);
  if (!goal) return;
  const path = findPath(w, u, goal, { lavaCost: 8 });
  if (path) commitWalk(w, u, planWalk(w, u, path, staminaFor(u)));
}

function blinkTo(w: World, u: Unit, p: Pt, color = 0xc060ff) {
  emit(w, { k: 'fx', fx: 'blink', x: u.x, y: u.y, color });
  u.x = p.x;
  u.y = p.y;
  emit(w, { k: 'teleport', id: u.id, x: u.x, y: u.y });
  emit(w, { k: 'fx', fx: 'blink', x: u.x, y: u.y, color });
}

function blinkAway(w: World, u: Unit, from: Pt): boolean {
  const tiles = floorTiles(w);
  for (let i = 0; i < 40; i++) {
    const t = tiles[randInt(w, tiles.length)];
    if (dist(t, from) < 320) continue;
    const p = findFreeNear(w, t.x, t.y, u.r, u, 40);
    if (!p) continue;
    blinkTo(w, u, p);
    return true;
  }
  return false;
}

export function summon(w: World, u: Unit, type: string, n: number, quiet = false) {
  for (let i = 0; i < n; i++) {
    const a = rand(w) * Math.PI * 2;
    const p = findFreeNear(w, u.x + Math.cos(a) * 44, u.y + Math.sin(a) * 44, UNITS[type].r, null, 110);
    if (!p) continue;
    const s = makeUnit(w, type, p.x, p.y, u.faction);
    w.units.push(s);
    emit(w, { k: 'spawn', unit: { ...s, affixes: [...s.affixes] } });
    emit(w, { k: 'fx', fx: 'column', x: p.x, y: p.y, color: 0xc060ff });
  }
  if (!quiet) log(w, `${unitName(u)} calls for help.`);
}

const inRange = (u: Unit, p: Pt, T: Unit) => dist(p, T) <= u.range;
const inSight = (w: World, u: Unit, p: Pt, T: Unit) => dist(p, T) <= u.range && los(w, p, T);

/** Side effects of a foe's hit (freeze, fetter, mana burn, bleed, enfeeble, frailty). */
function onHit(w: World, def: UnitDef, T: Unit) {
  if (!T.alive || T.downed > 0) return;
  switch (def.hit) {
    case 'freeze': T.frozen = Math.max(T.frozen, 1); emit(w, { k: 'float', id: T.id, text: 'frozen', color: 0x9fe8ff }); sync(w, T); break;
    case 'fetter': curse(w, T, 'fetter', 1); break;
    case 'weak': curse(w, T, 'weak', 1); break;
    case 'frail': curse(w, T, 'frail', 1); break;
    case 'bleed': curse(w, T, 'poison', 6); break;
    case 'manaburn': if (T.mana > 0) { const m = Math.min(20, T.mana); T.mana -= m; emit(w, { k: 'float', id: T.id, text: `-${m} mana`, color: 0x6fa0ff }); sync(w, T); } break;
  }
}

function strike(w: World, u: Unit, T: Unit) {
  emit(w, { k: 'fx', fx: 'slash', x: T.x, y: T.y, color: 0xff4a3a });
  emit(w, { k: 'sfx', s: 'hit' });
  hurt(w, T, dealt(u), undefined, u);
  onHit(w, UNITS[u.type], T);
}
function shoot(w: World, u: Unit, T: Unit, color: number, dmg: number) {
  const def = UNITS[u.type];
  const shock = def.hit === 'shock';
  emit(w, { k: 'fx', fx: shock ? 'bolt' : 'proj', x: u.x, y: u.y, x2: T.x, y2: T.y, color: shock ? 0xbfe0ff : color });
  emit(w, { k: 'sfx', s: shock ? 'zap' : 'shoot' });
  w.beat++;
  hurt(w, T, dmg, shock ? 'shock' : undefined, u);
  onHit(w, def, T);
}

export type Act = (() => void) | null;

export function think(w: World, u: Unit): Act {
  const def = UNITS[u.type];
  const T = nearestFoe(w, u);
  u.ctr++;
  if (!T && !['bloom', 'choir'].includes(def.ai)) return null;
  switch (def.ai) {
    case 'melee':
    case 'leech':
      approach(w, u, T!, (p) => inRange(u, p, T!));
      return () => {
        if (!T!.alive || T!.downed > 0 || dist(u, T!) > u.range + 2) return;
        strike(w, u, T!);
        if (def.ai === 'leech' && T!.mana > 0) {
          const m = Math.min(30, T!.mana);
          T!.mana -= m;
          emit(w, { k: 'float', id: T!.id, text: `-${m} mana`, color: 0x6fa0ff });
          sync(w, T!);
          heal(w, u, Math.round(m / 2));
        }
      };
    case 'blink': {
      const p = findFreeNear(w, T!.x + (u.x > T!.x ? 30 : -30), T!.y, u.r, u, 70);
      if (p && dist(u, T!) > u.range) blinkTo(w, u, p, 0xc0a0ff);
      return () => { if (T!.alive && T!.downed === 0 && dist(u, T!) <= u.range + 4) strike(w, u, T!); };
    }
    case 'ranged':
      approach(w, u, T!, (p) => inSight(w, u, p, T!));
      return () => { if (T!.alive && T!.downed === 0 && inSight(w, u, u, T!)) shoot(w, u, T!, 0xcfc4ad, dealt(u)); };
    case 'lob':
      approach(w, u, T!, (p) => inRange(u, p, T!));
      return () => {
        if (!T!.alive || !inRange(u, u, T!) || u.mana < u.atkCost) return;
        u.mana -= u.atkCost;
        emit(w, { k: 'fx', fx: 'lob', x: u.x, y: u.y, x2: T!.x, y2: T!.y, color: 0xb0c83a });
        w.beat++;
        emit(w, { k: 'fx', fx: 'ring', x: T!.x, y: T!.y, r: 50, color: 0xb0c83a });
        for (const v of [...w.units]) if (v.alive && !v.gone && v !== u && dist(v, T!) <= 50 + v.r * 0.5) hurt(w, v, dealt(u), undefined, u);
      };
    case 'poison':
      approach(w, u, T!, (p) => inSight(w, u, p, T!));
      return () => {
        if (!T!.alive || !inSight(w, u, u, T!) || u.mana < u.atkCost) return;
        u.mana -= u.atkCost;
        emit(w, { k: 'fx', fx: 'proj', x: u.x, y: u.y, x2: T!.x, y2: T!.y, color: 0x9cff5a });
        w.beat++;
        if (curse(w, T!, 'poison', 10, u)) emit(w, { k: 'float', id: T!.id, text: '+10 poison', color: 0x9cff5a });
      };
    case 'pull':
      approach(w, u, T!, (p) => inSight(w, u, p, T!));
      return () => {
        if (!T!.alive || T!.downed > 0 || !inSight(w, u, u, T!)) return;
        emit(w, { k: 'fx', fx: 'line', x: u.x, y: u.y, x2: T!.x, y2: T!.y, color: 0x4f8a80 });
        hurt(w, T!, dealt(u), undefined, u);
        if (T!.alive) knockback(w, T!, u.x - T!.x, u.y - T!.y, Math.min(150, dist(u, T!) - u.r - T!.r - 4));
      };
    case 'priest':
      flee(w, u, T!, 260);
      return () => priestAct(w, u);
    case 'summon':
      if (dist(u, T!) < 160) blinkAway(w, u, T!);
      else flee(w, u, T!, 250);
      return () => { if (u.mana >= u.atkCost) { u.mana -= u.atkCost; summon(w, u, 'ghoul', 2); } };
    case 'boss':
      if (dist(u, T!) < 140) blinkAway(w, u, T!);
      else if (u.mana < u.atkCost) approach(w, u, T!, (p) => inSight(w, u, p, T!));
      return () => {
        if (u.mana >= u.atkCost) { u.mana -= u.atkCost; summon(w, u, 'ghoul', 3); return; }
        if (T!.alive && T!.downed === 0 && inSight(w, u, u, T!)) shoot(w, u, T!, 0xc060ff, dealt(u));
      };
    // ---------------------------------------------------------------- bosses
    case 'warden':
      approach(w, u, T!, (p) => inRange(u, p, T!));
      return () => {
        if (u.ctr % 3 === 0) {
          const dead = w.units.filter((v) => !v.alive && !v.gone && !v.owner && v.faction === 'enemy' && !UNITS[v.type].boss && !UNITS[v.type].prop && dist(v, u) <= 420);
          for (const c of dead) { c.alive = true; c.hp = Math.ceil(c.maxHp / 2); emit(w, { k: 'fx', fx: 'column', x: c.x, y: c.y, color: 0xe9dcc0 }); sync(w, c); }
          if (dead.length) log(w, `The Charnel Warden raises ${dead.length} of the dead!`);
        }
        if (T!.alive && T!.downed === 0 && dist(u, T!) <= u.range + 2) strike(w, u, T!);
      };
    case 'mother':
      approach(w, u, T!, (p) => inRange(u, p, T!));
      return () => {
        if (u.ctr % 2 === 0) summon(w, u, 'wolf', 2);
        if (T!.alive && T!.downed === 0 && dist(u, T!) <= u.range + 2) strike(w, u, T!);
      };
    case 'bloom':
      return () => {
        heal(w, u, 15);
        if (u.ctr % 3 === 0) summon(w, u, 'mycelid', 1);
        const t = nearestFoe(w, u);
        if (t && dist(u, t) <= u.range) { emit(w, { k: 'fx', fx: 'lob', x: u.x, y: u.y, x2: t.x, y2: t.y, color: 0x7ae0c0 }); w.beat++; hurt(w, t, dealt(u), undefined, u); curse(w, t, 'weak', 1); }
      };
    case 'swarm':
      approach(w, u, T!, (p) => inRange(u, p, T!));
      return () => {
        if (u.ctr % 2 === 0) summon(w, u, 'toad', 3);
        if (T!.alive && T!.downed === 0 && dist(u, T!) <= u.range + 2) strike(w, u, T!);
      };
    case 'bellringer':
      approach(w, u, T!, (p) => dist(p, T!) <= 260);
      return () => {
        if (u.ctr % 3 === 0) {
          emit(w, { k: 'fx', fx: 'ring', x: u.x, y: u.y, r: 300, color: 0x6fa0ff });
          log(w, 'The bell tolls and the water rises!');
          const tiles = floorTiles(w);
          const changes = [];
          for (let i = 0; i < 6; i++) {
            const c = tiles[randInt(w, tiles.length)];
            changes.push(...setTiles(w, c.x, c.y, 50, T_WATER, (k) => k === T_FLOOR));
          }
          if (changes.length) emit(w, { k: 'tiles', changes });
          // lightning finds everyone standing in water or still soaked
          for (const v of foesOf(w, u)) {
            if (w.map[Math.floor(v.y / 32)]?.[Math.floor(v.x / 32)] === T_WATER) v.wet = Math.max(v.wet, 1);
            if (v.wet > 0) { emit(w, { k: 'fx', fx: 'bolt', x: v.x, y: v.y - 160, x2: v.x, y2: v.y, color: 0xbfe0ff }); hurt(w, v, 20, 'shock', u); }
          }
          return;
        }
        if (T!.alive && T!.downed === 0 && inSight(w, u, u, T!)) shoot(w, u, T!, 0x6fa0ff, dealt(u));
      };
    case 'anvil':
      approach(w, u, T!, (p) => inRange(u, p, T!));
      return () => { if (T!.alive && T!.downed === 0 && dist(u, T!) <= u.range + 2) strike(w, u, T!); };
    case 'orrery':
      return () => {
        const pool = foesOf(w, u);
        for (let i = 0; i < 3 && pool.length; i++) {
          const t = pool[randInt(w, pool.length)];
          emit(w, { k: 'fx', fx: 'proj', x: u.x, y: u.y, x2: t.x, y2: t.y, color: 0xd9a845 });
          w.beat++;
          hurt(w, t, dealt(u), undefined, u);
        }
      };
    case 'queen':
      approach(w, u, T!, (p) => inSight(w, u, p, T!));
      return () => {
        if (u.ctr % 3 === 0) {
          emit(w, { k: 'fx', fx: 'ring', x: u.x, y: u.y, r: 260, color: 0xbff4ff });
          emit(w, { k: 'sfx', s: 'freeze' });
          log(w, 'The Sleeping Queen exhales winter.');
          for (const v of foesOf(w, u)) {
            if (dist(v, u) > 260) continue;
            const ps = ownerState(w, v);
            const warm = ps && (ps.chill === 0 && ps.buffs.includes('warm') || ps.origin === 'ember' || v.burn > 0);
            if (!warm) { v.frozen++; sync(w, v); }
          }
          return;
        }
        if (T!.alive && T!.downed === 0 && inSight(w, u, u, T!)) shoot(w, u, T!, 0xbff4ff, dealt(u));
      };
    case 'unwritten': {
      const remembered = u.mana;
      u.mana = 0;
      approach(w, u, T!, (p) => inSight(w, u, p, T!));
      return () => {
        if (!T!.alive || T!.downed > 0) return;
        const n = remembered > 0 ? remembered : dealt(u);
        emit(w, { k: 'float', id: u.id, text: remembered > 0 ? `writes back ${n}` : 'scratches', color: 0xe2cfa2 });
        shoot(w, u, T!, 0x1a1a1a, n);
      };
    }
    case 'choir':
      flee(w, u, T ?? u, 200);
      return () => {
        const t = nearestFoe(w, u);
        if (t && inSight(w, u, u, t)) shoot(w, u, t, 0xff4a6a, dealt(u));
      };
    case 'star': {
      const pull = u.ctr % 2 === 1;
      return () => {
        emit(w, { k: 'fx', fx: 'ring', x: u.x, y: u.y, r: 300, color: pull ? 0x8060ff : 0xffe070 });
        log(w, pull ? 'The Fallen Star drags everything in.' : 'The Fallen Star hurls everything away.');
        for (const v of w.units.filter((v) => v !== u && v.alive && !v.gone && dist(v, u) <= 340)) {
          const d = dist(v, u);
          if (pull) knockback(w, v, u.x - v.x, u.y - v.y, Math.min(80, d - u.r - v.r - 4));
          else knockback(w, v, v.x - u.x, v.y - u.y, 80);
        }
        const t = nearestFoe(w, u);
        if (t && dist(u, t) <= u.range + 4) strike(w, u, t);
      };
    }
    default:
      return null;
  }
}

function priestAct(w: World, u: Unit) {
  const dead = w.units.filter((v) => !v.alive && !v.gone && !v.owner && v.faction === u.faction && !UNITS[v.type].prop && !UNITS[v.type].boss && dist(v, u) <= u.range);
  if (dead.length && u.mana >= 60) {
    const c = dead.sort((a, b) => b.maxHp - a.maxHp || a.id - b.id)[0];
    u.mana -= 60;
    c.alive = true;
    c.hp = c.maxHp;
    emit(w, { k: 'fx', fx: 'column', x: c.x, y: c.y, color: 0xe9dcc0 });
    sync(w, c);
    log(w, `${unitName(u)} raises ${unitName(c)}.`);
    return;
  }
  const hurtAllies = w.units.filter((v) => v.alive && !v.gone && v.faction === u.faction && !v.owner && v.hp < v.maxHp && dist(v, u) <= u.range);
  if (hurtAllies.length && u.mana >= 30) {
    const a = hurtAllies.sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp || x.id - y.id)[0];
    u.mana -= 30;
    emit(w, { k: 'fx', fx: 'line', x: u.x, y: u.y, x2: a.x, y2: a.y, color: 0x7ee07e });
    heal(w, a, 30);
  }
}

/** The Crimson Choir: while any singer lives, fallen singers rise again at the end of the turn. */
export function choirRevive(w: World) {
  const singers = w.units.filter((v) => v.type === 'choir' && !v.gone);
  if (!singers.length || !singers.some((v) => v.alive)) return;
  for (const s of singers) {
    if (s.alive) continue;
    s.alive = true;
    s.hp = Math.ceil(s.maxHp / 2);
    emit(w, { k: 'fx', fx: 'column', x: s.x, y: s.y, color: 0xff4a6a });
    sync(w, s);
  }
  if (singers.some((s) => s.hp === Math.ceil(s.maxHp / 2))) log(w, 'The Choir sings its fallen back to life. Silence them all in one turn.');
}

/**
 * Telegraphing: which foes will be able to strike a player unit next turn, and for how much.
 * Runs each foe's movement plan without committing it.
 */
export function predictThreats(w: World): { threats: Set<number>; dmgTo: Map<number, number> } {
  const threats = new Set<number>();
  const dmgTo = new Map<number, number>();
  for (const u of w.units) {
    if (!u.alive || u.gone || u.faction !== 'enemy' || u.frozen > 0) continue;
    const def = UNITS[u.type];
    if (['none', 'priest', 'summon', 'bloom', 'orrery', 'star'].includes(def.ai)) continue;
    const T = nearestFoe(w, u);
    if (!T || !T.owner) continue;
    const mana = Math.min(u.maxMana, u.mana + u.regen);
    const needsSight = ['ranged', 'poison', 'pull', 'boss', 'queen', 'unwritten', 'choir', 'bellringer'].includes(def.ai);
    const stop = (p: Pt) => (needsSight ? inSight(w, u, p, T) : inRange(u, p, T));
    if (def.ai === 'boss' && mana >= u.atkCost) continue;
    if ((def.ai === 'lob' || def.ai === 'poison') && mana < u.atkCost) continue;
    let ok: boolean;
    if (def.ai === 'blink') ok = true;
    else {
      const plan = planApproach(w, u, T, stop);
      const p = plan ? { x: plan.x, y: plan.y } : { x: u.x, y: u.y };
      ok = needsSight ? inSight(w, u, p, T) : inRange(u, p, T);
    }
    if (!ok) continue;
    threats.add(u.id);
    let dmg = def.ai === 'poison' ? 0 : (u.type === 'unwritten' && u.mana > 0 ? u.mana : dealt(u)) * (1 + 0.5 * T.frail);
    if (def.hit === 'shock' && T.wet > 0) dmg *= 2;
    if (T.fortify > 0) dmg *= 0.5;
    dmg = Math.round(dmg);
    dmgTo.set(T.id, (dmgTo.get(T.id) ?? 0) + dmg);
  }
  return { threats, dmgTo };
}

/** Shades: born from darkness near a spellwright whose lantern has run dry. */
export function spawnShade(w: World, near: Unit) {
  for (let i = 0; i < 8; i++) {
    const a = rand(w) * Math.PI * 2;
    const p = findFreeNear(w, near.x + Math.cos(a) * 220, near.y + Math.sin(a) * 220, 10, null, 80);
    if (!p) continue;
    const s = makeUnit(w, 'shade', p.x, p.y, 'enemy');
    w.units.push(s);
    emit(w, { k: 'spawn', unit: { ...s, affixes: [] } });
    emit(w, { k: 'fx', fx: 'blink', x: p.x, y: p.y, color: 0x403050 });
    return;
  }
}

export { explode };

import type { EventInput, Mat, PlayerState, Unit, UnitStatus, World } from './types';
import { RULES, T_BLOOD, T_BOG, T_LAVA, T_WATER } from './constants';
import { tileAt } from './map';
import { knockback } from './physics';
import { UNITS, unitName } from './units';
import { hasAffix, RUNE_IDS, RUNES } from './runes';
import { rand, randInt } from './rng';
import { BAG_MAX, DROPS, GEAR, GEAR_IDS } from './character';

export function emit(w: World, e: EventInput) {
  w.events.push({ ...e, beat: w.beat } as World['events'][number]);
}
export const log = (w: World, text: string) => emit(w, { k: 'log', text });

export function statusOf(u: Unit): UnitStatus {
  return {
    hp: u.hp, maxHp: u.maxHp, shield: u.shield, poison: u.poison, frozen: u.frozen, frail: u.frail,
    fetter: u.fetter, bloat: u.bloat, alive: u.alive, faction: u.faction, mana: u.mana, maxMana: u.maxMana,
    burn: u.burn, fortify: u.fortify, weak: u.weak, affixes: [...u.affixes], bounty: u.bounty, souls: u.souls, maxSouls: u.maxSouls, dmg: u.dmg,
    wet: u.wet, downed: u.downed,
  };
}
export const sync = (w: World, u: Unit) => emit(w, { k: 'unit', id: u.id, s: statusOf(u) });

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** The player state behind a wizard unit, if any. */
export const ownerState = (w: World, u: Unit | null | undefined): PlayerState | undefined =>
  u && u.owner ? w.players.find((p) => p.unitId === u.id) : undefined;
const runeOf = (w: World, u: Unit | null | undefined, r: string) => !!ownerState(w, u)?.runes.includes(r);
export const hasMut = (ps: PlayerState | undefined, m: string) => !!ps?.mutations.includes(m);
export const hasTrait = (ps: PlayerState | undefined, t: string) => !!ps?.traits.includes(t);
export const hasGear = (ps: PlayerState | undefined, g: string) => !!ps && Object.values(ps.gear).includes(g);

/** Raise a player's corruption; every 25 grants a mutation to choose at the next portal. */
export function corrupt(w: World, ps: PlayerState, n: number) {
  if (n <= 0) return;
  if (hasMut(ps, 'tongue')) n *= 2;
  const before = Math.floor(ps.corruption / RULES.CORRUPTION_STEP);
  ps.corruption = Math.min(100, ps.corruption + n);
  const after = Math.floor(ps.corruption / RULES.CORRUPTION_STEP);
  if (after > before) {
    ps.pendingMutations += after - before;
    emit(w, { k: 'float', id: ps.unitId, text: 'corruption takes hold', color: 0xb3202a });
    log(w, `${ps.name} feels the corruption change them.`);
  }
}

/** Curses respect the Hallowed affix (and the Plague Doctor's immunity to poison). */
export function curse(w: World, u: Unit, k: 'poison' | 'burn' | 'frail' | 'weak' | 'fetter' | 'bloat', n: number, src?: Unit | null): boolean {
  if (!u.alive || n <= 0 || u.downed > 0) return false;
  if (hasAffix(u, 'hallowed')) { emit(w, { k: 'float', id: u.id, text: 'hallowed', color: 0xffe08a }); return false; }
  if (k === 'poison' && ownerState(w, u)?.origin === 'plague') return false;
  if (k === 'burn' && UNITS[u.type].fireImmune) return false;
  if (k === 'poison' && runeOf(w, src, 'toxins')) n = Math.round(n * 1.5);
  u[k] += n;
  sync(w, u);
  return true;
}

/** Players who can still act: alive and not downed. */
export const standingWizards = (w: World) => w.units.filter((u) => u.owner && u.alive && u.downed === 0);

/**
 * Deal damage. `src` is the unit responsible (if any): wizard runes key off it.
 * Order: immunities, rune bonus, resonance, frailty, fortify/stalwart, hide, ironhide cap, ward.
 */
export function hurt(w: World, u: Unit, n: number, tone?: 'poison' | 'fire' | 'impact' | 'shock' | 'frost', src?: Unit | null): number {
  if (!u || !u.alive || u.gone || n <= 0 || u.downed > 0) return 0;
  const def = UNITS[u.type];
  // --- immunities and boss rules
  if (tone === 'fire' && def.fireImmune) { emit(w, { k: 'float', id: u.id, text: 'unburnt', color: 0xff7a2a }); return 0; }
  if (u.type === 'anvil' && tone !== 'impact' && tone !== 'fire') { emit(w, { k: 'float', id: u.id, text: 'immune: shove him', color: 0xcfc4ad }); return 0; }
  if (u.type === 'mother' && !w.units.some((v) => v.owner && v.alive && v.downed === 0 && dist(v, u) <= 260 && (ownerState(w, v)?.oil ?? 0) > 0)) {
    emit(w, { k: 'float', id: u.id, text: 'hidden in the dark', color: 0x8a8a9a });
    return 0;
  }
  const srcPs = ownerState(w, src);
  if (srcPs && runeOf(w, src, 'teeth') && u !== src) n += 5;
  if (tone === 'shock' && u.wet > 0) n *= 2;
  if (tone === 'fire' && u.type === 'shade') n *= 2;
  if (tone === 'fire' && ownerState(w, u)?.origin === 'ember') n *= 0.5;
  if (tone === 'fire' && hasGear(ownerState(w, u), 'cinderboots')) n *= 0.5;
  if (src?.owner) {
    const sp = ownerState(w, src);
    if (tone === 'fire' && hasGear(sp, 'emberrod')) n *= 1.5;
    if (tone === 'shock' && hasGear(sp, 'stormfocus')) n *= 1.5;
  }
  // Resonance: a second player striking the same foe in the same turn hits half again as hard.
  if (srcPs && u.faction !== src!.faction) {
    const first = w.turnHits[u.id];
    if (first && first !== srcPs.pid) { n *= 1.5; w.bond = Math.min(100, w.bond + 5); emit(w, { k: 'float', id: u.id, text: 'resonance', color: 0xffd24a }); }
    else if (!first) w.turnHits[u.id] = srcPs.pid;
  }
  n = n * (1 + 0.5 * u.frail);
  if (u.fortify > 0) n *= 0.5;
  if (hasAffix(u, 'stalwart')) n *= 0.75;
  const ups = ownerState(w, u);
  if (ups && runeOf(w, u, 'hide')) n -= 3;
  if (hasMut(ups, 'stone')) n -= 4;
  if (hasGear(ups, 'ironmail')) n -= 3;
  n = Math.round(n);
  if (hasAffix(u, 'ironhide')) n = Math.min(25, n);
  if (n <= 0) return 0;
  let a = n;
  if (u.shield > 0) {
    const b = Math.min(u.shield, a);
    u.shield -= b;
    a -= b;
  }
  u.hp = Math.max(0, u.hp - a);
  if (u.type === 'unwritten') u.mana = Math.max(u.mana, n); // the biggest hit it took this turn
  emit(w, { k: 'hurt', id: u.id, n, hp: u.hp, shield: u.shield, tone: tone === 'frost' ? undefined : tone });
  // Ichor Blood: melee attackers are poisoned.
  if (src && !src.owner && hasMut(ups, 'ichor') && dist(src, u) <= 90) curse(w, src, 'poison', 6);
  if (srcPs && u !== src && u.faction !== src!.faction) {
    if (a > 0 && runeOf(w, src, 'leech')) heal(w, src!, 3);
    if (runeOf(w, src, 'plague') && u.hp > 0) curse(w, u, 'poison', 5, src);
  }
  if (u.hp <= 0) {
    // In co-op a fallen spellwright is downed, not dead, while a partner still stands.
    if (u.owner && standingWizards(w).some((v) => v !== u)) {
      u.downed = 3;
      clearCurses(u);
      emit(w, { k: 'float', id: u.id, text: 'downed!', color: 0xff4a3a });
      log(w, `${ownerState(w, u)?.name ?? 'A spellwright'} is down! Revive them within 3 turns.`);
      sync(w, u);
      return a;
    }
    die(w, u, src ?? null);
  }
  return a;
}

export function heal(w: World, u: Unit, n: number): number {
  if (!u.alive || u.gone) return 0;
  const ps = ownerState(w, u);
  if (hasMut(ps, 'ichor')) n = Math.round(n / 2);
  if (hasGear(ps, 'saintsfinger')) n = Math.round(n * 1.5);
  const a = Math.min(n, u.maxHp - u.hp);
  if (a <= 0) return 0;
  u.hp += a;
  emit(w, { k: 'heal', id: u.id, n: a, hp: u.hp });
  if (u.downed > 0) {
    u.downed = 0;
    if (ps) corrupt(w, ps, 10);
    emit(w, { k: 'float', id: u.id, text: 'revived', color: 0x7ee07e });
    sync(w, u);
  }
  return a;
}

export function clearCurses(u: Unit) {
  u.poison = 0; u.frozen = 0; u.frail = 0; u.fetter = 0; u.bloat = 0; u.burn = 0; u.weak = 0;
}

/** Soulbinders within reach harvest a fragment from every body that falls. */
/** Cagebearer: a foe dying near her is bound in her cage, if there is room. */
function cageSoul(w: World, dead: Unit) {
  if (dead.faction !== 'enemy' || dead.owner || UNITS[dead.type].boss || dead.mini) return;
  for (const ps of w.players) {
    if (ps.cls !== 'cagebearer' || ps.cage.length >= ps.maxCage) continue;
    const cb = w.units.find((v) => v.id === ps.unitId);
    if (!cb || !cb.alive || cb.downed > 0 || dist(cb, dead) > 160) continue;
    ps.cage.push(dead.type);
    dead.gone = true;
    emit(w, { k: 'fx', fx: 'proj', x: dead.x, y: dead.y, x2: cb.x, y2: cb.y, color: 0xd9a845 });
    emit(w, { k: 'float', id: cb.id, text: `caged: ${UNITS[dead.type].name}`, color: 0xd9a845 });
    return;
  }
}

function harvestSouls(w: World, dead: Unit) {
  for (const ps of w.players) {
    if (ps.cls !== 'soulbinder') continue;
    const sb = w.units.find((v) => v.id === ps.unitId);
    if (!sb || !sb.alive || sb === dead || dist(sb, dead) > RULES.SOUL_COLLECT_RADIUS) continue;
    if (sb.souls >= sb.maxSouls) continue;
    sb.souls++;
    emit(w, { k: 'fx', fx: 'proj', x: dead.x, y: dead.y, x2: sb.x, y2: sb.y, color: 0x9fe8ff });
    emit(w, { k: 'float', id: sb.id, text: '+1 soul', color: 0x9fe8ff });
    sync(w, sb);
  }
}

/** Materials go to whoever made the kill, or the first standing spellwright. */
function dropMats(w: World, dead: Unit, killer: Unit | null) {
  const table = DROPS[dead.type];
  if (!table || dead.faction !== 'enemy') return;
  const ps = ownerState(w, killer) ?? w.players.find((p) => !p.left && w.units.some((v) => v.id === p.unitId && v.alive));
  if (!ps) return;
  const mult = (dead.mini ? 2 : 1) * (w.run.bloodMoon ? 2 : 1);
  const got: string[] = [];
  for (const [m, k] of Object.entries(table) as [Mat, number][]) { ps.mats[m] += k * mult; got.push(`+${k * mult} ${m}`); }
  if (ps.origin === 'gravedigger') { ps.mats.bone++; }
  if (UNITS[dead.type].boss) ps.mats.ink += 2;
  if (got.length) emit(w, { k: 'float', id: dead.id, text: got.join(' '), color: 0xcfc4ad });
}

function onKill(w: World, killer: Unit, dead: Unit) {
  const ps = ownerState(w, killer);
  if (!ps || dead.faction === killer.faction) return;
  if (ps.runes.includes('bloodlust')) {
    if (ps.cls === 'soulbinder') killer.souls = Math.min(killer.maxSouls, killer.souls + 1);
    else if (ps.cls === 'lanternkeeper') ps.oil = Math.min(ps.maxOil, ps.oil + 10);
    else killer.mana += 10;
    emit(w, { k: 'float', id: killer.id, text: 'bloodlust', color: 0x6fa0ff });
  }
  if (ps.runes.includes('hunter') && killer.stam < RULES.CLEARED_STAMINA) killer.stam += 50;
  if (ps.runes.includes('muncher')) heal(w, killer, 5);
  if (hasMut(ps, 'hunger')) heal(w, killer, 6);
  sync(w, killer);
  if (dead.bounty) {
    ps.bountyPoints += RULES.BOUNTY_POINTS;
    emit(w, { k: 'float', id: killer.id, text: `bounty +${RULES.BOUNTY_POINTS} points`, color: 0xe0b040 });
    log(w, `${ps.name} claims the bounty on ${unitName(dead)}.`);
  }
}

export function die(w: World, u: Unit, killer: Unit | null = null) {
  const def = UNITS[u.type];
  u.alive = false;
  u.hp = 0;
  u.downed = 0;
  u.diedTurn = w.turn;
  const bloat = u.bloat;
  clearCurses(u);
  u.shield = 0;
  u.fortify = 0;
  emit(w, { k: 'die', id: u.id });
  emit(w, { k: 'sfx', s: 'die' });
  if (u.faction === 'enemy' && !def.prop) w.kills++;
  if (def.boss && u.type !== 'choir') { w.run.bossesSlain++; log(w, `${unitName(u)} is slain!`); if (u.faction === 'enemy') for (const ps of w.players) if (!ps.left) grantGear(w, ps); }
  else if (!def.prop) log(w, `${u.owner ? playerName(w, u.owner) : unitName(u)} falls.`);
  if (def.prop || def.decoy) u.gone = true;
  if (!def.prop && !def.decoy) { harvestSouls(w, u); cageSoul(w, u); dropMats(w, u, killer); }
  if (killer && killer.owner) onKill(w, killer, u);
  if (bloat > 0) explode(w, u.x, u.y, 100, 40 * bloat, { push: 50, except: u, color: 0x9cff5a, src: killer });
  if (hasAffix(u, 'volatile')) explode(w, u.x, u.y, 90, 30, { except: u, color: 0xff7a2a });
  if (def.burst?.kind === 'fire') explode(w, u.x, u.y, 90, def.burst.n, { except: u, color: 0xff7a2a });
  if (def.burst?.kind === 'poison') {
    emit(w, { k: 'fx', fx: 'ring', x: u.x, y: u.y, r: 90, color: 0x9cff5a });
    for (const v of w.units) if (v.alive && !v.gone && v !== u && dist(v, u) <= 90 + v.r * 0.5) curse(w, v, 'poison', def.burst.n);
  }
  if (def.urn === 'fire') explode(w, u.x, u.y, 100, 40, { color: 0xff7a2a, src: killer });
  if (def.urn === 'ice') {
    emit(w, { k: 'fx', fx: 'ring', x: u.x, y: u.y, r: 100, color: 0x9fe8ff });
    emit(w, { k: 'sfx', s: 'freeze' });
    for (const v of w.units) if (v.alive && !v.gone && v.downed === 0 && dist(v, u) <= 100 + v.r * 0.5) { v.frozen++; sync(w, v); }
  }
  if (def.urn === 'plague') {
    emit(w, { k: 'fx', fx: 'ring', x: u.x, y: u.y, r: 100, color: 0x9cff5a });
    for (const v of w.units) if (v.alive && !v.gone && dist(v, u) <= 100 + v.r * 0.5) curse(w, v, 'poison', 20, killer);
  }
  // Gravebound: some of the slain rise at once to serve their killer.
  if (killer && killer.owner && u.faction !== killer.faction && !def.prop && !def.decoy && !def.boss && !u.gone && runeOf(w, killer, 'grave') && rand(w) < 0.2) {
    u.alive = true;
    u.hp = u.maxHp;
    u.faction = killer.faction;
    u.bounty = false;
    emit(w, { k: 'fx', fx: 'column', x: u.x, y: u.y, color: 0xb48cff });
    sync(w, u);
    log(w, `${unitName(u)} rises, gravebound.`);
  }
}

export function playerName(w: World, pid: string) {
  return w.players.find((p) => p.pid === pid)?.name ?? 'A spellwright';
}

export function explode(w: World, x: number, y: number, rad: number, dmg: number, o: { push?: number; except?: Unit; color?: number; src?: Unit | null } = {}) {
  emit(w, { k: 'fx', fx: 'ring', x, y, r: rad, color: o.color ?? 0xff7a2a });
  emit(w, { k: 'fx', fx: 'burst', x, y, color: o.color ?? 0xffb14a });
  emit(w, { k: 'sfx', s: 'boom' });
  for (const v of [...w.units]) {
    if (!v.alive || v.gone || v === o.except) continue;
    if (dist(v, { x, y }) > rad + v.r * 0.5) continue;
    hurt(w, v, dmg, 'fire', o.src);
    if (o.push && !v.gone) knockback(w, v, v.x - x, v.y - y, o.push);
  }
}

/** A free rune: chests and shrines. */
export function grantRune(w: World, ps: PlayerState): string | null {
  const pool = RUNE_IDS.filter((r) => !ps.runes.includes(r));
  if (!pool.length) return null;
  const r = pool[randInt(w, pool.length)];
  ps.runes.push(r);
  const u = w.units.find((v) => v.id === ps.unitId);
  if (r === 'reach' && u) u.range += 40;
  if (r === 'font' && u) { if (ps.cls === 'soulbinder') u.maxSouls += 1; else if (ps.cls === 'lanternkeeper') ps.maxOil += 20; else u.regen += 15; }
  log(w, `${ps.name} gains the rune ${RUNES[r].name}.`);
  return r;
}

/** Things that happen when a body enters a spot: liquids, traps, potions, supplies. */
export function triggers(w: World, u: Unit) {
  if (!u.alive || u.downed > 0) return;
  const t = tileAt(w, u.x, u.y);
  const ps = ownerState(w, u);
  const wasIn = u.lastTile === t;
  u.lastTile = t;
  u.inLava = t === T_LAVA || t === T_BOG || t === T_BLOOD || t === T_WATER;
  if (!wasIn && t === T_LAVA) {
    emit(w, { k: 'fx', fx: 'burst', x: u.x, y: u.y, color: 0xff6a1a });
    hurt(w, u, RULES.LIQUID_DAMAGE, 'fire');
  }
  if (!wasIn && t === T_BOG) { emit(w, { k: 'fx', fx: 'burst', x: u.x, y: u.y, color: 0x7a9a2a }); curse(w, u, 'poison', 5); }
  if (t === T_WATER && ps?.origin !== 'sailor' && !hasGear(ps, 'oilskin') && !UNITS[u.type].fireImmune) {
    if (u.wet < 2) { u.wet = 2; u.burn = 0; sync(w, u); }
  }
  if (t === T_WATER && UNITS[u.type].fireImmune && !wasIn) hurt(w, u, 20, 'impact'); // molten things crack in water
  if (!u.alive) return;
  for (const k of w.pickups) {
    if (k.used || dist(k, u) > u.r + 10) continue;
    if (k.type === 'trap') {
      k.used = true;
      emit(w, { k: 'pickup', id: k.id });
      emit(w, { k: 'fx', fx: 'burst', x: k.x, y: k.y, color: 0xcfc4ad });
      hurt(w, u, RULES.TRAP_DAMAGE);
      if (!u.alive) return;
      continue;
    }
    if (!ps) continue;
    if (k.type === 'vault' && w.keys < 2) {
      if (w.vaultHint !== w.beat) { w.vaultHint = w.beat; emit(w, { k: 'float', id: u.id, text: `sealed: ${w.keys}/2 keys`, color: 0xd9a845 }); }
      continue;
    }
    k.used = true;
    emit(w, { k: 'pickup', id: k.id });
    const float = (text: string, color: number) => emit(w, { k: 'float', id: u.id, text, color });
    switch (k.type) {
      case 'hp': heal(w, u, 40); break;
      case 'mana':
        if (ps.cls === 'soulbinder') { u.souls = Math.min(u.maxSouls, u.souls + 2); float('+2 souls', 0x9fe8ff); }
        else if (ps.cls === 'lanternkeeper') { ps.oil = Math.min(ps.maxOil, ps.oil + 40); float('+40 oil', 0xffd24a); }
        else if (ps.cls === 'hexblade') { u.stam += 80; float('+80 stamina', 0xe0c040); }
        else { u.mana = Math.min(u.maxMana * 2, u.mana + 40); float('+40 mana', 0x6fa0ff); }
        break;
      case 'stam': u.stam += 100; float('+100 stamina', 0xe0c040); break;
      case 'scroll': w.pendingScrolls.push(ps.pid); break;
      case 'oil': ps.oil = Math.min(ps.maxOil, ps.oil + 35); float('+35 oil', 0xffd24a); break;
      case 'food': eat(w, ps, u, 2); break;
      case 'herb': ps.mats.herb += ps.origin === 'hedgewitch' ? 2 : 1; float('+grave moss', 0x7fbf3f); break;
      case 'key': w.keys++; float(`key ${w.keys}/2`, 0xd9a845); log(w, w.keys >= 2 ? 'Both keys found. The vault can be opened.' : `${ps.name} finds a vault key.`); break;
      case 'vault':
        log(w, 'The vault groans open.');
        for (const p of w.players) { if (p.left) continue; grantGear(w, p); for (let i = 0; i < 2; i++) { const m = (['bone', 'tallow', 'ember', 'rime', 'ichor', 'herb', 'ink'] as const)[randInt(w, 7)]; p.mats[m]++; } }
        emit(w, { k: 'fx', fx: 'column', x: k.x, y: k.y, color: 0xd9a845 });
        break;
      case 'chest': {
        const g = rand(w) < 0.5 ? grantGear(w, ps) : null;
        if (g) { float(GEAR[g].name, 0xe0b040); break; }
        const r = grantRune(w, ps); float(r ? RUNES[r].name : 'empty', 0xe0b040); break;
      }
      case 'shrine': { const r = grantRune(w, ps); corrupt(w, ps, 15); float(r ? `${RUNES[r].name}, at a price` : 'the shrine is silent', 0xb3202a); break; }
      case 'brazier':
        ps.oil = Math.min(ps.maxOil, ps.oil + 25);
        ps.chill = 0;
        w.torches.push({ x: k.x, y: k.y });
        emit(w, { k: 'torch', x: k.x, y: k.y });
        float('brazier lit: +25 oil', 0xffb040);
        break;
    }
    sync(w, u);
  }
}

/** Eat: fill hunger, restore health lost to starving. */
export function eat(w: World, ps: PlayerState, u: Unit, n: number) {
  if (ps.origin === 'hedgewitch') n++;
  if (hasTrait(ps, 'irongut')) n++;
  ps.satiety = Math.min(RULES.MAX_SATIETY, ps.satiety + n);
  if (ps.starveLoss > 0) { u.maxHp += ps.starveLoss; u.hp += ps.starveLoss; ps.starveLoss = 0; }
  emit(w, { k: 'float', id: u.id, text: `+${n} hunger`, color: 0xe0a060 });
}

/** Start-of-turn upkeep: poison, burn, liquids, the Growing affix, Fortify and wetness wearing off. */
export function startTick(w: World, u: Unit) {
  if (!u.alive || u.downed > 0) return;
  if (u.fortify > 0) { u.fortify = 0; sync(w, u); }
  if (u.wet > 0) { u.wet--; sync(w, u); }
  if (u.poison > 0) {
    const p = u.poison;
    u.poison = Math.max(0, p - 5);
    hurt(w, u, p, 'poison');
    if (u.alive) sync(w, u);
  }
  if (u.alive && u.burn > 0) {
    u.burn--;
    hurt(w, u, 10, 'fire');
    if (u.alive) sync(w, u);
  }
  const t = tileAt(w, u.x, u.y);
  if (u.alive && t === T_LAVA) hurt(w, u, RULES.LIQUID_DAMAGE, 'fire');
  if (u.alive && t === T_BOG) curse(w, u, 'poison', 5);
  if (u.alive && t === T_WATER && ownerState(w, u)?.origin !== 'sailor' && !hasGear(ownerState(w, u), 'oilskin')) { u.wet = 2; sync(w, u); }
  if (u.alive && t === T_BLOOD) {
    if (u.owner) { const ps = ownerState(w, u); if (ps) corrupt(w, ps, 2); }
    else if (u.faction === 'enemy') heal(w, u, 10);
  }
  // Growing stops after 8 growths (about double), so nothing scales without bound.
  if (u.alive && hasAffix(u, 'growing') && u.ctr <= 8) {
    const add = Math.max(1, Math.round(u.maxHp * 0.1));
    u.maxHp += add;
    u.hp += add;
    u.dmg = Math.round(u.dmg * 1.1);
    emit(w, { k: 'float', id: u.id, text: 'grows', color: 0x7fbf3f });
    sync(w, u);
  }
}

/** Put a random find the player does not already own into their bag. Returns its id. */
export function grantGear(w: World, ps: PlayerState): string | null {
  if (ps.bag.length >= BAG_MAX) return null;
  const owned = new Set([...ps.bag, ...Object.values(ps.gear)]);
  const left = GEAR_IDS.filter((g) => !owned.has(g));
  if (!left.length) return null;
  const g = left[Math.floor(rand(w) * left.length)];
  ps.bag.push(g);
  log(w, `${ps.name} finds ${GEAR[g].name}.`);
  return g;
}

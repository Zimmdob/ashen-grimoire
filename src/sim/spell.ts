import type { PlayerState, Pt, Unit, World } from './types';
import { CARDS, type SpellCtx, type Target, type Zone, isUnit } from './cards';
import { dist, emit, hasMut, ownerState } from './combat';
import { RULES } from './constants';
import { rand } from './rng';

/** The first target is the body under the cursor, then a corpse, otherwise the bare ground. */
export function pickInitialTarget(w: World, aim: Pt): Target {
  let best: Unit | null = null;
  let bd = Infinity;
  for (const u of w.units) {
    if (!u.alive || u.gone) continue;
    const d = dist(u, aim);
    if (d <= u.r + 12 && d < bd) { best = u; bd = d; }
  }
  if (best) return best;
  for (const u of w.units) {
    if (u.alive || u.gone) continue;
    const d = dist(u, aim);
    if (d <= 18 && d < bd) { best = u; bd = d; }
  }
  return best ?? { x: aim.x, y: aim.y, pt: true };
}

/**
 * Run a forged spell. Cards resolve strictly left to right.
 * Modifier cards (Echo, Overcharge) change the card after them. Returns the final target list.
 */
export function executeSpell(w: World, caster: Unit, cards: string[], aim: Pt, zones?: Zone[]): Target[] {
  const ctx: SpellCtx = { w, caster, aim, targets: [pickInitialTarget(w, aim)], stack: {}, pw: 1, zones };
  const ps = ownerState(w, caster);
  emit(w, { k: 'sfx', s: 'cast' });
  emit(w, { k: 'fx', fx: 'line', x: caster.x, y: caster.y, x2: aim.x, y2: aim.y, color: 0xb48cff });
  let list = [...cards];
  // Clumsy: one spell in ten fumbles its first card.
  if (ps?.traits.includes('clumsy') && list.length > 1 && rand(w) < 0.1) {
    emit(w, { k: 'float', id: caster.id, text: `fumbled ${CARDS[list[0]].name}`, color: 0xcfc4ad });
    list = list.slice(1);
  }
  let repeat = 1, boost = 1;
  for (const id of list) {
    const c = CARDS[id];
    if (!c) continue;
    if (c.mode === 'mod') {
      if (id === 'echo') repeat = 2;
      if (id === 'overcharge') boost *= 2;
      emit(w, { k: 'float', id: caster.id, text: c.name, color: 0xc0a0ff });
      emit(w, { k: 'cast', card: id, x: caster.x, y: caster.y, pts: [], power: 1 });
      continue;
    }
    const level = ps?.cardLevels[id] ?? 0;
    ctx.pw = (1 + 0.5 * level) * boost * (w.duet === w.turn && caster.owner ? 1.5 : 1);
    for (let r = 0; r < repeat; r++) {
      w.beat++;
      ctx.stack[id] = (ctx.stack[id] ?? 0) + 1;
      if (c.mode !== 'target') {
        const hit = c.mode === 'first' ? ctx.targets.slice(0, 1) : c.mode === 'any' ? ctx.targets : ctx.targets.filter(isUnit);
        emit(w, { k: 'cast', card: id, x: caster.x, y: caster.y, pts: hit.slice(0, 24).map((t) => ({ x: Math.round(t.x), y: Math.round(t.y) })), power: ctx.pw });
      }
      if (c.mode === 'target') c.run(ctx, ctx.targets[0]);
      else if (c.mode === 'first') c.run(ctx, ctx.targets[0]);
      else for (const t of [...ctx.targets]) if (c.mode === 'any' || isUnit(t)) c.run(ctx, t);
    }
    repeat = 1;
    boost = 1;
  }
  return ctx.targets;
}

export interface SpellPrice { mana: number; hp: number; souls: number; stam: number; oil: number }

/**
 * Cost of a spell, with each card getting dearer every time it is used this turn.
 * Each class pays its own way: mana, soul fragments, stamina (Hexblade) or lantern oil (Lantern Keeper).
 */
export function spellCost(ps: PlayerState, cards: string[]): SpellPrice {
  let mana = 0, hp = 0, souls = 0;
  const uses: Record<string, number> = { ...ps.uses };
  let bloodMul = 1;
  if (ps.origin === 'noble') bloodMul *= 0.7;
  if (hasMut(ps, 'tongue')) bloodMul *= 0.5;
  if (Object.values(ps.gear ?? {}).includes('bloodknife')) bloodMul *= 0.75;
  for (const id of cards) {
    const c = CARDS[id];
    if (!c) continue;
    const k = 1 + RULES.EXPENSE_SCALING * (uses[id] ?? 0);
    const m = Math.round(c.cost * k);
    mana += m;
    souls += m > 0 ? Math.ceil(m / RULES.SOUL_PRICE) : 0;
    hp += Math.round((c.hpCost ?? 0) * k * bloodMul);
    uses[id] = (uses[id] ?? 0) + 1;
  }
  const z = { mana: 0, hp, souls: 0, stam: 0, oil: 0 };
  switch (ps.cls) {
    case 'soulbinder': return { ...z, souls };
    case 'hexblade': return { ...z, stam: mana * 2 };
    case 'lanternkeeper': return { ...z, oil: Math.round(mana * 0.6) };
    case 'tarot': return { ...z, mana: Math.round(mana * 0.6) };
    default: return { ...z, mana };
  }
}

/** Can this player afford the price right now? Returns the reason if not. */
export function cantAfford(ps: PlayerState, u: Unit, c: SpellPrice): string | null {
  if (c.mana > u.mana) return 'Not enough mana';
  if (c.souls > u.souls) return 'Not enough soul fragments';
  if (c.stam > u.stam) return 'Not enough stamina';
  if (c.oil > ps.oil) return 'Not enough lantern oil';
  if (c.hp > 0 && c.hp >= u.hp) return 'That would kill you';
  return null;
}

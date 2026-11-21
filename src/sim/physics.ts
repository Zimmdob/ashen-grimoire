import type { Pt, Unit, World } from './types';
import { isLiquid, T_ICE } from './constants';
import { isWallAt, tileAt } from './map';
import { emit, hurt, triggers } from './combat';
import { UNITS } from './units';

// Deterministic circle physics. Bodies are circles; walls are tiles. Movement is integrated in
// fixed 4-pace steps so every machine resolves a shove identically.

const STEP = 4;

export function freeAt(w: World, x: number, y: number, r: number, self: Unit | null, ignoreUnits = false): boolean {
  const k = r * 0.7;
  if (isWallAt(w, x, y) || isWallAt(w, x + k, y) || isWallAt(w, x - k, y) || isWallAt(w, x, y + k) || isWallAt(w, x, y - k)) return false;
  if (ignoreUnits) return true;
  for (const v of w.units) {
    if (v === self || !v.alive || v.gone) continue;
    if (Math.hypot(v.x - x, v.y - y) < r + v.r - 6) return false;
  }
  return true;
}

export function findFreeNear(w: World, x: number, y: number, r: number, self: Unit | null, maxR = 120): Pt | null {
  if (!isLiquid(tileAt(w, x, y)) && freeAt(w, x, y, r, self)) return { x, y };
  for (let rad = 12; rad <= maxR; rad += 12) {
    const n = Math.max(8, Math.round(rad / 6));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
      if (!isLiquid(tileAt(w, px, py)) && freeAt(w, px, py, r, self)) return { x: px, y: py };
    }
  }
  return null;
}

export interface WalkPlan { x: number; y: number; used: number; trail: Pt[] }

/** Walk along waypoints until stamina runs out or `stop` is satisfied. Pure: does not move the unit. */
export function planWalk(w: World, u: Unit, pts: Pt[], max: number, stop?: (p: Pt) => boolean): WalkPlan {
  let x = u.x, y = u.y, used = 0;
  const trail: Pt[] = [];
  let fx = x, fy = y, fused = 0, fcount = 0;
  if (stop && stop({ x, y })) return { x, y, used: 0, trail: [] };
  outer: for (const p of pts) {
    for (;;) {
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
      if (d < 0.01) break;
      const s = Math.min(STEP, d, max - used);
      if (s <= 0) break outer;
      x += (dx / d) * s;
      y += (dy / d) * s;
      used += s;
      trail.push({ x, y });
      const free = freeAt(w, x, y, u.r, u);
      if (free) { fx = x; fy = y; fused = used; fcount = trail.length; }
      if (free && stop && stop({ x, y })) break outer;
      if (used >= max) break outer;
    }
  }
  return { x: fx, y: fy, used: fused, trail: trail.slice(0, fcount) };
}

export function samplePath(trail: Pt[], every = 3): Pt[] {
  const out: Pt[] = [];
  for (let i = every - 1; i < trail.length; i += every) out.push({ x: trail[i].x, y: trail[i].y });
  const last = trail[trail.length - 1];
  if (last && (!out.length || out[out.length - 1] !== last)) out.push({ x: last.x, y: last.y });
  return out;
}

export function commitWalk(w: World, u: Unit, plan: WalkPlan) {
  if (!plan.trail.length) return;
  emit(w, { k: 'move', id: u.id, path: samplePath(plan.trail) });
  for (const p of plan.trail) {
    u.x = p.x;
    u.y = p.y;
    triggers(w, u);
    if (!u.alive) break;
  }
}

/**
 * Knockback with momentum transfer. A body slides `dist` paces along (dx,dy).
 * Slamming into a wall deals impact damage from the momentum left over; slamming into another
 * body hands 70% of the leftover momentum on to it and hurts both a little.
 */
export function knockback(w: World, u: Unit, dx: number, dy: number, dist: number, depth = 0, impact = true) {
  if (!u || u.gone || dist <= 0) return;
  if (UNITS[u.type].boss && u.type !== 'anvil') dist *= 0.35;
  if (u.owner && Object.values(w.players.find((p) => p.pid === u.owner)?.gear ?? {}).includes('leadboots')) return;
  // ice: bodies slide twice as far
  if (tileAt(w, u.x, u.y) === T_ICE) dist *= 2;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return;
  dx /= L;
  dy /= L;
  let x = u.x, y = u.y, moved = 0;
  const trail: Pt[] = [];
  let hitWall = false;
  let hitUnit: Unit | null = null;
  while (moved < dist) {
    const s = Math.min(STEP, dist - moved);
    const nx = x + dx * s, ny = y + dy * s;
    if (!freeAt(w, nx, ny, u.r, u, true)) { hitWall = true; break; }
    if (u.alive) {
      const blocker = w.units.find((v) => v !== u && v.alive && !v.gone && Math.hypot(v.x - nx, v.y - ny) < u.r + v.r - 6);
      if (blocker) { hitUnit = blocker; break; }
    }
    x = nx;
    y = ny;
    moved += s;
    trail.push({ x, y });
  }
  if (trail.length) emit(w, { k: 'push', id: u.id, path: samplePath(trail, 2) });
  for (const p of trail) {
    u.x = p.x;
    u.y = p.y;
    if (u.alive) triggers(w, u);
  }
  const left = dist - moved;
  if (!u.alive || left <= 8 || !impact) return;
  if (hitWall) {
    const imp = Math.round(left * 0.1);
    if (imp > 0) {
      emit(w, { k: 'fx', fx: 'burst', x: u.x + dx * u.r, y: u.y + dy * u.r, color: 0xcfc4ad });
      hurt(w, u, imp, 'impact');
    }
  } else if (hitUnit && depth < 4) {
    const other = hitUnit;
    knockback(w, other, dx, dy, left * 0.7, depth + 1);
    const imp = Math.round(left * 0.05);
    if (imp > 0) {
      hurt(w, u, imp, 'impact');
      hurt(w, other, imp, 'impact');
    }
  }
}

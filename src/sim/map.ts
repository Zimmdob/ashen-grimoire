import type { Pt, World } from './types';
import { TILE, T_FLOOR, T_ICE, T_WALL } from './constants';
import type { BiomeDef } from './biomes';
import { rand, randInt, shuffle } from './rng';

export function tileAt(w: World, x: number, y: number): number {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= w.MW || ty >= w.MH) return T_WALL;
  return w.map[ty][tx];
}
export const isWallAt = (w: World, x: number, y: number) => tileAt(w, x, y) === T_WALL;

/** Change tiles at runtime (terrain spells). Returns the changes for the renderer. */
export function setTiles(w: World, cx: number, cy: number, rad: number, to: number, only?: (t: number) => boolean): { x: number; y: number; t: number }[] {
  const tx0 = Math.floor(cx / TILE), ty0 = Math.floor(cy / TILE), tr = Math.ceil(rad / TILE);
  const out: { x: number; y: number; t: number }[] = [];
  for (let ty = ty0 - tr; ty <= ty0 + tr; ty++)
    for (let tx = tx0 - tr; tx <= tx0 + tr; tx++) {
      if (tx <= 0 || ty <= 0 || tx >= w.MW - 1 || ty >= w.MH - 1) continue;
      const c = tileCenter(tx, ty);
      if (Math.hypot(c.x - cx, c.y - cy) > rad) continue;
      const t = w.map[ty][tx];
      if (t === T_WALL || t === to || (only && !only(t))) continue;
      w.map[ty][tx] = to;
      out.push({ x: tx, y: ty, t: to });
    }
  return out;
}
export const tileCenter = (tx: number, ty: number): Pt => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

/** Line of sight: walls block, lava does not. */
export function los(w: World, a: Pt, b: Pt): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.ceil(d / 8);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (isWallAt(w, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
  }
  return true;
}

function flood(m: number[][], MW: number, MH: number, sx: number, sy: number, pass: (t: number) => boolean): Set<number> {
  const seen = new Set<number>([sy * MW + sx]);
  const stack = [sy * MW + sx];
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % MW, y = (i / MW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const j = ny * MW + nx;
      if (!seen.has(j) && pass(m[ny][nx])) { seen.add(j); stack.push(j); }
    }
  }
  return seen;
}

const dry = (t: number) => t === T_FLOOR || t === T_ICE;

/** Cellular-automaton caverns with liquid pools that never cut the dry floor in two. */
export function generateMap(w: World, b: BiomeDef): number[][] {
  const { MW, MH } = w;
  for (let attempt = 0; attempt < 200; attempt++) {
    let m: number[][] = [];
    for (let y = 0; y < MH; y++) {
      const row: number[] = [];
      for (let x = 0; x < MW; x++) {
        const edge = x === 0 || y === 0 || x === MW - 1 || y === MH - 1;
        row.push(edge ? T_WALL : rand(w) < b.walls ? T_WALL : T_FLOOR);
      }
      m.push(row);
    }
    for (let it = 0; it < 4; it++) {
      const n = m.map((r) => r.slice());
      for (let y = 1; y < MH - 1; y++)
        for (let x = 1; x < MW - 1; x++) {
          let c = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) c += m[y + dy][x + dx] === T_WALL ? 1 : 0;
          n[y][x] = c >= 5 ? T_WALL : T_FLOOR;
        }
      m = n;
    }
    const seen = new Set<number>();
    let best: Set<number> | null = null;
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) {
        const i = y * MW + x;
        if (m[y][x] !== T_FLOOR || seen.has(i)) continue;
        const reg = flood(m, MW, MH, x, y, (t) => t === T_FLOOR);
        reg.forEach((j) => seen.add(j));
        if (!best || reg.size > best.size) best = reg;
      }
    if (!best || best.size < MW * MH * 0.38) continue;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (m[y][x] === T_FLOOR && !best.has(y * MW + x)) m[y][x] = T_WALL;

    const floors = [...best].sort((a, b) => a - b);
    const pools = b.pools[0] + randInt(w, b.pools[1] - b.pools[0] + 1);
    for (let p = 0; p < pools; p++) {
      const c = floors[randInt(w, floors.length)];
      const cx = c % MW, cy = (c / MW) | 0;
      const rad = 1 + randInt(w, 2);
      const changed: number[] = [];
      for (let dy = -rad; dy <= rad; dy++)
        for (let dx = -rad; dx <= rad; dx++) {
          if (dx * dx + dy * dy > rad * rad + (rand(w) < 0.5 ? 1 : 0)) continue;
          const x = cx + dx, y = cy + dy;
          if (x > 0 && y > 0 && x < MW - 1 && y < MH - 1 && m[y][x] === T_FLOOR) { m[y][x] = b.liquid; changed.push(y * MW + x); }
        }
      const remaining = floors.filter((i) => m[(i / MW) | 0][i % MW] === T_FLOOR);
      const r0 = remaining[0];
      const ok = r0 !== undefined && flood(m, MW, MH, r0 % MW, (r0 / MW) | 0, (t) => t === T_FLOOR).size === remaining.length;
      if (!ok) for (const i of changed) m[(i / MW) | 0][i % MW] = T_FLOOR;
    }
    if (b.ice) {
      // frozen patches: walkable, but shoves slide twice as far across them
      const n = 4 + randInt(w, 4);
      for (let p = 0; p < n; p++) {
        const c = floors[randInt(w, floors.length)];
        const cx = c % MW, cy = (c / MW) | 0, rad = 2 + randInt(w, 2);
        for (let dy = -rad; dy <= rad; dy++)
          for (let dx = -rad; dx <= rad; dx++) {
            const x = cx + dx, y = cy + dy;
            if (dx * dx + dy * dy <= rad * rad && x > 0 && y > 0 && x < MW - 1 && y < MH - 1 && m[y][x] === T_FLOOR) m[y][x] = T_ICE;
          }
      }
    }
    return m;
  }
  // Fallback: an open hall.
  return Array.from({ length: MH }, (_, y) => Array.from({ length: MW }, (_, x) => (x === 0 || y === 0 || x === MW - 1 || y === MH - 1 ? T_WALL : T_FLOOR)));
}

/** Torches hang on wall faces that look down onto floor. */
export function placeTorches(w: World): Pt[] {
  const spots: Pt[] = [];
  for (let y = 1; y < w.MH - 1; y++)
    for (let x = 1; x < w.MW - 1; x++)
      if (w.map[y][x] === T_WALL && dry(w.map[y + 1][x])) spots.push({ x, y });
  shuffle(w, spots);
  const out: Pt[] = [];
  for (const s of spots) {
    if (out.length >= 9) break;
    if (out.every((o) => Math.abs(o.x - s.x) + Math.abs(o.y - s.y) >= 6)) out.push(s);
  }
  return out.map((s) => ({ x: s.x * TILE + TILE / 2, y: s.y * TILE + TILE - 6 }));
}

export function floorTiles(w: World): Pt[] {
  const out: Pt[] = [];
  for (let y = 0; y < w.MH; y++) for (let x = 0; x < w.MW; x++) if (dry(w.map[y][x])) out.push(tileCenter(x, y));
  return out;
}

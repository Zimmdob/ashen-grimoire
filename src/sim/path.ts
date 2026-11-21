import type { Pt, World } from './types';
import { TILE, T_BLOOD, T_BOG, T_LAVA, T_WALL, T_WATER } from './constants';

/** Liquids that hurt: walkers route around them. Water only slows the route a little. */
const harmful = (t: number) => t === T_LAVA || t === T_BOG || t === T_BLOOD;
import { isWallAt, tileAt, tileCenter } from './map';

class Heap {
  private a: [number, number][] = [];
  get size() { return this.a.length; }
  push(n: number, p: number) {
    const a = this.a;
    a.push([p, n]);
    let i = a.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (a[j][0] <= a[i][0]) break;
      [a[i], a[j]] = [a[j], a[i]];
      i = j;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top[1];
  }
}

/** True if a body of ~8 radius can travel straight from a to b. */
export function clearSeg(w: World, a: Pt, b: Pt, avoidLava: boolean): boolean {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.max(1, Math.ceil(d / 6));
  const startLava = harmful(tileAt(w, a.x, a.y));
  for (let i = 1; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n, y = a.y + ((b.y - a.y) * i) / n;
    if (isWallAt(w, x + 7, y + 7) || isWallAt(w, x - 7, y + 7) || isWallAt(w, x + 7, y - 7) || isWallAt(w, x - 7, y - 7)) return false;
    if (avoidLava && !startLava && harmful(tileAt(w, x, y))) return false;
  }
  return true;
}

export interface PathOpts { lavaCost?: number }

/** 8-way A* over tiles with string-pulling. Returns waypoints after `from`, or null. */
export function findPath(w: World, from: Pt, to: Pt, opts: PathOpts = {}): Pt[] | null {
  const { MW, MH } = w;
  const lavaCost = opts.lavaCost ?? 8;
  const clampX = (v: number) => Math.max(0, Math.min(MW - 1, Math.floor(v / TILE)));
  const clampY = (v: number) => Math.max(0, Math.min(MH - 1, Math.floor(v / TILE)));
  const sx = clampX(from.x), sy = clampY(from.y);
  let gx = clampX(to.x), gy = clampY(to.y);
  let exact = true;
  if (w.map[gy][gx] === T_WALL) {
    exact = false;
    let found = false;
    for (let r = 1; r <= 3 && !found; r++)
      for (let dy = -r; dy <= r && !found; dy++)
        for (let dx = -r; dx <= r && !found; dx++) {
          const x = gx + dx, y = gy + dy;
          if (x >= 0 && y >= 0 && x < MW && y < MH && w.map[y][x] !== T_WALL) { gx = x; gy = y; found = true; }
        }
    if (!found) return null;
  }
  const N = MW * MH, start = sy * MW + sx, goal = gy * MW + gx;
  const gs = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new Heap();
  gs[start] = 0;
  heap.push(start, 0);
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) break;
    const cx = cur % MW, cy = (cur / MW) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
        const t = w.map[ny][nx];
        if (t === T_WALL) continue;
        if (dx && dy && (w.map[cy][nx] === T_WALL || w.map[ny][cx] === T_WALL)) continue;
        const n = ny * MW + nx;
        const ng = gs[cur] + (dx && dy ? 1.4142 : 1) * (harmful(t) ? lavaCost : t === T_WATER ? 1.6 : 1);
        if (ng < gs[n]) {
          gs[n] = ng;
          came[n] = cur;
          const hx = Math.abs(nx - gx), hy = Math.abs(ny - gy);
          heap.push(n, ng + Math.max(hx, hy) + 0.4142 * Math.min(hx, hy));
        }
      }
  }
  if (!closed[goal]) return null;
  const tiles: number[] = [];
  for (let c = goal; c !== start && c !== -1; c = came[c]) tiles.push(c);
  tiles.reverse();
  const pts = tiles.map((i) => tileCenter(i % MW, (i / MW) | 0));
  if (exact) {
    if (pts.length) pts[pts.length - 1] = { x: to.x, y: to.y };
    else pts.push({ x: to.x, y: to.y });
  }
  if (!pts.length) return [];
  const avoid = lavaCost > 1;
  const out: Pt[] = [];
  let cur: Pt = from;
  let i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !clearSeg(w, cur, pts[j], avoid)) j--;
    out.push(pts[j]);
    cur = pts[j];
    i = j + 1;
  }
  return out;
}

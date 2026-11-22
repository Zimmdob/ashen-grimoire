import type { Pt, World } from './types';
import { TILE, T_WALL } from './constants';
import { clearSeg } from './path';

/**
 * How far a walker can get on the stamina it has: an outline of the reachable ground, as line
 * segments [x1, y1, x2, y2, ...] in world units. Walking distance is measured the way the game
 * charges it: straight-line where the way is clear, around walls otherwise. Read-only; for display.
 */
export function reachOutline(w: World, from: Pt, stamina: number): number[] {
  const { MW, MH, map } = w;
  if (stamina <= 0) return [];
  const N = MW * MH;
  const dist = new Float64Array(N).fill(Infinity);
  const cx = (t: number) => (t % MW) * TILE + TILE / 2, cy = (t: number) => Math.floor(t / MW) * TILE + TILE / 2;
  const sx = Math.max(0, Math.min(MW - 1, Math.floor(from.x / TILE))), sy = Math.max(0, Math.min(MH - 1, Math.floor(from.y / TILE)));
  const start = sy * MW + sx;
  if (map[sy][sx] === T_WALL) return [];
  // Dijkstra over tile centres (8-way, no cutting wall corners); a small binary heap keeps it quick.
  const heap: [number, number][] = [];
  const push = (d: number, n: number) => {
    heap.push([d, n]);
    let i = heap.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; }
    }
    return top;
  };
  const limit = stamina + TILE * 2;
  dist[start] = Math.hypot(cx(start) - from.x, cy(start) - from.y);
  push(dist[start], start);
  while (heap.length) {
    const [d, cur] = pop();
    if (d > dist[cur] || d > limit) continue;
    const x = cur % MW, y = Math.floor(cur / MW);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH || map[ny][nx] === T_WALL) continue;
      if (dx && dy && (map[y][nx] === T_WALL || map[ny][x] === T_WALL)) continue;
      const n = ny * MW + nx, nd = d + (dx && dy ? TILE * Math.SQRT2 : TILE);
      if (nd < dist[n]) { dist[n] = nd; push(nd, n); }
    }
  }
  // Where the way is clear the walk is a straight line, which is shorter than any grid path.
  const value = new Float64Array(N);
  for (let t = 0; t < N; t++) {
    let d = dist[t];
    if (d <= limit) {
      const p = { x: cx(t), y: cy(t) };
      const e = Math.hypot(p.x - from.x, p.y - from.y);
      if (e < d && clearSeg(w, from, p, false)) d = e;
    }
    value[t] = d === Infinity ? -TILE : stamina - d;
  }
  // Marching squares over the tile-centre grid: the line where (stamina - distance) crosses zero.
  const out: number[] = [];
  const lerp = (a: number, b: number) => (a === b ? 0.5 : a / (a - b));
  for (let y = 0; y < MH - 1; y++) for (let x = 0; x < MW - 1; x++) {
    const a = value[y * MW + x], b = value[y * MW + x + 1], c = value[(y + 1) * MW + x + 1], d = value[(y + 1) * MW + x];
    const k = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
    if (k === 0 || k === 15) continue;
    const X = x * TILE + TILE / 2, Y = y * TILE + TILE / 2;
    const top = [X + lerp(a, b) * TILE, Y], right = [X + TILE, Y + lerp(b, c) * TILE];
    const bottom = [X + lerp(d, c) * TILE, Y + TILE], left = [X, Y + lerp(a, d) * TILE];
    const seg = (p: number[], q: number[]) => out.push(p[0], p[1], q[0], q[1]);
    switch (k) {
      case 1: case 14: seg(left, bottom); break;
      case 2: case 13: seg(bottom, right); break;
      case 3: case 12: seg(left, right); break;
      case 4: case 11: seg(top, right); break;
      case 6: case 9: seg(top, bottom); break;
      case 7: case 8: seg(left, top); break;
      case 5: seg(left, top); seg(bottom, right); break;
      case 10: seg(top, right); seg(left, bottom); break;
    }
  }
  return out;
}

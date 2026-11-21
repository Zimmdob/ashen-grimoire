import type { LevelSnap } from '../sim/types';
import { isLiquid, T_BLOOD, T_BOG, T_ICE, T_LAVA, T_WALL, T_WATER } from '../sim/constants';
import { BIOMES } from '../sim/biomes';

// Pre-renders a depth at 16 pixels per tile: flagstone floors, brick walls with a lit front face,
// moss and scattered bones. Visual-only randomness uses its own hash so it never touches the sim seed.

const hash = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function drawMap(snap: LevelSnap): HTMLCanvasElement {
  const { MW, MH, map } = snap;
  const c = document.createElement('canvas');
  c.width = MW * 16;
  c.height = MH * 16;
  const g = c.getContext('2d')!;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= MW || y >= MH ? T_WALL : map[y][x]);
  const px = (x: number, y: number, col: string) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const seed = snap.level;
  const pal = (BIOMES[snap.biome] ?? BIOMES.cellars).pal;

  for (let ty = 0; ty < MH; ty++)
    for (let tx = 0; tx < MW; tx++) {
      const X = tx * 16, Y = ty * 16, t = map[ty][tx];
      if (t !== T_WALL) {
        // flagstones: 2x2 slabs per tile with mortar seams and per-stone tone
        for (let sy = 0; sy < 2; sy++)
          for (let sx = 0; sx < 2; sx++) {
            const v = hash(tx * 2 + sx, ty * 2 + sy, seed);
            const tones = pal.floor;
            g.fillStyle = tones[Math.floor(v * tones.length)];
            g.fillRect(X + sx * 8, Y + sy * 8, 8, 8);
            g.fillStyle = '#15100f';
            g.fillRect(X + sx * 8, Y + sy * 8 + 7, 8, 1);
            g.fillRect(X + sx * 8 + 7, Y + sy * 8, 1, 8);
            g.fillStyle = 'rgba(255,240,220,0.05)';
            g.fillRect(X + sx * 8, Y + sy * 8, 7, 1);
            if (v > 0.82) { px(X + sx * 8 + 2, Y + sy * 8 + 3, '#141010'); px(X + sx * 8 + 3, Y + sy * 8 + 4, '#141010'); px(X + sx * 8 + 4, Y + sy * 8 + 4, '#141010'); }
          }
        const d = hash(tx, ty, seed + 9);
        if (d > 0.93) { px(X + 5, Y + 9, pal.accent); px(X + 6, Y + 9, pal.accent); px(X + 7, Y + 10, pal.accent); px(X + 9, Y + 8, '#a89c86'); }
        else if (d > 0.86) for (let i = 0; i < 5; i++) px(X + Math.floor(hash(tx, ty, i) * 16), Y + Math.floor(hash(ty, tx, i) * 16), '#2c3a22');
        if (t === T_ICE) {
          g.fillStyle = 'rgba(170,220,255,0.38)';
          g.fillRect(X, Y, 16, 16);
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.fillRect(X + 2 + Math.floor(d * 6), Y + 3, 5, 1);
          g.fillRect(X + 8, Y + 9 + Math.floor(d * 4), 4, 1);
        }
        if (at(tx, ty - 1) === T_WALL) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(X, Y, 16, 3); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(X, Y + 3, 16, 2); }
        if (isLiquid(t)) { g.fillStyle = t === T_LAVA ? '#3a0a04' : t === T_WATER ? '#0a1a2a' : t === T_BLOOD ? '#2a0408' : '#1a2008'; g.fillRect(X, Y, 16, 16); }
      } else {
        const below = at(tx, ty + 1) !== T_WALL;
        const touches = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([dx, dy]) => at(tx + dx, ty + dy) !== T_WALL);
        g.fillStyle = '#0b0809';
        g.fillRect(X, Y, 16, 16);
        if (!touches) continue;
        // top of the wall
        g.fillStyle = pal.top;
        g.fillRect(X, Y, 16, below ? 7 : 16);
        for (let by = 0; by < (below ? 7 : 16); by += 4) {
          g.fillStyle = pal.mortar;
          g.fillRect(X, Y + by + 3, 16, 1);
          const off = (by / 4) % 2 ? 0 : 4;
          for (let bx = off; bx < 16; bx += 8) g.fillRect(X + bx, Y + by, 1, 3);
        }
        if (below) {
          // lit front face with bigger bricks
          g.fillStyle = pal.face;
          g.fillRect(X, Y + 7, 16, 9);
          g.fillStyle = pal.faceHi;
          g.fillRect(X, Y + 7, 16, 1);
          g.fillStyle = pal.mortar;
          g.fillRect(X, Y + 11, 16, 1);
          g.fillRect(X, Y + 15, 16, 1);
          const o = (tx % 2) * 4;
          g.fillRect(X + 3 + o, Y + 8, 1, 3);
          g.fillRect(X + 11 - o, Y + 12, 1, 3);
          if (hash(tx, ty, seed + 3) > 0.7) { px(X + 6, Y + 13, pal.faceHi); px(X + 7, Y + 13, pal.faceHi); }
          if (hash(tx, ty, seed + 5) > 0.88) { px(X + 11, Y + 9, pal.accent); px(X + 11, Y + 10, pal.accent); }
        }
      }
    }
  return c;
}

const LIQ: Record<number, [string, string, string, string]> = {
  [T_LAVA]: ['#ffd06a', '#ff7a1e', '#c8320e', '#7a1606'],
  [T_WATER]: ['#9fd0ff', '#3a6aa8', '#1f3f6a', '#12284a'],
  [T_BLOOD]: ['#ff5a5a', '#a8141e', '#6a0a12', '#3a040a'],
  [T_BOG]: ['#b0d040', '#5a7a1a', '#3a4a12', '#22300a'],
};
/** Animated liquids (lava, water, blood, bog), redrawn into the same canvas each few frames. */
export function drawLava(c: HTMLCanvasElement, snap: LevelSnap, t: number) {
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  for (let ty = 0; ty < snap.MH; ty++)
    for (let tx = 0; tx < snap.MW; tx++) {
      const tile = snap.map[ty][tx];
      const cols = LIQ[tile];
      if (!cols) continue;
      const speed = tile === T_LAVA ? 1 : tile === T_WATER ? 0.6 : 0.4;
      for (let py = 0; py < 16; py += 2)
        for (let pxx = 0; pxx < 16; pxx += 2) {
          const wx = tx * 16 + pxx, wy = ty * 16 + py;
          const v = Math.sin(wx * 0.35 + t * 1.7 * speed) + Math.sin(wy * 0.42 - t * 1.3 * speed) + Math.sin((wx + wy) * 0.18 + t * 0.8 * speed);
          g.fillStyle = v > 1.6 ? cols[0] : v > 0.7 ? cols[1] : v > -0.4 ? cols[2] : cols[3];
          g.fillRect(wx, wy, 2, 2);
        }
    }
}

/** Static film grain and vignette, laid over everything. */
export function drawGrain(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const b = bayer[(y % 4) * 4 + (x % 4)] / 16;
      img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0;
      img.data[i + 3] = b > 0.8 ? 22 : 0;
    }
  g.putImageData(img, 0, 0);
  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.85);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.65)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
  return c;
}

export function lightBlob(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.75)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return c;
}

// Set dressing for Cinderstorm's arenas: small painted props, a handful per act, scattered on the
// floor by a seeded hand so each room looks lived-in (or died-in).
import { C, Painter, ramp as R } from './paint';

type Prop = (p: Painter) => void;
const PROPS: Prop[][] = [
  // the Greenwood
  [
    (p) => { p.cap(16, 30, 16, 22, 1.6, 1.4, R('#e8dcc0')); p.blob(16, 21, 6, 3.6, R('#c0402a')); for (const [x, y] of [[13, 20], [17, 19], [19, 21.5]]) p.dot(x, y, C('#fff0e0'), 1.4); },
    (p) => { for (let i = 0; i < 5; i++) { const a = -2.6 + i * 0.5; p.cap(16, 30, 16 + Math.cos(a) * 11, 30 + Math.sin(a) * 9, 1.4, 0.5, R('#4a8a3a')); } },
    (p) => { p.blob(16, 26, 8, 4.5, R('#6a6a6e')); p.blob(13, 24, 3, 2, R('#5a7a3a'), { lift: 0.1 }); },
    (p) => { for (const [x, y, c] of [[11, 26, '#ffd060'], [17, 24, '#e070a8'], [21, 27, '#9fe0ff']] as [number, number, string][]) { p.line(x, y + 3, x, y + 6, R('#3a6a2a')[2], 0.6); p.blob(x, y + 2, 1.6, 1.4, R(c), { lift: 0.2 }); } },
    (p) => { p.cap(6, 27, 26, 25, 3, 2.6, R('#5a3a20')); p.blob(26, 25, 2.6, 2.6, R('#8a6a40'), { lift: 0.1 }); p.blob(12, 24, 2, 1.4, R('#4a7a2a')); },
  ],
  // the Bone Cellars
  [
    (p) => { p.blob(16, 24, 5, 4.6, R('#e4dcc4')); p.blob(16, 28, 3, 1.6, R('#d4ccb4')); p.blob(14.2, 24, 1.3, 1.5, R('#1a1010'), { shade: 0, edge: false }); p.blob(17.8, 24, 1.3, 1.5, R('#1a1010'), { shade: 0, edge: false }); },
    (p) => { p.cap(7, 27, 24, 24, 1.1, 1, R('#e4dcc4')); for (const [x, y] of [[7, 27], [24, 24]]) { p.blob(x - 0.8, y - 0.8, 1.4, 1.4, R('#e4dcc4')); p.blob(x + 0.8, y + 0.8, 1.4, 1.4, R('#e4dcc4')); } p.cap(12, 29, 20, 21, 1, 0.9, R('#d4ccb4')); },
    (p) => { for (const [x, h] of [[11, 7], [16, 10], [21, 6]]) { p.cap(x, 30, x, 30 - h, 1.6, 1.5, R('#e8dcc0')); p.dot(x - 0.3, 29 - h - 1.6, R('#ffb04a')[4], 1.2, true); p.dot(x - 0.3, 29 - h - 2.8, R('#fff0b0')[4], 0.8, true); } },
    (p) => { p.poly([10, 30, 22, 30, 24, 22, 20, 18, 12, 18, 8, 22], R('#8a5a3a')); p.line(13, 21, 19, 27, R('#3a2010')[1], 0.6); },
    (p) => { for (let i = 0; i < 7; i++) p.blob(6 + i * 3.3, 26 + Math.sin(i) * 2, 1.4, 1.1, R('#7a7a84'), { lift: (i % 2) * 0.1 }); },
  ],
  // the Frost Ossuary
  [
    (p) => { for (const [x, h, a] of [[14, 14, -0.2], [18, 10, 0.25], [11, 8, -0.5]]) p.poly([x - 2, 30, x + 2, 30, x + Math.sin(a) * h, 30 - h], R('#bfe8ff'), { lift: 0.2 }); },
    (p) => { p.blob(16, 27, 10, 3.5, R('#e8f4ff'), { lift: 0.25 }); },
    (p) => { p.blob(16, 24, 5, 4.6, R('#bcd0e0')); p.blob(14.2, 24, 1.3, 1.5, R('#102030'), { shade: 0, edge: false }); p.blob(17.8, 24, 1.3, 1.5, R('#102030'), { shade: 0, edge: false }); p.poly([10, 22, 22, 22, 16, 17], R('#e8f4ff'), { lift: 0.3 }); },
    (p) => { for (let i = 0; i < 4; i++) p.poly([8 + i * 5, 30, 10 + i * 5, 30, 9 + i * 5, 24 - (i % 2) * 3], R('#9fd0f0'), { lift: 0.25 }); },
  ],
  // the Clockwork Forges
  [
    (p) => { p.blob(16, 25, 7, 4, R('#a07a34')); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.dot(16 + Math.cos(a) * 7.2, 25 + Math.sin(a) * 4.2, R('#d9a845')[3], 1.2); } p.blob(16, 25, 2, 1.2, R('#3a2a10'), { shade: 0.1 }); },
    (p) => { p.poly([6, 30, 26, 30, 22, 24, 15, 22, 9, 25], R('#4a4048')); p.line(10, 27, 22, 27, R('#ff7a2a')[4], 0.8, true); p.dot(15, 25, R('#ffd06a')[4], 1, true); },
    (p) => { p.cap(6, 26, 26, 26, 2.4, 2.4, R('#6a6a74')); p.blob(26, 26, 2.8, 2.8, R('#8a8a94')); p.line(6, 24.5, 26, 24.5, R('#9a9aa8')[4], 0.4); },
    (p) => { for (let i = 0; i < 6; i++) p.blob(8 + i * 3.4, 27 + Math.cos(i * 2) * 1.5, 1.6, 1.1, R(i % 2 ? '#5a5a64' : '#8a6a3a'), { lift: 0.05 }); },
  ],
  // the Bloodmoon Cathedral
  [
    (p) => { for (const [x, h] of [[12, 8], [17, 12], [21, 6]]) { p.cap(x, 30, x, 30 - h, 1.5, 1.4, R('#e8d8c0')); p.dot(x - 0.3, 29 - h - 1.6, R('#ff8a3a')[4], 1.2, true); } p.blob(16, 30, 8, 1.4, R('#c8b8a0'), { lift: -0.2 }); },
    (p) => { p.poly([4, 26, 28, 24, 28, 27, 4, 29], R('#4a2a1a')); p.poly([4, 22, 10, 21.5, 10, 26, 4, 26.5], R('#3a2014')); },
    (p) => { p.blob(16, 27, 9, 3, R('#6a0a14'), { lift: -0.2, edge: false }); p.blob(13, 26.5, 3, 1.2, R('#8a1a24'), { lift: 0.1, edge: false }); },
    (p) => { p.poly([12, 30, 20, 30, 19, 12, 13, 12], R('#7a1a2a')); p.line(12, 12, 20, 12, R('#ffd060')[3], 0.8); p.poly([13, 30, 16, 26, 19, 30], R('#2a0a10'), { shade: 0.1 }); },
  ],
  // the Hollow Throne
  [
    (p) => { p.blob(16, 27, 9, 3.6, R('#3a3438')); for (let i = 0; i < 4; i++) p.dot(10 + i * 4, 26 + (i % 2), R('#ff6a2a')[4], 0.9, true); },
    (p) => { for (let i = 0; i < 3; i++) p.poly([9 + i * 6, 30, 12 + i * 6, 30, 10.5 + i * 6 + (i - 1), 24 - (i % 2) * 2], R('#c8a040'), { lift: 0.2 }); },
    (p) => { p.blob(16, 25, 5, 4.6, R('#2a2228')); p.blob(14.2, 24.5, 1.2, 1.3, R('#ff4a2a'), { shade: 1, edge: false }); p.blob(17.8, 24.5, 1.2, 1.3, R('#ff4a2a'), { shade: 1, edge: false }); },
  ],
];

const cache = new Map<string, HTMLCanvasElement>();
function prop(act: number, i: number) {
  const key = `${act}:${i}`;
  let c = cache.get(key);
  if (!c) { const p = new Painter(24); PROPS[act][i](p); c = p.canvas(); cache.set(key, c); }
  return c;
}

/** Paint a room's props onto a canvas the size of the arena (in world pixels, tiles of `tile`). */
export function paintProps(act: number, map: number[][], tile: number, seed: number, keepClear: (tx: number, ty: number) => boolean): HTMLCanvasElement {
  const H = map.length, Wd = map[0].length;
  const c = document.createElement('canvas'); c.width = Wd * tile; c.height = H * tile;
  const g = c.getContext('2d')!; g.imageSmoothingEnabled = false;
  const set = PROPS[Math.min(PROPS.length - 1, act)];
  let s = seed >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (let ty = 1; ty < H - 1; ty++) for (let tx = 1; tx < Wd - 1; tx++) {
    if (map[ty][tx] !== 0 || keepClear(tx, ty)) continue;
    // props hug the walls more than the middle of the floor, where the fighting is
    const nearWall = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => map[ty + dy]?.[tx + dx] === 1);
    if (rnd() > (nearWall ? 0.22 : 0.035)) continue;
    const img = prop(Math.min(PROPS.length - 1, act), Math.floor(rnd() * set.length));
    const sz = tile * (0.75 + rnd() * 0.35);
    g.save();
    g.translate(tx * tile + tile / 2 + (rnd() - 0.5) * tile * 0.4, ty * tile + tile * 0.6);
    if (rnd() < 0.5) g.scale(-1, 1);
    g.globalAlpha = 0.92;
    g.drawImage(img, -sz / 2, -sz * 0.85, sz, sz);
    g.restore();
  }
  return c;
}

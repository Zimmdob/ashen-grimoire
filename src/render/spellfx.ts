// Every spell card has its own look, so a glance tells you what it did: fire flickers and rises,
// frost grows crystals, lightning forks, plague bubbles green, wards close into a bubble, shoves
// blow wind away from you, pulls swirl inward, and so on. Drawn with plain Graphics each frame;
// `t` runs 0 → 1 over the effect's life. Purely visual: the sim never reads any of this.

import type { Graphics } from 'pixi.js';

export interface Pt { x: number; y: number }
export interface SpellFx { card: string; x: number; y: number; pts: Pt[]; power: number; t0: number; dur: number; seed: number }

type Painter = (g: Graphics, f: SpellFx, t: number, now: number) => void;

/** Cheap stable noise in [0, 1) so particles keep their paths frame to frame. */
const h = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const ease = (t: number) => 1 - (1 - t) * (1 - t);
const fade = (t: number, inT = 0.12, outT = 0.35) => Math.min(1, t / inT, (1 - t) / outT);
const targets = (f: SpellFx) => (f.pts.length ? f.pts : [{ x: f.x, y: f.y }]);
const first = (f: SpellFx) => f.pts[0] ?? { x: f.x, y: f.y };

// ---------------------------------------------------------------- building blocks
function flames(g: Graphics, p: Pt, t: number, seed: number, n: number, spread: number, height: number, cols = [0xffd24a, 0xff8a2a, 0xd83a1a]) {
  for (let i = 0; i < n; i++) {
    const k = (t * 1.6 + h(seed + i)) % 1;          // each tongue loops upward
    const x = p.x + (h(seed + i * 3) - 0.5) * spread + Math.sin(k * 9 + i) * 3;
    const y = p.y + 4 - k * height;
    const s = (1 - k) * (5 + h(seed + i * 7) * 5);
    const c = cols[Math.min(cols.length - 1, Math.floor(k * cols.length))];
    g.poly([x - s, y, x, y - s * 2.2, x + s, y]).fill({ color: c, alpha: fade(t) * (1 - k * 0.5) });
  }
}
function shards(g: Graphics, p: Pt, t: number, seed: number, n: number, reach: number, color: number, inward = false) {
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + h(seed + i) * 0.6;
    const d = (inward ? 1 - ease(t) : ease(t)) * reach * (0.6 + h(seed + i * 5) * 0.4);
    const x = p.x + Math.cos(ang) * d, y = p.y - 8 + Math.sin(ang) * d * 0.8;
    const L = 7, W = 2.5;
    const cx = Math.cos(ang), sy = Math.sin(ang);
    g.poly([x + cx * L, y + sy * L, x - sy * W, y + cx * W, x - cx * L * 0.4, y - sy * L * 0.4, x + sy * W, y - cx * W]).fill({ color, alpha: fade(t, 0.05, 0.4) });
  }
}
function rising(g: Graphics, p: Pt, t: number, seed: number, n: number, color: number, height = 50, size = 3, spread = 30) {
  for (let i = 0; i < n; i++) {
    const k = (t + h(seed + i) * 0.6) % 1;
    const x = p.x + (h(seed + i * 2) - 0.5) * spread + Math.sin(k * 6 + i) * 4;
    const y = p.y - k * height;
    g.rect(x - size / 2, y - size / 2, size, size).fill({ color, alpha: fade(t) * (1 - k * 0.6) });
  }
}
function falling(g: Graphics, p: Pt, t: number, seed: number, n: number, color: number, height = 50, size = 3, spread = 34) {
  for (let i = 0; i < n; i++) {
    const k = (t * 1.3 + h(seed + i) * 0.7) % 1;
    const x = p.x + (h(seed + i * 2) - 0.5) * spread;
    const y = p.y - height + k * (height + 6);
    g.rect(x - size / 2, y - size / 2, size, size * 1.6).fill({ color, alpha: fade(t) * (0.4 + k * 0.6) });
  }
}
function puffs(g: Graphics, p: Pt, t: number, seed: number, n: number, color: number, r = 8, spread = 30, rise = 26) {
  for (let i = 0; i < n; i++) {
    const k = (t + h(seed + i) * 0.5) % 1;
    const x = p.x + (h(seed + i * 3) - 0.5) * spread;
    const y = p.y - 6 - k * rise;
    g.circle(x, y, r * (0.5 + k)).fill({ color, alpha: fade(t) * 0.45 * (1 - k * 0.7) });
  }
}
function wave(g: Graphics, p: Pt, t: number, r: number, color: number, width = 4, squash = 0.6) {
  const rr = r * ease(t);
  g.ellipse(p.x, p.y, rr, rr * squash).stroke({ width, color, alpha: 1 - t });
}
function jag(g: Graphics, a: Pt, b: Pt, seed: number, now: number, color: number, width: number, alpha: number) {
  const n = 8, L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / L, ny = (b.x - a.x) / L;
  g.moveTo(a.x, a.y);
  for (let i = 1; i < n; i++) {
    const k = i / n, j = (h(seed + i + Math.floor(now / 45)) - 0.5) * Math.min(26, L * 0.25);
    g.lineTo(a.x + (b.x - a.x) * k + nx * j, a.y + (b.y - a.y) * k + ny * j);
  }
  g.lineTo(b.x, b.y).stroke({ width, color, alpha });
}
function along(a: Pt, b: Pt, k: number, arc = 0): Pt {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k - Math.sin(Math.PI * k) * arc };
}
function projectile(g: Graphics, f: SpellFx, p: Pt, t: number, color: number, len: number, width: number, arc = 0, head = 0xffffff) {
  const k = Math.min(1, t / 0.55);
  const from = { x: f.x, y: f.y - 12 };
  const tip = along(from, { x: p.x, y: p.y - 10 }, k, arc), tail = along(from, { x: p.x, y: p.y - 10 }, Math.max(0, k - len), arc);
  if (k < 1) {
    g.moveTo(tail.x, tail.y).lineTo(tip.x, tip.y).stroke({ width, color, alpha: 0.9 });
    g.circle(tip.x, tip.y, width * 0.7).fill({ color: head, alpha: 0.9 });
  }
}
function sigil(g: Graphics, p: Pt, t: number, r: number, color: number, points = 5) {
  const a = fade(t, 0.15, 0.4), spin = t * 1.2;
  g.ellipse(p.x, p.y + 2, r, r * 0.5).stroke({ width: 2, color, alpha: a });
  g.ellipse(p.x, p.y + 2, r * 0.75, r * 0.37).stroke({ width: 1, color, alpha: a * 0.7 });
  const v: number[] = [];
  for (let i = 0; i < points; i++) {
    const ang = spin + ((i * 2) % points) * ((Math.PI * 2) / points);
    v.push(p.x + Math.cos(ang) * r * 0.75, p.y + 2 + Math.sin(ang) * r * 0.37);
  }
  g.poly(v).stroke({ width: 1.5, color, alpha: a });
}
function bubble(g: Graphics, p: Pt, t: number, color: number, r = 20) {
  const k = ease(Math.min(1, t * 2.2));
  const a = fade(t, 0.05, 0.4);
  g.circle(p.x, p.y - 12, r * k).fill({ color, alpha: 0.14 * a }).stroke({ width: 2, color, alpha: 0.9 * a });
  g.arc(p.x - 4, p.y - 16, r * k * 0.6, Math.PI * 1.1, Math.PI * 1.5).stroke({ width: 2, color: 0xffffff, alpha: 0.7 * a });
}
function plus(g: Graphics, x: number, y: number, s: number, color: number, alpha: number) {
  g.rect(x - s, y - s / 3, s * 2, (s * 2) / 3).fill({ color, alpha });
  g.rect(x - s / 3, y - s, (s * 2) / 3, s * 2).fill({ color, alpha });
}
function arrows(g: Graphics, p: Pt, t: number, seed: number, up: boolean, color: number) {
  for (let i = 0; i < 4; i++) {
    const k = (t * 1.2 + i / 4) % 1;
    const x = p.x + (i - 1.5) * 9 + (h(seed + i) - 0.5) * 4;
    const y = up ? p.y - k * 40 : p.y - 40 + k * 40;
    const d = up ? -1 : 1;
    g.poly([x - 4, y, x + 4, y, x, y + d * 6]).fill({ color, alpha: fade(t) * (1 - k * 0.4) });
  }
}
function claws(g: Graphics, p: Pt, t: number, n: number, color: number, len = 26) {
  const k = Math.min(1, t * 3);
  for (let i = 0; i < n; i++) {
    const ox = (i - (n - 1) / 2) * 8;
    g.moveTo(p.x + ox - len / 2, p.y - 24).lineTo(p.x + ox - len / 2 + len * k, p.y - 24 + len * k * 0.9).stroke({ width: 3, color, alpha: 1 - t });
  }
}
function crescent(g: Graphics, p: Pt, t: number, r: number, color: number, width: number, start = -2.4) {
  const st = start + t * 2.8;
  g.arc(p.x, p.y - 12, r, st, st + 1.3).stroke({ width, color, alpha: 1 - t });
  g.arc(p.x, p.y - 12, r - width, st + 0.15, st + 1.1).stroke({ width: Math.max(1, width / 2), color: 0xffffff, alpha: (1 - t) * 0.8 });
}
function wind(g: Graphics, from: Pt, p: Pt, t: number, seed: number, color: number, away: boolean) {
  const L = Math.hypot(p.x - from.x, p.y - from.y) || 1;
  const ux = (p.x - from.x) / L, uy = (p.y - from.y) / L;
  const dir = away ? 1 : -1;
  for (let i = 0; i < 9; i++) {
    const k = (t * 1.5 + h(seed + i)) % 1;
    const off = (h(seed + i * 4) - 0.5) * 30;
    const cx = p.x - uy * off + ux * dir * (k * 60 - 20), cy = p.y - 12 + ux * off + uy * dir * (k * 60 - 20);
    g.moveTo(cx - ux * dir * 22, cy - uy * dir * 22).lineTo(cx, cy).stroke({ width: 3, color, alpha: fade(t) * (1 - k * 0.7) });
  }
}
function vortex(g: Graphics, p: Pt, t: number, r: number, color: number) {
  for (let i = 0; i < 3; i++) {
    const rr = r * (1 - ((t * 1.4 + i / 3) % 1));
    const st = t * 8 + i * 2;
    g.arc(p.x, p.y, rr, st, st + 2.2).stroke({ width: 2, color, alpha: fade(t) * 0.8 });
  }
}
function swirl(g: Graphics, p: Pt, t: number, color: number, seed: number) {
  for (let i = 0; i < 10; i++) {
    const ang = t * 7 + (i / 10) * Math.PI * 2;
    const rr = 18 * (1 - t) + 4;
    g.rect(p.x + Math.cos(ang) * rr - 2, p.y - 14 + Math.sin(ang) * rr * 0.7 - 2 - t * 10, 4, 4).fill({ color: i % 2 ? color : 0x000000, alpha: fade(t) });
  }
  g.ellipse(p.x, p.y + 2, 16 * (1 - t * 0.5), 6).fill({ color: 0x000000, alpha: 0.5 * fade(t) });
  void seed;
}
function chainLink(g: Graphics, a: Pt, b: Pt, t: number, color: number) {
  const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(2, Math.floor(L / 10));
  for (let i = 0; i < n; i++) {
    const k = i / n;
    if (k > t * 1.6) break;
    const q = along(a, b, k);
    g.ellipse(q.x, q.y, i % 2 ? 4 : 2, i % 2 ? 2 : 4).stroke({ width: 1.5, color, alpha: fade(t) });
  }
}

// ---------------------------------------------------------------- each card's look
const each = (fn: (g: Graphics, p: Pt, t: number, f: SpellFx, i: number, now: number) => void): Painter =>
  (g, f, t, now) => targets(f).forEach((p, i) => fn(g, p, t, f, i, now));

const LOOKS: Record<string, { dur: number; color: number; paint: Painter }> = {
  // --- harm
  sever: { dur: 360, color: 0xff3a3a, paint: each((g, p, t) => { crescent(g, p, t, 20, 0xe02020, 4); crescent(g, { x: p.x + 4, y: p.y }, Math.max(0, t - 0.15), 18, 0xff8080, 2, 0.6); }) },
  hemorrhage: { dur: 520, color: 0xb01010, paint: each((g, p, t, f, i) => { crescent(g, p, t, 20, 0xa00010, 4); falling(g, { x: p.x, y: p.y + 4 }, t, f.seed + i * 9, 8, 0xc01020, 26, 3, 20); }) },
  rites: { dur: 640, color: 0x8a5cff, paint: each((g, p, t) => {
    crescent(g, { x: p.x, y: p.y - 8 }, t, 30, 0x1a0a20, 6, -3); crescent(g, { x: p.x, y: p.y - 8 }, t, 26, 0x8a5cff, 2, -3);
    if (t > 0.35) g.rect(p.x - 1, p.y - 60 + (t - 0.35) * 40, 2, 40).fill({ color: 0xffffff, alpha: 1 - t });
  }) },
  bolt: { dur: 420, color: 0xcfc4ad, paint: each((g, p, t, f) => { projectile(g, f, p, t, 0x9a9a9a, 0.18, 3, 0, 0xe0e0e0); if (t > 0.55) shards(g, p, (t - 0.55) / 0.45, f.seed, 5, 14, 0xbfbfbf); }) },
  rend: { dur: 420, color: 0xff3030, paint: each((g, p, t, f) => claws(g, p, t, 2 + Math.min(3, Math.round(f.power)), 0xe02828)) },
  shatter: { dur: 560, color: 0xbfe6ff, paint: each((g, p, t, f, i) => { shards(g, p, t, f.seed + i, 12, 46, 0xd8f2ff); wave(g, p, t, 34, 0x8fd0ff, 2); }) },
  manaburn: { dur: 620, color: 0x4a8aff, paint: each((g, p, t, f, i) => { flames(g, p, t, f.seed + i, 8, 22, 36, [0xbfe0ff, 0x4a8aff, 0x2040c0]); rising(g, p, t, f.seed + i * 3, 8, 0x80c0ff, 60, 2, 30); }) },
  meteor: { dur: 760, color: 0xff7a2a, paint: (g, f, t) => {
    const p = first(f), k = Math.min(1, t / 0.5);
    const sx = p.x + 160, sy = p.y - 260;
    if (k < 1) {
      const x = sx + (p.x - sx) * k, y = sy + (p.y - sy) * k;
      for (let i = 0; i < 6; i++) g.circle(x + (160 / 260) * i * 9, y - i * 9, 9 - i).fill({ color: i < 2 ? 0xffd24a : 0xff6a1a, alpha: 0.9 - i * 0.12 });
      g.circle(x, y, 7).fill({ color: 0x3a2018 });
    } else {
      const q = (t - 0.5) / 0.5;
      g.circle(p.x, p.y, 70 * ease(q)).fill({ color: 0xff8a2a, alpha: 0.35 * (1 - q) });
      wave(g, p, q, 80, 0xffd24a, 5);
      shards(g, p, q, f.seed, 10, 70, 0xff6a1a);
    }
  } },
  starfall: { dur: 820, color: 0xfff0a0, paint: (g, f, t, now) => {
    const p = first(f), k = Math.min(1, t / 0.5);
    if (k < 1) {
      const y = p.y - 300 * (1 - k);
      g.moveTo(p.x, y - 80).lineTo(p.x, y).stroke({ width: 3, color: 0xfff0a0, alpha: 0.8 });
      for (let i = 0; i < 4; i++) { const ang = i * Math.PI / 2 + now / 120; g.moveTo(p.x, y).lineTo(p.x + Math.cos(ang) * 10, y + Math.sin(ang) * 10).stroke({ width: 2, color: 0xffffff }); }
    } else {
      const q = (t - 0.5) / 0.5;
      g.circle(p.x, p.y, 60 * ease(q)).fill({ color: 0xfff0a0, alpha: 0.4 * (1 - q) });
      wave(g, p, q, 140, 0xffe080, 3);
      for (let i = 0; i < 10; i++) { const ang = (i / 10) * Math.PI * 2; g.moveTo(p.x, p.y).lineTo(p.x + Math.cos(ang) * 60 * ease(q), p.y + Math.sin(ang) * 36 * ease(q)).stroke({ width: 2, color: 0xffffff, alpha: 1 - q }); }
    }
  } },
  frostbite: { dur: 560, color: 0x8fd0ff, paint: each((g, p, t, f, i) => { shards(g, p, t, f.seed + i, 8, 22, 0xbfe6ff, true); g.circle(p.x, p.y - 12, 14 * ease(t)).stroke({ width: 2, color: 0x8fd0ff, alpha: 1 - t }); }) },
  chainlight: { dur: 480, color: 0xfff27a, paint: (g, f, t, now) => {
    let prev: Pt = { x: f.x, y: f.y - 14 };
    targets(f).forEach((p, i) => {
      const q = { x: p.x, y: p.y - 12 };
      const a = fade(t, 0.05, 0.5);
      jag(g, prev, q, f.seed + i * 13, now, 0x6ac8ff, 5, a * 0.5);
      jag(g, prev, q, f.seed + i * 13, now, 0xfffbd0, 2, a);
      g.circle(q.x, q.y, 6 + 6 * Math.sin(now / 30)).fill({ color: 0xffffff, alpha: a * 0.5 });
      prev = q;
    });
  } },
  steam: { dur: 700, color: 0xe8e8e8, paint: each((g, p, t, f, i) => puffs(g, p, t, f.seed + i, 9, 0xf0f0f0, 7, 30, 44)) },
  // --- blood
  lance: { dur: 520, color: 0xd01020, paint: each((g, p, t, f) => {
    projectile(g, f, p, t, 0xc01020, 0.35, 5, 0, 0xff6070);
    if (t > 0.55) { const q = (t - 0.55) / 0.45; shards(g, p, q, f.seed, 8, 26, 0xd01020); }
  }) },
  siphon: { dur: 700, color: 0xd01020, paint: each((g, p, t, f, i) => {
    for (let j = 0; j < 7; j++) {
      const k = Math.max(0, Math.min(1, t * 1.6 - j * 0.09));
      if (k <= 0 || k >= 1) continue;
      const q = along({ x: p.x, y: p.y - 12 }, { x: f.x, y: f.y - 14 }, ease(k), 26 + h(f.seed + i + j) * 20);
      g.circle(q.x, q.y, 4).fill({ color: j % 2 ? 0xff4050 : 0xa00010 });
    }
  }) },
  crimson: { dur: 640, color: 0xd01020, paint: (g, f, t) => {
    const p = first(f);
    wave(g, p, t, 96, 0xc01020, 7);
    wave(g, p, Math.max(0, t - 0.12), 80, 0xff5060, 2);
    falling(g, p, t, f.seed, 10, 0xa00010, 40, 3, 120);
  } },
  // --- force
  repel: { dur: 480, color: 0xe8f0ff, paint: each((g, p, t, f, i) => { wind(g, f, p, t, f.seed + i, 0xe8f0ff, true); crescent(g, p, t, 18, 0xcfe0ff, 2, Math.atan2(p.y - f.y, p.x - f.x) - 0.65 - t * 2.8); }) },
  beckon: { dur: 520, color: 0xb48cff, paint: each((g, p, t, f) => { chainLink(g, { x: f.x, y: f.y - 14 }, { x: p.x, y: p.y - 12 }, t, 0xb0b0c0); wind(g, f, p, t, f.seed, 0xb48cff, false); }) },
  rime: { dur: 620, color: 0x9fdcff, paint: each((g, p, t, f, i) => {
    const k = ease(Math.min(1, t * 1.8));
    for (let j = 0; j < 6; j++) {
      const ang = -Math.PI / 2 + (j - 2.5) * 0.45;
      const L = (12 + h(f.seed + i + j) * 12) * k;
      const bx = p.x + (j - 2.5) * 5, by = p.y + 4;
      g.poly([bx - 3, by, bx + Math.cos(ang) * L, by + Math.sin(ang) * L, bx + 3, by]).fill({ color: j % 2 ? 0xd8f2ff : 0x8fd0ff, alpha: fade(t, 0.05, 0.3) });
    }
  }) },
  fetter: { dur: 560, color: 0xa0a0b0, paint: each((g, p, t) => { for (let j = 0; j < 3; j++) { const r = 18 - ease(t) * 6 + j * 3; g.ellipse(p.x, p.y + 2 - j * 4, r, r * 0.4).stroke({ width: 2, color: j % 2 ? 0x707080 : 0xb0b0c0, alpha: fade(t) }); } }) },
  maelstrom: { dur: 700, color: 0x7ab0ff, paint: (g, f, t) => { const p = first(f); vortex(g, p, t, 150, 0x7ab0ff); shards(g, p, t, f.seed, 10, 150, 0xa0c8ff, true); } },
  magnet: { dur: 700, color: 0xd05050, paint: (g, f, t) => {
    const p = first(f); vortex(g, p, t, 150, 0xa04040);
    for (let i = 0; i < 12; i++) { const ang = (i / 12) * Math.PI * 2, d = 150 * (1 - ease(t)); g.moveTo(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d * 0.6).lineTo(p.x + Math.cos(ang) * (d - 12), p.y + Math.sin(ang) * (d - 12) * 0.6).stroke({ width: 2, color: i % 2 ? 0xd05050 : 0x5070d0, alpha: fade(t) }); }
  } },
  blink: { dur: 520, color: 0xb48cff, paint: (g, f, t) => { swirl(g, { x: f.x, y: f.y }, Math.min(1, t * 1.4), 0xb48cff, f.seed); swirl(g, first(f), Math.max(0, t * 1.4 - 0.4), 0xb48cff, f.seed + 1); } },
  transpose: { dur: 560, color: 0xb48cff, paint: (g, f, t) => { const p = first(f); swirl(g, { x: f.x, y: f.y }, t, 0xb48cff, f.seed); swirl(g, p, t, 0xb48cff, f.seed + 1); g.moveTo(f.x, f.y - 12).lineTo(p.x, p.y - 12).stroke({ width: 1, color: 0xb48cff, alpha: (1 - t) * 0.6 }); } },
  swap: { dur: 560, color: 0xb48cff, paint: (g, f, t) => { const p = first(f); swirl(g, { x: f.x, y: f.y }, t, 0xd0b0ff, f.seed); swirl(g, p, t, 0xd0b0ff, f.seed + 1); } },
  dash: { dur: 420, color: 0xffd24a, paint: (g, f, t) => { const p = first(f); for (let i = 0; i < 6; i++) { const off = (i - 2.5) * 5, k = ease(t); const a = { x: f.x, y: f.y - 12 + off }; g.moveTo(a.x, a.y).lineTo(a.x + (p.x - f.x) * k, a.y + (p.y - f.y) * k).stroke({ width: 1.5, color: 0xffe8a0, alpha: (1 - t) * 0.6 }); } } },
  stomp: { dur: 560, color: 0xb08050, paint: (g, f, t) => { const p = { x: f.x, y: f.y }; wave(g, p, t, 115, 0xb08050, 6); wave(g, p, Math.max(0, t - 0.1), 95, 0xe0c090, 2); puffs(g, p, t, f.seed, 10, 0x8a6a4a, 9, 120, 10); } },
  quake: { dur: 720, color: 0xb08050, paint: (g, f, t) => {
    const p = first(f);
    for (let i = 0; i < 7; i++) { const ang = (i / 7) * Math.PI * 2 + h(f.seed + i); let x = p.x, y = p.y; g.moveTo(x, y); for (let s = 1; s <= 4; s++) { x = p.x + Math.cos(ang + (h(f.seed + i * s) - 0.5) * 0.6) * 30 * s * ease(Math.min(1, t * 1.5)); y = p.y + Math.sin(ang) * 16 * s * ease(Math.min(1, t * 1.5)); g.lineTo(x, y); } g.stroke({ width: 2, color: 0x1a0f08, alpha: 1 - t }); }
    wave(g, p, t, 124, 0xb08050, 4); puffs(g, p, t, f.seed, 12, 0x8a6a4a, 10, 200, 14);
  } },
  flashfreeze: { dur: 640, color: 0xbfe6ff, paint: (g, f, t) => { const p = first(f); g.circle(p.x, p.y, 92 * ease(t)).fill({ color: 0xbfe6ff, alpha: 0.25 * (1 - t) }); wave(g, p, t, 92, 0xffffff, 3); shards(g, p, t, f.seed, 14, 90, 0xd8f2ff); } },
  // --- curse
  plague: { dur: 720, color: 0x7acc3a, paint: each((g, p, t, f, i) => { puffs(g, p, t, f.seed + i, 8, 0x6aaa2a, 8, 34, 24); rising(g, p, t, f.seed + i * 7, 6, 0xb0ff60, 30, 3, 26); }) },
  frail: { dur: 620, color: 0xa060c0, paint: each((g, p, t, f, i) => {
    const k = ease(Math.min(1, t * 2));
    for (let j = 0; j < 4; j++) { const ang = (j / 4) * Math.PI * 2 + h(f.seed + i + j); g.moveTo(p.x, p.y - 14).lineTo(p.x + Math.cos(ang) * 12 * k, p.y - 14 + Math.sin(ang) * 12 * k).lineTo(p.x + Math.cos(ang + 0.5) * 24 * k, p.y - 14 + Math.sin(ang + 0.5) * 24 * k).stroke({ width: 3, color: 0xc080e0, alpha: fade(t) }); }
    g.circle(p.x, p.y - 14, 20 * ease(t)).stroke({ width: 2, color: 0x6a2a8a, alpha: 1 - t });
  }) },
  bloat: { dur: 700, color: 0x9acc3a, paint: each((g, p, t) => { const s = 1 + 0.25 * Math.sin(t * Math.PI * 3); g.circle(p.x, p.y - 12, 16 * s * ease(Math.min(1, t * 2))).fill({ color: 0x8aaa3a, alpha: 0.3 * fade(t) }).stroke({ width: 2, color: 0xc0e060, alpha: fade(t) }); }) },
  contagion: { dur: 720, color: 0x7acc3a, paint: each((g, p, t, f, i) => {
    for (let j = 0; j < 8; j++) { const ang = (j / 8) * Math.PI * 2 + h(f.seed + i + j) * 0.4; const L = 130 * ease(t); g.moveTo(p.x, p.y - 8); g.quadraticCurveTo(p.x + Math.cos(ang + 0.5) * L * 0.5, p.y + Math.sin(ang + 0.5) * L * 0.3, p.x + Math.cos(ang) * L, p.y + Math.sin(ang) * L * 0.6).stroke({ width: 2, color: 0x7acc3a, alpha: fade(t) * 0.8 }); }
  }) },
  burn: { dur: 720, color: 0xff8a2a, paint: each((g, p, t, f, i) => flames(g, p, t, f.seed + i, 10, 24, 40)) },
  cinders: { dur: 760, color: 0xff6a1a, paint: each((g, p, t, f, i) => { flames(g, p, t, f.seed + i, 5, 20, 22, [0xff8a2a, 0xc03a10]); rising(g, p, t, f.seed + i * 5, 10, 0xffb040, 50, 2, 34); }) },
  enfeeble: { dur: 620, color: 0x909090, paint: each((g, p, t, f) => arrows(g, p, t, f.seed, false, 0x9a8a9a)) },
  decay: { dur: 720, color: 0x7a6a3a, paint: each((g, p, t, f, i) => { falling(g, p, t, f.seed + i, 10, 0x6a5a2a, 34, 3, 26); puffs(g, { x: p.x, y: p.y + 6 }, t, f.seed + i * 3, 4, 0x4a4a2a, 7, 26, 6); }) },
  // --- blessing
  mend: { dur: 760, color: 0x8cff9a, paint: each((g, p, t, f, i) => {
    for (let j = 0; j < 8; j++) { const k = (t + h(f.seed + i + j) * 0.6) % 1; plus(g, p.x + (h(f.seed + j * 3) - 0.5) * 32, p.y - 6 - k * 48, 4, j % 2 ? 0x8cff9a : 0xffe680, fade(t) * (1 - k * 0.4)); }
    g.ellipse(p.x, p.y + 2, 18, 7).fill({ color: 0x8cff9a, alpha: 0.2 * fade(t) });
  }) },
  ward: { dur: 680, color: 0x6fd0ff, paint: each((g, p, t) => bubble(g, p, t, 0x6fd0ff)) },
  mirrorward: { dur: 680, color: 0x9fe0ff, paint: (g, f, t) => { targets(f).forEach((p) => bubble(g, p, t, 0x9fe0ff)); bubble(g, { x: f.x, y: f.y }, Math.max(0, t - 0.15), 0x9fe0ff); } },
  cleanse: { dur: 700, color: 0xe0f8ff, paint: each((g, p, t, f, i) => { falling(g, p, t, f.seed + i, 12, 0xc0f0ff, 48, 2, 26); rising(g, p, t, f.seed + i * 5, 5, 0xffffff, 40, 2, 20); }) },
  fortify: { dur: 640, color: 0xd0c090, paint: each((g, p, t) => {
    const k = ease(Math.min(1, t * 2)), a = fade(t, 0.05, 0.4);
    const x = p.x, y = p.y - 14, w = 13 * k, hh = 16 * k;
    g.poly([x - w, y - hh, x + w, y - hh, x + w, y + hh * 0.2, x, y + hh, x - w, y + hh * 0.2]).fill({ color: 0x6a6a7a, alpha: 0.35 * a }).stroke({ width: 2, color: 0xd0c090, alpha: a });
  }) },
  vigil: { dur: 640, color: 0xffe8a0, paint: each((g, p, t) => {
    const k = ease(Math.min(1, t * 2)), a = fade(t, 0.05, 0.4);
    g.rect(p.x - 1.5, p.y - 40 * k, 3, 40 * k).fill({ color: 0xffe8a0, alpha: a });
    g.ellipse(p.x, p.y - 38 * k, 10, 4).stroke({ width: 2, color: 0xffe8a0, alpha: a });
  }) },
  empower: { dur: 640, color: 0xff6a3a, paint: each((g, p, t, f, i) => { arrows(g, p, t, f.seed + i, true, 0xff7a3a); flames(g, p, t, f.seed + i, 4, 26, 18, [0xff6a3a, 0xa02010]); }) },
  flare: { dur: 520, color: 0xfff2c0, paint: (g, f, t) => {
    const p = first(f);
    g.circle(p.x, p.y - 10, 92 * ease(t)).fill({ color: 0xfff6d8, alpha: 0.45 * (1 - t) });
    for (let i = 0; i < 12; i++) { const ang = (i / 12) * Math.PI * 2; g.moveTo(p.x, p.y - 10).lineTo(p.x + Math.cos(ang) * 100 * ease(t), p.y - 10 + Math.sin(ang) * 100 * ease(t)).stroke({ width: 2, color: 0xffffff, alpha: 1 - t }); }
  } },
  haste: { dur: 560, color: 0xffe060, paint: each((g, p, t, f, i) => {
    for (let j = 0; j < 5; j++) { const k = (t * 2 + j / 5) % 1; const y = p.y - 4 - j * 7; g.moveTo(p.x - 20 + k * 6, y).lineTo(p.x - 6 + k * 6, y).stroke({ width: 2, color: 0xffe060, alpha: fade(t) * (1 - k) }); }
    rising(g, p, t, f.seed + i, 5, 0xfff0a0, 40, 2, 24);
  }) },
  // --- grave and summon
  raise: { dur: 820, color: 0x8affb0, paint: each((g, p, t, f, i) => { sigil(g, p, t, 20, 0x6aff9a); rising(g, p, t, f.seed + i, 10, 0xc0ffd0, 56, 3, 22); g.rect(p.x - 6, p.y - 60 * ease(t), 12, 60 * ease(t)).fill({ color: 0x6aff9a, alpha: 0.18 * fade(t) }); }) },
  mirror: { dur: 640, color: 0xd0c0ff, paint: each((g, p, t) => { const k = ease(t); g.ellipse(p.x, p.y - 12, 12, 18).stroke({ width: 2, color: 0xd0c0ff, alpha: 1 - t }); g.ellipse(p.x + 24 * k, p.y - 12, 12, 18).stroke({ width: 2, color: 0xffffff, alpha: (1 - t) * 0.8 }); }) },
  effigy: { dur: 720, color: 0xd8b060, paint: (g, f, t) => { const p = first(f); for (let i = 0; i < 9; i++) { const k = ease(t), ang = i * 0.7 + t * 6; g.moveTo(p.x + Math.cos(ang) * 14, p.y).lineTo(p.x + Math.cos(ang) * 6, p.y - 40 * k).stroke({ width: 2, color: i % 2 ? 0xd8b060 : 0xa07a30, alpha: fade(t) }); } } },
  boneburst: { dur: 600, color: 0xf0e8d0, paint: each((g, p, t, f, i) => { shards(g, p, t, f.seed + i, 14, 110, 0xf0e8d0); wave(g, p, t, 110, 0xd8d0b8, 2); }) },
  bonespear: { dur: 560, color: 0xf0e8d0, paint: each((g, p, t, f) => { projectile(g, f, p, t, 0xe8dfc8, 0.3, 4, 18, 0xffffff); if (t > 0.55) shards(g, p, (t - 0.55) / 0.45, f.seed, 6, 20, 0xf0e8d0); }) },
  gravepact: { dur: 760, color: 0x8affb0, paint: each((g, p, t, f, i) => {
    for (let j = 0; j < 5; j++) { const k = Math.max(0, Math.min(1, t * 1.5 - j * 0.1)); if (k <= 0 || k >= 1) continue; const q = along({ x: p.x, y: p.y - 8 }, { x: f.x, y: f.y - 16 }, ease(k), 40 + h(f.seed + i + j) * 30); g.circle(q.x, q.y, 4 - j * 0.5).fill({ color: 0xb0ffd0, alpha: 0.9 }); }
  }) },
  polymorph: { dur: 680, color: 0xff80e0, paint: each((g, p, t, f, i) => { puffs(g, p, t, f.seed + i, 10, [0xff80e0, 0x80c0ff, 0xffe080][i % 3], 9, 30, 20); swirl(g, p, t, 0xff80e0, f.seed); }) },
  merge: { dur: 720, color: 0xc04060, paint: (g, f, t) => {
    const p = first(f);
    f.pts.slice(1).forEach((q, i) => { const k = ease(t); for (let j = 0; j < 4; j++) { const r = along(q, p, Math.min(1, k + j * 0.05), 10); g.circle(r.x, r.y - 10, 4).fill({ color: 0xc04060, alpha: fade(t) }); } void i; });
    g.circle(p.x, p.y - 12, 22 * ease(t)).stroke({ width: 3, color: 0xc04060, alpha: 1 - t });
  } },
  sum_ghoul: { dur: 820, color: 0x8affb0, paint: (g, f, t) => { const p = first(f); sigil(g, p, t, 26, 0x6aff9a, 5); rising(g, p, t, f.seed, 12, 0x6aff9a, 50, 3, 30); } },
  sum_xbow: { dur: 820, color: 0xc0c8ff, paint: (g, f, t) => { const p = first(f); sigil(g, p, t, 26, 0xa0b0ff, 6); rising(g, p, t, f.seed, 12, 0xc0c8ff, 50, 3, 30); } },
  sum_priest: { dur: 820, color: 0xffe8a0, paint: (g, f, t) => { const p = first(f); sigil(g, p, t, 26, 0xffe8a0, 7); rising(g, p, t, f.seed, 12, 0xfff4c0, 50, 3, 30); } },
  unleash: { dur: 820, color: 0xff9a5a, paint: (g, f, t) => { const p = first(f); sigil(g, p, t, 26, 0xff9a5a, 4); chainLink(g, { x: p.x - 30, y: p.y - 4 }, { x: p.x + 30, y: p.y - 4 }, 1 - t, 0xb0b0c0); rising(g, p, t, f.seed, 10, 0xffc08a, 50, 3, 30); } },
  // --- terrain
  mire: { dur: 820, color: 0x6a7a2a, paint: (g, f, t) => { const p = first(f); g.ellipse(p.x, p.y, 62 * ease(t), 34 * ease(t)).fill({ color: 0x3a4a1a, alpha: 0.35 * fade(t) }); for (let i = 0; i < 8; i++) { const k = (t * 1.5 + h(f.seed + i)) % 1; g.circle(p.x + (h(f.seed + i * 3) - 0.5) * 100, p.y + (h(f.seed + i * 5) - 0.5) * 50, 2 + k * 5).stroke({ width: 1.5, color: 0x9aaa4a, alpha: (1 - k) * fade(t) }); } } },
  lavaflow: { dur: 820, color: 0xff5a1a, paint: (g, f, t) => { const p = first(f); g.ellipse(p.x, p.y, 44 * ease(t), 26 * ease(t)).fill({ color: 0xff5a1a, alpha: 0.4 * fade(t) }); flames(g, p, t, f.seed, 10, 70, 28); } },
  flood: { dur: 760, color: 0x4a9aff, paint: (g, f, t) => { const p = first(f); wave(g, p, t, 74, 0x4a9aff, 5); wave(g, p, Math.max(0, t - 0.15), 56, 0xa0d0ff, 2); for (let i = 0; i < 12; i++) { const ang = (i / 12) * Math.PI * 2, k = ease(t); g.circle(p.x + Math.cos(ang) * 40 * k, p.y + Math.sin(ang) * 24 * k - Math.sin(Math.PI * t) * 30, 3).fill({ color: 0x8ac8ff, alpha: 1 - t }); } } },
  icesheet: { dur: 760, color: 0xbfe6ff, paint: (g, f, t) => {
    const p = first(f), k = ease(Math.min(1, t * 1.6));
    g.ellipse(p.x, p.y, 82 * k, 46 * k).fill({ color: 0xbfe6ff, alpha: 0.25 * fade(t) });
    for (let i = 0; i < 10; i++) { const ang = (i / 10) * Math.PI * 2; g.moveTo(p.x, p.y).lineTo(p.x + Math.cos(ang) * 80 * k, p.y + Math.sin(ang) * 44 * k).stroke({ width: 1.5, color: 0xffffff, alpha: fade(t) * 0.8 }); }
  } },
  raisewall: { dur: 640, color: 0x8a8a9a, paint: (g, f, t) => { const p = first(f), k = ease(Math.min(1, t * 2)); g.rect(p.x - 14, p.y - 34 * k, 28, 34 * k).fill({ color: 0x6a6a7a, alpha: fade(t, 0.05, 0.3) }).stroke({ width: 2, color: 0xb0b0c0, alpha: fade(t, 0.05, 0.3) }); puffs(g, p, t, f.seed, 8, 0x8a7a6a, 8, 50, 10); } },
  // --- arcane
  echo: { dur: 520, color: 0xc0a0ff, paint: (g, f, t) => { const p = { x: f.x, y: f.y }; wave(g, p, t, 40, 0xc0a0ff, 2); wave(g, p, Math.max(0, t - 0.25) / 0.75, 40, 0xc0a0ff, 2); } },
  overcharge: { dur: 520, color: 0xd080ff, paint: (g, f, t, now) => { for (let i = 0; i < 4; i++) { const ang = (i / 4) * Math.PI * 2 + now / 100; jag(g, { x: f.x, y: f.y - 14 }, { x: f.x + Math.cos(ang) * 26, y: f.y - 14 + Math.sin(ang) * 26 }, f.seed + i, now, 0xd080ff, 2, 1 - t); } } },
};

/** The look for a card, or null for targeting cards (their shapes already show). */
export function spellLook(card: string) { return LOOKS[card] ?? null; }

export function paintSpell(g: Graphics, f: SpellFx, now: number) {
  const look = LOOKS[f.card];
  if (!look) return;
  const t = Math.max(0, Math.min(1, (now - f.t0) / f.dur));
  look.paint(g, f, t, now);
}

/** Every card that has its own look (used by tests to make sure none is forgotten). */
export const SPELL_LOOK_IDS = Object.keys(LOOKS);

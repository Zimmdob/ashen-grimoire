// Every creature in Ashen Grimoire, painted with the shading painter (see paint.ts).
// Authored in a 32x32 space facing right, feet on y=30. Frame f (0/1) is a two-step animation.
import { C, Painter, ramp as R, type RGB } from './paint';

type Paint = (p: Painter, f: number) => void;
const sw = (f: number) => (f ? 1 : -1);
const W = C('#fff6e0');

// ---------------------------------------------------------------- building blocks

interface RobeOpts {
  robe: string; trim?: string; skin?: string; hem?: number; wide?: number;
  head: 'hood' | 'hat' | 'mitre' | 'crown' | 'skull' | 'cap' | 'veil' | 'shroom' | 'horns' | 'halo';
  hood?: string; face?: string; eyes: string; eyeS?: number;
  staff?: { wood: string; top: 'orb' | 'skull' | 'crook' | 'censer' | 'lantern' | 'thorn' | 'dagger' | 'star' | 'trident' | 'book' | 'none'; glow: string };
  extra?: (p: Painter, f: number) => void; under?: (p: Painter, f: number) => void;
}
function robed(p: Painter, f: number, o: RobeOpts) {
  const robe = R(o.robe), hood = R(o.hood ?? o.robe), skin = R(o.skin ?? '#b08c6c');
  const wd = o.wide ?? 0, bob = f ? 0.5 : 0;
  o.under?.(p, f);
  // staff behind the near arm
  if (o.staff) {
    const sx = 24;
    p.line(sx, 5 + bob, sx - 1, 30, R(o.staff.wood)[1], 1.4);
    p.line(sx - 0.5, 5 + bob, sx - 1, 29, R(o.staff.wood)[3], 0.5);
    const g = o.staff.glow, gy = 4 + bob;
    switch (o.staff.top) {
      case 'orb': p.blob(sx, gy, 2.6, 2.6, R(g)); p.dot(sx - 1, gy - 1, W, 1, true); break;
      case 'skull': p.blob(sx, gy, 2.6, 2.4, R('#e9dcc0')); p.eye(sx - 1, gy, g); p.eye(sx + 1, gy, g); p.line(sx - 1, gy + 2, sx + 1, gy + 2, R('#e9dcc0')[0], 0.6); break;
      case 'crook': p.line(sx, gy + 1, sx, gy - 2, R(o.staff.wood)[2], 1.2); p.line(sx, gy - 2, sx + 3, gy - 2, R(o.staff.wood)[2], 1.2); p.line(sx + 3, gy - 2, sx + 3, gy + 1, R(o.staff.wood)[2], 1.2); p.dot(sx + 3, gy + 2, R(g)[4], 1.2, true); break;
      case 'censer': p.line(sx, gy, sx + 2, gy + 7, R('#6d6a70')[2], 0.5); p.blob(sx + 2, gy + 9, 2.2, 2, R('#6d6a70')); p.dot(sx + 1.5, gy + 10.5, R(g)[4], 1, true); for (let i = 0; i < 3; i++) p.dot(sx + 3 + i, gy + 6 - i * 2 - f, R(g)[3], 1, true); break;
      case 'lantern': p.line(sx, gy, sx + 2, gy + 2, R('#4a4a52')[2], 0.6); p.poly([sx + 0.5, gy + 2, sx + 4, gy + 2, sx + 4, gy + 7, sx + 0.5, gy + 7], R('#3a3a44')); p.blob(sx + 2.2, gy + 4.6, 1.3, 1.8, R(g), { edge: false, lift: 0.3 }); break;
      case 'thorn': for (let i = 0; i < 4; i++) p.line(sx, gy + i * 2, sx + (i % 2 ? 2 : -2), gy + i * 2 - 1, R('#3a5a1a')[2], 0.7); p.blob(sx, gy - 1, 2, 2, R(g)); break;
      case 'dagger': break;
      case 'star': p.poly([sx, gy - 4, sx + 1, gy - 1, sx + 4, gy, sx + 1, gy + 1, sx, gy + 4, sx - 1, gy + 1, sx - 4, gy, sx - 1, gy - 1], R(g), { lift: 0.25 }); p.dot(sx, gy, W, 1, true); break;
      case 'trident': p.line(sx - 2, gy - 3, sx - 2, gy + 1, R(g)[3], 0.8); p.line(sx + 2, gy - 3, sx + 2, gy + 1, R(g)[3], 0.8); p.line(sx, gy - 4, sx, gy + 1, R(g)[3], 0.8); p.line(sx - 2, gy + 1, sx + 2, gy + 1, R(g)[2], 0.8); break;
      case 'book': p.poly([sx - 3, gy - 1, sx + 3, gy - 1, sx + 3, gy + 4, sx - 3, gy + 4], R(g)); p.line(sx, gy - 1, sx, gy + 4, R(g)[0], 0.5); break;
      case 'none': break;
    }
  }
  // far sleeve
  p.cap(12, 14 + bob, 10, 21, 2, 1.8, robe, { lift: -0.2 });
  // robe body with a ragged hem
  const hem = o.hem ?? 30, flare = 7 + wd;
  const pts = [11.5, 12 + bob, 19, 12 + bob, 16 + flare, hem - 1, 16 + flare - 2, hem, 16 + flare - 4, hem - 1, 16 + flare - 6, hem, 16, hem - 1 + (f ? 1 : 0), 16 - flare + 4, hem, 16 - flare + 2, hem - 1, 16 - flare, hem];
  p.poly(pts, robe);
  // folds
  p.line(14, 17 + bob, 12, hem - 1, robe[1], 0.6);
  p.line(17.5, 17 + bob, 19, hem - 1, robe[1], 0.6);
  p.line(16, 15 + bob, 16, hem - 2, robe[3], 0.4);
  if (o.trim) { const t = R(o.trim); p.line(11, 20 + bob, 20, 20 + bob, t[2], 1); p.line(16 - flare + 1, hem - 1, 16 + flare - 1, hem - 1, t[3], 0.7); }
  // head
  const hy = 8.5 + bob;
  switch (o.head) {
    case 'hood': case 'veil':
      p.blob(16, hy, 5, 5.2, hood);
      p.blob(17.8, hy + 1, 3, 3.4, R(o.face ?? '#120a12'), { shade: 0.12, edge: false });
      if (o.head === 'veil') p.poly([14.5, hy + 1, 21, hy + 1, 20, hy + 6, 15, hy + 6], hood, { lift: 0.1 });
      break;
    case 'hat':
      p.blob(17, hy + 1, 3.5, 3.4, skin);
      p.poly([9, hy - 1, 25, hy - 1, 23, hy, 11, hy], hood);
      p.poly([12, hy - 1, 21, hy - 1, 19, hy - 6, 17, hy - 9, 14, hy - 11 + f, 15, hy - 6], hood);
      break;
    case 'mitre':
      p.blob(17, hy + 1, 3.4, 3.4, skin);
      p.poly([13, hy - 1, 21, hy - 1, 20, hy - 8, 17, hy - 10, 14, hy - 8], hood);
      p.line(17, hy - 9, 17, hy - 1, R(o.trim ?? '#e0b040')[3], 0.8);
      break;
    case 'crown': case 'skull':
      p.blob(17, hy + 0.5, 3.8, 3.8, R(o.skin ?? '#e9dcc0'));
      p.blob(18, hy + 3.5, 2.4, 1.4, R(o.skin ?? '#e9dcc0'), { lift: -0.15 });
      for (let i = 0; i < 3; i++) p.dot(16.8 + i * 1.1, hy + 4.2, R('#1a0a0a')[1], 0.5);
      if (o.head === 'crown') p.poly([12.8, hy - 2, 21.5, hy - 2, 21.5, hy - 6, 20, hy - 3.5, 18.5, hy - 7, 17, hy - 3.5, 15.5, hy - 7, 14, hy - 3.5, 12.8, hy - 6], R(o.trim ?? '#e0b040'), { lift: 0.15 });
      break;
    case 'cap':
      p.blob(17, hy + 1, 3.5, 3.5, skin);
      p.blob(16.5, hy - 1.2, 4.2, 2.6, hood);
      break;
    case 'shroom':
      p.blob(17, hy + 1.5, 3.2, 3.2, skin);
      p.blob(16, hy - 2, 7.5, 3.6, hood, { lift: 0.05 });
      for (const [x, y] of [[12, -3], [16, -4], [20, -2.5], [14, -1]]) p.dot(x, hy + y, W, 1);
      break;
    case 'horns':
      p.blob(16, hy, 5, 5.2, hood);
      p.blob(17.8, hy + 1, 3, 3.4, R(o.face ?? '#120a12'), { shade: 0.12, edge: false });
      p.cap(13, hy - 3, 9, hy - 8, 1.3, 0.5, R('#d8ccb0'));
      p.cap(19, hy - 3, 23, hy - 8, 1.3, 0.5, R('#d8ccb0'));
      break;
    case 'halo':
      p.line(10, hy - 5, 23, hy - 5, R(o.staff?.glow ?? '#ffd06a')[4], 0.8, true);
      p.blob(16, hy, 5, 5.2, hood);
      p.blob(17.8, hy + 1, 3, 3.4, R(o.face ?? '#120a12'), { shade: 0.12, edge: false });
      break;
  }
  const es = o.eyeS ?? 1;
  if (o.head === 'crown' || o.head === 'skull') { p.eye(15.8, hy + 0.5, o.eyes, 1.4); p.eye(18.6, hy + 0.5, o.eyes, 1.4); }
  else if (o.head === 'hat' || o.head === 'mitre' || o.head === 'cap' || o.head === 'shroom') { p.eye(18.5, hy + 0.8, o.eyes, es); p.dot(20.4, hy + 2, skin[1], 1); }
  else { p.eye(17.2, hy + 1.2, o.eyes, es); p.eye(19.4, hy + 1.2, o.eyes, es); }
  // near sleeve reaching to the staff
  p.cap(17, 14 + bob, 21.5, 18, 2.1, 1.7, robe);
  p.blob(23, 18, 1.5, 1.4, skin);
  if (o.staff?.top === 'dagger') { p.line(23, 18, 27, 14, R('#c8c8d0')[3], 0.8); p.line(22, 19, 23.5, 17.5, R('#5a3a20')[2], 1); }
  o.extra?.(p, f);
}

interface BeastOpts {
  fur: string; belly?: string; eye: string; len?: number; h?: number; leg?: number; bulk?: number;
  head: 'wolf' | 'boar' | 'deer' | 'skull' | 'bear'; horns?: 'antlers' | 'tusks' | 'none'; hornCol?: string;
  tail: 'bushy' | 'thin' | 'stub' | 'bone'; bones?: boolean; mane?: string; extra?: (p: Painter, f: number) => void;
}
function beast(p: Painter, f: number, o: BeastOpts) {
  const fur = R(o.fur), belly = R(o.belly ?? o.fur), len = o.len ?? 8, legL = o.leg ?? 6, bulk = o.bulk ?? 4.2;
  const by = 30 - legL - bulk * 0.6, bx = 14;
  const s = sw(f);
  const bone = R('#e2d8c0');
  const legCol = o.bones ? bone : fur;
  // far legs
  p.cap(bx - len * 0.55, by + 1, bx - len * 0.55 - s * 1.5, 30, 1.4, 1, legCol, { lift: -0.25 });
  p.cap(bx + len * 0.5, by + 1, bx + len * 0.5 + s * 1.5, 30, 1.4, 1, legCol, { lift: -0.25 });
  // tail
  const tx = bx - len - 1;
  if (o.tail === 'bushy') p.cap(tx + 2, by - 1, tx - 3, by + 4 - f, 2.2, 1.6, fur, { lift: -0.05 });
  else if (o.tail === 'thin') p.line(tx + 2, by, tx - 2, by - 3 + f, fur[1], 0.8);
  else if (o.tail === 'stub') p.blob(tx + 1.5, by - 0.5, 1.3, 1.1, fur);
  else for (let i = 0; i < 4; i++) p.blob(tx + 1 - i * 1.6, by - 1 + i * 0.6 + (i > 1 ? f * 0.5 : 0), 0.9, 0.8, bone);
  // body
  if (o.bones) {
    p.cap(bx - len, by, bx + len * 0.7, by - 0.5, 1.3, 1.3, bone);
    for (let i = 0; i < 5; i++) { const x = bx - len * 0.5 + i * 1.8; p.line(x, by, x + 0.5, by + bulk * 0.9, bone[2 + (i % 2)], 0.7); }
    p.blob(bx - len + 1, by + 0.5, 2.5, 2, bone);
  } else {
    p.cap(bx - len * 0.6, by, bx + len * 0.55, by - 0.3, bulk, bulk * 0.95, fur);
    p.cap(bx - len * 0.3, by + bulk * 0.45, bx + len * 0.4, by + bulk * 0.45, bulk * 0.45, bulk * 0.45, belly, { lift: -0.1 });
    for (let i = 0; i < 4; i++) p.line(bx - len * 0.4 + i * 2.6, by - bulk * 0.6, bx - len * 0.4 + i * 2.6 - 1, by - bulk * 0.1, fur[3], 0.4);
  }
  if (o.mane) p.blob(bx + len * 0.55, by - 1, bulk * 0.8, bulk * 1.05, R(o.mane), { lift: 0.05 });
  // near legs
  p.cap(bx - len * 0.45, by + 1.5, bx - len * 0.45 + s * 1.5, 30, 1.6, 1.1, legCol);
  p.cap(bx + len * 0.6, by + 1.5, bx + len * 0.6 - s * 1.5, 30, 1.6, 1.1, legCol);
  for (const x of [bx - len * 0.45 + s * 1.5, bx + len * 0.6 - s * 1.5]) p.dot(x - 0.5, 29.5, fur[0], 1.2);
  // head
  const hx = bx + len * 0.85 + 2.5, hy = by - bulk * 0.8;
  switch (o.head) {
    case 'wolf':
      p.cap(hx - 2, hy + 1, hx + 4.5, hy + 2.5, 2.6, 1.3, fur);
      p.poly([hx - 2.5, hy - 1, hx - 1, hy - 5, hx + 0.5, hy - 0.5], fur);
      p.poly([hx - 0.5, hy - 1, hx + 1.5, hy - 4.5, hx + 2.2, hy], fur, { lift: -0.1 });
      p.line(hx + 1.5, hy + 3.5, hx + 4.5, hy + 3.2, C('#1a0606'), 0.6);
      p.dot(hx + 3, hy + 3.8, W, 0.6); p.dot(hx + 4, hy + 3.6, W, 0.6);
      p.dot(hx + 5, hy + 2.2, C('#120a0a'), 1);
      p.eye(hx + 1, hy + 0.8, o.eye);
      break;
    case 'boar':
      p.blob(hx, hy + 2, 3.6, 3.2, fur);
      p.cap(hx + 2, hy + 3, hx + 5.5, hy + 4, 2.1, 1.8, fur, { lift: 0.05 });
      p.blob(hx + 5.6, hy + 4, 1.1, 1.5, R('#c89080'));
      p.poly([hx - 1.5, hy, hx - 1, hy - 3, hx + 1, hy - 0.5], fur);
      p.eye(hx + 1.6, hy + 1.2, o.eye);
      break;
    case 'deer':
      p.cap(hx - 3, hy + 3, hx, hy - 2, 1.8, 1.6, fur);
      p.cap(hx, hy - 2, hx + 5, hy - 0.5, 2.1, 1.2, fur);
      p.dot(hx + 5, hy - 0.8, C('#140a08'), 1);
      p.poly([hx - 1, hy - 3, hx - 3.5, hy - 5, hx - 0.2, hy - 4], fur, { lift: -0.1 });
      p.eye(hx + 1.5, hy - 2.2, o.eye);
      break;
    case 'skull':
      p.blob(hx, hy + 1, 3, 2.6, bone);
      p.cap(hx + 1.5, hy + 2, hx + 5, hy + 2.6, 1.6, 1.1, bone);
      p.line(hx + 2, hy + 3.8, hx + 5, hy + 3.6, C('#1a1414'), 0.5);
      p.blob(hx + 0.6, hy + 0.6, 1.2, 1, R('#0a0a14'), { shade: 0, edge: false });
      p.eye(hx + 0.6, hy + 0.6, o.eye);
      p.poly([hx - 2, hy - 0.5, hx - 1.5, hy - 3.5, hx, hy - 1], bone);
      break;
    case 'bear':
      p.blob(hx, hy + 1.5, 4.2, 3.8, fur);
      p.cap(hx + 2.5, hy + 2.5, hx + 5.5, hy + 3, 2.2, 1.7, belly);
      p.blob(hx - 2.2, hy - 2, 1.4, 1.4, fur);
      p.dot(hx + 6, hy + 2.4, C('#120a0a'), 1.2);
      p.eye(hx + 1.5, hy + 0.8, o.eye, 1.2);
      break;
  }
  if (o.horns === 'tusks') { const t = R(o.hornCol ?? '#efe6d2'); p.line(hx + 4, hy + 5, hx + 6, hy + 2, t[3], 0.8); p.dot(hx + 6.2, hy + 1.8, t[4], 0.8); }
  if (o.horns === 'antlers') {
    const a = R(o.hornCol ?? '#c8b89a');
    const ax = hx - 1, ay = hy - 3.5;
    p.line(ax, ay, ax - 3, ay - 6, a[2], 1); p.line(ax - 3, ay - 6, ax - 6, ay - 8, a[3], 0.8); p.line(ax - 2, ay - 4, ax - 6, ay - 4, a[2], 0.8); p.line(ax - 3, ay - 6, ax - 2, ay - 10, a[3], 0.8);
    p.line(ax + 1, ay, ax + 3, ay - 6, a[3], 1); p.line(ax + 3, ay - 6, ax + 6, ay - 8, a[4], 0.8); p.line(ax + 2, ay - 4, ax + 5, ay - 3, a[3], 0.8); p.line(ax + 3, ay - 6, ax + 2, ay - 10, a[4], 0.8);
  }
  o.extra?.(p, f);
}

function golem(p: Painter, f: number, o: { stone: string; accent: string; eye: string; head?: 'block' | 'lens' | 'horn' | 'none'; cracks?: boolean; extra?: (p: Painter, f: number) => void }) {
  const st = R(o.stone), ac = R(o.accent), s = sw(f), b = f ? 0.5 : 0;
  p.cap(12.5, 22, 12 - s, 30, 2.6, 2.2, st, { lift: -0.2 });
  p.cap(19.5, 22, 20 + s, 30, 2.6, 2.2, st);
  p.cap(10, 14 + b, 7, 23, 2.8, 2.6, st, { lift: -0.2 });
  p.poly([9, 12 + b, 23, 12 + b, 22, 24, 10, 24], st);
  p.blob(16, 17 + b, 4.5, 4, st, { lift: 0.1 });
  if (o.cracks) { p.line(13, 15 + b, 16, 19 + b, ac[4], 0.7, true); p.line(16, 19 + b, 15, 23, ac[3], 0.7, true); p.line(19, 14 + b, 18, 18 + b, ac[4], 0.6, true); }
  else { p.blob(16, 17.5 + b, 2, 2, ac, { lift: 0.25 }); p.dot(15.5, 16.8 + b, W, 0.8, true); }
  if (o.head !== 'none') {
    p.poly([12.5, 6 + b, 20.5, 6 + b, 21, 12 + b, 12, 12 + b], st, { lift: 0.08 });
    if (o.head === 'lens') { p.blob(18, 9 + b, 2, 2, R('#2a2a30')); p.eye(18, 8.6 + b, o.eye, 1.6); }
    else { p.line(14.5, 9 + b, 20, 9 + b, C('#100808'), 1); p.eye(16, 9 + b, o.eye); p.eye(19, 9 + b, o.eye); }
    if (o.head === 'horn') { p.cap(13, 6 + b, 10, 2, 1.2, 0.4, R('#8a8a94')); p.cap(20, 6 + b, 23, 2, 1.2, 0.4, R('#8a8a94')); }
  }
  p.cap(22, 14 + b, 25, 23, 3, 2.8, st);
  p.blob(25.5, 24, 2.6, 2.2, st, { lift: 0.05 });
  o.extra?.(p, f);
}

function wings(p: Painter, f: number, col: string, x: number, y: number, span: number, kind: 'bat' | 'moth' | 'feather' | 'stone') {
  const r = R(col), up = f ? -3 : 1;
  for (const side of [-1, 1]) {
    const lift = side < 0 ? -0.15 : 0;
    if (kind === 'moth') { p.blob(x + side * span * 0.55, y - 2 + up * 0.6, span * 0.6, span * 0.5, r, { rot: side * 0.5, lift }); p.blob(x + side * span * 0.4, y + 3, span * 0.4, span * 0.32, r, { rot: -side * 0.4, lift: lift - 0.1 }); }
    else if (kind === 'feather') p.poly([x, y, x + side * span, y - 3 + up, x + side * span * 0.8, y + 2 + up * 0.5, x + side * span * 0.4, y + 4], r, { lift });
    else p.poly([x, y - 1, x + side * span * 0.5, y - 5 + up, x + side * span, y - 3 + up, x + side * span * 0.8, y + 1, x + side * span * 0.55, y, x + side * span * 0.35, y + 2.5, x, y + 3], r, { lift });
  }
}

const spikesOn = (p: Painter, pts: number[][], col: string) => { const r = R(col); for (const [x, y, dx, dy] of pts) p.line(x, y, x + dx, y + dy, r[3], 0.6); };

// ---------------------------------------------------------------- the creatures

export const CREATURES: Record<string, Paint> = {
  // ---- the Greenwood
  wolf: (p, f) => beast(p, f, { fur: '#6a6a74', belly: '#9a9aa4', eye: '#ff4a2a', head: 'wolf', tail: 'bushy', len: 8, leg: 6, bulk: 3.8, mane: '#55555e' }),
  boar: (p, f) => beast(p, f, { fur: '#6a4a2c', belly: '#8a6a40', eye: '#ffd06a', head: 'boar', horns: 'tusks', tail: 'thin', len: 8, leg: 4.5, bulk: 5, extra: (q) => spikesOn(q, [[8, 17, -1, -3], [11, 16, -0.5, -3.5], [14, 16, 0.5, -3.5], [17, 16.5, 1, -3], [20, 17.5, 1, -2.5]], '#3a2818') }),
  hound: (p, f) => beast(p, f, { fur: '#e2d8c0', eye: '#9fe8ff', head: 'skull', tail: 'bone', bones: true, len: 7, leg: 6, bulk: 3.5 }),
  thornling: (p, f) => {
    const v = R('#4a6a24'), t = R('#2a3a14'), s = sw(f);
    p.cap(14, 24, 12 + s, 30, 1.2, 0.8, t); p.cap(18, 24, 20 - s, 30, 1.2, 0.8, t);
    p.blob(16, 20, 6, 6.5, v);
    spikesOn(p, [[11, 16, -3, -2], [13, 14, -2, -4], [16, 13, 0, -5], [19, 14, 2, -4], [21, 17, 3, -2], [10, 21, -3, 0], [22, 21, 3, 1]], '#b8d070');
    p.blob(17.5, 20, 3.2, 2.6, R('#1a2a0a'), { shade: 0.1, edge: false });
    p.eye(16.5, 19.5, '#e8ff7a', 1.2); p.eye(19, 19.5, '#e8ff7a', 1.2);
    p.cap(10, 21, 6, 17 - f * 2, 1, 0.6, v); p.cap(22, 21, 26, 18 + f * 2, 1, 0.6, v);
    p.blob(13, 15, 1.4, 1.1, R('#c05a8a'));
  },
  hag: (p, f) => robed(p, f, { robe: '#4a3a24', hood: '#2e2a1c', skin: '#8a9a6a', head: 'hat', eyes: '#ff8a3a', trim: '#5a7a3a', staff: { wood: '#4a3018', top: 'lantern', glow: '#ff9a3a' },
    extra: (q, g) => { const b = g ? 0.5 : 0; q.cap(19.5, 10.5 + b, 22.5, 12 + b, 1, 0.5, R('#8a9a6a')); q.line(13, 9 + b, 11, 13 + b, R('#c8c8c0')[2], 0.6); q.line(14, 9 + b, 12.5, 14 + b, R('#c8c8c0')[3], 0.6); } }),
  stag: (p, f) => beast(p, f, { fur: '#b0a088', belly: '#e0d4bc', eye: '#e8ffb0', head: 'deer', horns: 'antlers', hornCol: '#d8d0b0', tail: 'stub', len: 7.5, leg: 9, bulk: 4.2, mane: '#8a7a64',
    extra: (q) => { for (const [x, y] of [[8, 8], [24, 6], [6, 11], [25, 10]]) { q.dot(x, y, R('#7aa83a')[3], 1); q.dot(x + 1, y, R('#9ad04a')[4], 0.8, true); } } }),
  thornmaw: (p, f) => {
    golem(p, f, { stone: '#3a2c1a', accent: '#5a7a2a', eye: '#c8ff7a', head: 'none' });
    const m = f ? 1 : 0;
    p.blob(16, 9, 7.5, 6, R('#4a3a22'));
    p.poly([9.5, 9 + m, 22.5, 9 + m, 21, 13, 11, 13], R('#2a0808'), { shade: 0.1, edge: false });
    for (let i = 0; i < 6; i++) { p.poly([10.5 + i * 2, 9 + m, 12 + i * 2, 9 + m, 11.2 + i * 2, 11 + m], R('#efe6d2')); p.poly([11 + i * 2, 13, 12.4 + i * 2, 13, 11.7 + i * 2, 11.3], R('#d8ccb0')); }
    p.eye(12.5, 6, '#c8ff7a', 1.3); p.eye(19.5, 6, '#c8ff7a', 1.3);
    spikesOn(p, [[9, 6, -3, -3], [12, 3.5, -1, -4], [16, 3, 0, -4], [20, 3.5, 1, -4], [23, 6, 3, -3]], '#7a9a3a');
  },
  mother: (p, f) => beast(p, f, { fur: '#4a3820', belly: '#7a6040', eye: '#9cff5a', head: 'bear', horns: 'antlers', hornCol: '#b8a888', tail: 'stub', len: 8, leg: 5.5, bulk: 6,
    extra: (q) => { for (const [x, y] of [[10, 14], [15, 13], [19, 14]]) q.blob(x, y, 1.6, 1.2, R('#6a8a3a'), { lift: 0.1 }); q.dot(15, 12.5, R('#e8ff7a')[4], 0.8, true); } }),
  mycelid: (p, f) => golem(p, f, { stone: '#6a4a7a', accent: '#7ae0c0', eye: '#7ae0c0', head: 'none', extra: (q, g) => {
    const b = g ? 0.5 : 0;
    q.blob(16, 8 + b, 10, 5, R('#9a4a6a'), { lift: 0.05 });
    q.poly([8, 9 + b, 24, 9 + b, 22, 11 + b, 10, 11 + b], R('#e8d8c0'), { lift: -0.1 });
    for (const [x, y] of [[11, 6], [15, 4.5], [20, 5.5], [13, 8], [22, 8]]) q.blob(x, y + b, 1.1, 0.9, R('#f0e0d0'), { lift: 0.3 });
    q.eye(16, 13 + b, '#7ae0c0', 1.2); q.eye(19, 13 + b, '#7ae0c0', 1.2);
  } }),
  bloom: (p, f) => {
    const st = R('#3a5a2a');
    p.cap(16, 30, 16 + sw(f) * 0.5, 14, 2.2, 1.6, st);
    for (const [x0, y0, x1, y1] of [[16, 24, 9, 20], [16, 22, 23, 18], [16, 27, 7, 27], [16, 27, 25, 27]]) p.cap(x0, y0, x1, y1, 1, 2, R('#4a7a2a'), { lift: 0.05 });
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + f * 0.2; p.blob(16 + Math.cos(a) * 6.5, 10 + Math.sin(a) * 5, 4, 2.6, R('#a04a8a'), { rot: a }); }
    p.blob(16, 10, 4.2, 3.6, R('#e0c040'), { lift: 0.1 });
    p.blob(17, 10.5, 2.4, 2, R('#2a0a1a'), { shade: 0.1, edge: false });
    p.eye(17, 10.2, '#7ae0c0', 1.4);
  },
  swarm: (p, f) => {
    for (const [x, y, s] of [[10, 12, 1], [21, 9, 1.1], [16, 18, 1.5], [8, 22, 0.9], [24, 21, 1], [13, 26, 0.8], [22, 15, 0.8]]) {
      const yy = y + (f ? (x % 3) - 1 : 1 - (x % 3));
      p.blob(x - 1.5 * s, yy - 1.5 * s, 2 * s, 1.2 * s, R('#c8d0c0'), { rot: -0.5, lift: 0.2 });
      p.blob(x + 1.5 * s, yy - 1.5 * s, 2 * s, 1.2 * s, R('#c8d0c0'), { rot: 0.5, lift: 0.1 });
      p.blob(x, yy, 1.8 * s, 1.5 * s, R('#5a6a1a'));
      p.eye(x + s, yy - 0.3, '#ff4a2a');
    }
  },
  // ---- the cellars & catacombs
  ghoul: (p, f) => {
    const sk = R('#7d8f62'), dk = R('#5a6a44'), s = sw(f);
    p.cap(12, 22, 11 - s, 30, 1.9, 1.4, dk); p.cap(17, 22, 19 + s, 30, 2, 1.5, sk);
    p.cap(13, 17, 18, 13, 1.6, 1.2, dk, { lift: -0.2 });
    p.cap(12, 22, 17, 15, 4.6, 4.2, sk);
    for (let i = 0; i < 3; i++) p.line(13 + i * 1.3, 15.5 + i * 1.6, 17 + i * 0.6, 15 + i * 1.6, sk[1], 0.5);
    p.poly([10, 21, 18, 20, 17.5, 25, 14, 24, 11, 25.5], R('#4a3a2a'));
    for (const [x, y] of [[11, 14], [12.5, 12.5], [14.5, 11.5]]) p.blob(x, y, 1, 0.8, sk, { lift: 0.15 });
    p.blob(21, 12.5, 3.8, 3.3, sk);
    p.cap(21.5, 14.5, 24.5, 15.5, 1.8, 1.4, dk);
    for (let i = 0; i < 3; i++) p.dot(21.8 + i, 15.8, W, 0.6);
    p.eye(21.6, 11.6, '#ff3b2b', 1.2); p.eye(23.6, 11.8, '#ff3b2b', 1);
    p.cap(18, 15, 24, 20 + s, 1.6, 1.2, sk);
    for (let i = 0; i < 3; i++) p.line(24, 20 + s, 26.5, 19 + s + i * 1.2, C('#d8ccb0'), 0.5);
  },
  spitter: (p, f) => {
    const b = R('#7a8a22'), s = sw(f);
    p.cap(11, 25, 9 + s, 30, 1.4, 1, b); p.cap(20, 25, 22 - s, 30, 1.4, 1, b);
    p.blob(15, 19, 8.5, 7.5 - f * 0.4, b);
    p.blob(14, 21, 5.5, 4.5 + f * 0.4, R('#b8d84a'), { lift: 0.25 });
    for (const [x, y] of [[12, 20], [15, 22], [14, 19]]) p.dot(x, y, R('#e8ff7a')[4], 0.8, true);
    p.blob(21, 13, 4.5, 3.6, b);
    p.poly([20, 14.5, 26, 13.5, 25.5, 16.5, 20, 16], R('#2a0a0a'), { shade: 0.1, edge: false });
    p.line(22, 16.5, 22, 18.5 + f, R('#d8ff3b')[4], 0.6, true);
    p.eye(20.5, 11.5, '#ffdd3b', 1.2); p.eye(23, 11.5, '#ffdd3b', 1);
    for (const [x, y] of [[9, 14], [12, 12.5], [18, 13], [8, 19]]) p.blob(x, y, 1, 0.8, R('#9aaa3a'), { lift: 0.2 });
  },
  necro: (p, f) => robed(p, f, { robe: '#2a2236', hood: '#1e1828', trim: '#5a8a4a', head: 'hood', eyes: '#9cff5a', eyeS: 1.2, staff: { wood: '#3a2a20', top: 'skull', glow: '#9cff5a' },
    extra: (q, g) => { for (let i = 0; i < 3; i++) q.dot(9 + i * 2, 27 - g - i * 3, R('#9cff5a')[3 + (i % 2)], 1, true); } }),
  monk: (p, f) => robed(p, f, { robe: '#4a5040', trim: '#7a6a3a', head: 'veil', eyes: '#9cff5a', staff: { wood: '#4a3a24', top: 'censer', glow: '#9cff5a' },
    extra: (q, g) => { q.poly([17, 11, 22.5, 12, 21, 13.5, 17, 13], R('#c8b898')); q.cap(21, 12.5, 25, 14, 1.1, 0.4, R('#d8c8a8')); } }),
  priest: (p, f) => robed(p, f, { robe: '#e2d6bc', hood: '#cfc4ad', trim: '#8a6a3a', head: 'mitre', skin: '#d8ccb0', eyes: '#ff4a2a', staff: { wood: '#d8ccb0', top: 'crook', glow: '#ff6a2a' },
    extra: (q) => { for (let i = 0; i < 4; i++) q.blob(14 + i * 1.2, 21 + (i % 2), 0.7, 0.7, R('#efe6d2')); } }),
  warden: (p, f) => {
    const bone = R('#d8ccb0'), iron = R('#4a4a56'), s = sw(f), b = f ? 0.5 : 0;
    p.cap(13, 22, 12 - s, 30, 2.2, 2, iron); p.cap(19, 22, 20 + s, 30, 2.2, 2, iron);
    p.poly([8, 13 + b, 24, 13 + b, 22, 26, 10, 26], R('#3a2a2a'));
    for (let i = 0; i < 4; i++) p.line(11 + i * 3, 14 + b, 11 + i * 3, 25, iron[3], 0.6);
    p.blob(16, 16 + b, 5.5, 4, iron, { lift: 0.1 });
    for (let i = 0; i < 3; i++) p.line(12, 15 + i * 1.6 + b, 20, 15 + i * 1.6 + b, bone[3], 0.5);
    p.blob(9, 13 + b, 3, 2.4, iron, { lift: 0.1 }); p.blob(23, 13 + b, 3, 2.4, iron, { lift: 0.1 });
    p.blob(16, 8 + b, 4.2, 4.2, bone);
    p.poly([11.5, 7 + b, 20.5, 7 + b, 20, 3 + b, 12, 3 + b], iron, { lift: 0.1 });
    p.line(16, 3 + b, 16, 12 + b, iron[1], 0.8);
    p.eye(14.5, 8.5 + b, '#ff8a3a', 1.3); p.eye(18, 8.5 + b, '#ff8a3a', 1.3);
    p.cap(23, 14 + b, 26, 22, 1.8, 1.6, iron);
    p.blob(26, 24.5, 3, 3, R('#7a6a3a'), { edge: true });
    p.blob(26, 24.5, 1.8, 1.8, R('#1a1010'), { shade: 0.1, edge: false });
    for (let i = 0; i < 3; i++) p.line(25 + i, 26.5, 24.5 + i, 29 - (i % 2), R('#c8a040')[3], 0.6);
    p.line(8, 14 + b, 6, 24, R('#5a3a20')[2], 1); p.blob(6, 26, 2, 2.6, R('#3a3a44'));
    p.blob(6, 26, 1.2, 1.6, R('#ff9a3a'), { edge: false, lift: 0.4 });
  },
  leech: (p, f) => {
    const r = R('#6a2a4a');
    for (let i = 0; i < 5; i++) { const x = 7 + i * 3.6, y = 25 - Math.sin(i * 0.9 + f) * 1.5 - (i > 3 ? 3 : 0); p.blob(x, y, 3.4 - i * 0.1, 3 + (i === 4 ? 0.8 : 0), r, { lift: i * 0.04 }); p.line(x - 1, y - 2.6, x - 1, y + 2.6, r[1], 0.5); }
    p.blob(23.5, 21, 3, 3.4, R('#8a3a5a'), { lift: 0.1 });
    p.blob(25, 21, 1.8, 2.2, R('#1a0408'), { shade: 0.1, edge: false });
    for (let i = 0; i < 5; i++) p.dot(25 + Math.cos(i * 1.3) * 1.6, 21 + Math.sin(i * 1.3) * 1.9, W, 0.5);
    p.dot(12, 22, R('#6fd0ff')[4], 1, true); p.dot(16, 21.5, R('#6fd0ff')[4], 1, true);
  },
  grasp: (p, f) => {
    const sk = R('#3a6a6a');
    p.blob(16, 29, 9, 2, R('#1f3a3a'), { shade: 0.2 });
    p.cap(15, 30, 15, 18, 3.4, 3, sk);
    const c = f ? 1 : 0;
    for (const [dx, h] of [[-4.5, 9], [-1.5, 12], [1.5, 12.5], [4.5, 10]]) { p.cap(15 + dx * 0.6, 18, 15 + dx, 18 - h * 0.5 - c, 1.2, 1, sk); p.cap(15 + dx, 18 - h * 0.5 - c, 15 + dx * 1.1 + 1, 18 - h + c, 1, 0.7, sk); }
    p.cap(12, 20, 8, 15, 1.2, 0.9, sk);
    for (const [x, y] of [[14, 24], [16, 21], [13, 27]]) p.line(x, y, x + 1, y + 2, R('#4a8a3a')[3], 0.6);
  },
  bellringer: (p, f) => {
    const cl = R('#1f3a5a'), b = f ? 0.5 : 0;
    robed(p, f, { robe: '#1f3a5a', hood: '#18304a', head: 'hood', eyes: '#ffe070', wide: 1 });
    p.line(5, 8 + b, 27, 8 + b, R('#5a3a20')[2], 1.2);
    for (const x of [6, 26]) {
      const sway = f ? 1 : -1;
      p.line(x, 8 + b, x + sway, 11, R('#5a3a20')[1], 0.5);
      p.poly([x + sway - 3, 17, x + sway + 3, 17, x + sway + 2, 12, x + sway, 10.5, x + sway - 2, 12], R('#c8a040'), { lift: 0.1 });
      p.dot(x + sway - 0.5, 17.5, R('#5a4a20')[1], 1);
    }
    void cl;
  },
  effigy: (p, f) => {
    const st = R('#c8a050');
    p.line(16, 30, 16, 6, R('#5a3a20')[2], 1.2);
    p.line(7, 12, 25, 12, R('#5a3a20')[2], 1);
    p.poly([11, 11, 21, 11, 20, 24, 12, 24], st);
    for (let i = 0; i < 5; i++) p.line(12 + i * 2, 24, 11.5 + i * 2.2, 27 + (i % 2) - f, st[1], 0.6);
    p.blob(16, 8, 3.6, 3.8, R('#d8c8a0'));
    p.line(14, 7, 15, 8, C('#1a0a0a'), 0.5); p.line(17, 7, 18, 8, C('#1a0a0a'), 0.5); p.line(14.5, 10, 17.5, 10, C('#3a1010'), 0.5);
    p.cap(7, 12, 5, 15, 1, 0.6, st); p.cap(25, 12, 27, 15, 1, 0.6, st);
    p.line(12, 16, 20, 18, R('#8a2a2a')[2], 0.6);
    for (let i = 0; i < 4; i++) p.dot(14 + i * 1.5, 3 - (i % 2) - f, R('#ff8a2a')[3 + (i % 2)], 1, true);
  },
  urn_fire: (p) => urn(p, '#6a3a22', '#ff7a2a'),
  urn_ice: (p) => urn(p, '#3a4a6a', '#9fe0ff'),
  urn_plague: (p) => urn(p, '#4a5a2a', '#9cff5a'),
  // ---- frost
  wight: (p, f) => {
    const bone = R('#bfe0f0'), mail = R('#5a7890'), s = sw(f), b = f ? 0.5 : 0;
    p.poly([9, 12 + b, 13, 12 + b, 11, 28, 6, 29, 8, 26], R('#2a3a5a'), { lift: -0.15 });
    p.cap(13, 22, 12 - s, 30, 1.5, 1.2, bone); p.cap(18, 22, 19 + s, 30, 1.5, 1.2, bone);
    p.poly([11, 12 + b, 21, 12 + b, 20, 23, 12, 23], mail);
    for (let i = 0; i < 3; i++) p.line(12, 14 + i * 2 + b, 20, 14 + i * 2 + b, mail[3], 0.4);
    p.blob(16, 8 + b, 3.8, 3.8, bone);
    p.poly([12, 7 + b, 20.5, 7 + b, 20, 4 + b, 16, 2 + b, 12.5, 4 + b], R('#8aa8c0'), { lift: 0.1 });
    p.blob(17, 9 + b, 2.6, 1.6, R('#0a1420'), { shade: 0.1, edge: false });
    p.eye(16, 9 + b, '#9fe8ff', 1.2); p.eye(18.5, 9 + b, '#9fe8ff', 1.2);
    p.cap(19, 14 + b, 23, 18, 1.4, 1.2, bone);
    p.line(23, 19, 28, 4, R('#d0f0ff')[3], 1.2, true); p.line(21, 17, 25, 19, R('#5a7890')[3], 0.8);
  },
  wisp: (p, f) => {
    const c = R('#9fd0f0');
    p.cap(16, 16, 10 - f, 27, 4.5, 0.6, R('#6fa0c0'), { lift: 0.2 });
    p.blob(16, 14 + f * 0.5, 6, 6.5, c, { lift: 0.25, edge: false });
    p.blob(16, 14 + f * 0.5, 3.8, 4.2, R('#e9f4ff'), { lift: 0.4, edge: false });
    p.eye(14.5, 13.5, '#2a6aa0', 1.3); p.eye(17.5, 13.5, '#2a6aa0', 1.3);
    p.dot(15.5, 16.5, C('#2a6aa0'), 1);
    for (const [x, y] of [[9, 9], [23, 11], [21, 22]]) p.dot(x, y + f, R('#e9f4ff')[4], 1, true);
  },
  gargoyle: (p, f) => {
    wings(p, f, '#5a5a62', 16, 14, 13, 'bat');
    golem(p, 1, { stone: '#6a6a74', accent: '#ff4a2a', eye: '#ff4a2a', head: 'horn' });
  },
  shade: (p, f) => {
    const d = R('#2a2234');
    p.poly([10, 12, 22, 12, 25, 29 - f, 21, 26, 18, 30, 15, 26, 12, 30 + f, 8, 27], d, { lift: 0.1 });
    p.blob(16, 9, 5, 5.5, d, { lift: 0.15 });
    p.blob(17.5, 10, 3, 3.2, R('#000000'), { shade: 0, edge: false });
    p.eye(16.5, 9.5, '#c060ff', 1.3); p.eye(19, 9.5, '#c060ff', 1.3);
    p.cap(20, 15, 26, 18 + f, 1.6, 0.8, d);
    for (let i = 0; i < 3; i++) p.line(26, 18 + f, 29, 17 + f + i * 1.3, R('#c060ff')[3], 0.5, true);
    for (const [x, y] of [[7, 20], [24, 9], [5, 25]]) p.dot(x, y - f, R('#4a3a5a')[3], 1);
  },
  lich: (p, f) => robed(p, f, { robe: '#3a2a5a', hood: '#2a1e44', trim: '#9fe0ff', head: 'crown', skin: '#d8d0e0', eyes: '#c060ff', wide: 2, staff: { wood: '#bfe0f0', top: 'orb', glow: '#c060ff' },
    extra: (q, g) => { for (const [x, y] of [[6, 14], [27, 20], [8, 24]]) { q.dot(x, y - g, R('#bfe0ff')[4], 1, true); q.dot(x + 1, y + 1 - g, R('#bfe0ff')[3], 0.6, true); } q.poly([12, 12, 20, 12, 18, 17, 14, 17], R('#9fe0ff'), { lift: 0.2 }); } }),
  queen: (p, f) => robed(p, f, { robe: '#bfe0f0', hood: '#e9f4ff', trim: '#6fd0ff', head: 'crown', skin: '#e9f4ff', eyes: '#6fd0ff', wide: 3, staff: { wood: '#9fe0ff', top: 'star', glow: '#bfe8ff' },
    extra: (q, g) => { for (let i = 0; i < 5; i++) q.line(6 + i * 5, 30, 7 + i * 5, 24 - (i % 2) * 3 - g, R('#9fe0ff')[3], 0.8); } }),
  // ---- the forges
  slag: (p, f) => golem(p, f, { stone: '#3a2a24', accent: '#ff7a2a', eye: '#ffd06a', cracks: true, extra: (q, g) => { for (let i = 0; i < 3; i++) q.dot(8 + i * 8, 4 - g + i, R('#ff9a3a')[3 + (i % 2)], 1, true); q.dot(26, 27, R('#ffd06a')[4], 1.4, true); } }),
  automaton: (p, f) => golem(p, f, { stone: '#a07a34', accent: '#6fd0ff', eye: '#6fd0ff', head: 'lens', extra: (q, g) => {
    const b = g ? 0.5 : 0;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + g * 0.4; q.dot(16 + Math.cos(a) * 3, 17.5 + b + Math.sin(a) * 3, R('#d9a845')[4], 0.8); }
    q.line(10, 6 + b, 10, 2 + b, R('#5a4a2a')[2], 1); q.dot(10, 1 + b - g, R('#c8c8d0')[3], 1);
    q.dot(13, 13 + b, R('#5a4a2a')[1], 0.7); q.dot(19, 13 + b, R('#5a4a2a')[1], 0.7); q.dot(13, 21, R('#5a4a2a')[1], 0.7); q.dot(19, 21, R('#5a4a2a')[1], 0.7);
  } }),
  gearspider: (p, f) => {
    const br = R('#a08040'), s = sw(f);
    for (let i = 0; i < 3; i++) { const x = 11 + i * 4; p.line(x, 22, x - 4 + s * (i % 2 ? 1 : -1), 18, br[1], 0.8); p.line(x - 4 + s * (i % 2 ? 1 : -1), 18, x - 6, 30, br[1], 0.8); }
    p.blob(15, 23, 7, 4.5, br);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + f * 0.3; p.dot(15 + Math.cos(a) * 6.8, 21.5 + Math.sin(a) * 4.3, R('#d9a845')[3], 0.9); }
    p.blob(15, 21.5, 2.5, 2, R('#d9a845'), { lift: 0.2 }); p.dot(15, 21.5, R('#3a2a10')[0], 1);
    p.blob(22.5, 23, 3, 2.6, R('#6a5a30'));
    p.eye(23, 22.2, '#6fd0ff'); p.eye(24.5, 23, '#6fd0ff'); p.eye(23.5, 24, '#6fd0ff', 0.6);
    for (let i = 0; i < 3; i++) { const x = 13 + i * 4; p.line(x, 24, x + 4 - s * (i % 2 ? 1 : -1), 19, br[3], 0.8); p.line(x + 4 - s * (i % 2 ? 1 : -1), 19, x + 6, 30, br[3], 0.8); }
  },
  anvil: (p, f) => {
    const ir = R('#3a3a42'), s = sw(f);
    p.cap(12, 23, 11 - s, 30, 2.4, 2.2, ir); p.cap(20, 23, 21 + s, 30, 2.4, 2.2, ir);
    p.poly([12, 17, 20, 17, 21, 24, 11, 24], ir);
    p.poly([3, 9, 27, 9, 25, 13, 21, 14, 21, 17, 11, 17, 11, 14, 8, 13], ir, { lift: 0.12 });
    p.poly([27, 9, 30, 10.5, 25, 13], ir, { lift: 0.2 });
    p.line(5, 9.4, 26, 9.4, R('#9a9aa8')[4], 0.6);
    p.line(12, 15, 20, 15, R('#ff7a2a')[4], 0.8, true);
    p.eye(14, 12, '#ff4a2a', 1.3); p.eye(18, 12, '#ff4a2a', 1.3);
    for (let i = 0; i < 3; i++) p.dot(8 + i * 6, 6 - f - (i % 2), R('#ffd06a')[4], 0.8, true);
  },
  orrery: (p, f) => {
    const br = R('#c8a040');
    p.cap(16, 30, 16, 20, 2.2, 1.4, R('#6a5a2a'));
    p.poly([10, 30, 22, 30, 19, 27, 13, 27], R('#6a5a2a'));
    for (const [rx, ry, rot] of [[13, 4, 0.25], [11, 5, -0.6]]) {
      for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, c = Math.cos(rot as number), s2 = Math.sin(rot as number); const x = Math.cos(a) * (rx as number), y = Math.sin(a) * (ry as number); p.dot(16 + x * c - y * s2, 14 + x * s2 + y * c, br[(i % 3) + 1], 0.8); }
    }
    p.blob(16, 14, 5, 5, R('#ffd06a'), { lift: 0.2 });
    p.blob(17, 14.5, 2.6, 2.6, R('#c0a0ff'), { lift: 0.15 }); p.eye(17.5, 14, '#ffffff', 1.4);
    const ph = f * 0.5;
    for (const [a, r, col, sz] of [[0.3 + ph, 13, '#8ad0ff', 2], [2.4 + ph, 12, '#ff8a3a', 1.6], [4.1 + ph, 10, '#9cff5a', 1.4]]) p.blob(16 + Math.cos(a as number) * (r as number), 14 + Math.sin(a as number) * (r as number) * 0.35, sz as number, sz as number, R(col as string), { lift: 0.1 });
  },
  // ---- the cathedral
  cultist: (p, f) => robed(p, f, { robe: '#7a1420', hood: '#5a0a12', trim: '#ffd060', head: 'hood', eyes: '#ff4a4a', staff: { wood: '#3a1010', top: 'dagger', glow: '#ff2a2a' },
    extra: (q, g) => { const b = g ? 0.5 : 0; q.poly([15.5, 16 + b, 17.5, 16 + b, 16.5, 19 + b], R('#ffd060'), { lift: 0.2 }); q.dot(16, 15.5 + b, R('#ff2a2a')[4], 0.8, true); } }),
  bloodarcher: (p, f) => {
    const s = sw(f), b = f ? 0.5 : 0, cl = R('#6a1a20'), lt = R('#3a1a1a');
    p.poly([10, 12 + b, 14, 12 + b, 12, 28, 7, 28], cl, { lift: -0.2 });
    p.cap(13, 22, 12 - s, 30, 1.6, 1.3, lt); p.cap(18, 22, 19 + s, 30, 1.6, 1.3, lt);
    p.poly([11.5, 12 + b, 20, 12 + b, 20, 23, 12, 23], R('#8a2a2a'));
    p.line(12, 18, 20, 18, R('#2a1010')[1], 1);
    p.blob(16, 8 + b, 4.4, 4.6, cl);
    p.poly([15.5, 8 + b, 21, 8 + b, 20.5, 11 + b, 16, 11 + b], R('#d8ccb0'), { lift: 0.1 });
    p.eye(18.5, 9 + b, '#ff2a2a', 1.2);
    for (let i = 0; i < 9; i++) { const a = -1.15 + i * 0.29; p.dot(22 + Math.cos(a) * 1.5 - 1, 17 + Math.sin(a) * 9, R('#4a2a1a')[2 + (i % 2)], 1.1); }
    p.line(22.4, 8.5, 22.4, 25.5, R('#e9dcc0')[2], 0.4);
    p.cap(17, 14 + b, 22, 17, 1.6, 1.3, R('#8a2a2a'));
    p.line(12, 17, 26, 17, R('#ff2a2a')[4], 0.6, true);
    p.line(10, 11, 13, 6, R('#4a2a1a')[2], 1); for (let i = 0; i < 3; i++) p.dot(12 + i * 0.7, 5 - i * 0.5, R('#ff4a4a')[3], 0.7);
  },
  imp: (p, f) => {
    const sk = R('#c0402a'), s = sw(f);
    wings(p, f, '#5a1a1a', 15, 14, 9, 'bat');
    p.line(11, 22, 6, 25 - f, sk[1], 0.7); p.poly([5, 24 - f, 7, 23.5 - f, 6, 26 - f], sk);
    p.cap(14, 22, 13 - s, 28, 1.1, 0.8, sk); p.cap(17, 22, 18 + s, 28, 1.1, 0.8, sk);
    p.blob(15.5, 19, 3.6, 4, sk);
    p.blob(16.5, 12.5, 4, 3.6, sk);
    p.cap(14, 10, 12, 6, 0.9, 0.3, R('#2a1a1a')); p.cap(18.5, 10, 20.5, 6, 0.9, 0.3, R('#2a1a1a'));
    p.line(16, 14.5, 19.5, 14, C('#2a0606'), 0.6); p.dot(17, 14.8, W, 0.5); p.dot(18.5, 14.7, W, 0.5);
    p.eye(16.5, 12, '#ffd06a', 1.1); p.eye(19, 12, '#ffd06a', 1.1);
    p.cap(18, 18, 22, 16 + s, 1, 0.8, sk);
  },
  flagellant: (p, f) => {
    const sk = R('#c09878'), s = sw(f), b = f ? 0.5 : 0;
    p.cap(13, 22, 12 - s, 30, 1.7, 1.3, R('#4a3a2a')); p.cap(18, 22, 19 + s, 30, 1.7, 1.3, R('#4a3a2a'));
    p.poly([11, 20, 21, 20, 22, 26, 10, 26], R('#5a4a38'));
    p.blob(16, 16 + b, 5, 5.2, sk);
    for (let i = 0; i < 4; i++) p.line(12 + i * 2, 13 + b + (i % 2), 14 + i * 2, 19 + b, R('#a3202a')[3], 0.5);
    p.blob(16.5, 8.5 + b, 4.2, 4.3, R('#3a2a20'));
    p.poly([12.5, 8 + b, 21, 8 + b, 20, 2 + b, 16, 0 + b, 13, 3 + b], R('#3a2a20'));
    p.eye(17.5, 9 + b, '#ff2a2a'); p.eye(19.5, 9 + b, '#ff2a2a');
    p.cap(20, 14 + b, 23, 18 + s, 1.4, 1, sk);
    for (let i = 0; i < 3; i++) p.line(23, 18 + s, 27 + i * 0.5, 24 + i * 2 - f * 3, R('#5a3a20')[2 + (i % 2)], 0.5);
    p.cap(12, 14 + b, 9, 20, 1.4, 1, sk);
  },
  choir: (p, f) => {
    for (const [dx, sc, d] of [[-7, 0.75, -0.25], [7, 0.75, -0.2]]) robedMini(p, f, 16 + (dx as number), sc as number, d as number);
    robed(p, f, { robe: '#a8202a', hood: '#7a1a2a', trim: '#ffd060', head: 'halo', eyes: '#ffd060', wide: 2, staff: { wood: '#c8a040', top: 'book', glow: '#e9dcc0' } });
    for (let i = 0; i < 3; i++) p.dot(18 + i * 2, 13 - i - f, R('#ffd060')[4], 0.7, true);
  },
  inkwraith: (p, f) => {
    const ink = R('#16161e');
    p.poly([9, 12, 23, 12, 24, 27, 20, 25, 18, 30 - f, 15, 25, 12, 29 + f, 8, 26], ink, { lift: 0.15 });
    for (let i = 0; i < 5; i++) p.line(10 + i * 3, 26, 10 + i * 3, 29 + ((i + f) % 2), ink[2], 0.6);
    p.blob(16, 9, 5.2, 5.5, ink, { lift: 0.2 });
    p.blob(17.5, 10, 3.2, 3.2, R('#e2cfa2'), { lift: 0.1 });
    p.blob(16.8, 10, 0.9, 1.3, R('#0a0a0e'), { shade: 0, edge: false }); p.blob(19.2, 10, 0.9, 1.3, R('#0a0a0e'), { shade: 0, edge: false });
    p.line(16.5, 12, 19.5, 12, C('#0a0a0e'), 0.5);
    for (const [x, y] of [[6, 20], [26, 16], [24, 8]]) p.dot(x, y + f, ink[3], 1.2);
  },
  unwritten: (p, f) => {
    const pg = R('#e2cfa2');
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + f * 0.3; p.poly([16 + Math.cos(a) * 12 - 2, 16 + Math.sin(a) * 10 - 3, 16 + Math.cos(a) * 12 + 2, 16 + Math.sin(a) * 10 - 2.5, 16 + Math.cos(a) * 12 + 1.5, 16 + Math.sin(a) * 10 + 3, 16 + Math.cos(a) * 12 - 2.5, 16 + Math.sin(a) * 10 + 2.5], pg, { lift: 0.05 }); p.line(16 + Math.cos(a) * 12 - 1, 16 + Math.sin(a) * 10 - 1, 16 + Math.cos(a) * 12 + 1, 16 + Math.sin(a) * 10 - 1, C('#3a2a1a'), 0.4); }
    p.poly([7, 10, 25, 10, 26, 26, 6, 26], pg);
    p.line(16, 10, 16, 26, pg[1], 0.8);
    for (let i = 0; i < 5; i++) { p.line(8, 13 + i * 2.6, 14.5, 13 + i * 2.6, pg[1], 0.4); p.line(17.5, 13 + i * 2.6, 24.5, 13 + i * 2.6, pg[1], 0.4); }
    p.blob(16, 18, 4.5, 4, R('#1a1a1a'), { shade: 0.15 });
    p.eye(16, 17.5, '#ff4a2a', 2.2);
  },
  // ---- the throne & the stars
  king: (p, f) => robed(p, f, { robe: '#2a2230', hood: '#3a0a10', trim: '#e0b040', head: 'crown', skin: '#1a1420', eyes: '#ff8a3a', wide: 3, staff: { wood: '#e0b040', top: 'orb', glow: '#ff6a2a' },
    under: (q, g) => { q.poly([4, 13, 28, 13, 30, 30, 2, 30], R('#5a0a14'), { lift: -0.25 }); q.line(4, 13.5, 28, 13.5, R('#efe6d2')[3], 1); for (let i = 0; i < 6; i++) q.dot(5 + i * 4.3, 13.5, C('#1a1a1a'), 0.6); void g; },
    extra: (q, g) => { for (const [x, y] of [[6, 22], [26, 25], [9, 28]]) q.dot(x, y - g, R('#ff8a3a')[4], 1, true); } }),
  ashling: (p, f) => {
    p.poly([11, 26, 21, 26, 23, 19, 20, 14 - f, 18, 9, 16, 4 + f, 14, 10, 11, 14 + f, 9, 20], R('#ff7a2a'), { lift: 0.15 });
    p.poly([13, 26, 19, 26, 20, 20, 17.5, 14, 16, 9, 14.5, 15, 12, 20], R('#ffd06a'), { lift: 0.3, edge: false });
    p.blob(16, 22, 3, 2.6, R('#3a1a10'), { shade: 0.2 });
    p.eye(15, 19, '#ffffff', 1.2); p.eye(18, 19, '#ffffff', 1.2);
    for (let i = 0; i < 3; i++) p.dot(12 + i * 4, 3 + (i % 2) - f, R('#ffd06a')[4], 0.8, true);
  },
  startouched: (p, f) => robed(p, f, { robe: '#2a2050', hood: '#1a1440', trim: '#c0a0ff', head: 'halo', eyes: '#e0d0ff', staff: { wood: '#463e6c', top: 'star', glow: '#c0a0ff' },
    extra: (q, g) => { for (const [x, y] of [[13, 19], [18, 22], [15, 26], [20, 27], [11, 25]]) q.dot(x, y + (g && x > 15 ? 1 : 0), R('#e0d0ff')[4], 0.6, true); } }),
  star: (p, f) => {
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + f * 0.2, l = i % 2 ? 9 : 13; p.poly([16, 15, 16 + Math.cos(a - 0.2) * 4, 15 + Math.sin(a - 0.2) * 4, 16 + Math.cos(a) * l, 15 + Math.sin(a) * l, 16 + Math.cos(a + 0.2) * 4, 15 + Math.sin(a + 0.2) * 4], R(i % 2 ? '#ffb040' : '#ffe070'), { lift: 0.2, edge: false }); }
    p.blob(16, 15, 6, 6, R('#ffd06a'), { lift: 0.25 });
    p.blob(17, 16, 3.2, 2.6, R('#3a1404'), { shade: 0.15, edge: false });
    p.eye(16, 15.5, '#ff4a2a', 1.4); p.eye(18.5, 15.5, '#ff4a2a', 1.4);
    p.blob(16, 29, 7, 1.5, R('#5a3a10'), { shade: 0.2 });
  },
  // ---- the drowned & the deep
  drowned: (p, f) => {
    const sk = R('#4a7a76'), s = sw(f), b = f ? 0.5 : 0;
    p.cap(13, 22, 12 - s, 30, 2, 1.6, sk); p.cap(18.5, 22, 19.5 + s, 30, 2, 1.6, sk);
    p.blob(16, 18 + b, 6.5, 6.5, sk);
    p.blob(15, 20 + b, 3.6, 3, R('#6a9a96'), { lift: 0.2 });
    for (let i = 0; i < 4; i++) p.line(11 + i * 3, 13 + b, 10 + i * 3.4, 25 - (i % 2) * 2, R('#2f5a2f')[2 + (i % 2)], 0.6);
    p.blob(17, 9.5 + b, 3.8, 3.6, sk);
    p.blob(18, 10 + b, 2.4, 2.2, R('#0a1a1a'), { shade: 0.1, edge: false });
    p.eye(17.5, 9.8 + b, '#bfe0ff', 1.3); p.eye(19.5, 9.8 + b, '#bfe0ff', 1);
    p.cap(20, 15 + b, 24, 21 + s, 1.6, 1.3, sk);
    for (const [x, y] of [[9, 8], [24, 10], [21, 4]]) p.blob(x, y - f, 0.8, 0.8, R('#bfe0ff'), { lift: 0.3, edge: false });
  },
  eelpriest: (p, f) => robed(p, f, { robe: '#1f4a4a', hood: '#2f6a6a', trim: '#bfe0ff', head: 'hood', face: '#0a1a1a', eyes: '#bfe0ff', staff: { wood: '#2a4a4a', top: 'trident', glow: '#6fa0ff' },
    extra: (q, g) => { for (let i = 0; i < 3; i++) q.cap(17 + i * 1.4, 12, 16.5 + i * 1.6 + (g ? 0.6 : -0.6), 17 + i, 0.6, 0.3, R('#3a8a7a')); } }),
  toad: (p, f) => {
    const t = R('#6a7a2a');
    p.cap(9, 26, 6, 30, 2, 1.4, t); p.cap(22, 26, 26, 30, 2, 1.4, t);
    p.blob(15.5, 22 - f * 0.4, 10, 7 + f * 0.4, t);
    p.blob(15.5, 25, 7, 3.2, R('#b8b87a'), { lift: 0.2 });
    p.line(7, 22.5, 25, 22.5, C('#1a1a08'), 0.6);
    for (const [x, y] of [[9, 17], [13, 16], [19, 17], [11, 19.5], [21, 19]]) p.blob(x, y, 1.1, 0.9, R('#8a9a3a'), { lift: 0.2 });
    for (const x of [10, 21]) { p.blob(x, 15.5, 2.6, 2.4, t, { lift: 0.1 }); p.eye(x + 0.5, 15.2, '#ffdd3b', 1.6); p.dot(x + 0.8, 15, C('#000000'), 0.6); }
  },
  voidmoth: (p, f) => {
    wings(p, f, '#3a2a6a', 16, 15, 12, 'moth');
    for (const s of [-1, 1]) { p.blob(16 + s * 7, 12 + (f ? -1 : 0), 2, 2, R('#c0a0ff'), { lift: 0.2 }); p.dot(16 + s * 7, 12 + (f ? -1 : 0), C('#000000'), 1); }
    p.cap(16, 10, 16, 23, 2.4, 1.4, R('#4a3a7a'));
    for (let i = 0; i < 4; i++) p.line(14.5, 14 + i * 2, 17.5, 14 + i * 2, R('#2a1a4a')[1], 0.5);
    p.blob(16, 9, 2.4, 2.2, R('#5a4a8a'));
    p.eye(15, 8.8, '#ffffff'); p.eye(17, 8.8, '#ffffff');
    p.line(15, 7, 12, 3, R('#c0a0ff')[3], 0.5); p.line(17, 7, 20, 3, R('#c0a0ff')[3], 0.5);
  },
  moth: (p, f) => CREATURES.voidmoth(p, f),
  // ---- the people of the Last Hearth
  npc_cass: (p, f) => robed(p, f, { robe: '#5a4a3a', hood: '#8a3a2a', skin: '#c8a888', head: 'hood', face: '#3a2a20', eyes: '#ffd06a', trim: '#c89a4a', staff: { wood: '#3a3a40', top: 'none', glow: '#ff8a3a' },
    extra: (q, g) => { q.line(24, 5, 26, 2, R('#3a3a40')[2], 1); q.dot(26, 1.5 - g * 0.5, R('#ff8a3a')[4], 1, true); q.poly([10, 13, 22, 13, 21, 17, 11, 17], R('#a04a2a'), { lift: 0.1 }); } }),
  npc_rook: (p, f) => robed(p, f, { robe: '#3a4a2a', hood: '#1e2a18', skin: '#9aa070', head: 'hat', eyes: '#c8ff7a', trim: '#8a5a2a', staff: { wood: '#4a3018', top: 'thorn', glow: '#c8ff7a' },
    extra: (q, g) => { const b = g ? 0.5 : 0; q.cap(19.5, 10.5 + b, 22.5, 12 + b, 1, 0.5, R('#9aa070')); q.blob(9, 6 + b, 1.8, 1.4, R('#1a1a20')); q.dot(9.8, 5.6 + b, R('#ffd06a')[4], 0.6, true); } }),
  npc_brannoch: (p, f) => {
    const s2 = f ? 0.5 : 0, sk = R('#b08060'), ap = R('#4a3a2a');
    p.cap(13, 22, 12, 30, 2.4, 2.2, R('#3a3030')); p.cap(19, 22, 20, 30, 2.4, 2.2, R('#3a3030'));
    p.blob(16, 18 + s2, 7, 7, sk);
    p.poly([10.5, 14 + s2, 21.5, 14 + s2, 21, 27, 11, 27], ap);
    p.line(11, 15 + s2, 21, 15 + s2, R('#8a6a3a')[3], 0.6);
    p.blob(16.5, 8.5 + s2, 4.2, 4.2, sk);
    p.blob(16.5, 12 + s2, 4.4, 2.6, R('#8a4a2a'), { lift: -0.05 });
    p.eye(15.5, 8 + s2, '#ffd06a'); p.eye(18.5, 8 + s2, '#ffd06a');
    p.cap(10, 15 + s2, 7, 22, 2.2, 2, sk);
    p.cap(22, 15 + s2, 25, 20 + (f ? -2 : 0), 2.2, 2, sk);
    p.line(25, 20 + (f ? -2 : 0), 27, 12 + (f ? -2 : 0), R('#5a3a20')[2], 1);
    p.poly([25, 9 + (f ? -2 : 0), 30, 9 + (f ? -2 : 0), 30, 13 + (f ? -2 : 0), 25, 13 + (f ? -2 : 0)], R('#5a5a64'), { lift: 0.1 });
  },
  npc_ysolde: (p, f) => robed(p, f, { robe: '#2a3a5a', hood: '#bfe0f0', skin: '#e0d0c0', head: 'cap', eyes: '#6fd0ff', trim: '#e0c070', staff: { wood: '#5a3a20', top: 'book', glow: '#e2cfa2' },
    extra: (q, g) => { const b = g ? 0.5 : 0; q.line(15, 9 + b, 20, 9 + b, R('#c8c8d0')[3], 0.5); q.blob(15.5, 9 + b, 1, 1, R('#c8c8d0'), { edge: false, lift: 0.3 }); q.blob(19, 9 + b, 1, 1, R('#c8c8d0'), { edge: false, lift: 0.3 }); } }),
  npc_hesk: (p, f) => robed(p, f, { robe: '#6a4a2a', hood: '#8a6a3a', skin: '#c8a080', head: 'cap', eyes: '#6fd0ff', eyeS: 1.4, trim: '#d9a845', hem: 30, staff: { wood: '#5a5a64', top: 'none', glow: '#6fd0ff' },
    extra: (q, g) => { const b = g ? 0.5 : 0; q.line(14.5, 7.5 + b, 21, 7.5 + b, R('#3a2a1a')[1], 0.8); q.blob(17, 8.3 + b, 1.6, 1.6, R('#d9a845'), { lift: 0.2 }); q.blob(20, 8.3 + b, 1.6, 1.6, R('#d9a845'), { lift: 0.2 }); q.eye(17, 8.3 + b, '#6fd0ff', 1.1); q.eye(20, 8.3 + b, '#6fd0ff', 1.1);
      q.line(24, 6, 24, 3, R('#9a9aa8')[3], 1); q.poly([22, 1, 26, 1, 26, 3, 22, 3], R('#9a9aa8')); for (let i = 0; i < 6; i++) q.dot(10 + Math.cos(i + g) * 2, 22 + Math.sin(i + g) * 2, R('#d9a845')[3], 0.7); } }),
  npc_vell: (p, f) => robed(p, f, { robe: '#e8e0d8', hood: '#7a1a2a', skin: '#e0c8b8', head: 'veil', face: '#2a1418', eyes: '#ffd060', trim: '#a8202a', staff: { wood: '#c8a040', top: 'none', glow: '#ffd060' },
    extra: (q, g) => { q.poly([22, 6 - g * 0.5, 26, 6 - g * 0.5, 27, 11 - g * 0.5, 21, 11 - g * 0.5, 22.5, 7.5 - g * 0.5], R('#c8a040'), { lift: 0.15 }); q.dot(23.6, 4.8 - g * 0.5, R('#c8a040')[1], 1); } }),
  npc_wanderer: (p, f) => robed(p, f, { robe: '#c8c8d0', hood: '#e8e8f0', head: 'hood', face: '#0a0a10', eyes: '#ffffff', staff: { wood: '#9a9aa8', top: 'book', glow: '#f8f8ff' },
    extra: (q, g) => { for (let i = 0; i < 3; i++) q.poly([6 + i * 2, 12 + i * 5 - g, 9 + i * 2, 12 + i * 5 - g, 9 + i * 2, 15 + i * 5 - g, 6 + i * 2, 15 + i * 5 - g], R('#f0ece0'), { lift: 0.2 }); } }),
  thief: (p, f) => {
    const s = sw(f), cl = R('#3a4a2a'), sk = R('#8aa05a'), b = f ? 0.5 : 0;
    p.blob(10, 16 + b, 6, 6.5, R('#8a6a3a'));
    p.line(7, 12 + b, 12, 20 + b, R('#5a3a1a')[1], 0.6);
    for (const [x, y] of [[8, 11], [11, 10.5], [9.5, 9.5]]) p.blob(x, y + b, 1.1, 1.1, R('#ffd06a'), { lift: 0.25 });
    p.dot(9, 9 + b - f, R('#fff0a0')[4], 0.8, true);
    p.cap(15, 23, 13 - s * 2, 30, 1.4, 1.1, sk); p.cap(19, 23, 21 + s * 2, 30, 1.4, 1.1, sk);
    p.poly([13, 14 + b, 21, 14 + b, 22, 25, 12, 25], cl);
    p.blob(18, 11 + b, 4.5, 4.4, cl);
    p.blob(19.5, 12 + b, 2.6, 2.4, R('#0e120a'), { shade: 0.1, edge: false });
    p.eye(19, 12 + b, '#ffd06a'); p.eye(21, 12 + b, '#ffd06a');
    p.cap(22, 12.5 + b, 26, 11 + b, 1.2, 0.4, sk);
    p.cap(14, 16 + b, 11, 14 + b, 1.2, 1, sk);
    p.cap(20, 17 + b, 24, 19 + s, 1.2, 1, sk);
  },
  sporecaller: (p, f) => robed(p, f, { robe: '#4a2a5a', hood: '#7a3a6a', head: 'shroom', skin: '#c8b8c0', eyes: '#7ae0c0', trim: '#7ae0c0', staff: { wood: '#5a3a4a', top: 'orb', glow: '#7ae0c0' },
    extra: (q, g) => { for (const [x, y] of [[8, 16], [24, 24], [6, 23], [26, 12]]) q.dot(x, y - g * 1.5, R('#7ae0c0')[4], 1, true); } }),
};

function urn(p: Painter, body: string, glow: string) {
  const b = R(body);
  p.blob(16, 21, 7, 7.5, b);
  p.poly([12, 13, 20, 13, 19, 15, 13, 15], b, { lift: 0.1 });
  p.poly([11, 11, 21, 11, 20.5, 13, 11.5, 13], b, { lift: 0.2 });
  p.line(10, 21, 22, 21, R(glow)[3], 0.8, true);
  p.blob(14, 18, 1.5, 2, R(body), { lift: 0.4, edge: false });
  p.dot(16, 9, R(glow)[4], 1, true);
}
function robedMini(p: Painter, f: number, x: number, s: number, lift: number) {
  const r = R('#7a1a2a');
  p.poly([x - 3.5 * s, 14, x + 3.5 * s, 14, x + 6 * s, 30, x - 6 * s, 30], r, { lift });
  p.blob(x, 11, 3.5 * s, 3.7 * s, r, { lift });
  p.eye(x + 0.6, 11.5, '#ffd060');
  p.line(x - 3, 9 - f, x + 3, 9 - f, R('#ffd060')[3], 0.5, true);
}

/** Creatures shown big (bosses): painted at 48px so they keep their detail. */
export const BIG = new Set(['stag', 'warden', 'lich', 'orrery', 'choir', 'king', 'unwritten', 'queen', 'mother', 'thornmaw', 'bloom', 'swarm', 'star']);
/** Paint frame f of creature `key` at resolution R. */
export function paintCreature(key: string, f: number, Rz: number): HTMLCanvasElement | null {
  return paintCreatureLit(key, f, Rz, false)?.canvas ?? null;
}
/** A creature and (optionally) its eight rim-light maps. */
export function paintCreatureLit(key: string, f: number, Rz: number, withRims = true): { canvas: HTMLCanvasElement; rims: HTMLCanvasElement[] } | null {
  const fn = CREATURES[key];
  if (!fn) return null;
  const p = new Painter(Rz);
  fn(p, f);
  return { canvas: p.canvas(), rims: withRims ? p.rims() : [] };
}
export type { RGB };

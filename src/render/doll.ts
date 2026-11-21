// The paper doll: paints a 16×16 spellwright from layers (staff, body and outfit, head and race
// features, hair, beard, headwear), then outlines it. Every look in sim/character.ts maps to pixels here.

import { BUILDS, EYES, HAIR_COLORS, ORBS, RACES, ROBES, ROBES_HI, TRIMS } from '../sim/character';
import type { Look } from '../sim/types';

type Grid = (string | null)[][];
const N = 16;

/** Darken (k<1) or lighten (k>1) a #rrggbb colour. */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(k >= 1 ? c + (255 - c) * (k - 1) : c * k)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('')}`;
}

export function paintDoll(look: Look): { p: Record<string, string>; r: string[] } {
  const g: Grid = Array.from({ length: N }, () => Array<string | null>(N).fill(null));
  const px = (x: number, y: number, c: string) => { if (x >= 0 && x < N && y >= 0 && y < N) g[y][x] = c; };
  const rect = (x: number, y: number, w: number, h: number, c: string) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
  const row = (y: number, x0: number, x1: number, c: string) => { for (let x = x0; x <= x1; x++) px(x, y, c); };

  const race = RACES[look.race] ?? RACES[0];
  const skin = race.skins[Math.min(look.skin, race.skins.length - 1)];
  const skinD = shade(skin, 0.78);
  const hair = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0];
  const hairD = shade(hair, 0.7);
  const hairH = shade(hair, 1.25);
  const main = ROBES[look.robe] ?? ROBES[0];
  const mainHi = ROBES_HI[look.robe] ?? ROBES_HI[0];
  const mainD = shade(main, 0.7);
  const trim = TRIMS[look.trim] ?? TRIMS[0];
  const orb = ORBS[look.orb] ?? ORBS[0];
  const eye = EYES[look.eyes] ?? EYES[0];
  const metal = '#8c8c96', metalH = '#c4c4cc', metalD = '#5a5a64';
  const boot = '#2a1c14', leather = '#6a4a2a', leatherH = '#8a643a', bone = '#e4dcc4';
  const build = BUILDS[look.build] ?? 'Lean';
  const short = !!race.short;

  const ht = short ? 5 : 3; // head top row
  const sh = ht + 5; // shoulder row
  const waist = short ? sh + 2 : sh + 3;

  // ---- staff (held in the left hand, orb on top)
  const st = ht - 2;
  for (let y = st; y <= 14; y++) px(4, y, y % 3 === 0 ? '#4a321e' : '#6b4a2b');
  px(4, st - 1, orb); px(3, st, orb); px(5, st, orb); px(4, st, shade(orb, 1.4)); px(4, st - 2, shade(orb, 0.8));

  // ---- body silhouette (shoulder and torso widths by build)
  const span = (y: number): [number, number] => {
    const k = y - sh;
    switch (build) {
      case 'Broad': return k === 0 ? [6, 13] : [7, 12];
      case 'Curvy': return k === 0 ? [7, 12] : y === waist ? [8, 11] : y > waist ? [7, 12] : [7, 12];
      case 'Stout': return [6, 13];
      default: return k === 0 ? [7, 12] : [8, 11];
    }
  };
  const legsTop = short ? 13 : 13;

  // ---- outfit
  const outfit = look.outfit;
  const fill = (y0: number, y1: number, c: string, hi?: string, flare = 0) => {
    for (let y = y0; y <= y1; y++) {
      let [a, b] = span(Math.min(y, waist + 1));
      if (flare && y > waist) { const f = Math.min(flare, y - waist); a -= f; b += f; }
      row(y, a, b, c);
      if (hi) px(b, y, hi);
    }
  };
  const legs = (c: string, cH?: string) => { rect(8, legsTop, 2, 2, c); rect(10, legsTop, 2, 2, cH ?? c); };
  const feet = (c: string) => { row(15, 7, 9, c); row(15, 10, 12, c); };
  switch (outfit) {
    case 1: // gown
      fill(sh, 14, main, mainHi, 2);
      px(9, sh, skin); px(10, sh, skin);
      row(waist, span(waist)[0], span(waist)[1], trim);
      row(14, 6, 13, mainD);
      feet(boot);
      break;
    case 2: // cloak and tunic
      fill(sh, legsTop - 1, trim === '#1a1a1a' ? '#5a4a3a' : shade(trim, 0.85));
      legs('#3a3036', '#2a2228');
      feet(boot);
      for (let y = sh; y <= 14; y++) { const [a, b] = span(Math.min(y, waist)); px(a - 1, y, main); px(a, y, main); px(b, y, mainHi); px(b + 1, y, main); }
      row(waist, 8, 11, leather);
      break;
    case 3: { // plate armour
      fill(sh, legsTop - 1, metal, metalH);
      const [a, b] = span(sh); px(a - 1, sh, metalH); px(b + 1, sh, metalH); px(a - 1, sh + 1, metal); px(b + 1, sh + 1, metal);
      for (let y = sh + 1; y <= legsTop; y++) { px(9, y, main); px(10, y, mainHi); }
      row(waist, 8, 11, metalD);
      legs(metal, metalD);
      feet(metalD);
      break;
    }
    case 4: // leather jerkin
      fill(sh, legsTop - 1, leather, leatherH);
      { const [a, b] = span(sh + 1); px(a, sh + 1, main); px(b, sh + 1, mainHi); px(a, sh + 2, main); px(b, sh + 2, mainHi); }
      row(waist, 8, 11, trim);
      legs(mainD, main);
      feet(boot);
      break;
    case 5: // long coat
      fill(sh, 14, main, mainHi, 1);
      for (let y = sh; y <= waist; y++) { px(9, y, '#d8d0c0'); px(10, y, '#c8c0b0'); }
      px(9, sh + 1, trim); px(9, sh + 3, trim);
      for (let y = waist + 1; y <= 14; y++) { px(9, y, '#2a2228'); px(10, y, '#3a3036'); }
      feet(boot);
      break;
    case 6: // monk wrap
      fill(sh, 14, main, mainHi, 1);
      for (let i = 0; i < 5; i++) px(8 + i, sh + i, trim);
      row(14, 8, 11, mainD);
      row(15, 8, 9, skin); row(15, 10, 11, skin);
      break;
    case 7: // rags
      fill(sh, 14, shade(main, 0.85), main, 1);
      px(8, sh + 2, trim); px(11, waist + 1, trim);
      for (let x = 6; x <= 13; x += 2) px(x, 14, null as unknown as string);
      row(15, 8, 9, skin); row(15, 10, 11, skin);
      break;
    default: // robe
      fill(sh, 14, main, mainHi, 1);
      row(waist, span(waist)[0], span(waist)[1], trim);
      px(9, 14, trim); px(10, 14, trim);
      feet(boot);
  }
  if (outfit === 7) for (let x = 6; x <= 13; x += 2) g[14][x] = null;

  // ---- arm holding the staff, and the hand
  const sleeve = outfit === 3 ? metal : outfit === 4 ? main : outfit === 2 ? main : main;
  px(6, sh + 1, sleeve); px(5, sh + 2, sleeve); px(5, sh + 3, skin);

  // ---- head and race features
  rect(7, ht, 6, 5, skin);
  px(12, ht + 1, skinD); px(12, ht + 2, skinD); px(12, ht + 3, skinD);
  if (build === 'Stout' || race.name === 'Dwarf' || race.name === 'Orc') row(ht + 4, 7, 12, skin);
  else { px(7, ht + 4, null as unknown as string); px(12, ht + 4, null as unknown as string); g[ht + 4][7] = null; g[ht + 4][12] = null; }
  switch (race.name) {
    case 'Elf':
      px(6, ht + 2, skin); px(6, ht + 1, skin); px(5, ht, skinD);
      px(13, ht + 2, skinD); px(14, ht + 1, skinD); px(15, ht, skinD);
      break;
    case 'Orc':
      px(6, ht + 2, skin); px(13, ht + 2, skinD);
      px(8, ht + 4, bone); px(11, ht + 4, bone); px(8, ht + 3, bone); px(11, ht + 3, bone);
      break;
    case 'Tiefling':
      px(6, ht + 2, skin); px(13, ht + 2, skinD);
      px(7, ht - 1, '#2a1a20'); px(6, ht - 2, '#3a2a30'); px(6, ht - 1, '#2a1a20');
      px(12, ht - 1, '#2a1a20'); px(13, ht - 2, '#3a2a30'); px(13, ht - 1, '#2a1a20');
      break;
    case 'Revenant':
      px(6, ht + 2, skin); px(13, ht + 2, skinD);
      px(8, ht + 3, skinD); px(11, ht + 3, skinD); row(ht + 4, 8, 11, skinD);
      break;
    case 'Dragonborn':
      row(ht + 3, 7, 12, shade(skin, 1.25)); row(ht + 4, 8, 11, shade(skin, 1.25));
      px(9, ht + 3, skinD); px(10, ht + 3, skinD);
      px(6, ht, skinD); px(13, ht, skinD); px(6, ht - 1, bone); px(13, ht - 1, bone);
      px(8, ht, shade(skin, 1.2)); px(11, ht + 1, shade(skin, 1.2));
      break;
    default:
      px(6, ht + 2, skin); px(13, ht + 2, skinD);
  }
  // eyes (revenants glow)
  const eyeC = race.name === 'Revenant' ? shade(eye, 1.3) : eye;
  px(8, ht + 2, eyeC); px(11, ht + 2, eyeC);

  // ---- hair
  const hs = look.hair;
  const top = () => row(ht, 7, 12, hair);
  const shortTop = () => { top(); row(ht - 1, 8, 11, hair); px(11, ht - 1, hairH); px(7, ht + 1, hair); px(12, ht + 1, hairD); };
  switch (hs) {
    case 1: top(); px(9, ht, hairH); break; // cropped
    case 2: shortTop(); break; // short
    case 3: shortTop(); for (let y = ht + 1; y <= ht + 6; y++) { px(6, y, hair); px(7, y, y > ht + 4 ? hair : g[y][7] ?? hair); px(13, y, hairD); } px(7, ht + 2, hair); px(12, ht + 2, hairD); px(12, ht + 3, hairD); break;
    case 4: shortTop(); for (let y = ht + 1; y <= ht + 5; y++) px(13 + (y % 2), y, y % 2 ? hairD : hair); px(13, ht, hair); break; // ponytail
    case 5: shortTop(); for (let y = ht + 2; y <= ht + 7; y++) { px(6, y, y % 2 ? hair : hairD); px(13, y, y % 2 ? hairD : hair); } break; // braids
    case 6: shortTop(); rect(9, ht - 3, 2, 2, hair); px(10, ht - 3, hairH); break; // bun
    case 7: rect(9, ht - 2, 2, 3, hair); px(10, ht - 2, hairH); px(8, ht, skinD); px(11, ht, skinD); break; // mohawk
    case 8: row(ht - 1, 6, 13, hair); top(); px(7, ht - 2, hair); px(9, ht - 2, hairH); px(11, ht - 2, hair); px(13, ht - 2, hairD); px(6, ht + 1, hair); px(13, ht + 1, hairD); px(6, ht + 2, hairD); break; // wild
    case 9: row(ht - 1, 7, 12, hair); row(ht - 2, 8, 11, hairD); top(); for (let y = ht; y <= ht + 3; y++) { px(6, y, y % 2 ? hair : hairD); px(13, y, y % 2 ? hairD : hair); } px(9, ht - 1, hairH); break; // curly
    case 10: shortTop(); row(ht + 1, 7, 9, hair); px(8, ht + 1, hairH); break; // side-swept
    case 11: shortTop(); for (let y = ht + 1; y <= ht + 5; y++) { px(5, y, y % 2 ? hair : hairD); px(14, y, y % 2 ? hairD : hair); } px(6, ht + 1, hair); px(13, ht + 1, hairD); break; // twin tails
    default: break; // bald
  }

  // ---- beard
  switch (look.beard) {
    case 1: px(8, ht + 4, skinD); px(10, ht + 4, skinD); px(9, ht + 3, skinD); px(11, ht + 3, skinD); break;
    case 2: row(ht + 3, 8, 11, hair); px(8, ht + 4, hairD); px(11, ht + 4, hairD); break;
    case 3: px(9, ht + 3, hair); px(10, ht + 3, hair); px(9, ht + 4, hair); px(10, ht + 4, hairD); px(9, ht + 5, hairD); break;
    case 4: row(ht + 3, 7, 12, hair); px(9, ht + 3, skinD); px(10, ht + 3, skinD); row(ht + 4, 7, 12, hair); row(ht + 5, 8, 11, hairD); break;
    case 5: row(ht + 3, 7, 12, hair); px(9, ht + 3, skinD); px(10, ht + 3, skinD); row(ht + 4, 7, 12, hair); row(ht + 5, 8, 11, hair); row(ht + 6, 8, 11, hairD); row(ht + 7, 9, 10, hairD); break;
    case 6: row(ht + 3, 7, 12, hair); px(9, ht + 3, skinD); px(10, ht + 3, skinD); row(ht + 4, 7, 12, hair); row(ht + 5, 8, 11, hairD); for (let y = ht + 6; y <= ht + 8; y++) { px(9, y, y % 2 ? hair : hairD); px(10, y, y % 2 ? hairD : hair); } px(9, ht + 8, trim); break;
    default: break;
  }

  // ---- headwear
  switch (look.head) {
    case 1: // deep hood
      row(ht - 1, 7, 12, main); row(ht, 6, 13, main); px(12, ht - 1, mainHi);
      for (let y = ht + 1; y <= ht + 4; y++) { px(6, y, main); px(13, y, mainD); }
      row(ht, 7, 12, mainD); px(7, ht + 1, mainD); px(12, ht + 1, mainD);
      px(8, ht + 1, skinD); px(9, ht + 1, skinD); px(10, ht + 1, skinD); px(11, ht + 1, skinD);
      break;
    case 2: // pointed hat
      row(ht, 5, 14, main); px(14, ht, mainD); row(ht - 1, 7, 12, trim); row(ht - 2, 8, 11, main); px(11, ht - 2, mainHi);
      row(ht - 3, 9, 10, main); px(11, ht - 4, main); px(12, ht - 5, mainHi);
      break;
    case 3: // wide-brim hat
      row(ht, 4, 15, mainD); row(ht - 1, 7, 12, trim); rect(7, ht - 3, 6, 2, main); px(12, ht - 3, mainHi);
      break;
    case 4: // circlet
      row(ht + 1, 7, 12, trim); px(9, ht + 1, orb); px(10, ht + 1, orb);
      break;
    case 5: // iron helm
      row(ht - 1, 8, 11, metal); row(ht, 7, 12, metal); px(11, ht - 1, metalH);
      px(7, ht + 1, metal); px(12, ht + 1, metalD); px(9, ht + 1, metalD); px(10, ht + 1, metalD); px(9, ht + 2, metalD); px(10, ht + 2, metalD);
      break;
    case 6: // horned helm
      row(ht - 1, 8, 11, metal); row(ht, 7, 12, metal); px(11, ht - 1, metalH);
      px(7, ht + 1, metal); px(12, ht + 1, metalD);
      px(6, ht - 1, bone); px(5, ht - 2, bone); px(5, ht - 3, shade(bone, 0.8)); px(13, ht - 1, bone); px(14, ht - 2, bone); px(14, ht - 3, shade(bone, 0.8));
      break;
    case 7: // bone crown
      row(ht, 7, 12, bone); px(7, ht - 1, bone); px(9, ht - 1, shade(bone, 0.85)); px(10, ht - 2, bone); px(10, ht - 1, bone); px(12, ht - 1, bone); px(10, ht, '#a3202a');
      break;
    default: break;
  }

  // ---- outline every shape
  const OUT = '#0d0a0d';
  const solid = g.map((r) => r.map((c) => c !== null));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (solid[y][x]) continue;
    if ((y > 0 && solid[y - 1][x]) || (y < N - 1 && solid[y + 1][x]) || (x > 0 && solid[y][x - 1]) || (x < N - 1 && solid[y][x + 1])) g[y][x] = OUT;
  }

  // ---- to palette rows
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  const p: Record<string, string> = {};
  const idx = new Map<string, string>();
  const r = g.map((rw) => rw.map((c) => {
    if (!c) return '.';
    let ch = idx.get(c);
    if (!ch) { ch = chars[idx.size] ?? 'z'; idx.set(c, ch); p[ch] = c; }
    return ch;
  }).join(''));
  return { p, r };
}

// High-resolution heroes: every playable Kindled, painted at 64x64 from a look (race, build, hair,
// beard, outfit, colours, headwear) and an optional class kit (weapon, aura, extras), with a
// four-frame walk cycle and a casting pose. Authored in the painter's 32-unit space.
import { BUILDS, EYES, HAIR_COLORS, ORBS, RACES, ROBES, ROBES_HI, TRIMS } from '../sim/character';
import type { Look } from '../sim/types';
import { C, Painter, ramp as R, type RGB } from './paint';

export interface Kit {
  weapon: 'staff' | 'sword' | 'tome' | 'scythe' | 'rod' | 'lantern';
  aura?: 'embers' | 'frost' | 'sparks' | 'void' | 'runes' | 'bones';
  cape?: string; mask?: boolean; hollow?: boolean;
}
export const HERO_RES = 64;
const W = C('#ffffff');

/** Paint a hero. f = 0..3 walk frames; f = 4 is the casting pose. */
export function paintHero(look: Look, f: number, kit: Kit = { weapon: 'staff' }, res = HERO_RES): HTMLCanvasElement {
  const p = new Painter(res);
  hero(p, look, f, kit);
  return p.canvas();
}
export function paintHeroRims(look: Look, kit: Kit, res = HERO_RES): HTMLCanvasElement[] {
  const p = new Painter(res);
  hero(p, look, 0, kit);
  return p.rims();
}

function hero(p: Painter, look: Look, f: number, kit: Kit) {
  const race = RACES[look.race] ?? RACES[0];
  const rname = race.name;
  const short = !!race.short;
  const build = BUILDS[look.build] ?? 'Lean';
  const skinHex = race.skins[Math.min(look.skin, race.skins.length - 1)];
  const skin = R(skinHex), hairHex = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0], hair = R(hairHex);
  const robeHex = ROBES[look.robe] ?? ROBES[0], robe = R(robeHex), robeHi = R(ROBES_HI[look.robe] ?? ROBES_HI[0]);
  const trim = R(TRIMS[look.trim] ?? TRIMS[0]), orbHex = ORBS[look.orb] ?? ORBS[0], orb = R(orbHex);
  const eyeHex = EYES[look.eyes] ?? EYES[0];
  const metal = R('#8c8c9a'), leather = R('#6a4a2a'), boot = R('#2a1c14'), bone = R('#e4dcc4');
  const cast = f === 4;
  const ph = (f % 4) / 4 * Math.PI * 2;
  const step = cast ? 0 : Math.sin(ph), bob = cast ? 0 : Math.abs(Math.cos(ph)) * 0.6;
  // proportions: short races are squat, builds change the width
  const hs = short ? 0.8 : 1, ws = build === 'Broad' ? 1.14 : build === 'Stout' ? 1.2 : build === 'Curvy' ? 1.04 : 1;
  const Y = (y: number) => 30.5 - (30.5 - y) * hs - bob;
  const X = (x: number) => 15.5 + (x - 15.5) * ws;
  const outfit = look.outfit;
  const longHem = outfit === 0 || outfit === 1 || outfit === 6; // robe, gown, monk wrap
  const hem = outfit === 1 ? 29.5 : outfit === 5 ? 27 : longHem ? 27.5 : 23.5;

  // ---- behind everything: cape and aura glow
  if (kit.cape || outfit === 2) {
    const c = R(kit.cape ?? robeHex), sway = cast ? 2 : Math.sin(ph + 1) * 1.2;
    p.poly([X(12), Y(12.5), X(18), Y(12.5), X(15) - 3 - sway, Y(29.5), X(7) - sway, Y(30), X(8.5) - sway * 0.5, Y(27)], c, { lift: -0.2 });
    p.line(X(9) - sway, Y(29), X(14) - sway, Y(29.4), c[0], 0.6);
  }
  // the back arm (and the hand that holds nothing)
  const backArm = cast ? [X(13), Y(14), X(10), Y(19)] : [X(13), Y(14), X(11.5) - step * 1.5, Y(21)];
  p.cap(backArm[0], backArm[1], backArm[2], backArm[3], 1.7, 1.4, outfit === 3 ? metal : robe, { lift: -0.25 });
  // ---- legs and boots (walk cycle)
  const lx1 = X(14.2) - step * 2.2, lx2 = X(17.2) + step * 2.2;
  const legCol = outfit === 3 ? metal : outfit === 4 || outfit === 2 ? leather : R('#3a2e2a');
  p.cap(X(14.6), Y(21), lx1, Y(28.6), 1.5, 1.25, legCol, { lift: -0.2 });
  p.cap(X(16.8), Y(21), lx2, Y(28.6), 1.6, 1.3, legCol);
  p.blob(lx1 + 0.6, Y(29.4), 1.9, 1.1, outfit === 3 ? metal : boot, { lift: -0.1 });
  p.blob(lx2 + 0.8, Y(29.4), 2, 1.15, outfit === 3 ? metal : boot);

  // ---- torso and outfit
  const shoulder = build === 'Broad' || outfit === 3 ? 5.4 : build === 'Curvy' ? 4.4 : 4.6;
  const waist = build === 'Curvy' ? 3.2 : build === 'Stout' ? 4.6 : 3.8;
  const flare = outfit === 1 ? 8.5 : outfit === 0 ? 7 : outfit === 6 ? 6 : 4.6;
  const sx = 15.8;
  if (longHem || outfit === 5 || outfit === 7) {
    // a robe, gown, coat or rags: one flowing piece from the shoulders to the hem
    const jag = outfit === 7 ? 1.4 : 0.5;
    const pts = [X(sx - shoulder), Y(13), X(sx + shoulder), Y(13), X(sx + waist), Y(19.5), X(sx + flare), Y(hem), X(sx + flare - 2.5), Y(hem + jag), X(sx + 2), Y(hem - jag * (f % 2)), X(sx - 1.5), Y(hem + jag), X(sx - flare + 2), Y(hem - jag), X(sx - flare), Y(hem), X(sx - waist), Y(19.5)];
    p.poly(pts, robe);
    // folds that catch the light
    p.line(X(sx - 1.5), Y(17), X(sx - flare + 2.5), Y(hem - 0.5), robe[1], 0.55);
    p.line(X(sx + 1.8), Y(17), X(sx + flare - 2), Y(hem - 0.5), robe[1], 0.55);
    p.line(X(sx + 0.2), Y(15), X(sx + 0.5), Y(hem - 1), robeHi[3], 0.4);
    if (outfit === 5) { // a long coat: open down the front, with a collar
      p.poly([X(sx - 0.6), Y(19), X(sx + 1.6), Y(19), X(sx + 2.4), Y(hem), X(sx - 1.2), Y(hem)], R('#2a2220'));
      p.poly([X(sx - 3.5), Y(11.8), X(sx - 1), Y(14.5), X(sx + 1.5), Y(14.5), X(sx + 4), Y(11.8), X(sx + 3), Y(15.5), X(sx - 2.5), Y(15.5)], robeHi, { lift: 0.1 });
    }
    if (outfit === 6) p.line(X(sx - shoulder + 1), Y(13.5), X(sx + waist), Y(21), trim[3], 1.2); // monk's sash
    if (outfit === 7) for (let i = 0; i < 4; i++) p.dot(X(sx - 3 + i * 2.2), Y(16 + (i % 2) * 4), robe[0], 0.9); // patches and holes
  } else if (outfit === 3) {
    // plate: breastplate, faulds, pauldrons
    p.poly([X(sx - shoulder), Y(13), X(sx + shoulder), Y(13), X(sx + waist + 0.5), Y(21), X(sx - waist - 0.5), Y(21)], metal);
    p.blob(X(sx + 0.5), Y(16), 3.6 * ws, 3, metal, { lift: 0.2 });
    p.line(X(sx + 0.5), Y(13.5), X(sx + 0.5), Y(20.5), metal[1], 0.5);
    for (let i = 0; i < 3; i++) p.poly([X(sx - waist - 0.5 + i * 2.6), Y(21), X(sx - waist + 2 + i * 2.6), Y(21), X(sx - waist + 1.8 + i * 2.6), Y(24.5), X(sx - waist - 0.2 + i * 2.6), Y(24.5)], metal, { lift: -0.05 * i });
    p.blob(X(sx - shoulder + 0.5), Y(13.4), 2.6, 1.9, metal, { lift: 0.25 });
    p.blob(X(sx + shoulder - 0.3), Y(13.4), 2.7, 2, metal, { lift: 0.3 });
    p.line(X(sx - waist), Y(21), X(sx + waist + 0.5), Y(21), trim[3], 0.8);
  } else {
    // tunic or jerkin, belted
    p.poly([X(sx - shoulder), Y(13), X(sx + shoulder), Y(13), X(sx + waist + 0.6), Y(hem), X(sx - waist - 0.6), Y(hem)], outfit === 4 ? leather : robe);
    if (outfit === 4) { for (let i = 0; i < 3; i++) p.line(X(sx - 1), Y(14.5 + i * 2.2), X(sx + 2), Y(14.5 + i * 2.2), leather[0], 0.45); }
    p.line(X(sx + 0.4), Y(13.5), X(sx + 0.4), Y(hem - 0.5), (outfit === 4 ? leather : robe)[1], 0.5);
  }
  // belt and trim
  p.line(X(sx - waist), Y(19.8), X(sx + waist), Y(19.8), outfit === 3 ? leather[1] : trim[2], 1);
  p.dot(X(sx + 0.3), Y(19.4), trim[4], 0.9);
  if (longHem) p.line(X(sx - flare + 0.8), Y(hem - 0.6), X(sx + flare - 0.8), Y(hem - 0.6), trim[3], 0.7);
  // curvy and broad silhouettes
  if (build === 'Curvy') { p.blob(X(sx - 0.2), Y(15.8), 3, 1.6, robeHi, { lift: 0.05 }); }

  // ---- the head
  const hx = X(16.8), hy = Y(8.4);
  const hr = 3.7;
  // neck
  p.cap(hx - 0.6, hy + 3, hx - 0.4, Y(13), 1.1, 1.2, skin, { lift: -0.25 });
  if (rname === 'Dragonborn') {
    p.blob(hx, hy, hr * 1.02, hr * 0.95, skin);
    p.cap(hx + 1, hy + 1.2, hx + 5, hy + 1.8, 2.2, 1.5, skin, { lift: 0.05 }); // snout
    for (let i = 0; i < 4; i++) p.line(hx - 2 + i, hy - 2.5 + (i % 2), hx - 1.5 + i, hy - 1.8 + (i % 2), skin[1], 0.4);
    p.dot(hx + 4.8, hy + 1, skin[0], 0.6);
    p.cap(hx - 2, hy - 2.5, hx - 5, hy - 5.5, 0.9, 0.35, bone); // swept-back horns
  } else {
    p.blob(hx, hy, hr, hr * 1.05, skin);
    p.blob(hx + 2.3, hy + 2.4, 1.6, 1.3, skin, { lift: -0.05 }); // jaw
    p.dot(hx + 3.5, hy + 0.6, skin[1], 0.7); // nose
  }
  if (rname === 'Orc') { p.blob(hx + 1.5, hy + 3.1, 2.6, 1.5, skin, { lift: 0.05 }); p.line(hx + 1.8, hy + 3.6, hx + 2.2, hy + 1.9, bone[4], 0.6); p.line(hx + 3.6, hy + 3.6, hx + 3.9, hy + 2.1, bone[4], 0.6); }
  if (rname === 'Elf') { p.poly([hx - 1.8, hy - 0.5, hx - 6, hy - 3.2, hx - 2.2, hy + 1], skin, { lift: 0.05 }); }
  if (rname === 'Tiefling') { p.cap(hx - 0.5, hy - 3, hx - 2.5, hy - 7.2, 1.1, 0.4, R('#2a1a20')); p.cap(hx + 1.5, hy - 3, hx + 2.6, hy - 6.8, 1, 0.35, R('#2a1a20')); }
  if (rname === 'Revenant' || kit.hollow) { p.line(hx - 1.5, hy + 0.5, hx + 1, hy + 2.5, skin[0], 0.35); p.line(hx - 0.5, hy - 2, hx + 0.3, hy - 0.5, skin[0], 0.35); }
  // eyes
  const eyeX = hx + 1.6, eyeY = hy - 0.2;
  if (kit.hollow) { p.blob(eyeX, eyeY, 1.1, 0.9, R('#0a0612'), { shade: 0, edge: false }); p.eye(eyeX, eyeY - 0.2, eyeHex, 1); p.eye(eyeX + 2, eyeY - 0.2, eyeHex, 0.8); }
  else { p.dot(eyeX - 0.4, eyeY - 0.5, W, 1.1); p.dot(eyeX + 0.1, eyeY - 0.2, R(eyeHex)[2], 0.7); p.dot(eyeX + 2, eyeY - 0.3, R(eyeHex)[1], 0.6); p.line(eyeX - 0.8, eyeY - 1.5, eyeX + 0.9, eyeY - 1.7, hair[1], 0.4); }
  // hair (beneath headwear)
  const style = look.hair, head = look.head;
  const hidden = head === 1 || head === 5 || head === 6; // hoods and helms hide most hair
  if (!hidden && style > 0) {
    const sway = cast ? 1 : Math.sin(ph) * 0.6;
    const top = (lift = 0.05) => { p.blob(hx - 1.6, hy - 2.3, hr * 0.95, 2.1, hair, { lift }); p.blob(hx - 2.6, hy - 0.4, 2, 2.8, hair, { lift: lift - 0.12 }); };
    switch (style) {
      case 1: p.blob(hx - 1.6, hy - 2.4, hr * 0.9, 1.7, hair, { lift: 0.05 }); break; // cropped
      case 2: top(); p.poly([hx - 4, hy - 1, hx - 2, hy - 1, hx - 3.5, hy + 2.5], hair); break; // short
      case 3: top(); p.poly([hx - 4.2, hy - 1.5, hx - 1, hy - 1, hx - 2.2 - sway, Y(16), hx - 5 - sway, Y(15.5)], hair); break; // long
      case 4: top(); p.cap(hx - 3.5, hy - 1, hx - 6 - sway, hy + 5, 1.3, 0.9, hair); break; // ponytail
      case 5: top(); for (const o of [0, 1.6]) for (let i = 0; i < 4; i++) p.blob(hx - 3.6 + o * 0.4 - sway * 0.3, hy + 0.5 + i * 1.6 + o * 0.5, 0.9, 0.8, hair, { lift: (i % 2) * 0.15 }); break; // braids
      case 6: top(); p.blob(hx - 2.5, hy - 4.2, 1.9, 1.8, hair, { lift: 0.1 }); break; // bun
      case 7: p.poly([hx - 3, hy - 2, hx + 2, hy - 2.5, hx + 1, hy - 6.5, hx - 1, hy - 7, hx - 3, hy - 5.5], hair, { lift: 0.1 }); break; // mohawk
      case 8: for (let i = 0; i < 7; i++) { const a = -2.6 + i * 0.45; p.cap(hx - 0.5, hy - 1.5, hx - 0.5 + Math.cos(a) * 5.2, hy - 1.5 + Math.sin(a) * 4.2 + sway * 0.3, 1.3, 0.5, hair); } break; // wild
      case 9: for (let i = 0; i < 7; i++) { const a = -3 + i * 0.5; p.blob(hx - 0.5 + Math.cos(a) * 3.2, hy - 1 + Math.sin(a) * 3, 1.5, 1.4, hair, { lift: (i % 2) * 0.1 }); } break; // curly
      case 10: top(); p.poly([hx - 1, hy - 3, hx + 4.5, hy - 1.5, hx + 1, hy - 0.5], hair, { lift: 0.15 }); break; // side-swept
      case 11: top(); for (const o of [-1, 1]) p.cap(hx - 0.5 + o * 2.6, hy - 2, hx + o * 3.5 - sway, hy + 4, 1.1, 0.8, hair); break; // twin tails
    }
    p.line(hx - 3, hy - 3.6, hx, hy - 4, hair[4], 0.4); // a shine
  }
  // beard
  if (look.beard > 0 && !kit.mask) {
    const b = look.beard;
    if (b === 1) for (let i = 0; i < 6; i++) p.dot(hx + 1 + (i % 3) * 0.9, hy + 2.3 + Math.floor(i / 3) * 0.8, hair[1], 0.5);
    if (b === 2) p.cap(hx + 1.6, hy + 1.9, hx + 4, hy + 2.1, 0.6, 0.5, hair);
    if (b === 3) p.poly([hx + 2, hy + 2.6, hx + 3.6, hy + 2.6, hx + 2.8, hy + 4.8], hair);
    if (b >= 4) { const L = b === 4 ? 2.6 : 5; p.poly([hx - 0.5, hy + 0.8, hx + 4, hy + 1.4, hx + 3.2, hy + 2.5 + L, hx + 1, hy + 3 + L, hx - 0.2, hy + 2], hair, { lift: 0.05 }); if (b === 6) for (let i = 0; i < 3; i++) p.dot(hx + 1.8, hy + 4 + i * 1.5, trim[3], 0.6); p.cap(hx + 1.6, hy + 1.9, hx + 4, hy + 2.1, 0.6, 0.5, hair); }
  }
  // headwear
  const hw = (ry: number) => hy + ry;
  switch (head) {
    case 1: { // deep hood
      p.blob(hx - 0.3, hw(-0.3), hr + 1.4, hr + 1.6, robe, { lift: 0.05 });
      p.blob(hx + 1.6, hw(0.6), 2.6, 3, R('#0e0a10'), { shade: 0.08, edge: false });
      p.eye(eyeX + 0.2, eyeY + 0.4, eyeHex, 0.8); p.eye(eyeX + 2, eyeY + 0.4, eyeHex, 0.6);
      p.poly([hx - 4.6, hw(1), hx - 2, hw(4.5), hx - 4.8, hw(5.5)], robe, { lift: -0.1 });
      break;
    }
    case 2: p.poly([hx - 6.5, hw(-2.2), hx + 6, hw(-2.2), hx + 4.5, hw(-1.2), hx - 5, hw(-1.2)], robe); p.poly([hx - 3.6, hw(-2), hx + 3.2, hw(-2), hx + 1, hw(-7), hx - 2, hw(-11) + (cast ? 0 : Math.sin(ph) * 0.5), hx - 2.5, hw(-6)], robe, { lift: 0.05 }); p.line(hx - 3.4, hw(-2.8), hx + 3, hw(-2.8), trim[3], 0.8); break;
    case 3: p.poly([hx - 8, hw(-2), hx + 7.5, hw(-2), hx + 5, hw(-0.8), hx - 6, hw(-0.8)], robe); p.poly([hx - 3.8, hw(-2), hx + 3.5, hw(-2), hx + 3, hw(-5.5), hx - 3.2, hw(-5.5)], robe, { lift: 0.08 }); p.line(hx - 3.6, hw(-2.8), hx + 3.4, hw(-2.8), trim[3], 0.9); break;
    case 4: p.line(hx - 3.6, hw(-1.9), hx + 3.2, hw(-1.7), trim[3], 0.8); p.dot(hx + 2.6, hw(-2.3), orb[4], 1, true); break;
    case 5: case 6: { // iron helm, horned helm
      p.blob(hx - 0.2, hw(-0.6), hr + 0.9, hr + 0.6, metal, { lift: 0.1 });
      p.poly([hx + 0.5, hw(-0.8), hx + 4.6, hw(-0.6), hx + 4.6, hw(0.5), hx + 0.5, hw(0.3)], R('#140c10'), { shade: 0.05, edge: false });
      p.eye(eyeX + 0.6, hw(-0.1), eyeHex, 0.7);
      p.line(hx - 0.5, hw(-4.5), hx - 0.5, hw(3), metal[1], 0.4);
      if (head === 6) { p.cap(hx - 2.5, hw(-2.5), hx - 7, hw(-6.5), 1.2, 0.4, bone); p.cap(hx + 2, hw(-3), hx + 4.5, hw(-8), 1.1, 0.4, bone); }
      break;
    }
    case 7: for (let i = 0; i < 5; i++) p.poly([hx - 3.2 + i * 1.6, hw(-2.5), hx - 2.2 + i * 1.6, hw(-2.5), hx - 2.7 + i * 1.6, hw(-5.5 - (i % 2) * 1.5)], bone, { lift: 0.1 }); p.line(hx - 3.5, hw(-2.4), hx + 4.2, hw(-2.4), bone[2], 0.7); break;
  }
  if (kit.mask) { p.poly([hx + 0.4, hy + 1, hx + 4.6, hy + 1, hx + 4.2, hy + 4, hx + 0.8, hy + 4], R('#2a2a30'), { lift: 0.1 }); }

  // ---- the front arm and the weapon
  const handX = cast ? X(25) : X(21.5), handY = cast ? Y(14.5) : Y(19) + step * 0.4;
  p.cap(X(18.5), Y(14), handX - 1, handY, 1.8, 1.4, outfit === 3 ? metal : outfit === 4 ? leather : robe);
  if (outfit !== 3) p.line(X(18.5), Y(14.3), handX - 1.5, handY - 0.2, trim[2], 0.45);
  p.blob(handX, handY, 1.3, 1.2, outfit === 3 ? metal : skin);
  const glow = (x: number, y: number, s: number) => { p.blob(x, y, s, s, orb, { lift: 0.3, edge: false }); p.dot(x - s * 0.35, y - s * 0.35, W, Math.max(0.6, s * 0.4), true); };
  switch (kit.weapon) {
    case 'staff': {
      const top = cast ? [handX + 3, Y(6)] : [handX + 1.5, Y(4.5)];
      p.line(handX - 0.5, Y(29), top[0], top[1], R('#5a3a20')[2], 1.1);
      p.line(top[0] - 1.2, top[1] + 1, top[0] + 1.2, top[1] + 1, trim[3], 0.7);
      glow(top[0], top[1] - 1, cast ? 2.4 : 1.8);
      break;
    }
    case 'rod': { const top = [handX + 2.5, handY - 6]; p.line(handX, handY + 1, top[0], top[1], metal[3], 0.9); for (let i = 0; i < 3; i++) p.line(top[0], top[1], top[0] + (i - 1) * 1.6, top[1] - 2.5, orb[4], 0.5, true); glow(top[0], top[1], 1.3); break; }
    case 'sword': { const tip = cast ? [handX + 8, handY - 7] : [handX + 2, Y(3)]; p.line(handX, handY, tip[0], tip[1], R('#d8d8e0')[3], 1.3); p.line(handX + 0.3, handY - 0.4, tip[0], tip[1], W, 0.4); p.line(handX - 2, handY + 1.2, handX + 2, handY - 1.2, trim[3], 0.9); if (cast) glow(tip[0], tip[1], 1.4); break; }
    case 'scythe': { const top = [handX + 1, Y(4)]; p.line(handX - 1, Y(28), top[0], top[1], R('#3a2a2a')[2], 1); for (let i = 0; i < 8; i++) { const a = -0.4 - i * 0.22; p.dot(top[0] + Math.cos(a) * -6 + 6 * 0, top[1] + 0.5 - Math.sin(-i * 0.22) * 0 + i * 0.15 - (i * i) * 0.03, R('#c8c8d8')[3], 0.9); } p.poly([top[0], top[1], top[0] - 8, top[1] + 1.5, top[0] - 6.5, top[1] + 0.2], R('#c8c8d8'), { lift: 0.2 }); glow(top[0], top[1], 1); break; }
    case 'tome': { p.poly([handX - 1, handY - 2, handX + 4, handY - 2.5, handX + 4.4, handY + 1.6, handX - 0.6, handY + 2], R(robeHex)); p.line(handX + 1.7, handY - 2.3, handX + 1.9, handY + 1.8, trim[3], 0.5); if (cast) for (let i = 0; i < 3; i++) p.dot(handX + 2 + i, handY - 4 - i * 1.4, orb[4], 0.8, true); break; }
    case 'lantern': { p.line(handX, handY, handX + 0.5, handY + 2.5, metal[2], 0.5); p.poly([handX - 1.5, handY + 2.5, handX + 2.5, handY + 2.5, handX + 2.2, handY + 6.5, handX - 1.2, handY + 6.5], R('#3a3a44')); p.blob(handX + 0.5, handY + 4.5, 1.2, 1.6, orb, { lift: 0.35, edge: false }); break; }
  }
  // ---- aura: what the class leaves in the air around it
  const t = f;
  const sparkle = (n: number, col: RGB[], spread: number, rise: number) => { for (let i = 0; i < n; i++) { const a = i * 2.39 + t * 0.9; p.dot(16 + Math.cos(a) * spread, 18 + Math.sin(a) * spread * 0.6 - ((t + i) % 4) * rise, col[3 + (i % 2)], 0.7, true); } };
  switch (kit.aura) {
    case 'embers': sparkle(5, R('#ff8a2a'), 10, 1.5); break;
    case 'frost': sparkle(5, R('#bfe8ff'), 11, -0.6); break;
    case 'sparks': for (let i = 0; i < 3; i++) { const a = i * 2.1 + t; const x0 = 16 + Math.cos(a) * 9, y0 = 15 + Math.sin(a) * 6; p.line(x0, y0, x0 + 1.5, y0 + 1.2, R('#d0c0ff')[4], 0.5, true); p.line(x0 + 1.5, y0 + 1.2, x0 + 0.5, y0 + 2.6, R('#d0c0ff')[4], 0.5, true); } break;
    case 'void': for (let i = 0; i < 4; i++) { const a = i * 1.57 + t * 0.6; p.blob(16 + Math.cos(a) * 10, 17 + Math.sin(a) * 7, 0.9, 0.9, R('#6a3aff'), { lift: 0.3, edge: false }); } break;
    case 'runes': for (let i = 0; i < 3; i++) { const a = i * 2.09 + t * 0.7, x = 16 + Math.cos(a) * 11, y = 16 + Math.sin(a) * 6; p.line(x - 0.8, y, x + 0.8, y, R('#b48cff')[4], 0.4, true); p.line(x, y - 1, x, y + 1, R('#b48cff')[4], 0.4, true); } break;
    case 'bones': for (let i = 0; i < 3; i++) { const a = i * 2.09 + t * 0.5; p.blob(16 + Math.cos(a) * 10, 17 + Math.sin(a) * 6, 0.9, 0.7, bone, { lift: 0.2 }); } break;
  }
  void C;
}

/** The six wizards of Cinderstorm: a fixed look and kit each. */
export const STORM_HEROES: Record<string, { look: Look; kit: Kit }> = {
  spellwright: { look: { race: 0, gender: 0, build: 0, skin: 2, hair: 3, hairColor: 6, beard: 5, eyes: 0, outfit: 0, robe: 0, trim: 0, head: 2, orb: 0 }, kit: { weapon: 'staff', aura: 'runes' } },
  pyromancer: { look: { race: 5, gender: 1, build: 2, skin: 0, hair: 8, hairColor: 9, beard: 0, eyes: 5, outfit: 1, robe: 8, trim: 5, head: 0, orb: 1 }, kit: { weapon: 'rod', aura: 'embers' } },
  frostbinder: { look: { race: 1, gender: 0, build: 0, skin: 3, hair: 3, hairColor: 6, beard: 0, eyes: 0, outfit: 2, robe: 1, trim: 4, head: 4, orb: 0 }, kit: { weapon: 'staff', aura: 'frost', cape: '#bfe0f0' } },
  graveknight: { look: { race: 6, gender: 0, build: 1, skin: 1, hair: 0, hairColor: 7, beard: 0, eyes: 2, outfit: 3, robe: 6, trim: 1, head: 6, orb: 2 }, kit: { weapon: 'sword', aura: 'bones', cape: '#2a3a2a' } },
  stormcaller: { look: { race: 0, gender: 1, build: 0, skin: 3, hair: 10, hairColor: 6, beard: 0, eyes: 7, outfit: 5, robe: 1, trim: 6, head: 4, orb: 4 }, kit: { weapon: 'rod', aura: 'sparks' } },
  hollowheir: { look: { race: 6, gender: 2, build: 0, skin: 4, hair: 0, hairColor: 0, beard: 0, eyes: 7, outfit: 7, robe: 6, trim: 6, head: 7, orb: 4 }, kit: { weapon: 'scythe', aura: 'void', cape: '#1a1020', hollow: true } },
};

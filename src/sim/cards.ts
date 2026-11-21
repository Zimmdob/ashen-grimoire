import type { Pt, Unit, WizardClass, World } from './types';
import { clearCurses, corrupt, curse, dist, emit, explode, heal, hurt, log, ownerState, sync, triggers } from './combat';
import { hasAffix } from './runes';
import { rand } from './rng';
import { findFreeNear, knockback } from './physics';
import { CREATURES, makeUnit, UNITS, unitName } from './units';
import { isWallAt, setTiles, tileAt } from './map';
import { T_BOG, T_FLOOR, T_ICE, T_LAVA, T_WALL, T_WATER } from './constants';

// Command pattern: every card is a self-contained command that reads and edits a shared SpellContext.
// Target cards reshape ctx.targets; effect cards act on whatever is targeted at that point in the spell.
// Cards never know about each other, so any combination resolves left to right.

export type PointTarget = Pt & { pt: true };
export type Target = Unit | PointTarget;
export const isUnit = (t: Target): t is Unit => !(t as PointTarget).pt;

export interface SpellCtx {
  w: World; caster: Unit; aim: Pt; targets: Target[];
  /** How many of each card have resolved so far in this spell (for stacking cards like Rend). */
  stack: Record<string, number>;
  /** Power of the card now resolving: its inscription level and any Overcharge. */
  pw: number;
  /** Preview only: shapes the target cards sweep, so the player can see the area before casting. */
  zones?: Zone[];
}
/** An area a spell covers, for the aiming preview. Never read by the sim. */
export type Zone =
  | { k: 'circle'; x: number; y: number; r: number; tone: 'target' | 'effect'; color?: number }
  | { k: 'beam'; x: number; y: number; x2: number; y2: number; w: number }
  | { k: 'cone'; x: number; y: number; a: number; spread: number; len: number }
  | { k: 'link'; x: number; y: number; x2: number; y2: number };
const zone = (ctx: SpellCtx, z: Zone) => { ctx.zones?.push(z); };
/** Scale a number by the resolving card's power. */
const P = (ctx: SpellCtx, n: number) => Math.round(n * ctx.pw);

export type School = 'target' | 'harm' | 'force' | 'curse' | 'blessing' | 'grave' | 'blood' | 'summon' | 'terrain' | 'arcane';
/** target: reshape targets. each: every targeted body. any: every target incl. bare ground. first: the first target only. */
export type Mode = 'target' | 'each' | 'any' | 'first' | 'mod';

export interface Card {
  id: string;
  name: string;
  school: School;
  cost: number;
  hpCost?: number;
  mode: Mode;
  desc: string;
  /** blood: adds corruption; fire: warms the caster; frost/shock: elemental. */
  tags?: Array<'blood' | 'fire' | 'frost' | 'shock'>;
  /** Belongs to one calling: never offered to anyone else. */
  cls?: WizardClass;
  run: (ctx: SpellCtx, t: Target) => void;
}

const bodies = (w: World) => w.units.filter((v) => !v.gone);
const add = (ctx: SpellCtx, v: Target) => {
  if (isUnit(v) && v.alive && hasAffix(v, 'elusive')) return;
  if (!ctx.targets.includes(v)) ctx.targets.push(v);
};
const living = (t: Target): t is Unit => isUnit(t) && t.alive;
const corpse = (t: Target): t is Unit => isUnit(t) && !t.alive && !t.gone;
const byDistThenId = (o: Pt) => (a: Unit, b: Unit) => dist(a, o) - dist(b, o) || a.id - b.id;

const list: Card[] = [
  // ---- Targeting -------------------------------------------------------------
  { id: 'circle', name: 'Circle of Binding', school: 'target', cost: 15, mode: 'target',
    desc: 'Also target every body within 75 of each target. Each extra Circle in the spell spreads 35 wider.',
    run(ctx) {
      const r = 75 + 35 * ((ctx.stack.circle ?? 1) - 1);
      for (const t of [...ctx.targets]) {
        emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r, color: 0x9a6cff });
        zone(ctx, { k: 'circle', x: t.x, y: t.y, r, tone: 'target' });
        for (const v of bodies(ctx.w).sort(byDistThenId(t))) if (dist(v, t) <= r) add(ctx, v);
      }
    } },
  { id: 'chain', name: 'Chain of Souls', school: 'target', cost: 25, mode: 'target',
    desc: 'Link up to 4 more bodies on the same side, each within 120 of the last.',
    run(ctx) {
      let frontier = ctx.targets.filter(isUnit);
      let added = 0;
      while (frontier.length && added < 4) {
        const next: Unit[] = [];
        for (const f of frontier) {
          const cands = bodies(ctx.w).filter((v) => !ctx.targets.includes(v) && v.alive === f.alive && v.faction === f.faction && dist(v, f) <= 120).sort(byDistThenId(f));
          for (const v of cands) {
            if (added >= 4) break;
            add(ctx, v);
            if (!ctx.targets.includes(v)) continue;
            next.push(v);
            added++;
            emit(ctx.w, { k: 'fx', fx: 'line', x: f.x, y: f.y, x2: v.x, y2: v.y, color: 0xb48cff });
            zone(ctx, { k: 'link', x: f.x, y: f.y, x2: v.x, y2: v.y });
          }
        }
        frontier = next;
      }
    } },
  { id: 'kin', name: 'Mark of Kin', school: 'target', cost: 20, mode: 'target',
    desc: 'Also target the 3 nearest bodies of the same kind as each target.',
    run(ctx) {
      for (const t of ctx.targets.filter(isUnit)) {
        const same = bodies(ctx.w).filter((v) => v !== t && v.type === t.type && v.alive === t.alive && !ctx.targets.includes(v)).sort(byDistThenId(t)).slice(0, 3);
        for (const v of same) { add(ctx, v); emit(ctx.w, { k: 'fx', fx: 'line', x: t.x, y: t.y, x2: v.x, y2: v.y, color: 0x9a6cff }); zone(ctx, { k: 'link', x: t.x, y: t.y, x2: v.x, y2: v.y }); }
      }
    } },
  { id: 'line', name: 'Lance Line', school: 'target', cost: 15, mode: 'target',
    desc: 'Also target every body on a line from you through your aim, at least 260 long.',
    run(ctx) {
      const c = ctx.caster, a = ctx.aim;
      const L = Math.hypot(a.x - c.x, a.y - c.y) || 1;
      const ux = (a.x - c.x) / L, uy = (a.y - c.y) / L, len = Math.max(260, L + 60);
      emit(ctx.w, { k: 'fx', fx: 'line', x: c.x, y: c.y, x2: c.x + ux * len, y2: c.y + uy * len, color: 0x9a6cff });
      zone(ctx, { k: 'beam', x: c.x, y: c.y, x2: c.x + ux * len, y2: c.y + uy * len, w: 22 });
      for (const v of bodies(ctx.w)) {
        if (v === c) continue;
        const t = (v.x - c.x) * ux + (v.y - c.y) * uy;
        const perp = Math.abs((v.x - c.x) * uy - (v.y - c.y) * ux);
        if (t > 0 && t < len && perp <= 22 + v.r) add(ctx, v);
      }
    } },
  { id: 'cone', name: 'Fan of Woe', school: 'target', cost: 20, mode: 'target',
    desc: 'Also target every body in a 70° cone, 230 long, spreading from you toward your aim.',
    run(ctx) {
      const c = ctx.caster;
      const base = Math.atan2(ctx.aim.y - c.y, ctx.aim.x - c.x);
      zone(ctx, { k: 'cone', x: c.x, y: c.y, a: base, spread: 0.61, len: 230 });
      for (const s of [-0.61, 0.61]) emit(ctx.w, { k: 'fx', fx: 'line', x: c.x, y: c.y, x2: c.x + Math.cos(base + s) * 230, y2: c.y + Math.sin(base + s) * 230, color: 0x9a6cff });
      for (const v of bodies(ctx.w)) {
        if (v === c || dist(v, c) > 230) continue;
        let da = Math.atan2(v.y - c.y, v.x - c.x) - base;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        if (Math.abs(da) <= 0.61) add(ctx, v);
      }
    } },

  // ---- Harm ------------------------------------------------------------------
  { id: 'sever', name: 'Sever', school: 'harm', cost: 20, mode: 'each', desc: 'Deal 20 damage.',
    run(ctx, t) {
      if (!living(t)) return;
      emit(ctx.w, { k: 'fx', fx: 'slash', x: t.x, y: t.y, color: 0xfff2d0 });
      emit(ctx.w, { k: 'sfx', s: 'hit' });
      hurt(ctx.w, t, P(ctx, 20), undefined, ctx.caster);
    } },
  { id: 'hemorrhage', name: 'Hemorrhage', school: 'harm', cost: 25, mode: 'each',
    desc: 'Deal 10 plus half of the target’s missing health.',
    run(ctx, t) {
      if (!living(t)) return;
      emit(ctx.w, { k: 'fx', fx: 'burst', x: t.x, y: t.y, color: 0xb3202a });
      hurt(ctx.w, t, P(ctx, 10 + Math.round((t.maxHp - t.hp) / 2)), undefined, ctx.caster);
    } },
  { id: 'rites', name: 'Last Rites', school: 'harm', cost: 40, mode: 'each',
    desc: 'Slay a target at or below 30% health outright, through any ward.',
    run(ctx, t) {
      if (!living(t)) return;
      if (t.hp <= t.maxHp * 0.3) {
        emit(ctx.w, { k: 'fx', fx: 'column', x: t.x, y: t.y, color: 0xe9dcc0 });
        t.shield = 0;
        hurt(ctx.w, t, t.hp * 10, undefined, ctx.caster);
      } else emit(ctx.w, { k: 'float', id: t.id, text: 'resists', color: 0xcfc4ad });
    } },
  { id: 'bolt', name: 'Iron Bolt', school: 'harm', cost: 8, mode: 'any',
    desc: 'Loose a bolt toward each target. It strikes the first body in its path for 15.',
    run(ctx, t) {
      const c = ctx.caster;
      const L = Math.hypot(t.x - c.x, t.y - c.y);
      if (L < 1) return;
      const ux = (t.x - c.x) / L, uy = (t.y - c.y) / L;
      let x = c.x, y = c.y;
      let hit: Unit | null = null;
      for (let s = 0; s < 600; s += 6) {
        x = c.x + ux * s;
        y = c.y + uy * s;
        if (isWallAt(ctx.w, x, y)) break;
        hit = ctx.w.units.find((v) => v !== c && v.alive && !v.gone && dist(v, { x, y }) < v.r + 2) ?? null;
        if (hit) break;
      }
      emit(ctx.w, { k: 'fx', fx: 'proj', x: c.x, y: c.y, x2: x, y2: y, color: 0xcfc4ad });
      emit(ctx.w, { k: 'sfx', s: 'shoot' });
      if (hit) hurt(ctx.w, hit, P(ctx, 15), undefined, c);
    } },

  // ---- Blood -----------------------------------------------------------------
  { id: 'lance', name: 'Sanguine Lance', school: 'blood', cost: 0, hpCost: 25, mode: 'each', tags: ['blood'],
    desc: 'Paid in your own blood: costs 25 health, no mana. Deal 50 damage.',
    run(ctx, t) {
      if (!living(t)) return;
      emit(ctx.w, { k: 'fx', fx: 'line', x: ctx.caster.x, y: ctx.caster.y, x2: t.x, y2: t.y, color: 0xd0202a });
      hurt(ctx.w, t, P(ctx, 50), undefined, ctx.caster);
    } },
  { id: 'siphon', name: 'Soul Siphon', school: 'blood', cost: 25, mode: 'each', tags: ['blood'],
    desc: 'Deal 15 and heal yourself for the damage dealt.',
    run(ctx, t) {
      if (!living(t) || t === ctx.caster) return;
      emit(ctx.w, { k: 'fx', fx: 'proj', x: t.x, y: t.y, x2: ctx.caster.x, y2: ctx.caster.y, color: 0xd04a8a });
      const a = hurt(ctx.w, t, P(ctx, 15), undefined, ctx.caster);
      heal(ctx.w, ctx.caster, a);
    } },

  // ---- Force -----------------------------------------------------------------
  { id: 'repel', name: 'Repel', school: 'force', cost: 10, mode: 'each',
    desc: 'Shove the target 100 away from you. Bodies slammed into walls or each other take impact damage.',
    run(ctx, t) {
      if (!isUnit(t) || t === ctx.caster || t.gone) return;
      knockback(ctx.w, t, t.x - ctx.caster.x, t.y - ctx.caster.y, 100);
    } },
  { id: 'beckon', name: 'Beckon', school: 'force', cost: 10, mode: 'each', desc: 'Drag the target up to 100 toward you.',
    run(ctx, t) {
      if (!isUnit(t) || t === ctx.caster || t.gone) return;
      const c = ctx.caster;
      knockback(ctx.w, t, c.x - t.x, c.y - t.y, Math.min(100, dist(c, t) - c.r - t.r - 2));
    } },
  { id: 'rime', name: 'Rime', school: 'force', cost: 25, mode: 'each', tags: ['frost'], desc: 'Freeze the target: it loses its next turn (two if soaked). Stacks.',
    run(ctx, t) {
      if (!living(t)) return;
      t.frozen += t.wet > 0 ? 2 : 1;
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 24, color: 0x9fe8ff });
      emit(ctx.w, { k: 'sfx', s: 'freeze' });
      sync(ctx.w, t);
    } },
  { id: 'fetter', name: 'Fetter', school: 'force', cost: 15, mode: 'each', desc: 'Halve the target’s movement on its next turn.',
    run(ctx, t) {
      if (!living(t)) return;
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 18, color: 0x8a8a9a });
      curse(ctx.w, t, 'fetter', 1, ctx.caster);
    } },
  { id: 'maelstrom', name: 'Maelstrom', school: 'force', cost: 30, mode: 'first',
    desc: 'Drag every body within 150 of the first target 70 toward it.',
    run(ctx, t) {
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 150, color: 0x5aa0d8 });
      for (const v of bodies(ctx.w).sort(byDistThenId(t))) {
        if (v === ctx.caster || v === t) continue;
        const d = dist(v, t);
        if (d <= 150 && d > 4) knockback(ctx.w, v, t.x - v.x, t.y - v.y, Math.min(70, d - v.r - (isUnit(t) ? t.r : 0)));
      }
    } },
  { id: 'blink', name: 'Blink', school: 'force', cost: 30, mode: 'first', desc: 'Step through the dark to the first target.',
    run(ctx, t) {
      const c = ctx.caster;
      const p = findFreeNear(ctx.w, t.x, t.y, c.r, c, 80);
      if (!p) return;
      emit(ctx.w, { k: 'fx', fx: 'blink', x: c.x, y: c.y, color: 0xb48cff });
      c.x = p.x;
      c.y = p.y;
      emit(ctx.w, { k: 'teleport', id: c.id, x: c.x, y: c.y });
      emit(ctx.w, { k: 'fx', fx: 'blink', x: c.x, y: c.y, color: 0xb48cff });
      triggers(ctx.w, c);
    } },
  { id: 'transpose', name: 'Transpose', school: 'force', cost: 15, mode: 'first', desc: 'Swap places with the first target.',
    run(ctx, t) {
      const c = ctx.caster;
      if (!isUnit(t) || t === c || t.gone) return;
      const cx = c.x, cy = c.y;
      c.x = t.x; c.y = t.y; t.x = cx; t.y = cy;
      emit(ctx.w, { k: 'teleport', id: c.id, x: c.x, y: c.y });
      emit(ctx.w, { k: 'teleport', id: t.id, x: t.x, y: t.y });
      emit(ctx.w, { k: 'fx', fx: 'blink', x: c.x, y: c.y, color: 0xb48cff });
      emit(ctx.w, { k: 'fx', fx: 'blink', x: t.x, y: t.y, color: 0xb48cff });
      triggers(ctx.w, c);
      if (t.alive) triggers(ctx.w, t);
    } },

  // ---- Curses ----------------------------------------------------------------
  { id: 'plague', name: 'Plague', school: 'curse', cost: 20, mode: 'each',
    desc: 'Add 15 poison. Poison deals its amount at the start of each turn, then wanes by 5.',
    run(ctx, t) {
      if (!living(t)) return;
      emit(ctx.w, { k: 'fx', fx: 'burst', x: t.x, y: t.y, color: 0x9cff5a });
      curse(ctx.w, t, 'poison', 15, ctx.caster);
    } },
  { id: 'frail', name: 'Frailty', school: 'curse', cost: 30, mode: 'each', desc: 'The target takes 50% more damage. Stacks.',
    run(ctx, t) {
      if (!living(t)) return;
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 20, color: 0xa36cd0 });
      curse(ctx.w, t, 'frail', 1, ctx.caster);
    } },
  { id: 'bloat', name: 'Corpse Bloat', school: 'curse', cost: 25, mode: 'each',
    desc: 'When the target dies it bursts: 40 damage to every body within 100, shoving them back.',
    run(ctx, t) {
      if (!living(t)) return;
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 22, color: 0xe0a030 });
      curse(ctx.w, t, 'bloat', 1, ctx.caster);
    } },
  { id: 'contagion', name: 'Contagion', school: 'curse', cost: 35, mode: 'each',
    desc: 'Spread the target’s poison, frailty, rime and bloat to every body within 130.',
    run(ctx, t) {
      if (!living(t)) return;
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 130, color: 0x7fbf3f });
      for (const v of bodies(ctx.w)) {
        if (v === t || !v.alive || dist(v, t) > 130) continue;
        for (const k of ['poison', 'burn', 'frail', 'weak', 'bloat'] as const) if (t[k]) curse(ctx.w, v, k, t[k], ctx.caster);
        if (t.frozen) { v.frozen += t.frozen; sync(ctx.w, v); }
      }
    } },

  // ---- Blessings -------------------------------------------------------------
  { id: 'mend', name: 'Mend', school: 'blessing', cost: 15, mode: 'each', desc: 'Restore 30 health.',
    run(ctx, t) {
      if (!living(t)) return;
      emit(ctx.w, { k: 'fx', fx: 'column', x: t.x, y: t.y, color: 0x7ee07e });
      emit(ctx.w, { k: 'sfx', s: 'heal' });
      heal(ctx.w, t, P(ctx, 30));
    } },
  { id: 'ward', name: 'Ward', school: 'blessing', cost: 20, mode: 'each', desc: 'Raise a ward that absorbs the next 30 damage.',
    run(ctx, t) {
      if (!living(t)) return;
      t.shield += P(ctx, 30);
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 22, color: 0x6fd0ff });
      sync(ctx.w, t);
    } },
  { id: 'cleanse', name: 'Cleanse', school: 'blessing', cost: 15, mode: 'each', desc: 'Remove poison, burn, frailty, enfeeblement, rime, fetters and bloat.',
    run(ctx, t) {
      if (!living(t)) return;
      clearCurses(t);
      emit(ctx.w, { k: 'fx', fx: 'column', x: t.x, y: t.y, color: 0xfff2d0 });
      sync(ctx.w, t);
    } },

  // ---- Grave magic -----------------------------------------------------------
  { id: 'raise', name: 'Raise Dead', school: 'grave', cost: 80, mode: 'each',
    desc: 'Raise a corpse at full health to fight at your side (+8 corruption). A fallen spellwright rises at half health.',
    run(ctx, t) {
      if (!corpse(t)) return;
      t.alive = true;
      t.hp = t.owner ? Math.ceil(t.maxHp / 2) : t.maxHp;
      t.faction = ctx.caster.faction;
      clearCurses(t);
      emit(ctx.w, { k: 'fx', fx: 'column', x: t.x, y: t.y, color: 0xb48cff });
      sync(ctx.w, t);
      log(ctx.w, `${unitName(t)} rises to serve.`);
      const ps = ownerState(ctx.w, ctx.caster);
      if (ps) corrupt(ctx.w, ps, 8);
    } },
  { id: 'mirror', name: 'Mirror Flesh', school: 'grave', cost: 70, mode: 'each', desc: 'Make a copy of the target beside it, living or dead.',
    run(ctx, t) {
      if (!isUnit(t) || t.owner || t.gone) return;
      const p = findFreeNear(ctx.w, t.x, t.y, t.r, null, 90);
      if (!p) return;
      const c: Unit = { ...t, id: ctx.w.nextId++, x: p.x, y: p.y };
      ctx.w.units.push(c);
      emit(ctx.w, { k: 'spawn', unit: { ...c } });
      emit(ctx.w, { k: 'fx', fx: 'blink', x: c.x, y: c.y, color: 0xc9b8e8 });
    } },
  { id: 'effigy', name: 'Straw Effigy', school: 'grave', cost: 30, mode: 'first',
    desc: 'Raise an effigy with 70 health at the first target. Nearby foes would rather strike it than you.',
    run(ctx, t) {
      const p = findFreeNear(ctx.w, t.x, t.y, 10, null, 80);
      if (!p) return;
      const e = makeUnit(ctx.w, 'effigy', p.x, p.y, ctx.caster.faction);
      ctx.w.units.push(e);
      emit(ctx.w, { k: 'spawn', unit: { ...e } });
    } },
  { id: 'boneburst', name: 'Bone Burst', school: 'grave', cost: 15, mode: 'each',
    desc: 'Shatter a corpse: 40 damage to every body within 110.',
    run(ctx, t) {
      if (!corpse(t)) return;
      t.gone = true;
      emit(ctx.w, { k: 'die', id: t.id });
      explode(ctx.w, t.x, t.y, 110, P(ctx, 40), { color: 0xe9dcc0, src: ctx.caster });
    } },
  // ---- Added from the wider Spellmasons card pool (our own takes) --------------
  { id: 'seek', name: 'Seeking Mark', school: 'target', cost: 10, mode: 'target',
    desc: 'Also target the first body a bolt would strike, flying from you through your aim.',
    run(ctx) {
      const c = ctx.caster, a = ctx.aim;
      const L = Math.hypot(a.x - c.x, a.y - c.y) || 1;
      const ux = (a.x - c.x) / L, uy = (a.y - c.y) / L;
      for (let s = 0; s < 700; s += 6) {
        const p = { x: c.x + ux * s, y: c.y + uy * s };
        if (isWallAt(ctx.w, p.x, p.y)) { zone(ctx, { k: 'beam', x: c.x, y: c.y, x2: p.x, y2: p.y, w: 4 }); break; }
        const hit = ctx.w.units.find((v) => v !== c && v.alive && !v.gone && dist(v, p) < v.r + 2);
        if (hit) { emit(ctx.w, { k: 'fx', fx: 'line', x: c.x, y: c.y, x2: hit.x, y2: hit.y, color: 0x9a6cff }); zone(ctx, { k: 'beam', x: c.x, y: c.y, x2: hit.x, y2: hit.y, w: 4 }); add(ctx, hit); break; }
        if (s + 6 >= 700) zone(ctx, { k: 'beam', x: c.x, y: c.y, x2: p.x, y2: p.y, w: 4 });
      }
    } },
  { id: 'nova', name: 'Nova Ring', school: 'target', cost: 25, mode: 'target',
    desc: 'Also target every body within 140 of you (but not you).',
    run(ctx) {
      const c = ctx.caster;
      emit(ctx.w, { k: 'fx', fx: 'ring', x: c.x, y: c.y, r: 140, color: 0x9a6cff });
      zone(ctx, { k: 'circle', x: c.x, y: c.y, r: 140, tone: 'target' });
      for (const v of bodies(ctx.w).sort(byDistThenId(c))) if (v !== c && dist(v, c) <= 140) add(ctx, v);
    } },
  { id: 'rend', name: 'Rend', school: 'harm', cost: 10, mode: 'each',
    desc: 'Deal 10 damage, then 20 for a second Rend in the same spell, 30 for a third, and so on.',
    run(ctx, t) {
      if (!living(t)) return;
      const n = ctx.stack.rend ?? 1;
      emit(ctx.w, { k: 'fx', fx: 'slash', x: t.x, y: t.y, color: 0xd9452f });
      hurt(ctx.w, t, P(ctx, 10 * n), undefined, ctx.caster);
    } },
  { id: 'burn', name: 'Immolate', school: 'curse', cost: 20, mode: 'each', tags: ['fire'],
    desc: 'Deal 10 and set the target alight: it burns for 10 at the start of each of its next 2 turns.',
    run(ctx, t) {
      if (!living(t)) return;
      emit(ctx.w, { k: 'fx', fx: 'burst', x: t.x, y: t.y, color: 0xff7a2a });
      hurt(ctx.w, t, P(ctx, 10), 'fire', ctx.caster);
      if (t.alive) curse(ctx.w, t, 'burn', 2, ctx.caster);
    } },
  { id: 'shatter', name: 'Shatter', school: 'harm', cost: 25, mode: 'each',
    desc: 'Shatter a frozen target for 60 damage, thawing it. Unfrozen targets take only 10.',
    run(ctx, t) {
      if (!living(t)) return;
      const frozen = t.frozen > 0;
      if (frozen) { t.frozen = 0; sync(ctx.w, t); }
      emit(ctx.w, { k: 'fx', fx: 'burst', x: t.x, y: t.y, color: frozen ? 0x9fe8ff : 0xcfc4ad });
      emit(ctx.w, { k: 'sfx', s: frozen ? 'freeze' : 'hit' });
      hurt(ctx.w, t, P(ctx, frozen ? 60 : 10), frozen ? 'frost' : undefined, ctx.caster);
    } },
  { id: 'manaburn', name: 'Mana Burn', school: 'harm', cost: 15, mode: 'each',
    desc: 'Burn away up to 40 of the target’s mana; it takes that much damage.',
    run(ctx, t) {
      if (!living(t) || t.mana <= 0) return;
      const m = Math.min(40, t.mana);
      t.mana -= m;
      emit(ctx.w, { k: 'fx', fx: 'burst', x: t.x, y: t.y, color: 0x6fa0ff });
      emit(ctx.w, { k: 'float', id: t.id, text: `-${m} mana`, color: 0x6fa0ff });
      sync(ctx.w, t);
      hurt(ctx.w, t, m, undefined, ctx.caster);
    } },
  { id: 'meteor', name: 'Meteor', school: 'harm', cost: 45, mode: 'first', tags: ['fire'],
    desc: 'Call down a falling star at the first target: 40 damage to everything within 70, flung outward.',
    run(ctx, t) {
      emit(ctx.w, { k: 'fx', fx: 'lob', x: t.x - 120, y: t.y - 260, x2: t.x, y2: t.y, color: 0xffb14a });
      ctx.w.beat++;
      explode(ctx.w, t.x, t.y, 70, P(ctx, 40), { push: 40, color: 0xff7a2a, src: ctx.caster });
    } },
  { id: 'dash', name: 'Dash', school: 'force', cost: 15, mode: 'first',
    desc: 'Charge in a straight line toward the first target until something stops you. Costs no stamina.',
    run(ctx, t) {
      const c = ctx.caster;
      const d = dist(c, t) - (isUnit(t) && t !== c ? t.r + c.r : 0);
      if (d > 4) knockback(ctx.w, c, t.x - c.x, t.y - c.y, d, 0, false);
    } },
  { id: 'stomp', name: 'Stomp', school: 'force', cost: 25, mode: 'first',
    desc: 'Strike the ground: 10 damage to everything within 110 of you, hurled 70 away.',
    run(ctx) {
      const c = ctx.caster;
      emit(ctx.w, { k: 'fx', fx: 'ring', x: c.x, y: c.y, r: 110, color: 0xcfc4ad });
      emit(ctx.w, { k: 'sfx', s: 'boom' });
      for (const v of bodies(ctx.w).sort(byDistThenId(c))) {
        if (v === c || dist(v, c) > 110) continue;
        if (v.alive) hurt(ctx.w, v, P(ctx, 10), 'impact', c);
        if (!v.gone) knockback(ctx.w, v, v.x - c.x, v.y - c.y, 70);
      }
    } },
  { id: 'fortify', name: 'Fortify', school: 'blessing', cost: 25, mode: 'each',
    desc: 'The target takes half damage until the start of its next turn.',
    run(ctx, t) {
      if (!living(t)) return;
      t.fortify = 1;
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 24, color: 0x9a979e });
      sync(ctx.w, t);
    } },
  { id: 'empower', name: 'Empower', school: 'blessing', cost: 20, mode: 'each',
    desc: 'The target’s attacks deal 10 more damage, for good. Best spent on your thralls.',
    run(ctx, t) {
      if (!living(t) || t.owner) return;
      t.dmg += 10;
      emit(ctx.w, { k: 'fx', fx: 'column', x: t.x, y: t.y, color: 0xe0b341 });
      sync(ctx.w, t);
    } },
  { id: 'enfeeble', name: 'Enfeeble', school: 'curse', cost: 20, mode: 'each',
    desc: 'The target deals 25% less damage per stack, to a quarter at most.',
    run(ctx, t) {
      if (!living(t)) return;
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 20, color: 0x8a6a4a });
      curse(ctx.w, t, 'weak', 1, ctx.caster);
    } },
  { id: 'polymorph', name: 'Polymorph', school: 'grave', cost: 50, mode: 'each',
    desc: 'Twist the target into a different random creature, keeping its side and share of health.',
    run(ctx, t) {
      if (!living(t) || t.owner || UNITS[t.type].prop || UNITS[t.type].boss || UNITS[t.type].decoy) return;
      const choices = CREATURES.filter((c) => c !== t.type);
      const type = choices[Math.floor(rand(ctx.w) * choices.length)];
      const fresh = makeUnit(ctx.w, type, t.x, t.y, t.faction);
      ctx.w.nextId--; // the shell keeps the original id
      const pct = t.hp / t.maxHp;
      Object.assign(t, { type, r: fresh.r, maxHp: fresh.maxHp, hp: Math.max(1, Math.round(fresh.maxHp * pct)), dmg: fresh.dmg, range: fresh.range,
        maxStam: fresh.maxStam, stam: fresh.stam, mana: fresh.mana, maxMana: fresh.maxMana, regen: fresh.regen, atkCost: fresh.atkCost });
      emit(ctx.w, { k: 'spawn', unit: { ...t, affixes: [...t.affixes] } });
      emit(ctx.w, { k: 'fx', fx: 'blink', x: t.x, y: t.y, color: 0xc9b8e8 });
      log(ctx.w, `Flesh twists into a ${UNITS[type].name}.`);
    } },
  { id: 'merge', name: 'Merge', school: 'grave', cost: 60, mode: 'first',
    desc: 'The first target devours every other targeted living body on its side, taking their health and strength.',
    run(ctx, t) {
      if (!isUnit(t) || !t.alive || t.owner) return;
      for (const v of ctx.targets) {
        if (!isUnit(v) || v === t || !v.alive || v.owner || v.faction !== t.faction || UNITS[v.type].boss) continue;
        t.maxHp += v.maxHp; t.hp += v.hp; t.dmg += Math.round(v.dmg / 2);
        emit(ctx.w, { k: 'fx', fx: 'proj', x: v.x, y: v.y, x2: t.x, y2: t.y, color: 0xc9b8e8 });
        v.alive = false; v.gone = true;
        emit(ctx.w, { k: 'die', id: v.id });
      }
      sync(ctx.w, t);
    } },
  { id: 'sum_ghoul', name: 'Bind Ghoul', school: 'summon', cost: 40, mode: 'first',
    desc: 'Summon a ghoul thrall at the first target. It fights for you.',
    run(ctx, t) { summonAt(ctx, t, 'ghoul'); } },
  { id: 'sum_xbow', name: 'Bind Crossbowman', school: 'summon', cost: 55, mode: 'first',
    desc: 'Summon a crossbowman thrall at the first target.',
    run(ctx, t) { summonAt(ctx, t, 'xbow'); } },
  { id: 'unleash', name: 'Unleash', school: 'summon', cost: 20, mode: 'first', cls: 'cagebearer',
    desc: 'Cagebearer only. Set the oldest foe in your cage loose at the first target, fighting for you at full strength.',
    run(ctx, t) {
      const ps = ownerState(ctx.w, ctx.caster);
      const type = ps?.cage.shift();
      if (!type) { emit(ctx.w, { k: 'float', id: ctx.caster.id, text: 'the cage is empty', color: 0xa8977c }); return; }
      const p = findFreeNear(ctx.w, t.x, t.y, UNITS[type].r, null, 90);
      if (!p) { ps!.cage.unshift(type); return; }
      const s = makeUnit(ctx.w, type, p.x, p.y, ctx.caster.faction);
      ctx.w.units.push(s);
      emit(ctx.w, { k: 'spawn', unit: { ...s, affixes: [] } });
      emit(ctx.w, { k: 'fx', fx: 'column', x: p.x, y: p.y, color: 0xd9a845 });
      log(ctx.w, `${ps!.name} unleashes a ${UNITS[type].name}.`);
    } },
  { id: 'sum_priest', name: 'Bind Bone Priest', school: 'summon', cost: 90, mode: 'first',
    desc: 'Summon a bone priest thrall at the first target. It mends and raises your fallen thralls.',
    run(ctx, t) { summonAt(ctx, t, 'priest'); } },
  // ---- Wave two: more ways to break a fight ----------------------------------
  { id: 'fork', name: 'Forked Sight', school: 'target', cost: 20, mode: 'target',
    desc: 'Also target the 2 nearest living foes of each target, wherever they stand.',
    run(ctx) {
      for (const t of [...ctx.targets]) {
        const near = ctx.w.units.filter((v) => v.alive && !v.gone && v.faction !== ctx.caster.faction && v !== t).sort(byDistThenId(t)).slice(0, 2);
        for (const v of near) { add(ctx, v); emit(ctx.w, { k: 'fx', fx: 'line', x: t.x, y: t.y, x2: v.x, y2: v.y, color: 0x9a6cff }); zone(ctx, { k: 'link', x: t.x, y: t.y, x2: v.x, y2: v.y }); }
      }
    } },
  { id: 'gather', name: 'Gather the Dead', school: 'target', cost: 10, mode: 'target',
    desc: 'Also target every corpse within 150 of each target.',
    run(ctx) {
      for (const t of [...ctx.targets]) {
        zone(ctx, { k: 'circle', x: t.x, y: t.y, r: 150, tone: 'target' });
        for (const v of bodies(ctx.w).sort(byDistThenId(t))) if (!v.alive && dist(v, t) <= 150) add(ctx, v);
      }
    } },
  { id: 'quake', name: 'Quake', school: 'force', cost: 30, mode: 'first',
    desc: 'The ground heaves: every body within 120 of the first target is thrown 70 away from it.',
    run(ctx, t) {
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 120, color: 0xa08060 });
      emit(ctx.w, { k: 'sfx', s: 'boom' });
      for (const v of ctx.w.units.filter((v) => v.alive && !v.gone && v !== ctx.caster && dist(v, t) <= 120).sort(byDistThenId(t))) knockback(ctx.w, v, v.x - t.x || 1, v.y - t.y, 70);
    } },
  { id: 'magnet', name: 'Lodestone', school: 'force', cost: 20, mode: 'first',
    desc: 'Drag every body within 150 of the first target 60 toward it. Crowd them for a blast.',
    run(ctx, t) {
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 150, color: 0x6a6a78 });
      for (const v of ctx.w.units.filter((v) => v.alive && !v.gone && v !== ctx.caster && dist(v, t) <= 150 && dist(v, t) > 20).sort(byDistThenId(t))) knockback(ctx.w, v, t.x - v.x, t.y - v.y, Math.min(60, dist(v, t) - v.r - 4), 0, false);
    } },
  { id: 'swap', name: 'Transposition', school: 'force', cost: 25, mode: 'first',
    desc: 'Trade places with the first target.',
    run(ctx, t) {
      if (!isUnit(t) || t === ctx.caster || t.gone) return;
      const c = ctx.caster;
      const [x, y] = [c.x, c.y];
      emit(ctx.w, { k: 'fx', fx: 'blink', x: c.x, y: c.y, x2: t.x, y2: t.y, color: 0xb48cff });
      c.x = t.x; c.y = t.y; t.x = x; t.y = y;
      sync(ctx.w, c); sync(ctx.w, t);
      triggers(ctx.w, c); triggers(ctx.w, t);
    } },
  { id: 'crimson', name: 'Crimson Wave', school: 'blood', cost: 0, hpCost: 20, mode: 'first', tags: ['blood'],
    desc: 'Spill your blood in a wave: 35 damage to every other body within 90 of the first target.',
    run(ctx, t) { explode(ctx.w, t.x, t.y, 90, P(ctx, 35), { except: ctx.caster, color: 0xa3202a, src: ctx.caster }); } },
  { id: 'frostbite', name: 'Frostbite', school: 'harm', cost: 20, mode: 'each', tags: ['frost'],
    desc: 'Deal 15 frost. A soaked target freezes solid; a dry one is left frail.',
    run(ctx, t) {
      if (!living(t)) return;
      emit(ctx.w, { k: 'fx', fx: 'burst', x: t.x, y: t.y, color: 0x9fe8ff });
      hurt(ctx.w, t, P(ctx, 15), 'frost', ctx.caster);
      if (!t.alive) return;
      if (t.wet > 0) { t.frozen = Math.max(t.frozen, 1); sync(ctx.w, t); } else curse(ctx.w, t, 'frail', 1, ctx.caster);
    } },
  { id: 'cinders', name: 'Cinders', school: 'curse', cost: 25, mode: 'each', tags: ['fire'],
    desc: 'Set the target smouldering: it burns for 10 at the start of each of its next 4 turns.',
    run(ctx, t) { if (living(t)) { emit(ctx.w, { k: 'fx', fx: 'burst', x: t.x, y: t.y, color: 0xff7a2a }); curse(ctx.w, t, 'burn', 4, ctx.caster); } } },
  { id: 'decay', name: 'Decay', school: 'curse', cost: 30, mode: 'each',
    desc: 'Rot away a quarter of the target’s current health (lords resist: a tenth).',
    run(ctx, t) {
      if (!living(t)) return;
      emit(ctx.w, { k: 'fx', fx: 'column', x: t.x, y: t.y, color: 0x6a7a2a });
      hurt(ctx.w, t, Math.max(1, Math.round(t.hp * (UNITS[t.type].boss ? 0.1 : 0.25) * ctx.pw)), 'poison', ctx.caster);
    } },
  { id: 'mirrorward', name: 'Mirror Ward', school: 'blessing', cost: 25, mode: 'each',
    desc: 'Ward the target for 20, and give your own ward the same.',
    run(ctx, t) {
      if (!living(t)) return;
      t.shield += P(ctx, 20);
      if (t !== ctx.caster) ctx.caster.shield += P(ctx, 20);
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 22, color: 0x6fd0ff });
      sync(ctx.w, t); sync(ctx.w, ctx.caster);
    } },
  { id: 'gravepact', name: 'Grave Pact', school: 'grave', cost: 15, mode: 'each',
    desc: 'Consume a corpse to heal yourself for 25.',
    run(ctx, t) {
      if (!corpse(t)) return;
      t.gone = true;
      emit(ctx.w, { k: 'die', id: t.id });
      emit(ctx.w, { k: 'fx', fx: 'proj', x: t.x, y: t.y, x2: ctx.caster.x, y2: ctx.caster.y, color: 0x7ee07e });
      heal(ctx.w, ctx.caster, P(ctx, 25));
    } },
  { id: 'bonespear', name: 'Bone Spear', school: 'grave', cost: 20, mode: 'each',
    desc: 'Tear the nearest corpse within 150 into a spear: 45 to the target.',
    run(ctx, t) {
      if (!living(t)) return;
      const c = ctx.w.units.filter((v) => !v.alive && !v.gone && dist(v, t) <= 150).sort(byDistThenId(t))[0];
      if (!c) { emit(ctx.w, { k: 'float', id: t.id, text: 'no bones near', color: 0xa8977c }); return; }
      c.gone = true;
      emit(ctx.w, { k: 'die', id: c.id });
      emit(ctx.w, { k: 'fx', fx: 'proj', x: c.x, y: c.y, x2: t.x, y2: t.y, color: 0xe9dcc0 });
      hurt(ctx.w, t, P(ctx, 45), 'impact', ctx.caster);
    } },
  { id: 'mire', name: 'Mire', school: 'terrain', cost: 20, mode: 'first',
    desc: 'Turn the ground within 60 of the first target to poisoned bog.',
    run(ctx, t) {
      const ch = setTiles(ctx.w, t.x, t.y, 60, T_BOG, (k) => k === T_FLOOR || k === T_ICE);
      if (ch.length) emit(ctx.w, { k: 'tiles', changes: ch });
      for (const v of ctx.w.units) if (v.alive && !v.gone && dist(v, t) <= 60) triggers(ctx.w, v);
    } },
  { id: 'lavaflow', name: 'Lava Flow', school: 'terrain', cost: 45, mode: 'first', tags: ['fire'],
    desc: 'Melt the ground within 40 of the first target into lava.',
    run(ctx, t) {
      const ch = setTiles(ctx.w, t.x, t.y, 40, T_LAVA, (k) => k === T_FLOOR || k === T_ICE || k === T_BOG);
      if (ch.length) emit(ctx.w, { k: 'tiles', changes: ch });
      for (const v of ctx.w.units) if (v.alive && !v.gone && dist(v, t) <= 40) triggers(ctx.w, v);
    } },
  { id: 'starfall', name: 'Starfall', school: 'harm', cost: 60, mode: 'first',
    desc: 'Call down a star: 60 to everything within 60 of the first target, 25 to everything within 140.',
    run(ctx, t) {
      emit(ctx.w, { k: 'fx', fx: 'column', x: t.x, y: t.y, color: 0xffe070 });
      explode(ctx.w, t.x, t.y, 140, P(ctx, 25), { color: 0xffd060, src: ctx.caster });
      explode(ctx.w, t.x, t.y, 60, P(ctx, 35), { color: 0xffffff, src: ctx.caster });
    } },
  { id: 'vigil', name: 'Vigil', school: 'blessing', cost: 25, mode: 'each',
    desc: 'Fortify the target: it takes half damage until its next turn.',
    run(ctx, t) { if (living(t)) { t.fortify = 1; emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 24, color: 0xcfd4e0 }); sync(ctx.w, t); } } },
  // ---- Terrain, elements and modifiers --------------------------------------
  { id: 'flood', name: 'Flood', school: 'terrain', cost: 20, mode: 'first',
    desc: 'Flood the ground within 70 of the first target with water. Everything there is soaked.',
    run(ctx, t) {
      const ch = setTiles(ctx.w, t.x, t.y, 70, T_WATER, (k) => k === T_FLOOR || k === T_ICE);
      if (ch.length) emit(ctx.w, { k: 'tiles', changes: ch });
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 70, color: 0x6fa0ff });
      for (const v of bodies(ctx.w)) if (v.alive && dist(v, t) <= 80) { v.wet = 2; v.burn = 0; sync(ctx.w, v); }
    } },
  { id: 'icesheet', name: 'Ice Sheet', school: 'terrain', cost: 25, mode: 'first', tags: ['frost'],
    desc: 'Freeze the ground within 80 into slick ice (shoves slide twice as far). Soaked bodies there freeze.',
    run(ctx, t) {
      const ch = setTiles(ctx.w, t.x, t.y, 80, T_ICE, (k) => k === T_FLOOR || k === T_WATER);
      if (ch.length) emit(ctx.w, { k: 'tiles', changes: ch });
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 80, color: 0xbff4ff });
      emit(ctx.w, { k: 'sfx', s: 'freeze' });
      for (const v of bodies(ctx.w)) if (v.alive && v.wet > 0 && dist(v, t) <= 90) { v.frozen++; v.wet = 0; sync(ctx.w, v); }
    } },
  { id: 'raisewall', name: 'Raise Wall', school: 'terrain', cost: 20, mode: 'first',
    desc: 'Raise a stone pillar on the first target’s spot if it is empty: a wall to slam foes into.',
    run(ctx, t) {
      if (ctx.w.units.some((v) => v.alive && !v.gone && dist(v, t) < 26)) return;
      const ch = setTiles(ctx.w, t.x, t.y, 12, T_WALL, (k) => k !== T_WALL);
      if (ch.length) emit(ctx.w, { k: 'tiles', changes: ch });
      emit(ctx.w, { k: 'fx', fx: 'burst', x: t.x, y: t.y, color: 0xcfc4ad });
    } },
  { id: 'chainlight', name: 'Chain Lightning', school: 'harm', cost: 25, mode: 'each', tags: ['shock'],
    desc: 'Strike for 15 lightning, arcing to the 2 nearest bodies within 120. Soaked bodies take double.',
    run(ctx, t) {
      if (!living(t)) return;
      const hits = [t, ...ctx.w.units.filter((v) => v !== t && v !== ctx.caster && v.alive && !v.gone && dist(v, t) <= 120).sort(byDistThenId(t)).slice(0, 2)];
      let prev: Pt = ctx.caster;
      emit(ctx.w, { k: 'sfx', s: 'zap' });
      for (const v of hits) {
        emit(ctx.w, { k: 'fx', fx: 'bolt', x: prev.x, y: prev.y, x2: v.x, y2: v.y, color: 0xbfe0ff });
        hurt(ctx.w, v, P(ctx, 15), 'shock', ctx.caster);
        prev = v;
      }
    } },
  { id: 'steam', name: 'Steam Burst', school: 'harm', cost: 20, mode: 'each', tags: ['fire'],
    desc: 'Boil the water on a target: 25 to the soaked (drying them), 8 to anything else.',
    run(ctx, t) {
      if (!living(t)) return;
      const wet = t.wet > 0;
      emit(ctx.w, { k: 'fx', fx: 'burst', x: t.x, y: t.y, color: 0xe0e8f0 });
      if (wet) { t.wet = 0; sync(ctx.w, t); }
      hurt(ctx.w, t, P(ctx, wet ? 25 : 8), 'fire', ctx.caster);
    } },
  { id: 'flashfreeze', name: 'Flash Freeze', school: 'force', cost: 30, mode: 'each', tags: ['frost'],
    desc: 'Freeze every soaked body within 90 of the target for a turn, and deal 10 to each.',
    run(ctx, t) {
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 90, color: 0xbff4ff });
      emit(ctx.w, { k: 'sfx', s: 'freeze' });
      for (const v of bodies(ctx.w)) {
        if (!v.alive || dist(v, t) > 90 || v.wet <= 0) continue;
        v.frozen++;
        sync(ctx.w, v);
        hurt(ctx.w, v, P(ctx, 10), 'frost', ctx.caster);
      }
    } },
  { id: 'flare', name: 'Flare', school: 'blessing', cost: 20, mode: 'first', tags: ['fire'],
    desc: 'A blinding burst: 15 fire to everything within 90 of the target (Shades take double), and +20 lantern oil for you.',
    run(ctx, t) {
      emit(ctx.w, { k: 'fx', fx: 'ring', x: t.x, y: t.y, r: 90, color: 0xffe070 });
      for (const v of bodies(ctx.w)) if (v.alive && v !== ctx.caster && v.faction !== ctx.caster.faction && dist(v, t) <= 90) hurt(ctx.w, v, P(ctx, 15), 'fire', ctx.caster);
      const ps = ownerState(ctx.w, ctx.caster);
      if (ps) { ps.oil = Math.min(ps.maxOil, ps.oil + 20); emit(ctx.w, { k: 'float', id: ctx.caster.id, text: '+20 oil', color: 0xffd24a }); }
    } },
  { id: 'haste', name: 'Haste', school: 'blessing', cost: 15, mode: 'each',
    desc: 'The target gains 100 stamina now.',
    run(ctx, t) {
      if (!living(t)) return;
      t.stam += P(ctx, 100);
      emit(ctx.w, { k: 'fx', fx: 'column', x: t.x, y: t.y, color: 0xe0c040 });
      emit(ctx.w, { k: 'float', id: t.id, text: 'haste', color: 0xe0c040 });
      sync(ctx.w, t);
    } },
  { id: 'echo', name: 'Echo', school: 'arcane', cost: 15, mode: 'mod',
    desc: 'The next card in this spell resolves twice.', run() {} },
  { id: 'overcharge', name: 'Overcharge', school: 'arcane', cost: 25, mode: 'mod',
    desc: 'The next card in this spell is twice as strong.', run() {} },
];

function summonAt(ctx: SpellCtx, t: Pt, type: string) {
  const p = findFreeNear(ctx.w, t.x, t.y, UNITS[type].r, null, 90);
  if (!p) return;
  const lvl = ctx.w.level;
  ctx.w.level = 1; // thralls come at base strength
  const s = makeUnit(ctx.w, type, p.x, p.y, ctx.caster.faction);
  ctx.w.level = lvl;
  ctx.w.units.push(s);
  emit(ctx.w, { k: 'spawn', unit: { ...s, affixes: [] } });
  emit(ctx.w, { k: 'fx', fx: 'column', x: p.x, y: p.y, color: 0xb48cff });
}


export const CARDS: Record<string, Card> = Object.fromEntries(list.map((c) => [c.id, c]));
export const CARD_IDS = list.map((c) => c.id);

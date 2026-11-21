import { Application, Container, Graphics, RenderTexture, Sprite, Text, Texture, TextureStyle } from 'pixi.js';
import type { FxKind, GameEvent, LevelSnap, Pickup, Pt, Unit, UnitStatus, World } from '../sim/types';
import { isLiquid, TILE, T_LAVA, T_WATER } from '../sim/constants';
import { BIOMES } from '../sim/biomes';
import { ORBS, ROBES, ROBES_HI, SKINS, TRIMS } from '../sim/character';
import { RULES } from '../sim/constants';
import { UNITS } from '../sim/units';
import { statusOf } from '../sim/combat';
import { AFFIXES } from '../sim/runes';
import { buildSprites, wizardSprite, type SpriteSet } from './sprites';
import { drawGrain, drawLava, drawMap, lightBlob } from './mapArt';

// The renderer never decides anything. It replays the simulation's event outbox beat by beat,
// so a whole enemy turn that resolved in a millisecond plays out as readable animation.

// Low-res buffer. Its shape follows the screen (landscape monitor or portrait phone); the short side stays 250.
export let BW = 400, BH = 250;
export const SC = 0.5;
let VIEW_W = BW / SC, VIEW_H = BH / SC;

interface View {
  id: number; type: string; x: number; y: number; r: number; mini: boolean; owner: string | null; s: UnitStatus;
  path: Pt[]; speed: number; flip: boolean; flash: number; fade: number;
  main: Sprite; outline: Sprite; flashS: Sprite; ghost: Sprite;
}
interface Fx { kind: FxKind; x: number; y: number; x2: number; y2: number; r: number; color: number; t0: number; dur: number }
interface Floater { t: Text; x: number; y: number; t0: number }

const FX_DUR: Record<FxKind, number> = { ring: 420, line: 320, proj: 230, lob: 460, burst: 380, column: 620, slash: 240, blink: 420, bolt: 300 };

export interface Overlays {
  threats: Set<number>;
  targets: Set<number>;
  predicted: Map<number, number>;
  after: Map<number, { hp: number; alive: boolean; shield: number }> | null;
  hoverId: number | null;
  path: { pts: Pt[]; limit: number } | null;
  castRing: { x: number; y: number; r: number } | null;
  aim: { from: Pt; to: Pt; ok: boolean } | null;
}

export class GameRenderer {
  app = new Application();
  private world = new Container();
  private over = new Container();
  private mapSprite = new Sprite();
  private lavaSprite = new Sprite();
  private lavaCanvas: HTMLCanvasElement | null = null;
  private pickupLayer = new Container();
  private unitLayer = new Container();
  private ghostLayer = new Container();
  private underG = new Graphics();
  private fxG = new Graphics();
  private barG = new Graphics();
  private uiG = new Graphics();
  private floatLayer = new Container();
  private glowLayer = new Container();
  private lightCont = new Container();
  private lightRT!: RenderTexture;
  private dark!: Graphics;
  private lightSprite!: Sprite;
  private grain!: Sprite;

  /** Match the buffer's shape to the canvas on screen (CSS pixels w × h). */
  resize(w: number, h: number) {
    if (!this.lightRT || w < 10 || h < 10) return;
    const aspect = Math.max(0.45, Math.min(2.4, w / h));
    const nw = aspect >= 1 ? Math.round(250 * aspect) : 250;
    const nh = aspect >= 1 ? 250 : Math.round(250 / aspect);
    if (nw === BW && nh === BH) return;
    BW = nw; BH = nh; VIEW_W = BW / SC; VIEW_H = BH / SC;
    this.app.renderer.resize(BW, BH);
    this.lightRT.resize(BW, BH);
    this.dark.clear().rect(0, 0, BW, BH).fill({ color: 0x040206, alpha: 0.8 });
    const old = this.grain.texture;
    this.grain.texture = Texture.from(drawGrain(BW, BH));
    old.destroy(true);
  }
  private lightPool: Sprite[] = [];
  private glowPool: Sprite[] = [];
  private lightTex!: Texture;
  private sprites!: Record<string, SpriteSet>;
  private views = new Map<number, View>();
  private pickups = new Map<number, { p: Pickup; s: Sprite | Graphics }>();
  private snap: LevelSnap | null = null;
  private lavaTiles: (Pt & { t: number })[] = [];
  private wizardSets = new Map<string, SpriteSet>();
  private portal: Pt | null = null;
  private queue: GameEvent[] = [];
  private beatEnd = 0;
  private needReconcile = false;
  private fx: Fx[] = [];
  private floaters: Floater[] = [];
  private frame = 0;
  cam = { x: 0, y: 0 };
  camOff = { x: 0, y: 0 };
  followId: number | null = null;
  worldRef: World | null = null;
  ov: Overlays = { threats: new Set(), targets: new Set(), predicted: new Map(), after: null, hoverId: null, path: null, castRing: null, aim: null };
  onLog: (s: string) => void = () => {};
  onSfx: (s: string) => void = () => {};
  onPhase: (p: string) => void = () => {};
  onPing: (pid: string, x: number, y: number) => void = () => {};

  async init(canvas: HTMLCanvasElement) {
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    await this.app.init({ canvas, width: BW, height: BH, background: '#000000', antialias: false, resolution: 1, autoDensity: false, roundPixels: true, preference: 'webgl' });
    this.sprites = buildSprites();
    this.lightTex = Texture.from(lightBlob());
    this.lightRT = RenderTexture.create({ width: BW, height: BH });
    this.dark = new Graphics().rect(0, 0, BW, BH).fill({ color: 0x040206, alpha: 0.8 });
    this.lightCont.addChild(this.dark);
    this.mapSprite.scale.set(2);
    this.lavaSprite.scale.set(2);
    this.unitLayer.sortableChildren = true;
    this.ghostLayer.sortableChildren = true;
    this.world.addChild(this.mapSprite, this.lavaSprite, this.underG, this.pickupLayer, this.unitLayer);
    this.over.addChild(this.glowLayer, this.ghostLayer, this.fxG, this.uiG, this.barG, this.floatLayer);
    this.lightSprite = new Sprite(this.lightRT);
    this.grain = new Sprite(Texture.from(drawGrain(BW, BH)));
    this.app.stage.addChild(this.world, this.lightSprite, this.over, this.grain);
    this.app.ticker.add(() => this.tick());
  }

  // ------------------------------------------------------------------ events
  enqueue(evts: GameEvent[]) { if (evts.length) this.queue.push(...evts); }
  get busy() { return this.queue.length > 0 || this.anyAnim() || performance.now() < this.beatEnd; }
  private anyAnim() { for (const v of this.views.values()) if (v.path.length) return true; return false; }
  /** True when nothing is playing except (possibly) this unit's own walk, so it may keep walking. */
  freeToWalk(id: number | null) {
    if (performance.now() < this.beatEnd) return false;
    if (this.queue.some((e) => !(e.k === 'move' && e.id === id) && e.k !== 'unit' && e.k !== 'sfx')) return false;
    for (const v of this.views.values()) if (v.id !== id && v.path.length) return false;
    return true;
  }
  /** Distance still to be walked on screen by a unit. */
  pendingWalk(id: number | null) {
    const v = id != null ? this.views.get(id) : null;
    if (!v) return 0;
    let d = 0, px = v.x, py = v.y;
    for (const p of v.path) { d += Math.hypot(p.x - px, p.y - py); px = p.x; py = p.y; }
    for (const e of this.queue) if (e.k === 'move' && e.id === id) for (const p of e.path) { d += Math.hypot(p.x - px, p.y - py); px = p.x; py = p.y; }
    return d;
  }

  private step(now: number) {
    if (now < this.beatEnd) return;
    if (this.anyAnim()) {
      // A beat that only continues someone's walk may start while that walk is still animating,
      // so held-button walking (many short steps) flows without a stutter between steps.
      if (!this.queue.length) return;
      const b0 = this.queue[0].beat;
      const batch: GameEvent[] = [];
      for (const e of this.queue) { if (e.beat !== b0) break; batch.push(e); }
      const walkOnly = batch.every((e) => e.k === 'move' || e.k === 'unit' || e.k === 'sfx');
      const ids = new Set(batch.flatMap((e) => (e.k === 'move' ? [e.id] : [])));
      for (const v of this.views.values()) if (v.path.length && !ids.has(v.id)) return;
      if (!walkOnly || !ids.size) return;
    }
    if (!this.queue.length) {
      if (this.needReconcile) { this.reconcile(); this.needReconcile = false; }
      return;
    }
    const b = this.queue[0].beat;
    let dur = 0;
    let n = 0;
    while (this.queue.length && this.queue[0].beat === b && n < 200) { dur = Math.max(dur, this.play(this.queue.shift()!, now)); n++; }
    this.beatEnd = now + dur;
    this.needReconcile = true;
  }

  private play(e: GameEvent, now: number): number {
    const v = 'id' in e ? this.views.get(e.id) : undefined;
    switch (e.k) {
      case 'level': this.buildLevel(e.snap); return 250;
      case 'move': if (v) { v.path.push(...e.path); v.speed = v.owner ? RULES.MOVE_SPEED : RULES.MOVE_SPEED * 1.6; } return 0;
      case 'push': if (v) { v.path.push(...e.path); v.speed = 0.85; } return 0;
      case 'teleport': if (v) { v.x = e.x; v.y = e.y; v.path = []; } return 140;
      case 'hurt':
        if (v) {
          v.s.hp = e.hp; v.s.shield = e.shield; v.flash = 1;
          this.floater(v.x, v.y - 30 * this.scaleOf(v), `-${e.n}`, e.tone === 'poison' ? 0x9cff5a : e.tone === 'fire' ? 0xffa040 : 0xff5a4a);
        }
        return 170;
      case 'heal': if (v) { v.s.hp = e.hp; this.floater(v.x, v.y - 30 * this.scaleOf(v), `+${e.n}`, 0x7ee07e); } return 130;
      case 'die': if (v) { v.s.alive = false; v.path = []; if (UNITS[v.type].prop || UNITS[v.type].decoy) v.fade = 1; } return 220;
      case 'unit': if (v) v.s = { ...e.s }; return 0;
      case 'spawn': if (this.views.has(e.unit.id)) this.removeView(e.unit.id); this.addView(e.unit); return 160;
      case 'fx': this.fx.push({ kind: e.fx, x: e.x, y: e.y, x2: e.x2 ?? e.x, y2: e.y2 ?? e.y, r: e.r ?? 40, color: e.color, t0: now, dur: FX_DUR[e.fx] }); return FX_DUR[e.fx] * 0.55;
      case 'float': if (v) this.floater(v.x, v.y - 34 * this.scaleOf(v), e.text, e.color); return 160;
      case 'pickup': { const p = this.pickups.get(e.id); if (p) { p.s.destroy(); this.pickups.delete(e.id); } return 0; }
      case 'portal': this.portal = { x: e.x, y: e.y }; return 300;
      case 'log': this.onLog(e.text); return 0;
      case 'phase': this.onPhase(e.phase); return 0;
      case 'sfx': this.onSfx(e.s); return 0;
      case 'tiles':
        if (this.snap) { for (const c of e.changes) this.snap.map[c.y][c.x] = c.t; this.refreshMap(); }
        return 150;
      case 'torch': this.snap?.torches.push({ x: e.x, y: e.y }); return 0;
      default: return 0;
      case 'ping': this.onPing(e.pid, e.x, e.y); this.fx.push({ kind: 'ring', x: e.x, y: e.y, x2: e.x, y2: e.y, r: 40, color: 0xffd24a, t0: now, dur: 900 }); this.fx.push({ kind: 'column', x: e.x, y: e.y, x2: e.x, y2: e.y, r: 0, color: 0xffd24a, t0: now, dur: 900 }); return 0;
    }
  }

  /** Once playback settles, snap every view to the authoritative world. */
  reconcile() {
    const w = this.worldRef;
    if (!w || !this.snap || w.level !== this.snap.level) return;
    const seen = new Set<number>();
    for (const u of w.units) {
      if (u.gone) continue;
      seen.add(u.id);
      let v = this.views.get(u.id);
      if (!v) v = this.addView(u);
      v.s = statusOf(u);
      v.mini = u.mini;
      v.r = u.r;
      if (Math.hypot(v.x - u.x, v.y - u.y) > 1) { v.x = u.x; v.y = u.y; }
    }
    for (const [id, v] of this.views) if (!seen.has(id) && v.fade <= 0) this.removeView(id);
    for (const [id, p] of this.pickups) if (w.pickups.find((k) => k.id === id)?.used !== false) { p.s.destroy(); this.pickups.delete(id); }
    this.portal = w.portal;
  }

  // ------------------------------------------------------------------ level & views
  private buildLevel(snap: LevelSnap) {
    this.snap = snap;
    for (const id of [...this.views.keys()]) this.removeView(id);
    for (const p of this.pickups.values()) p.s.destroy();
    this.pickups.clear();
    this.portal = null;
    this.fx = [];
    this.lavaCanvas = document.createElement('canvas');
    this.lavaCanvas.width = snap.MW * 16;
    this.lavaCanvas.height = snap.MH * 16;
    this.lavaSprite.texture = Texture.from(this.lavaCanvas);
    this.refreshMap();
    for (const u of snap.units) this.addView(u);
    for (const p of snap.pickups) this.addPickup(p);
    const me = this.followId != null ? snap.units.find((u) => u.id === this.followId) : null;
    if (me) { this.cam.x = me.x - VIEW_W / 2; this.cam.y = me.y - VIEW_H / 2; }
    this.camOff = { x: 0, y: 0 };
  }

  /** Re-render the static map and the list of glowing liquid tiles (after a level loads or terrain changes). */
  private refreshMap() {
    const snap = this.snap;
    if (!snap || !this.lavaCanvas) return;
    this.mapSprite.texture = Texture.from(drawMap(snap));
    drawLava(this.lavaCanvas, snap, performance.now() / 1000);
    this.lavaSprite.texture.source.update();
    this.lavaTiles = [];
    for (let y = 0; y < snap.MH; y++) for (let x = 0; x < snap.MW; x++) { const t = snap.map[y][x]; if (isLiquid(t)) this.lavaTiles.push({ x: x * TILE + 16, y: y * TILE + 16, t }); }
  }

  private spriteKey(type: string) { return this.sprites[type] ? type : 'ghoul'; }
  /** Each spellwright wears its player's chosen look. */
  private setFor(type: string, owner: string | null): SpriteSet {
    if (owner && type === 'wizard') {
      const ps = this.worldRef?.players.find((p) => p.pid === owner);
      if (ps) {
        const l = ps.look;
        const key = `${l.robe}-${l.trim}-${l.orb}-${l.head}-${l.skin}`;
        let set = this.wizardSets.get(key);
        if (!set) {
          set = wizardSprite({ robe: ROBES[l.robe] ?? ROBES[0], robeHi: ROBES_HI[l.robe] ?? ROBES_HI[0], trim: TRIMS[l.trim] ?? TRIMS[0], orb: ORBS[l.orb] ?? ORBS[0], skin: SKINS[l.skin] ?? SKINS[0], head: l.head });
          this.wizardSets.set(key, set);
        }
        return set;
      }
    }
    return this.sprites[this.spriteKey(type)];
  }
  private scaleOf(v: { type: string; mini: boolean }) { return (UNITS[v.type]?.boss ? 2 : 1) * (v.mini ? 1.3 : 1); }

  private addView(u: Unit): View {
    const set = this.setFor(u.type, u.owner);
    const main = new Sprite(set.base);
    main.anchor.set(0.5, 0.85);
    const outline = new Sprite(set.outline);
    outline.anchor.set(0.5, (0.85 * 16 + 1) / 18);
    outline.visible = false;
    const flashS = new Sprite(set.white);
    flashS.anchor.set(0.5, 0.85);
    flashS.alpha = 0;
    const ghost = new Sprite(set.base);
    ghost.anchor.set(0.5, 0.85);
    this.unitLayer.addChild(outline, main, flashS);
    this.ghostLayer.addChild(ghost);
    const v: View = { id: u.id, type: u.type, x: u.x, y: u.y, r: u.r, mini: u.mini, owner: u.owner, s: statusOf(u), path: [], speed: 0.4, flip: false, flash: 0, fade: 0, main, outline, flashS, ghost };
    this.views.set(u.id, v);
    return v;
  }
  private removeView(id: number) {
    const v = this.views.get(id);
    if (!v) return;
    v.main.destroy(); v.outline.destroy(); v.flashS.destroy(); v.ghost.destroy();
    this.views.delete(id);
  }
  private addPickup(p: Pickup) {
    if (p.used) return;
    if (p.type === 'trap') {
      const g = new Graphics();
      for (const [dx, dy] of [[-6, 2], [0, -3], [6, 2], [-2, 6], [4, 7]]) {
        g.poly([p.x + dx - 3, p.y + dy + 3, p.x + dx, p.y + dy - 5, p.x + dx + 3, p.y + dy + 3]).fill({ color: 0x9a979e });
        g.rect(p.x + dx - 1, p.y + dy - 5, 1, 2).fill({ color: 0xe9e6ee });
      }
      g.rect(p.x - 11, p.y + 9, 22, 2).fill({ color: 0x2a2224 });
      this.pickupLayer.addChild(g);
      this.pickups.set(p.id, { p, s: g });
    } else {
      const s = new Sprite((this.sprites[`pot_${p.type}`] ?? this.sprites.pot_hp).base);
      s.anchor.set(0.5, 0.7);
      s.scale.set(2);
      s.position.set(p.x, p.y);
      this.pickupLayer.addChild(s);
      this.pickups.set(p.id, { p, s });
    }
  }

  private floater(x: number, y: number, text: string, color: number) {
    const t = new Text({ text, style: { fontFamily: 'VT323, monospace', fontSize: 22, fill: color, stroke: { color: 0x000000, width: 4 } } });
    t.anchor.set(0.5, 1);
    t.resolution = 1;
    t.position.set(x, y);
    this.floatLayer.addChild(t);
    this.floaters.push({ t, x, y, t0: performance.now() });
  }

  /** A spellwright's light: shrinks as the lantern runs dry; Night-eyed widens it, the Third Eye narrows it. */
  lightRadius(owner: string): number {
    const ps = this.worldRef?.players.find((p) => p.pid === owner);
    if (!ps) return 270;
    let r = 90 + 200 * Math.max(0, Math.min(1, ps.oil / Math.max(1, ps.maxOil)));
    if (ps.traits.includes('nighteye')) r *= 1.5;
    if (ps.mutations.includes('eye')) r *= 0.8;
    return r;
  }

  // ------------------------------------------------------------------ frame
  screenToWorld(bx: number, by: number): Pt { return { x: this.cam.x + bx / SC, y: this.cam.y + by / SC }; }

  private tick() {
    const now = performance.now();
    const dt = Math.min(50, this.app.ticker.deltaMS);
    this.frame++;
    this.step(now);
    for (const v of this.views.values()) {
      let budget = v.speed * dt;
      while (v.path.length && budget > 0) {
        const p = v.path[0];
        const dx = p.x - v.x, dy = p.y - v.y, d = Math.hypot(dx, dy);
        if (Math.abs(dx) > 0.5) v.flip = dx < 0;
        if (d <= budget) { v.x = p.x; v.y = p.y; v.path.shift(); budget -= d; }
        else { v.x += (dx / d) * budget; v.y += (dy / d) * budget; budget = 0; }
      }
      v.flash = Math.max(0, v.flash - dt / 260);
      if (v.fade > 0) { v.fade -= dt / 400; if (v.fade <= 0) { this.removeView(v.id); } }
    }
    if (!this.snap) return;
    // camera
    const me = this.followId != null ? this.views.get(this.followId) : null;
    const mapW = this.snap.MW * TILE, mapH = this.snap.MH * TILE;
    let tx = (me ? me.x : mapW / 2) - VIEW_W / 2 + this.camOff.x;
    let ty = (me ? me.y : mapH / 2) - VIEW_H / 2 + this.camOff.y;
    tx = mapW <= VIEW_W ? (mapW - VIEW_W) / 2 : Math.max(-40, Math.min(mapW - VIEW_W + 40, tx));
    ty = mapH <= VIEW_H ? (mapH - VIEW_H) / 2 : Math.max(-40, Math.min(mapH - VIEW_H + 40, ty));
    this.cam.x += (tx - this.cam.x) * 0.12;
    this.cam.y += (ty - this.cam.y) * 0.12;
    for (const c of [this.world, this.over]) { c.scale.set(SC); c.position.set(Math.round(-this.cam.x * SC), Math.round(-this.cam.y * SC)); }
    if (this.lavaCanvas && this.frame % 4 === 0) { drawLava(this.lavaCanvas, this.snap, now / 1000); this.lavaSprite.texture.source.update(); }
    this.drawUnits(now);
    this.drawFx(now);
    this.drawUi(now);
    this.drawBars();
    this.drawLights(now);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      const k = (now - f.t0) / 950;
      if (k >= 1) { f.t.destroy(); this.floaters.splice(i, 1); continue; }
      f.t.position.set(f.x, f.y - k * 26);
      f.t.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }
  }

  private drawUnits(now: number) {
    const g = this.underG;
    g.clear();
    for (const v of this.views.values()) {
      const set = this.setFor(v.type, v.owner);
      const s = this.scaleOf(v) * 2;
      const alive = v.s.alive && !(v.s.downed > 0);
      const bob = alive && !UNITS[v.type].prop ? Math.round(Math.sin(now / 320 + v.id) * 1) : 0;
      for (const sp of [v.main, v.flashS, v.ghost]) {
        sp.position.set(Math.round(v.x), Math.round(v.y) + bob * 2);
        sp.scale.set(v.flip ? -s : s, s);
        sp.rotation = alive ? 0 : Math.PI / 2;
      }
      v.main.texture = !alive ? set.dead : v.s.frozen > 0 ? set.ice : set.base;
      v.ghost.texture = v.main.texture;
      v.main.zIndex = v.flashS.zIndex = alive ? v.y : v.y - 10000;
      v.outline.zIndex = v.main.zIndex - 0.5;
      v.ghost.zIndex = v.main.zIndex;
      v.main.alpha = v.fade > 0 ? v.fade : 1;
      v.ghost.alpha = (alive ? 0.42 : 0.22) * v.main.alpha;
      v.flashS.alpha = v.flash * 0.9;
      const threat = alive && this.ov.threats.has(v.id);
      const targeted = this.ov.targets.has(v.id);
      v.outline.visible = threat || targeted || (this.ov.hoverId === v.id && alive);
      if (v.outline.visible) {
        v.outline.texture = set.outline;
        v.outline.tint = targeted ? 0xffd24a : threat ? 0xff2a2a : 0xe9dcc0;
        v.outline.position.copyFrom(v.main.position);
        v.outline.scale.copyFrom(v.main.scale);
        v.outline.rotation = v.main.rotation;
      }
      if (v.s.downed > 0 && v.s.alive) {
        const pulse = 0.5 + 0.5 * Math.sin(now / 160);
        g.circle(v.x, v.y, 22 + pulse * 6).stroke({ width: 2, color: 0xff3a2a, alpha: 0.5 + 0.5 * pulse });
        v.main.texture = set.base;
        v.main.alpha = 0.85;
        continue;
      }
      if (!alive) {
        g.ellipse(v.x, v.y + 4, 12 * s / 2, 5 * s / 2).fill({ color: 0x3a0608, alpha: 0.75 });
        continue;
      }
      g.ellipse(v.x, v.y + 6, 9 * s / 2, 3.5 * s / 2).fill({ color: 0x000000, alpha: 0.5 });
      if (v.owner) g.ellipse(v.x, v.y + 6, 12 * s / 2, 5 * s / 2).stroke({ width: 2, color: 0xb58cff, alpha: 0.9 });
      else if (v.s.faction === 'player' && !UNITS[v.type].prop) g.ellipse(v.x, v.y + 6, 12 * s / 2, 5 * s / 2).stroke({ width: 2, color: 0x5fd06a, alpha: 0.9 });
      if (v.mini) g.ellipse(v.x, v.y + 6, 14 * s / 2, 6 * s / 2).stroke({ width: 2, color: 0xe0b040, alpha: 0.9 });
    }
  }

  private drawFx(now: number) {
    const g = this.fxG;
    g.clear();
    this.fx = this.fx.filter((f) => now - f.t0 < f.dur);
    for (const f of this.fx) {
      const t = Math.max(0, Math.min(1, (now - f.t0) / f.dur));
      const a = 1 - t;
      switch (f.kind) {
        case 'ring': g.circle(f.x, f.y, f.r * (0.35 + 0.65 * t)).stroke({ width: 3, color: f.color, alpha: a }); break;
        case 'line': g.moveTo(f.x, f.y).lineTo(f.x2, f.y2).stroke({ width: 3, color: f.color, alpha: a * 0.9 }); break;
        case 'proj': {
          const x = f.x + (f.x2 - f.x) * t, y = f.y + (f.y2 - f.y) * t;
          const bx = f.x + (f.x2 - f.x) * Math.max(0, t - 0.25), by = f.y + (f.y2 - f.y) * Math.max(0, t - 0.25);
          g.moveTo(bx, by).lineTo(x, y).stroke({ width: 3, color: f.color, alpha: 0.8 });
          g.rect(x - 3, y - 3, 6, 6).fill({ color: f.color });
          break;
        }
        case 'lob': {
          const x = f.x + (f.x2 - f.x) * t, y = f.y + (f.y2 - f.y) * t - Math.sin(Math.PI * t) * 90;
          g.rect(x - 5, y - 5, 10, 10).fill({ color: f.color });
          break;
        }
        case 'burst':
          for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * Math.PI * 2 + f.x * 0.01;
            const d = 6 + t * (22 + (i % 3) * 8);
            g.rect(f.x + Math.cos(ang) * d - 2, f.y + Math.sin(ang) * d - 2 - t * 6, 4, 4).fill({ color: f.color, alpha: a });
          }
          break;
        case 'column':
          g.rect(f.x - 7, f.y - 90 * (0.3 + 0.7 * Math.min(1, t * 2)), 14, 90 * (0.3 + 0.7 * Math.min(1, t * 2))).fill({ color: f.color, alpha: a * 0.55 });
          g.rect(f.x - 2, f.y - 100, 4, 100).fill({ color: 0xffffff, alpha: a * 0.6 });
          break;
        case 'slash': {
          const st = -2.2 + t * 2.6;
          g.arc(f.x, f.y - 10, 20, st, st + 1.2).stroke({ width: 4, color: f.color, alpha: a });
          break;
        }
        case 'bolt': {
          const n = 7;
          g.moveTo(f.x, f.y);
          for (let i = 1; i < n; i++) {
            const k = i / n, j = ((i * 37 + Math.floor(now / 50)) % 9) - 4;
            g.lineTo(f.x + (f.x2 - f.x) * k + j * 3, f.y + (f.y2 - f.y) * k - j * 3);
          }
          g.lineTo(f.x2, f.y2).stroke({ width: 3, color: f.color, alpha: a });
          break;
        }
        case 'blink':
          g.circle(f.x, f.y - 8, 6 + t * 26).stroke({ width: 3, color: f.color, alpha: a });
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            g.rect(f.x + Math.cos(ang) * t * 30 - 2, f.y - 8 + Math.sin(ang) * t * 30 - 2, 4, 4).fill({ color: f.color, alpha: a });
          }
          break;
      }
    }
  }

  private drawUi(now: number) {
    const g = this.uiG;
    g.clear();
    const o = this.ov;
    if (this.portal) {
      const p = this.portal;
      for (let i = 0; i < 4; i++) {
        const k = ((now / 900 + i / 4) % 1);
        g.ellipse(p.x, p.y, 22 * (1 - k) + 4, 10 * (1 - k) + 2).stroke({ width: 3, color: i % 2 ? 0xb03030 : 0xb48cff, alpha: 0.4 + 0.6 * k });
      }
      g.ellipse(p.x, p.y, 8, 4).fill({ color: 0x000000 });
    }
    for (const w of this.snap?.wells ?? []) {
      for (let i = 0; i < 3; i++) {
        const k = ((now / 1400 + i / 3) % 1);
        g.circle(w.x, w.y, 200 * (1 - k)).stroke({ width: 2, color: 0x8060ff, alpha: 0.35 * k });
      }
      g.circle(w.x, w.y, 6).fill({ color: 0x1a1030 }).stroke({ width: 2, color: 0xc0a0ff });
    }
    for (const t of this.snap?.torches ?? []) {
      const f = Math.sin(now / 90 + t.x) * 1.5;
      g.rect(t.x - 2, t.y + 2, 4, 8).fill({ color: 0x5a3a1a });
      g.rect(t.x - 4, t.y - 6 + f, 8, 8).fill({ color: 0xff7a1e });
      g.rect(t.x - 2, t.y - 10 + f, 4, 8).fill({ color: 0xffd06a });
    }
    if (o.path) {
      let used = 0;
      let prev: Pt | null = null;
      for (const p of o.path.pts) {
        if (prev) {
          const d = Math.hypot(p.x - prev.x, p.y - prev.y);
          const within = used + d <= o.path.limit;
          g.moveTo(prev.x, prev.y).lineTo(p.x, p.y).stroke({ width: 2, color: within ? 0xe0c040 : 0x8a2a2a, alpha: 0.85 });
          used += d;
        }
        prev = p;
      }
      if (prev) g.rect(prev.x - 3, prev.y - 3, 6, 6).fill({ color: used <= o.path.limit ? 0xe0c040 : 0x8a2a2a });
    }
    if (o.castRing) {
      const r = o.castRing;
      const n = 64;
      for (let i = 0; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
        g.moveTo(r.x + Math.cos(a0) * r.r, r.y + Math.sin(a0) * r.r).lineTo(r.x + Math.cos(a1) * r.r, r.y + Math.sin(a1) * r.r);
      }
      g.stroke({ width: 2, color: 0xb48cff, alpha: 0.7 });
    }
    if (o.aim) {
      g.moveTo(o.aim.from.x, o.aim.from.y).lineTo(o.aim.to.x, o.aim.to.y).stroke({ width: 2, color: o.aim.ok ? 0xb48cff : 0xc03030, alpha: 0.6 });
      g.circle(o.aim.to.x, o.aim.to.y, 8).stroke({ width: 2, color: o.aim.ok ? 0xffd24a : 0xc03030 });
    }
    const hv = o.hoverId != null ? this.views.get(o.hoverId) : null;
    if (hv && hv.s.alive && hv.s.faction === 'enemy' && this.worldRef) {
      const u = this.worldRef.units.find((x) => x.id === hv.id);
      if (u && u.range > 0) {
        g.circle(hv.x, hv.y, u.range).stroke({ width: 2, color: 0xff3a2a, alpha: 0.55 });
        if (u.maxStam > 0) g.circle(hv.x, hv.y, u.range + u.maxStam).stroke({ width: 1, color: 0xff3a2a, alpha: 0.2 });
      }
    }
  }

  private drawBars() {
    const g = this.barG;
    g.clear();
    const o = this.ov;
    for (const v of this.views.values()) {
      if (!v.s.alive || v.fade > 0) continue;
      const s = this.scaleOf(v);
      if (v.s.downed > 0) { g.rect(Math.round(v.x) - 14, Math.round(v.y) - 30, 28, 4).fill({ color: 0xff3a2a }); continue; }
      const w = 30 * s, x = Math.round(v.x - w / 2), y = Math.round(v.y - 34 * s - 6);
      const pct = Math.max(0, v.s.hp / v.s.maxHp);
      g.rect(x - 2, y - 2, w + 4, 8).fill({ color: 0x000000, alpha: 0.85 });
      const col = v.owner ? 0x9a5ad0 : v.s.faction === 'player' ? 0x4fb05a : 0xc0262a;
      g.rect(x, y, w * pct, 4).fill({ color: col });
      const after = o.after?.get(v.id);
      const pred = o.predicted.get(v.id) ?? 0;
      let lo = v.s.hp;
      if (after && after.hp < v.s.hp) lo = after.hp;
      else if (pred > 0) lo = Math.max(0, v.s.hp - Math.max(0, pred - v.s.shield));
      if (lo < v.s.hp) g.rect(x + w * (lo / v.s.maxHp), y, w * ((v.s.hp - lo) / v.s.maxHp), 4).fill({ color: 0xffd24a });
      if (after && !after.alive) {
        // little skull: this body dies if you cast
        const sx = Math.round(v.x) - 6, sy = y - 18;
        g.rect(sx, sy, 12, 8).fill({ color: 0xe9dcc0 }).rect(sx + 2, sy + 8, 8, 4).fill({ color: 0xe9dcc0 });
        g.rect(sx + 2, sy + 3, 3, 3).fill({ color: 0x1a0808 }).rect(sx + 7, sy + 3, 3, 3).fill({ color: 0x1a0808 });
        g.rect(sx + 4, sy + 10, 1, 2).fill({ color: 0x1a0808 }).rect(sx + 7, sy + 10, 1, 2).fill({ color: 0x1a0808 });
      }
      if (v.s.shield > 0) g.rect(x, y - 3, Math.min(w, w * (v.s.shield / v.s.maxHp)), 2).fill({ color: 0x6fd0ff });
      const pips: number[] = [];
      if (v.s.poison) pips.push(0x9cff5a);
      if (v.s.frozen) pips.push(0x9fe8ff);
      if (v.s.frail) pips.push(0xa36cd0);
      if (v.s.fetter) pips.push(0x8a8a9a);
      if (v.s.bloat) pips.push(0xe0a030);
      if (v.s.burn) pips.push(0xff7a2a);
      if (v.s.weak) pips.push(0x8a6a4a);
      if (v.s.fortify) pips.push(0xcfd4e0);
      if (v.s.wet) pips.push(0x3a7ad8);
      pips.forEach((c, i) => g.rect(x + i * 7, y + 6, 5, 5).fill({ color: c }).stroke({ width: 1, color: 0 }));
      // affixes: small diamonds to the right of the bar
      (v.s.affixes ?? []).forEach((a, i) => {
        const dx = x + w + 6 + i * 9, dy = y + 2;
        g.poly([dx, dy - 4, dx + 4, dy, dx, dy + 4, dx - 4, dy]).fill({ color: AFFIXES[a]?.color ?? 0xffffff }).stroke({ width: 1, color: 0 });
      });
      // bounty: a gold coin over the head
      if (v.s.bounty) {
        const cx = Math.round(v.x), cy = y - 12;
        g.circle(cx, cy, 5).fill({ color: 0xe0b040 }).stroke({ width: 1, color: 0x3a2a08 });
        g.rect(cx - 1, cy - 3, 2, 6).fill({ color: 0x8a6a10 });
      }
      // soul fragments: little blue flames under a soulbinder's bar
      if (v.owner && (v.s.maxSouls ?? 0) > 0) {
        for (let i = 0; i < v.s.maxSouls; i++) g.rect(x + i * 5, y - 7, 3, 3).fill({ color: i < v.s.souls ? 0x9fe8ff : 0x203040 });
      }
    }
  }

  private drawLights(now: number) {
    let li = 0, gi = 0;
    const L = (x: number, y: number, r: number, a: number) => {
      const bx = (x - this.cam.x) * SC, by = (y - this.cam.y) * SC, br = r * SC;
      if (bx < -br || by < -br || bx > BW + br || by > BH + br) return;
      let s = this.lightPool[li];
      if (!s) { s = new Sprite(this.lightTex); s.anchor.set(0.5); s.blendMode = 'erase'; this.lightPool.push(s); this.lightCont.addChild(s); }
      s.visible = true;
      s.position.set(bx, by);
      s.scale.set((br * 2) / 64);
      s.alpha = a;
      li++;
    };
    const G = (x: number, y: number, r: number, color: number, a: number) => {
      let s = this.glowPool[gi];
      if (!s) { s = new Sprite(this.lightTex); s.anchor.set(0.5); s.blendMode = 'add'; this.glowPool.push(s); this.glowLayer.addChild(s); }
      s.visible = true;
      s.position.set(x, y);
      s.scale.set((r * 2) / 64);
      s.tint = color;
      s.alpha = a;
      gi++;
    };
    for (const v of this.views.values()) {
      if (!v.s.alive) continue;
      if (v.owner) L(v.x, v.y, this.lightRadius(v.owner) + Math.sin(now / 130) * 6, 1);
      else if (v.s.faction === 'player') L(v.x, v.y, 110, 0.6);
    }
    const torchCol = (BIOMES[this.snap?.biome ?? 'cellars'] ?? BIOMES.cellars).pal.torch;
    for (const t of this.snap?.torches ?? []) {
      const fl = Math.sin(now / 90 + t.x) * 6 + Math.sin(now / 37 + t.y) * 3;
      L(t.x, t.y, 170 + fl, 0.95);
      G(t.x, t.y, 120 + fl, torchCol, 0.22);
    }
    for (const p of this.lavaTiles) if (p.t !== T_WATER) L(p.x, p.y, p.t === T_LAVA ? 60 : 40, p.t === T_LAVA ? 0.55 : 0.3);
    for (let i = 0; i < this.lavaTiles.length; i += 2) {
      const p = this.lavaTiles[i];
      if (p.t === T_WATER) continue;
      G(p.x, p.y, 70, p.t === T_LAVA ? 0xff4a10 : p.t === 5 ? 0xc0101a : 0x7a9a20, p.t === T_LAVA ? 0.16 : 0.1);
    }
    for (const w of this.snap?.wells ?? []) { L(w.x, w.y, 120, 0.6); G(w.x, w.y, 90, 0x8060ff, 0.3); }
    if (this.portal) { L(this.portal.x, this.portal.y, 180, 1); G(this.portal.x, this.portal.y, 90, 0xb48cff, 0.35); }
    for (const f of this.fx) { L(f.x2 ?? f.x, f.y2 ?? f.y, 110, 0.7); G(f.x, f.y, 60, f.color, 0.25); }
    for (let i = li; i < this.lightPool.length; i++) this.lightPool[i].visible = false;
    for (let i = gi; i < this.glowPool.length; i++) this.glowPool[i].visible = false;
    this.app.renderer.render({ container: this.lightCont, target: this.lightRT, clear: true });
  }
}

import * as THREE from 'three';
import { TILE, T_WALL } from '../sim/constants';
import { BIOMES, type BiomeDef } from '../sim/biomes';
import type { LevelSnap, Pt } from '../sim/types';

// The 3D view ("HD-2D"): the same game, seen from a tilted camera. Floors are the game's own map art,
// walls are real blocks (or trees in forests), characters stand up as lit pixel-art cards, and every
// aiming shape, spell effect and marker the 2D renderer draws is painted onto the floor as a decal.
// It decides nothing and owns no game state: GameRenderer feeds it what to show each frame.
//
// One world unit is one game unit (a tile is 32). X is east, Z is south, Y is up.

/** How steeply the camera looks down. Steep enough that walls rarely hide anyone, shallow enough to feel 3D. */
export const PITCH = (54 * Math.PI) / 180;
/** Upright cards are stretched by this so they read at full height through the tilted camera. */
const LIFT = 1 / Math.cos(PITCH);
const VFOV = 30;
const WALL_H = 44;
const N_LIGHTS = 10;

export interface UnitDraw {
  id: number; x: number; y: number;
  /** Card size in world units (32 = an ordinary 16px sprite drawn double). */
  size: number;
  flip: boolean; alive: boolean; bob: number;
  tex: HTMLCanvasElement; white: HTMLCanvasElement; outlineTex: HTMLCanvasElement;
  outline: number | null; flash: number; alpha: number; ghost: number;
}
/** An effect in flight (projectile, beam, lightning, column, burst...), t from 0 to 1. */
export interface Fx3 { kind: string; x: number; y: number; x2: number; y2: number; r: number; color: number; t: number; seed: number }
/** A spell going off: its colour and where it lands. */
export interface Spell3 { pts: Pt[]; color: number; t: number; seed: number }
export interface Light3 { x: number; y: number; h: number; r: number; i: number; color: number }
export interface Frame3 {
  /** Centre of the view on the ground and the size of ground the 2D view would show. */
  cx: number; cy: number; viewW: number; viewH: number;
  units: UnitDraw[];
  lights: Light3[];
  /** Spellwrights and the hovered body: walls just south of these fade so nobody is ever hidden. */
  focus: Pt[];
  torches: Pt[];
  reveal: boolean;
  /** Camera turn around the view centre, radians (0 = looking north). */
  yaw: number;
  fx: Fx3[];
  spells: Spell3[];
  decalDirty: boolean;
  liquidDirty: boolean;
}

interface Card { main: THREE.Mesh; outline: THREE.Mesh; flash: THREE.Mesh; ghost: THREE.Mesh; group: THREE.Group; last: HTMLCanvasElement | null }

/** Plane whose pivot sits on the sprite's feet (85% of the way down, as in 2D). */
const cardGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.35, 0);
/** The outline is an 18px silhouette around a 16px sprite. */
const outlineGeo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5 - (1 - (0.85 * 16 + 1) / 18), 0);

const css = (c: number) => '#' + c.toString(16).padStart(6, '0');

export class View3D {
  readonly canvas: HTMLCanvasElement;
  readonly hud: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(VFOV, 1.6, 10, 5000);
  private level = new THREE.Group();
  private cards = new Map<number, Card>();
  private texCache = new WeakMap<HTMLCanvasElement, THREE.CanvasTexture>();
  private pointLights: THREE.PointLight[] = [];
  private amb = new THREE.AmbientLight(0xffffff, 0.3);
  private hemi = new THREE.HemisphereLight(0xd8f0c0, 0x1a2410, 0);
  private groundTex: THREE.CanvasTexture | null = null;
  private liquidTex: THREE.CanvasTexture | null = null;
  private decalTex: THREE.CanvasTexture | null = null;
  private walls: { solid: THREE.InstancedMesh; faded: THREE.InstancedMesh; mats: THREE.Matrix4[]; tiles: Pt[] }[] = [];
  private fadedNow = new Set<number>();
  private flames: THREE.Mesh[] = [];
  private flameCount = -1;
  private biome: BiomeDef = BIOMES.cellars;
  private ray = new THREE.Raycaster();
  private cssW = 640; private cssH = 400; private dpr = 1;
  private frameN = 0;
  /** Pixels on screen per world unit near the middle of the view (sizes HUD text and bars). */
  private lights: Light3[] = [];
  private ambLevel = 0.3;
  private yaw = 0;
  private lastFadeYaw = 0;
  private glow: THREE.Sprite[] = [];
  private gi = 0;
  private glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();

  constructor(stage: HTMLElement, before: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.hud = document.createElement('canvas');
    for (const c of [this.canvas, this.hud]) {
      c.style.cssText = 'position:absolute;display:none;pointer-events:none;';
      stage.insertBefore(c, before);
    }
    this.canvas.style.background = '#000';
    this.ctx = this.hud.getContext('2d')!;
    this.gl = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!(globalThis as { __agPreserve?: boolean }).__agPreserve });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.25;
    this.scene.add(this.level, this.amb, this.hemi);
    // A fixed pool of lights: the count never changes, so shaders never recompile mid-fight.
    for (let i = 0; i < N_LIGHTS; i++) {
      const l = new THREE.PointLight(0xffc070, 0, 100, 0);
      this.pointLights.push(l);
      this.scene.add(l);
    }
  }

  show(on: boolean) { for (const c of [this.canvas, this.hud]) c.style.display = on ? 'block' : 'none'; }

  /** Place both canvases exactly over the game canvas (CSS pixels, relative to the stage). */
  place(left: number, top: number, w: number, h: number) {
    for (const c of [this.canvas, this.hud]) Object.assign(c.style, { left: `${left}px`, top: `${top}px`, width: `${w}px`, height: `${h}px` });
    const dpr = Math.min(1.5, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
    if (w === this.cssW && h === this.cssH && dpr === this.dpr) return;
    this.cssW = Math.max(10, w); this.cssH = Math.max(10, h); this.dpr = dpr;
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(this.cssW, this.cssH, false);
    this.hud.width = Math.round(this.cssW * dpr);
    this.hud.height = Math.round(this.cssH * dpr);
    this.camera.aspect = this.cssW / this.cssH;
    this.camera.updateProjectionMatrix();
  }

  private tex(c: HTMLCanvasElement, nearest = true): THREE.CanvasTexture {
    let t = this.texCache.get(c);
    if (!t) {
      t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      if (nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
      this.texCache.set(c, t);
    }
    return t;
  }

  // ------------------------------------------------------------------ level
  buildLevel(snap: LevelSnap, ground: HTMLCanvasElement, liquid: HTMLCanvasElement, decal: HTMLCanvasElement) {
    for (const c of [...this.cards.keys()]) this.dropCard(c);
    this.level.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && m.geometry !== cardGeo && m.geometry !== outlineGeo) m.geometry.dispose();
    });
    this.level.clear();
    this.walls = [];
    this.flames = [];
    this.flameCount = -1;
    this.fadedNow.clear();
    this.biome = BIOMES[snap.biome] ?? BIOMES.cellars;
    const W = snap.MW * TILE, H = snap.MH * TILE;
    const flat = (mat: THREE.Material, y: number, order = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(W / 2, y, H / 2);
      m.renderOrder = order;
      this.level.add(m);
      return m;
    };
    this.groundTex?.dispose();
    this.groundTex = new THREE.CanvasTexture(ground);
    this.groundTex.colorSpace = THREE.SRGBColorSpace;
    this.groundTex.magFilter = THREE.NearestFilter;
    this.groundTex.anisotropy = 4;
    flat(new THREE.MeshLambertMaterial({ map: this.groundTex }), 0);
    // a dark apron so the edge of the map fades into nothing rather than a cliff
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(W + 4000, H + 4000), new THREE.MeshBasicMaterial({ color: 0x030203 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(W / 2, -1, H / 2); this.level.add(apron);
    this.liquidTex?.dispose();
    this.liquidTex = new THREE.CanvasTexture(liquid);
    this.liquidTex.colorSpace = THREE.SRGBColorSpace;
    this.liquidTex.magFilter = THREE.NearestFilter;
    flat(new THREE.MeshLambertMaterial({ map: this.liquidTex, emissive: 0xffffff, emissiveMap: this.liquidTex, emissiveIntensity: 0.45, transparent: true, depthWrite: false }), 0.4, 1);
    this.decalTex?.dispose();
    this.decalTex = new THREE.CanvasTexture(decal);
    this.decalTex.colorSpace = THREE.SRGBColorSpace;
    this.decalTex.premultiplyAlpha = false;
    this.decalTex.anisotropy = 4;
    flat(new THREE.MeshBasicMaterial({ map: this.decalTex, transparent: true, depthWrite: false, toneMapped: false }), 1.2, 2);
    this.buildWalls(snap);
    const forest = this.biome.style === 'forest';
    const fog = forest ? 0x0c140c : 0x040306;
    this.scene.background = new THREE.Color(0x030203);
    this.scene.fog = new THREE.Fog(fog, 900, 2600);
    this.hemi.color.set(this.biome.music === 0 && forest ? 0xd8f0c0 : 0x8aa0c8);
  }

  /** Ground art changed (a level loaded, terrain shifted). */
  refreshGround(snap: LevelSnap, ground: HTMLCanvasElement) {
    if (this.groundTex) { this.groundTex.image = ground; this.groundTex.needsUpdate = true; }
    this.buildWallsAgain(snap);
  }
  private lastWallKey = '';
  private buildWallsAgain(snap: LevelSnap) {
    const key = snap.map.map((r) => r.map((t) => (t === T_WALL ? 1 : 0)).join('')).join('');
    if (key === this.lastWallKey) return;
    for (const w of this.walls) { this.level.remove(w.solid, w.faded); w.solid.geometry.dispose(); }
    this.walls = [];
    this.buildWalls(snap);
  }

  private buildWalls(snap: LevelSnap) {
    this.lastWallKey = snap.map.map((r) => r.map((t) => (t === T_WALL ? 1 : 0)).join('')).join('');
    const { MW, MH, map } = snap;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= MW || y >= MH ? T_WALL : map[y][x]);
    const near = (x: number, y: number, r: number) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (at(x + dx, y + dy) !== T_WALL) return true;
      return false;
    };
    const pal = this.biome.pal;
    const h = (x: number, y: number, s: number) => { let k = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; k = Math.imul(k ^ (k >>> 13), 1274126177); return ((k ^ (k >>> 16)) >>> 0) / 4294967296; };
    const edge: Pt[] = [], deep: Pt[] = [];
    for (let y = -1; y <= MH; y++) for (let x = -1; x <= MW; x++) {
      if (at(x, y) !== T_WALL) continue;
      if (near(x, y, 1)) edge.push({ x, y });
      else if (near(x, y, 2)) deep.push({ x, y });
    }
    const family = (geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], tiles: Pt[], place: (p: Pt, m: THREE.Matrix4, i: number) => void, color?: (p: Pt) => THREE.Color) => {
      if (!tiles.length) return;
      const mats: THREE.Matrix4[] = tiles.map((p, i) => { const m = new THREE.Matrix4(); place(p, m, i); return m; });
      const fadeMat = (Array.isArray(mat) ? mat : [mat]).map((m) => { const f = m.clone(); f.transparent = true; f.opacity = 0.22; f.depthWrite = false; return f; });
      const solid = new THREE.InstancedMesh(geo, mat, tiles.length);
      const faded = new THREE.InstancedMesh(geo, Array.isArray(mat) ? fadeMat : fadeMat[0], tiles.length);
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      tiles.forEach((p, i) => {
        solid.setMatrixAt(i, mats[i]); faded.setMatrixAt(i, zero);
        if (color) { const c = color(p); solid.setColorAt(i, c); faded.setColorAt(i, c); }
      });
      faded.renderOrder = 5;
      this.level.add(solid, faded);
      this.walls.push({ solid, faded, mats, tiles });
    };
    const q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Euler();
    const compose = (m: THREE.Matrix4, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0) => {
      q.setFromEuler(e.set(rx, ry, 0)); m.compose(v.set(x, y, z), q, s.set(sx, sy, sz));
    };
    if (this.biome.style === 'forest') {
      const bark = new THREE.MeshLambertMaterial({ map: this.tex(barkCanvas(pal)) });
      const leaves = new THREE.MeshLambertMaterial({ map: this.tex(leafCanvas(pal)), flatShading: true });
      const bush = new THREE.MeshLambertMaterial({ color: pal.top });
      const all = [...edge, ...deep.filter((p) => h(p.x, p.y, 1) < 0.6)];
      const trees = all.filter((p) => h(p.x, p.y, 2) < (edge.includes(p) ? 0.85 : 1));
      family(new THREE.BoxGeometry(TILE, 12, TILE), bush, [...edge, ...deep], (p, m) => compose(m, p.x * TILE + 16, 6, p.y * TILE + 16, 1, 1, 1));
      family(new THREE.CylinderGeometry(6, 9, 1, 7).translate(0, 0.5, 0), bark, trees, (p, m) => {
        const ht = 34 + h(p.x, p.y, 3) * 18;
        compose(m, p.x * TILE + 16 + (h(p.x, p.y, 4) - 0.5) * 12, 0, p.y * TILE + 16 + (h(p.x, p.y, 5) - 0.5) * 12, 1, ht, 1);
      });
      family(new THREE.IcosahedronGeometry(1, 1), leaves, trees, (p, m) => {
        const ht = 34 + h(p.x, p.y, 3) * 18, r = 19 + h(p.x, p.y, 6) * 8;
        compose(m, p.x * TILE + 16 + (h(p.x, p.y, 4) - 0.5) * 16, ht + r * 0.35, p.y * TILE + 16 + (h(p.x, p.y, 5) - 0.5) * 16, r, r * 0.8, r, h(p.x, p.y, 7) * 6, h(p.x, p.y, 8) * 2);
      }, (p) => new THREE.Color(pal.top).offsetHSL((h(p.x, p.y, 9) - 0.5) * 0.04, 0.05, 0.04 + h(p.x, p.y, 10) * 0.08));
    } else {
      const side = new THREE.MeshLambertMaterial({ map: this.tex(brickCanvas(pal)) });
      const topCol = new THREE.Color(pal.top).lerp(new THREE.Color(pal.faceHi), 0.6);
      const top = new THREE.MeshLambertMaterial({ color: topCol, emissive: topCol.clone().multiplyScalar(0.35) });
      // Only walls beside the floor get raised; the void beyond stays black, like the 2D view.
      family(new THREE.BoxGeometry(TILE, WALL_H, TILE), [side, side, top, top, side, side], edge, (p, m) => compose(m, p.x * TILE + 16, WALL_H / 2, p.y * TILE + 16, 1, 1, 1));
    }
  }

  // ------------------------------------------------------------------ units
  private card(id: number): Card {
    let c = this.cards.get(id);
    if (c) return c;
    const mk = (geo: THREE.BufferGeometry, opts: THREE.MeshBasicMaterialParameters) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, fog: false, ...opts }));
    const main = mk(cardGeo, { alphaTest: 0.5, transparent: false });
    const outline = mk(outlineGeo, { alphaTest: 0.5, transparent: false, toneMapped: false });
    const flash = mk(cardGeo, { depthWrite: false, toneMapped: false });
    const ghost = mk(cardGeo, { depthTest: false, depthWrite: false });
    outline.position.z = -0.6;
    flash.position.z = 0.4;
    ghost.renderOrder = 20;
    main.userData.id = id;
    const group = new THREE.Group();
    group.add(outline, main, flash, ghost);
    this.scene.add(group);
    c = { main, outline, flash, ghost, group, last: null };
    this.cards.set(id, c);
    return c;
  }
  private dropCard(id: number) {
    const c = this.cards.get(id);
    if (!c) return;
    this.scene.remove(c.group);
    for (const m of [c.main, c.outline, c.flash, c.ghost]) (m.material as THREE.Material).dispose();
    this.cards.delete(id);
  }

  /** How lit a spot on the ground is (0..1+), using the same lights the scene uses. */
  private litAt(x: number, y: number): number {
    let b = this.ambLevel;
    for (const l of this.lights) {
      const d = Math.hypot(l.x - x, l.y - y, l.h - 20);
      if (d >= l.r) continue;
      const k = 1 - (d / l.r) ** 4;
      b += l.i * k * k * 0.55;
    }
    return Math.min(1.05, b);
  }

  // ------------------------------------------------------------------ frame
  frame(f: Frame3) {
    this.frameN++;
    // camera: look at the same patch of ground the 2D view would show, from the south and above
    const tanV = Math.tan(((VFOV / 2) * Math.PI) / 180), tanH = tanV * this.camera.aspect;
    const D = Math.max(f.viewW / (2 * tanH), (f.viewH * Math.sin(PITCH)) / (2 * tanV)) * 0.92;
    this.yaw = f.yaw;
    const hz = D * Math.cos(PITCH);
    this.camera.position.set(f.cx + Math.sin(f.yaw) * hz, D * Math.sin(PITCH), f.cy + Math.cos(f.yaw) * hz);
    this.camera.lookAt(f.cx, 0, f.cy);
    this.camera.near = Math.max(4, D * 0.2);
    this.camera.far = D * 4 + 400;
    this.camera.updateProjectionMatrix();
    if (this.scene.fog instanceof THREE.Fog) { this.scene.fog.near = D * 1.15; this.scene.fog.far = D * 2.6 + 300; }

    // light: ambient from the place's darkness, then the brightest few lamps
    const forest = this.biome.style === 'forest';
    const dark = this.biome.dark ?? 0.8;
    this.ambLevel = f.reveal ? Math.max(0.55, 1 - dark) : (1 - dark) * (forest ? 1.05 : 0.9);
    this.amb.intensity = forest ? this.ambLevel * 0.9 : this.ambLevel * 1.6;
    this.amb.color.set(forest ? 0xe8f0d8 : 0x9a8aaa);
    this.hemi.intensity = forest ? this.ambLevel * 1.4 : 0;
    this.lights = f.lights.slice(0, N_LIGHTS);
    this.pointLights.forEach((pl, i) => {
      const l = this.lights[i];
      if (!l) { pl.intensity = 0; pl.visible = false; return; }
      pl.visible = true;
      pl.position.set(l.x, l.h, l.y);
      pl.distance = l.r;
      pl.intensity = l.i * 2.4;
      pl.color.set(l.color);
    });

    // characters
    const seen = new Set<number>();
    for (const u of f.units) {
      seen.add(u.id);
      const c = this.card(u.id);
      const mm = c.main.material as THREE.MeshBasicMaterial;
      if (c.last !== u.tex) {
        c.last = u.tex;
        mm.map = this.tex(u.tex);
        (c.ghost.material as THREE.MeshBasicMaterial).map = mm.map;
        (c.flash.material as THREE.MeshBasicMaterial).map = this.tex(u.white);
        (c.outline.material as THREE.MeshBasicMaterial).map = this.tex(u.outlineTex);
        for (const m of [c.main, c.ghost, c.flash, c.outline]) (m.material as THREE.Material).needsUpdate = true;
      }
      const w = u.size * (u.flip ? -1 : 1);
      c.group.position.set(u.x, u.alive ? u.bob : 0.8, u.y);
      if (u.alive) c.group.rotation.set(0, f.yaw, 0);
      else c.group.rotation.set(-Math.PI / 2, 0, 0);
      for (const m of [c.main, c.flash, c.ghost]) m.scale.set(w, u.alive ? u.size * LIFT : u.size, 1);
      c.outline.scale.set(w * (18 / 16), (u.alive ? u.size * LIFT : u.size) * (18 / 16), 1);
      const lit = this.litAt(u.x, u.y);
      mm.color.setScalar(Math.max(0.12, lit));
      mm.opacity = u.alpha;
      mm.transparent = u.alpha < 1;
      c.main.renderOrder = u.alpha < 1 ? 6 : 0;
      (c.ghost.material as THREE.MeshBasicMaterial).opacity = u.ghost * 0.85;
      c.ghost.visible = u.ghost > 0.01;
      (c.flash.material as THREE.MeshBasicMaterial).opacity = u.flash;
      c.flash.visible = u.flash > 0.01;
      c.outline.visible = u.outline != null;
      if (u.outline != null) (c.outline.material as THREE.MeshBasicMaterial).color.set(u.outline);
    }
    for (const id of [...this.cards.keys()]) if (!seen.has(id)) this.dropCard(id);

    // walls just south of the spellwrights (and whatever you're pointing at) turn see-through
    if (this.frameN % 4 === 0 || Math.abs(f.yaw - this.lastFadeYaw) > 0.05) { this.lastFadeYaw = f.yaw; this.fadeWalls(f.focus); }
    this.drawEffects(f.fx, f.spells);

    // torch flames
    if (f.torches.length !== this.flameCount) {
      for (const m of this.flames) { this.level.remove(m); }
      this.flames = f.torches.map((t) => {
        const m = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: this.biome.pal.torch, toneMapped: false }));
        m.position.set(t.x, 30, t.y);
        this.level.add(m);
        return m;
      });
      this.flameCount = f.torches.length;
    }
    const now = performance.now();
    this.flames.forEach((m, i) => { m.scale.y = 1 + Math.sin(now / 90 + i * 2.1) * 0.25; });

    if (f.decalDirty && this.decalTex) this.decalTex.needsUpdate = true;
    if (f.liquidDirty && this.liquidTex) this.liquidTex.needsUpdate = true;
    this.gl.render(this.scene, this.camera);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.hud.width, this.hud.height);
  }

  private fadeWalls(focus: Pt[]) {
    const tall = this.biome.style === 'forest' ? 3 : 2;
    const want = new Set<number>();
    // "in front" means between the body and the camera, whichever way the camera is turned
    const cdx = Math.sin(this.yaw), cdy = Math.cos(this.yaw), rx = Math.cos(this.yaw), ry = -Math.sin(this.yaw);
    for (const w of this.walls) w.tiles.forEach((p, i) => {
      for (const fp of focus) {
        const dx = p.x + 0.5 - fp.x / TILE, dy = p.y + 0.5 - fp.y / TILE;
        const fwd = dx * cdx + dy * cdy, side = dx * rx + dy * ry;
        if (fwd >= -0.6 && fwd <= tall + 0.6 && Math.abs(side) <= 2.3) { want.add(i * 64 + this.walls.indexOf(w)); break; }
      }
    });
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    let changed = false;
    for (const key of new Set([...want, ...this.fadedNow])) {
      const fade = want.has(key), was = this.fadedNow.has(key);
      if (fade === was) continue;
      const w = this.walls[key % 64], i = Math.floor(key / 64);
      w.solid.setMatrixAt(i, fade ? zero : w.mats[i]);
      w.faded.setMatrixAt(i, fade ? w.mats[i] : zero);
      w.solid.instanceMatrix.needsUpdate = w.faded.instanceMatrix.needsUpdate = true;
      changed = true;
    }
    if (changed) for (const w of this.walls) { w.solid.computeBoundingSphere(); w.faded.computeBoundingSphere(); }
    this.fadedNow = want;
  }

  // ------------------------------------------------------------------ effects that rise off the floor
  /** One glowing mote (additive), drawn from a pool so effects never allocate mid-fight. */
  private dot(x: number, y: number, h: number, size: number, color: number, alpha: number) {
    if (alpha <= 0.01 || this.gi > 900) return;
    let s = this.glow[this.gi];
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, fog: false }));
      s.renderOrder = 15;
      this.scene.add(s);
      this.glow.push(s);
    }
    s.visible = true;
    s.position.set(x, h, y);
    s.scale.set(size, size, 1);
    const m = s.material;
    m.color.set(color);
    m.opacity = Math.min(1, alpha);
    this.gi++;
  }
  /** A glowing streak between two points in the air. */
  private streak(ax: number, ay: number, ah: number, bx: number, by: number, bh: number, size: number, color: number, alpha: number, core = true) {
    const L = Math.hypot(bx - ax, by - ay, bh - ah);
    const n = Math.max(1, Math.min(60, Math.ceil(L / (size * 0.45))));
    for (let i = 0; i <= n; i++) {
      const k = i / n, x = ax + (bx - ax) * k, y = ay + (by - ay) * k, h = ah + (bh - ah) * k;
      this.dot(x, y, h, size, color, alpha * 0.55);
      if (core && i % 2 === 0) this.dot(x, y, h, size * 0.35, 0xffffff, alpha * 0.6);
    }
  }

  private drawEffects(fx: Fx3[], spells: Spell3[]) {
    this.gi = 0;
    const now = performance.now();
    const rnd = (n: number) => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
    for (const f of fx) {
      const t = Math.max(0, Math.min(1, f.t)), a = 1 - t;
      switch (f.kind) {
        case 'proj': {
          // a bolt flying at chest height with a fading tail
          for (let i = 0; i < 6; i++) {
            const k = Math.max(0, t - i * 0.04);
            const x = f.x + (f.x2 - f.x) * k, y = f.y + (f.y2 - f.y) * k;
            this.dot(x, y, 22, 16 - i * 2, f.color, 1 - i * 0.15);
          }
          this.dot(f.x + (f.x2 - f.x) * t, f.y + (f.y2 - f.y) * t, 22, 6, 0xffffff, 1);
          break;
        }
        case 'lob': {
          // an arcing throw that really goes up and comes down
          for (let i = 0; i < 5; i++) {
            const k = Math.max(0, t - i * 0.035);
            const x = f.x + (f.x2 - f.x) * k, y = f.y + (f.y2 - f.y) * k, h = 18 + Math.sin(Math.PI * k) * 110;
            this.dot(x, y, h, 18 - i * 2.5, f.color, 1 - i * 0.18);
          }
          break;
        }
        case 'line': this.streak(f.x, f.y, 18, f.x2, f.y2, 18, 14, f.color, a); break;
        case 'bolt': {
          // lightning: a jagged path in the air that flickers
          const n = 8;
          let px = f.x, py = f.y, ph = 70;
          for (let i = 1; i <= n; i++) {
            const k = i / n, j = i === n ? 0 : (rnd(f.seed + i + Math.floor(now / 50)) - 0.5);
            const x = f.x + (f.x2 - f.x) * k + j * 22, y = f.y + (f.y2 - f.y) * k - j * 16, h = 70 - k * 52 + j * 18;
            this.streak(px, py, ph, x, y, i === n ? 14 : h, 9, f.color, a);
            px = x; py = y; ph = h;
          }
          break;
        }
        case 'column': {
          // a pillar of light from the sky
          const grow = Math.min(1, t * 2.2), top = 170 * (0.3 + 0.7 * grow);
          this.streak(f.x, f.y, 0, f.x, f.y, top, 30, f.color, a * 0.8, false);
          this.streak(f.x, f.y, 0, f.x, f.y, top + 20, 10, 0xffffff, a * 0.9, false);
          break;
        }
        case 'burst': {
          // sparks thrown up and out, falling back
          for (let i = 0; i < 14; i++) {
            const ang = (i / 14) * Math.PI * 2 + f.seed;
            const sp = 22 + (i % 4) * 9;
            const x = f.x + Math.cos(ang) * sp * t * 1.4, y = f.y + Math.sin(ang) * sp * t * 1.4;
            const h = 10 + (40 + (i % 3) * 18) * t - 70 * t * t;
            this.dot(x, y, Math.max(2, h), 9, f.color, a);
          }
          this.dot(f.x, f.y, 14, 40 * (1 - t * 0.5), f.color, a * 0.7);
          break;
        }
        case 'blink':
          for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * Math.PI * 2 + t * 4;
            this.dot(f.x + Math.cos(ang) * (8 + t * 26), f.y + Math.sin(ang) * (8 + t * 26), 6 + t * 60 + (i % 2) * 8, 9, f.color, a);
          }
          break;
        case 'slash':
          for (let i = 0; i < 9; i++) {
            const ang = -2.2 + t * 2.6 + i * 0.14;
            this.dot(f.x + Math.cos(ang) * 22, f.y + Math.sin(ang) * 10, 22 + Math.sin(ang) * 12, 10, f.color, a * (1 - i * 0.08));
          }
          break;
        default: break; // rings stay painted on the floor
      }
    }
    for (const sp of spells) {
      const t = Math.max(0, Math.min(1, sp.t)), a = 1 - t;
      for (const [pi, p] of sp.pts.slice(0, 8).entries()) {
        // motes of the spell's colour rise from everything it touches
        for (let i = 0; i < 7; i++) {
          const ang = (i / 7) * Math.PI * 2 + sp.seed + pi;
          const rr = 8 + ((i * 5) % 14);
          this.dot(p.x + Math.cos(ang + t * 2) * rr, p.y + Math.sin(ang + t * 2) * rr, 6 + t * (60 + (i % 3) * 20), 9, sp.color, a * 0.9);
        }
        // and a brief flare as it lands
        if (t < 0.35) this.streak(p.x, p.y, 0, p.x, p.y, 70 * (1 - t / 0.35) + 10, 18, sp.color, (1 - t / 0.35) * 0.7, false);
      }
    }
    for (let i = this.gi; i < this.glow.length; i++) this.glow[i].visible = false;
  }

  // ------------------------------------------------------------------ picking and projection
  /** The world point under a spot on screen (fractions of the canvas): a body if you're over one, else the floor. */
  pick(fx: number, fy: number): Pt {
    const ndc = new THREE.Vector2(fx * 2 - 1, -(fy * 2 - 1));
    this.ray.setFromCamera(ndc, this.camera);
    const mains: THREE.Object3D[] = [];
    for (const c of this.cards.values()) if (c.group.rotation.x === 0) mains.push(c.main);
    const hit = this.ray.intersectObjects(mains, false)[0];
    if (hit) {
      // only count the opaque part of the card, so you can still click the floor beside a big one
      const uv = hit.uv, img = (hit.object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.map?.image as HTMLCanvasElement | undefined;
      let solid = true;
      if (uv && img?.getContext) {
        const fxp = hit.object.scale.x < 0 ? 1 - uv.x : uv.x; // a flipped card reads its texture mirrored
        const px = Math.floor(fxp * img.width), py = Math.floor((1 - uv.y) * img.height);
        try { solid = img.getContext('2d')!.getImageData(Math.min(img.width - 1, px), Math.min(img.height - 1, py), 1, 1).data[3] > 40; } catch { solid = true; }
      }
      if (solid) { const g = hit.object.parent!.position; return { x: g.x, y: g.z }; }
    }
    const o = this.ray.ray.origin, d = this.ray.ray.direction;
    if (Math.abs(d.y) < 1e-6) return { x: o.x, y: o.z };
    const t = -o.y / d.y;
    return { x: o.x + d.x * t, y: o.z + d.z * t };
  }

  private v3 = new THREE.Vector3();
  /** Where a world point at height h lands on the canvas, as fractions (0..1). */
  project(x: number, y: number, h = 0): Pt {
    this.v3.set(x, h, y).project(this.camera);
    return { x: (this.v3.x + 1) / 2, y: (1 - this.v3.y) / 2 };
  }
  /** HUD pixels per world unit at a spot (so bars and numbers shrink with distance, like the world). */
  scaleAt(x: number, y: number, h = 0): number {
    const a = this.project(x, y, h), b = this.project(x + 20, y, h);
    return (Math.abs(b.x - a.x) * this.hud.width) / 20;
  }
  /** Card height in world units for a sprite of `size`, as it stands. */
  headHeight(size: number) { return size * 0.85 * LIFT; }
  get hudW() { return this.hud.width; }
  get hudH() { return this.hud.height; }
}

const flameGeo = new THREE.ConeGeometry(4, 12, 5);

function brickCanvas(pal: BiomeDef['pal']) {
  const c = document.createElement('canvas'); c.width = 32; c.height = 44;
  const g = c.getContext('2d')!;
  g.fillStyle = pal.face; g.fillRect(0, 0, 32, 44);
  g.fillStyle = pal.faceHi; g.fillRect(0, 0, 32, 2);
  g.fillStyle = pal.mortar;
  for (let y = 0; y < 44; y += 6) { g.fillRect(0, y + 5, 32, 1); const o = (y / 6) % 2 ? 0 : 8; for (let x = o; x < 32; x += 16) g.fillRect(x, y, 1, 5); }
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = pal.faceHi; for (let i = 0; i < 16; i++) g.fillRect(Math.floor(r() * 30), Math.floor(r() * 42), 2, 1);
  g.fillStyle = pal.accent; for (let i = 0; i < 4; i++) g.fillRect(Math.floor(r() * 31), Math.floor(r() * 42), 1, 2);
  return c;
}
function barkCanvas(pal: BiomeDef['pal']) {
  const c = document.createElement('canvas'); c.width = 8; c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = pal.face; g.fillRect(0, 0, 8, 32);
  let s = 3;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 30; i++) { g.fillStyle = r() < 0.5 ? pal.mortar : pal.faceHi; g.fillRect(Math.floor(r() * 8), Math.floor(r() * 30), 1, 2 + Math.floor(r() * 3)); }
  return c;
}
function leafCanvas(pal: BiomeDef['pal']) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 16, 16);
  let s = 5;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,220,0.6)' : 'rgba(0,0,0,0.35)'; g.fillRect(Math.floor(r() * 15), Math.floor(r() * 15), 2, 1); }
  g.fillStyle = pal.accent; g.fillRect(5, 6, 1, 1); g.fillRect(11, 3, 1, 1);
  return c;
}

/**
 * Minimal stand-in for Pixi's Graphics on a 2D canvas, enough for the HUD (bars, pips, skulls):
 * shapes followed by fill() and/or stroke(), chained the same way.
 */
export class HudGraphics {
  private done = true;
  constructor(public ctx: CanvasRenderingContext2D) {}
  private begin() { if (this.done) { this.ctx.beginPath(); this.done = false; } }
  rect(x: number, y: number, w: number, h: number) { this.begin(); this.ctx.rect(x, y, w, h); return this; }
  circle(x: number, y: number, r: number) { this.begin(); this.ctx.moveTo(x + r, y); this.ctx.arc(x, y, r, 0, Math.PI * 2); return this; }
  ellipse(x: number, y: number, rx: number, ry: number) { this.begin(); this.ctx.moveTo(x + rx, y); this.ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); return this; }
  poly(p: number[]) { this.begin(); this.ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) this.ctx.lineTo(p[i], p[i + 1]); this.ctx.closePath(); return this; }
  moveTo(x: number, y: number) { this.begin(); this.ctx.moveTo(x, y); return this; }
  lineTo(x: number, y: number) { this.ctx.lineTo(x, y); return this; }
  fill(o: { color: number; alpha?: number }) { this.ctx.globalAlpha = o.alpha ?? 1; this.ctx.fillStyle = css(o.color); this.ctx.fill(); this.ctx.globalAlpha = 1; this.done = true; return this; }
  stroke(o: { width?: number; color: number; alpha?: number }) { this.ctx.globalAlpha = o.alpha ?? 1; this.ctx.strokeStyle = css(o.color); this.ctx.lineWidth = o.width ?? 1; this.ctx.stroke(); this.ctx.globalAlpha = 1; this.done = true; return this; }
  clear() { return this; }
}

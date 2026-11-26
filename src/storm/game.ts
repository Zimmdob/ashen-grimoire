import { Application, Container, Graphics, RenderTexture, Sprite, Text, Texture } from 'pixi.js';
import { drawLava, drawMap } from '../render/mapArt';
import { buildSprites, type SpriteSet } from '../render/sprites';
import { cardIcon, SCHOOL_COLOR } from '../ui/icons';
import { music } from '../ui/music';
import { play } from '../ui/sfx';
import { meta, saveMeta } from '../ui/meta';
import type { LevelSnap } from '../sim/types';
import { BASES, CURSE_IDS, MAX_MODS, MODS, RELICS, spellStats, spellSummary, STORM_CARDS } from './cards';
import {
  ACTS, addRelic, AFFIXES, AH, AW, bossOf, CLASSES, coinFlip, curseChoice, DIFFICULTY, doorChoices, enterRoom, MH, MW, newRun, nextAct, NO_INPUT, onBeat, relicChoices, rewardChoices,
  ROOMS_PER_ACT, spikesUp, spikesWarn, STEP, stormAsh, update, type ClassId, type Difficulty, type Input, type RoomKind, type StormWorld,
} from './sim';
import { T_LAVA } from '../sim/constants';

/** How each act is lit: how dark the unlit ground is, the ambient tint, and its weather. */
const LOOK: { dark: number; tint: number; weather: 'leaves' | 'dust' | 'snow' | 'ash' | 'embers'; back: number }[] = [
  { dark: 0.28, tint: 0x1a2a10, weather: 'leaves', back: 0x0c140a },
  { dark: 0.66, tint: 0x0a0610, weather: 'dust', back: 0x0a070c },
  { dark: 0.55, tint: 0x0a1020, weather: 'snow', back: 0x060a14 },
  { dark: 0.7, tint: 0x14040a, weather: 'ash', back: 0x100408 },
  { dark: 0.62, tint: 0x140804, weather: 'embers', back: 0x120604 },
];
/** Sprites for things the main game draws under another name. */
const SPRITE_OF: Partial<Record<string, string>> = { brazier: 'effigy' };

interface Mote { x: number; y: number; vx: number; vy: number; life: number; age: number; size: number; color: number; spin: number }

// ------------------------------------------------------------------ achievements (5 Ash each, once)
const ACH: { id: string; name: string; desc: string; test: (w: StormWorld) => boolean }[] = [
  { id: 'firstboss', name: 'Antler Breaker', desc: 'Fell your first boss.', test: (w) => w.stats.bosses >= 1 },
  { id: 'deep', name: 'Into the Cold', desc: 'Reach the Frost Ossuary.', test: (w) => w.act >= 2 || w.loop > 0 },
  { id: 'king', name: 'Uncrowned', desc: 'Defeat the Hollow King.', test: (w) => w.won },
  { id: 'nightmare', name: 'Nightmare’s End', desc: 'Win on Nightmare.', test: (w) => w.won && w.diff === 'nightmare' },
  { id: 'grazer', name: 'Moth to the Flame', desc: 'Graze 300 shots in one run.', test: (w) => w.stats.grazes >= 300 },
  { id: 'flawless', name: 'Untouched', desc: 'Fell a boss without being hit.', test: (w) => w.stats.flawless >= 1 },
  { id: 'collector', name: 'Reliquary', desc: 'Carry eight relics at once.', test: (w) => w.player.relics.filter((r) => !RELICS[r].curse).length >= 8 },
  { id: 'hoarder', name: 'Dragon’s Bed', desc: 'Hold 200 cinders at once.', test: (w) => w.player.cinders >= 200 },
  { id: 'abyss', name: 'Into the Abyss', desc: 'Loop into the Abyss.', test: (w) => w.loop >= 1 },
  { id: 'secret', name: 'The Last Page', desc: 'Defeat what waits at the bottom of the Abyss.', test: (w) => w.stats.secret >= 1 },
  { id: 'cursed', name: 'Thrice Cursed', desc: 'Carry three curses at once.', test: (w) => w.player.relics.filter((r) => RELICS[r].curse).length >= 3 },
  { id: 'nova', name: 'Clean Slate', desc: 'Clear 150 shots with one Ash Nova.', test: (w) => w.stats.bestNova >= 150 },
  { id: 'kills', name: 'Cinderstorm', desc: 'Fell 400 foes in one run.', test: (w) => w.stats.kills >= 400 },
];
function loadAch(): string[] { try { return JSON.parse(localStorage.getItem('ashen-storm-ach') || '[]') as string[]; } catch { return []; } }
function saveAch(a: string[]) { try { localStorage.setItem('ashen-storm-ach', JSON.stringify(a)); } catch { /* storage unavailable */ } }
const today = () => new Date().toISOString().slice(0, 10);
const dailySeed = (d: string) => { let h = 2166136261; for (const ch of 'cinder' + d) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h | 0; };

// Cinderstorm: the real-time, bullet-hell mode. This file owns the screen: drawing, controls, the HUD
// and every screen between rooms. The rules live in sim.ts.

type Mode = 'menu' | 'play' | 'between' | 'paused' | 'dead' | 'won';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const roman = (n: number) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][n - 1] ?? String(n);
const cardHtml = (id: string, attr = '', extra = '') => {
  const c = STORM_CARDS[id];
  return `<button type="button" class="scard ${c.kind}" ${attr} style="--c:${SCHOOL_COLOR[c.school]}"><img alt="" src="${cardIcon(c.icon, c.school)}"><b>${esc(c.name)}</b><small>${c.kind === 'base' ? 'Base' : 'Modifier'}${extra}</small><span>${esc(c.desc)}</span></button>`;
};
const relicHtml = (id: string, attr = '', extra = '') => {
  const r = RELICS[id];
  return `<button type="button" class="scard relic" ${attr} style="--c:${SCHOOL_COLOR[r.school]}"><img alt="" src="${cardIcon(r.icon, r.school)}"><b>${esc(r.name)}</b><small>Relic${extra}</small><span>${esc(r.desc)}</span></button>`;
};
const DOORS: Record<RoomKind, { name: string; desc: string; glyph: string }> = {
  fight: { name: 'Skirmish', desc: 'Foes. A card afterwards.', glyph: '⚔' },
  elite: { name: 'Champion', desc: 'A gilded, dangerous foe among the rest. A relic and a card afterwards.', glyph: '♛' },
  treasure: { name: 'Hoard', desc: 'No fight. Choose a relic.', glyph: '✦' },
  shrine: { name: 'Shrine', desc: 'An offering for a gift. No fight.', glyph: '⛩' },
  shop: { name: 'Pedlar', desc: 'Spend your cinders on cards, relics, hearts and Ash Novas.', glyph: '⚖' },
  event: { name: 'Strange Lights', desc: 'Something unusual. It may help; it may cost you.', glyph: '?' },
  boss: { name: 'The Lord of this place', desc: 'The act’s boss.', glyph: '☠' },
};

interface Best { score: Partial<Record<Difficulty, number>>; abyss: number; daily?: Record<string, number>; cls?: ClassId }
function loadBest(): Best { try { const b = JSON.parse(localStorage.getItem('ashen-storm-best') || 'null') as Best | null; return b && b.score ? b : { score: {}, abyss: 0 }; } catch { return { score: {}, abyss: 0 }; } }
function saveBest(b: Best) { try { localStorage.setItem('ashen-storm-best', JSON.stringify(b)); } catch { /* storage unavailable */ } }

let active: Cinderstorm | null = null;

/** Open Cinderstorm over the game. `onExit` runs when the player leaves (back to the title). */
export async function startStorm(onExit: () => void) {
  if (active) return;
  active = new Cinderstorm(onExit);
  (globalThis as { __agStorm?: unknown }).__agStorm = active;
  await active.boot();
}

class Cinderstorm {
  private root = document.createElement('div');
  private app = new Application();
  private world = new Container();
  private mapSprite = new Sprite();
  private liqSprite = new Sprite();
  private liqCanvas = document.createElement('canvas');
  private hazG = new Graphics();
  private unitLayer = new Container();
  private bulletLayer = new Container();
  private fxG = new Graphics();
  private hitG = new Graphics();
  private textLayer = new Container();
  private sprites: Record<string, SpriteSet> = {};
  private foeSprites = new Map<number, Sprite>();
  private playerSprite = new Sprite();
  private halo: Sprite[] = [];
  private orb: Sprite[] = [];
  private core: Sprite[] = [];
  private glow!: Texture;
  private orbTex!: Texture;
  private w!: StormWorld;
  private mode: Mode = 'menu';
  private inp: Input = { ...NO_INPUT };
  private keys = new Set<string>();
  private ptrA = false;
  private ptrB = false;
  private acc = 0;
  private last = 0;
  private beats: { at: number; s: number }[] = [];
  private lastBeatSeen = 0;
  private metro = { next: 0, s: 0 };
  private owned: string[] = ['ember', 'thorn'];
  private slot: 0 | 1 = 0;
  private clearedAt = 0;
  private shake = 0;
  private lastHitSound = 0;
  private scale = 1;
  private hud!: HTMLElement;
  private panel!: HTMLElement;
  private snap!: LevelSnap;
  private seed = (Math.random() * 2 ** 31) | 0;
  private banked = false;
  private diff: Difficulty = 'normal';
  private endless = false;
  private texts = new Map<object, Text>();
  private best = loadBest();
  private cls: ClassId = this.best.cls ?? 'spellwright';
  private daily = false;
  private ach = loadAch();
  // ---- the look
  private backG = new Graphics();
  private backC = new Container();
  private backGlows: Sprite[] = [];
  private shadowG = new Graphics();
  private weatherG = new Graphics();
  private darkCont = new Container();
  private darkG = new Graphics();
  private darkRT!: RenderTexture;
  private darkSprite = new Sprite();
  private holes: Sprite[] = [];
  private glowLayer = new Container();
  private glows: Sprite[] = [];
  private lavaLights: { x: number; y: number }[] = [];
  private vignette = new Sprite();
  private flashG = new Graphics();
  private flash = { a: 0, color: 0xffffff };
  private motes: Mote[] = [];
  private hitStop = 0;
  private seenFx = new WeakSet<object>();
  private announced = -1;
  private deadT = 0;

  constructor(private onExit: () => void) {}

  async boot() {
    this.root.className = 'storm';
    this.root.innerHTML = `<div class="shud"></div><div class="srelics"></div><div class="sboss"><b></b><i><s></s></i></div><div class="spanel"></div>`;
    document.body.appendChild(this.root);
    this.hud = this.root.querySelector('.shud')!;
    this.panel = this.root.querySelector('.spanel')!;
    await this.app.init({ resizeTo: this.root, background: '#05030a', antialias: false, resolution: 1, roundPixels: true, preference: 'webgl' });
    const cv = this.app.canvas as HTMLCanvasElement;
    cv.className = 'scanvas';
    this.root.prepend(cv);
    this.sprites = buildSprites();
    this.glow = Texture.from(glowCanvas());
    this.orbTex = Texture.from(orbCanvas());
    this.mapSprite.scale.set(2);
    this.liqSprite.scale.set(2);
    // darkness: a texture of shadow with holes cut where light falls, laid over the ground and bodies
    this.darkRT = RenderTexture.create({ width: AW / 2, height: AH / 2 });
    this.darkCont.addChild(this.darkG);
    this.darkSprite = new Sprite(this.darkRT);
    this.darkSprite.scale.set(2);
    // the dark falls on the ground only: bodies, traps and shots always stay readable
    this.world.addChild(this.mapSprite, this.liqSprite, this.darkSprite, this.hazG, this.shadowG, this.unitLayer, this.glowLayer, this.weatherG, this.fxG, this.bulletLayer, this.hitG, this.textLayer);
    this.vignette = new Sprite(Texture.from(vignetteCanvas()));
    for (let i = 0; i < 5; i++) { const g = new Sprite(this.glow); g.anchor.set(0.5); this.backGlows.push(g); this.backC.addChild(g); }
    this.app.stage.addChild(this.backG, this.backC, this.world, this.vignette, this.flashG);
    this.playerSprite = new Sprite(Texture.from(this.sprites.wizard.canvas));
    this.playerSprite.anchor.set(0.5, 0.7);
    this.playerSprite.scale.set(2);
    this.root.insertAdjacentHTML('beforeend', '<div class="sbanner"><small></small><b></b></div>');
    this.bind();
    this.app.ticker.add(() => this.frame());
    music.setScene('dungeon');
    music.setRegion('stormwood');
    music.onStep = (s, inMs) => { this.beats.push({ at: performance.now() + inMs, s }); this.lastBeatSeen = performance.now(); };
    this.w = newRun({ seed: this.seed });
    this.buildMap();
    this.unitLayer.addChild(this.playerSprite);
    this.menu();
  }

  private startRun() {
    const seed = this.daily ? dailySeed(today()) : this.seed;
    this.w = newRun({ seed, diff: this.daily ? 'normal' : this.diff, endless: this.daily ? false : this.endless, cls: this.cls });
    this.seed = (this.seed * 1103515245 + 12345) | 0;
    this.owned = [...CLASSES[this.cls].owned];
    this.announced = -1;
    this.deadT = 0;
    this.playerSprite.tint = CLASSES[this.cls].tint;
    this.banked = false;
    this.clearedAt = 0;
    for (const s of this.foeSprites.values()) s.destroy();
    this.foeSprites.clear();
    this.unitLayer.removeChildren();
    this.unitLayer.addChild(this.playerSprite);
    this.actCard(() => this.enter());
  }

  private buildMap() {
    const act = ACTS[this.w.act];
    this.snap = { level: this.w.room, MW, MH, map: this.w.map, torches: [], units: [], pickups: [], biome: this.w.kind === 'boss' ? act.bossBiome : act.biome, wells: [] };
    const old = this.mapSprite.texture;
    this.mapSprite.texture = Texture.from(drawMap(this.snap));
    if (old && old !== Texture.EMPTY) old.destroy(true);
    this.liqCanvas.width = MW * 16;
    this.liqCanvas.height = MH * 16;
    drawLava(this.liqCanvas, this.snap, 0);
    this.liqSprite.texture = Texture.from(this.liqCanvas);
    // lava glows: one light per few tiles
    this.lavaLights = [];
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x += 2) if (this.w.map[y][x] === T_LAVA) this.lavaLights.push({ x: x * 32 + 16, y: y * 32 + 16 });
    this.motes = [];
  }

  /** Start playing the room the world is in now. */
  private enter() {
    this.buildMap();
    const act = ACTS[this.w.act];
    music.setRegion(this.w.kind === 'boss' ? act.bossTune : act.tune);
    this.resume();
  }

  // ------------------------------------------------------------------ controls
  private bind() {
    const cv = this.app.canvas as HTMLCanvasElement;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointermove', (e) => this.aim(e));
    cv.addEventListener('pointerdown', (e) => {
      this.aim(e);
      if (e.button === 0) this.ptrA = true;
      if (e.button === 2) this.ptrB = true;
      if (e.button === 1) { e.preventDefault(); this.bombQueued = true; }
    });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('keydown', this.kd, true);
    window.addEventListener('keyup', this.ku, true);
    window.addEventListener('blur', this.blur);
  }
  private bombQueued = false;
  private up = (e: PointerEvent) => { if (e.button === 0) this.ptrA = false; if (e.button === 2) this.ptrB = false; };
  private blur = () => { this.keys.clear(); this.ptrA = this.ptrB = false; if (this.mode === 'play') this.pause(); };
  private kd = (e: KeyboardEvent) => {
    // Cinderstorm has the keyboard while it's open: the main game never sees these keys
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    e.stopImmediatePropagation();
    const k = e.key.toLowerCase();
    if (k === 'escape') { e.preventDefault(); if (this.mode === 'play') this.pause(); else if (this.mode === 'paused') this.resume(); return; }
    if (k === ' ' || k === 'tab') e.preventDefault();
    if ((k === 'f' || k === 'e') && !e.repeat) this.bombQueued = true;
    this.keys.add(k);
  };
  private ku = (e: KeyboardEvent) => { e.stopImmediatePropagation(); this.keys.delete(e.key.toLowerCase()); };
  private aim(e: PointerEvent) {
    const r = (this.app.canvas as HTMLCanvasElement).getBoundingClientRect();
    this.inp.mx = (e.clientX - r.left - this.world.x) / this.scale;
    this.inp.my = (e.clientY - r.top - this.world.y) / this.scale;
  }
  private readKeys() {
    const k = this.keys;
    this.inp.up = k.has('w') || k.has('arrowup');
    this.inp.down = k.has('s') || k.has('arrowdown');
    this.inp.left = k.has('a') || k.has('arrowleft');
    this.inp.right = k.has('d') || k.has('arrowright');
    this.inp.blink = k.has(' ');
    this.inp.focus = k.has('shift');
    this.inp.fireA = this.ptrA || k.has('j');
    this.inp.fireB = this.ptrB || k.has('k');
  }

  // ------------------------------------------------------------------ the loop
  private frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    this.watchFx();
    if (this.hitStop > 0) { this.hitStop -= dt; this.acc = 0; }
    else if (this.mode === 'dead' && this.deadT < 1.4) {
      // the moment you fall plays out in slow motion
      this.deadT += dt;
      update(this.w, NO_INPUT, dt * 0.25);
    } else if (this.mode === 'play') {
      this.readKeys();
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n++ < 6) {
        this.beatsDue();
        this.inp.bomb = this.bombQueued;
        this.bombQueued = false;
        update(this.w, this.inp);
        this.acc -= STEP;
        this.sounds();
      }
      this.afterTick(now);
    }
    this.draw(now, dt);
    this.drawHud();
  }

  /** React to new effects: flashes, hit-stop, the phase banner. */
  private watchFx() {
    for (const f of this.w.fx) {
      if (this.seenFx.has(f)) continue;
      this.seenFx.add(f);
      if (f.kind === 'hurt') { this.flash = { a: 0.35, color: 0xff1a2a }; this.hitStop = Math.max(this.hitStop, 0.07); this.shake = Math.max(this.shake, 9); }
      if (f.kind === 'nova') { this.flash = { a: 0.45, color: f.color }; this.shake = Math.max(this.shake, 12); }
      if (f.kind === 'phase') { this.flash = { a: 0.5, color: 0xffffff }; this.hitStop = 0.3; this.shake = 16; this.banner(`Phase ${f.text ?? ''}`, bossOf(this.w).name); }
      if (f.kind === 'die' && (f.r ?? 0) > 18) { this.flash = { a: 0.6, color: 0xffe8b0 }; this.hitStop = 0.45; this.shake = 20; }
    }
    // a boss arriving gets a title card
    const boss = this.w.foes.find((f) => f.boss);
    if (boss && this.announced !== boss.id) { this.announced = boss.id; this.banner(bossOf(this.w).name, ['The Greenwood’s eldest', 'Keeper of the ossuary keys', 'The cold that counts', 'A hymn of knives', 'King of nothing', 'The book that was never written'][boss.type === 'unwritten' ? 5 : this.w.act]); }
  }
  private bannerT = 0;
  private banner(title: string, sub: string) {
    const b = this.root.querySelector<HTMLElement>('.sbanner')!;
    b.querySelector('b')!.textContent = title;
    b.querySelector('small')!.textContent = sub;
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
    clearTimeout(this.bannerT);
    this.bannerT = window.setTimeout(() => b.classList.remove('on'), 2600);
  }

  /** Feed the music's beats to the simulation; with no dreamwave playing, keep our own steady pulse. */
  private beatsDue() {
    const now = performance.now();
    this.beats.sort((a, b) => a.at - b.at);
    while (this.beats.length && this.beats[0].at <= now) onBeat(this.w, this.beats.shift()!.s);
    if (!music.dreamPlaying() || now - this.lastBeatSeen > 1500) {
      const eighth = 60_000 / (this.w.kind === 'boss' ? 96 : 84) / 2;
      if (!this.metro.next) this.metro.next = now;
      while (this.metro.next <= now) { onBeat(this.w, this.metro.s++); this.metro.next += eighth; }
    } else this.metro.next = 0;
  }

  private sounds() {
    const now = performance.now();
    for (const s of new Set(this.w.sounds)) {
      if (s === 'hit' || s === 'click' || s === 'shoot') { if (now - this.lastHitSound < 60) continue; this.lastHitSound = now; }
      play(s);
      if (s === 'boom') this.shake = Math.max(this.shake, 6);
    }
  }

  private afterTick(now: number) {
    const w = this.w;
    music.setIntensity(w.foes.length ? (w.kind === 'boss' ? 1 : 0.7) : 0.15);
    if (w.player.dead && this.mode === 'play') { this.mode = 'dead'; setTimeout(() => this.results(), 1200); return; }
    if (w.cleared && (w.kind === 'fight' || w.kind === 'elite' || w.kind === 'boss')) {
      if (!this.clearedAt) { this.clearedAt = now; play('portal'); }
      if (now - this.clearedAt > (w.kind === 'boss' ? 2600 : 1400)) { this.clearedAt = 0; this.mode = 'between'; this.afterRoom(); }
    }
  }

  // ------------------------------------------------------------------ drawing
  private draw(now: number, dt = 0.016) {
    const w = this.w;
    const sw = this.app.screen.width, sh = this.app.screen.height;
    const look = LOOK[w.act] ?? LOOK[0];
    // backdrop behind the arena: the act's colour, slow drifting glows
    this.backG.clear().rect(0, 0, sw, sh).fill({ color: look.back });
    this.backGlows.forEach((g, i) => { const t = now / 9000 + i * 1.7; g.position.set(sw * (0.5 + Math.sin(t) * 0.45), sh * (0.5 + Math.cos(t * 0.8) * 0.45)); g.scale.set(Math.max(sw, sh) / 40); g.tint = look.tint; g.alpha = 0.9; });
    this.vignette.width = sw; this.vignette.height = sh;
    this.vignette.alpha = 0.55 + look.dark * 0.35;
    this.flash.a *= 0.88;
    this.flashG.clear();
    if (this.flash.a > 0.01) this.flashG.rect(0, 0, sw, sh).fill({ color: this.flash.color, alpha: this.flash.a });
    this.scale = Math.min(sw / AW, (sh - 52) / AH);
    this.shake *= 0.88;
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    this.world.scale.set(this.scale);
    this.world.position.set(Math.round((sw - AW * this.scale) / 2 + sx), Math.round((sh - 46 - AH * this.scale) / 2 + sy));
    if (Math.floor(now / 100) % 2 === 0 && this.liqSprite.texture) { drawLava(this.liqCanvas, this.snap, now / 1000); this.liqSprite.texture.source.update(); }

    // hazards: acid pools, and beams (a thin flickering warning line first, then the beam)
    const hz = this.hazG;
    hz.clear();
    for (const h of w.hazards) {
      if (h.kind === 'spikes') {
        const X = h.x - 16, Y = h.y - 16;
        if (spikesUp(h, w.time)) {
          hz.rect(X + 1, Y + 1, 30, 30).fill({ color: 0x2a0a0a, alpha: 0.5 });
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) hz.poly([X + 4 + i * 10, Y + 12 + j * 9, X + 8 + i * 10, Y + 2 + j * 9, X + 12 + i * 10, Y + 12 + j * 9]).fill({ color: 0xd8d8e0 }).stroke({ width: 1, color: 0x3a3a4a });
        } else if (spikesWarn(h, w.time)) hz.rect(X + 2, Y + 2, 28, 28).stroke({ width: 2, color: 0xff3a2a, alpha: 0.3 + 0.5 * (Math.floor(now / 90) % 2) });
        else for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) hz.circle(X + 8 + i * 8, Y + 8 + j * 8, 1.2).fill({ color: 0x000000, alpha: 0.5 });
        continue;
      }
      if (h.kind === 'pool') {
        const a = Math.min(1, (h.life - h.t) * 2);
        hz.circle(h.x, h.y, h.r).fill({ color: h.color, alpha: 0.28 * a }).stroke({ width: 2, color: h.color, alpha: 0.6 * a });
      } else {
        // stop the beam at the edge of the room
        const ux = Math.cos(h.ang), uy = Math.sin(h.ang);
        const tx = ux > 0 ? (AW - h.x) / ux : ux < 0 ? -h.x / ux : Infinity, ty = uy > 0 ? (AH - h.y) / uy : uy < 0 ? -h.y / uy : Infinity;
        const L = Math.max(0, Math.min(h.len, tx, ty));
        const ex = h.x + ux * L, ey = h.y + uy * L;
        if (h.t < h.warn) hz.moveTo(h.x, h.y).lineTo(ex, ey).stroke({ width: 2, color: h.color, alpha: 0.25 + 0.4 * (Math.floor(now / 70) % 2) });
        else {
          hz.moveTo(h.x, h.y).lineTo(ex, ey).stroke({ width: h.r * 2.6, color: h.color, alpha: 0.35 });
          hz.moveTo(h.x, h.y).lineTo(ex, ey).stroke({ width: h.r * 1.2, color: 0xffffff, alpha: 0.9 });
        }
      }
    }

    // the wizard
    const p = w.player;
    this.playerSprite.position.set(p.x, p.y + (p.moving ? Math.sin(now / 70) * 1.2 : 0));
    this.playerSprite.scale.x = Math.cos(p.face) < 0 ? -2 : 2;
    this.playerSprite.alpha = p.dead ? 0 : p.inv > 0 ? (Math.floor(now / 60) % 2 ? 0.35 : 0.9) : 1;

    // foes
    const seen = new Set<number>();
    for (const f of w.foes) {
      seen.add(f.id);
      let s = this.foeSprites.get(f.id);
      if (!s) {
        s = new Sprite(Texture.from((this.sprites[SPRITE_OF[f.type] ?? f.type] ?? this.sprites.ghoul).canvas));
        s.anchor.set(0.5, 0.75);
        this.foeSprites.set(f.id, s);
        this.unitLayer.addChild(s);
      }
      const big = f.boss ? 3.2 : f.elite ? 2.6 : 2;
      s.scale.set(p.x < f.x ? -big : big, big);
      s.position.set(f.x, f.y);
      s.alpha = f.state === 'spawn' ? 0.25 + 0.3 * Math.sin(now / 60) : f.state === 'sleep' ? 0.85 : 1;
      s.tint = f.flash > 0.5 ? 0xff9a9a : f.state === 'wind' ? 0xff8a8a : f.slow > 0 ? 0xa8d8ff : f.burnT > 0 ? 0xffc890 : f.elite ? 0xffd890 : f.state === 'sleep' ? 0x8a8a9a : 0xffffff;
    }
    for (const [id, s] of this.foeSprites) if (!seen.has(id)) { s.destroy(); this.foeSprites.delete(id); }
    this.unitLayer.children.sort((a, b) => a.y - b.y);
    // shadows under everyone, auras for champions, stars over the stunned
    const sg = this.shadowG;
    sg.clear();
    if (!p.dead) sg.ellipse(p.x, p.y + 4, 9, 4).fill({ color: 0x000000, alpha: 0.4 });
    for (const f of w.foes) {
      if (f.state === 'spawn') continue;
      const big = f.boss ? 1.6 : f.elite ? 1.3 : 1;
      sg.ellipse(f.x, f.y + 3, f.r * 1.1 * big, f.r * 0.45 * big).fill({ color: 0x000000, alpha: 0.4 });
      if (f.elite) sg.circle(f.x, f.y, f.r * 1.6 + Math.sin(now / 150) * 2).stroke({ width: 2, color: 0xffb020, alpha: 0.55 });
      if (f.stun > 0) for (let i = 0; i < 3; i++) { const a = now / 200 + (i * Math.PI * 2) / 3; sg.star(f.x + Math.cos(a) * 10, f.y - f.r * 2 + Math.sin(a) * 3, 5, 3, 1.4).fill({ color: 0xffe880 }); }
    }

    // bullets: a soft glow, a solid orb in their colour with a dark rim, a white-hot centre.
    // Foe shots are drawn bolder than yours so they're always what you see first.
    const bs = w.bullets;
    while (this.halo.length < bs.length) {
      const h = new Sprite(this.glow), o = new Sprite(this.orbTex), c = new Sprite(this.glow);
      for (const s of [h, o, c]) s.anchor.set(0.5);
      h.blendMode = 'add';
      this.bulletLayer.addChild(h, o, c);
      this.halo.push(h); this.orb.push(o); this.core.push(c);
    }
    for (let i = 0; i < this.halo.length; i++) {
      const b = bs[i], h = this.halo[i], o = this.orb[i], c = this.core[i];
      if (!b) { h.visible = o.visible = c.visible = false; continue; }
      h.visible = o.visible = c.visible = true;
      const wake = b.wake > 0 ? 1 - (b.wake / 0.12) * 0.6 : 1;
      // thrown things (meteors, acid) arc up through the air
      const lift = b.target || b.lob ? Math.sin(Math.min(1, b.age / Math.max(0.1, b.age + b.life)) * Math.PI) * 30 : 0;
      for (const s of [h, o, c]) s.position.set(b.x, b.y - lift);
      h.tint = b.color;
      h.scale.set((b.r * (b.friendly ? 3.6 : 5) * wake) / 32);
      h.alpha = b.friendly ? (b.turret ? 0.7 : 0.45) : 0.55;
      o.tint = b.color;
      o.scale.set((b.r * 2.3 * wake) / 32);
      o.alpha = b.friendly ? 0.75 : 1;
      c.scale.set((b.r * (b.friendly ? 1.3 : 1.5) * wake) / 32);
    }

    // effects and pickups
    const g = this.fxG;
    g.clear();
    // your shots leave short trails
    for (const b of bs) if (b.friendly && !b.orbit && !b.target) g.moveTo(b.x - b.vx * 0.035, b.y - b.vy * 0.035).lineTo(b.x, b.y).stroke({ width: b.r * 1.1, color: b.color, alpha: 0.3 });
    this.drawLight(now, look);
    this.drawWeather(dt, look.weather);
    for (const k of w.pickups) {
      if (k.kind === 'cinder') g.poly([k.x, k.y - 4, k.x + 3, k.y, k.x, k.y + 4, k.x - 3, k.y]).fill({ color: 0xffb04a }).stroke({ width: 1, color: 0x5a2a0a });
      else g.circle(k.x, k.y, 6).fill({ color: 0xff3a4a }).stroke({ width: 1.5, color: 0xffffff, alpha: 0.6 + 0.4 * Math.sin(now / 120) });
    }
    for (const b of bs) if (b.target) g.circle(b.target.x, b.target.y, b.target.boom).stroke({ width: 1.5, color: b.color, alpha: 0.35 });
    for (const b of bs) if (b.lob) g.circle(b.lob.x, b.lob.y, 26).stroke({ width: 1.5, color: b.color, alpha: 0.45 });
    const seenText = new Set<object>();
    for (const f of w.fx) {
      const k = Math.min(1, (w.time - f.t) / f.dur), a = 1 - k;
      switch (f.kind) {
        case 'hit': g.circle(f.x, f.y, 3 + k * 9).stroke({ width: 2, color: f.color, alpha: a }); break;
        case 'graze': g.circle(f.x, f.y, 2 + k * 6).stroke({ width: 1, color: 0xffffff, alpha: a * 0.8 }); break;
        case 'burst': case 'ring': g.circle(f.x, f.y, (f.r ?? 30) * (0.3 + k * 0.7)).stroke({ width: 3 * a + 1, color: f.color, alpha: a * 0.9 }); break;
        case 'boom': g.circle(f.x, f.y, (f.r ?? 60) * (0.4 + k * 0.6)).fill({ color: f.color, alpha: a * 0.35 }).stroke({ width: 4 * a + 1, color: 0xffe0a0, alpha: a }); break;
        case 'nova': g.circle(f.x, f.y, (f.r ?? 600) * k).stroke({ width: 18 * a + 2, color: f.color, alpha: a * 0.8 }); break;
        case 'hurt': g.circle(f.x, f.y, (f.r ?? 40) * k).stroke({ width: 4, color: f.color, alpha: a }); break;
        case 'die':
          g.circle(f.x, f.y, (f.r ?? 10) * (1 + k * 2.5)).stroke({ width: 3, color: f.color, alpha: a });
          for (let i = 0; i < 10; i++) { const an = (i / 10) * Math.PI * 2 + f.x; const d = (f.r ?? 10) * (0.5 + k * 3); g.circle(f.x + Math.cos(an) * d, f.y + Math.sin(an) * d, 2.5 * a + 0.5).fill({ color: f.color, alpha: a }); }
          break;
        case 'spawn': {
          const pul = 0.5 + 0.5 * Math.sin(now / 80);
          g.circle(f.x, f.y, (f.r ?? 20) * (1.4 - k * 0.6)).stroke({ width: 2, color: f.color, alpha: 0.4 + pul * 0.4 });
          g.circle(f.x, f.y, (f.r ?? 20) * k * 0.8).fill({ color: f.color, alpha: 0.15 });
          break;
        }
        case 'blink': {
          const ang = f.r ?? 0;
          for (let i = 0; i < 6; i++) g.circle(f.x + Math.cos(ang) * i * 16, f.y + Math.sin(ang) * i * 16, 6 * a).fill({ color: f.color, alpha: a * 0.6 });
          break;
        }
        case 'text': {
          seenText.add(f);
          let t = this.texts.get(f);
          if (!t) { t = new Text({ text: f.text ?? '', style: { fontFamily: 'VT323, monospace', fontSize: 22, fill: f.color, stroke: { color: 0x000000, width: 4 } } }); t.anchor.set(0.5); this.textLayer.addChild(t); this.texts.set(f, t); }
          t.position.set(f.x, f.y - k * 24);
          t.alpha = a;
          break;
        }
      }
    }
    for (const [key, t] of this.texts) if (!seenText.has(key)) { t.destroy(); this.texts.delete(key); }
    // wind-up warning: a line showing where a charge will go
    for (const f of w.foes) if (f.state === 'wind') {
      const a = Math.atan2(p.y - f.y, p.x - f.x), L = f.boss ? 380 : 220;
      g.moveTo(f.x, f.y).lineTo(f.x + Math.cos(a) * L, f.y + Math.sin(a) * L).stroke({ width: f.boss ? 14 : 8, color: 0xff3a2a, alpha: 0.18 + 0.12 * Math.sin(now / 50) });
    }
    // your hitbox: tiny on purpose. Hold Shift to see it clearly (and move precisely).
    const h = this.hitG;
    h.clear();
    if (!p.dead) {
      if (p.shield) h.circle(p.x, p.y, 17).stroke({ width: 2, color: 0x8fd0ff, alpha: 0.5 + 0.3 * Math.sin(now / 150) });
      h.circle(p.x, p.y, p.r + 1).fill({ color: 0xffffff, alpha: this.inp.focus ? 1 : 0.55 }).stroke({ width: 1.5, color: 0xff4a8a, alpha: this.inp.focus ? 1 : 0.5 });
      if (this.inp.focus) h.circle(p.x, p.y, p.r + 16).stroke({ width: 1, color: 0xffffff, alpha: 0.22 });
      h.moveTo(p.x + Math.cos(p.face) * 14, p.y + Math.sin(p.face) * 14).lineTo(p.x + Math.cos(p.face) * 30, p.y + Math.sin(p.face) * 30).stroke({ width: 2, color: 0xe9dcc0, alpha: 0.45 });
    }
  }

  /** Light: cut holes in the darkness where things glow, then add their colour on top. */
  private drawLight(now: number, look: (typeof LOOK)[number]) {
    const w = this.w, p = w.player;
    const lights: { x: number; y: number; r: number; a: number; color: number; glow: number }[] = [];
    if (!p.dead) lights.push({ x: p.x, y: p.y, r: 200 + Math.sin(now / 160) * 6, a: 1, color: 0xffd8a0, glow: 0.18 });
    for (const b of w.bullets) {
      if (lights.length > 260) break;
      // every shot lights the floor; only some glow, so dense volleys don't wash out
      lights.push({ x: b.x, y: b.y, r: b.r * (b.friendly ? 8 : 6), a: b.friendly ? 0.7 : 0.5, color: b.color, glow: b.id % 3 ? 0 : b.friendly ? 0.08 : 0.07 });
    }
    for (const L of this.lavaLights) lights.push({ x: L.x, y: L.y, r: 90 + Math.sin(now / 300 + L.x) * 8, a: 0.8, color: 0xff6a1a, glow: 0.2 });
    for (const f of w.foes) if (f.boss || f.elite) lights.push({ x: f.x, y: f.y, r: f.boss ? 170 : 90, a: 0.7, color: f.boss ? 0xffd06a : 0xffb020, glow: 0.12 });
    for (const h of w.hazards) if (h.kind === 'beam' && h.t >= h.warn) for (let k = 0; k < 8; k++) lights.push({ x: h.x + Math.cos(h.ang) * k * 90, y: h.y + Math.sin(h.ang) * k * 90, r: 110, a: 0.9, color: h.color, glow: 0.25 });
    for (const f of w.fx) {
      const k = Math.min(1, (w.time - f.t) / f.dur);
      if (f.kind === 'boom' || f.kind === 'die' || f.kind === 'burst') lights.push({ x: f.x, y: f.y, r: (f.r ?? 30) * 3, a: 1 - k, color: f.color, glow: 0.35 * (1 - k) });
      if (f.kind === 'nova' || f.kind === 'phase') lights.push({ x: f.x, y: f.y, r: 900 * k + 80, a: 1 - k, color: f.color, glow: 0.2 * (1 - k) });
    }
    for (const k of w.pickups) if (k.kind === 'heart') lights.push({ x: k.x, y: k.y, r: 40, a: 0.8, color: 0xff3a4a, glow: 0.3 });
    // darkness with holes
    this.darkG.clear().rect(0, 0, AW / 2, AH / 2).fill({ color: look.tint, alpha: look.dark });
    let hi = 0, gi = 0;
    for (const L of lights) {
      let h = this.holes[hi++];
      if (!h) { h = new Sprite(this.glow); h.anchor.set(0.5); h.blendMode = 'erase'; this.holes.push(h); this.darkCont.addChild(h); }
      h.visible = true;
      h.position.set(L.x / 2, L.y / 2);
      h.scale.set(L.r / 32);
      h.alpha = L.a;
      if (L.glow > 0.02) {
        let g = this.glows[gi++];
        if (!g) { g = new Sprite(this.glow); g.anchor.set(0.5); g.blendMode = 'add'; this.glows.push(g); this.glowLayer.addChild(g); }
        g.visible = true;
        g.position.set(L.x, L.y);
        g.scale.set((L.r * 1.4) / 16);
        g.tint = L.color;
        g.alpha = L.glow;
      }
    }
    for (; hi < this.holes.length; hi++) this.holes[hi].visible = false;
    for (; gi < this.glows.length; gi++) this.glows[gi].visible = false;
    this.app.renderer.render({ container: this.darkCont, target: this.darkRT, clear: true });
  }

  /** Each act's weather: leaves, dust, snow, ash, embers. */
  private drawWeather(dt: number, kind: (typeof LOOK)[number]['weather']) {
    const ms = this.motes, rnd = Math.random;
    const want = kind === 'snow' ? 90 : kind === 'dust' ? 45 : 60;
    while (ms.length < want) {
      const m: Mote = { x: rnd() * AW, y: rnd() * AH, vx: 0, vy: 0, life: 4 + rnd() * 6, age: ms.length < want / 2 ? rnd() * 4 : 0, size: 1.5, color: 0xffffff, spin: rnd() * 6 };
      if (kind === 'leaves') { m.vx = 18 + rnd() * 20; m.vy = 22 + rnd() * 18; m.size = 2.5; m.color = rnd() < 0.5 ? 0xc8a040 : rnd() < 0.5 ? 0x8ab040 : 0xd06a2a; m.y = -10 - rnd() * AH * 0.3; }
      if (kind === 'dust') { m.vx = (rnd() - 0.5) * 6; m.vy = -2 - rnd() * 4; m.size = 1.2; m.color = 0xd8c8a8; }
      if (kind === 'snow') { m.vx = -8 + rnd() * 6; m.vy = 26 + rnd() * 24; m.size = 1 + rnd() * 1.6; m.color = 0xf0f8ff; m.y = -10 - rnd() * AH * 0.3; }
      if (kind === 'ash') { m.vx = (rnd() - 0.5) * 14; m.vy = 10 + rnd() * 12; m.size = 1.5; m.color = rnd() < 0.3 ? 0xff4a5a : 0x5a4a4a; }
      if (kind === 'embers') { m.vx = (rnd() - 0.5) * 16; m.vy = -24 - rnd() * 30; m.size = 1.4; m.color = rnd() < 0.5 ? 0xff8a2a : 0xffd06a; m.y = AH + 5; m.x = rnd() * AW; }
      ms.push(m);
    }
    const g = this.weatherG;
    g.clear();
    for (let i = ms.length - 1; i >= 0; i--) {
      const m = ms[i];
      m.age += dt;
      m.x += (m.vx + Math.sin(m.age * 1.3 + m.spin) * (kind === 'leaves' ? 14 : 4)) * dt;
      m.y += m.vy * dt;
      if (m.age > m.life || m.y > AH + 20 || m.y < -40 || m.x > AW + 20) { ms.splice(i, 1); continue; }
      const a = Math.min(1, m.age, m.life - m.age) * (kind === 'dust' ? 0.5 : 0.8);
      if (kind === 'leaves') { const t = m.age * 3 + m.spin; g.ellipse(m.x, m.y, m.size * 1.6, m.size * (0.5 + Math.abs(Math.sin(t)) * 0.6)).fill({ color: m.color, alpha: a }); }
      else g.circle(m.x, m.y, m.size).fill({ color: m.color, alpha: a });
    }
  }

  private hudKey = '';
  private drawHud() {
    const w = this.w, p = w.player;
    const spell = (cards: string[], label: string, cd: number) => {
      const s = spellStats(cards);
      const ready = s ? Math.max(0, 1 - cd * s.rate) : 0;
      const short = s && p.mana < s.mana;
      return `<div class="sslot ${short ? 'short' : ''}"><em>${label}</em>${cards.map((c) => `<img alt="${esc(STORM_CARDS[c].name)}" title="${esc(STORM_CARDS[c].name)}" src="${cardIcon(STORM_CARDS[c].icon, STORM_CARDS[c].school)}">`).join('')}<u style="width:${Math.round(ready * 100)}%"></u></div>`;
    };
    const act = ACTS[w.act];
    const where = w.kind === 'boss' ? bossOf(w).name : `${act.name} · ${Math.min(w.room, ROOMS_PER_ACT)}/${ROOMS_PER_ACT}`;
    const key = `${p.hp}|${p.maxHp}|${p.shield}|${Math.round(p.mana)}|${p.bombs}|${p.cinders}|${Math.round(p.blinkCd * 10)}|${Math.round(p.cdA * 20)}|${Math.round(p.cdB * 20)}|${w.room}|${w.act}|${w.spells[0].join()}|${w.spells[1].join()}|${Math.floor(w.score / 10)}|${p.relics.length}`;
    if (key !== this.hudKey) {
      this.hudKey = key;
      this.hud.innerHTML = `<div class="shearts">${Array.from({ length: p.maxHp }, (_, i) => `<span class="${i < p.hp ? 'on' : ''}">♥</span>`).join('')}${p.shield ? '<span class="ward" title="Ward: blocks one hit">◈</span>' : ''}</div>
        <div class="smana"><i style="width:${Math.round((p.mana / p.maxMana) * 100)}%"></i><b>${Math.floor(p.mana)}</b></div>
        <div class="sblink ${p.blinkCd > 0 ? '' : 'ready'}" title="Blink (Space)">Blink</div>
        <div class="sbomb ${p.bombs ? 'ready' : ''}" title="Ash Nova (F, E or middle click): clears every foe shot">✸ ${p.bombs}</div>
        ${spell(w.spells[0], 'L', p.cdA)}${spell(w.spells[1], 'R', p.cdB)}
        <div class="scind" title="Cinders: spend them at a pedlar">◆ ${p.cinders}</div>
        <div class="sroom">${esc(`${w.loop ? `Abyss ${w.loop} · ` : ''}${roman(w.act + 1)} · ${where}`)}</div>
        <div class="sscore">${Math.floor(w.score).toLocaleString()}</div>
        <button type="button" class="btn small" data-s="pause">Pause</button>`;
      this.hud.querySelector('[data-s="pause"]')?.addEventListener('click', () => this.pause());
      this.root.querySelector('.srelics')!.innerHTML = p.relics.map((id) => `<img alt="${esc(RELICS[id].name)}" title="${esc(`${RELICS[id].name}: ${RELICS[id].desc}`)}" src="${cardIcon(RELICS[id].icon, RELICS[id].school)}">`).join('');
    }
    const boss = w.foes.find((f) => f.boss && f.state !== 'spawn');
    const bb = this.root.querySelector<HTMLElement>('.sboss')!;
    bb.classList.toggle('on', !!boss && this.mode === 'play');
    if (boss) {
      bb.querySelector('b')!.textContent = `${bossOf(w).name}${boss.phase ? ` · ${['', 'II', 'III', 'IV'][boss.phase]}` : ''}`;
      bb.querySelector<HTMLElement>('s')!.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    }
  }

  // ------------------------------------------------------------------ screens
  private show(html: string) { this.panel.innerHTML = `<div class="panel">${html}</div>`; this.panel.classList.add('on'); this.panel.scrollTop = 0; }
  private hide() { this.panel.classList.remove('on'); this.panel.innerHTML = ''; }
  private on(sel: string, fn: (el: HTMLElement) => void) { for (const el of this.panel.querySelectorAll<HTMLElement>(sel)) el.addEventListener('click', () => fn(el)); }

  private menu() {
    this.mode = 'menu';
    const b = this.best.score;
    this.show(`<h2>Cinderstorm</h2>
      <p>The Reach is burning with spellfire. Fight down through five acts, from the Greenwood to the Hollow Throne, with a grimoire that fires what you forge. Every boss sings its attacks in time with the music.</p>
      <ul class="skeys">
        <li><kbd>W A S D</kbd> move</li><li><kbd>Mouse</kbd> aim</li>
        <li><kbd>Left</kbd> / <kbd>Right click</kbd> your two spells</li><li><kbd>Space</kbd> blink (can't be hit)</li>
        <li><kbd>Shift</kbd> focus: slow, precise, hitbox shown</li><li><kbd>F</kbd> Ash Nova: clears every foe shot</li>
        <li>Only the small dot at your centre can be hit. Near misses (grazes) refill mana.</li><li><kbd>Esc</kbd> pause</li>
      </ul>
      <h3>Who descends?</h3>
      <div class="sclasses">${(Object.keys(CLASSES) as ClassId[]).map((c) => `<button type="button" class="btn ${this.cls === c ? 'ember' : ''}" data-cls="${c}"><b>${CLASSES[c].name}</b><small>${esc(CLASSES[c].desc)}</small></button>`).join('')}</div>
      <h3>How fierce?</h3>
      <div class="sdiff">${(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => `<button type="button" class="btn ${this.diff === d ? 'ember' : ''}" data-d="${d}"><b>${DIFFICULTY[d].name}</b><small>${esc(DIFFICULTY[d].desc)}</small>${b[d] ? `<small>Best: ${b[d]!.toLocaleString()}</small>` : ''}</button>`).join('')}</div>
      <label class="sendless"><input type="checkbox" id="sEndless" ${this.endless ? 'checked' : ''}> The Abyss: after the Hollow King, loop back to the start, harder each time, for as long as you last.${this.best.abyss ? ` (Deepest: Abyss ${this.best.abyss})` : ''}</label>
      <div class="row"><button type="button" class="btn ember" data-s="go">Begin</button><button type="button" class="btn" data-s="daily">Daily storm (${today()})${this.best.daily?.[today()] ? ` · best ${this.best.daily[today()].toLocaleString()}` : ''}</button><button type="button" class="btn" data-s="ach">Achievements ${this.ach.length}/${ACH.length}</button><button type="button" class="btn" data-s="quit">Back to title</button></div>`);
    this.on('[data-cls]', (el) => { this.cls = el.dataset.cls as ClassId; this.best.cls = this.cls; saveBest(this.best); this.menu(); });
    this.on('[data-s="daily"]', () => { this.daily = true; this.startRun(); });
    this.on('[data-s="ach"]', () => this.achievements());
    this.on('[data-d]', (el) => { this.diff = el.dataset.d as Difficulty; this.menu(); });
    this.panel.querySelector<HTMLInputElement>('#sEndless')!.addEventListener('change', (e) => { this.endless = (e.target as HTMLInputElement).checked; });
    this.on('[data-s="go"]', () => { this.daily = false; this.startRun(); });
    this.on('[data-s="quit"]', () => this.exit());
  }

  private achievements() {
    this.show(`<h2>Achievements</h2><p>Each one is worth 5 Ash, once.</p>
      <div class="sach">${ACH.map((a) => `<div class="${this.ach.includes(a.id) ? 'got' : ''}"><b>${this.ach.includes(a.id) ? '★' : '☆'} ${esc(a.name)}</b><span>${esc(a.desc)}</span></div>`).join('')}</div>
      <div class="row"><button type="button" class="btn" data-s="back">Back</button></div>`);
    this.on('[data-s="back"]', () => this.menu());
  }

  private actCard(then: () => void) {
    this.mode = 'between';
    const w = this.w, act = ACTS[w.act];
    music.setRegion(act.tune);
    this.show(`<div class="sact"><small>${w.loop ? `Abyss ${w.loop} · ` : ''}Act ${roman(w.act + 1)}</small><h2>${esc(act.name)}</h2><p>${esc(act.blurb)}</p>
      ${act.roster.length ? `<p class="k">Three rooms, then <b>${esc(act.bossName)}</b>.</p>` : `<p class="k">Only <b>${esc(act.bossName)}</b> remains.</p>`}
      <div class="row"><button type="button" class="btn ember" data-s="go">Enter</button></div></div>`);
    this.on('[data-s="go"]', () => then());
  }

  private pause() {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.ptrA = this.ptrB = false;
    this.show(`<h2>Paused</h2>
      <p class="k">${this.w.player.relics.length ? `Relics: ${this.w.player.relics.map((id) => esc(RELICS[id].name)).join(', ')}` : 'No relics yet.'}</p>
      <div class="row"><button type="button" class="btn ember" data-s="go">Resume</button><button type="button" class="btn" data-s="forge">Look at my spells</button><button type="button" class="btn" data-s="quit">Abandon the run</button></div>`);
    this.on('[data-s="go"]', () => this.resume());
    this.on('[data-s="forge"]', () => this.forge(() => { this.mode = 'paused'; this.resume(); }, 'Back to the fight'));
    this.on('[data-s="quit"]', () => this.results(true));
  }
  private resume() {
    this.hide();
    this.mode = 'play';
    this.last = performance.now();
    this.acc = 0;
    this.keys.clear();
    this.ptrA = this.ptrB = false;
  }

  /** What happens after a room is won. */
  private afterRoom() {
    const w = this.w;
    switch (w.kind) {
      case 'boss':
        this.pickRelic(3, `${bossOf(w).name} falls`, 'Take one gift from its hoard. You also mend two hearts.', () => {
          w.player.hp = Math.min(w.player.maxHp, w.player.hp + 2);
          if (!nextAct(w)) { this.mode = 'won'; this.results(); return; }
          this.actCard(() => this.enter());
        });
        break;
      case 'elite':
        if (this.duel) { this.duel = false; this.pickRelic(3, 'The duelist yields', 'Take your first prize.', () => this.pickRelic(3, 'And your second', 'As promised.', () => this.doors())); break; }
        this.pickRelic(2, 'The champion falls', 'Choose a relic, then a card.', () => this.reward(() => this.doors()));
        break;
      default:
        this.reward(() => this.doors());
    }
  }

  private reward(then: () => void) {
    const choices = rewardChoices(this.w, this.owned, BASES, MODS);
    this.show(`<h2>Room cleared</h2><p>Choose a card for your grimoire.</p><div class="scards">${choices.map((c) => cardHtml(c, `data-pick="${c}"`)).join('')}</div>
      <div class="row"><button type="button" class="btn small" data-s="skip">Skip (+15 cinders)</button></div>`);
    this.on('[data-pick]', (el) => { this.owned.push(el.dataset.pick!); play('click'); this.forge(then, 'Onward'); });
    this.on('[data-s="skip"]', () => { this.w.player.cinders += 15; this.forge(then, 'Onward'); });
  }

  private pickRelic(n: number, title: string, text: string, then: () => void) {
    const choices = relicChoices(this.w, n);
    if (!choices.length) { then(); return; }
    this.show(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="scards">${choices.map((id) => relicHtml(id, `data-relic="${id}"`)).join('')}</div>`);
    this.on('[data-relic]', (el) => { addRelic(this.w, el.dataset.relic!); play('heal'); then(); });
  }

  /** Two doors: choose what the next room holds. */
  private doors() {
    const w = this.w;
    const opts = doorChoices(w);
    this.show(`<h2>${opts.length > 1 ? 'Two doors' : 'One door'}</h2><p>${w.room + 1 > ROOMS_PER_ACT ? 'Something waits beyond. Make ready.' : `Where next? (room ${w.room + 1} of ${ROOMS_PER_ACT}, then the boss)`}</p>
      <div class="sdoors">${opts.map((k, i) => `<button type="button" class="sdoor ${k}" data-door="${i}"><i>${DOORS[k].glyph}</i><b>${esc(k === 'boss' ? bossOf(w).name : DOORS[k].name)}</b><span>${esc(DOORS[k].desc)}</span></button>`).join('')}</div>
      <div class="row"><button type="button" class="btn small" data-s="forge">Open the forge</button></div>`);
    this.on('[data-door]', (el) => this.go(opts[Number(el.dataset.door)]));
    this.on('[data-s="forge"]', () => this.forge(() => this.doors(), 'Back to the doors'));
  }

  private go(kind: RoomKind) {
    const w = this.w;
    enterRoom(w, w.room + 1, kind);
    if (kind === 'treasure') this.pickRelic(3, 'A hoard', 'Something glints among the bones. Take one.', () => this.doors());
    else if (kind === 'shrine') this.shrine();
    else if (kind === 'shop') this.shop();
    else if (kind === 'event') this.event();
    else this.enter();
  }

  /** Strange Lights: one of six encounters. */
  private event() {
    const w = this.w, p = w.player;
    const which = Math.floor(Math.abs(Math.sin(w.time * 7.3 + w.room * 13 + w.act * 31 + p.cinders)) * 6);
    const done = (msg: string) => { this.show(`<h2>${esc(msg)}</h2><div class="row"><button type="button" class="btn ember" data-s="on">Onward</button></div>`); this.on('[data-s="on"]', () => this.doors()); };
    const ask = (title: string, text: string, opts: { label: string; ok?: boolean; act: () => void }[]) => {
      this.show(`<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="soffers">${opts.map((o, i) => `<button type="button" class="btn" data-ev="${i}" ${o.ok === false ? 'disabled' : ''}>${esc(o.label)}</button>`).join('')}</div>`);
      this.on('[data-ev]', (el) => { play('click'); opts[Number(el.dataset.ev)].act(); });
    };
    const leave = { label: 'Walk on by', act: () => this.doors() };
    switch (which) {
      case 0: {
        const rel = relicChoices(w, 1)[0], curse = curseChoice(w, CURSE_IDS);
        ask('A cursed chest', 'Chains, a lock shaped like a mouth, and a glow from inside.', [
          { label: rel && curse ? `Open it: take ${RELICS[rel].name}, and ${RELICS[curse].name}` : 'Open it', ok: !!rel, act: () => { addRelic(w, rel); if (curse) addRelic(w, curse); done(`You take ${RELICS[rel].name}${curse ? `. Something follows you out: ${RELICS[curse].name}.` : '.'}`); } },
          leave,
        ]);
        break;
      }
      case 1:
        ask('The gambler', '"Double or nothing on your cinders? A fair coin, I swear."', [
          { label: `Bet 30 cinders`, ok: p.cinders >= 30, act: () => { p.cinders -= 30; if (coinFlip(w)) { p.cinders += 60; done('Heads. He pays out with a grimace: +60 cinders.'); } else done('Tails. He grins and pockets your cinders.'); } },
          { label: `Bet everything (${p.cinders})`, ok: p.cinders > 0, act: () => { const n = p.cinders; p.cinders = 0; if (coinFlip(w)) { p.cinders = n * 2; done(`Heads! ${n * 2} cinders.`); } else done('Tails. Your purse is empty.'); } },
          leave,
        ]);
        break;
      case 2:
        ask('A fountain of embers', 'Warm light pools in a stone basin. Drink, or bathe your grimoire?', [
          { label: 'Drink: mend every heart', ok: p.hp < p.maxHp, act: () => { p.hp = p.maxHp; done('Warmth runs through you. Fully mended.'); } },
          { label: 'Bathe the grimoire: +25 maximum mana', act: () => { p.maxMana += 25; p.mana = p.maxMana; done('The pages drink the light. +25 maximum mana.'); } },
          leave,
        ]);
        break;
      case 3: {
        const loose = this.owned.filter((c) => !w.spells[0].includes(c) && !w.spells[1].includes(c));
        ask('A wandering scribe', '"Give me one of your spare cards and I\u2019ll write you two new ones."', [
          { label: loose.length ? `Give ${STORM_CARDS[loose[0]].name}: get two random cards` : 'You have no spare cards', ok: loose.length > 0, act: () => { this.owned.splice(this.owned.indexOf(loose[0]), 1); const got = rewardChoices(w, this.owned, BASES, MODS).slice(0, 2); this.owned.push(...got); done(`The scribe writes you ${got.map((c) => STORM_CARDS[c].name).join(' and ')}.`); } },
          leave,
        ]);
        break;
      }
      case 4:
        ask('The duelist', 'A champion bars the way, bored. "Fight me. Win, and take two prizes."', [
          { label: 'Accept the duel (a champion fight, then two relics)', act: () => { enterRoom(w, w.room, 'elite'); w.waves = [[{ type: w.waves[1].find((x) => x.elite)?.type ?? 'ghoul', elite: true }]]; this.duel = true; this.enter(); } },
          leave,
        ]);
        break;
      default:
        ask('An altar of ash', 'It hungers for the fire you carry.', [
          { label: 'Give up an Ash Nova: your spells hit 15% harder for the rest of the run', ok: p.bombs > 0, act: () => { p.bombs--; p.dmgBonus += 0.15; done('The altar flares. Your spells burn hotter.'); } },
          { label: 'Give up a heart for good: 30% harder', ok: p.maxHp > 2, act: () => { p.maxHp--; p.hp = Math.min(p.hp, p.maxHp); p.dmgBonus += 0.3; done('It drinks deep. Your spells burn much hotter.'); } },
          leave,
        ]);
    }
  }
  private duel = false;

  private shrine() {
    const w = this.w, p = w.player;
    const rel = relicChoices(w, 1)[0];
    const offers: { text: string; ok: boolean; act: () => void }[] = [
      { text: `Bleed for it: lose a heart for good, gain ${rel ? RELICS[rel].name : 'nothing'}.`, ok: !!rel && p.maxHp > 2, act: () => { p.maxHp--; p.hp = Math.min(p.hp, p.maxHp); addRelic(w, rel); } },
      { text: 'Pray: mend every heart.', ok: p.hp < p.maxHp, act: () => { p.hp = p.maxHp; } },
      { text: 'Burn 25 cinders: one more Ash Nova.', ok: p.cinders >= 25, act: () => { p.cinders -= 25; p.bombs++; } },
      { text: 'Kneel: a random card for your grimoire.', ok: true, act: () => { this.owned.push(rewardChoices(w, this.owned, BASES, MODS)[0]); } },
    ];
    this.show(`<h2>A shrine</h2><p>Candles that never burn down. Make one offering.</p>
      <div class="soffers">${offers.map((o, i) => `<button type="button" class="btn" data-off="${i}" ${o.ok ? '' : 'disabled'}>${esc(o.text)}</button>`).join('')}</div>
      <div class="row"><button type="button" class="btn small" data-s="leave">Leave it be</button></div>`);
    this.on('[data-off]', (el) => { offers[Number(el.dataset.off)].act(); play('heal'); this.doors(); });
    this.on('[data-s="leave"]', () => this.doors());
  }

  private shopStock: { kind: 'card' | 'relic' | 'heart' | 'bomb'; id: string; price: number; sold: boolean }[] = [];
  private shop(restock = true) {
    const w = this.w, p = w.player;
    if (restock) {
      const cards = rewardChoices(w, this.owned, BASES, MODS).slice(0, 3);
      this.shopStock = [
        ...cards.map((id) => ({ kind: 'card' as const, id, price: STORM_CARDS[id].price, sold: false })),
        ...relicChoices(w, 2).map((id) => ({ kind: 'relic' as const, id, price: RELICS[id].price, sold: false })),
        { kind: 'heart', id: 'heart', price: 20, sold: false },
        { kind: 'bomb', id: 'bomb', price: 25, sold: false },
      ];
    }
    const item = (it: (typeof this.shopStock)[number], i: number) => {
      const can = !it.sold && p.cinders >= it.price && !(it.kind === 'heart' && p.hp >= p.maxHp);
      const price = ` · ◆ ${it.price}${it.sold ? ' · sold' : ''}`;
      const attr = `data-buy="${i}" ${can ? '' : 'disabled'}`;
      if (it.kind === 'card') return cardHtml(it.id, attr, price);
      if (it.kind === 'relic') return relicHtml(it.id, attr, price);
      return `<button type="button" class="scard" ${attr} style="--c:#ff3a4a"><i class="sglyph">${it.kind === 'heart' ? '♥' : '✸'}</i><b>${it.kind === 'heart' ? 'Heart' : 'Ash Nova'}</b><small>Supply${price}</small><span>${it.kind === 'heart' ? 'Mend one heart.' : 'One more screen-clearing Nova.'}</span></button>`;
    };
    this.show(`<h2>A pedlar</h2><p>"Cinders, friend. Everything has a price down here." You have <b>◆ ${p.cinders}</b>.</p>
      <div class="scards small">${this.shopStock.map(item).join('')}</div>
      <div class="row"><button type="button" class="btn small" data-s="forge">Open the forge</button><button type="button" class="btn ember" data-s="leave">Move on</button></div>`);
    this.on('[data-buy]', (el) => {
      const it = this.shopStock[Number(el.dataset.buy)];
      if (it.sold || p.cinders < it.price) return;
      p.cinders -= it.price;
      it.sold = true;
      if (it.kind === 'card') this.owned.push(it.id);
      else if (it.kind === 'relic') addRelic(w, it.id);
      else if (it.kind === 'heart') { p.hp = Math.min(p.maxHp, p.hp + 1); it.sold = false; it.price += 10; }
      else { p.bombs++; it.sold = false; it.price += 15; }
      play('portal');
      this.shop(false);
    });
    this.on('[data-s="forge"]', () => this.forge(() => this.shop(false), 'Back to the pedlar'));
    this.on('[data-s="leave"]', () => this.doors());
  }

  /** The forge: build your two spells from the cards you own. */
  private forge(then: () => void, label: string) {
    const w = this.w;
    const used = [...w.spells[0], ...w.spells[1]];
    const spare = [...this.owned];
    for (const u of used) { const i = spare.indexOf(u); if (i >= 0) spare.splice(i, 1); }
    const row = (i: 0 | 1) => `<div class="sforge ${this.slot === i ? 'sel' : ''}" data-row="${i}">
      <em>${i === 0 ? 'Left click' : 'Right click'}</em>
      <div class="chips">${w.spells[i].map((c, j) => `<button type="button" class="chip" data-rm="${i}:${j}" title="Take ${esc(STORM_CARDS[c].name)} out" style="--c:${SCHOOL_COLOR[STORM_CARDS[c].school]}"><img alt="" src="${cardIcon(STORM_CARDS[c].icon, STORM_CARDS[c].school)}">${esc(STORM_CARDS[c].name)}<span class="x">✕</span></button>`).join('<span class="arrow">›</span>') || '<i>empty</i>'}</div>
      <p>${esc(spellSummary(w.spells[i]))}</p></div>`;
    this.show(`<h2>The forge</h2>
      <p>Click a spell to select it, then click spare cards to add them. One base per spell, up to ${MAX_MODS} modifiers. Click a card in a spell to take it out.</p>
      ${row(0)}${row(1)}
      <h3>Spare cards</h3><div class="scards small">${spare.map((c, i) => cardHtml(c, `data-add="${i}"`)).join('') || '<i>All your cards are in use.</i>'}</div>
      <div class="row"><button type="button" class="btn ember" data-s="next">${esc(label)}</button></div>`);
    for (const r of this.panel.querySelectorAll<HTMLElement>('[data-row]')) r.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-rm]')) return; this.slot = Number(r.dataset.row) as 0 | 1; this.forge(then, label); });
    this.on('[data-rm]', (el) => { const [i, j] = el.dataset.rm!.split(':').map(Number); w.spells[i as 0 | 1].splice(j, 1); play('click'); this.forge(then, label); });
    this.on('[data-add]', (el) => {
      const id = spare[Number(el.dataset.add)];
      const sp = w.spells[this.slot];
      if (STORM_CARDS[id].kind === 'base') {
        const at = sp.findIndex((c) => STORM_CARDS[c].kind === 'base');
        if (at >= 0) sp.splice(at, 1);
        sp.unshift(id);
      } else {
        if (sp.filter((c) => STORM_CARDS[c].kind === 'mod').length >= MAX_MODS) { el.classList.add('no'); setTimeout(() => el.classList.remove('no'), 300); return; }
        sp.push(id);
      }
      play('click');
      this.forge(then, label);
    });
    this.on('[data-s="next"]', () => then());
  }

  private newAch: string[] = [];
  private bank() {
    if (this.banked) return 0;
    this.banked = true;
    const w = this.w;
    this.newAch = ACH.filter((a) => !this.ach.includes(a.id) && a.test(w)).map((a) => a.id);
    this.ach.push(...this.newAch);
    saveAch(this.ach);
    if (this.daily) { this.best.daily = { ...(this.best.daily ?? {}) }; this.best.daily[today()] = Math.max(this.best.daily[today()] ?? 0, Math.floor(w.score)); }
    const ash = stormAsh(w) + this.newAch.length * 5;
    if (ash > 0) { meta.ash += ash; saveMeta(); }
    if (w.score > (this.best.score[w.diff] ?? 0)) this.best.score[w.diff] = Math.floor(w.score);
    if (w.loop > this.best.abyss) this.best.abyss = w.loop;
    saveBest(this.best);
    return ash;
  }

  private results(abandoned = false) {
    const w = this.w;
    const prevBest = this.best.score[w.diff] ?? 0;
    const ash = this.bank();
    const st = w.stats;
    const act = ACTS[w.act];
    const won = w.won && !w.player.dead && !abandoned;
    this.mode = won ? 'won' : 'dead';
    this.show(`<h2>${won ? `${bossOf(w).name} falls` : abandoned ? 'You walk out of the fire' : 'Your light goes out'}</h2>
      <p>${won ? 'The Reach goes quiet. Your grimoire is still warm.' : `${abandoned ? 'You left' : 'You fell'} in ${esc(w.kind === 'boss' ? `the lair of ${bossOf(w).name}` : act.name)}${w.loop ? `, ${w.loop} loop${w.loop > 1 ? 's' : ''} into the Abyss` : ''}.`}</p>
      <p class="sbig">${Math.floor(w.score).toLocaleString()}${w.score > prevBest ? ' <small>new best!</small>' : ''}</p>
      ${this.newAch.length ? `<div class="sach">${this.newAch.map((id) => { const a = ACH.find((x) => x.id === id)!; return `<div class="got"><b>★ ${esc(a.name)}</b><span>${esc(a.desc)} (+5 Ash)</span></div>`; }).join('')}</div>` : ''}
      <p class="k">${this.daily ? 'Daily storm · ' : ''}${CLASSES[w.player.cls].name} · ${DIFFICULTY[w.diff].name} · Rooms ${st.rooms} · Bosses ${st.bosses} · Foes felled ${st.kills} · Grazes ${st.grazes} · Hits taken ${st.hitsTaken}${ash ? ` · <b>+${ash} Ash</b> carried home` : ''}</p>
      <div class="row"><button type="button" class="btn ember" data-s="again">Run again</button><button type="button" class="btn" data-s="menu">Change difficulty</button><button type="button" class="btn" data-s="quit">Back to title</button></div>`);
    this.on('[data-s="again"]', () => this.startRun());
    this.on('[data-s="menu"]', () => this.menu());
    this.on('[data-s="quit"]', () => this.exit());
  }

  private exit() {
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('keydown', this.kd, true);
    window.removeEventListener('keyup', this.ku, true);
    window.removeEventListener('blur', this.blur);
    music.onStep = null;
    music.setIntensity(0);
    music.setScene('menu');
    music.setRegion('title');
    this.app.destroy(true, { children: true });
    this.root.remove();
    active = null;
    this.onExit();
  }
}

/** Darkened corners, so the eye stays in the middle of the fight. */
function vignetteCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(128, 128, 60, 128, 128, 182);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.85)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  return c;
}

/** A solid ball with a dark rim (tinted per bullet). */
function orbCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.75)';
  g.beginPath(); g.arc(16, 16, 15.5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(16, 16, 13, 0, Math.PI * 2); g.fill();
  return c;
}

function glowCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.7, 'rgba(255,255,255,0.25)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return c;
}

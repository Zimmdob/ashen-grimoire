import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { drawLava, drawMap } from '../render/mapArt';
import { buildSprites, type SpriteSet } from '../render/sprites';
import { cardIcon, SCHOOL_COLOR } from '../ui/icons';
import { music } from '../ui/music';
import { play } from '../ui/sfx';
import { meta, saveMeta } from '../ui/meta';
import type { LevelSnap } from '../sim/types';
import { BASES, MAX_MODS, MODS, spellStats, spellSummary, STORM_CARDS } from './cards';
import { AH, AW, enterRoom, MH, MW, newRun, NO_INPUT, onBeat, rewardChoices, STEP, stormAsh, update, type Input, type StormWorld } from './sim';

// Cinderstorm: the real-time, bullet-hell mode. This file owns the screen: drawing, controls, the HUD
// and the forge between rooms. The rules live in sim.ts.

type Mode = 'intro' | 'play' | 'reward' | 'forge' | 'paused' | 'dead' | 'won';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const cardHtml = (id: string, attr = '') => {
  const c = STORM_CARDS[id];
  return `<button type="button" class="scard ${c.kind}" ${attr} style="--c:${SCHOOL_COLOR[c.school]}"><img alt="" src="${cardIcon(c.icon, c.school)}"><b>${esc(c.name)}</b><small>${c.kind === 'base' ? 'Base' : 'Modifier'}</small><span>${esc(c.desc)}</span></button>`;
};

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
  private unitLayer = new Container();
  private bulletLayer = new Container();
  private fxG = new Graphics();
  private hitG = new Graphics();
  private sprites: Record<string, SpriteSet> = {};
  private foeSprites = new Map<number, Sprite>();
  private playerSprite = new Sprite();
  private halo: Sprite[] = [];
  private orb: Sprite[] = [];
  private core: Sprite[] = [];
  private glow!: Texture;
  private orbTex!: Texture;
  private w!: StormWorld;
  private mode: Mode = 'intro';
  private inp: Input = { ...NO_INPUT };
  private keys = new Set<string>();
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

  constructor(private onExit: () => void) {}

  async boot() {
    this.root.className = 'storm';
    this.root.innerHTML = `<div class="shud"></div><div class="sboss"><b></b><i><s></s></i></div><div class="spanel"></div>`;
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
    this.world.addChild(this.mapSprite, this.liqSprite, this.fxG, this.unitLayer, this.bulletLayer, this.hitG);
    this.app.stage.addChild(this.world);
    this.playerSprite = new Sprite(Texture.from(this.sprites.wizard.canvas));
    this.playerSprite.anchor.set(0.5, 0.7);
    this.playerSprite.scale.set(2);
    this.newRun();
    this.bind();
    this.app.ticker.add(() => this.frame());
    music.setScene('dungeon');
    music.setRegion('stormwood');
    music.onStep = (s, inMs) => { this.beats.push({ at: performance.now() + inMs, s }); this.lastBeatSeen = performance.now(); };
    this.intro();
  }

  private newRun() {
    this.w = newRun(this.seed);
    this.seed = (this.seed * 1103515245 + 12345) | 0;
    this.owned = ['ember', 'thorn'];
    this.banked = false;
    this.buildMap();
    for (const s of this.foeSprites.values()) s.destroy();
    this.foeSprites.clear();
    this.unitLayer.removeChildren();
    this.unitLayer.addChild(this.playerSprite);
  }

  private buildMap() {
    this.snap = { level: this.w.room, MW, MH, map: this.w.map, torches: [], units: [], pickups: [], biome: this.w.kind === 'boss' ? 'elderglen' : 'greenwood', wells: [] };
    const old = this.mapSprite.texture;
    this.mapSprite.texture = Texture.from(drawMap(this.snap));
    if (old && old !== Texture.EMPTY) old.destroy(true);
    this.liqCanvas.width = MW * 16;
    this.liqCanvas.height = MH * 16;
    drawLava(this.liqCanvas, this.snap, 0);
    this.liqSprite.texture = Texture.from(this.liqCanvas);
  }

  // ------------------------------------------------------------------ controls
  private bind() {
    const cv = this.app.canvas as HTMLCanvasElement;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointermove', (e) => this.aim(e));
    cv.addEventListener('pointerdown', (e) => { this.aim(e); if (e.button === 0) this.ptrA = true; if (e.button === 2) this.ptrB = true; });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('keydown', this.kd, true);
    window.addEventListener('keyup', this.ku, true);
    window.addEventListener('blur', this.blur);
  }
  private ptrA = false;
  private ptrB = false;
  private up = (e: PointerEvent) => { if (e.button === 0) this.ptrA = false; if (e.button === 2) this.ptrB = false; };
  private blur = () => { this.keys.clear(); this.ptrA = this.ptrB = false; this.inp = { ...NO_INPUT, mx: this.inp.mx, my: this.inp.my }; if (this.mode === 'play') this.pause(); };
  private kd = (e: KeyboardEvent) => {
    // Cinderstorm has the keyboard while it's open: the main game never sees these keys
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    e.stopImmediatePropagation();
    const k = e.key.toLowerCase();
    if (k === 'escape') { e.preventDefault(); if (this.mode === 'play') this.pause(); else if (this.mode === 'paused') this.resume(); return; }
    if (k === ' ' || k === 'tab') e.preventDefault();
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
    if (this.mode === 'play') {
      this.readKeys();
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n++ < 6) {
        this.beatsDue();
        update(this.w, this.inp);
        this.acc -= STEP;
        this.sounds();
      }
      this.afterTick(now);
    }
    this.draw(now);
    this.drawHud();
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
      if (s === 'hit') { if (now - this.lastHitSound < 70) continue; this.lastHitSound = now; }
      play(s);
      if (s === 'boom') this.shake = Math.max(this.shake, 6);
    }
  }

  private afterTick(now: number) {
    const w = this.w;
    const fighting = w.foes.length > 0;
    music.setIntensity(fighting ? (w.kind === 'boss' ? 1 : 0.7) : 0.15);
    if (w.player.dead && this.mode === 'play') { this.mode = 'dead'; setTimeout(() => this.results(false), 1200); return; }
    if (w.cleared) {
      if (!this.clearedAt) { this.clearedAt = now; play('portal'); }
      if (now - this.clearedAt > 1300) {
        this.clearedAt = 0;
        if (w.kind === 'boss') { this.mode = 'won'; this.results(true); } else this.reward();
      }
    }
  }

  // ------------------------------------------------------------------ drawing
  private draw(now: number) {
    const w = this.w;
    const sw = this.app.screen.width, sh = this.app.screen.height;
    this.scale = Math.min(sw / AW, (sh - 8) / AH);
    this.shake *= 0.88;
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    this.world.scale.set(this.scale);
    this.world.position.set(Math.round((sw - AW * this.scale) / 2 + sx), Math.round((sh - AH * this.scale) / 2 + sy));
    if (Math.floor(now / 100) % 2 === 0 && this.liqSprite.texture) { drawLava(this.liqCanvas, this.snap, now / 1000); this.liqSprite.texture.source.update(); }

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
        s = new Sprite(Texture.from((this.sprites[f.type] ?? this.sprites.wolf).canvas));
        s.anchor.set(0.5, 0.75);
        this.foeSprites.set(f.id, s);
        this.unitLayer.addChild(s);
      }
      const big = f.boss ? 3.4 : 2;
      s.scale.set(p.x < f.x ? -big : big, big);
      s.position.set(f.x, f.y);
      s.alpha = f.state === 'spawn' ? 0.25 + 0.3 * Math.sin(now / 60) : 1;
      s.tint = f.flash > 0.05 ? (f.state === 'wind' ? 0xff8a8a : 0xffffff) : f.slow > 0 ? 0xa8d8ff : f.burnT > 0 ? 0xffc890 : 0xffffff;
      if (f.flash > 0.5 && f.state !== 'wind') s.tint = 0xff9a9a;
    }
    for (const [id, s] of this.foeSprites) if (!seen.has(id)) { s.destroy(); this.foeSprites.delete(id); }
    this.unitLayer.children.sort((a, b) => a.y - b.y);

    // bullets: a soft glow, a solid orb in their colour with a dark rim, and a white-hot centre.
    // Foe shots are drawn bolder than yours so they're always the thing you see first.
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
      for (const s of [h, o, c]) s.position.set(b.x, b.y);
      h.tint = b.color;
      h.scale.set((b.r * (b.friendly ? 3.6 : 5) * wake) / 32);
      h.alpha = b.friendly ? 0.45 : 0.55;
      o.tint = b.color;
      o.scale.set((b.r * 2.3 * wake) / 32);
      o.alpha = b.friendly ? 0.75 : 1;
      c.tint = 0xffffff;
      c.scale.set((b.r * (b.friendly ? 1.3 : 1.5) * wake) / 32);
    }

    // effects
    const g = this.fxG;
    g.clear();
    for (const f of w.fx) {
      const k = Math.min(1, (w.time - f.t) / f.dur), a = 1 - k;
      switch (f.kind) {
        case 'hit': g.circle(f.x, f.y, 3 + k * 9).stroke({ width: 2, color: f.color, alpha: a }); break;
        case 'burst': case 'ring': g.circle(f.x, f.y, (f.r ?? 30) * (0.3 + k * 0.7)).stroke({ width: 3 * a + 1, color: f.color, alpha: a * 0.9 }); break;
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
      }
    }
    // wind-up warning: a line showing where a charge will go
    for (const f of w.foes) if (f.state === 'wind') {
      const a = Math.atan2(p.y - f.y, p.x - f.x), L = f.boss ? 380 : 220;
      g.moveTo(f.x, f.y).lineTo(f.x + Math.cos(a) * L, f.y + Math.sin(a) * L).stroke({ width: f.boss ? 14 : 8, color: 0xff3a2a, alpha: 0.18 + 0.12 * Math.sin(now / 50) });
    }
    // your hitbox: tiny on purpose. Hold Shift to see it clearly (and move precisely).
    const h = this.hitG;
    h.clear();
    if (!p.dead) {
      h.circle(p.x, p.y, p.r + 1).fill({ color: 0xffffff, alpha: this.inp.focus ? 1 : 0.55 }).stroke({ width: 1.5, color: 0xff4a8a, alpha: this.inp.focus ? 1 : 0.5 });
      if (this.inp.focus) h.circle(p.x, p.y, 22).stroke({ width: 1, color: 0xffffff, alpha: 0.25 });
      // aim line
      h.moveTo(p.x + Math.cos(p.face) * 14, p.y + Math.sin(p.face) * 14).lineTo(p.x + Math.cos(p.face) * 30, p.y + Math.sin(p.face) * 30).stroke({ width: 2, color: 0xe9dcc0, alpha: 0.45 });
    }
  }

  private hudKey = '';
  private drawHud() {
    const w = this.w, p = w.player;
    const sA = spellStats(w.spells[0]), sB = spellStats(w.spells[1]);
    const spell = (cards: string[], s: ReturnType<typeof spellStats>, label: string, cd: number) => {
      const ready = s ? Math.max(0, 1 - cd * s.rate) : 0;
      const short = s && p.mana < s.mana;
      return `<div class="sslot ${short ? 'short' : ''}"><em>${label}</em>${cards.map((c) => `<img alt="${esc(STORM_CARDS[c].name)}" title="${esc(STORM_CARDS[c].name)}" src="${cardIcon(STORM_CARDS[c].icon, STORM_CARDS[c].school)}">`).join('')}<u style="width:${Math.round(ready * 100)}%"></u></div>`;
    };
    const key = `${p.hp}|${Math.round(p.mana)}|${Math.round(p.blinkCd * 10)}|${Math.round(p.cdA * 20)}|${Math.round(p.cdB * 20)}|${w.room}|${w.spells[0].join()}|${w.spells[1].join()}`;
    if (key !== this.hudKey) {
      this.hudKey = key;
      this.hud.innerHTML = `<div class="shearts">${Array.from({ length: p.maxHp }, (_, i) => `<span class="${i < p.hp ? 'on' : ''}">♥</span>`).join('')}</div>
        <div class="smana"><i style="width:${Math.round((p.mana / p.maxMana) * 100)}%"></i><b>${Math.floor(p.mana)}</b></div>
        <div class="sblink ${p.blinkCd > 0 ? '' : 'ready'}" title="Blink (Space)">Blink</div>
        ${spell(w.spells[0], sA, 'Left', p.cdA)}${spell(w.spells[1], sB, 'Right', p.cdB)}
        <div class="sroom">${w.kind === 'boss' ? 'The Stag’s Ring' : `Glade ${w.room} of ${w.rooms - 1}`}</div>
        <button type="button" class="btn small" data-s="pause">Pause</button>`;
      this.hud.querySelector('[data-s="pause"]')?.addEventListener('click', () => this.pause());
    }
    const boss = w.foes.find((f) => f.boss && f.state !== 'spawn');
    const bb = this.root.querySelector<HTMLElement>('.sboss')!;
    bb.classList.toggle('on', !!boss && this.mode === 'play');
    if (boss) {
      bb.querySelector('b')!.textContent = w.bossName;
      bb.querySelector<HTMLElement>('s')!.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    }
  }

  // ------------------------------------------------------------------ screens
  private show(html: string) { this.panel.innerHTML = `<div class="panel">${html}</div>`; this.panel.classList.add('on'); }
  private hide() { this.panel.classList.remove('on'); this.panel.innerHTML = ''; }

  private intro() {
    this.mode = 'intro';
    this.show(`<h2>Cinderstorm <small>prototype</small></h2>
      <p>The Greenwood is burning with spellfire. Fight through three glades and face <b>The Old Stag</b>, whose song fires in time with the music.</p>
      <ul class="skeys">
        <li><kbd>W A S D</kbd> move</li><li><kbd>Mouse</kbd> aim</li>
        <li><kbd>Left click</kbd> your first spell</li><li><kbd>Right click</kbd> your second spell</li>
        <li><kbd>Space</kbd> blink: a quick dash you can't be hit during</li>
        <li><kbd>Shift</kbd> focus: move slowly and see your tiny hitbox</li><li><kbd>Esc</kbd> pause</li>
      </ul>
      <p>Only the small dot at your centre can be hit. After each glade, take a card and reforge your spells: a base (what you shoot) plus up to three modifiers (how it flies).</p>
      <div class="row"><button type="button" class="btn ember" data-s="go">Begin</button><button type="button" class="btn" data-s="quit">Back to title</button></div>`);
    this.panel.querySelector('[data-s="go"]')!.addEventListener('click', () => this.resume());
    this.panel.querySelector('[data-s="quit"]')!.addEventListener('click', () => this.exit());
  }

  private pause() {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.ptrA = this.ptrB = false;
    this.show(`<h2>Paused</h2><div class="row"><button type="button" class="btn ember" data-s="go">Resume</button><button type="button" class="btn" data-s="forge">Look at my spells</button><button type="button" class="btn" data-s="quit">Quit to title</button></div>`);
    this.panel.querySelector('[data-s="go"]')!.addEventListener('click', () => this.resume());
    this.panel.querySelector('[data-s="forge"]')!.addEventListener('click', () => this.forge(true));
    this.panel.querySelector('[data-s="quit"]')!.addEventListener('click', () => { this.bank(); this.exit(); });
  }
  private resume() {
    this.hide();
    this.mode = 'play';
    this.last = performance.now();
    this.acc = 0;
    this.keys.clear();
    this.ptrA = this.ptrB = false;
  }

  private reward() {
    this.mode = 'reward';
    const choices = rewardChoices(this.w, this.owned, BASES, MODS);
    this.show(`<h2>Glade ${this.w.room} cleared</h2><p>Choose a card for your grimoire.</p><div class="scards">${choices.map((c) => cardHtml(c, `data-pick="${c}"`)).join('')}</div>`);
    for (const b of this.panel.querySelectorAll<HTMLButtonElement>('[data-pick]')) b.addEventListener('click', () => { this.owned.push(b.dataset.pick!); play('click'); this.forge(); });
  }

  /** The forge: build your two spells from the cards you own. */
  private forge(fromPause = false) {
    if (!fromPause) this.mode = 'forge';
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
      <div class="row"><button type="button" class="btn ember" data-s="next">${fromPause ? 'Back to the fight' : w.room + 1 === w.rooms ? 'Face the Stag' : 'Next glade'}</button></div>`);
    for (const r of this.panel.querySelectorAll<HTMLElement>('[data-row]')) r.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('[data-rm]')) return; this.slot = Number(r.dataset.row) as 0 | 1; this.forge(fromPause); });
    for (const b of this.panel.querySelectorAll<HTMLButtonElement>('[data-rm]')) b.addEventListener('click', () => {
      const [i, j] = b.dataset.rm!.split(':').map(Number);
      w.spells[i as 0 | 1].splice(j, 1);
      play('click');
      this.forge(fromPause);
    });
    for (const b of this.panel.querySelectorAll<HTMLButtonElement>('[data-add]')) b.addEventListener('click', () => {
      const id = spare[Number(b.dataset.add)];
      const sp = w.spells[this.slot];
      const card = STORM_CARDS[id];
      if (card.kind === 'base') {
        const at = sp.findIndex((c) => STORM_CARDS[c].kind === 'base');
        if (at >= 0) sp.splice(at, 1);
        sp.unshift(id);
      } else {
        if (sp.filter((c) => STORM_CARDS[c].kind === 'mod').length >= MAX_MODS) { b.classList.add('no'); setTimeout(() => b.classList.remove('no'), 300); return; }
        sp.push(id);
      }
      play('click');
      this.forge(fromPause);
    });
    this.panel.querySelector('[data-s="next"]')!.addEventListener('click', () => {
      if (fromPause) { this.mode = 'paused'; this.resume(); return; }
      enterRoom(w, w.room + 1);
      this.buildMap();
      music.setRegion(w.kind === 'boss' ? 'stormstag' : 'stormwood');
      this.resume();
    });
  }

  private bank() {
    if (this.banked) return 0;
    this.banked = true;
    const ash = stormAsh(this.w);
    if (ash > 0) { meta.ash += ash; saveMeta(); }
    return ash;
  }

  private results(won: boolean) {
    const ash = this.bank();
    const st = this.w.stats;
    this.show(`<h2>${won ? 'The Old Stag falls' : 'Your light goes out'}</h2>
      <p>${won ? 'The Greenwood quiets. The fire in your grimoire does not.' : `You fell in ${this.w.kind === 'boss' ? 'the Stag’s Ring' : `glade ${this.w.room}`}.`}</p>
      <p class="k">Foes felled: ${st.kills} · Hits taken: ${st.hitsTaken}${ash ? ` · <b>+${ash} Ash</b> carried home` : ''}</p>
      <div class="row"><button type="button" class="btn ember" data-s="again">Run again</button><button type="button" class="btn" data-s="quit">Back to title</button></div>`);
    this.panel.querySelector('[data-s="again"]')!.addEventListener('click', () => { this.newRun(); music.setRegion('stormwood'); this.resume(); });
    this.panel.querySelector('[data-s="quit"]')!.addEventListener('click', () => this.exit());
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

import { Application, Container, Graphics, RenderTexture, Sprite, Text, Texture } from 'pixi.js';
import { drawLava, drawMap } from '../render/mapArt';
import { buildSprites, type SpriteSet } from '../render/sprites';
import { cardIcon, SCHOOL_COLOR } from '../ui/icons';
import { music } from '../ui/music';
import { play, setSfxVolume } from '../ui/sfx';
import { meta, saveMeta } from '../ui/meta';
import { addCodex, buyUpgrade, DEFAULT_KEYS, lvl, MUTATORS, PACTS, pactBonus, progress, recordRun, runPerks, saveProgress, UPGRADES, upgradeCost, weekKey, weeklyMutators, type NpcId } from './progress';
import { BOSS_CODEX, BOSS_LINES, CODEX, ENDINGS, nextLine, NPCS, TALK } from './story';
import { paintSanctuary, SCENE_H, SCENE_W, STATIONS } from './hub';
import type { LevelSnap } from '../sim/types';
import { BASES, CURSE_IDS, EVOLUTIONS, MAX_MODS, MODS, RELICS, spellStats, spellSummary, STORM_CARDS } from './cards';
import {
  ACTS, addRelic, AFFIXES, AH, AW, bossOf, CLASSES, coinFlip, curseChoice, DIFFICULTY, doorChoices, enterRoom, MH, MW, newRun, nextAct, NO_INPUT, onBeat, relicChoices, rewardChoices,
  makeRoute, ROOMS_PER_ACT, spawnAt, type Route, spikesUp, spikesWarn, STEP, stormAsh, update, type ClassId, type Difficulty, type Input, type RoomKind, type StormWorld,
  TWISTS, shieldUp, BOONS, boonChoices, takeBoon, xpNeed, comboMul,
} from './sim';
import { T_LAVA } from '../sim/constants';

/** How each act is lit: how dark the unlit ground is, the ambient tint, and its weather. */
const LOOK: { dark: number; tint: number; weather: 'leaves' | 'dust' | 'snow' | 'ash' | 'embers'; back: number }[] = [
  { dark: 0.16, tint: 0x1a2a10, weather: 'leaves', back: 0x0c140a },
  { dark: 0.42, tint: 0x0a0610, weather: 'dust', back: 0x0a070c },
  { dark: 0.36, tint: 0x0a1020, weather: 'snow', back: 0x060a14 },
  { dark: 0.36, tint: 0x140a04, weather: 'embers', back: 0x100804 },
  { dark: 0.45, tint: 0x14040a, weather: 'ash', back: 0x100408 },
  { dark: 0.4, tint: 0x140804, weather: 'embers', back: 0x120604 },
];
/** Sprites for things the main game draws under another name. */
const SPRITE_OF: Partial<Record<string, string>> = { brazier: 'effigy', dummy: 'effigy', f_imp: 'imp', f_owl: 'voidmoth', f_hound: 'hound' };
/** Which family a creature belongs to (for how it sounds when it falls). */
const FAMILY: Record<string, string> = {
  wolf: 'beast', boar: 'beast', stag: 'beast', hound: 'undead', mother: 'beast', thief: 'beast',
  ghoul: 'undead', spitter: 'plant', necro: 'undead', bellringer: 'undead', wight: 'undead', warden: 'undead', lich: 'undead', flagellant: 'undead', cultist: 'undead', bloodarcher: 'undead', choir: 'undead', king: 'undead',
  wisp: 'spirit', shade: 'spirit', imp: 'fire', ashling: 'fire', brazier: 'fire', slag: 'fire', unwritten: 'spirit',
  automaton: 'construct', gearspider: 'construct', anvil: 'construct', orrery: 'construct', gargoyle: 'construct', dummy: 'plant',
  thornling: 'plant', hag: 'plant',
};
/** Names and a line each, for the Bestiary. */
const FOE_INFO: Record<string, [string, string]> = {
  boar: ['Tusked Boar', 'Winds up, then charges in a straight line.'], thornling: ['Thornling', 'Rings of thorns on the beat.'], xbow: ['Poacher', 'Aimed three-bolt fans.'], wolf: ['Grey Wolf', 'Fast, and comes in packs.'], hag: ['Briar Witch', 'A slow two-armed spiral.'],
  ghoul: ['Ghoul', 'Swarms you.'], spitter: ['Acid Spitter', 'Lobs acid that pools on the floor.'], necro: ['Necromancer', 'Raises ghouls from the floor.'], bellringer: ['Bellringer', 'Walls of shot with one gap: find it.'],
  wight: ['Frost Wight', 'Cold aimed volleys.'], wisp: ['Wisp', 'Slow shots that follow you.'], gargoyle: ['Gargoyle', 'Sleeps until you come close.'], shade: ['Shade', 'Vanishes and reappears, firing.'],
  automaton: ['Brass Automaton', 'Turning rings of gear-shot.'], gearspider: ['Gear Spider', 'Scuttles close and drops burning mines.'], slag: ['Slag Golem', 'Lobs molten slag.'], anvil: ['Living Anvil', 'Ringing walls and little orbiting moons.'],
  cultist: ['Cultist', 'Three-armed spirals.'], bloodarcher: ['Blood Archer', 'Warned beams across the room.'], imp: ['Imp', 'Blinks about, bursting into rings.'], flagellant: ['Flagellant', 'Charges, then scatters shot.'],
  brazier: ['Brazier', 'Room furniture that spits fire. Breakable.'], ashling: ['Ashling', 'The King\u2019s little embers.'],
  stag: ['The Old Stag', 'Boss of the Greenwood.'], warden: ['The Bone Warden', 'Boss of the Bone Cellars.'], lich: ['The Frost Lich', 'Boss of the Frost Ossuary.'], orrery: ['The Brass Orrery', 'Boss of the Clockwork Forges: its shots orbit it like planets.'],
  thief: ['Cinder Thief', 'Runs with a sack of cinders. Catch it before it escapes.'],
  choir: ['The Red Choir', 'Boss of the Bloodmoon Cathedral.'], king: ['The Hollow King', 'At the bottom of the Reach.'], unwritten: ['The Unwritten Page', 'At the bottom of the Abyss.'],
};
interface Shard { x: number; y: number; vx: number; vy: number; c: number; life: number; age: number; s: number }

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
  { id: 'rescuer', name: 'Gather the Hearth', desc: 'Bring all five captives home.', test: () => progress.rescued.length >= 5 },
  { id: 'trueend', name: 'The Last Line', desc: 'Write the ending.', test: (w) => w.won && w.loop >= 1 && w.bell },
  { id: 'evolved', name: 'Something Greater', desc: 'Fuse a spell evolution.', test: (w) => w.spells.some((c) => !!spellStats(c)?.evo) },
  { id: 'evolved2', name: 'Twin Miracles', desc: 'Carry two evolved spells at once.', test: (w) => w.spells.every((c) => !!spellStats(c)?.evo) },
  { id: 'weekly', name: 'Hesk Approves', desc: 'Win a weekly storm.', test: (w) => w.won && w.mutators.length > 0 },
  { id: 'pacts3', name: 'Bad Bargains', desc: 'Win with three of Rook\u2019s bargains struck.', test: (w) => w.won && w.pacts.length >= 3 },
  { id: 'pacts7', name: 'Every Bargain', desc: 'Win with all seven bargains struck.', test: (w) => w.won && w.pacts.length >= 7 },
  { id: 'level15', name: 'Kindled Bright', desc: 'Reach level 15 in one run.', test: (w) => w.player.level >= 15 },
  { id: 'combo100', name: 'Hundred-Fold', desc: 'Reach a 100 combo.', test: (w) => w.bestCombo >= 100 },
  { id: 'overdrive10', name: 'Redline', desc: 'Go into Overdrive ten times in one run.', test: (w) => w.stats.overdrives >= 10 },
  { id: 'bounty3', name: 'Bounty Hunter', desc: 'Claim three bounties in one run.', test: (w) => w.stats.bounties >= 3 },
  { id: 'thief', name: 'Catch of the Day', desc: 'Catch a cinder thief.', test: (w) => w.stats.thieves >= 1 },
  { id: 'siege', name: 'Unbroken Line', desc: 'Hold the line three times in one run.', test: (w) => w.stats.sieges >= 3 },
  { id: 'duelist', name: 'Duelist', desc: 'Win two duels in one run.', test: (w) => w.stats.duels >= 2 },
  { id: 'gauntlet', name: 'Run the Gauntlet', desc: 'Clear two gauntlets in one run.', test: (w) => w.stats.gauntlets >= 2 },
  { id: 'scholar', name: 'The Whole Book', desc: 'Find every page of the codex.', test: () => progress.codex.length >= Object.keys(CODEX).length },
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
  rescue: { name: 'A Cell', desc: 'Someone is held here, guarded by jailers. Free them, and they will find your Hearth.', glyph: '⛓' },
};

type Bright = 'dim' | 'normal' | 'bright';
/** How much of each act's darkness to keep: Bright nearly removes it. */
const BRIGHT: Record<Bright, { name: string; dark: number }> = { dim: { name: 'Moody', dark: 1.25 }, normal: { name: 'Normal', dark: 1 }, bright: { name: 'Bright', dark: 0.3 } };
interface Best { score: Partial<Record<Difficulty, number>>; abyss: number; daily?: Record<string, number>; cls?: ClassId; bright?: Bright }
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
  private bright: Bright = this.best.bright ?? 'normal';
  private wallG = new Graphics();
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
  private shardG = new Graphics();
  private shards: Shard[] = [];
  private pixCache = new Map<string, { x: number; y: number; c: number }[]>();
  private punch = 0;
  private lightning = 0;
  private nextBolt = 0;
  private muzzle = 0;
  private lastShots = 0;
  private famSprites = new Map<string, Sprite>();
  private twistText = '';
  private lastBeat = 0;
  private route: Route | null = null;
  private anim = new Map<number, { px: number; py: number; lean: number; sq: number }>();
  private recoil = 0;
  private lastShotsSeen = 0;
  private surgeQueued = false;
  private rebind: ((k: string) => void) | null = null;
  /** The Kindling (the prologue): which lesson, and its bookkeeping. */
  private tut: { stage: number; t: number; n: number; marker: { x: number; y: number } | null; blinks: number; prevBlink: number; prevBombs: number } | null = null;
  private evoSeen = new Set<string>();
  private rush = false;
  private weekly = false;
  private bellNext = false;
  private rerolls = 0;
  private hubTimer = 0;
  private bossesFelled: string[] = [];
  private sayEl!: HTMLElement;
  private seen: string[] = (() => { try { return JSON.parse(localStorage.getItem('ashen-storm-seen') || '[]') as string[]; } catch { return []; } })();

  constructor(private onExit: () => void) {}

  async boot() {
    this.root.className = 'storm';
    this.root.innerHTML = `<div class="shud"></div><div class="srelics"></div><div class="sboss"><b></b><i><s></s></i></div><div class="stwist"></div><div class="stut"><small></small><b></b><p></p></div><div class="sbars"><div class="sxp"><i></i><b></b></div><div class="sheat"><i></i><b></b></div></div><div class="spanel"></div><div class="ssay"><canvas></canvas><div><b></b><p></p></div></div>`;
    document.body.appendChild(this.root);
    this.sayEl = this.root.querySelector('.ssay')!;
    this.applySettings();
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
    this.world.addChild(this.mapSprite, this.liqSprite, this.darkSprite, this.wallG, this.hazG, this.shadowG, this.unitLayer, this.glowLayer, this.shardG, this.weatherG, this.fxG, this.bulletLayer, this.hitG, this.textLayer);
    this.vignette = new Sprite(Texture.from(vignetteCanvas()));
    for (let i = 0; i < 5; i++) { const g = new Sprite(this.glow); g.anchor.set(0.5); this.backGlows.push(g); this.backC.addChild(g); }
    // the vignette darkens only the backdrop around the arena, never the fight itself
    this.app.stage.addChild(this.backG, this.backC, this.vignette, this.world, this.flashG);
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
    if (!progress.tutorialDone) this.offerTutorial(); else this.sanctuary();
  }

  private startRun() {
    const seed = this.daily ? dailySeed(today()) : this.seed;
    const wk = weeklyMutators();
    const plain = this.daily || this.weekly;
    this.w = newRun({ seed: this.weekly ? wk.seed : seed, diff: plain ? 'normal' : this.diff, endless: plain || this.rush ? false : this.endless, cls: this.cls, rush: this.rush && !plain,
      perks: runPerks(), pacts: plain ? [] : [...progress.pacts], mutators: this.weekly ? wk.mutators : [], rescued: [...progress.rescued], bell: this.bellNext && !plain && !this.rush });
    this.rerolls = lvl('reroll');
    this.root.classList.remove('hubmode');
    this.bossesFelled = [];
    addCodex('hearth');
    this.shards = [];
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
    this.route = makeRoute(this.w);
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
    // a faint lit edge on every wall face beside the floor, so cover always reads in the dark
    const wg = this.wallG;
    wg.clear();
    const m = this.w.map, isW = (x: number, y: number) => x < 0 || y < 0 || x >= MW || y >= MH || m[y][x] === 1;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (!isW(x, y)) continue;
      const X = x * 32, Y = y * 32;
      if (!isW(x, y + 1)) wg.moveTo(X, Y + 32).lineTo(X + 32, Y + 32);
      if (!isW(x, y - 1)) wg.moveTo(X, Y).lineTo(X + 32, Y);
      if (!isW(x - 1, y)) wg.moveTo(X, Y).lineTo(X, Y + 32);
      if (!isW(x + 1, y)) wg.moveTo(X + 32, Y).lineTo(X + 32, Y + 32);
    }
    wg.stroke({ width: 2, color: 0xe8d8b8, alpha: 0.32 });
  }

  /** Start playing the room the world is in now. */
  private enter() {
    this.buildMap();
    this.wipe();
    const act = ACTS[this.w.act];
    music.setRegion(this.w.kind === 'boss' ? act.bossTune : act.tune);
    this.resume();
    // every fight is introduced: its squad, and its twist
    const w = this.w;
    if (w.kind === 'fight' || w.kind === 'elite') this.banner(w.twist ? TWISTS[w.twist].name : w.encounter || act.name, w.twist ? `${w.twist === 'duel' ? w.encounter : w.encounter ? w.encounter + ' \u2014 ' : ''}${w.twist === 'duel' ? '' : TWISTS[w.twist].desc}` : 'Clear the room');
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
    if (this.rebind) { e.preventDefault(); this.rebind(k); return; }
    const kb = progress.settings.keys;
    if ((k === kb.nova || k === 'e') && !e.repeat) this.bombQueued = true;
    if ((k === kb.surge || k === 'r') && !e.repeat) this.surgeQueued = true;
    if ((k === '1' || k === '2' || k === '3') && this.mode === 'paused') { this.panel.querySelectorAll<HTMLElement>('[data-boon]')[Number(k) - 1]?.click(); return; }
    this.keys.add(k);
  };
  private ku = (e: KeyboardEvent) => { e.stopImmediatePropagation(); this.keys.delete(e.key.toLowerCase()); };
  private aim(e: PointerEvent) {
    const r = (this.app.canvas as HTMLCanvasElement).getBoundingClientRect();
    this.inp.mx = (e.clientX - r.left - this.world.x) / this.scale;
    this.inp.my = (e.clientY - r.top - this.world.y) / this.scale;
  }
  private readKeys() {
    const k = this.keys, b = progress.settings.keys;
    this.inp.up = k.has(b.up) || k.has('arrowup');
    this.inp.down = k.has(b.down) || k.has('arrowdown');
    this.inp.left = k.has(b.left) || k.has('arrowleft');
    this.inp.right = k.has(b.right) || k.has('arrowright');
    this.inp.blink = k.has(b.blink);
    this.inp.focus = k.has(b.focus);
    this.inp.fireA = this.ptrA || k.has(b.fireA) || (progress.settings.autofire && this.w?.foes.some((f) => f.state !== 'spawn'));
    this.inp.fireB = this.ptrB || k.has(b.fireB);
    this.readPad();
  }

  /**
   * A controller, if one is plugged in: left stick moves, right stick aims, right trigger and
   * left trigger fire your spells, A blinks, B (or a bumper) throws an Ash Nova, X focuses, Start pauses.
   */
  private padPrev: boolean[] = [];
  private readPad() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((x) => x && x.connected);
    if (!gp) return;
    const dz = (v: number) => (Math.abs(v) < 0.22 ? 0 : v);
    const lx = dz(gp.axes[0] ?? 0), ly = dz(gp.axes[1] ?? 0), rx = dz(gp.axes[2] ?? 0), ry = dz(gp.axes[3] ?? 0);
    const btn = (i: number) => !!gp.buttons[i]?.pressed || (gp.buttons[i]?.value ?? 0) > 0.4;
    if (lx || ly) { this.inp.left ||= lx < -0.3; this.inp.right ||= lx > 0.3; this.inp.up ||= ly < -0.3; this.inp.down ||= ly > 0.3; }
    const p = this.w.player;
    if (rx || ry) { const a = Math.atan2(ry, rx); this.inp.mx = p.x + Math.cos(a) * 200; this.inp.my = p.y + Math.sin(a) * 200; this.padAim = true; }
    else if (this.padAim) {
      // no right stick: aim at the nearest foe
      let best = null as null | { x: number; y: number }, bd = Infinity;
      for (const f of this.w.foes) { const d = Math.hypot(f.x - p.x, f.y - p.y); if (f.state !== 'spawn' && d < bd) { bd = d; best = f; } }
      if (best) { this.inp.mx = best.x; this.inp.my = best.y; }
    }
    this.inp.fireA ||= btn(7);
    this.inp.fireB ||= btn(6);
    this.inp.blink ||= btn(0);
    this.inp.focus ||= btn(2);
    const pressed = (i: number) => btn(i) && !this.padPrev[i];
    if (pressed(1) || pressed(4) || pressed(5)) this.bombQueued = true;
    if (pressed(3)) this.surgeQueued = true;
    if (pressed(9)) this.pause();
    this.padPrev = gp.buttons.map((b) => b.pressed);
  }
  private padAim = false;

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
        this.inp.surge = this.surgeQueued;
        this.surgeQueued = false;
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
    queueMicrotask(() => { this.lastFxT = this.w.time; });
    for (const f of this.w.fx) {
      if (this.seenFx.has(f)) continue;
      this.seenFx.add(f);
      if (f.kind === 'hurt') { this.flash = { a: 0.35, color: 0xff1a2a }; this.hitStop = Math.max(this.hitStop, 0.07); this.shake = Math.max(this.shake, 9); }
      if (f.kind === 'nova') { this.flash = { a: 0.45, color: f.color }; this.shake = Math.max(this.shake, 12); }
      if (f.kind === 'phase') {
        this.flash = { a: 0.5, color: f.text === 'OVERDRIVE' ? 0xffc070 : 0xffffff }; this.hitStop = 0.3; this.shake = 16;
        play(f.text === 'OVERDRIVE' ? 'overdrive' : f.text === 'Held!' ? 'rescue' : 'phase');
        if (f.text === 'OVERDRIVE') this.banner('Overdrive!', `Faster, stronger, free spells: ${Math.round(this.w.overdrive)} seconds`);
        else if (f.text === 'Held!') this.banner('Held!', 'The rifts are closed');
        else this.banner(`Phase ${f.text ?? ''}`, bossOf(this.w).name);
      }
      if (f.kind === 'die' && (f.r ?? 0) > 18) { this.flash = { a: 0.6, color: 0xffe8b0 }; this.hitStop = 0.45; this.shake = 20; this.punch = 0.08; }
      if (f.kind === 'phase' || f.kind === 'nova') this.punch = Math.max(this.punch, 0.05);
      // the fallen shatter into the pixels they were drawn with
      if (f.kind === 'die' && f.src) play(`die_${FAMILY[f.src] ?? 'beast'}`);
      if (f.kind === 'text' && f.text?.includes('combo')) play('combo');
      if (f.kind === 'die') this.shatter(f.src ?? 'wizard', f.x, f.y, f.src ? ((f.r ?? 10) > 18 ? 3.8 : (f.r ?? 10) > 13 ? 3.2 : 2.6) : 2);
    }
    for (const f of this.w.foes) if (!this.seen.includes(f.type)) { this.seen.push(f.type); try { localStorage.setItem('ashen-storm-seen', JSON.stringify(this.seen)); } catch { /* storage unavailable */ } }
    // a boss arriving gets a title card
    const boss = this.w.foes.find((f) => f.boss);
    if (boss && this.announced !== boss.id) {
      this.announced = boss.id; this.punch = 0.06;
      play('bossintro'); this.hitStop = Math.max(this.hitStop, 0.5);
      this.root.classList.add('cine'); setTimeout(() => this.root.classList.remove('cine'), 2600);
      this.banner(bossOf(this.w).name, boss.type === 'unwritten' ? 'The book that was never written' : ACTS[this.w.act].epithet);
      const L = BOSS_LINES[boss.type], met = progress.bossMet[boss.type] ?? 0;
      if (L) this.say(bossOf(this.w).name, this.w.bell && L.truePath ? L.truePath : met ? L.again[met % L.again.length] : L.first, boss.type, 6);
      progress.bossMet[boss.type] = met + 1; saveProgress();
    }
    for (const f of this.w.fx) if (f.kind === 'die' && f.t > this.lastFxT - 0.001 && f.src && BOSS_LINES[f.src] && !this.bossesFelled.includes(f.src) && (f.r ?? 0) > 18) {
      this.bossesFelled.push(f.src);
      this.say(FOE_INFO[f.src]?.[0] ?? f.src, BOSS_LINES[f.src].fall, f.src, 5);
      const page = BOSS_CODEX[f.src]; if (page && addCodex(page).length) this.toast(`Codex: ${CODEX[page].title}`);
    }
  }

  /** Break a sprite into its pixels and fling them outward. */
  private shatter(key: string, x: number, y: number, scale: number) {
    let px = this.pixCache.get(key);
    if (!px) {
      px = [];
      const c = (this.sprites[SPRITE_OF[key] ?? key] ?? this.sprites.ghoul).canvas;
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      // painted sprites are 2-3x finer: shatter them in chunks the size of one classic pixel
      const st = Math.max(1, Math.round(c.width / 16));
      for (let yy = 0; yy < c.height; yy += st) for (let xx = 0; xx < c.width; xx += st) { const i = ((yy + (st >> 1)) * c.width + xx + (st >> 1)) * 4; if (d[i + 3] > 100) px.push({ x: (xx - c.width / 2) / st, y: (yy - c.height * 0.75) / st, c: (d[i] << 16) | (d[i + 1] << 8) | d[i + 2] }); }
      this.pixCache.set(key, px);
    }
    for (const q of px) {
      const ox = q.x * scale, oy = q.y * scale, a = Math.atan2(oy, ox) + (Math.random() - 0.5) * 0.6, sp = 40 + Math.random() * 120 + Math.hypot(ox, oy) * 2;
      this.shards.push({ x: x + ox, y: y + oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, c: q.c, life: 0.6 + Math.random() * 0.6, age: 0, s: scale });
    }
    if (this.shards.length > 3000) this.shards.splice(0, this.shards.length - 3000);
  }
  /** Someone speaks: a portrait and a line at the bottom of the screen, without stopping play. */
  private say(name: string, text: string, sprite: string, secs = 5) {
    const el = this.sayEl, cv = el.querySelector('canvas')!;
    const src = (this.sprites[SPRITE_OF[sprite] ?? sprite] ?? this.sprites.ghoul).canvas;
    cv.width = cv.height = 48; const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false; g.clearRect(0, 0, 48, 48); g.drawImage(src, 0, 0, 48, 48);
    el.querySelector('b')!.textContent = name; el.querySelector('p')!.textContent = text;
    el.classList.add('on');
    clearTimeout(this.sayT); this.sayT = window.setTimeout(() => el.classList.remove('on'), secs * 1000);
  }
  private sayT = 0;
  private lastFxT = 0;
  private toast(text: string) {
    const t = document.createElement('div'); t.className = 'stoast'; t.textContent = text; this.root.appendChild(t);
    setTimeout(() => t.remove(), 3200);
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
    const baseOf = (cards: string[]) => cards.find((c) => STORM_CARDS[c]?.kind === 'base') ?? 'ember';
    for (const s of new Set(this.w.sounds)) {
      if (s === 'die') continue;
      if (s === 'shoot') { play(`spell_${baseOf(this.w.spells[0])}`); continue; }
      if (s === 'cast') { play(`spell_${baseOf(this.w.spells[1])}`); continue; }
      if (s === 'hit' || s === 'click') { if (now - this.lastHitSound < 60) continue; this.lastHitSound = now; }
      play(s);
      if (s === 'boom') this.shake = Math.max(this.shake, 6);
    }
  }

  private afterTick(now: number) {
    const w = this.w;
    music.setIntensity(w.foes.length ? (w.kind === 'boss' ? 1 : 0.7) : 0.15);
    if (this.tut && w.player.dead) { const p = w.player; p.dead = false; p.hp = p.maxHp; p.inv = 2; w.fx.push({ kind: 'text', x: p.x, y: p.y - 30, color: 0xffb04a, t: w.time, dur: 1.6, text: 'The Hearth catches you' }); }
    if (w.player.dead && this.mode === 'play') { this.mode = 'dead'; setTimeout(() => this.results(), 1200); return; }
    if (this.tut) this.tutTick();
    if (this.mode === 'play' && w.player.hp === 1 && !w.player.dead && now - this.lastBeat > 900) { this.lastBeat = now; play('heartbeat'); }
    if (w.pendingLevels > 0 && this.mode === 'play') { this.levelUp(); return; }
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
    this.vignette.alpha = 0.7;
    this.flash.a *= 0.88;
    this.flashG.clear();
    if (this.flash.a > 0.01) this.flashG.rect(0, 0, sw, sh).fill({ color: this.flash.color, alpha: this.flash.a * (progress.settings.flash ? 1 : 0.2) });
    this.scale = Math.min(sw / AW, (sh - 52) / AH);
    this.shake *= 0.88;
    const sk = this.shake * progress.settings.shake;
    const sx = (Math.random() - 0.5) * sk, sy = (Math.random() - 0.5) * sk;
    // camera punch: a quick zoom toward the centre on big moments
    this.punch *= 0.9;
    const zs = this.scale * (1 + this.punch);
    this.world.scale.set(zs);
    this.world.position.set(Math.round((sw - AW * zs) / 2 + sx), Math.round((sh - 46 - AH * zs) / 2 + sy));
    // the cathedral has a storm overhead
    if (look.weather === 'ash' && this.mode === 'play') {
      if (now > this.nextBolt) { this.nextBolt = now + 5000 + Math.random() * 7000; this.lightning = 1; play('boom'); }
      this.lightning *= 0.86;
      if (this.lightning > 0.05 && Math.random() < 0.3) this.flash = { a: Math.max(this.flash.a, this.lightning * 0.25), color: 0xdde8ff };
    }
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
      if (h.kind === 'pool' && h.t < h.warn) {
        // a mark where something is about to land
        const k = h.t / h.warn;
        hz.circle(h.x, h.y, h.r).stroke({ width: 2, color: h.color, alpha: 0.5 + 0.4 * (Math.floor(now / 90) % 2) });
        hz.circle(h.x, h.y, h.r * k).fill({ color: h.color, alpha: 0.18 });
        hz.moveTo(h.x - 8, h.y).lineTo(h.x + 8, h.y).moveTo(h.x, h.y - 8).lineTo(h.x, h.y + 8).stroke({ width: 2, color: h.color, alpha: 0.7 });
        continue;
      }
      if (h.kind === 'pool') {
        const a = Math.min(1, (h.warn + h.life - h.t) * 2);
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
    if (w.stats.shots !== this.lastShotsSeen) { this.lastShotsSeen = w.stats.shots; this.recoil = 1; }
    this.recoil *= 0.7;
    const pl = p.moving ? Math.max(-0.14, Math.min(0.14, p.vx * 0.0009)) : 0;
    this.playerSprite.rotation += (pl - this.playerSprite.rotation) * 0.25;
    this.playerSprite.position.set(p.x - Math.cos(p.face) * this.recoil * 2.5, p.y - Math.sin(p.face) * this.recoil * 2.5 + (p.moving ? -Math.abs(Math.sin(now / 80)) * 2 : Math.sin(now / 500) * 0.6));
    this.playerSprite.scale.set((Math.cos(p.face) < 0 ? -2 : 2) * (1 + this.recoil * 0.06), 2 * (1 - this.recoil * 0.05));
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
      const fset = this.sprites[SPRITE_OF[f.type] ?? f.type] ?? this.sprites.ghoul;
      const big = (f.boss ? 3.8 : f.elite ? 3.2 : 2.6) * (16 / fset.res);
      const an = this.anim.get(f.id) ?? { px: f.x, py: f.y, lean: 0, sq: 0 };
      const vx = f.x - an.px, vy = f.y - an.py; an.px = f.x; an.py = f.y;
      an.lean += (Math.max(-0.2, Math.min(0.2, vx * 0.06)) - an.lean) * 0.2;
      if (f.flash > 0.85) an.sq = 0.2;
      an.sq *= 0.85;
      this.anim.set(f.id, an);
      const moving = Math.hypot(vx, vy) > 0.25;
      const bob = moving ? Math.abs(Math.sin(now / 110 + f.id)) * 2.2 : Math.sin(now / 420 + f.id) * 0.7;
      const wind = f.state === 'wind' ? 1 : 0;
      const grow = f.state === 'spawn' ? Math.max(0.15, 1 - f.st / 0.9) : 1;
      const sxv = big * (1 + an.sq + wind * 0.1) * grow, syv = big * (1 - an.sq * 0.8 + wind * 0.1) * grow;
      s.scale.set(p.x < f.x ? -sxv : sxv, syv);
      s.rotation = f.boss ? an.lean * 0.4 : an.lean;
      if (f.state !== 'spawn') s.texture = fset.frames[Math.floor(now / (f.state === 'wind' ? 120 : 320) + f.id * 0.37) % fset.frames.length];
      s.position.set(f.x + (wind ? (Math.random() - 0.5) * 2.4 : 0), f.y - bob);
      s.alpha = f.state === 'spawn' ? 0.3 + 0.7 * grow : f.state === 'sleep' ? 0.85 : 1;
      s.tint = f.flash > 0.5 ? 0xff9a9a : f.state === 'wind' ? 0xff8a8a : f.slow > 0 ? 0xa8d8ff : f.burnT > 0 ? 0xffc890 : f.elite ? 0xffd890 : f.state === 'sleep' ? 0x8a8a9a : 0xffffff;
    }
    for (const [id, s] of this.foeSprites) if (!seen.has(id)) { s.destroy(); this.foeSprites.delete(id); this.anim.delete(id); }
    this.unitLayer.children.sort((a, b) => a.y - b.y);
    // shadows under everyone, auras for champions, stars over the stunned
    const sg = this.shadowG;
    sg.clear();
    // rune circles: a slow ritual ring under every boss, a small one under you while you cast
    for (const f of w.foes) if (f.boss && f.state !== 'spawn') runeCircle(sg, f.x, f.y, f.r * 2.6, now / 2400, [0x8cff9a, 0xe8e0c8, 0x9fe0ff, 0xffd06a, 0xff3a5a, 0xff8a3a][w.act] ?? 0xffd06a, 0.45);
    const aura = p.boons.aura ?? 0;
    if (aura && !p.dead) { const r = 62 + 6 * aura; sg.circle(p.x, p.y, r).fill({ color: 0xff7a2a, alpha: 0.06 }).stroke({ width: 1.5, color: 0xff9a3a, alpha: 0.3 + 0.1 * Math.sin(now / 200) }); }
    if (w.overdrive > 0 && !p.dead) { runeCircle(sg, p.x, p.y + 2, 28, now / 260, 0xffb04a, 0.85); runeCircle(sg, p.x, p.y + 2, 40, -now / 400, 0xffd06a, 0.4 * Math.min(1, w.overdrive)); }
    const casting = this.inp.fireA || this.inp.fireB;
    if (!p.dead && casting) runeCircle(sg, p.x, p.y + 2, 18, -now / 700, CLASSES[w.player.cls].tint === 0xffffff ? 0xb48cff : CLASSES[w.player.cls].tint, 0.5);
    if (!p.dead) sg.ellipse(p.x, p.y + 4, 9, 4).fill({ color: 0x000000, alpha: 0.4 });
    for (const f of w.foes) {
      if (f.state === 'spawn') continue;
      const big = f.boss ? 1.6 : f.elite ? 1.3 : 1;
      sg.ellipse(f.x, f.y + 3, f.r * 1.1 * big, f.r * 0.45 * big).fill({ color: 0x000000, alpha: 0.4 });
      if (f.elite) sg.circle(f.x, f.y, f.r * 1.6 + Math.sin(now / 150) * 2).stroke({ width: 2, color: 0xffb020, alpha: 0.55 });
      if (shieldUp(w, f)) sg.circle(f.x, f.y - f.r * 0.6, f.r * 1.9).fill({ color: 0x8fd0ff, alpha: 0.18 }).stroke({ width: 2, color: 0xbfe8ff, alpha: 0.8 });
      if (f.id === w.bountyId) { const r2 = f.r * 2.2 + Math.sin(now / 120) * 2; sg.circle(f.x, f.y - f.r * 0.5, r2).stroke({ width: 2, color: 0xffd06a, alpha: 0.9 }); for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2 + now / 600; sg.moveTo(f.x + Math.cos(a) * r2 * 0.7, f.y - f.r * 0.5 + Math.sin(a) * r2 * 0.7).lineTo(f.x + Math.cos(a) * r2 * 1.25, f.y - f.r * 0.5 + Math.sin(a) * r2 * 1.25).stroke({ width: 2, color: 0xffd06a, alpha: 0.9 }); } }
      if (f.boss && f.phase > 0) {
        const col = [0xffd06a, 0xff8a3a, 0xff3a5a, 0xc060ff][Math.min(3, f.phase)];
        for (let k = 0; k < f.phase; k++) sg.circle(f.x, f.y - f.r, f.r * (1.9 + k * 0.45) + Math.sin(now / 130 + k) * 3).stroke({ width: 2, color: col, alpha: 0.35 - k * 0.08 });
        for (let k = 0; k < 4 + f.phase * 4; k++) { const a = now / (500 - f.phase * 80) + (k / (4 + f.phase * 4)) * Math.PI * 2, rr = f.r * (2.2 + Math.sin(now / 300 + k) * 0.3); sg.circle(f.x + Math.cos(a) * rr, f.y - f.r + Math.sin(a) * rr * 0.6, 1.6 + f.phase * 0.4).fill({ color: col, alpha: 0.85 }); }
      }
      if (f.stun > 0) for (let i = 0; i < 3; i++) { const a = now / 200 + (i * Math.PI * 2) / 3; sg.star(f.x + Math.cos(a) * 10, f.y - f.r * 2 + Math.sin(a) * 3, 5, 3, 1.4).fill({ color: 0xffe880 }); }
    }

    // the prologue's waypoints
    if (this.tut?.marker) { const m = this.tut.marker, pulse = 0.5 + 0.5 * Math.sin(now / 150); hz.circle(m.x, m.y, 18 + pulse * 4).fill({ color: 0xffb04a, alpha: 0.18 }).stroke({ width: 2, color: 0xffd06a, alpha: 0.6 + 0.4 * pulse }); }
    // loose sawblades: teeth that spin
    for (const b of w.bullets) if (!b.friendly && b.bounce > 1e6) {
      const rot = now / 60, pts: number[] = [];
      for (let i = 0; i < 16; i++) { const a = rot + (i / 16) * Math.PI * 2, r = i % 2 ? b.r * 1.15 : b.r * 1.65; pts.push(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r); }
      hz.poly(pts).fill({ color: 0xb8b8c8 }).stroke({ width: 2, color: 0x2a2a30 });
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
      if (progress.settings.contrast && !b.friendly) { h.tint = 0xff00aa; o.tint = 0xff2a8a; h.alpha = 0.8; }
      o.scale.set((b.r * 2.3 * wake) / 32);
      o.alpha = b.friendly ? 0.75 : 1;
      c.scale.set((b.r * (b.friendly ? 1.3 : 1.5) * wake) / 32);
    }

    // effects and pickups
    const g = this.fxG;
    g.clear();
    // your shots leave short trails
    for (const b of bs) {
      if (b.orbit || b.target || b.orbitFoe) continue;
      if (b.friendly) g.moveTo(b.x - b.vx * 0.035, b.y - b.vy * 0.035).lineTo(b.x, b.y).stroke({ width: b.r * 1.1, color: b.color, alpha: 0.3 });
      else if (b.bounce < 1e6) g.moveTo(b.x - b.vx * 0.06, b.y - b.vy * 0.06).lineTo(b.x, b.y).stroke({ width: b.r * 0.9, color: progress.settings.contrast ? 0xff2a8a : b.color, alpha: 0.22 });
    }
    this.drawLight(now, look);
    this.drawWeather(dt, look.weather);
    // shards from the fallen
    const shg = this.shardG;
    shg.clear();
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const q = this.shards[i];
      q.age += dt;
      if (q.age > q.life) { this.shards.splice(i, 1); continue; }
      q.vx *= 0.94; q.vy = q.vy * 0.94 + 260 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      shg.rect(q.x, q.y, q.s, q.s).fill({ color: q.c, alpha: 1 - q.age / q.life });
    }
    // familiars
    const seenF = new Set<string>();
    for (const fam of w.familiars) {
      seenF.add(fam.kind);
      let sp = this.famSprites.get(fam.kind);
      if (!sp) { sp = new Sprite(Texture.from((this.sprites[SPRITE_OF[fam.kind] ?? 'imp'] ?? this.sprites.imp).canvas)); sp.anchor.set(0.5, 0.75); this.famSprites.set(fam.kind, sp); this.unitLayer.addChild(sp); }
      sp.position.set(fam.x, fam.y + Math.sin(now / 200 + fam.ang) * 2);
      const fs = 1.4 * 16 / (this.sprites[SPRITE_OF[fam.kind] ?? 'imp'] ?? this.sprites.imp).res;
      sp.scale.set(fam.x < p.x ? fs : -fs, fs);
      sp.visible = !p.dead;
    }
    for (const [k, sp] of this.famSprites) if (!seenF.has(k)) { sp.destroy(); this.famSprites.delete(k); }
    for (const k of w.pickups) {
      if (k.kind === 'cinder') g.poly([k.x, k.y - 4, k.x + 3, k.y, k.x, k.y + 4, k.x - 3, k.y]).fill({ color: 0xffb04a }).stroke({ width: 1, color: 0x5a2a0a });
      else if (k.kind === 'xp') { const z = 3 + Math.min(3, k.n); g.poly([k.x, k.y - z, k.x + z * 0.7, k.y, k.x, k.y + z, k.x - z * 0.7, k.y]).fill({ color: 0x7affc8 }).stroke({ width: 1, color: 0x0a3a2a }); g.rect(k.x - 1, k.y - z * 0.5, 1.5, 1.5).fill({ color: 0xffffff }); }
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
      const showHit = this.inp.focus || progress.settings.hitbox;
      h.circle(p.x, p.y, p.r + 1).fill({ color: 0xffffff, alpha: showHit ? 1 : 0.55 }).stroke({ width: 1.5, color: 0xff4a8a, alpha: showHit ? 1 : 0.5 });
      if (this.inp.focus) h.circle(p.x, p.y, p.r + 16).stroke({ width: 1, color: 0xffffff, alpha: 0.22 });
      h.moveTo(p.x + Math.cos(p.face) * 14, p.y + Math.sin(p.face) * 14).lineTo(p.x + Math.cos(p.face) * 30, p.y + Math.sin(p.face) * 30).stroke({ width: 2, color: 0xe9dcc0, alpha: 0.45 });
    }
  }

  /** Light: cut holes in the darkness where things glow, then add their colour on top. */
  private drawLight(now: number, look: (typeof LOOK)[number]) {
    const w = this.w, p = w.player;
    const lights: { x: number; y: number; r: number; a: number; color: number; glow: number }[] = [];
    if (!p.dead) lights.push({ x: p.x, y: p.y, r: 250 + Math.sin(now / 160) * 6, a: 1, color: 0xffd8a0, glow: 0.14 });
    if (!p.dead && w.overdrive > 0) lights.push({ x: p.x, y: p.y, r: 140, a: 1, color: 0xffa040, glow: 0.3 });
    if (w.stats.shots !== this.lastShots) { this.lastShots = w.stats.shots; this.muzzle = 1; }
    this.muzzle *= 0.75;
    if (!p.dead && this.muzzle > 0.05) lights.push({ x: p.x + Math.cos(p.face) * 16, y: p.y + Math.sin(p.face) * 16, r: 60, a: this.muzzle, color: spellStats(w.spells[0])?.color ?? 0xffffff, glow: 0.35 * this.muzzle });
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
    this.darkG.clear().rect(0, 0, AW / 2, AH / 2).fill({ color: look.tint, alpha: Math.min(0.6, look.dark * BRIGHT[this.bright].dark) });
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
    for (const cards of w.spells) { const ev = spellStats(cards)?.evo; if (ev && !this.evoSeen.has(ev)) { this.evoSeen.add(ev); const e = EVOLUTIONS.find((x) => x.id === ev)!; this.banner(`Evolution: ${e.name}`, e.desc); play('evolve'); if (!progress.evolutions.includes(ev)) { progress.evolutions.push(ev); saveProgress(); } } }
    const spell = (cards: string[], label: string, cd: number) => {
      const s = spellStats(cards);
      const ready = s ? Math.max(0, 1 - cd * s.rate) : 0;
      const short = s && p.mana < s.mana;
      const evo = s?.evo ? EVOLUTIONS.find((x) => x.id === s.evo) : null;
      return `<div class="sslot ${short ? 'short' : ''} ${evo ? 'evo' : ''}" ${evo ? `title="${esc(evo.name)}"` : ''}><em>${evo ? '✶' : label}</em>${cards.map((c) => `<img alt="${esc(STORM_CARDS[c].name)}" title="${esc(STORM_CARDS[c].name)}" src="${cardIcon(STORM_CARDS[c].icon, STORM_CARDS[c].school)}">`).join('')}<u style="width:${Math.round(ready * 100)}%"></u></div>`;
    };
    const act = ACTS[w.act];
    const where = w.kind === 'boss' ? bossOf(w).name : `${act.name} · ${Math.min(w.room, ROOMS_PER_ACT)}/${ROOMS_PER_ACT}`;
    // experience and heat bars (updated every frame, cheaply)
    const xpB = this.root.querySelector<HTMLElement>('.sxp'), hB = this.root.querySelector<HTMLElement>('.sheat');
    if (xpB && hB) {
      const show = this.mode === 'play' || this.mode === 'paused';
      xpB.style.display = hB.style.display = show ? '' : 'none';
      (xpB.firstElementChild as HTMLElement).style.width = `${Math.min(100, (p.xp / xpNeed(p.level)) * 100)}%`;
      const lv = `Lv ${p.level}`;
      if (xpB.lastElementChild!.textContent !== lv) xpB.lastElementChild!.textContent = lv;
      const full = w.heat >= 100, od = w.overdrive > 0;
      (hB.firstElementChild as HTMLElement).style.width = `${od ? (w.overdrive / (6 + (p.boons.frenzy ?? 0))) * 100 : w.heat}%`;
      hB.classList.toggle('full', full && !od); hB.classList.toggle('od', od);
      const ht = od ? 'OVERDRIVE' : full ? 'Q: OVERDRIVE!' : w.combo >= 2 ? `${w.combo} combo · +${Math.round((comboMul(w) - 1) * 100)}% dmg` : 'Heat';
      if (hB.lastElementChild!.textContent !== ht) hB.lastElementChild!.textContent = ht;
    }
    // a running twist shows its clock
    const tw = w.twist && !w.cleared ? (w.twist === 'siege' && w.twistT > 0 ? `Hold the line: ${Math.ceil(w.twistT)}s` : w.twist === 'thief' && w.foes.some((f) => f.type === 'thief' && f.state !== 'spawn') ? `Catch the thief: ${Math.max(0, Math.ceil(w.twistT))}s` : w.twist === 'bounty' && w.bountyId ? `Bounty: ${Math.max(0, Math.ceil(w.bountyT))}s` : w.twist === 'gauntlet' && w.waves.length ? `Gauntlet: next wave in ${Math.max(0, Math.ceil(w.twistT))}s` : TWISTS[w.twist].name) : '';
    if (tw !== this.twistText) { this.twistText = tw; const el = this.root.querySelector<HTMLElement>('.stwist'); if (el) { el.textContent = tw; el.style.display = tw && this.mode === 'play' ? '' : 'none'; } }
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
        <li><kbd>Q</kbd> Overdrive, when Heat is full: quick kills and grazes build Heat</li><li>Foes drop green gems: level up and pick a boon</li>
        <li>Only the small dot at your centre can be hit. Near misses (grazes) refill mana.</li><li><kbd>Esc</kbd> pause</li>
        <li>Controller: sticks move and aim, triggers fire, <kbd>A</kbd> blink, <kbd>B</kbd> Nova, <kbd>X</kbd> focus, <kbd>Y</kbd> Overdrive</li>
      </ul>
      <h3>Who descends?</h3>
      <div class="sclasses">${(Object.keys(CLASSES) as ClassId[]).map((c) => { const lock = CLASSES[c].locked && !this.ach.includes(CLASSES[c].locked!); return `<button type="button" class="btn ${this.cls === c ? 'ember' : ''}" data-cls="${c}" ${lock ? 'disabled' : ''}><b>${lock ? '🔒 ' : ''}${CLASSES[c].name}</b><small>${esc(CLASSES[c].desc)}</small></button>`; }).join('')}</div>
      <h3>How fierce?</h3>
      <div class="sdiff">${(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => `<button type="button" class="btn ${this.diff === d ? 'ember' : ''}" data-d="${d}"><b>${DIFFICULTY[d].name}</b><small>${esc(DIFFICULTY[d].desc)}</small>${b[d] ? `<small>Best: ${b[d]!.toLocaleString()}</small>` : ''}</button>`).join('')}</div>
      <div class="row"><span class="k">Brightness:</span>${(Object.keys(BRIGHT) as Bright[]).map((b) => `<button type="button" class="btn small ${this.bright === b ? 'ember' : ''}" data-bright="${b}">${BRIGHT[b].name}</button>`).join('')}</div>
      <label class="sendless"><input type="checkbox" id="sEndless" ${this.endless ? 'checked' : ''}> The Abyss: after the Hollow King, loop back to the start, harder each time, for as long as you last.${this.best.abyss ? ` (Deepest: Abyss ${this.best.abyss})` : ''}</label>
      <div class="row"><button type="button" class="btn ember" data-s="go">Begin</button><button type="button" class="btn" data-s="daily">Daily storm (${today()})${this.best.daily?.[today()] ? ` · best ${this.best.daily[today()].toLocaleString()}` : ''}</button><button type="button" class="btn" data-s="rush">Boss rush</button><button type="button" class="btn" data-s="ach">Achievements ${this.ach.length}/${ACH.length}</button><button type="button" class="btn" data-s="beasts">Bestiary ${this.seen.filter((x) => FOE_INFO[x]).length}/${Object.keys(FOE_INFO).length}</button><button type="button" class="btn" data-s="home">Back to the Hearth</button></div>`);
    this.on('[data-s="home"]', () => this.sanctuary());
    this.on('[data-bright]', (el) => { this.setBright(el.dataset.bright as Bright); this.menu(); });
    this.on('[data-cls]', (el) => { this.cls = el.dataset.cls as ClassId; this.best.cls = this.cls; saveBest(this.best); this.menu(); });
    this.on('[data-s="daily"]', () => { this.daily = true; this.rush = false; this.weekly = false; this.startRun(); });
    this.on('[data-s="rush"]', () => { this.daily = false; this.rush = true; this.weekly = false; this.startRun(); });
    this.on('[data-s="beasts"]', () => this.bestiary());
    this.on('[data-s="ach"]', () => this.achievements());
    this.on('[data-d]', (el) => { this.diff = el.dataset.d as Difficulty; this.menu(); });
    this.panel.querySelector<HTMLInputElement>('#sEndless')!.addEventListener('change', (e) => { this.endless = (e.target as HTMLInputElement).checked; });
    this.on('[data-s="go"]', () => { this.daily = false; this.rush = false; this.weekly = false; this.startRun(); });
  }

  // ================================================================== the Last Hearth
  /** Options and accessibility. */
  private options(back: () => void) {
    const st = progress.settings;
    const names: Record<string, string> = { up: 'Move up', down: 'Move down', left: 'Move left', right: 'Move right', blink: 'Blink', focus: 'Focus', nova: 'Ash Nova', surge: 'Overdrive', fireA: 'First spell (key)', fireB: 'Second spell (key)' };
    const keyName = (k: string) => (k === ' ' ? 'Space' : k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1));
    this.show(`<h2>Options</h2>
      <div class="sopts">
        <label>Sound effects <input type="range" min="0" max="1" step="0.05" data-o="sfx" value="${st.sfx}"></label>
        <label>Music <input type="range" min="0" max="1" step="0.05" data-o="music" value="${st.music}"></label>
        <label>Screen shake <input type="range" min="0" max="1.5" step="0.25" data-o="shake" value="${st.shake}"></label>
        <label>Text size <input type="range" min="0.85" max="1.4" step="0.05" data-o="textScale" value="${st.textScale}"></label>
        <label><input type="checkbox" data-c="flash" ${st.flash ? 'checked' : ''}> Full-strength screen flashes (off: softened, for light sensitivity)</label>
        <label><input type="checkbox" data-c="hitbox" ${st.hitbox ? 'checked' : ''}> Always show my hitbox</label>
        <label><input type="checkbox" data-c="contrast" ${st.contrast ? 'checked' : ''}> High-contrast foe shots (all bright magenta)</label>
        <label><input type="checkbox" data-c="autofire" ${st.autofire ? 'checked' : ''}> Auto-fire my first spell when foes are near</label>
      </div>
      <h3>Keys</h3><div class="skeysmap">${Object.keys(DEFAULT_KEYS).map((a) => `<button type="button" class="btn small" data-key="${a}"><b>${names[a]}</b> ${esc(keyName(st.keys[a]))}</button>`).join('')}</div>
      <p class="k">Click an action, then press its new key. Arrow keys always move.</p>
      <div class="row"><button type="button" class="btn small" data-s="reset">Reset keys</button><button type="button" class="btn ember" data-s="back">Done</button></div>`);
    for (const r of this.panel.querySelectorAll<HTMLInputElement>('[data-o]')) r.addEventListener('input', () => { (st as unknown as Record<string, number>)[r.dataset.o!] = Number(r.value); this.applySettings(); saveProgress(); if (r.dataset.o === 'sfx') play('click'); });
    for (const c of this.panel.querySelectorAll<HTMLInputElement>('[data-c]')) c.addEventListener('change', () => { (st as unknown as Record<string, boolean>)[c.dataset.c!] = c.checked; saveProgress(); });
    this.on('[data-key]', (el) => { el.textContent = 'Press a key…'; this.rebind = (k) => { if (k !== 'escape') st.keys[el.dataset.key!] = k; this.rebind = null; saveProgress(); this.options(back); }; });
    this.on('[data-s="reset"]', () => { st.keys = { ...DEFAULT_KEYS }; saveProgress(); this.options(back); });
    this.on('[data-s="back"]', back);
  }
  private applySettings() {
    const st = progress.settings;
    setSfxVolume(st.sfx);
    music.setVolume(0.5 * st.music);
    this.root.style.setProperty('--storm-text', String(st.textScale));
  }
  private evolutionsPage(back: () => void) {
    const known = progress.evolutions, wise = progress.rescued.includes('ysolde');
    this.show(`<h2>Spell evolutions</h2><p>Put these cards together in one spell and they fuse into something greater. ${wise ? 'Ysolde has noted a card from each one you have not found yet.' : ''}</p>
      <div class="sevos">${EVOLUTIONS.map((e) => known.includes(e.id) ? `<div class="got"><b>✶ ${esc(e.name)}</b><span>${e.needs.map((c) => esc(STORM_CARDS[c]?.name ?? c)).join(' + ')}</span><small>${esc(e.desc)}</small></div>` : `<div><b>? ? ?</b><span>${wise ? `${esc(STORM_CARDS[e.needs[0]]?.name ?? '')} + ${e.needs.slice(1).map(() => '?').join(' + ')}` : 'Undiscovered'}</span></div>`).join('')}</div>
      <div class="row"><button type="button" class="btn" data-s="back">Back</button></div>`);
    this.on('[data-s="back"]', back);
  }

  /** The act's route: see the way ahead, and choose. */
  private routeMap() {
    const w = this.w, r = this.route!;
    const row = w.room; // rooms done in this act; row index of where you stand is row-1
    if (row >= ROOMS_PER_ACT) {
      this.show(`<h2>The lair</h2><p>Something waits beyond. Make ready.</p><div class="sroute">${this.routeHtml(r, row, [])}</div><div class="row"><button type="button" class="btn ember" data-boss>Face ${esc(bossOf(w).name)}</button><button type="button" class="btn small" data-s="forge">Open the forge</button></div>`);
      this.on('[data-boss]', () => this.go('boss'));
      this.on('[data-s="forge"]', () => this.forge(() => this.routeMap(), 'Back to the route'));
      return;
    }
    const next = row === 1 ? [0, 1, 2] : r.edges[r.at];
    this.show(`<h2>The way ahead</h2><p>Room ${row + 1} of ${ROOMS_PER_ACT}, then ${esc(bossOf(w).name)}. Lines show where each room leads.</p><div class="sroute">${this.routeHtml(r, row, next)}</div><div class="row"><button type="button" class="btn small" data-s="forge">Open the forge</button></div>`);
    this.on('[data-node]', (el) => { const i = Number(el.dataset.node); r.at = i; this.go(r.rows[row][i]); });
    this.on('[data-s="forge"]', () => this.forge(() => this.routeMap(), 'Back to the route'));
  }
  private routeHtml(r: Route, row: number, next: number[]) {
    const W = 640, H = 220, colX = (c: number) => 60 + c * 170, rowY = (n: number, i: number) => (n === 1 ? H / 2 : 40 + i * ((H - 80) / (n - 1)));
    const lines: string[] = [];
    for (let i = 0; i < r.rows[1].length; i++) lines.push(`<line x1="${colX(0)}" y1="${H / 2}" x2="${colX(1)}" y2="${rowY(3, i)}" class="${row === 1 && next.includes(i) ? 'hot' : ''}"/>`);
    r.edges.forEach((e, i) => e.forEach((j) => lines.push(`<line x1="${colX(1)}" y1="${rowY(3, i)}" x2="${colX(2)}" y2="${rowY(3, j)}" class="${row === 2 && r.at === i ? 'hot' : ''}"/>`)));
    for (let j = 0; j < 3; j++) lines.push(`<line x1="${colX(2)}" y1="${rowY(3, j)}" x2="${colX(3)}" y2="${H / 2}" class="${row === 3 && r.at === j ? 'hot' : ''}"/>`);
    const node = (k: RoomKind, c: number, i: number, n: number) => {
      const here = c === row - 1 && (c === 0 || r.at === i), past = c < row - 1, can = c === row && next.includes(i);
      return `<button type="button" class="snode ${k} ${here ? 'here' : ''} ${past ? 'past' : ''} ${can ? 'can' : ''}" style="left:${(colX(c) / W) * 100}%;top:${(rowY(n, i) / H) * 100}%" ${can ? `data-node="${i}"` : 'disabled'} title="${esc(DOORS[k].desc)}"><i>${DOORS[k].glyph}</i><span>${esc(k === 'boss' ? bossOf(this.w).name : DOORS[k].name)}</span></button>`;
    };
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${lines.join('')}</svg>${r.rows.map((rw, c) => rw.map((k, i) => node(k, c, i, rw.length)).join('')).join('')}${node('boss', 3, 0, 1)}`;
  }

  /** An iris that opens on the new room. */
  private wipe() {
    const d = document.createElement('div'); d.className = 'swipe'; this.root.appendChild(d);
    play('wipe');
    setTimeout(() => d.remove(), 900);
  }

  private offerTutorial() {
    this.mode = 'menu';
    this.root.classList.add('hubmode');
    this.show(`<div class="sending"><small>Before the storm</small><h2>The Kindling</h2><p>A short, playable prologue: the Hearth teaches you to move, cast, dodge, and burn, one thing at a time. About five minutes.</p><div class="row"><button type="button" class="btn ember" data-s="tut">Begin the Kindling</button><button type="button" class="btn" data-s="skip">I know the storm: skip it</button></div></div>`);
    this.on('[data-s="tut"]', () => this.startTutorial());
    this.on('[data-s="skip"]', () => { progress.tutorialDone = true; saveProgress(); this.sanctuary(); });
  }

  private startTutorial() {
    this.daily = this.weekly = this.rush = false;
    this.cls = 'spellwright';
    this.startRun();
    const w = this.w;
    this.hide();
    w.waves = []; w.foes = []; w.hazards = []; w.bullets = []; w.twist = null; w.encounter = ''; w.cleared = false; w.scripted = true;
    w.spells = [['ember', 'split'], ['thorn']];
    this.tut = { stage: -1, t: 0, n: 0, marker: null, blinks: 0, prevBlink: 0, prevBombs: w.player.bombs };
    this.buildMap();
    this.resume();
    this.tutNext();
  }

  private tutSay(title: string, text: string) {
    const el = this.root.querySelector<HTMLElement>('.stut')!;
    el.querySelector('small')!.textContent = `The Kindling · ${Math.max(1, (this.tut?.stage ?? 0) + 1)} of 9`;
    el.querySelector('b')!.textContent = title;
    el.querySelector('p')!.textContent = text;
    el.classList.add('on');
  }

  /** Begin the next lesson. */
  private tutNext() {
    const T = this.tut!, w = this.w, p = w.player, kb = progress.settings.keys;
    const key = (k: string) => (k === ' ' ? 'Space' : k.toUpperCase());
    T.stage++; T.t = 0; T.n = 0; T.marker = null;
    const at = (x: number, y: number) => ({ x: AW * x, y: AH * y });
    play('portal');
    switch (T.stage) {
      case 0: T.marker = at(0.3, 0.5); this.tutSay('Move', `Walk with ${key(kb.up)} ${key(kb.left)} ${key(kb.down)} ${key(kb.right)}, the arrow keys, or the left stick. Step into the glowing circle.`); break;
      case 1: for (const [x, y] of [[0.3, 0.3], [0.5, 0.25], [0.7, 0.3]]) spawnAt(w, 'dummy', false, at(x, y)); this.tutSay('Cast', 'Aim with the mouse (or the right stick). Hold the left mouse button to cast your first spell. Burn the three straw effigies.'); break;
      case 2: for (const [x, y] of [[0.25, 0.25], [0.75, 0.25]]) spawnAt(w, 'thornling', false, at(x, y)); this.tutSay('Only the dot', `Thorn-sprites fire slow rings. Only the small white dot at your centre can be hit. Hold ${key(kb.focus)} to focus: you move slowly and the dot is shown. Weave through for a while.`); break;
      case 3: this.tutSay('Graze', 'Brush past shots without touching your dot: each near miss is a graze. Grazes refill mana and build Heat. Collect eight grazes.'); break;
      case 4: this.tutSay('Blink', `Press ${key(kb.blink)} (or A) to blink: a short dash in the direction you move. For that instant nothing can touch you. Blink twice.`); break;
      case 5: for (const f of w.foes) f.hp = 0; for (let i = 0; i < 5; i++) spawnAt(w, 'ghoul', false, at(0.2 + i * 0.15, 0.2)); w.heat = 100; this.tutSay('Overdrive', `Quick kills and grazes build Heat. Your bar is full: press ${key(kb.surge)} (or Y) for Overdrive. Faster, stronger, free spells, and a shockwave that clears shots around you.`); break;
      case 6: p.xp = Math.max(p.xp, xpNeed(p.level) - 1); spawnAt(w, 'dummy', false, at(0.5, 0.3)); this.tutSay('Grow', 'Foes drop green gems. Gather enough and you level up: choose one of three boons. Burn the effigy and take its gem.'); break;
      case 7: spawnAt(w, 'hag', false, at(0.5, 0.25)); T.prevBombs = p.bombs = Math.max(1, p.bombs); this.tutSay('Ash Nova', `When the air is full of fire, press ${key(kb.nova)} (or B) for an Ash Nova: it clears every foe shot. You get two each act. Use one now.`); break;
      case 8: {
        for (const f of w.foes) f.hp = 0;
        const s2 = spawnAt(w, 'stag', false, at(0.5, 0.2));
        s2.hp = s2.maxHp = s2.maxHp * 0.25;
        this.tutSay('A shadow of the Stag', 'A memory of the Old Stag, the first lord of the storm. Watch it lower its antlers before it charges, and step off the line. Burn it down.');
        break;
      }
      default: this.tutDone(); break;
    }
  }
  private tutTick() {
    const T = this.tut!, w = this.w, p = w.player;
    T.t += 1 / 60;
    if (p.blinkCd > T.prevBlink + 0.2) T.blinks++;
    T.prevBlink = p.blinkCd;
    const alive = w.foes.filter((f) => f.type !== 'brazier').length;
    switch (T.stage) {
      case 0: if (T.marker && Math.hypot(p.x - T.marker.x, p.y - T.marker.y) < 24) { T.n++; play('click'); T.marker = T.n >= 3 ? null : [{ x: AW * 0.7, y: AH * 0.5 }, { x: AW * 0.5, y: AH * 0.3 }][T.n - 1]; if (T.n >= 3) this.tutNext(); } break;
      case 1: if (!alive && T.t > 1) this.tutNext(); break;
      case 2: if (T.t > 14) this.tutNext(); break;
      case 3: if (T.n === 0) T.n = w.stats.grazes; if (w.stats.grazes - T.n >= 8 || T.t > 30) this.tutNext(); break;
      case 4: if (T.blinks >= 2) this.tutNext(); break;
      case 5: if (w.overdrive > 0) T.n = 1; if (T.n && !alive) this.tutNext(); break;
      case 6: if (p.level >= 2 && !w.pendingLevels && T.t > 1) this.tutNext(); break;
      case 7: if (p.bombs < T.prevBombs) { for (const f of w.foes) f.hp = 0; this.tutNext(); } break;
      case 8: if (!w.foes.some((f) => f.boss) && T.t > 2) this.tutNext(); break;
    }
    w.cleared = false;
  }
  private tutDone() {
    this.tut = null;
    this.root.querySelector('.stut')!.classList.remove('on');
    progress.tutorialDone = true; progress.embers += 25; progress.lifetimeEmbers += 25; saveProgress();
    addCodex('hearth', 'kindled');
    this.mode = 'between';
    this.show(`<div class="sending"><small>The Kindling is done</small><h2>Now, the storm</h2><p>Cass rakes the coals. "The Hearth will catch you when you fall," she says. "It always does. Go and find my people." <br><br>She presses 25 Ash into your hand.</p><div class="row"><button type="button" class="btn ember" data-s="home">To the Last Hearth</button></div></div>`);
    this.on('[data-s="home"]', () => this.sanctuary());
  }

  private sanctuary() {
    this.mode = 'menu';
    this.root.classList.add('hubmode');
    music.setRegion('title');
    clearInterval(this.hubTimer);
    const rescued = progress.rescued;
    this.show(`<div class="shub"><div class="shubtop"><h2>The Last Hearth</h2><span class="sembers">◆ ${progress.embers} Ash</span></div>
      <div class="sscene"><canvas></canvas>${STATIONS.map((st) => { const on = !st.npc || st.npc === 'cass' || rescued.includes(st.npc as NpcId); return `<button type="button" class="shot ${on ? '' : 'off'}" data-st="${st.id}" style="left:${(st.x / SCENE_W) * 100}%;top:${(st.y / SCENE_H) * 100}%">${esc(on ? st.label : 'Rubble')}</button>`; }).join('')}</div>
      <p class="k">${rescued.length < 5 ? `${5 - rescued.length} of the Hearth's people are still held somewhere in the storm. Look for a door marked with a chain.` : progress.trueEnding ? 'The storm is quiet. The Hearth burns on, in case.' : 'Everyone is home. Vell has something to tell you.'}</p>
      <div class="row"><button type="button" class="btn ember" data-st="path">Set out</button><button type="button" class="btn" data-s="options">Options</button><button type="button" class="btn" data-s="quit">Back to title</button></div></div>`);
    const cv = this.panel.querySelector<HTMLCanvasElement>('.sscene canvas')!;
    let hover: string | null = null;
    const draw = () => paintSanctuary(cv, (k) => this.sprites[k]?.canvas ?? null, rescued, performance.now() / 1000, hover);
    draw();
    this.hubTimer = window.setInterval(() => { if (!cv.isConnected) { clearInterval(this.hubTimer); return; } draw(); }, 80);
    for (const b of this.panel.querySelectorAll<HTMLElement>('.shot')) { b.addEventListener('mouseenter', () => { hover = b.dataset.st!; }); b.addEventListener('mouseleave', () => { hover = null; }); }
    this.on('[data-st]', (el) => { if (el.classList.contains('off')) { this.toast('Someone should be here. Find them in the storm.'); return; } clearInterval(this.hubTimer); this.station(el.dataset.st!); });
    this.on('[data-s="options"]', () => { clearInterval(this.hubTimer); this.options(() => this.sanctuary()); });
    this.on('[data-s="quit"]', () => { clearInterval(this.hubTimer); this.exit(); });
  }

  private talk(who: NpcId | 'cass') {
    const ctx = { wins: progress.wins, rescued: progress.rescued.length, trueEnding: progress.trueEnding };
    const l = nextLine(who, progress.talked[who] ?? 0, ctx);
    progress.talked[who] = l.index; saveProgress();
    if (who === 'vell' && progress.rescued.length >= 5 && progress.wins >= 1) addCodex('bell');
    return l.text;
  }
  private portraits() {
    for (const c of this.panel.querySelectorAll<HTMLCanvasElement>('canvas.sportrait')) { const src = this.sprites[c.dataset.sprite!]?.canvas; if (!src) continue; c.width = c.height = 64; const g = c.getContext('2d')!; g.imageSmoothingEnabled = false; g.drawImage(src, 0, 0, 64, 64); }
  }

  private station(id: string) {
    const back = () => this.sanctuary();
    const npcOf: Record<string, NpcId | 'cass'> = { hearth: 'cass', rook: 'rook', brannoch: 'brannoch', ysolde: 'ysolde', hesk: 'hesk', vell: 'vell' };
    const who = npcOf[id];
    const head = (title: string, sub: string) => who ? `<div class="sdialog"><canvas class="sportrait" data-sprite="npc_${who}"></canvas><div><h2>${esc(title)}</h2><p class="ssub">${esc(sub)}</p><p class="sline">\u201c${esc(this.talk(who))}\u201d</p></div></div>` : `<h2>${esc(title)}</h2>`;
    const embers = `<p class="sembers">◆ ${progress.embers} Ash</p>`;
    switch (id) {
      case 'path': this.menu(); return;
      case 'hearth':
        this.show(`${head('Cass', 'Keeper of the Last Hearth')}${embers}<div class="row"><button type="button" class="btn ember" data-s="out">Set out</button><button type="button" class="btn" data-s="tut">Replay the Kindling</button><button type="button" class="btn" data-s="back">Back</button></div>`);
        this.portraits(); this.on('[data-s="out"]', () => this.menu()); this.on('[data-s="tut"]', () => this.startTutorial()); this.on('[data-s="back"]', back); return;
      case 'brannoch': {
        const list = UPGRADES.filter((u) => !u.npc || progress.rescued.includes(u.npc));
        const locked = UPGRADES.filter((u) => u.npc && !progress.rescued.includes(u.npc)).length;
        this.show(`${head(NPCS.brannoch.name + ' ' + NPCS.brannoch.title, 'The Tempering: permanent upgrades, for Ash')}${embers}
          <div class="supgrades">${list.map((u) => { const n = lvl(u.id), max = n >= u.costs.length, c = upgradeCost(u); return `<button type="button" class="btn" data-up="${u.id}" ${max || progress.embers < c ? 'disabled' : ''}><i>${u.icon}</i><b>${esc(u.name)}</b><small>${esc(u.desc(Math.max(1, n + (max ? 0 : 1))))}</small><span>${'◆'.repeat(n)}${'◇'.repeat(u.costs.length - n)} ${max ? 'Mastered' : `· ${c} Ash`}</span></button>`; }).join('')}</div>
          ${locked ? `<p class="k">${locked} more upgrades will come when the rest of the Hearth's people are home.</p>` : ''}<div class="row"><button type="button" class="btn" data-s="back">Back</button></div>`);
        this.portraits();
        this.on('[data-up]', (el) => { if (buyUpgrade(el.dataset.up!)) { play('heal'); this.station('brannoch'); } });
        this.on('[data-s="back"]', back); return;
      }
      case 'rook':
        this.show(`${head(NPCS.rook.name + ' ' + NPCS.rook.title, 'Bargains: make the storm crueller, carry more Ash home')}
          <div class="spacts">${Object.entries(PACTS).map(([k, pc]) => `<label class="${progress.pacts.includes(k) ? 'on' : ''}"><input type="checkbox" data-pact="${k}" ${progress.pacts.includes(k) ? 'checked' : ''}><b>${esc(pc.name)}</b><span>${esc(pc.desc)}</span><i>+${Math.round(pc.bonus * 100)}% Ash</i></label>`).join('')}</div>
          <p class="k">Bargains struck: <b>+${Math.round(pactBonus() * 100)}% Ash</b> from every run (not daily or weekly storms).</p><div class="row"><button type="button" class="btn" data-s="back">Back</button></div>`);
        this.portraits();
        for (const c of this.panel.querySelectorAll<HTMLInputElement>('[data-pact]')) c.addEventListener('change', () => { const k = c.dataset.pact!; progress.pacts = c.checked ? [...new Set([...progress.pacts, k])] : progress.pacts.filter((x) => x !== k); saveProgress(); this.station('rook'); });
        this.on('[data-s="back"]', back); return;
      case 'ysolde': {
        const pages = Object.entries(CODEX);
        this.show(`${head(NPCS.ysolde.name + ' ' + NPCS.ysolde.title, `The Codex: ${progress.codex.length} of ${pages.length} pages`)}
          <div class="scodex">${pages.map(([k, c]) => progress.codex.includes(k) ? `<details><summary>${esc(c.title)}</summary><p>${esc(c.text)}</p></details>` : `<div class="lockedp"><b>A missing page</b><span>${esc(c.how)}</span></div>`).join('')}</div>
          <div class="row"><button type="button" class="btn" data-s="beasts">Bestiary</button><button type="button" class="btn" data-s="evo">Spell evolutions</button><button type="button" class="btn" data-s="back">Back</button></div>`);
        this.portraits();
        this.on('[data-s="beasts"]', () => this.bestiary(() => this.station('ysolde')));
        this.on('[data-s="evo"]', () => this.evolutionsPage(() => this.station('ysolde')));
        this.on('[data-s="back"]', back); return;
      }
      case 'hesk': {
        const wk = weeklyMutators(), key = weekKey();
        this.show(`${head(NPCS.hesk.name + ' ' + NPCS.hesk.title, `This week's contraption (${key})`)}
          <div class="smuts">${wk.mutators.map((m) => `<div><b>${esc(MUTATORS[m].name)}</b><span>${esc(MUTATORS[m].desc)}</span></div>`).join('')}</div>
          <p class="k">Everyone plays the same storm this week, on Ashen. ${progress.weeklyBest[key] ? `Your best: <b>${progress.weeklyBest[key].toLocaleString()}</b>` : 'No attempt yet.'}</p>
          <div class="row"><button type="button" class="btn ember" data-s="weekly">Take on the weekly storm</button><button type="button" class="btn" data-s="back">Back</button></div>`);
        this.portraits();
        this.on('[data-s="weekly"]', () => { this.weekly = true; this.daily = false; this.rush = false; this.startRun(); });
        this.on('[data-s="back"]', back); return;
      }
      case 'vell': {
        const ready = progress.rescued.length >= 5 && progress.wins >= 1;
        this.show(`${head(NPCS.vell.name + ' ' + NPCS.vell.title, 'The Silent Bell')}
          ${ready ? `<label class="sbell"><input type="checkbox" id="sBell" ${this.bellNext ? 'checked' : ''}> Carry the Silent Bell on your next run. When the Hollow King falls, ring it.</label>` : `<p class="k">${progress.rescued.length < 5 ? 'Vell will say more when everyone is home.' : 'Defeat the Hollow King once, and come back.'}</p>`}
          <div class="row"><button type="button" class="btn" data-s="back">Back</button></div>`);
        this.portraits();
        this.panel.querySelector<HTMLInputElement>('#sBell')?.addEventListener('change', (e) => { this.bellNext = (e.target as HTMLInputElement).checked; });
        this.on('[data-s="back"]', back); return;
      }
      case 'board': {
        const h = progress.history, wins = h.filter((r) => r.won).length;
        this.show(`<h2>The Notice Board</h2><p class="k">Runs ${h.length} · Wins ${progress.wins} · Ash earned ${progress.lifetimeEmbers} · People home ${progress.rescued.length}/5 · Codex ${progress.codex.length}/${Object.keys(CODEX).length}${progress.trueEnding ? ' · <b>The ending is written</b>' : ''}</p>
          <table class="shist"><tr><th></th><th>Wizard</th><th>Storm</th><th>Reached</th><th>Level</th><th>Score</th><th>Time</th></tr>${h.slice(0, 20).map((r) => `<tr class="${r.won ? 'won' : ''}"><td>${r.true ? '✶' : r.won ? '★' : '✝'}</td><td>${esc(CLASSES[r.cls as ClassId]?.name ?? r.cls)}</td><td>${r.weekly ? 'Weekly' : esc(DIFFICULTY[r.diff as Difficulty]?.name ?? r.diff)}</td><td>${esc(ACTS[r.act]?.name ?? '')}</td><td>${r.level}</td><td>${r.score.toLocaleString()}</td><td>${Math.floor(r.secs / 60)}:${String(r.secs % 60).padStart(2, '0')}</td></tr>`).join('')}</table>
          ${h.length ? '' : '<p>No runs yet. The board waits.</p>'}<p class="k">Win rate ${h.length ? Math.round((wins / h.length) * 100) : 0}%.</p>
          <div class="row"><button type="button" class="btn" data-s="ach">Achievements</button><button type="button" class="btn" data-s="back">Back</button></div>`);
        this.on('[data-s="ach"]', () => this.achievements());
        this.on('[data-s="back"]', back); return;
      }
    }
  }

  /** Freeing a captive: they speak, and go home to the Hearth. */
  private rescueScene(who: NpcId, then: () => void) {
    const n = NPCS[who];
    let i = 0;
    const step = () => {
      if (i >= n.rescue.length) {
        if (!progress.rescued.includes(who)) progress.rescued.push(who);
        saveProgress();
        const pages = addCodex(`n_${who}`, 'grimoire');
        this.show(`<div class="sact"><small>Rescued</small><h2>${esc(n.name)}</h2><p>${esc(n.name)} will be waiting at the Last Hearth. ${esc(n.blurb)}</p>${pages.length ? `<p class="k">New codex pages: ${pages.map((p) => esc(CODEX[p].title)).join(', ')}</p>` : ''}<div class="row"><button type="button" class="btn ember" data-s="on">Onward</button></div></div>`);
        this.on('[data-s="on"]', then);
        play('rescue');
        return;
      }
      this.show(`<div class="sdialog"><canvas class="sportrait" data-sprite="npc_${who}"></canvas><div><h2>${esc(n.name)} <small>${esc(n.title)}</small></h2><p class="sline">\u201c${esc(n.rescue[i])}\u201d</p></div></div><div class="row"><button type="button" class="btn ember" data-s="next">${i < n.rescue.length - 1 ? 'Go on' : 'Free them'}</button></div>`);
      this.portraits();
      this.on('[data-s="next"]', () => { i++; step(); });
    };
    this.mode = 'between';
    step();
  }

  /** The King falls: the first ending, or the true one. */
  private ending(then: () => void) {
    const w = this.w;
    const trueEnd = w.loop >= 1 && w.bell;
    const e = trueEnd ? ENDINGS.true : ENDINGS.king;
    const key = trueEnd ? 'true' : 'king';
    const first = !progress.endingsSeen.includes(key);
    if (first) { progress.endingsSeen.push(key); saveProgress(); }
    this.show(`<div class="sending ${trueEnd ? 'true' : ''}"><small>${trueEnd ? 'The true ending' : 'An ending'}</small><h2>${esc(e.title)}</h2><p>${esc(e.text)}</p>${trueEnd ? '<p class="scredits">Ashen Grimoire · Cinderstorm<br>Made by Dean, with Claude<br>Thank you for playing.</p>' : ''}<div class="row"><button type="button" class="btn ember" data-s="on">${first ? 'Continue' : 'Onward'}</button></div></div>`);
    this.on('[data-s="on"]', then);
  }

  private bestiary(back: () => void = () => this.menu()) {
    const icon = (k: string) => (this.sprites[SPRITE_OF[k] ?? k] ?? this.sprites.ghoul).canvas.toDataURL();
    this.show(`<h2>Bestiary</h2><p>Everything you have faced in the storm.</p>
      <div class="sbeasts">${Object.entries(FOE_INFO).map(([k, [name, desc]]) => this.seen.includes(k) ? `<div><img alt="" src="${icon(k)}"><b>${esc(name)}</b><span>${esc(desc)}</span></div>` : '<div class="unseen"><i>?</i><b>Unknown</b><span>Not yet met.</span></div>').join('')}</div>
      <div class="row"><button type="button" class="btn" data-s="back">Back</button></div>`);
    this.on('[data-s="back"]', back);
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
      ${w.rush ? `<p class="k">Boss rush: straight to <b>${esc(bossOf(w).name)}</b>.</p>` : act.roster.length ? `<p class="k">Three rooms, then <b>${esc(bossOf(w).name)}</b>.</p>` : `<p class="k">Only <b>${esc(bossOf(w).name)}</b> remains.</p>`}
      <div class="row"><button type="button" class="btn ember" data-s="go">Enter</button></div></div>`);
    this.on('[data-s="go"]', () => then());
  }

  private pause() {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.ptrA = this.ptrB = false;
    this.show(`<h2>Paused</h2>
      <p class="k">${this.w.player.relics.length ? `Relics: ${this.w.player.relics.map((id) => esc(RELICS[id].name)).join(', ')}` : 'No relics yet.'}</p>
      <div class="row"><span class="k">Brightness:</span>${(Object.keys(BRIGHT) as Bright[]).map((b) => `<button type="button" class="btn small ${this.bright === b ? 'ember' : ''}" data-bright="${b}">${BRIGHT[b].name}</button>`).join('')}</div>
      <div class="row"><button type="button" class="btn ember" data-s="go">Resume</button><button type="button" class="btn" data-s="forge">Look at my spells</button><button type="button" class="btn" data-s="quit">Abandon the run</button></div>`);
    this.on('[data-bright]', (el) => { this.setBright(el.dataset.bright as Bright); this.mode = 'play'; this.pause(); });
    this.on('[data-s="go"]', () => this.resume());
    this.on('[data-s="forge"]', () => this.forge(() => { this.mode = 'paused'; this.resume(); }, 'Back to the fight'));
    this.on('[data-s="quit"]', () => { if (this.tut) { this.tut = null; this.root.querySelector('.stut')!.classList.remove('on'); this.sanctuary(); return; } this.results(true); });
  }
  /** A level-up: time stops while you choose one of three boons. */
  private levelUp() {
    const w = this.w;
    this.mode = 'paused';
    this.ptrA = this.ptrB = false;
    const picks = boonChoices(w);
    if (!picks.length) { w.pendingLevels = 0; this.resume(); return; }
    play('levelup');
    this.show(`<h2>Level ${w.player.level - w.pendingLevels + 1}</h2><p class="k">Choose a boon (1, 2, 3). Boons stack, and last the whole run.</p>
      <div class="sboons">${picks.map((id) => { const b = BOONS[id], n = w.player.boons[id] ?? 0; return `<button type="button" class="btn" data-boon="${id}"><i>${b.icon}</i><b>${esc(b.name)}</b><small>${esc(b.desc)}</small><span>${'◆'.repeat(n)}${'◇'.repeat(b.max - n)}</span></button>`; }).join('')}</div>`);
    this.on('[data-boon]', (el) => { takeBoon(w, el.dataset.boon!); if (w.pendingLevels > 0) this.levelUp(); else this.resume(); });
  }
  private setBright(b: Bright) { this.bright = b; this.best.bright = b; saveBest(this.best); }
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
    if (w.rescue) { const who = w.rescue as NpcId; w.rescue = null; this.rescueScene(who, () => this.afterRoom()); return; }
    if (w.truePath && w.loop === 0) {
      // the Bell rings without a sound, and the floor beneath the throne gives way
      this.show(`<div class="sact"><small>Beneath the throne</small><h2>The Silent Bell</h2><p>You ring Vell's bell. Nothing is heard. The Choir's last echo forgets its words, and the floor beneath the throne opens onto a page that is burning and never burns away.</p><div class="row"><button type="button" class="btn ember" data-s="go">Descend</button></div></div>`);
      this.on('[data-s="go"]', () => { w.loop = 1; w.truePath = false; w.player.hp = Math.min(w.player.maxHp, w.player.hp + 2); enterRoom(w, ROOMS_PER_ACT + 1, 'boss'); this.enter(); });
      return;
    }
    switch (w.kind) {
      case 'boss':
        this.pickRelic(3, `${bossOf(w).name} falls`, 'Take one gift from its hoard. You also mend two hearts.', () => {
          w.player.hp = Math.min(w.player.maxHp, w.player.hp + 2);
          if (!nextAct(w)) { this.mode = 'won'; this.ending(() => this.results()); return; }
          this.route = makeRoute(w);
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
      <div class="row">${this.rerolls > 0 ? `<button type="button" class="btn small" data-s="reroll">Reroll (${this.rerolls} left)</button>` : ''}<button type="button" class="btn small" data-s="skip">Skip (+15 cinders)</button></div>`);
    this.on('[data-s="reroll"]', () => { this.rerolls--; play('click'); this.reward(then); });
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
    if (this.route && !this.w.rush) { this.routeMap(); return; }
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
    if (kind === 'rescue') { this.enter(); return; }
    if (kind === 'treasure') this.pickRelic(3, 'A hoard', 'Something glints among the bones. Take one.', () => this.doors());
    else if (kind === 'shrine') this.shrine();
    else if (kind === 'shop') this.shop();
    else if (kind === 'event') this.event();
    else this.enter();
  }

  /** Strange Lights: one of six encounters. */
  private event() {
    const w = this.w, p = w.player;
    if ((progress.talked.wanderer ?? 0) < 5 && Math.abs(Math.sin(w.act * 7 + w.room * 3 + progress.history.length)) < 0.45) {
      const ctx = { wins: progress.wins, rescued: progress.rescued.length, trueEnding: progress.trueEnding };
      const l = nextLine('wanderer', progress.talked.wanderer ?? 0, ctx);
      progress.talked.wanderer = l.index; saveProgress();
      addCodex('wanderer');
      p.cinders += 20;
      this.show(`<div class="sdialog"><canvas class="sportrait" data-sprite="npc_wanderer"></canvas><div><h2>The Pale Wanderer</h2><p>${esc(l.text)}</p><p class="k">He leaves twenty cinders on a blank page as he goes.</p></div></div><div class="row"><button type="button" class="btn ember" data-s="on">Onward</button></div>`);
      this.portraits();
      this.on('[data-s="on"]', () => this.doors());
      return;
    }
    const which = Math.floor(Math.abs(Math.sin(w.time * 7.3 + w.room * 13 + w.act * 31 + p.cinders)) * 10);
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
      case 6:
        ask('The gambler\u2019s table', 'A grinning skeleton shuffles a deck of burnt cards. "Double or nothing, Kindled?"', [
          { label: 'Wager 30 cinders', ok: p.cinders >= 30, act: () => { p.cinders -= 30; if (coinFlip(w)) { p.cinders += 60; done('The card turns: a crown. You win sixty cinders.'); } else done('The card turns: a skull. The skeleton laughs, softly.'); } },
          { label: 'Wager 80 cinders', ok: p.cinders >= 80, act: () => { p.cinders -= 80; if (coinFlip(w)) { p.cinders += 160; done('A crown! A hundred and sixty cinders.'); } else done('A skull. It was always going to be a skull.'); } },
          leave,
        ]);
        break;
      case 7: {
        const ch = boonChoices(w);
        ask('A fallen Kindled', 'The ghost of another Kindled sits by a cold fire. "I didn\u2019t make it," she says. "Take what I learned."', [
          ...ch.slice(0, 2).map((id) => ({ label: `Learn ${BOONS[id].name}: ${BOONS[id].desc}`, act: () => { takeBoon(w, id); done(`You learn ${BOONS[id].name}. The ghost smiles, and is gone.`); } })),
          leave,
        ]);
        break;
      }
      case 8: {
        const page = Object.keys(CODEX).find((k) => !progress.codex.includes(k) && !k.startsWith('n_') && !k.startsWith('b_') && k !== 'ending' && k !== 'bell');
        if (page) addCodex(page);
        p.cinders += 15;
        done(page ? `A scorched page, caught on a thorn: \u201c${CODEX[page].title}\u201d. Ysolde will want it. (+15 cinders)` : 'A scorched page, too burnt to read. Fifteen cinders are pressed between its folds.');
        break;
      }
      case 9:
        ask('A forgotten forge', 'An anvil still warm, and a hammer left mid-swing.', [
          { label: 'Temper your grimoire: 35 cinders for 15% more damage this run', ok: p.cinders >= 35, act: () => { p.cinders -= 35; p.dmgBonus += 0.15; done('Sparks fly. Your spells come out sharper.'); } },
          { label: 'Forge a ward: 25 cinders', ok: p.cinders >= 25 && !p.shield, act: () => { p.cinders -= 25; p.shield = true; done('A ward of hammered ash settles over you.'); } },
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
    const ash = Math.round((stormAsh(w) + this.newAch.length * 5) * (1 + pactBonus()));
    if (ash > 0) { progress.embers += ash; progress.lifetimeEmbers += ash; meta.ash += Math.round(ash / 2); saveMeta(); }
    if (w.player.dead) addCodex('kindled');
    if (w.act >= 2) addCodex('storm');
    const trueEnd = w.won && w.loop >= 1 && w.bell;
    if (w.won) progress.wins++;
    if (trueEnd) { progress.trueEnding = true; addCodex('ending'); }
    if (this.weekly) { const k = weekKey(); progress.weeklyBest[k] = Math.max(progress.weeklyBest[k] ?? 0, Math.floor(w.score)); }
    recordRun({ at: Date.now(), cls: w.player.cls, diff: w.diff, won: w.won, act: w.act, score: Math.floor(w.score), level: w.player.level, secs: Math.round(w.time), kills: w.stats.kills, true: trueEnd, weekly: this.weekly });
    this.bellNext = false;
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
      <p class="k">${this.daily ? 'Daily storm · ' : ''}${CLASSES[w.player.cls].name} · ${DIFFICULTY[w.diff].name} · Rooms ${st.rooms} · Bosses ${st.bosses} · Foes felled ${st.kills} · Grazes ${st.grazes} · Level ${w.player.level} · Best combo ${w.bestCombo} · Hits taken ${st.hitsTaken}${ash ? ` · <b>+${ash} Ash</b> carried to the Hearth` : ''}</p>
      <div class="row"><button type="button" class="btn ember" data-s="home">Return to the Hearth</button><button type="button" class="btn" data-s="again">Run again</button><button type="button" class="btn" data-s="quit">Back to title</button></div>`);
    this.on('[data-s="again"]', () => this.startRun());
    this.on('[data-s="home"]', () => this.sanctuary());
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

/** A slowly turning ritual circle: two rings, a star, and rune ticks. */
function runeCircle(g: Graphics, x: number, y: number, r: number, rot: number, color: number, alpha: number) {
  g.circle(x, y, r).stroke({ width: 2, color, alpha });
  g.circle(x, y, r * 0.78).stroke({ width: 1, color, alpha: alpha * 0.7 });
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) { const a = rot + (i * 2 * Math.PI * 2) / 6; pts.push(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78 * 0.55 + 0); }
  for (let k = 0; k < 2; k++) { const a0 = rot + k * Math.PI / 3; const tri: number[] = []; for (let i = 0; i < 3; i++) { const a = a0 + (i * Math.PI * 2) / 3; tri.push(x + Math.cos(a) * r * 0.76, y + Math.sin(a) * r * 0.76); } g.poly(tri).stroke({ width: 1.5, color, alpha: alpha * 0.8 }); }
  for (let i = 0; i < 16; i++) { const a = -rot * 1.5 + (i / 16) * Math.PI * 2; g.moveTo(x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.82).lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95).stroke({ width: i % 4 ? 1 : 2, color, alpha }); }
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

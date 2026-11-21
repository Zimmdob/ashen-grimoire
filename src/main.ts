import './style.css';
import '@fontsource/vt323';
import '@fontsource/pirata-one';
import '@fontsource/im-fell-english';
import { BH, BW, GameRenderer, SC } from './render/renderer';
import { CARDS } from './sim/cards';
import { RULES, UPGRADES } from './sim/constants';
import { biomeOf, fromHand, playerState, playerUnit, previewCast } from './sim/game';
import { predictThreats } from './sim/ai';
import { findPath } from './sim/path';
import { cantAfford, spellCost, type SpellPrice } from './sim/spell';
import { UNITS, unitName } from './sim/units';
import type { Action, PlayerState, Pt, Stat, Unit, World } from './sim/types';
import { AFFIXES, RUNES } from './sim/runes';
import { LocalTransport, NetTransport, type Transport } from './net/transport';
import { dailySeed, DEFAULT_SERVER } from './net/protocol';
import { BIOMES } from './sim/biomes';
import { CLASSES, GEAR, INSCRIBE_COST, LEARN_COST, MAT_IDS, MAT_NAMES, MUTATIONS, ORIGINS, RECIPES, TRAITS } from './sim/character';
import { EVENTS } from './sim/events';
import { ACHIEVEMENTS, bankRun, buyUnlock, checkAchievements, CURSE_ASH, CURSES, meta, observe, runOptions, saveMeta, setupFor, UNLOCKS } from './ui/meta';
import { openCreator, portrait } from './ui/creator';
import { cardIcon, SCHOOL_COLOR, SCHOOL_NAME } from './ui/icons';
import { isMuted, play, setMuted } from './ui/sfx';
import { music } from './ui/music';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const roman = (n: number) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);

const canvas = $<HTMLCanvasElement>('cv');
const R = new GameRenderer();
let T: Transport | null = null;
let W: World | null = null;
let spell: string[] = [];
let mouse: Pt | null = null;
let hoverId: number | null = null;
let hoverCard: string | null = null;
let dirty = true;
let confirmKill = '';
let walking = false;
let walkStall = 0;
let lastWalkSend = 0;
let blockedAt: Pt | null = null;
let lastFrame = performance.now();
let lastPreviewKey = '';
let cachedPv: ReturnType<typeof previewCast> = null;
let lastPathKey = '';
let cachedPath: Pt[] | null = null;
let threatDmg = 0;
let shownPhase = '';
const keys = new Set<string>();
const logLines: string[] = [];

// ---------------------------------------------------------------- helpers
const me = () => (W && T ? playerState(W, T.localPid) : undefined);
const myUnit = (): Unit | undefined => { const ps = me(); return W && ps ? playerUnit(W, ps) : undefined; };
const canAct = () => {
  const ps = me(), u = myUnit();
  return !!W && !!ps && !!u && W.phase === 'planning' && u.alive && !ps.endedTurn && !R.busy;
};
let toastTimer = 0;
function toast(msg: string) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('on'), 1800);
}
function send(a: Action) { if (T) T.send(a); }
let worldId = 0;

/** How a class pays for a spell, as short text. */
function priceText(ps: PlayerState, c: SpellPrice): string {
  const parts: string[] = [];
  if (ps.cls === 'soulbinder') parts.push(`${c.souls} soul${c.souls === 1 ? '' : 's'}`);
  else if (ps.cls === 'hexblade') parts.push(`${c.stam} stamina`);
  else if (ps.cls === 'lanternkeeper') parts.push(`${c.oil} oil`);
  else parts.push(`${c.mana} mana`);
  if (c.hp) parts.push(`${c.hp} health`);
  return parts.join(' and ');
}
function baseCostText(ps: PlayerState, id: string): string {
  const c = CARDS[id];
  if (c.hpCost) return `${c.hpCost} hp`;
  return priceText(ps, spellCost({ ...ps, uses: {} }, [id]));
}
const regionName = (w: World) => biomeOf(w).name;
const floorName = (w: World) => { const b = biomeOf(w); return b.floors[Math.max(0, Math.min(1, w.run.floor - 1))] ?? b.name; };
/** Nearest companion who is down and within reach of a revive. */
function downedNear(): PlayerState | null {
  if (!W) return null;
  const u = myUnit();
  if (!u) return null;
  for (const ps of W.players) {
    if (ps.pid === T?.localPid) continue;
    const t = playerUnit(W, ps);
    if (t && t.alive && t.downed > 0 && Math.hypot(t.x - u.x, t.y - u.y) <= 70) return ps;
  }
  return null;
}

// ---------------------------------------------------------------- transport wiring
function attach(t: Transport) {
  T = t;
  t.onStart = (w) => {
    W = w;
    worldId++;
    R.worldRef = w;
    R.followId = playerState(w, t.localPid)?.unitId ?? null;
    logLines.length = 0;
    R.enqueue(w.events.splice(0));
    spell = [];
    shownPhase = '';
    hideOverlay();
    dirty = true;
  };
  t.onApplied = (a, r) => {
    if (!W) return;
    if (!r.ok && a.pid === t.localPid && a.t !== 'move') toast(r.err ?? 'Cannot do that');
    R.enqueue(W.events.splice(0));
    dirty = true;
  };
  t.onError = (m) => toast(m);
}

R.onLog = (s) => { logLines.unshift(s); if (logLines.length > 40) logLines.pop(); $('log').innerHTML = logLines.map((l) => `<li>${esc(l)}</li>`).join(''); };
R.onSfx = (s) => play(s);
R.onPhase = () => { dirty = true; };
R.onPing = (pid) => { const n = W?.players.find((p) => p.pid === pid)?.name ?? 'Someone'; if (pid !== T?.localPid) toast(`${n} pings the map`); play('click'); };

// ---------------------------------------------------------------- input
function toBuffer(e: PointerEvent): Pt {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * BW, y: ((e.clientY - r.top) / r.height) * BH };
}
function unitAt(p: Pt): Unit | null {
  if (!W) return null;
  let best: Unit | null = null, bd = Infinity;
  for (const u of W.units) {
    if (u.gone) continue;
    const d = Math.hypot(u.x - p.x, u.y - (p.y + 6));
    const lim = (u.alive ? u.r + 12 : 16) * (UNITS[u.type].boss ? 2 : 1);
    if (d < lim && d < bd && (u.alive || !best)) { best = u; bd = d; }
  }
  return best;
}
/**
 * Real-time walking: while the right button is held, the wizard keeps walking toward the cursor,
 * re-aiming every step, spending stamina as it goes. Each step is a small lockstep 'move' action,
 * sent just ahead of the animation so the walk looks continuous.
 */
function walkTick(dt: number) {
  if (!walking || !W || !T || !mouse) return;
  const ps = me(), u = myUnit();
  if (!ps || !u || !u.alive || W.phase !== 'planning' || ps.endedTurn) return;
  if (!R.freeToWalk(u.id)) return;
  if (u.stam < 1) { if (walkStall++ === 0) toast('Out of stamina. Cast, or end your turn.'); return; }
  if (Math.hypot(mouse.x - u.x, mouse.y - u.y) < 6) return;
  const lead = RULES.MOVE_SPEED * 90; // keep ~90ms of walking queued ahead of the animation
  if (R.pendingWalk(u.id) > lead) return;
  const now = performance.now();
  if (now - lastWalkSend < 45) return;
  if (blockedAt && Math.hypot(mouse.x - blockedAt.x, mouse.y - blockedAt.y) < 12 && now - lastWalkSend < 400) return;
  lastWalkSend = now;
  const step = Math.max(4, RULES.MOVE_SPEED * Math.max(dt, 60));
  const before = W.beat;
  send({ t: 'move', pid: ps.pid, x: mouse.x, y: mouse.y, max: step });
  blockedAt = T instanceof LocalTransport && W.beat === before ? { x: mouse.x, y: mouse.y } : null;
}
// ---------------------------------------------------------------- pointer input (mouse and touch)
// Mouse: hold right-click to walk, left-click to cast, hover to inspect (as before).
// Touch: hold a finger on the map to walk toward it; tap the ground to walk there; tap a body to
// inspect it. With a spell forged, tap to aim (the preview shows exactly what happens), then press
// Cast. Drag with two fingers, or in Look mode with one, to pan the camera.
const coarse = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', coarse);
let touchMode: 'walk' | 'look' = 'walk';
let aimPt: Pt | null = null;
let pinnedId: number | null = null;
const fingers = new Map<number, { x: number; y: number; sx: number; sy: number; t0: number }>();
let holdTimer = 0;
let panning = false;

function castAt(aim: Pt) {
  if (!W || !T) return;
  if (!canAct()) { if (!R.busy && me()?.endedTurn) toast('Waiting for your companions'); return; }
  const ps = me()!;
  const pv = previewCast(W, ps.pid, spell, aim);
  const k = `${spell.join()}|${Math.round(aim.x)}|${Math.round(aim.y)}`;
  if (pv?.selfDies && confirmKill !== k) { confirmKill = k; toast(coarse ? 'This spell would kill you. Press Cast again to do it anyway.' : 'This spell would kill you. Click again to cast anyway.'); return; }
  confirmKill = '';
  send({ t: 'cast', pid: ps.pid, cards: [...spell], x: aim.x, y: aim.y });
  navigator.vibrate?.(15);
  spell = [];
  aimPt = null;
  R.camOff = { x: 0, y: 0 };
  dirty = true;
}
const aimOf = (p: Pt): Pt => { const t = unitAt(p); return t ? { x: t.x, y: t.y } : p; };

canvas.addEventListener('pointermove', (e) => {
  const b = toBuffer(e);
  const wp = R.screenToWorld(b.x, b.y);
  if (e.pointerType === 'touch') {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    const r = canvas.getBoundingClientRect();
    const dx = ((e.clientX - f.x) / r.width) * BW / SC, dy = ((e.clientY - f.y) / r.height) * BH / SC;
    f.x = e.clientX; f.y = e.clientY;
    if (panning || touchMode === 'look' || fingers.size > 1) {
      // dragging the map: move the camera the opposite way (two fingers move it half as fast each)
      const k = fingers.size > 1 ? 0.5 : 1;
      R.camOff = { x: R.camOff.x - dx * k, y: R.camOff.y - dy * k };
      if (Math.hypot(e.clientX - f.sx, e.clientY - f.sy) > 12) { panning = true; clearTimeout(holdTimer); }
      return;
    }
    if (spell.length) { mouse = wp; aimPt = aimOf(wp); dirty = true; return; }
    if (walking) mouse = wp;
    else if (Math.hypot(e.clientX - f.sx, e.clientY - f.sy) > 14) { clearTimeout(holdTimer); startWalk(e, wp); }
    return;
  }
  mouse = wp;
  const u = unitAt(mouse);
  hoverId = u ? u.id : null;
});
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && !walking) { mouse = null; hoverId = null; } });
const stopWalking = () => { walking = false; };
window.addEventListener('blur', stopWalking);

function startWalk(e: PointerEvent, wp: Pt) {
  mouse = wp;
  walking = true;
  walkStall = 0;
  canvas.setPointerCapture?.(e.pointerId);
  R.camOff = { x: 0, y: 0 };
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  const b = toBuffer(e);
  const wp = R.screenToWorld(b.x, b.y);
  if (e.pointerType === 'touch') {
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now() });
    canvas.setPointerCapture?.(e.pointerId);
    if (fingers.size > 1) { clearTimeout(holdTimer); walking = false; panning = true; return; }
    panning = false;
    if (touchMode === 'look') return;
    if (spell.length) { mouse = wp; aimPt = aimOf(wp); dirty = true; return; }
    // hold to walk continuously; a quick tap is handled on release
    holdTimer = window.setTimeout(() => { if (!panning) startWalk(e, mouse ?? wp); }, 170);
    mouse = wp;
    return;
  }
  mouse = wp;
  if (e.button === 2) { startWalk(e, wp); return; }
  if (!W || !T) return;
  if (e.button === 1 || (e.button === 0 && e.altKey)) {
    e.preventDefault();
    const ps0 = me();
    if (ps0) send({ t: 'ping', pid: ps0.pid, x: wp.x, y: wp.y });
    return;
  }
  if (e.button !== 0) return;
  if (spell.length) castAt(aimOf(wp));
  else if (canAct()) toast('Hold right-click to walk. Click cards to forge a spell.');
  else if (!R.busy && me()?.endedTurn) toast('Waiting for your companions');
});

function endPointer(e: PointerEvent) {
  if (e.pointerType !== 'touch') { stopWalking(); return; }
  const f = fingers.get(e.pointerId);
  fingers.delete(e.pointerId);
  clearTimeout(holdTimer);
  if (walking) { walking = false; return; }
  if (!f || panning || touchMode === 'look' || spell.length || e.type === 'pointercancel') { if (!fingers.size) panning = false; return; }
  const quick = performance.now() - f.t0 < 300 && Math.hypot(e.clientX - f.sx, e.clientY - f.sy) < 14;
  if (!quick || !W) return;
  const b = toBuffer(e);
  const wp = R.screenToWorld(b.x, b.y);
  const u = unitAt(wp);
  if (u) { pinnedId = pinnedId === u.id ? null : u.id; hoverId = pinnedId; dirty = true; return; }
  pinnedId = null; hoverId = null;
  // tap the ground: walk there (as far as stamina allows)
  const ps = me();
  if (ps && canAct()) { send({ t: 'move', pid: ps.pid, x: wp.x, y: wp.y }); R.camOff = { x: 0, y: 0 }; }
  dirty = true;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// on-stage touch controls
$('castBtn').addEventListener('click', () => { if (aimPt && spell.length) castAt(aimPt); else toast('Tap the map to aim first'); });
$('cancelBtn').addEventListener('click', () => { spell = []; aimPt = null; dirty = true; });
$('modeBtn').addEventListener('click', () => { touchMode = touchMode === 'walk' ? 'look' : 'walk'; $('modeBtn').textContent = touchMode === 'walk' ? 'Walk' : 'Look'; $('modeBtn').classList.toggle('on', touchMode === 'look'); toast(touchMode === 'look' ? 'Look: drag to pan the map' : 'Walk: hold to walk, tap to move or inspect'); });
$('centerBtn').addEventListener('click', () => { R.camOff = { x: 0, y: 0 }; });
$('infoBtn').addEventListener('click', () => $('codex').classList.toggle('open'));
$('codexClose').addEventListener('click', () => $('codex').classList.remove('open'));
$('tip').addEventListener('click', () => { pinnedId = null; hoverId = null; hoverCard = null; dirty = true; });
new ResizeObserver(() => { R.resize(canvas.clientWidth, canvas.clientHeight); dirty = true; }).observe(canvas);
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if ($('overlay').classList.contains('on')) return;
  const ps = me();
  if (!ps) return;
  if (k === ' ' || k === 'enter') { e.preventDefault(); endTurn(); }
  else if (k === 'escape') { spell = []; dirty = true; }
  else if (k === 'backspace') { spell.pop(); dirty = true; }
  else if (k === 'c') R.camOff = { x: 0, y: 0 };
  else if (k === 'r') { const t = downedNear(); if (t) send({ t: 'revive', pid: ps.pid, target: t.pid }); else toast('Nobody down beside you'); }
  else if (/^f[1-4]$/.test(k)) { e.preventDefault(); loadMark(Number(k[1]) - 1); }
  else if (/^[0-9]$/.test(k)) { const i = k === '0' ? 9 : Number(k) - 1; const id = ps.cards[i]; if (id) addCard(id); }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

function addCard(id: string) {
  if (!W || W.phase !== 'planning') return;
  if (spell.length >= 12) { toast('A spell may hold twelve cards'); return; }
  spell.push(id);
  play('click');
  dirty = true;
}
function endTurn() {
  const ps = me();
  if (!ps || !W || R.busy) return;
  if (W.phase !== 'planning') return;
  spell = [];
  send({ t: 'endTurn', pid: ps.pid });
}
$('endBtn').addEventListener('click', endTurn);
$('clearBtn').addEventListener('click', () => { spell = []; aimPt = null; dirty = true; });
$('muteBtn').addEventListener('click', () => { setMuted(!isMuted()); $('muteBtn').textContent = isMuted() ? 'Sound off' : 'Sound on'; });
// Music: browsers only allow audio after a gesture, so the score begins on the first click or key.
const musicBtn = $('musicBtn'), musicVol = $<HTMLInputElement>('musicVol');
const syncMusicUi = () => { musicBtn.textContent = music.isEnabled() ? 'Music on' : 'Music off'; musicVol.value = String(Math.round(music.getVolume() * 100)); };
syncMusicUi();
musicBtn.addEventListener('click', () => { music.setEnabled(!music.isEnabled()); syncMusicUi(); });
musicVol.addEventListener('input', () => music.setVolume(Number(musicVol.value) / 100));
const firstGesture = () => { music.start(); for (const ev of ['pointerdown', 'keydown', 'touchend', 'click']) window.removeEventListener(ev, firstGesture); };
for (const ev of ['pointerdown', 'keydown', 'touchend', 'click']) window.addEventListener(ev, firstGesture);

// ---------------------------------------------------------------- spell bookmarks
// Four saved spells (Spellmasons has bookmarks too). Click an empty slot to save the forged spell,
// click a saved one (or press F1–F4) to load it, right-click to forget it.
let marks: string[][] = (() => { try { return JSON.parse(localStorage.getItem('ashen-marks') ?? '[]'); } catch { return []; } })();
while (marks.length < 4) marks.push([]);
const saveMarks = () => { try { localStorage.setItem('ashen-marks', JSON.stringify(marks)); } catch { /* storage unavailable */ } };
function loadMark(i: number) {
  const ps = me();
  if (!ps || !marks[i].length) return;
  const known = marks[i].filter((c) => ps.cards.includes(c));
  if (known.length < marks[i].length) toast('Some of those cards are not in this grimoire.');
  spell = known;
  play('click');
  dirty = true;
}
function renderMarks() {
  const el = $('marks');
  const html = marks.map((m, i) => `<button type="button" class="mark ${m.length ? 'full' : ''}" data-m="${i}" title="${m.length ? `F${i + 1}: ${m.map((c) => CARDS[c]?.name ?? c).join(' › ')}` : 'Save the forged spell here'}">${m.length ? `F${i + 1} ${esc(m.map((c) => CARDS[c]?.name ?? c).join(' › '))}` : `F${i + 1} empty`}</button>`).join('');
  if (el.dataset.html === html) return;
  el.dataset.html = html;
  el.innerHTML = html;
  for (const b of el.querySelectorAll<HTMLButtonElement>('.mark')) {
    const i = Number(b.dataset.m);
    b.addEventListener('click', () => {
      if (!marks[i].length) { if (!spell.length) { toast('Forge a spell first, then click a slot to save it.'); return; } marks[i] = [...spell]; saveMarks(); toast('Spell bookmarked.'); }
      else loadMark(i);
      dirty = true;
    });
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); marks[i] = []; saveMarks(); dirty = true; });
  }
}

// ---------------------------------------------------------------- per-frame controller
let cardsKey = '';
function buildRack() {
  const ps = me();
  if (!ps) return;
  const key = ps.cards.join(',');
  if (key === cardsKey) return;
  cardsKey = key;
  $('cards').innerHTML = ps.cards.map((id, i) => {
    const c = CARDS[id];
    return `<button type="button" class="card" data-id="${id}" style="--c:${SCHOOL_COLOR[c.school]}">
      <span class="key">${i < 10 ? (i + 1) % 10 : ''}</span><img alt="" src="${cardIcon(id, c.school)}"><span class="nm">${esc(c.name)}</span><span class="cost" data-cost></span></button>`;
  }).join('');
  for (const b of $('cards').querySelectorAll<HTMLButtonElement>('.card')) {
    let press = 0, long = false;
    b.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; long = false; press = window.setTimeout(() => { long = true; hoverCard = b.dataset.id!; pinnedId = null; dirty = true; navigator.vibrate?.(10); }, 420); });
    const cancel = () => clearTimeout(press);
    b.addEventListener('pointerup', cancel);
    b.addEventListener('pointerleave', cancel);
    b.addEventListener('pointercancel', cancel);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    b.addEventListener('click', () => { if (long) { long = false; return; } if (coarse) hoverCard = null; addCard(b.dataset.id!); });
    b.addEventListener('mouseenter', () => { if (!coarse) { hoverCard = b.dataset.id!; dirty = true; } });
    b.addEventListener('mouseleave', () => { if (!coarse) { hoverCard = null; dirty = true; } });
  }
}

function refreshHud() {
  if (!W || !T) return;
  const ps = me(), u = myUnit();
  if (!ps || !u) return;
  buildRack();
  const cost = spellCost(ps, spell);
  // card costs reflect what adding them now would cost
  for (const b of $('cards').querySelectorAll<HTMLButtonElement>('.card')) {
    const id = b.dataset.id!;
    const next = spellCost(ps, [...spell, id]);
    const d: SpellPrice = { mana: next.mana - cost.mana, hp: next.hp - cost.hp, souls: next.souls - cost.souls, stam: next.stam - cost.stam, oil: next.oil - cost.oil };
    const el = b.querySelector('[data-cost]')!;
    const lvl = ps.cardLevels[id] ?? 0;
    el.textContent = (d.hp > 0 ? `${d.hp} hp` : priceText(ps, d)) + (lvl ? ` ${'+'.repeat(lvl)}` : '');
    el.className = d.hp > 0 ? 'cost hp' : `cost ${ps.cls}`;
    const outOfHand = ps.cls === 'tarot' && !fromHand(ps.hand, [...spell, id]);
    if (outOfHand) el.textContent = ps.hand.includes(id) ? 'spent' : 'not drawn';
    b.classList.toggle('poor', !!cantAfford(ps, u, next) || outOfHand);
    b.classList.toggle('drawn', ps.cls === 'tarot' && ps.hand.includes(id));
  }
  const hp = u.alive ? u.hp : 0;
  $('hpFill').style.width = `${(100 * hp) / u.maxHp}%`;
  const loss = Math.min(hp, Math.max(0, threatDmg - u.shield));
  $('hpPred').style.left = `${(100 * (hp - loss)) / u.maxHp}%`;
  $('hpPred').style.width = `${(100 * loss) / u.maxHp}%`;
  $('hpTxt').textContent = `Health ${hp}/${u.maxHp}${u.shield ? `  +${u.shield} ward` : ''}${loss ? `  (−${loss} next turn)` : ''}`;
  const cls = ps.cls;
  const inf = u.stam >= RULES.CLEARED_STAMINA;
  // The second bar is whatever this calling pays with.
  let cur = u.mana, max = u.maxMana, spendRaw = cost.mana, label = `Mana ${u.mana}/${u.maxMana}  +${u.regen} a turn`;
  if (cls === 'soulbinder') { cur = u.souls; max = u.maxSouls; spendRaw = cost.souls; label = `Souls ${u.souls}/${u.maxSouls}`; }
  if (cls === 'hexblade') { cur = inf ? u.maxStam : u.stam; max = u.maxStam; spendRaw = cost.stam; label = inf ? 'Stamina: free to roam' : `Stamina ${Math.floor(u.stam)}/${u.maxStam} (pays for spells)`; }
  if (cls === 'lanternkeeper') { cur = ps.oil; max = ps.maxOil; spendRaw = cost.oil; label = `Oil ${Math.round(ps.oil)}/${ps.maxOil} · spell fuel`; }
  $('manaFill').style.width = `${Math.min(100, (100 * cur) / Math.max(1, max))}%`;
  const bar = $('manaFill').parentElement!;
  bar.classList.toggle('soul', cls === 'soulbinder');
  bar.classList.toggle('oil', cls === 'lanternkeeper');
  bar.classList.toggle('stamina', cls === 'hexblade');
  const spend = Math.min(cur, spendRaw);
  $('manaPred').style.left = `${(100 * (cur - spend)) / Math.max(1, max)}%`;
  $('manaPred').style.width = `${Math.min(100, (100 * spend) / Math.max(1, max))}%`;
  $('manaTxt').textContent = label;
  $('stamFill').style.width = inf ? '100%' : `${Math.min(100, (100 * u.stam) / u.maxStam)}%`;
  $('stamTxt').textContent = inf ? 'Stamina: free to roam' : `Stamina ${Math.floor(u.stam)}/${u.maxStam}`;
  // survival strip: lantern, hunger, cold, corruption, satchel
  const oilPct = Math.round((100 * ps.oil) / Math.max(1, ps.maxOil));
  const hunger = ps.satiety <= 0 ? '<b class="bad">Starving</b>' : ps.satiety <= 1 ? `<b class="warn">Hungry ${ps.satiety}</b>` : `Fed ${ps.satiety}`;
  const chill = ps.chill >= 3 ? '<b class="bad">Frozen through</b>' : ps.chill > 0 ? `<b class="warn">Chilled ${ps.chill}</b>` : '';
  const mats = MAT_IDS.filter((m) => ps.mats[m] > 0).map((m) => `${MAT_NAMES[m]} ${ps.mats[m]}`).join(' · ');
  const downed = downedNear();
  $('surv').innerHTML = `<span title="Lantern oil: your light. When it runs out, Shades come.">Lantern <b class="${oilPct < 25 ? 'bad' : oilPct < 50 ? 'warn' : ''}">${oilPct}%</b></span>
    <span title="Each floor uses one. Eat rations, or starve and lose health.">${hunger}</span>${chill ? `<span title="Stand near fire, burn, or wear an Ember Cloak.">${chill}</span>` : ''}
    <span title="Every ${RULES.CORRUPTION_STEP} corruption brings a mutation.">Corruption <b class="${ps.corruption >= 75 ? 'bad' : ''}">${ps.corruption}</b></span>
    ${ps.cls === 'cagebearer' ? `<span title="Foes dying within 160 of you are caged. Unleash frees the first.">Cage <b>${ps.cage.length}/${ps.maxCage}</b>${ps.cage.length ? `: ${ps.cage.map((t) => esc(UNITS[t].name)).join(', ')}` : ''}</span>` : ''}
    ${W.players.filter((p) => !p.left).length > 1 ? `<span title="Bond fills as you fight side by side, revive and strike together. At 100, call a Duet: one turn of free spells, half again as strong.">Bond <b class="${W.bond >= 100 ? 'warn' : ''}">${W.bond}</b></span>${W.bond >= 100 && W.phase === 'planning' ? '<button type="button" class="btn small ember" id="duetBtn">Duet!</button>' : ''}` : ''}
    ${W.duet === W.turn ? '<b class="warn">Duet: spells are free</b>' : ''}
    ${W.pickups.some((k) => k.type === 'vault' && !k.used) ? `<span title="Find both keys, then walk into the vault.">Vault keys <b>${W.keys}/2</b></span>` : ''}
    ${ps.cls === 'tarot' ? `<span title="Each drawn card can be cast once this turn.">Hand <b>${ps.hand.length}</b></span>` : ''}
    ${mats ? `<span class="mats" title="Materials for camp">${mats}</span>` : ''}${downed ? `<button type="button" class="btn small ember" id="reviveBtn">Revive ${esc(downed.name)} (R)</button>` : ''}`;
  document.getElementById('duetBtn')?.addEventListener('click', () => send({ t: 'duet', pid: ps.pid }));
  document.getElementById('reviveBtn')?.addEventListener('click', () => send({ t: 'revive', pid: ps.pid, target: downed!.pid }));
  if (u.downed > 0) $('surv').insertAdjacentHTML('afterbegin', `<b class="bad">You are down: ${u.downed} turn${u.downed === 1 ? '' : 's'} for a companion to reach you.</b>`);
  $('queue').innerHTML = spell.length
    ? spell.map((id, i) => `${i ? '<span class="arrow">›</span>' : ''}<button type="button" class="chip" data-i="${i}" style="--c:${SCHOOL_COLOR[CARDS[id].school]}"><img alt="" src="${cardIcon(id, CARDS[id].school)}">${esc(CARDS[id].name)}</button>`).join('')
    : '<span class="empty">Click cards to forge a spell. They resolve left to right.</span>';
  for (const c of $('queue').querySelectorAll<HTMLButtonElement>('.chip')) c.addEventListener('click', () => { spell.splice(Number(c.dataset.i), 1); dirty = true; });
  const bad = !!cantAfford(ps, u, cost);
  const lethal = !!spell.length && !!cachedPv?.selfDies;
  $('qcost').innerHTML = spell.length ? `Costs <span class="${bad ? 'bad' : ''}">${priceText(ps, cost)}</span>. ${lethal ? '<span class="bad">Aimed here, this spell kills you.</span>' : (coarse ? (aimPt ? 'Press Cast, or tap to re-aim.' : 'Tap a target within the violet ring to aim.') : 'Click a target within the violet ring.')}` : coarse ? `Hold the map to walk · tap to move or inspect · long-press a card to read it · Reach ${u.range}` : `Hold right-click to walk · Reach ${u.range} · Esc clears the spell · Space ends the turn`;
  document.body.classList.toggle('forging', spell.length > 0);
  $<HTMLButtonElement>('castBtn').disabled = !aimPt || !spell.length;
  const waiting = ps.endedTurn && W.phase === 'planning';
  $<HTMLButtonElement>('endBtn').disabled = W.phase !== 'planning' || ps.endedTurn || !u.alive;
  $('endBtn').textContent = waiting ? 'Waiting…' : 'End turn';
  const phaseTxt = W.phase === 'enemies' || (R.busy && !R.freeToWalk(u.id)) ? 'The dark stirs…' : waiting ? 'Waiting for companions' : W.portal ? 'The portal is open' : `Turn ${W.turn}`;
  const b = biomeOf(W);
  const moon = W.run.bloodMoon ? ' · <span class="bad">Blood moon</span>' : '';
  $('banner').innerHTML = `${esc(b.name)} · ${esc(floorName(W))}<small>Depth ${roman(W.level)} · ${phaseTxt} · ${W.kills} slain${moon}</small><small class="rule">${esc(b.rule)}</small>`;
  renderMarks();
  refreshInfo();
}

function refreshInfo() {
  refreshInfoInner();
  const tip = $('tip');
  const show = coarse && (pinnedId != null || hoverCard != null);
  tip.classList.toggle('on', show);
  if (show) { const html = $('info').innerHTML + '<div class="k">Tap here to close</div>'; if (tip.dataset.html !== html) { tip.dataset.html = html; tip.innerHTML = html; } }
}

function refreshInfoInner() {
  if (!W) return;
  const info = $('info');
  if (hoverCard) {
    const c = CARDS[hoverCard];
    const ps = me()!;
    const used = ps.uses[hoverCard] ?? 0;
    info.innerHTML = `<div class="t">${esc(c.name)}</div><div class="k">${SCHOOL_NAME[c.school]} · ${c.mode === 'target' ? 'targeting card' : 'effect card'}</div><p>${esc(c.desc)}</p>
      <div class="k">Base cost ${baseCostText(ps, hoverCard)}${used ? ` · cast ${used}× this depth (+${used * 25}%)` : ''}${ps.cardLevels[hoverCard] ? ` · inscribed ${'+'.repeat(ps.cardLevels[hoverCard])} (+${ps.cardLevels[hoverCard] * 50}% power)` : ''}</div>`;
    return;
  }
  if (coarse) hoverId = pinnedId;
  const u = hoverId != null ? W.units.find((x) => x.id === hoverId) : null;
  if (u) {
    const d = UNITS[u.type];
    const st: string[] = [];
    if (u.shield) st.push(`ward ${u.shield}`);
    if (u.poison) st.push(`poison ${u.poison}`);
    if (u.frozen) st.push(`frozen ${u.frozen}`);
    if (u.frail) st.push(`frailty ×${u.frail}`);
    if (u.fetter) st.push('fettered');
    if (u.bloat) st.push('bloated');
    if (u.burn) st.push(`burning ${u.burn}`);
    if (u.weak) st.push(`enfeebled ×${u.weak}`);
    if (u.fortify) st.push('fortified');
    if (u.wet) st.push('soaked (lightning ×2, frost ×2)');
    if (u.downed) st.push(`downed: ${u.downed} turns to revive`);
    if (u.bounty) st.push(`bounty: ${RULES.BOUNTY_POINTS} upgrade points`);
    const aff = u.affixes.map((a) => `<li><b>${esc(AFFIXES[a]?.name ?? a)}</b>: ${esc(AFFIXES[a]?.desc ?? '')}</li>`).join('');
    const name = u.owner ? W.players.find((p) => p.pid === u.owner)?.name ?? 'Spellwright' : unitName(u);
    const side = u.owner ? 'Spellwright' : u.faction === 'player' ? 'Your ally' : d.prop ? 'Hazard' : 'Foe';
    const threat = R.ov.threats.has(u.id);
    info.innerHTML = `<div class="t">${esc(name)}${u.alive ? '' : ' (corpse)'}</div><div class="k">${side} · ${u.alive ? `${u.hp}/${u.maxHp} health` : 'can be raised or shattered'}${u.dmg ? ` · hits for ${u.dmg}` : ''}${u.range ? ` · range ${u.range}` : ''}${u.maxStam ? ` · moves ${u.maxStam}` : ''}${u.maxMana ? ` · mana ${u.mana}/${u.maxMana}` : ''}</div>
      <p>${esc(d.desc)}</p>${aff ? `<ul>${aff}</ul>` : ''}${st.length ? `<div class="k">${st.join(' · ')}</div>` : ''}${threat ? '<p class="warn">Will strike you next turn.</p>' : ''}`;
    return;
  }
  const n = R.ov.threats.size;
  info.innerHTML = `<p>${n ? `<span class="warn">${n} foe${n > 1 ? 's' : ''} outlined in red can strike you next turn${threatDmg ? ` for about ${threatDmg}` : ''}.</span>` : 'No foe can reach you next turn.'}</p>
    <ul><li>Hold right-click to walk toward the cursor. Walking spends stamina.</li><li>Click cards, or press 1–0, to forge a spell; click a target to cast it.</li>
    <li>Target cards widen who is hit; effects strike everything targeted so far.</li><li>Each card costs 25% more every time you use it on a depth.</li>
    <li>Shove foes into lava, traps, walls and each other. Urns burst when broken.</li><li>Gold coin: a bounty worth ${RULES.BOUNTY_POINTS} upgrade points. Diamonds: elite affixes.</li>
    <li>Click a bookmark slot to save a spell; F1–F4 recall it. Alt-click pings.</li><li>Hover a foe to see its reach. WASD pans, C recenters.</li>
    <li>Your lantern burns each turn. Oil flasks and braziers refill it; in the dark, Shades hunt you.</li><li>In co-op a fallen companion is only down: stand beside them and press R.</li></ul>`;
}

function updateOverlays() {
  if (!W) return;
  const ps = me();
  const u = myUnit();
  const o = R.ov;
  o.hoverId = hoverId;
  const idle = (!R.busy || (walking && u != null && R.freeToWalk(u.id))) && W.phase === 'planning';
  o.castRing = null; o.aim = null; o.path = null; o.targets = new Set(); o.after = null;
  if (idle && ps && u && u.alive && !ps.endedTurn && spell.length && coarse && !aimPt) o.castRing = { x: u.x, y: u.y, r: u.range };
  else if (idle && ps && u && u.alive && !ps.endedTurn && mouse) {
    if (spell.length) {
      o.castRing = { x: u.x, y: u.y, r: u.range };
      const tgt = unitAt(mouse);
      const aim = tgt ? { x: tgt.x, y: tgt.y } : mouse;
      const key = `${spell.join()}|${Math.round(aim.x / 4)}|${Math.round(aim.y / 4)}|${W.beat}`;
      if (key !== lastPreviewKey) { cachedPv = previewCast(W, ps.pid, spell, aim); lastPreviewKey = key; }
      const pv = cachedPv;
      if (pv) {
        o.targets = pv.targets;
        o.after = pv.after;
        o.aim = { from: u, to: aim, ok: pv.inRange && pv.affordable && !pv.selfDies };
      }
    } else if (!$('overlay').classList.contains('on') && (!coarse || walking)) {
      const key = `${Math.round(mouse.x / 8)}|${Math.round(mouse.y / 8)}|${W.beat}|${Math.round(u.x)}|${Math.round(u.y)}`;
      if (key !== lastPathKey) { const path = findPath(W, u, mouse, { lavaCost: 30 }); cachedPath = path && path.length ? [{ x: u.x, y: u.y }, ...path] : null; lastPathKey = key; }
      if (cachedPath) o.path = { pts: cachedPath, limit: u.stam };
    }
  }
}

let frame = 0;
let threatKey = '';
function loop() {
  requestAnimationFrame(loop);
  frame++;
  const nowT = performance.now();
  const dt = Math.min(100, nowT - lastFrame);
  lastFrame = nowT;
  walkTick(dt);
  const pan = 9;
  if (keys.has('w') || keys.has('arrowup')) R.camOff.y -= pan;
  if (keys.has('s') || keys.has('arrowdown')) R.camOff.y += pan;
  if (keys.has('a') || keys.has('arrowleft')) R.camOff.x -= pan;
  if (keys.has('d') || keys.has('arrowright')) R.camOff.x += pan;
  if (!W) return;
  const meId = myUnit()?.id ?? null;
  if (!R.busy || (walking && R.freeToWalk(meId))) {
    const k = `${W.beat}|${W.phase}`;
    if (k !== threatKey && W.phase === 'planning') {
      threatKey = k;
      const t = predictThreats(W);
      R.ov.threats = t.threats;
      R.ov.predicted = t.dmgTo;
      const u = myUnit();
      threatDmg = u ? t.dmgTo.get(u.id) ?? 0 : 0;
      dirty = true;
    }
    if (W.phase !== 'planning') { R.ov.threats = new Set(); R.ov.predicted = new Map(); threatDmg = 0; }
  } else if (R.ov.threats.size && !walking) { R.ov.threats = new Set(); R.ov.predicted = new Map(); threatDmg = 0; }
  if (frame % 2 === 0) updateOverlays();
  if (frame % 10 === 0) {
    music.setMood(biomeOf(W).music);
    if (frame % 60 === 0) {
      observe(W, me()?.cards ?? []);
      const ps0 = me();
      if (ps0) for (const n of checkAchievements(W, ps0)) { toast(`Achievement: ${n} (+5 Ash)`); play('portal'); }
    }
    const danger = W.phase === 'enemies' || W.run.region === 'throne' ? 1 : R.ov.threats.size ? Math.min(1, 0.55 + 0.15 * R.ov.threats.size) : 0;
    music.setIntensity(W.phase === 'dead' || W.phase === 'victory' || W.phase === 'levelup' || W.phase === 'camp' ? 0 : danger);
  }
  if (dirty || frame % 15 === 0) { refreshHud(); dirty = false; }
  if (!R.busy && W.phase !== shownPhase) { shownPhase = W.phase; phaseScreen(); }
  else if (!R.busy && (W.phase === 'levelup' || W.phase === 'camp')) phaseScreen(true);
}

// ---------------------------------------------------------------- screens
function showOverlay(html: string) { const o = $('overlay'); o.innerHTML = html; o.classList.add('on'); }
function hideOverlay() { $('overlay').classList.remove('on'); $('overlay').innerHTML = ''; }

let screenKey = '';
const cardBtn = (ps: PlayerState, id: string, attr: string, disabled: boolean) => {
  const c = CARDS[id];
  return `<button type="button" class="card" ${attr} style="--c:${SCHOOL_COLOR[c.school]}" ${disabled ? 'disabled' : ''}><img alt="" src="${cardIcon(id, c.school)}"><span class="nm">${esc(c.name)}</span><span class="cost">${baseCostText(ps, id)}</span><span class="ds">${esc(c.desc)}</span></button>`;
};
const waitingFor = (w: World) => w.players.filter((p) => !p.ready && !p.left).map((p) => p.name);

/** Mutations owed: chosen at the portal or at camp, one at a time. */
function mutationHtml(ps: PlayerState): string {
  if (ps.pendingMutations <= 0 || !ps.mutationOffer.length) return '';
  return `<h3 class="sub bad">Corruption takes root (${ps.pendingMutations} to choose)</h3><div class="ups">${ps.mutationOffer.map((m) => `<button type="button" class="btn mut" data-mut="${m}">${esc(MUTATIONS[m].name)}<small>${esc(MUTATIONS[m].desc)}</small></button>`).join('')}</div>`;
}
const SLOT_NAME = { focus: 'Focus', charm: 'Charm', cloak: 'Cloak', boots: 'Boots' } as const;
/** Equipped gear and the bag, with Equip buttons. */
function gearHtml(ps: PlayerState): string {
  const slots = (Object.keys(SLOT_NAME) as (keyof typeof SLOT_NAME)[]).map((s) => { const g = ps.gear[s]; return `<span class="slot ${g ? '' : 'dim'}" title="${g ? esc(GEAR[g].desc) : 'Empty'}">${SLOT_NAME[s]}: <b>${g ? esc(GEAR[g].name) : 'none'}</b></span>`; }).join('');
  const bag = ps.bag.map((g) => `<button type="button" class="btn small" data-equip="${g}" title="${esc(GEAR[g].desc)}">${esc(GEAR[g].name)}<small>${SLOT_NAME[GEAR[g].slot]} · ${esc(GEAR[g].desc)}</small></button>`).join('');
  if (!bag && !Object.values(ps.gear).some(Boolean)) return '';
  return `<h3 class="sub">Gear</h3><div class="mats">${slots}</div>${bag ? `<div class="ups">${bag}</div>` : ''}`;
}
function bindCommon(ps: PlayerState) {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-equip]')) b.addEventListener('click', () => send({ t: 'equip', pid: ps.pid, item: b.dataset.equip! }));
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-mut]')) b.addEventListener('click', () => send({ t: 'mutate', pid: ps.pid, mutation: b.dataset.mut! }));
}

function phaseScreen(soft = false) {
  if (!W) return;
  const ps = me();
  const u = myUnit();
  if (W.phase === 'levelup' && ps && u) {
    const key = `L|${ps.bag.join()}|${Object.values(ps.gear).join()}|${ps.picked}|${ps.points}|${ps.ready}|${ps.runes.join()}|${ps.pendingMutations}|${ps.mutations.join()}|${W.players.map((p) => p.ready).join()}`;
    if (soft && key === screenKey) return;
    screenKey = key;
    const ups = (Object.keys(UPGRADES) as Stat[]).map((s) => `<button type="button" class="btn" data-up="${s}" ${ps.points < RULES.UPGRADE_COST ? 'disabled' : ''}>${UPGRADES[s].name} <small>${RULES.UPGRADE_COST} pts</small><small>${UPGRADES[s].desc}</small></button>`).join('');
    const runes = ps.runeOffer.map((r) => { const R0 = RUNES[r]; const owned = ps.runes.includes(r); return `<button type="button" class="btn rune" data-rune="${r}" ${owned || ps.points < R0.cost ? 'disabled' : ''}>${esc(R0.name)} <small>${owned ? 'bound' : `${R0.cost} pts`}</small><small>${esc(R0.desc)}</small></button>`; }).join('');
    const myRunes = ps.runes.length ? `<p class="k">Runes bound: ${ps.runes.map((r) => esc(RUNES[r].name)).join(', ')}</p>` : '';
    const offer = ps.offer.map((id) => cardBtn(ps, id, `data-pick="${id}"`, ps.picked)).join('');
    const camp = W.run.floor >= W.run.floorsInRegion;
    showOverlay(`<div class="panel"><h2>${esc(floorName(W))} cleared</h2>
      ${ps.picked ? '<p>Your grimoire has a new page.</p>' : `<p>Bind one new spell into your grimoire.</p><div class="offer">${offer}</div>`}
      ${mutationHtml(ps)}${gearHtml(ps)}
      <p>Upgrade points: <b>${ps.points}</b>. Health ${u.maxHp} · ${CLASSES[ps.cls].name} · Stamina ${u.maxStam} · Reach ${u.range}</p>
      <h3 class="sub">Rune shop</h3><div class="ups">${runes}</div>${myRunes}
      <h3 class="sub">Strengthen yourself</h3><div class="ups">${ups}</div>
      <div class="row">${ps.ready ? `<p>Waiting for ${esc(waitingFor(W).join(', '))}…</p>` : `<button type="button" class="btn ember" id="descend" ${ps.picked ? '' : 'disabled'}>${camp ? 'Make camp' : 'Descend deeper'}</button>`}${!ps.picked ? '<button type="button" class="btn small" id="skip">Skip the spell</button>' : ''}</div></div>`);
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-pick]')) b.addEventListener('click', () => send({ t: 'pick', pid: ps.pid, card: b.dataset.pick! }));
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-up]')) b.addEventListener('click', () => send({ t: 'upgrade', pid: ps.pid, stat: b.dataset.up as Stat }));
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-rune]')) b.addEventListener('click', () => send({ t: 'rune', pid: ps.pid, rune: b.dataset.rune! }));
    bindCommon(ps);
    document.getElementById('skip')?.addEventListener('click', () => send({ t: 'pick', pid: ps.pid, card: null }));
    document.getElementById('descend')?.addEventListener('click', () => { send({ t: 'ready', pid: ps.pid }); cardsKey = ''; });
    return;
  }
  if (W.phase === 'camp' && ps && u) {
    const key = `C|${ps.event?.done}|${u.maxHp}|${u.maxStam}|${ps.bag.join()}|${Object.values(ps.gear).join()}|${JSON.stringify(ps.mats)}|${ps.oil}|${ps.satiety}|${u.hp}|${ps.rested}|${ps.routeVote}|${ps.ready}|${ps.cards.join()}|${JSON.stringify(ps.cardLevels)}|${ps.buffs.join()}|${ps.pendingMutations}|${ps.corruption}|${W.players.map((p) => `${p.ready}${p.routeVote}`).join()}`;
    if (soft && key === screenKey) return;
    screenKey = key;
    const mats = MAT_IDS.map((m) => `<span class="${ps.mats[m] ? '' : 'dim'}">${MAT_NAMES[m]} <b>${ps.mats[m]}</b></span>`).join('');
    const recipes = Object.entries(RECIPES).map(([id, r]) => {
      const ok = Object.entries(r.cost).every(([m, n]) => ps.mats[m as keyof typeof ps.mats] >= (n ?? 0));
      const price = Object.entries(r.cost).map(([m, n]) => `${n} ${MAT_NAMES[m as keyof typeof MAT_NAMES]}`).join(', ');
      return `<button type="button" class="btn" data-craft="${id}" ${ok ? '' : 'disabled'}>${esc(r.name)} <small>${r.kind === 'cook' ? 'cook' : 'craft'} · ${price}</small><small>${esc(r.desc)}</small></button>`;
    }).join('');
    const ink = ps.mats.ink;
    const inscribable = ps.cards.filter((c) => CARDS[c].mode !== 'mod' && (ps.cardLevels[c] ?? 0) < 2);
    const inscribe = inscribable.map((c) => { const lvl = ps.cardLevels[c] ?? 0; const cost = INSCRIBE_COST[lvl + 1]; return `<button type="button" class="chip" data-ins="${c}" style="--c:${SCHOOL_COLOR[CARDS[c].school]}" ${ink >= cost ? '' : 'disabled'}><img alt="" src="${cardIcon(c, CARDS[c].school)}">${esc(CARDS[c].name)} ${'+'.repeat(lvl)} <small>${cost} ink</small></button>`; }).join('');
    const options = W.run.route[W.run.tier + 1] ?? [];
    const votes = (i: number) => W!.players.filter((p) => p.routeVote === i && !p.left).map((p) => esc(p.name)).join(', ');
    const roads = options.map((id, i) => {
      const b = BIOMES[id];
      return `<button type="button" class="road ${ps.routeVote === i ? 'on' : ''}" data-road="${i}" style="--c:#${b.pal.torch.toString(16).padStart(6, '0')}"><b>${esc(b.name)}</b><span>${esc(b.blurb)}</span><span class="k">${esc(b.rule)}${b.cold ? ' · cold' : ''}${b.oilMul > 1 ? ' · the dark drinks oil' : ''}</span>${votes(i) ? `<span class="votes">Chosen by ${votes(i)}</span>` : ''}</button>`;
    }).join('');
    const ev = ps.event && EVENTS[ps.event.id];
    const evHtml = ev ? `<div class="event"><h3 class="sub">${esc(ev.name)}</h3><p>${esc(ev.text)}</p>${ps.event!.done ? `<p class="k">${esc(ps.event!.result ?? '')}</p>` : `<div class="row">${ev.choices.map((c, i) => { const why = c.needs?.(ps, u); return `<button type="button" class="btn small" data-ev="${i}" ${why ? `disabled title="${esc(why)}"` : ''}>${esc(c.label)}</button>`; }).join('')}</div>`}</div>` : '';
    showOverlay(`<div class="panel wide"><h2>Bonfire camp</h2><p>${esc(regionName(W))} lies behind you. Health ${u.hp}/${u.maxHp} · Lantern ${Math.round(ps.oil)}/${ps.maxOil} · Fed ${ps.satiety} · Corruption ${ps.corruption}${ps.buffs.length ? ` · Ready for the road: ${esc(ps.buffs.join(', '))}` : ''}</p>
      ${evHtml}${mutationHtml(ps)}${gearHtml(ps)}
      <div class="mats">${mats}</div>
      <h3 class="sub">Cook and craft</h3><div class="ups">${recipes}</div>
      <h3 class="sub">Inscribe <small>Spell ink makes a card stronger (+50% power per mark), or teaches a new one.</small></h3>
      <div class="queue">${inscribe || '<span class="empty">Nothing left to inscribe.</span>'}<button type="button" class="btn small" id="learn" ${ink >= LEARN_COST ? '' : 'disabled'}>Learn a new spell <small>${LEARN_COST} ink</small></button></div>
      <div class="row"><button type="button" class="btn" id="rest" ${ps.rested || W.opts.curses?.includes('no_rest') ? 'disabled' : ''}>${ps.rested ? 'Rested' : 'Rest by the fire'}</button></div>
      <h3 class="sub">The road ahead</h3><div class="roads">${roads}</div>
      <div class="row">${ps.ready ? `<p>Waiting for ${esc(waitingFor(W).join(', '))}…</p>` : `<button type="button" class="btn ember" id="onward" ${ps.pendingMutations > 0 ? 'disabled' : ''}>Take the road</button>`}</div></div>`);
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-ev]')) b.addEventListener('click', () => send({ t: 'event', pid: ps.pid, choice: Number(b.dataset.ev) }));
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-craft]')) b.addEventListener('click', () => send({ t: 'craft', pid: ps.pid, recipe: b.dataset.craft! }));
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-ins]')) b.addEventListener('click', () => { send({ t: 'inscribe', pid: ps.pid, card: b.dataset.ins! }); cardsKey = ''; });
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-road]')) b.addEventListener('click', () => send({ t: 'route', pid: ps.pid, choice: Number(b.dataset.road) }));
    bindCommon(ps);
    document.getElementById('learn')?.addEventListener('click', () => { send({ t: 'inscribe', pid: ps.pid, card: '__learn' }); cardsKey = ''; });
    document.getElementById('rest')?.addEventListener('click', () => send({ t: 'rest', pid: ps.pid }));
    document.getElementById('onward')?.addEventListener('click', () => { send({ t: 'ready', pid: ps.pid }); cardsKey = ''; });
    return;
  }
  if (W.phase === 'dead') {
    const ash = bankRun(W, worldId);
    showOverlay(`<div class="panel"><h1>The grimoire falls silent</h1><p>You fell in ${esc(regionName(W))}, ${esc(floorName(W))}, at depth ${roman(W.level)}, with ${W.kills} foes slain and ${W.run.bossesSlain} lord${W.run.bossesSlain === 1 ? '' : 's'} of the Reach unmade.</p>
      <p>You carry <b>${ash} Ash</b> back to the Sanctum (now ${meta.ash}). Deepest descent: depth ${roman(meta.bestDepth)}.</p>
      <div class="row"><button type="button" class="btn ember" id="again">Rise again</button><button type="button" class="btn" id="sanct">Sanctum</button><button type="button" class="btn small" id="menu">Title</button></div></div>`);
    $('again').addEventListener('click', () => startSolo());
    $('sanct').addEventListener('click', sanctum);
    $('menu').addEventListener('click', title);
    return;
  }
  if (W.phase === 'victory') {
    const ash = bankRun(W, worldId);
    showOverlay(`<div class="panel"><h1>The Hollow King is unmade</h1><p>The Ashen Reach is cleansed: ${W.kills} foes and ${W.run.bossesSlain} lords slain over ${W.level} floors.</p>
      <p>You bring <b>${ash} Ash</b> home to the Sanctum (now ${meta.ash}).</p>
      <div class="row"><button type="button" class="btn ember" id="again">Descend anew</button><button type="button" class="btn" id="sanct">Sanctum</button></div></div>`);
    $('again').addEventListener('click', () => startSolo());
    $('sanct').addEventListener('click', sanctum);
    return;
  }
  if (W.phase === 'planning') hideOverlay();
}

function startSolo(seed = (Math.random() * 2 ** 31) | 0, daily = false) {
  const t = new LocalTransport();
  attach(t);
  cardsKey = '';
  screenKey = '';
  t.start(daily ? dailySeed() : seed, setupFor(), runOptions(daily));
}

function charLine(): string {
  const p = setupFor();
  const traits = (p.traits ?? []).map((t) => TRAITS[t].name).join(', ');
  return `<div class="who"><img alt="" src="${portrait(meta.profile.look, 4)}"><div><b>${esc(p.name)}</b><br>${CLASSES[p.cls ?? 'spellwright'].name} · ${esc(ORIGINS[p.origin ?? 'knight'].name)}${traits ? `<br><small>${esc(traits)}</small>` : ''}</div></div>`;
}

function curseHtml(): string {
  const mult = 1 + CURSE_ASH * meta.curses.length;
  return `<h3 class="sub">Curses <small>Each one adds ${CURSE_ASH * 100}% Ash. Now ×${mult.toFixed(2)}.</small></h3><div class="traits">${Object.entries(CURSES).map(([id, c]) => `<button type="button" class="trait flaw ${meta.curses.includes(id) ? 'on' : ''}" data-curse="${id}"><b>${esc(c.name)}</b><span>${esc(c.desc)}</span></button>`).join('')}</div>`;
}
function bindCurses(rerender: () => void) {
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-curse]')) b.addEventListener('click', () => {
    const id = b.dataset.curse!;
    meta.curses = meta.curses.includes(id) ? meta.curses.filter((c) => c !== id) : [...meta.curses, id];
    saveMeta();
    rerender();
  });
}

function title() {
  W = null;
  const today = new Date().toISOString().slice(0, 10);
  const dCurse = runOptions(true).curses?.[0];
  showOverlay(`<div class="panel"><h1>Ashen Grimoire</h1>
    <p>The Ashen Reach: twelve regions, a dozen lords of the dark, and one spellbook. Forge every spell card by card, keep your lantern lit, and cross the Reach to the Hollow King.</p>
    ${charLine()}
    <div class="row"><button type="button" class="btn ember" id="solo">Begin the descent</button><button type="button" class="btn" id="coop">Descend together</button><button type="button" class="btn" id="char">Character</button></div>
    <div class="row"><button type="button" class="btn small" id="daily">Daily rite (${today}${dCurse ? `, ${esc(CURSES[dCurse].name)}` : ''})</button><button type="button" class="btn small" id="sanct">Sanctum · ${meta.ash} Ash</button><button type="button" class="btn small" id="codexB">Codex</button></div>
    ${curseHtml()}
    <ol class="howto">${coarse
      ? '<li>Hold a finger on the map to walk toward it, or tap the ground to walk there. Tap a body to inspect it. Drag with two fingers (or switch to Look) to pan.</li><li>Tap cards to forge a spell; they resolve left to right. Long-press a card to read it.</li><li>Tap the map to aim: the preview shows exactly what will happen. Then press Cast.</li><li>Foes outlined in red will strike you next turn. Codex (top right) holds the chronicle and help.</li>'
      : '<li>Hold right-click to walk toward the cursor; it spends stamina. WASD moves the camera.</li><li>Click cards (or press 1–0) to forge a spell. Cards resolve left to right: targeting cards widen who is hit, effect cards strike everything targeted so far.</li><li>Left-click within the violet ring to cast. The preview shows exactly what will happen.</li><li>Foes outlined in red will strike you next turn. Space ends your turn.</li>'}
    <li>Between regions you make camp: cook what you gathered, craft, inscribe your spells, and vote on the road ahead.</li></ol>
    <p class="k">Runs: ${meta.runs} · Victories: ${meta.wins} · Deepest: ${meta.bestDepth ? `depth ${roman(meta.bestDepth)}` : 'none yet'}${meta.dailyBest[today] ? ` · Today's rite: depth ${roman(meta.dailyBest[today])}` : ''}</p></div>`);
  $('solo').addEventListener('click', () => startSolo());
  $('daily').addEventListener('click', () => startSolo(0, true));
  $('coop').addEventListener('click', coopScreen);
  $('char').addEventListener('click', () => openCreator($('overlay'), title));
  $('sanct').addEventListener('click', sanctum);
  $('codexB').addEventListener('click', codex);
  bindCurses(title);
}

function sanctum() {
  W = null;
  const rows = Object.entries(UNLOCKS).map(([id, u]) => {
    const own = meta.unlocked.includes(id);
    return `<button type="button" class="btn" data-unlock="${id}" ${own || meta.ash < u.cost ? 'disabled' : ''}>${esc(u.name)} <small>${own ? 'unlocked' : `${u.cost} Ash`}</small><small>${esc(u.desc)}</small></button>`;
  }).join('');
  showOverlay(`<div class="panel"><h2>The Sanctum</h2><p>Ash carried home from the Reach opens new folios of spells and new origins. You hold <b>${meta.ash} Ash</b>.</p>
    <div class="ups">${rows}</div><div class="row"><button type="button" class="btn small" id="back">Back</button></div></div>`);
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-unlock]')) b.addEventListener('click', () => { if (buyUnlock(b.dataset.unlock!)) { play('portal'); sanctum(); } });
  $('back').addEventListener('click', title);
}

function codex() {
  W = null;
  const foes = Object.keys(UNITS).filter((k) => !UNITS[k].prop && k !== 'wizard' && !k.startsWith('sum_'));
  const seenF = new Set(meta.seenFoes), seenC = new Set(meta.seenCards), seenB = new Set(meta.seenBiomes);
  const foeList = foes.map((k) => seenF.has(k) ? `<li><b>${esc(UNITS[k].name)}</b>${UNITS[k].boss ? ' <small>(lord)</small>' : ''}: ${esc(UNITS[k].desc)}</li>` : '<li class="dim">? ? ?</li>').join('');
  const cardList = Object.keys(CARDS).map((k) => seenC.has(k) ? `<li><b>${esc(CARDS[k].name)}</b>: ${esc(CARDS[k].desc)}</li>` : '<li class="dim">? ? ?</li>').join('');
  const regions = Object.entries(BIOMES).map(([k, b]) => seenB.has(k) ? `<li><b>${esc(b.name)}</b>: ${esc(b.blurb)} <small>${esc(b.rule)}</small></li>` : '<li class="dim">An unmapped region</li>').join('');
  showOverlay(`<div class="panel wide"><h2>Codex</h2><p class="k">Foes ${seenF.size}/${foes.length} · Spells ${seenC.size}/${Object.keys(CARDS).length} · Regions ${seenB.size}/${Object.keys(BIOMES).length}</p>
    <h3 class="sub">Achievements ${meta.achievements.length}/${Object.keys(ACHIEVEMENTS).length}</h3><div class="traits">${Object.entries(ACHIEVEMENTS).map(([id, a]) => `<div class="trait ${meta.achievements.includes(id) ? 'on' : 'dim'}"><b>${esc(a.name)}</b><span>${esc(a.desc)}</span></div>`).join('')}</div>
    <div class="codexcols"><div><h3 class="sub">The Reach</h3><ul>${regions}</ul></div><div><h3 class="sub">Bestiary</h3><ul>${foeList}</ul></div><div><h3 class="sub">Grimoire</h3><ul>${cardList}</ul></div></div>
    <div class="row"><button type="button" class="btn small" id="back">Back</button></div></div>`);
  $('back').addEventListener('click', title);
}

/** True when this page is served by the co-op server itself (so the server address is known). */
const hostedHere = DEFAULT_SERVER !== 'ws://localhost:8787' || location.port === '8787';
function savedServer(): string {
  if (hostedHere) return DEFAULT_SERVER;
  try { return localStorage.getItem('ashen-server') ?? ''; } catch { return ''; }
}

/** When this page is served by the co-op server, show the public link for a friend (with Copy). */
function showFriendLink(el: HTMLElement | null) {
  if (!el || location.port !== '8787') return;
  const paint = (url: string) => {
    el.innerHTML = url
      ? `<b>Your friend's link</b> (works from anywhere): <a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a> <button type="button" class="btn small" id="copyLink">Copy</button>`
      : '<span class="k">Opening a public link for your friend…</span>';
    document.getElementById('copyLink')?.addEventListener('click', () => { navigator.clipboard?.writeText(url).then(() => toast('Link copied. Send it to your friend.')).catch(() => toast(url)); });
  };
  let tries = 0;
  const poll = () => fetch('/tunnel').then((r) => r.json()).then((j: { url: string }) => {
    if (!el.isConnected) return;
    paint(j.url);
    if (!j.url && ++tries < 30) setTimeout(poll, 1000);
  }).catch(() => { el.innerHTML = ''; });
  poll();
}

function coopScreen() {
  const p = setupFor();
  const intro = location.port === '8787'
    ? 'You are the server. Press <b>Host</b>, then send your friend the link below and your 4-letter code. Your curses apply to everyone.'
    : 'Paste the link the host sent you, enter their 4-letter code, and press <b>Join</b>. (Or open the host\'s link directly: the server box fills itself in.)';
  showOverlay(`<div class="panel"><h2>Descend together</h2><p>${intro}</p>
    ${charLine()}
    <div class="lobby"><label class="f">Server${hostedHere ? '' : ' (paste the host\'s link)'}<input class="f" id="url" value="${savedServer()}" placeholder="https://….trycloudflare.com" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
    <label class="f">Game code (to join)<input class="f" id="code" maxlength="4" placeholder="ABCD"></label>
    <label class="f chk"><input type="checkbox" id="dly"> Host today's daily rite</label>
    <p class="friend" id="friendLink"></p>
    <p class="k">Alt-click or middle-click the map to ping. A fallen companion is only down: stand beside them and press R.</p>
    <div class="row"><button type="button" class="btn ember" id="host">Host</button><button type="button" class="btn" id="join">Join</button><button type="button" class="btn small" id="back">Back</button></div></div></div>`);
  const go = (host: boolean) => {
    const t = new NetTransport();
    attach(t);
    cardsKey = '';
    screenKey = '';
    t.onLobby = (code, players, isHost, opts) => {
      const curses = (opts.curses ?? []).map((c) => CURSES[c]?.name ?? c).join(', ');
      showOverlay(`<div class="panel"><h2>Game ${esc(code)}</h2><p>Share this code with your companions.${opts.daily ? " Today's daily rite." : ''}${curses ? ` Curses: ${esc(curses)}.` : ''}</p>
        <div class="plist">${players.map((q) => `${esc(q.name)} <small>${CLASSES[q.cls ?? 'spellwright']?.name ?? ''} · ${esc(ORIGINS[q.origin ?? 'knight']?.name ?? '')}</small>`).join('<br>')}</div>
        ${isHost ? '<p class="friend" id="friendLink2"></p>' : ''}
        <div class="row">${isHost ? '<button type="button" class="btn ember" id="go">Begin</button>' : '<p>Waiting for the host to begin…</p>'}</div></div>`);
      showFriendLink(document.getElementById('friendLink2'));
      document.getElementById('go')?.addEventListener('click', () => t.startGame());
    };
    const daily = $<HTMLInputElement>('dly').checked;
    const url = toWs($<HTMLInputElement>('url').value);
    try { localStorage.setItem('ashen-server', $<HTMLInputElement>('url').value.trim()); } catch { /* storage unavailable */ }
    t.connect(url, host ? { t: 'host', setup: p, opts: runOptions(daily) } : { t: 'join', code: $<HTMLInputElement>('code').value.trim().toUpperCase(), setup: p });
  };
  showFriendLink(document.getElementById('friendLink'));
  $('host').addEventListener('click', () => go(true));
  $('join').addEventListener('click', () => go(false));
  $('back').addEventListener('click', title);
}


// Exposed for automated playtests and modding consoles.
(window as unknown as { __ag: unknown }).__ag = { get world() { return W; }, get pid() { return T?.localPid; }, get busy() { return R.busy; }, send, renderer: R, music };

// ---------------------------------------------------------------- installable app
// Offline cache for the home-screen app. Skipped in the desktop app (file://) and the dev server.
if ('serviceWorker' in navigator && location.protocol === 'https:' && !import.meta.env.DEV) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline play just won't be available */ });
}

/** Accept whatever the host sends: an https tunnel link, an http address, or a ws:// address. */
function toWs(input: string): string {
  const s = input.trim();
  if (/^wss?:\/\//i.test(s)) return s;
  if (/^https:\/\//i.test(s)) return 'wss://' + s.slice(8).replace(/\/.*$/, '');
  if (/^http:\/\//i.test(s)) return 'ws://' + s.slice(7).replace(/\/.*$/, '');
  if (/trycloudflare\.com/i.test(s)) return 'wss://' + s.replace(/\/.*$/, '');
  return s.includes(':') ? 'ws://' + s : 'ws://' + s + ':8787';
}

// ---------------------------------------------------------------- boot
(async () => {
  await R.init(canvas);
  R.resize(canvas.clientWidth, canvas.clientHeight);
  await document.fonts?.ready;
  title();
  loop();
  const params = new URLSearchParams(location.search);
  if (params.has('seed')) startSolo(Number(params.get('seed')));
})();

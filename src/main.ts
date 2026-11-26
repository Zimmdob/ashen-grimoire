import './style.css';
import '@fontsource/vt323';
import '@fontsource/pirata-one';
import '@fontsource/im-fell-english';
import { BH, BW, GameRenderer, SC, ZOOM_MAX } from './render/renderer';
import { CARDS } from './sim/cards';
import { RULES, UPGRADES } from './sim/constants';
import { reachOutline } from './sim/reach';
import { startStorm } from './storm/game';
import { biomeOf, canActNow, fromHand, PLACE_CLEARANCE, placeProblem, playerState, playerUnit, previewCast } from './sim/game';
import { predictThreats } from './sim/ai';
import { findPath } from './sim/path';
import { cantAfford, spellCost, type SpellPrice } from './sim/spell';
import { UNITS, unitName } from './sim/units';
import type { Action, Look, PlayerState, Pt, Stat, Unit, World } from './sim/types';
import { AFFIXES, RUNES } from './sim/runes';
import { LocalTransport, NetTransport, type Transport } from './net/transport';
import { dailySeed, DEFAULT_SERVER, type LobbyPlayer } from './net/protocol';
import { BIOMES } from './sim/biomes';
import { CLASSES, GEAR, INSCRIBE_COST, LEARN_COST, MAT_IDS, MAT_NAMES, MUTATIONS, ORIGINS, RECIPES, TRAITS } from './sim/character';
import { eventFor, SYDNEY_LOOK } from './sim/events';
import { speak } from './ui/voice';
import { sydneyQuestions } from './ui/sydneyTalk';
let talk = { visit: '', asked: [] as string[], text: '', n: 0 };
import { ACHIEVEMENTS, bankRun, buyUnlock, checkAchievements, CURSE_ASH, CURSES, meta, observe, runOptions, saveMeta, setupFor, UNLOCKS } from './ui/meta';
import { openCreator, portrait, whoLine } from './ui/creator';
import { GLOSSARY, glossCard, guideHtml } from './ui/glossary';
import { BUILD, sameBuild } from './version';
import { announce, HEARTBEAT_MS, openGames, withdraw, type Posting } from './net/board';
import { flushFeedback, sendFeedback, type FeedbackKind } from './net/feedback';
import { cardIcon, SCHOOL_COLOR, SCHOOL_NAME } from './ui/icons';
import { isMuted, play, setMuted } from './ui/sfx';
import { music, STYLE_NAMES, type MusicStyle } from './ui/music';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const roman = (n: number) => ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] ?? String(n);

const canvas = $<HTMLCanvasElement>('cv');
const R = new GameRenderer();
let T: Transport | null = null;
let W: World | null = null;
let spell: string[] = [];
let mouse: Pt | null = null;
/** Where the cursor last was on the map, so hovering a card can still preview the spell there. */
let lastMouse: Pt | null = null;
const mouseNow = () => mouse ?? lastMouse;
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
  return !!W && !!ps && !!u && canActNow(W, ps) && u.alive && !ps.endedTurn && !R.blocked;
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
  if (T && T !== t && T instanceof NetTransport) T.close();
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
  if (t instanceof NetTransport) {
    t.onNotice = (m) => toast(m);
    t.onStatus = (st) => {
      const b = $('netBanner');
      b.classList.toggle('on', st === 'reconnecting');
      b.textContent = 'Connection lost. Getting you back into the game…';
      if (st === 'ok') toast('Reconnected. You are back in the game.');
    };
  }
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
/** The body at a point. `tight` counts only a pointer that is really on the body (for aiming with a mouse). */
function unitAt(p: Pt, tight = false): Unit | null {
  if (!W) return null;
  let best: Unit | null = null, bd = Infinity;
  for (const u of W.units) {
    if (u.gone) continue;
    const d = Math.hypot(u.x - p.x, u.y - (p.y + 6));
    const lim = tight ? (u.alive ? u.r + 3 : 10) * (UNITS[u.type].boss ? 1.4 : 1) : (u.alive ? u.r + 12 : 16) * (UNITS[u.type].boss ? 2 : 1);
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
  if (!ps || !u || !u.alive || !canActNow(W, ps) || ps.endedTurn) return;
  if (!R.freeToWalk(u.id)) return;
  if (u.stam < 1 && !W.portal) { if (walkStall++ === 0) toast('Out of stamina. Cast, or end your turn.'); return; }
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
let aimPt: Aim | null = null;
let pinnedId: number | null = null;
const fingers = new Map<number, { x: number; y: number; sx: number; sy: number; t0: number }>();
let holdTimer = 0;
let panning = false;

/** Placement phase: this player still has to choose where to begin. */
const placingNow = () => !!W && W.phase === 'placing' && !!me() && !me()!.placed && !R.blocked;
function placeAt(p: Pt) {
  const ps = me(), u = myUnit();
  if (!W || !ps || !u) return;
  const why = placeProblem(W, u, p);
  if (why) { toast(why); return; }
  send({ t: 'place', pid: ps.pid, x: p.x, y: p.y });
  R.camOff = { x: 0, y: 0 };
}

function castAt(aim: Aim) {
  if (!W || !T) return;
  if (!canAct()) { if (!R.busy && me()?.endedTurn) toast('Waiting for your companions'); return; }
  const ps = me()!;
  const pv = previewCast(W, ps.pid, spell, aim);
  const k = `${spell.join()}|${Math.round(aim.x)}|${Math.round(aim.y)}|${aim.exact}`;
  if (pv?.selfDies && confirmKill !== k) { confirmKill = k; toast(coarse ? 'This spell would kill you. Press Cast again to do it anyway.' : 'This spell would kill you. Click again to cast anyway.'); return; }
  confirmKill = '';
  send({ t: 'cast', pid: ps.pid, cards: [...spell], x: aim.x, y: aim.y, exact: aim.exact });
  navigator.vibrate?.(15);
  spell = [];
  aimPt = null;
  R.camOff = { x: 0, y: 0 };
  dirty = true;
}
/**
 * Where a spell aimed at p goes. With a mouse it locks onto a body only when the pointer is on that body;
 * anywhere else it lands exactly where you point. Touch keeps a wider lock for fingers.
 * Holding Shift always places it exactly, even on top of someone.
 */
type Aim = Pt & { exact: boolean };
const aimOf = (p: Pt): Aim => {
  if (keys.has('shift')) return { x: p.x, y: p.y, exact: true };
  const t = unitAt(p, !coarse);
  return t ? { x: t.x, y: t.y, exact: false } : { x: p.x, y: p.y, exact: true };
};

canvas.addEventListener('pointermove', (e) => {
  const b = toBuffer(e);
  const wp = R.screenToWorld(b.x, b.y);
  if (e.pointerType === 'touch') {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    const r = canvas.getBoundingClientRect();
    const dx = ((e.clientX - f.x) / r.width) * BW / SC, dy = ((e.clientY - f.y) / r.height) * BH / SC;
    // two fingers: pinch to zoom around their midpoint
    const other = fingers.size === 2 ? [...fingers.entries()].find(([id]) => id !== e.pointerId)?.[1] : undefined;
    const d0 = other ? Math.hypot(f.x - other.x, f.y - other.y) : 0;
    f.x = e.clientX; f.y = e.clientY;
    if (other && d0 > 20) {
      const d1 = Math.hypot(f.x - other.x, f.y - other.y);
      zoomBy(d1 / d0, (f.x + other.x) / 2, (f.y + other.y) / 2);
    }
    if (panning || touchMode === 'look' || fingers.size > 1) {
      // dragging the map: move the camera the opposite way (two fingers move it half as fast each)
      const k = fingers.size > 1 ? 0.5 : 1;
      R.pan(-dx * k, -dy * k);
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
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && !walking) { if (mouse) lastMouse = mouse; mouse = null; hoverId = null; } });
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
    if (W?.phase === 'placing') { mouse = wp; return; }
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
  if (placingNow()) { placeAt(wp); return; }
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
  if (placingNow()) { placeAt(wp); return; }
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
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === 'shift') dirty = true;
  if (k === 'f' && !e.repeat && !e.ctrlKey && !e.metaKey) { toggleFullscreen(); return; }
  if ($('guide').classList.contains('on')) { if (k === 'escape' || k === 'g') closeGuide(); return; }
  if (k === 'g' && !e.repeat) { openGuide(); return; }
  if ($('overlay').classList.contains('on')) return;
  if (k === 'z' && !e.repeat) { toggleWholeMap(); return; }
  if (k === 'v' && !e.repeat) { toggle3d(); return; }
  if ((k === 'q' || k === 'e') && R.mode3d) { keys.add(k); return; }
  if (k === '-' || k === '_') { zoomBy(1 / 1.25); return; }
  if (k === '=' || k === '+') { zoomBy(1.25); return; }
  const ps = me();
  if (!ps) return;
  if (k === ' ' || k === 'enter') { e.preventDefault(); endTurn(); }
  else if (k === 'escape') { spell = []; dirty = true; }
  else if (k === 'backspace') { e.preventDefault(); removeCard(); }
  else if (k === 'c') R.camOff = { x: 0, y: 0 };
  else if (k === 'r') { const t = downedNear(); if (t) send({ t: 'revive', pid: ps.pid, target: t.pid }); else toast('Nobody down beside you'); }
  else if (/^f[1-4]$/.test(k)) { e.preventDefault(); loadMark(Number(k[1]) - 1); }
  else if (/^[0-9]$/.test(k)) { const i = k === '0' ? 9 : Number(k) - 1; const id = ps.cards[i]; if (id) addCard(id); }
});
window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); if (e.key === 'Shift') dirty = true; });
window.addEventListener('blur', () => keys.clear());

// ---------------------------------------------------------------- zoom and fullscreen
/** Zoom by a factor around a point on screen (client coords), or the middle of the map. */
function zoomBy(f: number, clientX?: number, clientY?: number) {
  const r = canvas.getBoundingClientRect();
  const fx = clientX == null ? 0.5 : Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  const fy = clientY == null ? 0.5 : Math.max(0, Math.min(1, (clientY - r.top) / r.height));
  R.setZoom(R.zoom * f, { fx, fy });
  lastZoom = 0;
  paintViewbar();
  dirty = true;
}
/** Z: jump between the whole depth and normal view. */
let lastZoom = 0;
function toggleWholeMap() {
  const fit = R.fitZoom();
  if (R.zoom > fit + 0.01) { lastZoom = R.zoom; R.setZoom(fit); R.camOff = { x: 0, y: 0 }; }
  else { R.setZoom(lastZoom || 1); R.camOff = { x: 0, y: 0 }; lastZoom = 0; }
  paintViewbar();
}
function paintViewbar() {
  $('zoomFit').classList.toggle('on', R.zoom <= R.fitZoom() + 0.01);
  $<HTMLButtonElement>('zoomIn').disabled = R.zoom >= ZOOM_MAX - 0.01;
  $('fsBtn').textContent = document.body.classList.contains('fs') ? 'Exit' : 'Fullscreen';
}
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  zoomBy(Math.exp(-step * 0.0016), e.clientX, e.clientY);
}, { passive: false });
$('zoomIn').addEventListener('click', () => zoomBy(1.25));
$('zoomOut').addEventListener('click', () => zoomBy(1 / 1.25));
$('zoomFit').addEventListener('click', toggleWholeMap);
// ---------------------------------------------------------------- 2D / 3D view
R.stageFor = () => ({ stage: $('stage'), cv: canvas });
function paint3dBtn() {
  const b = $('view3dBtn');
  b.textContent = R.mode3d ? '2D' : '3D';
  b.title = R.mode3d ? 'Back to the classic 2D view (V)' : 'Switch to the 3D view (V)';
  for (const id of ['rotL', 'rotR']) $(id).style.display = R.mode3d ? '' : 'none';
}
function toggle3d(on = !R.mode3d) {
  R.set3d(on);
  if (on && !R.mode3d) toast('3D view is not available on this device');
  try { localStorage.setItem('ashen-view', R.mode3d ? '3d' : '2d'); } catch { /* storage unavailable */ }
  paint3dBtn();
  dirty = true;
}
$('view3dBtn').addEventListener('click', () => toggle3d());
// turn the 3D camera: tap for an eighth of a turn, hold to keep turning; double-click either to face north again
for (const [id, dir] of [['rotL', -1], ['rotR', 1]] as const) {
  const b = $(id);
  let hold = 0, timer = 0;
  const stop = () => { clearInterval(timer); timer = 0; };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    hold = performance.now();
    R.rotate(dir * 45);
    timer = window.setInterval(() => { if (performance.now() - hold > 350) R.rotate(dir * 3); }, 30);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
  b.addEventListener('dblclick', () => R.resetRotation());
}

/** Fullscreen: the browser's own when it allows (Esc leaves), and the full-screen layout either way. */
function toggleFullscreen(on = !document.body.classList.contains('fs')) {
  document.body.classList.toggle('fs', on);
  const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (on && !(d.fullscreenElement ?? d.webkitFullscreenElement)) {
      if (el.requestFullscreen) el.requestFullscreen().catch(() => { /* layout still goes full-window */ });
      else el.webkitRequestFullscreen?.();
    } else if (!on && (d.fullscreenElement ?? d.webkitFullscreenElement)) {
      if (d.exitFullscreen) d.exitFullscreen().catch(() => {}); else d.webkitExitFullscreen?.();
    }
  } catch { /* not allowed here: the layout alone still helps */ }
  if (!on) $('codex').classList.remove('open');
  paintViewbar();
  dirty = true;
}
let wasFull = false;
const onFsChange = () => {
  const d = document as Document & { webkitFullscreenElement?: Element };
  const full = !!(d.fullscreenElement ?? d.webkitFullscreenElement);
  if (wasFull && !full && document.body.classList.contains('fs')) toggleFullscreen(false); // Esc left fullscreen
  wasFull = full;
};
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);
$('fsBtn').addEventListener('click', () => toggleFullscreen());
$('fsCodex').addEventListener('click', () => $('codex').classList.toggle('open'));
// The desktop app's F11 calls this (see electron/main.cjs).
(window as unknown as { __agToggleFs: () => void }).__agToggleFs = () => toggleFullscreen();

// ---------------------------------------------------------------- the Field Guide and its hover cards
const glossSeen = new Set<string>((() => { try { return JSON.parse(localStorage.getItem('ashen-gloss-seen') ?? '[]') as string[]; } catch { return []; } })());
function markSeen(key: string) {
  if (glossSeen.has(key)) return;
  glossSeen.add(key);
  try { localStorage.setItem('ashen-gloss-seen', JSON.stringify([...glossSeen])); } catch { /* storage unavailable */ }
  document.querySelectorAll(`[data-g="${key}"].new`).forEach((el) => el.classList.remove('new'));
}
let glossKey = '';
let glossPinned = false;
/** "Right now" line for a card: your current amount, where it makes sense. */
function glossNow(key: string): string {
  const ps = me(), u = W && ps ? playerUnit(W, ps) : null;
  if (!ps || !u) return '';
  if (key === 'health' || key === 'ward') return `You: ${u.hp}/${u.maxHp} health${u.shield ? `, ${u.shield} ward` : ''}`;
  if (key === 'lantern' || key === 'fuel') return `You: ${Math.round(ps.oil)} of ${ps.maxOil} oil`;
  if (key === 'corruption') return `You: ${ps.corruption} (next mutation at ${(Math.floor(ps.corruption / 25) + 1) * 25})`;
  if (key === 'chill') return `You: chilled ${ps.chill} of 3`;
  if (key in ps.mats) return `You carry ${ps.mats[key as keyof typeof ps.mats]}`;
  return '';
}
function showGloss(key: string, anchor: Element, pinned: boolean) {
  const el = $('gloss');
  if (key !== glossKey || pinned !== glossPinned) {
    el.innerHTML = glossCard(key, glossNow(key)) + (pinned ? '<button type="button" class="btn small" id="glossGuide">Open the Field Guide</button>' : '');
    document.getElementById('glossGuide')?.addEventListener('click', () => openGuide(key));
  }
  glossKey = key; glossPinned = pinned;
  el.classList.add('on');
  el.classList.toggle('pinned', pinned);
  markSeen(key);
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight;
  const x = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const y = r.top - h - 10 >= 8 ? r.top - h - 10 : Math.min(innerHeight - h - 8, r.bottom + 10);
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
}
function hideGloss() { $('gloss').classList.remove('on', 'pinned'); glossKey = ''; glossPinned = false; }
document.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch' || glossPinned) return;
  const t = (e.target as Element | null)?.closest?.('[data-g]');
  if (t) showGloss((t as HTMLElement).dataset.g!, t, false); else if (glossKey) hideGloss();
}, { passive: true });
document.addEventListener('click', (e) => {
  const t = (e.target as Element | null)?.closest?.('[data-g]');
  if (t) { const k = (t as HTMLElement).dataset.g!; if (glossPinned && glossKey === k) hideGloss(); else showGloss(k, t, true); return; }
  if (glossPinned && !(e.target as Element | null)?.closest?.('#gloss')) hideGloss();
});

function openGuide(focus?: string) {
  hideGloss();
  const box = $('guide');
  box.innerHTML = `<div class="panel guide"><div class="gl-head"><h2>Field Guide</h2><button type="button" class="btn small" id="guideClose">Close</button></div>
    <p class="k">Everything you carry, find and suffer in the Reach. Hover or tap anything in your status strip for the short version.</p>${guideHtml(glossSeen)}</div>`;
  box.classList.add('on');
  $('guideClose').addEventListener('click', closeGuide);
  for (const k of Object.keys(GLOSSARY)) markSeen(k);
  if (focus) document.getElementById(`gl-${focus}`)?.scrollIntoView({ block: 'center' });
}
function closeGuide() { $('guide').classList.remove('on'); }

// ---------------------------------------------------------------- feedback
/** What the player is doing right now, attached to feedback if they allow it. */
function feedbackContext(): string {
  const bits = [`version ${BUILD.sha}`, agApp ? 'desktop app' : coarse ? 'phone/tablet browser' : 'browser'];
  const ps = me();
  if (W && ps) {
    const u = playerUnit(W, ps);
    bits.push(`${regionName(W)}, depth ${W.level}, turn ${W.turn}, phase ${W.phase}`, `class ${ps.cls}`, `health ${u.hp}/${u.maxHp}`, `cards ${ps.cards.join(' ')}`, `${W.players.length > 1 ? `co-op with ${W.players.length}` : 'solo'}`, `seed ${W.seed}`);
  } else bits.push('on the menus');
  return bits.join(' · ');
}
function openFeedback() {
  hideGloss();
  const box = $('guide');
  box.innerHTML = `<div class="panel guide fb"><div class="gl-head"><h2>Feedback</h2><button type="button" class="btn small" id="fbClose">Close</button></div>
    <p>Found a bug, have an idea, or think something is too strong or too weak? Tell Dean here. It goes straight to his list.</p>
    <div class="fbkinds" role="radiogroup" aria-label="Kind of feedback">
      ${(['bug', 'idea', 'balance', 'other'] as FeedbackKind[]).map((k, i) => `<label class="fbk"><input type="radio" name="fbk" value="${k}" ${i === 1 ? 'checked' : ''}> ${{ bug: 'Bug', idea: 'Idea', balance: 'Balance', other: 'Other' }[k]}</label>`).join('')}
    </div>
    <textarea id="fbText" maxlength="1500" rows="6" placeholder="What happened, or what would make the game better?"></textarea>
    <label class="f chk"><input type="checkbox" id="fbCtx" checked> Include what I'm doing right now (depth, class, version)</label>
    <div class="row"><button type="button" class="btn ember" id="fbSend">Send</button><span class="k" id="fbMsg"></span></div></div>`;
  box.classList.add('on');
  $('fbClose').addEventListener('click', closeGuide);
  $<HTMLTextAreaElement>('fbText').focus();
  $('fbSend').addEventListener('click', async () => {
    const text = $<HTMLTextAreaElement>('fbText').value.trim();
    if (text.length < 3) { $('fbMsg').textContent = 'Write a few words first.'; return; }
    const kind = (document.querySelector<HTMLInputElement>('input[name="fbk"]:checked')?.value ?? 'other') as FeedbackKind;
    const btn = $<HTMLButtonElement>('fbSend');
    btn.disabled = true;
    $('fbMsg').textContent = 'Sending…';
    const ok = await sendFeedback({ kind, text, name: setupFor().name, build: BUILD.sha, context: $<HTMLInputElement>('fbCtx').checked ? feedbackContext() : '', t: Date.now() });
    $('fbMsg').textContent = ok ? 'Sent. Thank you!' : 'Saved. It will send next time you are online.';
    $<HTMLTextAreaElement>('fbText').value = '';
    setTimeout(() => { if (box.querySelector('.fb')) closeGuide(); }, 1400);
  });
}
$('feedbackBtn').addEventListener('click', openFeedback);
setTimeout(() => { flushFeedback(); }, 5000);
$('guide').addEventListener('click', (e) => { if (e.target === $('guide')) closeGuide(); });
$('guideBtn').addEventListener('click', () => openGuide());

/** Where the pointer is on screen, for the fullscreen hover card. */
let clientPt = { x: 0, y: 0 };
window.addEventListener('pointermove', (e) => { clientPt = { x: e.clientX, y: e.clientY }; placeHoverTip(); }, { passive: true });
function placeHoverTip() {
  const el = $('hoverTip');
  if (!el.classList.contains('on')) return;
  const w = el.offsetWidth, h = el.offsetHeight;
  let x = clientPt.x + 18, y = clientPt.y + 18;
  if (x + w > innerWidth - 8) x = clientPt.x - w - 18;
  if (y + h > innerHeight - 8) y = clientPt.y - h - 18;
  el.style.left = `${Math.max(8, x)}px`;
  el.style.top = `${Math.max(8, y)}px`;
}

function addCard(id: string) {
  const ps0 = me();
  if (!W || !ps0 || !canActNow(W, ps0)) return;
  if (spell.length >= 12) { toast('A spell may hold twelve cards'); return; }
  spell.push(id);
  play('click');
  dirty = true;
}
/** Take the last copy of a card (or, with no card named, the last card) out of the forged spell. */
function removeCard(id?: string) {
  const i = id ? spell.lastIndexOf(id) : spell.length - 1;
  if (i < 0) return;
  spell.splice(i, 1);
  aimPt = null;
  play('click');
  dirty = true;
}
function endTurn() {
  const ps = me();
  if (!ps || !W || R.blocked) return;
  if (!canActNow(W, ps)) return;
  spell = [];
  send({ t: 'endTurn', pid: ps.pid });
}
$('endBtn').addEventListener('click', endTurn);
$('clearBtn').addEventListener('click', () => { spell = []; aimPt = null; dirty = true; });
$('undoBtn').addEventListener('click', () => removeCard());
// ---------------------------------------------------------------- quitting a run
$('quitBtn').addEventListener('click', () => {
  if (!W || W.phase === 'dead' || W.phase === 'victory') { title(); return; }
  const coop = T instanceof NetTransport && W.players.filter((p) => !p.left).length > 1;
  const box = document.createElement('div');
  box.className = 'askbox';
  box.innerHTML = `<div class="panel"><h2>Quit this run?</h2>
    <p>${coop ? 'You leave the party and your wizard steps out of the run; your companions carry on without you. You keep the Ash you have earned so far.' : 'The run ends here, as if you had fallen: you keep the Ash you have earned so far.'}</p>
    <div class="row"><button type="button" class="btn ember" data-q="yes">Quit to title</button><button type="button" class="btn" data-q="no">Keep playing</button></div></div>`;
  document.body.appendChild(box);
  const close = () => box.remove();
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  box.querySelector('[data-q="no"]')!.addEventListener('click', close);
  box.querySelector('[data-q="yes"]')!.addEventListener('click', () => {
    close();
    if (W) bankRun(W, worldId);
    if (T instanceof NetTransport) { leaveBoard(); T.close(); }
    spell = [];
    title();
  });
});
$('muteBtn').addEventListener('click', () => { setMuted(!isMuted()); $('muteBtn').textContent = isMuted() ? 'Sound off' : 'Sound on'; });
// Music: browsers only allow audio after a gesture, so the score begins on the first click or key.
const musicBtn = $('musicBtn'), musicVol = $<HTMLInputElement>('musicVol');
const syncMusicUi = () => { musicBtn.textContent = music.isEnabled() ? 'Music on' : 'Music off'; musicVol.value = String(Math.round(music.getVolume() * 100)); };
syncMusicUi();
musicBtn.addEventListener('click', () => { music.setEnabled(!music.isEnabled()); syncMusicUi(); });
musicVol.addEventListener('input', () => music.setVolume(Number(musicVol.value) / 100));
const styleBtn = $('styleBtn');
const paintStyle = () => { styleBtn.textContent = `Style: ${STYLE_NAMES[music.getStyle()]}`; };
paintStyle();
styleBtn.addEventListener('click', () => {
  const order: MusicStyle[] = ['dream', 'mixed', 'dungeon'];
  music.setStyle(order[(order.indexOf(music.getStyle()) + 1) % order.length]);
  paintStyle();
  if (!music.isEnabled()) { music.setEnabled(true); syncMusicUi(); }
});
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
    // right-click a card in your hand to take one of it back out of the spell
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!coarse) removeCard(b.dataset.id!); });
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
  const inf = u.stam >= RULES.CLEARED_STAMINA || (!!W.portal && W.phase === 'planning');
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
  // survival strip: lantern, cold, corruption, satchel
  const oilPct = Math.round((100 * ps.oil) / Math.max(1, ps.maxOil));
  const chill = ps.chill >= 3 ? '<b class="bad">Frozen through</b>' : ps.chill > 0 ? `<b class="warn">Chilled ${ps.chill}</b>` : '';
  const downed = downedNear();
  const g = (key: string, html: string, cls = '') => `<button type="button" class="g ${cls}${glossSeen.has(key) ? '' : ' new'}" data-g="${key}">${html}</button>`;
  const matChips = MAT_IDS.filter((m) => ps.mats[m] > 0).map((m) => g(m, `${MAT_NAMES[m]} <b>${ps.mats[m]}</b>`, 'mat')).join('');
  $('surv').innerHTML = `${g('lantern', `Lantern <b class="${oilPct < 25 ? 'bad' : oilPct < 50 ? 'warn' : ''}">${oilPct}%</b>`)}
    ${chill ? g('chill', chill) : ''}
    ${g('corruption', `Corruption <b class="${ps.corruption >= 75 ? 'bad' : ''}">${ps.corruption}</b>`)}
    ${ps.cls === 'cagebearer' ? g('cage', `Cage <b>${ps.cage.length}/${ps.maxCage}</b>${ps.cage.length ? `: ${ps.cage.map((t) => esc(UNITS[t].name)).join(', ')}` : ''}`) : ''}
    ${W.players.filter((p) => !p.left).length > 1 ? `${g('bond', `Bond <b class="${W.bond >= 100 ? 'warn' : ''}">${W.bond}</b>`)}${W.bond >= 100 && W.phase === 'planning' ? '<button type="button" class="btn small ember" id="duetBtn">Duet!</button>' : ''}` : ''}
    ${W.duet === W.turn ? '<b class="warn">Duet: spells are free</b>' : ''}
    ${W.pickups.some((k) => k.type === 'vault' && !k.used) ? g('p_key', `Vault keys <b>${W.keys}/2</b>`) : ''}
    ${ps.cls === 'tarot' ? g('hand', `Hand <b>${ps.hand.length}</b>`) : ''}
    ${matChips}${downed ? `<button type="button" class="btn small ember" id="reviveBtn">Revive ${esc(downed.name)} (R)</button>` : ''}`;
  // what the bars are, for the hover cards
  $('hpTxt').parentElement!.dataset.g = u.shield ? 'ward' : 'health';
  $('manaTxt').parentElement!.dataset.g = ps.cls === 'soulbinder' ? 'souls' : ps.cls === 'lanternkeeper' ? 'fuel' : ps.cls === 'hexblade' ? 'stamina' : 'mana';
  $('stamTxt').parentElement!.dataset.g = 'stamina';
  document.getElementById('duetBtn')?.addEventListener('click', () => send({ t: 'duet', pid: ps.pid }));
  document.getElementById('reviveBtn')?.addEventListener('click', () => send({ t: 'revive', pid: ps.pid, target: downed!.pid }));
  if (u.downed > 0) $('surv').insertAdjacentHTML('afterbegin', `<b class="bad">You are down: ${u.downed} turn${u.downed === 1 ? '' : 's'} for a companion to reach you.</b>`);
  $('queue').innerHTML = spell.length
    ? spell.map((id, i) => `${i ? '<span class="arrow">›</span>' : ''}<button type="button" class="chip" data-i="${i}" title="Click to take ${esc(CARDS[id].name)} out of the spell" style="--c:${SCHOOL_COLOR[CARDS[id].school]}"><img alt="" src="${cardIcon(id, CARDS[id].school)}">${esc(CARDS[id].name)}<span class="x" aria-hidden="true">✕</span></button>`).join('')
    : '<span class="empty">Click cards to forge a spell. They resolve left to right.</span>';
  for (const c of $('queue').querySelectorAll<HTMLButtonElement>('.chip')) {
    const drop = (e: Event) => { e.preventDefault(); spell.splice(Number(c.dataset.i), 1); aimPt = null; play('click'); dirty = true; };
    c.addEventListener('click', drop);
    c.addEventListener('contextmenu', drop);
  }
  $<HTMLButtonElement>('undoBtn').disabled = !spell.length;
  $<HTMLButtonElement>('clearBtn').disabled = !spell.length;
  const bad = !!cantAfford(ps, u, cost);
  const lethal = !!spell.length && !!cachedPv?.selfDies;
  const choosing = W.phase === 'placing' && !ps.placed;
  if (!choosing) { delete $('qcost').dataset.place; $('qcost').innerHTML = spell.length ? `Costs <span class="${bad ? 'bad' : ''}">${priceText(ps, cost)}</span>. ${lethal ? '<span class="bad">Aimed here, this spell kills you.</span>' : (coarse ? (aimPt ? 'Press Cast, or tap to re-aim.' : 'Tap a target within the violet ring to aim.') : 'Click a target within the violet ring. Right-click a card (or press Backspace) to take it back out.')}` : coarse ? `Hold the map to walk · tap to move or inspect · long-press a card to read it · Reach ${u.range}` : `Hold right-click to walk · Reach ${u.range} · Esc clears the spell · Space ends the turn`; }
  if (choosing) {
    const others = W.players.filter((p) => !p.placed && !p.left && p.pid !== ps.pid).map((p) => esc(p.name));
    const html = ps.placed
      ? `Waiting for ${others.join(', ') || 'your companions'} to choose where to begin.`
      : `<b>Choose where to begin.</b> ${coarse ? 'Tap' : 'Click'} open ground outside the red circles around foes. <button type="button" class="btn small ember" id="placeHere">Begin where I stand</button>`;
    if ($('qcost').dataset.place !== html) {
      $('qcost').dataset.place = html;
      $('qcost').innerHTML = html;
      document.getElementById('placeHere')?.addEventListener('click', () => { const me0 = myUnit(); if (me0) placeAt({ x: me0.x, y: me0.y }); });
    }
  } else $('qcost').dataset.place = '';
  document.body.classList.toggle('forging', spell.length > 0);
  $<HTMLButtonElement>('castBtn').disabled = !aimPt || !spell.length;
  const waiting = ps.endedTurn && canActNow(W, ps);
  $<HTMLButtonElement>('endBtn').disabled = !canActNow(W, ps) || ps.endedTurn || !u.alive;
  $('endBtn').textContent = waiting ? 'Waiting…' : 'End turn';
  const phaseTxt = W.phase === 'placing' ? (ps.placed ? 'Others are still choosing where to begin (you can act)' : 'Choose where to begin') : W.phase === 'enemies' || R.blocked ? 'The dark stirs…' : waiting ? 'Waiting for companions' : W.portal ? 'The portal is open' : `Turn ${W.turn}`;
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
  // Fullscreen on a computer: the side panel is tucked away, so creatures and spells explain themselves by the cursor.
  const ht = $('hoverTip');
  const showHt = !coarse && document.body.classList.contains('fs') && !$('codex').classList.contains('open') && (hoverId != null || hoverCard != null);
  ht.classList.toggle('on', showHt);
  if (showHt) { const html = $('info').innerHTML; if (ht.dataset.html !== html) { ht.dataset.html = html; ht.innerHTML = html; } placeHoverTip(); }
}

function refreshInfoInner() {
  if (!W) return;
  const info = $('info');
  if (hoverCard) {
    const c = CARDS[hoverCard];
    const ps = me()!;
    const used = ps.uses[hoverCard] ?? 0;
    info.innerHTML = `<div class="t">${esc(c.name)}</div><div class="k">${SCHOOL_NAME[c.school]} · ${c.mode === 'target' ? 'targeting card' : 'effect card'}</div><p>${esc(c.desc)}</p>
      <div class="k">Base cost ${baseCostText(ps, hoverCard)}${used ? ` · cast ${used}× this turn (+${used * 25}%, back to normal next turn)` : ''}${ps.cardLevels[hoverCard] ? ` · inscribed ${'+'.repeat(ps.cardLevels[hoverCard])} (+${ps.cardLevels[hoverCard] * 50}% power)` : ''}</div>`;
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
    <li>Target cards widen who is hit; effects strike everything targeted so far. While aiming you see the exact area, every body it touches, and the damage. Gold marks foes, red warns it hits you or a friend.</li><li>Hover a card while aiming to preview adding it.</li><li>Not sure what Lantern, Corruption or a material does? Hover or tap it. G opens the Field Guide.</li><li>Each card costs 25% more every time you cast it in the same turn. Costs reset at the start of every turn.</li>
    <li>Shove foes into lava, traps, walls and each other. Urns burst when broken.</li><li>Gold coin: a bounty worth ${RULES.BOUNTY_POINTS} upgrade points. Diamonds: elite affixes.</li>
    <li>Click a bookmark slot to save a spell; F1–F4 recall it. Alt-click pings.</li><li>Hover a foe to see its reach. WASD pans, C recenters.</li>
    <li>Your lantern burns each turn. Oil flasks and braziers refill it; in the dark, Shades hunt you.</li><li>In co-op a fallen companion is only down: stand beside them and press R.</li></ul>`;
}

let reachKey = '';
let reachCache: number[] = [];
function updateOverlays() {
  if (!W) return;
  const ps = me();
  const u = myUnit();
  const o = R.ov;
  o.hoverId = hoverId;
  R.reveal = W.phase === 'placing';
  o.place = null;
  if (placingNow() && u && mouse) {
    o.place = {
      x: mouse.x, y: mouse.y, ok: !placeProblem(W, u, mouse), clear: PLACE_CLEARANCE,
      foes: W.units.filter((v) => v.alive && v.faction === 'enemy' && !UNITS[v.type].prop).map((v) => ({ x: v.x, y: v.y })),
    };
  }
  const idle = !R.blocked && !!ps && canActNow(W, ps);
  o.castRing = null; o.aim = null; o.path = null; o.targets = new Set(); o.after = null; o.zones = []; o.first = null;
  // how far you can still walk (hidden while a spell is forged, to keep aiming clear)
  o.reach = null;
  o.spend = null;
  if (idle && ps && u && u.alive && !ps.endedTurn && !W.portal && u.downed === 0 && u.stam >= 1 && !spell.length) {
    const key = `${W.level}|${W.beat}|${Math.round(u.x)}|${Math.round(u.y)}|${Math.floor(u.stam)}`;
    if (key !== reachKey) { reachKey = key; reachCache = reachOutline(W, u, u.stam); }
    o.reach = reachCache;
  }
  if (ps && u && spell.length) {
    const c = W.duet === W.turn ? null : spellCost(ps, spell);
    if (c) o.spend = { id: u.id, amount: ps.cls === 'soulbinder' ? c.souls : c.mana };
  }
  let tag = '';
  let tagAt: Pt | null = null;
  if (idle && ps && u && u.alive && !ps.endedTurn && spell.length && coarse && !aimPt) o.castRing = { x: u.x, y: u.y, r: u.range };
  else if (idle && ps && u && u.alive && !ps.endedTurn && (mouse || (hoverCard && !coarse && lastMouse))) {
    const mouse = mouseNow()!;
    // Hovering a card in your hand previews the spell as if you had added it.
    const trial = hoverCard && !coarse && CARDS[hoverCard] && (ps.cls !== 'tarot' || ps.cards.includes(hoverCard)) ? [...spell, hoverCard] : spell;
    if (trial.length) {
      o.castRing = { x: u.x, y: u.y, r: u.range };
      const aim = coarse && aimPt ? aimPt : aimOf(mouse);
      const key = `${trial.join()}|${Math.round(aim.x / 4)}|${Math.round(aim.y / 4)}|${aim.exact}|${W.beat}`;
      if (key !== lastPreviewKey) { cachedPv = previewCast(W, ps.pid, trial, aim); lastPreviewKey = key; }
      const pv = cachedPv;
      if (pv) {
        o.targets = pv.targets;
        o.after = pv.after;
        o.zones = pv.zones;
        o.first = pv.first;
        o.aim = { from: u, to: aim, ok: pv.inRange && pv.affordable && !pv.selfDies };
        tag = aimSummary(pv, u, trial !== spell ? hoverCard! : null);
        tagAt = aim;
      }
    } else if (!hoverCard && !$('overlay').classList.contains('on') && (!coarse || walking)) {
      const key = `${Math.round(mouse.x / 8)}|${Math.round(mouse.y / 8)}|${W.beat}|${Math.round(u.x)}|${Math.round(u.y)}`;
      if (key !== lastPathKey) { const path = findPath(W, u, mouse, { lavaCost: 30 }); cachedPath = path && path.length ? [{ x: u.x, y: u.y }, ...path] : null; lastPathKey = key; }
      if (cachedPath) o.path = { pts: cachedPath, limit: W.portal ? RULES.CLEARED_STAMINA : u.stam };
    }
  }
  placeAimTag(tag, tagAt);
}

/** One line beside the aim point: what this spell hits, kills, and anything it costs your side. */
function aimSummary(pv: NonNullable<ReturnType<typeof previewCast>>, u: Unit, trying: string | null): string {
  if (!W) return '';
  let foes = 0, kills = 0, dmg = 0, heals = 0, bodies = 0;
  const hurtFriends: string[] = [];
  for (const v of W.units) {
    if (v.gone) continue;
    const a = pv.after.get(v.id);
    if (!a) continue;
    const targeted = pv.targets.has(v.id);
    if (!v.alive) { if (targeted) bodies++; continue; }
    const d = a.hp - v.hp;
    const friend = v.faction === 'player';
    if (friend && (d < 0 || !a.alive) && !UNITS[v.type].prop) hurtFriends.push(v === u ? 'you' : v.owner ? (W.players.find((p) => p.pid === v.owner)?.name ?? 'a friend') : unitName(v));
    if (!friend && !UNITS[v.type].prop) {
      if (targeted || d < 0 || !a.alive) foes++;
      if (d < 0) dmg -= d;
      if (!a.alive) kills++;
    }
    if (friend && d > 0) heals += d;
  }
  const bits: string[] = [];
  if (trying) bits.push(`<span class="with">+ ${esc(CARDS[trying].name)}:</span>`);
  if (!pv.inRange) bits.push('<span class="bad">Out of reach</span>');
  if (foes) bits.push(`<b>${foes}</b> foe${foes > 1 ? 's' : ''}`);
  if (dmg) bits.push(`<b>${dmg}</b> dmg`);
  if (kills) bits.push(`<b>${kills}</b> slain`);
  if (bodies) bits.push(`${bodies} bod${bodies > 1 ? 'ies' : 'y'}`);
  if (heals) bits.push(`<span class="good">+${heals} hp</span>`);
  if (hurtFriends.length) bits.push(`<span class="bad">hits ${esc([...new Set(hurtFriends)].join(', '))}</span>`);
  if (pv.selfDies) bits.push('<span class="bad">kills you</span>');
  else if (!pv.affordable) bits.push('<span class="bad">can\'t afford</span>');
  if (bits.length === (trying ? 1 : 0)) bits.push('<span class="dim">no one</span>');
  return bits.join(' · ');
}

let aimTagKey = '';
function placeAimTag(html: string, at: Pt | null) {
  const el = $('aimTag');
  if (!html || !at) { if (aimTagKey) { el.classList.remove('on'); aimTagKey = ''; } return; }
  const r = canvas.getBoundingClientRect();
  const stage = $('stage').getBoundingClientRect();
  const bp = R.worldToBuffer(at);
  const sx = (bp.x / BW) * r.width + r.left - stage.left;
  const sy = (bp.y / BH) * r.height + r.top - stage.top;
  if (html !== aimTagKey) { el.innerHTML = html; aimTagKey = html; }
  el.classList.add('on');
  // Centred just under the aim point, kept inside the stage; flips above near the bottom edge.
  const half = el.offsetWidth / 2 + 6;
  el.style.left = `${Math.round(Math.max(half, Math.min(stage.width - half, sx)))}px`;
  el.style.top = `${Math.round(sy + 26 + el.offsetHeight > stage.height - 8 ? sy - 30 - el.offsetHeight : sy + 26)}px`;
}

let frame = 0;
let threatKey = '';
function loop() {
  requestAnimationFrame(loop);
  frame++;
  if (!W && frame % 30 === 0) music.setScene('menu');
  const nowT = performance.now();
  const dt = Math.min(100, nowT - lastFrame);
  lastFrame = nowT;
  walkTick(dt);
  const pan = 9;
  if (keys.has('w') || keys.has('arrowup')) R.pan(0, -pan);
  if (keys.has('s') || keys.has('arrowdown')) R.pan(0, pan);
  if (keys.has('a') || keys.has('arrowleft')) R.pan(-pan, 0);
  if (keys.has('d') || keys.has('arrowright')) R.pan(pan, 0);
  // hold Q / E to keep turning the 3D camera
  if (R.mode3d && keys.has('q')) R.rotate(-2.2);
  if (R.mode3d && keys.has('e')) R.rotate(2.2);
  if (!W) return;
  if (!R.blocked) {
    const k = `${W.beat}|${W.phase}`;
    if (k !== threatKey && (W.phase === 'planning' || W.phase === 'placing')) {
      threatKey = k;
      const t = predictThreats(W);
      R.ov.threats = t.threats;
      R.ov.predicted = t.dmgTo;
      const u = myUnit();
      threatDmg = u ? t.dmgTo.get(u.id) ?? 0 : 0;
      dirty = true;
    }
    if (W.phase !== 'planning' && W.phase !== 'placing') { R.ov.threats = new Set(); R.ov.predicted = new Map(); threatDmg = 0; }
  } else if (R.ov.threats.size && !walking) { R.ov.threats = new Set(); R.ov.predicted = new Map(); threatDmg = 0; }
  if (frame % 2 === 0) updateOverlays();
  if (frame % 10 === 0) {
    music.setMood(biomeOf(W).music);
    music.setRegion(W.run.region);
    music.setScene(W.phase === 'camp' || W.phase === 'levelup' ? 'camp' : W.phase === 'dead' || W.phase === 'victory' ? 'menu' : 'dungeon');
    if (frame % 30 === 0) paintViewbar();
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
    const key = `C|${ps.event?.id}|${ps.event?.done}|${u.maxHp}|${u.maxStam}|${ps.bag.join()}|${Object.values(ps.gear).join()}|${JSON.stringify(ps.mats)}|${ps.oil}|${u.hp}|${ps.rested}|${ps.routeVote}|${ps.ready}|${ps.cards.join()}|${JSON.stringify(ps.cardLevels)}|${ps.buffs.join()}|${ps.pendingMutations}|${ps.corruption}|${W.players.map((p) => `${p.ready}${p.routeVote}`).join()}`;
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
    const ev = eventFor(ps);
    const sydney = ps.event?.id === 'sydney';
    const evHtml = ev ? `<div class="event ${sydney ? 'sydney' : ''}">${sydney ? `<img class="npc" alt="Sydney" src="${portrait(SYDNEY_LOOK as Look, 6)}">` : ''}<h3 class="sub">${esc(ev.name)}</h3>${sydney ? '<p class="say" id="sydSay"></p>' : `<p>${esc(ev.text)}</p>`}${sydney ? `<div class="talk"><span class="k">Ask her:</span> ${sydneyQuestions(W!, ps, u).map((q) => `<button type="button" class="btn small ${talk.asked.includes(q.id) ? 'asked' : ''}" data-ask="${q.id}">${esc(q.label)}</button>`).join('')}</div><p class="say talkline" id="sydTalk"></p>` : ''}${ps.event!.done ? (sydney ? '<p class="k say" id="sydRes"></p>' : `<p class="k">${esc(ps.event!.result ?? '')}</p>`) : `<div class="row">${ev.choices.map((c, i) => { const why = c.needs?.(ps, u); return `<button type="button" class="btn small" data-ev="${i}" ${why ? `disabled title="${esc(why)}"` : ''}>${esc(c.label)}</button>`; }).join('')}</div>`}</div>` : '';
    showOverlay(`<div class="panel wide"><h2>Bonfire camp</h2><p>${esc(regionName(W))} lies behind you. Health ${u.hp}/${u.maxHp} · Lantern ${Math.round(ps.oil)}/${ps.maxOil} · Corruption ${ps.corruption}${ps.buffs.length ? ` · Ready for the road: ${esc(ps.buffs.join(', '))}` : ''}</p>
      ${evHtml}${mutationHtml(ps)}${gearHtml(ps)}
      <div class="mats">${mats}</div>
      <h3 class="sub">Craft</h3><div class="ups">${recipes}</div>
      <h3 class="sub">Inscribe <small>Spell ink makes a card stronger (+50% power per mark), or teaches a new one.</small></h3>
      <div class="queue">${inscribe || '<span class="empty">Nothing left to inscribe.</span>'}<button type="button" class="btn small" id="learn" ${ink >= LEARN_COST ? '' : 'disabled'}>Learn a new spell <small>${LEARN_COST} ink</small></button></div>
      <div class="row"><button type="button" class="btn" id="rest" ${ps.rested || W.opts.curses?.includes('no_rest') ? 'disabled' : ''}>${ps.rested ? 'Rested' : 'Rest by the fire'}</button></div>
      <h3 class="sub">The road ahead</h3><div class="roads">${roads}</div>
      <div class="row">${ps.ready ? `<p>Waiting for ${esc(waitingFor(W).join(', '))}…</p>` : `<button type="button" class="btn ember" id="onward" ${ps.pendingMutations > 0 ? 'disabled' : ''}>Take the road</button>`}</div></div>`);
    if (sydney && ev) {
      const lineKey = `${W.level}|${ps.event!.grade}|${ps.event!.offer?.join()}`;
      const say = document.getElementById('sydSay');
      if (say) speak(say, ev.text, 'sydney', `intro|${lineKey}`);
      const res = document.getElementById('sydRes');
      if (res) speak(res, ps.event!.result ?? '', 'sydney', `result|${lineKey}`);
      // conversation: questions cost nothing; the last answer stays on screen across redraws
      if (talk.visit !== lineKey) talk = { visit: lineKey, asked: [], text: '', n: 0 };
      const line = document.getElementById('sydTalk');
      if (line && talk.text) speak(line, talk.text, 'sydney', `talk|${lineKey}|${talk.n}`);
      const qs = sydneyQuestions(W, ps, u);
      for (const b of document.querySelectorAll<HTMLButtonElement>('[data-ask]')) b.addEventListener('click', () => {
        const q = qs.find((x) => x.id === b.dataset.ask);
        if (!q || !line) return;
        talk.text = q.answer();
        talk.n++;
        if (!talk.asked.includes(q.id)) talk.asked.push(q.id);
        b.classList.add('asked');
        speak(line, talk.text, 'sydney', `talk|${lineKey}|${talk.n}`);
      });
    }
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
      ${endButtons('Rise again')}</div>`);
    bindEndButtons();
    return;
  }
  if (W.phase === 'victory') {
    const ash = bankRun(W, worldId);
    showOverlay(`<div class="panel"><h1>The Hollow King is unmade</h1><p>The Ashen Reach is cleansed: ${W.kills} foes and ${W.run.bossesSlain} lords slain over ${W.level} floors.</p>
      <p>You bring <b>${ash} Ash</b> home to the Sanctum (now ${meta.ash}).</p>
      ${endButtons('Descend anew')}</div>`);
    bindEndButtons();
    return;
  }
  if (W.phase === 'planning' || W.phase === 'placing') hideOverlay();
}

/** End-of-run buttons. In co-op, going again keeps the party together in the same room. */
function endButtons(again: string): string {
  if (T instanceof NetTransport) {
    return `<p class="k">Your companions stay with you. Going again brings everyone back to this game's lobby, and the host presses Begin.</p>
      <div class="row"><button type="button" class="btn ember" id="again">${esc(again)} together</button><button type="button" class="btn small" id="menu">Leave the party</button></div>`;
  }
  return `<div class="row"><button type="button" class="btn ember" id="again">${esc(again)}</button><button type="button" class="btn" id="sanct">Sanctum</button><button type="button" class="btn small" id="menu">Title</button></div>`;
}
function bindEndButtons() {
  const t = T;
  if (t instanceof NetTransport) {
    $('again').addEventListener('click', (e) => { (e.currentTarget as HTMLButtonElement).disabled = true; t.again(setupFor()); });
    $('menu').addEventListener('click', () => { leaveBoard(); t.close(); title(); });
    return;
  }
  $('again').addEventListener('click', () => startSolo());
  $('sanct').addEventListener('click', sanctum);
  $('menu').addEventListener('click', title);
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
  return `<div class="who"><img alt="" src="${portrait(meta.profile.look, 4)}"><div><b>${esc(p.name)}</b><br>${esc(whoLine(p))}${traits ? `<br><small>${esc(traits)}</small>` : ''}</div></div>`;
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
    <div class="opengames" id="openGames"></div>
    <div class="row"><button type="button" class="btn small" id="daily">Daily rite (${today}${dCurse ? `, ${esc(CURSES[dCurse].name)}` : ''})</button><button type="button" class="btn small" id="sanct">Sanctum · ${meta.ash} Ash</button><button type="button" class="btn small" id="codexB">Codex</button><button type="button" class="btn small" id="fbB">Feedback</button></div>
    <div class="row"><button type="button" class="btn small" id="stormB" title="A real-time bullet-hell campaign: five acts, five bosses, relics and the endless Abyss">Cinderstorm <small>(bullet hell)</small></button></div>
    ${curseHtml()}
    <ol class="howto">${coarse
      ? '<li>Hold a finger on the map to walk toward it, or tap the ground to walk there. Tap a body to inspect it. Drag with two fingers (or switch to Look) to pan.</li><li>Tap cards to forge a spell; they resolve left to right. Long-press a card to read it.</li><li>Tap the map to aim: the preview shows exactly what will happen. Then press Cast.</li><li>Foes outlined in red will strike you next turn. Codex (top right) holds the chronicle and help.</li>'
      : '<li>Hold right-click to walk toward the cursor; it spends stamina. WASD moves the camera.</li><li>Click cards (or press 1–0) to forge a spell. Cards resolve left to right: targeting cards widen who is hit, effect cards strike everything targeted so far.</li><li>Left-click within the violet ring to cast. The preview shows exactly what will happen.</li><li>Foes outlined in red will strike you next turn. Space ends your turn.</li>'}
    <li>Between regions you make camp: craft with what you gathered, inscribe your spells, and vote on the road ahead.</li></ol>
    <p class="k">Runs: ${meta.runs} · Victories: ${meta.wins} · Deepest: ${meta.bestDepth ? `depth ${roman(meta.bestDepth)}` : 'none yet'}${meta.dailyBest[today] ? ` · Today's rite: depth ${roman(meta.dailyBest[today])}` : ''}</p>
    <p class="k ver">Version ${BUILD.time ? new Date(BUILD.time * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'dev'} · ${esc(BUILD.sha.slice(0, 7))}</p></div>`);
  $('solo').addEventListener('click', () => startSolo());
  $('daily').addEventListener('click', () => startSolo(0, true));
  $('coop').addEventListener('click', coopScreen);
  $('char').addEventListener('click', () => openCreator($('overlay'), title));
  $('sanct').addEventListener('click', sanctum);
  $('codexB').addEventListener('click', codex);
  $('fbB').addEventListener('click', openFeedback);
  $('stormB').addEventListener('click', () => { music.start(); void startStorm(() => title()); });
  bindCurses(title);
  showOpenGames();
  checkWebBuild();
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

// ---------------------------------------------------------------- versions and the game board
interface AppBridge {
  state: () => Promise<{ status: string; progress: number; error?: string }>;
  checkNow: () => Promise<{ status: string; progress: number }>;
  restartToUpdate: () => Promise<void>;
  onUpdate: (fn: (s: { status: string; progress: number; error?: string }) => void) => void;
}
/** Present in the desktop app (see electron/preload.cjs); absent in a browser. */
const agApp = (window as unknown as { agApp?: AppBridge }).agApp;

/** What to tell a player whose game build differs from the host's. */
function versionAdvice(hostTime: number): string {
  if (hostTime && hostTime < BUILD.time) return 'The host is on an older version of the game. Their app updates itself when they restart it.';
  return agApp ? 'The host has a newer version. Yours is updating to match…' : 'The host has a newer version. This page will refresh itself in a moment.';
}
/** Behind the host: the app fetches the update; a browser page reloads to pick up the new build. */
function catchUpTo(hostTime: number) {
  if (hostTime && hostTime < BUILD.time) return;
  if (agApp) { agApp.checkNow().catch(() => {}); return; }
  if (location.protocol === 'https:' && !hostedHere) setTimeout(() => checkWebBuild(true), 4000);
}

let boardTimer = 0;
let boardPost: Omit<Posting, 't' | 'id'> | null = null;
/** Hosting from this app: keep a note on the board so friends see a Join button. */
function hostOnBoard(t: NetTransport, code: string, players: number) {
  if (location.port !== '8787') return; // only the app hosts its own server
  fetch('/tunnel').then((r) => r.json()).then((j: { url: string }) => {
    if (!j.url) { setTimeout(() => { if (T === t) hostOnBoard(t, code, players); }, 3000); return; }
    boardPost = { name: setupFor().name, url: j.url, code, build: BUILD.sha, status: t.world ? 'playing' : 'lobby', players };
    announce(boardPost);
    clearInterval(boardTimer);
    boardTimer = window.setInterval(() => {
      if (T !== t || !boardPost) { leaveBoard(); return; }
      boardPost.status = t.world ? 'playing' : 'lobby';
      announce(boardPost);
    }, HEARTBEAT_MS);
  }).catch(() => { /* no tunnel: friends can still use the link */ });
}
function leaveBoard() {
  clearInterval(boardTimer);
  if (boardPost) withdraw(boardPost);
  boardPost = null;
}
window.addEventListener('pagehide', leaveBoard);

/** Title screen: list friends' open games, refreshed while the title is showing. */
let boardPoll = 0;
function showOpenGames() {
  const el = document.getElementById('openGames');
  if (!el) return;
  openGames().then((games) => {
    if (!el.isConnected) return;
    el.innerHTML = games.length
      ? `<b>Friends playing now</b> ${games.map((g, i) => `<button type="button" class="btn ember small" data-jg="${i}">Join ${esc(g.name)}<small>${g.status === 'playing' ? 'in a run: you can join when it ends' : `${g.players} in the lobby`}</small></button>`).join('')}`
      : '';
    el.querySelectorAll<HTMLButtonElement>('[data-jg]').forEach((b) => {
      const g = games[Number(b.dataset.jg)];
      if (g.status === 'playing') b.disabled = true;
      b.addEventListener('click', () => joinPosted(g));
    });
  });
  clearTimeout(boardPoll);
  boardPoll = window.setTimeout(showOpenGames, 30000);
}
/** Join a friend's game straight from the board: no link, no code to type. */
function joinPosted(g: Posting) {
  coopScreen();
  $<HTMLInputElement>('url').value = g.url;
  $<HTMLInputElement>('code').value = g.code;
  $('join').click();
}

/** Browser page: if a newer build has been published, reload to it (only between runs). */
function checkWebBuild(force = false) {
  if (agApp || location.protocol !== 'https:' || hostedHere) return;
  if (W && !force) return;
  fetch('./build.json', { cache: 'no-store' }).then((r) => r.json()).then((b: { sha: string; time: number }) => {
    if (b.sha && b.sha !== BUILD.sha && b.time > BUILD.time) location.reload();
  }).catch(() => {});
}
setInterval(() => checkWebBuild(), 5 * 60 * 1000);

/** Desktop app: a small bar when an update is downloading or ready. Never interrupts a run. */
const updBar = document.createElement('div');
updBar.id = 'updBar';
document.body.appendChild(updBar);
let updState: { status: string; progress: number; error?: string } = { status: 'idle', progress: 0 };
function paintUpdate() {
  const inRun = !!W && W.phase !== 'dead' && W.phase !== 'victory';
  const s = updState;
  const failed = s.error && /did not install/.test(s.error) ? `<span class="warn">${esc(s.error)}</span> ` : '';
  const show = !inRun && (s.status === 'ready' || s.status === 'downloading' || !!failed);
  updBar.classList.toggle('on', show);
  if (!show) return;
  const html = s.status === 'ready'
    ? `${failed}A new version of Ashen Grimoire is ready. <button type="button" class="btn small ember" id="updGo">${failed ? 'Try again' : 'Restart to update'}</button> <span class="k">(or it installs next time you close the game)</span>`
    : s.status === 'downloading' ? `${failed}Downloading the new version… ${s.progress}%`
    : `${failed}<a href="https://github.com/Zimmdob/ashen-grimoire/releases/latest" target="_blank" rel="noopener">Get the latest version</a>`;
  if (updBar.dataset.html !== html) {
    updBar.dataset.html = html;
    updBar.innerHTML = html;
    document.getElementById('updGo')?.addEventListener('click', () => { updBar.innerHTML = 'Updating… a small window shows the progress, then the game opens again.'; agApp?.restartToUpdate(); });
  }
}
if (agApp) {
  agApp.onUpdate((s) => { updState = s; paintUpdate(); });
  agApp.state().then((s) => { updState = s; paintUpdate(); }).catch(() => {});
  setInterval(paintUpdate, 2000);
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
    t.onLobby = (code, players, isHost, opts, again) => {
      if (again) W = null;
      const curses = (opts.curses ?? []).map((c) => CURSES[c]?.name ?? c).join(', ');
      const stale = (q: LobbyPlayer) => !sameBuild(t.builds[q.pid], t.serverBuild);
      const mine = !sameBuild(BUILD.sha, t.serverBuild);
      showOverlay(`<div class="panel"><h2>Game ${esc(code)}</h2>${again ? '<p><b>The party rises again.</b> Same companions, a fresh descent.</p>' : ''}<p>${isHost ? 'Friends can join from their title screen (Join), or with the link and code below.' : 'You are in.'}${opts.daily ? " Today's daily rite." : ''}${curses ? ` Curses: ${esc(curses)}.` : ''}</p>
        ${mine ? `<p class="vwarn" id="verMsg">${versionAdvice(t.serverBuildTime)}</p>` : ''}
        <div class="plist">${players.map((q) => `<span class="who small"><img alt="" src="${portrait(q.look as Look, 3)}"> ${esc(q.name)} <small>${esc(whoLine(q))}</small>${stale(q) ? ' <b class="vtag">updating…</b>' : ''}</span>`).join('<br>')}</div>
        ${isHost ? '<p class="friend" id="friendLink2"></p>' : ''}
        <div class="row">${isHost ? `<button type="button" class="btn ember" id="go" ${players.some(stale) ? 'disabled title="Waiting for everyone to be on the same version"' : ''}>Begin</button>` : '<p>Waiting for the host to begin…</p>'}</div></div>`);
      showFriendLink(document.getElementById('friendLink2'));
      document.getElementById('go')?.addEventListener('click', () => t.startGame());
      if (mine) catchUpTo(t.serverBuildTime);
      if (isHost) hostOnBoard(t, code, players.length);
    };
    const daily = $<HTMLInputElement>('dly').checked;
    const url = toWs($<HTMLInputElement>('url').value);
    try { localStorage.setItem('ashen-server', $<HTMLInputElement>('url').value.trim()); } catch { /* storage unavailable */ }
    t.connect(url, host ? { t: 'host', setup: p, opts: runOptions(daily), build: BUILD.sha } : { t: 'join', code: $<HTMLInputElement>('code').value.trim().toUpperCase(), setup: p, build: BUILD.sha });
  };
  showFriendLink(document.getElementById('friendLink'));
  $('host').addEventListener('click', () => go(true));
  $('join').addEventListener('click', () => go(false));
  $('back').addEventListener('click', title);
}


// Exposed for automated playtests and modding consoles.
(window as unknown as { __ag: unknown }).__ag = { get world() { return W; }, get pid() { return T?.localPid; }, get busy() { return R.busy; }, send, renderer: R, music, placeProblem };

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
  try { if (localStorage.getItem('ashen-view') === '3d') R.set3d(true); } catch { /* storage unavailable */ }
  paint3dBtn();
  await document.fonts?.ready;
  title();
  loop();
  const params = new URLSearchParams(location.search);
  if (params.has('seed')) startSolo(Number(params.get('seed')));
})();

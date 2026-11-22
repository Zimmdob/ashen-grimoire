import type { Action, ActionResult, PlayerSetup, PlayerState, Pt, Unit, WizardClass, World, WorldOptions } from './types';
import { isLiquid, isWalkable, RULES, STARTING_CARDS, TILE, T_FLOOR } from './constants';
import { corrupt, curse, dist, emit, hasGear, hasMut, hasTrait, heal, log, startTick, sync } from './combat';
import { AFFIX_IDS, RUNE_IDS, RUNES } from './runes';
import { floorTiles, generateMap, placeTorches, tileAt } from './map';
import { findPath } from './path';
import { commitWalk, findFreeNear, freeAt, knockback, planWalk } from './physics';
import { rand, randInt, shuffle } from './rng';
import { CARD_IDS, CARDS, isUnit, type Zone } from './cards';
import { cantAfford, executeSpell, pickInitialTarget, spellCost } from './spell';
import { choirRevive, spawnShade, think } from './ai';
import { makeElder, makeUnit, UNITS } from './units';
import { BIOMES, makeRoute } from './biomes';
import { chooseEvent, EVENT_IDS, sydneyGrade, sydneyOffer } from './events';
import { cleanLook, emptyGear, emptyMats, GEAR, INSCRIBE_COST, LEARN_COST, MUTATIONS, ORIGINS, RECIPES, traitBudget, TRAITS } from './character';

// Turn state machine:
//   planning --(every standing player ends turn)--> allies --> enemies --> planning (next turn)
//   planning --(floor cleared, portal entered)--> levelup --(everyone ready)--> next floor, or camp after a region's last floor
//   camp --(route chosen, everyone ready)--> first floor of the next region
//   any --(no spellwright standing)--> dead;  the Hollow Throne cleared --> victory
// applyAction() is the only way to change a World, which is what makes lockstep co-op work.

export const playerUnit = (w: World, ps: PlayerState) => w.units.find((u) => u.id === ps.unitId)!;
const isStanding = (w: World, ps: PlayerState) => { const u = w.units.find((v) => v.id === ps.unitId); return !!u && u.alive && u.downed === 0; };
export const playerState = (w: World, pid: string) => w.players.find((p) => p.pid === pid);
export const biomeOf = (w: World) => BIOMES[w.run.region] ?? BIOMES.cellars;
export const hasCurse = (w: World, c: string) => !!w.opts.curses?.includes(c);
const FREE = { mana: 0, hp: 0, souls: 0, stam: 0, oil: 0 };
const cardPool = (w: World) => {
  const allowed = w.opts.pool?.length ? new Set(w.opts.pool) : null;
  return CARD_IDS.filter((c) => !CARDS[c].cls && (!allowed || allowed.has(c)));
};

/** Tarot Witch: shuffle the grimoire and draw this turn's hand. */
export function drawHand(w: World, ps: PlayerState) {
  if (ps.cls !== 'tarot') return;
  const n = 5 + (ps.runes.includes('font') ? 1 : 0);
  ps.hand = shuffle(w, [...ps.cards]).slice(0, n);
  const u = playerUnit(w, ps);
  if (u) emit(w, { k: 'float', id: u.id, text: 'the cards are drawn', color: 0xe0c0ff });
}

export function createWorld(seed: number, players: PlayerSetup[], opts: WorldOptions = {}): World {
  const w: World = {
    seed: seed | 0, level: 0, turn: 1, phase: 'planning', MW: 34, MH: 24, map: [], torches: [], units: [], pickups: [],
    players: [], portal: null, nextId: 1, events: [], beat: 0, kills: 0, wave: 1, waves: 1, pendingScrolls: [],
    run: { route: [], tier: 0, region: 'cellars', floor: 0, floorsInRegion: RULES.FLOORS_PER_REGION, bossesSlain: 0, bloodMoon: false },
    opts: { curses: [...(opts.curses ?? [])], pool: [...(opts.pool ?? [])], daily: !!opts.daily, placement: !!opts.placement },
    turnHits: {}, wells: [], keys: 0, bond: 0, duet: -1,
  };
  w.run.route = makeRoute(w);
  w.run.region = w.run.route[0][0];
  for (const p of players) w.players.push(makePlayer(w, p));
  startFloor(w);
  return w;
}

function makePlayer(w: World, p: PlayerSetup): PlayerState {
  const cls: WizardClass = (['spellwright', 'soulbinder', 'hexblade', 'lanternkeeper', 'tarot', 'cagebearer'] as WizardClass[]).includes(p.cls as WizardClass) ? p.cls! : 'spellwright';
  const origin = p.origin && ORIGINS[p.origin] ? p.origin : 'knight';
  let traits = (p.traits ?? []).filter((t, i, a) => TRAITS[t] && a.indexOf(t) === i);
  if (traitBudget(traits) < 0) traits = [];
  const u = makeUnit(w, 'wizard', 0, 0, 'player');
  u.owner = p.pid;
  const ps: PlayerState = {
    pid: p.pid, name: String(p.name || 'Spellwright').slice(0, 20), unitId: u.id, cards: [...STARTING_CARDS], uses: {},
    endedTurn: false, offer: [], picked: false, points: 0, ready: false, cls, runes: [], runeOffer: [], bountyPoints: 0,
    origin, traits, look: cleanLook(p.look), cardLevels: {},
    oil: RULES.MAX_OIL, maxOil: RULES.MAX_OIL, chill: 0, corruption: 0,
    mutations: [], mutationOffer: [], pendingMutations: 0, mats: emptyMats(), buffs: [], routeVote: -1, rested: false,
    hand: [], cage: [], maxCage: 0, gear: emptyGear(), bag: [], event: null, placed: true,
  };
  const oc = ORIGINS[origin].card;
  if (!ps.cards.includes(oc)) ps.cards.push(oc);
  // class
  if (cls === 'soulbinder') { u.mana = 0; u.maxMana = 0; u.regen = 0; u.souls = RULES.SOUL_STARTING; u.maxSouls = RULES.SOUL_MAX_STARTING; }
  if (cls === 'hexblade') { u.mana = 0; u.maxMana = 0; u.regen = 0; u.maxStam = 300; u.range = 140; u.maxHp += 30; }
  if (cls === 'lanternkeeper') { u.mana = 0; u.maxMana = 0; u.regen = 0; ps.maxOil = 220; }
  if (cls === 'cagebearer') { ps.maxCage = 3; u.regen = 45; ps.cards.push('unleash'); }
  // origin
  if (origin === 'knight') u.maxHp += 20;
  if (origin === 'cartographer') u.maxStam += 40;
  if (origin === 'noble') ps.corruption = 10;
  // traits and flaws
  if (traits.includes('tough')) u.maxHp += 15;
  if (traits.includes('brittle')) u.maxHp -= 15;
  if (traits.includes('swift')) u.maxStam += 30;
  if (traits.includes('dimlight')) ps.maxOil = Math.round(ps.maxOil * 0.7);
  u.hp = u.maxHp;
  u.stam = u.maxStam;
  ps.oil = ps.maxOil;
  w.units.push(u);
  return ps;
}

function rosterFor(w: World): string[] {
  const b = biomeOf(w);
  const L = w.level;
  const n = Math.max(1, w.players.filter((p) => !p.left).length);
  // Gentle opening (balance report: ghouls and spitters caused 80% of first-floor deaths), steeper after.
  let budget = Math.round((1.5 + L * 1.5) * (1 + 0.6 * (n - 1)));
  const out: string[] = [];
  const pool = L <= 1 ? b.foes.filter((f) => (UNITS[f].budget ?? 1) <= 1) : b.foes;
  while (budget > 0) {
    const type = pool[randInt(w, pool.length)];
    const cost = UNITS[type].budget ?? 1;
    if (cost > budget && budget < 3) { out.push(b.foes[0]); budget--; continue; }
    out.push(type);
    budget -= cost;
  }
  return out;
}

const lastFloor = (w: World) => w.run.floor >= w.run.floorsInRegion || w.run.region === 'throne';

/** Build the next floor of the current region. */
export function startFloor(w: World) {
  w.run.floor++;
  w.level++;
  const b = biomeOf(w);
  w.MW = 32 + Math.min(8, w.level);
  w.MH = 22 + Math.floor(w.level / 2);
  w.map = generateMap(w, b);
  w.torches = placeTorches(w);
  w.portal = null;
  w.turn = 1;
  w.pickups = [];
  w.turnHits = {};
  w.run.bloodMoon = w.run.tier >= 2 && w.run.region !== 'throne' && rand(w) < 0.1;
  const leftIds = new Set(w.players.filter((p) => p.left).map((p) => p.unitId));
  const wizards = w.units.filter((u) => u.owner && !leftIds.has(u.id));
  w.units = [];
  const floors = floorTiles(w);
  const start = floors[randInt(w, floors.length)];
  w.wells = b === BIOMES.starfall ? shuffle(w, floors.filter((p) => dist(p, start) > 250)).slice(0, 2) : [];
  for (const u of wizards) {
    const ps = w.players.find((p) => p.unitId === u.id)!;
    const p = findFreeNear(w, start.x, start.y, u.r, null, 240) ?? start;
    u.x = p.x;
    u.y = p.y;
    if (!u.alive) { u.alive = true; u.hp = Math.ceil(u.maxHp / 2); }
    else u.hp = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * RULES.HEAL_BETWEEN_LEVELS));
    u.downed = 0;
    u.poison = 0; u.frozen = 0; u.frail = 0; u.fetter = 0; u.bloat = 0; u.shield = 0; u.inLava = false; u.burn = 0; u.weak = 0; u.fortify = 0; u.wet = 0; u.lastTile = 0;
    u.faction = 'player';
    u.mana = Math.max(u.mana, u.maxMana);
    u.stam = u.maxStam;
    u.gone = false;
    floorUpkeep(w, ps, u);
    w.units.push(u);
  }
  for (const ps of w.players) { ps.endedTurn = false; ps.uses = {}; ps.offer = []; ps.picked = false; ps.ready = false; ps.chill = 0; drawHand(w, ps); }

  const far = shuffle(w, floors.filter((p) => dist(p, start) >= 380));
  const mid = shuffle(w, floors.filter((p) => dist(p, start) >= 150));
  const near = shuffle(w, floors.filter((p) => dist(p, start) >= 90));
  const takeFrom = (list: Pt[], r: number): Pt | null => {
    while (list.length) {
      const p = list.pop()!;
      const q = { x: p.x + (rand(w) - 0.5) * 10, y: p.y + (rand(w) - 0.5) * 10 };
      if (freeAt(w, q.x, q.y, r, null) && w.pickups.every((k) => dist(k, q) > 30)) return q;
    }
    return null;
  };
  w.wave = 1;
  w.waves = w.level >= 3 && !lastFloor(w) && rand(w) < 0.3 ? 2 : 1;
  let roster = rosterFor(w);
  if (lastFloor(w)) {
    // a lord's court: smaller in the first region so the first lord is a duel, not a siege
    roster = roster.slice(0, w.run.tier === 0 ? 1 : Math.max(2, Math.round(roster.length * 0.5)));
    if (b.boss === 'choir') roster = ['choir', 'choir', 'choir', 'choir', 'choir', ...roster.slice(0, 2)];
    else roster.unshift(b.boss);
    if (b.boss === 'king') roster = ['king', 'ghoul', 'ghoul', 'ghoul', 'xbow', 'xbow', 'priest', 'spitter'];
  }
  spawnWave(w, roster, (r) => takeFrom(far.length ? far : mid, r));
  const urnTypes = ['urn_fire', 'urn_ice', 'urn_plague'];
  for (let i = 0; i < 2 + Math.floor(w.level / 3); i++) {
    const p = takeFrom(mid, 9);
    if (p) w.units.push(makeUnit(w, urnTypes[randInt(w, 3)], p.x, p.y, 'enemy'));
  }
  // supplies: survival pickups, biome extras, traps, braziers and a chance of a chest
  const party = w.players.filter((p) => !p.left).length;
  const pk: Array<World['pickups'][number]['type']> = ['hp', 'mana', 'stam', 'oil', 'brazier', 'brazier', ...b.extraPickups];
  if (party > 1) pk.push('oil', 'hp');
  if (w.level > 3) pk.push('hp');
  if (w.level >= 2) pk.push('scroll');
  if (rand(w) < 0.5) pk.push('chest');
  // a sealed vault and its two keys, placed far apart: split up to find them
  w.keys = 0;
  if (w.level >= 2 && !lastFloor(w) && rand(w) < (party > 1 ? 0.5 : 0.3)) pk.push('vault', 'key', 'key');
  for (const ps of w.players) { if (hasTrait(ps, 'forager')) pk.push('hp'); if (ps.origin === 'cartographer') pk.push('oil'); if (ps.origin === 'hedgewitch') pk.push('herb'); }
  for (let i = 0; i < 2 + Math.floor(w.level / 3); i++) pk.push('trap');
  for (const type of pk) {
    const p = takeFrom(type === 'chest' || type === 'vault' || type === 'key' ? (far.length ? far : mid) : near, 8);
    if (p) w.pickups.push({ id: w.nextId++, type, x: p.x, y: p.y, used: false });
  }
  for (const ps of w.players) {
    const u = w.units.find((v) => v.id === ps.unitId);
    if (u && hasTrait(ps, 'haunted') && w.level >= 5) spawnShadeQuiet(w, u);
  }
  // With placement on, the depth opens with everyone choosing where to begin.
  const placing = !!w.opts.placement;
  for (const ps of w.players) ps.placed = !placing || !!ps.left;
  w.phase = placing ? 'placing' : 'planning';
  w.beat++;
  emit(w, { k: 'level', snap: structuredClone({ level: w.level, MW: w.MW, MH: w.MH, map: w.map, torches: w.torches, units: w.units, pickups: w.pickups, biome: w.run.region, wells: w.wells }) });
  log(w, `${b.name}: ${b.floors[Math.min(1, w.run.floor - 1)]}.${lastFloor(w) ? ' Something terrible waits here.' : ''}`);
  if (w.run.bloodMoon) log(w, 'A blood moon: every foe is an Elder, and every drop is doubled.');
}

function spawnShadeQuiet(w: World, u: Unit) { const before = w.events.length; spawnShade(w, u); w.events.length = before; }

/** Buffs and mutations that apply as a new floor begins. */
function floorUpkeep(w: World, ps: PlayerState, u: Unit) {
  const keep: string[] = [];
  for (const b of ps.buffs) {
    if (b === 'ward') u.shield += 30;
    else if (b === 'stam') u.stam += 30;
    else if (b === 'rimeward') { u.fortify = 1; u.shield += 20; }
    else if (b.startsWith('warm:')) { const n = Number(b.slice(5)); if (n > 1) keep.push(`warm:${n - 1}`); keep.push('warm'); }
  }
  // 'warm' lasts this floor only; the 'warm:n' counter carries the rest
  ps.buffs = keep;
  if (hasMut(ps, 'plates')) u.shield += 30;
  if (hasGear(ps, 'wardstone')) u.shield += 20;
}

/** Place a wave of foes: Elders, affixes, a bounty, curses and the Crown of Despair. */
function spawnWave(w: World, roster: string[], spot: (r: number) => Pt | null) {
  const foes: Unit[] = [];
  for (const type of roster) {
    const p = spot(UNITS[type].r);
    if (!p) continue;
    const u = makeUnit(w, type, p.x, p.y, 'enemy');
    w.units.push(u);
    foes.push(u);
  }
  const normal = foes.filter((u) => !UNITS[u.type].boss);
  if (w.run.bloodMoon) for (const u of normal) makeElder(u);
  else if (w.level >= 5) {
    // Elders from the third region on: one per wizard (the bot sweeps showed depth-3 Elders ended most runs)
    const n = Math.min(w.players.filter((p) => !p.left).length, normal.length);
    const cands = shuffle(w, normal.filter((u) => u.type !== 'ghoul'));
    for (const e of cands.slice(0, n)) { makeElder(e); addAffix(e, AFFIX_IDS[randInt(w, AFFIX_IDS.length)]); }
  }
  if (w.level >= 5) for (const u of normal) if (!u.mini && rand(w) < 0.06 * (w.level - 4)) addAffix(u, AFFIX_IDS[randInt(w, AFFIX_IDS.length)]);
  if (hasCurse(w, 'elder_blood')) for (const u of normal) if (!u.affixes.length) addAffix(u, AFFIX_IDS[randInt(w, AFFIX_IDS.length)]);
  const king = foes.find((u) => u.type === 'king');
  if (king) addAffix(king, 'stalwart');
  if (normal.length) normal[randInt(w, normal.length)].bounty = true;
  if (w.players.some((p) => p.runes.includes('despair'))) for (const u of foes) curse(w, u, 'frail', 1);
}

const addAffix = (u: Unit, a: string) => { if (!u.affixes.includes(a)) u.affixes.push(a); };

const standing = (w: World) => w.units.filter((u) => u.owner && u.alive && u.downed === 0);
const hostilesLeft = (w: World) => w.units.some((u) => u.alive && !u.gone && u.faction === 'enemy' && !UNITS[u.type].prop);

function offerMutations(w: World, ps: PlayerState) {
  if (ps.pendingMutations <= 0) { ps.mutationOffer = []; return; }
  ps.mutationOffer = shuffle(w, Object.keys(MUTATIONS).filter((m) => !ps.mutations.includes(m))).slice(0, 2);
}

function enterLevelUp(w: World) {
  w.phase = 'levelup';
  w.beat++;
  emit(w, { k: 'sfx', s: 'portal' });
  const pool = cardPool(w);
  for (const ps of w.players) {
    const n = 3 + (hasTrait(ps, 'lucky') ? 1 : 0) + (hasMut(ps, 'eyes') ? 1 : 0);
    ps.offer = shuffle(w, pool.filter((c) => !ps.cards.includes(c))).slice(0, n);
    ps.picked = ps.offer.length === 0;
    ps.points += RULES.STAT_POINTS_PER_LEVEL + ps.bountyPoints + (hasGear(ps, 'gravecoin') ? 30 : 0);
    ps.bountyPoints = 0;
    ps.runeOffer = shuffle(w, RUNE_IDS.filter((r) => !ps.runes.includes(r))).slice(0, RULES.RUNES_PER_LEVEL);
    ps.ready = false;
    offerMutations(w, ps);
  }
  emit(w, { k: 'phase', phase: 'levelup' });
  log(w, 'You step through the portal.');
}

function enterCamp(w: World) {
  w.phase = 'camp';
  w.beat++;
  // Sydney visits about one camp in four (never two camps running, and always once by the third camp).
  const last = w.run.sydneyAt ?? -9;
  const sydney = w.run.tier - last > 1 && (rand(w) < 0.25 || (last < 0 && w.run.tier >= 2));
  if (sydney) w.run.sydneyAt = w.run.tier;
  for (const ps of w.players) {
    ps.ready = false; ps.routeVote = -1; ps.rested = false;
    ps.event = sydney ? { id: 'sydney', done: false, offer: sydneyOffer(w, ps), grade: sydneyGrade(ps).grade } : { id: EVENT_IDS[randInt(w, EVENT_IDS.length)], done: false };
  }
  if (sydney) log(w, 'A lantern bobs out of the dark. Sydney, the Lantern-Wright, has found your camp.');
  emit(w, { k: 'phase', phase: 'camp' });
  log(w, 'You make camp. Cook, craft, rest, and choose the road ahead.');
}

/** Housekeeping after anything resolves: deaths, clearing, waves, the portal. */
function settle(w: World) {
  w.units = w.units.filter((u) => !u.gone || u.owner);
  const pool = cardPool(w);
  while (w.pendingScrolls.length) {
    const ps = playerState(w, w.pendingScrolls.shift()!);
    if (!ps) continue;
    const left = pool.filter((c) => !ps.cards.includes(c));
    if (!left.length) continue;
    const card = left[randInt(w, left.length)];
    ps.cards.push(card);
    emit(w, { k: 'float', id: ps.unitId, text: `Learned ${CARDS[card].name}`, color: 0xe0b040 });
    log(w, `${ps.name} reads a scroll and learns ${CARDS[card].name}.`);
  }
  if (w.phase === 'dead' || w.phase === 'victory' || w.phase === 'levelup' || w.phase === 'camp') return;
  if (!standing(w).length) {
    for (const u of w.units) if (u.owner && u.alive) { u.alive = false; u.downed = 0; emit(w, { k: 'die', id: u.id }); }
    w.phase = 'dead';
    w.beat++;
    emit(w, { k: 'phase', phase: 'dead' });
    log(w, 'The grimoire falls silent.');
    return;
  }
  if (!hostilesLeft(w) && w.wave < w.waves) {
    w.wave++;
    w.beat++;
    const lead = standing(w)[0];
    const spots = shuffle(w, floorTiles(w).filter((p) => dist(p, lead) >= 360));
    const r = rosterFor(w);
    const firstNew = w.nextId;
    spawnWave(w, r.slice(0, Math.max(2, Math.round(r.length * 0.6))), (rad) => {
      while (spots.length) { const p = spots.pop()!; if (freeAt(w, p.x, p.y, rad, null)) return p; }
      return null;
    });
    for (const u of w.units) if (u.id >= firstNew) { emit(w, { k: 'spawn', unit: { ...u, affixes: [...u.affixes] } }); emit(w, { k: 'fx', fx: 'column', x: u.x, y: u.y, color: 0xc060ff }); }
    emit(w, { k: 'sfx', s: 'portal' });
    log(w, 'Another wave claws up from below!');
    return;
  }
  if (!hostilesLeft(w)) {
    if (w.run.region === 'throne') {
      w.phase = 'victory';
      w.beat++;
      emit(w, { k: 'phase', phase: 'victory' });
      log(w, 'The Hollow King is unmade.');
      return;
    }
    if (!w.portal) {
      const lead = standing(w)[0];
      const p = findFreeNear(w, lead.x + 70, lead.y, 14, null, 200) ?? { x: lead.x, y: lead.y };
      w.portal = { x: p.x, y: p.y };
      w.beat++;
      emit(w, { k: 'portal', x: p.x, y: p.y });
      emit(w, { k: 'sfx', s: 'portal' });
      log(w, lastFloor(w) ? 'The region is cleared. Walk into the portal to make camp.' : 'The way down opens. Walk into the portal.');
      for (const u of standing(w)) { u.stam = RULES.CLEARED_STAMINA; sync(w, u); }
      for (const u of w.units) if (u.owner && u.downed > 0) { u.downed = 0; u.hp = Math.ceil(u.maxHp * 0.3); sync(w, u); }
      for (const ps of w.players) ps.endedTurn = false;
    }
    if (w.phase === 'planning' && standing(w).some((u) => dist(u, w.portal!) < 26)) enterLevelUp(w);
  }
}

function runSide(w: World, faction: 'player' | 'enemy') {
  const actors = w.units.filter((u) => u.alive && !u.gone && u.faction === faction && !u.owner && UNITS[u.type].ai !== 'none');
  if (!actors.length) return;
  w.beat++;
  for (const u of actors) startTick(w, u);
  w.beat++;
  const acts: Array<[Unit, () => void]> = [];
  for (const u of actors) {
    if (!u.alive) continue;
    if (u.frozen > 0) {
      u.frozen--;
      emit(w, { k: 'float', id: u.id, text: 'frozen', color: 0x9fe8ff });
      sync(w, u);
      continue;
    }
    u.mana = Math.min(u.maxMana, u.mana + u.regen);
    const act = think(w, u);
    if (u.fetter > 0) { u.fetter--; sync(w, u); }
    if (act) acts.push([u, act]);
  }
  for (const [u, act] of acts) {
    if (!u.alive || !standing(w).length) continue;
    w.beat++;
    act();
  }
}

/** End-of-enemy-turn world rules: the Choir, the Restless Dead, gravity wells. */
function worldRules(w: World) {
  w.beat++;
  choirRevive(w);
  if (hasCurse(w, 'restless_dead')) {
    for (const c of w.units) {
      if (c.alive || c.gone || c.owner || c.faction !== 'enemy' || UNITS[c.type].prop || UNITS[c.type].boss) continue;
      if (w.turn - c.diedTurn >= 3) { c.alive = true; c.hp = Math.ceil(c.maxHp / 2); emit(w, { k: 'fx', fx: 'column', x: c.x, y: c.y, color: 0xe9dcc0 }); sync(w, c); }
    }
  }
  for (const well of w.wells) {
    emit(w, { k: 'fx', fx: 'ring', x: well.x, y: well.y, r: 200, color: 0x8060ff });
    for (const v of w.units) {
      if (!v.alive || v.gone) continue;
      const d = dist(v, well);
      if (d <= 200 && d > 20) knockback(w, v, well.x - v.x, well.y - v.y, Math.min(30, d - 16), 0, false);
    }
  }
}

/** Start-of-turn survival for each spellwright: downed timer, lantern oil, Shades, cold, stamina. */
function playerUpkeep(w: World, ps: PlayerState) {
  const u = playerUnit(w, ps);
  if (!u || !u.alive) return;
  if (u.downed > 0) {
    u.downed--;
    if (u.downed === 0) { u.hp = 0; log(w, `${ps.name} slips away.`); u.alive = false; emit(w, { k: 'die', id: u.id }); }
    else emit(w, { k: 'float', id: u.id, text: `${u.downed} turns to revive`, color: 0xff4a3a });
    sync(w, u);
    return;
  }
  startTick(w, u);
  if (!u.alive || u.downed > 0) return;
  const b = biomeOf(w);
  // lantern oil
  const drain = RULES.OIL_PER_TURN * b.oilMul * (hasCurse(w, 'hungry_dark') ? 1.5 : 1);
  ps.oil = Math.max(0, Math.round((ps.oil - drain) * 10) / 10);
  const threshold = hasMut(ps, 'shadow') || hasCurse(w, 'thin_veil') ? ps.maxOil * 0.3 : 0;
  if (ps.oil <= threshold && w.units.filter((v) => v.type === 'shade' && v.alive).length < 3) {
    spawnShade(w, u);
    log(w, ps.oil <= 0 ? `${ps.name}'s lantern is dry. A Shade comes.` : 'Something stirs at the edge of the light.');
  }
  // cold
  const warm = ps.origin === 'ember' || hasGear(ps, 'furcloak') || ps.buffs.includes('warm') || u.burn > 0 || w.torches.some((t) => dist(t, u) < 150);
  if (b.cold || (u.wet > 0 && ps.origin !== 'sailor' && w.run.region === 'abbey')) ps.chill = warm ? 0 : ps.chill + 1;
  else ps.chill = 0;
  drawHand(w, ps);
  if (ps.cls !== 'soulbinder' && ps.cls !== 'hexblade' && ps.cls !== 'lanternkeeper') u.mana = Math.max(u.mana, Math.min(u.maxMana, u.mana + u.regen));
  let stam = u.frozen > 0 ? 0 : u.fetter > 0 ? u.maxStam / 2 : u.maxStam;
  if (ps.chill >= 3) { stam = Math.floor(stam / 2); emit(w, { k: 'float', id: u.id, text: 'numb with cold', color: 0xbff4ff }); }
  // a hexblade keeps unspent stamina up to double, since spells draw on it
  u.stam = ps.cls === 'hexblade' ? Math.max(stam, Math.min(u.stam, u.maxStam * 2)) : stam;
  // Once the depth is cleared you roam freely, however many turns pass before you take the portal.
  if (w.portal) u.stam = RULES.CLEARED_STAMINA;
  if (u.frozen > 0) { u.frozen--; emit(w, { k: 'float', id: u.id, text: 'frozen', color: 0x9fe8ff }); }
  if (u.fetter > 0) u.fetter--;
  sync(w, u);
}

function resolveWorldTurn(w: World) {
  w.phase = 'allies';
  runSide(w, 'player');
  settle(w);
  if (w.phase !== 'allies') return;
  w.phase = 'enemies';
  w.beat++;
  emit(w, { k: 'phase', phase: 'enemies' });
  runSide(w, 'enemy');
  worldRules(w);
  w.phase = 'planning';
  settle(w);
  if (w.phase !== 'planning') return;
  w.turn++;
  w.beat++;
  w.turnHits = {};
  // Card expense only lasts for the turn it was paid in.
  for (const ps of w.players) { ps.endedTurn = false; ps.uses = {}; if (!ps.left) playerUpkeep(w, ps); }
  // Bond: standing within 200 of a companion at the turn's end
  const up = standing(w);
  if (up.length >= 2 && up.some((a) => up.some((b) => a !== b && dist(a, b) <= 200))) w.bond = Math.min(100, w.bond + 4);
  emit(w, { k: 'phase', phase: 'planning' });
  settle(w);
}

const fail = (err: string): ActionResult => ({ ok: false, err });
const allDone = (w: World) => w.players.every((p) => p.endedTurn || p.left || !isStanding(w, p));

function applyMutation(u: Unit, m: string) {
  if (m === 'plates') u.maxStam = Math.max(60, u.maxStam - 20);
  if (m === 'eye') u.range += 60;
  if (m === 'shadow') u.maxStam += 60;
  if (m === 'hunger' || m === 'eyes') { u.maxHp -= 10; u.hp = Math.min(u.hp, u.maxHp); }
  if (m === 'stone') u.maxStam = Math.max(60, u.maxStam - 30);
}

function startNextRegion(w: World) {
  const votes = w.players.filter((p) => !p.left).map((p) => p.routeVote).filter((v) => v >= 0);
  const options = w.run.route[w.run.tier + 1] ?? ['throne'];
  const tally = options.map((_, i) => votes.filter((v) => v === i).length);
  const choice = Math.max(0, tally.indexOf(Math.max(...tally)));
  w.run.tier++;
  w.run.region = options[Math.min(choice, options.length - 1)];
  w.run.floor = 0;
  w.run.floorsInRegion = w.run.region === 'throne' ? 1 : RULES.FLOORS_PER_REGION;
  startFloor(w);
}

/** The one entry point for changing the world. Deterministic: same world + same action = same result. */
export function applyAction(w: World, a: Action): ActionResult {
  const ps = playerState(w, a.pid);
  if (!ps) return fail('Unknown player');
  const u = playerUnit(w, ps);
  if (!u) return fail('You have left this game');
  switch (a.t) {
    case 'move': {
      if (w.phase !== 'planning') return fail('Not your turn');
      if (!u.alive) return fail('You are dead');
      if (u.downed > 0) return fail('You are down. Your partner must revive you.');
      if (ps.endedTurn) return fail('You have ended your turn');
      if (w.portal && !hostilesLeft(w) && u.stam < RULES.CLEARED_STAMINA) { u.stam = RULES.CLEARED_STAMINA; sync(w, u); } // cleared: roam freely
      if (u.stam < 1) return fail('No stamina left');
      const path = findPath(w, u, { x: a.x, y: a.y }, { lavaCost: 30 });
      if (!path || !path.length) return fail('No path');
      const cap = typeof a.max === 'number' && Number.isFinite(a.max) ? Math.max(1, Math.min(a.max, 400)) : Infinity;
      const plan = planWalk(w, u, path, Math.min(u.stam, cap));
      if (plan.used <= 0) return fail('Blocked');
      if (u.stam < RULES.CLEARED_STAMINA) u.stam = Math.max(0, u.stam - plan.used);
      w.beat++;
      commitWalk(w, u, plan);
      sync(w, u);
      settle(w);
      return { ok: true };
    }
    case 'cast': {
      if (w.phase !== 'planning') return fail('Not your turn');
      if (!u.alive) return fail('You are dead');
      if (u.downed > 0) return fail('You are down. Your partner must revive you.');
      if (ps.endedTurn) return fail('You have ended your turn');
      if (!a.cards.length) return fail('Forge a spell first');
      if (a.cards.length > 12) return fail('Too many cards');
      if (a.cards.some((c) => !ps.cards.includes(c) || !CARDS[c])) return fail('You do not know that spell');
      if (dist(u, a) > u.range) return fail('Beyond your reach');
      if (ps.cls === 'tarot' && !fromHand(ps.hand, a.cards)) return fail('Those cards are not in your hand this turn');
      const cost = w.duet === w.turn ? FREE : spellCost(ps, a.cards);
      const why = cantAfford(ps, u, cost);
      if (why) return fail(why);
      u.mana -= cost.mana;
      u.souls -= cost.souls;
      if (u.stam < RULES.CLEARED_STAMINA) u.stam -= cost.stam;
      ps.oil = Math.max(0, ps.oil - cost.oil);
      u.hp -= cost.hp;
      for (const c of a.cards) ps.uses[c] = (ps.uses[c] ?? 0) + 1;
      if (ps.cls === 'tarot') for (const c of a.cards) ps.hand.splice(ps.hand.indexOf(c), 1);
      const blood = a.cards.filter((c) => CARDS[c].tags?.includes('blood')).length;
      if (blood) corrupt(w, ps, 5 * blood);
      if (a.cards.some((c) => CARDS[c].tags?.includes('fire'))) ps.chill = 0;
      w.beat++;
      sync(w, u);
      executeSpell(w, u, a.cards, { x: a.x, y: a.y });
      w.beat++;
      settle(w);
      return { ok: true };
    }
    case 'endTurn': {
      if (w.phase !== 'planning') return fail('Not your turn');
      if (ps.endedTurn) return fail('Already ended');
      if (!hostilesLeft(w)) return fail('Walk into the portal to go on');
      ps.endedTurn = true;
      if (allDone(w)) resolveWorldTurn(w);
      return { ok: true };
    }
    case 'revive': {
      if (w.phase !== 'planning') return fail('Not now');
      const tp = playerState(w, a.target);
      const t = tp && playerUnit(w, tp);
      if (!t || !t.alive || t.downed <= 0) return fail('Nobody to revive');
      if (!u.alive || u.downed > 0) return fail('You are down yourself');
      if (dist(u, t) > 70) return fail('Stand beside them to revive');
      if (u.stam < 50) return fail('Reviving takes 50 stamina');
      if (u.stam < RULES.CLEARED_STAMINA) u.stam -= 50;
      w.beat++;
      t.downed = 0;
      t.hp = Math.ceil(t.maxHp * 0.3);
      w.bond = Math.min(100, w.bond + 25);
      emit(w, { k: 'fx', fx: 'column', x: t.x, y: t.y, color: 0x7ee07e });
      emit(w, { k: 'heal', id: t.id, n: t.hp, hp: t.hp });
      corrupt(w, tp!, 10);
      sync(w, t);
      sync(w, u);
      log(w, `${ps.name} drags ${tp!.name} back to their feet.`);
      return { ok: true };
    }
    case 'pick': {
      if (w.phase !== 'levelup') return fail('Not now');
      if (ps.picked) return fail('Already chosen');
      if (a.card !== null && !ps.offer.includes(a.card)) return fail('Not offered');
      if (a.card) ps.cards.push(a.card);
      ps.picked = true;
      return { ok: true };
    }
    case 'upgrade': {
      if (w.phase !== 'levelup') return fail('Not now');
      if (ps.points < RULES.UPGRADE_COST) return fail('No points left');
      ps.points -= RULES.UPGRADE_COST;
      if (a.stat === 'vitality') { u.maxHp += 20; u.hp += 20; }
      if (a.stat === 'arcana') {
        if (ps.cls === 'soulbinder') u.maxSouls += 2;
        else if (ps.cls === 'lanternkeeper') { ps.maxOil += 30; ps.oil += 30; }
        else if (ps.cls === 'hexblade') u.maxStam += 40;
        else { u.maxMana += 20; u.regen += 20; u.mana += 20; }
      }
      if (a.stat === 'stride') u.maxStam += 50;
      if (a.stat === 'reach') u.range += 30;
      return { ok: true };
    }
    case 'mutate': {
      if (w.phase !== 'levelup' && w.phase !== 'camp') return fail('Not now');
      if (ps.pendingMutations <= 0 || !ps.mutationOffer.includes(a.mutation)) return fail('Not offered');
      ps.mutations.push(a.mutation);
      ps.pendingMutations--;
      applyMutation(u, a.mutation);
      offerMutations(w, ps);
      log(w, `${ps.name} mutates: ${MUTATIONS[a.mutation].name}.`);
      return { ok: true };
    }
    case 'ready': {
      if (w.phase === 'levelup') {
        if (!ps.picked) return fail('Choose a spell first');
        ps.ready = true;
        if (w.players.every((p) => p.ready || p.left)) {
          if (lastFloor(w)) enterCamp(w);
          else startFloor(w);
        }
        return { ok: true };
      }
      if (w.phase === 'camp') {
        if (ps.routeVote < 0) ps.routeVote = 0;
        ps.ready = true;
        if (w.players.every((p) => p.ready || p.left)) startNextRegion(w);
        return { ok: true };
      }
      return fail('Not now');
    }
    case 'rune': {
      if (w.phase !== 'levelup') return fail('Not now');
      const r = RUNES[a.rune];
      if (!r || !ps.runeOffer.includes(a.rune) || ps.runes.includes(a.rune)) return fail('That rune is not offered');
      if (ps.points < r.cost) return fail('Not enough points');
      ps.points -= r.cost;
      ps.runes.push(a.rune);
      if (a.rune === 'reach') u.range += 40;
      if (a.rune === 'font') { if (ps.cls === 'soulbinder') u.maxSouls += 1; else if (ps.cls === 'lanternkeeper') ps.maxOil += 20; else u.regen += 15; }
      return { ok: true };
    }
    case 'craft': {
      if (w.phase !== 'camp') return fail('Craft at camp');
      const r = RECIPES[a.recipe];
      if (!r) return fail('Unknown recipe');
      for (const [m, n] of Object.entries(r.cost)) if ((ps.mats[m as keyof typeof ps.mats] ?? 0) < (n ?? 0)) return fail('Not enough materials');
      for (const [m, n] of Object.entries(r.cost)) ps.mats[m as keyof typeof ps.mats] -= n ?? 0;
      switch (a.recipe) {
        case 'oil': ps.oil = Math.min(ps.maxOil, ps.oil + 50); break;
        case 'salve': heal(w, u, ps.origin === 'hedgewitch' ? 60 : 40); break;
        case 'charm': ps.buffs.push('ward'); break;
        case 'cloak': ps.buffs.push('warm:2'); break;
        case 'antidote': u.poison = 0; u.frail = 0; u.weak = 0; ps.corruption = Math.max(0, ps.corruption - 10); break;
        case 'rimeward': ps.buffs.push('rimeward'); break;
      }
      log(w, `${ps.name} makes ${r.name}.`);
      return { ok: true };
    }
    case 'inscribe': {
      if (w.phase !== 'camp') return fail('Inscribe at camp');
      if (a.card === '__learn') {
        if (ps.mats.ink < LEARN_COST) return fail('Not enough spell ink');
        const left = cardPool(w).filter((c) => !ps.cards.includes(c));
        if (!left.length) return fail('You know every spell');
        ps.mats.ink -= LEARN_COST;
        const c = left[randInt(w, left.length)];
        ps.cards.push(c);
        log(w, `${ps.name} inscribes a new page: ${CARDS[c].name}.`);
        return { ok: true };
      }
      if (!ps.cards.includes(a.card) || !CARDS[a.card] || CARDS[a.card].mode === 'mod') return fail('You cannot inscribe that');
      const lvl = ps.cardLevels[a.card] ?? 0;
      if (lvl >= 2) return fail('Already at full power');
      const cost = INSCRIBE_COST[lvl + 1];
      if (ps.mats.ink < cost) return fail('Not enough spell ink');
      ps.mats.ink -= cost;
      ps.cardLevels[a.card] = lvl + 1;
      log(w, `${ps.name} inscribes ${CARDS[a.card].name} ${lvl + 2 === 2 ? 'II' : 'III'}.`);
      return { ok: true };
    }
    case 'rest': {
      if (w.phase !== 'camp') return fail('Rest at camp');
      if (ps.rested) return fail('You have already rested');
      if (hasCurse(w, 'no_rest')) return fail('No rest in the deep (Curse of No Rest)');
      ps.rested = true;
      heal(w, u, Math.round(u.maxHp * (hasTrait(ps, 'sleeper') ? 0.5 : 0.35)));
      return { ok: true };
    }
    case 'place': {
      if (w.phase !== 'placing') return fail('Not now');
      if (ps.placed) return fail('You have already chosen');
      const why = placeProblem(w, u, a);
      if (why) return fail(why);
      const p = findFreeNear(w, a.x, a.y, u.r, u, 40)!;
      emit(w, { k: 'fx', fx: 'column', x: p.x, y: p.y, color: 0x9a6cff });
      u.x = p.x; u.y = p.y; u.lastTile = tileAt(w, p.x, p.y);
      w.beat++;
      emit(w, { k: 'teleport', id: u.id, x: u.x, y: u.y });
      emit(w, { k: 'sfx', s: 'portal' });
      ps.placed = true;
      if (w.players.every((q) => q.placed || q.left)) {
        w.phase = 'planning';
        w.beat++;
        emit(w, { k: 'phase', phase: 'planning' });
      }
      return { ok: true };
    }
    case 'event': {
      if (w.phase !== 'camp') return fail('Not now');
      const r = chooseEvent(w, ps, u, a.choice);
      return r.ok ? { ok: true } : fail(r.text);
    }
    case 'duet': {
      if (w.phase !== 'planning') return fail('Not now');
      if (w.bond < 100) return fail('Your Bond is not yet full');
      if (w.players.filter((p) => !p.left && playerUnit(w, p)?.alive && playerUnit(w, p).downed === 0).length < 2) return fail('A Duet needs two standing spellwrights');
      w.bond = 0;
      w.duet = w.turn;
      w.beat++;
      for (const p of w.players) { const pu = playerUnit(w, p); if (pu?.alive) emit(w, { k: 'fx', fx: 'column', x: pu.x, y: pu.y, color: 0xffd24a }); }
      emit(w, { k: 'sfx', s: 'portal' });
      log(w, `${ps.name} calls a Duet: this turn every spell is free and half again as strong.`);
      return { ok: true };
    }
    case 'equip': {
      if (w.phase !== 'levelup' && w.phase !== 'camp') return fail('Change gear at the portal or at camp');
      const g = GEAR[a.item];
      const i = ps.bag.indexOf(a.item);
      if (!g || i < 0) return fail('Not in your bag');
      ps.bag.splice(i, 1);
      const old = ps.gear[g.slot];
      if (old) { gearStats(ps, u, old, -1); ps.bag.push(old); }
      ps.gear[g.slot] = a.item;
      gearStats(ps, u, a.item, 1);
      return { ok: true };
    }
    case 'route': {
      if (w.phase !== 'camp') return fail('Not now');
      const options = w.run.route[w.run.tier + 1] ?? [];
      if (a.choice < 0 || a.choice >= options.length) return fail('No such road');
      ps.routeVote = a.choice;
      return { ok: true };
    }
    case 'ping': {
      if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return fail('Bad ping');
      w.beat++;
      emit(w, { k: 'ping', pid: a.pid, x: a.x, y: a.y });
      return { ok: true };
    }
    case 'leave': {
      ps.left = true;
      ps.ready = true;
      ps.picked = true;
      if (u.alive) { u.alive = false; u.hp = 0; u.downed = 0; w.beat++; emit(w, { k: 'die', id: u.id }); }
      log(w, `${ps.name} has left the depths.`);
      if (w.phase === 'planning' && w.players.some((p) => !p.left && isStanding(w, p)) && allDone(w)) resolveWorldTurn(w);
      if (w.phase === 'levelup' && w.players.every((p) => p.ready || p.left)) { if (lastFloor(w)) enterCamp(w); else startFloor(w); }
      else if (w.phase === 'camp' && w.players.every((p) => p.ready || p.left)) startNextRegion(w);
      settle(w);
      return { ok: true };
    }
  }
}

export interface CastPreview {
  targets: Set<number>;
  after: Map<number, { hp: number; alive: boolean; shield: number; x: number; y: number }>;
  /** Areas the spell sweeps: target shapes from target cards, then blast rings from effects. */
  zones: Zone[];
  /** Where the spell's first target lands: a body, or bare ground. */
  first: Pt & { id?: number };
  inRange: boolean;
  affordable: boolean;
  selfDies: boolean;
}

/** Runs the spell on a copy of the world. Because the sim is deterministic, this is exactly what will happen. */
/** Add (sign 1) or remove (sign -1) a find's flat stat bonuses. */
function gearStats(ps: PlayerState, u: Unit, id: string, sign: 1 | -1) {
  const s = GEAR[id]?.stat;
  if (!s) return;
  if (s.range) u.range += sign * s.range;
  if (s.stam) { u.maxStam += sign * s.stam; u.stam = Math.min(u.stam, u.maxStam); }
  if (s.hp) { u.maxHp += sign * s.hp; u.hp = Math.max(1, Math.min(u.maxHp, u.hp + (sign > 0 ? s.hp : 0))); }
  if (s.regen && u.maxMana > 0) u.regen += sign * s.regen;
  if (s.oil) { ps.maxOil += sign * s.oil; ps.oil = Math.min(ps.oil, ps.maxOil); }
}

/** Why a spellwright can't begin at (x, y), or null if they can. */
export function placeProblem(w: World, u: Unit, at: Pt): string | null {
  const t = tileAt(w, at.x, at.y);
  if (!isWalkable(t) || isLiquid(t)) return 'Choose open, dry ground';
  if (!findFreeNear(w, at.x, at.y, u.r, u, 40)) return 'No room there';
  for (const v of w.units) if (v.alive && v.faction === 'enemy' && !UNITS[v.type].prop && dist(v, at) < PLACE_CLEARANCE) return 'Too close to a foe';
  if (w.portal && dist(w.portal, at) < 40) return 'Not on the portal';
  return null;
}
export const PLACE_CLEARANCE = 140;

/** Every card of the spell can be paid from the hand (each drawn copy once). */
export function fromHand(hand: string[], cards: string[]): boolean {
  const left = [...hand];
  for (const c of cards) { const i = left.indexOf(c); if (i < 0) return false; left.splice(i, 1); }
  return true;
}

export function previewCast(w: World, pid: string, cards: string[], aim: Pt): CastPreview | null {
  const ps = playerState(w, pid);
  if (!ps || !cards.length) return null;
  const s: World = structuredClone({ ...w, events: [] });
  const sps = playerState(s, pid)!;
  const su = playerUnit(s, sps);
  const cost = w.duet === w.turn ? FREE : spellCost(sps, cards);
  su.mana -= cost.mana;
  su.souls -= cost.souls;
  su.stam -= cost.stam;
  sps.oil -= cost.oil;
  su.hp -= cost.hp;
  const zones: Zone[] = [];
  const first = pickInitialTarget(s, aim);
  const targets = executeSpell(s, su, cards, aim, zones);
  // Blasts, quakes and other area effects already announce their reach as rings; show those too.
  for (const e of s.events) {
    if (e.k !== 'fx' || e.fx !== 'ring' || (e.r ?? 0) < 40) continue;
    const r = e.r ?? 0;
    if (zones.some((z) => z.k === 'circle' && Math.abs(z.x - e.x) < 1 && Math.abs(z.y - e.y) < 1 && Math.abs(z.r - r) < 1)) continue;
    zones.push({ k: 'circle', x: e.x, y: e.y, r, tone: 'effect', color: e.color });
  }
  const after = new Map<number, { hp: number; alive: boolean; shield: number; x: number; y: number }>();
  for (const v of s.units) after.set(v.id, { hp: v.hp, alive: v.alive && !v.gone && v.downed === 0, shield: v.shield, x: v.x, y: v.y });
  const real = playerUnit(w, ps);
  return {
    targets: new Set(targets.filter((t): t is Unit => !(t as { pt?: boolean }).pt).map((t) => t.id)),
    after,
    zones,
    first: isUnit(first) ? { x: first.x, y: first.y, id: first.id } : { x: first.x, y: first.y },
    inRange: dist(real, aim) <= real.range,
    affordable: !cantAfford(ps, real, cost) && (ps.cls !== 'tarot' || fromHand(ps.hand, cards)),
    selfDies: !su.alive || su.downed > 0,
  };
}

export { TILE, T_FLOOR, ORIGINS };

/** Test hook: make camp now. */
export const enterCampForTest = (w: World) => enterCamp(w);

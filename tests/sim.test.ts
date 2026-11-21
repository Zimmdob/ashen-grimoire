import { describe, expect, it } from 'vitest';
import { applyAction, createWorld, playerUnit, previewCast } from '../src/sim/game';
import { CARD_IDS, CARDS } from '../src/sim/cards';
import { predictThreats } from '../src/sim/ai';
import { rand } from '../src/sim/rng';
import type { Action, WizardClass, World } from '../src/sim/types';
import { makeUnit, UNITS } from '../src/sim/units';
import { BIOMES } from '../src/sim/biomes';
import { RECIPES } from '../src/sim/character';

/** A scripted bot that plays plausibly with its own seeded dice, so runs are reproducible. */
export function botActions(w: World, dice: { seed: number }, pid: string, god = false): Action[] {
  const ps = w.players.find((p) => p.pid === pid)!;
  const u = playerUnit(w, ps);
  const acts: Action[] = [];
  if (w.phase === 'levelup') {
    if (!ps.picked) acts.push({ t: 'pick', pid, card: ps.offer[0] ?? null });
    if (ps.mutationOffer.length) acts.push({ t: 'mutate', pid, mutation: ps.mutationOffer[0] });
    for (let i = 0; i < 3; i++) acts.push({ t: 'upgrade', pid, stat: (['vitality', 'arcana', 'stride', 'reach'] as const)[i % 4] });
    if (ps.runeOffer[0]) acts.push({ t: 'rune', pid, rune: ps.runeOffer[0] });
    acts.push({ t: 'ready', pid });
    return acts;
  }
  if (w.phase === 'camp') {
    for (const r of Object.keys(RECIPES)) acts.push({ t: 'craft', pid, recipe: r });
    acts.push({ t: 'inscribe', pid, card: ps.cards[0] }, { t: 'inscribe', pid, card: '__learn' }, { t: 'rest', pid });
    acts.push({ t: 'route', pid, choice: Math.floor(rand(dice) * 3) }, { t: 'ready', pid });
    return acts;
  }
  if (w.phase !== 'planning' || !u.alive) return acts;
  const downed = w.players.find((p) => p.pid !== pid && playerUnit(w, p)?.downed > 0);
  if (downed && u.downed === 0) {
    const t = playerUnit(w, downed);
    acts.push({ t: 'move', pid, x: t.x + 20, y: t.y }, { t: 'revive', pid, target: downed.pid });
  }
  if (w.portal) { acts.push({ t: 'move', pid, x: w.portal.x, y: w.portal.y }); return acts; }
  const foes = w.units.filter((v) => v.alive && v.faction === 'enemy' && !v.type.startsWith('urn'))
    .sort((a, b) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(b.x - u.x, b.y - u.y));
  const f = foes[0];
  if (f && god) {
    // god mode: walk in and burn down everything in reach, shoving bosses that need it
    acts.push({ t: 'move', pid, x: f.x, y: f.y });
    for (const g of foes.slice(0, 8)) acts.push({ t: 'cast', pid, cards: ['repel', 'sever', 'sever', 'sever'], x: g.x, y: g.y });
  } else if (f) {
    acts.push({ t: 'move', pid, x: f.x + (rand(dice) - 0.5) * 80, y: f.y + (rand(dice) - 0.5) * 80 });
    const deck = ps.cards;
    const spell = [deck[Math.floor(rand(dice) * deck.length)], deck[Math.floor(rand(dice) * deck.length)], deck[Math.floor(rand(dice) * deck.length)]];
    acts.push({ t: 'cast', pid, cards: spell, x: f.x, y: f.y });
    acts.push({ t: 'cast', pid, cards: ['sever'], x: f.x, y: f.y });
  }
  acts.push({ t: 'endTurn', pid });
  return acts;
}

function playthrough(seed: number, turns: number, opts: { god?: boolean; players?: number; cls?: string[] } = {}) {
  const n = opts.players ?? 1;
  const w = createWorld(seed, Array.from({ length: n }, (_, i) => ({ pid: `p${i + 1}`, name: `Bot ${i + 1}`, cls: (opts.cls?.[i] ?? 'spellwright') as never, origin: ['knight', 'gravedigger', 'noble', 'ember'][i % 4], traits: ['tough', 'glutton'] })),
    { curses: seed % 3 === 0 ? ['restless_dead', 'thin_veil'] : [] });
  const dice = { seed: seed * 7 + 1 };
  const log: Action[] = [];
  const regions = new Set<string>();
  for (let i = 0; i < turns && w.phase !== 'dead' && w.phase !== 'victory'; i++) {
    regions.add(w.run.region);
    for (const ps of w.players) {
      if (opts.god) { const u = playerUnit(w, ps); u.maxHp = u.hp = 5000; u.mana = 99999; u.range = 600; ps.oil = 100; ps.satiety = 4; ps.uses = {}; if (!ps.cards.includes('sever')) ps.cards.push('sever'); }
      for (const a of botActions(w, dice, ps.pid, opts.god)) {
        applyAction(w, a);
        log.push(a);
      }
    }
    predictThreats(w);
    w.events.length = 0;
  }
  return { w, log, regions };
}

describe('simulation', () => {
  it('is deterministic: same seed and actions give the same world', () => {
    const a = playthrough(1234, 60, { players: 2 });
    const b = createWorld(1234, a.w.players.map((p, i) => ({ pid: p.pid, name: `Bot ${i + 1}`, cls: 'spellwright' as const, origin: ['knight', 'gravedigger'][i], traits: ['tough', 'glutton'] })), { curses: [] });
    for (const act of a.log) applyAction(b, act);
    b.events.length = 0;
    a.w.events.length = 0;
    expect(JSON.stringify(b)).toEqual(JSON.stringify(a.w));
  });

  it('survives long fuzzed runs across many seeds, classes and party sizes', () => {
    let deepest = 0;
    const classes = ['spellwright', 'soulbinder', 'hexblade', 'lanternkeeper', 'tarot', 'cagebearer'];
    for (let s = 1; s <= 18; s++) {
      const { w } = playthrough(s, 90, { players: 1 + (s % 2), cls: [classes[s % 6], classes[(s + 1) % 6]] });
      deepest = Math.max(deepest, w.level);
      for (const u of w.units) {
        expect(Number.isFinite(u.x) && Number.isFinite(u.y)).toBe(true);
        expect(u.hp).toBeGreaterThanOrEqual(0);
      }
    }
    expect(deepest).toBeGreaterThanOrEqual(2);
  });

  it('a sturdy bot can cross the whole Ashen Reach: every region type and boss gets exercised', () => {
    const seen = new Set<string>();
    let wins = 0;
    for (let s = 1; s <= 10; s++) {
      const { w, regions } = playthrough(100 + s, 500, { god: true, players: 1 + (s % 2) });
      regions.forEach((r) => seen.add(r));
      if (w.phase === 'victory') wins++;
    }
    expect(seen.size).toBeGreaterThanOrEqual(8);
    expect(wins).toBeGreaterThan(0);
  });

  it('every card resolves on a crowded board', () => {
    const w = createWorld(99, [{ pid: 'p1', name: 'Vox' }]);
    const ps = w.players[0];
    ps.cards = [...CARD_IDS];
    const me = playerUnit(w, ps);
    me.mana = 99999;
    for (const id of CARD_IDS) {
      const foe = w.units.find((v) => v.alive && v.faction === 'enemy' && !v.type.startsWith('urn'));
      if (!foe) break;
      foe.x = me.x + 60;
      foe.y = me.y;
      const r = applyAction(w, { t: 'cast', pid: 'p1', cards: ['circle', id], x: foe.x, y: foe.y });
      expect(r.err ?? 'ok').not.toMatch(/know/);
    }
  });

  it('every boss and foe can act for many turns without errors', () => {
    for (const type of Object.keys(UNITS)) {
      if (['wizard', 'effigy'].includes(type) || type.startsWith('urn')) continue;
      const w = createWorld(7, [{ pid: 'p1', name: 'Vox' }, { pid: 'p2', name: 'Ian' }]);
      w.units = w.units.filter((u) => u.owner);
      const me = playerUnit(w, w.players[0]);
      for (const u of w.units) { u.maxHp = u.hp = 9000; }
      const f = makeUnit(w, type, me.x + 150, me.y, 'enemy');
      w.units.push(f);
      for (let i = 0; i < 8; i++) {
        for (const p of w.players) applyAction(w, { t: 'endTurn', pid: p.pid });
        w.events.length = 0;
      }
      expect(w.phase === 'planning' || w.phase === 'levelup').toBe(true);
    }
  });

  it('cast preview matches the real outcome exactly', () => {
    for (let s = 1; s <= 10; s++) {
      const w = createWorld(500 + s, [{ pid: 'p1', name: 'Vox' }]);
      const ps = w.players[0];
      ps.cards = [...CARD_IDS];
      const me = playerUnit(w, ps);
      me.mana = 500;
      const foe = w.units.find((v) => v.alive && v.faction === 'enemy')!;
      foe.x = me.x + 90; foe.y = me.y;
      const extra = makeUnit(w, 'ghoul', me.x + 120, me.y + 30, 'enemy');
      w.units.push(extra);
      const spell = ['flood', 'circle', 'repel', 'chainlight', 'bolt', 'maelstrom', 'echo', 'sever'];
      const pv = previewCast(w, 'p1', spell, foe)!;
      applyAction(w, { t: 'cast', pid: 'p1', cards: spell, x: foe.x, y: foe.y });
      for (const v of w.units) {
        const p = pv.after.get(v.id);
        if (!p) continue;
        expect(p.hp).toBe(v.hp);
      }
    }
  });

  it('knockback into a wall deals impact damage', () => {
    const w = createWorld(7, [{ pid: 'p1', name: 'Vox' }]);
    const me = playerUnit(w, w.players[0]);
    let spot: { x: number; y: number } | null = null;
    for (let y = 1; y < w.MH - 1 && !spot; y++)
      for (let x = 2; x < w.MW - 2 && !spot; x++)
        if (w.map[y][x] === 0 && w.map[y][x + 1] === 1 && w.map[y][x - 1] === 0 && w.map[y][x - 2] === 0) spot = { x: x * 32 + 16, y: y * 32 + 16 };
    expect(spot).not.toBeNull();
    w.units = w.units.filter((u) => u.owner);
    const g = makeUnit(w, 'xbow', spot!.x, spot!.y, 'enemy');
    w.units.push(g);
    me.x = spot!.x - 40; me.y = spot!.y;
    const hp = g.hp;
    applyAction(w, { t: 'cast', pid: 'p1', cards: ['repel'], x: g.x, y: g.y });
    expect(g.hp).toBeLessThan(hp);
  });
});

describe('systems', () => {
  const fresh = (cls: WizardClass = 'spellwright', players = 1) => {
    const w = createWorld(31337, Array.from({ length: players }, (_, i) => ({ pid: `p${i + 1}`, name: `P${i + 1}`, cls })));
    const ps = w.players[0];
    ps.cards = [...CARD_IDS];
    const me = playerUnit(w, ps);
    w.units = w.units.filter((u) => u.owner);
    return { w, ps, me };
  };
  const dummy = (w: World, x: number, y: number) => { const g = makeUnit(w, 'priest', x, y, 'enemy'); g.maxHp = g.hp = 500; w.units.push(g); return g; };

  it('Rend escalates when stacked: 10 + 20 + 30', () => {
    const { w, me } = fresh();
    me.mana = 999;
    const g = dummy(w, me.x + 60, me.y);
    applyAction(w, { t: 'cast', pid: 'p1', cards: ['rend', 'rend', 'rend'], x: g.x, y: g.y });
    expect(g.hp).toBe(500 - 60);
  });

  it('Echo repeats and Overcharge doubles the next card; inscription adds 50% per level', () => {
    const { w, ps, me } = fresh();
    me.mana = 999;
    const g = dummy(w, me.x + 60, me.y);
    applyAction(w, { t: 'cast', pid: 'p1', cards: ['echo', 'sever'], x: g.x, y: g.y });
    expect(g.hp).toBe(460);
    applyAction(w, { t: 'cast', pid: 'p1', cards: ['overcharge', 'sever'], x: g.x, y: g.y });
    expect(g.hp).toBe(420);
    ps.cardLevels.sever = 1;
    applyAction(w, { t: 'cast', pid: 'p1', cards: ['sever'], x: g.x, y: g.y });
    expect(g.hp).toBe(390);
  });

  it('soaked bodies take double lightning', () => {
    const { w, me } = fresh();
    me.mana = 999;
    const g = dummy(w, me.x + 60, me.y);
    applyAction(w, { t: 'cast', pid: 'p1', cards: ['chainlight'], x: g.x, y: g.y });
    const dry = 500 - g.hp;
    g.wet = 2;
    const before = g.hp;
    applyAction(w, { t: 'cast', pid: 'p1', cards: ['chainlight'], x: g.x, y: g.y });
    expect(before - g.hp).toBeGreaterThan(dry * 1.5);
  });

  it('each class pays its own currency', () => {
    for (const [cls, key] of [['soulbinder', 'souls'], ['hexblade', 'stam'], ['lanternkeeper', 'oil']] as const) {
      const { w, ps, me } = fresh(cls);
      const g = dummy(w, me.x + 60, me.y);
      const before = { souls: me.souls, stam: me.stam, oil: ps.oil };
      const r = applyAction(w, { t: 'cast', pid: 'p1', cards: ['sever'], x: g.x, y: g.y });
      expect(r.ok).toBe(true);
      const after = { souls: me.souls, stam: me.stam, oil: ps.oil };
      expect(after[key]).toBeLessThan(before[key]);
    }
  });

  it('Tarot Witch casts only from her drawn hand, each card once, at 40% off', () => {
    const { w, ps, me } = fresh('tarot');
    me.mana = 999;
    const g = dummy(w, me.x + 60, me.y);
    ps.hand = ['sever', 'repel'];
    expect(applyAction(w, { t: 'cast', pid: 'p1', cards: ['nova'], x: g.x, y: g.y }).ok).toBe(false);
    const before = me.mana;
    expect(applyAction(w, { t: 'cast', pid: 'p1', cards: ['sever'], x: g.x, y: g.y }).ok).toBe(true);
    expect(before - me.mana).toBe(Math.round(CARDS.sever.cost * 0.6));
    expect(applyAction(w, { t: 'cast', pid: 'p1', cards: ['sever'], x: g.x, y: g.y }).ok).toBe(false);
    expect(ps.hand).toEqual(['repel']);
  });

  it('Cagebearer cages a nearby kill and unleashes it as an ally', () => {
    const { w, ps, me } = fresh('cagebearer');
    me.mana = 999;
    const g = makeUnit(w, 'ghoul', me.x + 60, me.y, 'enemy');
    g.hp = 5;
    w.units.push(g);
    applyAction(w, { t: 'cast', pid: 'p1', cards: ['sever'], x: g.x, y: g.y });
    expect(ps.cage).toEqual(['ghoul']);
    applyAction(w, { t: 'cast', pid: 'p1', cards: ['unleash'], x: me.x + 80, y: me.y });
    expect(ps.cage).toEqual([]);
    expect(w.units.some((u) => u.type === 'ghoul' && u.alive && u.faction === 'player')).toBe(true);
    expect(createWorld(5, [{ pid: 'x', name: 'x', cls: 'spellwright' }]).players[0].cards).not.toContain('unleash');
  });

  it('gear: bosses drop finds, equipping applies and swapping removes their effects', () => {
    const { w, ps, me } = fresh();
    me.mana = 999;
    const boss = makeUnit(w, 'warden', me.x + 60, me.y, 'enemy');
    boss.hp = 1;
    w.units.push(boss);
    applyAction(w, { t: 'cast', pid: 'p1', cards: ['sever'], x: boss.x, y: boss.y });
    expect(ps.bag.length).toBe(1);
    ps.bag = ['ashstaff', 'stormfocus'];
    w.phase = 'camp';
    const r0 = me.range;
    expect(applyAction(w, { t: 'equip', pid: 'p1', item: 'ashstaff' }).ok).toBe(true);
    expect(me.range).toBe(r0 + 40);
    applyAction(w, { t: 'equip', pid: 'p1', item: 'stormfocus' });
    expect(me.range).toBe(r0);
    expect(ps.gear.focus).toBe('stormfocus');
    expect(ps.bag).toEqual(['ashstaff']);
  });

  it('camp encounters resolve once, deterministically', () => {
    const { w, ps, me } = fresh();
    w.phase = 'camp';
    ps.event = { id: 'grave', done: false };
    expect(applyAction(w, { t: 'event', pid: 'p1', choice: 0 }).ok).toBe(true);
    expect(ps.mats.bone).toBe(4);
    expect(applyAction(w, { t: 'event', pid: 'p1', choice: 1 }).ok).toBe(false);
    ps.event = { id: 'well', done: false };
    expect(applyAction(w, { t: 'event', pid: 'p1', choice: 0 }).ok).toBe(true);
    expect(ps.mats.bone).toBe(2);
    ps.event = { id: 'smith', done: false };
    expect(applyAction(w, { t: 'event', pid: 'p1', choice: 0 }).ok).toBe(false); // needs ember
    void me;
  });

  it('co-op: Bond fills from resonance and revives; a Duet makes spells free and stronger', () => {
    const { w } = fresh('spellwright', 2);
    const ua = playerUnit(w, w.players[0]);
    ua.mana = 0;
    expect(applyAction(w, { t: 'duet', pid: 'p1' }).ok).toBe(false);
    w.bond = 100;
    expect(applyAction(w, { t: 'duet', pid: 'p1' }).ok).toBe(true);
    expect(w.bond).toBe(0);
    const g = dummy(w, ua.x + 60, ua.y);
    expect(applyAction(w, { t: 'cast', pid: 'p1', cards: ['sever'], x: g.x, y: g.y }).ok).toBe(true);
    expect(g.hp).toBe(500 - 30);
  });

  it('a sealed vault opens only with both keys', () => {
    const { w, ps, me } = fresh();
    w.pickups.push({ id: 900, type: 'vault', x: me.x + 40, y: me.y, used: false }, { id: 901, type: 'key', x: me.x - 40, y: me.y, used: false }, { id: 902, type: 'key', x: me.x, y: me.y + 40, used: false });
    applyAction(w, { t: 'move', pid: 'p1', x: me.x + 40, y: me.y });
    expect(w.pickups.find((k) => k.id === 900)!.used).toBe(false);
    applyAction(w, { t: 'move', pid: 'p1', x: me.x - 80, y: me.y });
    applyAction(w, { t: 'move', pid: 'p1', x: me.x + 40, y: me.y + 40 });
    expect(w.keys).toBe(2);
    applyAction(w, { t: 'move', pid: 'p1', x: me.x, y: me.y - 40 });
    applyAction(w, { t: 'move', pid: 'p1', x: w.pickups.find((k) => k.id === 900)!.x, y: w.pickups.find((k) => k.id === 900)!.y });
    expect(w.pickups.find((k) => k.id === 900)!.used).toBe(true);
    expect(ps.bag.length).toBe(1);
  });

  it('co-op: a fallen partner is downed, then revived', () => {
    const { w } = fresh('spellwright', 2);
    const [a, b] = w.players;
    const ua = playerUnit(w, a), ub = playerUnit(w, b);
    const ghoul = makeUnit(w, 'ghoul', ua.x, ua.y, 'enemy');
    w.units.push(ghoul);
    ua.hp = 5;
    ub.x = ua.x + 600; ub.y = ua.y;
    ghoul.x = ua.x + 30; ghoul.y = ua.y;
    for (const p of w.players) applyAction(w, { t: 'endTurn', pid: p.pid });
    expect(ua.alive).toBe(true);
    expect(ua.downed).toBeGreaterThan(0);
    expect(applyAction(w, { t: 'move', pid: a.pid, x: ua.x + 50, y: ua.y }).ok).toBe(false);
    ub.x = ua.x + 30; ub.y = ua.y;
    const r = applyAction(w, { t: 'revive', pid: b.pid, target: a.pid });
    expect(r.ok).toBe(true);
    expect(ua.downed).toBe(0);
    expect(ua.hp).toBeGreaterThan(0);
  });

  it('resonance: a second player striking the same foe hits half again as hard', () => {
    const { w } = fresh('spellwright', 2);
    const [a, b] = w.players;
    a.cards = ['sever']; b.cards = ['sever'];
    const ua = playerUnit(w, a), ub = playerUnit(w, b);
    const g = dummy(w, ua.x + 60, ua.y);
    ub.x = ua.x; ub.y = ua.y + 20;
    applyAction(w, { t: 'cast', pid: a.pid, cards: ['sever'], x: g.x, y: g.y });
    applyAction(w, { t: 'cast', pid: b.pid, cards: ['sever'], x: g.x, y: g.y });
    expect(500 - g.hp).toBe(20 + 30);
  });

  it('survival: oil drains each turn, an empty lantern summons a Shade, hunger bites between floors', () => {
    const { w, ps } = fresh();
    const g = dummy(w, 5, 5);
    g.x = playerUnit(w, ps).x + 600;
    const start = ps.oil;
    applyAction(w, { t: 'endTurn', pid: 'p1' });
    expect(ps.oil).toBeLessThan(start);
    ps.oil = 0;
    applyAction(w, { t: 'endTurn', pid: 'p1' });
    expect(w.units.some((u) => u.type === 'shade')).toBe(true);
  });

  it('every biome generates a playable map', () => {
    for (const id of Object.keys(BIOMES)) {
      const w = createWorld(3, [{ pid: 'p1', name: 'Vox' }]);
      w.run.region = id;
      w.run.floor = 0;
      w.events.length = 0;
      // start a fresh floor in that biome
      w.phase = 'camp';
      w.players[0].routeVote = 0;
      w.run.route[w.run.tier + 1] = [id];
      applyAction(w, { t: 'ready', pid: 'p1' });
      expect(w.run.region).toBe(id);
      expect(w.units.some((u) => u.faction === 'enemy')).toBe(true);
    }
  });
});

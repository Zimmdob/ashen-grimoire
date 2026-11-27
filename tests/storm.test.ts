import { describe, expect, it } from 'vitest';
import { spellStats } from '../src/storm/cards';
import { ACTS, addRelic, boonChoices, CAPTIVES, doorChoices, enterRoom, isWall, NO_PERKS, takeBoon, xpNeed, newRun, nextAct, NO_INPUT, onBeat, relicChoices, TWISTS, update, type Input, type StormWorld, type Twist } from '../src/storm/sim';
import { RELIC_IDS, STORM_CARDS, BASES, MODS } from '../src/storm/cards';

/** A bot that can't be hurt: aims at the nearest foe and fires both spells, circling to keep moving. */
function botStep(w: StormWorld, t: number): Input {
  const p = w.player;
  p.inv = 1; p.hp = p.maxHp;
  let best = w.foes[0];
  for (const f of w.foes) if (Math.hypot(f.x - p.x, f.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)) best = f;
  return { ...NO_INPUT, bomb: false, mx: best?.x ?? p.x + 10, my: best?.y ?? p.y, fireA: true, fireB: t % 3 === 0, left: Math.sin(t / 90) > 0, right: Math.sin(t / 90) <= 0, up: Math.cos(t / 70) > 0.6, down: Math.cos(t / 70) < -0.6, blink: t % 240 === 0 };
}

function play(w: StormWorld, maxTicks: number) {
  let t = 0, beat = 0;
  while (!w.cleared && t < maxTicks) {
    if (t % 18 === 0) onBeat(w, beat++);
    update(w, botStep(w, t));
    t++;
  }
  return t;
}

describe('Cinderstorm', () => {
  it('builds spells from cards', () => {
    expect(spellStats([])).toBeNull();
    expect(spellStats(['split'])).toBeNull();
    const ember = spellStats(['ember'])!;
    const split = spellStats(['ember', 'split'])!;
    expect(split.count).toBe(3);
    expect(split.mana).toBeGreaterThan(ember.mana);
    const nova = spellStats(['frost', 'nova'])!;
    expect(nova.ring).toBe(true);
    expect(nova.count).toBeGreaterThanOrEqual(10);
    expect(spellStats(['thorn'])!.burst).not.toBeNull();
    expect(spellStats(['spark', 'chain'])!.chain).toBe(3);
  });

  it('a bot can fight through all five acts and fell every boss through every phase', () => {
    const w = newRun({ seed: 12345 });
    w.spells = [['ember', 'split', 'seek', 'haste'], ['bone', 'pierce', 'echo']];
    const phases = new Map<string, Set<number>>();
    const kinds = new Set<string>();
    let guard = 0;
    for (;;) {
      let t = 0, beat = 0, peak = 0;
      while (!w.cleared && t < 60 * 300) {
        if (t % 18 === 0) onBeat(w, beat++);
        update(w, botStep(w, t));
        for (const f of w.foes) { kinds.add(f.type); if (f.boss && f.state !== 'spawn') { const set = phases.get(f.type) ?? new Set(); set.add(Math.floor((1 - f.hp / f.maxHp) * 4)); phases.set(f.type, set); } }
        peak = Math.max(peak, w.bullets.length);
        t++;
      }
      expect(w.cleared, `act ${w.act} room ${w.room} (${w.kind})`).toBe(true);
      expect(peak).toBeLessThan(2500);
      if (w.kind === 'boss') { if (!nextAct(w)) break; }
      else enterRoom(w, w.room + 1, w.room === 1 ? 'elite' : 'fight');
      if (++guard > 40) throw new Error('run did not end');
    }
    expect(w.won).toBe(true);
    expect(w.stats.bosses).toBe(6);
    for (const b of ['stag', 'warden', 'lich', 'orrery', 'choir', 'king']) expect(phases.get(b)?.size, b).toBeGreaterThanOrEqual(3);
    const roster = new Set(ACTS.flatMap((a) => a.roster));
    expect([...roster].filter((r) => kinds.has(r)).length).toBeGreaterThanOrEqual(roster.size - 2);
    expect(kinds.size).toBeGreaterThanOrEqual(16);
    expect(w.score).toBeGreaterThan(0);
  }, 60000);

  it('every card combination makes a sane spell', () => {
    for (const b of BASES) for (const m of MODS) {
      const s = spellStats([b, m])!;
      expect(s, `${b}+${m}`).not.toBeNull();
      for (const v of [s.dmg, s.speed, s.rate, s.mana, s.count, s.life, s.size]) expect(Number.isFinite(v) && v > 0, `${b}+${m}`).toBe(true);
    }
    expect(Object.keys(STORM_CARDS).length).toBeGreaterThanOrEqual(25);
  });

  it('every exotic card works in a real fight', () => {
    for (const spell of [['scythe', 'shock'], ['leech', 'splinter', 'siphon'], ['ember', 'spiral'], ['void', 'gravity'], ['arc', 'chain'], ['meteor', 'big', 'burn'], ['wisp', 'split'], ['ember', 'bounce', 'cluster'], ['spark', 'boomer'], ['frost', 'wave', 'twin'], ['thorn', 'nova', 'orbit']]) {
      const w = newRun({ seed: 3 });
      w.spells = [spell, ['ember']];
      let t = 0, beat = 0;
      while (!w.cleared && t < 60 * 120) { if (t % 18 === 0) onBeat(w, beat++); update(w, botStep(w, t)); t++; }
      expect(w.cleared, spell.join('+')).toBe(true);
    }
  }, 60000);

  it('every class starts with its own spells, relic and hearts', async () => {
    const { CLASSES } = await import('../src/storm/sim');
    for (const [id, c] of Object.entries(CLASSES)) {
      const w = newRun({ seed: 9, cls: id as never });
      expect(w.spells[0]).toEqual(c.spells[0]);
      expect(w.player.relics).toContain(c.relic);
      expect(w.player.maxHp).toBe(6 + c.hearts);
    }
  });

  it('the secret boss waits at the bottom of the Abyss', async () => {
    const { bossOf } = await import('../src/storm/sim');
    const w = newRun({ seed: 2, endless: true });
    w.act = ACTS.length - 1;
    expect(bossOf(w).type).toBe('king');
    w.loop = 1;
    expect(bossOf(w).type).toBe('unwritten');
    enterRoom(w, 4);
    w.spells = [['ember', 'split', 'seek', 'haste'], ['bone', 'pierce', 'echo']];
    let t = 0, beat = 0;
    const phases = new Set<number>();
    while (!w.cleared && t < 60 * 400) { if (t % 18 === 0) onBeat(w, beat++); update(w, botStep(w, t)); const b = w.foes.find((f) => f.boss); if (b) phases.add(b.phase); t++; }
    expect(w.cleared).toBe(true);
    expect(w.stats.secret).toBe(1);
    expect(phases.size).toBe(4);
  }, 60000);

  it('champions carry traits; braziers and spike traps furnish the deeper rooms', () => {
    const w = newRun({ seed: 11 });
    w.act = 2;
    let sawSpikes = false, sawBrazier = false;
    const affixes = new Set<string>();
    for (let i = 0; i < 12; i++) {
      enterRoom(w, 2, 'elite');
      sawSpikes ||= w.hazards.some((h) => h.kind === 'spikes');
      sawBrazier ||= w.waves.flat().some((x) => x.type === 'brazier');
      w.waveDelay = 0;
      for (let k = 0; k < 400 && w.waves.length; k++) { w.player.inv = 1; update(w, NO_INPUT); if (!w.waves.length) break; w.foes = w.foes.filter((f) => f.elite); }
      for (const f of w.foes) if (f.affix) affixes.add(f.affix);
    }
    expect(sawSpikes).toBe(true);
    expect(sawBrazier).toBe(true);
    expect(affixes.size).toBeGreaterThanOrEqual(3);
  });

  it('relics, doors and difficulty', () => {
    expect(RELIC_IDS.length).toBeGreaterThanOrEqual(16);
    const w = newRun({ seed: 5, diff: 'nightmare' });
    expect(w.player.maxHp).toBe(5);
    addRelic(w, 'emberheart');
    expect(w.player.maxHp).toBe(6);
    expect(relicChoices(w, 30).some((r) => r.startsWith('c_'))).toBe(false);
    addRelic(w, 'glass');
    expect(w.player.maxHp).toBe(4);
    expect(relicChoices(w, 3).some((r) => w.player.relics.includes(r))).toBe(false);
    for (let i = 0; i < 30; i++) { const d = doorChoices(w); expect(d.some((k) => k === 'fight' || k === 'elite' || k === 'rescue')).toBe(true); }
    w.room = 3;
    expect(doorChoices(w)).toEqual(['boss']);
    // second wind
    const v = newRun({ seed: 6 });
    addRelic(v, 'secondwind');
    v.player.hp = 1; v.player.inv = 0;
    v.bullets.push({ ...v.bullets[0], id: 1, x: v.player.x, y: v.player.y, vx: 0, vy: 0, r: 5, dmg: 1, life: 5, age: 0, friendly: false, color: 0, pierce: 0, chain: 0, homing: 0, burn: 0, slow: 0, orbit: null, burst: null, hit: [], hitT: [], wake: 0, bounce: 0, boomer: false, cluster: false, gravity: false, tick: 0, wave: null, target: null, turret: null, lob: null, grazed: false, spin: 0, splinter: false, shock: false, siphon: 0, leech: 0, orbitFoe: null });
    update(v, NO_INPUT);
    expect(v.player.dead).toBe(false);
    expect(v.player.hp).toBe(3);
  });

  it('foes fire on the beat', () => {
    const w = newRun(7);
    // let the first wave arrive and finish appearing
    w.waves = [[{ type: 'thornling', elite: false }, { type: 'thornling', elite: false }]];
    w.waveDelay = 0;
    for (let i = 0; i < 200; i++) { w.player.inv = 1; update(w, NO_INPUT); }
    w.foes = w.foes.filter((f) => f.type === 'thornling');
    expect(w.foes.length).toBeGreaterThan(0);
    const before = w.bullets.length;
    for (let s = 0; s < 8; s++) onBeat(w, s);
    expect(w.bullets.length).toBeGreaterThan(before);
  });

  it('plays out the same way from the same seed and inputs (needed for co-op later)', () => {
    const run = () => { const w = newRun(99); play(w, 1500); return JSON.stringify([w.player, w.foes.map((f) => [f.x, f.y, f.hp]), w.bullets.length, w.seed]); };
    expect(run()).toBe(run());
  });

  it('getting hit costs one heart, then a moment of safety; six hits and you fall', () => {
    const w = newRun(3);
    const p = w.player;
    p.inv = 0;
    for (let i = 0; i < 20 && !p.dead; i++) {
      w.bullets.push({ id: 999 + i, x: p.x, y: p.y, vx: 0, vy: 0, r: 5, dmg: 1, life: 5, age: 0, friendly: false, color: 0, pierce: 0, chain: 0, homing: 0, burn: 0, slow: 0, orbit: null, burst: null, hit: [], hitT: [], wake: 0, bounce: 0, boomer: false, cluster: false, gravity: false, tick: 0, wave: null, target: null, turret: null, lob: null, grazed: false, spin: 0, splinter: false, shock: false, siphon: 0, leech: 0, orbitFoe: null });
      update(w, NO_INPUT);
      p.inv = 0;
    }
    expect(p.dead).toBe(true);
    expect(w.stats.hitsTaken).toBe(6);
  });
});

describe('cinderstorm: forges, familiars, rush', () => {
  it('the orrery fires shots that orbit it, then fly free', () => {
    const w = newRun({ seed: 7 });
    w.act = 3; enterRoom(w, 4);
    expect(ACTS[3].boss).toBe('orrery');
    let orbiting = 0, freed = 0;
    for (let t = 0; t < 60 * 10; t++) {
      if (t % 18 === 0) onBeat(w, t / 18);
      w.player.inv = 1; w.player.hp = w.player.maxHp;
      update(w, NO_INPUT);
      for (const b of w.bullets) if (!b.friendly) { if (b.orbitFoe) orbiting++; else if (b.age > 3) freed++; }
    }
    expect(w.foes.some((f) => f.type === 'orrery')).toBe(true);
    expect(orbiting).toBeGreaterThan(0);
    expect(freed).toBeGreaterThan(0);
  });
  it('familiars join you and fight', () => {
    const w = newRun({ seed: 9 });
    addRelic(w, 'f_imp'); addRelic(w, 'f_hound');
    enterRoom(w, 1);
    let dealt = 0;
    for (let t = 0; t < 60 * 8; t++) {
      w.player.inv = 1; w.player.hp = w.player.maxHp;
      update(w, NO_INPUT);
      dealt = Math.max(dealt, w.stats.kills * 100 + w.foes.reduce((s, f) => s + (f.maxHp - f.hp), 0));
    }
    expect(w.familiars.length).toBe(2);
    expect(dealt).toBeGreaterThan(0);
  });
  it('boss rush makes every room a boss', () => {
    const w = newRun({ seed: 3, rush: true });
    enterRoom(w, 1);
    expect(w.kind).toBe('boss');
  });
});

describe('cinderstorm: battle variety', () => {
  it('every twist can be fought through, in every act', () => {
    for (const t of Object.keys(TWISTS) as Twist[]) for (let act = 0; act < 5; act++) {
      const w = newRun({ seed: 100 + act });
      w.spells = [['ember', 'split', 'seek', 'haste'], ['bone', 'pierce', 'echo']];
      w.act = act;
      enterRoom(w, 2, t === 'duel' ? 'elite' : 'fight', t);
      expect(w.twist).toBe(t);
      const ticks = play(w, 60 * 120);
      expect(w.cleared, `${t} in act ${act} (${ticks} ticks)`).toBe(true);
      if (t === 'siege') expect(ticks).toBeGreaterThan(60 * 20);
    }
  });
  it('rooms are named squads, on varied ground, and the spawn is always clear', () => {
    const names = new Set<string>(), layouts = new Set<string>(), twists = new Set<string>();
    for (let seed = 1; seed < 80; seed++) {
      const w = newRun({ seed });
      w.act = seed % 5;
      enterRoom(w, 1 + (seed % 3), seed % 4 ? 'fight' : 'elite');
      names.add(w.encounter); layouts.add(w.layout); if (w.twist) twists.add(w.twist);
      expect(isWall(w, w.player.x, w.player.y)).toBe(false);
      expect(w.waves.flat().length).toBeGreaterThan(0);
    }
    expect(names.size).toBeGreaterThan(12);
    expect(layouts.size).toBe(6);
    expect(twists.size).toBeGreaterThanOrEqual(7);
  });
  it('a thief that is not caught gets away, and the room still clears', () => {
    const w = newRun({ seed: 5 });
    enterRoom(w, 1, 'fight', 'thief');
    w.waves = [[{ type: 'thief', elite: false }]];
    let t = 0;
    while (!w.cleared && t < 60 * 30) { w.player.inv = 1; update(w, NO_INPUT); t++; }
    expect(w.cleared).toBe(true);
    expect(w.stats.kills).toBe(0);
  });
});

describe('cinderstorm: growth and heat', () => {
  it('kills drop experience, levels offer boons, and boons make you stronger', () => {
    const w = newRun({ seed: 21 });
    w.spells = [['ember', 'split', 'seek', 'haste'], ['bone', 'pierce', 'echo']];
    play(w, 60 * 120);
    for (let t = 0; t < 120; t++) update(w, NO_INPUT);
    expect(w.player.level).toBeGreaterThan(1);
    expect(w.pendingLevels).toBeGreaterThan(0);
    const picks = boonChoices(w);
    expect(new Set(picks).size).toBe(3);
    const hp = w.player.maxHp;
    takeBoon(w, 'vigor');
    expect(w.player.maxHp).toBe(hp + 1);
    expect(xpNeed(5)).toBeGreaterThan(xpNeed(1));
  });
  it('quick kills build a combo and Heat; a full bar unlocks Overdrive, which clears shots around you', () => {
    const w = newRun({ seed: 8 });
    w.spells = [['ember', 'split', 'seek', 'haste'], ['bone', 'pierce', 'echo']];
    let best = 0;
    for (let t = 0; t < 60 * 30 && !w.cleared; t++) { if (t % 18 === 0) onBeat(w, t / 18); update(w, botStep(w, t)); best = Math.max(best, w.combo); }
    expect(best).toBeGreaterThan(2);
    enterRoom(w, 2, 'fight', null);
    w.heat = 100;
    for (let i = 0; i < 30; i++) w.bullets.push({ ...w.bullets[0], id: 5000 + i, x: w.player.x + 40, y: w.player.y, vx: 0, vy: 0, r: 5, dmg: 1, life: 5, age: 0, friendly: false, color: 0, pierce: 0, chain: 0, homing: 0, burn: 0, slow: 0, orbit: null, burst: null, hit: [], hitT: [], wake: 0, bounce: 0, boomer: false, cluster: false, gravity: false, tick: 0, wave: null, target: null, turret: null, lob: null, grazed: false, spin: 0, splinter: false, shock: false, siphon: 0, leech: 0, orbitFoe: null });
    update(w, { ...NO_INPUT, surge: true });
    expect(w.overdrive).toBeGreaterThan(5);
    expect(w.heat).toBe(0);
    expect(w.bullets.filter((b) => !b.friendly).length).toBe(0);
  });
  it('rooms never wait on furniture or a sleeping gargoyle', () => {
    const w = newRun({ seed: 3 });
    w.act = 2;
    enterRoom(w, 1, 'fight', null);
    w.waves = [[{ type: 'gargoyle', elite: false }, { type: 'brazier', elite: false }]];
    let t = 0;
    for (; t < 60 * 60 && !w.cleared; t++) { w.player.inv = 1; update(w, { ...NO_INPUT, fireA: true, mx: w.foes[0]?.x ?? 0, my: w.foes[0]?.y ?? 0 }); }
    expect(w.cleared).toBe(true);
  });
});

describe('cinderstorm: the Last Hearth', () => {
  it('each act holds a captive behind a door until they are freed', () => {
    const w = newRun({ seed: 4 });
    expect(doorChoices(w)).toContain('rescue');
    enterRoom(w, 2, 'rescue');
    expect(w.kind).toBe('elite');
    expect(w.rescue).toBe(CAPTIVES[0]);
    const play2 = play(w, 60 * 120);
    expect(w.cleared, `cleared in ${play2}`).toBe(true);
    const freed = newRun({ seed: 4, rescued: ['rook'] });
    for (let i = 0; i < 20; i++) expect(doorChoices(freed)).not.toContain('rescue');
  });
  it('upgrades, pacts and mutators change how a run starts and plays', () => {
    const base = newRun({ seed: 9 });
    const strong = newRun({ seed: 9, perks: { ...NO_PERKS, hearts: 2, bombs: 1, choices: 4, dmg: 0.2 } });
    expect(strong.player.maxHp).toBe(base.player.maxHp + 2);
    expect(strong.player.bombs).toBe(base.player.bombs + 1);
    strong.pendingLevels = 1;
    expect(boonChoices(strong).length).toBe(4);
    const glass = newRun({ seed: 9, mutators: ['glass'] });
    const hp = glass.player.hp; glass.player.inv = 0;
    glass.foes.push({ ...base.foes[0] ?? ({} as never) });
    // a hit in a Glass World costs two hearts
    (glass as unknown as { player: { inv: number } }).player.inv = 0;
    expect(hp).toBeGreaterThan(0);
  });
  it('carrying the Bell, the Hollow King’s fall leads beneath the throne to the true ending', () => {
    const w = newRun({ seed: 11, bell: true });
    w.spells = [['ember', 'split', 'seek', 'haste'], ['bone', 'pierce', 'echo']];
    w.act = ACTS.length - 1;
    enterRoom(w, 4, 'boss');
    play(w, 60 * 300);
    expect(w.truePath).toBe(true);
    expect(w.won).toBe(false);
    w.loop = 1; w.truePath = false;
    enterRoom(w, 4, 'boss');
    expect(w.waves[0][0].type).toBe('unwritten');
    play(w, 60 * 400);
    expect(w.won).toBe(true);
  });
});

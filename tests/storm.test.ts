import { describe, expect, it } from 'vitest';
import { spellStats } from '../src/storm/cards';
import { ACTS, addRelic, doorChoices, enterRoom, newRun, nextAct, NO_INPUT, onBeat, relicChoices, update, type Input, type StormWorld } from '../src/storm/sim';
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
    expect(w.stats.bosses).toBe(5);
    for (const b of ['stag', 'warden', 'lich', 'choir', 'king']) expect(phases.get(b)?.size, b).toBeGreaterThanOrEqual(3);
    for (const a of ACTS) for (const r of a.roster) expect(kinds.has(r), r).toBe(true);
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
    for (const spell of [['void', 'gravity'], ['arc', 'chain'], ['meteor', 'big', 'burn'], ['wisp', 'split'], ['ember', 'bounce', 'cluster'], ['spark', 'boomer'], ['frost', 'wave', 'twin'], ['thorn', 'nova', 'orbit']]) {
      const w = newRun({ seed: 3 });
      w.spells = [spell, ['ember']];
      let t = 0, beat = 0;
      while (!w.cleared && t < 60 * 120) { if (t % 18 === 0) onBeat(w, beat++); update(w, botStep(w, t)); t++; }
      expect(w.cleared, spell.join('+')).toBe(true);
    }
  }, 60000);

  it('relics, doors and difficulty', () => {
    expect(RELIC_IDS.length).toBeGreaterThanOrEqual(16);
    const w = newRun({ seed: 5, diff: 'nightmare' });
    expect(w.player.maxHp).toBe(5);
    addRelic(w, 'emberheart');
    expect(w.player.maxHp).toBe(6);
    addRelic(w, 'glass');
    expect(w.player.maxHp).toBe(4);
    expect(relicChoices(w, 3).some((r) => w.player.relics.includes(r))).toBe(false);
    for (let i = 0; i < 30; i++) { const d = doorChoices(w); expect(d.some((k) => k === 'fight' || k === 'elite')).toBe(true); }
    w.room = 3;
    expect(doorChoices(w)).toEqual(['boss']);
    // second wind
    const v = newRun({ seed: 6 });
    addRelic(v, 'secondwind');
    v.player.hp = 1; v.player.inv = 0;
    v.bullets.push({ ...v.bullets[0], id: 1, x: v.player.x, y: v.player.y, vx: 0, vy: 0, r: 5, dmg: 1, life: 5, age: 0, friendly: false, color: 0, pierce: 0, chain: 0, homing: 0, burn: 0, slow: 0, orbit: null, burst: null, hit: [], hitT: [], wake: 0, bounce: 0, boomer: false, cluster: false, gravity: false, tick: 0, wave: null, target: null, turret: null, lob: null, grazed: false, spin: 0 });
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
      w.bullets.push({ id: 999 + i, x: p.x, y: p.y, vx: 0, vy: 0, r: 5, dmg: 1, life: 5, age: 0, friendly: false, color: 0, pierce: 0, chain: 0, homing: 0, burn: 0, slow: 0, orbit: null, burst: null, hit: [], hitT: [], wake: 0, bounce: 0, boomer: false, cluster: false, gravity: false, tick: 0, wave: null, target: null, turret: null, lob: null, grazed: false, spin: 0 });
      update(w, NO_INPUT);
      p.inv = 0;
    }
    expect(p.dead).toBe(true);
    expect(w.stats.hitsTaken).toBe(6);
  });
});

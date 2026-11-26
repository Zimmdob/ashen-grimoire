import { describe, expect, it } from 'vitest';
import { spellStats } from '../src/storm/cards';
import { enterRoom, newRun, NO_INPUT, onBeat, update, type Input, type StormWorld } from '../src/storm/sim';

/** A bot that can't be hurt: aims at the nearest foe and fires both spells, circling to keep moving. */
function botStep(w: StormWorld, t: number): Input {
  const p = w.player;
  p.inv = 1; p.hp = p.maxHp;
  let best = w.foes[0];
  for (const f of w.foes) if (Math.hypot(f.x - p.x, f.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y)) best = f;
  return { ...NO_INPUT, mx: best?.x ?? p.x + 10, my: best?.y ?? p.y, fireA: true, fireB: t % 3 === 0, left: Math.sin(t / 90) > 0, right: Math.sin(t / 90) <= 0, up: Math.cos(t / 70) > 0.6, down: Math.cos(t / 70) < -0.6, blink: t % 240 === 0 };
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

  it('a bot can clear every glade and fell the Stag, through all three of its phases', () => {
    const w = newRun(12345);
    w.spells = [['ember', 'split', 'seek', 'haste'], ['bone', 'pierce']];
    const phases = new Set<number>();
    for (let room = 1; room <= w.rooms; room++) {
      if (room > 1) enterRoom(w, room);
      let t = 0, beat = 0, peak = 0;
      while (!w.cleared && t < 60 * 240) {
        if (t % 18 === 0) onBeat(w, beat++);
        update(w, botStep(w, t));
        const boss = w.foes.find((f) => f.boss);
        if (boss && boss.state !== 'spawn') phases.add(boss.hp / boss.maxHp > 0.66 ? 1 : boss.hp / boss.maxHp > 0.33 ? 2 : 3);
        peak = Math.max(peak, w.bullets.length);
        t++;
      }
      expect(w.cleared, `room ${room}`).toBe(true);
      expect(peak).toBeLessThan(1500);
    }
    expect([...phases].sort()).toEqual([1, 2, 3]);
    expect(w.stats.kills).toBeGreaterThan(15);
  });

  it('foes fire on the beat', () => {
    const w = newRun(7);
    // let the first wave arrive and finish appearing
    for (let i = 0; i < 200; i++) update(w, NO_INPUT);
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
      w.bullets.push({ id: 999 + i, x: p.x, y: p.y, vx: 0, vy: 0, r: 5, dmg: 1, life: 5, friendly: false, color: 0, pierce: 0, chain: 0, homing: 0, burn: 0, slow: 0, orbit: null, burst: null, hit: [], wake: 0 });
      update(w, NO_INPUT);
      p.inv = 0;
    }
    expect(p.dead).toBe(true);
    expect(w.stats.hitsTaken).toBe(6);
  });
});

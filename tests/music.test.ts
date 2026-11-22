import { describe, expect, it } from 'vitest';
import { BIOMES, makeRoute } from '../src/sim/biomes';
import { TUNES } from '../src/ui/dreamtunes';
import { UNITS } from '../src/sim/units';

describe('regions and their music', () => {
  it('every region has its own dreamwave tune, and every tune is different', () => {
    for (const id of Object.keys(BIOMES)) expect(TUNES[id], id).toBeDefined();
    const names = Object.values(TUNES).map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('tunes get darker as the Reach gets deeper', () => {
    const avg = (band: number) => {
      const ids = Object.keys(BIOMES).filter((b) => b !== 'throne' && BIOMES[b].band === band);
      return ids.reduce((s, b) => s + TUNES[b].dark, 0) / ids.length;
    };
    expect(avg(0)).toBeLessThan(avg(1));
    expect(avg(1)).toBeLessThan(avg(2));
    expect(avg(2)).toBeLessThan(avg(3));
    expect(TUNES.throne.dark).toBe(1);
  });
  it('every run starts in a forest', () => {
    for (let seed = 1; seed < 40; seed++) {
      const first = makeRoute({ seed })[0][0];
      expect(BIOMES[first].style, first).toBe('forest');
    }
  });
  it('every region foe and boss exists', () => {
    for (const b of Object.values(BIOMES)) for (const f of [...b.foes, b.boss]) expect(UNITS[f], f).toBeDefined();
  });
});

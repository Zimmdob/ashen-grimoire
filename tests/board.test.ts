import { describe, expect, it } from 'vitest';
import { parseBoard } from '../src/net/board';
import { sameBuild } from '../src/version';

const ev = (p: object) => JSON.stringify({ event: 'message', message: JSON.stringify(p) });
const base = { name: 'Dean', url: 'https://some-words-here.trycloudflare.com', code: 'ABCD', build: 'abc', status: 'lobby', players: 1 };

describe('game board', () => {
  it('lists the newest open note per host, skipping my own, closed and stale games', () => {
    const now = 1_000_000_000;
    const text = [
      JSON.stringify({ event: 'open' }),
      ev({ ...base, id: 'dean', t: now - 60_000, code: 'OLDC' }),
      ev({ ...base, id: 'dean', t: now - 10_000 }),
      ev({ ...base, id: 'me', name: 'Me', t: now - 5_000 }),
      ev({ ...base, id: 'cj', name: 'CJ', t: now - 20_000, status: 'closed' }),
      ev({ ...base, id: 'old', name: 'Old', t: now - 60 * 60_000 }),
      ev({ ...base, id: 'bad', url: 'javascript:alert(1)', t: now }),
      'not json',
    ].join('\n');
    const games = parseBoard(text, 'me', now);
    expect(games.map((g) => [g.name, g.code])).toEqual([['Dean', 'ABCD']]);
  });
  it('treats dev builds as matching anything, and real builds only themselves', () => {
    expect(sameBuild('dev', 'abc')).toBe(true);
    expect(sameBuild('abc', 'abc')).toBe(true);
    expect(sameBuild('abc', 'abd')).toBe(false);
  });
});

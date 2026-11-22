// The game board: how friends find each other's games without passing links around.
// A host's app posts a tiny note ("Dean is hosting, here is how to reach the game, code ABCD") to a
// private channel on ntfy.sh, a free public message relay that needs no account. Everyone's title
// screen reads the channel and shows a Join button for each open game. The channel name is the only
// key: notes expire on their own, and a note holds nothing but a name, the game's address and code.

const CHANNEL = 'ashen-grimoire-q7r2v9k4m1x8w3';
const RELAY = 'https://ntfy.sh';
/** A game counts as open if its host checked in within this long. */
const FRESH_MS = 6 * 60 * 1000;
/** Hosts check in this often while their game is open. */
export const HEARTBEAT_MS = 2 * 60 * 1000;

export interface Posting {
  /** Stable per install, so a host replaces its own older notes. */
  id: string;
  name: string;
  /** The host's public game address (an https tunnel link). */
  url: string;
  code: string;
  build: string;
  status: 'lobby' | 'playing' | 'closed';
  players: number;
  t: number;
}

/** This install's id for the board. */
export function boardId(): string {
  try {
    let id = localStorage.getItem('ashen-board-id');
    if (!id) { id = Math.random().toString(36).slice(2, 12); localStorage.setItem('ashen-board-id', id); }
    return id;
  } catch { return 'anon'; }
}

/** Post (or refresh) this host's note. Fire and forget: the friend link still works if the relay is down. */
export async function announce(p: Omit<Posting, 't' | 'id'>): Promise<boolean> {
  const note: Posting = { ...p, id: boardId(), t: Date.now() };
  try {
    const r = await fetch(`${RELAY}/${CHANNEL}`, { method: 'POST', body: JSON.stringify(note) });
    return r.ok;
  } catch { return false; }
}

/** Mark this host's game closed, even while the page is closing. */
export function withdraw(p: Omit<Posting, 't' | 'id' | 'status'>) {
  const body = JSON.stringify({ ...p, id: boardId(), status: 'closed', t: Date.now() });
  try {
    if (navigator.sendBeacon?.(`${RELAY}/${CHANNEL}`, body)) return;
  } catch { /* fall through */ }
  fetch(`${RELAY}/${CHANNEL}`, { method: 'POST', body, keepalive: true }).catch(() => {});
}

/** Open games on the board, newest note per host, excluding this install's own. */
export async function openGames(now = Date.now()): Promise<Posting[]> {
  let text = '';
  try {
    const r = await fetch(`${RELAY}/${CHANNEL}/json?poll=1&since=15m`, { cache: 'no-store' });
    if (!r.ok) return [];
    text = await r.text();
  } catch { return []; }
  return parseBoard(text, boardId(), now);
}

/** Pure part of openGames, for tests: newline-separated relay events in, open games out. */
export function parseBoard(text: string, me: string, now: number): Posting[] {
  const latest = new Map<string, Posting>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let ev: { event?: string; message?: string };
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.event !== 'message' || !ev.message) continue;
    let p: Posting;
    try { p = JSON.parse(ev.message); } catch { continue; }
    if (!p || typeof p.id !== 'string' || typeof p.url !== 'string' || typeof p.code !== 'string' || typeof p.t !== 'number') continue;
    if (!/^https:\/\/[a-z0-9.-]+$/i.test(p.url.replace(/\/$/, '')) || !/^[A-Z]{4}$/.test(p.code)) continue;
    const prev = latest.get(p.id);
    if (!prev || p.t >= prev.t) latest.set(p.id, { ...p, name: String(p.name ?? 'Someone').slice(0, 24) });
  }
  return [...latest.values()].filter((p) => p.id !== me && p.status !== 'closed' && now - p.t < FRESH_MS).sort((a, b) => b.t - a.t);
}

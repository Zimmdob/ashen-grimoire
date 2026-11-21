import type { Action, PlayerSetup, WorldOptions } from '../sim/types';

// Lockstep protocol. The server never streams positions: it validates each action against its own copy
// of the deterministic simulation and broadcasts the action itself. Every client replays it locally.

export type ClientMsg =
  | { t: 'host'; setup: Omit<PlayerSetup, 'pid'>; opts?: WorldOptions }
  | { t: 'join'; code: string; setup: Omit<PlayerSetup, 'pid'> }
  | { t: 'start' }
  | { t: 'action'; a: Action }
  /** After the party falls (or wins): reopen the same room's lobby for a new descent together. */
  | { t: 'again'; setup: Omit<PlayerSetup, 'pid'> };

export type LobbyPlayer = PlayerSetup;

export type ServerMsg =
  | { t: 'lobby'; code: string; you: string; host: string; players: LobbyPlayer[]; opts: WorldOptions; again?: boolean }
  | { t: 'start'; seed: number; players: LobbyPlayer[]; opts: WorldOptions; log: Action[] }
  | { t: 'action'; seq: number; a: Action }
  | { t: 'reject'; err: string; at?: Action['t'] }
  | { t: 'left'; pid: string }
  | { t: 'error'; err: string };

/** When the game is served by the co-op server itself, connect back to that same host. */
export const DEFAULT_SERVER = (() => {
  if (typeof location === 'undefined') return 'ws://localhost:8787';
  if (location.protocol === 'http:' && location.port === '8787') return `ws://${location.host}`;
  // served through a public tunnel to the co-op server
  if (location.protocol === 'https:' && /\.(trycloudflare\.com|ngrok-free\.app|ngrok\.io)$/.test(location.hostname)) return `wss://${location.host}`;
  return 'ws://localhost:8787';
})();

/** The same seed for everyone on a given UTC day. */
export function dailySeed(d = new Date()): number {
  const n = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  return Math.imul(n, 2654435761) >>> 0;
}

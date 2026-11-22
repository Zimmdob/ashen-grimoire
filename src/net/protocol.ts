import type { Action, PlayerSetup, WorldOptions } from '../sim/types';

// Lockstep protocol. The server never streams positions: it validates each action against its own copy
// of the deterministic simulation and broadcasts the action itself. Every client replays it locally.

export type ClientMsg =
  | { t: 'host'; setup: Omit<PlayerSetup, 'pid'>; opts?: WorldOptions; build?: string }
  | { t: 'join'; code: string; setup: Omit<PlayerSetup, 'pid'>; build?: string }
  | { t: 'start' }
  | { t: 'action'; a: Action }
  /** After the party falls (or wins): reopen the same room's lobby for a new descent together. */
  | { t: 'again'; setup: Omit<PlayerSetup, 'pid'> }
  /** Back after a dropped connection (sleep, Wi-Fi blip): take the same seat again. */
  | { t: 'rejoin'; code: string; pid: string; token: string; build?: string }
  /** Keep-alive, so idle links (and the friend tunnel) never time out. */
  | { t: 'ping' };

export type LobbyPlayer = PlayerSetup;

export type ServerMsg =
  /** `build` is the server's game build; `builds` is each player's, so the lobby can flag anyone out of date. */
  | { t: 'lobby'; code: string; you: string; host: string; players: LobbyPlayer[]; opts: WorldOptions; again?: boolean; build?: string; buildTime?: number; builds?: Record<string, string>; /** Your secret for taking your seat back after a dropped connection. */ token?: string }
  | { t: 'start'; seed: number; players: LobbyPlayer[]; opts: WorldOptions; log: Action[] }
  | { t: 'action'; seq: number; a: Action }
  | { t: 'reject'; err: string; at?: Action['t'] }
  | { t: 'left'; pid: string }
  /** A companion's connection dropped; their seat is held while they come back. */
  | { t: 'away'; pid: string; name: string; graceSec: number }
  | { t: 'back'; pid: string; name: string }
  | { t: 'pong' }
  | { t: 'error'; err: string };

/** How long a dropped player's seat is held before they count as having left. */
export const REJOIN_GRACE_MS = 10 * 60 * 1000;

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

import type { Action, ActionResult, PlayerSetup, World, WorldOptions } from '../sim/types';
import { applyAction, createWorld } from '../sim/game';
import type { ClientMsg, LobbyPlayer, ServerMsg } from './protocol';

export interface Transport {
  world: World | null;
  localPid: string;
  send(a: Action): void;
  onStart: (w: World) => void;
  onApplied: (a: Action, r: ActionResult) => void;
  onError: (msg: string) => void;
}

/** Single player: actions apply straight to the local world. */
export class LocalTransport implements Transport {
  world: World | null = null;
  localPid = 'local';
  onStart: (w: World) => void = () => {};
  onApplied: (a: Action, r: ActionResult) => void = () => {};
  onError: (msg: string) => void = () => {};
  start(seed: number, setup: Omit<PlayerSetup, 'pid'>, opts: WorldOptions = {}) {
    this.world = createWorld(seed, [{ ...setup, pid: this.localPid }], opts);
    this.onStart(this.world);
  }
  send(a: Action) {
    if (!this.world) return;
    this.onApplied(a, applyAction(this.world, a));
  }
}

/** Co-op: actions go to the server; we only apply what it echoes back, in its order. */
export class NetTransport implements Transport {
  world: World | null = null;
  localPid = '';
  private ws: WebSocket | null = null;
  onStart: (w: World) => void = () => {};
  onApplied: (a: Action, r: ActionResult) => void = () => {};
  onError: (msg: string) => void = () => {};
  onLobby: (code: string, players: LobbyPlayer[], isHost: boolean, opts: WorldOptions, again: boolean) => void = () => {};
  /** The host's game build and each player's, from the latest lobby message. */
  serverBuild = '';
  serverBuildTime = 0;
  builds: Record<string, string> = {};
  private closing = false;

  connect(url: string, first: ClientMsg) {
    try { this.ws = new WebSocket(url); } catch { this.onError('Could not reach the server.'); return; }
    this.ws.onopen = () => this.raw(first);
    this.ws.onerror = () => this.onError('Could not reach the server. Is it running? (npm run server)');
    this.ws.onclose = () => { if (this.world && !this.closing) this.onError('Disconnected from the server.'); };
    this.ws.onmessage = (ev) => this.recv(JSON.parse(String(ev.data)) as ServerMsg);
  }
  private raw(m: ClientMsg) { this.ws?.send(JSON.stringify(m)); }
  startGame() { this.raw({ t: 'start' }); }
  /** Back to this room's lobby with the same party for another descent. */
  again(setup: Omit<PlayerSetup, 'pid'>) { this.raw({ t: 'again', setup }); }
  /** Leave the room for good (title screen, solo run): the server lets the others know. */
  close() { this.closing = true; this.ws?.close(); this.ws = null; }
  send(a: Action) { this.raw({ t: 'action', a }); }

  private recv(m: ServerMsg) {
    switch (m.t) {
      case 'lobby':
        this.localPid = m.you;
        if (m.again) this.world = null;
        this.serverBuild = m.build ?? '';
        this.serverBuildTime = m.buildTime ?? 0;
        this.builds = m.builds ?? {};
        this.onLobby(m.code, m.players, m.host === m.you, m.opts ?? {}, !!m.again);
        break;
      case 'start': {
        this.world = createWorld(m.seed, m.players, m.opts ?? {});
        for (const a of m.log) applyAction(this.world, a);
        this.onStart(this.world);
        break;
      }
      case 'action': if (this.world) this.onApplied(m.a, applyAction(this.world, m.a)); break;
      case 'reject': if (m.at !== 'move') this.onError(m.err); break;
      case 'left': this.onError('A companion has left the game.'); break;
      case 'error': this.onError(m.err); break;
    }
  }
}

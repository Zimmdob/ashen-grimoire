import type { Action, ActionResult, PlayerSetup, World, WorldOptions } from '../sim/types';
import { applyAction, createWorld, resyncEvents } from '../sim/game';
import { REJOIN_GRACE_MS, type ClientMsg, type LobbyPlayer, type ServerMsg } from './protocol';

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
  /** Connection state, for the game to show: fine, or trying to get back into the game. */
  onStatus: (s: 'ok' | 'reconnecting' | 'lost') => void = () => {};
  /** A companion dropped out or came back. */
  onNotice: (msg: string) => void = () => {};
  private url = '';
  private code = '';
  private token = '';
  private lastHeard = 0;
  private keepAlive = 0;
  private retryTimer = 0;
  private droppedAt = 0;
  private rejoining = false;

  connect(url: string, first: ClientMsg) {
    this.url = url;
    this.open(first);
    // Keep the link warm, and notice a dead one (a sleeping PC, a Wi-Fi change) within a minute.
    clearInterval(this.keepAlive);
    this.keepAlive = window.setInterval(() => this.checkAlive(), 15_000);
    window.addEventListener('online', this.wake);
    document.addEventListener('visibilitychange', this.wake);
  }
  private wake = () => { if (document.visibilityState !== 'hidden') this.checkAlive(true); };
  private checkAlive(now = false) {
    if (this.closing || this.rejoining) return;
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (this.lastHeard && Date.now() - this.lastHeard > 50_000) { try { ws.close(); } catch { /* gone */ } this.lost(); return; }
    if (now || Date.now() - this.lastHeard > 12_000) this.raw({ t: 'ping' });
  }
  private open(first: ClientMsg) {
    let ws: WebSocket;
    try { ws = new WebSocket(this.url); } catch { this.onError('Could not reach the server.'); return; }
    this.ws = ws;
    ws.onopen = () => { this.lastHeard = Date.now(); this.raw(first); };
    ws.onerror = () => { if (!this.world && !this.rejoining) this.onError('Could not reach the server. Is it running? (npm run server)'); };
    ws.onclose = () => { if (ws === this.ws) this.lost(); };
    ws.onmessage = (ev) => {
      if (ws !== this.ws) return;
      this.lastHeard = Date.now();
      this.recv(JSON.parse(String(ev.data)) as ServerMsg);
    };
  }
  /** The connection went away. Mid-run, keep trying to take our seat back. */
  private lost() {
    if (this.closing) return;
    this.ws = null;
    if (!this.world || !this.token) { if (this.world) this.onError('Disconnected from the server.'); return; }
    if (!this.droppedAt) { this.droppedAt = Date.now(); this.onStatus('reconnecting'); }
    if (Date.now() - this.droppedAt > REJOIN_GRACE_MS) { this.onStatus('lost'); this.onError('Lost the connection to the game.'); return; }
    this.rejoining = true;
    clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => {
      this.rejoining = false;
      this.open({ t: 'rejoin', code: this.code, pid: this.localPid, token: this.token });
    }, this.droppedAt && Date.now() - this.droppedAt < 4000 ? 600 : 2500);
  }
  private raw(m: ClientMsg) { if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  startGame() { this.raw({ t: 'start' }); }
  /** Back to this room's lobby with the same party for another descent. */
  again(setup: Omit<PlayerSetup, 'pid'>) { this.raw({ t: 'again', setup }); }
  /** Leave the room for good (title screen, solo run): the server lets the others know. */
  close() {
    this.closing = true;
    clearInterval(this.keepAlive);
    clearTimeout(this.retryTimer);
    window.removeEventListener('online', this.wake);
    document.removeEventListener('visibilitychange', this.wake);
    try { this.ws?.close(4000, 'leave'); } catch { /* already closed */ }
    this.ws = null;
  }
  send(a: Action) { this.raw({ t: 'action', a }); }

  private recv(m: ServerMsg) {
    switch (m.t) {
      case 'lobby':
        this.localPid = m.you;
        this.code = m.code;
        if (m.token) this.token = m.token;
        if (this.droppedAt && this.world) break; // a rejoin: the game follows in 'start'
        if (m.again) this.world = null;
        this.serverBuild = m.build ?? '';
        this.serverBuildTime = m.buildTime ?? 0;
        this.builds = m.builds ?? {};
        this.onLobby(m.code, m.players, m.host === m.you, m.opts ?? {}, !!m.again);
        break;
      case 'start': {
        const back = !!this.droppedAt;
        this.world = createWorld(m.seed, m.players, m.opts ?? {});
        for (const a of m.log) applyAction(this.world, a);
        // joining (or rejoining) mid-game: show where things stand, not a replay of the whole game
        if (m.log.length) resyncEvents(this.world);
        if (back) { this.droppedAt = 0; this.onStatus('ok'); }
        this.onStart(this.world);
        break;
      }
      case 'action': if (this.world) this.onApplied(m.a, applyAction(this.world, m.a)); break;
      case 'reject': if (m.at !== 'move') this.onError(m.err); break;
      case 'left': this.onError('A companion has left the game.'); break;
      case 'away': this.onNotice(`${m.name} lost their connection. Their seat is held while they reconnect.`); break;
      case 'back': this.onNotice(`${m.name} is back.`); break;
      case 'pong': break;
      case 'error':
        if (this.droppedAt) { this.droppedAt = 0; this.onStatus('lost'); }
        this.onError(m.err);
        break;
    }
  }
}

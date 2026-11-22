import { WebSocketServer, type WebSocket } from 'ws';
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { applyAction, createWorld } from '../src/sim/game';
import type { Action, PlayerSetup, World, WorldOptions } from '../src/sim/types';
import { cleanLook, TRAITS } from '../src/sim/character';
import { dailySeed, type ClientMsg, type LobbyPlayer, type ServerMsg } from '../src/net/protocol';

// Authoritative lockstep relay. It runs the exact same simulation as the clients, validates every
// action against it, and broadcasts only the accepted actions. Usage: npm run server [port]

const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8787);

interface Room { code: string; host: string; players: LobbyPlayer[]; sockets: Map<string, WebSocket>; world: World | null; seed: number; log: Action[]; opts: WorldOptions }
const rooms = new Map<string, Room>();
let nextPid = 1;

const code = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
const send = (ws: WebSocket, m: ServerMsg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(m));
const broadcast = (r: Room, m: ServerMsg) => r.sockets.forEach((ws) => send(ws, m));
const lobby = (r: Room, again = false) => r.sockets.forEach((ws, pid) => send(ws, { t: 'lobby', code: r.code, you: pid, host: r.host, players: r.players, opts: r.opts, again }));
/** Clean a client's character sheet; the sim re-validates classes, origins and trait budgets itself. */
function cleanSetup(pid: string, s: Partial<PlayerSetup> | undefined): PlayerSetup {
  const n = (v: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  return {
    pid,
    name: String(s?.name || 'Spellwright').slice(0, 20),
    cls: s?.cls,
    origin: typeof s?.origin === 'string' ? s.origin : undefined,
    traits: Array.isArray(s?.traits) ? s!.traits!.filter((t) => typeof t === 'string' && t in TRAITS).slice(0, 8) : [],
    look: cleanLook(s?.look),
  };
}
function cleanOpts(o: WorldOptions | undefined): WorldOptions {
  return {
    curses: Array.isArray(o?.curses) ? o!.curses!.filter((c) => typeof c === 'string').slice(0, 8) : [],
    pool: Array.isArray(o?.pool) ? o!.pool!.filter((c) => typeof c === 'string').slice(0, 200) : [],
    daily: !!o?.daily,
    placement: o?.placement !== false,
  };
}

// The same port serves the built game (dist/) over http, so a companion only needs a browser:
// http://<host-ip>:8787. Run `npm run build` first (npm run play does both).
const DIST = resolve(process.env.AG_DIST || resolve(process.cwd(), 'dist'));
let tunnelUrl = '';
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const http = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  // the game asks this to show the host their companion's link
  if (url === '/tunnel') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ url: tunnelUrl, lan: lanAddrs().map((ip) => `http://${ip}:${PORT}`) }));
    return;
  }
  let file = normalize(join(DIST, url));
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    if (!existsSync(join(DIST, 'index.html'))) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Build the game first: npm run build'); return; }
    file = join(DIST, 'index.html');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
http.on('error', (e: NodeJS.ErrnoException) => {
  if (e.code === 'EADDRINUSE') console.log(`Port ${PORT} is already in use: another Ashen Grimoire server is probably running. Using that one.`);
  else console.error(e);
});
http.listen(PORT);
const wss = new WebSocketServer({ server: http });
wss.on('error', () => { /* reported by the http server above */ });
wss.on('connection', (ws) => {
  let room: Room | null = null;
  let pid = '';
  ws.on('message', (data) => {
    let m: ClientMsg;
    try { m = JSON.parse(String(data)); } catch { return; }
    if (m.t === 'host' || m.t === 'join') {
      if (room) return;
      pid = `p${nextPid++}`;
      if (m.t === 'host') {
        let c = code();
        while (rooms.has(c)) c = code();
        room = { code: c, host: pid, players: [], sockets: new Map(), world: null, seed: (Math.random() * 2 ** 31) | 0, log: [], opts: cleanOpts(m.opts) };
        rooms.set(c, room);
      } else {
        room = rooms.get(String(m.code).toUpperCase()) ?? null;
        if (!room) return send(ws, { t: 'error', err: 'No game with that code.' });
        if (room.world) return send(ws, { t: 'error', err: 'That game has already begun.' });
        if (room.players.length >= 4) return send(ws, { t: 'error', err: 'That game is full.' });
      }
      room.players.push(cleanSetup(pid, m.setup));
      room.sockets.set(pid, ws);
      lobby(room);
      return;
    }
    if (!room) return;
    if (m.t === 'start' && pid === room.host && !room.world) {
      if (room.opts.daily) room.seed = dailySeed();
      room.world = createWorld(room.seed, room.players, room.opts);
      room.world.events.length = 0;
      broadcast(room, { t: 'start', seed: room.seed, players: room.players, opts: room.opts, log: [] });
      return;
    }
    if (m.t === 'again') {
      // Only once the run is over: the whole party goes back to this room's lobby, nobody is dropped.
      if (room.world && room.world.phase !== 'dead' && room.world.phase !== 'victory') return;
      const fresh = cleanSetup(pid, m.setup);
      room.players = room.players.map((p) => (p.pid === pid ? fresh : p));
      if (room.world) {
        room.world = null;
        room.log = [];
        room.seed = (Math.random() * 2 ** 31) | 0;
        if (!room.players.some((p) => p.pid === room!.host)) room.host = room.players[0]?.pid ?? pid;
      }
      lobby(room, true);
      return;
    }
    if (m.t === 'action' && room.world) {
      const a = { ...m.a, pid } as Action; // a client may only act as itself
      const r = applyAction(room.world, a);
      room.world.events.length = 0;
      if (!r.ok) return send(ws, { t: 'reject', err: r.err ?? 'Rejected', at: a.t });
      room.log.push(a);
      broadcast(room, { t: 'action', seq: room.log.length, a });
    }
  });
  ws.on('close', () => {
    if (!room) return;
    room.sockets.delete(pid);
    room.players = room.players.filter((p) => p.pid !== pid);
    if (room.world) {
      const a: Action = { t: 'leave', pid };
      applyAction(room.world, a);
      room.world.events.length = 0;
      room.log.push(a);
      broadcast(room, { t: 'action', seq: room.log.length, a });
    }
    broadcast(room, { t: 'left', pid });
    if (!room.sockets.size) rooms.delete(room.code);
    else if (!room.world) { if (room.host === pid) room.host = room.players[0].pid; lobby(room); }
  });
});
function lanAddrs() { return Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n!.address); }
const lan = lanAddrs();
console.log(`Ashen Grimoire co-op server listening on ws://localhost:${PORT}`);
console.log(`Play here:            http://localhost:${PORT}`);
for (const ip of lan) console.log(`Your companion opens: http://${ip}:${PORT}`);

// TUNNEL=1: open a free Cloudflare quick tunnel so a companion on another network can join with a
// plain https link (no install on their side). Needs cloudflared on the PATH.
if (process.env.TUNNEL === '1') {
  const exe = process.env.CLOUDFLARED || 'cloudflared';
  const cf = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let shown = false;
  const scan = (buf: Buffer) => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (!m || shown) return;
    shown = true;
    tunnelUrl = m[0];
    const bar = '='.repeat(64);
    console.log(`\n${bar}\n  SEND YOUR FRIENDS THIS LINK (works from anywhere):\n\n    ${m[0]}\n\n  It changes each time you start the server.\n${bar}\n`);
    try { writeFileSync(process.env.AG_LINKFILE || resolve(process.cwd(), '..', 'Friend link.txt'), `${m[0]}\r\n`); } catch { /* not fatal */ }
  };
  cf.stdout.on('data', scan);
  cf.stderr.on('data', scan);
  cf.on('error', () => console.log('Could not start cloudflared, so there is no public link. Same-network play still works.'));
  if (process.env.AG_EMBEDDED) process.on('exit', () => cf.kill());
  const stop = () => { cf.kill(); process.exit(0); };
  if (!process.env.AG_EMBEDDED) { process.on('SIGINT', stop); process.on('SIGTERM', stop); }
}

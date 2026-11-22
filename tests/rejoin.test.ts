import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import WebSocket from 'ws';
import { BUILD } from '../src/version';

// A real co-op server: two players start a run, one connection drops (a sleeping PC), and that
// player takes the same seat back with the whole game intact while the other is told about it.
const PORT = 18000 + Math.floor(Math.random() * 1000);
let server: ChildProcess;

beforeAll(async () => {
  server = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/index.ts', String(PORT)], { stdio: 'pipe', env: { ...process.env, AG_DIST: '/nonexistent' } });
  await new Promise<void>((ok) => { server.stdout!.on('data', (d) => { if (String(d).includes('listening')) ok(); }); });
}, 30000);
afterAll(() => { server?.kill(); });

type Msg = Record<string, any>;
function client() {
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  const got: Msg[] = [];
  const waiters: [(m: Msg) => boolean, (m: Msg) => void][] = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    got.push(m);
    for (const w of [...waiters]) if (w[0](m)) { waiters.splice(waiters.indexOf(w), 1); w[1](m); }
  });
  const open = new Promise<void>((ok) => ws.on('open', () => ok()));
  const next = (pred: (m: Msg) => boolean) => {
    const seen = got.find(pred);
    if (seen) { got.splice(got.indexOf(seen), 1); return Promise.resolve(seen); }
    return new Promise<Msg>((ok) => waiters.push([pred, (m) => { got.splice(got.indexOf(m), 1); ok(m); }]));
  };
  return { ws, open, next, send: (m: Msg) => ws.send(JSON.stringify(m)) };
}

describe('dropped connections', () => {
  it('holds the seat and lets the player back in with the game intact', async () => {
    const a = client();
    await a.open;
    a.send({ t: 'host', setup: { name: 'Dean', cls: 'spellwright' }, opts: { placement: false }, build: BUILD.sha });
    const la = await a.next((m) => m.t === 'lobby');
    expect(la.token).toBeTruthy();
    const b = client();
    await b.open;
    b.send({ t: 'join', code: la.code, setup: { name: 'Ian', cls: 'spellwright' }, build: BUILD.sha });
    const lb = await b.next((m) => m.t === 'lobby' && m.you !== la.you);
    a.send({ t: 'start' });
    await a.next((m) => m.t === 'start');
    await b.next((m) => m.t === 'start');
    // Dean acts, so there is history to restore
    a.send({ t: 'action', a: { t: 'endTurn', pid: la.you } });
    await a.next((m) => m.t === 'action');
    // keep-alive
    b.send({ t: 'ping' });
    await b.next((m) => m.t === 'pong');
    // Ian's connection drops without a goodbye
    b.ws.terminate();
    const away = await a.next((m) => m.t === 'away');
    expect(away.name).toBe('Ian');
    // ...and comes back with the token
    const b2 = client();
    await b2.open;
    b2.send({ t: 'rejoin', code: la.code, pid: lb.you, token: lb.token });
    const st = await b2.next((m) => m.t === 'start');
    expect(st.players.map((p: Msg) => p.name)).toEqual(['Dean', 'Ian']);
    expect(st.log.length).toBe(1);
    const back = await a.next((m) => m.t === 'back');
    expect(back.name).toBe('Ian');
    // Ian can act again, and everyone hears it
    b2.send({ t: 'action', a: { t: 'endTurn', pid: lb.you } });
    const act = await a.next((m) => m.t === 'action' && m.a.pid === lb.you);
    expect(act.a.t).toBe('endTurn');
    // a wrong token never takes someone's seat
    const c = client();
    await c.open;
    c.send({ t: 'rejoin', code: la.code, pid: lb.you, token: 'nope' });
    const err = await c.next((m) => m.t === 'error');
    expect(err.err).toMatch(/seat/);
    // a deliberate leave frees the seat at once
    b2.ws.close(4000, 'leave');
    const left = await a.next((m) => m.t === 'left');
    expect(left.pid).toBe(lb.you);
    for (const x of [a, c]) x.ws.close();
  }, 30000);
});

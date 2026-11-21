import WebSocket from 'ws';
import { applyAction, createWorld, playerUnit } from '../../src/sim/game';
import type { World, Action } from '../../src/sim/types';
const URL = 'ws://localhost:8799';
function client(name: string, first: any) {
  const ws = new WebSocket(URL);
  const st: { ws: WebSocket; pid: string; world: World | null; code: string; n: number } = { ws, pid: '', world: null, code: '', n: 0 };
  ws.on('open', () => ws.send(JSON.stringify(first)));
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.t === 'lobby') { st.pid = m.you; st.code = m.code; }
    if (m.t === 'start') st.world = createWorld(m.seed, m.players, m.opts);
    if (m.t === 'action' && st.world) { applyAction(st.world, m.a); st.world.events.length = 0; st.n++; }
  });
  return st;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const a = client('Vox', { t: 'host', setup: { name: 'Vox', cls: 'tarot', origin: 'sailor', traits: ['tough'], look: { robe: 3, trim: 1, orb: 2, head: 2, skin: 1 } }, opts: { curses: ['no_rest'] } });
  await sleep(300);
  const b = client('Morgan', { t: 'join', code: a.code, setup: { name: 'Ian', cls: 'cagebearer', origin: 'ember' } });
  await sleep(300);
  a.ws.send(JSON.stringify({ t: 'start' }));
  await sleep(300);
  for (let turn = 0; turn < 12; turn++) {
    for (const c of [a, b]) {
      const w = c.world!; const ps = w.players.find((p) => p.pid === c.pid)!; const u = playerUnit(w, ps);
      const f = w.units.filter((v) => v.alive && v.faction === 'enemy').sort((x, y) => Math.hypot(x.x - u.x, x.y - u.y) - Math.hypot(y.x - u.x, y.y - u.y))[0];
      if (f) {
        c.ws.send(JSON.stringify({ t: 'action', a: { t: 'move', pid: c.pid, x: f.x, y: f.y } }));
        await sleep(60);
        c.ws.send(JSON.stringify({ t: 'action', a: { t: 'cast', pid: c.pid, cards: ['sever'], x: f.x, y: f.y } }));
        await sleep(60);
      }
      c.ws.send(JSON.stringify({ t: 'action', a: { t: 'endTurn', pid: c.pid } }));
      await sleep(80);
    }
  }
  await sleep(300);
  const same = JSON.stringify(a.world) === JSON.stringify(b.world);
  console.log('actions applied', a.n, b.n, 'turn', a.world!.turn, 'level', a.world!.level, 'phase', a.world!.phase, 'IDENTICAL:', same);
  b.ws.close(); await sleep(300);
  console.log('after leave phase', a.world!.phase, 'left flag', a.world!.players.find(p=>p.pid===b.pid)?.left);
  a.ws.close();
  process.exit(0);
})();

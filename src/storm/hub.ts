// The Last Hearth: a painted, living camp between runs. It starts as rubble around one fire; every
// person you rescue rebuilds their corner of it.
import type { NpcId } from './progress';

export interface Station { id: string; x: number; y: number; npc: NpcId | 'cass' | null; label: string }
export const SCENE_W = 320, SCENE_H = 180;
export const STATIONS: Station[] = [
  { id: 'hearth', x: 160, y: 122, npc: 'cass', label: 'The Hearth' },
  { id: 'rook', x: 62, y: 96, npc: 'rook', label: 'Rook’s Bargains' },
  { id: 'brannoch', x: 256, y: 104, npc: 'brannoch', label: 'The Tempering' },
  { id: 'ysolde', x: 52, y: 148, npc: 'ysolde', label: 'The Library' },
  { id: 'hesk', x: 266, y: 152, npc: 'hesk', label: 'Hesk’s Workshop' },
  { id: 'vell', x: 160, y: 62, npc: 'vell', label: 'The Silent Bell' },
  { id: 'board', x: 112, y: 100, npc: null, label: 'Notice Board' },
  { id: 'path', x: 160, y: 170, npc: null, label: 'The Storm-Path' },
];

const hash = (n: number) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };

/** Paint the camp at time t (seconds). `sprites` maps a sprite key to its canvas. */
export function paintSanctuary(cv: HTMLCanvasElement, sprites: (k: string) => HTMLCanvasElement | null, rescued: NpcId[], t: number, hover: string | null) {
  cv.width = SCENE_W; cv.height = SCENE_H;
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  const warmth = rescued.length / 5;
  // sky: cold and empty at first, warmer as the camp fills
  const sky = g.createLinearGradient(0, 0, 0, 110);
  sky.addColorStop(0, `rgb(${10 + warmth * 20},${8 + warmth * 8},${22 - warmth * 4})`);
  sky.addColorStop(1, `rgb(${38 + warmth * 40},${18 + warmth * 18},${26})`);
  g.fillStyle = sky; g.fillRect(0, 0, SCENE_W, SCENE_H);
  for (let i = 0; i < 70; i++) { const x = hash(i) * SCENE_W, y = hash(i + 99) * 70, tw = 0.5 + 0.5 * Math.sin(t * 2 + i); g.fillStyle = `rgba(255,240,220,${0.25 + 0.5 * tw * hash(i + 7)})`; g.fillRect(x | 0, y | 0, 1, 1); }
  // the moon, through smoke
  g.fillStyle = 'rgba(255,220,190,0.85)'; g.beginPath(); g.arc(262, 30, 11, 0, Math.PI * 2); g.fill();
  g.fillStyle = sky; g.beginPath(); g.arc(267, 27, 10, 0, Math.PI * 2); g.fill();
  // far hills and the burning horizon
  g.fillStyle = '#1a0e14';
  g.beginPath(); g.moveTo(0, 88); for (let x = 0; x <= SCENE_W; x += 8) g.lineTo(x, 80 + Math.sin(x * 0.05) * 6 + hash(x) * 4); g.lineTo(SCENE_W, 110); g.lineTo(0, 110); g.fill();
  g.fillStyle = 'rgba(255,90,30,0.25)'; for (let x = 0; x < SCENE_W; x += 2) { const h = 2 + hash(x * 3) * 4 * (0.7 + 0.3 * Math.sin(t * 3 + x)); g.fillRect(x, 86 - h + Math.sin(x * 0.05) * 6, 2, h); }
  // the ruined chapel behind it all
  g.fillStyle = '#140a10';
  g.fillRect(118, 34, 84, 56); g.fillRect(150, 18, 20, 20);
  g.beginPath(); g.moveTo(150, 18); g.lineTo(160, 6); g.lineTo(170, 18); g.fill();
  g.fillStyle = '#0a0508'; for (const x of [126, 140, 174, 188]) { g.fillRect(x, 50, 6, 14); g.beginPath(); g.arc(x + 3, 50, 3, Math.PI, 0); g.fill(); }
  g.fillStyle = sky; g.fillRect(190, 34, 12, 18); g.fillRect(118, 34, 8, 10);
  // ground
  const gr = g.createLinearGradient(0, 90, 0, SCENE_H);
  gr.addColorStop(0, '#2a1a16'); gr.addColorStop(1, '#120a0a');
  g.fillStyle = gr; g.fillRect(0, 90, SCENE_W, SCENE_H - 90);
  for (let i = 0; i < 260; i++) { const x = hash(i * 3) * SCENE_W, y = 92 + hash(i * 5) * 88; g.fillStyle = hash(i) < 0.5 ? '#3a2620' : '#1e120e'; g.fillRect(x | 0, y | 0, 1 + (hash(i * 9) < 0.2 ? 1 : 0), 1); }
  // the hearth's glow on the ground
  const flick = 0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3);
  const glow = g.createRadialGradient(160, 122, 4, 160, 122, 110 + warmth * 30);
  glow.addColorStop(0, `rgba(255,150,60,${0.45 * flick})`); glow.addColorStop(1, 'rgba(255,90,30,0)');
  g.fillStyle = glow; g.fillRect(0, 0, SCENE_W, SCENE_H);
  // a path leading down out of camp
  g.fillStyle = '#3a2a22'; g.beginPath(); g.moveTo(150, 180); g.lineTo(170, 180); g.lineTo(166, 140); g.lineTo(154, 140); g.fill();

  const has = (n: NpcId) => rescued.includes(n);
  const drawStation = (st: Station) => {
    const on = st.npc === null || st.npc === 'cass' || has(st.npc as NpcId);
    const { x, y } = st;
    if (!on) { // rubble, a dim ember where someone should be
      g.fillStyle = '#2a1c18'; for (let i = 0; i < 9; i++) g.fillRect(x - 12 + hash(x + i) * 22, y - 2 + hash(y + i) * 6, 3 + hash(i) * 4, 2 + hash(i + 3) * 3);
      g.fillStyle = `rgba(255,110,40,${0.3 + 0.3 * Math.sin(t * 2 + x)})`; g.fillRect(x - 1, y - 1, 2, 2);
      return;
    }
    switch (st.id) {
      case 'rook': // a crooked hut with a lantern
        g.fillStyle = '#3a2a1a'; g.fillRect(x - 16, y - 18, 26, 18);
        g.fillStyle = '#4a5a2a'; g.beginPath(); g.moveTo(x - 20, y - 16); g.lineTo(x - 2, y - 34); g.lineTo(x + 14, y - 16); g.fill();
        g.fillStyle = '#1a0e08'; g.fillRect(x - 8, y - 10, 7, 10);
        g.fillStyle = `rgba(200,255,120,${0.7 * flick})`; g.fillRect(x + 6, y - 14, 3, 4);
        break;
      case 'brannoch': // a forge: anvil, chimney and coals
        g.fillStyle = '#2a2224'; g.fillRect(x - 6, y - 32, 10, 30);
        g.fillStyle = '#3a3036'; g.fillRect(x - 18, y - 12, 30, 12);
        g.fillStyle = `rgba(255,120,40,${0.8 * flick})`; g.fillRect(x - 14, y - 9, 10, 4);
        g.fillStyle = '#5a5a64'; g.fillRect(x + 8, y - 6, 10, 3); g.fillRect(x + 11, y - 3, 4, 3);
        for (let i = 0; i < 4; i++) { const k = (t * 0.6 + i * 0.25) % 1; g.fillStyle = `rgba(120,110,110,${0.5 * (1 - k)})`; g.fillRect(x - 3 + Math.sin(k * 6 + i) * 3, y - 34 - k * 26, 3, 3); }
        break;
      case 'ysolde': // shelves of rescued books under an awning
        g.fillStyle = '#2a2030'; g.fillRect(x - 18, y - 22, 30, 22);
        for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) { g.fillStyle = ['#8a3a2a', '#3a5a8a', '#c8a040', '#4a6a3a'][(i + r) % 4]; g.fillRect(x - 16 + i * 3, y - 20 + r * 7, 2, 5); }
        g.fillStyle = '#5a6a9a'; g.beginPath(); g.moveTo(x - 22, y - 22); g.lineTo(x + 16, y - 22); g.lineTo(x + 12, y - 28); g.lineTo(x - 18, y - 28); g.fill();
        break;
      case 'hesk': // a workbench with turning gears
        g.fillStyle = '#4a3a24'; g.fillRect(x - 18, y - 10, 30, 4); g.fillRect(x - 16, y - 6, 3, 6); g.fillRect(x + 8, y - 6, 3, 6);
        for (const [cx, cy, r] of [[x - 6, y - 18, 6], [x + 5, y - 22, 4]]) { g.strokeStyle = '#d9a845'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); for (let k = 0; k < 6; k++) { const a = t * (r > 5 ? 1 : -1.5) + (k * Math.PI) / 3; g.fillStyle = '#d9a845'; g.fillRect(cx + Math.cos(a) * (r + 1) - 1, cy + Math.sin(a) * (r + 1) - 1, 2, 2); } }
        g.fillStyle = `rgba(111,208,255,${0.6 + 0.4 * Math.sin(t * 4)})`; g.fillRect(x + 12, y - 14, 2, 2);
        break;
      case 'vell': // the silent bell, hung in the chapel's broken arch
        g.fillStyle = '#3a2a24'; g.fillRect(x - 12, y - 30, 3, 30); g.fillRect(x + 9, y - 30, 3, 30); g.fillRect(x - 12, y - 32, 24, 3);
        g.fillStyle = '#c8a040'; g.beginPath(); g.moveTo(x - 7, y - 10 + Math.sin(t) * 1); g.lineTo(x - 4, y - 24); g.lineTo(x + 4, y - 24); g.lineTo(x + 7, y - 10 + Math.sin(t) * 1); g.fill();
        g.fillStyle = '#8a6a2a'; g.fillRect(x - 7, y - 11, 14, 2);
        break;
      case 'board': // the notice board: runs remembered
        g.fillStyle = '#4a3020'; g.fillRect(x - 1, y - 18, 2, 18); g.fillRect(x - 10, y - 22, 20, 12);
        g.fillStyle = '#e2cfa2'; for (let i = 0; i < 4; i++) g.fillRect(x - 8 + i * 4.5, y - 20 + (i % 2) * 2, 3, 4);
        break;
      case 'hearth': {
        g.fillStyle = '#4a4048'; for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; g.fillRect(x + Math.cos(a) * 11 - 2, y + Math.sin(a) * 5 - 1, 4, 3); }
        for (let i = 0; i < 22; i++) { const k = (t * 1.4 + hash(i) ) % 1, hx = x + (hash(i * 3) - 0.5) * 12 * (1 - k), hy = y - 2 - k * (16 + 10 * flick); g.fillStyle = k < 0.3 ? '#fff0b0' : k < 0.6 ? '#ffb040' : '#ff5a20'; g.globalAlpha = 1 - k; g.fillRect(hx | 0, hy | 0, 2, 2); }
        g.globalAlpha = 1;
        for (let i = 0; i < 6; i++) { const k = (t * 0.5 + hash(i + 50)) % 1; g.fillStyle = `rgba(255,${140 + 80 * hash(i)},60,${1 - k})`; g.fillRect(x + Math.sin(k * 7 + i) * 8, y - 20 - k * 60, 1, 1); }
        break;
      }
      case 'path':
        g.fillStyle = `rgba(255,120,60,${0.4 + 0.3 * Math.sin(t * 2)})`; g.fillRect(x - 1, y - 4, 2, 2);
        break;
    }
  };
  for (const st of [...STATIONS].sort((a, b) => a.y - b.y)) {
    drawStation(st);
    // the person who keeps it
    if (st.npc && (st.npc === 'cass' || has(st.npc as NpcId))) {
      const c = sprites(`npc_${st.npc}`);
      if (c) { const sz = 30, bob = Math.sin(t * 2 + st.x) > 0.6 ? 1 : 0; g.drawImage(c, (st.npc === 'cass' ? st.x + 26 : st.x + 8) - sz / 2, st.y - sz + 2 - bob, sz, sz); }
    }
    if (hover === st.id) { g.strokeStyle = 'rgba(255,220,140,0.8)'; g.lineWidth = 1; g.strokeRect(st.x - 22, st.y - 36, 44, 40); }
  }
  // drifting embers over everything
  for (let i = 0; i < 30; i++) { const k = (t * 0.08 + hash(i * 11)) % 1; g.fillStyle = `rgba(255,${150 + 60 * hash(i)},80,${0.6 * (1 - k)})`; g.fillRect((hash(i * 13) * SCENE_W + Math.sin(t + i) * 6) | 0, (SCENE_H - k * SCENE_H) | 0, 1, 1); }
}

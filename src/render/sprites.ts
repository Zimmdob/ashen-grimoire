import { Texture } from 'pixi.js';
import { paintDoll } from './doll';
import type { Look } from '../sim/types';

// Original 16x16 pixel art, drawn as character grids. '.' is transparent.

interface SpriteDef { p: Record<string, string>; r: string[] }

const urn = (u: string, U: string, x: string): SpriteDef => ({
  p: { k: '#0b0809', u, U, x },
  r: [
    '................', '................', '................', '.....kkkkkk.....', '......kuuk......', '.....kuUuuk.....',
    '....kuUuuuuk....', '...kuUuuuuuuk...', '...kuUuuxuuuk...', '...kuuuxxxuuk...', '...kuuuuxuuuk...', '....kuuuuuuk....',
    '.....kuuuuk.....', '....kkkkkkkk....', '................', '................',
  ],
});
const potion = (c: string, C: string): SpriteDef => ({
  p: { k: '#0b0809', w: '#8a6a4a', c, C, g: '#e9dcc0' },
  r: [
    '................', '................', '................', '................', '......kkkk......', '.......kk.......',
    '......kwwk......', '.....kccCck.....', '....kcccCgck....', '....kccccCck....', '....kcccccck....', '.....kcccck.....',
    '......kkkk......', '................', '................', '................',
  ],
});

export const SPRITES: Record<string, SpriteDef> = {
  wizard: {
    p: { k: '#100b12', h: '#2c1838', p: '#4b2a5e', P: '#7a4a96', s: '#6b4a2b', o: '#9fe0ff', e: '#b8f4ff', g: '#c99a3a' },
    r: [
      '....o...........', '...ooo...kkk....', '....o...khhhk...', '....s..khpppPk..', '....s.khpppppPk.', '....s.khkkkkkpk.',
      '....s.kkkekekkk.', '....sskhkkkkkpk.', '....s.khpppppPk.', '....s.kpPpppPpk.', '....skppPppPpppk', '....kpppPppPpppk',
      '....kppppggppppk', '....kpppppppppk.', '....kkpppppppkk.', '.....kkkkkkkkk..',
    ],
  },
  ghoul: {
    p: { k: '#0c0a08', g: '#7d8f62', G: '#a3b47f', d: '#4f5c3c', r: '#ff3b2b', m: '#2a1414', c: '#e9dcc0' },
    r: [
      '................', '......kkkk......', '.....kggggk.....', '....kgGggGgk....', '....kgrkkrgk....', '....kggmmggk....',
      '.....kgcgcgk....', '...kkgggggggkk..', '..kgkgGgggGgkgk.', '..kgkgdgggdgkgk.', '..kc.kgggggk.ck.', '.....kgdddgk....',
      '.....kgk.kgk....', '.....kgk.kgk....', '....kddk.kddk...', '....kkk...kkk...',
    ],
  },
  xbow: {
    p: { k: '#0b0809', i: '#5d5a62', I: '#9a979e', s: '#b08c6c', l: '#5a3b22', L: '#7a5232', w: '#8a5a2b', b: '#2b1d14', r: '#ff4a2a' },
    r: [
      '................', '.....kkkkkk.....', '....kiIIIIik....', '....kiiiiiik....', '....kkkrkrkk....', '.....kssssk.....',
      '...kkllLLllkk...', '..klllLLLLlllk..', 'kwwwwwwwwwwklk..', '..kwkllLLllklk..', '...k.kllllk.kk..', '.....kllllk.....',
      '.....kl..lk.....', '.....kl..lk.....', '....kbb..bbk....', '....kkk..kkk....',
    ],
  },
  spitter: {
    p: { k: '#0c0a06', y: '#7a8a22', Y: '#b8c84a', m: '#3b2a10', M: '#c8402a', r: '#ffdd3b' },
    r: [
      '................', '................', '......kkkk......', '....kkyyyykk....', '...kyyYYyyyyk...', '..kyyYyyyyyyyk..',
      '..kyrrkyyykrryk.', '..kyyyyyyyyyyk..', '.kyyyymmmmyyyyk.', '.kyyymMMMMmyyyk.', '.kyyyymmmmyyyyk.', '.kyYyyyyyyyyYyk.',
      '..kyyyyyyyyyyk..', '...kkyyyyyykk...', '....kkkkkkkk....', '................',
    ],
  },
  monk: {
    p: { k: '#0b0a08', m: '#4a5040', M: '#6a7258', g: '#9cff5a', c: '#6d6a70', z: '#7acc3a' },
    r: [
      '................', '......kkkk......', '.....kmmmmk.....', '....kmMmmmmk....', '....kmkkkkmk....', '....kmkgkgkk....',
      '....kmkkkkmk....', '...kmmmmmmmmk...', '..kmmmMmmMmmmk..', '..kmmmMmmMmmmkc.', '..kmmmmmmmmmmk.c', '..kmmmmmmmmmmkcz',
      '..kmmmmmmmmmmk.z', '...kmmmmmmmmk...', '...kkmmmmmmkk...', '....kkkkkkkk....',
    ],
  },
  priest: {
    p: { k: '#0b0809', w: '#cfc4ad', W: '#efe6d2', r: '#a3202a', b: '#e9dcc0', s: '#2a1a1a' },
    r: [
      '......kkkk......', '.....kWWWWk.....', '.....kwrrwk.....', '.....kwWWwk.....', '....kkkkkkkk....', '....kbbbbbbk....',
      '....kbssbsbk....', '....kbbkkbbk....', '...kwwkbbkwwk...', '..kwwwwwwwwwwk..', '..kwwrwWWwrwwk..', '..kwwrwwwwrwwk..',
      '..kwwwwwwwwwwk..', '...kwwwwwwwwk...', '...kkwwwwwwkk...', '....kkkkkkkk....',
    ],
  },
  necro: {
    p: { k: '#060508', n: '#1e1a24', N: '#3a3046', v: '#c060ff', s: '#5a4a3a', b: '#e9dcc0' },
    r: [
      '.b..............', 'bbb....kkkk.....', '.s....knnnnk....', '.s...knNnnnnk...', '.s...knkkkknk...', '.s...knkvkvkk...',
      '.s...knkkkknk...', '.s..knnnnnnnnk..', '.s.knnnNnnNnnnk.', '.skknnnNnnNnnnk.', '.s.knnnnnnnnnnk.', '.s.knnnnvvnnnnk.',
      '.s.knnnnnnnnnnk.', '.s..knnnnnnnnk..', '.s..kknnnnnnkk..', '....kkkkkkkkkk..',
    ],
  },
  leech: {
    p: { k: '#08060a', w: '#3a2a5a', l: '#6a3a8a', L: '#9a5ac0', r: '#6fd0ff', m: '#1a0a1a' },
    r: [
      '................', '................', 'k..............k', 'kk....kkkk....kk', 'kwk..kllllk..kwk', 'kwwkkllLLllkkwwk',
      'kwwwklrllrlkwwwk', '.kwwwllllllwwwk.', '..kwwllmmllwwk..', '...kkllmmllkk...', '.....kllllk.....', '......kllk......',
      '.......kk.......', '................', '................', '................',
    ],
  },
  grasp: {
    p: { k: '#060a0a', t: '#2f5a5a', T: '#4f8a80', y: '#e0ff7a', m: '#102020' },
    r: [
      '................', '.....kkkkkk.....', '....kttTTttk....', '...kttTttttTk...', '...ktyykkyytk...', '...kttttttttk...',
      '...kktmmmmtkk...', '..kt.kttttk.tk..', '.kt.ktktktkt.tk.', '.kt.kt.kt.kt.tk.', 'kt..kt.kt.kt..tk', 'kt.kt..kt..kt.tk',
      '.k.kt..kt..kt.k.', '...k...kt...k...', '.......k........', '................',
    ],
  },
  king: {
    p: { k: '#0a0606', g: '#e0b040', G: '#ffd870', b: '#d8ccb0', r: '#ff2a2a', c: '#7a1018', C: '#a8202a' },
    r: [
      '....g.G.g.G.....', '....ggggggg.....', '....kkkkkkk.....', '...kbbbbbbbk....', '...kbrkbkrbk....', '...kbbbkbbbk....',
      '....kbkbkbk.....', '..kkccbbbcckk...', '.kcCcckbkcCcck..', 'kcCcccbbbcccCck.', 'kccckcbbbckccck.', 'kcck.kbbbk.kcck.',
      'kck..kbbbk..kck.', '.k..kbb.bbk..k..', '....kkk.kkk.....', '................',
    ],
  },
  effigy: {
    p: { k: '#0b0809', y: '#c9a24a', Y: '#e8c870', w: '#6b4a2b' },
    r: [
      '......kkkk......', '.....kyYyyk.....', '.....kykyk k....', '.....kyyyyk.....', '..kkkkkyykkkkk..', '..kyyYyyyyYyyk..',
      '..kkkkkyykkkkk..', '......kyyk......', '.....kyYyyk.....', '.....kyyyyk.....', '......kwwk......', '......kwwk......',
      '......kwwk......', '......kwwk......', '.....kkkkkk.....', '................',
    ],
  },
  urn_fire: urn('#7a3a1a', '#a85a2a', '#ff8a2a'),
  urn_ice: urn('#3a5a7a', '#5a80a8', '#9ff0ff'),
  urn_plague: urn('#3a5a2a', '#5a7a3a', '#9cff5a'),
  pot_hp: potion('#c0202a', '#ff5a5a'),
  pot_mana: potion('#3060d0', '#7aa8ff'),
  pot_stam: potion('#d0a020', '#ffe070'),
  pot_scroll: {
    p: { k: '#0b0809', p: '#e2cfa2', P: '#b59a68', r: '#a3202a', i: '#5a3a20' },
    r: [
      '................', '................', '................', '...kkkkkkkkk....', '..kPpppppppPk...', '..kPpiiipppPk...',
      '...kpppppppk....', '...kpiiiiipk....', '...kpppppppk....', '...kpiiipppk....', '..kPpppppppPk...', '..kPpppprrpPk...',
      '...kkkkkkrrkk...', '.........kk.....', '................', '................',
    ],
  },
};


// ---- templates for the new foes (palette-swapped per creature)
const TPL: Record<string, string[]> = {
  beast: [
    '................', '................', '................', '...........k.k..', '..........kfkfk.', '..........kffffk',
    'k........kfefffk', 'fk.kkkkkkkffffmk', 'kfkffffffffffkk.', '.kfffFFFFFfffk..', '.kffffffffffffk.', '..kffkkkkkkffk..',
    '..kfk.....kfk...', '..kfk.....kfk...', '.kdk.....kdk....', '.kk......kk.....',
  ],
  golem: [
    '................', '.....kkkkkk.....', '....kgggggGk....', '....kgekkegk....', '....kggggggk....', '..kkkgGGGGgkkk..',
    '.kgggggggggggGk.', '.kgGgkgggggkgGk.', '.kggk.kgggk.kgk.', '.kggk.kgGgk.kgk.', '.kkk..kgggk..kk.', '......kgggk.....',
    '.....kgk.kgk....', '.....kgk.kgk....', '....kggk.kggk...', '....kkkk.kkkk...',
  ],
  imp: [
    '................', '................', '................', '....k......k....', '....hk....kh....', '.....kkkkkk.....',
    '....kiiiiiik....', '....kieiieik....', '....kiiiiiik....', '.....kimmik.....', '....kiiiiiik....', '...ki.kiik.ik...',
    '...k..kiik..k...', '......kiik......', '.....kk..kk.....', '................',
  ],
  toad: [
    '................', '................', '................', '................', '....kk....kk....', '...kek....kek...',
    '..kttkkkkkkttk..', '.kttttttttttttk.', '.ktTTttttttTTtk.', 'kttttmmmmmmttttk', 'ktttttttttttttk.', '.kttttttttttttk.',
    '.ktkttttttttktk.', '.kk.kkkkkkkk.kk.', '................', '................',
  ],
  moth: [
    '................', '..k..........k..', '...k........k...', 'kk..k......k..kk', 'kwwk.kkkkkk.kwwk', 'kwWwkbbbbbbkwWwk',
    'kwwwkbebbebkwwwk', '.kwwkbbbbbbkwwk.', '.kWwwkbbbbkwwWk.', '..kwwkbbbbkwwk..', '...kkkbbbbkkk...', '.....kbbbbk.....',
    '......kbbk......', '.......kk.......', '................', '................',
  ],
};
const K = '#0a0809';
/** Creatures built from a base sprite or template with a new palette. */
const VARIANTS: Record<string, { from: string; p: Record<string, string> }> = {
  wolf: { from: 'beast', p: { k: K, f: '#5a5a62', F: '#7a7a84', e: '#ff4a2a', m: '#2a0a0a', d: '#3a3a40' } },
  hound: { from: 'beast', p: { k: K, f: '#8aa8c0', F: '#bfe0f0', e: '#9fe8ff', m: '#2a3a4a', d: '#5a7890' } },
  boar: { from: 'beast', p: { k: K, f: '#5a3e26', F: '#8a6a40', e: '#ffd06a', m: '#e8e0c8', d: '#3a2816' } },
  stag: { from: 'beast', p: { k: K, f: '#8a7a6a', F: '#c8b89a', e: '#e8ffb0', m: '#2a1a10', d: '#5a4a3a' } },
  thornling: { from: 'imp', p: { k: K, h: '#2a3a14', i: '#4a6a24', e: '#e8ff7a', m: '#1a2a0a' } },
  thornmaw: { from: 'golem', p: { k: K, g: '#3a2c1a', G: '#5a7a2a', e: '#c8ff7a' } },
  mother: { from: 'beast', p: { k: K, f: '#3a2a1a', F: '#6a5030', e: '#9cff5a', m: '#1a0a0a', d: '#2a1a10' } },
  mycelid: { from: 'golem', p: { k: K, g: '#6a4a7a', G: '#9a6aaa', e: '#7ae0c0' } },
  slag: { from: 'golem', p: { k: K, g: '#3a2a24', G: '#ff7a2a', e: '#ffd06a' } },
  automaton: { from: 'golem', p: { k: K, g: '#8a6a2a', G: '#d9a845', e: '#6fd0ff' } },
  anvil: { from: 'golem', p: { k: K, g: '#2a2a30', G: '#ff7a2a', e: '#ff4a2a' } },
  orrery: { from: 'golem', p: { k: K, g: '#6a5a2a', G: '#ffd060', e: '#c0a0ff' } },
  imp: { from: 'imp', p: { k: K, h: '#2a1a1a', i: '#c0402a', e: '#ffd06a', m: '#2a0a0a' } },
  gearspider: { from: 'imp', p: { k: K, h: '#5a4a20', i: '#a08040', e: '#6fd0ff', m: '#2a2a2a' } },
  toad: { from: 'toad', p: { k: K, t: '#6a7a2a', T: '#9aaa4a', e: '#ffdd3b', m: '#2a2a10' } },
  swarm: { from: 'toad', p: { k: K, t: '#4a5a1a', T: '#7a8a3a', e: '#ff4a2a', m: '#1a1a08' } },
  bloom: { from: 'toad', p: { k: K, t: '#5a3a6a', T: '#9a6aaa', e: '#7ae0c0', m: '#2a1a2a' } },
  voidmoth: { from: 'moth', p: { k: K, w: '#2a2050', W: '#c0a0ff', b: '#4a3a7a', e: '#ffffff' } },
  star: { from: 'moth', p: { k: K, w: '#c08030', W: '#ffe070', b: '#ffd06a', e: '#ff4a2a' } },
  hag: { from: 'monk', p: { k: K, m: '#4a3a24', M: '#6a5434', g: '#ff8a3a', c: '#3a2a1a', z: '#5a7a3a' } },
  sporecaller: { from: 'monk', p: { k: K, m: '#4a2a5a', M: '#6a3a7a', g: '#7ae0c0', c: '#4a3a5a', z: '#7ae0c0' } },
  eelpriest: { from: 'monk', p: { k: K, m: '#1f4a4a', M: '#2f6a6a', g: '#bfe0ff', c: '#3a5a6a', z: '#6fa0ff' } },
  lich: { from: 'priest', p: { k: K, w: '#5a4a6a', W: '#7a6a8a', r: '#c060ff', b: '#e9dcc0', s: '#1a0a2a' } },
  startouched: { from: 'priest', p: { k: K, w: '#2a2050', W: '#463e6c', r: '#c0a0ff', b: '#e0d0ff', s: '#100a20' } },
  queen: { from: 'priest', p: { k: K, w: '#bfe0f0', W: '#ffffff', r: '#6fd0ff', b: '#e9f4ff', s: '#2a4a6a' } },
  choir: { from: 'priest', p: { k: K, w: '#7a1a2a', W: '#a8202a', r: '#ffd060', b: '#e9dcc0', s: '#2a0a0a' } },
  inkwraith: { from: 'necro', p: { k: K, n: '#0a0a0e', N: '#1e1e28', v: '#e2cfa2', s: '#2a2a2a', b: '#e2cfa2' } },
  unwritten: { from: 'necro', p: { k: K, n: '#e2cfa2', N: '#b59a68', v: '#1a1a1a', s: '#3a2a1a', b: '#1a1a1a' } },
  wight: { from: 'ghoul', p: { k: K, g: '#8aa8c0', G: '#bfe0f0', d: '#5a7890', r: '#9fe8ff', m: '#2a3a4a', c: '#ffffff' } },
  flagellant: { from: 'ghoul', p: { k: K, g: '#b08c6c', G: '#d0a888', d: '#8a5a3a', r: '#ff2a2a', m: '#4a0a0a', c: '#a3202a' } },
  warden: { from: 'ghoul', p: { k: K, g: '#cfc4ad', G: '#efe6d2', d: '#8a7a6a', r: '#ff8a3a', m: '#1a1010', c: '#e9dcc0' } },
  drowned: { from: 'ghoul', p: { k: K, g: '#4a6a6a', G: '#6a8a8a', d: '#2a4a4a', r: '#bfe0ff', m: '#0a1a1a', c: '#2f5a5a' } },
  gargoyle: { from: 'golem', p: { k: K, g: '#5a5a62', G: '#8a8a94', e: '#ff4a2a' } },
  cultist: { from: 'monk', p: { k: K, m: '#5a0a12', M: '#8a1420', g: '#ff4a4a', c: '#2a0a0a', z: '#ff2a2a' } },
  wisp: { from: 'moth', p: { k: K, w: '#6fa0c0', W: '#e9f4ff', b: '#bfe0f0', e: '#2a6aa0' } },
  ashling: { from: 'imp', p: { k: K, h: '#ffd06a', i: '#ff7a2a', e: '#ffffff', m: '#3a0a04' } },
  shade: { from: 'ghoul', p: { k: '#000000', g: '#1a1420', G: '#2a2234', d: '#0e0a12', r: '#c060ff', m: '#000000', c: '#3a2a4a' } },
  bloodarcher: { from: 'xbow', p: { k: K, i: '#5a1a1a', I: '#8a2a2a', s: '#b08c6c', l: '#4a1a1a', L: '#6a2a2a', w: '#3a1a1a', b: '#2b1d14', r: '#ff2a2a' } },
  bellringer: { from: 'grasp', p: { k: K, t: '#1f3a5a', T: '#3a6a9a', y: '#ffe070', m: '#0a1a2a' } },
};

const pickupRows = (rows: string[]) => [...Array(16 - rows.length).fill('................'), ...rows];
const EXTRA: Record<string, SpriteDef> = {
  pot_oil: { p: { k: K, w: '#8a6a4a', c: '#d09020', C: '#ffd060', f: '#ff7a2a' }, r: pickupRows([
    '.......ff.......', '.......kk.......', '......kwwk......', '.....kccCck.....', '....kcccCcck....', '....kccccCck....', '....kcccccck....', '.....kcccck.....', '......kkkk......', '................', '................']) },
  pot_food: { p: { k: K, b: '#a06a3a', B: '#d0a060', m: '#8a2a2a' }, r: pickupRows([
    '......kkkk......', '....kkbbbbkk....', '...kbbBBbbbbk...', '...kbBbbbbmbk...', '...kbbbbbmmbk...', '....kkkkkkkk....', '................', '................', '................']) },
  pot_herb: { p: { k: K, g: '#4a7a2a', G: '#7fbf3f', s: '#3a2a1a' }, r: pickupRows([
    '.....k...k......', '....kGk.kGk.....', '...kGgk.kgGk....', '....kgkkkgk.....', '.....kgggk......', '......kgk.......', '......ksk.......', '.....kssssk.....', '................']) },
  pot_chest: { p: { k: K, w: '#6a4a2a', W: '#8a6a3a', g: '#e0b040' }, r: pickupRows([
    '...kkkkkkkkkk...', '..kwWWWWWWWWwk..', '..kwwwwwwwwwwk..', '..kkkkkggkkkkk..', '..kwwwwggwwwwk..', '..kwwwwwwwwwwk..', '..kwWwwwwwwWwk..', '..kkkkkkkkkkkk..', '................']) },
  pot_shrine: { p: { k: K, s: '#4a3a40', S: '#6a5a60', r: '#ff2a3a' }, r: pickupRows([
    '.......kk.......', '......ksSk......', '......ksSk......', '.....ksrrSk.....', '.....ksrrSk.....', '.....kssSSk.....', '....kssssSSk....', '...kkkkkkkkkk...', '................']) },
  pot_key: { p: { k: K, g: '#e0b040', G: '#ffe070' }, r: pickupRows([
    '....kkkk........', '...kgGGgk.......', '...kg..gk.......', '...kgGGgk.......', '....kggkkkkkkk..', '.....kkgggggggk.', '..........kgkgk.', '..........kk.kk.', '................']) },
  pot_vault: { p: { k: K, i: '#3a3a44', I: '#6a6a78', g: '#d9a845' }, r: pickupRows([
    '..kkkkkkkkkkkk..', '.kiIIIIIIIIIIik.', '.kiiiiiiiiiiiik.', '.kiikkkiikkkiik.', '.kiikgkiikgkiik.', '.kiikkkiikkkiik.', '.kiiiiiiiiiiiik.', '.kIiiiiiiiiiiIk.', '.kkkkkkkkkkkkkk.', '................']) },
  pot_brazier: { p: { k: K, i: '#4a4a52', I: '#7a7a84', a: '#3a2a20' }, r: pickupRows([
    '..kkkkkkkkkkkk..', '..kaaaaaaaaaak..', '...kIiiiiiiIk...', '....kiiiiiik....', '......kiik......', '......kiik......', '.....kiiiik.....', '....kkkkkkkk....', '................']) },
};

function draw(def: SpriteDef): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d')!;
  def.r.forEach((row, y) => {
    for (let x = 0; x < row.length && x < 16; x++) {
      const col = def.p[row[x]];
      if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
    }
  });
  return c;
}

function overlay(src: HTMLCanvasElement, color: string, mode: GlobalCompositeOperation, keepBase: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = mode;
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  if (!keepBase) return c;
  return c;
}

/** A 1px-dilated white silhouette (18x18) used for threat and target outlines via tint. */
function outline(src: HTMLCanvasElement): HTMLCanvasElement {
  const sil = overlay(src, '#ffffff', 'source-in', false);
  const c = document.createElement('canvas');
  c.width = 18;
  c.height = 18;
  const g = c.getContext('2d')!;
  for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) g.drawImage(sil, dx, dy);
  return c;
}

export interface SpriteSet { base: Texture; dead: Texture; ice: Texture; white: Texture; outline: Texture; canvas: HTMLCanvasElement }

export function spriteSet(def: SpriteDef): SpriteSet {
  const base = draw(def);
  return {
    canvas: base,
    base: Texture.from(base),
    dead: Texture.from(overlay(base, 'rgba(25,8,8,0.55)', 'source-atop', true)),
    ice: Texture.from(overlay(base, 'rgba(140,210,255,0.55)', 'source-atop', true)),
    white: Texture.from(overlay(base, '#ffffff', 'source-in', false)),
    outline: Texture.from(outline(base)),
  };
}

export function buildSprites(): Record<string, SpriteSet> {
  const out: Record<string, SpriteSet> = {};
  for (const [k, v] of Object.entries(VARIANTS)) {
    const rows = TPL[v.from] ?? SPRITES[v.from]?.r;
    if (rows) out[k] = spriteSet({ p: { ...(SPRITES[v.from]?.p ?? {}), ...v.p }, r: rows });
  }
  for (const [k, def] of Object.entries(EXTRA)) out[k] = spriteSet(def);
  for (const [k, def] of Object.entries(SPRITES)) {
    const base = draw(def);
    out[k] = {
      canvas: base,
      base: Texture.from(base),
      dead: Texture.from(overlay(base, 'rgba(25,8,8,0.55)', 'source-atop', true)),
      ice: Texture.from(overlay(base, 'rgba(140,210,255,0.55)', 'source-atop', true)),
      white: Texture.from(overlay(base, '#ffffff', 'source-in', false)),
      outline: Texture.from(outline(base)),
    };
  }
  return out;
}


// ---- the spellwright paper doll (see doll.ts)
export function wizardSprite(look: Look): SpriteSet {
  return spriteSet(paintDoll(look));
}

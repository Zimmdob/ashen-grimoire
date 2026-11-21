// Camp encounters: each spellwright meets one stranger at the fire per camp and makes a choice.
// Every choice is deterministic given the world's RNG, so co-op stays in lockstep.

import type { PlayerState, Unit, World } from './types';
import { corrupt, grantGear, grantRune, heal, log } from './combat';
import { rand } from './rng';
import { CARDS } from './cards';

export interface EventChoice {
  label: string;
  /** Returns a reason the choice is unavailable, or null. */
  needs?: (ps: PlayerState, u: Unit) => string | null;
  run: (w: World, ps: PlayerState, u: Unit) => string;
}
export interface EventDef { name: string; text: string; choices: EventChoice[] }

// ---- Sydney, the Lantern-Wright: a wandering teacher who turns up at camp now and then, looks over
// your grimoire, gives it a grade, and teaches you something.
export const SYDNEY_LOOK = { race: 0, gender: 1, build: 2, skin: 1, hair: 3, hairColor: 9, beard: 0, eyes: 1, outfit: 0, robe: 6, trim: 0, head: 3, orb: 0 };

/** Her grade for a grimoire: more spells and more inscriptions earn a better mark. */
const GRADE_NOTES: Record<string, string> = {
  'A+': 'Gold star. Honestly, I could not have written this better myself.',
  A: 'Neat, thorough, and you even showed your work. I am proud of you.',
  'B+': 'Good effort. A few more spells and this is top of the class.',
  B: 'Solid, but your margins are full of scorch marks. Neater, please.',
  C: 'This is a good start, but it is a little thin. Let me help.',
};
export function sydneyGrade(ps: PlayerState): { grade: string; note: string } {
  if (ps.event?.grade && GRADE_NOTES[ps.event.grade]) return { grade: ps.event.grade, note: GRADE_NOTES[ps.event.grade] };
  const marks = Object.values(ps.cardLevels).reduce((a, b) => a + b, 0);
  const score = ps.cards.length + marks * 2;
  if (score >= 16) return { grade: 'A+', note: 'Gold star. Honestly, I could not have written this better myself.' };
  if (score >= 12) return { grade: 'A', note: 'Neat, thorough, and you even showed your work. I am proud of you.' };
  if (score >= 9) return { grade: 'B+', note: 'Good effort. A few more spells and this is top of the class.' };
  if (score >= 6) return { grade: 'B', note: 'Solid, but your margins are full of scorch marks. Neater, please.' };
  return { grade: 'C', note: 'This is a good start, but it is a little thin. Let me help.' };
}

/** What she offers, chosen when camp is made: three spells you lack, and one you know to mark up. */
export function sydneyOffer(w: World, ps: PlayerState): string[] {
  const allowed = w.opts.pool?.length ? new Set(w.opts.pool) : null;
  const lacks = Object.keys(CARDS).filter((c) => !ps.cards.includes(c) && !CARDS[c].cls && (!allowed || allowed.has(c)));
  const pick: string[] = [];
  while (pick.length < 3 && lacks.length) pick.push(lacks.splice(Math.floor(rand(w) * lacks.length), 1)[0]);
  const known = ps.cards.filter((c) => CARDS[c].mode !== 'mod' && (ps.cardLevels[c] ?? 0) < 2);
  pick.push(known.length ? known[Math.floor(rand(w) * known.length)] : '');
  return pick;
}

function sydneyEvent(ps: PlayerState): EventDef {
  const offer = ps.event?.offer ?? [];
  const { grade, note } = sydneyGrade(ps);
  const learn = offer.slice(0, 3).filter(Boolean).map((c): EventChoice => ({
    label: `Learn ${CARDS[c].name}`,
    run: (_w, p) => { if (!p.cards.includes(c)) p.cards.push(c); return `She guides your hand through the sigils. ${CARDS[c].name} is yours. "Practise that one tonight."`; },
  }));
  const ink = offer[3];
  const mark: EventChoice[] = ink ? [{
    label: `Have her mark up ${CARDS[ink].name}`,
    run: (_w, p) => { p.cardLevels[ink] = Math.min(2, (p.cardLevels[ink] ?? 0) + 1); return `She corrects three lines and underlines one twice. ${CARDS[ink].name} grows stronger. "See? Much better."`; },
  }] : [];
  return {
    name: 'Sydney, the Lantern-Wright',
    text: `A red-haired witch in a wide-brimmed hat sits down by your fire, lantern in her lap. "Let me see your homework." She leafs through your grimoire and writes a big ${grade} on the first page. "${note}" Then she offers to teach you something.`,
    choices: [...learn, ...mark],
  };
}

/** The event a player faces at camp (Sydney's is built from her offer). */
export function eventFor(ps: PlayerState): EventDef | null {
  if (!ps.event) return null;
  return ps.event.id === 'sydney' ? sydneyEvent(ps) : EVENTS[ps.event.id] ?? null;
}

const mats = (k: keyof PlayerState['mats'], n: number) => (ps: PlayerState) => (ps.mats[k] >= n ? null : `needs ${n} ${k}`);

export const EVENTS: Record<string, EventDef> = {
  pilgrim: {
    name: 'The Blind Pilgrim',
    text: 'A blind pilgrim sits at your fire and asks for something to eat.',
    choices: [
      { label: 'Share a meal (−1 fed)', needs: (ps) => (ps.satiety > 0 ? null : 'you have nothing to share'),
        run: (w, ps) => { ps.satiety--; const r = grantRune(w, ps); return r ? 'He blesses you with a rune before he goes.' : 'He thanks you and walks into the dark.'; } },
      { label: 'Rob him (+2 moss, +1 tallow, +10 corruption)', run: (w, ps) => { ps.mats.herb += 2; ps.mats.tallow += 1; corrupt(w, ps, 10); return 'He does not resist. You feel worse for it.'; } },
      { label: 'Send him away', run: () => 'He shuffles off without a word.' },
    ],
  },
  well: {
    name: 'The Wishing Well',
    text: 'A well of black water. Bones glint at the bottom.',
    choices: [
      { label: 'Toss in 2 bones (heal 30%)', needs: mats('bone', 2), run: (w, ps, u) => { ps.mats.bone -= 2; heal(w, u, Math.round(u.maxHp * 0.3)); return 'Warmth spreads through your chest.'; } },
      { label: 'Drink deep (a gamble)', run: (w, ps, u) => {
        if (rand(w) < 0.5) { u.maxHp += 15; u.hp += 15; return 'The water is sweet. +15 max health.'; }
        u.poison += 15; return 'The water is foul. You are poisoned.';
      } },
      { label: 'Leave it be', run: () => 'You let the well keep its secrets.' },
    ],
  },
  oracle: {
    name: 'The Hooded Oracle',
    text: 'A hooded figure offers to read your fate, for a price.',
    choices: [
      { label: 'Pay 10 health (a find)', needs: (_, u) => (u.hp > 10 ? null : 'too weak'), run: (w, ps, u) => { u.hp -= 10; const g = grantGear(w, ps); return g ? 'She presses something into your hand.' : 'Your bag is full; she shrugs.'; } },
      { label: 'Pay 2 spell ink (a new spell)', needs: mats('ink', 2), run: (w, ps) => {
        ps.mats.ink -= 2;
        const left = Object.keys(CARDS).filter((c) => !ps.cards.includes(c) && !CARDS[c].cls && (!w.opts.pool?.length || w.opts.pool.includes(c)));
        if (!left.length) return 'She has nothing left to teach.';
        const c = left[Math.floor(rand(w) * left.length)];
        ps.cards.push(c);
        return `She whispers a spell: ${CARDS[c].name}.`;
      } },
      { label: 'Decline', run: () => 'She laughs softly and is gone.' },
    ],
  },
  caravan: {
    name: 'The Ghost Caravan',
    text: 'Pale merchants with lanterns that never flicker. They trade, but not for coin.',
    choices: [
      { label: 'Trade 3 bones (a find)', needs: mats('bone', 3), run: (w, ps) => { ps.mats.bone -= 3; return grantGear(w, ps) ? 'A fair trade, by their reckoning.' : 'Your bag is full.'; } },
      { label: 'Trade 2 tallow (+60 oil)', needs: mats('tallow', 2), run: (_, ps) => { ps.mats.tallow -= 2; ps.oil = Math.min(ps.maxOil, ps.oil + 60); return 'Your lantern burns bright.'; } },
      { label: 'Let them pass', run: () => 'The caravan fades into the mist.' },
    ],
  },
  altar: {
    name: 'The Blood Altar',
    text: 'An altar slick with old blood. It hungers.',
    choices: [
      { label: 'Bleed 15 (strengthen a spell, +10 corruption)', needs: (_, u) => (u.hp > 15 ? null : 'too weak'), run: (w, ps, u) => {
        u.hp -= 15;
        corrupt(w, ps, 10);
        const ok = ps.cards.filter((c) => CARDS[c].mode !== 'mod' && (ps.cardLevels[c] ?? 0) < 2);
        if (!ok.length) return 'The altar drinks, and gives nothing back.';
        const c = ok[Math.floor(rand(w) * ok.length)];
        ps.cardLevels[c] = (ps.cardLevels[c] ?? 0) + 1;
        return `${CARDS[c].name} grows stronger.`;
      } },
      { label: 'Smash it (−10 corruption)', run: (w, ps) => { ps.corruption = Math.max(0, ps.corruption - 10); return 'The stone cracks. The air clears.'; } },
    ],
  },
  knight: {
    name: 'The Wounded Knight',
    text: 'A knight in rusted mail lies bleeding by the road.',
    choices: [
      { label: 'Tend him (2 grave moss)', needs: mats('herb', 2), run: (w, ps) => { ps.mats.herb -= 2; const g = grantGear(w, ps); ps.corruption = Math.max(0, ps.corruption - 5); return g ? 'Grateful, he gives you what he carried.' : 'Grateful, he blesses you.'; } },
      { label: 'Take his mail (+15 corruption)', run: (w, ps) => {
        corrupt(w, ps, 15);
        if (ps.bag.length < 6 && !ps.bag.includes('ironmail') && ps.gear.cloak !== 'ironmail') { ps.bag.push('ironmail'); return 'You take the Rusted Mail. He watches you go.'; }
        return 'You take what you can. It is not much.';
      } },
      { label: 'Walk on', run: () => 'His breathing stops behind you.' },
    ],
  },
  moths: {
    name: 'The Glowing Moths',
    text: 'A cloud of moths that shine like embers circles your lantern.',
    choices: [
      { label: 'Catch them (+40 oil)', run: (_, ps) => { ps.oil = Math.min(ps.maxOil, ps.oil + 40); return 'They burn bright in your lantern.'; } },
      { label: 'Follow them (+1 ink, +1 rime)', run: (_, ps) => { ps.mats.ink++; ps.mats.rime++; return 'They lead you to a frozen scriptorium.'; } },
    ],
  },
  dice: {
    name: 'The Dicing Demon',
    text: 'A grinning thing with a cup of knucklebones. "One throw, spellwright."',
    choices: [
      { label: 'Throw (+60 upgrade points, or −20 max health)', run: (w, ps, u) => {
        if (rand(w) < 0.5) { ps.bountyPoints += 60; return 'Sixes. 60 upgrade points at the next portal.'; }
        const loss = Math.min(20, u.maxHp - 10);
        u.maxHp -= loss; ps.starveLoss += loss; u.hp = Math.min(u.hp, u.maxHp);
        return 'Snake eyes. −20 max health until your next meal.';
      } },
      { label: 'Refuse', run: () => 'It sulks back into the shadows.' },
    ],
  },
  grave: {
    name: 'The Mass Grave',
    text: 'A pit of the unburied dead.',
    choices: [
      { label: 'Dig (+4 bones, +5 corruption)', run: (w, ps) => { ps.mats.bone += 4; corrupt(w, ps, 5); return 'You take what the dead no longer need.'; } },
      { label: 'Bury them (−8 corruption)', run: (_, ps) => { ps.corruption = Math.max(0, ps.corruption - 8); return 'It takes all night. You feel lighter.'; } },
    ],
  },
  smith: {
    name: 'The Ghost Smith',
    text: 'A spectral smith works a forge that gives no heat.',
    choices: [
      { label: 'Pay 2 ember shards (+20 stamina for good)', needs: mats('ember', 2), run: (_, ps, u) => { ps.mats.ember -= 2; u.maxStam += 20; return 'Your boots are reshod. +20 stamina.'; } },
      { label: 'Pay 2 rimeglass (+15 max health)', needs: mats('rime', 2), run: (_, ps, u) => { ps.mats.rime -= 2; u.maxHp += 15; u.hp += 15; return 'Your armour is mended. +15 max health.'; } },
      { label: 'Watch him work', run: (_, ps, u) => { ps.chill = 0; u.stam = u.maxStam; return 'Somehow you feel rested.'; } },
    ],
  },
};
export const EVENT_IDS = Object.keys(EVENTS);

/** Resolve a player's choice. Returns the outcome text, or an error. */
export function chooseEvent(w: World, ps: PlayerState, u: Unit, choice: number): { ok: boolean; text: string } {
  if (!ps.event || ps.event.done) return { ok: false, text: 'No one waits at the fire' };
  const ev = eventFor(ps);
  const c = ev?.choices[choice];
  if (!c) return { ok: false, text: 'No such choice' };
  const why = c.needs?.(ps, u);
  if (why) return { ok: false, text: why };
  const text = c.run(w, ps, u);
  ps.event.done = true;
  ps.event.result = text;
  log(w, `${ps.name}: ${text}`);
  return { ok: true, text };
}

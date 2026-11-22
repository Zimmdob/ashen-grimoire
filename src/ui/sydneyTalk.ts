// Talking with Sydney at camp. Asking her things costs nothing and changes nothing in the
// simulation (so co-op stays in step): she reads the road ahead, gives advice that fits where you
// are, and chats. Several answers rotate so repeat visits stay fresh.

import { BIOMES } from '../sim/biomes';
import { T_LAVA } from '../sim/constants';
import { CARDS } from '../sim/cards';
import { CLASSES } from '../sim/character';
import { UNITS } from '../sim/units';
import type { PlayerState, Unit, World } from '../sim/types';

export interface Question { id: string; label: string; answer: () => string }

const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

export function sydneyQuestions(w: World, ps: PlayerState, u: Unit): Question[] {
  const next = (w.run.route[w.run.tier + 1] ?? []).map((id) => BIOMES[id]).filter(Boolean);
  const cls = CLASSES[ps.cls]?.name ?? 'spellwright';
  return [
    {
      id: 'who', label: 'Who are you?',
      answer: () => pick([
        'Sydney. I keep the lanterns lit out here. Somebody has to, or the whole Reach goes dark and stays that way.',
        'A teacher, once. Still am, really. My classroom just has more ghouls in it now.',
        'Just a witch with a lantern and too many students. Hold still, you have soot on your face.',
      ]),
    },
    {
      id: 'ahead', label: 'What lies ahead?',
      answer: () => {
        if (!next.length) return 'The Throne. The Hollow King is waiting for you. Whatever happens in there, I am proud of how far you came.';
        const say = (b: (typeof next)[number]) => {
          const lord = UNITS[b.boss]?.name ?? 'something old';
          const warn = b.cold ? ' Wrap up warm, it is freezing.' : b.oilMul > 1 ? ' Mind your lantern, the dark there drinks oil.' : b.liquid === T_LAVA ? ' Watch your step, there is lava everywhere.' : '';
          return `${b.name}? ${lord} waits at the end of it.${warn}`;
        };
        return next.length > 1
          ? `I have walked both roads. ${next.map(say).join(' And ')} Choose the one that suits your spells, not your pride.`
          : `Only one road from here. ${say(next[0])} Be careful.`;
      },
    },
    {
      id: 'advice', label: 'Any advice?',
      answer: () => {
        const tips: string[] = []; // what matters right now comes first
        if (ps.oil < ps.maxOil * 0.4) tips.push('Your lantern is running low. Brew oil from tallow, or grab every flask you see. The Shades come when the light goes.');
        if (u.hp < u.maxHp * 0.5) tips.push('You are hurt. Rest by the fire tonight, please. For me.');
        if (ps.corruption >= 50) tips.push('That corruption is getting into your handwriting. Go easy on the blood magic for a while.');
        if (ps.cards.length < 6) tips.push('Your grimoire is thin. Take every new spell the portals offer you until it fills out.');
        if (!Object.values(ps.cardLevels).some((l) => l > 0)) tips.push('Spell ink! Inscribe your favourite spell at camp. One good spell beats three mediocre ones.');
        if (tips.length) return pick(tips);
        return pick([
          'Shove things into lava. It is not elegant, but it works every single time.',
          'If something is outlined in red, it can reach you next turn. Do not be standing there.',
          'Each card costs more every time you cast it on a floor. Mix it up.',
          `You are a ${cls}. Lean into it. The Reach rewards people who know what they are.`,
          'Circle of Binding before a big spell. Hit everything, not just the one in front of you.',
        ]);
      },
    },
    {
      id: 'doing', label: 'How am I doing?',
      answer: () => {
        const best = Object.entries(ps.uses).sort((a, b) => b[1] - a[1])[0]?.[0];
        const fav = best ? ` I see you lean on ${CARDS[best]?.name ?? best}. Good choice.` : '';
        if (w.level <= 2) return `You only just started, and you are still standing. That is more than most.${fav}`;
        if (w.run.bossesSlain >= 2) return `${w.run.bossesSlain} lords of the Reach, gone. People are going to tell stories about you.${fav}`;
        return pick([
          `Depth ${w.level}, ${w.kills} foes behind you. You are getting good at this.${fav}`,
          `Honestly? Better than I expected. Do not let it go to your head.${fav}`,
        ]);
      },
    },
    {
      id: 'king', label: 'Tell me about the Hollow King.',
      answer: () => pick([
        'He was a king who was afraid of the dark, so he swallowed every light in the Reach. Now he is the dark. Bring a lantern. Bring two.',
        'He feeds on what you are scared of. So do not be scared. Or at least, do not let him see it.',
      ]),
    },
    {
      id: 'lantern', label: 'What is in your lantern?',
      answer: () => pick([
        'A little bit of every sunrise I have ever watched. It burns longer that way.',
        'Tallow, mostly. And a wish. Do not tell anyone about the wish.',
        'Moths, sometimes. They like it in there. We have an arrangement.',
      ]),
    },
    {
      id: 'why', label: 'Why do you help me?',
      answer: () => pick([
        'Because somebody helped me once, when it was dark and I was lost. You pass that on.',
        'Because I like you. Is that not reason enough?',
        'Every student deserves someone in their corner. I chose you. Now go make me proud.',
      ]),
    },
  ];
}

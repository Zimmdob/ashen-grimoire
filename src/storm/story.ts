// The story of Cinderstorm, told in small pieces: the people of the Last Hearth, what the bosses
// say, the pages of the codex, and how it ends.
//
// The Reach was written. Every hill and every soul of it is a line in the Ashen Grimoire. A scribe
// who became a king tried to write himself without end, and tore out the last page so the book
// could never close. A story that cannot end begins to burn from its margins: that fire is the
// Cinderstorm. You are one of the Kindled: a character the Last Hearth keeps writing back into the
// book each time you fall, because someone has to reach the end.
import type { NpcId } from './progress';

export interface Npc { id: NpcId; name: string; title: string; act: number; sprite: string; station: string; blurb: string; rescue: string[] }
export const NPCS: Record<NpcId, Npc> = {
  rook: { id: 'rook', name: 'Mother Rook', title: 'the Hedge-Witch', act: 0, sprite: 'npc_rook', station: 'Rook’s Bargains', blurb: 'Strikes bargains: make the storm crueller, and carry more Ash home.',
    rescue: ['Cut me down, child. Gently. These briars have teeth and so do I.', 'You’re Kindled. I can smell the hearth-smoke on you.', 'Go on, then. I’ll find your fire. I always find the fire.'] },
  brannoch: { id: 'brannoch', name: 'Brannoch', title: 'the Bone-Smith', act: 1, sprite: 'npc_brannoch', station: 'The Tempering', blurb: 'Tempers you between runs: hearts, damage, mana and more, for Ash.',
    rescue: ['They kept me forging keys for the Warden. A hundred keys. Not one opened anything.', 'You fight like someone who knows they’ll get up again.', 'Bring me Ash. I’ll make you harder to burn.'] },
  ysolde: { id: 'ysolde', name: 'Ysolde', title: 'the Last Librarian', act: 2, sprite: 'npc_ysolde', station: 'The Library', blurb: 'Keeps the codex of everything you find, and teaches spell evolutions.',
    rescue: ['Mind the ice. And the books. Mostly the books.', 'The Lich has been counting. He counts the pages that are left. There are fewer every night.', 'I’ll catalogue what you find. Someone should remember all this properly.'] },
  hesk: { id: 'hesk', name: 'Hesk', title: 'the Tinker', act: 3, sprite: 'npc_hesk', station: 'Hesk’s Workshop', blurb: 'Builds contraptions: weekly mutator challenges and familiars.',
    rescue: ['Oh! A person. Not a gear. Lovely. Hand me that spanner, would you, no, the other, no...', 'The Orrery’s planets? Mine. I built them to show the stars. He made them shoot.', 'Take me to your hearth. I’ll build you something that isn’t a weapon. Mostly.'] },
  vell: { id: 'vell', name: 'Sister Vell', title: 'the Unsung', act: 4, sprite: 'npc_vell', station: 'The Silent Bell', blurb: 'Once sang in the Red Choir. She knows what the King tore out of the book.',
    rescue: ['I stopped singing. That is why they caged me. A choir cannot bear a silence.', 'The hymn was never praise. It was a lock. Every note holds the King’s page shut.', 'Find me at your hearth. I will tell you what I know, a little at a time. Truth burns too.'] },
};

/** What each of the Hearth's people says on successive visits; `need` gates a line on the story so far. */
export interface Line { text: string; need?: { wins?: number; rescued?: number; trueEnding?: boolean; met?: string } }
export const TALK: Record<NpcId | 'cass' | 'wanderer', Line[]> = {
  cass: [
    { text: 'Back again. The Hearth wrote you back in, same as always. Sit. Warm your hands. Then go and burn something that deserves it.' },
    { text: 'I am Cass. I keep this fire. That is all I do, and it is enough.' },
    { text: 'Every time you fall, the Hearth remembers you a little better. So do I.' },
    { text: 'There were others here, once. Tinkers, smiths, singers. The storm took them. Some may still be alive down there, if you look.' },
    { text: 'You hear that crackle? That is the Reach, burning at the edges. A book with no ending smoulders.', need: { rescued: 1 } },
    { text: 'More people at my fire than I have had in years. You have done that.', need: { rescued: 3 } },
    { text: 'You beat him. The Hollow King. And still the storm. Why does it not end?', need: { wins: 1 } },
    { text: 'Vell says the King tore out a page. If a story cannot end, perhaps someone must write the ending.', need: { rescued: 5, wins: 1 } },
    { text: 'It is quiet now. I keep the fire anyway. Habit. And in case you come home.', need: { trueEnding: true } },
  ],
  rook: [
    { text: 'Bargains, child. Make the storm bite harder and I’ll see you carry more home. Fair’s fair.' },
    { text: 'The Stag was gentle once. He walked the Greenwood like it was his own breath. The fire got into his antlers.' },
    { text: 'Never trust a door that offers you only good things. That’s not a door, that’s a mouth.' },
    { text: 'I bargained with the King, years back. Asked for one more spring. He wrote it. It was the last one.', need: { wins: 1 } },
  ],
  brannoch: [
    { text: 'Ash in, strength out. That’s the whole of smithing, when you get down to it.' },
    { text: 'The Warden wasn’t cruel. He was tidy. He wanted every bone in its proper place. Including mine.' },
    { text: 'You keep dying. I keep sharpening. We’re a good pair.' },
    { text: 'Heard you put the King down. Good. Heard he got back up. Less good.', need: { wins: 1 } },
  ],
  ysolde: [
    { text: 'Every page you bring me goes in the codex. Every spell you fuse, I write down. Someone should.' },
    { text: 'Spells can grow. Put the right cards together in one spell and they become something else. I’ve noted the ones I know.' },
    { text: 'The Lich was the King’s scribe. He counted the pages so his master would know how long he had left.' },
    { text: 'The Grimoire has a last page. It’s missing. Everything that’s wrong is wrong because of that.', need: { rescued: 4 } },
  ],
  hesk: [
    { text: 'Every week I build a new contraption for the storm. Twist the rules, see what breaks! Mostly foes, I hope.' },
    { text: 'Familiars are just little machines with opinions. I can make you more.' },
    { text: 'I built the Orrery to show the King the stars. He wanted to own them instead. Classic king.' },
  ],
  vell: [
    { text: 'The Red Choir sings so the King’s page stays shut. I stopped. Now the silence follows me. Listen.' },
    { text: 'The King was a scribe once. The finest hand in the Reach. He wrote himself a crown.' },
    { text: 'He tried to write himself forever, and the book would not allow it. So he tore out the ending.', need: { rescued: 5 } },
    { text: 'The torn page is in the Abyss, beneath his throne. It wants to be written. Take my bell. Ring it when he falls.', need: { rescued: 5, wins: 1 } },
    { text: 'You wrote it. I can hear the book breathing again.', need: { trueEnding: true } },
  ],
  wanderer: [
    { text: 'A pale figure sits by the path, turning blank pages. "Not yet," he says, to no one. "Not yet."' },
    { text: '"You again." He smiles without warmth. "Do you know how many times the Hearth has written you? I have counted."' },
    { text: '"A character who knows they are written. How rare." He turns a page. It is empty. "How sad."' },
    { text: '"When you reach the bottom of everything, you will find me there. Bring a pen."', need: { wins: 1 } },
    { text: 'The path is empty. Only a single blank page remains, weighted with a stone.', need: { trueEnding: true } },
  ],
};

/** What the bosses say: on the first meeting, on later ones, and when they fall. */
export const BOSS_LINES: Record<string, { first: string; again: string[]; fall: string; truePath?: string }> = {
  stag: { first: 'The Old Stag lowers antlers wreathed in fire. Something behind its eyes still remembers being gentle.', again: ['The Stag paws the ash. It knows you.', 'The Greenwood’s eldest rises again. So do you.'], fall: 'The fire leaves its antlers. For a moment, it is only a deer, and then it is only ash.' },
  warden: { first: '"Prisoner. Out of your cell. Unacceptable." Keys clatter on the Warden’s belt like teeth.', again: ['"You again. I have a cell with your name on it. I have a cell with everyone’s name on it."', '"Order. Order. ORDER."'], fall: '"A key... that fits..." The Warden falls apart neatly, every bone in its proper place.' },
  lich: { first: '"Four hundred and twelve pages remain," the Lich whispers. "Four hundred and eleven. You are wasting them."', again: ['"Fewer pages than last time. I counted."', '"Still counting. Still you."'], fall: '"Count... for me..." Frost cracks across the Lich, and the numbers stop.' },
  orrery: { first: 'The Brass Orrery unfolds, planets of fire wheeling on their arms. Every star in it is aimed at you.', again: ['The planets realign. They have learned your orbit.', 'Hesk’s machine, turned to the King’s purpose, wakes again.'], fall: 'The planets slow, and stop, and for a moment show the true positions of the stars.' },
  choir: { first: 'A hundred voices rise as one. Every note of the Red Choir is a knife, and every knife is in tune.', again: ['The hymn swells. It is the same hymn. It has always been the same hymn.', 'The Choir draws breath.'], fall: 'The hymn breaks. In the silence, somewhere far below, a page stirs.', truePath: 'Vell’s silence rings louder than the hymn. The Choir falters on the very first note.' },
  king: { first: '"Kneel, character. I wrote the Reach. I can write you out of it."', again: ['"You are a sentence I keep striking out."', '"Again? The Hearth is stubborn. So am I."'], fall: '"Not... the end... there is no end... I made sure..."', truePath: '"You carry the Bell. So. Someone finally wants to read me my ending."' },
  unwritten: { first: 'Beneath the throne, a single page burns without being consumed. Words crawl across it, and run, and are unwritten.', again: ['The page turns to face you. It is blank, and it is furious.'], fall: 'The page falls still. The words settle. They are yours.' },
};

/** Pages of the codex: lore found on the way. */
export const CODEX: Record<string, { title: string; text: string; how: string }> = {
  hearth: { title: 'The Last Hearth', text: 'When the storm took the Reach, one fire refused to go out. Cass tends it still. It writes the Kindled back into the book when they fall, a little more certain of them each time.', how: 'Begin your first run.' },
  grimoire: { title: 'The Ashen Grimoire', text: 'Everything in the Reach is written in a single book: every hill, every river, every life. The book has a beginning, a middle, and, once, an ending.', how: 'Rescue someone.' },
  kindled: { title: 'The Kindled', text: 'Characters who know they are written. The Hearth makes them from ash and memory. They can fall. They cannot stay fallen, not while the fire burns.', how: 'Fall in battle.' },
  b_stag: { title: 'The Old Stag', text: 'Eldest of the Greenwood. Before the fire, it was said that wherever the Stag walked, spring followed a day behind.', how: 'Fell the Old Stag.' },
  b_warden: { title: 'The Bone Warden', text: 'Keeper of the King’s cells. It cannot abide disorder, and a world with no ending is the greatest disorder of all, though it would never admit it.', how: 'Fell the Bone Warden.' },
  b_lich: { title: 'The Frost Lich', text: 'Once the King’s own scribe. Now it counts the pages left unburned, so that its master always knows how long remains.', how: 'Fell the Frost Lich.' },
  b_orrery: { title: 'The Brass Orrery', text: 'Hesk built it to show the stars. The King turned every planet into a weapon and hung the sky above his forges.', how: 'Fell the Brass Orrery.' },
  b_choir: { title: 'The Red Choir', text: 'A hundred voices singing one hymn without end. The hymn is a lock. While it is sung, the torn page cannot be found.', how: 'Fell the Red Choir.' },
  b_king: { title: 'The Hollow King', text: 'A scribe with the finest hand in the Reach. He wrote himself a crown, then a throne, then forever. The book refused the last. So he tore out the ending.', how: 'Fell the Hollow King.' },
  b_unwritten: { title: 'The Unwritten Page', text: 'The ending of the Reach, torn out and hidden. It has been waiting a very long time for someone to write it.', how: 'Find what lies beneath the throne.' },
  n_rook: { title: 'Mother Rook', text: 'A hedge-witch of the Greenwood who trades in bargains. She once bargained with the King for one more spring. He gave it to her. It was the last.', how: 'Rescue Mother Rook.' },
  n_brannoch: { title: 'Brannoch', text: 'A smith kept in the Bone Cellars to forge keys for the Warden, a hundred keys, each opening nothing at all.', how: 'Rescue Brannoch.' },
  n_ysolde: { title: 'Ysolde', text: 'The last librarian of the Reach. If a thing is not written down, she says, it did not happen. She intends for all of this to have happened.', how: 'Rescue Ysolde.' },
  n_hesk: { title: 'Hesk', text: 'A tinker of the Forges who built clocks that told the right time even in the storm. The King did not like being told the time.', how: 'Rescue Hesk.' },
  n_vell: { title: 'Sister Vell', text: 'She sang in the Red Choir until she understood what the hymn was for. Then she stopped. A choir cannot bear a silence.', how: 'Rescue Sister Vell.' },
  wanderer: { title: 'The Pale Wanderer', text: 'A figure who appears on the storm-paths, reading blank pages. He seems to know how many times you have been written.', how: 'Meet the Wanderer.' },
  storm: { title: 'The Cinderstorm', text: 'A story with no ending smoulders from its margins inward. The storm is the Reach burning down to its last unfinished sentence.', how: 'Reach the Frost Ossuary.' },
  bell: { title: 'Vell’s Silent Bell', text: 'A bell with no clapper. When it is rung, nothing is heard, and every song in earshot forgets its words.', how: 'Hear all that Vell knows.' },
  ending: { title: 'The Last Line', text: 'You wrote it. What you wrote is yours to know. The storm went quiet. The Hearth still burns, in case.', how: 'Write the ending.' },
};
export const BOSS_CODEX: Record<string, string> = { stag: 'b_stag', warden: 'b_warden', lich: 'b_lich', orrery: 'b_orrery', choir: 'b_choir', king: 'b_king', unwritten: 'b_unwritten' };

export const ENDINGS = {
  king: { title: 'The King Falls', text: 'The Hollow King falls, and the storm stutters, and then, impossibly, it burns on. A story without an ending cannot be finished by killing a character in it. Cass will want to hear about this. So will the others.' },
  true: { title: 'The Last Line', text: 'The page takes your hand, or you take its edge. The words come easily. They were always going to be yours. The storm draws one long breath and goes out. Somewhere above, at a fire that no longer needs to burn, Cass lays down her poker and listens to the quiet. The Ashen Grimoire closes. It is a good book. It has an ending now.' },
};

/** The next thing someone says (advancing their story), respecting what the player has done. */
export function nextLine(who: keyof typeof TALK, said: number, ctx: { wins: number; rescued: number; trueEnding: boolean }): { text: string; index: number } {
  const lines = TALK[who];
  const ok = (l: Line) => !l.need || ((l.need.wins ?? 0) <= ctx.wins && (l.need.rescued ?? 0) <= ctx.rescued && (!l.need.trueEnding || ctx.trueEnding));
  const avail = lines.map((l, i) => ({ l, i })).filter((x) => ok(x.l));
  // walk through what's been unlocked so far; once heard out, the newest lines repeat
  const l = avail[Math.min(said, avail.length - 1)] ?? lines[0] as never;
  return { text: (l as { l: Line }).l?.text ?? lines[0].text, index: said + 1 };
}

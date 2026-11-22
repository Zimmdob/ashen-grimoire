// The Field Guide: one plain-spoken entry for every resource, material, pickup and condition.
// The same entries power the little cards that open when you hover or tap something in the HUD,
// so the explanation is always the same wherever you meet it.

export interface Entry {
  name: string;
  /** What it is, in a sentence. */
  what: string;
  /** How to get more of it (or how it comes about). */
  gain?: string;
  /** What it is spent on, or what happens when it runs out. */
  use?: string;
  group: 'Body' | 'Survival' | 'Materials' | 'On the map' | 'Conditions' | 'Party' | 'Between runs';
  color?: string;
}

export const GLOSSARY: Record<string, Entry> = {
  // ---------------------------------------------------------------- body
  health: { group: 'Body', name: 'Health', color: '#d84a3a',
    what: 'Your life. When it hits 0 you fall.',
    gain: 'Red potions (+40), Mend, Healing Salve at camp, Soul Siphon, Grave Pact.',
    use: 'Solo, falling ends the run. In co-op you are downed for 3 turns: a companion who stands beside you and presses Revive brings you back.' },
  ward: { group: 'Body', name: 'Ward', color: '#6fd0ff',
    what: 'A magic shield. Damage hits your ward before your health. It shows as "+N ward" on your health bar and a light-blue bar over any body.',
    gain: 'The Ward and Mirror Ward spells, a Bone Charm (3 bones at camp), the Wardstone charm, the Bone Plates mutation.',
    use: 'Lasts until it is used up or the depth ends. Last Rites cuts straight through it.' },
  mana: { group: 'Body', name: 'Mana', color: '#4a7aff',
    what: 'Pays for most spells.',
    gain: 'Refills by the amount shown each turn ("+60 a turn"). Blue potions give +40 and can fill you to twice your maximum.',
    use: 'Each card costs 25% more every time you cast it in the same turn, and goes back to normal next turn.' },
  souls: { group: 'Body', name: 'Soul fragments', color: '#9fe8ff',
    what: 'The Soulbinder pays for spells with souls instead of mana.',
    gain: 'Deaths within 100 of you give souls. Blue potions give +2.',
    use: 'Spent on spells. They do not refill on their own, so stay near the killing.' },
  fuel: { group: 'Body', name: 'Oil as spell fuel', color: '#ffd24a',
    what: 'The Lantern Keeper burns lantern oil to cast. The same oil keeps your light going.',
    gain: 'Oil flasks (+35), braziers (+25), blue potions (+40), Lantern Oil at camp (+50).',
    use: 'Spend carefully: an empty lantern brings Shades.' },
  stamina: { group: 'Body', name: 'Stamina', color: '#e0c040',
    what: 'How far you can walk this turn.',
    gain: 'Refills fully at the start of every turn. Yellow potions give +100 on top. Once a depth is cleared you can roam freely.',
    use: 'Walking spends it. The Hexblade also spends it on spells, and can bank up to twice the maximum. Being frozen through with cold halves it.' },

  // ---------------------------------------------------------------- survival
  lantern: { group: 'Survival', name: 'Lantern oil', color: '#ffb040',
    what: 'Your light in the dark. The percentage is how full your lantern is.',
    gain: 'Oil flasks (+35), braziers (+25, and they light the room and warm you), Lantern Oil crafted at camp from 2 tallow (+50).',
    use: 'Burns 3 a turn (more in some regions, and with the Hungry Dark curse). At 0, Shades come for you, up to three at a time.' },
  chill: { group: 'Survival', name: 'Cold', color: '#bff4ff',
    what: 'Cold regions, and being soaked in the Drowned Abbey, chill you a step each turn you are not warm.',
    gain: 'Stay warm: stand within reach of a torch or lit brazier, be burning, wear an Ember Cloak (2 ember shards) or a Fur Cloak.',
    use: 'At 3 you are frozen through: your stamina is halved each turn until you warm up.' },
  corruption: { group: 'Survival', name: 'Corruption', color: '#c04060',
    what: 'The price of dark magic. It only goes up unless you work it off.',
    gain: 'Raise Dead (+8), shrines (+15), and some cruel choices at camp. Blood Tongue doubles it.',
    use: 'Every 25 lets you pick a mutation: strong, but each has a drawback. Lower it with a Purging Draught (−10) or kind choices at camp.' },

  // ---------------------------------------------------------------- materials
  bone: { group: 'Materials', name: 'Bone', color: '#e8dfc8',
    what: 'Dropped by ghouls, crossbowmen, bone priests, necromancers, liches and other skeletal things.',
    use: 'Bone Charm at camp (3 bones): start the next depth with a 30 ward. The Wishing Well takes 2 for a big heal.' },
  tallow: { group: 'Materials', name: 'Tallow', color: '#e8d090',
    what: 'Fat from wolves, hounds, eel priests, toads and flagellants.',
    use: 'Lantern Oil (2 tallow: +50 oil).' },
  ember: { group: 'Materials', name: 'Ember shard', color: '#ff8a2a',
    what: 'Still-warm shards from slag golems, forge imps, automatons and the star-touched.',
    use: 'Ember Cloak (2): immune to cold for the next two depths.' },
  rime: { group: 'Materials', name: 'Rimeglass', color: '#9fdcff',
    what: 'Ice that never melts, carried by wights.',
    use: 'Rimeglass Ward (2): start the next depth fortified with +20 max health and a 20 ward.' },
  ichor: { group: 'Materials', name: 'Ichor', color: '#9acc3a',
    what: 'Foul fluid from spitters, plague monks, leeches, grasping hands and toads.',
    use: 'Healing Salve (1, with 2 moss: heals 40) and Purging Draught (1, with 1 moss: cleanses curses, −10 corruption).' },
  herb: { group: 'Materials', name: 'Grave moss', color: '#7fbf3f',
    what: 'From hags, mycelids, sporecallers and plague monks, and moss patches on the map.',
    use: 'Healing Salve (2, with 1 ichor: heals 40, or 60 for a Hedge Witch) and the Purging Draught.' },
  ink: { group: 'Materials', name: 'Spell ink', color: '#b48cff',
    what: 'From priests, necromancers, ink wraiths, liches, void moths and Shades.',
    use: 'At camp, inscribe a spell you know to make it 50% stronger (2 ink, then 3 for the second level), or learn a new spell (3).' },

  // ---------------------------------------------------------------- on the map
  p_hp: { group: 'On the map', name: 'Red potion', color: '#d84a3a', what: 'Walk over it to heal 40.' },
  p_mana: { group: 'On the map', name: 'Blue potion', color: '#4a7aff', what: 'Walk over it for +40 mana (it can overfill you). Soulbinders get +2 souls, Lantern Keepers +40 oil, Hexblades +80 stamina.' },
  p_stam: { group: 'On the map', name: 'Yellow potion', color: '#e0c040', what: 'Walk over it for +100 stamina this turn.' },
  p_oil: { group: 'On the map', name: 'Oil flask', color: '#ffb040', what: 'Walk over it for +35 lantern oil.' },
  p_brazier: { group: 'On the map', name: 'Brazier', color: '#ff8a2a', what: 'Walk into it to light it: +25 oil, it stays lit for the depth, lights the room and keeps you warm.' },
  p_chest: { group: 'On the map', name: 'Chest', color: '#e0b040', what: 'Gear or a rune.' },
  p_shrine: { group: 'On the map', name: 'Shrine', color: '#b3202a', what: 'A rune for you, at the price of 15 corruption.' },
  p_scroll: { group: 'On the map', name: 'Scroll', color: '#e0d0a0', what: 'Learn a random new spell.' },
  p_key: { group: 'On the map', name: 'Vault keys', color: '#d9a845', what: 'Some depths hide a vault and two keys. Find both, then walk into the vault: everyone gets a piece of gear and two random materials.' },
  p_trap: { group: 'On the map', name: 'Trap', color: '#cfc4ad', what: 'Spikes hidden in the floor: 30 damage to whoever steps on them. Shove foes onto them.' },

  // ---------------------------------------------------------------- conditions
  poison: { group: 'Conditions', name: 'Poisoned', color: '#7acc3a', what: 'Takes its poison as damage at the start of each turn, then the poison drops by 5.' },
  burn: { group: 'Conditions', name: 'Burning', color: '#ff8a2a', what: 'Takes 10 at the start of each turn for a few turns. Soaking puts it out. Burning also keeps you warm.' },
  frozen: { group: 'Conditions', name: 'Frozen', color: '#9fdcff', what: 'Loses its next turn (two if it was soaked). Shatter hits frozen targets for 60.' },
  frail: { group: 'Conditions', name: 'Frail', color: '#c080e0', what: 'Takes 50% more damage. Stacks.' },
  weak: { group: 'Conditions', name: 'Enfeebled', color: '#9a8a9a', what: 'Deals 25% less damage per stack, down to a quarter at most.' },
  fetter: { group: 'Conditions', name: 'Fettered', color: '#b0b0c0', what: 'Moves only half as far on its next turn.' },
  bloat: { group: 'Conditions', name: 'Bloated', color: '#9acc3a', what: 'Bursts when it dies: 40 damage to everything within 100, shoving them back. Do not stand close.' },
  wet: { group: 'Conditions', name: 'Soaked', color: '#4a9aff', what: 'From water or Flood, for 2 turns. Lightning does double, frost freezes longer, Steam Burst hits hard, and burning goes out.' },
  fortify: { group: 'Conditions', name: 'Fortified', color: '#d0c090', what: 'Takes half damage until the start of its next turn.' },
  empower: { group: 'Conditions', name: 'Empowered', color: '#ff7a3a', what: 'Its attacks deal 10 more damage, for good.' },

  // ---------------------------------------------------------------- party
  bond: { group: 'Party', name: 'Bond and Duet', color: '#ffd24a', what: 'Co-op only. Bond fills as you fight side by side: reviving each other, hitting the same foes, standing close.', use: 'At 100, press Duet: for one turn everyone\'s spells are free and half again as strong.' },
  downed: { group: 'Party', name: 'Downed', color: '#ff4a3a', what: 'In co-op, a fallen spellwright has 3 turns before they slip away.', use: 'Walk next to them and press Revive (R).' },
  cage: { group: 'Party', name: 'Cage', color: '#ff9a5a', what: 'Cagebearer only. Foes that die within 160 of you are caged (up to 3).', use: 'Unleash frees the oldest one to fight for you.' },
  hand: { group: 'Party', name: 'Hand', color: '#c0a0ff', what: 'Tarot Witch only. Each turn you draw a hand; each drawn card can be cast once that turn at 40% off.' },

  // ---------------------------------------------------------------- between runs
  ash: { group: 'Between runs', name: 'Ash', color: '#cfc4ad', what: 'Earned at the end of every run: more for deeper depths and bosses, multiplied by curses.', use: 'Spend it in the Sanctum on lasting upgrades.' },
  runes: { group: 'Between runs', name: 'Runes', color: '#b48cff', what: 'Small passive blessings for this run, from level-ups, chests and shrines.' },
  gear: { group: 'Between runs', name: 'Gear', color: '#e0b040', what: 'Four slots (focus, charm, cloak, boots) for this run. Bosses always drop a piece; chests sometimes do. Equip from your bag at camp or level-up.' },
  bounty: { group: 'Between runs', name: 'Bounty', color: '#e0b040', what: 'A foe marked with gold. Kill it for 40 extra upgrade points at the next level-up.' },
};

export const GROUPS: Entry['group'][] = ['Body', 'Survival', 'Materials', 'On the map', 'Conditions', 'Party', 'Between runs'];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** The little card shown on hover or tap. `now` is an optional "right now" line (e.g. your current amount). */
export function glossCard(key: string, now?: string): string {
  const e = GLOSSARY[key];
  if (!e) return '';
  return `<div class="gl-name" style="--gc:${e.color ?? 'var(--bone)'}">${esc(e.name)}</div>
    ${now ? `<div class="gl-now">${now}</div>` : ''}
    <p>${esc(e.what)}</p>
    ${e.gain ? `<p><b>Get more:</b> ${esc(e.gain)}</p>` : ''}
    ${e.use ? `<p><b>${e.group === 'Materials' ? 'Used for' : 'Keep in mind'}:</b> ${esc(e.use)}</p>` : ''}
    <div class="gl-more">Field Guide: every entry, any time</div>`;
}

/** The whole Field Guide page. */
export function guideHtml(seen: Set<string>): string {
  return GROUPS.map((g) => `<section><h3>${g}</h3><dl>${Object.entries(GLOSSARY).filter(([, e]) => e.group === g).map(([k, e]) =>
    `<div class="gl-entry${seen.has(k) ? '' : ' unseen'}" id="gl-${k}"><dt style="--gc:${e.color ?? 'var(--bone)'}">${esc(e.name)}</dt><dd>${esc(e.what)}${e.gain ? ` <b>Get more:</b> ${esc(e.gain)}` : ''}${e.use ? ` <b>${e.group === 'Materials' ? 'Used for' : 'Keep in mind'}:</b> ${esc(e.use)}` : ''}</dd></div>`).join('')}</dl></section>`).join('');
}

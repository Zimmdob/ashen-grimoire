// Runes: passive powers bought between depths with the same points as stat upgrades.
// Affixes: elite traits that make some foes nastier. Both are our own designs on the
// systems seen in Spellmasons save data (runes per level, unit modifiers).

export interface RuneDef { name: string; cost: number; desc: string }

export const RUNES: Record<string, RuneDef> = {
  leech: { name: 'Leeching Sigil', cost: 60, desc: 'Heal 3 whenever one of your spells wounds a foe.' },
  teeth: { name: 'Sharpened Teeth', cost: 60, desc: 'Every hit from your spells deals 5 more damage.' },
  grave: { name: 'Gravebound', cost: 80, desc: 'Foes you slay have a 1 in 5 chance to rise at once as your thralls.' },
  bloodlust: { name: 'Bloodlust', cost: 40, desc: 'Each kill restores 10 mana (or a soul fragment).' },
  plague: { name: 'Plaguebringer', cost: 40, desc: 'Your spells that wound also add 5 poison.' },
  toxins: { name: 'Heavy Toxins', cost: 40, desc: 'Poison you apply is 50% stronger.' },
  hunter: { name: 'Hunter’s Stride', cost: 40, desc: 'Each kill restores 50 stamina.' },
  muncher: { name: 'Soul Hunger', cost: 40, desc: 'Each kill heals you for 5.' },
  hide: { name: 'Thick Hide', cost: 60, desc: 'Take 3 less damage from every hit.' },
  reach: { name: 'Far Sight', cost: 40, desc: '+40 casting range.' },
  font: { name: 'Mana Font', cost: 60, desc: '+15 mana each turn (soulbinders: +1 soul capacity).' },
  despair: { name: 'Crown of Despair', cost: 80, desc: 'Every foe begins each depth with one stack of Frailty.' },
};
export const RUNE_IDS = Object.keys(RUNES);

export interface AffixDef { name: string; color: number; desc: string }
export const AFFIXES: Record<string, AffixDef> = {
  growing: { name: 'Growing', color: 0x7fbf3f, desc: 'Gains 10% health and damage every turn.' },
  stalwart: { name: 'Stalwart', color: 0x9a979e, desc: 'Takes 25% less damage.' },
  volatile: { name: 'Volatile', color: 0xff7a2a, desc: 'Explodes for 30 when it dies.' },
  ironhide: { name: 'Ironhide', color: 0xcfc4ad, desc: 'No single hit can deal more than 25 damage to it.' },
  hallowed: { name: 'Hallowed', color: 0xffe08a, desc: 'Immune to curses: poison, burn, frailty, enfeeble, fetter and bloat.' },
  elusive: { name: 'Elusive', color: 0xb48cff, desc: 'Cannot be swept up by targeting cards; it must be aimed at directly.' },
};
export const AFFIX_IDS = Object.keys(AFFIXES);
export const hasAffix = (u: { affixes: string[] }, a: string) => u.affixes.includes(a);

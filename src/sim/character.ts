// Character creation and the survival economy: classes, origins, traits and flaws, mutations,
// materials, recipes, and the paper-doll palette. All plain data so the UI and the sim share it.

import type { GearSlot, Mat, WizardClass } from './types';

export interface ClassDef { name: string; pays: string; desc: string }
export const CLASSES: Record<WizardClass, ClassDef> = {
  spellwright: { name: 'Spellwright', pays: 'mana', desc: 'Casts with mana, refilled each turn. The steady forger.' },
  soulbinder: { name: 'Soulbinder', pays: 'souls', desc: 'No mana. Spells cost soul fragments reaped from every death within 100 of you.' },
  hexblade: { name: 'Hexblade', pays: 'stamina', desc: 'Pays for spells with stamina (2 per mana). Tougher, shorter reach: a front-line curse fighter.' },
  lanternkeeper: { name: 'Lantern Keeper', pays: 'oil', desc: 'Light is mana: spells burn lantern oil, and every cast dims your light. A huge lantern.' },
  tarot: { name: 'Tarot Witch', pays: 'mana', desc: 'Draws a hand of 5 from her grimoire each turn and may only cast what she drew, each card once. Spells cost 40% less.' },
  cagebearer: { name: 'Cagebearer', pays: 'mana', desc: 'Foes that die within 160 of her are bound in her iron cage (holds 3). Unleash sets the first one loose to fight for her.' },
};

export interface OriginDef { name: string; card: string; desc: string }
export const ORIGINS: Record<string, OriginDef> = {
  knight: { name: 'Exiled Knight', card: 'repel', desc: '+20 max health.' },
  hedgewitch: { name: 'Hedge Witch', card: 'mend', desc: 'Every meal she eats or cooks fills one more hunger. Finds extra herbs.' },
  gravedigger: { name: 'Gravedigger', card: 'raise', desc: 'Every kill yields an extra bone.' },
  plague: { name: 'Plague Doctor', card: 'cleanse', desc: 'Immune to poison.' },
  ember: { name: 'Ember Monk', card: 'burn', desc: 'Never grows cold; lava burns him for half.' },
  sailor: { name: 'Drowned Sailor', card: 'maelstrom', desc: 'Water never soaks or chills him.' },
  cartographer: { name: 'Cartographer', card: 'seek', desc: '+40 stamina; always finds one more oil flask per floor.' },
  noble: { name: 'Blood Noble', card: 'lance', desc: 'Blood magic costs 30% less health. Starts with 10 corruption.' },
};

export interface TraitDef { name: string; cost: number; desc: string }
/** Positive cost = a trait you buy. Negative cost = a flaw that pays you points. */
export const TRAITS: Record<string, TraitDef> = {
  nighteye: { name: 'Night-eyed', cost: 2, desc: 'Your light reaches 50% further.' },
  sleeper: { name: 'Light Sleeper', cost: 1, desc: 'Resting at camp heals 50% instead of 35%.' },
  forager: { name: 'Forager', cost: 1, desc: 'One extra ration on every floor.' },
  irongut: { name: 'Iron Gut', cost: 1, desc: 'Every meal fills one more hunger.' },
  lucky: { name: 'Lucky', cost: 2, desc: 'Four spells offered at each portal instead of three.' },
  tough: { name: 'Tough', cost: 2, desc: '+15 max health.' },
  swift: { name: 'Swift', cost: 1, desc: '+30 stamina.' },
  brittle: { name: 'Brittle Bones', cost: -2, desc: '−15 max health.' },
  glutton: { name: 'Gluttonous', cost: -1, desc: 'Hunger falls twice as fast.' },
  haunted: { name: 'Haunted', cost: -3, desc: 'From depth 5 a Shade follows you onto every floor.' },
  clumsy: { name: 'Clumsy', cost: -2, desc: '1 in 10 spells fumbles its first card.' },
  marked: { name: 'Marked', cost: -2, desc: 'Foes would rather strike you than anyone else.' },
  dimlight: { name: 'Frail Light', cost: -2, desc: 'Your lantern holds 30% less oil.' },
};
export const TRAIT_POINTS = 6;

export function traitBudget(traits: string[]): number {
  return TRAIT_POINTS - traits.reduce((s, t) => s + (TRAITS[t]?.cost ?? 0), 0);
}

export interface MutationDef { name: string; desc: string }
export const MUTATIONS: Record<string, MutationDef> = {
  plates: { name: 'Bone Plates', desc: 'Start every floor with a 30 ward. −20 stamina.' },
  eye: { name: 'Third Eye', desc: '+60 casting range. Your light shrinks by 20%.' },
  ichor: { name: 'Ichor Blood', desc: 'Foes that strike you in melee are poisoned for 6. Healing on you is halved.' },
  shadow: { name: 'Shadow-touched', desc: '+60 stamina. Shades come for you sooner in the dark.' },
  hunger: { name: 'Grave Hunger', desc: 'Every kill heals you for 6. −10 max health.' },
  eyes: { name: 'Many Eyes', desc: 'One more spell offered at every portal. −10 max health.' },
  stone: { name: 'Stone Skin', desc: 'Take 4 less damage from every hit. −30 stamina.' },
  tongue: { name: 'Blood Tongue', desc: 'Blood magic costs half the health. Corruption comes twice as fast.' },
};

export const MAT_NAMES: Record<Mat, string> = {
  bone: 'Bone', tallow: 'Tallow', ember: 'Ember shard', rime: 'Rimeglass', ichor: 'Ichor', herb: 'Grave moss', ink: 'Spell ink',
};
export const MAT_IDS = Object.keys(MAT_NAMES) as Mat[];
export const emptyMats = (): Record<Mat, number> => ({ bone: 0, tallow: 0, ember: 0, rime: 0, ichor: 0, herb: 0, ink: 0 });

/** What each foe leaves behind when it dies. */
export const DROPS: Record<string, Partial<Record<Mat, number>>> = {
  ghoul: { bone: 1 }, xbow: { bone: 1 }, spitter: { ichor: 1 }, monk: { ichor: 1, herb: 1 }, priest: { bone: 1, ink: 1 },
  necro: { ink: 1, bone: 1 }, leech: { ichor: 1 }, grasp: { ichor: 1 }, wolf: { tallow: 1 }, hag: { herb: 2 },
  sporecaller: { herb: 1 }, mycelid: { herb: 2 }, eelpriest: { tallow: 1 }, slag: { ember: 2 }, imp: { ember: 1 },
  wight: { rime: 1 }, hound: { tallow: 1 }, toad: { ichor: 1, tallow: 1 }, automaton: { ember: 1, bone: 1 }, gearspider: { bone: 1 },
  inkwraith: { ink: 1 }, lich: { ink: 1, bone: 1 }, flagellant: { tallow: 1 }, bloodarcher: { bone: 1 }, voidmoth: { ink: 1 },
  startouched: { ember: 1, ink: 1 }, shade: { ink: 1 },
};

export interface Recipe { name: string; cost: Partial<Record<Mat, number>>; desc: string; kind: 'cook' | 'craft' }
export const RECIPES: Record<string, Recipe> = {
  stew: { name: 'Smoked Rat Stew', kind: 'cook', cost: { herb: 1, tallow: 1 }, desc: 'Fills 3 hunger and grants +30 stamina next floor.' },
  broth: { name: 'Grave Moss Broth', kind: 'cook', cost: { herb: 2 }, desc: 'Fills 2 hunger and heals 20.' },
  oil: { name: 'Lantern Oil', kind: 'craft', cost: { tallow: 2 }, desc: 'Refills 50 lantern oil.' },
  salve: { name: 'Healing Salve', kind: 'craft', cost: { herb: 2, ichor: 1 }, desc: 'Heals 40 now.' },
  charm: { name: 'Bone Charm', kind: 'craft', cost: { bone: 3 }, desc: 'Start the next floor with a 30 ward.' },
  cloak: { name: 'Ember Cloak', kind: 'craft', cost: { ember: 2 }, desc: 'Immune to cold for the next two floors.' },
  antidote: { name: 'Purging Draught', kind: 'craft', cost: { ichor: 1, herb: 1 }, desc: 'Cleanses curses and removes 10 corruption.' },
  rimeward: { name: 'Rimeglass Ward', kind: 'craft', cost: { rime: 2 }, desc: 'Start the next floor fortified, and with +20 max health for that floor.' },
};
/** Inscribing a card: ink cost by the level it rises to. */
export const INSCRIBE_COST = [0, 2, 3];
export const LEARN_COST = 3;

// ---- paper-doll palette
export const ROBES = ['#4b2a5e', '#2a3a5e', '#5e2a2a', '#2a4a32', '#3a3a3a', '#5a4a2a', '#1e1e28', '#6a5a6a'];
export const ROBES_HI = ['#7a4a96', '#4a6a96', '#96484a', '#4a7a56', '#5e5e5e', '#8a7444', '#3a3a4a', '#9a8a9a'];
export const TRIMS = ['#c99a3a', '#cfc4ad', '#a3202a', '#5fd06a', '#6fd0ff', '#e0b040', '#9a6cff', '#1a1a1a'];
export const ORBS = ['#9fe0ff', '#ff8a3a', '#9cff5a', '#ff4a6a', '#e0c0ff', '#ffe070', '#ffffff', '#6fa0ff'];
export const SKINS = ['#2c1838', '#3a2418', '#1a1a24', '#2a2a2a', '#3a1418'];
export const HEADS = ['Deep hood', 'Pointed hat', 'Iron helm', 'Horned cowl', 'Bone crown'];
export const DEFAULT_LOOK = { robe: 0, trim: 0, orb: 0, head: 0, skin: 0 };

// ---- gear: four slots. Bosses always drop a find; chests sometimes do. Equip at the portal or camp.
export interface GearDef { name: string; slot: GearSlot; desc: string; stat?: { range?: number; stam?: number; hp?: number; regen?: number; oil?: number } }
export const GEAR: Record<string, GearDef> = {
  ashstaff: { name: 'Ashwood Staff', slot: 'focus', desc: '+40 casting range.', stat: { range: 40 } },
  bloodknife: { name: 'Bloodletting Knife', slot: 'focus', desc: 'Blood magic costs 25% less health.' },
  emberrod: { name: 'Ember Rod', slot: 'focus', desc: 'Your fire deals 50% more.' },
  stormfocus: { name: 'Storm-glass Focus', slot: 'focus', desc: 'Your lightning deals 50% more.' },
  wardstone: { name: 'Wardstone', slot: 'charm', desc: 'Begin every floor with a 20 ward.' },
  saintsfinger: { name: "Saint's Finger", slot: 'charm', desc: 'Healing on you is 50% stronger.' },
  ravenskull: { name: 'Raven Skull', slot: 'charm', desc: '+15 mana a turn and +30 lantern oil capacity.', stat: { regen: 15, oil: 30 } },
  gravecoin: { name: 'Grave Coin', slot: 'charm', desc: '+30 upgrade points at every portal.' },
  furcloak: { name: 'Wolf-fur Cloak', slot: 'cloak', desc: 'Never grow cold.' },
  oilskin: { name: 'Oilskin Mantle', slot: 'cloak', desc: 'Water never soaks you.' },
  shroud: { name: 'Gravecloth Shroud', slot: 'cloak', desc: 'Foes would rather strike someone else.' },
  ironmail: { name: 'Rusted Mail', slot: 'cloak', desc: 'Take 3 less damage from every hit. −30 stamina.', stat: { stam: -30 } },
  striders: { name: "Pilgrim's Striders", slot: 'boots', desc: '+60 stamina.', stat: { stam: 60 } },
  leadboots: { name: 'Leaden Boots', slot: 'boots', desc: 'Nothing can shove you. −20 stamina.', stat: { stam: -20 } },
  cinderboots: { name: 'Cinder Greaves', slot: 'boots', desc: 'Fire and lava burn you for half.' },
  bonegreaves: { name: 'Bone Greaves', slot: 'boots', desc: '+25 max health.', stat: { hp: 25 } },
};
export const GEAR_IDS = Object.keys(GEAR);
export const BAG_MAX = 6;
export const emptyGear = (): Record<GearSlot, string | null> => ({ focus: null, charm: null, cloak: null, boots: null });

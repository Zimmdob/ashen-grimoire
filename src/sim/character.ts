// Character creation and the survival economy: classes, origins, traits and flaws, mutations,
// materials, recipes, and the paper-doll palette. All plain data so the UI and the sim share it.

import type { GearSlot, Look, Mat, WizardClass } from './types';

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
  hedgewitch: { name: 'Hedge Witch', card: 'mend', desc: 'Her Healing Salves heal 60 instead of 40. Finds extra herbs.' },
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
  forager: { name: 'Forager', cost: 1, desc: 'One extra red potion on every floor.' },
  lucky: { name: 'Lucky', cost: 2, desc: 'Four spells offered at each portal instead of three.' },
  tough: { name: 'Tough', cost: 2, desc: '+15 max health.' },
  swift: { name: 'Swift', cost: 1, desc: '+30 stamina.' },
  brittle: { name: 'Brittle Bones', cost: -2, desc: '−15 max health.' },
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
// ---- appearance (purely cosmetic: no race, gender or look changes any rule of play)
export interface RaceDef { name: string; desc: string; skins: string[]; short?: boolean }
export const RACES: RaceDef[] = [
  { name: 'Human', desc: 'Stubborn, short-lived and everywhere.', skins: ['#f4d6bc', '#e6b996', '#cf9b74', '#b07a52', '#8d5a3a', '#6a4028', '#4a2a1a'] },
  { name: 'Elf', desc: 'Long ears, longer memories.', skins: ['#f6e6d4', '#e8cfb2', '#c9a582', '#d7e6da', '#d9cfee', '#7a5a7a'] },
  { name: 'Dwarf', desc: 'Broad, bearded and built for tunnels.', skins: ['#f0c8a8', '#dca07c', '#c07a56', '#8d5a3a', '#5e3a26'], short: true },
  { name: 'Halfling', desc: 'Small, quick and hard to frighten.', skins: ['#f4d6bc', '#e6b996', '#cf9b74', '#a8724c', '#6a4028'], short: true },
  { name: 'Orc', desc: 'Tusked and tireless.', skins: ['#7f9a52', '#62803e', '#8a9a72', '#4e6436', '#9a8f78', '#5a6a6a'] },
  { name: 'Tiefling', desc: 'Horned, with a devil somewhere in the family tree.', skins: ['#b83a40', '#8a2a5a', '#6a3a9a', '#3a4a9a', '#c86a48', '#8a8a9e'] },
  { name: 'Revenant', desc: 'Died once. Did not care for it.', skins: ['#cfcfbf', '#b0b8a6', '#a2b0c2', '#dcd2c0', '#8a9a88'] },
  { name: 'Dragonborn', desc: 'Scaled, snouted, and warm to the touch.', skins: ['#3f8a5e', '#9a3030', '#2f5a9a', '#c8a440', '#6e6e78', '#e2dcc8', '#2e2a30'] },
];
export const GENDERS = ['Man', 'Woman', 'Non-binary'];
export const BUILDS = ['Lean', 'Broad', 'Curvy', 'Stout'];
/** The build a gender starts with (any build can be picked afterwards). */
export const GENDER_BUILD = [1, 2, 0];
export const HAIR_STYLES = ['Bald', 'Cropped', 'Short', 'Long', 'Ponytail', 'Braids', 'Bun', 'Mohawk', 'Wild', 'Curly', 'Side-swept', 'Twin tails'];
export const HAIR_COLORS = ['#1a1414', '#3a2418', '#5e3a20', '#8a5a2a', '#c48a3a', '#e8cc78', '#f2ecd8', '#9a9a9a', '#a3302a', '#d8642a', '#3a5ac8', '#3a9a5a', '#7a3ab0', '#e070a8'];
export const BEARDS = ['None', 'Stubble', 'Moustache', 'Goatee', 'Full beard', 'Long beard', 'Braided beard'];
export const EYES = ['#b8f4ff', '#6aa8ff', '#5fd06a', '#3a2418', '#7a5a2a', '#ffd060', '#ff4a3a', '#c060ff', '#ffffff'];
export const OUTFITS = ['Robe', 'Gown', 'Cloak and tunic', 'Plate armour', 'Leather jerkin', 'Long coat', 'Monk wrap', 'Rags'];
export const ROBES = ['#4b2a5e', '#2a3a5e', '#5e2a2a', '#2a4a32', '#3a3a3a', '#5a4a2a', '#1e1e28', '#6a5a6a', '#7a1a2a', '#2a5a5a', '#8a6a3a', '#d8d0c0'];
export const ROBES_HI = ['#7a4a96', '#4a6a96', '#96484a', '#4a7a56', '#5e5e5e', '#8a7444', '#3a3a4a', '#9a8a9a', '#a82a3a', '#3a8a8a', '#b08a52', '#f4eee0'];
export const TRIMS = ['#c99a3a', '#cfc4ad', '#a3202a', '#5fd06a', '#6fd0ff', '#e0b040', '#9a6cff', '#1a1a1a'];
export const ORBS = ['#9fe0ff', '#ff8a3a', '#9cff5a', '#ff4a6a', '#e0c0ff', '#ffe070', '#ffffff', '#6fa0ff'];
export const HEADS = ['Bare head', 'Deep hood', 'Pointed hat', 'Wide-brim hat', 'Circlet', 'Iron helm', 'Horned helm', 'Bone crown'];
/** How many choices each field has (used to keep looks in range, including from the network). */
export const LOOK_COUNTS: Record<keyof Look, number> = {
  race: RACES.length, gender: GENDERS.length, build: BUILDS.length, skin: 7,
  hair: HAIR_STYLES.length, hairColor: HAIR_COLORS.length, beard: BEARDS.length, eyes: EYES.length,
  outfit: OUTFITS.length, robe: ROBES.length, trim: TRIMS.length, head: HEADS.length, orb: ORBS.length,
};
export const DEFAULT_LOOK: Look = { race: 0, gender: 0, build: 1, skin: 2, hair: 2, hairColor: 2, beard: 0, eyes: 3, outfit: 0, robe: 0, trim: 0, head: 1, orb: 0 };
/** Clamp any (possibly old or hostile) look into range, filling missing fields. */
export function cleanLook(l: Partial<Look> | undefined): Look {
  const out = { ...DEFAULT_LOOK };
  for (const k of Object.keys(LOOK_COUNTS) as (keyof Look)[]) {
    const v = Math.floor(Number(l?.[k]));
    if (Number.isFinite(v)) out[k] = Math.max(0, Math.min(LOOK_COUNTS[k] - 1, v));
  }
  out.skin = Math.min(out.skin, RACES[out.race].skins.length - 1);
  return out;
}

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

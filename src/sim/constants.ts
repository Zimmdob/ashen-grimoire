// Rule constants. The player numbers match the `rules` block found in Spellmasons save data
// (PLAYER_BASE_HEALTH 60, PLAYER_BASE_STAMINA 200, PLAYER_BASE_ATTACK_RANGE 200,
// STARTING_CARD_COUNT 3, STAT_POINTS_PER_LEVEL 120). Everything else is our own tuning.
export const TILE = 32;
export const T_FLOOR = 0;
export const T_WALL = 1;
export const T_LAVA = 2;
/** Walkable ice: bodies shoved across it slide twice as far. */
export const T_ICE = 3;
export const T_WATER = 4;
export const T_BLOOD = 5;
export const T_BOG = 6;
/** Liquids are walkable but have effects; walls are not walkable. */
export const isLiquid = (t: number) => t === T_LAVA || t === T_WATER || t === T_BLOOD || t === T_BOG;
export const isWalkable = (t: number) => t !== T_WALL;

export const RULES = {
  PLAYER_BASE_HEALTH: 60,
  PLAYER_BASE_MANA: 60,
  PLAYER_MANA_PER_TURN: 60,
  PLAYER_BASE_STAMINA: 200,
  PLAYER_BASE_ATTACK_RANGE: 200,
  STARTING_CARD_COUNT: 3,
  STAT_POINTS_PER_LEVEL: 120,
  /** Runes offered in the shop between depths (Spellmasons save rules: RUNES_PER_LEVEL 6). */
  RUNES_PER_LEVEL: 6,
  /** Soulbinder (our Goru-style class), from the same save rules. */
  SOUL_STARTING: 2,
  SOUL_MAX_STARTING: 10,
  SOUL_COLLECT_RADIUS: 100,
  /** Mana-equivalent of one soul fragment when pricing spells for a soulbinder. */
  SOUL_PRICE: 20,
  BOUNTY_POINTS: 40,
  UPGRADE_COST: 40,
  /** Each cast of a card raises its cost by this fraction until the next depth. */
  EXPENSE_SCALING: 0.25,
  LIQUID_DAMAGE: 20,
  TRAP_DAMAGE: 30,
  /** Regions per run before the Hollow Throne. */
  TIERS: 5,
  FLOORS_PER_REGION: 2,
  MAX_OIL: 100,
  OIL_PER_TURN: 3,
  CORRUPTION_STEP: 25,
  HEAL_BETWEEN_LEVELS: 0.25,
  /** Walking speed in paces per millisecond (Spellmasons unit moveSpeed is 0.15). */
  MOVE_SPEED: 0.15,
  /** Stamina shown once a depth is cleared (JSON-safe stand-in for infinity). */
  CLEARED_STAMINA: 99999,
} as const;

export const STARTING_CARDS = ['sever', 'repel', 'circle'];

export const LEVEL_NAMES = [
  'The Bone Cellar', 'Weeping Crypt', 'The Ashen Nave', 'Charnel Galleries', 'The Drowned Vault',
  'Halls of Rot', 'Sepulchre of Embers', 'The Leechwarren', 'The Black Choir', 'Throne of the Hollow King',
];

export const UPGRADES: Record<string, { name: string; desc: string }> = {
  vitality: { name: 'Vitality', desc: '+20 maximum health' },
  arcana: { name: 'Arcana', desc: '+20 maximum mana and +20 mana each turn (soulbinders: +2 soul capacity)' },
  stride: { name: 'Stride', desc: '+50 stamina' },
  reach: { name: 'Reach', desc: '+30 casting range' },
};

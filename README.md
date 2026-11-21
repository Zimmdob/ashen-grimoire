# Ashen Grimoire

A turn-based, spell-forging tactics and survival game in a 90s dark fantasy style. Cross the Ashen Reach, a map of twelve regions and a dozen lords, with one spellbook and one lantern: forge every spell card by card, shove the dead into lava, keep your light burning, and reach the Hollow King.

It follows the Spellmasons ruleset closely. The code, art, names and sounds are all original.

## Run it

```bash
npm install          # first time only
npm run dev          # play in the browser at http://localhost:5173
npm test             # simulation tests (determinism, fuzzed playthroughs, exact previews)
npm run balance      # bot playthroughs → reports/balance.md
npm run server       # co-op server on ws://localhost:8787
npm run electron     # build and open the desktop app
npm run dist         # package an installer and a portable .exe into release/
```

Add `?seed=1234` to the URL to replay a specific dungeon.

## How to play

### The run
- **Your spellwright:** in *Character* pick one of six callings (Spellwright: mana · Soulbinder: souls · Hexblade: stamina · Lantern Keeper: lantern oil · Tarot Witch: casts only from a hand of 5 drawn each turn, at 40% off · Cagebearer: cages foes that die near her and Unleashes them as allies), one of 8 origins (each adds a starting card and a perk), traits and flaws on a 6-point budget, and a paper-doll look (robe, trim, orb, shadow, headwear).
- **The Ashen Reach:** each region (Bone Cellars, Witchwood, Fungal Hollows, Drowned Marsh, Abbey, Forges, Catacombs, Frostbitten Keep, Ink Library, Cathedral, Starfall Crater, then the Throne) has two floors, its own palette, liquid, terrain rule, foes and a lord on its last floor. After each region you make camp and vote on the road ahead.
- **Survival:** your lantern burns oil every turn; when it runs dry, Shades hunt you. Each floor costs one meal: eat rations or starve. Cold regions chill you away from fire. Blood magic, raising the dead and shrines add corruption, and every 25 brings a mutation you choose.
- **Terrain:** lava burns, water soaks (lightning and frost double on soaked foes, and molten things hate it), bog poisons, blood heals foes, ice doubles knockback. Terrain cards flood, freeze and raise walls.
- **Camp:** cook and craft from what foes drop (bone, tallow, ember, rime, ichor, grave moss, spell ink), inscribe cards (+50% power per mark), learn new spells, rest.
- **Gear:** four slots (focus, charm, cloak, boots), 16 finds. Every lord drops one for each player; chests, vaults and camp strangers give more. Equip at the portal or at camp.
- **Camp strangers:** each camp brings an encounter (the Blind Pilgrim, the Dicing Demon, the Ghost Caravan and seven more) with a choice to make.
- **Co-op:** a fallen companion is only down for 3 turns; stand beside them and press R. Hitting the same foe with two players' spells in a turn deals 50% more (resonance). Fighting side by side, reviving and resonance fill the shared **Bond**; at 100 either player can call a **Duet**: one turn where every spell is free and half again as strong. Some floors hide a **sealed vault** and two keys far apart: split up to find them.
- **Achievements:** 16, each worth 5 Ash, listed in the Codex.
- **Meta:** runs earn Ash for the Sanctum (unlocks spell folios and origins). Curses on the title screen raise the Ash. The Daily rite is the same seed and curse for everyone on a given day. The Codex records every foe, spell and region you have seen.

### Turn by turn

- **Walk:** hold the right mouse button and you walk toward the cursor in real time, steering as you move the mouse (as in Spellmasons). Walking spends stamina at 0.15 paces per millisecond; release to stop. The path preview turns red past your stamina. On touch screens, press and hold with no spell forged. WASD moves the camera, C recenters.
- **Forge a spell:** click cards, or press 1–0. Cards resolve **left to right**. Targeting cards (Circle of Binding, Chain of Souls, Lance Line…) widen who gets hit, and effect cards then strike everything targeted so far. So `Circle → Sever` hits a crowd, while `Sever → Circle` hits one body and then marks a crowd for nothing.
- **Cast:** left-click within the violet ring. You can cast as often as your mana allows. The preview is exact: highlighted bodies are hit, yellow on a health bar is what they'll lose, and a skull means that body dies.
- **Expense scaling:** every card costs 25% more each time you use it on the same depth.
- **Telegraphs:** foes outlined in red will reach you next turn, and the striped part of your health bar is that damage. Hover a foe to see its attack range.
- **The environment kills:** lava burns for 20, spike traps for 30, and slamming bodies into walls or each other does impact damage. Urns burst when broken (fire, frost or plague).
- **Between depths:** clear the depth (some depths send a second wave), walk into the portal, bind one new spell, then spend 120 upgrade points in the **rune shop** (6 passive runes on offer) or on stats.
- **Two classes:** the *Spellwright* casts with mana. The *Soulbinder* has no mana at all: spells cost soul fragments (1 per 20 mana), reaped from every body that dies within 100 of you (starts with 2, holds 10).
- **Bounties and elites:** one foe per wave carries a gold-coin bounty worth 40 upgrade points. Elders and later foes roll affixes (Growing, Stalwart, Volatile, Ironhide, Hallowed, Elusive), shown as diamonds by their health bars.
- **Scrolls:** from depth 2, a spell scroll lies somewhere on each depth and teaches a random new card.
- **Music:** an original procedural dungeon-synth score (drone, choir pads, lute, bells) made live with WebAudio. War drums swell when foes can reach you, and the key darkens as you descend. Toggle and volume are in the codex panel.
- **Bookmarks and pings:** click a bookmark slot to save the forged spell, F1–F4 to recall it. Alt-click or middle-click pings the map for co-op partners.
- **71 cards** (plus the Cagebearer's Unleash) across targeting, harm, force, curses, blessings, grave magic, blood magic, summoning, terrain and arcane modifiers (Echo repeats a spell, Overcharge doubles it). Rend escalates when stacked, Shatter punishes frozen foes, Merge and Polymorph reshape the battlefield, and the summoning cards raise thralls.

## Architecture

```
src/sim/      Deterministic simulation. Pure TypeScript, no DOM. Runs in browser, Electron and Node.
  game.ts       Turn state machine + applyAction(), the only way to change a World
  cards.ts      Every card as a self-contained command over a shared SpellContext
  spell.ts      Spell executor (left-to-right resolution) and expense-scaled costs
  physics.ts    Circle bodies, fixed-step movement, knockback with momentum transfer and impact damage
  combat.ts     Damage, healing, death, explosions, lava/trap/potion triggers, the event outbox
  ai.ts         Foe behaviours (melee, ranged, lob, poison, priest, summoner, leech, puller, boss) + threat prediction
  path.ts       8-way A* with string-pulling
  map.ts        Cellular-automaton caverns, lava pools that never split the floor, torches
  rng.ts        Seeded PRNG (mulberry32); all gameplay randomness comes from world.seed
src/render/   PixiJS v8 renderer. Low-res (400×250) pixel buffer, dynamic torch lighting via an erase-blend light map
src/ui/       Card icons, synthesized sound effects
src/net/      Lockstep protocol + transports (local and WebSocket)
server/       Authoritative co-op relay (Node + ws) running the same simulation
electron/     Desktop wrapper
tests/        Vitest suite
```

**Why this shape:**
- **State is separate from visuals.** `applyAction()` resolves a whole spell or enemy turn instantly and writes an event outbox (`move`, `push`, `hurt`, `die`, `fx`…), grouped into *beats*. The renderer replays those beats as animation and never makes a decision itself.
- **Determinism.** Same seed + same actions = the same world, byte for byte (`npm test` checks this). That's what makes the exact cast preview possible: it runs your spell on a `structuredClone` of the world. It's also what makes co-op cheap.
- **Lockstep co-op.** Clients send *actions*, never positions. The server validates each one against its own copy of the sim and broadcasts only accepted actions; every client replays them locally. 2–4 players: everyone ends their turn, then the dark moves.
- **Physics.** This uses a small purpose-built fixed-step circle solver rather than Matter.js or Rapier, because general-purpose engines aren't guaranteed bit-identical across machines, and lockstep needs that.

## Where the rules came from

Spellmasons' own source is published on GitHub (`jdoleary/Spellmasons`) for study and personal modding. Its license asks that anyone wanting to use part of it in a separate project contact the author first. This project uses **none** of that code, art or text. If you plan to sell or publicly release this game, read that license and consider reaching out to the author.

The systems here (rune shop, Goru-style soul class, waves, bounties, elite modifiers, summon cards, bookmarks, pings) were inferred from the *structure* of Spellmasons save data: field names, rule constants and card lists. The numbers come from the save's `rules` block where it had them (e.g. RUNES_PER_LEVEL 6, GORU soul collect radius 100, 2 starting souls, 10 max). Everything else is our own design.


The player and foe numbers that line up with Spellmasons come from the `rules` block and unit records in a local Spellmasons save file. Player: 60 health, 60 mana restored per turn, 200 stamina, 200 cast range, 3 starting spells, 120 upgrade points per level. Foes: Golem → Ghoul (20 hp, hits for 30 at 74 range, 300 stamina), Archer → Crossbowman (40 hp, 10 damage, 500 range). The other foes keep the same behaviour families (lobber, poisoner, priest that raises the dead, summoner, mana vampire, puller, urns) with our own numbers. No Spellmasons code or assets are included; the game's code ships packed inside its executable and wasn't used.

## Extending

- **New card:** add an entry to `list` in `src/sim/cards.ts` (choose a `mode`, write `run`) and an 8×8 glyph in `src/ui/icons.ts`.
- **New foe:** add a `UnitDef` in `src/sim/units.ts`, a behaviour case in `ai.ts`, and a 16×16 sprite in `src/render/sprites.ts`.
- **Steam:** add `steamworks.js` in `electron/main.cjs` and expose achievements through a preload script.

# Cinderstorm: design research and playtest targets

The principles we tune against, and how the playtest lab (`npm run playtest -- --runs 600`, then
`npm run playtest:report -- /tmp/pt.jsonl`) measures each one.

| Principle | Source idea | What the lab measures | Target |
|---|---|---|---|
| Flow: challenge matched to skill | Csikszentmihalyi's flow channel: too easy bores, too hard frustrates | Win rate by bot skill × difficulty | Gentle: newcomers reach act 3; Normal: newcomers die mid-run, skilled players usually win; Nightmare: ~50% for skilled players |
| Competence and autonomy | Self-determination theory (Ryan, Rigby & Przybylski 2006) | Level-ups, power growth, choice balance (win lift with/without each boon, relic, class) | A level every ~40-75s; no class more than ~10 points from the others; no dead or must-pick options |
| Sawtooth intensity | Tension and release; intensity ramps with rests | Hits/min by act and room; boss lethality by act | Each act climbs room to room; each boss a step up; a breather before bosses |
| Fair, readable deaths | Fair roguelites make losses the player's own; bullet hell lives on readable patterns with findable gaps | Cause of every hit | Shots appearing on you, unwarned hazards and spawn-contact near zero |
| Pacing | No dead air; fights that end | Room length, idle time, stalls | Fights 15-45s, bosses 45-90s, idle ~5%, no stalls |

## Bots
`novice` reacts every ~0.23s, sees ~70px around it and has lapses (roughly a typical player);
`average` and `expert` react faster and look further ahead. All of them dodge by predicting where shots,
charges and hazards will be, and choose doors, cards, relics and boons as a player would.
Bots dodge better than people do, so read their numbers as relative, not absolute.

## Results of the first tuning pass (5,000+ runs)
- Stalls: rooms that never ended dropped from ~5% to ~0 (sleeping gargoyles, braziers, unreachable stragglers).
- Unfair hits: enemy contact fell from 50% to ~4% of hits; shots appearing on you ~0.6%.
- Bosses: 95-106s late fights now ~50-80s; on Nightmare, lethality climbs act by act to the Hollow King.
- First-act cliff: the Old Stag no longer stops most newcomers; a heart is restored before every boss.
- Classes: Normal win rates within 92-100% (was 42-90%).
- Level-ups: ~every 50s.

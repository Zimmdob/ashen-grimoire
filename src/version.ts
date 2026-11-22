// Which build this is (set at build time; 'dev' when running tests or the dev server).
// Co-op is lockstep, so every player in a game must be on exactly the same build.
declare const __AG_BUILD__: { sha: string; time: number } | undefined;
export const BUILD: { sha: string; time: number } = typeof __AG_BUILD__ !== 'undefined' && __AG_BUILD__ ? __AG_BUILD__ : { sha: 'dev', time: 0 };
/** Do two builds play the same game? A 'dev' build matches anything. */
export const sameBuild = (a?: string, b?: string) => !a || !b || a === 'dev' || b === 'dev' || a === b;

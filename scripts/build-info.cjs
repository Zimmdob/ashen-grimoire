// The build stamp: which commit this is and when it was made. The same commit always gives the same
// stamp, whether built here or by GitHub, so two players on the same commit always match.
const { execSync } = require('node:child_process');
function buildInfo() {
  const git = (c) => { try { return execSync(`git ${c}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
  const sha = (process.env.AG_BUILD_SHA || git('rev-parse --short=10 HEAD') || 'dev').slice(0, 10);
  const time = Number(process.env.AG_BUILD_TIME || git('log -1 --format=%ct') || 0);
  return { sha, time };
}
module.exports = { buildInfo };
if (require.main === module) process.stdout.write(JSON.stringify(buildInfo()));

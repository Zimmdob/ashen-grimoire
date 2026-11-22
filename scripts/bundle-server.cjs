// Bundles the co-op server for the desktop app, stamped with the same build info as the game.
const { buildSync } = require('esbuild');
const { buildInfo } = require('./build-info.cjs');
buildSync({
  entryPoints: ['server/index.ts'], bundle: true, platform: 'node', target: 'node20', format: 'cjs',
  outfile: 'electron/server.cjs', external: ['bufferutil', 'utf-8-validate'], logLevel: 'warning',
  define: { __AG_BUILD__: JSON.stringify(buildInfo()) },
});

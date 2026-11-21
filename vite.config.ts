import { defineConfig, type Plugin } from 'vite';

/**
 * Writes sw.js with every built file precached, so the installed phone app opens (and plays solo)
 * offline. The cache name carries a hash of the file list, so a new build replaces the old cache.
 */
function offlineCache(): Plugin {
  return {
    name: 'ashen-offline-cache',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const files = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
        ...Object.keys(bundle).map((f) => `./${f}`)];
      let h = 0;
      for (const c of files.join('|')) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
      const sw = `// generated at build time
const CACHE = 'ashen-${(h >>> 0).toString(36)}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // newest page when online, cached page when not
    e.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    },
  };
}

// base './' lets Electron load the built files straight from disk and GitHub Pages serve from /ashen-grimoire/.
export default defineConfig({ base: './', plugins: [offlineCache()], build: { target: 'es2022', chunkSizeWarningLimit: 1500 } });

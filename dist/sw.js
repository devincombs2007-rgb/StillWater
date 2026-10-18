const CACHE = 'stillwater-pocket-v10';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=10',
  './game.js?v=10',
  './art.js?v=10',
  './surface.js?v=10',
  './textures.js?v=10','./models.js?v=10','./scenery.js?v=10',
  './fishing.js?v=10',
  './angler.js?v=10',
  './tackle.js?v=10',
  './environment.js?v=10',
  './economy.js?v=10',
  './scene.js?v=10',
  './audio.js?v=10',
  './fish.js?v=10',
  './swimming.js?v=10',
  './preview.js?v=10',
  './items.js?v=10',
  './land.js?v=10',
  './looks.js?v=10',
  './ambience.js?v=10',
  './assets/three.module.js',
  './assets/three.core.js',
  './assets/icon-180.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './manifest.webmanifest',
];
async function valid(response, url) {
  if (!response || !response.ok || response.redirected || !response.url.startsWith(self.location.origin)) return false;
  if (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'))
    return (await response.clone().text()).includes('name="stillwater-build"');
  return true;
}
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      for (const asset of ASSETS) {
        const request = new Request(new URL(asset, self.location), {credentials: 'same-origin', cache: 'reload'});
        const r = await fetch(request);
        if (!(await valid(r, new URL(request.url)))) throw new Error('Game could not be cached safely');
        await cache.put(request, r);
      }
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith('stillwater-pocket-') && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('fetch', event => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const root = new URL('./', self.location);
  if (request.mode === 'navigate' && url.pathname === root.pathname) {
    event.respondWith(
      (async () => {
        try {
          const r = await fetch(request);
          if (await valid(r, url)) {
            const cache = await caches.open(CACHE);
            await cache.put(new URL('./index.html', self.location), r.clone());
          }
          return r;
        } catch {
          return (
            (await caches.match(new URL('./index.html', self.location))) ||
            new Response('Open Stillwater once while online to prepare your sanctuary.', {
              status: 503,
              headers: {'Content-Type': 'text/plain'},
            })
          );
        }
      })(),
    );
    return;
  }
  const known = ASSETS.some(a => new URL(a, self.location).href === url.href);
  if (known)
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        return cached || fetch(request);
      })(),
    );
});

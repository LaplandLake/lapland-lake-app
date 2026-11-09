/* Offline helper ("service worker").
   - App files (look and layout) are saved on the phone so the app opens fast, even on weak signal.
   - Content files (trail report, soup, menu) always try the internet first, and fall back
     to the last saved copy if there's no signal.
   Bump VERSION whenever app files (not content) change, so phones pick up the new version. */
const VERSION = 'v56';
const APP_FILES = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'images/logo-wide.svg',
  'images/logo-mark.svg',
  'images/share-qr.svg',
  'js/vendor/panzoom.min.js',
  'images/icons/icon.svg',
  'images/icons/icon-180.png',
  'images/icons/icon-192.png',
  'manifest.webmanifest',
  // So the app works out on the trails with no signal, even screens a guest hasn't opened yet
  'images/trail-map.webp',
  'images/guest-photos/sample-1.webp',
  'images/guest-photos/sample-2.webp',
  'images/guest-photos/sample-3.webp',
  'images/guest-photos/sample-4.webp',
  'content/trails.json',
  'content/trail-report.json',
  'content/menu.json',
  'content/soup.json',
  'content/settings.json',
  'content/photos.json',
  'content/prices.json',
  'content/lodging.json',
  'content/events.json',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the phone's own web cache, so a new version always saves fresh files
  event.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(APP_FILES.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // The staff Supply Manager (/supply/) is a separate app: always load it fresh from the internet.
  if (new URL(req.url).pathname.includes('/supply/')) return;

  const isContent = new URL(req.url).pathname.includes('/content/');
  if (isContent) {
    // Internet first, saved copy if offline. On weak signal, don't wait more than
    // 4 seconds: show the saved copy, and keep fetching in the background for next time.
    const fresh = fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    });
    event.waitUntil(fresh.catch(() => {}));
    event.respondWith((async () => {
      const saved = await caches.match(req, { ignoreSearch: true });
      if (!saved) return fresh;
      const timer = new Promise((resolve) => setTimeout(() => resolve(saved), 4000));
      return Promise.race([fresh.catch(() => saved), timer]);
    })());
  } else {
    // Saved copy first (fast), then refresh it in the background
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) => {
        const fresh = fetch(req, { cache: 'no-cache' }).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
  }
});

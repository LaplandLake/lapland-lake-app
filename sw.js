/* Offline helper ("service worker").
   - App files (look and layout) are saved on the phone so the app opens fast, even on weak signal.
   - Content files (trail report, soup, menu) always try the internet first, and fall back
     to the last saved copy if there's no signal.
   Bump VERSION whenever app files (not content) change, so phones pick up the new version. */
const VERSION = 'v22';
const APP_FILES = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'images/logo-wide.svg',
  'images/logo-mark.svg',
  'js/vendor/panzoom.min.js',
  'images/icons/icon.svg',
  'images/icons/icon-180.png',
  'images/icons/icon-192.png',
  'manifest.webmanifest',
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

  const isContent = new URL(req.url).pathname.includes('/content/');
  if (isContent) {
    // Internet first, saved copy if offline
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
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

// RIRLY · service worker: funciona sin conexión y se actualiza cuando hay red.
// Al cambiar la lista de archivos, sube el número de CACHE.
const CACHE = 'rirly-v7';
const SHELL = ['./', './index.html', './styles.css', './js/util.js', './js/datos.js', './js/motor.js', './js/vistas.js', './js/guia.js', './js/app.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const okToCache = r => r && r.ok && r.type === 'basic';
const put = (key, res) => { const cp = res.clone(); caches.open(CACHE).then(c => c.put(key, cp)); };
// Solo la propia app cuenta como "la página"; abrir robots.txt u otro archivo no debe sustituirla.
const isAppPage = url => { const root = new URL('./', self.registration.scope).pathname; return url.pathname === root || url.pathname === root + 'index.html'; };

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // red primero (recibe actualizaciones); sin conexión, la copia guardada de la app
    e.respondWith(fetch(req).then(r => { if (okToCache(r) && isAppPage(url)) put('./index.html', r); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  // código y estilos: red primero para no quedarse con versiones viejas; resto (iconos…): caché primero
  const netFirst = /\.(js|css)$/.test(url.pathname);
  const fromNet = () => fetch(req).then(r => { if (okToCache(r)) put(req, r); return r; });
  e.respondWith(netFirst ? fromNet().catch(() => caches.match(req)) : caches.match(req).then(hit => hit || fromNet()));
});

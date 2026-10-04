// PriceCheck Pro — service worker (v3)
const CACHE = 'pricecheck-v3';
const SCOPE = self.registration.scope;
const PRE = ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'].map(f => new URL(f, SCOPE).href);
const CDN = ['https://cdnjs.cloudflare.com/', 'https://cdn.jsdelivr.net/', 'https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.allSettled(PRE.concat(['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js']).map(u => c.add(u)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // POST/sync nunca passam pela cache
  const url = new URL(req.url);
  const mesma = url.origin === self.location.origin;
  const cdn = CDN.some(p => req.url.startsWith(p));
  if (!mesma && !cdn) return;                             // GitHub/proxy: direto à rede

  // página: rede primeiro (apanha versões novas), cache se estiver offline
  if (req.mode === 'navigate' || (mesma && (url.pathname.endsWith('.html') || url.pathname.endsWith('/')))) {
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200) { const cl = res.clone(); caches.open(CACHE).then(c => c.put(new URL('index.html', SCOPE).href, cl)); }
        return res;
      }).catch(() => caches.match(new URL('index.html', SCOPE).href))
    );
    return;
  }
  // restantes ficheiros: cache e atualiza em segundo plano
  e.respondWith(
    caches.match(req).then(cached => {
      const rede = fetch(req).then(res => {
        if (res && (res.status === 200 || res.type === 'opaque')) { const cl = res.clone(); caches.open(CACHE).then(c => c.put(req, cl)); }
        return res;
      }).catch(() => cached);
      return cached || rede;
    })
  );
});

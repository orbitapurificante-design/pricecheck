// PriceCheck — service worker (v5) · serve index.html (consulta) e admin.html (admin) sem se misturarem
const CACHE = 'pricecheck-v5';
const SCOPE = self.registration.scope;
const PRE = ['index.html', 'admin.html', 'manifest.json', 'manifest-admin.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'].map(f => new URL(f, SCOPE).href);
const CDN = ['https://cdnjs.cloudflare.com/', 'https://cdn.jsdelivr.net/', 'https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];

// cada página tem a sua própria entrada na cache (nunca troca uma pela outra)
const chavePagina = url => {
  const u = new URL(url); u.search = ''; u.hash = '';
  if (u.pathname.endsWith('/')) u.pathname += 'index.html';
  return u.href;
};

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
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mesma = url.origin === self.location.origin;
  const cdn = CDN.some(p => req.url.startsWith(p));
  if (!mesma && !cdn) return;                             // GitHub/proxy: direto à rede

  // páginas: rede primeiro (apanha versões novas); se for lenta (3,5 s) ou offline abre a guardada DESSA página
  if (req.mode === 'navigate' || (mesma && (url.pathname.endsWith('.html') || url.pathname.endsWith('/')))) {
    const chave = chavePagina(req.url);
    const guardada = () => caches.match(chave);
    const rede = fetch(req).then(res => {
      if (res && res.status === 200) { const cl = res.clone(); caches.open(CACHE).then(c => c.put(chave, cl)); }
      return res;
    });
    e.respondWith(
      Promise.race([rede, new Promise((_, rej) => setTimeout(() => rej(new Error('lento')), 3500))])
        .catch(() => guardada().then(c => c || rede))
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

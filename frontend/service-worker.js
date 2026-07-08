// HOPE OS PWA — cache do app shell só. Nunca cacheia /api/* (dados sempre do backend real).
const CACHE_NAME = 'hope-os-shell-v1-3-7';
const SHELL_ASSETS = [
  './index.html',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // não intercepta chamadas ao backend (outra origem)
  if (url.pathname.includes('/api/')) return;

  // Navegação/HTML: rede primeiro, cache só como fallback offline. Servir o shell
  // (documento) via stale-while-revalidate escondia atualizações reais atrás de
  // reloads repetidos — quem tivesse a versão antiga em cache continuava vendo
  // ela até um segundo reload, mascarando mudanças de código durante testes.
  const isDocument = req.mode === 'navigate' || req.destination === 'document' || url.pathname.endsWith('.html');
  if (isDocument) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Demais assets do shell (manifest, ícone): cache-first com atualização em segundo
  // plano, aceitável porque não escondem lógica/regra alguma.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});

// HOPE OS PWA — cache do app shell só. Nunca cacheia /api/* (dados sempre do backend real).
const CACHE_NAME = 'hope-os-shell-v1-60-0-comandas';
const SHELL_ASSETS = [
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/app.css',
  './js/app.js',
  './js/api.js',
  './js/api-base.js',
  './js/auth-storage.js',
  './js/auth-sdk.js',
  './js/context-storage.js',
  './js/checkout-pending.js',
  './js/state.js',
  './js/utils.js',
  './js/components/fuzzy-field.js',
  './js/ui/toast.js',
  './js/ui/agenda.js',
  './js/ui/agendaBloqueio.js',
  './js/ui/agendaCard.js',
  './js/ui/regrasAgenda.js',
  './js/ui/agendaMes.js',
  './js/ui/calendarioMes.js',
  './js/ui/checkout.js',
  './js/ui/comandas.js',
  './js/ui/dashboard.js',
  './js/ui/cadastros.js',
  './js/ui/equipe.js',
  './js/ui/onboarding.js',
  './js/ui/comissoes.js',
  './js/ui/lembretes.js',
  './js/ui/caixa.js',
  './js/ui/estorno.js',
  './js/ui/ganhos.js',
  './js/ui/metas.js',
  './js/ui/desempenho.js',
  './js/ui/metasEquipe.js',
  './js/ui/tema.js',
  './js/ui/permissoes.js',
  './js/ui/clienteRapido.js',
  './js/ui/escalas.js',
  './js/ui/agendamentoOnline.js',
  './js/ui/planos.js',
  './js/ui/assinantes.js',
  './js/ui/onlineNovos.js',
  './js/ui/series.js',
  './js/ui/atendimento.js',
  './js/tema-inicial.js',
  './js/ui/agora.js'
];

// A página pergunta qual versão do app está ativa (mostrada na tela, para suporte).
self.addEventListener('message', (event) => {
  if (event.data && event.data.tipo === 'versao' && event.source) event.source.postMessage({ tipo: 'versao', versao: CACHE_NAME });
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      // Havia um cache de outra versão: é uma atualização (e não a primeira instalação).
      const eraAtualizacao = keys.some((k) => k !== CACHE_NAME);
      return Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        .then(() => self.clients.claim())
        // Avisa as páginas já abertas: elas seguem com o código antigo na memória até recarregar.
        .then(() => (eraAtualizacao ? self.clients.matchAll({ type: 'window' }) : []))
        .then((paginas) => paginas.forEach((p) => p.postMessage({ tipo: 'nova-versao', versao: CACHE_NAME })));
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // não intercepta chamadas ao backend (outra origem)
  if (url.pathname.includes('/api/')) return;
  if (['auth_callback', 'auth_tx', 'code', 'token_hash', 'error', 'error_code', 'apiToken', 'access_token', 'refresh_token']
    .some(key => url.searchParams.has(key))) {
    // O retorno de Auth tem credencial de uso único. Nunca grava a URL no cache do shell.
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }
  // Página pública de agendamento (agendar.html): sempre da rede, nunca cacheada.
  // Agendar exige o backend no ar (sem valor offline) e não deve ficar presa a uma
  // versão antiga no aparelho de quem também usa o app interno.
  // O mesmo vale para o link pessoal do cliente (meu-horario.html, C2).
  if (/\/(agendar\.html|js\/agendar\.js|css\/agendar\.css|meu-horario\.html|js\/meu-horario\.js|js\/calendario-cliente\.js|js\/push-cliente\.js|sw-cliente\.js|manifest-cliente\.json)$/.test(url.pathname)) return;

  // Navegação/HTML e módulos JS/CSS do app: rede primeiro, cache só como fallback offline.
  // Servir o shell via cache primeiro escondia atualizações reais: depois de um deploy, a
  // primeira abertura do app mostrava o HTML novo com o JavaScript velho (auditoria da recorrência,
  // 2026-11-16: o "Repetir" do novo agendamento não aparecia). A cópia do cache continua valendo
  // sem internet. Só ícone e manifesto (que não carregam regra) ficam com cache primeiro.
  const redePrimeiro = req.mode === 'navigate' || req.destination === 'document' || req.destination === 'script' || req.destination === 'style' ||
    /\.(html|js|css)$/.test(url.pathname);
  if (redePrimeiro) {
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

// Service Worker Gate (auditoria da recorrência, 2026-11-16). Carrega o service-worker.js REAL num
// ambiente simulado (sem navegador) e confere a estratégia de cache:
// - HTML e módulos JS/CSS do app: rede primeiro (cópia do cache só se a rede falhar). Antes, os
//   .js eram servidos do cache primeiro: depois de um deploy, a primeira abertura do app mostrava o
//   HTML novo com o JavaScript velho (ex.: sem o "Repetir" da recorrência);
// - ícone e manifesto: cache primeiro com atualização em segundo plano;
// - API, outra origem e as páginas do cliente: o service worker nem intercepta;
// - uma versão nova apaga os caches antigos.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = fs.readFileSync(path.join(__dirname, '../../service-worker.js'), 'utf8');

function criarAmbiente({ rede }) {
  const lojas = new Map();
  const handlers = {};
  const guardar = nome => { if (!lojas.has(nome)) lojas.set(nome, new Map()); return lojas.get(nome); };
  const caches = {
    async open(nome) {
      const l = guardar(nome);
      return { async addAll(urls) { for (const u of urls) l.set(String(u), { corpo: `precache:${u}` }); }, async put(req, res) { l.set(req.url, res); } };
    },
    async match(req) { for (const l of lojas.values()) if (l.has(req.url)) return l.get(req.url); return undefined; },
    async keys() { return [...lojas.keys()]; },
    async delete(nome) { return lojas.delete(nome); }
  };
  const mensagens = [];
  const self = {
    addEventListener: (t, f) => { handlers[t] = f; }, location: { origin: 'https://app.test' }, skipWaiting: async () => {},
    clients: { claim: async () => {}, matchAll: async () => [{ postMessage: m => mensagens.push(m) }] }
  };
  const fetchFalso = async req => rede(req);
  vm.runInNewContext(SRC, { self, caches, fetch: fetchFalso, URL, Promise, console });
  return { handlers, lojas, caches, self, mensagens };
}

const resposta = corpo => ({ ok: true, corpo, clone() { return { ok: true, corpo }; } });
const req = (caminho, extra = {}) => ({ method: 'GET', url: `https://app.test/repo/${caminho}`, mode: 'cors', destination: '', ...extra });
async function pedir(amb, r) {
  let resposta_ = null; let interceptou = false;
  await amb.handlers.fetch({ request: r, respondWith: p => { interceptou = true; resposta_ = p; } });
  return { interceptou, res: interceptou ? await resposta_ : null };
}
const cacheAtual = amb => [...amb.lojas.keys()].find(k => k.startsWith('hope-os-shell-'));

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('SW1 módulo JS com cópia velha no cache: com a rede no ar, entrega a versão NOVA (não a do cache)', async () => {
  const amb = criarAmbiente({ rede: async () => resposta('js-novo') });
  const nome = 'hope-os-shell-antigo';
  (await amb.caches.open(nome));
  amb.lojas.get(nome).set('https://app.test/repo/js/ui/agenda.js', { corpo: 'js-velho' });
  const { interceptou, res } = await pedir(amb, req('js/ui/agenda.js', { destination: 'script' }));
  assert.ok(interceptou);
  assert.strictEqual(res.corpo, 'js-novo', 'o cache-first entregaria "js-velho": HTML novo com JavaScript velho');
});

test('SW2 módulo JS e CSS: a cópia nova vai para o cache e serve de reserva sem rede', async () => {
  let online = true;
  const amb = criarAmbiente({ rede: async () => { if (!online) throw new Error('offline'); return resposta('js-v2'); } });
  await pedir(amb, req('js/app.js?v=ts1', { destination: 'script' }));
  await pedir(amb, req('css/app.css', { destination: 'style' }));
  online = false;
  const off = await pedir(amb, req('js/app.js?v=ts1', { destination: 'script' }));
  assert.strictEqual(off.res && off.res.corpo, 'js-v2', 'sem rede, a última cópia boa');
});

test('SW3 página HTML: rede primeiro; sem rede, a cópia do cache', async () => {
  let online = true;
  const amb = criarAmbiente({ rede: async () => { if (!online) throw new Error('offline'); return resposta('html-novo'); } });
  assert.strictEqual((await pedir(amb, req('index.html', { mode: 'navigate' }))).res.corpo, 'html-novo');
  online = false;
  assert.strictEqual((await pedir(amb, req('index.html', { mode: 'navigate' }))).res.corpo, 'html-novo');
});

test('SW4 ícone e manifesto: cache primeiro (não escondem regra); o resto da lista não é interceptado', async () => {
  const amb = criarAmbiente({ rede: async () => resposta('icone-novo') });
  const nome = 'hope-os-shell-antigo';
  await amb.caches.open(nome);
  amb.lojas.get(nome).set('https://app.test/repo/icon.svg', { corpo: 'icone-velho' });
  assert.strictEqual((await pedir(amb, req('icon.svg', { destination: 'image' }))).res.corpo, 'icone-velho');
  for (const caminho of ['api/health', 'agendar.html', 'js/agendar.js', 'meu-horario.html', 'js/meu-horario.js', 'sw-cliente.js', 'manifest-cliente.json']) {
    assert.strictEqual((await pedir(amb, req(caminho))).interceptou, false, caminho);
  }
  assert.strictEqual((await pedir(amb, { method: 'GET', url: 'https://outra.origem.test/x.js', mode: 'cors', destination: 'script' })).interceptou, false, 'outra origem');
  assert.strictEqual((await pedir(amb, { ...req('js/app.js', { destination: 'script' }), method: 'POST' })).interceptou, false, 'só GET');
});

test('SW5 versão nova: a instalação guarda o shell no cache novo e a ativação apaga os antigos', async () => {
  const amb = criarAmbiente({ rede: async () => resposta('x') });
  await amb.caches.open('hope-os-shell-v1-0-antigo');
  await amb.handlers.install({ waitUntil: p => p });
  await amb.handlers.install({ waitUntil: async p => { await p; } });
  let fim; await amb.handlers.activate({ waitUntil: p => { fim = p; } }); await fim;
  assert.deepStrictEqual([...amb.lojas.keys()].filter(k => k.startsWith('hope-os-shell-')).length, 1, 'só o cache novo sobra');
  assert.ok(!amb.lojas.has('hope-os-shell-v1-0-antigo'));
  assert.ok(amb.lojas.get(cacheAtual(amb)).size > 10, 'shell guardado');
  assert.strictEqual(amb.mensagens.length, 1, 'atualização: as páginas abertas são avisadas');
  assert.strictEqual(amb.mensagens[0].tipo, 'nova-versao');
});

test('SW6 primeira instalação (sem cache anterior): ninguém é avisado de "nova versão"', async () => {
  const amb = criarAmbiente({ rede: async () => resposta('x') });
  await amb.handlers.install({ waitUntil: async p => { await p; } });
  let fim; await amb.handlers.activate({ waitUntil: p => { fim = p; } }); await fim;
  assert.strictEqual(amb.mensagens.length, 0);
});

(async () => {
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); ok++; process.stdout.write(`✓ ${n}\n`); } catch (err) { process.stdout.write(`✗ ${n}\n   ${err.message}\n`); }
  }
  console.log(`\nService Worker Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();

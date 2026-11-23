#!/usr/bin/env node
// Gera docs/ROTAS.md: método, caminho completo e permissão (RBAC) de CADA rota registrada no app.
// Mesma travessia do inventário RT-20 (backend/tests/redteam-gate.test.js): lê as camadas do Express
// em tempo de execução, então não depende de regex sobre o texto das rotas.
//
// Uso (na raiz do repositório):
//   node backend/scripts/docs/gerar-indice-rotas.js > docs/ROTAS.md
// Não precisa de Supabase: os valores abaixo são fictícios e nenhuma requisição é feita.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'indice-de-rotas';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'indice-de-rotas';

const { app } = require('../../src/app');
const { authRouter } = require('../../src/routes/auth');
const { publicBookingRouter } = require('../../src/routes/publicBooking');
const { requireAuth } = require('../../src/middleware/auth');

const montagem = new Map([[authRouter, '/api'], [publicBookingRouter, '/api/public']]);
const rotas = [];
let depoisDoAuth = false;

const acoesDe = pilha => pilha.map(l => l.handle && l.handle.rbacAction).filter(Boolean);

for (const layer of app._router.stack) {
  if (layer.handle === requireAuth) { depoisDoAuth = true; continue; }
  if (layer.route) {
    for (const metodo of Object.keys(layer.route.methods)) {
      rotas.push({ metodo: metodo.toUpperCase(), caminho: layer.route.path, acoes: acoesDe(layer.route.stack), autenticada: depoisDoAuth });
    }
    continue;
  }
  if (layer.name !== 'router') continue;
  const prefixo = montagem.get(layer.handle) || '/api';
  const guardas = [];
  for (const l of layer.handle.stack) {
    if (!l.route) { if (l.handle && l.handle.rbacAction) guardas.push(l); continue; }
    const doRouter = guardas.filter(g => g.regexp.test(l.route.path)).map(g => g.handle.rbacAction);
    for (const metodo of Object.keys(l.route.methods)) {
      rotas.push({ metodo: metodo.toUpperCase(), caminho: prefixo + l.route.path, acoes: doRouter.concat(acoesDe(l.route.stack)), autenticada: depoisDoAuth });
    }
  }
}

const ORDEM = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };
const grupoDe = caminho => {
  if (caminho === '/' ) return 'raiz';
  const partes = caminho.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  return partes[0] === 'public' ? 'public/' + (partes[1] || '') : (partes[0] || 'raiz');
};
rotas.sort((a, b) => grupoDe(a.caminho).localeCompare(grupoDe(b.caminho)) || a.caminho.localeCompare(b.caminho) || (ORDEM[a.metodo] - ORDEM[b.metodo]));

const linhas = [];
linhas.push('# Rotas da API (gerado do código)');
linhas.push('');
linhas.push('> **Arquivo gerado. Não edite à mão.** Regenere depois de mudar qualquer rota:');
linhas.push('> `node backend/scripts/docs/gerar-indice-rotas.js > docs/ROTAS.md`');
linhas.push('');
linhas.push('Este índice lista **todas** as rotas registradas no Express, com a permissão que cada uma exige (`authorize`). O significado de cada permissão e quem a recebe está em [`PERMISSOES.md`](PERMISSOES.md). O formato das respostas e os erros estão em [`API_CONTRACT.md`](API_CONTRACT.md).');
linhas.push('');
linhas.push('- **Permissão `—`:** a rota não usa `authorize`. São as rotas de saúde, de login e as **públicas** (`/api/public/*`), que usam outra credencial (limite por IP, link ou código do cliente). A lista de exceções é verificada pelo Red Team RT-20.');
linhas.push('- Rotas depois do `requireAuth` exigem JWT de usuário, credencial de integração ou o token legado (desligado em produção).');
linhas.push('- Permissão com `:` e rótulo (ex.: `agenda:status`) é uma ação RBAC; a permissão efetiva por papel está na matriz.');
linhas.push('');
linhas.push(`Total: **${rotas.length} rotas**.`);

let grupoAtual = null;
for (const r of rotas) {
  const g = grupoDe(r.caminho);
  if (g !== grupoAtual) {
    grupoAtual = g;
    linhas.push('', `## ${g}`, '', '| Método | Caminho | Permissão (RBAC) | Perímetro |', '|---|---|---|---|');
  }
  const acao = r.acoes.length ? r.acoes.map(a => '`' + a + '`').join(' + ') : '—';
  const perimetro = r.caminho.startsWith('/api/public') ? 'público' : (r.autenticada ? 'autenticado' : 'aberto');
  linhas.push(`| ${r.metodo} | \`${r.caminho}\` | ${acao} | ${perimetro} |`);
}
linhas.push('');
process.stdout.write(linhas.join('\n'));

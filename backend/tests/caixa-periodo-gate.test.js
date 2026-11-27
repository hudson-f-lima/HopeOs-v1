// Caixa por período Gate (D-088): GET /api/caixa/periodo?inicio=&fim= (só leitura, até 92 dias).
// HTTP real contra o app; banco e identidade em memória. Hoje = 2026-11-27.
//
// Fixture (centavos; esperado à mão):
//   20/11  k1 dinheiro 5000 + k2 pix 3000       → bruto 8000, taxa 0; fechado com esperado 5000 (confere)
//   21/11  k3 cartão 10000 (taxa 300)           → bruto 10000; estorno de 2000 em dinheiro; sangria 1000; SEM fechamento
//   22/11  nada
//   19/11  k0 9999 (fora do período)
//   empresa B, 20/11, 7777 (nunca aparece)
// Período 20/11–22/11:
//   bruto 18000, taxa 300, líquido 17700, estornos −2000, saldo 16000, sangrias 1000;
//   por forma: cartão 10000 (taxa 300), dinheiro 5000, pix 3000;
//   dias com venda 2, sem fechar 1 (21/11); 20/11 fechado e não desatualizado; 2 linhas em `dias`.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-caixa-periodo-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { env } = require('../src/config/env');
const clock = require('../src/config/clock');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

const E = env.DEFAULT_EMPRESA_ID;
const EB = 'e0000000-0000-4000-8000-0000000000cb';
const ADMIN = 'c0000000-0000-4000-8000-0000000000c1';
const RECEP = 'c0000000-0000-4000-8000-0000000000c2';
const PROFU = 'c0000000-0000-4000-8000-0000000000c3';
const UNIT = 'f0000000-0000-4000-8000-0000000000c1';
const ANA = 'a0000000-0000-4000-8000-0000000000c2';

setIdentityStore(createMemoryIdentityStore({
  app_users: [ADMIN, RECEP, PROFU].map(id => ({ id, email: `${id}@c.test`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: E, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: E, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: E, user_id: PROFU, role: 'profissional', status: 'ativo', profissional_id: ANA }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: UNIT }, { membership_id: 'm3', unit_id: UNIT }]
}));
const tokens = { 'c.admin.s': ADMIN, 'c.recep.s': RECEP, 'c.prof.s': PROFU };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });

const com = (id, data, empresa_id = E) => ({ id, empresa_id, data, hora: '10:00:00', status: 'fechado', cliente_id: null, gorjeta_bruta_centavos: 0, total_gorjeta_liquida_centavos: 0 });
const pag = (id, comando_id, forma_code, valor, taxa = 0, empresa_id = E) => ({ id, empresa_id, comando_id, forma_code, valor_centavos: valor, taxa_total_centavos: taxa });
const mov = (id, data, forma_code, valor, tipo = 'entrada_pagamento', empresa_id = E) => ({ id, empresa_id, data, forma_code, valor_centavos: valor, tipo });
installMemoryBackend({
  empresas: [{ id: E, nome: 'A', horario_por_dia: {} }, { id: EB, nome: 'B', horario_por_dia: {} }],
  profissionais: [{ id: ANA, empresa_id: E, nome: 'Ana', ativo: true }],
  clientes: [],
  formas_pagamento: [{ id: 'f1', empresa_id: E, code: 'dinheiro', label: 'Dinheiro' }, { id: 'f2', empresa_id: E, code: 'pix', label: 'Pix' }, { id: 'f3', empresa_id: E, code: 'cartao', label: 'Cartão' }],
  comandos: [com('k0', '2026-11-19'), com('k1', '2026-11-20'), com('k2', '2026-11-20'), com('k3', '2026-11-21'), com('kb', '2026-11-20', EB)],
  comando_pagamentos: [pag('p0', 'k0', 'pix', 9999), pag('p1', 'k1', 'dinheiro', 5000), pag('p2', 'k2', 'pix', 3000), pag('p3', 'k3', 'cartao', 10000, 300), pag('pb', 'kb', 'pix', 7777, 0, EB)],
  caixa_movimentos: [mov('m0', '2026-11-19', 'pix', 9999), mov('m1', '2026-11-20', 'dinheiro', 5000), mov('m2', '2026-11-20', 'pix', 3000), mov('m3', '2026-11-21', 'cartao', 10000), mov('m4', '2026-11-21', 'dinheiro', -2000, 'estorno_pagamento'), mov('mb', '2026-11-20', 'pix', 7777, 'entrada_pagamento', EB)],
  caixa_ajustes: [{ id: 'a1', empresa_id: E, data: '2026-11-21', tipo: 'sangria', valor_centavos: 1000, motivo: 'banco', created_at: '2026-11-21T18:00:00Z' }],
  caixa_fechamentos: [{ id: 'f20', empresa_id: E, data: '2026-11-20', fundo_troco_centavos: 0, esperado_dinheiro_centavos: 5000, contado_dinheiro_centavos: 5000, diferenca_centavos: 0, total_bruto_centavos: 8000, quantidade_comandas: 2, created_at: '2026-11-20T21:00:00Z' }]
});

let base;
function request(p, token = 'c.admin.s') {
  return new Promise((resolve, reject) => {
    const req = http.request(base + p, { headers: token ? { authorization: `Bearer ${token}` } : {} }, res => {
      let raw = ''; res.on('data', c => { raw += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(raw); } catch (_) {} resolve({ status: res.statusCode, data }); });
    });
    req.on('error', reject); req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('CX01 totais do período 20–22/11 (só a empresa, fora do período não entra)', async () => {
  const r = await request('/api/caixa/periodo?inicio=2026-11-20&fim=2026-11-22');
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  const t = r.data.data.totais;
  assert.deepStrictEqual(
    [t.quantidadeComandas, t.totalBrutoCentavos, t.taxaTotalCentavos, t.liquidoEsperadoCentavos, t.estornosCentavos, t.saldoCentavos, t.sangriasCentavos],
    [3, 18000, 300, 17700, -2000, 16000, 1000]
  );
  assert.deepStrictEqual(t.porForma.map(p => [p.formaCode, p.valorCentavos, p.taxaCentavos]), [['cartao', 10000, 300], ['dinheiro', 5000, 0], ['pix', 3000, 0]]);
  assert.strictEqual(t.ledgerConsistente, true);
});

test('CX02 dias: 20/11 fechado (confere), 21/11 sem fechar; 22/11 sem movimento não aparece', async () => {
  const d = (await request('/api/caixa/periodo?inicio=2026-11-20&fim=2026-11-22')).data.data;
  assert.deepStrictEqual(d.dias.map(x => x.data), ['2026-11-20', '2026-11-21']);
  assert.deepStrictEqual(d.dias[0].fechamento, { diferencaCentavos: 0, desatualizado: false });
  assert.strictEqual(d.dias[1].fechamento, null);
  assert.deepStrictEqual([d.totais.diasComVenda, d.totais.diasComVendaSemFechar, d.totais.diasFechadosDesatualizados], [2, 1, 0]);
  assert.deepStrictEqual([d.dias[1].saldoDoDiaCentavos, d.dias[1].sangriasCentavos], [8000, 1000]);
});

test('CX03 cada dia bate com o caixa do dia (mesma conta de GET /caixa/fechamento)', async () => {
  const per = (await request('/api/caixa/periodo?inicio=2026-11-20&fim=2026-11-21')).data.data;
  for (const dia of per.dias) {
    const um = (await request(`/api/caixa/fechamento?data=${dia.data}`)).data.data;
    assert.deepStrictEqual([dia.quantidadeComandas, dia.totalBrutoCentavos, dia.estornosCentavos, dia.saldoDoDiaCentavos],
      [um.quantidadeComandas, um.totalBrutoCentavos, um.estornos.valorCentavos, um.saldoDoDiaCentavos], dia.data);
  }
});

test('CX04 motor: fechamento vira "desatualizado" quando houve venda depois de fechar', async () => {
  const { resumoCaixaPeriodo } = require('../src/engines/CaixaEngine');
  const comandos = [{ id: 'x1', data: '2026-11-20', status: 'fechado' }, { id: 'x2', data: '2026-11-20', status: 'fechado' }];
  const pagamentos = [{ comando_id: 'x1', forma_code: 'dinheiro', valor_centavos: 5000, taxa_total_centavos: 0 }, { comando_id: 'x2', forma_code: 'dinheiro', valor_centavos: 1500, taxa_total_centavos: 0 }];
  const movimentos = [{ data: '2026-11-20', tipo: 'entrada_pagamento', forma_code: 'dinheiro', valor_centavos: 5000 }, { data: '2026-11-20', tipo: 'entrada_pagamento', forma_code: 'dinheiro', valor_centavos: 1500 }];
  // Fechou com 5000 esperados e 1 comanda; depois entrou a segunda (1500).
  const fechamentos = [{ data: '2026-11-20', fundo_troco_centavos: 0, esperado_dinheiro_centavos: 5000, diferenca_centavos: 0, total_bruto_centavos: 5000, created_at: '2026-11-20T12:00:00Z' }];
  const r = resumoCaixaPeriodo({ inicio: '2026-11-20', fim: '2026-11-21', comandos, pagamentos, movimentos, fechamentos });
  assert.deepStrictEqual(r.dias[0].fechamento, { diferencaCentavos: 0, desatualizado: true });
  assert.strictEqual(r.totais.diasFechadosDesatualizados, 1);
  // Vale o fechamento mais recente do dia: refechado depois da venda, deixa de estar desatualizado.
  fechamentos.push({ data: '2026-11-20', fundo_troco_centavos: 0, esperado_dinheiro_centavos: 6500, diferenca_centavos: -100, total_bruto_centavos: 6500, created_at: '2026-11-20T20:00:00Z' });
  const r2 = resumoCaixaPeriodo({ inicio: '2026-11-20', fim: '2026-11-21', comandos, pagamentos, movimentos, fechamentos });
  assert.deepStrictEqual(r2.dias[0].fechamento, { diferencaCentavos: -100, desatualizado: false });
});

test('CX05 validação: sem inicio/fim, invertido, mais de 92 dias e data inválida → 422', async () => {
  assert.strictEqual(code(await request('/api/caixa/periodo?fim=2026-11-22')), 'INVALID_DATE');
  assert.strictEqual(code(await request('/api/caixa/periodo?inicio=2026-11-20')), 'INVALID_DATE');
  assert.strictEqual(code(await request('/api/caixa/periodo?inicio=2026-11-22&fim=2026-11-20')), 'INVALID_RANGE');
  assert.strictEqual(code(await request('/api/caixa/periodo?inicio=2026-08-01&fim=2026-11-01')), 'RANGE_TOO_LONG');
  assert.strictEqual((await request('/api/caixa/periodo?inicio=2026-08-27&fim=2026-11-26')).status, 200);
  assert.strictEqual(code(await request('/api/caixa/periodo?inicio=2026-13-01&fim=2026-11-26')), 'INVALID_DATE');
});

test('CX06 permissão: recepção lê; profissional sem caixa:conferir → 403; sem token → 401', async () => {
  assert.strictEqual((await request('/api/caixa/periodo?inicio=2026-11-20&fim=2026-11-22', 'c.recep.s')).status, 200);
  assert.strictEqual((await request('/api/caixa/periodo?inicio=2026-11-20&fim=2026-11-22', 'c.prof.s')).status, 403);
  assert.strictEqual((await request('/api/caixa/periodo?inicio=2026-11-20&fim=2026-11-22', null)).status, 401);
});

(async () => {
  clock.definirRelogio(() => new Date('2026-11-27T15:00:00Z'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const origErr = console.error; console.error = () => {};
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); ok++; console.log(`✓ ${n}`); } catch (err) { console.log(`✗ ${n}\n   ${err.message}`); }
  }
  console.error = origErr;
  server.close();
  console.log(`\nCaixa por período Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();

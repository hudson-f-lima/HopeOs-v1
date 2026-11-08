// Caixa Gate: fechamento/conferência de caixa do dia (GET /api/caixa/fechamento).
// Somente leitura. HTTP real contra o app; banco e identidade em memória.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-caixa-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const { env } = require('../src/config/env');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { buildFechamentoCaixa } = require('../src/engines/CaixaEngine');
const { agoraNoFuso } = require('../src/engines/SlotEngine');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

const E = env.DEFAULT_EMPRESA_ID;
const EB = 'e0000000-0000-4000-8000-0000000000cb';
const ADMIN = 'c0000000-0000-4000-8000-0000000000c1';
const RECEP = 'c0000000-0000-4000-8000-0000000000c2';
const PROFU = 'c0000000-0000-4000-8000-0000000000c3';
const ADMIN_B = 'c0000000-0000-4000-8000-0000000000c4';
const UNIT = 'f0000000-0000-4000-8000-0000000000c1';
const PROF = 'a0000000-0000-4000-8000-0000000000c1';
const SERV = 'b0000000-0000-4000-8000-0000000000c1';
const D = '2026-11-07';
const ONTEM = '2026-11-06';

setIdentityStore(createMemoryIdentityStore({
  app_users: [ADMIN, RECEP, PROFU, ADMIN_B].map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: E, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: E, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: E, user_id: PROFU, role: 'profissional', status: 'ativo', profissional_id: PROF },
    { id: 'm4', empresa_id: EB, user_id: ADMIN_B, role: 'admin', status: 'ativo' }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: UNIT }, { membership_id: 'm3', unit_id: UNIT }]
}));
const tokens = { 'h.admin.s': ADMIN, 'h.recep.s': RECEP, 'h.prof.s': PROFU, 'h.adminb.s': ADMIN_B };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });

// Fixtures no formato que o RPC checkout_close grava (migration 003).
const cmd = (id, empresa_id, data, extra = {}) => ({ id, empresa_id, data, status: 'fechado', gorjeta_bruta_centavos: 0, total_gorjeta_liquida_centavos: 0, ...extra });
const pag = (comando_id, empresa_id, forma_code, valor_centavos, taxa_total_centavos = 0) => ({ id: `${comando_id}-${forma_code}`, empresa_id, comando_id, forma_code, valor_centavos, taxa_total_centavos });
const mov = (comando_id, empresa_id, data, forma_code, valor_centavos) => ({ id: `mv-${comando_id}-${forma_code}`, empresa_id, comando_id, data, tipo: 'entrada_pagamento', forma_code, valor_centavos });

const db = installMemoryBackend({
  empresas: [{ id: E, nome: 'A' }, { id: EB, nome: 'B' }],
  formas_pagamento: [
    { empresa_id: E, code: 'dinheiro', label: 'Dinheiro', taxa_pct: 0, taxa_fixa_centavos: 0, dias_recebimento: 0, ativo: true },
    { empresa_id: E, code: 'credito', label: 'Crédito', taxa_pct: 5, taxa_fixa_centavos: 0, dias_recebimento: 30, ativo: true },
    { empresa_id: E, code: 'pix', label: 'Pix', taxa_pct: 0, taxa_fixa_centavos: 0, dias_recebimento: 0, ativo: true },
    { empresa_id: EB, code: 'dinheiro', label: 'Dinheiro B', taxa_pct: 0, taxa_fixa_centavos: 0, dias_recebimento: 0, ativo: true }
  ],
  servicos: [{ id: SERV, empresa_id: E, nome: 'Corte', valor_centavos: 3000, duracao_min: 30, comissao_pct: 40, ativo: true }],
  profissionais: [{ id: PROF, empresa_id: E, nome: 'Robson', ativo: true, modelo_comissao: 'bruto_salao', overrides: {} }],
  profissional_servicos: [{ empresa_id: E, profissional_id: PROF, servico_id: SERV }],
  produtos: [], cargos: [], servico_categorias: [], clientes: [],
  comandos: [
    cmd('cm1', E, D, { gorjeta_bruta_centavos: 1000, total_gorjeta_liquida_centavos: 950 }),
    cmd('cm2', E, D),
    cmd('cm3', E, ONTEM),
    cmd('cm4', EB, D)
  ],
  comando_pagamentos: [
    pag('cm1', E, 'dinheiro', 5000), pag('cm1', E, 'credito', 6000, 300),
    pag('cm2', E, 'pix', 4000), pag('cm2', E, 'dinheiro', 2500),
    pag('cm3', E, 'dinheiro', 9999),
    pag('cm4', EB, 'dinheiro', 7777)
  ],
  caixa_movimentos: [
    mov('cm1', E, D, 'dinheiro', 5000), mov('cm1', E, D, 'credito', 6000),
    mov('cm2', E, D, 'pix', 4000), mov('cm2', E, D, 'dinheiro', 2500),
    mov('cm3', E, ONTEM, 'dinheiro', 9999),
    mov('cm4', EB, D, 'dinheiro', 7777)
  ]
});

let base;
function request(method, path, { token = 'h.admin.s', body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    if (payload !== null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(payload); }
    const req = http.request(base + path, { method, headers }, res => {
      let raw = ''; res.on('data', c => { raw += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(raw); } catch (_) {} resolve({ status: res.statusCode, data }); });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;
const fechamento = (qs, opts) => request('GET', `/api/caixa/fechamento${qs}`, opts);
const forma = (f, c) => f.porForma.find(p => p.formaCode === c);
const tests = [];
const test = (n, f) => tests.push({ n, f });

test('K01 somas por forma, total bruto, taxa, líquido e gorjetas batem com as fixtures', async () => {
  const r = await fechamento(`?data=${D}`);
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  const f = r.data.data;
  assert.strictEqual(f.data, D);
  assert.strictEqual(f.quantidadeComandas, 2);
  assert.strictEqual(f.totalBrutoCentavos, 17500);
  assert.strictEqual(f.taxaTotalCentavos, 300);
  assert.strictEqual(f.liquidoEsperadoCentavos, 17200);
  assert.deepStrictEqual(f.gorjetas, { brutaCentavos: 1000, liquidaCentavos: 950 });
  assert.deepStrictEqual(f.porForma.map(p => p.formaCode), ['dinheiro', 'credito', 'pix'], 'ordenado por valor');
  assert.deepStrictEqual(forma(f, 'dinheiro'), { formaCode: 'dinheiro', quantidadePagamentos: 2, valorCentavos: 7500, taxaCentavos: 0, liquidoEsperadoCentavos: 7500, label: 'Dinheiro', diasRecebimento: 0, dataRecebimentoPrevista: D });
  assert.deepStrictEqual(forma(f, 'credito'), { formaCode: 'credito', quantidadePagamentos: 1, valorCentavos: 6000, taxaCentavos: 300, liquidoEsperadoCentavos: 5700, label: 'Crédito', diasRecebimento: 30, dataRecebimentoPrevista: '2026-12-07' });
  assert.strictEqual(forma(f, 'pix').valorCentavos, 4000);
  assert.strictEqual(f.porForma.reduce((s, p) => s + p.valorCentavos, 0), f.totalBrutoCentavos);
  assert.deepStrictEqual(f.dinheiro, { formaCode: 'dinheiro', esperadoCentavos: 7500 });
  assert.deepStrictEqual(f.ledger, { caixaMovimentosCentavos: 17500, consistente: true, divergencias: [] });
  assert.strictEqual(f.persistido, false);
  for (const v of [f.totalBrutoCentavos, f.taxaTotalCentavos, ...f.porForma.map(p => p.liquidoEsperadoCentavos)]) assert.ok(Number.isInteger(v), 'centavos inteiros');
});

test('K02 isolamento: comanda de outra empresa não entra; empresa_id da query é ignorado', async () => {
  const a = (await fechamento(`?data=${D}&empresa_id=${EB}&empresaId=${EB}`)).data.data;
  assert.strictEqual(a.totalBrutoCentavos, 17500, 'empresa A não vê os 7777 da B');
  assert.strictEqual(a.dinheiro.esperadoCentavos, 7500);
  const b = (await fechamento(`?data=${D}&empresa_id=${E}`, { token: 'h.adminb.s' })).data.data;
  assert.strictEqual(b.quantidadeComandas, 1);
  assert.strictEqual(b.totalBrutoCentavos, 7777);
  assert.strictEqual(forma(b, 'dinheiro').label, 'Dinheiro B');
  const ontem = (await fechamento(`?data=${ONTEM}`)).data.data;
  assert.strictEqual(ontem.totalBrutoCentavos, 9999, 'outro dia fica fora');
});

test('K03 RBAC: recepção e gestão leem; profissional recebe 403; sem credencial 401', async () => {
  assert.strictEqual((await fechamento(`?data=${D}`, { token: 'h.recep.s' })).status, 200);
  const p = await fechamento(`?data=${D}`, { token: 'h.prof.s' });
  assert.strictEqual(p.status, 403); assert.strictEqual(code(p), 'INSUFFICIENT_ROLE');
  assert.strictEqual((await fechamento(`?data=${D}`, { token: null })).status, 401);
  const src = fs.readFileSync(require.resolve('../src/routes/caixa.js'), 'utf8');
  const semRbac = src.split('\n').filter(l => /^router\.(get|post|patch|put|delete)\(/.test(l) && !l.includes("authorize('relatorios:operacional')"));
  assert.deepStrictEqual(semRbac, [], 'toda rota de caixa declara authorize');
  assert.ok(!/router\.(post|patch|put|delete)\(/.test(src), 'caixa é somente leitura');
});

test('K04 data inválida → 422; sem data → hoje no fuso da empresa', async () => {
  for (const d of ['2026-13-01', '2026-02-30', '07/11/2026', 'hoje', '2026-1-7']) {
    const r = await fechamento(`?data=${encodeURIComponent(d)}`);
    assert.strictEqual(r.status, 422, d); assert.strictEqual(code(r), 'INVALID_DATE', d);
  }
  const r = await fechamento('');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.data.data, agoraNoFuso(env.APP_TIMEZONE).data);
});

test('K05 conferência: diferença contado − esperado em dinheiro (sobra, falta, zero); nada é gravado', async () => {
  const antes = JSON.stringify([db.comandos, db.comando_pagamentos, db.caixa_movimentos]);
  const falta = (await fechamento(`?data=${D}&contadoDinheiroCentavos=7000`)).data.data.dinheiro;
  assert.deepStrictEqual(falta, { formaCode: 'dinheiro', esperadoCentavos: 7500, contadoCentavos: 7000, diferencaCentavos: -500 });
  assert.strictEqual((await fechamento(`?data=${D}&contadoDinheiroCentavos=7650`)).data.data.dinheiro.diferencaCentavos, 150);
  assert.strictEqual((await fechamento(`?data=${D}&contadoDinheiroCentavos=7500`)).data.data.dinheiro.diferencaCentavos, 0);
  assert.strictEqual((await fechamento(`?data=${ONTEM}&contadoDinheiroCentavos=0`)).data.data.dinheiro.diferencaCentavos, -9999);
  for (const v of ['-1', '12.5', 'abc', '1e3']) {
    const r = await fechamento(`?data=${D}&contadoDinheiroCentavos=${v}`);
    assert.strictEqual(r.status, 422, v); assert.strictEqual(code(r), 'INVALID_FIELD', v);
  }
  assert.strictEqual(JSON.stringify([db.comandos, db.comando_pagamentos, db.caixa_movimentos]), antes, 'leitura não grava');
});

test('K06 checkout real entra no fechamento de HOJE no fuso da empresa; data enviada pelo cliente é ignorada (D-012)', async () => {
  const DIA = agoraNoFuso(env.APP_TIMEZONE).data;
  const close = await request('POST', '/api/checkout/close', { token: 'h.recep.s', body: {
    data: '2020-01-01', idempotencyKey: 'k06', itens: [{ tipo: 'servico', servicoId: SERV, profissionalId: PROF }],
    payments: [{ formaCode: 'credito', valorCentavos: 2000 }, { formaCode: 'dinheiro', valorCentavos: 1500 }], gorjetaCentavos: 500
  } });
  assert.strictEqual(close.status, 201, JSON.stringify(close.data));
  assert.strictEqual(db.comandos.filter(c => c.data === '2020-01-01').length, 0, 'não aceita data retroativa do cliente');
  const f = (await fechamento(`?data=${DIA}&contadoDinheiroCentavos=1500`, { token: 'h.recep.s' })).data.data;
  assert.strictEqual(f.quantidadeComandas, 1);
  assert.strictEqual(f.totalBrutoCentavos, 3500);
  assert.strictEqual(f.gorjetas.brutaCentavos, 500);
  assert.strictEqual(forma(f, 'credito').taxaCentavos, 100, '5% de 2000 calculado pelo backend');
  assert.strictEqual(f.dinheiro.diferencaCentavos, 0);
  assert.strictEqual(f.ledger.consistente, true);
});

test('K07 engine pura: divergência entre pagamentos e caixa_movimentos é apontada; status ≠ fechado fica fora', () => {
  const r = buildFechamentoCaixa({
    data: D,
    comandos: [cmd('x1', E, D), cmd('x2', E, D, { status: 'aberto' })],
    pagamentos: [pag('x1', E, 'dinheiro', 1000), pag('x2', E, 'dinheiro', 5000)],
    movimentos: [mov('x1', E, D, 'dinheiro', 900)],
    formasPagamento: []
  });
  assert.strictEqual(r.quantidadeComandas, 1);
  assert.strictEqual(r.totalBrutoCentavos, 1000);
  assert.strictEqual(r.dinheiro.esperadoCentavos, 900, 'esperado em dinheiro vem do ledger do caixa');
  assert.deepStrictEqual(r.ledger.divergencias, [{ formaCode: 'dinheiro', pagamentosCentavos: 1000, caixaMovimentosCentavos: 900 }]);
  assert.strictEqual(r.ledger.consistente, false);
  assert.ok(!('label' in r.porForma[0]) && !('dataRecebimentoPrevista' in r.porForma[0]), 'sem cadastro da forma: omite, não estima');
});

(async () => {
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const origErr = console.error; console.error = () => {};
  let passed = 0; let failed = 0;
  for (const t of tests) {
    try { await t.f(); passed++; process.stdout.write(`✓ ${t.n}\n`); }
    catch (err) { failed++; process.stdout.write(`✗ ${t.n}\n  ${err.message}\n`); }
  }
  console.error = origErr;
  server.close();
  console.log(`\nCaixa Gate: ${passed}/${tests.length} testes verdes.`);
  if (failed) process.exit(1);
})();

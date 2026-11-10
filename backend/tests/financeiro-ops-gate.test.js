// Financeiro Ops Gate (D-017, migration 010): pagamento de comissão (pagamento, vale,
// estorno, saldo) e caixa (sangria, suprimento, fechamento salvo). Função pura com
// números à mão + HTTP real (banco e identidade em memória). As regras que só o banco
// garante (imutabilidade, um estorno por lançamento, tenant do profissional) estão em
// supabase/tests/gate_010.sql.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-finops-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { env } = require('../src/config/env');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { computeSaldoComissao } = require('../src/engines/ComissaoPagamentos');
const { buildFechamentoCaixa, aplicarAjustesCaixa } = require('../src/engines/CaixaEngine');
const { agoraNoFuso } = require('../src/engines/SlotEngine');
const { ACTIONS } = require('../src/auth/rbac');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

const tests = [];
const test = (n, f) => tests.push({ n, f });

const E = env.DEFAULT_EMPRESA_ID;
const EB = 'e0000000-0000-4000-8000-0000000000dd';
const P1 = 'a0000000-0000-4000-8000-0000000000d1';
const P2 = 'a0000000-0000-4000-8000-0000000000d2';
const PB = 'a0000000-0000-4000-8000-0000000000d3';
const UNIT = 'f0000000-0000-4000-8000-0000000000d1';
const H = agoraNoFuso(env.APP_TIMEZONE).data;

// Ganhos de P1 (histórico inteiro): comissão 40,00 + 40,00 + gorjeta 10,00 = 90,00;
// estorno de comanda devolve 40,00 de comissão → ganho líquido 50,00. P2: 25,00.
const COMANDOS = [{ id: 'k1', empresa_id: E, data: '2026-06-05' }, { id: 'k2', empresa_id: E, data: '2026-06-20' }, { id: 'kh', empresa_id: E, data: H }, { id: 'kb', empresa_id: EB, data: H }];
const item = (id, comando_id, profissional_id, valor, comissao, empresa_id = E) => ({ id, empresa_id, comando_id, tipo: 'servico', profissional_id, quantidade: 1, descricao: id, valor_liquido_centavos: valor, comissao_centavos: comissao, receita_empresa_centavos: valor - comissao });
const ITENS = [item('i1', 'k1', P1, 10000, 4000), item('i2', 'k1', P2, 5000, 2500), item('i3', 'k2', P1, 10000, 4000), item('ib', 'kb', PB, 9000, 9000, EB)];
const GORJETAS = [{ id: 'g1', empresa_id: E, comando_id: 'k1', profissional_id: P1, valor_liquido_centavos: 1000 }];
const ESTORNOS = [{ id: 'e1', empresa_id: E, comando_id: 'k2', data: '2026-06-25' }];
const EST_ITENS = [{ id: 'x1', empresa_id: E, estorno_id: 'e1', comando_id: 'k2', comando_item_id: 'i3', quantidade: 1, valor_liquido_centavos: 10000, comissao_centavos: 4000, receita_empresa_centavos: 6000 }];
const dados = { comandos: COMANDOS, comandoItens: ITENS, gorjetas: GORJETAS, estornos: ESTORNOS, estornoItens: EST_ITENS, estornoGorjetas: [] };
const pg = (id, tipo, valor, extra = {}) => ({ id, empresa_id: E, profissional_id: P1, tipo, valor_centavos: valor, data: '2026-07-01', ...extra });

test('F01 saldo puro: ganho 50,00 − (pagamento 20,00 + vale 10,00 − estorno do vale 10,00) = 30,00', () => {
  const r = computeSaldoComissao({ ...dados, profissionalId: P1, pagamentos: [pg('a', 'pagamento', 2000), pg('b', 'vale', 1000), pg('c', 'estorno', 1000, { estorna_id: 'b' }), { ...pg('z', 'pagamento', 9999), profissional_id: P2 }] });
  assert.deepStrictEqual([r.ganhoCentavos, r.pagamentosCentavos, r.valesCentavos, r.estornadoCentavos, r.recebidoCentavos, r.saldoCentavos], [5000, 2000, 1000, 1000, 2000, 3000]);
  assert.deepStrictEqual(r.lancamentos.map(l => [l.id, l.estornado]).sort(), [['a', false], ['b', true], ['c', false]]);
});

test('F02 caixa puro: fundo 100,00 + vendas 75,00 + suprimento 20,00 − sangria 30,00 = 165,00; ajuste de outro dia não entra', () => {
  const base = buildFechamentoCaixa({ data: H, comandos: [{ id: 'c', data: H, status: 'fechado' }], pagamentos: [{ comando_id: 'c', forma_code: 'dinheiro', valor_centavos: 7500 }], movimentos: [{ comando_id: 'c', data: H, tipo: 'entrada_pagamento', forma_code: 'dinheiro', valor_centavos: 7500 }], formasPagamento: [] });
  const r = aplicarAjustesCaixa(base, { fundoTrocoCentavos: 10000, contadoDinheiroCentavos: 16000, ajustes: [{ id: '1', data: H, tipo: 'suprimento', valor_centavos: 2000, motivo: 'm' }, { id: '2', data: H, tipo: 'sangria', valor_centavos: 3000, motivo: 'm' }, { id: '3', data: '2020-01-01', tipo: 'sangria', valor_centavos: 99999, motivo: 'm' }] });
  assert.deepStrictEqual(r.dinheiro, { formaCode: 'dinheiro', vendasCentavos: 7500, esperadoCentavos: 16500, contadoCentavos: 16000, diferencaCentavos: -500 });
  assert.deepStrictEqual([r.ajustes.sangriasCentavos, r.ajustes.suprimentosCentavos, r.ajustes.itens.length], [3000, 2000, 2]);
});

// ---------- HTTP ----------
const U = { admin: 'c0000000-0000-4000-8000-0000000000d1', recep: 'c0000000-0000-4000-8000-0000000000d2', prof: 'c0000000-0000-4000-8000-0000000000d3', adminB: 'c0000000-0000-4000-8000-0000000000d5' };
setIdentityStore(createMemoryIdentityStore({
  app_users: Object.values(U).map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: E, user_id: U.admin, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: E, user_id: U.recep, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: E, user_id: U.prof, role: 'profissional', status: 'ativo', profissional_id: P1 },
    { id: 'm5', empresa_id: EB, user_id: U.adminB, role: 'admin', status: 'ativo' }
  ],
  membership_units: ['m2', 'm3'].map(membership_id => ({ membership_id, unit_id: UNIT }))
}));
const tokens = { 'h.admin.s': U.admin, 'h.recep.s': U.recep, 'h.prof.s': U.prof, 'h.adminb.s': U.adminB };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });
const banco = installMemoryBackend({
  empresas: [{ id: E, nome: 'A' }, { id: EB, nome: 'B' }],
  profissionais: [{ id: P1, empresa_id: E, nome: 'Ana', ativo: true }, { id: P2, empresa_id: E, nome: 'Bia', ativo: true }, { id: PB, empresa_id: EB, nome: 'Zeca', ativo: true }],
  formas_pagamento: [],
  comandos: COMANDOS.map(c => ({ status: 'fechado', ...c })), comando_itens: ITENS, comando_gorjetas: GORJETAS,
  comanda_estornos: ESTORNOS, comanda_estorno_itens: EST_ITENS, comanda_estorno_gorjetas: [],
  comando_pagamentos: [{ id: 'cp1', empresa_id: E, comando_id: 'kh', forma_code: 'dinheiro', valor_centavos: 7500, taxa_centavos: 0 }, { id: 'cpb', empresa_id: EB, comando_id: 'kb', forma_code: 'dinheiro', valor_centavos: 9000, taxa_centavos: 0 }],
  caixa_movimentos: [{ id: 'mv1', empresa_id: E, comando_id: 'kh', data: H, tipo: 'entrada_pagamento', forma_code: 'dinheiro', valor_centavos: 7500 }, { id: 'mvb', empresa_id: EB, comando_id: 'kb', data: H, tipo: 'entrada_pagamento', forma_code: 'dinheiro', valor_centavos: 9000 }],
  comissao_pagamentos: [], caixa_ajustes: [], caixa_fechamentos: []
});
const db = t => banco[t];

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
const pagar = (body, opts) => request('POST', '/api/comissoes/pagamentos', { body, ...opts });
const saldo = async (id = P1, opts) => (await request('GET', `/api/comissoes/pagamentos?profissionalId=${id}`, opts)).data.data;

test('F03 pagamento grava com autor, data de hoje e reduz o saldo', async () => {
  assert.strictEqual((await saldo()).saldoCentavos, 5000);
  const r = await pagar({ profissionalId: P1, tipo: 'pagamento', valorCentavos: 2000, referenciaMes: '2026-06', observacao: 'Pix', idempotencyKey: 'p-1' });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  const linha = db('comissao_pagamentos').find(p => p.idempotency_key === 'p-1');
  assert.deepStrictEqual([linha.empresa_id, linha.actor_id, linha.data, linha.valor_centavos, linha.referencia_mes], [E, U.admin, H, 2000, '2026-06']);
  const s = await saldo();
  assert.deepStrictEqual([s.ganhoCentavos, s.recebidoCentavos, s.saldoCentavos, s.nome], [5000, 2000, 3000, 'Ana']);
});

test('F04 pagamento acima do saldo → 422; vale acima do saldo passa e deixa saldo negativo', async () => {
  const acima = await pagar({ profissionalId: P1, tipo: 'pagamento', valorCentavos: 3001, idempotencyKey: 'p-2' });
  assert.deepStrictEqual([acima.status, code(acima), acima.data.error.details.saldoCentavos], [422, 'PAYMENT_EXCEEDS_BALANCE', 3000]);
  const vale = await pagar({ profissionalId: P1, tipo: 'vale', valorCentavos: 4000, idempotencyKey: 'v-1' });
  assert.strictEqual(vale.status, 201);
  assert.strictEqual((await saldo()).saldoCentavos, -1000);
});

test('F05 idempotência: mesma chave e mesmo pedido não duplica; mesma chave com outro valor → 409', async () => {
  const antes = db('comissao_pagamentos').length;
  const de_novo = await pagar({ profissionalId: P1, tipo: 'vale', valorCentavos: 4000, idempotencyKey: 'v-1' });
  assert.deepStrictEqual([de_novo.status, de_novo.data.data.idempotente], [200, true]);
  assert.strictEqual(db('comissao_pagamentos').length, antes);
  const outro = await pagar({ profissionalId: P1, tipo: 'vale', valorCentavos: 4001, idempotencyKey: 'v-1' });
  assert.deepStrictEqual([outro.status, code(outro)], [409, 'IDEMPOTENCY_MISMATCH']);
});

test('F06 estorno devolve o valor ao saldo; segundo estorno → 409; estorno de estorno → 422', async () => {
  const vale = db('comissao_pagamentos').find(p => p.idempotency_key === 'v-1');
  const e1 = await request('POST', `/api/comissoes/pagamentos/${vale.id}/estorno`, { body: { observacao: 'Lançado em duplicidade', idempotencyKey: 'e-1' } });
  assert.strictEqual(e1.status, 201, JSON.stringify(e1.data));
  assert.deepStrictEqual([e1.data.data.tipo, e1.data.data.valorCentavos, e1.data.data.estornaId], ['estorno', 4000, vale.id]);
  assert.strictEqual((await saldo()).saldoCentavos, 3000);
  const repetido = await request('POST', `/api/comissoes/pagamentos/${vale.id}/estorno`, { body: { observacao: 'Lançado em duplicidade', idempotencyKey: 'e-1' } });
  assert.deepStrictEqual([repetido.status, repetido.data.data.idempotente], [200, true]);
  const e2 = await request('POST', `/api/comissoes/pagamentos/${vale.id}/estorno`, { body: { observacao: 'De novo', idempotencyKey: 'e-2' } });
  assert.deepStrictEqual([e2.status, code(e2)], [409, 'ALREADY_REVERSED']);
  const e3 = await request('POST', `/api/comissoes/pagamentos/${e1.data.data.id}/estorno`, { body: { observacao: 'Estorno do estorno', idempotencyKey: 'e-3' } });
  assert.deepStrictEqual([e3.status, code(e3)], [422, 'INVALID_REVERSAL']);
  const semMotivo = await request('POST', `/api/comissoes/pagamentos/${vale.id}/estorno`, { body: { idempotencyKey: 'e-4' } });
  assert.strictEqual(semMotivo.status, 422);
});

test('F07 RBAC: recepção e profissional não pagam; token legado 403; sem token 401; profissional lê só o próprio saldo', async () => {
  const body = { profissionalId: P1, tipo: 'vale', valorCentavos: 100, idempotencyKey: 'rb-1' };
  assert.strictEqual((await pagar(body, { token: 'h.recep.s' })).status, 403);
  assert.strictEqual((await pagar(body, { token: 'h.prof.s' })).status, 403);
  const legado = await pagar(body, { token: process.env.API_ACCESS_TOKEN });
  assert.deepStrictEqual([legado.status, code(legado)], [403, 'USER_PRINCIPAL_REQUIRED']);
  assert.strictEqual((await pagar(body, { token: null })).status, 401);
  assert.strictEqual(db('comissao_pagamentos').some(p => p.idempotency_key === 'rb-1'), false);
  const proprio = await request('GET', `/api/comissoes/pagamentos?profissionalId=${P2}`, { token: 'h.prof.s' });
  assert.deepStrictEqual([proprio.status, proprio.data.data.profissionalId, proprio.data.data.saldoCentavos], [200, P1, 3000]);
  assert.strictEqual((await request('GET', `/api/comissoes/pagamentos?profissionalId=${P1}`, { token: 'h.recep.s' })).status, 403);
  assert.strictEqual(ACTIONS['comissoes:pagar'].userOnly, true);
  assert.strictEqual(ACTIONS['caixa:operar'].userOnly, true);
});

test('F08 isolamento: profissional ou lançamento de outra empresa → 404; empresa_id e actor_id no corpo → 422', async () => {
  const cruzado = await pagar({ profissionalId: PB, tipo: 'vale', valorCentavos: 100, idempotencyKey: 'x-1' });
  assert.deepStrictEqual([cruzado.status, code(cruzado)], [404, 'PROFESSIONAL_NOT_FOUND']);
  const pagoA = db('comissao_pagamentos').find(p => p.idempotency_key === 'p-1');
  const estornoB = await request('POST', `/api/comissoes/pagamentos/${pagoA.id}/estorno`, { token: 'h.adminb.s', body: { observacao: 'Tentativa de outra empresa', idempotencyKey: 'x-2' } });
  assert.deepStrictEqual([estornoB.status, code(estornoB)], [404, 'PAYMENT_NOT_FOUND']);
  for (const extra of [{ empresa_id: EB }, { empresaId: EB }, { actor_id: U.recep }]) {
    const r = await pagar({ profissionalId: P1, tipo: 'vale', valorCentavos: 100, idempotencyKey: 'x-3', ...extra });
    assert.deepStrictEqual([r.status, code(r)], [422, 'FORBIDDEN_FIELD'], JSON.stringify(extra));
  }
  assert.strictEqual((await saldo(PB, { token: 'h.adminb.s' })).ganhoCentavos, 9000);
  assert.strictEqual((await request('GET', `/api/comissoes/pagamentos?profissionalId=${P1}`, { token: 'h.adminb.s' })).status, 404);
});

test('F09 validação: valor, tipo, chave, mês e campo desconhecido → 422 sem gravar', async () => {
  const antes = db('comissao_pagamentos').length;
  const ok = { profissionalId: P1, tipo: 'vale', valorCentavos: 100, idempotencyKey: 'val-1' };
  for (const ruim of [{ valorCentavos: 0 }, { valorCentavos: -5 }, { valorCentavos: 10.5 }, { valorCentavos: '100' }, { valorCentavos: 100000001 }, { tipo: 'estorno' }, { tipo: 'bonus' }, { idempotencyKey: '' }, { idempotencyKey: undefined }, { referenciaMes: '2026-13' }, { data: '2020-01-01' }, { observacao: 'x'.repeat(501) }]) {
    const r = await pagar({ ...ok, ...ruim });
    assert.strictEqual(r.status, 422, JSON.stringify(ruim));
  }
  assert.strictEqual(db('comissao_pagamentos').length, antes);
});

const caixa = async (qs = '', opts) => (await request('GET', `/api/caixa/fechamento${qs}`, opts)).data.data;

test('F10 sangria e suprimento entram no esperado da gaveta; recepção pode lançar', async () => {
  const s = await request('POST', '/api/caixa/ajustes', { token: 'h.recep.s', body: { tipo: 'suprimento', valorCentavos: 2000, motivo: 'Troco do banco', idempotencyKey: 'aj-1' } });
  assert.strictEqual(s.status, 201, JSON.stringify(s.data));
  const g = await request('POST', '/api/caixa/ajustes', { body: { tipo: 'sangria', valorCentavos: 3000, motivo: 'Depósito', idempotencyKey: 'aj-2' } });
  assert.strictEqual(g.status, 201);
  assert.deepStrictEqual([db('caixa_ajustes')[0].actor_id, db('caixa_ajustes')[0].data, db('caixa_ajustes')[0].empresa_id], [U.recep, H, E]);
  const f = await caixa('?fundoTrocoCentavos=10000&contadoDinheiroCentavos=16000');
  assert.deepStrictEqual(f.dinheiro, { formaCode: 'dinheiro', vendasCentavos: 7500, esperadoCentavos: 16500, contadoCentavos: 16000, diferencaCentavos: -500 });
  assert.deepStrictEqual([f.persistido, f.ultimoFechamento], [false, null]);
  const rep = await request('POST', '/api/caixa/ajustes', { body: { tipo: 'sangria', valorCentavos: 3000, motivo: 'Depósito', idempotencyKey: 'aj-2' } });
  assert.deepStrictEqual([rep.status, rep.data.data.idempotente, db('caixa_ajustes').length], [200, true, 2]);
});

test('F11 fechamento: o servidor calcula o esperado; esperado enviado pelo cliente é recusado', async () => {
  const injetado = await request('POST', '/api/caixa/fechamentos', { body: { contadoDinheiroCentavos: 16000, fundoTrocoCentavos: 10000, esperadoDinheiroCentavos: 16000, idempotencyKey: 'f-0' } });
  assert.strictEqual(injetado.status, 422);
  const r = await request('POST', '/api/caixa/fechamentos', { token: 'h.recep.s', body: { contadoDinheiroCentavos: 16000, fundoTrocoCentavos: 10000, observacao: 'Faltou troco', idempotencyKey: 'f-1' } });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  assert.deepStrictEqual([r.data.data.data, r.data.data.esperadoDinheiroCentavos, r.data.data.diferencaCentavos, r.data.data.quantidadeComandas], [H, 16500, -500, 1]);
  const linha = db('caixa_fechamentos')[0];
  assert.deepStrictEqual([linha.actor_id, linha.empresa_id, linha.snapshot.ajustes.sangriasCentavos], [U.recep, E, 3000]);
  const f = await caixa();
  assert.deepStrictEqual([f.persistido, f.ultimoFechamento.diferencaCentavos, f.ultimoFechamento.desatualizado, f.quantidadeFechamentos], [true, -500, false, 1]);
});

test('F12 movimento depois do fechamento marca "desatualizado"; fechar de novo grava outra linha e vale a mais recente', async () => {
  await request('POST', '/api/caixa/ajustes', { body: { tipo: 'sangria', valorCentavos: 500, motivo: 'Lanche da equipe', idempotencyKey: 'aj-3' } });
  assert.strictEqual((await caixa()).ultimoFechamento.desatualizado, true);
  const r = await request('POST', '/api/caixa/fechamentos', { body: { contadoDinheiroCentavos: 16000, fundoTrocoCentavos: 10000, idempotencyKey: 'f-2' } });
  assert.deepStrictEqual([r.status, r.data.data.esperadoDinheiroCentavos, r.data.data.diferencaCentavos], [201, 16000, 0]);
  const f = await caixa();
  assert.deepStrictEqual([f.quantidadeFechamentos, f.ultimoFechamento.diferencaCentavos, f.ultimoFechamento.desatualizado], [2, 0, false]);
  assert.strictEqual(db('caixa_fechamentos')[0].diferenca_centavos, -500, 'o primeiro fechamento não foi alterado');
});

test('F13 caixa: idempotência, dia futuro, valores inválidos e RBAC', async () => {
  const rep = await request('POST', '/api/caixa/fechamentos', { body: { contadoDinheiroCentavos: 16000, fundoTrocoCentavos: 10000, idempotencyKey: 'f-2' } });
  assert.deepStrictEqual([rep.status, rep.data.data.idempotente, db('caixa_fechamentos').length], [200, true, 2]);
  const outro = await request('POST', '/api/caixa/fechamentos', { body: { contadoDinheiroCentavos: 1, fundoTrocoCentavos: 10000, idempotencyKey: 'f-2' } });
  assert.deepStrictEqual([outro.status, code(outro)], [409, 'IDEMPOTENCY_MISMATCH']);
  const futuro = await request('POST', '/api/caixa/fechamentos', { body: { data: '2999-01-01', contadoDinheiroCentavos: 0, idempotencyKey: 'f-3' } });
  assert.deepStrictEqual([futuro.status, code(futuro)], [422, 'INVALID_DATE']);
  for (const ruim of [{ contadoDinheiroCentavos: -1 }, { contadoDinheiroCentavos: 1.5 }, { fundoTrocoCentavos: -1 }, { data: '2026-02-30' }]) {
    assert.strictEqual((await request('POST', '/api/caixa/fechamentos', { body: { contadoDinheiroCentavos: 0, idempotencyKey: 'f-4', ...ruim } })).status, 422, JSON.stringify(ruim));
  }
  for (const ruim of [{ tipo: 'retirada' }, { valorCentavos: 0 }, { motivo: 'ab' }, { motivo: undefined }]) {
    assert.strictEqual((await request('POST', '/api/caixa/ajustes', { body: { tipo: 'sangria', valorCentavos: 100, motivo: 'Motivo válido', idempotencyKey: 'aj-9', ...ruim } })).status, 422, JSON.stringify(ruim));
  }
  const corpo = { tipo: 'sangria', valorCentavos: 100, motivo: 'Motivo válido', idempotencyKey: 'aj-rb' };
  assert.strictEqual((await request('POST', '/api/caixa/ajustes', { token: 'h.prof.s', body: corpo })).status, 403);
  assert.strictEqual((await request('POST', '/api/caixa/fechamentos', { token: 'h.prof.s', body: { contadoDinheiroCentavos: 0, idempotencyKey: 'f-rb' } })).status, 403);
  const legado = await request('POST', '/api/caixa/ajustes', { token: process.env.API_ACCESS_TOKEN, body: corpo });
  assert.deepStrictEqual([legado.status, code(legado)], [403, 'USER_PRINCIPAL_REQUIRED']);
  assert.strictEqual((await request('POST', '/api/caixa/ajustes', { token: null, body: corpo })).status, 401);
});

test('F14 isolamento do caixa: empresa B não vê ajustes nem fechamentos de A', async () => {
  const b = await caixa('', { token: 'h.adminb.s' });
  assert.deepStrictEqual([b.dinheiro.esperadoCentavos, b.ajustes.itens.length, b.persistido, b.quantidadeFechamentos], [9000, 0, false, 0]);
});

(async () => {
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const oe = console.error; const ow = console.warn; console.error = () => {}; console.warn = () => {};
  let passed = 0; let failed = 0;
  for (const t of tests) {
    try { await t.f(); passed++; process.stdout.write(`✓ ${t.n}\n`); }
    catch (err) { failed++; process.stdout.write(`✗ ${t.n}\n  ${err.message}\n`); }
  }
  console.error = oe; console.warn = ow;
  server.close();
  console.log(`\nFinanceiro Ops Gate: ${passed}/${tests.length} testes verdes.`);
  if (failed) process.exit(1);
})();

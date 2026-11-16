// Assinantes Gate (Onda A, fase 2; D-043, migration 022). HTTP real contra o app; banco e identidade
// em memória. "Hoje" fixo: 2026-11-16 (segunda) em America/Sao_Paulo.
// Cobre: vender (com e sem pagamento), ciclos e vencimentos, situação (em dia, atrasada, suspensa
// pela tolerância), pagar ciclo (uma vez só), pausar e retomar (ciclos da pausa dispensados),
// cancelar no fim do ciclo e agora, permissões, isolamento entre empresas e a cobertura de um
// atendimento (coberto, fora da regra, limite, suspensa, estorno devolvendo o uso).
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-assinantes-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const Module = require('module');
const { env } = require('../src/config/env');
const clock = require('../src/config/clock');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { createAppError } = require('../src/errors');
const { situacao, cicloDe, inicioDoCiclo } = require('../src/engines/AssinaturaCicloEngine');
const { app } = require('../src/app');

const HOJE = new Date('2026-11-16T12:00:00Z');
const A = env.DEFAULT_EMPRESA_ID;
const B = 'e0000000-0000-4000-8000-0000000000bb';
const CORTE = 'b0000000-0000-4000-8000-0000000000a1';
const BARBA = 'b0000000-0000-4000-8000-0000000000a2';
const ANA = 'a0000000-0000-4000-8000-0000000000a1';
const BRUNO = 'a0000000-0000-4000-8000-0000000000a2';
const CLI1 = 'd0000000-0000-4000-8000-0000000000a1';
const CLI2 = 'd0000000-0000-4000-8000-0000000000a2';
const CLI3 = 'd0000000-0000-4000-8000-0000000000a3';
const CLI4 = 'd0000000-0000-4000-8000-0000000000a4';
const CLI_B = 'd0000000-0000-4000-8000-0000000000b1';
const CLI5 = 'd0000000-0000-4000-8000-0000000000a5';
const SMART = 'f0000000-0000-4000-8000-0000000000a1';
const ARQ = 'f0000000-0000-4000-8000-0000000000a2';
const FORA = 'f0000000-0000-4000-8000-0000000000a3';
const PLANO_B = 'f0000000-0000-4000-8000-0000000000b1';
const UNIT = 'f0000000-0000-4000-8000-0000000000c1';
const ADMIN = 'c0000000-0000-4000-8000-0000000000a1';
const RECEP = 'c0000000-0000-4000-8000-0000000000a2';
const PROF_USER = 'c0000000-0000-4000-8000-0000000000a3';
const ADMIN_B = 'c0000000-0000-4000-8000-0000000000b1';

setIdentityStore(createMemoryIdentityStore({
  app_users: [ADMIN, RECEP, PROF_USER, ADMIN_B].map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: A, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: A, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: A, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: A, user_id: PROF_USER, role: 'profissional', status: 'ativo', profissional_id: ANA },
    { id: 'm4', empresa_id: B, user_id: ADMIN_B, role: 'admin', status: 'ativo' }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: UNIT }, { membership_id: 'm3', unit_id: UNIT }]
}));
const tokens = { 'h.admin.a': ADMIN, 'h.recep.a': RECEP, 'h.prof.a': PROF_USER, 'h.adminb.a': ADMIN_B };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401); return { id: tokens[t] }; } });

const plano = extra => ({ empresa_id: A, periodicidade: 'mensal', tipo_vencimento: 'base_contratacao', dia_vencimento: null, cobranca: 'manual', disponivel_venda: true,
  tolerancia_dias: 7, comissao_regra: 'rateio', comissao_percentual: 50, fora_regra_acao: 'cobrar_percentual_consumir', fora_regra_percentual: 50, fora_regra_teto_ciclo: 2,
  fora_regra_exige_aprovacao: false, arquivado_em: null, ...extra });
const db = installMemoryBackend({
  empresas: [{ id: A, nome: 'Salão Alfa' }, { id: B, nome: 'Salão Beta' }],
  servicos: [
    { id: CORTE, empresa_id: A, nome: 'Corte', valor_centavos: 6000, duracao_min: 30, ativo: true },
    { id: BARBA, empresa_id: A, nome: 'Barba', valor_centavos: 4000, duracao_min: 30, ativo: true }
  ],
  profissionais: [
    { id: ANA, empresa_id: A, nome: 'Ana', ativo: true, overrides: {} },
    { id: BRUNO, empresa_id: A, nome: 'Bruno', ativo: true, overrides: {} }
  ],
  formas_pagamento: [{ code: 'pix', empresa_id: A, nome: 'Pix', ativo: true, taxa_pct: 0, taxa_fixa_centavos: 0 }],
  clientes: [CLI1, CLI2, CLI3, CLI4, CLI5].map((id, i) => ({ id, empresa_id: A, nome: 'Cliente ' + (i + 1), ativo: true })).concat([{ id: CLI_B, empresa_id: B, nome: 'Cliente B', ativo: true }]),
  assinatura_planos: [
    { id: SMART, nome: 'Smart Corte 3ª a 5ª', preco_centavos: 9490, ...plano() },
    { id: ARQ, nome: 'Arquivado', preco_centavos: 100, ...plano({ arquivado_em: '2026-11-01T00:00:00Z' }) },
    { id: FORA, nome: 'Fora de venda', preco_centavos: 100, ...plano({ disponivel_venda: false }) },
    { id: PLANO_B, nome: 'Plano B', preco_centavos: 100, ...plano({ empresa_id: B }) }
  ],
  assinatura_plano_itens: [{ id: 'i1', empresa_id: A, plano_id: SMART, servico_id: CORTE, desconto_percentual: 100, limite_por_ciclo: 4, dias_semana: [2, 3, 4], horario_inicio: null, horario_fim: null, intervalo_min_dias: null }],
  assinatura_plano_profissionais: []
});

let base;
async function request(method, url, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request(`${base}${url}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, res => {
      let raw = ''; res.on('data', c => { raw += c; }); res.on('end', () => { let parsed = null; try { parsed = JSON.parse(raw); } catch (_) { /* vazio */ } resolve({ status: res.statusCode, data: parsed, raw }); });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;
const campo = r => r.data && r.data.error && r.data.error.details && r.data.error.details.field;
const em = iso => clock.definirRelogio(() => new Date(iso));

const tests = [];
const test = (n, f) => tests.push({ n, f });
const ids = {};

test('A01 vender com pagamento: em dia, ciclo de um mês a partir de hoje, valor do plano (nunca o da tela)', async () => {
  const r = await request('POST', '/api/assinaturas', { token: 'h.recep.a', body: { clienteId: CLI1, planoId: SMART, pagamento: { forma: 'pix' }, valorCentavos: 1 } });
  assert.strictEqual(r.status, 201, r.raw);
  const a = r.data.data; ids.cli1 = a.id;
  assert.deepStrictEqual([a.status, a.inicio, a.situacao.estado, a.situacao.podeUsar], ['ativa', '2026-11-16', 'em_dia', true]);
  assert.deepStrictEqual(a.cicloAtual, { inicio: '2026-11-16', fim: '2026-12-15' });
  assert.deepStrictEqual([a.ciclos.length, a.ciclos[0].estado, a.ciclos[0].valorCentavos, a.ciclos[0].pagoEm], [1, 'paga', 9490, '2026-11-16']);
  assert.deepStrictEqual(a.usosDoCiclo, [{ servicoId: CORTE, usados: 0, limite: 4 }]);
});

test('A02 venda recusada: plano repetido, arquivado, fora de venda, de outra empresa, cliente de outra empresa, início fora da faixa', async () => {
  const dup = await request('POST', '/api/assinaturas', { token: 'h.recep.a', body: { clienteId: CLI1, planoId: SMART } });
  assert.deepStrictEqual([dup.status, code(dup)], [409, 'ASSINATURA_DUPLICADA']);
  assert.deepStrictEqual([(await request('POST', '/api/assinaturas', { token: 'h.recep.a', body: { clienteId: CLI2, planoId: ARQ } })).status], [422]);
  assert.strictEqual(code(await request('POST', '/api/assinaturas', { token: 'h.recep.a', body: { clienteId: CLI2, planoId: FORA } })), 'PLANO_FORA_DE_VENDA');
  assert.strictEqual(campo(await request('POST', '/api/assinaturas', { token: 'h.recep.a', body: { clienteId: CLI2, planoId: PLANO_B } })), 'planoId');
  assert.strictEqual(campo(await request('POST', '/api/assinaturas', { token: 'h.recep.a', body: { clienteId: CLI_B, planoId: SMART } })), 'clienteId');
  assert.strictEqual(campo(await request('POST', '/api/assinaturas', { token: 'h.recep.a', body: { clienteId: CLI2, planoId: SMART, inicio: '2027-03-01' } })), 'inicio');
  assert.strictEqual(campo(await request('POST', '/api/assinaturas', { token: 'h.recep.a', body: { clienteId: CLI2, planoId: SMART, inicio: '16/11/2026' } })), 'inicio');
});

test('A03 sem pagar desde 01/10: dois ciclos em aberto, suspensa pela tolerância; pagar um a um até ficar em dia; pagar de novo = 409', async () => {
  const r = await request('POST', '/api/assinaturas', { token: 'h.recep.a', body: { clienteId: CLI2, planoId: SMART, inicio: '2026-10-01' } });
  assert.strictEqual(r.status, 201, r.raw);
  const a = r.data.data; ids.cli2 = a.id;
  assert.deepStrictEqual([a.situacao.estado, a.situacao.podeUsar, a.situacao.emAberto, a.situacao.maiorAtrasoDias, a.situacao.valorEmAbertoCentavos], ['suspensa', false, 2, 46, 18980]);
  const p1 = await request('POST', `/api/assinaturas/${a.id}/pagar`, { token: 'h.recep.a', body: { cicloInicio: '2026-10-01', forma: 'dinheiro' } });
  assert.deepStrictEqual([p1.status, p1.data.data.situacao.estado, p1.data.data.situacao.maiorAtrasoDias], [200, 'suspensa', 15], p1.raw);
  const p2 = await request('POST', `/api/assinaturas/${a.id}/pagar`, { token: 'h.recep.a', body: { cicloInicio: '2026-11-01' } });
  assert.deepStrictEqual([p2.data.data.situacao.estado, p2.data.data.situacao.podeUsar], ['em_dia', true]);
  assert.strictEqual(code(await request('POST', `/api/assinaturas/${a.id}/pagar`, { token: 'h.recep.a', body: { cicloInicio: '2026-11-01' } })), 'COBRANCA_JA_PAGA');
  assert.strictEqual(campo(await request('POST', `/api/assinaturas/${a.id}/pagar`, { token: 'h.recep.a', body: { cicloInicio: '2026-11-02' } })), 'cicloInicio', 'não é início de ciclo');
  assert.strictEqual(campo(await request('POST', `/api/assinaturas/${a.id}/pagar`, { token: 'h.recep.a', body: { cicloInicio: '2026-12-01' } })), 'cicloInicio', 'ciclo futuro');
  assert.strictEqual(db.assinatura_cobrancas.filter(c => c.assinatura_id === a.id).length, 2);
});

test('A04 dentro da tolerância: 4 dias de atraso = atrasada, ainda usa, com aviso', async () => {
  const r = await request('POST', '/api/assinaturas', { token: 'h.recep.a', body: { clienteId: CLI3, planoId: SMART, inicio: '2026-11-12' } });
  assert.deepStrictEqual([r.data.data.situacao.estado, r.data.data.situacao.podeUsar, r.data.data.situacao.maiorAtrasoDias], ['atrasada', true, 4]);
  assert.ok(/suspende depois de 7/.test(r.data.data.situacao.texto), r.data.data.situacao.texto);
  ids.cli3 = r.data.data.id;
});

test('A05 ciclos e vencimentos: 31/01 vira 28/02 e volta a 31/03; ano bissexto; dia fixo do mês', () => {
  assert.deepStrictEqual([1, 2, 3].map(n => inicioDoCiclo('2026-01-31', 'mensal', n)), ['2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepStrictEqual(cicloDe('2024-02-29', 'anual', '2026-03-01'), { n: 2, inicio: '2026-02-28', fim: '2027-02-27' });
  assert.deepStrictEqual(cicloDe('2026-11-16', 'trimestral', '2027-02-16'), { n: 1, inicio: '2027-02-16', fim: '2027-05-15' });
  assert.strictEqual(cicloDe('2026-11-16', 'mensal', '2026-11-15'), null);
  const { vencimentoDoCiclo } = require('../src/engines/AssinaturaCicloEngine');
  assert.strictEqual(vencimentoDoCiclo({ tipo_vencimento: 'data_fixa', dia_vencimento: 10 }, '2026-11-16'), '2026-12-10');
  assert.strictEqual(vencimentoDoCiclo({ tipo_vencimento: 'data_fixa', dia_vencimento: 20 }, '2026-11-16'), '2026-11-20');
});

test('A06 pausar e retomar: pausada não usa; ciclos que começaram na pausa ficam dispensados; o atual é devido', async () => {
  const p = await request('POST', `/api/assinaturas/${ids.cli1}/pausar`, { token: 'h.admin.a' });
  assert.deepStrictEqual([p.status, p.data.data.status, p.data.data.situacao.podeUsar], [200, 'pausada', false], p.raw);
  em('2027-01-20T12:00:00Z');
  try {
    const r = await request('POST', `/api/assinaturas/${ids.cli1}/retomar`, { token: 'h.admin.a' });
    assert.strictEqual(r.status, 200, r.raw);
    const est = Object.fromEntries(r.data.data.ciclos.map(c => [c.inicio, c.estado]));
    assert.deepStrictEqual(est, { '2026-11-16': 'paga', '2026-12-16': 'dispensada', '2027-01-16': 'em_aberto' });
    assert.deepStrictEqual([r.data.data.situacao.estado, r.data.data.situacao.maiorAtrasoDias], ['atrasada', 4]);
    assert.strictEqual(code(await request('POST', `/api/assinaturas/${ids.cli1}/pagar`, { token: 'h.recep.a', body: { cicloInicio: '2026-12-16' } })), 'COBRANCA_DISPENSADA');
    assert.strictEqual(code(await request('POST', `/api/assinaturas/${ids.cli1}/retomar`, { token: 'h.admin.a' })), 'ASSINATURA_NAO_PAUSADA');
  } finally { em(HOJE.toISOString()); }
});

test('A07 cancelar no fim do ciclo vale até o último dia; "agora" corta hoje; cancelar de novo = 409', async () => {
  const c = await request('POST', `/api/assinaturas/${ids.cli2}/cancelar`, { token: 'h.admin.a', body: { quando: 'fim_do_ciclo' } });
  assert.deepStrictEqual([c.status, c.data.data.status, c.data.data.canceladaEm, c.data.data.situacao.podeUsar], [200, 'cancelada', '2026-11-30', true], c.raw);
  em('2026-11-30T12:00:00Z');
  try { assert.strictEqual((await request('GET', `/api/assinaturas/${ids.cli2}`, { token: 'h.recep.a' })).data.data.situacao.podeUsar, true, 'último dia ainda vale'); } finally { em(HOJE.toISOString()); }
  em('2026-12-01T12:00:00Z');
  try {
    const d = await request('GET', `/api/assinaturas/${ids.cli2}`, { token: 'h.recep.a' });
    assert.deepStrictEqual([d.data.data.situacao.estado, d.data.data.situacao.podeUsar], ['cancelada', false]);
    assert.ok(!d.data.data.ciclos.some(x => x.inicio === '2026-12-01' && x.estado === 'em_aberto'), 'ciclo depois do fim não é cobrado');
  } finally { em(HOJE.toISOString()); }
  const agora = await request('POST', `/api/assinaturas/${ids.cli3}/cancelar`, { token: 'h.admin.a', body: { quando: 'agora' } });
  assert.deepStrictEqual([agora.data.data.situacao.estado, agora.data.data.situacao.podeUsar], ['cancelada', false]);
  assert.strictEqual(code(await request('POST', `/api/assinaturas/${ids.cli3}/cancelar`, { token: 'h.admin.a' })), 'ASSINATURA_JA_CANCELADA');
  assert.strictEqual(campo(await request('POST', `/api/assinaturas/${ids.cli1}/cancelar`, { token: 'h.admin.a', body: { quando: 'ontem' } })), 'quando');
  const lista = await request('GET', '/api/assinaturas', { token: 'h.recep.a' });
  assert.ok(!lista.data.data.some(x => x.id === ids.cli3), 'cancelada some da lista padrão');
  assert.ok((await request('GET', '/api/assinaturas?incluirCanceladas=1', { token: 'h.recep.a' })).data.data.some(x => x.id === ids.cli3));
});

test('A08 permissões: recepção vende e recebe, não pausa nem cancela; profissional sem acesso; sem login 401', async () => {
  assert.strictEqual((await request('POST', `/api/assinaturas/${ids.cli1}/pausar`, { token: 'h.recep.a' })).status, 403);
  assert.strictEqual((await request('POST', `/api/assinaturas/${ids.cli1}/cancelar`, { token: 'h.recep.a' })).status, 403);
  assert.strictEqual((await request('GET', '/api/assinaturas', { token: 'h.prof.a' })).status, 403);
  assert.strictEqual((await request('POST', '/api/assinaturas', { token: 'h.prof.a', body: { clienteId: CLI4, planoId: SMART } })).status, 403);
  assert.strictEqual((await request('GET', '/api/assinaturas')).status, 401);
});

test('A09 isolamento: outra empresa não vê, não paga, não pausa nem consulta cobertura da assinatura de A', async () => {
  for (const [m, u, body] of [['GET', `/api/assinaturas/${ids.cli1}`], ['POST', `/api/assinaturas/${ids.cli1}/pagar`, { cicloInicio: '2026-11-16' }], ['POST', `/api/assinaturas/${ids.cli1}/pausar`]]) {
    assert.strictEqual((await request(m, u, { token: 'h.adminb.a', body })).status, 404, `${m} ${u}`);
  }
  assert.deepStrictEqual((await request('GET', '/api/assinaturas', { token: 'h.adminb.a' })).data.data, []);
  const cob = await request('GET', `/api/assinaturas/cobertura?clienteId=${CLI1}&servicoId=${CORTE}&profissionalId=${ANA}&data=2026-11-18&horario=10:00`, { token: 'h.adminb.a' });
  assert.strictEqual(cob.status, 422, 'serviço e profissional de A não existem para B');
});

test('A10 cobertura: quarta coberta; sábado 50% e gasta uso; 4 usos = limite; estorno devolve o uso; suspensa cobra cheio; sem plano = não assinante', async () => {
  const r = await request('POST', '/api/assinaturas', { token: 'h.recep.a', body: { clienteId: CLI4, planoId: SMART, pagamento: { forma: 'pix' } } });
  const id = r.data.data.id;
  const cob = (dia, prof = BRUNO) => request('GET', `/api/assinaturas/cobertura?clienteId=${CLI4}&servicoId=${CORTE}&profissionalId=${prof}&data=${dia}&horario=10:00`, { token: 'h.recep.a' });
  const qua = (await cob('2026-11-18')).data.data;
  assert.deepStrictEqual([qua.assinante, qua.melhor.situacaoUso, qua.melhor.cobrarCentavos, qua.melhor.consomeUso, qua.melhor.assinaturaId], [true, 'coberto', 0, true, id]);
  const sab = (await cob('2026-11-21')).data.data;
  assert.deepStrictEqual([sab.melhor.situacaoUso, sab.melhor.cobrarCentavos, sab.melhor.consomeUso], ['fora_da_regra', 3000, true]);
  // 4 usos já gravados neste ciclo (o 2º estornado) → 3 contam; o 4º ainda cabe.
  const uso = n => ({ id: 'u' + n, empresa_id: A, assinatura_id: id, ciclo_inicio: '2026-11-16', servico_id: CORTE, profissional_id: ANA, data: '2026-11-1' + n, tipo: 'coberto', consome_uso: true, valor_tabela_centavos: 6000, valor_cobrado_centavos: 0 });
  db.assinatura_usos.push(uso(1), uso(2), uso(3), uso(4));
  db.assinatura_usos_estornos.push({ id: 'e2', empresa_id: A, uso_id: 'u2', estorno_id: 'x' });
  assert.strictEqual((await cob('2026-11-18')).data.data.melhor.situacaoUso, 'coberto', 'estornado devolveu o uso: 3 de 4');
  db.assinatura_usos.push(uso(5));
  const lim = (await cob('2026-11-18')).data.data.melhor;
  assert.deepStrictEqual([lim.situacaoUso, lim.cobrarCentavos, lim.consomeUso], ['limite_atingido', 6000, false]);
  // Suspensa (CLI3 cancelou; CLI2 cancelada no fim do ciclo ainda vale): cliente 2 coberto até 30/11.
  const c2 = (await request('GET', `/api/assinaturas/cobertura?clienteId=${CLI2}&servicoId=${CORTE}&profissionalId=${ANA}&data=2026-11-18&horario=10:00`, { token: 'h.recep.a' })).data.data;
  assert.strictEqual(c2.melhor.situacaoUso, 'coberto');
  // Sem assinatura viva: não assinante.
  const c3 = (await request('GET', `/api/assinaturas/cobertura?clienteId=${CLI3}&servicoId=${CORTE}&profissionalId=${ANA}&data=2026-11-18&horario=10:00`, { token: 'h.recep.a' })).data.data;
  assert.deepStrictEqual([c3.assinante, c3.melhor], [false, null]);
  // Suspensa: tira o pagamento e avança 30 dias.
  db.assinatura_cobrancas = db.assinatura_cobrancas.filter(c => c.assinatura_id !== id);
  em('2026-12-01T12:00:00Z');
  try {
    const s = (await cob('2026-12-02')).data.data.melhor;
    assert.deepStrictEqual([s.situacaoUso, s.cobrarCentavos, s.consomeUso, s.situacao], ['bloqueada', 6000, false, 'suspensa']);
  } finally { em(HOJE.toISOString()); }
});

// --- Comanda com o plano ------------------------------------------------------
const corte = (prof, extra = {}) => ({ tipo: 'servico', servicoId: CORTE, profissionalId: prof, ...extra });
let cli5;
const usosDe = id => db.assinatura_usos.filter(u => u.assinatura_id === id && !db.assinatura_usos_estornos.some(e => e.uso_id === u.id));

test('C01 comanda na segunda (fora de 3ª a 5ª): cobra 50% (R$ 30,00), gasta 1 uso fora da regra; comissão sobre o valor cobrado', async () => {
  cli5 = (await request('POST', '/api/assinaturas', { token: 'h.admin.a', body: { clienteId: CLI5, planoId: SMART, pagamento: { forma: 'pix' } } })).data.data.id;
  const prev = await request('POST', '/api/checkout/preview', { token: 'h.recep.a', body: { clienteId: CLI5, itens: [corte(BRUNO, { assinaturaId: cli5 })], payments: [{ formaCode: 'pix', valorCentavos: 3000 }] } });
  assert.strictEqual(prev.status, 200, prev.raw);
  assert.deepStrictEqual([prev.data.data.totals.totalItensCentavos, prev.data.data.assinaturas[0].situacao, prev.data.data.assinaturas[0].cobrarCentavos, prev.data.data.assinaturas[0].aplicada], [3000, 'fora_da_regra', 3000, true]);
  assert.strictEqual(usosDe(cli5).length, 0, 'prévia não grava');
  const r = await request('POST', '/api/checkout/close', { token: 'h.recep.a', body: { clienteId: CLI5, itens: [corte(BRUNO, { assinaturaId: cli5 })], payments: [{ formaCode: 'pix', valorCentavos: 3000 }] } });
  assert.strictEqual(r.status, 201, r.raw);
  const u = usosDe(cli5);
  assert.deepStrictEqual(u.map(x => [x.tipo, x.consome_uso, x.valor_tabela_centavos, x.valor_cobrado_centavos, x.acao]), [['fora_da_regra', true, 6000, 3000, 'cobrar_percentual_consumir']]);
  const item = db.comando_itens.find(i => i.id === u[0].comando_item_id);
  assert.deepStrictEqual([item.preco_unitario_centavos, item.comissao_centavos], [3000, Math.round(3000 * Number(item.comissao_pct) / 100)]);
});

test('C02 na quarta: dois cortes cobertos sem pagamento (total R$ 0); o 4º uso ainda cobre e o 5º cobra cheio na mesma comanda', async () => {
  em('2026-11-18T13:00:00Z');
  try {
    const r = await request('POST', '/api/checkout/close', { token: 'h.recep.a', body: { clienteId: CLI5, itens: [corte(BRUNO, { assinaturaId: cli5 }), corte(ANA, { assinaturaId: cli5 })], payments: [] } });
    assert.strictEqual(r.status, 201, r.raw);
    assert.deepStrictEqual(usosDe(cli5).filter(x => x.tipo === 'coberto').length, 2);
    const p = await request('POST', '/api/checkout/preview', { token: 'h.recep.a', body: { clienteId: CLI5, itens: [corte(BRUNO, { assinaturaId: cli5 }), corte(ANA, { assinaturaId: cli5 })], payments: [{ formaCode: 'pix', valorCentavos: 6000 }] } });
    assert.deepStrictEqual(p.data.data.assinaturas.map(x => [x.situacao, x.cobrarCentavos]), [['coberto', 0], ['limite_atingido', 6000]], p.raw);
    const c = await request('POST', '/api/checkout/close', { token: 'h.recep.a', body: { clienteId: CLI5, itens: [corte(BRUNO, { assinaturaId: cli5 }), corte(ANA, { assinaturaId: cli5 })], payments: [{ formaCode: 'pix', valorCentavos: 6000 }] } });
    assert.strictEqual(c.status, 201, c.raw);
    assert.strictEqual(usosDe(cli5).filter(x => x.consome_uso).length, 4, 'limite de 4 respeitado');
    const sem = await request('POST', '/api/checkout/close', { token: 'h.recep.a', body: { clienteId: CLI5, itens: [corte(BRUNO, { assinaturaId: cli5 })], payments: [] } });
    assert.deepStrictEqual([sem.status, code(sem)], [422, 'PAYMENT_REQUIRED'], 'limite esgotado: sobra valor a pagar');
  } finally { em(HOJE.toISOString()); }
});

test('C03 recusas: assinatura de outro cliente, plano em produto, sem cliente; nada gravado', async () => {
  const antes = db.comandos.length;
  const outro = await request('POST', '/api/checkout/close', { token: 'h.recep.a', body: { clienteId: CLI1, itens: [corte(BRUNO, { assinaturaId: cli5 })], payments: [] } });
  assert.deepStrictEqual([outro.status, code(outro)], [422, 'ASSINATURA_DE_OUTRO_CLIENTE']);
  const semCliente = await request('POST', '/api/checkout/close', { token: 'h.recep.a', body: { itens: [corte(BRUNO, { assinaturaId: cli5 })], payments: [] } });
  assert.strictEqual(code(semCliente), 'ASSINATURA_SEM_CLIENTE');
  const vazio = await request('POST', '/api/checkout/close', { token: 'h.recep.a', body: { clienteId: CLI5, itens: [corte(BRUNO)], payments: [] } });
  assert.strictEqual(code(vazio), 'PAYMENT_REQUIRED', 'sem plano, pagamento continua obrigatório');
  const preco = await request('POST', '/api/checkout/close', { token: 'h.recep.a', body: { clienteId: CLI5, itens: [corte(BRUNO, { assinaturaId: cli5, precoUnitarioCentavos: 0 })], payments: [] } });
  assert.strictEqual(code(preco), 'FRONTEND_FINANCIAL_INPUT_FORBIDDEN', 'a tela não informa preço');
  assert.strictEqual(db.comandos.length, antes);
});

test('C04 plano que exige liberação: recepção é recusada no uso fora da regra; a gestão fecha e fica registrada como quem liberou', async () => {
  db.assinatura_planos.find(p => p.id === SMART).fora_regra_exige_aprovacao = true;
  try {
    const rec = await request('POST', '/api/checkout/close', { token: 'h.recep.a', body: { clienteId: CLI1, itens: [corte(BRUNO, { assinaturaId: ids.cli1 })], payments: [{ formaCode: 'pix', valorCentavos: 3000 }] } });
    assert.deepStrictEqual([rec.status, code(rec)], [403, 'APROVACAO_NECESSARIA']);
    const adm = await request('POST', '/api/checkout/close', { token: 'h.admin.a', body: { clienteId: CLI1, itens: [corte(BRUNO, { assinaturaId: ids.cli1 })], payments: [{ formaCode: 'pix', valorCentavos: 3000 }] } });
    assert.strictEqual(adm.status, 201, adm.raw);
    assert.strictEqual(usosDe(ids.cli1).pop().aprovado_por, ADMIN);
  } finally { db.assinatura_planos.find(p => p.id === SMART).fora_regra_exige_aprovacao = false; }
});

test('C05 estornar a comanda devolve o uso ao ciclo; a cobertura volta a valer', async () => {
  const consumidos = () => usosDe(cli5).filter(x => x.consome_uso).length;
  assert.strictEqual(consumidos(), 4);
  const coberta = db.comandos.filter(c => c.cliente_id === CLI5 && Number(c.total_recebido_centavos) === 0).pop();
  em('2026-11-18T13:00:00Z'); // estorno no dia da comanda
  try {
    const e = await request('POST', `/api/comandas/${coberta.id}/estorno`, { token: 'h.admin.a', body: { idempotencyKey: 'est-c05', tipo: 'total', motivoCodigo: 'erro_lancamento', motivo: 'Fechada no cliente errado' } });
    assert.strictEqual(e.status, 201, e.raw);
    assert.strictEqual(consumidos(), 2, 'os dois usos da comanda estornada voltaram');
    const p = await request('POST', '/api/checkout/preview', { token: 'h.recep.a', body: { clienteId: CLI5, itens: [corte(BRUNO, { assinaturaId: cli5 })], payments: [] } });
    assert.strictEqual(p.data.data.assinaturas[0].situacao, 'coberto', p.raw);
  } finally { em(HOJE.toISOString()); }
});

// --- Controle negativo -------------------------------------------------------
test('NC1 controle negativo: sem a tolerância, 4 dias de atraso já suspenderia (A04 pegaria)', () => {
  const arquivo = path.join(__dirname, '../src/engines/AssinaturaCicloEngine.js');
  const src = fs.readFileSync(arquivo, 'utf8');
  const trecho = 'if (maiorAtraso <= tolerancia) return { ...base, estado: \'atrasada\'';
  assert.ok(src.includes(trecho), 'trecho do mutante não encontrado');
  const m = new Module(arquivo, module);
  m.filename = arquivo; m.paths = Module._nodeModulePaths(path.dirname(arquivo));
  m._compile(src.replace(trecho, 'if (false) return { ...base, estado: \'atrasada\''), arquivo);
  const args = { assinatura: { inicio: '2026-11-12', status: 'ativa' }, plano: { periodicidade: 'mensal', preco_centavos: 1, tolerancia_dias: 7 }, cobrancas: [], hoje: '2026-11-16' };
  assert.strictEqual(m.exports.situacao(args).estado, 'suspensa', 'o mutante suspende');
  assert.strictEqual(situacao(args).estado, 'atrasada');
});

(async () => {
  const origErr = console.error; console.error = () => {};
  em(HOJE.toISOString());
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); ok++; process.stdout.write(`✓ ${n}\n`); } catch (err) { process.stdout.write(`✗ ${n}\n   ${err.message}\n`); }
  }
  server.close(); console.error = origErr;
  console.log(`\nAssinantes Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();

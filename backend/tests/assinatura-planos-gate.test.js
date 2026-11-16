// Assinatura Planos Gate (Onda A, fase 1; D-042, migration 021). HTTP real contra o app; banco e
// identidade em memória. Cobre: criar, editar e arquivar plano (tudo junto: itens e profissionais),
// validação, nome único, isolamento entre empresas, permissões e o motor de regras (cobertura,
// limite, dias, horário, profissional, intervalo e a política "fora da regra" com teto).
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-assinatura-token';
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
const { avaliarUso, precoDeTabela } = require('../src/engines/AssinaturaRegrasEngine');
const { app } = require('../src/app');

const A = env.DEFAULT_EMPRESA_ID;
const B = 'e0000000-0000-4000-8000-0000000000bb';
const CORTE = 'b0000000-0000-4000-8000-0000000000a1';
const BARBA = 'b0000000-0000-4000-8000-0000000000a2';
const CORTE_B = 'b0000000-0000-4000-8000-0000000000b1';
const ANA = 'a0000000-0000-4000-8000-0000000000a1';
const BETO = 'a0000000-0000-4000-8000-0000000000a2';
const BIA_B = 'a0000000-0000-4000-8000-0000000000b1';
const UNIT = 'f0000000-0000-4000-8000-0000000000a1';
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
const tokens = { 'h.admin.p': ADMIN, 'h.recep.p': RECEP, 'h.prof.p': PROF_USER, 'h.adminb.p': ADMIN_B };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401); return { id: tokens[t] }; } });

const db = installMemoryBackend({
  empresas: [{ id: A, nome: 'Salão Alfa' }, { id: B, nome: 'Salão Beta' }],
  servicos: [
    { id: CORTE, empresa_id: A, nome: 'Corte', valor_centavos: 5500, duracao_min: 30, ativo: true },
    { id: BARBA, empresa_id: A, nome: 'Barba', valor_centavos: 4000, duracao_min: 30, ativo: true },
    { id: CORTE_B, empresa_id: B, nome: 'Corte B', valor_centavos: 5000, duracao_min: 30, ativo: true }
  ],
  profissionais: [
    { id: ANA, empresa_id: A, nome: 'Ana', ativo: true, overrides: { [CORTE]: { valor_centavos: 6000 } } },
    { id: BETO, empresa_id: A, nome: 'Beto', ativo: true, overrides: {} },
    { id: BIA_B, empresa_id: B, nome: 'Bia', ativo: true, overrides: {} }
  ]
});

let base;
async function request(method, url, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request(`${base}${url}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(data ? { 'content-length': Buffer.byteLength(data) } : {}) } }, res => {
      let raw = ''; res.on('data', c => { raw += c; }); res.on('end', () => { let parsed = null; try { parsed = JSON.parse(raw); } catch (_) { /* corpo vazio */ } resolve({ status: res.statusCode, data: parsed, raw }); });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;
const campo = r => r.data && r.data.error && r.data.error.details && r.data.error.details.field;

// Plano do exemplo do dono: corte de terça a quinta; fora disso cobra 50% e consome um uso.
const SMART = {
  nome: 'Smart Corte 3ª a 5ª', precoCentavos: 9490,
  comissao: { regra: 'rateio', percentual: 50 },
  foraDaRegra: { acao: 'cobrar_percentual_consumir', percentual: 50, tetoCiclo: 2 },
  itens: [{ servicoId: CORTE, limitePorCiclo: 4, diasSemana: [2, 3, 4] }]
};

const tests = [];
const test = (n, f) => tests.push({ n, f });
let smartId;

test('P01 criar plano: grava plano, itens e profissionais juntos; padrões do dono (mensal, 7 dias, bloquear quando não informado)', async () => {
  const r = await request('POST', '/api/assinaturas/planos', { token: 'h.admin.p', body: { ...SMART, profissionais: [BETO] } });
  assert.strictEqual(r.status, 201, r.raw);
  const p = r.data.data; smartId = p.id;
  assert.deepStrictEqual([p.periodicidade, p.tipoVencimento, p.toleranciaDias, p.cobranca, p.disponivelVenda], ['mensal', 'base_contratacao', 7, 'manual', true]);
  assert.deepStrictEqual(p.comissao, { regra: 'rateio', percentual: 50, fixaCentavos: null });
  assert.deepStrictEqual(p.foraDaRegra, { acao: 'cobrar_percentual_consumir', percentual: 50, tetoCiclo: 2, exigeAprovacao: false });
  assert.deepStrictEqual(p.itens, [{ servicoId: CORTE, descontoPercentual: 100, limitePorCiclo: 4, diasSemana: [2, 3, 4], horarioInicio: null, horarioFim: null, intervaloMinDias: null }]);
  assert.deepStrictEqual(p.profissionais, [BETO]);
  const simples = await request('POST', '/api/assinaturas/planos', { token: 'h.admin.p', body: { nome: 'Barba livre', precoCentavos: 8000, comissao: { regra: 'tabela' }, itens: [{ servicoId: BARBA }] } });
  assert.strictEqual(simples.status, 201, simples.raw);
  assert.strictEqual(simples.data.data.foraDaRegra.acao, 'bloquear', 'padrão de plano novo = bloquear (decisão do dono)');
  assert.strictEqual(simples.data.data.itens[0].limitePorCiclo, null, 'sem limite = ilimitado');
});

test('P02 validação: cada campo errado é recusado com o nome do campo, sem gravar nada', async () => {
  const antes = db.assinatura_planos.length;
  const casos = [
    [{ ...SMART, nome: '  ' }, 'nome'],
    [{ ...SMART, nome: 'X', itens: [] }, 'itens'],
    [{ ...SMART, nome: 'X', itens: [{ servicoId: CORTE }, { servicoId: CORTE }] }, 'itens[1].servicoId'],
    [{ ...SMART, nome: 'X', itens: [{ servicoId: CORTE, descontoPercentual: 0 }] }, 'itens[0].descontoPercentual'],
    [{ ...SMART, nome: 'X', itens: [{ servicoId: CORTE, diasSemana: [7] }] }, 'itens[0].diasSemana'],
    [{ ...SMART, nome: 'X', itens: [{ servicoId: CORTE, horarioInicio: '18:00', horarioFim: '09:00' }] }, 'itens[0].horarioInicio'],
    [{ ...SMART, nome: 'X', itens: [{ servicoId: CORTE, horarioInicio: '09:00' }] }, 'itens[0].horarioInicio'],
    [{ ...SMART, nome: 'X', itens: [{ servicoId: CORTE, limitePorCiclo: 0 }] }, 'itens[0].limitePorCiclo'],
    [{ ...SMART, nome: 'X', comissao: { regra: 'rateio' } }, 'comissao.percentual'],
    [{ ...SMART, nome: 'X', comissao: { regra: 'fixo_por_uso' } }, 'comissao.fixaCentavos'],
    [{ ...SMART, nome: 'X', foraDaRegra: { acao: 'cobrar_percentual_sem_consumir' } }, 'foraDaRegra.percentual'],
    [{ ...SMART, nome: 'X', foraDaRegra: { acao: 'cobrar_percentual_consumir', percentual: 120 } }, 'foraDaRegra.percentual'],
    [{ ...SMART, nome: 'X', foraDaRegra: { acao: 'dar_desconto' } }, 'foraDaRegra.acao'],
    [{ ...SMART, nome: 'X', tipoVencimento: 'data_fixa' }, 'diaVencimento'],
    [{ ...SMART, nome: 'X', precoCentavos: -1 }, 'precoCentavos'],
    [{ ...SMART, nome: 'X', periodicidade: 'semanal' }, 'periodicidade'],
    [{ ...SMART, nome: 'X', profissionais: ['nao-uuid'] }, 'profissionais[0]']
  ];
  for (const [body, esperado] of casos) {
    const r = await request('POST', '/api/assinaturas/planos', { token: 'h.admin.p', body });
    assert.strictEqual(r.status, 422, `${esperado}: ${r.raw}`);
    assert.strictEqual(campo(r), esperado, `${esperado}: ${r.raw}`);
  }
  assert.strictEqual(db.assinatura_planos.length, antes, 'nada gravado');
});

test('P03 nome único entre planos ativos (sem diferenciar maiúscula e espaço); arquivar libera o nome', async () => {
  const dup = await request('POST', '/api/assinaturas/planos', { token: 'h.admin.p', body: { ...SMART, nome: '  smart corte 3ª A 5ª ' } });
  assert.deepStrictEqual([dup.status, code(dup)], [409, 'PLANO_NOME_DUPLICADO'], dup.raw);
  const temp = await request('POST', '/api/assinaturas/planos', { token: 'h.admin.p', body: { ...SMART, nome: 'Temporário' } });
  const arq = await request('POST', `/api/assinaturas/planos/${temp.data.data.id}/arquivar`, { token: 'h.admin.p' });
  assert.strictEqual(arq.status, 200, arq.raw);
  const lista = await request('GET', '/api/assinaturas/planos', { token: 'h.admin.p' });
  assert.ok(!lista.data.data.some(p => p.nome === 'Temporário'), 'arquivado fora da lista padrão');
  assert.ok((await request('GET', '/api/assinaturas/planos?arquivados=1', { token: 'h.admin.p' })).data.data.some(p => p.nome === 'Temporário' && p.arquivado));
  const deNovo = await request('POST', '/api/assinaturas/planos', { token: 'h.admin.p', body: { ...SMART, nome: 'temporário' } });
  assert.strictEqual(deNovo.status, 201, deNovo.raw);
  const editarArquivado = await request('PUT', `/api/assinaturas/planos/${temp.data.data.id}`, { token: 'h.admin.p', body: SMART });
  assert.deepStrictEqual([editarArquivado.status, code(editarArquivado)], [409, 'PLANO_ARQUIVADO']);
});

test('P04 editar troca itens e profissionais de uma vez (a lista nova substitui a antiga)', async () => {
  const r = await request('PUT', `/api/assinaturas/planos/${smartId}`, { token: 'h.admin.p', body: {
    ...SMART, precoCentavos: 9990, profissionais: [],
    itens: [{ servicoId: CORTE, limitePorCiclo: 4, diasSemana: [2, 3, 4], horarioInicio: '09:00', horarioFim: '17:00' }, { servicoId: BARBA, descontoPercentual: 50 }]
  } });
  assert.strictEqual(r.status, 200, r.raw);
  assert.strictEqual(r.data.data.precoCentavos, 9990);
  assert.deepStrictEqual(r.data.data.itens.map(i => [i.servicoId, i.descontoPercentual, i.horarioInicio]), [[CORTE, 100, '09:00'], [BARBA, 50, null]]);
  assert.deepStrictEqual(r.data.data.profissionais, [], 'lista vazia = todos');
  assert.strictEqual(db.assinatura_plano_itens.filter(i => i.plano_id === smartId).length, 2, 'sem item antigo sobrando');
});

test('P05 isolamento: serviço e profissional de outra empresa recusados; plano de outra empresa = 404', async () => {
  const s = await request('POST', '/api/assinaturas/planos', { token: 'h.admin.p', body: { ...SMART, nome: 'Cruzado', itens: [{ servicoId: CORTE_B }] } });
  assert.deepStrictEqual([s.status, campo(s)], [422, 'itens[0].servicoId']);
  const p = await request('POST', '/api/assinaturas/planos', { token: 'h.admin.p', body: { ...SMART, nome: 'Cruzado', profissionais: [BIA_B] } });
  assert.deepStrictEqual([p.status, campo(p)], [422, 'profissionais[0]']);
  for (const [m, u, body] of [['GET', `/api/assinaturas/planos/${smartId}`], ['PUT', `/api/assinaturas/planos/${smartId}`, { ...SMART, nome: 'Invasão', itens: [{ servicoId: CORTE_B }] }],
    ['POST', `/api/assinaturas/planos/${smartId}/arquivar`], ['POST', `/api/assinaturas/planos/${smartId}/simular`, { servicoId: CORTE_B, profissionalId: BIA_B, data: '2026-11-21', horario: '10:00' }]]) {
    const r = await request(m, u, { token: 'h.adminb.p', body });
    assert.strictEqual(r.status, 404, `${m} ${u}: ${r.raw}`);
  }
  assert.ok(!db.assinatura_planos.find(x => x.id === smartId).arquivado_em, 'a outra empresa não arquivou');
});

test('P06 permissões: recepção vê e simula, não cria nem arquiva; profissional não vê; sem login 401', async () => {
  assert.strictEqual((await request('GET', '/api/assinaturas/planos', { token: 'h.recep.p' })).status, 200);
  assert.strictEqual((await request('POST', `/api/assinaturas/planos/${smartId}/simular`, { token: 'h.recep.p', body: { servicoId: CORTE, profissionalId: BETO, data: '2026-11-18', horario: '10:00' } })).status, 200);
  assert.strictEqual((await request('POST', '/api/assinaturas/planos', { token: 'h.recep.p', body: { ...SMART, nome: 'Recep' } })).status, 403);
  assert.strictEqual((await request('PUT', `/api/assinaturas/planos/${smartId}`, { token: 'h.recep.p', body: SMART })).status, 403);
  assert.strictEqual((await request('POST', `/api/assinaturas/planos/${smartId}/arquivar`, { token: 'h.recep.p' })).status, 403);
  assert.strictEqual((await request('GET', '/api/assinaturas/planos', { token: 'h.prof.p' })).status, 403);
  assert.strictEqual((await request('GET', '/api/assinaturas/planos')).status, 401);
});

// --- Motor de regras ---------------------------------------------------------------------------
const PLANO = { fora_regra_acao: 'cobrar_percentual_consumir', fora_regra_percentual: 50, fora_regra_teto_ciclo: 2, fora_regra_exige_aprovacao: false };
const ITEM = { servico_id: CORTE, desconto_percentual: 100, limite_por_ciclo: 4, dias_semana: [2, 3, 4] };
const uso = (data, extra = {}) => ({ servicoId: CORTE, profissionalId: BETO, data, horario: '10:00', ...extra });
// 2026-11-18 = quarta; 2026-11-21 = sábado.

test('P07 exemplo do dono: assinante de 3ª a 5ª vem no sábado → paga 50% do corte e consome 1 uso; na quarta, coberto', async () => {
  const sab = avaliarUso({ plano: PLANO, itens: [ITEM], uso: uso('2026-11-21'), historico: { usosNoCiclo: 1 }, precoTabelaCentavos: 5500 });
  assert.deepStrictEqual([sab.situacao, sab.cobrarCentavos, sab.consomeUso, sab.coberto], ['fora_da_regra', 2750, true, false]);
  assert.strictEqual(sab.motivos[0].codigo, 'dia_da_semana');
  assert.ok(/sábado/.test(sab.motivos[0].texto) && /terça, quarta, quinta/.test(sab.motivos[0].texto), sab.motivos[0].texto);
  const qua = avaliarUso({ plano: PLANO, itens: [ITEM], uso: uso('2026-11-18'), historico: { usosNoCiclo: 1 }, precoTabelaCentavos: 5500 });
  assert.deepStrictEqual([qua.situacao, qua.cobrarCentavos, qua.consomeUso, qua.coberto], ['coberto', 0, true, true]);
  // Pela API, com o preço de tabela do profissional (Ana cobra 60,00 no corte).
  const api = await request('POST', `/api/assinaturas/planos/${smartId}/simular`, { token: 'h.recep.p', body: { servicoId: CORTE, profissionalId: ANA, data: '2026-11-21', horario: '10:00', usosNoCiclo: 1 } });
  assert.deepStrictEqual([api.status, api.data.data.situacao, api.data.data.precoTabelaCentavos, api.data.data.cobrarCentavos, api.data.data.consomeUso], [200, 'fora_da_regra', 6000, 3000, true], api.raw);
});

test('P08 teto de usos fora da regra no ciclo: atingido, volta a cobrar o valor cheio e não consome', () => {
  const r = avaliarUso({ plano: PLANO, itens: [ITEM], uso: uso('2026-11-21'), historico: { usosNoCiclo: 1, foraDaRegraNoCiclo: 2 }, precoTabelaCentavos: 5500 });
  assert.deepStrictEqual([r.situacao, r.acao, r.cobrarCentavos, r.consomeUso], ['fora_da_regra', 'bloquear', 5500, false]);
  assert.ok(r.motivos.some(m => m.codigo === 'teto_fora_da_regra'));
  const sem = avaliarUso({ plano: { ...PLANO, fora_regra_teto_ciclo: null }, itens: [ITEM], uso: uso('2026-11-21'), historico: { foraDaRegraNoCiclo: 50 }, precoTabelaCentavos: 5500 });
  assert.strictEqual(sem.cobrarCentavos, 2750, 'sem teto, a política vale sempre');
});

test('P09 limite do ciclo é limite: esgotado, cobra cheio mesmo dentro da regra; ilimitado nunca esgota', () => {
  const esg = avaliarUso({ plano: PLANO, itens: [ITEM], uso: uso('2026-11-18'), historico: { usosNoCiclo: 4 }, precoTabelaCentavos: 5500 });
  assert.deepStrictEqual([esg.situacao, esg.cobrarCentavos, esg.consomeUso], ['limite_atingido', 5500, false]);
  const ilim = avaliarUso({ plano: PLANO, itens: [{ ...ITEM, limite_por_ciclo: null }], uso: uso('2026-11-18'), historico: { usosNoCiclo: 500 }, precoTabelaCentavos: 5500 });
  assert.deepStrictEqual([ilim.situacao, ilim.cobrarCentavos], ['coberto', 0]);
});

test('P10 profissionais: fora da lista aciona a política; lista vazia = todos', () => {
  const fora = avaliarUso({ plano: { fora_regra_acao: 'bloquear' }, itens: [{ ...ITEM, dias_semana: null }], profissionaisPermitidos: [ANA], uso: uso('2026-11-18'), precoTabelaCentavos: 5500 });
  assert.deepStrictEqual([fora.situacao, fora.cobrarCentavos, fora.consomeUso, fora.motivos[0].codigo], ['fora_da_regra', 5500, false, 'profissional']);
  const todos = avaliarUso({ plano: { fora_regra_acao: 'bloquear' }, itens: [{ ...ITEM, dias_semana: null }], profissionaisPermitidos: [], uso: uso('2026-11-18'), precoTabelaCentavos: 5500 });
  assert.strictEqual(todos.situacao, 'coberto');
});

test('P11 faixa de horário (início incluso, fim não) e intervalo mínimo entre usos', () => {
  const item = { ...ITEM, dias_semana: null, horario_inicio: '09:00:00', horario_fim: '17:00:00', intervalo_min_dias: 7 };
  const base = { plano: { fora_regra_acao: 'cobrar_percentual_sem_consumir', fora_regra_percentual: 30 }, itens: [item], precoTabelaCentavos: 5000 };
  assert.strictEqual(avaliarUso({ ...base, uso: uso('2026-11-18', { horario: '09:00' }) }).situacao, 'coberto');
  const tarde = avaliarUso({ ...base, uso: uso('2026-11-18', { horario: '17:00' }) });
  assert.deepStrictEqual([tarde.motivos[0].codigo, tarde.cobrarCentavos, tarde.consomeUso], ['horario', 1500, false]);
  const cedo = avaliarUso({ ...base, uso: uso('2026-11-18'), historico: { ultimoUsoData: '2026-11-13' } });
  assert.deepStrictEqual([cedo.motivos[0].codigo, cedo.cobrarCentavos], ['intervalo', 1500]);
  assert.strictEqual(avaliarUso({ ...base, uso: uso('2026-11-18'), historico: { ultimoUsoData: '2026-11-11' } }).situacao, 'coberto', '7 dias completos');
});

test('P12 serviço fora do plano cobra cheio; desconto parcial cobra a diferença; preço com ajuste do profissional', () => {
  const fora = avaliarUso({ plano: PLANO, itens: [ITEM], uso: uso('2026-11-18', { servicoId: BARBA }), precoTabelaCentavos: 4000 });
  assert.deepStrictEqual([fora.situacao, fora.cobrarCentavos, fora.consomeUso], ['nao_coberto', 4000, false]);
  const meio = avaliarUso({ plano: PLANO, itens: [{ ...ITEM, dias_semana: null, desconto_percentual: 50 }], uso: uso('2026-11-18'), precoTabelaCentavos: 5501 });
  assert.deepStrictEqual([meio.situacao, meio.cobrarCentavos, meio.consomeUso], ['coberto', 2750, true], 'arredonda o desconto ao centavo');
  assert.strictEqual(precoDeTabela({ id: CORTE, valor_centavos: 5500 }, { overrides: { [CORTE]: { valor_centavos: 6000 } } }), 6000);
  assert.strictEqual(precoDeTabela({ id: CORTE, valor_centavos: 5500 }, { overrides: {} }), 5500);
});

test('P13 cobertura total só avisa (cobre e consome, com o motivo); aprovação marcada quando o plano exige', () => {
  const r = avaliarUso({ plano: { fora_regra_acao: 'cobertura_total', fora_regra_exige_aprovacao: true }, itens: [ITEM], uso: uso('2026-11-21'), precoTabelaCentavos: 5500 });
  assert.deepStrictEqual([r.situacao, r.coberto, r.cobrarCentavos, r.consomeUso, r.exigeAprovacao, r.motivos[0].codigo], ['fora_da_regra', true, 0, true, true, 'dia_da_semana']);
  const bloq = avaliarUso({ plano: { fora_regra_acao: 'bloquear', fora_regra_exige_aprovacao: true }, itens: [ITEM], uso: uso('2026-11-21'), precoTabelaCentavos: 5500 });
  assert.strictEqual(bloq.exigeAprovacao, false, 'bloquear não pede aprovação: cobra cheio');
});

test('P14 bloquear (padrão): fora da regra cobra o valor de tabela e não consome', () => {
  const r = avaliarUso({ plano: {}, itens: [ITEM], uso: uso('2026-11-21'), precoTabelaCentavos: 5500 });
  assert.deepStrictEqual([r.acao, r.cobrarCentavos, r.consomeUso, r.coberto], ['bloquear', 5500, false, false]);
});

// --- Controle negativo -------------------------------------------------------
test('NC1 controle negativo: sem a checagem de teto, o P08 deixaria cobrar 50% pela 3ª vez no ciclo', () => {
  const arquivo = path.join(__dirname, '../src/engines/AssinaturaRegrasEngine.js');
  const src = fs.readFileSync(arquivo, 'utf8');
  const trecho = "if (acao !== 'bloquear' && teto !== null && foraNoCiclo >= teto) {";
  assert.ok(src.includes(trecho), 'trecho do mutante não encontrado');
  const m = new Module(arquivo, module);
  m.filename = arquivo; m.paths = Module._nodeModulePaths(path.dirname(arquivo));
  m._compile(src.replace(trecho, 'if (false) {'), arquivo);
  const r = m.exports.avaliarUso({ plano: PLANO, itens: [ITEM], uso: uso('2026-11-21'), historico: { foraDaRegraNoCiclo: 2 }, precoTabelaCentavos: 5500 });
  assert.strictEqual(r.cobrarCentavos, 2750, 'o mutante cobra 50% acima do teto');
});

(async () => {
  const origErr = console.error; console.error = () => {};
  clock.definirAgora && clock.definirAgora(new Date('2026-11-16T12:00:00Z'));
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); ok++; process.stdout.write(`✓ ${n}\n`); } catch (err) { process.stdout.write(`✗ ${n}\n   ${err.message}\n`); }
  }
  server.close(); console.error = origErr;
  console.log(`\nAssinatura Planos Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();

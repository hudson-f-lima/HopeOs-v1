// Atendimento Gate (vários serviços, D-040, Onda 1: motor e consulta, sem gravar).
// Cenários de aceite 1 a 8 da proposta do dono (docs/planning/AGENDAMENTO_INTELIGENTE_ANALISE.md):
// motor puro com espaços livres dados, e a rota POST /agenda/combinacoes contra o app com banco
// em memória. "Agora" fixo: 2026-11-10 09:00 em America/Sao_Paulo; os testes usam 2026-11-11.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-atend-token';
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
const E = require('../src/engines/AtendimentoEngine');
const { app } = require('../src/app');

const m = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const hh = E.minutesToTime;
const CORTE = { id: 'b0000000-0000-4000-8000-0000000000a1', nome: 'Corte', duracao_min: 40, valor_centavos: 5000, ativo: true };
const SOBR = { id: 'b0000000-0000-4000-8000-0000000000a2', nome: 'Sobrancelha', duracao_min: 15, valor_centavos: 2000, ativo: true };
const BARBA = { id: 'b0000000-0000-4000-8000-0000000000a3', nome: 'Barba', duracao_min: 30, valor_centavos: 3000, ativo: true };
const COMBO = { id: 'b0000000-0000-4000-8000-0000000000a4', nome: 'Corte + barba', categoria: 'Combo', duracao_min: 60, valor_centavos: 7000, ativo: true };
const A = { id: 'a0000000-0000-4000-8000-0000000000a1', nome: 'A', ativo: true, overrides: { [CORTE.id]: { duracao_min: 45, valor_centavos: 6000 }, [BARBA.id]: { duracao_min: 25 } } };
const B = { id: 'a0000000-0000-4000-8000-0000000000a2', nome: 'B', ativo: true, overrides: { [CORTE.id]: { duracao_min: 35 }, [BARBA.id]: { duracao_min: 20 } } };
const C = { id: 'a0000000-0000-4000-8000-0000000000a3', nome: 'C', ativo: true, overrides: {} };
const PROFS = [A, B, C];
const livre = (...janelas) => janelas.map(([a, b]) => ({ start: m(a), end: m(b) }));
const todos = j => new Map(PROFS.map(p => [p.id, livre(...j)]));
const combinar = (itens, livresPor, extra = {}) => E.combinar({ itens, profissionais: PROFS, vinculos: [], livresPor, ...extra });
const resumo = o => `${o.tipo} ${o.etapas.map(e => `${e.servico.nome}/${e.profissional.nome} ${hh(e.inicioMin)}-${hh(e.fimMin)}`).join(' > ')}`;

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('A01 cenário 1: corte + sobrancelha = 60 min com A, 50 com B, 55 no padrão; preço pelo override', () => {
  const r = combinar([{ servico: CORTE }, { servico: SOBR }], todos([['09:00', '12:00']]));
  const t = Object.fromEntries(r.totaisPorProfissional.map(x => [x.profissionalId, [x.duracaoMin, x.precoCentavos]]));
  assert.deepStrictEqual(t, { [A.id]: [60, 8000], [B.id]: [50, 7000], [C.id]: [55, 7000] });
});

test('A02 cenário 2: livre 09h–12h e 60 min → 09:00, 10:00 e 11:00', () => {
  const r = combinar([{ servico: CORTE, profissionalId: A.id }, { servico: SOBR, profissionalId: A.id }], todos([['09:00', '12:00']]));
  assert.deepStrictEqual(r.opcoes.map(o => hh(o.inicioMin)), ['09:00', '10:00', '11:00']);
  assert.ok(r.opcoes.every(o => o.tipo === 'mesmo_profissional' && o.esperaMin === 0 && o.duracaoMin === 60));
});

test('A03 cenário 3: livre 09h–12h e 50 min → grade pela duração total e 11:10, que termina às 12h', () => {
  const r = combinar([{ servico: CORTE, profissionalId: B.id }, { servico: SOBR, profissionalId: B.id }], todos([['09:00', '12:00']]));
  assert.deepStrictEqual(r.opcoes.map(o => hh(o.inicioMin)), ['09:00', '09:50', '10:40', '11:10']);
  assert.strictEqual(hh(r.opcoes[3].fimMin), '12:00');
});

test('A04 cenário 4: nenhuma etapa passa da escala, do intervalo ou de um bloqueio', () => {
  // A: 09:00–10:00 e 10:30–12:00 (bloqueio no meio); intervalo de almoço 12–13; tarde 13:00–13:40.
  const livresPor = new Map([[A.id, livre(['09:00', '10:00'], ['10:30', '12:00'], ['13:00', '13:40'])], [B.id, []], [C.id, []]]);
  const r = combinar([{ servico: CORTE, profissionalId: A.id }, { servico: SOBR, profissionalId: A.id }], livresPor);
  assert.deepStrictEqual(r.opcoes.map(o => `${hh(o.inicioMin)}-${hh(o.fimMin)}`), ['09:00-10:00', '10:30-11:30', '11:00-12:00']);
  for (const o of r.opcoes) for (const e of o.etapas) assert.ok(livresPor.get(A.id).some(w => e.inicioMin >= w.start && e.fimMin <= w.end), resumo(o));
  // 60 min não cabe nos 40 da tarde: nada oferecido lá.
  assert.ok(!r.opcoes.some(o => o.inicioMin >= m('13:00')));
});

test('A05 cenário 5: A faz o corte 10:00–10:45; B livre e habilitado → barba e sobrancelha com B em sequência, sem espera', () => {
  const livresPor = new Map([[A.id, livre(['10:00', '10:45'])], [B.id, livre(['09:00', '12:00'])], [C.id, []]]);
  const r = combinar([{ servico: CORTE, profissionalId: A.id }, { servico: BARBA }, { servico: SOBR }], livresPor, { horario: '10:00' });
  const seq = r.opcoes.filter(o => o.tipo === 'sequencia');
  assert.ok(seq.length >= 1, 'há opção em sequência');
  const o = seq[0];
  assert.strictEqual(o.esperaMin, 0);
  assert.deepStrictEqual([o.etapas[0].servico.id, o.etapas[0].profissional.id, hh(o.etapas[0].inicioMin), hh(o.etapas[0].fimMin)], [CORTE.id, A.id, '10:00', '10:45']);
  assert.ok(o.etapas.slice(1).every(e => e.profissional.id === B.id), 'as demais com B');
  assert.strictEqual(hh(o.etapas[1].inicioMin), '10:45'); assert.strictEqual(hh(o.fimMin), '11:20'); // barba B 20 + sobrancelha 15
  // O profissional fixado nunca é trocado, em nenhuma opção.
  assert.ok(r.opcoes.every(x => x.etapas.find(e => e.servico.id === CORTE.id).profissional.id === A.id));
});

test('A06 cenário 6: fracionado respeita o limite de espera (30 min oferece; 20 min não)', () => {
  // A: corte 10:00–10:45. B só fica livre às 11:10 (espera de 25 min).
  const livresPor = new Map([[A.id, livre(['10:00', '10:45'])], [B.id, livre(['11:10', '12:00'])], [C.id, []]]);
  const itens = [{ servico: CORTE, profissionalId: A.id }, { servico: BARBA, profissionalId: B.id }];
  const com30 = combinar(itens, livresPor, { esperaMaxMin: 30 });
  assert.strictEqual(com30.opcoes.length, 1);
  assert.deepStrictEqual([com30.opcoes[0].tipo, com30.opcoes[0].esperaMin, com30.opcoes[0].tempoTotalMin], ['fracionado', 25, 90]);
  assert.strictEqual(com30.opcoes[0].etapas[1].esperaAntesMin, 25);
  const com20 = combinar(itens, livresPor, { esperaMaxMin: 20 });
  assert.deepStrictEqual(com20.opcoes, [], 'acima do limite: nenhuma combinação (a tela oferece outra data)');
});

test('A07 ordenação: sem espera primeiro (um profissional, depois sequência); as demais pelo tempo total do cliente', () => {
  const livresPor = new Map([[A.id, livre(['09:00', '09:45'], ['14:00', '15:00'])], [B.id, livre(['09:45', '10:30'], ['11:00', '12:00'])], [C.id, livre(['10:10', '10:40'])]]);
  const r = combinar([{ servico: CORTE, profissionalId: A.id }, { servico: SOBR }], livresPor, { esperaMaxMin: 30 });
  const tipos = r.opcoes.map(o => o.tipo);
  assert.ok(tipos.indexOf('mesmo_profissional') === 0 && tipos.lastIndexOf('sequencia') < tipos.indexOf('fracionado'), tipos.join(','));
  const frac = r.opcoes.filter(o => o.esperaMin > 0).map(o => o.tempoTotalMin);
  assert.deepStrictEqual(frac, [...frac].sort((a, b) => a - b));
});

test('A08 cenário 8: combo é um serviço só (sem duplicar componentes) e o fixado é preservado', () => {
  const r = combinar([{ servico: COMBO, profissionalId: C.id }, { servico: SOBR }], todos([['09:00', '11:00']]));
  for (const o of r.opcoes) {
    assert.strictEqual(o.etapas.length, 2, 'combo + sobrancelha = 2 etapas, não 3');
    assert.strictEqual(o.etapas.find(e => e.servico.id === COMBO.id).profissional.id, C.id);
    assert.strictEqual(o.precoCentavos, 9000);
  }
  // Serviço sem ninguém habilitado: sem opções e o serviço é apontado.
  const s = E.combinar({ itens: [{ servico: BARBA }], profissionais: PROFS, vinculos: [{ profissional_id: A.id, servico_id: CORTE.id }, { profissional_id: B.id, servico_id: CORTE.id }, { profissional_id: C.id, servico_id: CORTE.id }], livresPor: todos([['09:00', '11:00']]) });
  assert.deepStrictEqual([s.opcoes.length, s.semCandidato], [0, [BARBA.id]]);
});

test('A09 validar a escolha: cabe = válida; fora do espaço, sobreposta, fora de ordem ou espera acima do limite = problema', () => {
  const livresPor = new Map([[A.id, livre(['10:00', '12:00'])], [B.id, livre(['10:00', '12:00'])]]);
  const ok = [{ profissionalId: A.id, inicioMin: m('10:00'), duracaoMin: 45 }, { profissionalId: B.id, inicioMin: m('10:45'), duracaoMin: 20 }];
  assert.deepStrictEqual(E.validarEtapas({ etapas: ok, livresPor }), []);
  const motivo = etapas => E.validarEtapas({ etapas, livresPor, esperaMaxMin: 30 }).map(p => p.motivo);
  assert.deepStrictEqual(motivo([{ ...ok[0], inicioMin: m('11:30') }]), ['indisponivel']);
  assert.deepStrictEqual(motivo([ok[0], { profissionalId: A.id, inicioMin: m('10:30'), duracaoMin: 20 }]), ['sobreposta', 'fora_de_ordem']);
  assert.deepStrictEqual(motivo([ok[0], { ...ok[1], inicioMin: m('11:20') }]), ['espera_acima_do_limite']);
});

// --- Rota (HTTP, banco em memória) ------------------------------------------
const EMP = env.DEFAULT_EMPRESA_ID;
const RECEP = 'c0000000-0000-4000-8000-0000000000a2';
const PROF_USER = 'c0000000-0000-4000-8000-0000000000a3';
const UNIT = 'f0000000-0000-4000-8000-0000000000a1';
const DIA = '2026-11-11';
const manha = { ativo: true, inicio: '09:00', fim: '12:00' };
const semana = { dom: manha, seg: manha, ter: manha, qua: manha, qui: manha, sex: manha, sab: manha };
setIdentityStore(createMemoryIdentityStore({
  app_users: [RECEP, PROF_USER].map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: EMP, nome: 'U', ativo: true }],
  empresa_memberships: [{ id: 'm2', empresa_id: EMP, user_id: RECEP, role: 'recepcao', status: 'ativo' }, { id: 'm3', empresa_id: EMP, user_id: PROF_USER, role: 'profissional', status: 'ativo', profissional_id: A.id }],
  membership_units: [{ membership_id: 'm2', unit_id: UNIT }, { membership_id: 'm3', unit_id: UNIT }]
}));
const tokens = { 'h.recep.s': RECEP, 'h.prof.s': PROF_USER };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401); return { id: tokens[t] }; } });
const db = installMemoryBackend({
  empresas: [{ id: EMP, nome: 'Salão', horario_por_dia: semana, slot_padrao: 30, buffer_min: 0 }],
  servicos: [CORTE, SOBR, BARBA].map(s => ({ ...s, empresa_id: EMP })),
  profissionais: PROFS.map(p => ({ ...p, empresa_id: EMP, horario: semana })),
  profissional_servicos: PROFS.flatMap(p => [CORTE, SOBR, BARBA].map(s => ({ empresa_id: EMP, profissional_id: p.id, servico_id: s.id }))),
  clientes: [], agendamentos: [
    // B ocupado 09:00–10:45 no dia.
    { id: '90000000-0000-4000-8000-0000000000e1', empresa_id: EMP, profissional_id: B.id, servico_id: CORTE.id, data: DIA, horario: '09:00:00', duracao_min: 105, status: 'agendado' }
  ],
  agendamento_eventos: [], comandos: [], comando_itens: [], produtos: [], formas_pagamento: []
});
clock.definirRelogio(() => new Date('2026-11-10T12:00:00Z'));

let base;
function request(method, urlPath, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    if (payload !== null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(payload); }
    const req = http.request(base + urlPath, { method, headers }, res => {
      let txt = ''; res.on('data', c => { txt += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(txt); } catch (_) {} resolve({ status: res.statusCode, data, raw: txt }); });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
const consulta = (body, token = 'h.recep.s') => request('POST', '/api/agenda/combinacoes', { token, body });

test('A10 rota: usa a disponibilidade e a agenda reais; nada é gravado; cenário 7 (recalcula ao mudar serviço, profissional ou data)', async () => {
  const antes = db.agendamentos.length;
  const r1 = await consulta({ data: DIA, itens: [{ servicoId: CORTE.id, profissionalId: A.id }] });
  assert.strictEqual(r1.status, 200, r1.raw);
  assert.deepStrictEqual(r1.data.data.opcoes.map(o => o.inicio), ['09:00', '09:45', '10:30', '11:15']);
  assert.strictEqual(r1.data.data.esperaMaxMin, 30);
  // Adiciona sobrancelha: duração e preço recalculados (60 min, R$ 80).
  const r2 = await consulta({ data: DIA, itens: [{ servicoId: CORTE.id, profissionalId: A.id }, { servicoId: SOBR.id, profissionalId: A.id }] });
  assert.deepStrictEqual(r2.data.data.opcoes.map(o => [o.inicio, o.fim, o.duracaoMin, o.precoCentavos]), [['09:00', '10:00', 60, 8000], ['10:00', '11:00', 60, 8000], ['11:00', '12:00', 60, 8000]]);
  // Troca o profissional para B (ocupado até 10:45): só cabe 10:45–11:35 e o fim alinhado 11:10–12:00.
  const r3 = await consulta({ data: DIA, itens: [{ servicoId: CORTE.id, profissionalId: B.id }, { servicoId: SOBR.id, profissionalId: B.id }] });
  assert.deepStrictEqual(r3.data.data.opcoes.map(o => o.inicio), ['10:45', '11:10']);
  // Escolha anterior (B às 09:00) deixou de ser válida; a de A às 10:00 continua.
  const itens = [{ servicoId: CORTE.id }, { servicoId: SOBR.id }];
  const ruim = await consulta({ data: DIA, itens, escolha: [{ servicoId: CORTE.id, profissionalId: B.id, horario: '09:00' }, { servicoId: SOBR.id, profissionalId: B.id, horario: '09:35' }] });
  assert.strictEqual(ruim.data.data.escolha.valida, false);
  assert.deepStrictEqual(ruim.data.data.escolha.problemas.map(p => p.motivo), ['indisponivel', 'indisponivel']);
  const boa = await consulta({ data: DIA, itens, escolha: [{ servicoId: CORTE.id, profissionalId: A.id, horario: '10:00' }, { servicoId: SOBR.id, profissionalId: A.id, horario: '10:45' }] });
  assert.deepStrictEqual([boa.data.data.escolha.valida, boa.data.data.escolha.duracaoMin, boa.data.data.escolha.precoCentavos], [true, 60, 8000]);
  // Outra data (passada): sem opções.
  assert.deepStrictEqual((await consulta({ data: '2026-11-09', itens })).data.data.opcoes, []);
  assert.strictEqual(db.agendamentos.length, antes, 'consulta não grava');
});

test('A11 rota: validação e permissão — sem login 401; itens inválidos 422; profissional só combina consigo', async () => {
  assert.strictEqual((await request('POST', '/api/agenda/combinacoes', { body: { data: DIA, itens: [{ servicoId: CORTE.id }] } })).status, 401);
  for (const ruim of [{ itens: [] }, { itens: [{ servicoId: 'x' }] }, { itens: [{ servicoId: CORTE.id }, { servicoId: CORTE.id }] }, { data: '11/11/2026' }, { horario: '25:00' },
    { itens: Array.from({ length: 7 }, (_, i) => ({ servicoId: `b0000000-0000-4000-8000-0000000000b${i}` })) }]) {
    assert.strictEqual((await consulta({ data: DIA, itens: [{ servicoId: CORTE.id }], ...ruim })).status, 422, JSON.stringify(ruim).slice(0, 60));
  }
  const p = await consulta({ data: DIA, itens: [{ servicoId: CORTE.id }, { servicoId: SOBR.id }] }, 'h.prof.s');
  assert.strictEqual(p.status, 200, p.raw);
  assert.ok(p.data.data.opcoes.length > 0 && p.data.data.opcoes.every(o => o.etapas.every(e => e.profissionalId === A.id)), 'só o próprio');
  assert.strictEqual((await consulta({ data: DIA, itens: [{ servicoId: CORTE.id, profissionalId: B.id }] }, 'h.prof.s')).status, 422);
});

// --- Onda 2: gravar, consultar e cancelar (cenários 9 e 10) -------------------
const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
const gravar = (body, token = 'h.recep.s') => request('POST', '/api/agenda/atendimentos', { token, body });
const code = r => r.data && r.data.error && r.data.error.code;
let grupoId;

test('A12 gravar: corte com A 10:00 + barba e sobrancelha com C em sequência; o servidor calcula duração e preço; etapas ligadas', async () => {
  const r = await gravar({ data: DIA, etapas: [
    { servicoId: CORTE.id, profissionalId: A.id, horario: '10:00' },
    { servicoId: BARBA.id, profissionalId: C.id, horario: '10:45' },
    { servicoId: SOBR.id, profissionalId: C.id, horario: '11:15' }] });
  assert.strictEqual(r.status, 201, r.raw);
  grupoId = r.data.data.grupoId;
  assert.deepStrictEqual([r.data.data.inicio, r.data.data.fim, r.data.data.precoCentavos], ['10:00', '11:30', 11000]);
  const ags = db.agendamentos.filter(a => a.grupo_id === grupoId).sort((x, y) => x.grupo_seq - y.grupo_seq);
  assert.deepStrictEqual(ags.map(a => [a.grupo_seq, a.profissional_id, String(a.horario).slice(0, 5), a.duracao_min, a.valor_centavos]),
    [[1, A.id, '10:00', 45, 6000], [2, C.id, '10:45', 30, 3000], [3, C.id, '11:15', 15, 2000]]);
  assert.strictEqual(db.agendamento_eventos.filter(e => e.payload && e.payload.grupo_id === grupoId).length, 3);
});

test('A13 revalidação no servidor: fora da escala, ocupado, espera acima do limite, não habilitado e preço/duração do cliente são recusados; nada gravado', async () => {
  const antes = db.agendamentos.length;
  const casos = [
    [[{ servicoId: CORTE.id, profissionalId: A.id, horario: '11:40' }], 'ATENDIMENTO_INVALIDO'], // passa das 12:00
    [[{ servicoId: CORTE.id, profissionalId: A.id, horario: '10:15' }], 'ATENDIMENTO_INVALIDO'], // ocupado pelo A12
    [[{ servicoId: CORTE.id, profissionalId: B.id, horario: '10:45' }, { servicoId: SOBR.id, profissionalId: B.id, horario: '11:55' }], 'ATENDIMENTO_INVALIDO'], // espera 35 > 30
    [[{ servicoId: CORTE.id, profissionalId: B.id, horario: '10:45' }, { servicoId: SOBR.id, profissionalId: B.id, horario: '10:50' }], 'ATENDIMENTO_INVALIDO'] // sobrepostas
  ];
  for (const [etapas, esperado] of casos) {
    const r = await gravar({ data: DIA, etapas });
    assert.strictEqual(r.status, 409, r.raw); assert.strictEqual(code(r), esperado);
    assert.ok(r.data.error.details.problemas.length >= 1);
  }
  db.profissional_servicos = db.profissional_servicos.filter(v => !(v.profissional_id === B.id && v.servico_id === BARBA.id));
  assert.strictEqual(code(await gravar({ data: DIA, etapas: [{ servicoId: BARBA.id, profissionalId: B.id, horario: '11:00' }] })), 'SERVICE_NOT_ALLOWED_FOR_PROFESSIONAL');
  assert.strictEqual((await gravar({ data: DIA, etapas: [{ servicoId: CORTE.id, profissionalId: B.id, horario: '10:45', duracaoMin: 5, precoCentavos: 1 }] })).status, 201, 'campos extras são ignorados');
  const criado = db.agendamentos[db.agendamentos.length - 1];
  assert.deepStrictEqual([criado.duracao_min, criado.valor_centavos], [35, 5000], 'duração e preço do servidor');
  assert.strictEqual(db.agendamentos.length, antes + 1);
});

test('A14 cenário 9: conflito na hora de gravar (corrida depois da validação) → nenhuma etapa reservada', async () => {
  const antes = db.agendamentos.length;
  const P = SupabaseRepository.prototype;
  const original = P.criarAtendimento;
  P.criarAtendimento = async function (args) {
    // Outra pessoa ocupa o horário da 2ª etapa entre a validação e a gravação.
    db.agendamentos.push({ id: '90000000-0000-4000-8000-0000000000f1', empresa_id: EMP, profissional_id: C.id, servico_id: SOBR.id, data: '2026-11-12', horario: '09:45:00', duracao_min: 15, status: 'agendado' });
    return original.call(this, args);
  };
  try {
    const r = await gravar({ data: '2026-11-12', etapas: [{ servicoId: CORTE.id, profissionalId: A.id, horario: '09:00' }, { servicoId: SOBR.id, profissionalId: C.id, horario: '09:45' }] });
    assert.strictEqual(r.status, 409, r.raw); assert.strictEqual(code(r), 'ATENDIMENTO_CONFLITO');
  } finally { P.criarAtendimento = original; }
  assert.strictEqual(db.agendamentos.length, antes + 1, 'só o horário do "outro" entrou; nenhuma etapa do atendimento');
  assert.ok(!db.agendamentos.some(a => a.data === '2026-11-12' && a.profissional_id === A.id), 'a 1ª etapa (livre) não ficou gravada');
});

test('A15 cenário 10: o card vê todas as etapas; cancelar informa o impacto (simular), cancela só a etapa ou todas', async () => {
  const g = await request('GET', `/api/agenda/atendimentos/${grupoId}`, { token: 'h.recep.s' });
  assert.strictEqual(g.status, 200, g.raw);
  assert.deepStrictEqual(g.data.data.etapas.map(e => [e.seq, e.servicoNome, e.profissionalNome, e.horario, e.status]),
    [[1, 'Corte', 'A', '10:00', 'agendado'], [2, 'Barba', 'C', '10:45', 'agendado'], [3, 'Sobrancelha', 'C', '11:15', 'agendado']]);
  const etapa2 = g.data.data.etapas[1].agendamentoId;
  const sim = await request('POST', `/api/agenda/atendimentos/${grupoId}/cancelar`, { token: 'h.recep.s', body: { escopo: 'etapa', agendamentoId: etapa2, simular: true } });
  assert.deepStrictEqual([sim.data.data.simulado, sim.data.data.afetadas.map(e => e.seq), sim.data.data.mantidas.map(e => e.seq)], [true, [2], [1, 3]]);
  assert.strictEqual(db.agendamentos.find(a => a.id === etapa2).status, 'agendado', 'simular não grava');
  const c1 = await request('POST', `/api/agenda/atendimentos/${grupoId}/cancelar`, { token: 'h.recep.s', body: { escopo: 'etapa', agendamentoId: etapa2 } });
  assert.deepStrictEqual([c1.data.data.afetadas.map(e => e.seq), c1.data.data.mantidas.map(e => e.seq)], [[2], [1, 3]]);
  const c2 = await request('POST', `/api/agenda/atendimentos/${grupoId}/cancelar`, { token: 'h.recep.s', body: { escopo: 'todas' } });
  assert.deepStrictEqual(c2.data.data.afetadas.map(e => e.seq), [1, 3]);
  assert.ok(db.agendamentos.filter(a => a.grupo_id === grupoId).every(a => a.status === 'cancelado'));
  assert.strictEqual((await request('POST', `/api/agenda/atendimentos/${grupoId}/cancelar`, { token: 'h.recep.s', body: { escopo: 'tudo' } })).status, 422);
  assert.strictEqual((await request('GET', '/api/agenda/atendimentos/90000000-0000-4000-8000-00000000ffff', { token: 'h.recep.s' })).status, 404);
});

test('A16 permissão e limite da unidade: profissional só grava etapas próprias; o limite de espera vem da empresa', async () => {
  const r = await gravar({ data: '2026-11-13', etapas: [{ servicoId: CORTE.id, profissionalId: A.id, horario: '09:00' }, { servicoId: SOBR.id, profissionalId: C.id, horario: '09:45' }] }, 'h.prof.s');
  assert.strictEqual(r.status, 403, r.raw);
  assert.strictEqual((await gravar({ data: '2026-11-13', etapas: [{ servicoId: CORTE.id, profissionalId: A.id, horario: '09:00' }] }, 'h.prof.s')).status, 201);
  assert.strictEqual((await gravar({ data: '2026-11-13', etapas: [{ servicoId: CORTE.id, profissionalId: A.id, horario: '10:00' }] })).status, 201);
  // Com limite 0 na unidade, etapa com 15 min de espera é recusada; com 30, passa.
  db.empresas[0].atendimento_espera_max_min = 0;
  const etapas = [{ servicoId: CORTE.id, profissionalId: C.id, horario: '09:00' }, { servicoId: SOBR.id, profissionalId: C.id, horario: '09:55' }];
  assert.strictEqual(code(await gravar({ data: '2026-11-13', etapas })), 'ATENDIMENTO_INVALIDO');
  db.empresas[0].atendimento_espera_max_min = 30;
  assert.strictEqual((await gravar({ data: '2026-11-13', etapas })).status, 201);
});

(async () => {
  const origErr = console.error; const origWarn = console.warn;
  console.error = () => {}; console.warn = () => {};
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); ok++; process.stdout.write(`✓ ${n}\n`); } catch (err) { process.stdout.write(`✗ ${n}\n   ${err.message}\n`); }
  }
  server.close();
  console.error = origErr; console.warn = origWarn;
  console.log(`\nAtendimento Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();

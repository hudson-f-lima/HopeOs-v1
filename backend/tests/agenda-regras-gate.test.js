// Regras da Agenda Gate (D-049, migration 024). Motor puro, confiabilidade com o prazo único e
// rotas (HTTP real contra o app; banco e identidade em memória). "Agora" fixo: 2026-11-10 09:00
// em America/Sao_Paulo (terça).
//   - prazo único: serviço > salão > 120 min; tardio = menos que o prazo antes do horário;
//   - confiabilidade: cancelar em tempo não é falta nem zera a sequência; tardio, sim;
//   - recepção: janela, máximo de futuros, intervalo no mesmo serviço e mesmo dia AVISAM (409 sem
//     aceitar; com aceitar grava e o histórico guarda a exceção); reagendar só checa se o dia muda;
//   - configuração: PATCH /empresa e PATCH /servicos com faixas;
//   - online: intervalo no mesmo serviço bloqueia.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-regras-token';
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
const P = require('../src/engines/AgendaPoliticaEngine');
const retention = require('../src/engines/insights/retention');
const { app } = require('../src/app');

const AGORA = new Date('2026-11-10T12:00:00Z');
const A = env.DEFAULT_EMPRESA_ID;
const CORTE = 'b0000000-0000-4000-8000-0000000000a1';
const QUIMICA = 'b0000000-0000-4000-8000-0000000000a2';
const ANA = 'a0000000-0000-4000-8000-0000000000a1';
const CLI = 'd0000000-0000-4000-8000-0000000000a1';
const CLI2 = 'd0000000-0000-4000-8000-0000000000a2';
const UNIT = 'f0000000-0000-4000-8000-0000000000a1';
const ADMIN = 'c0000000-0000-4000-8000-0000000000a1';
const RECEP = 'c0000000-0000-4000-8000-0000000000a2';
const PROF = 'c0000000-0000-4000-8000-0000000000a3';
const CLI3 = 'd0000000-0000-4000-8000-0000000000a3';

const dia = { ativo: true, inicio: '09:00', fim: '18:00' };
const semana = { dom: dia, seg: dia, ter: dia, qua: dia, qui: dia, sex: dia, sab: dia };
setIdentityStore(createMemoryIdentityStore({
  app_users: [ADMIN, RECEP, PROF].map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: A, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: A, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: A, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: A, user_id: PROF, role: 'profissional', status: 'ativo', profissional_id: ANA }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: UNIT }, { membership_id: 'm3', unit_id: UNIT }]
}));
const tokens = { 'h.admin.s': ADMIN, 'h.recep.s': RECEP, 'h.prof.s': PROF };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });

const db = installMemoryBackend({
  empresas: [{ id: A, nome: 'Salão', horario_por_dia: semana, slot_padrao: 30, buffer_min: 0, online_cancelamento_prazo_min: 120 }],
  servicos: [
    { id: CORTE, empresa_id: A, nome: 'Corte', valor_centavos: 5000, duracao_min: 30, ativo: true },
    { id: QUIMICA, empresa_id: A, nome: 'Química', valor_centavos: 20000, duracao_min: 60, ativo: true, cancelamento_prazo_min: 2880 }
  ],
  profissionais: [{ id: ANA, empresa_id: A, nome: 'Ana', ativo: true, horario: semana, overrides: {} }],
  profissional_servicos: [{ empresa_id: A, profissional_id: ANA, servico_id: CORTE }, { empresa_id: A, profissional_id: ANA, servico_id: QUIMICA }],
  clientes: [{ id: CLI, empresa_id: A, nome: 'Cliente Um', ativo: true }, { id: CLI2, empresa_id: A, nome: 'Cliente Dois', ativo: true }, { id: CLI3, empresa_id: A, nome: 'Cliente Três', ativo: true }],
  agendamentos: [], agendamento_eventos: [], lista_espera: [], comandos: [], comando_itens: [], produtos: [], formas_pagamento: []
});
clock.definirRelogio(() => AGORA);

let base;
function request(method, urlPath, { body, token = 'h.recep.s' } = {}) {
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
const code = r => r.data && r.data.error && r.data.error.code;
const tests = [];
const test = (n, f) => tests.push({ n, f });
const agendar = (body, token) => request('POST', '/api/agenda', { token, body: { clienteId: CLI, servicoId: CORTE, profissionalId: ANA, horario: '10:00', ...body } });

// ---------- Motor ----------
test('R01 prazo único: serviço > salão > 120 min', () => {
  assert.strictEqual(P.prazoCancelamentoMin({ online_cancelamento_prazo_min: 720 }, { cancelamento_prazo_min: 2880 }), 2880);
  assert.strictEqual(P.prazoCancelamentoMin({ online_cancelamento_prazo_min: 720 }, { cancelamento_prazo_min: null }), 720);
  assert.strictEqual(P.prazoCancelamentoMin({}, null), 120);
  assert.strictEqual(P.prazoCancelamentoMin({ online_cancelamento_prazo_min: 0 }, {}), 0, 'zero é "até o horário", não ausência');
  assert.strictEqual(P.antecedenciaOnlineMin({ online_antecedencia_min: 120 }, { antecedencia_min_online: 1440 }), 1440);
  const inicio = new Date('2026-11-12T13:00:00Z');
  assert.strictEqual(P.cancelamentoTardio({ inicio, canceladoEm: new Date('2026-11-12T08:00:00Z'), prazoMin: 120 }), false, '5 h antes, prazo 2 h: em tempo');
  assert.strictEqual(P.cancelamentoTardio({ inicio, canceladoEm: new Date('2026-11-12T08:00:00Z'), prazoMin: 720 }), true, '5 h antes, prazo 12 h: tardio');
});

test('R02 avisos da recepção: nada configurado = nenhum aviso; cada regra com sua mensagem', () => {
  const doCliente = [
    { id: 'x1', servico_id: CORTE, data: '2026-11-13', horario: '10:00:00', status: 'agendado' },
    { id: 'x2', servico_id: CORTE, data: '2026-11-20', horario: '10:00:00', status: 'confirmado' },
    { id: 'x3', servico_id: CORTE, data: '2026-11-05', horario: '10:00:00', status: 'cancelado' }
  ];
  const novo = { servicoId: CORTE, data: '2026-11-13', horario: '15:00' };
  assert.deepStrictEqual(P.avisosRecepcao({ empresa: {}, novo, agendamentosDoCliente: doCliente, hoje: '2026-11-10' }), [], 'sem regra configurada, nada muda');
  const empresa = { agenda_janela_dias_recepcao: 30, agenda_max_futuros_recepcao: 2, agenda_intervalo_min_dias: 10 };
  const longe = P.avisosRecepcao({ empresa, servico: { nome: 'Corte' }, novo: { servicoId: CORTE, data: '2027-01-30', horario: '10:00' }, agendamentosDoCliente: doCliente, hoje: '2026-11-10' });
  assert.deepStrictEqual(longe.map(a => a.codigo), ['JANELA', 'MAX_FUTUROS']);
  const perto = P.avisosRecepcao({ empresa, servico: { nome: 'Corte' }, novo: { servicoId: CORTE, data: '2026-11-16', horario: '10:00' }, agendamentosDoCliente: doCliente.slice(0, 1), hoje: '2026-11-10' });
  assert.deepStrictEqual(perto.map(a => a.codigo), ['INTERVALO']);
  assert.ok(/Corte em 13\/11\/2026: menos de 10 dias/.test(perto[0].mensagem), perto[0].mensagem);
  const editando = P.avisosRecepcao({ empresa, novo: { ...novo, ignorarId: 'x1' }, agendamentosDoCliente: doCliente.slice(0, 1), hoje: '2026-11-10' });
  assert.deepStrictEqual(editando, [], 'o próprio horário em edição não conta');
  assert.strictEqual(P.violaIntervaloOnline({ empresa, servicoId: CORTE, data: '2026-11-16', historico: doCliente }), true);
  assert.strictEqual(P.violaIntervaloOnline({ empresa: {}, servicoId: CORTE, data: '2026-11-16', historico: doCliente }), false);
});

test('R03 confiabilidade: cancelar em tempo não é falta nem zera a sequência; tardio conta e zera', () => {
  const concl = d => ({ data: d, horario: '10:00', status: 'concluido' });
  // Cancelado 5 h antes do horário de 07/11 10:00 (São Paulo = 13:00Z).
  const cancel = { data: '2026-11-07', horario: '10:00', status: 'cancelado', updated_at: '2026-11-07T08:00:00Z' };
  const lista = [concl('2026-11-01'), concl('2026-11-03'), cancel, concl('2026-11-08')];
  const emTempo = retention.computeReliability(lista, '2026-11-10', { prazoMinDe: () => 120 });
  assert.deepStrictEqual([emTempo.fatores.cancelTardios365d, emTempo.fatores.streakConcluidos], [0, 3], 'prazo 2 h: 5 h antes é em tempo e a sequência segue');
  const tardio = retention.computeReliability(lista, '2026-11-10', { prazoMinDe: () => 720 });
  assert.deepStrictEqual([tardio.fatores.cancelTardios365d, tardio.fatores.streakConcluidos], [1, 1], 'prazo 12 h: tardio, −8 e a sequência para');
  assert.ok(emTempo.score > tardio.score);
});

// ---------- Rotas ----------
test('R04 configurar: PATCH /empresa com as regras (faixas), só quem configura', async () => {
  const ok = await request('PATCH', '/api/empresa', { token: 'h.admin.s', body: { cancelamentoPrazoMin: 720, agendaJanelaDiasRecepcao: 30, agendaMaxFuturosRecepcao: 2, agendaIntervaloMinDias: 7, agendaAtrasoAlertaMin: 10 } });
  assert.strictEqual(ok.status, 200, ok.raw);
  const e = ok.data.data;
  assert.deepStrictEqual([e.online_cancelamento_prazo_min, e.agenda_janela_dias_recepcao, e.agenda_max_futuros_recepcao, e.agenda_intervalo_min_dias, e.agenda_atraso_alerta_min], [720, 30, 2, 7, 10]);
  for (const body of [{ agendaJanelaDiasRecepcao: 0 }, { agendaMaxFuturosRecepcao: 51 }, { agendaIntervaloMinDias: 181 }, { agendaAtrasoAlertaMin: 241 }, { cancelamentoPrazoMin: -1 }]) {
    assert.strictEqual((await request('PATCH', '/api/empresa', { token: 'h.admin.s', body })).status, 422, JSON.stringify(body));
  }
  assert.strictEqual((await request('PATCH', '/api/empresa', { token: 'h.admin.s', body: { agendaIntervaloMinDias: null } })).data.data.agenda_intervalo_min_dias, null, 'null desliga');
  await request('PATCH', '/api/empresa', { token: 'h.admin.s', body: { agendaIntervaloMinDias: 7 } });
  assert.strictEqual((await request('PATCH', '/api/empresa', { token: 'h.recep.s', body: { agendaMaxFuturosRecepcao: 9 } })).status, 403, 'recepção não configura');
});

test('R04b "Cliente chegou" do salão (028, D-084): só booleano, só quem configura; profissional lê', async () => {
  const off = await request('PATCH', '/api/empresa', { token: 'h.admin.s', body: { agendaUsaChegada: false } });
  assert.strictEqual(off.status, 200, off.raw);
  assert.strictEqual(off.data.data.agenda_usa_chegada, false);
  const lido = await request('GET', '/api/empresa', { token: 'h.prof.s' });
  assert.strictEqual(lido.status, 200, lido.raw);
  assert.strictEqual(lido.data.data.agenda_usa_chegada, false, 'o profissional precisa ler para a tela Agora');
  for (const v of ['sim', 1, 0, null, 'false']) {
    assert.strictEqual((await request('PATCH', '/api/empresa', { token: 'h.admin.s', body: { agendaUsaChegada: v } })).status, 422, JSON.stringify(v));
  }
  assert.strictEqual((await request('PATCH', '/api/empresa', { token: 'h.recep.s', body: { agendaUsaChegada: true } })).status, 403, 'recepção não configura');
  assert.strictEqual((await request('PATCH', '/api/empresa', { token: 'h.admin.s', body: { agendaUsaChegada: true } })).data.data.agenda_usa_chegada, true);
});

test('R05 serviço com prazo e antecedência próprios (vazio volta para o do salão)', async () => {
  const r = await request('PATCH', `/api/servicos/${CORTE}`, { token: 'h.admin.s', body: { cancelamentoPrazoMin: 1440, antecedenciaMinOnline: 240 } });
  assert.strictEqual(r.status, 200, r.raw);
  assert.deepStrictEqual([r.data.data.cancelamento_prazo_min, r.data.data.antecedencia_min_online], [1440, 240]);
  assert.strictEqual((await request('PATCH', `/api/servicos/${CORTE}`, { token: 'h.admin.s', body: { cancelamentoPrazoMin: 10081 } })).status, 422);
  const limpa = await request('PATCH', `/api/servicos/${CORTE}`, { token: 'h.admin.s', body: { cancelamentoPrazoMin: null, antecedenciaMinOnline: '' } });
  assert.deepStrictEqual([limpa.data.data.cancelamento_prazo_min, limpa.data.data.antecedencia_min_online], [null, null]);
});

test('R06 recepção: regra violada devolve 409 com os avisos e não grava; aceitar grava e registra a exceção', async () => {
  assert.strictEqual((await agendar({ data: '2026-11-12' })).status, 201);
  assert.strictEqual((await agendar({ data: '2026-11-26', servicoId: QUIMICA })).status, 201, 'segundo futuro, outro serviço: sem aviso');
  const antes = db.agendamentos.length;
  const r = await agendar({ data: '2026-11-17' });
  assert.deepStrictEqual([r.status, code(r)], [409, 'REGRAS_DA_AGENDA'], r.raw);
  assert.deepStrictEqual(r.data.error.details.avisos.map(a => a.codigo), ['MAX_FUTUROS', 'INTERVALO']);
  assert.strictEqual(db.agendamentos.length, antes, 'nada gravado');
  const longe = await agendar({ clienteId: CLI2, data: '2027-01-20' });
  assert.deepStrictEqual(longe.data.error.details.avisos.map(a => a.codigo), ['JANELA']);
  const aceito = await agendar({ data: '2026-11-17', aceitarAvisos: true });
  assert.strictEqual(aceito.status, 201, aceito.raw);
  const ev = db.agendamento_eventos.find(e => e.agendamento_id === aceito.data.data.id && e.tipo === 'criado');
  assert.deepStrictEqual(ev.payload.excecao_regras, ['MAX_FUTUROS', 'INTERVALO'], 'a exceção fica no histórico do horário');
  const semCliente = await agendar({ clienteId: undefined, data: '2027-01-20' });
  assert.strictEqual(semCliente.status, 201, 'sem cliente não há regra de cliente');
});

test('R07 reagendar: mudar o dia passa pelas regras; mesmo dia (outra hora) não', async () => {
  const alvo = db.agendamentos.find(a => a.cliente_id === CLI2 && a.status === 'agendado') || (await agendar({ clienteId: CLI2, data: '2026-11-13', aceitarAvisos: true })).data.data;
  const mesmoDia = await request('PATCH', `/api/agenda/${alvo.id}/status`, { body: { novoStatus: 'reagendado', novaData: String(alvo.data).slice(0, 10), novoHorario: '11:00' } });
  assert.strictEqual(mesmoDia.status, 200, mesmoDia.raw);
  const novo = mesmoDia.data.data.novo;
  const longe = await request('PATCH', `/api/agenda/${novo.id}/status`, { body: { novoStatus: 'reagendado', novaData: '2027-02-10', novoHorario: '11:00' } });
  assert.deepStrictEqual([longe.status, code(longe)], [409, 'REGRAS_DA_AGENDA']);
  assert.strictEqual(db.agendamentos.find(a => a.id === novo.id).status, 'agendado', 'não mexeu');
  const aceito = await request('PATCH', `/api/agenda/${novo.id}/status`, { body: { novoStatus: 'reagendado', novaData: '2027-02-10', novoHorario: '11:00', aceitarAvisos: true } });
  assert.strictEqual(aceito.status, 200, aceito.raw);
});

test('R08 confiabilidade pela rota usa o prazo do salão e o do serviço', async () => {
  // Cancelados 5 h antes: Corte (prazo do salão 12 h) = tardio; Química (prazo próprio 48 h) = tardio;
  // com o salão em 2 h e a Química sem prazo próprio, nenhum é tardio.
  db.agendamentos.push(
    { id: '70000000-0000-4000-8000-0000000000c1', empresa_id: A, cliente_id: CLI2, servico_id: CORTE, profissional_id: ANA, data: '2026-11-07', horario: '10:00:00', duracao_min: 30, status: 'cancelado', updated_at: '2026-11-07T08:00:00Z' },
    { id: '70000000-0000-4000-8000-0000000000c2', empresa_id: A, cliente_id: CLI2, servico_id: QUIMICA, profissional_id: ANA, data: '2026-11-08', horario: '10:00:00', duracao_min: 60, status: 'cancelado', updated_at: '2026-11-08T08:00:00Z' }
  );
  const conf = async () => (await request('GET', `/api/insights/clients/${CLI2}/reliability`, { token: 'h.admin.s' })).data.data.fatores.cancelTardios365d;
  assert.strictEqual(await conf(), 2);
  await request('PATCH', '/api/empresa', { token: 'h.admin.s', body: { cancelamentoPrazoMin: 120 } });
  assert.strictEqual(await conf(), 1, 'só a Química (prazo próprio de 48 h) continua tardia');
  await request('PATCH', `/api/servicos/${QUIMICA}`, { token: 'h.admin.s', body: { cancelamentoPrazoMin: null } });
  assert.strictEqual(await conf(), 0, 'com 2 h para tudo, 5 h antes é em tempo');
});

// ---------- D-051: troca de cliente no card ----------
test('R09 corrigir cliente: original "reagendado" (neutro), novo no mesmo horário "agendado", histórico', async () => {
  await request('PATCH', '/api/empresa', { token: 'h.admin.s', body: { agendaMaxFuturosRecepcao: null, agendaIntervaloMinDias: null, agendaJanelaDiasRecepcao: null } });
  const c = await agendar({ clienteId: CLI, data: '2026-11-20', horario: '15:00', aceitarAvisos: true });
  await request('PATCH', `/api/agenda/${c.data.data.id}/status`, { body: { novoStatus: 'confirmado' } });
  const t = await request('POST', `/api/agenda/${c.data.data.id}/trocar-cliente`, { body: { clienteId: CLI3, motivo: 'correcao' } });
  assert.strictEqual(t.status, 200, t.raw);
  const novo = t.data.data.novo;
  assert.deepStrictEqual([novo.cliente_id, novo.status, novo.horario.slice(0, 5), novo.data], [CLI3, 'agendado', '15:00', '2026-11-20'], 'mesmo horário; quem vem confirma');
  assert.strictEqual(db.agendamentos.find(a => a.id === c.data.data.id).status, 'reagendado');
  const ev = db.agendamento_eventos.find(e => e.agendamento_id === c.data.data.id && e.tipo === 'cliente_corrigido');
  assert.ok(ev && ev.payload.cliente_de === CLI && ev.payload.cliente_para === CLI3 && ev.payload.para === novo.id, JSON.stringify(ev));
});

test('R10 passar a vaga: original "cancelado" com vaga_repassada; a confiabilidade de quem desistiu não perde; lista de espera vira agendado', async () => {
  // Cancelamento tardio de verdade (5 h antes com prazo de 12 h) e uma vaga repassada também tardia.
  await request('PATCH', '/api/empresa', { token: 'h.admin.s', body: { cancelamentoPrazoMin: 720 } });
  const base = (await request('GET', `/api/insights/clients/${CLI3}/reliability`, { token: 'h.admin.s' })).data.data.fatores.cancelTardios365d;
  const ag = await agendar({ clienteId: CLI3, data: '2026-11-10', horario: '17:00', aceitarAvisos: true }); // hoje 17:00, agora 09:00
  db.lista_espera.push({ id: '60000000-0000-4000-8000-0000000000e1', empresa_id: A, cliente_id: CLI2, servico_id: CORTE, status: 'aguardando' });
  const t = await request('POST', `/api/agenda/${ag.data.data.id}/trocar-cliente`, { body: { clienteId: CLI2, motivo: 'vaga_repassada', aceitarAvisos: true } });
  assert.strictEqual(t.status, 200, t.raw);
  const orig = db.agendamentos.find(a => a.id === ag.data.data.id);
  orig.updated_at = '2026-11-10T12:00:00Z'; // 5 h antes do horário
  assert.strictEqual(orig.status, 'cancelado');
  assert.ok(db.agendamento_eventos.some(e => e.agendamento_id === orig.id && e.tipo === 'vaga_repassada'));
  const depois = (await request('GET', `/api/insights/clients/${CLI3}/reliability`, { token: 'h.admin.s' })).data.data.fatores.cancelTardios365d;
  assert.strictEqual(depois, base, 'vaga repassada não é cancelamento tardio');
  assert.strictEqual(db.lista_espera.find(x => x.id === '60000000-0000-4000-8000-0000000000e1').status, 'agendado', 'quem estava na lista e ganhou a vaga');
  // Controle: o mesmo cancelamento sem a vaga repassada conta.
  db.agendamento_eventos = db.agendamento_eventos.filter(e => !(e.agendamento_id === orig.id && e.tipo === 'vaga_repassada'));
  const sem = (await request('GET', `/api/insights/clients/${CLI3}/reliability`, { token: 'h.admin.s' })).data.data.fatores.cancelTardios365d;
  assert.strictEqual(sem, base + 1, 'controle negativo: sem o evento, é tardio');
});

test('R11 troca recusada: mesmo cliente, horário passado, status errado, motivo inválido, profissional', async () => {
  const ag = await agendar({ clienteId: CLI, data: '2026-11-21', horario: '16:00', aceitarAvisos: true });
  const id = ag.data.data.id;
  const troca = (body, token) => request('POST', `/api/agenda/${id}/trocar-cliente`, { token, body });
  assert.strictEqual((await troca({ clienteId: CLI, motivo: 'correcao' })).status, 422, 'mesmo cliente');
  assert.strictEqual((await troca({ clienteId: CLI2, motivo: 'outro' })).status, 422, 'motivo');
  assert.strictEqual((await troca({ clienteId: 'x', motivo: 'correcao' })).status, 422);
  assert.strictEqual((await troca({ clienteId: CLI2, motivo: 'correcao' }, 'h.prof.s')).status, 403, 'profissional não troca');
  const passado = await agendar({ clienteId: CLI, data: '2026-11-09', horario: '16:00', aceitarAvisos: true });
  assert.strictEqual((await request('POST', `/api/agenda/${passado.data.data.id}/trocar-cliente`, { body: { clienteId: CLI2, motivo: 'correcao' } })).status, 422, 'passado');
  await request('PATCH', `/api/agenda/${id}/status`, { body: { novoStatus: 'cancelado' } });
  assert.strictEqual((await troca({ clienteId: CLI2, motivo: 'correcao' })).status, 422, 'cancelado não troca');
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
  console.log(`\nRegras da Agenda Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();

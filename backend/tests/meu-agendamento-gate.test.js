// Link Pessoal do Agendamento Gate (migration 017, D-038, C2). HTTP real contra o app; banco e
// identidade em memória. "Agora" fixo: 2026-11-10 09:00 em America/Sao_Paulo (terça).
// Cobre: código só como hash no banco, ver/confirmar/cancelar/remarcar com prazo no servidor,
// 404 idêntico para código inválido, revogado ou vencido, limite de remarcações, link da recepção
// e remarcação da recepção levando o link. Controles negativos no fim.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-link-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const Module = require('module');
const express = require('express');
const { env } = require('../src/config/env');
const clock = require('../src/config/clock');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
const { createAppError } = require('../src/errors');
const { criarAcesso, hashToken } = require('../src/services/AcessoAgendamento');
const publico = require('../src/routes/publicBooking');
const { app } = require('../src/app');

const AGORA = new Date('2026-11-10T12:00:00Z'); // 09:00 em São Paulo
const HOJE = '2026-11-10';
const AMANHA = '2026-11-11';
const A = env.DEFAULT_EMPRESA_ID;
const B = 'e0000000-0000-4000-8000-0000000000bb';
const CORTE = 'b0000000-0000-4000-8000-0000000000a1';
const ANA = 'a0000000-0000-4000-8000-0000000000a1';
const BETO = 'a0000000-0000-4000-8000-0000000000a2';
const CLI = 'd0000000-0000-4000-8000-0000000000a1';
const SERV_B = 'b0000000-0000-4000-8000-0000000000b1';
const PROF_B = 'a0000000-0000-4000-8000-0000000000b1';
const AG_B = '90000000-0000-4000-8000-0000000000b1';
const ADMIN = 'c0000000-0000-4000-8000-0000000000a1';
const RECEP = 'c0000000-0000-4000-8000-0000000000a2';
const PROF_USER = 'c0000000-0000-4000-8000-0000000000a3';

const dia = { ativo: true, inicio: '09:00', fim: '18:00' };
const semana = { dom: dia, seg: dia, ter: dia, qua: dia, qui: dia, sex: dia, sab: dia };

setIdentityStore(createMemoryIdentityStore({
  app_users: [ADMIN, RECEP, PROF_USER].map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: 'f0000000-0000-4000-8000-0000000000a1', empresa_id: A, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: A, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: A, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: A, user_id: PROF_USER, role: 'profissional', status: 'ativo', profissional_id: ANA }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: 'f0000000-0000-4000-8000-0000000000a1' }, { membership_id: 'm3', unit_id: 'f0000000-0000-4000-8000-0000000000a1' }]
}));
const tokens = { 'h.admin.s': ADMIN, 'h.recep.s': RECEP, 'h.prof.s': PROF_USER };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401); return { id: tokens[t] }; } });

const db = installMemoryBackend({
  empresas: [
    { id: A, nome: 'Salão Alfa', whatsapp: '11911112222', endereco: 'Rua A, 1', cidade: 'São Paulo', horario_por_dia: semana, slot_padrao: 30, buffer_min: 0,
      regua_alerta_faltas: 2, regua_sinal_faltas: 3, online_slug: 'salao-alfa', online_ativo: true, online_antecedencia_min: 120, online_janela_dias: 30,
      online_cancelamento_prazo_min: 120, online_max_futuros: 5, online_mostrar_preco: true, razao_social: 'Alfa Ltda', privacidade_contato: 'priv@alfa.test' },
    { id: B, nome: 'Salão Beta', horario_por_dia: semana, slot_padrao: 30, buffer_min: 0 }
  ],
  servicos: [
    { id: CORTE, empresa_id: A, nome: 'Corte', valor_centavos: 5000, duracao_min: 30, ativo: true },
    { id: SERV_B, empresa_id: B, nome: 'Escova Beta', valor_centavos: 7000, duracao_min: 60, ativo: true }
  ],
  profissionais: [
    { id: ANA, empresa_id: A, nome: 'Ana Paula', ativo: true, horario: semana, overrides: {} },
    { id: BETO, empresa_id: A, nome: 'Beto', ativo: true, horario: semana, overrides: {} },
    { id: PROF_B, empresa_id: B, nome: 'Bruna', ativo: true, horario: semana, overrides: {} }
  ],
  profissional_servicos: [
    { empresa_id: A, profissional_id: ANA, servico_id: CORTE }, { empresa_id: A, profissional_id: BETO, servico_id: CORTE },
    { empresa_id: B, profissional_id: PROF_B, servico_id: SERV_B }
  ],
  clientes: [{ id: CLI, empresa_id: A, nome: 'Cliente Segredo', whatsapp: '11977776666', ativo: true }],
  agendamentos: [
    { id: AG_B, empresa_id: B, cliente_id: null, servico_id: SERV_B, profissional_id: PROF_B, data: AMANHA, horario: '10:00:00', duracao_min: 60, valor_centavos: 7000, status: 'agendado' }
  ],
  agendamento_acessos: [], agendamento_eventos: [], comandos: [], comando_itens: [], produtos: [], formas_pagamento: []
});

publico.setRelogioParaTestes(() => AGORA);
clock.definirRelogio(() => AGORA);
Object.assign(env, { PUBLIC_BOOKING_LINKS: '', PUBLIC_BOOKING_RATE_GET_MAX: 1000, PUBLIC_BOOKING_RATE_POST_IP_MAX: 1000, PUBLIC_BOOKING_RATE_POST_NUMERO_MAX: 1000, PUBLIC_BOOKING_RATE_LINK_MAX: 1000, PUBLIC_BOOKING_TETO_DIARIO: 1000 });

let base;
function request(method, urlPath, { body, token, baseUrl } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    if (payload !== null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(payload); }
    const req = http.request((baseUrl || base) + urlPath, { method, headers }, res => {
      let txt = ''; res.on('data', c => { txt += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(txt); } catch (_) {} resolve({ status: res.statusCode, data, raw: txt }); });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;
const link = (acao, token, extra = {}, baseUrl) => request('POST', `/api/public/meu-agendamento${acao}`, { body: { token, ...extra }, baseUrl });
const repoA = () => new SupabaseRepository(A);
let seq = 0;
async function agendamentoComLink({ data = AMANHA, horario = '11:00', status = 'agendado', profissional = ANA } = {}) {
  seq += 1;
  const ag = await repoA().insert('agendamentos', {
    id: `90000000-0000-4000-8000-0000000001${String(seq).padStart(2, '0')}`, cliente_id: CLI, servico_id: CORTE, profissional_id: profissional,
    data, horario: `${horario}:00`, duracao_min: 30, valor_centavos: 5000, status
  });
  return { ag, token: await criarAcesso(repoA(), ag, { timeZone: env.APP_TIMEZONE, agora: AGORA }) };
}

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('M01 agendar pelo link público devolve o link pessoal; o banco guarda só o hash, com validade até 24 h depois do horário', async () => {
  publico.limparCacheSlug(); publico.resetRateLimitPublico();
  const r = await request('POST', '/api/public/agendar/salao-alfa', { body: { servicoId: CORTE, profissionalId: BETO, data: AMANHA, horario: '15:00', nome: 'Rita Link', whatsapp: '21 98888-1111', consentimento: true, website: '' } });
  assert.strictEqual(r.status, 201, r.raw);
  const { link: token, calendario } = r.data.data;
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.deepStrictEqual(calendario, { inicioIso: '2026-11-11T18:00:00.000Z', fimIso: '2026-11-11T18:30:00.000Z', titulo: 'Corte — Salão Alfa', local: 'Rua A, 1, São Paulo' });
  const acesso = db.agendamento_acessos.find(a => a.token_hash === hashToken(token));
  assert.ok(acesso, 'acesso gravado pelo hash');
  assert.strictEqual(acesso.expira_em, '2026-11-12T18:00:00.000Z');
  assert.ok(!JSON.stringify(db).includes(token), 'o código em claro não está em nenhuma tabela');
  const v = await link('', token);
  assert.strictEqual(v.status, 200, v.raw);
  assert.strictEqual(v.data.data.agendamento.horario, '15:00');
});

test('M02 ver: só o próprio horário, sem ids nem dados do cliente; código inválido, revogado ou vencido = mesmo 404', async () => {
  const { token, ag } = await agendamentoComLink({ horario: '11:00' });
  const v = await link('', token);
  assert.strictEqual(v.status, 200, v.raw);
  const d = v.data.data;
  assert.deepStrictEqual(d.agendamento, { data: AMANHA, horario: '11:00', duracaoMin: 30, servico: 'Corte', profissional: 'Ana', status: 'agendado', precoCentavos: 5000 });
  assert.deepStrictEqual(d.pode, { confirmar: true, cancelar: true, remarcar: true });
  assert.deepStrictEqual(d.prazo, { cancelamentoPrazoMin: 120, limiteIso: '2026-11-11T12:00:00.000Z' });
  for (const proibido of ['Segredo', '77776666', ag.id, CLI, A, 'token', 'cliente']) assert.ok(!v.raw.includes(proibido), `vazou ${proibido}`);
  const ref = await link('', 'x'.repeat(43));
  assert.strictEqual(ref.status, 404); assert.strictEqual(code(ref), 'LINK_INVALIDO');
  for (const ruim of ['', 'curto', `${token}x`, token.toUpperCase() === token ? 'A'.repeat(43) : token.toUpperCase(), 12345, null]) {
    const r = await link('', ruim);
    assert.strictEqual(r.status, 404, String(ruim)); assert.strictEqual(r.raw, ref.raw, `resposta diferente para ${ruim}`);
  }
  // Revogado e vencido: o mesmo 404.
  const { token: t2 } = await agendamentoComLink({ horario: '12:00' });
  db.agendamento_acessos.find(a => a.token_hash === hashToken(t2)).revogado_em = AGORA.toISOString();
  assert.strictEqual((await link('', t2)).raw, ref.raw);
  const { token: t3 } = await agendamentoComLink({ horario: '12:30' });
  db.agendamento_acessos.find(a => a.token_hash === hashToken(t3)).expira_em = '2026-11-10T11:59:00.000Z';
  assert.strictEqual((await link('', t3)).raw, ref.raw);
  // O código nunca vai na URL: GET e query string não existem.
  assert.strictEqual((await request('GET', `/api/public/meu-agendamento?token=${token}`)).status, 404);
  // Campo extra no corpo é recusado.
  assert.strictEqual(code(await link('', token, { status: 'cancelado' })), 'DADOS_INVALIDOS');
});

test('M03 confirmar: agendado → confirmado, com trilha do cliente; repetir = 409', async () => {
  const { token, ag } = await agendamentoComLink({ horario: '13:00' });
  const r = await link('/confirmar', token);
  assert.strictEqual(r.status, 200, r.raw);
  assert.strictEqual(r.data.data.agendamento.status, 'confirmado');
  assert.strictEqual(db.agendamentos.find(a => a.id === ag.id).status, 'confirmado');
  const ev = db.agendamento_eventos.filter(e => e.agendamento_id === ag.id).pop();
  assert.strictEqual(ev.payload.origem, 'link_cliente'); assert.strictEqual(ev.payload.actor_type, 'cliente_link'); assert.strictEqual(ev.payload.para, 'confirmado');
  assert.strictEqual((await link('/confirmar', token)).status, 409);
});

test('M04 cancelar: antes do prazo cancela; dentro do prazo do salão (120 min) é recusado no servidor', async () => {
  const { token, ag } = await agendamentoComLink({ horario: '14:00' });
  const r = await link('/cancelar', token);
  assert.strictEqual(r.status, 200, r.raw);
  assert.strictEqual(db.agendamentos.find(a => a.id === ag.id).status, 'cancelado');
  assert.deepStrictEqual(r.data.data.pode, { confirmar: false, cancelar: false, remarcar: false });
  assert.strictEqual((await link('/cancelar', token)).status, 409, 'já cancelado');
  // Hoje às 10:30 (daqui a 90 min): dentro do prazo de 120 min.
  const perto = await agendamentoComLink({ data: HOJE, horario: '10:30' });
  const v = await link('', perto.token);
  assert.strictEqual(v.data.data.pode.cancelar, false);
  const c = await link('/cancelar', perto.token);
  assert.strictEqual(c.status, 422); assert.strictEqual(code(c), 'FORA_DO_PRAZO');
  assert.strictEqual(db.agendamentos.find(a => a.id === perto.ag.id).status, 'agendado');
});

test('M05 remarcar: horários sem o próprio; grava novo, antigo vira remarcado, o mesmo link mostra o novo; limite de 3', async () => {
  const { token, ag } = await agendamentoComLink({ horario: '16:00', profissional: BETO });
  const h = await link('/horarios', token, { data: AMANHA });
  assert.strictEqual(h.status, 200, h.raw);
  assert.ok(!h.data.data.slots.includes('16:00'), 'o próprio horário não é opção');
  assert.ok(h.data.data.slots.includes('16:30'), 'vizinho livre aparece (o próprio não ocupa)');
  const r = await link('/remarcar', token, { data: AMANHA, horario: '16:30' });
  assert.strictEqual(r.status, 200, r.raw);
  assert.strictEqual(r.data.data.agendamento.horario, '16:30');
  assert.strictEqual(r.data.data.remarcacoesRestantes, 2);
  assert.strictEqual(db.agendamentos.find(a => a.id === ag.id).status, 'reagendado');
  const novo = db.agendamentos.find(a => a.data === AMANHA && a.horario === '16:30' && a.profissional_id === BETO && a.status === 'agendado');
  assert.ok(novo); assert.strictEqual(novo.cliente_id, CLI); assert.strictEqual(novo.valor_centavos, 5000); assert.strictEqual(novo.created_by, null);
  assert.strictEqual(db.agendamento_acessos.find(a => a.token_hash === hashToken(token)).agendamento_id, novo.id);
  // Horário ocupado ou fora do expediente: recusado.
  assert.strictEqual(code(await link('/remarcar', token, { data: AMANHA, horario: '22:00' })), 'HORARIO_INDISPONIVEL');
  // Mais duas remarcações e acabou.
  assert.strictEqual((await link('/remarcar', token, { data: AMANHA, horario: '17:00' })).status, 200);
  assert.strictEqual((await link('/remarcar', token, { data: AMANHA, horario: '17:30' })).status, 200);
  const v = await link('', token);
  assert.strictEqual(v.data.data.pode.remarcar, false); assert.strictEqual(v.data.data.remarcacoesRestantes, 0);
  const x = await link('/remarcar', token, { data: AMANHA, horario: '16:00' });
  assert.strictEqual(x.status, 422); assert.strictEqual(code(x), 'FORA_DO_PRAZO');
});

test('M06 corrida: a recepção cancela o original antes da remarcação gravar → 409 e nenhum horário novo (027, D-063)', async () => {
  const { token, ag } = await agendamentoComLink({ horario: '09:30', profissional: BETO, data: '2026-11-12' });
  const P = SupabaseRepository.prototype;
  const original = P.remarcarAgendamento;
  // Com a 027 o original fica travado (FOR UPDATE) durante a remarcação: a mudança concorrente
  // só pode acontecer antes da trava, e aí a RPC recusa sem criar nada.
  P.remarcarAgendamento = async function (args) {
    db.agendamentos.find(a => a.id === ag.id).status = 'cancelado';
    return original.call(this, args);
  };
  try {
    const r = await link('/remarcar', token, { data: '2026-11-12', horario: '10:00' });
    assert.strictEqual(r.status, 409, r.raw); assert.strictEqual(code(r), 'AGENDAMENTO_MUDOU');
  } finally { P.remarcarAgendamento = original; }
  assert.ok(!db.agendamentos.some(a => a.data === '2026-11-12' && a.horario === '10:00' && a.profissional_id === BETO), 'nada foi criado');
  assert.strictEqual(db.agendamentos.find(a => a.id === ag.id).status, 'cancelado', 'o cancelamento da recepção vale');
});

test('M06b banco sem a 027: a mesma corrida no caminho anterior desfaz o novo e o cliente vê 409', async () => {
  const { token, ag } = await agendamentoComLink({ horario: '09:30', profissional: BETO, data: '2026-11-19' });
  const P = SupabaseRepository.prototype;
  const remarcar = P.remarcarAgendamento;
  const criar = P.criarAgendamento;
  P.remarcarAgendamento = async () => null; // RPC ausente (PGRST202)
  P.criarAgendamento = async function (args) {
    db.agendamentos.find(a => a.id === ag.id).status = 'cancelado';
    return criar.call(this, args);
  };
  try {
    const r = await link('/remarcar', token, { data: '2026-11-19', horario: '10:00' });
    assert.strictEqual(r.status, 409, r.raw); assert.strictEqual(code(r), 'AGENDAMENTO_MUDOU');
  } finally { P.remarcarAgendamento = remarcar; P.criarAgendamento = criar; }
  const criado = db.agendamentos.find(a => a.data === '2026-11-19' && a.horario === '10:00' && a.profissional_id === BETO);
  assert.strictEqual(criado.status, 'cancelado', 'o novo foi desfeito');
});

test('M07 salão com o link online desligado: ver, confirmar e cancelar seguem; remarcar pelo link não', async () => {
  const { token } = await agendamentoComLink({ horario: '10:00', data: '2026-11-13' });
  db.empresas[0].online_ativo = false;
  try {
    const v = await link('', token);
    assert.strictEqual(v.status, 200);
    assert.deepStrictEqual(v.data.data.pode, { confirmar: true, cancelar: true, remarcar: false });
    assert.strictEqual(code(await link('/horarios', token, { data: '2026-11-13' })), 'FORA_DO_PRAZO');
  } finally { db.empresas[0].online_ativo = true; }
});

test('M08 recepção gera o link para o lembrete; profissional não; horário encerrado não; outra empresa não', async () => {
  const { ag } = await agendamentoComLink({ horario: '10:30', data: '2026-11-13' });
  const r = await request('POST', `/api/agenda/${ag.id}/link-cliente`, { token: 'h.recep.s' });
  assert.strictEqual(r.status, 201, r.raw);
  const v = await link('', r.data.data.token);
  assert.strictEqual(v.status, 200); assert.strictEqual(v.data.data.agendamento.horario, '10:30');
  assert.strictEqual(db.agendamento_acessos.find(a => a.token_hash === hashToken(r.data.data.token)).origem, 'recepcao');
  assert.strictEqual((await request('POST', `/api/agenda/${ag.id}/link-cliente`, { token: 'h.prof.s' })).status, 403);
  assert.strictEqual((await request('POST', `/api/agenda/${AG_B}/link-cliente`, { token: 'h.recep.s' })).status, 404, 'agendamento de outra empresa');
  db.agendamentos.find(a => a.id === ag.id).status = 'concluido';
  assert.strictEqual((await request('POST', `/api/agenda/${ag.id}/link-cliente`, { token: 'h.recep.s' })).status, 409);
  // No máximo 5 links ativos por agendamento: o mais antigo é revogado.
  const { ag: ag2, token: primeiro } = await agendamentoComLink({ horario: '11:00', data: '2026-11-13' });
  for (let i = 0; i < 5; i++) assert.strictEqual((await request('POST', `/api/agenda/${ag2.id}/link-cliente`, { token: 'h.recep.s' })).status, 201);
  assert.strictEqual((await link('', primeiro)).status, 404, 'o mais antigo foi revogado');
  assert.strictEqual(db.agendamento_acessos.filter(a => a.agendamento_id === ag2.id && !a.revogado_em).length, 5);
});

test('M09 remarcação feita pela recepção leva o link do cliente para o novo horário', async () => {
  const { token, ag } = await agendamentoComLink({ horario: '14:00', data: '2026-11-13' });
  const r = await request('PATCH', `/api/agenda/${ag.id}/status`, { token: 'h.recep.s', body: { novoStatus: 'reagendado', novaData: '2026-11-13', novoHorario: '15:00' } });
  assert.strictEqual(r.status, 200, r.raw);
  const v = await link('', token);
  assert.strictEqual(v.status, 200); assert.strictEqual(v.data.data.agendamento.horario, '15:00');
});

test('C301 aviso de online novo (C3): recepção vê o agendamento feito pelo link; "desde" depois dele zera; sem login 401', async () => {
  const r = await request('GET', '/api/agenda/online-novos', { token: 'h.recep.s' });
  assert.strictEqual(r.status, 200, r.raw);
  const rita = r.data.data.itens.find(i => i.clienteNome === 'Rita Link');
  assert.ok(rita, 'o agendamento online do M01 aparece');
  assert.deepStrictEqual({ data: rita.data, horario: rita.horario, servico: rita.servicoNome, prof: rita.profissionalNome }, { data: AMANHA, horario: '15:00', servico: 'Corte', prof: 'Beto' });
  assert.strictEqual(r.data.data.agora, AGORA.toISOString());
  // Agendamento criado pela equipe (sem evento de origem online) não aparece.
  assert.ok(!r.data.data.itens.some(i => i.clienteNome === 'Cliente Segredo'));
  const depois = await request('GET', `/api/agenda/online-novos?desde=${encodeURIComponent('2026-11-10T12:00:01Z')}`, { token: 'h.recep.s' });
  assert.strictEqual(depois.data.data.total, 0, 'visto depois do agendamento: nada novo');
  const antigo = await request('GET', `/api/agenda/online-novos?desde=${encodeURIComponent('2020-01-01T00:00:00Z')}`, { token: 'h.recep.s' });
  assert.strictEqual(antigo.data.data.desde, '2026-11-03T12:00:00.000Z', 'no máximo 7 dias para trás');
  assert.strictEqual((await request('GET', '/api/agenda/online-novos?desde=ontem', { token: 'h.recep.s' })).status, 422);
  assert.strictEqual((await request('GET', '/api/agenda/online-novos')).status, 401);
});

// --- Controles negativos ----------------------------------------------------
function routerMutante(trocas) {
  const arquivo = path.join(__dirname, '../src/routes/publicBooking.js');
  let src = fs.readFileSync(arquivo, 'utf8');
  for (const [de, para] of trocas) {
    assert.ok(src.includes(de), `trecho para o mutante não encontrado: ${de}`);
    src = src.split(de).join(para);
  }
  const m = new Module(arquivo, module);
  m.filename = arquivo;
  m.paths = Module._nodeModulePaths(path.dirname(arquivo));
  m._compile(src, arquivo);
  m.exports.setRelogioParaTestes(() => AGORA);
  const mini = express();
  mini.set('trust proxy', 1);
  mini.use('/api/public', m.exports.publicBookingRouter);
  return mini;
}
async function comServidor(appMutante, fn) {
  const srv = appMutante.listen(0);
  try { return await fn(`http://127.0.0.1:${srv.address().port}`); } finally { srv.close(); }
}

test('NC1 controle negativo: sem a checagem de prazo, o cancelamento a 90 min do M04 passa', async () => {
  const perto = await agendamentoComLink({ data: HOJE, horario: '10:30', profissional: BETO });
  await comServidor(routerMutante([['const antesDoPrazo = agora.getTime() < limite.getTime();', 'const antesDoPrazo = true;']]), async url => {
    const r = await link('/cancelar', perto.token, {}, url);
    assert.strictEqual(r.status, 200, `o mutante deveria cancelar (prova que M04 detecta): ${r.raw}`);
  });
});

test('NC2 controle negativo: sem olhar revogado_em, o link revogado do M02 volta a abrir', async () => {
  const { token } = await agendamentoComLink({ horario: '13:30', data: '2026-11-14' });
  db.agendamento_acessos.find(a => a.token_hash === hashToken(token)).revogado_em = AGORA.toISOString();
  await comServidor(routerMutante([['if (!acesso || acesso.revogado_em || ', 'if (!acesso || ']]), async url => {
    assert.strictEqual((await link('', token, {}, url)).status, 200, 'o mutante deveria abrir (prova que M02 detecta)');
  });
});

test('M12 remarcação pelo link usa a grade do link (D-069): parte do fim da ocupação e anda pela duração do agendamento', async () => {
  const D = '2026-11-17';
  // Outro cliente ocupa a Ana das 09:00 às 09:35 nesse dia.
  await repoA().insert('agendamentos', { id: '90000000-0000-4000-8000-0000000002f1', cliente_id: CLI, servico_id: CORTE, profissional_id: ANA,
    data: D, horario: '09:00:00', duracao_min: 35, valor_centavos: 5000, status: 'agendado' });
  const { ag, token } = await agendamentoComLink({ data: AMANHA, horario: '14:00' });
  ag.duracao_min = 45; // a remarcação mantém a duração do agendamento (duracaoFixa)
  db.agendamentos.find(a => a.id === ag.id).duracao_min = 45;
  const r = await link('/horarios', token, { data: D });
  assert.strictEqual(r.status, 200, r.raw);
  assert.deepStrictEqual(r.data.data.slots.slice(0, 3), ['09:35', '10:20', '11:05'], r.data.data.slots.join(','));
  assert.ok(r.data.data.slots.every(h => { const m = +h.slice(0, 2) * 60 + +h.slice(3) - 575; return m >= 0 && m % 45 === 0; }), 'todos na grade de 45 a partir de 09:35');
  const fora = await link('/remarcar', token, { data: D, horario: '10:00' });
  assert.ok(fora.status >= 400, 'fora da grade do link não remarca: ' + fora.status);
  const dentro = await link('/remarcar', token, { data: D, horario: '10:20' });
  assert.strictEqual(dentro.status, 200, dentro.raw);
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
  console.log(`\nLink Pessoal Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();

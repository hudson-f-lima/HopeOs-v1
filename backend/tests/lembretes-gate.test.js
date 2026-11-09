// Lembretes Gate (D-011): lembretes de confirmação via wa.me, trava de
// transição de status da agenda e CORS por origem exata.
// HTTP real contra o app; banco e identidade em memória.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-lembretes-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { env } = require('../src/config/env');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { montarLembretes, normalizarWhatsapp } = require('../src/engines/ReminderEngine');
const { agoraNoFuso } = require('../src/engines/SlotEngine');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

const E = env.DEFAULT_EMPRESA_ID;
const EB = 'e0000000-0000-4000-8000-0000000000cc';
const ADMIN = 'c0000000-0000-4000-8000-0000000000c1';
const PROFU = 'c0000000-0000-4000-8000-0000000000c2';
const UNIT = 'f0000000-0000-4000-8000-0000000000c1';
const ROBSON = 'a0000000-0000-4000-8000-0000000000c1';
const ANA = 'a0000000-0000-4000-8000-0000000000c2';
const SERV = 'b0000000-0000-4000-8000-0000000000c1';
const JOAO = 'd0000000-0000-4000-8000-0000000000c1';
const MARIA = 'd0000000-0000-4000-8000-0000000000c2';
const SEMZAP = 'd0000000-0000-4000-8000-0000000000c3';
const CLI_B = 'd0000000-0000-4000-8000-0000000000cb';
const DIA = '2026-11-10'; // terça
const ag = (id, extra) => ({ id: `90000000-0000-4000-8000-0000000000${id}`, empresa_id: E, servico_id: SERV, profissional_id: ROBSON, data: DIA, duracao_min: 30, ...extra });

setIdentityStore(createMemoryIdentityStore({
  app_users: [ADMIN, PROFU].map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: E, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: E, user_id: PROFU, role: 'profissional', status: 'ativo', profissional_id: ANA }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: UNIT }]
}));
const tokens = { 'h.admin.s': ADMIN, 'h.prof.s': PROFU };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });

const db = installMemoryBackend({
  empresas: [{ id: E, nome: 'Barbearia Centro', horario_por_dia: {} }, { id: EB, nome: 'B', horario_por_dia: {} }],
  servicos: [{ id: SERV, empresa_id: E, nome: 'Corte', valor_centavos: 5000, duracao_min: 30, comissao_pct: 40, ativo: true }],
  profissionais: [
    { id: ROBSON, empresa_id: E, nome: 'Robson', ativo: true, overrides: {} },
    { id: ANA, empresa_id: E, nome: 'Ana', ativo: true, overrides: {} }
  ],
  clientes: [
    { id: JOAO, empresa_id: E, nome: 'João Silva', whatsapp: '(11) 98888-7777', ativo: true },
    { id: MARIA, empresa_id: E, nome: 'Maria', whatsapp: '5511977776666', ativo: true },
    { id: SEMZAP, empresa_id: E, nome: 'Sem Zap', whatsapp: null, ativo: true },
    { id: CLI_B, empresa_id: EB, nome: 'Outra empresa', whatsapp: '11955554444', ativo: true }
  ],
  agendamentos: [
    ag('01', { cliente_id: MARIA, horario: '11:00:00', status: 'agendado' }),
    ag('02', { cliente_id: JOAO, horario: '09:30:00', status: 'agendado' }),
    ag('03', { cliente_id: SEMZAP, horario: '10:00:00', status: 'agendado', profissional_id: ANA }),
    ag('04', { cliente_id: JOAO, horario: '12:00:00', status: 'confirmado' }),
    ag('05', { cliente_id: JOAO, horario: '13:00:00', status: 'cancelado' }),
    ag('06', { cliente_id: JOAO, horario: '14:00:00', status: 'concluido' }),
    ag('07', { cliente_id: JOAO, horario: '15:00:00', status: 'reagendado' }),
    { id: '90000000-0000-4000-8000-0000000000b1', empresa_id: EB, cliente_id: CLI_B, servico_id: SERV, profissional_id: ROBSON, data: DIA, horario: '09:00:00', status: 'agendado' }
  ],
  comandos: [], comando_itens: [], produtos: [], formas_pagamento: []
});

let base;
function request(method, path, { token = 'h.admin.s', body, origin } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    if (origin) headers.origin = origin;
    if (payload !== null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(payload); }
    const req = http.request(base + path, { method, headers }, res => {
      let raw = ''; res.on('data', c => { raw += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(raw); } catch (_) {} resolve({ status: res.statusCode, data, headers: res.headers }); });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;
const tests = [];
const test = (n, f) => tests.push({ n, f });

test('L01 número BR: aceita DDD+8/9 dígitos com ou sem 55; recusa o resto', () => {
  assert.strictEqual(normalizarWhatsapp('(11) 98888-7777'), '5511988887777');
  assert.strictEqual(normalizarWhatsapp('5511977776666'), '5511977776666');
  assert.strictEqual(normalizarWhatsapp('1133334444'), '551133334444');
  assert.strictEqual(normalizarWhatsapp('98888-7777'), null, 'sem DDD');
  assert.strictEqual(normalizarWhatsapp('1'), null);
  assert.strictEqual(normalizarWhatsapp(null), null);
});

test('L02 engine: só pendentes, ordenados por horário, texto completo, contadores', () => {
  const r = montarLembretes({ data: DIA, agendamentos: db.agendamentos.filter(a => a.empresa_id === E), clientes: db.clientes, servicos: db.servicos, profissionais: db.profissionais, empresa: db.empresas[0] });
  assert.deepStrictEqual(r.itens.map(i => i.horario), ['09:30', '10:00', '11:00']);
  assert.strictEqual(r.pendentes, 3); assert.strictEqual(r.comLink, 2); assert.strictEqual(r.confirmados, 1);
  const joao = r.itens[0];
  assert.strictEqual(joao.texto, 'Olá, João! Lembrete do seu horário no Barbearia Centro: terça, 10/11 às 09:30, Corte com Robson. Pode confirmar respondendo SIM? Se precisar remarcar, é só avisar por aqui.');
  assert.ok(joao.link.startsWith('https://wa.me/5511988887777?text=Ol%C3%A1%2C%20Jo%C3%A3o!'));
  assert.strictEqual(r.itens[1].link, null); assert.strictEqual(r.itens[1].motivo, 'sem_whatsapp');
});

test('L03 rota: lista do dia só da empresa do usuário; data inválida = 422', async () => {
  const r = await request('GET', `/api/agenda/lembretes?data=${DIA}`);
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.data.pendentes, 3);
  assert.ok(!JSON.stringify(r.data).includes('Outra empresa'), 'não vaza cliente de outra empresa');
  assert.strictEqual(code(await request('GET', '/api/agenda/lembretes?data=10/11/2026')), 'INVALID_DATE');
  assert.strictEqual((await request('GET', '/api/agenda/lembretes', { token: null })).status, 401);
});

test('L04 rota sem data = amanhã no fuso da empresa', async () => {
  const hoje = agoraNoFuso(env.APP_TIMEZONE).data;
  const [y, m, d] = hoje.split('-').map(Number);
  const amanha = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  const r = await request('GET', '/api/agenda/lembretes');
  assert.strictEqual(r.status, 200); assert.strictEqual(r.data.data.data, amanha);
});

test('L05 profissional vê só os próprios lembretes', async () => {
  const r = await request('GET', `/api/agenda/lembretes?data=${DIA}`, { token: 'h.prof.s' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.data.itens.map(i => i.profissionalNome), ['Ana']);
});

test('L06 status: agendado → confirmado ok; concluído e reagendado não mudam (409)', async () => {
  const ok = await request('PATCH', `/api/agenda/${ag('02').id}/status`, { body: { novoStatus: 'confirmado' } });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(db.agendamentos.find(a => a.id === ag('02').id).status, 'confirmado');
  for (const [id, novo] of [['06', 'cancelado'], ['06', 'no_show'], ['07', 'confirmado']]) {
    const r = await request('PATCH', `/api/agenda/${ag(id).id}/status`, { body: { novoStatus: novo } });
    assert.strictEqual(r.status, 409, `${id} → ${novo}`); assert.strictEqual(code(r), 'INVALID_STATUS_TRANSITION');
  }
  assert.strictEqual(db.agendamentos.find(a => a.id === ag('06').id).status, 'concluido', 'pago continua concluído');
  const canc = await request('PATCH', `/api/agenda/${ag('01').id}/status`, { body: { novoStatus: 'cancelado' } });
  assert.strictEqual(canc.status, 200, 'pendente ainda pode ser cancelado');
});

test('L07 CORS: origem exata; sufixo/prefixo maliciosos não recebem Allow-Origin', async () => {
  const permitido = await request('GET', '/api/health', { token: null, origin: 'https://hudson-f-lima.github.io' });
  assert.strictEqual(permitido.headers['access-control-allow-origin'], 'https://hudson-f-lima.github.io');
  assert.strictEqual((await request('GET', '/api/health', { token: null, origin: 'http://localhost:5599' })).headers['access-control-allow-origin'], 'http://localhost:5599');
  for (const o of ['https://hudson-f-lima.github.io.evil.com', 'https://evilhudson-f-lima.github.io', 'https://localhost.evil.com', 'https://evil.com']) {
    const r = await request('GET', '/api/health', { token: null, origin: o });
    assert.strictEqual(r.headers['access-control-allow-origin'], undefined, o);
  }
});

test('L08 presença: check-in → cadeira → concluído; quem chegou não vira falta; cancelado não volta', async () => {
  const novo = (sufixo, status) => { const a = ag(sufixo, { cliente_id: JOAO, horario: '16:00:00', status }); db.agendamentos.push(a); return a.id; };
  const patch = (id, novoStatus) => request('PATCH', `/api/agenda/${id}/status`, { body: { novoStatus } });
  const a = novo('21', 'agendado');
  assert.strictEqual((await patch(a, 'aguardando')).status, 200, 'check-in');
  assert.strictEqual(code(await patch(a, 'no_show')), 'INVALID_STATUS_TRANSITION', 'cliente presente não é falta');
  assert.strictEqual((await patch(a, 'em_atendimento')).status, 200, 'na cadeira');
  assert.strictEqual(code(await patch(a, 'cancelado')), 'INVALID_STATUS_TRANSITION', 'em atendimento não cancela');
  assert.strictEqual((await patch(a, 'concluido')).status, 200);
  const c = novo('22', 'cancelado');
  for (const s of ['confirmado', 'aguardando', 'no_show', 'concluido']) assert.strictEqual(code(await patch(c, s)), 'INVALID_STATUS_TRANSITION', `cancelado → ${s}`);
  const n = novo('23', 'no_show');
  assert.strictEqual(code(await patch(n, 'confirmado')), 'INVALID_STATUS_TRANSITION', 'falta não volta a confirmado');
  const r = await patch(novo('24', 'confirmado'), 'confirmado');
  assert.strictEqual(r.status, 409); assert.deepStrictEqual(r.data.error.details.permitidoDe, ['agendado']);
  assert.strictEqual(code(await patch(a, 'xpto')), 'INVALID_STATUS');
});

(async () => {
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); ok++; console.log(`✓ ${n}`); } catch (err) { console.log(`✗ ${n}\n   ${err.message}`); }
  }
  server.close();
  console.log(`\nLembretes Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();

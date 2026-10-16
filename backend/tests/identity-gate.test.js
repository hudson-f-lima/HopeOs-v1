// Identity Gate (ADR-005): principals user / integration / legacy, RBAC, unidades,
// autoria e coexistência. HTTP real contra o app Express; provedor de identidade,
// tabelas de identidade e repositório de negócio em memória (sem Supabase).
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-gate-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { env } = require('../src/config/env');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { requireAuth, autoriaDe, metrics } = require('../src/middleware/auth');
const { resetRateLimit } = require('../src/routes/auth');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

// ---------- fixtures ----------
const EA = 'e0000000-0000-4000-8000-0000000000aa';
const EB = 'e0000000-0000-4000-8000-0000000000bb';
const UNIT_A = 'f0000000-0000-4000-8000-0000000000a1';
const UNIT_A_OFF = 'f0000000-0000-4000-8000-0000000000a2';
const UNIT_B = 'f0000000-0000-4000-8000-0000000000b1';
const PROF_A1 = 'a0000000-0000-4000-8000-0000000000a1';
const PROF_A2 = 'a0000000-0000-4000-8000-0000000000a2';
const SERV_A = 'b0000000-0000-4000-8000-0000000000a1';
const PROD_A = 'd0000000-0000-4000-8000-0000000000a1';
const AG_A1 = '70000000-0000-4000-8000-0000000000a1';
const AG_A2 = '70000000-0000-4000-8000-0000000000a2';
const M9 = '90000000-0000-4000-8000-000000000009';
const M1 = '90000000-0000-4000-8000-000000000001';

const users = {
  admin: 'c0000000-0000-4000-8000-000000000001',
  recepcao: 'c0000000-0000-4000-8000-000000000002',
  prof: 'c0000000-0000-4000-8000-000000000003',
  semVinculo: 'c0000000-0000-4000-8000-000000000004',
  inativo: 'c0000000-0000-4000-8000-000000000005',
  multi: 'c0000000-0000-4000-8000-000000000006',
  recepSemUnidade: 'c0000000-0000-4000-8000-000000000007',
  recepUnidadeOff: 'c0000000-0000-4000-8000-000000000008',
  adminB: 'c0000000-0000-4000-8000-000000000009'
};
const jwt = name => `h.${name}.s`; // formato JWT; o provedor fake resolve pelo meio

const store = createMemoryIdentityStore({
  app_users: Object.entries(users).map(([nome, id]) => ({ id, email: `${nome}@gate.test`, nome, ativo: nome !== 'inativo' })),
  unidades: [
    { id: UNIT_A, empresa_id: EA, nome: 'A1', ativo: true },
    { id: UNIT_A_OFF, empresa_id: EA, nome: 'A2', ativo: false },
    { id: UNIT_B, empresa_id: EB, nome: 'B1', ativo: true }
  ],
  empresa_memberships: [
    { id: M1, empresa_id: EA, user_id: users.admin, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: EA, user_id: users.recepcao, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: EA, user_id: users.prof, role: 'profissional', status: 'ativo', profissional_id: PROF_A1 },
    { id: 'm5', empresa_id: EA, user_id: users.inativo, role: 'admin', status: 'ativo' },
    { id: 'm6a', empresa_id: EA, user_id: users.multi, role: 'gestor', status: 'ativo' },
    { id: 'm6b', empresa_id: EB, user_id: users.multi, role: 'gestor', status: 'ativo' },
    { id: 'm7', empresa_id: EA, user_id: users.recepSemUnidade, role: 'recepcao', status: 'ativo' },
    { id: 'm8', empresa_id: EA, user_id: users.recepUnidadeOff, role: 'recepcao', status: 'ativo' },
    { id: M9, empresa_id: EB, user_id: users.adminB, role: 'admin', status: 'ativo' }
  ],
  membership_units: [
    { membership_id: 'm2', unit_id: UNIT_A },
    { membership_id: 'm3', unit_id: UNIT_A },
    { membership_id: 'm8', unit_id: UNIT_A_OFF }
  ]
});
setIdentityStore(store);

let providerDown = false;
setAuthProvider({
  async getUser(token) {
    if (providerDown) throw createAppError('AUTH_PROVIDER_UNAVAILABLE', 'Provedor de identidade indisponível.', 503);
    const name = token.split('.')[1];
    if (name === 'expirado' || !users[name]) throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
    return { id: users[name], email: `${name}@gate.test` };
  },
  async signIn(email, password) {
    const name = email.split('@')[0];
    if (!users[name] || password !== 'senha-certa') throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
    return { access_token: jwt(name), refresh_token: `r-${name}`, expires_in: 3600, user: { id: users[name], email } };
  },
  async refresh(rt) {
    const name = String(rt).replace(/^r-/, '');
    if (!users[name]) throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
    return { access_token: jwt(name), refresh_token: rt, expires_in: 3600, user: { id: users[name] } };
  },
  async signOut() {},
  async inviteUser(email) {
    if (store.db.app_users.some(u => u.email === email)) throw createAppError('USER_ALREADY_EXISTS', 'Já existe conta com este e-mail.', 409);
    const id = require('crypto').randomUUID();
    store.db.app_users.push({ id, email, nome: email.split('@')[0], ativo: true }); // trigger da 007
    convites.push(email);
    return { id, email };
  },
  async recoverPassword(email) { recuperacoes.push(email); },
  async setPassword(token, password) {
    const name = token.split('.')[1];
    if (!users[name]) throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
    senhas[name] = password;
  }
});
const convites = []; const recuperacoes = []; const senhas = {};

const db = installMemoryBackend({
  empresas: [{ id: EA, nome: 'A' }, { id: EB, nome: 'B' }],
  clientes: [
    { id: 'c1', empresa_id: EA, nome: 'Cliente A', ativo: true },
    { id: 'c2', empresa_id: EB, nome: 'Cliente B', ativo: true }
  ],
  profissionais: [
    { id: PROF_A1, empresa_id: EA, nome: 'Prof A1', ativo: true, horario: { seg: { ativo: true, inicio: '09:00', fim: '18:00' } } },
    { id: PROF_A2, empresa_id: EA, nome: 'Prof A2', ativo: true, horario: { seg: { ativo: true, inicio: '09:00', fim: '18:00' } } }
  ],
  servicos: [{ id: SERV_A, empresa_id: EA, nome: 'Corte', duracao_min: 60, valor_centavos: 5000, ativo: true }],
  produtos: [{ id: PROD_A, empresa_id: EA, nome: 'Pomada', estoque_atual: 5, ativo: true }],
  agendamentos: [
    { id: AG_A1, empresa_id: EA, profissional_id: PROF_A1, servico_id: SERV_A, data: '2026-11-02', horario: '09:00', duracao_min: 60, status: 'agendado' },
    { id: AG_A2, empresa_id: EA, profissional_id: PROF_A2, servico_id: SERV_A, data: '2026-11-02', horario: '09:00', duracao_min: 60, status: 'agendado' }
  ],
  formas_pagamento: [], profissional_servicos: [], lista_espera: []
});

// ---------- harness ----------
let server; let base;
function request(method, path, { token, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const h = { ...headers };
    if (token) h.authorization = `Bearer ${token}`;
    if (payload !== null) { h['content-type'] = 'application/json'; h['content-length'] = Buffer.byteLength(payload); }
    const req = http.request(base + path, { method, headers: h }, res => {
      let raw = ''; res.on('data', c => { raw += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(raw); } catch (_) {} resolve({ status: res.statusCode, data }); });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
async function authOf(token, headers = {}) {
  const req = { method: 'GET', headers: { authorization: `Bearer ${token}`, ...headers }, originalUrl: '/api/x' };
  const res = { on() {}, statusCode: 200 };
  let error = null;
  await requireAuth(req, res, err => { error = err || null; });
  if (error) throw error;
  return req.auth;
}
const code = r => r.data && r.data.error && r.data.error.code;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const LEGACY = env.API_ACCESS_TOKEN;

// ---------- principal user ----------
test('U01 JWT ausente → 401', async () => {
  assert.strictEqual((await request('GET', '/api/clientes')).status, 401);
});
test('U02 JWT inválido → 401', async () => {
  assert.strictEqual((await request('GET', '/api/clientes', { token: jwt('ninguem') })).status, 401);
});
test('U03 JWT expirado → 401', async () => {
  assert.strictEqual((await request('GET', '/api/clientes', { token: jwt('expirado') })).status, 401);
});
test('U04 usuário sem membership → 403', async () => {
  const r = await request('GET', '/api/clientes', { token: jwt('semVinculo') });
  assert.strictEqual(r.status, 403); assert.strictEqual(code(r), 'NO_ACTIVE_MEMBERSHIP');
});
test('U05 usuário desativado na aplicação → 403', async () => {
  const r = await request('GET', '/api/clientes', { token: jwt('inativo') });
  assert.strictEqual(r.status, 403); assert.strictEqual(code(r), 'USER_INACTIVE');
});
test('U06 empresa A não acessa empresa B (seletor fora das memberships → 403)', async () => {
  const r = await request('GET', '/api/clientes', { token: jwt('admin'), headers: { 'x-empresa-id': EB } });
  assert.strictEqual(r.status, 403); assert.strictEqual(code(r), 'EMPRESA_NOT_AUTHORIZED');
  const ok = await request('GET', '/api/clientes', { token: jwt('admin') });
  assert.deepStrictEqual(ok.data.data.map(c => c.id), ['c1']);
});
test('U07 relatórios usam a empresa do usuário, não o DEFAULT_EMPRESA_ID', async () => {
  const r = await request('GET', '/api/agenda', { token: jwt('adminB') });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.data.every(a => a.empresa_id === EB));
  const { InsightsService } = require('../src/services/InsightsService');
  assert.throws(() => new InsightsService(), /exige empresaId/);
});
test('U08 várias empresas: sem X-Empresa-Id → 400; com seletor válido → contexto daquela empresa', async () => {
  const r = await request('GET', '/api/clientes', { token: jwt('multi') });
  assert.strictEqual(r.status, 400); assert.strictEqual(code(r), 'EMPRESA_SELECTION_REQUIRED');
  const b = await request('GET', '/api/clientes', { token: jwt('multi'), headers: { 'x-empresa-id': EB } });
  assert.deepStrictEqual(b.data.data.map(c => c.id), ['c2']);
});
test('U09 unidade não autorizada → 403; sem unidade → 403; unidade inativa revoga', async () => {
  const r = await request('GET', '/api/clientes', { token: jwt('recepcao'), headers: { 'x-unidade-id': UNIT_A_OFF } });
  assert.strictEqual(code(r), 'UNIT_NOT_AUTHORIZED');
  assert.strictEqual(code(await request('GET', '/api/clientes', { token: jwt('recepSemUnidade') })), 'NO_UNIT_ACCESS');
  assert.strictEqual(code(await request('GET', '/api/clientes', { token: jwt('recepUnidadeOff') })), 'NO_UNIT_ACCESS');
  const a = await authOf(jwt('admin'));
  assert.deepStrictEqual(a.unit_ids, [UNIT_A], 'admin vê só unidades ativas');
});
test('U10 role insuficiente → 403 (recepção ajusta estoque, profissional edita cliente, recepção administra)', async () => {
  const r1 = await request('POST', `/api/produtos/${PROD_A}/estoque/ajuste`, { token: jwt('recepcao'), body: { tipo: 'entrada', quantidade: 1 } });
  assert.strictEqual(code(r1), 'INSUFFICIENT_ROLE');
  const r2 = await request('POST', '/api/clientes', { token: jwt('prof'), body: { nome: 'X' } });
  assert.strictEqual(code(r2), 'INSUFFICIENT_ROLE');
  const r3 = await request('GET', '/api/admin/memberships', { token: jwt('recepcao') });
  assert.strictEqual(code(r3), 'INSUFFICIENT_ROLE');
  const r4 = await request('GET', '/api/insights/margin', { token: jwt('recepcao') });
  assert.strictEqual(code(r4), 'INSUFFICIENT_ROLE', 'recepção não vê margem');
});
test('U11 escrita crítica grava autoria (cliente, agenda, cancelamento, estoque)', async () => {
  const c = await request('POST', '/api/clientes', { token: jwt('recepcao'), body: { nome: 'Novo' } });
  assert.strictEqual(c.status, 201); assert.strictEqual(c.data.data.created_by, users.recepcao);
  const ag = await request('POST', '/api/agenda', { token: jwt('recepcao'), body: { servicoId: SERV_A, profissionalId: PROF_A1, data: '2026-11-02', horario: '14:00' } });
  assert.strictEqual(ag.status, 201); assert.strictEqual(ag.data.data.created_by, users.recepcao);
  const cancel = await request('PATCH', `/api/agenda/${ag.data.data.id}/status`, { token: jwt('admin'), body: { novoStatus: 'cancelado' } });
  assert.strictEqual(cancel.data.data.original.cancelled_by, users.admin);
  assert.strictEqual(cancel.data.data.original.updated_by, users.admin);
  const est = await request('POST', `/api/produtos/${PROD_A}/estoque/ajuste`, { token: jwt('admin'), body: { tipo: 'entrada', quantidade: 2 } });
  assert.strictEqual(est.status, 201); assert.strictEqual(est.data.data.movimento.actor_id, users.admin);
});
test('U12 autoria fail-closed: principal user sem ator não escreve', async () => {
  assert.throws(() => autoriaDe({ principal_type: 'user', actor_id: null }), e => e.code === 'ACTOR_CONTEXT_MISSING');
  assert.throws(() => autoriaDe(null), e => e.statusCode === 401);
});
test('U13 autoria e tenant nunca vêm do cliente', async () => {
  for (const field of ['created_by', 'actor_id', 'updated_by']) {
    const r = await request('POST', '/api/clientes', { token: jwt('admin'), body: { nome: 'X', [field]: users.recepcao } });
    assert.strictEqual(code(r), 'FORBIDDEN_FIELD', field);
  }
  const r = await request('POST', '/api/clientes', { token: jwt('admin'), body: { nome: 'X', empresa_id: EB } });
  assert.strictEqual(code(r), 'FORBIDDEN_FIELD');
});
test('U14 provedor de identidade fora do ar → 503, nunca autorização implícita', async () => {
  providerDown = true;
  try {
    const r = await request('GET', '/api/clientes', { token: jwt('admin') });
    assert.strictEqual(r.status, 503); assert.strictEqual(code(r), 'AUTH_PROVIDER_UNAVAILABLE');
  } finally { providerDown = false; }
});
test('U15 suspensão de membership/role vale na próxima requisição', async () => {
  assert.strictEqual((await request('GET', '/api/clientes', { token: jwt('recepcao') })).status, 200);
  store.db.empresa_memberships.find(m => m.id === 'm2').status = 'inativo';
  assert.strictEqual(code(await request('GET', '/api/clientes', { token: jwt('recepcao') })), 'NO_ACTIVE_MEMBERSHIP');
  store.db.empresa_memberships.find(m => m.id === 'm2').status = 'ativo';
  store.db.empresa_memberships.find(m => m.id === 'm2').role = 'profissional';
  assert.strictEqual(code(await request('POST', '/api/clientes', { token: jwt('recepcao'), body: { nome: 'Y' } })), 'INSUFFICIENT_ROLE');
  store.db.empresa_memberships.find(m => m.id === 'm2').role = 'recepcao';
});
test('U16 profissional: escopo "Próprio" na agenda, slots e checkout', async () => {
  const lista = await request('GET', '/api/agenda', { token: jwt('prof') });
  assert.ok(lista.data.data.length > 0 && lista.data.data.every(a => a.profissional_id === PROF_A1));
  const outro = await request('POST', '/api/agenda', { token: jwt('prof'), body: { servicoId: SERV_A, profissionalId: PROF_A2, data: '2026-11-02', horario: '15:00' } });
  assert.strictEqual(code(outro), 'NOT_OWN_RESOURCE');
  const proprio = await request('POST', '/api/agenda', { token: jwt('prof'), body: { servicoId: SERV_A, profissionalId: PROF_A1, data: '2026-11-02', horario: '15:00' } });
  assert.strictEqual(proprio.status, 201);
  assert.strictEqual(code(await request('PATCH', `/api/agenda/${AG_A2}/status`, { token: jwt('prof'), body: { novoStatus: 'cancelado' } })), 'NOT_OWN_RESOURCE');
  assert.strictEqual(code(await request('PATCH', `/api/agenda/${AG_A2}/duracao`, { token: jwt('prof'), body: { duracaoMin: 30 } })), 'NOT_OWN_RESOURCE');
  const reag = await request('PATCH', `/api/agenda/${AG_A1}/status`, { token: jwt('prof'), body: { novoStatus: 'reagendado', novaData: '2026-11-02', novoHorario: '09:00', novoProfissionalId: PROF_A2 } });
  assert.strictEqual(code(reag), 'NOT_OWN_RESOURCE', 'não reagenda para outro profissional');
  const own = await request('PATCH', `/api/agenda/${AG_A1}/status`, { token: jwt('prof'), body: { novoStatus: 'confirmado' } });
  assert.strictEqual(own.status, 200); assert.strictEqual(own.data.data.original.updated_by, users.prof);
  const slots = await request('GET', `/api/agenda/slots?data=2026-11-02&profissionalId=${PROF_A2}&servicoId=${SERV_A}`, { token: jwt('prof') });
  assert.strictEqual(code(slots), 'NOT_OWN_RESOURCE');
  const ck = await request('POST', '/api/checkout/preview', { token: jwt('prof'), body: { itens: [{ tipo: 'servico', servicoId: SERV_A, profissionalId: PROF_A2 }], payments: [{ formaCode: 'pix', valorCentavos: 1 }] } });
  assert.strictEqual(code(ck), 'NOT_OWN_RESOURCE');
});
test('U17 conflito de agenda continua 409 SCHEDULE_CONFLICT com detalhes', async () => {
  const r = await request('POST', '/api/agenda', { token: jwt('admin'), body: { servicoId: SERV_A, profissionalId: PROF_A2, data: '2026-11-02', horario: '09:30' } });
  assert.strictEqual(r.status, 409); assert.strictEqual(code(r), 'SCHEDULE_CONFLICT');
  assert.ok(r.data.error.details.conflitos.length === 1);
});

// ---------- sessão ----------
test('S01 login/refresh/me: sessão do provedor e empresas do usuário', async () => {
  resetRateLimit();
  const bad = await request('POST', '/api/auth/login', { body: { email: 'admin@gate.test', password: 'errada' } });
  assert.strictEqual(bad.status, 401);
  const ok = await request('POST', '/api/auth/login', { body: { email: 'admin@gate.test', password: 'senha-certa' } });
  assert.strictEqual(ok.status, 200); assert.ok(ok.data.data.access_token);
  const me = await request('GET', '/api/me', { token: ok.data.data.access_token });
  assert.strictEqual(me.data.data.principal_type, 'user');
  assert.deepStrictEqual(me.data.data.empresas.map(e => e.role), ['admin']);
  const multi = await request('GET', '/api/me', { token: jwt('multi') });
  assert.strictEqual(multi.data.data.empresas.length, 2, '/me funciona sem X-Empresa-Id');
  const rf = await request('POST', '/api/auth/refresh', { body: { refresh_token: ok.data.data.refresh_token } });
  assert.strictEqual(rf.status, 200);
});
test('S02 rate limit de login → 429', async () => {
  resetRateLimit();
  let last;
  for (let i = 0; i <= env.LOGIN_RATE_LIMIT_MAX; i++) last = await request('POST', '/api/auth/login', { body: { email: 'alvo@gate.test', password: 'x' } });
  assert.strictEqual(last.status, 429);
  resetRateLimit();
});

// ---------- administração ----------
test('A01 admin cria vínculo por e-mail; protege o último admin', async () => {
  const r = await request('POST', '/api/admin/memberships', { token: jwt('adminB'), body: { email: 'recepcao@gate.test', role: 'recepcao', unitIds: [UNIT_B] } });
  assert.strictEqual(r.status, 201); assert.strictEqual(r.data.data.empresa_id, EB);
  const dup = await request('POST', '/api/admin/memberships', { token: jwt('adminB'), body: { email: 'recepcao@gate.test', role: 'gestor' } });
  assert.strictEqual(code(dup), 'MEMBERSHIP_EXISTS');
  const outraEmpresa = await request('POST', '/api/admin/memberships', { token: jwt('adminB'), body: { email: 'prof@gate.test', role: 'recepcao', unitIds: [UNIT_A] } });
  assert.strictEqual(code(outraEmpresa), 'UNIT_NOT_FOUND');
  assert.strictEqual(code(await request('PATCH', `/api/admin/memberships/${M9}`, { token: jwt('adminB'), body: { role: 'gestor' } })), 'LAST_ADMIN');
  assert.strictEqual(code(await request('PATCH', `/api/admin/memberships/${M9}`, { token: jwt('adminB'), body: { status: 'inativo' } })), 'LAST_ADMIN');
  const outra = await request('PATCH', `/api/admin/memberships/${M1}`, { token: jwt('adminB'), body: { role: 'gestor' } });
  assert.strictEqual(code(outra), 'MEMBERSHIP_NOT_FOUND', 'admin de B não edita vínculo da empresa A');
  assert.strictEqual(store.db.empresa_memberships.find(m => m.id === M1).role, 'admin');
});

test('A02 convite: cria conta pelo provedor + vínculo; conta existente só ganha vínculo', async () => {
  const novo = await request('POST', '/api/admin/invites', { token: jwt('admin'), body: { email: 'Nova@Gate.test', role: 'recepcao', unitIds: [UNIT_A] } });
  assert.strictEqual(novo.status, 201); assert.strictEqual(novo.data.data.convidado, true);
  assert.deepStrictEqual(convites, ['nova@gate.test'], 'e-mail normalizado e convite enviado');
  const existente = await request('POST', '/api/admin/invites', { token: jwt('admin'), body: { email: 'semvinculo@gate.test', role: 'gestor' } });
  assert.strictEqual(existente.status, 201); assert.strictEqual(existente.data.data.convidado, false);
  assert.strictEqual(convites.length, 1, 'conta existente não recebe novo convite');
  const semProf = await request('POST', '/api/admin/invites', { token: jwt('admin'), body: { email: 'x@gate.test', role: 'profissional' } });
  assert.strictEqual(code(semProf), 'PROFESSIONAL_REQUIRED');
  const naoAdmin = await request('POST', '/api/admin/invites', { token: jwt('recepcao'), headers: { 'x-empresa-id': EA }, body: { email: 'y@gate.test', role: 'admin' } });
  assert.strictEqual(code(naoAdmin), 'INSUFFICIENT_ROLE');
  store.db.empresa_memberships = store.db.empresa_memberships.filter(m => m.user_id !== users.semVinculo); // restaura U04
});
test('S03 recuperação de senha responde igual para e-mail existente ou não', async () => {
  resetRateLimit();
  const a = await request('POST', '/api/auth/recover', { body: { email: 'admin@gate.test' } });
  const b = await request('POST', '/api/auth/recover', { body: { email: 'naoexiste@gate.test' } });
  assert.strictEqual(a.status, 200); assert.deepStrictEqual(a.data, b.data);
});
test('S04 definir senha exige token do link e mínimo de 8 caracteres', async () => {
  assert.strictEqual((await request('POST', '/api/auth/password', { body: { password: '12345678' } })).status, 401);
  assert.strictEqual(code(await request('POST', '/api/auth/password', { token: jwt('recepcao'), body: { password: '123' } })), 'WEAK_PASSWORD');
  assert.strictEqual((await request('POST', '/api/auth/password', { token: jwt('ninguem'), body: { password: '12345678' } })).status, 401);
  const ok = await request('POST', '/api/auth/password', { token: jwt('recepcao'), body: { password: 'nova-senha-1' } });
  assert.strictEqual(ok.status, 200); assert.strictEqual(senhas.recepcao, 'nova-senha-1');
});

// ---------- principal integration ----------
let integ; let secret1;
test('I01 criação devolve o segredo uma única vez; listagem nunca devolve segredo nem hash', async () => {
  const r = await request('POST', '/api/admin/integrations', { token: jwt('admin'), body: { nome: 'Export', scopes: ['clientes:read', 'clientes:write'] } });
  assert.strictEqual(r.status, 201); assert.ok(/^kxi_/.test(r.data.data.secret));
  integ = r.data.data.integration; secret1 = r.data.data.secret;
  const list = await request('GET', '/api/admin/integrations', { token: jwt('admin') });
  const raw = JSON.stringify(list.data);
  assert.ok(!raw.includes(secret1.split('_').pop()) && !raw.includes('secret_hash') && !raw.includes('scrypt$'));
  const curinga = await request('POST', '/api/admin/integrations', { token: jwt('admin'), body: { nome: 'X', scopes: ['admin'] } });
  assert.strictEqual(code(curinga), 'INVALID_SCOPE');
});
test('I02 integração autentica com tenant e scopes fixados no servidor; não tem formato de usuário', async () => {
  const a = await authOf(secret1);
  assert.strictEqual(a.principal_type, 'integration'); assert.strictEqual(a.empresa_id, EA);
  assert.deepStrictEqual(a.scopes.sort(), ['clientes:read', 'clientes:write']);
  for (const k of ['user_id', 'actor_id', 'role', 'unit_ids']) assert.ok(!(k in a), `integração com ${k}`);
  const r = await request('GET', '/api/clientes', { token: secret1 });
  assert.deepStrictEqual(r.data.data.map(c => c.id).filter(id => id === 'c2'), []);
});
test('I03 escopo insuficiente → 403; scope enviado pela integração é ignorado', async () => {
  const r = await request('GET', '/api/agenda', { token: secret1, headers: { 'x-scopes': 'agenda:read' } });
  assert.strictEqual(code(r), 'INSUFFICIENT_SCOPE');
  const adm = await request('GET', '/api/admin/integrations', { token: secret1 });
  assert.strictEqual(code(adm), 'USER_PRINCIPAL_REQUIRED');
});
test('I04 tenant diferente do fixado → 403', async () => {
  const r = await request('GET', '/api/clientes', { token: secret1, headers: { 'x-empresa-id': EB } });
  assert.strictEqual(code(r), 'EMPRESA_NOT_AUTHORIZED');
});
test('I05 integração não grava autoria humana', async () => {
  const r = await request('POST', '/api/clientes', { token: secret1, body: { nome: 'Via integração' } });
  assert.strictEqual(r.status, 201); assert.strictEqual(r.data.data.created_by, null);
});
test('I06 credencial inexistente/adulterada → 401, em tempo comparável', async () => {
  const [, credId, sec] = /^kxi_(.{36})_(.+)$/.exec(secret1);
  const inexistente = `kxi_00000000-0000-4000-8000-000000000000_${sec}`;
  const errada = `kxi_${credId}_${'A'.repeat(43)}`;
  assert.strictEqual((await request('GET', '/api/clientes', { token: inexistente })).status, 401);
  assert.strictEqual((await request('GET', '/api/clientes', { token: errada })).status, 401);
  assert.strictEqual((await request('GET', '/api/clientes', { token: 'kxi_lixo' })).status, 401);
  const time = async t => { const s = process.hrtime.bigint(); try { await authOf(t); } catch (_) {} return Number(process.hrtime.bigint() - s) / 1e6; };
  const med = async t => { const xs = []; for (let i = 0; i < 5; i++) xs.push(await time(t)); return xs.sort((a, b) => a - b)[2]; };
  const [tA, tB] = [await med(inexistente), await med(errada)];
  const ratio = Math.max(tA, tB) / Math.min(tA, tB);
  assert.ok(ratio < 2, `tempos divergentes: inexistente=${tA.toFixed(1)}ms errada=${tB.toFixed(1)}ms`);
});
test('I07 rotação: nova ativa, antiga na janela, máx. duas válidas; expirada → 401', async () => {
  const r2 = await request('POST', `/api/admin/integrations/${integ.id}/credentials`, { token: jwt('admin') });
  const secret2 = r2.data.data.secret;
  assert.strictEqual((await request('GET', '/api/clientes', { token: secret1 })).status, 200, 'antiga vale na janela');
  assert.strictEqual((await request('GET', '/api/clientes', { token: secret2 })).status, 200);
  const r3 = await request('POST', `/api/admin/integrations/${integ.id}/credentials`, { token: jwt('admin') });
  const validas = store.db.integration_credentials.filter(c => c.integration_id === integ.id && !c.revoked_at && (!c.expires_at || Date.parse(c.expires_at) > Date.now()));
  assert.strictEqual(validas.length, 2, 'no máximo duas válidas');
  assert.strictEqual((await request('GET', '/api/clientes', { token: secret1 })).status, 401, 'terceira rotação revoga a mais antiga');
  const c2 = store.db.integration_credentials.find(c => secret2.includes(c.id));
  c2.expires_at = new Date(Date.now() - 1000).toISOString();
  assert.strictEqual((await request('GET', '/api/clientes', { token: secret2 })).status, 401, 'fim da janela → 401');
  secret1 = r3.data.data.secret;
});
test('I08 revogação emergencial é imediata', async () => {
  const credId = /^kxi_(.{36})_/.exec(secret1)[1];
  const r = await request('POST', `/api/admin/integrations/${integ.id}/credentials/${credId}/revoke`, { token: jwt('admin') });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await request('GET', '/api/clientes', { token: secret1 })).status, 401);
});
test('I09 auditoria registra integration_id nas requisições e eventos de credencial', async () => {
  const ev = store.db.integration_audit_events.filter(e => e.integration_id === integ.id).map(e => e.evento);
  for (const e of ['credential_created', 'request', 'credential_revoked', 'auth_rejected', 'scopes_changed']) assert.ok(ev.includes(e), `sem evento ${e}`);
  assert.ok(!JSON.stringify(store.db.integration_audit_events).includes('kxi_'), 'segredo vazou na auditoria');
});
test('I10 integração inativa → 403', async () => {
  const r = await request('POST', `/api/admin/integrations/${integ.id}/credentials`, { token: jwt('admin') });
  await request('PATCH', `/api/admin/integrations/${integ.id}`, { token: jwt('admin'), body: { status: 'inativo' } });
  assert.strictEqual(code(await request('GET', '/api/clientes', { token: r.data.data.secret })), 'INTEGRATION_INACTIVE');
});

// ---------- coexistência ----------
test('C01 legado: só empresa_id do servidor, nada de usuário nem de integração; não administra', async () => {
  const a = await authOf(LEGACY);
  assert.strictEqual(a.principal_type, 'legacy'); assert.strictEqual(a.empresa_id, env.DEFAULT_EMPRESA_ID);
  assert.strictEqual(a.user_id, null); assert.strictEqual(a.actor_id, null); assert.strictEqual(a.role, null);
  assert.ok(!('integration_id' in a) && !('scopes' in a));
  assert.strictEqual(code(await request('GET', '/api/admin/integrations', { token: LEGACY })), 'USER_PRINCIPAL_REQUIRED');
});
test('C02 usuário nunca tem formato de integração', async () => {
  const u = await authOf(jwt('admin'));
  assert.strictEqual(u.principal_type, 'user');
  assert.ok(!('integration_id' in u) && !('scopes' in u));
});
test('C03 LEGACY_TOKEN_AUTH_ENABLED=false rejeita o token legado correto', async () => {
  env.LEGACY_TOKEN_AUTH_ENABLED = false;
  try {
    const r = await request('GET', '/api/clientes', { token: LEGACY });
    assert.strictEqual(r.status, 401); assert.strictEqual(code(r), 'LEGACY_AUTH_DISABLED');
    assert.strictEqual((await request('GET', '/api/clientes', { token: jwt('admin') })).status, 200, 'JWT segue funcionando');
  } finally { env.LEGACY_TOKEN_AUTH_ENABLED = true; }
});
test('C04 métricas de adoção contam cada principal', async () => {
  const r = await request('GET', '/api/admin/auth-metrics', { token: jwt('admin') });
  for (const k of ['legacy', 'user', 'integration', 'rejected']) assert.ok(r.data.data[k] > 0, `métrica ${k}`);
  assert.ok(metrics.tenantSelectionDenied > 0);
});
test('C05 toda rota de negócio declara authorize (nenhuma rota sem RBAC)', async () => {
  const src = require('fs').readFileSync(require.resolve('../src/routes/index.js'), 'utf8');
  const semRbac = src.split('\n').filter(l => /^router\.(get|post|patch|put|delete)\(/.test(l) && !l.includes('authorize('));
  assert.deepStrictEqual(semRbac, []);
  const servicos = ['InsightsService', 'RetentionService'].map(f => require('fs').readFileSync(require.resolve(`../src/services/${f}.js`), 'utf8'));
  assert.ok(servicos.every(s => !s.includes('new SupabaseRepository()')), 'serviço sem tenant explícito');
});

(async () => {
  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const origErr = console.error; const origWarn = console.warn;
  console.error = () => {}; console.warn = () => {};
  let passed = 0; const fails = [];
  for (const t of tests) {
    try { await t.fn(); passed++; process.stdout.write(`✓ ${t.name}\n`); }
    catch (err) { fails.push(t.name); process.stdout.write(`✗ ${t.name}\n  ${err.message}\n`); }
  }
  console.error = origErr; console.warn = origWarn;
  server.close();
  console.log(`\nIdentity Gate: ${passed}/${tests.length} testes verdes.`);
  if (fails.length) process.exit(1);
})();

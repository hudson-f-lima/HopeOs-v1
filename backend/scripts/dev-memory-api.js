// API real (Express + rotas + engines + auth/RBAC) com banco e provedor de identidade
// em memória, para validar a PWA ponta a ponta sem Supabase. Dados sintéticos,
// sem PII. Só para dev/QA — nunca em produção.
//
//   node backend/scripts/dev-memory-api.js            # API em http://127.0.0.1:3399/api
//   python3 -m http.server 5599 --bind 127.0.0.1      # na raiz, serve a PWA
//   abrir http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api
//
// Logins (senha dev12345): admin@dev.local, recepcao@dev.local, profissional@dev.local
// Token legado (modo antigo): ?apiToken=dev
// GET /__db/:tabela devolve o estado em memória (para asserts de E2E).
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'dev';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'dev-memory';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://127.0.0.1:5599';

const { randomUUID, randomBytes } = require('crypto');
const { env } = require('../src/config/env');
const { agoraNoFuso } = require('../src/engines/SlotEngine');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { setAuthProvider } = require('../src/auth/provider');
const { createAppError } = require('../src/errors');

const E = env.DEFAULT_EMPRESA_ID;
const PROF = 'aaaaaaaa-0000-4000-8000-000000000001';
const PROF2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const CORTE = 'bbbbbbbb-0000-4000-8000-000000000001';
const BARBA = 'bbbbbbbb-0000-4000-8000-000000000002';
const CLIENTE = 'cccccccc-0000-4000-8000-000000000001';
const UNIDADE = 'ffffffff-0000-4000-8000-000000000001';
const dia = { ativo: true, inicio: '09:00', fim: '13:00' };
const semana = { dom: dia, seg: dia, ter: dia, qua: dia, qui: dia, sex: dia, sab: dia };
const hoje = agoraNoFuso(env.APP_TIMEZONE).data;

const db = installMemoryBackend({
  empresas: [{ id: E, nome: 'Salão Dev', slot_padrao: 30, horario_por_dia: {}, intervalo_almoco: false }],
  clientes: [{ id: CLIENTE, empresa_id: E, nome: 'Cliente Teste', ativo: true }],
  servicos: [
    { id: CORTE, empresa_id: E, nome: 'Corte', valor_centavos: 6000, duracao_min: 60, ativo: true },
    { id: BARBA, empresa_id: E, nome: 'Barba', valor_centavos: 4000, duracao_min: 30, ativo: true }
  ],
  profissionais: [
    { id: PROF, empresa_id: E, nome: 'Ana', ativo: true, horario: semana, overrides: { [CORTE]: { duracao_min: 45 } } },
    { id: PROF2, empresa_id: E, nome: 'Bruno', ativo: true, horario: semana, overrides: {} }
  ],
  profissional_servicos: [
    { empresa_id: E, profissional_id: PROF, servico_id: CORTE },
    { empresa_id: E, profissional_id: PROF, servico_id: BARBA },
    { empresa_id: E, profissional_id: PROF2, servico_id: CORTE }
  ],
  agendamentos: [
    { id: randomUUID(), empresa_id: E, profissional_id: PROF, servico_id: BARBA, cliente_id: CLIENTE, data: hoje, horario: '10:00:00', duracao_min: 30, status: 'agendado', valor_centavos: 4000 },
    { id: randomUUID(), empresa_id: E, profissional_id: PROF2, servico_id: CORTE, cliente_id: CLIENTE, data: hoje, horario: '11:00:00', duracao_min: 60, status: 'agendado', valor_centavos: 6000 }
  ],
  produtos: [], formas_pagamento: [], lista_espera: []
});

const contas = [
  { email: 'admin@dev.local', nome: 'Admin Dev', role: 'admin' },
  { email: 'recepcao@dev.local', nome: 'Recepção Dev', role: 'recepcao' },
  { email: 'profissional@dev.local', nome: 'Ana (profissional)', role: 'profissional', profissional_id: PROF }
].map(c => ({ ...c, id: randomUUID() }));

const store = createMemoryIdentityStore({
  app_users: contas.map(c => ({ id: c.id, email: c.email, nome: c.nome, ativo: true })),
  unidades: [{ id: UNIDADE, empresa_id: E, nome: 'Unidade principal', ativo: true }],
  empresa_memberships: contas.map(c => ({ id: randomUUID(), empresa_id: E, user_id: c.id, role: c.role, status: 'ativo', profissional_id: c.profissional_id || null }))
});
store.db.membership_units = store.db.empresa_memberships.filter(m => ['recepcao', 'profissional'].includes(m.role)).map(m => ({ membership_id: m.id, unit_id: UNIDADE }));
setIdentityStore(store);

// Provedor fake: tokens opacos no formato JWT, expiram em 1h.
const sessoes = new Map();
const novaSessao = conta => {
  const access = `dev.${randomBytes(18).toString('base64url')}.sig`;
  const refresh = randomBytes(24).toString('base64url');
  sessoes.set(access, { userId: conta.id, exp: Date.now() + 3600e3 });
  sessoes.set(`r:${refresh}`, { userId: conta.id });
  return { access_token: access, refresh_token: refresh, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: conta.id, email: conta.email } };
};
const invalida = () => createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
setAuthProvider({
  async getUser(token) {
    const s = sessoes.get(token);
    if (!s || s.exp < Date.now()) throw invalida();
    const c = contas.find(x => x.id === s.userId);
    return { id: c.id, email: c.email };
  },
  async signIn(email, password) {
    const c = contas.find(x => x.email === email);
    if (!c || password !== 'dev12345') throw invalida();
    return novaSessao(c);
  },
  async refresh(rt) {
    const s = sessoes.get(`r:${rt}`);
    if (!s) throw invalida();
    sessoes.delete(`r:${rt}`);
    return novaSessao(contas.find(x => x.id === s.userId));
  },
  async signOut(token) { sessoes.delete(token); }
});

const { app } = require('../src/app');
app.get('/__db/:tabela', (req, res) => res.json(db[req.params.tabela] || store.db[req.params.tabela] || []));
const port = Number(process.env.PORT || 3399);
app.listen(port, '127.0.0.1', () => console.log(`dev-memory-api em http://127.0.0.1:${port}/api — logins *@dev.local / dev12345, token legado: ${process.env.API_ACCESS_TOKEN}`));

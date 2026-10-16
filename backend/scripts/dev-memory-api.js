// API real (Express + rotas + engines) com repositório em memória, para validar
// a PWA ponta a ponta sem Supabase. Dados sintéticos, sem PII. Só para dev/QA.
//
//   node backend/scripts/dev-memory-api.js            # API em http://127.0.0.1:3399/api
//   python3 -m http.server 5599 --bind 127.0.0.1      # na raiz, serve a PWA
//   abrir http://127.0.0.1:5599/index.html?apiBase=http://127.0.0.1:3399/api&apiToken=dev
//
// GET /__db/:tabela devolve o estado em memória (para asserts de E2E).
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'dev';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'dev-memory';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://127.0.0.1:5599';

const { randomUUID } = require('crypto');
const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
const { env } = require('../src/config/env');
const { agoraNoFuso } = require('../src/engines/SlotEngine');

const E = env.DEFAULT_EMPRESA_ID;
const PROF = 'aaaaaaaa-0000-4000-8000-000000000001';
const CORTE = 'bbbbbbbb-0000-4000-8000-000000000001';
const BARBA = 'bbbbbbbb-0000-4000-8000-000000000002';
const CLIENTE = 'cccccccc-0000-4000-8000-000000000001';
const dia = { ativo: true, inicio: '09:00', fim: '13:00' };
const hoje = agoraNoFuso(env.APP_TIMEZONE).data;

const db = {
  empresas: [{ id: E, nome: 'Salão Dev', slot_padrao: 30, horario_por_dia: {}, intervalo_almoco: false }],
  clientes: [{ id: CLIENTE, empresa_id: E, nome: 'Cliente Teste', ativo: true }],
  servicos: [
    { id: CORTE, empresa_id: E, nome: 'Corte', valor_centavos: 6000, duracao_min: 60, ativo: true },
    { id: BARBA, empresa_id: E, nome: 'Barba', valor_centavos: 4000, duracao_min: 30, ativo: true }
  ],
  profissionais: [{
    id: PROF, empresa_id: E, nome: 'Ana', ativo: true,
    horario: { dom: dia, seg: dia, ter: dia, qua: dia, qui: dia, sex: dia, sab: dia },
    overrides: { [CORTE]: { duracao_min: 45 } }
  }],
  profissional_servicos: [
    { empresa_id: E, profissional_id: PROF, servico_id: CORTE },
    { empresa_id: E, profissional_id: PROF, servico_id: BARBA }
  ],
  agendamentos: [{ id: randomUUID(), empresa_id: E, profissional_id: PROF, servico_id: BARBA, cliente_id: CLIENTE, data: hoje, horario: '10:00:00', duracao_min: 30, status: 'agendado', valor_centavos: 4000 }],
  produtos: [], formas_pagamento: [], lista_espera: []
};

const match = (row, filters) => Object.entries(filters).every(([k, v]) => v === undefined || String(row[k]) === String(v));
const scoped = (repo, t) => (db[t] || []).filter(r => !('empresa_id' in r) || r.empresa_id === repo.empresaId || t === 'empresas');

SupabaseRepository.prototype.list = async function (t, f = {}) { return scoped(this, t).filter(r => match(r, f)); };
SupabaseRepository.prototype.getByIdScoped = async function (t, id) { return scoped(this, t).find(r => r.id === id) || null; };
SupabaseRepository.prototype.insert = async function (t, p) {
  const { empresa_id, empresaId, ...rest } = p; // mesma invariante do repositório real
  const row = { id: randomUUID(), ...rest, empresa_id: this.empresaId };
  (db[t] = db[t] || []).push(row);
  return row;
};
SupabaseRepository.prototype.update = async function (t, id, p) {
  const row = scoped(this, t).find(r => r.id === id);
  if (row) Object.assign(row, p);
  return row || null;
};
SupabaseRepository.prototype.updateScoped = SupabaseRepository.prototype.update;

const { app } = require('../src/app');
app.get('/__db/:tabela', (req, res) => res.json(db[req.params.tabela] || []));
const port = Number(process.env.PORT || 3399);
app.listen(port, '127.0.0.1', () => console.log(`dev-memory-api em http://127.0.0.1:${port}/api (token: ${process.env.API_ACCESS_TOKEN})`));

// Backend em memória para testes e dev: substitui o acesso ao Supabase do
// SupabaseRepository mantendo as regras que vivem no banco (tenant no insert,
// conflito atômico de agenda, autoria nos wrappers). NUNCA usar em produção.
const { randomUUID } = require('crypto');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { findScheduleConflicts } = require('../engines/ScheduleEngine');
const { createAppError } = require('../errors');

function installMemoryBackend(seed = {}) {
  const db = { autoria_eventos: [], ...seed };
  const rows = t => (db[t] = db[t] || []);
  const match = (row, filters) => Object.entries(filters).every(([k, v]) => v === undefined || v === null || v === '' || String(row[k]) === String(v));
  const P = SupabaseRepository.prototype;

  P.list = async function (t, f = {}) { return rows(t).filter(r => match(r, f)); };
  P.getByIdScoped = async function (t, id) { return rows(t).find(r => r.id === id && r.empresa_id === this.empresaId) || null; };
  P.insert = async function (t, p) {
    if (!this.empresaId) throw createAppError('TENANT_CONTEXT_MISSING', 'Contexto de tenant ausente.', 500);
    const { empresa_id, empresaId, ...rest } = p;
    const row = { id: p.id || randomUUID(), ...rest, empresa_id: this.empresaId };
    rows(t).push(row);
    return row;
  };
  P.insertScoped = P.insert;
  P.updateScoped = async function (t, id, p) {
    const row = rows(t).find(r => r.id === id && r.empresa_id === this.empresaId);
    if (!row) { const err = new Error('0 rows'); err.code = 'PGRST116'; throw err; }
    return Object.assign(row, p);
  };
  P.update = P.updateScoped;
  P.criarAgendamento = async function ({ agendamento, permitirConflito, ignorarId, createdBy }) {
    if (!permitirConflito) {
      const conflitos = findScheduleConflicts({
        agendamento: { id: ignorarId, profissionalId: agendamento.profissional_id, data: agendamento.data, horario: agendamento.horario, duracaoMin: agendamento.duracao_min },
        existing: rows('agendamentos').filter(a => a.empresa_id === this.empresaId)
      });
      if (conflitos.length) {
        throw createAppError('SCHEDULE_CONFLICT', 'Conflito de agenda para o profissional neste horário.', 409, {
          conflitos: conflitos.map(c => ({ id: c.id, horario: c.horario, duracaoMin: c.duracao_min, status: c.status }))
        });
      }
    }
    return this.insert('agendamentos', { ...agendamento, created_by: createdBy });
  };
  const registrarAutoria = (empresaId, evento, autoria) => {
    const ev = { id: randomUUID(), empresa_id: empresaId, evento, actor_id: autoria.actorId || null, actor_integration_id: autoria.integrationId || null };
    db.autoria_eventos.push(ev);
    return ev;
  };
  P.adjustProdutoEstoque = async function (produtoId, payload, autoria = {}) {
    const prod = rows('produtos').find(r => r.id === produtoId && r.empresa_id === this.empresaId);
    if (!prod) throw createAppError('PRODUCT_NOT_FOUND', 'Produto não encontrado.', 422);
    const delta = payload.tipo === 'perda' ? -payload.quantidade : payload.quantidade;
    prod.estoque_atual = (prod.estoque_atual || 0) + delta;
    return { movimento: registrarAutoria(this.empresaId, 'estoque_ajuste', autoria), saldo: prod.estoque_atual };
  };
  P.createProdutoComEstoque = async function (payload, autoria = {}) {
    const prod = await this.insert('produtos', { ...payload.produto, estoque_atual: payload.estoqueInicial || 0 });
    registrarAutoria(this.empresaId, 'produto_criado', autoria);
    return prod;
  };
  P.saveCheckoutClose = async function ({ preview, autoria = {} }) {
    const comando = await this.insert('comandos', { status: 'fechado', actor_id: autoria.actorId || null, actor_integration_id: autoria.integrationId || null });
    return { comandoId: comando.id, preview: Boolean(preview) };
  };
  return db;
}

module.exports = { installMemoryBackend };

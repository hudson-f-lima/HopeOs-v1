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
  P.listPagamentosDasComandas = async function (ids) {
    const set = new Set(ids || []);
    return rows('comando_pagamentos').filter(r => r.empresa_id === this.empresaId && set.has(r.comando_id));
  };
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
  P.updateEmpresa = async function (patch) {
    const row = rows('empresas').find(r => r.id === this.empresaId);
    if (!row) { const err = new Error('0 rows'); err.code = 'PGRST116'; throw err; }
    const { id, empresa_id, ...safe } = patch;
    return Object.assign(row, safe);
  };
  P.createFormaPagamento = async function (payload) {
    if (rows('formas_pagamento').some(f => f.empresa_id === this.empresaId && f.code === payload.code)) {
      throw createAppError('PAYMENT_METHOD_ALREADY_EXISTS', `Forma de pagamento ja existe: ${payload.code}`, 409, { code: payload.code });
    }
    const row = { ...payload, empresa_id: this.empresaId };
    rows('formas_pagamento').push(row);
    return row;
  };
  P.replaceProfissionalServicos = async function (profissionalId, servicoIds) {
    db.profissional_servicos = rows('profissional_servicos').filter(v => !(v.empresa_id === this.empresaId && v.profissional_id === profissionalId))
      .concat(servicoIds.map(servico_id => ({ empresa_id: this.empresaId, profissional_id: profissionalId, servico_id })));
    return { profissionalId, servicoIds, total: servicoIds.length };
  };
  P.setProfissionalServicoOverride = async function (profissionalId, servicoId, payload) {
    const prof = rows('profissionais').find(p => p.id === profissionalId && p.empresa_id === this.empresaId);
    if (!prof) throw createAppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.', 422);
    const overrides = { ...(prof.overrides || {}) };
    if (payload.remover) delete overrides[servicoId]; else overrides[servicoId] = payload.override;
    prof.overrides = overrides;
    return { profissionalId, servicoId, overrides };
  };
  P.criarAgendamento = async function ({ agendamento, permitirConflito, ignorarId, createdBy }) {
    if (!permitirConflito) {
      const empresa = rows('empresas').find(e => e.id === this.empresaId) || {};
      const conflitos = findScheduleConflicts({
        agendamento: { id: ignorarId, profissionalId: agendamento.profissional_id, data: agendamento.data, horario: agendamento.horario, duracaoMin: agendamento.duracao_min },
        existing: rows('agendamentos').filter(a => a.empresa_id === this.empresaId),
        bufferMin: Number(empresa.buffer_min) || 0
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
  // Espelha o que o RPC checkout_close grava (migration 003): comanda com data e
  // totais, um comando_pagamentos e um caixa_movimentos por pagamento. Data padrão
  // = current_date do Postgres (UTC no Supabase), como no RPC.
  P.saveCheckoutClose = async function ({ payload = {}, resolved = {}, preview, autoria = {} }) {
    const t = (preview && preview.totals) || {};
    const data = payload.data || resolved.data || new Date().toISOString().slice(0, 10);
    const comando = await this.insert('comandos', {
      status: 'fechado', data, cliente_id: payload.clienteId || null,
      gorjeta_bruta_centavos: t.gorjetaBrutaCentavos || 0,
      total_recebido_centavos: t.totalRecebidoCentavos || 0,
      taxa_total_centavos: t.taxaTotalCentavos || 0,
      total_gorjeta_liquida_centavos: t.totalGorjetaLiquidaCentavos || 0,
      receita_empresa_centavos: t.receitaEmpresaCentavos || 0,
      actor_id: autoria.actorId || null, actor_integration_id: autoria.integrationId || null
    });
    for (const p of (preview && preview.payments) || []) {
      await this.insert('comando_pagamentos', {
        comando_id: comando.id, forma_code: p.formaCode, valor_centavos: p.valorCentavos || 0,
        taxa_pct: p.taxaPct || 0, taxa_fixa_centavos: p.taxaFixaCentavos || 0, taxa_total_centavos: p.taxaTotalCentavos || 0,
        taxa_servico_centavos: p.taxaServicoCentavos || 0, taxa_gorjeta_centavos: p.taxaGorjetaCentavos || 0
      });
      await this.insert('caixa_movimentos', {
        comando_id: comando.id, data, tipo: 'entrada_pagamento', forma_code: p.formaCode,
        valor_centavos: p.valorCentavos || 0, descricao: 'Entrada de checkout fechado'
      });
    }
    return { comandoId: comando.id, preview: Boolean(preview) };
  };
  return db;
}

module.exports = { installMemoryBackend };

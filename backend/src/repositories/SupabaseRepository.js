const { randomUUID } = require('crypto');
const { getSupabase } = require('../db/supabaseClient');
const { env } = require('../config/env');
const { createAppError } = require('../errors');

// SQLSTATE HS4xx da RPC comanda_estornar → status HTTP; a mensagem é o código da API.
const ESTORNO_STATUS = { HS403: 403, HS404: 404, HS409: 409, HS422: 422 };
function mapEstornoError(error) {
  if (ESTORNO_STATUS[error.code]) return createAppError(error.message, error.details || error.message, ESTORNO_STATUS[error.code]);
  // Corrida da mesma idempotencyKey em comandas diferentes: o unique do banco decide.
  if (error.code === '23505') return createAppError('IDEMPOTENCY_MISMATCH', 'idempotencyKey já usada com outro pedido.', 409);
  if (error.code === 'P0001' && /membership/.test(error.message || '')) return createAppError('ESTORNO_FORBIDDEN', error.message, 403);
  return error;
}

class SupabaseRepository {
  constructor(empresaId = env.DEFAULT_EMPRESA_ID) {
    this.supabase = getSupabase();
    this.empresaId = empresaId;
  }

  async list(table, filters = {}) {
    // PostgREST limita a 1000 linhas por chamada por padrao. Sem paginacao aqui,
    // qualquer tabela que cresca alem disso (ex: clientes) silenciosamente perde
    // registros em toda leitura (snapshot, export, GET /catalog, etc), sem erro.
    const PAGE_SIZE = 1000;
    const rows = [];
    let from = 0;
    for (;;) {
      let query = this.supabase.from(table).select('*');
      for (const [key, value] of Object.entries(filters)) {
        if (value !== undefined && value !== null && value !== '') query = query.eq(key, value);
      }
      // Nao ordena por 'id': profissional_servicos e formas_pagamento nao tem essa
      // coluna (chave primaria composta). Tabelas sem 'id' sempre cabem numa unica
      // pagina neste projeto, entao a ordem so importa para tabelas grandes (que tem
      // 'id'), onde o Postgres retorna ordem estavel entre chamadas sequenciais sem
      // escrita concorrente no meio.
      const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return rows;
  }

  // Conta linhas com filtros de igualdade e `coluna >= desde`, sem trazer as linhas (D-062):
  // o teto diário do link público não pode crescer com o histórico do salão.
  async contarDesde(table, filters = {}, coluna, desde) {
    let query = this.supabase.from(table).select('*', { count: 'exact', head: true });
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') query = query.eq(key, value);
    }
    const { count, error } = await query.gte(coluna, desde);
    if (error) throw error;
    return count || 0;
  }

  // Pagamentos de um conjunto de comandas (comando_pagamentos não tem data);
  // sempre filtrado pela empresa do repositório, em lotes para não estourar a URL.
  async listPagamentosDasComandas(comandoIds) {
    const ids = [...new Set((comandoIds || []).filter(Boolean))];
    const rows = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await this.supabase
        .from('comando_pagamentos')
        .select('*')
        .eq('empresa_id', this.empresaId)
        .in('comando_id', ids.slice(i, i + 100));
      if (error) throw error;
      rows.push(...(data || []));
    }
    return rows;
  }

  // Linhas de um conjunto de comandas em qualquer tabela com comando_id (itens,
  // pagamentos, estornos...), sempre filtradas pela empresa do repositório.
  async listDasComandas(table, comandoIds) {
    const ids = [...new Set((comandoIds || []).filter(Boolean))];
    const rows = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await this.supabase
        .from(table)
        .select('*')
        .eq('empresa_id', this.empresaId)
        .in('comando_id', ids.slice(i, i + 100));
      if (error) throw error;
      rows.push(...(data || []));
    }
    return rows;
  }

  async getById(table, id) {
    const { data, error } = await this.supabase.from(table).select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }

  async getByIdScoped(table, id) {
    const rows = await this.list(table, { id, empresa_id: this.empresaId });
    return rows[0] || null;
  }

  async insert(table, payload) {
    if (!this.empresaId || typeof this.empresaId !== 'string') {
      throw createAppError('TENANT_CONTEXT_MISSING', 'Contexto de tenant ausente ou invalido no repositorio; insercao bloqueada.', 500);
    }
    // empresa_id nunca vem do payload: this.empresaId (do req.auth) e a unica autoridade,
    // mesmo que um chamador futuro inclua empresa_id/empresaId no objeto.
    const { empresa_id: _ignoredEmpresaId, empresaId: _ignoredEmpresaIdCamel, ...safePayload } = payload;
    const row = { id: payload.id || randomUUID(), ...safePayload, empresa_id: this.empresaId };
    const { data, error } = await this.supabase.from(table).insert(row).select('*').single();
    if (error) throw error;
    return data;
  }

  async insertScoped(table, payload) {
    const row = { id: payload.id || randomUUID(), ...payload, empresa_id: this.empresaId };
    const { data, error } = await this.supabase.from(table).insert(row).select('*').single();
    if (error) throw error;
    return data;
  }

  async update(table, id, payload) {
    const { data, error } = await this.supabase.from(table).update(payload).eq('id', id).select('*').single();
    if (error) throw error;
    return data;
  }

  // Exclusão sempre restrita à empresa do repositório. Só para configuração (ex.: metas);
  // tabelas do ledger recusam delete por trigger e por permissão.
  async deleteScoped(table, id) {
    const { error } = await this.supabase.from(table).delete().eq('id', id).eq('empresa_id', this.empresaId);
    if (error) throw error;
  }

  async updateScoped(table, id, payload) {
    const { data, error } = await this.supabase
      .from(table)
      .update(payload)
      .eq('id', id)
      .eq('empresa_id', this.empresaId)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  // Compare-and-set do status do agendamento (sem migration): só atualiza se o
  // status atual ainda estiver em `deStatus`. Devolve a linha ou null (0 linhas).
  async atualizarStatusAgendamentoSe(id, deStatus, patch, atendimento) {
    let consulta = this.supabase
      .from('agendamentos')
      .update(patch)
      .eq('id', id)
      .eq('empresa_id', this.empresaId)
      .in('status', deStatus);
    if (atendimento) {
      consulta = consulta.eq('profissional_id', atendimento.profissional_id);
      consulta = atendimento.cliente_id === null ? consulta.is('cliente_id', null) : consulta.eq('cliente_id', atendimento.cliente_id);
    }
    const { data, error } = await consulta.select('*');
    if (error) throw error;
    return (data && data[0]) || null;
  }

  // Compare-and-set genérico (D-055): só atualiza se o status atual ainda estiver em `deStatus`.
  // Dois pedidos ao mesmo tempo: só um recebe a linha; o outro recebe null.
  // Versão da escala (D-058): o maior seq da corrente de eventos de disponibilidade (023). Sobe a
  // cada mudança de escala; agendamento_criar (026) compara com a lida antes de conferir.
  async versaoDisponibilidade() {
    const { data, error } = await this.supabase.from('disponibilidade_eventos').select('seq')
      .eq('empresa_id', this.empresaId).not('seq', 'is', null).order('seq', { ascending: false }).limit(1);
    if (error) {
      if (['42P01', 'PGRST205', '42703'].includes(error.code)) return null; // sem a 013/023: sem versão
      throw error;
    }
    return data && data[0] ? Number(data[0].seq) : 0;
  }

  async atualizarStatusSe(table, id, deStatus, patch) {
    const { data, error } = await this.supabase
      .from(table)
      .update(patch)
      .eq('id', id)
      .eq('empresa_id', this.empresaId)
      .in('status', deStatus)
      .select('*');
    if (error) throw error;
    return (data && data[0]) || null;
  }

  async upsert(table, rows, conflict = 'id') {
    const { data, error } = await this.supabase.from(table).upsert(rows, { onConflict: conflict }).select('*');
    if (error) throw error;
    return data || [];
  }

  // empresas não tem empresa_id: a linha da própria empresa é a de id = this.empresaId.
  async updateEmpresa(patch) {
    if (!this.empresaId) throw createAppError('TENANT_CONTEXT_MISSING', 'Contexto de tenant ausente.', 500);
    const { id: _ignoredId, empresa_id: _ignoredEmpresa, ...safe } = patch;
    const { data, error } = await this.supabase.from('empresas').update(safe).eq('id', this.empresaId).select('*').single();
    if (error) throw error;
    return data;
  }

  async createFormaPagamento(payload) {
    const row = { ...payload, empresa_id: this.empresaId };
    const { data, error } = await this.supabase
      .from('formas_pagamento')
      .insert(row)
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') {
        throw createAppError('PAYMENT_METHOD_ALREADY_EXISTS', `Forma de pagamento ja existe: ${payload.code}`, 409, { code: payload.code });
      }
      throw error;
    }
    return data;
  }

  async updateFormaPagamento(code, payload) {
    const { data, error } = await this.supabase
      .from('formas_pagamento')
      .update(payload)
      .eq('empresa_id', this.empresaId)
      .eq('code', code)
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async replaceProfissionalServicos(profissionalId, servicoIds) {
    const { data, error } = await this.supabase.rpc('profissional_servicos_replace', {
      p_empresa_id: this.empresaId,
      p_profissional_id: profissionalId,
      p_servico_ids: servicoIds
    });
    if (error) throw error;
    return data;
  }

  // autoria = { actorId, integrationId } de autoriaDe(req.auth); gravada pelo wrapper da 007.
  async createProdutoComEstoque(payload, autoria = {}) {
    const { data, error } = await this.supabase.rpc('produto_criar_com_estoque_autoria', {
      p_empresa_id: this.empresaId,
      p_produto: payload.produto,
      p_estoque_inicial: payload.estoqueInicial || 0,
      p_motivo: payload.motivo || null,
      p_actor_id: autoria.actorId || null,
      p_integration_id: autoria.integrationId || null
    });
    if (error) throw error;
    return data;
  }

  async setProfissionalServicoOverride(profissionalId, servicoId, payload) {
    const { data, error } = await this.supabase.rpc('profissional_servico_override_set', {
      p_empresa_id: this.empresaId,
      p_profissional_id: profissionalId,
      p_servico_id: servicoId,
      p_override: payload.remover ? null : payload.override,
      p_remover: !!payload.remover
    });
    if (error) throw error;
    return data;
  }

  async adjustProdutoEstoque(produtoId, payload, autoria = {}) {
    const { data, error } = await this.supabase.rpc('produto_estoque_ajuste_autoria', {
      p_empresa_id: this.empresaId,
      p_produto_id: produtoId,
      p_tipo: payload.tipo,
      p_quantidade: payload.quantidade,
      p_custo_unitario_centavos: payload.custo_unitario_centavos || 0,
      p_motivo: payload.motivo || null,
      p_actor_id: autoria.actorId || null,
      p_integration_id: autoria.integrationId || null
    });
    if (error) throw error;
    return data;
  }

  // Disponibilidade (D-033, migration 013): regras semanais e exceções da empresa. Banco ainda
  // sem a 013 (deploy da API antes da migration): null, e o cálculo usa o horário antigo.
  async carregarDisponibilidade() {
    try {
      const [semanal, excecoes] = await Promise.all([
        this.list('disponibilidade_semanal', { empresa_id: this.empresaId }),
        this.list('disponibilidade_excecoes', { empresa_id: this.empresaId })
      ]);
      return { semanal, excecoes };
    } catch (err) {
      if (['42P01', 'PGRST205', 'PGRST202'].includes(err && err.code)) return null;
      throw err;
    }
  }

  // Link público (016, D-037): a empresa dona do slug, sem contexto de tenant. Só id e
  // liga/desliga; o slug chega já validado pelo formato. Nunca devolve mais de uma linha
  // (índice único), e um slug vazio nunca vira "sem filtro".
  async empresaOnlinePorSlug(slug) {
    if (typeof slug !== 'string' || !slug) return null;
    const { data, error } = await this.supabase.from('empresas').select('id, online_ativo').eq('online_slug', slug).limit(1);
    if (error) throw error;
    return (data && data[0]) || null;
  }

  // Aviso de agendamento online novo (C3, D-038): eventos de um tipo criados a partir de um
  // instante, do mais novo ao mais antigo, com teto (a recepção só precisa dos recentes).
  async eventosAgendaDesde(tipo, desdeIso, limite = 100) {
    if (!this.empresaId) throw createAppError('TENANT_CONTEXT_MISSING', 'Contexto de tenant ausente.', 500);
    const { data, error } = await this.supabase.from('agendamento_eventos').select('*')
      .eq('empresa_id', this.empresaId).eq('tipo', tipo).gte('created_at', desdeIso)
      .order('created_at', { ascending: false }).limit(limite);
    if (error) throw error;
    return data || [];
  }

  // Link pessoal do agendamento (017, D-038): o acesso pelo hash do código, sem contexto de
  // tenant (é ele que diz a empresa). Hash fora do formato nunca vira consulta.
  async acessoPorTokenHash(hash) {
    if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) return null;
    const { data, error } = await this.supabase.from('agendamento_acessos').select('*').eq('token_hash', hash).limit(1);
    if (error) throw error;
    return (data && data[0]) || null;
  }

  // A linha da empresa com a disponibilidade anexada (fonte do SlotEngine e da ocupação).
  async empresaComDisponibilidade() {
    const [[empresa], disponibilidade] = await Promise.all([this.list('empresas', { id: this.empresaId }), this.carregarDisponibilidade()]);
    if (!empresa) return null;
    return disponibilidade ? { ...empresa, disponibilidade } : empresa;
  }

  async definirDisponibilidadeSemanal({ profissionalId = null, periodos, publicar = false, actorId, decisoes = [] }) {
    const { data, error } = await this.supabase.rpc('disponibilidade_semanal_definir', {
      p_empresa_id: this.empresaId, p_profissional_id: profissionalId, p_periodos: periodos, p_publicar: !!publicar, p_actor_id: actorId, p_decisoes: decisoes
    });
    if (error) throw error;
    return data;
  }

  async criarExcecoesDisponibilidade({ excecoes, actorId, decisoes = [] }) {
    const { data, error } = await this.supabase.rpc('disponibilidade_excecoes_criar', {
      p_empresa_id: this.empresaId, p_excecoes: excecoes, p_actor_id: actorId, p_decisoes: decisoes
    });
    if (error) throw error;
    return data;
  }

  // Lote (D-035, migration 015): semanais e exceções numa transação só, pelas funções da 013.
  async aplicarLoteDisponibilidade({ semanais, excecoes, actorId, decisoes = [] }) {
    const { data, error } = await this.supabase.rpc('disponibilidade_lote', {
      p_empresa_id: this.empresaId, p_semanais: semanais, p_excecoes: excecoes, p_actor_id: actorId, p_decisoes: decisoes
    });
    if (error) throw error;
    return data;
  }

  async removerExcecaoDisponibilidade({ id, actorId, decisoes = [] }) {
    const { data, error } = await this.supabase.rpc('disponibilidade_excecao_remover', {
      p_empresa_id: this.empresaId, p_id: id, p_actor_id: actorId, p_decisoes: decisoes
    });
    if (error) throw error;
    return data;
  }

  // D-046, migration 023: encurtar bloqueio/ausência, aceite da escala e conferência da trilha.
  async encurtarExcecaoDisponibilidade({ id, dataInicio, dataFim, inicio = null, fim = null, actorId }) {
    const { data, error } = await this.supabase.rpc('disponibilidade_excecao_encurtar', {
      p_empresa_id: this.empresaId, p_id: id, p_data_inicio: dataInicio, p_data_fim: dataFim, p_inicio: inicio, p_fim: fim, p_actor_id: actorId
    });
    if (error) throw error;
    return data;
  }

  async aceitarEscalaDisponibilidade({ profissionalId, eventoId, actorId }) {
    const { data, error } = await this.supabase.rpc('disponibilidade_escala_aceitar', {
      p_empresa_id: this.empresaId, p_profissional_id: profissionalId, p_actor_id: actorId, p_evento_id: eventoId
    });
    if (error) throw error;
    return data;
  }

  async conferirCadeiaDisponibilidade() {
    const { data, error } = await this.supabase.rpc('disponibilidade_cadeia_conferir', { p_empresa_id: this.empresaId });
    if (error) throw error;
    return data;
  }

  async loadSnapshot() {
    const [empresa, clientes, servicos, produtos, profissionais, profissionalServicos, agendamentos, formasPagamento, comandos, comandoItens, comandoPagamentos, comandoGorjetas, caixaMovimentos, estoqueMovimentos, listaEspera, eventos,
      comandaEstornos, comandaEstornoItens, comandaEstornoPagamentos, comandaEstornoGorjetas] = await Promise.all([
      this.list('empresas', { id: this.empresaId }),
      this.list('clientes', { empresa_id: this.empresaId }),
      this.list('servicos', { empresa_id: this.empresaId }),
      this.list('produtos', { empresa_id: this.empresaId }),
      this.list('profissionais', { empresa_id: this.empresaId }),
      this.list('profissional_servicos', { empresa_id: this.empresaId }),
      this.list('agendamentos', { empresa_id: this.empresaId }),
      this.list('formas_pagamento', { empresa_id: this.empresaId }),
      this.list('comandos', { empresa_id: this.empresaId }),
      this.list('comando_itens', { empresa_id: this.empresaId }),
      this.list('comando_pagamentos', { empresa_id: this.empresaId }),
      this.list('comando_gorjetas', { empresa_id: this.empresaId }),
      this.list('caixa_movimentos', { empresa_id: this.empresaId }),
      this.list('produto_estoque_movimentos', { empresa_id: this.empresaId }),
      this.list('lista_espera', { empresa_id: this.empresaId }),
      this.list('agendamento_eventos', { empresa_id: this.empresaId }),
      ...this.listEstornoTables()
    ]);
    const disponibilidade = await this.carregarDisponibilidade();

    return {
      empresa: empresa[0] ? (disponibilidade ? { ...empresa[0], disponibilidade } : empresa[0]) : null,
      clientes,
      servicos,
      produtos,
      profissionais,
      profissionalServicos,
      agendamentos,
      formasPagamento,
      comandos,
      comandoItens,
      comandoPagamentos,
      comandoGorjetas,
      caixaMovimentos,
      estoqueMovimentos,
      listaEspera,
      eventos,
      comandaEstornos,
      comandaEstornoItens,
      comandaEstornoPagamentos,
      comandaEstornoGorjetas
    };
  }

  // Estornos (migration 009): eventos e linhas, sempre da empresa do repositório.
  listEstornoTables(filters = {}) {
    const f = { ...filters, empresa_id: this.empresaId };
    return ['comanda_estornos', 'comanda_estorno_itens', 'comanda_estorno_pagamentos', 'comanda_estorno_gorjetas'].map(t => this.list(t, f));
  }

  // Estorno de comanda (D-013): tudo dentro da RPC comanda_estornar (lock, saldo,
  // papel no banco, idempotência, caixa negativo, devolução de estoque).
  async estornarComanda(comandoId, payload, actorId) {
    const { data, error } = await this.supabase.rpc('comanda_estornar', {
      p_empresa_id: this.empresaId,
      p_comando_id: comandoId,
      p_payload: payload,
      p_actor_id: actorId
    });
    if (error) throw mapEstornoError(error);
    return data;
  }

  async loadCheckoutContext() {
    const [servicos, produtos, profissionais, profissionalServicos, formasPagamento, cargos, categorias] = await Promise.all([
      this.list('servicos', { empresa_id: this.empresaId }),
      this.list('produtos', { empresa_id: this.empresaId }),
      this.list('profissionais', { empresa_id: this.empresaId }),
      this.list('profissional_servicos', { empresa_id: this.empresaId }),
      this.list('formas_pagamento', { empresa_id: this.empresaId }),
      this.list('cargos', { empresa_id: this.empresaId }),
      this.list('servico_categorias', { empresa_id: this.empresaId })
    ]);
    return { servicos, produtos, profissionais, profissionalServicos, formasPagamento, cargos, categorias };
  }

  async temComandaDoAgendamento(agendamentoId) {
    // Snapshots antigos preservaram maiúsculas e espaços de UUIDs válidos.
    const { data, error } = await this.supabase.from('comandos').select('id')
      .eq('empresa_id', this.empresaId)
      .ilike('snapshot->request->raw->>agendamentoId', `%${agendamentoId}%`)
      .limit(1);
    if (error) throw error;
    return Boolean(data?.length);
  }

  async saveCheckoutClose({ payload, resolved, preview, autoria = {} }) {
    const rpcPayload = {
      id: payload.id || null,
      idempotencyKey: payload.idempotencyKey || payload.idempotency_key || null,
      clienteId: payload.clienteId || payload.cliente_id || null,
      data: payload.data || resolved.data || null,
      hora: payload.hora || resolved.hora || null,
      raw: {
        clienteId: payload.clienteId || payload.cliente_id || null,
        agendamentoId: payload.agendamentoId || null,
        revisaoFinanceira: payload.revisaoFinanceira ?? null,
        itens: payload.itens,
        payments: payload.payments,
        descontoCentavos: payload.descontoCentavos ?? payload.desconto_centavos ?? 0,
        gorjetaCentavos: payload.gorjetaCentavos ?? payload.gorjeta_centavos ?? 0
      }
    };

    const { data, error } = await this.supabase.rpc('checkout_close_autoria', {
      p_empresa_id: this.empresaId,
      p_payload: rpcPayload,
      p_preview: preview,
      p_actor_id: autoria.actorId || null,
      p_integration_id: autoria.integrationId || null
    });
    if (error) throw error;
    return data;
  }

  // Fechamento com uso de plano de assinatura (022): mesmo payload do fechamento de sempre + usos.
  async saveCheckoutCloseAssinatura({ payload, resolved, preview, autoria = {}, usos }) {
    const rpcPayload = {
      id: payload.id || null,
      idempotencyKey: payload.idempotencyKey || payload.idempotency_key || null,
      clienteId: payload.clienteId || payload.cliente_id || null,
      data: payload.data || resolved.data || null,
      hora: payload.hora || resolved.hora || null,
      raw: { clienteId: payload.clienteId || payload.cliente_id || null, agendamentoId: payload.agendamentoId || null,
        revisaoFinanceira: payload.revisaoFinanceira ?? null, itens: payload.itens, payments: payload.payments,
        descontoCentavos: payload.descontoCentavos ?? payload.desconto_centavos ?? 0, gorjetaCentavos: payload.gorjetaCentavos ?? payload.gorjeta_centavos ?? 0 }
    };
    const { data, error } = await this.supabase.rpc('checkout_close_assinatura', {
      p_empresa_id: this.empresaId, p_payload: rpcPayload, p_preview: preview, p_usos: usos,
      p_actor_id: autoria.actorId || null, p_integration_id: autoria.integrationId || null
    });
    if (error) {
      if (error.code === 'P0002') throw createAppError('ASSINATURA_USO_SEM_ITEM', 'Não foi possível ligar o uso do plano ao item da comanda; nada foi gravado.', 409);
      throw error;
    }
    return data;
  }

  // Trilha da agenda (tabela agendamento_eventos da 001). empresa_id sempre de
  // this.empresaId via insert(); quem chama garante que o agendamento é do tenant.
  async registrarEventoAgenda({ agendamentoId, tipo, payload }) {
    return this.insert('agendamento_eventos', {
      agendamento_id: agendamentoId,
      tipo,
      payload: payload || {},
      created_at: new Date().toISOString()
    });
  }

  // Eventos de um agendamento do tenant, do mais antigo para o mais novo
  // (sort estável: empate de created_at mantém a ordem de leitura).
  async listEventosAgenda(agendamentoId) {
    const rows = await this.list('agendamento_eventos', { empresa_id: this.empresaId, agendamento_id: agendamentoId });
    return rows.slice().sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  }

  // Checagem de conflito + insert numa transação sob lock (migration 007):
  // dois pedidos simultâneos para o mesmo horário não gravam os dois.
  // Atendimento com várias etapas (019, D-040): todas ou nenhuma, numa transação no banco.
  // Plano de assinatura + itens + profissionais numa só função do banco (021): tudo ou nada.
  async salvarPlanoAssinatura({ planoId = null, plano, itens, profissionais = [], actorId = null }) {
    const { data, error } = await this.supabase.rpc('assinatura_plano_salvar', {
      p_empresa_id: this.empresaId, p_plano_id: planoId, p_plano: plano, p_itens: itens, p_profissionais: profissionais, p_actor_id: actorId
    });
    if (error) {
      if (error.code === '23505') throw createAppError('PLANO_NOME_DUPLICADO', 'Já existe um plano ativo com esse nome.', 409);
      if (error.code === 'P0002') throw createAppError('PLANO_NAO_ENCONTRADO', 'Plano não encontrado.', 404);
      if (error.code === '23514' || error.code === '22P02') throw createAppError('PLANO_INVALIDO', 'O banco recusou o plano: confira os valores.', 422);
      throw error;
    }
    return data;
  }

  async criarAtendimento({ etapas, createdBy = null }) {
    const { data, error } = await this.supabase.rpc('atendimento_criar', { p_empresa_id: this.empresaId, p_etapas: etapas, p_created_by: createdBy });
    if (error) {
      if (error.code === 'HS412') {
        // 026 (D-058): a escala mudou entre a conferência e a gravação; nada foi gravado.
        throw createAppError('ESCALA_MUDOU', 'A escala mudou enquanto o horário era gravado. Nada ficou reservado: escolha outro horário.', 409);
      }
      if (error.code === 'HS409') {
        let conflitos = [];
        try { conflitos = JSON.parse(error.details || '[]'); } catch (_) { /* detalhe opcional */ }
        throw createAppError('SCHEDULE_CONFLICT', 'Conflito de agenda em uma das etapas.', 409, { conflitos });
      }
      throw error;
    }
    return data;
  }

  async criarAgendamento({ agendamento, permitirConflito = false, ignorarId = null, createdBy = null }) {
    const { data, error } = await this.supabase.rpc('agendamento_criar', {
      p_empresa_id: this.empresaId,
      p_agendamento: agendamento,
      p_permitir_conflito: !!permitirConflito,
      p_ignorar_id: ignorarId,
      p_created_by: createdBy
    });
    if (error) throw erroDaAgenda(error);
    return data;
  }

  // 027 (D-063): cliente (achado ou criado sob trava por salão + número), horário e evento de
  // origem na mesma transação. null = banco sem a 027 (a rota usa o caminho anterior).
  async criarAgendamentoPublico({ numero, clienteId = null, clienteNovo, agendamento, evento }) {
    const { data, error } = await this.supabase.rpc('agendamento_publico_criar', {
      p_empresa_id: this.empresaId, p_numero: numero, p_cliente_id: clienteId,
      p_cliente_novo: clienteNovo, p_agendamento: agendamento, p_evento: evento
    });
    if (error) {
      if (RPC_AUSENTE.includes(error.code)) return null;
      throw erroDaAgenda(error);
    }
    return { agendamento: data.agendamento, clienteId: data.cliente_id, clienteCriado: data.cliente_criado === true, clienteConcorrente: data.cliente_concorrente === true };
  }

  // 027 (D-063): novo horário + original "reagendado" na mesma transação, se o original ainda
  // estiver num dos status de origem (senão AGENDAMENTO_MUDOU). null = banco sem a 027.
  async remarcarAgendamento({ originalId, deStatus, agendamento, permitirConflito = false, createdBy = null }) {
    const { data, error } = await this.supabase.rpc('agendamento_remarcar', {
      p_empresa_id: this.empresaId, p_original_id: originalId, p_de_status: deStatus,
      p_agendamento: agendamento, p_permitir_conflito: !!permitirConflito, p_created_by: createdBy
    });
    if (error) {
      if (RPC_AUSENTE.includes(error.code)) return null;
      throw erroDaAgenda(error);
    }
    return { novo: data.novo, original: data.original };
  }
}

// Função que ainda não existe no banco (migration não aplicada): PostgREST ou Postgres.
const RPC_AUSENTE = ['PGRST202', '42883'];

// Erros das RPCs de agenda (008/026/027) → erro da API. Antes da D-063 o HS412 de
// agendamento_criar saía como 500: só o espelho em memória traduzia.
function erroDaAgenda(error) {
  if (error.code === 'HS409') {
    let conflitos = [];
    try { conflitos = JSON.parse(error.details || '[]'); } catch (_) { /* detalhe opcional */ }
    return createAppError('SCHEDULE_CONFLICT', 'Conflito de agenda para o profissional neste horário.', 409, { conflitos });
  }
  if (error.code === 'HS412') return createAppError('ESCALA_MUDOU', 'A escala mudou enquanto o horário era gravado. Nada ficou reservado: escolha outro horário.', 409);
  if (error.code === 'HS410') return createAppError('AGENDAMENTO_MUDOU', 'Este horário mudou enquanto você remarcava (outra pessoa alterou). Nada foi gravado: confira e tente de novo.', 409);
  return error;
}

module.exports = { SupabaseRepository, mapEstornoError, erroDaAgenda };

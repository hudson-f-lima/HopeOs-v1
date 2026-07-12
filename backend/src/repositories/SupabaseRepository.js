const { randomUUID } = require('crypto');
const { getSupabase } = require('../db/supabaseClient');
const { env } = require('../config/env');
const { createAppError } = require('../errors');

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

  async upsert(table, rows, conflict = 'id') {
    const { data, error } = await this.supabase.from(table).upsert(rows, { onConflict: conflict }).select('*');
    if (error) throw error;
    return data || [];
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

  async createProdutoComEstoque(payload) {
    const { data, error } = await this.supabase.rpc('produto_criar_com_estoque', {
      p_empresa_id: this.empresaId,
      p_produto: payload.produto,
      p_estoque_inicial: payload.estoqueInicial || 0,
      p_motivo: payload.motivo || null
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

  async adjustProdutoEstoque(produtoId, payload) {
    const { data, error } = await this.supabase.rpc('produto_estoque_ajuste', {
      p_empresa_id: this.empresaId,
      p_produto_id: produtoId,
      p_tipo: payload.tipo,
      p_quantidade: payload.quantidade,
      p_custo_unitario_centavos: payload.custo_unitario_centavos || 0,
      p_motivo: payload.motivo || null
    });
    if (error) throw error;
    return data;
  }

  async loadSnapshot() {
    const [empresa, clientes, servicos, produtos, profissionais, profissionalServicos, agendamentos, formasPagamento, comandos, comandoItens, comandoPagamentos, comandoGorjetas, caixaMovimentos, estoqueMovimentos, listaEspera, eventos] = await Promise.all([
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
      this.list('agendamento_eventos', { empresa_id: this.empresaId })
    ]);

    return {
      empresa: empresa[0] || null,
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
      eventos
    };
  }

  async loadCheckoutContext() {
    const [servicos, produtos, profissionais, profissionalServicos, formasPagamento] = await Promise.all([
      this.list('servicos', { empresa_id: this.empresaId }),
      this.list('produtos', { empresa_id: this.empresaId }),
      this.list('profissionais', { empresa_id: this.empresaId }),
      this.list('profissional_servicos', { empresa_id: this.empresaId }),
      this.list('formas_pagamento', { empresa_id: this.empresaId })
    ]);
    return { servicos, produtos, profissionais, profissionalServicos, formasPagamento };
  }

  async saveCheckoutClose({ payload, resolved, preview }) {
    const rpcPayload = {
      id: payload.id || null,
      idempotencyKey: payload.idempotencyKey || payload.idempotency_key || null,
      clienteId: payload.clienteId || payload.cliente_id || null,
      data: payload.data || resolved.data || null,
      hora: payload.hora || resolved.hora || null,
      raw: {
        clienteId: payload.clienteId || payload.cliente_id || null,
        itens: payload.itens,
        payments: payload.payments,
        descontoCentavos: payload.descontoCentavos ?? payload.desconto_centavos ?? 0,
        gorjetaCentavos: payload.gorjetaCentavos ?? payload.gorjeta_centavos ?? 0
      }
    };

    const { data, error } = await this.supabase.rpc('checkout_close', {
      p_empresa_id: this.empresaId,
      p_payload: rpcPayload,
      p_preview: preview
    });
    if (error) throw error;
    return data;
  }
}

module.exports = { SupabaseRepository };

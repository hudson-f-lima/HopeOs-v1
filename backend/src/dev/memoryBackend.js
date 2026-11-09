// Backend em memória para testes e dev: substitui o acesso ao Supabase do
// SupabaseRepository mantendo as regras que vivem no banco (tenant no insert,
// conflito atômico de agenda, autoria nos wrappers). NUNCA usar em produção.
const { randomUUID } = require('crypto');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { findScheduleConflicts } = require('../engines/ScheduleEngine');
const { createAppError } = require('../errors');
const { getIdentityStore } = require('../auth/identityStore');
const clock = require('../config/clock');
const { calcularEstorno } = require('../engines/EstornoEngine');

// JSON com chaves ordenadas: o "hash" do pedido não depende da ordem das chaves (como o jsonb).
const canonico = v => Array.isArray(v) ? `[${v.map(canonico).join(',')}]`
  : (v && typeof v === 'object') ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`
  : JSON.stringify(v);

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
  P.listDasComandas = async function (t, ids) {
    const set = new Set(ids || []);
    return rows(t).filter(r => r.empresa_id === this.empresaId && set.has(r.comando_id));
  };
  P.getByIdScoped =async function (t, id) { return rows(t).find(r => r.id === id && r.empresa_id === this.empresaId) || null; };
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
  P.atualizarStatusAgendamentoSe = async function (id, deStatus, p) {
    const row = rows('agendamentos').find(r => r.id === id && r.empresa_id === this.empresaId && deStatus.includes(r.status));
    return row ? Object.assign(row, p) : null;
  };

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
  // totais, itens, um comando_pagamentos e um caixa_movimentos por pagamento,
  // gorjetas e baixa de estoque de produto. Data padrão = current_date (UTC), como no RPC.
  // Como no RPC: idempotencyKey (ou id) já usada devolve a comanda existente sem
  // gravar nada; estoque é conferido ANTES de gravar (o RPC é uma transação: falha
  // de estoque não deixa comanda pela metade); o retorno tem o mesmo formato.
  P.saveCheckoutClose = async function ({ payload = {}, resolved = {}, preview, autoria = {} }) {
    const t = (preview && preview.totals) || {};
    const data = payload.data || resolved.data || new Date().toISOString().slice(0, 10);
    const chave = payload.idempotencyKey || payload.idempotency_key || null;
    const existente = rows('comandos').find(c => c.empresa_id === this.empresaId && ((chave && c.idempotency_key === chave) || (payload.id && c.id === payload.id)));
    if (existente) {
      return { idempotent: true, comandoId: existente.id, status: existente.status, message: chave && existente.idempotency_key === chave ? 'Checkout já fechado para esta idempotencyKey.' : 'Checkout já fechado para este id.' };
    }
    const precisa = new Map();
    for (const it of (preview && preview.itens) || []) {
      if ((it.tipo || 'servico') !== 'produto') continue;
      precisa.set(it.produtoId, (precisa.get(it.produtoId) || 0) + Number(it.quantidade || 1));
    }
    for (const [produtoId, qtd] of precisa) {
      const prod = rows('produtos').find(p => p.id === produtoId && p.empresa_id === this.empresaId);
      if (!prod) throw createAppError('BUSINESS_RULE_VIOLATION', `produto não encontrado para baixa de estoque: ${produtoId}`, 422);
      if (prod.ativo === false) throw createAppError('BUSINESS_RULE_VIOLATION', `produto inativo para baixa de estoque: ${produtoId}`, 422);
      if (prod.controla_estoque !== false && Number(prod.estoque_atual || 0) < qtd) throw createAppError('BUSINESS_RULE_VIOLATION', `estoque insuficiente para produto ${produtoId}`, 422);
    }
    const contagem = { itens: 0, pagamentos: 0, gorjetas: 0, caixaMovimentos: 0, estoqueMovimentos: 0 };
    const comando = await this.insert('comandos', {
      ...(payload.id ? { id: payload.id } : {}), idempotency_key: chave,
      status: 'fechado', data, hora: payload.hora || resolved.hora || null, cliente_id: payload.clienteId || null,
      servicos_liquidos_centavos: t.servicosLiquidosCentavos || 0,
      produtos_liquidos_centavos: t.produtosLiquidosCentavos || 0,
      itens_liquidos_centavos: t.itensLiquidosCentavos || 0,
      gorjeta_bruta_centavos: t.gorjetaBrutaCentavos || 0,
      total_recebido_centavos: t.totalRecebidoCentavos || 0,
      taxa_total_centavos: t.taxaTotalCentavos || 0,
      total_comissao_centavos: t.totalComissaoCentavos || 0,
      total_gorjeta_liquida_centavos: t.totalGorjetaLiquidaCentavos || 0,
      receita_empresa_centavos: t.receitaEmpresaCentavos || 0,
      actor_id: autoria.actorId || null, actor_integration_id: autoria.integrationId || null
    });
    for (const it of (preview && preview.itens) || []) {
      const item = await this.insert('comando_itens', {
        comando_id: comando.id, tipo: it.tipo || 'servico', servico_id: it.servicoId || null, produto_id: it.produtoId || null,
        profissional_id: it.profissionalId || null, quantidade: it.quantidade || 1, descricao: it.descricao || null,
        preco_unitario_centavos: it.precoUnitarioCentavos || 0, custo_unitario_centavos: it.custoUnitarioCentavos || 0,
        valor_bruto_centavos: it.valorBrutoCentavos || 0, desconto_centavos: it.descontoCentavos || 0,
        valor_liquido_centavos: it.valorLiquidoCentavos || 0, total_venda_centavos: it.totalVendaCentavos || 0,
        total_custo_centavos: it.totalCustoCentavos || 0, lucro_bruto_centavos: it.lucroBrutoCentavos || 0,
        duracao_min: it.duracaoMin || 0, taxa_item_centavos: it.taxaItemCentavos || 0, comissao_pct: it.comissaoPct || 0,
        comissao_centavos: it.comissaoCentavos || 0, receita_empresa_centavos: it.receitaEmpresaCentavos || 0
      });
      contagem.itens += 1;
      const prod = item.tipo === 'produto' && rows('produtos').find(p => p.id === item.produto_id && p.empresa_id === this.empresaId);
      if (prod && prod.controla_estoque !== false) {
        const antes = Number(prod.estoque_atual || 0);
        if (antes < item.quantidade) throw createAppError('BUSINESS_RULE_VIOLATION', `estoque insuficiente para produto ${prod.id}`, 422);
        prod.estoque_atual = antes - item.quantidade;
        await this.insert('produto_estoque_movimentos', { produto_id: prod.id, comando_id: comando.id, comando_item_id: item.id, tipo: 'venda', quantidade: item.quantidade, saldo_anterior: antes, saldo_posterior: prod.estoque_atual, actor_id: autoria.actorId || null });
        contagem.estoqueMovimentos += 1;
      }
    }
    for (const g of (preview && preview.gorjetas) || []) {
      await this.insert('comando_gorjetas', {
        comando_id: comando.id, profissional_id: g.profissionalId || null, valor_bruto_centavos: g.gorjetaBrutaCentavos || 0,
        taxa_centavos: g.taxaGorjetaCentavos || 0, valor_liquido_centavos: g.gorjetaLiquidaCentavos || 0, regra: g.regra || 'automatic'
      });
      contagem.gorjetas += 1;
    }
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
      contagem.pagamentos += 1; contagem.caixaMovimentos += 1;
    }
    return { idempotent: false, comandoId: comando.id, status: 'fechado', ...contagem };
  };

  // Espelho da RPC comanda_estornar (migration 009): mesma ordem de checagens e os
  // mesmos códigos. Sem advisory lock: não há await entre ler o saldo e gravar.
  const resumoEstorno = (e, idempotent) => {
    const doEvento = t => rows(t).filter(r => r.estorno_id === e.id);
    const ordem = k => (a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0);
    return {
      estornoId: e.id, comandoId: e.comando_id, tipo: e.tipo, motivoCodigo: e.motivo_codigo, data: e.data,
      itensCentavos: e.itens_centavos, custoCentavos: e.custo_centavos, comissaoCentavos: e.comissao_centavos,
      receitaEmpresaCentavos: e.receita_empresa_centavos, gorjetaBrutaCentavos: e.gorjeta_bruta_centavos,
      gorjetaLiquidaCentavos: e.gorjeta_liquida_centavos, reembolsoCentavos: e.reembolso_centavos, actorId: e.actor_id,
      itens: doEvento('comanda_estorno_itens').map(i => ({ comandoItemId: i.comando_item_id, quantidade: i.quantidade, valorLiquidoCentavos: i.valor_liquido_centavos, comissaoCentavos: i.comissao_centavos, devolveEstoque: i.devolve_estoque })).sort(ordem('comandoItemId')),
      reembolsos: doEvento('comanda_estorno_pagamentos').map(p => ({ formaCode: p.forma_code, valorCentavos: p.valor_centavos })).sort(ordem('formaCode')),
      statusComanda: rows('comanda_estornos').some(t => t.comando_id === e.comando_id && t.empresa_id === e.empresa_id && t.tipo === 'total') ? 'estornado' : 'estornado_parcial',
      idempotent
    };
  };
  P.estornarComanda = async function (comandoId, payload, actorId) {
    const E = this.empresaId;
    const hojeUtc = clock.agora().toISOString().slice(0, 10);
    if (!E || !comandoId || !actorId || !payload.idempotencyKey) throw createAppError('ESTORNO_PAYLOAD_INVALIDO', 'empresa, comanda, ator e idempotencyKey obrigatorios', 422);
    if (!payload.data || Math.abs(Date.parse(`${payload.data}T00:00:00Z`) - Date.parse(`${hojeUtc}T00:00:00Z`)) > 864e5) {
      throw createAppError('ESTORNO_DATA_INVALIDA', `data ${payload.data} não é hoje`, 422);
    }
    // Papel conferido "no banco" (aqui: no identity store), além do RBAC da rota.
    const memberships = await getIdentityStore().listMembershipsByUser(actorId);
    const m = memberships.find(x => x.empresa_id === E && x.status === 'ativo');
    if (!m) throw createAppError('ESTORNO_FORBIDDEN', 'ator sem membership ativa na empresa', 403);
    if (!['admin', 'gestor'].includes(m.role)) throw createAppError('ESTORNO_FORBIDDEN', 'só admin ou gestor estornam', 403);

    const { idempotencyKey, data, ...semChave } = payload;
    const hash = canonico({ comandoId, payload: semChave });
    const existente = rows('comanda_estornos').find(e => e.empresa_id === E && e.idempotency_key === idempotencyKey);
    if (existente) {
      if (existente.payload_hash !== hash) throw createAppError('IDEMPOTENCY_MISMATCH', 'idempotencyKey já usada com outro pedido', 409);
      return resumoEstorno(existente, true);
    }
    const comanda = rows('comandos').find(c => c.id === comandoId && c.empresa_id === E);
    if (!comanda) throw createAppError('COMANDA_NOT_FOUND', comandoId, 404);
    const daComanda = t => rows(t).filter(r => r.empresa_id === E && r.comando_id === comandoId);
    const calc = calcularEstorno({
      comanda, pedido: payload, data, hojeUtc,
      itens: daComanda('comando_itens'), pagamentos: daComanda('comando_pagamentos'), gorjetas: daComanda('comando_gorjetas'),
      estornos: daComanda('comanda_estornos'), estornoItens: daComanda('comanda_estorno_itens'),
      estornoPagamentos: daComanda('comanda_estorno_pagamentos'), produtos: rows('produtos').filter(p => p.empresa_id === E)
    });
    const now = clock.agora().toISOString();
    const evento = await this.insert('comanda_estornos', {
      comando_id: comandoId, tipo: payload.tipo, motivo_codigo: payload.motivoCodigo, motivo: payload.motivo, data,
      idempotency_key: idempotencyKey, payload_hash: hash, ...calc.totais, actor_id: actorId, created_at: now
    });
    for (const l of calc.linhas) {
      if (l.devolveEstoque) {
        const prod = rows('produtos').find(p => p.id === l.item.produto_id && p.empresa_id === E);
        const antes = Number(prod.estoque_atual || 0);
        prod.estoque_atual = antes + l.quantidade;
        await this.insert('produto_estoque_movimentos', { produto_id: prod.id, comando_id: comandoId, comando_item_id: l.item.id, tipo: 'devolucao', quantidade: l.quantidade, saldo_anterior: antes, saldo_posterior: prod.estoque_atual, motivo: 'Devolução por estorno de comanda', actor_id: actorId, created_at: now });
      }
      await this.insert('comanda_estorno_itens', { estorno_id: evento.id, comando_id: comandoId, comando_item_id: l.item.id, quantidade: l.quantidade, valor_liquido_centavos: l.valor, comissao_centavos: l.comissao, receita_empresa_centavos: l.receita, custo_centavos: l.custo, devolve_estoque: l.devolveEstoque, created_at: now });
    }
    for (const g of calc.gorjetas) {
      await this.insert('comanda_estorno_gorjetas', { estorno_id: evento.id, comando_id: comandoId, comando_gorjeta_id: g.gorjeta.id || null, profissional_id: g.gorjeta.profissional_id || null, valor_bruto_centavos: g.bruto, valor_liquido_centavos: g.liquido, created_at: now });
    }
    for (const r of calc.reembolsos) {
      await this.insert('comanda_estorno_pagamentos', { estorno_id: evento.id, comando_id: comandoId, forma_code: r.formaCode, valor_centavos: r.valorCentavos, created_at: now });
      await this.insert('caixa_movimentos', { comando_id: comandoId, data, tipo: 'estorno_pagamento', forma_code: r.formaCode, valor_centavos: -r.valorCentavos, descricao: 'Estorno de comanda', created_at: now });
    }
    return resumoEstorno(evento, false);
  };
  return db;
}

module.exports = { installMemoryBackend };

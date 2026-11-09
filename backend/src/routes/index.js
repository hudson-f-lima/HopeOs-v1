const express = require('express');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { loadDataContract } = require('../services/DataContractService');
const { getSnapshot } = require('../services/SnapshotService');
const { buildDashboard } = require('../services/DashboardService');
const { buildFinanceReadModel } = require('../services/FinanceReadModel');
const { previewCheckout } = require('../engines/FinanceEngine');
const { resolveCheckoutInput } = require('../engines/CheckoutInputResolver');
const { validateCheckoutPayload } = require('../validators/checkout.validator');
const { validateCreateAgendamentoPayload, validateStatusChangePayload, validateReagendamentoPayload, validateSlotsQuery, assertTransicaoStatus } = require('../validators/agenda.validator');
const {
  validateUUID,
  validateCreateClientePayload,
  validateUpdateClientePayload,
  validateCreateServicoPayload,
  validateUpdateServicoPayload,
  validateCreateProfissionalPayload,
  validateUpdateProfissionalPayload,
  validateCreateProdutoPayload,
  validateUpdateProdutoPayload,
  validateEstoqueAjustePayload,
  validateCreateFormaPagamentoPayload,
  validateUpdateFormaPagamentoPayload,
  validateProfissionalServicosPayload,
  validateProfissionalServicoOverridePayload,
  validateCreateListaEsperaPayload,
  validateUpdateListaEsperaPayload
} = require('../validators/cadastros.validator');
const { buildSlotsDoDia, resolveDuracaoMin, agoraNoFuso } = require('../engines/SlotEngine');
const { montarLembretes } = require('../engines/ReminderEngine');
const { env } = require('../config/env');
const { createAppError } = require('../errors');
const { InsightsService } = require('../services/InsightsService');
const { RetentionService } = require('../services/RetentionService');

const { authorize, assertOwn } = require('../auth/rbac');
const { assertRefsDaEmpresa } = require('./estrutura');
const { computeCotaParte } = require('../engines/insights/cotaParte');
const { autoriaDe } = require('../middleware/auth');
const { registrarEventoAgenda, montarHistorico } = require('../services/AgendaEventosService');
const { validateEstornoPayload } = require('../validators/estorno.validator');
const { saldoDaComanda, diasEntre, PRAZO_DIAS } = require('../engines/EstornoEngine');
const clock = require('../config/clock');

const router = express.Router();

// Autoria nunca vem do cliente (ADR-005): recusa explícita em qualquer escrita.
const AUTHORSHIP_FIELDS = ['actor_id', 'actorId', 'actor_integration_id', 'integration_id', 'integrationId',
  'created_by', 'createdBy', 'updated_by', 'updatedBy', 'cancelled_by', 'cancelledBy'];
router.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && typeof req.body === 'object') {
    const field = AUTHORSHIP_FIELDS.find(f => Object.prototype.hasOwnProperty.call(req.body, f));
    if (field) return next(createAppError('FORBIDDEN_FIELD', `Campo proibido no payload: ${field}`, 422, { field }));
  }
  next();
});

async function buildServerResolvedCheckout(repo, rawBody) {
  const payload = validateCheckoutPayload(rawBody);
  const context = await repo.loadCheckoutContext();
  const resolved = resolveCheckoutInput({ payload, ...context });
  return { payload, resolved };
}

async function requireActiveEntity(repo, table, id, label, notFoundCode) {
  const rows = await repo.list(table, { id, empresa_id: repo.empresaId });
  const row = rows[0];
  if (!row) throw createAppError(notFoundCode, `${label} não encontrado: ${id}`, 422, { id });
  if (row.ativo === false) throw createAppError(notFoundCode.replace('_NOT_FOUND', '_INACTIVE'), `${label} inativo: ${id}`, 422, { id });
  return row;
}

// Escopo "Próprio" no checkout: toda linha de serviço precisa ser do profissional
// do usuário, e produto só pode ser atribuído a ele (ou a ninguém).
function assertOwnCheckout(req, body) {
  if (!req.authz || !req.authz.own) return;
  const itens = Array.isArray(body && body.itens) ? body.itens : [];
  const servicos = itens.filter(i => (i.tipo || i.type) === 'servico');
  if (!servicos.length) throw createAppError('NOT_OWN_RESOURCE', 'Comanda sem atendimento do próprio profissional.', 403);
  for (const item of itens) {
    const prof = item.profissionalId || item.profissional_id || null;
    const tipo = item.tipo || item.type;
    if (tipo === 'servico' || prof) assertOwn(req, prof);
  }
}

async function requireScopedEntity(repo, table, id, label, notFoundCode) {
  const row = await repo.getByIdScoped(table, id);
  if (!row) throw createAppError(notFoundCode, `${label} não encontrado: ${id}`, 404, { id });
  return row;
}

function assertProdutoEconomics(produto) {
  if (produto.ativo !== false && Number(produto.preco_venda_centavos || 0) < Number(produto.custo_centavos || 0)) {
    throw createAppError('PRODUCT_BELOW_COST', 'Produto ativo nao pode vender abaixo do custo.', 422, {
      custoCentavos: produto.custo_centavos,
      precoVendaCentavos: produto.preco_venda_centavos
    });
  }
}

router.get('/data-contract', authorize('cadastros:read'), (req, res) => {
  res.json({ ok: true, data: loadDataContract() });
});

router.get('/snapshot', authorize('relatorios:full'), async (req, res, next) => {
  try { res.json({ ok: true, data: await getSnapshot(req.auth.empresa_id) }); }
  catch (err) { next(err); }
});

router.get('/dashboard', authorize('relatorios:operacional'), async (req, res, next) => {
  try { res.json({ ok: true, data: buildDashboard(await getSnapshot(req.auth.empresa_id)) }); }
  catch (err) { next(err); }
});

router.get('/financeiro/resumo', authorize('relatorios:full'), async (req, res, next) => {
  try { res.json({ ok: true, data: buildFinanceReadModel(await getSnapshot(req.auth.empresa_id)) }); }
  catch (err) { next(err); }
});

router.get('/clientes', authorize('clientes:read'), async (req, res, next) => {
  try { res.json({ ok: true, data: await new SupabaseRepository(req.auth.empresa_id).list('clientes', { empresa_id: req.auth.empresa_id }) }); }
  catch (err) { next(err); }
});

router.post('/clientes', authorize('clientes:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const payload = validateCreateClientePayload(req.body);
    const { actorId } = autoriaDe(req.auth);
    res.status(201).json({ ok: true, data: await repo.insertScoped('clientes', { ...payload, created_by: actorId }) });
  } catch (err) { next(err); }
});

router.patch('/clientes/:id', authorize('clientes:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    await requireScopedEntity(repo, 'clientes', id, 'Cliente', 'CLIENT_NOT_FOUND');
    const payload = validateUpdateClientePayload(req.body);
    const { actorId } = autoriaDe(req.auth);
    res.json({ ok: true, data: await repo.updateScoped('clientes', id, { ...payload, updated_by: actorId }) });
  } catch (err) { next(err); }
});

router.get('/servicos', authorize('cadastros:read'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    res.json({ ok: true, data: await repo.list('servicos', { empresa_id: repo.empresaId }) });
  }
  catch (err) { next(err); }
});

router.post('/servicos', authorize('cadastros:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const payload = validateCreateServicoPayload(req.body);
    await assertRefsDaEmpresa(repo, payload);
    res.status(201).json({ ok: true, data: await repo.insertScoped('servicos', payload) });
  } catch (err) { next(err); }
});

router.patch('/servicos/:id', authorize('cadastros:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    await requireScopedEntity(repo, 'servicos', id, 'Serviço', 'SERVICE_NOT_FOUND');
    const payload = validateUpdateServicoPayload(req.body);
    await assertRefsDaEmpresa(repo, payload);
    res.json({ ok: true, data: await repo.updateScoped('servicos', id, payload) });
  } catch (err) { next(err); }
});

router.get('/profissionais', authorize('cadastros:read'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    res.json({ ok: true, data: await repo.list('profissionais', { empresa_id: repo.empresaId }) });
  }
  catch (err) { next(err); }
});

router.post('/profissionais', authorize('cadastros:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const payload = validateCreateProfissionalPayload(req.body);
    await assertRefsDaEmpresa(repo, payload);
    res.status(201).json({ ok: true, data: await repo.insertScoped('profissionais', payload) });
  } catch (err) { next(err); }
});

router.patch('/profissionais/:id', authorize('cadastros:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    await requireScopedEntity(repo, 'profissionais', id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    const payload = validateUpdateProfissionalPayload(req.body);
    await assertRefsDaEmpresa(repo, payload);
    res.json({ ok: true, data: await repo.updateScoped('profissionais', id, payload) });
  } catch (err) { next(err); }
});

router.get('/produtos', authorize('cadastros:read'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    res.json({ ok: true, data: await repo.list('produtos', { empresa_id: repo.empresaId }) });
  }
  catch (err) { next(err); }
});

router.post('/produtos', authorize('cadastros:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const { produto, estoqueInicial } = validateCreateProdutoPayload(req.body);
    const data = await repo.createProdutoComEstoque({
      produto,
      estoqueInicial,
      motivo: 'Estoque inicial do cadastro de produto'
    }, autoriaDe(req.auth));
    res.status(201).json({ ok: true, data });
  } catch (err) { next(err); }
});

router.patch('/produtos/:id', authorize('cadastros:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    const existing = await requireScopedEntity(repo, 'produtos', id, 'Produto', 'PRODUCT_NOT_FOUND');
    const payload = validateUpdateProdutoPayload(req.body);
    const merged = { ...existing, ...payload };
    assertProdutoEconomics(merged);
    let data;
    try {
      data = await repo.updateScoped('produtos', id, payload);
    } catch (dbErr) {
      if (dbErr && dbErr.code === '23514') {
        throw createAppError('PRODUCT_BELOW_COST', 'Produto ativo nao pode vender abaixo do custo.', 422, { produtoId: id });
      }
      throw dbErr;
    }
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/produtos/:id/estoque/ajuste', authorize('estoque:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    await requireScopedEntity(repo, 'produtos', id, 'Produto', 'PRODUCT_NOT_FOUND');
    const payload = validateEstoqueAjustePayload(req.body);
    res.status(201).json({ ok: true, data: await repo.adjustProdutoEstoque(id, payload, autoriaDe(req.auth)) });
  } catch (err) { next(err); }
});

router.get('/formas-pagamento', authorize('cadastros:read'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    res.json({ ok: true, data: await repo.list('formas_pagamento', { empresa_id: repo.empresaId }) });
  }
  catch (err) { next(err); }
});

router.post('/formas-pagamento', authorize('cadastros:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const payload = validateCreateFormaPagamentoPayload(req.body);
    const existing = await repo.list('formas_pagamento', { empresa_id: repo.empresaId, code: payload.code });
    if (existing[0]) {
      throw createAppError('PAYMENT_METHOD_ALREADY_EXISTS', `Forma de pagamento ja existe: ${payload.code}. Use PATCH /formas-pagamento/${payload.code} para editar.`, 409, { code: payload.code });
    }
    res.status(201).json({ ok: true, data: await repo.createFormaPagamento(payload) });
  } catch (err) { next(err); }
});

router.patch('/formas-pagamento/:code', authorize('cadastros:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const existing = await repo.list('formas_pagamento', { empresa_id: repo.empresaId, code: req.params.code });
    if (!existing[0]) throw createAppError('PAYMENT_METHOD_NOT_FOUND', `Forma de pagamento não encontrada: ${req.params.code}`, 404, { code: req.params.code });
    const payload = validateUpdateFormaPagamentoPayload(req.body);
    res.json({ ok: true, data: await repo.updateFormaPagamento(req.params.code, payload) });
  } catch (err) { next(err); }
});

router.get('/profissionais/:id/servicos', authorize('cadastros:read'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    await requireScopedEntity(repo, 'profissionais', id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    res.json({ ok: true, data: await repo.list('profissional_servicos', { empresa_id: repo.empresaId, profissional_id: id }) });
  } catch (err) { next(err); }
});

router.put('/profissionais/:id/servicos', authorize('cadastros:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    const profissional = await requireActiveEntity(repo, 'profissionais', id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    const { servicoIds } = validateProfissionalServicosPayload(req.body);
    for (const servicoId of servicoIds) {
      await requireActiveEntity(repo, 'servicos', servicoId, 'Serviço', 'SERVICE_NOT_FOUND');
    }
    const data = await repo.replaceProfissionalServicos(profissional.id, servicoIds);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.patch('/profissionais/:id/servicos/:servicoId/override', authorize('cadastros:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    const servicoId = validateUUID(req.params.servicoId, 'servicoId');
    await requireActiveEntity(repo, 'profissionais', id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    await requireActiveEntity(repo, 'servicos', servicoId, 'Serviço', 'SERVICE_NOT_FOUND');
    const links = await repo.list('profissional_servicos', {
      empresa_id: repo.empresaId,
      profissional_id: id,
      servico_id: servicoId
    });
    if (!links[0]) {
      throw createAppError('SERVICE_NOT_ALLOWED_FOR_PROFESSIONAL', 'Serviço não vinculado ao profissional.', 422, {
        profissionalId: id,
        servicoId: servicoId
      });
    }
    const payload = validateProfissionalServicoOverridePayload(req.body);
    res.json({ ok: true, data: await repo.setProfissionalServicoOverride(id, servicoId, payload) });
  } catch (err) { next(err); }
});

router.get('/agenda', authorize('agenda:read'), async (req, res, next) => {
  try {
    const filters = { empresa_id: req.auth.empresa_id };
    if (req.query.data) filters.data = req.query.data;
    if (req.authz.own) filters.profissional_id = req.authz.profissionalId;
    res.json({ ok: true, data: await new SupabaseRepository(req.auth.empresa_id).list('agendamentos', filters) });
  } catch (err) { next(err); }
});

// Lembretes de confirmação (D-011): agendamentos ainda não confirmados do dia
// (padrão: amanhã no fuso da empresa) com texto e link wa.me. Só leitura.
router.get('/agenda/lembretes', authorize('agenda:read'), async (req, res, next) => {
  try {
    let data = req.query.data;
    if (data === undefined) {
      const hoje = agoraNoFuso(env.APP_TIMEZONE).data;
      const [y, m, d] = hoje.split('-').map(Number);
      data = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data)) || Number.isNaN(Date.parse(`${data}T00:00:00Z`))) {
      throw createAppError('INVALID_DATE', 'data deve estar no formato AAAA-MM-DD.', 422);
    }
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const filtroAgenda = { empresa_id: repo.empresaId, data };
    if (req.authz.own) filtroAgenda.profissional_id = req.authz.profissionalId;
    const [empresas, agendamentos, clientes, servicos, profissionais] = await Promise.all([
      repo.list('empresas', { id: repo.empresaId }),
      repo.list('agendamentos', filtroAgenda),
      repo.list('clientes', { empresa_id: repo.empresaId }),
      repo.list('servicos', { empresa_id: repo.empresaId }),
      repo.list('profissionais', { empresa_id: repo.empresaId })
    ]);
    res.json({ ok: true, data: montarLembretes({ data, agendamentos, clientes, servicos, profissionais, empresa: empresas[0] }) });
  } catch (err) { next(err); }
});

// Sugestão de horários livres (slots-âncora). Somente leitura: o POST /agenda
// continua revalidando conflito na gravação.
router.get('/agenda/slots', authorize('agenda:read'), async (req, res, next) => {
  try {
    const query = validateSlotsQuery(req.query);
    assertOwn(req, query.profissionalId);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const [profissional, servico] = await Promise.all([
      requireActiveEntity(repo, 'profissionais', query.profissionalId, 'Profissional', 'PROFESSIONAL_NOT_FOUND'),
      requireActiveEntity(repo, 'servicos', query.servicoId, 'Serviço', 'SERVICE_NOT_FOUND')
    ]);
    const [empresas, servicos, agendamentos] = await Promise.all([
      repo.list('empresas', { id: repo.empresaId }),
      repo.list('servicos', { empresa_id: repo.empresaId }),
      repo.list('agendamentos', { empresa_id: repo.empresaId, profissional_id: profissional.id, data: query.data })
    ]);
    const result = buildSlotsDoDia({
      data: query.data,
      profissional,
      empresa: empresas[0] || {},
      servico,
      servicosAtivos: servicos.filter(s => s.ativo !== false),
      agendamentos,
      duracaoMin: query.duracaoMin,
      agora: agoraNoFuso(env.APP_TIMEZONE)
    });
    res.json({ ok: true, data: { ...result, profissionalId: profissional.id, servicoId: servico.id } });
  } catch (err) { next(err); }
});

router.post('/agenda', authorize('agenda:write'), async (req, res, next) => {
  try {
    const payload = validateCreateAgendamentoPayload(req.body);
    assertOwn(req, payload.profissionalId);
    const { actorId } = autoriaDe(req.auth);
    const repo = new SupabaseRepository(req.auth.empresa_id);

    if (payload.clienteId) await requireActiveEntity(repo, 'clientes', payload.clienteId, 'Cliente', 'CLIENT_NOT_FOUND');
    const servico = await requireActiveEntity(repo, 'servicos', payload.servicoId, 'Serviço', 'SERVICE_NOT_FOUND');
    const profissional = await requireActiveEntity(repo, 'profissionais', payload.profissionalId, 'Profissional', 'PROFESSIONAL_NOT_FOUND');

    // Mesma regra do GET /agenda/slots: override do profissional > serviço > 30.
    const duracaoMin = resolveDuracaoMin({ servico, profissional, duracaoMin: payload.duracaoMin });

    // Conflito checado e gravado atomicamente no banco (agendamento_criar, migration 007).
    const created = await repo.criarAgendamento({
      agendamento: {
        cliente_id: payload.clienteId,
        servico_id: payload.servicoId,
        profissional_id: payload.profissionalId,
        data: payload.data,
        horario: payload.horario,
        duracao_min: duracaoMin,
        valor_centavos: servico.valor_centavos || 0,
        status: 'agendado'
      },
      permitirConflito: payload.permitirConflito,
      createdBy: actorId
    });
    await registrarEventoAgenda(repo, req.auth, { agendamentoId: created && created.id, tipo: 'criado', de: null, para: (created && created.status) || 'agendado' });

    res.status(201).json({ ok: true, data: created });
  } catch (err) { next(err); }
});

router.patch('/agenda/:id/status', authorize('agenda:write'), async (req, res, next) => {
  try {
    const { novoStatus } = validateStatusChangePayload(req.body);
    const id = validateUUID(req.params.id, 'id');
    const { actorId } = autoriaDe(req.auth);
    const repo = new SupabaseRepository(req.auth.empresa_id);

    const original = await repo.getByIdScoped('agendamentos', id);
    if (!original) throw createAppError('AGENDAMENTO_NOT_FOUND', `Agendamento não encontrado: ${id}`, 404, { id });
    assertOwn(req, original.profissional_id);
    assertTransicaoStatus(original.status, novoStatus);
    // Capturado antes do update: o objeto lido pode ser o mesmo que o update altera.
    const statusAnterior = original.status;

    const now = new Date().toISOString();
    if (novoStatus !== 'reagendado') {
      const patch = { status: novoStatus, updated_at: now, updated_by: actorId };
      if (novoStatus === 'cancelado') patch.cancelled_by = actorId;
      const updated = await repo.updateScoped('agendamentos', original.id, patch);
      await registrarEventoAgenda(repo, req.auth, { agendamentoId: original.id, tipo: 'status', de: statusAnterior, para: novoStatus });
      return res.json({ ok: true, data: { original: updated } });
    }

    const reagendamento = validateReagendamentoPayload(req.body);
    const novoServicoId = reagendamento.novoServicoId || original.servico_id;
    const novoProfissionalId = reagendamento.novoProfissionalId || original.profissional_id;
    assertOwn(req, novoProfissionalId);

    let servico = null;
    if (reagendamento.novoServicoId) servico = await requireActiveEntity(repo, 'servicos', novoServicoId, 'Serviço', 'SERVICE_NOT_FOUND');
    if (reagendamento.novoProfissionalId) await requireActiveEntity(repo, 'profissionais', novoProfissionalId, 'Profissional', 'PROFESSIONAL_NOT_FOUND');

    const duracaoMinNovo = servico ? (servico.duracao_min || original.duracao_min) : original.duracao_min;

    // O original ainda está ativo neste momento: é ignorado na checagem de conflito.
    const novo = await repo.criarAgendamento({
      agendamento: {
        cliente_id: original.cliente_id,
        servico_id: novoServicoId,
        profissional_id: novoProfissionalId,
        data: reagendamento.novaData,
        horario: reagendamento.novoHorario,
        duracao_min: duracaoMinNovo,
        valor_centavos: servico ? (servico.valor_centavos ?? original.valor_centavos) : original.valor_centavos,
        status: 'agendado'
      },
      permitirConflito: reagendamento.permitirConflito,
      ignorarId: original.id,
      createdBy: actorId
    });

    const updatedOriginal = await repo.updateScoped('agendamentos', original.id, { status: 'reagendado', updated_at: now, updated_by: actorId });
    await registrarEventoAgenda(repo, req.auth, {
      agendamentoId: original.id, tipo: 'reagendado', de: statusAnterior, para: 'reagendado',
      extra: { reagendado_para: (novo && novo.id) || null }
    });
    await registrarEventoAgenda(repo, req.auth, {
      agendamentoId: novo && novo.id, tipo: 'reagendado', de: null, para: (novo && novo.status) || 'agendado',
      origem: 'reagendamento', extra: { reagendado_de: original.id }
    });

    res.json({ ok: true, data: { original: updatedOriginal, novo } });
  } catch (err) { next(err); }
});

// Trilha de status do agendamento (agendamento_eventos), do mais antigo ao mais
// novo. Profissional só lê os próprios. Eventos são best-effort: pode haver lacuna.
router.get('/agenda/:id/historico', authorize('agenda:read'), async (req, res, next) => {
  try {
    const id = validateUUID(req.params.id, 'id');
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const agendamento = await requireScopedEntity(repo, 'agendamentos', id, 'Agendamento', 'AGENDAMENTO_NOT_FOUND');
    assertOwn(req, agendamento.profissional_id);
    res.json({ ok: true, data: { agendamentoId: id, statusAtual: agendamento.status, eventos: await montarHistorico(repo, id) } });
  } catch (err) { next(err); }
});

router.patch('/agenda/:id/duracao', authorize('agenda:write'), async (req, res, next) => {
  try {
    const duracaoMin = Number(req.body && req.body.duracaoMin);
    if (!Number.isInteger(duracaoMin) || duracaoMin < 10 || duracaoMin > 480) {
      throw createAppError('INVALID_DURATION', 'Duração deve ser um inteiro entre 10 e 480 minutos.', 422);
    }
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    const agendamento = await requireScopedEntity(repo, 'agendamentos', id, 'Agendamento', 'AGENDAMENTO_NOT_FOUND');
    assertOwn(req, agendamento.profissional_id);
    const { actorId } = autoriaDe(req.auth);
    const duracaoAnterior = agendamento.duracao_min ?? null;
    const updated = await repo.updateScoped('agendamentos', id, {
      duracao_min: duracaoMin,
      updated_at: new Date().toISOString(),
      updated_by: actorId
    });
    await registrarEventoAgenda(repo, req.auth, { agendamentoId: id, tipo: 'duracao', de: duracaoAnterior, para: duracaoMin });
    res.json({ ok: true, data: { id: updated.id, duracaoMin: updated.duracao_min } });
  } catch (err) { next(err); }
});

router.get('/catalog', authorize('clientes:read'), authorize('cadastros:read'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const [clientes, servicos, produtos, profissionais, formas_pagamento, profissional_servicos] = await Promise.all([
      repo.list('clientes', { empresa_id: repo.empresaId }),
      repo.list('servicos', { empresa_id: repo.empresaId }),
      repo.list('produtos', { empresa_id: repo.empresaId }),
      repo.list('profissionais', { empresa_id: repo.empresaId }),
      repo.list('formas_pagamento', { empresa_id: repo.empresaId }),
      repo.list('profissional_servicos', { empresa_id: repo.empresaId })
    ]);
    res.json({ ok: true, data: { clientes, servicos, produtos, profissionais, formas_pagamento, profissional_servicos } });
  } catch (err) { next(err); }
});

router.post('/checkout/preview', authorize('checkout:write'), async (req, res, next) => {
  try {
    assertOwnCheckout(req, req.body);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const { resolved } = await buildServerResolvedCheckout(repo, req.body);
    res.json({ ok: true, data: previewCheckout(resolved) });
  } catch (err) { next(err); }
});

router.post('/checkout/close', authorize('checkout:write'), async (req, res, next) => {
  try {
    assertOwnCheckout(req, req.body);
    const autoria = autoriaDe(req.auth);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const { payload, resolved } = await buildServerResolvedCheckout(repo, req.body);
    // Data/hora da comanda = agora no fuso da empresa, sempre definidas pelo
    // servidor (D-012). Antes: sem data, o RPC usava current_date do Postgres
    // (UTC) e a venda das 21h–24h de Brasília caía no dia seguinte; com data,
    // o cliente podia lançar venda em dia já fechado.
    const agora = agoraNoFuso(env.APP_TIMEZONE);
    const hora = `${String(Math.floor(agora.minuto / 60)).padStart(2, '0')}:${String(agora.minuto % 60).padStart(2, '0')}`;
    payload.data = agora.data; payload.hora = hora;
    resolved.data = agora.data; resolved.hora = hora;
    const preview = previewCheckout(resolved);
    const saved = await repo.saveCheckoutClose({ payload, resolved, preview, autoria });

    // Vínculo opcional checkout → agenda. Não faz parte da RPC nem do ledger:
    // é só uma atualização de status feita depois que o checkout já fechou.
    // Se falhar, não derruba a resposta — a comanda já foi fechada de verdade.
    let agendamentoConcluido = null;
    if (req.body && req.body.agendamentoId) {
      try {
        const agendamentoId = validateUUID(req.body.agendamentoId, 'agendamentoId');
        // Lido também fora do escopo "Próprio" para registrar o status anterior na trilha.
        const ag = await repo.getByIdScoped('agendamentos', agendamentoId);
        if (req.authz.own) assertOwn(req, ag && ag.profissional_id);
        const statusAnterior = ag ? ag.status : null;
        agendamentoConcluido = await repo.updateScoped('agendamentos', agendamentoId, {
          status: 'concluido',
          updated_at: new Date().toISOString(),
          updated_by: autoria.actorId
        });
        if (ag && statusAnterior !== 'concluido') {
          await registrarEventoAgenda(repo, req.auth, { agendamentoId, tipo: 'status', de: statusAnterior, para: 'concluido', origem: 'checkout' });
        }
      } catch (linkErr) {
        console.error('Falha ao marcar agendamento como concluído:', linkErr.message || linkErr);
      }
    }

    res.status(201).json({ ok: true, data: { preview, saved, agendamentoConcluido } });
  } catch (err) { next(err); }
});

// ---------- Estorno de comanda (D-013, migration 009) ----------
// Comandas de um dia com o saldo ainda estornável (tela de gestão).
function validarDataQuery(valor, padrao) {
  if (valor === undefined || valor === '') return padrao;
  const s = String(valor);
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw createAppError('INVALID_DATE', 'data deve estar no formato YYYY-MM-DD.', 422, { field: 'data' });
  }
  return s;
}

function comandaComSaldo(c, ledger, hoje, nomes) {
  const doC = rows => rows.filter(r => r.comando_id === c.id);
  const estornos = doC(ledger.estornos);
  const itens = doC(ledger.itens);
  const pagamentos = doC(ledger.pagamentos);
  const saldo = saldoDaComanda({ itens, pagamentos, estornos, estornoItens: doC(ledger.estornoItens), estornoPagamentos: doC(ledger.estornoPagamentos) });
  const dias = diasEntre(String(c.data), hoje);
  return {
    id: c.id, data: c.data, hora: c.hora || null, clienteId: c.cliente_id || null, clienteNome: nomes.get(c.cliente_id) || null,
    totalRecebidoCentavos: Number(c.total_recebido_centavos || 0),
    status: saldo.status,
    estornavel: saldo.status !== 'estornado' && dias >= 0 && dias <= PRAZO_DIAS,
    prazoAte: addDiasIso(String(c.data), PRAZO_DIAS),
    itens: saldo.porItem.map(s => ({ id: s.item.id, tipo: s.item.tipo, descricao: s.item.descricao || null, quantidade: s.item.quantidade, restante: s.restante, valorLiquidoCentavos: s.item.valor_liquido_centavos })),
    formas: saldo.porForma,
    estornos: estornos.map(e => ({ id: e.id, tipo: e.tipo, data: e.data, motivoCodigo: e.motivo_codigo, reembolsoCentavos: e.reembolso_centavos, createdAt: e.created_at || null }))
  };
}
const addDiasIso = (data, dias) => { const d = new Date(`${data}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };

async function carregarLedgerDasComandas(repo, ids) {
  const [itens, pagamentos, estornos, estornoItens, estornoPagamentos] = await Promise.all(
    ['comando_itens', 'comando_pagamentos', 'comanda_estornos', 'comanda_estorno_itens', 'comanda_estorno_pagamentos'].map(t => repo.listDasComandas(t, ids))
  );
  return { itens, pagamentos, estornos, estornoItens, estornoPagamentos };
}

router.get('/comandas', authorize('relatorios:full'), async (req, res, next) => {
  try {
    const hoje = agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
    const data = validarDataQuery(req.query.data, hoje);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const comandos = await repo.list('comandos', { empresa_id: repo.empresaId, data });
    const [ledger, clientes] = await Promise.all([carregarLedgerDasComandas(repo, comandos.map(c => c.id)), repo.list('clientes', { empresa_id: repo.empresaId })]);
    const nomes = new Map(clientes.map(c => [c.id, c.nome]));
    const lista = comandos.map(c => comandaComSaldo(c, ledger, hoje, nomes))
      .sort((a, b) => String(b.hora || '').localeCompare(String(a.hora || '')));
    res.json({ ok: true, data: { data, hoje, prazoDias: PRAZO_DIAS, comandas: lista } });
  } catch (err) { next(err); }
});

router.get('/comandas/:id/estornos', authorize('relatorios:full'), async (req, res, next) => {
  try {
    const id = validateUUID(req.params.id, 'id');
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const comanda = await repo.getByIdScoped('comandos', id);
    if (!comanda) throw createAppError('COMANDA_NOT_FOUND', 'Comanda não encontrada.', 404, { id });
    const hoje = agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
    const ledger = await carregarLedgerDasComandas(repo, [id]);
    const gorjetas = await repo.listDasComandas('comanda_estorno_gorjetas', [id]);
    const estornos = ledger.estornos.map(e => ({
      id: e.id, tipo: e.tipo, data: e.data, motivoCodigo: e.motivo_codigo, motivo: e.motivo, actorId: e.actor_id, createdAt: e.created_at || null,
      itensCentavos: e.itens_centavos, comissaoCentavos: e.comissao_centavos, receitaEmpresaCentavos: e.receita_empresa_centavos,
      gorjetaBrutaCentavos: e.gorjeta_bruta_centavos, gorjetaLiquidaCentavos: e.gorjeta_liquida_centavos, reembolsoCentavos: e.reembolso_centavos,
      itens: ledger.estornoItens.filter(i => i.estorno_id === e.id).map(i => ({ comandoItemId: i.comando_item_id, quantidade: i.quantidade, valorLiquidoCentavos: i.valor_liquido_centavos, comissaoCentavos: i.comissao_centavos, devolveEstoque: i.devolve_estoque })),
      reembolsos: ledger.estornoPagamentos.filter(p => p.estorno_id === e.id).map(p => ({ formaCode: p.forma_code, valorCentavos: p.valor_centavos })),
      gorjetas: gorjetas.filter(g => g.estorno_id === e.id).map(g => ({ profissionalId: g.profissional_id, valorBrutoCentavos: g.valor_bruto_centavos, valorLiquidoCentavos: g.valor_liquido_centavos }))
    })).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    res.json({ ok: true, data: { comanda: comandaComSaldo(comanda, ledger, hoje, new Map()), estornos } });
  } catch (err) { next(err); }
});

// Só admin/gestor humanos (checkout:estornar é userOnly). Data = hoje no fuso da
// empresa, definida aqui; o banco recusa outra data, prazo > 30 dias e saldo excedido.
router.post('/comandas/:id/estorno', authorize('checkout:estornar'), async (req, res, next) => {
  try {
    const id = validateUUID(req.params.id, 'id');
    const pedido = validateEstornoPayload(req.body);
    const autoria = autoriaDe(req.auth);
    if (!autoria.actorId) throw createAppError('USER_PRINCIPAL_REQUIRED', 'Estorno exige login de usuário.', 403);
    const data = agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const resultado = await repo.estornarComanda(id, { ...pedido, data }, autoria.actorId);
    res.status(resultado.idempotent ? 200 : 201).json({ ok: true, data: resultado });
  } catch (err) { next(err); }
});

// F1 Insights — read-only, serão cacheáveis depois
router.get('/insights/occupancy', authorize('relatorios:operacional'), async (req, res, next) => {
  try {
    const from = req.query.from || new Date().toISOString().split('T')[0];
    const to = req.query.to || new Date().toISOString().split('T')[0];
    // Validar datas YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw createAppError('INVALID_DATES', 'Datas devem estar em formato YYYY-MM-DD', 400);
    }
    const service = new InsightsService(req.auth.empresa_id);
    const data = await service.loadOccupancyInsights(from, to);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/insights/margin', authorize('relatorios:full'), async (req, res, next) => {
  try {
    const from = req.query.from || new Date().toISOString().split('T')[0];
    const to = req.query.to || new Date().toISOString().split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw createAppError('INVALID_DATES', 'Datas devem estar em formato YYYY-MM-DD', 400);
    }
    const service = new InsightsService(req.auth.empresa_id);
    const data = await service.loadMarginInsights(from, to);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/insights/cashflow', authorize('relatorios:full'), async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days || '30'), 90);
    const service = new InsightsService(req.auth.empresa_id);
    const data = await service.loadCashflowInsights(days);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

// F2 Retencao - read-only, backend-only analytics
router.get('/insights/retention', authorize('relatorios:operacional'), async (req, res, next) => {
  try {
    const service = new RetentionService(req.auth.empresa_id);
    const data = await service.loadRetentionInsights();
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/insights/clients/:id/reliability', authorize('relatorios:operacional'), async (req, res, next) => {
  try {
    const id = validateUUID(req.params.id, 'id');
    const service = new RetentionService(req.auth.empresa_id);
    const data = await service.loadClientReliability(id);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/insights/attach', authorize('relatorios:operacional'), async (req, res, next) => {
  try {
    const service = new RetentionService(req.auth.empresa_id);
    const data = await service.loadAttachInsights();
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/insights/rebooking/:clienteId', authorize('relatorios:operacional'), async (req, res, next) => {
  try {
    const clienteId = validateUUID(req.params.clienteId, 'clienteId');
    const servicoId = req.query.servicoId ? validateUUID(req.query.servicoId, 'servicoId') : null;
    const service = new RetentionService(req.auth.empresa_id);
    const data = await service.loadRebookingSuggestion(clienteId, servicoId);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

// Cota-parte do mês (Lei do Salão-Parceiro, D-009): salão × profissionais parceiros.
router.get('/relatorios/cota-parte', authorize('relatorios:full'), async (req, res, next) => {
  try {
    const mes = String(req.query.mes || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw createAppError('INVALID_MONTH', 'mes deve ser YYYY-MM.', 422);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const filtro = { empresa_id: repo.empresaId };
    const [comandos, comandoItens, profissionais, empresas, estornos, estornoItens] = await Promise.all([
      repo.list('comandos', filtro), repo.list('comando_itens', filtro), repo.list('profissionais', filtro), repo.list('empresas', { id: repo.empresaId }),
      repo.list('comanda_estornos', filtro), repo.list('comanda_estorno_itens', filtro)
    ]);
    const empresa = empresas[0] || {};
    // Estorno entra no mês DO ESTORNO (D-013): o mês já fechado não muda.
    res.json({ ok: true, data: { ...computeCotaParte({ comandos, comandoItens, profissionais, mes, estornos, estornoItens }), salaoParceiro: Boolean(empresa.salao_parceiro), cnpj: empresa.cnpj || null, razaoSocial: empresa.razao_social || null } });
  } catch (err) { next(err); }
});

// F4.4 — lista de espera (tabela ja existe desde 001_init.sql; zero migration nova)
router.get('/lista-espera', authorize('lista_espera:read'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const filters = { empresa_id: repo.empresaId };
    if (req.query.servicoId) filters.servico_id = validateUUID(req.query.servicoId, 'servicoId');
    if (req.query.status) filters.status = req.query.status;
    res.json({ ok: true, data: await repo.list('lista_espera', filters) });
  } catch (err) { next(err); }
});

router.post('/lista-espera', authorize('lista_espera:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const payload = validateCreateListaEsperaPayload(req.body);
    await requireActiveEntity(repo, 'clientes', payload.cliente_id, 'Cliente', 'CLIENT_NOT_FOUND');
    await requireActiveEntity(repo, 'servicos', payload.servico_id, 'Serviço', 'SERVICE_NOT_FOUND');
    if (payload.profissional_id) await requireActiveEntity(repo, 'profissionais', payload.profissional_id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    res.status(201).json({ ok: true, data: await repo.insertScoped('lista_espera', payload) });
  } catch (err) { next(err); }
});

router.patch('/lista-espera/:id', authorize('lista_espera:write'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    await requireScopedEntity(repo, 'lista_espera', id, 'Item da lista de espera', 'WAITLIST_ITEM_NOT_FOUND');
    const payload = validateUpdateListaEsperaPayload(req.body);
    if (payload.profissional_id) await requireActiveEntity(repo, 'profissionais', payload.profissional_id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    res.json({ ok: true, data: await repo.updateScoped('lista_espera', id, payload) });
  } catch (err) { next(err); }
});

module.exports = router;

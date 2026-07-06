const express = require('express');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { loadDataContract } = require('../services/DataContractService');
const { getSnapshot } = require('../services/SnapshotService');
const { buildDashboard } = require('../services/DashboardService');
const { buildFinanceReadModel } = require('../services/FinanceReadModel');
const { previewCheckout } = require('../engines/FinanceEngine');
const { resolveCheckoutInput } = require('../engines/CheckoutInputResolver');
const { validateCheckoutPayload } = require('../validators/checkout.validator');
const { validateCreateAgendamentoPayload, validateStatusChangePayload, validateReagendamentoPayload } = require('../validators/agenda.validator');
const {
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
  validateProfissionalServicoOverridePayload
} = require('../validators/cadastros.validator');
const { assertNoScheduleConflict } = require('../engines/ScheduleEngine');
const { createAppError } = require('../errors');

const router = express.Router();

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

async function requireScopedEntity(repo, table, id, label, notFoundCode) {
  const row = await repo.getByIdScoped(table, id);
  if (!row) throw createAppError(notFoundCode, `${label} nÃ£o encontrado: ${id}`, 404, { id });
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

router.get('/data-contract', (req, res) => {
  res.json({ ok: true, data: loadDataContract() });
});

router.get('/snapshot', async (req, res, next) => {
  try { res.json({ ok: true, data: await getSnapshot() }); }
  catch (err) { next(err); }
});

router.get('/dashboard', async (req, res, next) => {
  try { res.json({ ok: true, data: buildDashboard(await getSnapshot()) }); }
  catch (err) { next(err); }
});

router.get('/financeiro/resumo', async (req, res, next) => {
  try { res.json({ ok: true, data: buildFinanceReadModel(await getSnapshot()) }); }
  catch (err) { next(err); }
});

router.get('/clientes', async (req, res, next) => {
  try { res.json({ ok: true, data: await new SupabaseRepository().list('clientes') }); }
  catch (err) { next(err); }
});

router.post('/clientes', async (req, res, next) => {
  try { res.status(201).json({ ok: true, data: await new SupabaseRepository().insert('clientes', req.body) }); }
  catch (err) { next(err); }
});

router.get('/servicos', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    res.json({ ok: true, data: await repo.list('servicos', { empresa_id: repo.empresaId }) });
  }
  catch (err) { next(err); }
});

router.post('/servicos', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    const payload = validateCreateServicoPayload(req.body);
    res.status(201).json({ ok: true, data: await repo.insertScoped('servicos', payload) });
  } catch (err) { next(err); }
});

router.patch('/servicos/:id', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    await requireScopedEntity(repo, 'servicos', req.params.id, 'ServiÃ§o', 'SERVICE_NOT_FOUND');
    const payload = validateUpdateServicoPayload(req.body);
    res.json({ ok: true, data: await repo.updateScoped('servicos', req.params.id, payload) });
  } catch (err) { next(err); }
});

router.get('/profissionais', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    res.json({ ok: true, data: await repo.list('profissionais', { empresa_id: repo.empresaId }) });
  }
  catch (err) { next(err); }
});

router.post('/profissionais', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    const payload = validateCreateProfissionalPayload(req.body);
    res.status(201).json({ ok: true, data: await repo.insertScoped('profissionais', payload) });
  } catch (err) { next(err); }
});

router.patch('/profissionais/:id', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    await requireScopedEntity(repo, 'profissionais', req.params.id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    const payload = validateUpdateProfissionalPayload(req.body);
    res.json({ ok: true, data: await repo.updateScoped('profissionais', req.params.id, payload) });
  } catch (err) { next(err); }
});

router.get('/produtos', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    res.json({ ok: true, data: await repo.list('produtos', { empresa_id: repo.empresaId }) });
  }
  catch (err) { next(err); }
});

router.post('/produtos', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    const { produto, estoqueInicial } = validateCreateProdutoPayload(req.body);
    const data = await repo.createProdutoComEstoque({
      produto,
      estoqueInicial,
      motivo: 'Estoque inicial do cadastro de produto'
    });
    res.status(201).json({ ok: true, data });
  } catch (err) { next(err); }
});

router.patch('/produtos/:id', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    const existing = await requireScopedEntity(repo, 'produtos', req.params.id, 'Produto', 'PRODUCT_NOT_FOUND');
    const payload = validateUpdateProdutoPayload(req.body);
    const merged = { ...existing, ...payload };
    assertProdutoEconomics(merged);
    res.json({ ok: true, data: await repo.updateScoped('produtos', req.params.id, payload) });
  } catch (err) { next(err); }
});

router.post('/produtos/:id/estoque/ajuste', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    await requireScopedEntity(repo, 'produtos', req.params.id, 'Produto', 'PRODUCT_NOT_FOUND');
    const payload = validateEstoqueAjustePayload(req.body);
    res.status(201).json({ ok: true, data: await repo.adjustProdutoEstoque(req.params.id, payload) });
  } catch (err) { next(err); }
});

router.get('/formas-pagamento', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    res.json({ ok: true, data: await repo.list('formas_pagamento', { empresa_id: repo.empresaId }) });
  }
  catch (err) { next(err); }
});

router.post('/formas-pagamento', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    const payload = validateCreateFormaPagamentoPayload(req.body);
    const existing = await repo.list('formas_pagamento', { empresa_id: repo.empresaId, code: payload.code });
    if (existing[0]) {
      throw createAppError('PAYMENT_METHOD_ALREADY_EXISTS', `Forma de pagamento ja existe: ${payload.code}. Use PATCH /formas-pagamento/${payload.code} para editar.`, 409, { code: payload.code });
    }
    res.status(201).json({ ok: true, data: await repo.createFormaPagamento(payload) });
  } catch (err) { next(err); }
});

router.patch('/formas-pagamento/:code', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    const existing = await repo.list('formas_pagamento', { empresa_id: repo.empresaId, code: req.params.code });
    if (!existing[0]) throw createAppError('PAYMENT_METHOD_NOT_FOUND', `Forma de pagamento nÃ£o encontrada: ${req.params.code}`, 404, { code: req.params.code });
    const payload = validateUpdateFormaPagamentoPayload(req.body);
    res.json({ ok: true, data: await repo.updateFormaPagamento(req.params.code, payload) });
  } catch (err) { next(err); }
});

router.get('/profissionais/:id/servicos', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    await requireScopedEntity(repo, 'profissionais', req.params.id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    res.json({ ok: true, data: await repo.list('profissional_servicos', { empresa_id: repo.empresaId, profissional_id: req.params.id }) });
  } catch (err) { next(err); }
});

router.put('/profissionais/:id/servicos', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    const profissional = await requireActiveEntity(repo, 'profissionais', req.params.id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    const { servicoIds } = validateProfissionalServicosPayload(req.body);
    for (const servicoId of servicoIds) {
      await requireActiveEntity(repo, 'servicos', servicoId, 'ServiÃ§o', 'SERVICE_NOT_FOUND');
    }
    const data = await repo.replaceProfissionalServicos(profissional.id, servicoIds);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.patch('/profissionais/:id/servicos/:servicoId/override', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    await requireActiveEntity(repo, 'profissionais', req.params.id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    await requireActiveEntity(repo, 'servicos', req.params.servicoId, 'ServiÃ§o', 'SERVICE_NOT_FOUND');
    const links = await repo.list('profissional_servicos', {
      empresa_id: repo.empresaId,
      profissional_id: req.params.id,
      servico_id: req.params.servicoId
    });
    if (!links[0]) {
      throw createAppError('SERVICE_NOT_ALLOWED_FOR_PROFESSIONAL', 'ServiÃ§o nÃ£o vinculado ao profissional.', 422, {
        profissionalId: req.params.id,
        servicoId: req.params.servicoId
      });
    }
    const payload = validateProfissionalServicoOverridePayload(req.body);
    res.json({ ok: true, data: await repo.updateProfissionalServicoOverride(req.params.id, req.params.servicoId, payload) });
  } catch (err) { next(err); }
});

router.get('/agenda', async (req, res, next) => {
  try {
    const filters = req.query.data ? { data: req.query.data } : {};
    res.json({ ok: true, data: await new SupabaseRepository().list('agendamentos', filters) });
  } catch (err) { next(err); }
});

router.post('/agenda', async (req, res, next) => {
  try {
    const payload = validateCreateAgendamentoPayload(req.body);
    const repo = new SupabaseRepository();

    if (payload.clienteId) await requireActiveEntity(repo, 'clientes', payload.clienteId, 'Cliente', 'CLIENT_NOT_FOUND');
    const servico = await requireActiveEntity(repo, 'servicos', payload.servicoId, 'Serviço', 'SERVICE_NOT_FOUND');
    await requireActiveEntity(repo, 'profissionais', payload.profissionalId, 'Profissional', 'PROFESSIONAL_NOT_FOUND');

    const duracaoMin = payload.duracaoMin ?? servico.duracao_min ?? 30;

    if (!payload.permitirConflito) {
      const existentes = await repo.list('agendamentos', {
        empresa_id: repo.empresaId,
        profissional_id: payload.profissionalId,
        data: payload.data
      });
      assertNoScheduleConflict({
        agendamento: { id: null, profissionalId: payload.profissionalId, data: payload.data, horario: payload.horario, duracaoMin },
        existing: existentes
      });
    }

    const created = await repo.insert('agendamentos', {
      cliente_id: payload.clienteId,
      servico_id: payload.servicoId,
      profissional_id: payload.profissionalId,
      data: payload.data,
      horario: payload.horario,
      duracao_min: duracaoMin,
      valor_centavos: servico.valor_centavos || 0,
      status: 'agendado'
    });

    res.status(201).json({ ok: true, data: created });
  } catch (err) { next(err); }
});

router.patch('/agenda/:id/status', async (req, res, next) => {
  try {
    const { novoStatus } = validateStatusChangePayload(req.body);
    const repo = new SupabaseRepository();

    const existing = await repo.list('agendamentos', { id: req.params.id, empresa_id: repo.empresaId });
    const original = existing[0];
    if (!original) throw createAppError('AGENDAMENTO_NOT_FOUND', `Agendamento não encontrado: ${req.params.id}`, 404, { id: req.params.id });

    if (novoStatus !== 'reagendado') {
      const updated = await repo.update('agendamentos', original.id, { status: novoStatus, updated_at: new Date().toISOString() });
      return res.json({ ok: true, data: { original: updated } });
    }

    const reagendamento = validateReagendamentoPayload(req.body);
    const novoServicoId = reagendamento.novoServicoId || original.servico_id;
    const novoProfissionalId = reagendamento.novoProfissionalId || original.profissional_id;

    let servico = null;
    if (reagendamento.novoServicoId) servico = await requireActiveEntity(repo, 'servicos', novoServicoId, 'Serviço', 'SERVICE_NOT_FOUND');
    if (reagendamento.novoProfissionalId) await requireActiveEntity(repo, 'profissionais', novoProfissionalId, 'Profissional', 'PROFESSIONAL_NOT_FOUND');

    const duracaoMinNovo = servico ? (servico.duracao_min || original.duracao_min) : original.duracao_min;

    if (!reagendamento.permitirConflito) {
      const existentes = await repo.list('agendamentos', {
        empresa_id: repo.empresaId,
        profissional_id: novoProfissionalId,
        data: reagendamento.novaData
      });
      assertNoScheduleConflict({
        agendamento: { id: original.id, profissionalId: novoProfissionalId, data: reagendamento.novaData, horario: reagendamento.novoHorario, duracaoMin: duracaoMinNovo },
        existing: existentes
      });
    }

    const novo = await repo.insert('agendamentos', {
      cliente_id: original.cliente_id,
      servico_id: novoServicoId,
      profissional_id: novoProfissionalId,
      data: reagendamento.novaData,
      horario: reagendamento.novoHorario,
      duracao_min: duracaoMinNovo,
      valor_centavos: servico ? (servico.valor_centavos ?? original.valor_centavos) : original.valor_centavos,
      status: 'agendado'
    });

    const updatedOriginal = await repo.update('agendamentos', original.id, { status: 'reagendado', updated_at: new Date().toISOString() });

    res.json({ ok: true, data: { original: updatedOriginal, novo } });
  } catch (err) { next(err); }
});

router.patch('/agenda/:id/duracao', async (req, res, next) => {
  try {
    const duracaoMin = Number(req.body && req.body.duracaoMin);
    if (!Number.isInteger(duracaoMin) || duracaoMin < 10 || duracaoMin > 480) {
      throw createAppError('INVALID_DURATION', 'Duração deve ser um inteiro entre 10 e 480 minutos.', 422);
    }
    const repo = new SupabaseRepository();
    const updated = await repo.update('agendamentos', req.params.id, {
      duracao_min: duracaoMin,
      updated_at: new Date().toISOString()
    });
    res.json({ ok: true, data: { id: updated.id, duracaoMin: updated.duracao_min } });
  } catch (err) { next(err); }
});

router.get('/catalog', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
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

router.post('/checkout/preview', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    const { resolved } = await buildServerResolvedCheckout(repo, req.body);
    res.json({ ok: true, data: previewCheckout(resolved) });
  } catch (err) { next(err); }
});

router.post('/checkout/close', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    const { payload, resolved } = await buildServerResolvedCheckout(repo, req.body);
    const preview = previewCheckout(resolved);
    const saved = await repo.saveCheckoutClose({ payload, resolved, preview });

    // Vínculo opcional checkout → agenda. Não faz parte da RPC nem do ledger:
    // é só uma atualização de status feita depois que o checkout já fechou.
    // Se falhar, não derruba a resposta — a comanda já foi fechada de verdade.
    let agendamentoConcluido = null;
    if (req.body && req.body.agendamentoId) {
      try {
        agendamentoConcluido = await repo.update('agendamentos', req.body.agendamentoId, {
          status: 'concluido',
          updated_at: new Date().toISOString()
        });
      } catch (linkErr) {
        console.error('Falha ao marcar agendamento como concluído:', linkErr.message || linkErr);
      }
    }

    res.status(201).json({ ok: true, data: { preview, saved, agendamentoConcluido } });
  } catch (err) { next(err); }
});

module.exports = router;

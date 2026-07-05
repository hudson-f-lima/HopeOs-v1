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
  try { res.json({ ok: true, data: await new SupabaseRepository().list('servicos') }); }
  catch (err) { next(err); }
});

router.get('/profissionais', async (req, res, next) => {
  try { res.json({ ok: true, data: await new SupabaseRepository().list('profissionais') }); }
  catch (err) { next(err); }
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

    const created = await repo.insert('agendamentos', {
      cliente_id: payload.clienteId,
      servico_id: payload.servicoId,
      profissional_id: payload.profissionalId,
      data: payload.data,
      horario: payload.horario,
      duracao_min: payload.duracaoMin ?? servico.duracao_min ?? 30,
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

    const novo = await repo.insert('agendamentos', {
      cliente_id: original.cliente_id,
      servico_id: novoServicoId,
      profissional_id: novoProfissionalId,
      data: reagendamento.novaData,
      horario: reagendamento.novoHorario,
      duracao_min: servico ? (servico.duracao_min || original.duracao_min) : original.duracao_min,
      valor_centavos: servico ? (servico.valor_centavos ?? original.valor_centavos) : original.valor_centavos,
      status: 'agendado'
    });

    const updatedOriginal = await repo.update('agendamentos', original.id, { status: 'reagendado', updated_at: new Date().toISOString() });

    res.json({ ok: true, data: { original: updatedOriginal, novo } });
  } catch (err) { next(err); }
});

router.get('/catalog', async (req, res, next) => {
  try {
    const repo = new SupabaseRepository();
    const [clientes, servicos, produtos, profissionais, formas_pagamento] = await Promise.all([
      repo.list('clientes', { empresa_id: repo.empresaId }),
      repo.list('servicos', { empresa_id: repo.empresaId }),
      repo.list('produtos', { empresa_id: repo.empresaId }),
      repo.list('profissionais', { empresa_id: repo.empresaId }),
      repo.list('formas_pagamento', { empresa_id: repo.empresaId })
    ]);
    res.json({ ok: true, data: { clientes, servicos, produtos, profissionais, formas_pagamento } });
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

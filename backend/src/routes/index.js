const express = require('express');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { loadDataContract } = require('../services/DataContractService');
const { getSnapshot } = require('../services/SnapshotService');
const { buildDashboard } = require('../services/DashboardService');
const { buildFinanceReadModel } = require('../services/FinanceReadModel');
const { previewCheckout } = require('../engines/FinanceEngine');
const { resolveCheckoutInput } = require('../engines/CheckoutInputResolver');
const { validateCheckoutPayload } = require('../validators/checkout.validator');

const router = express.Router();

async function buildServerResolvedCheckout(repo, rawBody) {
  const payload = validateCheckoutPayload(rawBody);
  const context = await repo.loadCheckoutContext();
  const resolved = resolveCheckoutInput({ payload, ...context });
  return { payload, resolved };
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
    res.status(201).json({ ok: true, data: { preview, saved } });
  } catch (err) { next(err); }
});

module.exports = router;

// Fechamento/conferência de caixa do dia — SOMENTE LEITURA.
// Não grava o fechamento: não há tabela para isso nas migrations 001–008.
const express = require('express');
const { createAppError } = require('../errors');
const { authorize } = require('../auth/rbac');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { buildFechamentoCaixa } = require('../engines/CaixaEngine');
const { agoraNoFuso } = require('../engines/SlotEngine');
const { env } = require('../config/env');

const router = express.Router();

function validarData(valor) {
  if (valor === undefined || valor === '') return agoraNoFuso(env.APP_TIMEZONE).data;
  const s = String(valor);
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(s) && (() => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  })();
  if (!ok) throw createAppError('INVALID_DATE', 'data deve estar no formato YYYY-MM-DD.', 422, { field: 'data' });
  return s;
}

function validarContado(valor) {
  if (valor === undefined || valor === '') return undefined;
  const s = String(valor);
  if (!/^\d{1,12}$/.test(s)) {
    throw createAppError('INVALID_FIELD', 'contadoDinheiroCentavos deve ser inteiro em centavos (>= 0).', 422, { field: 'contadoDinheiroCentavos' });
  }
  return Number(s);
}

router.get('/caixa/fechamento', authorize('relatorios:operacional'), async (req, res, next) => {
  try {
    const data = validarData(req.query.data);
    const contadoDinheiroCentavos = validarContado(req.query.contadoDinheiroCentavos);
    // Tenant só do req.auth; empresa_id de query/body é ignorado.
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const [comandos, movimentos, formasPagamento] = await Promise.all([
      repo.list('comandos', { empresa_id: repo.empresaId, data }),
      repo.list('caixa_movimentos', { empresa_id: repo.empresaId, data }),
      repo.list('formas_pagamento', { empresa_id: repo.empresaId })
    ]);
    const pagamentos = await repo.listPagamentosDasComandas(comandos.map(c => c.id));
    res.json({ ok: true, data: buildFechamentoCaixa({ data, comandos, pagamentos, movimentos, formasPagamento, contadoDinheiroCentavos }) });
  } catch (err) { next(err); }
});

module.exports = { caixaRouter: router };

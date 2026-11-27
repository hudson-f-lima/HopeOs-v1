// Conferência de caixa do dia (leitura). Desde a migration 010 (D-017) considera
// fundo de troco, sangrias e suprimentos e informa o último fechamento salvo do dia.
// Quem grava (ajuste e fechamento) é routes/financeiroOps.js.
const express = require('express');
const { createAppError } = require('../errors');
const { authorize } = require('../auth/rbac');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { agoraNoFuso } = require('../engines/SlotEngine');
const { env } = require('../config/env');
const clock = require('../config/clock');

const router = express.Router();

function validarData(valor) {
  if (valor === undefined || valor === '') return agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
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

function validarFundo(valor) {
  if (valor === undefined || valor === '') return 0;
  const s = String(valor);
  if (!/^\d{1,12}$/.test(s)) throw createAppError('INVALID_FIELD', 'fundoTrocoCentavos deve ser inteiro em centavos (>= 0).', 422, { field: 'fundoTrocoCentavos' });
  return Number(s);
}

router.get('/caixa/fechamento', authorize('caixa:conferir'), async (req, res, next) => {
  try {
    const { resumoDoDia, fechamentoPublico } = require('./financeiroOps');
    const data = validarData(req.query.data);
    const contadoDinheiroCentavos = validarContado(req.query.contadoDinheiroCentavos);
    const fundoTrocoCentavos = validarFundo(req.query.fundoTrocoCentavos);
    // Tenant só do req.auth; empresa_id de query/body é ignorado.
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const [resumo, fechamentos] = await Promise.all([
      resumoDoDia(repo, data, { fundoTrocoCentavos, contadoDinheiroCentavos }),
      repo.list('caixa_fechamentos', { empresa_id: repo.empresaId, data })
    ]);
    // Vale o fechamento mais recente do dia (em empate de horário, o último gravado).
    const ultimo = fechamentos.reduce((m, f) => (!m || String(f.created_at || '') >= String(m.created_at || '') ? f : m), null);
    // Movimento depois do fechamento: o esperado de agora (com o fundo do fechamento) difere do gravado.
    let desatualizado = false;
    if (ultimo) {
      const agora = await resumoDoDia(repo, data, { fundoTrocoCentavos: ultimo.fundo_troco_centavos });
      desatualizado = agora.dinheiro.esperadoCentavos !== ultimo.esperado_dinheiro_centavos || agora.totalBrutoCentavos !== ultimo.total_bruto_centavos;
    }
    res.json({ ok: true, data: { ...resumo, persistido: Boolean(ultimo), ultimoFechamento: ultimo ? { ...fechamentoPublico(ultimo), desatualizado } : null, quantidadeFechamentos: fechamentos.length } });
  } catch (err) { next(err); }
});

// Caixa por período (D-088): só leitura, até 92 dias. Busca o período uma vez (comandas, pagamentos,
// movimentos, ajustes e fechamentos) e calcula cada dia pela conta do fechamento do dia.
// Não grava nada: fechar continua sendo POST /caixa/fechamentos, de um dia.
const MAX_DIAS_PERIODO = 92;
router.get('/caixa/periodo', authorize('caixa:conferir'), async (req, res, next) => {
  try {
    const { resumoCaixaPeriodo } = require('../engines/CaixaEngine');
    if (req.query.inicio === undefined || req.query.inicio === '' || req.query.fim === undefined || req.query.fim === '') {
      throw createAppError('INVALID_DATE', 'inicio e fim são obrigatórios.', 422, { field: req.query.inicio ? 'fim' : 'inicio' });
    }
    const inicio = validarData(req.query.inicio);
    const fim = validarData(req.query.fim);
    if (fim < inicio) throw createAppError('INVALID_RANGE', 'fim deve ser igual ou posterior a inicio.', 422, { inicio, fim });
    const dias = Math.round((Date.parse(fim + 'T00:00:00Z') - Date.parse(inicio + 'T00:00:00Z')) / 864e5) + 1;
    if (dias > MAX_DIAS_PERIODO) throw createAppError('RANGE_TOO_LONG', `Escolha um período de até ${MAX_DIAS_PERIODO} dias.`, 422, { maxDias: MAX_DIAS_PERIODO });
    // Tenant só do req.auth; empresa_id de query/body é ignorado.
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const f = { empresa_id: repo.empresaId };
    const p = { inicio, fim };
    const [comandos, movimentos, formasPagamento, ajustes, fechamentos] = await Promise.all([
      repo.list('comandos', f, p), repo.list('caixa_movimentos', f, p), repo.list('formas_pagamento', f), repo.list('caixa_ajustes', f, p), repo.list('caixa_fechamentos', f, p)
    ]);
    const pagamentos = await repo.listPagamentosDasComandas(comandos.map(c => c.id));
    res.json({ ok: true, data: resumoCaixaPeriodo({ inicio, fim, comandos, pagamentos, movimentos, formasPagamento, ajustes, fechamentos }) });
  } catch (err) { next(err); }
});

module.exports = { caixaRouter: router };

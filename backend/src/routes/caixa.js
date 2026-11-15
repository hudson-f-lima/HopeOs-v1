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

module.exports = { caixaRouter: router };

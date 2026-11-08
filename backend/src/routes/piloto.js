// Painel do piloto (auditoria 2026-11 §4): falta, reagendamento no checkout,
// retorno do cliente novo e confirmação prévia. Só leitura; definições em
// engines/insights/piloto.js.
const express = require('express');
const { createAppError } = require('../errors');
const { authorize } = require('../auth/rbac');
const { env } = require('../config/env');
const { agoraNoFuso } = require('../engines/SlotEngine');
const { addDays, daysBetween } = require('../engines/insights/retention');
const { computePiloto } = require('../engines/insights/piloto');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');

const router = express.Router();
const PERIODO_MAX_DIAS = 366;
const PERIODO_PADRAO_DIAS = 30;

function dataValida(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function resolverPeriodo(query, hoje) {
  const ate = query.ate === undefined ? hoje : String(query.ate);
  const de = query.de === undefined ? addDays(ate, -(PERIODO_PADRAO_DIAS - 1)) : String(query.de);
  if (!dataValida(de) || !dataValida(ate)) throw createAppError('INVALID_DATE', 'de e ate devem estar no formato AAAA-MM-DD.', 422);
  if (de > ate) throw createAppError('INVALID_PERIOD', 'de não pode ser depois de ate.', 422);
  if (daysBetween(de, ate) + 1 > PERIODO_MAX_DIAS) throw createAppError('INVALID_PERIOD', `Período máximo de ${PERIODO_MAX_DIAS} dias.`, 422);
  return { de, ate };
}

router.get('/relatorios/piloto', authorize('relatorios:full'), async (req, res, next) => {
  try {
    const hoje = agoraNoFuso(env.APP_TIMEZONE).data;
    const { de, ate } = resolverPeriodo(req.query, hoje);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const filtro = { empresa_id: repo.empresaId };
    const [agendamentos, comandos, comandoItens, profissionais] = await Promise.all([
      repo.list('agendamentos', filtro), repo.list('comandos', filtro), repo.list('comando_itens', filtro), repo.list('profissionais', filtro)
    ]);
    const data = computePiloto({ agendamentos, comandos, comandoItens, de, ate, hoje, timeZone: env.APP_TIMEZONE });
    const nomes = new Map(profissionais.map(p => [String(p.id), p.nome]));
    data.porProfissional = data.porProfissional.map(p => ({ ...p, nome: nomes.get(p.profissionalId) || null }));
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

module.exports = { pilotoRouter: router };

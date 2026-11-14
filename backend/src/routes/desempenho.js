// Indicadores por colaborador (D-029). Só leitura, calculado na hora; nada é gravado.
// Gestão (admin e gestor) escolhe a pessoa; o profissional vê só os próprios números;
// a recepção não tem acesso. Sem nota, ranking, rótulo ou efeito em pagamento.
const express = require('express');
const { createAppError } = require('../errors');
const { authorize } = require('../auth/rbac');
const { env } = require('../config/env');
const clock = require('../config/clock');
const { agoraNoFuso } = require('../engines/SlotEngine');
const { RETORNO_JANELA_DIAS, RETORNO_JANELAS_PERMITIDAS } = require('../engines/insights/piloto');
const { computeDesempenhoIndividual } = require('../engines/insights/desempenhoIndividual');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');

const router = express.Router();

router.get('/desempenho/profissional', authorize('desempenho:read'), async (req, res, next) => {
  try {
    const mes = String(req.query.mes || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw createAppError('INVALID_MONTH', 'mes deve ser YYYY-MM.', 422);
    const retornoDias = req.query.retornoDias === undefined ? RETORNO_JANELA_DIAS : Number(req.query.retornoDias);
    if (!RETORNO_JANELAS_PERMITIDAS.includes(retornoDias)) throw createAppError('INVALID_FIELD', `retornoDias deve ser ${RETORNO_JANELAS_PERMITIDAS.join(', ')}.`, 422, { field: 'retornoDias' });
    // Profissional: sempre ele mesmo, o que vier na query é ignorado.
    const profissionalId = req.authz.own ? req.authz.profissionalId : req.query.profissionalId;
    if (!profissionalId) throw createAppError('INVALID_FIELD', 'profissionalId é obrigatório.', 422, { field: 'profissionalId' });
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const filtro = { empresa_id: repo.empresaId };
    const [profissionais, empresas, agendamentos, comandos, comandoItens, estornos, estornoItens, eventos] = await Promise.all([
      repo.list('profissionais', filtro), repo.list('empresas', { id: repo.empresaId }), repo.list('agendamentos', filtro), repo.list('comandos', filtro),
      repo.list('comando_itens', filtro), repo.list('comanda_estornos', filtro), repo.list('comanda_estorno_itens', filtro), repo.list('agendamento_eventos', filtro)
    ]);
    const profissional = profissionais.find(p => String(p.id) === String(profissionalId));
    if (!profissional) throw createAppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.', 404);
    const hoje = agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
    const dados = { agendamentos, comandos, comandoItens, estornos, estornoItens, eventos, profissionais };
    const data = computeDesempenhoIndividual({ dados, profissional, mes, hoje, timeZone: env.APP_TIMEZONE, retornoDias, empresa: empresas[0] || {} });
    if (!data) throw createAppError('INVALID_MONTH', 'Mês ainda não começou.', 422);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

module.exports = { desempenhoRouter: router };

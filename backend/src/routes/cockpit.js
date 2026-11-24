// Cockpit do gestor (D-064): indicadores, alertas com o porquê e a próxima ação, equipe e bases do
// simulador. Só leitura, calculado na hora a partir do que está gravado; nada é gravado aqui.
// Gestão (painel:financeiro): mostra receita, margem e valores de assinatura.
const express = require('express');
const { authorize } = require('../auth/rbac');
const { env } = require('../config/env');
const clock = require('../config/clock');
const { agoraNoFuso } = require('../engines/SlotEngine');
const { createAppError } = require('../errors');
const { dataValida } = require('./financeiroOps');
const { addDays, daysBetween } = require('../engines/insights/retention');
const { FIDELIDADE_JANELA_DIAS } = require('../engines/insights/piloto');
const { computeDesempenhoSalao } = require('../engines/insights/desempenhoSalao');
const { computeCockpit } = require('../engines/insights/cockpit');
const { CAMPOS_AGENDA_PRODUCAO, CAMPOS_COMANDA_PRODUCAO, CAMPOS_ITEM_PRODUCAO } = require('../engines/insights/eventosProducao');
const { carregarVinculosDeProducao } = require('../repositories/producaoPeriodo');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');

const router = express.Router();

router.get('/cockpit', authorize('painel:financeiro'), async (req, res, next) => {
  try {
    // Tenant só do token; empresa_id de query ou corpo é ignorado.
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const f = { empresa_id: repo.empresaId };
    const [comandos, estornos, metas, agendamentos, profissionais, empresa, assinaturas, planos, cobrancas, clientes, listaEspera, comandoItens, estornoItens] = await Promise.all([
      repo.list('comandos', f), repo.list('comanda_estornos', f), repo.list('metas', f), repo.list('agendamentos', f),
      repo.list('profissionais', f), repo.empresaComDisponibilidade(), repo.list('assinaturas', f), repo.list('assinatura_planos', f),
      repo.list('assinatura_cobrancas', f), repo.list('clientes', f), repo.list('lista_espera', f), repo.list('comando_itens', f),
      repo.list('comanda_estorno_itens', f)
    ]);
    const { data: hoje, minuto: minutoAtual } = agoraNoFuso(env.APP_TIMEZONE, clock.agora());
    res.json({ ok: true, data: computeCockpit({
      hoje, minutoAtual, comandos, estornos, metas, agendamentos, profissionais, empresa: empresa || {}, assinaturas, planos, cobrancas,
      clientes, listaEspera, comandoItens, estornoItens
    }) });
  } catch (err) { next(err); }
});

router.get('/cockpit/desempenho', authorize('painel:financeiro'), async (req, res, next) => {
  try {
    const hoje = agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
    const { mes } = req.query;
    if (mes !== undefined && (!['atual', 'anterior'].includes(mes) || req.query.inicio !== undefined || req.query.fim !== undefined)) {
      throw createAppError('INVALID_PERIOD', 'Escolha um mês predefinido ou envie as datas do período.', 422);
    }
    const fimPadrao = mes === 'anterior' ? addDays(hoje.slice(0, 7) + '-01', -1) : hoje;
    const fim = dataValida(req.query.fim ?? fimPadrao, 'fim');
    const inicio = dataValida(req.query.inicio ?? (fim.slice(0, 7) + '-01'), 'inicio');
    if (fim > hoje || inicio > fim || daysBetween(inicio, fim) + 1 > 366) {
      throw createAppError('INVALID_PERIOD', 'Escolha até 366 dias, em ordem, com término até hoje.', 422);
    }
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const filtro = { empresa_id: repo.empresaId };
    const corte = addDays(fim, 1 - FIDELIDADE_JANELA_DIAS);
    const vespera = addDays(inicio, -1);
    const historico = { inicio: vespera < corte ? vespera : corte, fim, ordem: 'id' };
    const [comandos, agendamentos, estornos, profissionais, empresa] = await Promise.all([
      repo.list('comandos', filtro, { ...historico, campos: CAMPOS_COMANDA_PRODUCAO + ',itens_liquidos_centavos,receita_empresa_centavos,total_comissao_centavos,taxa_servico_centavos,total_custo_produtos_centavos' }),
      repo.list('agendamentos', filtro, { ...historico, campos: CAMPOS_AGENDA_PRODUCAO }),
      repo.list('comanda_estornos', filtro, { inicio, fim, ordem: 'id', campos: 'id,data,tipo,comando_id,itens_centavos,receita_empresa_centavos,comissao_centavos,gorjeta_bruta_centavos,gorjeta_liquida_centavos' }),
      repo.list('profissionais', filtro, { ordem: 'id' }), repo.empresaComDisponibilidade()
    ]);
    const producao = await carregarVinculosDeProducao(repo, agendamentos, comandos, vespera, fim, historico);
    const devolvidas = estornos.map(e => e.comando_id);
    // A venda original pode anteceder a janela histórica. O tipo do item estornado
    // vem dessa venda; devolve_estoque não muda o número de unidades vendidas.
    const [comandoItens, estornoItens] = await Promise.all([
      repo.listDasComandas('comando_itens', producao.comandos.map(c => c.id).concat(devolvidas), CAMPOS_ITEM_PRODUCAO + ',receita_empresa_centavos'),
      repo.listDasComandas('comanda_estorno_itens', devolvidas, 'estorno_id,comando_item_id,quantidade,receita_empresa_centavos')
    ]);
    const data = computeDesempenhoSalao({ inicio, fim, producao: { ...producao, comandoItens }, comandos, agendamentos, estornos, profissionais, empresa: empresa || {}, comandoItens, estornoItens });
    if (mes !== undefined) data.periodoPredefinido = mes;
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

module.exports = { cockpitRouter: router };

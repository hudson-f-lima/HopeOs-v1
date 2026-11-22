// Cockpit do gestor (D-064): indicadores, alertas com o porquê e a próxima ação, equipe e bases do
// simulador. Só leitura, calculado na hora a partir do que está gravado; nada é gravado aqui.
// Gestão (painel:financeiro): mostra receita, margem e valores de assinatura.
const express = require('express');
const { authorize } = require('../auth/rbac');
const { env } = require('../config/env');
const clock = require('../config/clock');
const { agoraNoFuso } = require('../engines/SlotEngine');
const { computeCockpit } = require('../engines/insights/cockpit');
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
    const hoje = agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
    res.json({ ok: true, data: computeCockpit({
      hoje, comandos, estornos, metas, agendamentos, profissionais, empresa: empresa || {}, assinaturas, planos, cobrancas,
      clientes, listaEspera, comandoItens, estornoItens
    }) });
  } catch (err) { next(err); }
});

module.exports = { cockpitRouter: router };

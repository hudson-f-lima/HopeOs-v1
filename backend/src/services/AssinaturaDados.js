// Coleções de assinatura usadas no ganho do profissional e no relatório do plano (D-044, D-045).
// "hoje" no fuso da empresa decide o que já está liberado.
const { env } = require('../config/env');
const clock = require('../config/clock');
const { agoraNoFuso } = require('../engines/SlotEngine');

async function dadosDeAssinatura(repo) {
  const f = { empresa_id: repo.empresaId };
  const [planos, assinaturas, cobrancas, usos, usosEstornos, formasPagamento] = await Promise.all([
    repo.list('assinatura_planos', f), repo.list('assinaturas', f), repo.list('assinatura_cobrancas', f),
    repo.list('assinatura_usos', f), repo.list('assinatura_usos_estornos', f), repo.list('formas_pagamento', f)
  ]);
  return { planos, assinaturas, cobrancas, usos, usosEstornos, formasPagamento, hoje: agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data };
}
module.exports = { dadosDeAssinatura };

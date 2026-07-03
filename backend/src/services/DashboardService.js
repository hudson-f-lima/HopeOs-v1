const { buildFinanceReadModel } = require('./FinanceReadModel');

function buildDashboard(snapshot) {
  const finance = buildFinanceReadModel(snapshot);
  const agendamentos = snapshot.agendamentos || [];
  const concluidos = agendamentos.filter(a => ['concluido', 'fechado'].includes(a.status)).length;
  const cancelados = agendamentos.filter(a => ['cancelado', 'no_show'].includes(a.status)).length;
  const totalAgenda = agendamentos.length;
  const ocupacaoPct = totalAgenda ? Math.round((concluidos / totalAgenda) * 100) : 0;
  const ticketMedioCentavos = finance.totals.comandos ? Math.round((finance.totals.itensLiquidosCentavos || finance.totals.servicosLiquidosCentavos) / finance.totals.comandos) : 0;

  const actions = [];
  if (ocupacaoPct < 60) actions.push({ priority: 'alta', title: 'Ocupação baixa', action: 'Chamar clientes de retorno e preencher buracos da agenda.' });
  if (finance.totals.taxaTotalCentavos > finance.totals.servicosLiquidosCentavos * 0.03) actions.push({ priority: 'media', title: 'Taxas altas', action: 'Incentivar Pix QR ou dinheiro quando fizer sentido.' });
  if (cancelados > 0) actions.push({ priority: 'media', title: 'No-show/cancelamento', action: 'Reforçar política de confirmação e sinal.' });

  while (actions.length < 3) actions.push({ priority: 'baixa', title: 'Operação estável', action: 'Manter padrão de atendimento e registrar todos os fechamentos.' });

  return {
    scoreHope: Math.max(0, Math.min(100, Math.round((ocupacaoPct * 0.4) + 40))),
    kpis: {
      servicosLiquidosCentavos: finance.totals.servicosLiquidosCentavos,
      produtosLiquidosCentavos: finance.totals.produtosLiquidosCentavos || 0,
      itensLiquidosCentavos: finance.totals.itensLiquidosCentavos || finance.totals.servicosLiquidosCentavos,
      receitaEmpresaCentavos: finance.totals.receitaEmpresaCentavos,
      ocupacaoPct,
      ticketMedioCentavos,
      comandos: finance.totals.comandos
    },
    top3Actions: actions.slice(0, 3),
    paymentsByMethod: finance.porForma,
    finance
  };
}

module.exports = { buildDashboard };

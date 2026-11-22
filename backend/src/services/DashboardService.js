const { buildFinanceReadModel } = require('./FinanceReadModel');

function buildDashboard(snapshot) {
  const finance = buildFinanceReadModel(snapshot);
  const agendamentos = snapshot.agendamentos || [];
  // Atendimentos realizados sobre os agendados (antes chamado de "ocupação", que é outra coisa: a
  // ocupação real, por minuto de cadeira, está no cockpit e em /insights/occupancy). Reagendado foi
  // substituído por outro agendamento que já está na lista: contá-lo duplicaria o atendimento.
  const concluidos = agendamentos.filter(a => ['concluido', 'fechado'].includes(a.status)).length;
  const totalAgenda = agendamentos.filter(a => a.status !== 'reagendado').length;
  const realizadosPct = totalAgenda ? Math.round((concluidos / totalAgenda) * 100) : null;
  // Ticket médio: valores já descontam estornos; comanda 100% estornada sai da base (D-013).
  const baseTicket = finance.totals.comandasValidas ?? finance.totals.comandos;
  const ticketMedioCentavos = baseTicket ? Math.round((finance.totals.itensLiquidosCentavos || finance.totals.servicosLiquidosCentavos) / baseTicket) : 0;

  // D-065: sem "scoreHope" (fórmula inventada: ocupação × 0,4 + 40) e sem "top3Actions" completadas
  // com "Operação estável". As decisões com o porquê estão no cockpit (D-064).
  return {
    kpis: {
      servicosLiquidosCentavos: finance.totals.servicosLiquidosCentavos,
      produtosLiquidosCentavos: finance.totals.produtosLiquidosCentavos || 0,
      itensLiquidosCentavos: finance.totals.itensLiquidosCentavos || finance.totals.servicosLiquidosCentavos,
      receitaEmpresaCentavos: finance.totals.receitaEmpresaCentavos,
      realizadosPct,
      ticketMedioCentavos,
      comandos: finance.totals.comandos
    },
    paymentsByMethod: finance.porForma,
    finance
  };
}

module.exports = { buildDashboard };

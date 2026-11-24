const { buildFinanceReadModel } = require('./FinanceReadModel');

function indicadoresOperacionais(agendamentos) {
  // Atendimentos realizados sobre os agendados (antes chamado de "ocupação", que é outra coisa: a
  // ocupação real, por minuto de cadeira, está no cockpit e em /insights/occupancy). Reagendado foi
  // substituído por outro agendamento que já está na lista: contá-lo duplicaria o atendimento.
  const concluidos = agendamentos.filter(a => ['concluido', 'fechado'].includes(a.status)).length;
  const totalAgenda = agendamentos.filter(a => a.status !== 'reagendado').length;
  return { realizadosPct: totalAgenda ? Math.round((concluidos / totalAgenda) * 100) : null };
}

function buildDashboard(snapshot) {
  const finance = buildFinanceReadModel(snapshot);
  const operacionais = indicadoresOperacionais(snapshot.agendamentos || []);
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
      ...operacionais,
      ticketMedioCentavos,
      comandos: finance.totals.comandos
    },
    paymentsByMethod: finance.porForma,
    finance
  };
}

// A dobra da PWA precisa apenas dos agregados de pagamentos e repasses.
// O mesmo read model aplica estornos e gorjetas nos dois formatos da resposta.
async function pagamentosERepassesDoPainel(repo) {
  const ler = (tabela, campos) => repo.list(tabela, { empresa_id: repo.empresaId }, { campos, ordem: 'id' });
  const [comandoItens, comandoPagamentos, comandoGorjetas, comandaEstornos, comandaEstornoItens, comandaEstornoPagamentos, comandaEstornoGorjetas] = await Promise.all([
    ler('comando_itens', 'id,tipo,profissional_id,comissao_centavos,valor_liquido_centavos,total_venda_centavos'),
    ler('comando_pagamentos', 'forma_code,valor_centavos,taxa_total_centavos,taxa_servico_centavos,taxa_gorjeta_centavos'),
    ler('comando_gorjetas', 'profissional_id,valor_liquido_centavos'),
    ler('comanda_estornos', 'id'),
    ler('comanda_estorno_itens', 'estorno_id,comando_item_id,valor_liquido_centavos,comissao_centavos'),
    ler('comanda_estorno_pagamentos', 'forma_code,valor_centavos'),
    ler('comanda_estorno_gorjetas', 'estorno_id,profissional_id,valor_liquido_centavos')
  ]);
  const { porForma, repassesPorProfissional } = buildFinanceReadModel({
    comandoItens, comandoPagamentos, comandoGorjetas, comandaEstornos,
    comandaEstornoItens, comandaEstornoPagamentos, comandaEstornoGorjetas
  });
  return { paymentsByMethod: porForma, finance: { repassesPorProfissional } };
}

module.exports = { buildDashboard, indicadoresOperacionais, pagamentosERepassesDoPainel };

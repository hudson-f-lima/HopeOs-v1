// F1.2 — Fluxo de caixa projetado: D+n recebíveis líquidos por forma de pagamento

function projectCashflow(comandoPagamentos, formasPagamento, dataBaseStr, daysAhead = 30) {
  // Agrupa pagamentos por data de liquidação (data da comanda + dias_recebimento da forma)
  const hoje = new Date(dataBaseStr + 'T00:00:00');
  const curva = {};

  // Inicializa curva para todos os dias de hoje até +daysAhead
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i);
    const dateKey = d.toISOString().split('T')[0];
    curva[dateKey] = {
      data: dateKey,
      brutoCentavos: 0,
      taxaCentavos: 0,
      liquidoCentavos: 0,
      porForma: {}
    };
  }

  // Mapear formas para dias de recebimento (fallback 0 para dinheiro)
  const formasMap = {};
  formasPagamento.forEach(f => {
    formasMap[f.code] = f.dias_recebimento || 0;
  });

  // Processa cada pagamento
  comandoPagamentos.forEach(pag => {
    const dias = formasMap[pag.forma_code] || 0;
    const dataLiquidacao = new Date(hoje);
    dataLiquidacao.setDate(dataLiquidacao.getDate() + dias);
    const dateKey = dataLiquidacao.toISOString().split('T')[0];

    if (curva[dateKey]) {
      const bruto = pag.valor_centavos || 0;
      const taxa = pag.taxa_total_centavos || 0;
      const liquido = bruto - taxa;

      curva[dateKey].brutoCentavos += bruto;
      curva[dateKey].taxaCentavos += taxa;
      curva[dateKey].liquidoCentavos += liquido;

      if (!curva[dateKey].porForma[pag.forma_code]) {
        curva[dateKey].porForma[pag.forma_code] = {
          formaCode: pag.forma_code,
          liquidoCentavos: 0
        };
      }
      curva[dateKey].porForma[pag.forma_code].liquidoCentavos += liquido;
    }
  });

  // Ordenar por data e converter porForma em array
  return Object.values(curva)
    .sort((a, b) => new Date(a.data) - new Date(b.data))
    .map(d => ({
      ...d,
      porForma: Object.values(d.porForma)
    }));
}

function computeAccumulatedCashflow(curva, days) {
  // Calcula acumulado até N dias
  let acum = 0;
  const target = new Date();
  target.setDate(target.getDate() + days);

  for (const entry of curva) {
    if (new Date(entry.data) > target) break;
    acum += entry.liquidoCentavos;
  }

  return acum;
}

module.exports = {
  projectCashflow,
  computeAccumulatedCashflow
};

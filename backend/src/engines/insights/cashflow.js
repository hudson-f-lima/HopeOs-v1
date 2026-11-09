// F1.2 — Fluxo de caixa projetado: D+n recebíveis líquidos por forma de pagamento

// Datas em UTC (YYYY-MM-DD), nunca no fuso local do processo.
function addDiasUtc(data, dias) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function projectCashflow(comandoPagamentos, formasPagamento, dataBaseStr, daysAhead = 30) {
  // Liquidação = data do pagamento (pag.data: data da comanda ou do estorno) +
  // dias_recebimento da forma. Sem pag.data, usa a data-base (compatível com o
  // uso antigo). Só entra o que liquida dentro de [data-base, data-base + daysAhead].
  const curva = {};
  for (let i = 0; i <= daysAhead; i++) {
    const dateKey = addDiasUtc(dataBaseStr, i);
    curva[dateKey] = { data: dateKey, brutoCentavos: 0, taxaCentavos: 0, liquidoCentavos: 0, porForma: {} };
  }

  const formasMap = {};
  formasPagamento.forEach(f => { formasMap[f.code] = f.dias_recebimento || 0; });

  comandoPagamentos.forEach(pag => {
    const dias = formasMap[pag.forma_code] || 0;
    const base = pag.data ? String(pag.data).slice(0, 10) : dataBaseStr;
    const dateKey = addDiasUtc(base, dias);
    if (!curva[dateKey]) return;
    const bruto = pag.valor_centavos || 0;
    const taxa = pag.taxa_total_centavos || 0;
    const liquido = bruto - taxa;
    curva[dateKey].brutoCentavos += bruto;
    curva[dateKey].taxaCentavos += taxa;
    curva[dateKey].liquidoCentavos += liquido;
    if (!curva[dateKey].porForma[pag.forma_code]) curva[dateKey].porForma[pag.forma_code] = { formaCode: pag.forma_code, liquidoCentavos: 0 };
    curva[dateKey].porForma[pag.forma_code].liquidoCentavos += liquido;
  });

  return Object.values(curva)
    .sort((a, b) => a.data.localeCompare(b.data))
    .map(d => ({ ...d, porForma: Object.values(d.porForma) }));
}

function computeAccumulatedCashflow(curva, days) {
  // Acumulado até D+N contado a partir do primeiro dia da curva (data-base),
  // não do relógio do servidor: a mesma curva deve dar o mesmo resultado em qualquer dia.
  if (!curva.length) return 0;
  const target = new Date(`${curva[0].data}T00:00:00Z`);
  target.setUTCDate(target.getUTCDate() + days);
  const targetKey = target.toISOString().split('T')[0];

  let acum = 0;
  for (const entry of curva) {
    if (entry.data > targetKey) break;
    acum += entry.liquidoCentavos;
  }
  return acum;
}

module.exports = {
  projectCashflow,
  computeAccumulatedCashflow
};

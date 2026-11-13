// Taxa efetiva do cartão parcelado com antecipação — função pura, só para AJUDAR a
// preencher `formas_pagamento.taxa_pct`. O que vale no fechamento é a taxa gravada na
// forma de pagamento; nada aqui toca comanda, comissão ou ledger.
//
// Modelo (juros simples, pro rata): a parcela k vence em 30·k dias; antecipar tudo
// para hoje custa a taxa mensal × prazo médio (n+1)/2 meses, cobrada sobre o valor já
// líquido do MDR. À vista (1x) com antecipação = 1 mês.
//   efetiva% = mdr + (100 − mdr) × antecipaçãoMês × (n+1)/2 ÷ 100
// Adquirentes usam variações (dias úteis, juros compostos, D+2). É estimativa: o
// extrato da adquirente manda.
const arred4 = v => Math.round(v * 10000) / 10000;

function calcularTaxaEfetiva({ mdrPct, antecipacaoMesPct = 0, parcelas = 1 }) {
  const mdr = Number(mdrPct); const ant = Number(antecipacaoMesPct); const n = Number(parcelas);
  if (!Number.isFinite(mdr) || mdr < 0 || mdr > 100) throw new RangeError('mdrPct deve estar entre 0 e 100.');
  if (!Number.isFinite(ant) || ant < 0 || ant > 100) throw new RangeError('antecipacaoMesPct deve estar entre 0 e 100.');
  if (!Number.isInteger(n) || n < 1 || n > 12) throw new RangeError('parcelas deve ser inteiro de 1 a 12.');
  const prazoMedioMeses = (n + 1) / 2;
  const antecipacaoPct = ant > 0 ? (100 - mdr) * ant * prazoMedioMeses / 100 : 0;
  const taxaEfetivaPct = arred4(Math.min(100, mdr + antecipacaoPct));
  return {
    parcelas: n, mdrPct: arred4(mdr), antecipacaoMesPct: arred4(ant),
    prazoMedioDias: Math.round(prazoMedioMeses * 30),
    antecipacaoPct: arred4(antecipacaoPct),
    taxaEfetivaPct,
    // Quanto sobra de uma venda de R$ 100,00.
    liquidoPor100Centavos: Math.round((100 - taxaEfetivaPct) * 100)
  };
}

module.exports = { calcularTaxaEfetiva };

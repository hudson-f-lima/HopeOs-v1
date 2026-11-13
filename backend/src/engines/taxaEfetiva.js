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

// Formas "Crédito 2x" … "Crédito Nx" a partir das taxas da maquininha. As adquirentes
// costumam ter uma taxa para 2–6x e outra para 7–12x; se a segunda não vier, vale a
// primeira. Com antecipação o dinheiro cai no dia seguinte (1 dia); sem, a primeira
// parcela cai em 30 dias (o cadastro guarda um prazo só por forma).
function gerarParcelados({ mdrAte6Pct, mdr7a12Pct, antecipacaoMesPct = 0, ateParcelas = 12 }) {
  const ate = Number(ateParcelas);
  if (!Number.isInteger(ate) || ate < 2 || ate > 12) throw new RangeError('ateParcelas deve ser inteiro de 2 a 12.');
  const segunda = mdr7a12Pct === undefined || mdr7a12Pct === null || mdr7a12Pct === '' ? mdrAte6Pct : mdr7a12Pct;
  const formas = [];
  for (let n = 2; n <= ate; n++) {
    const t = calcularTaxaEfetiva({ mdrPct: n <= 6 ? mdrAte6Pct : segunda, antecipacaoMesPct, parcelas: n });
    formas.push({ code: `credito_${n}x`, label: `Crédito ${n}x`, parcelas: n, taxaPct: t.taxaEfetivaPct, diasRecebimento: t.antecipacaoMesPct > 0 ? 1 : 30, liquidoPor100Centavos: t.liquidoPor100Centavos });
  }
  return formas;
}

module.exports = { calcularTaxaEfetiva, gerarParcelados };

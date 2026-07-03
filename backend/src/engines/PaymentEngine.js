const { roundCents, sumCents } = require('./money');
const { allocateProportional } = require('./allocation');

function feeForPayment(payment, forma) {
  const pct = Number(forma?.taxa_pct ?? forma?.taxaPct ?? 0);
  const fixed = roundCents(forma?.taxa_fixa_centavos ?? forma?.taxaFixaCentavos ?? forma?.taxaFixa ?? 0);
  return roundCents((payment.valorCentavos * pct) / 100 + fixed);
}

function normalizePayment(payment) {
  return {
    formaCode: payment.formaCode || payment.formaId || payment.code || payment.id,
    valorCentavos: roundCents(payment.valorCentavos ?? payment.valor_centavos ?? payment.valor ?? 0)
  };
}

function calculatePayments({ payments, formasPagamento, servicesNetCents, tipGrossCents }) {
  const normalized = (payments || []).map(normalizePayment).filter(p => p.valorCentavos > 0);
  const expectedTotal = roundCents(servicesNetCents) + roundCents(tipGrossCents);
  const receivedTotal = sumCents(normalized, 'valorCentavos');

  if (normalized.length === 0 && expectedTotal > 0) {
    { const { createAppError } = require('../errors'); throw createAppError('PAYMENT_REQUIRED', 'Informe pelo menos uma forma de pagamento.', 422); }
  }
  if (receivedTotal !== expectedTotal) {
    const { createAppError } = require('../errors');
    throw createAppError('PAYMENT_TOTAL_MISMATCH', `Pagamento inconsistente. Recebido=${receivedTotal} Esperado=${expectedTotal}`, 422, { receivedTotal, expectedTotal });
  }

  const formasByCode = new Map((formasPagamento || []).map(f => [f.code || f.id || f.formaCode, f]));
  const enriched = normalized.map(payment => {
    const forma = formasByCode.get(payment.formaCode);
    if (!forma) {
      const { createAppError } = require('../errors');
      throw createAppError('PAYMENT_METHOD_NOT_FOUND', `Forma de pagamento não encontrada: ${payment.formaCode}`, 422, { formaCode: payment.formaCode });
    }
    const taxaTotalCentavos = feeForPayment(payment, forma);
    const [taxaServicoCentavos, taxaGorjetaCentavos] = allocateProportional(
      taxaTotalCentavos,
      [{ peso: servicesNetCents }, { peso: tipGrossCents }],
      'peso'
    );
    return {
      ...payment,
      label: forma.label || forma.nome || payment.formaCode,
      taxaPct: Number(forma.taxa_pct ?? forma.taxaPct ?? 0),
      taxaFixaCentavos: roundCents(forma.taxa_fixa_centavos ?? forma.taxaFixaCentavos ?? forma.taxaFixa ?? 0),
      taxaTotalCentavos,
      taxaServicoCentavos,
      taxaGorjetaCentavos
    };
  });

  return {
    payments: enriched,
    totalRecebidoCentavos: receivedTotal,
    taxaTotalCentavos: sumCents(enriched, 'taxaTotalCentavos'),
    taxaServicoCentavos: sumCents(enriched, 'taxaServicoCentavos'),
    taxaGorjetaCentavos: sumCents(enriched, 'taxaGorjetaCentavos')
  };
}

module.exports = { calculatePayments };

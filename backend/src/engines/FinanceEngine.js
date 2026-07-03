const { roundCents, sumCents } = require('./money');
const { allocateProportional } = require('./allocation');
const { calculatePayments } = require('./PaymentEngine');
const { splitTipsHybrid } = require('./TipSplitEngine');
const { calculateItemCommission } = require('./CommissionEngine');
const { createAppError } = require('../errors');

function normalizeResolvedItem(item) {
  if (item._trustedSource !== 'server_catalog') {
    throw createAppError(
      'UNTRUSTED_FINANCIAL_INPUT',
      'Item financeiro precisa ser resolvido no backend a partir do banco.',
      422,
      { tipo: item.tipo, servicoId: item.servicoId || item.servico_id, produtoId: item.produtoId || item.produto_id, profissionalId: item.profissionalId || item.profissional_id }
    );
  }
  const quantidade = Number(item.quantidade || 1);
  const precoUnitarioCentavos = roundCents(item.precoUnitarioCentavos ?? item.preco_unitario_centavos ?? item.valorBrutoCentavos ?? 0);
  const custoUnitarioCentavos = roundCents(item.custoUnitarioCentavos ?? item.custo_unitario_centavos ?? 0);
  const totalVendaCentavos = roundCents(item.totalVendaCentavos ?? item.total_venda_centavos ?? precoUnitarioCentavos * quantidade);
  const totalCustoCentavos = roundCents(item.totalCustoCentavos ?? item.total_custo_centavos ?? custoUnitarioCentavos * quantidade);

  return {
    id: item.id,
    tipo: item.tipo || 'servico',
    servicoId: item.servicoId || null,
    produtoId: item.produtoId || null,
    profissionalId: item.profissionalId || null,
    descricao: item.descricao || (item.tipo === 'produto' ? 'Produto' : 'Serviço'),
    quantidade,
    precoUnitarioCentavos,
    custoUnitarioCentavos,
    totalVendaCentavos,
    totalCustoCentavos,
    lucroBrutoCentavos: totalVendaCentavos - totalCustoCentavos,
    valorBrutoCentavos: totalVendaCentavos,
    duracaoMin: Number(item.duracaoMin || 0),
    comissaoPct: Number(item.comissaoPct || 0),
    modeloComissao: item.modeloComissao || 'bruto_salao'
  };
}

function assertProductsNotBelowCost(items) {
  for (const item of items || []) {
    if (item.tipo !== 'produto') continue;
    if (roundCents(item.valorLiquidoCentavos || 0) < roundCents(item.totalCustoCentavos || 0)) {
      throw createAppError('PRODUCT_BELOW_COST', 'Produto vendido abaixo do custo após desconto.', 422, {
        produtoId: item.produtoId,
        valorLiquidoCentavos: item.valorLiquidoCentavos,
        totalCustoCentavos: item.totalCustoCentavos,
        descontoCentavos: item.descontoCentavos
      });
    }
  }
}

function previewCheckout({ itens, payments, formasPagamento, descontoCentavos = 0, gorjetaCentavos = 0 }) {
  const rawItems = (itens || []).map(normalizeResolvedItem);
  if (rawItems.length === 0) {
    throw createAppError('CHECKOUT_EMPTY_ITEMS', 'A comanda precisa ter pelo menos um item.', 422);
  }

  const subtotalServicosCentavos = sumCents(rawItems.filter(i => i.tipo === 'servico'), 'valorBrutoCentavos');
  const subtotalProdutosCentavos = sumCents(rawItems.filter(i => i.tipo === 'produto'), 'valorBrutoCentavos');
  const totalItensCentavos = subtotalServicosCentavos + subtotalProdutosCentavos;
  const totalCustoProdutosCentavos = sumCents(rawItems.filter(i => i.tipo === 'produto'), 'totalCustoCentavos');

  const desconto = Math.max(0, Math.min(roundCents(descontoCentavos), totalItensCentavos));
  const discountAllocations = allocateProportional(desconto, rawItems, 'valorBrutoCentavos');

  const itemNets = rawItems.map((item, i) => {
    const valorLiquidoCentavos = item.valorBrutoCentavos - discountAllocations[i];
    return {
      ...item,
      descontoCentavos: discountAllocations[i],
      valorLiquidoCentavos,
      totalVendaLiquidaCentavos: valorLiquidoCentavos,
      lucroBrutoCentavos: item.tipo === 'produto' ? valorLiquidoCentavos - item.totalCustoCentavos : item.lucroBrutoCentavos
    };
  });

  assertProductsNotBelowCost(itemNets);

  const servicosLiquidosCentavos = sumCents(itemNets.filter(i => i.tipo === 'servico'), 'valorLiquidoCentavos');
  const produtosLiquidosCentavos = sumCents(itemNets.filter(i => i.tipo === 'produto'), 'valorLiquidoCentavos');
  const itensLiquidosCentavos = servicosLiquidosCentavos + produtosLiquidosCentavos;
  const lucroLiquidoProdutosCentavos = sumCents(itemNets.filter(i => i.tipo === 'produto'), 'lucroBrutoCentavos');
  const tipGross = roundCents(gorjetaCentavos || 0);

  const paymentResult = calculatePayments({
    payments,
    formasPagamento,
    servicesNetCents: itensLiquidosCentavos,
    tipGrossCents: tipGross
  });

  const itemFeeAllocations = allocateProportional(
    paymentResult.taxaServicoCentavos,
    itemNets,
    'valorLiquidoCentavos'
  );

  const itemCommissioned = itemNets
    .map((item, i) => ({ ...item, taxaItemCentavos: itemFeeAllocations[i] }))
    .map(calculateItemCommission);

  let tips = splitTipsHybrid({ tipGrossCents: tipGross, items: itemCommissioned });
  const tipFeeAllocations = allocateProportional(paymentResult.taxaGorjetaCentavos, tips, 'gorjetaBrutaCentavos');
  tips = tips.map((tip, i) => ({
    ...tip,
    taxaGorjetaCentavos: tipFeeAllocations[i],
    gorjetaLiquidaCentavos: tip.gorjetaBrutaCentavos - tipFeeAllocations[i]
  }));

  const totalComissaoCentavos = sumCents(itemCommissioned, 'comissaoCentavos');
  const totalGorjetaLiquidaCentavos = sumCents(tips, 'gorjetaLiquidaCentavos');
  const receitaEmpresaCentavos = sumCents(itemCommissioned, 'receitaEmpresaCentavos');

  return {
    ok: true,
    totals: {
      subtotalServicosCentavos,
      subtotalProdutosCentavos,
      totalItensCentavos,
      totalCustoProdutosCentavos,
      lucroBrutoProdutosCentavos: lucroLiquidoProdutosCentavos,
      lucroLiquidoProdutosCentavos,
      descontoCentavos: desconto,
      servicosLiquidosCentavos,
      produtosLiquidosCentavos,
      itensLiquidosCentavos,
      gorjetaBrutaCentavos: tipGross,
      totalRecebidoCentavos: paymentResult.totalRecebidoCentavos,
      taxaTotalCentavos: paymentResult.taxaTotalCentavos,
      taxaServicoCentavos: paymentResult.taxaServicoCentavos,
      taxaGorjetaCentavos: paymentResult.taxaGorjetaCentavos,
      totalComissaoCentavos,
      totalGorjetaLiquidaCentavos,
      receitaEmpresaCentavos
    },
    itens: itemCommissioned,
    payments: paymentResult.payments,
    gorjetas: tips,
    rules: {
      sourceOfTruth: 'server_catalog',
      itemTypes: ['servico', 'produto'],
      productCommissionModelSource: 'produto',
      productWithoutProfessionalCommission: 'zero',
      productBelowCost: 'blocked',
      tipSplit: 'automatic_hybrid_70_value_30_time',
      frontendCalculates: false,
      frontendDecidesFinancialInputs: false,
      negativeCommissionBlocked: true,
      productInventoryTransactional: true
    }
  };
}

module.exports = { previewCheckout };

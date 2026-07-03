const { createAppError } = require('../errors');
const { roundCents } = require('../engines/money');

const FORBIDDEN_ITEM_FIELDS = [
  'valor', 'valorCentavos', 'valor_centavos', 'valorBrutoCentavos', 'valor_bruto_centavos',
  'preco', 'precoCentavos', 'preco_unitario_centavos', 'precoUnitarioCentavos', 'precoVendaCentavos',
  'custo', 'custoCentavos', 'custo_unitario_centavos', 'custoUnitarioCentavos',
  'duracao', 'duracaoMin', 'duracao_min',
  'comissao', 'comissaoPct', 'comissao_pct', 'comissaoCentavos',
  'modeloComissao', 'modelo_comissao',
  'taxaItemCentavos', 'receitaEmpresaCentavos',
  'totalVendaCentavos', 'totalCustoCentavos', 'lucroBrutoCentavos', 'margem'
];

const FORBIDDEN_PAYMENT_FIELDS = ['taxaPct', 'taxa_pct', 'taxaFixaCentavos', 'taxa_fixa_centavos'];
const FORBIDDEN_ROOT_FIELDS = ['formasPagamento', 'receitaEmpresaCentavos', 'totalComissaoCentavos', 'taxaTotalCentavos'];

function assertNoForbiddenFinancialInputs(body) {
  const rootFound = FORBIDDEN_ROOT_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(body, field));
  if (rootFound.length) {
    throw createAppError('FRONTEND_FINANCIAL_INPUT_FORBIDDEN', 'Payload contém regras financeiras proibidas no nível da comanda.', 422, { fields: rootFound });
  }

  for (const [index, item] of (body.itens || []).entries()) {
    const found = FORBIDDEN_ITEM_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(item, field));
    if (found.length) {
      throw createAppError('FRONTEND_FINANCIAL_INPUT_FORBIDDEN', `Item ${index + 1} contém regras financeiras proibidas.`, 422, { itemIndex: index, fields: found });
    }
  }

  for (const [index, payment] of (body.payments || []).entries()) {
    const found = FORBIDDEN_PAYMENT_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(payment, field));
    if (found.length) {
      throw createAppError('FRONTEND_FINANCIAL_INPUT_FORBIDDEN', `Pagamento ${index + 1} contém taxa proibida.`, 422, { paymentIndex: index, fields: found });
    }
  }
}

function validateCheckoutPayload(body) {
  if (!body || typeof body !== 'object') throw createAppError('INVALID_PAYLOAD', 'Payload inválido.', 400);
  if (!Array.isArray(body.itens) || body.itens.length === 0) throw createAppError('CHECKOUT_EMPTY_ITEMS', 'Informe itens da comanda.', 422);
  if (!Array.isArray(body.payments) || body.payments.length === 0) throw createAppError('PAYMENT_REQUIRED', 'Informe payments[].', 422);

  assertNoForbiddenFinancialInputs(body);

  for (const [i, item] of body.itens.entries()) {
    if (!item.tipo && !item.type) throw createAppError('MISSING_ITEM_TYPE', `Item ${i + 1}: tipo obrigatório.`, 422, { itemIndex: i });
    const tipo = item.tipo || item.type;
    if (!['servico', 'produto'].includes(tipo)) throw createAppError('INVALID_ITEM_TYPE', `Item ${i + 1}: tipo inválido.`, 422, { itemIndex: i, tipo });

    if (tipo === 'servico') {
      if (!item.profissionalId && !item.profissional_id) throw createAppError('PROFESSIONAL_REQUIRED', `Item ${i + 1}: profissional obrigatório.`, 422, { itemIndex: i });
      if (!item.servicoId && !item.servico_id) throw createAppError('SERVICE_ID_REQUIRED', `Item ${i + 1}: servicoId obrigatório.`, 422, { itemIndex: i });
      if (item.produtoId || item.produto_id) throw createAppError('INVALID_ITEM_REFERENCE', `Item ${i + 1}: serviço não pode conter produtoId.`, 422, { itemIndex: i });
    }

    if (tipo === 'produto') {
      if (!item.produtoId && !item.produto_id) throw createAppError('PRODUCT_ID_REQUIRED', `Item ${i + 1}: produtoId obrigatório.`, 422, { itemIndex: i });
      if (item.servicoId || item.servico_id) throw createAppError('INVALID_ITEM_REFERENCE', `Item ${i + 1}: produto não pode conter servicoId.`, 422, { itemIndex: i });
      const quantidade = Number(item.quantidade || 0);
      if (!Number.isInteger(quantidade) || quantidade <= 0) throw createAppError('PRODUCT_QUANTITY_REQUIRED', `Item ${i + 1}: quantidade obrigatória.`, 422, { itemIndex: i, quantidade });
    }
  }

  for (const [i, payment] of body.payments.entries()) {
    if (!payment.formaCode && !payment.formaId && !payment.code && !payment.id) throw createAppError('PAYMENT_METHOD_REQUIRED', `Pagamento ${i + 1}: formaCode obrigatório.`, 422, { paymentIndex: i });
    const valor = roundCents(payment.valorCentavos ?? payment.valor_centavos ?? payment.valor ?? 0);
    if (valor <= 0) throw createAppError('PAYMENT_VALUE_REQUIRED', `Pagamento ${i + 1}: valor deve ser maior que zero.`, 422, { paymentIndex: i });
  }

  return body;
}

module.exports = { validateCheckoutPayload, assertNoForbiddenFinancialInputs };

const { createAppError } = require('../errors');

function assertInventoryForResolvedItems(items) {
  for (const item of items || []) {
    if (item.tipo !== 'produto' || item.controlaEstoque === false) continue;
    const estoqueAtual = Number(item.estoqueAtual || 0);
    const quantidade = Number(item.quantidade || 0);
    if (estoqueAtual < quantidade) {
      throw createAppError('PRODUCT_OUT_OF_STOCK', 'Estoque insuficiente para o produto.', 422, {
        produtoId: item.produtoId,
        estoqueAtual,
        quantidade
      });
    }
  }
}

module.exports = { assertInventoryForResolvedItems };

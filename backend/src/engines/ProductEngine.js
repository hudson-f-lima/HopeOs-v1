const { roundCents } = require('./money');
const { createAppError } = require('../errors');

function productId(row) { return row?.id || row?.produto_id || row?.produtoId; }

function findProductRequired(produtos, produtoId) {
  const produto = (produtos || []).find(p => productId(p) === produtoId);
  if (!produto) throw createAppError('PRODUCT_NOT_FOUND', `Produto não encontrado: ${produtoId}`, 422, { produtoId });
  return produto;
}

function resolveProductItem({ payloadItem, produtos, profissionais = [] }) {
  const produtoId = payloadItem.produtoId || payloadItem.produto_id;
  const quantidade = Number(payloadItem.quantidade || 0);
  const profissionalId = payloadItem.profissionalId || payloadItem.profissional_id || null;

  if (!produtoId) throw createAppError('PRODUCT_ID_REQUIRED', 'Item produto precisa de produtoId.', 422);
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    throw createAppError('PRODUCT_QUANTITY_REQUIRED', 'Produto precisa de quantidade inteira maior que zero.', 422, { produtoId, quantidade });
  }

  const produto = findProductRequired(produtos, produtoId);
  if (produto.ativo === false) throw createAppError('PRODUCT_INACTIVE', `Produto inativo: ${produtoId}`, 422, { produtoId });

  if (profissionalId) {
    const profissional = (profissionais || []).find(p => (p.id || p.profissional_id) === profissionalId);
    if (!profissional) throw createAppError('PROFESSIONAL_NOT_FOUND', `Profissional não encontrado: ${profissionalId}`, 422, { profissionalId });
    if (profissional.ativo === false) throw createAppError('PROFESSIONAL_INACTIVE', `Profissional inativo: ${profissionalId}`, 422, { profissionalId });
  }

  const controlaEstoque = produto.controla_estoque !== false && produto.controlaEstoque !== false;
  const estoqueAtual = Number(produto.estoque_atual ?? produto.estoqueAtual ?? 0);
  if (controlaEstoque && estoqueAtual < quantidade) {
    throw createAppError('PRODUCT_OUT_OF_STOCK', 'Estoque insuficiente para o produto.', 422, { produtoId, estoqueAtual, quantidade });
  }

  const precoUnitarioCentavos = roundCents(produto.preco_venda_centavos ?? produto.precoVendaCentavos ?? 0);
  const custoUnitarioCentavos = roundCents(produto.custo_centavos ?? produto.custoCentavos ?? 0);
  if (precoUnitarioCentavos < custoUnitarioCentavos) {
    throw createAppError('PRODUCT_BELOW_COST', 'Produto com preço de venda abaixo do custo.', 422, {
      produtoId,
      precoUnitarioCentavos,
      custoUnitarioCentavos
    });
  }

  // Regra V1: comissão de produto vem do produto, não do profissional.
  // Sem vendedor/profissionalId, sem comissão.
  const comissaoPct = profissionalId ? Number(produto.comissao_pct ?? produto.comissaoPct ?? 0) : 0;
  const totalVendaCentavos = precoUnitarioCentavos * quantidade;
  const totalCustoCentavos = custoUnitarioCentavos * quantidade;
  const lucroBrutoCentavos = totalVendaCentavos - totalCustoCentavos;

  return {
    _trustedSource: 'server_catalog',
    tipo: 'produto',
    id: payloadItem.id,
    servicoId: null,
    produtoId,
    profissionalId,
    quantidade,
    descricao: produto.nome || produto.label || 'Produto',
    precoUnitarioCentavos,
    custoUnitarioCentavos,
    totalVendaCentavos,
    totalCustoCentavos,
    lucroBrutoCentavos,
    valorBrutoCentavos: totalVendaCentavos,
    duracaoMin: 0,
    comissaoPct,
    modeloComissao: produto.modelo_comissao || produto.modeloComissao || 'bruto_salao',
    controlaEstoque,
    estoqueAtual
  };
}

module.exports = { resolveProductItem, findProductRequired };

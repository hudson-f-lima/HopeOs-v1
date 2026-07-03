const assert = require('assert');
const path = require('path');
const { validateCheckoutPayload } = require('../src/validators/checkout.validator');
const { resolveCheckoutInput } = require('../src/engines/CheckoutInputResolver');
const { previewCheckout } = require('../src/engines/FinanceEngine');

const servicos = require(path.join(__dirname, '../../data/servicos.json'));
const produtos = require(path.join(__dirname, '../../data/produtos.json'));
const profissionais = require(path.join(__dirname, '../../data/profissionais.json'));
const profissionalServicos = require(path.join(__dirname, '../../data/profissional_servicos.json'));
const formasPagamento = require(path.join(__dirname, '../../data/formas_pagamento.json'));

const PROD = {
  pomada: '44444444-4444-4444-4444-444444444441'
};
const P = {
  eduardo: '33333333-3333-3333-3333-333333333331'
};

function errCode(fn) {
  try { fn(); }
  catch (err) { return err.code; }
  throw new Error('Expected error, but function did not throw.');
}

function runPreview(payload, ctx = {}) {
  const validated = validateCheckoutPayload(payload);
  const resolved = resolveCheckoutInput({
    payload: validated,
    servicos: ctx.servicos || servicos,
    produtos: ctx.produtos || produtos,
    profissionais: ctx.profissionais || profissionais,
    profissionalServicos: ctx.profissionalServicos === undefined ? profissionalServicos : ctx.profissionalServicos,
    formasPagamento: ctx.formasPagamento || formasPagamento
  });
  return previewCheckout(resolved);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('12.1 bloqueia item sem tipo', () => {
  const code = errCode(() => validateCheckoutPayload({
    itens: [{ servicoId: 'x', profissionalId: 'y' }],
    payments: [{ formaCode: 'dinheiro', valorCentavos: 5000 }]
  }));
  assert.strictEqual(code, 'MISSING_ITEM_TYPE');
});

test('12.2 produto resolve preço, custo, margem e comissão pelo catálogo', () => {
  const out = runPreview({
    itens: [{ tipo: 'produto', produtoId: PROD.pomada, quantidade: 2, profissionalId: P.eduardo }],
    payments: [{ formaCode: 'dinheiro', valorCentavos: 9000 }]
  });
  const item = out.itens[0];
  assert.strictEqual(item.tipo, 'produto');
  assert.strictEqual(item.precoUnitarioCentavos, 4500);
  assert.strictEqual(item.custoUnitarioCentavos, 1800);
  assert.strictEqual(item.totalVendaCentavos, 9000);
  assert.strictEqual(item.totalCustoCentavos, 3600);
  assert.strictEqual(item.lucroBrutoCentavos, 5400);
  assert.strictEqual(item.comissaoCentavos, 900);
  assert.strictEqual(out.totals.subtotalProdutosCentavos, 9000);
  assert.strictEqual(out.totals.produtosLiquidosCentavos, 9000);
  assert.strictEqual(out.totals.totalCustoProdutosCentavos, 3600);
  assert.strictEqual(out.totals.lucroBrutoProdutosCentavos, 5400);
  assert.strictEqual(out.totals.lucroLiquidoProdutosCentavos, 5400);
  assert.strictEqual(out.totals.receitaEmpresaCentavos, 4500); // 9000 - 900 - 0 taxa - 3600 custo
});

test('12.3 produto sem estoque bloqueia antes do cálculo', () => {
  const customProdutos = [{
    id: 'prod-low', nome: 'Produto baixo', custo_centavos: 1000, preco_venda_centavos: 3000,
    estoque_atual: 1, estoque_minimo: 1, comissao_pct: 0, controla_estoque: true, ativo: true
  }];
  const code = errCode(() => runPreview({
    itens: [{ tipo: 'produto', produtoId: 'prod-low', quantidade: 2 }],
    payments: [{ formaCode: 'dinheiro', valorCentavos: 6000 }]
  }, { produtos: customProdutos }));
  assert.strictEqual(code, 'PRODUCT_OUT_OF_STOCK');
});

test('12.4 frontend não pode enviar preço/custo/margem/comissão de produto', () => {
  const code = errCode(() => validateCheckoutPayload({
    itens: [{ tipo: 'produto', produtoId: PROD.pomada, quantidade: 1, precoUnitarioCentavos: 1, custoUnitarioCentavos: 1, comissaoPct: 99 }],
    payments: [{ formaCode: 'dinheiro', valorCentavos: 1 }]
  }));
  assert.strictEqual(code, 'FRONTEND_FINANCIAL_INPUT_FORBIDDEN');
});

test('12.5 produto com serviço separa serviços líquidos, produtos líquidos e itens líquidos', () => {
  const out = runPreview({
    itens: [
      { tipo: 'servico', servicoId: '22222222-2222-2222-2222-222222222221', profissionalId: P.eduardo },
      { tipo: 'produto', produtoId: PROD.pomada, quantidade: 1, profissionalId: P.eduardo }
    ],
    payments: [{ formaCode: 'dinheiro', valorCentavos: 9500 }]
  });
  assert.strictEqual(out.itens.length, 2);
  assert.deepStrictEqual(out.itens.map(i => i.tipo), ['servico', 'produto']);
  assert.strictEqual(out.totals.subtotalServicosCentavos, 5000);
  assert.strictEqual(out.totals.subtotalProdutosCentavos, 4500);
  assert.strictEqual(out.totals.totalItensCentavos, 9500);
  assert.strictEqual(out.totals.servicosLiquidosCentavos, 5000);
  assert.strictEqual(out.totals.produtosLiquidosCentavos, 4500);
  assert.strictEqual(out.totals.itensLiquidosCentavos, 9500);
  assert.notStrictEqual(out.totals.servicosLiquidosCentavos, out.totals.itensLiquidosCentavos);
});

test('12.6 produto cadastrado abaixo do custo bloqueia PRODUCT_BELOW_COST', () => {
  const customProdutos = [{
    id: 'prod-loss', nome: 'Produto com prejuízo', custo_centavos: 5000, preco_venda_centavos: 3000,
    estoque_atual: 10, estoque_minimo: 1, comissao_pct: 0, controla_estoque: true, ativo: true
  }];
  const code = errCode(() => runPreview({
    itens: [{ tipo: 'produto', produtoId: 'prod-loss', quantidade: 1 }],
    payments: [{ formaCode: 'dinheiro', valorCentavos: 3000 }]
  }, { produtos: customProdutos }));
  assert.strictEqual(code, 'PRODUCT_BELOW_COST');
});

test('12.7 desconto que joga produto abaixo do custo bloqueia PRODUCT_BELOW_COST', () => {
  const code = errCode(() => runPreview({
    itens: [{ tipo: 'produto', produtoId: PROD.pomada, quantidade: 1 }],
    descontoCentavos: 3000,
    payments: [{ formaCode: 'dinheiro', valorCentavos: 1500 }]
  }));
  assert.strictEqual(code, 'PRODUCT_BELOW_COST');
});

test('12.8 produto sem vendedor tem comissão zero', () => {
  const out = runPreview({
    itens: [{ tipo: 'produto', produtoId: PROD.pomada, quantidade: 1 }],
    payments: [{ formaCode: 'dinheiro', valorCentavos: 4500 }]
  });
  const item = out.itens[0];
  assert.strictEqual(item.profissionalId, null);
  assert.strictEqual(item.comissaoPct, 0);
  assert.strictEqual(item.comissaoCentavos, 0);
  assert.strictEqual(out.totals.totalComissaoCentavos, 0);
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed += 1;
    console.log(`✓ ${t.name}`);
  } catch (err) {
    console.error(`✕ ${t.name}`);
    console.error(err);
    process.exit(1);
  }
}
console.log(`\nProduct Foundation Gate: ${passed}/${tests.length} testes verdes.`);

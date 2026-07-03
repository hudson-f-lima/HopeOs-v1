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

const S = {
  corte: '22222222-2222-2222-2222-222222222221',
  barba: '22222222-2222-2222-2222-222222222222',
  manicure: '22222222-2222-2222-2222-222222222223'
};
const P = {
  eduardo: '33333333-3333-3333-3333-333333333331',
  robson: '33333333-3333-3333-3333-333333333332',
  andressa: '33333333-3333-3333-3333-333333333333'
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

test('01 bloqueia valor financeiro enviado pelo frontend no item', () => {
  const code = errCode(() => validateCheckoutPayload({
    itens: [{ tipo: 'servico', servicoId: S.corte, profissionalId: P.eduardo, valorCentavos: 1 }],
    payments: [{ formaCode: 'dinheiro', valorCentavos: 5000 }]
  }));
  assert.strictEqual(code, 'FRONTEND_FINANCIAL_INPUT_FORBIDDEN');
});

test('02 bloqueia formasPagamento enviada pelo frontend no payload', () => {
  const code = errCode(() => validateCheckoutPayload({
    itens: [{ tipo: 'servico', servicoId: S.corte, profissionalId: P.eduardo }],
    payments: [{ formaCode: 'credito', valorCentavos: 5000 }],
    formasPagamento: [{ code: 'credito', taxa_pct: 0, taxa_fixa_centavos: 0 }]
  }));
  assert.strictEqual(code, 'FRONTEND_FINANCIAL_INPUT_FORBIDDEN');
});

test('03 resolve preço, comissão e modelo pelo catálogo server-side', () => {
  const out = runPreview({
    itens: [{ tipo: 'servico', servicoId: S.corte, profissionalId: P.eduardo }],
    payments: [{ formaCode: 'credito', valorCentavos: 5000 }]
  });
  assert.strictEqual(out.totals.subtotalServicosCentavos, 5000);
  assert.strictEqual(out.totals.subtotalProdutosCentavos, 0);
  assert.strictEqual(out.totals.totalItensCentavos, 5000);
  assert.strictEqual(out.totals.taxaTotalCentavos, 100);
  assert.strictEqual(out.itens[0].tipo, 'servico');
  assert.strictEqual(out.itens[0].modeloComissao, 'dividido');
  assert.strictEqual(out.itens[0].comissaoPct, 45);
  assert.strictEqual(out.itens[0].comissaoCentavos, 2205);
  assert.strictEqual(out.totals.receitaEmpresaCentavos, 2695);
});

test('04 pagamento misto usa taxas reais das formas do banco', () => {
  const out = runPreview({
    itens: [
      { tipo: 'servico', servicoId: S.corte, profissionalId: P.eduardo },
      { tipo: 'servico', servicoId: S.barba, profissionalId: P.eduardo }
    ],
    payments: [
      { formaCode: 'credito', valorCentavos: 5000 },
      { formaCode: 'pix_pos', valorCentavos: 5500 }
    ]
  });
  assert.strictEqual(out.totals.taxaTotalCentavos, 171);
  assert.strictEqual(out.payments.length, 2);
  assert.strictEqual(out.payments.find(p => p.formaCode === 'credito').taxaTotalCentavos, 100);
  assert.strictEqual(out.payments.find(p => p.formaCode === 'pix_pos').taxaTotalCentavos, 71);
});

test('05 bloqueia total recebido diferente do esperado', () => {
  const code = errCode(() => runPreview({
    itens: [{ tipo: 'servico', servicoId: S.corte, profissionalId: P.eduardo }],
    payments: [{ formaCode: 'dinheiro', valorCentavos: 4900 }]
  }));
  assert.strictEqual(code, 'PAYMENT_TOTAL_MISMATCH');
});

test('06 divide gorjeta híbrida 70 valor / 30 tempo sem validação manual', () => {
  const customServicos = [
    { id: 's1', nome: 'Serviço A', valor_centavos: 5000, duracao_min: 90, comissao_pct: 0, ativo: true },
    { id: 's2', nome: 'Serviço B', valor_centavos: 10000, duracao_min: 30, comissao_pct: 0, ativo: true }
  ];
  const customProfs = [
    { id: 'p1', nome: 'Prof A', modelo_comissao: 'bruto_salao', ativo: true },
    { id: 'p2', nome: 'Prof B', modelo_comissao: 'bruto_salao', ativo: true }
  ];
  const out = runPreview({
    itens: [{ tipo: 'servico', servicoId: 's1', profissionalId: 'p1' }, { tipo: 'servico', servicoId: 's2', profissionalId: 'p2' }],
    payments: [{ formaCode: 'dinheiro', valorCentavos: 16000 }],
    gorjetaCentavos: 1000
  }, { servicos: customServicos, produtos: [], profissionais: customProfs, profissionalServicos: [], formasPagamento });
  const p1 = out.gorjetas.find(g => g.profissionalId === 'p1');
  const p2 = out.gorjetas.find(g => g.profissionalId === 'p2');
  assert.strictEqual(p1.gorjetaBrutaCentavos, 458);
  assert.strictEqual(p2.gorjetaBrutaCentavos, 542);
  assert.strictEqual(out.totals.totalGorjetaLiquidaCentavos, 1000);
});

test('07 gorjeta de um único profissional fica 100% com ele', () => {
  const out = runPreview({
    itens: [{ tipo: 'servico', servicoId: S.corte, profissionalId: P.eduardo }],
    payments: [{ formaCode: 'dinheiro', valorCentavos: 6000 }],
    gorjetaCentavos: 1000
  });
  assert.strictEqual(out.gorjetas.length, 1);
  assert.strictEqual(out.gorjetas[0].profissionalId, P.eduardo);
  assert.strictEqual(out.gorjetas[0].gorjetaBrutaCentavos, 1000);
  assert.strictEqual(out.gorjetas[0].regra, 'single_professional');
});

test('08 bloqueia comissão negativa', () => {
  const code = errCode(() => runPreview({
    itens: [{ tipo: 'servico', servicoId: 'cheap', profissionalId: 'staff' }],
    payments: [{ formaCode: 'online', valorCentavos: 100 }]
  }, {
    servicos: [{ id: 'cheap', nome: 'Serviço simbólico', valor_centavos: 100, duracao_min: 30, comissao_pct: 45, ativo: true }],
    produtos: [],
    profissionais: [{ id: 'staff', nome: 'Staff', modelo_comissao: 'bruto_staff', ativo: true }],
    profissionalServicos: [],
    formasPagamento
  }));
  assert.strictEqual(code, 'NEGATIVE_COMMISSION_BLOCKED');
});

test('09 bloqueia serviço não vinculado ao profissional quando há matriz de vínculo', () => {
  const code = errCode(() => runPreview({
    itens: [{ tipo: 'servico', servicoId: S.manicure, profissionalId: P.eduardo }],
    payments: [{ formaCode: 'dinheiro', valorCentavos: 4000 }]
  }));
  assert.strictEqual(code, 'SERVICE_NOT_ALLOWED_FOR_PROFESSIONAL');
});

test('10 bloqueia forma de pagamento inexistente antes do cálculo', () => {
  const code = errCode(() => runPreview({
    itens: [{ tipo: 'servico', servicoId: S.corte, profissionalId: P.eduardo }],
    payments: [{ formaCode: 'cripto', valorCentavos: 5000 }]
  }));
  assert.strictEqual(code, 'PAYMENT_METHOD_NOT_FOUND');
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
console.log(`\nFinance Gate V1: ${passed}/${tests.length} testes verdes.`);

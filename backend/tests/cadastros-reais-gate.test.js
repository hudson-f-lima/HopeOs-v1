const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  validateCreateServicoPayload,
  validateUpdateServicoPayload,
  validateCreateProfissionalPayload,
  validateUpdateProfissionalPayload,
  validateCreateProdutoPayload,
  validateUpdateProdutoPayload,
  validateEstoqueAjustePayload,
  validateCreateFormaPagamentoPayload,
  validateUpdateFormaPagamentoPayload,
  validateProfissionalServicosPayload,
  validateProfissionalServicoOverridePayload
} = require('../src/validators/cadastros.validator');
const { resolveCheckoutInput } = require('../src/engines/CheckoutInputResolver');
const { previewCheckout } = require('../src/engines/FinanceEngine');
const { calculateItemCommission } = require('../src/engines/CommissionEngine');

const root = path.join(__dirname, '../..');
const routesSource = fs.readFileSync(path.join(root, 'backend/src/routes/index.js'), 'utf8');
const repoSource = fs.readFileSync(path.join(root, 'backend/src/repositories/SupabaseRepository.js'), 'utf8');
const migration006 = fs.readFileSync(path.join(root, 'supabase/migrations/006_produto_estoque_ajuste_rpc.sql'), 'utf8');

function errCode(fn) {
  try { fn(); }
  catch (err) { return err.code; }
  throw new Error('Expected error, but function did not throw.');
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('01 cria payload valido de servico em centavos e snake_case', () => {
  const out = validateCreateServicoPayload({
    nome: 'Corte premium',
    categoria: 'Barbearia',
    valorCentavos: 7000,
    duracaoMin: 45,
    slotMin: 15,
    comissaoPct: 50,
    ativo: true
  });
  assert.strictEqual(out.valor_centavos, 7000);
  assert.strictEqual(out.duracao_min, 45);
  assert.strictEqual(out.slot_min, 15);
  assert.strictEqual(out.comissao_pct, 50);
});

test('02 bloqueia servico invalido e campos de escopo', () => {
  assert.strictEqual(errCode(() => validateCreateServicoPayload({ nome: '', valorCentavos: 1000, duracaoMin: 30 })), 'INVALID_FIELD');
  assert.strictEqual(errCode(() => validateCreateServicoPayload({ nome: 'X', valorCentavos: -1, duracaoMin: 30 })), 'INVALID_FIELD');
  assert.strictEqual(errCode(() => validateUpdateServicoPayload({ empresa_id: 'x' })), 'FORBIDDEN_FIELD');
});

test('03 cria profissional valido e bloqueia modelo invalido', () => {
  const out = validateCreateProfissionalPayload({ nome: 'Robson', modeloComissao: 'dividido', horario: {} });
  assert.strictEqual(out.modelo_comissao, 'dividido');
  assert.strictEqual(errCode(() => validateCreateProfissionalPayload({ nome: 'Robson', modeloComissao: 'aleatorio' })), 'INVALID_COMMISSION_MODEL');
});

test('04 cria produto valido, bloqueia venda abaixo do custo e estoque direto', () => {
  const out = validateCreateProdutoPayload({
    nome: 'Pomada',
    custoCentavos: 2000,
    precoVendaCentavos: 4500,
    estoqueInicial: 10,
    estoqueMinimo: 2,
    controlaEstoque: true
  });
  assert.strictEqual(out.produto.estoque_atual, 0);
  assert.strictEqual(out.estoqueInicial, 10);
  assert.strictEqual(errCode(() => validateCreateProdutoPayload({ nome: 'Ruim', custoCentavos: 5000, precoVendaCentavos: 3000 })), 'PRODUCT_BELOW_COST');
  assert.strictEqual(errCode(() => validateCreateProdutoPayload({ nome: 'X', custoCentavos: 1, precoVendaCentavos: 2, estoqueAtual: 99 })), 'FORBIDDEN_FIELD');
  assert.strictEqual(errCode(() => validateUpdateProdutoPayload({ estoque_atual: 99 })), 'FORBIDDEN_FIELD');
});

test('05 valida ajuste de estoque e bloqueia saldo/quantidade invalidos no contrato', () => {
  const out = validateEstoqueAjustePayload({ tipo: 'entrada', quantidade: 5, custoUnitarioCentavos: 2000, motivo: 'Compra' });
  assert.strictEqual(out.custo_unitario_centavos, 2000);
  assert.strictEqual(errCode(() => validateEstoqueAjustePayload({ tipo: 'saida', quantidade: 1 })), 'INVALID_STOCK_ADJUSTMENT_TYPE');
  assert.strictEqual(errCode(() => validateEstoqueAjustePayload({ tipo: 'perda', quantidade: 0 })), 'INVALID_FIELD');
});

test('06 cria forma de pagamento valida e bloqueia code invalido ou PATCH de code', () => {
  const out = validateCreateFormaPagamentoPayload({ code: 'credito_visa', label: 'Credito Visa', taxaPct: 3.19, taxaFixaCentavos: 0 });
  assert.strictEqual(out.code, 'credito_visa');
  assert.strictEqual(errCode(() => validateCreateFormaPagamentoPayload({ code: 'Credito Visa', label: 'Credito' })), 'INVALID_PAYMENT_CODE');
  assert.strictEqual(errCode(() => validateUpdateFormaPagamentoPayload({ code: 'pix' })), 'FORBIDDEN_FIELD');
});

test('07 valida vinculo servico x profissional e bloqueia duplicidade', () => {
  assert.strictEqual(errCode(() => validateProfissionalServicosPayload({ servicoIds: ['s1', 's1'] })), 'DUPLICATE_SERVICE_LINK');
  assert.deepStrictEqual(validateProfissionalServicosPayload({ servicoIds: ['s1', 's2'] }).servicoIds, ['s1', 's2']);
  assert.strictEqual(errCode(() => validateProfissionalServicosPayload({ servicoIds: 's1' })), 'INVALID_SERVICE_LINKS');
});

test('08 valida override e checkout usa override do profissional', () => {
  const override = validateProfissionalServicoOverridePayload({ valorCentavos: 6000, duracaoMin: 45, comissaoPct: 50 });
  assert.deepStrictEqual(override.override, { valor_centavos: 6000, duracao_min: 45, comissao_pct: 50 });

  const resolved = resolveCheckoutInput({
    payload: {
      itens: [{ tipo: 'servico', servicoId: 'serv-1', profissionalId: 'prof-1' }],
      payments: [{ formaCode: 'dinheiro', valorCentavos: 6000 }]
    },
    servicos: [{ id: 'serv-1', nome: 'Corte', valor_centavos: 5000, duracao_min: 30, comissao_pct: 40, ativo: true }],
    produtos: [],
    profissionais: [{ id: 'prof-1', nome: 'Prof', modelo_comissao: 'dividido', overrides: { 'serv-1': override.override }, ativo: true }],
    profissionalServicos: [{ profissional_id: 'prof-1', servico_id: 'serv-1' }],
    formasPagamento: [{ code: 'dinheiro', label: 'Dinheiro', taxa_pct: 0, taxa_fixa_centavos: 0 }]
  });
  const preview = previewCheckout(resolved);
  assert.strictEqual(preview.itens[0].precoUnitarioCentavos, 6000);
  assert.strictEqual(preview.itens[0].duracaoMin, 45);
  assert.strictEqual(preview.itens[0].comissaoPct, 50);
});

test('09 rotas reais V1.2 existem sem frontend novo', () => {
  [
    "router.post('/servicos'",
    "router.patch('/servicos/:id'",
    "router.post('/profissionais'",
    "router.patch('/profissionais/:id'",
    "router.get('/produtos'",
    "router.post('/produtos'",
    "router.patch('/produtos/:id'",
    "router.post('/produtos/:id/estoque/ajuste'",
    "router.get('/formas-pagamento'",
    "router.post('/formas-pagamento'",
    "router.patch('/formas-pagamento/:code'",
    "router.get('/profissionais/:id/servicos'",
    "router.put('/profissionais/:id/servicos'",
    "router.patch('/profissionais/:id/servicos/:servicoId/override'"
  ].forEach(snippet => assert(routesSource.includes(snippet), `Rota ausente: ${snippet}`));
});

test('10 repositorio usa escopo por empresa e RPCs atomicas', () => {
  assert(repoSource.includes('updateScoped(table, id, payload)'));
  assert(repoSource.includes(".eq('empresa_id', this.empresaId)"));
  assert(repoSource.includes("rpc('produto_estoque_ajuste'"));
  assert(repoSource.includes("rpc('produto_criar_com_estoque'"));
  assert(repoSource.includes("rpc('profissional_servicos_replace'"));
  assert(repoSource.includes('replaceProfissionalServicos'));
  assert(repoSource.includes('updateProfissionalServicoOverride'));
  assert(!repoSource.includes(".from('profissional_servicos')\n      .delete()"), 'replace nao deve fazer delete+insert manual fora de RPC');
});

test('11 migration 006 trava estoque com FOR UPDATE e libera somente service_role', () => {
  assert(migration006.includes('create or replace function public.produto_estoque_ajuste'));
  assert(migration006.toLowerCase().includes('for update'));
  assert(migration006.includes('saldo_posterior < 0'));
  assert(migration006.includes('produto_estoque_movimentos'));
  assert(migration006.includes('revoke all on function public.produto_estoque_ajuste'));
  assert(migration006.includes('grant execute on function public.produto_estoque_ajuste'));
  assert(migration006.includes('to service_role'));
});

test('12 migration 006 cria produto+estoque inicial e vinculos de forma atomica', () => {
  assert(migration006.includes('create or replace function public.produto_criar_com_estoque'));
  assert(migration006.includes('insert into produtos'));
  assert(migration006.includes('insert into produto_estoque_movimentos'));
  assert(migration006.includes('produto ativo nao pode vender abaixo do custo'));
  assert(migration006.includes('create or replace function public.profissional_servicos_replace'));
  assert(migration006.includes('for update'));
  assert(migration006.includes('servico_ids nao pode conter duplicidade'));
  assert(migration006.includes('delete from profissional_servicos'));
  assert(migration006.includes('insert into profissional_servicos'));
  assert(migration006.includes('revoke all on function public.produto_criar_com_estoque'));
  assert(migration006.includes('revoke all on function public.profissional_servicos_replace'));
  assert(migration006.includes('grant execute on function public.produto_criar_com_estoque'));
  assert(migration006.includes('grant execute on function public.profissional_servicos_replace'));
});

test('13 rotas usam operacoes atomicas para produto e vinculos', () => {
  assert(routesSource.includes('repo.createProdutoComEstoque'));
  assert(routesSource.includes('repo.replaceProfissionalServicos'));
  assert(routesSource.includes("await requireActiveEntity(repo, 'profissionais'"));
  assert(routesSource.includes("await requireActiveEntity(repo, 'servicos'"));
});

test('14 profissionais nao aceitam overrides livre; override so pelo endpoint dedicado', () => {
  assert.strictEqual(
    errCode(() => validateCreateProfissionalPayload({ nome: 'Robson', overrides: { 'serv-1': { comissao_pct: 900 } } })),
    'OVERRIDES_FIELD_FORBIDDEN'
  );
  assert.strictEqual(
    errCode(() => validateUpdateProfissionalPayload({ overrides: { 'serv-1': { valor_centavos: -5000 } } })),
    'OVERRIDES_FIELD_FORBIDDEN'
  );
  // criacao continua funcionando sem overrides e nasce com overrides vazio
  const out = validateCreateProfissionalPayload({ nome: 'Robson', modeloComissao: 'dividido' });
  assert.deepStrictEqual(out.overrides, {});
  // endpoint dedicado continua validando payload valido e bloqueando comissao > 100
  const ok = validateProfissionalServicoOverridePayload({ valorCentavos: 6000, duracaoMin: 45, comissaoPct: 50 });
  assert.deepStrictEqual(ok.override, { valor_centavos: 6000, duracao_min: 45, comissao_pct: 50 });
  assert.strictEqual(errCode(() => validateProfissionalServicoOverridePayload({ comissaoPct: 150 })), 'INVALID_FIELD');
  assert.strictEqual(errCode(() => validateProfissionalServicoOverridePayload({ valorCentavos: -1 })), 'INVALID_FIELD');
});

test('15 CommissionEngine bloqueia comissao acima de 100% e mantem bloqueio de negativa', () => {
  assert.strictEqual(
    errCode(() => calculateItemCommission({ valorLiquidoCentavos: 5000, taxaItemCentavos: 0, totalCustoCentavos: 0, comissaoPct: 150, modeloComissao: 'bruto_salao' })),
    'COMMISSION_PCT_OUT_OF_RANGE'
  );
  assert.strictEqual(
    errCode(() => calculateItemCommission({ valorLiquidoCentavos: 5000, taxaItemCentavos: 0, totalCustoCentavos: 0, comissaoPct: -10, modeloComissao: 'bruto_salao' })),
    'COMMISSION_PCT_OUT_OF_RANGE'
  );
  assert.strictEqual(
    errCode(() => calculateItemCommission({ valorLiquidoCentavos: 100, taxaItemCentavos: 90, totalCustoCentavos: 0, comissaoPct: 45, modeloComissao: 'bruto_staff' })),
    'NEGATIVE_COMMISSION_BLOCKED'
  );
  const ok = calculateItemCommission({ valorLiquidoCentavos: 5000, taxaItemCentavos: 0, totalCustoCentavos: 0, comissaoPct: 50, modeloComissao: 'bruto_salao' });
  assert.strictEqual(ok.comissaoCentavos, 2500);
});

test('16 POST formas-pagamento cria sem upsert silencioso e duplicidade vira 409', () => {
  assert(repoSource.includes('createFormaPagamento'), 'repositorio deve ter createFormaPagamento');
  assert(!repoSource.includes('upsertFormaPagamento'), 'upsert silencioso de forma de pagamento deve ser removido');
  assert(!repoSource.includes("onConflict: 'empresa_id,code'"), 'POST nao pode fazer upsert por empresa_id,code');
  assert(repoSource.includes('PAYMENT_METHOD_ALREADY_EXISTS'), 'unique violation deve virar PAYMENT_METHOD_ALREADY_EXISTS');
  assert(repoSource.includes("error.code === '23505'"), 'corrida de insert duplicado deve ser tratada');
  assert(routesSource.includes('repo.createFormaPagamento'), 'rota POST deve usar insert puro');
  assert(routesSource.includes('PAYMENT_METHOD_ALREADY_EXISTS'), 'rota POST deve rejeitar code duplicado');
  assert(routesSource.includes('409'), 'code duplicado deve responder 409');
  assert(repoSource.includes('updateFormaPagamento(code, payload)'), 'PATCH continua sendo o caminho de edicao');
});

let passed = 0;
for (const t of tests) {
  try {
    t.fn();
    passed += 1;
    console.log(`✓ ${t.name}`);
  } catch (err) {
    console.error(`✗ ${t.name}`);
    console.error(err);
    process.exit(1);
  }
}
console.log(`\nCadastros Reais Gate: ${passed}/${tests.length} testes verdes.`);

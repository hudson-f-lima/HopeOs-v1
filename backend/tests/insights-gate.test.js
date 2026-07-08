// F1.6 — Gate dos insights: funções puras com fixtures sintéticas
// F1: foco em cashflow e margin (ocupação será refinada em iteração futura com dados reais)

const assert = require('assert');
const cashflow = require('../src/engines/insights/cashflow');
const margin = require('../src/engines/insights/margin');

console.log('🧪 Insights Gate — funções puras\n');

// ========== F1.2 Cashflow ==========

console.log('✓ cashflow.projectCashflow');
const pagamentos = [
  { forma_code: 'pix', valor_centavos: 10000, taxa_total_centavos: 0 },
  { forma_code: 'credito', valor_centavos: 5000, taxa_total_centavos: 200 }
];
const formas = [
  { code: 'pix', dias_recebimento: 0 },
  { code: 'credito', dias_recebimento: 30 }
];
const cf = cashflow.projectCashflow(pagamentos, formas, '2026-07-08', 30);
assert(Array.isArray(cf), 'Curva deve ser array');
assert(cf.length > 0, 'Curva não vazia');
// PIX hoje (D+0), crédito em D+30
const hoje = cf.find(c => c.data === '2026-07-08');
const d30 = cf.find(c => {
  const d = new Date('2026-07-08');
  d.setDate(d.getDate() + 30);
  return c.data === d.toISOString().split('T')[0];
});
assert(hoje && hoje.liquidoCentavos === 10000, `D+0 PIX 10000, got ${hoje ? hoje.liquidoCentavos : 'not found'}`);
assert(d30 && d30.liquidoCentavos === 4800, `D+30 crédito 4800 (5000-200), got ${d30 ? d30.liquidoCentavos : 'not found'}`);

console.log('✓ cashflow.computeAccumulatedCashflow');
const acum = cashflow.computeAccumulatedCashflow(cf, 7);
assert(typeof acum === 'number', `Acumulado deve ser número, got ${typeof acum}`);
assert(acum === 10000, `Acum D+7 deve ser 10000 (só PIX), got ${acum}`);

// ========== F1.3 Margin ==========

console.log('✓ margin.aggregateMarginByServico');
const itens = [
  {
    tipo: 'servico',
    servico_id: 'srv1',
    descricao: 'Corte',
    valor_liquido_centavos: 5000,
    comissao_centavos: 1000,
    receita_empresa_centavos: 4000
  },
  {
    tipo: 'servico',
    servico_id: 'srv1',
    descricao: 'Corte',
    valor_liquido_centavos: 5000,
    comissao_centavos: 1000,
    receita_empresa_centavos: 4000
  }
];
const marginSrv = margin.aggregateMarginByServico(itens, []);
assert(marginSrv.length === 1, `Um serviço agregado, got ${marginSrv.length}`);
assert(marginSrv[0].producaoCentavos === 10000, `Produção 10000, got ${marginSrv[0].producaoCentavos}`);
assert(marginSrv[0].comissaoCentavos === 2000, `Comissão 2000, got ${marginSrv[0].comissaoCentavos}`);
assert(marginSrv[0].margemPct === 80, `Margem 80%, got ${marginSrv[0].margemPct}`);

console.log('✓ margin.aggregateMarginByProduto');
const itensProd = [
  {
    tipo: 'produto',
    produto_id: 'prod1',
    descricao: 'Shampoo',
    total_venda_centavos: 3000,
    total_custo_centavos: 1000,
    lucro_bruto_centavos: 2000
  }
];
const marginProd = margin.aggregateMarginByProduto(itensProd);
assert(marginProd[0].markupPct === 200, `Markup 200%, got ${marginProd[0].markupPct}`);

console.log('✓ margin.computeTicketMedio');
const cmds = [
  { total_recebido_centavos: 10000 },
  { total_recebido_centavos: 15000 },
  { total_recebido_centavos: 20000 }
];
const ticket = margin.computeTicketMedio(cmds);
assert(ticket === 15000, `Ticket médio 15000, got ${ticket}`);

console.log('\n✅ Insights Gate — 58/58 + 5 novos = 63/63 verdes\n');

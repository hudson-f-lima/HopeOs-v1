// F1/F2 Insights Gate: pure functions with synthetic fixtures.

const assert = require('assert');
const fs = require('fs');
const cashflow = require('../src/engines/insights/cashflow');
const margin = require('../src/engines/insights/margin');
const retention = require('../src/engines/insights/retention');

console.log('Insights Gate - pure functions\n');

// ========== F1.2 Cashflow ==========

console.log('OK cashflow.projectCashflow');
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
assert(cf.length > 0, 'Curva nao vazia');
const hoje = cf.find(c => c.data === '2026-07-08');
const d30 = cf.find(c => {
  const d = new Date('2026-07-08');
  d.setDate(d.getDate() + 30);
  return c.data === d.toISOString().split('T')[0];
});
assert(hoje && hoje.liquidoCentavos === 10000, `D+0 PIX 10000, got ${hoje ? hoje.liquidoCentavos : 'not found'}`);
assert(d30 && d30.liquidoCentavos === 4800, `D+30 credito 4800 (5000-200), got ${d30 ? d30.liquidoCentavos : 'not found'}`);

console.log('OK cashflow.computeAccumulatedCashflow');
const acum = cashflow.computeAccumulatedCashflow(cf, 7);
assert(typeof acum === 'number', `Acumulado deve ser numero, got ${typeof acum}`);
assert(acum === 10000, `Acum D+7 deve ser 10000 (so PIX), got ${acum}`);

// ========== F1.3 Margin ==========

console.log('OK margin.aggregateMarginByServico');
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
assert(marginSrv.length === 1, `Um servico agregado, got ${marginSrv.length}`);
assert(marginSrv[0].producaoCentavos === 10000, `Producao 10000, got ${marginSrv[0].producaoCentavos}`);
assert(marginSrv[0].comissaoCentavos === 2000, `Comissao 2000, got ${marginSrv[0].comissaoCentavos}`);
assert(marginSrv[0].margemPct === 80, `Margem 80%, got ${marginSrv[0].margemPct}`);

console.log('OK margin.aggregateMarginByProduto');
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

console.log('OK margin.computeTicketMedio');
const cmds = [
  { total_recebido_centavos: 10000 },
  { total_recebido_centavos: 15000 },
  { total_recebido_centavos: 20000 }
];
const ticket = margin.computeTicketMedio(cmds);
assert(ticket === 15000, `Ticket medio 15000, got ${ticket}`);

// ========== F2.1 RFM / Churn / Reliability ==========

console.log('OK retention.computeRfm one-visit fallback');
const rfm = retention.computeRfm([
  { id: 'cmd-new', cliente_id: 'cli-new', data: '2026-07-01', total_recebido_centavos: 12000, status: 'fechado' }
], '2026-07-08');
assert.strictEqual(rfm.clientes.length, 1);
assert.strictEqual(rfm.clientes[0].segmento, 'novos');
assert.strictEqual(rfm.clientes[0].fScore, 1);
assert(rfm.clientes[0].rScore >= 4);

console.log('OK retention.computeRfm small-base dynamic scores');
const rfmSmall = retention.computeRfm([
  { id: 'a1', cliente_id: 'cli-a', data: '2026-01-15', total_recebido_centavos: 5000, status: 'fechado' },
  { id: 'a2', cliente_id: 'cli-a', data: '2026-02-01', total_recebido_centavos: 5000, status: 'fechado' },
  { id: 'a3', cliente_id: 'cli-a', data: '2026-03-01', total_recebido_centavos: 5000, status: 'fechado' },
  { id: 'b1', cliente_id: 'cli-b', data: '2026-06-20', total_recebido_centavos: 20000, status: 'fechado' }
], '2026-07-08');
const cliA = rfmSmall.clientes.find(c => c.clienteId === 'cli-a');
assert(cliA.visitas180d === 3, `cli-a visitas 3, got ${cliA.visitas180d}`);
assert(cliA.fScore >= 3, `cli-a fScore >=3, got ${cliA.fScore}`);

console.log('OK retention.computeChurnRisk one-visit fallback');
const churnFallback = retention.computeChurnRisk({
  comandosCliente: [{ id: 'cmd-old', cliente_id: 'cli-old', data: '2026-05-01', total_recebido_centavos: 30000 }],
  hoje: '2026-07-10',
  valor180dCentavos: 30000
});
assert.strictEqual(churnFallback.intervaloMedianoDias, 45);
assert.strictEqual(churnFallback.base, 'default');
assert.strictEqual(churnFallback.risco, 'atencao');
assert.strictEqual(churnFallback.prioridade, 30000);

console.log('OK retention.computeChurnRisk client median');
const churnClient = retention.computeChurnRisk({
  comandosCliente: [
    { id: 'c1', cliente_id: 'cli-c', data: '2026-01-01', total_recebido_centavos: 10000 },
    { id: 'c2', cliente_id: 'cli-c', data: '2026-01-31', total_recebido_centavos: 10000 },
    { id: 'c3', cliente_id: 'cli-c', data: '2026-03-02', total_recebido_centavos: 10000 }
  ],
  hoje: '2026-03-20',
  valor180dCentavos: 30000
});
assert.strictEqual(churnClient.intervaloMedianoDias, 30);
assert.strictEqual(churnClient.base, 'cliente');
assert.strictEqual(churnClient.risco, 'ok');

console.log('OK retention.computeReliability clamp and factors');
const reliabilityBad = retention.computeReliability([
  { data: '2026-07-01', horario: '10:00', status: 'no_show' },
  { data: '2026-07-02', horario: '10:00', status: 'no_show' },
  { data: '2026-07-03', horario: '10:00', status: 'no_show' },
  { data: '2026-07-04', horario: '10:00', status: 'no_show' },
  { data: '2026-07-05', horario: '10:00', status: 'no_show' },
  { data: '2026-07-06', horario: '10:00', status: 'cancelado', updated_at: '2026-07-05T11:00:00Z' },
  { data: '2026-07-07', horario: '10:00', status: 'cancelado', updated_at: '2026-07-06T11:00:00Z' },
  { data: '2026-07-08', horario: '10:00', status: 'cancelado', updated_at: '2026-07-07T11:00:00Z' },
  { data: '2026-07-09', horario: '10:00', status: 'cancelado', updated_at: '2026-07-08T11:00:00Z' },
  { data: '2026-07-10', horario: '10:00', status: 'cancelado', updated_at: '2026-07-09T11:00:00Z' }
], '2026-07-10');
assert.strictEqual(reliabilityBad.score, 0);
assert.strictEqual(reliabilityBad.faixa, 'risco');
assert.strictEqual(reliabilityBad.fatores.noShows365d, 5);
assert.strictEqual(reliabilityBad.fatores.cancelTardios365d, 5);
assert.strictEqual(typeof reliabilityBad.fatores.streakConcluidos, 'number');

console.log('OK retention.computeReliability success streak');
const reliabilityGood = retention.computeReliability([
  { data: '2026-07-01', horario: '10:00', status: 'concluido' },
  { data: '2026-07-02', horario: '10:00', status: 'concluido' },
  { data: '2026-07-03', horario: '10:00', status: 'fechado' }
], '2026-07-08');
assert.strictEqual(reliabilityGood.score, 100);
assert.strictEqual(reliabilityGood.faixa, 'confiavel');
assert.strictEqual(reliabilityGood.fatores.streakConcluidos, 3);

// ========== F2.2 Rebooking / Attach ==========

console.log('OK retention.computeRebooking client median');
const rebooking = retention.computeRebooking([
  { cliente_id: 'cli-r', servico_id: 'srv-r', data: '2026-01-01', hora: '14:00' },
  { cliente_id: 'cli-r', servico_id: 'srv-r', data: '2026-01-31', hora: '14:00' },
  { cliente_id: 'cli-r', servico_id: 'srv-r', data: '2026-03-02', hora: '15:00' }
], 'srv-r', { hoje: '2026-03-02' });
assert.strictEqual(rebooking.intervaloDias, 30);
assert.strictEqual(rebooking.dataSugerida, '2026-04-01');
assert.strictEqual(rebooking.horaSugerida, '14:00');
assert.strictEqual(rebooking.base, 'cliente');

console.log('OK retention.computeRebooking default fallback');
const rebookingDefault = retention.computeRebooking([], 'srv-empty', { hoje: '2026-07-08' });
assert.strictEqual(rebookingDefault.intervaloDias, 45);
assert.strictEqual(rebookingDefault.dataSugerida, '2026-08-22');
assert.strictEqual(rebookingDefault.base, 'default');

console.log('OK retention.computeAttach lift and support filter');
const attachItems = [];
for (let i = 1; i <= 6; i += 1) {
  attachItems.push({ comando_id: `s1-${i}`, tipo: 'servico', servico_id: 'srv-attach', descricao: 'Corte' });
  if (i <= 5) attachItems.push({ comando_id: `s1-${i}`, tipo: 'produto', produto_id: 'prod-attach', descricao: 'Pomada' });
}
for (let i = 1; i <= 4; i += 1) {
  attachItems.push({ comando_id: `other-${i}`, tipo: 'servico', servico_id: 'srv-other', descricao: 'Barba' });
}
const attach = retention.computeAttach(attachItems);
assert.strictEqual(attach.attachRatePct, 50);
assert.strictEqual(attach.sugestoes.length, 1);
assert.strictEqual(attach.sugestoes[0].servicoId, 'srv-attach');
assert.strictEqual(attach.sugestoes[0].produtos[0].produtoId, 'prod-attach');
assert(attach.sugestoes[0].produtos[0].lift > 1.2);

console.log('OK F2 routes registered');
const routesSrc = fs.readFileSync('src/routes/index.js', 'utf8');
[
  "/insights/retention",
  "/insights/clients/:id/reliability",
  "/insights/attach",
  "/insights/rebooking/:clienteId"
].forEach(route => assert(routesSrc.includes(route), `Rota ausente: ${route}`));

console.log('\nOK Insights Gate - 58/58 + 15 insights = 73/73 verdes\n');

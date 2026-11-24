const test = require('node:test');
const assert = require('node:assert/strict');

const modulo = import('../../js/ui/graficoComposicao.js');
const periodo = {
  faturamentoCentavos: 12000,
  comissoesCentavos: 1800,
  taxasItensCentavos: 300,
  custoProdutosVendidosCentavos: 2000,
  parteSalaoCentavos: 7900,
  diferencaConciliacaoCentavos: 0,
  taxaGorjetaEstornadaCentavos: 0,
  outraDiferencaCentavos: 0
};
const trajetoria = modelo => modelo.linhas.map(linha => [linha.id, linha.inicioCentavos, linha.fimCentavos]);
const limites = modelo => [modelo.minimoCentavos, modelo.maximoCentavos];

test('Composição conserva os centavos registrados e faz cada barra começar no fim da anterior', async () => {
  const { modeloComposicao } = await modulo;
  const modelo = modeloComposicao(periodo);
  assert.deepEqual(trajetoria(modelo), [
    ['faturamento', 0, 12000],
    ['comissoes', 12000, 10200],
    ['taxas', 10200, 9900],
    ['custo', 9900, 7900],
    ['parteSalao', 0, 7900]
  ]);
  assert.deepEqual(limites(modelo), [0, 12000]);
});

test('Venda estornada mantém as taxas registradas e pode deixar a parte do salão negativa', async () => {
  const { modeloComposicao } = await modulo;
  const modelo = modeloComposicao({
    faturamentoCentavos: 0, comissoesCentavos: 0, taxasItensCentavos: 300,
    custoProdutosVendidosCentavos: 0, parteSalaoCentavos: -350,
    diferencaConciliacaoCentavos: 50, taxaGorjetaEstornadaCentavos: 50, outraDiferencaCentavos: 0
  });
  assert.deepEqual(trajetoria(modelo).slice(-4), [
    ['taxas', 0, -300],
    ['custo', -300, -300],
    ['taxaGorjeta', -300, -350],
    ['parteSalao', 0, -350]
  ]);
  assert.deepEqual(limites(modelo), [-350, 0]);
});

test('Comissão líquida negativa acresce ao saldo em período com apenas estorno', async () => {
  const { modeloComposicao } = await modulo;
  const modelo = modeloComposicao({
    faturamentoCentavos: -10000, comissoesCentavos: -4000, taxasItensCentavos: 0,
    custoProdutosVendidosCentavos: 0, parteSalaoCentavos: -6050,
    diferencaConciliacaoCentavos: 50, taxaGorjetaEstornadaCentavos: 50, outraDiferencaCentavos: 0
  });
  assert.deepEqual(trajetoria(modelo), [
    ['faturamento', 0, -10000],
    ['comissoes', -10000, -6000],
    ['taxas', -6000, -6000],
    ['custo', -6000, -6000],
    ['taxaGorjeta', -6000, -6050],
    ['parteSalao', 0, -6050]
  ]);
  assert.equal(modelo.linhas[1].tipo, 'acrescimo');
  assert.deepEqual(limites(modelo), [-10000, 0]);
});

test('Escala inclui saldo intermediário negativo com faturamento e parte do salão positivos', async () => {
  const { modeloComposicao } = await modulo;
  const modelo = modeloComposicao({
    faturamentoCentavos: 40, comissoesCentavos: 0, taxasItensCentavos: 100,
    custoProdutosVendidosCentavos: 0, parteSalaoCentavos: 20,
    diferencaConciliacaoCentavos: -80, taxaGorjetaEstornadaCentavos: 0, outraDiferencaCentavos: -80
  });
  assert.deepEqual(trajetoria(modelo).slice(-2), [
    ['outraDiferenca', -60, 20],
    ['parteSalao', 0, 20]
  ]);
  assert.equal(modelo.linhas.at(-2).tipo, 'ajuste');
  assert.deepEqual(limites(modelo), [-60, 40]);
});

test('Taxa de gorjeta e diferença sem causa permanecem visíveis mesmo quando se anulam', async () => {
  const { modeloComposicao } = await modulo;
  const modelo = modeloComposicao({ ...periodo, taxaGorjetaEstornadaCentavos: 50, outraDiferencaCentavos: -50 });
  assert.deepEqual(trajetoria(modelo).slice(-3), [
    ['taxaGorjeta', 7900, 7850],
    ['outraDiferenca', 7850, 7900],
    ['parteSalao', 0, 7900]
  ]);
});

test('Contrato legado usa a diferença registrada sem atribuir uma causa', async () => {
  const { modeloComposicao } = await modulo;
  const { taxaGorjetaEstornadaCentavos, outraDiferencaCentavos, ...legado } = periodo;
  const modelo = modeloComposicao({ ...legado, diferencaConciliacaoCentavos: 300, parteSalaoCentavos: 7600 });
  assert.deepEqual(trajetoria(modelo).slice(-3), [
    ['custo', 9900, 7900],
    ['diferencaConciliacao', 7900, 7600],
    ['parteSalao', 0, 7600]
  ]);
});

test('Valores zerados são válidos e faturamento zerado por si só preserva outras barras', async () => {
  const { modeloComposicao } = await modulo;
  const zeros = Object.fromEntries(Object.keys(periodo).map(chave => [chave, 0]));
  const modelo = modeloComposicao(zeros);
  assert.deepEqual(limites(modelo), [0, 0]);
  assert.ok(modelo.linhas.every(linha => linha.inicioCentavos === 0 && linha.fimCentavos === 0));

  const comAjuste = modeloComposicao({ ...zeros, taxaGorjetaEstornadaCentavos: 50, outraDiferencaCentavos: -50 });
  assert.deepEqual(limites(comAjuste), [-50, 0]);
});

test('Valores ausentes ou contraditórios deixam o gráfico indisponível', async () => {
  const { modeloComposicao, renderGraficoComposicao } = await modulo;
  for (const incompleto of [null, {}, { ...periodo, parteSalaoCentavos: null },
    { ...periodo, comissoesCentavos: '1800' }, { ...periodo, taxasItensCentavos: 1.5 },
    { ...periodo, custoProdutosVendidosCentavos: Number.POSITIVE_INFINITY },
    { ...periodo, outraDiferencaCentavos: undefined }, { ...periodo, diferencaConciliacaoCentavos: undefined }]) {
    assert.equal(modeloComposicao(incompleto), null);
    assert.equal(renderGraficoComposicao(incompleto), null);
  }
  assert.equal(modeloComposicao({ ...periodo, parteSalaoCentavos: 7899 }), null, 'parte do salão vem do backend');
  assert.equal(modeloComposicao({ ...periodo, taxaGorjetaEstornadaCentavos: 50 }), null, 'parcelas têm de fechar com a diferença registrada');
});

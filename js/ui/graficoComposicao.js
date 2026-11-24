const svgNs = 'http://www.w3.org/2000/svg';
const classe = 'composicao-grafico';

export function modeloComposicao(resultado) {
  if (!resultado) return null;
  const {
    faturamentoCentavos, comissoesCentavos, taxasItensCentavos, custoProdutosVendidosCentavos,
    parteSalaoCentavos, diferencaConciliacaoCentavos, taxaGorjetaEstornadaCentavos, outraDiferencaCentavos
  } = resultado;
  if (![faturamentoCentavos, comissoesCentavos, taxasItensCentavos, custoProdutosVendidosCentavos,
    parteSalaoCentavos, diferencaConciliacaoCentavos].every(Number.isSafeInteger)) return null;

  const parcelas = [
    ['comissoes', 'Comissões', comissoesCentavos],
    ['taxas', 'Taxas sobre vendas', taxasItensCentavos],
    ['custo', 'Custo dos produtos vendidos', custoProdutosVendidosCentavos]
  ];
  if (taxaGorjetaEstornadaCentavos !== undefined || outraDiferencaCentavos !== undefined) {
    if (![taxaGorjetaEstornadaCentavos, outraDiferencaCentavos].every(Number.isSafeInteger)
      || taxaGorjetaEstornadaCentavos + outraDiferencaCentavos !== diferencaConciliacaoCentavos) return null;
    if (taxaGorjetaEstornadaCentavos) parcelas.push(['taxaGorjeta', 'Taxa da gorjeta devolvida', taxaGorjetaEstornadaCentavos]);
    if (outraDiferencaCentavos) parcelas.push(['outraDiferenca', 'Diferença sem causa identificada', outraDiferencaCentavos]);
  } else if (diferencaConciliacaoCentavos) {
    // D-070: o contrato anterior registra a diferença total, sem apontar uma causa.
    parcelas.push(['diferencaConciliacao', 'Diferença de conciliação', diferencaConciliacaoCentavos]);
  }

  const linhas = [
    { id: 'faturamento', rotulo: 'Faturamento', inicioCentavos: 0, fimCentavos: faturamentoCentavos, tipo: 'total' }
  ];
  let saldo = faturamentoCentavos;
  for (const [id, rotulo, valor] of parcelas) {
    // São parcelas registradas na conciliação. Subtrair uma comissão revertida
    // (negativa) eleva o saldo nesta etapa da representação.
    const fimCentavos = saldo - valor;
    if (!Number.isSafeInteger(fimCentavos)) return null;
    let tipo = valor < 0 ? 'acrescimo' : 'reducao';
    if (id === 'outraDiferenca' || id === 'diferencaConciliacao') tipo = 'ajuste';
    linhas.push({ id, rotulo, inicioCentavos: saldo, fimCentavos, tipo });
    saldo = fimCentavos;
  }
  if (saldo !== parteSalaoCentavos) return null;

  linhas.push({ id: 'parteSalao', rotulo: 'Parte do salão', inicioCentavos: 0, fimCentavos: parteSalaoCentavos, tipo: 'total' });
  const pontos = linhas.flatMap(({ inicioCentavos, fimCentavos }) => [inicioCentavos, fimCentavos]);
  const minimoCentavos = Math.min(...pontos);
  const maximoCentavos = Math.max(...pontos);
  return { linhas, minimoCentavos, maximoCentavos };
}

function svgElemento(nome, sufixo, atributos) {
  const elemento = document.createElementNS(svgNs, nome);
  elemento.setAttribute('class', classe + '-' + sufixo);
  for (const [atributo, valor] of Object.entries(atributos)) elemento.setAttribute(atributo, valor);
  return elemento;
}

function linhaVertical(sufixo, x, y1, y2) {
  return svgElemento('line', sufixo, { x1: x, y1, x2: x, y2, 'vector-effect': 'non-scaling-stroke' });
}

export function renderGraficoComposicao(resultado) {
  const modelo = modeloComposicao(resultado);
  if (!modelo) return null;

  const grafico = document.createElement('figure');
  grafico.className = classe;
  const legenda = document.createElement('figcaption');
  legenda.className = classe + '-legenda';
  const { linhas, minimoCentavos, maximoCentavos } = modelo;
  if (minimoCentavos === maximoCentavos) {
    grafico.classList.add(classe + '-vazio');
    legenda.textContent = 'Todos os valores da composição estão zerados neste período.';
    grafico.append(legenda);
    return grafico;
  }

  const lista = document.createElement('ol');
  lista.className = classe + '-linhas';
  lista.setAttribute('aria-hidden', 'true');
  const x = centavos => 2 + (centavos - minimoCentavos) / (maximoCentavos - minimoCentavos) * 96;
  linhas.forEach(({ rotulo, inicioCentavos, fimCentavos, tipo }, indice) => {
    const linha = document.createElement('li');
    linha.className = classe + '-linha';
    const texto = document.createElement('span');
    texto.className = classe + '-rotulo';
    let sinal = '';
    if (tipo !== 'total' && inicioCentavos !== fimCentavos) sinal = fimCentavos > inicioCentavos ? '+ ' : '− ';
    texto.textContent = sinal + rotulo;

    const trilho = svgElemento('svg', 'trilho', { viewBox: '0 0 100 24', preserveAspectRatio: 'none', focusable: 'false' });
    const inicio = x(inicioCentavos);
    const fim = x(fimCentavos);
    const ultima = indice === linhas.length - 1;
    trilho.append(linhaVertical('zero', x(0), 0, 24));
    if (indice > 0) trilho.append(linhaVertical('conector', ultima ? fim : inicio, 0, 6));
    if (!ultima) trilho.append(linhaVertical('conector', fim, 18, 24));
    if (inicioCentavos === fimCentavos) {
      trilho.append(linhaVertical('marca-zero', inicio, 6, 18));
    } else {
      const barra = svgElemento('rect', 'barra', {
        x: Math.min(inicio, fim), y: 6, width: Math.abs(fim - inicio), height: 12, 'vector-effect': 'non-scaling-stroke'
      });
      barra.classList.add(classe + '-barra--' + tipo);
      trilho.append(barra);
    }
    linha.append(texto, trilho);
    lista.append(linha);
  });

  legenda.textContent = 'A linha tracejada marca R$ 0. Os sinais + e − indicam como cada parcela altera o saldo.';
  grafico.append(lista, legenda);
  return grafico;
}

const { sumCents } = require('../engines/money');
const { itensNegativos, gorjetasNegativas, comandasEstornadasTotal } = require('../engines/EstornoEngine');

// Estornos (D-013, migration 009): o ledger original nunca muda; aqui cada estorno
// entra como linha negativa (itens, gorjetas, reembolso por forma) e os totais
// descontam o evento. Resumo acumulado: não há recorte de período.
function buildFinanceReadModel(snapshot) {
  const comandos = snapshot.comandos || [];
  const pagamentos = snapshot.comandoPagamentos || [];
  const itensOriginais = snapshot.comandoItens || [];
  const estornos = snapshot.comandaEstornos || [];
  const estornoPagamentos = snapshot.comandaEstornoPagamentos || [];
  const itensEstornados = itensNegativos({ estornos, estornoItens: snapshot.comandaEstornoItens || [], comandoItens: itensOriginais });
  const itens = itensOriginais.concat(itensEstornados);
  const gorjetas = (snapshot.comandoGorjetas || []).concat(gorjetasNegativas({ estornos, estornoGorjetas: snapshot.comandaEstornoGorjetas || [] }));
  const produtosItens = itens.filter(i => (i.tipo || 'servico') === 'produto');
  const servicosItens = itens.filter(i => (i.tipo || 'servico') === 'servico');

  const porForma = Object.values(pagamentos.reduce((acc, p) => {
    const key = p.forma_code;
    if (!acc[key]) acc[key] = { formaCode: key, valorCentavos: 0, taxaCentavos: 0, taxaServicoCentavos: 0, taxaGorjetaCentavos: 0, count: 0 };
    acc[key].valorCentavos += p.valor_centavos || 0;
    acc[key].taxaCentavos += p.taxa_total_centavos || 0;
    acc[key].taxaServicoCentavos += p.taxa_servico_centavos || 0;
    acc[key].taxaGorjetaCentavos += p.taxa_gorjeta_centavos || 0;
    acc[key].count += 1;
    return acc;
  }, {}));
  // Reembolso sai da forma em que foi devolvido; a taxa original não volta (D-013).
  for (const r of estornoPagamentos) {
    let row = porForma.find(f => f.formaCode === r.forma_code);
    if (!row) { row = { formaCode: r.forma_code, valorCentavos: 0, taxaCentavos: 0, taxaServicoCentavos: 0, taxaGorjetaCentavos: 0, count: 0 }; porForma.push(row); }
    row.valorCentavos -= r.valor_centavos || 0;
    row.reembolsoCentavos = (row.reembolsoCentavos || 0) + (r.valor_centavos || 0);
  }

  const repassesPorProfissional = Object.values(itens.reduce((acc, item) => {
    const id = item.profissional_id;
    if (!id) return acc;
    if (!acc[id]) acc[id] = { profissionalId: id, comissaoCentavos: 0, gorjetaLiquidaCentavos: 0, servicosCentavos: 0, produtosCentavos: 0 };
    acc[id].comissaoCentavos += item.comissao_centavos || 0;
    if ((item.tipo || 'servico') === 'produto') acc[id].produtosCentavos += item.valor_liquido_centavos || item.total_venda_centavos || 0;
    else acc[id].servicosCentavos += item.valor_liquido_centavos || 0;
    return acc;
  }, {}));

  for (const tip of gorjetas) {
    let row = repassesPorProfissional.find(r => r.profissionalId === tip.profissional_id);
    if (!row) {
      row = { profissionalId: tip.profissional_id, comissaoCentavos: 0, gorjetaLiquidaCentavos: 0, servicosCentavos: 0, produtosCentavos: 0 };
      repassesPorProfissional.push(row);
    }
    row.gorjetaLiquidaCentavos += tip.valor_liquido_centavos || 0;
  }

  const estServicos = sumCents(itensEstornados.filter(i => (i.tipo || 'servico') === 'servico'), 'valor_liquido_centavos');
  const estProdutos = sumCents(itensEstornados.filter(i => i.tipo === 'produto'), 'valor_liquido_centavos');
  const servicosLiquidosCentavos = sumCents(comandos, 'servicos_liquidos_centavos') + estServicos;
  const produtosLiquidosCentavos = sumCents(comandos, 'produtos_liquidos_centavos') + estProdutos;
  const itensLiquidosCentavos = sumCents(comandos, row => row.itens_liquidos_centavos ?? ((row.servicos_liquidos_centavos || 0) + (row.produtos_liquidos_centavos || 0))) + estServicos + estProdutos;
  const totalmenteEstornadas = comandasEstornadasTotal(estornos);

  return {
    totals: {
      comandos: comandos.length,
      // Comandas que ainda contam (sem as 100% estornadas): base do ticket médio.
      comandasValidas: comandos.filter(c => !totalmenteEstornadas.has(c.id)).length,
      servicosLiquidosCentavos,
      produtosLiquidosCentavos,
      itensLiquidosCentavos,
      produtosVendaCentavos: sumCents(produtosItens, row => row.total_venda_centavos || row.valor_liquido_centavos || 0),
      produtosCustoCentavos: sumCents(produtosItens, 'total_custo_centavos'),
      produtosLucroBrutoCentavos: sumCents(produtosItens, 'lucro_bruto_centavos'),
      totalRecebidoCentavos: sumCents(comandos, 'total_recebido_centavos') - sumCents(estornos, 'reembolso_centavos'),
      taxaTotalCentavos: sumCents(comandos, 'taxa_total_centavos'),
      totalComissaoCentavos: sumCents(comandos, 'total_comissao_centavos') - sumCents(estornos, 'comissao_centavos'),
      gorjetaBrutaCentavos: sumCents(comandos, 'gorjeta_bruta_centavos') - sumCents(estornos, 'gorjeta_bruta_centavos'),
      gorjetaLiquidaCentavos: sumCents(comandos, 'total_gorjeta_liquida_centavos') - sumCents(estornos, 'gorjeta_liquida_centavos'),
      receitaEmpresaCentavos: sumCents(comandos, 'receita_empresa_centavos') - sumCents(estornos, 'receita_empresa_centavos')
    },
    estornos: {
      quantidade: estornos.length,
      comandasEstornadasTotal: totalmenteEstornadas.size,
      itensCentavos: sumCents(estornos, 'itens_centavos'),
      reembolsoCentavos: sumCents(estornos, 'reembolso_centavos'),
      comissaoCentavos: sumCents(estornos, 'comissao_centavos'),
      gorjetaLiquidaCentavos: sumCents(estornos, 'gorjeta_liquida_centavos'),
      receitaEmpresaCentavos: sumCents(estornos, 'receita_empresa_centavos')
    },
    porForma,
    repassesPorProfissional,
    comandos,
    pagamentos,
    itens,
    servicosItens,
    produtosItens,
    gorjetas
  };
}

module.exports = { buildFinanceReadModel };

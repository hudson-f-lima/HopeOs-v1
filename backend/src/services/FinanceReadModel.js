const { sumCents } = require('../engines/money');

function buildFinanceReadModel(snapshot) {
  const comandos = snapshot.comandos || [];
  const pagamentos = snapshot.comandoPagamentos || [];
  const itens = snapshot.comandoItens || [];
  const gorjetas = snapshot.comandoGorjetas || [];
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

  const servicosLiquidosCentavos = sumCents(comandos, 'servicos_liquidos_centavos');
  const produtosLiquidosCentavos = sumCents(comandos, 'produtos_liquidos_centavos');
  const itensLiquidosCentavos = sumCents(comandos, row => row.itens_liquidos_centavos ?? ((row.servicos_liquidos_centavos || 0) + (row.produtos_liquidos_centavos || 0)));

  return {
    totals: {
      comandos: comandos.length,
      servicosLiquidosCentavos,
      produtosLiquidosCentavos,
      itensLiquidosCentavos,
      produtosVendaCentavos: sumCents(produtosItens, row => row.total_venda_centavos || row.valor_liquido_centavos || 0),
      produtosCustoCentavos: sumCents(produtosItens, 'total_custo_centavos'),
      produtosLucroBrutoCentavos: sumCents(produtosItens, 'lucro_bruto_centavos'),
      totalRecebidoCentavos: sumCents(comandos, 'total_recebido_centavos'),
      taxaTotalCentavos: sumCents(comandos, 'taxa_total_centavos'),
      totalComissaoCentavos: sumCents(comandos, 'total_comissao_centavos'),
      gorjetaBrutaCentavos: sumCents(comandos, 'gorjeta_bruta_centavos'),
      gorjetaLiquidaCentavos: sumCents(comandos, 'total_gorjeta_liquida_centavos'),
      receitaEmpresaCentavos: sumCents(comandos, 'receita_empresa_centavos')
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

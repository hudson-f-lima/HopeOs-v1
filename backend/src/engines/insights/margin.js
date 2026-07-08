// F1.3 — Margem: decomposição por serviço, profissional, produto, forma

function aggregateMarginByServico(comandoItens, comandos) {
  // Group by servico_id, agregar valores
  const map = {};

  comandoItens.forEach(item => {
    if (item.tipo !== 'servico' || !item.servico_id) return;

    const key = item.servico_id;
    if (!map[key]) {
      map[key] = {
        servicoId: key,
        servicoNome: item.descricao || 'Serviço',
        producaoCentavos: 0,
        comissaoCentavos: 0,
        receitaEmpresaCentavos: 0,
        n: 0
      };
    }

    map[key].producaoCentavos += item.valor_liquido_centavos || 0;
    map[key].comissaoCentavos += item.comissao_centavos || 0;
    map[key].receitaEmpresaCentavos += item.receita_empresa_centavos || 0;
    map[key].n += 1;
  });

  return Object.values(map).map(s => ({
    ...s,
    margemPct: s.producaoCentavos ? Math.round((s.receitaEmpresaCentavos / s.producaoCentavos) * 100 * 10) / 10 : 0
  }));
}

function aggregateMarginByProfissional(comandoItens, comandoGorjetas) {
  // Group by profissional_id de serviços; join gorjetas
  const servicos = {};
  const gorjetas = {};

  comandoItens.forEach(item => {
    if (item.tipo !== 'servico' || !item.profissional_id) return;

    const key = item.profissional_id;
    if (!servicos[key]) {
      servicos[key] = {
        profissionalId: key,
        profissionalNome: item.descricao || 'Profissional',
        producaoCentavos: 0,
        comissaoCentavos: 0,
        receitaEmpresaCentavos: 0
      };
    }

    servicos[key].producaoCentavos += item.valor_liquido_centavos || 0;
    servicos[key].comissaoCentavos += item.comissao_centavos || 0;
    servicos[key].receitaEmpresaCentavos += item.receita_empresa_centavos || 0;
  });

  comandoGorjetas.forEach(g => {
    if (!g.profissional_id) return;
    const key = g.profissional_id;
    if (!gorjetas[key]) {
      gorjetas[key] = 0;
    }
    gorjetas[key] += g.valor_liquido_centavos || 0;
  });

  return Object.values(servicos).map(s => ({
    ...s,
    gorjetaLiquidaCentavos: gorjetas[s.profissionalId] || 0
  }));
}

function aggregateMarginByProduto(comandoItens) {
  // Group by produto_id, agregando lucro bruto
  const map = {};

  comandoItens.forEach(item => {
    if (item.tipo !== 'produto' || !item.produto_id) return;

    const key = item.produto_id;
    if (!map[key]) {
      map[key] = {
        produtoId: key,
        produtoNome: item.descricao || 'Produto',
        vendaCentavos: 0,
        custoCentavos: 0,
        lucroBrutoCentavos: 0,
        n: 0
      };
    }

    map[key].vendaCentavos += (item.total_venda_centavos || item.valor_liquido_centavos || 0);
    map[key].custoCentavos += item.total_custo_centavos || 0;
    map[key].lucroBrutoCentavos += item.lucro_bruto_centavos || 0;
    map[key].n += 1;
  });

  return Object.values(map).map(p => ({
    ...p,
    markupPct: p.custoCentavos ? Math.round((p.vendaCentavos / p.custoCentavos - 1) * 100 * 10) / 10 : 0
  }));
}

function aggregateMarginByForma(comandoPagamentos) {
  // Group by forma_code, agregando valor e taxa
  const map = {};
  let totalBruto = 0;

  comandoPagamentos.forEach(p => {
    const key = p.forma_code;
    if (!map[key]) {
      map[key] = {
        formaCode: key,
        valorCentavos: 0,
        taxaCentavos: 0
      };
    }

    map[key].valorCentavos += p.valor_centavos || 0;
    map[key].taxaCentavos += p.taxa_total_centavos || 0;
    totalBruto += p.valor_centavos || 0;
  });

  return Object.values(map).map(f => ({
    ...f,
    pesoPct: totalBruto ? Math.round((f.valorCentavos / totalBruto) * 100 * 10) / 10 : 0
  }));
}

function computeTicketMedio(comandos) {
  if (!comandos || comandos.length === 0) return 0;
  const total = comandos.reduce((sum, c) => sum + (c.total_recebido_centavos || 0), 0);
  return Math.round(total / comandos.length);
}

module.exports = {
  aggregateMarginByServico,
  aggregateMarginByProfissional,
  aggregateMarginByProduto,
  aggregateMarginByForma,
  computeTicketMedio
};

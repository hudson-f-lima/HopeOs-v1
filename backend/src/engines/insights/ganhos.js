// Ganhos do profissional no mês e linhas de serviços prestados para o contador.
// Funções puras sobre o que o checkout gravou (comando_itens, comando_gorjetas) e os
// estornos (D-013). Nada é estimado e nada é gravado: o PAGAMENTO da comissão (vale,
// adiantamento, fechamento) não existe — exige migration (docs/planning/INTEGRACOES_FUTURAS.md).
// Estorno entra no mês DO ESTORNO, igual à cota-parte: o mês já fechado não muda.
const n = v => Number(v || 0);

function computeGanhos({ comandos = [], comandoItens = [], gorjetas = [], estornos = [], estornoItens = [], estornoGorjetas = [], profissionalId, mes }) {
  const dataDaComanda = new Map(comandos.filter(c => String(c.data).startsWith(mes)).map(c => [c.id, String(c.data)]));
  const dias = new Map();
  const dia = data => {
    if (!dias.has(data)) dias.set(data, { data, atendimentos: 0, comissaoCentavos: 0, gorjetaCentavos: 0 });
    return dias.get(data);
  };
  const r = { mes, profissionalId, atendimentos: 0, valorServicosCentavos: 0, comissaoCentavos: 0, gorjetaLiquidaCentavos: 0, estornos: { quantidade: 0, comissaoCentavos: 0, gorjetaCentavos: 0 } };

  for (const item of comandoItens) {
    const data = dataDaComanda.get(item.comando_id);
    if (!data || item.profissional_id !== profissionalId) continue;
    if (item.tipo === 'servico') { r.atendimentos += n(item.quantidade) || 1; r.valorServicosCentavos += n(item.valor_liquido_centavos); dia(data).atendimentos += n(item.quantidade) || 1; }
    r.comissaoCentavos += n(item.comissao_centavos);
    dia(data).comissaoCentavos += n(item.comissao_centavos);
  }
  for (const g of gorjetas) {
    const data = dataDaComanda.get(g.comando_id);
    if (!data || g.profissional_id !== profissionalId) continue;
    r.gorjetaLiquidaCentavos += n(g.valor_liquido_centavos);
    dia(data).gorjetaCentavos += n(g.valor_liquido_centavos);
  }

  const dataDoEstorno = new Map(estornos.filter(e => String(e.data).startsWith(mes)).map(e => [e.id, String(e.data)]));
  const itemOriginal = new Map(comandoItens.map(i => [i.id, i]));
  const estornosDoProf = new Set();
  for (const ei of estornoItens) {
    const data = dataDoEstorno.get(ei.estorno_id);
    const original = itemOriginal.get(ei.comando_item_id);
    if (!data || !original || original.profissional_id !== profissionalId) continue;
    estornosDoProf.add(ei.estorno_id);
    r.estornos.comissaoCentavos += n(ei.comissao_centavos);
    dia(data).comissaoCentavos -= n(ei.comissao_centavos);
  }
  for (const eg of estornoGorjetas) {
    const data = dataDoEstorno.get(eg.estorno_id);
    if (!data || eg.profissional_id !== profissionalId) continue;
    estornosDoProf.add(eg.estorno_id);
    r.estornos.gorjetaCentavos += n(eg.valor_liquido_centavos);
    dia(data).gorjetaCentavos -= n(eg.valor_liquido_centavos);
  }
  r.estornos.quantidade = estornosDoProf.size;
  r.totalCentavos = r.comissaoCentavos + r.gorjetaLiquidaCentavos - r.estornos.comissaoCentavos - r.estornos.gorjetaCentavos;
  r.porDia = [...dias.values()].sort((a, b) => a.data.localeCompare(b.data));
  return r;
}

// Uma linha por item vendido no mês e uma linha NEGATIVA por item estornado no mês.
// Sem dado de cliente (minimização de PII): o contador recebe valores, não pessoas.
function listServicosPrestados({ comandos = [], comandoItens = [], profissionais = [], estornos = [], estornoItens = [], mes }) {
  const dataDaComanda = new Map(comandos.filter(c => String(c.data).startsWith(mes)).map(c => [c.id, String(c.data)]));
  const nome = new Map(profissionais.map(p => [p.id, p.nome]));
  const linhas = [];
  for (const item of comandoItens) {
    const data = dataDaComanda.get(item.comando_id);
    if (!data) continue;
    linhas.push({ data, lancamento: 'venda', comandaId: item.comando_id, tipo: item.tipo, descricao: item.descricao || '', profissional: item.profissional_id ? (nome.get(item.profissional_id) || 'Profissional removido') : '', quantidade: n(item.quantidade) || 1, valorCentavos: n(item.valor_liquido_centavos), cotaParteProfissionalCentavos: n(item.comissao_centavos), cotaParteSalaoCentavos: n(item.receita_empresa_centavos) });
  }
  const estornoPorId = new Map(estornos.filter(e => String(e.data).startsWith(mes)).map(e => [e.id, e]));
  const itemOriginal = new Map(comandoItens.map(i => [i.id, i]));
  for (const ei of estornoItens) {
    const estorno = estornoPorId.get(ei.estorno_id);
    if (!estorno) continue;
    const o = itemOriginal.get(ei.comando_item_id) || {};
    linhas.push({ data: String(estorno.data), lancamento: 'estorno', comandaId: estorno.comando_id || o.comando_id || '', tipo: o.tipo || '', descricao: o.descricao || '', profissional: o.profissional_id ? (nome.get(o.profissional_id) || 'Profissional removido') : '', quantidade: -(n(ei.quantidade) || 0), valorCentavos: -n(ei.valor_liquido_centavos), cotaParteProfissionalCentavos: -n(ei.comissao_centavos), cotaParteSalaoCentavos: -n(ei.receita_empresa_centavos) });
  }
  linhas.sort((a, b) => a.data.localeCompare(b.data) || a.comandaId.localeCompare(b.comandaId));
  const soma = k => linhas.reduce((s, l) => s + l[k], 0);
  return { mes, linhas, totais: { valorCentavos: soma('valorCentavos'), cotaParteProfissionalCentavos: soma('cotaParteProfissionalCentavos'), cotaParteSalaoCentavos: soma('cotaParteSalaoCentavos') } };
}

module.exports = { computeGanhos, listServicosPrestados };

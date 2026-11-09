// Cota-parte do mês (Lei do Salão-Parceiro, Onda B): separa o que é do salão e o
// que é de cada profissional parceiro, a partir do ledger já gravado no checkout.
// É apoio à contabilidade; o enquadramento jurídico depende de contrato e contador.
// Estornos (D-013): descontados no mês DO ESTORNO, nunca no mês da comanda — a
// cota-parte de um mês já fechado não muda depois.
function computeCotaParte({ comandos, comandoItens, profissionais, mes, estornos = [], estornoItens = [] }) {
  const doMes = new Set((comandos || []).filter(c => String(c.data).startsWith(mes)).map(c => c.id));
  const nomes = new Map((profissionais || []).map(p => [p.id, p.nome]));
  const porProf = new Map();
  let cotaSalao = 0;
  let cotaProfissionais = 0;
  let bruto = 0;
  const linhaDe = id => porProf.get(id) || { profissionalId: id, nome: nomes.get(id) || 'Profissional removido', itens: 0, valorCentavos: 0, cotaParteCentavos: 0 };
  for (const item of comandoItens || []) {
    if (!doMes.has(item.comando_id)) continue;
    const comissao = Number(item.comissao_centavos || 0);
    const salao = Number(item.receita_empresa_centavos || 0);
    const valor = Number(item.valor_liquido_centavos || 0);
    bruto += valor;
    cotaSalao += salao;
    cotaProfissionais += comissao;
    if (item.profissional_id) {
      const atual = linhaDe(item.profissional_id);
      atual.itens++;
      atual.valorCentavos += valor;
      atual.cotaParteCentavos += comissao;
      porProf.set(item.profissional_id, atual);
    }
  }

  const estornosDoMes = new Set((estornos || []).filter(e => String(e.data).startsWith(mes)).map(e => e.id));
  const itensPorId = new Map((comandoItens || []).map(i => [i.id, i]));
  const est = { quantidade: estornosDoMes.size, valorCentavos: 0, cotaParteSalaoCentavos: 0, cotaParteProfissionaisCentavos: 0 };
  for (const ei of estornoItens || []) {
    if (!estornosDoMes.has(ei.estorno_id)) continue;
    const valor = Number(ei.valor_liquido_centavos || 0);
    const comissao = Number(ei.comissao_centavos || 0);
    const salao = Number(ei.receita_empresa_centavos || 0);
    bruto -= valor; cotaSalao -= salao; cotaProfissionais -= comissao;
    est.valorCentavos += valor; est.cotaParteSalaoCentavos += salao; est.cotaParteProfissionaisCentavos += comissao;
    const original = itensPorId.get(ei.comando_item_id);
    if (original && original.profissional_id) {
      const atual = linhaDe(original.profissional_id);
      atual.valorCentavos -= valor;
      atual.cotaParteCentavos -= comissao;
      porProf.set(original.profissional_id, atual);
    }
  }
  return {
    mes,
    comandas: doMes.size,
    valorItensCentavos: bruto,
    cotaParteSalaoCentavos: cotaSalao,
    cotaParteProfissionaisCentavos: cotaProfissionais,
    estornos: est,
    profissionais: [...porProf.values()].sort((a, b) => b.cotaParteCentavos - a.cotaParteCentavos)
  };
}

module.exports = { computeCotaParte };

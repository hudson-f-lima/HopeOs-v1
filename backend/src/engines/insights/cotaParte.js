// Cota-parte do mês (Lei do Salão-Parceiro, Onda B): separa o que é do salão e o
// que é de cada profissional parceiro, a partir do ledger já gravado no checkout.
// É apoio à contabilidade; o enquadramento jurídico depende de contrato e contador.
function computeCotaParte({ comandos, comandoItens, profissionais, mes }) {
  const doMes = new Set((comandos || []).filter(c => String(c.data).startsWith(mes)).map(c => c.id));
  const nomes = new Map((profissionais || []).map(p => [p.id, p.nome]));
  const porProf = new Map();
  let cotaSalao = 0;
  let cotaProfissionais = 0;
  let bruto = 0;
  for (const item of comandoItens || []) {
    if (!doMes.has(item.comando_id)) continue;
    const comissao = Number(item.comissao_centavos || 0);
    const salao = Number(item.receita_empresa_centavos || 0);
    const valor = Number(item.valor_liquido_centavos || 0);
    bruto += valor;
    cotaSalao += salao;
    cotaProfissionais += comissao;
    if (item.profissional_id) {
      const atual = porProf.get(item.profissional_id) || { profissionalId: item.profissional_id, nome: nomes.get(item.profissional_id) || 'Profissional removido', itens: 0, valorCentavos: 0, cotaParteCentavos: 0 };
      atual.itens++;
      atual.valorCentavos += valor;
      atual.cotaParteCentavos += comissao;
      porProf.set(item.profissional_id, atual);
    }
  }
  return {
    mes,
    comandas: doMes.size,
    valorItensCentavos: bruto,
    cotaParteSalaoCentavos: cotaSalao,
    cotaParteProfissionaisCentavos: cotaProfissionais,
    profissionais: [...porProf.values()].sort((a, b) => b.cotaParteCentavos - a.cotaParteCentavos)
  };
}

module.exports = { computeCotaParte };

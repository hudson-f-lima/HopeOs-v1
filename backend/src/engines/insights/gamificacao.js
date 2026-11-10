// Metas e ranking do mês (D-019, migration 011) — funções puras.
// O progresso nunca é gravado: sai do que o checkout gravou (comando_itens), menos os
// estornos lançados no mês (D-013: o estorno pesa no mês DO estorno).
// Só serviço conta: produto vendido não é atendimento nem entra no faturamento da meta.
// Sem prêmio e sem efeito em comissão, agenda ou distribuição de clientes.
const n = v => Number(v || 0);

function computeDesempenho({ comandos = [], comandoItens = [], estornos = [], estornoItens = [], profissionais = [], mes }) {
  const doMes = new Set(comandos.filter(c => String(c.data).startsWith(mes)).map(c => c.id));
  const linhas = new Map(profissionais.filter(p => p.ativo !== false).map(p => [p.id, { profissionalId: p.id, nome: p.nome, atendimentos: 0, faturamentoCentavos: 0 }]));
  const linha = id => linhas.get(id);
  for (const item of comandoItens) {
    if (item.tipo !== 'servico' || !doMes.has(item.comando_id) || !linha(item.profissional_id)) continue;
    linha(item.profissional_id).atendimentos += n(item.quantidade) || 1;
    linha(item.profissional_id).faturamentoCentavos += n(item.valor_liquido_centavos);
  }
  const estornosDoMes = new Set(estornos.filter(e => String(e.data).startsWith(mes)).map(e => e.id));
  const original = new Map(comandoItens.map(i => [i.id, i]));
  for (const ei of estornoItens) {
    const o = original.get(ei.comando_item_id);
    if (!estornosDoMes.has(ei.estorno_id) || !o || o.tipo !== 'servico' || !linha(o.profissional_id)) continue;
    linha(o.profissional_id).atendimentos -= n(ei.quantidade);
    linha(o.profissional_id).faturamentoCentavos -= n(ei.valor_liquido_centavos);
  }
  return [...linhas.values()];
}

const CAMPO = { faturamento: 'faturamentoCentavos', atendimentos: 'atendimentos' };

// Metas do mês com o progresso de cada uma. percentual é truncado (99,9% não vira 100%).
function computeMetas({ metas = [], desempenho = [], mes }) {
  const porProf = new Map(desempenho.map(d => [d.profissionalId, d]));
  return metas.filter(m => m.mes === mes && porProf.has(m.profissional_id)).map(m => {
    const realizado = Math.max(0, porProf.get(m.profissional_id)[CAMPO[m.tipo]] || 0);
    const alvo = n(m.valor_alvo);
    return { id: m.id, profissionalId: m.profissional_id, nome: porProf.get(m.profissional_id).nome, mes, tipo: m.tipo, alvo, realizado, percentual: alvo > 0 ? Math.floor((realizado * 100) / alvo) : 0, atingida: alvo > 0 && realizado >= alvo };
  }).sort((a, b) => a.nome.localeCompare(b.nome) || a.tipo.localeCompare(b.tipo));
}

// Ranking por faturamento de serviços; empate desfeito por atendimentos e depois pelo nome.
// Empatados de verdade (mesmo faturamento e mesmos atendimentos) dividem a posição.
function computeRanking({ desempenho = [], comValores = true, destaqueId = null }) {
  const ordenado = [...desempenho].sort((a, b) => b.faturamentoCentavos - a.faturamentoCentavos || b.atendimentos - a.atendimentos || a.nome.localeCompare(b.nome));
  const topo = ordenado.length ? Math.max(0, ordenado[0].faturamentoCentavos) : 0;
  let posicao = 0;
  return ordenado.map((d, i) => {
    const anterior = ordenado[i - 1];
    if (!anterior || anterior.faturamentoCentavos !== d.faturamentoCentavos || anterior.atendimentos !== d.atendimentos) posicao = i + 1;
    const base = { posicao, profissionalId: d.profissionalId, nome: d.nome, atendimentos: Math.max(0, d.atendimentos), percentualDoLider: topo > 0 ? Math.floor((Math.max(0, d.faturamentoCentavos) * 100) / topo) : 0 };
    // A equipe vê posição e proporção; o valor em reais de um colega só a gestão vê.
    if (comValores || d.profissionalId === destaqueId) base.faturamentoCentavos = d.faturamentoCentavos;
    if (destaqueId) base.voce = d.profissionalId === destaqueId;
    return base;
  });
}

module.exports = { computeDesempenho, computeMetas, computeRanking };

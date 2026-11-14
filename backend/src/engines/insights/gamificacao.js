// Metas e ranking do mês (D-019/D-020, migration 011) — funções puras.
// O progresso nunca é gravado: sai do que o checkout gravou (comando_itens), menos os
// estornos lançados no mês (D-013: o estorno pesa no mês DO estorno).
// Cada item conta para o profissional gravado nele: quem fez o serviço, quem vendeu o
// produto. Produto sem vendedor não conta para ninguém. Serviço extra vendido durante o
// atendimento é um serviço como outro qualquer: entra em serviços e em atendimentos.
// Sem prêmio e sem efeito em comissão, agenda ou distribuição de clientes.
const n = v => Number(v || 0);

function computeDesempenho({ comandos = [], comandoItens = [], estornos = [], estornoItens = [], profissionais = [], mes }) {
  const doMes = new Set(comandos.filter(c => String(c.data).startsWith(mes)).map(c => c.id));
  const linhas = new Map(profissionais.filter(p => p.ativo !== false).map(p => [p.id, { profissionalId: p.id, nome: p.nome, atendimentos: 0, faturamentoCentavos: 0, produtosCentavos: 0, produtosQuantidade: 0, _comandas: new Set() }]));
  const linha = id => linhas.get(id);
  for (const item of comandoItens) {
    const l = linha(item.profissional_id);
    if (!l || !doMes.has(item.comando_id)) continue;
    l._comandas.add(item.comando_id);
    if (item.tipo === 'servico') { l.atendimentos += n(item.quantidade) || 1; l.faturamentoCentavos += n(item.valor_liquido_centavos); }
    else { l.produtosQuantidade += n(item.quantidade) || 1; l.produtosCentavos += n(item.valor_liquido_centavos); }
  }
  const estornosDoMes = new Set(estornos.filter(e => String(e.data).startsWith(mes)).map(e => e.id));
  const original = new Map(comandoItens.map(i => [i.id, i]));
  for (const ei of estornoItens) {
    const o = original.get(ei.comando_item_id);
    const l = o && linha(o.profissional_id);
    if (!l || !estornosDoMes.has(ei.estorno_id)) continue;
    if (o.tipo === 'servico') { l.atendimentos -= n(ei.quantidade); l.faturamentoCentavos -= n(ei.valor_liquido_centavos); }
    else { l.produtosQuantidade -= n(ei.quantidade); l.produtosCentavos -= n(ei.valor_liquido_centavos); }
  }
  return [...linhas.values()].map(({ _comandas, ...l }) => {
    const total = l.faturamentoCentavos + l.produtosCentavos;
    // Ticket médio do profissional: o que ele vendeu (serviços + produtos) por comanda em que participou.
    return { ...l, totalCentavos: total, comandas: _comandas.size, ticketMedioCentavos: _comandas.size ? Math.round(Math.max(0, total) / _comandas.size) : 0 };
  });
}

const CAMPO = { faturamento: 'faturamentoCentavos', atendimentos: 'atendimentos', produtos: 'produtosCentavos' };

// Metas do mês com o progresso de cada uma. percentual é truncado (99,9% não vira 100%).
function computeMetas({ metas = [], desempenho = [], mes }) {
  const porProf = new Map(desempenho.map(d => [d.profissionalId, d]));
  return metas.filter(m => m.mes === mes && porProf.has(m.profissional_id) && CAMPO[m.tipo]).map(m => {
    const realizado = Math.max(0, porProf.get(m.profissional_id)[CAMPO[m.tipo]] || 0);
    const alvo = n(m.valor_alvo);
    return { id: m.id, profissionalId: m.profissional_id, nome: porProf.get(m.profissional_id).nome, mes, tipo: m.tipo, alvo, realizado, percentual: alvo > 0 ? Math.floor((realizado * 100) / alvo) : 0, atingida: alvo > 0 && realizado >= alvo };
  }).sort((a, b) => a.nome.localeCompare(b.nome) || a.tipo.localeCompare(b.tipo));
}

const CRITERIOS = { servicos: 'faturamentoCentavos', produtos: 'produtosCentavos', total: 'totalCentavos' };

// Ranking pelo critério escolhido (serviços, produtos ou total); empate desfeito por
// atendimentos e depois pelo nome. Empatados de verdade dividem a posição.
function computeRanking({ desempenho = [], criterio = 'servicos', comValores = true, destaqueId = null }) {
  const campo = CRITERIOS[criterio] || CRITERIOS.servicos;
  const ordenado = [...desempenho].sort((a, b) => b[campo] - a[campo] || b.atendimentos - a.atendimentos || a.nome.localeCompare(b.nome));
  const topo = ordenado.length ? Math.max(0, ordenado[0][campo]) : 0;
  let posicao = 0;
  return ordenado.map((d, i) => {
    const anterior = ordenado[i - 1];
    if (!anterior || anterior[campo] !== d[campo] || anterior.atendimentos !== d.atendimentos) posicao = i + 1;
    const base = { posicao, profissionalId: d.profissionalId, nome: d.nome, atendimentos: Math.max(0, d.atendimentos), percentualDoLider: topo > 0 ? Math.floor((Math.max(0, d[campo]) * 100) / topo) : 0 };
    // A equipe vê posição e proporção; valores em reais de um colega só a gestão vê.
    if (comValores || d.profissionalId === destaqueId) {
      Object.assign(base, { valorCentavos: d[campo], faturamentoCentavos: d.faturamentoCentavos, produtosCentavos: d.produtosCentavos, totalCentavos: d.totalCentavos, ticketMedioCentavos: d.ticketMedioCentavos });
    }
    if (destaqueId) base.voce = d.profissionalId === destaqueId;
    return base;
  });
}

// Os `quantos` meses fechados antes de `mes` (YYYY-MM), do mais antigo ao mais recente.
function mesesAnteriores(mes, quantos = 3) {
  const [ano, m] = mes.split('-').map(Number);
  return Array.from({ length: quantos }, (_, i) => {
    const d = new Date(Date.UTC(ano, m - 1 - (quantos - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

// Sugestão de meta: média dos 3 meses fechados anteriores × (1 + incremento).
// Só sugere; quem grava a meta é a gestão. Sem movimento nos 3 meses = sem sugestão
// (profissional novo ou que ficou fora não recebe meta calculada sobre zero).
// Valores em reais sobem para o real inteiro; atendimentos vão para o inteiro mais próximo.
function sugerirMetas({ desempenhoPorMes = [], incrementoPct = 5 }) {
  const inc = 1 + Number(incrementoPct || 0) / 100;
  const porProf = new Map();
  for (const { desempenho = [] } of desempenhoPorMes) {
    for (const d of desempenho) {
      const l = porProf.get(d.profissionalId) || { profissionalId: d.profissionalId, nome: d.nome, meses: [] };
      l.meses.push(d);
      porProf.set(d.profissionalId, l);
    }
  }
  const total = desempenhoPorMes.length;
  return [...porProf.values()].map(l => {
    const comMovimento = l.meses.filter(d => d.atendimentos > 0 || d.totalCentavos > 0).length;
    const completo = total > 0 && comMovimento === total;
    const sugestao = (tipo, arredonda) => {
      if (!completo) return null;
      const media = l.meses.reduce((s, d) => s + Math.max(0, d[CAMPO[tipo]] || 0), 0) / total;
      if (media <= 0) return null;
      return { media: Math.round(media), sugerido: arredonda(media * inc) };
    };
    const reais = v => Math.ceil(v / 100) * 100;
    return {
      profissionalId: l.profissionalId, nome: l.nome, mesesComMovimento: comMovimento,
      faturamento: sugestao('faturamento', reais), produtos: sugestao('produtos', reais), atendimentos: sugestao('atendimentos', v => Math.max(1, Math.round(v)))
    };
  }).sort((a, b) => a.nome.localeCompare(b.nome));
}

// Meta do salão (reconhecimento sem valor, D-027): a soma das metas de FATURAMENTO já
// definidas para o mês, e o faturamento de serviços só dos profissionais que têm meta.
// Devolve totais, nunca nomes. Não entra em comissão, repasse ou pagamento.
function computeMetaSalao({ desempenho = [], metas = [], mes }) {
  const comMeta = new Map();
  for (const m of metas) {
    if (m.mes !== mes || m.tipo !== 'faturamento' || !(n(m.valor_alvo) > 0)) continue;
    comMeta.set(m.profissional_id, (comMeta.get(m.profissional_id) || 0) + n(m.valor_alvo));
  }
  let alvo = 0; let realizado = 0; let profissionaisComMeta = 0;
  for (const d of desempenho) {
    if (!comMeta.has(d.profissionalId)) continue;
    alvo += comMeta.get(d.profissionalId);
    realizado += Math.max(0, n(d.faturamentoCentavos));
    profissionaisComMeta++;
  }
  const temMetas = alvo > 0;
  return {
    mes, temMetas, metaCentavos: alvo, realizadoCentavos: realizado,
    percentual: temMetas ? Math.floor((realizado * 100) / alvo) : null,
    reconhecida: temMetas && realizado >= alvo,
    profissionaisComMeta
  };
}

module.exports = { computeDesempenho, computeMetas, computeRanking, computeMetaSalao, sugerirMetas, mesesAnteriores, CRITERIOS };

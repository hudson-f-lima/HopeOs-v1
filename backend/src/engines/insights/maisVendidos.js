// Atalhos da comanda: os serviços e produtos mais vendidos nos últimos dias — função pura.
// Conta unidades em comandas fechadas na janela; item inativo ou apagado do cadastro fica
// fora. Devolve só os ids, em ordem: nome e preço a tela já tem no catálogo, e a
// quantidade vendida não é exposta (a equipe também usa esta lista).
// Empate: o vendido mais recentemente vem antes; depois, ordem alfabética.
function computeMaisVendidos({ comandos = [], comandoItens = [], servicos = [], produtos = [], hoje, dias = 90, limiteServicos = 4, limiteProdutos = 2 }) {
  const fim = String(hoje).slice(0, 10);
  const d = new Date(`${fim}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  const inicio = d.toISOString().slice(0, 10);
  const dataDe = new Map(comandos.filter(c => { const dt = String(c.data).slice(0, 10); return dt > inicio && dt <= fim; }).map(c => [c.id, String(c.data).slice(0, 10)]));
  const ativos = lista => new Map(lista.filter(x => x && x.ativo !== false).map(x => [x.id, x.nome || '']));
  const nomes = { servico: ativos(servicos), produto: ativos(produtos) };
  const conta = { servico: new Map(), produto: new Map() };
  for (const item of comandoItens) {
    const data = dataDe.get(item.comando_id);
    const id = item.tipo === 'servico' ? item.servico_id : item.produto_id;
    if (!data || !conta[item.tipo] || !nomes[item.tipo].has(id)) continue;
    const atual = conta[item.tipo].get(id) || { id, quantidade: 0, ultima: '' };
    atual.quantidade += Number(item.quantidade) || 1;
    if (data > atual.ultima) atual.ultima = data;
    conta[item.tipo].set(id, atual);
  }
  const topo = (tipo, limite) => [...conta[tipo].values()]
    .sort((a, b) => b.quantidade - a.quantidade || b.ultima.localeCompare(a.ultima) || nomes[tipo].get(a.id).localeCompare(nomes[tipo].get(b.id)))
    .slice(0, limite).map(x => x.id);
  return { dias, servicos: topo('servico', limiteServicos), produtos: topo('produto', limiteProdutos) };
}

module.exports = { computeMaisVendidos };

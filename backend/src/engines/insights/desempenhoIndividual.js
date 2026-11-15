// Indicadores de um colaborador no mês (D-029) — função pura que só reúne motores que
// já existem: desempenho do mês (gamificacao.computeDesempenho), agenda e clientes
// (piloto.computePiloto, quebra por profissional) e ocupação (occupancy.computeSur).
// Compara com o mês anterior da própria pessoa e com a média do salão.
// Nada é gravado; não há nota, ranking, rótulo nem efeito em comissão.
const { computeDesempenho } = require('./gamificacao');
const { computePiloto } = require('./piloto');
const { computeSur } = require('./occupancy');

const AMOSTRA_MINIMA = 5; // abaixo disso a taxa aparece marcada como amostra pequena

function ultimoDia(mes) {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}
function mesAnterior(mes) {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
// Período do mês até hoje (mês corrente fica parcial). Mês futuro devolve null.
function periodo(mes, hoje) {
  const de = `${mes}-01`;
  if (de > hoje) return null;
  const fim = ultimoDia(mes);
  return { de, ate: fim < hoje ? fim : hoje };
}

const taxa = k => (k ? { numerador: k.numerador, denominador: k.denominador, taxa: k.taxa, amostraPequena: k.denominador < AMOSTRA_MINIMA } : { numerador: 0, denominador: 0, taxa: null, amostraPequena: true });
const vazioDesempenho = { atendimentos: 0, faturamentoCentavos: 0, produtosCentavos: 0, produtosQuantidade: 0, ticketMedioCentavos: 0, comandas: 0 };

function doMes({ dados, profissional, mes, hoje, timeZone, retornoDias, empresa }) {
  const p = periodo(mes, hoje);
  if (!p) return null;
  const desempenho = computeDesempenho({ ...dados, mes });
  const meu = desempenho.find(d => d.profissionalId === profissional.id) || vazioDesempenho;
  const piloto = computePiloto({ agendamentos: dados.agendamentos, comandos: dados.comandos, comandoItens: dados.comandoItens, eventos: dados.eventos, de: p.de, ate: p.ate, hoje, timeZone, retornoDias });
  const q = piloto.porProfissional.find(x => x.profissionalId === String(profissional.id));
  const sur = computeSur({ agendamentos: dados.agendamentos, profissional, empresa, dataInicio: p.de, dataFim: p.ate });
  const ret = q ? q.retornoClienteNovo : null;
  return {
    periodo: p,
    indicadores: {
      atendimentos: meu.atendimentos,
      faturamentoCentavos: meu.faturamentoCentavos,
      produtosCentavos: meu.produtosCentavos,
      produtosQuantidade: meu.produtosQuantidade,
      ticketMedioCentavos: meu.ticketMedioCentavos,
      ocupacao: { pct: sur.minutoDisponivel ? sur.surPct : null, minutosVendidos: sur.minutoVendido, minutosDisponiveis: sur.minutoDisponivel },
      taxaFalta: taxa(q && q.taxaFalta),
      reagendamento: taxa(q && q.reagendamentoCheckout),
      retornoNovos: { ...taxa(ret), categorias: ret ? ret.categorias : { voltouMesmoProfissional: 0, voltouOutroProfissional: 0, voltouSemInfoProfissional: 0, naoVoltou: 0 } }
    },
    desempenho, piloto
  };
}

// Média do salão no mesmo mês: valores por pessoa, entre os profissionais ativos que
// tiveram ao menos uma comanda; taxas pelo total do salão (mesmas definições).
function mediaSalao({ atual, dados, empresa }) {
  const comMovimento = atual.desempenho.filter(d => d.comandas > 0);
  const media = campo => (comMovimento.length ? Math.round(comMovimento.reduce((s, d) => s + Math.max(0, d[campo]), 0) / comMovimento.length) : null);
  let vendidos = 0; let disponiveis = 0;
  (dados.profissionais || []).filter(p => p.ativo !== false).forEach(prof => {
    const s = computeSur({ agendamentos: dados.agendamentos, profissional: prof, empresa, dataInicio: atual.periodo.de, dataFim: atual.periodo.ate });
    vendidos += s.minutoVendido; disponiveis += s.minutoDisponivel;
  });
  const pl = atual.piloto;
  return {
    profissionaisConsiderados: comMovimento.length,
    atendimentos: media('atendimentos'),
    faturamentoCentavos: media('faturamentoCentavos'),
    produtosCentavos: media('produtosCentavos'),
    ticketMedioCentavos: media('ticketMedioCentavos'),
    ocupacaoPct: disponiveis ? Math.min(100, Math.round((vendidos / disponiveis) * 1000) / 10) : null,
    taxaFalta: pl.taxaFalta.taxa,
    reagendamento: pl.reagendamentoCheckout.taxa,
    retornoNovos: pl.retornoClienteNovo.taxa
  };
}

function computeDesempenhoIndividual({ dados, profissional, mes, hoje, timeZone = 'America/Sao_Paulo', retornoDias = 60, empresa = {} }) {
  const atual = doMes({ dados, profissional, mes, hoje, timeZone, retornoDias, empresa });
  if (!atual) return null;
  const anteriorMes = mesAnterior(mes);
  const anterior = doMes({ dados, profissional, mes: anteriorMes, hoje, timeZone, retornoDias, empresa });
  return {
    mes,
    retornoDias,
    amostraMinima: AMOSTRA_MINIMA,
    profissional: { id: profissional.id, nome: profissional.nome },
    atual: { periodo: atual.periodo, ...atual.indicadores },
    mesAnterior: anterior ? { mes: anteriorMes, periodo: anterior.periodo, ...anterior.indicadores } : null,
    mediaSalao: mediaSalao({ atual, dados, empresa })
  };
}

module.exports = { computeDesempenhoIndividual, AMOSTRA_MINIMA, periodo, mesAnterior };

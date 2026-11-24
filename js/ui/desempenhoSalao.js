import { api, StaleContextError } from '../api.js';
import { state, sessionPode } from '../state.js';
import { centsToBRL } from '../utils.js';

const el = id => document.getElementById(id);
const setText = (id, texto) => { el(id).textContent = texto; };
const podeVer = () => Boolean(state.session && sessionPode('painel:financeiro'));
const inteiro = new Intl.NumberFormat('pt-BR');
const percentual = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const competencia = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
let pedido = 0;
let posicao = 0;

const dinheiro = valor => Number.isFinite(valor) ? centsToBRL(valor) : 'Indisponível';

function horas(minutos) {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (!h) return inteiro.format(m) + ' min';
  return inteiro.format(h) + ' h' + (m ? ' ' + inteiro.format(m) + ' min' : '');
}

function renderPeriodo(inicio, fim) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
    throw new Error('Período ausente');
  }
  const data = dia => dia.split('-').reverse().join('/');
  const periodo = data(inicio) + ' a ' + data(fim);
  setText('desempenhoPeriodo', competencia.format(new Date(inicio + 'T00:00:00Z')) + ' · ' + periodo);
}

function renderResultado(resultado) {
  const composicao = el('desempenhoComposicao');
  composicao.replaceChildren();
  if (!resultado) {
    setText('desempenhoComposicaoNota', 'A composição deste período está indisponível.');
    return;
  }
  const linhas = [
    ['Faturamento', resultado.faturamentoCentavos],
    ['Comissões', resultado.comissoesCentavos],
    ['Taxas sobre vendas', resultado.taxasItensCentavos],
    ['Custo dos produtos vendidos', resultado.custoProdutosVendidosCentavos],
    ['Parte do salão', resultado.parteSalaoCentavos]
  ];
  // D-071: a diferença aparece separada pela causa conhecida (taxa da gorjeta devolvida em estorno).
  if (resultado.taxaGorjetaEstornadaCentavos) {
    linhas.push(['Taxa de gorjetas devolvidas em estornos', resultado.taxaGorjetaEstornadaCentavos]);
  }
  if (resultado.outraDiferencaCentavos) {
    linhas.push(['Diferença sem causa identificada (conferir)', resultado.outraDiferencaCentavos]);
  }
  for (const [rotulo, valor] of linhas) {
    const linha = document.createElement('div');
    const label = document.createElement('dt');
    const dado = document.createElement('dd');
    label.textContent = rotulo;
    dado.textContent = dinheiro(valor);
    linha.append(label, dado);
    composicao.append(linha);
  }
  setText('desempenhoComposicaoNota', 'A parte do salão inclui serviços e produtos. As taxas sobre vendas excluem gorjetas.'
    + ' Num estorno, a taxa e o custo da venda devolvida não voltam: saem da parte do salão.');
}

function render(dados) {
  renderPeriodo(dados.inicio, dados.fim);
  const disponivel = dados.minutosDisponiveis > 0;
  const identificados = dados.clientesIdentificados > 0;
  setText('desempenhoParteHora', Number.isFinite(dados.parteSalaoServicosPorHoraCentavos)
    ? dinheiro(dados.parteSalaoServicosPorHoraCentavos) + ' por hora'
    : 'Sem base para calcular');
  setText('desempenhoParteHoraBase', disponivel
    ? dinheiro(dados.parteSalaoServicosCentavos) + ' em serviços ÷ ' + horas(dados.minutosDisponiveis) + ' disponíveis'
    : 'Sem tempo disponível registrado no período.');

  setText('desempenhoFaturamento', dinheiro(dados.faturamentoCentavos));
  setText('desempenhoTicket', Number.isFinite(dados.ticketMedioCentavos) ? dinheiro(dados.ticketMedioCentavos) : 'Sem comandas válidas');
  // Ticket da coorte (D-071): estorno de venda de outro período não entra; aparece à parte.
  setText('desempenhoComandas', (Number.isFinite(dados.comandas)
    ? inteiro.format(dados.comandas) + (dados.comandas === 1 ? ' comanda no cálculo' : ' comandas no cálculo')
    : '') + (dados.estornosVendasAnterioresCentavos > 0
    ? '. Estornos de vendas de períodos anteriores, fora do ticket: ' + dinheiro(dados.estornosVendasAnterioresCentavos)
    : ''));
  setText('desempenhoVisitas', Number.isFinite(dados.visitasIdentificadas) ? inteiro.format(dados.visitasIdentificadas) : 'Indisponível');
  el('desempenhoVisitasNota').hidden = !dados.atendimentosSemCliente;
  setText('desempenhoProdutos', Number.isFinite(dados.produtosUnidades) ? inteiro.format(dados.produtosUnidades) : 'Indisponível');
  setText('desempenhoOcupacao', Number.isFinite(dados.ocupacaoPct) ? percentual.format(dados.ocupacaoPct / 100) : 'Sem base');
  setText('desempenhoOcupacaoBase', disponivel
    ? horas(dados.minutosOcupados) + ' ocupados de ' + horas(dados.minutosDisponiveis) + ' disponíveis'
    : 'Sem tempo disponível registrado no período.');
  setText('desempenhoFidelizacao', identificados ? percentual.format(dados.clientesFieis / dados.clientesIdentificados) : 'Sem base');
  setText('desempenhoFidelizacaoBase', identificados
    ? inteiro.format(dados.clientesFieis) + ' de ' + inteiro.format(dados.clientesIdentificados)
      + (dados.clientesIdentificados === 1 ? ' cliente identificado' : ' clientes identificados')
    : 'Sem clientes identificados no período.');
  el('desempenhoFidelizacaoNota').hidden = !identificados;
  renderResultado(dados.resultadoFinanceiro);
}

function limpar() {
  el('desempenhoIndicadores').classList.add('hidden');
  el('btnRecarregarDesempenho').classList.add('hidden');
  el('dobraResultadoFinanceiro').open = false;
  el('desempenhoStatus').classList.remove('carregado');
  setText('desempenhoPeriodo', '');
  setText('desempenhoStatus', '');
}

async function carregar(painel) {
  const atual = ++pedido;
  const ativo = () => pedido === atual && painel.isConnected && !painel.classList.contains('hidden') && podeVer();
  limpar();
  setText('desempenhoStatus', 'Carregando desempenho…');
  try {
    const dados = await api('/cockpit/desempenho');
    if (!ativo()) return;
    render(dados);
    el('desempenhoIndicadores').classList.remove('hidden');
    el('desempenhoStatus').classList.add('carregado');
    setText('desempenhoStatus', 'Desempenho carregado.');
  } catch (erro) {
    if (!ativo() || erro instanceof StaleContextError) return;
    setText('desempenhoStatus', 'Não foi possível carregar o desempenho agora.');
    el('btnRecarregarDesempenho').classList.remove('hidden');
  }
}

export function atualizarAcessoDesempenho() {
  el('btnAbrirDesempenho').classList.toggle('hidden', !podeVer());
}

export function fecharDesempenho(restaurarFoco = false) {
  if (el('painelDesempenho').classList.contains('hidden')) return;
  pedido++;
  limpar();
  el('painelDesempenho').classList.add('hidden');
  el('dashboardResumo').classList.remove('hidden');
  window.scrollTo(0, posicao);
  if (restaurarFoco) el('btnAbrirDesempenho').focus({ preventScroll: true });
}

export function initDesempenho() {
  const painel = el('painelDesempenho');
  el('btnAbrirDesempenho').addEventListener('click', () => {
    if (!podeVer() || state.activeTab !== 'dashboard') return;
    posicao = window.scrollY;
    el('dashboardResumo').classList.add('hidden');
    painel.classList.remove('hidden');
    el('desempenhoSalaoTitulo').focus({ preventScroll: true });
    window.scrollTo(0, 0);
    carregar(painel);
  });
  el('btnVoltarAnalises').addEventListener('click', () => fecharDesempenho(true));
  el('btnRecarregarDesempenho').addEventListener('click', () => {
    if (!podeVer()) return;
    el('desempenhoSalaoTitulo').focus();
    carregar(painel);
  });
  el('btnVerResultadoFinanceiro').addEventListener('click', () => {
    el('dobraResultadoFinanceiro').open = true;
    el('resultadoFinanceiroTitulo').focus({ preventScroll: true });
    el('resultadoFinanceiroTitulo').scrollIntoView({ block: 'start' });
  });
}

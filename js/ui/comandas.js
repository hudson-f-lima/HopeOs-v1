import { api, onAuthContextChanged } from '../api.js';
import { state, stateBus, findClienteNome, findProfissionalNome, findServicoNome } from '../state.js';
import { centsToBRL, escapeHtml, todayStr } from '../utils.js';
import { temRascunhoCheckout } from './checkout.js';

const el = id => document.getElementById(id);
const ESTADOS_AGENDA = {
  em_atendimento: 'Em atendimento',
  aguardando: 'Aguardando',
  confirmado: 'Confirmado',
  agendado: 'Agendado'
};
const ESTADOS_HISTORICO = { fechado: 'Fechada', estornado_parcial: 'Estorno parcial', estornado: 'Estornada' };
const TITULOS = { agenda: 'Atendimentos da agenda', historico: 'Histórico de comandas' };

let tela = 'lista';
let modo = 'agenda';
let registros = [];
let selecao = null;
let origemLista = null;
let listaDesatualizada = true;
let busca = 0;
let sessao = null;

function escopo(codigo) {
  const atual = state.session;
  if (!atual) return null;
  if (atual.principal !== 'user') return 'total';
  if (atual.permissoes) return atual.permissoes[codigo] || null;
  if (codigo === 'comanda:historico') return ['admin', 'gestor'].includes(atual.role) ? 'total' : null;
  if (atual.role === 'profissional') return 'proprio';
  return ['admin', 'gestor', 'recepcao'].includes(atual.role) ? 'total' : null;
}

function podeFecharAtendimento(item) {
  const alcance = escopo('comanda:fechar');
  return alcance === 'total' || (alcance === 'proprio' && Boolean(item.profissional_id) && item.profissional_id === state.session.profissional_id);
}

function atendimentosParaCheckout(itens) {
  return itens.filter(item => Object.hasOwn(ESTADOS_AGENDA, item.status))
    .sort((a, b) => String(a.horario || '').localeCompare(String(b.horario || '')));
}

function hhmm(hora) {
  return String(hora || '').slice(0, 5);
}

function dataBR(data) {
  return String(data || '').slice(0, 10).split('-').reverse().join('/');
}

function campo(rotulo, valor) {
  return `<div><dt>${rotulo}</dt><dd>${escapeHtml(valor || '—')}</dd></div>`;
}

function renderLista() {
  const agenda = modo === 'agenda';
  el('comandasRegistros').innerHTML = registros.map(item => {
    const cliente = agenda ? findClienteNome(item.cliente_id) : item.clienteNome || 'Sem cliente';
    const estado = agenda ? ESTADOS_AGENDA[item.status] : ESTADOS_HISTORICO[item.status] || item.status;
    const horario = hhmm(agenda ? item.horario : item.hora);
    const resumo = agenda
      ? [findServicoNome(item.servico_id), findProfissionalNome(item.profissional_id)].join(' · ')
      : centsToBRL(item.totalRecebidoCentavos);
    return `<li><button type="button" class="comandas-registro" data-comandas-${modo}="${escapeHtml(item.id)}">
      <span class="comandas-registro-titulo"><strong>${escapeHtml(cliente)}</strong><span>${escapeHtml(resumo)}</span></span>
      <span class="comandas-registro-status"><strong>${escapeHtml(estado)}</strong>${horario ? `<span>${escapeHtml(horario)}</span>` : ''}</span>
    </button></li>`;
  }).join('');
}

function aplicarPermissoes() {
  const agenda = Boolean(escopo('agenda:ver'));
  const historico = Boolean(escopo('comanda:historico'));
  const podeFechar = Boolean(escopo('comanda:fechar'));
  if (modo === 'agenda' && !agenda && historico) modo = 'historico';
  if (modo === 'historico' && !historico && agenda) modo = 'agenda';
  const podeListar = agenda || historico;
  el('btnNovaComanda').classList.toggle('hidden', !podeFechar);
  el('btnNovaComanda').textContent = podeFechar && temRascunhoCheckout() ? 'Continuar comanda' : '+ Nova comanda';
  el('comandasModos').classList.toggle('hidden', !(agenda && historico));
  el('btnComandasAgenda').setAttribute('aria-pressed', String(modo === 'agenda'));
  el('btnComandasHistorico').setAttribute('aria-pressed', String(modo === 'historico'));
  el('comandasFiltros').classList.toggle('hidden', !podeListar);
  el('comandasRegistros').setAttribute('aria-label', TITULOS[modo]);
  el('comandasContexto').textContent = podeListar
    ? (modo === 'agenda' ? 'Atendimentos pendentes na agenda.' : 'Comandas fechadas e estornos registrados.')
    : '';
  return podeListar;
}

async function carregarLista() {
  const atual = ++busca;
  listaDesatualizada = false;
  const data = (el('comandasData').value ||= todayStr());
  const status = el('comandasStatus');
  const lista = el('comandasRegistros');
  registros = [];
  renderLista();
  if (!aplicarPermissoes()) {
    lista.setAttribute('aria-busy', 'false');
    status.textContent = 'Seu acesso não inclui as listas de atendimentos e comandas.';
    return;
  }
  const agenda = modo === 'agenda';
  const contexto = state.session;
  lista.setAttribute('aria-busy', 'true');
  status.textContent = 'Carregando…';
  try {
    const resposta = await api(`/${agenda ? 'agenda' : 'comandas'}?data=${encodeURIComponent(data)}`);
    if (atual !== busca || contexto !== state.session) return;
    const itens = agenda ? resposta : resposta?.comandas;
    if (!Array.isArray(itens)) throw new Error('Resposta inesperada do servidor.');
    registros = agenda ? atendimentosParaCheckout(itens) : itens;
    renderLista();
    status.textContent = registros.length ? '' : agenda
      ? 'Nenhum atendimento pendente na agenda nesta data.'
      : 'Nenhuma comanda fechada nesta data.';
  } catch (erro) {
    if (atual !== busca || contexto !== state.session) return;
    status.textContent = `Não foi possível carregar a lista. ${erro.message}`;
  } finally {
    if (atual === busca) lista.setAttribute('aria-busy', 'false');
  }
}

function exibir(novaTela) {
  tela = novaTela;
  el('comandasHome').classList.toggle('hidden', tela === 'checkout');
  el('comandasCheckout').classList.toggle('hidden', tela !== 'checkout');
  el('comandasLista').classList.toggle('hidden', tela !== 'lista');
  el('comandasDetalhe').classList.toggle('hidden', tela !== 'detalhe');
}

function exibirLista() {
  selecao = null;
  origemLista = null;
  el('comandasDetalheConteudo').replaceChildren();
  exibir('lista');
}

export function abrirComandas() {
  if (!el('comandasHome') || !state.session) return;
  if (sessao !== state.session) {
    sessao = state.session;
    modo = 'agenda';
    el('comandasData').value = todayStr();
  }
  exibirLista();
  return carregarLista();
}

function detalheAgenda(item) {
  return `<h3 id="comandasDetalheTitulo" tabindex="-1">${escapeHtml(findClienteNome(item.cliente_id))}</h3>
    <dl class="comandas-campos">
      ${campo('Atendimento', findServicoNome(item.servico_id))}
      ${campo('Profissional', findProfissionalNome(item.profissional_id))}
      ${campo('Data', dataBR(item.data))}
      ${campo('Horário', hhmm(item.horario))}
      ${campo('Status na agenda', ESTADOS_AGENDA[item.status])}
    </dl>
    ${podeFecharAtendimento(item) ? '<button type="button" id="btnComandaDoAtendimento" class="btn btn-primary">Abrir checkout</button>' : ''}`;
}

function detalheHistorico(item) {
  const itens = item.itens.map(i => `<li class="row">
    <span>${escapeHtml(i.quantidade)} × ${escapeHtml(i.descricao || (i.tipo === 'produto' ? 'Produto' : 'Serviço'))}</span>
    <b>${centsToBRL(i.valorLiquidoCentavos)}</b>
  </li>`).join('');
  const estornos = item.estornos.map(e => `<li class="row">
    <span>${escapeHtml(dataBR(e.data))} · ${e.tipo === 'total' ? 'Total' : 'Parcial'}</span>
    <b>${centsToBRL(e.reembolsoCentavos)}</b>
  </li>`).join('');
  return `<h3 id="comandasDetalheTitulo" tabindex="-1">${escapeHtml(item.clienteNome || 'Sem cliente')}</h3>
    <dl class="comandas-campos">
      ${campo('Data da comanda', dataBR(item.data))}
      ${campo('Horário', hhmm(item.hora))}
      ${campo('Status da comanda', ESTADOS_HISTORICO[item.status] || item.status)}
      ${campo('Total recebido na venda', centsToBRL(item.totalRecebidoCentavos))}
    </dl>
    ${itens ? `<h4>Itens da comanda</h4><ul class="comandas-detalhe-itens">${itens}</ul>` : ''}
    ${estornos ? `<h4>Estornos registrados</h4><ul class="comandas-detalhe-itens">${estornos}</ul>` : ''}`;
}

function abrirDetalhe(item) {
  selecao = item;
  origemLista = { id: item.id, modo, data: el('comandasData').value, x: window.scrollX, y: window.scrollY };
  el('comandasDetalheConteudo').innerHTML = modo === 'agenda' ? detalheAgenda(item) : detalheHistorico(item);
  exibir('detalhe');
  el('comandasDetalheTitulo').focus();
}

async function voltar() {
  const titulo = el('comandasTitulo');
  const origem = origemLista;
  const contexto = sessao;
  if (!origem || !contexto || contexto !== state.session) {
    const carregamento = abrirComandas();
    titulo.focus();
    return carregamento;
  }

  exibirLista();
  const podeListar = aplicarPermissoes();
  if (origem.modo !== modo || origem.data !== el('comandasData').value || !podeListar) {
    titulo.focus();
    return carregarLista();
  }
  if (listaDesatualizada) {
    titulo.focus();
    const carregamento = carregarLista();
    const pedido = busca;
    await carregamento;
    if (pedido !== busca || contexto !== state.session || state.activeTab !== 'checkout' ||
        tela !== 'lista' || document.activeElement !== titulo) return;
  }

  const atributo = `data-comandas-${modo}`;
  const linha = [...el('comandasRegistros').querySelectorAll(`button[${atributo}]`)]
    .find(botao => botao.getAttribute(atributo) === origem.id);
  if (!linha) {
    titulo.focus();
    return;
  }
  linha.focus({ preventScroll: true });
  window.scrollTo(origem.x, origem.y);
}

function mudarModo(novo) {
  if (modo === novo || !escopo(novo === 'agenda' ? 'agenda:ver' : 'comanda:historico')) return;
  modo = novo;
  return carregarLista();
}

function invalidarLista(alvo) {
  if (alvo && modo !== alvo) return;
  listaDesatualizada = true;
  if (state.activeTab === 'checkout' && tela === 'lista' && sessao && sessao === state.session) carregarLista();
}

export function initComandas() {
  const home = el('comandasHome');
  if (!home) return;
  el('btnNovaComanda').addEventListener('click', () => {
    if (escopo('comanda:fechar')) stateBus.dispatchEvent(new CustomEvent('checkout:new'));
  });
  el('btnComandasAgenda').addEventListener('click', () => mudarModo('agenda'));
  el('btnComandasHistorico').addEventListener('click', () => mudarModo('historico'));
  el('btnAtualizarComandas').addEventListener('click', carregarLista);
  el('comandasData').addEventListener('change', carregarLista);
  el('btnVoltarComandas').addEventListener('click', voltar);
  el('btnVoltarCheckoutComandas').addEventListener('click', voltar);
  el('comandasRegistros').addEventListener('click', ev => {
    const id = ev.target.closest(`button[data-comandas-${modo}]`)?.getAttribute(`data-comandas-${modo}`);
    const item = registros.find(r => r.id === id);
    if (item) abrirDetalhe(item);
  });
  el('comandasDetalhe').addEventListener('click', ev => {
    if (ev.target.closest('#btnComandaDoAtendimento') && selecao && modo === 'agenda' && podeFecharAtendimento(selecao)) {
      stateBus.dispatchEvent(new CustomEvent('checkout:prefill', { detail: selecao }));
    }
  });
  stateBus.addEventListener('checkout:draft-open', () => {
    if (!escopo('comanda:fechar')) return;
    exibir('checkout');
    el('btnVoltarCheckoutComandas').focus();
  });
  stateBus.addEventListener('catalog:updated', () => {
    if (modo === 'agenda') renderLista();
  });
  stateBus.addEventListener('agenda:updated', () => invalidarLista('agenda'));
  stateBus.addEventListener('estorno:feito', () => invalidarLista('historico'));
  stateBus.addEventListener('checkout:closed', () => invalidarLista());
  onAuthContextChanged(() => {
    busca++;
    registros = [];
    listaDesatualizada = true;
    sessao = null;
    renderLista();
    el('comandasStatus').textContent = '';
    el('comandasRegistros').setAttribute('aria-busy', 'false');
    exibirLista();
  });
}

import { api, getSession, onAuthContextChanged, getInsightsRebooking, getInsightsAttach } from '../api.js';
import { criarRegistroDeFechamentos, dadosDoFechamento } from '../checkout-pending.js';
import { sessionIdentity } from '../auth-storage.js';
import { state, stateBus, sessionPode, podeFecharAtendimento, findAgendaItemById } from '../state.js';
import {
  centsToBRL,
  escapeHtml,
  genIdempotencyKey,
  clearBanner,
  showBanner,
  formatDDMM
} from '../utils.js';

export function getVisibleCartItems() {
  const tab = state.checkoutTab;
  return tab === 'servicos' ? state.cart.servicos : state.cart.produtos;
}

// A última linha do pagamento dividido é calculada. Nas demais, aceita 20, 20,50 ou 20.50.
function valorDaLinha(v) {
  const t = String(v ?? '').trim();
  if (!t) return 0;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function totalParaDividir() {
  if (totalConfirmado?.base === chaveDoTotal()) return totalConfirmado.centavos;
  let itens = state.comandaItens;
  try { itens = [...state.comandaItens, ...itensDosCampos(false)]; } catch (_) { /* campo incompleto: conta só a lista */ }
  return itens.reduce((t, item) => t + precoDoItem(item), 0) + (state.tip || 0);
}

function buildSplitPayments(totalCentavos) {
  if (state.splits.length < 2) throw new Error('Para dividir, use pelo menos duas formas de pagamento.');

  const outras = state.splits.slice(0, -1);
  const last = state.splits[state.splits.length - 1];

  let somaOutras = 0;
  const payments = outras.map((split, idx) => {
    if (!split.method) throw new Error(`Selecione a forma de pagamento na linha ${idx + 1}.`);
    const valorCentavos = valorDaLinha(split.amount);
    if (valorCentavos <= 0) throw new Error(`Informe um valor maior que zero na linha ${idx + 1}.`);
    somaOutras += valorCentavos;
    return { formaCode: split.method, valorCentavos };
  });

  if (!last.method) throw new Error('Selecione a forma de pagamento na última linha.');
  const restanteCentavos = totalCentavos - somaOutras;
  if (restanteCentavos <= 0) throw new Error('A soma das formas de pagamento já cobre o total. Ajuste os valores.');
  payments.push({ formaCode: last.method, valorCentavos: restanteCentavos });

  return payments;
}

const MAX_ITENS = 50;
const fechamentos = criarRegistroDeFechamentos();
let fechamentoEmCurso = false;
let pendenciaExibida = null;
let reparoDaAgenda = null;
let rascunhoDaPendencia = null;
let resumoExibido = null;
let totalConfirmado = null;
let revisaoRascunho = 0;
let pedidoDeSimulacao = 0;
let clienteDoRascunho = null;
let agendamentoDoRascunho = null;
let rascunhoInicial = null;
state.comandaItens = state.comandaItens || [];

function selecaoDeItem() {
  return [
    state.fuzzyServico?.getValue(), state.fuzzyProduto?.getValue(),
    state.fuzzyProfissional?.getValue(), document.getElementById('coProdutoQtd')?.value || '1'
  ];
}

function chaveDoTotal() {
  return JSON.stringify([
    state.agendamentoIdParaCheckout || null, state.fuzzyCliente?.getValue(),
    state.comandaItens.map(i => [i.tipo, i.servicoId, i.produtoId, i.quantidade, i.profissionalId, i.semPlano, i.assinaturaId]),
    selecaoDeItem(), state.tip || 0
  ]);
}

function chaveDoRascunho() {
  return JSON.stringify([
    chaveDoTotal(), state.fuzzyForma?.getValue(), Boolean(state.splitEnabled),
    (state.splits || []).map(({ method, amount }) => [method, amount])
  ]);
}

function versaoDoRascunho() {
  return revisaoRascunho + ':' + chaveDoRascunho();
}

function temDadosDoRascunho() {
  return Boolean(clienteDoRascunho || state.agendamentoIdParaCheckout ||
    state.fuzzyCliente?.getValue() || state.comandaItens?.length || state.tip ||
    state.fuzzyForma?.getValue() || state.splitEnabled || selecaoDeItem().slice(0, 3).some(Boolean));
}

export function temRascunhoCheckout() {
  return Boolean(pendenciaExibida || temDadosDoRascunho());
}

function precoDoItem(item) {
  // Plano de assinatura: valor estimado pela consulta de cobertura; o servidor confirma no resumo.
  if (item.assinaturaId && Number.isFinite(item.precoPlanoCentavos)) return item.precoPlanoCentavos;
  if (item.tipo === 'servico') {
    const servico = state.catalog.servicos.find(s => s.id === item.servicoId);
    const profissional = state.catalog.profissionais.find(p => p.id === item.profissionalId);
    let overrides = profissional?.overrides;
    if (typeof overrides === 'string') {
      try { overrides = JSON.parse(overrides); } catch (_) { overrides = null; }
    }
    const override = overrides?.[item.servicoId];
    return Math.round(Number(override?.valor_centavos ?? override?.valorCentavos ?? servico?.valor_centavos ?? servico?.valorCentavos ?? 0)) || 0;
  }
  return ((state.catalog.produtos || []).find(p => p.id === item.produtoId) || {}).preco_venda_centavos * item.quantidade || 0;
}
function rotuloDoItem(item) {
  // Texto puro: quem monta o HTML passa por escapeHtml (renderComandaItens).
  const nomeDe = (lista, id) => ((lista || []).find(x => x.id === id) || {}).nome;
  const prof = nomeDe(state.catalog.profissionais, item.profissionalId);
  if (item.tipo === 'servico') return [nomeDe(state.catalog.servicos, item.servicoId) || 'Serviço', prof || 'sem profissional'].concat(item.planoTexto ? [item.planoTexto] : []).join(' · ');
  return [String(item.quantidade) + '× ' + (nomeDe(state.catalog.produtos, item.produtoId) || 'Produto'), prof || 'sem vendedor'].join(' · ');
}

function validarSelecoesDigitadas() {
  const campos = [
    ['coCliente', state.fuzzyCliente, 'o cliente'],
    ['coServico', state.fuzzyServico, 'o serviço'],
    ['coProduto', state.fuzzyProduto, 'o produto'],
    ['coProfissional', state.fuzzyProfissional, 'o profissional']
  ];
  for (const [id, campo, rotulo] of campos) {
    if (document.getElementById(id).value?.trim() && !campo.getValue()) {
      throw new Error('Selecione ' + rotulo + ' da lista ou limpe o campo.');
    }
  }
}

// Lê os campos de escolha. exigir=true: reclama se não houver nada escolhido.
function itensDosCampos(exigir) {
  const servicoId = state.fuzzyServico.getValue();
  const produtoId = state.fuzzyProduto.getValue();
  const profissionalId = state.fuzzyProfissional.getValue();
  const itens = [];
  if (servicoId) {
    if (!profissionalId) throw new Error('Selecione o profissional do serviço.');
    itens.push({ tipo: 'servico', servicoId, profissionalId });
  }
  if (produtoId) {
    const quantidade = Number(document.getElementById('coProdutoQtd').value || 1);
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 99) throw new Error('Quantidade do produto deve ser um número inteiro de 1 a 99.');
    itens.push({ tipo: 'produto', produtoId, quantidade, profissionalId: profissionalId || undefined });
  }
  if (exigir && !itens.length) throw new Error('Escolha um serviço ou um produto.');
  return itens;
}

function limparCamposDeItem() {
  state.fuzzyServico?.setValue(null);
  state.fuzzyProduto?.setValue(null);
  state.fuzzyProfissional?.setValue(null);
  document.getElementById('coProdutoQtd').value = '1';
}

export function renderComandaItens() {
  const bloco = document.getElementById('coItens');
  if (!bloco) return;
  const itens = state.comandaItens;
  bloco.classList.toggle('hidden', !itens.length);
  document.getElementById('coItensLista').innerHTML = itens.map((item, i) => `
    <div class="row" data-item="${i}" data-tipo="${item.tipo}">
      <span>${escapeHtml(rotuloDoItem(item))}${item.assinaturaId ? ' <button type="button" class="btn" data-sem-plano="' + i + '">Não usar o plano</button>' : ''}</span>
      <b>${centsToBRL(precoDoItem(item))}<button type="button" class="co-item-remover" data-remover-item="${i}" aria-label="Remover ${escapeHtml(rotuloDoItem(item))}">×</button></b>
    </div>`).join('');
  const subtotal = itens.reduce((t, item) => t + precoDoItem(item), 0);
  const el = document.getElementById('coItensSubtotal');
  el.textContent = centsToBRL(subtotal);
  el.dataset.subtotal = String(subtotal);
}

function adicionarItem() {
  clearBanner();
  try {
    validarSelecoesDigitadas();
    const novos = itensDosCampos(true);
    if (state.comandaItens.length + novos.length > MAX_ITENS) throw new Error(`Uma comanda aceita até ${MAX_ITENS} itens.`);
    state.comandaItens.push(...novos);
    limparCamposDeItem();
    renderComandaItens();
    invalidatePreview();
  } catch (err) {
    showBanner(err.message, 'error');
  }
}

// ---- Atalhos "Mais vendidos": um toque põe o item na comanda ----
let maisVendidos = { servicos: [], produtos: [] };
let versaoDosAtalhos = 0;
let atalhosProntos = false;
let consultaDosAtalhos = null;

function renderAtalhos() {
  const bloco = document.getElementById('coAtalhos');
  if (!bloco) return;
  const doCatalogo = (lista, ids) => ids.map(id => (lista || []).find(x => x.id === id && x.ativo !== false)).filter(Boolean);
  const servicos = doCatalogo(state.catalog.servicos, maisVendidos.servicos);
  const produtos = doCatalogo(state.catalog.produtos, maisVendidos.produtos);
  const botao = (tipo, x, preco) => [
    `<button type="button" class="co-atalho" data-atalho="${tipo}" data-id="${escapeHtml(x.id)}">`,
    `<span>${escapeHtml(x.nome)}</span><small>${centsToBRL(preco || 0)}</small></button>`
  ].join('');
  document.getElementById('coAtalhosLista').innerHTML = servicos.map(x => botao('servico', x, x.valor_centavos)).concat(produtos.map(x => botao('produto', x, x.preco_venda_centavos))).join('');
  bloco.classList.toggle('hidden', !(servicos.length + produtos.length));
}

function carregarAtalhos() {
  if (atalhosProntos || consultaDosAtalhos || !sessionPode('comanda:fechar')) return;
  const versao = versaoDosAtalhos;
  const sessao = state.session;
  const identidade = sessionIdentity(getSession());
  consultaDosAtalhos = api('/checkout/mais-vendidos').then(resultado => {
    if (versao !== versaoDosAtalhos || !mesmoContexto(sessao, identidade)) return;
    maisVendidos = resultado;
    atalhosProntos = true;
    renderAtalhos();
  }).catch(() => {
    // A comanda segue disponível. A próxima abertura pode tentar de novo.
  }).finally(() => {
    if (versao === versaoDosAtalhos) consultaDosAtalhos = null;
  });
}

// Serviço precisa de profissional: com um já escolhido no campo, entra direto; sem, o
// serviço fica escolhido e o foco vai para o campo do profissional. Produto entra direto
// (1 unidade), com o profissional do campo como vendedor, se houver.
function usarAtalho(tipo, id) {
  clearBanner();
  const msg = document.getElementById('coAtalhosMsg');
  msg.textContent = '';
  const profissionalId = state.fuzzyProfissional.getValue();
  if (tipo === 'servico' && !profissionalId) {
    state.fuzzyServico.setValue(id);
    invalidatePreview();
    msg.textContent = 'Escolha o profissional e toque em "Adicionar à comanda".';
    document.getElementById('coProfissional').focus();
    return;
  }
  if (state.comandaItens.length + 1 > MAX_ITENS) { showBanner(`Uma comanda aceita até ${MAX_ITENS} itens.`, 'error'); return; }
  state.comandaItens.push(tipo === 'servico' ? { tipo, servicoId: id, profissionalId } : { tipo, produtoId: id, quantidade: 1, profissionalId: profissionalId || undefined });
  renderComandaItens();
  invalidatePreview();
  msg.textContent = 'Adicionado. O profissional continua escolhido para o próximo item.';
}

function removerItem(indice) {
  state.comandaItens.splice(indice, 1);
  renderComandaItens();
  invalidatePreview();
}

// Cobertura do plano de assinatura (D-043): para cada serviço da comanda com cliente escolhido,
// consulta o servidor e marca o plano quando ele cobre (ou cobra só uma parte). Conta os usos da
// própria comanda para o limite do ciclo. É só estimativa para a tela: o servidor recalcula tudo
// no resumo e no fechamento.
function limparCobertura(item) {
  delete item.assinaturaId;
  delete item.precoPlanoCentavos;
  item.planoTexto = item.semPlano ? 'sem o plano' : undefined;
}

const COBERTURA_INDISPONIVEL = 'Não foi possível consultar a cobertura do plano. Tente simular novamente.';

async function atualizarCobertura(itens, clienteId, agendamentoId, continua) {
  const usadosNaComanda = new Map();
  const ag = agendamentoId ? findAgendaItemById(agendamentoId) || agendamentoDoRascunho : null;
  const agora = new Date();
  for (const item of itens) {
    if (item.tipo !== 'servico') continue;
    limparCobertura(item);
    if (!clienteId || item.semPlano || !sessionPode('assinatura:ver')) continue;
    // Comanda vinda de um agendamento: estima pelo dia e hora dele (o servidor faz o mesmo).
    const q = new URLSearchParams({ clienteId, servicoId: item.servicoId, profissionalId: item.profissionalId,
      data: ag && ag.data ? String(ag.data).slice(0, 10) : agora.toLocaleDateString('en-CA'),
      horario: ag && ag.horario ? String(ag.horario).slice(0, 5) : agora.toTimeString().slice(0, 5) });
    let cob;
    try { cob = await api('/assinaturas/cobertura?' + q.toString()); }
    catch (err) { throw new Error(COBERTURA_INDISPONIVEL, { cause: err }); }
    if (!continua()) return;
    if (!cob || !Object.hasOwn(cob, 'melhor')) throw new Error(COBERTURA_INDISPONIVEL);
    const m = cob.melhor;
    if (!m) continue;
    const chave = m.assinaturaId + ':' + item.servicoId;
    const ja = usadosNaComanda.get(chave) || 0;
    const limite = m.usoDoCiclo && m.usoDoCiclo.limite;
    const esgotou = limite !== null && limite !== undefined && m.consomeUso && (m.usoDoCiclo.usados + ja) >= limite;
    const aplica = !esgotou && (m.situacaoUso === 'coberto' || (m.situacaoUso === 'fora_da_regra' && m.cobrarCentavos < m.precoTabelaCentavos) || (m.situacaoUso === 'fora_da_regra' && m.coberto));
    if (aplica) {
      item.assinaturaId = m.assinaturaId;
      item.precoPlanoCentavos = m.cobrarCentavos;
      if (m.consomeUso) usadosNaComanda.set(chave, ja + 1);
      item.planoTexto = 'Plano ' + m.planoNome + ': ' + (m.situacaoUso === 'coberto'
        ? 'coberto' + (limite ? ' (' + (m.usoDoCiclo.usados + ja + 1) + ' de ' + limite + ')' : '')
        : 'fora da regra, ' + centsToBRL(m.cobrarCentavos) + (m.consomeUso ? ', gasta 1 uso' : '') +
          // O porquê (dia, horário, profissional ou intervalo) vem do servidor; sem ele a tela parecia erro.
          (m.motivos && m.motivos[0] ? ' — ' + m.motivos[0].texto : ''));
    } else {
      const motivo = esgotou ? 'limite do ciclo atingido' : ((m.motivos && m.motivos[0] && m.motivos[0].texto) || 'não cobre');
      item.planoTexto = 'Plano ' + m.planoNome + ': ' + motivo;
    }
  }
}

function pagamentosDoRascunho(totalCentavos, itens) {
  // Tudo coberto pelo plano (total R$ 0): fecha sem forma de pagamento.
  if (semCobranca(totalCentavos, itens)) return [];
  if (state.splitEnabled) return buildSplitPayments(totalCentavos);
  const formaCode = state.fuzzyForma.getValue();
  if (!formaCode) throw new Error('Selecione uma forma de pagamento.');
  return [{ formaCode, valorCentavos: totalCentavos }];
}

function semCobranca(totalCentavos, itens) {
  return totalCentavos === 0 && itens.some(i => i.assinaturaId);
}

function buildPayload() {
  const itens = state.comandaItens;
  return dadosDoFechamento({
    clienteId: state.fuzzyCliente.getValue() || null,
    idempotencyKey: genIdempotencyKey(),
    itens,
    payments: pagamentosDoRascunho(totalParaDividir(), itens),
    gorjetaCentavos: state.tip || 0,
    agendamentoId: state.agendamentoIdParaCheckout || undefined
  });
}

// Aviso no balcão: quanto a forma escolhida custa ao salão nesta comanda e qual seria a
// mais barata. Os valores vêm do preview do servidor (mesma conta do fechamento).
function renderTaxaAviso(preview, payload) {
  const aviso = document.getElementById('coTaxaAviso');
  if (!aviso) return;
  const lista = Array.isArray(preview.comparativoFormas) ? preview.comparativoFormas : [];
  const pagamentos = payload.payments || [];
  aviso.classList.add('hidden');
  aviso.innerHTML = '';
  // Pagamento dividido: a taxa total já aparece no resumo; não há uma forma única para comparar.
  if (pagamentos.length !== 1 || !lista.length) return;
  const escolhida = lista.find(f => f.formaCode === pagamentos[0].formaCode);
  if (!escolhida) return;
  const barata = lista[0];
  aviso.dataset.taxa = String(escolhida.taxaCentavos);
  if (escolhida.taxaCentavos <= 0) {
    aviso.innerHTML = '<span>Esta forma não tem taxa para o salão.</span>';
  } else {
    const economia = escolhida.taxaCentavos - barata.taxaCentavos;
    const texto = [`<span>Esta forma custa <b>${centsToBRL(escolhida.taxaCentavos)}</b> de taxa ao salão (ficam ${centsToBRL(escolhida.liquidoCentavos)}).`];
    if (economia > 0) texto.push(` Com ${escapeHtml(barata.label)} a taxa seria ${centsToBRL(barata.taxaCentavos)}: <b>${centsToBRL(economia)} a menos</b>.`);
    texto.push('</span>');
    if (economia > 0) texto.push(`<button type="button" id="btnTrocarForma" data-forma="${escapeHtml(barata.formaCode)}">Trocar para ${escapeHtml(barata.label)}</button>`);
    aviso.innerHTML = texto.join('');
  }
  aviso.classList.remove('hidden');
  // Com taxa a pagar, garante que o aviso esteja na tela antes do toque em "Fechar".
  if (escolhida.taxaCentavos > 0) aviso.scrollIntoView({ block: 'nearest' });
}

function renderPlanoAviso(preview) {
  const aviso = document.getElementById('coPlanoAviso');
  if (!aviso) return;
  const lista = Array.isArray(preview.assinaturas) ? preview.assinaturas : [];
  aviso.classList.toggle('hidden', !lista.length);
  aviso.textContent = lista.map(a => 'Plano ' + a.planoNome + ': ' + (a.aplicada
    ? (a.situacao === 'coberto' ? 'coberto' : 'fora da regra') + ', cobra ' + centsToBRL(a.cobrarCentavos) + ' de ' + centsToBRL(a.precoTabelaCentavos) + (a.consomeUso ? ', gasta 1 uso' : '') +
      (a.situacao !== 'coberto' && a.motivos && a.motivos[0] ? ' (' + a.motivos[0].texto + ')' : '')
    : 'não aplicado (' + (a.motivos?.[0]?.texto || a.situacao) + '), cobra o valor cheio') + (a.aviso ? ' — ' + a.aviso : '')).join(' · ');
}

function renderIntencao(preview, payload) {
  const cliente = state.catalog.clientes?.find(c => c.id === payload.clienteId);
  document.getElementById('pvCliente').textContent = cliente?.nome || (payload.clienteId ? 'Cliente selecionado' : 'Sem cliente');
  document.getElementById('pvItens').textContent = payload.itens.map((item, i) => {
    const valor = preview.itens?.[i]?.valorLiquidoCentavos;
    return Number.isFinite(valor) ? rotuloDoItem(item) + ' · ' + centsToBRL(valor) : rotuloDoItem(item);
  }).join(' | ');
  document.getElementById('pvFormas').textContent = payload.payments.length
    ? payload.payments.map((p, i) => {
      const label = preview.payments?.[i]?.label || state.catalog.formas_pagamento?.find(f => f.code === p.formaCode)?.label;
      return (label || p.formaCode) + ' · ' + centsToBRL(p.valorCentavos);
    }).join(' | ')
    : 'Sem valor a pagar';
}

function mesmoContexto(sessao, identidade) {
  const atual = getSession();
  return Boolean(identidade && sessao?.principal === 'user' && state.session === sessao &&
    atual?.empresa_id === sessao.empresa_id && sessionIdentity(atual) === identidade);
}

function esconderPendencia() {
  pendenciaExibida = null;
  const card = document.getElementById('checkoutPendente');
  if (!card) return;
  card.classList.add('hidden');
  document.getElementById('checkoutPendenteItens').textContent = '';
  document.getElementById('checkoutPendenteCliente').textContent = '';
  document.getElementById('checkoutPendenteTotal').textContent = '';
}

function mostrarPendencia(payload) {
  pendenciaExibida = payload;
  limparResumo();
  const cliente = state.catalog.clientes?.find(c => c.id === payload.clienteId);
  document.getElementById('checkoutPendenteCliente').textContent = cliente?.nome || (payload.clienteId ? 'Cliente selecionado' : 'Sem cliente');
  document.getElementById('checkoutPendenteItens').textContent = payload.itens.map(rotuloDoItem).join(' | ');
  const total = payload.payments.reduce((soma, pagamento) => soma + pagamento.valorCentavos, 0);
  document.getElementById('checkoutPendenteTotal').textContent = 'Total informado no fechamento: ' + centsToBRL(total);
  document.getElementById('checkoutPendente').classList.remove('hidden');
}

export async function simular() {
  if (fechamentoEmCurso) return;
  const sessao = state.session;
  const identidade = sessionIdentity(getSession());
  if (!mesmoContexto(sessao, identidade)) return;
  const pedido = ++pedidoDeSimulacao;
  let versao = versaoDoRascunho();
  const continua = () => pedido === pedidoDeSimulacao && mesmoContexto(sessao, identidade) && versao === versaoDoRascunho();
  clearBanner();
  limparResumo();
  ocultarResultado();
  document.getElementById('rebookingCard').classList.add('hidden');
  hideAttachSuggestion();
  try {
    const pendente = await fechamentos.ler(sessao);
    if (!continua()) return;
    if (pendente) {
      mostrarPendencia(pendente);
      return;
    }
    esconderPendencia();
    validarSelecoesDigitadas();
    const clienteId = state.fuzzyCliente.getValue();
    // O que ficou nos campos (sem tocar em "Adicionar à comanda") entra na lista antes da conta:
    // assim passa pela checagem do plano de assinatura como qualquer item. Antes, ia para o
    // fechamento sem a checagem e cobrava o valor cheio sem aviso (achado do dono, 2026-11-16).
    const pendentes = itensDosCampos(false);
    const quantidade = state.comandaItens.length + pendentes.length;
    if (!quantidade) throw new Error('Adicione ao menos um serviço ou produto à comanda.');
    if (quantidade > MAX_ITENS) throw new Error(`Uma comanda aceita até ${MAX_ITENS} itens.`);
    if (pendentes.length) {
      state.comandaItens.push(...pendentes);
      limparCamposDeItem();
      renderComandaItens();
    }
    versao = versaoDoRascunho();
    // Uma consulta que começou para outro cliente nunca altera os itens da tela.
    const itens = state.comandaItens.map(item => ({ ...item }));
    await atualizarCobertura(itens, clienteId, state.agendamentoIdParaCheckout, continua);
    if (!continua()) return;
    state.comandaItens = itens;
    versao = versaoDoRascunho();
    renderComandaItens();
    const payload = buildPayload();
    let preview;
    try {
      preview = await api('/checkout/preview', { method: 'POST', body: payload });
    } catch (err) {
      if (!continua()) return;
      const esperado = err.details?.expectedTotal;
      if (err.code !== 'PAYMENT_TOTAL_MISMATCH' || !Number.isSafeInteger(esperado) || esperado < 0) throw err;
      // Só ajusta a parcela calculada. Preserva valores que o operador digitou.
      totalConfirmado = { base: chaveDoTotal(), centavos: esperado };
      if (state.splitEnabled) updateLastSplitRowDisplay();
      payload.payments = pagamentosDoRascunho(esperado, itens);
      preview = await api('/checkout/preview', { method: 'POST', body: payload });
    }
    if (!continua()) return;
    if (typeof preview?.revisaoFinanceira !== 'string' || !preview.revisaoFinanceira.trim()) {
      throw new Error('O servidor não confirmou a revisão financeira. Simule novamente antes de fechar.');
    }
    payload.revisaoFinanceira = preview.revisaoFinanceira;
    renderPlanoAviso(preview);
    renderIntencao(preview, payload);
    const t = preview.totals;
    document.getElementById('pvServicos').textContent = centsToBRL(t.servicosLiquidosCentavos);
    document.getElementById('pvProdutos').textContent = centsToBRL(t.produtosLiquidosCentavos);
    document.getElementById('pvGorjetaBruta').textContent = centsToBRL(t.gorjetaBrutaCentavos);
    document.getElementById('pvRecebido').textContent = centsToBRL(t.totalRecebidoCentavos);
    document.getElementById('pvCustoProdutos').textContent = centsToBRL(t.totalCustoProdutosCentavos);
    document.getElementById('pvComissao').textContent = centsToBRL(t.totalComissaoCentavos);
    document.getElementById('pvTaxa').textContent = centsToBRL(t.taxaTotalCentavos);
    document.getElementById('pvGorjetaLiquida').textContent = centsToBRL(t.totalGorjetaLiquidaCentavos);
    document.getElementById('pvReceita').textContent = centsToBRL(t.receitaEmpresaCentavos);
    totalConfirmado = Number.isSafeInteger(t.totalRecebidoCentavos)
      ? { base: chaveDoTotal(), centavos: t.totalRecebidoCentavos }
      : null;
    payload.itens.forEach(Object.freeze);
    payload.payments.forEach(Object.freeze);
    Object.freeze(payload.itens);
    Object.freeze(payload.payments);
    state.currentPayload = Object.freeze(payload);
    state.currentPreview = preview;
    resumoExibido = { payload, versao, sessao, identidade };
    document.getElementById('cardPreview').classList.remove('hidden');
    renderTaxaAviso(preview, payload);
    renderSplitRows();
    updateSubmitButtonState();
  } catch (err) {
    if (continua()) {
      limparResumo();
      if (err.message === COBERTURA_INDISPONIVEL) {
        const aviso = document.getElementById('coPlanoAviso');
        aviso.textContent = err.message;
        aviso.classList.remove('hidden');
      } else {
        showBanner(desvincularSeAgendaInvalida(err), 'error');
      }
    }
  }
}

// O backend recusa (antes de gravar) checkout vinculado a agendamento que não
// pode ser concluído (cancelado, falta, reagendado) ou que não existe mais. A
// tela tira o vínculo para a recepção poder fechar a comanda avulsa.
const VINCULO_INVALIDO = ['INVALID_STATUS_TRANSITION', 'AGENDAMENTO_NOT_FOUND'];
function desvincularSeAgendaInvalida(err) {
  if (!state.agendamentoIdParaCheckout || !VINCULO_INVALIDO.includes(err && err.code)) return err.message;
  state.agendamentoIdParaCheckout = null;
  agendamentoDoRascunho = null;
  state.comandaItens.forEach(limparCobertura);
  renderVinculo();
  renderComandaItens();
  invalidatePreview();
  return `${err.message} O vínculo com a agenda foi removido: clique em "Simular comanda" para fechar sem ele.`;
}

export async function fechar() {
  return enviarFechamento(false);
}

function resumoAtual() {
  return resumoExibido && resumoExibido.payload === state.currentPayload &&
    !pendenciaExibida && !document.getElementById('cardPreview').classList.contains('hidden') &&
    mesmoContexto(resumoExibido.sessao, resumoExibido.identidade) &&
    resumoExibido.versao === versaoDoRascunho() ? resumoExibido : null;
}

async function enviarFechamento(retomando) {
  const sessao = state.session;
  const identidade = sessionIdentity(getSession());
  if (fechamentoEmCurso || !mesmoContexto(sessao, identidade)) return;
  const resumo = retomando ? null : resumoAtual();
  const candidato = retomando ? pendenciaExibida : resumo?.payload;
  if (!candidato) {
    if (!retomando) limparResumo();
    return;
  }
  const versaoAoEnviar = versaoDoRascunho();
  const pertenceAoRascunho = () => versaoAoEnviar === versaoDoRascunho() &&
    (!retomando || (rascunhoDaPendencia?.chave === candidato.idempotencyKey && rascunhoDaPendencia.versao === versaoAoEnviar));
  fechamentoEmCurso = true;
  clearBanner();
  const btn = document.getElementById(retomando ? 'btnRetomarFechamento' : 'btnFechar');
  const simularBtn = document.getElementById('btnSimular');
  simularBtn.disabled = true;
  btn.disabled = true;
  btn.textContent = 'Fechando…';
  let tentativa;
  let payload;
  try {
    tentativa = await fechamentos.iniciar(sessao, candidato, retomando);
    if (!mesmoContexto(sessao, identidade)) return;
    if (!tentativa.iniciou) {
      if (tentativa.payload) mostrarPendencia(tentativa.payload);
      else esconderPendencia();
      if (retomando) showBanner('A pendência mudou neste aparelho. Confira o caixa antes de seguir.', 'error');
      return;
    }
    payload = tentativa.payload;
    if (!retomando) rascunhoDaPendencia = { chave: payload.idempotencyKey, versao: versaoAoEnviar };

    const resultado = await api('/checkout/close', { method: 'POST', body: payload, retryOnAuth: false });
    const s = resultado?.saved;
    if (!s?.comandoId) throw new Error('O servidor não confirmou qual comanda foi fechada.');
    let limpo = true;
    try { await fechamentos.confirmar(sessao, payload); }
    catch (_) { limpo = false; }
    if (!mesmoContexto(sessao, identidade)) return;
    const { clienteId } = payload;
    const servicoItem = payload.itens.find(i => i.tipo === 'servico');

    esconderPendencia();
    const podeLimpar = pertenceAoRascunho();
    rascunhoDaPendencia = null;
    const trocouRascunho = !podeLimpar && temDadosDoRascunho();
    if (podeLimpar) limparRascunho();
    if (!trocouRascunho) {
      const pendente = resultado.vinculoAgenda?.aplicado === false && payload.agendamentoId;
      mostrarResultado(s, pendente ? { comandoId: s.comandoId, payload, sessao, identidade } : null);
    }
    if (resultado.vinculoAgenda?.aplicado === false) {
      showBanner('Comanda salva. A conclusão do agendamento ficou pendente. Confira na Agenda.' + (limpo ? '' : ' Confira também a pendência no caixa.'), 'error');
    } else if (!limpo) {
      showBanner('Comanda fechada. O navegador não removeu a pendência. Confira o caixa antes de seguir.', 'error');
    } else {
      showBanner(trocouRascunho ? 'Comanda anterior fechada com sucesso.' : 'Comanda fechada com sucesso.', 'ok');
    }

    stateBus.dispatchEvent(new CustomEvent('checkout:closed', { detail: { comandoId: s.comandoId } }));

    // A sugestão pertence ao fechamento exibido e perde validade com a próxima edição.
    if (!trocouRascunho && clienteId && servicoItem) {
      showRebookingSuggestion(clienteId, servicoItem.servicoId, servicoItem.profissionalId);
    }
  } catch (err) {
    let recusada = false;
    if (payload && err.status >= 400 && err.status < 500 && err.status !== 401 && err.details?.checkoutNotCommitted === true) {
      try { recusada = await tentativa.recusar(); }
      catch (_) { /* a falha de armazenamento preserva a pendência */ }
    }
    if (!mesmoContexto(sessao, identidade)) return;
    if (recusada) {
      esconderPendencia();
      if (pertenceAoRascunho()) {
        invalidatePreview();
        const msg = desvincularSeAgendaInvalida(err);
        showBanner(msg === err.message ? msg + ' Corrija a comanda e simule novamente.' : msg, 'error');
      } else {
        showBanner('A comanda anterior foi recusada. ' + err.message, 'error');
      }
      rascunhoDaPendencia = null;
      return;
    }
    if (payload) mostrarPendencia(payload);
    showBanner(payload ? err.message + ' Confira o caixa ou retome o mesmo fechamento.' : err.message, 'error');
  } finally {
    fechamentoEmCurso = false;
    if (mesmoContexto(sessao, identidade)) {
      simularBtn.disabled = false;
      btn.textContent = retomando ? 'Retomar fechamento pendente' : 'Fechar comanda';
      if (retomando) btn.disabled = false;
      updateSubmitButtonState();
    }
  }
}

function ocultarResultado() {
  reparoDaAgenda = null;
  document.getElementById('cardResultado').classList.add('hidden');
}

async function repararVinculo() {
  const reparo = reparoDaAgenda;
  const btn = document.getElementById('btnRepararVinculo');
  const aviso = document.getElementById('resVinculoAgenda');
  if (!reparo || btn.disabled || !mesmoContexto(reparo.sessao, reparo.identidade)) return;
  btn.disabled = true;
  aviso.textContent = 'Consultando a comanda salva e tentando concluir o agendamento…';
  try {
    const resultado = await api('/checkout/comandas/' + encodeURIComponent(reparo.comandoId) + '/reconciliar-agenda', {
      method: 'POST', body: reparo.payload, retryOnAuth: false
    });
    if (reparoDaAgenda !== reparo || !mesmoContexto(reparo.sessao, reparo.identidade)) return;
    if (resultado?.saved?.comandoId !== reparo.comandoId || resultado.vinculoAgenda?.aplicado !== true) {
      aviso.textContent = 'Comanda salva. A conclusão continua pendente. Confira a situação do agendamento na Agenda.';
      return;
    }
    aviso.textContent = 'Agendamento concluído para esta comanda.';
    reparoDaAgenda = null;
    btn.classList.add('hidden');
    stateBus.dispatchEvent(new Event('agenda:recarregar'));
  } catch (_) {
    if (reparoDaAgenda === reparo && mesmoContexto(reparo.sessao, reparo.identidade)) {
      aviso.textContent = 'Comanda salva. Não foi possível confirmar a conclusão do agendamento. Tente novamente ou confira na Agenda.';
    }
  } finally {
    if (reparoDaAgenda === reparo && mesmoContexto(reparo.sessao, reparo.identidade)) btn.disabled = false;
  }
}

function mostrarResultado(s, reparo) {
  reparoDaAgenda = reparo;
  const btn = document.getElementById('btnRepararVinculo');
  btn.disabled = false;
  btn.classList.toggle('hidden', !reparo);
  document.getElementById('resVinculoAgenda').textContent = reparo
    ? 'Comanda salva. A conclusão do agendamento está pendente.' : '';
  limparResumo();
  document.getElementById('resComandaId').textContent = s.comandoId;
  document.getElementById('resStatus').textContent = s.status || (s.idempotent ? 'já fechada (idempotente)' : '—');
  document.getElementById('resCounts').textContent = `${s.itens ?? '—'} / ${s.pagamentos ?? '—'} / ${s.gorjetas ?? '—'}`;
  document.getElementById('resCaixa').textContent = s.caixaMovimentos ?? '—';
  document.getElementById('cardResultado').classList.remove('hidden');
}

async function showRebookingSuggestion(clienteId, servicoId, profissionalId) {
  const card = document.getElementById('rebookingCard');
  if (!card) return;
  card.classList.add('hidden');
  // Sugestões vêm do painel da operação; quem não tem (profissional) não chama a rota.
  if (!sessionPode('painel:operacional')) return;
  const sessao = state.session;
  const identidade = sessionIdentity(getSession());
  const versao = versaoDoRascunho();
  try {
    const suggestion = await getInsightsRebooking(clienteId, servicoId);
    if (!mesmoContexto(sessao, identidade) || versao !== versaoDoRascunho() || !suggestion?.dataSugerida) return;
    document.getElementById('rebookingText').textContent =
      `Sugerir retorno em ${formatDDMM(suggestion.dataSugerida)} às ${suggestion.horaSugerida}?`;
    card.dataset.clienteId = clienteId;
    card.dataset.servicoId = servicoId || '';
    card.dataset.profissionalId = profissionalId || '';
    card.dataset.data = suggestion.dataSugerida;
    card.dataset.horario = suggestion.horaSugerida;
    card.classList.remove('hidden');
  } catch (err) {
    // Sugestão de reagendamento é um extra — falha silenciosa não deve confundir o usuário
    // logo após o fechamento real da comanda já ter dado certo.
  }
}

async function confirmRebooking() {
  const card = document.getElementById('rebookingCard');
  const { clienteId, servicoId, profissionalId, data, horario } = card.dataset;
  if (!servicoId || !profissionalId || !data || !horario) {
    card.classList.add('hidden');
    return;
  }
  const btn = document.getElementById('btnRebookingConfirm');
  btn.disabled = true;
  try {
    await api('/agenda', { method: 'POST', body: { clienteId, servicoId, profissionalId, data, horario, permitirConflito: false } });
    showBanner('Reagendamento criado na agenda.', 'ok');
    card.classList.add('hidden');
    stateBus.dispatchEvent(new Event('agenda:recarregar'));
  } catch (err) {
    showBanner('Não foi possível criar o reagendamento: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function limparRascunho() {
  clienteDoRascunho = null;
  agendamentoDoRascunho = null;
  rascunhoInicial = null;
  state.agendamentoIdParaCheckout = null;
  state.fuzzyCliente?.setValue(null);
  state.fuzzyForma?.setValue(null);
  state.comandaItens = [];
  state.tip = 0;
  state.splitEnabled = false;
  state.splits = [{ id: 's1', method: '', amount: '' }];
  limparCamposDeItem();
  invalidatePreview();
  renderVinculo();
  renderComandaItens();
  hideAttachSuggestion();
  document.getElementById('coAtalhosMsg').textContent = '';
  document.getElementById('coFormaField')?.classList.remove('hidden');
  renderTipStepper();
  renderSplitToggle();
  renderSplitRows();
}

function renderVinculo() {
  const el = document.getElementById('coVinculo');
  const id = state.agendamentoIdParaCheckout;
  const ag = id ? findAgendaItemById(id) || agendamentoDoRascunho : null;
  el.classList.toggle('hidden', !id);
  el.textContent = !id ? '' : ag?.data && ag?.horario
    ? `Agendamento de ${formatDDMM(String(ag.data).slice(0, 10))} às ${String(ag.horario).slice(0, 5)}`
    : 'Vinculada ao agendamento';
}

async function atualizarPendenciaAoAbrir() {
  const sessao = state.session;
  const identidade = sessionIdentity(getSession());
  if (!mesmoContexto(sessao, identidade) || fechamentoEmCurso) return;
  const pedido = pedidoDeSimulacao;
  try {
    const pendente = await fechamentos.ler(sessao);
    if (!mesmoContexto(sessao, identidade) || fechamentoEmCurso || pedido !== pedidoDeSimulacao) return;
    if (pendente) mostrarPendencia(pendente);
    else esconderPendencia();
  } catch (_) { /* o armazenamento também será verificado antes de simular ou fechar */ }
}

function abrirRascunho(item) {
  stateBus.dispatchEvent(new CustomEvent('checkout:draft-open', { detail: item }));
  return atualizarPendenciaAoAbrir();
}

export function prefillCheckoutFromAgendamento(item) {
  if (!item?.id || !state.fuzzyCliente || !podeFecharAtendimento(state.session, item)) return;
  if (state.agendamentoIdParaCheckout === item.id) return abrirRascunho(item);
  if (temDadosDoRascunho() && chaveDoRascunho() !== rascunhoInicial &&
    !window.confirm('Trocar de atendimento e descartar os dados da comanda atual?')) return;
  limparRascunho();
  agendamentoDoRascunho = item;
  state.agendamentoIdParaCheckout = item.id;
  state.fuzzyCliente.setValue(item.cliente_id || null);
  clienteDoRascunho = state.fuzzyCliente.getValue();
  state.fuzzyServico.setValue(item.servico_id || null);
  state.fuzzyProfissional.setValue(item.profissional_id || null);
  rascunhoInicial = chaveDoRascunho();
  renderVinculo();
  return abrirRascunho(item);
}

export function onCheckoutFieldChanged(campo) {
  if (campo === 'forma') {
    invalidatePayload();
    return;
  }
  if (campo === 'cliente') {
    const cliente = state.fuzzyCliente.getValue();
    if (cliente !== clienteDoRascunho) {
      if (state.agendamentoIdParaCheckout || clienteDoRascunho) {
        if (!window.confirm('Trocar de cliente e descartar os dados da comanda atual?')) {
          state.fuzzyCliente.setValue(clienteDoRascunho);
          return;
        }
        limparRascunho();
        state.fuzzyCliente.setValue(cliente);
      }
      clienteDoRascunho = cliente;
      state.comandaItens.forEach(limparCobertura);
      renderComandaItens();
    }
  }
  invalidatePreview();
}

function renderCheckoutTabs() {
  const tabs = document.getElementById('checkoutTabs');
  if (!tabs) return;

  Array.from(tabs.querySelectorAll('.checkout-tab-btn')).forEach(btn => {
    const isActive = btn.dataset.tab === state.checkoutTab;
    btn.classList.toggle('active', isActive);
  });
}

function renderCheckoutItems() {
  const visibleItems = getVisibleCartItems();
  // Abas antigas (removidas da tela): a lista de itens real é renderComandaItens().
  return visibleItems;
}

export function renderTipStepper() {
  const tipValue = document.getElementById('tipValue');
  if (tipValue) {
    tipValue.textContent = centsToBRL(state.tip);
  }
}

function limparResumo() {
  resumoExibido = null;
  state.currentPayload = null;
  state.currentPreview = null;
  const card = document.getElementById('cardPreview');
  if (card) card.classList.add('hidden');
  document.getElementById('coTaxaAviso')?.classList.add('hidden');
  document.getElementById('coPlanoAviso')?.classList.add('hidden');
  updateSubmitButtonState();
}

function invalidatePreview() {
  totalConfirmado = null;
  invalidatePayload();
}

// Alterar somente a forma de pagar conserva o total confirmado para as parcelas.
function invalidatePayload() {
  revisaoRascunho++;
  limparResumo();
  ocultarResultado();
  document.getElementById('rebookingCard').classList.add('hidden');
  if (state.splitEnabled) updateLastSplitRowDisplay();
}

export function incrementTip() {
  state.tip = (state.tip || 0) + 100;
  renderTipStepper();
  invalidatePreview();
}

export function decrementTip() {
  if (state.tip > 0) {
    state.tip -= 100; // decrementa 1 real
    renderTipStepper();
    invalidatePreview();
  }
}

export function renderSplitToggle() {
  const toggle = document.getElementById('splitToggle');
  if (toggle) {
    toggle.classList.toggle('enabled', state.splitEnabled);
    toggle.setAttribute('aria-checked', state.splitEnabled ? 'true' : 'false');
  }
}

export function toggleSplitPayment() {
  state.splitEnabled = !state.splitEnabled;
  if (state.splitEnabled && state.splits.length < 2) {
    // Já abre com duas linhas; a primeira herda a forma escolhida no campo único, se houver.
    state.splits = [{ id: 's1', method: state.fuzzyForma.getValue() || '', amount: '' }, { id: 's2', method: '', amount: '' }];
  }
  // Dividido: o campo de forma única sai da tela para não haver duas respostas à mesma pergunta.
  document.getElementById('coFormaField')?.classList.toggle('hidden', state.splitEnabled);
  renderSplitToggle();
  renderSplitRows();
  invalidatePayload();
}

// Restante da última linha (não digitável) = total confirmado no preview - soma das outras linhas
function lastSplitRemainderCentavos(total = totalParaDividir()) {
  const outrasCentavos = state.splits.slice(0, -1).reduce((sum, s) => sum + valorDaLinha(s.amount), 0);
  return total - outrasCentavos;
}

function updateLastSplitRowDisplay() {
  const lastIdx = state.splits.length - 1;
  const el = document.querySelector(`.split-row-amount[data-split-idx="${lastIdx}"]`);
  const dica = document.getElementById('splitDica');
  const total = totalParaDividir();
  const semPagar = semCobranca(total, state.comandaItens);
  const restante = lastSplitRemainderCentavos(total);
  if (el) el.textContent = semPagar ? 'sem cobrança' : restante > 0 ? centsToBRL(restante) : 'sem restante';
  if (dica) dica.textContent = semPagar ? 'Esta comanda está coberta pelo plano.'
    : restante > 0 ? 'A última forma recebe o restante. Depois, toque em "Simular comanda".'
    : 'Os valores já cobrem o total. Diminua um valor ou remova uma forma.';
}

export function renderSplitRows() {
  const splitContainer = document.getElementById('splitRowsContainer');
  const splitList = document.getElementById('splitRowsList');
  if (!splitContainer || !splitList) return;

  if (!state.splitEnabled) {
    splitContainer.classList.add('hidden');
    return;
  }

  splitContainer.classList.remove('hidden');
  const formas = (state.catalog.formas_pagamento || []).filter(f => f.ativo !== false);
  const restanteCentavos = lastSplitRemainderCentavos();

  splitList.innerHTML = state.splits.map((split, idx) => {
    const isLast = idx === state.splits.length - 1;

    return `
      <div class="split-row">
        <select class="split-row-form input-light" data-split-idx="${idx}" aria-label="Forma de pagamento ${idx + 1}">
          <option value="">Selecione...</option>
          ${formas.map(f => `<option value="${escapeHtml(f.code)}" ${split.method === f.code ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}
        </select>
        ${isLast ? `
          <div class="split-row-amount display-only" data-split-idx="${idx}" aria-label="Restante">${centsToBRL(Math.max(0, restanteCentavos))}</div>
        ` : `
          <input type="text" inputmode="decimal" class="split-row-input input-light" data-split-idx="${idx}" placeholder="Valor (R$)" aria-label="Valor da forma ${idx + 1} em reais" value="${escapeHtml(split.amount || '')}" />
        `}
        ${state.splits.length > 2 ? `
          <button type="button" class="split-row-remove" data-split-idx="${idx}" aria-label="Remover forma ${idx + 1}">×</button>
        ` : ''}
      </div>
    `;
  }).join('');

  updateLastSplitRowDisplay();

  splitList.querySelectorAll('.split-row-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.splitIdx, 10);
      state.splits.splice(idx, 1);
      renderSplitRows();
      invalidatePayload();
    });
  });

  splitList.querySelectorAll('.split-row-form').forEach(select => {
    select.addEventListener('change', () => {
      const idx = parseInt(select.dataset.splitIdx, 10);
      state.splits[idx].method = select.value;
      invalidatePayload();
    });
  });

  splitList.querySelectorAll('.split-row-input').forEach(input => {
    input.addEventListener('input', () => {
      const idx = parseInt(input.dataset.splitIdx, 10);
      state.splits[idx].amount = input.value;
      invalidatePayload();
    });
  });
}

export function addSplitRow() {
  state.splits.push({ id: 's' + Date.now(), method: '', amount: '' });
  renderSplitRows();
  invalidatePayload();
}

export function validateSplitPayment() {
  if (!state.splitEnabled) return true; // Sem split, sempre válido
  const total = totalParaDividir();
  if (semCobranca(total, state.comandaItens)) return true;
  if (state.splits.length < 2 || state.splits.some(split => !split.method)) return false;

  const outras = state.splits.slice(0, -1);
  if (outras.some(split => valorDaLinha(split.amount) <= 0)) return false;

  return lastSplitRemainderCentavos(total) > 0;
}

export function updateSubmitButtonState() {
  const btnFechar = document.getElementById('btnFechar');
  if (btnFechar) {
    btnFechar.disabled = fechamentoEmCurso || !resumoAtual();
  }
}

// F4.6: attach é sempre sugestão — nunca adiciona produto sozinho ao carrinho.
async function ensureAttachLoaded() {
  if (state.insights.attach) return state.insights.attach;
  if (!sessionPode('painel:operacional')) return null;
  try {
    const attach = await getInsightsAttach();
    state.insights.attach = attach;
    return attach;
  } catch (err) {
    return null;
  }
}

function hideAttachSuggestion() {
  const el = document.getElementById('attachSuggestion');
  if (el) el.classList.add('hidden');
}

export async function onServicoSelected(servicoId) {
  hideAttachSuggestion();
  if (!servicoId) return;
  const sessao = state.session;
  const identidade = sessionIdentity(getSession());
  const versao = versaoDoRascunho();
  const attach = await ensureAttachLoaded();
  if (!mesmoContexto(sessao, identidade) || versao !== versaoDoRascunho()) return;
  const sugestao = attach?.sugestoes?.find(s => s.servicoId === servicoId);
  const top = sugestao?.produtos?.[0];
  if (!top) return;

  const el = document.getElementById('attachSuggestion');
  const text = document.getElementById('attachSuggestionText');
  if (!el || !text) return;
  text.textContent = `Sugestão: adicionar ${top.nome}?`;
  el.dataset.produtoId = top.produtoId;
  el.classList.remove('hidden');
}

function addAttachSuggestion() {
  const el = document.getElementById('attachSuggestion');
  const produtoId = el?.dataset.produtoId;
  if (!produtoId || !state.fuzzyProduto) return;
  state.fuzzyProduto.setValue(produtoId);
  hideAttachSuggestion();
  invalidatePreview();
}

export function initCheckout() {
  const pendente = document.createElement('section');
  pendente.id = 'checkoutPendente';
  pendente.className = 'card hidden';
  pendente.innerHTML = `<h2>Fechamento pendente</h2>
    <p>A comanda pode já ter sido registrada. Para conferir ou concluir, retome a mesma tentativa.</p>
    <p id="checkoutPendenteCliente"></p>
    <p id="checkoutPendenteItens"></p>
    <p id="checkoutPendenteTotal"></p>
    <div class="checkout-actions"><button type="button" class="btn btn-primary" id="btnRetomarFechamento">Retomar fechamento pendente</button></div>`;
  document.getElementById('cardPreview').before(pendente);
  document.getElementById('btnRetomarFechamento').addEventListener('click', () => enviarFechamento(true));
  onAuthContextChanged(() => {
    pedidoDeSimulacao++;
    versaoDosAtalhos++;
    consultaDosAtalhos = null;
    atalhosProntos = false;
    rascunhoDaPendencia = null;
    reparoDaAgenda = null;
    totalConfirmado = null;
    resumoExibido = null;
    clienteDoRascunho = null;
    agendamentoDoRascunho = null;
    esconderPendencia();
  });
  document.getElementById('btnRepararVinculo').addEventListener('click', repararVinculo);
  document.getElementById('btnSimular').addEventListener('click', simular);
  document.getElementById('btnFechar').addEventListener('click', fechar);
  document.getElementById('btnAddItem').addEventListener('click', adicionarItem);
  document.getElementById('coAtalhosLista').addEventListener('click', ev => {
    const btn = ev.target.closest('[data-atalho]');
    if (!btn) return;
    const antes = state.comandaItens.length;
    usarAtalho(btn.dataset.atalho, btn.dataset.id);
    // Retorno visual curto só quando o item entrou de fato na comanda.
    if (state.comandaItens.length > antes) {
      btn.classList.remove('co-atalho-ok');
      void btn.offsetWidth; // reinicia a animação em toques seguidos
      btn.classList.add('co-atalho-ok');
    }
  });
  stateBus.addEventListener('catalog:updated', () => {
    renderAtalhos();
    renderComandaItens();
  });
  stateBus.addEventListener('checkout:draft-open', carregarAtalhos);
  stateBus.addEventListener('checkout:closed', event => {
    if (!event.detail?.comandoId) return;
    versaoDosAtalhos++;
    consultaDosAtalhos = null;
    atalhosProntos = false;
    const editor = document.getElementById('comandasCheckout');
    if (state.activeTab === 'checkout' && editor && !editor.classList.contains('hidden')) carregarAtalhos();
  });
  document.getElementById('coTaxaAviso').addEventListener('click', ev => {
    const btn = ev.target.closest('#btnTrocarForma');
    if (!btn) return;
    state.fuzzyForma.setValue(btn.dataset.forma);
    invalidatePayload();
    simular();
  });
  document.getElementById('coItensLista').addEventListener('click', ev => {
    const semPlano = ev.target.closest('[data-sem-plano]');
    if (semPlano) {
      const item = state.comandaItens[Number(semPlano.dataset.semPlano)];
      if (item) {
        item.semPlano = true;
        limparCobertura(item);
        renderComandaItens();
        invalidatePreview();
      }
      return;
    }
    const btn = ev.target.closest('[data-remover-item]');
    if (btn) removerItem(Number(btn.dataset.removerItem));
  });

  const tabs = document.getElementById('checkoutTabs');
  if (tabs) {
    Array.from(tabs.querySelectorAll('.checkout-tab-btn')).forEach(btn => {
      btn.addEventListener('click', () => {
        state.checkoutTab = btn.dataset.tab;
        renderCheckoutTabs();
        renderCheckoutItems();
      });
    });
  }

  const tipPlusBtn = document.getElementById('tipPlusBtn');
  const tipMinusBtn = document.getElementById('tipMinusBtn');
  if (tipPlusBtn) tipPlusBtn.addEventListener('click', incrementTip);
  if (tipMinusBtn) tipMinusBtn.addEventListener('click', decrementTip);

  const splitToggle = document.getElementById('splitToggle');
  if (splitToggle) splitToggle.addEventListener('click', toggleSplitPayment);

  const addSplitRowBtn = document.getElementById('addSplitRowBtn');
  if (addSplitRowBtn) addSplitRowBtn.addEventListener('click', addSplitRow);

  document.getElementById('btnRebookingConfirm')?.addEventListener('click', confirmRebooking);
  document.getElementById('btnRebookingDismiss')?.addEventListener('click', () => {
    document.getElementById('rebookingCard').classList.add('hidden');
  });

  document.getElementById('btnAttachSuggestionAdd')?.addEventListener('click', addAttachSuggestion);

  // O input do FuzzyField apaga a seleção também ao digitar. Lemos de novo
  // após os listeners do campo para atualizar a última parcela.
  for (const id of ['coCliente', 'coServico', 'coProduto', 'coProfissional', 'coProdutoQtd']) {
    document.getElementById(id).addEventListener('input', () => {
      if (id === 'coCliente') {
        state.comandaItens.forEach(limparCobertura);
        renderComandaItens();
      }
      if (id === 'coCliente' || id === 'coServico') hideAttachSuggestion();
      invalidatePreview();
      if (state.splitEnabled) queueMicrotask(updateLastSplitRowDisplay);
    });
  }
  document.getElementById('coCliente').addEventListener('blur', event => {
    if (clienteDoRascunho && !event.target.value.trim()) onCheckoutFieldChanged('cliente');
  });
  document.getElementById('coForma').addEventListener('input', invalidatePayload);

  renderTipStepper();
  renderSplitToggle();
  renderSplitRows();
  updateSubmitButtonState();

  stateBus.addEventListener('checkout:prefill', (e) => {
    prefillCheckoutFromAgendamento(e.detail);
  });
  stateBus.addEventListener('checkout:new', () => {
    if (!state.fuzzyCliente) return;
    if (!temRascunhoCheckout()) limparRascunho();
    abrirRascunho();
  });
}

export function updateCheckoutItems() {
  renderCheckoutItems();
}

export function updateCheckoutTabs() {
  renderCheckoutTabs();
}

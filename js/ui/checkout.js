import { api, getInsightsRebooking, getInsightsAttach } from '../api.js';
import { state, stateBus } from '../state.js';
import {
  centsToBRL,
  brlToCents,
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

// F4.2: split usa sempre o total confirmado pelo preview (nunca uma estimativa
// client-side) — a última linha é o restante exibido, nunca digitável.
// Valor digitado numa linha do pagamento dividido: aceita "20", "20,50" e "20.50".
function valorDaLinha(v) {
  const t = String(v ?? '').trim();
  if (!t) return 0;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

// Total a dividir: o do resumo confirmado pelo servidor, quando há; senão, o subtotal
// da tela (itens + gorjeta), a mesma conta do pagamento em forma única. Se não bater
// com o servidor, a simulação recusa (PAYMENT_TOTAL_MISMATCH) e nada é gravado.
function totalParaDividir() {
  if (state.currentPayload && state.currentPreview) return state.currentPreview.totals.totalRecebidoCentavos;
  let itens = state.comandaItens;
  try { itens = [...state.comandaItens, ...itensDosCampos(false)]; } catch (_) { /* campo incompleto: conta só a lista */ }
  return itens.reduce((t, item) => t + precoDoItem(item), 0) + (state.tip || 0);
}

function buildSplitPayments() {
  if (state.splits.length < 2) throw new Error('Para dividir, use pelo menos duas formas de pagamento.');

  const totalCentavos = totalParaDividir();
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
state.comandaItens = state.comandaItens || [];

function precoDoItem(item) {
  if (item.tipo === 'servico') return (state.catalog.servicos.find(s => s.id === item.servicoId) || {}).valor_centavos || 0;
  return ((state.catalog.produtos || []).find(p => p.id === item.produtoId) || {}).preco_venda_centavos * item.quantidade || 0;
}
function rotuloDoItem(item) {
  // Texto puro: quem monta o HTML passa por escapeHtml (renderComandaItens).
  const nomeDe = (lista, id) => ((lista || []).find(x => x.id === id) || {}).nome;
  const prof = nomeDe(state.catalog.profissionais, item.profissionalId);
  if (item.tipo === 'servico') return [nomeDe(state.catalog.servicos, item.servicoId) || 'Serviço', prof || 'sem profissional'].join(' · ');
  return [String(item.quantidade) + '× ' + (nomeDe(state.catalog.produtos, item.produtoId) || 'Produto'), prof || 'sem vendedor'].join(' · ');
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
  state.fuzzyServico.setValue(null);
  state.fuzzyProduto.setValue(null);
  state.fuzzyProfissional.setValue(null);
  document.getElementById('coProdutoQtd').value = '1';
}

export function renderComandaItens() {
  const bloco = document.getElementById('coItens');
  if (!bloco) return;
  const itens = state.comandaItens;
  bloco.classList.toggle('hidden', !itens.length);
  document.getElementById('coItensLista').innerHTML = itens.map((item, i) => `
    <div class="row" data-item="${i}" data-tipo="${item.tipo}">
      <span>${escapeHtml(rotuloDoItem(item))}</span>
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
    const novos = itensDosCampos(true);
    if (state.comandaItens.length + novos.length > MAX_ITENS) throw new Error(`Uma comanda aceita até ${MAX_ITENS} itens.`);
    state.comandaItens.push(...novos);
    limparCamposDeItem();
    renderComandaItens();
    invalidatePayload();
  } catch (err) {
    showBanner(err.message, 'error');
  }
}

// ---- Atalhos "Mais vendidos": um toque põe o item na comanda ----
let maisVendidos = { servicos: [], produtos: [] };

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

export async function carregarAtalhos() {
  try {
    maisVendidos = await api('/checkout/mais-vendidos');
  } catch (_) {
    maisVendidos = { servicos: [], produtos: [] }; // sem atalhos a comanda funciona igual
  }
  renderAtalhos();
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
    msg.textContent = 'Escolha o profissional e toque em "Adicionar à comanda".';
    document.getElementById('coProfissional').focus();
    return;
  }
  if (state.comandaItens.length + 1 > MAX_ITENS) { showBanner(`Uma comanda aceita até ${MAX_ITENS} itens.`, 'error'); return; }
  state.comandaItens.push(tipo === 'servico' ? { tipo, servicoId: id, profissionalId } : { tipo, produtoId: id, quantidade: 1, profissionalId: profissionalId || undefined });
  renderComandaItens();
  invalidatePayload();
  msg.textContent = 'Adicionado. O profissional continua escolhido para o próximo item.';
}

function removerItem(indice) {
  state.comandaItens.splice(indice, 1);
  renderComandaItens();
  invalidatePayload();
}

function buildPayload() {
  const formaCode = state.fuzzyForma.getValue();
  const clienteId = state.fuzzyCliente.getValue();
  // V1.3 trocou o input coGorjeta pelo tip stepper; a intenção de gorjeta vive em state.tip (centavos)
  const gorjetaCentavos = state.tip || 0;

  const itens = [...state.comandaItens, ...itensDosCampos(false)];
  if (!itens.length) throw new Error('Adicione ao menos um serviço ou produto à comanda.');
  if (itens.length > MAX_ITENS) throw new Error(`Uma comanda aceita até ${MAX_ITENS} itens.`);
  if (!state.splitEnabled && !formaCode) throw new Error('Selecione uma forma de pagamento.');

  const totalCentavos = itens.reduce((t, item) => t + precoDoItem(item), 0) + gorjetaCentavos;
  const payments = state.splitEnabled
    ? buildSplitPayments()
    : [{ formaCode, valorCentavos: totalCentavos }];

  return {
    clienteId: clienteId || null,
    idempotencyKey: genIdempotencyKey(),
    itens: itens.map(i => ({ ...i })),
    payments,
    gorjetaCentavos,
    agendamentoId: state.agendamentoIdParaCheckout || undefined
  };
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

export async function simular() {
  clearBanner();
  document.getElementById('cardPreview').classList.add('hidden');
  document.getElementById('cardResultado').classList.add('hidden');
  document.getElementById('rebookingCard').classList.add('hidden');
  hideAttachSuggestion();
  document.getElementById('btnFechar').disabled = true;
  try {
    const payload = buildPayload();
    const preview = await api('/checkout/preview', { method: 'POST', body: payload });
    state.currentPayload = payload;
    state.currentPreview = preview;
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
    document.getElementById('cardPreview').classList.remove('hidden');
    renderTaxaAviso(preview, payload);
    renderSplitRows();
    updateSubmitButtonState();
  } catch (err) {
    showBanner(desvincularSeAgendaInvalida(err), 'error');
  }
}

// O backend recusa (antes de gravar) checkout vinculado a agendamento que não
// pode ser concluído (cancelado, falta, reagendado) ou que não existe mais. A
// tela tira o vínculo para a recepção poder fechar a comanda avulsa.
const VINCULO_INVALIDO = ['INVALID_STATUS_TRANSITION', 'AGENDAMENTO_NOT_FOUND'];
function desvincularSeAgendaInvalida(err) {
  if (!state.agendamentoIdParaCheckout || !VINCULO_INVALIDO.includes(err && err.code)) return err.message;
  state.agendamentoIdParaCheckout = null;
  state.currentPayload = null;
  document.getElementById('btnFechar').disabled = true;
  return `${err.message} O vínculo com a agenda foi removido: clique em "Simular comanda" para fechar sem ele.`;
}

export async function fechar() {
  if (!state.currentPayload) return;
  clearBanner();
  const btn = document.getElementById('btnFechar');
  btn.disabled = true;
  btn.textContent = 'Fechando…';
  try {
    const saved = await api('/checkout/close', { method: 'POST', body: state.currentPayload });
    const s = saved.saved;
    const clienteId = state.currentPayload.clienteId;
    const servicoItem = state.currentPayload.itens.find(i => i.tipo === 'servico');

    document.getElementById('resComandaId').textContent = s.comandoId || '—';
    document.getElementById('resStatus').textContent = s.status || (s.idempotent ? 'já fechada (idempotente)' : '—');
    document.getElementById('resCounts').textContent = `${s.itens ?? '—'} / ${s.pagamentos ?? '—'} / ${s.gorjetas ?? '—'}`;
    document.getElementById('resCaixa').textContent = s.caixaMovimentos ?? '—';
    document.getElementById('cardResultado').classList.remove('hidden');
    showBanner('Comanda fechada com sucesso.', 'ok');
    state.currentPayload = null;
    state.currentPreview = null;
    state.agendamentoIdParaCheckout = null;
    state.tip = 0;
    state.comandaItens = [];
    limparCamposDeItem();
    renderComandaItens();
    state.splitEnabled = false;
    state.splits = [{ id: 's1', method: '', amount: '' }];
    document.getElementById('coFormaField')?.classList.remove('hidden');
    renderTipStepper();
    renderSplitToggle();
    renderSplitRows();
    btn.textContent = 'Fechar comanda';

    // Emit event so other modules (dashboard, agenda) update
    stateBus.dispatchEvent(new CustomEvent('checkout:closed'));

    // F4.3: sugestão de reagendamento é best-effort — nunca bloqueia o fechamento já concluído
    if (clienteId && servicoItem) {
      showRebookingSuggestion(clienteId, servicoItem.servicoId, servicoItem.profissionalId);
    } else {
      document.getElementById('rebookingCard').classList.add('hidden');
    }
  } catch (err) {
    const msg = desvincularSeAgendaInvalida(err);
    showBanner(msg, 'error');
    btn.disabled = !state.currentPayload;
    btn.textContent = 'Fechar comanda';
  }
}

async function showRebookingSuggestion(clienteId, servicoId, profissionalId) {
  const card = document.getElementById('rebookingCard');
  if (!card) return;
  card.classList.add('hidden');
  try {
    const suggestion = await getInsightsRebooking(clienteId, servicoId);
    if (!suggestion || !suggestion.dataSugerida) return;
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
    stateBus.dispatchEvent(new CustomEvent('checkout:closed'));
  } catch (err) {
    showBanner('Não foi possível criar o reagendamento: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

export function prefillCheckoutFromAgendamento(item) {
  state.agendamentoIdParaCheckout = item.id;
  state.fuzzyCliente.setValue(item.cliente_id || null);
  state.fuzzyServico.setValue(item.servico_id || null);
  state.fuzzyProfissional.setValue(item.profissional_id || null);
  state.fuzzyProduto.setValue(null);
  // Comanda nova a partir da agenda: começa sem itens de uma comanda anterior não fechada.
  state.comandaItens = [];
  renderComandaItens();
  document.getElementById('cardPreview').classList.add('hidden');
  document.getElementById('cardResultado').classList.add('hidden');
  document.getElementById('rebookingCard').classList.add('hidden');
  hideAttachSuggestion();
  state.currentPayload = null;
  state.currentPreview = null;
  state.splitEnabled = false;
  state.splits = [{ id: 's1', method: '', amount: '' }];
    document.getElementById('coFormaField')?.classList.remove('hidden');
  renderSplitToggle();
  renderSplitRows();

  // Emit tab:change to switch to checkout tab
  stateBus.dispatchEvent(new CustomEvent('tab:change', { detail: 'checkout' }));
  
  showBanner('Comanda pré-preenchida a partir do agendamento das ' + String(item.horario || '').slice(0, 5) + '. Confira e clique em "Simular comanda".', 'ok');
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

// Gorjeta alterada após o preview = total muda → payload E total de referência ficam defasados
function invalidatePreview() {
  state.currentPayload = null;
  state.currentPreview = null;
  const card = document.getElementById('cardPreview');
  if (card) card.classList.add('hidden');
  document.getElementById('coTaxaAviso')?.classList.add('hidden');
  updateSubmitButtonState();
}

// Split editado após o preview (forma/valor por linha) muda só a FORMA de pagar o
// mesmo total já confirmado — mantém state.currentPreview (base do restante da última
// linha) e invalida apenas o payload, forçando reconfirmar com o backend antes de fechar.
function invalidatePayload() {
  state.currentPayload = null;
  const card = document.getElementById('cardPreview');
  if (card) card.classList.add('hidden');
  document.getElementById('coTaxaAviso')?.classList.add('hidden');
  if (state.splitEnabled) updateLastSplitRowDisplay();
  updateSubmitButtonState();
}

export function incrementTip() {
  state.tip += 100; // incrementa 1 real (100 centavos)
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
function lastSplitRemainderCentavos() {
  const outrasCentavos = state.splits.slice(0, -1).reduce((sum, s) => sum + valorDaLinha(s.amount), 0);
  return totalParaDividir() - outrasCentavos;
}

function updateLastSplitRowDisplay() {
  const lastIdx = state.splits.length - 1;
  const el = document.querySelector(`.split-row-amount[data-split-idx="${lastIdx}"]`);
  const restante = lastSplitRemainderCentavos();
  if (el) el.textContent = restante > 0 ? centsToBRL(restante) : 'sem restante';
  const dica = document.getElementById('splitDica');
  if (dica) dica.textContent = restante > 0 ? 'A última forma recebe o restante. Depois, toque em "Simular comanda".' : 'Os valores já cobrem o total. Diminua um valor ou remova uma forma.';
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
      updateLastSplitRowDisplay();
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
  if (state.splits.length < 2 || state.splits.some(split => !split.method)) return false;

  const outras = state.splits.slice(0, -1);
  if (outras.some(split => valorDaLinha(split.amount) <= 0)) return false;

  return lastSplitRemainderCentavos() > 0;
}

export function updateSubmitButtonState() {
  const btnFechar = document.getElementById('btnFechar');
  if (btnFechar) {
    // Só habilita com preview válido em mãos — nunca habilitar sem simulação
    btnFechar.disabled = !state.currentPayload || !validateSplitPayment();
  }
}

// F4.6: attach é sempre sugestão — nunca adiciona produto sozinho ao carrinho.
async function ensureAttachLoaded() {
  if (state.insights.attach) return state.insights.attach;
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
  const attach = await ensureAttachLoaded();
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
  invalidatePayload();
}

export function initCheckout() {
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
  stateBus.addEventListener('catalog:updated', renderAtalhos);
  stateBus.addEventListener('checkout:closed', carregarAtalhos);
  document.getElementById('coTaxaAviso').addEventListener('click', ev => {
    const btn = ev.target.closest('#btnTrocarForma');
    if (!btn) return;
    state.fuzzyForma.setValue(btn.dataset.forma);
    simular();
  });
  document.getElementById('coItensLista').addEventListener('click', ev => {
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

  renderTipStepper();
  renderSplitToggle();
  renderSplitRows();
  updateSubmitButtonState();

  stateBus.addEventListener('checkout:prefill', (e) => {
    prefillCheckoutFromAgendamento(e.detail);
  });
}

export function updateCheckoutItems() {
  renderCheckoutItems();
}

export function updateCheckoutTabs() {
  renderCheckoutTabs();
}

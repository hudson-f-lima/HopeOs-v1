import { api, getInsightsRebooking, getInsightsAttach } from '../api.js?v=ts1783742622';
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
function buildSplitPayments() {
  if (!state.currentPreview) throw new Error('Simule a comanda antes de dividir o pagamento.');
  if (!state.splits.length) throw new Error('Adicione ao menos uma forma de pagamento.');

  const totalCentavos = state.currentPreview.totals.totalRecebidoCentavos;
  const outras = state.splits.slice(0, -1);
  const last = state.splits[state.splits.length - 1];

  let somaOutras = 0;
  const payments = outras.map((split, idx) => {
    if (!split.method) throw new Error(`Selecione a forma de pagamento na linha ${idx + 1}.`);
    const valorCentavos = brlToCents(split.amount);
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

function buildPayload() {
  const servicoId = state.fuzzyServico.getValue();
  const profissionalId = state.fuzzyProfissional.getValue();
  const formaCode = state.fuzzyForma.getValue();
  const clienteId = state.fuzzyCliente.getValue();
  // V1.3 trocou o input coGorjeta pelo tip stepper; a intenção de gorjeta vive em state.tip (centavos)
  const gorjetaCentavos = state.tip || 0;

  if (!servicoId) throw new Error('Selecione um serviço.');
  if (!profissionalId) throw new Error('Selecione um profissional.');
  if (!state.splitEnabled && !formaCode) throw new Error('Selecione uma forma de pagamento.');

  const servico = state.catalog.servicos.find(s => s.id === servicoId);
  const valorServicoCentavos = servico ? servico.valor_centavos : 0;
  const itens = [{ tipo: 'servico', servicoId, profissionalId }];

  const produtoId = state.fuzzyProduto.getValue();
  let valorProdutoCentavos = 0;
  if (produtoId) {
    const produto = state.catalog.produtos.find(p => p.id === produtoId);
    valorProdutoCentavos = produto ? produto.preco_venda_centavos : 0;
    itens.push({ tipo: 'produto', produtoId, quantidade: 1, profissionalId: profissionalId || undefined });
  }

  const totalCentavos = valorServicoCentavos + valorProdutoCentavos + gorjetaCentavos;
  const payments = state.splitEnabled
    ? buildSplitPayments()
    : [{ formaCode, valorCentavos: totalCentavos }];

  return {
    clienteId: clienteId || null,
    idempotencyKey: genIdempotencyKey(),
    itens,
    payments,
    gorjetaCentavos,
    agendamentoId: state.agendamentoIdParaCheckout || undefined
  };
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
    renderSplitRows();
    updateSubmitButtonState();
  } catch (err) {
    showBanner(err.message, 'error');
  }
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
    state.splitEnabled = false;
    state.splits = [{ id: 's1', method: '', amount: '' }];
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
    showBanner(err.message, 'error');
    btn.disabled = false;
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
  document.getElementById('cardPreview').classList.add('hidden');
  document.getElementById('cardResultado').classList.add('hidden');
  document.getElementById('rebookingCard').classList.add('hidden');
  hideAttachSuggestion();
  state.currentPayload = null;
  state.currentPreview = null;
  state.splitEnabled = false;
  state.splits = [{ id: 's1', method: '', amount: '' }];
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
  // Placeholder for rendering cart items
  // Will be implemented in future tasks when UI structure is ready
  console.log(`Rendering ${state.checkoutTab} items:`, visibleItems);
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
  updateSubmitButtonState();
}

// Split editado após o preview (forma/valor por linha) muda só a FORMA de pagar o
// mesmo total já confirmado — mantém state.currentPreview (base do restante da última
// linha) e invalida apenas o payload, forçando reconfirmar com o backend antes de fechar.
function invalidatePayload() {
  state.currentPayload = null;
  const card = document.getElementById('cardPreview');
  if (card) card.classList.add('hidden');
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
  }
}

export function toggleSplitPayment() {
  if (!state.splitEnabled && !state.currentPreview) {
    showBanner('Simule a comanda antes de dividir o pagamento.', 'error');
    return;
  }
  state.splitEnabled = !state.splitEnabled;
  renderSplitToggle();
  renderSplitRows();
  invalidatePayload();
}

// Restante da última linha (não digitável) = total confirmado no preview - soma das outras linhas
function lastSplitRemainderCentavos() {
  if (!state.currentPreview) return 0;
  const totalCentavos = state.currentPreview.totals.totalRecebidoCentavos;
  const outrasCentavos = state.splits.slice(0, -1).reduce((sum, s) => sum + brlToCents(s.amount), 0);
  return totalCentavos - outrasCentavos;
}

function updateLastSplitRowDisplay() {
  const lastIdx = state.splits.length - 1;
  const el = document.querySelector(`.split-row-amount[data-split-idx="${lastIdx}"]`);
  if (el) el.textContent = centsToBRL(lastSplitRemainderCentavos());
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
        <select class="split-row-form input-light" data-split-idx="${idx}">
          <option value="">Selecione...</option>
          ${formas.map(f => `<option value="${escapeHtml(f.code)}" ${split.method === f.code ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}
        </select>
        ${isLast ? `
          <div class="split-row-amount display-only" data-split-idx="${idx}">${centsToBRL(restanteCentavos)}</div>
        ` : `
          <input type="number" class="split-row-input input-light" data-split-idx="${idx}" placeholder="0,00" value="${split.amount || ''}" min="0" step="0.01" />
        `}
        ${state.splits.length > 1 ? `
          <button type="button" class="split-row-remove" data-split-idx="${idx}">×</button>
        ` : ''}
      </div>
    `;
  }).join('');

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
  if (!state.currentPreview) return false; // precisa do total confirmado pelo preview

  if (state.splits.some(split => !split.method)) return false;

  const outras = state.splits.slice(0, -1);
  if (outras.some(split => brlToCents(split.amount) <= 0)) return false;

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

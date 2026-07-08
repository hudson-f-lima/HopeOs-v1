import { api } from '../api.js';
import { state, stateBus } from '../state.js';
import {
  centsToBRL,
  brlToCents,
  genIdempotencyKey,
  clearBanner,
  showBanner
} from '../utils.js';

export function getVisibleCartItems() {
  const tab = state.checkoutTab;
  return tab === 'servicos' ? state.cart.servicos : state.cart.produtos;
}

function buildPayload() {
  const servicoId = state.fuzzyServico.getValue();
  const profissionalId = state.fuzzyProfissional.getValue();
  const formaCode = state.fuzzyForma.getValue();
  const clienteId = state.fuzzyCliente.getValue();
  const gorjetaCentavos = brlToCents(document.getElementById('coGorjeta').value);

  if (!servicoId) throw new Error('Selecione um serviço.');
  if (!profissionalId) throw new Error('Selecione um profissional.');
  if (!formaCode) throw new Error('Selecione uma forma de pagamento.');

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

  return {
    clienteId: clienteId || null,
    idempotencyKey: genIdempotencyKey(),
    itens,
    payments: [{ formaCode, valorCentavos: totalCentavos }],
    gorjetaCentavos,
    agendamentoId: state.agendamentoIdParaCheckout || undefined
  };
}

export async function simular() {
  clearBanner();
  document.getElementById('cardPreview').classList.add('hidden');
  document.getElementById('cardResultado').classList.add('hidden');
  document.getElementById('btnFechar').disabled = true;
  try {
    const payload = buildPayload();
    const preview = await api('/checkout/preview', { method: 'POST', body: payload });
    state.currentPayload = payload;
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
    document.getElementById('btnFechar').disabled = false;
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
    document.getElementById('resComandaId').textContent = s.comandoId || '—';
    document.getElementById('resStatus').textContent = s.status || (s.idempotent ? 'já fechada (idempotente)' : '—');
    document.getElementById('resCounts').textContent = `${s.itens ?? '—'} / ${s.pagamentos ?? '—'} / ${s.gorjetas ?? '—'}`;
    document.getElementById('resCaixa').textContent = s.caixaMovimentos ?? '—';
    document.getElementById('cardResultado').classList.remove('hidden');
    showBanner('Comanda fechada com sucesso.', 'ok');
    state.currentPayload = null;
    state.agendamentoIdParaCheckout = null;
    btn.textContent = 'Fechar comanda';
    
    // Emit event so other modules (dashboard, agenda) update
    stateBus.dispatchEvent(new CustomEvent('checkout:closed'));
  } catch (err) {
    showBanner(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Fechar comanda';
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
  state.currentPayload = null;
  
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

export function incrementTip() {
  state.tip += 100; // incrementa 1 real (100 centavos)
  renderTipStepper();
  updateSubmitButtonState();
}

export function decrementTip() {
  if (state.tip > 0) {
    state.tip -= 100; // decrementa 1 real
    renderTipStepper();
  }
  updateSubmitButtonState();
}

export function renderSplitToggle() {
  const toggle = document.getElementById('splitToggle');
  if (toggle) {
    toggle.classList.toggle('enabled', state.splitEnabled);
  }
}

export function toggleSplitPayment() {
  state.splitEnabled = !state.splitEnabled;
  renderSplitToggle();
  renderPaymentMethods();
  renderSplitRows();
  updateSubmitButtonState();
}

export function renderPaymentMethods() {
  const container = document.getElementById('paymentMethodsContainer');
  if (!container) return;

  if (state.splitEnabled) {
    container.classList.add('hidden');
  } else {
    container.classList.remove('hidden');
  }
}

export function renderSplitRows() {
  const splitContainer = document.getElementById('splitRowsContainer');
  const splitList = document.getElementById('splitRowsList');
  if (!splitContainer || !splitList) return;

  if (state.splitEnabled) {
    splitContainer.classList.remove('hidden');

    // Renderizar as linhas de split
    splitList.innerHTML = state.splits.map((split, idx) => {
      const isLast = idx === state.splits.length - 1;
      const methods = ['pix', 'dinheiro', 'debito', 'credito', 'online'];

      return `
        <div class="split-row">
          <select class="split-row-form input-light" data-split-idx="${idx}">
            <option value="">Selecione...</option>
            ${methods.map(m => `<option value="${m}" ${split.method === m ? 'selected' : ''}>${m.charAt(0).toUpperCase() + m.slice(1)}</option>`).join('')}
          </select>
          ${isLast ? `
            <div class="split-row-amount display-only" data-split-idx="${idx}">
              R$ ${(split.amount || 0).toFixed(2)}
            </div>
          ` : `
            <input type="number" class="split-row-input input-light" data-split-idx="${idx}" placeholder="0,00" value="${split.amount || ''}" min="0" step="0.01" />
          `}
          ${state.splits.length > 1 ? `
            <button class="split-row-remove" data-split-idx="${idx}">×</button>
          ` : ''}
        </div>
      `;
    }).join('');

    // Adicionar event listeners
    splitList.querySelectorAll('.split-row-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.splitIdx);
        state.splits.splice(idx, 1);
        renderSplitRows();
      });
    });

    splitList.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', () => {
        const idx = parseInt(input.dataset.splitIdx);
        state.splits[idx].amount = parseFloat(input.value) || 0;
        updateSubmitButtonState();
      });
    });
  } else {
    splitContainer.classList.add('hidden');
  }
}

export function addSplitRow() {
  state.splits.push({ id: 's' + Date.now(), method: '', amount: 0 });
  renderSplitRows();
}

export function validateSplitPayment() {
  if (!state.splitEnabled) return true; // Sem split, sempre válido

  const total = state.tip; // Valor total a pagar (apenas gorjeta por enquanto)
  const sumManualSplits = state.splits.slice(0, -1).reduce((sum, split) => sum + (split.amount || 0), 0);
  const lastAmount = total - sumManualSplits;

  return lastAmount >= 0; // Válido se o restante é >= 0
}

export function updateSubmitButtonState() {
  const btnFechar = document.getElementById('btnFechar');
  if (btnFechar) {
    btnFechar.disabled = !validateSplitPayment();
  }
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

  renderTipStepper();
  renderSplitToggle();
  renderPaymentMethods();
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

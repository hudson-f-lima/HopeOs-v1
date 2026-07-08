import { api } from '../api.js';
import { state, stateBus } from '../state.js';
import { 
  centsToBRL, 
  brlToCents, 
  genIdempotencyKey, 
  clearBanner, 
  showBanner 
} from '../utils.js';

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

export function initCheckout() {
  document.getElementById('btnSimular').addEventListener('click', simular);
  document.getElementById('btnFechar').addEventListener('click', fechar);
  
  stateBus.addEventListener('checkout:prefill', (e) => {
    prefillCheckoutFromAgendamento(e.detail);
  });
}

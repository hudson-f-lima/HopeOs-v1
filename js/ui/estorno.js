// Dashboard > Comandas do dia: estorno de comanda (D-013). Só admin/gestor
// logados veem (o backend recusa os outros com 403; token legado também não estorna).
// A tela nunca calcula valor: manda itens/quantidades e a forma; o backend devolve
// o valor revertido e grava a linha negativa no caixa de hoje.
import { api } from '../api.js';
import { state, stateBus } from '../state.js';
import { escapeHtml, centsToBRL, openModal, closeModal } from '../utils.js';
import { showToast } from './toast.js';

const el = id => document.getElementById(id);
const MOTIVOS = [
  ['erro_lancamento', 'Erro de lançamento'],
  ['duplicidade', 'Cobrança em duplicidade'],
  ['desistencia_cliente', 'Desistência do cliente'],
  ['insatisfacao', 'Insatisfação com o atendimento'],
  ['outro', 'Outro']
];
const STATUS = { fechado: 'Fechada', estornado_parcial: 'Estorno parcial', estornado: 'Estornada' };
let lista = [];
let atual = null;
let chave = null;

export function podeEstornar() {
  const s = state.session;
  return Boolean(s && s.principal === 'user' && ['admin', 'gestor'].includes(s.role));
}

function renderLista(dados) {
  lista = dados.comandas;
  el('estornoLista').innerHTML = lista.length
    ? lista.map(c => `
      <div class="row estorno-row" data-comanda="${escapeHtml(c.id)}">
        <span>${c.hora ? `${escapeHtml(String(c.hora).slice(0, 5))} · ` : ''}${escapeHtml(c.clienteNome || 'Sem cliente')} · <span class="text-tertiary" data-status="${escapeHtml(c.status)}">${STATUS[c.status] || c.status}</span></span>
        <span style="display:flex;gap:8px;align-items:center"><b>${centsToBRL(c.totalRecebidoCentavos)}</b>
        ${c.estornavel ? `<button type="button" class="btn btn-secondary btn-estornar" data-estornar="${escapeHtml(c.id)}" style="width:auto;padding:4px 10px">Estornar</button>` : ''}</span>
      </div>`).join('')
    : '<p class="empty-state">Nenhuma comanda fechada neste dia.</p>';
}

export async function atualizarComandasEstorno() {
  if (!podeEstornar()) return;
  el('estornoErro').textContent = '';
  try {
    const qs = el('estornoData').value ? `?data=${encodeURIComponent(el('estornoData').value)}` : '';
    const dados = await api(`/comandas${qs}`);
    if (!el('estornoData').value) el('estornoData').value = dados.data;
    renderLista(dados);
  } catch (err) {
    el('estornoErro').textContent = err.message;
  }
}

function tipoAtual() { return el('estTipoParcial').checked ? 'parcial' : 'total'; }

function atualizarModo() {
  const parcial = tipoAtual() === 'parcial';
  el('estItensBox').classList.toggle('hidden', !parcial);
  const formas = atual.formas.filter(f => f.disponivelCentavos > 0);
  el('estFormaBox').classList.toggle('hidden', !parcial || formas.length < 2);
}

function validarConfirmacao() {
  el('btnConfirmarEstorno').disabled = !el('estConfirmo').checked;
}

function abrir(id) {
  atual = lista.find(c => c.id === id);
  if (!atual) return;
  chave = (crypto.randomUUID && crypto.randomUUID()) || `est-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  el('estErro').classList.add('hidden'); el('estErro').textContent = '';
  el('estResumo').textContent = `Comanda de ${String(atual.data).split('-').reverse().join('/')} · recebido ${centsToBRL(atual.totalRecebidoCentavos)} · estorno até ${String(atual.prazoAte).split('-').reverse().join('/')}`;
  el('estTipoTotal').checked = true; el('estTipoParcial').checked = false;
  el('estItens').innerHTML = atual.itens.filter(i => i.restante > 0).map(i => `
    <div class="row"><label for="estQtd-${escapeHtml(i.id)}">${escapeHtml(i.descricao || (i.tipo === 'produto' ? 'Produto' : 'Serviço'))} (restam ${i.restante})</label>
    <input type="number" min="0" max="${i.restante}" step="1" value="0" id="estQtd-${escapeHtml(i.id)}" data-item="${escapeHtml(i.id)}" style="width:72px"/></div>`).join('');
  el('estForma').innerHTML = atual.formas.filter(f => f.disponivelCentavos > 0)
    .map(f => `<option value="${escapeHtml(f.formaCode)}">${escapeHtml(f.formaCode)} (até ${centsToBRL(f.disponivelCentavos)})</option>`).join('');
  el('estMotivoCodigo').innerHTML = MOTIVOS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  el('estMotivo').value = '';
  el('estDevolverEstoque').checked = true;
  el('estConfirmo').checked = false;
  validarConfirmacao();
  atualizarModo();
  openModal('modalEstorno');
}

function montarPedido() {
  const pedido = { tipo: tipoAtual(), idempotencyKey: chave, motivoCodigo: el('estMotivoCodigo').value, motivo: el('estMotivo').value.trim() };
  if (pedido.tipo === 'total') { pedido.devolverEstoque = el('estDevolverEstoque').checked; return pedido; }
  pedido.itens = [...el('estItens').querySelectorAll('input[data-item]')]
    .map(inp => ({ comandoItemId: inp.dataset.item, quantidade: Number(inp.value), devolveEstoque: el('estDevolverEstoque').checked }))
    .filter(i => Number.isInteger(i.quantidade) && i.quantidade > 0);
  if (!el('estFormaBox').classList.contains('hidden') && el('estForma').value) pedido.reembolsoForma = el('estForma').value;
  return pedido;
}

async function confirmar() {
  const erro = el('estErro');
  const pedido = montarPedido();
  const falha = msg => { erro.textContent = msg; erro.classList.remove('hidden'); };
  if (pedido.motivo.length < 10) return falha('Descreva o motivo (mínimo de 10 caracteres).');
  if (pedido.tipo === 'parcial' && !pedido.itens.length) return falha('Escolha a quantidade de ao menos um item.');
  el('btnConfirmarEstorno').disabled = true;
  try {
    const r = await api(`/comandas/${atual.id}/estorno`, { method: 'POST', body: pedido });
    closeModal('modalEstorno');
    showToast({ type: 'success', title: 'Estorno registrado', message: `${centsToBRL(r.reembolsoCentavos)} devolvido ao cliente. Lançado no caixa de hoje.` });
    stateBus.dispatchEvent(new CustomEvent('estorno:feito', { detail: r }));
    await atualizarComandasEstorno();
  } catch (err) {
    falha(err.message);
    el('btnConfirmarEstorno').disabled = !el('estConfirmo').checked;
  }
}

export function initEstorno() {
  if (!podeEstornar()) return;
  el('cardComandasEstorno').classList.remove('hidden');
  el('estornoData').addEventListener('change', atualizarComandasEstorno);
  el('estornoLista').addEventListener('click', ev => {
    const b = ev.target.closest('[data-estornar]');
    if (b) abrir(b.dataset.estornar);
  });
  el('estTipoTotal').addEventListener('change', atualizarModo);
  el('estTipoParcial').addEventListener('change', atualizarModo);
  el('estConfirmo').addEventListener('change', validarConfirmacao);
  el('btnCancelarEstorno').addEventListener('click', () => closeModal('modalEstorno'));
  el('btnConfirmarEstorno').addEventListener('click', confirmar);
}

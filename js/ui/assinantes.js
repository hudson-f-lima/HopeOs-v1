// Gestão → Assinantes (assinatura, Onda A fase 2; D-043, migration 022). Vende o plano ao cliente,
// registra o pagamento de cada ciclo (cobrança manual nesta onda), pausa, retoma e cancela. A
// situação (em dia, atrasada, suspensa) e os usos do ciclo vêm prontos do servidor; a tela só
// mostra e envia. Ver: assinatura:ver. Vender e receber: assinatura:vender. Pausar, retomar e
// cancelar: assinatura:gerir.
import { api } from '../api.js';
import { state, sessionPode } from '../state.js';
import { escapeHtml, showBanner, centsToBRL, formatDDMM } from '../utils.js';

const el = id => document.getElementById(id);
const ESTADO = { em_dia: 'Em dia', atrasada: 'Atrasada', suspensa: 'Suspensa', pausada: 'Pausada', cancelada: 'Cancelada', futura: 'Começa depois' };
const COR = { em_dia: 'success', atrasada: 'warning', suspensa: 'danger', pausada: 'neutral', cancelada: 'neutral', futura: 'neutral' };
const FORMAS = { pix: 'Pix', dinheiro: 'Dinheiro', debito: 'Débito', credito: 'Crédito', outro: 'Outro' };
let lista = [];
let planos = [];
let filtro = '';
let novaAberta = false;

const nomeServico = id => { const s = (state.catalog.servicos || []).find(x => x.id === id); return s ? s.nome : 'Serviço'; };
const hojeLocal = () => new Date().toLocaleDateString('en-CA');

function card(a) {
  const s = a.situacao;
  const usos = a.usosDoCiclo.map(u => nomeServico(u.servicoId) + ': ' + u.usados + (u.limite ? ' de ' + u.limite : ' (ilimitado)')).join(' · ');
  const abertos = a.ciclos.filter(c => c.estado === 'em_aberto');
  const podeReceber = sessionPode('assinatura:vender') && a.status !== 'cancelada';
  const podeGerir = sessionPode('assinatura:gerir');
  const botoes = [];
  if (podeGerir && a.status === 'ativa') botoes.push('<button class="btn" type="button" data-ass-acao="pausar">Pausar</button>');
  if (podeGerir && a.status === 'pausada') botoes.push('<button class="btn" type="button" data-ass-acao="retomar">Retomar</button>');
  if (podeGerir && a.status !== 'cancelada') botoes.push('<button class="btn danger" type="button" data-ass-acao="cancelar">Cancelar…</button>');
  return '<article class="card assinante-card" data-assinatura="' + escapeHtml(a.id) + '" style="margin-bottom:10px;">' +
    '<h3 class="m-0">' + escapeHtml(a.clienteNome || 'Cliente') + ' <span class="badge ' + COR[s.estado] + '">' + escapeHtml(ESTADO[s.estado] || s.estado) + '</span></h3>' +
    '<p class="body-sm">' + escapeHtml(a.planoNome + ' · ' + centsToBRL(a.precoCentavos)) + (a.cicloAtual ? escapeHtml(' · ciclo ' + formatDDMM(a.cicloAtual.inicio) + ' a ' + formatDDMM(a.cicloAtual.fim)) : '') + '</p>' +
    '<p class="body-sm text-tertiary">' + escapeHtml(s.texto) + '</p>' +
    (usos ? '<p class="body-sm">' + escapeHtml('Usos no ciclo: ' + usos) + '</p>' : '') +
    (abertos.length ? '<ul class="body-sm" style="margin:4px 0 4px 18px;">' + abertos.map(c => '<li>' + escapeHtml('Ciclo de ' + formatDDMM(c.inicio) + ': ' + centsToBRL(c.valorCentavos) + ' em aberto' + (c.diasAtraso ? ' (' + c.diasAtraso + ' dia(s) de atraso)' : '')) +
      (podeReceber ? ' <button class="btn" type="button" data-ass-pagar="' + escapeHtml(c.inicio) + '">Registrar pagamento</button>' : '') + '</li>').join('') + '</ul>' : '') +
    (botoes.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">' + botoes.join('') + '</div>' : '') +
    '</article>';
}

function formNova() {
  const clientes = (state.catalog.clientes || []).filter(c => c.ativo !== false).sort((x, y) => String(x.nome).localeCompare(String(y.nome), 'pt-BR'));
  const vendaveis = planos.filter(p => !p.arquivado && p.disponivelVenda);
  return '<form id="formAssinatura" class="card" novalidate style="margin-bottom:12px;"><h3 class="m-0">Nova assinatura</h3>' +
    '<div class="field"><label for="assCliente">Cliente</label><select id="assCliente"><option value="">Escolha…</option>' +
      clientes.map(c => '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.nome) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="assPlano">Plano</label><select id="assPlano"><option value="">Escolha…</option>' +
      vendaveis.map(p => '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.nome + ' · ' + centsToBRL(p.precoCentavos)) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="assInicio">Início</label><input type="date" id="assInicio" value="' + hojeLocal() + '"/></div>' +
    '<label class="filter-inline"><input type="checkbox" id="assPagoAgora" checked/> Pagamento do 1º ciclo recebido agora</label>' +
    '<div class="field" id="assFormaBox"><label for="assForma">Forma</label><select id="assForma">' + Object.entries(FORMAS).map(([v, t]) => '<option value="' + v + '">' + t + '</option>').join('') + '</select></div>' +
    '<p class="body-sm" id="assMsg" role="alert"></p>' +
    '<div style="display:flex;gap:8px;"><button class="btn btn-primary" type="submit" id="btnAssSalvar">Assinar</button><button class="btn" type="button" id="btnAssCancelarForm">Cancelar</button></div></form>';
}

function render() {
  const c = el('assinantesConteudo');
  const visiveis = lista.filter(a => !filtro || String(a.clienteNome || '').toLowerCase().includes(filtro));
  const contagem = ['em_dia', 'atrasada', 'suspensa'].map(e => lista.filter(a => a.situacao.estado === e).length);
  c.innerHTML =
    '<p class="body-sm" id="assResumo">' + escapeHtml(lista.length + ' assinante(s): ' + contagem[0] + ' em dia, ' + contagem[1] + ' atrasada(s), ' + contagem[2] + ' suspensa(s).') + '</p>' +
    (sessionPode('assinatura:vender') && !novaAberta ? '<button class="btn btn-primary" type="button" id="btnAssNova" style="margin-bottom:10px;">+ Nova assinatura</button>' : '') +
    (novaAberta ? formNova() : '') +
    '<div class="field"><label for="assBusca">Buscar cliente</label><input id="assBusca" value="' + escapeHtml(filtro) + '" autocomplete="off"/></div>' +
    (visiveis.length ? visiveis.map(card).join('') : '<p class="body-sm text-tertiary">Nenhum assinante.</p>');
}

async function acao(a, tipo) {
  try {
    if (tipo === 'cancelar') {
      const noFim = window.confirm('Cancelar no fim do ciclo atual? O cliente continua usando até lá.\n\nOK = no fim do ciclo · Cancelar = escolher "agora"');
      if (!noFim && !window.confirm('Cancelar AGORA? O cliente deixa de usar hoje, sem reembolso automático.')) return;
      await api('/assinaturas/' + encodeURIComponent(a.id) + '/cancelar', { method: 'POST', body: { quando: noFim ? 'fim_do_ciclo' : 'agora' } });
      showBanner(noFim ? 'Cancelamento agendado para o fim do ciclo.' : 'Assinatura cancelada.', 'ok');
    } else {
      await api('/assinaturas/' + encodeURIComponent(a.id) + '/' + tipo, { method: 'POST' });
      showBanner(tipo === 'pausar' ? 'Assinatura pausada.' : 'Assinatura retomada.', 'ok');
    }
    await carregarAssinantes();
  } catch (err) { showBanner(err.message, 'error'); }
}

async function pagar(a, cicloInicio) {
  const forma = window.prompt('Forma de pagamento (pix, dinheiro, debito, credito, outro):', 'pix');
  if (forma === null) return;
  try {
    await api('/assinaturas/' + encodeURIComponent(a.id) + '/pagar', { method: 'POST', body: { cicloInicio, forma: forma.trim().toLowerCase() || null } });
    showBanner('Pagamento registrado.', 'ok');
    await carregarAssinantes();
  } catch (err) { showBanner(err.message, 'error'); }
}

async function salvarNova(ev) {
  ev.preventDefault();
  const pago = el('assPagoAgora').checked;
  const body = { clienteId: el('assCliente').value, planoId: el('assPlano').value, inicio: el('assInicio').value, pagamento: pago ? { forma: el('assForma').value } : undefined };
  if (!body.clienteId || !body.planoId) { el('assMsg').textContent = 'Escolha o cliente e o plano.'; return; }
  el('btnAssSalvar').disabled = true;
  try {
    await api('/assinaturas', { method: 'POST', body });
    novaAberta = false;
    showBanner('Assinatura criada.', 'ok');
    await carregarAssinantes();
  } catch (err) { el('assMsg').textContent = err.message; el('btnAssSalvar').disabled = false; }
}

export async function carregarAssinantes() {
  if (!sessionPode('assinatura:ver')) return;
  try {
    [lista, planos] = await Promise.all([api('/assinaturas'), api('/assinaturas/planos')]);
    render();
  } catch (err) { el('assinantesConteudo').textContent = err.message; }
}

export function initAssinantes() {
  if (!sessionPode('assinatura:ver')) return;
  el('subtabBtnAssinantes')?.classList.remove('hidden');
  el('subtabBtnAssinantes')?.addEventListener('click', carregarAssinantes);
  const c = el('assinantesConteudo');
  c.addEventListener('click', ev => {
    const t = ev.target;
    if (t.id === 'btnAssNova') { novaAberta = true; render(); return; }
    if (t.id === 'btnAssCancelarForm') { novaAberta = false; render(); return; }
    const cardEl = t.closest('[data-assinatura]');
    if (!cardEl) return;
    const a = lista.find(x => x.id === cardEl.dataset.assinatura);
    if (t.dataset.assPagar) pagar(a, t.dataset.assPagar);
    if (t.dataset.assAcao) acao(a, t.dataset.assAcao);
  });
  c.addEventListener('change', ev => { if (ev.target.id === 'assPagoAgora') el('assFormaBox').classList.toggle('hidden', !ev.target.checked); });
  c.addEventListener('input', ev => {
    if (ev.target.id !== 'assBusca') return;
    filtro = ev.target.value.trim().toLowerCase();
    const pos = ev.target.selectionStart;
    render();
    const busca = el('assBusca'); busca.focus(); busca.setSelectionRange(pos, pos);
  });
  c.addEventListener('submit', ev => { if (ev.target.id === 'formAssinatura') salvarNova(ev); });
}

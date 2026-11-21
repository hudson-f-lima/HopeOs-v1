// Gestão > Ganhos: comissão e gorjeta do mês por profissional (D-016).
// Profissional vê só os próprios; admin e gestão escolhem o profissional.
// Saldo a pagar e lançamentos (D-017): gestão registra pagamento, vale e estorno;
// cada lançamento é imutável. O profissional só consulta.
import { api } from '../api.js';
import { state, sessionRoleIn, sessionPode } from '../state.js';
import { escapeHtml, centsToBRL, todayStr, genIdempotencyKey, confirmAction } from '../utils.js';
import { reaisParaCentavos } from './caixa.js';
import { atualizarMetas, atualizarRanking, initMetas } from './metas.js';
import { atualizarDesempenho } from './desempenho.js';
import { carregarEquipe, initEquipe } from './metasEquipe.js';

const el = id => document.getElementById(id);
const fmtData = d => { const [, m, dd] = String(d).split('-'); return `${dd}/${m}`; };
export const podeVerMetasGanhos = (total = false) => ['metas:ver', 'ganhos:ver'].some(codigo => sessionPode(codigo, total));

function render(g) {
  const linha = (rotulo, v, id = '') => `<div class="row"${id ? ` id="${id}"` : ''}><span>${escapeHtml(rotulo)}</span><b>${centsToBRL(v)}</b></div>`;
  const temEstorno = g.estornos.quantidade > 0;
  el('ganhosResultado').innerHTML = `
    <div class="row"><span>Atendimentos</span><b id="ganhosAtendimentos">${g.atendimentos}</b></div>
    ${linha('Comissão', g.comissaoCentavos)}
    ${g.assinaturaCentavos ? linha('Comissão de assinaturas (liberada)', g.assinaturaCentavos) : ''}
    ${g.assinaturaPrevistaCentavos ? `<p class="body-sm text-tertiary">Comissão de assinaturas prevista: ${centsToBRL(g.assinaturaPrevistaCentavos)} (libera depois do fim do ciclo de cada assinante).</p>` : ''}
    ${linha('Gorjetas (líquido)', g.gorjetaLiquidaCentavos)}
    ${temEstorno ? linha(`Estornos (${g.estornos.quantidade})`, -(g.estornos.comissaoCentavos + g.estornos.gorjetaCentavos)) : ''}
    <div class="row total"><span>Total do mês</span><b id="ganhosTotal" data-total="${g.totalCentavos}">${centsToBRL(g.totalCentavos)}</b></div>
    ${g.porDia.length ? `<h3 class="body-sm text-tertiary" style="margin:10px 0 4px">Por dia</h3>
      ${g.porDia.map(d => `<div class="row"><span>${fmtData(d.data)} · ${d.atendimentos} atend.</span><b>${centsToBRL(d.comissaoCentavos + d.gorjetaCentavos)}</b></div>`).join('')}`
    : '<p class="empty-state">Nenhuma comanda fechada neste mês.</p>'}
    <p class="list-count-hint">Valores calculados no fechamento de cada comanda.</p>`;
}

const ROTULO = { pagamento: 'Pagamento', vale: 'Vale', estorno: 'Estorno' };
const fmtDia = d => { const [a, m, dd] = String(d).split('-'); return `${dd}/${m}/${a}`; };
let profissionalAtual = null;

function renderSaldo(s) {
  const gestao = sessionPode('ganhos:ver', true);
  const cor = s.saldoCentavos < 0 ? 'var(--md-error)' : 'var(--md-primary)';
  el('ganhosSaldo').innerHTML = `
    <h3 class="body-sm text-tertiary" style="margin:14px 0 4px">Saldo de comissão (histórico inteiro)</h3>
    <div class="row"><span>Ganho acumulado</span><b>${centsToBRL(s.ganhoCentavos)}</b></div>
    <div class="row"><span>Já recebido (pagamentos + vales − estornos)</span><b>${centsToBRL(s.recebidoCentavos)}</b></div>
    <div class="row total"><span>${s.saldoCentavos < 0 ? 'Adiantado (a descontar)' : 'Saldo a pagar'}</span><b id="ganhosSaldoValor" data-saldo="${s.saldoCentavos}" style="color:${cor}">${centsToBRL(s.saldoCentavos)}</b></div>
    ${s.lancamentos.length ? s.lancamentos.map(l => `
      <div class="row" data-lancamento="${escapeHtml(l.id)}" data-tipo="${escapeHtml(l.tipo)}">
        <span>${fmtDia(l.data)} · ${ROTULO[l.tipo] || escapeHtml(l.tipo)}${l.estornado ? ' (estornado)' : ''}${l.observacao ? ` · ${escapeHtml(l.observacao)}` : ''}</span>
        <b>${centsToBRL(l.tipo === 'estorno' ? l.valorCentavos : -l.valorCentavos)}${gestao && l.tipo !== 'estorno' && !l.estornado ? ` <button type="button" class="login-link" data-estornar-pagamento="${escapeHtml(l.id)}">Estornar</button>` : ''}</b>
      </div>`).join('') : '<p class="empty-state">Nenhum pagamento registrado.</p>'}`;
}

async function atualizarSaldo(profissionalId) {
  profissionalAtual = profissionalId || null;
  try {
    const qs = profissionalId ? `?profissionalId=${encodeURIComponent(profissionalId)}` : '';
    renderSaldo(await api(`/comissoes/pagamentos${qs}`));
    if (sessionPode('comissoes:pagar')) el('ganhosPagarForm').classList.remove('hidden');
  } catch (err) {
    el('ganhosSaldo').innerHTML = `<p class="body-sm" style="color:var(--md-error)">${escapeHtml(err.message)}</p>`;
  }
}

let chavePagar = null;
async function registrarPagamento() {
  const msg = el('ganhosPagarMsg');
  msg.textContent = '';
  const valor = reaisParaCentavos(el('ganhosPagarValor').value);
  if (!profissionalAtual) { msg.textContent = 'Escolha um profissional.'; return; }
  if (valor === null || Number.isNaN(valor) || valor <= 0) { msg.textContent = 'Informe o valor. Use, por exemplo, 200,00.'; return; }
  const tipo = el('ganhosPagarTipo').value;
  const ok = await confirmAction({ title: tipo === 'vale' ? 'Registrar vale' : 'Registrar pagamento', message: `Registrar ${centsToBRL(valor)}? O lançamento não pode ser alterado; para corrigir, use "Estornar".`, confirmLabel: 'Registrar' });
  if (!ok) return;
  const botao = el('btnGanhosPagar');
  botao.disabled = true;
  chavePagar = chavePagar || genIdempotencyKey();
  try {
    const body = { profissionalId: profissionalAtual, tipo, valorCentavos: valor, idempotencyKey: chavePagar };
    const obs = el('ganhosPagarObs').value.trim();
    if (obs) body.observacao = obs;
    if (el('ganhosMes').value) body.referenciaMes = el('ganhosMes').value;
    await api('/comissoes/pagamentos', { method: 'POST', body });
    chavePagar = null;
    el('ganhosPagarValor').value = ''; el('ganhosPagarObs').value = '';
    msg.textContent = 'Registrado.';
    await atualizarSaldo(profissionalAtual);
  } catch (err) {
    if (err.status && err.status < 500) chavePagar = null;
    msg.textContent = err.message;
  } finally { botao.disabled = false; }
}

async function estornarLancamento(id) {
  const ok = await confirmAction({ title: 'Estornar lançamento', message: 'O valor volta para o saldo do profissional. O estorno não pode ser desfeito.', confirmLabel: 'Estornar', danger: true });
  if (!ok) return;
  try {
    await api(`/comissoes/pagamentos/${encodeURIComponent(id)}/estorno`, { method: 'POST', body: { observacao: 'Estornado pela gestão', idempotencyKey: genIdempotencyKey() } });
    await atualizarSaldo(profissionalAtual);
  } catch (err) {
    el('ganhosPagarMsg').textContent = err.message;
  }
}

export async function atualizarGanhos() {
  el('desempenhoBloco')?.classList.add('hidden');
  const erro = el('ganhosErro');
  erro.textContent = '';
  const mes = el('ganhosMes').value || todayStr().slice(0, 7);
  const params = new URLSearchParams({ mes });
  const profissionalId = el('ganhosProfissional').value || null;
  if (podeVerMetasGanhos(true)) {
    if (!profissionalId) {
      el('ganhosResultado').innerHTML = '<p class="empty-state">Escolha um profissional.</p>';
      el('ganhosSaldo').innerHTML = '';
      el('ganhosPagarForm').classList.add('hidden');
      el('metasBloco').classList.add('hidden');
      if (sessionPode('ranking:ver')) await atualizarRanking(mes);
      return;
    }
  }
  if (sessionPode('ganhos:ver')) {
    const profissionalGanhos = sessionPode('ganhos:ver', true) ? profissionalId : null;
    if (profissionalGanhos) params.set('profissionalId', profissionalGanhos);
    try {
      render(await api(`/relatorios/meus-ganhos?${params}`));
      await atualizarSaldo(profissionalGanhos);
    } catch (err) {
      el('ganhosResultado').innerHTML = '';
      erro.textContent = err.message;
    }
  } else {
    el('ganhosResultado').replaceChildren();
  }
  if (sessionPode('metas:ver')) await atualizarMetas(mes, profissionalId);
  if (sessionPode('ranking:ver')) await atualizarRanking(mes);
  if (sessionPode('desempenho:ver')) await atualizarDesempenho(mes, sessionPode('desempenho:ver', true) ? profissionalId : null);
}

// Ao abrir a aba Metas / Meu mês.
export function abrirMetas() {
  abrir();
  carregarEquipe(el('ganhosMes').value);
}

function abrir() {
  if (!el('ganhosMes').value) el('ganhosMes').value = todayStr().slice(0, 7);
  if (podeVerMetasGanhos(true)) {
    const select = el('ganhosProfissional');
    const atual = select.value;
    const profs = (state.catalog.profissionais || []).filter(p => p.ativo !== false);
    select.innerHTML = '<option value="">Profissional…</option>' + profs.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nome)}</option>`).join('');
    select.value = profs.some(p => p.id === atual) ? atual : '';
  }
  atualizarGanhos();
}

export function initGanhos() {
  if (!podeVerMetasGanhos()) return;
  // A mesma tela tem entrada na Gestão ou em Minha conta, conforme o alcance da sessão.
  el('navMetas')?.classList.remove('hidden');
  if (podeVerMetasGanhos(true)) {
    el('ganhosProfissionalWrap').classList.remove('hidden');
  } else {
    el('navMetasLabel').textContent = 'Meu mês';
    el('navMetas').setAttribute('aria-label', 'Abrir meu mês');
    el('metasTitulo').textContent = 'Meu mês';
    el('metasSubtitulo').textContent = 'Minhas metas, meus ganhos e meu desempenho.';
  }
  if (!sessionPode('ganhos:ver')) {
    el('ganhosTitulo').classList.add('hidden');
    el('ganhosDescricao').classList.add('hidden');
    if (podeVerMetasGanhos(true)) el('navMetasLabel').textContent = 'Metas';
  } else if (!sessionPode('metas:ver') && podeVerMetasGanhos(true)) {
    el('metasTitulo').textContent = 'Ganhos e comissões';
    el('metasSubtitulo').classList.add('hidden');
    el('navMetasLabel').textContent = 'Ganhos e comissões';
  }
  initEquipe();
  el('ganhosMes').addEventListener('change', () => { atualizarGanhos(); carregarEquipe(el('ganhosMes').value); });
  el('ganhosProfissional').addEventListener('change', atualizarGanhos);
  initMetas();
  el('ganhosPagarForm').addEventListener('submit', ev => { ev.preventDefault(); registrarPagamento(); });
  el('ganhosSaldo').addEventListener('click', ev => {
    const btn = ev.target.closest("[data-estornar-pagamento]");
    if (btn) estornarLancamento(btn.dataset.estornarPagamento);
  });
}

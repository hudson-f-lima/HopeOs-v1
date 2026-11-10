// Gestão > Ganhos: comissão e gorjeta do mês por profissional (D-016).
// Profissional vê só os próprios; admin e gestão escolhem o profissional.
// Só leitura: o sistema calcula o valor, não registra o pagamento da comissão.
import { api } from '../api.js';
import { state, sessionRoleIn } from '../state.js';
import { escapeHtml, centsToBRL, todayStr } from '../utils.js';

const el = id => document.getElementById(id);
const fmtData = d => { const [, m, dd] = String(d).split('-'); return `${dd}/${m}`; };

function render(g) {
  const linha = (rotulo, v, id = '') => `<div class="row"${id ? ` id="${id}"` : ''}><span>${escapeHtml(rotulo)}</span><b>${centsToBRL(v)}</b></div>`;
  const temEstorno = g.estornos.quantidade > 0;
  el('ganhosResultado').innerHTML = `
    <div class="row"><span>Atendimentos</span><b id="ganhosAtendimentos">${g.atendimentos}</b></div>
    ${linha('Comissão', g.comissaoCentavos)}
    ${linha('Gorjetas (líquido)', g.gorjetaLiquidaCentavos)}
    ${temEstorno ? linha(`Estornos (${g.estornos.quantidade})`, -(g.estornos.comissaoCentavos + g.estornos.gorjetaCentavos)) : ''}
    <div class="row total"><span>Total do mês</span><b id="ganhosTotal" data-total="${g.totalCentavos}">${centsToBRL(g.totalCentavos)}</b></div>
    ${g.porDia.length ? `<h3 class="body-sm text-tertiary" style="margin:10px 0 4px">Por dia</h3>
      ${g.porDia.map(d => `<div class="row"><span>${fmtData(d.data)} · ${d.atendimentos} atend.</span><b>${centsToBRL(d.comissaoCentavos + d.gorjetaCentavos)}</b></div>`).join('')}`
    : '<p class="empty-state">Nenhuma comanda fechada neste mês.</p>'}
    <p class="list-count-hint">Valores calculados no fechamento de cada comanda. O pagamento é combinado com o salão e não é registrado aqui.</p>`;
}

export async function atualizarGanhos() {
  const erro = el('ganhosErro');
  erro.textContent = '';
  const mes = el('ganhosMes').value || todayStr().slice(0, 7);
  const params = new URLSearchParams({ mes });
  if (sessionRoleIn('admin', 'gestor')) {
    const profissionalId = el('ganhosProfissional').value;
    if (!profissionalId) { el('ganhosResultado').innerHTML = '<p class="empty-state">Escolha um profissional.</p>'; return; }
    params.set('profissionalId', profissionalId);
  }
  try {
    render(await api(`/relatorios/meus-ganhos?${params}`));
  } catch (err) {
    el('ganhosResultado').innerHTML = '';
    erro.textContent = err.message;
  }
}

function abrir() {
  if (!el('ganhosMes').value) el('ganhosMes').value = todayStr().slice(0, 7);
  if (sessionRoleIn('admin', 'gestor')) {
    const select = el('ganhosProfissional');
    const atual = select.value;
    const profs = (state.catalog.profissionais || []).filter(p => p.ativo !== false);
    select.innerHTML = '<option value="">Profissional…</option>' + profs.map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nome)}</option>`).join('');
    select.value = profs.some(p => p.id === atual) ? atual : '';
  }
  atualizarGanhos();
}

export function initGanhos() {
  if (!sessionRoleIn('admin', 'gestor', 'profissional')) return;
  el('subtabBtnGanhos')?.classList.remove('hidden');
  if (sessionRoleIn('admin', 'gestor')) el('ganhosProfissionalWrap').classList.remove('hidden');
  el('subtabBtnGanhos')?.addEventListener('click', abrir);
  el('ganhosMes').addEventListener('change', atualizarGanhos);
  el('ganhosProfissional').addEventListener('change', atualizarGanhos);
}

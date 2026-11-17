// Agenda → calendário do mês para NAVEGAR (D-050): tocar na data do dia abre o mês; tocar num dia
// leva a agenda para ele. A gestão (fechar, horário especial, datas avulsas, escalas) fica em
// Gestão → Escalas, com o mesmo componente. Aqui também o filtro de vários profissionais.
import { state, loadWeekAgenda, activeProfissionais } from '../state.js';
import { escapeHtml, startOfWeek, showBanner } from '../utils.js';
import { montarCalendario } from './calendarioMes.js';

const el = id => document.getElementById(id);
let cal = null;

export function profsFiltrados() {
  const sel = state.profsVisiveis;
  return !sel || !sel.size ? null : [...sel];
}

async function irPara(data) {
  state.selectedDay = data;
  state.currentWeekStart = startOfWeek(data);
  try { await loadWeekAgenda(); } catch (err) { showBanner('Agenda: ' + err.message, 'error'); }
}

function alternarMes() {
  const painel = el('agMes');
  const abrir = painel.classList.contains('hidden');
  painel.classList.toggle('hidden', !abrir);
  el('btnAgMes').setAttribute('aria-expanded', String(abrir));
  if (!abrir) return;
  if (!cal) cal = montarCalendario(painel, { filtro: profsFiltrados, selecionado: () => state.selectedDay, aoTocarDia: irPara });
  cal.paraMesDe(state.selectedDay);
}

export function desenharFiltro() {
  const box = el('agFiltroProfs');
  if (!box) return;
  const profs = activeProfissionais();
  if (profs.length < 2) { box.innerHTML = ''; return; }
  const sel = state.profsVisiveis || new Set();
  box.innerHTML = '<button type="button" class="chip' + (!sel.size ? ' selected' : '') + '" data-agf="" aria-pressed="' + !sel.size + '">Todos</button>'
    + profs.map(p => '<button type="button" class="chip' + (sel.has(p.id) ? ' selected' : '') + '" data-agf="' + escapeHtml(p.id) + '" aria-pressed="' + sel.has(p.id) + '">' + escapeHtml(p.nome) + '</button>').join('');
}

export function recarregarMesSeAberto() { if (cal && el('agMes') && !el('agMes').classList.contains('hidden')) cal.recarregar(); }

export function initAgendaMes({ aoFiltrar }) {
  if (!el('agMes')) return;
  state.profsVisiveis = state.profsVisiveis || new Set();
  el('btnAgMes').addEventListener('click', alternarMes);
  el('agFiltroProfs').addEventListener('click', ev => {
    const b = ev.target.closest('[data-agf]');
    if (!b) return;
    const id = b.dataset.agf;
    if (!id) state.profsVisiveis.clear();
    else if (state.profsVisiveis.has(id)) state.profsVisiveis.delete(id);
    else state.profsVisiveis.add(id);
    desenharFiltro();
    aoFiltrar();
    recarregarMesSeAberto();
  });
  document.addEventListener('escala:mudou', recarregarMesSeAberto);
}

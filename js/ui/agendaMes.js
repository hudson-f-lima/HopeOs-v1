// Cabeçalho da agenda (D-050, D-053): data → profissionais → grade.
//   - Calendário do mês para NAVEGAR: tocar na data (ou no ícone) abre; tocar num dia leva a agenda
//     para ele. A gestão de datas fica em Gestão → Escalas, com o mesmo componente.
//   - Profissionais: seleção múltipla num painel compacto; o resumo diz quantos estão na grade.
//   - Escopo único: grade, contadores dos dias, total do dia e da semana usam os MESMOS
//     profissionais (profsNaGrade). Profissional com escopo próprio só vê a própria coluna: o
//     servidor não manda os horários dos colegas, então a coluna deles pareceria livre sem estar.
//   - Busca: só nos agendamentos da semana carregada, e a tela diz isso.
//   - Painéis (mês, busca, informações, profissionais) abrem um por vez.
import { state, loadWeekAgenda, activeProfissionais, sessionPode, findClienteNome, findServicoNome, findProfissionalNome } from '../state.js';
import { escapeHtml, startOfWeek, showBanner, weekDates, formatDDMM, WEEKDAY_LABELS } from '../utils.js';
import { montarCalendario } from './calendarioMes.js';

const el = id => document.getElementById(id);
let cal = null;
let aoMudar = () => {};

// Profissional sem visão da agenda toda (D-030): só a coluna dele.
function soProprio() {
  const s = state.session;
  return Boolean(s && s.principal === 'user' && s.role === 'profissional' && s.profissional_id && !sessionPode('agenda:ver', true));
}

// Profissionais que a grade mostra (e que os contadores contam).
export function profsNaGrade() {
  const todos = activeProfissionais();
  if (soProprio()) return todos.filter(p => p.id === state.session.profissional_id);
  const sel = state.profsVisiveis;
  return !sel || !sel.size ? todos : todos.filter(p => sel.has(p.id));
}

export function profsFiltrados() {
  if (soProprio()) return [state.session.profissional_id];
  const sel = state.profsVisiveis;
  return !sel || !sel.size ? null : [...sel];
}

async function irPara(data) {
  state.selectedDay = data;
  state.currentWeekStart = startOfWeek(data);
  fecharPaineis();
  try { await loadWeekAgenda(); } catch (err) { showBanner('Agenda: ' + err.message, 'error'); }
}

const PAINEIS = [['agMes', ['btnAgMes', 'btnAgData']], ['agBusca', ['btnAgBuscar']], ['agInfo', ['btnAgInfo']], ['agFiltroProfs', ['btnAgProfs']]];

function fecharPaineis(exceto) {
  for (const [painel, botoes] of PAINEIS) {
    if (painel === exceto || !el(painel)) continue;
    el(painel).classList.add('hidden');
    botoes.forEach(b => el(b) && el(b).setAttribute('aria-expanded', 'false'));
  }
}

function alternar(painel) {
  const box = el(painel);
  if (!box) return false;
  const abrir = box.classList.contains('hidden');
  fecharPaineis(painel);
  box.classList.toggle('hidden', !abrir);
  PAINEIS.find(([p]) => p === painel)[1].forEach(b => el(b) && el(b).setAttribute('aria-expanded', String(abrir)));
  return abrir;
}

function alternarMes() {
  if (!alternar('agMes')) return;
  if (!cal) cal = montarCalendario(el('agMes'), { filtro: profsFiltrados, selecionado: () => state.selectedDay, aoTocarDia: irPara });
  cal.paraMesDe(state.selectedDay);
}

export function desenharFiltro() {
  const box = el('agFiltroProfs');
  const resumo = el('agProfsResumo');
  const linha = el('btnAgProfs');
  if (!box) return;
  const profs = activeProfissionais();
  const proprio = soProprio();
  // Com um profissional só (ou escopo próprio) não há o que escolher: o resumo diz quem é.
  if (linha) linha.disabled = proprio || profs.length < 2;
  if (proprio || profs.length < 2) {
    box.innerHTML = '';
    box.classList.add('hidden');
    if (resumo) resumo.textContent = proprio ? 'só você' : (profs[0] ? profs[0].nome : 'nenhum ativo');
    return;
  }
  const sel = state.profsVisiveis || new Set();
  const n = profsNaGrade().length;
  if (resumo) resumo.textContent = !sel.size ? 'Todos (' + profs.length + ')' : n + (n === 1 ? ' selecionado' : ' selecionados');
  box.innerHTML = '<button type="button" class="chip' + (!sel.size ? ' selected' : '') + '" data-agf="" aria-pressed="' + !sel.size + '">Todos</button>'
    + profs.map(p => '<button type="button" class="chip' + (sel.has(p.id) ? ' selected' : '') + '" data-agf="' + escapeHtml(p.id) + '" aria-pressed="' + sel.has(p.id) + '">' + (sel.has(p.id) ? '✓ ' : '') + escapeHtml(p.nome) + '</button>').join('');
}

export function recarregarMesSeAberto() { if (cal && el('agMes') && !el('agMes').classList.contains('hidden')) cal.recarregar(); }

// --- Busca na semana carregada --------------------------------------------------------------
const normal = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function desenharBusca() {
  const dias = weekDates(state.currentWeekStart);
  const escopo = el('agBuscaEscopo');
  if (escopo) escopo.textContent = 'Busca nos agendamentos da semana ' + formatDDMM(dias[0]) + '–' + formatDDMM(dias[6]) + ' que você pode ver. Para outra semana, mude a data.';
  const out = el('agBuscaResultado');
  const termo = normal(el('agBuscaTermo').value).trim();
  if (!out) return;
  if (termo.length < 2) { out.innerHTML = '<p class="agx-escopo">Digite ao menos 2 letras.</p>'; return; }
  const digitos = termo.replace(/\D/g, '');
  const clientes = new Map((state.catalog.clientes || []).map(c => [c.id, c]));
  const achados = [];
  for (const d of dias) {
    for (const a of state.weekAgenda[d] || []) {
      if (a.status === 'cancelado' || a.status === 'reagendado') continue;
      const c = clientes.get(a.cliente_id) || {};
      const alvo = normal(findClienteNome(a.cliente_id) + ' ' + findServicoNome(a.servico_id));
      const tel = String(c.whatsapp || c.telefone || '').replace(/\D/g, '');
      if (alvo.includes(termo) || (digitos.length >= 4 && tel.includes(digitos))) achados.push(a);
    }
  }
  achados.sort((x, y) => (x.data + x.horario).localeCompare(y.data + y.horario));
  if (!achados.length) { out.innerHTML = '<p class="agx-escopo">Nada encontrado nesta semana.</p>'; return; }
  out.innerHTML = '<ul class="agx-lista">' + achados.slice(0, 20).map(a => {
    const dt = new Date(a.data + 'T12:00:00');
    return '<li><button type="button" class="agx-achado" data-agb-id="' + escapeHtml(a.id) + '" data-agb-dia="' + escapeHtml(a.data) + '">'
      + '<b>' + WEEKDAY_LABELS[dt.getDay()] + ' ' + formatDDMM(a.data) + ' · ' + escapeHtml(String(a.horario).slice(0, 5)) + '</b> '
      + escapeHtml(findClienteNome(a.cliente_id)) + '<span>' + escapeHtml(findServicoNome(a.servico_id)) + ' · ' + escapeHtml(findProfissionalNome(a.profissional_id)) + '</span></button></li>';
  }).join('') + '</ul>' + (achados.length > 20 ? '<p class="agx-escopo">Mostrando 20 de ' + achados.length + '. Refine a busca.</p>' : '');
}

export function initAgendaMes({ aoFiltrar, aoAbrirAgendamento }) {
  if (!el('agMes')) return;
  aoMudar = aoFiltrar;
  state.profsVisiveis = state.profsVisiveis || new Set();
  el('btnAgMes').addEventListener('click', alternarMes);
  el('btnAgData')?.addEventListener('click', alternarMes);
  el('btnAgInfo')?.addEventListener('click', () => alternar('agInfo'));
  el('btnAgProfs')?.addEventListener('click', () => { desenharFiltro(); alternar('agFiltroProfs'); });
  el('btnAgBuscar')?.addEventListener('click', () => {
    if (alternar('agBusca')) { desenharBusca(); el('agBuscaTermo').focus(); }
  });
  el('agBuscaTermo')?.addEventListener('input', desenharBusca);
  el('agBuscaResultado')?.addEventListener('click', ev => {
    const b = ev.target.closest('[data-agb-id]');
    if (!b) return;
    state.selectedDay = b.dataset.agbDia;
    fecharPaineis();
    aoMudar();
    aoAbrirAgendamento(b.dataset.agbId);
  });
  el('agFiltroProfs').addEventListener('click', ev => {
    const b = ev.target.closest('[data-agf]');
    if (!b) return;
    const id = b.dataset.agf;
    if (!id) state.profsVisiveis.clear();
    else if (state.profsVisiveis.has(id)) state.profsVisiveis.delete(id);
    else state.profsVisiveis.add(id);
    // Todos marcados um a um = "Todos".
    if (state.profsVisiveis.size === activeProfissionais().length) state.profsVisiveis.clear();
    desenharFiltro();
    aoMudar();
    recarregarMesSeAberto();
  });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !document.querySelector('.modal-backdrop:not(.hidden), .sheet-backdrop:not(.hidden), dialog[open]')) fecharPaineis(); });
  document.addEventListener('escala:mudou', recarregarMesSeAberto);
}

// Ao recarregar a semana: busca aberta acompanha.
export function atualizarPaineis() {
  if (el('agBusca') && !el('agBusca').classList.contains('hidden')) desenharBusca();
  desenharFiltro();
}

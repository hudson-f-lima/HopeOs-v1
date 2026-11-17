import { resetClienteRapido, initClienteRapido } from './clienteRapido.js';
import { initAgendaMes, desenharFiltro, recarregarMesSeAberto, profsNaGrade, atualizarPaineis } from './agendaMes.js';
import { htmlCampos, htmlCliente, initCardAgendamento, resetarEditor, confirmarRegras, textoCancelamento, atrasoMin } from './agendaCard.js';
import { bloqueiosDoDia, htmlBloqueios, abrirHorarioLivre, abrirBloqueio, initAgendaBloqueio, htmlFora, foraDaEscala, carregarGradeDia, gradeDoDia } from './agendaBloqueio.js';
import { extrasEscolhidos, resetExtras, abrirOpcoes, acoesDoAtendimento, abrirEtapas } from './atendimento.js';
import { repeticaoEscolhida, resetRepeticao, criarSerieComPrevia, acoesDaSerie, abrirSerie, verSerie } from './series.js';
import { api, getClientReliability, getListaEspera, getAgendaSlots, getAgendaHistorico } from '../api.js';
import { state, stateBus, sessionRoleIn, activeProfissionais, profColor, findClienteNome, findServicoNome, findProfissionalNome, findAgendaItemById, computeEndTime, loadWeekAgenda, PROF_COLORS, sessionPode } from '../state.js';
import {
  todayStr,
  addDays,
  startOfWeek,
  weekDates,
  formatDDMM,
  WEEKDAY_LABELS,
  showBanner,
  clearBanner,
  openModal,
  closeModal,
  confirmAction,
  escapeHtml,
  getInitials,
  waLink,
  centsToBRL
} from '../utils.js';

export const PX_POR_MIN = 3;
export const HORA_INICIO = 8;
export const HORA_FIM = 20;
export const GRID_MIN = 20;
export const SNAP_MIN = 20;
export const TIMELINE_TOTAL_HEIGHT = (HORA_FIM - HORA_INICIO) * 60 * PX_POR_MIN;

export const AGENDA_STATUS_META = {
  agendado: { label: 'Agendado', cls: 'badge' },
  confirmado: { label: 'Confirmado', cls: 'badge badge-confirmado' },
  no_show: { label: 'No-show', cls: 'badge badge-noshow' },
  cancelado: { label: 'Cancelado', cls: 'badge badge-cancelado' },
  aguardando: { label: 'Chegou', cls: 'badge badge-confirmado' },
  em_atendimento: { label: 'Na cadeira', cls: 'badge badge-confirmado' },
  concluido: { label: 'Concluído', cls: 'badge badge-concluido' },
  reagendado: { label: 'Reagendado', cls: 'badge badge-cancelado' }
};

const SERVICE_COLORS = {
  'corte':      { bg: '#1976d2', border: '#0d47a1' },
  'barba':      { bg: '#0d47a1', border: '#01579b' },
  'manicure':   { bg: '#e91e8c', border: '#880e4f' },
  'pedicure':   { bg: '#e91e8c', border: '#880e4f' },
  'coloracao':  { bg: '#f57c00', border: '#e65100' },
  'quimica':    { bg: '#f57c00', border: '#e65100' },
  'estetica':   { bg: '#2e7d32', border: '#1b5e20' },
  'tratamento': { bg: '#2e7d32', border: '#1b5e20' },
  'default':    { bg: '#546e7a', border: '#37474f' }
};

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function toTop(hora, minuto) { return ((hora - HORA_INICIO) * 60 + minuto) * PX_POR_MIN; }
function toHeight(duracaoMin) { return duracaoMin * PX_POR_MIN; }

// Contadores e grade com o MESMO escopo (D-053): ativos dos profissionais que a grade mostra.
function activeAgendaItemsForDate(dateStr) {
  const ids = new Set(profsNaGrade().map(p => p.id));
  return (state.weekAgenda[dateStr] || []).filter(i => i.status !== 'cancelado' && i.status !== 'reagendado' && ids.has(i.profissional_id));
}


function formatAgendaDate(dateStr) {
  const dt = new Date(dateStr + 'T12:00:00');
  return `${WEEKDAY_LABELS[dt.getDay()]}, ${dt.getDate()} de ${MONTH_LABELS[dt.getMonth()]}`;
}

function profItemsForDay(profId) {
  return (state.weekAgenda[state.selectedDay] || []).filter(
    i => i.profissional_id === profId && i.status !== 'cancelado' && i.status !== 'reagendado'
  );
}

function itemStartMinutes(item) {
  const [h, m] = String(item.horario).slice(0, 5).split(':').map(Number);
  return (h - HORA_INICIO) * 60 + m;
}

function minutesSinceStartToHHMM(m) {
  const totalMin = HORA_INICIO * 60 + m;
  return String(Math.floor(totalMin / 60)).padStart(2, '0') + ':' + String(totalMin % 60).padStart(2, '0');
}

function emptySlotsForProf(profId) {
  const occupied = profItemsForDay(profId).map(i => {
    const start = itemStartMinutes(i);
    return [start, start + (i.duracao_min || 30)];
  });
  // Bloqueio e ausência (D-046): o trecho não é oferecido como livre.
  for (const b of bloqueiosDoDia(profId, state.selectedDay)) occupied.push([b.ini - HORA_INICIO * 60, b.fim - HORA_INICIO * 60]);
  const totalMin = (HORA_FIM - HORA_INICIO) * 60;
  const slots = [];
  for (let m = 0; m < totalMin; m += GRID_MIN) {
    const slotEnd = m + GRID_MIN;
    if (!occupied.some(([s, e]) => m < e && slotEnd > s)) slots.push(m);
  }
  return slots;
}

function getServiceColor(ag) {
  const servico = state.catalog.servicos.find(s => s.id === ag.servico_id || s.id === ag.servicoId);
  if (!servico) return SERVICE_COLORS.default;
  const cat = (servico.categoria || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  for (const key of Object.keys(SERVICE_COLORS)) {
    if (key !== 'default' && cat.includes(key)) {
      return SERVICE_COLORS[key];
    }
  }
  return SERVICE_COLORS.default;
}

function renderAgBlock(item, color) {
  const top = itemStartMinutes(item) * PX_POR_MIN;
  const duracao = item.duracao_min || 30;
  const height = toHeight(duracao);
  const horario = String(item.horario).slice(0, 5);
  const compact = height < 40;
  let opacity = 1;
  if (item.status === 'no_show') opacity = 0.55;
  if (item.status === 'concluido') opacity = 0.7;

  const sColor = getServiceColor(item);
  // Conflito visível (D-050): agendamento fora do horário de trabalho do dia ou sobre bloqueio.
  // Fica marcado até alguém resolver (remarcar ou cancelar); nada é movido sozinho.
  const iniDia = HORA_INICIO * 60 + itemStartMinutes(item);
  const ativo = !['concluido', 'no_show', 'cancelado', 'reagendado'].includes(item.status);
  const conflito = ativo && (foraDaEscala(item.profissional_id, state.selectedDay, iniDia, iniDia + duracao)
    ? 'fora da escala'
    : bloqueiosDoDia(item.profissional_id, state.selectedDay).some(b => iniDia < b.fim && iniDia + duracao > b.ini) ? 'sobre bloqueio' : '');
  const line2 = compact ? '' : `<div class="ag-line2" class="pointer-none">${escapeHtml(findServicoNome(item.servico_id))}</div>`;
  
  const isEditable = !['concluido', 'no_show'].includes(item.status);
  const dragHtml = isEditable ? `<div class="drag-handle" data-ag-id="${item.id}"></div>` : '';
  const resizeHtml = isEditable ? `<div class="resize-handle" data-ag-id="${item.id}"></div>` : '';

  return `
    <div class="ag-block ${compact ? 'compact' : ''}${conflito ? ' ag-conflito' : ''}" 
         style="top:${top}px;height:${height}px;background:${sColor.bg};border-left:4px solid ${sColor.border};color:#ffffff;opacity:${opacity};position:absolute;box-sizing:border-box;" 
         data-action="open-sheet" 
         data-id="${item.id}"
         data-ag-id="${item.id}">
      ${dragHtml}
      <div class="ag-line1" style="pointer-events:none;padding-top:${isEditable ? '12px' : '4px'};">${conflito ? '<span class="ag-conf-tag">⚠ ' + conflito + '</span> ' : ''}${horario} ${escapeHtml(findClienteNome(item.cliente_id))}</div>
      ${line2}
      ${resizeHtml}
    </div>`;
}

function renderProfColInner(p) {
  const color = profColor(p.id);
  const emptyHtml = emptySlotsForProf(p.id).map(m => {
    const timeStr = minutesSinceStartToHHMM(m);
    const ini = HORA_INICIO * 60 + m;
    const fora = foraDaEscala(p.id, state.selectedDay, ini, ini + GRID_MIN) ? ' fora' : '';
    return `<div class="slot-vazio${fora}" style="top:${m * PX_POR_MIN}px;height:${GRID_MIN * PX_POR_MIN}px;" data-action="add-slot" data-prof="${p.id}" data-time="${timeStr}"></div>`;
  }).join('');
  const foraHtml = htmlFora(p.id, state.selectedDay, { horaInicio: HORA_INICIO, horaFim: HORA_FIM, pxPorMin: PX_POR_MIN });
  const blocksHtml = profItemsForDay(p.id).map(item => renderAgBlock(item, color)).join('');
  return foraHtml + emptyHtml + htmlBloqueios(p.id, state.selectedDay, { horaInicio: HORA_INICIO, horaFim: HORA_FIM, pxPorMin: PX_POR_MIN }) + blocksHtml;
}

export function renderTimeline() {
  const container = document.getElementById('agendaGrid');
  if (!container) return;
  // Filtro de vários profissionais (D-050) e escopo próprio do profissional (D-053).
  const profs = profsNaGrade();

  if (!profs.length) {
    container.innerHTML = '<div style="padding:16px;font-size:13px;color:var(--md-outline);grid-column: 1 / -1;">Nenhum profissional ativo.</div>';
    return;
  }
  
  container.style.setProperty('--prof-count', profs.length);

  let html = '';
  // Corner
  html += `<div class="agenda-grid-corner"></div>`;
  
  // Headers
  html += profs.map((p, i) => {
    const color = PROF_COLORS[i % PROF_COLORS.length];
    const initials = getInitials(p.nome);
    const firstName = p.nome ? p.nome.split(' ')[0] : '?';
    const count = profItemsForDay(p.id).length;
    return `<div class="agenda-grid-header" data-prof="${p.id}" style="grid-column: ${i + 2};">
        <div class="timeline-avatar" style="background:${color};">${initials}</div>
        <div class="timeline-prof-info">
          <div class="timeline-prof-name" style="color:${color};">${escapeHtml(firstName)}</div>
          <div class="timeline-prof-count">${count} agend. no dia</div>
        </div>
      </div>`;
  }).join('');

  // Ruler
  html += `<div class="agenda-grid-ruler" style="height:${TIMELINE_TOTAL_HEIGHT}px;">`;
  const totalMin = (HORA_FIM - HORA_INICIO) * 60;
  for (let m = 0; m <= totalMin; m += GRID_MIN) {
    html += `<div class="ruler-mark" style="top:${m * PX_POR_MIN}px;">${minutesSinceStartToHHMM(m)}</div>`;
  }
  html += `</div>`;

  // Grid Lines Background (spans all columns)
  html += `<div class="agenda-grid-lines" style="height:${TIMELINE_TOTAL_HEIGHT}px;">`;
  for (let m = 0; m <= totalMin; m += 30) {
    const cls = m % 60 === 0 ? 'grid-line-hour' : 'grid-line-half';
    html += `<div class="${cls}" style="top:${m * PX_POR_MIN}px;"></div>`;
  }
  html += `</div>`;

  // Prof Columns
  html += profs.map((p, i) => {
    return `<div class="agenda-grid-col" data-prof-id="${p.id}" style="grid-column: ${i + 2}; height:${TIMELINE_TOTAL_HEIGHT}px;">${renderProfColInner(p)}</div>`;
  }).join('');

  container.innerHTML = html;

  positionRedline();
  // Fora da escala (D-047): a grade do dia chega do servidor e a tela redesenha uma vez.
  const dia = state.selectedDay;
  if (!gradeDoDia(dia)) carregarGradeDia(dia).then(ok => { if (ok && state.selectedDay === dia) renderTimeline(); });
}

export function positionRedline() {
  const linesContainer = document.querySelector('.agenda-grid-lines');
  if (!linesContainer) return;
  let line = linesContainer.querySelector('.timeline-redline-abs');
  if (state.selectedDay !== todayStr()) {
    if (line) line.remove();
    return;
  }
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin < HORA_INICIO * 60 || nowMin > HORA_FIM * 60) {
    if (line) line.remove();
    return;
  }
  const top = (nowMin - HORA_INICIO * 60) * PX_POR_MIN;
  if (!line) {
    line = document.createElement('div');
    line.className = 'timeline-redline-abs';
    linesContainer.appendChild(line);
  }
  line.style.top = top + 'px';
}

export function renderWeekStats() {
  const dates = weekDates(state.currentWeekStart);
  const naSemana = dates.reduce((t, d) => t + activeAgendaItemsForDate(d).length, 0);
  const noDia = activeAgendaItemsForDate(state.selectedDay).length;
  const nProfs = profsNaGrade().length;
  const quem = nProfs === activeProfissionais().length ? 'de todos os profissionais' : (nProfs === 1 ? 'de 1 profissional' : `de ${nProfs} profissionais`);
  const set = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  set('weekRangeLabel', `${formatDDMM(dates[0])} - ${formatDDMM(dates[6])}`);
  set('agendaDateLabel', formatAgendaDate(state.selectedDay));
  // O total diz o escopo: dia escolhido e profissionais na grade.
  set('dayCountLabel', `${noDia} agend. no dia`);
  const dia = document.getElementById('dayCountLabel');
  if (dia) dia.title = `${noDia} agendamento(s) ativo(s) em ${formatDDMM(state.selectedDay)}, ${quem} na grade.`;
  set('weekCountLabel', `Semana ${formatDDMM(dates[0])}–${formatDDMM(dates[6])}: ${naSemana} agend. ${quem}.`
    + (state.agendaFalhas ? ` ${state.agendaFalhas} dia(s) não carregaram: o total pode estar incompleto.` : ''));
  const hoje = document.getElementById('btnAgendaToday');
  if (hoje) hoje.classList.toggle('agx-hoje-ativo', state.selectedDay === todayStr());
}

export function renderDayPills() {
  const dates = weekDates(state.currentWeekStart);
  const dayPills = document.getElementById('dayPills');
  if (!dayPills) return;
  const hoje = todayStr();
  dayPills.innerHTML = dates.map(d => {
    const dt = new Date(d + 'T12:00:00');
    const count = activeAgendaItemsForDate(d).length;
    const isSelected = d === state.selectedDay;
    // Semana compacta: dia da semana e número; o ponto diz que há agendamento (o número exato no rótulo).
    return `<button type="button" class="day-pill ${isSelected ? 'selected' : ''}${d === hoje ? ' hoje' : ''}" data-day="${d}" aria-pressed="${isSelected}" aria-label="${WEEKDAY_LABELS[dt.getDay()]} ${dt.getDate()}: ${count} agendamento(s)">
      <span class="pill-weekday">${WEEKDAY_LABELS[dt.getDay()]}</span>
      <span class="pill-daynum">${dt.getDate()}</span>
      <span class="pill-occ${count ? ' tem' : ''}" aria-hidden="true">${count || ''}</span>
    </button>`;
  }).join('');
}

export function shiftWeek(deltaWeeks) {
  const offsetDays = Math.round((new Date(state.selectedDay + 'T12:00:00') - new Date(state.currentWeekStart + 'T12:00:00')) / 86400000);
  state.currentWeekStart = addDays(state.currentWeekStart, deltaWeeks * 7);
  state.selectedDay = addDays(state.currentWeekStart, offsetDays);
  loadWeekAgenda().catch(err => showBanner('Agenda: ' + err.message, 'error'));
}

export function computeDefaultHorario(dateStr) {
  if (dateStr !== todayStr()) return '09:00';
  const d = new Date();
  let h = d.getHours();
  let m = d.getMinutes() < 30 ? 30 : 0;
  if (m === 0) h += 1;
  if (h > 22) { h = 9; }
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function updateNovoAgendamentoPreview() {
  const servicoId = state.fuzzyAgServico.getValue();
  const horario = document.getElementById('agHorario').value;
  const el = document.getElementById('agDuracaoPreview');
  if (!el) return;
  if (!servicoId || !horario) { el.textContent = ''; return; }
  const duracao = duracaoNovoAgendamento(servicoId, state.fuzzyAgProfissional.getValue());
  const [h, m] = horario.split(':').map(Number);
  const endTotalMin = h * 60 + m + duracao;
  const endStr = String(Math.floor(endTotalMin / 60) % 24).padStart(2, '0') + ':' + String(endTotalMin % 60).padStart(2, '0');
  const ultrapassa = endTotalMin > HORA_FIM * 60;
  el.textContent = `Este serviço ocupa ${duracao} minutos (até ${endStr}).` + (ultrapassa ? ' Atenção: ultrapassa o horário de funcionamento (20:00).' : '');
  el.style.color = ultrapassa ? 'var(--md-error)' : 'var(--md-outline)';
}

function openNovoAgendamentoModal(dateStr, horario, profissionalId) {
  const date = dateStr || state.selectedDay || todayStr();

  state.fuzzyAgCliente.clear();
  resetClienteRapido();
  avisarReguaCliente(null);
  state.fuzzyAgServico.setItems(state.catalog.servicos.filter(s => s.ativo !== false));
  state.fuzzyAgServico.clear();
  state.fuzzyAgProfissional.setItems(state.catalog.profissionais.filter(p => p.ativo !== false));

  if (profissionalId) {
    state.fuzzyAgProfissional.setValue(profissionalId);
    const links = state.catalog.profissional_servicos || [];
    const linkedServiceIds = links.filter(l => l.profissional_id === profissionalId).map(l => l.servico_id);
    state.fuzzyAgServico.setItems(state.catalog.servicos.filter(s => s.ativo !== false && linkedServiceIds.includes(s.id)));
  } else {
    state.fuzzyAgProfissional.clear();
  }

  document.getElementById('agData').value = date;
  document.getElementById('agHorario').value = horario || computeDefaultHorario(date);
  updateNovoAgendamentoPreview();
  refreshAgendaSlots();
  openModal('modalNovoAgendamento');
}

// --- Sugestão de horários (GET /agenda/slots) ------------------------------
// O backend calcula os slots e a duração efetiva (com override do profissional).
// A UI só exibe; o POST /agenda revalida conflito na gravação.
let slotsReqSeq = 0;

function slotsKey(servicoId, profissionalId, data) {
  return [servicoId, profissionalId, data].join('|');
}

// Duração usada na prévia e na checagem local de conflito: a do backend quando
// os slots da mesma seleção já chegaram; senão a do serviço.
function duracaoNovoAgendamento(servicoId, profissionalId) {
  const data = document.getElementById('agData').value;
  const info = state.agSlotsInfo;
  if (info && info.key === slotsKey(servicoId, profissionalId, data)) return info.duracaoMin;
  const servico = state.catalog.servicos.find(s => s.id === servicoId);
  return servico ? (servico.duracao_min || 30) : 30;
}

function renderAgendaSlots(el, result) {
  const todos = result.slots || [];
  if (!result.janela) {
    // D-033: o servidor diz a origem (unidade fechada, folga, escala não publicada...).
    const motivo = (result.disponibilidade && result.disponibilidade.origem) || 'Sem expediente configurado para este profissional neste dia';
    el.innerHTML = `<span class="ag-slots-msg">${escapeHtml(motivo)}.</span>`;
    return;
  }
  if (!todos.length) {
    el.innerHTML = '<span class="ag-slots-msg">Sem horários livres neste dia.</span>';
    return;
  }
  const verTodos = el.dataset.verTodos === '1';
  const visiveis = verTodos ? todos : todos.filter(s => s.recomendado);
  const atual = document.getElementById('agHorario').value;
  const chips = visiveis.map(s => `
    <button type="button" class="chip ag-slot${s.recomendado ? ' recomendado' : ''}${s.horario === atual ? ' selected' : ''}"
      data-horario="${escapeHtml(s.horario)}" title="${s.recomendado ? 'Encaixe ideal: não deixa buraco na agenda' : `Livre até ${escapeHtml(s.fim)}`}">
      ${s.recomendado ? '★ ' : ''}${escapeHtml(s.horario)}
    </button>`).join('');
  const restantes = todos.length - todos.filter(s => s.recomendado).length;
  const toggle = restantes > 0
    ? `<button type="button" class="ag-slots-toggle" data-toggle="1">${verTodos ? 'Só encaixes ideais' : `Ver todos (${todos.length})`}</button>`
    : '';
  el.innerHTML = `<span class="ag-slots-msg">${verTodos ? 'Horários livres' : 'Encaixes ideais'} · ${result.duracaoMin} min</span><div class="ag-slots-list">${chips}</div>${toggle}`;
}

export async function refreshAgendaSlots() {
  const el = document.getElementById('agSlots');
  if (!el) return;
  const servicoId = state.fuzzyAgServico.getValue();
  const profissionalId = state.fuzzyAgProfissional.getValue();
  const data = document.getElementById('agData').value;
  const seq = ++slotsReqSeq;
  state.agSlotsInfo = null;
  if (!servicoId || !profissionalId || !data) {
    el.innerHTML = '';
    el.dataset.verTodos = '';
    return;
  }
  el.innerHTML = '<span class="ag-slots-msg">Buscando horários livres…</span>';
  try {
    const result = await getAgendaSlots({ data, profissionalId, servicoId });
    if (seq !== slotsReqSeq) return; // resposta de uma seleção antiga
    state.agSlotsInfo = { key: slotsKey(servicoId, profissionalId, data), duracaoMin: result.duracaoMin, result };
    renderAgendaSlots(el, result);
    updateNovoAgendamentoPreview();
  } catch (err) {
    if (seq !== slotsReqSeq) return;
    el.innerHTML = '<span class="ag-slots-msg">Sugestões indisponíveis. Informe o horário manualmente.</span>';
  }
}

function onAgendaSlotsClick(ev) {
  const el = document.getElementById('agSlots');
  const btn = ev.target.closest('button');
  if (!btn || !el.contains(btn)) return;
  if (btn.dataset.toggle) {
    el.dataset.verTodos = el.dataset.verTodos === '1' ? '' : '1';
  } else if (btn.dataset.horario) {
    document.getElementById('agHorario').value = btn.dataset.horario;
    updateNovoAgendamentoPreview();
  }
  if (state.agSlotsInfo) renderAgendaSlots(el, state.agSlotsInfo.result);
}

function closeNovoAgendamentoModal() {
  closeModal('modalNovoAgendamento');
}

function openReagendarModal(item) {
  state.reagendarAlvoId = item.id;

  const profissionalAtualId = item.profissional_id || item.profissionalId || '';
  const servicoAtualId = item.servico_id || item.servicoId || '';
  const links = state.catalog.profissional_servicos || [];

  const linkedServiceIds = links.filter(l => l.profissional_id === profissionalAtualId).map(l => l.servico_id);
  state.fuzzyReNovoServico.setItems(state.catalog.servicos.filter(s => s.ativo !== false && linkedServiceIds.includes(s.id)));
  state.fuzzyReNovoServico.clear();

  const linkedProfIds = links.filter(l => l.servico_id === servicoAtualId).map(l => l.profissional_id);
  state.fuzzyReNovoProfissional.setItems(state.catalog.profissionais.filter(p => p.ativo !== false && linkedProfIds.includes(p.id)));
  state.fuzzyReNovoProfissional.clear();

  document.getElementById('reNovaData').value = item.data;
  document.getElementById('reNovoHorario').value = String(item.horario || '').slice(0, 5);
  openModal('modalReagendar');
}

function closeReagendarModal() {
  closeModal('modalReagendar');
  state.reagendarAlvoId = null;
}

// Fora da disponibilidade (D-033): o servidor recusa; quem pode encaixar decide forçar.
async function confirmarForaDaDisponibilidade(err) {
  if (err.code !== 'FORA_DA_DISPONIBILIDADE' || !sessionPode('agenda:encaixar')) return false;
  return confirmAction({ title: 'Fora do horário', message: `${err.message} Agendar mesmo assim? Fica registrado como encaixe.`, confirmLabel: 'Agendar mesmo assim' });
}

async function criarAgendamento(clienteId, servicoId, profissionalId, data, horario, permitirConflito, foraDaDisponibilidade = false, aceitarAvisos = false) {
  clearBanner();
  try {
    await api('/agenda', { method: 'POST', body: { clienteId, servicoId, profissionalId, data, horario, permitirConflito: !!permitirConflito, foraDaDisponibilidade, aceitarAvisos } });
    closeNovoAgendamentoModal();
    showBanner('Agendamento criado.', 'ok');
    await loadWeekAgenda();
  } catch (err) {
    if (!foraDaDisponibilidade && await confirmarForaDaDisponibilidade(err)) return criarAgendamento(clienteId, servicoId, profissionalId, data, horario, permitirConflito, true, aceitarAvisos);
    if (!aceitarAvisos && await confirmarRegras(err)) return criarAgendamento(clienteId, servicoId, profissionalId, data, horario, permitirConflito, foraDaDisponibilidade, true);
    showBanner(err.message, 'error');
  }
}

function openActionSheet(item) {
  const meta = AGENDA_STATUS_META[item.status] || { label: item.status, cls: 'badge' };
  const horario = String(item.horario || '').slice(0, 5);
  let actionsHtml = '';
  // Transições permitidas espelham a máquina de estados do backend (agenda.validator.js).
  // A ação principal (checkout) vem primeiro e larga; as outras em grade de botões menores.
  const checkout = '<button class="btn primary" data-sheet-action="checkout">Fazer checkout</button>';
  if (item.status === 'agendado') {
    actionsHtml = checkout + `
      <button class="btn" data-sheet-action="confirmar">Confirmar</button>
      <button class="btn" data-sheet-action="chegou">Cliente chegou</button>
      <button class="btn danger" data-sheet-action="noshow">No-show</button>
      <button class="btn danger" data-sheet-action="cancelar">Cancelar</button>`;
  } else if (item.status === 'confirmado') {
    actionsHtml = checkout + `
      <button class="btn" data-sheet-action="chegou">Cliente chegou</button>
      <button class="btn danger" data-sheet-action="noshow">No-show</button>
      <button class="btn danger agc-largo" data-sheet-action="cancelar">Cancelar</button>`;
  } else if (item.status === 'aguardando') {
    actionsHtml = checkout + `
      <button class="btn" data-sheet-action="cadeira">Iniciar atendimento</button>
      <button class="btn danger" data-sheet-action="cancelar">Cancelar</button>`;
  } else if (item.status === 'em_atendimento') {
    actionsHtml = checkout;
  } else if (item.status === 'concluido') {
    actionsHtml = `<p class="agc-feito">✓ Checkout feito</p>`;
  }

  resetarEditor();
  // Atraso (D-049): passou do alerta configurado e o cliente não chegou → destaca o no-show.
  const atraso = atrasoMin(item);
  if (atraso) actionsHtml = actionsHtml.replace('class="btn danger" data-sheet-action="noshow"', 'class="btn danger agc-destaque" data-sheet-action="noshow"');
  document.getElementById('actionSheetContent').innerHTML = `
    <div class="agc-head">
      <h2 class="agc-cliente">${htmlCliente(item)}</h2>
      <span class="${escapeHtml(meta.cls)}">${escapeHtml(meta.label)}</span>
    </div>
    <div class="agc-sub"><span class="agc-hora">${horario}–${computeEndTime(item)}${atraso ? ` <span class="agc-atraso" role="status">⏱ atrasado ${atraso} min</span>` : ''}</span>
      <span class="agc-conf" id="reliabilityRow">Confiabilidade <b id="reliabilityValue">…</b></span></div>
    ${htmlCampos(item)}
    <p class="body-sm hidden agc-plano" id="sheetPlano" role="status"></p>
    <div class="sheet-actions agc-acoes">${actionsHtml}${acoesDaSerie(item)}${acoesDoAtendimento(item)}</div>
    <details class="sheet-historico" id="historicoDetails">
      <summary>Histórico</summary>
      <div id="historicoBody" class="sheet-historico-body">Carregando…</div>
    </details>
  `;
  document.getElementById('actionSheet').dataset.agendaId = item.id;
  const details = document.getElementById('historicoDetails');
  details.addEventListener('toggle', () => { if (details.open && !details.dataset.loaded) loadHistorico(item.id); });
  openModal('actionSheet');
  loadReliabilityBadge(item.cliente_id);
  carregarSeloPlano(item);
}

// Selo do plano de assinatura no card (D-043): "Plano X: coberto (2 de 4)" ou o motivo de não
// cobrir. Só leitura; quem não pode ver assinaturas não vê o selo.
async function carregarSeloPlano(item) {
  const el = document.getElementById('sheetPlano');
  if (!el || !item.cliente_id || !item.servico_id || !item.profissional_id || !sessionPode('assinatura:ver')) return;
  try {
    const q = new URLSearchParams({ clienteId: item.cliente_id, servicoId: item.servico_id, profissionalId: item.profissional_id, data: item.data, horario: String(item.horario).slice(0, 5) });
    const cob = await api('/assinaturas/cobertura?' + q.toString());
    const m = cob && cob.melhor;
    if (!m || document.getElementById('sheetPlano') !== el) return;
    const u = m.usoDoCiclo;
    let texto;
    if (m.situacaoUso === 'coberto') texto = 'coberto' + (u && u.limite ? ' (' + (u.usados + 1) + ' de ' + u.limite + ')' : '');
    else if (m.situacaoUso === 'fora_da_regra' && m.cobrarCentavos < m.precoTabelaCentavos) texto = 'fora da regra: cobra ' + centsToBRL(m.cobrarCentavos) + (m.consomeUso ? ' e gasta 1 uso' : '');
    else texto = 'não cobre — ' + ((m.motivos && m.motivos[0] && m.motivos[0].texto) || m.situacaoUso);
    el.textContent = '★ Assinante · Plano ' + m.planoNome + ': ' + texto + (m.aviso ? ' (' + m.aviso + ')' : '');
    el.classList.remove('hidden');
  } catch (_) { /* selo é informativo: sem ele o card continua igual */ }
}

// Trilha de status (GET /agenda/:id/historico). Só leitura; carrega ao abrir.
const HISTORICO_ORIGEM = { troca_cliente: 'troca de cliente', checkout: 'checkout', reagendamento: 'reagendamento' };
function statusLabel(s) {
  if (s === null || s === undefined) return '—';
  return (AGENDA_STATUS_META[s] && AGENDA_STATUS_META[s].label) || String(s);
}
function formatQuando(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function historicoLinha(ev) {
  let texto;
  if (ev.tipo === 'duracao') texto = `Duração ${ev.de ?? '—'} → ${ev.para ?? '—'} min`;
  else if (ev.tipo === 'criado') texto = `Criado · ${statusLabel(ev.para)}`;
  else if (ev.tipo === 'reagendado' && ev.reagendadoDe) texto = `Criado por reagendamento · ${statusLabel(ev.para)}`;
  else if (ev.tipo === 'cliente_corrigido') texto = 'Cliente corrigido (engano de cadastro)';
  else if (ev.tipo === 'vaga_repassada') texto = 'Vaga repassada a outro cliente (não conta como falta)';
  else texto = `${statusLabel(ev.de)} → ${statusLabel(ev.para)}`;
  const origem = HISTORICO_ORIGEM[ev.origem] ? ` (${HISTORICO_ORIGEM[ev.origem]})` : '';
  const quem = ev.ator && ev.ator.nome ? ev.ator.nome : (ev.ator && ev.ator.tipo === 'integration' ? 'Integração' : '');
  return `<li class="sheet-historico-item" data-historico-para="${escapeHtml(String(ev.para ?? ''))}">
    <span class="sheet-historico-quando">${escapeHtml(formatQuando(ev.quando))}</span>
    <span>${escapeHtml(texto + origem)}</span>
    ${quem ? `<span class="sheet-historico-quem">${escapeHtml(quem)}</span>` : ''}
  </li>`;
}
async function loadHistorico(agendamentoId) {
  const body = document.getElementById('historicoBody');
  const details = document.getElementById('historicoDetails');
  if (!body || !details) return;
  try {
    const r = await getAgendaHistorico(agendamentoId);
    if (document.getElementById('historicoBody') !== body) return; // sheet trocou de item
    details.dataset.loaded = '1';
    const eventos = (r && r.eventos) || [];
    body.innerHTML = eventos.length
      ? `<ul class="sheet-historico-lista">${eventos.map(historicoLinha).join('')}</ul>`
      : '<p class="sheet-historico-vazio">Sem histórico registrado (agendamentos anteriores à trilha não têm eventos).</p>';
  } catch (err) {
    if (document.getElementById('historicoBody') === body) body.textContent = 'Não foi possível carregar o histórico.';
  }
}

function reliabilityColor(faixa) {
  if (faixa === 'confiavel') return '#22c55e';
  if (faixa === 'normal') return '#2563eb';
  if (faixa === 'atencao') return '#f59e0b';
  return '#ef4444'; // risco
}

const RELIABILITY_LABEL = { confiavel: 'Confiável', normal: 'Normal', atencao: 'Atenção', risco: 'Risco' };

// F4.5: shadow mode — só exibe score/fatores, nunca bloqueia nenhuma ação do sheet.
async function loadReliabilityBadge(clienteId) {
  const valueEl = document.getElementById('reliabilityValue');
  const rowEl = document.getElementById('reliabilityRow');
  if (!valueEl || !rowEl) return;
  if (!clienteId) { rowEl.classList.add('hidden'); return; }
  try {
    const r = await getClientReliability(clienteId);
    if (document.getElementById('reliabilityValue') !== valueEl) return; // sheet trocou de item enquanto carregava
    const label = RELIABILITY_LABEL[r.faixa] || r.faixa;
    valueEl.textContent = `${r.score} · ${label}`;
    valueEl.style.color = reliabilityColor(r.faixa);
    valueEl.title = `No-shows (365d): ${r.fatores.noShows365d} · Cancelamentos tardios: ${r.fatores.cancelTardios365d} · Sequência de comparecimentos: ${r.fatores.streakConcluidos}`;
    if (r.regua && ['alerta', 'exigir_sinal'].includes(r.regua.nivel)) valueEl.textContent += ` · ⚠ ${r.regua.faltasSeguidas} faltas seguidas`;
  } catch (err) {
    rowEl.classList.add('hidden');
  }
}

// Régua de faltas (só alerta): avisa ao escolher o cliente no novo agendamento.
export async function avisarReguaCliente(clienteId) {
  const aviso = document.getElementById('agReguaAviso');
  if (!aviso) return;
  aviso.className = 'regua-aviso hidden';
  if (!clienteId) return;
  try {
    const r = await getClientReliability(clienteId);
    if (!r.regua || !['alerta', 'exigir_sinal'].includes(r.regua.nivel)) return;
    aviso.textContent = r.regua.mensagem;
    aviso.className = `regua-aviso ${r.regua.nivel}`;
  } catch {
    // Sem permissão de relatório (profissional) ou falha: agendar segue normal.
  }
}

function closeActionSheet() {
  closeModal('actionSheet');
}

async function onActionSheetClick(ev) {
  const btn = ev.target.closest('[data-sheet-action]');
  if (!btn) return;
  const id = document.getElementById('actionSheet').dataset.agendaId;
  const item = findAgendaItemById(id);
  const action = btn.dataset.sheetAction;

  if (action === 'confirmar') { closeActionSheet(); await patchAgendaStatus(id, 'confirmado'); return; }
  if (action === 'chegou') { closeActionSheet(); await patchAgendaStatus(id, 'aguardando'); return; }
  if (action === 'cadeira') { closeActionSheet(); await patchAgendaStatus(id, 'em_atendimento'); return; }
  if (action === 'noshow') {
    closeActionSheet();
    if (await confirmAction({ title: 'Confirmar no-show', message: 'Marcar este atendimento como no-show?', confirmLabel: 'Marcar no-show', danger: true })) {
      await patchAgendaStatus(id, 'no_show');
    }
    return;
  }
  if (action === 'cancelar') {
    closeActionSheet();
    if (await confirmAction({ title: 'Cancelar atendimento', message: 'Cancelar este atendimento na agenda? ' + textoCancelamento(item), confirmLabel: 'Cancelar atendimento', danger: true })) {
      await patchAgendaStatus(id, 'cancelado');
      await promptWaitlistCandidates(item.servico_id);
    }
    return;
  }
  if (action === 'reagendar') { closeActionSheet(); openReagendarModal(item); return; }
  if (action === 'atendimento-etapas') { closeActionSheet(); abrirEtapas(item); return; }
  if (action === 'serie-ver') { closeActionSheet(); verSerie(item); return; }
  if (action === 'serie-cancelar' || action === 'serie-alterar') { closeActionSheet(); abrirSerie(item, action === 'serie-cancelar' ? 'cancelar' : 'alterar'); return; }
  if (action === 'checkout') { 
    closeActionSheet(); 
    stateBus.dispatchEvent(new CustomEvent('checkout:prefill', { detail: item }));
    return; 
  }
}

// F4.4: vaga aberta por cancelamento -> sugere quem chamar da lista de espera.
// Best-effort: nunca cria/edita agendamento sozinho, só oferece contato manual via WhatsApp.
async function promptWaitlistCandidates(servicoId) {
  if (!servicoId || !sessionPode('espera:ver')) return;
  let candidatos = [];
  try {
    candidatos = await getListaEspera({ servicoId, status: 'aguardando' });
  } catch (err) {
    return;
  }
  if (!candidatos.length) return;

  const servicoNome = findServicoNome(servicoId);
  const rowsHtml = candidatos.slice(0, 5).map(c => {
    const cliente = state.catalog.clientes.find(cl => cl.id === c.cliente_id);
    const nome = cliente ? cliente.nome : 'Cliente';
    const texto = `Olá ${nome}! Abriu uma vaga para ${servicoNome}, tem interesse?`;
    const link = cliente?.whatsapp ? waLink(cliente.whatsapp, texto) : null;
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid #eee;">
      <span style="font-size:13px;font-weight:600;">${escapeHtml(nome)}</span>
      ${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener" style="font-size:12px;font-weight:700;color:var(--success);text-decoration:none;">WhatsApp</a>` : '<span style="font-size:11px;color:var(--text-tertiary);">Sem WhatsApp</span>'}
    </div>`;
  }).join('');

  const dialog = document.getElementById('conflict-dialog');
  dialog.innerHTML = `
    <div style="padding:20px;max-width:320px;font-family:inherit">
      <div style="font-size:18px;font-weight:800;margin-bottom:8px">Vaga aberta — lista de espera</div>
      <div style="font-size:13px;color:#555;line-height:1.45;margin-bottom:12px">
        ${candidatos.length} cliente(s) aguardando ${escapeHtml(servicoNome)}. Avise quem preferir:
      </div>
      ${rowsHtml}
      <button id="btn-waitlist-fechar" style="
        margin-top:16px;width:100%;padding:12px;border-radius:10px;border:1px solid var(--border);
        cursor:pointer;background:var(--bg-surface);color:var(--text-secondary);font-size:14px">Fechar</button>
    </div>
  `;
  document.getElementById('btn-waitlist-fechar').onclick = () => dialog.close();
  dialog.showModal();
}

async function patchAgendaStatus(id, novoStatus) {
  clearBanner();
  try {
    await api(`/agenda/${id}/status`, { method: 'PATCH', body: { novoStatus } });
    showBanner('Agendamento atualizado.', 'ok');
    await loadWeekAgenda();
  } catch (err) {
    showBanner(err.message, 'error');
  }
}

function detectConflict(profId, data, hora, min, duracaoMin, ignorarId) {
  const inicioMin = (hora - HORA_INICIO) * 60 + min;
  const fimMin = inicioMin + duracaoMin;
  const items = state.weekAgenda[data] || [];
  return items.filter(ag =>
    ag.id !== ignorarId &&
    ag.profissional_id === profId &&
    !['cancelado', 'no_show', 'reagendado'].includes(ag.status) &&
    (() => {
      const [h2, m2] = ag.horario.split(':').map(Number);
      const ini2 = (h2 - HORA_INICIO) * 60 + m2;
      const fim2 = ini2 + (ag.duracao_min || 30);
      return !(fimMin <= ini2 || inicioMin >= fim2);
    })()
  );
}

function proximoSlotLivre(profId, data, duracaoMin, aPartirDeMin) {
  for (let m = aPartirDeMin; m <= (HORA_FIM - HORA_INICIO) * 60 - duracaoMin; m += SNAP_MIN) {
    const hora = HORA_INICIO + Math.floor(m / 60);
    const min  = m % 60;
    const conf = detectConflict(profId, data, hora, min, duracaoMin, null);
    if (conf.length === 0) return { hora, min };
  }
  return null;
}

function highlightSlot(profId, minC, temConflito) {
  clearHighlights();
  const col = document.querySelector(`.agenda-grid-col[data-prof-id="${profId}"]`);
  if (!col) return;
  const top = minC * PX_POR_MIN;
  const div = document.createElement('div');
  div.className = 'drag-highlight';
  div.style.cssText = `
    position: absolute; left: 2px; right: 2px;
    top: ${top}px; height: 60px;
    border-radius: 6px; pointer-events: none; z-index: 10;
    background: ${temConflito ? '#ffebee' : '#e8f5e9'};
    border: 2px dashed ${temConflito ? '#f44336' : '#4caf50'};
  `;
  col.appendChild(div);
}

function clearHighlights() {
  document.querySelectorAll('.drag-highlight').forEach(el => el.remove());
}

function showResizeTooltip(block, text) {
  let tooltip = block.querySelector('.resize-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'resize-tooltip';
    block.appendChild(tooltip);
  }
  tooltip.textContent = text;
}

function hideResizeTooltip() {
  document.querySelectorAll('.resize-tooltip').forEach(el => el.remove());
}

function showConflictDialog(profissionalId, data, hora, min, duracaoMin, onConfirm) {
  const profNome = state.catalog.profissionais.find(p => p.id === profissionalId)?.nome || '';
  const horario  = formatTime(hora, min);

  const proximo  = proximoSlotLivre(profissionalId, data, duracaoMin || 30, (hora - HORA_INICIO) * 60 + min);
  const proximoLabel = proximo ? `📍 ${formatTime(proximo.hora, proximo.min)}` : null;

  const dialog = document.getElementById('conflict-dialog');
  dialog.innerHTML = `
    <div style="padding:20px; max-width:320px; font-family:inherit">
      <div style="font-size:18px; font-weight:700; margin-bottom:8px">
        ⚠️ Conflito de horário
      </div>
      <div style="font-size:13px; color:#555; margin-bottom:20px">
        <b>${escapeHtml(profNome)}</b> já tem atendimento às <b>${horario}</b>.<br>
        O que você quer fazer?
      </div>
      <div style="display:flex; flex-direction:column; gap:10px">
        <button id="btn-encaixar" style="
          padding:12px; border-radius:10px; border:none; cursor:pointer;
          background:#7c3aed; color:#fff; font-weight:700; font-size:14px">
          ✓ Encaixar mesmo assim
        </button>
        ${proximoLabel ? `
        <button id="btn-proximo" style="
          padding:12px; border-radius:10px; border:none; cursor:pointer;
          background:#e8f5e9; color:#2e7d32; font-weight:700; font-size:14px">
          ${proximoLabel} — Slot mais próximo
        </button>` : ''}
        <button id="btn-cancelar" style="
          padding:12px; border-radius:10px; border:1px solid var(--border);
          cursor:pointer; background:var(--bg-surface); color:var(--text-secondary); font-size:14px">
          ✗ Cancelar
        </button>
      </div>
    </div>
  `;

  document.getElementById('btn-encaixar').onclick = () => {
    dialog.close();
    onConfirm(horario, true);
  };

  if (proximo) {
    document.getElementById('btn-proximo').onclick = () => {
      dialog.close();
      onConfirm(formatTime(proximo.hora, proximo.min), false);
    };
  }

  document.getElementById('btn-cancelar').onclick = () => dialog.close();
  dialog.showModal();
}

function executarReagendar(agId, profId, data, horario, permitirConflito, foraDaDisponibilidade = false, aceitarAvisos = false) {
  api('/agenda/' + agId + '/status', {
    method: 'PATCH',
    body: {
      novoStatus: 'reagendado',
      novaData: data,
      novoHorario: horario,
      novoProfissionalId: profId,
      permitirConflito: !!permitirConflito,
      foraDaDisponibilidade,
      aceitarAvisos
    }
  })
  .then(() => {
    loadWeekAgenda();
    navigator.vibrate?.([10, 50, 10]);
  })
  .catch(async err => {
    if (!foraDaDisponibilidade && await confirmarForaDaDisponibilidade(err)) return executarReagendar(agId, profId, data, horario, permitirConflito, true, aceitarAvisos);
    if (!aceitarAvisos && await confirmarRegras(err)) return executarReagendar(agId, profId, data, horario, permitirConflito, foraDaDisponibilidade, true);
    showBanner('Erro ao reagendar: ' + err.message, 'error');
  });
}

function startDrag(agId, e) {
  const block = document.querySelector(`[data-ag-id="${agId}"]`);
  if (!block) return;

  block.classList.add('dragging');
  const clientX = e.touches?.[0].clientX ?? e.clientX;
  const clientY = e.touches?.[0].clientY ?? e.clientY;

  const clone = block.cloneNode(true);
  clone.style.cssText = `
    position: fixed; opacity: 0.9; pointer-events: none;
    z-index: 9999; width: ${block.offsetWidth}px;
    box-shadow: var(--elevation-2); transform: scale(1.02);
    left: ${clientX - 60}px;
    top: ${clientY - 20}px;
  `;
  document.body.appendChild(clone);

  state.dragging = { agId, clone, targetProf: null, targetMin: null, originalBlock: block };

  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('mouseup', onDragEnd);
  document.addEventListener('touchend', onDragEnd);
}

function onDragMove(e) {
  if (e.cancelable) e.preventDefault();
  const clientX = e.touches?.[0].clientX ?? e.clientX;
  const clientY = e.touches?.[0].clientY ?? e.clientY;

  state.dragging.clone.style.left = clientX - 60 + 'px';
  state.dragging.clone.style.top  = clientY - 20 + 'px';

  state.dragging.clone.style.pointerEvents = 'none';
  const el = document.elementFromPoint(clientX, clientY);

  const profCol = el?.closest('[data-prof-id]');
  const container = document.getElementById('timelineContainer');

  if (profCol && container) {
    const rect = container.getBoundingClientRect();
    const yRel = clientY - rect.top + container.scrollTop;
    const min  = Math.round(yRel / PX_POR_MIN / SNAP_MIN) * SNAP_MIN;
    const minC = Math.max(0, Math.min(min, (HORA_FIM - HORA_INICIO) * 60 - 20));

    state.dragging.targetProf = profCol.dataset.profId;
    state.dragging.targetMin  = minC;

    const hora = HORA_INICIO + Math.floor(minC / 60);
    const mins = minC % 60;
    const ag   = findAgendaItemById(state.dragging.agId);
    const conf = detectConflict(state.dragging.targetProf, state.selectedDay, hora, mins, ag.duracao_min || 30, ag.id);

    highlightSlot(profCol.dataset.profId, minC, conf.length > 0);
  }
}

function onDragEnd(e) {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('touchmove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  document.removeEventListener('touchend', onDragEnd);
  clearHighlights();
  
  const currentDragging = state.dragging;
  if (!currentDragging) return;

  if (currentDragging.clone) {
    currentDragging.clone.remove();
  }
  if (currentDragging.originalBlock) {
    currentDragging.originalBlock.classList.remove('dragging');
  }

  if (!currentDragging.targetProf) {
    state.dragging = null;
    return;
  }

  const ag = findAgendaItemById(currentDragging.agId);
  const hora = HORA_INICIO + Math.floor(currentDragging.targetMin / 60);
  const mins = currentDragging.targetMin % 60;
  const conflitos = detectConflict(currentDragging.targetProf, state.selectedDay, hora, mins, ag.duracao_min || 30, ag.id);

  if (conflitos.length > 0) {
    showConflictDialog(currentDragging.targetProf, state.selectedDay, hora, mins, ag.duracao_min || 30, (horarioEscolhido, forced) => {
      executarReagendar(ag.id, currentDragging.targetProf, state.selectedDay, horarioEscolhido, forced);
    });
  } else {
    executarReagendar(ag.id, currentDragging.targetProf, state.selectedDay, formatTime(hora, mins));
  }
  state.dragging = null;
}

function startResize(agId, e) {
  e.preventDefault();
  e.stopPropagation();
  const block = document.querySelector(`[data-ag-id="${agId}"]`);
  if (!block) return;

  const clientY = e.touches?.[0].clientY ?? e.clientY;

  state.resizing = {
    agId,
    block,
    yInicio: clientY,
    alturaInicio: block.offsetHeight
  };

  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('touchmove', onResizeMove, { passive: false });
  document.addEventListener('mouseup', onResizeEnd);
  document.addEventListener('touchend', onResizeEnd);
}

function onResizeMove(e) {
  if (e.cancelable) e.preventDefault();
  const currentResizing = state.resizing;
  if (!currentResizing) return;
  const clientY = e.touches?.[0].clientY ?? e.clientY;
  const delta = clientY - currentResizing.yInicio;
  const minAltura = SNAP_MIN * PX_POR_MIN;
  let novaAltura = Math.max(minAltura, currentResizing.alturaInicio + delta);

  novaAltura = Math.round(novaAltura / minAltura) * minAltura;

  const novaMin = novaAltura / PX_POR_MIN;
  const ag = findAgendaItemById(currentResizing.agId);
  const [h, m] = ag.horario.split(':').map(Number);
  const inicioMin = (h - HORA_INICIO) * 60 + m;
  const fimMin = inicioMin + novaMin;

  const maxMin = (HORA_FIM - HORA_INICIO) * 60;
  const professionalId = ag.profissional_id;
  const dayItems = state.weekAgenda[state.selectedDay] || [];
  
  const otherItems = dayItems.filter(item => 
    item.id !== ag.id && 
    item.profissional_id === professionalId && 
    !['cancelado', 'no_show', 'reagendado'].includes(item.status)
  );

  let nextStartMin = maxMin;
  for (const other of otherItems) {
    const [h2, m2] = other.horario.split(':').map(Number);
    const start2 = (h2 - HORA_INICIO) * 60 + m2;
    if (start2 >= inicioMin && start2 < nextStartMin) {
      nextStartMin = start2;
    }
  }

  if (fimMin > nextStartMin) {
    novaAltura = (nextStartMin - inicioMin) * PX_POR_MIN;
  }

  currentResizing.block.style.height = novaAltura + 'px';

  const durMin = Math.round(novaAltura / PX_POR_MIN);
  const fimH = h + Math.floor((m + durMin) / 60);
  const fimM = (m + durMin) % 60;
  showResizeTooltip(currentResizing.block, `${durMin}min (até ${String(fimH).padStart(2,'0')}:${String(fimM).padStart(2,'0')})`);

  navigator.vibrate?.([5]);
}

function onResizeEnd(e) {
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('touchmove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
  document.removeEventListener('touchend', onResizeEnd);
  hideResizeTooltip();

  const currentResizing = state.resizing;
  if (!currentResizing) return;
  const novaDuracao = Math.round(currentResizing.block.offsetHeight / PX_POR_MIN);
  const ag = findAgendaItemById(currentResizing.agId);
  if (!ag || novaDuracao === ag.duracao_min) {
    state.resizing = null;
    return;
  }

  api('/agenda/' + currentResizing.agId + '/duracao', {
    method: 'PATCH',
    body: { duracaoMin: novaDuracao }
  })
  .then(() => {
    loadWeekAgenda();
  })
  .catch(err => {
    showBanner('Erro ao ajustar duração: ' + err.message, 'error');
    currentResizing.block.style.height = (ag.duracao_min * PX_POR_MIN) + 'px';
  });
  state.resizing = null;
}

function formatTime(h, m) {
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

let longPressTimer = null;

function onTimelineClick(ev) {
  if (ev.target.classList.contains('drag-handle') || ev.target.classList.contains('resize-handle')) {
    return;
  }
  const block = ev.target.closest('[data-action="open-sheet"]');
  if (block) {
    const item = findAgendaItemById(block.dataset.id);
    if (item) openActionSheet(item);
    return;
  }
  const bloq = ev.target.closest('[data-action="open-bloqueio"]');
  if (bloq) return abrirBloqueio(bloq.dataset.excId);
  const emptySlot = ev.target.closest('[data-action="add-slot"]');
  if (emptySlot) {
    // D-046: tocar no horário livre oferece Agendar ou Bloquear (quem não bloqueia vai direto agendar).
    abrirHorarioLivre(state.selectedDay, emptySlot.dataset.time, emptySlot.dataset.prof, openNovoAgendamentoModal);
  }
}

export function initAgenda() {
  initAgendaBloqueio();
  initCardAgendamento();
  initAgendaMes({
    aoFiltrar: () => { renderDayPills(); renderWeekStats(); renderTimeline(); },
    aoAbrirAgendamento: id => { const item = findAgendaItemById(id); if (item) openActionSheet(item); }
  });
  initClienteRapido();
  document.getElementById('btnPrevWeek').addEventListener('click', () => shiftWeek(-1));
  document.getElementById('btnNextWeek').addEventListener('click', () => shiftWeek(1));
  document.getElementById('btnPrevWeekMobile')?.addEventListener('click', () => shiftWeek(-1));
  document.getElementById('btnNextWeekMobile')?.addEventListener('click', () => shiftWeek(1));
  document.getElementById('btnAgendaToday')?.addEventListener('click', () => {
    state.selectedDay = todayStr();
    const mesmaSemana = weekDates(state.currentWeekStart).includes(state.selectedDay);
    state.currentWeekStart = startOfWeek(state.selectedDay);
    renderDayPills();
    renderWeekStats();
    renderTimeline();
    // Mesma semana: os dados já estão aqui; outra semana: recarrega (a grade não mostra a semana antiga como se fosse hoje).
    if (!mesmaSemana) loadWeekAgenda().catch(err => showBanner('Agenda: ' + err.message, 'error'));
    document.getElementById('timelineContainer')?.scrollTo({ top: Math.max(0, (new Date().getHours() - HORA_INICIO - 1) * 60 * PX_POR_MIN), behavior: 'smooth' });
  });

  document.getElementById('dayPills').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-day]');
    if (!btn) return;
    state.selectedDay = btn.dataset.day;
    renderDayPills();
    renderWeekStats();
    renderTimeline();
  });

  const timelineCols = document.getElementById('agendaGrid');
  timelineCols.addEventListener('click', onTimelineClick);

  timelineCols.addEventListener('mousedown', e => {
    const handle = e.target.closest('.drag-handle');
    if (handle) {
      startDrag(handle.dataset.agId, e);
    }
    const resizeHandle = e.target.closest('.resize-handle');
    if (resizeHandle) {
      startResize(resizeHandle.dataset.agId, e);
    }
  });

  timelineCols.addEventListener('touchstart', e => {
    const handle = e.target.closest('.drag-handle');
    if (handle) {
      const agId = handle.dataset.agId;
      longPressTimer = setTimeout(() => {
        navigator.vibrate?.([10]);
        startDrag(agId, e);
      }, 500);
    }

    const resizeHandle = e.target.closest('.resize-handle');
    if (resizeHandle) {
      startResize(resizeHandle.dataset.agId, e);
    }
  }, { passive: true });

  timelineCols.addEventListener('touchend', () => {
    clearTimeout(longPressTimer);
  });

  timelineCols.addEventListener('touchmove', () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
    }
  });

  document.getElementById('agHorario').addEventListener('input', () => {
    updateNovoAgendamentoPreview();
    if (state.agSlotsInfo) renderAgendaSlots(document.getElementById('agSlots'), state.agSlotsInfo.result);
  });
  document.getElementById('agData').addEventListener('change', refreshAgendaSlots);
  document.getElementById('agSlots').addEventListener('click', onAgendaSlotsClick);

  document.getElementById('actionSheet').addEventListener('click', (ev) => {
    if (ev.target.id === 'actionSheet') closeActionSheet();
  });
  document.getElementById('actionSheetContent').addEventListener('click', onActionSheetClick);

  document.getElementById('btnCancelarNovoAgendamento').addEventListener('click', closeNovoAgendamentoModal);
  document.getElementById('btnConfirmarNovoAgendamento').addEventListener('click', async () => {
    const clienteId = state.fuzzyAgCliente.getValue() || null;
    const servicoId = state.fuzzyAgServico.getValue();
    const profissionalId = state.fuzzyAgProfissional.getValue();
    const data = document.getElementById('agData').value;
    const horario = document.getElementById('agHorario').value;
    if (!servicoId || !profissionalId || !data || !horario) {
      showBanner('Preencha serviço, profissional, data e horário.', 'error');
      return;
    }
    clearBanner();

    // Vários serviços (D-040): o servidor devolve as combinações e quem agenda escolhe uma.
    const extras = extrasEscolhidos();
    if (extras.length) {
      if (repeticaoEscolhida()) { showBanner('Série recorrente aceita um serviço por vez.', 'error'); return; }
      const itens = [{ servicoId, profissionalId }, ...extras.map(e => ({ servicoId: e.servicoId, profissionalId: e.profissionalId || null }))];
      if (new Set(itens.map(i => i.servicoId)).size !== itens.length) { showBanner('O mesmo serviço aparece duas vezes.', 'error'); return; }
      await abrirOpcoes({ clienteId, data, itens, horario }, () => { resetExtras(); closeNovoAgendamentoModal(); });
      return;
    }

    // Série recorrente (C4): prévia no servidor e confirmação antes de gravar.
    const repeticao = repeticaoEscolhida();
    if (repeticao) {
      if (await criarSerieComPrevia({ clienteId, servicoId, profissionalId, data, horario }, repeticao)) { resetRepeticao(); closeNovoAgendamentoModal(); }
      return;
    }

    const duracaoMin = duracaoNovoAgendamento(servicoId, profissionalId);
    const [h, m] = horario.split(':').map(Number);
    const conflitos = detectConflict(profissionalId, data, h, m, duracaoMin, null);

    if (conflitos.length > 0) {
      showConflictDialog(profissionalId, data, h, m, duracaoMin, (horarioEscolhido, forced) => {
        criarAgendamento(clienteId, servicoId, profissionalId, data, horarioEscolhido, forced);
      });
      return;
    }

    await criarAgendamento(clienteId, servicoId, profissionalId, data, horario);
  });

  document.getElementById('btnCancelarReagendar').addEventListener('click', closeReagendarModal);
  document.getElementById('btnConfirmarReagendar').addEventListener('click', async () => {
    if (!state.reagendarAlvoId) return;
    const novaData = document.getElementById('reNovaData').value;
    const novoHorario = document.getElementById('reNovoHorario').value;
    if (!novaData || !novoHorario) { showBanner('Informe nova data e horário.', 'error'); return; }
    const novoServicoId = state.fuzzyReNovoServico.getValue() || undefined;
    const novoProfissionalId = state.fuzzyReNovoProfissional.getValue() || undefined;
    clearBanner();

    const original = findAgendaItemById(state.reagendarAlvoId);
    const profissionalAlvo = novoProfissionalId || (original ? original.profissional_id : null);
    const servicoAlvo = novoServicoId ? state.catalog.servicos.find(s => s.id === novoServicoId) : null;
    const duracaoMin = servicoAlvo ? (servicoAlvo.duracao_min || 30) : (original ? (original.duracao_min || 30) : 30);
    const [h, m] = novoHorario.split(':').map(Number);
    const conflitos = profissionalAlvo ? detectConflict(profissionalAlvo, novaData, h, m, duracaoMin, state.reagendarAlvoId) : [];

    const submeterReagendamento = async (horarioFinal, permitirConflito, aceitarAvisos = false) => {
      try {
        await api(`/agenda/${state.reagendarAlvoId}/status`, {
          method: 'PATCH',
          body: { novoStatus: 'reagendado', novaData, novoHorario: horarioFinal, novoServicoId, novoProfissionalId, permitirConflito: !!permitirConflito, aceitarAvisos }
        });
        closeReagendarModal();
        showBanner('Reagendado com sucesso.', 'ok');
        await loadWeekAgenda();
      } catch (err) {
        if (!aceitarAvisos && await confirmarRegras(err)) return submeterReagendamento(horarioFinal, permitirConflito, true);
        showBanner(err.message, 'error');
      }
    };

    if (conflitos.length > 0 && profissionalAlvo) {
      showConflictDialog(profissionalAlvo, novaData, h, m, duracaoMin, (horarioEscolhido, forced) => {
        submeterReagendamento(horarioEscolhido, forced);
      });
      return;
    }

    await submeterReagendamento(novoHorario, false);
  });

  // Redline update loop
  setInterval(() => { if (state.activeTab === 'agenda') positionRedline(); }, 30000);

  // Unified State Listeners
  stateBus.addEventListener('agenda:updated', () => {
    if (state.agendaFalhas) showBanner('Não consegui carregar ' + state.agendaFalhas + ' dia(s) da agenda. Dia vazio aqui pode ser falha, não folga: puxe para atualizar.', 'error');
    renderDayPills();
    renderWeekStats();
    renderTimeline();
    recarregarMesSeAberto();
    atualizarPaineis();
  });

  stateBus.addEventListener('catalog:updated', () => {
    desenharFiltro();
    renderDayPills();
    renderWeekStats();
    renderTimeline();
  });

  // Event Bus listeners
  stateBus.addEventListener('checkout:closed', () => {
    loadWeekAgenda();
  });
}

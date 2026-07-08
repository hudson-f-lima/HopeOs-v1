import { api } from '../api.js';
import { 
  state, 
  stateBus, 
  activeProfissionais, 
  profColor, 
  findClienteNome, 
  findServicoNome, 
  findProfissionalNome, 
  findAgendaItemById, 
  computeEndTime, 
  loadWeekAgenda,
  PROF_COLORS,
  CAPACITY_SLOTS_PER_PROF
} from '../state.js';
import {
  todayStr,
  addDays,
  weekDates,
  formatDDMM,
  WEEKDAY_LABELS,
  showBanner,
  clearBanner,
  openModal,
  closeModal,
  confirmAction,
  escapeHtml,
  getInitials
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

function toTop(hora, minuto) { return ((hora - HORA_INICIO) * 60 + minuto) * PX_POR_MIN; }
function toHeight(duracaoMin) { return duracaoMin * PX_POR_MIN; }

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
  const line2 = compact ? '' : `<div class="ag-line2" style="pointer-events:none;">${escapeHtml(findServicoNome(item.servico_id))}</div>`;
  
  const isEditable = !['concluido', 'no_show'].includes(item.status);
  const dragHtml = isEditable ? `<div class="drag-handle" data-ag-id="${item.id}"></div>` : '';
  const resizeHtml = isEditable ? `<div class="resize-handle" data-ag-id="${item.id}"></div>` : '';

  return `
    <div class="ag-block ${compact ? 'compact' : ''}" 
         style="top:${top}px;height:${height}px;background:${sColor.bg};border-left:4px solid ${sColor.border};color:#ffffff;opacity:${opacity};position:absolute;box-sizing:border-box;" 
         data-action="open-sheet" 
         data-id="${item.id}"
         data-ag-id="${item.id}">
      ${dragHtml}
      <div class="ag-line1" style="pointer-events:none;padding-top:${isEditable ? '12px' : '4px'};">${horario} ${escapeHtml(findClienteNome(item.cliente_id))}</div>
      ${line2}
      ${resizeHtml}
    </div>`;
}

function renderProfCol(p) {
  const color = profColor(p.id);
  const emptyHtml = emptySlotsForProf(p.id).map(m => {
    const timeStr = minutesSinceStartToHHMM(m);
    return `<div class="slot-vazio" style="top:${m * PX_POR_MIN}px;height:${GRID_MIN * PX_POR_MIN}px;" data-action="add-slot" data-prof="${p.id}" data-time="${timeStr}"></div>`;
  }).join('');
  const blocksHtml = profItemsForDay(p.id).map(item => renderAgBlock(item, color)).join('');
  return `<div class="prof-col" data-prof-id="${p.id}">${emptyHtml}${blocksHtml}</div>`;
}

function renderRuler() {
  const ruler = document.getElementById('timelineRuler');
  if (!ruler) return;
  ruler.style.height = TIMELINE_TOTAL_HEIGHT + 'px';
  let html = '';
  const totalMin = (HORA_FIM - HORA_INICIO) * 60;
  for (let m = 0; m <= totalMin; m += GRID_MIN) {
    html += `<div class="ruler-mark" style="top:${m * PX_POR_MIN}px;">${minutesSinceStartToHHMM(m)}</div>`;
  }
  ruler.innerHTML = html;
}

function renderGridLines() {
  const gridEl = document.getElementById('timelineGridLines');
  if (!gridEl) return;
  gridEl.style.height = TIMELINE_TOTAL_HEIGHT + 'px';
  let html = '';
  const totalMin = (HORA_FIM - HORA_INICIO) * 60;
  for (let m = 0; m <= totalMin; m += 30) {
    const cls = m % 60 === 0 ? 'grid-line-hour' : 'grid-line-half';
    html += `<div class="${cls}" style="top:${m * PX_POR_MIN}px;"></div>`;
  }
  gridEl.innerHTML = html;
}

export function applyProfFilter() {
  const headers = document.getElementById('timelineHeadersInner')?.children;
  if (!state.activeProfFilter) {
    if (headers) Array.from(headers).forEach(btn => btn.classList.remove('selected'));
    document.querySelectorAll('.prof-col').forEach(col => col.classList.remove('col-hidden'));
    return;
  }
  
  if (headers) {
    Array.from(headers).forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.prof === state.activeProfFilter);
    });
  }
  
  document.querySelectorAll('.prof-col').forEach(col => {
    col.classList.toggle('col-hidden', col.dataset.profId !== state.activeProfFilter);
  });

  const targetCol = document.querySelector(`.prof-col[data-prof-id="${state.activeProfFilter}"]`);
  const container = document.getElementById('timelineContainer');
  if (targetCol && container) {
    container.scrollTo({ left: targetCol.offsetLeft - 52, behavior: 'smooth' });
  }
}

export function renderTimeline() {
  renderRuler();
  renderGridLines();
  const profs = activeProfissionais();
  
  const headersInner = document.getElementById('timelineHeadersInner');
  if (headersInner) {
    if (!profs.length) {
      headersInner.innerHTML = '';
    } else {
      headersInner.innerHTML = profs.map((p, i) => {
        const color = PROF_COLORS[i % PROF_COLORS.length];
        const isSelected = state.activeProfFilter === p.id ? 'selected' : '';
        const initials = getInitials(p.nome);
        const firstName = p.nome ? p.nome.split(' ')[0] : '?';
        return `<div class="timeline-header-btn ${isSelected}" data-prof="${p.id}" 
               style="flex:1 1 120px; min-width:120px; cursor:pointer; box-sizing:border-box; border-right:1px solid var(--md-surface-variant); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; padding:8px 4px; background:var(--md-surface); transition:background 0.2s;">
            <div class="avatar-circle" style="background:${color}20; color:${color}; font-weight:800; font-size:12px; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center;">${initials}</div>
            <div style="font-weight:700; font-size:11px; color:var(--md-on-surface); text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">${escapeHtml(firstName)}</div>
          </div>`;
      }).join('');
      
      Array.from(headersInner.children).forEach(btn => {
        btn.addEventListener('click', (e) => {
          const clickedId = e.currentTarget.dataset.prof;
          state.activeProfFilter = (state.activeProfFilter === clickedId) ? null : clickedId;
          applyProfFilter();
        });
      });
    }
  }

  const cols = document.getElementById('timelineCols');
  if (!cols) return;
  cols.style.height = TIMELINE_TOTAL_HEIGHT + 'px';
  if (!profs.length) {
    cols.innerHTML = '<div style="padding:16px;font-size:13px;color:var(--md-outline);">Nenhum profissional ativo.</div>';
    return;
  }
  cols.innerHTML = profs.map(renderProfCol).join('');
  
  if (state.activeProfFilter) applyProfFilter();
  
  positionRedline();
}

export function positionRedline() {
  const cols = document.getElementById('timelineCols');
  if (!cols) return;
  let line = cols.querySelector('.timeline-redline-abs');
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
    cols.appendChild(line);
  }
  line.style.top = top + 'px';
}

export function renderWeekStats() {
  const dates = weekDates(state.currentWeekStart);
  const activeProfs = Math.max(1, activeProfissionais().length);
  let totalCounted = 0;
  dates.forEach(d => {
    totalCounted += (state.weekAgenda[d] || []).filter(i => i.status !== 'cancelado' && i.status !== 'reagendado').length;
  });
  const occupancyPct = Math.min(100, Math.round((totalCounted / (activeProfs * CAPACITY_SLOTS_PER_PROF * 7)) * 100));
  const weekCount = document.getElementById('weekCountLabel');
  const weekOccupancy = document.getElementById('weekOccupancyLabel');
  if (weekCount) weekCount.textContent = `${totalCounted} agend. na semana`;
  if (weekOccupancy) weekOccupancy.textContent = `${occupancyPct}% ocupação`;
}

export function renderDayPills() {
  const dates = weekDates(state.currentWeekStart);
  const dayPills = document.getElementById('dayPills');
  if (!dayPills) return;
  dayPills.innerHTML = dates.map(d => {
    const dt = new Date(d + 'T12:00:00');
    return `<button class="day-pill ${d === state.selectedDay ? 'selected' : ''}" data-day="${d}">
      <span class="pill-weekday">${WEEKDAY_LABELS[dt.getDay()]}</span>${dt.getDate()}
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
  const servico = state.catalog.servicos.find(s => s.id === servicoId);
  const duracao = servico ? (servico.duracao_min || 30) : 30;
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
  openModal('modalNovoAgendamento');
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

async function criarAgendamento(clienteId, servicoId, profissionalId, data, horario, permitirConflito) {
  clearBanner();
  try {
    await api('/agenda', { method: 'POST', body: { clienteId, servicoId, profissionalId, data, horario, permitirConflito: !!permitirConflito } });
    closeNovoAgendamentoModal();
    showBanner('Agendamento criado.', 'ok');
    await loadWeekAgenda();
  } catch (err) {
    showBanner(err.message, 'error');
  }
}

function openActionSheet(item) {
  const meta = AGENDA_STATUS_META[item.status] || { label: item.status, cls: 'badge' };
  const horario = String(item.horario || '').slice(0, 5);
  let actionsHtml = '';
  if (item.status === 'agendado') {
    actionsHtml = `
      <button class="btn" data-sheet-action="confirmar">Confirmar</button>
      <button class="btn danger" data-sheet-action="noshow">No-show</button>
      <button class="btn danger" data-sheet-action="cancelar">Cancelar</button>
      <button class="btn" data-sheet-action="reagendar">Reagendar</button>
      <button class="btn primary" data-sheet-action="checkout">Fazer checkout</button>`;
  } else if (item.status === 'confirmado') {
    actionsHtml = `
      <button class="btn danger" data-sheet-action="noshow">No-show</button>
      <button class="btn danger" data-sheet-action="cancelar">Cancelar</button>
      <button class="btn primary" data-sheet-action="checkout">Fazer checkout</button>`;
  } else if (item.status === 'concluido') {
    actionsHtml = `<p style="font-size:13px;color:var(--md-success);font-weight:700;margin-top:8px;">✓ Checkout feito</p>`;
  }

  document.getElementById('actionSheetContent').innerHTML = `
    <h2>${horario} — ${escapeHtml(findClienteNome(item.cliente_id))}</h2>
    <div class="row"><span>Serviço</span><b>${escapeHtml(findServicoNome(item.servico_id))}</b></div>
    <div class="row"><span>Profissional</span><b>${escapeHtml(findProfissionalNome(item.profissional_id))}</b></div>
    <div class="row"><span>Hora início</span><b>${horario}</b></div>
    <div class="row"><span>Hora fim</span><b>${computeEndTime(item)}</b></div>
    <div class="row"><span>Status</span><span class="${meta.cls}">${meta.label}</span></div>
    <div class="sheet-actions">${actionsHtml}</div>
  `;
  document.getElementById('actionSheet').dataset.agendaId = item.id;
  openModal('actionSheet');
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
  if (action === 'noshow') {
    closeActionSheet();
    if (await confirmAction({ title: 'Confirmar no-show', message: 'Marcar este atendimento como no-show?', confirmLabel: 'Marcar no-show', danger: true })) {
      await patchAgendaStatus(id, 'no_show');
    }
    return;
  }
  if (action === 'cancelar') {
    closeActionSheet();
    if (await confirmAction({ title: 'Cancelar atendimento', message: 'Cancelar este atendimento na agenda?', confirmLabel: 'Cancelar atendimento', danger: true })) {
      await patchAgendaStatus(id, 'cancelado');
    }
    return;
  }
  if (action === 'reagendar') { closeActionSheet(); openReagendarModal(item); return; }
  if (action === 'checkout') { 
    closeActionSheet(); 
    stateBus.dispatchEvent(new CustomEvent('checkout:prefill', { detail: item }));
    return; 
  }
}

async function patchAgendaStatus(id, novoStatus) {
  clearBanner();
  try {
    await api(`/agenda/${id}/status`, { method: 'PATCH', body: { novoStatus } });
    showBanner('Agendamento updated.', 'ok');
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
  const col = document.querySelector(`.prof-col[data-prof-id="${profId}"]`);
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
        <b>${profNome}</b> já tem atendimento às <b>${horario}</b>.<br>
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
          padding:12px; border-radius:10px; border:1px solid #e0e0e0;
          cursor:pointer; background:#fff; color:#555; font-size:14px">
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

function executarReagendar(agId, profId, data, horario, permitirConflito) {
  api('/agenda/' + agId + '/status', {
    method: 'PATCH',
    body: {
      novoStatus: 'reagendado',
      novaData: data,
      novoHorario: horario,
      novoProfissionalId: profId,
      permitirConflito: !!permitirConflito
    }
  })
  .then(() => {
    loadWeekAgenda();
    navigator.vibrate?.([10, 50, 10]);
  })
  .catch(err => showBanner('Erro ao reagendar: ' + err.message, 'error'));
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
  const emptySlot = ev.target.closest('[data-action="add-slot"]');
  if (emptySlot) {
    openNovoAgendamentoModal(state.selectedDay, emptySlot.dataset.time, emptySlot.dataset.prof);
  }
}

export function initAgenda() {
  document.getElementById('btnPrevWeek').addEventListener('click', () => shiftWeek(-1));
  document.getElementById('btnNextWeek').addEventListener('click', () => shiftWeek(1));

  document.getElementById('dayPills').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-day]');
    if (!btn) return;
    state.selectedDay = btn.dataset.day;
    renderDayPills();
    renderTimeline();
  });

  const timelineCols = document.getElementById('timelineCols');
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

  const timelineContainer = document.getElementById('timelineContainer');
  const headersWrapper = document.getElementById('timelineHeadersWrapper');
  if (timelineContainer && headersWrapper) {
    timelineContainer.addEventListener('scroll', () => {
      headersWrapper.scrollLeft = timelineContainer.scrollLeft;
    });
  }

  document.getElementById('agHorario').addEventListener('input', updateNovoAgendamentoPreview);

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

    const servico = state.catalog.servicos.find(s => s.id === servicoId);
    const duracaoMin = servico ? (servico.duracao_min || 30) : 30;
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

    const submeterReagendamento = async (horarioFinal, permitirConflito) => {
      try {
        await api(`/agenda/${state.reagendarAlvoId}/status`, {
          method: 'PATCH',
          body: { novoStatus: 'reagendado', novaData, novoHorario: horarioFinal, novoServicoId, novoProfissionalId, permitirConflito: !!permitirConflito }
        });
        closeReagendarModal();
        showBanner('Reagendado com sucesso.', 'ok');
        await loadWeekAgenda();
      } catch (err) {
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
    renderDayPills();
    renderWeekStats();
    renderTimeline();
  });

  stateBus.addEventListener('catalog:updated', () => {
    renderTimeline();
  });

  // Event Bus listeners
  stateBus.addEventListener('checkout:closed', () => {
    loadWeekAgenda();
  });
}

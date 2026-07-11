import { api } from './api.js?v=ts1783742622';
import { loadCatalog } from './state.js';
import { showToast } from './ui/toast.js';

export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function centsToBRL(cents) {
  return 'R$ ' + ((Number(cents) || 0) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function brlToCents(v) { return Math.round((Number(v) || 0) * 100); }

export function genIdempotencyKey() { return Date.now() + '-' + Math.random().toString(36).slice(2, 10); }

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function normalizeSearchText(str) {
  return String(str ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function toDateStr(d) { return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

export function todayStr() { return toDateStr(new Date()); }

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export function startOfWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - d.getDay());
  return toDateStr(d);
}

export function weekDates(weekStartStr) { return Array.from({ length: 7 }, (_, i) => addDays(weekStartStr, i)); }

export function formatDDMM(dateStr) { const [, m, d] = dateStr.split('-'); return `${d}/${m}`; }

export function nowHHMM() { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function waLink(numero, texto) {
  const digits = String(numero || '').replace(/\D/g, '');
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(texto || '')}`;
}

export function showBanner(message, type) {
  // Mantem compatibilidade e converte ok -> success
  const toastType = type === 'ok' ? 'success' : type;
  showToast({
    type: toastType,
    message: message
  });
}

export function clearBanner() { 
  // No-op for toast system, active toasts clear themselves
}

export function renderList(containerId, items, rowRenderer) {
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = items.length
      ? items.map(rowRenderer).join('')
      : '<p class="empty-state">Nada para mostrar aqui por enquanto.</p>';
  }
}

export function openModal(id) { 
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden'); 
}

export function closeModal(id) { 
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden'); 
}

export function showModalError(errorElId, message) {
  const el = document.getElementById(errorElId);
  if (el) {
    el.textContent = message;
    el.classList.remove('hidden');
  }
}

export function clearModalError(errorElId) {
  const el = document.getElementById(errorElId);
  if (el) {
    el.textContent = '';
    el.classList.add('hidden');
  }
}

export async function submitCadastro(apiCall, successMsg, refreshFn, errorElId) {
  if (errorElId) clearModalError(errorElId);
  try {
    const data = await apiCall();
    showBanner(successMsg, 'ok');
    await loadCatalog();
    if (refreshFn) refreshFn();
    return data;
  } catch (err) {
    if (errorElId) showModalError(errorElId, err.message);
    else showBanner(err.message, 'error');
    return null;
  }
}

export async function toggleAtivo(path, id, currentAtivo, refreshFn) {
  return submitCadastro(
    () => api(`${path}/${id}`, { method: 'PATCH', body: { ativo: !currentAtivo } }),
    currentAtivo ? 'Desativado com sucesso.' : 'Reativado com sucesso.',
    refreshFn
  );
}

export function confirmAction({ title, message, confirmLabel = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('conflict-dialog');
    if (!dialog) {
      resolve(false);
      return;
    }
    dialog.innerHTML = `
      <div style="padding:20px;max-width:320px;font-family:inherit">
        <div style="font-size:18px;font-weight:800;margin-bottom:8px">${escapeHtml(title)}</div>
        <div style="font-size:13px;color:#555;line-height:1.45;margin-bottom:20px">${escapeHtml(message)}</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button id="confirm-action-ok" style="
            padding:12px;border-radius:10px;border:none;cursor:pointer;
            background:${danger ? '#ef4444' : '#7c3aed'};color:#fff;font-weight:800;font-size:14px">
            ${escapeHtml(confirmLabel)}
          </button>
          <button id="confirm-action-cancel" style="
            padding:12px;border-radius:10px;border:1px solid #e0e0e0;
            cursor:pointer;background:#fff;color:#555;font-size:14px">
            Cancelar
          </button>
        </div>
      </div>
    `;
    const finish = (value) => {
      dialog.close();
      dialog.oncancel = null;
      resolve(value);
    };
    document.getElementById('confirm-action-ok').onclick = () => finish(true);
    document.getElementById('confirm-action-cancel').onclick = () => finish(false);
    dialog.oncancel = () => resolve(false);
    dialog.showModal();
  });
}

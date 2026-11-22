import { api } from './api.js';
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

// Clientes ativos com nome parecido (D-062): igual sem acento, caixa e pontuação, ou mesmo primeiro e
// último nome ("João Silva" × "Joao da Silva"). Só avisa; quem cadastra decide. Regra explicável,
// sem pontuação inventada: telefone repetido continua sendo barrado pelo servidor.
export function clientesComNomeParecido(nome, clientes, limite = 2) {
  const chave = t => normalizeSearchText(t).replace(/[^a-z0-9]+/g, ' ').trim();
  const alvo = chave(nome);
  if (alvo.length < 3) return [];
  const pontas = k => { const p = k.split(' '); return p.length > 1 ? p[0] + ' ' + p[p.length - 1] : null; };
  const pontasAlvo = pontas(alvo);
  return (clientes || []).filter(c => {
    if (!c || c.ativo === false) return false;
    const k = chave(c.nome);
    return k === alvo || (pontasAlvo !== null && pontas(k) === pontasAlvo);
  }).slice(0, limite);
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

// Pilha de camadas: quem abre por último fica por cima, sempre. Antes todos os modais e folhas
// tinham o mesmo z-index e o de cima era o que vinha depois no HTML: metade dos pares abria por
// baixo (ex.: Conta → Cliente). O observador cobre também quem mostra o overlay sem openModal.
const CAMADA_BASE = 300;
let camadaTopo = CAMADA_BASE;
const OVERLAY = '.modal-backdrop, .sheet-backdrop';
function elevar(el) {
  camadaTopo += 1;
  el.style.zIndex = String(camadaTopo);
}
function abertos() {
  return [...document.querySelectorAll(OVERLAY)].filter(o => !o.classList.contains('hidden'));
}
export function overlayDoTopo() {
  return abertos().sort((a, b) => Number(b.style.zIndex || 0) - Number(a.style.zIndex || 0))[0] || null;
}
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  const obs = new MutationObserver(mutacoes => {
    for (const m of mutacoes) {
      const el = m.target;
      if (!el.matches || !el.matches(OVERLAY)) continue;
      const estavaOculto = String(m.oldValue || '').split(/\s+/).includes('hidden');
      if (estavaOculto && !el.classList.contains('hidden')) { montarTopo(el); elevar(el); }
    }
    if (!abertos().length) camadaTopo = CAMADA_BASE;
  });
  const ligar = () => obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  if (document.body) ligar(); else document.addEventListener('DOMContentLoaded', ligar);
  // Esc fecha só o de cima (os <dialog> nativos já fecham sozinhos).
  document.addEventListener('keydown', ev => {
    if (ev.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    const topo = overlayDoTopo();
    if (topo) { ev.preventDefault(); topo.classList.add('hidden'); }
  });
}

// Redesign dos modais: o título vira um cabeçalho fixo com ✕ (fechar sem rolar até o fim).
// Feito uma vez por modal, na primeira abertura; o h2 original é mantido (ids e textos).
function montarTopo(el) {
  const box = el.querySelector(':scope > .modal-box');
  if (!box || box.querySelector(':scope > .modal-topo')) return;
  const h2 = box.querySelector(':scope > h2');
  if (!h2) return;
  const topo = document.createElement('div');
  topo.className = 'modal-topo';
  box.insertBefore(topo, h2);
  topo.appendChild(h2);
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'modal-fechar'; x.setAttribute('aria-label', 'Fechar'); x.textContent = '✕';
  x.addEventListener('click', () => el.classList.add('hidden'));
  topo.appendChild(x);
}

export function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  montarTopo(el);
  el.classList.remove('hidden');
  elevar(el); // já reaberto (sem mudar a classe) também sobe para o topo
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
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.45;margin-bottom:20px">${escapeHtml(message)}</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button id="confirm-action-ok" style="
            min-height:48px;padding:12px;border-radius:12px;border:none;cursor:pointer;
            background:${danger ? 'var(--error)' : 'var(--primary)'};color:var(--on-primary);font-weight:800;font-size:14px">
            ${escapeHtml(confirmLabel)}
          </button>
          <button id="confirm-action-cancel" style="
            min-height:44px;padding:12px;border-radius:12px;border:1px solid var(--border);
            cursor:pointer;background:var(--bg-surface);color:var(--text-secondary);font-size:14px">
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

// Escolha entre várias ações (D-060): devolve o `valor` da opção tocada, ou null se a pessoa voltar.
// opcoes: [{ valor, rotulo, destaque? }]. Usa o mesmo diálogo da confirmAction.
export function escolherOpcao({ title, message, opcoes, voltar = 'Voltar' }) {
  return new Promise((resolve) => {
    const dialog = document.getElementById('conflict-dialog');
    if (!dialog) { resolve(null); return; }
    dialog.innerHTML = `
      <div style="padding:20px;max-width:340px;font-family:inherit">
        <div style="font-size:18px;font-weight:800;margin-bottom:8px">${escapeHtml(title)}</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.45;margin-bottom:20px">${escapeHtml(message)}</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${opcoes.map(o => `<button type="button" data-opcao="${escapeHtml(o.valor)}" style="min-height:48px;padding:12px;border-radius:12px;cursor:pointer;font-weight:${o.destaque ? 800 : 600};font-size:14px;${o.destaque ? 'border:none;background:var(--primary);color:var(--on-primary)' : 'border:1px solid var(--border);background:var(--bg-surface);color:var(--text-primary)'}">${escapeHtml(o.rotulo)}</button>`).join('')}
          <button type="button" data-opcao-voltar="1" style="min-height:44px;padding:12px;border-radius:12px;border:none;cursor:pointer;background:transparent;color:var(--text-secondary);font-size:14px">${escapeHtml(voltar)}</button>
        </div>
      </div>`;
    const finish = (valor) => { dialog.close(); dialog.oncancel = null; resolve(valor); };
    dialog.querySelectorAll('[data-opcao]').forEach(b => { b.onclick = () => finish(b.dataset.opcao); });
    dialog.querySelector('[data-opcao-voltar]').onclick = () => finish(null);
    dialog.oncancel = () => resolve(null);
    dialog.showModal();
  });
}

// CSV para planilha pt-BR: ";" como separador, vírgula decimal e BOM (acentos no Excel).
// Texto que começa com = + - @ ganha apóstrofo: planilha não executa como fórmula.
export function toCsv(cabecalho, linhas) {
  const cel = v => {
    let t = v === null || v === undefined ? '' : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(t)) t = "'" + t;
    return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  return '\uFEFF' + [cabecalho, ...linhas].map(l => l.map(cel).join(';')).join('\r\n') + '\r\n';
}

export function centsToDecimal(cents) {
  const n = Number(cents) || 0;
  const abs = Math.abs(n);
  return (n < 0 ? '-' : '') + Math.floor(abs / 100) + ',' + String(abs % 100).padStart(2, '0');
}

export function baixarArquivo(nome, conteudo, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

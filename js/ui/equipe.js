// Gestão > Equipe (só admin): quem acessa a empresa, com qual papel.
// O backend (/api/admin/*) valida tudo; aqui é só a interface.
import { api } from '../api.js';
import { state } from '../state.js';
import { escapeHtml, showBanner } from '../utils.js';

const ROLES = [
  ['admin', 'Admin'], ['gestor', 'Gestão'], ['recepcao', 'Recepção'], ['profissional', 'Profissional']
];
const el = id => document.getElementById(id);
let unidades = [];

function roleOptions(selected) {
  return ROLES.map(([v, l]) => `<option value="${v}"${v === selected ? ' selected' : ''}>${l}</option>`).join('');
}
function profOptions(selected) {
  const profs = (state.catalog.profissionais || []).filter(p => p.ativo !== false);
  return '<option value="">— vincular ao cadastro —</option>' +
    profs.map(p => `<option value="${escapeHtml(p.id)}"${p.id === selected ? ' selected' : ''}>${escapeHtml(p.nome)}</option>`).join('');
}

function renderUnidades() {
  el('eqUnidades').innerHTML = unidades.filter(u => u.ativo !== false).map(u =>
    `<label class="filter-inline"><input type="checkbox" value="${escapeHtml(u.id)}" checked/> ${escapeHtml(u.nome)}</label>`).join('');
}

function renderLista(rows) {
  if (!rows.length) { el('listEquipe').innerHTML = '<p class="body-sm text-tertiary">Ninguém vinculado ainda.</p>'; return; }
  el('listEquipe').innerHTML = rows.map(m => `
    <div class="eq-row" data-id="${escapeHtml(m.id)}">
      <div class="eq-quem"><b>${escapeHtml((m.user && m.user.nome) || '—')}</b><span>${escapeHtml((m.user && m.user.email) || '')}</span></div>
      <div class="eq-ctrl">
        <select data-campo="role" aria-label="Papel">${roleOptions(m.role)}</select>
        ${m.role === 'profissional' ? `<select data-campo="profissionalId" aria-label="Cadastro de profissional">${profOptions(m.profissional_id)}</select>` : ''}
        <button type="button" class="chip${m.status === 'ativo' ? ' selected' : ''}" data-campo="status" data-valor="${m.status === 'ativo' ? 'inativo' : 'ativo'}">${m.status === 'ativo' ? 'Ativo' : 'Inativo'}</button>
      </div>
    </div>`).join('');
}

export async function renderEquipe() {
  if (!state.session || state.session.role !== 'admin') return;
  try {
    const [rows, us] = await Promise.all([api('/admin/memberships'), api('/admin/unidades')]);
    unidades = us;
    renderUnidades();
    renderLista(rows);
  } catch (err) {
    el('listEquipe').innerHTML = `<p class="body-sm" style="color:var(--md-error)">${escapeHtml(err.message)}</p>`;
  }
}

async function atualizar(id, body) {
  try {
    await api(`/admin/memberships/${id}`, { method: 'PATCH', body });
    showBanner('Acesso atualizado.', 'ok');
  } catch (err) {
    showBanner(err.message, 'error');
  }
  renderEquipe();
}

async function adicionar(ev) {
  ev.preventDefault();
  const role = el('eqRole').value;
  const body = {
    email: el('eqEmail').value.trim(),
    role,
    unitIds: [...el('eqUnidades').querySelectorAll('input:checked')].map(i => i.value)
  };
  if (role === 'profissional') {
    if (!el('eqProfissional').value) { el('eqErro').textContent = 'Escolha o cadastro de profissional desta pessoa.'; return; }
    body.profissionalId = el('eqProfissional').value;
  }
  el('eqErro').textContent = '';
  try {
    const r = await api('/admin/invites', { method: 'POST', body });
    el('eqEmail').value = '';
    showBanner(r.convidado ? 'Convite enviado por e-mail.' : 'Acesso concedido à conta existente.', 'ok');
    renderEquipe();
  } catch (err) {
    el('eqErro').textContent = err.message;
  }
}

export function initEquipe() {
  if (!state.session || state.session.role !== 'admin') return;
  el('subtabBtnEquipe')?.classList.remove('hidden');
  el('eqProfissional').innerHTML = profOptions(null);
  el('eqRole').addEventListener('change', () => {
    el('eqProfField').classList.toggle('hidden', el('eqRole').value !== 'profissional');
    el('eqProfissional').innerHTML = profOptions(null);
  });
  el('formEquipe').addEventListener('submit', adicionar);
  el('listEquipe').addEventListener('change', ev => {
    const row = ev.target.closest('[data-id]');
    if (!row || !ev.target.dataset.campo) return;
    atualizar(row.dataset.id, { [ev.target.dataset.campo]: ev.target.value || null });
  });
  el('listEquipe').addEventListener('click', ev => {
    const btn = ev.target.closest('button[data-campo="status"]');
    if (btn) atualizar(btn.closest('[data-id]').dataset.id, { status: btn.dataset.valor });
  });
  renderEquipe();
}

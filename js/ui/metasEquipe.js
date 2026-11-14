// Metas e desempenho (gestão): meta do salão e a equipe com o progresso da meta de
// faturamento do mês, já à vista. Tocar numa pessoa abre o detalhe logo abaixo
// (ganhos, metas e desempenho), que é o mesmo conteúdo de antes. Só admin e gestor.
import { api } from '../api.js';
import { state, sessionRoleIn } from '../state.js';
import { escapeHtml, centsToBRL } from '../utils.js';

const el = id => document.getElementById(id);

function cartaoSalao(m) {
  if (!m || !m.temMetas) return '';
  const pct = Math.min(100, Math.max(0, m.percentual));
  return m.reconhecida
    ? `<div class="meta-salao" data-meta-salao-equipe><div class="meta-salao-selo"><span aria-hidden="true">★</span> Meta do salão atingida neste mês</div><p class="body-sm text-tertiary" style="margin:4px 0 0;">${centsToBRL(m.realizadoCentavos)} de ${centsToBRL(m.metaCentavos)} em serviços.</p></div>`
    : `<div class="meta-salao" data-meta-salao-equipe><div class="body-sm"><b>Meta do salão:</b> ${m.percentual}% (${centsToBRL(m.realizadoCentavos)} de ${centsToBRL(m.metaCentavos)} em serviços)</div><progress max="100" value="${pct}" aria-label="Meta do salão: ${m.percentual}%"></progress></div>`;
}

function itemPessoa(p, meta, selecionado) {
  const sel = p.id === selecionado ? ' aria-current="true"' : '';
  if (!meta) {
    return `<button type="button" class="equipe-item equipe-sem-meta" data-equipe-prof="${escapeHtml(p.id)}"${sel}>
      <span class="equipe-topo"><b>${escapeHtml(p.nome)}</b><span>Sem meta neste mês</span></span></button>`;
  }
  const pct = Math.min(100, Math.max(0, meta.percentual));
  return `<button type="button" class="equipe-item" data-equipe-prof="${escapeHtml(p.id)}"${sel}>
    <span class="equipe-topo"><b>${escapeHtml(p.nome)}</b><span>${centsToBRL(meta.realizado)} de ${centsToBRL(meta.alvo)} · ${meta.percentual}%</span></span>
    <progress max="100" value="${pct}" aria-label="${escapeHtml(p.nome)}: ${meta.percentual}% da meta"></progress></button>`;
}

export async function carregarEquipe(mes) {
  const bloco = el('metasEquipe');
  if (!bloco || !sessionRoleIn('admin', 'gestor') || !mes) return;
  const q = encodeURIComponent(mes);
  try {
    const [r, salao] = await Promise.all([api(`/metas?mes=${q}`), api(`/gamificacao/meta-salao?mes=${q}`)]);
    const fat = new Map(r.metas.filter(m => m.tipo === 'faturamento').map(m => [m.profissionalId, m]));
    const profs = (state.catalog.profissionais || []).filter(p => p.ativo !== false);
    const selecionado = el('ganhosProfissional') ? el('ganhosProfissional').value : '';
    bloco.innerHTML = `${cartaoSalao(salao)}
      <h3 class="body-sm text-tertiary" style="margin:12px 0 6px;">Equipe · toque para ver a pessoa</h3>
      <div class="equipe-lista">${profs.map(p => itemPessoa(p, fat.get(p.id), selecionado)).join('') || '<p class="empty-state">Nenhum profissional ativo.</p>'}</div>`;
  } catch (err) {
    bloco.innerHTML = `<p class="body-sm" role="alert" style="color:var(--md-error)">${escapeHtml(err.message)}</p>`;
  }
  bloco.classList.remove('hidden');
}

export function initEquipe() {
  el('metasEquipe')?.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-equipe-prof]');
    if (!btn) return;
    const select = el('ganhosProfissional');
    select.value = btn.dataset.equipeProf;
    select.dispatchEvent(new Event('change'));
    el('metasEquipe').querySelectorAll('[data-equipe-prof]').forEach(b => b.toggleAttribute('aria-current', b === btn));
    const reduzir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el('metasDetalhe')?.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
  });
}

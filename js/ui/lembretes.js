// Lembretes de confirmação (D-011). O backend monta a lista e o texto
// (GET /agenda/lembretes); aqui a recepção abre o WhatsApp de cada cliente e
// marca "Confirmou" quando a resposta chega. Nada é enviado automaticamente.
import { api } from '../api.js';
import { loadWeekAgenda } from '../state.js';
import { addDays, escapeHtml, formatDDMM, showBanner, todayStr } from '../utils.js';

const el = id => document.getElementById(id);
const MOTIVO = { sem_whatsapp: 'Sem WhatsApp no cadastro', whatsapp_invalido: 'WhatsApp inválido no cadastro', sem_cliente: 'Sem cliente vinculado' };
let dataAtual = null;

function render(r) {
  const corpo = r.itens.length
    ? r.itens.map(i => `
      <div class="eq-row" data-id="${i.agendamentoId}">
        <div class="eq-quem"><b>${escapeHtml(i.horario)} · ${escapeHtml(i.clienteNome || 'Sem cliente')}</b>
          <span>${escapeHtml([i.servicoNome, i.profissionalNome].filter(Boolean).join(' · '))}</span></div>
        <div class="eq-ctrl">
          ${i.link
            ? `<a class="btn btn-secondary lembrete-zap" href="${escapeHtml(i.link)}" target="_blank" rel="noopener">WhatsApp</a>`
            : `<span class="body-sm text-tertiary">${escapeHtml(MOTIVO[i.motivo] || 'Sem contato')}</span>`}
          <button class="btn" type="button" data-confirmar="${i.agendamentoId}">Confirmou</button>
        </div>
      </div>`).join('')
    : '<p class="body-sm text-tertiary">Nenhum horário pendente de confirmação neste dia.</p>';
  el('lembretesConteudo').innerHTML = `
    <p class="body-sm text-tertiary" id="lembretesResumo">${r.pendentes} a confirmar · ${r.confirmados} já confirmado(s) · ${r.comLink} com WhatsApp</p>
    ${corpo}`;
}

async function carregar(data) {
  dataAtual = data;
  el('lembretesTitulo').textContent = `Lembretes de ${data === addDays(todayStr(), 1) ? 'amanhã' : formatDDMM(data)}`;
  el('lembretesData').value = data;
  el('lembretesConteudo').innerHTML = '<p class="body-sm text-tertiary">Carregando…</p>';
  try {
    render(await api(`/agenda/lembretes?data=${encodeURIComponent(data)}`));
  } catch (err) {
    el('lembretesConteudo').innerHTML = `<p class="body-sm" style="color:var(--md-error)">${escapeHtml(err.message)}</p>`;
  }
}

async function confirmar(id, botao) {
  botao.disabled = true;
  try {
    await api(`/agenda/${id}/status`, { method: 'PATCH', body: { novoStatus: 'confirmado' } });
    showBanner('Horário confirmado.', 'ok');
    await carregar(dataAtual);
    loadWeekAgenda().catch(() => {});
  } catch (err) {
    botao.disabled = false;
    showBanner(err.message, 'error');
  }
}

export function abrirLembretes(data = addDays(todayStr(), 1)) {
  el('lembretesDialog').showModal();
  carregar(data);
}

export function initLembretes() {
  el('btnAgendaLembretes')?.addEventListener('click', () => abrirLembretes());
  el('btnFecharLembretes')?.addEventListener('click', () => el('lembretesDialog').close());
  el('lembretesData')?.addEventListener('change', ev => { if (ev.target.value) carregar(ev.target.value); });
  el('lembretesConteudo')?.addEventListener('click', ev => {
    const b = ev.target.closest('[data-confirmar]');
    if (b) confirmar(b.dataset.confirmar, b);
  });
}

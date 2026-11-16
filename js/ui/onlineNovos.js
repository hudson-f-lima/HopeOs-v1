// Aviso de agendamento online novo para a recepção (C3, D-038). Sem migration: o instante em que
// alguém viu pela última vez fica neste aparelho (localStorage). Com o app aberto e visível, a
// tela pergunta ao servidor a cada minuto quantos agendamentos chegaram pelo link público desde
// então; o botão "N novos online" aparece na agenda e abre a lista.
import { api } from '../api.js';
import { sessionPode } from '../state.js';
import { escapeHtml, formatDDMM } from '../utils.js';

const el = id => document.getElementById(id);
const CHAVE = 'hopeos.onlineVistoAte';
const INTERVALO_MS = 60e3;
let ultimo = null;
let timer = null;

function vistoAte() {
  try { return localStorage.getItem(CHAVE) || null; } catch { return null; }
}
function marcarVisto(iso) {
  try { localStorage.setItem(CHAVE, iso); } catch { /* aparelho sem armazenamento: só some até recarregar */ }
}

function atualizarBotao(r) {
  const b = el('btnOnlineNovos');
  if (!b) return;
  const n = (r && r.total) || 0;
  b.classList.toggle('hidden', n === 0);
  b.textContent = n === 1 ? '1 novo online' : `${n} novos online`;
}

async function consultar() {
  if (document.visibilityState !== 'visible') return;
  const desde = vistoAte();
  try {
    ultimo = await api(`/agenda/online-novos${desde ? `?desde=${encodeURIComponent(desde)}` : ''}`);
    atualizarBotao(ultimo);
  } catch { /* sem rede ou sem permissão: o aviso só não aparece */ }
}

const STATUS = { agendado: 'Agendado', confirmado: 'Confirmado', cancelado: 'Cancelado', reagendado: 'Remarcado', concluido: 'Concluído', fechado: 'Concluído', no_show: 'Faltou' };
function renderLista() {
  const itens = (ultimo && ultimo.itens) || [];
  el('onlineNovosConteudo').innerHTML = itens.length
    ? itens.map(i => `
      <div class="eq-row">
        <div class="eq-quem"><b>${escapeHtml(formatDDMM(i.data))} ${escapeHtml(i.horario)} · ${escapeHtml(i.clienteNome || 'Cliente')}</b>
          <span>${escapeHtml([i.servicoNome, i.profissionalNome, STATUS[i.status] || i.status].filter(Boolean).join(' · '))}</span></div>
      </div>`).join('')
    : '<p class="body-sm text-tertiary">Nada novo.</p>';
}

export function initOnlineNovos() {
  if (!sessionPode('agenda:ver')) return;
  el('btnOnlineNovos')?.addEventListener('click', () => { renderLista(); el('onlineNovosDialog').showModal(); });
  el('btnFecharOnlineNovos')?.addEventListener('click', () => el('onlineNovosDialog').close());
  el('btnOnlineVistos')?.addEventListener('click', () => {
    // O instante do servidor (não o relógio do aparelho) marca até onde foi visto.
    if (ultimo && ultimo.agora) marcarVisto(ultimo.agora);
    ultimo = { total: 0, itens: [] };
    atualizarBotao(ultimo);
    el('onlineNovosDialog').close();
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') consultar(); });
  consultar();
  clearInterval(timer);
  timer = setInterval(consultar, INTERVALO_MS);
}

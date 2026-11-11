// Agenda > "Agora" (D-022): para o profissional, o atendimento do momento em um cartão
// com uma ação principal, e os próximos horários do dia. Reduz a tela dele ao que
// importa: quem está na cadeira, o que fazer e o que vem depois.
// Só leitura do que a agenda já carregou; as ações usam as mesmas rotas da folha de ações.
import { api } from '../api.js';
import { state, stateBus, loadWeekAgenda, findClienteNome, findServicoNome } from '../state.js';
import { escapeHtml, todayStr, showBanner, clearBanner } from '../utils.js';

const el = id => document.getElementById(id);
const ENCERRADOS = ['cancelado', 'reagendado', 'no_show', 'concluido', 'fechado'];
const ROTULO = { agendado: 'Ainda não confirmou', confirmado: 'Confirmado', aguardando: 'Chegou', em_atendimento: 'Na cadeira' };
// Uma ação principal por estado: o próximo passo natural do atendimento.
const ACAO = {
  agendado: { texto: 'Cliente chegou', status: 'aguardando' },
  confirmado: { texto: 'Cliente chegou', status: 'aguardando' },
  aguardando: { texto: 'Iniciar atendimento', status: 'em_atendimento' },
  em_atendimento: { texto: 'Concluir e abrir comanda', comanda: true }
};
const hhmm = h => String(h || '').slice(0, 5);
const ehProfissional = () => Boolean(state.session && state.session.principal === 'user' && state.session.role === 'profissional');

function fim(item) {
  const [h, m] = hhmm(item.horario).split(':').map(Number);
  const t = h * 60 + m + Number(item.duracao_min || 0);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function escolherAtual(itens) {
  return itens.find(i => i.status === 'em_atendimento') || itens.find(i => i.status === 'aguardando') || itens[0] || null;
}

function render() {
  const card = el('agoraCard');
  if (!card) return;
  if (!ehProfissional()) { card.classList.add('hidden'); return; }
  const doDia = (state.weekAgenda[todayStr()] || []).filter(i => !ENCERRADOS.includes(i.status)).sort((a, b) => hhmm(a.horario).localeCompare(hhmm(b.horario)));
  const atual = escolherAtual(doDia);
  card.classList.remove('hidden');
  if (!atual) {
    card.innerHTML = '<p class="agora-vazio">Nenhum atendimento pendente hoje.</p>';
    return;
  }
  const acao = ACAO[atual.status];
  const naCadeira = atual.status === 'em_atendimento';
  const proximos = doDia.filter(i => i.id !== atual.id).slice(0, 3);
  card.innerHTML = `
    <div class="agora-topo">
      <span class="agora-estado${naCadeira ? ' agora-estado-ativo' : ''}" id="agoraEstado" data-status="${escapeHtml(atual.status)}">${naCadeira ? 'Na cadeira agora' : 'Próximo atendimento'}</span>
      <span class="agora-hora">${hhmm(atual.horario)}–${fim(atual)}</span>
    </div>
    <p class="agora-cliente" id="agoraCliente">${escapeHtml(findClienteNome(atual.cliente_id))}</p>
    <p class="agora-servico">${escapeHtml(findServicoNome(atual.servico_id))} · ${escapeHtml(ROTULO[atual.status] || atual.status)}</p>
    ${acao ? `<button type="button" class="btn btn-primary" id="btnAgoraAcao" data-agora-id="${escapeHtml(atual.id)}">${escapeHtml(acao.texto)}</button>` : ''}
    ${proximos.length ? `<h3 class="agora-titulo">A seguir</h3>
      ${proximos.map(i => `<div class="agora-linha"><span class="agora-linha-hora">${hhmm(i.horario)}</span><span class="agora-linha-texto"><b>${escapeHtml(findClienteNome(i.cliente_id))}</b><span>${escapeHtml(findServicoNome(i.servico_id))} · ${escapeHtml(ROTULO[i.status] || i.status)}</span></span></div>`).join('')}` : ''}`;
}

async function executar(id) {
  const item = (state.weekAgenda[todayStr()] || []).find(i => i.id === id);
  const acao = item && ACAO[item.status];
  if (!acao) return;
  if (acao.comanda) { stateBus.dispatchEvent(new CustomEvent('checkout:prefill', { detail: item })); return; }
  const botao = el('btnAgoraAcao');
  botao.disabled = true;
  clearBanner();
  try {
    await api(`/agenda/${id}/status`, { method: 'PATCH', body: { novoStatus: acao.status } });
    await loadWeekAgenda();
  } catch (err) {
    showBanner(err.message, 'error');
    botao.disabled = false;
  }
}

export function initAgora() {
  const card = el('agoraCard');
  if (!card) return;
  card.addEventListener('click', ev => {
    const botao = ev.target.closest('#btnAgoraAcao');
    if (botao) executar(botao.dataset.agoraId);
  });
  stateBus.addEventListener('agenda:updated', render);
  stateBus.addEventListener('catalog:updated', render);
  render();
}

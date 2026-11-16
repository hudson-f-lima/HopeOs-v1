// Recorrência pela equipe (C4, D-039). "Repetir" no novo agendamento: o servidor mostra a prévia
// (quais datas estão livres e quais serão puladas) e só então grava. No card de um horário da
// série: cancelar ou alterar "só este", "este e os próximos" ou "todos". Nada é encaixado à força:
// o que não couber fica de fora e a tela diz qual.
import { api } from '../api.js';
import { state, sessionPode, loadWeekAgenda } from '../state.js';
import { escapeHtml, showBanner, formatDDMM } from '../utils.js';

const el = id => document.getElementById(id);
const SITUACAO = { conflito: 'horário ocupado', fora_da_disponibilidade: 'fora da escala', passado: 'já passou', mudou: 'mudou no meio', livre: 'livre' };
const FREQ = { semanal: 'toda semana', quinzenal: 'a cada 15 dias', mensal: 'todo mês' };
let alvo = null; // { item, acao: 'cancelar' | 'alterar' }

export function repeticaoEscolhida() {
  const f = el('agRepetir') && el('agRepetir').value;
  if (!f) return null;
  return { frequencia: f, ocorrencias: Number(el('agOcorrencias').value) || 8 };
}

export function resetRepeticao() {
  if (el('agRepetir')) el('agRepetir').value = '';
  if (el('agOcorrencias')) el('agOcorrencias').value = '8';
  el('agOcorrenciasBox')?.classList.add('hidden');
}

const lista = ocorrencias => ocorrencias.map(o => `${formatDDMM(o.data)} (${SITUACAO[o.situacao] || o.situacao})`).join(', ');

// Prévia → confirmação → gravação. Devolve true quando a série foi criada.
export async function criarSerieComPrevia({ clienteId, servicoId, profissionalId, data, horario }, repeticao) {
  if (!clienteId) { showBanner('Série recorrente precisa de um cliente.', 'error'); return false; }
  const corpo = { clienteId, servicoId, profissionalId, dataInicio: data, horario, frequencia: repeticao.frequencia, ocorrencias: repeticao.ocorrencias };
  let previa;
  try { previa = await api('/agenda/series/previa', { method: 'POST', body: corpo }); } catch (err) { showBanner(err.message, 'error'); return false; }
  const fora = previa.ocorrencias.filter(o => o.situacao !== 'livre');
  if (!previa.livres) { showBanner(`Nenhuma data livre nesse horário: ${lista(fora)}.`, 'error'); return false; }
  const texto = `${previa.total} horários ${FREQ[repeticao.frequencia]}, às ${horario}.\n\n${previa.livres} livres.` +
    (fora.length ? `\n${fora.length} ficam de fora: ${lista(fora)}.` : '') + '\n\nCriar a série?';
  if (!window.confirm(texto)) return false;
  try {
    const r = await api('/agenda/series', { method: 'POST', body: corpo });
    const pulados = r.pulados.length ? ` ${r.pulados.length} ficaram de fora: ${lista(r.pulados)}.` : '';
    showBanner(`Série criada: ${r.criados.length} horários.${pulados}`, r.pulados.length ? 'warning' : 'ok');
    await loadWeekAgenda();
    return true;
  } catch (err) { showBanner(err.message, 'error'); return false; }
}

// Botões do card de um horário da série (o card chama isto ao montar as ações).
export function acoesDaSerie(item) {
  if (!item || !item.serie_id || !['agendado', 'confirmado'].includes(item.status)) return '';
  const botoes = [];
  if (sessionPode('agenda:cancelar')) botoes.push('<button class="btn danger" data-sheet-action="serie-cancelar">Cancelar na série…</button>');
  if (sessionPode('agenda:editar')) botoes.push('<button class="btn" data-sheet-action="serie-alterar">Alterar na série…</button>');
  return botoes.length ? `<p class="body-sm text-tertiary" style="margin:8px 0 4px;">Horário de uma série recorrente (${escapeHtml(String(item.serie_seq || ''))}ª)</p>${botoes.join('')}` : '';
}

export function abrirSerie(item, acao) {
  alvo = { item, acao };
  el('serieTitulo').textContent = acao === 'cancelar' ? 'Cancelar na série' : 'Alterar na série';
  el('serieAlterarCampos').classList.toggle('hidden', acao !== 'alterar');
  el('serieHorario').value = String(item.horario || '').slice(0, 5);
  const sel = el('serieProfissional');
  sel.innerHTML = '<option value="">Mesmo profissional</option>' + (state.catalog.profissionais || [])
    .filter(p => p.ativo !== false && p.id !== item.profissional_id)
    .map(p => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.nome)}</option>`).join('');
  el('serieMsg').textContent = '';
  for (const r of document.querySelectorAll('input[name="serieEscopo"]')) r.checked = r.value === 'este';
  el('btnSerieConfirmar').textContent = acao === 'cancelar' ? 'Cancelar horários' : 'Alterar horários';
  el('serieDialog').showModal();
}

async function confirmar() {
  if (!alvo) return;
  const escopo = (document.querySelector('input[name="serieEscopo"]:checked') || {}).value || 'este';
  const body = { escopo, agendamentoId: alvo.item.id };
  if (alvo.acao === 'alterar') {
    const h = el('serieHorario').value;
    const p = el('serieProfissional').value;
    if (h && h !== String(alvo.item.horario || '').slice(0, 5)) body.novoHorario = h;
    if (p) body.novoProfissionalId = p;
    if (!body.novoHorario && !body.novoProfissionalId) { el('serieMsg').textContent = 'Mude o horário ou o profissional.'; return; }
  }
  el('btnSerieConfirmar').disabled = true;
  try {
    const r = await api(`/agenda/series/${alvo.item.serie_id}/${alvo.acao}`, { method: 'POST', body });
    if (alvo.acao === 'cancelar') {
      showBanner(`${r.cancelados.length} horário(s) cancelado(s).${r.serieEncerrada ? ' A série foi encerrada.' : ''}`, 'ok');
    } else {
      const fora = r.mantidos.length ? ` ${r.mantidos.length} ficaram como estavam: ${lista(r.mantidos)}.` : '';
      showBanner(`${r.alterados.length} horário(s) alterado(s).${fora}`, r.mantidos.length ? 'warning' : 'ok');
    }
    el('serieDialog').close();
    await loadWeekAgenda();
  } catch (err) {
    el('serieMsg').textContent = err.message;
  } finally { el('btnSerieConfirmar').disabled = false; }
}

export function initSeries() {
  if (sessionPode('agenda:recorrencia')) el('agRepetirBox')?.classList.remove('hidden');
  el('agRepetir')?.addEventListener('change', ev => el('agOcorrenciasBox').classList.toggle('hidden', !ev.target.value));
  el('btnSerieConfirmar')?.addEventListener('click', confirmar);
  el('btnSerieFechar')?.addEventListener('click', () => el('serieDialog').close());
}

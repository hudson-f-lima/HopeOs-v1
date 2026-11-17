// Agenda → calendário do mês (D-050). Mostra, por dia, o estado da unidade (aberta, fechada,
// horário especial, sem horário), quantos agendamentos e quantos CONFLITOS (agendamento fora da
// disponibilidade do profissional, que ficou por decisão "manter" ou encaixe). Tudo vem do servidor
// (/disponibilidade/mes); a tela só desenha. Estado com símbolo e texto, não só cor.
//   - tocar num dia leva a agenda para ele;
//   - "Escolher datas" (quem tem escala:lote): marca datas não consecutivas e aplica ausência,
//     bloqueio, horário especial ou fechamento a um, vários ou todos (abre o lote com a prévia).
//   - o filtro de profissionais da agenda vale aqui também.
import { api } from '../api.js';
import { state, sessionPode, loadWeekAgenda, activeProfissionais } from '../state.js';
import { escapeHtml, startOfWeek, todayStr, showBanner } from '../utils.js';

const el = id => document.getElementById(id);
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
// Símbolo + rótulo por estado (o rótulo vai para o leitor de tela e a legenda).
const ESTADO = {
  aberta: { s: '', rotulo: 'aberto' },
  especial: { s: '★', rotulo: 'horário especial' },
  fechada: { s: '✕', rotulo: 'fechado' },
  sem_horario: { s: '–', rotulo: 'sem expediente' }
};

let mes = null; // 'AAAA-MM'
let dados = null;
let escolhendo = false;
const escolhidas = new Set();
let abrirLoteComDatas = null; // ligado por initAgendaMes (evita importar escalas.js aqui)

const mesDe = d => d.slice(0, 7);
const somaMes = (m, n) => { const [a, b] = m.split('-').map(Number); const x = new Date(Date.UTC(a, b - 1 + n, 1)); return x.toISOString().slice(0, 7); };

// Filtro de vários profissionais (vazio = todos). Também usado pela grade da agenda.
export function profsFiltrados() {
  const sel = state.profsVisiveis;
  return !sel || !sel.size ? null : [...sel];
}

async function carregar() {
  const filtro = profsFiltrados();
  const q = '/disponibilidade/mes?mes=' + mes + (filtro ? '&profissionalIds=' + encodeURIComponent(filtro.join(',')) : '');
  el('agMesDias').setAttribute('aria-busy', 'true');
  try { dados = await api(q); } catch (err) { dados = null; el('agMesDias').innerHTML = '<p class="body-sm" role="alert">' + escapeHtml(err.message) + '</p>'; return; }
  finally { el('agMesDias').removeAttribute('aria-busy'); }
  desenhar();
}

function desenhar() {
  const [a, b] = mes.split('-').map(Number);
  el('agMesTitulo').textContent = MESES[b - 1] + ' ' + a;
  const primeiro = new Date(Date.UTC(a, b - 1, 1)).getUTCDay();
  const hoje = todayStr();
  const vazios = Array.from({ length: primeiro }, () => '<span class="agm-vazio" aria-hidden="true"></span>').join('');
  const dias = (dados ? dados.dias : []).map(d => {
    const e = ESTADO[d.unidade] || ESTADO.aberta;
    const partes = [Number(d.data.slice(8, 10)) + ' de ' + MESES[b - 1].toLowerCase(), e.rotulo];
    if (d.agendamentos) partes.push(d.agendamentos + ' agendamento(s)');
    if (d.conflitos) partes.push(d.conflitos + ' conflito(s)');
    if (d.ausencias) partes.push(d.ausencias + ' ausência(s) ou bloqueio(s)');
    if (d.motivo) partes.push(d.motivo);
    const marcado = escolhendo && escolhidas.has(d.data);
    const classes = ['agm-dia', 'agm-' + d.unidade, d.data === state.selectedDay ? 'agm-sel' : '', d.data === hoje ? 'agm-hoje' : '', marcado ? 'agm-marcado' : '', d.conflitos ? 'agm-tem-conflito' : ''].filter(Boolean).join(' ');
    return '<button type="button" class="' + classes + '" data-agm-dia="' + d.data + '" aria-label="' + escapeHtml(partes.join(', ')) + '"' + (escolhendo ? ' aria-pressed="' + marcado + '"' : '') + '>'
      + '<span class="agm-num">' + Number(d.data.slice(8, 10)) + '</span>'
      + '<span class="agm-est" aria-hidden="true">' + e.s + '</span>'
      + (d.agendamentos ? '<span class="agm-qtd" aria-hidden="true">' + d.agendamentos + '</span>' : '')
      + (d.conflitos ? '<span class="agm-conf" aria-hidden="true">⚠' + d.conflitos + '</span>' : '')
      + '</button>';
  }).join('');
  el('agMesDias').innerHTML = SEMANA.map(s => '<span class="agm-sem" aria-hidden="true">' + s + '</span>').join('') + vazios + dias;
  el('agMesEscolha').classList.toggle('hidden', !escolhendo);
  el('agMesEscolhaTxt').textContent = escolhidas.size ? escolhidas.size + ' data(s) escolhida(s)' : 'Toque nas datas (podem ser separadas).';
  el('btnAgMesAplicar').disabled = !escolhidas.size;
  el('btnAgMesEscolher').textContent = escolhendo ? 'Cancelar escolha' : 'Escolher datas';
  el('btnAgMesEscolher').setAttribute('aria-pressed', String(escolhendo));
}

async function irPara(data) {
  state.selectedDay = data;
  state.currentWeekStart = startOfWeek(data);
  try { await loadWeekAgenda(); } catch (err) { showBanner('Agenda: ' + err.message, 'error'); }
}

export function abrirMes() {
  const painel = el('agMes');
  const abrir = painel.classList.contains('hidden');
  painel.classList.toggle('hidden', !abrir);
  el('btnAgMes').setAttribute('aria-expanded', String(abrir));
  if (!abrir) return;
  mes = mesDe(state.selectedDay || todayStr());
  carregar();
}

// Filtro de profissionais: chips; vazio = todos. A grade e o mês usam o mesmo filtro.
export function desenharFiltro() {
  const box = el('agFiltroProfs');
  if (!box) return;
  const profs = activeProfissionais();
  if (profs.length < 2) { box.innerHTML = ''; return; }
  const sel = state.profsVisiveis || new Set();
  box.innerHTML = '<button type="button" class="chip' + (!sel.size ? ' selected' : '') + '" data-agf="" aria-pressed="' + !sel.size + '">Todos</button>'
    + profs.map(p => '<button type="button" class="chip' + (sel.has(p.id) ? ' selected' : '') + '" data-agf="' + escapeHtml(p.id) + '" aria-pressed="' + sel.has(p.id) + '">' + escapeHtml(p.nome) + '</button>').join('');
}

export function initAgendaMes({ aoFiltrar, abrirLote }) {
  if (!el('agMes')) return;
  abrirLoteComDatas = abrirLote;
  state.profsVisiveis = state.profsVisiveis || new Set();
  el('btnAgMes').addEventListener('click', abrirMes);
  el('btnAgMesAnt').addEventListener('click', () => { mes = somaMes(mes, -1); carregar(); });
  el('btnAgMesProx').addEventListener('click', () => { mes = somaMes(mes, 1); carregar(); });
  el('btnAgMesEscolher').classList.toggle('hidden', !sessionPode('escala:lote'));
  el('btnAgMesEscolher').addEventListener('click', () => { escolhendo = !escolhendo; escolhidas.clear(); desenhar(); });
  el('btnAgMesAplicar').addEventListener('click', () => {
    if (!escolhidas.size || !abrirLoteComDatas) return;
    abrirLoteComDatas([...escolhidas].sort());
  });
  el('agMesDias').addEventListener('click', ev => {
    const b = ev.target.closest('[data-agm-dia]');
    if (!b) return;
    const d = b.dataset.agmDia;
    if (escolhendo) { if (escolhidas.has(d)) escolhidas.delete(d); else escolhidas.add(d); desenhar(); return; }
    irPara(d).then(() => desenhar());
  });
  el('agFiltroProfs').addEventListener('click', ev => {
    const b = ev.target.closest('[data-agf]');
    if (!b) return;
    const id = b.dataset.agf;
    if (!id) state.profsVisiveis.clear();
    else if (state.profsVisiveis.has(id)) state.profsVisiveis.delete(id);
    else state.profsVisiveis.add(id);
    desenharFiltro();
    aoFiltrar();
    if (!el('agMes').classList.contains('hidden')) carregar();
  });
  // Mudou a agenda (gravou, remarcou, aplicou lote): o mês aberto recarrega.
  document.addEventListener('escala:mudou', () => { if (!el('agMes').classList.contains('hidden')) carregar(); });
}

export function recarregarMesSeAberto() { if (el('agMes') && !el('agMes').classList.contains('hidden')) carregar(); }

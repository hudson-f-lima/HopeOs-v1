import { showToast } from './toast.js';
import { resetClienteRapido, initClienteRapido } from './clienteRapido.js';
import { initAgendaMes, desenharFiltro, recarregarMesSeAberto, profsNaGrade, atualizarPaineis } from './agendaMes.js';
import { htmlCampos, htmlCliente, initCardAgendamento, resetarEditor, confirmarRegras, textoCancelamento, atrasoMin, usaChegada } from './agendaCard.js';
import { bloqueiosDoDia, htmlBloqueios, abrirHorarioLivre, abrirBloqueio, initAgendaBloqueio, htmlFora, foraDaEscala, carregarGradeDia, gradeDoDia, motivoIncerto } from './agendaBloqueio.js';
import { extrasEscolhidos, resetExtras, abrirOpcoes, acoesDoAtendimento, abrirEtapas } from './atendimento.js';
import { repeticaoEscolhida, resetRepeticao, criarSerieComPrevia, acoesDaSerie, abrirSerie, verSerie } from './series.js';
import { api, getClientReliability, getListaEspera, getAgendaSlots, getAgendaHistorico } from '../api.js';
import { state, stateBus, sessionRoleIn, activeProfissionais, findClienteNome, findServicoNome, findProfissionalNome, findAgendaItemById, computeEndTime, loadWeekAgenda, PROF_COLORS, sessionPode, podeFecharAtendimento, semanaPronta } from '../state.js';
import {
  todayStr,
  addDays,
  startOfWeek,
  weekDates,
  formatDDMM,
  WEEKDAY_LABELS,
  showBanner,
  clearBanner,
  openModal,
  closeModal,
  confirmAction,
  escolherOpcao,
  escapeHtml,
  getInitials,
  waLink,
  centsToBRL
} from '../utils.js';

// Zoom da grade (D-083): escolha deste aparelho, em pixels por minuto. Normal = 3, como antes.
export const ZOOMS = { compacto: 2, normal: 3, largo: 4 };
function lerZoom() {
  try { const v = localStorage.getItem('hopeos.agenda.zoom'); if (Object.hasOwn(ZOOMS, v)) return v; } catch { /* sem armazenamento: padrão */ }
  return 'normal';
}
export let ZOOM = lerZoom();
export let PX_POR_MIN = ZOOMS[ZOOM];
export function definirZoom(nome) {
  if (!Object.hasOwn(ZOOMS, nome)) return;
  ZOOM = nome; PX_POR_MIN = ZOOMS[nome];
  TIMELINE_TOTAL_HEIGHT = (HORA_FIM - HORA_INICIO) * 60 * PX_POR_MIN;
  try { localStorage.setItem('hopeos.agenda.zoom', nome); } catch { /* vale só nesta sessão */ }
}
// Janela da grade (D-074): começa em 8h–20h e cresce até a escala do dia e até os atendimentos
// dos profissionais na tela. Nunca encolhe abaixo de 8h–20h: o trecho fora da escala continua
// tocável para encaixe, e nenhum atendimento fica fora da tela (antes, um horário às 7h sumia).
const JANELA_PADRAO = [8, 20];
export let HORA_INICIO = JANELA_PADRAO[0];
export let HORA_FIM = JANELA_PADRAO[1];
export const GRID_MIN = 20;
// Passo do arraste e do redimensionamento (D-081): escolha deste aparelho, padrão 10 min. A grade de
// toque dos horários livres continua de 20 (alvo de toque); o card pode parar entre as linhas.
export const PASSOS_ARRASTE = [5, 10, 15, 20, 30];
function lerPasso() {
  try { const v = Number(localStorage.getItem('hopeos.agenda.passo')); if (PASSOS_ARRASTE.includes(v)) return v; } catch { /* sem armazenamento: padrão */ }
  return 10;
}
export let SNAP_MIN = lerPasso();
export function definirPasso(v) {
  if (!PASSOS_ARRASTE.includes(v)) return;
  SNAP_MIN = v;
  try { localStorage.setItem('hopeos.agenda.passo', String(v)); } catch { /* vale só nesta sessão */ }
}
// "09:40–11:00 (80 min)": a mesma etiqueta no arraste e nas duas alças (D-081).
function rotuloHorario(iniMinDaGrade, dur) {
  return `${minutesSinceStartToHHMM(iniMinDaGrade)}–${minutesSinceStartToHHMM(iniMinDaGrade + dur)} (${dur} min)`;
}
export let TIMELINE_TOTAL_HEIGHT = (HORA_FIM - HORA_INICIO) * 60 * PX_POR_MIN;

export const AGENDA_STATUS_META = {
  agendado: { label: 'Agendado', cls: 'badge' },
  confirmado: { label: 'Confirmado', cls: 'badge badge-confirmado' },
  no_show: { label: 'No-show', cls: 'badge badge-noshow' },
  cancelado: { label: 'Cancelado', cls: 'badge badge-cancelado' },
  aguardando: { label: 'Chegou', cls: 'badge badge-confirmado' },
  em_atendimento: { label: 'Na cadeira', cls: 'badge badge-confirmado' },
  concluido: { label: 'Concluído', cls: 'badge badge-concluido' },
  reagendado: { label: 'Reagendado', cls: 'badge badge-cancelado' }
};

// Card da agenda (D-077, cards etapa 2). A cor é do serviço, sempre suave (fundo claro, texto escuro;
// no tema escuro, o inverso). A intensidade por serviço depende de coluna nova (migration 028+,
// não autorizada): até lá, todos suaves. Matiz pela categoria conhecida; sem categoria conhecida,
// um matiz estável pelo id do serviço (cada serviço fica sempre com a mesma cor).
const MATIZ_CATEGORIA = { corte: 215, barba: 200, manicure: 330, pedicure: 330, coloracao: 28, quimica: 28, estetica: 150, tratamento: 150 };
const MATIZES = [215, 265, 330, 28, 150, 190, 95, 0, 45, 285, 175, 240];
const SVG_ST = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// Situação no canto superior (a cor do card nunca muda com a situação).
const SITUACAO_CARD = {
  agendado: { nome: 'Agendado', svg: SVG_ST('<circle cx="12" cy="12" r="8"/>') },
  confirmado: { nome: 'Confirmado', svg: SVG_ST('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>') },
  aguardando: { nome: 'Chegou', svg: SVG_ST('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5M15 12H3"/>') },
  em_atendimento: { nome: 'Em atendimento', svg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="6"/></svg>' },
  concluido: { nome: 'Concluído', svg: SVG_ST('<path d="m4 12 5 5 11-11"/>') },
  pago: { nome: 'Concluído e pago', svg: SVG_ST('<path d="m2 13 4 4 8-9M10 17l1 1 10-11"/>') },
  no_show: { nome: 'Faltou', svg: SVG_ST('<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>') }
};
const ESTRELA = cor => `<svg viewBox="0 0 24 24" fill="${cor}" aria-hidden="true"><path d="M12 2.5l2.9 6.2 6.6.7-5 4.5 1.4 6.6L12 17.2l-5.9 3.3 1.4-6.6-5-4.5 6.6-.7z"/></svg>`;
const TRACO = d => `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// Só os 7 ícones com dado gravado (skill agenda-cards). O servidor diz quais valem (GET /agenda?marcadores=1).
// D-080: estrela amarela = plano ativo e pago; vermelha = atrasado ou suspenso; "$" verde = pago no
// local (comanda fechada no caixa; vem de `pago`, não dos marcadores). `porque` alimenta a legenda.
export const ICONES_CARD = {
  assinatura: { nome: 'Assinante em dia', porque: 'Plano de assinatura ativo, com o mês pago.', cor: '#facc15', html: ESTRELA('#422006') },
  assinatura_atraso: { nome: 'Assinatura em atraso', porque: 'Pagamento do plano atrasado ou suspenso.', cor: '#b91c1c', html: ESTRELA('#fff') },
  pago_local: { nome: 'Pago no local', porque: 'Comanda fechada no caixa do salão.', cor: '#15803d', html: '<b>$</b>' },
  primeira_visita: { nome: 'Primeira visita', porque: 'Nenhum atendimento concluído antes.', cor: '#0f766e', html: '<b>1ª</b>' },
  recorrente: { nome: 'Horário recorrente', porque: 'Faz parte de uma série (semanal, quinzenal…).', cor: '#4338ca', html: TRACO('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>') },
  link: { nome: 'Agendou pelo link', porque: 'O próprio cliente marcou pelo link do salão.', cor: '#0369a1', html: TRACO('<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>') },
  espera: { nome: 'Veio da lista de espera', porque: 'O horário foi dado a quem esperava vaga.', cor: '#6d28d9', html: TRACO('<path d="M6 2h12M6 22h12M7 2c0 6 10 6 10 10S7 16 7 22M17 2c0 6-10 6-10 10s10 4 10 10"/>') },
  faltas: { nome: 'Histórico de faltas', porque: 'Cliente na régua de faltas do salão.', cor: '#c2410c', html: '<b>!</b>' }
};
// Ícones de um card na ordem do card: os do servidor e, se pago, o "$" logo depois das estrelas.
export function codigosDoCard(item) {
  const c = (Array.isArray(item.marcadores) ? item.marcadores : []).filter(k => ICONES_CARD[k]);
  if (item.pago === true) c.splice(c.filter(k => k.startsWith('assinatura')).length, 0, 'pago_local');
  return c;
}

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function toTop(hora, minuto) { return ((hora - HORA_INICIO) * 60 + minuto) * PX_POR_MIN; }
function toHeight(duracaoMin) { return duracaoMin * PX_POR_MIN; }

// Contadores e grade com o MESMO escopo (D-053): ativos dos profissionais que a grade mostra.
function activeAgendaItemsForDate(dateStr) {
  const ids = new Set(profsNaGrade().map(p => p.id));
  return (state.weekAgenda[dateStr] || []).filter(i => i.status !== 'cancelado' && i.status !== 'reagendado' && ids.has(i.profissional_id));
}


function formatAgendaDate(dateStr) {
  const dt = new Date(dateStr + 'T12:00:00');
  return `${WEEKDAY_LABELS[dt.getDay()]}, ${dt.getDate()} de ${MONTH_LABELS[dt.getMonth()]}`;
}

function profItemsForDay(profId) {
  return (state.weekAgenda[state.selectedDay] || []).filter(
    i => i.profissional_id === profId && i.status !== 'cancelado' && i.status !== 'reagendado'
  );
}

// Lado a lado (D-085): atendimentos que se cruzam na mesma coluna dividem a largura, como numa agenda
// de calendário. Cada grupo de cards que se tocam (direta ou indiretamente) recebe faixas; o card vai
// para a primeira faixa livre e a largura é a do grupo. O cruzamento é pelo horário real: dois
// atendimentos seguidos (11:00–11:10 e 11:10) não ficam lado a lado, porque não são ao mesmo tempo.
export function faixasDaColuna(itens) {
  const lista = itens.map(i => {
    const ini = itemStartMinutes(i);
    return { id: i.id, ini, fim: ini + (Number(i.duracao_min) || 30) };
  }).sort((a, b) => a.ini - b.ini || b.fim - a.fim);
  const faixas = new Map();
  let grupo = []; let fimGrupo = -Infinity; let fins = [];
  const fechar = () => { grupo.forEach(g => faixas.set(g.id, { faixa: g.faixa, de: fins.length })); grupo = []; fins = []; };
  for (const c of lista) {
    if (c.ini >= fimGrupo) { fechar(); fimGrupo = -Infinity; }
    let f = fins.findIndex(fim => fim <= c.ini);
    if (f < 0) { f = fins.length; fins.push(c.fim); } else fins[f] = c.fim;
    grupo.push({ id: c.id, faixa: f });
    fimGrupo = Math.max(fimGrupo, c.fim);
  }
  fechar();
  return faixas;
}
const iniciais = nome => String(nome || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');

function itemStartMinutes(item) {
  const [h, m] = String(item.horario).slice(0, 5).split(':').map(Number);
  return (h - HORA_INICIO) * 60 + m;
}

const minDoDia = hhmmTxt => { const [h, m] = String(hhmmTxt).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const ATIVOS_NA_GRADE = it => !['concluido', 'no_show', 'cancelado', 'reagendado'].includes(it.status);

// Calcula a janela do dia para os profissionais na tela e atualiza HORA_INICIO/HORA_FIM.
// Devolve quantas horas o início andou (para manter a mesma parte da grade na tela).
function ajustarJanela(dia, profs) {
  let ini = JANELA_PADRAO[0] * 60; let fim = JANELA_PADRAO[1] * 60;
  const g = gradeDoDia(dia);
  for (const p of profs) {
    for (const x of (g && g[p.id] && g[p.id].periodos) || []) { ini = Math.min(ini, minDoDia(x.inicio)); fim = Math.max(fim, minDoDia(x.fim)); }
    for (const it of profItemsForDay(p.id)) {
      const a = minDoDia(it.horario); ini = Math.min(ini, a); fim = Math.max(fim, a + (Number(it.duracao_min) || 30));
    }
  }
  const novoIni = Math.max(0, Math.floor(ini / 60)); const novoFim = Math.min(24, Math.ceil(fim / 60));
  const deslocamento = HORA_INICIO - novoIni;
  HORA_INICIO = novoIni; HORA_FIM = novoFim;
  TIMELINE_TOTAL_HEIGHT = (HORA_FIM - HORA_INICIO) * 60 * PX_POR_MIN;
  return deslocamento;
}

// Atendimentos ativos fora da escala no dia (os mesmos que o card marca com ⚠ fora da escala).
function foraDaEscalaNoDia(dia, profs) {
  return profs.flatMap(p => profItemsForDay(p.id).filter(it => {
    if (!ATIVOS_NA_GRADE(it)) return false;
    const a = minDoDia(it.horario);
    return foraDaEscala(it.profissional_id, dia, a, a + (Number(it.duracao_min) || 30));
  })).sort((x, y) => minDoDia(x.horario) - minDoDia(y.horario));
}

// Selo "N fora da escala" (D-074): pequeno, ao lado do total do dia; tocar leva ao primeiro.
function atualizarSeloFora(dia, profs) {
  const selo = document.getElementById('agSeloFora');
  if (!selo) return;
  const lista = foraDaEscalaNoDia(dia, profs);
  selo.classList.toggle('hidden', !lista.length);
  selo.dataset.alvo = lista.length ? lista[0].id : '';
  selo.textContent = lista.length + ' fora';
  selo.setAttribute('aria-label', lista.length + (lista.length === 1 ? ' atendimento' : ' atendimentos') + ' fora da escala neste dia. Tocar mostra o primeiro.');
}

function irParaForaDaEscala() {
  const id = document.getElementById('agSeloFora')?.dataset.alvo;
  const bloco = id && document.querySelector('.ag-block[data-ag-id="' + CSS.escape(id) + '"]');
  const cont = document.getElementById('timelineContainer');
  if (!bloco || !cont) return;
  const reduzir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  cont.scrollTo({ top: Math.max(0, bloco.offsetTop - 16), behavior: reduzir ? 'auto' : 'smooth' });
  bloco.classList.add('ag-flash');
  setTimeout(() => bloco.classList.remove('ag-flash'), 1600);
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
  // Bloqueio e ausência (D-046): o trecho não é oferecido como livre.
  for (const b of bloqueiosDoDia(profId, state.selectedDay)) occupied.push([b.ini - HORA_INICIO * 60, b.fim - HORA_INICIO * 60]);
  const totalMin = (HORA_FIM - HORA_INICIO) * 60;
  const slots = [];
  for (let m = 0; m < totalMin; m += GRID_MIN) {
    const slotEnd = m + GRID_MIN;
    if (!occupied.some(([s, e]) => m < e && slotEnd > s)) slots.push(m);
  }
  return slots;
}

function matizDoServico(item) {
  const id = item.servico_id || item.servicoId || '';
  const servico = state.catalog.servicos.find(s => s.id === id);
  const cat = ((servico && servico.categoria) || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const [chave, matiz] of Object.entries(MATIZ_CATEGORIA)) if (cat.includes(chave)) return matiz;
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MATIZES[h % MATIZES.length];
}

const horaDoMinuto = min => String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

export function iconesDoCard(codigos) {
  return (Array.isArray(codigos) ? codigos : []).filter(c => ICONES_CARD[c]).map(c => {
    const i = ICONES_CARD[c];
    return `<span class="ag-ic" data-icone="${c}" style="background:${i.cor}" title="${escapeHtml(i.nome)}" role="img" aria-label="${escapeHtml(i.nome)}">${i.html}</span>`;
  }).join('');
}

// Densidade pela duração (D-077): horário, cliente, ícones e situação sempre; o serviço a partir de
// 30 min; o aviso (observações) a partir de 45 min. O que não cabe corta com reticências.
function renderAgBlock(item, lado = { faixa: 0, de: 1 }) {
  const top = itemStartMinutes(item) * PX_POR_MIN;
  const duracao = item.duracao_min || 30;
  const height = toHeight(duracao);
  const horario = String(item.horario).slice(0, 5);
  const [hIni, mIni] = horario.split(':').map(Number);
  const fim = horaDoMinuto(hIni * 60 + mIni + duracao);
  const compact = duracao <= 20;
  const pago = item.pago === true;
  const situacao = SITUACAO_CARD[pago ? 'pago' : item.status] || SITUACAO_CARD.agendado;

  // Conflito visível (D-050): agendamento fora do horário de trabalho do dia ou sobre bloqueio.
  // Fica marcado até alguém resolver (remarcar ou cancelar); nada é movido sozinho.
  const iniDia = HORA_INICIO * 60 + itemStartMinutes(item);
  const ativo = !['concluido', 'no_show', 'cancelado', 'reagendado'].includes(item.status);
  const conflito = ativo && (foraDaEscala(item.profissional_id, state.selectedDay, iniDia, iniDia + duracao)
    ? 'fora da escala'
    : bloqueiosDoDia(item.profissional_id, state.selectedDay).some(b => iniDia < b.fim && iniDia + duracao > b.ini) ? 'sobre bloqueio' : '');

  const isEditable = !['concluido', 'no_show'].includes(item.status);
  // Zonas do card (D-081): faixa de cima muda o início (fim parado); faixa de baixo muda o fim; o meio
  // arrasta. Card com menos de 30 min só tem a de baixo, para sobrar meio para pegar.
  const comTopo = isEditable && duracao >= 30;
  const dragHtml = comTopo ? `<div class="resize-handle resize-topo" data-ag-id="${item.id}" data-modo="inicio" aria-hidden="true"></div>` : '';
  const resizeHtml = isEditable ? `<div class="resize-handle" data-ag-id="${item.id}" data-modo="fim" aria-hidden="true"></div>` : '';
  const cliente = findClienteNome(item.cliente_id);
  const servico = findServicoNome(item.servico_id);
  const codigos = codigosDoCard(item);
  const icones = iconesDoCard(codigos);
  const nomesIcones = codigos.map(c => ICONES_CARD[c].nome);
  const cls = ['ag-block', 'ag-card'];
  // Com 3 ou mais lado a lado, o card fica estreito: horário e iniciais (o nome inteiro fica no toque e no leitor de tela).
  const estreito = lado.de >= 3;
  if (lado.de > 1) cls.push('ag-lado');
  if (estreito) cls.push('ag-estreito');
  if (compact) cls.push('compact');
  if (isEditable) cls.push('editavel');
  if (comTopo) cls.push('com-topo');
  if (conflito) cls.push('ag-conflito');
  if (item.status === 'no_show') cls.push('st-falta');
  if (pago) cls.push('ag-pago');
  const stHtml = `<span class="ag-st" title="${escapeHtml(situacao.nome)}" role="img" aria-label="${escapeHtml(situacao.nome)}">${situacao.svg}</span>`;
  const tag = conflito ? '<span class="ag-conf-tag">⚠ ' + conflito + '</span> ' : '';
  const line1 = `<div class="ag-line1">${tag}<span class="ag-t">${horario}</span> <span class="ag-n">${escapeHtml(estreito ? iniciais(cliente) : cliente)}</span>${compact && icones && !estreito ? `<span class="ag-icons">${icones}</span>` : ''}</div>`;
  const corpo = compact || estreito ? '' : [
    duracao >= 30 ? `<div class="ag-line2">${escapeHtml(servico)}</div>` : '',
    duracao >= 45 && item.observacoes ? `<div class="ag-aviso">⚠ ${escapeHtml(item.observacoes)}</div>` : '',
    icones ? `<div class="ag-icons">${icones}</div>` : ''
  ].join('');
  const rotulo = [`${horario}–${fim}`, cliente, servico, situacao.nome, ...nomesIcones].filter(Boolean).join(', ');

  return `
    <div class="${cls.join(' ')}"
         style="top:${top}px;height:${height}px;--h:${matizDoServico(item)};${lado.de > 1 ? `--faixa:${lado.faixa};--faixas:${lado.de};` : ''}"
         aria-label="${escapeHtml(rotulo)}"
         tabindex="0" role="button"
         data-action="open-sheet"
         data-id="${item.id}"
         data-ag-id="${item.id}">
      ${dragHtml}${line1}${corpo}${stHtml}
      ${resizeHtml}
    </div>`;
}

function renderProfColInner(p) {
  // Disponibilidade desconhecida (D-055): o horário vazio não é "livre confirmado". Fica hachurado,
  // com o motivo; tocar ainda leva ao agendar e o servidor confere ao gravar.
  const incerto = motivoIncerto(p.id, state.selectedDay);
  const emptyHtml = emptySlotsForProf(p.id).map(m => {
    const timeStr = minutesSinceStartToHHMM(m);
    const ini = HORA_INICIO * 60 + m;
    const fora = !incerto && foraDaEscala(p.id, state.selectedDay, ini, ini + GRID_MIN) ? ' fora' : '';
    const extra = incerto ? ` incerto" title="${escapeHtml(incerto)}` : '';
    return `<div class="slot-vazio${fora}${extra}" style="top:${m * PX_POR_MIN}px;height:${GRID_MIN * PX_POR_MIN}px;" data-action="add-slot" data-prof="${p.id}" data-time="${timeStr}"></div>`;
  }).join('');
  const foraHtml = htmlFora(p.id, state.selectedDay, { horaInicio: HORA_INICIO, horaFim: HORA_FIM, pxPorMin: PX_POR_MIN });
  const itens = profItemsForDay(p.id);
  const faixas = faixasDaColuna(itens);
  const blocksHtml = itens.map(item => renderAgBlock(item, faixas.get(item.id))).join('');
  return foraHtml + emptyHtml + htmlBloqueios(p.id, state.selectedDay, { horaInicio: HORA_INICIO, horaFim: HORA_FIM, pxPorMin: PX_POR_MIN }) + blocksHtml;
}

export function renderTimeline() {
  const container = document.getElementById('agendaGrid');
  if (!container) return;
  // Filtro de vários profissionais (D-050) e escopo próprio do profissional (D-053).
  const profs = profsNaGrade();

  renderStatus();
  if (!profs.length) {
    container.innerHTML = '<div style="padding:16px;font-size:13px;color:var(--md-outline);grid-column: 1 / -1;">Nenhum profissional ativo.</div>';
    return;
  }
  // Semana pedida ainda não chegou (D-055): não pinta a grade com dados de outra semana.
  if (!semanaPronta()) {
    container.style.setProperty('--prof-count', 1);
    container.innerHTML = '<div class="ag-carregando" role="status" style="grid-column: 1 / -1;">Carregando a semana…</div>';
    return;
  }
  
  container.style.setProperty('--prof-count', profs.length);
  // D-080: com 3 ou mais profissionais, o celular mostra 2 por vez (CSS) e o resto fica ao lado.
  container.classList.toggle('ag-paginada', profs.length > 2);
  const deslocamento = ajustarJanela(state.selectedDay, profs);

  let html = '';
  // Corner
  html += `<div class="agenda-grid-corner"></div>`;
  
  // Headers
  html += profs.map((p, i) => {
    const color = PROF_COLORS[i % PROF_COLORS.length];
    const initials = getInitials(p.nome);
    const firstName = p.nome ? p.nome.split(' ')[0] : '?';
    const count = profItemsForDay(p.id).length;
    return `<div class="agenda-grid-header" data-prof="${p.id}" style="grid-column: ${i + 2};">
        <div class="timeline-avatar" style="background:${color};">${initials}</div>
        <div class="timeline-prof-info">
          <div class="timeline-prof-name" style="color:${color};">${escapeHtml(firstName)}</div>
          <div class="timeline-prof-count" title="${count} agendamento(s) no dia">${count} agend.</div>
        </div>
      </div>`;
  }).join('');

  // Ruler
  html += `<div class="agenda-grid-ruler" style="height:${TIMELINE_TOTAL_HEIGHT}px;">`;
  const totalMin = (HORA_FIM - HORA_INICIO) * 60;
  for (let m = 0; m <= totalMin; m += GRID_MIN) {
    html += `<div class="ruler-mark" style="top:${m * PX_POR_MIN}px;">${minutesSinceStartToHHMM(m)}</div>`;
  }
  html += `</div>`;

  // Grid Lines Background (spans all columns)
  html += `<div class="agenda-grid-lines" style="height:${TIMELINE_TOTAL_HEIGHT}px;">`;
  for (let m = 0; m <= totalMin; m += 30) {
    const cls = m % 60 === 0 ? 'grid-line-hour' : 'grid-line-half';
    html += `<div class="${cls}" style="top:${m * PX_POR_MIN}px;"></div>`;
  }
  html += `</div>`;

  // Prof Columns
  html += profs.map((p, i) => {
    return `<div class="agenda-grid-col" data-prof-id="${p.id}" style="grid-column: ${i + 2}; height:${TIMELINE_TOTAL_HEIGHT}px;">${renderProfColInner(p)}</div>`;
  }).join('');

  // Foco do teclado (D-078): redesenhar não tira o foco do card; depois de uma remarcação pelo
  // teclado, o foco vai para o card novo assim que ele aparecer.
  const focoAntes = document.activeElement && document.activeElement.closest && document.activeElement.closest('.ag-card[data-ag-id]');
  const focoId = (focoPendente && Date.now() < focoPendente.ate && focoPendente.id) || (focoAntes && focoAntes.dataset.agId);
  container.innerHTML = html;
  if (focoId) {
    const el = container.querySelector(`.ag-card[data-ag-id="${CSS.escape(focoId)}"]`);
    if (el) { el.focus({ preventScroll: true }); if (focoPendente && focoPendente.id === focoId) focoPendente = null; }
  }
  // A grade cresceu para cima: mantém na tela o mesmo horário que estava antes.
  const rolagem = document.getElementById('timelineContainer');
  if (deslocamento && rolagem) rolagem.scrollTop += deslocamento * 60 * PX_POR_MIN;
  atualizarSeloFora(state.selectedDay, profs);

  positionRedline();
  // Fora da escala (D-047): a grade do dia chega do servidor e a tela redesenha uma vez (também
  // na falha: o dia passa de "conferindo" para "não carregou").
  const dia = state.selectedDay;
  if (!gradeDoDia(dia)) carregarGradeDia(dia).then(r => { if (r && state.selectedDay === dia) renderTimeline(); });
}

// Linha de estado (D-055): carregando, falha, dados de quando e horários sem confirmação.
const hhmm = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function renderStatus() {
  const el = document.getElementById('agStatus');
  if (!el) return;
  const partes = [];
  let tentar = false;
  if (state.agendaCarregando) partes.push(semanaPronta() ? 'Atualizando…' : 'Carregando a semana…');
  if (semanaPronta()) {
    const diaFalhou = state.agendaFalhasDias && state.agendaFalhasDias.has(state.selectedDay);
    const gradeFalhou = state.gradeFalha && state.gradeFalha[state.selectedDay];
    if (diaFalhou) { partes.push('Os agendamentos deste dia não carregaram: horários vazios não estão confirmados.'); tentar = true; }
    else if (state.excecoesFalharam) { partes.push('Os bloqueios não carregaram: horários vazios não estão confirmados.'); tentar = true; }
    else if (gradeFalhou) { partes.push('A escala do dia não carregou: horários vazios não estão confirmados.'); tentar = true; }
    if (state.agendaErro) { partes.push(state.agendaErro); tentar = true; }
    if (tentar && state.agendaAtualizadaEm) partes.push('Dados de ' + hhmm(state.agendaAtualizadaEm) + '.');
  }
  el.classList.toggle('hidden', !partes.length);
  el.classList.toggle('agx-status-erro', tentar);
  el.innerHTML = escapeHtml(partes.join(' ')) + (tentar ? ' <button type="button" class="agx-tentar" id="btnAgTentar">Tentar de novo</button>' : '');
}

export async function recarregarAgenda() {
  state.agendaErro = null;
  if (state.gradeFalha) delete state.gradeFalha[state.selectedDay];
  try { await loadWeekAgenda(); } catch (err) { state.agendaErro = 'Não consegui atualizar: ' + err.message; state.agendaCarregando = false; renderStatus(); }
}

export function positionRedline() {
  const linesContainer = document.querySelector('.agenda-grid-lines');
  if (!linesContainer) return;
  let line = linesContainer.querySelector('.timeline-redline-abs');
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
    linesContainer.appendChild(line);
  }
  line.style.top = top + 'px';
}

export function renderWeekStats() {
  const dates = weekDates(state.currentWeekStart);
  const pronta = semanaPronta();
  const naSemana = dates.reduce((t, d) => t + activeAgendaItemsForDate(d).length, 0);
  const noDia = activeAgendaItemsForDate(state.selectedDay).length;
  const nProfs = profsNaGrade().length;
  const quem = nProfs === activeProfissionais().length ? 'de todos os profissionais' : (nProfs === 1 ? 'de 1 profissional' : `de ${nProfs} profissionais`);
  const set = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  set('weekRangeLabel', `${formatDDMM(dates[0])} - ${formatDDMM(dates[6])}`);
  set('agendaDateLabel', formatAgendaDate(state.selectedDay));
  // O total diz o escopo: dia escolhido e profissionais na grade.
  set('dayCountLabel', pronta ? `${noDia} agend. no dia` : '… agend.');
  const dia = document.getElementById('dayCountLabel');
  if (dia) dia.title = `${noDia} agendamento(s) ativo(s) em ${formatDDMM(state.selectedDay)}, ${quem} na grade.`;
  set('weekCountLabel', !pronta ? `Semana ${formatDDMM(dates[0])}–${formatDDMM(dates[6])}: carregando…` : `Semana ${formatDDMM(dates[0])}–${formatDDMM(dates[6])}: ${naSemana} agend. ${quem}.`
    + (state.agendaFalhas ? ` ${state.agendaFalhas} dia(s) não carregaram: o total pode estar incompleto.` : ''));
  const hoje = document.getElementById('btnAgendaToday');
  if (hoje) hoje.classList.toggle('agx-hoje-ativo', state.selectedDay === todayStr());
}

export function renderDayPills() {
  const dates = weekDates(state.currentWeekStart);
  const dayPills = document.getElementById('dayPills');
  if (!dayPills) return;
  const hoje = todayStr();
  dayPills.innerHTML = dates.map(d => {
    const dt = new Date(d + 'T12:00:00');
    const count = semanaPronta() ? activeAgendaItemsForDate(d).length : 0;
    const isSelected = d === state.selectedDay;
    // Semana compacta: dia da semana e número; o ponto diz que há agendamento (o número exato no rótulo).
    return `<button type="button" class="day-pill ${isSelected ? 'selected' : ''}${d === hoje ? ' hoje' : ''}" data-day="${d}" aria-pressed="${isSelected}" aria-label="${WEEKDAY_LABELS[dt.getDay()]} ${dt.getDate()}: ${count} agendamento(s)">
      <span class="pill-weekday">${WEEKDAY_LABELS[dt.getDay()]}</span>
      <span class="pill-daynum">${dt.getDate()}</span>
      <span class="pill-occ${count ? ' tem' : ''}" aria-hidden="true">${count || ''}</span>
    </button>`;
  }).join('');
}

export function shiftWeek(deltaWeeks) {
  const offsetDays = Math.round((new Date(state.selectedDay + 'T12:00:00') - new Date(state.currentWeekStart + 'T12:00:00')) / 86400000);
  state.currentWeekStart = addDays(state.currentWeekStart, deltaWeeks * 7);
  state.selectedDay = addDays(state.currentWeekStart, offsetDays);
  // Data, semana e contadores já mostram o período pedido; a grade diz "carregando" até ele chegar.
  renderDayPills(); renderWeekStats(); renderTimeline();
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
  const escolhida = state.agDuracaoEscolhida;
  if ((!servicoId && !escolhida) || !horario) { el.textContent = ''; return; }
  const duracao = duracaoNovoAgendamento(servicoId, state.fuzzyAgProfissional.getValue());
  const [h, m] = horario.split(':').map(Number);
  const endTotalMin = h * 60 + m + duracao;
  const endStr = String(Math.floor(endTotalMin / 60) % 24).padStart(2, '0') + ':' + String(endTotalMin % 60).padStart(2, '0');
  const ultrapassa = endTotalMin > HORA_FIM * 60;
  const aviso = ultrapassa ? ' Atenção: ultrapassa o horário de funcionamento (20:00).' : '';
  el.style.color = ultrapassa ? 'var(--md-error)' : 'var(--md-outline)';
  if (!escolhida) { el.textContent = `Este serviço ocupa ${duracao} minutos (até ${endStr}).` + aviso; return; }
  // Duração escolhida na agenda (D-086), com a opção de voltar à do serviço.
  el.textContent = `Duração: ${duracao} min, escolhida na agenda (até ${endStr}).` + aviso;
  if (servicoId) {
    state.agDuracaoEscolhida = null;
    const doServico = duracaoNovoAgendamento(servicoId, state.fuzzyAgProfissional.getValue());
    state.agDuracaoEscolhida = escolhida;
    if (doServico !== escolhida) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn-link'; b.id = 'btnDuracaoServico';
      b.textContent = `Usar a do serviço (${doServico} min)`;
      b.addEventListener('click', () => { state.agDuracaoEscolhida = null; updateNovoAgendamentoPreview(); });
      el.append(' ', b);
    }
  }
}

function openNovoAgendamentoModal(dateStr, horario, profissionalId, faixa = null) {
  const date = dateStr || state.selectedDay || todayStr();
  state.agListaEspera = null;
  state.agDuracaoEscolhida = faixa && Number.isInteger(faixa.duracaoMin) ? faixa.duracaoMin : null;

  state.fuzzyAgCliente.clear();
  resetClienteRapido();
  avisarReguaCliente(null);
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
  refreshAgendaSlots();
  openModal('modalNovoAgendamento');
}

// Vaga para alguém da lista de espera (D-054): o formulário de sempre, já preenchido. Ao gravar,
// o item da espera vai junto (listaEsperaId) e o servidor o marca "agendado".
function abrirAgendarDaEspera(item, data, horario, profissionalId) {
  openNovoAgendamentoModal(data, horario, profissionalId);
  state.fuzzyAgCliente.setValue(item.clienteId);
  // Cliente que este aparelho ainda não carregou (cadastrado em outro lugar): não segue com o
  // formulário sem cliente, que gravaria o horário "sem cliente" (D-060).
  if (state.fuzzyAgCliente.getValue() !== item.clienteId) {
    closeNovoAgendamentoModal();
    showBanner('O cliente deste pedido ainda não carregou neste aparelho. Atualize a tela e tente de novo.', 'error');
    return;
  }
  state.fuzzyAgServico.setValue(item.servicoId);
  state.agListaEspera = { id: item.id, clienteId: item.clienteId, servicoId: item.servicoId };
  avisarReguaCliente(item.clienteId);
  updateNovoAgendamentoPreview();
  refreshAgendaSlots();
}

// --- Sugestão de horários (GET /agenda/slots) ------------------------------
// O backend calcula os slots e a duração efetiva (com override do profissional).
// A UI só exibe; o POST /agenda revalida conflito na gravação.
let slotsReqSeq = 0;

function slotsKey(servicoId, profissionalId, data) {
  return [servicoId, profissionalId, data].join('|');
}

// Duração usada na prévia e na checagem local de conflito: a do backend quando
// os slots da mesma seleção já chegaram; senão a do serviço.
function duracaoNovoAgendamento(servicoId, profissionalId) {
  // Trecho escolhido arrastando no vazio (D-086): vale a duração escolhida, até a pessoa trocar pela do serviço.
  if (state.agDuracaoEscolhida) return state.agDuracaoEscolhida;
  const data = document.getElementById('agData').value;
  const info = state.agSlotsInfo;
  if (info && info.key === slotsKey(servicoId, profissionalId, data)) return info.duracaoMin;
  const servico = state.catalog.servicos.find(s => s.id === servicoId);
  return servico ? (servico.duracao_min || 30) : 30;
}

function renderAgendaSlots(el, result) {
  const todos = result.slots || [];
  if (!result.janela) {
    // D-033: o servidor diz a origem (unidade fechada, folga, escala não publicada...).
    const motivo = (result.disponibilidade && result.disponibilidade.origem) || 'Sem expediente configurado para este profissional neste dia';
    el.innerHTML = `<span class="ag-slots-msg">${escapeHtml(motivo)}.</span>`;
    return;
  }
  if (!todos.length) {
    el.innerHTML = '<span class="ag-slots-msg">Sem horários livres neste dia.</span>';
    return;
  }
  const verTodos = el.dataset.verTodos === '1';
  // Política de sugestão (D-054): o servidor marca `sugerido`; sem a marca (API antiga), os ideais.
  const sugerido = s => (s.sugerido === undefined ? s.recomendado : s.sugerido);
  const sugeridos = todos.filter(sugerido);
  const visiveis = verTodos || !sugeridos.length ? todos : sugeridos;
  const atual = document.getElementById('agHorario').value;
  const chips = visiveis.map(s => `
    <button type="button" class="chip ag-slot${s.recomendado ? ' recomendado' : ''}${s.horario === atual ? ' selected' : ''}"
      data-horario="${escapeHtml(s.horario)}" title="${s.recomendado ? 'Encaixe ideal: não deixa buraco na agenda' : `Livre até ${escapeHtml(s.fim)}`}">
      ${s.recomendado ? '★ ' : ''}${escapeHtml(s.horario)}
    </button>`).join('');
  const restantes = todos.length - sugeridos.length;
  const toggle = restantes > 0 && sugeridos.length
    ? `<button type="button" class="ag-slots-toggle" data-toggle="1">${verTodos ? 'Só os sugeridos' : `Ver todos (${todos.length})`}</button>`
    : '';
  const titulo = verTodos || !sugeridos.length ? 'Horários livres' : 'Sugeridos';
  el.innerHTML = `<span class="ag-slots-msg" title="${escapeHtml(result.politicaTexto || '')}">${titulo} · ${result.duracaoMin} min</span><div class="ag-slots-list">${chips}</div>${toggle}`
    + (result.politicaTexto ? `<p class="ag-slots-politica">${escapeHtml(result.politicaTexto)} ★ = encaixe ideal.</p>` : '');
}

export async function refreshAgendaSlots() {
  const el = document.getElementById('agSlots');
  if (!el) return;
  const servicoId = state.fuzzyAgServico.getValue();
  const profissionalId = state.fuzzyAgProfissional.getValue();
  const data = document.getElementById('agData').value;
  const seq = ++slotsReqSeq;
  state.agSlotsInfo = null;
  if (!servicoId || !profissionalId || !data) {
    el.innerHTML = '';
    el.dataset.verTodos = '';
    return;
  }
  el.innerHTML = '<span class="ag-slots-msg">Buscando horários livres…</span>';
  try {
    const result = await getAgendaSlots({ data, profissionalId, servicoId });
    if (seq !== slotsReqSeq) return; // resposta de uma seleção antiga
    state.agSlotsInfo = { key: slotsKey(servicoId, profissionalId, data), duracaoMin: result.duracaoMin, result };
    renderAgendaSlots(el, result);
    updateNovoAgendamentoPreview();
  } catch (err) {
    if (seq !== slotsReqSeq) return;
    el.innerHTML = '<span class="ag-slots-msg">Sugestões indisponíveis. Informe o horário manualmente.</span>';
  }
}

function onAgendaSlotsClick(ev) {
  const el = document.getElementById('agSlots');
  const btn = ev.target.closest('button');
  if (!btn || !el.contains(btn)) return;
  if (btn.dataset.toggle) {
    el.dataset.verTodos = el.dataset.verTodos === '1' ? '' : '1';
  } else if (btn.dataset.horario) {
    document.getElementById('agHorario').value = btn.dataset.horario;
    updateNovoAgendamentoPreview();
  }
  if (state.agSlotsInfo) renderAgendaSlots(el, state.agSlotsInfo.result);
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

// Fora da disponibilidade (D-033): o servidor recusa; quem pode encaixar decide forçar.
// Horário ocupado que só o servidor viu (D-087): outro aparelho marcou antes de esta tela atualizar.
// Mesma pergunta do arraste; sem a permissão, o erro segue com o motivo.
async function confirmarEncaixe(err) {
  if (err.code !== 'SCHEDULE_CONFLICT' || !sessionPode('agenda:encaixar')) return false;
  return confirmAction({ title: 'Horário ocupado', message: 'Já há atendimento nesse horário. Encaixar mesmo assim? Os dois ficam lado a lado e o encaixe fica no histórico.', confirmLabel: 'Encaixar' });
}

async function confirmarForaDaDisponibilidade(err, verbo = 'Agendar') {
  if (err.code !== 'FORA_DA_DISPONIBILIDADE' || !sessionPode('agenda:encaixar')) return false;
  return confirmAction({ title: 'Fora do horário', message: `${err.message} ${verbo} mesmo assim? Fica registrado como encaixe.`, confirmLabel: `${verbo} mesmo assim` });
}

// Pedido da lista de espera ao agendar (D-060, opção C):
//   - outro cliente no formulário: o pedido NUNCA é baixado (quem esperava não foi agendado);
//   - mesmo cliente e mesmo serviço: baixa junto, como antes;
//   - mesmo cliente e outro serviço: pergunta (tirar da espera / manter na espera / voltar) e o
//     servidor guarda a decisão no histórico do horário.
async function decidirEspera(clienteId, servicoId) {
  const pedido = state.agListaEspera;
  if (!pedido) return { ok: true, listaEsperaId: undefined };
  if (pedido.clienteId !== clienteId) {
    showBanner('O pedido da lista de espera era de outro cliente: continua na espera.', 'info');
    return { ok: true, listaEsperaId: undefined };
  }
  if (pedido.servicoId === servicoId) return { ok: true, listaEsperaId: pedido.id };
  if (!pedido.decisao || pedido.decisaoServicoId !== servicoId) {
    pedido.decisaoServicoId = servicoId;
    pedido.decisao = await escolherOpcao({
      title: 'Pedido da lista de espera',
      // (o texto passa por escapeHtml em escolherOpcao; sem interpolação de nome, como manda o RT-13)
      message: findClienteNome(clienteId) + ' esperava ' + findServicoNome(pedido.servicoId) + ' e você está agendando ' + findServicoNome(servicoId) + '. Tirar o pedido da espera?',
      opcoes: [
        { valor: 'baixar', rotulo: 'Tirar da espera e agendar', destaque: true },
        { valor: 'manter', rotulo: 'Agendar e manter na espera' }
      ]
    });
  }
  if (!pedido.decisao) return { ok: false };
  return pedido.decisao === 'baixar' ? { ok: true, listaEsperaId: pedido.id, baixarOutroServico: true } : { ok: true, listaEsperaId: undefined };
}

async function criarAgendamento(clienteId, servicoId, profissionalId, data, horario, permitirConflito, foraDaDisponibilidade = false, aceitarAvisos = false) {
  clearBanner();
  try {
    const espera = await decidirEspera(clienteId, servicoId);
    if (!espera.ok) return; // voltou: nada é gravado e o formulário continua aberto
    await api('/agenda', { method: 'POST', body: { clienteId, servicoId, profissionalId, data, horario, duracaoMin: state.agDuracaoEscolhida || undefined, permitirConflito: !!permitirConflito, foraDaDisponibilidade, aceitarAvisos, listaEsperaId: espera.listaEsperaId, baixarEsperaOutroServico: espera.baixarOutroServico ? true : undefined } });
    state.agListaEspera = null;
    closeNovoAgendamentoModal();
    showBanner('Agendamento criado.', 'ok');
    await loadWeekAgenda();
  } catch (err) {
    if (!foraDaDisponibilidade && await confirmarForaDaDisponibilidade(err)) return criarAgendamento(clienteId, servicoId, profissionalId, data, horario, permitirConflito, true, aceitarAvisos);
    if (!aceitarAvisos && await confirmarRegras(err)) return criarAgendamento(clienteId, servicoId, profissionalId, data, horario, permitirConflito, foraDaDisponibilidade, true);
    if (!permitirConflito && await confirmarEncaixe(err)) return criarAgendamento(clienteId, servicoId, profissionalId, data, horario, true, foraDaDisponibilidade, aceitarAvisos);
    showBanner(err.message, 'error');
  }
}

function openActionSheet(item) {
  const meta = AGENDA_STATUS_META[item.status] || { label: item.status, cls: 'badge' };
  const horario = String(item.horario || '').slice(0, 5);
  let actionsHtml = '';
  // Transições permitidas espelham a máquina de estados do backend (agenda.validator.js).
  // A ação principal (checkout) vem primeiro e larga; as outras em grade de botões menores.
  const checkout = podeFecharAtendimento(state.session, item)
    ? '<button class="btn primary" data-sheet-action="checkout">Abrir checkout</button>' : '';
  // Salão sem "Cliente chegou" (D-084): o passo seguinte é iniciar o atendimento direto.
  const chegada = usaChegada()
    ? '<button class="btn" data-sheet-action="chegou">Cliente chegou</button>'
    : '<button class="btn" data-sheet-action="cadeira">Iniciar atendimento</button>';
  if (item.status === 'agendado') {
    actionsHtml = checkout + `
      <button class="btn" data-sheet-action="confirmar">Confirmar</button>
      ${chegada}
      <button class="btn danger" data-sheet-action="noshow">No-show</button>
      <button class="btn danger" data-sheet-action="cancelar">Cancelar</button>`;
  } else if (item.status === 'confirmado') {
    actionsHtml = checkout + `
      ${chegada}
      <button class="btn danger" data-sheet-action="noshow">No-show</button>
      <button class="btn danger agc-largo" data-sheet-action="cancelar">Cancelar</button>`;
  } else if (item.status === 'aguardando') {
    actionsHtml = checkout + `
      <button class="btn" data-sheet-action="cadeira">Iniciar atendimento</button>
      <button class="btn danger" data-sheet-action="cancelar">Cancelar</button>`;
  } else if (item.status === 'em_atendimento') {
    actionsHtml = checkout;
  } else if (item.status === 'concluido') {
    actionsHtml = `<p class="agc-feito">✓ Checkout feito</p>`;
  }

  resetarEditor();
  // Atraso (D-049): passou do alerta configurado e o cliente não chegou → destaca o no-show.
  const atraso = atrasoMin(item);
  if (atraso) actionsHtml = actionsHtml.replace('class="btn danger" data-sheet-action="noshow"', 'class="btn danger agc-destaque" data-sheet-action="noshow"');
  document.getElementById('actionSheetContent').innerHTML = `
    <div class="agc-head">
      <h2 class="agc-cliente">${htmlCliente(item)}</h2>
      <span class="${escapeHtml(meta.cls)}">${escapeHtml(meta.label)}</span>
    </div>
    <div class="agc-sub"><span class="agc-hora">${horario}–${computeEndTime(item)}${atraso ? ` <span class="agc-atraso" role="status">⏱ atrasado ${atraso} min</span>` : ''}</span>
      <span class="agc-conf" id="reliabilityRow">Confiabilidade <b id="reliabilityValue">…</b></span></div>
    ${htmlCampos(item)}
    <p class="body-sm hidden agc-plano" id="sheetPlano" role="status"></p>
    <div class="sheet-actions agc-acoes">${actionsHtml}${acoesDaSerie(item)}${acoesDoAtendimento(item)}</div>
    ${htmlLegendaIcones(item)}
    <details class="sheet-historico" id="historicoDetails">
      <summary>Histórico</summary>
      <div id="historicoBody" class="sheet-historico-body">Carregando…</div>
    </details>
  `;
  document.getElementById('actionSheet').dataset.agendaId = item.id;
  const details = document.getElementById('historicoDetails');
  details.addEventListener('toggle', () => { if (details.open && !details.dataset.loaded) loadHistorico(item.id); });
  document.getElementById('btnTodosIcones')?.addEventListener('click', ev => {
    const lista = document.getElementById('legendaTodos');
    lista.hidden = !lista.hidden;
    ev.currentTarget.textContent = lista.hidden ? 'Ver todos os ícones' : 'Ver só os deste card';
    document.getElementById('legendaDoCard').hidden = !lista.hidden;
  });
  openModal('actionSheet');
  loadReliabilityBadge(item.cliente_id);
  carregarSeloPlano(item);
}

// Legenda dos ícones (D-080): campo que abre e fecha, como o Histórico, fechado por padrão. Só aparece
// quando o card tem ícone. "Ver todos os ícones" troca para a legenda completa.
function linhaLegenda(c) {
  const i = ICONES_CARD[c];
  return `<li class="sheet-legenda-item">${iconesDoCard([c])}<span><b>${escapeHtml(i.nome)}</b> <span class="sheet-legenda-porque">${escapeHtml(i.porque)}</span></span></li>`;
}
function htmlLegendaIcones(item) {
  const codigos = codigosDoCard(item);
  if (!codigos.length) return '';
  return `<details class="sheet-historico sheet-legenda" id="legendaDetails">
      <summary>Ícones deste card (${codigos.length})</summary>
      <ul class="sheet-historico-lista" id="legendaDoCard">${codigos.map(linhaLegenda).join('')}</ul>
      <ul class="sheet-historico-lista" id="legendaTodos" hidden>${Object.keys(ICONES_CARD).map(linhaLegenda).join('')}</ul>
      <button type="button" class="sheet-legenda-todos" id="btnTodosIcones">Ver todos os ícones</button>
    </details>`;
}

// Selo do plano de assinatura no card (D-043): "Plano X: coberto (2 de 4)" ou o motivo de não
// cobrir. Só leitura; quem não pode ver assinaturas não vê o selo.
async function carregarSeloPlano(item) {
  const el = document.getElementById('sheetPlano');
  if (!el || !item.cliente_id || !item.servico_id || !item.profissional_id || !sessionPode('assinatura:ver')) return;
  try {
    const q = new URLSearchParams({ clienteId: item.cliente_id, servicoId: item.servico_id, profissionalId: item.profissional_id, data: item.data, horario: String(item.horario).slice(0, 5) });
    const cob = await api('/assinaturas/cobertura?' + q.toString());
    const m = cob && cob.melhor;
    if (!m || document.getElementById('sheetPlano') !== el) return;
    const u = m.usoDoCiclo;
    let texto;
    if (m.situacaoUso === 'coberto') texto = 'coberto' + (u && u.limite ? ' (' + (u.usados + 1) + ' de ' + u.limite + ')' : '');
    else if (m.situacaoUso === 'fora_da_regra' && m.cobrarCentavos < m.precoTabelaCentavos) texto = 'fora da regra: cobra ' + centsToBRL(m.cobrarCentavos) + (m.consomeUso ? ' e gasta 1 uso' : '');
    else texto = 'não cobre — ' + ((m.motivos && m.motivos[0] && m.motivos[0].texto) || m.situacaoUso);
    el.textContent = '★ Assinante · Plano ' + m.planoNome + ': ' + texto + (m.aviso ? ' (' + m.aviso + ')' : '');
    el.classList.remove('hidden');
  } catch (_) { /* selo é informativo: sem ele o card continua igual */ }
}

// Trilha de status (GET /agenda/:id/historico). Só leitura; carrega ao abrir.
const HISTORICO_ORIGEM = { troca_cliente: 'troca de cliente', checkout: 'checkout', reagendamento: 'reagendamento' };
function statusLabel(s) {
  if (s === null || s === undefined) return '—';
  return (AGENDA_STATUS_META[s] && AGENDA_STATUS_META[s].label) || String(s);
}
function formatQuando(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function historicoLinha(ev) {
  let texto;
  if (ev.tipo === 'duracao') texto = `Duração ${ev.de ?? '—'} → ${ev.para ?? '—'} min`;
  else if (ev.tipo === 'criado') texto = `Criado · ${statusLabel(ev.para)}`;
  else if (ev.tipo === 'reagendado' && ev.reagendadoDe) texto = `Criado por reagendamento · ${statusLabel(ev.para)}`;
  else if (ev.tipo === 'cliente_corrigido') texto = 'Cliente corrigido (engano de cadastro)';
  else if (ev.tipo === 'vaga_repassada') texto = 'Vaga repassada a outro cliente (não conta como falta)';
  else texto = `${statusLabel(ev.de)} → ${statusLabel(ev.para)}`;
  const origem = HISTORICO_ORIGEM[ev.origem] ? ` (${HISTORICO_ORIGEM[ev.origem]})` : '';
  const quem = ev.ator && ev.ator.nome ? ev.ator.nome : (ev.ator && ev.ator.tipo === 'integration' ? 'Integração' : '');
  return `<li class="sheet-historico-item" data-historico-para="${escapeHtml(String(ev.para ?? ''))}">
    <span class="sheet-historico-quando">${escapeHtml(formatQuando(ev.quando))}</span>
    <span>${escapeHtml(texto + origem)}</span>
    ${quem ? `<span class="sheet-historico-quem">${escapeHtml(quem)}</span>` : ''}
  </li>`;
}
async function loadHistorico(agendamentoId) {
  const body = document.getElementById('historicoBody');
  const details = document.getElementById('historicoDetails');
  if (!body || !details) return;
  try {
    const r = await getAgendaHistorico(agendamentoId);
    if (document.getElementById('historicoBody') !== body) return; // sheet trocou de item
    details.dataset.loaded = '1';
    const eventos = (r && r.eventos) || [];
    body.innerHTML = eventos.length
      ? `<ul class="sheet-historico-lista">${eventos.map(historicoLinha).join('')}</ul>`
      : '<p class="sheet-historico-vazio">Sem histórico registrado (agendamentos anteriores à trilha não têm eventos).</p>';
  } catch (err) {
    if (document.getElementById('historicoBody') === body) body.textContent = 'Não foi possível carregar o histórico.';
  }
}

function reliabilityColor(faixa) {
  if (faixa === 'confiavel') return '#22c55e';
  if (faixa === 'normal') return '#2563eb';
  if (faixa === 'atencao') return '#f59e0b';
  return '#ef4444'; // risco
}

const RELIABILITY_LABEL = { confiavel: 'Confiável', normal: 'Normal', atencao: 'Atenção', risco: 'Risco' };

// F4.5: shadow mode — só exibe score/fatores, nunca bloqueia nenhuma ação do sheet.
async function loadReliabilityBadge(clienteId) {
  const valueEl = document.getElementById('reliabilityValue');
  const rowEl = document.getElementById('reliabilityRow');
  if (!valueEl || !rowEl) return;
  if (!clienteId || !sessionPode('painel:operacional')) { rowEl.classList.add('hidden'); return; }
  try {
    const r = await getClientReliability(clienteId);
    if (document.getElementById('reliabilityValue') !== valueEl) return; // sheet trocou de item enquanto carregava
    const label = RELIABILITY_LABEL[r.faixa] || r.faixa;
    valueEl.textContent = `${r.score} · ${label}`;
    valueEl.style.color = reliabilityColor(r.faixa);
    valueEl.title = `No-shows (365d): ${r.fatores.noShows365d} · Cancelamentos tardios: ${r.fatores.cancelTardios365d} · Sequência de comparecimentos: ${r.fatores.streakConcluidos}`;
    if (r.regua && ['alerta', 'exigir_sinal'].includes(r.regua.nivel)) valueEl.textContent += ` · ⚠ ${r.regua.faltasSeguidas === 1 ? '1 falta seguida' : r.regua.faltasSeguidas + ' faltas seguidas'}`;
  } catch (err) {
    rowEl.classList.add('hidden');
  }
}

// Régua de faltas (só alerta): avisa ao escolher o cliente no novo agendamento.
export async function avisarReguaCliente(clienteId) {
  const aviso = document.getElementById('agReguaAviso');
  if (!aviso) return;
  aviso.className = 'regua-aviso hidden';
  if (!clienteId) return;
  try {
    const r = await getClientReliability(clienteId);
    if (!r.regua || !['alerta', 'exigir_sinal'].includes(r.regua.nivel)) return;
    aviso.textContent = r.regua.mensagem;
    aviso.className = `regua-aviso ${r.regua.nivel}`;
  } catch {
    // Sem permissão de relatório (profissional) ou falha: agendar segue normal.
  }
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
  if (action === 'chegou') { closeActionSheet(); await patchAgendaStatus(id, 'aguardando'); return; }
  if (action === 'cadeira') { closeActionSheet(); await patchAgendaStatus(id, 'em_atendimento'); return; }
  if (action === 'noshow') {
    closeActionSheet();
    if (await confirmAction({ title: 'Confirmar no-show', message: 'Marcar este atendimento como no-show?', confirmLabel: 'Marcar no-show', danger: true })) {
      await patchAgendaStatus(id, 'no_show');
    }
    return;
  }
  if (action === 'cancelar') {
    closeActionSheet();
    if (await confirmAction({ title: 'Cancelar atendimento', message: 'Cancelar este atendimento na agenda? ' + textoCancelamento(item), confirmLabel: 'Cancelar atendimento', danger: true })) {
      await patchAgendaStatus(id, 'cancelado');
      await promptWaitlistCandidates(item.servico_id);
    }
    return;
  }
  if (action === 'reagendar') { closeActionSheet(); openReagendarModal(item); return; }
  if (action === 'atendimento-etapas') { closeActionSheet(); abrirEtapas(item); return; }
  if (action === 'serie-ver') { closeActionSheet(); verSerie(item); return; }
  if (action === 'serie-cancelar' || action === 'serie-alterar') { closeActionSheet(); abrirSerie(item, action === 'serie-cancelar' ? 'cancelar' : 'alterar'); return; }
  if (action === 'checkout' && podeFecharAtendimento(state.session, item)) {
    closeActionSheet(); 
    stateBus.dispatchEvent(new CustomEvent('checkout:prefill', { detail: item }));
    return; 
  }
}

// F4.4: vaga aberta por cancelamento -> sugere quem chamar da lista de espera.
// Best-effort: nunca cria/edita agendamento sozinho, só oferece contato manual via WhatsApp.
async function promptWaitlistCandidates(servicoId) {
  if (!servicoId || !sessionPode('espera:ver')) return;
  let candidatos = [];
  try {
    candidatos = await getListaEspera({ servicoId, status: 'aguardando' });
  } catch (err) {
    return;
  }
  if (!candidatos.length) return;

  const servicoNome = findServicoNome(servicoId);
  const rowsHtml = candidatos.slice(0, 5).map(c => {
    const cliente = state.catalog.clientes.find(cl => cl.id === c.cliente_id);
    const nome = cliente ? cliente.nome : 'Cliente';
    const texto = `Olá ${nome}! Abriu uma vaga para ${servicoNome}, tem interesse?`;
    const link = cliente?.whatsapp ? waLink(cliente.whatsapp, texto) : null;
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid #eee;">
      <span style="font-size:13px;font-weight:600;">${escapeHtml(nome)}</span>
      ${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener" style="font-size:12px;font-weight:700;color:var(--success);text-decoration:none;">WhatsApp</a>` : '<span style="font-size:11px;color:var(--text-tertiary);">Sem WhatsApp</span>'}
    </div>`;
  }).join('');

  const dialog = document.getElementById('conflict-dialog');
  dialog.innerHTML = `
    <div style="padding:20px;max-width:320px;font-family:inherit">
      <div style="font-size:18px;font-weight:800;margin-bottom:8px">Vaga aberta — lista de espera</div>
      <div style="font-size:13px;color:#555;line-height:1.45;margin-bottom:12px">
        ${candidatos.length} cliente(s) aguardando ${escapeHtml(servicoNome)}. Avise quem preferir:
      </div>
      ${rowsHtml}
      <button id="btn-waitlist-fechar" style="
        margin-top:16px;width:100%;padding:12px;border-radius:10px;border:1px solid var(--border);
        cursor:pointer;background:var(--bg-surface);color:var(--text-secondary);font-size:14px">Fechar</button>
    </div>
  `;
  document.getElementById('btn-waitlist-fechar').onclick = () => dialog.close();
  dialog.showModal();
}

async function patchAgendaStatus(id, novoStatus) {
  clearBanner();
  try {
    await api(`/agenda/${id}/status`, { method: 'PATCH', body: { novoStatus } });
    showBanner('Agendamento atualizado.', 'ok');
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

// Prévia do destino (D-078): início–fim e profissional antes de soltar. Verde = livre; vermelho =
// ocupado, com o nome de quem ocupa (soltar ali não muda nada); âmbar = fora da escala (soltar
// pede o encaixe, como no avulso, só para quem tem a permissão; o servidor decide).
function highlightSlot(profId, minC, alvo, duracaoMin = 20) {
  clearHighlights();
  const col = document.querySelector(`.agenda-grid-col[data-prof-id="${profId}"]`);
  if (!col) return;
  const div = document.createElement('div');
  div.className = 'drag-highlight ' + alvo.estado;
  div.style.top = minC * PX_POR_MIN + 'px';
  div.style.height = duracaoMin * PX_POR_MIN + 'px';
  div.innerHTML = `<span class="dh-rot"><span class="dh-ini">${minutesSinceStartToHHMM(minC)}</span>–${minutesSinceStartToHHMM(minC + duracaoMin)} · ${escapeHtml(findProfissionalNome(profId) || '')}</span>`
    + (alvo.estado === 'conflito' ? `<span class="dh-msg">Ocupado: ${escapeHtml(alvo.ocupantes)}</span>` : '')
    + (alvo.estado === 'fora' ? '<span class="dh-msg">Fora da escala</span>' : '');
  col.appendChild(div);
}

// Situação do destino de um arraste ou de uma seta: livre, ocupado (com quem) ou fora da escala.
function avaliarDestino(ag, profId, minC) {
  const dur = ag.duracao_min || 30;
  const hora = HORA_INICIO + Math.floor(minC / 60);
  const mins = minC % 60;
  const conf = detectConflict(profId, state.selectedDay, hora, mins, dur, ag.id);
  if (conf.length) return { estado: 'conflito', ocupantes: [...new Set(conf.map(c => findClienteNome(c.cliente_id) || 'outro atendimento'))].join(', '), hora, mins };
  const ini = HORA_INICIO * 60 + minC;
  if (foraDaEscala(profId, state.selectedDay, ini, ini + dur)) return { estado: 'fora', hora, mins };
  return { estado: 'livre', hora, mins };
}

function clearHighlights() {
  document.querySelectorAll('.drag-highlight').forEach(el => el.remove());
}

function showResizeTooltip(block, text, emCima = false) {
  // O card corta o que sai dele (overflow), então a dica fica presa à coluna, acima ou abaixo do card.
  const col = block.parentElement;
  let tooltip = col && col.querySelector('.resize-tooltip');
  if (!tooltip && col) {
    tooltip = document.createElement('div');
    tooltip.className = 'resize-tooltip';
    tooltip.setAttribute('role', 'status');
    col.appendChild(tooltip);
  }
  if (!tooltip) return;
  tooltip.textContent = text;
  tooltip.classList.toggle('topo', emCima);
  const topoCard = block.offsetTop; const base = topoCard + block.offsetHeight;
  tooltip.style.top = (emCima ? topoCard - 26 : base + 4) + 'px';
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
        <b>${escapeHtml(profNome)}</b> já tem atendimento às <b>${horario}</b>.<br>
        O que você quer fazer?
      </div>
      <div style="display:flex; flex-direction:column; gap:10px">
        <button id="btn-encaixar"${sessionPode('agenda:encaixar') ? '' : ' hidden'} style="
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
          padding:12px; border-radius:10px; border:1px solid var(--border);
          cursor:pointer; background:var(--bg-surface); color:var(--text-secondary); font-size:14px">
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

function executarReagendar(agId, profId, data, horario, permitirConflito, foraDaDisponibilidade = false, aceitarAvisos = false, opcoes = {}) {
  return api('/agenda/' + agId + '/status', {
    method: 'PATCH',
    body: {
      novoStatus: 'reagendado',
      novaData: data,
      novoHorario: horario,
      novoProfissionalId: profId,
      permitirConflito: !!permitirConflito,
      foraDaDisponibilidade,
      aceitarAvisos,
      ...(opcoes.novaDuracaoMin ? { novaDuracaoMin: opcoes.novaDuracaoMin } : {})
    }
  })
  .then(async r => {
    navigator.vibrate?.([10, 50, 10]);
    const novoId = r && r.novo && r.novo.id;
    await loadWeekAgenda();
    if (novoId && opcoes.focar) focarCard(novoId);
    // Desfazer (D-078): 8 s para voltar ao horário e ao profissional de antes. É outra
    // remarcação no servidor (com as mesmas checagens), nunca só a tela.
    if (novoId && opcoes.voltar) {
      const v = opcoes.voltar;
      showToast({
        type: 'success',
        message: 'Remarcado para ' + horario + ' com ' + (findProfissionalNome(profId) || 'o profissional') + '.', // showToast escapa o texto
        duration: 8000,
        action: { label: 'Desfazer', onClick: () => executarReagendar(novoId, v.profId, v.data, v.horario, false, false, false, { focar: opcoes.focar, novaDuracaoMin: v.duracao >= 10 && v.duracao <= 480 ? v.duracao : undefined }) }
      });
    }
    return r;
  })
  .catch(async err => {
    if (!foraDaDisponibilidade && await confirmarForaDaDisponibilidade(err, 'Remarcar')) return executarReagendar(agId, profId, data, horario, permitirConflito, true, aceitarAvisos, opcoes);
    if (!aceitarAvisos && await confirmarRegras(err)) return executarReagendar(agId, profId, data, horario, permitirConflito, foraDaDisponibilidade, true, opcoes);
    if (!permitirConflito && await confirmarEncaixe(err)) return executarReagendar(agId, profId, data, horario, true, foraDaDisponibilidade, aceitarAvisos, opcoes);
    showBanner('Erro ao reagendar: ' + err.message, 'error');
  });
}

// Foco no card novo depois da remarcação pelo teclado. A grade pode ser redesenhada mais de uma vez
// depois da leitura da semana; o redesenho (renderTimeline) reaplica o foco por até 2 s.
let focoPendente = null;
function focarCard(id) {
  focoPendente = { id, ate: Date.now() + 2000 };
  const el = document.querySelector(`.ag-card[data-ag-id="${CSS.escape(id)}"]`);
  if (el) el.focus({ preventScroll: false });
}

// Mover um card (arraste ou teclado) para outro profissional/horário do mesmo dia (D-078).
// Ocupado: nada muda, e a tela diz por quem. Mesmo lugar: nada a fazer.
function moverCard(ag, profId, minC, { focar = false } = {}) {
  const alvo = avaliarDestino(ag, profId, minC);
  const horario = formatTime(alvo.hora, alvo.mins);
  if (profId === ag.profissional_id && horario === String(ag.horario).slice(0, 5)) return;
  const opcoes = { focar, voltar: { profId: ag.profissional_id, data: String(ag.data).slice(0, 10), horario: String(ag.horario).slice(0, 5), duracao: ag.duracao_min || 30 } };
  if (alvo.estado === 'conflito') {
    // Encaixe (D-087): antes só avisava "Nada mudou". Quem pode encaixar decide; os dois ficam lado a
    // lado (D-085) e o servidor registra o encaixe. Quem não pode, sabe por quê.
    if (!sessionPode('agenda:encaixar')) {
      showBanner(`Horário ocupado por ${alvo.ocupantes}. Encaixar exige a permissão "Encaixar"; nada mudou.`, 'warning');
      return;
    }
    confirmAction({
      title: 'Horário ocupado',
      // confirmAction escapa o texto; concatenado (não template) como nas outras mensagens com nome.
      message: horario + ' com ' + (findProfissionalNome(profId) || 'o profissional') + ' já tem ' + alvo.ocupantes + '. Encaixar mesmo assim? Os dois ficam lado a lado e o encaixe fica no histórico.',
      confirmLabel: 'Encaixar'
    }).then(ok => { if (ok) executarReagendar(ag.id, profId, state.selectedDay, horario, true, false, false, opcoes); });
    return;
  }
  executarReagendar(ag.id, profId, state.selectedDay, horario, false, false, false, opcoes);
}

// Arraste (D-055, D-078): o card inteiro é a alça. O bloco acompanha o dedo a partir do ponto em
// que foi pego; o horário vem do TOPO do bloco medido na coluna (que já desconta o cabeçalho fixo e
// a rolagem). Prévia, régua e horário gravado usam a mesma conta.
let ultimoArrasteEm = 0;
let rolagemAuto = null;
function startDrag(agId, e, origem) {
  const block = document.querySelector(`.ag-card[data-ag-id="${CSS.escape(agId)}"]`);
  if (!block || !block.classList.contains('editavel')) return;

  block.classList.add('dragging');
  const clientX = e.touches?.[0].clientX ?? e.clientX;
  const clientY = e.touches?.[0].clientY ?? e.clientY;
  const r = block.getBoundingClientRect();
  const pegaY = (origem ? origem.y : clientY) - r.top;
  const pegaX = (origem ? origem.x : clientX) - r.left;
  const clone = block.cloneNode(true);
  clone.removeAttribute('tabindex');
  clone.classList.add('ag-clone');
  clone.style.width = block.offsetWidth + 'px';
  clone.style.height = block.offsetHeight + 'px';
  clone.style.left = clientX - pegaX + 'px';
  clone.style.top = clientY - pegaY + 'px';
  document.body.appendChild(clone);

  const rot = document.createElement('div');
  rot.className = 'ag-arraste-rot';
  rot.setAttribute('role', 'status');
  document.body.appendChild(rot);
  state.dragging = { agId, clone, rot, targetProf: null, targetMin: null, originalBlock: block, pegaY, pegaX, x: clientX, y: clientY };
  document.addEventListener('keydown', onGestoKeydown);

  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('mouseup', onDragEnd);
  document.addEventListener('touchend', onDragEnd);
  document.addEventListener('touchcancel', onDragEnd);
  atualizarAlvo(clientX, clientY);
}

function atualizarAlvo(clientX, clientY) {
  const d = state.dragging;
  if (!d) return;
  d.x = clientX; d.y = clientY;
  d.clone.style.left = clientX - d.pegaX + 'px';
  d.clone.style.top = clientY - d.pegaY + 'px';
  const el = document.elementFromPoint(clientX, clientY);
  const profCol = el?.closest('.agenda-grid-col[data-prof-id]');
  if (profCol) {
    const yRel = clientY - d.pegaY - profCol.getBoundingClientRect().top;
    const min = Math.round(yRel / PX_POR_MIN / SNAP_MIN) * SNAP_MIN;
    const ag = findAgendaItemById(d.agId);
    const dur = ag.duracao_min || 30;
    const minC = Math.max(0, Math.min(min, (HORA_FIM - HORA_INICIO) * 60 - dur));
    d.targetProf = profCol.dataset.profId;
    d.targetMin = minC;
    const alvo = avaliarDestino(ag, d.targetProf, minC);
    highlightSlot(d.targetProf, minC, alvo, dur);
    // Etiqueta em cima do card que acompanha o dedo, fora do alcance do dedo (D-081).
    const cr = d.clone.getBoundingClientRect();
    d.rot.className = 'ag-arraste-rot' + (alvo.estado === 'livre' ? '' : ' ' + alvo.estado);
    d.rot.textContent = rotuloHorario(minC, dur) + ' · ' + (findProfissionalNome(d.targetProf) || '') + (alvo.estado === 'conflito' ? ' · ocupado' : alvo.estado === 'fora' ? ' · fora da escala' : '');
    d.rot.style.left = (cr.left + cr.width / 2) + 'px';
    d.rot.style.top = cr.top + 'px';
    profCol.closest('.agenda-grid')?.setAttribute('data-arraste-horario', formatTime(alvo.hora, alvo.mins));
  }
  ajustarRolagemAuto(clientX, clientY);
}

// Rolagem automática perto da borda de cima ou de baixo da grade. Só começa depois de o dedo
// ficar 0,4 s na faixa da borda: passar por ela, ou soltar no último horário visível, não rola.
const BORDA_ROLAGEM_PX = 32;
const ESPERA_ROLAGEM_MS = 400;
function ajustarRolagemAuto(clientX, clientY) {
  const c = document.getElementById('timelineContainer');
  if (!c || !(state.dragging || state.selecao)) return pararRolagemAuto();
  const r = c.getBoundingClientRect();
  const passoY = clientY < r.top + BORDA_ROLAGEM_PX ? -12 : clientY > r.bottom - BORDA_ROLAGEM_PX ? 12 : 0;
  // D-080: com as colunas lado a lado, perto da borda esquerda (depois da régua) ou direita rola para o lado.
  const podeX = !state.selecao && c.scrollWidth > c.clientWidth; // a seleção no vazio fica na coluna onde começou
  const passoX = !podeX ? 0 : clientX < r.left + 44 + BORDA_ROLAGEM_PX ? -12 : clientX > r.right - BORDA_ROLAGEM_PX ? 12 : 0;
  if (!passoY && !passoX) return pararRolagemAuto();
  const chave = passoX + ',' + passoY;
  if (rolagemAuto && rolagemAuto.chave === chave) return;
  pararRolagemAuto();
  const desde = performance.now();
  const tick = agora => {
    const g = state.dragging || state.selecao;
    if (!g || !rolagemAuto) return;
    if (agora - desde >= ESPERA_ROLAGEM_MS) {
      const antes = c.scrollTop + ',' + c.scrollLeft;
      c.scrollTop += passoY;
      c.scrollLeft += passoX;
      if (c.scrollTop + ',' + c.scrollLeft !== antes) (g === state.dragging ? atualizarAlvo : atualizarSelecao)(g.x, g.y);
    }
    if (rolagemAuto) rolagemAuto.raf = requestAnimationFrame(tick);
  };
  rolagemAuto = { chave, raf: requestAnimationFrame(tick) };
}
function pararRolagemAuto() {
  if (rolagemAuto) cancelAnimationFrame(rolagemAuto.raf);
  rolagemAuto = null;
}

function onDragMove(e) {
  if (!state.dragging) return;
  if (e.cancelable) e.preventDefault();
  atualizarAlvo(e.touches?.[0].clientX ?? e.clientX, e.touches?.[0].clientY ?? e.clientY);
}

function onDragEnd(_ev, cancelar = false) {
  document.removeEventListener('keydown', onGestoKeydown);
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('touchmove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  document.removeEventListener('touchend', onDragEnd);
  document.removeEventListener('touchcancel', onDragEnd);
  pararRolagemAuto();
  clearHighlights();

  const d = state.dragging;
  state.dragging = null;
  if (!d) return;
  ultimoArrasteEm = Date.now();
  d.clone?.remove();
  d.rot?.remove();
  d.originalBlock?.classList.remove('dragging');
  if (cancelar || !d.targetProf) return;
  const ag = findAgendaItemById(d.agId);
  if (ag) moverCard(ag, d.targetProf, d.targetMin);
}

// Teclado (D-078): ↑/↓ movem um passo; ←/→ trocam de profissional no mesmo horário;
// Enter ou espaço abrem o card. Concluído, falta e pago não se movem.
function onCardKeydown(ev) {
  const card = ev.target.closest?.('.ag-card[data-ag-id]');
  if (!card || ev.target !== card) return;
  const ag = findAgendaItemById(card.dataset.agId);
  if (!ag) return;
  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openActionSheet(ag); return; }
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
  ev.preventDefault();
  if (!card.classList.contains('editavel')) { showBanner('Este atendimento não pode ser movido.', 'warning'); return; }
  const minAtual = itemStartMinutes(ag);
  const dur = ag.duracao_min || 30;
  let profId = ag.profissional_id;
  let minC = minAtual;
  if (ev.key === 'ArrowUp') minC = Math.max(0, minAtual - SNAP_MIN);
  if (ev.key === 'ArrowDown') minC = Math.min((HORA_FIM - HORA_INICIO) * 60 - dur, minAtual + SNAP_MIN);
  if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
    const ids = profsNaGrade().map(p => p.id);
    const i = ids.indexOf(ag.profissional_id) + (ev.key === 'ArrowRight' ? 1 : -1);
    if (i < 0 || i >= ids.length) return;
    profId = ids[i];
  }
  moverCard(ag, profId, minC, { focar: true });
}

// Redimensionar (D-081): alça de baixo muda o fim (início parado); alça de cima muda o início (fim
// parado). O passo conta a partir da duração/início originais, não do ponto onde o dedo pegou. Não
// passa por cima do vizinho do mesmo profissional; a etiqueta mostra "início–fim (duração)".
function startResize(agId, e, modo = 'fim') {
  e.preventDefault();
  e.stopPropagation();
  const block = document.querySelector(`.ag-card[data-ag-id="${CSS.escape(agId)}"]`);
  const ag = findAgendaItemById(agId);
  if (!block || !ag) return;
  const clientY = e.touches?.[0].clientY ?? e.clientY;
  const ini0 = itemStartMinutes(ag);
  const dur0 = ag.duracao_min || 30;
  const outros = (state.weekAgenda[state.selectedDay] || []).filter(i => i.id !== ag.id && i.profissional_id === ag.profissional_id && !['cancelado', 'no_show', 'reagendado'].includes(i.status));
  let proximo = (HORA_FIM - HORA_INICIO) * 60; let anterior = 0;
  for (const o of outros) {
    const s0 = itemStartMinutes(o); const f0 = s0 + (o.duracao_min || 30);
    if (s0 >= ini0 + 1 && s0 < proximo) proximo = s0;
    if (f0 <= ini0 + dur0 - 1 && s0 < ini0 && f0 > anterior) anterior = f0;
  }
  state.resizing = { agId, block, modo, yInicio: clientY, ini0, dur0, ini: ini0, dur: dur0, proximo, anterior, topo0: block.offsetTop };
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('touchmove', onResizeMove, { passive: false });
  document.addEventListener('mouseup', onResizeEnd);
  document.addEventListener('touchend', onResizeEnd);
  document.addEventListener('keydown', onGestoKeydown);
  showResizeTooltip(block, rotuloHorario(ini0, dur0), modo === 'inicio');
}

function onResizeMove(e) {
  if (e.cancelable) e.preventDefault();
  const r = state.resizing;
  if (!r) return;
  const clientY = e.touches?.[0].clientY ?? e.clientY;
  const passos = Math.round((clientY - r.yInicio) / PX_POR_MIN / SNAP_MIN) * SNAP_MIN;
  if (r.modo === 'inicio') {
    const fim = r.ini0 + r.dur0;
    r.ini = Math.max(r.anterior, Math.min(fim - 10, r.ini0 + passos));
    r.dur = fim - r.ini;
  } else {
    r.ini = r.ini0;
    r.dur = Math.max(10, Math.min(r.proximo - r.ini0, r.dur0 + passos));
  }
  r.block.style.top = (r.ini * PX_POR_MIN) + 'px';
  r.block.style.height = (r.dur * PX_POR_MIN) + 'px';
  showResizeTooltip(r.block, rotuloHorario(r.ini, r.dur), r.modo === 'inicio');
  navigator.vibrate?.([5]);
}

function onResizeEnd(_ev, cancelar = false) {
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('touchmove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
  document.removeEventListener('touchend', onResizeEnd);
  document.removeEventListener('keydown', onGestoKeydown);
  hideResizeTooltip();
  const r = state.resizing;
  state.resizing = null;
  if (!r) return;
  ultimoArrasteEm = Date.now();
  const ag = findAgendaItemById(r.agId);
  const volta = () => { r.block.style.top = (r.ini0 * PX_POR_MIN) + 'px'; r.block.style.height = (r.dur0 * PX_POR_MIN) + 'px'; };
  if (cancelar || !ag || (r.ini === r.ini0 && r.dur === r.dur0)) { volta(); return; }
  if (r.modo === 'inicio') {
    // Início novo com o fim parado: remarcação com duração nova, numa operação só (D-081).
    executarReagendar(ag.id, ag.profissional_id, state.selectedDay, minutesSinceStartToHHMM(r.ini), false, false, false, {
      novaDuracaoMin: r.dur,
      voltar: { profId: ag.profissional_id, data: String(ag.data).slice(0, 10), horario: String(ag.horario).slice(0, 5), duracao: r.dur0 }
    }).then(res => { if (!res) volta(); });
    return;
  }
  // Esticar além da escala (D-087): pergunta como no arraste, em vez de só recusar.
  const gravar = fora => api('/agenda/' + r.agId + '/duracao', { method: 'PATCH', body: { duracaoMin: r.dur, ...(fora ? { foraDaDisponibilidade: true } : {}) } })
    .then(() => loadWeekAgenda())
    .catch(async err => {
      if (!fora && await confirmarForaDaDisponibilidade(err, 'Alterar')) return gravar(true);
      showBanner('Erro ao ajustar duração: ' + err.message, 'error'); volta();
    });
  gravar(false);
}

// Esc cancela o arraste ou o redimensionamento sem gravar nada.
function onGestoKeydown(ev) {
  if (ev.key !== 'Escape') return;
  ev.preventDefault();
  if (state.dragging) onDragEnd(ev, true);
  if (state.resizing) onResizeEnd(ev, true);
  if (state.selecao) fimSelecao(ev, true);
}

// ---------- Segurar e arrastar no vazio (D-086) ----------
// A mesma dinâmica do arraste do card: passo do aparelho, etiqueta "início–fim (duração) · profissional",
// rolagem na borda, Esc cancela. Fica na coluna onde começou e para no próximo atendimento ou bloqueio
// (para cima, no anterior). Ao soltar, abre a escolha Agendar ou Bloquear com o trecho.
const OCUPA = i => !['cancelado', 'reagendado', 'no_show'].includes(i.status);
function startSelecao(profId, clientX, clientY) {
  const col = document.querySelector(`.agenda-grid-col[data-prof-id="${CSS.escape(profId)}"]`);
  if (!col) return;
  const total = (HORA_FIM - HORA_INICIO) * 60;
  const a = Math.max(0, Math.min(total - SNAP_MIN, Math.floor((clientY - col.getBoundingClientRect().top) / PX_POR_MIN / SNAP_MIN) * SNAP_MIN));
  const ocupados = profItemsForDay(profId).filter(OCUPA).map(i => { const s = itemStartMinutes(i); return [s, s + (Number(i.duracao_min) || 30)]; })
    .concat(bloqueiosDoDia(profId, state.selectedDay).map(b => [b.ini - HORA_INICIO * 60, b.fim - HORA_INICIO * 60]));
  // Começou em cima de algo ocupado (ex.: um bloqueio): não é vazio.
  if (ocupados.some(([s, f]) => a < f && a + SNAP_MIN > s)) return;
  let anterior = 0; let proximo = total;
  for (const [s, f] of ocupados) {
    if (s >= a + SNAP_MIN && s < proximo) proximo = s;
    if (f <= a && f > anterior) anterior = f;
  }
  const caixa = document.createElement('div');
  caixa.className = 'ag-selecao';
  caixa.setAttribute('aria-hidden', 'true');
  col.appendChild(caixa);
  const rot = document.createElement('div');
  rot.className = 'ag-arraste-rot';
  rot.setAttribute('role', 'status');
  document.body.appendChild(rot);
  state.selecao = { profId, a, anterior, proximo, ini: a, fim: a + SNAP_MIN, caixa, rot, x: clientX, y: clientY };
  document.addEventListener('mousemove', onSelecaoMove);
  document.addEventListener('touchmove', onSelecaoMove, { passive: false });
  document.addEventListener('mouseup', fimSelecao);
  document.addEventListener('touchend', fimSelecao);
  document.addEventListener('touchcancel', fimSelecao);
  document.addEventListener('keydown', onGestoKeydown);
  atualizarSelecao(clientX, clientY);
}

function atualizarSelecao(clientX, clientY) {
  const s = state.selecao;
  if (!s) return;
  s.x = clientX; s.y = clientY;
  const col = document.querySelector(`.agenda-grid-col[data-prof-id="${CSS.escape(s.profId)}"]`);
  if (!col) return;
  if (!s.caixa.isConnected) col.appendChild(s.caixa); // a grade foi redesenhada no meio do gesto
  const cur = Math.round((clientY - col.getBoundingClientRect().top) / PX_POR_MIN / SNAP_MIN) * SNAP_MIN;
  let ini = Math.min(s.a, cur); let fim = Math.max(s.a + SNAP_MIN, cur);
  ini = Math.max(ini, s.anterior); fim = Math.min(fim, s.proximo);
  if (fim - ini > 480) { if (cur < s.a) ini = fim - 480; else fim = ini + 480; }
  if (ini !== s.ini || fim !== s.fim) navigator.vibrate?.([5]);
  s.ini = ini; s.fim = fim;
  const fora = foraDaEscala(s.profId, state.selectedDay, HORA_INICIO * 60 + ini, HORA_INICIO * 60 + fim);
  s.caixa.className = 'ag-selecao' + (fora ? ' fora' : '');
  s.caixa.style.top = ini * PX_POR_MIN + 'px';
  s.caixa.style.height = (fim - ini) * PX_POR_MIN + 'px';
  const r = s.caixa.getBoundingClientRect();
  s.rot.className = 'ag-arraste-rot' + (fora ? ' fora' : '');
  s.rot.textContent = rotuloHorario(ini, fim - ini) + ' · ' + (findProfissionalNome(s.profId) || '') + (fora ? ' · fora da escala' : '');
  s.rot.style.left = (r.left + r.width / 2) + 'px';
  s.rot.style.top = r.top + 'px';
  ajustarRolagemAuto(clientX, clientY);
}

function onSelecaoMove(e) {
  if (!state.selecao) return;
  if (e.cancelable) e.preventDefault();
  atualizarSelecao(e.touches?.[0].clientX ?? e.clientX, e.touches?.[0].clientY ?? e.clientY);
}

function fimSelecao(_ev, cancelar = false) {
  document.removeEventListener('mousemove', onSelecaoMove);
  document.removeEventListener('touchmove', onSelecaoMove);
  document.removeEventListener('mouseup', fimSelecao);
  document.removeEventListener('touchend', fimSelecao);
  document.removeEventListener('touchcancel', fimSelecao);
  document.removeEventListener('keydown', onGestoKeydown);
  pararRolagemAuto();
  const s = state.selecao;
  state.selecao = null;
  if (!s) return;
  s.caixa.remove(); s.rot.remove();
  ultimoArrasteEm = Date.now(); // o soltar não vira o toque curto (que abriria só 20 min)
  if (cancelar) return;
  abrirHorarioLivre(state.selectedDay, minutesSinceStartToHHMM(s.ini), s.profId, openNovoAgendamentoModal, abrirAgendarDaEspera,
    { fim: minutesSinceStartToHHMM(s.fim), duracaoMin: s.fim - s.ini });
}

function formatTime(h, m) {
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

let longPressTimer = null;

function onTimelineClick(ev) {
  if (ev.target.classList.contains('resize-handle')) return;
  if (Date.now() - ultimoArrasteEm < 400) return; // o soltar de um arraste não abre o card
  const block = ev.target.closest('[data-action="open-sheet"]');
  if (block) {
    const item = findAgendaItemById(block.dataset.id);
    if (item) openActionSheet(item);
    return;
  }
  const bloq = ev.target.closest('[data-action="open-bloqueio"]');
  if (bloq) return abrirBloqueio(bloq.dataset.excId);
  const emptySlot = ev.target.closest('[data-action="add-slot"]');
  if (emptySlot) {
    // D-046: tocar no horário livre oferece Agendar ou Bloquear (quem não bloqueia vai direto agendar).
    abrirHorarioLivre(state.selectedDay, emptySlot.dataset.time, emptySlot.dataset.prof, openNovoAgendamentoModal, abrirAgendarDaEspera);
  }
}

export function initAgenda() {
  initAgendaBloqueio();
  initCardAgendamento();
  initAgendaMes({
    aoFiltrar: () => { renderDayPills(); renderWeekStats(); renderTimeline(); },
    aoAbrirAgendamento: id => { const item = findAgendaItemById(id); if (item) openActionSheet(item); }
  });
  initClienteRapido();
  document.getElementById('btnPrevWeek').addEventListener('click', () => shiftWeek(-1));
  document.getElementById('btnNextWeek').addEventListener('click', () => shiftWeek(1));
  document.getElementById('btnPrevWeekMobile')?.addEventListener('click', () => shiftWeek(-1));
  document.getElementById('btnNextWeekMobile')?.addEventListener('click', () => shiftWeek(1));
  document.getElementById('btnAgendaToday')?.addEventListener('click', () => {
    state.selectedDay = todayStr();
    const mesmaSemana = weekDates(state.currentWeekStart).includes(state.selectedDay);
    state.currentWeekStart = startOfWeek(state.selectedDay);
    renderDayPills();
    renderWeekStats();
    renderTimeline();
    // Mesma semana: os dados já estão aqui; outra semana: recarrega (a grade não mostra a semana antiga como se fosse hoje).
    if (!mesmaSemana) loadWeekAgenda().catch(err => showBanner('Agenda: ' + err.message, 'error'));
    document.getElementById('timelineContainer')?.scrollTo({ top: Math.max(0, (new Date().getHours() - HORA_INICIO - 1) * 60 * PX_POR_MIN), behavior: 'smooth' });
  });

  document.getElementById('dayPills').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-day]');
    if (!btn) return;
    state.selectedDay = btn.dataset.day;
    renderDayPills();
    renderWeekStats();
    renderTimeline();
  });

  const timelineCols = document.getElementById('agendaGrid');
  timelineCols.addEventListener('click', onTimelineClick);
  document.getElementById('agSeloFora')?.addEventListener('click', irParaForaDaEscala);

  timelineCols.addEventListener('keydown', onCardKeydown);
  // Como a agenda aparece (D-083): os dois controles moram na Gestão; o (i) da agenda leva até lá.
  const passoSel = document.getElementById('agPasso');
  if (passoSel) {
    passoSel.value = String(SNAP_MIN);
    passoSel.addEventListener('change', () => { definirPasso(Number(passoSel.value)); showBanner('Passo do arraste: ' + SNAP_MIN + ' min neste aparelho.', 'ok'); });
  }
  const zoomSel = document.getElementById('agZoom');
  if (zoomSel) {
    zoomSel.value = ZOOM;
    zoomSel.addEventListener('change', () => {
      definirZoom(zoomSel.value);
      renderTimeline();
      showBanner('Zoom da grade: ' + zoomSel.options[zoomSel.selectedIndex].text.toLowerCase() + ' neste aparelho.', 'ok');
    });
  }
  document.getElementById('btnAgAparencia')?.addEventListener('click', () => {
    stateBus.dispatchEvent(new CustomEvent('tab:change', { detail: 'gestao' }));
    setTimeout(() => document.getElementById('subtabBtnAparencia')?.click(), 0);
  });

  // Mouse: o arraste começa quando o ponteiro anda mais de 6 px com o botão apertado; sem andar,
  // é um clique e abre o card como sempre.
  timelineCols.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    const resizeHandle = e.target.closest('.resize-handle');
    if (resizeHandle) { startResize(resizeHandle.dataset.agId, e, resizeHandle.dataset.modo || 'fim'); return; }
    const card = e.target.closest('.ag-card.editavel');
    // Vazio (D-086): apertar e mover escolhe o trecho; sem mover, é o toque de sempre.
    const vazio = !card && sessionPode('agenda:criar') ? e.target.closest('.slot-vazio[data-prof]') : null;
    if (!card && !vazio) return;
    const origem = { x: e.clientX, y: e.clientY };
    const mover = ev => {
      if (Math.hypot(ev.clientX - origem.x, ev.clientY - origem.y) <= 6) return;
      parar();
      if (vazio) { ev.preventDefault(); startSelecao(vazio.dataset.prof, origem.x, origem.y); atualizarSelecao(ev.clientX, ev.clientY); return; }
      startDrag(card.dataset.agId, ev, origem);
    };
    const parar = () => { document.removeEventListener('mousemove', mover); document.removeEventListener('mouseup', parar); };
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', parar);
  });

  // Toque: segurar o card 0,3 s pega; mexer o dedo antes disso é rolagem e cancela.
  let toqueInicio = null;
  timelineCols.addEventListener('touchstart', e => {
    const resizeHandle = e.target.closest('.resize-handle');
    if (resizeHandle) { startResize(resizeHandle.dataset.agId, e, resizeHandle.dataset.modo || 'fim'); return; }
    const card = e.target.closest('.ag-card.editavel');
    const vazio = !card && sessionPode('agenda:criar') ? e.target.closest('.slot-vazio[data-prof]') : null;
    if ((!card && !vazio) || e.touches.length !== 1) return;
    const t = e.touches[0];
    toqueInicio = { x: t.clientX, y: t.clientY };
    clearTimeout(longPressTimer);
    // Card: segurar 0,3 s pega. Vazio (D-086): segurar 0,4 s começa a escolher o trecho.
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      navigator.vibrate?.([10]);
      if (vazio) startSelecao(vazio.dataset.prof, toqueInicio.x, toqueInicio.y);
      else startDrag(card.dataset.agId, { clientX: toqueInicio.x, clientY: toqueInicio.y }, toqueInicio);
    }, vazio ? 400 : 300);
  }, { passive: true });

  timelineCols.addEventListener('touchend', () => { clearTimeout(longPressTimer); longPressTimer = null; });

  timelineCols.addEventListener('touchmove', e => {
    if (!longPressTimer || !toqueInicio) return;
    const t = e.touches[0];
    if (Math.hypot(t.clientX - toqueInicio.x, t.clientY - toqueInicio.y) > 8) { clearTimeout(longPressTimer); longPressTimer = null; }
  }, { passive: true });

  document.getElementById('agHorario').addEventListener('input', () => {
    updateNovoAgendamentoPreview();
    if (state.agSlotsInfo) renderAgendaSlots(document.getElementById('agSlots'), state.agSlotsInfo.result);
  });
  document.getElementById('agData').addEventListener('change', refreshAgendaSlots);
  document.getElementById('agSlots').addEventListener('click', onAgendaSlotsClick);

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

    // Vários serviços (D-040): o servidor devolve as combinações e quem agenda escolhe uma.
    const extras = extrasEscolhidos();
    if (extras.length) {
      if (repeticaoEscolhida()) { showBanner('Série recorrente aceita um serviço por vez.', 'error'); return; }
      const itens = [{ servicoId, profissionalId }, ...extras.map(e => ({ servicoId: e.servicoId, profissionalId: e.profissionalId || null }))];
      if (new Set(itens.map(i => i.servicoId)).size !== itens.length) { showBanner('O mesmo serviço aparece duas vezes.', 'error'); return; }
      await abrirOpcoes({ clienteId, data, itens, horario }, () => { resetExtras(); closeNovoAgendamentoModal(); });
      return;
    }

    // Série recorrente (C4): prévia no servidor e confirmação antes de gravar.
    const repeticao = repeticaoEscolhida();
    if (repeticao) {
      if (await criarSerieComPrevia({ clienteId, servicoId, profissionalId, data, horario }, repeticao)) { resetRepeticao(); closeNovoAgendamentoModal(); }
      return;
    }

    const duracaoMin = duracaoNovoAgendamento(servicoId, profissionalId);
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

    const submeterReagendamento = async (horarioFinal, permitirConflito, aceitarAvisos = false) => {
      try {
        await api(`/agenda/${state.reagendarAlvoId}/status`, {
          method: 'PATCH',
          body: { novoStatus: 'reagendado', novaData, novoHorario: horarioFinal, novoServicoId, novoProfissionalId, permitirConflito: !!permitirConflito, aceitarAvisos }
        });
        closeReagendarModal();
        showBanner('Reagendado com sucesso.', 'ok');
        await loadWeekAgenda();
      } catch (err) {
        if (!aceitarAvisos && await confirmarRegras(err)) return submeterReagendamento(horarioFinal, permitirConflito, true);
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
    if (state.agendaFalhas) showBanner('Não consegui carregar ' + state.agendaFalhas + ' dia(s) da agenda. Dia vazio aqui pode ser falha, não folga: puxe para atualizar.', 'error');
    renderDayPills();
    renderWeekStats();
    renderTimeline();
    recarregarMesSeAberto();
    atualizarPaineis();
  });

  stateBus.addEventListener('agenda:carregando', renderStatus);
  document.getElementById('agStatus')?.addEventListener('click', ev => { if (ev.target.id === 'btnAgTentar') recarregarAgenda(); });
  stateBus.addEventListener('catalog:updated', () => {
    desenharFiltro();
    renderDayPills();
    renderWeekStats();
    renderTimeline();
  });

  // Event Bus listeners
  stateBus.addEventListener('checkout:closed', loadWeekAgenda);
  stateBus.addEventListener('agenda:recarregar', loadWeekAgenda);
}

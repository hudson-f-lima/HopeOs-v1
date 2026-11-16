// Agenda → horário livre: Agendar ou Bloquear (D-046). Bloqueios e ausências aparecem na grade.
// O servidor decide tudo (permissão, quem marcou, conflito); a tela só sugere o fim do bloqueio:
// até o próximo agendamento, até o fim do expediente (da disponibilidade do dia) ou +30/+60 min.
// O que o próprio profissional marcou só ele encurta ou remove (a equipe vê, sem botões).
import { api } from '../api.js';
import { state, sessionPode, loadWeekAgenda, findProfissionalNome } from '../state.js';
import { escapeHtml, openModal, closeModal, showBanner } from '../utils.js';

const el = id => document.getElementById(id);
const TIPOS = ['bloqueio', 'ausencia'];
const MOTIVOS = ['Almoço', 'Pessoal', 'Médico', 'Curso'];
const min = hhmm => { const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const proprioId = () => (state.session && state.session.profissional_id) || null;
const dataBR = d => d.split('-').reverse().slice(0, 2).join('/');

let alvo = null; // { data, horario, profissionalId, abrirAgendar }
let aberto = null; // exceção tocada na grade

// ---------- Grade ----------
// Trechos bloqueados do profissional no dia, em minutos do dia: [{ exc, ini, fim }].
export function bloqueiosDoDia(profId, data) {
  return (state.weekExcecoes || [])
    .filter(e => e.profissionalId === profId && TIPOS.includes(e.tipo) && e.dataInicio <= data && e.dataFim >= data)
    .map(e => ({ exc: e, ini: e.inicio ? min(e.inicio) : 0, fim: e.fim ? min(e.fim) : 24 * 60 }));
}

export function htmlBloqueios(profId, data, { horaInicio, horaFim, pxPorMin }) {
  return bloqueiosDoDia(profId, data).map(({ exc, ini, fim }) => {
    const a = Math.max(ini, horaInicio * 60); const b = Math.min(fim, horaFim * 60);
    if (b <= a) return '';
    const rotulo = (exc.tipo === 'ausencia' ? 'Ausente' : 'Bloqueado') + (exc.motivo ? ' · ' + exc.motivo : '');
    return '<div class="ag-bloqueio" data-action="open-bloqueio" data-exc-id="' + escapeHtml(exc.id) + '" style="top:' + ((a - horaInicio * 60) * pxPorMin) + 'px;height:'
      + ((b - a) * pxPorMin) + 'px;" title="' + escapeHtml(rotulo) + '"><span>' + escapeHtml(rotulo) + '</span></div>';
  }).join('');
}

// ---------- Permissões (a tela só esconde; o servidor recusa) ----------
const podeBloquearPara = profId => sessionPode('escala:bloquear') && (sessionPode('escala:bloquear', true) || profId === proprioId());
const podeMexer = exc => {
  if (exc.marcadoPeloProfissional && exc.profissionalId !== proprioId()) return false;
  return podeBloquearPara(exc.profissionalId);
};

// ---------- Horário livre: escolher ----------
export function abrirHorarioLivre(data, horario, profissionalId, abrirAgendar) {
  const podeAgendar = sessionPode('agenda:criar');
  const podeBloquear = podeBloquearPara(profissionalId);
  if (!podeBloquear) return abrirAgendar(data, horario, profissionalId);
  alvo = { data, horario, profissionalId, abrirAgendar };
  el('slotTitulo').textContent = dataBR(data) + ' · ' + horario + ' · ' + (findProfissionalNome(profissionalId) || 'Profissional');
  el('slotEscolha').classList.remove('hidden');
  el('btnSlotAgendar').classList.toggle('hidden', !podeAgendar);
  el('slotBloquear').classList.add('hidden');
  el('slotExistente').classList.add('hidden');
  el('slotErro').classList.add('hidden');
  openModal('modalSlot');
  if (!podeAgendar) mostrarBloquear();
}

// Fim sugerido: o que vier primeiro entre o próximo agendamento e o fim do período de trabalho.
async function mostrarBloquear() {
  const { data, horario, profissionalId } = alvo;
  el('slotEscolha').classList.add('hidden');
  el('slotBloquear').classList.remove('hidden');
  el('slotAviso').textContent = profissionalId === proprioId()
    ? 'Só você pode encurtar ou remover este bloqueio. Fica registrado no histórico.'
    : 'Fica registrado como marcado pela equipe.';
  el('slotMotivo').value = '';
  const ini = min(horario);
  const ocupados = (state.weekAgenda[data] || [])
    .filter(i => i.profissional_id === profissionalId && !['cancelado', 'reagendado'].includes(i.status))
    .map(i => min(i.horario)).filter(m => m > ini).sort((a, b) => a - b);
  const proximo = ocupados[0];
  const opcoes = [];
  const add = (fim, rotulo) => { if (fim > ini && fim <= 24 * 60 && !opcoes.some(o => o.fim === fim)) opcoes.push({ fim, rotulo }); };
  add(ini + 30, '30 min'); add(ini + 60, '1 hora');
  if (proximo) add(proximo, 'Até o próximo cliente (' + hhmm(proximo) + ')');
  pintarOpcoes(opcoes, proximo ? Math.min(proximo, ini + 60) : ini + 60);
  try {
    const d = await api('/disponibilidade/dia?data=' + encodeURIComponent(data) + '&profissionalId=' + encodeURIComponent(profissionalId));
    const periodo = (d.periodos || []).find(p => min(p.inicio) <= ini && min(p.fim) > ini);
    if (alvo && alvo.data === data && alvo.horario === horario) {
      if (periodo) add(min(periodo.fim), 'Até o fim do expediente (' + periodo.fim + ')');
      else el('slotAviso').textContent += ' Este horário já está fora da escala.';
      pintarOpcoes(opcoes.sort((a, b) => a.fim - b.fim), Number(el('slotFim').dataset.fim || ini + 60));
    }
  } catch (_) { /* sem a disponibilidade do dia, ficam as outras opções */ }
}

function pintarOpcoes(opcoes, escolhido) {
  el('slotFimOpcoes').innerHTML = opcoes.map(o => '<button type="button" class="chip' + (o.fim === escolhido ? ' selected' : '') + '" data-slot-fim="' + o.fim + '">' + escapeHtml(o.rotulo) + '</button>').join('');
  el('slotFim').value = hhmm(escolhido);
  el('slotFim').dataset.fim = String(escolhido);
}

async function salvarBloqueio() {
  const { data, horario, profissionalId } = alvo;
  const fim = el('slotFim').value;
  if (!/^\d{2}:\d{2}$/.test(fim) || min(fim) <= min(horario)) return erro('O fim precisa ser depois de ' + horario + '.');
  const botao = el('btnSlotSalvar'); botao.disabled = true;
  try {
    await api('/disponibilidade/excecoes', { method: 'POST', body: { profissionalId, tipo: 'bloqueio', dataInicio: data, dataFim: data, periodos: [{ inicio: horario, fim }], motivo: el('slotMotivo').value.trim() || undefined } });
    closeModal('modalSlot');
    showBanner('Horário bloqueado: ' + horario + '–' + fim + '.', 'ok');
    await loadWeekAgenda();
  } catch (err) {
    erro(err.code === 'CONFLITOS_PENDENTES' && err.details ? 'Há cliente marcado nesse trecho (' + err.details.afetados.map(a => a.horario).join(', ') + '). Escolha um fim antes dele.' : err.message);
  } finally { botao.disabled = false; }
}

// ---------- Bloqueio tocado na grade ----------
export function abrirBloqueio(excOuId) {
  aberto = typeof excOuId === 'object' ? excOuId : (state.weekExcecoes || []).find(e => e.id === excOuId);
  if (!aberto) return;
  const e = aberto;
  const quando = e.tipo === 'ausencia' ? 'dia inteiro' : e.inicio + '–' + e.fim;
  const dias = e.dataInicio === e.dataFim ? dataBR(e.dataInicio) : dataBR(e.dataInicio) + ' a ' + dataBR(e.dataFim);
  el('slotTitulo').textContent = (e.tipo === 'ausencia' ? 'Ausência' : 'Bloqueio') + ' · ' + (findProfissionalNome(e.profissionalId) || 'Profissional');
  el('slotEscolha').classList.add('hidden');
  el('slotBloquear').classList.add('hidden');
  el('slotExistente').classList.remove('hidden');
  el('slotErro').classList.add('hidden');
  el('slotInfo').textContent = dias + ' · ' + quando + (e.motivo ? ' · ' + e.motivo : '') + (e.marcadoPeloProfissional ? ' · marcado pelo profissional' : ' · marcado pela equipe');
  const pode = podeMexer(e);
  // Um dia só: encurta pelo horário. Vários dias ou ausência: encurta pelo último dia.
  const porHora = e.tipo === 'bloqueio' && e.dataInicio === e.dataFim;
  const encurtavel = pode && (porHora || e.dataFim > e.dataInicio);
  el('slotEncurtarBox').classList.toggle('hidden', !encurtavel);
  el('slotNovoFimBox').classList.toggle('hidden', !porHora);
  el('slotNovaDataBox').classList.toggle('hidden', porHora);
  if (encurtavel && !porHora) {
    const ontemDoFim = new Date(e.dataFim + 'T12:00:00Z'); ontemDoFim.setUTCDate(ontemDoFim.getUTCDate() - 1);
    el('slotNovaData').min = e.dataInicio; el('slotNovaData').max = ontemDoFim.toISOString().slice(0, 10);
    el('slotNovaData').value = el('slotNovaData').max;
    el('btnSlotEncurtar').textContent = 'Encurtar';
  }
  el('btnSlotRemover').classList.toggle('hidden', !pode);
  el('slotSoLeitura').classList.toggle('hidden', pode);
  el('slotSoLeitura').textContent = e.marcadoPeloProfissional ? 'Só o próprio profissional pode encurtar ou remover.' : 'Sem permissão para alterar.';
  if (encurtavel && porHora) {
    const agora = new Date();
    const hoje = agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    const [hh, mm] = agora.toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number);
    const agoraMin = hh * 60 + mm;
    const emCurso = e.dataInicio === hoje && agoraMin > min(e.inicio) && agoraMin < min(e.fim);
    const sugestao = emCurso ? Math.ceil(agoraMin / 5) * 5 : min(e.fim) - 30 > min(e.inicio) ? min(e.fim) - 30 : min(e.inicio) + Math.floor((min(e.fim) - min(e.inicio)) / 2);
    el('slotNovoFim').value = hhmm(Math.min(sugestao, min(e.fim) - 5));
    el('btnSlotEncurtar').textContent = emCurso ? 'Terminar o bloqueio aí' : 'Encurtar';
  }
  openModal('modalSlot');
}

async function encurtar() {
  const e = aberto;
  const porHora = e.tipo === 'bloqueio' && e.dataInicio === e.dataFim;
  let body; let ate;
  if (porHora) {
    const fim = el('slotNovoFim').value;
    if (!/^\d{2}:\d{2}$/.test(fim) || min(fim) <= min(e.inicio) || min(fim) >= min(e.fim)) return erro('Escolha um horário entre ' + e.inicio + ' e ' + e.fim + '.');
    body = { fim }; ate = fim;
  } else {
    const d = el('slotNovaData').value;
    if (!d || d < e.dataInicio || d >= e.dataFim) return erro('Escolha um dia entre ' + dataBR(e.dataInicio) + ' e o dia anterior a ' + dataBR(e.dataFim) + '.');
    body = { dataFim: d }; ate = dataBR(d);
  }
  try {
    await api('/disponibilidade/excecoes/' + encodeURIComponent(e.id) + '/encurtar', { method: 'POST', body });
    closeModal('modalSlot');
    showBanner('Encurtado: agora vai até ' + ate + '. O original fica no histórico.', 'ok');
    await loadWeekAgenda();
    document.dispatchEvent(new CustomEvent('escala:mudou'));
  } catch (err) { erro(err.message); }
}

async function remover() {
  const e = aberto;
  try {
    await api('/disponibilidade/excecoes/' + encodeURIComponent(e.id), { method: 'DELETE', body: {} });
    closeModal('modalSlot');
    showBanner('Bloqueio removido. Fica no histórico.', 'ok');
    await loadWeekAgenda();
    document.dispatchEvent(new CustomEvent('escala:mudou'));
  } catch (err) { erro(err.message); }
}

function erro(m) { const x = el('slotErro'); x.textContent = m; x.classList.remove('hidden'); }

export function initAgendaBloqueio() {
  if (!el('modalSlot')) return;
  el('slotMotivos').innerHTML = MOTIVOS.map(m => '<button type="button" class="chip" data-slot-motivo="' + escapeHtml(m) + '">' + escapeHtml(m) + '</button>').join('');
  el('btnSlotAgendar').addEventListener('click', () => { const a = alvo; closeModal('modalSlot'); a.abrirAgendar(a.data, a.horario, a.profissionalId); });
  el('btnSlotBloquear').addEventListener('click', mostrarBloquear);
  el('btnSlotSalvar').addEventListener('click', salvarBloqueio);
  el('btnSlotEncurtar').addEventListener('click', encurtar);
  el('btnSlotRemover').addEventListener('click', remover);
  el('btnSlotFechar').addEventListener('click', () => closeModal('modalSlot'));
  el('slotFimOpcoes').addEventListener('click', ev => {
    const b = ev.target.closest('[data-slot-fim]'); if (!b) return;
    el('slotFimOpcoes').querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c === b));
    el('slotFim').value = hhmm(Number(b.dataset.slotFim)); el('slotFim').dataset.fim = b.dataset.slotFim;
  });
  el('slotFim').addEventListener('input', () => el('slotFimOpcoes').querySelectorAll('.chip').forEach(c => c.classList.remove('selected')));
  el('slotMotivos').addEventListener('click', ev => {
    const b = ev.target.closest('[data-slot-motivo]'); if (!b) return;
    el('slotMotivo').value = b.dataset.slotMotivo;
  });
}

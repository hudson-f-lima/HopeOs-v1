// Card do agendamento (folha de ações), compacto e editável. Tocar em Serviço, Profissional,
// Quando ou Duração abre o editor no próprio card (sem outro modal por cima). Gravação pelo
// servidor, que é a fonte de verdade:
//   serviço / profissional / quando → reagendamento (atômico, sem conflito, fica na trilha; se o
//   dia e a hora não mudam, a confirmação do cliente continua);
//   duração → PATCH /agenda/:id/duracao.
// Fora da escala e horário ocupado: quem pode encaixar decide, como no resto da agenda.
import { api, getAgendaSlots } from '../api.js';
import { state, sessionPode, loadWeekAgenda, findServicoNome, findProfissionalNome, findAgendaItemById } from '../state.js';
import { escapeHtml, showBanner, closeModal, confirmAction } from '../utils.js';

const el = id => document.getElementById(id);
const hhmm = t => String(t || '').slice(0, 5);
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const diaCurto = d => { const x = new Date(d + 'T12:00:00'); return DIAS[x.getDay()] + ' ' + d.slice(8, 10) + '/' + d.slice(5, 7); };
const EDITAVEL = ['agendado', 'confirmado'];

export function podeEditarCampo(item, campo) {
  if (!EDITAVEL.includes(item.status) || !sessionPode('agenda:editar')) return false;
  if (campo === 'profissional') return sessionPode('agenda:editar', true); // quem só mexe no próprio não troca de profissional
  return true;
}

function campo(item, chave, rotulo, valor) {
  const pode = podeEditarCampo(item, chave);
  return pode
    ? '<button type="button" class="agc-campo" data-editar="' + chave + '" aria-label="Alterar ' + escapeHtml(rotulo.toLowerCase()) + '"><span>' + escapeHtml(rotulo) + '</span><b>' + escapeHtml(valor) + '</b><i aria-hidden="true">✎</i></button>'
    : '<div class="agc-campo"><span>' + escapeHtml(rotulo) + '</span><b>' + escapeHtml(valor) + '</b></div>';
}

export function htmlCampos(item) {
  return '<div class="agc-campos">'
    + campo(item, 'servico', 'Serviço', findServicoNome(item.servico_id))
    + campo(item, 'profissional', 'Profissional', findProfissionalNome(item.profissional_id))
    + campo(item, 'quando', 'Quando', diaCurto(String(item.data).slice(0, 10)) + ' · ' + hhmm(item.horario))
    + campo(item, 'duracao', 'Duração', (item.duracao_min || 30) + ' min')
    + '</div><div class="agc-editor hidden" id="agcEditor" role="group" aria-label="Alterar agendamento"></div>';
}

// ---------- Editor ----------
let alvo = null; // { item, campo }
const links = () => state.catalog.profissional_servicos || [];

function opcoes(lista, atual) {
  return lista.map(x => '<option value="' + escapeHtml(x.id) + '"' + (x.id === atual ? ' selected' : '') + '>' + escapeHtml(x.nome) + '</option>').join('');
}

export function abrirEditor(item, campoNome) {
  alvo = { item, campo: campoNome };
  const box = el('agcEditor');
  let corpo = '';
  if (campoNome === 'servico') {
    const ids = links().filter(l => l.profissional_id === item.profissional_id).map(l => l.servico_id);
    const lista = state.catalog.servicos.filter(s => s.ativo !== false && (!ids.length || ids.includes(s.id)));
    corpo = '<label for="agcServico">Serviço</label><select id="agcServico">' + opcoes(lista, item.servico_id) + '</select>'
      + '<p class="agc-dica">A duração e o valor passam a ser os do novo serviço.</p>';
  } else if (campoNome === 'profissional') {
    const ids = links().filter(l => l.servico_id === item.servico_id).map(l => l.profissional_id);
    const lista = state.catalog.profissionais.filter(p => p.ativo !== false && (!ids.length || ids.includes(p.id)));
    corpo = '<label for="agcProfissional">Profissional</label><select id="agcProfissional">' + opcoes(lista, item.profissional_id) + '</select>';
  } else if (campoNome === 'quando') {
    corpo = '<div class="agc-linha"><div><label for="agcData">Dia</label><input id="agcData" type="date" value="' + escapeHtml(String(item.data).slice(0, 10)) + '"/></div>'
      + '<div><label for="agcHora">Hora</label><input id="agcHora" type="time" step="300" value="' + escapeHtml(hhmm(item.horario)) + '"/></div></div>'
      + '<div class="agc-livres" id="agcLivres"></div>'
      + (item.status === 'confirmado' ? '<p class="agc-dica">Mudando dia ou hora, o cliente precisa confirmar de novo.</p>' : '');
  } else if (campoNome === 'duracao') {
    corpo = '<label for="agcDuracao">Duração (min)</label><div class="agc-linha agc-dur">'
      + '<button type="button" class="btn" data-agc-dur="-15">−15</button><input id="agcDuracao" type="number" min="10" max="480" step="5" value="' + (item.duracao_min || 30) + '"/>'
      + '<button type="button" class="btn" data-agc-dur="15">+15</button></div>';
  }
  box.innerHTML = corpo + '<p class="agc-erro hidden" id="agcErro" role="alert"></p>'
    + '<div class="agc-linha agc-botoes"><button type="button" class="btn" id="agcCancelar">Cancelar</button><button type="button" class="btn primary" id="agcSalvar">Salvar</button></div>';
  box.classList.remove('hidden');
  document.querySelectorAll('.agc-campo[data-editar]').forEach(b => b.classList.toggle('ativo', b.dataset.editar === campoNome));
  if (campoNome === 'quando') { sugerirLivres(); el('agcData').addEventListener('change', sugerirLivres); }
  box.querySelector('select, input')?.focus();
}

// Horários livres do dia escolhido (o servidor calcula), em chips: um toque preenche a hora.
let livresSeq = 0;
async function sugerirLivres() {
  const { item } = alvo; const data = el('agcData').value; const box = el('agcLivres');
  if (!data) { box.innerHTML = ''; return; }
  const seq = ++livresSeq;
  box.innerHTML = '<span class="agc-dica">Buscando horários livres…</span>';
  try {
    const r = await getAgendaSlots({ data, profissionalId: item.profissional_id, servicoId: item.servico_id });
    if (seq !== livresSeq) return;
    const livres = (r.slots || []).slice(0, 12);
    box.innerHTML = livres.length
      ? livres.map(s => '<button type="button" class="chip' + (s.recomendado ? ' agc-ideal' : '') + '" data-agc-hora="' + escapeHtml(s.horario) + '">' + escapeHtml(s.horario) + '</button>').join('')
      : '<span class="agc-dica">Sem horário livre neste dia.</span>';
  } catch (_) { if (seq === livresSeq) box.innerHTML = ''; }
}

function fecharEditor() {
  alvo = null;
  const box = el('agcEditor'); if (box) { box.classList.add('hidden'); box.innerHTML = ''; }
  document.querySelectorAll('.agc-campo.ativo').forEach(b => b.classList.remove('ativo'));
}

function erro(m) { const x = el('agcErro'); if (x) { x.textContent = m; x.classList.remove('hidden'); } }

async function reagendar(item, mudancas, extra = {}) {
  const body = {
    novoStatus: 'reagendado',
    novaData: mudancas.novaData || String(item.data).slice(0, 10),
    novoHorario: mudancas.novoHorario || hhmm(item.horario),
    novoProfissionalId: mudancas.novoProfissionalId || item.profissional_id,
    ...(mudancas.novoServicoId ? { novoServicoId: mudancas.novoServicoId } : {}),
    ...extra
  };
  try {
    return await api('/agenda/' + encodeURIComponent(item.id) + '/status', { method: 'PATCH', body });
  } catch (err) {
    if (err.code === 'FORA_DA_DISPONIBILIDADE' && !extra.foraDaDisponibilidade && sessionPode('agenda:encaixar')
      && await confirmAction({ title: 'Fora do horário', message: err.message + ' Alterar mesmo assim? Fica registrado como encaixe.', confirmLabel: 'Alterar mesmo assim' })) {
      return reagendar(item, mudancas, { ...extra, foraDaDisponibilidade: true });
    }
    if (err.code === 'SCHEDULE_CONFLICT' && !extra.permitirConflito && sessionPode('agenda:encaixar')
      && await confirmAction({ title: 'Horário ocupado', message: 'Já há atendimento nesse horário. Encaixar mesmo assim?', confirmLabel: 'Encaixar' })) {
      return reagendar(item, mudancas, { ...extra, permitirConflito: true });
    }
    throw err;
  }
}

async function salvar() {
  const { item, campo: c } = alvo;
  const botao = el('agcSalvar'); botao.disabled = true;
  try {
    if (c === 'duracao') {
      const d = Number(el('agcDuracao').value);
      if (!Number.isInteger(d) || d < 10 || d > 480) throw new Error('Duração entre 10 e 480 minutos.');
      if (d === (item.duracao_min || 30)) return fecharEditor();
      await api('/agenda/' + encodeURIComponent(item.id) + '/duracao', { method: 'PATCH', body: { duracaoMin: d } });
    } else {
      const mud = {};
      if (c === 'servico') { mud.novoServicoId = el('agcServico').value; if (mud.novoServicoId === item.servico_id) return fecharEditor(); }
      if (c === 'profissional') { mud.novoProfissionalId = el('agcProfissional').value; if (mud.novoProfissionalId === item.profissional_id) return fecharEditor(); }
      if (c === 'quando') {
        mud.novaData = el('agcData').value; mud.novoHorario = el('agcHora').value;
        if (!mud.novaData || !/^\d{2}:\d{2}$/.test(mud.novoHorario)) throw new Error('Escolha o dia e a hora.');
        if (mud.novaData === String(item.data).slice(0, 10) && mud.novoHorario === hhmm(item.horario)) return fecharEditor();
      }
      await reagendar(item, mud);
    }
    closeModal('actionSheet');
    showBanner('Agendamento alterado. Fica no histórico.', 'ok');
    await loadWeekAgenda();
  } catch (err) {
    erro(err.message);
  } finally { if (el('agcSalvar')) botao.disabled = false; }
}

export function initCardAgendamento() {
  const raiz = el('actionSheetContent');
  if (!raiz) return;
  raiz.addEventListener('click', ev => {
    const c = ev.target.closest('[data-editar]');
    if (c) {
      const item = findAgendaItemById(el('actionSheet').dataset.agendaId);
      if (!item) return;
      if (alvo && alvo.campo === c.dataset.editar) return fecharEditor();
      return abrirEditor(item, c.dataset.editar);
    }
    if (ev.target.closest('#agcCancelar')) return fecharEditor();
    if (ev.target.closest('#agcSalvar')) return salvar();
    const h = ev.target.closest('[data-agc-hora]');
    if (h) { el('agcHora').value = h.dataset.agcHora; el('agcLivres').querySelectorAll('.chip').forEach(x => x.classList.toggle('selected', x === h)); return; }
    const d = ev.target.closest('[data-agc-dur]');
    if (d) { const i = el('agcDuracao'); i.value = String(Math.min(480, Math.max(10, Number(i.value || 30) + Number(d.dataset.agcDur)))); }
  });
}

export function resetarEditor() { alvo = null; }

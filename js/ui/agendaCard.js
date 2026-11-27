// Card do agendamento (folha de ações), compacto e editável. Tocar em Serviço, Profissional,
// Quando ou Duração abre o editor no próprio card (sem outro modal por cima). Gravação pelo
// servidor, que é a fonte de verdade:
//   serviço / profissional / quando → reagendamento (atômico, sem conflito, fica na trilha; se o
//   dia e a hora não mudam, a confirmação do cliente continua);
//   duração → PATCH /agenda/:id/duracao.
// Fora da escala e horário ocupado: quem pode encaixar decide, como no resto da agenda.
import { api, getAgendaSlots, getListaEspera } from '../api.js';
import { state, stateBus, sessionPode, loadWeekAgenda, findServicoNome, findProfissionalNome, findAgendaItemById, findClienteNome } from '../state.js';
import { escapeHtml, showBanner, closeModal, confirmAction } from '../utils.js';

const el = id => document.getElementById(id);
const hhmm = t => String(t || '').slice(0, 5);
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const diaCurto = d => { const x = new Date(d + 'T12:00:00'); return DIAS[x.getDay()] + ' ' + d.slice(8, 10) + '/' + d.slice(5, 7); };
const EDITAVEL = ['agendado', 'confirmado'];

// ---------- Regras da agenda (D-049) ----------
// O servidor devolve 409 REGRAS_DA_AGENDA com os avisos; a recepção decide seguir (fica no histórico).
export async function confirmarRegras(err) {
  if (!err || err.code !== 'REGRAS_DA_AGENDA') return false;
  const avisos = ((err.details && err.details.avisos) || []).map(a => a.mensagem);
  return confirmAction({ title: 'Regras da agenda', message: avisos.join(' • ') + ' Seguir mesmo assim? Fica registrado como exceção.', confirmLabel: 'Seguir mesmo assim' });
}

// Regras do salão para a tela (prazo de cancelamento, alerta de atraso, "Cliente chegou").
// Guarda só a resposta que deu certo (D-084): antes, a primeira chamada (antes do login) falhava,
// ficava guardada como {} e a recepção e o profissional nunca recebiam as regras do salão.
let regras = null;
export async function carregarRegras(forcar = false) {
  if (regras && !forcar) return regras;
  try { regras = await api('/empresa'); } catch (_) { return regras || {}; }
  return regras;
}
const agoraSP = () => {
  const d = new Date();
  const data = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const [h, m] = d.toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number);
  return { data, minuto: h * 60 + m };
};
const minutos = t => { const [h, m] = hhmm(t).split(':').map(Number); return h * 60 + m; };
const minutosAte = item => {
  const a = agoraSP(); const d = String(item.data).slice(0, 10);
  const dias = Math.round((Date.parse(d + 'T12:00:00Z') - Date.parse(a.data + 'T12:00:00Z')) / 864e5);
  return dias * 1440 + minutos(item.horario) - a.minuto;
};
export function prazoCancelamento(item) {
  const sv = (state.catalog.servicos || []).find(s => s.id === item.servico_id) || {};
  const doServico = Number.isInteger(sv.cancelamento_prazo_min) ? sv.cancelamento_prazo_min : null;
  const doSalao = regras && Number.isInteger(regras.online_cancelamento_prazo_min) ? regras.online_cancelamento_prazo_min : 120;
  return doServico !== null ? doServico : doSalao;
}
const horasTxt = m => (m >= 60 ? (m % 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : m / 60 + ' h') : m + ' min');
// Texto para o diálogo de cancelar: dentro ou fora do prazo (o mesmo que a confiabilidade usa).
export function textoCancelamento(item) {
  const prazo = prazoCancelamento(item); const falta = minutosAte(item);
  if (falta >= prazo) return 'Dentro do prazo (' + horasTxt(prazo) + ' antes): não conta contra o cliente.';
  return 'Cancelamento tardio: ' + (falta > 0 ? 'faltam ' + horasTxt(falta) : 'o horário já passou') + ' e o prazo é ' + horasTxt(prazo) + '. Conta na confiabilidade do cliente.';
}
// "Cliente chegou" como opção do salão (028, D-084). Sem a regra carregada (ou backend antigo): usa, como sempre.
export function usaChegada() {
  return !(regras && regras.agenda_usa_chegada === false);
}
// Atraso: hoje, ainda não chegou e passou do alerta configurado → minutos de atraso (ou 0).
// Salão que não marca a chegada: sem aviso (todo cliente pareceria atrasado).
export function atrasoMin(item) {
  if (!usaChegada() || !['agendado', 'confirmado'].includes(item.status)) return 0;
  const alerta = regras && Number.isInteger(regras.agenda_atraso_alerta_min) ? regras.agenda_atraso_alerta_min : 15;
  const atraso = -minutosAte(item);
  return alerta > 0 && atraso >= alerta && atraso < 24 * 60 ? atraso : 0;
}

export function podeEditarCampo(item, campo) {
  if (!EDITAVEL.includes(item.status) || !sessionPode('agenda:editar')) return false;
  // Troca de cliente (D-051): só quem edita a agenda de todos, e só horário que ainda não começou.
  if (campo === 'cliente') return sessionPode('agenda:editar', true) && minutosAte(item) > 0;
  if (campo === 'profissional') return sessionPode('agenda:editar', true); // quem só mexe no próprio não troca de profissional
  return true;
}

function campo(item, chave, rotulo, valor) {
  const pode = podeEditarCampo(item, chave);
  return pode
    ? '<button type="button" class="agc-campo" data-editar="' + chave + '" aria-label="Alterar ' + escapeHtml(rotulo.toLowerCase()) + '"><span>' + escapeHtml(rotulo) + '</span><b>' + escapeHtml(valor) + '</b><i aria-hidden="true">✎</i></button>'
    : '<div class="agc-campo"><span>' + escapeHtml(rotulo) + '</span><b>' + escapeHtml(valor) + '</b></div>';
}

// Nome do cliente no topo do card: tocável (✎) quando dá para trocar.
export function htmlCliente(item) {
  const nome = escapeHtml(findClienteNome(item.cliente_id));
  return podeEditarCampo(item, 'cliente')
    ? '<button type="button" class="agc-cliente-btn" data-editar="cliente" aria-label="Trocar o cliente">' + nome + ' <i aria-hidden="true">✎</i></button>'
    : nome;
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
  } else if (campoNome === 'cliente') {
    corpo = '<fieldset class="agc-motivo"><legend>Por que trocar?</legend>'
      + '<label><input type="radio" name="agcMotivo" value="correcao" checked/> Corrigir o cliente</label>'
      + '<label><input type="radio" name="agcMotivo" value="vaga_repassada"/> Passar a vaga</label></fieldset>'
      + '<p class="agc-dica" id="agcMotivoDica"></p>'
      + '<label for="agcClienteBusca">Novo cliente</label><input id="agcClienteBusca" type="search" autocomplete="off" placeholder="Buscar pelo nome"/>'
      + '<div class="agc-clientes" id="agcClientes" role="listbox" aria-label="Clientes sugeridos"></div>'
      + '<p class="agc-dica">Quem entra nasce "Agendado" (confirma depois). O link do cliente anterior deixa de valer para este horário.</p>';
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
  if (campoNome === 'cliente') { clienteEscolhido = null; dicaMotivo(); sugerirClientes(''); el('agcClienteBusca').addEventListener('input', ev => sugerirClientes(ev.target.value)); }
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

// ---------- Troca de cliente (D-051) ----------
let clienteEscolhido = null;
let esperaCache = null;
const semAcento = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const sobrenome = n => semAcento(n).trim().split(/\s+/).slice(1).pop() || '';
const digitos = t => String(t || '').replace(/\D/g, '').slice(-8);
function dicaMotivo() {
  const m = (document.querySelector('input[name="agcMotivo"]:checked') || {}).value;
  const atual = findClienteNome(alvo.item.cliente_id);
  el('agcMotivoDica').textContent = m === 'vaga_repassada'
    ? atual + ' desistiu e outra pessoa assume: não conta como falta nem como cancelamento tardio para ' + atual + '.'
    : 'O cliente estava errado (engano de cadastro): nada conta contra ' + atual + '.';
  el('agcSalvar').textContent = m === 'vaga_repassada' ? 'Passar a vaga' : 'Corrigir cliente';
}
// Sugestões: lista de espera do serviço, mesma família (sobrenome ou telefone), recentes do
// profissional na semana; e a busca pelo nome.
async function sugerirClientes(busca) {
  const { item } = alvo;
  const todos = (state.catalog.clientes || []).filter(c => c.ativo !== false && c.id !== item.cliente_id);
  const atual = (state.catalog.clientes || []).find(c => c.id === item.cliente_id) || {};
  const grupos = [];
  const termo = semAcento(busca).trim();
  if (termo.length >= 2) grupos.push(['Busca', todos.filter(c => semAcento(c.nome).includes(termo)).slice(0, 8)]);
  else {
    if (sessionPode('espera:ver')) {
      if (!esperaCache || esperaCache.servico !== item.servico_id) {
        esperaCache = { servico: item.servico_id, lista: await getListaEspera({ servicoId: item.servico_id, status: 'aguardando' }).catch(() => []) };
      }
      const ids = esperaCache.lista.map(x => x.cliente_id);
      grupos.push(['Lista de espera deste serviço', todos.filter(c => ids.includes(c.id))]);
    }
    const sob = sobrenome(atual.nome); const tel = digitos(atual.whatsapp || atual.telefone);
    grupos.push(['Mesma família', todos.filter(c => (sob && sobrenome(c.nome) === sob) || (tel.length === 8 && digitos(c.whatsapp || c.telefone) === tel)).slice(0, 5)]);
    const daSemana = new Set(Object.values(state.weekAgenda || {}).flat().filter(a => a.profissional_id === item.profissional_id).map(a => a.cliente_id));
    grupos.push(['Recentes com ' + findProfissionalNome(item.profissional_id), todos.filter(c => daSemana.has(c.id)).slice(0, 5)]);
  }
  const html = grupos.filter(([, l]) => l.length).map(([t, l]) => '<p class="agc-grupo-tit">' + escapeHtml(t) + '</p>'
    + l.map(c => '<button type="button" class="chip' + (clienteEscolhido === c.id ? ' selected' : '') + '" role="option" aria-selected="' + (clienteEscolhido === c.id) + '" data-agc-cliente="' + escapeHtml(c.id) + '">' + escapeHtml(c.nome) + '</button>').join('')).join('');
  el('agcClientes').innerHTML = html || '<p class="agc-dica">' + (termo.length >= 2 ? 'Nenhum cliente com esse nome. Cadastre em Clientes e volte aqui.' : 'Digite o nome para buscar.') + '</p>';
}

async function trocarCliente(item, extra = {}) {
  const motivo = (document.querySelector('input[name="agcMotivo"]:checked') || {}).value;
  if (!clienteEscolhido) throw new Error('Escolha o novo cliente.');
  try {
    return await api('/agenda/' + encodeURIComponent(item.id) + '/trocar-cliente', { method: 'POST', body: { clienteId: clienteEscolhido, motivo, ...extra } });
  } catch (err) {
    if (!extra.aceitarAvisos && await confirmarRegras(err)) return trocarCliente(item, { ...extra, aceitarAvisos: true });
    throw err;
  }
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
    if (!extra.aceitarAvisos && await confirmarRegras(err)) return reagendar(item, mudancas, { ...extra, aceitarAvisos: true });
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
    if (c === 'cliente') {
      await trocarCliente(item);
    } else if (c === 'duracao') {
      const d = Number(el('agcDuracao').value);
      if (!Number.isInteger(d) || d < 10 || d > 480) throw new Error('Duração entre 10 e 480 minutos.');
      if (d === (item.duracao_min || 30)) return fecharEditor();
      // Além da escala (D-087): pergunta, como na remarcação.
      try {
        await api('/agenda/' + encodeURIComponent(item.id) + '/duracao', { method: 'PATCH', body: { duracaoMin: d } });
      } catch (err) {
        if (!(err.code === 'FORA_DA_DISPONIBILIDADE' && sessionPode('agenda:encaixar')
          && await confirmAction({ title: 'Fora do horário', message: err.message + ' Alterar mesmo assim? Fica registrado como encaixe.', confirmLabel: 'Alterar mesmo assim' }))) throw err;
        await api('/agenda/' + encodeURIComponent(item.id) + '/duracao', { method: 'PATCH', body: { duracaoMin: d, foraDaDisponibilidade: true } });
      }
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
  carregarRegras();
  stateBus.addEventListener('agenda:updated', () => { if (!regras) carregarRegras(); });
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
    const cl = ev.target.closest('[data-agc-cliente]');
    if (cl) { clienteEscolhido = cl.dataset.agcCliente; el('agcClientes').querySelectorAll('[data-agc-cliente]').forEach(x => { const on = x === cl; x.classList.toggle('selected', on); x.setAttribute('aria-selected', String(on)); }); return; }
    if (ev.target.matches && ev.target.matches('input[name="agcMotivo"]')) return dicaMotivo();
    const h = ev.target.closest('[data-agc-hora]');
    if (h) { el('agcHora').value = h.dataset.agcHora; el('agcLivres').querySelectorAll('.chip').forEach(x => x.classList.toggle('selected', x === h)); return; }
    const d = ev.target.closest('[data-agc-dur]');
    if (d) { const i = el('agcDuracao'); i.value = String(Math.min(480, Math.max(10, Number(i.value || 30) + Number(d.dataset.agcDur)))); }
  });
}

export function resetarEditor() { alvo = null; }

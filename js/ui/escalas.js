// Conta → Escalas (D-033): horário da unidade, escala dos profissionais e exceções por data
// (abrir num dia fechado, fechar, horário excepcional, ausência, bloqueio). O servidor calcula e
// decide; se a mudança deixar agendamentos de fora, ele devolve a lista e nada é gravado até
// alguém com permissão confirmar que ficam mantidos (remarcar ou cancelar é feito na agenda).
import { api } from '../api.js';
import { state, sessionPode } from '../state.js';
import { escapeHtml, showBanner, openModal, closeModal, showModalError, clearModalError, todayStr } from '../utils.js';

const el = id => document.getElementById(id);
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const TIPO = { horario: 'Horário excepcional', fechamento: 'Fechado', ausencia: 'Ausência', bloqueio: 'Bloqueio' };
let dados = null;
let alvoSemanal = null; // { profissionalId|null, nome }
let pendente = null; // { enviar(decisoes), erroId }

const dataBR = d => d.split('-').reverse().join('/');
const periodosTexto = ps => ps.map(p => `${p.inicio}–${p.fim}`).join(', ');
const resumoSemanal = semanal => {
  const dias = [...new Set(semanal.map(p => p.diaSemana))].sort();
  if (!dias.length) return 'Sem horário';
  return dias.map(d => `${DIAS[d].slice(0, 3)} ${periodosTexto(semanal.filter(p => p.diaSemana === d))}`).join(' · ');
};
const proprioId = () => (state.session && state.session.profissional_id) || null;

// ---------- Lista ----------
function render() {
  const podeUnidade = sessionPode('unidade:horario');
  const podeEditar = sessionPode('escala:editar');
  const podeBloquear = sessionPode('escala:bloquear');
  const nomeProf = id => (dados.profissionais.find(p => p.id === id) || {}).nome || 'Profissional';
  const unidade = `
    <div class="esc-linha">
      <span class="esc-quem"><b>Unidade</b><span>${escapeHtml(resumoSemanal(dados.unidade.semanal))}</span></span>
      ${podeUnidade ? '<button type="button" class="btn btn-secondary esc-btn" data-esc-semanal="">Horário</button>' : ''}
    </div>`;
  const profs = dados.profissionais.map(p => `
    <div class="esc-linha" data-prof="${escapeHtml(p.id)}">
      <span class="esc-quem"><b>${escapeHtml(p.nome)}</b>
        <span>${p.escalaPublicada ? escapeHtml(resumoSemanal(p.semanal)) : '<span class="esc-alerta">Escala não publicada: não aparece para agendar</span>'}</span></span>
      ${podeEditar ? `<button type="button" class="btn btn-secondary esc-btn" data-esc-semanal="${escapeHtml(p.id)}">Escala</button>` : ''}
    </div>`).join('');
  const excecoes = dados.excecoes.map(e => {
    const quem = e.profissionalId ? nomeProf(e.profissionalId) : 'Unidade';
    const datas = e.dataInicio === e.dataFim ? dataBR(e.dataInicio) : `${dataBR(e.dataInicio)} a ${dataBR(e.dataFim)}`;
    const horas = e.inicio ? ` ${e.inicio}–${e.fim}` : (e.tipo === 'fechamento' ? ' (dia inteiro)' : '');
    const podeRemover = !e.profissionalId ? podeUnidade : e.tipo === 'horario' ? podeEditar : (podeBloquear && (sessionPode('escala:bloquear', true) || e.profissionalId === proprioId()));
    return `<div class="esc-excecao" data-tipo="${escapeHtml(e.tipo)}">
      <span><b>${escapeHtml(datas)}</b> · ${escapeHtml(quem)} · ${escapeHtml(TIPO[e.tipo] || e.tipo)}${escapeHtml(horas)}${e.motivo ? ` · ${escapeHtml(e.motivo)}` : ''}</span>
      ${podeRemover ? `<button type="button" class="btn btn-secondary esc-btn" data-esc-remover="${escapeHtml(e.id)}" aria-label="Remover exceção">Remover</button>` : ''}
    </div>`;
  }).join('') || '<p class="body-sm text-tertiary">Nenhuma exceção marcada daqui para a frente.</p>';
  const podeExcecao = podeUnidade || podeEditar || podeBloquear;
  el('escConteudo').innerHTML = `
    <h3 class="esc-sub">Semana padrão</h3>${unidade}${profs}
    <h3 class="esc-sub">Datas especiais</h3>
    ${podeExcecao ? '<button type="button" class="btn btn-primary" id="btnEscNovaExcecao">Nova data especial</button>' : ''}
    <div id="escExcecoes">${excecoes}</div>`;
}

export async function carregarEscalas() {
  if (!sessionPode('escala:ver')) return;
  try {
    dados = await api('/disponibilidade');
    render();
  } catch (err) {
    el('escConteudo').innerHTML = `<p class="body-sm" role="alert" style="color:var(--md-error)">${escapeHtml(err.message)}</p>`;
  }
}

// ---------- Conflitos ----------
// O servidor devolve 409 CONFLITOS_PENDENTES com os agendamentos afetados. Mostra a lista e,
// se a pessoa puder decidir, oferece manter todos e salvar de novo.
function mostrarConflitos(erroId, afetados, enviar) {
  const lista = afetados.map(a => `<li>${escapeHtml(dataBR(a.data))} ${escapeHtml(a.horario)} · ${escapeHtml(a.profissional || '')}${a.cliente ? ` · ${escapeHtml(a.cliente)}` : ''}</li>`).join('');
  const pode = sessionPode('escala:conflitos');
  const box = el(erroId);
  box.innerHTML = `<b>${afetados.length} agendamento(s) ficariam fora do horário:</b><ul class="esc-conflitos">${lista}</ul>
    ${pode ? 'Remarque ou cancele na agenda, ou mantenha como estão (fica registrado). <button type="button" class="btn btn-secondary esc-manter" id="btnEscManter">Manter e salvar</button>' : 'Peça à recepção ou à gestão para tratar estes agendamentos antes.'}`;
  box.classList.remove('hidden');
  pendente = { enviar, decisoes: afetados.map(a => ({ agendamentoId: a.agendamentoId, decisao: 'manter' })) };
}

async function enviarComConflitos(erroId, enviar, decisoes) {
  try {
    await enviar(decisoes);
    return true;
  } catch (err) {
    if (err.code === 'CONFLITOS_PENDENTES' && err.details && err.details.afetados) {
      mostrarConflitos(erroId, err.details.afetados, enviar);
      return false;
    }
    showModalError(erroId, err.message);
    return false;
  }
}

// ---------- Semana padrão ----------
function linhaPeriodo(dia, p = { inicio: '', fim: '' }) {
  return `<div class="esc-periodo" data-dia="${dia}">
    <input type="time" class="esc-ini" aria-label="${DIAS[dia]}: início" value="${escapeHtml(p.inicio)}"/>
    <span>às</span>
    <input type="time" class="esc-fim" aria-label="${DIAS[dia]}: fim" value="${escapeHtml(p.fim)}"/>
    <button type="button" class="btn btn-secondary esc-btn" data-esc-tirar aria-label="Tirar período">−</button>
  </div>`;
}

function preencherSemana(semanal) {
  el('escSemana').innerHTML = DIAS.map((nome, dia) => `
    <fieldset class="esc-dia" data-dia="${dia}">
      <legend>${nome}</legend>
      <div class="esc-periodos">${semanal.filter(p => p.diaSemana === dia).map(p => linhaPeriodo(dia, p)).join('')}</div>
      <button type="button" class="btn-link" data-esc-mais="${dia}">+ período</button>
    </fieldset>`).join('');
}

function abrirSemanal(profissionalId) {
  pendente = null;
  clearModalError('escSemanalErro');
  const prof = profissionalId ? dados.profissionais.find(p => p.id === profissionalId) : null;
  alvoSemanal = { profissionalId: profissionalId || null };
  el('escSemanalTitulo').textContent = prof ? `Escala de ${prof.nome}` : 'Horário da unidade';
  el('escSemanalAjuda').textContent = prof
    ? 'Quando a pessoa trabalha em cada dia. Para almoço, use dois períodos. Salvar publica a escala: só então ela aparece para agendar.'
    : 'Quando a unidade abre em cada dia. Para fechar no almoço, use dois períodos. Dia sem período = fechado.';
  el('btnEscUsarUnidade').classList.toggle('hidden', !prof);
  preencherSemana(prof ? prof.semanal : dados.unidade.semanal);
  el('btnEscSemanalSalvar').textContent = prof ? 'Salvar e publicar' : 'Salvar';
  openModal('modalEscSemanal');
}

function lerSemana() {
  return [...el('escSemana').querySelectorAll('.esc-periodo')]
    .map(l => ({ diaSemana: Number(l.dataset.dia), inicio: l.querySelector('.esc-ini').value, fim: l.querySelector('.esc-fim').value }))
    .filter(p => p.inicio || p.fim);
}

async function salvarSemanal() {
  clearModalError('escSemanalErro');
  const periodos = lerSemana();
  const url = alvoSemanal.profissionalId ? `/disponibilidade/profissionais/${alvoSemanal.profissionalId}/semanal` : '/disponibilidade/unidade/semanal';
  const enviar = decisoes => api(url, { method: 'PUT', body: alvoSemanal.profissionalId ? { periodos, publicar: true, decisoes } : { periodos, decisoes } });
  const botao = el('btnEscSemanalSalvar');
  botao.disabled = true;
  const ok = await enviarComConflitos('escSemanalErro', enviar, undefined);
  botao.disabled = false;
  if (ok) { closeModal('modalEscSemanal'); showBanner('Horário salvo. Vale para os próximos agendamentos.', 'ok'); carregarEscalas(); }
}

// ---------- Data especial ----------
function opcoesTipo() {
  const alvo = el('escExcAlvo').value;
  const opcoes = !alvo
    ? [['horario', 'Abrir ou mudar o horário neste dia'], ['fechamento', 'Fechar']]
    : [
      ...(sessionPode('escala:editar') ? [['horario', 'Trabalha neste horário (excepcional)']] : []),
      ['bloqueio', 'Bloquear parte do dia'],
      ['ausencia', 'Ausente o dia inteiro (folga, férias, falta)']
    ];
  el('escExcTipo').innerHTML = opcoes.map(([v, t]) => `<option value="${v}">${escapeHtml(t)}</option>`).join('');
  atualizarPeriodosExc();
}

function atualizarPeriodosExc() {
  const tipo = el('escExcTipo').value;
  const semHora = tipo === 'ausencia';
  el('escExcPeriodosBox').classList.toggle('hidden', semHora);
  el('escExcDicaFechar').classList.toggle('hidden', tipo !== 'fechamento');
  if (!semHora && !el('escExcPeriodos').children.length && tipo !== 'fechamento') el('escExcPeriodos').innerHTML = linhaPeriodo(0);
}

function abrirExcecao() {
  pendente = null;
  clearModalError('escExcErro');
  const alvos = [];
  if (sessionPode('unidade:horario')) alvos.push(['', 'Unidade (abrir ou fechar)']);
  const podeTodos = sessionPode('escala:editar') || sessionPode('escala:bloquear', true);
  dados.profissionais
    .filter(p => podeTodos || p.id === proprioId())
    .forEach(p => alvos.push([p.id, p.nome]));
  el('escExcAlvo').innerHTML = alvos.map(([v, t]) => `<option value="${escapeHtml(v)}">${escapeHtml(t)}</option>`).join('');
  const hoje = todayStr();
  el('escExcDe').value = hoje;
  el('escExcAte').value = hoje;
  el('escExcMotivo').value = '';
  el('escExcPeriodos').innerHTML = '';
  opcoesTipo();
  openModal('modalEscExcecao');
}

async function salvarExcecao() {
  clearModalError('escExcErro');
  const profissionalId = el('escExcAlvo').value || null;
  const tipo = el('escExcTipo').value;
  const periodos = tipo === 'ausencia' ? undefined : [...el('escExcPeriodos').querySelectorAll('.esc-periodo')]
    .map(l => ({ inicio: l.querySelector('.esc-ini').value, fim: l.querySelector('.esc-fim').value }))
    .filter(p => p.inicio || p.fim);
  const body = { tipo, dataInicio: el('escExcDe').value, dataFim: el('escExcAte').value || el('escExcDe').value, motivo: el('escExcMotivo').value.trim() || undefined };
  if (profissionalId) body.profissionalId = profissionalId;
  if (periodos && periodos.length) body.periodos = periodos;
  const enviar = decisoes => api('/disponibilidade/excecoes', { method: 'POST', body: { ...body, decisoes } });
  const botao = el('btnEscExcSalvar');
  botao.disabled = true;
  const ok = await enviarComConflitos('escExcErro', enviar, undefined);
  botao.disabled = false;
  if (ok) { closeModal('modalEscExcecao'); showBanner('Data especial salva.', 'ok'); carregarEscalas(); }
}

async function removerExcecao(id) {
  const enviar = decisoes => api(`/disponibilidade/excecoes/${id}`, { method: 'DELETE', body: { decisoes } });
  try {
    await enviar(undefined);
    showBanner('Data especial removida.', 'ok');
    carregarEscalas();
  } catch (err) {
    if (err.code === 'CONFLITOS_PENDENTES' && err.details) {
      showBanner(`${err.details.afetados.length} agendamento(s) ficariam fora do horário. Trate-os na agenda antes de remover.`, 'error');
    } else showBanner(err.message, 'error');
  }
}

export function initEscalas() {
  if (!sessionPode('escala:ver')) return;
  el('subtabBtnEscalas')?.classList.remove('hidden');
  el('escConteudo').addEventListener('click', ev => {
    const s = ev.target.closest('[data-esc-semanal]');
    if (s) return abrirSemanal(s.dataset.escSemanal || null);
    const r = ev.target.closest('[data-esc-remover]');
    if (r) return removerExcecao(r.dataset.escRemover);
    if (ev.target.closest('#btnEscNovaExcecao')) abrirExcecao();
  });
  // Períodos: + e − dentro dos dois modais.
  for (const box of ['escSemana', 'escExcPeriodos']) {
    el(box).addEventListener('click', ev => {
      const tirar = ev.target.closest('[data-esc-tirar]');
      if (tirar) tirar.closest('.esc-periodo').remove();
      const mais = ev.target.closest('[data-esc-mais]');
      if (mais) mais.previousElementSibling.insertAdjacentHTML('beforeend', linhaPeriodo(Number(mais.dataset.escMais)));
    });
  }
  el('btnEscExcMais').addEventListener('click', () => el('escExcPeriodos').insertAdjacentHTML('beforeend', linhaPeriodo(0)));
  el('btnEscUsarUnidade').addEventListener('click', () => preencherSemana(dados.unidade.semanal));
  el('btnEscSemanalSalvar').addEventListener('click', salvarSemanal);
  el('btnEscSemanalCancelar').addEventListener('click', () => closeModal('modalEscSemanal'));
  el('escExcAlvo').addEventListener('change', opcoesTipo);
  el('escExcTipo').addEventListener('change', atualizarPeriodosExc);
  el('btnEscExcSalvar').addEventListener('click', salvarExcecao);
  el('btnEscExcCancelar').addEventListener('click', () => closeModal('modalEscExcecao'));
  // "Manter e salvar" (conflitos), nos dois modais.
  for (const erroId of ['escSemanalErro', 'escExcErro']) {
    el(erroId).addEventListener('click', async ev => {
      if (!ev.target.closest('#btnEscManter') || !pendente) return;
      const { enviar, decisoes } = pendente;
      const modal = erroId === 'escSemanalErro' ? 'modalEscSemanal' : 'modalEscExcecao';
      const ok = await enviarComConflitos(erroId, enviar, decisoes);
      if (ok) { closeModal(modal); showBanner('Salvo. Os agendamentos afetados foram mantidos e isso ficou registrado.', 'ok'); carregarEscalas(); }
    });
  }
  carregarEscalas();
}

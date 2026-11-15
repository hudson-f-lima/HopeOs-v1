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
let alvoSemanal = null; // { profissionalId|null } ou { modeloId|null, modelo: true }
let modelos = [];
let loteOk = null; // corpo da última prévia sem pendências
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
  const listaModelos = sessionPode('escala:modelos') ? `
    <h3 class="esc-sub">Modelos de escala</h3>
    <button type="button" class="btn btn-secondary esc-btn" id="btnEscNovoModelo">Novo modelo</button>
    ${modelos.map(m => `<div class="esc-linha"><span class="esc-quem"><b>${escapeHtml(m.nome)}</b><span>${escapeHtml(resumoSemanal(m.periodos))}</span></span>
      <span class="esc-acoes">
        <button type="button" class="btn btn-secondary esc-btn" data-esc-modelo-editar="${escapeHtml(m.id)}">Editar</button>
        <button type="button" class="btn btn-secondary esc-btn" data-esc-modelo-duplicar="${escapeHtml(m.id)}">Duplicar</button>
        <button type="button" class="btn btn-secondary esc-btn" data-esc-modelo-arquivar="${escapeHtml(m.id)}">Arquivar</button>
      </span></div>`).join('') || '<p class="body-sm text-tertiary">Nenhum modelo. Crie um para repetir escalas (ex.: Equipe de sábado, Véspera de Natal).</p>'}` : '';
  el('escConteudo').innerHTML = `
    ${sessionPode('escala:lote') ? '<button type="button" class="btn btn-primary" id="btnEscLote">Alterar vários de uma vez</button>' : ''}
    <h3 class="esc-sub">Semana padrão</h3>${unidade}${profs}
    <h3 class="esc-sub">Datas especiais</h3>
    ${podeExcecao ? '<button type="button" class="btn btn-primary" id="btnEscNovaExcecao">Nova data especial</button>' : ''}
    <div id="escExcecoes">${excecoes}</div>
    ${listaModelos}`;
}

export async function carregarEscalas() {
  if (!sessionPode('escala:ver')) return;
  try {
    [dados, modelos] = await Promise.all([
      api('/disponibilidade'),
      sessionPode('escala:modelos') ? api('/disponibilidade/modelos').catch(() => []) : Promise.resolve([])
    ]);
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
    <input type="time" class="esc-ini" aria-label="${escapeHtml(DIAS[dia])}: início" value="${escapeHtml(p.inicio)}"/>
    <span>às</span>
    <input type="time" class="esc-fim" aria-label="${escapeHtml(DIAS[dia])}: fim" value="${escapeHtml(p.fim)}"/>
    <button type="button" class="btn btn-secondary esc-btn" data-esc-tirar aria-label="Tirar período">−</button>
  </div>`;
}

function preencherSemana(semanal, caixa = 'escSemana') {
  el(caixa).innerHTML = DIAS.map((nome, dia) => `
    <fieldset class="esc-dia" data-dia="${dia}">
      <legend>${escapeHtml(nome)}</legend>
      <div class="esc-periodos">${semanal.filter(p => p.diaSemana === dia).map(p => linhaPeriodo(dia, p)).join('')}</div>
      <button type="button" class="btn-link" data-esc-mais="${dia}">+ período</button>
    </fieldset>`).join('');
}

function abrirModelo(modeloId) {
  pendente = null;
  clearModalError('escSemanalErro');
  const m = modeloId ? modelos.find(x => x.id === modeloId) : null;
  alvoSemanal = { modelo: true, modeloId: modeloId || null };
  el('escSemanalTitulo').textContent = m ? `Modelo: ${m.nome}` : 'Novo modelo de escala';
  el('escSemanalAjuda').textContent = 'Um modelo guarda horários por dia da semana para aplicar depois a várias pessoas (em "Alterar vários"). Mudar o modelo não muda o que já foi aplicado.';
  el('escSemanalNomeBox').classList.remove('hidden');
  el('escSemanalNome').value = m ? m.nome : '';
  el('btnEscUsarUnidade').classList.remove('hidden');
  preencherSemana(m ? m.periodos : []);
  el('btnEscSemanalSalvar').textContent = 'Salvar modelo';
  openModal('modalEscSemanal');
}

function abrirSemanal(profissionalId) {
  pendente = null;
  clearModalError('escSemanalErro');
  el('escSemanalNomeBox').classList.add('hidden');
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

function lerSemana(caixa = 'escSemana') {
  return [...el(caixa).querySelectorAll('.esc-periodo')]
    .map(l => ({ diaSemana: Number(l.dataset.dia), inicio: l.querySelector('.esc-ini').value, fim: l.querySelector('.esc-fim').value }))
    .filter(p => p.inicio || p.fim);
}

async function salvarSemanal() {
  clearModalError('escSemanalErro');
  const periodos = lerSemana();
  if (alvoSemanal.modelo) {
    const corpoModelo = { nome: el('escSemanalNome').value.trim(), periodos };
    try {
      await (alvoSemanal.modeloId
        ? api(`/disponibilidade/modelos/${alvoSemanal.modeloId}`, { method: 'PATCH', body: corpoModelo })
        : api('/disponibilidade/modelos', { method: 'POST', body: corpoModelo }));
      closeModal('modalEscSemanal'); showBanner('Modelo salvo.', 'ok'); carregarEscalas();
    } catch (err) { showModalError('escSemanalErro', err.message); }
    return;
  }
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

// ---------- Alterar vários de uma vez (D-035) ----------
const ACOES_LOTE = [
  ['ausencia', 'Ausência (dia inteiro): folga, férias, treinamento'],
  ['bloqueio', 'Bloquear parte do dia'],
  ['horario', 'Horário excepcional nestas datas'],
  ['fechamento', 'Fechar a unidade (só para a unidade)'],
  ['semanal', 'Mesma semana padrão para todos os escolhidos'],
  ['modelo_semanal', 'Aplicar um modelo como semana padrão'],
  ['modelo_periodo', 'Aplicar um modelo nestas datas']
];

function abrirLote() {
  pendente = null; loteOk = null;
  clearModalError('escLoteErro');
  el('escLotePrevia').innerHTML = '';
  el('btnEscLoteAplicar').disabled = true;
  el('escLoteAlvos').innerHTML = `
    <label class="perm-item"><input type="checkbox" data-lote-todos/><span><b>Todos os profissionais</b></span></label>
    ${sessionPode('unidade:horario') ? '<label class="perm-item"><input type="checkbox" data-lote-alvo=""/><span>Unidade</span></label>' : ''}
    ${dados.profissionais.map(p => `<label class="perm-item"><input type="checkbox" data-lote-alvo="${escapeHtml(p.id)}"/><span>${escapeHtml(p.nome)}</span></label>`).join('')}`;
  el('escLoteAcao').innerHTML = ACOES_LOTE.filter(([v]) => !v.startsWith('modelo') || modelos.length).map(([v, t]) => `<option value="${v}">${escapeHtml(t)}</option>`).join('');
  el('escLoteModelo').innerHTML = modelos.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.nome)}</option>`).join('');
  const hoje = todayStr();
  el('escLoteDe').value = hoje; el('escLoteAte').value = hoje; el('escLoteMotivo').value = '';
  el('escLotePeriodos').innerHTML = '';
  preencherSemana([], 'escLoteSemana');
  atualizarLote();
  openModal('modalEscLote');
}

function atualizarLote() {
  const a = el('escLoteAcao').value;
  loteOk = null; el('btnEscLoteAplicar').disabled = true; el('escLotePrevia').innerHTML = '';
  el('escLoteModeloBox').classList.toggle('hidden', !a.startsWith('modelo'));
  el('escLoteDatasBox').classList.toggle('hidden', a === 'semanal' || a === 'modelo_semanal');
  el('escLotePeriodosBox').classList.toggle('hidden', !['horario', 'bloqueio', 'fechamento'].includes(a));
  el('escLoteSemanaBox').classList.toggle('hidden', a !== 'semanal');
  if (['horario', 'bloqueio'].includes(a) && !el('escLotePeriodos').children.length) el('escLotePeriodos').innerHTML = linhaPeriodo(0);
}

function corpoLote() {
  const marcados = [...el('escLoteAlvos').querySelectorAll('input[data-lote-alvo]:checked')].map(i => i.dataset.loteAlvo);
  const a = el('escLoteAcao').value;
  const datas = { dataInicio: el('escLoteDe').value, dataFim: el('escLoteAte').value || el('escLoteDe').value };
  let operacao;
  if (a === 'modelo_semanal') operacao = { modeloId: el('escLoteModelo').value, modo: 'semanal' };
  else if (a === 'modelo_periodo') operacao = { modeloId: el('escLoteModelo').value, modo: 'periodo', ...datas };
  else if (a === 'semanal') operacao = { tipo: 'semanal', periodos: lerSemana('escLoteSemana') };
  else {
    const periodos = [...el('escLotePeriodos').querySelectorAll('.esc-periodo')]
      .map(l => ({ inicio: l.querySelector('.esc-ini').value, fim: l.querySelector('.esc-fim').value })).filter(p => p.inicio || p.fim);
    operacao = { tipo: a, ...datas, ...(periodos.length && a !== 'ausencia' ? { periodos } : {}) };
  }
  const motivo = el('escLoteMotivo').value.trim();
  if (motivo && !a.endsWith('semanal')) operacao.motivo = motivo;
  return { incluirUnidade: marcados.includes(''), profissionalIds: marcados.filter(Boolean), operacao };
}

async function previaLote() {
  clearModalError('escLoteErro');
  loteOk = null; el('btnEscLoteAplicar').disabled = true;
  const corpoAtual = corpoLote();
  try {
    const p = await api('/disponibilidade/lote', { method: 'POST', body: { ...corpoAtual, simular: true } });
    const afet = p.afetados.map(x => `<li>${escapeHtml(dataBR(x.data))} ${escapeHtml(x.horario)} · ${escapeHtml(x.profissional || '')}${x.cliente ? ` · ${escapeHtml(x.cliente)}` : ''}</li>`).join('');
    const inval = p.invalidos.map(x => `<li>${escapeHtml(x.alvo)}: ${escapeHtml(x.motivo)}</li>`).join('');
    el('escLotePrevia').innerHTML = `
      <p class="body-sm"><b>${escapeHtml(p.alteracao)}</b></p>
      <p class="body-sm">Para: ${escapeHtml(p.alvos.map(x => x.nome).join(', ') || 'ninguém')}</p>
      ${p.afetados.length ? `<p class="body-sm esc-alerta">${p.afetados.length} agendamento(s) ficariam fora do horário:</p><ul class="esc-conflitos">${afet}</ul>` : '<p class="body-sm">Nenhum agendamento afetado.</p>'}
      ${p.invalidos.length ? `<p class="body-sm esc-alerta">Corrija antes de aplicar:</p><ul class="esc-conflitos">${inval}</ul>` : ''}`;
    if (!p.invalidos.length && p.alvos.length) {
      loteOk = corpoAtual;
      el('btnEscLoteAplicar').disabled = false;
      el('btnEscLoteAplicar').textContent = p.afetados.length ? 'Aplicar e manter os agendamentos' : 'Aplicar';
      pendente = p.afetados.length ? { decisoes: p.afetados.map(x => ({ agendamentoId: x.agendamentoId, decisao: 'manter' })) } : null;
    }
  } catch (err) { showModalError('escLoteErro', err.message); }
}

async function aplicarLote() {
  if (!loteOk) return;
  const botao = el('btnEscLoteAplicar');
  botao.disabled = true;
  const ok = await enviarComConflitos('escLoteErro', decisoes => api('/disponibilidade/lote', { method: 'POST', body: { ...loteOk, decisoes } }), pendente ? pendente.decisoes : undefined);
  if (ok) { closeModal('modalEscLote'); showBanner('Alteração aplicada a todos os escolhidos.', 'ok'); carregarEscalas(); }
  else botao.disabled = false;
}

async function acaoModelo(tipo, id) {
  try {
    if (tipo === 'duplicar') await api(`/disponibilidade/modelos/${id}/duplicar`, { method: 'POST', body: {} });
    if (tipo === 'arquivar') await api(`/disponibilidade/modelos/${id}`, { method: 'PATCH', body: { arquivado: true } });
    showBanner(tipo === 'duplicar' ? 'Modelo duplicado.' : 'Modelo arquivado.', 'ok');
    carregarEscalas();
  } catch (err) { showBanner(err.message, 'error'); }
}

export function initEscalas() {
  if (!sessionPode('escala:ver')) return;
  el('subtabBtnEscalas')?.classList.remove('hidden');
  el('escConteudo').addEventListener('click', ev => {
    const s = ev.target.closest('[data-esc-semanal]');
    if (s) return abrirSemanal(s.dataset.escSemanal || null);
    const r = ev.target.closest('[data-esc-remover]');
    if (r) return removerExcecao(r.dataset.escRemover);
    if (ev.target.closest('#btnEscNovaExcecao')) return abrirExcecao();
    if (ev.target.closest('#btnEscLote')) return abrirLote();
    if (ev.target.closest('#btnEscNovoModelo')) return abrirModelo(null);
    const me = ev.target.closest('[data-esc-modelo-editar]');
    if (me) return abrirModelo(me.dataset.escModeloEditar);
    const md = ev.target.closest('[data-esc-modelo-duplicar]');
    if (md) return acaoModelo('duplicar', md.dataset.escModeloDuplicar);
    const ma = ev.target.closest('[data-esc-modelo-arquivar]');
    if (ma) return acaoModelo('arquivar', ma.dataset.escModeloArquivar);
  });
  // Períodos: + e − dentro dos dois modais.
  for (const box of ['escSemana', 'escExcPeriodos', 'escLoteSemana', 'escLotePeriodos']) {
    el(box).addEventListener('click', ev => {
      const tirar = ev.target.closest('[data-esc-tirar]');
      if (tirar) tirar.closest('.esc-periodo').remove();
      const mais = ev.target.closest('[data-esc-mais]');
      if (mais) mais.previousElementSibling.insertAdjacentHTML('beforeend', linhaPeriodo(Number(mais.dataset.escMais)));
    });
  }
  el('btnEscExcMais').addEventListener('click', () => el('escExcPeriodos').insertAdjacentHTML('beforeend', linhaPeriodo(0)));
  el('btnEscLoteMais').addEventListener('click', () => el('escLotePeriodos').insertAdjacentHTML('beforeend', linhaPeriodo(0)));
  el('escLoteAcao').addEventListener('change', atualizarLote);
  el('escLoteAlvos').addEventListener('change', ev => {
    if (ev.target.matches('[data-lote-todos]')) el('escLoteAlvos').querySelectorAll('input[data-lote-alvo]:not([data-lote-alvo=""])').forEach(i => { i.checked = ev.target.checked; });
    loteOk = null; el('btnEscLoteAplicar').disabled = true;
  });
  // Mudou qualquer campo depois da prévia: precisa ver a prévia de novo antes de aplicar.
  for (const ev of ['input', 'change']) el('escLoteCampos').addEventListener(ev, () => { loteOk = null; el('btnEscLoteAplicar').disabled = true; });
  el('btnEscLotePrevia').addEventListener('click', previaLote);
  el('btnEscLoteAplicar').addEventListener('click', aplicarLote);
  el('btnEscLoteCancelar').addEventListener('click', () => closeModal('modalEscLote'));
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

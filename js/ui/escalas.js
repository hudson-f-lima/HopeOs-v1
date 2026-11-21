// Conta → Escalas (D-033): horário da unidade, escala dos profissionais e exceções por data
// (abrir num dia fechado, fechar, horário excepcional, ausência, bloqueio). O servidor calcula e
// decide; se a mudança deixar agendamentos de fora, ele devolve a lista e nada é gravado até
// alguém com permissão confirmar que ficam mantidos (remarcar ou cancelar é feito na agenda).
import { api } from '../api.js';
import { abrirBloqueio, avisarAfetadosDepois } from './agendaBloqueio.js';
import { montarCalendario } from './calendarioMes.js';
import { state, sessionPode, loadWeekAgenda } from '../state.js';
import { escapeHtml, showBanner, openModal, closeModal, showModalError, clearModalError, todayStr, baixarArquivo } from '../utils.js';

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
// Redesign (D-050, pedido do dono): blocos (bento) que cabem no celular. Semana padrão em pontos por
// dia + horas compactas; calendário do mês para gerir datas (tocar = data especial; escolher datas
// avulsas = lote com prévia); pendências de aceite; datas especiais; histórico e modelos.
const LETRA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function horasCompactas(semanal) {
  const porDia = new Map();
  for (let d = 0; d < 7; d++) { const t = periodosTexto(semanal.filter(p => p.diaSemana === d)); if (t) porDia.set(d, t); }
  if (!porDia.size) return 'Sem horário';
  const grupos = new Map();
  for (const [d, t] of porDia) grupos.set(t, [...(grupos.get(t) || []), d]);
  return [...grupos].map(([t, ds]) => {
    const seq = ds.every((d, i) => !i || d === ds[i - 1] + 1);
    const dias = ds.length === 1 ? CURTO[ds[0]] : seq ? CURTO[ds[0]] + '–' + CURTO[ds[ds.length - 1]] : ds.map(d => CURTO[d]).join(', ');
    return dias + ' ' + t;
  }).join(' · ');
}
const pontosDaSemana = semanal => '<span class="esc-dias" aria-hidden="true">' + LETRA.map((l, d) =>
  '<i class="esc-d' + (semanal.some(p => p.diaSemana === d) ? ' on' : '') + '">' + l + '</i>').join('') + '</span>';
let calEsc = null; let calEscMes = null; let calEscSel = null;

function render() {
  const podeUnidade = sessionPode('unidade:horario');
  const podeEditar = sessionPode('escala:editar');
  const podeBloquear = sessionPode('escala:bloquear');
  const nomeProf = id => (dados.profissionais.find(p => p.id === id) || {}).nome || 'Profissional';
  const linhaSemana = ({ id, nome, semanal, botao, extra = '' }) => `
    <div class="esc-linha esc-semana"${id ? ` data-prof="${escapeHtml(id)}"` : ''}>
      <span class="esc-quem"><b>${escapeHtml(nome)}</b>${pontosDaSemana(semanal)}
        <span class="esc-horas" title="${escapeHtml(resumoSemanal(semanal))}">${escapeHtml(horasCompactas(semanal))}</span>${extra}</span>
      ${botao}
    </div>`;
  const unidade = linhaSemana({ nome: 'Unidade', semanal: dados.unidade.semanal,
    botao: podeUnidade ? '<button type="button" class="esc-mini" data-esc-semanal="" aria-label="Editar horário da unidade">Editar</button>' : '' });
  // D-046 (023): aceite da escala pelo profissional (comum acordo, com registro).
  const textoAceite = a => !a ? '' : a.situacao === 'aceita' ? 'Aceita pelo profissional em ' + dataBR(a.aceitaEm.slice(0, 10))
    : a.situacao === 'pendente' ? 'Aguardando aceite do profissional'
    : a.situacao === 'sem_registro' ? 'Escala anterior ao registro: salve de novo para pedir o aceite' : '';
  const profs = dados.profissionais.map(p => {
    const a = p.aceite;
    const aceitar = p.id === proprioId() && a && a.situacao === 'pendente'
      ? '<button type="button" class="btn btn-primary esc-btn" data-esc-aceitar="' + escapeHtml(a.eventoId) + '">Aceitar minha escala</button>' : '';
    const extra = (p.escalaPublicada ? '' : '<span class="esc-alerta esc-aviso">Escala não publicada: não aparece para agendar</span>')
      + (textoAceite(a) ? '<span class="esc-aceite" data-aceite="' + escapeHtml(a.situacao) + '">' + escapeHtml(textoAceite(a)) + '</span>' : '');
    return linhaSemana({ id: p.id, nome: p.nome, semanal: p.semanal, extra,
      botao: aceitar + (podeEditar ? `<button type="button" class="esc-mini" data-esc-semanal="${escapeHtml(p.id)}" aria-label="Editar escala">Editar</button>` : '') });
  }).join('');
  const excecoes = dados.excecoes.map(e => {
    const quem = e.profissionalId ? nomeProf(e.profissionalId) : 'Unidade';
    const datas = e.dataInicio === e.dataFim ? dataBR(e.dataInicio) : `${dataBR(e.dataInicio)} a ${dataBR(e.dataFim)}`;
    const horas = e.inicio ? ` ${e.inicio}–${e.fim}` : (e.tipo === 'fechamento' ? ' (dia inteiro)' : '');
    // D-046: o que o próprio profissional marcou só ele remove (o servidor também recusa).
    const doProfissional = e.marcadoPeloProfissional && e.profissionalId !== proprioId();
    const podeRemover = !e.profissionalId ? podeUnidade : e.tipo === 'horario' ? podeEditar : (!doProfissional && podeBloquear && (sessionPode('escala:bloquear', true) || e.profissionalId === proprioId()));
    return `<div class="esc-excecao" data-tipo="${escapeHtml(e.tipo)}">
      <span><b>${escapeHtml(datas)}</b> · ${escapeHtml(quem)} · ${escapeHtml(TIPO[e.tipo] || e.tipo)}${escapeHtml(horas)}${e.motivo ? ` · ${escapeHtml(e.motivo)}` : ''}${e.marcadoPeloProfissional ? ' · <span class="text-tertiary">marcado pelo profissional</span>' : ''}</span>
      <span class="esc-acoes-mini">
      ${podeRemover && (e.tipo === 'bloqueio' || (e.tipo === 'ausencia' && e.dataFim > e.dataInicio)) ? `<button type="button" class="esc-mini" data-esc-encurtar="${escapeHtml(e.id)}" aria-label="Encurtar">Encurtar</button>` : ''}
      ${podeRemover ? `<button type="button" class="esc-mini" data-esc-remover="${escapeHtml(e.id)}" aria-label="Remover exceção">Remover</button>` : ''}
      </span>
    </div>`;
  }).join('') || '<p class="body-sm text-tertiary">Nenhuma data especial daqui para a frente.</p>';
  const podeExcecao = podeUnidade || podeEditar || podeBloquear;
  const pendentes = dados.profissionais.filter(p => p.aceite && p.aceite.situacao === 'pendente').length;
  const semRegistro = dados.profissionais.filter(p => p.aceite && p.aceite.situacao === 'sem_registro').length;
  const listaModelos = sessionPode('escala:modelos') ? `
    <section class="bento-tile bento-2" aria-labelledby="escModelosTit">
      <div class="bento-topo"><h3 class="bento-tit" id="escModelosTit">Modelos de escala</h3>
        <button type="button" class="esc-mini" id="btnEscNovoModelo">+ Novo</button></div>
      ${modelos.map(m => `<div class="esc-linha"><span class="esc-quem"><b>${escapeHtml(m.nome)}</b><span class="esc-horas">${escapeHtml(horasCompactas(m.periodos))}</span></span>
        <span class="esc-acoes-mini">
          <button type="button" class="esc-mini" data-esc-modelo-editar="${escapeHtml(m.id)}">Editar</button>
          <button type="button" class="esc-mini" data-esc-modelo-duplicar="${escapeHtml(m.id)}">Duplicar</button>
          <button type="button" class="esc-mini" data-esc-modelo-arquivar="${escapeHtml(m.id)}">Arquivar</button>
        </span></div>`).join('') || '<p class="body-sm text-tertiary">Nenhum modelo. Ex.: Equipe de sábado, Véspera de Natal.</p>'}
    </section>` : '';
  el('escConteudo').innerHTML = `
    <div class="bento">
      ${sessionPode('escala:lote') || podeExcecao ? `<div class="bento-tile bento-2 bento-acoes">
        ${sessionPode('escala:lote') ? '<button type="button" class="btn btn-primary" id="btnEscLote">Alterar vários</button>' : ''}
        ${podeExcecao ? '<button type="button" class="btn btn-secondary" id="btnEscNovaExcecao">Nova data especial</button>' : ''}
      </div>` : ''}
      <section class="bento-tile bento-2" aria-labelledby="escCalTit">
        <div class="bento-topo"><h3 class="bento-tit" id="escCalTit">Calendário</h3><span class="bento-dica">${podeExcecao ? 'toque num dia para marcar' : ''}</span></div>
        <div id="escCal"></div>
      </section>
      <section class="bento-tile bento-2" aria-labelledby="escSemanaTit">
        <div class="bento-topo"><h3 class="bento-tit" id="escSemanaTit">Semana padrão</h3></div>
        ${unidade}${profs}
      </section>
      <div class="bento-tile bento-num" data-bento="aceites"><b>${pendentes}</b><span>aguardando aceite${semRegistro ? ` · ${semRegistro} sem registro` : ''}</span></div>
      <div class="bento-tile bento-num" data-bento="datas"><b>${dados.excecoes.length}</b><span>datas especiais à frente</span></div>
      <section class="bento-tile bento-2" aria-labelledby="escDatasTit">
        <div class="bento-topo"><h3 class="bento-tit" id="escDatasTit">Datas especiais</h3></div>
        <div id="escExcecoes">${excecoes}</div>
      </section>
      <section class="bento-tile bento-2" aria-labelledby="escHistTit">
        <div class="bento-topo"><h3 class="bento-tit" id="escHistTit">Histórico de bloqueios</h3>
          <button type="button" class="esc-mini" id="btnEscHistorico">Ver</button></div>
        <p class="bento-dica">Marcado e removido, com data, hora e quem fez. Não pode ser apagado.</p>
        <div id="escHistorico"></div>
      </section>
      ${listaModelos}
    </div>`;
  // Calendário de gestão: tocar num dia abre "Nova data especial" já na data; escolher datas
  // avulsas abre o lote (com prévia dos agendamentos afetados).
  calEsc = montarCalendario(el('escCal'), {
    selecionado: () => calEscSel,
    podeEscolher: sessionPode('escala:lote'),
    textoAplicar: 'Aplicar às datas…',
    aoTocarDia: d => { calEscSel = d; if (podeExcecao) abrirExcecao(d); },
    aoAplicarDatas: datas => abrirLote(datas)
  });
  calEsc.paraMesDe(calEscMes ? calEscMes + '-01' : todayStr());
}

export async function carregarEscalas() {
  if (!sessionPode('escala:ver')) return;
  if (calEsc) calEscMes = calEsc.mesAtual();
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
    // D-058: o aviso de agendamento que entrou no meio vale para todo envio de escala por aqui.
    avisarAfetadosDepois(await enviar(decisoes));
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

function abrirExcecao(data = null) {
  pendente = null;
  clearModalError('escExcErro');
  const alvos = [];
  if (sessionPode('unidade:horario')) alvos.push(['', 'Unidade (abrir ou fechar)']);
  const podeTodos = sessionPode('escala:editar') || sessionPode('escala:bloquear', true);
  dados.profissionais
    .filter(p => podeTodos || p.id === proprioId())
    .forEach(p => alvos.push([p.id, p.nome]));
  el('escExcAlvo').innerHTML = alvos.map(([v, t]) => `<option value="${escapeHtml(v)}">${escapeHtml(t)}</option>`).join('');
  const hoje = data || todayStr();
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
    const r = await enviar(undefined);
    showBanner('Data especial removida.', 'ok');
    avisarAfetadosDepois(r);
    carregarEscalas();
  } catch (err) {
    if (err.code === 'CONFLITOS_PENDENTES' && err.details) {
      showBanner(`${err.details.afetados.length} agendamento(s) ficariam fora do horário. Trate-os na agenda antes de remover.`, 'error');
    } else showBanner(err.message, 'error');
  }
}

// ---------- Histórico de bloqueios (D-046) ----------
// Da trilha imutável do servidor. "Baixar cópia" salva o CSV; o código SHA-256 confere que o
// arquivo guardado é o mesmo que o sistema gerou.
let historico = null;
const dataHoraBR = iso => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
async function verHistorico() {
  const box = el('escHistorico');
  box.innerHTML = '<p class="body-sm text-tertiary">Carregando…</p>';
  try {
    historico = await api('/disponibilidade/bloqueios/historico');
    const ACAO = { marcou: 'marcou', removeu: 'removeu', encurtou: 'encurtou', definiu_escala: 'teve a escala semanal definida', aceitou_escala: 'aceitou a escala semanal' };
    const linhas = historico.itens.map(i => {
      const quem = i.origem === 'profissional' ? 'pelo próprio profissional' : 'por ' + escapeHtml(i.feitoPor) + ' (equipe)';
      let oque;
      if (i.tipo === 'escala') oque = escapeHtml(ACAO[i.acao] || i.acao) + ': ' + escapeHtml(i.detalhe || '');
      else {
        const datas = i.dataInicio === i.dataFim ? dataBR(i.dataInicio) : dataBR(i.dataInicio) + ' a ' + dataBR(i.dataFim);
        const horas = i.inicio ? ' ' + i.inicio + '–' + i.fim : '';
        oque = escapeHtml(ACAO[i.acao] || i.acao) + ' ' + escapeHtml((TIPO[i.tipo] || i.tipo).toLowerCase()) + ' em ' + escapeHtml(datas + horas)
          + (i.detalhe ? ' (' + escapeHtml(i.detalhe) + ')' : '') + (i.motivo ? ' · ' + escapeHtml(i.motivo) : '');
      }
      return '<div class="esc-excecao" data-historico="' + escapeHtml(i.acao) + '"><span><b>' + escapeHtml(dataHoraBR(i.quando)) + '</b> · ' + escapeHtml(i.profissional) + ' '
        + oque + ' · ' + quem + '</span></div>';
    }).join('') || '<p class="body-sm text-tertiary">Nenhum registro ainda.</p>';
    const c = historico.cadeia;
    const trilha = !c ? '' : c.ok
      ? '<p class="body-sm" id="escTrilha" data-ok="1">Trilha íntegra: ' + c.total + ' registros encadeados, nenhum alterado ou apagado.</p>'
      : '<p class="body-sm" id="escTrilha" data-ok="0" role="alert" style="color:var(--md-error)">Atenção: a trilha tem uma quebra no registro ' + escapeHtml(String(c.quebraEm)) + ' (' + escapeHtml(c.motivo || '') + ').</p>';
    box.innerHTML = trilha + linhas + (historico.itens.length
      ? '<button type="button" class="btn btn-secondary esc-btn" id="btnEscHistBaixar">Baixar cópia (CSV)</button><p class="body-sm text-tertiary" id="escHistSha">Código de conferência (SHA-256): ' + escapeHtml(historico.sha256) + '</p>'
        + '<p class="body-sm text-tertiary">Guarde a cópia fora do sistema (e-mail, nuvem): ela traz o último elo da trilha e mostra se algo mudou depois.</p>'
      : '');
  } catch (err) {
    box.innerHTML = '<p class="body-sm" role="alert" style="color:var(--md-error)">' + escapeHtml(err.message) + '</p>';
  }
}
async function aceitarEscala(eventoId, botao) {
  botao.disabled = true;
  try {
    await api('/disponibilidade/escala/aceitar', { method: 'POST', body: { eventoId } });
    showBanner('Escala aceita. Fica registrado no histórico.', 'ok');
    carregarEscalas();
  } catch (err) { showBanner(err.message, 'error'); botao.disabled = false; }
}

function baixarHistorico() {
  if (!historico) return;
  baixarArquivo('historico-bloqueios-' + historico.geradoEm.slice(0, 10) + '.csv', historico.csv);
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

// Texto fixo (sem dado de cadastro): fica fora da interpolação.
const ALVO_UNIDADE = '<label class="perm-item"><input type="checkbox" data-lote-alvo=""/><span>Unidade</span></label>';

// Datas não consecutivas escolhidas no calendário do mês da agenda (D-050). null = De/Até.
let loteDatas = null;
export async function abrirLoteComDatas(datas) {
  if (!dados) await carregarEscalas();
  if (!dados) return;
  abrirLote(datas);
}

function abrirLote(datas = null) {
  loteDatas = Array.isArray(datas) && datas.length ? datas : null;
  pendente = null; loteOk = null;
  clearModalError('escLoteErro');
  el('escLotePrevia').innerHTML = '';
  el('btnEscLoteAplicar').disabled = true;
  el('escLoteAlvos').innerHTML = `
    <label class="perm-item"><input type="checkbox" data-lote-todos/><span><b>Todos os profissionais</b></span></label>
    ${sessionPode('unidade:horario') ? ALVO_UNIDADE : ''}
    ${dados.profissionais.map(p => `<label class="perm-item"><input type="checkbox" data-lote-alvo="${escapeHtml(p.id)}"/><span>${escapeHtml(p.nome)}</span></label>`).join('')}`;
  el('escLoteAcao').innerHTML = ACOES_LOTE.filter(([v]) => (!v.startsWith('modelo') || modelos.length) && (!loteDatas || !['semanal', 'modelo_semanal', 'modelo_periodo'].includes(v))).map(([v, t]) => `<option value="${v}">${escapeHtml(t)}</option>`).join('');
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
  el('escLoteDatasBox').classList.toggle('hidden', Boolean(loteDatas) || a === 'semanal' || a === 'modelo_semanal');
  const avulsas = el('escLoteDatasAvulsas');
  avulsas.classList.toggle('hidden', !loteDatas);
  avulsas.textContent = loteDatas ? 'Datas: ' + loteDatas.map(dataBR).join(', ') : '';
  el('escLotePeriodosBox').classList.toggle('hidden', !['horario', 'bloqueio', 'fechamento'].includes(a));
  el('escLoteSemanaBox').classList.toggle('hidden', a !== 'semanal');
  if (['horario', 'bloqueio'].includes(a) && !el('escLotePeriodos').children.length) el('escLotePeriodos').innerHTML = linhaPeriodo(0);
}

function corpoLote() {
  const marcados = [...el('escLoteAlvos').querySelectorAll('input[data-lote-alvo]:checked')].map(i => i.dataset.loteAlvo);
  const a = el('escLoteAcao').value;
  const datas = loteDatas ? { datas: loteDatas } : { dataInicio: el('escLoteDe').value, dataFim: el('escLoteAte').value || el('escLoteDe').value };
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
  if (ok) { closeModal('modalEscLote'); showBanner('Alteração aplicada a todos os escolhidos.', 'ok'); carregarEscalas(); loadWeekAgenda().catch(() => {}); document.dispatchEvent(new CustomEvent('escala:mudou')); }
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
  document.addEventListener('escala:mudou', () => { if (dados) carregarEscalas(); });
  // Ao abrir a aba, sempre a escala atual (o aceite precisa ser da última versão).
  el('subtabBtnEscalas')?.addEventListener('click', () => { if (dados) carregarEscalas(); });
  el('subtabBtnEscalas')?.classList.remove('hidden');
  el('escConteudo').addEventListener('click', ev => {
    const s = ev.target.closest('[data-esc-semanal]');
    if (s) return abrirSemanal(s.dataset.escSemanal || null);
    const r = ev.target.closest('[data-esc-remover]');
    if (r) return removerExcecao(r.dataset.escRemover);
    if (ev.target.closest('#btnEscNovaExcecao')) return abrirExcecao();
    if (ev.target.closest('#btnEscHistorico')) return verHistorico();
    const enc = ev.target.closest('[data-esc-encurtar]');
    if (enc) { const x = dados.excecoes.find(e => e.id === enc.dataset.escEncurtar); if (x) abrirBloqueio(x); return; }
    const ac = ev.target.closest('[data-esc-aceitar]');
    if (ac) return aceitarEscala(ac.dataset.escAceitar, ac);
    if (ev.target.closest('#btnEscHistBaixar')) return baixarHistorico();
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

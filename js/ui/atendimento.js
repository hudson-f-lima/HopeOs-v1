// Atendimento com vários serviços (D-040). No novo agendamento: "+ Adicionar serviço" monta a
// lista; o servidor devolve as combinações possíveis (um profissional, sequência com outros
// profissionais, fracionado com espera) e quem agenda escolhe uma. A gravação é tudo ou nada.
// No card de uma etapa: ver todas as etapas e cancelar só esta ou todas, com o impacto mostrado
// antes. Preço, duração e disponibilidade são sempre do servidor.
import { api } from '../api.js';
import { state, sessionPode, loadWeekAgenda } from '../state.js';
import { escapeHtml, showBanner, centsToBRL, formatDDMM } from '../utils.js';

const el = id => document.getElementById(id);
const TIPO = { mesmo_profissional: 'Mesmo profissional', sequencia: 'Em sequência', fracionado: 'Com espera' };
const STATUS = { agendado: 'Agendado', confirmado: 'Confirmado', cancelado: 'Cancelado', reagendado: 'Remarcado', concluido: 'Concluído', fechado: 'Concluído', no_show: 'Faltou', aguardando: 'Chegou', em_atendimento: 'Em atendimento' };
let extras = [];   // [{ servicoId, profissionalId }]
let pedido = null; // { clienteId, data, itens }
let opcoes = [];
let onGravado = null;

const servicosAtivos = () => (state.catalog.servicos || []).filter(s => s.ativo !== false);
const profsAtivos = () => (state.catalog.profissionais || []).filter(p => p.ativo !== false);

export function extrasEscolhidos() { return extras.filter(e => e.servicoId); }
export function resetExtras() { extras = []; renderExtras(); }

function renderExtras() {
  const box = el('agExtras');
  if (!box) return;
  box.innerHTML = extras.map((e, i) => `
    <div class="ag-extra" data-extra="${i}">
      <select data-extra-servico="${i}" aria-label="Serviço adicional">
        <option value="">Escolha o serviço…</option>
        ${servicosAtivos().map(s => `<option value="${escapeHtml(s.id)}"${s.id === e.servicoId ? ' selected' : ''}>${escapeHtml(s.nome)}</option>`).join('')}
      </select>
      <select data-extra-prof="${i}" aria-label="Profissional do serviço adicional">
        <option value="">Qualquer profissional</option>
        ${profsAtivos().map(p => `<option value="${escapeHtml(p.id)}"${p.id === e.profissionalId ? ' selected' : ''}>${escapeHtml(p.nome)}</option>`).join('')}
      </select>
      <button type="button" class="btn btn-secondary" data-extra-remover="${i}" aria-label="Remover serviço">✕</button>
    </div>`).join('');
}

const etapaLinha = e => `<li>${escapeHtml(e.inicio)}–${escapeHtml(e.fim)} · ${escapeHtml(e.servicoNome)} com ${escapeHtml(e.profissionalNome)} · ${escapeHtml(centsToBRL(e.precoCentavos))}${e.esperaAntesMin ? ` <span class="at-espera">(espera de ${e.esperaAntesMin} min antes)</span>` : ''}</li>`;

function renderOpcoes(r) {
  opcoes = r.opcoes;
  el('atendimentoResumo').textContent = `${formatDDMM(pedido.data)} · ${pedido.itens.length} serviços · espera máxima entre etapas: ${r.esperaMaxMin} min`;
  el('atendimentoOpcoes').innerHTML = opcoes.length
    ? opcoes.map((o, i) => `
      <button type="button" class="at-opcao" data-opcao="${i}">
        <span class="at-topo"><b>${escapeHtml(o.inicio)}–${escapeHtml(o.fim)}</b><span class="at-tipo" data-tipo="${escapeHtml(o.tipo)}">${escapeHtml(TIPO[o.tipo] || o.tipo)}</span></span>
        <ul class="at-etapas">${o.etapas.map(etapaLinha).join('')}</ul>
        <span class="at-total">Total ${escapeHtml(centsToBRL(o.precoCentavos))} · ${o.duracaoMin} min de serviço${o.esperaMin ? ` · ${o.esperaMin} min de espera` : ' · sem espera'}</span>
      </button>`).join('')
    : `<p class="body-sm text-tertiary">Nenhuma combinação nesse dia${r.semProfissional && r.semProfissional.length ? ' (há serviço sem profissional habilitado)' : ''}. Tente outra data ou mude os profissionais.</p>`;
}

// Chamado pelo "Agendar" quando há mais de um serviço.
export async function abrirOpcoes({ clienteId, data, itens, horario }, aoGravar) {
  pedido = { clienteId, data, itens };
  onGravado = aoGravar || null;
  el('atendimentoMsg').textContent = '';
  el('atendimentoOpcoes').innerHTML = '<p class="body-sm text-tertiary">Buscando combinações…</p>';
  el('atendimentoDialog').showModal();
  try {
    // Com horário escolhido, tenta primeiro as opções que começam nele; sem nenhuma, mostra o dia.
    let r = horario ? await api('/agenda/combinacoes', { method: 'POST', body: { data, itens, horario } }) : null;
    if (!r || !r.opcoes.length) r = await api('/agenda/combinacoes', { method: 'POST', body: { data, itens } });
    renderOpcoes(r);
  } catch (err) {
    el('atendimentoOpcoes').innerHTML = '';
    el('atendimentoMsg').textContent = err.message;
  }
}

async function escolher(i) {
  const o = opcoes[i];
  if (!o) return;
  // Texto da confirmação do navegador (não é HTML): montado sem interpolação.
  const texto = [o.inicio + '–' + o.fim, ...o.etapas.map(e => [e.inicio, e.servicoNome, 'com', e.profissionalNome].join(' ')), 'Total ' + centsToBRL(o.precoCentavos), '', 'Agendar?'].join('\n');
  if (!window.confirm(texto)) return;
  el('atendimentoMsg').textContent = '';
  try {
    const r = await api('/agenda/atendimentos', {
      method: 'POST',
      body: { data: pedido.data, clienteId: pedido.clienteId || null, etapas: o.etapas.map(e => ({ servicoId: e.servicoId, profissionalId: e.profissionalId, horario: e.inicio })) }
    });
    el('atendimentoDialog').close();
    showBanner(`Atendimento agendado: ${r.etapas.length} etapas, ${r.inicio}–${r.fim}.`, 'ok');
    if (onGravado) onGravado();
    await loadWeekAgenda();
  } catch (err) {
    // Algo mudou (conflito ou etapa que não cabe mais): nada foi reservado; recalcula.
    el('atendimentoMsg').textContent = err.message;
    try { renderOpcoes(await api('/agenda/combinacoes', { method: 'POST', body: { data: pedido.data, itens: pedido.itens } })); } catch { /* mantém a mensagem */ }
  }
}

// --- Card de uma etapa --------------------------------------------------------
export function acoesDoAtendimento(item) {
  if (!item || !item.grupo_id) return '';
  return `<p class="agc-grupo">Etapa ${escapeHtml(String(item.grupo_seq || ''))} de um atendimento com vários serviços</p>
    <button class="btn" data-sheet-action="atendimento-etapas">Ver etapas do atendimento…</button>`;
}

let etapasAtual = null; // { grupoId, agendamentoId }
export async function abrirEtapas(item) {
  etapasAtual = { grupoId: item.grupo_id, agendamentoId: item.id };
  el('etapasMsg').textContent = '';
  el('etapasConteudo').innerHTML = '<p class="body-sm text-tertiary">Carregando…</p>';
  el('etapasDialog').showModal();
  await carregarEtapas();
}
async function carregarEtapas() {
  try {
    const r = await api(`/agenda/atendimentos/${etapasAtual.grupoId}`);
    el('etapasConteudo').innerHTML = `
      <ul class="at-etapas">${r.etapas.map(e => `<li${e.agendamentoId === etapasAtual.agendamentoId ? ' class="at-atual"' : ''}>${escapeHtml(e.horario)} · ${escapeHtml(e.servicoNome || 'Serviço')} com ${escapeHtml(e.profissionalNome || '—')} · ${escapeHtml(centsToBRL(e.precoCentavos))} · ${escapeHtml(STATUS[e.status] || e.status)}</li>`).join('')}</ul>
      <p class="body-sm">Total das etapas ativas: <b>${escapeHtml(centsToBRL(r.precoCentavos))}</b></p>`;
    const podeCancelar = sessionPode('agenda:cancelar') && r.etapas.some(e => ['agendado', 'confirmado'].includes(e.status));
    el('btnEtapaCancelarEsta').classList.toggle('hidden', !podeCancelar || !r.etapas.some(e => e.agendamentoId === etapasAtual.agendamentoId && ['agendado', 'confirmado'].includes(e.status)));
    el('btnEtapaCancelarTodas').classList.toggle('hidden', !podeCancelar);
  } catch (err) { el('etapasConteudo').innerHTML = ''; el('etapasMsg').textContent = err.message; }
}
async function cancelar(escopo) {
  const body = { escopo, ...(escopo === 'etapa' ? { agendamentoId: etapasAtual.agendamentoId } : {}) };
  try {
    // Primeiro o impacto (sem gravar), depois a confirmação.
    const sim = await api(`/agenda/atendimentos/${etapasAtual.grupoId}/cancelar`, { method: 'POST', body: { ...body, simular: true } });
    const linha = e => [e.horario, e.servicoNome, 'com', e.profissionalNome].join(' '); // texto de confirmação, não HTML
    const texto = `Serão canceladas:\n${sim.afetadas.map(linha).join('\n') || '(nenhuma)'}` +
      (sim.mantidas.length ? `\n\nContinuam marcadas:\n${sim.mantidas.map(linha).join('\n')}` : '\n\nNenhuma etapa continua marcada.') + '\n\nConfirmar?';
    if (!sim.afetadas.length || !window.confirm(texto)) return;
    const r = await api(`/agenda/atendimentos/${etapasAtual.grupoId}/cancelar`, { method: 'POST', body });
    showBanner(`${r.afetadas.length} etapa(s) cancelada(s).${r.mantidas.length ? ` ${r.mantidas.length} continuam marcadas.` : ''}`, 'ok');
    await carregarEtapas();
    await loadWeekAgenda();
  } catch (err) { el('etapasMsg').textContent = err.message; }
}

// --- Limite de espera da unidade (Conta → Escalas) ---------------------------
async function initEspera() {
  if (!sessionPode('empresa:configurar') || !el('esperaBox')) return;
  try {
    const emp = await api('/empresa');
    el('esperaMax').value = String(emp.atendimento_espera_max_min ?? 30);
    el('esperaBox').classList.remove('hidden');
    el('esperaMax').addEventListener('change', async ev => {
      try {
        await api('/empresa', { method: 'PATCH', body: { atendimentoEsperaMaxMin: Number(ev.target.value) } });
        showBanner('Espera máxima entre etapas salva.', 'ok');
      } catch (err) { showBanner(err.message, 'error'); }
    });
  } catch { /* sem a 019 ou sem permissão: o campo não aparece */ }
}

export function initAtendimento() {
  el('btnAgAddServico')?.addEventListener('click', () => {
    if (extras.length >= 5) return showBanner('No máximo 6 serviços por atendimento.', 'error');
    extras.push({ servicoId: '', profissionalId: '' });
    renderExtras();
  });
  el('agExtras')?.addEventListener('change', ev => {
    const s = ev.target.dataset.extraServico; const p = ev.target.dataset.extraProf;
    if (s !== undefined) extras[Number(s)].servicoId = ev.target.value;
    if (p !== undefined) extras[Number(p)].profissionalId = ev.target.value;
  });
  el('agExtras')?.addEventListener('click', ev => {
    const b = ev.target.closest('[data-extra-remover]');
    if (!b) return;
    extras.splice(Number(b.dataset.extraRemover), 1);
    renderExtras();
  });
  el('atendimentoOpcoes')?.addEventListener('click', ev => { const b = ev.target.closest('[data-opcao]'); if (b) escolher(Number(b.dataset.opcao)); });
  el('btnAtendimentoFechar')?.addEventListener('click', () => el('atendimentoDialog').close());
  el('btnEtapasFechar')?.addEventListener('click', () => el('etapasDialog').close());
  el('btnEtapaCancelarEsta')?.addEventListener('click', () => cancelar('etapa'));
  el('btnEtapaCancelarTodas')?.addEventListener('click', () => cancelar('todas'));
  initEspera();
}

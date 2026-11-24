// Cockpit do gestor (D-064): 4 indicadores, "Decidir agora" (alertas com o porquê e a ação),
// ocupação por dia, equipe e simulador. Tudo vem calculado do servidor (GET /cockpit); a tela só
// mostra. Sem número inventado: o que o servidor manda como null aparece como "—" com o motivo.
// Só para quem tem painel:financeiro (receita, margem e assinaturas são dado gerencial).
import { api } from '../api.js';
import { state, stateBus, sessionPode, loadWeekAgenda } from '../state.js';
import { escapeHtml, centsToBRL, startOfWeek, todayStr, addDays, showBanner } from '../utils.js';
import {
  atualizandoOcupacao, detalheOcupacao, notaEscalaHistorica, ocupacaoPctTxt, resumoOcupacao, temOcupacaoRealizada
} from './ocupacao.js';

const el = id => document.getElementById(id);
let dados = null;

const num = v => String(v).replace('.', ',');
const pctTxt = v => (v === null || v === undefined ? '—' : num(v) + '%');
const SAUDE = {
  ok: ['Operação sem alertas', 'ck-saude-ok'],
  ok_com_pontos: ['Operação com pontos de atenção', 'ck-saude-pontos'],
  atencao: ['Decisões urgentes', 'ck-saude-atencao']
};
const NIVEL = { alta: 'Urgente', media: 'Importante', info: 'Para saber' };

function card(titulo, valor, linhas, detalhe = '') {
  return '<div class="ck-card"><div class="ck-card-titulo">' + escapeHtml(titulo) + '</div>'
    + '<div class="ck-card-valor">' + escapeHtml(valor) + '</div>'
    + linhas.filter(Boolean).map(l => '<div class="ck-card-linha">' + escapeHtml(l) + '</div>').join('')
    + detalhe + '</div>';
}

const diaMes = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const periodoTxt = (de, ate) => diaMes(de) + ' a ' + diaMes(ate);

function renderCards(d) {
  const f = d.faturamento; const m = d.margem; const om = d.ocupacaoMes; const r = d.recorrencia;
  const ocupacao = resumoOcupacao(om);
  el('ckCards').innerHTML = [
    card('Faturamento do mês', centsToBRL(f.realizadoCentavos), [
      periodoTxt(om.de, om.ate),
      f.metaCentavos ? pctTxt(f.metaPct) + ' da meta (' + centsToBRL(f.metaCentavos) + ', soma das metas da equipe)' : 'Sem meta cadastrada para o mês',
      f.projecaoCentavos !== null ? 'No ritmo atual: ' + centsToBRL(f.projecaoCentavos) : f.projecaoNota,
      f.variacaoPct !== null ? (f.variacaoPct >= 0 ? '+' : '') + pctTxt(f.variacaoPct) + ' vs. o mesmo período do mês passado' : 'Sem base no mês passado'
    ]),
    card('Margem real do salão', m.margemPct === null ? '—' : pctTxt(m.margemPct), [
      f.comandas === 0 ? 'Sem comandas válidas' : centsToBRL(m.margemCentavos) + ' depois de comissão e taxas',
      m.taxasPctDoRecebido !== null ? 'Taxas: ' + pctTxt(m.taxasPctDoRecebido) + ' do recebido' + (m.taxasPctAnterior !== null ? ' (mês passado ' + pctTxt(m.taxasPctAnterior) + ')' : '') : null
    ]),
    // Mesmo período e mesma regra do Desempenho do salão (D-071).
    card('Ocupação realizada', ocupacao.valor, [
      periodoTxt(om.de, om.ate),
      ocupacao.base
    ], detalheOcupacao(om)),
    card('Recorrência', r.ativos + ' assinante(s) ativo(s)', [
      centsToBRL(r.mrrCentavos) + ' por mês' + (r.pctDaReceita !== null ? ' (' + pctTxt(r.pctDaReceita) + ' do faturamento)' : ''),
      r.atrasados ? r.atrasados + ' com pagamento atrasado' : 'Nenhum atraso',
      r.churnPct !== null ? 'Cancelamentos no mês: ' + r.canceladasNoMes + ' (' + pctTxt(r.churnPct) + ')' : null
    ])
  ].join('');
}

function renderAlertas(alertas) {
  const box = el('ckAlertas');
  if (!alertas.length) { box.innerHTML = '<p class="empty-state">Nenhuma decisão pendente pelos números de hoje.</p>'; return; }
  box.innerHTML = alertas.map((a, i) => '<article class="ck-alerta ck-alerta-' + escapeHtml(a.nivel) + '">'
    + '<div class="ck-alerta-topo"><span class="ck-nivel">' + escapeHtml(NIVEL[a.nivel] || a.nivel) + '</span>'
    + (a.impactoCentavos ? '<span class="ck-impacto">' + escapeHtml('≈ ' + centsToBRL(a.impactoCentavos)) + '</span>' : '') + '</div>'
    + '<h4>' + escapeHtml(a.titulo) + '</h4><p>' + escapeHtml(a.porque) + '</p>'
    + (a.clientes && a.clientes.length ? '<p class="ck-quem">' + escapeHtml(a.clientes.map(c => c.nome).join(', ')) + '</p>' : '')
    + (a.acao ? '<button type="button" class="btn-secondary" data-ck-acao="' + i + '">' + escapeHtml(a.acao.rotulo) + '</button>' : '')
    + '</article>').join('');
}

function renderDias(d) {
  if (!temOcupacaoRealizada(d.ocupacao)) {
    el('ckDias').textContent = '';
    el('ckDiasPeriodo').textContent = atualizandoOcupacao;
    return;
  }
  const { de, ate } = d.ocupacao.janela;
  el('ckDiasPeriodo').textContent = periodoTxt(de, ate)
    + (d.ocupacao.capacidadeHistoricaEstimada ? '. ' + notaEscalaHistorica : '');
  const dias = d.ocupacao.porDia.slice(1).concat(d.ocupacao.porDia.slice(0, 1)); // segunda primeiro
  const max = Math.max(100, ...dias.map(x => x.ocupacaoRealizadaPct ?? 0));
  el('ckDias').innerHTML = dias.map(x => {
    const v = x.ocupacaoRealizadaPct;
    return '<div class="ck-dia"><small title="' + escapeHtml(x.nome) + '">' + escapeHtml(x.nome.slice(0, 3)) + '</small>'
      + '<div class="ck-dia-barra" aria-hidden="true"><span style="height:' + (Number.isFinite(v) ? 100 * v / max : 0) + '%"></span></div>'
      + '<b>' + escapeHtml(Number.isFinite(v) ? ocupacaoPctTxt(v) : 'Sem escala') + '</b></div>';
  }).join('');
}

function renderEquipe(d) {
  const { de, ate } = d.ocupacao.janela;
  el('ckEquipePeriodo').textContent = 'Ocupação de ' + periodoTxt(de, ate)
    + (d.ocupacao.capacidadeHistoricaEstimada ? '. ' + notaEscalaHistorica : '');
  el('ckEquipe').innerHTML = d.equipe.length
    ? '<table class="ck-tabela"><thead><tr><th>Profissional</th><th>Ocupação realizada</th><th>Meta do mês</th><th>Na espera</th></tr></thead><tbody>'
      + d.equipe.map(e => '<tr><td>' + escapeHtml(e.nome) + '</td><td>' + escapeHtml(temOcupacaoRealizada(e) ? ocupacaoPctTxt(e.ocupacaoRealizadaPct) : 'Em atualização') + '</td><td>' + escapeHtml(e.metaPct === null ? 'sem meta' : pctTxt(e.metaPct)) + '</td><td>' + escapeHtml(String(e.naEspera)) + '</td></tr>').join('')
      + '</tbody></table>'
    : '<p class="empty-state">Nenhum profissional ativo.</p>';
}

// Simulador: só multiplica as bases que o servidor mandou. Rótulo de estimativa sempre visível.
function simular() {
  if (!dados) return;
  const s = dados.simulador;
  const v = id => Number(el(id).value) / 100;
  const rpm = s.receitaPorMinutoCentavos;
  const linhas = [
    ['ckSimConverter', s.avulsosFrequentes && s.planoMaisBaratoMensalCentavos ? s.avulsosFrequentes * v('ckSimConverter') * s.planoMaisBaratoMensalCentavos : null, 'sem avulsos frequentes ou sem plano à venda'],
    ['ckSimPreencher', temOcupacaoRealizada(dados.ocupacao) && rpm && s.minutosOciosos28d ? (s.minutosOciosos28d * 30 / 28) * v('ckSimPreencher') * rpm : null, temOcupacaoRealizada(dados.ocupacao) ? 'sem horas livres ou sem receita por minuto' : atualizandoOcupacao],
    ['ckSimFaltas', rpm && s.minutosFalta30d ? s.minutosFalta30d * v('ckSimFaltas') * rpm : null, 'sem faltas nos últimos 30 dias']
  ];
  let total = 0;
  for (const [id, valor, semBase] of linhas) {
    el(id).disabled = valor === null;
    el(id + 'Val').textContent = el(id).value + '%';
    el(id + 'Res').textContent = valor === null ? semBase : '+' + centsToBRL(Math.round(valor)) + '/mês';
    total += valor || 0;
  }
  el('ckSimTotal').textContent = '+' + centsToBRL(Math.round(total)) + '/mês';
}

function irParaGestao(subtab) {
  stateBus.dispatchEvent(new CustomEvent('tab:change', { detail: 'gestao' }));
  setTimeout(() => el(subtab)?.click(), 0);
}

async function executar(acao) {
  if (acao.destino === 'agenda') {
    let dia = acao.data || todayStr();
    if (!acao.data) {
      for (let i = 0; i < 7 && new Date(dia + 'T12:00:00').getDay() !== acao.dow; i++) dia = addDays(dia, 1);
    }
    state.selectedDay = dia;
    state.currentWeekStart = startOfWeek(dia);
    stateBus.dispatchEvent(new CustomEvent('tab:change', { detail: 'agenda' }));
    try { await loadWeekAgenda(); } catch (err) { showBanner('Agenda: ' + err.message, 'error'); }
    return;
  }
  if (acao.destino === 'assinaturas') return irParaGestao('subtabBtnAssinantes');
  if (acao.destino === 'escalas') return irParaGestao('subtabBtnEscalas');
  if (acao.destino === 'regras') return irParaGestao('subtabBtnRegras');
  if (acao.destino === 'financeiro') {
    const alvo = el('dbMarginWidget');
    const dobra = alvo && alvo.closest('details');
    if (dobra) dobra.open = true;
    alvo?.scrollIntoView({ block: 'start' });
  }
}

export async function atualizarCockpit() {
  const sec = el('cockpit');
  if (!sec) return;
  if (!state.session || !sessionPode('painel:financeiro')) { sec.classList.add('hidden'); return; }
  sec.classList.remove('hidden');
  el('ckStatus').textContent = 'Calculando…';
  try {
    const resposta = await api('/cockpit');
    if (!state.session || !sessionPode('painel:financeiro')) return;
    const atualizada = temOcupacaoRealizada(resposta.ocupacao);
    dados = atualizada ? resposta : {
      ...resposta,
      alertas: resposta.alertas.filter(a => a.id !== 'gargalo_ocupacao' && !a.id.startsWith('profissional_saturado:'))
    };
    const [rotulo, classe] = SAUDE[dados.saude] || SAUDE.ok;
    el('ckStatus').textContent = atualizada ? rotulo : atualizandoOcupacao;
    el('ckStatus').className = 'ck-saude' + (atualizada ? ' ' + classe : '');
    renderCards(dados); renderAlertas(dados.alertas); renderDias(dados); renderEquipe(dados); simular();
  } catch (err) {
    el('ckStatus').textContent = 'Não foi possível calcular agora';
    el('ckStatus').className = 'ck-saude ck-saude-atencao';
    el('ckAlertas').innerHTML = '<p class="empty-state">' + escapeHtml(err.message) + '</p>';
  }
}

export function initCockpit() {
  if (!el('cockpit')) return;
  el('ckAlertas').addEventListener('click', ev => {
    const b = ev.target.closest('[data-ck-acao]');
    if (b && dados) executar(dados.alertas[Number(b.dataset.ckAcao)].acao);
  });
  for (const id of ['ckSimConverter', 'ckSimPreencher', 'ckSimFaltas']) el(id).addEventListener('input', simular);
}

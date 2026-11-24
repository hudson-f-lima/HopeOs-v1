// Cockpit do gestor (D-064): 4 indicadores, "Decidir agora" (alertas com o porquê e a ação),
// ocupação por dia, equipe e simulador. Tudo vem calculado do servidor (GET /cockpit); a tela só
// mostra. Sem número inventado: o que o servidor manda como null aparece como "—" com o motivo.
// Só para quem tem painel:financeiro (receita, margem e assinaturas são dado gerencial).
import { api } from '../api.js';
import { state, stateBus, sessionPode, loadWeekAgenda } from '../state.js';
import { escapeHtml, centsToBRL, startOfWeek, todayStr, addDays, showBanner } from '../utils.js';
import {
  atualizandoOcupacao, detalheOcupacao, minutosTxt, notaEscalaHistorica, ocupacaoPctTxt, resumoOcupacao, temOcupacaoRealizada
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
      f.metaCentavos ? pctTxt(f.metaPct) + ' da soma das metas cadastradas de faturamento e produtos (' + centsToBRL(f.metaCentavos) + ')' : 'Sem meta cadastrada para o mês',
      f.projecaoCentavos !== null
        ? 'Estimativa linear: ' + centsToBRL(f.projecaoCentavos) + ' até o fim do mês. Sem intervalo de confiança calculado.'
        : 'Estimativa linear indisponível. ' + f.projecaoNota,
      f.variacaoPct !== null ? (f.variacaoPct >= 0 ? '+' : '') + pctTxt(f.variacaoPct) + ' vs. o mesmo período do mês passado' : 'Sem base no mês passado'
    ]),
    card('Margem antes das despesas fixas', m.margemPct === null ? '—' : pctTxt(m.margemPct), [
      f.comandas === 0 ? 'Sem comandas válidas' : centsToBRL(m.margemCentavos) + ' · Parte do salão após comissões, taxas e custos registrados',
      m.taxasPctDoRecebido !== null ? 'Taxas: ' + pctTxt(m.taxasPctDoRecebido) + ' do recebido' + (m.taxasPctAnterior !== null ? ' (mês passado ' + pctTxt(m.taxasPctAnterior) + ')' : '') : null
    ]),
    // Mesmo período e mesma regra do Desempenho do salão (D-071).
    card('Ocupação realizada', ocupacao.valor, [
      periodoTxt(om.de, om.ate),
      ocupacao.base
    ], detalheOcupacao(om)),
    card('Recorrência', r.ativos + ' assinante(s) ativo(s)', [
      centsToBRL(r.mrrCentavos) + ' de receita recorrente nominal por mês',
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

const SERIES_DIA = [
  ['Ocupação realizada', 'ck-dia-realizada'],
  ['Preenchimento realizado da grade', 'ck-dia-preenchida']
];

function detalheDoDia(dia, periodo, valores, semHorarioConfiavel) {
  const linhas = [
    ['Ocupação realizada', valores[0] + ' · ' + resumoOcupacao(dia).base],
    ['Preenchimento realizado da grade', valores[1]]
  ];
  if (!semHorarioConfiavel) {
    if (Number.isFinite(dia.minutosForaDaEscala)) linhas.push(['Fora da escala', minutosTxt(dia.minutosForaDaEscala)]);
    if (Number.isFinite(dia.minutosSobrepostos)) linhas.push(['Sobreposição de serviços', minutosTxt(dia.minutosSobrepostos)]);
  }
  const notaParcial = semHorarioConfiavel
    ? 'Cobertura parcial. Horários insuficientes para medir o preenchimento, o tempo fora da escala e a sobreposição.'
    : 'Cobertura parcial. O preenchimento, o tempo fora da escala e a sobreposição consideram os serviços com horário e duração identificados.';
  return '<div class="ck-dia-detalhe"><p class="ck-nota">' + escapeHtml(periodo) + '</p><dl>'
    + linhas.map(([rotulo, valor]) => '<div><dt>' + escapeHtml(rotulo) + '</dt><dd>' + escapeHtml(valor) + '</dd></div>').join('')
    + '</dl>'
    + (dia.coberturaParcial ? '<p class="ck-nota">' + escapeHtml(notaParcial) + '</p>' : '')
    + (dia.proximaDataLivre ? '<button type="button" class="ck-dia-agenda btn-secondary" data-ck-agenda="' + escapeHtml(String(dia.dow)) + '">Ver agenda de '
      + escapeHtml(diaMes(dia.proximaDataLivre)) + '</button>' : '')
    + '</div>';
}

function renderDias(d) {
  if (!temOcupacaoRealizada(d.ocupacao)) {
    el('ckDias').textContent = '';
    el('ckDiasPeriodo').textContent = atualizandoOcupacao;
    return;
  }
  const { de, ate } = d.ocupacao.janela;
  const periodo = periodoTxt(de, ate);
  el('ckDiasPeriodo').textContent = periodo
    + (d.ocupacao.capacidadeHistoricaEstimada ? '. ' + notaEscalaHistorica : '');
  const dias = d.ocupacao.porDia.slice(1).concat(d.ocupacao.porDia.slice(0, 1)); // segunda primeiro
  const max = Math.ceil(Math.max(100, ...dias.map(dia => dia.ocupacaoRealizadaPct ?? 0)) / 50) * 50;
  const legenda = '<div class="ck-dias-legenda">' + SERIES_DIA.map(([rotulo, classe]) =>
    '<span class="' + classe + '">' + rotulo + '</span>').join('') + '</div>';
  const escala = '<div class="ck-dias-escala"><span>Escala</span><span class="ck-dias-eixo"><span>0%</span><span>'
    + escapeHtml(ocupacaoPctTxt(max)) + '</span></span></div>';
  el('ckDias').innerHTML = legenda + escala + dias.map(dia => {
    const semHorarioConfiavel = dia.coberturaParcial && dia.minutosRealizados === dia.minutosSemHorario;
    const medidas = [dia.ocupacaoRealizadaPct, semHorarioConfiavel ? null : dia.preenchimentoGradePct];
    const valores = medidas.map(v => v === null ? 'Sem base' : Number.isFinite(v) ? ocupacaoPctTxt(v) : 'Indisponível');
    const series = SERIES_DIA.map(([, classe], i) => '<span class="ck-dia-serie">'
      + (Number.isFinite(medidas[i]) ? '<meter class="' + classe + '" min="0" max="' + max + '" value="' + medidas[i] + '"></meter>'
        : '<span class="ck-dia-sem-base"></span>')
      + '<b>' + escapeHtml(valores[i]) + '</b></span>').join('');
    const rotulo = [dia.nome, ...SERIES_DIA.map(([serie], i) => serie + ' ' + valores[i])].join('. ');
    return '<details class="ck-dia" name="ck-dias-semana"><summary class="ck-dia-resumo" aria-label="' + escapeHtml(rotulo) + '">'
      + '<span class="ck-dia-nome">' + escapeHtml(dia.nome.slice(0, 3)) + '</span>'
      + '<span class="ck-dia-series" aria-hidden="true">' + series + '</span></summary>'
      + detalheDoDia(dia, periodo, valores, semHorarioConfiavel) + '</details>';
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
  for (const [id, valor, semBase] of linhas) {
    el(id).disabled = valor === null;
    el(id + 'Val').textContent = el(id).value + '%';
    const prefixo = id === 'ckSimConverter' ? 'Receita recorrente bruta estimada de ' : '+';
    el(id + 'Res').textContent = valor === null ? semBase : prefixo + centsToBRL(Math.round(valor)) + '/mês';
  }
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
  el('ckDias').addEventListener('click', ev => {
    const botao = ev.target.closest('[data-ck-agenda]');
    if (!botao || !dados) return;
    const dia = dados.ocupacao.porDia.find(dia => dia.dow === Number(botao.dataset.ckAgenda));
    if (dia?.proximaDataLivre) executar({ destino: 'agenda', data: dia.proximaDataLivre });
  });
  for (const id of ['ckSimConverter', 'ckSimPreencher', 'ckSimFaltas']) el(id).addEventListener('input', simular);
}

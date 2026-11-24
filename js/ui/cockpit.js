// Cockpit do gestor (D-064): 4 indicadores, "Decidir agora" (alertas com o porquê e a ação),
// ocupação por dia, equipe e simulador. Tudo vem calculado do servidor (GET /cockpit); a tela só
// mostra. Sem número inventado: o que o servidor manda como null aparece como "—" com o motivo.
// Só para quem tem painel:financeiro (receita, margem e assinaturas são dado gerencial).
import { api } from '../api.js';
import { state, stateBus, sessionPode, loadWeekAgenda } from '../state.js';
import { escapeHtml, centsToBRL, startOfWeek, todayStr, addDays, showBanner } from '../utils.js';

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

function card(titulo, valor, linhas) {
  return '<div class="ck-card"><div class="ck-card-titulo">' + escapeHtml(titulo) + '</div>'
    + '<div class="ck-card-valor">' + escapeHtml(valor) + '</div>'
    + linhas.filter(Boolean).map(l => '<div class="ck-card-linha">' + escapeHtml(l) + '</div>').join('') + '</div>';
}

const diaMes = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const periodoTxt = (de, ate) => diaMes(de) + ' a ' + diaMes(ate);
function horasTxt(min) {
  const h = Math.floor(min / 60); const m = min % 60;
  return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min';
}

function renderCards(d) {
  const f = d.faturamento; const m = d.margem; const om = d.ocupacaoMes; const r = d.recorrencia;
  el('ckCards').innerHTML = [
    card('Faturamento do mês', centsToBRL(f.realizadoCentavos), [
      periodoTxt(om.de, om.ate),
      f.metaCentavos ? pctTxt(f.metaPct) + ' da meta (' + centsToBRL(f.metaCentavos) + ', soma das metas da equipe)' : 'Sem meta cadastrada para o mês',
      f.projecaoCentavos !== null ? 'No ritmo atual: ' + centsToBRL(f.projecaoCentavos) : f.projecaoNota,
      f.variacaoPct !== null ? (f.variacaoPct >= 0 ? '+' : '') + pctTxt(f.variacaoPct) + ' vs. o mesmo período do mês passado' : 'Sem base no mês passado'
    ]),
    card('Margem real do salão', m.margemPct === null ? '—' : pctTxt(m.margemPct), [
      m.margemPct === null ? 'Sem comandas no mês' : centsToBRL(m.margemCentavos) + ' depois de comissão e taxas',
      m.taxasPctDoRecebido !== null ? 'Taxas: ' + pctTxt(m.taxasPctDoRecebido) + ' do recebido' + (m.taxasPctAnterior !== null ? ' (mês passado ' + pctTxt(m.taxasPctAnterior) + ')' : '') : null
    ]),
    // Mesmo período e mesma regra do Desempenho do salão (D-071).
    card('Ocupação da agenda', pctTxt(om.ocupacaoPct), [
      periodoTxt(om.de, om.ate),
      om.ocupacaoPct === null ? 'Sem expediente na escala neste período' : horasTxt(om.minutosOcupados) + ' ocupadas de ' + horasTxt(om.minutosDisponiveis)
    ]),
    card('Recorrência', r.ativos + ' assinante(s) ativo(s)', [
      centsToBRL(r.mrrCentavos) + ' por mês' + (r.pctDaReceita !== null ? ' (' + pctTxt(r.pctDaReceita) + ' do faturamento)' : ''),
      r.atrasados ? r.atrasados + ' com pagamento atrasado' : 'Nenhum atraso',
      r.churnPct !== null ? 'Cancelamentos no mês: ' + r.canceladasNoMes + ' (' + pctTxt(r.churnPct) + ')' : null
    ])
  ].join('');
}

function renderAlertas(d) {
  const box = el('ckAlertas');
  if (!d.alertas.length) { box.innerHTML = '<p class="empty-state">Nenhuma decisão pendente pelos números de hoje.</p>'; return; }
  box.innerHTML = d.alertas.map((a, i) => '<article class="ck-alerta ck-alerta-' + escapeHtml(a.nivel) + '">'
    + '<div class="ck-alerta-topo"><span class="ck-nivel">' + escapeHtml(NIVEL[a.nivel] || a.nivel) + '</span>'
    + (a.impactoCentavos ? '<span class="ck-impacto">' + escapeHtml('≈ ' + centsToBRL(a.impactoCentavos)) + '</span>' : '') + '</div>'
    + '<h4>' + escapeHtml(a.titulo) + '</h4><p>' + escapeHtml(a.porque) + '</p>'
    + (a.clientes && a.clientes.length ? '<p class="ck-quem">' + escapeHtml(a.clientes.map(c => c.nome).join(', ')) + '</p>' : '')
    + (a.acao ? '<button type="button" class="btn-secondary" data-ck-acao="' + i + '">' + escapeHtml(a.acao.rotulo) + '</button>' : '')
    + '</article>').join('');
}

function renderDias(d) {
  const dias = d.ocupacao.porDia.slice(1).concat(d.ocupacao.porDia.slice(0, 1)); // segunda primeiro
  el('ckDias').innerHTML = dias.map(x => {
    const v = x.aberto ? x.ocupacaoPct : null;
    const classe = v === null ? 'ck-dia-fechado' : v < 50 ? 'ck-dia-baixo' : v >= 90 ? 'ck-dia-cheio' : 'ck-dia-ok';
    return '<div class="ck-dia ' + classe + '"><div class="ck-dia-barra"><span style="height:' + (v === null ? 0 : Math.max(4, Math.min(100, Math.round(v)))) + '%"></span></div>'
      + '<b>' + escapeHtml(v === null ? 'fechado' : pctTxt(v)) + '</b><small>' + escapeHtml(x.nome.slice(0, 3)) + '</small></div>';
  }).join('');
}

function renderEquipe(d) {
  el('ckEquipe').innerHTML = d.equipe.length
    ? '<table class="ck-tabela"><thead><tr><th>Profissional</th><th>Ocupação</th><th>Meta</th><th>Na espera</th></tr></thead><tbody>'
      + d.equipe.map(e => '<tr><td>' + escapeHtml(e.nome) + '</td><td>' + escapeHtml(pctTxt(e.ocupacaoPct)) + '</td><td>' + escapeHtml(e.metaPct === null ? 'sem meta' : pctTxt(e.metaPct)) + '</td><td>' + escapeHtml(String(e.naEspera)) + '</td></tr>').join('')
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
    ['ckSimPreencher', rpm && s.minutosOciosos28d ? (s.minutosOciosos28d * 30 / 28) * v('ckSimPreencher') * rpm : null, 'sem horas livres ou sem receita por minuto'],
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
    // Próximo dia da semana do gargalo (a partir de hoje) na agenda.
    let dia = todayStr();
    for (let i = 0; i < 7 && new Date(dia + 'T12:00:00').getDay() !== acao.dow; i++) dia = addDays(dia, 1);
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
  if (!sessionPode('painel:financeiro')) { sec.classList.add('hidden'); return; }
  sec.classList.remove('hidden');
  el('ckStatus').textContent = 'Calculando…';
  try {
    dados = await api('/cockpit');
    const [rotulo, classe] = SAUDE[dados.saude] || SAUDE.ok;
    el('ckStatus').textContent = rotulo;
    el('ckStatus').className = 'ck-saude ' + classe;
    renderCards(dados); renderAlertas(dados); renderDias(dados); renderEquipe(dados); simular();
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

import {
  api,
  getInsightsAttach,
  getInsightsCashflow,
  getInsightsMargin,
  getInsightsOccupancy,
  getInsightsRetention
} from '../api.js';
import { state, findProfissionalNome, stateBus } from '../state.js';
import { addDays, centsToBRL, escapeHtml, formatDDMM, showBanner, startOfWeek, todayStr, waLink, WEEKDAY_LABELS } from '../utils.js';

const SEGMENT_COLORS = ['#7c6af7', '#14b8a6', '#3b82f6', '#f59e0b', '#ff7a68', '#b794f6', '#22c55e', '#9490a3'];

function el(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

function emptyState(message = 'Sem dados no periodo.') {
  return `<div class="insight-empty">${escapeHtml(message)}</div>`;
}

function loadingState() {
  return `
    <div class="insight-loading">
      <div class="skeleton-line"></div>
      <div class="skeleton-line short"></div>
      <div class="skeleton-line"></div>
    </div>
  `;
}

function insightRange() {
  const from = state.currentWeekStart || startOfWeek(todayStr());
  const to = addDays(from, 6);
  return { from, to };
}

function colorForPct(pct, faixas = []) {
  const sorted = [...faixas].sort((a, b) => Number(a.max || 0) - Number(b.max || 0));
  const found = sorted.find(f => Number(pct || 0) <= Number(f.max || 0));
  return (found && found.cor) || (sorted[sorted.length - 1] && sorted[sorted.length - 1].cor) || 'var(--primary)';
}

function widthPct(value) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function renderLegacyDashboard(dash) {
  setText('dbReceita', centsToBRL(dash.kpis.receitaEmpresaCentavos));
  setText('dbComandos', dash.kpis.comandos ?? 0);
  setText('dbComissoes', centsToBRL(dash.finance.totals.totalComissaoCentavos));
  setText('dbTicketMedio', centsToBRL(dash.kpis.ticketMedioCentavos));
  setText('dashUpdatedAt', new Date().toLocaleTimeString('pt-BR'));

  const porForma = dash.paymentsByMethod || [];
  const formasVisiveis = porForma.slice(0, 5);
  const pagamentos = el('dbPagamentos');
  if (pagamentos) {
    pagamentos.innerHTML = porForma.length
      ? formasVisiveis.map(p => {
          const forma = state.catalog.formas_pagamento.find(f => f.code === p.formaCode);
          return `<div class="row"><span>${escapeHtml(forma ? forma.label : p.formaCode)} (${p.count}x)</span><b>${centsToBRL(p.valorCentavos)}</b></div>`;
        }).join('') + (porForma.length > formasVisiveis.length ? `<p class="list-count-hint">+${porForma.length - formasVisiveis.length} forma(s) no total.</p>` : '')
      : '<p class="empty-state">Nenhum pagamento fechado ainda.</p>';
  }

  const repasses = (dash.finance && dash.finance.repassesPorProfissional) || [];
  const repassesVisiveis = repasses.slice(0, 5);
  const repassesEl = el('dbRepasses');
  if (repassesEl) {
    repassesEl.innerHTML = repasses.length
      ? repassesVisiveis.map(r => `<div class="row"><span>${escapeHtml(findProfissionalNome(r.profissionalId))}</span><b>${centsToBRL((r.comissaoCentavos || 0) + (r.gorjetaLiquidaCentavos || 0))}</b></div>`).join('') + (repasses.length > repassesVisiveis.length ? `<p class="list-count-hint">+${repasses.length - repassesVisiveis.length} profissional(is) no total.</p>` : '')
      : '<p class="empty-state">Nenhum repasse calculado ainda.</p>';
  }
}

function renderActionStrip() {
  // TODO: Integrar lógica da Faixa F4.x para ações dinâmicas (WhatsApp, Retenção).
  // Função declarada para evitar ReferenceError (crash) durante o carregamento dos insights.
  const actions = el('dashboardActionStrip');
  if (!actions) return;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pctText(value) {
  const n = safeNumber(value, null);
  return n === null ? '—' : `${n.toFixed(1).replace('.', ',')}%`;
}

function topRows(rows, mapper, empty = 'Sem dados para exibir.') {
  const list = safeArray(rows).slice(0, 5);
  if (!list.length) return emptyState(empty);
  return list.map(mapper).join('');
}

function safeDDMM(dateStr) {
  return (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dateStr)) ? formatDDMM(dateStr) : '—';
}

function formaLabel(code) {
  const forma = safeArray(state.catalog && state.catalog.formas_pagamento).find(f => f.code === code);
  return forma ? forma.label : (code || '—');
}

// Renderers dos widgets de Insights.
// Regra-mãe: só exibem valores já calculados pelo backend (state.insights.*),
// toleram payload vazio e nunca lançam exceção.

function renderOccupancy() {
  const node = el('dbOccupancyWidget');
  if (!node) return;
  const occ = state.insights.occupancy;
  if (!occ) {
    node.innerHTML = emptyState('Ocupacao ainda nao carregada.');
    return;
  }

  const range = occ.range || {};
  if (range.from && range.to) {
    setText('dbOccRange', `${safeDDMM(range.from)} - ${safeDDMM(range.to)}`);
  }

  const loadPct = safeNumber(occ.loadFactorPct, null);
  const vendidos = safeNumber(occ.minutosVendidos);
  const disponiveis = safeNumber(occ.minutosDisponiveis);

  const profRows = topRows(occ.porProfissional, p => `
    <div class="row">
      <span>${escapeHtml(p.profissionalNome || findProfissionalNome(p.profissionalId))}</span>
      <b>${pctText(p.surPct)}</b>
    </div>
  `, 'Sem dados por profissional.');

  const buracos = safeArray(occ.buracos).slice(0, 3);
  const buracosHtml = buracos.length
    ? buracos.map(b => `
        <div class="row">
          <span>${escapeHtml(safeDDMM(b.data))} ${escapeHtml(b.inicio || '')}-${escapeHtml(b.fim || '')}</span>
          <b>${escapeHtml(b.profissionalNome || findProfissionalNome(b.profissionalId))}</b>
        </div>
      `).join('')
    : '';

  node.innerHTML = `
    <div class="row"><span>Carga da semana</span><b style="color:${colorForPct(loadPct, occ.faixas)}">${pctText(loadPct)}</b></div>
    <div class="row"><span>Minutos vendidos</span><b>${vendidos}</b></div>
    <div class="row"><span>Minutos disponiveis</span><b>${disponiveis}</b></div>
    <h4 class="insight-subtitle">Por profissional</h4>
    ${profRows}
    ${buracosHtml ? `<h4 class="insight-subtitle">Buracos na agenda</h4>${buracosHtml}` : ''}
  `;
}

function renderMoney() {
  const node = el('dbMoneyWidget');
  if (!node) return;
  const cf = state.insights.cashflow;
  if (!cf) {
    node.innerHTML = emptyState('Fluxo de caixa ainda nao carregado.');
    return;
  }

  const formasHtml = topRows(cf.porForma, f => `
    <div class="row">
      <span>${escapeHtml(formaLabel(f.formaCode))}</span>
      <b>${centsToBRL(safeNumber(f.liquidoCentavos))}</b>
    </div>
  `, 'Sem recebiveis por forma.');

  const proximas = safeArray(cf.curva).filter(c => safeNumber(c.liquidoCentavos) > 0).slice(0, 3);
  const curvaHtml = proximas.length
    ? proximas.map(c => `
        <div class="row">
          <span>${escapeHtml(safeDDMM(c.data))}</span>
          <b>${centsToBRL(safeNumber(c.liquidoCentavos))}</b>
        </div>
      `).join('')
    : '';

  node.innerHTML = `
    <div class="row"><span>Acumulado 7 dias</span><b>${centsToBRL(safeNumber(cf.acumulado7dCentavos))}</b></div>
    <div class="row"><span>Acumulado 30 dias</span><b>${centsToBRL(safeNumber(cf.acumulado30dCentavos))}</b></div>
    ${curvaHtml ? `<h4 class="insight-subtitle">Proximas entradas</h4>${curvaHtml}` : ''}
    <h4 class="insight-subtitle">Liquido por forma</h4>
    ${formasHtml}
  `;
}

function renderMargin() {
  const node = el('dbMarginWidget');
  if (!node) return;
  const margin = state.insights.margin;
  if (!margin) {
    node.innerHTML = emptyState('Margem ainda nao carregada.');
    return;
  }

  const servicosHtml = topRows(margin.porServico, s => `
    <div class="row">
      <span>${escapeHtml(s.servicoNome || '—')} (${pctText(s.margemPct)})</span>
      <b>${centsToBRL(safeNumber(s.receitaEmpresaCentavos))}</b>
    </div>
  `, 'Sem dados por servico.');

  const profHtml = topRows(margin.porProfissional, p => `
    <div class="row">
      <span>${escapeHtml(findProfissionalNome(p.profissionalId) || p.profissionalNome || '—')}</span>
      <b>${centsToBRL(safeNumber(p.producaoCentavos))}</b>
    </div>
  `, 'Sem dados por profissional.');

  node.innerHTML = `
    <div class="row"><span>Ticket medio</span><b>${centsToBRL(safeNumber(margin.ticketMedioCentavos))}</b></div>
    <h4 class="insight-subtitle">Top servicos</h4>
    ${servicosHtml}
    <h4 class="insight-subtitle">Por profissional</h4>
    ${profHtml}
  `;
}

function renderPeople() {
  const node = el('dbPeopleWidget');
  if (!node) return;
  const ret = state.insights.retention;
  if (!ret) {
    node.innerHTML = emptyState('Retencao ainda nao carregada.');
    return;
  }

  const novosPct = ret.novosRetencao && ret.novosRetencao.pct;

  const chamarHtml = topRows(ret.quemChamar, c => {
    const nome = escapeHtml(c.nome || '—');
    const dias = safeNumber(c.diasDesdeUltima, null);
    const detalhe = [c.risco ? escapeHtml(c.risco) : '', dias !== null ? `${dias}d` : ''].filter(Boolean).join(' · ');
    const link = c.whatsapp ? ` <a href="${waLink(c.whatsapp, `Oi ${c.nome || ''}! Sentimos sua falta, vamos agendar um horario?`)}" target="_blank" rel="noopener">WhatsApp</a>` : '';
    return `<div class="row"><span>${nome}</span><b>${detalhe}${link}</b></div>`;
  }, 'Ninguem para chamar agora.');

  const candidatos = safeArray(ret.assinaturaCandidatos).slice(0, 5);
  const candidatosHtml = candidatos.length
    ? candidatos.map(c => `<div class="row"><span>${escapeHtml(c.nome || '—')}</span><b>${safeNumber(c.visitas180d)} visitas · ${centsToBRL(safeNumber(c.gastoMensalMedioCentavos))}/mes</b></div>`).join('')
    : '';

  node.innerHTML = `
    <div class="row"><span>Taxa de rebooking</span><b>${pctText(ret.rebookingRatePct)}</b></div>
    <div class="row"><span>Retencao de novos</span><b>${pctText(novosPct)}</b></div>
    <h4 class="insight-subtitle">Quem chamar</h4>
    ${chamarHtml}
    ${candidatosHtml ? `<h4 class="insight-subtitle">Candidatos a assinatura</h4>${candidatosHtml}` : ''}
  `;
}

function setWidgetError(id, msg) {
  const node = el(id);
  if (node) node.innerHTML = `<div class="insight-empty error" style="color:var(--danger)">${escapeHtml(msg)}</div>`;
}

async function loadOccupancy(from, to) {
  const node = el('dbOccupancyWidget');
  if (node) node.innerHTML = loadingState();
  try {
    state.insights.occupancy = await getInsightsOccupancy(from, to);
    renderOccupancy();
    renderActionStrip();
  } catch(err) {
    setWidgetError('dbOccupancyWidget', 'Erro Occupancy: ' + err.message);
  }
}

async function loadMargin(from, to) {
  const node = el('dbMarginWidget');
  if (node) node.innerHTML = loadingState();
  try {
    state.insights.margin = await getInsightsMargin(from, to);
    renderMargin();
    renderMoney();
  } catch(err) {
    setWidgetError('dbMarginWidget', 'Erro Margin: ' + err.message);
  }
}

async function loadCashflow() {
  const node = el('dbMoneyWidget');
  if (node) node.innerHTML = loadingState();
  try {
    state.insights.cashflow = await getInsightsCashflow(30);
    renderMoney();
    renderActionStrip();
  } catch(err) {
    setWidgetError('dbMoneyWidget', 'Erro Cashflow: ' + err.message);
  }
}

async function loadRetentionAndAttach() {
  const node = el('dbPeopleWidget');
  if (node) node.innerHTML = loadingState();
  
  getInsightsAttach().then(att => {
    state.insights.attach = att;
    renderActionStrip();
  }).catch(err => console.error('Attach error:', err));

  try {
    state.insights.retention = await getInsightsRetention();
    renderPeople();
    renderActionStrip();
  } catch(err) {
    setWidgetError('dbPeopleWidget', 'Erro Retention: ' + err.message);
  }
}

async function atualizarInsights() {
  state.insights.loading = true;
  state.insights.error = null;
  
  const status = el('dashboardInsightsStatus');
  if (status) status.innerHTML = '<div class="banner banner-ok">Atualizando inteligencia operacional...</div>';
  
  const actions = el('dashboardActionStrip');
  if (actions) actions.innerHTML = '';

  const { from, to } = insightRange();

  // Carregamento independente - Progressive Rendering
  // Não trava a UI num Promise.all bloqueante.
  await Promise.allSettled([
    loadOccupancy(from, to),
    loadMargin(from, to),
    loadCashflow(),
    loadRetentionAndAttach()
  ]);

  state.insights.loading = false;
  state.insights.updatedAt = new Date().toLocaleTimeString('pt-BR');

  if (status) {
    status.innerHTML = `<div class="banner banner-ok">Insights atualizados ${escapeHtml(state.insights.updatedAt)}.</div>`;
  }
}

export async function atualizarDashboard() {
  try {
    const dash = await api('/dashboard');
    renderLegacyDashboard(dash);
  } catch (err) {
    showBanner('Dashboard: ' + err.message, 'error');
  }

  await atualizarInsights();
}

export function initDashboard() {
  const refreshBtn = el('btnAtualizarDashboard');
  if (refreshBtn) refreshBtn.addEventListener('click', atualizarDashboard);

  const actions = el('dashboardActionStrip');
  if (actions) {
    actions.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-dashboard-tab]');
      if (!btn) return;
      stateBus.dispatchEvent(new CustomEvent('tab:change', { detail: btn.dataset.dashboardTab }));
    });
  }

  stateBus.addEventListener('checkout:closed', () => {
    atualizarDashboard();
  });
}

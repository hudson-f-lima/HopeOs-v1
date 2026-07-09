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

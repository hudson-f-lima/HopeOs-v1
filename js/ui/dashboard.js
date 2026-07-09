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

function renderInsightsLoading() {
  const status = el('dashboardInsightsStatus');
  if (status) status.innerHTML = '<div class="banner banner-ok">Carregando inteligencia operacional...</div>';
  ['dbOccupancyWidget', 'dbMoneyWidget', 'dbMarginWidget', 'dbPeopleWidget'].forEach(id => {
    const node = el(id);
    if (node) node.innerHTML = loadingState();
  });
  const actions = el('dashboardActionStrip');
  if (actions) actions.innerHTML = '';
}

function renderInsightsError(message) {
  const status = el('dashboardInsightsStatus');
  if (status) status.innerHTML = `<div class="banner banner-error">${escapeHtml(message)}</div>`;
  ['dbOccupancyWidget', 'dbMoneyWidget', 'dbMarginWidget', 'dbPeopleWidget'].forEach(id => {
    const node = el(id);
    if (node) node.innerHTML = emptyState('Insights indisponiveis no momento.');
  });
  const actions = el('dashboardActionStrip');
  if (actions) actions.innerHTML = '';
}

function renderActionStrip() {
  const actions = el('dashboardActionStrip');
  if (!actions) return;

  const { occupancy, retention, attach, cashflow } = state.insights;
  const cards = [];
  const gaps = occupancy && Array.isArray(occupancy.buracos) ? occupancy.buracos : [];
  const calls = retention && Array.isArray(retention.quemChamar) ? retention.quemChamar : [];
  const suggestions = attach && Array.isArray(attach.sugestoes) ? attach.sugestoes : [];

  if (gaps.length) {
    const first = gaps[0];
    cards.push({
      title: `${gaps.length} buraco(s) na agenda`,
      meta: `${escapeHtml(first.profissionalNome || 'Profissional')} ${escapeHtml(first.inicio || '')}-${escapeHtml(first.fim || '')}`,
      cta: 'Agenda',
      tab: 'agenda'
    });
  }

  if (calls.length) {
    const first = calls[0];
    cards.push({
      title: `${calls.length} cliente(s) para chamar`,
      meta: `${escapeHtml(first.nome || 'Cliente')} - risco ${escapeHtml(first.risco || 'atencao')}`,
      cta: 'Pessoas',
      tab: 'dashboard'
    });
  }

  if (suggestions.length) {
    const products = Array.isArray(suggestions[0].produtos) ? suggestions[0].produtos : [];
    cards.push({
      title: `Attach ${Number(attach.attachRatePct || 0).toFixed(1).replace('.', ',')}%`,
      meta: `${escapeHtml(suggestions[0].servicoNome || 'Servico')} com ${products.length} sugestao(oes)`,
      cta: 'Checkout',
      tab: 'checkout'
    });
  }

  if (cashflow && Number(cashflow.acumulado7dCentavos || 0) > 0) {
    cards.push({
      title: `${centsToBRL(cashflow.acumulado7dCentavos)} D+7`,
      meta: 'Recebiveis liquidos projetados pelo backend',
      cta: 'Ver',
      tab: 'dashboard'
    });
  }

  actions.innerHTML = cards.slice(0, 5).map(card => `
    <article class="action-card">
      <div>
        <div class="action-card-title">${escapeHtml(card.title)}</div>
        <div class="action-card-meta">${card.meta}</div>
      </div>
      <button type="button" data-dashboard-tab="${escapeHtml(card.tab)}">${escapeHtml(card.cta)}</button>
    </article>
  `).join('');
}

function renderOccupancy() {
  const node = el('dbOccupancyWidget');
  const occupancy = state.insights.occupancy;
  if (!node) return;
  if (!occupancy) {
    node.innerHTML = emptyState();
    return;
  }

  const pct = Number(occupancy.loadFactorPct || 0);
  const color = colorForPct(pct, occupancy.faixas);
  const range = occupancy.range || insightRange();
  setText('dbOccRange', `${formatDDMM(range.from)}-${formatDDMM(range.to)}`);

  const heatmap = (occupancy.heatmap || [])
    .slice()
    .sort((a, b) => (a.dow - b.dow) || (a.hora - b.hora))
    .slice(0, 28);
  const profs = (occupancy.porProfissional || [])
    .slice()
    .sort((a, b) => Number(b.surPct || 0) - Number(a.surPct || 0))
    .slice(0, 5);
  const gaps = (occupancy.buracos || []).slice(0, 3);

  node.innerHTML = `
    <div class="occ-layout">
      <div class="occ-donut" style="--occ-deg:${widthPct(pct) * 3.6}deg;--occ-color:${escapeHtml(color)}">
        <div class="occ-donut-inner">
          <div class="occ-donut-value">${pct.toFixed(1).replace('.', ',')}%</div>
          <div class="occ-donut-label">Load</div>
        </div>
      </div>
      <div>
        <div class="metric-row"><span>Minutos vendidos</span><b>${Number(occupancy.minutosVendidos || 0)}</b></div>
        <div class="metric-row"><span>Minutos disponiveis</span><b>${Number(occupancy.minutosDisponiveis || 0)}</b></div>
        ${gaps.length ? gaps.map(g => `<div class="metric-row"><span>${escapeHtml(g.profissionalNome || 'Profissional')} ${escapeHtml(g.inicio)}-${escapeHtml(g.fim)}</span><b>${Number(g.minutos || 0)} min</b></div>`).join('') : ''}
      </div>
    </div>
    ${heatmap.length ? `<div class="occ-heatmap">${heatmap.map(h => {
      const heatColor = colorForPct(h.ocupacaoPct, occupancy.faixas);
      const label = `${WEEKDAY_LABELS[h.dow] || h.dow} ${String(h.hora).padStart(2, '0')}h`;
      return `<div class="heat-cell" title="${escapeHtml(label)} ${Number(h.ocupacaoPct || 0)}%" style="--heat-color:${escapeHtml(heatColor)}">${Number(h.ocupacaoPct || 0)}</div>`;
    }).join('')}</div>` : emptyState('Sem heatmap no periodo.')}
    ${profs.length ? `<div class="bar-list" style="margin-top:12px">${profs.map(p => `
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(p.profissionalNome || p.nome || 'Profissional')}</div>
        <div class="bar-track"><div class="bar-fill" style="--bar-width:${widthPct(p.surPct)}%;background:${escapeHtml(colorForPct(p.surPct, occupancy.faixas))}"></div></div>
        <div class="bar-value">${Number(p.surPct || 0).toFixed(1).replace('.', ',')}%</div>
      </div>
    `).join('')}</div>` : ''}
  `;
}

function renderMoney() {
  const node = el('dbMoneyWidget');
  const cashflow = state.insights.cashflow;
  const margin = state.insights.margin;
  if (!node) return;
  if (!cashflow && !margin) {
    node.innerHTML = emptyState();
    return;
  }

  const curva = (cashflow && cashflow.curva ? cashflow.curva : []).slice(0, 14);
  const maxValue = Math.max(...curva.map(c => Number(c.liquidoCentavos || 0)), 1);
  const formas = (cashflow && cashflow.porForma ? cashflow.porForma : []).slice(0, 4);

  node.innerHTML = `
    <div class="metric-row"><span>Acumulado D+7</span><b>${centsToBRL(cashflow && cashflow.acumulado7dCentavos)}</b></div>
    <div class="metric-row"><span>Acumulado D+30</span><b>${centsToBRL(cashflow && cashflow.acumulado30dCentavos)}</b></div>
    <div class="metric-row"><span>Ticket medio</span><b>${centsToBRL(margin && margin.ticketMedioCentavos)}</b></div>
    ${curva.length ? `<div class="cash-bars">${curva.map(c => `<div class="cash-bar" title="${escapeHtml(c.data)} ${centsToBRL(c.liquidoCentavos)}" style="--bar-height:${Math.max(3, (Number(c.liquidoCentavos || 0) / maxValue) * 58)}px"></div>`).join('')}</div>` : emptyState('Sem curva de caixa.')}
    ${formas.length ? formas.map(f => `<div class="metric-row"><span>${escapeHtml(f.formaCode)} D+${Number(f.diasRecebimento || 0)}</span><b>${centsToBRL(f.liquidoCentavos)}</b></div>`).join('') : ''}
  `;
}

function renderMargin() {
  const node = el('dbMarginWidget');
  const margin = state.insights.margin;
  if (!node) return;
  if (!margin) {
    node.innerHTML = emptyState();
    return;
  }

  const servicos = (margin.porServico || [])
    .slice()
    .sort((a, b) => Number(b.receitaEmpresaCentavos || 0) - Number(a.receitaEmpresaCentavos || 0))
    .slice(0, 4);
  const produtos = (margin.porProduto || [])
    .slice()
    .sort((a, b) => Number(b.lucroBrutoCentavos || 0) - Number(a.lucroBrutoCentavos || 0))
    .slice(0, 3);
  const formas = (margin.porForma || []).slice(0, 3);

  node.innerHTML = `
    ${servicos.length ? servicos.map(s => `
      <div class="metric-row"><span>${escapeHtml(s.servicoNome || s.nome || 'Servico')}</span><b>${Number(s.margemPct || 0).toFixed(1).replace('.', ',')}%</b></div>
    `).join('') : emptyState('Sem servicos no periodo.')}
    ${produtos.length ? `<div class="preview-section-label">Produtos</div>${produtos.map(p => `<div class="metric-row"><span>${escapeHtml(p.produtoNome || p.nome || 'Produto')}</span><b>${centsToBRL(p.lucroBrutoCentavos)}</b></div>`).join('')}` : ''}
    ${formas.length ? `<div class="preview-section-label">Taxas</div>${formas.map(f => `<div class="metric-row"><span>${escapeHtml(f.formaCode)}</span><b>${centsToBRL(f.taxaCentavos)}</b></div>`).join('')}` : ''}
  `;
}

function segmentGradient(segmentos) {
  const active = (segmentos || []).filter(s => Number(s.n || 0) > 0);
  const total = active.reduce((sum, s) => sum + Number(s.n || 0), 0);
  if (!total) return '#f0eef7 0 360deg';
  let start = 0;
  return active.map((segment, idx) => {
    const deg = (Number(segment.n || 0) / total) * 360;
    const end = start + deg;
    const color = SEGMENT_COLORS[idx % SEGMENT_COLORS.length];
    const stop = `${color} ${start}deg ${end}deg`;
    start = end;
    return stop;
  }).join(',');
}

function renderPeople() {
  const node = el('dbPeopleWidget');
  const retention = state.insights.retention;
  if (!node) return;
  if (!retention) {
    node.innerHTML = emptyState();
    return;
  }

  const segmentos = (retention.segmentos || []).filter(s => Number(s.n || 0) > 0).slice(0, 6);
  const calls = (retention.quemChamar || []).slice(0, 5);
  const gradient = segmentGradient(retention.segmentos || []);

  node.innerHTML = `
    <div class="occ-layout">
      <div class="occ-donut" style="background:conic-gradient(${escapeHtml(gradient)})">
        <div class="occ-donut-inner">
          <div class="occ-donut-value">${segmentos.reduce((sum, s) => sum + Number(s.n || 0), 0)}</div>
          <div class="occ-donut-label">Clientes</div>
        </div>
      </div>
      <div>
        <div class="metric-row"><span>Novos 90d</span><b>${Number(retention.novosRetencao?.total1aVisita90d || 0)}</b></div>
        <div class="metric-row"><span>Voltaram</span><b>${Number(retention.novosRetencao?.pct || 0).toFixed(1).replace('.', ',')}%</b></div>
        <div class="metric-row"><span>Rebooking</span><b>${Number(retention.rebookingRatePct || 0).toFixed(1).replace('.', ',')}%</b></div>
      </div>
    </div>
    ${segmentos.length ? `<div class="segment-grid">${segmentos.map((s, idx) => `<div class="segment-chip"><b style="color:${SEGMENT_COLORS[idx % SEGMENT_COLORS.length]}">${Number(s.n || 0)}</b><span>${escapeHtml(s.label || s.nome)}</span></div>`).join('')}</div>` : emptyState('Sem segmentos RFM no periodo.')}
    ${calls.length ? `<div class="call-list">${calls.map(c => {
      const text = `Oi ${c.nome || ''}, sentimos sua falta. Quer agendar um horario esta semana?`;
      const hasPhone = Boolean(c.whatsapp);
      return `<div class="call-row">
        <div><strong>${escapeHtml(c.nome || 'Cliente')}</strong><span>${Number(c.diasDesdeUltima || 0)} dias sem visita - ${escapeHtml(c.risco || 'atencao')}</span></div>
        ${hasPhone ? `<a href="${escapeHtml(waLink(c.whatsapp, text))}" target="_blank" rel="noopener">WhatsApp</a>` : '<span class="badge-light">Sem WhatsApp</span>'}
      </div>`;
    }).join('')}</div>` : emptyState('Nenhum contato prioritario agora.')}
  `;
}

function renderInsights() {
  const status = el('dashboardInsightsStatus');
  if (status) {
    status.innerHTML = state.insights.updatedAt
      ? `<div class="banner banner-ok">Insights atualizados ${escapeHtml(state.insights.updatedAt)}.</div>`
      : '';
  }
  renderActionStrip();
  renderOccupancy();
  renderMoney();
  renderMargin();
  renderPeople();
}

async function atualizarInsights() {
  state.insights.loading = true;
  state.insights.error = null;
  renderInsightsLoading();

  const { from, to } = insightRange();
  try {
    const [occupancy, margin, cashflow, retention, attach] = await Promise.all([
      getInsightsOccupancy(from, to),
      getInsightsMargin(from, to),
      getInsightsCashflow(30),
      getInsightsRetention(),
      getInsightsAttach()
    ]);

    state.insights = {
      occupancy,
      margin,
      cashflow,
      retention,
      attach,
      loading: false,
      error: null,
      updatedAt: new Date().toLocaleTimeString('pt-BR')
    };
    renderInsights();
  } catch (err) {
    state.insights.loading = false;
    state.insights.error = err.message;
    renderInsightsError('Insights V1.4: ' + err.message);
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

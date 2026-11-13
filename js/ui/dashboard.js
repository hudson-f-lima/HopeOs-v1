import {
  api,
  getInsightsAttach,
  getInsightsCashflow,
  getInsightsMargin,
  getInsightsOccupancy,
  getInsightsRetention
} from '../api.js';
import { state, findProfissionalNome, stateBus, sessionRoleIn } from '../state.js';
import { addDays, baixarArquivo, centsToBRL, centsToDecimal, escapeHtml, formatDDMM, showBanner, startOfWeek, todayStr, toCsv, waLink, WEEKDAY_LABELS } from '../utils.js';

const SEGMENT_COLORS = ['#7c6af7', '#14b8a6', '#3b82f6', '#f59e0b', '#ff7a68', '#b794f6', '#22c55e', '#9490a3'];

function el(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const node = el(id);
  if (node) node.textContent = value;
}

function emptyState(message = 'Sem dados no período.') {
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

// "Precisa de você": só o que pede ação hoje, calculado do que a tela já carregou.
let caixaHoje = null;

function pendencias() {
  const itens = [];
  if (caixaHoje && caixaHoje.comandas > 0 && (!caixaHoje.fechado || caixaHoje.desatualizado)) {
    itens.push({
      id: 'caixa',
      titulo: caixaHoje.fechado ? 'O caixa mudou depois do fechamento' : 'O caixa de hoje ainda não foi fechado',
      meta: `${caixaHoje.comandas} comanda(s) fechada(s) hoje.`,
      botao: 'Fechar caixa',
      abrir: 'dobraCaixa'
    });
  }
  const agora = new Date();
  const hhmmAgora = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  const semConfirmar = safeArray(state.weekAgenda && state.weekAgenda[todayStr()])
    .filter(a => a.status === 'agendado' && String(a.horario || '').slice(0, 5) >= hhmmAgora).length;
  if (semConfirmar) {
    itens.push({ id: 'confirmar', titulo: `${semConfirmar} horário(s) de hoje sem confirmação`, meta: 'Confirme com o cliente para evitar falta.', botao: 'Ver agenda', tab: 'agenda' });
  }
  const chamar = safeArray(state.insights.retention && state.insights.retention.quemChamar).length;
  if (chamar) {
    itens.push({ id: 'chamar', titulo: `${chamar} cliente(s) para chamar de volta`, meta: 'Passaram do intervalo normal de retorno.', botao: 'Ver quem', abrir: 'dobraIndicadores', foco: 'dbPeopleWidget' });
  }
  return itens;
}

function renderActionStrip() {
  const actions = el('dashboardActionStrip');
  if (!actions) return;
  const itens = pendencias();
  actions.innerHTML = itens.length
    ? itens.map(i => `
      <div class="action-card" data-pendencia="${i.id}">
        <div><div class="action-card-title">${escapeHtml(i.titulo)}</div><div class="action-card-meta">${escapeHtml(i.meta)}</div></div>
        <button type="button" ${i.tab ? `data-dashboard-tab="${i.tab}"` : `data-dashboard-abrir="${i.abrir}" data-dashboard-foco="${i.foco || i.abrir}"`}>${escapeHtml(i.botao)}</button>
      </div>`).join('')
    : '<p class="empty-state" id="dashNadaPendente">Nada pendente agora.</p>';
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
    node.innerHTML = emptyState('Ocupação ainda não carregada.');
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
    <div class="row"><span>Minutos disponíveis</span><b>${disponiveis}</b></div>
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
    node.innerHTML = emptyState('Fluxo de caixa ainda não carregado.');
    return;
  }

  const formasHtml = topRows(cf.porForma, f => `
    <div class="row">
      <span>${escapeHtml(formaLabel(f.formaCode))}</span>
      <b>${centsToBRL(safeNumber(f.liquidoCentavos))}</b>
    </div>
  `, 'Sem recebíveis por forma.');

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
    ${curvaHtml ? `<h4 class="insight-subtitle">Próximas entradas</h4>${curvaHtml}` : ''}
    <h4 class="insight-subtitle">Líquido por forma</h4>
    ${formasHtml}
  `;
}

function renderMargin() {
  const node = el('dbMarginWidget');
  if (!node) return;
  const margin = state.insights.margin;
  if (!margin) {
    node.innerHTML = emptyState('Margem ainda não carregada.');
    return;
  }

  const servicosHtml = topRows(margin.porServico, s => `
    <div class="row">
      <span>${escapeHtml(s.servicoNome || '—')} (${pctText(s.margemPct)})</span>
      <b>${centsToBRL(safeNumber(s.receitaEmpresaCentavos))}</b>
    </div>
  `, 'Sem dados por serviço.');

  const profHtml = topRows(margin.porProfissional, p => `
    <div class="row">
      <span>${escapeHtml(findProfissionalNome(p.profissionalId) || p.profissionalNome || '—')}</span>
      <b title="Produção em serviços">${centsToBRL(safeNumber(p.producaoCentavos))} · salão ${centsToBRL(safeNumber(p.receitaEmpresaCentavos))}</b>
    </div>
  `, 'Sem dados por profissional.');

  // Quanto cada forma de pagamento custou de taxa no período.
  const formasHtml = topRows(margin.porForma, f => {
    const bruto = safeNumber(f.valorCentavos); const taxa = safeNumber(f.taxaCentavos);
    const pct = bruto > 0 ? (taxa * 100 / bruto).toFixed(2).replace('.', ',') : '0,00';
    return `<div class="row" data-forma-taxa="${escapeHtml(f.formaCode)}"><span>${escapeHtml(formaLabel(f.formaCode))} (taxa ${pct}%)</span><b>${centsToBRL(bruto - taxa)}</b></div>`;
  }, 'Sem pagamentos no período.');

  node.innerHTML = `
    <div class="row"><span>Ticket médio</span><b>${centsToBRL(safeNumber(margin.ticketMedioCentavos))}</b></div>
    <h4 class="insight-subtitle">Top serviços</h4>
    ${servicosHtml}
    <h4 class="insight-subtitle">Por profissional (produção · o que fica no salão)</h4>
    ${profHtml}
    <h4 class="insight-subtitle">Líquido por forma de pagamento</h4>
    ${formasHtml}
  `;
}

function renderPeople() {
  const node = el('dbPeopleWidget');
  if (!node) return;
  const ret = state.insights.retention;
  if (!ret) {
    node.innerHTML = emptyState('Retenção ainda não carregada.');
    return;
  }

  const novosPct = ret.novosRetencao && ret.novosRetencao.pct;

  const chamarHtml = topRows(ret.quemChamar, c => {
    const nome = escapeHtml(c.nome || '—');
    const dias = safeNumber(c.diasDesdeUltima, null);
    const detalhe = [c.risco ? escapeHtml(c.risco) : '', dias !== null ? `${dias}d` : ''].filter(Boolean).join(' · ');
    const link = c.whatsapp ? ` <a href="${waLink(c.whatsapp, `Oi ${c.nome || ''}! Sentimos sua falta, vamos agendar um horário?`)}" target="_blank" rel="noopener">WhatsApp</a>` : '';
    return `<div class="row"><span>${nome}</span><b>${detalhe}${link}</b></div>`;
  }, 'Ninguém para chamar agora.');

  const candidatos = safeArray(ret.assinaturaCandidatos).slice(0, 5);
  const candidatosHtml = candidatos.length
    ? candidatos.map(c => `<div class="row"><span>${escapeHtml(c.nome || '—')}</span><b>${safeNumber(c.visitas180d)} visitas · ${centsToBRL(safeNumber(c.gastoMensalMedioCentavos))}/mês</b></div>`).join('')
    : '';

  node.innerHTML = `
    <div class="row"><span>Taxa de rebooking</span><b>${pctText(ret.rebookingRatePct)}</b></div>
    <div class="row"><span>Retenção de novos</span><b>${pctText(novosPct)}</b></div>
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

// Cota-parte do mês corrente (Lei do Salão-Parceiro): só gestão.
async function loadCotaParte() {
  const panel = el('dbCotaPartePanel');
  const node = el('dbCotaParteWidget');
  if (!panel || !node) return;
  const mes = todayStr().slice(0, 7);
  try {
    const r = await api(`/relatorios/cota-parte?mes=${mes}`);
    panel.classList.remove('hidden');
    const linha = (rotulo, v) => `<div class="cota-linha"><span>${escapeHtml(rotulo)}</span><b>${centsToBRL(v)}</b></div>`;
    node.innerHTML = `
      ${r.salaoParceiro ? '' : '<p class="body-sm text-tertiary">Regime de salão-parceiro desligado no cadastro da empresa.</p>'}
      ${linha('Cota-parte do salão', r.cotaParteSalaoCentavos)}
      ${linha('Cota-parte dos profissionais', r.cotaParteProfissionaisCentavos)}
      ${r.profissionais.map(p => linha(`· ${p.nome}`, p.cotaParteCentavos)).join('')}
      <p class="body-sm text-tertiary">${r.comandas} comanda(s) em ${escapeHtml(mes)}. Confirme o enquadramento com seu contador.</p>`;
  } catch (err) {
    panel.classList.add('hidden');
  }
}

// Linhas do mês para o contador (apoio à NFS-e; o sistema não emite nota).
async function exportarParaContador() {
  const msg = el('exportarContadorMsg');
  const mes = todayStr().slice(0, 7);
  const botao = el('btnExportarContador');
  msg.textContent = 'Gerando arquivo…';
  botao.disabled = true;
  try {
    const r = await api(`/relatorios/servicos-prestados?mes=${mes}`);
    if (!r.linhas.length) { msg.textContent = 'Nenhuma comanda fechada neste mês.'; return; }
    const csv = toCsv(
      ['Data', 'Lançamento', 'Comanda', 'Tipo', 'Descrição', 'Profissional', 'Quantidade', 'Valor (R$)', 'Cota-parte profissional (R$)', 'Cota-parte salão (R$)'],
      r.linhas.map(l => [l.data, l.lancamento, l.comandaId, l.tipo, l.descricao, l.profissional, l.quantidade, centsToDecimal(l.valorCentavos), centsToDecimal(l.cotaParteProfissionalCentavos), centsToDecimal(l.cotaParteSalaoCentavos)])
    );
    baixarArquivo(`servicos-prestados-${mes}.csv`, csv);
    msg.textContent = `${r.linhas.length} linha(s) exportada(s). Total ${centsToBRL(r.totais.valorCentavos)}.`;
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    botao.disabled = false;
  }
}

// Piloto — 4 números (auditoria 2026-11 §4): só gestão. Definições no backend
// (engines/insights/piloto.js); aqui só exibe.
const PILOTO_KPIS = [
  ['taxaFalta', 'Taxa de falta'],
  ['reagendamentoCheckout', 'Reagendamento no checkout'],
  ['retornoClienteNovo', 'Retorno do cliente novo (60 dias)'],
  ['confirmacaoPrevia', 'Confirmação prévia (agenda de hoje)']
];

function faixaPiloto(ref) {
  if (!ref || !ref.media) return 'Sem referência de mercado';
  const f = r => (r.max == null ? `${r.min}%+` : `${r.min}–${r.max}%`);
  return `Referência: média ${f(ref.media)}${ref.topo ? `, topo ${f(ref.topo)}` : ''}${ref.melhorQuando === 'menor' ? ' (menor é melhor)' : ''}`;
}

async function loadPiloto() {
  const panel = el('dbPilotoPanel');
  const node = el('dbPilotoWidget');
  if (!panel || !node) return;
  try {
    const r = await api('/relatorios/piloto');
    panel.classList.remove('hidden');
    node.innerHTML = PILOTO_KPIS.map(([chave, rotulo]) => {
      const k = r[chave];
      const valor = k.taxa == null ? 'sem dados suficientes' : `${String(k.taxa).replace('.', ',')}%`;
      const extra = k.emMaturacao ? ` · ${k.emMaturacao} em maturação` : '';
      return `<div class="cota-linha"><span>${escapeHtml(rotulo)}</span><b>${escapeHtml(valor)}</b></div>
        <p class="body-sm text-tertiary">${k.numerador}/${k.denominador}${escapeHtml(extra)} · ${escapeHtml(faixaPiloto(k.referencia))}</p>`;
    }).join('') + `<p class="body-sm text-tertiary">Período ${escapeHtml(formatDDMM(r.periodo.de))} a ${escapeHtml(formatDDMM(r.periodo.ate))}.</p>`;
  } catch (err) {
    panel.classList.add('hidden');
  }
}

async function atualizarInsights() {
  state.insights.loading = true;
  state.insights.error = null;
  
  const status = el('dashboardInsightsStatus');
  if (status) status.innerHTML = '<p class="body-sm text-tertiary">Atualizando indicadores…</p>';
  renderActionStrip();

  const { from, to } = insightRange();

  // Carregamento independente - Progressive Rendering
  // Não trava a UI num Promise.all bloqueante.
  // Margem e caixa são relatório gerencial (RBAC: admin/gestor). Recepção vê o operacional.
  const financeiro = sessionRoleIn('admin', 'gestor');
  if (!financeiro) {
    for (const id of ['dbMarginWidget', 'dbMoneyWidget']) {
      const node = el(id);
      if (node) node.innerHTML = '<div class="widget-restrito">Disponível para administração e gestão.</div>';
    }
  }
  if (financeiro) { loadCotaParte(); loadPiloto(); }
  await Promise.allSettled([
    loadOccupancy(from, to),
    financeiro ? loadMargin(from, to) : Promise.resolve(),
    financeiro ? loadCashflow() : Promise.resolve(),
    loadRetentionAndAttach()
  ]);

  state.insights.loading = false;
  state.insights.updatedAt = new Date().toLocaleTimeString('pt-BR');

  if (status) {
    status.innerHTML = '';
    renderActionStrip();
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
  el('btnExportarContador')?.addEventListener('click', exportarParaContador);

  const actions = el('dashboardActionStrip');
  if (actions) {
    actions.addEventListener('click', (ev) => {
      const abrir = ev.target.closest('[data-dashboard-abrir]');
      if (abrir) {
        const dobra = el(abrir.dataset.dashboardAbrir);
        if (dobra) dobra.open = true;
        const reduzir = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el(abrir.dataset.dashboardFoco)?.scrollIntoView({ behavior: reduzir ? 'auto' : 'smooth', block: 'start' });
        return;
      }
      const btn = ev.target.closest('[data-dashboard-tab]');
      if (!btn) return;
      stateBus.dispatchEvent(new CustomEvent('tab:change', { detail: btn.dataset.dashboardTab }));
    });
  }

  stateBus.addEventListener('caixa:status', (ev) => { caixaHoje = ev.detail; renderActionStrip(); });
  stateBus.addEventListener('agenda:updated', renderActionStrip);

  stateBus.addEventListener('checkout:closed', () => {
    atualizarDashboard();
  });
}

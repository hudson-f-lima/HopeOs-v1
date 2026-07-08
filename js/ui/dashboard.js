import { api } from '../api.js';
import { state, findProfissionalNome, stateBus } from '../state.js';
import { centsToBRL, escapeHtml, showBanner } from '../utils.js';

export async function atualizarDashboard() {
  try {
    const dash = await api('/dashboard');
    document.getElementById('dbReceita').textContent = centsToBRL(dash.kpis.receitaEmpresaCentavos);
    document.getElementById('dbComandos').textContent = dash.kpis.comandos ?? 0;
    document.getElementById('dbComissoes').textContent = centsToBRL(dash.finance.totals.totalComissaoCentavos);
    document.getElementById('dbTicketMedio').textContent = centsToBRL(dash.kpis.ticketMedioCentavos);
    document.getElementById('dashUpdatedAt').textContent = new Date().toLocaleTimeString('pt-BR');

    const porForma = dash.paymentsByMethod || [];
    const formasVisiveis = porForma.slice(0, 5);
    document.getElementById('dbPagamentos').innerHTML = porForma.length
      ? formasVisiveis.map(p => {
          const forma = state.catalog.formas_pagamento.find(f => f.code === p.formaCode);
          return `<div class="row"><span>${escapeHtml(forma ? forma.label : p.formaCode)} (${p.count}x)</span><b>${centsToBRL(p.valorCentavos)}</b></div>`;
        }).join('') + (porForma.length > formasVisiveis.length ? `<p class="list-count-hint">+${porForma.length - formasVisiveis.length} forma(s) no total.</p>` : '')
      : '<p class="empty-state">Nenhum pagamento fechado ainda.</p>';

    const repasses = (dash.finance && dash.finance.repassesPorProfissional) || [];
    const repassesVisiveis = repasses.slice(0, 5);
    document.getElementById('dbRepasses').innerHTML = repasses.length
      ? repassesVisiveis.map(r => `<div class="row"><span>${escapeHtml(findProfissionalNome(r.profissionalId))}</span><b>${centsToBRL((r.comissaoCentavos || 0) + (r.gorjetaLiquidaCentavos || 0))}</b></div>`).join('') + (repasses.length > repassesVisiveis.length ? `<p class="list-count-hint">+${repasses.length - repassesVisiveis.length} profissional(is) no total.</p>` : '')
      : '<p class="empty-state">Nenhum repasse calculado ainda.</p>';
  } catch (err) {
    showBanner('Dashboard: ' + err.message, 'error');
  }
}

export function initDashboard() {
  document.getElementById('btnAtualizarDashboard').addEventListener('click', atualizarDashboard);
  
  stateBus.addEventListener('checkout:closed', () => {
    atualizarDashboard();
  });
}

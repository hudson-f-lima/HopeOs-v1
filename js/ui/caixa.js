// Dashboard > Fechamento de caixa do dia (admin, gestão e recepção).
// Somente leitura: o backend soma o que o checkout gravou e calcula a diferença
// da conferência do dinheiro. Nada é gravado (não há tabela de fechamento).
import { api } from '../api.js';
import { sessionRoleIn } from '../state.js';
import { escapeHtml, centsToBRL } from '../utils.js';

const el = id => document.getElementById(id);
const fmtData = d => { const [a, m, dd] = String(d).split('-'); return `${dd}/${m}/${a}`; };

// "75,50" / "75.50" / "75" → 7550. Vazio → null (sem conferência).
function reaisParaCentavos(texto) {
  const s = String(texto || '').trim().replace(/\s|R\$/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [inteiro, frac = ''] = s.split('.');
  return Number(inteiro) * 100 + Number((frac + '00').slice(0, 2));
}

function renderDiferenca(dinheiro) {
  if (dinheiro.diferencaCentavos === undefined) return '';
  const d = dinheiro.diferencaCentavos;
  const rotulo = d === 0 ? 'Caixa confere' : d > 0 ? 'Sobra no caixa' : 'Falta no caixa';
  const cor = d === 0 ? 'var(--md-primary)' : 'var(--md-error)';
  return `<div class="row total" id="caixaDiferenca" data-diferenca="${d}"><span style="color:${cor}">${rotulo}</span><b style="color:${cor}">${centsToBRL(d)}</b></div>`;
}

function render(f) {
  const formas = f.porForma.length
    ? f.porForma.map(p => `
      <div class="row" data-forma="${escapeHtml(p.formaCode)}">
        <span>${escapeHtml(p.label || p.formaCode)} (${p.quantidadePagamentos}x)${p.taxaCentavos ? ` · taxa ${centsToBRL(p.taxaCentavos)}` : ''}${p.dataRecebimentoPrevista ? ` · recebe ${fmtData(p.dataRecebimentoPrevista)}` : ''}</span>
        <b title="Líquido esperado ${centsToBRL(p.liquidoEsperadoCentavos)}">${centsToBRL(p.valorCentavos)}</b>
      </div>`).join('')
    : '<p class="empty-state">Nenhuma comanda fechada neste dia.</p>';
  el('caixaResultado').innerHTML = `
    <div class="row"><span>Comandas fechadas</span><b id="caixaQtd">${f.quantidadeComandas}</b></div>
    <div class="row"><span>Total recebido (bruto)</span><b id="caixaBruto">${centsToBRL(f.totalBrutoCentavos)}</b></div>
    <div class="row"><span>Taxas de pagamento</span><b>${centsToBRL(f.taxaTotalCentavos)}</b></div>
    <div class="row"><span>Líquido esperado</span><b>${centsToBRL(f.liquidoEsperadoCentavos)}</b></div>
    <div class="row"><span>Gorjetas (bruto)</span><b>${centsToBRL(f.gorjetas.brutaCentavos)}</b></div>
    <h3 class="body-sm text-tertiary" style="margin:10px 0 4px">Por forma de pagamento</h3>
    ${formas}
    <div class="row total"><span>Dinheiro esperado na gaveta</span><b id="caixaEsperado">${centsToBRL(f.dinheiro.esperadoCentavos)}</b></div>
    ${renderDiferenca(f.dinheiro)}
    ${f.ledger.consistente ? '' : '<p class="body-sm" style="color:var(--md-error)">Atenção: pagamentos e movimentos de caixa do dia não batem. Avise a gestão.</p>'}
    <p class="list-count-hint">Conferência só na tela: o fechamento não é salvo. Prazo de recebimento conforme o cadastro atual da forma.</p>`;
}

export async function atualizarCaixa() {
  if (!sessionRoleIn('admin', 'gestor', 'recepcao')) return;
  const erro = el('caixaErro');
  erro.textContent = '';
  const params = new URLSearchParams();
  if (el('caixaData').value) params.set('data', el('caixaData').value);
  const contado = reaisParaCentavos(el('caixaContado').value);
  if (Number.isNaN(contado)) { erro.textContent = 'Valor contado inválido. Use, por exemplo, 150,00.'; return; }
  if (contado !== null) params.set('contadoDinheiroCentavos', String(contado));
  try {
    const qs = params.toString();
    const f = await api(`/caixa/fechamento${qs ? `?${qs}` : ''}`);
    if (!el('caixaData').value) el('caixaData').value = f.data;
    render(f);
  } catch (err) {
    erro.textContent = err.message;
  }
}

export function initCaixa() {
  if (!sessionRoleIn('admin', 'gestor', 'recepcao')) return;
  el('cardCaixa')?.classList.remove('hidden');
  el('caixaForm').addEventListener('submit', ev => { ev.preventDefault(); atualizarCaixa(); });
  el('caixaData').addEventListener('change', atualizarCaixa);
}

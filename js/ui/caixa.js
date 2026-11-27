// Dashboard > Fechamento de caixa do dia (admin, gestão e recepção).
// O backend soma o que o checkout gravou, mais fundo de troco, sangrias e suprimentos,
// e calcula a diferença. "Conferir" só mostra; "Fechar caixa" grava (D-017): cada
// fechamento é imutável e fechar de novo o mesmo dia grava outro — vale o mais recente.
import { api } from '../api.js';
import { sessionRoleIn, stateBus, sessionPode } from '../state.js';
import { escapeHtml, centsToBRL, genIdempotencyKey, confirmAction, todayStr } from '../utils.js';
import { criarSeletorPeriodo, rotuloPeriodo, diasNoIntervalo } from './periodo.js';

const el = id => document.getElementById(id);
const fmtData = d => { const [a, m, dd] = String(d).split('-'); return `${dd}/${m}/${a}`; };

// "75,50" / "75.50" / "75" → 7550. Vazio → null (sem conferência).
export function reaisParaCentavos(texto) {
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

function renderUltimoFechamento(f) {
  const u = f.ultimoFechamento;
  if (!u) return '<p class="body-sm text-tertiary" id="caixaStatusFechamento" data-fechado="0">Dia ainda não fechado.</p>';
  const aviso = u.desatualizado ? ' Houve movimento depois: feche de novo.' : '';
  const cor = u.desatualizado || u.diferencaCentavos !== 0 ? 'var(--md-error)' : 'var(--md-primary)';
  return `<p class="body-sm" id="caixaStatusFechamento" data-fechado="1" data-desatualizado="${u.desatualizado ? 1 : 0}" data-diferenca-gravada="${u.diferencaCentavos}" style="color:${cor}">Fechado com ${centsToBRL(u.contadoDinheiroCentavos)} contados (diferença ${centsToBRL(u.diferencaCentavos)}).${aviso}${f.quantidadeFechamentos > 1 ? ` ${f.quantidadeFechamentos} fechamentos neste dia.` : ''}</p>`;
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
    ${f.estornos && f.estornos.quantidadeMovimentos ? `
    <div class="row" id="caixaEstornos" data-estornos="${f.estornos.valorCentavos}"><span style="color:var(--md-error)">Estornos lançados no dia (${f.estornos.porForma.map(p => escapeHtml(p.formaCode)).join(', ')})</span><b style="color:var(--md-error)">${centsToBRL(f.estornos.valorCentavos)}</b></div>
    <div class="row"><span>Saldo do dia (vendas − estornos)</span><b id="caixaSaldoDia">${centsToBRL(f.saldoDoDiaCentavos)}</b></div>` : ''}
    ${f.fundoTrocoCentavos ? `<div class="row"><span>Fundo de troco</span><b>${centsToBRL(f.fundoTrocoCentavos)}</b></div>` : ''}
    ${f.ajustes && f.ajustes.itens.length ? f.ajustes.itens.map(a => `<div class="row" data-ajuste="${escapeHtml(a.tipo)}"><span>${a.tipo === 'sangria' ? 'Sangria' : 'Suprimento'} · ${escapeHtml(a.motivo)}</span><b>${centsToBRL(a.tipo === 'sangria' ? -a.valorCentavos : a.valorCentavos)}</b></div>`).join('') : ''}
    <div class="row total"><span>Dinheiro esperado na gaveta</span><b id="caixaEsperado" data-esperado="${f.dinheiro.esperadoCentavos}">${centsToBRL(f.dinheiro.esperadoCentavos)}</b></div>
    ${renderDiferenca(f.dinheiro)}
    ${renderUltimoFechamento(f)}
    ${f.ledger.consistente ? '' : '<p class="body-sm" style="color:var(--md-error)">Atenção: pagamentos e movimentos de caixa do dia não batem. Avise a gestão.</p>'}
    <p class="list-count-hint">"Conferir" só mostra. "Fechar caixa do dia" grava o valor contado e a diferença. Prazo de recebimento conforme o cadastro atual da forma.</p>`;
}

// Período do caixa (D-088): um dia = conferir e fechar, como sempre; mais de um dia = só consulta
// (GET /caixa/periodo). Fechar continua sendo de um dia.
let seletor = null;
const diaEscolhido = () => { const p = seletor.periodo(); return p.inicio === p.fim ? p.inicio : null; };

function modoPeriodo(ehPeriodo) {
  el('caixaForm').classList.toggle('hidden', ehPeriodo);
  el('btnFecharCaixa').classList.toggle('hidden', ehPeriodo);
  el('caixaFechamentoMsg').textContent = '';
}

function renderPeriodo(r) {
  const t = r.totais;
  const n = diasNoIntervalo(r.inicio, r.fim);
  const formas = t.porForma.length
    ? t.porForma.map(p => `<div class="row" data-forma="${escapeHtml(p.formaCode)}"><span>${escapeHtml(p.label || p.formaCode)} (${p.quantidadePagamentos}x)${p.taxaCentavos ? ` · taxa ${centsToBRL(p.taxaCentavos)}` : ''}</span><b>${centsToBRL(p.valorCentavos)}</b></div>`).join('')
    : '<p class="empty-state">Nenhuma comanda fechada neste período.</p>';
  const situacao = d => !d.quantidadeComandas && !d.fechamento ? '' : !d.fechamento ? '<span style="color:var(--md-error)">sem fechar</span>'
    : d.fechamento.desatualizado ? '<span style="color:var(--md-error)">fechado, mas mudou depois</span>'
    : d.fechamento.diferencaCentavos ? `<span style="color:var(--md-error)">fechado com diferença de ${centsToBRL(d.fechamento.diferencaCentavos)}</span>` : 'fechado, confere';
  const dias = r.dias.map(d => `<div class="row" data-dia-caixa="${escapeHtml(d.data)}"><span>${escapeHtml(rotuloPeriodo(d.data, d.data))} · ${d.quantidadeComandas} ${d.quantidadeComandas === 1 ? 'comanda' : 'comandas'}${situacao(d) ? ' · ' + situacao(d) : ''}</span><b>${centsToBRL(d.saldoDoDiaCentavos)}</b></div>`).join('');
  el('caixaResultado').innerHTML = `
    <p class="aviso-periodo" id="caixaAvisoPeriodo" role="status"><b>Período de ${n} dias: só consulta.</b> Para conferir a gaveta e fechar o caixa, escolha um dia.</p>
    <div class="row"><span>Comandas fechadas</span><b id="caixaQtd">${t.quantidadeComandas}</b></div>
    <div class="row"><span>Total recebido (bruto)</span><b id="caixaBruto">${centsToBRL(t.totalBrutoCentavos)}</b></div>
    <div class="row"><span>Taxas de pagamento</span><b>${centsToBRL(t.taxaTotalCentavos)}</b></div>
    <div class="row"><span>Líquido esperado</span><b>${centsToBRL(t.liquidoEsperadoCentavos)}</b></div>
    ${t.estornosCentavos ? `<div class="row"><span style="color:var(--md-error)">Estornos lançados</span><b style="color:var(--md-error)">${centsToBRL(t.estornosCentavos)}</b></div>` : ''}
    <div class="row total"><span>Saldo do período (vendas − estornos)</span><b id="caixaSaldoPeriodo">${centsToBRL(t.saldoCentavos)}</b></div>
    ${t.sangriasCentavos || t.suprimentosCentavos ? `<div class="row"><span>Sangrias / suprimentos</span><b>${centsToBRL(-t.sangriasCentavos)} / ${centsToBRL(t.suprimentosCentavos)}</b></div>` : ''}
    <h3 class="body-sm text-tertiary" style="margin:10px 0 4px">Por forma de pagamento</h3>
    ${formas}
    <h3 class="body-sm text-tertiary" style="margin:10px 0 4px">Dia a dia</h3>
    <p class="body-sm" id="caixaPendencias" style="margin:0 0 4px;${t.diasComVendaSemFechar || t.diasFechadosDesatualizados ? 'color:var(--md-error)' : ''}">${t.diasComVendaSemFechar || t.diasFechadosDesatualizados
      ? `${t.diasComVendaSemFechar ? t.diasComVendaSemFechar + (t.diasComVendaSemFechar === 1 ? ' dia com venda sem fechar' : ' dias com venda sem fechar') : ''}${t.diasComVendaSemFechar && t.diasFechadosDesatualizados ? ' · ' : ''}${t.diasFechadosDesatualizados ? t.diasFechadosDesatualizados + (t.diasFechadosDesatualizados === 1 ? ' fechamento desatualizado' : ' fechamentos desatualizados') : ''}.`
      : 'Todos os dias com venda estão fechados.'}</p>
    ${dias || '<p class="empty-state">Sem movimento no período.</p>'}
    ${t.ledgerConsistente ? '' : '<p class="body-sm" style="color:var(--md-error)">Atenção: em algum dia, pagamentos e movimentos de caixa não batem. Abra o dia para ver.</p>'}`;
}

export async function atualizarCaixa() {
  if (!sessionPode('caixa:conferir')) return;
  const erro = el('caixaErro');
  erro.textContent = '';
  const dia = diaEscolhido();
  modoPeriodo(!dia);
  if (!dia) {
    const { inicio, fim } = seletor.periodo();
    try { renderPeriodo(await api(`/caixa/periodo?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`)); }
    catch (err) { erro.textContent = err.message; }
    return;
  }
  const params = new URLSearchParams();
  params.set('data', dia);
  const contado = reaisParaCentavos(el('caixaContado').value);
  if (Number.isNaN(contado)) { erro.textContent = 'Valor contado inválido. Use, por exemplo, 150,00.'; return; }
  if (contado !== null) params.set('contadoDinheiroCentavos', String(contado));
  const fundo = reaisParaCentavos(el('caixaFundo').value);
  if (Number.isNaN(fundo)) { erro.textContent = 'Fundo de troco inválido. Use, por exemplo, 100,00.'; return; }
  if (fundo !== null) params.set('fundoTrocoCentavos', String(fundo));
  try {
    const qs = params.toString();
    const f = await api(`/caixa/fechamento${qs ? `?${qs}` : ''}`);
    if (!hojeDoSalao) hojeDoSalao = todayStr();
    render(f);
    if (f.data === hojeDoSalao) {
      const u = f.ultimoFechamento;
      stateBus.dispatchEvent(new CustomEvent('caixa:status', { detail: { comandas: f.quantidadeComandas, fechado: !!u, desatualizado: !!(u && u.desatualizado) } }));
    }
  } catch (err) {
    erro.textContent = err.message;
  }
}

// Uma chave por intenção: se a rede cair e a pessoa tentar de novo, não grava duas vezes.
const chaves = { fechamento: null, ajuste: null };
let hojeDoSalao = null;

async function fecharCaixa() {
  const msg = el('caixaFechamentoMsg');
  msg.textContent = '';
  const contado = reaisParaCentavos(el('caixaContado').value);
  const fundo = reaisParaCentavos(el('caixaFundo').value);
  if (contado === null || Number.isNaN(contado)) { msg.textContent = 'Informe o dinheiro contado para fechar o caixa.'; return; }
  if (Number.isNaN(fundo)) { msg.textContent = 'Fundo de troco inválido.'; return; }
  const ok = await confirmAction({ title: 'Fechar caixa do dia', message: `Gravar o fechamento com ${centsToBRL(contado)} contados? O registro não pode ser alterado depois; para corrigir, feche de novo.`, confirmLabel: 'Fechar caixa' });
  if (!ok) return;
  const botao = el('btnFecharCaixa');
  botao.disabled = true;
  chaves.fechamento = chaves.fechamento || genIdempotencyKey();
  try {
    const body = { contadoDinheiroCentavos: contado, fundoTrocoCentavos: fundo || 0, idempotencyKey: chaves.fechamento };
    const dia = diaEscolhido();
    if (!dia) { msg.textContent = 'Escolha um dia para fechar o caixa.'; return; }
    body.data = dia;
    const r = await api('/caixa/fechamentos', { method: 'POST', body });
    chaves.fechamento = null;
    msg.textContent = r.diferencaCentavos === 0 ? 'Caixa fechado. Confere.' : `Caixa fechado com diferença de ${centsToBRL(r.diferencaCentavos)}.`;
    await atualizarCaixa();
  } catch (err) {
    if (err.status && err.status < 500) chaves.fechamento = null;
    msg.textContent = err.message;
  } finally { botao.disabled = false; }
}

async function lancarAjuste() {
  const msg = el('caixaAjusteMsg');
  msg.textContent = '';
  const valor = reaisParaCentavos(el('caixaAjusteValor').value);
  const motivo = el('caixaAjusteMotivo').value.trim();
  if (valor === null || Number.isNaN(valor) || valor <= 0) { msg.textContent = 'Informe o valor. Use, por exemplo, 50,00.'; return; }
  if (motivo.length < 3) { msg.textContent = 'Informe o motivo (pelo menos 3 letras).'; return; }
  const botao = el('btnLancarAjuste');
  botao.disabled = true;
  chaves.ajuste = chaves.ajuste || genIdempotencyKey();
  try {
    await api('/caixa/ajustes', { method: 'POST', body: { tipo: el('caixaAjusteTipo').value, valorCentavos: valor, motivo, idempotencyKey: chaves.ajuste } });
    chaves.ajuste = null;
    el('caixaAjusteValor').value = ''; el('caixaAjusteMotivo').value = '';
    msg.textContent = 'Lançado.';
    await atualizarCaixa();
  } catch (err) {
    if (err.status && err.status < 500) chaves.ajuste = null;
    msg.textContent = err.message;
  } finally { botao.disabled = false; }
}

export function initCaixa() {
  if (!sessionPode('caixa:conferir')) return;
  el('cardCaixa')?.classList.remove('hidden');
  el('btnFecharCaixa').addEventListener('click', fecharCaixa);
  el('caixaAjusteForm').addEventListener('submit', ev => { ev.preventDefault(); lancarAjuste(); });
  el('caixaForm').addEventListener('submit', ev => { ev.preventDefault(); atualizarCaixa(); });
  seletor = criarSeletorPeriodo(el('caixaPeriodo'), { tipo: 'passado', hoje: todayStr, aoMudar: atualizarCaixa, rotulo: 'Período do caixa' });
}

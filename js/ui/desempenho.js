// Indicadores por colaborador (D-029), na aba Ganhos. Gestão (admin e gestor) vê a
// pessoa escolhida; o profissional vê só os seus. Só mostra o que o servidor calculou:
// mês, mês anterior e média do salão. Sem nota, ranking, rótulo ou cor de julgamento.
import { api } from '../api.js';
import { escapeHtml, centsToBRL } from '../utils.js';

const el = id => document.getElementById(id);
const pct = v => (v == null ? '—' : `${String(v).replace('.', ',')}%`);
const reais = v => (v == null ? '—' : centsToBRL(v));
const num = v => (v == null ? '—' : String(v));

function janelaRetorno() {
  try { const v = localStorage.getItem('hopeos.retornoDias'); return ['60', '90', '120'].includes(v) ? v : '60'; } catch (_) { return '60'; }
}

const taxa = k => {
  if (!k || k.denominador === 0) return 'sem casos';
  return `${pct(k.taxa)} (${k.numerador} de ${k.denominador})${k.amostraPequena ? ' · amostra pequena' : ''}`;
};

function render(d) {
  const a = d.atual; const ant = d.mesAnterior; const m = d.mediaSalao;
  const linhas = [
    ['Atendimentos', num(a.atendimentos), ant ? num(ant.atendimentos) : '—', num(m.atendimentos)],
    ['Faturamento em serviços', reais(a.faturamentoCentavos), ant ? reais(ant.faturamentoCentavos) : '—', reais(m.faturamentoCentavos)],
    ['Produtos vendidos', `${reais(a.produtosCentavos)} · ${a.produtosQuantidade} un.`, ant ? reais(ant.produtosCentavos) : '—', reais(m.produtosCentavos)],
    ['Ticket médio', reais(a.ticketMedioCentavos), ant ? reais(ant.ticketMedioCentavos) : '—', reais(m.ticketMedioCentavos)],
    ['Ocupação da agenda', pct(a.ocupacao.pct), ant ? pct(ant.ocupacao.pct) : '—', pct(m.ocupacaoPct)],
    ['Faltas dos clientes', taxa(a.taxaFalta), ant ? taxa(ant.taxaFalta) : '—', pct(m.taxaFalta)],
    ['Reagendamento no fechamento', taxa(a.reagendamento), ant ? taxa(ant.reagendamento) : '—', pct(m.reagendamento)],
    [`Clientes novos que voltaram (${d.retornoDias} dias)`, taxa(a.retornoNovos), ant ? taxa(ant.retornoNovos) : '—', pct(m.retornoNovos)]
  ];
  const c = a.retornoNovos.categorias;
  el('desempenhoTabela').innerHTML = `
    <div class="desempenho-cab" aria-hidden="true"><span></span><span>Este mês</span><span>Mês anterior</span><span>Média do salão</span></div>
    ${linhas.map(([rotulo, atual, anterior, media]) => `
      <div class="desempenho-linha" role="group" aria-label="${escapeHtml(rotulo)}">
        <span class="desempenho-rotulo">${escapeHtml(rotulo)}</span>
        <span data-col="atual"><small>Este mês</small>${escapeHtml(atual)}</span>
        <span data-col="anterior"><small>Mês anterior</small>${escapeHtml(anterior)}</span>
        <span data-col="media"><small>Média do salão</small>${escapeHtml(media)}</span>
      </div>`).join('')}
    ${a.retornoNovos.denominador ? `<p class="body-sm text-tertiary" data-retorno-individual>Clientes novos atendidos neste mês: voltaram com a mesma pessoa ${c.voltouMesmoProfissional} · com outra ${c.voltouOutroProfissional}${c.voltouSemInfoProfissional ? ` · sem profissional registrado ${c.voltouSemInfoProfissional}` : ''} · não voltaram ${c.naoVoltou}.</p>` : ''}
    <p class="list-count-hint">Comparação com o próprio mês anterior e com a média do salão (${m.profissionaisConsiderados} profissional(is) com movimento). Taxas com menos de ${d.amostraMinima} casos aparecem como amostra pequena. Sem nota nem classificação: é apoio para conversa, e qualquer decisão é de uma pessoa.</p>`;
}

export async function atualizarDesempenho(mes, profissionalId) {
  const bloco = el('desempenhoBloco');
  if (!bloco) return;
  el('desempenhoErro').textContent = '';
  try {
    const q = new URLSearchParams({ mes, retornoDias: janelaRetorno() });
    if (profissionalId) q.set('profissionalId', profissionalId);
    render(await api(`/desempenho/profissional?${q}`));
    bloco.classList.remove('hidden');
  } catch (err) {
    el('desempenhoTabela').innerHTML = '';
    el('desempenhoErro').textContent = err.message;
    bloco.classList.remove('hidden');
  }
}

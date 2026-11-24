import { escapeHtml } from '../utils.js';

const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const percentual = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export const atualizandoOcupacao = 'Dados de ocupação em atualização.';
export const notaEscalaHistorica = 'A escala atual foi aplicada às datas passadas.';
export const temOcupacaoRealizada = dados => Boolean(dados && Object.hasOwn(dados, 'ocupacaoRealizadaPct'));
export const minutosTxt = valor => Number.isFinite(valor) ? numero.format(valor) + ' min' : 'Indisponível';
export const ocupacaoPctTxt = valor => Number.isFinite(valor) ? percentual.format(valor) + '%' : 'Sem escala para calcular';

export function resumoOcupacao(dados) {
  if (!temOcupacaoRealizada(dados)) return { valor: 'Em atualização', base: '' };
  return {
    valor: ocupacaoPctTxt(dados.ocupacaoRealizadaPct),
    base: minutosTxt(dados.minutosRealizados) + ' em serviços para ' + minutosTxt(dados.minutosDisponiveis) + ' disponíveis'
  };
}

export function detalheOcupacao(dados) {
  if (!temOcupacaoRealizada(dados)) return '';
  const linhas = [
    ['Preenchimento realizado da grade', ocupacaoPctTxt(dados.preenchimentoGradePct)],
    ['Tempo preenchido na grade', minutosTxt(dados.minutosPreenchidos)],
    ['Fora da escala', minutosTxt(dados.minutosForaDaEscala)],
    ['Sobreposição de serviços', minutosTxt(dados.minutosSobrepostos)],
    ['Tempo sem horário confiável', minutosTxt(dados.minutosSemHorario)]
  ];
  const foraDaEscala = [
    ['Antes do expediente', dados.minutosAntesExpediente],
    ['Após o expediente', dados.minutosAposExpediente],
    ['Em dia sem expediente', dados.minutosSemExpediente],
    ['Em pausas ou bloqueios', dados.minutosEmPausasBloqueios]
  ].filter(([, valor]) => valor > 0);
  const notas = [
    dados.coberturaParcial && 'Cobertura parcial. Preenchimento, sobreposição e tempo fora da escala consideram os serviços com horário e duração identificados.',
    dados.minutosDuracaoPrevista > 0 && minutosTxt(dados.minutosDuracaoPrevista) + ' usam a duração prevista do serviço concluído.',
    dados.servicosSemDuracao > 0 && 'Serviços com duração ausente: ' + numero.format(dados.servicosSemDuracao) + '.',
    dados.pendenciasVinculo > 0 && 'Pendências de vínculo entre agenda e comanda: ' + numero.format(dados.pendenciasVinculo) + '.',
    dados.capacidadeHistoricaEstimada && notaEscalaHistorica
  ];
  const linhasHtml = valores => valores.map(([rotulo, valor]) =>
    '<div><dt>' + escapeHtml(rotulo) + '</dt><dd>' + escapeHtml(valor) + '</dd></div>'
  ).join('');
  return '<details class="ocupacao-detalhe"><summary>Detalhes da ocupação</summary>'
    + '<dl>' + linhasHtml(linhas) + '</dl>'
    + (foraDaEscala.length ? '<h4>Onde houve trabalho fora da escala</h4><dl>'
      + linhasHtml(foraDaEscala.map(([rotulo, valor]) => [rotulo, minutosTxt(valor)])) + '</dl>' : '')
    + (dados.minutosForaDaEscala > 0 && dados.minutosSobrepostos > 0
      ? '<p>O mesmo minuto pode contar como sobreposto e fora da escala.</p>' : '')
    + notas.filter(Boolean).map(nota => '<p>' + escapeHtml(nota) + '</p>').join('')
    + '</details>';
}

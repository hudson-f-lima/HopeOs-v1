// Desempenho do salão, D-070. As vendas permanecem na data da comanda e as
// reversões na data do estorno. Devolver dinheiro não desfaz uma visita.
const { sumCents } = require('../money');
const { itensNegativos } = require('../EstornoEngine');
const { financeiroDoIntervalo, ticketDoPeriodo, ocupacaoDoPeriodo } = require('./metricasPeriodo');
const { atendimentosDe, ATENDIDO, FIDELIDADE_JANELA_DIAS, FIDELIDADE_VISITAS } = require('./piloto');
const { addDays, isClosedCommand } = require('./retention');

function computeDesempenhoSalao({ inicio, fim, comandos, comandoItens, estornos, estornoItens, agendamentos, profissionais, empresa, producao }) {
  const noPeriodo = r => r.data >= inicio && r.data <= fim;
  const fechadas = comandos.filter(isClosedCommand);
  const vendas = fechadas.filter(noPeriodo);
  const devolucoes = estornos.filter(noPeriodo);
  const idsVendas = new Set(vendas.map(c => c.id));
  // Ticket da coorte (D-071): estorno de venda de outro período não muda o ticket deste.
  const ticket = ticketDoPeriodo({ comandos: vendas, estornos: devolucoes }, inicio, fim);
  const { receita: faturamentoCentavos, receitaEmpresa: parteSalaoCentavos } = financeiroDoIntervalo({ comandos: vendas, estornos: devolucoes }, inicio, fim);

  const itens = comandoItens.filter(i => idsVendas.has(i.comando_id))
    .concat(itensNegativos({ estornos: devolucoes, estornoItens, comandoItens }));
  const parteSalaoServicosCentavos = sumCents(itens.filter(i => i.tipo === 'servico'), 'receita_empresa_centavos');
  const produtosUnidades = sumCents(itens.filter(i => i.tipo === 'produto'), 'quantidade');
  const comissoesCentavos = sumCents(vendas, 'total_comissao_centavos') - sumCents(devolucoes, 'comissao_centavos');
  const taxasItensCentavos = sumCents(vendas, 'taxa_servico_centavos');
  // O estorno reduz receita da empresa por valor - comissão. No ledger financeiro
  // não há crédito do custo nem da taxa original (o movimento de estoque é separado).
  const custoProdutosVendidosCentavos = sumCents(vendas, 'total_custo_produtos_centavos');
  const diferencaConciliacaoCentavos = faturamentoCentavos - parteSalaoCentavos - comissoesCentavos - taxasItensCentavos - custoProdutosVendidosCentavos;
  // De onde vem a diferença (D-071). Pela 009, o estorno tira da parte do salão "valor − comissão +
  // taxa da gorjeta devolvida": a taxa e o custo da venda original ficam como perda do salão, e a taxa
  // da gorjeta é a única parcela sem linha própria. Ela vem do que o estorno REGISTROU (bruta − líquida),
  // não de uma conta por diferença: se os totais não fecharem, o resto aparece em outraDiferenca.
  const taxaGorjetaEstornadaCentavos = devolucoes.reduce((s, e) =>
    s + (Number(e.gorjeta_bruta_centavos) || 0) - (Number(e.gorjeta_liquida_centavos) || 0), 0);
  const outraDiferencaCentavos = diferencaConciliacaoCentavos - taxaGorjetaEstornadaCentavos;

  const comServico = new Set(comandoItens.filter(i => i.tipo === 'servico').map(i => i.comando_id));
  const comandasServico = fechadas.filter(c => comServico.has(c.id));
  const visitas = atendimentosDe(agendamentos, comandasServico, []);
  const visitasPeriodo = visitas.filter(noPeriodo);
  const clientes = new Set(visitasPeriodo.map(v => v.clienteId));
  const limite = addDays(fim, -FIDELIDADE_JANELA_DIAS);
  const diasPorCliente = new Map();
  for (const v of visitas) {
    if (clientes.has(v.clienteId) && v.data > limite && v.data <= fim) {
      diasPorCliente.set(v.clienteId, (diasPorCliente.get(v.clienteId) || 0) + 1);
    }
  }
  const agendaPeriodo = agendamentos.filter(noPeriodo);
  const atendimentosSemCliente = agendaPeriodo.some(a => !a.cliente_id && ATENDIDO.includes(a.status))
    || comandasServico.some(c => !c.cliente_id && noPeriodo(c));
  const ocupacao = ocupacaoDoPeriodo({ ...(producao || { agendamentos, comandos, comandoItens }), profissionais, empresa }, inicio, fim);
  const { minutosDisponiveis } = ocupacao;
  return {
    inicio, fim, faturamentoCentavos, comandas: ticket.comandas, ticketMedioCentavos: ticket.ticketMedioCentavos,
    estornosVendasAnterioresCentavos: ticket.estornosVendasAnterioresCentavos,
    visitasIdentificadas: visitasPeriodo.length, atendimentosSemCliente, produtosUnidades, ...ocupacao,
    clientesIdentificados: clientes.size, clientesFieis: [...diasPorCliente.values()].filter(n => n >= FIDELIDADE_VISITAS).length,
    parteSalaoServicosCentavos,
    parteSalaoServicosPorHoraCentavos: minutosDisponiveis ? Math.round(parteSalaoServicosCentavos * 60 / minutosDisponiveis) : null,
    resultadoFinanceiro: { faturamentoCentavos, parteSalaoCentavos, comissoesCentavos, taxasItensCentavos, custoProdutosVendidosCentavos, diferencaConciliacaoCentavos,
      taxaGorjetaEstornadaCentavos, outraDiferencaCentavos }
  };
}

module.exports = { computeDesempenhoSalao };

// Desempenho do salão, D-070. As vendas permanecem na data da comanda e as
// reversões na data do estorno. Devolver dinheiro não desfaz uma visita.
const { sumCents } = require('../money');
const { itensNegativos, comandasEstornadasTotal } = require('../EstornoEngine');
const { financeiroDoIntervalo } = require('./cockpit');
const { computeLoadFactor } = require('./occupancy');
const { atendimentosDe, ATENDIDO, FIDELIDADE_JANELA_DIAS, FIDELIDADE_VISITAS } = require('./piloto');
const { addDays, isClosedCommand } = require('./retention');

function computeDesempenhoSalao({ inicio, fim, comandos, comandoItens, estornos, estornoItens, agendamentos, profissionais, empresa }) {
  const noPeriodo = r => r.data >= inicio && r.data <= fim;
  const fechadas = comandos.filter(isClosedCommand);
  const vendas = fechadas.filter(noPeriodo);
  const devolucoes = estornos.filter(noPeriodo);
  const idsVendas = new Set(vendas.map(c => c.id));
  const totaisEstornadas = comandasEstornadasTotal(devolucoes);
  const comandas = vendas.filter(c => !totaisEstornadas.has(c.id)).length;
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
  const { minutosVendidos: minutosOcupados, minutosDisponiveis } = computeLoadFactor(agendaPeriodo, profissionais, inicio, fim, empresa);
  return {
    inicio, fim, faturamentoCentavos, comandas, ticketMedioCentavos: comandas ? Math.round(faturamentoCentavos / comandas) : null,
    visitasIdentificadas: visitasPeriodo.length, atendimentosSemCliente, produtosUnidades, minutosOcupados, minutosDisponiveis,
    clientesIdentificados: clientes.size, clientesFieis: [...diasPorCliente.values()].filter(n => n >= FIDELIDADE_VISITAS).length,
    parteSalaoServicosCentavos,
    parteSalaoServicosPorHoraCentavos: minutosDisponiveis ? Math.round(parteSalaoServicosCentavos * 60 / minutosDisponiveis) : null,
    resultadoFinanceiro: { faturamentoCentavos, parteSalaoCentavos, comissoesCentavos, taxasItensCentavos, custoProdutosVendidosCentavos, diferencaConciliacaoCentavos }
  };
}

module.exports = { computeDesempenhoSalao };

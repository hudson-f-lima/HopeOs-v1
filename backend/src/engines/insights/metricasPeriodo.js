// Fonte única das métricas de um período [de, ate] (D-071). O Cockpit e o Desempenho do salão
// usam estas funções; nenhuma tela recalcula faturamento, ticket ou ocupação por conta própria.
// Regras:
//   - dinheiro em centavos inteiros; venda pela data da comanda, estorno pela data do estorno (D-013);
//   - só comandas fechadas contam;
//   - sem base para uma razão, o campo é null (D-065), nunca 0 inventado.
const { ocupacaoDoPeriodo, ocupacaoPorProfissionalDia, somarOcupacao } = require('./ocupacaoRealizada');
const { isClosedCommand } = require('./retention');
const { comandasEstornadasTotal } = require('../EstornoEngine');

const dia = v => (v ? String(v).slice(0, 10) : '');
const soma = (lista, campo) => lista.reduce((s, x) => s + (Number(x[campo]) || 0), 0);
const dentro = (de, ate) => x => dia(x.data) >= de && dia(x.data) <= ate;

// Visão de caixa do período: vendas do período menos estornos feitos no período (de qualquer venda).
function financeiroDoIntervalo({ comandos, estornos }, de, ate) {
  const cs = (comandos || []).filter(isClosedCommand).filter(dentro(de, ate));
  const es = (estornos || []).filter(dentro(de, ate));
  const receita = soma(cs, 'itens_liquidos_centavos') - soma(es, 'itens_centavos');
  const receitaEmpresa = soma(cs, 'receita_empresa_centavos') - soma(es, 'receita_empresa_centavos');
  const recebido = soma(cs, 'total_recebido_centavos') - soma(es, 'reembolso_centavos');
  const taxas = soma(cs, 'taxa_total_centavos');
  return { receita, receitaEmpresa, recebido, taxas, comandas: cs.length };
}

// Ticket da coorte: só as vendas do período e os estornos DELAS. Estorno de venda de um período
// anterior não mexe no ticket deste; aparece à parte (estornosVendasAnterioresCentavos).
function ticketDoPeriodo({ comandos, estornos }, de, ate) {
  const vendas = (comandos || []).filter(isClosedCommand).filter(dentro(de, ate));
  const ids = new Set(vendas.map(c => c.id));
  const doPeriodo = (estornos || []).filter(dentro(de, ate));
  const daCoorte = doPeriodo.filter(e => ids.has(e.comando_id));
  const totais = comandasEstornadasTotal(daCoorte);
  const validas = vendas.filter(c => !totais.has(c.id));
  const idsValidas = new Set(validas.map(c => c.id));
  const liquido = soma(validas, 'itens_liquidos_centavos') - soma(daCoorte.filter(e => idsValidas.has(e.comando_id)), 'itens_centavos');
  return {
    comandas: validas.length,
    valorCentavos: liquido,
    ticketMedioCentavos: validas.length ? Math.round(liquido / validas.length) : null,
    estornosVendasAnterioresCentavos: soma(doPeriodo.filter(e => !ids.has(e.comando_id)), 'itens_centavos')
  };
}

module.exports = { financeiroDoIntervalo, ticketDoPeriodo, ocupacaoDoPeriodo, ocupacaoPorProfissionalDia, somarOcupacao };

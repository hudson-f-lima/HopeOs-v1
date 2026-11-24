// Fonte única das métricas de um período [de, ate] (D-071). O Cockpit e o Desempenho do salão
// usam estas funções; nenhuma tela recalcula faturamento, ticket ou ocupação por conta própria.
// Regras:
//   - dinheiro em centavos inteiros; venda pela data da comanda, estorno pela data do estorno (D-013);
//   - só comandas fechadas contam;
//   - sem base para uma razão, o campo é null (D-065), nunca 0 inventado.
const { OCUPA, datasDoPeriodo, minutosDisponiveis } = require('./occupancy');
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

// Ocupação: minutos ocupados DENTRO da escala sobre os minutos da escala. Por profissional e dia, o que
// passa do expediente (atendimento num dia fechado, de profissional inativo, ou além das horas do dia)
// vai para minutosForaDaEscala: não infla a ocupação e aparece para o gestor conferir a escala.
function ocupacaoDoPeriodo({ agendamentos, profissionais, empresa }, de, ate) {
  const ativos = (profissionais || []).filter(p => p && p.ativo !== false);
  const idsAtivos = new Set(ativos.map(p => p.id));
  const porProfDia = new Map();
  for (const a of agendamentos || []) {
    const d = dia(a.data);
    if (d < de || d > ate || !OCUPA.includes(a.status)) continue;
    const k = a.profissional_id + '|' + d;
    porProfDia.set(k, (porProfDia.get(k) || 0) + Number(a.duracao_min || a.duracaoMin || 30));
  }
  let ocupados = 0; let disponiveis = 0; let fora = 0;
  for (const data of datasDoPeriodo(de, ate)) {
    for (const p of ativos) {
      const disp = minutosDisponiveis(p, empresa || {}, data);
      const usados = porProfDia.get(p.id + '|' + data) || 0;
      disponiveis += disp;
      ocupados += Math.min(usados, disp);
      fora += Math.max(0, usados - disp);
    }
  }
  for (const [k, minutos] of porProfDia) if (!idsAtivos.has(k.split('|')[0])) fora += minutos;
  return {
    minutosOcupados: ocupados,
    minutosDisponiveis: disponiveis,
    minutosForaDaEscala: fora,
    ocupacaoPct: disponiveis ? Math.round((ocupados / disponiveis) * 1000) / 10 : null
  };
}

module.exports = { financeiroDoIntervalo, ticketDoPeriodo, ocupacaoDoPeriodo };

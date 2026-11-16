// Comissão dos atendimentos de assinatura e margem por plano (Onda A, fase 3; D-044, revisto em
// D-045). Puro, sem gravar: calculado do que já está no banco (cobranças e usos da 022).
//
// Unidade: cada CICLO PAGO de cada assinante (decisão do dono, D-045, opção A).
//   valor líquido = mensalidade paga − taxa da forma de pagamento (taxa_pct e taxa_fixa da forma).
//   rateio        % do plano × valor líquido, dividido entre os profissionais que atenderam ESTE
//                 assinante NESTE ciclo, pela quantidade de atendimentos cobertos (sem sobra de
//                 centavo). Ciclo pago sem atendimento: nada a dividir (fica com o salão).
//   tabela        por atendimento coberto do ciclo: % de comissão do serviço × valor de tabela.
//   fixo_por_uso  por atendimento coberto do ciclo: o valor fixo do plano.
// Liberação (só a liberada entra no saldo a pagar): no dia seguinte ao fim do ciclo E depois do
// prazo de recebimento da forma (dias_recebimento contados do pagamento), o que vier por último.
// Antes disso a comissão é "prevista". Ciclo ainda não pago: os atendimentos ficam "aguardando
// pagamento" (sem valor de rateio). Ficam de fora: uso estornado e uso fora da regra (já teve
// comissão normal sobre o valor cobrado na comanda, decisão do dono).
const { allocateProportional } = require('./allocation');
const { cicloDe, somarDias } = require('./AssinaturaCicloEngine');

const n = v => Number(v || 0);
const dia = d => String(d || '').slice(0, 10);

function taxaDaForma(forma, valor) {
  if (!forma) return 0;
  return Math.round(valor * n(forma.taxa_pct ?? forma.taxaPct) / 100 + n(forma.taxa_fixa_centavos ?? forma.taxaFixaCentavos));
}

// Cada ciclo (pago ou com atendimento) de cada assinatura, com a comissão por profissional e o estado.
function unidadesDeComissao({ planos = [], assinaturas = [], cobrancas = [], usos = [], usosEstornos = [], comandoItens = [], formasPagamento = [], hoje }) {
  const estornados = new Set(usosEstornos.map(e => e.uso_id));
  const itemPorId = new Map(comandoItens.map(i => [i.id, i]));
  const formaPorCode = new Map(formasPagamento.map(f => [f.code, f]));
  const unidades = new Map(); // assinaturaId|cicloInicio
  const unidade = (a, cicloInicio) => {
    const k = a.id + '|' + cicloInicio;
    if (!unidades.has(k)) unidades.set(k, { assinatura: a, cicloInicio, cobranca: null, usos: [] });
    return unidades.get(k);
  };
  const assPorId = new Map(assinaturas.map(a => [a.id, a]));
  for (const c of cobrancas) {
    const a = assPorId.get(c.assinatura_id);
    if (a && c.estado === 'paga' && c.pago_em) unidade(a, dia(c.ciclo_inicio)).cobranca = c;
  }
  for (const u of usos) {
    const a = assPorId.get(u.assinatura_id);
    if (a && u.tipo === 'coberto' && !estornados.has(u.id)) unidade(a, dia(u.ciclo_inicio)).usos.push(u);
  }
  const lista = [];
  for (const un of unidades.values()) {
    const a = un.assinatura;
    const plano = planos.find(p => p.id === a.plano_id) || {};
    const regra = plano.comissao_regra || 'rateio';
    const ciclo = cicloDe(a.inicio, plano.periodicidade || 'mensal', un.cicloInicio) || { inicio: un.cicloInicio, fim: un.cicloInicio };
    const contagem = new Map();
    for (const u of un.usos) contagem.set(u.profissional_id, (contagem.get(u.profissional_id) || 0) + 1);
    const profs = [...contagem.keys()].sort();
    const c = un.cobranca;
    const forma = c ? formaPorCode.get(c.forma) : null;
    const bruto = c ? n(c.valor_centavos) : 0;
    const taxa = c ? taxaDaForma(forma, bruto) : 0;
    const liquido = bruto - taxa;
    const distribuicao = new Map();
    let pool = null;
    if (regra === 'rateio') {
      if (c) {
        pool = Math.round(liquido * n(plano.comissao_percentual) / 100);
        if (profs.length) allocateProportional(pool, profs, p => contagem.get(p)).forEach((v, i) => distribuicao.set(profs[i], v));
      }
    } else {
      for (const u of un.usos) {
        const v = regra === 'fixo_por_uso' ? n(plano.comissao_fixa_centavos)
          : Math.round(n(u.valor_tabela_centavos) * n((itemPorId.get(u.comando_item_id) || {}).comissao_pct) / 100);
        distribuicao.set(u.profissional_id, (distribuicao.get(u.profissional_id) || 0) + v);
      }
    }
    const fimMais1 = somarDias(ciclo.fim, 1);
    const recebe = c ? somarDias(dia(c.pago_em), n(forma && forma.dias_recebimento)) : null;
    const liberaEm = c ? (recebe > fimMais1 ? recebe : fimMais1) : null;
    const estado = !c ? 'aguardando_pagamento' : (hoje >= liberaEm ? 'liberada' : 'prevista');
    const comissao = [...distribuicao.values()].reduce((s, v) => s + v, 0);
    lista.push({
      assinaturaId: a.id, clienteId: a.cliente_id, planoId: plano.id || a.plano_id, planoNome: plano.nome || null, regra,
      cicloInicio: ciclo.inicio, cicloFim: ciclo.fim, estado, liberaEm, pagoEm: c ? dia(c.pago_em) : null,
      forma: c ? (c.forma || null) : null, formaConhecida: Boolean(forma), brutoCentavos: bruto, taxaCentavos: taxa, liquidoCentavos: liquido,
      poolCentavos: pool, naoDistribuidoCentavos: regra === 'rateio' && c && !profs.length ? pool : 0,
      comissaoCentavos: comissao, margemCentavos: liquido - comissao, atendimentos: un.usos.length,
      valorTabelaConsumidoCentavos: un.usos.reduce((s, u) => s + n(u.valor_tabela_centavos), 0),
      profissionais: profs.map(p => ({ profissionalId: p, atendimentos: contagem.get(p), comissaoCentavos: distribuicao.get(p) || 0 }))
    });
  }
  return lista.sort((x, y) => String(x.liberaEm || '9999').localeCompare(String(y.liberaEm || '9999')) || x.cicloInicio.localeCompare(y.cicloInicio));
}

// Para os ganhos e o saldo: liberada no mês (mes '' = todas até hoje) e prevista (em aberto hoje).
function comissaoDoProfissional({ profissionalId, mes = '', ...dados }) {
  const unidades = unidadesDeComissao(dados);
  let liberada = 0; let prevista = 0; let aguardando = 0;
  for (const u of unidades) {
    const p = u.profissionais.find(x => x.profissionalId === profissionalId);
    if (!p) continue;
    if (u.estado === 'liberada' && String(u.liberaEm).startsWith(mes)) liberada += p.comissaoCentavos;
    else if (u.estado === 'prevista') prevista += p.comissaoCentavos;
    else if (u.estado === 'aguardando_pagamento') aguardando += p.atendimentos;
  }
  return { liberadaCentavos: liberada, previstaCentavos: prevista, atendimentosAguardandoPagamento: aguardando };
}

// Relatório do mês por plano: unidades liberadas no mês (o que vira pagamento) + o que está em aberto.
function relatorioPorPlano({ mes, ...dados }) {
  const unidades = unidadesDeComissao(dados);
  const doMes = unidades.filter(u => u.estado === 'liberada' && String(u.liberaEm).startsWith(mes));
  const porPlano = new Map();
  for (const u of doMes) {
    if (!porPlano.has(u.planoId)) porPlano.set(u.planoId, { planoId: u.planoId, planoNome: u.planoNome, regra: u.regra, ciclos: 0, brutoCentavos: 0, taxaCentavos: 0, liquidoCentavos: 0, comissaoCentavos: 0, margemCentavos: 0, naoDistribuidoCentavos: 0, atendimentos: 0, valorTabelaConsumidoCentavos: 0, profissionais: new Map() });
    const p = porPlano.get(u.planoId);
    p.ciclos += 1;
    for (const k of ['brutoCentavos', 'taxaCentavos', 'liquidoCentavos', 'comissaoCentavos', 'margemCentavos', 'naoDistribuidoCentavos', 'atendimentos', 'valorTabelaConsumidoCentavos']) p[k] += u[k] || 0;
    for (const x of u.profissionais) {
      const atual = p.profissionais.get(x.profissionalId) || { profissionalId: x.profissionalId, atendimentos: 0, comissaoCentavos: 0 };
      atual.atendimentos += x.atendimentos; atual.comissaoCentavos += x.comissaoCentavos;
      p.profissionais.set(x.profissionalId, atual);
    }
  }
  const planos = [...porPlano.values()].map(p => ({ ...p, profissionais: [...p.profissionais.values()] }));
  const emAberto = unidades.filter(u => u.estado !== 'liberada').map(u => ({ planoNome: u.planoNome, assinaturaId: u.assinaturaId, clienteId: u.clienteId, cicloInicio: u.cicloInicio, cicloFim: u.cicloFim, estado: u.estado, liberaEm: u.liberaEm, comissaoCentavos: u.comissaoCentavos, atendimentos: u.atendimentos }));
  return { planos, emAberto, unidadesDoMes: doMes };
}

// Assinantes que usaram mais (em valor de tabela) do que pagam no mês: sinal para rever o plano,
// nunca ação automática (desenho, §5).
function acimaDoPreco({ planos = [], assinaturas = [], usos = [], usosEstornos = [], mes }) {
  const estornados = new Set(usosEstornos.map(e => e.uso_id));
  const consumo = new Map();
  for (const u of usos) {
    if (estornados.has(u.id) || String(u.data).slice(0, 7) !== mes) continue;
    consumo.set(u.assinatura_id, (consumo.get(u.assinatura_id) || 0) + n(u.valor_tabela_centavos));
  }
  return assinaturas.map(a => {
    const plano = planos.find(p => p.id === a.plano_id) || {};
    const mensal = n(plano.preco_centavos) / ({ mensal: 1, trimestral: 3, semestral: 6, anual: 12 }[plano.periodicidade] || 1);
    return { assinaturaId: a.id, clienteId: a.cliente_id, planoId: a.plano_id, consumoCentavos: consumo.get(a.id) || 0, mensalidadeCentavos: Math.round(mensal) };
  }).filter(x => x.consumoCentavos > x.mensalidadeCentavos);
}

module.exports = { unidadesDeComissao, comissaoDoProfissional, relatorioPorPlano, acimaDoPreco, taxaDaForma };

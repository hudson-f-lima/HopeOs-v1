// Cockpit do gestor (D-064): "resposta, não relatório". Função pura: recebe o que já está gravado
// e devolve 4 indicadores, alertas com o porquê e a próxima ação, a equipe e as bases do simulador.
// Regras:
//   - dinheiro em centavos inteiros; estorno entra no mês DO estorno (D-013);
//   - todo número vem com o contexto (comparação, amostra); sem dado, o campo é null — nunca inventado;
//   - alerta só aparece quando a regra dispara (nada de "operação estável" para completar a lista);
//   - "impacto" é sempre uma estimativa rotulada, com a conta explicada em `porque`.
const occupancy = require('./occupancy');
const { financeiroDoIntervalo, ocupacaoDoPeriodo } = require('./metricasPeriodo');
const { situacao } = require('../AssinaturaCicloEngine');

const MESES_POR_PERIODO = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const TARDE = { de: 13, ate: 18 }; // horas cheias [13h, 18h)
const JANELA_DIAS = 28;             // 4 de cada dia da semana
const MIN_DIAS_PROJECAO = 7;

const dia = v => (v ? String(v).slice(0, 10) : '');
const somaDias = (data, n) => { const d = new Date(`${data}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const diasNoMes = mes => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
const mesAnterior = mes => { const y = Number(mes.slice(0, 4)); const m = Number(mes.slice(5, 7)); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const soma = (lista, campo) => lista.reduce((s, x) => s + (Number(x[campo]) || 0), 0);
const num = v => String(v).replace('.', ',');
const brl = c => 'R$ ' + (Math.round(c) / 100).toFixed(2).replace('.', ',');

// Receita e margem de um intervalo: fonte única em metricasPeriodo (D-071).
function faturamento({ comandos, estornos, metas }, mes, hoje) {
  const inicio = `${mes}-01`;
  const decorridos = Number(hoje.slice(8, 10));
  const total = diasNoMes(mes);
  const atual = financeiroDoIntervalo({ comandos, estornos }, inicio, hoje);
  const ant = mesAnterior(mes);
  const fimAntMesmoPeriodo = `${ant}-${String(Math.min(decorridos, diasNoMes(ant))).padStart(2, '0')}`;
  const anterior = financeiroDoIntervalo({ comandos, estornos }, `${ant}-01`, fimAntMesmoPeriodo);
  const metasDoMes = metas.filter(m => m.mes === mes && (m.tipo === 'faturamento' || m.tipo === 'produtos'));
  const metaCentavos = metasDoMes.length ? soma(metasDoMes, 'valor_alvo') : null;
  const projecao = decorridos >= MIN_DIAS_PROJECAO ? Math.round((atual.receita / decorridos) * total) : null;
  return {
    realizadoCentavos: atual.receita,
    metaCentavos,
    metaPct: metaCentavos ? pct(atual.receita, metaCentavos) : null,
    projecaoCentavos: projecao,
    projecaoNota: projecao === null ? `Projeção a partir do dia ${MIN_DIAS_PROJECAO} (amostra pequena).` : `Ritmo de ${decorridos} dia(s) levado aos ${total} dias do mês.`,
    mesmoPeriodoAnteriorCentavos: anterior.receita,
    variacaoPct: anterior.receita ? pct(atual.receita - anterior.receita, anterior.receita) : null,
    comandas: atual.comandas,
    _atual: atual,
    _anterior: anterior
  };
}

function margem(fat) {
  const a = fat._atual; const b = fat._anterior;
  return {
    margemCentavos: a.receitaEmpresa,
    margemPct: pct(a.receitaEmpresa, a.receita),
    taxasCentavos: a.taxas,
    taxasPctDoRecebido: pct(a.taxas, a.recebido),
    taxasPctAnterior: pct(b.taxas, b.recebido)
  };
}

// Ocupação dos últimos 28 dias (passados) por dia da semana e à tarde; mais a ociosidade.
function ocupacao({ agendamentos, profissionais, empresa }, hoje) {
  const ativos = profissionais.filter(p => p.ativo !== false);
  const de = somaDias(hoje, -JANELA_DIAS);
  const ate = somaDias(hoje, -1);
  const geral = occupancy.computeLoadFactor(agendamentos, ativos, de, ate, empresa);
  const heat = occupancy.computeHeatmap(agendamentos, ativos, de, ate, empresa);
  // O heatmap traz % por (dia, hora); para somar minutos refazemos por dia com computeLoadFactor.
  const porDia = Array.from({ length: 7 }, (_, dow) => ({ dow, nome: DIAS_SEMANA[dow], vendidos: 0, disponiveis: 0 }));
  for (const data of occupancy.datasDoPeriodo(de, ate)) {
    const lf = occupancy.computeLoadFactor(agendamentos, ativos, data, data, empresa);
    const d = porDia[new Date(`${data}T00:00:00Z`).getUTCDay()];
    d.vendidos += lf.minutosVendidos; d.disponiveis += lf.minutosDisponiveis;
  }
  const dias = porDia.map(d => ({
    dow: d.dow, nome: d.nome, aberto: d.disponiveis > 0, ocupacaoPct: d.disponiveis ? pct(d.vendidos, d.disponiveis) : null,
    tardePct: (() => {
      const h = heat.filter(x => x.dow === d.dow && x.hora >= TARDE.de && x.hora < TARDE.ate);
      return h.length && d.disponiveis ? Math.round(h.reduce((s, x) => s + x.ocupacaoPct, 0) / h.length) : null;
    })(),
    minutosOciosos: Math.max(0, d.disponiveis - d.vendidos)
  }));
  return {
    janela: { de, ate },
    ocupacaoPct: geral.minutosDisponiveis ? geral.loadFactorPct : null,
    minutosVendidos: geral.minutosVendidos,
    minutosDisponiveis: geral.minutosDisponiveis,
    minutosOciosos: Math.max(0, geral.minutosDisponiveis - geral.minutosVendidos),
    porDia: dias
  };
}

function mensalDoPlano(plano) { return Math.round((Number(plano.preco_centavos) || 0) / (MESES_POR_PERIODO[plano.periodicidade] || 1)); }

function recorrencia({ assinaturas, planos, cobrancas }, mes, hoje) {
  const planoDe = new Map(planos.map(p => [p.id, p]));
  let ativos = 0; let mrr = 0; let atrasados = 0; let emAberto = 0;
  const atrasadosLista = [];
  const vigentes = new Set();
  for (const a of assinaturas) {
    const plano = planoDe.get(a.plano_id);
    if (!plano) continue;
    const sit = situacao({ assinatura: a, plano, cobrancas: cobrancas.filter(c => c.assinatura_id === a.id), hoje });
    if (sit.podeUsar) { ativos++; mrr += mensalDoPlano(plano); vigentes.add(a.cliente_id); }
    if (sit.estado === 'atrasada' || sit.estado === 'suspensa') {
      atrasados++; emAberto += sit.valorEmAbertoCentavos || 0;
      atrasadosLista.push({ assinaturaId: a.id, clienteId: a.cliente_id, dias: sit.maiorAtrasoDias, estado: sit.estado });
    }
  }
  const canceladasNoMes = assinaturas.filter(a => a.status === 'cancelada' && dia(a.cancelada_em).slice(0, 7) === mes).length;
  return {
    ativos, mrrCentavos: mrr, atrasados, valorEmAbertoCentavos: emAberto, canceladasNoMes,
    churnPct: ativos + canceladasNoMes ? pct(canceladasNoMes, ativos + canceladasNoMes) : null,
    _vigentes: vigentes, _atrasados: atrasadosLista
  };
}

// Receita por minuto vendido nos últimos 28 dias: base para estimar o que vale uma hora livre.
function receitaPorMinuto({ comandos, estornos }, occ) {
  const f = financeiroDoIntervalo({ comandos, estornos }, occ.janela.de, occ.janela.ate);
  return occ.minutosVendidos > 0 && f.receita > 0 ? f.receita / occ.minutosVendidos : null;
}

function computeCockpit(input) {
  const { hoje } = input;
  const mes = hoje.slice(0, 7);
  const entrada = {
    comandos: input.comandos || [], estornos: input.estornos || [], metas: input.metas || [],
    agendamentos: input.agendamentos || [], profissionais: input.profissionais || [], empresa: input.empresa || {},
    assinaturas: input.assinaturas || [], planos: input.planos || [], cobrancas: input.cobrancas || [],
    clientes: input.clientes || [], listaEspera: input.listaEspera || [], comandoItens: input.comandoItens || [],
    estornoItens: input.estornoItens || []
  };
  const fat = faturamento(entrada, mes, hoje);
  const mar = margem(fat);
  const occ = ocupacao(entrada, hoje);
  // Card "Ocupação da agenda": mesmo período e mesma regra do Desempenho do salão (D-071).
  const ocupacaoMes = { de: `${mes}-01`, ate: hoje, ...ocupacaoDoPeriodo(entrada, `${mes}-01`, hoje) };
  const rec = recorrencia(entrada, mes, hoje);
  const rpm = receitaPorMinuto(entrada, occ);
  const nomeCli = new Map(entrada.clientes.map(c => [c.id, c.nome]));
  const alertas = [];

  // 1. Gargalo: dia aberto abaixo de 50% nas últimas 4 semanas. Usa a tarde (13h–18h) quando o dia
  //    tem expediente à tarde; senão, o dia inteiro (salão que só abre de manhã também tem gargalo).
  const candidatos = occ.porDia.filter(d => d.aberto && d.ocupacaoPct !== null)
    .map(d => ({ ...d, valor: d.tardePct !== null ? d.tardePct : d.ocupacaoPct, tarde: d.tardePct !== null }));
  const pior = candidatos.slice().sort((a, b) => a.valor - b.valor || b.minutosOciosos - a.minutosOciosos)[0];
  if (pior && pior.valor < 50) {
    const ocioSemana = Math.round(pior.minutosOciosos / 4);
    const impacto = rpm ? Math.round(ocioSemana * rpm) : null;
    const nomeDia = pior.nome[0].toUpperCase() + pior.nome.slice(1);
    alertas.push({
      id: 'gargalo_ocupacao', nivel: 'alta',
      titulo: `${nomeDia}${pior.tarde ? ' à tarde' : ''}: ${num(pior.valor)}% ocupada`,
      porque: (pior.tarde ? `Média das últimas 4 semanas entre ${TARDE.de}h e ${TARDE.ate}h.` : 'Média das últimas 4 semanas, o dia inteiro.') +
        ` São cerca de ${Math.round(ocioSemana / 60)} h livres por semana nesse dia` +
        (impacto !== null ? ` — ${brl(impacto)} por semana ao preço médio do minuto vendido (${brl(rpm * 60)} por hora).` : '.'),
      impactoCentavos: impacto, acao: { rotulo: 'Ver horários livres', destino: 'agenda', dow: pior.dow }
    });
  }

  // 2. Avulsos frequentes: 2+ comandas nos últimos 30 dias, sem assinatura vigente.
  const de30 = somaDias(hoje, -30);
  const contagem = new Map();
  entrada.comandos.filter(c => c.cliente_id && dia(c.data) >= de30 && dia(c.data) <= hoje)
    .forEach(c => contagem.set(c.cliente_id, (contagem.get(c.cliente_id) || 0) + 1));
  const avulsos = [...contagem].filter(([id, n]) => n >= 2 && !rec._vigentes.has(id)).map(([id, n]) => ({ clienteId: id, nome: nomeCli.get(id) || 'Cliente', visitas: n }));
  const planosAVenda = entrada.planos.filter(p => p.arquivado_em == null && p.disponivel_venda !== false);
  const maisBarato = planosAVenda.length ? planosAVenda.reduce((m, p) => (mensalDoPlano(p) < mensalDoPlano(m) ? p : m)) : null;
  if (avulsos.length && maisBarato) {
    const potencial = avulsos.length * mensalDoPlano(maisBarato);
    alertas.push({
      id: 'avulsos_frequentes', nivel: 'media',
      titulo: `${avulsos.length} cliente(s) avulso(s) vieram 2+ vezes em 30 dias`,
      porque: `Sem assinatura vigente. Se todos assinassem o plano mais barato à venda (${maisBarato.nome}, ${brl(mensalDoPlano(maisBarato))}/mês), seriam ${brl(potencial)} por mês de receita recorrente.`,
      impactoCentavos: potencial, acao: { rotulo: 'Ver planos e assinantes', destino: 'assinaturas' },
      clientes: avulsos.sort((a, b) => b.visitas - a.visitas).slice(0, 10)
    });
  }

  // 3. Assinantes atrasados.
  if (rec.atrasados) {
    alertas.push({
      id: 'assinantes_atrasados', nivel: rec._atrasados.some(a => a.estado === 'suspensa') ? 'alta' : 'media',
      titulo: `${rec.atrasados} assinante(s) com pagamento atrasado`,
      porque: `${brl(rec.valorEmAbertoCentavos)} em aberto. Passada a tolerância do plano, a assinatura é suspensa e o cliente deixa de usar.`,
      impactoCentavos: rec.valorEmAbertoCentavos, acao: { rotulo: 'Cobrar assinantes', destino: 'assinaturas' },
      clientes: rec._atrasados.map(a => ({ clienteId: a.clienteId, nome: nomeCli.get(a.clienteId) || 'Cliente', dias: a.dias }))
    });
  }

  // 4. Profissional saturado: 90%+ nas últimas 4 semanas e pedidos na lista de espera para ele.
  const ativosProf = entrada.profissionais.filter(p => p.ativo !== false);
  const estornosDoMes = new Set(entrada.estornos.filter(e => dia(e.data).slice(0, 7) === mes).map(e => e.id));
  const itensServicoDe = new Map(entrada.comandoItens.filter(i => i.tipo === 'servico').map(i => [i.id, i.profissional_id]));
  const equipe = ativosProf.map(p => {
    const sur = occupancy.computeSur({ agendamentos: entrada.agendamentos, profissional: p, empresa: entrada.empresa, dataInicio: occ.janela.de, dataFim: occ.janela.ate });
    const metaFat = entrada.metas.filter(m => m.mes === mes && m.tipo === 'faturamento' && m.profissional_id === p.id);
    const comandasMes = new Set(entrada.comandos.filter(c => dia(c.data).slice(0, 7) === mes).map(c => c.id));
    // Serviços do profissional no mês, menos os itens dele estornados NO mês (estorno conta no mês do estorno).
    const vendido = entrada.comandoItens.filter(i => i.tipo === 'servico' && i.profissional_id === p.id && comandasMes.has(i.comando_id)).reduce((s, i) => s + (Number(i.valor_liquido_centavos) || 0), 0);
    const estornado = entrada.estornoItens.filter(x => estornosDoMes.has(x.estorno_id) && itensServicoDe.get(x.comando_item_id) === p.id).reduce((s, x) => s + (Number(x.valor_liquido_centavos) || 0), 0);
    const realizado = vendido - estornado;
    const espera = entrada.listaEspera.filter(e => ['aguardando', 'contatado'].includes(e.status) && e.profissional_id === p.id).length;
    return {
      profissionalId: p.id, nome: p.nome,
      ocupacaoPct: sur.minutoDisponivel ? sur.surPct : null,
      metaPct: metaFat.length ? pct(realizado, soma(metaFat, 'valor_alvo')) : null,
      naEspera: espera
    };
  });
  equipe.filter(e => e.ocupacaoPct !== null && e.ocupacaoPct >= 90 && e.naEspera > 0).forEach(e => {
    alertas.push({
      id: 'profissional_saturado:' + e.profissionalId, nivel: 'media',
      titulo: `${e.nome}: ${e.ocupacaoPct}% ocupado e ${e.naEspera} na espera`,
      porque: 'Agenda quase cheia nas últimas 4 semanas e clientes esperando por esse profissional. Abrir mais horário na escala converte a espera em atendimento.',
      impactoCentavos: null, acao: { rotulo: 'Ajustar escala', destino: 'escalas', profissionalId: e.profissionalId }
    });
  });

  // 5. Taxas subiram (pontos percentuais do recebido) vs. o mesmo período do mês anterior.
  if (mar.taxasPctDoRecebido !== null && mar.taxasPctAnterior !== null && mar.taxasPctDoRecebido - mar.taxasPctAnterior >= 1) {
    alertas.push({
      id: 'taxas_subiram', nivel: 'media',
      titulo: `Taxas de pagamento: ${String(mar.taxasPctDoRecebido).replace('.', ',')}% do recebido`,
      porque: `No mesmo período do mês passado eram ${String(mar.taxasPctAnterior).replace('.', ',')}%. Mais cartão (crédito/parcelado) no lugar de Pix ou dinheiro.`,
      impactoCentavos: null, acao: { rotulo: 'Ver formas de pagamento', destino: 'financeiro' }
    });
  }

  // 6. Faltas nos últimos 30 dias.
  const faltas = entrada.agendamentos.filter(a => a.status === 'no_show' && dia(a.data) >= de30 && dia(a.data) < hoje);
  const minFalta = faltas.reduce((s, a) => s + (Number(a.duracao_min) || 30), 0);
  if (faltas.length >= 2) {
    const impacto = rpm ? Math.round(minFalta * rpm) : null;
    alertas.push({
      id: 'faltas', nivel: faltas.length >= 5 ? 'alta' : 'info',
      titulo: `${faltas.length} falta(s) nos últimos 30 dias`,
      porque: `${Math.round(minFalta / 60 * 10) / 10} h de cadeira perdidas` + (impacto !== null ? `, cerca de ${brl(impacto)} ao preço médio do minuto vendido.` : '.') + ' A régua de faltas e os lembretes reduzem isso.',
      impactoCentavos: impacto, acao: { rotulo: 'Regras da agenda', destino: 'regras' }
    });
  }

  const ordem = { alta: 0, media: 1, info: 2 };
  alertas.sort((a, b) => ordem[a.nivel] - ordem[b.nivel] || (b.impactoCentavos || 0) - (a.impactoCentavos || 0));

  // Saúde: só com base no que disparou (sem nota inventada).
  const saude = alertas.some(a => a.nivel === 'alta') ? 'atencao' : alertas.length ? 'ok_com_pontos' : 'ok';

  const { _atual, _anterior, ...faturamentoPublico } = fat;
  return {
    mes, hoje, saude,
    faturamento: faturamentoPublico,
    margem: mar,
    ocupacao: occ,
    ocupacaoMes,
    recorrencia: { ativos: rec.ativos, mrrCentavos: rec.mrrCentavos, atrasados: rec.atrasados, valorEmAbertoCentavos: rec.valorEmAbertoCentavos, canceladasNoMes: rec.canceladasNoMes, churnPct: rec.churnPct,
      pctDaReceita: fat.realizadoCentavos ? pct(rec.mrrCentavos, fat.realizadoCentavos) : null },
    alertas,
    equipe,
    simulador: {
      avulsosFrequentes: avulsos.length,
      planoMaisBaratoMensalCentavos: maisBarato ? mensalDoPlano(maisBarato) : null,
      minutosOciosos28d: occ.minutosOciosos,
      minutosFalta30d: minFalta,
      receitaPorMinutoCentavos: rpm === null ? null : Math.round(rpm * 100) / 100
    }
  };
}

module.exports = { computeCockpit, financeiroDoIntervalo, mensalDoPlano, DIAS_SEMANA };

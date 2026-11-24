// Cockpit do gestor (D-064): "resposta, não relatório". Função pura: recebe o que já está gravado
// e devolve 4 indicadores, alertas com o porquê e a próxima ação, a equipe e as bases do simulador.
// Regras:
//   - dinheiro em centavos inteiros; estorno entra no mês DO estorno (D-013);
//   - todo número vem com o contexto (comparação, amostra); sem dado, o campo é null — nunca inventado;
//   - alerta só aparece quando a regra dispara (nada de "operação estável" para completar a lista);
//   - "impacto" é sempre uma estimativa rotulada, com a conta explicada em `porque`.
const occupancy = require('./occupancy');
const { financeiroDoIntervalo, ocupacaoPorProfissionalDia, somarOcupacao } = require('./metricasPeriodo');
const { intersecao } = require('../DisponibilidadeEngine');
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

// As quatro semanas completas excluem hoje. A produção tem a mesma regra do
// indicador mensal; a grade e as janelas livres consideram também as reservas.
function ocupacao(entrada, hoje, minutoAtual) {
  const de = somaDias(hoje, -JANELA_DIAS);
  const ate = somaDias(hoje, -1);
  const inicioMes = hoje.slice(0, 7) + '-01';
  const deFaltas = somaDias(hoje, -30);
  const realizadas = ocupacaoPorProfissionalDia(entrada, deFaltas < inicioMes ? deFaltas : inicioMes, hoje);
  const grade = occupancy.analisarGrade(entrada, deFaltas, somaDias(hoje, 6), { realizadas, hoje, minutoAtual });
  const semanas = realizadas.filter(r => r.data >= de && r.data <= ate);
  const gradeSemanas = grade.filter(r => r.data >= de && r.data <= ate);
  const porProf = Map.groupBy(semanas, r => r.profissionalId);
  const gradeProf = Map.groupBy(gradeSemanas, r => r.profissionalId);
  const producao = somarOcupacao(semanas);
  const grade28 = occupancy.totaisGrade(gradeSemanas);
  const faixaTarde = { start: TARDE.de * 60, end: TARDE.ate * 60 };
  const slot = Number(entrada.empresa.slot_padrao) || 30;
  const porDiaSemana = Map.groupBy(semanas, l => new Date(l.data + 'T00:00:00Z').getUTCDay());
  const porDia = DIAS_SEMANA.map((nome, dow) => {
    const servicos = somarOcupacao(porDiaSemana.get(dow) || []);
    const linhas = gradeSemanas.filter(l => l.dow === dow);
    const dia = occupancy.totaisGrade(linhas);
    const tarde = occupancy.totaisGrade(linhas, faixaTarde, slot);
    const futuras = grade.filter(l => l.dow === dow && l.data >= hoje);
    const proxima = futuras.find(l => (tarde.minutosDisponiveis ? intersecao(l.livres, [faixaTarde]) : l.livres)
      .some(i => i.end - i.start >= slot));
    return {
      dow, nome, aberto: servicos.minutosDisponiveis > 0, minutosDisponiveis: servicos.minutosDisponiveis,
      minutosRealizados: servicos.minutosRealizados, ocupacaoRealizadaPct: servicos.ocupacaoRealizadaPct,
      ocupacaoPct: dia.preenchimentoGradePct, tardePct: tarde.preenchimentoGradePct,
      minutosOciosos: dia.minutosLivres, minutosOciososTarde: tarde.minutosLivres, proximaDataLivre: proxima?.data || null
    };
  });
  return {
    historico: {
      janela: { de, ate }, ...producao,
      ocupacaoPct: grade28.preenchimentoGradePct, minutosVendidos: grade28.minutosGradeOcupada,
      minutosOciosos: grade28.minutosLivres, porDia
    },
    mensal: { de: inicioMes, ate: hoje, ...somarOcupacao(realizadas.filter(l => l.data >= inicioMes)) },
    porProf, gradeProf, minutosFalta30d: soma(grade.filter(l => l.data < hoje), 'minutosLivresComFalta')
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
  return occ.minutosRealizados > 0 && f.receita > 0 ? f.receita / occ.minutosRealizados : null;
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
  const { historico: occ, mensal: ocupacaoMes, porProf, gradeProf, minutosFalta30d } = ocupacao(entrada, hoje, input.minutoAtual || 0);
  const rec = recorrencia(entrada, mes, hoje);
  const rpm = receitaPorMinuto(entrada, occ);
  const nomeCli = new Map(entrada.clientes.map(c => [c.id, c.nome]));
  const alertas = [];

  // 1. Gargalo: dia aberto abaixo de 50% nas últimas 4 semanas. Usa a tarde (13h–18h) quando o dia
  //    tem expediente à tarde; senão, o dia inteiro (salão que só abre de manhã também tem gargalo).
  const candidatos = occ.porDia.filter(d => d.proximaDataLivre && d.ocupacaoPct !== null).map(d => {
    const tarde = d.tardePct !== null;
    return { ...d, tarde, valor: tarde ? d.tardePct : d.ocupacaoPct, livres: tarde ? d.minutosOciososTarde : d.minutosOciosos };
  });
  const pior = candidatos.filter(c => c.livres > 0).sort((a, b) => a.valor - b.valor || b.livres - a.livres)[0];
  if (pior && pior.valor < 50) {
    const ocioSemana = Math.round(pior.livres / 4);
    const impacto = rpm ? Math.round(ocioSemana * rpm) : null;
    const nomeDia = pior.nome[0].toUpperCase() + pior.nome.slice(1);
    alertas.push({
      id: 'gargalo_ocupacao', nivel: 'alta',
      titulo: `${nomeDia}${pior.tarde ? ' à tarde' : ''}: ${num(pior.valor)}% ocupada`,
      porque: (pior.tarde ? `Média das últimas 4 semanas entre ${TARDE.de}h e ${TARDE.ate}h.` : 'Média das últimas 4 semanas, o dia inteiro.') +
        ` Foram cerca de ${num(Math.round(ocioSemana / 60 * 10) / 10)} h livres por semana nessa faixa` +
        (impacto !== null ? ` — ${brl(impacto)} por semana pela receita média do período por minuto realizado (${brl(rpm * 60)} por hora).` : '.'),
      impactoCentavos: impacto, acao: { rotulo: 'Ver horários livres', destino: 'agenda', dow: pior.dow, data: pior.proximaDataLivre }
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
  const comandasMes = new Set(entrada.comandos.filter(c => dia(c.data).slice(0, 7) === mes).map(c => c.id));
  const itensServicoDe = new Map();
  const vendidoPorProf = new Map();
  for (const i of entrada.comandoItens) {
    if (i.tipo !== 'servico') continue;
    itensServicoDe.set(i.id, i.profissional_id);
    if (comandasMes.has(i.comando_id)) vendidoPorProf.set(i.profissional_id, (vendidoPorProf.get(i.profissional_id) || 0) + (Number(i.valor_liquido_centavos) || 0));
  }
  for (const e of entrada.estornoItens) {
    const id = itensServicoDe.get(e.comando_item_id);
    if (id && estornosDoMes.has(e.estorno_id)) vendidoPorProf.set(id, (vendidoPorProf.get(id) || 0) - (Number(e.valor_liquido_centavos) || 0));
  }
  const esperaPorProf = Map.groupBy(entrada.listaEspera.filter(e => ['aguardando', 'contatado'].includes(e.status)), e => e.profissional_id);
  const metasPorProf = Map.groupBy(entrada.metas.filter(m => m.mes === mes && m.tipo === 'faturamento'), m => m.profissional_id);
  const equipe = ativosProf.map(p => {
    const exec = somarOcupacao(porProf.get(p.id) || []);
    const grade = occupancy.totaisGrade(gradeProf.get(p.id) || []);
    const metaFat = metasPorProf.get(p.id) || [];
    const realizado = vendidoPorProf.get(p.id) || 0;
    const espera = esperaPorProf.get(p.id)?.length || 0;
    return {
      profissionalId: p.id, nome: p.nome,
      ocupacaoRealizadaPct: exec.ocupacaoRealizadaPct, minutosRealizados: exec.minutosRealizados, minutosDisponiveis: exec.minutosDisponiveis,
      ocupacaoPct: grade.preenchimentoGradePct,
      metaPct: metaFat.length ? pct(realizado, soma(metaFat, 'valor_alvo')) : null,
      naEspera: espera
    };
  });
  equipe.filter(e => e.ocupacaoPct !== null && e.ocupacaoPct >= 90 && e.naEspera > 0).forEach(e => {
    alertas.push({
      id: 'profissional_saturado:' + e.profissionalId, nivel: 'media',
      titulo: `${e.nome}: ${e.ocupacaoPct}% ocupado e ${e.naEspera} na espera`,
      porque: 'Reservas e atendimentos preencheram pelo menos 90% da grade nas últimas quatro semanas. Há clientes na lista de espera desse profissional.',
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
  const minFalta = minutosFalta30d;
  if (faltas.length >= 2) {
    const impacto = rpm ? Math.round(minFalta * rpm) : null;
    alertas.push({
      id: 'faltas', nivel: faltas.length >= 5 ? 'alta' : 'info',
      titulo: `${faltas.length} falta(s) nos últimos 30 dias`,
      porque: `${Math.round(minFalta / 60 * 10) / 10} h livres na grade coincidiram com faltas` + (impacto !== null ? `, cerca de ${brl(impacto)} pela receita média do período por minuto realizado.` : '.') + ' A régua de faltas e os lembretes reduzem isso.',
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

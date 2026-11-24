// F1.4 — OrquestraService que carrega dados e aplica engines puras

const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { ticketDoPeriodo, ocupacaoPorProfissionalDia, somarOcupacao } = require('../engines/insights/metricasPeriodo');
const { CAMPOS_AGENDA_PRODUCAO, CAMPOS_COMANDA_PRODUCAO, CAMPOS_ITEM_PRODUCAO } = require('../engines/insights/eventosProducao');
const { carregarVinculosDeProducao, agendamentosLongosAnteriores } = require('../repositories/producaoPeriodo');
const { addDays } = require('../engines/insights/retention');
const occupancy = require('../engines/insights/occupancy');
const cashflow = require('../engines/insights/cashflow');
const margin = require('../engines/insights/margin');
const { itensNegativos, gorjetasNegativas, pagamentosNegativos } = require('../engines/EstornoEngine');

class InsightsService {
  constructor(empresaId) {
    if (!empresaId) throw new Error('InsightsService exige empresaId');
    this.repo = new SupabaseRepository(empresaId);
  }

  // O perfil operacional lê somente dados de execução e grade. A previsão
  // considera os minutos restantes no fuso do salão a partir do instante atual.
  async loadOccupancyInsights(dataFrom, dataTo, hoje = dataFrom, minutoAtual = 0) {
    const filtro = { empresa_id: this.repo.empresaId };
    const inicio = addDays(dataFrom, -1);
    const fimRealizado = hoje < dataTo ? hoje : dataTo;
    const [agenda, vendas, profissionais, config] = await Promise.all([
      this.repo.list('agendamentos', filtro, { inicio, fim: addDays(dataTo, 1), ordem: 'id', campos: CAMPOS_AGENDA_PRODUCAO }),
      dataFrom <= fimRealizado ? this.repo.list('comandos', filtro, { inicio, fim: fimRealizado, ordem: 'id', campos: CAMPOS_COMANDA_PRODUCAO }) : [],
      this.repo.list('profissionais', filtro, { ordem: 'id', campos: 'id,nome,ativo,horario,escala_publicada_em' }),
      this.repo.empresaComDisponibilidade()
    ]);
    const empresa = config || {};
    let agendamentos = agenda;
    let realizadas = [];
    if (dataFrom <= fimRealizado) {
      const fontes = await carregarVinculosDeProducao(this.repo, agenda, vendas, inicio, fimRealizado, { inicio, fim: fimRealizado }, empresa.buffer_min || 0);
      const comandoItens = await this.repo.listDasComandas('comando_itens', fontes.comandos.map(c => c.id), CAMPOS_ITEM_PRODUCAO);
      agendamentos = fontes.agendamentos;
      realizadas = ocupacaoPorProfissionalDia({ ...fontes, comandoItens, profissionais, empresa }, dataFrom, fimRealizado);
    } else {
      const anteriores = await agendamentosLongosAnteriores(this.repo, inicio, empresa.buffer_min || 0);
      agendamentos = agenda.concat(anteriores);
    }
    const entrada = { agendamentos, profissionais, empresa };
    const grade = occupancy.analisarGrade(entrada, dataFrom, dataTo, { realizadas, hoje, minutoAtual });
    const carga = occupancy.totaisGrade(grade);
    const porProf = Map.groupBy(grade, l => l.profissionalId);
    const porProfissional = [...porProf.entries()].map(([id, linhas]) => {
      const t = occupancy.totaisGrade(linhas);
      return {
        profissionalId: id, profissionalNome: linhas[0].profissionalNome,
        preenchimentoGradePct: t.preenchimentoGradePct, minutosGradeOcupada: t.minutosGradeOcupada,
        surPct: t.preenchimentoGradePct, minutosVendidos: t.minutosGradeOcupada, minutosDisponiveis: t.minutosDisponiveis,
        noShowMin: linhas.reduce((total, l) => total + l.noShowMin, 0)
      };
    });
    const inicioPrevisto = hoje > dataFrom ? hoje : dataFrom;
    return {
      range: { from: dataFrom, to: dataTo },
      realizada: dataFrom <= fimRealizado ? { de: dataFrom, ate: fimRealizado, ...somarOcupacao(realizadas) } : null,
      rangePrevisto: inicioPrevisto <= dataTo ? {
        from: inicioPrevisto, to: dataTo, horarioInicio: inicioPrevisto === hoje ? occupancy.minToHHMM(minutoAtual) : '00:00'
      } : null,
      ...occupancy.previsaoDaGrade(grade, hoje, minutoAtual),
      preenchimentoGradePct: carga.preenchimentoGradePct, minutosGradeOcupada: carga.minutosGradeOcupada,
      loadFactorPct: carga.preenchimentoGradePct, minutosVendidos: carga.minutosGradeOcupada,
      minutosDisponiveis: carga.minutosDisponiveis, porProfissional,
      heatmap: occupancy.heatmapDaGrade(grade),
      buracos: occupancy.janelasDaGrade(grade.filter(l => l.data >= hoje)),
      faixas: [
        { max: 25, cor: '#9490a3' },
        { max: 50, cor: '#f59e0b' },
        { max: 75, cor: '#f97316' },
        { max: 100, cor: '#22c55e' }
      ]
    };
  }

  async loadMarginInsights(dataFrom, dataTo) {
    // GET /insights/margin?from=YYYY-MM-DD&to=YYYY-MM-DD
    const [comandoItens, comandoGorjetas, comandoPagamentos, comandos, [estornos, estornoItens, estornoPagamentos, estornoGorjetas]] = await Promise.all([
      this.repo.list('comando_itens', { empresa_id: this.repo.empresaId }),
      this.repo.list('comando_gorjetas', { empresa_id: this.repo.empresaId }),
      this.repo.list('comando_pagamentos', { empresa_id: this.repo.empresaId }),
      this.repo.list('comandos', { empresa_id: this.repo.empresaId }),
      Promise.all(this.repo.listEstornoTables())
    ]);
    // Estornos (D-013) entram pela data DO ESTORNO, como linhas negativas.
    const noPeriodo = e => e.data >= dataFrom && e.data <= dataTo;
    const negItens = itensNegativos({ estornos, estornoItens, comandoItens, filtro: noPeriodo });
    const negGorjetas = gorjetasNegativas({ estornos, estornoGorjetas, filtro: noPeriodo });
    const negPagamentos = pagamentosNegativos({ estornos, estornoPagamentos, filtro: noPeriodo });

    // Filtrar por range de datas
    const cmdFiltered = comandos.filter(c => c.data >= dataFrom && c.data <= dataTo);
    const itemFiltered = comandoItens.filter(i => {
      const cmd = comandos.find(c => c.id === i.comando_id);
      return cmd && cmd.data >= dataFrom && cmd.data <= dataTo;
    });
    const gorjetasFiltered = comandoGorjetas.filter(g => {
      const cmd = comandos.find(c => c.id === g.comando_id);
      return cmd && cmd.data >= dataFrom && cmd.data <= dataTo;
    });
    const pagFiltered = comandoPagamentos.filter(p => {
      const cmd = comandos.find(c => c.id === p.comando_id);
      return cmd && cmd.data >= dataFrom && cmd.data <= dataTo;
    });

    const itensLiquidos = itemFiltered.concat(negItens);
    // Ticket (D-071): a mesma regra do Desempenho do salão (metricasPeriodo.ticketDoPeriodo). Valor
    // líquido dos itens, sem gorjeta; só as vendas do período e os estornos delas. Antes usava o total
    // recebido (com gorjeta) e todos os reembolsos do período, inclusive de vendas de meses anteriores.
    const reembolsos = negPagamentos.reduce((s, p) => s + p.valor_centavos, 0);
    const ticketMedioCentavos = ticketDoPeriodo({ comandos, estornos }, dataFrom, dataTo).ticketMedioCentavos;

    return {
      porServico: margin.aggregateMarginByServico(itensLiquidos, cmdFiltered),
      porProfissional: margin.aggregateMarginByProfissional(itensLiquidos, gorjetasFiltered.concat(negGorjetas)),
      porProduto: margin.aggregateMarginByProduto(itensLiquidos),
      porForma: margin.aggregateMarginByForma(pagFiltered.concat(negPagamentos)),
      ticketMedioCentavos,
      estornos: {
        quantidade: estornos.filter(noPeriodo).length,
        reembolsoCentavos: -reembolsos
      }
    };
  }

  // GET /insights/cashflow?days=30. Recebíveis de hoje (fuso da empresa) até
  // hoje+days: cada pagamento cai em data da comanda + dias_recebimento da forma;
  // o reembolso de estorno (D-013), na data do estorno. Antes, TODO pagamento da
  // história era projetado a partir de hoje (o dinheiro de meses atrás aparecia
  // como entrada de hoje) e "hoje" era a data UTC.
  async loadCashflowInsights(days = 30, hoje = new Date().toISOString().slice(0, 10)) {
    const [pagamentosOriginais, comandos, formasPagamento, estornos, estornoPagamentos] = await Promise.all([
      this.repo.list('comando_pagamentos', { empresa_id: this.repo.empresaId }),
      this.repo.list('comandos', { empresa_id: this.repo.empresaId }),
      this.repo.list('formas_pagamento', { empresa_id: this.repo.empresaId }),
      this.repo.list('comanda_estornos', { empresa_id: this.repo.empresaId }),
      this.repo.list('comanda_estorno_pagamentos', { empresa_id: this.repo.empresaId })
    ]);
    const dataComanda = new Map(comandos.map(c => [c.id, String(c.data || '').slice(0, 10)]));
    const dataEstorno = new Map(estornos.map(e => [e.id, String(e.data || '').slice(0, 10)]));
    const originais = pagamentosOriginais
      .filter(p => dataComanda.has(p.comando_id))
      .map(p => ({ ...p, data: dataComanda.get(p.comando_id) }));
    const negativos = estornoPagamentos
      .filter(r => dataEstorno.has(r.estorno_id))
      .map(r => ({ _estorno: true, comando_id: r.comando_id, forma_code: r.forma_code, valor_centavos: -Number(r.valor_centavos || 0), taxa_total_centavos: 0, data: dataEstorno.get(r.estorno_id) }));
    const comandoPagamentos = originais.concat(negativos);

    const curva = cashflow.projectCashflow(comandoPagamentos, formasPagamento, hoje, days);
    const acum7d = cashflow.computeAccumulatedCashflow(curva, 7);
    const acum30d = cashflow.computeAccumulatedCashflow(curva, 30);

    // Líquido por forma = o que a curva projeta (mesmo recorte), não o histórico inteiro.
    const porFormaCurva = new Map();
    curva.forEach(d => d.porForma.forEach(f => porFormaCurva.set(f.formaCode, (porFormaCurva.get(f.formaCode) || 0) + f.liquidoCentavos)));
    return {
      curva,
      acumulado7dCentavos: acum7d,
      acumulado30dCentavos: acum30d,
      porForma: formasPagamento.map(f => ({
        formaCode: f.code,
        liquidoCentavos: porFormaCurva.get(f.code) || 0,
        diasRecebimento: f.dias_recebimento || 0
      }))
    };
  }
}

module.exports = { InsightsService };

// F1.4 — OrquestraService que carrega dados e aplica engines puras

const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const occupancy = require('../engines/insights/occupancy');
const cashflow = require('../engines/insights/cashflow');
const margin = require('../engines/insights/margin');
const { itensNegativos, gorjetasNegativas, pagamentosNegativos, comandasEstornadasTotal } = require('../engines/EstornoEngine');

class InsightsService {
  constructor(empresaId) {
    if (!empresaId) throw new Error('InsightsService exige empresaId');
    this.repo = new SupabaseRepository(empresaId);
  }

  // GET /insights/occupancy?from=YYYY-MM-DD&to=YYYY-MM-DD. `hoje` (fuso da
  // empresa) só limita os buracos a dias que ainda podem ser vendidos.
  async loadOccupancyInsights(dataFrom, dataTo, hoje = dataFrom) {
    const [agendamentos, profissionais, empresas] = await Promise.all([
      this.repo.list('agendamentos', { empresa_id: this.repo.empresaId }),
      this.repo.list('profissionais', { empresa_id: this.repo.empresaId }),
      this.repo.list('empresas', { id: this.repo.empresaId })
    ]);

    const empresa = empresas[0] || {};
    const slotPadrao = Number(empresa.slot_padrao) > 0 ? Number(empresa.slot_padrao) : 30;
    const ativos = profissionais.filter(p => p.ativo !== false);
    const noPeriodo = a => { const d = String(a.data || '').slice(0, 10); return d >= dataFrom && d <= dataTo; };

    const { loadFactorPct, minutosVendidos, minutosDisponiveis } = occupancy.computeLoadFactor(agendamentos, ativos, dataFrom, dataTo, empresa);
    const heatmap = occupancy.computeHeatmap(agendamentos, ativos, dataFrom, dataTo, empresa);

    const porProfissional = ativos.map(prof => {
      const sur = occupancy.computeSur({ agendamentos, profissional: prof, empresa, dataInicio: dataFrom, dataFim: dataTo });
      return {
        profissionalId: prof.id,
        profissionalNome: prof.nome,
        surPct: sur.surPct,
        minutosVendidos: sur.minutoVendido,
        minutosDisponiveis: sur.minutoDisponivel,
        // Só faltas do período (antes: todas as faltas da história).
        noShowMin: agendamentos
          .filter(a => a.profissional_id === prof.id && a.status === 'no_show' && noPeriodo(a))
          .reduce((sum, a) => sum + (Number(a.duracao_min) || 30), 0)
      };
    });

    // Buracos de hoje em diante dentro do período (antes: só o 1º dia, mesmo passado).
    const inicioBuracos = hoje > dataFrom ? hoje : dataFrom;
    const buracos = occupancy.datasDoPeriodo(inicioBuracos, dataTo)
      .flatMap(data => occupancy.computeGaps(agendamentos, ativos, data, slotPadrao, empresa));

    return {
      range: { from: dataFrom, to: dataTo },
      loadFactorPct,
      minutosVendidos,
      minutosDisponiveis,
      heatmap,
      porProfissional,
      buracos,
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
    // Ticket: reembolsos do período saem do numerador; comanda 100% estornada sai da base.
    // Só estornos totais lançados ATÉ o fim do período: um estorno posterior não
    // pode tirar a comanda da base de um período já fechado (o numerador ainda a
    // conta inteira porque o reembolso dela cai fora do período).
    const totalmente = comandasEstornadasTotal(estornos.filter(e => e.data <= dataTo));
    const cmdValidas = cmdFiltered.filter(c => !totalmente.has(c.id));
    const reembolsos = negPagamentos.reduce((s, p) => s + p.valor_centavos, 0);
    const ticketMedioCentavos = cmdValidas.length
      ? Math.round((cmdFiltered.reduce((s, c) => s + (c.total_recebido_centavos || 0), 0) + reembolsos) / cmdValidas.length)
      : 0;

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

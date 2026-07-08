// F1.4 — OrquestraService que carrega dados e aplica engines puras

const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const occupancy = require('../engines/insights/occupancy');
const cashflow = require('../engines/insights/cashflow');
const margin = require('../engines/insights/margin');

class InsightsService {
  constructor() {
    this.repo = new SupabaseRepository();
  }

  async loadOccupancyInsights(dataFrom, dataTo) {
    // GET /insights/occupancy?from=YYYY-MM-DD&to=YYYY-MM-DD
    const [agendamentos, profissionais, empresas] = await Promise.all([
      this.repo.list('agendamentos', { empresa_id: this.repo.empresaId }),
      this.repo.list('profissionais', { empresa_id: this.repo.empresaId }),
      this.repo.list('empresas', { id: this.repo.empresaId })
    ]);

    const empresa = empresas[0] || {};
    const slotPadrao = empresa.slot_padrao || 30;

    const { loadFactorPct, minutosVendidos, minutosDisponiveis } = occupancy.computeLoadFactor(
      agendamentos,
      profissionais,
      dataFrom,
      dataTo
    );

    // RevPAH = receita empresa / horas_disponiveis (será calculado em checkout preview após ledger)
    // Por enquanto, estimativa do ticket esperado (usaremos isto no F2)

    const heatmap = occupancy.computeHeatmap(agendamentos, profissionais, dataFrom, dataTo);

    const porProfissional = profissionais.map(prof => {
      const sur = occupancy.computeSur(
        agendamentos,
        prof.id,
        dataFrom, // usa primeira data do range como exemplo
        prof.horario || {},
        slotPadrao
      );
      return {
        profissionalId: prof.id,
        profissionalNome: prof.nome,
        surPct: sur.surPct,
        minutosVendidos: sur.minutoVendido,
        minutosDisponiveis: sur.minutoDisponivel,
        noShowMin: agendamentos
          .filter(a => a.profissional_id === prof.id && a.status === 'no_show')
          .reduce((sum, a) => sum + (a.duracao_min || 30), 0)
      };
    });

    const buracos = occupancy.computeGaps(agendamentos, profissionais, dataFrom, slotPadrao);

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
    const [comandoItens, comandoGorjetas, comandoPagamentos, comandos] = await Promise.all([
      this.repo.list('comando_itens', { empresa_id: this.repo.empresaId }),
      this.repo.list('comando_gorjetas', { empresa_id: this.repo.empresaId }),
      this.repo.list('comando_pagamentos', { empresa_id: this.repo.empresaId }),
      this.repo.list('comandos', { empresa_id: this.repo.empresaId })
    ]);

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

    return {
      porServico: margin.aggregateMarginByServico(itemFiltered, cmdFiltered),
      porProfissional: margin.aggregateMarginByProfissional(itemFiltered, gorjetasFiltered),
      porProduto: margin.aggregateMarginByProduto(itemFiltered),
      porForma: margin.aggregateMarginByForma(pagFiltered),
      ticketMedioCentavos: margin.computeTicketMedio(cmdFiltered)
    };
  }

  async loadCashflowInsights(days = 30) {
    // GET /insights/cashflow?days=30
    const [comandoPagamentos, formasPagamento] = await Promise.all([
      this.repo.list('comando_pagamentos', { empresa_id: this.repo.empresaId }),
      this.repo.list('formas_pagamento', { empresa_id: this.repo.empresaId })
    ]);

    const hoje = new Date().toISOString().split('T')[0];
    const curva = cashflow.projectCashflow(
      comandoPagamentos,
      formasPagamento,
      hoje,
      days
    );

    const acum7d = cashflow.computeAccumulatedCashflow(curva, 7);
    const acum30d = cashflow.computeAccumulatedCashflow(curva, 30);

    return {
      curva,
      acumulado7dCentavos: acum7d,
      acumulado30dCentavos: acum30d,
      porForma: formasPagamento.map(f => ({
        formaCode: f.code,
        liquidoCentavos: comandoPagamentos
          .filter(p => p.forma_code === f.code)
          .reduce((sum, p) => sum + (p.valor_centavos || 0) - (p.taxa_total_centavos || 0), 0),
        diasRecebimento: f.dias_recebimento || 0
      }))
    };
  }
}

module.exports = { InsightsService };

// Pagamento de comissão (D-017, migration 010) — funções puras.
// Saldo a pagar = tudo que o profissional ganhou (comissão + gorjeta − estornos de
// comanda) − tudo que já recebeu (pagamentos + vales − estornos de pagamento).
// Lançamento é imutável: corrigir é estornar, uma vez só (o banco garante).
const { computeGanhos } = require('./insights/ganhos');

const n = v => Number(v || 0);

function resumirPagamentos(pagamentos = [], profissionalId) {
  const doProf = pagamentos.filter(p => p.profissional_id === profissionalId);
  const estornados = new Set(doProf.filter(p => p.tipo === 'estorno').map(p => p.estorna_id));
  let pago = 0; let vales = 0; let estornado = 0;
  for (const p of doProf) {
    if (p.tipo === 'pagamento') pago += n(p.valor_centavos);
    else if (p.tipo === 'vale') vales += n(p.valor_centavos);
    else estornado += n(p.valor_centavos);
  }
  const lancamentos = doProf
    .map(p => ({ id: p.id, tipo: p.tipo, valorCentavos: n(p.valor_centavos), data: String(p.data), referenciaMes: p.referencia_mes || null, observacao: p.observacao || null, estornaId: p.estorna_id || null, estornado: estornados.has(p.id), criadoEm: p.created_at || null }))
    .sort((a, b) => b.data.localeCompare(a.data) || String(b.criadoEm).localeCompare(String(a.criadoEm)));
  return { pagamentosCentavos: pago, valesCentavos: vales, estornadoCentavos: estornado, recebidoCentavos: pago + vales - estornado, lancamentos };
}

// dados: as mesmas coleções de computeGanhos (já filtradas pela empresa).
function computeSaldoComissao({ profissionalId, pagamentos = [], ...dados }) {
  const ganhos = computeGanhos({ ...dados, profissionalId, mes: '' }); // mes '' = histórico inteiro
  const r = resumirPagamentos(pagamentos, profissionalId);
  return { profissionalId, ganhoCentavos: ganhos.totalCentavos, ...r, saldoCentavos: ganhos.totalCentavos - r.recebidoCentavos };
}

module.exports = { computeSaldoComissao, resumirPagamentos };

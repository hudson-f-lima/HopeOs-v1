const { roundCents } = require('./money');
const { createAppError } = require('../errors');

function calculateItemCommission(item) {
  const valor = roundCents(item.valorLiquidoCentavos || 0);
  const taxa = roundCents(item.taxaItemCentavos || 0);
  const custo = roundCents(item.totalCustoCentavos || 0);
  const pct = Number(item.comissaoPct || 0);
  const modelo = item.modeloComissao || 'bruto_salao';

  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw createAppError('COMMISSION_PCT_OUT_OF_RANGE', `Comissao invalida: ${pct}. Deve estar entre 0 e 100.`, 422, { comissaoPct: pct });
  }

  let baseCalculoCentavos = valor;
  let comissaoCentavos = 0;
  let receitaEmpresaCentavos = 0;

  if (modelo === 'bruto_salao') {
    baseCalculoCentavos = valor;
    comissaoCentavos = roundCents((baseCalculoCentavos * pct) / 100);
    receitaEmpresaCentavos = valor - comissaoCentavos - taxa - custo;
  } else if (modelo === 'dividido') {
    baseCalculoCentavos = Math.max(0, valor - taxa);
    comissaoCentavos = roundCents((baseCalculoCentavos * pct) / 100);
    receitaEmpresaCentavos = valor - comissaoCentavos - taxa - custo;
  } else if (modelo === 'bruto_staff') {
    baseCalculoCentavos = valor;
    comissaoCentavos = roundCents((baseCalculoCentavos * pct) / 100) - taxa;
    receitaEmpresaCentavos = valor - comissaoCentavos - taxa - custo;
  } else {
    throw createAppError('INVALID_COMMISSION_MODEL', `Modelo de comissão inválido: ${modelo}`, 422, { modelo });
  }

  if (comissaoCentavos < 0) {
    throw createAppError('NEGATIVE_COMMISSION_BLOCKED', 'Comissão negativa bloqueada.', 422, { comissaoCentavos });
  }

  return {
    ...item,
    modeloComissao: modelo,
    comissaoPct: pct,
    baseCalculoCentavos,
    comissaoCentavos,
    receitaEmpresaCentavos
  };
}

module.exports = { calculateItemCommission };

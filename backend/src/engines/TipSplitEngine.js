const { roundCents, sumCents } = require('./money');
const { allocateProportional } = require('./allocation');

function groupItemsByProfessional(items) {
  const map = new Map();
  for (const item of items || []) {
    if (item.tipo && item.tipo !== 'servico') continue;
    const profissionalId = item.profissionalId;
    if (!profissionalId) continue;
    if (!map.has(profissionalId)) {
      map.set(profissionalId, { profissionalId, valorLiquidoCentavos: 0, duracaoMin: 0, itemCount: 0 });
    }
    const row = map.get(profissionalId);
    row.valorLiquidoCentavos += roundCents(item.valorLiquidoCentavos || 0);
    row.duracaoMin += Number(item.duracaoMin || 0);
    row.itemCount += 1;
  }
  return Array.from(map.values());
}

function splitTipsHybrid({ tipGrossCents, items, valueWeight = 0.70, timeWeight = 0.30 }) {
  const tip = roundCents(tipGrossCents);
  if (tip <= 0) return [];

  const groups = groupItemsByProfessional(items);
  if (groups.length === 0) {
    const { createAppError } = require('../errors');
    throw createAppError('TIP_WITHOUT_OWNER', 'Gorjeta sem profissional calculável.', 422);
  }
  if (groups.length === 1) {
    return [{ ...groups[0], pesoValor: 1, pesoTempo: 1, pesoFinal: 1, gorjetaBrutaCentavos: tip, regra: 'single_professional' }];
  }

  const totalValue = sumCents(groups, 'valorLiquidoCentavos');
  const totalTime = groups.reduce((s, g) => s + Number(g.duracaoMin || 0), 0);

  let rule = 'hybrid_70_value_30_time';
  const weights = groups.map(g => {
    const valorShare = totalValue > 0 ? g.valorLiquidoCentavos / totalValue : 0;
    const tempoShare = totalTime > 0 ? g.duracaoMin / totalTime : 0;

    let final = 0;
    if (totalValue > 0 && totalTime > 0) final = (valorShare * valueWeight) + (tempoShare * timeWeight);
    else if (totalValue > 0) { final = valorShare; rule = 'fallback_value_only'; }
    else if (totalTime > 0) { final = tempoShare; rule = 'fallback_time_only'; }
    else { final = 1 / groups.length; rule = 'fallback_equal'; }

    return { pesoValor: valorShare, pesoTempo: tempoShare, pesoFinal: final };
  });

  const allocations = allocateProportional(tip, weights, 'pesoFinal');
  return groups.map((g, i) => ({
    ...g,
    ...weights[i],
    gorjetaBrutaCentavos: allocations[i],
    regra: rule
  }));
}

module.exports = { splitTipsHybrid, groupItemsByProfessional };

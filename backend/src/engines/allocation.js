function allocateProportional(totalCents, rows, getWeight) {
  const total = Math.round(Number(totalCents || 0));
  if (!rows || rows.length === 0) return [];
  if (total === 0) return rows.map(() => 0);

  const weights = rows.map((row, index) => Math.max(0, Number(typeof getWeight === 'function' ? getWeight(row, index) : row[getWeight] || 0)));
  const weightSum = weights.reduce((a, b) => a + b, 0);

  if (weightSum <= 0) {
    const base = Math.floor(total / rows.length);
    const out = rows.map(() => base);
    let remainder = total - base * rows.length;
    for (let i = 0; i < Math.abs(remainder); i++) out[i % out.length] += remainder > 0 ? 1 : -1;
    return out;
  }

  const raw = weights.map(w => (total * w) / weightSum);
  const floors = raw.map(v => Math.floor(v));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v), weight: weights[i] }))
    .sort((a, b) => (b.frac - a.frac) || (b.weight - a.weight));

  for (let k = 0; k < remainder; k++) floors[order[k % order.length].i] += 1;
  return floors;
}

module.exports = { allocateProportional };

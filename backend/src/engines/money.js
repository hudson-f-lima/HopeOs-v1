function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (Number.isInteger(value)) return value;
  if (typeof value === 'number') return Math.round(value * 100);
  const s = String(value)
    .replace(/R\$/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function fromCents(cents) {
  return Math.round(Number(cents || 0)) / 100;
}

function roundCents(value) {
  return Math.round(Number(value || 0));
}

function sumCents(rows, keyOrFn) {
  return (rows || []).reduce((sum, row) => {
    const value = typeof keyOrFn === 'function' ? keyOrFn(row) : row[keyOrFn];
    return sum + roundCents(value || 0);
  }, 0);
}

function assertCents(value, label) {
  if (!Number.isInteger(value)) throw new Error(`${label} deve estar em centavos inteiros`);
}

function formatBRL(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(fromCents(cents));
}

module.exports = { toCents, fromCents, roundCents, sumCents, assertCents, formatBRL };

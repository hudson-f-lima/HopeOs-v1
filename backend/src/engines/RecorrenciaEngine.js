// Datas de uma série de agendamentos (C4, D-039). Puro: sem banco nem relógio.
// - semanal: a cada 7 dias; quinzenal: a cada 14;
// - mensal: o mesmo dia do mês; em mês sem esse dia (31, 30, 29 de fevereiro), o último dia do
//   mês, sem deslocar os meses seguintes (dia 31 → 30/04 → 31/05).
const FREQUENCIAS = ['semanal', 'quinzenal', 'mensal'];
const MIN_OCORRENCIAS = 2;
const MAX_OCORRENCIAS = 52;

function utc(data) {
  const [y, m, d] = String(data).split('-').map(Number);
  return { y, m, d };
}
const iso = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const diasNoMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

function datasDaSerie(dataInicio, frequencia, ocorrencias) {
  if (!FREQUENCIAS.includes(frequencia)) throw new Error(`frequência inválida: ${frequencia}`);
  const n = Number(ocorrencias);
  if (!Number.isInteger(n) || n < MIN_OCORRENCIAS || n > MAX_OCORRENCIAS) throw new Error(`ocorrências fora da faixa: ${ocorrencias}`);
  const { y, m, d } = utc(dataInicio);
  const datas = [];
  for (let i = 0; i < n; i++) {
    if (frequencia === 'mensal') {
      const total = (m - 1) + i;
      const ano = y + Math.floor(total / 12);
      const mes = (total % 12) + 1;
      datas.push(iso(ano, mes, Math.min(d, diasNoMes(ano, mes))));
    } else {
      datas.push(iso(y, m, d + i * (frequencia === 'semanal' ? 7 : 14)));
    }
  }
  return datas;
}

module.exports = { datasDaSerie, FREQUENCIAS, MIN_OCORRENCIAS, MAX_OCORRENCIAS };

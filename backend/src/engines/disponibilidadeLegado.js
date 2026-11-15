// Horário antigo (empresas.horario_por_dia + almoço; profissionais.horario) → períodos semanais
// da migration 013. Mesma regra da função disponibilidade_converter_legado do banco: o que vale
// hoje continua valendo. Usado pelo backend em memória e pelo assistente de configuração.
const { janelaDoDia } = require('./SlotEngine');
const { minutesToTime, timeToMinutes } = require('./ScheduleEngine');

const temConfig = h => !!h && typeof h === 'object' && Object.keys(h).length > 0;

function periodosDaUnidade(empresa) {
  const e = empresa || {};
  const almoco = e.intervalo_almoco && e.almoco_inicio && e.almoco_fim ? { a: timeToMinutes(e.almoco_inicio), b: timeToMinutes(e.almoco_fim) } : null;
  const out = [];
  const add = (dia, ini, fim) => out.push({ diaSemana: dia, inicio: minutesToTime(ini), fim: minutesToTime(fim) });
  for (let dia = 0; dia < 7; dia++) {
    const ew = janelaDoDia(e.horario_por_dia, dia);
    if (!ew) continue;
    if (almoco && almoco.b > almoco.a && almoco.a < ew.fim && almoco.b > ew.inicio) {
      if (almoco.a > ew.inicio) add(dia, ew.inicio, almoco.a);
      if (almoco.b < ew.fim) add(dia, almoco.b, ew.fim);
    } else add(dia, ew.inicio, ew.fim);
  }
  return out;
}

function periodosDoProfissional(profissional, empresa) {
  const conf = temConfig(profissional && profissional.horario);
  const out = [];
  for (let dia = 0; dia < 7; dia++) {
    const ew = janelaDoDia(empresa && empresa.horario_por_dia, dia);
    const pw = conf ? janelaDoDia(profissional.horario, dia) : null;
    let j = null;
    if (conf && !pw) j = null;
    else if (pw && ew) j = { inicio: Math.max(pw.inicio, ew.inicio), fim: Math.min(pw.fim, ew.fim) };
    else j = pw || ew;
    if (j && j.fim > j.inicio) out.push({ diaSemana: dia, inicio: minutesToTime(j.inicio), fim: minutesToTime(j.fim) });
  }
  return out;
}

// Dias em que a empresa não abria mas algum profissional tinha horário próprio: a unidade
// passa a abrir nesses trechos (antes valia o horário do profissional). Igual à migration.
function periodosExtrasDaUnidade(unidade, porProfissional) {
  const diasUnidade = new Set(unidade.map(p => p.diaSemana));
  const vistos = new Set();
  const out = [];
  for (const x of porProfissional.flat()) {
    const k = `${x.diaSemana}|${x.inicio}|${x.fim}`;
    if (diasUnidade.has(x.diaSemana) || vistos.has(k)) continue;
    vistos.add(k);
    out.push({ diaSemana: x.diaSemana, inicio: x.inicio, fim: x.fim });
  }
  return out;
}

module.exports = { periodosDaUnidade, periodosDoProfissional, periodosExtrasDaUnidade };

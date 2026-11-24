// Disponibilidade efetiva de um profissional numa data (D-033, migration 013). Funções puras.
// Fonte única: disponibilidade_semanal + disponibilidade_excecoes + escala publicada.
//
// Precedência (do mais forte para o mais fraco), documentada em
// docs/planning/DISPONIBILIDADE_ESCALAS.md §3:
//  1. fechamento integral da unidade na data → ninguém atende
//  2. horário excepcional da unidade na data → substitui o semanal da unidade só nesse dia
//  3. semanal da unidade (vários períodos)
//  4. ausência do profissional cobrindo a data → indisponível
//  5. horário excepcional do profissional na data → substitui o semanal dele só nesse dia
//  6. semanal publicado do profissional; sem escala publicada → indisponível
//  7. fechamentos parciais da unidade e bloqueios do profissional retiram trechos
// Efetivo = (unidade ∩ profissional) − bloqueios. Atendimentos e duração do serviço ficam com
// o SlotEngine. Abrir a unidade num dia excepcional não libera ninguém: sem horário próprio
// para aquele dia, o profissional não atende. Sem regra → nada é oferecido.
const { timeToMinutes, minutesToTime } = require('./ScheduleEngine');

const min = t => timeToMinutes(String(t).slice(0, 5));
const diaDaSemana = data => new Date(`${data}T00:00:00Z`).getUTCDay();
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);
const cobre = (e, data) => String(e.data_inicio).slice(0, 10) <= data && data <= String(e.data_fim).slice(0, 10);
const periodo = r => ({ start: min(r.inicio), end: min(r.fim) });
const comMotivo = (texto, e) => (e && e.motivo ? `${texto} (${e.motivo})` : texto);

// Une e ordena períodos que se encostam ou se sobrepõem.
function normalizar(periodos) {
  const ord = periodos.filter(p => p.end > p.start).sort((a, b) => a.start - b.start);
  const out = [];
  for (const p of ord) {
    const ult = out[out.length - 1];
    if (ult && p.start <= ult.end) ult.end = Math.max(ult.end, p.end);
    else out.push({ ...p });
  }
  return out;
}

function intersecao(a, b) {
  const out = [];
  for (const x of a) for (const y of b) {
    const start = Math.max(x.start, y.start);
    const end = Math.min(x.end, y.end);
    if (end > start) out.push({ start, end });
  }
  return normalizar(out);
}

function subtrair(periodos, retirar) {
  let atual = normalizar(periodos);
  for (const r of retirar) {
    const prox = [];
    for (const p of atual) {
      if (r.end <= p.start || r.start >= p.end) { prox.push(p); continue; }
      if (r.start > p.start) prox.push({ start: p.start, end: r.start });
      if (r.end < p.end) prox.push({ start: r.end, end: p.end });
    }
    atual = prox;
  }
  return atual;
}

// Regras semanais que valem nesta data (dia da semana, alternância de semanas).
function semanalNoDia(regras, data) {
  const dow = diaDaSemana(data);
  return regras.filter(r => {
    if (Number(r.dia_semana) !== dow) return false;
    const n = Number(r.a_cada_semanas || 1);
    if (n <= 1) return true;
    if (!r.semana_ancora) return false;
    const semanas = Math.floor(diasEntre(String(r.semana_ancora).slice(0, 10), data) / 7);
    return ((semanas % n) + n) % n === 0;
  }).map(periodo);
}

const texto = periodos => periodos.map(p => `${minutesToTime(p.start)}–${minutesToTime(p.end)}`).join(', ');

/**
 * @param {object} p
 * @param {string} p.data AAAA-MM-DD
 * @param {Array} p.semanal linhas de disponibilidade_semanal da empresa
 * @param {Array} p.excecoes linhas de disponibilidade_excecoes da empresa
 * @param {{id:string, escala_publicada_em?:string}} p.profissional
 * @param {boolean} [p.incluirJornada] retorna também os períodos antes dos bloqueios parciais
 * @returns {{periodos:Array<{start:number,end:number}>, codigo:string, origem:string}}
 */
function disponibilidadeDoDia({ data, semanal = [], excecoes = [], profissional, incluirJornada = false }) {
  const daUnidade = x => !x.profissional_id;
  const doProf = x => profissional && x.profissional_id === profissional.id;
  const nada = (codigo, origem) => ({ periodos: [], codigo, origem });

  const excU = excecoes.filter(e => daUnidade(e) && cobre(e, data));
  const fechada = excU.find(e => e.tipo === 'fechamento' && !e.inicio);
  if (fechada) return nada('UNIDADE_FECHADA', comMotivo('Unidade fechada nesta data', fechada));
  const horU = excU.filter(e => e.tipo === 'horario');
  const unidade = normalizar(horU.length ? horU.map(periodo) : semanalNoDia(semanal.filter(daUnidade), data));
  if (!unidade.length) return nada('UNIDADE_SEM_HORARIO', 'A unidade não abre neste dia');
  const origemU = horU.length ? comMotivo(`Unidade em horário excepcional ${texto(unidade)}`, horU[0]) : `Unidade ${texto(unidade)}`;

  if (!profissional || !profissional.escala_publicada_em) return nada('ESCALA_NAO_PUBLICADA', 'A escala do profissional ainda não foi publicada');
  const excP = excecoes.filter(e => doProf(e) && cobre(e, data));
  const ausente = excP.find(e => e.tipo === 'ausencia');
  if (ausente) return nada('AUSENCIA', comMotivo('Profissional ausente nesta data', ausente));
  const horP = excP.filter(e => e.tipo === 'horario');
  const prof = normalizar(horP.length ? horP.map(periodo) : semanalNoDia(semanal.filter(doProf), data));
  if (!prof.length) return nada('FOLGA', 'O profissional não trabalha neste dia');
  const origemP = horP.length ? comMotivo(`profissional em horário excepcional ${texto(prof)}`, horP[0]) : `profissional ${texto(prof)}`;

  const retirar = [
    ...excU.filter(e => e.tipo === 'fechamento').map(periodo),
    ...excP.filter(e => e.tipo === 'bloqueio').map(periodo)
  ];
  const jornada = intersecao(unidade, prof);
  const periodos = subtrair(jornada, retirar);
  const bloqueado = retirar.length ? '; com bloqueios' : '';
  const resultado = periodos.length
    ? { periodos, codigo: 'OK', origem: `${origemU}; ${origemP}${bloqueado}` }
    : nada('SEM_HORARIO', `${origemU}; ${origemP}${bloqueado}; sem horário em comum`);
  if (incluirJornada) resultado.jornada = jornada;
  return resultado;
}

// O atendimento [inicio, inicio + duracao) cabe inteiro num período disponível?
function cabe(periodos, inicioMin, duracaoMin) {
  return periodos.some(p => inicioMin >= p.start && inicioMin + duracaoMin <= p.end);
}

// Estado da unidade num dia (calendário do mês, D-050): fechada, especial (horário excepcional ou
// fechamento parcial), aberta ou sem horário. Determinístico, a partir das mesmas regras do dia.
function estadoDaUnidade({ data, semanal = [], excecoes = [] }) {
  const excU = excecoes.filter(e => !e.profissional_id && cobre(e, data));
  const fechada = excU.find(e => e.tipo === 'fechamento' && !e.inicio);
  if (fechada) return { estado: 'fechada', motivo: fechada.motivo || null, periodos: [] };
  const horU = excU.filter(e => e.tipo === 'horario');
  let periodos = normalizar(horU.length ? horU.map(periodo) : semanalNoDia(semanal.filter(r => !r.profissional_id), data));
  const parcial = excU.filter(e => e.tipo === 'fechamento' && e.inicio);
  periodos = subtrair(periodos, parcial.map(periodo));
  if (!periodos.length) return { estado: horU.length || parcial.length ? 'fechada' : 'sem_horario', motivo: (horU[0] || parcial[0] || {}).motivo || null, periodos: [] };
  const especial = horU[0] || parcial[0];
  return { estado: especial ? 'especial' : 'aberta', motivo: especial ? especial.motivo || null : null, periodos };
}

module.exports = { disponibilidadeDoDia, cabe, normalizar, intersecao, subtrair, semanalNoDia, estadoDaUnidade };

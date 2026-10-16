// Motor de slots-âncora (geometria de agenda) — funções puras, sem I/O.
// Sugere primeiro os horários que encostam no início/fim de uma janela livre
// (abertura, fechamento, almoço ou outro atendimento) e que deixam o menor
// tempo inutilizável na agenda. A verdade de conflito continua sendo
// assertNoScheduleConflict no POST /agenda; este motor só sugere.

const { timeToMinutes, minutesToTime, INACTIVE_STATUSES } = require('./ScheduleEngine');

const DIA_KEYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

function diaDaSemana(data) {
  return new Date(`${data}T00:00:00Z`).getUTCDay();
}

function hasConfig(horario) {
  return !!horario && typeof horario === 'object' && Object.keys(horario).length > 0;
}

// Aceita os dois formatos presentes no código:
// { seg: { ativo, inicio, fim } } (PWA legado) e { 1: { start, end } } (insights).
function janelaDoDia(horario, dow) {
  if (!hasConfig(horario)) return null;
  const dia = horario[DIA_KEYS[dow]] || horario[dow] || horario[String(dow)];
  if (!dia || typeof dia !== 'object' || dia.ativo === false) return null;
  const inicio = dia.inicio || dia.start;
  const fim = dia.fim || dia.end;
  if (!inicio || !fim) return null;
  const janela = { inicio: timeToMinutes(inicio), fim: timeToMinutes(fim) };
  return janela.fim > janela.inicio ? janela : null;
}

// Interseção profissional × empresa. Sem nenhum horário configurado, falha fechado
// (null) em vez de inventar expediente padrão.
function resolveJanela({ profissional, empresa, data }) {
  const dow = diaDaSemana(data);
  const profConfigurado = hasConfig(profissional && profissional.horario);
  const prof = janelaDoDia(profissional && profissional.horario, dow);
  const emp = janelaDoDia(empresa && empresa.horario_por_dia, dow);

  if (profConfigurado && !prof) return null;
  if (prof && emp) {
    const janela = { inicio: Math.max(prof.inicio, emp.inicio), fim: Math.min(prof.fim, emp.fim) };
    return janela.fim > janela.inicio ? janela : null;
  }
  return prof || emp || null;
}

function bloqueiosEmpresa(empresa) {
  if (!empresa || !empresa.intervalo_almoco || !empresa.almoco_inicio || !empresa.almoco_fim) return [];
  const start = timeToMinutes(empresa.almoco_inicio);
  const end = timeToMinutes(empresa.almoco_fim);
  return end > start ? [{ start, end }] : [];
}

// Mesma regra de duração para sugerir e para gravar: override do profissional
// por serviço > duração do serviço > 30.
function resolveDuracaoMin({ servico, profissional, duracaoMin }) {
  if (duracaoMin !== undefined && duracaoMin !== null) return Number(duracaoMin);
  const override = servico && profissional && profissional.overrides && profissional.overrides[servico.id];
  const ov = override && Number(override.duracao_min ?? override.duracao);
  if (ov > 0) return ov;
  const base = servico && Number(servico.duracao_min);
  return base > 0 ? base : 30;
}

function intervalosOcupados(agendamentos, profissionalId, data) {
  return (agendamentos || [])
    .filter(a => (a.profissional_id ?? a.profissionalId) === profissionalId)
    .filter(a => a.data === data && !INACTIVE_STATUSES.includes(a.status))
    .map(a => {
      const start = timeToMinutes(a.horario);
      return { start, end: start + Number(a.duracao_min ?? a.duracaoMin ?? 30) };
    });
}

function janelasLivres(janela, ocupados) {
  const busy = ocupados
    .map(o => ({ start: Math.max(o.start, janela.inicio), end: Math.min(o.end, janela.fim) }))
    .filter(o => o.end > o.start)
    .sort((a, b) => a.start - b.start);

  const livres = [];
  let cursor = janela.inicio;
  for (const o of busy) {
    if (o.start > cursor) livres.push({ start: cursor, end: o.start });
    cursor = Math.max(cursor, o.end);
  }
  if (cursor < janela.fim) livres.push({ start: cursor, end: janela.fim });
  return livres;
}

function desperdicio(sobra, minUtilMin) {
  return sobra > 0 && sobra < minUtilMin ? sobra : 0;
}

/**
 * @param {object} p
 * @param {{inicio:number, fim:number}|null} p.janela expediente em minutos do dia
 * @param {Array<{start:number,end:number}>} p.ocupados atendimentos e bloqueios
 * @param {number} p.duracaoMin bloco a encaixar
 * @param {number} p.passoMin grade de horários (empresa.slot_padrao)
 * @param {number} [p.minUtilMin] menor bloco vendável; sobra menor que isso é tempo perdido
 * @param {number} [p.inicioMinimoMin] não sugerir antes deste minuto (ex.: agora, se hoje)
 */
function computeSlots({ janela, ocupados, duracaoMin, passoMin, minUtilMin, inicioMinimoMin }) {
  const dur = Number(duracaoMin);
  const passo = Number(passoMin) > 0 ? Number(passoMin) : 30;
  const minUtil = Number(minUtilMin) > 0 ? Number(minUtilMin) : passo;
  if (!janela || !(dur > 0)) return [];

  const slots = [];
  for (const livre of janelasLivres(janela, ocupados || [])) {
    let start = livre.start;
    if (inicioMinimoMin !== undefined && inicioMinimoMin !== null && start < inicioMinimoMin) {
      // O tempo antes de "agora" já passou: começa no próximo ponto da grade.
      const k = Math.ceil((inicioMinimoMin - janela.inicio) / passo);
      start = Math.max(start, janela.inicio + k * passo);
    }
    const ultimo = livre.end - dur;
    if (ultimo < start) continue;

    // Grade + bordas da janela livre: a borda pode estar fora da grade
    // (ex.: atendimento termina 10:45 com passo de 30) e é o melhor encaixe.
    const candidatos = new Set([start, ultimo]);
    const k0 = Math.ceil((start - janela.inicio) / passo);
    for (let t = janela.inicio + k0 * passo; t <= ultimo; t += passo) candidatos.add(t);

    const daJanela = [...candidatos].sort((a, b) => a - b).map(t => {
      const antes = t - start;
      const depois = livre.end - (t + dur);
      return {
        inicioMin: t,
        horario: minutesToTime(t),
        fim: minutesToTime(t + dur),
        ancora: antes === 0 || depois === 0,
        buracoAntesMin: antes,
        buracoDepoisMin: depois,
        desperdicioMin: desperdicio(antes, minUtil) + desperdicio(depois, minUtil),
        recomendado: false
      };
    });

    const ancoras = daJanela.filter(s => s.ancora);
    const melhor = Math.min(...ancoras.map(s => s.desperdicioMin));
    ancoras.forEach(s => { s.recomendado = s.desperdicioMin === melhor; });
    slots.push(...daJanela);
  }
  return slots.map(({ inicioMin, ...s }) => s);
}

// Data e minuto atual no fuso da operação, para não sugerir horário passado.
function agoraNoFuso(timeZone, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map(p => [p.type, p.value]));
  return { data: `${parts.year}-${parts.month}-${parts.day}`, minuto: Number(parts.hour) * 60 + Number(parts.minute) };
}

function buildSlotsDoDia({ data, profissional, empresa, servico, servicosAtivos, agendamentos, duracaoMin, agora }) {
  const duracao = resolveDuracaoMin({ servico, profissional, duracaoMin });
  const passoMin = Number(empresa && empresa.slot_padrao) > 0 ? Number(empresa.slot_padrao) : 30;
  const janela = resolveJanela({ profissional, empresa, data });
  const base = { data, duracaoMin: duracao, passoMin, janela: janela && { inicio: minutesToTime(janela.inicio), fim: minutesToTime(janela.fim) } };

  if (agora && data < agora.data) return { ...base, slots: [] };

  const duracoes = (servicosAtivos || [])
    .map(s => resolveDuracaoMin({ servico: s, profissional }))
    .filter(d => d > 0);
  const minUtilMin = duracoes.length ? Math.min(...duracoes) : passoMin;

  const slots = computeSlots({
    janela,
    ocupados: [...intervalosOcupados(agendamentos, profissional.id, data), ...bloqueiosEmpresa(empresa)],
    duracaoMin: duracao,
    passoMin,
    minUtilMin,
    inicioMinimoMin: agora && data === agora.data ? agora.minuto : undefined
  });
  return { ...base, minUtilMin, slots };
}

module.exports = {
  DIA_KEYS,
  janelaDoDia,
  resolveJanela,
  resolveDuracaoMin,
  janelasLivres,
  computeSlots,
  agoraNoFuso,
  buildSlotsDoDia
};

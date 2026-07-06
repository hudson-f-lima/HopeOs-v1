function timeToMinutes(t) {
  const [h, m] = String(t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

function findScheduleConflicts({ agendamento, existing }) {
  const start = timeToMinutes(agendamento.horario);
  const end = start + Number(agendamento.duracaoMin || 30);
  const current = { start, end };
  return (existing || []).filter(a => {
    if (a.id === agendamento.id) return false;
    if (a.profissional_id !== agendamento.profissionalId && a.profissionalId !== agendamento.profissionalId) return false;
    if (a.data !== agendamento.data) return false;
    if (['cancelado', 'no_show', 'reagendado'].includes(a.status)) return false;
    const otherStart = timeToMinutes(a.horario);
    const otherEnd = otherStart + Number(a.duracao_min || a.duracaoMin || 30);
    return overlaps(current, { start: otherStart, end: otherEnd });
  });
}

function assertNoScheduleConflict({ agendamento, existing }) {
  const conflitos = findScheduleConflicts({ agendamento, existing });
  if (conflitos.length > 0) {
    const err = new Error('Conflito de agenda para o profissional neste horário.');
    err.statusCode = 409;
    err.code = 'SCHEDULE_CONFLICT';
    err.details = {
      conflitos: conflitos.map(c => ({ id: c.id, horario: c.horario, duracaoMin: c.duracao_min ?? c.duracaoMin, status: c.status }))
    };
    throw err;
  }
}

module.exports = { timeToMinutes, minutesToTime, overlaps, findScheduleConflicts, assertNoScheduleConflict };

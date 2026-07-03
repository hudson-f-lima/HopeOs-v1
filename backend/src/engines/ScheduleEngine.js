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

function assertNoScheduleConflict({ agendamento, existing }) {
  const start = timeToMinutes(agendamento.horario);
  const end = start + Number(agendamento.duracaoMin || 30);
  const current = { start, end };
  const conflict = (existing || []).find(a => {
    if (a.id === agendamento.id) return false;
    if (a.profissional_id !== agendamento.profissionalId && a.profissionalId !== agendamento.profissionalId) return false;
    if (a.data !== agendamento.data) return false;
    if (['cancelado', 'no_show'].includes(a.status)) return false;
    const otherStart = timeToMinutes(a.horario);
    const otherEnd = otherStart + Number(a.duracao_min || a.duracaoMin || 30);
    return overlaps(current, { start: otherStart, end: otherEnd });
  });

  if (conflict) {
    const err = new Error('Conflito de agenda para o profissional neste horário.');
    err.statusCode = 422;
    err.code = 'SCHEDULE_CONFLICT';
    throw err;
  }
}

module.exports = { timeToMinutes, minutesToTime, overlaps, assertNoScheduleConflict };

const { createAppError } = require('../errors');
const { validateUUID } = require('./cadastros.validator');

const STATUS_TRANSITIONS = ['no_show', 'cancelado', 'reagendado', 'confirmado', 'concluido'];

function validateCreateAgendamentoPayload(body) {
  if (!body || typeof body !== 'object') throw createAppError('INVALID_PAYLOAD', 'Payload inválido.', 400);
  const { clienteId, servicoId, profissionalId, data, horario, duracaoMin, permitirConflito } = body;

  if (!servicoId) throw createAppError('SERVICE_ID_REQUIRED', 'servicoId obrigatório.', 422);
  if (!profissionalId) throw createAppError('PROFESSIONAL_REQUIRED', 'profissionalId obrigatório.', 422);
  if (!data) throw createAppError('DATE_REQUIRED', 'data obrigatória.', 422);
  if (!horario) throw createAppError('TIME_REQUIRED', 'horario obrigatório.', 422);
  if (duracaoMin !== undefined && (!Number.isInteger(Number(duracaoMin)) || Number(duracaoMin) <= 0)) {
    throw createAppError('INVALID_DURATION', 'duracaoMin deve ser inteiro maior que zero.', 422);
  }

  return {
    clienteId: clienteId || null,
    servicoId,
    profissionalId,
    data,
    horario,
    duracaoMin: duracaoMin !== undefined ? Number(duracaoMin) : undefined,
    permitirConflito: permitirConflito === true
  };
}

function validateStatusChangePayload(body) {
  const novoStatus = body && body.novoStatus;
  if (!STATUS_TRANSITIONS.includes(novoStatus)) {
    throw createAppError('INVALID_STATUS', `novoStatus inválido: ${novoStatus}`, 422, { allowed: STATUS_TRANSITIONS });
  }
  return { novoStatus };
}

function validateReagendamentoPayload(body) {
  const { novaData, novoHorario, novoServicoId, novoProfissionalId, permitirConflito } = body || {};
  if (!novaData) throw createAppError('DATE_REQUIRED', 'novaData obrigatória para reagendamento.', 422);
  if (!novoHorario) throw createAppError('TIME_REQUIRED', 'novoHorario obrigatório para reagendamento.', 422);
  return {
    novaData,
    novoHorario,
    novoServicoId: novoServicoId || null,
    novoProfissionalId: novoProfissionalId || null,
    permitirConflito: permitirConflito === true
  };
}

function validateSlotsQuery(query) {
  const { data, profissionalId, servicoId, duracaoMin } = query || {};
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(String(data)) || Number.isNaN(Date.parse(`${data}T00:00:00Z`))) {
    throw createAppError('DATE_REQUIRED', 'data obrigatória no formato YYYY-MM-DD.', 422);
  }
  if (!profissionalId) throw createAppError('PROFESSIONAL_REQUIRED', 'profissionalId obrigatório.', 422);
  if (!servicoId) throw createAppError('SERVICE_ID_REQUIRED', 'servicoId obrigatório.', 422);
  const dur = duracaoMin !== undefined && duracaoMin !== '' ? Number(duracaoMin) : undefined;
  if (dur !== undefined && (!Number.isInteger(dur) || dur < 5 || dur > 480)) {
    throw createAppError('INVALID_DURATION', 'duracaoMin deve ser inteiro entre 5 e 480.', 422);
  }
  return { data: String(data), profissionalId: validateUUID(profissionalId, 'profissionalId'), servicoId: validateUUID(servicoId, 'servicoId'), duracaoMin: dur };
}

module.exports = { STATUS_TRANSITIONS, validateSlotsQuery, validateCreateAgendamentoPayload, validateStatusChangePayload, validateReagendamentoPayload };

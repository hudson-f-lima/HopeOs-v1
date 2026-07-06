const { createAppError } = require('../errors');

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

module.exports = { STATUS_TRANSITIONS, validateCreateAgendamentoPayload, validateStatusChangePayload, validateReagendamentoPayload };

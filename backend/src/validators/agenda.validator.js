const { createAppError } = require('../errors');
const { validateUUID } = require('./cadastros.validator');

// Máquina de estados da agenda (D-011/D-012). Para cada destino, de onde pode vir.
// Presença (spec "Recepção/telemetria de cadeira"): aguardando = cliente chegou
// (check-in), em_atendimento = na cadeira. Os dois já existem no CHECK da 001.
// Regras que protegem o histórico (régua de faltas, retenção, confiabilidade):
// - concluido/fechado (pago) e reagendado (substituído) são finais;
// - quem já fez check-in não vira no_show;
// - cancelado e no_show não "ressuscitam".
const TRANSICOES = {
  confirmado: ['agendado'],
  aguardando: ['agendado', 'confirmado'],
  em_atendimento: ['agendado', 'confirmado', 'aguardando'],
  no_show: ['agendado', 'confirmado'],
  cancelado: ['agendado', 'confirmado', 'aguardando'],
  reagendado: ['agendado', 'confirmado', 'aguardando'],
  concluido: ['agendado', 'confirmado', 'aguardando', 'em_atendimento']
};
const STATUS_TRANSITIONS = Object.keys(TRANSICOES);
const STATUS_FINAIS = ['concluido', 'fechado', 'reagendado'];

function assertTransicaoStatus(statusAtual, novoStatus) {
  const origens = TRANSICOES[novoStatus] || [];
  if (!origens.includes(statusAtual)) {
    throw createAppError('INVALID_STATUS_TRANSITION', `Agendamento ${statusAtual} não pode ir para ${novoStatus}.`, 409, { de: statusAtual, para: novoStatus, permitidoDe: origens });
  }
}

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

module.exports = { TRANSICOES, STATUS_TRANSITIONS, STATUS_FINAIS, assertTransicaoStatus, validateSlotsQuery, validateCreateAgendamentoPayload, validateStatusChangePayload, validateReagendamentoPayload };

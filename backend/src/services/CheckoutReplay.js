const { isDeepStrictEqual } = require('node:util');
const { createAppError } = require('../errors');

// O retrier confirma a intenção original, não refaz a conta com preços/estoque de agora.
function intent(payload) {
  return {
    clienteId: payload.clienteId || payload.cliente_id || null,
    agendamentoId: payload.agendamentoId || null,
    itens: payload.itens,
    payments: payload.payments,
    descontoCentavos: Number(payload.descontoCentavos ?? payload.desconto_centavos ?? 0),
    gorjetaCentavos: Number(payload.gorjetaCentavos ?? payload.gorjeta_centavos ?? 0)
  };
}

async function checkoutAnterior(repo, auth, payload) {
  const key = payload.idempotencyKey || payload.idempotency_key;
  if (!key) return null;
  const rows = await repo.list('comandos', { empresa_id: repo.empresaId, idempotency_key: key });
  if (!rows.length) return null; // a RPC mantém a garantia atômica para requisições concorrentes
  const command = rows[0];
  const mesmoAtor = auth.principal_type === 'user'
    ? command.actor_id === auth.actor_id
    : auth.principal_type === 'integration'
      ? command.actor_integration_id === auth.integration_id
      : !command.actor_id && !command.actor_integration_id;
  const original = command.snapshot?.request?.raw;
  const preview = command.snapshot?.preview;
  if (rows.length !== 1 || !mesmoAtor || !original || !preview || !isDeepStrictEqual(intent(original), intent(payload))) {
    throw createAppError('IDEMPOTENCY_MISMATCH', 'Este fechamento precisa ser conferido no caixa. A chave não pode ser reutilizada com outra intenção ou autor.', 409);
  }
  return {
    preview,
    saved: { idempotent: true, comandoId: command.id, status: command.status },
    agendamentoConcluido: null,
    vinculoAgenda: null
  };
}

module.exports = { checkoutAnterior };

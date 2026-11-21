const { isDeepStrictEqual } = require('node:util');
const { createHash } = require('node:crypto');
const { previewCheckout } = require('../engines/FinanceEngine');
const { createAppError } = require('../errors');

function agendamentoDoCheckout(payload) {
  const id = payload.agendamentoId;
  if (id === undefined || id === null || id === '') return null;
  return typeof id === 'string' ? id.trim().toLowerCase() : id;
}

// UUIDv8 de uso interno. A PK de comandos arbitra o fechamento financeiro
// dentro da RPC, mesmo quando operadores usam chaves de idempotência diferentes.
function comandoIdDoAgendamento(empresaId, agendamentoId) {
  const bytes = createHash('sha256').update(`checkout-agendamento:v1:${empresaId.toLowerCase()}:${agendamentoId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const AGENDAMENTO_COMANDA_JA_FECHADA = 'AGENDAMENTO_COMANDA_JA_FECHADA';
function conflitoComandaDoAgendamento() {
  return createAppError(AGENDAMENTO_COMANDA_JA_FECHADA, 'O agendamento já tem um fechamento registrado ou consta como concluído. Confira no caixa antes de prosseguir.', 409);
}

// O retrier confirma a intenção original, não refaz a conta com preços/estoque de agora.
function intent(payload) {
  return {
    clienteId: payload.clienteId || payload.cliente_id || null,
    agendamentoId: agendamentoDoCheckout(payload),
    itens: payload.itens,
    payments: payload.payments,
    descontoCentavos: Number(payload.descontoCentavos ?? payload.desconto_centavos ?? 0),
    gorjetaCentavos: Number(payload.gorjetaCentavos ?? payload.gorjeta_centavos ?? 0)
  };
}

// Vincula a revisão exibida pela PWA ao cálculo financeiro conferido no fechamento.
function revisaoFinanceira(preview, cobertura) {
  const { itens, totals, payments, gorjetas } = preview;
  const dados = JSON.stringify([itens, totals, payments, gorjetas, cobertura.itens, cobertura.usos]);
  return createHash('sha256').update(dados).digest('hex');
}

function mesmaRevisao(original, preview, pedido) {
  const solicitada = pedido.revisaoFinanceira ?? null;
  if (Object.hasOwn(original, 'revisaoFinanceira')) return original.revisaoFinanceira === solicitada;
  if (solicitada === null) return true;
  // A D-057 inicial gravava preview em jsonb (sem ordem de chaves), sem o hash
  // nem a avaliação da cobertura. Sem plano, todo insumo está no recibo.
  if (original.itens.some(item => item.assinaturaId)) return false;
  try {
    const reconstituido = previewCheckout({
      itens: preview.itens.map(item => ({ ...item, _trustedSource: 'server_catalog' })),
      payments: preview.payments,
      formasPagamento: preview.payments,
      descontoCentavos: preview.totals.descontoCentavos,
      gorjetaCentavos: preview.totals.gorjetaBrutaCentavos
    });
    // O recibo incompleto ou de outra versão do cálculo exige conferência.
    const campos = ['itens', 'payments', 'totals', 'gorjetas'];
    const registrado = campos.map(campo => preview[campo]);
    const calculado = campos.map(campo => reconstituido[campo]);
    if (!isDeepStrictEqual(registrado, JSON.parse(JSON.stringify(calculado)))) return false;
    return solicitada === revisaoFinanceira(reconstituido, { itens: [], usos: [] });
  } catch {
    return false;
  }
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
  if (rows.length !== 1 || !mesmoAtor || !original || !preview || !isDeepStrictEqual(intent(original), intent(payload)) || !mesmaRevisao(original, preview, payload)) {
    throw createAppError('IDEMPOTENCY_MISMATCH', 'Confira o fechamento no caixa antes de tentar outra cobrança. A chave, o autor e a revisão precisam corresponder ao comprovante original.', 409);
  }
  return {
    preview,
    saved: { idempotent: true, comandoId: command.id, status: command.status },
    agendamentoConcluido: null,
    vinculoAgenda: null
  };
}

module.exports = { checkoutAnterior, revisaoFinanceira, comandoIdDoAgendamento, agendamentoDoCheckout, conflitoComandaDoAgendamento, AGENDAMENTO_COMANDA_JA_FECHADA };

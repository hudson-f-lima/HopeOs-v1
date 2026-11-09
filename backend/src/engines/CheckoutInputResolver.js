const { roundCents } = require('./money');
const { createAppError } = require('../errors');
const { resolveProductItem } = require('./ProductEngine');
const { assertInventoryForResolvedItems } = require('./InventoryEngine');
const { resolveComissaoPct } = require('./CommissionResolver');

function rowId(row) {
  return row?.id || row?.code || row?.servico_id || row?.profissional_id;
}

function findRequired(rows, id, label, code = 'REFERENCE_NOT_FOUND') {
  const found = (rows || []).find(row => rowId(row) === id || row?.code === id);
  if (!found) throw createAppError(code, `${label} não encontrado: ${id}`, 422, { id, label });
  return found;
}

function parseOverrides(profissional) {
  const raw = profissional?.overrides || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw || '{}'); }
    catch { return {}; }
  }
  return raw || {};
}

function serviceAllowedForProfessional({ profissionalId, servicoId, profissionalServicos }) {
  const links = profissionalServicos || [];
  if (!links.length) return true;
  return links.some(link =>
    (link.profissional_id || link.profissionalId) === profissionalId &&
    (link.servico_id || link.servicoId) === servicoId
  );
}

function resolveServiceProfessionalItem({ payloadItem, servicos, profissionais, profissionalServicos, cargos = [], categorias = [] }) {
  const servicoId = payloadItem.servicoId || payloadItem.servico_id;
  const profissionalId = payloadItem.profissionalId || payloadItem.profissional_id;
  const servico = findRequired(servicos, servicoId, 'Serviço', 'SERVICE_NOT_FOUND');
  const profissional = findRequired(profissionais, profissionalId, 'Profissional', 'PROFESSIONAL_NOT_FOUND');

  if (servico.ativo === false) {
    throw createAppError('SERVICE_INACTIVE', `Serviço inativo: ${servicoId}`, 422, { servicoId });
  }
  if (profissional.ativo === false) {
    throw createAppError('PROFESSIONAL_INACTIVE', `Profissional inativo: ${profissionalId}`, 422, { profissionalId });
  }
  if (!serviceAllowedForProfessional({ profissionalId, servicoId, profissionalServicos })) {
    throw createAppError('SERVICE_NOT_ALLOWED_FOR_PROFESSIONAL', 'Serviço não vinculado ao profissional.', 422, { servicoId, profissionalId });
  }

  const overrides = parseOverrides(profissional);
  const override = overrides[servicoId] || overrides[String(servicoId)] || {};

  const precoUnitarioCentavos = roundCents(
    override.valor_centavos ?? override.valorCentavos ?? servico.valor_centavos ?? servico.valorCentavos ?? 0
  );
  const duracaoMin = Number(
    override.duracao_min ?? override.duracaoMin ?? servico.duracao_min ?? servico.duracaoMin ?? servico.duracao ?? 0
  );
  const { pct: comissaoPct, origem: comissaoOrigem } = resolveComissaoPct({ servico, profissional, override, cargos, categorias });
  const modeloComissao = profissional.modelo_comissao || profissional.modeloComissao || 'bruto_salao';

  return {
    _trustedSource: 'server_catalog',
    tipo: 'servico',
    id: payloadItem.id,
    servicoId,
    produtoId: null,
    profissionalId,
    quantidade: 1,
    descricao: servico.nome || servico.label || 'Serviço',
    precoUnitarioCentavos,
    custoUnitarioCentavos: 0,
    totalVendaCentavos: precoUnitarioCentavos,
    totalCustoCentavos: 0,
    lucroBrutoCentavos: precoUnitarioCentavos,
    valorBrutoCentavos: precoUnitarioCentavos,
    duracaoMin,
    comissaoPct,
    comissaoOrigem,
    modeloComissao
  };
}

function resolveCheckoutItem(args) {
  const tipo = args.payloadItem.tipo || args.payloadItem.type;
  if (tipo === 'servico') return resolveServiceProfessionalItem(args);
  if (tipo === 'produto') return resolveProductItem({
    payloadItem: args.payloadItem,
    produtos: args.produtos,
    profissionais: args.profissionais
  });
  throw createAppError('INVALID_ITEM_TYPE', `Tipo de item inválido: ${tipo}`, 422, { tipo });
}

function resolveCheckoutInput({ payload, servicos, profissionais, profissionalServicos = [], formasPagamento, produtos = [], cargos = [], categorias = [] }) {
  const resolvedItems = (payload.itens || []).map(item => resolveCheckoutItem({
    payloadItem: item,
    servicos,
    profissionais,
    profissionalServicos,
    produtos,
    cargos,
    categorias
  }));

  assertInventoryForResolvedItems(resolvedItems);

  const allowedPaymentCodes = new Set((formasPagamento || []).map(f => f.code || f.id || f.formaCode));
  const invalidPayments = (payload.payments || []).filter(p => !allowedPaymentCodes.has(p.formaCode || p.formaId || p.code || p.id));
  if (invalidPayments.length) {
    throw createAppError('PAYMENT_METHOD_NOT_FOUND', 'Forma de pagamento não encontrada no banco.', 422, {
      forms: invalidPayments.map(p => p.formaCode || p.formaId || p.code || p.id)
    });
  }

  // Desconto e gorjeta são valores informados pelo operador: precisam ser
  // inteiros >= 0, e o desconto não pode passar do total dos itens. Antes a
  // gorjeta negativa virava um desconto escondido (recebido < receita
  // registrada) e o desconto excedente era cortado em silêncio (D-012).
  const descontoCentavos = valorOperador(payload.descontoCentavos ?? payload.desconto_centavos ?? 0, 'descontoCentavos');
  const gorjetaCentavos = valorOperador(payload.gorjetaCentavos ?? payload.gorjeta_centavos ?? 0, 'gorjetaCentavos');
  const totalItens = resolvedItems.reduce((acc, i) => acc + (Number(i.valorBrutoCentavos) || 0), 0);
  if (descontoCentavos > totalItens) {
    throw createAppError('INVALID_DISCOUNT', 'Desconto maior que o total dos itens.', 422, { descontoCentavos, totalItensCentavos: totalItens });
  }

  return {
    clienteId: payload.clienteId || payload.cliente_id || null,
    data: payload.data,
    hora: payload.hora,
    id: payload.id,
    idempotencyKey: payload.idempotencyKey || payload.idempotency_key || null,
    itens: resolvedItems,
    payments: payload.payments,
    formasPagamento,
    descontoCentavos,
    gorjetaCentavos
  };
}

function valorOperador(valor, campo) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) {
    throw createAppError('INVALID_FIELD', `${campo} deve ser inteiro em centavos e não negativo.`, 422, { campo });
  }
  return n;
}

module.exports = { resolveCheckoutInput, resolveServiceProfessionalItem, resolveCheckoutItem };

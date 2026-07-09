const { createAppError } = require('../errors');

const MODELOS_COMISSAO = new Set(['bruto_salao', 'dividido', 'bruto_staff']);
const ESTOQUE_TIPOS = new Set(['entrada', 'ajuste', 'perda']);

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUUID(value, field = 'id') {
  if (typeof value !== 'string' || !UUID_REGEX.test(value.trim())) {
    throw createAppError('INVALID_UUID', `${field} deve ser um UUID valido.`, 422, { field, value });
  }
  return value.trim().toLowerCase();
}

function rejectDangerousFields(payload, forbidden, code = 'FORBIDDEN_FIELD') {
  for (const field of forbidden) {
    if (hasOwn(payload, field)) {
      throw createAppError(code, `Campo proibido no payload: ${field}`, 422, { field });
    }
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw createAppError('INVALID_FIELD', `${field} obrigatorio.`, 422, { field });
  }
  return value.trim();
}

function optionalString(payload, inputKey, outputKey, out) {
  if (hasOwn(payload, inputKey)) out[outputKey] = payload[inputKey] === null ? null : String(payload[inputKey]).trim();
}

function intField(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw createAppError('INVALID_FIELD', `${field} obrigatorio.`, 422, { field });
    return undefined;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw createAppError('INVALID_FIELD', `${field} deve ser inteiro entre ${min} e ${max}.`, 422, { field, value });
  }
  return n;
}

function numberField(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw createAppError('INVALID_FIELD', `${field} obrigatorio.`, 422, { field });
    return undefined;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw createAppError('INVALID_FIELD', `${field} deve estar entre ${min} e ${max}.`, 422, { field, value });
  }
  return n;
}

function boolField(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'boolean') {
    throw createAppError('INVALID_FIELD', `${field} deve ser booleano.`, 422, { field, value });
  }
  return value;
}

function jsonObjectField(value, field) {
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value)) {
    throw createAppError('INVALID_FIELD', `${field} deve ser objeto JSON.`, 422, { field });
  }
  return value;
}

function modeloComissao(value, field = 'modeloComissao') {
  if (value === undefined || value === null || value === '') return undefined;
  if (!MODELOS_COMISSAO.has(value)) {
    throw createAppError('INVALID_COMMISSION_MODEL', `${field} invalido.`, 422, { field, value });
  }
  return value;
}

function codeForma(value) {
  const code = nonEmptyString(value, 'code');
  if (!/^[a-z0-9_]+$/.test(code)) {
    throw createAppError('INVALID_PAYMENT_CODE', 'code deve ser minusculo, sem espacos, usando letras, numeros ou _.', 422, { code });
  }
  return code;
}

function withUpdatedAt(out) {
  out.updated_at = new Date().toISOString();
  return out;
}

function rejectOverridesField(payload) {
  if (hasOwn(payload, 'overrides')) {
    throw createAppError(
      'OVERRIDES_FIELD_FORBIDDEN',
      'Use o endpoint dedicado de override do servico do profissional.',
      422,
      { field: 'overrides' }
    );
  }
}

function validateCreateClientePayload(payload = {}) {
  rejectDangerousFields(payload, ['id', 'empresa_id', 'empresaId']);
  const out = {
    nome: nonEmptyString(payload.nome, 'nome'),
    faltas: intField(payload.faltas ?? 0, 'faltas', { min: 0 }),
    ativo: payload.ativo === undefined ? true : boolField(payload.ativo, 'ativo')
  };
  optionalString(payload, 'whatsapp', 'whatsapp', out);
  optionalString(payload, 'observacoes', 'observacoes', out);
  return withUpdatedAt(out);
}

function validateUpdateClientePayload(payload = {}) {
  rejectDangerousFields(payload, ['id', 'empresa_id', 'empresaId']);
  const out = {};
  if (hasOwn(payload, 'nome')) out.nome = nonEmptyString(payload.nome, 'nome');
  optionalString(payload, 'whatsapp', 'whatsapp', out);
  optionalString(payload, 'observacoes', 'observacoes', out);
  if (hasOwn(payload, 'faltas')) out.faltas = intField(payload.faltas, 'faltas', { min: 0 });
  if (hasOwn(payload, 'ativo')) out.ativo = boolField(payload.ativo, 'ativo');
  if (!Object.keys(out).length) throw createAppError('EMPTY_UPDATE', 'Nenhum campo valido para atualizar.', 422);
  return withUpdatedAt(out);
}

function validateCreateServicoPayload(payload = {}) {
  rejectDangerousFields(payload, ['id', 'empresa_id', 'empresaId']);
  const out = {
    nome: nonEmptyString(payload.nome, 'nome'),
    categoria: payload.categoria ? String(payload.categoria).trim() : 'Sem categoria',
    valor_centavos: intField(payload.valorCentavos ?? payload.valor_centavos, 'valorCentavos', { min: 0, required: true }),
    duracao_min: intField(payload.duracaoMin ?? payload.duracao_min, 'duracaoMin', { min: 5, max: 480, required: true }),
    slot_min: intField(payload.slotMin ?? payload.slot_min ?? payload.duracaoMin ?? payload.duracao_min, 'slotMin', { min: 5, max: 480 }),
    comissao_pct: numberField(payload.comissaoPct ?? payload.comissao_pct ?? 0, 'comissaoPct', { min: 0, max: 100 }),
    ativo: payload.ativo === undefined ? true : boolField(payload.ativo, 'ativo')
  };
  return withUpdatedAt(out);
}

function validateUpdateServicoPayload(payload = {}) {
  rejectDangerousFields(payload, ['id', 'empresa_id', 'empresaId']);
  const out = {};
  if (hasOwn(payload, 'nome')) out.nome = nonEmptyString(payload.nome, 'nome');
  optionalString(payload, 'categoria', 'categoria', out);
  if (hasOwn(payload, 'valorCentavos') || hasOwn(payload, 'valor_centavos')) out.valor_centavos = intField(payload.valorCentavos ?? payload.valor_centavos, 'valorCentavos', { min: 0 });
  if (hasOwn(payload, 'duracaoMin') || hasOwn(payload, 'duracao_min')) out.duracao_min = intField(payload.duracaoMin ?? payload.duracao_min, 'duracaoMin', { min: 5, max: 480 });
  if (hasOwn(payload, 'slotMin') || hasOwn(payload, 'slot_min')) out.slot_min = intField(payload.slotMin ?? payload.slot_min, 'slotMin', { min: 5, max: 480 });
  if (hasOwn(payload, 'comissaoPct') || hasOwn(payload, 'comissao_pct')) out.comissao_pct = numberField(payload.comissaoPct ?? payload.comissao_pct, 'comissaoPct', { min: 0, max: 100 });
  if (hasOwn(payload, 'ativo')) out.ativo = boolField(payload.ativo, 'ativo');
  if (!Object.keys(out).length) throw createAppError('EMPTY_UPDATE', 'Nenhum campo valido para atualizar.', 422);
  return withUpdatedAt(out);
}

function validateCreateProfissionalPayload(payload = {}) {
  rejectDangerousFields(payload, ['id', 'empresa_id', 'empresaId']);
  rejectOverridesField(payload);
  const out = {
    nome: nonEmptyString(payload.nome, 'nome'),
    modelo_comissao: modeloComissao(payload.modeloComissao ?? payload.modelo_comissao ?? 'bruto_salao'),
    horario: jsonObjectField(payload.horario ?? {}, 'horario') || {},
    overrides: {},
    ativo: payload.ativo === undefined ? true : boolField(payload.ativo, 'ativo')
  };
  optionalString(payload, 'whatsapp', 'whatsapp', out);
  return withUpdatedAt(out);
}

function validateUpdateProfissionalPayload(payload = {}) {
  rejectDangerousFields(payload, ['id', 'empresa_id', 'empresaId']);
  rejectOverridesField(payload);
  const out = {};
  if (hasOwn(payload, 'nome')) out.nome = nonEmptyString(payload.nome, 'nome');
  optionalString(payload, 'whatsapp', 'whatsapp', out);
  if (hasOwn(payload, 'modeloComissao') || hasOwn(payload, 'modelo_comissao')) out.modelo_comissao = modeloComissao(payload.modeloComissao ?? payload.modelo_comissao);
  if (hasOwn(payload, 'horario')) out.horario = jsonObjectField(payload.horario, 'horario');
  if (hasOwn(payload, 'ativo')) out.ativo = boolField(payload.ativo, 'ativo');
  if (!Object.keys(out).length) throw createAppError('EMPTY_UPDATE', 'Nenhum campo valido para atualizar.', 422);
  return withUpdatedAt(out);
}

function validateCreateProdutoPayload(payload = {}) {
  rejectDangerousFields(payload, ['id', 'empresa_id', 'empresaId', 'estoque_atual', 'estoqueAtual']);
  const custo = intField(payload.custoCentavos ?? payload.custo_centavos, 'custoCentavos', { min: 0, required: true });
  const preco = intField(payload.precoVendaCentavos ?? payload.preco_venda_centavos, 'precoVendaCentavos', { min: 0, required: true });
  const ativo = payload.ativo === undefined ? true : boolField(payload.ativo, 'ativo');
  if (ativo && preco < custo) throw createAppError('PRODUCT_BELOW_COST', 'Produto ativo nao pode vender abaixo do custo.', 422);
  const estoqueInicial = intField(payload.estoqueInicial ?? 0, 'estoqueInicial', { min: 0 });
  const out = {
    nome: nonEmptyString(payload.nome, 'nome'),
    categoria: payload.categoria ? String(payload.categoria).trim() : 'Sem categoria',
    custo_centavos: custo,
    preco_venda_centavos: preco,
    estoque_atual: 0,
    estoque_minimo: intField(payload.estoqueMinimo ?? payload.estoque_minimo ?? 0, 'estoqueMinimo', { min: 0 }),
    comissao_pct: numberField(payload.comissaoPct ?? payload.comissao_pct ?? 0, 'comissaoPct', { min: 0, max: 100 }),
    modelo_comissao: modeloComissao(payload.modeloComissao ?? payload.modelo_comissao ?? 'bruto_salao'),
    controla_estoque: payload.controlaEstoque === undefined && payload.controla_estoque === undefined ? true : boolField(payload.controlaEstoque ?? payload.controla_estoque, 'controlaEstoque'),
    ativo
  };
  optionalString(payload, 'sku', 'sku', out);
  optionalString(payload, 'codigoBarras', 'codigo_barras', out);
  optionalString(payload, 'codigo_barras', 'codigo_barras', out);
  return { produto: withUpdatedAt(out), estoqueInicial };
}

function validateUpdateProdutoPayload(payload = {}) {
  rejectDangerousFields(payload, ['id', 'empresa_id', 'empresaId', 'estoque_atual', 'estoqueAtual', 'estoqueInicial']);
  const out = {};
  if (hasOwn(payload, 'nome')) out.nome = nonEmptyString(payload.nome, 'nome');
  optionalString(payload, 'sku', 'sku', out);
  optionalString(payload, 'codigoBarras', 'codigo_barras', out);
  optionalString(payload, 'codigo_barras', 'codigo_barras', out);
  optionalString(payload, 'categoria', 'categoria', out);
  if (hasOwn(payload, 'custoCentavos') || hasOwn(payload, 'custo_centavos')) out.custo_centavos = intField(payload.custoCentavos ?? payload.custo_centavos, 'custoCentavos', { min: 0 });
  if (hasOwn(payload, 'precoVendaCentavos') || hasOwn(payload, 'preco_venda_centavos')) out.preco_venda_centavos = intField(payload.precoVendaCentavos ?? payload.preco_venda_centavos, 'precoVendaCentavos', { min: 0 });
  if (hasOwn(payload, 'estoqueMinimo') || hasOwn(payload, 'estoque_minimo')) out.estoque_minimo = intField(payload.estoqueMinimo ?? payload.estoque_minimo, 'estoqueMinimo', { min: 0 });
  if (hasOwn(payload, 'comissaoPct') || hasOwn(payload, 'comissao_pct')) out.comissao_pct = numberField(payload.comissaoPct ?? payload.comissao_pct, 'comissaoPct', { min: 0, max: 100 });
  if (hasOwn(payload, 'modeloComissao') || hasOwn(payload, 'modelo_comissao')) out.modelo_comissao = modeloComissao(payload.modeloComissao ?? payload.modelo_comissao);
  if (hasOwn(payload, 'controlaEstoque') || hasOwn(payload, 'controla_estoque')) out.controla_estoque = boolField(payload.controlaEstoque ?? payload.controla_estoque, 'controlaEstoque');
  if (hasOwn(payload, 'ativo')) out.ativo = boolField(payload.ativo, 'ativo');
  if (!Object.keys(out).length) throw createAppError('EMPTY_UPDATE', 'Nenhum campo valido para atualizar.', 422);
  if (out.preco_venda_centavos !== undefined && out.custo_centavos !== undefined && out.ativo !== false && out.preco_venda_centavos < out.custo_centavos) {
    throw createAppError('PRODUCT_BELOW_COST', 'Produto ativo nao pode vender abaixo do custo.', 422);
  }
  return withUpdatedAt(out);
}

function validateEstoqueAjustePayload(payload = {}) {
  rejectDangerousFields(payload, ['id', 'empresa_id', 'empresaId', 'estoque_atual', 'estoqueAtual']);
  const tipo = nonEmptyString(payload.tipo, 'tipo');
  if (!ESTOQUE_TIPOS.has(tipo)) throw createAppError('INVALID_STOCK_ADJUSTMENT_TYPE', 'Tipo de ajuste de estoque invalido.', 422, { tipo });
  return {
    tipo,
    quantidade: intField(payload.quantidade, 'quantidade', { min: 1, required: true }),
    custo_unitario_centavos: intField(payload.custoUnitarioCentavos ?? payload.custo_unitario_centavos ?? 0, 'custoUnitarioCentavos', { min: 0 }),
    motivo: payload.motivo ? String(payload.motivo).trim() : null
  };
}

function validateCreateFormaPagamentoPayload(payload = {}) {
  rejectDangerousFields(payload, ['id', 'empresa_id', 'empresaId']);
  return {
    code: codeForma(payload.code),
    label: nonEmptyString(payload.label ?? payload.nome, 'label'),
    icon: payload.icon ? String(payload.icon) : null,
    taxa_pct: numberField(payload.taxaPct ?? payload.taxa_pct ?? 0, 'taxaPct', { min: 0 }),
    taxa_fixa_centavos: intField(payload.taxaFixaCentavos ?? payload.taxa_fixa_centavos ?? 0, 'taxaFixaCentavos', { min: 0 }),
    dias_recebimento: intField(payload.diasRecebimento ?? payload.dias_recebimento ?? 0, 'diasRecebimento', { min: 0 }),
    ativo: payload.ativo === undefined ? true : boolField(payload.ativo, 'ativo')
  };
}

function validateUpdateFormaPagamentoPayload(payload = {}) {
  rejectDangerousFields(payload, ['id', 'empresa_id', 'empresaId', 'code']);
  const out = {};
  if (hasOwn(payload, 'label') || hasOwn(payload, 'nome')) out.label = nonEmptyString(payload.label ?? payload.nome, 'label');
  if (hasOwn(payload, 'icon')) out.icon = payload.icon ? String(payload.icon) : null;
  if (hasOwn(payload, 'taxaPct') || hasOwn(payload, 'taxa_pct')) out.taxa_pct = numberField(payload.taxaPct ?? payload.taxa_pct, 'taxaPct', { min: 0 });
  if (hasOwn(payload, 'taxaFixaCentavos') || hasOwn(payload, 'taxa_fixa_centavos')) out.taxa_fixa_centavos = intField(payload.taxaFixaCentavos ?? payload.taxa_fixa_centavos, 'taxaFixaCentavos', { min: 0 });
  if (hasOwn(payload, 'diasRecebimento') || hasOwn(payload, 'dias_recebimento')) out.dias_recebimento = intField(payload.diasRecebimento ?? payload.dias_recebimento, 'diasRecebimento', { min: 0 });
  if (hasOwn(payload, 'ativo')) out.ativo = boolField(payload.ativo, 'ativo');
  if (!Object.keys(out).length) throw createAppError('EMPTY_UPDATE', 'Nenhum campo valido para atualizar.', 422);
  return out;
}

function validateProfissionalServicosPayload(payload = {}) {
  if (!Array.isArray(payload.servicoIds)) {
    throw createAppError('INVALID_SERVICE_LINKS', 'servicoIds deve ser uma lista.', 422);
  }
  if (payload.servicoIds.length === 0 && payload.confirmarSubstituicaoTotal !== true) {
    throw createAppError('EMPTY_SERVICE_LINKS', 'Lista vazia apagara todos os vinculos. Envie confirmarSubstituicaoTotal: true se for intencional.', 422);
  }
  const servicoIds = payload.servicoIds.map(id => validateUUID(String(id), 'servicoIds'));
  if (new Set(servicoIds).size !== servicoIds.length) {
    throw createAppError('DUPLICATE_SERVICE_LINK', 'servicoIds nao pode conter duplicidade.', 422);
  }
  return { servicoIds };
}

function validateProfissionalServicoOverridePayload(payload = {}) {
  rejectDangerousFields(payload, ['id', 'empresa_id', 'empresaId', 'servico_id', 'profissional_id']);
  if (payload.remover === true) return { remover: true };
  const override = {};
  if (hasOwn(payload, 'valorCentavos') || hasOwn(payload, 'valor_centavos')) override.valor_centavos = intField(payload.valorCentavos ?? payload.valor_centavos, 'valorCentavos', { min: 0 });
  if (hasOwn(payload, 'duracaoMin') || hasOwn(payload, 'duracao_min')) override.duracao_min = intField(payload.duracaoMin ?? payload.duracao_min, 'duracaoMin', { min: 5, max: 480 });
  if (hasOwn(payload, 'comissaoPct') || hasOwn(payload, 'comissao_pct')) override.comissao_pct = numberField(payload.comissaoPct ?? payload.comissao_pct, 'comissaoPct', { min: 0, max: 100 });
  if (!Object.keys(override).length) throw createAppError('EMPTY_OVERRIDE', 'Informe ao menos um campo de override ou remover=true.', 422);
  return { override };
}

// F4.4 — lista_espera (001_init.sql): sem coluna updated_at, nao usar withUpdatedAt aqui.
const LISTA_ESPERA_STATUS = new Set(['aguardando', 'contatado', 'agendado', 'cancelado']);

function dateOnlyField(value, field) {
  if (value === undefined || value === null || value === '') return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    throw createAppError('INVALID_FIELD', `${field} deve estar no formato YYYY-MM-DD.`, 422, { field, value });
  }
  return String(value);
}

function validateCreateListaEsperaPayload(payload = {}) {
  rejectDangerousFields(payload, ['id', 'empresa_id', 'empresaId', 'status', 'created_at']);
  const out = {
    cliente_id: validateUUID(payload.clienteId ?? payload.cliente_id, 'clienteId'),
    servico_id: validateUUID(payload.servicoId ?? payload.servico_id, 'servicoId'),
    status: 'aguardando'
  };
  if (hasOwn(payload, 'profissionalId') || hasOwn(payload, 'profissional_id')) {
    out.profissional_id = validateUUID(payload.profissionalId ?? payload.profissional_id, 'profissionalId');
  }
  const dataPreferencia = dateOnlyField(payload.dataPreferencia ?? payload.data_preferencia, 'dataPreferencia');
  if (dataPreferencia !== undefined) out.data_preferencia = dataPreferencia;
  optionalString(payload, 'observacoes', 'observacoes', out);
  return out;
}

function validateUpdateListaEsperaPayload(payload = {}) {
  rejectDangerousFields(payload, ['id', 'empresa_id', 'empresaId', 'clienteId', 'cliente_id', 'servicoId', 'servico_id', 'created_at']);
  const out = {};
  if (hasOwn(payload, 'status')) {
    const status = nonEmptyString(payload.status, 'status');
    if (!LISTA_ESPERA_STATUS.has(status)) throw createAppError('INVALID_WAITLIST_STATUS', 'status invalido.', 422, { status });
    out.status = status;
  }
  if (hasOwn(payload, 'profissionalId') || hasOwn(payload, 'profissional_id')) {
    const raw = payload.profissionalId ?? payload.profissional_id;
    out.profissional_id = raw === null ? null : validateUUID(raw, 'profissionalId');
  }
  const dataPreferencia = dateOnlyField(payload.dataPreferencia ?? payload.data_preferencia, 'dataPreferencia');
  if (dataPreferencia !== undefined) out.data_preferencia = dataPreferencia;
  optionalString(payload, 'observacoes', 'observacoes', out);
  if (!Object.keys(out).length) throw createAppError('EMPTY_UPDATE', 'Nenhum campo valido para atualizar.', 422);
  return out;
}

module.exports = {
  validateUUID,
  validateCreateClientePayload,
  validateUpdateClientePayload,
  validateCreateServicoPayload,
  validateUpdateServicoPayload,
  validateCreateProfissionalPayload,
  validateUpdateProfissionalPayload,
  validateCreateProdutoPayload,
  validateUpdateProdutoPayload,
  validateEstoqueAjustePayload,
  validateCreateFormaPagamentoPayload,
  validateUpdateFormaPagamentoPayload,
  validateProfissionalServicosPayload,
  validateProfissionalServicoOverridePayload,
  validateCreateListaEsperaPayload,
  validateUpdateListaEsperaPayload
};

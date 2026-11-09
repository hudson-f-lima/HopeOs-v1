// Estorno de comanda (D-013). Normaliza o pedido antes da RPC comanda_estornar:
// a mesma intenção sempre gera o mesmo payload (a idempotência compara um hash dele).
const { createAppError } = require('../errors');
const { validateUUID } = require('./cadastros.validator');

const MOTIVOS = ['erro_lancamento', 'desistencia_cliente', 'insatisfacao', 'duplicidade', 'outro'];
const CAMPOS = ['tipo', 'motivoCodigo', 'motivo', 'idempotencyKey', 'devolverEstoque', 'itens', 'reembolsos', 'reembolsoForma'];

const invalido = (message, field) => createAppError('ESTORNO_PAYLOAD_INVALIDO', message, 422, field ? { field } : null);
const inteiroPositivo = v => Number.isInteger(v) && v > 0 && v <= 999999999;

function validateEstornoPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalido('Payload inválido.');
  const extra = Object.keys(body).find(k => !CAMPOS.includes(k));
  if (extra) throw createAppError('FORBIDDEN_FIELD', `Campo não permitido no estorno: ${extra}`, 422, { field: extra });

  const tipo = body.tipo;
  if (!['total', 'parcial'].includes(tipo)) throw invalido('tipo deve ser "total" ou "parcial".', 'tipo');
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
  if (!idempotencyKey || idempotencyKey.length > 200) throw createAppError('IDEMPOTENCY_KEY_REQUIRED', 'idempotencyKey é obrigatória (até 200 caracteres).', 422, { field: 'idempotencyKey' });
  if (!MOTIVOS.includes(body.motivoCodigo)) throw invalido(`motivoCodigo deve ser um de: ${MOTIVOS.join(', ')}.`, 'motivoCodigo');
  const motivo = typeof body.motivo === 'string' ? body.motivo.trim() : '';
  if (motivo.length < 10 || motivo.length > 500) throw invalido('motivo é obrigatório (10 a 500 caracteres).', 'motivo');

  const out = { idempotencyKey, tipo, motivoCodigo: body.motivoCodigo, motivo };
  if (tipo === 'total') {
    if (body.itens !== undefined || body.reembolsos !== undefined || body.reembolsoForma !== undefined) throw invalido('Estorno total não recebe itens nem reembolsos: o servidor calcula o saldo.', 'itens');
    if (body.devolverEstoque !== undefined && typeof body.devolverEstoque !== 'boolean') throw invalido('devolverEstoque deve ser booleano.', 'devolverEstoque');
    out.devolverEstoque = body.devolverEstoque !== false;
    return out;
  }

  if (body.devolverEstoque !== undefined) throw invalido('No parcial, use devolveEstoque por item.', 'devolverEstoque');
  if (!Array.isArray(body.itens) || !body.itens.length || body.itens.length > 200) throw createAppError('ESTORNO_ITENS_OBRIGATORIOS', 'Estorno parcial exige itens.', 422, { field: 'itens' });
  const itens = body.itens.map((it, i) => {
    if (!it || typeof it !== 'object') throw invalido(`Item ${i + 1} inválido.`, 'itens');
    const ex = Object.keys(it).find(k => !['comandoItemId', 'quantidade', 'devolveEstoque'].includes(k));
    if (ex) throw createAppError('FORBIDDEN_FIELD', `Campo não permitido no item: ${ex}`, 422, { field: ex });
    const comandoItemId = validateUUID(it.comandoItemId, 'comandoItemId');
    if (!inteiroPositivo(it.quantidade)) throw invalido('quantidade deve ser inteiro > 0.', 'quantidade');
    if (it.devolveEstoque !== undefined && typeof it.devolveEstoque !== 'boolean') throw invalido('devolveEstoque deve ser booleano.', 'devolveEstoque');
    return { comandoItemId, quantidade: it.quantidade, devolveEstoque: it.devolveEstoque !== false };
  }).sort((a, b) => a.comandoItemId.localeCompare(b.comandoItemId));
  if (new Set(itens.map(i => i.comandoItemId)).size !== itens.length) throw invalido('Item repetido.', 'itens');
  out.itens = itens;

  if (body.reembolsos !== undefined) {
    if (!Array.isArray(body.reembolsos) || body.reembolsos.length > 20) throw invalido('reembolsos deve ser uma lista.', 'reembolsos');
    const reembolsos = body.reembolsos.map(r => {
      if (!r || typeof r !== 'object' || typeof r.formaCode !== 'string' || !r.formaCode.trim()) throw invalido('Reembolso exige formaCode.', 'reembolsos');
      const ex = Object.keys(r).find(k => !['formaCode', 'valorCentavos'].includes(k));
      if (ex) throw createAppError('FORBIDDEN_FIELD', `Campo não permitido no reembolso: ${ex}`, 422, { field: ex });
      if (!inteiroPositivo(r.valorCentavos)) throw invalido('valorCentavos do reembolso deve ser inteiro > 0.', 'valorCentavos');
      return { formaCode: r.formaCode.trim(), valorCentavos: r.valorCentavos };
    }).sort((a, b) => a.formaCode.localeCompare(b.formaCode));
    if (new Set(reembolsos.map(r => r.formaCode)).size !== reembolsos.length) throw invalido('Forma de reembolso repetida.', 'reembolsos');
    if (reembolsos.length) out.reembolsos = reembolsos;
  }
  // Alternativa a "reembolsos": só a forma; o valor é calculado no banco.
  if (body.reembolsoForma !== undefined) {
    if (out.reembolsos) throw invalido('Use reembolsos ou reembolsoForma, não os dois.', 'reembolsoForma');
    if (typeof body.reembolsoForma !== 'string' || !body.reembolsoForma.trim() || body.reembolsoForma.length > 60) throw invalido('reembolsoForma inválida.', 'reembolsoForma');
    out.reembolsoForma = body.reembolsoForma.trim();
  }
  return out;
}

module.exports = { validateEstornoPayload, MOTIVOS_ESTORNO: MOTIVOS };

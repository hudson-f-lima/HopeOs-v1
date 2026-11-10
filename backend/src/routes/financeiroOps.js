// Pagamento de comissão e operação de caixa (D-017, migration 010).
// Tudo é lançamento imutável com autor humano (userOnly no RBAC): corrigir é estornar
// (comissão) ou fechar o dia de novo (caixa). Tenant e autor vêm só do req.auth.
const express = require('express');
const { createAppError } = require('../errors');
const { authorize, assertOwn } = require('../auth/rbac');
const { env } = require('../config/env');
const clock = require('../config/clock');
const { agoraNoFuso } = require('../engines/SlotEngine');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { computeSaldoComissao } = require('../engines/ComissaoPagamentos');
const { buildFechamentoCaixa, aplicarAjustesCaixa } = require('../engines/CaixaEngine');

const router = express.Router();
const VALOR_MAX_CENTAVOS = 100000000; // R$ 1.000.000,00 por lançamento
const CAMPOS_PROIBIDOS = ['empresa_id', 'empresaId', 'actor_id', 'actorId', 'created_at', 'id'];

const hoje = () => agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
const invalido = (campo, msg) => createAppError('INVALID_FIELD', msg, 422, { field: campo });

function corpo(req, permitidos) {
  const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  for (const k of Object.keys(b)) {
    if (CAMPOS_PROIBIDOS.includes(k)) throw createAppError('FORBIDDEN_FIELD', `Campo não permitido: ${k}.`, 422, { field: k });
    if (!permitidos.includes(k)) throw invalido(k, `Campo desconhecido: ${k}.`);
  }
  return b;
}
function centavos(v, campo, { min = 1 } = {}) {
  if (!Number.isInteger(v) || v < min || v > VALOR_MAX_CENTAVOS) throw invalido(campo, `${campo} deve ser inteiro em centavos entre ${min} e ${VALOR_MAX_CENTAVOS}.`);
  return v;
}
function chave(v) {
  if (typeof v !== 'string' || v.length < 1 || v.length > 200) throw invalido('idempotencyKey', 'idempotencyKey é obrigatória (1 a 200 caracteres).');
  return v;
}
function texto(v, campo, { min = 0, max }) {
  if (v === undefined || v === null || v === '') { if (min > 0) throw invalido(campo, `${campo} é obrigatório.`); return null; }
  if (typeof v !== 'string') throw invalido(campo, `${campo} deve ser texto.`);
  const t = v.trim();
  if (t.length < min || t.length > max) throw invalido(campo, `${campo} deve ter entre ${min} e ${max} caracteres.`);
  return t;
}
function dataValida(v, campo = 'data') {
  const s = String(v);
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw createAppError('INVALID_DATE', `${campo} deve estar no formato YYYY-MM-DD.`, 422, { field: campo });
  return s;
}

// Mesma chave + mesmo pedido = devolve o que já foi gravado; mesma chave + pedido diferente = 409.
async function idempotente(repo, tabela, key, igual) {
  const [existente] = await repo.list(tabela, { empresa_id: repo.empresaId, idempotency_key: key });
  if (!existente) return null;
  if (!igual(existente)) throw createAppError('IDEMPOTENCY_MISMATCH', 'idempotencyKey já usada com outro pedido.', 409);
  return existente;
}
// Corrida entre duas requisições iguais: o índice único do banco decide; relê e devolve.
async function gravar(repo, tabela, linha, igual) {
  try { return { linha: await repo.insert(tabela, linha), repetido: false }; }
  catch (err) {
    if (err && err.code === '23505') {
      const existente = await idempotente(repo, tabela, linha.idempotency_key, igual);
      if (existente) return { linha: existente, repetido: true };
      throw createAppError('ALREADY_REVERSED', 'Este lançamento já foi estornado.', 409);
    }
    throw err;
  }
}

async function dadosDoSaldo(repo) {
  const filtro = { empresa_id: repo.empresaId };
  const [comandos, comandoItens, gorjetas, estornos, estornoItens, estornoGorjetas, pagamentos] = await Promise.all([
    repo.list('comandos', filtro), repo.list('comando_itens', filtro), repo.list('comando_gorjetas', filtro),
    repo.list('comanda_estornos', filtro), repo.list('comanda_estorno_itens', filtro), repo.list('comanda_estorno_gorjetas', filtro),
    repo.list('comissao_pagamentos', filtro)
  ]);
  return { comandos, comandoItens, gorjetas, estornos, estornoItens, estornoGorjetas, pagamentos };
}
async function profissionalDaEmpresa(repo, id) {
  const [p] = id ? await repo.list('profissionais', { empresa_id: repo.empresaId, id }) : [];
  if (!p) throw createAppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.', 404);
  return p;
}
const publico = p => ({ id: p.id, profissionalId: p.profissional_id, tipo: p.tipo, valorCentavos: p.valor_centavos, data: String(p.data), referenciaMes: p.referencia_mes || null, observacao: p.observacao || null, estornaId: p.estorna_id || null });

// ---------- Comissão ----------
router.get('/comissoes/pagamentos', authorize('relatorios:proprio'), async (req, res, next) => {
  try {
    const profissionalId = req.authz.own ? req.authz.profissionalId : String(req.query.profissionalId || '');
    if (!profissionalId) throw createAppError('PROFESSIONAL_REQUIRED', 'Informe profissionalId.', 422);
    assertOwn(req, profissionalId);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const prof = await profissionalDaEmpresa(repo, profissionalId);
    res.json({ ok: true, data: { ...computeSaldoComissao({ ...(await dadosDoSaldo(repo)), profissionalId }), nome: prof.nome } });
  } catch (err) { next(err); }
});

router.post('/comissoes/pagamentos', authorize('comissoes:pagar'), async (req, res, next) => {
  try {
    const b = corpo(req, ['profissionalId', 'tipo', 'valorCentavos', 'referenciaMes', 'observacao', 'idempotencyKey']);
    const key = chave(b.idempotencyKey);
    if (!['pagamento', 'vale'].includes(b.tipo)) throw invalido('tipo', 'tipo deve ser pagamento ou vale.');
    const valor = centavos(b.valorCentavos, 'valorCentavos');
    const referenciaMes = b.referenciaMes === undefined || b.referenciaMes === null || b.referenciaMes === '' ? null : String(b.referenciaMes);
    if (referenciaMes && !/^\d{4}-(0[1-9]|1[0-2])$/.test(referenciaMes)) throw createAppError('INVALID_MONTH', 'referenciaMes deve ser YYYY-MM.', 422);
    const observacao = texto(b.observacao, 'observacao', { max: 500 });
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const prof = await profissionalDaEmpresa(repo, String(b.profissionalId || ''));
    const igual = e => e.profissional_id === prof.id && e.tipo === b.tipo && e.valor_centavos === valor;
    const ja = await idempotente(repo, 'comissao_pagamentos', key, igual);
    if (ja) return res.json({ ok: true, data: { ...publico(ja), idempotente: true } });
    // Pagamento não passa do saldo; vale (adiantamento) pode, e deixa o saldo negativo.
    if (b.tipo === 'pagamento') {
      const saldo = computeSaldoComissao({ ...(await dadosDoSaldo(repo)), profissionalId: prof.id }).saldoCentavos;
      if (valor > saldo) throw createAppError('PAYMENT_EXCEEDS_BALANCE', 'Pagamento maior que o saldo a pagar. Para adiantar, lance um vale.', 422, { saldoCentavos: saldo });
    }
    const { linha, repetido } = await gravar(repo, 'comissao_pagamentos', { profissional_id: prof.id, tipo: b.tipo, valor_centavos: valor, data: hoje(), referencia_mes: referenciaMes, observacao, idempotency_key: key, actor_id: req.auth.actor_id }, igual);
    res.status(repetido ? 200 : 201).json({ ok: true, data: { ...publico(linha), idempotente: repetido } });
  } catch (err) { next(err); }
});

router.post('/comissoes/pagamentos/:id/estorno', authorize('comissoes:pagar'), async (req, res, next) => {
  try {
    const b = corpo(req, ['observacao', 'idempotencyKey']);
    const key = chave(b.idempotencyKey);
    const observacao = texto(b.observacao, 'observacao', { min: 3, max: 500 });
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const [original] = await repo.list('comissao_pagamentos', { empresa_id: repo.empresaId, id: req.params.id });
    if (!original) throw createAppError('PAYMENT_NOT_FOUND', 'Lançamento não encontrado.', 404);
    if (original.tipo === 'estorno') throw createAppError('INVALID_REVERSAL', 'Estorno não pode ser estornado.', 422);
    const igual = e => e.tipo === 'estorno' && e.estorna_id === original.id;
    const ja = await idempotente(repo, 'comissao_pagamentos', key, igual);
    if (ja) return res.json({ ok: true, data: { ...publico(ja), idempotente: true } });
    const [jaEstornado] = await repo.list('comissao_pagamentos', { empresa_id: repo.empresaId, estorna_id: original.id });
    if (jaEstornado) throw createAppError('ALREADY_REVERSED', 'Este lançamento já foi estornado.', 409);
    const { linha, repetido } = await gravar(repo, 'comissao_pagamentos', { profissional_id: original.profissional_id, tipo: 'estorno', valor_centavos: original.valor_centavos, data: hoje(), referencia_mes: original.referencia_mes || null, observacao, estorna_id: original.id, idempotency_key: key, actor_id: req.auth.actor_id }, igual);
    res.status(repetido ? 200 : 201).json({ ok: true, data: { ...publico(linha), idempotente: repetido } });
  } catch (err) { next(err); }
});

// ---------- Caixa ----------
async function resumoDoDia(repo, data, { fundoTrocoCentavos = 0, contadoDinheiroCentavos } = {}) {
  const filtro = { empresa_id: repo.empresaId, data };
  const [comandos, movimentos, formasPagamento, ajustes] = await Promise.all([
    repo.list('comandos', filtro), repo.list('caixa_movimentos', filtro), repo.list('formas_pagamento', { empresa_id: repo.empresaId }), repo.list('caixa_ajustes', filtro)
  ]);
  const pagamentos = await repo.listPagamentosDasComandas(comandos.map(c => c.id));
  return aplicarAjustesCaixa(buildFechamentoCaixa({ data, comandos, pagamentos, movimentos, formasPagamento }), { ajustes, fundoTrocoCentavos, contadoDinheiroCentavos });
}

router.post('/caixa/ajustes', authorize('caixa:operar'), async (req, res, next) => {
  try {
    const b = corpo(req, ['tipo', 'valorCentavos', 'motivo', 'idempotencyKey']);
    const key = chave(b.idempotencyKey);
    if (!['sangria', 'suprimento'].includes(b.tipo)) throw invalido('tipo', 'tipo deve ser sangria ou suprimento.');
    const valor = centavos(b.valorCentavos, 'valorCentavos');
    const motivo = texto(b.motivo, 'motivo', { min: 3, max: 300 });
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const igual = e => e.tipo === b.tipo && e.valor_centavos === valor;
    const ja = await idempotente(repo, 'caixa_ajustes', key, igual);
    const { linha, repetido } = ja ? { linha: ja, repetido: true } : await gravar(repo, 'caixa_ajustes', { data: hoje(), tipo: b.tipo, valor_centavos: valor, motivo, idempotency_key: key, actor_id: req.auth.actor_id }, igual);
    res.status(repetido ? 200 : 201).json({ ok: true, data: { id: linha.id, data: String(linha.data), tipo: linha.tipo, valorCentavos: linha.valor_centavos, motivo: linha.motivo, idempotente: repetido } });
  } catch (err) { next(err); }
});

const fechamentoPublico = f => ({ id: f.id, data: String(f.data), fundoTrocoCentavos: f.fundo_troco_centavos, esperadoDinheiroCentavos: f.esperado_dinheiro_centavos, contadoDinheiroCentavos: f.contado_dinheiro_centavos, diferencaCentavos: f.diferenca_centavos, totalBrutoCentavos: f.total_bruto_centavos, quantidadeComandas: f.quantidade_comandas, observacao: f.observacao || null, fechadoEm: f.created_at || null });

router.post('/caixa/fechamentos', authorize('caixa:operar'), async (req, res, next) => {
  try {
    const b = corpo(req, ['data', 'contadoDinheiroCentavos', 'fundoTrocoCentavos', 'observacao', 'idempotencyKey']);
    const key = chave(b.idempotencyKey);
    const data = b.data === undefined ? hoje() : dataValida(b.data);
    if (data > hoje()) throw createAppError('INVALID_DATE', 'Não é possível fechar um dia futuro.', 422, { field: 'data' });
    const contado = centavos(b.contadoDinheiroCentavos, 'contadoDinheiroCentavos', { min: 0 });
    const fundo = b.fundoTrocoCentavos === undefined ? 0 : centavos(b.fundoTrocoCentavos, 'fundoTrocoCentavos', { min: 0 });
    const observacao = texto(b.observacao, 'observacao', { max: 500 });
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const igual = e => String(e.data) === data && e.contado_dinheiro_centavos === contado && e.fundo_troco_centavos === fundo;
    const ja = await idempotente(repo, 'caixa_fechamentos', key, igual);
    if (ja) return res.json({ ok: true, data: { ...fechamentoPublico(ja), idempotente: true } });
    // O esperado é calculado AQUI, na hora: o cliente só informa o contado e o fundo.
    const r = await resumoDoDia(repo, data, { fundoTrocoCentavos: fundo, contadoDinheiroCentavos: contado });
    const { linha, repetido } = await gravar(repo, 'caixa_fechamentos', {
      data, fundo_troco_centavos: fundo, esperado_dinheiro_centavos: r.dinheiro.esperadoCentavos, contado_dinheiro_centavos: contado, diferenca_centavos: r.dinheiro.diferencaCentavos,
      total_bruto_centavos: r.totalBrutoCentavos, quantidade_comandas: r.quantidadeComandas, observacao,
      snapshot: { porForma: r.porForma, estornos: r.estornos, ajustes: r.ajustes, saldoDoDiaCentavos: r.saldoDoDiaCentavos, ledgerConsistente: r.ledger.consistente },
      idempotency_key: key, actor_id: req.auth.actor_id
    }, igual);
    res.status(repetido ? 200 : 201).json({ ok: true, data: { ...fechamentoPublico(linha), idempotente: repetido } });
  } catch (err) { next(err); }
});

module.exports = { financeiroOpsRouter: router, resumoDoDia, fechamentoPublico, dataValida };

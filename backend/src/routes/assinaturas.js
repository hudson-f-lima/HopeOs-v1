// Planos de assinatura (Onda A, fase 1; D-042, migration 021). Só configuração e simulação:
// assinantes, cobrança, usos e comissão chegam nas fases seguintes.
//
// - Ver planos e simular a cobertura: assinatura:ver (recepção e gestão).
// - Criar, editar e arquivar: planos:editar (gestão; sensível: mexe em preço e comissão).
// O plano, os itens e os profissionais permitidos são salvos juntos (função do banco, tudo ou
// nada). Plano não se apaga: arquiva.
const express = require('express');
const { authorize } = require('../auth/rbac');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { createAppError } = require('../errors');
const { autoriaDe } = require('../middleware/auth');
const clock = require('../config/clock');
const { validateUUID } = require('../validators/cadastros.validator');
const { avaliarUso, precoDeTabela, ACOES } = require('../engines/AssinaturaRegrasEngine');

const router = express.Router();
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIODICIDADES = ['mensal', 'trimestral', 'semestral', 'anual'];
const VENCIMENTOS = ['data_fixa', 'base_contratacao', 'base_contratacao_fixa'];
const COBRANCAS = ['manual', 'recorrente'];
const REGRAS_COMISSAO = ['rateio', 'tabela', 'fixo_por_uso'];
const MAX_ITENS = 30;
const MAX_PROFISSIONAIS = 100;

const invalido = (field, message) => createAppError('INVALID_FIELD', message, 422, { field });
const vazio = v => v === undefined || v === null || v === '';
const hhmm = h => (h ? String(h).slice(0, 5) : null);

function inteiro(v, campo, min, max, { opcional = false } = {}) {
  if (vazio(v)) { if (opcional) return null; throw invalido(campo, `${campo} é obrigatório.`); }
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw invalido(campo, `${campo} deve ser um número inteiro entre ${min} e ${max}.`);
  return n;
}
function percentual(v, campo, { min = 0, opcional = false } = {}) {
  if (vazio(v)) { if (opcional) return null; throw invalido(campo, `${campo} é obrigatório.`); }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > 100 || Math.round(n * 100) !== n * 100) throw invalido(campo, `${campo} deve ser um percentual entre ${min} e 100 (até 2 casas).`);
  return n;
}
function escolha(v, campo, lista, padrao) {
  if (vazio(v)) return padrao;
  if (!lista.includes(v)) throw invalido(campo, `${campo} deve ser um de: ${lista.join(', ')}.`);
  return v;
}
function booleano(v, campo, padrao) {
  if (vazio(v)) return padrao;
  if (typeof v !== 'boolean') throw invalido(campo, `${campo} deve ser verdadeiro ou falso.`);
  return v;
}

// Corpo da tela (camelCase) → linhas do banco. Recusa tudo que o banco recusaria, com mensagem clara.
function validarPlano(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw createAppError('INVALID_PAYLOAD', 'Payload inválido.', 422);
  const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
  if (!nome || nome.length > 80) throw invalido('nome', 'Nome do plano é obrigatório (até 80 caracteres).');
  if (!vazio(body.descricao) && (typeof body.descricao !== 'string' || body.descricao.length > 2000)) throw invalido('descricao', 'Descrição até 2000 caracteres.');
  const tipoVencimento = escolha(body.tipoVencimento, 'tipoVencimento', VENCIMENTOS, 'base_contratacao');
  const diaVencimento = tipoVencimento === 'data_fixa' ? inteiro(body.diaVencimento, 'diaVencimento', 1, 28) : null;
  const comissao = body.comissao && typeof body.comissao === 'object' ? body.comissao : {};
  const regra = escolha(comissao.regra, 'comissao.regra', REGRAS_COMISSAO, 'rateio');
  const fora = body.foraDaRegra && typeof body.foraDaRegra === 'object' ? body.foraDaRegra : {};
  const acao = escolha(fora.acao, 'foraDaRegra.acao', ACOES, 'bloquear');
  const cobraPercentual = acao === 'cobrar_percentual_consumir' || acao === 'cobrar_percentual_sem_consumir';
  const plano = {
    nome,
    descricao: vazio(body.descricao) ? null : body.descricao,
    preco_centavos: inteiro(body.precoCentavos, 'precoCentavos', 0, 10000000),
    periodicidade: escolha(body.periodicidade, 'periodicidade', PERIODICIDADES, 'mensal'),
    tipo_vencimento: tipoVencimento,
    dia_vencimento: diaVencimento,
    cobranca: escolha(body.cobranca, 'cobranca', COBRANCAS, 'manual'),
    disponivel_venda: booleano(body.disponivelVenda, 'disponivelVenda', true),
    tolerancia_dias: vazio(body.toleranciaDias) ? 7 : inteiro(body.toleranciaDias, 'toleranciaDias', 0, 60),
    comissao_regra: regra,
    comissao_percentual: regra === 'rateio' ? percentual(comissao.percentual, 'comissao.percentual') : null,
    comissao_fixa_centavos: regra === 'fixo_por_uso' ? inteiro(comissao.fixaCentavos, 'comissao.fixaCentavos', 0, 1000000) : null,
    fora_regra_acao: acao,
    fora_regra_percentual: cobraPercentual ? percentual(fora.percentual, 'foraDaRegra.percentual') : null,
    fora_regra_teto_ciclo: acao === 'bloquear' ? null : inteiro(fora.tetoCiclo, 'foraDaRegra.tetoCiclo', 0, 100, { opcional: true }),
    fora_regra_exige_aprovacao: acao === 'bloquear' ? false : booleano(fora.exigeAprovacao, 'foraDaRegra.exigeAprovacao', false)
  };
  if (!Array.isArray(body.itens) || !body.itens.length) throw invalido('itens', 'O plano precisa de ao menos um serviço.');
  if (body.itens.length > MAX_ITENS) throw invalido('itens', `No máximo ${MAX_ITENS} serviços por plano.`);
  const vistos = new Set();
  const itens = body.itens.map((it, i) => {
    const c = campo => `itens[${i}].${campo}`;
    if (!it || typeof it !== 'object') throw invalido(`itens[${i}]`, 'Item inválido.');
    validateUUID(it.servicoId, c('servicoId'));
    if (vistos.has(it.servicoId)) throw invalido(c('servicoId'), 'O mesmo serviço aparece duas vezes no plano.');
    vistos.add(it.servicoId);
    let dias = null;
    if (!vazio(it.diasSemana)) {
      if (!Array.isArray(it.diasSemana) || !it.diasSemana.length || it.diasSemana.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
        throw invalido(c('diasSemana'), 'Dias da semana: lista de 0 (domingo) a 6 (sábado).');
      }
      dias = [...new Set(it.diasSemana)].sort((a, b) => a - b);
      if (dias.length === 7) dias = null; // todos os dias = sem restrição
    }
    const ini = vazio(it.horarioInicio) ? null : it.horarioInicio;
    const fim = vazio(it.horarioFim) ? null : it.horarioFim;
    if ((ini === null) !== (fim === null)) throw invalido(c('horarioInicio'), 'Faixa de horário precisa de início e fim.');
    if (ini !== null && (!HORA_RE.test(ini) || !HORA_RE.test(fim) || ini >= fim)) throw invalido(c('horarioInicio'), 'Faixa de horário inválida (HH:MM, início antes do fim).');
    return {
      servico_id: it.servicoId,
      desconto_percentual: vazio(it.descontoPercentual) ? 100 : percentual(it.descontoPercentual, c('descontoPercentual'), { min: 0.01 }),
      limite_por_ciclo: inteiro(it.limitePorCiclo, c('limitePorCiclo'), 1, 999, { opcional: true }),
      dias_semana: dias,
      horario_inicio: ini,
      horario_fim: fim,
      intervalo_min_dias: inteiro(it.intervaloMinDias, c('intervaloMinDias'), 1, 90, { opcional: true })
    };
  });
  const profissionais = vazio(body.profissionais) ? [] : body.profissionais;
  if (!Array.isArray(profissionais) || profissionais.length > MAX_PROFISSIONAIS) throw invalido('profissionais', 'Lista de profissionais inválida.');
  profissionais.forEach((id, i) => validateUUID(id, `profissionais[${i}]`));
  return { plano, itens, profissionais: [...new Set(profissionais)] };
}

// Serviços e profissionais precisam ser desta empresa (o banco também confere).
async function conferirReferencias(repo, { itens, profissionais }) {
  const servicos = new Set((await repo.list('servicos', { empresa_id: repo.empresaId })).map(s => s.id));
  itens.forEach((it, i) => { if (!servicos.has(it.servico_id)) throw invalido(`itens[${i}].servicoId`, 'Serviço não encontrado.'); });
  const profs = new Set((await repo.list('profissionais', { empresa_id: repo.empresaId })).map(p => p.id));
  profissionais.forEach((id, i) => { if (!profs.has(id)) throw invalido(`profissionais[${i}]`, 'Profissional não encontrado.'); });
}

function paraTela(p, itens, profissionais) {
  return {
    id: p.id, nome: p.nome, descricao: p.descricao || null, precoCentavos: p.preco_centavos, periodicidade: p.periodicidade,
    tipoVencimento: p.tipo_vencimento, diaVencimento: p.dia_vencimento ?? null, cobranca: p.cobranca, disponivelVenda: p.disponivel_venda !== false,
    toleranciaDias: p.tolerancia_dias, arquivado: Boolean(p.arquivado_em),
    comissao: { regra: p.comissao_regra, percentual: p.comissao_percentual === null || p.comissao_percentual === undefined ? null : Number(p.comissao_percentual), fixaCentavos: p.comissao_fixa_centavos ?? null },
    foraDaRegra: { acao: p.fora_regra_acao, percentual: p.fora_regra_percentual === null || p.fora_regra_percentual === undefined ? null : Number(p.fora_regra_percentual), tetoCiclo: p.fora_regra_teto_ciclo ?? null, exigeAprovacao: Boolean(p.fora_regra_exige_aprovacao) },
    itens: itens.map(i => ({ servicoId: i.servico_id, descontoPercentual: Number(i.desconto_percentual), limitePorCiclo: i.limite_por_ciclo ?? null,
      diasSemana: Array.isArray(i.dias_semana) ? i.dias_semana.map(Number) : null, horarioInicio: hhmm(i.horario_inicio), horarioFim: hhmm(i.horario_fim), intervaloMinDias: i.intervalo_min_dias ?? null })),
    profissionais
  };
}

async function carregar(repo, id) {
  validateUUID(id, 'id');
  const p = await repo.getByIdScoped('assinatura_planos', id);
  if (!p) throw createAppError('PLANO_NAO_ENCONTRADO', 'Plano não encontrado.', 404);
  const itens = await repo.list('assinatura_plano_itens', { empresa_id: repo.empresaId, plano_id: id });
  const profissionais = (await repo.list('assinatura_plano_profissionais', { empresa_id: repo.empresaId, plano_id: id })).map(x => x.profissional_id);
  return { p, itens, profissionais };
}

router.get('/assinaturas/planos', authorize('assinatura:ver'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const comArquivados = req.query.arquivados === '1';
    const planos = (await repo.list('assinatura_planos', { empresa_id: repo.empresaId })).filter(p => comArquivados || !p.arquivado_em);
    const itens = await repo.list('assinatura_plano_itens', { empresa_id: repo.empresaId });
    const profs = await repo.list('assinatura_plano_profissionais', { empresa_id: repo.empresaId });
    const data = planos.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
      .map(p => paraTela(p, itens.filter(i => i.plano_id === p.id), profs.filter(x => x.plano_id === p.id).map(x => x.profissional_id)));
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/assinaturas/planos/:id', authorize('assinatura:ver'), async (req, res, next) => {
  try {
    const { p, itens, profissionais } = await carregar(new SupabaseRepository(req.auth.empresa_id), req.params.id);
    res.json({ ok: true, data: paraTela(p, itens, profissionais) });
  } catch (err) { next(err); }
});

async function salvar(req, res, next, planoId) {
  try {
    const dados = validarPlano(req.body);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    if (planoId) {
      const atual = (await carregar(repo, planoId)).p;
      if (atual.arquivado_em) throw createAppError('PLANO_ARQUIVADO', 'Plano arquivado não pode ser alterado.', 409);
    }
    await conferirReferencias(repo, dados);
    const { actorId } = autoriaDe(req.auth);
    const id = await repo.salvarPlanoAssinatura({ planoId: planoId || null, ...dados, actorId: actorId || null });
    const { p, itens, profissionais } = await carregar(repo, id);
    res.status(planoId ? 200 : 201).json({ ok: true, data: paraTela(p, itens, profissionais) });
  } catch (err) { next(err); }
}
router.post('/assinaturas/planos', authorize('planos:editar'), (req, res, next) => salvar(req, res, next, null));
router.put('/assinaturas/planos/:id', authorize('planos:editar'), (req, res, next) => { try { validateUUID(req.params.id, 'id'); } catch (e) { return next(e); } return salvar(req, res, next, req.params.id); });

router.post('/assinaturas/planos/:id/arquivar', authorize('planos:editar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const { p } = await carregar(repo, req.params.id);
    if (!p.arquivado_em) {
      const { actorId } = autoriaDe(req.auth);
      await repo.updateScoped('assinatura_planos', p.id, { arquivado_em: clock.agora().toISOString(), updated_at: clock.agora().toISOString(), updated_by: actorId || null });
    }
    res.json({ ok: true, data: { id: p.id, arquivado: true } });
  } catch (err) { next(err); }
});

// Simulador: "e se este cliente viesse neste dia, com este profissional?" Nada é gravado.
router.post('/assinaturas/planos/:id/simular', authorize('assinatura:ver'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const { p, itens, profissionais } = await carregar(repo, req.params.id);
    const b = req.body || {};
    validateUUID(b.servicoId, 'servicoId');
    validateUUID(b.profissionalId, 'profissionalId');
    if (!DATA_RE.test(String(b.data || '')) || Number.isNaN(Date.parse(`${b.data}T00:00:00Z`))) throw invalido('data', 'Data inválida (AAAA-MM-DD).');
    if (!HORA_RE.test(String(b.horario || ''))) throw invalido('horario', 'Horário inválido (HH:MM).');
    if (!vazio(b.ultimoUsoData) && !DATA_RE.test(String(b.ultimoUsoData))) throw invalido('ultimoUsoData', 'Data inválida (AAAA-MM-DD).');
    const servico = (await repo.list('servicos', { empresa_id: repo.empresaId })).find(s => s.id === b.servicoId);
    if (!servico) throw invalido('servicoId', 'Serviço não encontrado.');
    const profissional = (await repo.list('profissionais', { empresa_id: repo.empresaId })).find(x => x.id === b.profissionalId);
    if (!profissional) throw invalido('profissionalId', 'Profissional não encontrado.');
    const resultado = avaliarUso({
      plano: p, itens, profissionaisPermitidos: profissionais,
      uso: { servicoId: b.servicoId, profissionalId: b.profissionalId, data: b.data, horario: b.horario },
      historico: {
        usosNoCiclo: inteiro(b.usosNoCiclo ?? 0, 'usosNoCiclo', 0, 999),
        foraDaRegraNoCiclo: inteiro(b.foraDaRegraNoCiclo ?? 0, 'foraDaRegraNoCiclo', 0, 999),
        ultimoUsoData: vazio(b.ultimoUsoData) ? null : b.ultimoUsoData
      },
      precoTabelaCentavos: precoDeTabela(servico, profissional)
    });
    res.json({ ok: true, data: resultado });
  } catch (err) { next(err); }
});

module.exports = { assinaturasRouter: router, validarPlano };

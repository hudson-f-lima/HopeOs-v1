// Assinantes (Onda A, fase 2; D-043, migration 022). Vender o plano a um cliente, registrar o
// pagamento de cada ciclo (cobrança manual nesta onda), pausar, retomar e cancelar, e consultar
// a cobertura de um atendimento ("coberto, 2 de 4") para a agenda e a comanda.
//
// - Ver assinantes e cobertura: assinatura:ver (recepção e gestão).
// - Vender e registrar pagamento: assinatura:vender (recepção e gestão).
// - Pausar, retomar e cancelar: assinatura:gerir (gestão; sensível).
// O valor cobrado é sempre o preço do plano, lido do banco; a tela nunca informa valor.
const express = require('express');
const { authorize } = require('../auth/rbac');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { createAppError } = require('../errors');
const { autoriaDe } = require('../middleware/auth');
const { env } = require('../config/env');
const clock = require('../config/clock');
const { validateUUID } = require('../validators/cadastros.validator');
const { agoraNoFuso } = require('../engines/SlotEngine');
const { avaliarUso, precoDeTabela } = require('../engines/AssinaturaRegrasEngine');
const { cicloDe, situacao, historicoDoCiclo, ciclosAte, somarDias, diasEntre } = require('../engines/AssinaturaCicloEngine');

const router = express.Router();
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const invalido = (field, message) => createAppError('INVALID_FIELD', message, 422, { field });
const hoje = () => agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
const textoCurto = (v, campo, max) => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || v.trim().length > max) throw invalido(campo, `${campo} até ${max} caracteres.`);
  return v.trim() || null;
};
function data(v, campo) {
  if (!DATA_RE.test(String(v || '')) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw invalido(campo, `${campo} inválida (AAAA-MM-DD).`);
  return v;
}

// Tudo o que a lista e o detalhe precisam, numa leitura por tabela.
async function carregarContexto(repo, filtro = {}) {
  const f = { empresa_id: repo.empresaId, ...filtro };
  const [assinaturas, planos, itens, profs, clientes, cobrancas, usos, estornos] = await Promise.all([
    repo.list('assinaturas', f),
    repo.list('assinatura_planos', { empresa_id: repo.empresaId }),
    repo.list('assinatura_plano_itens', { empresa_id: repo.empresaId }),
    repo.list('assinatura_plano_profissionais', { empresa_id: repo.empresaId }),
    repo.list('clientes', { empresa_id: repo.empresaId }),
    repo.list('assinatura_cobrancas', { empresa_id: repo.empresaId }),
    repo.list('assinatura_usos', { empresa_id: repo.empresaId }),
    repo.list('assinatura_usos_estornos', { empresa_id: repo.empresaId })
  ]);
  return { assinaturas, planos, itens, profs, clientes, cobrancas, usos, estornados: new Set(estornos.map(e => e.uso_id)) };
}

function montar(ctx, a, dia) {
  const plano = ctx.planos.find(p => p.id === a.plano_id);
  const cliente = ctx.clientes.find(c => c.id === a.cliente_id);
  const sit = situacao({ assinatura: a, plano, cobrancas: ctx.cobrancas.filter(c => c.assinatura_id === a.id), hoje: dia });
  const usosDaAss = ctx.usos.filter(u => u.assinatura_id === a.id);
  const itens = ctx.itens.filter(i => i.plano_id === plano.id);
  const ciclo = sit.cicloAtual;
  const usosDoCiclo = itens.map(i => {
    const h = ciclo ? historicoDoCiclo({ usos: usosDaAss, estornados: ctx.estornados, cicloInicio: ciclo.inicio, servicoId: i.servico_id }) : { usosNoCiclo: 0 };
    return { servicoId: i.servico_id, usados: h.usosNoCiclo, limite: i.limite_por_ciclo ?? null };
  });
  return {
    id: a.id, clienteId: a.cliente_id, clienteNome: cliente ? cliente.nome : null, planoId: plano.id, planoNome: plano.nome,
    precoCentavos: plano.preco_centavos, periodicidade: plano.periodicidade, status: a.status, inicio: String(a.inicio).slice(0, 10),
    pausadaEm: a.pausada_em ? String(a.pausada_em).slice(0, 10) : null, canceladaEm: a.cancelada_em ? String(a.cancelada_em).slice(0, 10) : null,
    cancelarNoFimDoCiclo: Boolean(a.cancelar_no_fim_do_ciclo),
    situacao: { estado: sit.estado, podeUsar: sit.podeUsar, texto: sit.texto, emAberto: sit.emAberto, valorEmAbertoCentavos: sit.valorEmAbertoCentavos, maiorAtrasoDias: sit.maiorAtrasoDias },
    cicloAtual: ciclo ? { inicio: ciclo.inicio, fim: ciclo.fim } : null,
    usosDoCiclo,
    ciclos: sit.ciclos.slice(-12).map(c => ({ inicio: c.inicio, fim: c.fim, estado: c.estado, vencimento: c.vencimento, valorCentavos: c.valorCentavos ?? null, pagoEm: c.pagoEm || null, diasAtraso: c.diasAtraso ?? null }))
  };
}

async function carregarUma(repo, id) {
  validateUUID(id, 'id');
  const a = await repo.getByIdScoped('assinaturas', id);
  if (!a) throw createAppError('ASSINATURA_NAO_ENCONTRADA', 'Assinatura não encontrada.', 404);
  return a;
}

router.get('/assinaturas', authorize('assinatura:ver'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const filtro = {};
    if (req.query.clienteId) { validateUUID(req.query.clienteId, 'clienteId'); filtro.cliente_id = req.query.clienteId; }
    const ctx = await carregarContexto(repo, filtro);
    const dia = hoje();
    const todas = ctx.assinaturas.map(a => montar(ctx, a, dia));
    const data = req.query.incluirCanceladas === '1' ? todas : todas.filter(a => a.situacao.estado !== 'cancelada');
    data.sort((x, y) => String(x.clienteNome || '').localeCompare(String(y.clienteNome || ''), 'pt-BR'));
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

// Cobertura de um atendimento: para a agenda ("coberto, 2 de 4") e para a comanda.
// Nada é gravado. Considera todas as assinaturas vivas do cliente e devolve a melhor.
router.get('/assinaturas/cobertura', authorize('assinatura:ver'), async (req, res, next) => {
  try {
    const q = req.query;
    validateUUID(q.clienteId, 'clienteId'); validateUUID(q.servicoId, 'servicoId'); validateUUID(q.profissionalId, 'profissionalId');
    const dia = data(q.data, 'data');
    if (!HORA_RE.test(String(q.horario || ''))) throw invalido('horario', 'Horário inválido (HH:MM).');
    const repo = new SupabaseRepository(req.auth.empresa_id);
    res.json({ ok: true, data: await avaliarCobertura(repo, { clienteId: q.clienteId, servicoId: q.servicoId, profissionalId: q.profissionalId, data: dia, horario: q.horario }) });
  } catch (err) { next(err); }
});

// Também usada pelo fechamento da comanda (PR 3/3): mesma regra na consulta e na gravação.
async function avaliarCobertura(repo, { clienteId, servicoId, profissionalId, data: dia, horario }) {
  const ctx = await carregarContexto(repo, { cliente_id: clienteId });
  const servico = (await repo.list('servicos', { empresa_id: repo.empresaId })).find(s => s.id === servicoId);
  const profissional = (await repo.list('profissionais', { empresa_id: repo.empresaId })).find(p => p.id === profissionalId);
  if (!servico) throw invalido('servicoId', 'Serviço não encontrado.');
  if (!profissional) throw invalido('profissionalId', 'Profissional não encontrado.');
  const tabela = precoDeTabela(servico, profissional);
  const opcoes = ctx.assinaturas.map(a => {
    const plano = ctx.planos.find(p => p.id === a.plano_id);
    const sit = situacao({ assinatura: a, plano, cobrancas: ctx.cobrancas.filter(c => c.assinatura_id === a.id), hoje: dia });
    const base = { assinaturaId: a.id, planoNome: plano.nome, situacao: sit.estado, situacaoTexto: sit.texto, cicloInicio: sit.cicloAtual ? sit.cicloAtual.inicio : null };
    if (sit.estado === 'cancelada' || sit.estado === 'futura') return null;
    if (!sit.podeUsar) {
      return { ...base, situacaoUso: 'bloqueada', coberto: false, cobrarCentavos: tabela, precoTabelaCentavos: tabela, consomeUso: false,
        motivos: [{ codigo: 'assinatura_' + sit.estado, texto: sit.texto }] };
    }
    const itens = ctx.itens.filter(i => i.plano_id === plano.id);
    const profs = ctx.profs.filter(x => x.plano_id === plano.id).map(x => x.profissional_id);
    const historico = historicoDoCiclo({ usos: ctx.usos.filter(u => u.assinatura_id === a.id), estornados: ctx.estornados, cicloInicio: sit.cicloAtual.inicio, servicoId });
    const r = avaliarUso({ plano, itens, profissionaisPermitidos: profs, uso: { servicoId, profissionalId, data: dia, horario }, historico, precoTabelaCentavos: tabela });
    return { ...base, situacaoUso: r.situacao, ...r, aviso: sit.estado === 'atrasada' ? sit.texto : null };
  }).filter(Boolean);
  // A melhor para o cliente: a que cobra menos; empate, a que não gasta uso.
  const ordem = [...opcoes].sort((x, y) => x.cobrarCentavos - y.cobrarCentavos || Number(x.consomeUso) - Number(y.consomeUso));
  return { precoTabelaCentavos: tabela, assinante: opcoes.length > 0, melhor: ordem[0] || null, opcoes };
}

// Resumo do mês por plano (D-044): receita das cobranças pagas, comissão (rateio, tabela ou fixo),
// margem, valor de tabela usado e assinantes que usaram mais do que pagam. Somente leitura.
router.get('/assinaturas/relatorio', authorize('painel:financeiro'), async (req, res, next) => {
  try {
    const mes = String(req.query.mes || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw invalido('mes', 'mes deve ser AAAA-MM.');
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const { dadosDeAssinatura } = require('../services/AssinaturaDados');
    const { comissoesDeAssinatura, acimaDoPreco } = require('../engines/AssinaturaComissaoEngine');
    const dados = await dadosDeAssinatura(repo);
    const [comandoItens, profissionais, clientes] = await Promise.all([
      repo.list('comando_itens', { empresa_id: repo.empresaId }), repo.list('profissionais', { empresa_id: repo.empresaId }), repo.list('clientes', { empresa_id: repo.empresaId })
    ]);
    const { porPlano } = comissoesDeAssinatura({ ...dados, comandoItens, mes });
    const nomeProf = new Map(profissionais.map(p => [p.id, p.nome]));
    const nomeCli = new Map(clientes.map(c => [c.id, c.nome]));
    const planos = porPlano.map(p => ({ ...p, profissionais: p.profissionais.map(x => ({ ...x, nome: nomeProf.get(x.profissionalId) || 'Profissional removido' })) }));
    const soma = k => planos.reduce((s, p) => s + (p[k] || 0), 0);
    res.json({ ok: true, data: {
      mes, planos,
      totais: { receitaCentavos: soma('receitaCentavos'), comissaoCentavos: soma('comissaoCentavos'), margemCentavos: soma('margemCentavos'), naoDistribuidoCentavos: soma('naoDistribuidoCentavos'), atendimentos: soma('atendimentos') },
      acimaDoPreco: acimaDoPreco({ ...dados, mes }).map(x => ({ ...x, clienteNome: nomeCli.get(x.clienteId) || null, planoNome: (dados.planos.find(p => p.id === x.planoId) || {}).nome || null }))
    } });
  } catch (err) { next(err); }
});

router.get('/assinaturas/:id', authorize('assinatura:ver'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const a = await carregarUma(repo, req.params.id);
    const ctx = await carregarContexto(repo, { id: a.id });
    res.json({ ok: true, data: montar(ctx, a, hoje()) });
  } catch (err) { next(err); }
});

router.post('/assinaturas', authorize('assinatura:vender'), async (req, res, next) => {
  try {
    const b = req.body || {};
    validateUUID(b.clienteId, 'clienteId'); validateUUID(b.planoId, 'planoId');
    const dia = hoje();
    const inicio = b.inicio ? data(b.inicio, 'inicio') : dia;
    if (diasEntre(dia, inicio) > 60 || diasEntre(inicio, dia) > 400) throw invalido('inicio', 'Início entre 400 dias atrás e 60 dias à frente.');
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const plano = await repo.getByIdScoped('assinatura_planos', b.planoId);
    if (!plano || plano.arquivado_em) throw invalido('planoId', 'Plano não encontrado.');
    if (plano.disponivel_venda === false) throw createAppError('PLANO_FORA_DE_VENDA', 'Este plano não está disponível para venda.', 409);
    const cliente = await repo.getByIdScoped('clientes', b.clienteId);
    if (!cliente) throw invalido('clienteId', 'Cliente não encontrado.');
    const vivas = (await repo.list('assinaturas', { empresa_id: repo.empresaId, cliente_id: b.clienteId, plano_id: b.planoId })).filter(x => x.status !== 'cancelada');
    if (vivas.length) throw createAppError('ASSINATURA_DUPLICADA', 'Este cliente já tem este plano.', 409, { assinaturaId: vivas[0].id });
    const forma = textoCurto(b.pagamento && b.pagamento.forma, 'pagamento.forma', 40);
    const { actorId } = autoriaDe(req.auth);
    const agora = clock.agora().toISOString();
    let a;
    try {
      a = await repo.insertScoped('assinaturas', { cliente_id: b.clienteId, plano_id: b.planoId, status: 'ativa', inicio,
        created_at: agora, created_by: actorId || null, updated_at: agora, updated_by: actorId || null });
    } catch (err) {
      if (err && err.code === '23505') throw createAppError('ASSINATURA_DUPLICADA', 'Este cliente já tem este plano.', 409);
      throw err;
    }
    // Pagamento do 1º ciclo junto com a venda (opcional).
    if (b.pagamento && inicio <= dia) {
      await registrarPagamento(repo, a, plano, inicio, { forma, observacao: textoCurto(b.pagamento.observacao, 'pagamento.observacao', 300), actorId });
    }
    const ctx = await carregarContexto(repo, { id: a.id });
    res.status(201).json({ ok: true, data: montar(ctx, a, dia) });
  } catch (err) { next(err); }
});

async function registrarPagamento(repo, a, plano, cicloInicio, { forma, observacao, actorId }) {
  const dia = hoje();
  const ciclo = cicloDe(a.inicio, plano.periodicidade, cicloInicio);
  if (!ciclo || ciclo.inicio !== cicloInicio) throw invalido('cicloInicio', 'Esta data não é o início de um ciclo da assinatura.');
  if (cicloInicio > dia) throw invalido('cicloInicio', 'O ciclo ainda não começou.');
  const existente = (await repo.list('assinatura_cobrancas', { empresa_id: repo.empresaId, assinatura_id: a.id })).find(c => String(c.ciclo_inicio).slice(0, 10) === cicloInicio);
  if (existente) {
    throw createAppError(existente.estado === 'paga' ? 'COBRANCA_JA_PAGA' : 'COBRANCA_DISPENSADA',
      existente.estado === 'paga' ? 'Este ciclo já está pago.' : 'Este ciclo foi dispensado (pausa).', 409);
  }
  const { vencimentoDoCiclo } = require('../engines/AssinaturaCicloEngine');
  const agora = clock.agora().toISOString();
  try {
    return await repo.insertScoped('assinatura_cobrancas', { assinatura_id: a.id, ciclo_inicio: cicloInicio, vencimento: vencimentoDoCiclo(plano, cicloInicio),
      valor_centavos: plano.preco_centavos, estado: 'paga', pago_em: dia, forma, observacao, created_at: agora, created_by: actorId || null, updated_at: agora, updated_by: actorId || null });
  } catch (err) {
    if (err && err.code === '23505') throw createAppError('COBRANCA_JA_PAGA', 'Este ciclo já está pago.', 409);
    throw err;
  }
}

router.post('/assinaturas/:id/pagar', authorize('assinatura:vender'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const a = await carregarUma(repo, req.params.id);
    const plano = await repo.getByIdScoped('assinatura_planos', a.plano_id);
    const b = req.body || {};
    const cicloInicio = data(b.cicloInicio, 'cicloInicio');
    const sit = situacao({ assinatura: a, plano, cobrancas: await repo.list('assinatura_cobrancas', { empresa_id: repo.empresaId, assinatura_id: a.id }), hoje: hoje() });
    const alvo = sit.ciclos.find(c => c.inicio === cicloInicio);
    if (alvo && alvo.estado === 'nao_devida') throw createAppError('COBRANCA_NAO_DEVIDA', 'Este ciclo não é devido (assinatura pausada ou cancelada).', 409);
    const { actorId } = autoriaDe(req.auth);
    await registrarPagamento(repo, a, plano, cicloInicio, { forma: textoCurto(b.forma, 'forma', 40), observacao: textoCurto(b.observacao, 'observacao', 300), actorId });
    const ctx = await carregarContexto(repo, { id: a.id });
    res.json({ ok: true, data: montar(ctx, a, hoje()) });
  } catch (err) { next(err); }
});

async function mudarStatus(req, res, next, fn) {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const a = await carregarUma(repo, req.params.id);
    const plano = await repo.getByIdScoped('assinatura_planos', a.plano_id);
    const { actorId } = autoriaDe(req.auth);
    const agora = clock.agora().toISOString();
    const patch = await fn({ repo, a, plano, dia: hoje(), actorId, agora });
    const nova = await repo.updateScoped('assinaturas', a.id, { ...patch, updated_at: agora, updated_by: actorId || null });
    const ctx = await carregarContexto(repo, { id: a.id });
    res.json({ ok: true, data: montar(ctx, nova, hoje()) });
  } catch (err) { next(err); }
}

router.post('/assinaturas/:id/pausar', authorize('assinatura:gerir'), (req, res, next) => mudarStatus(req, res, next, async ({ a, dia }) => {
  if (a.status !== 'ativa') throw createAppError('ASSINATURA_NAO_ATIVA', 'Só uma assinatura ativa pode ser pausada.', 409);
  return { status: 'pausada', pausada_em: dia };
}));

// Retomar: os ciclos que começaram durante a pausa ficam dispensados; o ciclo atual é devido
// (o cliente volta a usar agora).
router.post('/assinaturas/:id/retomar', authorize('assinatura:gerir'), (req, res, next) => mudarStatus(req, res, next, async ({ repo, a, plano, dia, actorId, agora }) => {
  if (a.status !== 'pausada') throw createAppError('ASSINATURA_NAO_PAUSADA', 'A assinatura não está pausada.', 409);
  const desde = String(a.pausada_em).slice(0, 10);
  const atual = cicloDe(a.inicio, plano.periodicidade, dia);
  const existentes = new Set((await repo.list('assinatura_cobrancas', { empresa_id: repo.empresaId, assinatura_id: a.id })).map(c => String(c.ciclo_inicio).slice(0, 10)));
  for (const c of ciclosAte({ assinatura: a, plano, hoje: dia })) {
    if (c.inicio >= desde && atual && c.inicio < atual.inicio && !existentes.has(c.inicio)) {
      await repo.insertScoped('assinatura_cobrancas', { assinatura_id: a.id, ciclo_inicio: c.inicio, vencimento: c.inicio, valor_centavos: 0, estado: 'cancelada',
        observacao: 'Ciclo dispensado: assinatura pausada', created_at: agora, created_by: actorId || null, updated_at: agora, updated_by: actorId || null });
    }
  }
  return { status: 'ativa', pausada_em: null };
}));

// Cancelar: "fim_do_ciclo" (padrão, decisão do dono) vale até o último dia do ciclo atual;
// "agora" deixa de valer hoje. Sem reembolso automático: a cobrança paga continua paga.
router.post('/assinaturas/:id/cancelar', authorize('assinatura:gerir'), (req, res, next) => mudarStatus(req, res, next, async ({ a, plano, dia }) => {
  if (a.status === 'cancelada') throw createAppError('ASSINATURA_JA_CANCELADA', 'A assinatura já está cancelada.', 409);
  const quando = (req.body && req.body.quando) || 'fim_do_ciclo';
  if (!['fim_do_ciclo', 'agora'].includes(quando)) throw invalido('quando', 'quando deve ser fim_do_ciclo ou agora.');
  const atual = cicloDe(a.inicio, plano.periodicidade, dia);
  const noFim = quando === 'fim_do_ciclo' && atual && a.status === 'ativa';
  return { status: 'cancelada', pausada_em: null, cancelar_no_fim_do_ciclo: Boolean(noFim), cancelada_em: noFim ? atual.fim : dia };
}));

module.exports = { assinantesRouter: router, avaliarCobertura, somarDias };

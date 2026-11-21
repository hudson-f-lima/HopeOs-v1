// Atendimento com vários serviços — consulta de combinações (D-040, Onda 1). Somente leitura:
// nada é gravado aqui. A gravação "tudo ou nada" das etapas é a Onda 2 (migration 019).
//
// POST /api/agenda/combinacoes
//   { data, itens: [{ servicoId, profissionalId? }], horario?, escolha?: [{ servicoId, profissionalId, horario }] }
// Devolve as opções (um profissional; sequência com profissionais diferentes; fracionado com
// espera até o limite), os totais por profissional e, se veio `escolha`, se ela ainda é válida.
// O servidor recalcula preço e duração: nada disso vem do cliente.
const express = require('express');
const { authorize, assertOwn } = require('../auth/rbac');
const { autoriaDe } = require('../middleware/auth');
const { registrarEventoAgenda } = require('../services/AgendaEventosService');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { createAppError } = require('../errors');
const { env } = require('../config/env');
const clock = require('../config/clock');
const { validateUUID } = require('../validators/cadastros.validator');
const { agoraNoFuso } = require('../engines/SlotEngine');
const { timeToMinutes } = require('../engines/ScheduleEngine');
const { combinar, validarEtapas, livresDoProfissional, precoDe, duracaoDe, minutesToTime, MAX_SERVICOS, ESPERA_MAX_PADRAO_MIN, ORDENS } = require('../engines/AtendimentoEngine');

const router = express.Router();
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const invalido = (field, message) => createAppError('INVALID_FIELD', message, 422, { field });

function esperaMaxDe(empresa) {
  const n = Number(empresa && empresa.atendimento_espera_max_min);
  return Number.isInteger(n) && n >= 0 && n <= 240 && empresa.atendimento_espera_max_min !== null && empresa.atendimento_espera_max_min !== undefined ? n : ESPERA_MAX_PADRAO_MIN;
}

// Contexto do dia para o motor: catálogo ativo, vínculos e espaços livres de cada profissional.
// Usado por esta consulta e, na Onda 2, pela revalidação ao gravar.
async function contextoDoDia(repo, data, { ignorarIds = [] } = {}) {
  const filtro = { empresa_id: repo.empresaId };
  const [empresa, servicos, profissionais, vinculos, agendamentos] = await Promise.all([
    repo.empresaComDisponibilidade(),
    repo.list('servicos', filtro), repo.list('profissionais', filtro), repo.list('profissional_servicos', filtro),
    repo.list('agendamentos', { ...filtro, data })
  ]);
  const ativos = profissionais.filter(p => p.ativo !== false);
  const livresPor = new Map(ativos.map(p => [p.id, livresDoProfissional({ profissional: p, empresa: empresa || {}, data, agendamentos, ignorarIds })]));
  const agora = agoraNoFuso(env.APP_TIMEZONE, clock.agora());
  return {
    empresa: empresa || {}, servicos: servicos.filter(s => s.ativo !== false), profissionais: ativos, vinculos, livresPor,
    esperaMaxMin: esperaMaxDe(empresa), passado: data < agora.data, inicioMinimoMin: data === agora.data ? agora.minuto + 1 : null
  };
}

function validarPedido(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw createAppError('INVALID_PAYLOAD', 'Payload inválido.', 422);
  const { data, itens, horario, escolha, ordem } = body;
  if (ordem !== undefined && ordem !== null && !ORDENS.includes(ordem)) throw invalido('ordem', `ordem deve ser uma de: ${ORDENS.join(', ')}.`);
  if (typeof data !== 'string' || !DATA_RE.test(data) || Number.isNaN(Date.parse(`${data}T00:00:00Z`))) throw invalido('data', 'data deve ser AAAA-MM-DD.');
  if (!Array.isArray(itens) || !itens.length || itens.length > MAX_SERVICOS) throw invalido('itens', `Informe de 1 a ${MAX_SERVICOS} serviços.`);
  for (const it of itens) {
    validateUUID(it && it.servicoId, 'servicoId');
    if (it.profissionalId !== undefined && it.profissionalId !== null) validateUUID(it.profissionalId, 'profissionalId');
  }
  if (new Set(itens.map(i => i.servicoId)).size !== itens.length) throw invalido('itens', 'O mesmo serviço aparece duas vezes.');
  if (horario !== undefined && horario !== null && (typeof horario !== 'string' || !HORA_RE.test(horario))) throw invalido('horario', 'horario deve ser HH:MM.');
  if (escolha !== undefined && escolha !== null) {
    if (!Array.isArray(escolha) || escolha.length !== itens.length) throw invalido('escolha', 'escolha deve ter uma etapa por serviço.');
    for (const e of escolha) {
      validateUUID(e && e.servicoId, 'escolha.servicoId'); validateUUID(e.profissionalId, 'escolha.profissionalId');
      if (typeof e.horario !== 'string' || !HORA_RE.test(e.horario)) throw invalido('escolha.horario', 'horario deve ser HH:MM.');
    }
  }
  return { data, itens, horario: horario || null, escolha: escolha || null, ordem: ordem || 'padrao' };
}

// Por que não há opção (D-055): explica em vez de só mostrar a lista vazia.
function motivoSemOpcao(ctx, r, itens) {
  if (ctx.passado) return 'Data no passado.';
  if (r.semCandidato && r.semCandidato.length) {
    const nomes = itens.filter(it => r.semCandidato.includes(it.servico.id)).map(it => it.servico.nome);
    return `Nenhum profissional habilitado (ou disponível na escolha) para: ${nomes.join(', ')}.`;
  }
  if (r.opcoes.length) return r.semOpcaoComEscolhido ? 'O profissional escolhido não tem como fazer tudo neste dia; veja as alternativas.' : null;
  if (r.busca && r.busca.truncada) return `A busca parou no limite de ${r.busca.limite} tentativas sem achar opção. Fixe um profissional ou um horário para reduzir.`;
  return `Nenhuma combinação cabe neste dia: confira escala, bloqueios, agendamentos e a espera máxima entre etapas (${ctx.esperaMaxMin} min).`;
}

const etapaPublica = e => ({
  servicoId: e.servico.id, servicoNome: e.servico.nome, profissionalId: e.profissional.id, profissionalNome: e.profissional.nome,
  fixado: e.fixado, inicio: minutesToTime(e.inicioMin), fim: minutesToTime(e.fimMin), duracaoMin: e.duracaoMin,
  precoCentavos: e.precoCentavos, esperaAntesMin: e.esperaAntesMin
});

router.post('/agenda/combinacoes', authorize('agenda:ver'), async (req, res, next) => {
  try {
    const pedido = validarPedido(req.body);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const ctx = await contextoDoDia(repo, pedido.data);
    // Escopo "próprio" (profissional): só combina consigo mesmo.
    const proprio = req.authz && req.authz.own ? (req.authz.profissionalId || req.auth.profissional_id) : null;
    const profissionais = proprio ? ctx.profissionais.filter(p => p.id === proprio) : ctx.profissionais;
    const itens = pedido.itens.map(it => {
      const servico = ctx.servicos.find(s => s.id === it.servicoId);
      if (!servico) throw createAppError('SERVICE_NOT_FOUND', 'Serviço não encontrado ou inativo.', 422, { id: it.servicoId });
      if (it.profissionalId && !profissionais.some(p => p.id === it.profissionalId)) throw createAppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado ou inativo.', 422, { id: it.profissionalId });
      return { servico, profissionalId: it.profissionalId || null };
    });
    const r = ctx.passado ? { opcoes: [], totaisPorProfissional: [], semCandidato: [] } : combinar({
      itens, profissionais, vinculos: ctx.vinculos, livresPor: ctx.livresPor, esperaMaxMin: ctx.esperaMaxMin,
      inicioMinimoMin: ctx.inicioMinimoMin, horario: pedido.horario, ordem: pedido.ordem,
      // Menor serviço ativo = menor bloco vendável (sobra menor que isso é tempo perdido).
      minUtilMin: Math.min(...ctx.servicos.map(sv => Number(sv.duracao_min) || 30).filter(n => n > 0), 30)
    });
    let escolha = null;
    if (pedido.escolha) {
      const etapas = pedido.escolha.map(e => {
        const servico = ctx.servicos.find(s => s.id === e.servicoId);
        const prof = profissionais.find(p => p.id === e.profissionalId);
        return { servico, prof, profissionalId: e.profissionalId, inicioMin: timeToMinutes(e.horario), duracaoMin: servico && prof ? duracaoDe(servico, prof) : 0 };
      });
      const semCadastro = etapas.map((e, i) => (!e.servico || !e.prof ? { etapa: i, motivo: 'cadastro' } : null)).filter(Boolean);
      const problemas = semCadastro.length || ctx.passado ? semCadastro.concat(ctx.passado ? [{ etapa: 0, motivo: 'passado' }] : [])
        : validarEtapas({ etapas, livresPor: ctx.livresPor, esperaMaxMin: ctx.esperaMaxMin, inicioMinimoMin: ctx.inicioMinimoMin });
      escolha = {
        valida: problemas.length === 0, problemas,
        precoCentavos: etapas.reduce((s, e) => s + (e.servico && e.prof ? precoDe(e.servico, e.prof) : 0), 0),
        duracaoMin: etapas.reduce((s, e) => s + e.duracaoMin, 0)
      };
    }
    res.json({
      ok: true,
      data: {
        data: pedido.data, esperaMaxMin: ctx.esperaMaxMin,
        totaisPorProfissional: r.totaisPorProfissional.map(t => ({ ...t, profissionalNome: (profissionais.find(p => p.id === t.profissionalId) || {}).nome || null })),
        semProfissional: r.semCandidato,
        // D-055: ordem usada, busca medida (limitada), alternativas quando o escolhido não cabe e o
        // motivo quando nada cabe. Sugestão não é reserva: o servidor revalida ao gravar.
        ordem: r.ordem || pedido.ordem, busca: r.busca || null, totalEncontradas: r.totalEncontradas ?? r.opcoes.length,
        alternativas: Boolean(r.alternativas), semOpcaoComEscolhido: Boolean(r.semOpcaoComEscolhido),
        motivo: motivoSemOpcao(ctx, r, itens),
        opcoes: r.opcoes.map(o => ({
          tipo: o.tipo, inicio: minutesToTime(o.inicioMin), fim: minutesToTime(o.fimMin), esperaMin: o.esperaMin,
          tempoTotalMin: o.tempoTotalMin, duracaoMin: o.duracaoMin, precoCentavos: o.precoCentavos, etapas: o.etapas.map(etapaPublica),
          sobraMin: o.sobraMin ?? 0, mantemPreferencia: o.mantemPreferencia ?? null
        })),
        escolha
      }
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Onda 2 (migration 019): gravar, consultar e cancelar o atendimento.
//
// POST /api/agenda/atendimentos { data, clienteId?, etapas: [{ servicoId, profissionalId, horario }] }
// O servidor recalcula duração e preço de cada etapa, confere habilitação, disponibilidade,
// ordem e limite de espera (validarEtapas) e grava todas as etapas numa transação
// (atendimento_criar). Se uma etapa conflitar na hora de gravar, nenhuma fica. Nunca encaixa à
// força.
const ATIVOS = ['agendado', 'confirmado'];
const hhmm = h => String(h || '').slice(0, 5);

router.post('/agenda/atendimentos', authorize('agenda:criar'), async (req, res, next) => {
  try {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw createAppError('INVALID_PAYLOAD', 'Payload inválido.', 422);
    const { data, clienteId, etapas } = body;
    if (typeof data !== 'string' || !DATA_RE.test(data) || Number.isNaN(Date.parse(`${data}T00:00:00Z`))) throw invalido('data', 'data deve ser AAAA-MM-DD.');
    if (!Array.isArray(etapas) || !etapas.length || etapas.length > MAX_SERVICOS) throw invalido('etapas', `Informe de 1 a ${MAX_SERVICOS} etapas.`);
    if (clienteId !== undefined && clienteId !== null) validateUUID(clienteId, 'clienteId');
    for (const e of etapas) {
      validateUUID(e && e.servicoId, 'servicoId'); validateUUID(e.profissionalId, 'profissionalId');
      if (typeof e.horario !== 'string' || !HORA_RE.test(e.horario)) throw invalido('horario', 'horario deve ser HH:MM.');
      assertOwn(req, e.profissionalId);
    }
    if (new Set(etapas.map(e => e.servicoId)).size !== etapas.length) throw invalido('etapas', 'O mesmo serviço aparece duas vezes.');
    const repo = new SupabaseRepository(req.auth.empresa_id);
    if (clienteId) {
      const cli = (await repo.list('clientes', { id: clienteId, empresa_id: repo.empresaId }))[0];
      if (!cli || cli.ativo === false) throw createAppError('CLIENT_NOT_FOUND', 'Cliente não encontrado ou inativo.', 422);
    }
    // D-058: versão da escala lida antes de calcular os espaços livres. atendimento_criar (019) não
    // confere a versão; o backend confere depois de gravar (abaixo) e desfaz tudo se a escala mudou
    // e alguma etapa não cabe mais.
    const dispVersao = await repo.versaoDisponibilidade().catch(() => null);
    const ctx = await contextoDoDia(repo, data);
    if (ctx.passado) throw createAppError('ATENDIMENTO_INVALIDO', 'Essa data já passou.', 422, { problemas: [{ etapa: 0, motivo: 'passado' }] });
    const habilitado = (profId, servicoId) => {
      const doProf = ctx.vinculos.filter(v => v.profissional_id === profId);
      return !doProf.length ? !ctx.vinculos.length : doProf.some(v => v.servico_id === servicoId);
    };
    const calculadas = etapas.map(e => {
      const servico = ctx.servicos.find(s => s.id === e.servicoId);
      const prof = ctx.profissionais.find(p => p.id === e.profissionalId);
      if (!servico) throw createAppError('SERVICE_NOT_FOUND', 'Serviço não encontrado ou inativo.', 422, { id: e.servicoId });
      if (!prof) throw createAppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado ou inativo.', 422, { id: e.profissionalId });
      if (!habilitado(prof.id, servico.id)) throw createAppError('SERVICE_NOT_ALLOWED_FOR_PROFESSIONAL', `${prof.nome} não faz ${servico.nome}.`, 422, { servicoId: servico.id, profissionalId: prof.id });
      return { servico, prof, profissionalId: prof.id, horario: e.horario, inicioMin: timeToMinutes(e.horario), duracaoMin: duracaoDe(servico, prof), precoCentavos: precoDe(servico, prof) };
    });
    const problemas = validarEtapas({ etapas: calculadas, livresPor: ctx.livresPor, esperaMaxMin: ctx.esperaMaxMin, inicioMinimoMin: ctx.inicioMinimoMin });
    if (problemas.length) {
      throw createAppError('ATENDIMENTO_INVALIDO', 'Uma ou mais etapas não cabem mais na agenda. Veja as opções de novo.', 409, {
        problemas: problemas.map(p => ({ ...p, servicoNome: calculadas[p.etapa].servico.nome, profissionalNome: calculadas[p.etapa].prof.nome, horario: calculadas[p.etapa].horario }))
      });
    }
    const { actorId } = autoriaDe(req.auth);
    let r;
    try {
      r = await repo.criarAtendimento({
        etapas: calculadas.map(e => ({
          cliente_id: clienteId || null, servico_id: e.servico.id, profissional_id: e.prof.id, data, horario: e.horario,
          duracao_min: e.duracaoMin, valor_centavos: e.precoCentavos
        })),
        createdBy: actorId || null
      });
    } catch (err) {
      if (err && (err.code === 'SCHEDULE_CONFLICT' || err.statusCode === 409)) {
        throw createAppError('ATENDIMENTO_CONFLITO', 'Um dos horários acabou de ser ocupado. Nenhuma etapa foi reservada; veja as opções de novo.', 409, { conflitos: (err.details && err.details.conflitos) || [] });
      }
      throw err;
    }
    for (const a of r.agendamentos) {
      await registrarEventoAgenda(repo, req.auth, { agendamentoId: a.id, tipo: 'criado', de: null, para: 'agendado', extra: { grupo_id: r.grupo_id, grupo_seq: a.grupo_seq, etapas: r.agendamentos.length } });
    }
    const depois = dispVersao === null ? null : await repo.versaoDisponibilidade().catch(() => null);
    if (depois !== null && depois !== dispVersao) {
      const ids = r.agendamentos.map(a => a.id);
      const ctx2 = await contextoDoDia(repo, data, { ignorarIds: ids });
      const problemas2 = validarEtapas({ etapas: calculadas, livresPor: ctx2.livresPor, esperaMaxMin: ctx2.esperaMaxMin, inicioMinimoMin: null });
      if (problemas2.length) {
        const agoraIso = clock.agora().toISOString();
        for (const a of r.agendamentos) {
          await repo.atualizarStatusAgendamentoSe(a.id, ATIVOS, { status: 'cancelado', cancelled_by: actorId || null, updated_at: agoraIso, updated_by: actorId || null });
          await registrarEventoAgenda(repo, req.auth, { agendamentoId: a.id, tipo: 'status', de: 'agendado', para: 'cancelado', extra: { motivo: 'escala_mudou_durante_reserva', grupo_id: r.grupo_id } });
        }
        throw createAppError('ESCALA_MUDOU', 'A escala mudou enquanto o atendimento era gravado. Nenhuma etapa ficou reservada; veja as opções de novo.', 409, {
          problemas: problemas2.map(p => ({ ...p, servicoNome: calculadas[p.etapa].servico.nome, profissionalNome: calculadas[p.etapa].prof.nome, horario: calculadas[p.etapa].horario }))
        });
      }
    }
    res.status(201).json({
      ok: true,
      data: {
        grupoId: r.grupo_id,
        precoCentavos: calculadas.reduce((s, e) => s + e.precoCentavos, 0),
        inicio: calculadas[0].horario, fim: minutesToTime(calculadas[calculadas.length - 1].inicioMin + calculadas[calculadas.length - 1].duracaoMin),
        etapas: r.agendamentos.map((a, i) => ({ agendamentoId: a.id, seq: a.grupo_seq, servicoNome: calculadas[i].servico.nome, profissionalNome: calculadas[i].prof.nome, horario: hhmm(a.horario), duracaoMin: a.duracao_min, precoCentavos: a.valor_centavos }))
      }
    });
  } catch (err) { next(err); }
});

async function carregarAtendimento(req, grupoId) {
  const repo = new SupabaseRepository(req.auth.empresa_id);
  const etapas = (await repo.list('agendamentos', { empresa_id: repo.empresaId, grupo_id: validateUUID(grupoId, 'grupoId') }))
    .sort((a, b) => (a.grupo_seq || 0) - (b.grupo_seq || 0));
  if (!etapas.length) throw createAppError('ATENDIMENTO_NOT_FOUND', 'Atendimento não encontrado.', 404);
  const filtro = { empresa_id: repo.empresaId };
  const [servicos, profissionais] = await Promise.all([repo.list('servicos', filtro), repo.list('profissionais', filtro)]);
  const nome = (lista, id) => ((lista.find(x => x.id === id) || {}).nome) || null;
  return {
    repo, etapas,
    publicas: etapas.map(a => ({
      agendamentoId: a.id, seq: a.grupo_seq, data: String(a.data), horario: hhmm(a.horario), duracaoMin: a.duracao_min, status: a.status,
      servicoNome: nome(servicos, a.servico_id), profissionalId: a.profissional_id, profissionalNome: nome(profissionais, a.profissional_id), precoCentavos: a.valor_centavos
    }))
  };
}

// Etapas do atendimento: o card mostra todas antes de qualquer mudança (cenário 10).
router.get('/agenda/atendimentos/:grupoId', authorize('agenda:ver'), async (req, res, next) => {
  try {
    const { etapas, publicas } = await carregarAtendimento(req, req.params.grupoId);
    if (req.authz && req.authz.own && !etapas.some(a => a.profissional_id === (req.authz.profissionalId || req.auth.profissional_id))) {
      throw createAppError('ATENDIMENTO_NOT_FOUND', 'Atendimento não encontrado.', 404);
    }
    res.json({ ok: true, data: { grupoId: req.params.grupoId, precoCentavos: publicas.filter(e => ATIVOS.includes(e.status)).reduce((s, e) => s + (Number(e.precoCentavos) || 0), 0), etapas: publicas } });
  } catch (err) { next(err); }
});

// Cancelar: "etapa" (só a escolhida) ou "todas" (as que ainda estão ativas). A resposta diz
// quais foram canceladas e quais continuam. `simular: true` só informa o impacto, sem gravar.
router.post('/agenda/atendimentos/:grupoId/cancelar', authorize('agenda:cancelar'), async (req, res, next) => {
  try {
    const body = req.body || {};
    if (!['etapa', 'todas'].includes(body.escopo)) throw invalido('escopo', 'escopo deve ser etapa ou todas.');
    if (body.escopo === 'etapa') validateUUID(body.agendamentoId, 'agendamentoId');
    const { repo, etapas, publicas } = await carregarAtendimento(req, req.params.grupoId);
    const alvos = etapas.filter(a => ATIVOS.includes(a.status) && (body.escopo === 'todas' || a.id === body.agendamentoId));
    if (body.escopo === 'etapa' && !etapas.some(a => a.id === body.agendamentoId)) throw createAppError('AGENDAMENTO_NOT_FOUND', 'Essa etapa não é deste atendimento.', 404);
    for (const a of alvos) assertOwn(req, a.profissional_id);
    const idsAlvo = new Set(alvos.map(a => a.id));
    const afetadas = publicas.filter(e => idsAlvo.has(e.agendamentoId));
    const mantidas = publicas.filter(e => !idsAlvo.has(e.agendamentoId) && ATIVOS.includes(e.status));
    if (body.simular === true) return res.json({ ok: true, data: { simulado: true, afetadas, mantidas } });
    const { actorId } = autoriaDe(req.auth);
    const agoraIso = clock.agora().toISOString();
    const canceladas = [];
    for (const a of alvos) {
      const r = await repo.atualizarStatusAgendamentoSe(a.id, ATIVOS, { status: 'cancelado', cancelled_by: actorId || null, updated_at: agoraIso, updated_by: actorId || null });
      if (!r) continue;
      await registrarEventoAgenda(repo, req.auth, { agendamentoId: a.id, tipo: 'status', de: a.status, para: 'cancelado', extra: { grupo_id: req.params.grupoId, escopo: body.escopo } });
      canceladas.push(afetadas.find(e => e.agendamentoId === a.id));
    }
    res.json({ ok: true, data: { simulado: false, afetadas: canceladas, mantidas } });
  } catch (err) { next(err); }
});

module.exports = { atendimentoRouter: router, contextoDoDia, esperaMaxDe };

// Recorrência de agendamentos, só pela equipe (C4, D-039, migration 018).
//
// - Prévia: o servidor calcula as datas e diz, para cada uma, se está livre, em conflito, fora da
//   escala ou no passado. Nada é gravado.
// - Criar: grava a série e cada ocorrência livre pela mesma função de sempre (agendamento_criar,
//   conflito checado sob trava no banco). Ocorrência que ficou indisponível entre a prévia e a
//   gravação é pulada e informada. A série nunca encaixa à força.
// - Cancelar ou alterar: "só este", "este e os próximos" ou "todos" (os que ainda vão acontecer).
//   Alterar = remarcar cada ocorrência (o antigo vira `reagendado`), mantendo a marcação de série
//   e levando o link pessoal do cliente (C2) junto.
// O cliente nunca cria série pelo link público (decisão do dono, risco de fraude): estas rotas
// exigem login e a permissão agenda:recorrencia.
const express = require('express');
const { authorize, assertOwn, exigirTambem } = require('../auth/rbac');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { createAppError } = require('../errors');
const { autoriaDe } = require('../middleware/auth');
const { env } = require('../config/env');
const clock = require('../config/clock');
const { validateUUID } = require('../validators/cadastros.validator');
const { datasDaSerie, FREQUENCIAS, MIN_OCORRENCIAS, MAX_OCORRENCIAS } = require('../engines/RecorrenciaEngine');
const { resolveDuracaoMin, agoraNoFuso } = require('../engines/SlotEngine');
const { findScheduleConflicts, timeToMinutes } = require('../engines/ScheduleEngine');
const { disponibilidadeDoDia, cabe } = require('../engines/DisponibilidadeEngine');
const { registrarEventoAgenda } = require('../services/AgendaEventosService');
const { moverAcessos } = require('../services/AcessoAgendamento');

const router = express.Router();
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ESCOPOS = ['este', 'proximos', 'todos'];
const ATIVOS = ['agendado', 'confirmado'];

const invalido = (field, message) => createAppError('INVALID_FIELD', message, 422, { field });
const hhmm = h => String(h || '').slice(0, 5);

function validarSerie(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw createAppError('INVALID_PAYLOAD', 'Payload inválido.', 422);
  const { clienteId, servicoId, profissionalId, dataInicio, horario, frequencia, ocorrencias, duracaoMin, foraDaDisponibilidade } = body;
  for (const [campo, v] of [['clienteId', clienteId], ['servicoId', servicoId], ['profissionalId', profissionalId]]) validateUUID(v, campo);
  if (typeof dataInicio !== 'string' || !DATA_RE.test(dataInicio) || Number.isNaN(Date.parse(`${dataInicio}T00:00:00Z`))) throw invalido('dataInicio', 'dataInicio deve ser AAAA-MM-DD.');
  if (typeof horario !== 'string' || !HORA_RE.test(horario)) throw invalido('horario', 'horario deve ser HH:MM.');
  if (!FREQUENCIAS.includes(frequencia)) throw invalido('frequencia', `frequencia deve ser ${FREQUENCIAS.join(', ')}.`);
  const n = Number(ocorrencias);
  if (!Number.isInteger(n) || n < MIN_OCORRENCIAS || n > MAX_OCORRENCIAS) throw invalido('ocorrencias', `ocorrencias deve ser de ${MIN_OCORRENCIAS} a ${MAX_OCORRENCIAS}.`);
  if (duracaoMin !== undefined && (!Number.isInteger(Number(duracaoMin)) || Number(duracaoMin) < 5 || Number(duracaoMin) > 600)) throw invalido('duracaoMin', 'duracaoMin deve ser de 5 a 600.');
  if (foraDaDisponibilidade !== undefined && typeof foraDaDisponibilidade !== 'boolean') throw invalido('foraDaDisponibilidade', 'foraDaDisponibilidade deve ser verdadeiro ou falso.');
  // D-076: encaixe fora da escala na série só com agenda:encaixar (checado em prepararSerie).
  return { clienteId, servicoId, profissionalId, dataInicio, horario, frequencia, ocorrencias: n, duracaoMin: duracaoMin === undefined ? undefined : Number(duracaoMin), foraDaDisponibilidade: foraDaDisponibilidade === true };
}

async function ativo(repo, table, id, label, code) {
  const row = (await repo.list(table, { id, empresa_id: repo.empresaId }))[0];
  if (!row) throw createAppError(code, `${label} não encontrado.`, 422, { id });
  if (row.ativo === false) throw createAppError(code.replace('_NOT_FOUND', '_INACTIVE'), `${label} inativo.`, 422, { id });
  return row;
}

function precoDe(servico, profissional) {
  let ov = profissional && profissional.overrides;
  if (typeof ov === 'string') { try { ov = JSON.parse(ov); } catch (_) { ov = {}; } }
  const o = (ov && ov[servico.id]) || {};
  const v = [o.valor_centavos, o.valorCentavos, servico.valor_centavos].find(x => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)) && Number(x) >= 0);
  return v === undefined ? 0 : Math.round(Number(v));
}

// Situação de cada data: livre, conflito, fora da escala ou passado. Uma leitura da agenda do
// profissional no intervalo e uma da disponibilidade, para a série inteira.
async function avaliarDatas(repo, { profissional, datas, horario, duracaoMin, ignorarIds = [] }) {
  const agora = agoraNoFuso(env.APP_TIMEZONE, clock.agora());
  const [empresa, disp, agendamentos] = await Promise.all([
    repo.list('empresas', { id: repo.empresaId }).then(r => r[0] || {}),
    repo.carregarDisponibilidade(),
    repo.list('agendamentos', { empresa_id: repo.empresaId, profissional_id: profissional.id })
  ]);
  const comRegras = disp && (disp.semanal.length || disp.excecoes.length);
  const ignorar = new Set(ignorarIds);
  const existentes = agendamentos.filter(a => !ignorar.has(a.id)).map(a => ({ ...a, data: String(a.data) }));
  const minuto = timeToMinutes(horario);
  return datas.map((data, i) => {
    const base = { seq: i + 1, data, horario };
    if (data < agora.data || (data === agora.data && minuto <= agora.minuto)) return { ...base, situacao: 'passado' };
    if (comRegras) {
      const d = disponibilidadeDoDia({ data, semanal: disp.semanal, excecoes: disp.excecoes, profissional });
      if (!cabe(d.periodos, minuto, duracaoMin)) return { ...base, situacao: 'fora_da_disponibilidade', motivo: d.origem || null };
    }
    const conflitos = findScheduleConflicts({ agendamento: { profissionalId: profissional.id, data, horario, duracaoMin }, existing: existentes, bufferMin: Number(empresa.buffer_min) || 0 });
    if (conflitos.length) return { ...base, situacao: 'conflito' };
    return { ...base, situacao: 'livre' };
  });
}

async function prepararSerie(req) {
  const s = validarSerie(req.body);
  const repo = new SupabaseRepository(req.auth.empresa_id);
  const [cliente, servico, profissional] = await Promise.all([
    ativo(repo, 'clientes', s.clienteId, 'Cliente', 'CLIENT_NOT_FOUND'),
    ativo(repo, 'servicos', s.servicoId, 'Serviço', 'SERVICE_NOT_FOUND'),
    ativo(repo, 'profissionais', s.profissionalId, 'Profissional', 'PROFESSIONAL_NOT_FOUND')
  ]);
  assertOwn(req, profissional.id);
  // Antes de ler a agenda: quem não pode encaixar recebe 403 sem nada gravado.
  if (s.foraDaDisponibilidade) exigirTambem(req, 'agenda:encaixar');
  const duracaoMin = resolveDuracaoMin({ servico, profissional, duracaoMin: s.duracaoMin });
  const datas = datasDaSerie(s.dataInicio, s.frequencia, s.ocorrencias);
  // D-058: versão da escala lida antes de avaliar as datas; o banco recusa se mudar até gravar.
  const dispVersao = await repo.versaoDisponibilidade().catch(() => null);
  const ocorrencias = await avaliarDatas(repo, { profissional, datas, horario: s.horario, duracaoMin });
  return { s, repo, cliente, servico, profissional, duracaoMin, ocorrencias, dispVersao };
}

const resumo = ocorrencias => ({
  total: ocorrencias.length,
  livres: ocorrencias.filter(o => o.situacao === 'livre').length,
  indisponiveis: ocorrencias.filter(o => o.situacao !== 'livre').length
});

// Motivo legível de cada data que ficou de fora (a tela mostra; a trilha guarda).
const MOTIVO = {
  conflito: 'Horário já ocupado por outro atendimento',
  fora_da_disponibilidade: 'Fora da escala (folga, fechamento ou fora do expediente)',
  passado: 'Data que já passou',
  erro: 'Falha ao gravar'
};
const motivoDe = codigo => MOTIVO[codigo] || 'Motivo não registrado';

// Trava na instância: dois pedidos iguais ao mesmo tempo (duplo toque, retry da rede) entram um por
// vez, e o segundo já encontra a série do primeiro. Entre instâncias quem protege é o conflito de
// horário no banco (agendamento_criar): o mesmo horário nunca é gravado duas vezes.
const travas = new Map();
async function comTrava(chave, fn) {
  const anterior = travas.get(chave) || Promise.resolve();
  let liberar;
  const atual = new Promise(r => { liberar = r; });
  const cadeia = anterior.then(() => atual);
  travas.set(chave, cadeia);
  await anterior;
  try { return await fn(); } finally {
    liberar();
    if (travas.get(chave) === cadeia) travas.delete(chave);
  }
}

// O horário foi criado e o vínculo com a série é gravado depois (duas chamadas). Tenta 3 vezes e
// confere o que voltou; se não vincular, quem chama desfaz tudo (nunca fica horário sem série).
async function vincularASerie(repo, agendamentoId, serieId, seq) {
  let ultimo = null;
  for (let t = 0; t < 3; t++) {
    try {
      const r = await repo.updateScoped('agendamentos', agendamentoId, { serie_id: serieId, serie_seq: seq });
      if (r && r.serie_id === serieId && r.serie_seq === seq) return r;
      ultimo = new Error('vínculo não confirmado');
    } catch (err) { ultimo = err; }
  }
  throw ultimo || new Error('vínculo não gravado');
}

// Desfaz o que a criação já gravou: cancela os horários (não existe apagar: o histórico fica, com o
// motivo na trilha) e encerra a série. Nunca deixa a série "ativa" com parte dos horários.
async function desfazerCriacao(req, repo, serie, agendamentoIds, motivo) {
  const { actorId } = autoriaDe(req.auth);
  const agoraIso = clock.agora().toISOString();
  let desfeitos = 0;
  for (const id of agendamentoIds) {
    try {
      const r = await repo.atualizarStatusAgendamentoSe(id, ATIVOS, { status: 'cancelado', cancelled_by: actorId || null, updated_at: agoraIso, updated_by: actorId || null });
      if (r) {
        desfeitos += 1;
        await registrarEventoAgenda(repo, req.auth, { agendamentoId: id, tipo: 'status', de: 'agendado', para: 'cancelado', extra: { serie_id: serie.id, motivo } });
      }
    } catch (err) { console.error('[series] não consegui desfazer um horário:', (err && err.code) || 'erro'); }
  }
  try { await repo.updateScoped('agendamento_series', serie.id, { status: 'encerrada', updated_at: agoraIso, updated_by: actorId || null }); }
  catch (err) { console.error('[series] não consegui encerrar a série:', (err && err.code) || 'erro'); }
  return desfeitos;
}

// Já existe uma série ativa igual (mesmo cliente, serviço, profissional, frequência, horário, início
// e quantidade) com algum horário ainda por vir? Então o pedido é uma repetição.
async function serieIgualAtiva(repo, s) {
  const hoje = agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
  const candidatas = (await repo.list('agendamento_series', { empresa_id: repo.empresaId })).filter(x => x.status === 'ativa' &&
    x.cliente_id === s.clienteId && x.servico_id === s.servicoId && x.profissional_id === s.profissionalId && x.frequencia === s.frequencia &&
    hhmm(x.horario) === s.horario && String(x.data_inicio) === s.dataInicio && Number(x.ocorrencias) === s.ocorrencias);
  for (const c of candidatas) {
    const vivos = (await repo.list('agendamentos', { empresa_id: repo.empresaId, serie_id: c.id })).filter(a => ATIVOS.includes(a.status) && String(a.data) >= hoje);
    if (vivos.length) return c;
  }
  return null;
}

router.post('/agenda/series/previa', authorize('agenda:recorrencia'), async (req, res, next) => {
  try {
    const { ocorrencias, duracaoMin } = await prepararSerie(req);
    res.json({ ok: true, data: { duracaoMin, ...resumo(ocorrencias), ocorrencias } });
  } catch (err) { next(err); }
});

router.post('/agenda/series', authorize('agenda:recorrencia'), async (req, res, next) => {
  try {
    const pedido = validarSerie(req.body); // 422 antes de qualquer trava ou leitura
    const chave = [req.auth.empresa_id, pedido.clienteId, pedido.profissionalId, pedido.dataInicio, pedido.horario].join('|');
    const saida = await comTrava(chave, () => criarSerie(req, pedido));
    res.status(201).json({ ok: true, data: saida });
  } catch (err) { next(err); }
});

async function criarSerie(req, pedido) {
  const { s, repo, servico, profissional, duracaoMin, ocorrencias, dispVersao } = await prepararSerie(req);
  void pedido;
  const igual = await serieIgualAtiva(repo, s);
  if (igual) {
    throw createAppError('SERIE_DUPLICADA', 'Esta série já foi criada (mesmo cliente, serviço, profissional, dia e horário). Veja as datas dela pelo card do horário.', 409, { serieId: igual.id });
  }
  // Encaixe (D-076): as datas fora da escala entram só quando a pessoa pediu e tem agenda:encaixar.
  // Conflito com outro atendimento continua de fora: encaixe nunca sobrepõe.
  const encaixa = s.foraDaDisponibilidade === true;
  const livres = ocorrencias.filter(o => o.situacao === 'livre' || (encaixa && o.situacao === 'fora_da_disponibilidade'));
  if (!livres.length) throw createAppError('SERIE_SEM_HORARIOS', 'Nenhuma data da série está livre. Escolha outro horário ou outro profissional.', 409, { ocorrencias });
  const { actorId } = autoriaDe(req.auth);
  const agoraIso = clock.agora().toISOString();
  const serie = await repo.insert('agendamento_series', {
    cliente_id: s.clienteId, servico_id: s.servicoId, profissional_id: s.profissionalId, frequencia: s.frequencia,
    horario: s.horario, duracao_min: duracaoMin, data_inicio: s.dataInicio, ocorrencias: s.ocorrencias, status: 'ativa',
    created_at: agoraIso, created_by: actorId || null, updated_at: agoraIso, updated_by: actorId || null
  });
  const criadosIds = [];
  const criados = [];
  const pulados = ocorrencias.filter(o => !livres.includes(o)).map(o => ({ ...o, motivo: motivoDe(o.situacao) }));
  // Datas que ficam de fora por conflito ou escala vão na trilha da 1ª ocorrência: é de lá que a
  // tela, depois, explica por que a série tem menos horários que o previsto.
  let primeiroId = null;
  try {
    for (const o of livres) {
      let ag;
      // Encaixe sem disp_versao: o banco não recusa por escala mudada (como o avulso forçado, 026).
      const forcado = o.situacao === 'fora_da_disponibilidade';
      try {
        ag = await repo.criarAgendamento({
          agendamento: {
            cliente_id: s.clienteId, servico_id: s.servicoId, profissional_id: s.profissionalId, data: o.data, horario: s.horario,
            duracao_min: duracaoMin, valor_centavos: precoDe(servico, profissional), status: 'agendado',
            ...(!forcado && dispVersao !== null && dispVersao !== undefined ? { disp_versao: dispVersao } : {})
          },
          permitirConflito: false, createdBy: actorId || null
        });
      } catch (err) {
        // Escala mudou no meio (D-058): não é conflito de uma data; a série inteira é desfeita.
        if (err && err.code === 'ESCALA_MUDOU') throw err;
        if (err && (err.code === 'SCHEDULE_CONFLICT' || err.statusCode === 409)) { pulados.push({ ...o, situacao: 'conflito', motivo: motivoDe('conflito') }); continue; }
        throw err;
      }
      criadosIds.push(ag.id);
      await vincularASerie(repo, ag.id, serie.id, o.seq);
      if (!primeiroId) primeiroId = ag.id;
      criados.push({ seq: o.seq, data: o.data, horario: s.horario, agendamentoId: ag.id, forcado });
    }
  } catch (err) {
    // Erro que não é conflito (banco, vínculo): tudo ou nada. Nada fica pela metade.
    const desfeitos = await desfazerCriacao(req, repo, serie, criadosIds, err && err.code === 'ESCALA_MUDOU' ? 'escala_mudou_durante_reserva' : 'criacao_da_serie_falhou');
    if (err && err.code === 'ESCALA_MUDOU') {
      throw createAppError('ESCALA_MUDOU', `A escala mudou enquanto a série era gravada; nada ficou marcado (${desfeitos} horário(s) desfeito(s)). Veja a prévia de novo.`, 409, { desfeitos, serieId: serie.id });
    }
    console.error('[series] criação desfeita:', (err && err.code) || (err && err.message) || 'erro');
    throw createAppError('SERIE_FALHOU', `Não foi possível criar a série; nada ficou marcado (${desfeitos} horário(s) desfeito(s)). Tente de novo.`, 500, { desfeitos, serieId: serie.id });
  }
  if (!criados.length) {
    // Todas as datas ocuparam entre a prévia e a gravação (corrida): a série não fica ativa e vazia.
    await desfazerCriacao(req, repo, serie, [], 'sem_horarios');
    throw createAppError('SERIE_SEM_HORARIOS', 'Os horários da série foram ocupados enquanto você confirmava. Escolha outro horário.', 409, { ocorrencias: pulados });
  }
  pulados.sort((a, b) => a.seq - b.seq);
  await registrarEventoAgenda(repo, req.auth, {
    agendamentoId: primeiroId, tipo: 'criado', de: null, para: 'agendado',
    extra: { serie_id: serie.id, serie_seq: criados[0].seq, serie_resumo: true, puladas: pulados.map(p => ({ seq: p.seq, data: p.data, situacao: p.situacao })), ...(criados.some(c => c.forcado) ? { encaixes: criados.filter(c => c.forcado).map(c => c.seq) } : {}) }
  });
  for (const c of criados.slice(1)) {
    await registrarEventoAgenda(repo, req.auth, { agendamentoId: c.agendamentoId, tipo: 'criado', de: null, para: 'agendado', extra: { serie_id: serie.id, serie_seq: c.seq, ...(c.forcado ? { fora_da_disponibilidade: 'serie_encaixe' } : {}) } });
  }
  const datas = [...criados.map(c => ({ seq: c.seq, data: c.data, horario: c.horario, situacao: 'criada', agendamentoId: c.agendamentoId, ...(c.forcado ? { encaixe: true } : {}) })),
    ...pulados.map(p => ({ seq: p.seq, data: p.data, horario: s.horario, situacao: p.situacao, motivo: p.motivo }))].sort((a, b) => a.seq - b.seq);
  return {
    serie: { id: serie.id, frequencia: serie.frequencia, ocorrencias: serie.ocorrencias, status: serie.status },
    datas, resumo: { total: s.ocorrencias, criadas: criados.length, puladas: pulados.length }, criados, pulados
  };
}

async function carregarSerie(req, id) {
  const repo = new SupabaseRepository(req.auth.empresa_id);
  const serie = await repo.getByIdScoped('agendamento_series', validateUUID(id, 'id'));
  if (!serie) throw createAppError('SERIE_NOT_FOUND', 'Série não encontrada.', 404);
  const ocorrencias = (await repo.list('agendamentos', { empresa_id: repo.empresaId, serie_id: serie.id }))
    .sort((a, b) => (a.serie_seq || 0) - (b.serie_seq || 0) || String(a.data).localeCompare(String(b.data)));
  return { repo, serie, ocorrencias };
}

router.get('/agenda/series/:id', authorize('agenda:ver'), async (req, res, next) => {
  try {
    const { repo, serie, ocorrencias } = await carregarSerie(req, req.params.id);
    assertOwn(req, serie.profissional_id);
    // Por que uma data não virou horário? Vem da trilha da 1ª ocorrência, gravada na criação.
    let puladas = [];
    const primeira = ocorrencias.filter(a => a.status !== 'reagendado').sort((a, b) => (a.serie_seq || 0) - (b.serie_seq || 0))[0] || ocorrencias[0];
    if (primeira) {
      const evs = (await repo.list('agendamento_eventos', { empresa_id: repo.empresaId, agendamento_id: primeira.id, tipo: 'criado' }))
        .filter(e => e.payload && e.payload.serie_resumo);
      if (evs[0] && Array.isArray(evs[0].payload.puladas)) puladas = evs[0].payload.puladas;
    }
    const previstas = datasDaSerie(String(serie.data_inicio), serie.frequencia, serie.ocorrencias);
    const rotulo = { agendado: 'agendada', confirmado: 'agendada', aguardando: 'agendada', em_atendimento: 'agendada', concluido: 'concluida', fechado: 'concluida', cancelado: 'cancelada', no_show: 'faltou', reagendado: 'remarcada' };
    const datas = previstas.map((dataPrevista, i) => {
      const seq = i + 1;
      const doSeq = ocorrencias.filter(a => a.serie_seq === seq);
      // Vale a ocorrência viva; se só sobrou a remarcada, mostra ela.
      const a = doSeq.find(x => x.status !== 'reagendado') || doSeq[0];
      if (a) return { seq, data: String(a.data), dataPrevista, horario: hhmm(a.horario), situacao: rotulo[a.status] || a.status, agendamentoId: a.id, atual: false };
      const p = puladas.find(x => x.seq === seq);
      return { seq, data: dataPrevista, dataPrevista, horario: hhmm(serie.horario), situacao: 'nao_criada', motivoCodigo: p ? p.situacao : null, motivo: p ? motivoDe(p.situacao) : 'Não foi criada (motivo não registrado)' };
    });
    const existentes = datas.filter(d => d.situacao !== 'nao_criada').length;
    res.json({
      ok: true,
      data: {
        serie: { id: serie.id, frequencia: serie.frequencia, horario: hhmm(serie.horario), ocorrencias: serie.ocorrencias, status: serie.status, dataInicio: String(serie.data_inicio) },
        datas, resumo: { previstas: previstas.length, existentes, faltando: previstas.length - existentes },
        ocorrencias: ocorrencias.map(a => ({ agendamentoId: a.id, seq: a.serie_seq, data: String(a.data), horario: hhmm(a.horario), status: a.status, profissionalId: a.profissional_id }))
      }
    });
  } catch (err) { next(err); }
});

// Quais ocorrências o escopo pega, a partir da escolhida no card. Só as que ainda vão acontecer e
// estão ativas; "todos" inclui as anteriores à escolhida que ainda não passaram.
function alvosDoEscopo(ocorrencias, escolhida, escopo) {
  const hoje = agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
  const futuras = ocorrencias.filter(a => ATIVOS.includes(a.status) && String(a.data) >= hoje);
  if (escopo === 'este') return futuras.filter(a => a.id === escolhida.id);
  if (escopo === 'proximos') return futuras.filter(a => String(a.data) > String(escolhida.data) || a.id === escolhida.id || (String(a.data) === String(escolhida.data) && (a.serie_seq || 0) >= (escolhida.serie_seq || 0)));
  return futuras;
}

function validarEscopo(body) {
  if (!body || typeof body !== 'object') throw createAppError('INVALID_PAYLOAD', 'Payload inválido.', 422);
  if (!ESCOPOS.includes(body.escopo)) throw invalido('escopo', 'escopo deve ser este, proximos ou todos.');
  validateUUID(body.agendamentoId, 'agendamentoId');
  return body;
}

async function encerrarSeSemFuturas(repo, serie, actorId) {
  const hoje = agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
  const restantes = (await repo.list('agendamentos', { empresa_id: repo.empresaId, serie_id: serie.id }))
    .filter(a => ATIVOS.includes(a.status) && String(a.data) >= hoje);
  if (!restantes.length && serie.status !== 'encerrada') {
    await repo.updateScoped('agendamento_series', serie.id, { status: 'encerrada', updated_at: clock.agora().toISOString(), updated_by: actorId || null });
    return true;
  }
  return false;
}

router.post('/agenda/series/:id/cancelar', authorize('agenda:cancelar'), async (req, res, next) => {
  try {
    const body = validarEscopo(req.body);
    const { repo, serie, ocorrencias } = await carregarSerie(req, req.params.id);
    const escolhida = ocorrencias.find(a => a.id === body.agendamentoId);
    if (!escolhida) throw createAppError('AGENDAMENTO_NOT_FOUND', 'Esse horário não é desta série.', 404);
    const alvos = alvosDoEscopo(ocorrencias, escolhida, body.escopo);
    for (const a of alvos) assertOwn(req, a.profissional_id);
    const { actorId } = autoriaDe(req.auth);
    const agoraIso = clock.agora().toISOString();
    const cancelados = [];
    for (const a of alvos) {
      const r = await repo.atualizarStatusAgendamentoSe(a.id, ATIVOS, { status: 'cancelado', cancelled_by: actorId || null, updated_at: agoraIso, updated_by: actorId || null });
      if (!r) continue; // mudou no meio (atendido, cancelado por outro): fica como está
      await registrarEventoAgenda(repo, req.auth, { agendamentoId: a.id, tipo: 'status', de: a.status, para: 'cancelado', extra: { serie_id: serie.id, escopo: body.escopo } });
      cancelados.push({ agendamentoId: a.id, data: String(a.data), seq: a.serie_seq });
    }
    const encerrada = await encerrarSeSemFuturas(repo, serie, actorId);
    res.json({ ok: true, data: { cancelados, serieEncerrada: encerrada } });
  } catch (err) { next(err); }
});

// Alterar horário e/ou profissional das ocorrências do escopo (mesmo dia de cada uma). Cada uma é
// remarcada pela checagem normal (conflito e escala); a que não couber fica como estava e volta
// na lista `mantidos`. Nada é encaixado à força.
router.post('/agenda/series/:id/alterar', authorize('agenda:editar'), async (req, res, next) => {
  try {
    const body = validarEscopo(req.body);
    const novoHorario = body.novoHorario;
    const novoProfissionalId = body.novoProfissionalId;
    if (novoHorario === undefined && novoProfissionalId === undefined) throw createAppError('EMPTY_UPDATE', 'Informe novoHorario e/ou novoProfissionalId.', 422);
    if (novoHorario !== undefined && (typeof novoHorario !== 'string' || !HORA_RE.test(novoHorario))) throw invalido('novoHorario', 'novoHorario deve ser HH:MM.');
    const { repo, serie, ocorrencias } = await carregarSerie(req, req.params.id);
    const escolhida = ocorrencias.find(a => a.id === body.agendamentoId);
    if (!escolhida) throw createAppError('AGENDAMENTO_NOT_FOUND', 'Esse horário não é desta série.', 404);
    const profissional = novoProfissionalId !== undefined
      ? await ativo(repo, 'profissionais', validateUUID(novoProfissionalId, 'novoProfissionalId'), 'Profissional', 'PROFESSIONAL_NOT_FOUND')
      : await ativo(repo, 'profissionais', serie.profissional_id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    if (novoProfissionalId !== undefined) {
      const vinculos = await repo.list('profissional_servicos', { empresa_id: repo.empresaId, profissional_id: profissional.id });
      if (vinculos.length && !vinculos.some(v => v.servico_id === serie.servico_id)) throw createAppError('SERVICE_NOT_ALLOWED_FOR_PROFESSIONAL', 'Esse profissional não faz o serviço da série.', 422);
    }
    const alvos = alvosDoEscopo(ocorrencias, escolhida, body.escopo);
    for (const a of alvos) { assertOwn(req, a.profissional_id); assertOwn(req, profissional.id); }
    const horario = novoHorario || hhmm(serie.horario);
    const { actorId } = autoriaDe(req.auth);
    const agoraIso = clock.agora().toISOString();
    const alterados = [];
    const mantidos = [];
    const dispVersaoAlt = await repo.versaoDisponibilidade().catch(() => null); // D-058: antes de avaliar
    for (const a of alvos) {
      const h = novoHorario || hhmm(a.horario);
      const [sit] = await avaliarDatas(repo, { profissional, datas: [String(a.data)], horario: h, duracaoMin: Number(a.duracao_min) || 30, ignorarIds: [a.id] });
      if (sit.situacao !== 'livre') { mantidos.push({ agendamentoId: a.id, data: String(a.data), seq: a.serie_seq, situacao: sit.situacao }); continue; }
      let novo;
      try {
        novo = await repo.criarAgendamento({
          agendamento: {
            cliente_id: a.cliente_id, servico_id: a.servico_id, profissional_id: profissional.id, data: String(a.data), horario: h,
            duracao_min: Number(a.duracao_min) || 30, valor_centavos: Number(a.valor_centavos) || 0, status: 'agendado',
            ...(dispVersaoAlt !== null ? { disp_versao: dispVersaoAlt } : {})
          },
          permitirConflito: false, ignorarId: a.id, createdBy: actorId || null
        });
      } catch (err) {
        // Escala mudou no meio (D-058): este e os próximos ficam como estão; a tela diz o motivo.
        if (err && err.code === 'ESCALA_MUDOU') { mantidos.push({ agendamentoId: a.id, data: String(a.data), seq: a.serie_seq, situacao: 'escala_mudou' }); continue; }
        if (err && (err.code === 'SCHEDULE_CONFLICT' || err.statusCode === 409)) { mantidos.push({ agendamentoId: a.id, data: String(a.data), seq: a.serie_seq, situacao: 'conflito' }); continue; }
        throw err;
      }
      const antigo = await repo.atualizarStatusAgendamentoSe(a.id, ATIVOS, { status: 'reagendado', updated_at: agoraIso, updated_by: actorId || null });
      if (!antigo) {
        await repo.atualizarStatusAgendamentoSe(novo.id, ['agendado'], { status: 'cancelado', cancelled_by: actorId || null, updated_at: agoraIso, updated_by: actorId || null });
        mantidos.push({ agendamentoId: a.id, data: String(a.data), seq: a.serie_seq, situacao: 'mudou' });
        continue;
      }
      await repo.updateScoped('agendamentos', novo.id, { serie_id: serie.id, serie_seq: a.serie_seq });
      try { await moverAcessos(repo, a.id, novo, { timeZone: env.APP_TIMEZONE }); } catch (_) { /* sem a 017: o cliente só perde o link */ }
      await registrarEventoAgenda(repo, req.auth, { agendamentoId: a.id, tipo: 'reagendado', de: a.status, para: 'reagendado', extra: { reagendado_para: novo.id, serie_id: serie.id, escopo: body.escopo } });
      await registrarEventoAgenda(repo, req.auth, { agendamentoId: novo.id, tipo: 'reagendado', de: null, para: 'agendado', origem: 'reagendamento', extra: { reagendado_de: a.id, serie_id: serie.id, escopo: body.escopo } });
      alterados.push({ agendamentoId: novo.id, data: String(a.data), horario: h, seq: a.serie_seq });
    }
    // "Todos" e "este e os próximos" mudam a regra da série para o que vier depois.
    if (body.escopo !== 'este' && alterados.length) {
      await repo.updateScoped('agendamento_series', serie.id, { horario, profissional_id: profissional.id, updated_at: agoraIso, updated_by: actorId || null });
    }
    res.json({ ok: true, data: { alterados, mantidos } });
  } catch (err) { next(err); }
});

module.exports = { seriesRouter: router, alvosDoEscopo, ESCOPOS };

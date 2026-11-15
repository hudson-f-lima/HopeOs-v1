// Disponibilidade e escalas (D-033, migration 013). Horário da unidade, escala dos profissionais
// e exceções por data. O cálculo é o DisponibilidadeEngine; a gravação, as funções do banco (com
// trilha imutável). Alteração que deixa agendamentos fora da disponibilidade não é gravada sem
// decisão de quem tem escala:conflitos: nada é cancelado ou movido sozinho.
const express = require('express');
const { createAppError } = require('../errors');
const { authorize, authorizePor, assertOwn, pode } = require('../auth/rbac');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { disponibilidadeDoDia, cabe } = require('../engines/DisponibilidadeEngine');
const { timeToMinutes, INACTIVE_STATUSES } = require('../engines/ScheduleEngine');
const { agoraNoFuso } = require('../engines/SlotEngine');
const { env } = require('../config/env');
const clock = require('../config/clock');

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const invalido = (field, msg) => createAppError('INVALID_FIELD', msg, 422, { field });
const hoje = () => agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
const hhmm = t => String(t).slice(0, 5);

function dataValida(v, field) {
  const s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) !== s) throw invalido(field, `${field} deve ser AAAA-MM-DD.`);
  return s;
}

function corpo(req, campos) {
  const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  for (const k of Object.keys(b)) if (!campos.includes(k)) throw invalido(k, `Campo desconhecido: ${k}.`);
  return b;
}

// Períodos de um dia: HH:MM, fim depois do início, sem sobreposição.
function periodosValidos(lista, { comDia }) {
  if (!Array.isArray(lista) || lista.length > 100) throw invalido('periodos', 'periodos deve ser uma lista (até 100).');
  const out = lista.map((x, i) => {
    if (!x || typeof x !== 'object') throw invalido('periodos', `Período ${i + 1} inválido.`);
    if (!HORA.test(String(x.inicio)) || !HORA.test(String(x.fim)) || x.fim <= x.inicio) throw invalido('periodos', `Período ${i + 1}: horário inválido (HH:MM, fim depois do início).`);
    const p = { inicio: x.inicio, fim: x.fim };
    if (comDia) {
      if (!Number.isInteger(x.diaSemana) || x.diaSemana < 0 || x.diaSemana > 6) throw invalido('periodos', `Período ${i + 1}: diaSemana de 0 (domingo) a 6.`);
      p.diaSemana = x.diaSemana;
      const n = x.aCadaSemanas === undefined ? 1 : x.aCadaSemanas;
      if (![1, 2, 3, 4].includes(n)) throw invalido('periodos', `Período ${i + 1}: aCadaSemanas de 1 a 4.`);
      if (n > 1) { p.aCadaSemanas = n; p.semanaAncora = dataValida(x.semanaAncora, 'semanaAncora'); }
    }
    return p;
  });
  const chave = p => (comDia ? p.diaSemana : 0);
  const ord = [...out].sort((a, b) => chave(a) - chave(b) || a.inicio.localeCompare(b.inicio));
  for (let i = 1; i < ord.length; i++) {
    // Semanas alternadas (A/B) podem repetir o horário: só períodos semanais comuns se chocam.
    if (chave(ord[i]) === chave(ord[i - 1]) && ord[i].inicio < ord[i - 1].fim && !ord[i].aCadaSemanas && !ord[i - 1].aCadaSemanas) {
      throw invalido('periodos', 'Há períodos sobrepostos no mesmo dia.');
    }
  }
  return out;
}

function exigirUsuario(req) {
  if (!req.auth || req.auth.principal_type !== 'user' || !req.auth.actor_id) {
    throw createAppError('USER_PRINCIPAL_REQUIRED', 'Mudar escala exige login de uma pessoa.', 403);
  }
}

// Agendamentos futuros que cabiam antes e deixam de caber depois da mudança.
async function afetados(repo, { antes, depois, profissionalIds, de, ate }) {
  const [agendamentos, profissionais, clientes] = await Promise.all([
    repo.list('agendamentos', { empresa_id: repo.empresaId }),
    repo.list('profissionais', { empresa_id: repo.empresaId }),
    repo.list('clientes', { empresa_id: repo.empresaId })
  ]);
  const prof = new Map(profissionais.map(p => [p.id, p]));
  const nomeCliente = new Map(clientes.map(c => [c.id, c.nome]));
  const desde = de && de > hoje() ? de : hoje();
  return agendamentos
    .filter(a => !INACTIVE_STATUSES.includes(a.status) && a.data >= desde && (!ate || a.data <= ate))
    .filter(a => !profissionalIds || profissionalIds.includes(a.profissional_id))
    .filter(a => {
      const p = prof.get(a.profissional_id);
      if (!p) return false;
      const ini = timeToMinutes(hhmm(a.horario));
      const dur = Number(a.duracao_min) || 30;
      const cabiaAntes = cabe(disponibilidadeDoDia({ data: a.data, ...antes, profissional: p }).periodos, ini, dur);
      const cabeDepois = cabe(disponibilidadeDoDia({ data: a.data, ...depois, profissional: depois.publicar && p.id === depois.publicar ? { ...p, escala_publicada_em: 'agora' } : p }).periodos, ini, dur);
      return cabiaAntes && !cabeDepois;
    })
    .sort((x, y) => `${x.data}${x.horario}`.localeCompare(`${y.data}${y.horario}`))
    .map(a => ({ agendamentoId: a.id, data: a.data, horario: hhmm(a.horario), profissional: (prof.get(a.profissional_id) || {}).nome || null, cliente: nomeCliente.get(a.cliente_id) || null, status: a.status }));
}

// Sem decisão para cada agendamento afetado, nada é gravado (409 com a lista).
function decisoesPara(req, lista, decisoes) {
  if (!lista.length) return [];
  const dadas = Array.isArray(decisoes) ? decisoes : [];
  const porId = new Map(dadas.filter(d => d && typeof d === 'object').map(d => [d.agendamentoId, d.decisao]));
  const faltam = lista.filter(a => porId.get(a.agendamentoId) !== 'manter');
  if (faltam.length) {
    throw createAppError('CONFLITOS_PENDENTES', `${faltam.length} agendamento(s) ficariam fora da disponibilidade. Remarque ou cancele antes, ou confirme que ficam mantidos.`, 409, { afetados: lista });
  }
  if (!pode(req.auth, 'escala:conflitos')) {
    throw createAppError('INSUFFICIENT_ROLE', 'Há agendamentos afetados: peça a quem resolve conflitos de escala.', 403, { action: 'escala:conflitos', afetados: lista });
  }
  return lista.map(a => ({ agendamentoId: a.agendamentoId, data: a.data, horario: a.horario, decisao: 'manter' }));
}

const publicoSemanal = r => ({ diaSemana: r.dia_semana, inicio: hhmm(r.inicio), fim: hhmm(r.fim), aCadaSemanas: r.a_cada_semanas || 1, semanaAncora: r.semana_ancora || null });
const publicoExcecao = e => ({ id: e.id, profissionalId: e.profissional_id || null, tipo: e.tipo, dataInicio: String(e.data_inicio).slice(0, 10), dataFim: String(e.data_fim).slice(0, 10), inicio: e.inicio ? hhmm(e.inicio) : null, fim: e.fim ? hhmm(e.fim) : null, motivo: e.motivo || null });

async function carregar(repo) {
  const disp = await repo.carregarDisponibilidade();
  if (!disp) throw createAppError('NOT_AVAILABLE', 'Escalas ainda não disponíveis neste banco (migration 013).', 503);
  return disp;
}

// ---------- Leitura ----------
router.get('/disponibilidade', authorize('escala:ver'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const de = req.query.de ? dataValida(req.query.de, 'de') : hoje();
    const [disp, profissionais] = await Promise.all([carregar(repo), repo.list('profissionais', { empresa_id: repo.empresaId })]);
    const visiveis = profissionais.filter(p => p.ativo !== false && (!req.authz.own || p.id === req.authz.profissionalId));
    const ids = new Set(visiveis.map(p => p.id));
    res.json({
      ok: true,
      data: {
        unidade: { semanal: disp.semanal.filter(r => !r.profissional_id).map(publicoSemanal) },
        excecoes: disp.excecoes.filter(e => String(e.data_fim).slice(0, 10) >= de && (!e.profissional_id || ids.has(e.profissional_id))).map(publicoExcecao)
          .sort((a, b) => a.dataInicio.localeCompare(b.dataInicio)),
        profissionais: visiveis.map(p => ({
          id: p.id, nome: p.nome, escalaPublicada: Boolean(p.escala_publicada_em),
          semanal: disp.semanal.filter(r => r.profissional_id === p.id).map(publicoSemanal)
        })).sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
      }
    });
  } catch (err) { next(err); }
});

// Disponibilidade efetiva e a origem da regra (para "por que não há horário?").
router.get('/disponibilidade/dia', authorize('escala:ver'), async (req, res, next) => {
  try {
    const data = dataValida(req.query.data, 'data');
    const profissionalId = String(req.query.profissionalId || '');
    if (!UUID.test(profissionalId)) throw invalido('profissionalId', 'profissionalId inválido.');
    assertOwn(req, profissionalId);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const [disp, [p]] = await Promise.all([carregar(repo), repo.list('profissionais', { empresa_id: repo.empresaId, id: profissionalId })]);
    if (!p) throw createAppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.', 404);
    const d = disponibilidadeDoDia({ data, ...disp, profissional: p });
    res.json({ ok: true, data: { data, profissionalId, codigo: d.codigo, origem: d.origem, periodos: d.periodos.map(x => ({ inicio: `${String(Math.floor(x.start / 60)).padStart(2, '0')}:${String(x.start % 60).padStart(2, '0')}`, fim: `${String(Math.floor(x.end / 60)).padStart(2, '0')}:${String(x.end % 60).padStart(2, '0')}` })) } });
  } catch (err) { next(err); }
});

// ---------- Escala semanal ----------
router.put('/disponibilidade/unidade/semanal', authorize('unidade:horario'), async (req, res, next) => {
  try {
    exigirUsuario(req);
    const b = corpo(req, ['periodos', 'decisoes']);
    const periodos = periodosValidos(b.periodos, { comDia: true });
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const disp = await carregar(repo);
    const depois = { semanal: [...disp.semanal.filter(r => r.profissional_id), ...periodos.map(x => ({ profissional_id: null, dia_semana: x.diaSemana, inicio: x.inicio, fim: x.fim, a_cada_semanas: x.aCadaSemanas || 1, semana_ancora: x.semanaAncora || null }))], excecoes: disp.excecoes };
    const decisoes = decisoesPara(req, await afetados(repo, { antes: disp, depois }), b.decisoes);
    const r = await repo.definirDisponibilidadeSemanal({ profissionalId: null, periodos, actorId: req.auth.actor_id, decisoes });
    res.json({ ok: true, data: { ...r, decisoes } });
  } catch (err) { next(err); }
});

router.put('/disponibilidade/profissionais/:id/semanal', authorize('escala:editar'), async (req, res, next) => {
  try {
    exigirUsuario(req);
    const id = String(req.params.id || '');
    if (!UUID.test(id)) throw invalido('id', 'id inválido.');
    const b = corpo(req, ['periodos', 'publicar', 'decisoes']);
    const periodos = periodosValidos(b.periodos, { comDia: true });
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const [disp, [p]] = await Promise.all([carregar(repo), repo.list('profissionais', { empresa_id: repo.empresaId, id })]);
    if (!p) throw createAppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.', 404);
    const publicar = b.publicar !== false;
    const depois = {
      semanal: [...disp.semanal.filter(r => r.profissional_id !== id), ...periodos.map(x => ({ profissional_id: id, dia_semana: x.diaSemana, inicio: x.inicio, fim: x.fim, a_cada_semanas: x.aCadaSemanas || 1, semana_ancora: x.semanaAncora || null }))],
      excecoes: disp.excecoes,
      publicar: publicar ? id : null
    };
    const decisoes = decisoesPara(req, await afetados(repo, { antes: disp, depois, profissionalIds: [id] }), b.decisoes);
    const r = await repo.definirDisponibilidadeSemanal({ profissionalId: id, periodos, publicar, actorId: req.auth.actor_id, decisoes });
    res.json({ ok: true, data: { ...r, publicada: publicar || Boolean(p.escala_publicada_em), decisoes } });
  } catch (err) { next(err); }
});

// ---------- Exceções por data ----------
// Permissão pelo alvo e pelo tipo: unidade → unidade:horario; horário excepcional do
// profissional → escala:editar; ausência e bloqueio → escala:bloquear (o profissional, só o seu).
// profissionalId que não seja texto (lista, número, objeto) cai na permissão mais forte e é
// recusado no handler: a escolha da permissão e o alvo gravado nunca divergem (Red Team D-033).
const permissaoDaExcecao = x => {
  const id = x && x.profissionalId;
  if (id !== undefined && id !== null && typeof id !== 'string') return 'unidade:horario';
  return !id ? 'unidade:horario' : x.tipo === 'horario' ? 'escala:editar' : 'escala:bloquear';
};

router.post('/disponibilidade/excecoes', authorizePor(req => permissaoDaExcecao(req.body), 'unidade:horario|escala:editar|escala:bloquear'), async (req, res, next) => {
  try {
    exigirUsuario(req);
    const b = corpo(req, ['profissionalId', 'tipo', 'dataInicio', 'dataFim', 'periodos', 'motivo', 'decisoes']);
    if (b.profissionalId !== undefined && b.profissionalId !== null && typeof b.profissionalId !== 'string') throw invalido('profissionalId', 'profissionalId deve ser texto.');
    const profissionalId = b.profissionalId || null;
    if (profissionalId && !UUID.test(profissionalId)) throw invalido('profissionalId', 'profissionalId inválido.');
    const tipos = profissionalId ? ['horario', 'ausencia', 'bloqueio'] : ['horario', 'fechamento'];
    if (!tipos.includes(b.tipo)) throw invalido('tipo', `tipo deve ser ${tipos.join(', ')}.`);
    const dataInicio = dataValida(b.dataInicio, 'dataInicio');
    const dataFim = dataValida(b.dataFim || b.dataInicio, 'dataFim');
    if (dataFim < dataInicio) throw invalido('dataFim', 'dataFim antes de dataInicio.');
    if ((Date.parse(dataFim) - Date.parse(dataInicio)) / 864e5 > 366) throw invalido('dataFim', 'Intervalo de no máximo 1 ano.');
    const motivo = b.motivo === undefined || b.motivo === null ? null : String(b.motivo).trim().slice(0, 200) || null;
    const periodos = b.periodos === undefined ? [] : periodosValidos(b.periodos, { comDia: false });
    if (['horario', 'bloqueio'].includes(b.tipo) && !periodos.length) throw invalido('periodos', 'Informe ao menos um período.');
    if (b.tipo === 'ausencia' && periodos.length) throw invalido('periodos', 'Ausência é o dia inteiro; para parte do dia, use bloqueio.');
    if (profissionalId) assertOwn(req, profissionalId);

    const repo = new SupabaseRepository(req.auth.empresa_id);
    const disp = await carregar(repo);
    if (profissionalId) {
      const [p] = await repo.list('profissionais', { empresa_id: repo.empresaId, id: profissionalId });
      if (!p) throw createAppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.', 404);
    }
    const base = { profissionalId, tipo: b.tipo, dataInicio, dataFim, motivo };
    const excecoes = periodos.length ? periodos.map(x => ({ ...base, inicio: x.inicio, fim: x.fim })) : [{ ...base }];
    const depois = { semanal: disp.semanal, excecoes: [...disp.excecoes, ...excecoes.map(x => ({ profissional_id: x.profissionalId, tipo: x.tipo, data_inicio: x.dataInicio, data_fim: x.dataFim, inicio: x.inicio || null, fim: x.fim || null, motivo }))] };
    const decisoes = decisoesPara(req, await afetados(repo, { antes: disp, depois, profissionalIds: profissionalId ? [profissionalId] : null, de: dataInicio, ate: dataFim }), b.decisoes);
    const r = await repo.criarExcecoesDisponibilidade({ excecoes, actorId: req.auth.actor_id, decisoes });
    res.status(201).json({ ok: true, data: { ids: r.ids, decisoes } });
  } catch (err) { next(err); }
});

// A permissão para remover é a mesma de criar: decidida pela exceção gravada.
router.delete('/disponibilidade/excecoes/:id', authorize('escala:ver'), async (req, res, next) => {
  try {
    exigirUsuario(req);
    const id = String(req.params.id || '');
    if (!UUID.test(id)) throw invalido('id', 'id inválido.');
    const b = corpo(req, ['decisoes']);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const disp = await carregar(repo);
    const exc = disp.excecoes.find(e => e.id === id);
    if (!exc) throw createAppError('NOT_FOUND', 'Exceção não encontrada.', 404);
    const { authorizeAuth } = require('../auth/rbac');
    req.authz = authorizeAuth(req.auth, permissaoDaExcecao({ profissionalId: exc.profissional_id, tipo: exc.tipo }));
    if (exc.profissional_id) assertOwn(req, exc.profissional_id);
    const depois = { semanal: disp.semanal, excecoes: disp.excecoes.filter(e => e.id !== id) };
    const decisoes = decisoesPara(req, await afetados(repo, { antes: disp, depois, profissionalIds: exc.profissional_id ? [exc.profissional_id] : null, de: String(exc.data_inicio).slice(0, 10), ate: String(exc.data_fim).slice(0, 10) }), b.decisoes);
    await repo.removerExcecaoDisponibilidade({ id, actorId: req.auth.actor_id, decisoes });
    res.json({ ok: true, data: { removida: id, decisoes } });
  } catch (err) { next(err); }
});

module.exports = { disponibilidadeRouter: router };

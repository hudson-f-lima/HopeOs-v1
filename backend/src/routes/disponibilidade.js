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
const { createHash } = require('crypto');
const { getIdentityStore } = require('../auth/identityStore');

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
      const publicados = [].concat(depois.publicar || []);
      const cabeDepois = cabe(disponibilidadeDoDia({ data: a.data, semanal: depois.semanal, excecoes: depois.excecoes, profissional: publicados.includes(p.id) ? { ...p, escala_publicada_em: 'agora' } : p }).periodos, ini, dur);
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
// D-046: bloqueio ou ausência que o próprio profissional marcou é dele. Só ele remove; gestão e
// recepção veem, mas não mexem (prova de autonomia sobre o próprio tempo, Lei 13.352/2016). O
// autor é o created_by gravado pelo banco (nunca vem da tela), comparado ao profissional do login.
const TIPOS_DO_PROFISSIONAL = ['bloqueio', 'ausencia'];
async function autoresProfissionais(empresaId) {
  const ms = await getIdentityStore().listMembershipsByEmpresa(empresaId);
  return new Map((ms || []).filter(m => m.profissional_id).map(m => [m.user_id, m.profissional_id]));
}
const marcadoPeloProfissional = (e, autores) => Boolean(e.profissional_id && TIPOS_DO_PROFISSIONAL.includes(e.tipo)
  && e.created_by && autores.get(e.created_by) === e.profissional_id);

const publicoExcecao = (e, autores = new Map()) => ({ id: e.id, profissionalId: e.profissional_id || null, tipo: e.tipo, dataInicio: String(e.data_inicio).slice(0, 10), dataFim: String(e.data_fim).slice(0, 10), inicio: e.inicio ? hhmm(e.inicio) : null, fim: e.fim ? hhmm(e.fim) : null, motivo: e.motivo || null, marcadoPeloProfissional: marcadoPeloProfissional(e, autores) });

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
    const [disp, profissionais, autores] = await Promise.all([carregar(repo), repo.list('profissionais', { empresa_id: repo.empresaId }), autoresProfissionais(repo.empresaId)]);
    const visiveis = profissionais.filter(p => p.ativo !== false && (!req.authz.own || p.id === req.authz.profissionalId));
    const ids = new Set(visiveis.map(p => p.id));
    res.json({
      ok: true,
      data: {
        unidade: { semanal: disp.semanal.filter(r => !r.profissional_id).map(publicoSemanal) },
        excecoes: disp.excecoes.filter(e => String(e.data_fim).slice(0, 10) >= de && (!e.profissional_id || ids.has(e.profissional_id))).map(e => publicoExcecao(e, autores))
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
    if (marcadoPeloProfissional(exc, await autoresProfissionais(repo.empresaId)) && req.auth.profissional_id !== exc.profissional_id) {
      throw createAppError('BLOQUEIO_DO_PROFISSIONAL', 'Este bloqueio foi marcado pelo próprio profissional: só ele pode remover.', 403);
    }
    const depois = { semanal: disp.semanal, excecoes: disp.excecoes.filter(e => e.id !== id) };
    const decisoes = decisoesPara(req, await afetados(repo, { antes: disp, depois, profissionalIds: exc.profissional_id ? [exc.profissional_id] : null, de: String(exc.data_inicio).slice(0, 10), ate: String(exc.data_fim).slice(0, 10) }), b.decisoes);
    await repo.removerExcecaoDisponibilidade({ id, actorId: req.auth.actor_id, decisoes });
    res.json({ ok: true, data: { removida: id, decisoes } });
  } catch (err) { next(err); }
});

// ---------- Histórico de bloqueios (D-046) ----------
// Lido da trilha imutável (disponibilidade_eventos): cada bloqueio ou ausência marcado e removido,
// quando (hora do servidor), por quem e se foi o próprio profissional. O profissional vê só o seu.
// Vem também em CSV com o SHA-256 do arquivo, para guardar uma cópia conferível.
const CSV_COLUNAS = ['evento', 'quando', 'acao', 'profissional', 'tipo', 'data_inicio', 'data_fim', 'inicio', 'fim', 'motivo', 'feito_por', 'origem'];
const celulaCsv = v => {
  let t = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; // fórmula em planilha
  return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
router.get('/disponibilidade/bloqueios/historico', authorize('escala:ver'), async (req, res, next) => {
  try {
    exigirUsuario(req);
    let alvo = req.query.profissionalId ? String(req.query.profissionalId) : null;
    if (alvo && !UUID.test(alvo)) throw invalido('profissionalId', 'profissionalId inválido.');
    if (req.authz.own) alvo = req.authz.profissionalId;
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const [eventos, profissionais, autores] = await Promise.all([
      repo.list('disponibilidade_eventos', { empresa_id: repo.empresaId }),
      repo.list('profissionais', { empresa_id: repo.empresaId }),
      autoresProfissionais(repo.empresaId)
    ]);
    const nomeProf = id => (profissionais.find(p => p.id === id) || {}).nome || 'Profissional';
    const store = getIdentityStore();
    const nomes = new Map();
    const nomeUsuario = async id => {
      if (!nomes.has(id)) { const u = await store.getAppUser(id).catch(() => null); nomes.set(id, (u && (u.nome || u.email)) || 'Usuário'); }
      return nomes.get(id);
    };
    const itens = [];
    for (const ev of eventos) {
      if (!['excecao_criar', 'excecao_remover'].includes(ev.acao)) continue;
      const linhas = ev.acao === 'excecao_criar' ? ev.depois : ev.antes;
      for (const r of Array.isArray(linhas) ? linhas : []) {
        if (!r || !r.profissional_id || !TIPOS_DO_PROFISSIONAL.includes(r.tipo)) continue;
        if (alvo && r.profissional_id !== alvo) continue;
        itens.push({
          eventoId: ev.id, quando: new Date(ev.created_at).toISOString(), acao: ev.acao === 'excecao_criar' ? 'marcou' : 'removeu',
          profissionalId: r.profissional_id, profissional: nomeProf(r.profissional_id), tipo: r.tipo,
          dataInicio: String(r.data_inicio).slice(0, 10), dataFim: String(r.data_fim).slice(0, 10),
          inicio: r.inicio ? hhmm(r.inicio) : null, fim: r.fim ? hhmm(r.fim) : null, motivo: r.motivo || null,
          feitoPor: await nomeUsuario(ev.actor_id), origem: autores.get(ev.actor_id) === r.profissional_id ? 'profissional' : 'equipe'
        });
      }
    }
    itens.sort((a, b) => b.quando.localeCompare(a.quando) || a.eventoId.localeCompare(b.eventoId));
    const csv = [CSV_COLUNAS.join(','), ...itens.map(i => [i.eventoId, i.quando, i.acao, i.profissional, i.tipo, i.dataInicio, i.dataFim, i.inicio, i.fim, i.motivo, i.feitoPor, i.origem].map(celulaCsv).join(','))].join('\r\n') + '\r\n';
    const sha256 = createHash('sha256').update(csv, 'utf8').digest('hex');
    res.json({ ok: true, data: { itens, csv, sha256, geradoEm: clock.agora().toISOString() } });
  } catch (err) { next(err); }
});

// ---------- Modelos de escala (D-035, migration 015) ----------
// Períodos por dia da semana, reutilizáveis. Aplicar copia; mudar o modelo não muda o aplicado.
const publicoModelo = m => ({ id: m.id, nome: m.nome, periodos: Array.isArray(m.conteudo) ? m.conteudo : [], arquivado: Boolean(m.arquivado_em) });
const nomeValido = v => {
  const n = String(v === undefined || v === null ? '' : v).trim();
  if (!n || n.length > 80) throw invalido('nome', 'Nome do modelo: de 1 a 80 caracteres.');
  return n;
};
async function nomeLivre(repo, nome, ignorarId = null) {
  const modelos = await repo.list('escala_modelos', { empresa_id: repo.empresaId });
  if (modelos.some(m => !m.arquivado_em && m.id !== ignorarId && m.nome.trim().toLowerCase() === nome.toLowerCase())) {
    throw createAppError('MODEL_NAME_EXISTS', 'Já existe um modelo ativo com esse nome.', 409);
  }
}
async function modeloDaEmpresa(repo, id) {
  if (!UUID.test(String(id || ''))) throw invalido('id', 'id inválido.');
  const [m] = await repo.list('escala_modelos', { empresa_id: repo.empresaId, id });
  if (!m) throw createAppError('NOT_FOUND', 'Modelo não encontrado.', 404);
  return m;
}
const gravarModelo = async (repo, fn) => {
  try { return await fn(); } catch (err) {
    if (err && err.code === '23505') throw createAppError('MODEL_NAME_EXISTS', 'Já existe um modelo ativo com esse nome.', 409);
    if (['42P01', 'PGRST205'].includes(err && err.code)) throw createAppError('NOT_AVAILABLE', 'Modelos ainda não disponíveis neste banco (migration 015).', 503);
    throw err;
  }
};

router.get('/disponibilidade/modelos', authorize('escala:modelos'), async (req, res, next) => {
  try {
    exigirUsuario(req);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const modelos = await gravarModelo(repo, () => repo.list('escala_modelos', { empresa_id: repo.empresaId }));
    const todos = req.query.arquivados === '1';
    res.json({ ok: true, data: modelos.filter(m => todos || !m.arquivado_em).map(publicoModelo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) });
  } catch (err) { next(err); }
});

router.post('/disponibilidade/modelos', authorize('escala:modelos'), async (req, res, next) => {
  try {
    exigirUsuario(req);
    const b = corpo(req, ['nome', 'periodos']);
    const nome = nomeValido(b.nome);
    const periodos = periodosValidos(b.periodos || [], { comDia: true });
    const repo = new SupabaseRepository(req.auth.empresa_id);
    await nomeLivre(repo, nome);
    const m = await gravarModelo(repo, () => repo.insertScoped('escala_modelos', { nome, conteudo: periodos, created_by: req.auth.actor_id, updated_by: req.auth.actor_id }));
    res.status(201).json({ ok: true, data: publicoModelo(m) });
  } catch (err) { next(err); }
});

router.patch('/disponibilidade/modelos/:id', authorize('escala:modelos'), async (req, res, next) => {
  try {
    exigirUsuario(req);
    const b = corpo(req, ['nome', 'periodos', 'arquivado']);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const atual = await modeloDaEmpresa(repo, req.params.id);
    const patch = { updated_at: new Date().toISOString(), updated_by: req.auth.actor_id };
    if (b.nome !== undefined) patch.nome = nomeValido(b.nome);
    if (b.periodos !== undefined) patch.conteudo = periodosValidos(b.periodos, { comDia: true });
    if (b.arquivado !== undefined) {
      if (typeof b.arquivado !== 'boolean') throw invalido('arquivado', 'arquivado deve ser verdadeiro ou falso.');
      patch.arquivado_em = b.arquivado ? (atual.arquivado_em || new Date().toISOString()) : null;
    }
    const ficaAtivo = patch.arquivado_em === undefined ? !atual.arquivado_em : !patch.arquivado_em;
    if (ficaAtivo) await nomeLivre(repo, patch.nome || atual.nome, atual.id);
    const m = await gravarModelo(repo, () => repo.updateScoped('escala_modelos', atual.id, patch));
    res.json({ ok: true, data: publicoModelo(m) });
  } catch (err) { next(err); }
});

router.post('/disponibilidade/modelos/:id/duplicar', authorize('escala:modelos'), async (req, res, next) => {
  try {
    exigirUsuario(req);
    const b = corpo(req, ['nome']);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const origem = await modeloDaEmpresa(repo, req.params.id);
    const nome = nomeValido(b.nome || `${origem.nome} (cópia)`.slice(0, 80));
    await nomeLivre(repo, nome);
    const m = await gravarModelo(repo, () => repo.insertScoped('escala_modelos', { nome, conteudo: origem.conteudo || [], created_by: req.auth.actor_id, updated_by: req.auth.actor_id }));
    res.status(201).json({ ok: true, data: publicoModelo(m) });
  } catch (err) { next(err); }
});

// ---------- Alteração em lote (D-035) ----------
// Alvos: a unidade e/ou profissionais. O que fazer: semana padrão igual para todos, data especial
// (horário, ausência, bloqueio, fechamento) ou um modelo (como semana padrão ou num período).
// simular: true devolve a prévia (quem, o quê, agendamentos afetados, itens inválidos) sem gravar.
const LOTE_TIPOS_PROF = ['semanal', 'horario', 'ausencia', 'bloqueio'];
const LOTE_TIPOS_UNIDADE = ['semanal', 'horario', 'fechamento'];
const ROTULO_LOTE = { semanal: 'Semana padrão', horario: 'Horário excepcional', ausencia: 'Ausência', bloqueio: 'Bloqueio', fechamento: 'Fechamento' };
const datasEntre = (de, ate) => { const out = []; for (let d = de; d <= ate && out.length < 400; ) { out.push(d); const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); d = x.toISOString().slice(0, 10); } return out; };

router.post('/disponibilidade/lote', authorize('escala:lote'), async (req, res, next) => {
  try {
    exigirUsuario(req);
    const b = corpo(req, ['incluirUnidade', 'profissionalIds', 'operacao', 'simular', 'decisoes']);
    const ids = b.profissionalIds === undefined ? [] : b.profissionalIds;
    if (!Array.isArray(ids) || ids.length > 100 || ids.some(x => typeof x !== 'string' || !UUID.test(x))) throw invalido('profissionalIds', 'profissionalIds deve ser uma lista de ids (até 100).');
    const incluirUnidade = b.incluirUnidade === true;
    if (!incluirUnidade && !ids.length) throw invalido('profissionalIds', 'Escolha a unidade ou ao menos um profissional.');
    const op = b.operacao && typeof b.operacao === 'object' && !Array.isArray(b.operacao) ? b.operacao : null;
    if (!op) throw invalido('operacao', 'operacao obrigatória.');

    const repo = new SupabaseRepository(req.auth.empresa_id);
    const [disp, profissionais] = await Promise.all([carregar(repo), repo.list('profissionais', { empresa_id: repo.empresaId })]);
    const profPorId = new Map(profissionais.map(p => [p.id, p]));
    const invalidos = [];
    const alvosProf = [...new Set(ids)].filter(id => {
      const p = profPorId.get(id);
      if (!p || p.ativo === false) { invalidos.push({ alvo: id, motivo: 'Profissional não encontrado ou inativo nesta empresa' }); return false; }
      return true;
    });

    // O que fazer: tipo explícito ou modelo.
    let tipo; let periodos = []; let dataInicio = null; let dataFim = null; let porData = null; let descricao;
    const motivo = op.motivo === undefined || op.motivo === null ? null : String(op.motivo).trim().slice(0, 200) || null;
    if (op.modeloId !== undefined) {
      const m = await gravarModelo(repo, () => modeloDaEmpresa(repo, op.modeloId));
      if (m.arquivado_em) throw invalido('modeloId', 'Modelo arquivado: reative antes de aplicar.');
      const conteudo = periodosValidos(m.conteudo || [], { comDia: true });
      if (op.modo === 'semanal') { tipo = 'semanal'; periodos = conteudo; descricao = `Modelo "${m.nome}" como semana padrão`; }
      else if (op.modo === 'periodo') {
        tipo = 'horario';
        dataInicio = dataValida(op.dataInicio, 'dataInicio'); dataFim = dataValida(op.dataFim || op.dataInicio, 'dataFim');
        if (dataFim < dataInicio || datasEntre(dataInicio, dataFim).length > 62) throw invalido('dataFim', 'Período de 1 a 62 dias.');
        porData = datasEntre(dataInicio, dataFim).map(d => ({ data: d, periodos: conteudo.filter(x => x.diaSemana === new Date(`${d}T12:00:00Z`).getUTCDay()) })).filter(x => x.periodos.length);
        if (!porData.length) throw invalido('modeloId', 'O modelo não tem horário em nenhum dia desse período.');
        descricao = `Modelo "${m.nome}" de ${dataInicio} a ${dataFim}`;
      } else throw invalido('modo', 'modo deve ser semanal ou periodo.');
    } else {
      tipo = op.tipo;
      if (![...LOTE_TIPOS_PROF, ...LOTE_TIPOS_UNIDADE].includes(tipo)) throw invalido('tipo', 'tipo deve ser semanal, horario, ausencia, bloqueio ou fechamento.');
      if (tipo === 'semanal') periodos = periodosValidos(op.periodos || [], { comDia: true });
      else {
        dataInicio = dataValida(op.dataInicio, 'dataInicio'); dataFim = dataValida(op.dataFim || op.dataInicio, 'dataFim');
        if (dataFim < dataInicio || datasEntre(dataInicio, dataFim).length > 366) throw invalido('dataFim', 'Período de no máximo 1 ano.');
        periodos = op.periodos === undefined ? [] : periodosValidos(op.periodos, { comDia: false });
        if (['horario', 'bloqueio'].includes(tipo) && !periodos.length) throw invalido('periodos', 'Informe ao menos um período.');
        if (tipo === 'ausencia' && periodos.length) throw invalido('periodos', 'Ausência é o dia inteiro.');
      }
      descricao = `${ROTULO_LOTE[tipo]}${dataInicio ? ` de ${dataInicio} a ${dataFim}` : ''}${periodos.length ? ` (${periodos.map(x => `${x.diaSemana !== undefined ? ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][x.diaSemana] + ' ' : ''}${x.inicio}–${x.fim}`).join(', ')})` : ''}`;
    }
    if (incluirUnidade && !LOTE_TIPOS_UNIDADE.includes(tipo)) invalidos.push({ alvo: 'Unidade', motivo: `${ROTULO_LOTE[tipo]} não se aplica à unidade` });
    if (tipo === 'fechamento' && alvosProf.length) invalidos.push({ alvo: 'Profissionais', motivo: 'Fechamento vale só para a unidade; para profissional use ausência' });
    const unidade = incluirUnidade && LOTE_TIPOS_UNIDADE.includes(tipo);
    const profsValidos = tipo === 'fechamento' ? [] : alvosProf;

    // Monta as operações e o "depois" para a prévia e os conflitos.
    const semanais = []; const excecoes = [];
    const alvos = [...(unidade ? [null] : []), ...profsValidos];
    for (const alvo of alvos) {
      if (tipo === 'semanal') semanais.push({ profissionalId: alvo, periodos, publicar: Boolean(alvo) });
      else if (porData) porData.forEach(d => d.periodos.forEach(x => excecoes.push({ profissionalId: alvo, tipo: 'horario', dataInicio: d.data, dataFim: d.data, inicio: x.inicio, fim: x.fim, motivo })));
      else if (periodos.length) periodos.forEach(x => excecoes.push({ profissionalId: alvo, tipo, dataInicio, dataFim, inicio: x.inicio, fim: x.fim, motivo }));
      else excecoes.push({ profissionalId: alvo, tipo, dataInicio, dataFim, motivo });
    }
    const trocados = new Set(semanais.map(x => x.profissionalId || 'unidade'));
    const depois = {
      semanal: [
        ...disp.semanal.filter(r => !trocados.has(r.profissional_id || 'unidade')),
        ...semanais.flatMap(s => s.periodos.map(x => ({ profissional_id: s.profissionalId, dia_semana: x.diaSemana, inicio: x.inicio, fim: x.fim, a_cada_semanas: x.aCadaSemanas || 1, semana_ancora: x.semanaAncora || null })))
      ],
      excecoes: [...disp.excecoes, ...excecoes.map(x => ({ profissional_id: x.profissionalId, tipo: x.tipo, data_inicio: x.dataInicio, data_fim: x.dataFim, inicio: x.inicio || null, fim: x.fim || null }))],
      publicar: semanais.filter(x => x.publicar).map(x => x.profissionalId)
    };
    const lista = await afetados(repo, { antes: disp, depois, profissionalIds: unidade ? null : profsValidos, de: dataInicio || undefined, ate: dataFim || undefined });
    const previa = {
      alteracao: descricao,
      alvos: alvos.map(a => ({ profissionalId: a, nome: a ? profPorId.get(a).nome : 'Unidade' })),
      operacoes: { semanais: semanais.length, excecoes: excecoes.length },
      afetados: lista,
      invalidos
    };
    if (b.simular === true) return res.json({ ok: true, data: { simulado: true, ...previa } });
    if (invalidos.length) throw createAppError('LOTE_INVALIDO', 'Há itens inválidos no lote; revise a seleção.', 422, { invalidos });
    if (!alvos.length) throw invalido('profissionalIds', 'Nada a aplicar.');
    const decisoes = decisoesPara(req, lista, b.decisoes);
    const r = await repo.aplicarLoteDisponibilidade({ semanais, excecoes, actorId: req.auth.actor_id, decisoes });
    res.json({ ok: true, data: { ...previa, aplicado: r, decisoes } });
  } catch (err) { next(err); }
});

module.exports = { disponibilidadeRouter: router };

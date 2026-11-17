// Assistente de configuração (Onda A, D-008) e dados da empresa.
// Sem migration: usa empresas/servicos/formas_pagamento/profissionais existentes.
const express = require('express');
const { createAppError } = require('../errors');
const { authorize, pode } = require('../auth/rbac');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { validateUpdateEmpresaPayload } = require('../validators/empresa.validator');
const { validateCreateServicoPayload, validateCreateFormaPagamentoPayload, validateCargoPayload } = require('../validators/cadastros.validator');
const { listarPresets } = require('../onboarding/presets');
const { calcularStatus } = require('../onboarding/status');
const { periodosDaUnidade } = require('../engines/disponibilidadeLegado');
const { agoraNoFuso } = require('../engines/SlotEngine');
const { env } = require('../config/env');
const clock = require('../config/clock');
const { disponibilidadeDoDia, cabe } = require('../engines/DisponibilidadeEngine');
const { timeToMinutes, INACTIVE_STATUSES } = require('../engines/ScheduleEngine');
const { limparCacheSlug, linksDaEnv } = require('./publicBooking');

const CAMPOS_HORARIO = ['horario_por_dia', 'intervalo_almoco', 'almoco_inicio', 'almoco_fim'];

// Desde a D-033 o horário da unidade vive em disponibilidade_semanal. O assistente continua
// editando o horário simples (um período por dia + almoço), que é convertido para a escala da
// unidade. Se a mudança deixar agendamentos de fora, nada é gravado: trata-se na tela de escalas.
// JSON com chaves ordenadas: compara o horário enviado com o atual sem depender da ordem.
const canonico = v => Array.isArray(v) ? `[${v.map(canonico).join(',')}]`
  : (v && typeof v === 'object') ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonico(v[k])}`).join(',')}}`
  : JSON.stringify(v ?? null);

async function sincronizarHorarioDaUnidade(req, repo, atual, patch) {
  // Só quando o horário mudou de fato: salvar o passo sem mexer no horário (ex.: só o slot)
  // não apaga a escala da unidade feita em Conta → Escalas (Red Team D-033).
  const mudou = CAMPOS_HORARIO.some(c => patch[c] !== undefined && canonico(patch[c]) !== canonico(atual[c]));
  if (!mudou) return null;
  const disp = await repo.carregarDisponibilidade();
  if (!disp) return null;
  if (!req.auth.actor_id) throw createAppError('USER_PRINCIPAL_REQUIRED', 'Mudar o horário exige login de uma pessoa.', 403);
  if (!pode(req.auth, 'unidade:horario')) throw createAppError('INSUFFICIENT_ROLE', 'Mudar o horário da unidade exige a permissão de horários.', 403, { action: 'unidade:horario' });
  const periodos = periodosDaUnidade({ ...atual, ...patch });
  const depois = { semanal: [...disp.semanal.filter(r => r.profissional_id), ...periodos.map(x => ({ profissional_id: null, dia_semana: x.diaSemana, inicio: x.inicio, fim: x.fim }))], excecoes: disp.excecoes };
  const [agendamentos, profissionais] = await Promise.all([repo.list('agendamentos', { empresa_id: repo.empresaId }), repo.list('profissionais', { empresa_id: repo.empresaId })]);
  const prof = new Map(profissionais.map(p => [p.id, p]));
  const hojeStr = agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
  const fora = agendamentos.filter(a => !INACTIVE_STATUSES.includes(a.status) && a.data >= hojeStr && prof.has(a.profissional_id)).filter(a => {
    const ini = timeToMinutes(String(a.horario).slice(0, 5));
    const dur = Number(a.duracao_min) || 30;
    const p = prof.get(a.profissional_id);
    return cabe(disponibilidadeDoDia({ data: a.data, ...disp, profissional: p }).periodos, ini, dur)
      && !cabe(disponibilidadeDoDia({ data: a.data, ...depois, profissional: p }).periodos, ini, dur);
  });
  if (fora.length) {
    throw createAppError('CONFLITOS_PENDENTES', `${fora.length} agendamento(s) ficariam fora do novo horário. Ajuste em Conta → Horários e escalas, que mostra e trata cada um.`, 409, { afetados: fora.map(a => ({ agendamentoId: a.id, data: a.data, horario: String(a.horario).slice(0, 5) })) });
  }
  return { periodos };
}

const router = express.Router();
const MAX_ITENS = 50;

const CAMPOS_EMPRESA = ['id', 'nome', 'telefone', 'whatsapp', 'endereco', 'cidade', 'horario_por_dia', 'slot_padrao', 'intervalo_almoco', 'almoco_inicio', 'almoco_fim',
  'cnpj', 'razao_social', 'salao_parceiro', 'buffer_min', 'regua_alerta_faltas', 'regua_sinal_faltas', 'ranking_visivel_equipe', 'atendimento_espera_max_min',
  'agenda_janela_dias_recepcao', 'agenda_max_futuros_recepcao', 'agenda_intervalo_min_dias', 'agenda_atraso_alerta_min', 'online_cancelamento_prazo_min'];

async function carregarEmpresa(repo) {
  const empresa = (await repo.list('empresas', { id: repo.empresaId }))[0];
  if (!empresa) throw createAppError('EMPRESA_NOT_FOUND', 'Empresa não cadastrada no banco. Veja o passo 7 do runbook.', 404);
  return empresa;
}

function publica(empresa) {
  return Object.fromEntries(CAMPOS_EMPRESA.map(c => [c, empresa[c] ?? null]));
}

function itens(body) {
  const lista = body && body.itens;
  if (!Array.isArray(lista) || !lista.length) throw createAppError('ITEMS_REQUIRED', 'Informe itens[].', 422);
  if (lista.length > MAX_ITENS) throw createAppError('TOO_MANY_ITEMS', `No máximo ${MAX_ITENS} itens por vez.`, 422);
  return lista;
}

router.get('/empresa', authorize('cadastros:ver'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    res.json({ ok: true, data: publica(await carregarEmpresa(repo)) });
  } catch (err) { next(err); }
});

router.patch('/empresa', authorize('empresa:configurar'), async (req, res, next) => {
  try {
    const patch = validateUpdateEmpresaPayload(req.body);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const atual = await carregarEmpresa(repo);
    // Régua: a falta que pede sinal sempre depois da que gera alerta, mesmo em PATCH parcial.
    const alerta = patch.regua_alerta_faltas ?? atual.regua_alerta_faltas ?? 2;
    const sinal = patch.regua_sinal_faltas ?? atual.regua_sinal_faltas ?? 3;
    if (sinal <= alerta) throw createAppError('INVALID_FIELD', 'A falta que pede sinal deve vir depois da que gera alerta.', 422, { field: 'reguaSinalFaltas' });
    const sync = await sincronizarHorarioDaUnidade(req, repo, atual, patch);
    try {
      if (sync) await repo.definirDisponibilidadeSemanal({ profissionalId: null, periodos: sync.periodos, actorId: req.auth.actor_id, decisoes: [] });
      const atualizada = await repo.updateEmpresa(patch);
      res.json({ ok: true, data: publica(atualizada) });
    } catch (err) {
      if (err && err.code === '23514') throw createAppError('INVALID_FIELD', 'Valor fora do permitido para a empresa.', 422);
      throw err;
    }
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Agendamento online do salão (migration 016, D-037). O slug e o liga/desliga ficam na linha
// da empresa; ligar exige razão social e contato de privacidade (o aviso identifica quem trata
// os dados). O banco repete essas regras (constraints da 016); aqui só ganham mensagem clara.
const ONLINE_CAMPOS = {
  slug: 'online_slug', ativo: 'online_ativo', antecedenciaMin: 'online_antecedencia_min', janelaDias: 'online_janela_dias',
  cancelamentoPrazoMin: 'online_cancelamento_prazo_min', maxFuturos: 'online_max_futuros', mostrarPreco: 'online_mostrar_preco',
  privacidadeContato: 'privacidade_contato', lembretesPush: 'lembretes_push_ativo'
};
const ONLINE_FAIXAS = { antecedenciaMin: [0, 10080], janelaDias: [1, 180], cancelamentoPrazoMin: [0, 10080], maxFuturos: [1, 10] };
const SLUG_ONLINE_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
const invalidoOnline = (field, message) => createAppError('INVALID_FIELD', message, 422, { field });

function pendenciasOnline(e) {
  const p = [];
  if (!e.online_slug) p.push('slug');
  if (!String(e.razao_social || '').trim()) p.push('razaoSocial');
  if (!String(e.privacidade_contato || '').trim()) p.push('privacidadeContato');
  return p;
}
function configOnlinePublica(e) {
  const migrada = Object.prototype.hasOwnProperty.call(e, 'online_ativo');
  return {
    disponivel: migrada,
    slug: e.online_slug ?? null,
    ativo: e.online_ativo === true,
    antecedenciaMin: e.online_antecedencia_min ?? 120,
    janelaDias: e.online_janela_dias ?? 30,
    cancelamentoPrazoMin: e.online_cancelamento_prazo_min ?? 120,
    maxFuturos: e.online_max_futuros ?? 2,
    mostrarPreco: e.online_mostrar_preco !== false,
    lembretesPush: e.lembretes_push_ativo !== false,
    privacidadeContato: e.privacidade_contato ?? null,
    razaoSocial: e.razao_social ?? null,
    cnpj: e.cnpj ?? null,
    pendencias: pendenciasOnline(e)
  };
}
function validarConfigOnline(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw createAppError('INVALID_PAYLOAD', 'Envie um objeto.', 422);
  const extra = Object.keys(body).find(k => !Object.prototype.hasOwnProperty.call(ONLINE_CAMPOS, k));
  if (extra) throw createAppError('FORBIDDEN_FIELD', `Campo proibido no payload: ${extra}`, 422, { field: extra });
  const out = {};
  if (body.slug !== undefined) {
    const v = body.slug === null ? '' : String(body.slug).trim().toLowerCase();
    if (v && !SLUG_ONLINE_RE.test(v)) throw invalidoOnline('slug', 'Endereço do link: 3 a 60 letras minúsculas, números ou hífen, sem hífen nas pontas.');
    out.online_slug = v || null;
  }
  for (const campo of ['ativo', 'mostrarPreco', 'lembretesPush']) {
    if (body[campo] === undefined) continue;
    if (typeof body[campo] !== 'boolean') throw invalidoOnline(campo, `${campo} deve ser verdadeiro ou falso.`);
    out[ONLINE_CAMPOS[campo]] = body[campo];
  }
  for (const [campo, [min, max]] of Object.entries(ONLINE_FAIXAS)) {
    if (body[campo] === undefined) continue;
    const n = Number(body[campo]);
    if (!Number.isInteger(n) || n < min || n > max) throw invalidoOnline(campo, `${campo} deve ser um inteiro entre ${min} e ${max}.`);
    out[ONLINE_CAMPOS[campo]] = n;
  }
  if (body.privacidadeContato !== undefined) {
    const v = body.privacidadeContato === null ? '' : String(body.privacidadeContato).trim();
    if (v && (v.length < 3 || v.length > 200)) throw invalidoOnline('privacidadeContato', 'Contato de privacidade: 3 a 200 caracteres (e-mail ou WhatsApp).');
    out.privacidade_contato = v || null;
  }
  if (!Object.keys(out).length) throw createAppError('EMPTY_UPDATE', 'Nenhum campo válido para atualizar.', 422);
  return out;
}

router.get('/empresa/agendamento-online', authorize('empresa:configurar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    res.json({ ok: true, data: configOnlinePublica(await carregarEmpresa(repo)) });
  } catch (err) { next(err); }
});

router.patch('/empresa/agendamento-online', authorize('empresa:configurar'), async (req, res, next) => {
  try {
    const patch = validarConfigOnline(req.body);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const atual = await carregarEmpresa(repo);
    if (!Object.prototype.hasOwnProperty.call(atual, 'online_ativo')) {
      throw createAppError('MIGRATION_PENDENTE', 'O agendamento online por salão ainda não está disponível neste banco (migration 016).', 503);
    }
    const depois = { ...atual, ...patch };
    if (depois.online_ativo === true) {
      const faltam = pendenciasOnline(depois);
      if (faltam.length) {
        throw createAppError('REQUISITOS_PENDENTES', 'Para ligar o link, preencha o endereço do link, a razão social e o contato de privacidade.', 422, { faltam });
      }
    }
    // Um slug do mapa da env de outra empresa continuaria abrindo o outro salão: recusa.
    if (patch.online_slug) {
      const daEnv = linksDaEnv().get(patch.online_slug);
      if (daEnv && daEnv !== String(repo.empresaId).toLowerCase()) throw createAppError('SLUG_EM_USO', 'Esse endereço de link já está em uso. Escolha outro.', 409, { field: 'slug' });
    }
    let atualizada;
    try {
      atualizada = await repo.updateEmpresa({ ...patch, updated_at: new Date().toISOString() });
    } catch (err) {
      if (err && err.code === '23505') throw createAppError('SLUG_EM_USO', 'Esse endereço de link já está em uso. Escolha outro.', 409, { field: 'slug' });
      if (err && err.code === '23514') throw createAppError('INVALID_FIELD', 'Valor fora do permitido para o agendamento online.', 422);
      throw err;
    }
    limparCacheSlug();
    res.json({ ok: true, data: configOnlinePublica(atualizada) });
  } catch (err) { next(err); }
});

router.get('/onboarding/status', authorize('empresa:configurar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const filtro = { empresa_id: repo.empresaId };
    const [empresa, formas, servicos, profissionais, vinculos, disponibilidade] = await Promise.all([
      carregarEmpresa(repo),
      repo.list('formas_pagamento', filtro),
      repo.list('servicos', filtro),
      repo.list('profissionais', filtro),
      repo.list('profissional_servicos', filtro),
      repo.carregarDisponibilidade()
    ]);
    res.json({ ok: true, data: calcularStatus({ empresa, formas, servicos, profissionais, vinculos, disponibilidade }) });
  } catch (err) { next(err); }
});

router.get('/onboarding/presets', authorize('empresa:configurar'), (req, res) => {
  res.json({ ok: true, data: listarPresets() });
});

// Cria os serviços escolhidos; repetir o mesmo nome não duplica (idempotente).
router.post('/onboarding/servicos', authorize('empresa:configurar'), async (req, res, next) => {
  try {
    const payloads = itens(req.body).map(validateCreateServicoPayload);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const existentes = new Set((await repo.list('servicos', { empresa_id: repo.empresaId })).map(s => s.nome.trim().toLowerCase()));
    // Categoria pelo nome: cria a que faltar (sem comissão própria) e liga o serviço a ela.
    const categorias = new Map((await repo.list('servico_categorias', { empresa_id: repo.empresaId })).map(c => [c.nome.trim().toLowerCase(), c]));
    const criados = [];
    const ignorados = [];
    for (const p of payloads) {
      const chave = p.nome.trim().toLowerCase();
      if (existentes.has(chave)) { ignorados.push(p.nome); continue; }
      existentes.add(chave);
      if (!p.categoria_id && p.categoria && p.categoria !== 'Sem categoria') {
        const nomeCat = p.categoria.trim().toLowerCase();
        if (!categorias.has(nomeCat)) categorias.set(nomeCat, await repo.insertScoped('servico_categorias', { nome: p.categoria.trim(), comissao_pct: null }));
        p.categoria_id = categorias.get(nomeCat).id;
      }
      criados.push(await repo.insertScoped('servicos', p));
    }
    res.status(201).json({ ok: true, data: { criados, ignorados } });
  } catch (err) { next(err); }
});

// Cria as formas de pagamento escolhidas; código já existente é mantido como está.
router.post('/onboarding/formas', authorize('empresa:configurar'), async (req, res, next) => {
  try {
    const payloads = itens(req.body).map(validateCreateFormaPagamentoPayload);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const existentes = new Set((await repo.list('formas_pagamento', { empresa_id: repo.empresaId })).map(f => f.code));
    const criadas = [];
    const ignoradas = [];
    for (const p of payloads) {
      if (existentes.has(p.code)) { ignoradas.push(p.code); continue; }
      existentes.add(p.code);
      criadas.push(await repo.createFormaPagamento(p));
    }
    res.status(201).json({ ok: true, data: { criadas, ignoradas } });
  } catch (err) { next(err); }
});

// Cargos padrão; nome repetido (sem diferenciar maiúsculas) é ignorado.
router.post('/onboarding/cargos', authorize('empresa:configurar'), async (req, res, next) => {
  try {
    const payloads = itens(req.body).map(c => validateCargoPayload(c));
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const existentes = new Set((await repo.list('cargos', { empresa_id: repo.empresaId })).map(c => c.nome.trim().toLowerCase()));
    const criados = [];
    const ignorados = [];
    for (const p of payloads) {
      const chave = p.nome.trim().toLowerCase();
      if (existentes.has(chave)) { ignorados.push(p.nome); continue; }
      existentes.add(chave);
      criados.push(await repo.insertScoped('cargos', p));
    }
    res.status(201).json({ ok: true, data: { criados, ignorados } });
  } catch (err) { next(err); }
});

module.exports = { onboardingRouter: router };

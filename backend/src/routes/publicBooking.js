// Agendamento online pelo cliente — fase SEM migration (docs/planning/AGENDAMENTO_ONLINE_DRAFT.md).
//
// Superfície pública, sem autenticação. Regras deste arquivo:
// - O tenant vem SÓ do mapa slug → empresa configurado no servidor
//   (env PUBLIC_BOOKING_LINKS, opção B do draft). Nada do cliente escolhe empresa.
//   Sem o mapa, tudo aqui responde 404: a feature nasce desligada.
// - O contexto público (req.publicBooking) nunca vira req.auth e nunca passa por
//   authorize(); este router só expõe os 3 endpoints abaixo.
// - Respostas mínimas: nada de WhatsApp, comissão, clientes ou ids de agendamento.
// - Recusas por régua de faltas, limite por número e teto diário usam a MESMA
//   resposta (não revelam histórico de quem é dono do número).
// - Montado em app.js ANTES do express.json global e do requireAuth, com corpo de 10 kB.
const express = require('express');
const { env } = require('../config/env');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { buildSlotsDoDia, resolveDuracaoMin, agoraNoFuso } = require('../engines/SlotEngine');
const { normalizarWhatsapp } = require('../engines/ReminderEngine');
const { computeReguaFaltas } = require('../engines/NoShowLadder');
const { timeToMinutes } = require('../engines/ScheduleEngine');
const { criarLimitador, chaveIp } = require('../security/rateLimit');

const router = express.Router();

const TIPO_EVENTO = 'origem_link_publico';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const NOME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;
const CAMPOS_POST = ['servicoId', 'profissionalId', 'data', 'horario', 'nome', 'whatsapp', 'consentimento', 'website'];
// Status que ainda vão acontecer (contam no limite de agendamentos futuros por número).
const STATUS_FUTUROS = ['agendado', 'confirmado', 'aguardando', 'em_atendimento'];

// ---------------------------------------------------------------------------
// Erros públicos: mensagem neutra, sem details (nada de ids de conflito etc.).
function erroPublico(code, statusCode, message) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  err.publico = true;
  return err;
}
const naoEncontrado = () => erroPublico('NOT_FOUND', 404, 'Não encontrado.');
const dadosInvalidos = () => erroPublico('DADOS_INVALIDOS', 422, 'Dados inválidos.');
const indisponivel = () => erroPublico('INDISPONIVEL', 422, 'Serviço ou profissional indisponível para agendamento online.');
const horarioIndisponivel = () => erroPublico('HORARIO_INDISPONIVEL', 422, 'Esse horário não está disponível. Escolha outro.');
const horarioOcupado = () => erroPublico('HORARIO_OCUPADO', 409, 'Esse horário acabou de ser ocupado. Escolha outro.');
const muitasTentativas = () => erroPublico('MUITAS_TENTATIVAS', 429, 'Muitas tentativas. Aguarde alguns minutos.');
// Única resposta para régua de faltas, limite por número, cliente inativo e teto diário.
const agendamentoOnlineRecusado = () => erroPublico('AGENDAMENTO_ONLINE_INDISPONIVEL', 422,
  'Não foi possível concluir o agendamento online. Fale com o salão pelo WhatsApp.');

// ---------------------------------------------------------------------------
// Configuração (lida a cada requisição; o parse é memorizado pelo texto da env).
const num = (v, padrao) => (Number.isFinite(Number(v)) ? Number(v) : padrao);
let cacheLinks = { raw: null, mapa: new Map() };
function linksPublicos() {
  const raw = String(env.PUBLIC_BOOKING_LINKS || '');
  if (raw === cacheLinks.raw) return cacheLinks.mapa;
  const mapa = new Map();
  if (raw.trim()) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const [slug, id] of Object.entries(obj)) {
          if (SLUG_RE.test(slug) && typeof id === 'string' && UUID_RE.test(id)) mapa.set(slug, id.toLowerCase());
          else console.warn(`[agendar] PUBLIC_BOOKING_LINKS: entrada ignorada (slug ou empresa inválidos): ${String(slug).slice(0, 60)}`);
        }
      }
    } catch (_) {
      console.warn('[agendar] PUBLIC_BOOKING_LINKS não é JSON válido: agendamento online desligado.');
    }
  }
  cacheLinks = { raw, mapa };
  return mapa;
}

// Relógio injetável só para testes (datas fixas, sem depender de new Date()).
let relogio = () => new Date();
function setRelogioParaTestes(fn) { relogio = typeof fn === 'function' ? fn : () => new Date(); }

function somarDias(data, n) {
  const [y, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function dataValida(data) {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const t = Date.parse(`${data}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === data;
}

// "Agora" no fuso da operação, o primeiro instante agendável (agora + antecedência)
// e o último dia da janela. Calculado uma vez por requisição.
function limitesDoMomento() {
  const agora = agoraNoFuso(env.APP_TIMEZONE, relogio());
  const total = agora.minuto + Math.max(0, num(env.PUBLIC_BOOKING_ANTECEDENCIA_MIN, 120));
  const minimo = { data: somarDias(agora.data, Math.floor(total / 1440)), minuto: total % 1440 };
  const janelaDias = Math.max(0, num(env.PUBLIC_BOOKING_JANELA_DIAS, 30));
  return { agora, minimo, ultimoDia: somarDias(agora.data, janelaDias), janelaDias };
}

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || '';
}

// IP minimizado para o registro de origem (LGPD): IPv4 /24, IPv6 /48.
function ipTruncado(ip) {
  const s = String(ip || '');
  const v4 = s.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  if (!s.includes(':')) return null;
  const [cabeca, cauda] = s.split('::');
  const a = cabeca ? cabeca.split(':') : [];
  const b = cauda !== undefined && cauda !== '' ? cauda.split(':') : [];
  const grupos = cauda === undefined ? a : [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b];
  return `${grupos.slice(0, 3).map(g => g || '0').join(':')}::/48`;
}

// ---------------------------------------------------------------------------
// Rate limit em memória (mesmo módulo do login, security/rateLimit.js). PARCIAL: zera
// no restart e não é compartilhado entre instâncias. IP por /64 no IPv6 e teto de
// memória sem "zerar tudo" (Red Team 2026-11, RT-01).
const tentativas = criarLimitador();
const excedeu = (chave, max, janelaMs) => tentativas.excedeu(chave, max, janelaMs);
function resetRateLimitPublico() { tentativas.limpar(); }

// Chave do número para limite, trava e dedup (Red Team 2026-11, RT-02): celular
// escrito sem o 9º dígito (DDD + 8 dígitos começando em 6–9) é a mesma linha que
// DDD + 9 + 8 dígitos. Fixo (2–5) continua como está.
function chaveNumero(numero) {
  const s = String(numero || '');
  return /^55\d{2}[6-9]\d{7}$/.test(s) ? `${s.slice(0, 4)}9${s.slice(4)}` : s;
}

// Log sem PII (RT-10): erros do banco repetem a linha (WhatsApp, nome) na mensagem e
// no detail. Registra só o código e a mensagem com sequências numéricas e o trecho
// "Key (...)=(...)" mascarados; nunca o objeto inteiro.
function erroParaLog(err) {
  const msg = String((err && err.message) || err || '')
    .replace(/Key \(.*$/s, 'Key (…)')
    .replace(/\d[\d\s().-]{6,}\d/g, '[num]')
    .slice(0, 200);
  return `${(err && err.code) || 'sem_codigo'} ${msg}`;
}

function limitarPorIp(tipo) {
  return (req, res, next) => {
    const [max, janelaMs] = tipo === 'post'
      ? [num(env.PUBLIC_BOOKING_RATE_POST_IP_MAX, 10), 3600e3]
      : [num(env.PUBLIC_BOOKING_RATE_GET_MAX, 60), 60e3];
    if (excedeu(`${tipo}|${chaveIp(req.ip)}`, max, janelaMs)) return next(muitasTentativas());
    next();
  };
}

// Serializa os POSTs do mesmo número no mesmo salão (nesta instância): evita dois
// cadastros do mesmo cliente e furar o limite de futuros por corrida. PARCIAL: a
// garantia real é índice único / RPC com advisory lock (migration, fase D).
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

// ---------------------------------------------------------------------------
// Tenant: só do mapa do servidor. Slug desconhecido = 404 igual ao de desligado.
function resolverSalao(req) {
  const slug = String(req.params.slug || '').toLowerCase();
  const empresaId = SLUG_RE.test(slug) ? linksPublicos().get(slug) : undefined;
  if (!empresaId) throw naoEncontrado();
  req.publicBooking = { empresa_id: empresaId, slug, fonte: 'link_publico' };
  return new SupabaseRepository(empresaId);
}

// Catálogo público: serviços ativos com pelo menos um profissional ativo vinculado
// (profissional_servicos). Toda leitura é filtrada pela empresa do slug.
async function carregarCatalogo(repo) {
  const [empresas, servicos, profissionais, vinculos] = await Promise.all([
    repo.list('empresas', { id: repo.empresaId }),
    repo.list('servicos', { empresa_id: repo.empresaId }),
    repo.list('profissionais', { empresa_id: repo.empresaId }),
    repo.list('profissional_servicos', { empresa_id: repo.empresaId })
  ]);
  const empresa = empresas[0];
  if (!empresa) throw naoEncontrado();
  const servicosAtivos = servicos.filter(s => s.ativo !== false);
  const profAtivos = new Map(profissionais.filter(p => p.ativo !== false).map(p => [p.id, p]));
  const porNome = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  const ofertas = servicosAtivos.map(servico => {
    const ids = [...new Set(vinculos.filter(v => v.servico_id === servico.id).map(v => v.profissional_id))];
    return { servico, profissionais: ids.filter(id => profAtivos.has(id)).map(id => profAtivos.get(id)).sort(porNome) };
  }).filter(o => o.profissionais.length).sort((a, b) => porNome(a.servico, b.servico));
  return { empresa, servicosAtivos, ofertas };
}

// Horários livres para o público: mesmo motor do GET /agenda/slots, com "agora"
// deslocado pela antecedência mínima e a janela máxima de dias. Só horários.
async function slotsPublicos(repo, cat, { servicoId, profissionalId, data }, lim) {
  const oferta = cat.ofertas.find(o => o.servico.id === servicoId);
  const profissional = oferta && oferta.profissionais.find(p => p.id === profissionalId);
  if (!profissional) throw indisponivel();
  const servico = oferta.servico;
  const duracaoMin = resolveDuracaoMin({ servico, profissional });
  if (data < lim.minimo.data || data > lim.ultimoDia) return { servico, profissional, duracaoMin, slots: [] };
  const agendamentos = await repo.list('agendamentos', { empresa_id: repo.empresaId, profissional_id: profissional.id, data });
  const r = buildSlotsDoDia({
    data, profissional, empresa: cat.empresa, servico, servicosAtivos: cat.servicosAtivos, agendamentos, agora: lim.minimo
  });
  const piso = data === lim.minimo.data ? lim.minimo.minuto : -1;
  const slots = [...new Set(r.slots.map(s => s.horario))].filter(h => timeToMinutes(h) >= piso);
  return { servico, profissional, duracaoMin: r.duracaoMin, slots };
}

function validarEntrada(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw dadosInvalidos();
  // Só os campos do formulário: empresaId, clienteId, status, permitirConflito,
  // autoria etc. são recusados sem dizer qual.
  if (Object.keys(body).some(k => !CAMPOS_POST.includes(k))) throw dadosInvalidos();
  const { servicoId, profissionalId, data, horario, nome, whatsapp, consentimento, website } = body;
  if (typeof servicoId !== 'string' || !UUID_RE.test(servicoId)) throw dadosInvalidos();
  if (typeof profissionalId !== 'string' || !UUID_RE.test(profissionalId)) throw dadosInvalidos();
  if (!dataValida(data) || typeof horario !== 'string' || !HORA_RE.test(horario)) throw dadosInvalidos();
  if (website !== undefined && typeof website !== 'string') throw dadosInvalidos();
  const nomeLimpo = typeof nome === 'string' ? nome.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
  if (nomeLimpo.length < 2 || nomeLimpo.length > 80 || !NOME_RE.test(nomeLimpo)) {
    throw erroPublico('NOME_INVALIDO', 422, 'Informe seu nome (2 a 80 letras).');
  }
  const numero = typeof whatsapp === 'string' && whatsapp.length <= 30 ? chaveNumero(normalizarWhatsapp(whatsapp)) : null;
  if (!numero) throw erroPublico('WHATSAPP_INVALIDO', 422, 'Informe o WhatsApp com DDD (10 ou 11 dígitos).');
  if (consentimento !== true) throw erroPublico('CONSENTIMENTO_OBRIGATORIO', 422, 'Confirme que leu o aviso de privacidade.');
  return { servicoId: servicoId.toLowerCase(), profissionalId: profissionalId.toLowerCase(), data, horario, nome: nomeLimpo, whatsapp: numero, website: (website || '').trim() };
}

// Cliente pelo número normalizado dos dois lados (clientes.whatsapp é texto livre).
// O nome cadastrado nunca é alterado nem devolvido.
function clientesDoNumero(clientes, numero) {
  const doNumero = clientes.filter(c => chaveNumero(normalizarWhatsapp(c.whatsapp || c.telefone)) === numero);
  const ativos = doNumero
    .filter(c => c.ativo !== false)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  return { algum: doNumero.length > 0, ativos };
}

async function gravar(repo, cat, ctx) {
  const { entrada, servico, profissional, duracaoMin, lim, req } = ctx;
  const agoraIso = relogio().toISOString();

  // Teto diário de agendamentos online do salão (disjuntor contra spam).
  const eventos = await repo.list('agendamento_eventos', { empresa_id: repo.empresaId, tipo: TIPO_EVENTO });
  const hoje = eventos.filter(e => e.created_at && agoraNoFuso(env.APP_TIMEZONE, new Date(e.created_at)).data === lim.agora.data).length;
  if (hoje >= num(env.PUBLIC_BOOKING_TETO_DIARIO, 50)) throw agendamentoOnlineRecusado();

  const { algum, ativos } = clientesDoNumero(await repo.list('clientes', { empresa_id: repo.empresaId }), entrada.whatsapp);
  if (algum && !ativos.length) throw agendamentoOnlineRecusado(); // só cadastro inativo: o salão decide
  let cliente = ativos[0] || null;
  const dedup = !cliente ? 'novo' : ativos.length > 1 ? 'ambiguo' : 'existente';
  let regua = 'ok';
  if (cliente) {
    // Todos os cadastros ativos do número contam (RT-03): com dois cadastros, olhar só
    // o mais antigo deixava o outro furar o limite de futuros e a régua.
    const historico = (await Promise.all(ativos.map(c => repo.list('agendamentos', { empresa_id: repo.empresaId, cliente_id: c.id })))).flat();
    const futuros = historico.filter(a => STATUS_FUTUROS.includes(a.status) &&
      (String(a.data) > lim.agora.data || (String(a.data) === lim.agora.data && timeToMinutes(a.horario) >= lim.agora.minuto)));
    if (futuros.length >= num(env.PUBLIC_BOOKING_MAX_FUTUROS_POR_NUMERO, 2)) throw agendamentoOnlineRecusado();
    regua = computeReguaFaltas(historico, {
      alerta: cat.empresa.regua_alerta_faltas ?? 2, sinal: cat.empresa.regua_sinal_faltas ?? 3
    }, lim.agora.data).nivel;
    if (regua === 'exigir_sinal') throw agendamentoOnlineRecusado();
  } else {
    cliente = await repo.insert('clientes', {
      nome: entrada.nome, whatsapp: entrada.whatsapp, ativo: true,
      observacoes: 'Cadastro pelo link de agendamento online', created_by: null
    });
  }

  // Mesmo caminho do POST /agenda: agendamento_criar (conflito + insert sob lock no banco).
  let agendamento;
  try {
    agendamento = await repo.criarAgendamento({
      agendamento: {
        cliente_id: cliente.id,
        servico_id: servico.id,
        profissional_id: profissional.id,
        data: entrada.data,
        horario: entrada.horario,
        duracao_min: duracaoMin,
        valor_centavos: servico.valor_centavos || 0,
        status: 'agendado'
      },
      permitirConflito: false,
      createdBy: null
    });
  } catch (err) {
    if (err && (err.code === 'SCHEDULE_CONFLICT' || err.statusCode === 409)) throw horarioOcupado();
    throw err;
  }

  try {
    await repo.insert('agendamento_eventos', {
      agendamento_id: agendamento.id,
      tipo: TIPO_EVENTO,
      created_at: agoraIso,
      payload: {
        origem: 'link_publico',
        slug: req.publicBooking.slug,
        versao_aviso_privacidade: env.PUBLIC_BOOKING_AVISO_VERSAO,
        consentimento_em: agoraIso,
        ip_truncado: ipTruncado(req.ip),
        dedup,
        regua
      }
    });
  } catch (err) {
    // O agendamento já existe (e é o que importa ao cliente); o evento é auditoria.
    console.error('[agendar] evento de origem não gravado:', erroParaLog(err));
  }
  return agendamento;
}

// ---------------------------------------------------------------------------
// Feature desligada (sem mapa): 404 em tudo, antes de ler corpo ou contar tentativa.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!linksPublicos().size) return next(naoEncontrado());
  next();
});
router.use(express.json({ limit: '10kb' }));

router.get('/agendar/:slug', limitarPorIp('get'), async (req, res, next) => {
  try {
    const repo = resolverSalao(req);
    const cat = await carregarCatalogo(repo);
    const lim = limitesDoMomento();
    res.json({
      ok: true,
      data: {
        salao: { nome: cat.empresa.nome || '' },
        servicos: cat.ofertas.map(({ servico, profissionais }) => ({
          id: servico.id,
          nome: servico.nome,
          duracaoMin: resolveDuracaoMin({ servico }),
          precoCentavos: Number(servico.valor_centavos) || 0,
          profissionais: profissionais.map(p => ({ id: p.id, nome: primeiroNome(p.nome) }))
        })),
        regras: {
          hoje: lim.agora.data,
          primeiroDia: lim.minimo.data,
          ultimoDia: lim.ultimoDia,
          antecedenciaMin: Math.max(0, num(env.PUBLIC_BOOKING_ANTECEDENCIA_MIN, 120)),
          janelaDias: lim.janelaDias
        },
        aviso: { versao: env.PUBLIC_BOOKING_AVISO_VERSAO }
      }
    });
  } catch (err) { next(err); }
});

router.get('/agendar/:slug/slots', limitarPorIp('get'), async (req, res, next) => {
  try {
    const repo = resolverSalao(req);
    const { servicoId, profissionalId, data } = req.query;
    if (typeof servicoId !== 'string' || !UUID_RE.test(servicoId) || typeof profissionalId !== 'string' ||
      !UUID_RE.test(profissionalId) || !dataValida(data)) throw dadosInvalidos();
    const lim = limitesDoMomento();
    const cat = await carregarCatalogo(repo);
    const r = await slotsPublicos(repo, cat, { servicoId: servicoId.toLowerCase(), profissionalId: profissionalId.toLowerCase(), data }, lim);
    res.json({ ok: true, data: { data, duracaoMin: r.duracaoMin, slots: r.slots } });
  } catch (err) { next(err); }
});

router.post('/agendar/:slug', limitarPorIp('post'), async (req, res, next) => {
  try {
    const repo = resolverSalao(req);
    const entrada = validarEntrada(req.body);
    if (excedeu(`numero|${repo.empresaId}|${entrada.whatsapp}`, num(env.PUBLIC_BOOKING_RATE_POST_NUMERO_MAX, 5), 3600e3)) {
      throw muitasTentativas();
    }
    const lim = limitesDoMomento();
    const cat = await carregarCatalogo(repo);
    const { servico, profissional, duracaoMin, slots } = await slotsPublicos(repo, cat, entrada, lim);
    const resposta = { data: entrada.data, horario: entrada.horario, servico: servico.nome, profissional: primeiroNome(profissional.nome) };
    // Honeypot preenchido (robô): finge sucesso e não grava nada.
    if (entrada.website) return res.status(201).json({ ok: true, data: resposta });
    // Revalidação no servidor: expediente, antecedência, janela, ocupação e vínculo.
    if (!slots.includes(entrada.horario)) throw horarioIndisponivel(); // [protecao:slot]
    await comTrava(`${repo.empresaId}|${entrada.whatsapp}`, () => gravar(repo, cat, { entrada, servico, profissional, duracaoMin, lim, req }));
    res.status(201).json({ ok: true, data: resposta });
  } catch (err) { next(err); }
});

// Qualquer outro caminho sob /api/public: mesmo 404 (não cai no requireAuth).
router.use((req, res, next) => next(naoEncontrado()));

// Erros deste router nunca expõem detalhes internos (ids de conflito, mensagens do banco).
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err && err.publico) return res.status(err.statusCode).json({ ok: false, error: { code: err.code, message: err.message } });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ ok: false, error: { code: 'DADOS_INVALIDOS', message: 'Dados inválidos.' } });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: { code: 'DADOS_INVALIDOS', message: 'Dados inválidos.' } });
  console.error('[agendar] erro interno:', erroParaLog(err));
  res.status(500).json({ ok: false, error: { code: 'INDISPONIVEL_AGORA', message: 'Não foi possível concluir agora. Tente de novo em instantes.' } });
});

module.exports = { publicBookingRouter: router, resetRateLimitPublico, setRelogioParaTestes, ipTruncado, chaveNumero, erroParaLog, TIPO_EVENTO };

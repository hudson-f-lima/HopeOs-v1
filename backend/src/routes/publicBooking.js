// Agendamento online pelo cliente — fase SEM migration (docs/planning/AGENDAMENTO_ONLINE_DRAFT.md).
//
// Superfície pública, sem autenticação. Regras deste arquivo:
// - O tenant vem SÓ do servidor: do slug que o salão gravou em empresas.online_slug com o
//   link ligado (migration 016, D-037) ou, na falta dele, do mapa slug → empresa da env
//   PUBLIC_BOOKING_LINKS (opção B do draft). Nada do cliente escolhe empresa. Slug que não
//   está em nenhum dos dois, ou está no banco com o link desligado, responde 404: a feature
//   nasce desligada.
// - Antecedência, janela, máximo de horários futuros por número e exibição de preço vêm da
//   linha do salão (016); a env só vale antes da 016 ou para coluna ausente.
// - O contexto público (req.publicBooking) nunca vira req.auth e nunca passa por
//   authorize(); este router só expõe os 3 endpoints abaixo.
// - Respostas mínimas: nada de WhatsApp, comissão, clientes ou ids de agendamento.
// - Recusas por régua de faltas, limite por número e teto diário usam a MESMA
//   resposta (não revelam histórico de quem é dono do número).
// - Montado em app.js ANTES do express.json global e do requireAuth, com corpo de 10 kB.
const express = require('express');
const { env } = require('../config/env');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { buildSlotsDoDia, resolveDuracaoMin, agoraNoFuso, aplicarPolitica } = require('../engines/SlotEngine');
const { normalizarWhatsapp } = require('../engines/ReminderEngine');
const { prazoCancelamentoMin, antecedenciaOnlineMin, violaIntervaloOnline } = require('../engines/AgendaPoliticaEngine');
const { computeReguaFaltas } = require('../engines/NoShowLadder');
const { timeToMinutes, minutesToTime } = require('../engines/ScheduleEngine');
const { criarLimitador, chaveIpPublico } = require('../security/rateLimit');
const crypto = require('crypto');
const { TOKEN_RE, gerarToken, hashToken, instanteLocal, criarAcesso, moverAcessos } = require('../services/AcessoAgendamento');
const { registrarEventoAgenda } = require('../services/AgendaEventosService');
const { validarAssinatura } = require('../notifications/lembretes');
const { criarCanalPush } = require('../notifications/canais');

const router = express.Router();

const TIPO_EVENTO = 'origem_link_publico';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const NOME_RE = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;
const CAMPOS_POST = ['servicoId', 'profissionalId', 'data', 'horario', 'nome', 'whatsapp', 'consentimento', 'website', 'versaoOferta'];
// Valor de profissionalId para "sem preferência": o servidor escolhe quem atende.
const SEM_PREFERENCIA = 'qualquer';
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
function limitesDoMomento(cfg) {
  const agora = agoraNoFuso(env.APP_TIMEZONE, relogio());
  const total = agora.minuto + cfg.antecedenciaMin;
  const minimo = { data: somarDias(agora.data, Math.floor(total / 1440)), minuto: total % 1440 };
  return { agora, minimo, ultimoDia: somarDias(agora.data, cfg.janelaDias), janelaDias: cfg.janelaDias };
}

// Regras do salão (016) com a env como reserva: coluna ausente (antes da 016) ou fora da faixa
// do banco cai no valor da env, que cai no padrão.
function inteiroNaFaixa(v, min, max) {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}
function configOnline(empresa) {
  const e = empresa || {};
  return {
    antecedenciaMin: inteiroNaFaixa(e.online_antecedencia_min, 0, 10080) ?? Math.max(0, num(env.PUBLIC_BOOKING_ANTECEDENCIA_MIN, 120)),
    janelaDias: inteiroNaFaixa(e.online_janela_dias, 1, 180) ?? Math.max(0, num(env.PUBLIC_BOOKING_JANELA_DIAS, 30)),
    maxFuturos: inteiroNaFaixa(e.online_max_futuros, 1, 10) ?? num(env.PUBLIC_BOOKING_MAX_FUTUROS_POR_NUMERO, 2),
    cancelamentoPrazoMin: inteiroNaFaixa(e.online_cancelamento_prazo_min, 0, 10080) ?? 120,
    mostrarPreco: e.online_mostrar_preco !== false
  };
}

// Preço e duração de quem atende: override do profissional por serviço > serviço (a mesma
// regra do checkout, CheckoutInputResolver, e da agenda, SlotEngine).
function overrideDe(servico, profissional) {
  let ov = profissional && profissional.overrides;
  if (typeof ov === 'string') { try { ov = JSON.parse(ov); } catch (_) { ov = {}; } }
  return (ov && servico && ov[servico.id]) || {};
}
function precoDe(servico, profissional) {
  const ov = overrideDe(servico, profissional);
  const valido = x => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)) && Number(x) >= 0;
  const v = [ov.valor_centavos, ov.valorCentavos, servico.valor_centavos].find(valido);
  return v === undefined ? 0 : Math.round(Number(v));
}

// Aviso de privacidade com o controlador do salão (razão social, CNPJ, contato). O hash curto
// vai no evento de origem: prova qual texto o cliente viu sem copiar os dados em cada evento.
function avisoDoSalao(empresa) {
  const cnpj = /^\d{14}$/.test(String(empresa.cnpj || ''))
    ? String(empresa.cnpj).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : null;
  const controlador = {
    nome: String(empresa.razao_social || '').trim() || String(empresa.nome || '').trim() || null,
    cnpj,
    contato: String(empresa.privacidade_contato || '').trim() || null
  };
  const versao = env.PUBLIC_BOOKING_AVISO_VERSAO;
  const hash = crypto.createHash('sha256').update(JSON.stringify([versao, controlador])).digest('hex').slice(0, 16);
  return { versao, controlador, hash };
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
// no restart e não é compartilhado entre instâncias. IPv4 por /24 e IPv6 por /64, e teto
// de memória sem "zerar tudo" (Red Team 2026-11, RT-01; produção 2026-11-16, RTP-01).
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
      : tipo === 'link'
        ? [num(env.PUBLIC_BOOKING_RATE_LINK_MAX, 30), 60e3]
        : [num(env.PUBLIC_BOOKING_RATE_GET_MAX, 60), 60e3];
    if (excedeu(`${tipo}|${chaveIpPublico(req.ip)}`, max, janelaMs)) return next(muitasTentativas());
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
// Tenant: só do servidor (banco 016 > mapa da env). Slug desconhecido ou desligado = 404
// igual. O resultado do banco fica 30 s em memória (inclusive "não existe", com teto de
// entradas) para um robô com slugs aleatórios não virar uma consulta por requisição; salvar a
// configuração em Conta limpa o cache desta instância.
const CACHE_SLUG_MS = 30e3;
const CACHE_SLUG_MAX = 500;
const cacheSlug = new Map();
function limparCacheSlug() { cacheSlug.clear(); }
async function slugNoBanco(slug) {
  const agora = Date.now();
  const hit = cacheSlug.get(slug);
  if (hit && hit.ate > agora) return hit.valor;
  let valor;
  try {
    const linha = await new SupabaseRepository(null).empresaOnlinePorSlug(slug);
    valor = linha ? { empresaId: String(linha.id).toLowerCase(), ativo: linha.online_ativo === true } : null;
  } catch (err) {
    // Antes da 016 a coluna não existe: segue só com o mapa da env, sem guardar no cache.
    console.warn('[agendar] slug no banco indisponível:', erroParaLog(err));
    return undefined;
  }
  if (cacheSlug.size >= CACHE_SLUG_MAX) cacheSlug.delete(cacheSlug.keys().next().value);
  cacheSlug.set(slug, { valor, ate: agora + CACHE_SLUG_MS });
  return valor;
}

async function resolverSalao(req) {
  const slug = String(req.params.slug || '').toLowerCase();
  if (!SLUG_RE.test(slug)) throw naoEncontrado();
  const doBanco = await slugNoBanco(slug);
  let empresaId;
  let fonte;
  if (doBanco) {
    // O slug é do salão no banco: vale o liga/desliga dele, mesmo que a env também o tenha.
    if (!doBanco.ativo) throw naoEncontrado();
    empresaId = doBanco.empresaId;
    fonte = 'banco';
  } else {
    empresaId = linksPublicos().get(slug);
    fonte = 'env';
  }
  if (!empresaId || !UUID_RE.test(empresaId)) throw naoEncontrado();
  req.publicBooking = { empresa_id: empresaId, slug, fonte };
  return new SupabaseRepository(empresaId);
}

// Catálogo público: serviços ativos com pelo menos um profissional ativo vinculado
// (profissional_servicos). Toda leitura é filtrada pela empresa do slug.
async function carregarCatalogo(repo) {
  // A empresa vem com a disponibilidade (D-033): o mesmo cálculo da recepção.
  const [empresa, servicos, profissionais, vinculos] = await Promise.all([
    repo.empresaComDisponibilidade(),
    repo.list('servicos', { empresa_id: repo.empresaId }),
    repo.list('profissionais', { empresa_id: repo.empresaId }),
    repo.list('profissional_servicos', { empresa_id: repo.empresaId })
  ]);
  if (!empresa) throw naoEncontrado();
  const servicosAtivos = servicos.filter(s => s.ativo !== false);
  const profAtivos = new Map(profissionais.filter(p => p.ativo !== false).map(p => [p.id, p]));
  const porNome = (a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  const ofertas = servicosAtivos.map(servico => {
    const ids = [...new Set(vinculos.filter(v => v.servico_id === servico.id).map(v => v.profissional_id))];
    return { servico, profissionais: ids.filter(id => profAtivos.has(id)).map(id => profAtivos.get(id)).sort(porNome) };
  }).filter(o => o.profissionais.length).sort((a, b) => porNome(a.servico, b.servico));
  return { empresa, servicosAtivos, ofertas, cfg: configOnline(empresa), aviso: avisoDoSalao(empresa) };
}

// Horários livres para o público: mesmo motor do GET /agenda/slots, com "agora"
// deslocado pela antecedência mínima e a janela máxima de dias. Só horários.
// Na remarcação pelo link pessoal, `ignorarId` é o próprio horário (não ocupa a si mesmo) e
// `duracaoFixa` é a duração já marcada.
async function slotsDoProfissional(repo, cat, servico, profissional, data, lim, { ignorarId = null, duracaoFixa } = {}) {
  const duracaoMin = duracaoFixa || resolveDuracaoMin({ servico, profissional });
  if (data < lim.minimo.data || data > lim.ultimoDia) return { profissional, duracaoMin, slots: [], ocupacao: 0 };
  const agendamentos = (await repo.list('agendamentos', { empresa_id: repo.empresaId, profissional_id: profissional.id, data }))
    .filter(a => a.id !== ignorarId);
  const r = buildSlotsDoDia({
    data, profissional, empresa: cat.empresa, servico, servicosAtivos: cat.servicosAtivos, agendamentos, agora: lim.minimo,
    gradePorDuracao: true, duracaoMin: duracaoFixa
  });
  const piso = data === lim.minimo.data ? lim.minimo.minuto : -1;
  // Política de sugestão (D-054): no link, só o que a política oferece (e a gravação usa a mesma lista).
  const slots = [...new Set(aplicarPolitica(r.slots, r.politica, 'online').map(s => s.horario))].filter(h => timeToMinutes(h) >= piso);
  const ocupacao = agendamentos.filter(a => STATUS_FUTUROS.includes(a.status)).length;
  return { profissional, duracaoMin: r.duracaoMin, slots, ocupacao };
}

// Antecedência própria do serviço (D-049, 024): ex. química só com 24 h. Sem ela, a do salão.
function limiteDoServico(cat, servico, lim) {
  const ant = antecedenciaOnlineMin(cat.empresa, servico, cat.cfg.antecedenciaMin);
  return ant === cat.cfg.antecedenciaMin ? lim : limitesDoMomento({ ...cat.cfg, antecedenciaMin: ant });
}

// profissionalId = SEM_PREFERENCIA: horários de qualquer profissional do serviço. Para gravar,
// `escolhido(horario)` devolve quem atende: o de agenda mais leve no dia, depois o nome.
async function slotsPublicos(repo, cat, { servicoId, profissionalId, data }, limSalao) {
  const oferta = cat.ofertas.find(o => o.servico.id === servicoId);
  if (!oferta) throw indisponivel();
  const servico = oferta.servico;
  const lim = limiteDoServico(cat, servico, limSalao);
  if (profissionalId !== SEM_PREFERENCIA) {
    const profissional = oferta.profissionais.find(p => p.id === profissionalId);
    if (!profissional) throw indisponivel();
    const r = await slotsDoProfissional(repo, cat, servico, profissional, data, lim);
    return { servico, ...r, candidatos: oferta.profissionais, escolhido: h => (r.slots.includes(h) ? r : null) };
  }
  const porProf = await Promise.all(oferta.profissionais.map(p => slotsDoProfissional(repo, cat, servico, p, data, lim)));
  const slots = [...new Set(porProf.flatMap(r => r.slots))].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
  const escolhido = h => porProf.filter(r => r.slots.includes(h))
    .sort((a, b) => a.ocupacao - b.ocupacao || String(a.profissional.nome || '').localeCompare(String(b.profissional.nome || ''), 'pt-BR'))[0] || null;
  const duracoes = porProf.map(r => r.duracaoMin);
  return { servico, profissional: null, candidatos: oferta.profissionais, duracaoMin: Math.min(...duracoes), slots, escolhido };
}

function ofertaPublica(cat, servico, escolha, data, horario) {
  const { profissional, duracaoMin } = escolha;
  const valor = precoDe(servico, profissional);
  const prazo = prazoCancelamentoMin(cat.empresa, servico);
  const condicoes = [cat.empresa.id, servico.id, profissional.id, data, horario, duracaoMin, cat.cfg.mostrarPreco ? valor : null, prazo];
  return {
    horario, fim: minutesToTime(timeToMinutes(horario) + duracaoMin),
    profissional: primeiroNome(profissional.nome), duracaoMin,
    precoCentavos: cat.cfg.mostrarPreco ? valor : null, cancelamentoPrazoMin: prazo,
    versaoOferta: crypto.createHash('sha256').update(JSON.stringify(condicoes)).digest('hex')
  };
}

function validarEntrada(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw dadosInvalidos();
  // Só os campos do formulário: empresaId, clienteId, status, permitirConflito,
  // autoria etc. são recusados sem dizer qual.
  if (Object.keys(body).some(k => !CAMPOS_POST.includes(k))) throw dadosInvalidos();
  const { servicoId, profissionalId, data, horario, nome, whatsapp, consentimento, website } = body;
  if (typeof servicoId !== 'string' || !UUID_RE.test(servicoId)) throw dadosInvalidos();
  if (typeof profissionalId !== 'string' || !(UUID_RE.test(profissionalId) || profissionalId === SEM_PREFERENCIA)) throw dadosInvalidos();
  if (!dataValida(data) || typeof horario !== 'string' || !HORA_RE.test(horario)) throw dadosInvalidos();
  if (website !== undefined && typeof website !== 'string') throw dadosInvalidos();
  const nomeLimpo = typeof nome === 'string' ? nome.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
  if (nomeLimpo.length < 2 || nomeLimpo.length > 80 || !NOME_RE.test(nomeLimpo)) {
    throw erroPublico('NOME_INVALIDO', 422, 'Informe seu nome (2 a 80 letras).');
  }
  const numero = typeof whatsapp === 'string' && whatsapp.length <= 30 ? chaveNumero(normalizarWhatsapp(whatsapp)) : null;
  if (!numero) throw erroPublico('WHATSAPP_INVALIDO', 422, 'Informe o WhatsApp com DDD (10 ou 11 dígitos).');
  if (consentimento !== true) throw erroPublico('CONSENTIMENTO_OBRIGATORIO', 422, 'Confirme que leu o aviso de privacidade.');
  if (body.versaoOferta !== undefined && (typeof body.versaoOferta !== 'string' || !/^[0-9a-f]{64}$/.test(body.versaoOferta))) throw dadosInvalidos();
  return { versaoOferta: body.versaoOferta, servicoId: servicoId.toLowerCase(), profissionalId: profissionalId.toLowerCase(), data, horario, nome: nomeLimpo, whatsapp: numero, website: (website || '').trim() };
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
    if (futuros.length >= cat.cfg.maxFuturos) throw agendamentoOnlineRecusado();
    // Intervalo mínimo no mesmo serviço (D-049): recusa sem dizer a data do outro horário (quem
    // digita um número não pode descobrir a agenda de quem é dono dele).
    if (violaIntervaloOnline({ empresa: cat.empresa, servicoId: ctx.servico.id, data: entrada.data, historico })) throw agendamentoOnlineRecusado();
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
        valor_centavos: precoDe(servico, profissional),
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
        versao_aviso_privacidade: cat.aviso.versao,
        aviso_hash: cat.aviso.hash,
        fonte_link: req.publicBooking.fonte,
        profissional_escolhido_por: ctx.semPreferencia ? 'sistema' : 'cliente',
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
// Nada daqui vai para cache. Desligado (slug fora do banco e da env) é 404 na resolução do
// salão, depois do limite por IP e antes de ler qualquer dado do salão.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
// O corpo só é lido depois que o slug resolve um salão ligado: slug desconhecido nem chega
// ao parser (a sonda do smoke usa isso para saber se um salão está ligado).
const lerCorpo = express.json({ limit: '10kb' });
const resolverAntes = (req, res, next) => resolverSalao(req).then(repo => { req.repoPublico = repo; next(); }, next);

router.get('/agendar/:slug', limitarPorIp('get'), async (req, res, next) => {
  try {
    const repo = await resolverSalao(req);
    const cat = await carregarCatalogo(repo);
    const lim = limitesDoMomento(cat.cfg);
    const preco = v => (cat.cfg.mostrarPreco ? v : null);
    res.json({
      ok: true,
      data: {
        salao: { nome: cat.empresa.nome || '' },
        servicos: cat.ofertas.map(({ servico, profissionais }) => {
          // Preço e duração de cada profissional (override); no serviço, a faixa entre eles.
          const profs = profissionais.map(p => ({
            id: p.id, nome: primeiroNome(p.nome), duracaoMin: resolveDuracaoMin({ servico, profissional: p }), precoCentavos: precoDe(servico, p)
          }));
          const precos = profs.map(p => p.precoCentavos);
          const duracoes = profs.map(p => p.duracaoMin);
          return {
            id: servico.id,
            nome: servico.nome,
            duracaoMin: Math.min(...duracoes),
            duracaoMaxMin: Math.max(...duracoes),
            precoCentavos: preco(Math.min(...precos)),
            precoMaxCentavos: preco(Math.max(...precos)),
            semPreferencia: profs.length > 1,
            profissionais: profs.map(p => ({ ...p, precoCentavos: preco(p.precoCentavos) }))
          };
        }),
        regras: {
          hoje: lim.agora.data,
          primeiroDia: lim.minimo.data,
          ultimoDia: lim.ultimoDia,
          antecedenciaMin: cat.cfg.antecedenciaMin,
          janelaDias: lim.janelaDias,
          cancelamentoPrazoMin: cat.cfg.cancelamentoPrazoMin
        },
        aviso: { versao: cat.aviso.versao, controlador: cat.aviso.controlador }
      }
    });
  } catch (err) { next(err); }
});

router.get('/agendar/:slug/slots', limitarPorIp('get'), async (req, res, next) => {
  try {
    const repo = await resolverSalao(req);
    const { servicoId, profissionalId, data } = req.query;
    if (typeof servicoId !== 'string' || !UUID_RE.test(servicoId) || typeof profissionalId !== 'string' ||
      !(UUID_RE.test(profissionalId) || profissionalId === SEM_PREFERENCIA) || !dataValida(data)) throw dadosInvalidos();
    const cat = await carregarCatalogo(repo);
    const lim = limitesDoMomento(cat.cfg);
    const r = await slotsPublicos(repo, cat, { servicoId: servicoId.toLowerCase(), profissionalId: profissionalId.toLowerCase(), data }, lim);
    const ofertas = r.slots.map(h => ofertaPublica(cat, r.servico, r.escolhido(h), data, h));
    res.json({ ok: true, data: { data, duracaoMin: r.duracaoMin, slots: r.slots, ofertas } });
  } catch (err) { next(err); }
});

router.post('/agendar/:slug', limitarPorIp('post'), resolverAntes, lerCorpo, async (req, res, next) => {
  try {
    const repo = req.repoPublico;
    const entrada = validarEntrada(req.body);
    if (excedeu(`numero|${repo.empresaId}|${entrada.whatsapp}`, num(env.PUBLIC_BOOKING_RATE_POST_NUMERO_MAX, 5), 3600e3)) {
      throw muitasTentativas();
    }
    const cat = await carregarCatalogo(repo);
    const lim = limitesDoMomento(cat.cfg);
    const { servico, slots, escolhido, profissional: pedido, candidatos } = await slotsPublicos(repo, cat, entrada, lim);
    // Honeypot preenchido (robô): finge sucesso e não grava nada.
    if (entrada.website) {
      const quem = pedido || (escolhido(entrada.horario) || {}).profissional || candidatos[0];
      const falso = { cancelamentoPrazoMin: prazoCancelamentoMin(cat.empresa, servico), data: entrada.data, horario: entrada.horario, servico: servico.nome, profissional: primeiroNome(quem.nome) };
      return res.status(201).json({ ok: true, data: { ...falso, link: gerarToken(), calendario: calendarioDe(cat.empresa, falso, resolveDuracaoMin({ servico, profissional: quem })) } });
    }
    // Revalidação no servidor: expediente, antecedência, janela, ocupação e vínculo.
    if (!slots.includes(entrada.horario)) throw horarioIndisponivel(); // [protecao:slot]
    // Com profissional pedido, é ele; sem preferência, quem tem o horário livre.
    const { profissional, duracaoMin } = escolhido(entrada.horario) || { profissional: pedido, duracaoMin: resolveDuracaoMin({ servico, profissional: pedido }) };
    if (!profissional) throw horarioIndisponivel();
    const oferta = ofertaPublica(cat, servico, { profissional, duracaoMin }, entrada.data, entrada.horario);
    if (entrada.versaoOferta && oferta.versaoOferta !== entrada.versaoOferta) {
      throw erroPublico('OFERTA_ALTERADA', 409, 'As condições mudaram. Revise o horário antes de confirmar.');
    }
    const semPreferencia = entrada.profissionalId === SEM_PREFERENCIA;
    const resposta = { cancelamentoPrazoMin: oferta.cancelamentoPrazoMin, data: entrada.data, horario: entrada.horario, servico: servico.nome, profissional: primeiroNome(profissional.nome) };
    const agendamento = await comTrava(`${repo.empresaId}|${entrada.whatsapp}`, () => gravar(repo, cat, { entrada, servico, profissional, duracaoMin, lim, req, semPreferencia }));
    // Link pessoal (017): se falhar, o agendamento já existe; o cliente fica sem o link.
    let link = null;
    try {
      link = await criarAcesso(repo, agendamento, { timeZone: env.APP_TIMEZONE, agora: relogio() });
    } catch (err) {
      console.error('[agendar] link pessoal não criado:', erroParaLog(err));
    }
    res.status(201).json({ ok: true, data: { ...resposta, link, calendario: calendarioDe(cat.empresa, resposta, duracaoMin) } });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// Link pessoal do agendamento (migration 017, D-038, C2). Sem login: o código de 32 bytes do link
// é a credencial. Vai no CORPO de um POST (nunca na URL, que o morgan registra). Código ausente,
// malformado, desconhecido, revogado ou vencido: o mesmo 404. As ações conferem status e prazo no
// servidor a cada pedido; cancelar e confirmar são atualizações condicionais (corrida perde com
// 409). A página não recebe ids nem dados do cliente além do próprio horário.
const MAX_REMARCACOES = 3;
const STATUS_ATIVOS = ['agendado', 'confirmado'];
const ROTULO_STATUS = {
  agendado: 'agendado', confirmado: 'confirmado', cancelado: 'cancelado', reagendado: 'remarcado',
  aguardando: 'em_atendimento', em_atendimento: 'em_atendimento', concluido: 'concluido', fechado: 'concluido', no_show: 'falta'
};
const AUTOR_CLIENTE = { principal_type: 'cliente_link' };
const linkInvalido = () => erroPublico('LINK_INVALIDO', 404, 'Link inválido ou expirado. Fale com o salão.');
const foraDoPrazo = () => erroPublico('FORA_DO_PRAZO', 422, 'Pelo link, este horário não pode mais ser mudado. Fale com o salão.');
const agendamentoMudou = () => erroPublico('AGENDAMENTO_MUDOU', 409, 'Este agendamento acabou de mudar. Atualize a página.');
const hhmm = h => String(h || '').slice(0, 5);

// Evento para a agenda do celular do cliente (.ics e Google Agenda, montados na página).
function calendarioDe(empresa, { data, horario, servico }, duracaoMin) {
  const inicio = instanteLocal(data, horario, env.APP_TIMEZONE);
  const nome = String((empresa && empresa.nome) || 'Salão');
  return {
    inicioIso: inicio.toISOString(),
    fimIso: new Date(inicio.getTime() + (Number(duracaoMin) || 30) * 60e3).toISOString(),
    titulo: `${servico} — ${nome}`,
    local: [empresa && empresa.endereco, empresa && empresa.cidade].filter(Boolean).join(', ') || nome
  };
}

function corpoDoLink(body, extras = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw linkInvalido();
  if (Object.keys(body).some(k => k !== 'token' && !extras.includes(k))) throw dadosInvalidos();
  return body;
}

async function contextoDoAcesso(req, extras) {
  const { token } = corpoDoLink(req.body, extras);
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw linkInvalido();
  const acesso = await new SupabaseRepository(null).acessoPorTokenHash(hashToken(token));
  const agora = relogio();
  if (!acesso || acesso.revogado_em || !(Date.parse(acesso.expira_em) > agora.getTime())) throw linkInvalido();
  const repo = new SupabaseRepository(String(acesso.empresa_id));
  const ag = await repo.getByIdScoped('agendamentos', acesso.agendamento_id);
  if (!ag) throw linkInvalido();
  const [empresas, servicos, profissionais] = await Promise.all([
    repo.list('empresas', { id: repo.empresaId }),
    repo.list('servicos', { empresa_id: repo.empresaId }),
    repo.list('profissionais', { empresa_id: repo.empresaId })
  ]);
  const empresa = empresas[0] || {};
  const servico = servicos.find(x => x.id === ag.servico_id) || null;
  const profissional = profissionais.find(x => x.id === ag.profissional_id) || null;
  const cfg = configOnline(empresa);
  const inicio = instanteLocal(ag.data, hhmm(ag.horario), env.APP_TIMEZONE);
  const prazoMin = prazoCancelamentoMin(empresa, servico); // D-049: o do serviço ou o do salão
  const limite = new Date(inicio.getTime() - prazoMin * 60e3);
  const ativo = STATUS_ATIVOS.includes(ag.status);
  const antesDoPrazo = agora.getTime() < limite.getTime();
  const remarcavel = !!(servico && servico.ativo !== false && profissional && profissional.ativo !== false);
  const pode = {
    confirmar: ag.status === 'agendado' && agora.getTime() < inicio.getTime(),
    cancelar: ativo && antesDoPrazo,
    remarcar: ativo && antesDoPrazo && empresa.online_ativo === true && remarcavel && (Number(acesso.remarcacoes) || 0) < MAX_REMARCACOES
  };
  return { repo, acesso, ag, agora, empresa, servico, profissional, cfg, prazoMin, inicio, limite, pode };
}

// Push (C5): disponível quando as chaves VAPID estão no servidor e o salão não desligou.
const canalPush = () => criarCanalPush({ env, webpush: null });
const MAX_PUSH_POR_LINK = 5;
const hashEndpoint = endpoint => crypto.createHash('sha256').update(String(endpoint)).digest('hex');

function visao(c) {
  const servicoNome = (c.servico && c.servico.nome) || 'Serviço';
  const duracaoMin = Number(c.ag.duracao_min) || 30;
  return {
    salao: { nome: c.empresa.nome || '', whatsapp: normalizarWhatsapp(c.empresa.whatsapp) || null },
    agendamento: {
      data: String(c.ag.data), horario: hhmm(c.ag.horario), duracaoMin, servico: servicoNome,
      profissional: primeiroNome(c.profissional && c.profissional.nome), status: ROTULO_STATUS[c.ag.status] || 'outro',
      precoCentavos: c.cfg.mostrarPreco ? Number(c.ag.valor_centavos) || 0 : null
    },
    prazo: { cancelamentoPrazoMin: c.prazoMin, limiteIso: c.limite.toISOString() },
    remarcacoesRestantes: Math.max(0, MAX_REMARCACOES - (Number(c.acesso.remarcacoes) || 0)),
    pode: c.pode,
    push: { disponivel: canalPush().ativo() && c.empresa.lembretes_push_ativo !== false && ['agendado', 'confirmado'].includes(c.ag.status), chavePublica: canalPush().chavePublica() },
    calendario: calendarioDe(c.empresa, { data: String(c.ag.data), horario: hhmm(c.ag.horario), servico: servicoNome }, duracaoMin)
  };
}

const rotaLink = (caminho, fn) => router.post(`/meu-agendamento${caminho}`, limitarPorIp('link'), lerCorpo, async (req, res, next) => {
  try { await fn(req, res); } catch (err) { next(err); }
});

rotaLink('', async (req, res) => {
  res.json({ ok: true, data: visao(await contextoDoAcesso(req)) });
});

rotaLink('/confirmar', async (req, res) => {
  const c = await contextoDoAcesso(req);
  if (!c.pode.confirmar) throw c.ag.status === 'confirmado' ? agendamentoMudou() : foraDoPrazo();
  const agoraIso = c.agora.toISOString();
  const r = await c.repo.atualizarStatusAgendamentoSe(c.ag.id, ['agendado'], { status: 'confirmado', updated_at: agoraIso, updated_by: null });
  if (!r) throw agendamentoMudou();
  await registrarEventoAgenda(c.repo, AUTOR_CLIENTE, { agendamentoId: c.ag.id, tipo: 'status', de: 'agendado', para: 'confirmado', origem: 'link_cliente' });
  res.json({ ok: true, data: visao(await contextoDoAcesso(req)) });
});

rotaLink('/cancelar', async (req, res) => {
  const c = await contextoDoAcesso(req);
  if (!c.pode.cancelar) throw STATUS_ATIVOS.includes(c.ag.status) ? foraDoPrazo() : agendamentoMudou();
  const agoraIso = c.agora.toISOString();
  const de = c.ag.status;
  const r = await c.repo.atualizarStatusAgendamentoSe(c.ag.id, STATUS_ATIVOS, { status: 'cancelado', cancelled_by: null, updated_at: agoraIso, updated_by: null });
  if (!r) throw agendamentoMudou();
  await registrarEventoAgenda(c.repo, AUTOR_CLIENTE, { agendamentoId: c.ag.id, tipo: 'status', de, para: 'cancelado', origem: 'link_cliente' });
  res.json({ ok: true, data: visao(await contextoDoAcesso(req)) });
});

// Lembretes por push (C5): o cliente liga ou desliga no próprio aparelho. A assinatura fica presa
// ao link pessoal (acesso). Só endereços de servidores de push conhecidos são aceitos (SSRF).
rotaLink('/push', async (req, res) => {
  const c = await contextoDoAcesso(req, ['acao', 'assinatura', 'endpoint']);
  const { acao } = req.body;
  if (acao === 'assinar') {
    if (!canalPush().ativo() || c.empresa.lembretes_push_ativo === false) throw erroPublico('PUSH_INDISPONIVEL', 422, 'Os lembretes por notificação não estão disponíveis.');
    if (!['agendado', 'confirmado'].includes(c.ag.status)) throw agendamentoMudou();
    const a = validarAssinatura(req.body.assinatura);
    if (!a) throw dadosInvalidos();
    const hash = hashEndpoint(a.endpoint);
    const agoraIso = c.agora.toISOString();
    const existentes = (await c.repo.list('agendamento_push', { empresa_id: c.repo.empresaId, acesso_id: c.acesso.id })).filter(p => !p.revogado_em);
    const dele = existentes.find(p => p.endpoint_hash === hash);
    if (!dele) {
      if (existentes.length >= MAX_PUSH_POR_LINK) throw erroPublico('LIMITE_APARELHOS', 422, 'Limite de aparelhos com lembrete neste link.');
      try {
        await c.repo.insert('agendamento_push', { acesso_id: c.acesso.id, endpoint_hash: hash, assinatura: a, falhas: 0, created_at: agoraIso, updated_at: agoraIso });
      } catch (err) {
        // O mesmo aparelho já ligado em outro link: a assinatura passa a valer para este.
        if (err && err.code === '23505') {
          const outra = (await new SupabaseRepository(null).list('agendamento_push', { endpoint_hash: hash }))[0];
          if (!outra || String(outra.empresa_id) !== String(c.repo.empresaId)) throw dadosInvalidos();
          await c.repo.updateScoped('agendamento_push', outra.id, { acesso_id: c.acesso.id, assinatura: a, revogado_em: null, falhas: 0, created_at: agoraIso, updated_at: agoraIso });
        } else throw err;
      }
    }
    return res.json({ ok: true, data: { ativo: true } });
  }
  if (acao === 'cancelar') {
    const e = req.body.endpoint;
    if (typeof e !== 'string' || e.length > 600) throw dadosInvalidos();
    const hash = hashEndpoint(e);
    const doLink = (await c.repo.list('agendamento_push', { empresa_id: c.repo.empresaId, acesso_id: c.acesso.id })).filter(p => !p.revogado_em && p.endpoint_hash === hash);
    for (const p of doLink) await c.repo.updateScoped('agendamento_push', p.id, { revogado_em: c.agora.toISOString(), updated_at: c.agora.toISOString() });
    return res.json({ ok: true, data: { ativo: false } });
  }
  throw dadosInvalidos();
});

// Remarcação: mesmo serviço e mesmo profissional, regras do link público do salão (antecedência,
// janela, disponibilidade), mesma duração e preço já marcados. No máximo MAX_REMARCACOES por link.
async function slotsDaRemarcacao(c, data) {
  if (!dataValida(data)) throw dadosInvalidos();
  if (!c.pode.remarcar) throw foraDoPrazo();
  const cat = await carregarCatalogo(c.repo);
  const oferta = cat.ofertas.find(o => o.servico.id === c.ag.servico_id);
  const profissional = oferta && oferta.profissionais.find(p => p.id === c.ag.profissional_id);
  if (!profissional) throw foraDoPrazo();
  const lim = limiteDoServico(cat, oferta.servico, limitesDoMomento(cat.cfg));
  if (c.ag.cliente_id && cat.empresa.agenda_intervalo_min_dias > 0) {
    const historico = await c.repo.list('agendamentos', { empresa_id: c.repo.empresaId, cliente_id: c.ag.cliente_id });
    if (violaIntervaloOnline({ empresa: cat.empresa, servicoId: c.ag.servico_id, data, historico: historico.filter(a => a.id !== c.ag.id) })) {
      return { slots: [], lim };
    }
  }
  const r = await slotsDoProfissional(c.repo, cat, oferta.servico, profissional, data, lim, { ignorarId: c.ag.id, duracaoFixa: Number(c.ag.duracao_min) || undefined });
  // O próprio horário não é opção de "remarcar".
  const slots = r.slots.filter(h => !(data === String(c.ag.data) && h === hhmm(c.ag.horario)));
  return { slots, lim };
}

rotaLink('/horarios', async (req, res) => {
  const c = await contextoDoAcesso(req, ['data']);
  const { slots, lim } = await slotsDaRemarcacao(c, req.body.data);
  res.json({ ok: true, data: { data: req.body.data, slots, primeiroDia: lim.minimo.data, ultimoDia: lim.ultimoDia } });
});

rotaLink('/remarcar', async (req, res) => {
  const c = await contextoDoAcesso(req, ['data', 'horario']);
  const { data, horario } = req.body;
  if (typeof horario !== 'string' || !HORA_RE.test(horario)) throw dadosInvalidos();
  const { slots } = await slotsDaRemarcacao(c, data);
  if (!slots.includes(horario)) throw horarioIndisponivel();
  let novo;
  try {
    novo = await c.repo.criarAgendamento({
      agendamento: {
        cliente_id: c.ag.cliente_id, servico_id: c.ag.servico_id, profissional_id: c.ag.profissional_id,
        data, horario, duracao_min: Number(c.ag.duracao_min) || 30, valor_centavos: Number(c.ag.valor_centavos) || 0, status: 'agendado'
      },
      permitirConflito: false, ignorarId: c.ag.id, createdBy: null
    });
  } catch (err) {
    if (err && (err.code === 'SCHEDULE_CONFLICT' || err.statusCode === 409)) throw horarioOcupado();
    throw err;
  }
  const agoraIso = c.agora.toISOString();
  const antigo = await c.repo.atualizarStatusAgendamentoSe(c.ag.id, STATUS_ATIVOS, { status: 'reagendado', updated_at: agoraIso, updated_by: null });
  if (!antigo) {
    // O original mudou no meio (a recepção cancelou ou remarcou): desfaz o novo e avisa.
    await c.repo.atualizarStatusAgendamentoSe(novo.id, ['agendado'], { status: 'cancelado', cancelled_by: null, updated_at: agoraIso, updated_by: null });
    throw agendamentoMudou();
  }
  await moverAcessos(c.repo, c.ag.id, novo, { timeZone: env.APP_TIMEZONE, contarRemarcacao: true, agora: c.agora });
  await registrarEventoAgenda(c.repo, AUTOR_CLIENTE, { agendamentoId: c.ag.id, tipo: 'reagendado', de: c.ag.status, para: 'reagendado', origem: 'link_cliente', extra: { reagendado_para: novo.id } });
  await registrarEventoAgenda(c.repo, AUTOR_CLIENTE, { agendamentoId: novo.id, tipo: 'reagendado', de: null, para: 'agendado', origem: 'link_cliente', extra: { reagendado_de: c.ag.id } });
  res.json({ ok: true, data: visao(await contextoDoAcesso(req, ['data', 'horario'])) });
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

module.exports = { MAX_REMARCACOES, MAX_PUSH_POR_LINK, publicBookingRouter: router, resetRateLimitPublico, limparCacheSlug, linksDaEnv: linksPublicos, configOnline, SLUG_RE, setRelogioParaTestes, ipTruncado, chaveNumero, erroParaLog, TIPO_EVENTO };

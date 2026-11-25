const express = require('express');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { loadDataContract } = require('../services/DataContractService');
const { getSnapshot } = require('../services/SnapshotService');
const { buildDashboard, indicadoresOperacionais, pagamentosERepassesDoPainel } = require('../services/DashboardService');
const { buildFinanceReadModel } = require('../services/FinanceReadModel');
const { previewCheckout } = require('../engines/FinanceEngine');
const { resolveCheckoutInput } = require('../engines/CheckoutInputResolver');
const { validateCheckoutPayload } = require('../validators/checkout.validator');
const { checkoutAnterior, revisaoFinanceira, comandoIdDoAgendamento, agendamentoDoCheckout, conflitoComandaDoAgendamento, AGENDAMENTO_COMANDA_JA_FECHADA } = require('../services/CheckoutReplay');
const { validateCreateAgendamentoPayload, validateStatusChangePayload, validateReagendamentoPayload, validateSlotsQuery, assertTransicaoStatus, TRANSICOES } = require('../validators/agenda.validator');
const {
  validateUUID,
  validateCreateClientePayload,
  validateUpdateClientePayload,
  validateCreateServicoPayload,
  validateUpdateServicoPayload,
  validateCreateProfissionalPayload,
  validateUpdateProfissionalPayload,
  validateCreateProdutoPayload,
  validateUpdateProdutoPayload,
  validateEstoqueAjustePayload,
  validateCreateFormaPagamentoPayload,
  validateUpdateFormaPagamentoPayload,
  validateProfissionalServicosPayload,
  validateProfissionalServicoOverridePayload,
  validateCreateListaEsperaPayload,
  validateUpdateListaEsperaPayload
} = require('../validators/cadastros.validator');
const { buildSlotsDoDia, resolveDuracaoMin, agoraNoFuso, aplicarPolitica } = require('../engines/SlotEngine');
const { disponibilidadeDoDia, cabe } = require('../engines/DisponibilidadeEngine');
const { timeToMinutes } = require('../engines/ScheduleEngine');
const { compativeis: esperaCompativel } = require('../engines/ListaEsperaEngine');

// Disponibilidade confirmada no servidor ao criar, remarcar ou esticar um atendimento (D-033).
// Fora dela, só quem tem agenda:encaixar e pede "forçar" (foraDaDisponibilidade), com registro.
// Empresa sem nenhuma regra da unidade ainda não configurou horários: comportamento anterior.
async function assertDentroDaDisponibilidade(req, repo, { profissional, data, horario, duracaoMin, forcar }) {
  const disp = await repo.carregarDisponibilidade();
  if (!disp) return { forcado: false };
  // Só uma empresa que nunca configurou nada (nenhuma regra nem exceção) fica com o comportamento
  // anterior. Zerar o horário da unidade não desliga a checagem (Red Team D-033).
  if (!disp.semanal.length && !disp.excecoes.length) return { forcado: false };
  const d = disponibilidadeDoDia({ data, semanal: disp.semanal, excecoes: disp.excecoes, profissional });
  if (cabe(d.periodos, timeToMinutes(String(horario).slice(0, 5)), Number(duracaoMin) || 30)) return { forcado: false };
  if (!forcar) {
    throw createAppError('FORA_DA_DISPONIBILIDADE', `Fora da disponibilidade: ${d.origem}.`, 409, { codigo: d.codigo, origem: d.origem });
  }
  exigirTambem(req, 'agenda:encaixar');
  return { forcado: true, origem: d.origem };
}
// Escala e reserva ao mesmo tempo (D-055): a disponibilidade é lida antes de gravar e o banco não
// tem trava comum entre escala e agendamento. Depois de gravar, confere de novo; se a escala mudou
// no meio (ex.: um bloqueio entrou), a reserva recém-criada é desfeita e quem agendava recebe 409.
// Reduz a janela, não a fecha: a garantia completa precisa de trava no banco (proposta 026, D-055).
async function escalaMudouDepois(repo, { profissional, data, horario, duracaoMin }) {
  const disp = await repo.carregarDisponibilidade();
  if (!disp || (!disp.semanal.length && !disp.excecoes.length)) return null;
  const d = disponibilidadeDoDia({ data, semanal: disp.semanal, excecoes: disp.excecoes, profissional });
  return cabe(d.periodos, timeToMinutes(String(horario).slice(0, 5)), Number(duracaoMin) || 30) ? null : d.origem;
}
const { montarLembretes, normalizarWhatsapp } = require('../engines/ReminderEngine');
const { env } = require('../config/env');
const { createAppError } = require('../errors');
const { InsightsService } = require('../services/InsightsService');
const { RetentionService } = require('../services/RetentionService');

const { authorize, assertOwn, authorizePor, exigirTambem, pode, assertNaoProprioDinheiro } = require('../auth/rbac');
const { assertRefsDaEmpresa } = require('./estrutura');
const { computeCotaParte } = require('../engines/insights/cotaParte');
const { autoriaDe } = require('../middleware/auth');
const { registrarEventoAgenda, montarHistorico } = require('../services/AgendaEventosService');
const { marcadoresDoDia, pagosDoDia } = require('../engines/MarcadoresAgendaEngine');
const { validateEstornoPayload } = require('../validators/estorno.validator');
const { saldoDaComanda, diasEntre, PRAZO_DIAS } = require('../engines/EstornoEngine');
const clock = require('../config/clock');
const { avisosRecepcao } = require('../engines/AgendaPoliticaEngine');
const { criarAcesso, moverAcessos } = require('../services/AcessoAgendamento');

const router = express.Router();

// Autoria nunca vem do cliente (ADR-005): recusa explícita em qualquer escrita.
const AUTHORSHIP_FIELDS = ['actor_id', 'actorId', 'actor_integration_id', 'integration_id', 'integrationId',
  'created_by', 'createdBy', 'updated_by', 'updatedBy', 'cancelled_by', 'cancelledBy'];
router.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && typeof req.body === 'object') {
    const field = AUTHORSHIP_FIELDS.find(f => Object.prototype.hasOwnProperty.call(req.body, f));
    if (field) return next(createAppError('FORBIDDEN_FIELD', `Campo proibido no payload: ${field}`, 422, { field }));
  }
  next();
});

// Cobertura do plano de assinatura nos itens marcados (D-043): ajusta o preço no servidor e devolve
// os usos a gravar. Data e hora = agora no fuso da empresa.
// Comanda vinda de um agendamento: vale o dia e a hora DO AGENDAMENTO (lidos do banco), como o selo
// da agenda. Antes valia o dia do fechamento: agendamento de terça fechado na segunda caía fora do
// plano de 3ª a 5ª (achado do dono, 2026-11-16). Comanda avulsa: agora.
async function coberturaDaComanda(req, repo, payload, resolved, vinculo = null) {
  const { aplicarAssinaturas } = require('../services/AssinaturaCheckout');
  const agora = agoraNoFuso(env.APP_TIMEZONE, clock.agora());
  let dia = agora.data;
  let horario = `${String(Math.floor(agora.minuto / 60)).padStart(2, '0')}:${String(agora.minuto % 60).padStart(2, '0')}`;
  if (vinculo && vinculo.ag && vinculo.ag.data && vinculo.ag.horario) {
    dia = String(vinculo.ag.data).slice(0, 10);
    horario = String(vinculo.ag.horario).slice(0, 5);
  }
  return aplicarAssinaturas({ repo, auth: req.auth, actorId: autoriaDe(req.auth).actorId || null, payload, resolved, dia, horario });
}

async function buildServerResolvedCheckout(repo, payload) {
  const context = await repo.loadCheckoutContext();
  return resolveCheckoutInput({ payload, ...context });
}

async function requireActiveEntity(repo, table, id, label, notFoundCode) {
  const rows = await repo.list(table, { id, empresa_id: repo.empresaId });
  const row = rows[0];
  if (!row) throw createAppError(notFoundCode, `${label} não encontrado: ${id}`, 422, { id });
  if (row.ativo === false) throw createAppError(notFoundCode.replace('_NOT_FOUND', '_INACTIVE'), `${label} inativo: ${id}`, 422, { id });
  return row;
}

// Escopo "Próprio" no checkout: toda linha de serviço precisa ser do profissional
// do usuário, e produto só pode ser atribuído a ele (ou a ninguém).
function assertOwnCheckout(req, body) {
  if (!req.authz || !req.authz.own) return;
  const itens = Array.isArray(body && body.itens) ? body.itens : [];
  const servicos = itens.filter(i => (i.tipo || i.type) === 'servico');
  if (!servicos.length) throw createAppError('NOT_OWN_RESOURCE', 'Comanda sem atendimento do próprio profissional.', 403);
  for (const item of itens) {
    const prof = item.profissionalId || item.profissional_id || null;
    const tipo = item.tipo || item.type;
    if (tipo === 'servico' || prof) assertOwn(req, prof);
  }
}

async function requireScopedEntity(repo, table, id, label, notFoundCode) {
  const row = await repo.getByIdScoped(table, id);
  if (!row) throw createAppError(notFoundCode, `${label} não encontrado: ${id}`, 404, { id });
  return row;
}

function assertProdutoEconomics(produto) {
  if (produto.ativo !== false && Number(produto.preco_venda_centavos || 0) < Number(produto.custo_centavos || 0)) {
    throw createAppError('PRODUCT_BELOW_COST', 'Produto ativo nao pode vender abaixo do custo.', 422, {
      custoCentavos: produto.custo_centavos,
      precoVendaCentavos: produto.preco_venda_centavos
    });
  }
}

router.get('/data-contract', authorize('cadastros:ver'), (req, res) => {
  res.json({ ok: true, data: loadDataContract() });
});

router.get('/snapshot', authorize('painel:financeiro'), async (req, res, next) => {
  try { res.json({ ok: true, data: await getSnapshot(req.auth.empresa_id) }); }
  catch (err) { next(err); }
});

router.get('/dashboard', authorize('painel:operacional'), async (req, res, next) => {
  try {
    if (!pode(req.auth, 'painel:financeiro')) {
      const repo = new SupabaseRepository(req.auth.empresa_id);
      const agenda = await repo.list('agendamentos', { empresa_id: repo.empresaId }, { campos: 'status', ordem: 'id' });
      return res.json({ ok: true, data: { kpis: indicadoresOperacionais(agenda) } });
    }
    if (req.query.visao === 'painel') {
      const repo = new SupabaseRepository(req.auth.empresa_id);
      return res.json({ ok: true, data: await pagamentosERepassesDoPainel(repo) });
    }
    res.json({ ok: true, data: buildDashboard(await getSnapshot(req.auth.empresa_id)) });
  } catch (err) { next(err); }
});

router.get('/financeiro/resumo', authorize('painel:financeiro'), async (req, res, next) => {
  try { res.json({ ok: true, data: buildFinanceReadModel(await getSnapshot(req.auth.empresa_id)) }); }
  catch (err) { next(err); }
});

// Contato e observações do cliente são dado pessoal (D-032, decisão de 2026-11-15): quem não
// tem clientes:contato (o profissional) recebe só o nome, para agendar e fechar comanda.
const semContato = c => ({ id: c.id, nome: c.nome, ativo: c.ativo });
const clientesVisiveis = (req, lista) => (pode(req.auth, 'clientes:contato') ? lista : lista.map(semContato));

router.get('/clientes', authorize('clientes:ver'), async (req, res, next) => {
  try { res.json({ ok: true, data: clientesVisiveis(req, await new SupabaseRepository(req.auth.empresa_id).list('clientes', { empresa_id: req.auth.empresa_id })) }); }
  catch (err) { next(err); }
});

// Cadastro de cliente novo (inclusive o rápido, do novo agendamento). Editar um cliente que
// já existe continua com clientes:editar.
router.post('/clientes', authorize('clientes:criar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    let payload = validateCreateClientePayload(req.body);
    // Cadastro rápido (quem não edita clientes, ex.: profissional): só nome e WhatsApp, cliente
    // ativo e sem faltas; número já cadastrado é recusado, para não duplicar nem bloquear o
    // agendamento online daquele número (Red Team D-032, 2ª passada).
    if (!pode(req.auth, 'clientes:editar')) {
      const numero = payload.whatsapp ? normalizarWhatsapp(payload.whatsapp) : null;
      if (numero) {
        const existentes = await repo.list('clientes', { empresa_id: repo.empresaId });
        if (existentes.some(c => normalizarWhatsapp(c.whatsapp || c.telefone) === numero)) {
          throw createAppError('CLIENT_EXISTS', 'Já existe cliente com este WhatsApp. Procure pelo nome ao agendar.', 409);
        }
      }
      payload = { nome: payload.nome, ...(payload.whatsapp ? { whatsapp: payload.whatsapp } : {}), faltas: 0, ativo: true, ...(payload.updated_at ? { updated_at: payload.updated_at } : {}) };
    }
    const { actorId } = autoriaDe(req.auth);
    const criado = await repo.insertScoped('clientes', { ...payload, created_by: actorId });
    res.status(201).json({ ok: true, data: pode(req.auth, 'clientes:contato') ? criado : { ...semContato(criado), whatsapp: criado.whatsapp || null } });
  } catch (err) { next(err); }
});

router.patch('/clientes/:id', authorize('clientes:editar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    await requireScopedEntity(repo, 'clientes', id, 'Cliente', 'CLIENT_NOT_FOUND');
    const payload = validateUpdateClientePayload(req.body);
    const { actorId } = autoriaDe(req.auth);
    res.json({ ok: true, data: await repo.updateScoped('clientes', id, { ...payload, updated_by: actorId }) });
  } catch (err) { next(err); }
});

router.get('/servicos', authorize('cadastros:ver'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    res.json({ ok: true, data: await repo.list('servicos', { empresa_id: repo.empresaId }) });
  }
  catch (err) { next(err); }
});

router.post('/servicos', authorize('catalogo:editar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const payload = validateCreateServicoPayload(req.body);
    await assertRefsDaEmpresa(repo, payload);
    res.status(201).json({ ok: true, data: await repo.insertScoped('servicos', payload) });
  } catch (err) { next(err); }
});

router.patch('/servicos/:id', authorize('catalogo:editar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    await requireScopedEntity(repo, 'servicos', id, 'Serviço', 'SERVICE_NOT_FOUND');
    const payload = validateUpdateServicoPayload(req.body);
    await assertRefsDaEmpresa(repo, payload);
    res.json({ ok: true, data: await repo.updateScoped('servicos', id, payload) });
  } catch (err) { next(err); }
});

router.get('/profissionais', authorize('cadastros:ver'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    res.json({ ok: true, data: await repo.list('profissionais', { empresa_id: repo.empresaId }) });
  }
  catch (err) { next(err); }
});

router.post('/profissionais', authorize('catalogo:editar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const payload = validateCreateProfissionalPayload(req.body);
    await assertRefsDaEmpresa(repo, payload);
    res.status(201).json({ ok: true, data: await repo.insertScoped('profissionais', payload) });
  } catch (err) { next(err); }
});

router.patch('/profissionais/:id', authorize('catalogo:editar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    await requireScopedEntity(repo, 'profissionais', id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    assertNaoProprioDinheiro(req, [id]);
    const payload = validateUpdateProfissionalPayload(req.body);
    await assertRefsDaEmpresa(repo, payload);
    res.json({ ok: true, data: await repo.updateScoped('profissionais', id, payload) });
  } catch (err) { next(err); }
});

router.get('/produtos', authorize('cadastros:ver'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    res.json({ ok: true, data: await repo.list('produtos', { empresa_id: repo.empresaId }) });
  }
  catch (err) { next(err); }
});

router.post('/produtos', authorize('catalogo:editar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const { produto, estoqueInicial } = validateCreateProdutoPayload(req.body);
    const data = await repo.createProdutoComEstoque({
      produto,
      estoqueInicial,
      motivo: 'Estoque inicial do cadastro de produto'
    }, autoriaDe(req.auth));
    res.status(201).json({ ok: true, data });
  } catch (err) { next(err); }
});

router.patch('/produtos/:id', authorize('catalogo:editar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    const existing = await requireScopedEntity(repo, 'produtos', id, 'Produto', 'PRODUCT_NOT_FOUND');
    const payload = validateUpdateProdutoPayload(req.body);
    const merged = { ...existing, ...payload };
    assertProdutoEconomics(merged);
    let data;
    try {
      data = await repo.updateScoped('produtos', id, payload);
    } catch (dbErr) {
      if (dbErr && dbErr.code === '23514') {
        throw createAppError('PRODUCT_BELOW_COST', 'Produto ativo nao pode vender abaixo do custo.', 422, { produtoId: id });
      }
      throw dbErr;
    }
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.post('/produtos/:id/estoque/ajuste', authorize('estoque:ajustar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    await requireScopedEntity(repo, 'produtos', id, 'Produto', 'PRODUCT_NOT_FOUND');
    const payload = validateEstoqueAjustePayload(req.body);
    res.status(201).json({ ok: true, data: await repo.adjustProdutoEstoque(id, payload, autoriaDe(req.auth)) });
  } catch (err) { next(err); }
});

router.get('/formas-pagamento', authorize('cadastros:ver'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    res.json({ ok: true, data: await repo.list('formas_pagamento', { empresa_id: repo.empresaId }) });
  }
  catch (err) { next(err); }
});

// Calculadora da taxa efetiva do parcelado (MDR + antecipação pro rata). Só ajuda a
// preencher a taxa da forma de pagamento; não grava nada.
router.get('/formas-pagamento/simular-taxa', authorize('pagamentos:editar'), (req, res, next) => {
  try {
    const num = (campo, padrao) => (req.query[campo] === undefined || req.query[campo] === '' ? padrao : Number(String(req.query[campo]).replace(',', '.')));
    const { calcularTaxaEfetiva } = require('../engines/taxaEfetiva');
    try {
      res.json({ ok: true, data: calcularTaxaEfetiva({ mdrPct: num('mdrPct', NaN), antecipacaoMesPct: num('antecipacaoMesPct', 0), parcelas: num('parcelas', 1) }) });
    } catch (err) {
      if (err instanceof RangeError) throw createAppError('INVALID_FIELD', err.message, 422);
      throw err;
    }
  } catch (err) { next(err); }
});

// Cria (ou atualiza a taxa de) "Crédito 2x" … "Crédito Nx" de uma vez. Sem `gravar: true`
// só devolve a prévia. Forma que já existe mantém nome e situação (ativa ou não); muda só
// a taxa e o prazo. Comandas já fechadas não mudam: a taxa fica gravada em cada pagamento.
router.post('/formas-pagamento/parcelados', authorize('pagamentos:editar'), async (req, res, next) => {
  try {
    const b = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const permitidos = ['mdrAte6Pct', 'mdr7a12Pct', 'antecipacaoMesPct', 'ateParcelas', 'gravar'];
    for (const k of Object.keys(b)) if (!permitidos.includes(k)) throw createAppError('INVALID_FIELD', `Campo desconhecido: ${k}.`, 422, { field: k });
    if (b.gravar !== undefined && typeof b.gravar !== 'boolean') throw createAppError('INVALID_FIELD', 'gravar deve ser true ou false.', 422, { field: 'gravar' });
    const { gerarParcelados } = require('../engines/taxaEfetiva');
    let formas;
    try {
      formas = gerarParcelados({ mdrAte6Pct: b.mdrAte6Pct, mdr7a12Pct: b.mdr7a12Pct, antecipacaoMesPct: b.antecipacaoMesPct === undefined ? 0 : b.antecipacaoMesPct, ateParcelas: b.ateParcelas === undefined ? 12 : b.ateParcelas });
    } catch (err) {
      if (err instanceof RangeError) throw createAppError('INVALID_FIELD', err.message, 422);
      throw err;
    }
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const atuais = new Map((await repo.list('formas_pagamento', { empresa_id: repo.empresaId })).map(f => [f.code, f]));
    const linhas = formas.map(f => ({ ...f, jaExiste: atuais.has(f.code), taxaAtualPct: atuais.has(f.code) ? Number(atuais.get(f.code).taxa_pct) : null }));
    if (b.gravar !== true) return res.json({ ok: true, data: { gravado: false, formas: linhas } });
    let criadas = 0; let atualizadas = 0;
    for (const f of linhas) {
      if (f.jaExiste) { await repo.updateFormaPagamento(f.code, { taxa_pct: f.taxaPct, dias_recebimento: f.diasRecebimento }); atualizadas++; }
      else { await repo.createFormaPagamento({ code: f.code, label: f.label, icon: null, taxa_pct: f.taxaPct, taxa_fixa_centavos: 0, dias_recebimento: f.diasRecebimento, ativo: true }); criadas++; }
    }
    res.status(criadas ? 201 : 200).json({ ok: true, data: { gravado: true, criadas, atualizadas, formas: linhas } });
  } catch (err) { next(err); }
});

router.post('/formas-pagamento', authorize('pagamentos:editar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const payload = validateCreateFormaPagamentoPayload(req.body);
    const existing = await repo.list('formas_pagamento', { empresa_id: repo.empresaId, code: payload.code });
    if (existing[0]) {
      throw createAppError('PAYMENT_METHOD_ALREADY_EXISTS', `Forma de pagamento ja existe: ${payload.code}. Use PATCH /formas-pagamento/${payload.code} para editar.`, 409, { code: payload.code });
    }
    res.status(201).json({ ok: true, data: await repo.createFormaPagamento(payload) });
  } catch (err) { next(err); }
});

router.patch('/formas-pagamento/:code', authorize('pagamentos:editar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const existing = await repo.list('formas_pagamento', { empresa_id: repo.empresaId, code: req.params.code });
    if (!existing[0]) throw createAppError('PAYMENT_METHOD_NOT_FOUND', `Forma de pagamento não encontrada: ${req.params.code}`, 404, { code: req.params.code });
    const payload = validateUpdateFormaPagamentoPayload(req.body);
    res.json({ ok: true, data: await repo.updateFormaPagamento(req.params.code, payload) });
  } catch (err) { next(err); }
});

router.get('/profissionais/:id/servicos', authorize('cadastros:ver'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    await requireScopedEntity(repo, 'profissionais', id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    res.json({ ok: true, data: await repo.list('profissional_servicos', { empresa_id: repo.empresaId, profissional_id: id }) });
  } catch (err) { next(err); }
});

router.put('/profissionais/:id/servicos', authorize('catalogo:editar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    const profissional = await requireActiveEntity(repo, 'profissionais', id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    assertNaoProprioDinheiro(req, [id]);
    const { servicoIds } = validateProfissionalServicosPayload(req.body);
    for (const servicoId of servicoIds) {
      await requireActiveEntity(repo, 'servicos', servicoId, 'Serviço', 'SERVICE_NOT_FOUND');
    }
    const data = await repo.replaceProfissionalServicos(profissional.id, servicoIds);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.patch('/profissionais/:id/servicos/:servicoId/override', authorize('catalogo:editar'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    const servicoId = validateUUID(req.params.servicoId, 'servicoId');
    await requireActiveEntity(repo, 'profissionais', id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    assertNaoProprioDinheiro(req, [id]);
    await requireActiveEntity(repo, 'servicos', servicoId, 'Serviço', 'SERVICE_NOT_FOUND');
    const links = await repo.list('profissional_servicos', {
      empresa_id: repo.empresaId,
      profissional_id: id,
      servico_id: servicoId
    });
    if (!links[0]) {
      throw createAppError('SERVICE_NOT_ALLOWED_FOR_PROFESSIONAL', 'Serviço não vinculado ao profissional.', 422, {
        profissionalId: id,
        servicoId: servicoId
      });
    }
    const payload = validateProfissionalServicoOverridePayload(req.body);
    res.json({ ok: true, data: await repo.setProfissionalServicoOverride(id, servicoId, payload) });
  } catch (err) { next(err); }
});

// Lê, por lista de ids e em lotes de 100, só o que os ícones do card precisam (D-077).
async function emLotes(ids, ler) {
  const saida = [];
  for (let i = 0; i < ids.length; i += 100) saida.push(...await ler(ids.slice(i, i + 100)));
  return saida;
}
async function marcadoresDaAgenda(repo, agendamentos, verAssinatura) {
  const clienteIds = [...new Set(agendamentos.map(a => a.cliente_id).filter(Boolean))];
  const agendamentoIds = agendamentos.map(a => a.id);
  const f = { empresa_id: repo.empresaId };
  const [empresas, historico, comandas, eventos, assinaturas] = await Promise.all([
    repo.list('empresas', { id: repo.empresaId }, { campos: 'id,regua_alerta_faltas,regua_sinal_faltas' }),
    emLotes(clienteIds, l => repo.list('agendamentos', f, { clienteIds: l, campos: 'id,cliente_id,data,horario,status' })),
    emLotes(clienteIds, l => repo.list('comandos', f, { clienteIds: l, campos: 'id,cliente_id,data,status' })),
    emLotes(agendamentoIds, l => repo.list('agendamento_eventos', f, { agendamentoIds: l, campos: 'agendamento_id,tipo,payload' })),
    verAssinatura ? emLotes(clienteIds, l => repo.list('assinaturas', f, { clienteIds: l })) : []
  ]);
  const assinaturaIds = new Set(assinaturas.map(a => a.id));
  const [planos, cobrancas] = assinaturas.length ? await Promise.all([
    repo.list('assinatura_planos', f),
    repo.list('assinatura_cobrancas', f).then(r => r.filter(c => assinaturaIds.has(c.assinatura_id)))
  ]) : [[], []];
  return {
    marcadores: marcadoresDoDia({
      agendamentos, historico, comandas, eventos, assinaturas, planos, cobrancas,
      empresa: empresas[0] || {}, hoje: agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data, verAssinatura
    }),
    pagos: pagosDoDia({ agendamentos, eventos })
  };
}

router.get('/agenda', authorize('agenda:ver'), async (req, res, next) => {
  try {
    const filters = { empresa_id: req.auth.empresa_id };
    if (req.query.data) filters.data = req.query.data;
    if (req.authz.own) filters.profissional_id = req.authz.profissionalId;
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const lista = await repo.list('agendamentos', filters);
    // Observações (texto livre, pode ter contato do cliente) dos horários de colegas só para
    // quem vê contato de clientes; as do próprio profissional continuam (Red Team D-032).
    const proprio = req.auth.profissional_id || null;
    let data = pode(req.auth, 'clientes:contato') ? lista : lista.map(a => (a.profissional_id === proprio ? a : { ...a, observacoes: undefined }));
    // Ícones do card (D-077): só a pedido da tela e só com o dia informado, para não pesar
    // em quem lê a agenda inteira. Assinatura só para quem pode ver assinaturas.
    if (req.query.marcadores === '1' && req.query.data && data.length) {
      const { marcadores, pagos } = await marcadoresDaAgenda(repo, data, pode(req.auth, 'assinatura:ver'));
      data = data.map(a => ({ ...a, marcadores: marcadores[a.id] || [], pago: pagos.has(a.id) }));
    }
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

// Lembretes de confirmação (D-011): agendamentos ainda não confirmados do dia
// (padrão: amanhã no fuso da empresa) com texto e link wa.me. Só leitura.
router.get('/agenda/lembretes', authorize('agenda:ver'), async (req, res, next) => {
  try {
    let data = req.query.data;
    if (data === undefined) {
      const hoje = agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
      const [y, m, d] = hoje.split('-').map(Number);
      data = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data)) || Number.isNaN(Date.parse(`${data}T00:00:00Z`))) {
      throw createAppError('INVALID_DATE', 'data deve estar no formato AAAA-MM-DD.', 422);
    }
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const filtroAgenda = { empresa_id: repo.empresaId, data };
    // WhatsApp do cliente só para recepção e gestão (decisão de 2026-11-15). Sem
    // agenda:lembretes, a pessoa vê só os próprios horários a confirmar, sem contato.
    const porWhatsapp = pode(req.auth, 'agenda:lembretes');
    if (!porWhatsapp && !req.auth.profissional_id) throw createAppError('INSUFFICIENT_ROLE', 'Sem permissão para esta ação.', 403, { action: 'agenda:lembretes' });
    if (req.authz.own || !porWhatsapp) filtroAgenda.profissional_id = req.authz.profissionalId || req.auth.profissional_id;
    const [empresas, agendamentos, clientes, servicos, profissionais] = await Promise.all([
      repo.list('empresas', { id: repo.empresaId }),
      repo.list('agendamentos', filtroAgenda),
      repo.list('clientes', { empresa_id: repo.empresaId }),
      repo.list('servicos', { empresa_id: repo.empresaId }),
      repo.list('profissionais', { empresa_id: repo.empresaId })
    ]);
    const r = montarLembretes({ data, agendamentos, clientes, servicos, profissionais, empresa: empresas[0] });
    if (!porWhatsapp) {
      r.itens = r.itens.map(({ texto, link, motivo, ...i }) => ({ ...i, link: null, motivo: null }));
      r.comLink = 0;
    }
    res.json({ ok: true, data: { ...r, whatsapp: porWhatsapp } });
  } catch (err) { next(err); }
});

// Sugestão de horários livres (slots-âncora). Somente leitura: o POST /agenda
// continua revalidando conflito na gravação.
router.get('/agenda/slots', authorize('agenda:ver'), async (req, res, next) => {
  try {
    const query = validateSlotsQuery(req.query);
    assertOwn(req, query.profissionalId);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const [profissional, servico] = await Promise.all([
      requireActiveEntity(repo, 'profissionais', query.profissionalId, 'Profissional', 'PROFESSIONAL_NOT_FOUND'),
      requireActiveEntity(repo, 'servicos', query.servicoId, 'Serviço', 'SERVICE_NOT_FOUND')
    ]);
    const [empresa, servicos, agendamentos] = await Promise.all([
      repo.empresaComDisponibilidade(),
      repo.list('servicos', { empresa_id: repo.empresaId }),
      repo.list('agendamentos', { empresa_id: repo.empresaId, profissional_id: profissional.id, data: query.data })
    ]);
    const result = buildSlotsDoDia({
      data: query.data,
      profissional,
      empresa: empresa || {},
      servico,
      servicosAtivos: servicos.filter(s => s.ativo !== false),
      agendamentos,
      duracaoMin: query.duracaoMin,
      agora: agoraNoFuso(env.APP_TIMEZONE, clock.agora())
    });
    // Política de sugestão (D-054): marca `sugerido`; a recepção ainda vê e escolhe qualquer livre.
    res.json({ ok: true, data: { ...result, slots: aplicarPolitica(result.slots, result.politica, 'recepcao'), profissionalId: profissional.id, servicoId: servico.id } });
  } catch (err) { next(err); }
});

router.post('/agenda', authorize('agenda:criar'), async (req, res, next) => {
  try {
    const payload = validateCreateAgendamentoPayload(req.body);
    // Encaixe (horário já ocupado) é permissão própria (D-032).
    if (payload.permitirConflito) exigirTambem(req, 'agenda:encaixar');
    assertOwn(req, payload.profissionalId);
    const { actorId } = autoriaDe(req.auth);
    const repo = new SupabaseRepository(req.auth.empresa_id);

    if (payload.clienteId) await requireActiveEntity(repo, 'clientes', payload.clienteId, 'Cliente', 'CLIENT_NOT_FOUND');
    const servico = await requireActiveEntity(repo, 'servicos', payload.servicoId, 'Serviço', 'SERVICE_NOT_FOUND');
    const profissional = await requireActiveEntity(repo, 'profissionais', payload.profissionalId, 'Profissional', 'PROFESSIONAL_NOT_FOUND');

    // Mesma regra do GET /agenda/slots: override do profissional > serviço > 30.
    const duracaoMin = resolveDuracaoMin({ servico, profissional, duracaoMin: payload.duracaoMin });
    // Versão da escala ANTES de conferir (D-058): se mudar até a gravação, o banco recusa (026).
    const dispVersao = await repo.versaoDisponibilidade().catch(() => null);
    const fora = await assertDentroDaDisponibilidade(req, repo, { profissional, data: payload.data, horario: payload.horario, duracaoMin, forcar: payload.foraDaDisponibilidade });
    const avisos = await avisosDaAgenda(repo, { clienteId: payload.clienteId, servico, data: payload.data, horario: payload.horario, aceitar: payload.aceitarAvisos });
    // Vaga dada a alguém da lista de espera (D-054/D-055): o item é da empresa, do mesmo cliente,
    // do mesmo serviço e ainda ativo. Trocou o serviço no formulário? O pedido da espera não é
    // baixado (era para outro serviço): o servidor recusa o vínculo e a tela grava sem ele.
    let itemEspera = null;
    if (payload.listaEsperaId) {
      exigirTambem(req, 'espera:gerir');
      itemEspera = await requireScopedEntity(repo, 'lista_espera', validateUUID(payload.listaEsperaId, 'listaEsperaId'), 'Item da lista de espera', 'WAITLIST_ITEM_NOT_FOUND');
      // Outro cliente: nunca baixa (quem esperava não foi agendado), com ou sem a decisão (D-060).
      if (itemEspera.cliente_id !== payload.clienteId) {
        throw createAppError('WAITLIST_MISMATCH', 'Este pedido da lista de espera é de outro cliente.', 422);
      }
      // Mesmo cliente, outro serviço: só baixa se a recepção decidiu (e isso fica no histórico).
      if (itemEspera.servico_id !== payload.servicoId && !payload.baixarEsperaOutroServico) {
        throw createAppError('WAITLIST_SERVICO_DIFERENTE', 'Este pedido da lista de espera é de outro serviço. Decida se ele sai da espera.', 422, { servicoPedidoId: itemEspera.servico_id, servicoAgendadoId: payload.servicoId });
      }
      if (!['aguardando', 'contatado'].includes(itemEspera.status)) {
        throw createAppError('WAITLIST_ALREADY_USED', 'Este pedido da lista de espera já foi resolvido.', 409);
      }
    }

    // Baixa da espera ANTES de gravar e atômica (D-055): dois pedidos ao mesmo tempo com o mesmo
    // item — só um leva; o outro recebe 409 e nada é gravado. Se a gravação falhar, o item volta.
    const statusEsperaAntes = itemEspera ? itemEspera.status : null; // guardado antes da baixa (para devolver)
    if (itemEspera) {
      const tomado = await repo.atualizarStatusSe('lista_espera', itemEspera.id, ['aguardando', 'contatado'], { status: 'agendado' });
      if (!tomado) throw createAppError('WAITLIST_ALREADY_USED', 'Este pedido da lista de espera acabou de ser usado em outro agendamento.', 409);
    }
    // Conflito checado e gravado atomicamente no banco (agendamento_criar, migration 007).
    let created;
    try {
      created = await repo.criarAgendamento({
      agendamento: {
        cliente_id: payload.clienteId,
        servico_id: payload.servicoId,
        profissional_id: payload.profissionalId,
        data: payload.data,
        horario: payload.horario,
        duracao_min: duracaoMin,
        valor_centavos: servico.valor_centavos || 0,
        status: 'agendado',
        ...(!fora.forcado && dispVersao !== null ? { disp_versao: dispVersao } : {})
      },
      permitirConflito: payload.permitirConflito,
      createdBy: actorId
    });
      if (!fora.forcado && created) {
        const mudou = await escalaMudouDepois(repo, { profissional, data: payload.data, horario: payload.horario, duracaoMin });
        if (mudou) {
          const agoraIso = clock.agora().toISOString();
          await repo.atualizarStatusAgendamentoSe(created.id, ['agendado', 'confirmado'], { status: 'cancelado', cancelled_by: actorId || null, updated_at: agoraIso, updated_by: actorId || null });
          await registrarEventoAgenda(repo, req.auth, { agendamentoId: created.id, tipo: 'status', de: 'agendado', para: 'cancelado', extra: { motivo: 'escala_mudou_durante_reserva', origem: mudou } });
          throw createAppError('ESCALA_MUDOU', `A escala mudou enquanto o horário era gravado (${mudou}). Nada ficou reservado: escolha outro horário.`, 409, { origem: mudou });
        }
      }
    } catch (err) {
      if (itemEspera) {
        // A reserva não aconteceu: devolve o pedido à espera. Se nem isso der, avisa no erro.
        try {
          const volta = await repo.atualizarStatusSe('lista_espera', itemEspera.id, ['agendado'], { status: statusEsperaAntes });
          if (!volta) throw new Error('item mudou');
        } catch (_) {
          err.details = { ...(err.details || {}), listaEspera: 'nao_devolvida' };
          console.error('[agenda] pedido da lista de espera não voltou para a espera após falha ao gravar');
        }
      }
      throw err;
    }
    // Encaixe forçado fora da disponibilidade fica registrado no próprio evento de criação.
    await registrarEventoAgenda(repo, req.auth, { agendamentoId: created && created.id, tipo: 'criado', de: null, para: (created && created.status) || 'agendado', extra: {
      ...(fora.forcado ? { fora_da_disponibilidade: fora.origem } : {}),
      ...(avisos.length ? { excecao_regras: avisos.map(a => a.codigo) } : {}),
      // D-060: pedido da espera baixado por este agendamento (e, se o serviço era outro, por decisão da recepção).
      ...(itemEspera ? { espera_baixada: { id: itemEspera.id, servico_pedido: itemEspera.servico_id, servico_agendado: payload.servicoId, outro_servico_por_decisao: itemEspera.servico_id !== payload.servicoId } } : {})
    } });

    res.status(201).json({ ok: true, data: created });
  } catch (err) { next(err); }
});

// Regras da agenda (D-049, 024): na recepção, AVISA. Sem `aceitarAvisos`, devolve 409 com a
// lista e não grava; com ele, grava e a exceção vai para o histórico do horário.
async function avisosDaAgenda(repo, { clienteId, servico, data, horario, ignorarId, aceitar }) {
  if (!clienteId) return [];
  const [[empresa], doCliente] = await Promise.all([
    repo.list('empresas', { id: repo.empresaId }),
    repo.list('agendamentos', { empresa_id: repo.empresaId, cliente_id: clienteId })
  ]);
  const hoje = agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
  const avisos = avisosRecepcao({ empresa: empresa || {}, servico, novo: { servicoId: servico && servico.id, data, horario, ignorarId }, agendamentosDoCliente: doCliente, hoje });
  if (avisos.length && !aceitar) {
    throw createAppError('REGRAS_DA_AGENDA', avisos.map(a => a.mensagem).join(' '), 409, { avisos });
  }
  return avisos;
}

// D-032: o status pedido decide a permissão — cancelar, remarcar ou atender (confirmar,
// chegada, início, conclusão, falta). Encaixe na remarcação exige agenda:encaixar também.
const permissaoDoStatus = req => {
  const status = req.body && req.body.novoStatus;
  if (status === 'cancelado') return 'agenda:cancelar';
  if (status === 'reagendado') return 'agenda:editar';
  return 'agenda:atender';
};
router.patch('/agenda/:id/status', authorizePor(permissaoDoStatus, 'agenda:atender|agenda:cancelar|agenda:editar'), async (req, res, next) => {
  try {
    const { novoStatus } = validateStatusChangePayload(req.body);
    const id = validateUUID(req.params.id, 'id');
    const { actorId } = autoriaDe(req.auth);
    const repo = new SupabaseRepository(req.auth.empresa_id);

    const original = await repo.getByIdScoped('agendamentos', id);
    if (!original) throw createAppError('AGENDAMENTO_NOT_FOUND', `Agendamento não encontrado: ${id}`, 404, { id });
    assertOwn(req, original.profissional_id);
    assertTransicaoStatus(original.status, novoStatus);
    // Capturado antes do update: o objeto lido pode ser o mesmo que o update altera.
    const statusAnterior = original.status;

    const now = new Date().toISOString();
    if (novoStatus !== 'reagendado') {
      const patch = { status: novoStatus, updated_at: now, updated_by: actorId };
      if (novoStatus === 'cancelado') patch.cancelled_by = actorId;
      const updated = await repo.updateScoped('agendamentos', original.id, patch);
      await registrarEventoAgenda(repo, req.auth, { agendamentoId: original.id, tipo: 'status', de: statusAnterior, para: novoStatus });
      return res.json({ ok: true, data: { original: updated } });
    }

    const reagendamento = validateReagendamentoPayload(req.body);
    if (reagendamento.permitirConflito) exigirTambem(req, 'agenda:encaixar');
    const novoServicoId = reagendamento.novoServicoId || original.servico_id;
    const novoProfissionalId = reagendamento.novoProfissionalId || original.profissional_id;
    assertOwn(req, novoProfissionalId);

    let servico = null;
    if (reagendamento.novoServicoId) servico = await requireActiveEntity(repo, 'servicos', novoServicoId, 'Serviço', 'SERVICE_NOT_FOUND');
    const profNovo = await requireActiveEntity(repo, 'profissionais', novoProfissionalId, 'Profissional', 'PROFESSIONAL_NOT_FOUND');

    const duracaoMinNovo = servico ? (servico.duracao_min || original.duracao_min) : original.duracao_min;
    const dispVersaoRe = await repo.versaoDisponibilidade().catch(() => null); // D-058: antes de conferir
    const foraRe = await assertDentroDaDisponibilidade(req, repo, { profissional: profNovo, data: reagendamento.novaData, horario: reagendamento.novoHorario, duracaoMin: duracaoMinNovo, forcar: reagendamento.foraDaDisponibilidade });
    // Regras da agenda só quando o dia muda (trocar serviço ou hora no mesmo dia não cria horário novo para o cliente).
    const avisosRe = reagendamento.novaData !== String(original.data).slice(0, 10)
      ? await avisosDaAgenda(repo, { clienteId: original.cliente_id, servico: servico || await repo.getByIdScoped('servicos', novoServicoId), data: reagendamento.novaData, horario: reagendamento.novoHorario, ignorarId: original.id, aceitar: reagendamento.aceitarAvisos })
      : [];

    // O original ainda está ativo neste momento: é ignorado na checagem de conflito.
    const dadosNovo = {
        cliente_id: original.cliente_id,
        servico_id: novoServicoId,
        profissional_id: novoProfissionalId,
        data: reagendamento.novaData,
        horario: reagendamento.novoHorario,
        duracao_min: duracaoMinNovo,
        valor_centavos: servico ? (servico.valor_centavos ?? original.valor_centavos) : original.valor_centavos,
        // Editar pelo card (trocar só serviço ou profissional, mesmo dia e hora) não desfaz a
        // confirmação do cliente; mudar dia ou hora volta para "agendado" (o cliente reconfirma).
        status: statusAnterior === 'confirmado' && reagendamento.novaData === String(original.data).slice(0, 10)
          && String(reagendamento.novoHorario).slice(0, 5) === String(original.horario).slice(0, 5) ? 'confirmado' : 'agendado',
        ...(!foraRe.forcado && dispVersaoRe !== null ? { disp_versao: dispVersaoRe } : {})
      };
    // 027 (D-063): novo + original "reagendado" numa transação, se o original ainda estiver como
    // foi lido (senão 409 AGENDAMENTO_MUDOU e nada é gravado). Banco sem a 027: dois passos, como antes.
    let novo; let updatedOriginal;
    const feito = await repo.remarcarAgendamento({ originalId: original.id, deStatus: [statusAnterior], agendamento: dadosNovo, permitirConflito: reagendamento.permitirConflito, createdBy: actorId });
    if (feito) { novo = feito.novo; updatedOriginal = feito.original; }
    else {
      novo = await repo.criarAgendamento({ agendamento: dadosNovo, permitirConflito: reagendamento.permitirConflito, ignorarId: original.id, createdBy: actorId });
      updatedOriginal = await repo.updateScoped('agendamentos', original.id, { status: 'reagendado', updated_at: now, updated_by: actorId });
    }
    await registrarEventoAgenda(repo, req.auth, {
      agendamentoId: original.id, tipo: 'reagendado', de: statusAnterior, para: 'reagendado',
      extra: { reagendado_para: (novo && novo.id) || null }
    });
    await registrarEventoAgenda(repo, req.auth, {
      agendamentoId: novo && novo.id, tipo: 'reagendado', de: null, para: (novo && novo.status) || 'agendado',
      origem: 'reagendamento', extra: { reagendado_de: original.id, ...(foraRe.forcado ? { fora_da_disponibilidade: foraRe.origem } : {}), ...(avisosRe.length ? { excecao_regras: avisosRe.map(a => a.codigo) } : {}) }
    });
    // O link pessoal do cliente (017) passa a mostrar o novo horário. Best-effort: sem a 017 ou
    // em falha, o cliente só perde o link (a recepção pode gerar outro).
    // Ocorrência de série (018) remarcada sozinha continua na série, no mesmo lugar da sequência.
    if (novo && original.serie_id) {
      try { await repo.updateScoped('agendamentos', novo.id, { serie_id: original.serie_id, serie_seq: original.serie_seq }); }
      catch (err) { console.error('[agenda] marcação de série não acompanhou a remarcação:', (err && err.code) || 'erro'); }
    }
    if (novo) {
      try { await moverAcessos(repo, original.id, novo, { timeZone: env.APP_TIMEZONE }); }
      catch (err) { console.error('[agenda] link pessoal não acompanhou a remarcação:', (err && err.code) || 'erro'); }
    }

    res.json({ ok: true, data: { original: updatedOriginal, novo } });
  } catch (err) { next(err); }
});

// Troca de cliente no card (D-051). Duas intenções, registros diferentes:
//   correcao       — o cliente estava errado (engano de cadastro): o original vira "reagendado"
//                    (neutro) e nada conta contra quem estava;
//   vaga_repassada — o cliente desistiu e outra pessoa assume o horário: o original vira
//                    "cancelado" com o evento "vaga_repassada", que a confiabilidade ignora
//                    (o salão não perdeu o horário: não é falta nem cancelamento tardio).
// Mesmo horário, profissional, serviço, duração e valor; gravado pelo agendamento_criar (atômico).
// O novo nasce "agendado" (quem vem é que confirma). O link pessoal do anterior NÃO acompanha
// (ele não pode ver nem remarcar um horário que não é mais dele); a série não acompanha.
// Só horário futuro, agendado ou confirmado; só quem edita a agenda de todos (não o profissional).
const MOTIVOS_TROCA = ['correcao', 'vaga_repassada'];
router.post('/agenda/:id/trocar-cliente', authorize('agenda:editar'), async (req, res, next) => {
  try {
    if (req.authz && req.authz.own) throw createAppError('INSUFFICIENT_ROLE', 'Só a recepção ou a gestão troca o cliente de um horário.', 403);
    const id = validateUUID(req.params.id, 'id');
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const clienteId = validateUUID(b.clienteId, 'clienteId');
    if (!MOTIVOS_TROCA.includes(b.motivo)) throw createAppError('INVALID_FIELD', 'motivo deve ser correcao ou vaga_repassada.', 422, { field: 'motivo' });
    const { actorId } = autoriaDe(req.auth);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const original = await repo.getByIdScoped('agendamentos', id);
    if (!original) throw createAppError('AGENDAMENTO_NOT_FOUND', `Agendamento não encontrado: ${id}`, 404, { id });
    if (!['agendado', 'confirmado'].includes(original.status)) throw createAppError('INVALID_STATUS', 'Só dá para trocar o cliente de um horário agendado ou confirmado.', 422);
    const agora = agoraNoFuso(env.APP_TIMEZONE, clock.agora());
    const dia = String(original.data).slice(0, 10); const hora = String(original.horario).slice(0, 5);
    const [h, m] = hora.split(':').map(Number);
    if (dia < agora.data || (dia === agora.data && h * 60 + m <= agora.minuto)) throw createAppError('INVALID_STATUS', 'O horário já começou ou passou: a troca não muda o que já aconteceu.', 422);
    if (original.cliente_id === clienteId) throw createAppError('INVALID_FIELD', 'É o mesmo cliente.', 422, { field: 'clienteId' });
    await requireActiveEntity(repo, 'clientes', clienteId, 'Cliente', 'CLIENT_NOT_FOUND');
    const servico = await repo.getByIdScoped('servicos', original.servico_id);
    const avisos = await avisosDaAgenda(repo, { clienteId, servico, data: dia, horario: hora, aceitar: b.aceitarAvisos === true });

    const novo = await repo.criarAgendamento({
      agendamento: {
        cliente_id: clienteId, servico_id: original.servico_id, profissional_id: original.profissional_id,
        data: dia, horario: hora, duracao_min: original.duracao_min, valor_centavos: original.valor_centavos, status: 'agendado'
      },
      ignorarId: original.id,
      createdBy: actorId
    });
    const statusOriginal = b.motivo === 'vaga_repassada' ? 'cancelado' : 'reagendado';
    const patch = { status: statusOriginal, updated_at: new Date().toISOString(), updated_by: actorId };
    if (statusOriginal === 'cancelado') patch.cancelled_by = actorId;
    await repo.updateScoped('agendamentos', original.id, patch);
    const extra = { motivo: b.motivo, cliente_de: original.cliente_id, cliente_para: clienteId, para: novo && novo.id };
    await registrarEventoAgenda(repo, req.auth, { agendamentoId: original.id, tipo: b.motivo === 'vaga_repassada' ? 'vaga_repassada' : 'cliente_corrigido', de: original.status, para: statusOriginal, extra });
    await registrarEventoAgenda(repo, req.auth, { agendamentoId: novo && novo.id, tipo: 'criado', de: null, para: 'agendado', origem: 'troca_cliente', extra: { de: original.id, motivo: b.motivo, ...(avisos.length ? { excecao_regras: avisos.map(a => a.codigo) } : {}) } });
    // Lista de espera: quem estava aguardando este serviço e ganhou o horário passa a "agendado".
    try {
      const espera = (await repo.list('lista_espera', { empresa_id: repo.empresaId, cliente_id: clienteId, servico_id: original.servico_id }))
        .filter(x => x.status === 'aguardando' || x.status === 'contatado');
      for (const x of espera) await repo.updateScoped('lista_espera', x.id, { status: 'agendado' });
    } catch (err) { console.error('[agenda] lista de espera não acompanhou a troca:', (err && err.code) || 'erro'); }
    res.json({ ok: true, data: { original: { id: original.id, status: statusOriginal }, novo } });
  } catch (err) { next(err); }
});

// Aviso de agendamento online novo para a recepção (C3, D-038). Sem migration: "visto" fica no
// aparelho (a tela manda `desde`, o instante em que alguém viu pela última vez ali). Devolve os
// agendamentos criados pelo link público desde então (até 7 dias, no máximo 50). Profissional
// só vê os próprios, como na agenda.
const TIPO_ORIGEM_ONLINE = 'origem_link_publico';
router.get('/agenda/online-novos', authorize('agenda:ver'), async (req, res, next) => {
  try {
    const agora = clock.agora();
    const minimo = new Date(agora.getTime() - 7 * 864e5);
    let desde = req.query.desde === undefined ? new Date(agora.getTime() - 864e5) : new Date(String(req.query.desde));
    if (Number.isNaN(desde.getTime())) throw createAppError('INVALID_DATE', 'desde deve ser uma data e hora ISO.', 422);
    if (desde < minimo) desde = minimo;
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const eventos = await repo.eventosAgendaDesde(TIPO_ORIGEM_ONLINE, desde.toISOString(), 100);
    const ids = [...new Set(eventos.map(e => e.agendamento_id).filter(Boolean))].slice(0, 50);
    const [agendamentos, clientes, servicos, profissionais] = await Promise.all([
      Promise.all(ids.map(id => repo.getByIdScoped('agendamentos', id))),
      repo.list('clientes', { empresa_id: repo.empresaId }),
      repo.list('servicos', { empresa_id: repo.empresaId }),
      repo.list('profissionais', { empresa_id: repo.empresaId })
    ]);
    const proprio = req.authz && req.authz.own ? (req.authz.profissionalId || req.auth.profissional_id) : null;
    const nome = (lista, id) => ((lista.find(x => x.id === id) || {}).nome) || null;
    const criadoEm = new Map(eventos.map(e => [e.agendamento_id, e.created_at]));
    const itens = agendamentos.filter(Boolean).filter(a => !proprio || a.profissional_id === proprio).map(a => ({
      agendamentoId: a.id, data: String(a.data), horario: String(a.horario).slice(0, 5), status: a.status,
      clienteNome: nome(clientes, a.cliente_id), servicoNome: nome(servicos, a.servico_id), profissionalNome: nome(profissionais, a.profissional_id),
      criadoEm: criadoEm.get(a.id) || null
    }));
    res.json({ ok: true, data: { desde: desde.toISOString(), agora: agora.toISOString(), total: itens.length, itens } });
  } catch (err) { next(err); }
});

// Link pessoal do agendamento para o cliente (017, D-038): a recepção gera ao mandar o lembrete
// por WhatsApp. Devolve o código uma única vez; o banco guarda só o hash. Só para horários ainda
// por acontecer (agendado ou confirmado).
router.post('/agenda/:id/link-cliente', authorize('agenda:lembretes'), async (req, res, next) => {
  try {
    const id = validateUUID(req.params.id, 'id');
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const ag = await requireScopedEntity(repo, 'agendamentos', id, 'Agendamento', 'AGENDAMENTO_NOT_FOUND');
    if (!['agendado', 'confirmado'].includes(ag.status)) {
      throw createAppError('AGENDAMENTO_ENCERRADO', 'Só dá para gerar o link de um horário agendado ou confirmado.', 409, { status: ag.status });
    }
    const { actorId } = autoriaDe(req.auth);
    const token = await criarAcesso(repo, ag, { origem: 'recepcao', createdBy: actorId || null, timeZone: env.APP_TIMEZONE, agora: clock.agora() });
    res.status(201).json({ ok: true, data: { token } });
  } catch (err) { next(err); }
});

// Trilha de status do agendamento (agendamento_eventos), do mais antigo ao mais
// novo. Profissional só lê os próprios. Eventos são best-effort: pode haver lacuna.
router.get('/agenda/:id/historico', authorize('agenda:ver'), async (req, res, next) => {
  try {
    const id = validateUUID(req.params.id, 'id');
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const agendamento = await requireScopedEntity(repo, 'agendamentos', id, 'Agendamento', 'AGENDAMENTO_NOT_FOUND');
    assertOwn(req, agendamento.profissional_id);
    res.json({ ok: true, data: { agendamentoId: id, statusAtual: agendamento.status, eventos: await montarHistorico(repo, id) } });
  } catch (err) { next(err); }
});

router.patch('/agenda/:id/duracao', authorize('agenda:editar'), async (req, res, next) => {
  try {
    const duracaoMin = Number(req.body && req.body.duracaoMin);
    if (!Number.isInteger(duracaoMin) || duracaoMin < 10 || duracaoMin > 480) {
      throw createAppError('INVALID_DURATION', 'Duração deve ser um inteiro entre 10 e 480 minutos.', 422);
    }
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    const agendamento = await requireScopedEntity(repo, 'agendamentos', id, 'Agendamento', 'AGENDAMENTO_NOT_FOUND');
    assertOwn(req, agendamento.profissional_id);
    const { actorId } = autoriaDe(req.auth);
    const duracaoAnterior = agendamento.duracao_min ?? null;
    let foraDur = { forcado: false };
    if (duracaoMin > Number(duracaoAnterior || 0)) {
      const prof = await requireScopedEntity(repo, 'profissionais', agendamento.profissional_id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
      foraDur = await assertDentroDaDisponibilidade(req, repo, { profissional: prof, data: agendamento.data, horario: agendamento.horario, duracaoMin, forcar: req.body && req.body.foraDaDisponibilidade === true });
    }
    const updated = await repo.updateScoped('agendamentos', id, {
      duracao_min: duracaoMin,
      updated_at: new Date().toISOString(),
      updated_by: actorId
    });
    await registrarEventoAgenda(repo, req.auth, { agendamentoId: id, tipo: 'duracao', de: duracaoAnterior, para: duracaoMin, extra: foraDur.forcado ? { fora_da_disponibilidade: foraDur.origem } : {} });
    res.json({ ok: true, data: { id: updated.id, duracaoMin: updated.duracao_min } });
  } catch (err) { next(err); }
});

router.get('/catalog', authorize('clientes:ver'), authorize('cadastros:ver'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const [clientes, servicos, produtos, profissionais, formas_pagamento, profissional_servicos] = await Promise.all([
      repo.list('clientes', { empresa_id: repo.empresaId }),
      repo.list('servicos', { empresa_id: repo.empresaId }),
      repo.list('produtos', { empresa_id: repo.empresaId }),
      repo.list('profissionais', { empresa_id: repo.empresaId }),
      repo.list('formas_pagamento', { empresa_id: repo.empresaId }),
      repo.list('profissional_servicos', { empresa_id: repo.empresaId })
    ]);
    res.json({ ok: true, data: { clientes: clientesVisiveis(req, clientes), servicos, produtos, profissionais, formas_pagamento, profissional_servicos } });
  } catch (err) { next(err); }
});

// Vínculo opcional checkout → agenda, validado ANTES de gravar a comanda: o
// checkout é a fonte de verdade financeira e não pode fechar dizendo que concluiu
// um agendamento que a máquina de estados (TRANSICOES) não deixa concluir
// (cancelado, no_show, reagendado). A retomada autenticada do mesmo fechamento
// acontece antes desta validação, sem abrir outro lançamento financeiro.
const STATUS_JA_PAGOS = ['concluido', 'fechado'];
function clienteDoCheckout(pedido) {
  return pedido.clienteId ?? pedido.cliente_id ?? null;
}
async function validarVinculoAgendamento(req, repo) {
  const bruto = req.body && req.body.agendamentoId;
  if (bruto === undefined || bruto === null || bruto === '') return null;
  const agendamentoId = validateUUID(bruto, 'agendamentoId');
  const ag = await repo.getByIdScoped('agendamentos', agendamentoId);
  if (!ag) throw createAppError('AGENDAMENTO_NOT_FOUND', `Agendamento não encontrado: ${agendamentoId}`, 404, { id: agendamentoId });
  assertOwn(req, ag.profissional_id);
  if (STATUS_JA_PAGOS.includes(ag.status) || await repo.temComandaDoAgendamento(agendamentoId)) throw conflitoComandaDoAgendamento();
  try {
    assertTransicaoStatus(ag.status, 'concluido');
  } catch (err) {
    err.message = `Agendamento ${ag.status} não pode ser concluído pelo checkout. Feche a comanda sem vínculo com a agenda.`;
    throw err;
  }
  const informouCliente = Object.hasOwn(req.body, 'clienteId') || Object.hasOwn(req.body, 'cliente_id');
  if (informouCliente && clienteDoCheckout(req.body) !== (ag.cliente_id ?? null)) {
    throw createAppError('AGENDAMENTO_CLIENTE_ALTERADO', 'O cliente do atendimento mudou. Abra o atendimento atualizado para conferir a comanda.', 409);
  }
  return { ag };
}

router.post('/checkout/preview', authorize('comanda:fechar'), async (req, res, next) => {
  try {
    assertOwnCheckout(req, req.body);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const vinculo = await validarVinculoAgendamento(req, repo);
    const payload = validateCheckoutPayload(req.body);
    const resolved = await buildServerResolvedCheckout(repo, payload);
    const cobertura = await coberturaDaComanda(req, repo, payload, resolved, vinculo);
    const preview = previewCheckout(resolved);
    // Comparativo para o balcão: a taxa de cada forma sobre o total desta comanda.
    // Fica só na resposta do preview; o fechamento recalcula tudo e não lê este campo.
    const { custoPorForma } = require('../engines/PaymentEngine');
    const comparativoFormas = custoPorForma({ totalCentavos: preview.totals.totalRecebidoCentavos, formasPagamento: resolved.formasPagamento });
    res.json({ ok: true, data: { ...preview, revisaoFinanceira: revisaoFinanceira(preview, cobertura), comparativoFormas, assinaturas: cobertura.itens } });
  } catch (err) { next(err); }
});

// Atalhos da comanda: os 4 serviços e 2 produtos mais vendidos nos últimos 90 dias.
// Leitura separada do preview e do painel; a tela chama uma vez ao abrir.
router.get('/checkout/mais-vendidos', authorize('comanda:fechar'), async (req, res, next) => {
  try {
    const { computeMaisVendidos } = require('../engines/insights/maisVendidos');
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const filtro = { empresa_id: repo.empresaId };
    const [comandos, comandoItens, servicos, produtos] = await Promise.all([
      repo.list('comandos', filtro), repo.list('comando_itens', filtro), repo.list('servicos', filtro), repo.list('produtos', filtro)
    ]);
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    res.json({ ok: true, data: computeMaisVendidos({ comandos, comandoItens, servicos, produtos, hoje }) });
  } catch (err) { next(err); }
});

// O financeiro confirmado não é refeito para reconciliar a agenda. O mesmo CAS
// atende a resposta original e a retomada depois de uma interrupção.
async function reconciliarAgendaCheckout(req, repo, autoria, agendamentoId, clienteEsperado, reparoExplicito = false) {
  if (!agendamentoId) return { agendamentoConcluido: null, vinculoAgenda: null };
  try {
    const atual = await repo.getByIdScoped('agendamentos', agendamentoId);
    if (!atual) return { agendamentoConcluido: null, vinculoAgenda: { aplicado: false, motivo: 'AGENDAMENTO_NOT_FOUND' } };
    assertOwn(req, atual.profissional_id);
    if (clienteEsperado !== (atual.cliente_id ?? null)) return { agendamentoConcluido: null, vinculoAgenda: { aplicado: false, motivo: 'AGENDAMENTO_CLIENTE_ALTERADO' } };
    const anterior = atual.status;
    if (STATUS_JA_PAGOS.includes(anterior)) return { agendamentoConcluido: atual, vinculoAgenda: { aplicado: true, jaConcluido: true } };
    if (!TRANSICOES.concluido.includes(anterior)) return { agendamentoConcluido: null, vinculoAgenda: { aplicado: false, motivo: 'INVALID_STATUS_TRANSITION', statusAtual: anterior } };
    const concluido = await repo.atualizarStatusAgendamentoSe(agendamentoId, [anterior], {
      status: 'concluido', updated_at: new Date().toISOString(), updated_by: autoria.actorId
    }, { cliente_id: atual.cliente_id ?? null, profissional_id: atual.profissional_id });
    if (!concluido) return { agendamentoConcluido: null, vinculoAgenda: { aplicado: false, motivo: 'STATUS_ALTERADO_DURANTE_FECHAMENTO' } };
    await registrarEventoAgenda(repo, req.auth, { agendamentoId, tipo: 'status', de: anterior, para: 'concluido', origem: 'checkout' });
    return { agendamentoConcluido: concluido, vinculoAgenda: { aplicado: true, jaConcluido: false } };
  } catch (error) {
    if (reparoExplicito && error.statusCode === 403) throw error;
    console.error('[checkout] falha ao reconciliar agenda', error.code || 'INTERNAL_ERROR');
    return { agendamentoConcluido: null, vinculoAgenda: { aplicado: false, motivo: 'FALHA_ATUALIZACAO' } };
  }
}

// O reparo opera somente sobre o comprovante gravado. Nenhum caminho chama a RPC financeira.
router.post('/checkout/comandas/:id/reconciliar-agenda', authorize('comanda:fechar'), async (req, res, next) => {
  try {
    const id = validateUUID(req.params.id, 'comandoId');
    const pedido = validateCheckoutPayload(req.body);
    assertOwnCheckout(req, pedido);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const anterior = await checkoutAnterior(repo, req.auth, pedido);
    const agendamentoId = agendamentoDoCheckout(pedido);
    if (!agendamentoId || anterior?.saved.comandoId !== id) {
      throw createAppError('CHECKOUT_RECEIPT_NOT_FOUND', 'Confira o comprovante da comanda vinculada a este atendimento.', 409);
    }
    const agenda = await reconciliarAgendaCheckout(req, repo, autoriaDe(req.auth), agendamentoId, clienteDoCheckout(pedido), true);
    res.json({ ok: true, data: { saved: anterior.saved, vinculoAgenda: agenda.vinculoAgenda } });
  } catch (err) { next(err); }
});

router.post('/checkout/close', authorize('comanda:fechar'), async (req, res, next) => {
  let autoria;
  let repo;
  let pedido;
  let vinculo;
  let verificouAusencia = false;
  let enviouRpc = false;

  async function confirmarFechamentoAnterior() {
    const anterior = await checkoutAnterior(repo, req.auth, pedido);
    if (!anterior) return false;
    const agenda = await reconciliarAgendaCheckout(req, repo, autoria, agendamentoDoCheckout(pedido), clienteDoCheckout(pedido));
    res.status(201).json({ ok: true, data: { ...anterior, ...agenda } });
    return true;
  }

  try {
    assertOwnCheckout(req, req.body);
    autoria = autoriaDe(req.auth);
    repo = new SupabaseRepository(req.auth.empresa_id);
    pedido = validateCheckoutPayload(req.body);
    if (await confirmarFechamentoAnterior()) return;
    verificouAusencia = true;
    vinculo = await validarVinculoAgendamento(req, repo);
    const payload = { ...pedido };
    if (vinculo) {
      payload.agendamentoId = vinculo.ag.id;
      payload.id = comandoIdDoAgendamento(repo.empresaId, vinculo.ag.id);
    } else if (payload.id) {
      payload.id = validateUUID(payload.id, 'id');
      if (payload.id[14] === '8') throw createAppError('FORBIDDEN_FIELD', 'ID reservado ao fechamento de agendamento.', 422, { field: 'id' });
    }
    // Data/hora da comanda = agora no fuso da empresa, sempre definidas pelo
    // servidor (D-012). Antes: sem data, o RPC usava current_date do Postgres
    // (UTC) e a venda das 21h–24h de Brasília caía no dia seguinte; com data,
    // o cliente podia lançar venda em dia já fechado.
    const agora = agoraNoFuso(env.APP_TIMEZONE, clock.agora());
    const hora = `${String(Math.floor(agora.minuto / 60)).padStart(2, '0')}:${String(agora.minuto % 60).padStart(2, '0')}`;
    payload.data = agora.data; payload.hora = hora;
    const resolved = await buildServerResolvedCheckout(repo, payload);
    const cobertura = await coberturaDaComanda(req, repo, payload, resolved, vinculo);
    const preview = previewCheckout(resolved);
    if (pedido.revisaoFinanceira !== undefined && pedido.revisaoFinanceira !== revisaoFinanceira(preview, cobertura)) {
      throw createAppError('CHECKOUT_REVISAO_ALTERADA', 'O cálculo da comanda mudou. Simule novamente para conferir antes de fechar.', 409);
    }
    // Com uso de plano: fechamento e usos na mesma transação (D-043). Sem: o fechamento de sempre.
    enviouRpc = true;
    const saved = cobertura.usos.length
      ? await repo.saveCheckoutCloseAssinatura({ payload, resolved, preview, autoria, usos: cobertura.usos })
      : await repo.saveCheckoutClose({ payload, resolved, preview, autoria });

    // A leitura inicial não é lock: a RPC pode ter encontrado outro vencedor.
    // Reler autoria/intenção antes de responder ou concluir qualquer agendamento.
    if (saved.idempotent) {
      if (await confirmarFechamentoAnterior()) return;
      if (vinculo && saved.comandoId === payload.id && await repo.temComandaDoAgendamento(vinculo.ag.id)) throw conflitoComandaDoAgendamento();
      throw createAppError('CHECKOUT_CONFIRMATION_PENDING', 'O fechamento precisa de conferência. Retome com a mesma chave.', 503);
    }
    const agenda = await reconciliarAgendaCheckout(req, repo, autoria, vinculo?.ag.id, vinculo?.ag.cliente_id ?? null);
    res.status(201).json({ ok: true, data: { preview, saved, ...agenda } });
  } catch (err) {
    // Apenas uma recusa comprovada anterior à RPC pode liberar uma tentativa nova
    // no journal. Retomadas com resposta anterior desconhecida seguem ambíguas.
    if (verificouAusencia && !enviouRpc && err.statusCode >= 400 && err.statusCode < 500) {
      try {
        // A tentativa anterior pode ter confirmado enquanto esta lia agenda ou estoque.
        if (await confirmarFechamentoAnterior()) return;
        if (vinculo && await repo.temComandaDoAgendamento(vinculo.ag.id)) err = conflitoComandaDoAgendamento();
      } catch (erroConfirmacao) {
        return next(erroConfirmacao);
      }
      if (err.code !== AGENDAMENTO_COMANDA_JA_FECHADA) err.details = { ...(err.details || {}), checkoutNotCommitted: true };
    }
    next(err);
  }
});

// ---------- Estorno de comanda (D-013, migration 009) ----------
// Comandas de um dia com o saldo ainda estornável (tela de gestão).
function validarDataQuery(valor, padrao) {
  if (valor === undefined || valor === '') return padrao;
  const s = String(valor);
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    throw createAppError('INVALID_DATE', 'data deve estar no formato YYYY-MM-DD.', 422, { field: 'data' });
  }
  return s;
}

function comandaComSaldo(c, ledger, hoje, nomes) {
  const doC = rows => rows.filter(r => r.comando_id === c.id);
  const estornos = doC(ledger.estornos);
  const itens = doC(ledger.itens);
  const pagamentos = doC(ledger.pagamentos);
  const saldo = saldoDaComanda({ itens, pagamentos, estornos, estornoItens: doC(ledger.estornoItens), estornoPagamentos: doC(ledger.estornoPagamentos) });
  const dias = diasEntre(String(c.data), hoje);
  return {
    id: c.id, data: c.data, hora: c.hora || null, clienteId: c.cliente_id || null, clienteNome: nomes.get(c.cliente_id) || null,
    totalRecebidoCentavos: Number(c.total_recebido_centavos || 0),
    status: saldo.status,
    estornavel: saldo.status !== 'estornado' && dias >= 0 && dias <= PRAZO_DIAS,
    prazoAte: addDiasIso(String(c.data), PRAZO_DIAS),
    itens: saldo.porItem.map(s => ({ id: s.item.id, tipo: s.item.tipo, descricao: s.item.descricao || null, quantidade: s.item.quantidade, restante: s.restante, valorLiquidoCentavos: s.item.valor_liquido_centavos })),
    formas: saldo.porForma,
    estornos: estornos.map(e => ({ id: e.id, tipo: e.tipo, data: e.data, motivoCodigo: e.motivo_codigo, reembolsoCentavos: e.reembolso_centavos, createdAt: e.created_at || null }))
  };
}
const addDiasIso = (data, dias) => { const d = new Date(`${data}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };

async function carregarLedgerDasComandas(repo, ids) {
  const [itens, pagamentos, estornos, estornoItens, estornoPagamentos] = await Promise.all(
    ['comando_itens', 'comando_pagamentos', 'comanda_estornos', 'comanda_estorno_itens', 'comanda_estorno_pagamentos'].map(t => repo.listDasComandas(t, ids))
  );
  return { itens, pagamentos, estornos, estornoItens, estornoPagamentos };
}

router.get('/comandas', authorize('comanda:historico'), async (req, res, next) => {
  try {
    const hoje = agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
    const data = validarDataQuery(req.query.data, hoje);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const comandos = await repo.list('comandos', { empresa_id: repo.empresaId, data });
    const [ledger, clientes] = await Promise.all([carregarLedgerDasComandas(repo, comandos.map(c => c.id)), repo.list('clientes', { empresa_id: repo.empresaId })]);
    const nomes = new Map(clientes.map(c => [c.id, c.nome]));
    const lista = comandos.map(c => comandaComSaldo(c, ledger, hoje, nomes))
      .sort((a, b) => String(b.hora || '').localeCompare(String(a.hora || '')));
    res.json({ ok: true, data: { data, hoje, prazoDias: PRAZO_DIAS, comandas: lista } });
  } catch (err) { next(err); }
});

router.get('/comandas/:id/estornos', authorize('comanda:historico'), async (req, res, next) => {
  try {
    const id = validateUUID(req.params.id, 'id');
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const comanda = await repo.getByIdScoped('comandos', id);
    if (!comanda) throw createAppError('COMANDA_NOT_FOUND', 'Comanda não encontrada.', 404, { id });
    const hoje = agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
    const ledger = await carregarLedgerDasComandas(repo, [id]);
    const gorjetas = await repo.listDasComandas('comanda_estorno_gorjetas', [id]);
    const estornos = ledger.estornos.map(e => ({
      id: e.id, tipo: e.tipo, data: e.data, motivoCodigo: e.motivo_codigo, motivo: e.motivo, actorId: e.actor_id, createdAt: e.created_at || null,
      itensCentavos: e.itens_centavos, comissaoCentavos: e.comissao_centavos, receitaEmpresaCentavos: e.receita_empresa_centavos,
      gorjetaBrutaCentavos: e.gorjeta_bruta_centavos, gorjetaLiquidaCentavos: e.gorjeta_liquida_centavos, reembolsoCentavos: e.reembolso_centavos,
      itens: ledger.estornoItens.filter(i => i.estorno_id === e.id).map(i => ({ comandoItemId: i.comando_item_id, quantidade: i.quantidade, valorLiquidoCentavos: i.valor_liquido_centavos, comissaoCentavos: i.comissao_centavos, devolveEstoque: i.devolve_estoque })),
      reembolsos: ledger.estornoPagamentos.filter(p => p.estorno_id === e.id).map(p => ({ formaCode: p.forma_code, valorCentavos: p.valor_centavos })),
      gorjetas: gorjetas.filter(g => g.estorno_id === e.id).map(g => ({ profissionalId: g.profissional_id, valorBrutoCentavos: g.valor_bruto_centavos, valorLiquidoCentavos: g.valor_liquido_centavos }))
    })).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    res.json({ ok: true, data: { comanda: comandaComSaldo(comanda, ledger, hoje, new Map()), estornos } });
  } catch (err) { next(err); }
});

// Só admin/gestor humanos (checkout:estornar é userOnly). Data = hoje no fuso da
// empresa, definida aqui; o banco recusa outra data, prazo > 30 dias e saldo excedido.
router.post('/comandas/:id/estorno', authorize('comanda:estornar'), async (req, res, next) => {
  try {
    const id = validateUUID(req.params.id, 'id');
    const pedido = validateEstornoPayload(req.body);
    const autoria = autoriaDe(req.auth);
    if (!autoria.actorId) throw createAppError('USER_PRINCIPAL_REQUIRED', 'Estorno exige login de usuário.', 403);
    const data = agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
    const repo = new SupabaseRepository(req.auth.empresa_id);
    // Comanda com atendimento ou venda do próprio gerente: regra do próprio dinheiro.
    const [comanda, itens] = await Promise.all([
      repo.list('comandos', { empresa_id: repo.empresaId, id }),
      repo.list('comando_itens', { empresa_id: repo.empresaId, comando_id: id })
    ]);
    assertNaoProprioDinheiro(req, [...comanda, ...itens].map(x => x.profissional_id).filter(Boolean));
    const resultado = await repo.estornarComanda(id, { ...pedido, data }, autoria.actorId);
    res.status(resultado.idempotent ? 200 : 201).json({ ok: true, data: resultado });
  } catch (err) { next(err); }
});

// F1 Insights — read-only, serão cacheáveis depois
// Período dos insights: padrão = hoje NO FUSO DA EMPRESA (antes: data UTC, que
// das 21h às 24h de Brasília já era "amanhã"). Datas reais, de <= ate, até 366 dias.
const INSIGHTS_PERIODO_MAX_DIAS = 366;
function periodoInsights(query) {
  const { data: hoje, minuto: minutoAtual } = agoraNoFuso(env.APP_TIMEZONE, clock.agora());
  const from = query.from === undefined || query.from === '' ? hoje : String(query.from);
  const to = query.to === undefined || query.to === '' ? hoje : String(query.to);
  const valida = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
  if (!valida(from) || !valida(to)) throw createAppError('INVALID_DATES', 'Datas devem estar em formato YYYY-MM-DD', 400);
  if (from > to) throw createAppError('INVALID_DATES', 'from não pode ser depois de to.', 400);
  if ((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5 + 1 > INSIGHTS_PERIODO_MAX_DIAS) {
    throw createAppError('INVALID_DATES', `Período máximo de ${INSIGHTS_PERIODO_MAX_DIAS} dias.`, 400);
  }
  return { from, to, hoje, minutoAtual };
}

router.get('/insights/occupancy', authorize('painel:operacional'), async (req, res, next) => {
  try {
    const { from, to, hoje, minutoAtual } = periodoInsights(req.query);
    const service = new InsightsService(req.auth.empresa_id);
    const data = await service.loadOccupancyInsights(from, to, hoje, minutoAtual);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/insights/margin', authorize('painel:financeiro'), async (req, res, next) => {
  try {
    const { from, to } = periodoInsights(req.query);
    const service = new InsightsService(req.auth.empresa_id);
    const data = await service.loadMarginInsights(from, to);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/insights/cashflow', authorize('painel:financeiro'), async (req, res, next) => {
  try {
    const bruto = req.query.days === undefined || req.query.days === '' ? '30' : String(req.query.days);
    if (!/^\d{1,3}$/.test(bruto) || Number(bruto) < 1) throw createAppError('INVALID_DAYS', 'days deve ser inteiro entre 1 e 90.', 400);
    const days = Math.min(Number(bruto), 90);
    const service = new InsightsService(req.auth.empresa_id);
    const data = await service.loadCashflowInsights(days, agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

// F2 Retencao - read-only, backend-only analytics
router.get('/insights/retention', authorize('painel:operacional'), async (req, res, next) => {
  try {
    const service = new RetentionService(req.auth.empresa_id);
    const data = await service.loadRetentionInsights({
      financeiro: pode(req.auth, 'painel:financeiro'),
      contato: pode(req.auth, 'clientes:contato')
    });
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/insights/clients/:id/reliability', authorize('painel:operacional'), async (req, res, next) => {
  try {
    const id = validateUUID(req.params.id, 'id');
    const service = new RetentionService(req.auth.empresa_id);
    const data = await service.loadClientReliability(id);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/insights/attach', authorize('painel:operacional'), async (req, res, next) => {
  try {
    const service = new RetentionService(req.auth.empresa_id);
    const data = await service.loadAttachInsights();
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

router.get('/insights/rebooking/:clienteId', authorize('painel:operacional'), async (req, res, next) => {
  try {
    const clienteId = validateUUID(req.params.clienteId, 'clienteId');
    const servicoId = req.query.servicoId ? validateUUID(req.query.servicoId, 'servicoId') : null;
    const service = new RetentionService(req.auth.empresa_id);
    const data = await service.loadRebookingSuggestion(clienteId, servicoId);
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

// Cota-parte do mês (Lei do Salão-Parceiro, D-009): salão × profissionais parceiros.
router.get('/relatorios/cota-parte', authorize('painel:financeiro'), async (req, res, next) => {
  try {
    const mes = String(req.query.mes || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw createAppError('INVALID_MONTH', 'mes deve ser YYYY-MM.', 422);
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const filtro = { empresa_id: repo.empresaId };
    const [comandos, comandoItens, profissionais, empresas, estornos, estornoItens] = await Promise.all([
      repo.list('comandos', filtro), repo.list('comando_itens', filtro), repo.list('profissionais', filtro), repo.list('empresas', { id: repo.empresaId }),
      repo.list('comanda_estornos', filtro), repo.list('comanda_estorno_itens', filtro)
    ]);
    const empresa = empresas[0] || {};
    // Estorno entra no mês DO ESTORNO (D-013): o mês já fechado não muda.
    res.json({ ok: true, data: { ...computeCotaParte({ comandos, comandoItens, profissionais, mes, estornos, estornoItens }), salaoParceiro: Boolean(empresa.salao_parceiro), cnpj: empresa.cnpj || null, razaoSocial: empresa.razao_social || null } });
  } catch (err) { next(err); }
});

// F4.4 — lista de espera (tabela ja existe desde 001_init.sql; zero migration nova)
router.get('/lista-espera', authorize('espera:ver'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const filters = { empresa_id: repo.empresaId };
    if (req.query.servicoId) filters.servico_id = validateUUID(req.query.servicoId, 'servicoId');
    if (req.query.status) filters.status = req.query.status;
    res.json({ ok: true, data: await repo.list('lista_espera', filters) });
  } catch (err) { next(err); }
});

// Quem da lista de espera combina com uma vaga (D-054). Só sugere: não reserva nem muda nada.
router.get('/lista-espera/compativeis', authorize('espera:ver'), async (req, res, next) => {
  try {
    const { data, horario } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || '')) || Number.isNaN(Date.parse(`${data}T00:00:00Z`))) throw createAppError('INVALID_DATE', 'data deve estar no formato AAAA-MM-DD.', 422);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(horario || ''))) throw createAppError('INVALID_TIME', 'horario deve estar no formato HH:MM.', 422);
    const profissionalId = validateUUID(req.query.profissionalId, 'profissionalId');
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const profissional = await requireActiveEntity(repo, 'profissionais', profissionalId, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    const [empresa, itens, agendamentos, servicos, links, clientes] = await Promise.all([
      repo.empresaComDisponibilidade(),
      repo.list('lista_espera', { empresa_id: repo.empresaId }),
      repo.list('agendamentos', { empresa_id: repo.empresaId, profissional_id: profissional.id, data }),
      repo.list('servicos', { empresa_id: repo.empresaId }),
      repo.list('profissional_servicos', { empresa_id: repo.empresaId }),
      repo.list('clientes', { empresa_id: repo.empresaId })
    ]);
    const r = esperaCompativel({ itens, data, horario, profissional, empresa: empresa || {}, agendamentos, servicos, links, clientes, agora: agoraNoFuso(env.APP_TIMEZONE, clock.agora()) });
    res.json({ ok: true, data: { data, horario, profissionalId, ...r } });
  } catch (err) { next(err); }
});

router.post('/lista-espera', authorize('espera:gerir'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const payload = validateCreateListaEsperaPayload(req.body);
    await requireActiveEntity(repo, 'clientes', payload.cliente_id, 'Cliente', 'CLIENT_NOT_FOUND');
    await requireActiveEntity(repo, 'servicos', payload.servico_id, 'Serviço', 'SERVICE_NOT_FOUND');
    if (payload.profissional_id) await requireActiveEntity(repo, 'profissionais', payload.profissional_id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    res.status(201).json({ ok: true, data: await repo.insertScoped('lista_espera', payload) });
  } catch (err) { next(err); }
});

router.patch('/lista-espera/:id', authorize('espera:gerir'), async (req, res, next) => {
  try {
    const repo = new SupabaseRepository(req.auth.empresa_id);
    const id = validateUUID(req.params.id, 'id');
    await requireScopedEntity(repo, 'lista_espera', id, 'Item da lista de espera', 'WAITLIST_ITEM_NOT_FOUND');
    const payload = validateUpdateListaEsperaPayload(req.body);
    if (payload.profissional_id) await requireActiveEntity(repo, 'profissionais', payload.profissional_id, 'Profissional', 'PROFESSIONAL_NOT_FOUND');
    res.json({ ok: true, data: await repo.updateScoped('lista_espera', id, payload) });
  } catch (err) { next(err); }
});

module.exports = router;

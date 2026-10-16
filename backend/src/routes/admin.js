// Administração de conta (ADR-005): memberships, unidades e integrações.
// Só principal user com role admin (authorize('admin')), sempre na empresa do req.auth.
const express = require('express');
const { randomUUID } = require('crypto');
const { env } = require('../config/env');
const { createAppError } = require('../errors');
const { authorize } = require('../auth/rbac');
const { getIdentityStore } = require('../auth/identityStore');
const { generateCredential } = require('../auth/credentials');
const { ACTIONS } = require('../auth/rbac');
const { metrics } = require('../middleware/auth');
const { validateUUID } = require('../validators/cadastros.validator');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');

const router = express.Router();
router.use('/admin', authorize('admin'));

const ROLES = ['admin', 'gestor', 'recepcao', 'profissional'];
const SCOPES = Object.keys(ACTIONS).filter(a => a !== 'admin');

function pick(body, allowed) {
  const extra = Object.keys(body || {}).filter(k => !allowed.includes(k));
  if (extra.length) throw createAppError('FORBIDDEN_FIELD', `Campo não permitido: ${extra[0]}`, 422, { field: extra[0] });
  return body || {};
}

async function validateUnitIds(store, empresaId, unitIds) {
  if (unitIds === undefined) return undefined;
  if (!Array.isArray(unitIds)) throw createAppError('INVALID_FIELD', 'unitIds deve ser lista.', 422);
  const validas = (await store.listUnidades(empresaId)).map(u => u.id);
  const ids = [...new Set(unitIds.map(id => validateUUID(id, 'unitIds')))];
  const fora = ids.find(id => !validas.includes(id));
  if (fora) throw createAppError('UNIT_NOT_FOUND', `Unidade não pertence à empresa: ${fora}`, 422);
  return ids;
}

async function validateProfissional(req, profissionalId) {
  if (profissionalId === undefined || profissionalId === null) return profissionalId;
  const id = validateUUID(profissionalId, 'profissionalId');
  const repo = new SupabaseRepository(req.auth.empresa_id);
  if (!(await repo.getByIdScoped('profissionais', id))) throw createAppError('PROFESSIONAL_NOT_FOUND', 'Profissional não encontrado.', 422);
  return id;
}

// Não deixa a empresa sem admin ativo (evita trancar a conta para fora).
async function assertKeepsAnAdmin(store, empresaId, membershipId, next) {
  const ativos = (await store.listMembershipsByEmpresa(empresaId))
    .filter(m => m.status === 'ativo' && m.role === 'admin' && m.id !== membershipId);
  const continuaAdmin = next.role === 'admin' && next.status === 'ativo';
  if (!ativos.length && !continuaAdmin) throw createAppError('LAST_ADMIN', 'A empresa precisa de ao menos um admin ativo.', 409);
}

router.get('/admin/memberships', async (req, res, next) => {
  try {
    const store = getIdentityStore();
    const rows = await store.listMembershipsByEmpresa(req.auth.empresa_id);
    const data = await Promise.all(rows.map(async m => {
      const u = await store.getAppUser(m.user_id);
      return { ...m, user: u && { id: u.id, email: u.email, nome: u.nome, ativo: u.ativo }, unit_ids: (await store.listMembershipUnits(m.id)).map(x => x.unit_id) };
    }));
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

// O usuário precisa já ter conta no provedor (app_users é criado pelo trigger da 007).
router.post('/admin/memberships', async (req, res, next) => {
  try {
    const body = pick(req.body, ['email', 'role', 'profissionalId', 'unitIds']);
    const store = getIdentityStore();
    if (!ROLES.includes(body.role)) throw createAppError('INVALID_ROLE', 'role inválida.', 422, { allowed: ROLES });
    const user = await store.findAppUserByEmail(String(body.email || '').trim());
    if (!user) throw createAppError('USER_NOT_FOUND', 'Nenhuma conta com este e-mail. A pessoa precisa criar a conta antes.', 422);
    const unitIds = await validateUnitIds(store, req.auth.empresa_id, body.unitIds);
    const profissionalId = await validateProfissional(req, body.profissionalId);
    let m;
    try {
      m = await store.insertMembership({
        empresa_id: req.auth.empresa_id, user_id: user.id, role: body.role,
        profissional_id: profissionalId || null, created_by: req.auth.actor_id
      });
    } catch (err) {
      if (err.code === '23505') throw createAppError('MEMBERSHIP_EXISTS', 'Usuário já vinculado a esta empresa.', 409);
      throw err;
    }
    if (unitIds) await store.replaceMembershipUnits(m.id, unitIds);
    res.status(201).json({ ok: true, data: { ...m, unit_ids: unitIds || [] } });
  } catch (err) { next(err); }
});

router.patch('/admin/memberships/:id', async (req, res, next) => {
  try {
    const body = pick(req.body, ['role', 'status', 'profissionalId', 'unitIds']);
    const store = getIdentityStore();
    const m = await store.getMembership(validateUUID(req.params.id, 'id'));
    if (!m || m.empresa_id !== req.auth.empresa_id) throw createAppError('MEMBERSHIP_NOT_FOUND', 'Vínculo não encontrado.', 404);
    const patch = {};
    if (body.role !== undefined) {
      if (!ROLES.includes(body.role)) throw createAppError('INVALID_ROLE', 'role inválida.', 422, { allowed: ROLES });
      patch.role = body.role;
    }
    if (body.status !== undefined) {
      if (!['ativo', 'inativo'].includes(body.status)) throw createAppError('INVALID_STATUS', 'status inválido.', 422);
      patch.status = body.status;
    }
    if (body.profissionalId !== undefined) patch.profissional_id = await validateProfissional(req, body.profissionalId);
    const unitIds = await validateUnitIds(store, req.auth.empresa_id, body.unitIds);
    await assertKeepsAnAdmin(store, m.empresa_id, m.id, { role: patch.role || m.role, status: patch.status || m.status });
    const updated = Object.keys(patch).length ? await store.updateMembership(m.id, patch) : m;
    if (unitIds) await store.replaceMembershipUnits(m.id, unitIds);
    res.json({ ok: true, data: { ...updated, unit_ids: unitIds || (await store.listMembershipUnits(m.id)).map(x => x.unit_id) } });
  } catch (err) { next(err); }
});

router.get('/admin/unidades', async (req, res, next) => {
  try { res.json({ ok: true, data: await getIdentityStore().listUnidades(req.auth.empresa_id) }); } catch (err) { next(err); }
});

router.post('/admin/unidades', async (req, res, next) => {
  try {
    const body = pick(req.body, ['nome']);
    const nome = String(body.nome || '').trim();
    if (!nome) throw createAppError('NAME_REQUIRED', 'nome obrigatório.', 422);
    res.status(201).json({ ok: true, data: await getIdentityStore().insertUnidade({ empresa_id: req.auth.empresa_id, nome }) });
  } catch (err) { next(err); }
});

router.patch('/admin/unidades/:id', async (req, res, next) => {
  try {
    const body = pick(req.body, ['nome', 'ativo']);
    const patch = {};
    if (body.nome !== undefined) patch.nome = String(body.nome).trim();
    if (body.ativo !== undefined) patch.ativo = body.ativo === true;
    const u = await getIdentityStore().updateUnidade(validateUUID(req.params.id, 'id'), req.auth.empresa_id, patch);
    if (!u) throw createAppError('UNIT_NOT_FOUND', 'Unidade não encontrada.', 404);
    res.json({ ok: true, data: u });
  } catch (err) { next(err); }
});

function validateScopes(scopes) {
  if (!Array.isArray(scopes) || !scopes.length) throw createAppError('SCOPES_REQUIRED', 'Informe ao menos um scope.', 422, { allowed: SCOPES });
  const invalid = scopes.find(s => !SCOPES.includes(s));
  if (invalid) throw createAppError('INVALID_SCOPE', `Scope inválido: ${invalid}`, 422, { allowed: SCOPES });
  return [...new Set(scopes)];
}

async function getOwnIntegration(req) {
  const i = await getIdentityStore().getIntegration(validateUUID(req.params.id, 'id'));
  if (!i || i.empresa_id !== req.auth.empresa_id) throw createAppError('INTEGRATION_NOT_FOUND', 'Integração não encontrada.', 404);
  return i;
}

async function issueCredential(store, integrationId, actorId) {
  const id = randomUUID();
  const { token, secretHash } = generateCredential(id);
  const cred = await store.insertCredential({ id, integration_id: integrationId, secret_hash: secretHash });
  await store.insertAudit({ integration_id: integrationId, credential_id: id, evento: 'credential_created', actor_id: actorId });
  return { cred, token };
}

router.get('/admin/integrations', async (req, res, next) => {
  try {
    const store = getIdentityStore();
    const rows = await store.listIntegrations(req.auth.empresa_id);
    const data = await Promise.all(rows.map(async i => ({ ...i, scopes: await store.listScopes(i.id), credentials: await store.listCredentials(i.id) })));
    res.json({ ok: true, data });
  } catch (err) { next(err); }
});

// O segredo aparece só nesta resposta (e nas de rotação). Depois, só o hash existe.
router.post('/admin/integrations', async (req, res, next) => {
  try {
    const body = pick(req.body, ['nome', 'scopes']);
    const nome = String(body.nome || '').trim();
    if (!nome) throw createAppError('NAME_REQUIRED', 'nome obrigatório.', 422);
    const scopes = validateScopes(body.scopes);
    const store = getIdentityStore();
    const integration = await store.insertIntegration({ empresa_id: req.auth.empresa_id, nome, created_by: req.auth.actor_id });
    await store.replaceScopes(integration.id, scopes);
    await store.insertAudit({ integration_id: integration.id, evento: 'scopes_changed', actor_id: req.auth.actor_id, detalhes: { de: [], para: scopes } });
    const { cred, token } = await issueCredential(store, integration.id, req.auth.actor_id);
    res.status(201).json({ ok: true, data: { integration: { ...integration, scopes }, credential: cred, secret: token, aviso: 'Este segredo é exibido uma única vez.' } });
  } catch (err) { next(err); }
});

router.patch('/admin/integrations/:id', async (req, res, next) => {
  try {
    const body = pick(req.body, ['nome', 'status', 'scopes']);
    const store = getIdentityStore();
    const i = await getOwnIntegration(req);
    const patch = {};
    if (body.nome !== undefined) patch.nome = String(body.nome).trim();
    if (body.status !== undefined) {
      if (!['ativo', 'inativo'].includes(body.status)) throw createAppError('INVALID_STATUS', 'status inválido.', 422);
      patch.status = body.status;
    }
    const updated = Object.keys(patch).length ? await store.updateIntegration(i.id, i.empresa_id, patch) : i;
    if (patch.status) await store.insertAudit({ integration_id: i.id, evento: `integration_${patch.status}`, actor_id: req.auth.actor_id });
    let scopes = await store.listScopes(i.id);
    if (body.scopes !== undefined) {
      const novos = validateScopes(body.scopes);
      await store.replaceScopes(i.id, novos);
      await store.insertAudit({ integration_id: i.id, evento: 'scopes_changed', actor_id: req.auth.actor_id, detalhes: { de: scopes, para: novos } });
      scopes = novos;
    }
    res.json({ ok: true, data: { ...updated, scopes } });
  } catch (err) { next(err); }
});

// Rotação: nova credencial ativa já; a anterior vale só pela janela de sobreposição.
// Nunca mais de duas válidas ao mesmo tempo.
router.post('/admin/integrations/:id/credentials', async (req, res, next) => {
  try {
    const store = getIdentityStore();
    const i = await getOwnIntegration(req);
    const now = Date.now();
    const validas = (await store.listCredentials(i.id))
      .filter(c => !c.revoked_at && (!c.expires_at || Date.parse(c.expires_at) > now))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const fimJanela = new Date(now + env.INTEGRATION_ROTATION_OVERLAP_MIN * 60 * 1000).toISOString();
    for (const [idx, c] of validas.entries()) {
      if (idx === 0) {
        const fim = c.expires_at && Date.parse(c.expires_at) < Date.parse(fimJanela) ? c.expires_at : fimJanela;
        await store.updateCredential(c.id, { expires_at: fim });
        await store.insertAudit({ integration_id: i.id, credential_id: c.id, evento: 'credential_expiring', actor_id: req.auth.actor_id, detalhes: { expires_at: fim } });
      } else {
        await store.updateCredential(c.id, { revoked_at: new Date(now).toISOString() });
        await store.insertAudit({ integration_id: i.id, credential_id: c.id, evento: 'credential_revoked', actor_id: req.auth.actor_id, detalhes: { motivo: 'limite_de_duas' } });
      }
    }
    const { cred, token } = await issueCredential(store, i.id, req.auth.actor_id);
    res.status(201).json({ ok: true, data: { credential: cred, secret: token, aviso: 'Este segredo é exibido uma única vez.' } });
  } catch (err) { next(err); }
});

// Revogação de emergência: imediata, independe da janela.
router.post('/admin/integrations/:id/credentials/:credentialId/revoke', async (req, res, next) => {
  try {
    const store = getIdentityStore();
    const i = await getOwnIntegration(req);
    const credId = validateUUID(req.params.credentialId, 'credentialId');
    const c = await store.getCredential(credId);
    if (!c || c.integration_id !== i.id) throw createAppError('CREDENTIAL_NOT_FOUND', 'Credencial não encontrada.', 404);
    const updated = await store.updateCredential(credId, { revoked_at: new Date().toISOString() });
    await store.insertAudit({ integration_id: i.id, credential_id: credId, evento: 'credential_revoked', actor_id: req.auth.actor_id, detalhes: { motivo: 'manual' } });
    res.json({ ok: true, data: updated });
  } catch (err) { next(err); }
});

router.get('/admin/integrations/:id/audit', async (req, res, next) => {
  try {
    const i = await getOwnIntegration(req);
    res.json({ ok: true, data: await getIdentityStore().listAudit(i.id) });
  } catch (err) { next(err); }
});

// Adoção JWT vs legado: base para decidir quando desligar o API_ACCESS_TOKEN.
router.get('/admin/auth-metrics', (req, res) => {
  res.json({ ok: true, data: { ...metrics, legacyEnabled: env.LEGACY_TOKEN_AUTH_ENABLED } });
});

module.exports = { adminRouter: router };

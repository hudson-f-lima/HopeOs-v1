// Autenticação (ADR-005): três mecanismos que coexistem sem contaminação.
//   legacy       Bearer API_ACCESS_TOKEN (transição; desligável por LEGACY_TOKEN_AUTH_ENABLED)
//   user         Bearer JWT do Supabase Auth → membership/role/unidades lidos frescos do banco
//   integration  Bearer kxi_<credencial>_<segredo> → tenant e scopes fixados no servidor
// Cada um produz um formato próprio de req.auth; nenhum produz o formato de outro.
const crypto = require('crypto');
const { env } = require('../config/env');
const { createAppError } = require('../errors');
const { getAuthProvider } = require('../auth/provider');
const { getIdentityStore } = require('../auth/identityStore');
const { parseCredential, verifySecret, looksLikeIntegrationToken } = require('../auth/credentials');

const metrics = { legacy: 0, user: 0, integration: 0, rejected: 0, tenantSelectionDenied: 0 };

function safeEquals(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function extractBearer(req) {
  const header = req.headers.authorization || '';
  const [scheme, value] = header.split(' ');
  if (!value || String(scheme).toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}

function looksLikeJwt(token) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

const unauthenticated = () => createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
const forbidden = (code, message, details) => createAppError(code, message, 403, details);

// Formato do principal legado: só empresa_id (do servidor). Mantido como
// buildAuthContext por compatibilidade com o gate de tenant-boundary.
function buildAuthContext() {
  return {
    principal_type: 'legacy',
    user_id: null,
    actor_id: null,
    empresa_id: env.DEFAULT_EMPRESA_ID,
    role: null,
    unit_ids: []
  };
}

// Identidade + memberships ativas (sem escolher empresa). Usado também por GET /me.
async function resolveUserIdentity(jwt) {
  const user = await getAuthProvider().getUser(jwt);
  const store = getIdentityStore();
  const appUser = await store.getAppUser(user.id);
  if (!appUser || appUser.ativo === false) throw forbidden('USER_INACTIVE', 'Usuário inexistente ou desativado na aplicação.');
  const memberships = (await store.listMembershipsByUser(appUser.id)).filter(m => m.status === 'ativo');
  return { user, appUser, memberships };
}

async function buildUserAuth(identity, req) {
  const { appUser, memberships } = identity;
  if (!memberships.length) throw forbidden('NO_ACTIVE_MEMBERSHIP', 'Usuário sem vínculo ativo com nenhuma empresa.');

  // X-Empresa-Id é só seletor dentro das memberships já validadas, nunca autoridade.
  const selector = req.headers['x-empresa-id'];
  let membership;
  if (selector) {
    membership = memberships.find(m => m.empresa_id === selector);
    if (!membership) {
      metrics.tenantSelectionDenied++;
      console.warn('[auth] seleção de empresa fora das memberships', { user_id: appUser.id, selector });
      throw forbidden('EMPRESA_NOT_AUTHORIZED', 'Empresa fora dos vínculos do usuário.');
    }
  } else if (memberships.length === 1) {
    membership = memberships[0];
  } else {
    throw createAppError('EMPRESA_SELECTION_REQUIRED', 'Usuário com mais de uma empresa: envie X-Empresa-Id.', 400, {
      empresas: memberships.map(m => m.empresa_id)
    });
  }

  const store = getIdentityStore();
  const unidadesAtivas = (await store.listUnidades(membership.empresa_id)).filter(u => u.ativo !== false).map(u => u.id);
  let unitIds;
  if (membership.role === 'admin' || membership.role === 'gestor') {
    unitIds = unidadesAtivas;
  } else {
    const vinculadas = (await store.listMembershipUnits(membership.id)).map(x => x.unit_id);
    unitIds = vinculadas.filter(id => unidadesAtivas.includes(id));
    if (!unitIds.length) throw forbidden('NO_UNIT_ACCESS', 'Usuário sem unidade ativa vinculada.');
  }
  const unitSelector = req.headers['x-unidade-id'];
  if (unitSelector && !unitIds.includes(unitSelector)) {
    metrics.tenantSelectionDenied++;
    throw forbidden('UNIT_NOT_AUTHORIZED', 'Unidade fora do acesso do usuário.');
  }

  return {
    principal_type: 'user',
    user_id: appUser.id,
    actor_id: appUser.id,
    empresa_id: membership.empresa_id,
    role: membership.role,
    unit_ids: unitIds,
    unit_id: unitSelector || null,
    membership_id: membership.id,
    profissional_id: membership.profissional_id || null
  };
}

async function buildIntegrationAuth(token, req, res) {
  const store = getIdentityStore();
  const parsed = parseCredential(token);
  const cred = parsed ? await store.getCredential(parsed.credentialId) : null;
  // Sempre roda o scrypt (com hash fictício quando não há credencial): tempo constante.
  const ok = verifySecret(parsed ? parsed.secret : 'x', cred && cred.secret_hash);
  if (!cred || !ok) throw unauthenticated();

  const audit = (evento, extra = {}) => store.insertAudit({
    integration_id: cred.integration_id, credential_id: cred.id, evento,
    rota: `${req.method} ${req.originalUrl.split('?')[0]}`, ...extra
  }).catch(err => console.error('[auth] falha ao auditar integração', err.message));

  const now = Date.now();
  if (cred.revoked_at || (cred.expires_at && Date.parse(cred.expires_at) <= now)) {
    audit('auth_rejected', { status_code: 401, detalhes: { motivo: cred.revoked_at ? 'revogada' : 'expirada' } });
    throw unauthenticated();
  }
  const integration = await store.getIntegration(cred.integration_id);
  if (!integration || integration.status !== 'ativo') {
    audit('auth_rejected', { status_code: 403, detalhes: { motivo: 'integracao_inativa' } });
    throw forbidden('INTEGRATION_INACTIVE', 'Integração inativa.');
  }
  // Tenant é o da integração; pedir outro é negado (nunca seletor).
  const pedido = req.headers['x-empresa-id'];
  if (pedido && pedido !== integration.empresa_id) {
    metrics.tenantSelectionDenied++;
    audit('auth_rejected', { status_code: 403, detalhes: { motivo: 'tenant_divergente' } });
    throw forbidden('EMPRESA_NOT_AUTHORIZED', 'Integração fixada em outra empresa.');
  }

  res.on('finish', () => audit('request', { status_code: res.statusCode }));
  return {
    principal_type: 'integration',
    integration_id: integration.id,
    credential_id: cred.id,
    empresa_id: integration.empresa_id,
    scopes: await store.listScopes(integration.id)
  };
}

async function authenticate(req, res) {
  const token = extractBearer(req);
  if (!token) throw unauthenticated();

  if (looksLikeIntegrationToken(token)) return buildIntegrationAuth(token, req, res);

  if (env.API_ACCESS_TOKEN && safeEquals(token, env.API_ACCESS_TOKEN)) {
    if (!env.LEGACY_TOKEN_AUTH_ENABLED) throw createAppError('LEGACY_AUTH_DISABLED', 'Token legado desativado neste ambiente.', 401);
    return buildAuthContext();
  }

  if (looksLikeJwt(token)) return buildUserAuth(await resolveUserIdentity(token), req);

  if (!env.API_ACCESS_TOKEN) throw createAppError('AUTH_NOT_CONFIGURED', 'API_ACCESS_TOKEN nao configurado no backend.', 503);
  throw unauthenticated();
}

function requireAuth(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  const accept = auth => { req.auth = auth; metrics[auth.principal_type]++; next(); };
  const reject = err => { metrics.rejected++; next(err); };
  // Token legado resolve sem I/O: mantém o middleware síncrono nesse caminho.
  const token = extractBearer(req);
  if (token && env.API_ACCESS_TOKEN && safeEquals(token, env.API_ACCESS_TOKEN)) {
    if (!env.LEGACY_TOKEN_AUTH_ENABLED) return reject(createAppError('LEGACY_AUTH_DISABLED', 'Token legado desativado neste ambiente.', 401));
    return accept(buildAuthContext());
  }
  return authenticate(req, res).then(accept, reject);
}

// Escrita humana sem ator resolvido falha antes de tocar o banco (ADR-005, autoria).
// Legado (transição) e integração não têm ator humano: autoria fica nula/por integração.
function autoriaDe(auth) {
  if (!auth) throw unauthenticated();
  if (auth.principal_type === 'user') {
    if (!auth.actor_id) throw createAppError('ACTOR_CONTEXT_MISSING', 'Ator não resolvido; escrita bloqueada.', 500);
    return { actorId: auth.actor_id, integrationId: null };
  }
  if (auth.principal_type === 'integration') return { actorId: null, integrationId: auth.integration_id };
  return { actorId: null, integrationId: null };
}

module.exports = {
  requireAuth, safeEquals, extractBearer, buildAuthContext, resolveUserIdentity, autoriaDe, metrics, looksLikeJwt
};

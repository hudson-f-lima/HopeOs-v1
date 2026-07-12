const crypto = require('crypto');
const { env } = require('../config/env');
const { createAppError } = require('../errors');

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

function buildAuthContext() {
  // Sem tabela de identidade/sessao ainda: empresa_id vem so do env (V1.4.2 pendencia
  // conhecida), e user_id/actor_id/role/unit_ids ficam null/[] em vez de simulados.
  return {
    user_id: null,
    actor_id: null,
    empresa_id: env.DEFAULT_EMPRESA_ID,
    role: null,
    unit_ids: []
  };
}

function requireAuth(req, res, next) {
  if (req.method === 'OPTIONS') return next();

  if (!env.API_ACCESS_TOKEN) {
    return next(createAppError('AUTH_NOT_CONFIGURED', 'API_ACCESS_TOKEN nao configurado no backend.', 503));
  }

  const token = extractBearer(req);
  if (!token || !safeEquals(token, env.API_ACCESS_TOKEN)) {
    return next(createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401));
  }

  req.auth = buildAuthContext();
  return next();
}

module.exports = { requireAuth, safeEquals, extractBearer, buildAuthContext };

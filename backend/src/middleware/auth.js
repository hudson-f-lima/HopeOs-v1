const crypto = require('crypto');
const { env } = require('../config/env');
const { createAppError } = require('../errors');

// Comparacao em tempo constante: `a === b` vaza o tamanho do prefixo correto por timing,
// o que permite descobrir o token byte a byte contra uma API sem rate limit.
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

function requireAuth(req, res, next) {
  if (req.method === 'OPTIONS') return next();

  // Fail closed: sem token configurado o backend nao serve dados, nem em dev.
  if (!env.API_ACCESS_TOKEN) {
    return next(createAppError('AUTH_NOT_CONFIGURED', 'API_ACCESS_TOKEN não configurado no backend.', 503));
  }

  const token = extractBearer(req);
  if (!token || !safeEquals(token, env.API_ACCESS_TOKEN)) {
    return next(createAppError('UNAUTHENTICATED', 'Credencial ausente ou inválida.', 401));
  }

  return next();
}

module.exports = { requireAuth, safeEquals, extractBearer };

// Sessão do principal user. O backend repassa ao provedor (Supabase Auth): a PWA
// não precisa de SDK nem de chave do Supabase. Montado ANTES do requireAuth.
const express = require('express');
const { env } = require('../config/env');
const { createAppError } = require('../errors');
const { getAuthProvider } = require('../auth/provider');
const { getIdentityStore } = require('../auth/identityStore');
const { requireAuth, extractBearer, resolveUserIdentity, looksLikeJwt, safeEquals } = require('../middleware/auth');

const router = express.Router();

// Rate limit em memória por IP+e-mail: todas as tentativas saem do IP do backend
// para o provedor, então a proteção por IP do Supabase não distingue clientes.
const attempts = new Map();
function rateLimited(key) {
  const now = Date.now();
  const windowMs = env.LOGIN_RATE_LIMIT_WINDOW_MIN * 60 * 1000;
  const hits = (attempts.get(key) || []).filter(t => now - t < windowMs);
  hits.push(now);
  attempts.set(key, hits);
  if (attempts.size > 10000) attempts.clear(); // teto de memória
  return hits.length > env.LOGIN_RATE_LIMIT_MAX;
}
function resetRateLimit() { attempts.clear(); }

router.post('/auth/login', async (req, res, next) => {
  try {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    if (!email || !password) throw createAppError('CREDENTIALS_REQUIRED', 'Informe e-mail e senha.', 422);
    if (rateLimited(`${req.ip}|${email}`)) throw createAppError('TOO_MANY_ATTEMPTS', 'Muitas tentativas. Aguarde alguns minutos.', 429);
    const session = await getAuthProvider().signIn(email, password);
    res.json({ ok: true, data: session });
  } catch (err) { next(err); }
});

router.post('/auth/refresh', async (req, res, next) => {
  try {
    const refreshToken = String((req.body && req.body.refresh_token) || '');
    if (!refreshToken) throw createAppError('REFRESH_TOKEN_REQUIRED', 'refresh_token obrigatório.', 422);
    res.json({ ok: true, data: await getAuthProvider().refresh(refreshToken) });
  } catch (err) { next(err); }
});

router.post('/auth/logout', async (req, res, next) => {
  try {
    const token = extractBearer(req);
    if (token && looksLikeJwt(token)) await getAuthProvider().signOut(token);
    res.json({ ok: true, data: null });
  } catch (err) { next(err); }
});

// Quem sou eu + empresas disponíveis. Funciona sem X-Empresa-Id (usuário com várias empresas).
router.get('/me', async (req, res, next) => {
  try {
    const token = extractBearer(req);
    if (token && looksLikeJwt(token) && !(env.API_ACCESS_TOKEN && safeEquals(token, env.API_ACCESS_TOKEN))) {
      const { appUser, memberships } = await resolveUserIdentity(token);
      const store = getIdentityStore();
      const empresas = await Promise.all(memberships.map(async m => ({
        empresa_id: m.empresa_id, role: m.role, membership_id: m.id, profissional_id: m.profissional_id || null,
        unidades: (await store.listUnidades(m.empresa_id)).filter(u => u.ativo !== false).map(u => ({ id: u.id, nome: u.nome }))
      })));
      return res.json({ ok: true, data: { principal_type: 'user', user: { id: appUser.id, email: appUser.email, nome: appUser.nome }, empresas } });
    }
    return requireAuth(req, res, (err) => {
      if (err) return next(err);
      const a = req.auth;
      const data = a.principal_type === 'integration'
        ? { principal_type: 'integration', integration_id: a.integration_id, empresa_id: a.empresa_id, scopes: a.scopes }
        : { principal_type: a.principal_type, empresa_id: a.empresa_id };
      res.json({ ok: true, data });
    });
  } catch (err) { next(err); }
});

module.exports = { authRouter: router, resetRateLimit };

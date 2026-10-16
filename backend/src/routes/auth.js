// Sessão do principal user. O backend repassa ao provedor (Supabase Auth): a PWA
// não precisa de SDK nem de chave do Supabase. Montado ANTES do requireAuth.
const express = require('express');
const { env } = require('../config/env');
const { createAppError } = require('../errors');
const { getAuthProvider } = require('../auth/provider');
const { getIdentityStore } = require('../auth/identityStore');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
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

// Recuperação de senha: sempre 200, para não revelar quais e-mails têm conta.
router.post('/auth/recover', async (req, res, next) => {
  try {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    if (!email) throw createAppError('EMAIL_REQUIRED', 'Informe o e-mail.', 422);
    if (rateLimited(`${req.ip}|recover|${email}`)) throw createAppError('TOO_MANY_ATTEMPTS', 'Muitas tentativas. Aguarde alguns minutos.', 429);
    await getAuthProvider().recoverPassword(email, env.APP_PUBLIC_URL || undefined);
    res.json({ ok: true, data: { message: 'Se houver conta com este e-mail, enviamos um link para definir a senha.' } });
  } catch (err) { next(err); }
});

// Define a senha com o token do link de convite/recuperação (Bearer).
router.post('/auth/password', async (req, res, next) => {
  try {
    const token = extractBearer(req);
    if (!token || !looksLikeJwt(token)) throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
    const password = String((req.body && req.body.password) || '');
    if (password.length < 8) throw createAppError('WEAK_PASSWORD', 'Senha fraca: use ao menos 8 caracteres.', 422);
    await getAuthProvider().setPassword(token, password);
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
        nome: ((await new SupabaseRepository(m.empresa_id).list('empresas', { id: m.empresa_id }))[0] || {}).nome || null,
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

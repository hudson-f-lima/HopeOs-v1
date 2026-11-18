// Sessão do principal user e configuração pública do SDK. Montado antes de requireAuth.
const express = require('express');
const { createHash } = require('node:crypto');
const { permissoesEfetivas } = require('../auth/permissoes');
const { env } = require('../config/env');
const { createAppError } = require('../errors');
const { getAuthProvider } = require('../auth/provider');
const { getIdentityStore } = require('../auth/identityStore');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { requireAuth, extractBearer, resolveUserIdentity, looksLikeJwt, safeEquals } = require('../middleware/auth');
const { criarLimitador, chaveIp } = require('../security/rateLimit');

const router = express.Router();

const attempts = criarLimitador();
const digest = value => createHash('sha256').update(value).digest('base64url');
function limitarTentativas(req, operacao, credencial) {
  const windowMs = env.LOGIN_RATE_LIMIT_WINDOW_MIN * 60 * 1000;
  const ip = digest(chaveIp(req.ip));
  const email = operacao === 'login' || operacao === 'recover';
  const grupo = email ? 'email' : operacao;
  const maxIp = operacao === 'refresh' ? env.AUTH_REFRESH_RATE_LIMIT_IP_MAX : env.LOGIN_RATE_LIMIT_IP_MAX;
  const porIp = attempts.excedeu(`ip|${grupo}|${ip}`, maxIp, windowMs);
  // E-mails compartilham o limite por IP anterior. Tokens usam chave global e ficam
  // no limitador em formato derivado, com tamanho fixo.
  const porChave = !porIp && credencial && attempts.excedeu(
    `credencial|${operacao}|${email ? ip : ''}|${digest(credencial)}`, env.LOGIN_RATE_LIMIT_MAX, windowMs
  );
  if (porIp || porChave) throw createAppError('TOO_MANY_ATTEMPTS', 'Muitas tentativas. Aguarde alguns minutos.', 429);
}
function resetRateLimit() { attempts.limpar(); }

function sdkConfig() {
  const key = env.SUPABASE_PUBLISHABLE_KEY.trim();
  let url = null;
  try {
    const candidate = new URL(env.SUPABASE_URL);
    const secure = candidate.protocol === 'https:' ||
      (env.NODE_ENV !== 'production' && candidate.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(candidate.hostname));
    if (secure && candidate.pathname === '/' && !candidate.username && !candidate.password && !candidate.search && !candidate.hash) {
      url = candidate.origin;
    }
  } catch (_) { /* configuração ausente ou inválida */ }
  const configured = Boolean(url && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key));
  return {
    supabaseUrl: configured ? url : null,
    publishableKey: configured ? key : null,
    providers: {
      google: configured && env.AUTH_GOOGLE_ENABLED,
      apple: configured && env.AUTH_APPLE_ENABLED,
      magicLink: configured && env.AUTH_MAGIC_LINK_ENABLED,
      otp: configured && env.AUTH_OTP_ENABLED,
      linkIdentity: configured && env.AUTH_LINK_IDENTITY_ENABLED
    }
  };
}

router.get('/auth/config', (req, res) => res.json({ ok: true, data: sdkConfig() }));

router.post('/auth/login', async (req, res, next) => {
  try {
    const { email: entrada, password } = req.body || {};
    const email = typeof entrada === 'string' ? entrada.trim().toLowerCase() : '';
    limitarTentativas(req, 'login', email);
    if (!email || typeof password !== 'string' || !password) throw createAppError('CREDENTIALS_REQUIRED', 'Informe e-mail e senha.', 422);
    const session = await getAuthProvider().signIn(email, password);
    res.json({ ok: true, data: session });
  } catch (err) { next(err); }
});

router.post('/auth/refresh', async (req, res, next) => {
  try {
    const refreshToken = typeof req.body?.refresh_token === 'string' ? req.body.refresh_token : '';
    limitarTentativas(req, 'refresh', refreshToken);
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

// A resposta não revela quais e-mails têm conta.
router.post('/auth/recover', async (req, res, next) => {
  try {
    const entrada = req.body?.email;
    const email = typeof entrada === 'string' ? entrada.trim().toLowerCase() : '';
    limitarTentativas(req, 'recover', email);
    if (!email) throw createAppError('EMAIL_REQUIRED', 'Informe o e-mail.', 422);
    await getAuthProvider().recoverPassword(email, env.APP_PUBLIC_URL || undefined);
    res.json({ ok: true, data: { message: 'Se houver conta com este e-mail, enviamos um link para definir a senha.' } });
  } catch (err) { next(err); }
});

// Define a senha apenas com prova recente da identidade no provedor.
router.post('/auth/password', async (req, res, next) => {
  try {
    const token = extractBearer(req);
    limitarTentativas(req, 'password', token);
    if (!token || !looksLikeJwt(token) || (env.API_ACCESS_TOKEN && safeEquals(token, env.API_ACCESS_TOKEN))) {
      throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
    }
    const password = req.body?.password;
    if (typeof password !== 'string' || password.length < 8) throw createAppError('WEAK_PASSWORD', 'Senha fraca: use ao menos 8 caracteres.', 422);
    await getAuthProvider().setPassword(token, password);
    res.json({ ok: true, data: null });
  } catch (err) { next(err); }
});

// Aviso de privacidade (D-018): o aceite acontece ao criar a conta e entrar. O servidor
// só registra a versão vigente; versão antiga ou inventada é recusada.
function privacidadeDe(user) {
  const suportado = typeof getAuthProvider().acceptPrivacy === 'function';
  const aceite = (user && user.privacy) || null;
  const versaoAceita = aceite ? aceite.versao : null;
  return { versaoAtual: env.PRIVACY_NOTICE_VERSION, versaoAceita, aceitoEm: aceite ? aceite.aceito_em : null, pendente: suportado && versaoAceita !== env.PRIVACY_NOTICE_VERSION };
}

router.post('/auth/privacidade/aceite', async (req, res, next) => {
  try {
    const token = extractBearer(req);
    if (!token || !looksLikeJwt(token) || (env.API_ACCESS_TOKEN && safeEquals(token, env.API_ACCESS_TOKEN))) throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
    const provider = getAuthProvider();
    if (typeof provider.acceptPrivacy !== 'function') throw createAppError('PRIVACY_NOT_SUPPORTED', 'Registro de aceite indisponível neste ambiente.', 503);
    const versao = String((req.body && req.body.versao) || '');
    if (versao !== env.PRIVACY_NOTICE_VERSION) throw createAppError('PRIVACY_VERSION_MISMATCH', 'O aviso foi atualizado. Recarregue a página e leia a versão atual.', 422, { versaoAtual: env.PRIVACY_NOTICE_VERSION });
    await resolveUserIdentity(token); // conta inexistente ou desativada não registra aceite
    const aceite = await provider.acceptPrivacy(token, versao);
    res.json({ ok: true, data: { versaoAtual: env.PRIVACY_NOTICE_VERSION, versaoAceita: aceite.versao, aceitoEm: aceite.aceito_em, pendente: false } });
  } catch (err) { next(err); }
});

// Quem sou eu + empresas disponíveis. Funciona sem X-Empresa-Id (usuário com várias empresas).
router.get('/me', async (req, res, next) => {
  try {
    const token = extractBearer(req);
    if (token && looksLikeJwt(token) && !(env.API_ACCESS_TOKEN && safeEquals(token, env.API_ACCESS_TOKEN))) {
      const { user, appUser, memberships } = await resolveUserIdentity(token);
      const store = getIdentityStore();
      const empresas = await Promise.all(memberships.map(async m => ({
        empresa_id: m.empresa_id, role: m.role, membership_id: m.id, profissional_id: m.profissional_id || null,
        // D-032: o que a pessoa pode, já somando papel e permissões individuais. A tela usa isto.
        permissoes: permissoesEfetivas(m.role, m.permissoes_extras),
        nome: ((await new SupabaseRepository(m.empresa_id).list('empresas', { id: m.empresa_id }))[0] || {}).nome || null,
        unidades: (await store.listUnidades(m.empresa_id)).filter(u => u.ativo !== false).map(u => ({ id: u.id, nome: u.nome }))
      })));
      return res.json({ ok: true, data: { principal_type: 'user', user: { id: appUser.id, email: appUser.email, nome: appUser.nome }, empresas, privacidade: privacidadeDe(user) } });
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

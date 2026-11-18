// Provedor de identidade (principal user). Padrão: Supabase Auth.
// Injetável para testes e para o dev-memory-api (setAuthProvider).
const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');
const { createAppError } = require('../errors');

const PROVA_SENHA_SEGUNDOS = 5 * 60;
const METODOS_PROVA_SENHA = new Set(['otp', 'magiclink', 'invite', 'recovery']);
const ERROS_SESSAO_INVALIDA = new Set(['bad_jwt', 'session_not_found', 'session_expired', 'user_not_found']);

async function authRequest(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(reject, env.AUTH_TIMEOUT_MS); })
    ]);
  } catch (error) {
    throw providerError(error);
  } finally {
    clearTimeout(timer);
  }
}

function supabaseAuthClient() {
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    return createClient(env.SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  } catch (_) {
    throw createAppError('AUTH_NOT_CONFIGURED', 'Supabase Auth não configurado no backend.', 503);
  }
}

function providerError(error) {
  const status = Number(error && error.status);
  if (status === 403 && ERROS_SESSAO_INVALIDA.has(error.code)) {
    return createAppError('AUTH_SESSION_INVALID', 'A sessão expirou. Entre novamente.', 403);
  }
  if (status === 403) return createAppError('AUTH_FORBIDDEN', 'Operação de autenticação não permitida.', 403);
  if (status === 429) return createAppError('TOO_MANY_ATTEMPTS', 'Muitas tentativas. Aguarde alguns minutos.', 429);
  if (status === 408 || status === 425) return createAppError('AUTH_PROVIDER_UNAVAILABLE', 'Provedor de identidade indisponível.', 503);
  if (status >= 400 && status < 500) return createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
  return createAppError('AUTH_PROVIDER_UNAVAILABLE', 'Provedor de identidade indisponível.', 503);
}

function possuiProvaRecente(jwt, userId) {
  let claims;
  try {
    claims = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
  } catch (_) {
    return false;
  }
  const agora = Math.floor(Date.now() / 1000);
  if (claims?.sub !== userId || typeof claims.session_id !== 'string' || !claims.session_id || !Array.isArray(claims.amr)) return false;
  return claims.amr.some(prova => {
    const idade = agora - prova?.timestamp;
    return METODOS_PROVA_SENHA.has(prova?.method) && Number.isSafeInteger(prova.timestamp) && idade >= -5 && idade < PROVA_SENHA_SEGUNDOS;
  });
}

function sessionOut(data) {
  const s = data && data.session;
  if (!s?.user?.id || !s.access_token || !s.refresh_token) throw providerError();
  return {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_in: s.expires_in,
    expires_at: s.expires_at,
    user: { id: s.user.id, email: s.user.email }
  };
}

const supabaseProvider = {
  async getUser(jwt) {
    const { data, error } = await authRequest(supabaseAuthClient().auth.getUser(jwt));
    if (error || !data?.user?.id) throw providerError(error);
    // Aceite do aviso de privacidade (D-018): fica em app_metadata, que só o servidor altera.
    return { id: data.user.id, email: data.user.email, privacy: (data.user.app_metadata && data.user.app_metadata.hopeos_privacy) || null };
  },
  async acceptPrivacy(jwt, versao) {
    const user = await this.getUser(jwt);
    const aceite = { versao, aceito_em: new Date().toISOString() };
    const { error } = await authRequest(supabaseAuthClient().auth.admin.updateUserById(user.id, { app_metadata: { hopeos_privacy: aceite } }));
    if (error) throw providerError(error);
    return aceite;
  },
  async signIn(email, password) {
    const { data, error } = await authRequest(supabaseAuthClient().auth.signInWithPassword({ email, password }));
    if (error) throw providerError(error);
    return sessionOut(data);
  },
  async refresh(refreshToken) {
    const { data, error } = await authRequest(supabaseAuthClient().auth.refreshSession({ refresh_token: refreshToken }));
    if (error) throw providerError(error);
    return sessionOut(data);
  },
  // Convite: o provedor cria a conta e envia o e-mail com link para definir a senha.
  // O trigger da 007 cria app_users na mesma transação do insert em auth.users.
  async inviteUser(email, redirectTo) {
    const { data, error } = await authRequest(supabaseAuthClient().auth.admin.inviteUserByEmail(email, { redirectTo }));
    if (error) {
      if (error.code === 'email_exists' || error.code === 'user_already_exists' || (Number(error.status) === 422 && /already/i.test(error.message || ''))) {
        throw createAppError('USER_ALREADY_EXISTS', 'Já existe conta com este e-mail.', 409);
      }
      throw providerError(error);
    }
    return { id: data.user.id, email: data.user.email };
  },
  async recoverPassword(email, redirectTo) {
    const { error } = await authRequest(supabaseAuthClient().auth.resetPasswordForEmail(email, { redirectTo }));
    if (!error) return;
    // Falhas de conta, quotas de e-mail e falhas de SMTP (500) podem revelar se a conta existe.
    const failure = providerError(error);
    if ((failure.statusCode === 503 && Number(error.status) !== 500) ||
        (failure.statusCode === 429 && error.code === 'over_request_rate_limit')) throw failure;
  },
  async setPassword(jwt, password) {
    // O provedor valida o JWT completo e a sessão antes de usarmos seu AMR assinado.
    // Fluxos antigos do Supabase registram convite e recuperação como OTP.
    const user = await this.getUser(jwt);
    if (!possuiProvaRecente(jwt, user.id)) {
      throw createAppError('PASSWORD_PROOF_REQUIRED', 'Solicite e abra um novo link para definir a senha.', 403);
    }
    const { error } = await authRequest(supabaseAuthClient().auth.admin.updateUserById(user.id, { password }));
    if (error) {
      if (error.code === 'weak_password' || Number(error.status) === 422) throw createAppError('WEAK_PASSWORD', 'A senha não atende aos requisitos de segurança.', 422);
      throw providerError(error);
    }
  },
  async signOut(jwt) {
    // Logout local é independente da chamada que revoga os refresh tokens.
    const { error } = await authRequest(supabaseAuthClient().auth.admin.signOut(jwt, 'local'));
    if (error) throw providerError(error);
  }
};

let current = supabaseProvider;
function getAuthProvider() { return current; }
function setAuthProvider(provider) { current = provider || supabaseProvider; }

module.exports = { getAuthProvider, setAuthProvider, supabaseProvider };

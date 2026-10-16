// Provedor de identidade (principal user). Padrão: Supabase Auth.
// Injetável para testes e para o dev-memory-api (setAuthProvider).
const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');
const { createAppError } = require('../errors');

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(createAppError('AUTH_PROVIDER_UNAVAILABLE', 'Provedor de identidade indisponível.', 503)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

function supabaseAuthClient() {
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !key) throw createAppError('AUTH_NOT_CONFIGURED', 'Supabase Auth não configurado no backend.', 503);
  return createClient(env.SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Erro do provedor: 4xx = credencial inválida (401); resto = indisponível (503). Nunca fail-open.
function providerError(error) {
  const status = Number(error && error.status);
  if (status >= 400 && status < 500) return createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
  return createAppError('AUTH_PROVIDER_UNAVAILABLE', 'Provedor de identidade indisponível.', 503);
}

function sessionOut(data) {
  const s = data && data.session;
  if (!s) throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
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
    const { data, error } = await withTimeout(supabaseAuthClient().auth.getUser(jwt), env.AUTH_TIMEOUT_MS);
    if (error || !data || !data.user) throw error ? providerError(error) : createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
    return { id: data.user.id, email: data.user.email };
  },
  async signIn(email, password) {
    const { data, error } = await withTimeout(supabaseAuthClient().auth.signInWithPassword({ email, password }), env.AUTH_TIMEOUT_MS);
    if (error) throw providerError(error);
    return sessionOut(data);
  },
  async refresh(refreshToken) {
    const { data, error } = await withTimeout(supabaseAuthClient().auth.refreshSession({ refresh_token: refreshToken }), env.AUTH_TIMEOUT_MS);
    if (error) throw providerError(error);
    return sessionOut(data);
  },
  async signOut(jwt) {
    // Revoga a sessão do usuário (refresh tokens). Falha aqui não deve impedir o logout local.
    try { await withTimeout(supabaseAuthClient().auth.admin.signOut(jwt), env.AUTH_TIMEOUT_MS); } catch (_) { /* best effort */ }
  }
};

let current = supabaseProvider;
function getAuthProvider() { return current; }
function setAuthProvider(provider) { current = provider || supabaseProvider; }

module.exports = { getAuthProvider, setAuthProvider, supabaseProvider };

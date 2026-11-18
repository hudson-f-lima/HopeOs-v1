import { hostLocal } from './api-base.js';
import {
  SDK_KEY, INTENT_KEY, authEpoch, freshAuthId, readAuthJson, writeAuthStorage, sessionIdentity
} from './auth-storage.js';

const VERIFIER_KEY = SDK_KEY + '-code-verifier';
const REFRESH_LIMIT_KEY = 'hopeos.auth.refresh-limit';
const VERSIONED_SDK = new URL('./vendor/supabase-2.109.0.js', import.meta.url).href;
const INTENT_LIFETIME = 30 * 60 * 1000;
const OAUTH_ORIGINS = { google: 'https://accounts.google.com', apple: 'https://appleid.apple.com' };
const KNOWN_ORIGIN = 'https://gsttjozcmdvgstcpadiq.supabase.co';

let settings;
let client;
let loading;
let sdkStorage;
let onSessionChanged;
let authorizeWrite = false;
let expectedUser;
let expectedIdentity;
let currentSdkEpoch;
let verifierWriter;
const refreshLimitListeners = new Set();

export function uiAuthError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}

export function authProviderError(error, action) {
  const status = Number(error?.status);
  const code = error?.code;
  if (status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(code)) {
    return uiAuthError('Muitas tentativas. Aguarde alguns minutos.', 429, code);
  }
  if (!status || status >= 500 || error?.name === 'AuthRetryableFetchError') {
    return uiAuthError('Serviço de acesso indisponível. Tente novamente em instantes.', 503, code);
  }
  if (action === 'password' && (status === 401 || code === 'invalid_credentials')) {
    return uiAuthError('E-mail ou senha incorretos.', 401, code);
  }
  if (action === 'refresh') {
    const invalid = ['session_not_found', 'session_expired', 'bad_jwt', 'user_not_found', 'refresh_token_not_found',
      'refresh_token_already_used', 'AuthSessionMissingError'].includes(code || error?.name);
    return uiAuthError('Não foi possível renovar sua sessão.', status, invalid ? 'AUTH_SESSION_INVALID' : code);
  }
  if (action === 'send') return uiAuthError('Não foi possível enviar o e-mail agora. Tente novamente.', status, code);
  if (action === 'link') return uiAuthError('Não foi possível vincular essa conta. Verifique o provedor e tente novamente.', status, code);
  if (action === 'oauth') return uiAuthError('Não foi possível abrir o provedor de acesso. Tente novamente.', status, code);
  return uiAuthError('Link ou código inválido, expirado ou já usado. Solicite um novo.', status, code);
}

export function parseAuthConfig(data) {
  let url;
  try { url = new URL(data?.supabaseUrl); } catch { return null; }
  const local = hostLocal(window.location.hostname) && hostLocal(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
  if (url.origin !== KNOWN_ORIGIN && (!local || !['http:', 'https:'].includes(url.protocol))) return null;
  if (typeof data.publishableKey !== 'string' || !data.publishableKey.startsWith('sb_publishable_')) return null;
  const flags = data.providers || {};
  return {
    url: url.origin,
    key: data.publishableKey,
    providers: Object.fromEntries(['google', 'apple', 'magicLink', 'otp', 'linkIdentity'].map(p => [p, flags[p] === true]))
  };
}

export function sdkSession() {
  if (!settings || currentSdkEpoch !== authEpoch()) return null;
  const saved = readAuthJson(SDK_KEY);
  return saved?.epoch === currentSdkEpoch ? saved.value : null;
}

function activeIntent() {
  const intent = readAuthJson(INTENT_KEY);
  return intent?.epoch === currentSdkEpoch && intent.expiresAt > Date.now() ? intent : null;
}

function createSdkStorage() {
  return {
    getItem(key) {
      const saved = readAuthJson(key);
      if (key === VERIFIER_KEY && (!saved?.tx || saved.tx !== activeIntent()?.id)) return null;
      return saved?.epoch === currentSdkEpoch && currentSdkEpoch === authEpoch() ? JSON.stringify(saved.value) : null;
    },
    setItem(key, raw) {
      if (currentSdkEpoch !== authEpoch()) return;
      const value = JSON.parse(raw);
      if (key === VERIFIER_KEY) {
        if (!verifierWriter || verifierWriter !== activeIntent()?.id) return;
        writeAuthStorage(key, JSON.stringify({ epoch: currentSdkEpoch, value, tx: verifierWriter }));
        return;
      }
      if (key === SDK_KEY) {
        const existing = sdkSession();
        if (expectedUser && value.user?.id !== expectedUser) return;
        const identity = sessionIdentity(existing);
        if (authorizeWrite ? identity !== expectedIdentity : !identity || identity !== sessionIdentity(value)) return;
        delete value.provider_token;
        delete value.provider_refresh_token;
      }
      writeAuthStorage(key, JSON.stringify({ epoch: currentSdkEpoch, value }));
    },
    removeItem(key) {
      if (currentSdkEpoch !== authEpoch()) return;
      // O SDK também remove o verificador ao renovar uma sessão. A aplicação encerra
      // a transação PKCE explicitamente para que uma renovação não cancele o vínculo.
      if (key === VERIFIER_KEY && activeIntent()) return;
      writeAuthStorage(key, null);
    }
  };
}

function refreshLimited() {
  const notice = readAuthJson(REFRESH_LIMIT_KEY);
  return notice?.epoch === currentSdkEpoch && notice.until > Date.now();
}

function refreshLimitError() {
  return uiAuthError('Muitas tentativas de renovar a sessão. Aguarde e tente novamente.', 429, 'AUTH_REFRESH_RATE_LIMIT');
}

async function sdkFetch(input, options) {
  const url = new URL(input, settings.url);
  const renewal = options?.method === 'POST' && url.origin === settings.url &&
    url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token';
  if (!renewal) return fetch(input, { ...options, cache: 'no-store' });
  if (!refreshLimited()) {
    const response = await fetch(input, { ...options, cache: 'no-store' });
    const { status } = response;
    // O SDK já trata 500–504 e 520–530 como transitórios. Normalize as demais
    // falhas temporárias para aproveitar a retentativa e o intervalo do SDK.
    if (status === 408 || status === 425 || (status >= 505 && status < 520) || (status > 530 && status < 600)) {
      return new Response(null, { status: 503 });
    }
    if (status !== 429) return response;
    const retryAfter = response.headers.get('Retry-After');
    const now = Date.now();
    const retryTime = !retryAfter ? now + 60000
      : /^\d+$/.test(retryAfter) ? now + Number(retryAfter) * 1000 : Date.parse(retryAfter);
    const until = Number.isFinite(retryTime) ? Math.max(now + 1000, retryTime) : now + 60000;
    if (currentSdkEpoch === authEpoch()) {
      writeAuthStorage(REFRESH_LIMIT_KEY, JSON.stringify({ epoch: currentSdkEpoch, until }));
    }
  }
  for (const notify of refreshLimitListeners) notify();
  // Apenas a renovação traduz 429 para uma resposta temporária reconhecida pelo SDK.
  // O cooldown impede que as retentativas internas do SDK pressionem o provedor.
  return new Response(null, { status: 503 });
}

async function loadSdk() {
  if (window.supabase?.createClient) return;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = VERSIONED_SDK;
    script.integrity = 'sha256-nMtwuZhgu4FZO9gIcI9uHthhRu8TjxlCo37rOFGdWoE=';
    script.onload = resolve;
    script.onerror = () => {
      script.remove();
      reject(uiAuthError('Serviço de acesso indisponível. Tente novamente em instantes.', 503));
    };
    document.head.append(script);
  });
}

export async function configureSdk(config, notify) {
  settings = config;
  onSessionChanged = notify;
  currentSdkEpoch = authEpoch();
  sdkStorage = createSdkStorage();
  if (!sdkSession()) return;
  await getSdk();
}

async function getSdk() {
  if (!settings || authEpoch() !== currentSdkEpoch) throw uiAuthError('Sua sessão mudou. Entre novamente.', 401);
  loading ||= loadSdk().then(() => {
    client = window.supabase.createClient(settings.url, settings.key, {
      global: { fetch: sdkFetch },
      auth: {
        storage: sdkStorage,
        storageKey: SDK_KEY,
        autoRefreshToken: true,
        persistSession: true,
        flowType: 'pkce',
        detectSessionInUrl: false,
        lock: window.navigator?.locks ? window.supabase.navigatorLock : undefined
      }
    });
    client.auth.onAuthStateChange(event => onSessionChanged(event === 'SIGNED_IN' && !authorizeWrite));
    return client;
  }).catch(error => {
    loading = null;
    throw error;
  });
  return loading;
}

export async function sdkAuthSession(refresh = false) {
  const sdk = await getSdk();
  if (refreshLimited()) throw refreshLimitError();
  let notify;
  const limit = new Promise((_, reject) => {
    notify = () => reject(refreshLimitError());
    refreshLimitListeners.add(notify);
  });
  try {
    const request = refresh ? sdk.auth.refreshSession() : sdk.auth.getSession();
    const { data, error } = await Promise.race([request, limit]);
    if (currentSdkEpoch !== authEpoch()) throw uiAuthError('Sua sessão mudou. Entre novamente.', 401, 'AUTH_SESSION_INVALID');
    if (error && refreshLimited()) throw refreshLimitError();
    if (error) throw authProviderError(error, 'refresh');
    return data.session;
  } finally {
    refreshLimitListeners.delete(notify);
  }
}

async function authorizeSessionChange(operation, expected = null) {
  const sdk = await getSdk();
  if (authorizeWrite) throw uiAuthError('Aguarde a verificação em andamento.', 409);
  authorizeWrite = true;
  expectedUser = expected;
  expectedIdentity = sessionIdentity(sdkSession());
  try {
    const result = await operation(sdk.auth);
    if (authEpoch() !== currentSdkEpoch) throw uiAuthError('Sua sessão mudou. Entre novamente.', 401);
    if (expected && result.data?.session?.user?.id !== expected) {
      if (result.error) return result;
      throw uiAuthError('A vinculação não foi concluída. Entre novamente e tente outra vez.', 403);
    }
    if (result.data?.session && sdkSession()?.access_token !== result.data.session.access_token) {
      throw uiAuthError('Sua sessão mudou. Atualize a página e tente novamente.', 409);
    }
    return result;
  } finally {
    authorizeWrite = false;
    expectedUser = null;
    expectedIdentity = null;
  }
}

export async function sdkLogin(email, password) {
  const { data, error } = await authorizeSessionChange(auth => auth.signInWithPassword({ email, password }));
  if (error) throw authProviderError(error, 'password');
  eraseIntent(activeIntent()?.id);
  return data.session;
}

function newIntent(purpose, user = null) {
  if (verifierWriter) throw uiAuthError('Aguarde a solicitação em andamento.', 409);
  const id = freshAuthId();
  const url = new URL('./index.html', window.location.href);
  const query = new URLSearchParams(window.location.search);
  if (hostLocal(window.location.hostname) && query.has('apiBase')) url.searchParams.set('apiBase', query.get('apiBase'));
  url.searchParams.set('auth_callback', purpose);
  url.searchParams.set('auth_tx', id);
  const intent = { id, purpose, user, epoch: authEpoch(), expiresAt: Date.now() + INTENT_LIFETIME };
  writeAuthStorage(INTENT_KEY, JSON.stringify(intent));
  verifierWriter = id;
  return { id, redirectTo: url.href };
}

function eraseIntent(id) {
  if (!id) return;
  if (readAuthJson(INTENT_KEY)?.id !== id) return;
  writeAuthStorage(INTENT_KEY, null);
  writeAuthStorage(VERIFIER_KEY, null);
}

export function cancelAuthIntent(id) {
  eraseIntent(id);
}

export async function openOAuth(provider, user = null) {
  if (settings?.providers[provider] !== true || (user && !settings.providers.linkIdentity)) {
    throw uiAuthError('Método de acesso indisponível.', 403);
  }
  const sdk = await getSdk();
  const { id, redirectTo } = newIntent(user ? 'link' : 'oauth', user);
  const options = { redirectTo, skipBrowserRedirect: true };
  try {
    const { data, error } = user
      ? await sdk.auth.linkIdentity({ provider, options })
      : await sdk.auth.signInWithOAuth({ provider, options });
    if (error) throw authProviderError(error, user ? 'link' : 'oauth');
    if (authEpoch() !== currentSdkEpoch || readAuthJson(INTENT_KEY)?.id !== id) {
      throw uiAuthError('Sua sessão mudou. Tente novamente.', 401);
    }
    let target;
    try { target = new URL(data.url); } catch { /* o provedor não devolveu uma URL válida */ }
    if (!target || ![settings.url, OAUTH_ORIGINS[provider]].includes(target.origin) || target.username || target.password) {
      throw uiAuthError('Não foi possível abrir o provedor de acesso.', 503);
    }
    window.location.assign(target.href);
  } catch (error) {
    eraseIntent(id);
    throw error;
  } finally {
    verifierWriter = null;
  }
}

export async function requestEmailAccess(email) {
  const sdk = await getSdk();
  if (!settings.providers.magicLink && !settings.providers.otp) {
    throw uiAuthError('Método de acesso indisponível.', 403);
  }
  const { id, redirectTo } = newIntent('email');
  try {
    const { error } = await sdk.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
    if (error && !['user_not_found', 'otp_disabled', 'signup_disabled', 'email_not_confirmed'].includes(error.code)) {
      throw authProviderError(error, 'send');
    }
    if (authEpoch() !== currentSdkEpoch) throw uiAuthError('Sua sessão mudou. Tente novamente.', 401);
  } catch (error) {
    eraseIntent(id);
    throw error;
  } finally {
    verifierWriter = null;
  }
}

export async function verifyEmailCode(email, token) {
  if (!settings?.providers.otp) throw uiAuthError('Acesso por código indisponível.', 403);
  const { data, error } = await authorizeSessionChange(auth => auth.verifyOtp({ email, token, type: 'email' }));
  if (error) throw authProviderError(error, 'code');
  eraseIntent(activeIntent()?.id);
  return data.session;
}

export async function completeSdkCallback({ code, type, tx, tokenHash, access, refresh }) {
  if (code) {
    const intent = activeIntent();
    if (!intent || intent.claimed || intent.epoch !== authEpoch() ||
        !tx || tx !== intent.id || (type && type !== intent.purpose)) {
      throw uiAuthError('Este retorno não corresponde a um acesso iniciado neste navegador. Solicite um novo link ou digite o código.', 400);
    }
    const user = sdkSession()?.user?.id || null;
    if (user !== intent.user) throw uiAuthError('Sua sessão mudou. Inicie o acesso novamente.', 409);
    // Mantém o verificador até concluir a troca, mesmo quando o SDK renova na volta.
    writeAuthStorage(INTENT_KEY, JSON.stringify({ ...intent, claimed: true }));
    try {
      const { data, error } = await authorizeSessionChange(auth => auth.exchangeCodeForSession(code), intent.user);
      if (error) throw authProviderError(error, intent.purpose === 'link' ? 'link' : 'code');
      return { type: data.redirectType === 'recovery' ? 'recovery' : intent.purpose, session: data.session };
    } finally {
      eraseIntent(intent.id);
    }
  }

  if (!['invite', 'recovery'].includes(type) || (!tokenHash && !(access && refresh))) {
    throw uiAuthError('Link inválido ou expirado. Solicite um novo.', 400);
  }
  if (sdkSession()) throw uiAuthError('Saia da conta atual antes de abrir este link.', 409);
  const { data, error } = await authorizeSessionChange(auth => tokenHash
    ? auth.verifyOtp({ token_hash: tokenHash, type })
    : auth.setSession({ access_token: access, refresh_token: refresh }));
  if (error) throw authProviderError(error, 'code');
  return { type, session: data.session };
}

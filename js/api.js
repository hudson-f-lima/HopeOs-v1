import { apiBaseDaUrl } from './api-base.js';
import {
  EPOCH_KEY, INTENT_KEY, PASSWORD_KEY, SDK_KEY, SESSION_KEY, authEpoch, clearAuthMemory,
  freshAuthId, readAuthJson, sessionIdentity, writeAuthEpoch, writeAuthStorage
} from './auth-storage.js';
import {
  cancelAuthIntent, completeSdkCallback, configureSdk, openOAuth, parseAuthConfig, requestEmailAccess,
  sdkAuthSession, sdkLogin, sdkSession, uiAuthError, verifyEmailCode
} from './auth-sdk.js';

export let API_BASE = null;
export let authFeatures = {};
const FETCH_TIMEOUT_MS = 30000;
const EMPRESA_KEY = 'hopeos.auth.empresa';
const OLD_TOKEN_KEY = 'hopeos.apiToken';
const USED_LINKS_KEY = 'hopeos.auth.usedLinks';
let sdkEnabled = false;
let callback;
let callbackCaptured = false;
let contextController = new AbortController();
let sessionController = new AbortController();
let observedEpoch;
let observedIdentity;
let refreshing;
let authChannel;
const contextListeners = new Set();

export class AuthError extends Error {
  constructor(message, status = 401, code) {
    super(message || 'Sua sessão expirou. Entre novamente.');
    this.name = 'AuthError';
    this.status = status;
    this.code = code;
  }
}

export class StaleContextError extends Error {
  constructor() {
    super('O acesso ou a empresa mudou. Abra novamente o que estava usando.');
    this.name = 'StaleContextError';
  }
}

function storedSession() {
  if (sdkEnabled) return sdkSession();
  const stored = readAuthJson(SESSION_KEY);
  if (!stored?.access_token) return null;
  return (stored.epoch || 'initial') === authEpoch() ? stored : null;
}

export function getSession() {
  const session = storedSession();
  if (!session) return null;
  const selection = readAuthJson(EMPRESA_KEY, true);
  const identity = sessionIdentity(session);
  return { ...session, empresa_id: selection?.identity === identity ? selection.empresaId : null };
}

function advanceContext(reason) {
  const old = contextController;
  contextController = new AbortController();
  old.abort();
  if (!reason) return;
  for (const handler of contextListeners) handler(reason);
}

export function onAuthContextChanged(handler) {
  contextListeners.add(handler);
  return () => contextListeners.delete(handler);
}

function syncAuthContext(external = false) {
  const epoch = authEpoch();
  const identity = sessionIdentity(storedSession());
  if (epoch === observedEpoch && identity === observedIdentity) return;
  const previousIdentity = observedIdentity;
  const changedEpoch = observedEpoch !== undefined && epoch !== observedEpoch;
  observedEpoch = epoch;
  observedIdentity = identity;
  sessionController.abort();
  sessionController = new AbortController();
  if (changedEpoch || previousIdentity || (external && identity)) advanceContext(identity ? 'account' : 'signed-out');
  else advanceContext();
}

function watchAuthContext() {
  observedEpoch = authEpoch();
  observedIdentity = sessionIdentity(storedSession());
  window.addEventListener('storage', event => {
    if (![null, EPOCH_KEY, SESSION_KEY, SDK_KEY].includes(event.key)) return;
    if (event.newValue === null) clearAuthMemory(event.key);
    syncAuthContext(true);
  });
  window.addEventListener('pageshow', () => syncAuthContext(true));
  window.addEventListener('focus', () => syncAuthContext(true));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncAuthContext(true); });
  if (window.BroadcastChannel) {
    try {
      authChannel = new window.BroadcastChannel('hopeos.auth.context');
      authChannel.onmessage = ({ data }) => {
        if (data?.type !== 'logout') return;
        // O canal também funciona em navegadores que indisponibilizam localStorage.
        if (authEpoch() === data.previous) {
          writeAuthEpoch(data.epoch);
          clearAuthMemory(SESSION_KEY);
          clearAuthMemory(SDK_KEY);
        }
        syncAuthContext(true);
      };
    } catch { /* os eventos de storage e a verificação sob demanda continuam ativos */ }
  }
}

function captureContext() {
  syncAuthContext();
  return { signal: contextController.signal, sessionSignal: sessionController.signal, epoch: observedEpoch, identity: observedIdentity };
}

function assertContext(context) {
  assertSessionContext(context);
  if (context.signal.aborted) throw new StaleContextError();
}

function assertSessionContext(context) {
  syncAuthContext();
  if (context.epoch !== observedEpoch || context.identity !== observedIdentity) {
    throw new StaleContextError();
  }
}

function authHeaders(session) {
  return {
    Authorization: 'Bearer ' + session.access_token,
    ...(session.empresa_id ? { 'X-Empresa-Id': session.empresa_id } : {})
  };
}

async function fetchWithTimeout(url, options = {}) {
  const { timeoutMs = FETCH_TIMEOUT_MS, signal, ...request } = options;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const res = await fetch(url, { ...request, signal: controller.signal });
    return { res, json: await readResponse(res) };
  } catch (err) {
    if (signal?.aborted) throw new StaleContextError();
    if (err?.name === 'AbortError') throw uiAuthError('Tempo esgotado ao conectar com o servidor.', 503);
    if (err instanceof TypeError) throw uiAuthError('Sem conexão com o servidor. Tente novamente.', 503, 'NETWORK_ERROR');
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

async function readResponse(res) {
  try { return await res.json(); } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return {};
  }
}

function responseError(res, json) {
  let message = json.error?.message || `Erro HTTP ${res.status}`;
  if (res.status >= 500 && json.error?.requestId) message += ` (código ${json.error.requestId})`;
  return Object.assign(uiAuthError(message, res.status, json.error?.code || null), { details: json.error?.details || null });
}

async function postJson(path, body, options = {}) {
  const { headers, ...request } = options;
  const { res, json } = await fetchWithTimeout(API_BASE + path, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    ...request
  });
  if (!res.ok || json.ok === false) throw responseError(res, json);
  return json.data;
}

function keepLegacySession(data, context, previous) {
  assertSessionContext(context);
  if (!data?.access_token) throw new AuthError();
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
    instance: sessionIdentity(previous) || freshAuthId(),
    epoch: context.epoch
  };
  writeAuthStorage(SESSION_KEY, JSON.stringify(session));
  syncAuthContext();
  return getSession();
}

async function refreshSession(context, current) {
  assertContext(context);
  if (!current) return null;
  if (sdkEnabled) {
    await sdkAuthSession(true);
    assertContext(context);
    return getSession();
  }
  if (!current.refresh_token) return null;
  if (!refreshing || refreshing.identity !== context.identity || refreshing.epoch !== context.epoch) {
    const attempt = async () => {
      assertSessionContext(context);
      const startedWith = getSession();
      if (startedWith.access_token !== current.access_token) return startedWith;
      try {
        const data = await postJson('/auth/refresh', { refresh_token: current.refresh_token }, { signal: context.sessionSignal });
        assertSessionContext(context);
        const latest = getSession();
        if (latest.access_token !== current.access_token) return latest;
        return keepLegacySession(data, context, current);
      } catch (error) {
        assertSessionContext(context);
        const latest = getSession();
        if (latest.access_token !== current.access_token) return latest;
        throw error;
      }
    };
    const locks = window.navigator?.locks;
    const renewal = locks ? locks.request('hopeos.auth.legacy.refresh', attempt) : attempt();
    const request = {
      identity: context.identity,
      epoch: context.epoch,
      promise: renewal.finally(() => { if (refreshing === request) refreshing = null; })
    };
    refreshing = request;
  }
  return refreshing.promise;
}

async function readySession(context) {
  const session = getSession();
  if (!session) throw new AuthError();
  if (!session.expires_at || session.expires_at * 1000 - Date.now() >= 60000) return session;
  if (sdkEnabled) {
    await sdkAuthSession();
    assertContext(context);
    return getSession();
  }
  return (await refreshSession(context, session)) || session;
}

function revokeLocalSession() {
  const previous = authEpoch();
  const epoch = freshAuthId();
  writeAuthEpoch(epoch);
  for (const key of [SESSION_KEY, SDK_KEY, SDK_KEY + '-code-verifier', PASSWORD_KEY, INTENT_KEY, OLD_TOKEN_KEY]) {
    writeAuthStorage(key, null);
  }
  writeAuthStorage(EMPRESA_KEY, null, true);
  try { authChannel?.postMessage({ type: 'logout', previous, epoch }); } catch { /* canal indisponível */ }
  syncAuthContext();
}

async function expireSession(context, error) {
  assertContext(context);
  if (error && error.status !== 401 && error.code !== 'AUTH_SESSION_INVALID') throw error;
  revokeLocalSession();
  throw new AuthError(error?.message, error?.status, error?.code);
}

export async function login(email, password) {
  const context = captureContext();
  if (context.identity) throw new AuthError('Já há uma sessão iniciada. Atualize a página para continuar.');
  if (sdkEnabled) return sdkLogin(email, password);
  const data = await postJson('/auth/login', { email, password }, { signal: context.signal });
  return keepLegacySession(data, context);
}

export async function logout({ revoke = true } = {}) {
  const session = getSession();
  revokeLocalSession();
  if (!session || !revoke) return;
  // A invalidação local acontece antes da rede e o pedido de revogação sobrevive ao reload.
  try {
    await postJson('/auth/logout', {}, {
      headers: { Authorization: 'Bearer ' + session.access_token },
      keepalive: true
    });
  } catch { /* a sessão local já foi invalidada */ }
}

export function selectEmpresa(empresaId) {
  const session = getSession();
  if (!session) throw new AuthError();
  if (session.empresa_id === empresaId) return;
  writeAuthStorage(EMPRESA_KEY, JSON.stringify({ identity: sessionIdentity(session), empresaId }), true);
  advanceContext(session.empresa_id ? 'enterprise' : null);
}

function readCallback(location) {
  const url = new URL(location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const keys = ['auth_callback', 'auth_tx', 'code', 'token_hash', 'type', 'error', 'error_code', 'error_description',
    'access_token', 'refresh_token', 'expires_in', 'provider_token', 'provider_refresh_token'];
  const get = key => url.searchParams.get(key) ?? fragment.get(key);
  const result = {
    code: get('code'),
    tx: get('auth_tx'),
    type: get('auth_callback') || get('type'),
    tokenHash: get('token_hash'),
    access: fragment.get('access_token'),
    refresh: fragment.get('refresh_token'),
    expiresIn: fragment.get('expires_in'),
    error: get('error') || get('error_code')
  };
  const present = ['auth_callback', 'code', 'token_hash', 'access_token', 'error_code', 'error'].some(k => get(k) !== null);
  let cleaned = url.searchParams.has('apiToken');
  url.searchParams.delete('apiToken');
  for (const key of keys) {
    if (url.searchParams.has(key)) cleaned = true;
    url.searchParams.delete(key);
  }
  if (keys.some(key => fragment.has(key))) { url.hash = ''; cleaned = true; }
  if (cleaned) window.history.replaceState(window.history.state, '', url.href);
  return present ? result : null;
}

async function acceptImplicitLink(link) {
  if (!link.access) return;
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(link.access));
  const id = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  const previous = readAuthJson(USED_LINKS_KEY);
  const valid = Array.isArray(previous) ? previous.filter(item => item.expiresAt > now).slice(-79) : [];
  if (valid.some(item => item.id === id)) throw uiAuthError('Este link já foi usado. Solicite outro.', 400);
  const expires = Number(link.expiresIn) || 3600;
  valid.push({ id, expiresAt: now + Math.min(Math.max(expires, 60), 86400) * 1000 });
  writeAuthStorage(USED_LINKS_KEY, JSON.stringify(valid));
}

export async function consumeAuthLink() {
  const link = callback;
  callback = null;
  if (!link) return null;
  if (link.error) {
    cancelAuthIntent(link.tx);
    if (link.error === 'access_denied' || link.error === 'user_cancelled') {
      throw uiAuthError('O acesso foi cancelado. Você pode tentar novamente.', 400);
    }
    throw uiAuthError('Link inválido ou expirado. Solicite outro para continuar.', 400);
  }
  const context = captureContext();
  if (link.access) {
    if (context.identity) throw uiAuthError('Saia da conta atual antes de abrir este link.', 409);
    await acceptImplicitLink(link);
    assertContext(context);
  }
  let type;
  if (sdkEnabled) {
    ({ type } = await completeSdkCallback(link));
  } else if (link.access && ['invite', 'recovery', 'magiclink'].includes(link.type)) {
    type = link.type;
    keepLegacySession({ access_token: link.access, refresh_token: link.refresh, expires_in: link.expiresIn }, context);
  } else {
    throw uiAuthError('Este link não pode ser usado. Solicite um novo acesso.', 400);
  }
  if (['invite', 'recovery'].includes(type)) {
    writeAuthStorage(PASSWORD_KEY, JSON.stringify({ identity: sessionIdentity(storedSession()), type }));
  }
  return type;
}

export function pendingPassword() {
  const pending = readAuthJson(PASSWORD_KEY);
  const identity = sessionIdentity(storedSession());
  return identity && pending?.identity === identity ? pending.type : null;
}

export async function definirSenha(password) {
  const result = await api('/auth/password', { method: 'POST', body: { password } });
  writeAuthStorage(PASSWORD_KEY, null);
  return result;
}

export async function recuperarSenha(email) {
  // O link de recuperação precisa funcionar também fora da janela que o solicitou.
  return postJson('/auth/recover', { email });
}

export { openOAuth, requestEmailAccess, verifyEmailCode };

export function fetchMe() {
  return api('/me');
}

export function aceitarPrivacidade(versao) {
  return api('/auth/privacidade/aceite', { method: 'POST', body: { versao } });
}

export async function loadConfig() {
  const apiBaseOverride = apiBaseDaUrl(window.location);
  if (!callbackCaptured) {
    callback = readCallback(window.location);
    callbackCaptured = true;
  }
  writeAuthStorage(OLD_TOKEN_KEY, null);
  if (apiBaseOverride) {
    API_BASE = apiBaseOverride;
  } else {
    const { res, json: cfg } = await fetchWithTimeout('./config.json', { cache: 'no-store', timeoutMs: 12000 });
    if (!res.ok) throw uiAuthError('Não foi possível carregar a configuração do app.', res.status);
    if (!cfg?.apiBase) throw uiAuthError('Configuração incompleta.', 503);
    API_BASE = String(cfg.apiBase).replace(/\/+$/, '');
  }
  const requestConfig = async () => {
    const result = await fetchWithTimeout(API_BASE + '/auth/config', { cache: 'no-store' });
    if (result.res.status >= 500) throw responseError(result.res, result.json);
    return result;
  };
  let result;
  try { result = await requestConfig(); } catch (error) {
    if (error.status < 500 || !error.status) throw error;
    result = await requestConfig();
  }
  const { res, json } = result;
  // Compatibilidade durante a troca da versão estática e da API.
  const oldApi = res.status === 404 || (res.status === 401 && json.ok === false && json.error?.code === 'UNAUTHENTICATED');
  if (!res.ok && !oldApi) throw responseError(res, json);
  const config = parseAuthConfig(json.data);
  sdkEnabled = !!config;
  authFeatures = config?.providers || {};
  if (sdkEnabled) {
    // A sessão legada não é promovida ao SDK. O usuário entra uma vez pelo novo fluxo.
    writeAuthStorage(SESSION_KEY, null);
    await configureSdk(config, syncAuthContext);
  } else {
    // Desligar a migração exige uma nova autenticação no fluxo anterior.
    writeAuthStorage(SDK_KEY, null);
    writeAuthStorage(SDK_KEY + '-code-verifier', null);
    writeAuthStorage(INTENT_KEY, null);
  }
  watchAuthContext();
}

export async function api(path, options = {}) {
  if (!API_BASE) throw new Error('API não configurada.');
  const context = captureContext();
  let session;
  try { session = await readySession(context); }
  catch (error) {
    if (error instanceof AuthError) throw error;
    return expireSession(context, error);
  }
  assertContext(context);
  if (!session) return expireSession(context);
  const send = async active => {
    assertContext(context);
    const { res, json } = await fetchWithTimeout(API_BASE + path, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        ...authHeaders(active)
      },
      method: options.method || 'GET',
      body: options.body ? JSON.stringify(options.body) : undefined,
      timeoutMs: options.timeoutMs,
      cache: 'no-store',
      signal: context.signal
    });
    assertContext(context);
    return { res, json };
  };
  let { res, json } = await send(session);
  if (res.status === 401 || json.error?.code === 'AUTH_SESSION_INVALID') {
    // Um fechamento mantém journal de cada envio. Repetição automática ocultaria
    // a primeira tentativa do contador de resultados incertos.
    if (options.retryOnAuth === false) return expireSession(context, responseError(res, json));
    try {
      const current = getSession();
      if (current?.access_token === session.access_token) session = await refreshSession(context, current);
      else session = current;
    } catch (error) {
      return expireSession(context, error);
    }
    assertContext(context);
    if (!session) return expireSession(context, responseError(res, json));
    ({ res, json } = await send(session));
    if (res.status === 401 || json.error?.code === 'AUTH_SESSION_INVALID') return expireSession(context, responseError(res, json));
  }
  if (!res.ok || json.ok === false) throw responseError(res, json);
  return json.data;
}

export function getAgendaSlots({ data, profissionalId, servicoId }) {
  const params = new URLSearchParams({ data, profissionalId, servicoId });
  return api('/agenda/slots?' + params.toString());
}

export function getInsightsOccupancy(from, to) {
  const params = new URLSearchParams({ from, to });
  return api('/insights/occupancy?' + params.toString());
}

export function getInsightsMargin(from, to) {
  const params = new URLSearchParams({ from, to });
  return api('/insights/margin?' + params.toString());
}

export function getInsightsCashflow(days = 30) {
  return api('/insights/cashflow?days=' + encodeURIComponent(String(days)));
}

export function getInsightsRetention() {
  return api('/insights/retention');
}

export function getInsightsAttach() {
  return api('/insights/attach');
}

export function getInsightsRebooking(clienteId, servicoId) {
  const query = servicoId ? '?' + new URLSearchParams({ servicoId }).toString() : '';
  return api(`/insights/rebooking/${clienteId}${query}`);
}

export function getAgendaHistorico(agendamentoId) {
  return api(`/agenda/${encodeURIComponent(agendamentoId)}/historico`);
}

export function getClientReliability(clienteId) {
  return api(`/insights/clients/${clienteId}/reliability`);
}

export function getListaEspera(params = {}) {
  const query = new URLSearchParams(params);
  const qs = query.toString();
  return api('/lista-espera' + (qs ? '?' + qs : ''));
}

export function createListaEspera(body) {
  return api('/lista-espera', { method: 'POST', body });
}

export function updateListaEspera(id, body) {
  return api(`/lista-espera/${id}`, { method: 'PATCH', body });
}

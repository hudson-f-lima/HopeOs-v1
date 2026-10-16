export let API_BASE = null;

const FETCH_TIMEOUT_MS = 30000;
const TOKEN_KEY = 'hopeos.apiToken';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* modo privado sem storage: sessao vive so em memoria */ }
}

export class AuthError extends Error {
  constructor(message) {
    super(message || 'Credencial ausente ou invalida.');
    this.name = 'AuthError';
  }
}

// Sessão de usuário (login por e-mail/senha via backend → Supabase Auth).
// Tem prioridade sobre o token legado (hopeos.apiToken), que segue como transição.
const SESSION_KEY = 'hopeos.session';
let memorySession = null;

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : memorySession;
  } catch { return memorySession; }
}

export function setSession(session) {
  memorySession = session || null;
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* modo privado: sessão só em memória */ }
}

function authHeaders() {
  const session = getSession();
  if (session && session.access_token) {
    return {
      Authorization: 'Bearer ' + session.access_token,
      ...(session.empresa_id ? { 'X-Empresa-Id': session.empresa_id } : {})
    };
  }
  const token = getToken();
  return token ? { Authorization: 'Bearer ' + token } : {};
}

async function postJson(path, body, headers = {}) {
  const res = await fetchWithTimeout(API_BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body || {})
  });
  let json; try { json = await res.json(); } catch { json = {}; }
  if (!res.ok || json.ok === false) {
    const err = new Error((json.error && json.error.message) || `Erro HTTP ${res.status}`);
    err.status = res.status;
    err.code = json.error && json.error.code;
    throw err;
  }
  return json.data;
}

function keepSession(data, previous) {
  const session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
    empresa_id: previous ? previous.empresa_id : null
  };
  setSession(session);
  return session;
}

let refreshing = null;
async function refreshSession() {
  const current = getSession();
  if (!current || !current.refresh_token) return false;
  // Uma renovação por vez: várias chamadas concorrentes esperam a mesma.
  refreshing = refreshing || postJson('/auth/refresh', { refresh_token: current.refresh_token })
    .then(data => { keepSession(data, current); return true; })
    .catch(() => false)
    .finally(() => { refreshing = null; });
  return refreshing;
}

async function ensureFreshSession() {
  const s = getSession();
  if (s && s.expires_at && s.expires_at * 1000 - Date.now() < 60000) await refreshSession();
}

export async function login(email, password) {
  setToken(null); // login de usuário substitui o token legado neste aparelho
  const data = await postJson('/auth/login', { email, password });
  return keepSession(data, null);
}

export async function logout() {
  const s = getSession();
  setSession(null);
  if (s && s.access_token) {
    try { await postJson('/auth/logout', {}, { Authorization: 'Bearer ' + s.access_token }); } catch { /* logout local já feito */ }
  }
}

export function selectEmpresa(empresaId) {
  const s = getSession();
  if (s) setSession({ ...s, empresa_id: empresaId });
}

export function fetchMe() {
  return api('/me');
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('Tempo esgotado ao conectar com o servidor.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadConfig() {
  // Etapa 1: Ler parâmetros de URL primeiro (antes de qualquer requisição)
  const tokenOverride = new URLSearchParams(window.location.search).get('apiToken');
  if (tokenOverride && tokenOverride.trim()) {
    setToken(tokenOverride.trim());
    console.log('[Auth] Token recebido via URL (apiToken param)');
  }

  const apiBaseOverride = new URLSearchParams(window.location.search).get('apiBase');
  if (apiBaseOverride) {
    API_BASE = apiBaseOverride.replace(/\/+$/, '');
    console.log('[Config] API_BASE configurado via URL:', API_BASE);
    return; // Sucesso: saiar sem carregar config.json
  }

  // Etapa 2: Carregar config.json do servidor (fallback padrão)
  try {
    const res = await fetchWithTimeout('./config.json', { cache: 'no-store', timeoutMs: 12000 });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ao carregar config.json`);
    }
    const cfg = await res.json();
    if (!cfg || !cfg.apiBase) {
      throw new Error('config.json incompleto (apiBase ausente)');
    }
    API_BASE = String(cfg.apiBase).replace(/\/+$/, '');
    console.log('[Config] API_BASE carregado de config.json:', API_BASE);
  } catch (err) {
    throw new Error(`Falha ao carregar configuracao: ${err.message}. Use ?apiBase=URL&apiToken=TOKEN para override.`);
  }
}

export async function api(path, options = {}, retried = false) {
  if (!API_BASE) {
    throw new Error('API_BASE nao configurada. Chame loadConfig() primeiro.');
  }
  await ensureFreshSession();
  const res = await fetchWithTimeout(API_BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {})
    },
    method: options.method || 'GET',
    body: options.body ? JSON.stringify(options.body) : undefined,
    timeoutMs: options.timeoutMs
  });
  let json;
  try { json = await res.json(); } catch { json = {}; }
  if (res.status === 401) {
    // Sessão expirada no meio do uso: renova uma vez e repete a chamada.
    if (!retried && getSession() && await refreshSession()) return api(path, options, true);
    if (getSession()) setSession(null);
    throw new AuthError((json.error && json.error.message) || undefined);
  }
  if (!res.ok || json.ok === false) {
    const msg = (json.error && json.error.message) || `Erro HTTP ${res.status}`;
    throw new Error(msg);
  }
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

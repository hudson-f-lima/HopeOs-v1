export let API_BASE = null;

const FETCH_TIMEOUT_MS = 30000;

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
  const override = new URLSearchParams(window.location.search).get('apiBase');
  if (override) { 
    API_BASE = override.replace(/\/+$/, ''); 
    return; 
  }
  const res = await fetchWithTimeout('./config.json', { cache: 'no-store', timeoutMs: 12000 });
  if (!res.ok) throw new Error('Configuração do app indisponível (HTTP ' + res.status + ')');
  const cfg = await res.json();
  if (!cfg || !cfg.apiBase) throw new Error('Configuração do app incompleta.');
  API_BASE = String(cfg.apiBase).replace(/\/+$/, '');
}

export async function api(path, options = {}) {
  if (!API_BASE) {
    throw new Error('API_BASE não configurada. Chame loadConfig() primeiro.');
  }
  const res = await fetchWithTimeout(API_BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    method: options.method || 'GET',
    body: options.body ? JSON.stringify(options.body) : undefined,
    timeoutMs: options.timeoutMs
  });
  let json;
  try { json = await res.json(); } catch { json = {}; }
  if (!res.ok || json.ok === false) {
    const msg = (json.error && json.error.message) || `Erro HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json.data;
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

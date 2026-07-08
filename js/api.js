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

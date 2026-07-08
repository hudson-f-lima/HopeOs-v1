export let API_BASE = null;

export async function loadConfig() {
  const override = new URLSearchParams(window.location.search).get('apiBase');
  if (override) { 
    API_BASE = override.replace(/\/+$/, ''); 
    return; 
  }
  const res = await fetch('./config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('Configuração do app indisponível (HTTP ' + res.status + ')');
  const cfg = await res.json();
  if (!cfg || !cfg.apiBase) throw new Error('Configuração do app incompleta.');
  API_BASE = String(cfg.apiBase).replace(/\/+$/, '');
}

export async function api(path, options = {}) {
  if (!API_BASE) {
    throw new Error('API_BASE não configurada. Chame loadConfig() primeiro.');
  }
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    method: options.method || 'GET',
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let json;
  try { json = await res.json(); } catch { json = {}; }
  if (!res.ok || json.ok === false) {
    const msg = (json.error && json.error.message) || `Erro HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json.data;
}

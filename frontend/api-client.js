// HOPE OS Frontend API Client
// Uso no HTML: <script src="api-client.js"></script>
// Regra: frontend chama API; frontend não calcula financeiro.

window.HopeApi = (() => {
  const API_BASE = localStorage.getItem('hope_api_base') || 'http://localhost:3333/api';

  async function request(path, options = {}) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) {
      throw new Error(json.error || `Erro HTTP ${res.status}`);
    }
    return json.data;
  }

  return {
    setBaseUrl(url) { localStorage.setItem('hope_api_base', url); },
    health: () => request('/health'),
    snapshot: () => request('/snapshot'),
    dashboard: () => request('/dashboard'),
    financeiroResumo: () => request('/financeiro/resumo'),
    clientes: () => request('/clientes'),
    servicos: () => request('/servicos'),
    profissionais: () => request('/profissionais'),
    agenda: (data) => request(`/agenda?data=${encodeURIComponent(data)}`),
    checkoutPreview: (payload) => request('/checkout/preview', { method: 'POST', body: payload }),
    checkoutClose: (payload) => request('/checkout/close', { method: 'POST', body: payload })
  };
})();

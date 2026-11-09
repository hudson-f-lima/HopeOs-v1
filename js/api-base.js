// Override de API pela URL (?apiBase=) — só em ambiente local (Red Team 2026-11, RT-07).
//
// Antes: qualquer link `index.html?apiBase=https://atacante/api` ou
// `agendar.html?s=salao&apiBase=...` fazia a página legítima (mesmo domínio, mesmo
// visual) mandar e-mail/senha ou nome/WhatsApp do cliente para o servidor do
// atacante. Em hospedagem sem a CSP do render.yaml (ex.: GitHub Pages) nada barrava.
//
// Regra: o override só vale quando a PRÓPRIA página está servida de um host local
// (localhost, 127.x, ::1, *.local ou IP de rede privada: E2E, dev e celular na LAN).
// Em qualquer outro host o parâmetro é ignorado e vale o config.json.

const PRIVADO_V4 = /^(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

export function hostLocal(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || h.endsWith('.localhost') || h.endsWith('.local') || PRIVADO_V4.test(h);
}

// Devolve a URL de override (sem barra final) ou null quando não há override aceito.
export function apiBaseDaUrl(loc) {
  const valor = new URLSearchParams((loc && loc.search) || '').get('apiBase');
  if (!valor || !hostLocal(loc && loc.hostname)) return null;
  let url;
  try { url = new URL(valor); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return valor.replace(/\/+$/, '');
}

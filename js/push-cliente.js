// Lembretes por notificação no aparelho do cliente (C5, D-041). Usado pela página do link pessoal.
// - Ativar: pede permissão, registra o service worker do cliente (escopo próprio), assina o push e
//   manda a assinatura ao servidor presa ao link. O código do link fica guardado neste aparelho
//   (localStorage) para o toque na notificação abrir o horário; some ao desativar ou se o link
//   deixar de valer.
// - Sem suporte (ex.: iPhone fora da Tela de Início), a página explica o caminho.
const ESCOPO = './cliente-push/';
const CHAVE_TOKEN = 'hopeos.meuHorario.token';

export function tokenGuardado() { try { return localStorage.getItem(CHAVE_TOKEN) || ''; } catch { return ''; } }
export function guardarToken(t) { try { localStorage.setItem(CHAVE_TOKEN, t); } catch { /* aparelho sem armazenamento */ } }
export function esquecerToken() { try { localStorage.removeItem(CHAVE_TOKEN); } catch { /* idem */ } }

export function suportado() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
export function ehIphoneForaDaTela() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  return ios && !standalone;
}

export function chaveParaBytes(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const bin = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function esperarAtivo(reg) {
  if (reg.active) return reg;
  const sw = reg.installing || reg.waiting;
  if (!sw) return reg;
  await new Promise(resolve => {
    if (sw.state === 'activated') return resolve();
    sw.addEventListener('statechange', () => { if (sw.state === 'activated') resolve(); });
  });
  return reg;
}

export async function assinaturaAtual() {
  if (!suportado()) return null;
  const reg = await navigator.serviceWorker.getRegistration(ESCOPO);
  return reg ? reg.pushManager.getSubscription() : null;
}

// Devolve a assinatura (toJSON) já criada no navegador; o servidor guarda depois.
export async function ativar(chavePublica) {
  const permissao = await Notification.requestPermission();
  if (permissao !== 'granted') throw new Error('PERMISSAO_NEGADA');
  const reg = await esperarAtivo(await navigator.serviceWorker.register('./sw-cliente.js', { scope: ESCOPO }));
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chavePublica) });
  return sub.toJSON();
}

export async function desativar() {
  const sub = await assinaturaAtual();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch { /* o servidor revoga mesmo assim */ }
  return endpoint;
}

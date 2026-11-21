export const SESSION_KEY = 'hopeos.session';
export const SDK_KEY = 'hopeos.auth.sdk';
export const EPOCH_KEY = 'hopeos.auth.epoch';
export const INTENT_KEY = 'hopeos.auth.intent';
export const PASSWORD_KEY = 'hopeos.auth.password';

const memory = new Map();
const tabMemory = new Map();
const blocked = new Map();
const tabBlocked = new Map();
const TAB_EPOCH_KEY = 'hopeos.auth.tab-epoch';

function storageFor(tab) {
  return tab ? window.sessionStorage : window.localStorage;
}

export function readAuthStorage(key, tab = false) {
  const fallback = tab ? tabMemory : memory;
  const unavailable = tab ? tabBlocked : blocked;
  try {
    const value = storageFor(tab).getItem(key);
    if (unavailable.has(key) && unavailable.get(key) === value) return fallback.get(key) ?? null;
    unavailable.delete(key);
    if (value === null) fallback.delete(key);
    else fallback.set(key, value);
    return value;
  } catch {
    return fallback.get(key) ?? null;
  }
}

export function writeAuthStorage(key, value, tab = false) {
  const fallback = tab ? tabMemory : memory;
  const unavailable = tab ? tabBlocked : blocked;
  if (value === null) fallback.delete(key);
  else fallback.set(key, value);
  try {
    if (value === null) storageFor(tab).removeItem(key);
    else storageFor(tab).setItem(key, value);
    unavailable.delete(key);
    return true;
  } catch {
    try { unavailable.set(key, storageFor(tab).getItem(key)); } catch { /* storage também indisponível para leitura */ }
    return false;
  }
}

export function clearAuthMemory(key) {
  if (key === null) { memory.clear(); blocked.clear(); }
  else { memory.delete(key); blocked.delete(key); }
}

export function readAuthJson(key, tab = false) {
  try { return JSON.parse(readAuthStorage(key, tab)); } catch { return null; }
}

export function authEpoch() {
  const shared = readAuthStorage(EPOCH_KEY);
  const local = readAuthJson(TAB_EPOCH_KEY, true);
  if (local?.base === shared) return local.epoch;
  return shared || 'initial';
}

export function writeAuthEpoch(epoch) {
  const previous = readAuthStorage(EPOCH_KEY);
  const saved = writeAuthStorage(EPOCH_KEY, epoch);
  writeAuthStorage(TAB_EPOCH_KEY, saved ? null : JSON.stringify({ base: previous, epoch }), true);
}

export function freshAuthId() {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

// A sessão e a seleção operacional têm escopos diferentes. A seleção pertence à aba.
export function sessionIdentity(session) {
  if (!session?.access_token) return null;
  if (session.instance) return session.instance;
  try {
    const body = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const { session_id: id, sub } = JSON.parse(atob(body));
    if (id || sub) return id || sub;
  } catch { /* tokens opacos de desenvolvimento ou de versões antigas */ }
  return session.user?.id || session.access_token;
}

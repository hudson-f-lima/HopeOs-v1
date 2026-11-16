// Lembretes automáticos de horário (C5, D-041, migration 020). Parte pura: sem banco, sem rede.
//
// Dois lembretes por horário:
//   d1  entre 24 h e 12 h antes do início;
//   h2  entre 2 h e 30 min antes do início.
// As janelas são largas de propósito: o servidor pode ficar parado alguns minutos (a instância
// gratuita do Render dorme) e o lembrete ainda sai quando acordar. Passou da janela, não sai:
// lembrete atrasado é pior que nenhum.
//
// Regra da assinatura: só recebe o lembrete quem ligou o push ANTES de a janela abrir. Quem agenda
// e liga o push na confirmação para um horário que já está a menos de 24 h não recebe o d1
// (acabou de ver o horário); quem liga a menos de 2 h do horário não recebe o h2.
const HORA = 3600e3;
const MIN = 60e3;
const JANELAS = Object.freeze({
  d1: { antes: 24 * HORA, ate: 12 * HORA },
  h2: { antes: 2 * HORA, ate: 30 * MIN }
});
const TIPOS = Object.freeze(Object.keys(JANELAS));

// Quais lembretes estão na janela agora (`agoraMs` e `inicioMs` em milissegundos).
function tiposNaJanela(agoraMs, inicioMs) {
  return TIPOS.filter(t => agoraMs >= inicioMs - JANELAS[t].antes && agoraMs < inicioMs - JANELAS[t].ate);
}
// A assinatura vale para o tipo se existia antes de a janela abrir.
const assinaturaValeParaTipo = (criadaEmMs, inicioMs, tipo) => criadaEmMs < inicioMs - JANELAS[tipo].antes;

const dd = n => String(n).padStart(2, '0');
function dataCurta(data) { const [, m, d] = String(data).split('-'); return `${dd(d)}/${dd(m)}`; }

// Texto do aviso. Só o necessário: serviço, salão, dia e hora (sem preço, sem nome do cliente).
function montarMensagem({ tipo, salaoNome, servicoNome, data, horario }) {
  const hora = String(horario).slice(0, 5);
  const onde = salaoNome ? ` em ${salaoNome}` : '';
  const servico = servicoNome || 'Seu horário';
  if (tipo === 'h2') {
    return { titulo: 'Seu horário é daqui a pouco', corpo: `${servico}${onde}, hoje às ${hora}.`, tag: 'lembrete-h2' };
  }
  return { titulo: 'Lembrete do seu horário', corpo: `${servico}${onde}, ${dataCurta(data)} às ${hora}.`, tag: 'lembrete-d1' };
}

// Servidores de push que o servidor aceita como destino. O endereço da assinatura vem do
// aparelho do cliente: sem esta lista, quem montasse uma assinatura falsa faria o servidor chamar
// qualquer endereço (SSRF). Só https, sem usuário e senha, sem porta diferente de 443.
const HOSTS_PUSH_EXATOS = ['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'web.push.apple.com'];
const SUFIXOS_PUSH = ['.push.apple.com', '.notify.windows.com', '.push.services.mozilla.com'];
function endpointPermitido(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 600) return false;
  let u;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  const h = u.hostname.toLowerCase();
  return HOSTS_PUSH_EXATOS.includes(h) || SUFIXOS_PUSH.some(s => h.endsWith(s) && h.length > s.length);
}

const B64URL = /^[A-Za-z0-9_-]+$/;
// Assinatura vinda do navegador (PushSubscription.toJSON): só os três campos que importam.
function validarAssinatura(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  const { endpoint, keys } = a;
  if (!endpointPermitido(endpoint)) return null;
  if (!keys || typeof keys !== 'object') return null;
  const { p256dh, auth } = keys;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !B64URL.test(p256dh) || !B64URL.test(auth) || p256dh.length > 200 || auth.length > 100) return null;
  return { endpoint, keys: { p256dh, auth } };
}

module.exports = { JANELAS, TIPOS, tiposNaJanela, assinaturaValeParaTipo, montarMensagem, endpointPermitido, validarAssinatura };

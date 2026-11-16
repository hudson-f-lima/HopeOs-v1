// Canais de lembrete (C5, D-041). Cada canal é { nome, ativo(), enviar(...) }.
//
// - push: ATIVO quando as chaves VAPID estão no ambiente (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
//   VAPID_SUBJECT). Sem elas o canal fica desligado e o resto do sistema segue igual.
// - whatsapp e sms: PRÉ-CONFIGURADOS e DESLIGADOS, até o dono escolher o fornecedor. O contrato
//   (adaptador) está pronto; falta só um provedor registrado e as duas travas abertas:
//     1) WHATSAPP_ENABLED=true / SMS_ENABLED=true no ambiente (e um provedor registrado);
//     2) `podeContatar(cliente)`: hoje devolve false sempre, porque o cadastro ainda não tem o
//        "não quero receber mensagens" do cliente. Abrir o canal exige primeiro esse campo.
//   Enquanto as travas estiverem fechadas nenhuma mensagem sai, e o serviço nem tenta.
const { endpointPermitido } = require('./lembretes');

const PROVEDORES = new Map(); // nome do canal -> { enviar({ telefone, mensagem }) }
function registrarProvedor(canal, impl) { PROVEDORES.set(canal, impl); }
function limparProvedores() { PROVEDORES.clear(); }

function criarCanalPush({ env, webpush }) {
  const chaves = () => ({ pub: env.VAPID_PUBLIC_KEY, priv: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT });
  return {
    nome: 'push',
    ativo() { const k = chaves(); return Boolean(k.pub && k.priv && k.subject); },
    chavePublica() { return this.ativo() ? env.VAPID_PUBLIC_KEY : null; },
    // Devolve { ok, revogar, motivo }. 404 e 410 = assinatura morta (aparelho desinstalou): revogar.
    async enviar({ assinatura, mensagem }) {
      if (!this.ativo()) return { ok: false, motivo: 'desligado' };
      if (!endpointPermitido(assinatura && assinatura.endpoint)) return { ok: false, revogar: true, motivo: 'endpoint_nao_permitido' };
      const k = chaves();
      try {
        await webpush.sendNotification(assinatura, JSON.stringify({ titulo: mensagem.titulo, corpo: mensagem.corpo, tag: mensagem.tag, url: './meu-horario.html' }), {
          TTL: 3600, urgency: 'normal', timeout: 10000, vapidDetails: { subject: k.subject, publicKey: k.pub, privateKey: k.priv }
        });
        return { ok: true };
      } catch (err) {
        const status = err && err.statusCode;
        if (status === 404 || status === 410) return { ok: false, revogar: true, motivo: `http_${status}` };
        return { ok: false, motivo: status ? `http_${status}` : 'rede' };
      }
    }
  };
}

function criarCanalProvedor(nome, { env }) {
  const NOME = nome.toUpperCase();
  return {
    nome,
    ativo() { return env[`${NOME}_ENABLED`] === 'true' && PROVEDORES.has(nome); },
    // Trava do cliente: ainda não existe o campo de "não quero receber". Fechada de propósito.
    podeContatar() { return false; },
    async enviar({ telefone, mensagem }) {
      const p = PROVEDORES.get(nome);
      if (!this.ativo() || !p) return { ok: false, motivo: 'desligado' };
      try { await p.enviar({ telefone, mensagem }); return { ok: true }; } catch { return { ok: false, motivo: 'provedor' }; }
    }
  };
}

function criarCanais({ env, webpush }) {
  return { push: criarCanalPush({ env, webpush }), whatsapp: criarCanalProvedor('whatsapp', { env }), sms: criarCanalProvedor('sms', { env }) };
}

module.exports = { criarCanais, criarCanalPush, criarCanalProvedor, registrarProvedor, limparProvedores };

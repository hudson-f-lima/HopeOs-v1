// Agendador dos lembretes (C5, D-041): uma rodada por minuto dentro do próprio servidor. Sem
// fila nem serviço externo. Se o servidor dormir (instância gratuita do Render sem ping), a
// rodada espera ele acordar; as janelas largas dos lembretes dão folga. Uma rodada nunca
// atropela a anterior. Com mais de uma instância, a trava no banco evita envio duplicado.
const webpush = require('web-push');
const { env } = require('../config/env');
const { criarCanais } = require('./canais');
const { executar } = require('./ServicoLembretes');

function iniciarAgendadorLembretes({ intervaloMs = env.LEMBRETES_INTERVALO_MS } = {}) {
  const canais = criarCanais({ env, webpush });
  if (!(intervaloMs > 0)) { console.log('[lembretes] agendador desligado (LEMBRETES_INTERVALO_MS=0).'); return null; }
  if (!canais.push.ativo()) { console.log('[lembretes] push desligado: faltam VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY ou VAPID_SUBJECT.'); return null; }
  let rodando = false;
  const rodada = async () => {
    if (rodando) return;
    rodando = true;
    try { await executar({ canais, env, log: msg => console.log(msg) }); }
    catch (err) { console.error('[lembretes] rodada falhou:', (err && err.code) || 'erro'); }
    finally { rodando = false; }
  };
  const t = setInterval(rodada, intervaloMs);
  if (t.unref) t.unref();
  console.log(`[lembretes] agendador ligado (a cada ${Math.round(intervaloMs / 1000)} s).`);
  return t;
}

module.exports = { iniciarAgendadorLembretes };

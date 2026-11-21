// Saúde do banco (D-059): GET /api/health/banco, público, para o monitor externo (UptimeRobot)
// perceber queda do Supabase — o /api/health só diz que o servidor Node está no ar.
// - Consulta mínima (HEAD com contagem de empresas): não devolve linha nem dado nenhum.
// - Limite de tempo (5 s): banco lento conta como indisponível.
// - Resultado guardado 30 s: chamadas repetidas à rota pública não viram carga no banco.
// - Falha responde 503 sem o detalhe do erro (nada de mensagem do driver para fora).
const { getSupabase } = require('../db/supabaseClient');

const TTL_MS = 30000;
const LIMITE_MS = 5000;

async function consultaPadrao() {
  const { error } = await getSupabase().from('empresas').select('id', { count: 'exact', head: true }).limit(1);
  if (error) throw error;
}

let consultar = consultaPadrao;
let relogio = () => Date.now();
let guardado = null; // { ok, ms, em }

function comLimite(promessa, ms) {
  let t;
  return Promise.race([promessa, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('tempo esgotado')), ms); })])
    .finally(() => clearTimeout(t));
}

async function conferirBanco() {
  const agora = relogio();
  if (guardado && agora - guardado.em < TTL_MS) return { ...guardado, guardado: true };
  const ini = relogio();
  let ok = true;
  try { await comLimite(Promise.resolve().then(() => consultar()), LIMITE_MS); } catch (_) { ok = false; }
  guardado = { ok, ms: relogio() - ini, em: agora };
  return { ...guardado, guardado: false };
}

// Só para testes: troca a consulta e o relógio e zera o resultado guardado.
function paraTestes({ consulta, agora } = {}) {
  consultar = consulta || consultaPadrao;
  relogio = agora || (() => Date.now());
  guardado = null;
}

module.exports = { conferirBanco, paraTestes, TTL_MS, LIMITE_MS };

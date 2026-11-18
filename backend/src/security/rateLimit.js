// Rate limit em memória (login e agendamento público). PARCIAL por natureza: zera no
// restart e não é compartilhado entre instâncias — a garantia real exige um store
// compartilhado (Red Team 2026-11, RT-21/RT-01).
//
// Cada chave guarda até max tentativas admitidas. Quando falta espaço, prioriza
// remover chaves expiradas ou abaixo do limite. Chaves saturadas ficam protegidas
// contra a rotação de e-mails e IPs.

const MAX_CHAVES_PADRAO = 10000;

function criarLimitador({ maxChaves = MAX_CHAVES_PADRAO } = {}) {
  const mapa = new Map(); // chave → { hits: number[], janelaMs, max }
  function compactar(agora) {
    for (const [chave, { hits, janelaMs, max }] of mapa) {
      if (hits.length < max || agora - hits[hits.length - max] >= janelaMs) {
        mapa.delete(chave);
        return;
      }
    }
  }
  return {
    // Tentativas recusadas não ocupam memória nem prolongam a janela.
    excedeu(chave, max, janelaMs, agora = Date.now()) {
      const atual = mapa.get(chave);
      if (max <= 0) return true;
      if (atual && atual.hits.length >= max && agora - atual.hits[atual.hits.length - max] < janelaMs) return true;
      if (!atual && mapa.size >= maxChaves) {
        compactar(agora);
        if (mapa.size >= maxChaves) return true;
      }
      const hits = (atual?.hits || []).filter(t => agora - t < janelaMs);
      hits.push(agora);
      mapa.delete(chave); // reinsere no fim: ordem do Map = menos recente primeiro
      mapa.set(chave, { hits, janelaMs, max });
      return false;
    },
    limpar() { mapa.clear(); },
    get tamanho() { return mapa.size; }
  };
}

// IPv6 por extenso (8 grupos) ou null.
function expandirIpv6(s) {
  if (!/^[0-9a-f:]+$/.test(s) || (s.match(/::/g) || []).length > 1) return null;
  const [cabeca, cauda] = s.split('::');
  const a = cabeca ? cabeca.split(':') : [];
  const b = cauda !== undefined && cauda !== '' ? cauda.split(':') : [];
  const grupos = cauda === undefined ? a : [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b];
  if (grupos.length !== 8 || grupos.some(g => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return grupos.map(g => g.replace(/^0+(?=.)/, ''));
}

function chaveIp(ip) {
  const s = String(ip || '').trim().toLowerCase();
  const v4 = s.match(/^(?:::ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4) return v4[1];
  const grupos = expandirIpv6(s);
  if (!grupos) return s || 'desconhecido';
  return `${grupos.slice(0, 4).join(':')}::/64`;
}

// Superfície pública (agendamento online): IPv4 conta por /24, como o IPv6 conta por /64.
// Red Team em produção (RTP-01, 2026-11-16): um cliente que troca de endereço dentro do mesmo
// bloco passava 66 requisições sem nenhum 429. O login continua por endereço (chaveIp).
function chaveIpPublico(ip) {
  const s = String(ip || '').trim().toLowerCase();
  const v4 = s.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`;
  return chaveIp(s);
}

module.exports = { criarLimitador, chaveIp, chaveIpPublico, expandirIpv6, MAX_CHAVES_PADRAO };

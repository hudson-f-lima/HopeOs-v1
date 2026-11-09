// Rate limit em memória (login e agendamento público). PARCIAL por natureza: zera no
// restart e não é compartilhado entre instâncias — a garantia real exige um store
// compartilhado (Red Team 2026-11, RT-21/RT-01).
//
// Duas correções do Red Team:
// - Teto de memória NÃO zera tudo. Antes, ao passar de 10 000 chaves o mapa era
//   limpo: girando e-mails (login) ou IPs (público) o atacante "resetava" o limite da
//   conta-alvo. Agora descarta, nesta ordem: chaves expiradas; chaves que NÃO estão
//   bloqueadas (menos recentes primeiro); só por último as bloqueadas. Um spray de
//   chaves novas (1 tentativa cada) nunca expulsa a chave que está bloqueada.
// - Chave de IP: IPv6 agrupado por /64 (o bloco que um provedor entrega a UM cliente)
//   e IPv4-mapeado (::ffff:a.b.c.d) igual ao IPv4.

const MAX_CHAVES_PADRAO = 10000;

function criarLimitador({ maxChaves = MAX_CHAVES_PADRAO } = {}) {
  const mapa = new Map(); // chave → { hits: number[], janelaMs, max }
  function compactar(agora) {
    for (const [k, v] of mapa) if (!v.hits.some(t => agora - t < v.janelaMs)) mapa.delete(k);
    for (const [k, v] of mapa) { if (mapa.size <= maxChaves) break; if (v.hits.length <= v.max) mapa.delete(k); }
    while (mapa.size > maxChaves) mapa.delete(mapa.keys().next().value);
  }
  return {
    // Registra a tentativa e diz se passou de `max` na janela.
    excedeu(chave, max, janelaMs, agora = Date.now()) {
      const atual = mapa.get(chave);
      const hits = (atual ? atual.hits : []).filter(t => agora - t < janelaMs);
      hits.push(agora);
      mapa.delete(chave); // reinsere no fim: ordem do Map = menos recente primeiro
      mapa.set(chave, { hits, janelaMs, max });
      if (mapa.size > maxChaves) compactar(agora);
      return hits.length > max;
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

module.exports = { criarLimitador, chaveIp, expandirIpv6, MAX_CHAVES_PADRAO };

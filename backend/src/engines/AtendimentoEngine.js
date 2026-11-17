// Atendimento com vários serviços (D-040, Onda 1). Puro: sem banco nem relógio.
//
// Um atendimento é uma lista de etapas (serviço + profissional + início + duração) no mesmo dia.
// Este motor calcula, a partir dos espaços livres de cada profissional:
// - duração e preço de cada serviço com cada profissional (override > serviço);
// - a grade de inícios: do começo de cada espaço livre, andando pela duração TOTAL do
//   atendimento, mais o início que termina exatamente no fim do espaço; e (D-055) as âncoras
//   das etapas com outro profissional, que antes ficavam de fora (falso negativo). Busca limitada
//   e medida;
// - as combinações: tudo com um profissional; serviços em sequência com profissionais
//   diferentes, sem espera; e fracionado, com espera entre etapas até o limite da unidade;
// - a validação de uma escolha (as mesmas regras, usadas de novo no servidor ao gravar).
// Profissional fixado pelo usuário nunca é trocado. O motor só lista opções: escolher é de quem
// agenda.
const { timeToMinutes, minutesToTime } = require('./ScheduleEngine');
const { resolveDuracaoMin, periodosDoDia, janelasLivres } = require('./SlotEngine');

const MAX_SERVICOS = 6;
const MAX_OPCOES = 40;
const ESPERA_MAX_PADRAO_MIN = 30;
const LIMITE_AVALIACOES = 20000; // montagens testadas por consulta (busca limitada e medida)
const ORDENS = ['padrao', 'preferencia', 'espera', 'tempo_total', 'aproveitamento', 'inicio'];

function overrideDe(servico, profissional) {
  let ov = profissional && profissional.overrides;
  if (typeof ov === 'string') { try { ov = JSON.parse(ov); } catch (_) { ov = {}; } }
  return (ov && servico && ov[servico.id]) || {};
}
function precoDe(servico, profissional) {
  const o = overrideDe(servico, profissional);
  const v = [o.valor_centavos, o.valorCentavos, servico.valor_centavos].find(x => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)) && Number(x) >= 0);
  return v === undefined ? 0 : Math.round(Number(v));
}
const duracaoDe = (servico, profissional) => resolveDuracaoMin({ servico, profissional });

// Espaços livres de um profissional no dia: períodos da disponibilidade menos agendamentos (com
// o tempo de higienização) e bloqueios. O fim de um espaço que encosta num atendimento recua o
// buffer (o novo atendimento também precisa dele).
function livresDoProfissional({ profissional, empresa, data, agendamentos, ignorarIds = [] }) {
  const bufferMin = Number(empresa && empresa.buffer_min) || 0;
  const ignorar = new Set(ignorarIds);
  const dia = periodosDoDia({ profissional, empresa, data });
  const ocupados = (agendamentos || [])
    .filter(a => (a.profissional_id ?? a.profissionalId) === profissional.id && String(a.data) === data && !ignorar.has(a.id))
    .filter(a => !['cancelado', 'no_show', 'reagendado'].includes(a.status))
    .map(a => { const start = timeToMinutes(String(a.horario).slice(0, 5)); return { start, end: start + Number(a.duracao_min ?? 30) + bufferMin, atendimento: true }; })
    .concat(dia.bloqueios || []);
  return dia.periodos.flatMap(p => janelasLivres({ inicio: p.start, fim: p.end }, ocupados))
    .map(l => ({ start: l.start, end: l.end - (l.antesDeAtendimento ? bufferMin : 0) }))
    .filter(l => l.end > l.start);
}

// Primeiro início >= `de` em que [t, t+dur) cabe num espaço livre e não pisa em `usados`
// (etapas anteriores do mesmo atendimento com o mesmo profissional).
function primeiroEncaixe(livres, de, dur, usados = []) {
  for (const w of livres) {
    let t = Math.max(w.start, de);
    for (;;) {
      if (t + dur > w.end) break;
      const choque = usados.find(u => t < u.end && t + dur > u.start);
      if (!choque) return t;
      t = choque.end;
    }
  }
  return null;
}

// Grade de inícios num conjunto de espaços livres: do começo de cada espaço, andando `passo`,
// enquanto o primeiro bloco (`primeiro` minutos) couber; mais o início que termina no fim do
// espaço. `minimo` corta o que já passou (hoje).
function gradeDeInicios(livres, primeiro, passo, minimo = null) {
  const out = new Set();
  for (const w of livres) {
    const ini = minimo !== null && minimo > w.start ? minimo : w.start;
    for (let t = ini; t + primeiro <= w.end; t += passo) out.add(t);
    if (w.end - primeiro >= ini) out.add(w.end - primeiro);
  }
  return [...out].sort((a, b) => a - b);
}

// Inícios candidatos de uma sequência (D-055). A grade documentada (D-040: do começo de cada
// espaço do primeiro profissional, andando pela duração TOTAL, mais o início que termina no fim do
// espaço) continua; somam-se as âncoras que fazem uma etapa feita por OUTRO profissional começar
// ou terminar exatamente na borda de um espaço dele. Sem elas, uma sequência sem espera que não
// caía na grade sumia (falso negativo).
function iniciosCandidatos(seq, livresPor, minimo, umSo) {
  const livres1 = livresPor.get(seq[0].profissional.id) || [];
  const total = seq.reduce((t, e) => t + e.duracaoMin, 0);
  const out = new Set(gradeDeInicios(livres1, umSo ? total : seq[0].duracaoMin, total, minimo));
  if (!umSo) {
    let antes = 0;
    for (const e of seq) {
      const depois = antes + e.duracaoMin;
      if (e.profissional.id !== seq[0].profissional.id) {
        for (const w of livresPor.get(e.profissional.id) || []) { out.add(w.start - antes); out.add(w.end - depois); }
      }
      antes = depois;
    }
  }
  // Só o que cabe num espaço do primeiro profissional (o resto o montar recusaria de qualquer forma).
  return [...out].filter(t => (minimo === null || t >= minimo) && livres1.some(w => t >= w.start && t + seq[0].duracaoMin <= w.end)).sort((a, b) => a - b);
}

// Sobra inútil (aproveitamento): pedaços livres menores que `minUtil` deixados antes ou depois
// de cada etapa no espaço do seu profissional.
function sobraDe(etapas, livresPor, minUtil) {
  let sobra = 0;
  for (const e of etapas) {
    const w = (livresPor.get(e.profissional.id) || []).find(x => e.inicioMin >= x.start && e.fimMin <= x.end);
    if (!w) continue;
    for (const pedaco of [e.inicioMin - w.start, w.end - e.fimMin]) if (pedaco > 0 && pedaco < minUtil) sobra += pedaco;
  }
  return sobra;
}

function permutacoes(lista) {
  if (lista.length <= 1) return [lista];
  const out = [];
  lista.forEach((x, i) => {
    for (const resto of permutacoes([...lista.slice(0, i), ...lista.slice(i + 1)])) out.push([x, ...resto]);
  });
  return out;
}

// Monta as etapas a partir de um início: cada etapa começa no primeiro encaixe do seu
// profissional depois do fim da anterior; a espera entre etapas não passa do limite.
function montar(ordem, inicio, livresPor, esperaMaxMin, exato = false) {
  const etapas = [];
  const usados = new Map();
  let cursor = inicio;
  let espera = 0;
  for (const [i, e] of ordem.entries()) {
    const livres = livresPor.get(e.profissional.id) || [];
    const t = primeiroEncaixe(livres, cursor, e.duracaoMin, usados.get(e.profissional.id) || []);
    if (t === null) return null;
    const gap = t - cursor;
    if (i === 0 ? (exato && gap !== 0) : gap > esperaMaxMin) return null;
    if (i === 0 && gap !== 0) return null; // o início pedido tem de ser o da primeira etapa
    if (i > 0) espera += gap;
    etapas.push({ ...e, inicioMin: t, fimMin: t + e.duracaoMin, esperaAntesMin: i > 0 ? gap : 0 });
    usados.set(e.profissional.id, [...(usados.get(e.profissional.id) || []), { start: t, end: t + e.duracaoMin }]);
    cursor = t + e.duracaoMin;
  }
  return { etapas, esperaMin: espera };
}

/**
 * @param {object} p
 * @param {Array<{servico:object, profissionalId?:string|null}>} p.itens serviços pedidos; profissionalId = fixado
 * @param {Array<object>} p.profissionais ativos
 * @param {Array<{profissional_id:string, servico_id:string}>} p.vinculos profissional_servicos
 * @param {Map<string, Array<{start:number,end:number}>>} p.livresPor espaços livres por profissional
 * @param {number} [p.esperaMaxMin] limite de espera entre etapas (fracionado)
 * @param {number|null} [p.inicioMinimoMin] não oferecer antes deste minuto (hoje)
 * @param {string|null} [p.horario] só opções que começam neste horário
 */
function combinar(p) {
  const r = combinarFixo(p);
  // Preferência (D-055): sem opção com o profissional escolhido, oferece alternativas habilitadas
  // (outro profissional ou divisão), marcando quantas etapas mantêm a escolha. Nada é trocado sem
  // a pessoa ver e escolher.
  const fixados = (p.itens || []).filter(it => it.profissionalId).length;
  if (r.opcoes.length || !fixados || r.semCandidato.length && r.semCandidato.length === p.itens.length) return { ...r, alternativas: false };
  const livre = combinarFixo({ ...p, itens: p.itens.map(it => ({ ...it, profissionalId: null, preferidoId: it.profissionalId || it.preferidoId || null })) });
  return { ...livre, alternativas: livre.opcoes.length > 0, semOpcaoComEscolhido: true, totaisPorProfissional: r.totaisPorProfissional };
}

// Habilitação (regra única, D-040/D-055): o profissional faz o serviço se tiver o vínculo; quem
// não tem nenhum vínculo só é habilitado quando o salão ainda não cadastrou vínculo algum.
function habilitadoPor(vinculos) {
  const lista = vinculos || [];
  return (profId, servicoId) => {
    const doProf = lista.filter(v => v.profissional_id === profId);
    return !doProf.length ? !lista.length : doProf.some(v => v.servico_id === servicoId);
  };
}

function combinarFixo({ itens, profissionais, vinculos, livresPor, esperaMaxMin = ESPERA_MAX_PADRAO_MIN, inicioMinimoMin = null, horario = null, maxOpcoes = MAX_OPCOES,
  minUtilMin = 30, ordem = 'padrao', limiteAvaliacoes = LIMITE_AVALIACOES }) {
  if (!Array.isArray(itens) || !itens.length || itens.length > MAX_SERVICOS) throw new Error('itens fora da faixa');
  const habilitado = habilitadoPor(vinculos);
  const porId = new Map(profissionais.map(pr => [pr.id, pr]));
  // Candidatos de cada serviço: o fixado (se habilitado) ou todos os habilitados.
  const candidatos = itens.map(it => {
    if (it.profissionalId) {
      const pr = porId.get(it.profissionalId);
      return pr && habilitado(pr.id, it.servico.id) ? [pr] : [];
    }
    return profissionais.filter(pr => habilitado(pr.id, it.servico.id));
  });
  const semCandidato = itens.filter((_, i) => !candidatos[i].length).map(it => it.servico.id);

  // Totais com um só profissional (quem faz todos os serviços e respeita os fixados).
  const totaisPorProfissional = profissionais
    .filter(pr => itens.every((it, i) => candidatos[i].some(c => c.id === pr.id)))
    .map(pr => ({
      profissionalId: pr.id,
      duracaoMin: itens.reduce((s, it) => s + duracaoDe(it.servico, pr), 0),
      precoCentavos: itens.reduce((s, it) => s + precoDe(it.servico, pr), 0)
    }));
  const busca = { avaliadas: 0, limite: limiteAvaliacoes, truncada: false };
  if (semCandidato.length) return { opcoes: [], totaisPorProfissional, semCandidato, busca };

  const pedido = horario ? timeToMinutes(horario) : null;
  const indices = itens.map((_, i) => i);
  const ordens = itens.length <= 4 ? permutacoes(indices) : [indices];
  const vistas = new Set();
  const opcoes = [];

  // Atribuições: produto cartesiano dos candidatos (fixados têm um só). As que mantêm mais
  // preferências vêm primeiro: se a busca bater no limite, corta as menos preferidas.
  const prefs = itens.map(it => it.preferidoId || null);
  const mantem = atrib => atrib.filter((pr, i) => prefs[i] && pr.id === prefs[i]).length;
  const atribuicoes = candidatos.reduce((acc, cs) => acc.flatMap(a => cs.map(c => [...a, c])), [[]])
    .sort((a, b) => mantem(b) - mantem(a));
  externo:
  for (const atrib of atribuicoes) {
    const umSo = atrib.every(pr => pr.id === atrib[0].id);
    for (const ordem of (umSo ? [indices] : ordens)) {
      const seq = ordem.map(i => ({
        servico: itens[i].servico, profissional: atrib[i], fixado: Boolean(itens[i].profissionalId),
        duracaoMin: duracaoDe(itens[i].servico, atrib[i]), precoCentavos: precoDe(itens[i].servico, atrib[i])
      }));
      const total = seq.reduce((s, e) => s + e.duracaoMin, 0);
      const inicios = pedido !== null ? [pedido] : iniciosCandidatos(seq, livresPor, inicioMinimoMin, umSo);
      for (const ini of inicios) {
        if (inicioMinimoMin !== null && ini < inicioMinimoMin) continue;
        if (busca.avaliadas >= limiteAvaliacoes) { busca.truncada = true; break externo; }
        busca.avaliadas += 1;
        const m = montar(seq, ini, livresPor, umSo ? 0 : esperaMaxMin);
        if (!m) continue;
        const fim = m.etapas[m.etapas.length - 1].fimMin;
        const tipo = m.esperaMin > 0 ? 'fracionado' : umSo ? 'mesmo_profissional' : 'sequencia';
        const chave = m.etapas.map(e => `${e.servico.id}:${e.profissional.id}:${e.inicioMin}`).join('|');
        if (vistas.has(chave)) continue;
        vistas.add(chave);
        opcoes.push({
          tipo, inicioMin: ini, fimMin: fim, esperaMin: m.esperaMin, tempoTotalMin: fim - ini,
          duracaoMin: total, precoCentavos: m.etapas.reduce((s, e) => s + e.precoCentavos, 0), etapas: m.etapas,
          sobraMin: sobraDe(m.etapas, livresPor, minUtilMin),
          mantemPreferencia: prefs.some(Boolean) ? m.etapas.filter(e => { const i = itens.findIndex(it => it.servico.id === e.servico.id); return prefs[i] && e.profissional.id === prefs[i]; }).length : null
        });
      }
    }
  }

  opcoes.sort(comparador(ordem));
  return { opcoes: opcoes.slice(0, maxOpcoes), totaisPorProfissional, semCandidato: [], busca, ordem: ORDENS.includes(ordem) ? ordem : 'padrao', totalEncontradas: opcoes.length };
}

// Ordenação configurável (D-055). Padrão (como antes): sem espera primeiro (um profissional, depois
// sequência) por início; as com espera pelo tempo total. Preferência põe à frente quem mantém mais
// escolhas da pessoa; as outras ordens desempatam pelo início.
function comparador(ordem) {
  const rank = { mesmo_profissional: 0, sequencia: 1, fracionado: 2 };
  const padrao = (a, b) => (a.esperaMin > 0) - (b.esperaMin > 0)
    || (a.esperaMin === 0 ? rank[a.tipo] - rank[b.tipo] || a.inicioMin - b.inicioMin : a.tempoTotalMin - b.tempoTotalMin || a.inicioMin - b.inicioMin);
  const pref = (a, b) => (b.mantemPreferencia || 0) - (a.mantemPreferencia || 0);
  switch (ordem) {
    case 'espera': return (a, b) => a.esperaMin - b.esperaMin || a.tempoTotalMin - b.tempoTotalMin || a.inicioMin - b.inicioMin;
    case 'tempo_total': return (a, b) => a.tempoTotalMin - b.tempoTotalMin || a.esperaMin - b.esperaMin || a.inicioMin - b.inicioMin;
    case 'aproveitamento': return (a, b) => a.sobraMin - b.sobraMin || a.esperaMin - b.esperaMin || a.inicioMin - b.inicioMin;
    case 'inicio': return (a, b) => a.inicioMin - b.inicioMin || a.tempoTotalMin - b.tempoTotalMin;
    case 'preferencia': return (a, b) => pref(a, b) || padrao(a, b);
    default: return (a, b) => pref(a, b) || padrao(a, b);
  }
}

// Confere uma escolha já feita (cenário 7 e a revalidação do servidor ao gravar): cada etapa cabe
// no espaço livre do seu profissional, as etapas não se pisam, estão em ordem e a espera entre
// elas não passa do limite. Devolve a lista de problemas (vazia = válida).
function validarEtapas({ etapas, livresPor, esperaMaxMin = ESPERA_MAX_PADRAO_MIN, inicioMinimoMin = null }) {
  const problemas = [];
  const usados = new Map();
  let fimAnterior = null;
  etapas.forEach((e, i) => {
    const ini = e.inicioMin;
    const fim = ini + e.duracaoMin;
    const livres = livresPor.get(e.profissionalId) || [];
    if (inicioMinimoMin !== null && ini < inicioMinimoMin) problemas.push({ etapa: i, motivo: 'passado' });
    else if (!livres.some(w => ini >= w.start && fim <= w.end)) problemas.push({ etapa: i, motivo: 'indisponivel' });
    else if ((usados.get(e.profissionalId) || []).some(u => ini < u.end && fim > u.start)) problemas.push({ etapa: i, motivo: 'sobreposta' });
    if (fimAnterior !== null) {
      if (ini < fimAnterior) problemas.push({ etapa: i, motivo: 'fora_de_ordem' });
      else if (ini - fimAnterior > esperaMaxMin) problemas.push({ etapa: i, motivo: 'espera_acima_do_limite' });
    }
    usados.set(e.profissionalId, [...(usados.get(e.profissionalId) || []), { start: ini, end: fim }]);
    fimAnterior = fim;
  });
  return problemas;
}

module.exports = {
  combinar, validarEtapas, habilitadoPor, iniciosCandidatos, ORDENS, LIMITE_AVALIACOES, livresDoProfissional, gradeDeInicios, primeiroEncaixe, precoDe, duracaoDe,
  minutesToTime, MAX_SERVICOS, MAX_OPCOES, ESPERA_MAX_PADRAO_MIN
};

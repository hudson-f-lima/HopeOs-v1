// Grade de compromissos. Um minuto de um profissional conta uma vez, mesmo com
// encaixes. A produção realizada é medida separadamente em metricasPeriodo.
const { periodosDoDia } = require('../SlotEngine');
const { normalizar, intersecao, subtrair } = require('../DisponibilidadeEngine');
const { timeToMinutes, minutesToTime } = require('../ScheduleEngine');
const { addDays } = require('./retention');

const PREVISTOS = ['agendado', 'confirmado', 'aguardando', 'em_atendimento'];
const OCUPA = [...PREVISTOS, 'concluido', 'fechado'];
const DIA = 1440;
const chave = (data, id) => data + '|' + id;
const minutos = intervalos => intervalos.reduce((total, i) => total + i.end - i.start, 0);
const percentual = (n, base) => base ? Math.round(1000 * n / base) / 10 : null;
const diaSemana = data => new Date(data + 'T00:00:00Z').getUTCDay();

function datasDoPeriodo(inicio, fim, maxDias = 366) {
  const datas = [];
  if (!Number.isFinite(Date.parse(inicio + 'T00:00:00Z')) || !Number.isFinite(Date.parse(fim + 'T00:00:00Z'))) return datas;
  for (let data = inicio; data && data <= fim && datas.length < maxDias; data = addDays(data, 1)) datas.push(data);
  return datas;
}

function intervalosDeTrabalho(profissional, empresa, data) {
  const dia = periodosDoDia({ profissional, empresa, data });
  return subtrair(dia.periodos, dia.bloqueios);
}
const minutosDisponiveis = (p, empresa, data) => minutos(intervalosDeTrabalho(p, empresa, data));

// Índice esparso. Recorta também o buffer e os atendimentos que viram o dia,
// sem percorrer a história inteira uma vez por dia ou por profissional.
function indexarAgenda(agendamentos, de, ate, buffer) {
  const indice = new Map();
  const inicioDia = Date.parse(de) / 86400000;
  const fimDia = Date.parse(ate) / 86400000;
  function registro(data, profId) {
    const k = chave(data, profId);
    if (!indice.has(k)) indice.set(k, { ocupados: [], previstos: [], bloqueiam: [], ausencias: [], faltas: 0, incompleta: false });
    return indice.get(k);
  }
  function distribuir(data, profId, start, end, campo) {
    const diaBase = Date.parse(data) / 86400000;
    const primeiro = Math.max(inicioDia - diaBase, Math.floor(start / DIA));
    const ultimo = Math.min(fimDia - diaBase, Math.ceil(end / DIA) - 1);
    for (let n = primeiro; n <= ultimo; n++) {
      const d = n === 0 ? data : addDays(data, n);
      registro(d, profId)[campo].push({ start: Math.max(0, start - n * DIA), end: Math.min(DIA, end - n * DIA) });
    }
  }
  for (const a of agendamentos || []) {
    const data = String(a.data || '').slice(0, 10);
    if (!data || !a.profissional_id) continue;
    const dur = Number(a.duracao_min ?? a.duracaoMin);
    if (a.status === 'no_show' && data >= de && data <= ate && dur > 0) registro(data, a.profissional_id).faltas += dur;
    if (!OCUPA.includes(a.status) && a.status !== 'no_show') continue;
    if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(?:\.\d+)?)?$/.test(a.horario) || !Number.isSafeInteger(dur) || dur <= 0) {
      if (a.status !== 'no_show' && data >= de && data <= ate) registro(data, a.profissional_id).incompleta = true;
      continue;
    }
    const start = timeToMinutes(a.horario);
    const end = start + dur;
    if (a.status === 'no_show') {
      distribuir(data, a.profissional_id, start, end, 'ausencias');
      continue;
    }
    distribuir(data, a.profissional_id, start, end, 'ocupados');
    distribuir(data, a.profissional_id, start - buffer, end + buffer, 'bloqueiam');
    if (PREVISTOS.includes(a.status)) distribuir(data, a.profissional_id, start, end, 'previstos');
  }
  return indice;
}

// Minutos reserváveis em janelas que comportam pelo menos o slot padrão. Um
// novo atendimento precisa respeitar a higienização nas duas bordas da lacuna.
function analisarGrade({ agendamentos, profissionais, empresa = {} }, de, ate, opcoes = {}) {
  const buffer = Math.max(0, Number(empresa.buffer_min) || 0);
  const slot = Number(opcoes.slotPadrao || empresa.slot_padrao) || 30;
  const ativos = (profissionais || []).filter(p => p && p.ativo !== false);
  const indice = indexarAgenda(agendamentos, de, ate, buffer);
  const realizadas = opcoes.realizadas || [];
  const porExecucao = new Map(realizadas.map(r => [chave(r.data, r.profissionalId), r]));
  const inativos = new Map((profissionais || []).filter(p => p && p.ativo === false).map(p => [p.id, p]));
  const historicoInativos = Map.groupBy(realizadas.filter(l => inativos.has(l.profissionalId) && l.minutosDisponiveis > 0), r => r.data);
  const linhas = [];
  for (const data of datasDoPeriodo(de, ate)) {
    const dow = diaSemana(data);
    const antigos = (historicoInativos.get(data) || []).map(l => inativos.get(l.profissionalId));
    for (const p of ativos.concat(antigos)) {
      const k = chave(data, p.id);
      const exec = porExecucao.get(k);
      const trabalho = exec?.intervalosDisponiveis || intervalosDeTrabalho(p, empresa, data);
      const a = indice.get(k);
      const executados = exec?.intervalosExecutados || [];
      const ocupados = intersecao(trabalho, normalizar([...(a?.ocupados || []), ...executados]));
      const previstos = intersecao(trabalho, a?.previstos || []);
      const impedimentos = normalizar([...(a?.bloqueiam || []), ...executados.map(i => ({ start: i.start - buffer, end: i.end + buffer }))]);
      const corte = data === opcoes.hoje ? (opcoes.minutoAtual || 0) : 0;
      const livres = [];
      if (!a?.incompleta && (p.ativo !== false || data < opcoes.hoje)) {
        for (const periodo of trabalho) {
          for (const trecho of subtrair([periodo], impedimentos)) {
            const proximaGrade = periodo.start + Math.ceil((corte - periodo.start) / slot) * slot;
            const start = trecho.start < corte ? proximaGrade : trecho.start;
            if (trecho.end - start >= slot) livres.push({ start, end: trecho.end });
          }
        }
      }
      const minutosLivresComFalta = minutos(intersecao(livres, a?.ausencias || []));
      linhas.push({
        data, dow, profissionalId: p.id, profissionalNome: p.nome, ativo: p.ativo !== false,
        trabalho, ocupados, previstos, livres, minutosLivresComFalta, noShowMin: a?.faltas || 0
      });
    }
  }
  return linhas;
}

function totaisGrade(linhas, faixa, slotPadrao = 0) {
  const tamanho = valores => faixa ? minutos(intersecao(valores, [faixa])) : minutos(valores);
  let disponiveis = 0; let ocupados = 0; let livres = 0;
  for (const l of linhas) {
    disponiveis += tamanho(l.trabalho);
    ocupados += tamanho(l.ocupados);
    livres += faixa ? minutos(intersecao(l.livres, [faixa]).filter(i => i.end - i.start >= slotPadrao)) : minutos(l.livres);
  }
  return { minutosDisponiveis: disponiveis, minutosGradeOcupada: ocupados, preenchimentoGradePct: percentual(ocupados, disponiveis), minutosLivres: livres };
}

function janelasDaGrade(linhas) {
  return linhas.flatMap(l => l.livres.map(i => ({
    profissionalId: l.profissionalId, profissionalNome: l.profissionalNome, data: l.data,
    inicio: minutesToTime(i.start), fim: minutesToTime(i.end), minutos: i.end - i.start
  })));
}

function heatmapDaGrade(linhas) {
  const horas = new Map();
  function somar(dow, intervalos, campo) {
    for (const { start, end } of intervalos) for (let h = Math.floor(start / 60); 60 * h < end; h++) {
      const k = dow * 24 + h;
      if (!horas.has(k)) horas.set(k, { dow, hora: h, ocupados: 0, disponiveis: 0 });
      horas.get(k)[campo] += Math.min(end, (h + 1) * 60) - Math.max(start, h * 60);
    }
  }
  for (const l of linhas) {
    somar(l.dow, l.trabalho, 'disponiveis');
    somar(l.dow, l.ocupados, 'ocupados');
  }
  return [...horas.values()].sort((a, b) => a.dow - b.dow || a.hora - b.hora)
    .map(v => ({ dow: v.dow, hora: v.hora, ocupacaoPct: percentual(v.ocupados, v.disponiveis) }));
}

function previsaoDaGrade(linhas, hoje, minutoAtual) {
  let minutosDisponiveisPrevistos = 0; let minutosPrevistos = 0;
  for (const l of linhas) {
    if (l.data < hoje || !l.ativo) continue;
    const restante = [{ start: l.data === hoje ? minutoAtual : 0, end: DIA }];
    minutosDisponiveisPrevistos += minutos(intersecao(l.trabalho, restante));
    minutosPrevistos += minutos(intersecao(l.previstos, restante));
  }
  return { minutosDisponiveisPrevistos, minutosPrevistos, ocupacaoPrevistaPct: percentual(minutosPrevistos, minutosDisponiveisPrevistos) };
}

// Interfaces mantidas para os consumidores da grade em períodos arbitrários.
function computeLoadFactor(agendamentos, profissionais, de, ate, empresa = {}) {
  const t = totaisGrade(analisarGrade({ agendamentos, profissionais, empresa }, de, ate));
  return { loadFactorPct: t.preenchimentoGradePct, minutosVendidos: t.minutosGradeOcupada, minutosDisponiveis: t.minutosDisponiveis };
}
function computeSur({ agendamentos, profissional, empresa = {}, dataInicio, dataFim }) {
  const t = computeLoadFactor(agendamentos, [profissional], dataInicio, dataFim || dataInicio, empresa);
  return { minutoVendido: t.minutosVendidos, minutoDisponivel: t.minutosDisponiveis, surPct: t.loadFactorPct };
}
function computeHeatmap(agendamentos, profissionais, de, ate, empresa = {}) {
  return heatmapDaGrade(analisarGrade({ agendamentos, profissionais, empresa }, de, ate));
}
function computeGaps(agendamentos, profissionais, data, slotPadrao, empresa = {}) {
  return janelasDaGrade(analisarGrade({ agendamentos, profissionais, empresa }, data, data, { slotPadrao }));
}

module.exports = {
  OCUPA, datasDoPeriodo, intervalosDeTrabalho, minutosDisponiveis, computeSur, computeLoadFactor, computeHeatmap, computeGaps,
  analisarGrade, totaisGrade, janelasDaGrade, heatmapDaGrade, previsaoDaGrade, minToHHMM: minutesToTime
};

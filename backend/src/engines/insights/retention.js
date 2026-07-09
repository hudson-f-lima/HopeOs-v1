// F2 - Retencao: RFM, churn-risk, reliability, rebooking e attach.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_INTERVAL_DAYS = 45;
const CLOSED_COMMAND_STATUSES = ['fechado', 'concluido', 'pago', 'closed', 'paid'];
const SUCCESS_APPOINTMENT_STATUSES = ['concluido', 'fechado'];

const SEGMENTS = [
  { nome: 'campeoes', label: 'Campeoes' },
  { nome: 'fieis', label: 'Fieis' },
  { nome: 'promissores', label: 'Promissores' },
  { nome: 'novos', label: 'Novos' },
  { nome: 'em_risco', label: 'Em risco' },
  { nome: 'hibernando', label: 'Hibernando' },
  { nome: 'perdidos', label: 'Perdidos' },
  { nome: 'regulares', label: 'Regulares' }
];

const RISK_FACTORS = {
  ok: 0,
  atencao: 1,
  alto: 2,
  critico: 3
};

function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const raw = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function parseDate(value) {
  const dateOnly = parseDateOnly(value);
  if (!dateOnly) return null;
  const date = new Date(`${dateOnly}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayUtcDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  if (!fromDate || !toDate) return null;
  return Math.max(0, Math.floor((toDate - fromDate) / MS_PER_DAY));
}

function addDays(dateStr, days) {
  const date = parseDate(dateStr);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function median(values) {
  const nums = (values || []).filter(v => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2) return nums[mid];
  return (nums[mid - 1] + nums[mid]) / 2;
}

function getCommandDate(command) {
  return parseDateOnly(command && (command.data || command.created_at));
}

function getCommandTime(command) {
  if (!command) return '10:00';
  const raw = command.hora || command.horario || (command.created_at ? String(command.created_at).slice(11, 16) : null);
  return /^\d{2}:\d{2}$/.test(String(raw || '')) ? String(raw) : '10:00';
}

function isClosedCommand(command) {
  const status = command && command.status;
  if (!status) return true;
  return CLOSED_COMMAND_STATUSES.includes(String(status));
}

function normalizeCommands(comandos) {
  return (comandos || [])
    .filter(c => c && c.cliente_id && getCommandDate(c) && isClosedCommand(c))
    .map(c => ({
      ...c,
      data: getCommandDate(c),
      hora: getCommandTime(c),
      total_recebido_centavos: Number(c.total_recebido_centavos || 0)
    }))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
}

function groupBy(items, keyFn) {
  const map = new Map();
  (items || []).forEach(item => {
    const key = keyFn(item);
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
}

function scoreRank(values, value, higherIsBetter) {
  const nums = values.filter(v => Number.isFinite(v));
  if (!nums.length) return 3;
  if (nums.every(v => v === nums[0])) return null;
  const rankCount = higherIsBetter
    ? nums.filter(v => v <= value).length
    : nums.filter(v => v >= value).length;
  return clamp(Math.ceil((rankCount / nums.length) * 5), 1, 5);
}

function fallbackRScore(days) {
  if (days <= 30) return 5;
  if (days <= 60) return 4;
  if (days <= 90) return 3;
  if (days <= 180) return 2;
  return 1;
}

function fallbackFScore(visits) {
  if (visits >= 8) return 5;
  if (visits >= 5) return 4;
  if (visits >= 3) return 3;
  if (visits >= 2) return 2;
  return 1;
}

function assignScores(entries) {
  const rValues = entries.map(e => e.diasDesdeUltima);
  const fValues = entries.map(e => e.visitas180d);
  const mValues = entries.map(e => e.valor180dCentavos);

  return entries.map(entry => {
    const dynamicR = scoreRank(rValues, entry.diasDesdeUltima, false);
    const dynamicF = scoreRank(fValues, entry.visitas180d, true);
    const dynamicM = scoreRank(mValues, entry.valor180dCentavos, true);
    return {
      ...entry,
      rScore: dynamicR || fallbackRScore(entry.diasDesdeUltima),
      fScore: dynamicF || fallbackFScore(entry.visitas180d),
      mScore: dynamicM || 3
    };
  });
}

function segmentFor(entry) {
  const r = entry.rScore;
  const f = entry.fScore;
  const m = entry.mScore;
  const isFirstVisitRecent = entry.totalComandas === 1 && entry.diasDesdePrimeira <= 30;

  if (isFirstVisitRecent) return 'novos';
  if (r >= 4 && f >= 4) return 'campeoes';
  if (f >= 4 && (r === 2 || r === 3)) return 'fieis';
  if (r >= 4 && (f === 2 || f === 3)) return 'promissores';
  if (r <= 2 && f >= 3) return 'em_risco';
  if (r === 1 && f === 1) return 'perdidos';
  if (r <= 2 && f <= 2 && m >= 3) return 'hibernando';
  return 'regulares';
}

function computeRfm(comandos, hoje = todayUtcDateOnly()) {
  const today = parseDateOnly(hoje) || todayUtcDateOnly();
  const allCommands = normalizeCommands(comandos);
  const cutoff = addDays(today, -180);
  const allByCliente = groupBy(allCommands, c => c.cliente_id);
  const windowCommands = allCommands.filter(c => c.data >= cutoff && c.data <= today);
  const windowByCliente = groupBy(windowCommands, c => c.cliente_id);

  const entries = Array.from(windowByCliente.entries()).map(([clienteId, clienteCommands]) => {
    const sortedWindow = [...clienteCommands].sort((a, b) => a.data.localeCompare(b.data));
    const sortedAll = [...(allByCliente.get(clienteId) || [])].sort((a, b) => a.data.localeCompare(b.data));
    const primeiraComanda = sortedAll[0] && sortedAll[0].data;
    const ultimaComanda = sortedWindow[sortedWindow.length - 1].data;
    return {
      clienteId,
      primeiraComanda,
      ultimaComanda,
      diasDesdePrimeira: daysBetween(primeiraComanda, today),
      diasDesdeUltima: daysBetween(ultimaComanda, today),
      visitas180d: sortedWindow.length,
      totalComandas: sortedAll.length,
      valor180dCentavos: sortedWindow.reduce((sum, c) => sum + Number(c.total_recebido_centavos || 0), 0)
    };
  });

  const scored = assignScores(entries).map(entry => {
    const segmento = segmentFor(entry);
    const segment = SEGMENTS.find(s => s.nome === segmento) || SEGMENTS[SEGMENTS.length - 1];
    return {
      ...entry,
      segmento,
      segmentoLabel: segment.label
    };
  });

  return {
    clientes: scored,
    meta: {
      hoje: today,
      janelaDias: 180,
      totalClientes: scored.length
    }
  };
}

function commandGaps(commands) {
  const sorted = normalizeCommands(commands);
  const gaps = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = daysBetween(sorted[i - 1].data, sorted[i].data);
    if (gap && gap > 0) gaps.push(gap);
  }
  return gaps;
}

function dominantServiceId(commandsCliente, comandoItens) {
  const commandIds = new Set((commandsCliente || []).map(c => c.id).filter(Boolean));
  const counts = {};
  (comandoItens || []).forEach(item => {
    if (!commandIds.has(item.comando_id) || item.tipo !== 'servico' || !item.servico_id) return;
    counts[item.servico_id] = (counts[item.servico_id] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function serviceMedianGap({ comandos, comandoItens, servicoId }) {
  if (!servicoId) return null;
  const commandsById = new Map(normalizeCommands(comandos).map(c => [c.id, c]));
  const byCliente = new Map();

  (comandoItens || []).forEach(item => {
    if (item.tipo !== 'servico' || item.servico_id !== servicoId) return;
    const command = commandsById.get(item.comando_id);
    if (!command || !command.cliente_id) return;
    if (!byCliente.has(command.cliente_id)) byCliente.set(command.cliente_id, []);
    byCliente.get(command.cliente_id).push(command);
  });

  const gaps = [];
  byCliente.forEach(clientCommands => gaps.push(...commandGaps(clientCommands)));
  return median(gaps);
}

function riskFromRatio(ratio) {
  if (ratio < 1.2) return 'ok';
  if (ratio < 1.8) return 'atencao';
  if (ratio <= 2.5) return 'alto';
  return 'critico';
}

function computeChurnRisk(input, maybeHoje, maybeOptions) {
  const options = Array.isArray(input)
    ? { comandosCliente: input, hoje: maybeHoje, ...(maybeOptions || {}) }
    : (input || {});
  const today = parseDateOnly(options.hoje) || todayUtcDateOnly();
  const commandsCliente = normalizeCommands(options.comandosCliente || []);
  const valor180dCentavos = Number(options.valor180dCentavos || 0);

  if (!commandsCliente.length) {
    return {
      diasDesdeUltima: null,
      intervaloMedianoDias: DEFAULT_INTERVAL_DAYS,
      overdueRatio: 0,
      risco: 'ok',
      prioridade: 0,
      base: 'default'
    };
  }

  const last = commandsCliente[commandsCliente.length - 1];
  const gaps = commandGaps(commandsCliente);
  let intervalo = commandsCliente.length >= 3 ? median(gaps) : null;
  let base = intervalo ? 'cliente' : null;

  if (!intervalo) {
    const servicoId = options.servicoId || dominantServiceId(commandsCliente, options.comandoItens || []);
    intervalo = serviceMedianGap({
      comandos: options.comandos || [],
      comandoItens: options.comandoItens || [],
      servicoId
    });
    base = intervalo ? 'servico' : null;
  }

  if (!intervalo) {
    intervalo = DEFAULT_INTERVAL_DAYS;
    base = 'default';
  }

  const diasDesdeUltima = daysBetween(last.data, today);
  const overdueRatio = intervalo ? (diasDesdeUltima / intervalo) : 0;
  const risco = riskFromRatio(overdueRatio);
  const prioridade = Math.round(valor180dCentavos * (RISK_FACTORS[risco] || 0));

  return {
    diasDesdeUltima,
    intervaloMedianoDias: Math.round(intervalo),
    overdueRatio: round2(overdueRatio),
    risco,
    prioridade,
    base
  };
}

function scheduledDateTime(agendamento) {
  const dateOnly = parseDateOnly(agendamento && agendamento.data);
  if (!dateOnly) return null;
  const time = /^\d{2}:\d{2}$/.test(String(agendamento.horario || ''))
    ? agendamento.horario
    : '00:00';
  const date = new Date(`${dateOnly}T${time}:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWithinLastDays(dateOnly, today, days) {
  const diff = daysBetween(dateOnly, today);
  return diff !== null && diff >= 0 && diff <= days;
}

function isLateCancel(agendamento) {
  if (agendamento.status !== 'cancelado' || !agendamento.updated_at) return false;
  const scheduled = scheduledDateTime(agendamento);
  const updated = new Date(agendamento.updated_at);
  if (!scheduled || Number.isNaN(updated.getTime())) return false;
  const delta = scheduled - updated;
  return delta >= 0 && delta <= MS_PER_DAY;
}

function computeReliability(agendamentosCliente, hoje = todayUtcDateOnly()) {
  const today = parseDateOnly(hoje) || todayUtcDateOnly();
  const relevant = (agendamentosCliente || []).filter(a => isWithinLastDays(a.data, today, 365));
  const noShows365d = relevant.filter(a => a.status === 'no_show').length;
  const cancelTardios365d = relevant.filter(isLateCancel).length;

  const pastSortedDesc = relevant
    .filter(a => parseDateOnly(a.data) <= today)
    .sort((a, b) => {
      const ad = `${parseDateOnly(a.data)} ${a.horario || '00:00'}`;
      const bd = `${parseDateOnly(b.data)} ${b.horario || '00:00'}`;
      return bd.localeCompare(ad);
    });

  let streakConcluidos = 0;
  for (const agendamento of pastSortedDesc) {
    if (!SUCCESS_APPOINTMENT_STATUSES.includes(agendamento.status)) break;
    streakConcluidos += 1;
  }

  const score = clamp(
    100
      - (20 * Math.min(noShows365d, 4))
      - (8 * Math.min(cancelTardios365d, 5))
      + (4 * Math.min(streakConcluidos, 5)),
    0,
    100
  );

  let faixa = 'risco';
  if (score >= 85) faixa = 'confiavel';
  else if (score >= 60) faixa = 'normal';
  else if (score >= 40) faixa = 'atencao';

  return {
    score,
    faixa,
    fatores: {
      noShows365d,
      cancelTardios365d,
      streakConcluidos
    }
  };
}

function normalizeHistory(historico) {
  return (historico || [])
    .map(item => ({
      ...item,
      data: parseDateOnly(item.data || item.created_at),
      hora: getCommandTime(item),
      servico_id: item.servico_id || item.servicoId || null,
      cliente_id: item.cliente_id || item.clienteId || null
    }))
    .filter(item => item.data)
    .sort((a, b) => a.data.localeCompare(b.data));
}

function gapsFromHistory(historico) {
  const sorted = normalizeHistory(historico);
  const gaps = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const gap = daysBetween(sorted[i - 1].data, sorted[i].data);
    if (gap && gap > 0) gaps.push(gap);
  }
  return gaps;
}

function mode(values) {
  const counts = {};
  (values || []).filter(Boolean).forEach(value => {
    counts[value] = (counts[value] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null;
}

function globalServiceGap(globalHistorico, servicoId) {
  if (!servicoId) return null;
  const byCliente = groupBy(
    normalizeHistory(globalHistorico).filter(item => item.servico_id === servicoId),
    item => item.cliente_id || '__global__'
  );
  const gaps = [];
  byCliente.forEach(items => gaps.push(...gapsFromHistory(items)));
  return median(gaps);
}

function computeRebooking(historico, servicoId, options = {}) {
  const today = parseDateOnly(options.hoje) || todayUtcDateOnly();
  const events = normalizeHistory(historico);
  const sameServiceEvents = servicoId ? events.filter(item => item.servico_id === servicoId) : events;
  const clientGaps = gapsFromHistory(sameServiceEvents);

  let intervalo = clientGaps.length ? median(clientGaps) : null;
  let base = intervalo ? 'cliente' : null;

  if (!intervalo) {
    intervalo = globalServiceGap(options.globalHistorico || [], servicoId);
    base = intervalo ? 'servico' : null;
  }

  if (!intervalo) {
    intervalo = DEFAULT_INTERVAL_DAYS;
    base = 'default';
  }

  const baseEvent = [...(sameServiceEvents.length ? sameServiceEvents : events)].sort((a, b) => b.data.localeCompare(a.data))[0];
  const baseDate = parseDateOnly(options.baseDate) || (baseEvent && baseEvent.data) || today;
  const horaSugerida = mode(sameServiceEvents.map(item => item.hora)) || mode(events.map(item => item.hora)) || options.baseHora || '10:00';
  const intervaloDias = Math.round(intervalo);

  return {
    dataSugerida: addDays(baseDate, intervaloDias),
    horaSugerida,
    intervaloDias,
    base
  };
}

function computeAttach(comandoItens, options = {}) {
  const minSupport = Number(options.minSupport || 5);
  const minLift = Number(options.minLift || 1.2);
  const byCommand = groupBy(comandoItens || [], item => item.comando_id);
  const commands = Array.from(byCommand.values()).map(items => {
    const servicos = new Map();
    const produtos = new Map();
    items.forEach(item => {
      if (item.tipo === 'servico' && item.servico_id) servicos.set(item.servico_id, item.descricao || 'Servico');
      if (item.tipo === 'produto' && item.produto_id) produtos.set(item.produto_id, item.descricao || 'Produto');
    });
    return { servicos, produtos };
  }).filter(command => command.servicos.size || command.produtos.size);

  const totalComandos = commands.length;
  const comandosComProduto = commands.filter(command => command.produtos.size > 0).length;
  const serviceCounts = new Map();
  const productCounts = new Map();
  const serviceProductCounts = new Map();
  const serviceNames = new Map();
  const productNames = new Map();

  commands.forEach(command => {
    command.servicos.forEach((name, servicoId) => {
      serviceCounts.set(servicoId, (serviceCounts.get(servicoId) || 0) + 1);
      serviceNames.set(servicoId, name);
      command.produtos.forEach((productName, produtoId) => {
        const key = `${servicoId}::${produtoId}`;
        serviceProductCounts.set(key, (serviceProductCounts.get(key) || 0) + 1);
        productNames.set(produtoId, productName);
      });
    });
    command.produtos.forEach((name, produtoId) => {
      productCounts.set(produtoId, (productCounts.get(produtoId) || 0) + 1);
      productNames.set(produtoId, name);
    });
  });

  const sugestoes = Array.from(serviceCounts.entries()).map(([servicoId, serviceTotal]) => {
    const produtos = Array.from(productCounts.keys()).map(produtoId => {
      const coOccurrences = serviceProductCounts.get(`${servicoId}::${produtoId}`) || 0;
      const pct = serviceTotal ? (coOccurrences / serviceTotal) * 100 : 0;
      const baseProductPct = totalComandos ? (productCounts.get(produtoId) / totalComandos) : 0;
      const lift = baseProductPct ? (coOccurrences / serviceTotal) / baseProductPct : 0;
      return {
        produtoId,
        nome: productNames.get(produtoId) || 'Produto',
        pct: round1(pct),
        lift: round1(lift),
        amostra: coOccurrences
      };
    })
      .filter(produto => produto.amostra >= minSupport && produto.lift > minLift)
      .sort((a, b) => b.lift - a.lift || b.pct - a.pct || b.amostra - a.amostra)
      .slice(0, 3);

    return {
      servicoId,
      servicoNome: serviceNames.get(servicoId) || 'Servico',
      produtos
    };
  })
    .filter(sugestao => sugestao.produtos.length)
    .sort((a, b) => b.produtos[0].lift - a.produtos[0].lift);

  return {
    attachRatePct: totalComandos ? round1((comandosComProduto / totalComandos) * 100) : 0,
    sugestoes
  };
}

module.exports = {
  SEGMENTS,
  computeRfm,
  computeChurnRisk,
  computeReliability,
  computeRebooking,
  computeAttach,
  median,
  daysBetween,
  addDays
};

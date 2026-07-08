// F1.1 — Ocupacao: SUR (Service Utilization Rate), heatmap, buracos
// Funcoes puras — nao dependem de estado externo

const CAPACITY_SLOTS_PER_PROF = 8;

function parseJanela(horarioJsonb, horarioEmpresa, slotPadrao) {
  if (!horarioJsonb || typeof horarioJsonb !== 'object') {
    const slotMin = slotPadrao || 30;
    return { inicio: 480, fim: 1020, slotMin }; // 8h–17h padrão
  }
  const dow = new Date().getDay(); // fallback: segunda = 1
  const doW = horarioJsonb[dow] || {};
  if (!doW.start || !doW.end) {
    const slotMin = slotPadrao || 30;
    return { inicio: 480, fim: 1020, slotMin };
  }
  const [ih, im] = String(doW.start).split(':').map(Number);
  const [fh, fm] = String(doW.end).split(':').map(Number);
  return {
    inicio: (ih * 60) + (im || 0),
    fim: (fh * 60) + (fm || 0),
    slotMin: slotPadrao || 30
  };
}

function computeSur(agendamentos, profissionalId, dataStr, horario, slotPadrao) {
  // SUR = minutos_vendidos / minutos_disponiveis
  // data em YYYY-MM-DD, horario em jsonb com chave dow (0–6)
  const [y, m, d] = String(dataStr).split('-').map(Number);
  const dow = new Date(`${dataStr}T00:00:00Z`).getUTCDay();
  const janela = horario[dow] || {};
  if (!janela.start || !janela.end) {
    const slot = slotPadrao || 30;
    const minDisp = 8 * slot;
    const vendidos = agendamentos
      .filter(a => a.profissional_id === profissionalId && a.data === dataStr && a.status !== 'cancelado')
      .reduce((sum, a) => sum + (a.duracao_min || 30), 0);
    return {
      minutoVendido: vendidos,
      minutoDisponivel: minDisp,
      surPct: minDisp ? Math.min(100, Math.round((vendidos / minDisp) * 100 * 10) / 10) : 0
    };
  }
  const [ih, im] = String(janela.start).split(':').map(Number);
  const [fh, fm] = String(janela.end).split(':').map(Number);
  const minDisp = ((fh * 60) + (fm || 0)) - ((ih * 60) + (im || 0));

  const vendidos = agendamentos
    .filter(a => a.profissional_id === profissionalId && a.data === dataStr &&
            ['agendado', 'confirmado', 'aguardando', 'em_atendimento', 'concluido', 'fechado'].includes(a.status))
    .reduce((sum, a) => sum + (a.duracao_min || 30), 0);

  return {
    minutoVendido: vendidos,
    minutoDisponivel: minDisp || 240,
    surPct: minDisp ? Math.min(100, Math.round((vendidos / minDisp) * 100 * 10) / 10) : 0
  };
}

function computeHeatmap(agendamentos, profissionais, dataInicio, dataFim) {
  // Agrupa agendamentos por dia-da-semana e hora do dia (buckets de 1h)
  const map = {};
  const d0 = new Date(dataInicio);
  const d1 = new Date(dataFim);
  const VALID_STATUSES = ['agendado', 'confirmado', 'aguardando', 'em_atendimento', 'concluido', 'fechado'];

  agendamentos.forEach(a => {
    const aData = new Date(String(a.data) + 'T00:00:00');
    if (aData < d0 || aData > d1) return;
    if (!VALID_STATUSES.includes(a.status)) return;

    const dow = aData.getDay();
    const [h, m] = (String(a.horario || '08:00')).split(':').map(Number);
    const hora = h;

    const key = `${dow}:${hora}`;
    if (!map[key]) map[key] = { minutoVendido: 0, minutoDisponivel: 0 };
    map[key].minutoVendido += (a.duracao_min || 30);
  });

  // Calcular disponíveis por hora (simplificado: assume todo prof em cada hora)
  profissionais.forEach(p => {
    for (let dow = 0; dow < 7; dow++) {
      const h = p.horario && p.horario[dow];
      if (!h || !h.start) continue;
      const [ih, im] = String(h.start).split(':').map(Number);
      const [fh, fm] = String(h.end).split(':').map(Number);
      const minTotal = ((fh * 60) + (fm || 0)) - ((ih * 60) + (im || 0));
      for (let hora = ih; hora < fh; hora++) {
        const key = `${dow}:${hora}`;
        if (!map[key]) map[key] = { minutoVendido: 0, minutoDisponivel: 0 };
        map[key].minutoDisponivel += Math.min(60, minTotal);
      }
    }
  });

  return Object.entries(map).map(([k, v]) => {
    const [dow, hora] = k.split(':').map(Number);
    return {
      dow,
      hora,
      ocupacaoPct: v.minutoDisponivel ? Math.min(100, Math.round((v.minutoVendido / v.minutoDisponivel) * 100)) : 0
    };
  });
}

function computeLoadFactor(agendamentos, profissionais, dataInicio, dataFim) {
  // Load factor da empresa = total minutos vendidos / total minutos disponíveis no período
  const d0 = new Date(dataInicio);
  const d1 = new Date(dataFim);

  let minVendido = 0;
  let minDisp = 0;

  const dateRange = [];
  for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
    dateRange.push(new Date(d).toISOString().split('T')[0]);
  }

  const VALID_STATUSES = ['agendado', 'confirmado', 'aguardando', 'em_atendimento', 'concluido', 'fechado'];

  dateRange.forEach(data => {
    agendamentos.forEach(a => {
      if (a.data !== data || !VALID_STATUSES.includes(a.status)) return;
      minVendido += (a.duracao_min || 30);
    });

    const dow = new Date(data + 'T00:00:00').getDay();
    profissionais.forEach(p => {
      const h = p.horario && p.horario[dow];
      if (!h || !h.start) return;
      const [ih, im] = String(h.start).split(':').map(Number);
      const [fh, fm] = String(h.end).split(':').map(Number);
      minDisp += ((fh * 60) + (fm || 0)) - ((ih * 60) + (im || 0));
    });
  });

  return {
    loadFactorPct: minDisp ? Math.min(100, Math.round((minVendido / minDisp) * 100 * 10) / 10) : 0,
    minutosVendidos: minVendido,
    minutosDisponiveis: minDisp
  };
}

function computeGaps(agendamentos, profissionais, dataStr, slotPadrao) {
  // Buracos = slots livres contíguos >= slotPadrao em cada profissional
  const gaps = [];
  const slot = slotPadrao || 30;

  profissionais.forEach(prof => {
    const dow = new Date(dataStr + 'T00:00:00').getDay();
    const h = prof.horario && prof.horario[dow];
    if (!h || !h.start) return;

    const [ih, im] = String(h.start).split(':').map(Number);
    const [fh, fm] = String(h.end).split(':').map(Number);
    const inicio = (ih * 60) + (im || 0);
    const fim = (fh * 60) + (fm || 0);

    const VALID_STATUSES = ['agendado', 'confirmado', 'aguardando', 'em_atendimento', 'concluido', 'fechado'];
    const agendsPorProf = agendamentos
      .filter(a => a.data === dataStr && a.profissional_id === prof.id && VALID_STATUSES.includes(a.status))
      .map(a => {
        const [ah, am] = String(a.horario || '08:00').split(':').map(Number);
        return {
          startMin: (ah * 60) + (am || 0),
          endMin: ((ah * 60) + (am || 0)) + (a.duracao_min || 30)
        };
      })
      .sort((a, b) => a.startMin - b.startMin);

    let current = inicio;
    agendsPorProf.forEach(a => {
      if (a.startMin - current >= slot) {
        gaps.push({
          profissionalId: prof.id,
          profissionalNome: prof.nome,
          data: dataStr,
          inicio: minToHHMM(current),
          fim: minToHHMM(a.startMin),
          minutos: a.startMin - current
        });
      }
      current = Math.max(current, a.endMin);
    });

    if (fim - current >= slot) {
      gaps.push({
        profissionalId: prof.id,
        profissionalNome: prof.nome,
        data: dataStr,
        inicio: minToHHMM(current),
        fim: minToHHMM(fim),
        minutos: fim - current
      });
    }
  });

  return gaps;
}

function minToHHMM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

module.exports = {
  parseJanela,
  computeSur,
  computeHeatmap,
  computeLoadFactor,
  computeGaps,
  minToHHMM
};

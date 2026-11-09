// F1.1 — Ocupação: SUR (Service Utilization Rate), heatmap, buracos.
// Funções puras — não dependem de estado externo nem do fuso do servidor.
//
// Expediente = o MESMO do motor de slots (SlotEngine.resolveJanela): aceita
// { seg: { ativo, inicio, fim } } (formato gravado pela PWA/onboarding) e
// { 1: { start, end } }, cruza profissional × empresa (horario_por_dia) e
// desconta o almoço da empresa. Antes, só o formato { 1: { start, end } } do
// profissional era lido: com os dados reais do onboarding a disponibilidade
// era 0 e a carga, o heatmap e os buracos ficavam vazios.
// Datas sempre em UTC (YYYY-MM-DD → dia da semana), nunca no fuso local do processo.

const { resolveJanela } = require('../SlotEngine');
const { timeToMinutes } = require('../ScheduleEngine');

// Status que ocupam a cadeira (inclui presença: aguardando/em_atendimento).
const OCUPA = ['agendado', 'confirmado', 'aguardando', 'em_atendimento', 'concluido', 'fechado'];

const dia = v => (v ? String(v).slice(0, 10) : null);
const dowDe = data => new Date(`${data}T00:00:00Z`).getUTCDay();

function datasDoPeriodo(dataInicio, dataFim, maxDias = 366) {
  const datas = [];
  const d = new Date(`${dataInicio}T00:00:00Z`);
  const fim = new Date(`${dataFim}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(fim.getTime())) return datas;
  while (d <= fim && datas.length < maxDias) {
    datas.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return datas;
}

function almoco(empresa) {
  if (!empresa || !empresa.intervalo_almoco || !empresa.almoco_inicio || !empresa.almoco_fim) return null;
  const start = timeToMinutes(empresa.almoco_inicio);
  const end = timeToMinutes(empresa.almoco_fim);
  return end > start ? { start, end } : null;
}

const sobreposicao = (a, b) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

// Intervalos de trabalho do profissional no dia (expediente menos almoço).
function intervalosDeTrabalho(profissional, empresa, data) {
  const j = resolveJanela({ profissional, empresa: empresa || {}, data });
  if (!j) return [];
  const a = almoco(empresa);
  if (!a || sobreposicao({ start: j.inicio, end: j.fim }, a) === 0) return [{ start: j.inicio, end: j.fim }];
  return [{ start: j.inicio, end: a.start }, { start: a.end, end: j.fim }].filter(i => i.end > i.start);
}

const minutosDisponiveis = (profissional, empresa, data) =>
  intervalosDeTrabalho(profissional, empresa, data).reduce((s, i) => s + (i.end - i.start), 0);

const ativos = profissionais => (profissionais || []).filter(p => p && p.ativo !== false);
const duracao = a => Number(a.duracao_min || a.duracaoMin || 30);
const ocupaNoDia = (a, data, profissionalId) => dia(a.data) === data && OCUPA.includes(a.status)
  && (profissionalId === undefined || a.profissional_id === profissionalId);

// SUR do profissional no PERÍODO inteiro (antes: só o primeiro dia do período).
function computeSur({ agendamentos = [], profissional, empresa = {}, dataInicio, dataFim }) {
  let vendidos = 0;
  let disponiveis = 0;
  for (const data of datasDoPeriodo(dataInicio, dataFim || dataInicio)) {
    disponiveis += minutosDisponiveis(profissional, empresa, data);
    vendidos += agendamentos.filter(a => ocupaNoDia(a, data, profissional.id)).reduce((s, a) => s + duracao(a), 0);
  }
  return {
    minutoVendido: vendidos,
    minutoDisponivel: disponiveis,
    surPct: disponiveis ? Math.min(100, Math.round((vendidos / disponiveis) * 1000) / 10) : 0
  };
}

// Heatmap dia-da-semana × hora. Disponível e vendido somam CADA data do período
// (antes: o disponível era de uma semana só e o vendido de todas → > 100% em
// períodos de mais de 7 dias). Atendimento que atravessa a hora é repartido.
function computeHeatmap(agendamentos, profissionais, dataInicio, dataFim, empresa = {}) {
  const map = {};
  const bucket = (dow, hora) => (map[`${dow}:${hora}`] = map[`${dow}:${hora}`] || { minutoVendido: 0, minutoDisponivel: 0 });
  const espalhar = (dow, intervalo, campo) => {
    for (let hora = Math.floor(intervalo.start / 60); hora * 60 < intervalo.end; hora++) {
      const m = sobreposicao(intervalo, { start: hora * 60, end: (hora + 1) * 60 });
      if (m > 0) bucket(dow, hora)[campo] += m;
    }
  };
  for (const data of datasDoPeriodo(dataInicio, dataFim)) {
    const dow = dowDe(data);
    ativos(profissionais).forEach(p => intervalosDeTrabalho(p, empresa, data).forEach(i => espalhar(dow, i, 'minutoDisponivel')));
    (agendamentos || []).filter(a => ocupaNoDia(a, data)).forEach(a => {
      const start = timeToMinutes(a.horario || '08:00');
      espalhar(dow, { start, end: start + duracao(a) }, 'minutoVendido');
    });
  }
  return Object.entries(map).map(([k, v]) => {
    const [dow, hora] = k.split(':').map(Number);
    return { dow, hora, ocupacaoPct: v.minutoDisponivel ? Math.min(100, Math.round((v.minutoVendido / v.minutoDisponivel) * 100)) : 0 };
  }).sort((a, b) => a.dow - b.dow || a.hora - b.hora);
}

function computeLoadFactor(agendamentos, profissionais, dataInicio, dataFim, empresa = {}) {
  let minVendido = 0;
  let minDisp = 0;
  for (const data of datasDoPeriodo(dataInicio, dataFim)) {
    ativos(profissionais).forEach(p => { minDisp += minutosDisponiveis(p, empresa, data); });
    (agendamentos || []).forEach(a => { if (ocupaNoDia(a, data)) minVendido += duracao(a); });
  }
  return {
    loadFactorPct: minDisp ? Math.min(100, Math.round((minVendido / minDisp) * 1000) / 10) : 0,
    minutosVendidos: minVendido,
    minutosDisponiveis: minDisp
  };
}

// Buracos (janelas livres >= slotPadrao) de um dia, respeitando almoço.
function computeGaps(agendamentos, profissionais, dataStr, slotPadrao, empresa = {}) {
  const gaps = [];
  const slot = slotPadrao || 30;
  ativos(profissionais).forEach(prof => {
    const ocupados = (agendamentos || [])
      .filter(a => ocupaNoDia(a, dataStr, prof.id))
      .map(a => { const start = timeToMinutes(a.horario || '08:00'); return { start, end: start + duracao(a) }; })
      .sort((a, b) => a.start - b.start);
    intervalosDeTrabalho(prof, empresa, dataStr).forEach(janela => {
      let current = janela.start;
      const push = fim => {
        if (fim - current >= slot) gaps.push({ profissionalId: prof.id, profissionalNome: prof.nome, data: dataStr, inicio: minToHHMM(current), fim: minToHHMM(fim), minutos: fim - current });
      };
      ocupados.forEach(o => {
        if (o.end <= janela.start || o.start >= janela.end) return;
        push(Math.min(o.start, janela.end));
        current = Math.max(current, o.end);
      });
      push(janela.end);
    });
  });
  return gaps;
}

function minToHHMM(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

module.exports = {
  OCUPA,
  datasDoPeriodo,
  minutosDisponiveis,
  computeSur,
  computeHeatmap,
  computeLoadFactor,
  computeGaps,
  minToHHMM
};

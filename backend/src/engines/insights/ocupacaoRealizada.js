// Ocupação realizada (D-071). Data e horário da agenda são civis no fuso do salão.
// A aritmética UTC abaixo apenas numera esses dias locais, independentemente do fuso do servidor.
const { disponibilidadeDoDia, normalizar, intersecao, subtrair } = require('../DisponibilidadeEngine');
const { periodosDoDia } = require('../SlotEngine');
const { timeToMinutes } = require('../ScheduleEngine');
const { datasDoPeriodo } = require('./occupancy');
const { eventosDeProducao } = require('./eventosProducao');

const MINUTOS_DIA = 1440;
const minutoDaData = data => Date.parse(data + 'T00:00:00Z') / 60000;
const minutos = intervalos => intervalos.reduce((soma, i) => soma + i.end - i.start, 0);
const percentual = (valor, base) => base ? Math.round(valor * 1000 / base) / 10 : null;

function contadores() {
  return {
    minutosRealizados: 0, minutosDisponiveis: 0, minutosPreenchidos: 0, minutosSobrepostos: 0,
    minutosForaDaEscala: 0, minutosAntesExpediente: 0, minutosAposExpediente: 0,
    minutosSemExpediente: 0, minutosEmPausasBloqueios: 0, minutosSemHorario: 0,
    minutosDuracaoPrevista: 0, servicosSemDuracao: 0, pendenciasVinculo: 0
  };
}

function escala(profissional, empresa, data) {
  if (!profissional) return { jornada: [], disponiveis: [] };
  if (empresa.disponibilidade) {
    const dia = disponibilidadeDoDia({ ...empresa.disponibilidade, profissional, data, incluirJornada: true });
    return { jornada: dia.jornada || [], disponiveis: dia.periodos };
  }
  const dia = periodosDoDia({ profissional, empresa, data });
  return { jornada: dia.periodos, disponiveis: subtrair(dia.periodos, dia.bloqueios) };
}

// Uma faixa de relógio com três ou mais serviços ainda conta uma vez. Somar os deltas
// do mesmo instante dá intervalos [início, fim): encostar no fim não gera sobreposição.
function minutosSimultaneos(intervalos) {
  const mudancas = new Map();
  for (const { start, end } of intervalos) {
    mudancas.set(start, (mudancas.get(start) || 0) + 1);
    mudancas.set(end, (mudancas.get(end) || 0) - 1);
  }
  let anterior = 0;
  let ativos = 0;
  let total = 0;
  for (const [instante, delta] of [...mudancas].sort((a, b) => a[0] - b[0])) {
    if (ativos >= 2) total += instante - anterior;
    ativos += delta;
    anterior = instante;
  }
  return total;
}

function medirDia(linha, profissional, empresa) {
  const { jornada, disponiveis } = escala(profissional, empresa, linha.data);
  const executados = normalizar(linha.intervalosExecutados);
  linha.minutosSobrepostos = minutosSimultaneos(linha.intervalosExecutados);
  linha.intervalosExecutados = executados;
  linha.intervalosDisponiveis = disponiveis;
  linha.minutosDisponiveis = minutos(disponiveis);
  linha.minutosPreenchidos = minutos(intersecao(executados, disponiveis));
  linha.minutosForaDaEscala = minutos(executados) - linha.minutosPreenchidos;
  if (!jornada.length) {
    linha.minutosSemExpediente = linha.minutosForaDaEscala;
    return;
  }
  const abertura = jornada[0].start;
  const fechamento = jornada[jornada.length - 1].end;
  for (const { start, end } of executados) {
    linha.minutosAntesExpediente += Math.max(0, Math.min(end, abertura) - start);
    linha.minutosAposExpediente += Math.max(0, end - Math.max(start, fechamento));
  }
  linha.minutosEmPausasBloqueios = linha.minutosForaDaEscala - linha.minutosAntesExpediente - linha.minutosAposExpediente;
}

function ocupacaoPorProfissionalDia(entrada, de, ate) {
  const fontes = eventosDeProducao(entrada);
  const profissionais = new Map((entrada.profissionais || []).filter(Boolean).map(p => [p.id, p]));
  const dias = new Map(datasDoPeriodo(de, ate).map(data => [data, new Map()]));
  const inicio = minutoDaData(de);
  const fim = inicio + dias.size * MINUTOS_DIA;
  function linhaDoDia(data, profissionalId) {
    const equipe = dias.get(data);
    if (!equipe.has(profissionalId)) {
      equipe.set(profissionalId, { data, profissionalId, ...contadores(), intervalosExecutados: [] });
    }
    return equipe.get(profissionalId);
  }

  for (const e of fontes.eventos) {
    if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?$/.test(e.horario)) {
      if (dias.has(e.data)) {
        const linha = linhaDoDia(e.data, e.profissionalId);
        linha.minutosSemHorario += e.duracaoMin;
        linha.minutosRealizados += e.duracaoMin;
        if (e.duracaoPrevista) linha.minutosDuracaoPrevista += e.duracaoMin;
      }
      continue;
    }
    const inicioEvento = minutoDaData(e.data) + timeToMinutes(e.horario);
    const limite = Math.min(inicioEvento + e.duracaoMin, fim);
    let cursor = Math.max(inicioEvento, inicio);
    while (cursor < limite) {
      const meiaNoite = Math.floor(cursor / MINUTOS_DIA) * MINUTOS_DIA;
      const proximo = Math.min(limite, meiaNoite + MINUTOS_DIA);
      const data = new Date(meiaNoite * 60000).toISOString().slice(0, 10);
      const linha = linhaDoDia(data, e.profissionalId);
      linha.minutosRealizados += proximo - cursor;
      if (e.duracaoPrevista) linha.minutosDuracaoPrevista += proximo - cursor;
      linha.intervalosExecutados.push({ start: cursor - meiaNoite, end: proximo - meiaNoite });
      cursor = proximo;
    }
  }
  // A escala atual pode ser aplicada aos dias com execução constatada de um inativo.
  // Uma pendência de vínculo isolada não comprova que o profissional trabalhou na data.
  for (const e of fontes.semDuracao) {
    if (!dias.has(e.data)) continue;
    const linha = linhaDoDia(e.data, e.profissionalId);
    linha.servicosSemDuracao++;
  }
  for (const e of fontes.pendenciasVinculo) {
    if (dias.has(e.data)) linhaDoDia(e.data, e.profissionalId).pendenciasVinculo++;
  }

  const linhas = [];
  for (const [data, equipe] of dias) {
    for (const p of profissionais.values()) {
      if (p.ativo !== false) linhaDoDia(data, p.id);
    }
    for (const linha of equipe.values()) {
      const p = profissionais.get(linha.profissionalId);
      const aplicarEscala = p && (p.ativo !== false || linha.minutosRealizados > 0 || linha.servicosSemDuracao > 0);
      medirDia(linha, aplicarEscala ? p : null, entrada.empresa || {});
      linhas.push(linha);
    }
  }
  return linhas;
}

function somarOcupacao(linhas) {
  const total = contadores();
  const campos = Object.keys(total);
  for (const linha of linhas) for (const campo of campos) total[campo] += linha[campo];
  const preenchimentoGradePct = percentual(total.minutosPreenchidos, total.minutosDisponiveis);
  return {
    ...total,
    ocupacaoRealizadaPct: percentual(total.minutosRealizados, total.minutosDisponiveis),
    preenchimentoGradePct,
    coberturaParcial: total.minutosSemHorario > 0 || total.servicosSemDuracao > 0 || total.pendenciasVinculo > 0,
    capacidadeHistoricaEstimada: true,
    // PWA anterior: o cartão mostra minutos ocupados DENTRO da escala, limitados à grade.
    minutosOcupados: total.minutosPreenchidos,
    ocupacaoPct: preenchimentoGradePct
  };
}

function ocupacaoDoPeriodo(entrada, de, ate) {
  return somarOcupacao(ocupacaoPorProfissionalDia(entrada, de, ate));
}

module.exports = { ocupacaoDoPeriodo, ocupacaoPorProfissionalDia, somarOcupacao };

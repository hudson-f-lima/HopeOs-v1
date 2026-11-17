// Lista de espera compatível com uma vaga (D-054). Puro: sem banco nem relógio.
// Dada uma vaga (data, horário, profissional), diz quem da lista de espera combina e por quê:
// serviço que o profissional faz e que cabe no espaço livre a partir do horário, profissional
// preferido (ou sem preferência), data preferida (ou qualquer) e faixa de horário (migration 025).
// Só sugere: não reserva, não muda status e não manda mensagem. Quem agenda decide, e o
// POST /agenda revalida conflito ao gravar.
const { timeToMinutes, minutesToTime } = require('./ScheduleEngine');
const { janelasLivres, intervalosOcupados, periodosDoDia, resolveDuracaoMin } = require('./SlotEngine');
const { habilitadoPor } = require('./AtendimentoEngine');

const ATIVOS = ['aguardando', 'contatado'];
const hhmm = t => (t ? String(t).slice(0, 5) : null);

// Até quando o profissional está livre a partir de `inicio` (minutos), ou null se não está livre.
function livreAte({ data, inicio, profissional, empresa, agendamentos }) {
  const dia = periodosDoDia({ profissional, empresa, data });
  const bufferMin = Number(empresa && empresa.buffer_min) || 0;
  const ocupados = [...intervalosOcupados(agendamentos, profissional.id, data, bufferMin), ...dia.bloqueios];
  for (const p of dia.periodos) {
    for (const w of janelasLivres({ inicio: p.start, fim: p.end }, ocupados)) {
      if (w.start <= inicio && inicio < w.end) return w.end - (w.antesDeAtendimento ? bufferMin : 0);
    }
  }
  return null;
}

function compativeis({ itens, data, horario, profissional, empresa, agendamentos, servicos, links, clientes, agora }) {
  const inicio = timeToMinutes(horario);
  if (agora && (data < agora.data || (data === agora.data && inicio < agora.minuto))) return { livreAte: null, itens: [] };
  const fim = livreAte({ data, inicio, profissional, empresa, agendamentos });
  if (fim === null) return { livreAte: null, itens: [] };
  const servico = new Map((servicos || []).map(s => [s.id, s]));
  const nome = new Map((clientes || []).map(c => [c.id, c.nome]));
  // Mesma regra de habilitação do resto (D-040/D-055): sem vínculo, só se o salão não tiver nenhum.
  const habilitado = habilitadoPor(links);
  const achados = [];
  for (const it of itens || []) {
    if (!ATIVOS.includes(it.status)) continue;
    if (it.profissional_id && it.profissional_id !== profissional.id) continue;
    if (it.data_preferencia && it.data_preferencia !== data) continue;
    const s = servico.get(it.servico_id);
    if (!s || s.ativo === false) continue;
    if (!habilitado(profissional.id, s.id)) continue;
    const dur = resolveDuracaoMin({ servico: s, profissional });
    if (inicio + dur > fim) continue;
    const fi = hhmm(it.faixa_inicio); const ff = hhmm(it.faixa_fim);
    if (fi && ff && (inicio < timeToMinutes(fi) || inicio >= timeToMinutes(ff))) continue;
    const motivos = [`${s.nome} (${dur} min) cabe até ${minutesToTime(fim)}`];
    motivos.push(it.profissional_id ? 'pediu este profissional' : 'sem preferência de profissional');
    motivos.push(it.data_preferencia ? 'pediu este dia' : 'qualquer dia');
    if (fi && ff) motivos.push(`prefere ${fi}–${ff}`);
    achados.push({
      id: it.id, clienteId: it.cliente_id, clienteNome: nome.get(it.cliente_id) || 'Cliente', servicoId: s.id, servicoNome: s.nome,
      duracaoMin: dur, status: it.status, faixaInicio: fi, faixaFim: ff, dataPreferencia: it.data_preferencia || null,
      motivos, _ordem: [it.data_preferencia ? 0 : 1, it.profissional_id ? 0 : 1, fi ? 0 : 1, String(it.created_at || '')]
    });
  }
  // Primeiro quem pediu exatamente isto (dia, profissional, faixa); depois quem espera há mais tempo.
  achados.sort((a, b) => {
    for (let i = 0; i < 4; i++) { if (a._ordem[i] < b._ordem[i]) return -1; if (a._ordem[i] > b._ordem[i]) return 1; }
    return 0;
  });
  return { livreAte: minutesToTime(fim), itens: achados.map(({ _ordem, ...x }) => x) };
}

module.exports = { compativeis, livreAte };

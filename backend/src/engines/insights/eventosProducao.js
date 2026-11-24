// A RPC grava uma linha por serviço resolvido. duracao_min é o valor histórico
// da linha; o resolver fixa quantidade=1 para serviços. Nunca multiplicar aqui.
const { comandoIdDoAgendamento } = require('../../services/CheckoutReplay');
const { isClosedCommand } = require('./retention');

const CAMPOS_AGENDA_PRODUCAO = 'id,empresa_id,data,status,profissional_id,servico_id,cliente_id,horario,duracao_min';
const CAMPOS_COMANDA_PRODUCAO = 'id,empresa_id,data,status,cliente_id,agendamento_checkout:snapshot->request->raw->agendamentoId::text';
const CAMPOS_ITEM_PRODUCAO = 'id,comando_id,tipo,profissional_id,servico_id,duracao_min,quantidade';

const normalizarId = id => typeof id === 'string' ? id.trim().toLowerCase() : '';
// JSON null explícito significa avulsa. A conversão jsonb::text conserva a
// diferença para SQL NULL, que significa ausência do campo em recibos antigos.
function vinculoDoRecibo(c) {
  const projetado = c.agendamento_checkout;
  if (projetado == null) return c.snapshot?.request?.raw?.agendamentoId;
  if (projetado === 'null') return null;
  // A projeção jsonb::text envolve a string em aspas; uma identidade que
  // já veio normalizada de outro chamador também é válida.
  return projetado.startsWith('"') ? JSON.parse(projetado) : projetado;
}
const idAgendaDoRecibo = c => normalizarId(vinculoDoRecibo(c));
const concluido = a => a.status === 'concluido' || a.status === 'fechado';
const duracao = n => Number.isSafeInteger(Number(n)) && Number(n) > 0 ? Number(n) : 0;

function registrosUnicos(registros) {
  const ids = new Set();
  return registros.filter(r => {
    if (!r || (r.id && ids.has(r.id))) return false;
    if (r.id) ids.add(r.id);
    return true;
  });
}

function agrupar(mapa, chave, valor) {
  if (!mapa.has(chave)) mapa.set(chave, []);
  mapa.get(chave).push(valor);
}

// Indício para suspender uma linha legada incerta, jamais para atribuir horário
// ou unir identidades. Exige cliente, dia, profissional E serviço conhecidos.
function chaveDeConferencia(data, cliente, prof, servico) {
  return data && cliente && prof && servico ? [data, cliente, prof, servico].join('|') : null;
}

function eventosDeProducao({ agendamentos = [], comandos = [], comandoItens = [] } = {}) {
  const eventos = [], pendenciasVinculo = [], semDuracao = [];
  const agendas = registrosUnicos(agendamentos);
  const porAgenda = new Map(), itensPorComanda = new Map(), agendaPorComandaEstavel = new Map();
  // O checkout atual reserva a PK UUIDv8 para a agenda; recibos antigos trazem o ID no snapshot.
  if (comandos.some(c => c.id?.[14] === '8' && !idAgendaDoRecibo(c))) {
    for (const a of agendas) {
      if (a.empresa_id && a.id) agendaPorComandaEstavel.set(comandoIdDoAgendamento(a.empresa_id, normalizarId(a.id)), normalizarId(a.id));
    }
  }
  for (const i of registrosUnicos(comandoItens)) {
    if (i.tipo === 'servico') agrupar(itensPorComanda, i.comando_id, i);
  }

  function registrar(data, profissionalId, horario, duracaoMin, duracaoPrevista) {
    const diagnostico = { data, profissionalId: profissionalId || null };
    if (!profissionalId) pendenciasVinculo.push(diagnostico);
    if (!duracaoMin) semDuracao.push(diagnostico);
    if (profissionalId && duracaoMin) eventos.push({ ...diagnostico, horario: horario || null, duracaoMin, duracaoPrevista });
  }
  function registrarItem(c, i) {
    registrar(c.data, i.profissional_id, null, duracao(i.duracao_min), false);
  }
  const idsAgenda = new Set(agendas.map(a => normalizarId(a.id)).filter(Boolean));
  const possiveisDuplicatas = new Set(agendas.filter(concluido)
    .map(a => chaveDeConferencia(a.data, a.cliente_id, a.profissional_id, a.servico_id)).filter(Boolean));
  for (const c of registrosUnicos(comandos)) {
    if (!c.status || !isClosedCommand(c)) continue;
    const itens = itensPorComanda.get(c.id) || [];
    const idAgenda = idAgendaDoRecibo(c) || agendaPorComandaEstavel.get(c.id);
    if (idAgenda && idsAgenda.has(idAgenda)) {
      agrupar(porAgenda, idAgenda, { c, itens });
    } else {
      if (idAgenda && itens.length) pendenciasVinculo.push({ data: c.data, profissionalId: itens[0].profissional_id || null });
      for (const i of itens) {
        if (!idAgenda && vinculoDoRecibo(c) === undefined && possiveisDuplicatas.has(chaveDeConferencia(c.data, c.cliente_id, i.profissional_id, i.servico_id))) {
          // Sem declaração de avulsa, a etapa concluída prevalece até conferência.
          pendenciasVinculo.push({ data: c.data, profissionalId: i.profissional_id });
        } else {
          registrarItem(c, i);
        }
      }
    }
  }

  for (const a of agendas) {
    const recibos = porAgenda.get(normalizarId(a.id)) || [];
    if (!concluido(a)) {
      // A comanda existe mesmo se a reconciliação falhou. A hora da reserva
      // pendente/cancelada não comprova o início de um serviço.
      for (const { c, itens } of recibos) {
        if (itens.length) pendenciasVinculo.push({ data: c.data, profissionalId: a.profissional_id || null });
        for (const i of itens) registrarItem(c, i);
      }
      continue;
    }

    const candidatas = [];
    for (const { c, itens } of recibos) {
      for (const i of itens) {
        const outroServico = a.servico_id && i.servico_id && i.servico_id !== a.servico_id;
        const outroExecutor = a.profissional_id && i.profissional_id && i.profissional_id !== a.profissional_id;
        if (outroServico || outroExecutor) registrarItem(c, i);
        else candidatas.push({ c, i });
      }
    }
    const prevista = duracao(a.duracao_min ?? a.duracaoMin);
    const item = candidatas[0]?.i;
    if (!item || (candidatas.length === 1 && a.servico_id && a.profissional_id &&
      a.servico_id === item.servico_id && a.profissional_id === item.profissional_id)) {
      const doItem = duracao(item?.duracao_min);
      registrar(a.data, a.profissional_id, a.horario, doItem || prevista, !doItem);
    } else if (candidatas.length === 1) {
      pendenciasVinculo.push({ data: a.data, profissionalId: a.profissional_id || item.profissional_id || null });
      if (a.profissional_id && prevista) registrar(a.data, a.profissional_id, a.horario, prevista, true);
      else registrarItem(candidatas[0].c, item);
    } else {
      pendenciasVinculo.push({ data: a.data, profissionalId: a.profissional_id });
      if (new Set(candidatas.map(l => l.c.id)).size === 1) {
        // Linhas distintas do mesmo fechamento são execuções distintas, mas o
        // recibo não diz qual delas tem o horário da agenda. Preserva a data.
        for (const { i } of candidatas) registrar(a.data, i.profissional_id, null, duracao(i.duracao_min), false);
      } else {
        // Recibos históricos disputam a mesma etapa. A agenda comprova uma execução.
        registrar(a.data, a.profissional_id, a.horario, prevista, true);
      }
    }
  }
  return { eventos, pendenciasVinculo, semDuracao };
}

module.exports = {
  eventosDeProducao, idAgendaDoRecibo, CAMPOS_AGENDA_PRODUCAO, CAMPOS_COMANDA_PRODUCAO, CAMPOS_ITEM_PRODUCAO
};

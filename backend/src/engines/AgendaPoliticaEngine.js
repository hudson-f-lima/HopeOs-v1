// Regras da agenda configuráveis (D-049, migration 024). Funções puras: o servidor decide; a
// recepção recebe AVISOS (segue se confirmar, e a exceção fica no histórico); o link online
// BLOQUEIA (publicBooking).
//
// Prazo de cancelamento: um só (decisão do dono). O do serviço, se houver; senão o do salão
// (online_cancelamento_prazo_min, 016); senão 120 min. Vale para o link do cliente, para o aviso
// da recepção ao cancelar e para a confiabilidade (cancelamento tardio).

const PRAZO_PADRAO_MIN = 120;
const ATIVOS = ['agendado', 'confirmado', 'aguardando', 'em_atendimento'];
const REALIZADOS = ['concluido', 'fechado'];

const inteiro = (v, min, max) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== '' && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

function prazoCancelamentoMin(empresa = {}, servico = null) {
  const doServico = servico ? inteiro(servico.cancelamento_prazo_min, 0, 10080) : null;
  if (doServico !== null) return doServico;
  const doSalao = inteiro(empresa && empresa.online_cancelamento_prazo_min, 0, 10080);
  return doSalao !== null ? doSalao : PRAZO_PADRAO_MIN;
}

function antecedenciaOnlineMin(empresa = {}, servico = null, padrao = 120) {
  const doServico = servico ? inteiro(servico.antecedencia_min_online, 0, 10080) : null;
  if (doServico !== null) return doServico;
  const doSalao = inteiro(empresa && empresa.online_antecedencia_min, 0, 10080);
  return doSalao !== null ? doSalao : padrao;
}

// Cancelado dentro do prazo (menos de `prazoMin` antes do início) = tardio. `inicio` e
// `canceladoEm` são Date. Cancelar depois do horário também é tardio.
function cancelamentoTardio({ inicio, canceladoEm, prazoMin }) {
  if (!(inicio instanceof Date) || !(canceladoEm instanceof Date) || Number.isNaN(inicio.getTime()) || Number.isNaN(canceladoEm.getTime())) return false;
  return inicio.getTime() - canceladoEm.getTime() < prazoMin * 60e3;
}

const diasEntre = (a, b) => Math.round((Date.parse(`${String(b).slice(0, 10)}T12:00:00Z`) - Date.parse(`${String(a).slice(0, 10)}T12:00:00Z`)) / 864e5);
const dataBR = d => String(d).slice(0, 10).split('-').reverse().join('/');

// Avisos da recepção ao criar ou mudar o dia de um horário. `agendamentosDoCliente`: todos do
// cliente (o próprio horário em edição sai por `ignorarId`). `hoje`: AAAA-MM-DD no fuso.
function avisosRecepcao({ empresa = {}, servico = null, novo, agendamentosDoCliente = [], hoje }) {
  const avisos = [];
  const outros = agendamentosDoCliente.filter(a => a.id !== novo.ignorarId);
  const ativos = outros.filter(a => ATIVOS.includes(a.status));
  const data = String(novo.data).slice(0, 10);

  const janela = inteiro(empresa.agenda_janela_dias_recepcao, 1, 730);
  const distancia = diasEntre(hoje, data);
  if (janela !== null && distancia > janela) {
    avisos.push({ codigo: 'JANELA', mensagem: `Fica a ${distancia} dias; a regra do salão é marcar até ${janela} dias à frente.` });
  }

  const maxFuturos = inteiro(empresa.agenda_max_futuros_recepcao, 1, 50);
  const futuros = ativos.filter(a => String(a.data).slice(0, 10) >= hoje);
  if (maxFuturos !== null && futuros.length >= maxFuturos) {
    avisos.push({ codigo: 'MAX_FUTUROS', mensagem: `O cliente já tem ${futuros.length} horário(s) marcado(s); a regra do salão é até ${maxFuturos}.` });
  }

  const intervalo = inteiro(empresa.agenda_intervalo_min_dias, 1, 180);
  if (intervalo !== null && novo.servicoId) {
    const perto = outros
      .filter(a => a.servico_id === novo.servicoId && (ATIVOS.includes(a.status) || REALIZADOS.includes(a.status)))
      .filter(a => Math.abs(diasEntre(a.data, data)) < intervalo)
      .sort((a, b) => Math.abs(diasEntre(a.data, data)) - Math.abs(diasEntre(b.data, data)))[0];
    if (perto) {
      const nome = (servico && servico.nome) || 'o mesmo serviço';
      avisos.push({ codigo: 'INTERVALO', mensagem: `Já tem ${nome} em ${dataBR(perto.data)}: menos de ${intervalo} dias de intervalo.` });
    }
  }

  // Regra desligada não muda nada: sem configuração, nenhum aviso (o salão que não mexeu continua
  // como era). "Mesmo dia" não vira aviso fixo: corte e barba marcados separados são comuns.
  return avisos;
}

// Online: o mesmo cliente no mesmo serviço a menos de N dias de outro horário (bloqueia).
function violaIntervaloOnline({ empresa = {}, servicoId, data, historico = [] }) {
  const intervalo = inteiro(empresa.agenda_intervalo_min_dias, 1, 180);
  if (intervalo === null) return false;
  return historico.some(a => a.servico_id === servicoId && (ATIVOS.includes(a.status) || REALIZADOS.includes(a.status))
    && Math.abs(diasEntre(a.data, data)) < intervalo);
}

function atrasoAlertaMin(empresa = {}) {
  const v = inteiro(empresa.agenda_atraso_alerta_min, 0, 240);
  return v === null ? 15 : v;
}

module.exports = { PRAZO_PADRAO_MIN, prazoCancelamentoMin, antecedenciaOnlineMin, cancelamentoTardio, avisosRecepcao, violaIntervaloOnline, atrasoAlertaMin, diasEntre };

// Marcadores do card da agenda (D-077, cards etapa 2, sem migration). Motor puro: recebe o que
// já está gravado e devolve, por agendamento, os códigos dos ícones que o card pode mostrar.
// Só os 7 ícones com fonte gravada (skill agenda-cards). Nenhum valor é inventado: sem fonte, sem
// ícone. A trilha agendamento_eventos é best-effort (AgendaEventosService), então um ícone que
// depende dela pode faltar, nunca sobrar.
//
// Códigos, na ordem em que o card os mostra:
//   assinatura          assinatura em dia (situacao.estado 'em_dia'), só com verAssinatura
//   assinatura_atraso   assinatura 'atrasada' ou 'suspensa', só com verAssinatura
//   primeira_visita     nenhum atendimento concluído nem comanda fechada em dia anterior
//   recorrente          agendamento de uma série (serie_id, migration 018)
//   link                criado pelo link público (evento origem_link_publico)
//   espera              baixou um pedido da lista de espera (evento 'criado' com espera_baixada)
//   faltas              régua de faltas em 'alerta' ou 'exigir_sinal', só com faltas ANTES do horário
const { computeReguaFaltas } = require('./NoShowLadder');
const { situacao } = require('./AssinaturaCicloEngine');
const { isClosedCommand } = require('./insights/retention');

const ORDEM = ['assinatura', 'assinatura_atraso', 'primeira_visita', 'recorrente', 'link', 'espera', 'faltas'];
const FINALIZADOS = ['concluido', 'fechado'];
const TIPO_LINK = 'origem_link_publico';

const dia = v => String(v || '').slice(0, 10);
const hora = v => String(v || '').slice(0, 5);
const antes = (x, a) => dia(x.data) < dia(a.data) || (dia(x.data) === dia(a.data) && hora(x.horario) < hora(a.horario));

// Estado da assinatura do cliente HOJE: em dia vence atraso (cliente com duas, uma em dia, é assinante).
function estadoAssinatura(clienteId, { assinaturas, planos, cobrancas, hoje }) {
  let pior = null;
  for (const a of assinaturas) {
    if (a.cliente_id !== clienteId) continue;
    const plano = planos.find(p => p.id === a.plano_id);
    if (!plano) continue;
    const s = situacao({ assinatura: a, plano, cobrancas: cobrancas.filter(c => c.assinatura_id === a.id), hoje });
    if (s.estado === 'em_dia') return 'assinatura';
    if (s.estado === 'atrasada' || s.estado === 'suspensa') pior = 'assinatura_atraso';
  }
  return pior;
}

function marcadoresDoDia({
  agendamentos = [], historico = [], comandas = [], eventos = [],
  assinaturas = [], planos = [], cobrancas = [], empresa = {}, hoje, verAssinatura = false
}) {
  const link = new Set(eventos.filter(e => e.tipo === TIPO_LINK).map(e => e.agendamento_id));
  const espera = new Set(eventos.filter(e => e.tipo === 'criado' && e.payload && e.payload.espera_baixada).map(e => e.agendamento_id));
  const limites = { alerta: empresa.regua_alerta_faltas ?? 2, sinal: empresa.regua_sinal_faltas ?? 3 };
  const porCliente = Map.groupBy(historico.filter(h => h.cliente_id), h => h.cliente_id);
  const comandasPorCliente = Map.groupBy(comandas.filter(c => c.cliente_id && isClosedCommand(c)), c => c.cliente_id);
  const assinaturaCache = new Map();
  const saida = {};
  for (const a of agendamentos) {
    const codigos = new Set();
    const cli = a.cliente_id;
    if (cli) {
      if (verAssinatura) {
        if (!assinaturaCache.has(cli)) assinaturaCache.set(cli, estadoAssinatura(cli, { assinaturas, planos, cobrancas, hoje }));
        const est = assinaturaCache.get(cli);
        if (est) codigos.add(est);
      }
      const doCliente = (porCliente.get(cli) || []).filter(h => h.id !== a.id);
      const visitaAntes = doCliente.some(h => FINALIZADOS.includes(h.status) && dia(h.data) < dia(a.data))
        || (comandasPorCliente.get(cli) || []).some(c => dia(c.data) < dia(a.data));
      if (!visitaAntes) codigos.add('primeira_visita');
      const regua = computeReguaFaltas(doCliente.filter(h => antes(h, a)), limites);
      if (regua.nivel === 'alerta' || regua.nivel === 'exigir_sinal') codigos.add('faltas');
    }
    if (a.serie_id) codigos.add('recorrente');
    if (link.has(a.id)) codigos.add('link');
    if (espera.has(a.id)) codigos.add('espera');
    saida[a.id] = ORDEM.filter(c => codigos.has(c));
  }
  return saida;
}

// Concluído e pago: status 'fechado', ou 'concluido' com o evento do checkout na trilha. 'concluido'
// também pode ser marcado à mão (sem comanda), então só o status não basta. Trilha best-effort:
// pode faltar a marca de pago, nunca sobrar.
function pagosDoDia({ agendamentos = [], eventos = [] }) {
  const peloCaixa = new Set(eventos.filter(e => e.tipo === 'status' && e.payload && e.payload.para === 'concluido' && e.payload.origem === 'checkout').map(e => e.agendamento_id));
  return new Set(agendamentos.filter(a => a.status === 'fechado' || (a.status === 'concluido' && peloCaixa.has(a.id))).map(a => a.id));
}

module.exports = { marcadoresDoDia, pagosDoDia, ORDEM };

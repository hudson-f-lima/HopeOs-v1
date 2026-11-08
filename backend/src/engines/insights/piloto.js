// Painel do piloto: os 4 números que a auditoria 2026-11 (§4) manda medir por
// 30 dias num salão real. Função pura: recebe as linhas já filtradas pelo
// tenant e um "hoje" injetado (data local no fuso da empresa).
//
// Definições (cada uma testada em tests/piloto-gate.test.js):
//
// "Atendimento" = par (cliente_id, data) com agendamento em status concluido/
// fechado OU comanda fechada (mesma regra de retention.normalizeCommands).
// Dois registros do mesmo cliente no mesmo dia contam como um atendimento.
//
// 1. taxaFalta = no_show / (atendidos + no_show + cancelado tardio)
//    Universo: agendamentos com data em [de, ate] e data <= hoje.
//    atendidos = status concluido|fechado; cancelado tardio = regra de
//    retention.isLateCancel (cancelado com updated_at até 24h antes do horário).
//    Menor é melhor.
//
// 2. reagendamentoCheckout = atendimentos com próximo agendamento marcado /
//    atendimentos maduros.
//    Universo: atendimentos com data em [de, ate] e data + REBOOK_JANELA_DIAS <= hoje
//    (os mais recentes ficam em `emMaturacao`). Conta no numerador se existe
//    agendamento do mesmo cliente com data > data do atendimento e created_at
//    (convertido para a data local) <= data do atendimento + REBOOK_JANELA_DIAS,
//    em qualquer status (o que se mede é a marcação, não o comparecimento).
//    APROXIMAÇÃO: não há registro de "criado no checkout"; usa-se created_at no
//    mesmo dia ou no dia seguinte. Agendamento sem created_at não conta.
//
// 3. retornoClienteNovo = clientes novos que voltaram em até RETORNO_JANELA_DIAS /
//    clientes novos maduros.
//    Cliente novo = 1º atendimento de toda a história do tenant com data em [de, ate].
//    Maduro = 1º atendimento + RETORNO_JANELA_DIAS <= hoje (os demais ficam em
//    `emMaturacao`, fora do denominador). Voltou = outro atendimento com data em
//    (1º, 1º + RETORNO_JANELA_DIAS].
//
// 4. confirmacaoPrevia = confirmados / agendamentos de hoje ainda não atendidos.
//    Universo: agendamentos com data = hoje e status agendado|confirmado.
//    LIMITAÇÃO: o status "confirmado" é sobrescrito no atendimento/falta e não há
//    histórico de status gravado; por isso é uma FOTO do dia atual (não usa de/ate).
//
// Quebra por profissional (`porProfissional`) para falta e reagendamento, com as
// MESMAS definições, para medir no futuro gatilhos por profissional (ex.: falta
// < 3%, reagendamento >= 35%) sem lógica nova. Aqui só se mede; nada de bônus.
//   - falta: agendamento atribuído a agendamentos.profissional_id.
//   - reagendamento: o atendimento é atribuído a cada profissional que o fez
//     (profissional_id do agendamento concluído e dos comando_itens de serviço da
//     comanda fechada). Atendimento com 2 profissionais conta para os dois, por
//     isso a soma por profissional pode passar do total do salão.
//   - registro sem profissional não entra na quebra (só no total).

const { normalizeCommands, isLateCancel, addDays } = require('./retention');
const { agoraNoFuso } = require('../SlotEngine');

const REBOOK_JANELA_DIAS = 1;
const RETORNO_JANELA_DIAS = 60;
const ATENDIDO = ['concluido', 'fechado'];

const REFERENCIAS = {
  taxaFalta: { melhorQuando: 'menor', media: { min: 10, max: 20 }, topo: null, fonte: 'Auditoria 2026-11 §3 (SchedulingKit, Salon Today)' },
  reagendamentoCheckout: { melhorQuando: 'maior', media: { min: 40, max: 52 }, topo: { min: 70, max: 80 }, fonte: 'Auditoria 2026-11 §3 (Kitomba, SalonIQ)' },
  retornoClienteNovo: { melhorQuando: 'maior', media: { min: 30, max: 35 }, topo: { min: 70, max: null }, fonte: 'Auditoria 2026-11 §3 (Phorest, Boulevard)' },
  confirmacaoPrevia: { melhorQuando: 'maior', media: null, topo: null, fonte: 'Sem referência no relatório §3' }
};

const dia = v => (v ? String(v).slice(0, 10) : null);

function kpi(nome, numerador, denominador, extra = {}) {
  return {
    numerador,
    denominador,
    taxa: denominador > 0 ? Math.round((numerador / denominador) * 1000) / 10 : null,
    referencia: REFERENCIAS[nome],
    ...extra
  };
}

function dataLocal(timestamp, timeZone) {
  if (!timestamp) return null;
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return null;
  return agoraNoFuso(timeZone, d).data;
}

function atendimentosDe(agendamentos, comandos, comandoItens) {
  const porChave = new Map();
  const add = (clienteId, data, profissionais) => {
    if (!clienteId || !data) return;
    const k = `${clienteId}|${data}`;
    if (!porChave.has(k)) porChave.set(k, { clienteId: String(clienteId), data, profissionais: new Set() });
    profissionais.filter(Boolean).forEach(p => porChave.get(k).profissionais.add(String(p)));
  };
  const profsDaComanda = new Map();
  comandoItens.forEach(i => {
    if (i.tipo !== 'servico' || !i.profissional_id) return;
    if (!profsDaComanda.has(i.comando_id)) profsDaComanda.set(i.comando_id, []);
    profsDaComanda.get(i.comando_id).push(i.profissional_id);
  });
  agendamentos.filter(a => ATENDIDO.includes(a.status)).forEach(a => add(a.cliente_id, dia(a.data), [a.profissional_id]));
  normalizeCommands(comandos).forEach(c => add(c.cliente_id, c.data, profsDaComanda.get(c.id) || []));
  return [...porChave.values()].sort((a, b) => a.data.localeCompare(b.data));
}

function agrupar(itens, chavesFn) {
  const m = new Map();
  itens.forEach(item => chavesFn(item).forEach(k => {
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }));
  return m;
}

function falta(passados) {
  const atendidos = passados.filter(a => ATENDIDO.includes(a.status)).length;
  const noShow = passados.filter(a => a.status === 'no_show').length;
  const cancelTardio = passados.filter(isLateCancel).length;
  return kpi('taxaFalta', noShow, atendidos + noShow + cancelTardio, { atendidos, noShow, cancelTardio });
}

function computePiloto({ agendamentos = [], comandos = [], comandoItens = [], de, ate, hoje, timeZone = 'America/Sao_Paulo' }) {
  const noPeriodo = d => d && d >= de && d <= ate;
  const ags = agendamentos.map(a => ({ ...a, data: dia(a.data) }));

  // 1. Falta
  const passados = ags.filter(a => noPeriodo(a.data) && a.data <= hoje);
  const taxaFalta = falta(passados);

  // 2. Reagendamento no checkout
  const atendimentos = atendimentosDe(ags, comandos, comandoItens);
  const limiteRebook = addDays(hoje, -REBOOK_JANELA_DIAS);
  const visitasPeriodo = atendimentos.filter(v => noPeriodo(v.data));
  const maduras = visitasPeriodo.filter(v => v.data <= limiteRebook);
  const futurosPorCliente = new Map();
  ags.forEach(a => {
    if (!a.cliente_id) return;
    const k = String(a.cliente_id);
    if (!futurosPorCliente.has(k)) futurosPorCliente.set(k, []);
    futurosPorCliente.get(k).push({ data: a.data, criadoEm: dataLocal(a.created_at, timeZone) });
  });
  const remarcou = v => {
    const prazo = addDays(v.data, REBOOK_JANELA_DIAS);
    return (futurosPorCliente.get(v.clienteId) || []).some(a => a.data > v.data && a.criadoEm && a.criadoEm <= prazo);
  };
  const rebook = (visitas, maturas) => kpi('reagendamentoCheckout', maturas.filter(remarcou).length, maturas.length, {
    emMaturacao: visitas.length - maturas.length
  });
  const reagendamentoCheckout = {
    ...rebook(visitasPeriodo, maduras),
    janelaDias: REBOOK_JANELA_DIAS,
    aproximacao: 'created_at do próximo agendamento até o dia seguinte ao atendimento'
  };

  // Quebra por profissional (mesmas definições).
  const faltaPorProf = agrupar(passados, a => [a.profissional_id && String(a.profissional_id)]);
  const visitasPorProf = agrupar(visitasPeriodo, v => [...v.profissionais]);
  const ids = [...new Set([...faltaPorProf.keys(), ...visitasPorProf.keys()])].sort();
  const porProfissional = ids.map(profissionalId => {
    const visitas = visitasPorProf.get(profissionalId) || [];
    const { referencia: _rf, ...f } = falta(faltaPorProf.get(profissionalId) || []);
    const { referencia: _rr, ...r } = rebook(visitas, visitas.filter(v => v.data <= limiteRebook));
    return { profissionalId, taxaFalta: f, reagendamentoCheckout: r };
  });

  // 3. Retorno do cliente novo
  const porCliente = new Map();
  atendimentos.forEach(v => {
    if (!porCliente.has(v.clienteId)) porCliente.set(v.clienteId, []);
    porCliente.get(v.clienteId).push(v.data);
  });
  const limiteRetorno = addDays(hoje, -RETORNO_JANELA_DIAS);
  let novos = 0; let maduros = 0; let voltaram = 0;
  porCliente.forEach(datas => {
    const primeira = datas[0];
    if (!noPeriodo(primeira)) return;
    novos += 1;
    if (primeira > limiteRetorno) return;
    maduros += 1;
    const prazo = addDays(primeira, RETORNO_JANELA_DIAS);
    if (datas.some(d => d > primeira && d <= prazo)) voltaram += 1;
  });
  const retornoClienteNovo = kpi('retornoClienteNovo', voltaram, maduros, {
    clientesNovos: novos,
    emMaturacao: novos - maduros,
    janelaDias: RETORNO_JANELA_DIAS
  });

  // 4. Confirmação prévia (foto de hoje)
  const deHoje = ags.filter(a => a.data === hoje && (a.status === 'agendado' || a.status === 'confirmado'));
  const confirmacaoPrevia = kpi('confirmacaoPrevia', deHoje.filter(a => a.status === 'confirmado').length, deHoje.length, {
    dia: hoje,
    escopo: 'foto_do_dia',
    limitacao: 'status confirmado é sobrescrito no atendimento; sem histórico de status, mede só a agenda de hoje ainda não atendida'
  });

  return { periodo: { de, ate, hoje }, taxaFalta, reagendamentoCheckout, retornoClienteNovo, confirmacaoPrevia, porProfissional };
}

module.exports = { computePiloto, REFERENCIAS, REBOOK_JANELA_DIAS, RETORNO_JANELA_DIAS };

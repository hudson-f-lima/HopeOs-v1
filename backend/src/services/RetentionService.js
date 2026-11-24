const { computeReguaFaltas } = require('../engines/NoShowLadder');
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { createAppError } = require('../errors');
const retention = require('../engines/insights/retention');
const { prazoCancelamentoMin } = require('../engines/AgendaPoliticaEngine');
const { agoraNoFuso } = require('../engines/SlotEngine');
const { env } = require('../config/env');
const clock = require('../config/clock');

// Hoje no fuso da empresa (APP_TIMEZONE; antes fixo em America/Sao_Paulo).
function todaySaoPaulo() {
  return agoraNoFuso(env.APP_TIMEZONE, clock.agora()).data;
}

function byId(rows) {
  return new Map((rows || []).map(row => [row.id, row]));
}

function groupByCliente(comandos) {
  const map = new Map();
  (comandos || []).forEach(command => {
    if (!command.cliente_id) return;
    if (!map.has(command.cliente_id)) map.set(command.cliente_id, []);
    map.get(command.cliente_id).push(command);
  });
  return map;
}

function serviceHistoryFromCommands(comandos, comandoItens, clienteId = null) {
  const commandsById = byId(comandos || []);
  return (comandoItens || [])
    .filter(item => item.tipo === 'servico' && item.servico_id && item.comando_id)
    .map(item => {
      const command = commandsById.get(item.comando_id);
      if (!command || (clienteId && command.cliente_id !== clienteId)) return null;
      return {
        comando_id: command.id,
        cliente_id: command.cliente_id,
        servico_id: item.servico_id,
        data: command.data,
        hora: command.hora || command.horario,
        created_at: command.created_at
      };
    })
    .filter(Boolean);
}

function dominantServiceFromHistory(history) {
  const counts = {};
  (history || []).forEach(item => {
    if (!item.servico_id) return;
    counts[item.servico_id] = (counts[item.servico_id] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function computeNovosRetention(comandos, hoje) {
  const grouped = groupByCliente(comandos);
  let total1aVisita90d = 0;
  let voltaram = 0;

  grouped.forEach(clientCommands => {
    const sorted = [...clientCommands].filter(c => c.data).sort((a, b) => String(a.data).localeCompare(String(b.data)));
    if (!sorted.length) return;
    const daysFromFirst = retention.daysBetween(sorted[0].data, hoje);
    if (daysFromFirst !== null && daysFromFirst <= 90) {
      total1aVisita90d += 1;
      if (sorted.length > 1) voltaram += 1;
    }
  });

  return {
    total1aVisita90d,
    voltaram,
    pct: total1aVisita90d ? Math.round((voltaram / total1aVisita90d) * 1000) / 10 : 0
  };
}

function commandCreatedAt(command) {
  if (command.created_at) {
    const created = new Date(command.created_at);
    if (!Number.isNaN(created.getTime())) return created;
  }
  if (command.data) {
    // data + hora são locais (fuso da empresa); HH:MM:SS aceito.
    const created = retention.scheduledDateTime({ data: command.data, horario: command.hora || '00:00' }, env.APP_TIMEZONE);
    if (created && !Number.isNaN(created.getTime())) return created;
  }
  return null;
}

function computeRebookingRate(comandos, agendamentos) {
  const eligible = (comandos || []).filter(command => command.cliente_id && commandCreatedAt(command));
  if (!eligible.length) return 0;

  let rebooked = 0;
  eligible.forEach(command => {
    const commandCreated = commandCreatedAt(command);
    const hasRebooking = (agendamentos || []).some(agendamento => {
      if (agendamento.cliente_id !== command.cliente_id || !agendamento.created_at) return false;
      const created = new Date(agendamento.created_at);
      if (Number.isNaN(created.getTime())) return false;
      const delta = created - commandCreated;
      return delta >= 0 && delta <= (24 * 60 * 60 * 1000);
    });
    if (hasRebooking) rebooked += 1;
  });

  return Math.round((rebooked / eligible.length) * 1000) / 10;
}

class RetentionService {
  constructor(empresaId) {
    if (!empresaId) throw new Error('RetentionService exige empresaId');
    this.repo = new SupabaseRepository(empresaId);
  }

  async loadRetentionInsights({ financeiro = false, contato = false, hoje = todaySaoPaulo() } = {}) {
    const filtro = { empresa_id: this.repo.empresaId };
    const camposComanda = 'id,cliente_id,status,data,hora,created_at';
    const ler = (tabela, campos) => this.repo.list(tabela, filtro, { campos, ordem: 'id' });
    const [clientes, comandos, comandoItens, agendamentos] = await Promise.all([
      ler('clientes', contato ? 'id,nome,whatsapp' : 'id,nome'),
      ler('comandos', financeiro ? `${camposComanda},total_recebido_centavos` : camposComanda),
      ler('comando_itens', 'comando_id,tipo,servico_id'),
      ler('agendamentos', 'cliente_id,created_at')
    ]);

    const clientesById = byId(clientes);
    const comandosByCliente = groupByCliente(comandos);
    const rfm = retention.computeRfm(comandos, hoje);
    const intervaloPorServico = retention.prepararIntervaloPorServico(comandos, comandoItens);
    const segmentosMap = new Map(retention.SEGMENTS.map(segment => [
      segment.nome,
      { nome: segment.nome, label: segment.label, n: 0, valor180dCentavos: 0 }
    ]));

    const quemChamar = [];
    const assinaturaCandidatos = [];

    rfm.clientes.forEach(entry => {
      const cliente = clientesById.get(entry.clienteId) || {};
      const segment = financeiro && segmentosMap.get(entry.segmento);
      if (segment) {
        segment.n += 1;
        segment.valor180dCentavos += entry.valor180dCentavos;
      }

      const churn = retention.computeChurnRisk({
        comandosCliente: comandosByCliente.get(entry.clienteId) || [],
        intervaloPorServico,
        hoje,
        valor180dCentavos: entry.valor180dCentavos
      });

      if (churn.risco !== 'ok' && (!financeiro || churn.prioridade > 0)) {
        quemChamar.push({
          clienteId: entry.clienteId,
          nome: cliente.nome || 'Cliente',
          ...(contato ? { whatsapp: cliente.whatsapp || null } : {}),
          diasDesdeUltima: churn.diasDesdeUltima,
          intervaloMedianoDias: churn.intervaloMedianoDias,
          risco: churn.risco,
          ...(financeiro ? { valor180dCentavos: entry.valor180dCentavos, prioridade: churn.prioridade } : {})
        });
      }

      if (financeiro && entry.visitas180d >= 4 && entry.mScore >= 4) {
        assinaturaCandidatos.push({
          clienteId: entry.clienteId,
          nome: cliente.nome || 'Cliente',
          visitas180d: entry.visitas180d,
          gastoMensalMedioCentavos: Math.round(entry.valor180dCentavos / 6)
        });
      }
    });

    // A operação prioriza os dias de atraso em relação ao intervalo habitual.
    const atraso = c => c.diasDesdeUltima - c.intervaloMedianoDias;
    quemChamar.sort(financeiro
      ? (a, b) => b.prioridade - a.prioridade
      : (a, b) => atraso(b) - atraso(a) || a.clienteId.localeCompare(b.clienteId));

    return {
      quemChamar: quemChamar.slice(0, 20),
      novosRetencao: computeNovosRetention(comandos, hoje),
      rebookingRatePct: computeRebookingRate(comandos, agendamentos),
      ...(financeiro ? {
        segmentos: Array.from(segmentosMap.values()),
        assinaturaCandidatos: assinaturaCandidatos.sort((a, b) => b.gastoMensalMedioCentavos - a.gastoMensalMedioCentavos).slice(0, 20)
      } : {})
    };
  }

  async loadClientReliability(clienteId, hoje = todaySaoPaulo()) {
    const [clientes, agendamentos, empresas] = await Promise.all([
      this.repo.list('clientes', { empresa_id: this.repo.empresaId, id: clienteId }),
      this.repo.list('agendamentos', { empresa_id: this.repo.empresaId, cliente_id: clienteId }),
      this.repo.list('empresas', { id: this.repo.empresaId })
    ]);
    const empresa = empresas[0] || {};

    const cliente = clientes[0];
    if (!cliente) {
      throw createAppError('CLIENT_NOT_FOUND', `Cliente nao encontrado: ${clienteId}`, 404, { clienteId });
    }

    // D-049: tardio pelo prazo do serviço ou do salão (o mesmo que o cliente vê no link).
    const servicos = await this.repo.list('servicos', { empresa_id: this.repo.empresaId });
    const porId = new Map(servicos.map(sv => [sv.id, sv]));
    // D-051: cancelamentos com a vaga repassada a outro cliente não contam.
    const repassadas = await this.repo.list('agendamento_eventos', { empresa_id: this.repo.empresaId, tipo: 'vaga_repassada' }).catch(() => []);
    const vagasRepassadas = new Set(repassadas.map(e => e.agendamento_id));
    const result = retention.computeReliability(agendamentos, hoje, { prazoMinDe: a => prazoCancelamentoMin(empresa, porId.get(a.servico_id)), vagasRepassadas });
    const faltasCadastro = Number(cliente.faltas || 0);
    return {
      clienteId,
      score: result.score,
      faixa: result.faixa,
      fatores: result.fatores,
      faltasCadastro,
      divergencia: faltasCadastro !== result.fatores.noShows365d,
      regua: computeReguaFaltas(agendamentos, { alerta: empresa.regua_alerta_faltas ?? 2, sinal: empresa.regua_sinal_faltas ?? 3 }, hoje)
    };
  }

  async loadAttachInsights() {
    const [comandoItens, servicos, produtos] = await Promise.all([
      this.repo.list('comando_itens', { empresa_id: this.repo.empresaId }),
      this.repo.list('servicos', { empresa_id: this.repo.empresaId }),
      this.repo.list('produtos', { empresa_id: this.repo.empresaId })
    ]);

    const servicosById = byId(servicos);
    const produtosById = byId(produtos);
    const attach = retention.computeAttach(comandoItens);

    return {
      attachRatePct: attach.attachRatePct,
      sugestoes: attach.sugestoes.map(sugestao => ({
        ...sugestao,
        servicoNome: servicosById.get(sugestao.servicoId)?.nome || sugestao.servicoNome,
        produtos: sugestao.produtos.map(produto => ({
          ...produto,
          nome: produtosById.get(produto.produtoId)?.nome || produto.nome
        }))
      }))
    };
  }

  async loadRebookingSuggestion(clienteId, servicoId = null, hoje = todaySaoPaulo()) {
    const [clientes, comandos, comandoItens] = await Promise.all([
      this.repo.list('clientes', { empresa_id: this.repo.empresaId, id: clienteId }),
      this.repo.list('comandos', { empresa_id: this.repo.empresaId }),
      this.repo.list('comando_itens', { empresa_id: this.repo.empresaId })
    ]);

    if (!clientes[0]) {
      throw createAppError('CLIENT_NOT_FOUND', `Cliente nao encontrado: ${clienteId}`, 404, { clienteId });
    }

    const clientHistory = serviceHistoryFromCommands(comandos, comandoItens, clienteId);
    const globalHistory = serviceHistoryFromCommands(comandos, comandoItens);
    const selectedServiceId = servicoId || dominantServiceFromHistory(clientHistory);

    return retention.computeRebooking(clientHistory, selectedServiceId, {
      globalHistorico: globalHistory,
      hoje
    });
  }
}

module.exports = { RetentionService, todaySaoPaulo };

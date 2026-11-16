// Envio dos lembretes (C5, D-041). Roda a cada minuto dentro do servidor (ver agendador.js) e
// pode ser chamado direto nos testes. Idempotente: a linha de agendamento_lembretes
// (agendamento, tipo, canal) é a trava. Quem inserir primeiro envia; os outros (outra instância,
// outra rodada) param. Prefere-se perder um lembrete a mandar dois.
const { SupabaseRepository } = require('../repositories/SupabaseRepository');
const { instanteLocal } = require('../services/AcessoAgendamento');
const { tiposNaJanela, assinaturaValeParaTipo, montarMensagem } = require('./lembretes');

const ATIVOS = ['agendado', 'confirmado'];
const MAX_ENVIOS_POR_RODADA = 200;
const HORIZONTE_MS = 25 * 3600e3;

const ehDuplicada = err => Boolean(err && (err.code === '23505' || /duplicate key|unique/i.test(String(err.message || ''))));
const hhmm = h => String(h || '').slice(0, 5);

async function executar({ canais, env, agora = new Date(), repoGlobal = new SupabaseRepository(null), log = () => {} }) {
  const r = { assinaturas: 0, horarios: 0, enviados: 0, falhas: 0, revogadas: 0, ignorados: 0 };
  if (!canais.push.ativo()) return { ...r, desligado: true };
  const agoraMs = agora.getTime();
  const subs = (await repoGlobal.list('agendamento_push', {})).filter(s => !s.revogado_em);
  r.assinaturas = subs.length;
  const porEmpresa = new Map();
  for (const s of subs) porEmpresa.set(s.empresa_id, [...(porEmpresa.get(s.empresa_id) || []), s]);

  let envios = 0;
  for (const [empresaId, doSalao] of porEmpresa) {
    const repo = new SupabaseRepository(String(empresaId));
    const empresa = (await repo.list('empresas', { id: repo.empresaId }))[0];
    if (!empresa || empresa.lembretes_push_ativo === false) { r.ignorados += doSalao.length; continue; }
    const acessos = (await repo.list('agendamento_acessos', { empresa_id: repo.empresaId })).filter(a => !a.revogado_em);
    const porAgendamento = new Map();
    for (const s of doSalao) {
      const acesso = acessos.find(a => a.id === s.acesso_id);
      if (!acesso) continue;
      porAgendamento.set(acesso.agendamento_id, [...(porAgendamento.get(acesso.agendamento_id) || []), s]);
    }
    for (const [agendamentoId, assinaturas] of porAgendamento) {
      const ag = await repo.getByIdScoped('agendamentos', agendamentoId);
      if (!ag || !ATIVOS.includes(ag.status)) continue;
      const inicio = instanteLocal(ag.data, hhmm(ag.horario), env.APP_TIMEZONE).getTime();
      if (inicio - agoraMs > HORIZONTE_MS || inicio <= agoraMs) continue;
      r.horarios += 1;
      const servico = ag.servico_id ? await repo.getByIdScoped('servicos', ag.servico_id) : null;
      for (const tipo of tiposNaJanela(agoraMs, inicio)) {
        const elegiveis = assinaturas.filter(s => !s.revogado_em && assinaturaValeParaTipo(Date.parse(s.created_at), inicio, tipo));
        if (!elegiveis.length) continue;
        if (envios >= MAX_ENVIOS_POR_RODADA) return { ...r, truncado: true };
        // Trava: a UNIQUE (agendamento, tipo, canal) decide quem envia.
        let linha;
        try {
          linha = await repo.insert('agendamento_lembretes', { agendamento_id: agendamentoId, tipo, canal: 'push', situacao: 'reservado', created_at: agora.toISOString(), updated_at: agora.toISOString() });
        } catch (err) {
          if (ehDuplicada(err)) continue;
          throw err;
        }
        const mensagem = montarMensagem({ tipo, salaoNome: empresa.nome, servicoNome: servico && servico.nome, data: String(ag.data), horario: ag.horario });
        let algumOk = false;
        let ultimoMotivo = null;
        for (const s of elegiveis) {
          envios += 1;
          const res = await canais.push.enviar({ assinatura: s.assinatura, mensagem });
          if (res.ok) { algumOk = true; r.enviados += 1; } else { r.falhas += 1; ultimoMotivo = res.motivo || 'falha'; }
          if (res.revogar) {
            await repo.updateScoped('agendamento_push', s.id, { revogado_em: agora.toISOString(), updated_at: agora.toISOString() });
            r.revogadas += 1;
          } else if (!res.ok) {
            await repo.updateScoped('agendamento_push', s.id, { falhas: Math.min(100, (Number(s.falhas) || 0) + 1), updated_at: agora.toISOString() });
          }
        }
        await repo.updateScoped('agendamento_lembretes', linha.id, { situacao: algumOk ? 'enviado' : 'falhou', detalhe: algumOk ? null : String(ultimoMotivo).slice(0, 200), updated_at: agora.toISOString() });
        log(`[lembretes] ${tipo} ${algumOk ? 'enviado' : 'falhou'} (${elegiveis.length} aparelho(s))`);
      }
    }
  }
  return r;
}

module.exports = { executar, MAX_ENVIOS_POR_RODADA };

// Link pessoal do agendamento (migration 017, D-038, C2).
//
// O cliente recebe um código aleatório de 32 bytes (base64url, 43 caracteres). O banco guarda
// só o SHA-256 dele (agendamento_acessos.token_hash): quem lê a tabela não monta o link. O código
// vai no fragmento da URL (#t=...), que o navegador não manda ao servidor nem no Referer, e a
// página o envia no corpo de um POST: não aparece no log de acesso (morgan registra a URL).
//
// Validade: até 24 h depois do início do horário (o cliente ainda vê o que aconteceu). Ações
// (confirmar, cancelar, remarcar) têm regras próprias, conferidas a cada pedido no servidor.
const crypto = require('crypto');
const { agoraNoFuso } = require('../engines/SlotEngine');

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const VALIDADE_APOS_INICIO_MS = 24 * 3600e3;
const MAX_ACESSOS_ATIVOS = 5; // por agendamento; o mais antigo é revogado além disso

const gerarToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = token => crypto.createHash('sha256').update(String(token)).digest('hex');

// Instante (Date) de "data hh:mm" no fuso do salão. Duas iterações bastam para fusos com horário
// de verão (o Brasil não tem desde 2019, mas o cálculo não depende disso).
function instanteLocal(data, hhmm, timeZone) {
  const [y, m, d] = String(data).split('-').map(Number);
  const [h, mi] = String(hhmm).slice(0, 5).split(':').map(Number);
  const alvo = Date.UTC(y, m - 1, d, h, mi);
  let t = alvo;
  for (let i = 0; i < 2; i++) {
    const p = agoraNoFuso(timeZone, new Date(t));
    const [py, pm, pd] = p.data.split('-').map(Number);
    t += alvo - (Date.UTC(py, pm - 1, pd) + p.minuto * 60e3);
  }
  return new Date(t);
}

// Cria um acesso para o agendamento e devolve o código em claro (única vez em que ele existe
// fora do navegador do cliente). Mantém no máximo MAX_ACESSOS_ATIVOS por agendamento.
async function criarAcesso(repo, agendamento, { origem = 'link_publico', createdBy = null, timeZone, agora = new Date() } = {}) {
  const token = gerarToken();
  const inicio = instanteLocal(agendamento.data, agendamento.horario, timeZone);
  const agoraIso = agora.toISOString();
  const ativos = (await repo.list('agendamento_acessos', { empresa_id: repo.empresaId, agendamento_id: agendamento.id }))
    .filter(a => !a.revogado_em)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  for (const velho of ativos.slice(0, Math.max(0, ativos.length - (MAX_ACESSOS_ATIVOS - 1)))) {
    await repo.updateScoped('agendamento_acessos', velho.id, { revogado_em: agoraIso, updated_at: agoraIso });
  }
  await repo.insert('agendamento_acessos', {
    agendamento_id: agendamento.id,
    token_hash: hashToken(token),
    expira_em: new Date(inicio.getTime() + VALIDADE_APOS_INICIO_MS).toISOString(),
    origem,
    created_by: createdBy,
    created_at: agoraIso,
    updated_at: agoraIso
  });
  return token;
}

// Remarcação (pelo cliente ou pela recepção): os acessos ativos passam a apontar para o novo
// agendamento, com validade recalculada. O link que o cliente tem continua o mesmo.
async function moverAcessos(repo, deAgendamentoId, novo, { timeZone, contarRemarcacao = false, agora = new Date() } = {}) {
  const inicio = instanteLocal(novo.data, novo.horario, timeZone);
  const agoraIso = agora.toISOString();
  const ativos = (await repo.list('agendamento_acessos', { empresa_id: repo.empresaId, agendamento_id: deAgendamentoId })).filter(a => !a.revogado_em);
  for (const a of ativos) {
    await repo.updateScoped('agendamento_acessos', a.id, {
      agendamento_id: novo.id,
      expira_em: new Date(inicio.getTime() + VALIDADE_APOS_INICIO_MS).toISOString(),
      remarcacoes: (Number(a.remarcacoes) || 0) + (contarRemarcacao ? 1 : 0),
      updated_at: agoraIso
    });
  }
  return ativos.length;
}

module.exports = { TOKEN_RE, gerarToken, hashToken, instanteLocal, criarAcesso, moverAcessos, MAX_ACESSOS_ATIVOS };

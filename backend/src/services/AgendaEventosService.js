// Trilha de status da agenda em agendamento_eventos (tabela da 001, sem
// migration nova). Cada criação, mudança de status, reagendamento, mudança de
// duração e conclusão pelo checkout grava um evento:
//   { tipo: 'criado' | 'status' | 'reagendado' | 'duracao',
//     payload: { de, para, actor_id, actor_type, origem, [reagendado_para|reagendado_de] } }
//
// BEST-EFFORT, de propósito: a fonte de verdade do status continua sendo
// agendamentos.status. A gravação do evento acontece DEPOIS da operação
// principal e em outra chamada PostgREST (não há transação entre as duas sem
// uma RPC nova = migration 009, que exige autorização). Se o evento falhasse
// a requisição, o cliente veria erro de algo que já foi gravado e, ao repetir,
// tomaria INVALID_STATUS_TRANSITION. Então: falhou → loga, conta em
// `metricasEventos.falhas` e segue. Lacunas na trilha são possíveis e
// documentadas; o KPI que lê a trilha trata agendamento sem evento como
// "sem trilha", não como "não confirmado".
//
// Nunca há PII no payload: só status, números, UUIDs e rótulos fixos.
const { getIdentityStore } = require('../auth/identityStore');

const TIPOS = ['criado', 'status', 'reagendado', 'duracao'];
const metricasEventos = { gravados: 0, falhas: 0 };

function atorDe(auth) {
  const tipo = (auth && auth.principal_type) || 'desconhecido';
  if (tipo === 'user') return { actor_id: auth.actor_id || null, actor_type: 'user' };
  if (tipo === 'integration') return { actor_id: auth.integration_id || null, actor_type: 'integration' };
  return { actor_id: null, actor_type: tipo };
}

async function registrarEventoAgenda(repo, auth, { agendamentoId, tipo, de = null, para = null, origem = 'agenda', extra = {} }) {
  try {
    if (!agendamentoId || !TIPOS.includes(tipo)) throw new Error(`evento inválido: ${tipo}`);
    const payload = { de, para, ...atorDe(auth), origem, ...extra };
    const ev = await repo.registrarEventoAgenda({ agendamentoId, tipo, payload });
    metricasEventos.gravados += 1;
    return ev;
  } catch (err) {
    metricasEventos.falhas += 1;
    console.error(`[agenda-eventos] falha ao gravar evento ${tipo} do agendamento ${agendamentoId}:`, (err && err.message) || err);
    return null;
  }
}

// Nome exibível do ator: só usuários com vínculo NA empresa do req.auth, e só
// o campo nome (nunca e-mail; nome com "@" é tratado como e-mail e omitido).
async function resolverNomes(empresaId, actorIds) {
  const nomes = new Map();
  if (!actorIds.length) return nomes;
  try {
    const store = getIdentityStore();
    const membros = new Set((await store.listMembershipsByEmpresa(empresaId)).map(m => m.user_id));
    await Promise.all(actorIds.filter(id => membros.has(id)).map(async id => {
      const u = await store.getAppUser(id);
      const nome = u && typeof u.nome === 'string' ? u.nome.trim() : '';
      if (nome && !nome.includes('@')) nomes.set(id, nome);
    }));
  } catch (err) {
    console.error('[agenda-eventos] falha ao resolver nomes do histórico:', (err && err.message) || err);
  }
  return nomes;
}

async function montarHistorico(repo, agendamentoId) {
  const eventos = await repo.listEventosAgenda(agendamentoId);
  const userIds = [...new Set(eventos
    .filter(e => e.payload && e.payload.actor_type === 'user' && e.payload.actor_id)
    .map(e => e.payload.actor_id))];
  const nomes = await resolverNomes(repo.empresaId, userIds);
  return eventos.map(e => {
    const p = e.payload || {};
    const item = {
      id: e.id,
      tipo: e.tipo,
      quando: e.created_at || null,
      de: p.de ?? null,
      para: p.para ?? null,
      origem: p.origem || null,
      ator: { tipo: p.actor_type || null, nome: p.actor_type === 'user' ? (nomes.get(p.actor_id) || null) : null }
    };
    if (p.reagendado_para) item.reagendadoPara = p.reagendado_para;
    if (p.reagendado_de) item.reagendadoDe = p.reagendado_de;
    return item;
  });
}

module.exports = { registrarEventoAgenda, montarHistorico, metricasEventos, TIPOS_EVENTO_AGENDA: TIPOS };

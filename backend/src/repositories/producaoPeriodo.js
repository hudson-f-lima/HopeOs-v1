// O fechamento pode ocorrer em outro dia. Busca só as identidades relacionadas
// e os campos necessários para o motor, inclusive em relatórios retrospectivos.
const { comandoIdDoAgendamento } = require('../services/CheckoutReplay');
const { addDays, daysBetween } = require('../engines/insights/retention');
const { idAgendaDoRecibo, CAMPOS_AGENDA_PRODUCAO, CAMPOS_COMANDA_PRODUCAO } = require('../engines/insights/eventosProducao');

async function porLotes(repo, tabela, campos, opcao, valores, extra = {}) {
  const linhas = [];
  // Os IDs vão na URL. O vínculo inclui a PK e o caminho do snapshot por agenda.
  for (let i = 0; i < valores.length; i += 40) {
    linhas.push(...await repo.list(tabela, { empresa_id: repo.empresaId }, {
      campos, [opcao]: valores.slice(i, i + 40), ordem: 'id', ...extra
    }));
  }
  return linhas;
}

async function agendamentosLongosAnteriores(repo, vespera, bufferMin = 0) {
  // A duração dos encaixes antigos não tem teto na coluna da agenda.
  const anteriores = await repo.list('agendamentos', { empresa_id: repo.empresaId }, {
    campos: CAMPOS_AGENDA_PRODUCAO, fim: addDays(vespera, -1), duracaoMaiorQue: 1440 - bufferMin, ordem: 'id'
  });
  return anteriores.filter(a => {
    const [h, m] = String(a.horario || '').split(':').map(Number);
    return h * 60 + m + Number(a.duracao_min) + bufferMin > (daysBetween(a.data, vespera) + 1) * 1440;
  });
}

async function recibosForaDoPeriodo(repo, vinculos, foraPeriodo) {
  // Em períodos com muitas etapas, primeiro verificar se existe um arquivo
  // externo à janela. Uma loja nova costuma caber inteira na leitura original.
  if (vinculos.length > 40) {
    const limite = 50;
    const amostra = await repo.list('comandos', { empresa_id: repo.empresaId }, {
      campos: CAMPOS_COMANDA_PRODUCAO, foraPeriodo, limite, ordem: 'id'
    });
    if (amostra.length < limite) {
      const agendas = new Set(vinculos.map(v => v.agendaId));
      const comandas = new Set(vinculos.map(v => v.comandaId));
      return amostra.filter(c => agendas.has(idAgendaDoRecibo(c)) || comandas.has(c.id));
    }
  }
  return porLotes(repo, 'comandos', CAMPOS_COMANDA_PRODUCAO, 'vinculosAgenda', vinculos, { foraPeriodo });
}

async function carregarVinculosDeProducao(repo, agendamentos, comandos, inicio, fim, periodoCarregado = { inicio, fim }, bufferMin = 0) {
  // 'inicio' é a véspera do primeiro dia exibido.
  const longos = await agendamentosLongosAnteriores(repo, inicio, bufferMin);
  const idsLongos = new Set(longos.map(a => a.id));
  const porId = new Map(agendamentos.concat(longos).map(a => [a.id, a]));
  const naJanela = r => r.data >= inicio && r.data <= fim;
  const agendasDosRecibos = new Set(comandos.filter(naJanela).map(idAgendaDoRecibo).filter(Boolean));
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  const faltantes = [...agendasDosRecibos].filter(id => uuid.test(id) && !porId.has(id));
  for (const a of await porLotes(repo, 'agendamentos', CAMPOS_AGENDA_PRODUCAO, 'ids', faltantes)) porId.set(a.id, a);

  const relevantes = [...porId.values()].filter(a =>
    (a.status === 'concluido' || a.status === 'fechado') && (naJanela(a) || idsLongos.has(a.id) || agendasDosRecibos.has(a.id)));
  const vinculos = relevantes.map(a => ({ agendaId: a.id, comandaId: comandoIdDoAgendamento(repo.empresaId, a.id) }));
  const porComanda = new Map(comandos.map(c => [c.id, c]));
  for (const c of await recibosForaDoPeriodo(repo, vinculos, periodoCarregado)) {
    if (!porComanda.has(c.id)) porComanda.set(c.id, c);
  }
  return { agendamentos: [...porId.values()], comandos: [...porComanda.values()] };
}

module.exports = { carregarVinculosDeProducao, agendamentosLongosAnteriores };

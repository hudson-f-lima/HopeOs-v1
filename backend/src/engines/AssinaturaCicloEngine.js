// Ciclos e situação de pagamento da assinatura (Onda A, fase 2; D-043). Puro: sem banco, sem relógio.
//
// O ciclo nasce do início da assinatura e da periodicidade do plano (mensal = 1 mês, trimestral = 3,
// semestral = 6, anual = 12). Dia 31 em mês curto vira o último dia do mês, sempre contado a partir
// do início (31/01 → 28/02 → 31/03), para não "andar" o dia.
//
// Só as cobranças pagas ou dispensadas (pausa) viram linha no banco. As devidas são calculadas aqui:
// todo ciclo já começado, sem linha, é uma cobrança em aberto. Assim nenhuma leitura grava nada e não
// há cobrança velha para corrigir.
//
// Situação (o que a agenda e a comanda consultam):
//   cancelada  → status cancelado e a data de fim já passou; não usa.
//   pausada    → não usa; os ciclos da pausa são dispensados ao retomar.
//   em_dia     → nenhum ciclo vencido em aberto; usa.
//   atrasada   → ciclo vencido em aberto há até `tolerancia_dias`; usa, com aviso.
//   suspensa   → passou da tolerância; não usa até pagar.
// "Cancelamento agendado" (cancelar no fim do ciclo) continua em dia até a data de fim.

const MESES = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
const DIA_MS = 86400000;

const parse = s => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return { a, m, d }; };
const fmt = (a, m, d) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const ultimoDia = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate();
const diasEntre = (de, ate) => Math.round((Date.parse(`${String(ate).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(de).slice(0, 10)}T00:00:00Z`)) / DIA_MS);
const br = d => String(d).slice(0, 10).split('-').reverse().join('/');
const somarDias = (data, n) => new Date(Date.parse(`${String(data).slice(0, 10)}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);

// Início do ciclo n (0 = o primeiro) a partir do início da assinatura.
function inicioDoCiclo(inicio, periodicidade, n) {
  const passo = MESES[periodicidade] || 1;
  const { a, m, d } = parse(inicio);
  const total = (m - 1) + passo * n;
  const ano = a + Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return fmt(ano, mes, Math.min(d, ultimoDia(ano, mes)));
}

// Ciclo que contém `data`: { n, inicio, fim } (fim = véspera do próximo). Antes do início: null.
function cicloDe(inicio, periodicidade, data) {
  if (String(data).slice(0, 10) < String(inicio).slice(0, 10)) return null;
  let n = Math.max(0, Math.floor(diasEntre(inicio, data) / (31 * (MESES[periodicidade] || 1))) - 1);
  while (inicioDoCiclo(inicio, periodicidade, n + 1) <= String(data).slice(0, 10)) n += 1;
  return { n, inicio: inicioDoCiclo(inicio, periodicidade, n), fim: somarDias(inicioDoCiclo(inicio, periodicidade, n + 1), -1) };
}

// Vencimento da cobrança do ciclo: na data do ciclo (base na contratação) ou num dia fixo do mês
// (o primeiro dia fixo a partir do início do ciclo).
function vencimentoDoCiclo(plano, cicloInicio) {
  if (plano.tipo_vencimento !== 'data_fixa' || !plano.dia_vencimento) return cicloInicio;
  const { a, m, d } = parse(cicloInicio);
  const dia = Number(plano.dia_vencimento);
  if (dia >= d) return fmt(a, m, Math.min(dia, ultimoDia(a, m)));
  const mes = m === 12 ? 1 : m + 1; const ano = m === 12 ? a + 1 : a;
  return fmt(ano, mes, Math.min(dia, ultimoDia(ano, mes)));
}

// Ciclos já começados até `hoje` (no máximo `limite`, do mais recente para trás).
function ciclosAte({ assinatura, plano, hoje, limite = 120 }) {
  const atual = cicloDe(assinatura.inicio, plano.periodicidade, hoje);
  if (!atual) return [];
  const lista = [];
  for (let n = atual.n; n >= 0 && lista.length < limite; n--) {
    lista.push({ n, inicio: inicioDoCiclo(assinatura.inicio, plano.periodicidade, n), fim: somarDias(inicioDoCiclo(assinatura.inicio, plano.periodicidade, n + 1), -1) });
  }
  return lista.reverse();
}

// Cada ciclo começado com a sua cobrança: paga, dispensada ou em aberto (com vencimento e atraso).
function cobrancasDosCiclos({ assinatura, plano, cobrancas = [], hoje }) {
  const porCiclo = new Map(cobrancas.map(c => [String(c.ciclo_inicio).slice(0, 10), c]));
  const fimEfetivo = assinatura.status === 'cancelada' && assinatura.cancelada_em ? String(assinatura.cancelada_em).slice(0, 10) : null;
  const pausaDesde = assinatura.status === 'pausada' && assinatura.pausada_em ? String(assinatura.pausada_em).slice(0, 10) : null;
  return ciclosAte({ assinatura, plano, hoje }).map(c => {
    const linha = porCiclo.get(c.inicio);
    const vencimento = linha ? String(linha.vencimento).slice(0, 10) : vencimentoDoCiclo(plano, c.inicio);
    if (linha && linha.estado === 'paga') return { ...c, estado: 'paga', vencimento, valorCentavos: linha.valor_centavos, pagoEm: String(linha.pago_em).slice(0, 10), id: linha.id };
    if (linha && linha.estado === 'cancelada') return { ...c, estado: 'dispensada', vencimento, valorCentavos: linha.valor_centavos, id: linha.id };
    // Ciclo que começa depois do fim (cancelada) ou durante a pausa não é devido.
    if ((fimEfetivo && (assinatura.cancelar_no_fim_do_ciclo ? c.inicio > fimEfetivo : c.inicio >= fimEfetivo)) || (pausaDesde && c.inicio >= pausaDesde)) return { ...c, estado: 'nao_devida', vencimento };
    const atraso = Math.max(0, diasEntre(vencimento, hoje));
    return { ...c, estado: 'em_aberto', vencimento, valorCentavos: plano.preco_centavos, diasAtraso: atraso, vencida: hoje > vencimento };
  });
}

function situacao({ assinatura, plano, cobrancas = [], hoje }) {
  const ciclos = cobrancasDosCiclos({ assinatura, plano, cobrancas, hoje });
  const cicloAtual = cicloDe(assinatura.inicio, plano.periodicidade, hoje);
  const emAberto = ciclos.filter(c => c.estado === 'em_aberto');
  const vencidas = emAberto.filter(c => c.vencida);
  const maiorAtraso = vencidas.reduce((m, c) => Math.max(m, c.diasAtraso), 0);
  const tolerancia = Number.isFinite(Number(plano.tolerancia_dias)) ? Number(plano.tolerancia_dias) : 7;
  const base = { cicloAtual, emAberto: emAberto.length, valorEmAbertoCentavos: emAberto.reduce((s, c) => s + (c.valorCentavos || 0), 0), maiorAtrasoDias: maiorAtraso, ciclos };
  if (!cicloAtual) return { ...base, estado: 'futura', podeUsar: false, texto: 'A assinatura começa em ' + br(assinatura.inicio) + '.' };
  if (assinatura.status === 'cancelada') {
    // cancelada_em = data de fim. "No fim do ciclo": vale até ela, inclusive. "Agora": já não vale nela.
    const fim = String(assinatura.cancelada_em).slice(0, 10);
    const vigente = assinatura.cancelar_no_fim_do_ciclo ? hoje <= fim : hoje < fim;
    if (!vigente) return { ...base, estado: 'cancelada', podeUsar: false, texto: 'Assinatura cancelada.' };
    if (!vencidas.length || maiorAtraso <= tolerancia) return { ...base, estado: vencidas.length ? 'atrasada' : 'em_dia', podeUsar: true, cancelamentoEm: fim, texto: 'Cancelamento agendado: vale até ' + br(fim) + '.' };
  }
  if (assinatura.status === 'pausada') return { ...base, estado: 'pausada', podeUsar: false, texto: 'Assinatura pausada.' };
  if (!vencidas.length) return { ...base, estado: 'em_dia', podeUsar: true, texto: 'Em dia.' };
  if (maiorAtraso <= tolerancia) return { ...base, estado: 'atrasada', podeUsar: true, texto: 'Pagamento atrasado há ' + maiorAtraso + ' dia(s); suspende depois de ' + tolerancia + '.' };
  return { ...base, estado: 'suspensa', podeUsar: false, texto: 'Suspensa: pagamento atrasado há ' + maiorAtraso + ' dia(s).' };
}

// Usos do ciclo a partir das linhas de assinatura_usos (descontando os estornados).
function historicoDoCiclo({ usos = [], estornados = new Set(), cicloInicio, servicoId }) {
  const vivos = usos.filter(u => !estornados.has(u.id) && String(u.ciclo_inicio).slice(0, 10) === cicloInicio);
  const doServico = vivos.filter(u => u.servico_id === servicoId);
  const ultimo = usos.filter(u => !estornados.has(u.id) && u.servico_id === servicoId).map(u => String(u.data).slice(0, 10)).sort().pop() || null;
  return {
    usosNoCiclo: doServico.filter(u => u.consome_uso).length,
    foraDaRegraNoCiclo: vivos.filter(u => u.tipo === 'fora_da_regra').length,
    ultimoUsoData: ultimo
  };
}

module.exports = { MESES, inicioDoCiclo, cicloDe, vencimentoDoCiclo, ciclosAte, cobrancasDosCiclos, situacao, historicoDoCiclo, diasEntre, somarDias };

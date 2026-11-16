// Comissão dos atendimentos de assinatura e margem por plano (Onda A, fase 3; D-044). Puro, sem
// gravar: calculado do que já está no banco (cobranças pagas e usos da 022), como os ganhos.
//
// Por plano e por mês (mês da cobrança paga = pago_em; mês do uso = data da comanda):
//   rateio        pool = % do plano × cobranças pagas no mês; dividido entre os profissionais pela
//                 quantidade de atendimentos cobertos do plano no mês (decisão do dono, D-042).
//                 Sem atendimento no mês, o pool não é distribuído (fica com o salão) e aparece no relatório.
//   tabela        por atendimento coberto: % de comissão do serviço (gravada no item) × valor de tabela.
//   fixo_por_uso  por atendimento coberto: o valor fixo do plano.
// Só entram usos do tipo "coberto" e não estornados. O uso fora da regra já pagou comissão normal
// sobre o valor cobrado na própria comanda (decisão do dono) e não entra no rateio.
// A regra vigente do plano vale para o cálculo (mudar a regra muda o mês em aberto).
const { allocateProportional } = require('./allocation');

const n = v => Number(v || 0);
const mesDe = d => String(d || '').slice(0, 7);

function comissoesDeAssinatura({ planos = [], assinaturas = [], cobrancas = [], usos = [], usosEstornos = [], comandoItens = [], mes = '' }) {
  const planoDaAss = new Map(assinaturas.map(a => [a.id, a.plano_id]));
  const estornados = new Set(usosEstornos.map(e => e.uso_id));
  const itemPorId = new Map(comandoItens.map(i => [i.id, i]));
  const grupos = new Map(); // planoId|mes → { receita, usos[] }
  const grupo = (planoId, m) => {
    const k = planoId + '|' + m;
    if (!grupos.has(k)) grupos.set(k, { planoId, mes: m, receitaCentavos: 0, cobrancasPagas: 0, usos: [] });
    return grupos.get(k);
  };
  for (const c of cobrancas) {
    if (c.estado !== 'paga' || !c.pago_em || !mesDe(c.pago_em).startsWith(mes)) continue;
    const planoId = planoDaAss.get(c.assinatura_id);
    if (!planoId) continue;
    const g = grupo(planoId, mesDe(c.pago_em));
    g.receitaCentavos += n(c.valor_centavos); g.cobrancasPagas += 1;
  }
  for (const u of usos) {
    if (u.tipo !== 'coberto' || estornados.has(u.id) || !mesDe(u.data).startsWith(mes)) continue;
    const planoId = planoDaAss.get(u.assinatura_id);
    if (planoId) grupo(planoId, mesDe(u.data)).usos.push(u);
  }

  const porProfissional = new Map();
  const somar = (prof, v) => porProfissional.set(prof, (porProfissional.get(prof) || 0) + v);
  const porPlano = [];
  for (const g of [...grupos.values()].sort((a, b) => a.mes.localeCompare(b.mes))) {
    const plano = planos.find(p => p.id === g.planoId) || {};
    const regra = plano.comissao_regra || 'rateio';
    const contagem = new Map();
    for (const u of g.usos) contagem.set(u.profissional_id, (contagem.get(u.profissional_id) || 0) + 1);
    const profs = [...contagem.keys()].sort();
    const distribuicao = new Map();
    let pool = null; let naoDistribuido = 0;
    if (regra === 'rateio') {
      pool = Math.round(g.receitaCentavos * n(plano.comissao_percentual) / 100);
      if (profs.length) {
        const partes = allocateProportional(pool, profs, p => contagem.get(p));
        profs.forEach((p, i) => distribuicao.set(p, partes[i]));
      } else naoDistribuido = pool;
    } else {
      for (const u of g.usos) {
        const v = regra === 'fixo_por_uso'
          ? n(plano.comissao_fixa_centavos)
          : Math.round(n(u.valor_tabela_centavos) * n((itemPorId.get(u.comando_item_id) || {}).comissao_pct) / 100);
        distribuicao.set(u.profissional_id, (distribuicao.get(u.profissional_id) || 0) + v);
      }
    }
    for (const [p, v] of distribuicao) somar(p, v);
    const comissao = [...distribuicao.values()].reduce((s, v) => s + v, 0);
    porPlano.push({
      planoId: g.planoId, planoNome: plano.nome || null, mes: g.mes, regra, percentual: regra === 'rateio' ? n(plano.comissao_percentual) : null,
      receitaCentavos: g.receitaCentavos, cobrancasPagas: g.cobrancasPagas, atendimentos: g.usos.length,
      valorTabelaConsumidoCentavos: g.usos.reduce((s, u) => s + n(u.valor_tabela_centavos), 0),
      poolCentavos: pool, naoDistribuidoCentavos: naoDistribuido, comissaoCentavos: comissao, margemCentavos: g.receitaCentavos - comissao,
      profissionais: profs.map(p => ({ profissionalId: p, atendimentos: contagem.get(p), comissaoCentavos: distribuicao.get(p) || 0 }))
    });
  }
  return { porProfissional, porPlano };
}

// Assinantes que usaram mais (em valor de tabela) do que pagam no mês: sinal para rever o plano,
// nunca ação automática (desenho, §5).
function acimaDoPreco({ planos = [], assinaturas = [], usos = [], usosEstornos = [], mes }) {
  const estornados = new Set(usosEstornos.map(e => e.uso_id));
  const consumo = new Map();
  for (const u of usos) {
    if (estornados.has(u.id) || mesDe(u.data) !== mes) continue;
    consumo.set(u.assinatura_id, (consumo.get(u.assinatura_id) || 0) + n(u.valor_tabela_centavos));
  }
  return assinaturas.map(a => {
    const plano = planos.find(p => p.id === a.plano_id) || {};
    const mensal = n(plano.preco_centavos) / ({ mensal: 1, trimestral: 3, semestral: 6, anual: 12 }[plano.periodicidade] || 1);
    return { assinaturaId: a.id, clienteId: a.cliente_id, planoId: a.plano_id, consumoCentavos: consumo.get(a.id) || 0, mensalidadeCentavos: Math.round(mensal) };
  }).filter(x => x.consumoCentavos > x.mensalidadeCentavos);
}

module.exports = { comissoesDeAssinatura, acimaDoPreco };

// Estorno de comanda (D-013, migration 009) — funções puras.
// 1. calcularEstorno: espelho da RPC comanda_estornar (usado pelo backend em memória
//    dos gates offline). A regra de verdade vive no banco; mudar aqui sem mudar a 009
//    (ou o contrário) faz o estorno-gate divergir do gate_009.sql.
// 2. Helpers de leitura: transformam os estornos em linhas negativas para os
//    relatórios descontarem no dia/mês DO ESTORNO (o relatório fechado não muda).
const { createAppError } = require('../errors');

const PRAZO_DIAS = 30;
const soma = (rows, f) => (rows || []).reduce((s, r) => s + (Number(f(r)) || 0), 0);
const diasEntre = (de, ate) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 864e5);
const erro = (code, status, message, details) => createAppError(code, message, status, details || null);

// Saldo estornável de uma comanda: por item (quantidade e valores) e por forma de pagamento.
function saldoDaComanda({ itens = [], pagamentos = [], estornos = [], estornoItens = [], estornoPagamentos = [] }) {
  const porItem = itens.map(item => {
    const prev = estornoItens.filter(e => e.comando_item_id === item.id);
    return {
      item,
      qPrev: soma(prev, e => e.quantidade),
      vPrev: soma(prev, e => e.valor_liquido_centavos),
      cPrev: soma(prev, e => e.comissao_centavos),
      kPrev: soma(prev, e => e.custo_centavos),
      restante: Number(item.quantidade || 0) - soma(prev, e => e.quantidade)
    };
  });
  const formas = new Map();
  for (const p of pagamentos) formas.set(p.forma_code, (formas.get(p.forma_code) || 0) + Number(p.valor_centavos || 0));
  for (const r of estornoPagamentos) formas.set(r.forma_code, (formas.get(r.forma_code) || 0) - Number(r.valor_centavos || 0));
  const total = estornos.some(e => e.tipo === 'total');
  return {
    porItem,
    porForma: [...formas.entries()].map(([formaCode, disponivelCentavos]) => ({ formaCode, disponivelCentavos })).sort((a, b) => a.formaCode.localeCompare(b.formaCode)),
    status: total ? 'estornado' : (estornos.length ? 'estornado_parcial' : 'fechado')
  };
}

// Espelho da RPC: recebe o pedido normalizado (estorno.validator) e o ledger da comanda.
function calcularEstorno({ comanda, pedido, data, hojeUtc, itens, pagamentos, gorjetas, estornos, estornoItens, estornoPagamentos, produtos = [] }) {
  if (Math.abs(diasEntre(hojeUtc, data)) > 1) throw erro('ESTORNO_DATA_INVALIDA', 422, `data ${data} não é hoje`);
  if (data < comanda.data || diasEntre(comanda.data, data) > PRAZO_DIAS) {
    throw erro('ESTORNO_PRAZO_EXPIRADO', 422, `Comanda de ${comanda.data}: estorno só até ${PRAZO_DIAS} dias.`, { comandaData: comanda.data, prazoDias: PRAZO_DIAS });
  }
  const saldo = saldoDaComanda({ itens, pagamentos, estornos, estornoItens, estornoPagamentos });
  if (saldo.status === 'estornado') throw erro('ESTORNO_JA_TOTAL', 409, 'Comanda já estornada por completo.');

  if (pedido.tipo === 'parcial') {
    for (const it of pedido.itens) {
      if (!itens.some(i => i.id === it.comandoItemId)) throw erro('ESTORNO_ITEM_INVALIDO', 422, `Item não pertence à comanda: ${it.comandoItemId}`);
    }
  }

  const linhas = [];
  for (const s of [...saldo.porItem].sort((a, b) => String(a.item.id).localeCompare(String(b.item.id)))) {
    let q; let devolve;
    if (pedido.tipo === 'total') { q = s.restante; devolve = pedido.devolverEstoque !== false; }
    else {
      const req = pedido.itens.find(i => i.comandoItemId === s.item.id);
      if (!req) continue;
      q = req.quantidade; devolve = req.devolveEstoque !== false;
      if (q > s.restante) throw erro('ESTORNO_EXCEDE', 409, `Item ${s.item.descricao || s.item.id}: pedido ${q}, saldo ${s.restante}.`, { comandoItemId: s.item.id, pedido: q, saldo: s.restante });
    }
    if (q <= 0) continue;
    const Q = Number(s.item.quantidade);
    const ultimo = s.qPrev + q >= Q;
    const prop = (orig, prev) => ultimo ? Math.max(Number(orig || 0) - prev, 0) : Math.max(Math.trunc(Number(orig || 0) * q / Q), 0);
    const valor = prop(s.item.valor_liquido_centavos, s.vPrev);
    const comissao = prop(s.item.comissao_centavos, s.cPrev);
    const custo = prop(s.item.total_custo_centavos, s.kPrev);
    const produto = s.item.tipo === 'produto' ? produtos.find(p => p.id === s.item.produto_id) : null;
    const devolveEstoque = Boolean(devolve && produto && produto.controla_estoque !== false);
    linhas.push({ item: s.item, quantidade: q, valor, comissao, custo, receita: valor - comissao, devolveEstoque });
  }
  if (pedido.tipo === 'parcial' && !linhas.length) throw erro('ESTORNO_ITENS_OBRIGATORIOS', 422, 'Nenhum item a estornar.');
  const itensCentavos = soma(linhas, l => l.valor);

  const gorjetasRevertidas = pedido.tipo === 'total'
    ? gorjetas.map(g => ({ gorjeta: g, bruto: Math.max(Number(g.valor_bruto_centavos || 0), 0), liquido: Math.max(Number(g.valor_liquido_centavos || 0), 0) }))
    : [];

  let reembolsos = [];
  const disponiveis = saldo.porForma.filter(f => f.disponivelCentavos > 0);
  if (pedido.tipo === 'total') reembolsos = disponiveis.map(f => ({ formaCode: f.formaCode, valorCentavos: f.disponivelCentavos }));
  else if (itensCentavos > 0) {
    if (pedido.reembolsos && pedido.reembolsos.length) reembolsos = pedido.reembolsos;
    else if (pedido.reembolsoForma) reembolsos = [{ formaCode: pedido.reembolsoForma, valorCentavos: itensCentavos }];
    else if (disponiveis.length === 1) reembolsos = [{ formaCode: disponiveis[0].formaCode, valorCentavos: itensCentavos }];
    else throw erro('ESTORNO_FORMA_OBRIGATORIA', 422, 'Informe a forma de pagamento do reembolso.', { formas: disponiveis });
  }
  for (const r of reembolsos) {
    const disp = (saldo.porForma.find(f => f.formaCode === r.formaCode) || { disponivelCentavos: 0 }).disponivelCentavos;
    if (r.valorCentavos > disp) throw erro('ESTORNO_EXCEDE', 409, `Reembolso em ${r.formaCode} acima do pago (saldo ${disp}).`, { formaCode: r.formaCode, saldo: disp });
  }
  const reembolsoCentavos = soma(reembolsos, r => r.valorCentavos);
  if (pedido.tipo === 'parcial' && reembolsoCentavos !== itensCentavos) {
    throw erro('ESTORNO_REEMBOLSO_DIVERGENTE', 422, `Reembolso ${reembolsoCentavos} diferente do valor dos itens ${itensCentavos}.`, { reembolsoCentavos, itensCentavos });
  }
  const gorjetaBruta = soma(gorjetasRevertidas, g => g.bruto);
  const gorjetaLiquida = soma(gorjetasRevertidas, g => g.liquido);
  return {
    linhas,
    gorjetas: gorjetasRevertidas,
    reembolsos,
    totais: {
      itens_centavos: itensCentavos,
      custo_centavos: soma(linhas, l => l.custo),
      comissao_centavos: soma(linhas, l => l.comissao),
      receita_empresa_centavos: soma(linhas, l => l.receita) + (gorjetaBruta - gorjetaLiquida),
      gorjeta_bruta_centavos: gorjetaBruta,
      gorjeta_liquida_centavos: gorjetaLiquida,
      reembolso_centavos: reembolsoCentavos
    }
  };
}

// ---------- leitura (relatórios) ----------
// Linhas negativas no formato de comando_itens, com a data DO ESTORNO.
function itensNegativos({ estornos = [], estornoItens = [], comandoItens = [], filtro = () => true }) {
  const eventos = new Map(estornos.filter(filtro).map(e => [e.id, e]));
  const originais = new Map(comandoItens.map(i => [i.id, i]));
  return estornoItens.filter(ei => eventos.has(ei.estorno_id) && originais.has(ei.comando_item_id)).map(ei => {
    const o = originais.get(ei.comando_item_id);
    const v = Number(ei.valor_liquido_centavos || 0); const k = Number(ei.custo_centavos || 0);
    return {
      ...o,
      _estorno: true,
      estorno_id: ei.estorno_id,
      data: eventos.get(ei.estorno_id).data,
      quantidade: -Number(ei.quantidade || 0),
      valor_liquido_centavos: -v,
      total_venda_centavos: -v,
      total_custo_centavos: -k,
      lucro_bruto_centavos: -(v - k),
      comissao_centavos: -Number(ei.comissao_centavos || 0),
      receita_empresa_centavos: -Number(ei.receita_empresa_centavos || 0)
    };
  });
}

function gorjetasNegativas({ estornos = [], estornoGorjetas = [], filtro = () => true }) {
  const ids = new Set(estornos.filter(filtro).map(e => e.id));
  return estornoGorjetas.filter(g => ids.has(g.estorno_id)).map(g => ({
    _estorno: true, comando_id: g.comando_id, profissional_id: g.profissional_id,
    valor_bruto_centavos: -Number(g.valor_bruto_centavos || 0), valor_liquido_centavos: -Number(g.valor_liquido_centavos || 0), taxa_centavos: 0
  }));
}

function pagamentosNegativos({ estornos = [], estornoPagamentos = [], filtro = () => true }) {
  const ids = new Set(estornos.filter(filtro).map(e => e.id));
  return estornoPagamentos.filter(p => ids.has(p.estorno_id)).map(p => ({
    _estorno: true, comando_id: p.comando_id, forma_code: p.forma_code,
    valor_centavos: -Number(p.valor_centavos || 0), taxa_total_centavos: 0, taxa_servico_centavos: 0, taxa_gorjeta_centavos: 0
  }));
}

const comandasEstornadasTotal = estornos => new Set((estornos || []).filter(e => e.tipo === 'total').map(e => e.comando_id));

module.exports = { PRAZO_DIAS, calcularEstorno, saldoDaComanda, itensNegativos, gorjetasNegativas, pagamentosNegativos, comandasEstornadasTotal, diasEntre };

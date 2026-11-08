// Fechamento/conferência de caixa do dia (somente leitura).
// Função pura: recebe as linhas já escopadas à empresa do req.auth e devolve os
// totais em centavos inteiros. Fonte: o que o RPC checkout_close gravou
// (migrations 002/003/007) — comandos, comando_pagamentos e caixa_movimentos.
// Nada é estimado: campo sem dado gravado é omitido.
const { roundCents, sumCents } = require('./money');

const FORMA_DINHEIRO = 'dinheiro';
const TIPO_ENTRADA = 'entrada_pagamento';

function addDiasCorridos(data, dias) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function buildFechamentoCaixa({ data, comandos = [], pagamentos = [], movimentos = [], formasPagamento = [], contadoDinheiroCentavos } = {}) {
  const doDia = comandos.filter(c => String(c.data) === data && c.status === 'fechado');
  const idsDoDia = new Set(doDia.map(c => c.id));
  const pagsDoDia = pagamentos.filter(p => idsDoDia.has(p.comando_id));
  const formas = new Map(formasPagamento.map(f => [f.code, f]));

  const grupos = new Map();
  for (const p of pagsDoDia) {
    const g = grupos.get(p.forma_code) || { formaCode: p.forma_code, quantidadePagamentos: 0, valorCentavos: 0, taxaCentavos: 0 };
    g.quantidadePagamentos += 1;
    g.valorCentavos += roundCents(p.valor_centavos);
    g.taxaCentavos += roundCents(p.taxa_total_centavos);
    grupos.set(p.forma_code, g);
  }
  const porForma = [...grupos.values()]
    .sort((a, b) => b.valorCentavos - a.valorCentavos || String(a.formaCode).localeCompare(String(b.formaCode)))
    .map(g => {
      const forma = formas.get(g.formaCode);
      const linha = { ...g, liquidoEsperadoCentavos: g.valorCentavos - g.taxaCentavos };
      if (forma) {
        linha.label = forma.label;
        // Prazo do cadastro ATUAL da forma (o checkout não guarda o prazo da venda).
        if (Number.isInteger(forma.dias_recebimento) && forma.dias_recebimento >= 0) {
          linha.diasRecebimento = forma.dias_recebimento;
          linha.dataRecebimentoPrevista = addDiasCorridos(data, forma.dias_recebimento);
        }
      }
      return linha;
    });

  // Ledger do caixa: entradas do dia gravadas na mesma transação do checkout.
  const entradas = movimentos.filter(m => String(m.data) === data && m.tipo === TIPO_ENTRADA);
  const ledgerPorForma = new Map();
  for (const m of entradas) ledgerPorForma.set(m.forma_code, (ledgerPorForma.get(m.forma_code) || 0) + roundCents(m.valor_centavos));
  const codigos = new Set([...grupos.keys(), ...ledgerPorForma.keys()]);
  const divergencias = [...codigos]
    .map(code => ({ formaCode: code, pagamentosCentavos: (grupos.get(code) || {}).valorCentavos || 0, caixaMovimentosCentavos: ledgerPorForma.get(code) || 0 }))
    .filter(d => d.pagamentosCentavos !== d.caixaMovimentosCentavos);

  const totalBrutoCentavos = sumCents(pagsDoDia, 'valor_centavos');
  const taxaTotalCentavos = sumCents(pagsDoDia, 'taxa_total_centavos');
  const esperadoDinheiro = ledgerPorForma.get(FORMA_DINHEIRO) || 0;
  const dinheiro = { formaCode: FORMA_DINHEIRO, esperadoCentavos: esperadoDinheiro };
  if (contadoDinheiroCentavos !== undefined && contadoDinheiroCentavos !== null) {
    dinheiro.contadoCentavos = contadoDinheiroCentavos;
    dinheiro.diferencaCentavos = contadoDinheiroCentavos - esperadoDinheiro;
  }

  return {
    data,
    quantidadeComandas: doDia.length,
    totalBrutoCentavos,
    taxaTotalCentavos,
    liquidoEsperadoCentavos: totalBrutoCentavos - taxaTotalCentavos,
    gorjetas: {
      brutaCentavos: sumCents(doDia, 'gorjeta_bruta_centavos'),
      liquidaCentavos: sumCents(doDia, 'total_gorjeta_liquida_centavos')
    },
    porForma,
    dinheiro,
    ledger: {
      caixaMovimentosCentavos: sumCents(entradas, 'valor_centavos'),
      consistente: divergencias.length === 0,
      divergencias
    },
    persistido: false
  };
}

module.exports = { buildFechamentoCaixa, FORMA_DINHEIRO };

// Assinatura Comissão Gate (Onda A, fase 3; D-044). Sem migration: tudo calculado dos usos e das
// cobranças pagas (022). Cobre o rateio (o exemplo lido no AppBarber: 3 e 19 atendimentos), o que
// fica de fora (estornado, fora da regra, outro mês, cobrança não paga), pool sem atendimento,
// regras "tabela" e "fixo por uso", "acima do preço", e a integração com os ganhos e o saldo a
// pagar do profissional, o relatório do plano e as permissões.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-comissao-ass-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const Module = require('module');
const { env } = require('../src/config/env');
const clock = require('../src/config/clock');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { createAppError } = require('../src/errors');
const { comissoesDeAssinatura, acimaDoPreco } = require('../src/engines/AssinaturaComissaoEngine');
const { app } = require('../src/app');

const A = env.DEFAULT_EMPRESA_ID;
const GUS = 'a0000000-0000-4000-8000-0000000000a1';
const JUN = 'a0000000-0000-4000-8000-0000000000a2';
const CLUB = 'f0000000-0000-4000-8000-0000000000a1';
const TAB = 'f0000000-0000-4000-8000-0000000000a2';
const FIXO = 'f0000000-0000-4000-8000-0000000000a3';
const ANUAL = 'f0000000-0000-4000-8000-0000000000a4';
const UNIT = 'f0000000-0000-4000-8000-0000000000c1';
const ADMIN = 'c0000000-0000-4000-8000-0000000000a1';
const RECEP = 'c0000000-0000-4000-8000-0000000000a2';
const PROF_USER = 'c0000000-0000-4000-8000-0000000000a3';

const planos = [
  { id: CLUB, empresa_id: A, nome: 'Club', preco_centavos: 9490, periodicidade: 'mensal', comissao_regra: 'rateio', comissao_percentual: '50.00' },
  { id: TAB, empresa_id: A, nome: 'Tabela', preco_centavos: 8000, periodicidade: 'mensal', comissao_regra: 'tabela', comissao_percentual: null },
  { id: FIXO, empresa_id: A, nome: 'Fixo', preco_centavos: 8000, periodicidade: 'mensal', comissao_regra: 'fixo_por_uso', comissao_fixa_centavos: 1500 },
  { id: ANUAL, empresa_id: A, nome: 'Anual', preco_centavos: 290000, periodicidade: 'anual', comissao_regra: 'rateio', comissao_percentual: 50 }
];
const assinaturas = [
  { id: 's1', empresa_id: A, plano_id: CLUB, cliente_id: 'c1' }, { id: 's2', empresa_id: A, plano_id: CLUB, cliente_id: 'c2' },
  { id: 's3', empresa_id: A, plano_id: TAB, cliente_id: 'c3' }, { id: 's4', empresa_id: A, plano_id: FIXO, cliente_id: 'c4' },
  { id: 's5', empresa_id: A, plano_id: ANUAL, cliente_id: 'c5' }
];
const cob = (id, ass, valor, pago, estado = 'paga') => ({ id, empresa_id: A, assinatura_id: ass, valor_centavos: valor, estado, pago_em: estado === 'paga' ? pago : null });
const cobrancas = [
  cob('k1', 's1', 9490, '2026-11-05'), cob('k2', 's2', 11500, '2026-11-20'),
  cob('k3', 's1', 9490, '2026-10-05'), // outro mês
  cob('k4', 's2', 11500, null, 'pendente'), // não paga
  cob('k5', 's3', 8000, '2026-11-02'), cob('k6', 's4', 8000, '2026-11-02')
];
let seq = 0;
const uso = (ass, prof, data, extra = {}) => ({ id: 'u' + (++seq), empresa_id: A, assinatura_id: ass, profissional_id: prof, data, tipo: 'coberto', valor_tabela_centavos: 6000, comando_item_id: 'it1', ...extra });
const usos = [
  ...Array.from({ length: 3 }, () => uso('s1', GUS, '2026-11-10')),
  ...Array.from({ length: 19 }, (_, i) => uso(i % 2 ? 's1' : 's2', JUN, '2026-11-12')),
  uso('s1', GUS, '2026-11-13', { id: 'estornado' }),
  uso('s1', GUS, '2026-11-14', { tipo: 'fora_da_regra' }),
  uso('s1', GUS, '2026-10-14'),
  uso('s3', GUS, '2026-11-15'), uso('s3', JUN, '2026-11-15'),
  uso('s4', JUN, '2026-11-16'), uso('s4', JUN, '2026-11-17')
];
const usosEstornos = [{ id: 'e1', empresa_id: A, uso_id: 'estornado' }];
const comandoItens = [{ id: 'it1', empresa_id: A, comissao_pct: 50 }];

const tests = [];
const test = (n, f) => tests.push({ n, f });
const calcular = (extra = {}) => comissoesDeAssinatura({ planos, assinaturas, cobrancas, usos, usosEstornos, comandoItens, mes: '2026-11', ...extra });

test('R01 rateio do Club em nov/26: 50% de (94,90 + 115,00) = 104,95 dividido por 3 e 19 atendimentos', () => {
  const club = calcular().porPlano.find(p => p.planoId === CLUB);
  assert.deepStrictEqual([club.receitaCentavos, club.cobrancasPagas, club.poolCentavos, club.atendimentos], [20990, 2, 10495, 22]);
  assert.deepStrictEqual(club.profissionais.map(p => [p.profissionalId, p.atendimentos, p.comissaoCentavos]), [[GUS, 3, 1431], [JUN, 19, 9064]]);
  assert.strictEqual(club.comissaoCentavos, 10495, 'o pool inteiro é distribuído, sem sobra de centavo');
  assert.strictEqual(club.margemCentavos, 10495);
  assert.strictEqual(club.valorTabelaConsumidoCentavos, 22 * 6000);
});

test('R02 fora da conta: uso estornado, uso fora da regra, uso e cobrança de outro mês, cobrança não paga', () => {
  const club = calcular().porPlano.find(p => p.planoId === CLUB);
  assert.strictEqual(club.profissionais.find(p => p.profissionalId === GUS).atendimentos, 3);
  const out = calcular({ mes: '2026-10' }).porPlano.find(p => p.planoId === CLUB);
  assert.deepStrictEqual([out.receitaCentavos, out.atendimentos, out.comissaoCentavos], [9490, 1, 4745]);
});

test('R03 mês sem atendimento: o pool não é distribuído (fica com o salão) e aparece no relatório', () => {
  const r = comissoesDeAssinatura({ planos, assinaturas, cobrancas, usos: [], usosEstornos: [], comandoItens, mes: '2026-11' });
  const club = r.porPlano.find(p => p.planoId === CLUB);
  assert.deepStrictEqual([club.poolCentavos, club.naoDistribuidoCentavos, club.comissaoCentavos, club.margemCentavos], [10495, 10495, 0, 20990]);
  assert.strictEqual(r.porProfissional.size, 0);
});

test('R04 regra "tabela" (50% de 60,00 por atendimento) e "fixo por uso" (15,00 por atendimento)', () => {
  const r = calcular();
  const tab = r.porPlano.find(p => p.planoId === TAB);
  assert.deepStrictEqual(tab.profissionais.map(p => [p.profissionalId, p.comissaoCentavos]), [[GUS, 3000], [JUN, 3000]]);
  assert.strictEqual(tab.margemCentavos, 8000 - 6000);
  const fixo = r.porPlano.find(p => p.planoId === FIXO);
  assert.deepStrictEqual([fixo.comissaoCentavos, fixo.margemCentavos], [3000, 5000]);
  assert.deepStrictEqual([r.porProfissional.get(GUS), r.porProfissional.get(JUN)], [1431 + 3000, 9064 + 3000 + 3000]);
});

test('R05 acima do preço: usou mais em valor de tabela do que paga no mês; o anual conta a mensalidade (2.900/12)', () => {
  const lista = acimaDoPreco({ planos, assinaturas, usos: [...usos, uso('s5', GUS, '2026-11-20', { valor_tabela_centavos: 30000 })], usosEstornos, mes: '2026-11' });
  const s5 = lista.find(x => x.assinaturaId === 's5');
  assert.deepStrictEqual([s5.consumoCentavos, s5.mensalidadeCentavos], [30000, 24167]);
  assert.ok(lista.some(x => x.assinaturaId === 's1'), 'Club com 12+ cortes de 60,00 passa dos 94,90');
});

// --- Integração: ganhos, saldo, relatório, permissões ---------------------------------------
setIdentityStore(createMemoryIdentityStore({
  app_users: [ADMIN, RECEP, PROF_USER].map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: A, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: A, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: A, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: A, user_id: PROF_USER, role: 'profissional', status: 'ativo', profissional_id: GUS }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: UNIT }, { membership_id: 'm3', unit_id: UNIT }]
}));
const tokens = { 'h.admin.c': ADMIN, 'h.recep.c': RECEP, 'h.prof.c': PROF_USER };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401); return { id: tokens[t] }; } });
installMemoryBackend({
  empresas: [{ id: A, nome: 'Salão Alfa' }],
  profissionais: [{ id: GUS, empresa_id: A, nome: 'Gustavo', ativo: true }, { id: JUN, empresa_id: A, nome: 'Júnior', ativo: true }],
  clientes: [], comandos: [], comando_itens: comandoItens, comando_gorjetas: [], comanda_estornos: [], comanda_estorno_itens: [], comanda_estorno_gorjetas: [], comissao_pagamentos: [],
  assinatura_planos: planos, assinaturas, assinatura_cobrancas: cobrancas, assinatura_usos: usos, assinatura_usos_estornos: usosEstornos
});
let base;
async function request(method, url, { token } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${base}${url}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} }, res => {
      let raw = ''; res.on('data', c => { raw += c; }); res.on('end', () => { let d = null; try { d = JSON.parse(raw); } catch (_) { /* vazio */ } resolve({ status: res.statusCode, data: d, raw }); });
    });
    req.on('error', reject); req.end();
  });
}

test('I01 "Meus ganhos" do Júnior em nov/26 inclui a comissão de assinatura; o profissional vê só a própria', async () => {
  const r = await request('GET', `/api/relatorios/meus-ganhos?mes=2026-11&profissionalId=${JUN}`, { token: 'h.admin.c' });
  assert.strictEqual(r.status, 200, r.raw);
  assert.deepStrictEqual([r.data.data.assinaturaCentavos, r.data.data.totalCentavos], [15064, 15064]);
  const proprio = await request('GET', '/api/relatorios/meus-ganhos?mes=2026-11', { token: 'h.prof.c' });
  assert.deepStrictEqual([proprio.status, proprio.data.data.profissionalId, proprio.data.data.assinaturaCentavos], [200, GUS, 4431]);
});

test('I02 saldo a pagar soma a comissão de assinatura de todos os meses (nov + out)', async () => {
  const r = await request('GET', `/api/comissoes/pagamentos?profissionalId=${GUS}`, { token: 'h.admin.c' });
  assert.strictEqual(r.status, 200, r.raw);
  assert.strictEqual(r.data.data.ganhoCentavos, 4431 + 4745, JSON.stringify(r.data.data));
  assert.strictEqual(r.data.data.saldoCentavos, 4431 + 4745);
});

test('I03 relatório do plano: totais, profissionais com nome e acima do preço; só a gestão vê', async () => {
  const r = await request('GET', '/api/assinaturas/relatorio?mes=2026-11', { token: 'h.admin.c' });
  assert.strictEqual(r.status, 200, r.raw);
  assert.deepStrictEqual([r.data.data.totais.receitaCentavos, r.data.data.totais.comissaoCentavos], [20990 + 8000 + 8000, 10495 + 6000 + 3000]);
  assert.ok(r.data.data.planos.find(p => p.planoId === CLUB).profissionais.some(p => p.nome === 'Júnior'));
  assert.ok(r.data.data.acimaDoPreco.length >= 1);
  assert.strictEqual((await request('GET', '/api/assinaturas/relatorio?mes=2026-11', { token: 'h.recep.c' })).status, 403);
  assert.strictEqual((await request('GET', '/api/assinaturas/relatorio?mes=2026-11', { token: 'h.prof.c' })).status, 403);
  assert.strictEqual((await request('GET', '/api/assinaturas/relatorio?mes=nov', { token: 'h.admin.c' })).status, 422);
});

test('NC1 controle negativo: contando o uso fora da regra no rateio, o Gustavo teria 4 atendimentos (R02 pegaria)', () => {
  const arquivo = path.join(__dirname, '../src/engines/AssinaturaComissaoEngine.js');
  const src = fs.readFileSync(arquivo, 'utf8');
  const trecho = "if (u.tipo !== 'coberto' || ";
  assert.ok(src.includes(trecho), 'trecho do mutante não encontrado');
  const m = new Module(arquivo, module);
  m.filename = arquivo; m.paths = Module._nodeModulePaths(path.dirname(arquivo));
  m._compile(src.replace(trecho, 'if ('), arquivo);
  const club = m.exports.comissoesDeAssinatura({ planos, assinaturas, cobrancas, usos, usosEstornos, comandoItens, mes: '2026-11' }).porPlano.find(p => p.planoId === CLUB);
  assert.strictEqual(club.profissionais.find(p => p.profissionalId === GUS).atendimentos, 4, 'o mutante conta o fora da regra');
});

(async () => {
  const origErr = console.error; console.error = () => {};
  clock.definirRelogio(() => new Date('2026-11-25T12:00:00Z'));
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); ok++; process.stdout.write(`✓ ${n}\n`); } catch (err) { process.stdout.write(`✗ ${n}\n   ${err.message}\n`); }
  }
  server.close(); console.error = origErr;
  console.log(`\nAssinatura Comissão Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();

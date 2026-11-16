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
const { unidadesDeComissao, comissaoDoProfissional, acimaDoPreco, taxaDaForma } = require('../src/engines/AssinaturaComissaoEngine');
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
const formasPagamento = [
  { empresa_id: A, code: 'pix', label: 'Pix', taxa_pct: 0, taxa_fixa_centavos: 0, dias_recebimento: 0, ativo: true },
  { empresa_id: A, code: 'credito', label: 'Crédito', taxa_pct: 3, taxa_fixa_centavos: 0, dias_recebimento: 30, ativo: true }
];
const assinaturas = [
  { id: 's1', empresa_id: A, plano_id: CLUB, cliente_id: 'c1', inicio: '2026-10-05' },
  { id: 's2', empresa_id: A, plano_id: CLUB, cliente_id: 'c2', inicio: '2026-11-01' },
  { id: 's3', empresa_id: A, plano_id: TAB, cliente_id: 'c3', inicio: '2026-10-01' },
  { id: 's4', empresa_id: A, plano_id: FIXO, cliente_id: 'c4', inicio: '2026-10-01' },
  { id: 's5', empresa_id: A, plano_id: CLUB, cliente_id: 'c5', inicio: '2026-10-10' },
  { id: 's6', empresa_id: A, plano_id: ANUAL, cliente_id: 'c6', inicio: '2026-01-01' }
];
const cob = (id, ass, ciclo, valor, pago, forma, estado = 'paga') => ({ id, empresa_id: A, assinatura_id: ass, ciclo_inicio: ciclo, valor_centavos: valor, estado, pago_em: estado === 'paga' ? pago : null, forma });
const cobrancas = [
  cob('k1', 's1', '2026-10-05', 9490, '2026-10-05', 'pix'),
  cob('k2', 's1', '2026-11-05', 9490, '2026-11-06', 'credito'),
  cob('k3', 's3', '2026-10-01', 8000, '2026-10-01', 'pix'),
  cob('k4', 's4', '2026-10-01', 8000, '2026-10-01', 'pix'),
  cob('k5', 's5', '2026-10-10', 9490, '2026-10-10', 'pix'),
  cob('k6', 's2', '2026-11-01', 9490, null, null, 'pendente')
];
let seq = 0;
const uso = (ass, ciclo, prof, data, extra = {}) => ({ id: 'u' + (++seq), empresa_id: A, assinatura_id: ass, ciclo_inicio: ciclo, profissional_id: prof, data, tipo: 'coberto', valor_tabela_centavos: 6000, comando_item_id: 'it1', ...extra });
const usos = [
  uso('s1', '2026-10-05', GUS, '2026-10-10'), uso('s1', '2026-10-05', GUS, '2026-10-20'), uso('s1', '2026-10-05', JUN, '2026-10-25'),
  uso('s1', '2026-11-05', JUN, '2026-11-10'), uso('s1', '2026-11-05', JUN, '2026-11-12'), uso('s1', '2026-11-05', JUN, '2026-11-14'),
  uso('s1', '2026-11-05', GUS, '2026-11-15', { id: 'estornado' }),
  uso('s1', '2026-11-05', GUS, '2026-11-15', { tipo: 'fora_da_regra' }),
  uso('s2', '2026-11-01', GUS, '2026-11-03'),
  uso('s3', '2026-10-01', GUS, '2026-10-15'),
  uso('s4', '2026-10-01', JUN, '2026-10-16'), uso('s4', '2026-10-01', JUN, '2026-10-17')
];
const usosEstornos = [{ id: 'e1', empresa_id: A, uso_id: 'estornado' }];
const comandoItens = [{ id: 'it1', empresa_id: A, comissao_pct: 50 }];
const dados = (hoje = '2026-11-16') => ({ planos, assinaturas, cobrancas, usos, usosEstornos, comandoItens, formasPagamento, hoje });
const un = (lista, ass, ciclo) => lista.find(u => u.assinaturaId === ass && u.cicloInicio === ciclo);

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('R01 ciclo pago no Pix: libera no dia seguinte ao fim do ciclo; 50% de 94,90 dividido entre quem atendeu ESTE assinante NESTE ciclo (2 e 1)', () => {
  const u = un(unidadesDeComissao(dados()), 's1', '2026-10-05');
  assert.deepStrictEqual([u.cicloFim, u.liberaEm, u.estado, u.liquidoCentavos, u.poolCentavos], ['2026-11-04', '2026-11-05', 'liberada', 9490, 4745]);
  assert.deepStrictEqual(u.profissionais.map(p => [p.profissionalId, p.atendimentos, p.comissaoCentavos]), [[GUS, 2, 3163], [JUN, 1, 1582]]);
  assert.strictEqual(u.comissaoCentavos, 4745, 'sem sobra de centavo');
});

test('R02 ciclo pago no crédito (3%, D+30): rateio sobre o líquido; prevista até 30 dias depois do pagamento (mais tarde que o fim do ciclo)', () => {
  const u = un(unidadesDeComissao(dados()), 's1', '2026-11-05');
  assert.deepStrictEqual([u.taxaCentavos, u.liquidoCentavos, u.poolCentavos, u.cicloFim, u.liberaEm, u.estado], [285, 9205, 4603, '2026-12-04', '2026-12-06', 'prevista']);
  assert.strictEqual(un(unidadesDeComissao(dados('2026-12-05')), 's1', '2026-11-05').estado, 'prevista', 'na véspera ainda não');
  assert.strictEqual(un(unidadesDeComissao(dados('2026-12-06')), 's1', '2026-11-05').estado, 'liberada');
  assert.deepStrictEqual(u.profissionais.map(p => [p.profissionalId, p.atendimentos]), [[JUN, 3]], 'estornado e fora da regra ficam de fora');
});

test('R03 ciclo ainda não pago: atendimentos "aguardando pagamento", sem valor de rateio', () => {
  const u = un(unidadesDeComissao(dados()), 's2', '2026-11-01');
  assert.deepStrictEqual([u.estado, u.poolCentavos, u.comissaoCentavos, u.atendimentos], ['aguardando_pagamento', null, 0, 1]);
});

test('R04 regras "tabela" (50% de 60,00) e "fixo por uso" (15,00) pelo ciclo; ciclo pago sem atendimento não distribui', () => {
  const l = unidadesDeComissao(dados());
  assert.deepStrictEqual([un(l, 's3', '2026-10-01').comissaoCentavos, un(l, 's3', '2026-10-01').liberaEm], [3000, '2026-11-01']);
  assert.deepStrictEqual([un(l, 's4', '2026-10-01').comissaoCentavos, un(l, 's4', '2026-10-01').margemCentavos], [3000, 5000]);
  const vazio = un(l, 's5', '2026-10-10');
  assert.deepStrictEqual([vazio.estado, vazio.poolCentavos, vazio.naoDistribuidoCentavos, vazio.comissaoCentavos, vazio.liberaEm], ['liberada', 4745, 4745, 0, '2026-11-10']);
});

test('R05 por profissional: só a liberada conta no mês; a prevista e o que aguarda pagamento vêm à parte', () => {
  assert.deepStrictEqual(comissaoDoProfissional({ ...dados(), profissionalId: GUS, mes: '2026-11' }), { liberadaCentavos: 3163 + 3000, previstaCentavos: 0, atendimentosAguardandoPagamento: 1 });
  assert.deepStrictEqual(comissaoDoProfissional({ ...dados(), profissionalId: JUN, mes: '2026-11' }), { liberadaCentavos: 1582 + 3000, previstaCentavos: 4603, atendimentosAguardandoPagamento: 0 });
  assert.strictEqual(comissaoDoProfissional({ ...dados('2026-12-10'), profissionalId: JUN, mes: '' }).liberadaCentavos, 1582 + 3000 + 4603, 'depois do prazo, tudo liberado');
});

test('R06 acima do preço: usou mais em valor de tabela do que paga no mês; o anual conta a mensalidade (2.900/12)', () => {
  const lista = acimaDoPreco({ planos, assinaturas, usos: [...usos, uso('s6', '2026-01-01', GUS, '2026-11-20', { valor_tabela_centavos: 30000 })], usosEstornos, mes: '2026-11' });
  const s6 = lista.find(x => x.assinaturaId === 's6');
  assert.deepStrictEqual([s6.consumoCentavos, s6.mensalidadeCentavos], [30000, 24167]);
  assert.strictEqual(taxaDaForma({ taxa_pct: 3, taxa_fixa_centavos: 10 }, 9490), 295);
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
  clientes: [], formas_pagamento: formasPagamento, comandos: [], comando_itens: comandoItens, comando_gorjetas: [], comanda_estornos: [], comanda_estorno_itens: [], comanda_estorno_gorjetas: [], comissao_pagamentos: [],
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

test('I01 "Meus ganhos" em nov/26: só a comissão liberada soma; a prevista vem à parte; o profissional vê só a própria', async () => {
  const r = await request('GET', `/api/relatorios/meus-ganhos?mes=2026-11&profissionalId=${JUN}`, { token: 'h.admin.c' });
  assert.strictEqual(r.status, 200, r.raw);
  assert.deepStrictEqual([r.data.data.assinaturaCentavos, r.data.data.assinaturaPrevistaCentavos, r.data.data.totalCentavos], [4582, 4603, 4582]);
  const proprio = await request('GET', '/api/relatorios/meus-ganhos?mes=2026-11', { token: 'h.prof.c' });
  assert.deepStrictEqual([proprio.status, proprio.data.data.profissionalId, proprio.data.data.assinaturaCentavos, proprio.data.data.assinaturaAtendimentosAguardandoPagamento], [200, GUS, 6163, 1]);
});

test('I02 saldo a pagar só com o liberado; depois do prazo do crédito, a parte prevista entra', async () => {
  const antes = await request('GET', `/api/comissoes/pagamentos?profissionalId=${JUN}`, { token: 'h.admin.c' });
  assert.strictEqual(antes.status, 200, antes.raw);
  assert.strictEqual(antes.data.data.saldoCentavos, 4582);
  clock.definirRelogio(() => new Date('2026-12-06T12:00:00Z'));
  try {
    const depois = await request('GET', `/api/comissoes/pagamentos?profissionalId=${JUN}`, { token: 'h.admin.c' });
    assert.strictEqual(depois.data.data.saldoCentavos, 4582 + 4603);
  } finally { clock.definirRelogio(() => new Date('2026-11-16T12:00:00Z')); }
});

test('I03 relatório do mês: ciclos liberados em nov (bruto, líquido, comissão, margem) e o que está em aberto; só a gestão vê', async () => {
  const r = await request('GET', '/api/assinaturas/relatorio?mes=2026-11', { token: 'h.admin.c' });
  assert.strictEqual(r.status, 200, r.raw);
  const t = r.data.data.totais;
  assert.deepStrictEqual([t.brutoCentavos, t.liquidoCentavos, t.comissaoCentavos, t.naoDistribuidoCentavos], [9490 + 8000 + 8000 + 9490, 9490 + 8000 + 8000 + 9490, 4745 + 3000 + 3000, 4745]);
  assert.deepStrictEqual(r.data.data.emAberto.map(x => [x.estado, x.cicloInicio]).sort(), [['aguardando_pagamento', '2026-11-01'], ['prevista', '2026-11-05']]);
  assert.ok(r.data.data.planos.find(p => p.planoId === CLUB).profissionais.some(p => p.nome === 'Júnior'));
  assert.strictEqual((await request('GET', '/api/assinaturas/relatorio?mes=2026-11', { token: 'h.recep.c' })).status, 403);
  assert.strictEqual((await request('GET', '/api/assinaturas/relatorio?mes=2026-11', { token: 'h.prof.c' })).status, 403);
  assert.strictEqual((await request('GET', '/api/assinaturas/relatorio?mes=nov', { token: 'h.admin.c' })).status, 422);
});

test('NC1 controle negativo: sem a regra de liberação, a comissão do ciclo no crédito entraria antes do prazo (R02 pegaria)', () => {
  const arquivo = path.join(__dirname, '../src/engines/AssinaturaComissaoEngine.js');
  const src = fs.readFileSync(arquivo, 'utf8');
  const trecho = "(hoje >= liberaEm ? 'liberada' : 'prevista')";
  assert.ok(src.includes(trecho), 'trecho do mutante não encontrado');
  const m = new Module(arquivo, module);
  m.filename = arquivo; m.paths = Module._nodeModulePaths(path.dirname(arquivo));
  m._compile(src.replace(trecho, "'liberada'"), arquivo);
  assert.strictEqual(m.exports.unidadesDeComissao(dados()).find(u => u.assinaturaId === 's1' && u.cicloInicio === '2026-11-05').estado, 'liberada', 'o mutante libera antes');
});

(async () => {
  const origErr = console.error; console.error = () => {};
  clock.definirRelogio(() => new Date('2026-11-16T12:00:00Z'));
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

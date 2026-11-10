// Gamificação Gate (D-019, migration 011): metas mensais e ranking. Função pura com
// números à mão + HTTP real (banco e identidade em memória). As regras que só o banco
// garante (uma meta por profissional/mês/tipo, tenant do profissional) estão em gate_011.sql.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-gami-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { env } = require('../src/config/env');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { computeDesempenho, computeMetas, computeRanking } = require('../src/engines/insights/gamificacao');
const { ACTIONS } = require('../src/auth/rbac');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

const tests = [];
const test = (n, f) => tests.push({ n, f });
const E = env.DEFAULT_EMPRESA_ID;
const EB = 'e0000000-0000-4000-8000-0000000000ee';
const P1 = 'a0000000-0000-4000-8000-0000000000e1';
const P2 = 'a0000000-0000-4000-8000-0000000000e2';
const P3 = 'a0000000-0000-4000-8000-0000000000e3';
const PX = 'a0000000-0000-4000-8000-0000000000e4';
const PB = 'a0000000-0000-4000-8000-0000000000e5';
const UNIT = 'f0000000-0000-4000-8000-0000000000e1';
const MES = '2026-06';

// Junho: Ana 2 serviços de 100,00 (um estornado em 25/06) + 1 produto (não conta);
// Bia 50,00 + 150,00; Caio nada; Xis está inativo (fora do ranking).
// Resultado: Bia 200,00 / 2 atend.; Ana 100,00 / 1 atend.; Caio 0.
const COMANDOS = [{ id: 'k1', empresa_id: E, data: '2026-06-05' }, { id: 'k2', empresa_id: E, data: '2026-06-20' }, { id: 'k3', empresa_id: E, data: '2026-06-22' }, { id: 'k4', empresa_id: E, data: '2026-07-01' }, { id: 'kb', empresa_id: EB, data: '2026-06-05' }];
const item = (id, comando_id, tipo, profissional_id, valor, empresa_id = E) => ({ id, empresa_id, comando_id, tipo, profissional_id, quantidade: 1, descricao: id, valor_liquido_centavos: valor, comissao_centavos: 0, receita_empresa_centavos: valor });
const ITENS = [
  item('i1', 'k1', 'servico', P1, 10000), item('i2', 'k1', 'servico', P2, 5000), item('i3', 'k1', 'produto', P1, 3000),
  item('i4', 'k2', 'servico', P1, 10000), item('i5', 'k3', 'servico', P2, 15000), item('i6', 'k4', 'servico', P1, 99900),
  item('i7', 'k1', 'servico', PX, 77700), item('ib', 'kb', 'servico', PB, 88800, EB)
];
const ESTORNOS = [{ id: 'e1', empresa_id: E, comando_id: 'k2', data: '2026-06-25' }];
const EST_ITENS = [{ id: 'x1', empresa_id: E, estorno_id: 'e1', comando_id: 'k2', comando_item_id: 'i4', quantidade: 1, valor_liquido_centavos: 10000, comissao_centavos: 0, receita_empresa_centavos: 10000 }];
const PROFS = [{ id: P1, empresa_id: E, nome: 'Ana', ativo: true }, { id: P2, empresa_id: E, nome: 'Bia', ativo: true }, { id: P3, empresa_id: E, nome: 'Caio', ativo: true }, { id: PX, empresa_id: E, nome: 'Xis', ativo: false }];
const desempenho = () => computeDesempenho({ comandos: COMANDOS.filter(c => c.empresa_id === E), comandoItens: ITENS.filter(i => i.empresa_id === E), estornos: ESTORNOS, estornoItens: EST_ITENS, profissionais: PROFS, mes: MES });

test('M01 desempenho: só serviço conta, estorno desconta no mês do estorno, inativo fica fora', () => {
  const d = Object.fromEntries(desempenho().map(x => [x.nome, [x.atendimentos, x.faturamentoCentavos]]));
  assert.deepStrictEqual(d, { Ana: [1, 10000], Bia: [2, 20000], Caio: [0, 0] });
});

test('M02 metas: 50%, 100% atingida e 99% (trunca, não arredonda para 100)', () => {
  const metas = [
    { id: 'm1', profissional_id: P1, mes: MES, tipo: 'faturamento', valor_alvo: 20000 },
    { id: 'm2', profissional_id: P1, mes: MES, tipo: 'atendimentos', valor_alvo: 1 },
    { id: 'm3', profissional_id: P2, mes: MES, tipo: 'faturamento', valor_alvo: 20001 },
    { id: 'm4', profissional_id: P2, mes: '2026-07', tipo: 'faturamento', valor_alvo: 1 },
    { id: 'm5', profissional_id: PX, mes: MES, tipo: 'faturamento', valor_alvo: 1 }
  ];
  const r = computeMetas({ metas, desempenho: desempenho(), mes: MES });
  assert.deepStrictEqual(r.map(m => [m.nome, m.tipo, m.realizado, m.percentual, m.atingida]), [['Ana', 'atendimentos', 1, 100, true], ['Ana', 'faturamento', 10000, 50, false], ['Bia', 'faturamento', 20000, 99, false]]);
});

test('M03 ranking da gestão: Bia 1º, Ana 2º, Caio 3º, com valores e proporção do líder', () => {
  const r = computeRanking({ desempenho: desempenho() });
  assert.deepStrictEqual(r.map(x => [x.posicao, x.nome, x.faturamentoCentavos, x.percentualDoLider]), [[1, 'Bia', 20000, 100], [2, 'Ana', 10000, 50], [3, 'Caio', 0, 0]]);
});

test('M04 ranking da equipe: sem o valor em reais dos colegas; empate divide a posição', () => {
  const r = computeRanking({ desempenho: desempenho(), comValores: false, destaqueId: P1 });
  assert.deepStrictEqual(r.map(x => [x.nome, 'faturamentoCentavos' in x, x.voce]), [['Bia', false, false], ['Ana', true, true], ['Caio', false, false]]);
  const empate = computeRanking({ desempenho: [{ profissionalId: 'a', nome: 'A', atendimentos: 2, faturamentoCentavos: 500 }, { profissionalId: 'b', nome: 'B', atendimentos: 2, faturamentoCentavos: 500 }, { profissionalId: 'c', nome: 'C', atendimentos: 1, faturamentoCentavos: 100 }] });
  assert.deepStrictEqual(empate.map(x => x.posicao), [1, 1, 3]);
  assert.deepStrictEqual(computeRanking({ desempenho: [] }), []);
});

// ---------- HTTP ----------
const U = { admin: 'c0000000-0000-4000-8000-0000000000f1', recep: 'c0000000-0000-4000-8000-0000000000f2', prof: 'c0000000-0000-4000-8000-0000000000f3', adminB: 'c0000000-0000-4000-8000-0000000000f5' };
setIdentityStore(createMemoryIdentityStore({
  app_users: Object.values(U).map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: E, user_id: U.admin, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: E, user_id: U.recep, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: E, user_id: U.prof, role: 'profissional', status: 'ativo', profissional_id: P1 },
    { id: 'm5', empresa_id: EB, user_id: U.adminB, role: 'admin', status: 'ativo' }
  ],
  membership_units: ['m2', 'm3'].map(membership_id => ({ membership_id, unit_id: UNIT }))
}));
const tokens = { 'h.admin.s': U.admin, 'h.recep.s': U.recep, 'h.prof.s': U.prof, 'h.adminb.s': U.adminB };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });
const banco = installMemoryBackend({
  empresas: [{ id: E, nome: 'A', ranking_visivel_equipe: false }, { id: EB, nome: 'B', ranking_visivel_equipe: false }],
  profissionais: [...PROFS, { id: PB, empresa_id: EB, nome: 'Zeca', ativo: true }],
  comandos: COMANDOS, comando_itens: ITENS, comanda_estornos: ESTORNOS, comanda_estorno_itens: EST_ITENS, metas: []
});

let base;
function request(method, path, { token = 'h.admin.s', body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    if (payload !== null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(payload); }
    const req = http.request(base + path, { method, headers }, res => {
      let raw = ''; res.on('data', c => { raw += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(raw); } catch (_) {} resolve({ status: res.statusCode, data }); });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;
const meta = (body, opts) => request('PUT', '/api/metas', { body, ...opts });
const metas = async (opts) => (await request('GET', `/api/metas?mes=${MES}`, opts)).data.data.metas;
const ranking = opts => request('GET', `/api/gamificacao/ranking?mes=${MES}`, opts);

test('M05 gestão cria, altera e remove meta; autor fica gravado', async () => {
  const criar = await meta({ profissionalId: P1, mes: MES, tipo: 'faturamento', valorAlvo: 20000 });
  assert.strictEqual(criar.status, 201, JSON.stringify(criar.data));
  assert.deepStrictEqual([banco.metas[0].empresa_id, banco.metas[0].created_by, banco.metas[0].valor_alvo], [E, U.admin, 20000]);
  const alterar = await meta({ profissionalId: P1, mes: MES, tipo: 'faturamento', valorAlvo: 40000 });
  assert.deepStrictEqual([alterar.status, banco.metas.length, banco.metas[0].valor_alvo], [200, 1, 40000]);
  await meta({ profissionalId: P2, mes: MES, tipo: 'atendimentos', valorAlvo: 4 });
  assert.deepStrictEqual((await metas()).map(m => [m.nome, m.tipo, m.alvo, m.realizado, m.percentual]), [['Ana', 'faturamento', 40000, 10000, 25], ['Bia', 'atendimentos', 4, 2, 50]]);
  const remover = await meta({ profissionalId: P2, mes: MES, tipo: 'atendimentos', valorAlvo: null });
  assert.deepStrictEqual([remover.status, remover.data.data.alvo, banco.metas.length], [200, null, 1]);
});

test('M06 profissional vê só as próprias metas e não define meta', async () => {
  await meta({ profissionalId: P2, mes: MES, tipo: 'faturamento', valorAlvo: 30000 });
  assert.deepStrictEqual((await metas({ token: 'h.prof.s' })).map(m => m.nome), ['Ana']);
  assert.strictEqual((await meta({ profissionalId: P1, mes: MES, tipo: 'faturamento', valorAlvo: 1 }, { token: 'h.prof.s' })).status, 403);
  assert.strictEqual(banco.metas.find(m => m.profissional_id === P1).valor_alvo, 40000);
});

test('M07 RBAC: recepção fora de tudo; token legado não define meta; sem token 401', async () => {
  assert.strictEqual((await request('GET', `/api/metas?mes=${MES}`, { token: 'h.recep.s' })).status, 403);
  assert.strictEqual((await ranking({ token: 'h.recep.s' })).status, 403);
  assert.strictEqual((await meta({ profissionalId: P1, mes: MES, tipo: 'faturamento', valorAlvo: 1 }, { token: 'h.recep.s' })).status, 403);
  const legado = await meta({ profissionalId: P1, mes: MES, tipo: 'faturamento', valorAlvo: 1 }, { token: process.env.API_ACCESS_TOKEN });
  assert.deepStrictEqual([legado.status, code(legado)], [403, 'USER_PRINCIPAL_REQUIRED']);
  assert.strictEqual((await ranking({ token: null })).status, 401);
  assert.strictEqual(ACTIONS['metas:write'].userOnly, true);
});

test('M08 isolamento: meta para profissional de outra empresa → 404; B não vê metas nem ranking de A; campos de tenant no corpo → 422', async () => {
  const cruzado = await meta({ profissionalId: PB, mes: MES, tipo: 'faturamento', valorAlvo: 1 });
  assert.deepStrictEqual([cruzado.status, code(cruzado)], [404, 'PROFESSIONAL_NOT_FOUND']);
  assert.deepStrictEqual(await metas({ token: 'h.adminb.s' }), []);
  assert.deepStrictEqual((await ranking({ token: 'h.adminb.s' })).data.data.ranking.map(r => [r.nome, r.faturamentoCentavos]), [['Zeca', 88800]]);
  for (const extra of [{ empresa_id: EB }, { created_by: U.recep }]) {
    const r = await meta({ profissionalId: P1, mes: MES, tipo: 'faturamento', valorAlvo: 1, ...extra });
    assert.deepStrictEqual([r.status, code(r)], [422, 'FORBIDDEN_FIELD']);
  }
});

test('M09 validação: mês, tipo, alvo e campo desconhecido → 422 sem gravar', async () => {
  const antes = JSON.stringify(banco.metas);
  const ok = { profissionalId: P3, mes: MES, tipo: 'faturamento', valorAlvo: 100 };
  for (const ruim of [{ mes: '2026-13' }, { mes: undefined }, { tipo: 'gorjeta' }, { valorAlvo: -1 }, { valorAlvo: 1.5 }, { valorAlvo: '100' }, { valorAlvo: 1000000001 }, { premio: 100 }]) {
    assert.strictEqual((await meta({ ...ok, ...ruim })).status, 422, JSON.stringify(ruim));
  }
  assert.strictEqual((await meta({ ...ok, tipo: 'atendimentos', valorAlvo: 100001 })).status, 422);
  assert.strictEqual(JSON.stringify(banco.metas), antes);
  assert.strictEqual((await request('GET', '/api/metas?mes=abc')).status, 422);
  assert.strictEqual((await request('GET', '/api/gamificacao/ranking?mes=abc')).status, 422);
});

test('M10 ranking: gestão sempre vê, com valores; equipe recebe lista vazia enquanto o salão não liga', async () => {
  const g = await ranking();
  assert.strictEqual(g.status, 200);
  assert.deepStrictEqual([g.data.data.visivelEquipe, g.data.data.ranking.map(r => [r.posicao, r.nome, r.faturamentoCentavos])], [false, [[1, 'Bia', 20000], [2, 'Ana', 10000], [3, 'Caio', 0]]]);
  const p = await ranking({ token: 'h.prof.s' });
  assert.deepStrictEqual([p.status, p.data.data], [200, { mes: MES, visivelEquipe: false, ranking: [] }]);
});

test('M11 salão liga a visibilidade: equipe vê posição e proporção, só o próprio valor em reais', async () => {
  const liga = await request('PATCH', '/api/empresa', { body: { rankingVisivelEquipe: true } });
  assert.strictEqual(liga.status, 200, JSON.stringify(liga.data));
  assert.strictEqual(banco.empresas.find(e => e.id === E).ranking_visivel_equipe, true);
  assert.strictEqual(banco.empresas.find(e => e.id === EB).ranking_visivel_equipe, false, 'ligar em A não liga em B');
  const p = await ranking({ token: 'h.prof.s' });
  assert.strictEqual(p.status, 200);
  assert.deepStrictEqual(p.data.data.ranking.map(r => [r.posicao, r.nome, r.percentualDoLider, r.faturamentoCentavos, r.voce]), [[1, 'Bia', 100, undefined, false], [2, 'Ana', 50, 10000, true], [3, 'Caio', 0, undefined, false]]);
  assert.strictEqual((await request('PATCH', '/api/empresa', { token: 'h.prof.s', body: { rankingVisivelEquipe: false } })).status, 403);
  await request('PATCH', '/api/empresa', { body: { rankingVisivelEquipe: 'sim' } });
  assert.strictEqual(banco.empresas.find(e => e.id === E).ranking_visivel_equipe, false, 'só true explícito liga');
});

(async () => {
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const oe = console.error; const ow = console.warn; console.error = () => {}; console.warn = () => {};
  let passed = 0; let failed = 0;
  for (const t of tests) {
    try { await t.f(); passed++; process.stdout.write(`✓ ${t.n}\n`); }
    catch (err) { failed++; process.stdout.write(`✗ ${t.n}\n  ${err.message}\n`); }
  }
  console.error = oe; console.warn = ow;
  server.close();
  console.log(`\nGamificação Gate: ${passed}/${tests.length} testes verdes.`);
  if (failed) process.exit(1);
})();

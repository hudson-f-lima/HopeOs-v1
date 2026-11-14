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
const { computeDesempenho, computeMetas, computeRanking, computeMetaSalao, sugerirMetas, mesesAnteriores } = require('../src/engines/insights/gamificacao');
const { calcularTaxaEfetiva, gerarParcelados } = require('../src/engines/taxaEfetiva');
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

test('M12 produtos: contam para quem vendeu; total = serviços + produtos; ticket médio por comanda', () => {
  const d = Object.fromEntries(desempenho().map(x => [x.nome, [x.produtosCentavos, x.produtosQuantidade, x.totalCentavos, x.comandas, x.ticketMedioCentavos]]));
  // Ana: 1 pomada de 30,00 em k1; serviços 100,00 → total 130,00 em 2 comandas (k1, k2) → 65,00.
  assert.deepStrictEqual(d, { Ana: [3000, 1, 13000, 2, 6500], Bia: [0, 0, 20000, 2, 10000], Caio: [0, 0, 0, 0, 0] });
  const semVendedor = computeDesempenho({ comandos: [{ id: 'k', data: '2026-06-01' }], comandoItens: [{ id: 'i', comando_id: 'k', tipo: 'produto', profissional_id: null, quantidade: 3, valor_liquido_centavos: 9000 }], profissionais: PROFS, mes: MES });
  assert.ok(semVendedor.every(x => x.produtosCentavos === 0), 'produto sem vendedor não conta para ninguém');
  const estornado = computeDesempenho({ comandos: COMANDOS.filter(c => c.empresa_id === E), comandoItens: ITENS.filter(i => i.empresa_id === E), estornos: [{ id: 'e9', data: '2026-06-28' }], estornoItens: [{ estorno_id: 'e9', comando_item_id: 'i3', quantidade: 1, valor_liquido_centavos: 3000 }], profissionais: PROFS, mes: MES });
  assert.deepStrictEqual([estornado.find(x => x.nome === 'Ana').produtosCentavos, estornado.find(x => x.nome === 'Ana').produtosQuantidade], [0, 0], 'estorno de produto desconta');
});

test('M13 ranking por critério: produtos (Ana 1º) e total (Bia 1º); meta de produtos mede a venda', () => {
  assert.deepStrictEqual(computeRanking({ desempenho: desempenho(), criterio: 'produtos' }).map(x => [x.posicao, x.nome, x.valorCentavos, x.percentualDoLider]), [[1, 'Ana', 3000, 100], [2, 'Bia', 0, 0], [3, 'Caio', 0, 0]]);
  assert.deepStrictEqual(computeRanking({ desempenho: desempenho(), criterio: 'total' }).map(x => [x.posicao, x.nome, x.valorCentavos, x.percentualDoLider]), [[1, 'Bia', 20000, 100], [2, 'Ana', 13000, 65], [3, 'Caio', 0, 0]]);
  const equipe = computeRanking({ desempenho: desempenho(), criterio: 'total', comValores: false, destaqueId: P1 });
  assert.deepStrictEqual(equipe.map(x => ['valorCentavos' in x, 'produtosCentavos' in x, 'ticketMedioCentavos' in x]), [[false, false, false], [true, true, true], [false, false, false]]);
  const m = computeMetas({ metas: [{ id: 'mp', profissional_id: P1, mes: MES, tipo: 'produtos', valor_alvo: 6000 }], desempenho: desempenho(), mes: MES });
  assert.deepStrictEqual(m.map(x => [x.tipo, x.realizado, x.percentual, x.atingida]), [['produtos', 3000, 50, false]]);
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
  assert.deepStrictEqual([p.status, p.data.data], [200, { mes: MES, criterio: 'servicos', visivelEquipe: false, ranking: [] }]);
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

test('M14 HTTP: meta de produtos e ranking por critério; critério inválido → 422', async () => {
  const r = await meta({ profissionalId: P1, mes: MES, tipo: 'produtos', valorAlvo: 6000 });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  assert.deepStrictEqual((await metas()).filter(m => m.tipo === 'produtos').map(m => [m.nome, m.alvo, m.realizado, m.percentual]), [['Ana', 6000, 3000, 50]]);
  const prod = await request('GET', `/api/gamificacao/ranking?mes=${MES}&criterio=produtos`);
  assert.deepStrictEqual([prod.data.data.criterio, prod.data.data.ranking.map(x => [x.nome, x.valorCentavos, x.ticketMedioCentavos])], ['produtos', [['Ana', 3000, 6500], ['Bia', 0, 10000], ['Caio', 0, 0]]]);
  const total = await request('GET', `/api/gamificacao/ranking?mes=${MES}&criterio=total`);
  assert.deepStrictEqual(total.data.data.ranking.map(x => [x.nome, x.valorCentavos]), [['Bia', 20000], ['Ana', 13000], ['Caio', 0]]);
  const ruim = await request('GET', `/api/gamificacao/ranking?mes=${MES}&criterio=comissao`);
  assert.deepStrictEqual([ruim.status, code(ruim)], [422, 'INVALID_FIELD']);
});

// ---------- Sugestão de meta e taxa efetiva (Onda 1 da análise de desempenho e margem) ----------
const dm = (id, nome, atendimentos, fat, prod = 0) => ({ profissionalId: id, nome, atendimentos, faturamentoCentavos: fat, produtosCentavos: prod, totalCentavos: fat + prod });

test('R01 meta do salão: soma das metas de faturamento; quem não tem meta fica fora; reconhece só ao chegar', () => {
  const metas = [{ profissional_id: 'a', mes: MES, tipo: 'faturamento', valor_alvo: 20000 }, { profissional_id: 'b', mes: MES, tipo: 'faturamento', valor_alvo: 30000 },
    { profissional_id: 'c', mes: MES, tipo: 'atendimentos', valor_alvo: 5 }, { profissional_id: 'd', mes: MES, tipo: 'faturamento', valor_alvo: 0 }];
  const des = [{ profissionalId: 'a', faturamentoCentavos: 10000 }, { profissionalId: 'b', faturamentoCentavos: 20000 }, { profissionalId: 'c', faturamentoCentavos: 99999 }, { profissionalId: 'd', faturamentoCentavos: 99999 }];
  const r = computeMetaSalao({ desempenho: des, metas, mes: MES });
  assert.deepStrictEqual([r.metaCentavos, r.realizadoCentavos, r.percentual, r.reconhecida, r.profissionaisComMeta], [50000, 30000, 60, false, 2]);
  const bateu = computeMetaSalao({ desempenho: [{ profissionalId: 'a', faturamentoCentavos: 20000 }, { profissionalId: 'b', faturamentoCentavos: 30000 }], metas, mes: MES });
  assert.deepStrictEqual([bateu.percentual, bateu.reconhecida], [100, true]);
  assert.deepStrictEqual(computeMetaSalao({ desempenho: des, metas: [], mes: MES }), { mes: MES, temMetas: false, metaCentavos: 0, realizadoCentavos: 0, percentual: null, reconhecida: false, profissionaisComMeta: 0 });
  assert.ok(Object.keys(r).every(k => !/nome|profissional_?id|profissionalId/i.test(k) || k === 'profissionaisComMeta'), 'sem dados por pessoa');
});

test('R02 HTTP meta do salão: admin, gestão e profissional leem; recepção não; resposta sem nomes', async () => {
  for (const token of ['h.admin.s', 'h.prof.s']) {
    const r = await request('GET', `/api/gamificacao/meta-salao?mes=${MES}`, { token });
    assert.strictEqual(r.status, 200, token);
    assert.ok(!/"nome"/.test(JSON.stringify(r.data)), 'sem nome de pessoa');
    assert.deepStrictEqual(Object.keys(r.data.data).sort(), ['mes', 'metaCentavos', 'percentual', 'profissionaisComMeta', 'realizadoCentavos', 'reconhecida', 'temMetas']);
  }
  assert.strictEqual((await request('GET', `/api/gamificacao/meta-salao?mes=${MES}`, { token: 'h.recep.s' })).status, 403);
  assert.strictEqual((await request('GET', `/api/gamificacao/meta-salao?mes=2026-13`)).status, 422);
});

test('S01 meses anteriores: 3 meses fechados, virando o ano', () => {
  assert.deepStrictEqual(mesesAnteriores('2026-06'), ['2026-03', '2026-04', '2026-05']);
  assert.deepStrictEqual(mesesAnteriores('2026-02'), ['2025-11', '2025-12', '2026-01']);
});

test('S02 sugestão: média de 3 meses + incremento, arredondada para cima; sem histórico completo não sugere', () => {
  const r = sugerirMetas({ incrementoPct: 10, desempenhoPorMes: [
    { mes: '2026-03', desempenho: [dm(P1, 'Ana', 10, 100000, 3000), dm(P2, 'Bia', 4, 40000), dm(P3, 'Caio', 0, 0)] },
    { mes: '2026-04', desempenho: [dm(P1, 'Ana', 12, 120000, 0), dm(P2, 'Bia', 0, 0), dm(P3, 'Caio', 0, 0)] },
    { mes: '2026-05', desempenho: [dm(P1, 'Ana', 11, 110050, 3000), dm(P2, 'Bia', 6, 60000), dm(P3, 'Caio', 0, 0)] }
  ] });
  const ana = r.find(x => x.nome === 'Ana');
  // Faturamento: média 110.016,67 centavos → ×1,10 = 121.018,33 → sobe para R$ 1.211,00.
  assert.deepStrictEqual([ana.mesesComMovimento, ana.faturamento, ana.atendimentos, ana.produtos], [3, { media: 110017, sugerido: 121100 }, { media: 11, sugerido: 12 }, { media: 2000, sugerido: 2200 }]);
  const bia = r.find(x => x.nome === 'Bia');
  assert.deepStrictEqual([bia.mesesComMovimento, bia.faturamento, bia.atendimentos], [2, null, null], 'mês parado no meio: sem sugestão');
  assert.deepStrictEqual([r.find(x => x.nome === 'Caio').faturamento, sugerirMetas({ desempenhoPorMes: [] })], [null, []]);
});

test('T01 taxa efetiva: PIX/1x sem antecipação = só o MDR; parcelado soma antecipação pro rata', () => {
  assert.deepStrictEqual(calcularTaxaEfetiva({ mdrPct: 0.99 }), { parcelas: 1, mdrPct: 0.99, antecipacaoMesPct: 0, prazoMedioDias: 30, antecipacaoPct: 0, taxaEfetivaPct: 0.99, liquidoPor100Centavos: 9901 });
  // 6x, MDR 3,5%, antecipação 1,8% a.m.: prazo médio 3,5 meses → 96,5 × 1,8% × 3,5 = 6,0795 → 9,5795%.
  const seis = calcularTaxaEfetiva({ mdrPct: 3.5, antecipacaoMesPct: 1.8, parcelas: 6 });
  assert.deepStrictEqual([seis.prazoMedioDias, seis.antecipacaoPct, seis.taxaEfetivaPct, seis.liquidoPor100Centavos], [105, 6.0795, 9.5795, 9042]);
  // 12x custa mais que 2x com as mesmas taxas.
  assert.ok(calcularTaxaEfetiva({ mdrPct: 3.5, antecipacaoMesPct: 1.8, parcelas: 12 }).taxaEfetivaPct > calcularTaxaEfetiva({ mdrPct: 3.5, antecipacaoMesPct: 1.8, parcelas: 2 }).taxaEfetivaPct);
  for (const ruim of [{ mdrPct: -1 }, { mdrPct: 101 }, { mdrPct: 'x' }, { mdrPct: 3, parcelas: 13 }, { mdrPct: 3, parcelas: 0 }, { mdrPct: 3, parcelas: 2.5 }, { mdrPct: 3, antecipacaoMesPct: -1 }]) {
    assert.throws(() => calcularTaxaEfetiva(ruim), RangeError);
  }
});

test('S04 HTTP sugestão: gestão recebe; recepção e profissional não; outra empresa não aparece', async () => {
  // Março a maio: Ana fez 100,00, 200,00 e 300,00 em serviços (1 atendimento por mês).
  ['03', '04', '05'].forEach((m, i) => {
    banco.comandos.push({ id: `s${m}`, empresa_id: E, data: `2026-${m}-10` });
    banco.comando_itens.push(item(`si${m}`, `s${m}`, 'servico', P1, (i + 1) * 10000));
    banco.comandos.push({ id: `sb${m}`, empresa_id: EB, data: `2026-${m}-10` });
    banco.comando_itens.push(item(`sbi${m}`, `sb${m}`, 'servico', PB, 99900, EB));
  });
  const r = await request('GET', `/api/metas/sugestao?mes=${MES}&incrementoPct=10`);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.data.mesesBase, ['2026-03', '2026-04', '2026-05']);
  const ana = r.data.data.sugestoes.find(x => x.nome === 'Ana');
  assert.deepStrictEqual([ana.faturamento, ana.atendimentos, ana.produtos], [{ media: 20000, sugerido: 22000 }, { media: 1, sugerido: 1 }, null]);
  assert.ok(!r.data.data.sugestoes.some(x => x.nome === 'Zeca'), 'profissional de outra empresa não aparece');
  assert.strictEqual(r.data.data.sugestoes.find(x => x.nome === 'Bia').faturamento, null);
  for (const token of ['h.recep.s', 'h.prof.s']) assert.strictEqual((await request('GET', `/api/metas/sugestao?mes=${MES}`, { token })).status, 403);
  assert.strictEqual((await request('GET', `/api/metas/sugestao?mes=${MES}`, { token: null })).status, 401);
  assert.deepStrictEqual([(await request('GET', '/api/metas/sugestao?mes=2026-13')).status, (await request('GET', `/api/metas/sugestao?mes=${MES}&incrementoPct=500`)).status], [422, 422]);
  const outra = await request('GET', `/api/metas/sugestao?mes=${MES}`, { token: 'h.adminb.s' });
  assert.deepStrictEqual(outra.data.data.sugestoes.map(x => x.nome), ['Zeca']);
});

test('T02 HTTP calculadora de taxa: só quem edita cadastros; entrada ruim = 422; não grava nada', async () => {
  const r = await request('GET', '/api/formas-pagamento/simular-taxa?mdrPct=3,5&antecipacaoMesPct=1.8&parcelas=6');
  assert.deepStrictEqual([r.status, r.data.data.taxaEfetivaPct], [200, 9.5795]);
  assert.strictEqual((await request('GET', '/api/formas-pagamento/simular-taxa?mdrPct=3&parcelas=13')).status, 422);
  assert.strictEqual((await request('GET', '/api/formas-pagamento/simular-taxa')).status, 422);
  assert.strictEqual((await request('GET', '/api/formas-pagamento/simular-taxa?mdrPct=3', { token: 'h.prof.s' })).status, 403);
  assert.strictEqual((banco.formas_pagamento || []).length, 0);
});

test('T03 parcelados em lote: 2x–6x com uma taxa, 7x–12x com outra; prazo 1 dia com antecipação, 30 sem', () => {
  const r = gerarParcelados({ mdrAte6Pct: 3.5, mdr7a12Pct: 4.2, antecipacaoMesPct: 1.8, ateParcelas: 12 });
  assert.deepStrictEqual([r.length, r[0].code, r[0].label, r[10].code, r.every(f => f.diasRecebimento === 1)], [11, 'credito_2x', 'Crédito 2x', 'credito_12x', true]);
  assert.strictEqual(r.find(f => f.parcelas === 6).taxaPct, 9.5795);
  // 7x: 4,2 + 95,8 × 1,8% × 4 = 4,2 + 6,8976 = 11,0976.
  assert.strictEqual(r.find(f => f.parcelas === 7).taxaPct, 11.0976);
  assert.ok(r.every((f, i) => i === 0 || f.taxaPct > r[i - 1].taxaPct), 'mais parcelas, mais taxa');
  const semAnt = gerarParcelados({ mdrAte6Pct: 3.5, ateParcelas: 7 });
  assert.deepStrictEqual(semAnt.map(f => [f.parcelas, f.taxaPct, f.diasRecebimento]), [2, 3, 4, 5, 6, 7].map(n => [n, 3.5, 30]), 'sem 7–12x informado vale a taxa de 2–6x');
  for (const ruim of [{ mdrAte6Pct: 3.5, ateParcelas: 1 }, { mdrAte6Pct: 3.5, ateParcelas: 13 }, { ateParcelas: 6 }, { mdrAte6Pct: 3.5, mdr7a12Pct: 'x', ateParcelas: 12 }]) assert.throws(() => gerarParcelados(ruim), RangeError);
});

test('T04 HTTP parcelados: prévia não grava; gravar cria; repetir atualiza só taxa e prazo; outra empresa e outros papéis fora', async () => {
  const corpo = { mdrAte6Pct: 3.5, mdr7a12Pct: 4.2, antecipacaoMesPct: 1.8, ateParcelas: 6 };
  const previa = await request('POST', '/api/formas-pagamento/parcelados', { body: corpo });
  assert.deepStrictEqual([previa.status, previa.data.data.gravado, previa.data.data.formas.length, previa.data.data.formas.every(f => f.jaExiste === false), (banco.formas_pagamento || []).length], [200, false, 5, true, 0]);
  const grava = await request('POST', '/api/formas-pagamento/parcelados', { body: { ...corpo, gravar: true } });
  assert.deepStrictEqual([grava.status, grava.data.data.criadas, grava.data.data.atualizadas], [201, 5, 0]);
  const doTenant = () => banco.formas_pagamento.filter(f => f.empresa_id === E);
  assert.deepStrictEqual(doTenant().map(f => [f.code, Number(f.taxa_pct), f.dias_recebimento, f.ativo]).find(x => x[0] === 'credito_6x'), ['credito_6x', 9.5795, 1, true]);
  // A gestão renomeou e desativou o 3x: o lote seguinte respeita e só muda taxa e prazo.
  Object.assign(doTenant().find(f => f.code === 'credito_3x'), { label: 'Cartão 3 vezes', ativo: false });
  const de_novo = await request('POST', '/api/formas-pagamento/parcelados', { body: { mdrAte6Pct: 4, ateParcelas: 7, gravar: true } });
  assert.deepStrictEqual([de_novo.status, de_novo.data.data.criadas, de_novo.data.data.atualizadas, doTenant().length], [201, 1, 5, 6]);
  const tres = doTenant().find(f => f.code === 'credito_3x');
  assert.deepStrictEqual([tres.label, tres.ativo, Number(tres.taxa_pct), tres.dias_recebimento], ['Cartão 3 vezes', false, 4, 30]);
  assert.strictEqual(banco.formas_pagamento.filter(f => f.empresa_id === EB).length, 0, 'nada na outra empresa');
  for (const token of ['h.recep.s', 'h.prof.s']) assert.strictEqual((await request('POST', '/api/formas-pagamento/parcelados', { token, body: { ...corpo, gravar: true } })).status, 403);
  const ruins = [{ ateParcelas: 6 }, { ...corpo, ateParcelas: 13 }, { ...corpo, empresa_id: EB }, { ...corpo, gravar: 'sim' }];
  for (const body of ruins) assert.strictEqual((await request('POST', '/api/formas-pagamento/parcelados', { body })).status, 422, JSON.stringify(body));
  assert.strictEqual(doTenant().length, 6, 'entradas ruins não gravam');
});

test('V01 mais vendidos: conta unidades na janela, ignora inativo e fora da janela, desempata pelo mais recente', () => {
  const { computeMaisVendidos } = require('../src/engines/insights/maisVendidos');
  const cs = [{ id: 'c1', data: '2026-06-10' }, { id: 'c2', data: '2026-06-20' }, { id: 'velha', data: '2026-01-01' }];
  const it = (comando_id, tipo, id, quantidade = 1) => ({ comando_id, tipo, quantidade, [tipo === 'servico' ? 'servico_id' : 'produto_id']: id });
  const itens = [it('c1', 'servico', 's1'), it('c2', 'servico', 's1'), it('c1', 'servico', 's2'), it('c2', 'servico', 's3'), it('c1', 'servico', 's4'), it('c2', 'servico', 's5'), it('c1', 'servico', 'sInativo'), it('c2', 'servico', 'sInativo'), it('c2', 'servico', 'sInativo'),
    it('velha', 'servico', 's2'), it('velha', 'servico', 's2'), it('velha', 'servico', 's2'), it('c1', 'produto', 'p1', 5), it('c2', 'produto', 'p2', 2), it('c2', 'produto', 'p3', 1), it('c1', 'produto', 'apagado', 9)];
  const servicos = ['s1', 's2', 's3', 's4', 's5'].map(id => ({ id, nome: id.toUpperCase(), ativo: true })).concat({ id: 'sInativo', nome: 'X', ativo: false });
  const produtos = ['p1', 'p2', 'p3'].map(id => ({ id, nome: id, ativo: true }));
  const r = computeMaisVendidos({ comandos: cs, comandoItens: itens, servicos, produtos, hoje: '2026-06-30' });
  // s1 = 2; s2, s3, s4, s5 = 1 cada: os de 20/06 (s3, s5) antes dos de 10/06 (s2, s4); cabem 4.
  assert.deepStrictEqual(r, { dias: 90, servicos: ['s1', 's3', 's5', 's2'], produtos: ['p1', 'p2'] });
  assert.deepStrictEqual(computeMaisVendidos({ hoje: '2026-06-30' }), { dias: 90, servicos: [], produtos: [] });
  // Controle negativo: com janela de 365 dias a comanda antiga entra e o s2 passa à frente.
  assert.deepStrictEqual(computeMaisVendidos({ comandos: cs, comandoItens: itens, servicos, produtos, hoje: '2026-06-30', dias: 365 }).servicos[0], 's2');
});

test('V02 HTTP mais vendidos: só ids da própria empresa; quem fecha comanda lê; sem login não', async () => {
  const hojeSP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  banco.servicos = [{ id: 'sv1', empresa_id: E, nome: 'Corte', ativo: true }, { id: 'svb', empresa_id: EB, nome: 'Corte B', ativo: true }];
  banco.produtos = [{ id: 'pd1', empresa_id: E, nome: 'Pomada', ativo: true }];
  banco.comandos.push({ id: 'mv1', empresa_id: E, data: hojeSP }, { id: 'mvb', empresa_id: EB, data: hojeSP });
  banco.comando_itens.push({ id: 'mvi1', empresa_id: E, comando_id: 'mv1', tipo: 'servico', servico_id: 'sv1', quantidade: 1 }, { id: 'mvi2', empresa_id: E, comando_id: 'mv1', tipo: 'produto', produto_id: 'pd1', quantidade: 2 },
    { id: 'mvib', empresa_id: EB, comando_id: 'mvb', tipo: 'servico', servico_id: 'svb', quantidade: 50 });
  const r = await request('GET', '/api/checkout/mais-vendidos');
  assert.deepStrictEqual([r.status, r.data.data], [200, { dias: 90, servicos: ['sv1'], produtos: ['pd1'] }]);
  for (const token of ['h.recep.s', 'h.prof.s']) assert.strictEqual((await request('GET', '/api/checkout/mais-vendidos', { token })).status, 200);
  assert.strictEqual((await request('GET', '/api/checkout/mais-vendidos', { token: null })).status, 401);
  assert.deepStrictEqual((await request('GET', '/api/checkout/mais-vendidos', { token: 'h.adminb.s' })).data.data.servicos, ['svb']);
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

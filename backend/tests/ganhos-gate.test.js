// Ganhos Gate (D-016): "meus ganhos" do profissional e serviços prestados para o
// contador. Função pura com números calculados à mão + HTTP real (banco e identidade
// em memória): escopo próprio, isolamento de empresa, RBAC e X-Request-Id.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-ganhos-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { env } = require('../src/config/env');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { computeGanhos, listServicosPrestados } = require('../src/engines/insights/ganhos');
const { ACTIONS } = require('../src/auth/rbac');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

const tests = [];
const test = (n, f) => tests.push({ n, f });

const E = env.DEFAULT_EMPRESA_ID;
const EB = 'e0000000-0000-4000-8000-0000000000cc';
const P1 = 'a0000000-0000-4000-8000-0000000000c1';
const P2 = 'a0000000-0000-4000-8000-0000000000c2';
const PB = 'a0000000-0000-4000-8000-0000000000c3';
const UNIT = 'f0000000-0000-4000-8000-0000000000c1';
const MES = '2026-06';

// k1 (05/06): P1 corte 100 (comissão 40) + P2 barba 50 (comissão 25) + produto 30 vendido por P1 (comissão 3).
// k2 (20/06): P1 corte 100 (comissão 40). k3 (02/07): fora do mês. kb: outra empresa.
// Gorjetas: k1 → P1 10 líquido; k2 → P1 5 líquido.
// Estorno e1 em 25/06 do item i4 (k2): devolve 100, comissão 40, gorjeta 5.
// Estorno e2 em 03/07 do item i1 (k1): é de JULHO — junho não muda.
const COMANDOS = [
  { id: 'k1', empresa_id: E, data: '2026-06-05' }, { id: 'k2', empresa_id: E, data: '2026-06-20' },
  { id: 'k3', empresa_id: E, data: '2026-07-02' }, { id: 'kb', empresa_id: EB, data: '2026-06-05' }
];
const item = (id, comando_id, tipo, profissional_id, valor, comissao, empresa_id = E) => ({ id, empresa_id, comando_id, tipo, profissional_id, quantidade: 1, descricao: id, valor_liquido_centavos: valor, comissao_centavos: comissao, receita_empresa_centavos: valor - comissao });
const ITENS = [
  item('i1', 'k1', 'servico', P1, 10000, 4000), item('i2', 'k1', 'servico', P2, 5000, 2500), item('i3', 'k1', 'produto', P1, 3000, 300),
  item('i4', 'k2', 'servico', P1, 10000, 4000), item('i5', 'k3', 'servico', P1, 9900, 3900), item('ib', 'kb', 'servico', PB, 7700, 7000, EB)
];
const GORJETAS = [
  { id: 'g1', empresa_id: E, comando_id: 'k1', profissional_id: P1, valor_liquido_centavos: 1000 },
  { id: 'g2', empresa_id: E, comando_id: 'k2', profissional_id: P1, valor_liquido_centavos: 500 }
];
const ESTORNOS = [{ id: 'e1', empresa_id: E, comando_id: 'k2', data: '2026-06-25' }, { id: 'e2', empresa_id: E, comando_id: 'k1', data: '2026-07-03' }];
const EST_ITENS = [
  { id: 'x1', empresa_id: E, estorno_id: 'e1', comando_id: 'k2', comando_item_id: 'i4', quantidade: 1, valor_liquido_centavos: 10000, comissao_centavos: 4000, receita_empresa_centavos: 6000 },
  { id: 'x2', empresa_id: E, estorno_id: 'e2', comando_id: 'k1', comando_item_id: 'i1', quantidade: 1, valor_liquido_centavos: 10000, comissao_centavos: 4000, receita_empresa_centavos: 6000 }
];
const EST_GORJ = [{ id: 'y1', empresa_id: E, estorno_id: 'e1', comando_id: 'k2', profissional_id: P1, valor_liquido_centavos: 500 }];
const dados = { comandos: COMANDOS, comandoItens: ITENS, gorjetas: GORJETAS, estornos: ESTORNOS, estornoItens: EST_ITENS, estornoGorjetas: EST_GORJ };

test('G01 ganhos de P1 em junho: comissão 83,00 + gorjeta 15,00 − estorno (40,00 + 5,00) = 53,00', () => {
  const r = computeGanhos({ ...dados, profissionalId: P1, mes: MES });
  assert.strictEqual(r.atendimentos, 2, 'produto não conta como atendimento');
  assert.strictEqual(r.valorServicosCentavos, 20000);
  assert.strictEqual(r.comissaoCentavos, 8300);
  assert.strictEqual(r.gorjetaLiquidaCentavos, 1500);
  assert.deepStrictEqual(r.estornos, { quantidade: 1, comissaoCentavos: 4000, gorjetaCentavos: 500 });
  assert.strictEqual(r.totalCentavos, 5300);
  assert.deepStrictEqual(r.porDia.map(d => [d.data, d.comissaoCentavos, d.gorjetaCentavos]), [['2026-06-05', 4300, 1000], ['2026-06-20', 4000, 500], ['2026-06-25', -4000, -500]]);
  assert.strictEqual(r.porDia.reduce((s, d) => s + d.comissaoCentavos + d.gorjetaCentavos, 0), r.totalCentavos, 'dias somam o total');
});

test('G02 estorno entra no mês DO estorno: julho de P1 = 39,00 − 40,00; junho não muda', () => {
  const jul = computeGanhos({ ...dados, profissionalId: P1, mes: '2026-07' });
  assert.strictEqual(jul.comissaoCentavos, 3900);
  assert.strictEqual(jul.estornos.comissaoCentavos, 4000);
  assert.strictEqual(jul.totalCentavos, -100);
});

test('G03 P2 só vê o que é dele; sem dados → zeros', () => {
  const p2 = computeGanhos({ ...dados, profissionalId: P2, mes: MES });
  assert.deepStrictEqual([p2.atendimentos, p2.comissaoCentavos, p2.gorjetaLiquidaCentavos, p2.totalCentavos], [1, 2500, 0, 2500]);
  const vazio = computeGanhos({ profissionalId: P1, mes: MES });
  assert.deepStrictEqual([vazio.atendimentos, vazio.totalCentavos, vazio.porDia.length], [0, 0, 0]);
});

test('G04 serviços prestados: 4 vendas + 1 estorno negativo; totais batem com a cota-parte', () => {
  const r = listServicosPrestados({ comandos: COMANDOS.filter(c => c.empresa_id === E), comandoItens: ITENS.filter(i => i.empresa_id === E), profissionais: [{ id: P1, nome: 'Ana' }, { id: P2, nome: 'Bia' }], estornos: ESTORNOS, estornoItens: EST_ITENS, mes: MES });
  assert.strictEqual(r.linhas.length, 5);
  assert.deepStrictEqual(r.linhas.filter(l => l.lancamento === 'estorno').map(l => [l.data, l.valorCentavos, l.cotaParteProfissionalCentavos, l.profissional]), [['2026-06-25', -10000, -4000, 'Ana']]);
  assert.deepStrictEqual(r.totais, { valorCentavos: 18000, cotaParteProfissionalCentavos: 6800, cotaParteSalaoCentavos: 11200 });
  assert.ok(r.linhas.every(l => !('cliente' in l) && !('clienteId' in l)), 'sem dado de cliente');
});

// ---------- HTTP ----------
const U = { admin: 'c0000000-0000-4000-8000-0000000000c1', recep: 'c0000000-0000-4000-8000-0000000000c2', prof: 'c0000000-0000-4000-8000-0000000000c3', semVinculo: 'c0000000-0000-4000-8000-0000000000c4', adminB: 'c0000000-0000-4000-8000-0000000000c5' };
setIdentityStore(createMemoryIdentityStore({
  app_users: Object.values(U).map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: E, user_id: U.admin, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: E, user_id: U.recep, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: E, user_id: U.prof, role: 'profissional', status: 'ativo', profissional_id: P1 },
    { id: 'm4', empresa_id: E, user_id: U.semVinculo, role: 'profissional', status: 'ativo', profissional_id: null },
    { id: 'm5', empresa_id: EB, user_id: U.adminB, role: 'admin', status: 'ativo' }
  ],
  membership_units: ['m2', 'm3', 'm4'].map(membership_id => ({ membership_id, unit_id: UNIT }))
}));
const tokens = { 'h.admin.s': U.admin, 'h.recep.s': U.recep, 'h.prof.s': U.prof, 'h.semvinculo.s': U.semVinculo, 'h.adminb.s': U.adminB };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });
installMemoryBackend({
  empresas: [{ id: E, nome: 'A' }, { id: EB, nome: 'B' }],
  profissionais: [{ id: P1, empresa_id: E, nome: 'Ana', ativo: true }, { id: P2, empresa_id: E, nome: 'Bia', ativo: true }, { id: PB, empresa_id: EB, nome: 'Zeca', ativo: true }],
  comandos: COMANDOS, comando_itens: ITENS, comando_gorjetas: GORJETAS,
  comanda_estornos: ESTORNOS, comanda_estorno_itens: EST_ITENS, comanda_estorno_gorjetas: EST_GORJ
});

let base;
function request(path, token = 'h.admin.s') {
  return new Promise((resolve, reject) => {
    http.get(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {} }, res => {
      let raw = ''; res.on('data', c => { raw += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(raw); } catch (_) {} resolve({ status: res.statusCode, data, headers: res.headers }); });
    }).on('error', reject);
  });
}
const code = r => r.data && r.data.error && r.data.error.code;

test('G05 profissional vê os próprios ganhos sem informar id', async () => {
  const r = await request(`/api/relatorios/meus-ganhos?mes=${MES}`, 'h.prof.s');
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual([r.data.data.profissionalId, r.data.data.nome, r.data.data.totalCentavos], [P1, 'Ana', 5300]);
});

test('G06 escopo próprio: profissionalId de colega na query é IGNORADO (continua vendo só o seu)', async () => {
  const r = await request(`/api/relatorios/meus-ganhos?mes=${MES}&profissionalId=${P2}`, 'h.prof.s');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.data.profissionalId, P1);
  assert.strictEqual(r.data.data.totalCentavos, 5300);
});

test('G07 gestão consulta qualquer profissional da empresa; sem id → 422', async () => {
  const r = await request(`/api/relatorios/meus-ganhos?mes=${MES}&profissionalId=${P2}`);
  assert.strictEqual(r.data.data.totalCentavos, 2500);
  const sem = await request(`/api/relatorios/meus-ganhos?mes=${MES}`);
  assert.deepStrictEqual([sem.status, code(sem)], [422, 'PROFESSIONAL_REQUIRED']);
});

test('G08 isolamento: profissional de outra empresa → 404; empresa B não vê dados de A', async () => {
  const cruzado = await request(`/api/relatorios/meus-ganhos?mes=${MES}&profissionalId=${PB}`);
  assert.deepStrictEqual([cruzado.status, code(cruzado)], [404, 'PROFESSIONAL_NOT_FOUND']);
  const b = await request(`/api/relatorios/meus-ganhos?mes=${MES}&profissionalId=${P1}`, 'h.adminb.s');
  assert.strictEqual(b.status, 404);
  const linhasB = await request(`/api/relatorios/servicos-prestados?mes=${MES}&empresa_id=${E}`, 'h.adminb.s');
  assert.deepStrictEqual(linhasB.data.data.linhas.map(l => l.valorCentavos), [7700], 'empresa_id na query é ignorado');
});

test('G09 RBAC: recepção 403 nos dois; profissional 403 em serviços prestados; sem vínculo 403; sem token 401', async () => {
  assert.strictEqual((await request(`/api/relatorios/meus-ganhos?mes=${MES}&profissionalId=${P1}`, 'h.recep.s')).status, 403);
  assert.strictEqual((await request(`/api/relatorios/servicos-prestados?mes=${MES}`, 'h.recep.s')).status, 403);
  assert.strictEqual((await request(`/api/relatorios/servicos-prestados?mes=${MES}`, 'h.prof.s')).status, 403);
  const sv = await request(`/api/relatorios/meus-ganhos?mes=${MES}`, 'h.semvinculo.s');
  assert.deepStrictEqual([sv.status, code(sv)], [403, 'PROFESSIONAL_LINK_REQUIRED']);
  assert.strictEqual((await request(`/api/relatorios/meus-ganhos?mes=${MES}`, null)).status, 401);
  assert.deepStrictEqual(ACTIONS['relatorios:proprio'].own, ['profissional']);
});

test('G10 mês inválido → 422 nos dois', async () => {
  for (const rota of ['meus-ganhos', 'servicos-prestados']) {
    for (const mes of ['', '2026-13', '2026-6', 'abc']) {
      const r = await request(`/api/relatorios/${rota}?mes=${mes}&profissionalId=${P1}`);
      assert.deepStrictEqual([r.status, code(r)], [422, 'INVALID_MONTH'], `${rota} ${mes}`);
    }
  }
});

test('G11 serviços prestados por HTTP: totais de junho da empresa A', async () => {
  const r = await request(`/api/relatorios/servicos-prestados?mes=${MES}`);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.data.totais, { valorCentavos: 18000, cotaParteProfissionalCentavos: 6800, cotaParteSalaoCentavos: 11200 });
});

test('G12 toda resposta traz X-Request-Id distinto (inclusive 401 e health)', async () => {
  const a = await request('/api/health', null);
  const b = await request('/api/clientes', null);
  assert.match(a.headers['x-request-id'], /^[0-9a-f]{8}$/);
  assert.match(b.headers['x-request-id'], /^[0-9a-f]{8}$/);
  assert.notStrictEqual(a.headers['x-request-id'], b.headers['x-request-id']);
});

test('G13 erro 5xx: requestId igual ao do cabeçalho e mensagem genérica (detalhe do banco não vaza); 4xx não traz requestId', async () => {
  const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
  const original = SupabaseRepository.prototype.list;
  SupabaseRepository.prototype.list = async () => { throw new Error('falha simulada do banco'); };
  let r;
  try { r = await request(`/api/relatorios/servicos-prestados?mes=${MES}`); } finally { SupabaseRepository.prototype.list = original; }
  assert.strictEqual(r.status, 500);
  assert.strictEqual(r.data.error.requestId, r.headers['x-request-id']);
  assert.strictEqual(r.data.error.code, 'INTERNAL_ERROR');
  assert.ok(!JSON.stringify(r.data).includes('falha simulada'), 'mensagem interna não vai ao cliente');
  const q = await request('/api/relatorios/servicos-prestados?mes=abc');
  assert.strictEqual(q.data.error.requestId, undefined);
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
  console.log(`\nGanhos Gate: ${passed}/${tests.length} testes verdes.`);
  if (failed) process.exit(1);
})();

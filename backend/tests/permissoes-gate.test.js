// Permissões Gate (D-032, migration 012): matriz por papel, permissões individuais,
// limites de autoridade, trilha e revogação. Banco e identidade em memória; as regras que
// só o banco garante (formato, trilha imutável, empresa do vínculo) estão em gate_012.sql.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-perm-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { env } = require('../src/config/env');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { ACTIONS, authorizeAuth } = require('../src/auth/rbac');
const { PERMISSOES, PACOTES, permissoesEfetivas } = require('../src/auth/permissoes');
const { gerarMatriz } = require('../scripts/gerar-matriz-permissoes');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

const tests = [];
const test = (n, f) => tests.push({ n, f });
const E = env.DEFAULT_EMPRESA_ID;
const EB = 'e0000000-0000-4000-8000-0000000000fb';
const UNIT = 'f0000000-0000-4000-8000-0000000000f1';
const P1 = 'a0000000-0000-4000-8000-0000000000f1';
const P2 = 'a0000000-0000-4000-8000-0000000000f2';
const U = {
  admin: 'c0000000-0000-4000-8000-000000000a01', gestor: 'c0000000-0000-4000-8000-000000000a02', gestor2: 'c0000000-0000-4000-8000-000000000a03',
  recep: 'c0000000-0000-4000-8000-000000000a04', prof: 'c0000000-0000-4000-8000-000000000a05', adminB: 'c0000000-0000-4000-8000-000000000a06'
};
const M = {
  admin: 'd0000000-0000-4000-8000-000000000a01', gestor: 'd0000000-0000-4000-8000-000000000a02', gestor2: 'd0000000-0000-4000-8000-000000000a03',
  recep: 'd0000000-0000-4000-8000-000000000a04', prof: 'd0000000-0000-4000-8000-000000000a05', adminB: 'd0000000-0000-4000-8000-000000000a06'
};
const NOMES = { admin: 'Dona', gestor: 'Gerente', gestor2: 'Gerente Dois', recep: 'Recepcionista', prof: 'Ana', adminB: 'Outro Dono' };
const ident = createMemoryIdentityStore({
  app_users: Object.entries(U).map(([k, id]) => ({ id, email: `${k}@t`, nome: NOMES[k], ativo: true })),
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: M.admin, empresa_id: E, user_id: U.admin, role: 'admin', status: 'ativo' },
    { id: M.gestor, empresa_id: E, user_id: U.gestor, role: 'gestor', status: 'ativo' },
    { id: M.gestor2, empresa_id: E, user_id: U.gestor2, role: 'gestor', status: 'ativo' },
    { id: M.recep, empresa_id: E, user_id: U.recep, role: 'recepcao', status: 'ativo' },
    { id: M.prof, empresa_id: E, user_id: U.prof, role: 'profissional', status: 'ativo', profissional_id: P1 },
    { id: M.adminB, empresa_id: EB, user_id: U.adminB, role: 'admin', status: 'ativo' }
  ],
  membership_units: ['recep', 'prof'].map(k => ({ membership_id: M[k], unit_id: UNIT }))
});
setIdentityStore(ident);
const TOK = Object.fromEntries(Object.keys(U).map(k => [`h.${k}.s`, U[k]]));
setAuthProvider({ async getUser(t) { if (!TOK[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: TOK[t] }; } });
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const banco = installMemoryBackend({
  empresas: [{ id: E, nome: 'A' }, { id: EB, nome: 'B' }],
  profissionais: [{ id: P1, empresa_id: E, nome: 'Ana', ativo: true }, { id: P2, empresa_id: E, nome: 'Bruno', ativo: true }],
  agendamentos: [
    { id: 'b0000000-0000-4000-8000-000000000001', empresa_id: E, profissional_id: P2, cliente_id: null, servico_id: null, data: hoje, horario: '15:00', duracao_min: 30, status: 'agendado' },
    { id: 'b0000000-0000-4000-8000-000000000002', empresa_id: E, profissional_id: P2, cliente_id: null, servico_id: null, data: hoje, horario: '16:00', duracao_min: 30, status: 'agendado' }
  ],
  lista_espera: [], comandos: [], comando_itens: []
});

let base;
function request(method, p, { token = 'h.admin.s', body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    if (payload !== null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(payload); }
    const req = http.request(base + p, { method, headers }, res => {
      let raw = ''; res.on('data', c => { raw += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(raw); } catch (_) {} resolve({ status: res.statusCode, data }); });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;
const motivo = r => r.data && r.data.error && r.data.error.details && r.data.error.details.motivo;
const definir = (alvo, permissoes, token = 'h.admin.s') => request('PUT', `/api/equipe/permissoes/${M[alvo]}`, { token, body: { permissoes } });
const me = async token => (await request('GET', '/api/me', { token })).data.data.empresas.find(e => e.empresa_id === E).permissoes;
const recepcao = [...PACOTES.recepcao.permissoes];

// ---------- matriz ----------
test('G01 catálogo coerente: toda rota exige um código conhecido; toda permissão aponta para uma ação ampla existente', () => {
  const dir = path.join(__dirname, '../src/routes');
  const usados = new Set();
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/authorize\('([^']+)'\)/g)) usados.add(m[1]);
    for (const m of src.matchAll(/authorizePor\([^,]+, '([^']+)'\)/g)) m[1].split('|').forEach(c => usados.add(c));
  }
  const desconhecidos = [...usados].filter(c => !PERMISSOES.some(p => p.codigo === c) && !ACTIONS[c]);
  assert.deepStrictEqual(desconhecidos, []);
  const amplasNaRota = [...usados].filter(c => !PERMISSOES.some(p => p.codigo === c));
  assert.deepStrictEqual(amplasNaRota, ['admin'], 'só o router /admin continua na ação ampla');
  assert.ok(PERMISSOES.every(p => ACTIONS[p.acao]), 'ação de origem inexistente');
  assert.ok(PERMISSOES.every(p => /^[a-z_]+:[a-z_]+$/.test(p.codigo)), 'formato do código igual ao do banco');
});

test('G02 matriz documentada = matriz implementada (docs/PERMISSOES.md gerado do catálogo)', () => {
  const doc = fs.readFileSync(path.join(__dirname, '../../docs/PERMISSOES.md'), 'utf8');
  assert.strictEqual(doc, gerarMatriz(), 'rode: node backend/scripts/gerar-matriz-permissoes.js --escrever');
});

test('G03 mínimo necessário por papel: recepção sem estorno nem financeiro; profissional só o próprio na agenda e na comanda', () => {
  const r = permissoesEfetivas('recepcao', []);
  for (const c of ['comanda:estornar', 'painel:financeiro', 'comissoes:pagar', 'metas:definir', 'catalogo:editar', 'equipe:permissoes', 'ganhos:ver']) assert.ok(!r[c], `recepção não deveria ter ${c}`);
  const p = permissoesEfetivas('profissional', []);
  for (const c of ['agenda:ver', 'agenda:criar', 'agenda:encaixar', 'agenda:editar', 'agenda:atender', 'agenda:cancelar', 'comanda:fechar', 'ganhos:ver', 'metas:ver', 'desempenho:ver']) assert.strictEqual(p[c], 'proprio', c);
  for (const c of ['espera:ver', 'caixa:conferir', 'painel:operacional', 'clientes:editar']) assert.ok(!p[c], `profissional não deveria ter ${c}`);
  assert.deepStrictEqual(recepcao, ['agenda:ver', 'agenda:criar', 'agenda:encaixar', 'agenda:editar', 'agenda:atender', 'agenda:cancelar', 'espera:ver', 'espera:gerir', 'comanda:fechar', 'caixa:conferir', 'caixa:fechar', 'caixa:movimentar', 'clientes:editar', 'painel:operacional']);
  const a = permissoesEfetivas('admin', []);
  assert.strictEqual(Object.keys(a).length, PERMISSOES.length, 'administrador tem todas');
});

// ---------- concessão, uso e revogação ----------
test('G04 profissional sem pacote: agenda e comanda só próprias; sem lista de espera, caixa e painel', async () => {
  const p = await me('h.prof.s');
  assert.deepStrictEqual([p['agenda:ver'], p['espera:ver'], p['caixa:conferir']], ['proprio', undefined, undefined]);
  for (const rota of ['/api/lista-espera', '/api/dashboard', `/api/caixa/fechamento?data=${hoje}`]) assert.strictEqual((await request('GET', rota, { token: 'h.prof.s' })).status, 403, rota);
  const r = await request('PATCH', '/api/agenda/b0000000-0000-4000-8000-000000000001/status', { token: 'h.prof.s', body: { novoStatus: 'cancelado' } });
  assert.deepStrictEqual([r.status, code(r)], [403, 'NOT_OWN_RESOURCE'], 'horário de colega');
});

test('G05 conceder só "cancelar": cancela o horário do colega, mas confirmar continua só no próprio', async () => {
  const r = await definir('prof', ['agenda:cancelar']);
  assert.deepStrictEqual([r.status, r.data.data.concedidas, r.data.data.efetivas['agenda:cancelar'], r.data.data.efetivas['agenda:atender']], [200, ['agenda:cancelar'], 'total', 'proprio']);
  const cancel = await request('PATCH', '/api/agenda/b0000000-0000-4000-8000-000000000001/status', { token: 'h.prof.s', body: { novoStatus: 'cancelado' } });
  assert.strictEqual(cancel.status, 200, JSON.stringify(cancel.data));
  const conf = await request('PATCH', '/api/agenda/b0000000-0000-4000-8000-000000000002/status', { token: 'h.prof.s', body: { novoStatus: 'confirmado' } });
  assert.deepStrictEqual([conf.status, code(conf)], [403, 'NOT_OWN_RESOURCE']);
});

test('G06 conceder o pacote Recepção: passa a usar lista de espera, caixa e painel; mantém ganhos e metas só próprios', async () => {
  const r = await definir('prof', recepcao);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.data.data.concedidas, recepcao.filter(c => c !== 'agenda:cancelar').sort());
  for (const rota of ['/api/lista-espera', '/api/dashboard', `/api/caixa/fechamento?data=${hoje}`]) assert.strictEqual((await request('GET', rota, { token: 'h.prof.s' })).status, 200, rota);
  const p = await me('h.prof.s');
  assert.deepStrictEqual([p['agenda:ver'], p['espera:gerir'], p['ganhos:ver'], p['metas:ver'], p['comanda:estornar']], ['total', 'total', 'proprio', 'proprio', undefined]);
  const conf = await request('PATCH', '/api/agenda/b0000000-0000-4000-8000-000000000002/status', { token: 'h.prof.s', body: { novoStatus: 'confirmado' } });
  assert.strictEqual(conf.status, 200, 'atender agora vale para o colega');
});

test('G07 revogar: a permissão deixa de valer já na próxima requisição', async () => {
  const r = await definir('prof', []);
  assert.deepStrictEqual([r.status, r.data.data.revogadas.length, r.data.data.concedidas], [200, recepcao.length, []]);
  assert.strictEqual((await request('GET', '/api/lista-espera', { token: 'h.prof.s' })).status, 403);
  assert.strictEqual((await me('h.prof.s'))['espera:ver'], undefined);
});

test('G08 trilha: quem concedeu ou revogou, o quê, para quem e quando; recepção não lê', async () => {
  const h = await request('GET', `/api/equipe/permissoes/${M.prof}/historico`);
  assert.strictEqual(h.status, 200);
  const ev = h.data.data;
  assert.ok(ev.length >= 1 + recepcao.length * 2 - 1, `eventos: ${ev.length}`);
  assert.ok(ev.every(e => e.por === 'Dona' && e.para === 'Ana' && /^\d{4}-\d{2}-\d{2}T/.test(e.quando) && ['conceder', 'revogar'].includes(e.acao)));
  assert.ok(ev.some(e => e.acao === 'revogar' && e.permissao === 'caixa:fechar'));
  assert.strictEqual((await request('GET', `/api/equipe/permissoes/${M.prof}/historico`, { token: 'h.recep.s' })).status, 403);
});

// ---------- limites de autoridade ----------
test('G09 gerente concede dentro da autoridade; não concede administração, não mexe em gerente, dono nem em si', async () => {
  assert.strictEqual((await definir('prof', recepcao, 'h.gestor.s')).status, 200);
  const adm = await definir('prof', [...recepcao, 'empresa:configurar'], 'h.gestor.s');
  assert.deepStrictEqual([adm.status, motivo(adm)], [403, 'SO_ADMIN_CONCEDE']);
  assert.deepStrictEqual(motivo(await definir('gestor2', ['comanda:estornar'], 'h.gestor.s')), 'ALVO_FORA_DA_AUTORIDADE');
  assert.deepStrictEqual(motivo(await definir('admin', [], 'h.gestor.s')), 'ALVO_FORA_DA_AUTORIDADE');
  assert.deepStrictEqual(motivo(await definir('gestor', ['equipe:permissoes'], 'h.gestor.s')), 'NAO_PODE_SI_MESMO');
  assert.deepStrictEqual(motivo(await definir('recep', ['agenda:ver'])), 'JA_INCLUIDA_NO_PAPEL');
  assert.strictEqual((await definir('prof', [])).status, 200);
});

test('G10 só o dono concede administração; o gerente não consegue revogar o que é de administração', async () => {
  const r = await definir('recep', ['empresa:configurar', 'comanda:estornar']);
  assert.strictEqual(r.status, 200);
  const e = await me('h.recep.s');
  assert.deepStrictEqual([e['empresa:configurar'], e['comanda:estornar']], ['total', 'total']);
  const tentativa = await definir('recep', ['comanda:estornar'], 'h.gestor.s');
  assert.deepStrictEqual([tentativa.status, motivo(tentativa)], [403, 'SO_ADMIN_CONCEDE']);
  assert.strictEqual((await definir('recep', [])).status, 200);
});

test('G11 quem não tem a permissão, token legado, outra empresa e entradas ruins são recusados', async () => {
  for (const token of ['h.recep.s', 'h.prof.s']) {
    const r = await definir('prof', recepcao, token);
    assert.deepStrictEqual([r.status, code(r)], [403, 'INSUFFICIENT_ROLE'], token);
    assert.strictEqual((await request('GET', '/api/equipe/permissoes', { token })).status, 403, token);
  }
  assert.strictEqual((await definir('prof', recepcao, process.env.API_ACCESS_TOKEN)).status, 403, 'legado não concede');
  assert.strictEqual((await definir('prof', recepcao, null)).status, 401);
  assert.strictEqual((await definir('prof', recepcao, 'h.adminB.s')).status, 404, 'vínculo de outra empresa');
  assert.deepStrictEqual([(await definir('prof', ['agenda:voar'])).status, code(await definir('prof', ['agenda:voar']))], [422, 'UNKNOWN_PERMISSION']);
  for (const body of [{ permissoes: 'agenda:ver' }, { permissoes: [1] }, { permissoes: [], empresa_id: EB }]) {
    assert.strictEqual((await request('PUT', `/api/equipe/permissoes/${M.prof}`, { body })).status, 422, JSON.stringify(body));
  }
  assert.strictEqual((ident.db.membership_permissao_eventos || []).filter(e => e.empresa_id === EB).length, 0);
});

test('G12 tela de equipe: o gerente vê o que pode mexer em cada pessoa; nada de administração', async () => {
  const r = await request('GET', '/api/equipe/permissoes', { token: 'h.gestor.s' });
  assert.strictEqual(r.status, 200);
  const por = Object.fromEntries(r.data.data.pessoas.map(p => [p.role === 'gestor' && p.voce ? 'eu' : p.nome, p]));
  assert.ok(por.Ana.editaveis.includes('agenda:ver') && !por.Ana.editaveis.includes('empresa:configurar') && !por.Ana.editaveis.includes('equipe:permissoes'));
  assert.deepStrictEqual([por.eu.editaveis, por['Gerente Dois'].editaveis, por.Dona.editaveis], [[], [], []]);
  assert.strictEqual(r.data.data.catalogo.length, PERMISSOES.length);
  assert.ok(!r.data.data.pessoas.some(p => p.nome === 'Outro Dono'), 'só a própria empresa');
});

test('G13 controle negativo: sem a permissão individual no pedido, o mesmo profissional volta a ser recusado', () => {
  const auth = { principal_type: 'user', role: 'profissional', profissional_id: P1, permissoes_extras: ['espera:ver'] };
  assert.deepStrictEqual(authorizeAuth(auth, 'espera:ver'), { own: false, profissionalId: null });
  assert.throws(() => authorizeAuth({ ...auth, permissoes_extras: [] }, 'espera:ver'), /Sem permissão/);
  assert.deepStrictEqual(authorizeAuth({ ...auth, permissoes_extras: ['agenda:ver'] }, 'agenda:ver'), { own: false, profissionalId: null });
  assert.deepStrictEqual(authorizeAuth({ ...auth, permissoes_extras: [] }, 'agenda:ver'), { own: true, profissionalId: P1 });
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
  console.log(`\nPermissões Gate: ${passed}/${tests.length} testes verdes.`);
  if (failed) process.exit(1);
})();

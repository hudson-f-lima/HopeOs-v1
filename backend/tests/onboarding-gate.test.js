// Onboarding Gate (Onda A, D-008): dados da empresa, status derivado, presets e
// criação idempotente. HTTP real contra o app; banco e identidade em memória.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-onb-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { env } = require('../src/config/env');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { calcularStatus } = require('../src/onboarding/status');
const { NICHOS } = require('../src/onboarding/presets');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

const E = env.DEFAULT_EMPRESA_ID;
const EB = 'e0000000-0000-4000-8000-0000000000bb';
const ADMIN = 'c0000000-0000-4000-8000-0000000000a1';
const RECEP = 'c0000000-0000-4000-8000-0000000000a2';
const ADMIN_B = 'c0000000-0000-4000-8000-0000000000b1';
const UNIT = 'f0000000-0000-4000-8000-0000000000a1';
const UNIT_B = 'f0000000-0000-4000-8000-0000000000b1';

setIdentityStore(createMemoryIdentityStore({
  app_users: [ADMIN, RECEP, ADMIN_B].map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }, { id: UNIT_B, empresa_id: EB, nome: 'UB', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: E, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: E, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: EB, user_id: ADMIN_B, role: 'admin', status: 'ativo' }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: UNIT }]
}));
const tokens = { 'h.admin.s': ADMIN, 'h.recep.s': RECEP, 'h.adminb.s': ADMIN_B };
setAuthProvider({
  async getUser(t) {
    if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
    return { id: tokens[t] };
  }
});
const db = installMemoryBackend({
  empresas: [{ id: E, nome: 'Salão A', horario_por_dia: {}, slot_padrao: 30 }, { id: EB, nome: 'Salão B', horario_por_dia: {}, slot_padrao: 30 }],
  servicos: [], formas_pagamento: [], profissionais: [], profissional_servicos: [], clientes: [], produtos: [], agendamentos: []
});

let base;
function request(method, path, { token, body } = {}) {
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
const tests = [];
const test = (n, f) => tests.push({ n, f });
const ADM = 'h.admin.s';

test('O01 empresa nova começa na fase 1 e nada concluído', async () => {
  const r = await request('GET', '/api/onboarding/status', { token: ADM });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.data.proximaFase, 'empresa');
  assert.strictEqual(r.data.data.completo, false);
  assert.deepStrictEqual(r.data.data.fases.map(f => f.id), ['empresa', 'horarios', 'pagamentos', 'catalogo', 'equipe', 'simulacao']);
});

test('O02 PATCH /empresa valida campos e horários; nunca aceita id/empresa_id', async () => {
  for (const campo of ['id', 'empresa_id', 'empresaId']) {
    assert.strictEqual(code(await request('PATCH', '/api/empresa', { token: ADM, body: { nome: 'X', [campo]: EB } })), 'FORBIDDEN_FIELD', campo);
  }
  assert.strictEqual(code(await request('PATCH', '/api/empresa', { token: ADM, body: { horarioPorDia: { seg: { ativo: true, inicio: '19:00', fim: '09:00' } } } })), 'INVALID_FIELD');
  assert.strictEqual(code(await request('PATCH', '/api/empresa', { token: ADM, body: { horarioPorDia: { xyz: { ativo: true } } } })), 'INVALID_FIELD');
  assert.strictEqual(code(await request('PATCH', '/api/empresa', { token: ADM, body: { slotPadrao: 7 } })), 'INVALID_FIELD');
  assert.strictEqual(code(await request('PATCH', '/api/empresa', { token: ADM, body: { nome: '  ' } })), 'INVALID_FIELD');
  assert.strictEqual(code(await request('PATCH', '/api/empresa', { token: ADM, body: {} })), 'EMPTY_UPDATE');
});

test('O03 dados + horário concluem as fases 1 e 2 (derivado, sem estado salvo)', async () => {
  const r = await request('PATCH', '/api/empresa', { token: ADM, body: { nome: 'Barbearia do Teste', whatsapp: '11999990000', cidade: 'SP' } });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.data.data.nome, 'Barbearia do Teste');
  const presets = (await request('GET', '/api/onboarding/presets', { token: ADM })).data.data;
  const h = await request('PATCH', '/api/empresa', { token: ADM, body: { horarioPorDia: presets.horarioPadrao, slotPadrao: 15, intervaloAlmoco: true, almocoInicio: '12:00', almocoFim: '13:00' } });
  assert.strictEqual(h.status, 200);
  assert.strictEqual(db.empresas.find(e => e.id === E).slot_padrao, 15);
  const s = (await request('GET', '/api/onboarding/status', { token: ADM })).data.data;
  assert.strictEqual(s.proximaFase, 'pagamentos');
  assert.strictEqual(s.resumo.diasAbertos, 5);
});

test('O04 formas e serviços por preset são idempotentes', async () => {
  const presets = (await request('GET', '/api/onboarding/presets', { token: ADM })).data.data;
  const f1 = await request('POST', '/api/onboarding/formas', { token: ADM, body: { itens: presets.formasPagamento } });
  assert.strictEqual(f1.status, 201); assert.strictEqual(f1.data.data.criadas.length, 4);
  const f2 = await request('POST', '/api/onboarding/formas', { token: ADM, body: { itens: presets.formasPagamento } });
  assert.strictEqual(f2.data.data.criadas.length, 0); assert.strictEqual(f2.data.data.ignoradas.length, 4);
  const barbearia = presets.nichos.find(n => n.id === 'barbearia').servicos;
  const s1 = await request('POST', '/api/onboarding/servicos', { token: ADM, body: { itens: barbearia } });
  assert.strictEqual(s1.data.data.criados.length, NICHOS.barbearia.servicos.length);
  const s2 = await request('POST', '/api/onboarding/servicos', { token: ADM, body: { itens: [{ ...barbearia[0], nome: 'CORTE MASCULINO ' }] } });
  assert.strictEqual(s2.data.data.criados.length, 0, 'nome igual com caixa/espaço diferente não duplica');
  assert.ok(db.servicos.every(s => s.empresa_id === E));
  assert.strictEqual(code(await request('POST', '/api/onboarding/servicos', { token: ADM, body: { itens: [{ nome: 'X', duracaoMin: 2, valorCentavos: 100 }] } })), 'INVALID_FIELD');
  assert.strictEqual(code(await request('POST', '/api/onboarding/servicos', { token: ADM, body: { itens: [] } })), 'ITEMS_REQUIRED');
});

test('O05 equipe com serviço vinculado e ajuste conclui as fases 5 e 6', async () => {
  const prof = await request('POST', '/api/profissionais', { token: ADM, body: { nome: 'Robson', whatsapp: '11988887777', modeloComissao: 'dividido' } });
  assert.strictEqual(prof.status, 201);
  const pid = prof.data.data.id;
  const corte = db.servicos.find(s => s.nome === 'Corte masculino');
  assert.strictEqual((await request('PUT', `/api/profissionais/${pid}/servicos`, { token: ADM, body: { servicoIds: [corte.id] } })).status, 200);
  const ov = await request('PATCH', `/api/profissionais/${pid}/servicos/${corte.id}/override`, { token: ADM, body: { duracaoMin: 45, valorCentavos: 7000, comissaoPct: 60 } });
  assert.strictEqual(ov.status, 200);
  const s = (await request('GET', '/api/onboarding/status', { token: ADM })).data.data;
  assert.strictEqual(s.completo, true); assert.strictEqual(s.proximaFase, null);
});

test('O06 simulação usa /checkout/preview e não grava nada', async () => {
  const antes = JSON.stringify([db.comandos || [], db.agendamentos]);
  const pid = db.profissionais[0].id;
  const corte = db.servicos.find(s => s.nome === 'Corte masculino');
  const r = await request('POST', '/api/checkout/preview', { token: ADM, body: { itens: [{ tipo: 'servico', servicoId: corte.id, profissionalId: pid }], payments: [{ formaCode: 'credito', valorCentavos: 7000 }] } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  const item = r.data.data.itens[0];
  assert.strictEqual(item.valorBrutoCentavos, 7000, 'preço do ajuste do profissional');
  assert.strictEqual(item.duracaoMin, 45);
  assert.strictEqual(item.comissaoPct, 60);
  assert.strictEqual(JSON.stringify([db.comandos || [], db.agendamentos]), antes, 'preview não grava');
});

test('O07 RBAC: recepção não altera empresa nem roda o assistente; lê dados da empresa', async () => {
  assert.strictEqual(code(await request('PATCH', '/api/empresa', { token: 'h.recep.s', body: { nome: 'Hack' } })), 'INSUFFICIENT_ROLE');
  assert.strictEqual(code(await request('GET', '/api/onboarding/status', { token: 'h.recep.s' })), 'INSUFFICIENT_ROLE');
  assert.strictEqual(code(await request('POST', '/api/onboarding/servicos', { token: 'h.recep.s', body: { itens: [{ nome: 'X', duracaoMin: 30, valorCentavos: 1 }] } })), 'INSUFFICIENT_ROLE');
  assert.strictEqual((await request('GET', '/api/empresa', { token: 'h.recep.s' })).status, 200);
  assert.strictEqual((await request('GET', '/api/empresa')).status, 401);
});

test('O08 tenant: admin da empresa B só vê e altera a própria empresa', async () => {
  const r = await request('GET', '/api/onboarding/status', { token: 'h.adminb.s' });
  assert.strictEqual(r.data.data.proximaFase, 'empresa', 'B não herda o progresso de A');
  await request('PATCH', '/api/empresa', { token: 'h.adminb.s', body: { nome: 'Salão B renomeado' } });
  assert.strictEqual(db.empresas.find(e => e.id === E).nome, 'Barbearia do Teste');
  assert.strictEqual(db.empresas.find(e => e.id === EB).nome, 'Salão B renomeado');
});

test('O09 status é função pura: profissional sem serviço não conclui a equipe', () => {
  const s = calcularStatus({
    empresa: { nome: 'X', whatsapp: '1', horario_por_dia: { seg: { ativo: true } } },
    formas: [{ ativo: true }], servicos: [{ ativo: true }], profissionais: [{ id: 'p', ativo: true }], vinculos: []
  });
  assert.strictEqual(s.proximaFase, 'equipe');
  assert.strictEqual(s.fases.find(f => f.id === 'simulacao').concluida, false);
});

(async () => {
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  const origErr = console.error; console.error = () => {};
  let passed = 0; let failed = 0;
  for (const t of tests) {
    try { await t.f(); passed++; process.stdout.write(`✓ ${t.n}\n`); }
    catch (err) { failed++; process.stdout.write(`✗ ${t.n}\n  ${err.message}\n`); }
  }
  console.error = origErr;
  server.close();
  console.log(`\nOnboarding Gate: ${passed}/${tests.length} testes verdes.`);
  if (failed) process.exit(1);
})();

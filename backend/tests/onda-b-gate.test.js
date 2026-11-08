// Onda B Gate (D-009, migration 008): herança de comissão, buffer de
// higienização, dados fiscais, cargos/categorias, régua de faltas e cota-parte.
// HTTP real contra o app; banco e identidade em memória.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-ondab-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { env } = require('../src/config/env');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { resolveComissaoPct } = require('../src/engines/CommissionResolver');
const { computeReguaFaltas } = require('../src/engines/NoShowLadder');
const { computeSlots } = require('../src/engines/SlotEngine');
const { findScheduleConflicts } = require('../src/engines/ScheduleEngine');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

const E = env.DEFAULT_EMPRESA_ID;
const EB = 'e0000000-0000-4000-8000-0000000000bb';
const ADMIN = 'c0000000-0000-4000-8000-0000000000a1';
const RECEP = 'c0000000-0000-4000-8000-0000000000a2';
const UNIT = 'f0000000-0000-4000-8000-0000000000a1';
const PROF = 'a0000000-0000-4000-8000-0000000000a1';
const SERV = 'b0000000-0000-4000-8000-0000000000a1';
const CLI = 'd0000000-0000-4000-8000-0000000000a1';
const CARGO_B = '90000000-0000-4000-8000-0000000000bb';
const dia = { ativo: true, inicio: '09:00', fim: '13:00' };

setIdentityStore(createMemoryIdentityStore({
  app_users: [ADMIN, RECEP].map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: E, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: E, user_id: RECEP, role: 'recepcao', status: 'ativo' }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: UNIT }]
}));
const tokens = { 'h.admin.s': ADMIN, 'h.recep.s': RECEP };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });

const db = installMemoryBackend({
  empresas: [
    { id: E, nome: 'A', whatsapp: '1', slot_padrao: 15, horario_por_dia: { seg: dia, ter: dia }, buffer_min: 0, regua_alerta_faltas: 2, regua_sinal_faltas: 3 },
    { id: EB, nome: 'B', slot_padrao: 30, horario_por_dia: {} }
  ],
  cargos: [{ id: CARGO_B, empresa_id: EB, nome: 'Barbeiro', comissao_pct: 99, modelo_comissao: 'dividido', ativo: true }],
  servico_categorias: [],
  servicos: [{ id: SERV, empresa_id: E, nome: 'Corte', valor_centavos: 10000, duracao_min: 30, comissao_pct: 40, ativo: true, modelo_heranca: 'BY_ROLE' }],
  profissionais: [{ id: PROF, empresa_id: E, nome: 'Robson', ativo: true, modelo_comissao: 'bruto_salao', horario: { seg: dia, ter: dia }, overrides: {} }],
  profissional_servicos: [{ empresa_id: E, profissional_id: PROF, servico_id: SERV }],
  formas_pagamento: [{ empresa_id: E, code: 'pix', label: 'Pix', taxa_pct: 0, taxa_fixa_centavos: 0, dias_recebimento: 0, ativo: true }],
  clientes: [{ id: CLI, empresa_id: E, nome: 'Cliente', ativo: true, faltas: 0 }],
  agendamentos: [], comandos: [], comando_itens: [], produtos: []
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
const preview = () => request('POST', '/api/checkout/preview', { body: { itens: [{ tipo: 'servico', servicoId: SERV, profissionalId: PROF }], payments: [{ formaCode: 'pix', valorCentavos: 10000 }] } });
const tests = [];
const test = (n, f) => tests.push({ n, f });

test('B01 herança: override → cargo/categoria (pelo modelo) → serviço; nunca indefinida', () => {
  const servico = { id: 's', comissao_pct: 40, modelo_heranca: 'BY_ROLE', categoria_id: 'cat' };
  const prof = { cargo_id: 'car' };
  const cargos = [{ id: 'car', comissao_pct: 50, ativo: true }];
  const categorias = [{ id: 'cat', comissao_pct: 55, ativo: true }];
  assert.deepStrictEqual(resolveComissaoPct({ servico, profissional: prof, cargos, categorias }), { pct: 50, origem: 'cargo' });
  assert.deepStrictEqual(resolveComissaoPct({ servico, profissional: prof, override: { comissao_pct: 60 }, cargos }), { pct: 60, origem: 'override_profissional' });
  assert.deepStrictEqual(resolveComissaoPct({ servico: { ...servico, modelo_heranca: 'BY_CATEGORY' }, profissional: prof, cargos, categorias }), { pct: 55, origem: 'categoria' });
  assert.deepStrictEqual(resolveComissaoPct({ servico: { ...servico, modelo_heranca: 'FIXED_SERVICE' }, profissional: prof, cargos, categorias }), { pct: 40, origem: 'servico' });
  assert.deepStrictEqual(resolveComissaoPct({ servico, profissional: {}, cargos }), { pct: 40, origem: 'servico' }, 'sem cargo → serviço');
  assert.deepStrictEqual(resolveComissaoPct({ servico, profissional: prof, cargos: [{ ...cargos[0], ativo: false }] }), { pct: 40, origem: 'servico' }, 'cargo inativo → serviço');
  assert.deepStrictEqual(resolveComissaoPct({ servico: { ...servico, modelo_heranca: 'BY_CATEGORY' }, profissional: prof, categorias: [{ id: 'cat', comissao_pct: null, ativo: true }] }), { pct: 40, origem: 'servico' }, 'categoria sem comissão → serviço');
  assert.deepStrictEqual(resolveComissaoPct({ servico: { id: 'x' }, profissional: {} }), { pct: 0, origem: 'servico' });
});

test('B02 checkout: cargo muda a comissão do serviço BY_ROLE; override continua mandando', async () => {
  assert.strictEqual((await preview()).data.data.itens[0].comissaoPct, 40, 'sem cargo vale o serviço');
  const cargo = await request('POST', '/api/cargos', { body: { nome: 'Barbeiro', comissaoPct: 50, modeloComissao: 'dividido' } });
  assert.strictEqual(cargo.status, 201);
  assert.strictEqual((await request('PATCH', `/api/profissionais/${PROF}`, { body: { cargoId: cargo.data.data.id } })).status, 200);
  let item = (await preview()).data.data.itens[0];
  assert.strictEqual(item.comissaoPct, 50); assert.strictEqual(item.comissaoOrigem, 'cargo');
  assert.strictEqual(item.comissaoCentavos, 5000);
  await request('PATCH', `/api/cargos/${cargo.data.data.id}`, { body: { comissaoPct: 55 } });
  assert.strictEqual((await preview()).data.data.itens[0].comissaoPct, 55, 'mudança no cargo vale na próxima venda');
  await request('PATCH', `/api/profissionais/${PROF}/servicos/${SERV}/override`, { body: { comissaoPct: 60 } });
  item = (await preview()).data.data.itens[0];
  assert.strictEqual(item.comissaoPct, 60); assert.strictEqual(item.comissaoOrigem, 'override_profissional');
  await request('PATCH', `/api/profissionais/${PROF}/servicos/${SERV}/override`, { body: { remover: true } });
});

test('B03 categoria com comissão para serviço BY_CATEGORY', async () => {
  const cat = await request('POST', '/api/categorias', { body: { nome: 'Barba', comissaoPct: 35 } });
  assert.strictEqual(cat.status, 201);
  await request('PATCH', `/api/servicos/${SERV}`, { body: { categoriaId: cat.data.data.id, modeloHeranca: 'BY_CATEGORY' } });
  const item = (await preview()).data.data.itens[0];
  assert.strictEqual(item.comissaoPct, 35); assert.strictEqual(item.comissaoOrigem, 'categoria');
  assert.strictEqual(code(await request('PATCH', `/api/servicos/${SERV}`, { body: { modeloHeranca: 'BY_MOOD' } })), 'INVALID_FIELD');
  await request('PATCH', `/api/servicos/${SERV}`, { body: { modeloHeranca: 'BY_ROLE' } });
});

test('B04 cargos/categorias: nome único sem diferenciar maiúsculas; recepção não cria; isolamento entre empresas', async () => {
  assert.strictEqual(code(await request('POST', '/api/cargos', { body: { nome: 'BARBEIRO ', comissaoPct: 10 } })), 'CARGO_EXISTS');
  assert.strictEqual(code(await request('POST', '/api/categorias', { body: { nome: 'barba' } })), 'CATEGORIA_EXISTS');
  assert.strictEqual(code(await request('POST', '/api/cargos', { token: 'h.recep.s', body: { nome: 'X', comissaoPct: 10 } })), 'INSUFFICIENT_ROLE');
  assert.strictEqual(code(await request('POST', '/api/cargos', { body: { nome: 'Y', comissaoPct: 120 } })), 'INVALID_FIELD');
  const lista = (await request('GET', '/api/cargos')).data.data;
  assert.ok(lista.every(c => c.empresa_id === E), 'não lista cargo da empresa B');
  assert.strictEqual(code(await request('PATCH', `/api/profissionais/${PROF}`, { body: { cargoId: CARGO_B } })), 'CARGO_NOT_FOUND');
  assert.strictEqual(code(await request('PATCH', `/api/cargos/${CARGO_B}`, { body: { comissaoPct: 1 } })), 'CARGO_NOT_FOUND');
  assert.strictEqual(db.cargos.find(c => c.id === CARGO_B).comissao_pct, 99);
});

test('B05 empresa: CNPJ com dígito verificador, buffer 0/5/10/15, régua alerta < sinal (inclusive parcial)', async () => {
  assert.strictEqual(code(await request('PATCH', '/api/empresa', { body: { cnpj: '11.222.333/0001-82' } })), 'INVALID_FIELD');
  const ok = await request('PATCH', '/api/empresa', { body: { cnpj: '11.222.333/0001-81', razaoSocial: 'Salão A LTDA', salaoParceiro: true } });
  assert.strictEqual(ok.status, 200); assert.strictEqual(ok.data.data.cnpj, '11222333000181'); assert.strictEqual(ok.data.data.salao_parceiro, true);
  assert.strictEqual(code(await request('PATCH', '/api/empresa', { body: { bufferMin: 7 } })), 'INVALID_FIELD');
  assert.strictEqual(code(await request('PATCH', '/api/empresa', { body: { reguaSinalFaltas: 2 } })), 'INVALID_FIELD', 'sinal == alerta atual');
  assert.strictEqual((await request('PATCH', '/api/empresa', { body: { reguaAlertaFaltas: 2, reguaSinalFaltas: 4 } })).status, 200);
  assert.strictEqual((await request('PATCH', '/api/empresa', { body: { cnpj: null } })).data.data.cnpj, null);
});

test('B06 buffer: slots e gravação seguem a mesma regra do banco', async () => {
  await request('PATCH', '/api/empresa', { body: { bufferMin: 10 } });
  const data = '2026-12-07'; // segunda
  const ag = await request('POST', '/api/agenda', { body: { servicoId: SERV, profissionalId: PROF, data, horario: '10:00' } });
  assert.strictEqual(ag.status, 201);
  const slots = (await request('GET', `/api/agenda/slots?data=${data}&profissionalId=${PROF}&servicoId=${SERV}`)).data.data;
  assert.strictEqual(slots.bufferMin, 10);
  const horarios = slots.slots.map(s => s.horario);
  assert.ok(!horarios.includes('10:30'), '10:30 cai no buffer');
  assert.ok(!horarios.includes('09:30'), '09:30–10:00 não deixa o buffer antes das 10:00');
  assert.ok(horarios.includes('09:20') && horarios.includes('10:40'), 'bordas exatas com buffer');
  assert.ok(slots.slots.find(s => s.horario === '12:30'), 'último horário encosta no fechamento sem buffer');
  for (const s of slots.slots) {
    assert.strictEqual(findScheduleConflicts({ agendamento: { profissionalId: PROF, data, horario: s.horario, duracaoMin: 30 }, existing: db.agendamentos, bufferMin: 10 }).length, 0, `slot ${s.horario} conflita`);
  }
  assert.strictEqual(code(await request('POST', '/api/agenda', { body: { servicoId: SERV, profissionalId: PROF, data, horario: '10:30' } })), 'SCHEDULE_CONFLICT');
  assert.strictEqual((await request('POST', '/api/agenda', { body: { servicoId: SERV, profissionalId: PROF, data, horario: '10:40' } })).status, 201);
  assert.strictEqual((await request('POST', '/api/agenda', { body: { servicoId: SERV, profissionalId: PROF, data, horario: '10:30', permitirConflito: true } })).status, 201, 'encaixe forçado');
  const semBuffer = computeSlots({ janela: { inicio: 540, fim: 780 }, ocupados: [{ start: 600, end: 630, atendimento: true }], duracaoMin: 30, passoMin: 15, bufferMin: 0 });
  assert.ok(semBuffer.some(s => s.horario === '09:30') && semBuffer.some(s => s.horario === '10:30'), 'buffer 0 mantém o comportamento antigo');
  await request('PATCH', '/api/empresa', { body: { bufferMin: 0 } });
});

test('B07 régua de faltas: só faltas seguidas; atendimento concluído zera; limites da empresa', async () => {
  const ag = (data, status) => ({ data, horario: '10:00', status });
  assert.strictEqual(computeReguaFaltas([], {}).nivel, 'ok');
  assert.strictEqual(computeReguaFaltas([ag('2026-01-01', 'no_show')]).nivel, 'tolerada');
  assert.strictEqual(computeReguaFaltas([ag('2026-01-01', 'no_show'), ag('2026-01-08', 'no_show')]).nivel, 'alerta');
  const tres = [ag('2026-01-01', 'no_show'), ag('2026-01-08', 'no_show'), ag('2026-01-15', 'no_show')];
  assert.strictEqual(computeReguaFaltas(tres).nivel, 'exigir_sinal');
  assert.strictEqual(computeReguaFaltas([...tres, ag('2026-01-22', 'concluido')]).faltasSeguidas, 0, 'concluído zera');
  assert.strictEqual(computeReguaFaltas([...tres, ag('2026-01-22', 'cancelado')]).faltasSeguidas, 3, 'cancelado não conta nem zera');
  assert.strictEqual(computeReguaFaltas([...tres, ag('2099-01-01', 'concluido')], {}, '2026-02-01').faltasSeguidas, 3, 'futuro ignorado');
  assert.strictEqual(computeReguaFaltas(tres, { alerta: 2, sinal: 4 }).nivel, 'alerta');
  db.agendamentos.push(...[['2026-01-05', 'no_show'], ['2026-01-12', 'no_show']].map(([d, s], i) => ({ id: `nf${i}`, empresa_id: E, cliente_id: CLI, profissional_id: PROF, data: d, horario: '10:00', duracao_min: 30, status: s })));
  const r = await request('GET', `/api/insights/clients/${CLI}/reliability`, { token: 'h.recep.s' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.data.regua.nivel, 'alerta'); assert.deepStrictEqual(r.data.data.regua.limites, { alerta: 2, sinal: 4 });
});

test('B08 cota-parte do mês: salão × profissionais a partir do ledger; só gestão', async () => {
  db.comandos.push({ id: 'cm1', empresa_id: E, data: '2026-12-02' }, { id: 'cm2', empresa_id: E, data: '2026-11-30' });
  db.comando_itens.push(
    { id: 'i1', empresa_id: E, comando_id: 'cm1', profissional_id: PROF, valor_liquido_centavos: 10000, comissao_centavos: 5000, receita_empresa_centavos: 4800 },
    { id: 'i2', empresa_id: E, comando_id: 'cm1', profissional_id: null, valor_liquido_centavos: 3000, comissao_centavos: 0, receita_empresa_centavos: 1500 },
    { id: 'i3', empresa_id: E, comando_id: 'cm2', profissional_id: PROF, valor_liquido_centavos: 9999, comissao_centavos: 9999, receita_empresa_centavos: 0 }
  );
  const r = await request('GET', '/api/relatorios/cota-parte?mes=2026-12');
  assert.strictEqual(r.status, 200);
  const d = r.data.data;
  assert.strictEqual(d.comandas, 1);
  assert.strictEqual(d.cotaParteSalaoCentavos, 6300);
  assert.strictEqual(d.cotaParteProfissionaisCentavos, 5000);
  assert.deepStrictEqual(d.profissionais.map(p => [p.nome, p.cotaParteCentavos]), [['Robson', 5000]]);
  assert.strictEqual(d.salaoParceiro, true);
  assert.strictEqual(code(await request('GET', '/api/relatorios/cota-parte?mes=2026-13')), 'INVALID_MONTH');
  assert.strictEqual(code(await request('GET', '/api/relatorios/cota-parte?mes=2026-12', { token: 'h.recep.s' })), 'INSUFFICIENT_ROLE');
});

test('B09 onboarding: cargos idempotentes; serviços de preset criam a categoria uma vez e herdam do cargo', async () => {
  const presets = (await request('GET', '/api/onboarding/presets')).data.data;
  assert.strictEqual(presets.cargos.length, 4);
  const c1 = await request('POST', '/api/onboarding/cargos', { body: { itens: presets.cargos } });
  assert.deepStrictEqual(c1.data.data.ignorados, ['Barbeiro'], 'Barbeiro já existia (B02)');
  const c2 = await request('POST', '/api/onboarding/cargos', { body: { itens: presets.cargos } });
  assert.strictEqual(c2.data.data.criados.length, 0);
  const barbearia = presets.nichos.find(n => n.id === 'barbearia').servicos;
  assert.ok(barbearia.every(s => s.modeloHeranca === 'BY_ROLE'));
  await request('POST', '/api/onboarding/servicos', { body: { itens: barbearia } });
  const doNicho = db.servicos.filter(s => barbearia.some(b => b.nome === s.nome));
  assert.ok(doNicho.every(s => s.modelo_heranca === 'BY_ROLE' && s.categoria_id), 'todos com herança e categoria');
  const nomesCat = db.servico_categorias.filter(c => c.empresa_id === E).map(c => c.nome.toLowerCase());
  assert.strictEqual(new Set(nomesCat).size, nomesCat.length, 'categoria não duplicada (Barba já existia)');
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
  console.log(`\nOnda B Gate: ${passed}/${tests.length} testes verdes.`);
  if (failed) process.exit(1);
})();

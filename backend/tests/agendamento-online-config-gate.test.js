// Agendamento Online por Salão Gate (migration 016, D-037, C1 da auditoria de agendamento).
// HTTP real contra o app; banco e identidade em memória. "Agora" fixo: 2026-11-10 09:00 em
// America/Sao_Paulo (terça). Cobre: slug do banco (liga/desliga, prevalece sobre a env),
// regras por salão, preço/duração pelo override do profissional, "sem preferência", aviso de
// privacidade com o controlador e a rota de configuração do admin. Controles negativos no fim.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-online-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const Module = require('module');
const express = require('express');
const { env } = require('../src/config/env');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { createAppError } = require('../src/errors');
const publico = require('../src/routes/publicBooking');
const { app } = require('../src/app');

const AGORA = new Date('2026-11-10T12:00:00Z');
const HOJE = '2026-11-10';
const AMANHA = '2026-11-11';

const A = env.DEFAULT_EMPRESA_ID;
const B = 'e0000000-0000-4000-8000-0000000000bb';
const C = 'e0000000-0000-4000-8000-0000000000cc';
const CORTE = 'b0000000-0000-4000-8000-0000000000a1';
const BARBA = 'b0000000-0000-4000-8000-0000000000a2';
const ANA = 'a0000000-0000-4000-8000-0000000000a1';
const BETO = 'a0000000-0000-4000-8000-0000000000a2';
const SERV_B = 'b0000000-0000-4000-8000-0000000000b1';
const PROF_B = 'a0000000-0000-4000-8000-0000000000b1';
const ADMIN = 'c0000000-0000-4000-8000-0000000000a1';
const RECEP = 'c0000000-0000-4000-8000-0000000000a2';
const ADMIN_B = 'c0000000-0000-4000-8000-0000000000b1';

const dia = { ativo: true, inicio: '09:00', fim: '18:00' };
const semana = { dom: dia, seg: dia, ter: dia, qua: dia, qui: dia, sex: dia, sab: dia };
const ONLINE_A = {
  online_slug: 'salao-alfa', online_ativo: true, online_antecedencia_min: 120, online_janela_dias: 30,
  online_cancelamento_prazo_min: 240, online_max_futuros: 2, online_mostrar_preco: true,
  razao_social: 'Alfa Beleza Ltda', cnpj: '11222333000181', privacidade_contato: 'privacidade@alfa.test'
};

setIdentityStore(createMemoryIdentityStore({
  app_users: [ADMIN, RECEP, ADMIN_B].map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [],
  empresa_memberships: [
    { id: 'm1', empresa_id: A, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: A, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: B, user_id: ADMIN_B, role: 'admin', status: 'ativo' }
  ],
  membership_units: []
}));
const tokens = { 'h.admin.s': ADMIN, 'h.recep.s': RECEP, 'h.adminb.s': ADMIN_B };
setAuthProvider({
  async getUser(t) {
    if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401);
    return { id: tokens[t] };
  }
});

const db = installMemoryBackend({
  empresas: [
    { id: A, nome: 'Salão Alfa', horario_por_dia: semana, slot_padrao: 30, buffer_min: 0, regua_alerta_faltas: 2, regua_sinal_faltas: 3, ...ONLINE_A },
    { id: B, nome: 'Salão Beta', horario_por_dia: semana, slot_padrao: 30, buffer_min: 0, online_slug: 'salao-beta', online_ativo: false, razao_social: 'Beta ME', privacidade_contato: '11 90000-0000' },
    { id: C, nome: 'Salão Gama', horario_por_dia: semana, slot_padrao: 30, buffer_min: 0 }
  ],
  servicos: [
    { id: CORTE, empresa_id: A, nome: 'Corte', valor_centavos: 5000, duracao_min: 30, ativo: true },
    { id: BARBA, empresa_id: A, nome: 'Barba', valor_centavos: 3000, duracao_min: 30, ativo: true },
    { id: SERV_B, empresa_id: B, nome: 'Escova Beta', valor_centavos: 7000, duracao_min: 60, ativo: true }
  ],
  profissionais: [
    // Ana cobra mais e leva mais tempo no corte (override por serviço).
    { id: ANA, empresa_id: A, nome: 'Ana Paula Souza', ativo: true, horario: semana, overrides: { [CORTE]: { valor_centavos: 8000, duracao_min: 60 } } },
    { id: BETO, empresa_id: A, nome: 'Beto Lima', ativo: true, horario: semana, overrides: {} },
    { id: PROF_B, empresa_id: B, nome: 'Bruna Beta', ativo: true, horario: semana, overrides: {} }
  ],
  profissional_servicos: [
    { empresa_id: A, profissional_id: ANA, servico_id: CORTE },
    { empresa_id: A, profissional_id: BETO, servico_id: CORTE },
    { empresa_id: A, profissional_id: BETO, servico_id: BARBA },
    { empresa_id: B, profissional_id: PROF_B, servico_id: SERV_B }
  ],
  clientes: [],
  agendamentos: [
    // Ana já tem dois horários amanhã; Beto, nenhum: "sem preferência" escolhe o Beto.
    { id: '90000000-0000-4000-8000-0000000000e1', empresa_id: A, cliente_id: null, servico_id: CORTE, profissional_id: ANA, data: AMANHA, horario: '15:00:00', duracao_min: 30, status: 'agendado' },
    { id: '90000000-0000-4000-8000-0000000000e2', empresa_id: A, cliente_id: null, servico_id: CORTE, profissional_id: ANA, data: AMANHA, horario: '16:00:00', duracao_min: 30, status: 'agendado' },
    // Beto ocupado amanhã às 09:00: nesse horário só a Ana atende.
    { id: '90000000-0000-4000-8000-0000000000e3', empresa_id: A, cliente_id: null, servico_id: CORTE, profissional_id: BETO, data: AMANHA, horario: '09:00:00', duracao_min: 30, status: 'agendado' }
  ],
  agendamento_eventos: [], comandos: [], comando_itens: [], produtos: [], formas_pagamento: []
});

publico.setRelogioParaTestes(() => AGORA);
Object.assign(env, {
  PUBLIC_BOOKING_LINKS: '',
  PUBLIC_BOOKING_RATE_GET_MAX: 1000, PUBLIC_BOOKING_RATE_POST_IP_MAX: 1000, PUBLIC_BOOKING_RATE_POST_NUMERO_MAX: 1000,
  PUBLIC_BOOKING_TETO_DIARIO: 1000, PUBLIC_BOOKING_MAX_FUTUROS_POR_NUMERO: 9, PUBLIC_BOOKING_ANTECEDENCIA_MIN: 0, PUBLIC_BOOKING_JANELA_DIAS: 90
});

let base;
function request(method, urlPath, { body, token, raw, baseUrl } = {}) {
  return new Promise((resolve, reject) => {
    const payload = raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : null;
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    if (payload !== null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(payload); }
    const req = http.request((baseUrl || base) + urlPath, { method, headers }, res => {
      let txt = ''; res.on('data', c => { txt += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(txt); } catch (_) {} resolve({ status: res.statusCode, data, raw: txt }); });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;
const empresa = id => db.empresas.find(e => e.id === id);
const pedido = extra => ({ servicoId: CORTE, profissionalId: BETO, data: AMANHA, horario: '11:00', nome: 'Maria Nova', whatsapp: '(21) 99999-0001', consentimento: true, website: '', ...extra });
const post = (body, slug = 'salao-alfa', baseUrl) => request('POST', `/api/public/agendar/${slug}`, { body, baseUrl });
const slots = (prof, data = AMANHA, serv = CORTE, slug = 'salao-alfa', baseUrl) =>
  request('GET', `/api/public/agendar/${slug}/slots?servicoId=${serv}&profissionalId=${prof}&data=${data}`, { baseUrl });
const reset = () => { publico.limparCacheSlug(); publico.resetRateLimitPublico(); };

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('O01 slug do banco: ligado abre sem env; desligado e inexistente = 404 idêntico; nada é lido do corpo antes', async () => {
  reset();
  const r = await request('GET', '/api/public/agendar/salao-alfa');
  assert.strictEqual(r.status, 200, r.raw);
  const inexistente = await request('GET', '/api/public/agendar/salao-zeta');
  const desligado = await request('GET', '/api/public/agendar/salao-beta');
  assert.strictEqual(inexistente.status, 404); assert.strictEqual(desligado.status, 404);
  assert.strictEqual(desligado.raw, inexistente.raw, 'desligado não se distingue de inexistente');
  // Corpo malformado: salão ligado → 400 do parser; desligado/inexistente → 404 antes do parser.
  assert.strictEqual((await request('POST', '/api/public/agendar/salao-alfa', { raw: '{' })).status, 400);
  assert.strictEqual((await request('POST', '/api/public/agendar/salao-beta', { raw: '{' })).status, 404);
  assert.strictEqual((await request('POST', '/api/public/agendar/salao-zeta', { raw: '{' })).status, 404);
});

test('O02 banco prevalece sobre a env: slug desligado no banco fica 404 mesmo no mapa; env só vale para slug fora do banco', async () => {
  reset();
  env.PUBLIC_BOOKING_LINKS = JSON.stringify({ 'salao-beta': B, 'salao-gama': C });
  try {
    assert.strictEqual((await request('GET', '/api/public/agendar/salao-beta')).status, 404, 'banco desligado vence a env');
    assert.strictEqual((await request('GET', '/api/public/agendar/salao-gama')).status, 200, 'fora do banco: mapa da env');
  } finally { env.PUBLIC_BOOKING_LINKS = ''; reset(); }
  assert.strictEqual((await request('GET', '/api/public/agendar/salao-gama')).status, 404);
});

test('O03 regras do salão vêm da linha da empresa (não da env): antecedência, janela, prazo de cancelamento', async () => {
  reset();
  const d = (await request('GET', '/api/public/agendar/salao-alfa')).data.data;
  assert.deepStrictEqual(d.regras, { hoje: HOJE, primeiroDia: HOJE, ultimoDia: '2026-12-10', antecedenciaMin: 120, janelaDias: 30, cancelamentoPrazoMin: 240 });
  const hoje = (await slots(BETO, HOJE)).data.data.slots;
  assert.strictEqual(hoje[0], '11:00', '09:00 + 120 min do salão (a env diz 0)');
  Object.assign(empresa(A), { online_antecedencia_min: 0, online_janela_dias: 1 });
  try {
    const d2 = (await request('GET', '/api/public/agendar/salao-alfa')).data.data.regras;
    assert.strictEqual(d2.ultimoDia, AMANHA); assert.strictEqual(d2.antecedenciaMin, 0);
    assert.strictEqual((await slots(BETO, HOJE)).data.data.slots[0], '09:00');
    assert.deepStrictEqual((await slots(BETO, '2026-11-12')).data.data.slots, [], 'fora da janela de 1 dia');
  } finally { Object.assign(empresa(A), { online_antecedencia_min: 120, online_janela_dias: 30 }); }
});

test('O04 preço e duração pelo override do profissional; serviço mostra a faixa; agendamento grava o preço de quem atende', async () => {
  reset();
  const d = (await request('GET', '/api/public/agendar/salao-alfa')).data.data;
  const corte = d.servicos.find(s => s.id === CORTE);
  assert.deepStrictEqual(corte.profissionais, [
    { id: ANA, nome: 'Ana', duracaoMin: 60, precoCentavos: 8000 },
    { id: BETO, nome: 'Beto', duracaoMin: 30, precoCentavos: 5000 }
  ]);
  assert.deepStrictEqual([corte.precoCentavos, corte.precoMaxCentavos, corte.duracaoMin, corte.duracaoMaxMin, corte.semPreferencia], [5000, 8000, 30, 60, true]);
  assert.strictEqual(d.servicos.find(s => s.id === BARBA).semPreferencia, false, 'um profissional só: sem a opção');
  assert.strictEqual((await slots(ANA)).data.data.duracaoMin, 60);
  const r = await post(pedido({ profissionalId: ANA, horario: '12:00', whatsapp: '21 98888-0004' }));
  assert.strictEqual(r.status, 201, r.raw);
  const ag = db.agendamentos[db.agendamentos.length - 1];
  assert.strictEqual(ag.valor_centavos, 8000, 'preço da Ana, não o do serviço');
  assert.strictEqual(ag.duracao_min, 60);
});

test('O05 mostrar preço desligado: nenhum preço sai na resposta', async () => {
  reset();
  empresa(A).online_mostrar_preco = false;
  try {
    const d = (await request('GET', '/api/public/agendar/salao-alfa')).data.data;
    for (const s of d.servicos) {
      assert.strictEqual(s.precoCentavos, null); assert.strictEqual(s.precoMaxCentavos, null);
      assert.ok(s.profissionais.every(p => p.precoCentavos === null));
    }
  } finally { empresa(A).online_mostrar_preco = true; }
});

test('O06 sem preferência: horários de qualquer profissional; grava com o de agenda mais leve que tem o horário', async () => {
  reset();
  const r = await slots('qualquer');
  assert.strictEqual(r.status, 200, r.raw);
  const s = r.data.data.slots;
  assert.ok(s.includes('09:00'), '09:00 só a Ana tem (Beto ocupado), mas aparece');
  const beto = (await slots(BETO)).data.data.slots;
  assert.ok(!beto.includes('09:00'));
  const r1 = await post(pedido({ profissionalId: 'qualquer', horario: '10:00', whatsapp: '21 98888-0001' }));
  assert.strictEqual(r1.status, 201, r1.raw);
  assert.strictEqual(r1.data.data.profissional, 'Beto', 'Beto tem a agenda mais leve amanhã');
  const ag1 = db.agendamentos[db.agendamentos.length - 1];
  assert.strictEqual(ag1.profissional_id, BETO); assert.strictEqual(ag1.valor_centavos, 5000);
  const ev = db.agendamento_eventos[db.agendamento_eventos.length - 1];
  assert.strictEqual(ev.payload.profissional_escolhido_por, 'sistema');
  const r2 = await post(pedido({ profissionalId: 'qualquer', horario: '09:00', whatsapp: '21 98888-0002' }));
  assert.strictEqual(r2.status, 201, r2.raw);
  assert.strictEqual(db.agendamentos[db.agendamentos.length - 1].profissional_id, ANA, 'às 09:00 só a Ana tem livre');
  assert.strictEqual(db.agendamentos[db.agendamentos.length - 1].duracao_min, 60, 'duração de quem atende');
  const r3 = await post(pedido({ profissionalId: 'qualquer', horario: '23:00', whatsapp: '21 98888-0003' }));
  assert.strictEqual(r3.status, 422); assert.strictEqual(code(r3), 'HORARIO_INDISPONIVEL');
  for (const ruim of ['QUALQUER-1', 'todos', '']) {
    assert.strictEqual(code(await slots(encodeURIComponent(ruim))), 'DADOS_INVALIDOS', ruim);
  }
});

test('O07 limite de horários futuros por número é o do salão (2), não o da env (9)', async () => {
  reset();
  const tel = '21 97777-0001';
  assert.strictEqual((await post(pedido({ horario: '13:00', whatsapp: tel }))).status, 201);
  assert.strictEqual((await post(pedido({ horario: '13:30', whatsapp: tel }))).status, 201);
  const r = await post(pedido({ horario: '14:00', whatsapp: tel }));
  assert.strictEqual(r.status, 422); assert.strictEqual(code(r), 'AGENDAMENTO_ONLINE_INDISPONIVEL');
});

test('O08 aviso de privacidade identifica o controlador do salão; o evento guarda versão e hash do texto visto', async () => {
  reset();
  const d = (await request('GET', '/api/public/agendar/salao-alfa')).data.data;
  assert.deepStrictEqual(d.aviso.controlador, { nome: 'Alfa Beleza Ltda', cnpj: '11.222.333/0001-81', contato: 'privacidade@alfa.test' });
  assert.strictEqual(d.aviso.versao, env.PUBLIC_BOOKING_AVISO_VERSAO);
  assert.strictEqual((await post(pedido({ horario: '15:30', whatsapp: '21 96666-0001' }))).status, 201);
  const ev = db.agendamento_eventos[db.agendamento_eventos.length - 1];
  assert.match(ev.payload.aviso_hash, /^[0-9a-f]{16}$/);
  assert.strictEqual(ev.payload.fonte_link, 'banco');
  assert.strictEqual(ev.payload.profissional_escolhido_por, 'cliente');
  const hashAntes = ev.payload.aviso_hash;
  empresa(A).privacidade_contato = 'outro@alfa.test';
  try {
    assert.strictEqual((await post(pedido({ horario: '16:30', whatsapp: '21 96666-0002' }))).status, 201);
    assert.notStrictEqual(db.agendamento_eventos[db.agendamento_eventos.length - 1].payload.aviso_hash, hashAntes, 'texto mudou → hash muda');
  } finally { empresa(A).privacidade_contato = ONLINE_A.privacidade_contato; }
});

test('O09 config do admin: lê, valida faixas, exige requisitos para ligar, recusa slug de outro salão', async () => {
  reset();
  const g = await request('GET', '/api/empresa/agendamento-online', { token: 'h.admin.s' });
  assert.strictEqual(g.status, 200, g.raw);
  assert.strictEqual(g.data.data.slug, 'salao-alfa'); assert.strictEqual(g.data.data.ativo, true); assert.deepStrictEqual(g.data.data.pendencias, []);
  assert.strictEqual((await request('GET', '/api/empresa/agendamento-online', { token: 'h.recep.s' })).status, 403, 'recepção não configura');
  const patch = (body, token = 'h.admin.s') => request('PATCH', '/api/empresa/agendamento-online', { body, token });
  for (const ruim of [{ antecedenciaMin: -1 }, { janelaDias: 0 }, { janelaDias: 181 }, { maxFuturos: 11 }, { cancelamentoPrazoMin: 1.5 },
    { slug: 'Salão Alfa' }, { slug: '-ab' }, { ativo: 'sim' }, { privacidadeContato: 'x' }, { empresaId: B }, { online_ativo: true }]) {
    const r = await patch(ruim);
    assert.strictEqual(r.status, 422, JSON.stringify(ruim));
  }
  // Ligar sem contato de privacidade: recusa com a lista do que falta; nada muda.
  const rb = await patch({ ativo: true }, 'h.adminb.s');
  assert.strictEqual(rb.status, 200, 'B tem tudo preenchido');
  empresa(B).online_ativo = false;
  empresa(B).privacidade_contato = null;
  const rf = await patch({ ativo: true }, 'h.adminb.s');
  assert.strictEqual(rf.status, 422); assert.strictEqual(code(rf), 'REQUISITOS_PENDENTES');
  assert.deepStrictEqual(rf.data.error.details.faltam, ['privacidadeContato']);
  assert.strictEqual(empresa(B).online_ativo, false);
  // Slug de outro salão (no banco ou no mapa da env) é recusado.
  const dup = await patch({ slug: 'salao-alfa' }, 'h.adminb.s');
  assert.strictEqual(dup.status, 409); assert.strictEqual(code(dup), 'SLUG_EM_USO');
  env.PUBLIC_BOOKING_LINKS = JSON.stringify({ 'salao-env': C });
  try {
    const envDup = await patch({ slug: 'salao-env' }, 'h.adminb.s');
    assert.strictEqual(envDup.status, 409); assert.strictEqual(code(envDup), 'SLUG_EM_USO');
  } finally { env.PUBLIC_BOOKING_LINKS = ''; }
  // Ajuste válido: grava e o link público reflete na hora (cache limpo).
  const ok = await patch({ janelaDias: 7, maxFuturos: 3, mostrarPreco: false });
  assert.strictEqual(ok.status, 200, ok.raw);
  assert.deepStrictEqual([empresa(A).online_janela_dias, empresa(A).online_max_futuros, empresa(A).online_mostrar_preco], [7, 3, false]);
  assert.strictEqual((await request('GET', '/api/public/agendar/salao-alfa')).data.data.regras.janelaDias, 7);
  const off = await patch({ ativo: false });
  assert.strictEqual(off.status, 200);
  assert.strictEqual((await request('GET', '/api/public/agendar/salao-alfa')).status, 404, 'desligar vale na hora nesta instância');
  Object.assign(empresa(A), ONLINE_A);
  reset();
});

test('O10 linha sem as colunas da 016: a config diz se está disponível e o link segue pelo mapa da env', async () => {
  reset();
  const backup = { ...empresa(C) };
  const g = await request('GET', '/api/empresa/agendamento-online', { token: 'h.adminb.s' });
  assert.strictEqual(g.data.data.disponivel, true, 'B tem as colunas');
  // C não tem as colunas da 016 (simula banco sem a migration): o mapa da env continua valendo.
  env.PUBLIC_BOOKING_LINKS = JSON.stringify({ 'salao-gama': C });
  try {
    assert.strictEqual((await request('GET', '/api/public/agendar/salao-gama')).status, 200);
  } finally { env.PUBLIC_BOOKING_LINKS = ''; Object.assign(empresa(C), backup); reset(); }
});

// --- Controles negativos ----------------------------------------------------
function routerMutante(trocas) {
  const arquivo = path.join(__dirname, '../src/routes/publicBooking.js');
  let src = fs.readFileSync(arquivo, 'utf8');
  for (const [de, para] of trocas) {
    assert.ok(src.includes(de), `trecho para o mutante não encontrado: ${de}`);
    src = src.split(de).join(para);
  }
  const m = new Module(arquivo, module);
  m.filename = arquivo;
  m.paths = Module._nodeModulePaths(path.dirname(arquivo));
  m._compile(src, arquivo);
  m.exports.setRelogioParaTestes(() => AGORA);
  const mini = express();
  mini.set('trust proxy', 1);
  mini.use('/api/public', m.exports.publicBookingRouter);
  return mini;
}
async function comServidor(appMutante, fn) {
  const srv = appMutante.listen(0);
  try { return await fn(`http://127.0.0.1:${srv.address().port}`); } finally { srv.close(); }
}

test('O11 regras da agenda (D-049): antecedência própria do serviço e intervalo mínimo no mesmo serviço', async () => {
  reset();
  const corte = db.servicos.find(x => x.id === CORTE);
  const hoje = async () => (await slots(BETO, HOJE)).data.data.slots;
  const antes = await hoje(); // antecedência do salão (2 h): a partir das 11:00
  corte.antecedencia_min_online = 420; // 7 h só para o Corte
  const depois = await hoje();
  delete corte.antecedencia_min_online;
  assert.ok(antes.includes('11:00') && !depois.includes('11:00') && depois.every(h => h >= '16:00'), `${antes} | ${depois}`);
  const emp = empresa(A); emp.agenda_intervalo_min_dias = 7;
  const tel = '21 95432-0099';
  try {
    const primeiro = await post(pedido({ horario: '15:00', whatsapp: tel }));
    assert.strictEqual(primeiro.status, 201, primeiro.raw);
    const perto = await post(pedido({ data: '2026-11-14', horario: '15:00', whatsapp: tel }));
    assert.deepStrictEqual([perto.status, code(perto)], [422, 'AGENDAMENTO_ONLINE_INDISPONIVEL'], 'mesmo serviço a 3 dias: recusa sem dizer a data do outro');
    assert.ok(!/11\/11|2026-11-11/.test(perto.raw), 'não revela o outro horário');
    const outro = await post(pedido({ data: '2026-11-14', horario: '15:00', whatsapp: tel, servicoId: BARBA, profissionalId: ANA }));
    assert.notStrictEqual(code(outro), 'AGENDAMENTO_ONLINE_INDISPONIVEL', 'outro serviço não entra no intervalo');
  } finally { delete emp.agenda_intervalo_min_dias; }
});

test('O12 grade online segue duração, exclui borda fora da sequência e protege a oferta revisada', async () => {
  reset();
  const data = '2026-11-25';
  const servico = db.servicos.find(s => s.id === CORTE);
  const duracaoAnterior = servico.duracao_min;
  const precoAnterior = servico.valor_centavos;
  try {
    servico.duracao_min = 15;
    const curta = (await slots(BETO, data)).data.data;
    assert.deepStrictEqual(curta.slots.slice(0, 4), ['09:00', '09:15', '09:30', '09:45']);
    servico.duracao_min = 45;
    const longa = (await slots(BETO, data)).data.data;
    assert.deepStrictEqual(longa.slots.slice(0, 4), ['09:00', '09:45', '10:30', '11:15']);
    const oferta = longa.ofertas[0];
    assert.strictEqual(oferta.fim, '09:45');
    assert.strictEqual(oferta.profissional, 'Beto');
    servico.valor_centavos += 100;
    const body = pedido({ data, horario: oferta.horario, versaoOferta: oferta.versaoOferta });
    const mudou = await post(body);
    assert.strictEqual(code(mudou), 'OFERTA_ALTERADA');
    const atual = (await slots(BETO, data)).data.data.ofertas[0];
    const aceita = await post({ ...body, versaoOferta: atual.versaoOferta });
    assert.strictEqual(aceita.status, 201, aceita.raw);
  } finally {
    servico.duracao_min = duracaoAnterior;
    servico.valor_centavos = precoAnterior;
  }
});

test('NC1 controle negativo: sem checar o liga/desliga do banco, o salão desligado (O01) abre', async () => {
  await comServidor(routerMutante([['if (!doBanco.ativo) throw naoEncontrado();', '']]), async url => {
    const r = await request('GET', '/api/public/agendar/salao-beta', { baseUrl: url });
    assert.strictEqual(r.status, 200, `o mutante deveria abrir (prova que O01 detecta): ${r.raw}`);
  });
});

test('NC2 controle negativo: com o limite da env no lugar do salão, o 3º horário do O07 passa', async () => {
  await comServidor(routerMutante([['futuros.length >= cat.cfg.maxFuturos', 'futuros.length >= num(env.PUBLIC_BOOKING_MAX_FUTUROS_POR_NUMERO, 2)']]), async url => {
    const tel = '21 97777-0009';
    assert.strictEqual((await post(pedido({ horario: '17:00', whatsapp: tel }), 'salao-alfa', url)).status, 201);
    assert.strictEqual((await post(pedido({ horario: '17:30', whatsapp: tel }), 'salao-alfa', url)).status, 201);
    const r = await post(pedido({ data: '2026-11-12', horario: '10:00', whatsapp: tel }), 'salao-alfa', url);
    assert.strictEqual(r.status, 201, `o mutante deveria aceitar (prova que O07 detecta): ${r.raw}`);
  });
});

test('NC3 controle negativo: com o preço do serviço no lugar do override, o O04 pegaria 5000 em vez de 8000', async () => {
  await comServidor(routerMutante([['valor_centavos: precoDe(servico, profissional),', 'valor_centavos: servico.valor_centavos || 0,']]), async url => {
    const r = await post(pedido({ profissionalId: ANA, data: '2026-11-12', horario: '12:00', whatsapp: '21 95555-0001' }), 'salao-alfa', url);
    assert.strictEqual(r.status, 201, r.raw);
    assert.strictEqual(db.agendamentos[db.agendamentos.length - 1].valor_centavos, 5000, 'o mutante grava o preço errado');
  });
});

(async () => {
  const origErr = console.error; const origWarn = console.warn;
  console.error = () => {}; console.warn = () => {};
  const server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); ok++; process.stdout.write(`✓ ${n}\n`); } catch (err) { process.stdout.write(`✗ ${n}\n   ${err.message}\n`); }
  }
  server.close();
  console.error = origErr; console.warn = origWarn;
  console.log(`\nAgendamento Online por Salão Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();

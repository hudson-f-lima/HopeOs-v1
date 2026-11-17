// Política de sugestão e lista de espera compatível (D-054, migration 025). Motor puro e rotas
// (HTTP real contra o app; banco e identidade em memória). "Agora": 2026-11-10 09:00 em São Paulo.
// Cenário de 2026-11-11 (quarta), Ana 09:00–18:00, grade de 15 min, Corte 30 min:
// ocupados 09:00–09:30 e 10:00–10:30 → livres 09:30–10:00 e 10:30–18:00.
//   - sem política: recepção sugere os encaixes ideais; link mostra todos (como antes);
//   - compacta: só ideais (09:30, 10:30, 17:30); equilibrada: tira 10:45 e 17:15 (sobra de 15 min,
//     menor que o menor serviço); flexível: todos; a recepção sempre recebe todos os livres;
//   - link: oferece só o da política e RECUSA gravar fora dela;
//   - configuração: PATCH /empresa aceita as três e null; recusa outro valor;
//   - espera: profissional, dia, faixa, serviço que cabe e que o profissional faz; ordem;
//     não muda nada ao consultar; agendar com listaEsperaId marca "agendado" (mesmo cliente);
//   - faixa: as duas pontas ou nenhuma; RBAC: profissional sem espera:ver recebe 403.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-politica-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { env } = require('../src/config/env');
const clock = require('../src/config/clock');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { createAppError } = require('../src/errors');
const publico = require('../src/routes/publicBooking');
const S = require('../src/engines/SlotEngine');
const E = require('../src/engines/ListaEsperaEngine');
const { app } = require('../src/app');

const AGORA = new Date('2026-11-10T12:00:00Z');
const DIA = '2026-11-11';
const A = env.DEFAULT_EMPRESA_ID;
const CORTE = 'b0000000-0000-4000-8000-0000000000a1';
const QUIMICA = 'b0000000-0000-4000-8000-0000000000a2';
const MANICURE = 'b0000000-0000-4000-8000-0000000000a3';
const ANA = 'a0000000-0000-4000-8000-0000000000a1';
const BETO = 'a0000000-0000-4000-8000-0000000000a2';
const CLI = ['d0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-0000000000a2', 'd0000000-0000-4000-8000-0000000000a3',
  'd0000000-0000-4000-8000-0000000000a4', 'd0000000-0000-4000-8000-0000000000a5', 'd0000000-0000-4000-8000-0000000000a6'];
const UNIT = 'f0000000-0000-4000-8000-0000000000a1';
const ADMIN = 'c0000000-0000-4000-8000-0000000000a1';
const RECEP = 'c0000000-0000-4000-8000-0000000000a2';
const PROF = 'c0000000-0000-4000-8000-0000000000a3';
const W = n => `e0000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

const dia = { ativo: true, inicio: '09:00', fim: '18:00' };
const semana = { dom: dia, seg: dia, ter: dia, qua: dia, qui: dia, sex: dia, sab: dia };
setIdentityStore(createMemoryIdentityStore({
  app_users: [ADMIN, RECEP, PROF].map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: A, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: A, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: A, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: A, user_id: PROF, role: 'profissional', status: 'ativo', profissional_id: ANA }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: UNIT }]
}));
const tokens = { 'h.admin.s': ADMIN, 'h.recep.s': RECEP, 'h.prof.s': PROF };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });

const espera = (n, extra) => ({ id: W(n), empresa_id: A, cliente_id: CLI[n - 1], servico_id: CORTE, profissional_id: null, data_preferencia: null, status: 'aguardando', created_at: `2026-11-0${n}T10:00:00Z`, ...extra });
const db = installMemoryBackend({
  empresas: [{ id: A, nome: 'Salão', horario_por_dia: semana, slot_padrao: 15, buffer_min: 0, online_slug: 'salao-p', online_ativo: true,
    online_antecedencia_min: 0, online_janela_dias: 30, online_cancelamento_prazo_min: 120, online_max_futuros: 5, razao_social: 'P Ltda', cnpj: '11222333000181', privacidade_contato: 'p@t' }],
  servicos: [
    { id: CORTE, empresa_id: A, nome: 'Corte', valor_centavos: 5000, duracao_min: 30, ativo: true, online: true },
    { id: QUIMICA, empresa_id: A, nome: 'Química', valor_centavos: 20000, duracao_min: 60, ativo: true },
    { id: MANICURE, empresa_id: A, nome: 'Manicure', valor_centavos: 4000, duracao_min: 30, ativo: true }
  ],
  profissionais: [{ id: ANA, empresa_id: A, nome: 'Ana', ativo: true, horario: semana, overrides: {} }, { id: BETO, empresa_id: A, nome: 'Beto', ativo: true, horario: semana, overrides: {} }],
  profissional_servicos: [{ empresa_id: A, profissional_id: ANA, servico_id: CORTE }, { empresa_id: A, profissional_id: ANA, servico_id: QUIMICA },
    { empresa_id: A, profissional_id: BETO, servico_id: CORTE }, { empresa_id: A, profissional_id: BETO, servico_id: MANICURE }],
  clientes: CLI.map((id, i) => ({ id, empresa_id: A, nome: `Cliente ${i + 1}`, ativo: true })),
  agendamentos: [
    { id: '90000000-0000-4000-8000-0000000000a1', empresa_id: A, cliente_id: CLI[5], servico_id: CORTE, profissional_id: ANA, data: DIA, horario: '09:00:00', duracao_min: 30, status: 'agendado' },
    { id: '90000000-0000-4000-8000-0000000000a2', empresa_id: A, cliente_id: CLI[5], servico_id: CORTE, profissional_id: ANA, data: DIA, horario: '10:00:00', duracao_min: 30, status: 'agendado' }
  ],
  agendamento_eventos: [],
  lista_espera: [
    espera(1),                                                              // qualquer dia, qualquer profissional
    espera(2, { profissional_id: ANA, data_preferencia: DIA }),             // pediu Ana neste dia
    espera(3, { profissional_id: BETO }),                                   // pediu outro profissional
    espera(4, { faixa_inicio: '14:00:00', faixa_fim: '18:00:00' }),         // só à tarde
    espera(5, { servico_id: QUIMICA }),                                     // 60 min: não cabe 09:30–10:00
    espera(6, { servico_id: MANICURE, status: 'aguardando' })               // Ana não faz manicure
  ],
  comandos: [], comando_itens: [], produtos: [], formas_pagamento: []
});
clock.definirRelogio(() => AGORA);
publico.setRelogioParaTestes(() => AGORA);
Object.assign(env, { PUBLIC_BOOKING_LINKS: '', PUBLIC_BOOKING_RATE_GET_MAX: 1000, PUBLIC_BOOKING_RATE_POST_IP_MAX: 1000, PUBLIC_BOOKING_RATE_POST_NUMERO_MAX: 1000, PUBLIC_BOOKING_TETO_DIARIO: 1000 });

let base;
function request(method, urlPath, { body, token = 'h.recep.s' } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    if (payload !== null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(payload); }
    const req = http.request(base + urlPath, { method, headers }, res => {
      let txt = ''; res.on('data', c => { txt += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(txt); } catch (_) {} resolve({ status: res.statusCode, data, raw: txt }); });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;
const tests = [];
const test = (n, f) => tests.push({ n, f });
const politica = p => { db.empresas[0].agenda_politica = p; };
const slotsRecep = async () => (await request('GET', `/api/agenda/slots?data=${DIA}&profissionalId=${ANA}&servicoId=${CORTE}`)).data.data;
const slotsLink = async () => (await request('GET', `/api/public/agendar/salao-p/slots?servicoId=${CORTE}&profissionalId=${ANA}&data=${DIA}`, { token: null })).data.data.slots;
const sugeridos = r => r.slots.filter(s => s.sugerido).map(s => s.horario);

// ---------- Motor ----------
test('PE01 motor: compacta = ideais; equilibrada tira sobra inútil; flexível = todos; padrão por canal', () => {
  const slots = [
    { horario: '09:30', recomendado: true, desperdicioMin: 0 }, { horario: '10:30', recomendado: true, desperdicioMin: 0 },
    { horario: '10:45', recomendado: false, desperdicioMin: 15 }, { horario: '11:00', recomendado: false, desperdicioMin: 0 }
  ];
  const on = (p, c) => S.aplicarPolitica(slots, p, c).filter(s => c === 'online' || s.sugerido).map(s => s.horario);
  assert.deepStrictEqual(on('compacta', 'online'), ['09:30', '10:30']);
  assert.deepStrictEqual(on('equilibrada', 'online'), ['09:30', '10:30', '11:00']);
  assert.deepStrictEqual(on('flexivel', 'online'), ['09:30', '10:30', '10:45', '11:00']);
  assert.deepStrictEqual(on(null, 'online'), ['09:30', '10:30', '10:45', '11:00'], 'sem política o link mostra todos (como antes)');
  assert.deepStrictEqual(on(null, 'recepcao'), ['09:30', '10:30'], 'sem política a recepção sugere os ideais (como antes)');
  assert.strictEqual(S.aplicarPolitica(slots, 'compacta', 'recepcao').length, 4, 'recepção recebe todos, com a marca');
  // Equilibrada sem nenhum horário sem sobra: ficam os ideais (melhor sobra do que nada).
  assert.deepStrictEqual(S.aplicarPolitica([{ horario: '09:10', recomendado: true, desperdicioMin: 10 }, { horario: '09:20', recomendado: false, desperdicioMin: 20 }], 'equilibrada', 'online').map(s => s.horario), ['09:10']);
  assert.strictEqual(S.politicaDe({ agenda_politica: 'outra' }), null);
});

// ---------- Rotas: política ----------
test('PE02 recepção sem política: sugere os ideais e recebe todos os livres', async () => {
  politica(null);
  const r = await slotsRecep();
  assert.strictEqual(r.politica, null);
  assert.match(r.politicaTexto, /Sem política/);
  assert.deepStrictEqual(sugeridos(r), ['09:30', '10:30', '17:30']);
  assert.ok(r.slots.some(s => s.horario === '10:45') && r.slots.some(s => s.horario === '11:00'), 'todos os livres continuam na resposta');
});

test('PE03 equilibrada na recepção: tira 10:45 e 17:15 (sobra de 15 min)', async () => {
  politica('equilibrada');
  const r = await slotsRecep();
  const s = sugeridos(r);
  assert.strictEqual(r.politica, 'equilibrada');
  assert.ok(!s.includes('10:45') && !s.includes('17:15') && s.includes('11:00') && s.includes('09:30'), s.join(','));
});

test('PE04 link: sem política mostra todos; compacta só os ideais e recusa gravar fora', async () => {
  politica(null);
  const todos = await slotsLink();
  assert.ok(todos.includes('10:45') && todos.includes('11:00'), todos.join(','));
  politica('compacta');
  assert.deepStrictEqual(await slotsLink(), ['09:30', '10:30', '17:30']);
  const fora = await request('POST', '/api/public/agendar/salao-p', { token: null, body: { servicoId: CORTE, profissionalId: ANA, data: DIA, horario: '11:00', nome: 'Visitante', whatsapp: '(11) 98765-4321', consentimento: true, website: '' } });
  assert.strictEqual(code(fora), 'HORARIO_INDISPONIVEL', `gravar fora da política recusado (${fora.status} ${fora.raw.slice(0, 120)})`);
  assert.ok(!db.agendamentos.some(a => a.data === DIA && String(a.horario).startsWith('11:00')), 'nada gravado');
  // Controle negativo: o mesmo pedido num horário da política grava (a recusa acima é a política).
  const dentro = await request('POST', '/api/public/agendar/salao-p', { token: null, body: { servicoId: CORTE, profissionalId: ANA, data: DIA, horario: '17:30', nome: 'Visitante', whatsapp: '(11) 98765-4321', consentimento: true, website: '' } });
  assert.strictEqual(dentro.status, 201, `dentro da política grava: ${dentro.raw.slice(0, 200)}`);
  politica(null);
});

test('PE05 configuração: PATCH /empresa aceita as três e null; recusa outro valor', async () => {
  for (const v of ['flexivel', 'equilibrada', 'compacta']) {
    const r = await request('PATCH', '/api/empresa', { token: 'h.admin.s', body: { agendaPolitica: v } });
    assert.strictEqual(r.status, 200, `${v}: ${r.raw.slice(0, 120)}`);
    assert.strictEqual(r.data.data.agenda_politica, v);
  }
  assert.strictEqual((await request('PATCH', '/api/empresa', { token: 'h.admin.s', body: { agendaPolitica: 'agressiva' } })).status, 422);
  assert.strictEqual((await request('PATCH', '/api/empresa', { token: 'h.admin.s', body: { agendaPolitica: null } })).data.data.agenda_politica, null);
  assert.strictEqual((await request('PATCH', '/api/empresa', { body: { agendaPolitica: 'compacta' } })).status, 403, 'recepção não configura');
});

// ---------- Lista de espera ----------
test('PE06 motor da espera: quem combina e por quê', () => {
  const r = E.compativeis({ itens: db.lista_espera, data: DIA, horario: '09:30', profissional: db.profissionais[0], empresa: db.empresas[0],
    agendamentos: db.agendamentos, servicos: db.servicos, links: db.profissional_servicos, clientes: db.clientes, agora: { data: '2026-11-10', minuto: 540 } });
  assert.strictEqual(r.livreAte, '10:00');
  assert.deepStrictEqual(r.itens.map(i => i.id), [W(2), W(1)], 'pediu Ana neste dia primeiro; outro profissional, tarde, química (não cabe) e manicure (Ana não faz) ficam fora');
  assert.match(r.itens[0].motivos.join(' | '), /Corte \(30 min\) cabe até 10:00.*pediu este profissional.*pediu este dia/);
});

test('PE07 rota: faixa da tarde entra às 15:00; horário ocupado e passado não sugerem ninguém; nada muda', async () => {
  const antes = JSON.stringify(db.lista_espera);
  const tarde = await request('GET', `/api/lista-espera/compativeis?data=${DIA}&profissionalId=${ANA}&horario=15:00`);
  assert.strictEqual(tarde.status, 200, tarde.raw.slice(0, 160));
  assert.deepStrictEqual(tarde.data.data.itens.map(i => i.id), [W(2), W(4), W(1), W(5)], 'faixa da tarde e química (cabe à tarde) entram');
  const ocupado = await request('GET', `/api/lista-espera/compativeis?data=${DIA}&profissionalId=${ANA}&horario=09:00`);
  assert.deepStrictEqual(ocupado.data.data.itens, []);
  assert.strictEqual(ocupado.data.data.livreAte, null);
  const passado = await request('GET', `/api/lista-espera/compativeis?data=2026-11-09&profissionalId=${ANA}&horario=15:00`);
  assert.deepStrictEqual(passado.data.data.itens, []);
  assert.strictEqual(JSON.stringify(db.lista_espera), antes, 'consultar não muda a lista');
  assert.strictEqual((await request('GET', `/api/lista-espera/compativeis?data=${DIA}&profissionalId=${ANA}&horario=9h`)).status, 422);
  assert.strictEqual((await request('GET', `/api/lista-espera/compativeis?data=${DIA}&profissionalId=${ANA}&horario=15:00`, { token: 'h.prof.s' })).status, 403, 'profissional sem espera:ver');
});

test('PE08 agendar com listaEsperaId: grava e marca "agendado"; outro cliente é recusado', async () => {
  const errado = await request('POST', '/api/agenda', { body: { clienteId: CLI[0], servicoId: CORTE, profissionalId: ANA, data: DIA, horario: '09:30', listaEsperaId: W(2), aceitarAvisos: true } });
  assert.strictEqual(errado.status, 422); assert.strictEqual(code(errado), 'WAITLIST_MISMATCH');
  assert.ok(!db.agendamentos.some(a => a.data === DIA && String(a.horario).startsWith('09:30')), 'recusado antes de gravar');
  const ok = await request('POST', '/api/agenda', { body: { clienteId: CLI[1], servicoId: CORTE, profissionalId: ANA, data: DIA, horario: '09:30', listaEsperaId: W(2), aceitarAvisos: true } });
  assert.strictEqual(ok.status, 201, ok.raw.slice(0, 160));
  assert.strictEqual(db.lista_espera.find(x => x.id === W(2)).status, 'agendado');
  const de_novo = await request('POST', '/api/agenda', { body: { clienteId: CLI[1], servicoId: CORTE, profissionalId: ANA, data: DIA, horario: '16:00', listaEsperaId: W(2), aceitarAvisos: true } });
  assert.strictEqual(de_novo.status, 422, 'item já resolvido');
});

test('PE09 faixa: as duas pontas ou nenhuma; null limpa', async () => {
  const novo = b => request('POST', '/api/lista-espera', { body: { clienteId: CLI[2], servicoId: CORTE, ...b } });
  assert.strictEqual((await novo({ faixaInicio: '09:00' })).status, 422, 'só uma ponta');
  assert.strictEqual((await novo({ faixaInicio: '12:00', faixaFim: '09:00' })).status, 422, 'invertida');
  const r = await novo({ faixaInicio: '08:00', faixaFim: '12:00' });
  assert.strictEqual(r.status, 201, r.raw.slice(0, 160));
  assert.strictEqual(r.data.data.faixa_inicio, '08:00');
  const limpa = await request('PATCH', `/api/lista-espera/${r.data.data.id}`, { body: { faixaInicio: null, faixaFim: null } });
  assert.strictEqual(limpa.status, 200);
  assert.strictEqual(limpa.data.data.faixa_inicio, null);
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
  console.log(`\nPolítica e Espera Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();

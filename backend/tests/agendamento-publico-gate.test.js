// Agendamento Público Gate (draft AGENDAMENTO_ONLINE_DRAFT.md, fase sem migration).
// HTTP real contra o app; banco em memória (memoryBackend simula o agendamento_criar).
// "Agora" fixo: 2026-11-10 09:00 em America/Sao_Paulo (terça).
// Controles negativos no fim: carregam uma cópia do router com a proteção removida
// e mostram que o mesmo ataque passa (o teste falharia sem a proteção).
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-publico-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const Module = require('module');
const express = require('express');
const { env } = require('../src/config/env');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
const publico = require('../src/routes/publicBooking');
const { app } = require('../src/app');

const AGORA = new Date('2026-11-10T12:00:00Z'); // 09:00 em São Paulo
const HOJE = '2026-11-10';
const AMANHA = '2026-11-11';
const ONTEM = '2026-11-09';
const DIA30 = '2026-12-10';
const DIA31 = '2026-12-11';

const A = env.DEFAULT_EMPRESA_ID;
const B = 'e0000000-0000-4000-8000-0000000000bb';
const CORTE = 'b0000000-0000-4000-8000-0000000000a1';
const SERV_INATIVO = 'b0000000-0000-4000-8000-0000000000a2';
const SERV_SEM_VINCULO = 'b0000000-0000-4000-8000-0000000000a3';
const ANA = 'a0000000-0000-4000-8000-0000000000a1';
const BETO = 'a0000000-0000-4000-8000-0000000000a2';
const PROF_INATIVA = 'a0000000-0000-4000-8000-0000000000a3';
const JOAO = 'd0000000-0000-4000-8000-0000000000a1';
const FALTOSO = 'd0000000-0000-4000-8000-0000000000a2';
const CLI_INATIVO = 'd0000000-0000-4000-8000-0000000000a3';
const SERV_B = 'b0000000-0000-4000-8000-0000000000b1';
const PROF_B = 'a0000000-0000-4000-8000-0000000000b1';
const CLI_B = 'd0000000-0000-4000-8000-0000000000b1';

const dia = { ativo: true, inicio: '09:00', fim: '18:00' };
const semana = { dom: dia, seg: dia, ter: dia, qua: dia, qui: dia, sex: dia, sab: dia };
const falta = (n, data) => ({ id: `90000000-0000-4000-8000-00000000f00${n}`, empresa_id: A, cliente_id: FALTOSO, servico_id: CORTE, profissional_id: ANA, data, horario: '10:00:00', duracao_min: 30, status: 'no_show' });

const db = installMemoryBackend({
  empresas: [
    { id: A, nome: 'Salão Alfa', whatsapp: '11911112222', horario_por_dia: semana, slot_padrao: 30, buffer_min: 0, regua_alerta_faltas: 2, regua_sinal_faltas: 3 },
    { id: B, nome: 'Salão Beta', whatsapp: '11933334444', horario_por_dia: semana, slot_padrao: 30, buffer_min: 0 }
  ],
  servicos: [
    { id: CORTE, empresa_id: A, nome: 'Corte', valor_centavos: 5000, duracao_min: 30, comissao_pct: 40, ativo: true },
    { id: SERV_INATIVO, empresa_id: A, nome: 'Servico Desativado', valor_centavos: 1000, duracao_min: 30, ativo: false },
    { id: SERV_SEM_VINCULO, empresa_id: A, nome: 'Servico Sem Ninguem', valor_centavos: 1000, duracao_min: 30, ativo: true },
    { id: SERV_B, empresa_id: B, nome: 'Escova Beta', valor_centavos: 7000, duracao_min: 60, ativo: true }
  ],
  profissionais: [
    { id: ANA, empresa_id: A, nome: 'Ana Paula Souza', whatsapp: '11900001111', comissao_pct: 40, ativo: true, horario: semana, overrides: {} },
    { id: BETO, empresa_id: A, nome: 'Beto', ativo: true, horario: semana, overrides: {} },
    { id: PROF_INATIVA, empresa_id: A, nome: 'Carla Inativa', ativo: false, horario: semana, overrides: {} },
    { id: PROF_B, empresa_id: B, nome: 'Bruna Beta', ativo: true, horario: semana, overrides: {} }
  ],
  profissional_servicos: [
    { empresa_id: A, profissional_id: ANA, servico_id: CORTE },
    { empresa_id: A, profissional_id: BETO, servico_id: CORTE },
    { empresa_id: A, profissional_id: PROF_INATIVA, servico_id: CORTE },
    { empresa_id: A, profissional_id: ANA, servico_id: SERV_INATIVO },
    { empresa_id: B, profissional_id: PROF_B, servico_id: SERV_B }
  ],
  clientes: [
    { id: JOAO, empresa_id: A, nome: 'João Segredo Silva', whatsapp: '(11) 98888-7777', ativo: true, created_at: '2026-01-01T00:00:00Z' },
    { id: FALTOSO, empresa_id: A, nome: 'Faltoso Oculto', whatsapp: '11977776666', ativo: true },
    { id: CLI_INATIVO, empresa_id: A, nome: 'Inativo Oculto', whatsapp: '11966665555', ativo: false },
    { id: CLI_B, empresa_id: B, nome: 'Cliente Beta Oculta', whatsapp: '11955554444', ativo: true }
  ],
  agendamentos: [
    // Ocupa Ana amanhã às 10:00.
    { id: '90000000-0000-4000-8000-0000000000e1', empresa_id: A, cliente_id: FALTOSO, servico_id: CORTE, profissional_id: ANA, data: AMANHA, horario: '10:00:00', duracao_min: 30, status: 'cancelado' },
    { id: '90000000-0000-4000-8000-0000000000e2', empresa_id: A, cliente_id: CLI_INATIVO, servico_id: CORTE, profissional_id: ANA, data: AMANHA, horario: '10:00:00', duracao_min: 30, status: 'agendado' },
    falta(1, '2026-10-01'), falta(2, '2026-10-08'), falta(3, '2026-10-15')
  ],
  agendamento_eventos: [], comandos: [], comando_itens: [], produtos: [], formas_pagamento: []
});

const LINKS = JSON.stringify({ 'salao-alfa': A, 'salao-beta': B });
publico.setRelogioParaTestes(() => AGORA);
const limitesAltos = () => Object.assign(env, {
  PUBLIC_BOOKING_RATE_GET_MAX: 1000, PUBLIC_BOOKING_RATE_POST_IP_MAX: 1000, PUBLIC_BOOKING_RATE_POST_NUMERO_MAX: 1000,
  PUBLIC_BOOKING_TETO_DIARIO: 50, PUBLIC_BOOKING_MAX_FUTUROS_POR_NUMERO: 2, PUBLIC_BOOKING_ANTECEDENCIA_MIN: 120, PUBLIC_BOOKING_JANELA_DIAS: 30
});
limitesAltos();

let base;
function request(method, urlPath, { body, raw, baseUrl } = {}) {
  return new Promise((resolve, reject) => {
    const payload = raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : null;
    const headers = {};
    if (payload !== null) { headers['content-type'] = 'application/json'; headers['content-length'] = Buffer.byteLength(payload); }
    const req = http.request((baseUrl || base) + urlPath, { method, headers }, res => {
      let txt = ''; res.on('data', c => { txt += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(txt); } catch (_) {} resolve({ status: res.statusCode, data, raw: txt, headers: res.headers }); });
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}
const code = r => r.data && r.data.error && r.data.error.code;
const contar = () => ({ ag: db.agendamentos.length, cli: db.clientes.length, ev: db.agendamento_eventos.length });
const pedido = extra => ({ servicoId: CORTE, profissionalId: ANA, data: AMANHA, horario: '11:00', nome: 'Maria Nova', whatsapp: '(21) 99999-0001', consentimento: true, website: '', ...extra });
const post = (body, slug = 'salao-alfa', baseUrl) => request('POST', `/api/public/agendar/${slug}`, { body, baseUrl });

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('P01 desligado por padrão: sem PUBLIC_BOOKING_LINKS tudo é 404 (nem 401) e nada grava', async () => {
  env.PUBLIC_BOOKING_LINKS = '';
  const antes = contar();
  for (const [m, p] of [['GET', '/api/public/agendar/salao-alfa'], ['GET', `/api/public/agendar/salao-alfa/slots?servicoId=${CORTE}&profissionalId=${ANA}&data=${AMANHA}`], ['GET', '/api/public/qualquer-coisa']]) {
    const r = await request(m, p);
    assert.strictEqual(r.status, 404, p); assert.strictEqual(code(r), 'NOT_FOUND');
  }
  const r = await post(pedido());
  assert.strictEqual(r.status, 404);
  env.PUBLIC_BOOKING_LINKS = '{isto não é json';
  assert.strictEqual((await request('GET', '/api/public/agendar/salao-alfa')).status, 404, 'JSON inválido = desligado');
  assert.deepStrictEqual(contar(), antes);
});

test('P02 slug inexistente = 404 idêntico ao de desligado (não enumera salões)', async () => {
  env.PUBLIC_BOOKING_LINKS = '';
  const desligado = await request('GET', '/api/public/agendar/salao-alfa');
  env.PUBLIC_BOOKING_LINKS = LINKS;
  for (const slug of ['salao-gama', 'x', A, '..%2Fsalao-alfa', '__proto__']) {
    const r = await request('GET', `/api/public/agendar/${slug}`);
    assert.strictEqual(r.status, 404, slug); assert.strictEqual(r.raw, desligado.raw, `corpo igual ao de desligado (${slug})`);
  }
  assert.strictEqual((await request('GET', '/api/public/agendar/salao-alfa')).status, 200);
  assert.strictEqual((await request('GET', '/api/public/outra-rota')).status, 404, 'rota pública desconhecida não cai no requireAuth');
});

test('P03 GET do salão: só serviços ativos com profissional ativo, primeiro nome; nada sensível', async () => {
  const r = await request('GET', '/api/public/agendar/salao-alfa');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.headers['cache-control'], 'no-store');
  const d = r.data.data;
  assert.deepStrictEqual(d.salao, { nome: 'Salão Alfa' });
  assert.deepStrictEqual(d.servicos, [{ id: CORTE, nome: 'Corte', duracaoMin: 30, precoCentavos: 5000, profissionais: [{ id: ANA, nome: 'Ana' }, { id: BETO, nome: 'Beto' }] }]);
  assert.deepStrictEqual(d.regras, { hoje: HOJE, primeiroDia: HOJE, ultimoDia: DIA30, antecedenciaMin: 120, janelaDias: 30 });
  const txt = r.raw.toLowerCase();
  for (const proibido of ['whatsapp', '9111', '8888', '0000111', 'comiss', 'cliente', 'joão', 'segredo', 'souza', 'carla', 'desativado', 'beta', 'empresa_id', A]) {
    assert.ok(!txt.includes(proibido.toLowerCase()), `vazou "${proibido}"`);
  }
  const rb = await request('GET', '/api/public/agendar/salao-beta');
  assert.deepStrictEqual(rb.data.data.servicos.map(s => s.nome), ['Escova Beta'], 'cada slug só vê o próprio salão');
});

test('P04 slots: só horários; antecedência de 2 h hoje; ocupado some; passado e além de 30 dias vazios', async () => {
  const slots = async (data, prof = ANA, serv = CORTE) => request('GET', `/api/public/agendar/salao-alfa/slots?servicoId=${serv}&profissionalId=${prof}&data=${data}`);
  const hoje = await slots(HOJE);
  assert.strictEqual(hoje.status, 200);
  assert.deepStrictEqual(Object.keys(hoje.data.data).sort(), ['data', 'duracaoMin', 'slots']);
  assert.ok(hoje.data.data.slots.every(h => typeof h === 'string'));
  assert.strictEqual(hoje.data.data.slots[0], '11:00', 'agora 09:00 + 2 h');
  const amanha = (await slots(AMANHA)).data.data.slots;
  assert.strictEqual(amanha[0], '09:00');
  assert.ok(!amanha.includes('10:00'), 'ocupado pela Ana');
  assert.ok(amanha.includes('10:30') && amanha.includes('17:30') && !amanha.includes('18:00'));
  assert.deepStrictEqual((await slots(ONTEM)).data.data.slots, []);
  assert.deepStrictEqual((await slots(DIA31)).data.data.slots, []);
  assert.ok((await slots(DIA30)).data.data.slots.length > 0, 'último dia da janela ainda abre');
  for (const [prof, serv] of [[PROF_INATIVA, CORTE], [ANA, SERV_INATIVO], [ANA, SERV_SEM_VINCULO], [PROF_B, SERV_B]]) {
    const r = await slots(AMANHA, prof, serv);
    assert.strictEqual(r.status, 422, `${prof}/${serv}`); assert.strictEqual(code(r), 'INDISPONIVEL');
  }
  assert.strictEqual(code(await slots('2026-02-30')), 'DADOS_INVALIDOS');
});

test('P05 POST cria cliente novo + agendamento "agendado" sem autoria + evento de origem com IP truncado', async () => {
  const antes = contar();
  const r = await post(pedido());
  assert.strictEqual(r.status, 201, r.raw);
  assert.deepStrictEqual(r.data.data, { data: AMANHA, horario: '11:00', servico: 'Corte', profissional: 'Ana' });
  assert.deepStrictEqual(contar(), { ag: antes.ag + 1, cli: antes.cli + 1, ev: antes.ev + 1 });
  const ag = db.agendamentos[db.agendamentos.length - 1];
  const cli = db.clientes[db.clientes.length - 1];
  assert.strictEqual(ag.empresa_id, A); assert.strictEqual(ag.status, 'agendado'); assert.strictEqual(ag.created_by, null);
  assert.strictEqual(ag.cliente_id, cli.id); assert.strictEqual(ag.valor_centavos, 5000); assert.strictEqual(ag.duracao_min, 30);
  assert.strictEqual(cli.empresa_id, A); assert.strictEqual(cli.nome, 'Maria Nova'); assert.strictEqual(cli.whatsapp, '5521999990001');
  const ev = db.agendamento_eventos[db.agendamento_eventos.length - 1];
  assert.strictEqual(ev.tipo, publico.TIPO_EVENTO); assert.strictEqual(ev.empresa_id, A); assert.strictEqual(ev.agendamento_id, ag.id);
  assert.strictEqual(ev.payload.origem, 'link_publico'); assert.strictEqual(ev.payload.slug, 'salao-alfa');
  assert.strictEqual(ev.payload.versao_aviso_privacidade, env.PUBLIC_BOOKING_AVISO_VERSAO);
  assert.strictEqual(ev.payload.consentimento_em, AGORA.toISOString());
  assert.strictEqual(ev.payload.ip_truncado, '127.0.0.0/24');
  assert.strictEqual(ev.payload.dedup, 'novo');
  assert.ok(!JSON.stringify(ev).includes('127.0.0.1'), 'sem IP em claro');
  assert.strictEqual(publico.ipTruncado('2804:14c:5b:1234:abcd::1'), '2804:14c:5b::/48');
  assert.strictEqual(publico.ipTruncado('::ffff:200.10.20.30'), '200.10.20.0/24');
});

test('P06 revalidação: fora do expediente, antes da antecedência, passado, além da janela e ocupado → 422 sem gravar', async () => {
  const antes = contar();
  for (const [data, horario, motivo] of [[AMANHA, '20:00', 'fora do expediente'], [AMANHA, '08:30', 'antes de abrir'], [HOJE, '10:00', 'antes de agora + 2 h'],
    [ONTEM, '11:00', 'passado'], [DIA31, '11:00', 'além de 30 dias'], [AMANHA, '10:00', 'ocupado'], [AMANHA, '11:00', 'ocupado pelo P05'], [AMANHA, '11:10', 'fora da grade']]) {
    const r = await post(pedido({ data, horario, whatsapp: '21 98888-0002' }));
    assert.strictEqual(r.status, 422, `${motivo}: ${r.raw}`); assert.strictEqual(code(r), 'HORARIO_INDISPONIVEL', motivo);
  }
  assert.deepStrictEqual(contar(), antes);
});

test('P07 honeypot preenchido: 201 falso, nada gravado', async () => {
  const antes = contar();
  const r = await post(pedido({ horario: '12:00', website: 'http://spam.example', whatsapp: '21 98888-0003' }));
  assert.strictEqual(r.status, 201);
  assert.deepStrictEqual(contar(), antes);
});

test('P08 consentimento obrigatório; campos extras (empresaId, autoria, status, clienteId) e formato inválido recusados', async () => {
  const antes = contar();
  for (const c of [undefined, false, 'true', 1]) {
    const body = pedido({ horario: '12:00', consentimento: c });
    if (c === undefined) delete body.consentimento;
    const r = await post(body);
    assert.strictEqual(r.status, 422); assert.strictEqual(code(r), 'CONSENTIMENTO_OBRIGATORIO', String(c));
  }
  for (const extra of [{ empresaId: B }, { empresa_id: B }, { created_by: 'x' }, { status: 'confirmado' }, { clienteId: JOAO }, { permitirConflito: true }, { duracaoMin: 5 }]) {
    const r = await post(pedido({ horario: '12:00', ...extra }));
    assert.strictEqual(r.status, 422); assert.strictEqual(code(r), 'DADOS_INVALIDOS', JSON.stringify(extra));
    assert.ok(!r.raw.includes(Object.keys(extra)[0]), 'não ecoa o campo');
  }
  assert.strictEqual(code(await post(pedido({ nome: '<script>alert(1)</script>' }))), 'NOME_INVALIDO');
  assert.strictEqual(code(await post(pedido({ nome: 'A' }))), 'NOME_INVALIDO');
  assert.strictEqual(code(await post(pedido({ whatsapp: '98888-7777' }))), 'WHATSAPP_INVALIDO', 'sem DDD');
  assert.strictEqual(code(await post(pedido({ servicoId: 'nao-uuid' }))), 'DADOS_INVALIDOS');
  assert.strictEqual(code(await post(pedido({ data: '2026-02-30' }))), 'DADOS_INVALIDOS');
  assert.deepStrictEqual(contar(), antes);
});

test('P09 dedup por número normalizado: reaproveita o cliente sem trocar nem revelar o nome', async () => {
  const antes = contar();
  const r = await post(pedido({ horario: '12:00', nome: 'Fulano Qualquer', whatsapp: '+55 11 98888 7777' }));
  assert.strictEqual(r.status, 201, r.raw);
  assert.ok(!/jo[aã]o|segredo|silva|fulano/i.test(r.raw), 'resposta não traz nome de cliente');
  assert.strictEqual(contar().cli, antes.cli, 'não criou cliente');
  const ag = db.agendamentos[db.agendamentos.length - 1];
  assert.strictEqual(ag.cliente_id, JOAO);
  assert.strictEqual(db.clientes.find(c => c.id === JOAO).nome, 'João Segredo Silva', 'nome cadastrado intacto');
  assert.strictEqual(db.agendamento_eventos[db.agendamento_eventos.length - 1].payload.dedup, 'existente');
});

test('P10 limite de 2 agendamentos futuros por número; 3º recusado com mensagem genérica', async () => {
  const r2 = await post(pedido({ horario: '12:30', whatsapp: '11988887777', profissionalId: BETO }));
  assert.strictEqual(r2.status, 201, r2.raw);
  const antes = contar();
  const r3 = await post(pedido({ horario: '13:00', whatsapp: '11988887777' }));
  assert.strictEqual(r3.status, 422); assert.strictEqual(code(r3), 'AGENDAMENTO_ONLINE_INDISPONIVEL');
  assert.deepStrictEqual(contar(), antes);
});

test('P11 régua exigir_sinal e cadastro inativo: mesma resposta do limite (não revela o motivo)', async () => {
  const limite = await post(pedido({ horario: '13:00', whatsapp: '11988887777' }));
  const antes = contar();
  const regua = await post(pedido({ horario: '13:00', whatsapp: '11977776666', nome: 'Outro Nome' }));
  const inativo = await post(pedido({ horario: '13:00', whatsapp: '11966665555' }));
  assert.strictEqual(regua.status, 422); assert.strictEqual(regua.raw, limite.raw, 'régua = limite, byte a byte');
  assert.strictEqual(inativo.raw, limite.raw, 'inativo = limite');
  assert.ok(!/falta|sinal|oculto/i.test(regua.raw));
  assert.deepStrictEqual(contar(), antes);
});

test('P12 isolamento: slug A não aceita ids de B nem grava em B; cliente de B não é reaproveitado em A', async () => {
  const antesB = db.agendamentos.filter(a => a.empresa_id === B).length;
  const antes = contar();
  const cruzado = await post(pedido({ servicoId: SERV_B, profissionalId: PROF_B, horario: '14:00' }));
  assert.strictEqual(cruzado.status, 422); assert.strictEqual(code(cruzado), 'INDISPONIVEL');
  const misto = await post(pedido({ servicoId: CORTE, profissionalId: PROF_B, horario: '14:00' }));
  assert.strictEqual(code(misto), 'INDISPONIVEL');
  assert.deepStrictEqual(contar(), antes);

  const r = await post(pedido({ horario: '14:00', whatsapp: '11955554444', nome: 'Visitante' }));
  assert.strictEqual(r.status, 201, r.raw);
  const ag = db.agendamentos[db.agendamentos.length - 1];
  const cli = db.clientes.find(c => c.id === ag.cliente_id);
  assert.strictEqual(ag.empresa_id, A); assert.notStrictEqual(ag.cliente_id, CLI_B);
  assert.strictEqual(cli.empresa_id, A); assert.strictEqual(cli.nome, 'Visitante');
  assert.strictEqual(db.agendamentos.filter(a => a.empresa_id === B).length, antesB, 'nada gravado em B');

  const rb = await post({ ...pedido({ servicoId: SERV_B, profissionalId: PROF_B, horario: '14:00', whatsapp: '21 97777-0009' }) }, 'salao-beta');
  assert.strictEqual(rb.status, 201, rb.raw);
  assert.strictEqual(db.agendamentos[db.agendamentos.length - 1].empresa_id, B);
  assert.strictEqual(db.agendamento_eventos[db.agendamento_eventos.length - 1].empresa_id, B);
});

test('P13 concorrência: dois POSTs no mesmo horário → 1 grava; corrida após a checagem de slot → 409 sem detalhes', async () => {
  const [r1, r2] = await Promise.all([
    post(pedido({ horario: '15:00', whatsapp: '21 96666-0001', nome: 'Primeira' })),
    post(pedido({ horario: '15:00', whatsapp: '21 96666-0002', nome: 'Segunda' }))
  ]);
  const st = [r1.status, r2.status].sort();
  assert.strictEqual(st.filter(s => s === 201).length, 1, JSON.stringify(st));
  assert.ok([409, 422].includes(st.find(s => s !== 201)));
  assert.strictEqual(db.agendamentos.filter(a => a.empresa_id === A && a.profissional_id === ANA && a.data === AMANHA && a.horario === '15:00').length, 1);

  // Determinístico: outro agendamento entra entre a checagem de slot e o agendamento_criar.
  const original = SupabaseRepository.prototype.criarAgendamento;
  SupabaseRepository.prototype.criarAgendamento = async function (args) {
    db.agendamentos.push({ id: '90000000-0000-4000-8000-0000000000c9', empresa_id: A, profissional_id: ANA, servico_id: CORTE, data: AMANHA, horario: '16:00:00', duracao_min: 30, status: 'agendado' });
    return original.call(this, args);
  };
  try {
    const r = await post(pedido({ horario: '16:00', whatsapp: '21 96666-0003' }));
    assert.strictEqual(r.status, 409); assert.strictEqual(code(r), 'HORARIO_OCUPADO');
    assert.ok(!r.raw.includes('conflitos') && !r.raw.includes('90000000'), 'sem ids do conflito');
  } finally { SupabaseRepository.prototype.criarAgendamento = original; }
});

test('P14 teto diário do salão: atingido → mesma recusa genérica', async () => {
  const hoje = db.agendamento_eventos.filter(e => e.empresa_id === A && e.tipo === publico.TIPO_EVENTO).length;
  env.PUBLIC_BOOKING_TETO_DIARIO = hoje;
  try {
    const antes = contar();
    const r = await post(pedido({ horario: '16:30', whatsapp: '21 96666-0004' }));
    assert.strictEqual(r.status, 422); assert.strictEqual(code(r), 'AGENDAMENTO_ONLINE_INDISPONIVEL');
    assert.strictEqual(contar().ag, antes.ag);
    assert.strictEqual((await post(pedido({ servicoId: SERV_B, profissionalId: PROF_B, horario: '16:30', whatsapp: '21 96666-0004' }), 'salao-beta')).status, 201, 'teto é por salão');
  } finally { limitesAltos(); }
});

test('P15 rate limit: por IP (GET e POST) e por número → 429 neutro', async () => {
  publico.resetRateLimitPublico();
  env.PUBLIC_BOOKING_RATE_GET_MAX = 2;
  try {
    assert.strictEqual((await request('GET', '/api/public/agendar/salao-alfa')).status, 200);
    assert.strictEqual((await request('GET', '/api/public/agendar/salao-gama')).status, 404);
    const r = await request('GET', '/api/public/agendar/salao-alfa');
    assert.strictEqual(r.status, 429); assert.strictEqual(code(r), 'MUITAS_TENTATIVAS');
    publico.resetRateLimitPublico(); limitesAltos();
    env.PUBLIC_BOOKING_RATE_POST_NUMERO_MAX = 1;
    assert.strictEqual(code(await post(pedido({ horario: '20:00', whatsapp: '21 95555-0001' }))), 'HORARIO_INDISPONIVEL', '1ª tentativa conta');
    assert.strictEqual(code(await post(pedido({ horario: '17:00', whatsapp: '(21) 95555-0001' }))), 'MUITAS_TENTATIVAS', 'mesmo número, outro formato');
    publico.resetRateLimitPublico(); limitesAltos();
    env.PUBLIC_BOOKING_RATE_POST_IP_MAX = 1;
    await post(pedido({ horario: '17:00', whatsapp: '21 95555-0002', consentimento: false }));
    assert.strictEqual((await post(pedido({ horario: '17:00', whatsapp: '21 95555-0003' }))).status, 429);
  } finally { publico.resetRateLimitPublico(); limitesAltos(); }
});

test('P16 corpo acima de 10 kB → 413 e JSON malformado → 400, ambos genéricos', async () => {
  const grande = await request('POST', '/api/public/agendar/salao-alfa', { body: pedido({ nome: 'a'.repeat(11 * 1024) }) });
  assert.strictEqual(grande.status, 413); assert.strictEqual(code(grande), 'DADOS_INVALIDOS');
  const ruim = await request('POST', '/api/public/agendar/salao-alfa', { raw: '{"nome":' });
  assert.strictEqual(ruim.status, 400); assert.ok(!/Unexpected|SyntaxError|at /.test(ruim.raw), 'sem stack/mensagem do parser');
});

test('P17 contexto público não vira autenticação: rotas de negócio continuam 401; router não usa req.auth nem RBAC', async () => {
  assert.strictEqual((await request('GET', '/api/agenda')).status, 401);
  const src = fs.readFileSync(require.resolve('../src/routes/publicBooking.js'), 'utf8');
  assert.ok(!/req\.auth\s*=|req\.auth\./.test(src), 'não cria nem lê req.auth');
  assert.ok(!/require\([^)]*(auth\/rbac|middleware\/auth)/.test(src), 'não importa RBAC/requireAuth');
  const appSrc = fs.readFileSync(require.resolve('../src/app.js'), 'utf8');
  assert.ok(appSrc.indexOf("app.use('/api/public'") < appSrc.indexOf("app.use('/api', requireAuth)"), 'montado antes do perímetro');
  assert.ok(appSrc.indexOf("app.use('/api/public'") < appSrc.indexOf('app.use(express.json('), 'antes do parser global de 100 kB');
});

// --- Controles negativos ------------------------------------------------------
// Compila uma cópia do router com a proteção removida (mesmo caminho de arquivo,
// para os require relativos resolverem) e monta num app mínimo.
function routerMutante(trocas) {
  const arquivo = require.resolve('../src/routes/publicBooking.js');
  let src = fs.readFileSync(arquivo, 'utf8');
  for (const [de, para] of trocas) {
    assert.ok(src.includes(de), `trecho da mutação não encontrado: ${de}`);
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

test('NC1 controle negativo: sem o filtro de empresa nas leituras, o ataque do P12 (ids de B no slug de A) GRAVA', async () => {
  const mutante = routerMutante([['empresa_id: repo.empresaId', 'empresa_id: undefined']]);
  await comServidor(mutante, async url => {
    const r = await post(pedido({ servicoId: SERV_B, profissionalId: PROF_B, horario: '10:00', whatsapp: '21 94444-0001' }), 'salao-alfa', url);
    assert.strictEqual(r.status, 201, `o mutante deveria aceitar (prova que P12 detecta): ${r.raw}`);
    const ag = db.agendamentos[db.agendamentos.length - 1];
    assert.strictEqual(ag.empresa_id, A); assert.strictEqual(ag.servico_id, SERV_B, 'referência cruzada gravada em A');
  });
});

test('NC2 controle negativo: sem a revalidação de slot, horário fora do expediente (P06) GRAVA', async () => {
  const mutante = routerMutante([['if (!slots.includes(entrada.horario)) throw horarioIndisponivel();', '']]);
  await comServidor(mutante, async url => {
    const r = await post(pedido({ horario: '20:00', whatsapp: '21 94444-0002' }), 'salao-alfa', url);
    assert.strictEqual(r.status, 201, `o mutante deveria aceitar (prova que P06 detecta): ${r.raw}`);
    assert.ok(db.agendamentos.some(a => a.horario === '20:00' && a.data === AMANHA));
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
  console.log(`\nAgendamento Público Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();

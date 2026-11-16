// Séries Gate (recorrência só pela equipe, migration 018, D-039, C4). HTTP real contra o app;
// banco e identidade em memória. "Agora" fixo: 2026-11-10 09:00 em America/Sao_Paulo (terça).
// Cobre: prévia sem gravar (livre, conflito, fora da escala, passado), criação pulando o que não
// cabe, permissão, cancelar e alterar "só este", "este e os próximos" e "todos", corrida na
// gravação, isolamento entre empresas e o link pessoal (C2) acompanhando a alteração.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-series-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const Module = require('module');
const { env } = require('../src/config/env');
const clock = require('../src/config/clock');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
const { createAppError } = require('../src/errors');
const { criarAcesso, hashToken } = require('../src/services/AcessoAgendamento');
const { datasDaSerie } = require('../src/engines/RecorrenciaEngine');
const { app } = require('../src/app');

const AGORA = new Date('2026-11-10T12:00:00Z');
const A = env.DEFAULT_EMPRESA_ID;
const B = 'e0000000-0000-4000-8000-0000000000bb';
const CORTE = 'b0000000-0000-4000-8000-0000000000a1';
const ANA = 'a0000000-0000-4000-8000-0000000000a1';
const BETO = 'a0000000-0000-4000-8000-0000000000a2';
const CLI = 'd0000000-0000-4000-8000-0000000000a1';
const SERIE_B = 'f0000000-0000-4000-8000-0000000000b1';
const UNIT = 'f0000000-0000-4000-8000-0000000000a1';
const ADMIN = 'c0000000-0000-4000-8000-0000000000a1';
const RECEP = 'c0000000-0000-4000-8000-0000000000a2';
const PROF_USER = 'c0000000-0000-4000-8000-0000000000a3';

const dia = { ativo: true, inicio: '09:00', fim: '18:00' };
const semana = { dom: dia, seg: dia, ter: dia, qua: dia, qui: dia, sex: dia, sab: dia };

setIdentityStore(createMemoryIdentityStore({
  app_users: [ADMIN, RECEP, PROF_USER].map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: A, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: A, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: A, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    { id: 'm3', empresa_id: A, user_id: PROF_USER, role: 'profissional', status: 'ativo', profissional_id: ANA }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: UNIT }, { membership_id: 'm3', unit_id: UNIT }]
}));
const tokens = { 'h.admin.s': ADMIN, 'h.recep.s': RECEP, 'h.prof.s': PROF_USER };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'Credencial ausente ou invalida.', 401); return { id: tokens[t] }; } });

const SEMANAS = datasDaSerie('2026-11-11', 'semanal', 8); // quartas, de 11/11 a 30/12
const db = installMemoryBackend({
  empresas: [{ id: A, nome: 'Salão Alfa', horario_por_dia: semana, slot_padrao: 30, buffer_min: 0 }, { id: B, nome: 'Salão Beta', horario_por_dia: semana, slot_padrao: 30 }],
  servicos: [{ id: CORTE, empresa_id: A, nome: 'Corte', valor_centavos: 5000, duracao_min: 30, ativo: true }],
  profissionais: [
    { id: ANA, empresa_id: A, nome: 'Ana', ativo: true, horario: semana, overrides: { [CORTE]: { valor_centavos: 6000 } } },
    { id: BETO, empresa_id: A, nome: 'Beto', ativo: true, horario: semana, overrides: {} }
  ],
  profissional_servicos: [{ empresa_id: A, profissional_id: ANA, servico_id: CORTE }, { empresa_id: A, profissional_id: BETO, servico_id: CORTE }],
  clientes: [{ id: CLI, empresa_id: A, nome: 'Cliente Fixo', ativo: true }],
  agendamentos: [
    // 3ª quarta (25/11) às 10:00 a Ana já está ocupada.
    { id: '90000000-0000-4000-8000-0000000000e1', empresa_id: A, cliente_id: null, servico_id: CORTE, profissional_id: ANA, data: SEMANAS[2], horario: '10:00:00', duracao_min: 30, status: 'agendado' }
  ],
  // 5ª quarta (09/12): salão fechado.
  disponibilidade_excecoes: [{ id: '80000000-0000-4000-8000-0000000000e1', empresa_id: A, profissional_id: null, tipo: 'fechamento', data_inicio: SEMANAS[4], data_fim: SEMANAS[4], inicio: null, fim: null }],
  agendamento_series: [{ id: SERIE_B, empresa_id: B, cliente_id: null, servico_id: null, profissional_id: null, frequencia: 'semanal', horario: '10:00:00', duracao_min: 30, data_inicio: '2026-11-11', ocorrencias: 4, status: 'ativa' }],
  agendamento_eventos: [], agendamento_acessos: [], comandos: [], comando_itens: [], produtos: [], formas_pagamento: []
});
clock.definirRelogio(() => AGORA);

let base;
function request(method, urlPath, { body, token } = {}) {
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
const SERIE = { clienteId: CLI, servicoId: CORTE, profissionalId: ANA, dataInicio: '2026-11-11', horario: '10:00', frequencia: 'semanal', ocorrencias: 8 };
const daSerie = id => db.agendamentos.filter(a => a.serie_id === id).sort((a, b) => a.serie_seq - b.serie_seq);
let serieId;

const tests = [];
const test = (n, f) => tests.push({ n, f });

test('S01 prévia: 8 quartas, uma em conflito e uma com o salão fechado; nada é gravado', async () => {
  const antes = db.agendamentos.length;
  const r = await request('POST', '/api/agenda/series/previa', { token: 'h.recep.s', body: SERIE });
  assert.strictEqual(r.status, 200, r.raw);
  const d = r.data.data;
  assert.deepStrictEqual([d.total, d.livres, d.indisponiveis], [8, 6, 2]);
  assert.deepStrictEqual(d.ocorrencias.map(o => o.situacao), ['livre', 'livre', 'conflito', 'livre', 'fora_da_disponibilidade', 'livre', 'livre', 'livre']);
  assert.deepStrictEqual(d.ocorrencias.map(o => o.data), SEMANAS);
  assert.strictEqual(db.agendamentos.length, antes);
  assert.ok(!(db.agendamento_series || []).some(s => s.empresa_id === A));
});

test('S02 criar: grava a série e as 6 livres com serie_id/serie_seq, preço do profissional e trilha; pula as 2', async () => {
  const r = await request('POST', '/api/agenda/series', { token: 'h.recep.s', body: SERIE });
  assert.strictEqual(r.status, 201, r.raw);
  serieId = r.data.data.serie.id;
  assert.deepStrictEqual(r.data.data.criados.map(c => c.seq), [1, 2, 4, 6, 7, 8]);
  assert.deepStrictEqual(r.data.data.pulados.map(p => [p.seq, p.situacao]), [[3, 'conflito'], [5, 'fora_da_disponibilidade']]);
  const ags = daSerie(serieId);
  assert.strictEqual(ags.length, 6);
  assert.ok(ags.every(a => a.status === 'agendado' && a.cliente_id === CLI && a.valor_centavos === 6000 && a.created_by === RECEP && String(a.horario).startsWith('10:00')));
  const ev = db.agendamento_eventos.filter(e => ags.some(a => a.id === e.agendamento_id) && e.tipo === 'criado');
  assert.strictEqual(ev.length, 6); assert.ok(ev.every(e => e.payload.serie_id === serieId));
});

test('S03 permissão e validação: profissional não cria série; frequência, ocorrências e datas inválidas = 422; sem login 401', async () => {
  assert.strictEqual((await request('POST', '/api/agenda/series/previa', { token: 'h.prof.s', body: SERIE })).status, 403);
  assert.strictEqual((await request('POST', '/api/agenda/series', { token: 'h.prof.s', body: SERIE })).status, 403);
  for (const ruim of [{ frequencia: 'diaria' }, { ocorrencias: 53 }, { ocorrencias: 1 }, { dataInicio: '2026-02-30x' }, { horario: '25:00' }, { clienteId: 'x' }]) {
    const r = await request('POST', '/api/agenda/series/previa', { token: 'h.recep.s', body: { ...SERIE, ...ruim } });
    assert.strictEqual(r.status, 422, JSON.stringify(ruim));
  }
  assert.strictEqual((await request('POST', '/api/agenda/series/previa', { body: SERIE })).status, 401);
  // Nenhuma rota pública cria série.
  assert.strictEqual((await request('POST', '/api/public/agenda/series', { body: SERIE })).status, 404);
});

test('S04 alterar "este e os próximos" a partir da 6ª: muda para 11:00 só da 6ª em diante; anteriores intactas; link pessoal acompanha', async () => {
  const ags = daSerie(serieId);
  const sexta = ags.find(a => a.serie_seq === 6);
  const token = await criarAcesso(new SupabaseRepository(A), sexta, { timeZone: env.APP_TIMEZONE, agora: AGORA });
  // 8ª às 11:00 ocupada: fica como estava.
  await new SupabaseRepository(A).insert('agendamentos', { id: '90000000-0000-4000-8000-0000000000e2', cliente_id: null, servico_id: CORTE, profissional_id: ANA, data: SEMANAS[7], horario: '11:00:00', duracao_min: 30, status: 'agendado' });
  const r = await request('POST', `/api/agenda/series/${serieId}/alterar`, { token: 'h.recep.s', body: { escopo: 'proximos', agendamentoId: sexta.id, novoHorario: '11:00' } });
  assert.strictEqual(r.status, 200, r.raw);
  assert.deepStrictEqual(r.data.data.alterados.map(a => a.seq), [6, 7]);
  assert.deepStrictEqual(r.data.data.mantidos.map(m => [m.seq, m.situacao]), [[8, 'conflito']]);
  const ativos = daSerie(serieId).filter(a => a.status === 'agendado');
  const porSeq = Object.fromEntries(ativos.map(a => [a.serie_seq, String(a.horario).slice(0, 5)]));
  assert.deepStrictEqual(porSeq, { 1: '10:00', 2: '10:00', 4: '10:00', 6: '11:00', 7: '11:00', 8: '10:00' });
  assert.strictEqual(daSerie(serieId).filter(a => a.status === 'reagendado').length, 2);
  const acesso = db.agendamento_acessos.find(a => a.token_hash === hashToken(token));
  assert.strictEqual(db.agendamentos.find(a => a.id === acesso.agendamento_id).horario, '11:00', 'link pessoal aponta para o novo horário');
  assert.strictEqual(String(db.agendamento_series.find(s => s.id === serieId).horario).slice(0, 5), '11:00', 'regra da série atualizada');
});

test('S05 cancelar: "só este" (2ª), depois "este e os próximos" (7ª), depois "todos" encerra a série', async () => {
  const seq = n => daSerie(serieId).find(a => a.serie_seq === n && ['agendado', 'confirmado'].includes(a.status));
  const r1 = await request('POST', `/api/agenda/series/${serieId}/cancelar`, { token: 'h.recep.s', body: { escopo: 'este', agendamentoId: seq(2).id } });
  assert.strictEqual(r1.status, 200, r1.raw);
  assert.deepStrictEqual(r1.data.data.cancelados.map(c => c.seq), [2]);
  const r2 = await request('POST', `/api/agenda/series/${serieId}/cancelar`, { token: 'h.recep.s', body: { escopo: 'proximos', agendamentoId: seq(7).id } });
  assert.deepStrictEqual(r2.data.data.cancelados.map(c => c.seq), [7, 8]);
  assert.ok(seq(1) && seq(4) && seq(6), 'anteriores à 7ª continuam');
  assert.strictEqual(r2.data.data.serieEncerrada, false);
  const r3 = await request('POST', `/api/agenda/series/${serieId}/cancelar`, { token: 'h.recep.s', body: { escopo: 'todos', agendamentoId: seq(4).id } });
  assert.deepStrictEqual(r3.data.data.cancelados.map(c => c.seq).sort((a, b) => a - b), [1, 4, 6]);
  assert.strictEqual(r3.data.data.serieEncerrada, true);
  assert.strictEqual(db.agendamento_series.find(s => s.id === serieId).status, 'encerrada');
  assert.strictEqual(code(await request('POST', `/api/agenda/series/${serieId}/cancelar`, { token: 'h.recep.s', body: { escopo: 'tudo', agendamentoId: seq(4) ? seq(4).id : CLI } })), 'INVALID_FIELD');
});

test('S06 isolamento: série de outra empresa = 404; horário de fora da série = 404', async () => {
  assert.strictEqual((await request('GET', `/api/agenda/series/${SERIE_B}`, { token: 'h.recep.s' })).status, 404);
  assert.strictEqual((await request('POST', `/api/agenda/series/${SERIE_B}/cancelar`, { token: 'h.recep.s', body: { escopo: 'todos', agendamentoId: CLI } })).status, 404);
  const r = await request('POST', '/api/agenda/series', { token: 'h.recep.s', body: { ...SERIE, dataInicio: '2027-01-06', ocorrencias: 2 } });
  const outra = r.data.data.serie.id;
  assert.strictEqual((await request('POST', `/api/agenda/series/${outra}/cancelar`, { token: 'h.recep.s', body: { escopo: 'este', agendamentoId: '90000000-0000-4000-8000-0000000000e1' } })).status, 404);
});

test('S07 corrida: horário ocupado entre a prévia e a gravação é pulado (não encaixado)', async () => {
  const P = SupabaseRepository.prototype;
  const original = P.criarAgendamento;
  let n = 0;
  P.criarAgendamento = async function (args) {
    n += 1;
    if (n === 2) { const e = new Error('conflito'); e.code = 'SCHEDULE_CONFLICT'; e.statusCode = 409; throw e; }
    return original.call(this, args);
  };
  try {
    const r = await request('POST', '/api/agenda/series', { token: 'h.recep.s', body: { ...SERIE, profissionalId: BETO, dataInicio: '2027-02-03', ocorrencias: 3 } });
    assert.strictEqual(r.status, 201, r.raw);
    assert.deepStrictEqual(r.data.data.criados.map(c => c.seq), [1, 3]);
    assert.deepStrictEqual(r.data.data.pulados.map(p => [p.seq, p.situacao]), [[2, 'conflito']]);
  } finally { P.criarAgendamento = original; }
});

test('S08 remarcação avulsa pela recepção mantém a ocorrência na série', async () => {
  const r = await request('POST', '/api/agenda/series', { token: 'h.recep.s', body: { ...SERIE, profissionalId: BETO, dataInicio: '2027-03-03', ocorrencias: 2 } });
  const id = r.data.data.serie.id;
  const primeira = daSerie(id)[0];
  const m = await request('PATCH', `/api/agenda/${primeira.id}/status`, { token: 'h.recep.s', body: { novoStatus: 'reagendado', novaData: '2027-03-03', novoHorario: '15:00' } });
  assert.strictEqual(m.status, 200, m.raw);
  const nova = daSerie(id).find(a => a.status === 'agendado' && a.serie_seq === 1);
  assert.ok(nova && String(nova.horario).startsWith('15:00'), 'a nova continua como 1ª da série');
});

// --- Controle negativo -------------------------------------------------------
test('NC1 controle negativo: com "este e os próximos" pegando a série inteira, o S04 alteraria as anteriores', () => {
  const arquivo = path.join(__dirname, '../src/routes/series.js');
  const src = fs.readFileSync(arquivo, 'utf8');
  const de = "if (escopo === 'proximos') return futuras.filter(";
  assert.ok(src.includes(de), 'trecho do mutante não encontrado');
  const m = new Module(arquivo, module);
  m.filename = arquivo; m.paths = Module._nodeModulePaths(path.dirname(arquivo));
  m._compile(src.replace(de, "if (escopo === 'proximos') return futuras; if (false) return futuras.filter("), arquivo);
  const ocorr = [1, 2, 3].map(n => ({ id: `x${n}`, serie_seq: n, data: `2026-12-0${n}`, status: 'agendado' }));
  assert.strictEqual(m.exports.alvosDoEscopo(ocorr, ocorr[1], 'proximos').length, 3, 'mutante pega a anterior');
  const { alvosDoEscopo } = require('../src/routes/series');
  assert.deepStrictEqual(alvosDoEscopo(ocorr, ocorr[1], 'proximos').map(a => a.id), ['x2', 'x3']);
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
  console.log(`\nSéries Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();

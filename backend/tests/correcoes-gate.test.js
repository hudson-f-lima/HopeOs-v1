// Correções Gate (Agente J, 2026-11-09): um teste por bug de corretude corrigido.
// Cada teste falha no código de main 2e14226 (controle negativo: rodar este
// arquivo contra a árvore anterior) e passa com a correção.
// HTTP real contra o app; banco e identidade em memória; "agora" injetado.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-correcoes-token';
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
const occupancy = require('../src/engines/insights/occupancy');
const cashflow = require('../src/engines/insights/cashflow');
const retention = require('../src/engines/insights/retention');
const { buildDashboard } = require('../src/services/DashboardService');
const { app } = require('../src/app');

env.APP_TIMEZONE = 'America/Sao_Paulo';
// 22:30 de 09/11 em Brasília = 01:30 de 10/11 em UTC: a janela em que "hoje" UTC ≠ hoje local.
const AGORA = new Date('2026-11-10T01:30:00Z');
const HOJE = '2026-11-09'; // segunda-feira
clock.definirRelogio(() => AGORA);

const E = env.DEFAULT_EMPRESA_ID;
const ADMIN = 'c0000000-0000-4000-8000-0000000000f1';
const RECEP = 'c0000000-0000-4000-8000-0000000000f2';
const PROF = 'a0000000-0000-4000-8000-0000000000f1';
const SERV = 'b0000000-0000-4000-8000-0000000000f1';
const PROD = 'b0000000-0000-4000-8000-0000000000f2';
const CLI = 'd0000000-0000-4000-8000-0000000000f1';
const uuid = n => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

setIdentityStore(createMemoryIdentityStore({
  app_users: [ADMIN, RECEP].map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: 'f0000000-0000-4000-8000-0000000000f1', empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: E, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: E, user_id: RECEP, role: 'recepcao', status: 'ativo' }
  ],
  membership_units: [{ membership_id: 'm2', unit_id: 'f0000000-0000-4000-8000-0000000000f1' }]
}));
const tokens = { 'j.admin.s': ADMIN, 'j.recep.s': RECEP };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });

const semana = { seg: { ativo: true, inicio: '09:00', fim: '18:00' }, ter: { ativo: true, inicio: '09:00', fim: '18:00' } };
const ag = (n, status, extra = {}) => ({ id: uuid(n), empresa_id: E, cliente_id: CLI, servico_id: SERV, profissional_id: PROF, data: HOJE, horario: '10:00:00', duracao_min: 30, status, ...extra });

const db = installMemoryBackend({
  empresas: [{ id: E, nome: 'Salão J', slot_padrao: 30, horario_por_dia: semana, intervalo_almoco: true, almoco_inicio: '12:00', almoco_fim: '13:00' }],
  formas_pagamento: [
    { empresa_id: E, code: 'pix', label: 'Pix', taxa_pct: 0, taxa_fixa_centavos: 0, dias_recebimento: 0, ativo: true },
    { empresa_id: E, code: 'credito', label: 'Crédito', taxa_pct: 4, taxa_fixa_centavos: 0, dias_recebimento: 30, ativo: true }
  ],
  servicos: [{ id: SERV, empresa_id: E, nome: 'Corte', valor_centavos: 5000, duracao_min: 30, comissao_pct: 40, ativo: true }],
  profissionais: [{ id: PROF, empresa_id: E, nome: 'Robson', ativo: true, modelo_comissao: 'bruto_salao', horario: {}, overrides: {} }],
  profissional_servicos: [{ empresa_id: E, profissional_id: PROF, servico_id: SERV }],
  produtos: [{ id: PROD, empresa_id: E, nome: 'Pomada', preco_venda_centavos: 3000, custo_centavos: 1000, controla_estoque: true, estoque_atual: 0, ativo: true }],
  cargos: [], servico_categorias: [], clientes: [{ id: CLI, empresa_id: E, nome: 'Cliente J', ativo: true }],
  agendamentos: [
    ag(1, 'cancelado'), ag(2, 'no_show'), ag(3, 'reagendado'), ag(4, 'em_atendimento'), ag(5, 'aguardando')
  ],
  comandos: [], comando_itens: [], comando_pagamentos: [], comando_gorjetas: [], caixa_movimentos: [],
  comanda_estornos: [], comanda_estorno_itens: [], comanda_estorno_pagamentos: [], comanda_estorno_gorjetas: [],
  agendamento_eventos: []
});

let base;
function request(method, path, { token = 'j.admin.s', body } = {}) {
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
const corpo = (chave, extra = {}) => ({
  clienteId: CLI, idempotencyKey: chave, itens: [{ tipo: 'servico', servicoId: SERV, profissionalId: PROF }],
  payments: [{ formaCode: 'pix', valorCentavos: 5000 }], ...extra
});
const tests = [];
const test = (n, f) => tests.push({ n, f });

// ---------- 1. checkout × máquina de estados da agenda ----------
test('J01 checkout com agendamento cancelado/no_show/reagendado: 409 ANTES de gravar; nenhuma comanda, status intacto', async () => {
  for (const [n, status] of [[1, 'cancelado'], [2, 'no_show'], [3, 'reagendado']]) {
    const antes = db.comandos.length;
    const r = await request('POST', '/api/checkout/close', { token: 'j.recep.s', body: corpo(`j01-${status}`, { agendamentoId: uuid(n) }) });
    assert.strictEqual(r.status, 409, `${status}: ${JSON.stringify(r.data)}`);
    assert.strictEqual(code(r), 'INVALID_STATUS_TRANSITION', status);
    assert.strictEqual(db.comandos.length, antes, `${status}: comanda não pode ser gravada`);
    assert.strictEqual(db.agendamentos.find(a => a.id === uuid(n)).status, status, `${status} não vira concluido`);
    assert.strictEqual(db.agendamento_eventos.filter(e => e.agendamento_id === uuid(n)).length, 0, `${status}: sem evento falso na trilha`);
  }
});

test('J02 preview já recusa o vínculo inválido (o usuário descobre antes de fechar)', async () => {
  const r = await request('POST', '/api/checkout/preview', { token: 'j.recep.s', body: corpo('j02', { agendamentoId: uuid(1) }) });
  assert.strictEqual(r.status, 409, JSON.stringify(r.data));
  assert.strictEqual(code(r), 'INVALID_STATUS_TRANSITION');
});

test('J03 agendamentoId inexistente: 404 sem gravar comanda (antes: fechava e o vínculo falhava em silêncio)', async () => {
  const antes = db.comandos.length;
  const r = await request('POST', '/api/checkout/close', { token: 'j.recep.s', body: corpo('j03', { agendamentoId: uuid(999) }) });
  assert.strictEqual(r.status, 404, JSON.stringify(r.data));
  assert.strictEqual(code(r), 'AGENDAMENTO_NOT_FOUND');
  assert.strictEqual(db.comandos.length, antes);
});

test('J04 em_atendimento → concluido pelo checkout; retry com a mesma idempotencyKey não duplica comanda nem evento', async () => {
  const r = await request('POST', '/api/checkout/close', { token: 'j.recep.s', body: corpo('j04', { agendamentoId: uuid(4) }) });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  assert.strictEqual(r.data.data.agendamentoConcluido.status, 'concluido');
  assert.deepStrictEqual(r.data.data.vinculoAgenda, { aplicado: true, jaConcluido: false });
  const eventos = () => db.agendamento_eventos.filter(e => e.agendamento_id === uuid(4));
  assert.strictEqual(eventos().length, 1);
  assert.deepStrictEqual([eventos()[0].payload.de, eventos()[0].payload.para, eventos()[0].payload.origem], ['em_atendimento', 'concluido', 'checkout']);
  const retry = await request('POST', '/api/checkout/close', { token: 'j.recep.s', body: corpo('j04', { agendamentoId: uuid(4) }) });
  assert.strictEqual(retry.status, 201, `retry após a 1ª resposta se perder: ${JSON.stringify(retry.data)}`);
  assert.strictEqual(retry.data.data.saved.idempotent, true, 'memory backend espelha a idempotência do RPC');
  assert.strictEqual(retry.data.data.saved.comandoId, r.data.data.saved.comandoId);
  assert.strictEqual(db.comandos.filter(c => c.idempotency_key === 'j04').length, 1, 'uma comanda só');
  assert.strictEqual(eventos().length, 1, 'retry não grava evento de novo');
});

test('J05 checkout grava data/hora no fuso da empresa às 22:30 de Brasília (relógio injetado)', async () => {
  const r = await request('POST', '/api/checkout/close', { token: 'j.recep.s', body: corpo('j05', { agendamentoId: uuid(5) }) });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  const c = db.comandos.find(x => x.idempotency_key === 'j05');
  assert.deepStrictEqual([c.data, c.hora], [HOJE, '22:30']);
  assert.strictEqual(db.agendamentos.find(a => a.id === uuid(5)).status, 'concluido', 'aguardando → concluido é transição válida');
});

test('J06 memory backend espelha o RPC: falta de estoque não deixa comanda pela metade; retorno com contagens', async () => {
  const antes = JSON.stringify([db.comandos.length, db.comando_itens.length, db.comando_pagamentos.length, db.caixa_movimentos.length]);
  const r = await request('POST', '/api/checkout/close', { token: 'j.recep.s', body: {
    clienteId: CLI, idempotencyKey: 'j06', itens: [{ tipo: 'produto', produtoId: PROD, quantidade: 1 }], payments: [{ formaCode: 'pix', valorCentavos: 3000 }]
  } });
  assert.strictEqual(r.status, 422, JSON.stringify(r.data));
  assert.strictEqual(JSON.stringify([db.comandos.length, db.comando_itens.length, db.comando_pagamentos.length, db.caixa_movimentos.length]), antes, 'nada gravado');
  const ok = await request('POST', '/api/checkout/close', { token: 'j.recep.s', body: corpo('j06b') });
  assert.strictEqual(ok.status, 201);
  const s = ok.data.data.saved;
  assert.deepStrictEqual([s.idempotent, s.status, s.itens, s.pagamentos, s.caixaMovimentos], [false, 'fechado', 1, 1, 1]);
});

// ---------- 2. fuso horário nos insights ----------
test('J07 /insights/occupancy e /insights/margin sem datas usam HOJE no fuso da empresa (não a data UTC)', async () => {
  // 23h de 01/03/2027 em Brasília = 02h de 02/03 em UTC (relógio injetado, longe do real).
  clock.definirRelogio(() => new Date('2027-03-02T02:00:00Z'));
  try {
    const occ = await request('GET', '/api/insights/occupancy');
    assert.strictEqual(occ.status, 200, JSON.stringify(occ.data));
    assert.deepStrictEqual(occ.data.data.range, { from: '2027-03-01', to: '2027-03-01' });
  } finally { clock.definirRelogio(() => AGORA); }
  const m = await request('GET', '/api/insights/margin');
  assert.strictEqual(m.status, 200, JSON.stringify(m.data));
  assert.ok(m.data.data.ticketMedioCentavos > 0, 'as comandas fechadas hoje (09/11 local) entram no ticket de hoje');
  const inv = await request('GET', '/api/insights/margin?from=2026-11-10&to=2026-11-01');
  assert.strictEqual(inv.status, 400, 'from > to é recusado');
});

test('J08 /insights/cashflow: só recebíveis de hoje (local) até D+N; pagamento antigo não reaparece como entrada de hoje', async () => {
  const E2 = 'e0000000-0000-4000-8000-0000000000f2';
  db.empresas.push({ id: E2, nome: 'Fluxo' });
  db.formas_pagamento.push(
    { empresa_id: E2, code: 'pix', dias_recebimento: 0 },
    { empresa_id: E2, code: 'credito', dias_recebimento: 30 }
  );
  db.comandos.push(
    { id: 'cf-old', empresa_id: E2, data: '2026-09-01', status: 'fechado' },
    { id: 'cf-hoje', empresa_id: E2, data: HOJE, status: 'fechado' },
    { id: 'cf-cred', empresa_id: E2, data: '2026-10-20', status: 'fechado' }
  );
  db.comando_pagamentos.push(
    { id: 'p1', empresa_id: E2, comando_id: 'cf-old', forma_code: 'pix', valor_centavos: 10000, taxa_total_centavos: 0 },
    { id: 'p2', empresa_id: E2, comando_id: 'cf-hoje', forma_code: 'pix', valor_centavos: 5000, taxa_total_centavos: 0 },
    { id: 'p3', empresa_id: E2, comando_id: 'cf-cred', forma_code: 'credito', valor_centavos: 5000, taxa_total_centavos: 200 }
  );
  const { InsightsService } = require('../src/services/InsightsService');
  const r = await new InsightsService(E2).loadCashflowInsights(30, HOJE);
  assert.strictEqual(r.curva[0].data, HOJE);
  assert.strictEqual(r.acumulado7dCentavos, 5000, 'só o pix de hoje (o de setembro já foi recebido)');
  assert.strictEqual(r.acumulado30dCentavos, 9800, 'pix de hoje + crédito de 20/10 que liquida em 19/11');
  assert.strictEqual(r.curva.find(d => d.data === '2026-11-19').liquidoCentavos, 4800);
  assert.strictEqual(r.porForma.find(f => f.formaCode === 'pix').liquidoCentavos, 5000, 'líquido por forma = o da projeção');
  const http1 = await request('GET', '/api/insights/cashflow');
  assert.strictEqual(http1.status, 200);
  assert.strictEqual(http1.data.data.curva[0].data, HOJE, 'rota usa hoje no fuso da empresa');
  assert.strictEqual((await request('GET', '/api/insights/cashflow?days=abc')).status, 400);
  assert.strictEqual((await request('GET', '/api/insights/cashflow?days=-5')).status, 400);
});

// ---------- 3. ocupação com o horário real do onboarding ----------
test('J09 ocupação lê horario_por_dia { seg: { ativo, inicio, fim } } da empresa e desconta o almoço', () => {
  const empresa = { horario_por_dia: semana, intervalo_almoco: true, almoco_inicio: '12:00', almoco_fim: '13:00' };
  const profs = [{ id: 'p', nome: 'P', ativo: true, horario: {} }];
  const ags = [{ profissional_id: 'p', data: HOJE, horario: '10:00:00', duracao_min: 60, status: 'em_atendimento' }];
  const lf = occupancy.computeLoadFactor(ags, profs, HOJE, HOJE, empresa);
  assert.deepStrictEqual(lf, { loadFactorPct: 12.5, minutosVendidos: 60, minutosDisponiveis: 480 }, '09–18 menos 1h de almoço = 480 min');
  const gaps = occupancy.computeGaps(ags, profs, HOJE, 30, empresa).map(g => `${g.inicio}-${g.fim}`);
  assert.deepStrictEqual(gaps, ['09:00-10:00', '11:00-12:00', '13:00-18:00'], 'almoço não é buraco');
});

test('J10 heatmap de 2 semanas: disponível soma cada data (1 atendimento de 1h em 2 segundas = 50%, não 100%)', () => {
  const profs = [{ id: 'p', ativo: true, horario: { seg: { ativo: true, inicio: '09:00', fim: '18:00' } } }];
  const ags = [{ profissional_id: 'p', data: '2026-11-02', horario: '10:00', duracao_min: 60, status: 'concluido' }];
  const h = occupancy.computeHeatmap(ags, profs, '2026-11-02', '2026-11-15', {});
  assert.strictEqual(h.find(x => x.dow === 1 && x.hora === 10).ocupacaoPct, 50);
});

test('J11 SUR por profissional cobre o período inteiro e noShowMin só conta faltas do período', async () => {
  db.agendamentos.push(
    ag(20, 'concluido', { data: '2026-11-10', horario: '09:00:00', duracao_min: 60 }),
    ag(21, 'no_show', { data: '2026-01-05', horario: '09:00:00', duracao_min: 45 })
  );
  const r = await request('GET', `/api/insights/occupancy?from=${HOJE}&to=2026-11-10`);
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  const p = r.data.data.porProfissional.find(x => x.profissionalId === PROF);
  assert.strictEqual(p.minutosDisponiveis, 960, '2 dias × 480 min (antes: só o 1º dia)');
  assert.ok(p.minutosVendidos >= 60, 'atendimento de 10/11 entra');
  assert.strictEqual(p.noShowMin, 30, 'só a falta de 09/11; a de janeiro fica fora');
});

// ---------- 4. retenção ----------
test('J12 sugestão de retorno usa a hora real da comanda (Postgres devolve HH:MM:SS)', () => {
  const hist = [
    { cliente_id: 'c', servico_id: 's', data: '2026-09-01', hora: '15:00:00' },
    { cliente_id: 'c', servico_id: 's', data: '2026-10-01', hora: '15:00:00' }
  ];
  assert.strictEqual(retention.computeRebooking(hist, 's', { hoje: HOJE }).horaSugerida, '15:00');
});

test('J13 confiabilidade: agendamento de hoje ainda em aberto (ou cliente na cadeira) não zera a sequência', () => {
  const base = [1, 2, 3].map(i => ({ data: `2026-10-0${i}`, horario: '10:00:00', status: 'concluido' }));
  for (const status of ['agendado', 'confirmado', 'aguardando', 'em_atendimento']) {
    const r = retention.computeReliability([...base, { data: HOJE, horario: '23:00:00', status }], HOJE);
    assert.strictEqual(r.fatores.streakConcluidos, 3, status);
  }
  const falta = retention.computeReliability([...base, { data: '2026-11-01', horario: '10:00', status: 'no_show' }], HOJE);
  assert.strictEqual(falta.fatores.streakConcluidos, 0, 'falta continua quebrando a sequência');
});

// ---------- 5. dashboard e margem ----------
test('J14 ocupação do dashboard não conta o agendamento substituído por reagendamento', () => {
  const d = buildDashboard({ agendamentos: [{ status: 'concluido' }, { status: 'reagendado' }, { status: 'concluido' }] });
  assert.strictEqual(d.kpis.ocupacaoPct, 100);
});

test('J15 ticket médio de um período não muda por estorno total lançado DEPOIS do período', async () => {
  const E3 = 'e0000000-0000-4000-8000-0000000000f3';
  db.comandos.push(
    { id: 'tk1', empresa_id: E3, data: '2026-10-10', status: 'fechado', total_recebido_centavos: 10000 },
    { id: 'tk2', empresa_id: E3, data: '2026-10-11', status: 'fechado', total_recebido_centavos: 6000 }
  );
  db.comanda_estornos.push({ id: 'es1', empresa_id: E3, comando_id: 'tk1', tipo: 'total', data: '2026-11-05', reembolso_centavos: 10000 });
  db.comanda_estorno_pagamentos.push({ id: 'ep1', empresa_id: E3, estorno_id: 'es1', comando_id: 'tk1', forma_code: 'pix', valor_centavos: 10000 });
  const { InsightsService } = require('../src/services/InsightsService');
  const out = await new InsightsService(E3).loadMarginInsights('2026-10-01', '2026-10-31');
  assert.strictEqual(out.ticketMedioCentavos, 8000, 'outubro fechado: (10000 + 6000) / 2');
  const nov = await new InsightsService(E3).loadMarginInsights('2026-11-01', '2026-11-30');
  assert.strictEqual(nov.estornos.reembolsoCentavos, 10000, 'o estorno aparece no mês DO estorno');
});

test('J16 cashflow puro sem data no pagamento continua compatível (data-base)', () => {
  const cf = cashflow.projectCashflow([{ forma_code: 'pix', valor_centavos: 100, taxa_total_centavos: 0 }], [{ code: 'pix', dias_recebimento: 0 }], HOJE, 3);
  assert.deepStrictEqual(cf.map(d => d.data), [HOJE, '2026-11-10', '2026-11-11', '2026-11-12']);
  assert.strictEqual(cf[0].liquidoCentavos, 100);
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
  clock.definirRelogio(null);
  console.log(`\nCorreções Gate: ${passed}/${tests.length} testes verdes.`);
  if (failed) process.exit(1);
})();

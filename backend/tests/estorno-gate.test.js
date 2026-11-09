// Estorno Gate (D-013, migration 009): POST /api/comandas/:id/estorno e leituras.
// HTTP real contra o app; banco e identidade em memória (espelho da RPC
// comanda_estornar). "Agora" é fixo (config/clock): 2026-12-02 12:00 em São Paulo.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-estorno-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { randomUUID } = require('crypto');
const { env } = require('../src/config/env');
const clock = require('../src/config/clock');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { generateCredential } = require('../src/auth/credentials');
const { ACTIONS } = require('../src/auth/rbac');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { computeCotaParte } = require('../src/engines/insights/cotaParte');
const { buildFechamentoCaixa } = require('../src/engines/CaixaEngine');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

clock.definirRelogio(() => new Date('2026-12-02T15:00:00Z'));
const HOJE = '2026-12-02';

const E = env.DEFAULT_EMPRESA_ID;
const EB = 'e0000000-0000-4000-8000-0000000000eb';
const [ADMIN, GESTOR, RECEP, PROFU, ADMIN_B] = ['c1', 'c2', 'c3', 'c4', 'c5'].map(s => `c0000000-0000-4000-8000-0000000000${s}`);
const UNIT = 'f0000000-0000-4000-8000-0000000000e1';
const PROF = 'a0000000-0000-4000-8000-0000000000e1';
const SERV = 'b0000000-0000-4000-8000-0000000000e1';
const PRD = 'd0000000-0000-4000-8000-0000000000e1';
const PRDX = 'd0000000-0000-4000-8000-0000000000e2';
const INTEG = '11000000-0000-4000-8000-0000000000e1';
const id = n => `${n}0000000-0000-4000-8000-0000000000e1`;
const [CM_DEZ, CM_NOV, CM_OLD, CM_X, CM_B] = ['1', '2', '3', '4', '5'].map(id);
const [I_S, I_P, I_N, I_O, I_X, I_B] = ['6', '7', '8', '9', 'a', 'b'].map(n => `${n}1000000-0000-4000-8000-0000000000e1`);

const store = createMemoryIdentityStore({
  app_users: [ADMIN, GESTOR, RECEP, PROFU, ADMIN_B].map(u => ({ id: u, email: `${u}@t`, nome: u, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: E, user_id: ADMIN, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: E, user_id: GESTOR, role: 'gestor', status: 'ativo' },
    { id: 'm3', empresa_id: E, user_id: RECEP, role: 'recepcao', status: 'ativo' },
    { id: 'm4', empresa_id: E, user_id: PROFU, role: 'profissional', status: 'ativo', profissional_id: PROF },
    { id: 'm5', empresa_id: EB, user_id: ADMIN_B, role: 'admin', status: 'ativo' }
  ],
  membership_units: [{ membership_id: 'm3', unit_id: UNIT }, { membership_id: 'm4', unit_id: UNIT }]
});
setIdentityStore(store);
const tokens = { 'h.admin.s': ADMIN, 'h.gestor.s': GESTOR, 'h.recep.s': RECEP, 'h.prof.s': PROFU, 'h.adminb.s': ADMIN_B };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });

// Integração com o scope forçado no banco (a API de admin nem deixa criar): mesmo assim 403.
const credId = randomUUID();
const { token: INTEG_TOKEN, secretHash } = generateCredential(credId);
store.db.integrations.push({ id: INTEG, empresa_id: E, nome: 'ERP', status: 'ativo' });
store.db.integration_credentials.push({ id: credId, integration_id: INTEG, secret_hash: secretHash, revoked_at: null, expires_at: null });
store.db.integration_scopes.push({ integration_id: INTEG, scope: 'checkout:estornar' }, { integration_id: INTEG, scope: 'relatorios:full' });

// Fixtures no formato que o RPC checkout_close grava (migration 003).
const cmd = (cid, empresa_id, data, t) => ({ id: cid, empresa_id, data, hora: '10:00', status: 'fechado', ...t });
const item = (iid, comando_id, empresa_id, t) => ({ id: iid, comando_id, empresa_id, ...t });
const servico = (valor, comissao, taxa = 0) => ({ tipo: 'servico', servico_id: SERV, profissional_id: PROF, quantidade: 1, descricao: 'Corte', valor_liquido_centavos: valor, total_venda_centavos: valor, comissao_centavos: comissao, receita_empresa_centavos: valor - comissao - taxa, taxa_item_centavos: taxa, total_custo_centavos: 0 });
const produto = (pid, qtd, valor, custo) => ({ tipo: 'produto', produto_id: pid, profissional_id: null, quantidade: qtd, descricao: 'Pomada', valor_liquido_centavos: valor, total_venda_centavos: valor, total_custo_centavos: custo, custo_unitario_centavos: custo / qtd, lucro_bruto_centavos: valor - custo, comissao_centavos: 0, receita_empresa_centavos: valor });
const pag = (comando_id, empresa_id, forma_code, valor_centavos, taxa_total_centavos = 0) => ({ id: randomUUID(), comando_id, empresa_id, forma_code, valor_centavos, taxa_total_centavos });
const mov = (comando_id, empresa_id, data, forma_code, valor_centavos) => ({ id: randomUUID(), comando_id, empresa_id, data, tipo: 'entrada_pagamento', forma_code, valor_centavos });

const db = installMemoryBackend({
  empresas: [{ id: E, nome: 'A', salao_parceiro: true }, { id: EB, nome: 'B' }],
  profissionais: [{ id: PROF, empresa_id: E, nome: 'Robson', ativo: true }],
  produtos: [
    { id: PRD, empresa_id: E, nome: 'Pomada', estoque_atual: 7, controla_estoque: true, ativo: true },
    { id: PRDX, empresa_id: E, nome: 'Óleo', estoque_atual: 5, controla_estoque: true, ativo: true }
  ],
  clientes: [], formas_pagamento: [],
  comandos: [
    cmd(CM_DEZ, E, HOJE, { servicos_liquidos_centavos: 10000, produtos_liquidos_centavos: 3000, itens_liquidos_centavos: 13000, gorjeta_bruta_centavos: 1000, total_recebido_centavos: 14000, taxa_total_centavos: 300, total_comissao_centavos: 4000, total_gorjeta_liquida_centavos: 1000, receita_empresa_centavos: 8700 }),
    cmd(CM_NOV, E, '2026-11-20', { servicos_liquidos_centavos: 5000, itens_liquidos_centavos: 5000, total_recebido_centavos: 5000, total_comissao_centavos: 2000, receita_empresa_centavos: 3000 }),
    cmd(CM_OLD, E, '2026-11-01', { servicos_liquidos_centavos: 2000, itens_liquidos_centavos: 2000, total_recebido_centavos: 2000, total_comissao_centavos: 800, receita_empresa_centavos: 1200 }),
    cmd(CM_X, E, '2026-12-01', { produtos_liquidos_centavos: 3000, itens_liquidos_centavos: 3000, total_recebido_centavos: 3000, receita_empresa_centavos: 3000 }),
    cmd(CM_B, EB, HOJE, { servicos_liquidos_centavos: 1000, itens_liquidos_centavos: 1000, total_recebido_centavos: 1000, receita_empresa_centavos: 1000 })
  ],
  comando_itens: [
    item(I_S, CM_DEZ, E, servico(10000, 4000, 300)),
    item(I_P, CM_DEZ, E, produto(PRD, 3, 3000, 1500)),
    item(I_N, CM_NOV, E, servico(5000, 2000)),
    item(I_O, CM_OLD, E, servico(2000, 800)),
    item(I_X, CM_X, E, produto(PRDX, 3, 3000, 1500)),
    item(I_B, CM_B, EB, { ...servico(1000, 0), profissional_id: null })
  ],
  comando_pagamentos: [
    pag(CM_DEZ, E, 'credito', 10000, 300), pag(CM_DEZ, E, 'pix', 4000),
    pag(CM_NOV, E, 'dinheiro', 5000), pag(CM_OLD, E, 'pix', 2000), pag(CM_X, E, 'pix', 3000), pag(CM_B, EB, 'pix', 1000)
  ],
  comando_gorjetas: [{ id: randomUUID(), comando_id: CM_DEZ, empresa_id: E, profissional_id: PROF, valor_bruto_centavos: 1000, valor_liquido_centavos: 1000, taxa_centavos: 0 }],
  caixa_movimentos: [
    mov(CM_DEZ, E, HOJE, 'credito', 10000), mov(CM_DEZ, E, HOJE, 'pix', 4000),
    mov(CM_NOV, E, '2026-11-20', 'dinheiro', 5000), mov(CM_OLD, E, '2026-11-01', 'pix', 2000),
    mov(CM_X, E, '2026-12-01', 'pix', 3000), mov(CM_B, EB, HOJE, 'pix', 1000)
  ]
});

let base;
function request(method, path, { token = 'h.admin.s', body, headers: extra = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra };
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
const MOTIVO = { motivoCodigo: 'erro_lancamento', motivo: 'Lançamento em duplicidade no balcão' };
const estornar = (cid, body, token) => request('POST', `/api/comandas/${cid}/estorno`, { token, body: { ...MOTIVO, ...body } });
const cota = async mes => (await request('GET', `/api/relatorios/cota-parte?mes=${mes}`)).data.data;
const caixa = async data => (await request('GET', `/api/caixa/fechamento?data=${data}`)).data.data;
const tests = [];
const test = (n, f) => tests.push({ n, f });
const parcialPomada = (key, quantidade, valor) => ({ tipo: 'parcial', idempotencyKey: key, itens: [{ comandoItemId: I_P, quantidade }], reembolsos: [{ formaCode: 'pix', valorCentavos: valor }] });

// ---- verificações reutilizadas pelos controles negativos ----
async function checarRbac() {
  const body = { ...MOTIVO, tipo: 'total' }; // sem idempotencyKey: se o RBAC falhar, nada é gravado (422)
  for (const [token, esperado] of [['h.recep.s', 'INSUFFICIENT_ROLE'], ['h.prof.s', 'INSUFFICIENT_ROLE'], [env.API_ACCESS_TOKEN, 'USER_PRINCIPAL_REQUIRED'], [INTEG_TOKEN, 'USER_PRINCIPAL_REQUIRED']]) {
    const r = await request('POST', `/api/comandas/${CM_DEZ}/estorno`, { token, body });
    assert.strictEqual(r.status, 403, `${esperado}: ${r.status} ${JSON.stringify(r.data)}`);
    assert.strictEqual(code(r), esperado);
  }
}
function checarCotaParte(fn) {
  // Novembro (mês fechado) não muda com o estorno lançado em dezembro.
  const args = mes => ({ comandos: db.comandos.filter(c => c.empresa_id === E), comandoItens: db.comando_itens.filter(i => i.empresa_id === E), profissionais: db.profissionais, mes, estornos: db.comanda_estornos || [], estornoItens: db.comanda_estorno_itens || [] });
  const nov = fn(args('2026-11'));
  assert.deepStrictEqual([nov.valorItensCentavos, nov.cotaParteSalaoCentavos, nov.cotaParteProfissionaisCentavos], [7000, 4200, 2800], 'novembro fechado mudou');
  const dez = fn(args('2026-12'));
  assert.deepStrictEqual([dez.valorItensCentavos, dez.cotaParteSalaoCentavos, dez.cotaParteProfissionaisCentavos], [10000, 7700, 2000], `dezembro não descontou os estornos: ${JSON.stringify(dez)}`);
}
function checarCaixaDoEstorno(fn) {
  const f = fn({ data: HOJE, comandos: db.comandos.filter(c => c.empresa_id === E && c.data === HOJE), pagamentos: db.comando_pagamentos.filter(p => p.comando_id === CM_DEZ), movimentos: db.caixa_movimentos.filter(m => m.empresa_id === E && m.data === HOJE), formasPagamento: [] });
  assert.strictEqual(f.totalBrutoCentavos, 14000, 'vendas do dia');
  assert.ok(f.estornos, 'fechamento sem a seção de estornos');
  assert.strictEqual(f.estornos.valorCentavos, -6000, 'linha negativa do estorno no dia');
  assert.strictEqual(f.saldoDoDiaCentavos, 8000);
  assert.strictEqual(f.dinheiro.esperadoCentavos, -5000, 'dinheiro devolvido sai da gaveta do dia do estorno');
}

test('E01 RBAC: recepção, profissional, token legado e integração (mesmo com o scope) recebem 403; nada é gravado', async () => {
  await checarRbac();
  assert.strictEqual((db.comanda_estornos || []).length, 0);
  assert.strictEqual(ACTIONS['checkout:estornar'].userOnly, true);
  const r = await request('POST', '/api/admin/integrations', { body: { nome: 'X', scopes: ['checkout:estornar'] } });
  assert.strictEqual(r.status, 422, 'admin não pode dar scope de estorno a integração');
  assert.strictEqual((await request('POST', `/api/comandas/${CM_DEZ}/estorno`, { token: null, body: {} })).status, 401);
});

test('E02 validação: idempotencyKey e motivo obrigatórios; autoria no body proibida; total não recebe itens', async () => {
  const casos = [
    [{ tipo: 'total' }, 'IDEMPOTENCY_KEY_REQUIRED'],
    [{ tipo: 'total', idempotencyKey: 'v1', motivo: 'curto' }, 'ESTORNO_PAYLOAD_INVALIDO'],
    [{ tipo: 'total', idempotencyKey: 'v2', motivoCodigo: 'porque_sim' }, 'ESTORNO_PAYLOAD_INVALIDO'],
    [{ tipo: 'total', idempotencyKey: 'v3', actorId: ADMIN }, 'FORBIDDEN_FIELD'],
    [{ tipo: 'total', idempotencyKey: 'v4', empresaId: EB }, 'FORBIDDEN_FIELD'],
    [{ tipo: 'total', idempotencyKey: 'v5', itens: [{ comandoItemId: I_P, quantidade: 1 }] }, 'ESTORNO_PAYLOAD_INVALIDO'],
    [{ tipo: 'parcial', idempotencyKey: 'v6' }, 'ESTORNO_ITENS_OBRIGATORIOS'],
    [{ tipo: 'parcial', idempotencyKey: 'v7', itens: [{ comandoItemId: I_P, quantidade: 1.5 }] }, 'ESTORNO_PAYLOAD_INVALIDO'],
    [{ tipo: 'parcial', idempotencyKey: 'v8', itens: [{ comandoItemId: I_P, quantidade: 1 }, { comandoItemId: I_P, quantidade: 1 }] }, 'ESTORNO_PAYLOAD_INVALIDO'],
    [{ tipo: 'parcial', idempotencyKey: 'v9', itens: [{ comandoItemId: I_P, quantidade: 1, valorCentavos: 1 }] }, 'FORBIDDEN_FIELD']
  ];
  for (const [body, esperado] of casos) {
    const r = await estornar(CM_DEZ, body);
    assert.strictEqual(r.status, 422, `${JSON.stringify(body)} → ${r.status}`);
    assert.strictEqual(code(r), esperado, JSON.stringify(body));
  }
  assert.strictEqual((db.comanda_estornos || []).length, 0);
});

test('E03 parcial: 1 de 3 unidades; sem forma com 2 formas → 422; com Pix → 201, caixa −1000 hoje, estoque devolvido', async () => {
  const semForma = await estornar(CM_DEZ, { tipo: 'parcial', idempotencyKey: 'p0', itens: [{ comandoItemId: I_P, quantidade: 1 }] });
  assert.strictEqual(code(semForma), 'ESTORNO_FORMA_OBRIGATORIA');
  const r = await estornar(CM_DEZ, { tipo: 'parcial', idempotencyKey: 'p1', itens: [{ comandoItemId: I_P, quantidade: 1 }], reembolsoForma: 'pix' });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  const e = r.data.data;
  assert.strictEqual(e.idempotent, false);
  assert.deepStrictEqual([e.itensCentavos, e.custoCentavos, e.comissaoCentavos, e.reembolsoCentavos, e.gorjetaBrutaCentavos], [1000, 500, 0, 1000, 0]);
  assert.strictEqual(e.data, HOJE); assert.strictEqual(e.actorId, ADMIN); assert.strictEqual(e.statusComanda, 'estornado_parcial');
  assert.ok(db.caixa_movimentos.some(m => m.comando_id === CM_DEZ && m.tipo === 'estorno_pagamento' && m.valor_centavos === -1000 && m.data === HOJE));
  assert.strictEqual(db.produtos.find(p => p.id === PRD).estoque_atual, 8);
  assert.ok(db.produto_estoque_movimentos.some(m => m.tipo === 'devolucao' && m.quantidade === 1 && m.actor_id === ADMIN));
  const lista = (await request('GET', `/api/comandas?data=${HOJE}`)).data.data;
  const c = lista.comandas.find(x => x.id === CM_DEZ);
  assert.strictEqual(c.status, 'estornado_parcial'); assert.strictEqual(c.estornavel, true);
  assert.strictEqual(c.itens.find(i => i.id === I_P).restante, 2);
  assert.deepStrictEqual(c.formas, [{ formaCode: 'credito', disponivelCentavos: 10000 }, { formaCode: 'pix', disponivelCentavos: 3000 }]);
  assert.strictEqual(lista.comandas.some(x => x.id === CM_B), false, 'lista mostra comanda de outra empresa');
});

test('E04 idempotência: mesma chave + mesmo pedido = mesmo estorno (200); mesma chave + outro pedido = 409', async () => {
  const antes = db.comanda_estornos.length;
  const r = await estornar(CM_DEZ, { reembolsoForma: 'pix', itens: [{ quantidade: 1, comandoItemId: I_P }], idempotencyKey: 'p1', tipo: 'parcial' });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(r.data.data.idempotent, true);
  assert.strictEqual(r.data.data.estornoId, db.comanda_estornos[0].id);
  assert.strictEqual(db.comanda_estornos.length, antes);
  assert.strictEqual(db.produtos.find(p => p.id === PRD).estoque_atual, 8, 'repetição devolveu estoque de novo');
  const outro = await estornar(CM_DEZ, parcialPomada('p1', 2, 2000));
  assert.strictEqual(outro.status, 409); assert.strictEqual(code(outro), 'IDEMPOTENCY_MISMATCH');
});

test('E05 limite do vendido: Σ parciais ≤ quantidade; reembolso ≤ pago na forma; item de outra comanda recusado', async () => {
  const excede = await estornar(CM_DEZ, parcialPomada('p2', 3, 3000));
  assert.strictEqual(excede.status, 409, JSON.stringify(excede.data)); assert.strictEqual(code(excede), 'ESTORNO_EXCEDE');
  const acimaForma = await estornar(CM_DEZ, { tipo: 'parcial', idempotencyKey: 'p3', itens: [{ comandoItemId: I_S, quantidade: 1 }], reembolsos: [{ formaCode: 'pix', valorCentavos: 10000 }] });
  assert.strictEqual(code(acimaForma), 'ESTORNO_EXCEDE', 'reembolso acima do pago no Pix');
  const divergente = await estornar(CM_DEZ, parcialPomada('p4', 1, 999));
  assert.strictEqual(code(divergente), 'ESTORNO_REEMBOLSO_DIVERGENTE');
  const outraComanda = await estornar(CM_DEZ, { tipo: 'parcial', idempotencyKey: 'p5', itens: [{ comandoItemId: I_N, quantidade: 1 }] });
  assert.strictEqual(code(outraComanda), 'ESTORNO_ITEM_INVALIDO');
  assert.strictEqual(db.comanda_estornos.length, 1);
});

test('E06 prazo: comanda com 31 dias → 422; a data do estorno é sempre a do servidor', async () => {
  const r = await estornar(CM_OLD, { tipo: 'total', idempotencyKey: 'old' });
  assert.strictEqual(r.status, 422); assert.strictEqual(code(r), 'ESTORNO_PRAZO_EXPIRADO');
  const lista = (await request('GET', '/api/comandas?data=2026-11-01')).data.data;
  assert.strictEqual(lista.comandas[0].estornavel, false);
  assert.strictEqual(lista.comandas[0].prazoAte, '2026-12-01');
});

test('E07 isolamento: admin da empresa B não estorna nem lê comanda da A (404), mesmo com X-Empresa-Id', async () => {
  const r = await estornar(CM_DEZ, { tipo: 'total', idempotencyKey: 'b1' }, 'h.adminb.s');
  assert.strictEqual(r.status, 404, JSON.stringify(r.data)); assert.strictEqual(code(r), 'COMANDA_NOT_FOUND');
  const sel = await request('POST', `/api/comandas/${CM_DEZ}/estorno`, { token: 'h.adminb.s', headers: { 'x-empresa-id': E }, body: { ...MOTIVO, tipo: 'total', idempotencyKey: 'b2' } });
  assert.strictEqual(sel.status, 403, 'seletor fora das memberships');
  assert.strictEqual((await request('GET', `/api/comandas/${CM_DEZ}/estornos`, { token: 'h.adminb.s' })).status, 404);
  assert.strictEqual(code(await estornar(CM_B, { tipo: 'total', idempotencyKey: 'b3' })), 'COMANDA_NOT_FOUND', 'A estornou comanda da B');
  assert.strictEqual(db.comanda_estornos.filter(e => e.comando_id === CM_B || e.empresa_id === EB).length, 0);
});

test('E08 total de comanda de novembro lançado em dezembro (gestor): cota-parte de novembro não muda; dezembro desconta', async () => {
  const novAntes = await cota('2026-11');
  const r = await estornar(CM_NOV, { tipo: 'total', idempotencyKey: 'nov-total', motivoCodigo: 'insatisfacao', motivo: 'Cliente insatisfeita com o corte' }, 'h.gestor.s');
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  assert.deepStrictEqual([r.data.data.itensCentavos, r.data.data.comissaoCentavos, r.data.data.receitaEmpresaCentavos, r.data.data.reembolsoCentavos], [5000, 2000, 3000, 5000]);
  assert.strictEqual(r.data.data.data, HOJE, 'estorno de dia anterior é lançado hoje');
  const novDepois = await cota('2026-11');
  assert.deepStrictEqual(novDepois, novAntes, 'cota-parte de mês fechado mudou');
  const dez = await cota('2026-12');
  assert.deepStrictEqual([dez.valorItensCentavos, dez.cotaParteSalaoCentavos, dez.cotaParteProfissionaisCentavos], [10000, 7700, 2000]);
  assert.strictEqual(dez.estornos.quantidade, 2);
  checarCotaParte(computeCotaParte);
  const ag = (await caixa('2026-11-20'));
  assert.strictEqual(ag.dinheiro.esperadoCentavos, 5000, 'caixa do dia da comanda mudou');
  assert.strictEqual(ag.estornos.valorCentavos, 0);
});

test('E09 caixa do dia do estorno: linha negativa por forma; saldo do dia e dinheiro esperado descontam', async () => {
  const f = await caixa(HOJE);
  assert.strictEqual(f.totalBrutoCentavos, 14000);
  assert.deepStrictEqual(f.estornos, { quantidadeMovimentos: 2, valorCentavos: -6000, porForma: [{ formaCode: 'dinheiro', valorCentavos: -5000 }, { formaCode: 'pix', valorCentavos: -1000 }] });
  assert.strictEqual(f.saldoDoDiaCentavos, 8000);
  assert.strictEqual(f.ledger.consistente, true, 'estorno não pode quebrar a conferência pagamentos × caixa');
  checarCaixaDoEstorno(buildFechamentoCaixa);
});

test('E10 total depois do parcial: reverte saldo, gorjeta e devolve por forma; depois disso 409; financeiro = sem a comanda − taxa', async () => {
  const r = await estornar(CM_DEZ, { tipo: 'total', idempotencyKey: 'dez-total' });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  const e = r.data.data;
  assert.deepStrictEqual([e.itensCentavos, e.comissaoCentavos, e.gorjetaBrutaCentavos, e.gorjetaLiquidaCentavos, e.reembolsoCentavos, e.receitaEmpresaCentavos], [12000, 4000, 1000, 1000, 13000, 8000]);
  assert.deepStrictEqual(e.reembolsos, [{ formaCode: 'credito', valorCentavos: 10000 }, { formaCode: 'pix', valorCentavos: 3000 }]);
  assert.strictEqual(e.statusComanda, 'estornado');
  assert.strictEqual(db.produtos.find(p => p.id === PRD).estoque_atual, 10);
  assert.strictEqual(code(await estornar(CM_DEZ, { tipo: 'total', idempotencyKey: 'dez-total-2' })), 'ESTORNO_JA_TOTAL');
  assert.strictEqual(code(await estornar(CM_DEZ, parcialPomada('dez-p', 1, 1000))), 'ESTORNO_JA_TOTAL');

  // Financeiro: só sobram CM_OLD (2000, comissão 800, receita 1200) e CM_X (3000, receita 3000);
  // a taxa de 300 do crédito de CM_DEZ fica com o salão (D-013).
  const fin = (await request('GET', '/api/financeiro/resumo')).data.data;
  assert.strictEqual(fin.totals.totalRecebidoCentavos, 5000);
  assert.strictEqual(fin.totals.totalComissaoCentavos, 800);
  assert.strictEqual(fin.totals.gorjetaLiquidaCentavos, 0);
  assert.strictEqual(fin.totals.receitaEmpresaCentavos, 1200 + 3000 - 300);
  assert.strictEqual(fin.totals.itensLiquidosCentavos, 5000);
  assert.strictEqual(fin.totals.comandasValidas, 2);
  assert.strictEqual(fin.estornos.quantidade, 3);
  const robson = fin.repassesPorProfissional.find(p => p.profissionalId === PROF);
  assert.deepStrictEqual([robson.comissaoCentavos, robson.gorjetaLiquidaCentavos, robson.servicosCentavos], [800, 0, 2000]);
  const dash = (await request('GET', '/api/dashboard')).data.data;
  assert.strictEqual(dash.kpis.ticketMedioCentavos, 2500, 'ticket médio sem as comandas 100% estornadas');
});

test('E11 margem do período do estorno (dezembro) desconta pela data do estorno; GET estornos lista o histórico', async () => {
  const m = (await request('GET', '/api/insights/margin?from=2026-12-01&to=2026-12-31')).data.data;
  const corte = m.porServico.find(s => s.servicoId === SERV);
  // Dezembro: +10000 vendido (CM_DEZ) − 10000 estorno CM_DEZ − 5000 estorno CM_NOV (lançado em dezembro).
  assert.strictEqual(corte.producaoCentavos, -5000); assert.strictEqual(corte.n, 1);
  assert.strictEqual(m.estornos.quantidade, 3);
  const nov = (await request('GET', '/api/insights/margin?from=2026-11-01&to=2026-11-30')).data.data;
  assert.strictEqual(nov.porServico.find(s => s.servicoId === SERV).producaoCentavos, 7000, 'novembro mudou');
  const h = (await request('GET', `/api/comandas/${CM_DEZ}/estornos`)).data.data;
  assert.deepStrictEqual(h.estornos.map(x => x.tipo), ['parcial', 'total']);
  assert.strictEqual(h.comanda.status, 'estornado'); assert.strictEqual(h.comanda.estornavel, false);
  assert.strictEqual(h.estornos[1].gorjetas[0].valorLiquidoCentavos, 1000);
  assert.strictEqual((await request('GET', `/api/comandas/${CM_DEZ}/estornos`, { token: 'h.recep.s' })).status, 403);
});

// ---------- controles negativos: os testes acima pegam a regressão ----------
test('N01 controle negativo RBAC: sem userOnly e com recepção nos papéis, a verificação de E01 reprova', async () => {
  const original = ACTIONS['checkout:estornar'];
  ACTIONS['checkout:estornar'] = { roles: ['admin', 'gestor', 'recepcao', 'profissional'] };
  try { await assert.rejects(checarRbac(), /403|INSUFFICIENT_ROLE|USER_PRINCIPAL_REQUIRED/); }
  finally { ACTIONS['checkout:estornar'] = original; }
  await checarRbac();
});

test('N02 controle negativo relatórios: cota-parte e caixa que ignoram o estorno reprovam as verificações de E08/E09', async () => {
  assert.throws(() => checarCotaParte(a => computeCotaParte({ ...a, estornos: [], estornoItens: [] })), /dezembro não descontou/);
  // Cota-parte "pelo mês da comanda" (regra rejeitada em D-013): novembro mudaria.
  const pelaComanda = a => computeCotaParte({ ...a, estornos: a.estornos.map(e => ({ ...e, data: (db.comandos.find(c => c.id === e.comando_id) || {}).data })) });
  assert.throws(() => checarCotaParte(pelaComanda), /novembro fechado mudou/);
  assert.throws(() => checarCaixaDoEstorno(args => buildFechamentoCaixa({ ...args, movimentos: args.movimentos.filter(m => m.tipo !== 'estorno_pagamento') })), /linha negativa|dinheiro devolvido|8000/);
});

test('N03 controle negativo limite: sem enxergar os parciais anteriores, o excesso de E05 passaria', async () => {
  const p1 = await estornar(CM_X, { tipo: 'parcial', idempotencyKey: 'x1', itens: [{ comandoItemId: I_X, quantidade: 2 }] });
  assert.strictEqual(p1.status, 201, JSON.stringify(p1.data));
  const pedido = { tipo: 'parcial', idempotencyKey: 'x2', itens: [{ comandoItemId: I_X, quantidade: 2 }], reembolsos: [{ formaCode: 'pix', valorCentavos: 1000 }] };
  assert.strictEqual(code(await estornar(CM_X, pedido)), 'ESTORNO_EXCEDE');
  const guardados = db.comanda_estorno_itens; const pags = db.comanda_estorno_pagamentos;
  db.comanda_estorno_itens = []; db.comanda_estorno_pagamentos = [];
  let r;
  try { r = await estornar(CM_X, { ...pedido, idempotencyKey: 'x3', reembolsos: [{ formaCode: 'pix', valorCentavos: 2000 }] }); }
  finally { db.comanda_estorno_itens = guardados.concat(db.comanda_estorno_itens); db.comanda_estorno_pagamentos = pags.concat(db.comanda_estorno_pagamentos); }
  assert.strictEqual(r.status, 201, 'sem a soma dos parciais o excesso passaria — a verificação de E05 é o que segura');
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
  console.log(`\nEstorno Gate: ${passed}/${tests.length} testes verdes.`);
  if (failed) process.exit(1);
})();

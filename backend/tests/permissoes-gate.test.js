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
const { PERMISSOES, permissoesEfetivas } = require('../src/auth/permissoes');
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
const C1 = '90000000-0000-4000-8000-0000000000c1';
const C2 = '90000000-0000-4000-8000-0000000000c2';
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
    { id: 'b0000000-0000-4000-8000-000000000002', empresa_id: E, profissional_id: P2, cliente_id: null, servico_id: null, data: hoje, horario: '16:00', duracao_min: 30, status: 'agendado' },
    { id: 'b0000000-0000-4000-8000-000000000003', empresa_id: E, profissional_id: P1, cliente_id: C1, servico_id: null, data: hoje, horario: '17:00', duracao_min: 30, status: 'agendado' },
    { id: 'b0000000-0000-4000-8000-000000000004', empresa_id: E, profissional_id: P2, cliente_id: C2, servico_id: null, data: hoje, horario: '18:00', duracao_min: 30, status: 'agendado', observacoes: 'liga antes' }
  ],
  clientes: [
    { id: C1, empresa_id: E, nome: 'Carla Cliente', whatsapp: '11999990001', observacoes: 'alergia', faltas: 0, ativo: true },
    { id: C2, empresa_id: E, nome: 'Davi Cliente', whatsapp: '11999990002', observacoes: null, faltas: 2, ativo: true }
  ],
  lista_espera: [], comandos: [{ id: 'c1000000-0000-4000-8000-0000000000d1', empresa_id: E, profissional_id: P2, status: 'fechado', data: hoje }], comando_itens: []
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

// ---------- matriz ----------
test('G01 catálogo coerente: toda rota exige um código conhecido; toda permissão aponta para uma ação ampla existente', () => {
  const dir = path.join(__dirname, '../src/routes');
  const usados = new Set();
  for (const f of fs.readdirSync(dir)) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/authorize\('([^']+)'\)/g)) usados.add(m[1]);
    for (const m of src.matchAll(/authorizePor\([^,]+, '([^']+)'\)/g)) m[1].split('|').forEach(c => usados.add(c));
    for (const m of src.matchAll(/pode\(req\.auth, '([^']+)'\)/g)) usados.add(m[1]);
  }
  const desconhecidos = [...usados].filter(c => !PERMISSOES.some(p => p.codigo === c) && !ACTIONS[c]);
  assert.deepStrictEqual(desconhecidos, []);
  const amplasNaRota = [...usados].filter(c => !PERMISSOES.some(p => p.codigo === c));
  assert.deepStrictEqual(amplasNaRota, ['admin'], 'só o router /admin continua na ação ampla');
  assert.ok(PERMISSOES.every(p => ACTIONS[p.acao]), 'ação de origem inexistente');
  assert.ok(PERMISSOES.every(p => /^[a-z_]+:[a-z_]+$/.test(p.codigo)), 'formato do código igual ao do banco');
  assert.ok(PERMISSOES.every(p => ['operacao', 'sensivel', 'administracao'].includes(p.nivel)), 'nível conhecido');
  assert.ok(PERMISSOES.filter(p => p.segue).every(p => PERMISSOES.some(x => x.codigo === p.segue && !x.segue)), 'segue aponta para permissão principal');
});

test('G02 matriz documentada = matriz implementada (docs/PERMISSOES.md gerado do catálogo)', () => {
  const doc = fs.readFileSync(path.join(__dirname, '../../docs/PERMISSOES.md'), 'utf8');
  assert.strictEqual(doc, gerarMatriz(), 'rode: node backend/scripts/gerar-matriz-permissoes.js --escrever');
});

test('G03 mínimo por papel; ao profissional só se concede agenda de todos e comanda de qualquer um (nada de dinheiro)', () => {
  const r = permissoesEfetivas('recepcao', []);
  for (const c of ['comanda:estornar', 'painel:financeiro', 'comissoes:pagar', 'metas:definir', 'catalogo:editar', 'equipe:permissoes', 'ganhos:ver']) assert.ok(!r[c], `recepção não deveria ter ${c}`);
  assert.deepStrictEqual([r['agenda:lembretes'], r['clientes:contato']], ['total', 'total']);
  const p = permissoesEfetivas('profissional', []);
  for (const c of ['agenda:ver', 'agenda:criar', 'agenda:encaixar', 'agenda:editar', 'agenda:atender', 'agenda:cancelar', 'comanda:fechar', 'ganhos:ver', 'metas:ver', 'desempenho:ver']) assert.strictEqual(p[c], 'proprio', c);
  for (const c of ['espera:ver', 'caixa:conferir', 'painel:operacional', 'clientes:editar', 'clientes:contato', 'agenda:lembretes']) assert.ok(!p[c], `profissional não deveria ter ${c}`);
  assert.deepStrictEqual([p['clientes:ver'], p['clientes:criar']], ['total', 'total'], 'vê o nome e cadastra cliente novo');
  assert.deepStrictEqual(PERMISSOES.filter(x => x.profissional).map(x => x.codigo), ['agenda:ver', 'comanda:fechar']);
  const dinheiro = PERMISSOES.filter(x => x.nivel !== 'operacao').map(x => x.codigo);
  for (const c of ['comanda:estornar', 'comissoes:pagar', 'caixa:fechar', 'caixa:movimentar', 'catalogo:editar', 'pagamentos:editar', 'estoque:ajustar', 'painel:financeiro', 'ganhos:ver', 'clientes:contato']) assert.ok(dinheiro.includes(c), `${c} deveria ser sensível`);
  assert.strictEqual(Object.keys(permissoesEfetivas('admin', [])).length, PERMISSOES.length, 'administrador tem todas');
});

test('G04 profissional sem permissão individual: agenda e comanda só próprias; sem lista de espera, caixa e painel', async () => {
  const p = await me('h.prof.s');
  assert.deepStrictEqual([p['agenda:ver'], p['espera:ver'], p['caixa:conferir']], ['proprio', undefined, undefined]);
  for (const rota of ['/api/lista-espera', '/api/dashboard', `/api/caixa/fechamento?data=${hoje}`]) assert.strictEqual((await request('GET', rota, { token: 'h.prof.s' })).status, 403, rota);
  const r = await request('PATCH', '/api/agenda/b0000000-0000-4000-8000-000000000001/status', { token: 'h.prof.s', body: { novoStatus: 'cancelado' } });
  assert.deepStrictEqual([r.status, code(r)], [403, 'NOT_OWN_RESOURCE'], 'horário de colega');
});

test('G05 clientes: profissional vê só o nome e cadastra cliente novo; não edita; recepção e legado veem o contato', async () => {
  for (const rota of ['/api/clientes', '/api/catalog']) {
    const r = await request('GET', rota, { token: 'h.prof.s' });
    const lista = rota === '/api/clientes' ? r.data.data : r.data.data.clientes;
    assert.strictEqual(r.status, 200, rota);
    assert.ok(lista.length >= 2 && lista.every(c => Object.keys(c).sort().join() === 'ativo,id,nome'), `${rota}: ${JSON.stringify(lista[0])}`);
  }
  for (const token of ['h.recep.s', process.env.API_ACCESS_TOKEN]) {
    const r = await request('GET', '/api/clientes', { token });
    assert.strictEqual(r.data.data.find(c => c.id === C1).whatsapp, '11999990001', `controle negativo (${token === 'h.recep.s' ? 'recepção' : 'legado'})`);
  }
  const novo = await request('POST', '/api/clientes', { token: 'h.prof.s', body: { nome: 'Cliente Rápido', whatsapp: '11988887777' } });
  assert.strictEqual(novo.status, 201, JSON.stringify(novo.data));
  const edit = await request('PATCH', `/api/clientes/${C1}`, { token: 'h.prof.s', body: { nome: 'Outro nome' } });
  assert.deepStrictEqual([edit.status, code(edit)], [403, 'INSUFFICIENT_ROLE']);
});

test('G06 lembretes: WhatsApp só para recepção e gestão; profissional vê só os próprios, sem contato (mesmo com agenda de todos)', async () => {
  const rec = await request('GET', `/api/agenda/lembretes?data=${hoje}`, { token: 'h.recep.s' });
  assert.strictEqual(rec.data.data.whatsapp, true);
  assert.ok(rec.data.data.itens.some(i => i.agendamentoId.endsWith('04') && /^https:\/\/wa\.me\//.test(i.link)), 'controle negativo: recepção recebe o link');
  for (const extras of [[], ['agenda:ver']]) {
    await definir('prof', extras);
    const r = await request('GET', `/api/agenda/lembretes?data=${hoje}`, { token: 'h.prof.s' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.data.whatsapp, false);
    assert.deepStrictEqual(r.data.data.itens.map(i => i.agendamentoId), ['b0000000-0000-4000-8000-000000000003'], `extras ${extras}`);
    assert.ok(r.data.data.itens.every(i => i.link === null && i.texto === undefined) && r.data.data.comLink === 0);
  }
  await definir('prof', []);
});

// ---------- concessão, uso e revogação ----------
test('G07 ação da agenda não se concede sozinha: segue a visão (agenda própria ou de todos)', async () => {
  const r = await definir('prof', ['agenda:cancelar']);
  assert.deepStrictEqual([r.status, motivo(r)], [403, 'SEGUE_OUTRA_PERMISSAO']);
});

test('G08 agenda de todos: agenda, confirma e cancela para colegas; continua sem lista de espera, caixa e ganhos alheios', async () => {
  const r = await definir('prof', ['agenda:ver'], 'h.gestor.s');
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  for (const c of ['agenda:ver', 'agenda:criar', 'agenda:encaixar', 'agenda:editar', 'agenda:atender', 'agenda:cancelar']) assert.strictEqual(r.data.data.efetivas[c], 'total', c);
  const conf = await request('PATCH', '/api/agenda/b0000000-0000-4000-8000-000000000002/status', { token: 'h.prof.s', body: { novoStatus: 'confirmado' } });
  assert.strictEqual(conf.status, 200, JSON.stringify(conf.data));
  const cancel = await request('PATCH', '/api/agenda/b0000000-0000-4000-8000-000000000001/status', { token: 'h.prof.s', body: { novoStatus: 'cancelado' } });
  assert.strictEqual(cancel.status, 200, JSON.stringify(cancel.data));
  for (const rota of ['/api/lista-espera', '/api/dashboard', `/api/caixa/fechamento?data=${hoje}`]) assert.strictEqual((await request('GET', rota, { token: 'h.prof.s' })).status, 403, rota);
  const p = await me('h.prof.s');
  assert.deepStrictEqual([p['ganhos:ver'], p['metas:ver'], p['comanda:fechar'], p['comanda:estornar']], ['proprio', 'proprio', 'proprio', undefined]);
});

test('G09 revogar: a permissão deixa de valer já na próxima requisição', async () => {
  const r = await definir('prof', [], 'h.gestor.s');
  assert.deepStrictEqual([r.status, r.data.data.revogadas], [200, ['agenda:ver']]);
  const conf = await request('PATCH', '/api/agenda/b0000000-0000-4000-8000-000000000004/status', { token: 'h.prof.s', body: { novoStatus: 'confirmado' } });
  assert.deepStrictEqual([conf.status, code(conf)], [403, 'NOT_OWN_RESOURCE']);
  assert.strictEqual((await me('h.prof.s'))['agenda:cancelar'], 'proprio');
});

test('G10 trilha: quem concedeu ou revogou, o quê, para quem e quando; recepção não lê', async () => {
  const h = await request('GET', `/api/equipe/permissoes/${M.prof}/historico`);
  assert.strictEqual(h.status, 200);
  const ev = h.data.data;
  assert.ok(ev.length >= 4, `eventos: ${ev.length}`);
  assert.ok(ev.every(e => ['Dona', 'Gerente'].includes(e.por) && e.para === 'Ana' && /^\d{4}-\d{2}-\d{2}T/.test(e.quando) && ['conceder', 'revogar'].includes(e.acao)));
  assert.ok(ev.some(e => e.acao === 'revogar' && e.permissao === 'agenda:ver' && e.por === 'Gerente'));
  assert.strictEqual((await request('GET', `/api/equipe/permissoes/${M.prof}/historico`, { token: 'h.recep.s' })).status, 403);
});

// ---------- limites de autoridade ----------
test('G11 profissional nunca recebe dinheiro (nem do dono); gerente não concede o que é sensível nem administração', async () => {
  for (const c of ['caixa:fechar', 'caixa:movimentar', 'comissoes:pagar', 'comanda:estornar', 'catalogo:editar', 'ganhos:ver', 'clientes:contato', 'agenda:lembretes', 'espera:ver']) {
    for (const token of ['h.admin.s', 'h.gestor.s']) {
      const r = await definir('prof', [c], token);
      assert.deepStrictEqual([r.status, motivo(r)], [403, 'NAO_CONCEDIVEL_AO_PROFISSIONAL'], `${c} por ${token}`);
    }
  }
  const ok = await definir('prof', ['agenda:ver', 'comanda:fechar'], 'h.gestor.s');
  assert.strictEqual(ok.status, 200, 'controle negativo: o que é permitido passa');
  for (const c of ['comanda:estornar', 'comissoes:pagar', 'painel:financeiro', 'ganhos:ver']) {
    const r = await definir('recep', [c], 'h.gestor.s');
    assert.deepStrictEqual([r.status, motivo(r)], [403, 'SO_ADMIN_CONCEDE'], c);
  }
  assert.deepStrictEqual(motivo(await definir('gestor2', ['comanda:estornar'], 'h.gestor.s')), 'ALVO_FORA_DA_AUTORIDADE');
  assert.deepStrictEqual(motivo(await definir('admin', [], 'h.gestor.s')), 'ALVO_FORA_DA_AUTORIDADE');
  assert.deepStrictEqual(motivo(await definir('gestor', ['equipe:permissoes'], 'h.gestor.s')), 'NAO_PODE_SI_MESMO');
  assert.deepStrictEqual(motivo(await definir('recep', ['agenda:ver'])), 'JA_INCLUIDA_NO_PAPEL');
  assert.strictEqual((await definir('prof', [])).status, 200);
});

test('G12 só o dono concede o que é sensível ou de administração; o gerente não consegue revogar', async () => {
  const r = await definir('recep', ['empresa:configurar', 'comanda:estornar']);
  assert.strictEqual(r.status, 200);
  const e = await me('h.recep.s');
  assert.deepStrictEqual([e['empresa:configurar'], e['comanda:estornar']], ['total', 'total']);
  const tentativa = await definir('recep', ['comanda:estornar'], 'h.gestor.s');
  assert.deepStrictEqual([tentativa.status, motivo(tentativa)], [403, 'SO_ADMIN_CONCEDE']);
  assert.strictEqual((await definir('recep', [])).status, 200);
});

test('G13 corrida: se a lista mudou entre a leitura e a gravação, nada é gravado (409)', async () => {
  assert.strictEqual((await definir('prof', ['comanda:fechar'])).status, 200);
  const real = ident.getMembership;
  ident.getMembership = async id => { const m = await real(id); return id === M.prof ? { ...m, permissoes_extras: [] } : m; };
  try {
    const r = await definir('prof', ['agenda:ver'], 'h.gestor.s');
    assert.deepStrictEqual([r.status, code(r)], [409, 'PERMISSIONS_CHANGED']);
  } finally { ident.getMembership = real; }
  assert.deepStrictEqual((await ident.getMembership(M.prof)).permissoes_extras, ['comanda:fechar'], 'nada mudou');
  assert.strictEqual((await definir('prof', ['agenda:ver', 'comanda:fechar'], 'h.gestor.s')).status, 200, 'controle negativo: lista atual passa');
});

test('G14 mudar o papel ou desativar tira as permissões individuais, com registro na trilha', async () => {
  const antes = (await request('GET', `/api/equipe/permissoes/${M.prof}/historico`)).data.data.length;
  const mudou = await request('PATCH', `/api/admin/memberships/${M.prof}`, { body: { role: 'recepcao' } });
  assert.strictEqual(mudou.status, 200, JSON.stringify(mudou.data));
  assert.deepStrictEqual((await ident.getMembership(M.prof)).permissoes_extras, []);
  const h = (await request('GET', `/api/equipe/permissoes/${M.prof}/historico`)).data.data;
  assert.strictEqual(h.length, antes + 2);
  assert.ok(h.slice(0, 2).every(e => e.acao === 'revogar' && e.por === 'Dona'));
  assert.strictEqual((await request('PATCH', `/api/admin/memberships/${M.prof}`, { body: { role: 'profissional', profissionalId: P1 } })).status, 200);
  assert.strictEqual((await definir('prof', ['agenda:ver'])).status, 200);
  assert.strictEqual((await request('PATCH', `/api/admin/memberships/${M.prof}`, { body: { status: 'inativo' } })).status, 200);
  assert.deepStrictEqual((await ident.getMembership(M.prof)).permissoes_extras, []);
  assert.strictEqual((await request('PATCH', `/api/admin/memberships/${M.prof}`, { body: { status: 'ativo' } })).status, 200);
  assert.strictEqual((await me('h.prof.s'))['agenda:ver'], 'proprio', 'volta só com o padrão do papel');
});

test('G15 quem não tem a permissão, token legado, outra empresa e entradas ruins são recusados', async () => {
  for (const token of ['h.recep.s', 'h.prof.s']) {
    const r = await definir('prof', ['agenda:ver'], token);
    assert.deepStrictEqual([r.status, code(r)], [403, 'INSUFFICIENT_ROLE'], token);
    assert.strictEqual((await request('GET', '/api/equipe/permissoes', { token })).status, 403, token);
  }
  assert.strictEqual((await definir('prof', ['agenda:ver'], process.env.API_ACCESS_TOKEN)).status, 403, 'legado não concede');
  assert.strictEqual((await definir('prof', ['agenda:ver'], null)).status, 401);
  assert.strictEqual((await definir('prof', ['agenda:ver'], 'h.adminB.s')).status, 404, 'vínculo de outra empresa');
  assert.deepStrictEqual([(await definir('prof', ['agenda:voar'])).status, code(await definir('prof', ['agenda:voar']))], [422, 'UNKNOWN_PERMISSION']);
  for (const body of [{ permissoes: 'agenda:ver' }, { permissoes: [1] }, { permissoes: [], empresa_id: EB }]) {
    assert.strictEqual((await request('PUT', `/api/equipe/permissoes/${M.prof}`, { body })).status, 422, JSON.stringify(body));
  }
  assert.strictEqual((ident.db.membership_permissao_eventos || []).filter(e => e.empresa_id === EB).length, 0);
});

test('G16 tela de equipe: o gerente só mexe no profissional, e só em agenda de todos e comanda', async () => {
  const r = await request('GET', '/api/equipe/permissoes', { token: 'h.gestor.s' });
  assert.strictEqual(r.status, 200);
  const por = Object.fromEntries(r.data.data.pessoas.map(p => [p.role === 'gestor' && p.voce ? 'eu' : p.nome, p]));
  assert.deepStrictEqual(por.Ana.editaveis, ['agenda:ver', 'comanda:fechar']);
  assert.deepStrictEqual([por.eu.editaveis, por['Gerente Dois'].editaveis, por.Dona.editaveis, por.Recepcionista.editaveis], [[], [], [], []]);
  const doDono = (await request('GET', '/api/equipe/permissoes')).data.data.pessoas.find(p => p.nome === 'Recepcionista');
  assert.ok(doDono.editaveis.includes('comanda:estornar'), 'controle negativo: o dono concede o sensível à recepção');
  assert.strictEqual(r.data.data.catalogo.length, PERMISSOES.length);
  assert.ok(!r.data.data.pessoas.some(p => p.nome === 'Outro Dono'), 'só a própria empresa');
});

test('G17 controle negativo: sem a permissão individual no pedido, o mesmo profissional volta ao próprio', () => {
  const auth = { principal_type: 'user', role: 'profissional', profissional_id: P1, permissoes_extras: ['agenda:ver'] };
  assert.deepStrictEqual(authorizeAuth(auth, 'agenda:cancelar'), { own: false, profissionalId: null });
  assert.deepStrictEqual(authorizeAuth({ ...auth, permissoes_extras: [] }, 'agenda:cancelar'), { own: true, profissionalId: P1 });
  assert.throws(() => authorizeAuth({ ...auth, permissoes_extras: ['espera:ver'] }, 'caixa:fechar'), /Sem permissão/);
  assert.throws(() => authorizeAuth({ ...auth, permissoes_extras: ['espera:ver', 'agenda:criar'] }, 'espera:ver'), /Sem permissão/, 'extra antigo que o papel não recebe não vale');
  assert.deepStrictEqual(authorizeAuth({ ...auth, role: 'recepcao', permissoes_extras: ['comanda:estornar'] }, 'comanda:estornar'), { own: false, profissionalId: null }, 'controle negativo: extra válido para o papel vale');
});

test('G18 extra antigo (gravado antes da regra atual) sempre pode ser revogado, pelo dono', async () => {
  const m = await ident.getMembership(M.prof);
  m.permissoes_extras = ['caixa:conferir', 'agenda:criar'];
  const tela = (await request('GET', '/api/equipe/permissoes')).data.data.pessoas.find(p => p.nome === 'Ana');
  assert.ok(tela.editaveis.includes('caixa:conferir') && tela.editaveis.includes('agenda:criar'), 'o dono vê como revogáveis');
  const g = await definir('prof', [], 'h.gestor.s');
  assert.deepStrictEqual([g.status, motivo(g)], [403, 'SO_ADMIN_CONCEDE'], 'gerente não tira o que é sensível');
  const r = await definir('prof', []);
  assert.deepStrictEqual([r.status, r.data.data.revogadas], [200, ['agenda:criar', 'caixa:conferir']]);
});

test('G19 cadastro rápido: quem não edita clientes grava só nome e WhatsApp; número repetido é recusado', async () => {
  const r = await request('POST', '/api/clientes', { token: 'h.prof.s', body: { nome: 'Bloqueio', whatsapp: '11955554444', ativo: false, faltas: 9, observacoes: 'x' } });
  assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  const gravado = (await request('GET', '/api/clientes', { token: 'h.recep.s' })).data.data.find(c => c.nome === 'Bloqueio');
  assert.deepStrictEqual([gravado.ativo, gravado.faltas, gravado.observacoes || null], [true, 0, null]);
  const rep = await request('POST', '/api/clientes', { token: 'h.prof.s', body: { nome: 'Outra', whatsapp: '(11) 99999-0001' } });
  assert.deepStrictEqual([rep.status, code(rep)], [409, 'CLIENT_EXISTS']);
  const rec = await request('POST', '/api/clientes', { token: 'h.recep.s', body: { nome: 'Inativo', ativo: false, faltas: 1 } });
  const vr = (await request('GET', '/api/clientes', { token: 'h.recep.s' })).data.data.find(c => c.id === rec.data.data.id);
  assert.deepStrictEqual([vr.ativo, vr.faltas], [false, 1], 'controle negativo: recepção grava o cadastro completo');
});

test('G20 corrida com troca de papel: concessão decidida com o papel antigo é recusada', async () => {
  const real = ident.getMembership;
  ident.getMembership = async id => { const m = await real(id); return id === M.recep ? { ...m, role: 'recepcao' } : m; };
  (await real(M.recep)).role = 'profissional';
  try {
    const r = await definir('recep', ['comanda:historico']);
    assert.deepStrictEqual([r.status, code(r)], [409, 'PERMISSIONS_CHANGED']);
  } finally { ident.getMembership = real; (await real(M.recep)).role = 'recepcao'; }
  assert.deepStrictEqual((await ident.getMembership(M.recep)).permissoes_extras || [], []);
  const ok = await definir('recep', ['comanda:historico']);
  assert.strictEqual(ok.status, 200, 'controle negativo: papel atual passa');
  assert.strictEqual((await definir('recep', [])).status, 200);
});

test('G21 agenda de todos: observações dos horários de colegas não vão para o profissional', async () => {
  await definir('prof', ['agenda:ver']);
  const r = await request('GET', `/api/agenda?data=${hoje}`, { token: 'h.prof.s' });
  assert.strictEqual(r.status, 200);
  const deColega = r.data.data.filter(a => a.profissional_id === P2);
  assert.ok(deColega.length >= 1 && deColega.every(a => !('observacoes' in a)), JSON.stringify(deColega[0]));
  const rec = await request('GET', `/api/agenda?data=${hoje}`, { token: 'h.recep.s' });
  assert.ok(rec.data.data.some(a => a.observacoes === 'liga antes'), 'controle negativo: recepção vê');
  await definir('prof', []);
});

test('G22 ninguém mexe no próprio dinheiro: gerente que atende não paga a si, não estorna a própria comanda, não muda a própria comissão nem meta; o dono libera e retira', async () => {
  const g = await ident.getMembership(M.gestor);
  g.profissional_id = P2;
  try {
    const mes = hoje.slice(0, 7);
    const meta = (prof, token = 'h.gestor.s') => request('PUT', '/api/metas', { token, body: { profissionalId: prof, mes, tipo: 'atendimentos', valorAlvo: 10 } });
    const proprios = async () => [
      await meta(P2),
      await request('POST', '/api/comissoes/pagamentos', { token: 'h.gestor.s', body: { profissionalId: P2, tipo: 'vale', valorCentavos: 1000, idempotencyKey: `g22-${Date.now()}` } }),
      await request('PATCH', `/api/profissionais/${P2}`, { token: 'h.gestor.s', body: { nome: 'Bruno' } }),
      await request('POST', '/api/comandas/c1000000-0000-4000-8000-0000000000d1/estorno', { token: 'h.gestor.s', body: { tipo: 'total', motivoCodigo: 'outro', motivo: 'teste de regra do próprio dinheiro', idempotencyKey: `g22e-${Date.now()}` } })
    ];
    for (const r of await proprios()) assert.deepStrictEqual([r.status, code(r)], [403, 'OWN_MONEY_FORBIDDEN'], JSON.stringify(r.data));
    assert.ok([200, 201].includes((await meta(P1)).status), 'controle negativo: na meta de outra pessoa o gerente age');
    assert.ok([200, 201].includes((await meta(P2, 'h.admin.s')).status), 'o proprietário age sobre qualquer um');
    const auto = await definir('gestor', ['financeiro:proprio'], 'h.gestor.s');
    assert.deepStrictEqual([auto.status, motivo(auto)], [403, 'NAO_PODE_SI_MESMO']);
    const outro = await definir('gestor', ['financeiro:proprio'], 'h.recep.s');
    assert.strictEqual(outro.status, 403, 'só quem tem autoridade concede');
    assert.deepStrictEqual(motivo(await definir('recep', ['financeiro:proprio'])), 'NAO_CONCEDIVEL_A_ESTE_PAPEL');
    assert.strictEqual((await definir('gestor', ['financeiro:proprio'])).status, 200, 'o dono libera');
    assert.ok([200, 201].includes((await meta(P2)).status), 'liberado: o gerente define a própria meta');
    assert.strictEqual((await definir('gestor', [])).status, 200, 'o dono retira');
    assert.deepStrictEqual(code(await meta(P2)), 'OWN_MONEY_FORBIDDEN', 'retirado: volta a ser recusado na próxima ação');
  } finally { g.profissional_id = undefined; }
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

// Disponibilidade Gate (D-033, migration 013): precedência da disponibilidade, cenário
// obrigatório do domingo excepcional, servidor recusando fora da disponibilidade, permissões,
// conflitos com agendamentos e profissionais novos x existentes. Banco e identidade em memória;
// o que só o banco garante (formas, trilha imutável, acesso) está em gate_013.sql.
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-disp-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { env } = require('../src/config/env');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { disponibilidadeDoDia, subtrair, intersecao } = require('../src/engines/DisponibilidadeEngine');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');
const { createHash } = require('crypto');

const tests = [];
const test = (n, f) => tests.push({ n, f });
const E = env.DEFAULT_EMPRESA_ID;
const UNIT = 'f0000000-0000-4000-8000-0000000000d1';
const P = { edu: 'a0000000-0000-4000-8000-0000000000d1', a: 'a0000000-0000-4000-8000-0000000000d2', b: 'a0000000-0000-4000-8000-0000000000d3', c: 'a0000000-0000-4000-8000-0000000000d4' };
const S60 = 'b0000000-0000-4000-8000-0000000000d1';
const U = { admin: 'c0000000-0000-4000-8000-000000000d01', gestor: 'c0000000-0000-4000-8000-000000000d02', recep: 'c0000000-0000-4000-8000-000000000d03', edu: 'c0000000-0000-4000-8000-000000000d04' };
const ident = createMemoryIdentityStore({
  app_users: Object.entries(U).map(([k, id]) => ({ id, email: `${k}@t`, nome: k, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'd0000000-0000-4000-8000-000000000d01', empresa_id: E, user_id: U.admin, role: 'admin', status: 'ativo' },
    { id: 'd0000000-0000-4000-8000-000000000d02', empresa_id: E, user_id: U.gestor, role: 'gestor', status: 'ativo' },
    { id: 'd0000000-0000-4000-8000-000000000d03', empresa_id: E, user_id: U.recep, role: 'recepcao', status: 'ativo' },
    { id: 'd0000000-0000-4000-8000-000000000d04', empresa_id: E, user_id: U.edu, role: 'profissional', status: 'ativo', profissional_id: P.edu }
  ],
  membership_units: ['recep', 'edu'].map(k => ({ membership_id: `d0000000-0000-4000-8000-000000000d0${k === 'recep' ? 3 : 4}`, unit_id: UNIT }))
});
setIdentityStore(ident);
const TOK = Object.fromEntries(Object.keys(U).map(k => [`h.${k}.s`, U[k]]));
setAuthProvider({ async getUser(t) { if (!TOK[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: TOK[t] }; } });

// Datas: D = um domingo daqui a 2–8 dias (sempre no futuro); D7 = o domingo seguinte; SEG = segunda depois de D.
const add = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const D = (() => { let d = add(hoje, 2); while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 0) d = add(d, 1); return d; })();
const D7 = add(D, 7);
const SEG = add(D, 1);
const horarioSemDomingo = Object.fromEntries(['seg', 'ter', 'qua', 'qui', 'sex', 'sab'].map(k => [k, { ativo: true, inicio: '09:00', fim: '19:00' }]));
const db = installMemoryBackend({
  empresas: [{ id: E, nome: 'Salão', horario_por_dia: { ...horarioSemDomingo, dom: { ativo: false } }, slot_padrao: 30, buffer_min: 0 }],
  profissionais: [
    { id: P.edu, empresa_id: E, nome: 'Eduardo', ativo: true, horario: {} },
    { id: P.a, empresa_id: E, nome: 'Ana', ativo: true, horario: {} },
    { id: P.b, empresa_id: E, nome: 'Bruno', ativo: true, horario: {} },
    { id: P.c, empresa_id: E, nome: 'Carla', ativo: true, horario: {} }
  ],
  servicos: [{ id: S60, empresa_id: E, nome: 'Corte longo', valor_centavos: 8000, duracao_min: 60, ativo: true }],
  clientes: [], agendamentos: [], lista_espera: [], comandos: [], comando_itens: []
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
const slots = async (prof, data, token = 'h.admin.s') => {
  const r = await request('GET', `/api/agenda/slots?data=${data}&profissionalId=${prof}&servicoId=${S60}`, { token });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  return r.data.data;
};
const horas = s => s.slots.map(x => x.horario);
const excecao = (body, token = 'h.admin.s') => request('POST', '/api/disponibilidade/excecoes', { token, body });
const agendar = (prof, data, horario, extra = {}, token = 'h.recep.s') => request('POST', '/api/agenda', { token, body: { servicoId: S60, profissionalId: prof, data, horario, ...extra } });

// ---------- motor ----------
test('D01 motor: precedência (fechamento > exceção da unidade > semanal; ausência > exceção do profissional > semanal; bloqueio retira)', () => {
  const semanal = [
    { profissional_id: null, dia_semana: 1, inicio: '09:00', fim: '19:00' },
    { profissional_id: 'p', dia_semana: 1, inicio: '09:00', fim: '19:00' }
  ];
  const prof = { id: 'p', escala_publicada_em: 'x' };
  const seg = '2026-11-16';
  const dia = (excecoes, p = prof) => disponibilidadeDoDia({ data: seg, semanal, excecoes, profissional: p });
  assert.deepStrictEqual(dia([]).periodos, [{ start: 540, end: 1140 }]);
  assert.strictEqual(dia([{ tipo: 'fechamento', data_inicio: seg, data_fim: seg }]).codigo, 'UNIDADE_FECHADA');
  assert.deepStrictEqual(dia([{ tipo: 'horario', data_inicio: seg, data_fim: seg, inicio: '10:00', fim: '12:00' }]).periodos, [{ start: 600, end: 720 }]);
  assert.strictEqual(dia([{ profissional_id: 'p', tipo: 'ausencia', data_inicio: seg, data_fim: seg }]).codigo, 'AUSENCIA');
  assert.deepStrictEqual(dia([{ profissional_id: 'p', tipo: 'bloqueio', data_inicio: seg, data_fim: seg, inicio: '12:00', fim: '13:00' }]).periodos, [{ start: 540, end: 720 }, { start: 780, end: 1140 }]);
  assert.deepStrictEqual(dia([{ tipo: 'fechamento', data_inicio: seg, data_fim: seg, inicio: '18:00', fim: '19:00' }]).periodos, [{ start: 540, end: 1080 }], 'fechamento parcial');
  assert.strictEqual(dia([], { id: 'p', escala_publicada_em: null }).codigo, 'ESCALA_NAO_PUBLICADA');
  assert.strictEqual(disponibilidadeDoDia({ data: '2026-11-15', semanal, excecoes: [], profissional: prof }).codigo, 'UNIDADE_SEM_HORARIO', 'domingo sem regra: nada');
  const alt = [{ profissional_id: null, dia_semana: 1, inicio: '09:00', fim: '12:00', a_cada_semanas: 2, semana_ancora: seg }, { profissional_id: 'p', dia_semana: 1, inicio: '09:00', fim: '12:00' }];
  assert.strictEqual(disponibilidadeDoDia({ data: seg, semanal: alt, excecoes: [], profissional: prof }).codigo, 'OK');
  assert.strictEqual(disponibilidadeDoDia({ data: '2026-11-23', semanal: alt, excecoes: [], profissional: prof }).codigo, 'UNIDADE_SEM_HORARIO', 'escala alternada: semana sim, semana não');
  assert.deepStrictEqual(subtrair([{ start: 0, end: 100 }], [{ start: 20, end: 30 }, { start: 90, end: 200 }]), [{ start: 0, end: 20 }, { start: 30, end: 90 }]);
  assert.deepStrictEqual(intersecao([{ start: 0, end: 50 }], [{ start: 40, end: 60 }]), [{ start: 40, end: 50 }]);
});

test('D02 existentes mantêm o horário (conversão) e o domingo segue fechado', async () => {
  const seg = await slots(P.edu, SEG);
  assert.ok(horas(seg).includes('09:00') && horas(seg).includes('18:00') && !horas(seg).includes('18:30'), JSON.stringify(horas(seg)));
  const dom = await slots(P.edu, D);
  assert.deepStrictEqual([dom.slots.length, dom.disponibilidade.codigo], [0, 'UNIDADE_SEM_HORARIO']);
});

// ---------- cenário obrigatório ----------
test('D03 cenário: unidade abre no domingo D das 08 às 16; Eduardo 08–12, Ana 09–15, Bruno 10–16 com intervalo 12–13', async () => {
  assert.strictEqual((await excecao({ tipo: 'horario', dataInicio: D, dataFim: D, periodos: [{ inicio: '08:00', fim: '16:00' }], motivo: 'Domingo excepcional' })).status, 201);
  const ed = await slots(P.edu, D);
  assert.deepStrictEqual([ed.slots.length, ed.disponibilidade.codigo], [0, 'FOLGA'], 'abrir a unidade não libera ninguém');
  for (const [p, periodos] of [[P.edu, [{ inicio: '08:00', fim: '12:00' }]], [P.a, [{ inicio: '09:00', fim: '15:00' }]], [P.b, [{ inicio: '10:00', fim: '12:00' }, { inicio: '13:00', fim: '16:00' }]]]) {
    const r = await excecao({ profissionalId: p, tipo: 'horario', dataInicio: D, dataFim: D, periodos });
    assert.strictEqual(r.status, 201, JSON.stringify(r.data));
  }
});

test('D04 (1, 2, 3) só no domingo D e só para os escolhidos; os outros domingos seguem fechados', async () => {
  assert.ok(horas(await slots(P.edu, D)).includes('08:00'));
  for (const p of [P.edu, P.a, P.b]) assert.strictEqual((await slots(p, D7)).slots.length, 0, 'domingo seguinte fechado');
  const carla = await slots(P.c, D);
  assert.deepStrictEqual([carla.slots.length, carla.disponibilidade.codigo], [0, 'FOLGA']);
  const origem = await request('GET', `/api/disponibilidade/dia?data=${D}&profissionalId=${P.c}`);
  assert.ok(/não trabalha/.test(origem.data.data.origem), 'origem da regra explicada');
});

test('D05 (4, 5) intervalo do Bruno nunca oferecido; serviço de 60 min não passa do fim de cada período', async () => {
  const ultimo = s => horas(s).sort().pop();
  assert.strictEqual(ultimo(await slots(P.edu, D)), '11:00');
  assert.strictEqual(ultimo(await slots(P.a, D)), '14:00');
  const b = horas(await slots(P.b, D));
  assert.strictEqual(b.sort().pop(), '15:00');
  assert.ok(!b.some(h => h > '11:00' && h < '13:00'), `nada atravessa o intervalo: ${b}`);
  assert.ok(b.includes('11:00') && b.includes('13:00'), 'controle negativo: as bordas do intervalo continuam');
});

test('D06 (6) bloqueio e agendamento existentes são respeitados; servidor recusa fora da disponibilidade', async () => {
  assert.strictEqual((await excecao({ profissionalId: P.a, tipo: 'bloqueio', dataInicio: D, dataFim: D, periodos: [{ inicio: '10:00', fim: '11:00' }] }, 'h.recep.s')).status, 201);
  const a = horas(await slots(P.a, D));
  assert.ok(!a.includes('10:00') && !a.includes('09:30') && a.includes('11:00'), `bloqueio da Ana: ${a}`);
  assert.strictEqual((await agendar(P.b, D, '14:00')).status, 201);
  const b = horas(await slots(P.b, D));
  assert.ok(!b.includes('14:00') && !b.includes('13:30') && !b.includes('14:30') && b.includes('13:00') && b.includes('15:00'), `agendamento do Bruno: ${b}`);
  const fora = await agendar(P.b, D, '12:00');
  assert.deepStrictEqual([fora.status, code(fora)], [409, 'FORA_DA_DISPONIBILIDADE'], 'intervalo recusado no servidor');
  const carla = await agendar(P.c, D, '10:00');
  assert.strictEqual(code(carla), 'FORA_DA_DISPONIBILIDADE', 'profissional fora da escala recusado');
  const forcado = await agendar(P.b, D, '12:00', { foraDaDisponibilidade: true });
  assert.strictEqual(forcado.status, 201, 'encaixe forçado por quem tem agenda:encaixar');
  assert.ok(db.agendamento_eventos.some(e => e.agendamento_id === forcado.data.data.id && e.tipo === 'criado' && JSON.stringify(e.payload || e).includes('fora_da_disponibilidade')), 'registrado');
});

test('D07 (7) sem permissão não altera: recepção e profissional não abrem a unidade; profissional só bloqueia a própria agenda', async () => {
  for (const token of ['h.recep.s', 'h.edu.s']) {
    const r = await excecao({ tipo: 'fechamento', dataInicio: D7, dataFim: D7 }, token);
    assert.deepStrictEqual([r.status, code(r)], [403, 'INSUFFICIENT_ROLE'], token);
    const s = await request('PUT', `/api/disponibilidade/profissionais/${P.c}/semanal`, { token, body: { periodos: [] } });
    assert.strictEqual(s.status, 403, `${token} não muda escala`);
  }
  assert.strictEqual((await excecao({ profissionalId: P.c, tipo: 'horario', dataInicio: D7, dataFim: D7, periodos: [{ inicio: '09:00', fim: '10:00' }] }, 'h.recep.s')).status, 403, 'recepção não define horário excepcional');
  const outro = await excecao({ profissionalId: P.a, tipo: 'bloqueio', dataInicio: SEG, dataFim: SEG, periodos: [{ inicio: '09:00', fim: '10:00' }] }, 'h.edu.s');
  assert.deepStrictEqual([outro.status, code(outro)], [403, 'NOT_OWN_RESOURCE']);
  const proprio = await excecao({ profissionalId: P.edu, tipo: 'bloqueio', dataInicio: SEG, dataFim: SEG, periodos: [{ inicio: '09:00', fim: '10:00' }], motivo: 'Médico' }, 'h.edu.s');
  assert.strictEqual(proprio.status, 201, 'profissional bloqueia o próprio horário');
  const gestor = await excecao({ tipo: 'fechamento', dataInicio: add(D7, 14), dataFim: add(D7, 14), motivo: 'Feriado' }, 'h.gestor.s');
  assert.strictEqual(gestor.status, 201, 'controle negativo: gerente fecha a unidade');
  assert.strictEqual((await request('POST', '/api/disponibilidade/excecoes', { token: process.env.API_ACCESS_TOKEN, body: { tipo: 'fechamento', dataInicio: D7, dataFim: D7 } })).status, 403, 'token legado não muda escala');
});

test('D08 (8) mudança que afeta agendamento mostra o conflito e não grava sem decisão; nada é cancelado', async () => {
  const ag = await agendar(P.edu, D, '11:00');
  assert.strictEqual(ag.status, 201);
  const exc = db.disponibilidade_excecoes.find(e => e.profissional_id === P.edu && e.data_inicio === D && e.tipo === 'horario');
  const sem = await request('DELETE', `/api/disponibilidade/excecoes/${exc.id}`, { body: {} });
  assert.deepStrictEqual([sem.status, code(sem)], [409, 'CONFLITOS_PENDENTES']);
  const lista = sem.data.error.details.afetados;
  assert.deepStrictEqual(lista.map(a => [a.horario, a.profissional]), [['11:00', 'Eduardo']]);
  assert.ok(db.disponibilidade_excecoes.some(e => e.id === exc.id), 'nada gravado');
  const proprio = await excecao({ profissionalId: P.edu, tipo: 'ausencia', dataInicio: D, dataFim: D, decisoes: [{ agendamentoId: ag.data.data.id, decisao: 'manter' }] }, 'h.edu.s');
  assert.strictEqual(proprio.status, 403, 'profissional não decide conflito: precisa de escala:conflitos');
  const com = await request('DELETE', `/api/disponibilidade/excecoes/${exc.id}`, { body: { decisoes: [{ agendamentoId: ag.data.data.id, decisao: 'manter' }] } });
  assert.strictEqual(com.status, 200, JSON.stringify(com.data));
  assert.strictEqual(db.agendamentos.find(a => a.id === ag.data.data.id).status, 'agendado', 'o agendamento continua lá');
  const ev = db.disponibilidade_eventos[db.disponibilidade_eventos.length - 1];
  assert.deepStrictEqual([ev.acao, ev.actor_id, ev.decisoes[0].decisao, ev.antes.length], ['excecao_remover', U.admin, 'manter', 1], 'trilha com quem, o quê e a decisão');
});

test('D09 (9) profissional novo fica indisponível até a escala ser publicada; publicar libera', async () => {
  const novo = await request('POST', '/api/profissionais', { body: { nome: 'Novato' } });
  assert.strictEqual(novo.status, 201, JSON.stringify(novo.data));
  const id = novo.data.data.id;
  const antes = await slots(id, SEG);
  assert.deepStrictEqual([antes.slots.length, antes.disponibilidade.codigo], [0, 'ESCALA_NAO_PUBLICADA']);
  assert.strictEqual(code(await agendar(id, SEG, '10:00')), 'FORA_DA_DISPONIBILIDADE');
  const pub = await request('PUT', `/api/disponibilidade/profissionais/${id}/semanal`, { body: { periodos: [{ diaSemana: 1, inicio: '09:00', fim: '13:00' }, { diaSemana: 1, inicio: '14:00', fim: '18:00' }] } });
  assert.strictEqual(pub.status, 200, JSON.stringify(pub.data));
  const depois = horas(await slots(id, SEG));
  assert.ok(depois.includes('09:00') && depois.includes('17:00') && !depois.includes('12:30'), `${depois}`);
  assert.ok(horas(await slots(P.a, SEG)).includes('09:00'), 'existente não muda');
});

test('D10 entradas inválidas e outra empresa são recusadas', async () => {
  for (const body of [
    { tipo: 'horario', dataInicio: D, dataFim: D, periodos: [{ inicio: '16:00', fim: '08:00' }] },
    { tipo: 'horario', dataInicio: D, dataFim: D, periodos: [{ inicio: '08:00', fim: '12:00' }, { inicio: '11:00', fim: '13:00' }] },
    { tipo: 'ausencia', dataInicio: D, dataFim: D },
    { tipo: 'fechamento', dataInicio: D7, dataFim: D },
    { tipo: 'fechamento', dataInicio: '2026-02-30', dataFim: '2026-02-30' },
    { profissionalId: P.a, tipo: 'ausencia', dataInicio: D, dataFim: D, periodos: [{ inicio: '08:00', fim: '09:00' }] },
    { tipo: 'fechamento', dataInicio: D7, dataFim: D7, empresa_id: E }
  ]) {
    assert.strictEqual((await excecao(body)).status, 422, JSON.stringify(body));
  }
  const fora = await excecao({ profissionalId: 'a0000000-0000-4000-8000-0000000000ff', tipo: 'ausencia', dataInicio: D, dataFim: D });
  assert.strictEqual(fora.status, 404);
});

test('D11 visão do profissional: vê só a própria escala; a gestão vê todos', async () => {
  const meu = await request('GET', '/api/disponibilidade', { token: 'h.edu.s' });
  assert.deepStrictEqual(meu.data.data.profissionais.map(p => p.nome), ['Eduardo']);
  assert.ok(meu.data.data.excecoes.every(e => !e.profissionalId || e.profissionalId === P.edu));
  const todos = await request('GET', '/api/disponibilidade');
  assert.ok(todos.data.data.profissionais.length >= 5);
  assert.strictEqual((await request('GET', `/api/disponibilidade/dia?data=${D}&profissionalId=${P.a}`, { token: 'h.edu.s' })).status, 403);
});

test('D12 Red Team: profissionalId que não é texto não vira "unidade" para escapar da permissão', async () => {
  for (const id of [[], [''], [null], 5, {}]) {
    const prof = await excecao({ profissionalId: id, tipo: 'fechamento', dataInicio: add(D7, 21), dataFim: add(D7, 21) }, 'h.edu.s');
    assert.strictEqual(prof.status, 403, `profissional com ${JSON.stringify(id)}: ${prof.status}`);
    const rec = await excecao({ profissionalId: id, tipo: 'fechamento', dataInicio: add(D7, 21), dataFim: add(D7, 21) }, 'h.recep.s');
    assert.strictEqual(rec.status, 403, `recepção com ${JSON.stringify(id)}`);
    const adm = await excecao({ profissionalId: id, tipo: 'fechamento', dataInicio: add(D7, 21), dataFim: add(D7, 21) });
    assert.strictEqual(adm.status, 422, `admin com ${JSON.stringify(id)} recusado como entrada inválida`);
  }
  assert.ok(!db.disponibilidade_excecoes.some(e => e.data_inicio === add(D7, 21)), 'nada gravado');
});

test('D13 Red Team: zerar o horário da unidade não desliga a checagem do servidor', async () => {
  const semanalAntes = db.disponibilidade_semanal.filter(r => !r.profissional_id).map(r => ({ diaSemana: r.dia_semana, inicio: r.inicio, fim: r.fim }));
  const zera = await request('PUT', '/api/disponibilidade/unidade/semanal', { body: { periodos: [], decisoes: db.agendamentos.map(a => ({ agendamentoId: a.id, decisao: 'manter' })) } });
  assert.strictEqual(zera.status, 200, JSON.stringify(zera.data));
  const r = await agendar(P.a, add(SEG, 7), '03:00');
  assert.deepStrictEqual([r.status, code(r)], [409, 'FORA_DA_DISPONIBILIDADE']);
  assert.strictEqual((await request('PUT', '/api/disponibilidade/unidade/semanal', { body: { periodos: semanalAntes } })).status, 200);
});

test('D14 Red Team: conversão mantém o dia em que só o profissional tinha horário', () => {
  const { periodosDaUnidade, periodosDoProfissional, periodosExtrasDaUnidade } = require('../src/engines/disponibilidadeLegado');
  const empresa = { horario_por_dia: { seg: { ativo: true, inicio: '09:00', fim: '18:00' }, dom: { ativo: false } } };
  const prof = { horario: { seg: { ativo: true, inicio: '10:00', fim: '20:00' }, dom: { ativo: true, inicio: '09:00', fim: '13:00' } } };
  const unidade = periodosDaUnidade(empresa);
  const dele = periodosDoProfissional(prof, empresa);
  const extras = periodosExtrasDaUnidade(unidade, [dele]);
  assert.deepStrictEqual(extras, [{ diaSemana: 0, inicio: '09:00', fim: '13:00' }]);
  const semanal = [...unidade, ...extras].map(x => ({ profissional_id: null, dia_semana: x.diaSemana, inicio: x.inicio, fim: x.fim }))
    .concat(dele.map(x => ({ profissional_id: 'p', dia_semana: x.diaSemana, inicio: x.inicio, fim: x.fim })));
  const domingo = disponibilidadeDoDia({ data: '2026-11-22', semanal, excecoes: [], profissional: { id: 'p', escala_publicada_em: 'x' } });
  assert.deepStrictEqual(domingo.periodos, [{ start: 540, end: 780 }], 'domingo dele continua 09–13, como antes');
  const outro = disponibilidadeDoDia({ data: '2026-11-22', semanal, excecoes: [], profissional: { id: 'q', escala_publicada_em: 'x' } });
  assert.strictEqual(outro.codigo, 'FOLGA', 'quem não tinha domingo continua sem');
});

// ---------- Onda 2 (D-035): lote e modelos ----------
const lote = (body, token = 'h.admin.s') => request('POST', '/api/disponibilidade/lote', { token, body });
const SAB2 = add(D7, 6);

test('D15 lote com prévia: simular não grava; mostra quem, o quê, afetados e inválidos', async () => {
  const antes = db.disponibilidade_excecoes.length;
  const r = await lote({ profissionalIds: [P.a, P.b, 'a0000000-0000-4000-8000-0000000000ff'], operacao: { tipo: 'ausencia', dataInicio: SAB2, dataFim: SAB2, motivo: 'Treinamento' }, simular: true });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  const p = r.data.data;
  assert.deepStrictEqual([p.simulado, p.alvos.map(x => x.nome).sort(), p.operacoes.excecoes, p.invalidos.length], [true, ['Ana', 'Bruno'], 2, 1]);
  assert.ok(/Ausência/.test(p.alteracao));
  assert.strictEqual(db.disponibilidade_excecoes.length, antes, 'prévia não grava');
  const sem = await lote({ profissionalIds: [P.a, 'a0000000-0000-4000-8000-0000000000ff'], operacao: { tipo: 'ausencia', dataInicio: SAB2, dataFim: SAB2 } });
  assert.deepStrictEqual([sem.status, code(sem)], [422, 'LOTE_INVALIDO'], 'não aplica com item inválido');
});

test('D16 lote aplica tudo de uma vez: ausência para dois e fechamento da unidade, com trilha', async () => {
  const ev = db.disponibilidade_eventos.length;
  const r = await lote({ profissionalIds: [P.a, P.b], operacao: { tipo: 'ausencia', dataInicio: SAB2, dataFim: SAB2, motivo: 'Treinamento' } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  for (const p of [P.a, P.b]) assert.strictEqual((await slots(p, SAB2)).disponibilidade.codigo, 'AUSENCIA');
  assert.ok(horas(await slots(P.edu, SAB2)).length > 0, 'controle negativo: quem não foi escolhido continua');
  const fecha = await lote({ incluirUnidade: true, operacao: { tipo: 'fechamento', dataInicio: add(SAB2, 1), dataFim: add(SAB2, 1), motivo: 'Feriado' } });
  assert.strictEqual(fecha.status, 200, JSON.stringify(fecha.data));
  assert.ok(db.disponibilidade_eventos.length > ev, 'trilha gravada');
});

test('D17 lote que afeta agendamento: 409 com a lista; com decisão, aplica e mantém', async () => {
  const sab3 = add(SAB2, 7);
  const ag = await agendar(P.a, sab3, '10:00');
  assert.strictEqual(ag.status, 201, JSON.stringify(ag.data));
  const r = await lote({ profissionalIds: [P.a, P.b], operacao: { tipo: 'ausencia', dataInicio: sab3, dataFim: sab3 } });
  assert.deepStrictEqual([r.status, code(r)], [409, 'CONFLITOS_PENDENTES']);
  assert.deepStrictEqual(r.data.error.details.afetados.map(a => a.profissional), ['Ana']);
  const ok = await lote({ profissionalIds: [P.a, P.b], operacao: { tipo: 'ausencia', dataInicio: sab3, dataFim: sab3 }, decisoes: [{ agendamentoId: ag.data.data.id, decisao: 'manter' }] });
  assert.strictEqual(ok.status, 200);
  assert.strictEqual(db.agendamentos.find(a => a.id === ag.data.data.id).status, 'agendado');
});

test('D18 modelos: criar, nome único, editar, duplicar, arquivar e reativar', async () => {
  const c = await request('POST', '/api/disponibilidade/modelos', { body: { nome: 'Equipe de sábado', periodos: [{ diaSemana: 6, inicio: '08:00', fim: '14:00' }] } });
  assert.strictEqual(c.status, 201, JSON.stringify(c.data));
  const id = c.data.data.id;
  assert.deepStrictEqual(code(await request('POST', '/api/disponibilidade/modelos', { body: { nome: ' equipe de SÁBADO ' } })), 'MODEL_NAME_EXISTS');
  assert.strictEqual((await request('PATCH', `/api/disponibilidade/modelos/${id}`, { body: { periodos: [{ diaSemana: 6, inicio: '08:00', fim: '13:00' }] } })).data.data.periodos[0].fim, '13:00');
  const dup = await request('POST', `/api/disponibilidade/modelos/${id}/duplicar`, { body: {} });
  assert.deepStrictEqual([dup.status, dup.data.data.nome], [201, 'Equipe de sábado (cópia)']);
  assert.strictEqual((await request('PATCH', `/api/disponibilidade/modelos/${dup.data.data.id}`, { body: { arquivado: true } })).data.data.arquivado, true);
  const lista = (await request('GET', '/api/disponibilidade/modelos')).data.data.map(m => m.nome);
  assert.deepStrictEqual(lista, ['Equipe de sábado'], 'arquivado sai da lista');
  assert.strictEqual((await request('GET', '/api/disponibilidade/modelos?arquivados=1')).data.data.length, 2);
  for (const body of [{ nome: '' }, { nome: 'x'.repeat(81) }, { nome: 'Ok', periodos: [{ diaSemana: 9, inicio: '08:00', fim: '09:00' }] }]) {
    assert.strictEqual((await request('POST', '/api/disponibilidade/modelos', { body })).status, 422, JSON.stringify(body));
  }
});

test('D19 aplicar modelo num período cria horário excepcional só nos dias do modelo; mudar o modelo não muda o aplicado', async () => {
  const [m] = (await request('GET', '/api/disponibilidade/modelos')).data.data;
  const sab4 = add(SAB2, 14);
  assert.strictEqual((await lote({ incluirUnidade: true, profissionalIds: [P.c], operacao: { modeloId: m.id, modo: 'periodo', dataInicio: add(sab4, -1), dataFim: add(sab4, 1) } })).status, 200);
  const carla = await slots(P.c, sab4);
  assert.deepStrictEqual([horas(carla)[0], horas(carla).sort().pop()], ['08:00', '12:00'], `${horas(carla)}`);
  assert.ok(!db.disponibilidade_excecoes.some(e => e.profissional_id === P.c && e.data_inicio !== sab4 && e.tipo === 'horario' && e.data_inicio >= add(sab4, -1) && e.data_inicio <= add(sab4, 1)), 'só o sábado do período');
  await request('PATCH', `/api/disponibilidade/modelos/${m.id}`, { body: { periodos: [{ diaSemana: 6, inicio: '09:00', fim: '10:00' }] } });
  assert.strictEqual(horas(await slots(P.c, sab4))[0], '08:00', 'aplicado continua igual');
  const semanal = await lote({ profissionalIds: [P.c], operacao: { modeloId: m.id, modo: 'semanal' } });
  assert.strictEqual(semanal.status, 200, JSON.stringify(semanal.data));
  assert.deepStrictEqual(db.disponibilidade_semanal.filter(r => r.profissional_id === P.c).map(r => `${r.dia_semana} ${r.inicio}-${r.fim}`), ['6 09:00-10:00'], 'como semana padrão substitui a escala dela');
});

test('D20 lote e modelos: só gestão; recepção, profissional e legado recusados', async () => {
  for (const token of ['h.recep.s', 'h.edu.s', process.env.API_ACCESS_TOKEN]) {
    assert.strictEqual((await lote({ profissionalIds: [P.a], operacao: { tipo: 'ausencia', dataInicio: SAB2, dataFim: SAB2 }, simular: true }, token)).status, 403, `lote ${token}`);
    assert.strictEqual((await request('GET', '/api/disponibilidade/modelos', { token })).status, 403, `modelos ${token}`);
  }
  assert.strictEqual((await lote({ profissionalIds: [P.a], operacao: { tipo: 'ausencia', dataInicio: SAB2, dataFim: SAB2 }, simular: true }, 'h.gestor.s')).status, 200, 'controle negativo: gerente pode');
});

// ---------- D-046: bloqueio do próprio profissional é dele; histórico imutável com cópia ----------
test('D21 bloqueio marcado pelo profissional: só ele remove; gestão, recepção e admin recebem 403', async () => {
  const lista = (await request('GET', '/api/disponibilidade')).data.data.excecoes;
  const dele = lista.find(e => e.profissionalId === P.edu && e.tipo === 'bloqueio' && e.motivo === 'Médico');
  assert.ok(dele && dele.marcadoPeloProfissional === true, 'a lista marca o bloqueio como do profissional');
  for (const token of ['h.admin.s', 'h.gestor.s', 'h.recep.s']) {
    const r = await request('DELETE', `/api/disponibilidade/excecoes/${dele.id}`, { token, body: {} });
    assert.deepStrictEqual([r.status, code(r)], [403, 'BLOQUEIO_DO_PROFISSIONAL'], token);
  }
  assert.ok(db.disponibilidade_excecoes.some(e => e.id === dele.id), 'continua na agenda');
  // Controle negativo: bloqueio que a gestão marcou para ele, a gestão remove.
  const g = await excecao({ profissionalId: P.edu, tipo: 'bloqueio', dataInicio: SEG, dataFim: SEG, periodos: [{ inicio: '15:00', fim: '16:00' }], motivo: '=HYPERLINK("http://x")' }, 'h.gestor.s');
  assert.strictEqual(g.status, 201);
  const daGestao = (await request('GET', '/api/disponibilidade')).data.data.excecoes.find(e => e.id === g.data.data.ids[0]);
  assert.strictEqual(daGestao.marcadoPeloProfissional, false);
  assert.strictEqual((await request('DELETE', `/api/disponibilidade/excecoes/${daGestao.id}`, { token: 'h.gestor.s', body: {} })).status, 200, 'o da gestão a gestão remove');
  // O próprio profissional remove o seu (cancelar é livre; a trilha guarda).
  const r = await request('DELETE', `/api/disponibilidade/excecoes/${dele.id}`, { token: 'h.edu.s', body: {} });
  assert.strictEqual(r.status, 200, JSON.stringify(r.data));
});

test('D22 histórico de bloqueios: da trilha imutável, com origem, só o seu para o profissional, CSV com SHA-256', async () => {
  const h = await request('GET', '/api/disponibilidade/bloqueios/historico', { token: 'h.edu.s' });
  assert.strictEqual(h.status, 200, JSON.stringify(h.data));
  const { itens, csv, sha256 } = h.data.data;
  assert.ok(itens.length >= 4 && itens.every(i => i.profissionalId === P.edu), 'profissional vê só o próprio');
  const chave = i => [i.acao, i.inicio, i.origem].join(' ');
  const ks = itens.map(chave);
  for (const k of ['marcou 09:00 profissional', 'removeu 09:00 profissional', 'marcou 15:00 equipe', 'removeu 15:00 equipe']) assert.ok(ks.includes(k), `${k} em ${ks}`);
  assert.ok(itens.find(i => i.inicio === '15:00').feitoPor === 'gestor', 'nome de quem fez');
  assert.ok(itens.every((i, n) => !n || itens[n - 1].quando >= i.quando), 'mais recente primeiro');
  assert.strictEqual(createHash('sha256').update(csv, 'utf8').digest('hex'), sha256, 'SHA-256 confere com o CSV');
  assert.ok(csv.startsWith('evento,quando,acao,') && csv.includes(`"'=HYPERLINK(""http://x"")"`), 'fórmula de planilha neutralizada');
  const outro = await request('GET', `/api/disponibilidade/bloqueios/historico?profissionalId=${P.a}`, { token: 'h.edu.s' });
  assert.ok(outro.data.data.itens.every(i => i.profissionalId === P.edu), 'pedir outro profissional não vaza');
  const daAna = await request('GET', `/api/disponibilidade/bloqueios/historico?profissionalId=${P.a}`);
  assert.ok(daAna.status === 200 && daAna.data.data.itens.every(i => i.profissionalId === P.a), 'gestão filtra por profissional');
  assert.strictEqual((await request('GET', '/api/disponibilidade/bloqueios/historico', { token: process.env.API_ACCESS_TOKEN })).status, 403, 'token legado não lê');
  assert.strictEqual((await request('GET', '/api/disponibilidade/bloqueios/historico?profissionalId=x')).status, 422);
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
  console.log(`\nDisponibilidade Gate: ${passed}/${tests.length} testes verdes.`);
  if (failed) process.exit(1);
})();

// Schedule Slots Gate: motor de slots-âncora (funções puras, sem Supabase).

const assert = require('assert');
const {
  janelaDoDia,
  resolveJanela,
  resolveDuracaoMin,
  computeSlots,
  agoraNoFuso,
  buildSlotsDoDia
} = require('../src/engines/SlotEngine');
const { assertNoScheduleConflict } = require('../src/engines/ScheduleEngine');
const { validateSlotsQuery } = require('../src/validators/agenda.validator');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const SEG = '2026-10-19'; // segunda-feira
const PROF = { id: 'p1', horario: { seg: { ativo: true, inicio: '09:00', fim: '12:00' } }, overrides: {} };
const SERV = { id: 's1', duracao_min: 60 };
const P_UUID = 'aaaaaaaa-0000-0000-0000-000000000001';
const S_UUID = 'bbbbbbbb-0000-0000-0000-000000000001';
const horarios = slots => slots.map(s => s.horario);
const recomendados = slots => slots.filter(s => s.recomendado).map(s => s.horario);

test('01 janelaDoDia aceita formato do PWA ({seg:{ativo,inicio,fim}}) e do insights ({1:{start,end}})', () => {
  assert.deepStrictEqual(janelaDoDia({ seg: { ativo: true, inicio: '09:00', fim: '18:00' } }, 1), { inicio: 540, fim: 1080 });
  assert.deepStrictEqual(janelaDoDia({ 1: { start: '08:30', end: '12:00' } }, 1), { inicio: 510, fim: 720 });
  assert.strictEqual(janelaDoDia({ seg: { ativo: false, inicio: '09:00', fim: '18:00' } }, 1), null);
  assert.strictEqual(janelaDoDia({ seg: { ativo: true, inicio: '18:00', fim: '09:00' } }, 1), null);
});

test('02 sem horário configurado falha fechado (sem expediente inventado)', () => {
  assert.strictEqual(resolveJanela({ profissional: { horario: {} }, empresa: {}, data: SEG }), null);
  const r = buildSlotsDoDia({ data: SEG, profissional: { id: 'p1', horario: {} }, empresa: {}, servico: SERV, agendamentos: [] });
  assert.strictEqual(r.janela, null);
  assert.deepStrictEqual(r.slots, []);
});

test('03 profissional com folga no dia não recebe slots mesmo com empresa aberta', () => {
  const empresa = { horario_por_dia: { seg: { ativo: true, inicio: '08:00', fim: '20:00' } } };
  const prof = { id: 'p1', horario: { ter: { ativo: true, inicio: '09:00', fim: '18:00' } } };
  assert.strictEqual(resolveJanela({ profissional: prof, empresa, data: SEG }), null);
});

test('04 janela = interseção profissional × empresa', () => {
  const empresa = { horario_por_dia: { seg: { ativo: true, inicio: '10:00', fim: '20:00' } } };
  assert.deepStrictEqual(resolveJanela({ profissional: PROF, empresa, data: SEG }), { inicio: 600, fim: 720 });
});

test('05 duração: override do profissional > serviço > 30; mesma regra para sugerir e gravar', () => {
  const prof = { overrides: { s1: { duracao_min: 45 } } };
  assert.strictEqual(resolveDuracaoMin({ servico: SERV, profissional: prof }), 45);
  assert.strictEqual(resolveDuracaoMin({ servico: SERV, profissional: { overrides: { s1: { duracao: 50 } } } }), 50);
  assert.strictEqual(resolveDuracaoMin({ servico: SERV, profissional: {} }), 60);
  assert.strictEqual(resolveDuracaoMin({ servico: { id: 'x', duracao_min: 0 }, profissional: {} }), 30);
  assert.strictEqual(resolveDuracaoMin({ servico: SERV, profissional: prof, duracaoMin: 90 }), 90);
});

test('06 agenda vazia: âncoras são abertura e fechamento', () => {
  const slots = computeSlots({ janela: { inicio: 540, fim: 720 }, ocupados: [], duracaoMin: 60, passoMin: 30, minUtilMin: 30 });
  assert.deepStrictEqual(horarios(slots), ['09:00', '09:30', '10:00', '10:30', '11:00']);
  assert.deepStrictEqual(slots.filter(s => s.ancora).map(s => s.horario), ['09:00', '11:00']);
  assert.deepStrictEqual(recomendados(slots), ['09:00', '11:00']);
});

test('07 nenhum slot sobrepõe atendimento ativo (consistente com assertNoScheduleConflict)', () => {
  const agendamentos = [
    { id: 'a1', profissional_id: 'p1', data: SEG, horario: '10:00:00', duracao_min: 45, status: 'agendado' },
    { id: 'a2', profissional_id: 'p1', data: SEG, horario: '11:30:00', duracao_min: 30, status: 'concluido' }
  ];
  const r = buildSlotsDoDia({ data: SEG, profissional: PROF, empresa: {}, servico: { id: 's2', duracao_min: 30 }, agendamentos });
  assert.ok(r.slots.length > 0);
  for (const s of r.slots) {
    assertNoScheduleConflict({ agendamento: { id: null, profissionalId: 'p1', data: SEG, horario: s.horario, duracaoMin: 30 }, existing: agendamentos });
  }
});

test('08 atendimento concluído também ancora (bug do original: ignorava COMPLETED)', () => {
  const agendamentos = [{ profissional_id: 'p1', data: SEG, horario: '10:00', duracao_min: 60, status: 'concluido' }];
  const r = buildSlotsDoDia({ data: SEG, profissional: PROF, empresa: {}, servico: { id: 's2', duracao_min: 30 }, agendamentos });
  const s0930 = r.slots.find(s => s.horario === '09:30');
  const s1100 = r.slots.find(s => s.horario === '11:00');
  assert.strictEqual(s0930.ancora, true, '09:30 encosta no início do concluído');
  assert.strictEqual(s1100.ancora, true, '11:00 encosta no fim do concluído');
});

test('09 cancelado, no_show e reagendado não ocupam a agenda', () => {
  const agendamentos = ['cancelado', 'no_show', 'reagendado'].map((status, i) => ({ profissional_id: 'p1', data: SEG, horario: `${9 + i}:00`, duracao_min: 60, status }));
  const r = buildSlotsDoDia({ data: SEG, profissional: PROF, empresa: {}, servico: SERV, agendamentos });
  assert.deepStrictEqual(horarios(r.slots), ['09:00', '09:30', '10:00', '10:30', '11:00']);
});

test('10 borda fora da grade vira candidato (atendimento termina 09:45 com passo 30)', () => {
  const slots = computeSlots({ janela: { inicio: 540, fim: 720 }, ocupados: [{ start: 540, end: 585 }], duracaoMin: 30, passoMin: 30, minUtilMin: 30 });
  assert.strictEqual(slots[0].horario, '09:45');
  assert.strictEqual(slots[0].ancora, true);
  assert.ok(recomendados(slots).includes('09:45'));
});

test('11 recomenda a âncora que não deixa sobra inutilizável', () => {
  // Janela livre 09:00–10:15 (75 min), serviço 45, menor serviço vendável 30.
  // 09:00 deixa 30 min úteis depois; 09:30 deixa 30 antes; 09:15 deixa 15 antes (inútil).
  const slots = computeSlots({ janela: { inicio: 540, fim: 615 }, ocupados: [], duracaoMin: 45, passoMin: 15, minUtilMin: 30 });
  const s0915 = slots.find(s => s.horario === '09:15');
  assert.strictEqual(s0915.ancora, false);
  assert.strictEqual(s0915.desperdicioMin, 30, '15 antes + 15 depois inutilizáveis');
  assert.deepStrictEqual(recomendados(slots), ['09:00', '09:30']);
});

test('12 janela livre que só cabe com sobra pequena ainda recomenda a melhor âncora', () => {
  // Janela 60 min, serviço 45, menor vendável 30: qualquer encaixe deixa 15 inúteis.
  const slots = computeSlots({ janela: { inicio: 540, fim: 600 }, ocupados: [], duracaoMin: 45, passoMin: 15, minUtilMin: 30 });
  assert.deepStrictEqual(recomendados(slots), ['09:00', '09:15']);
});

test('13 almoço da empresa bloqueia e ancora', () => {
  const prof = { id: 'p1', horario: { seg: { ativo: true, inicio: '09:00', fim: '18:00' } } };
  const empresa = { intervalo_almoco: true, almoco_inicio: '12:00', almoco_fim: '13:00', slot_padrao: 30 };
  const r = buildSlotsDoDia({ data: SEG, profissional: prof, empresa, servico: SERV, agendamentos: [] });
  assert.ok(!r.slots.some(s => s.horario >= '11:31' && s.horario < '13:00'), 'nada sobrepõe o almoço');
  assert.ok(r.slots.find(s => s.horario === '11:00').ancora);
  assert.ok(r.slots.find(s => s.horario === '13:00').ancora);
});

test('14 hoje: não sugere horário passado e alinha à grade; dia passado não tem slots', () => {
  const agora = { data: SEG, minuto: 10 * 60 + 7 };
  const r = buildSlotsDoDia({ data: SEG, profissional: PROF, empresa: {}, servico: SERV, agendamentos: [], agora });
  assert.strictEqual(r.slots[0].horario, '10:30');
  assert.ok(r.slots[0].ancora);
  const passado = buildSlotsDoDia({ data: '2026-10-18', profissional: PROF, empresa: {}, servico: SERV, agendamentos: [], agora });
  assert.deepStrictEqual(passado.slots, []);
});

test('15 agoraNoFuso usa o fuso configurado, não UTC (bug do original após 21h)', () => {
  const r = agoraNoFuso('America/Sao_Paulo', new Date('2026-10-17T01:30:00Z'));
  assert.deepStrictEqual(r, { data: '2026-10-16', minuto: 22 * 60 + 30 });
});

test('16 outro profissional e outra data não afetam os slots', () => {
  const agendamentos = [
    { profissional_id: 'p2', data: SEG, horario: '09:00', duracao_min: 180, status: 'agendado' },
    { profissional_id: 'p1', data: '2026-10-20', horario: '09:00', duracao_min: 180, status: 'agendado' }
  ];
  const r = buildSlotsDoDia({ data: SEG, profissional: PROF, empresa: {}, servico: SERV, agendamentos });
  assert.strictEqual(r.slots.length, 5);
});

test('17 validateSlotsQuery exige data válida, UUIDs de profissional e serviço; limita duracaoMin', () => {
  const ok = validateSlotsQuery({ data: SEG, profissionalId: P_UUID, servicoId: S_UUID, duracaoMin: '45' });
  assert.deepStrictEqual(ok, { data: SEG, profissionalId: P_UUID, servicoId: S_UUID, duracaoMin: 45 });
  assert.throws(() => validateSlotsQuery({ data: SEG, profissionalId: 'nao-uuid', servicoId: S_UUID }), e => e.code === 'INVALID_UUID');
  assert.throws(() => validateSlotsQuery({ data: '19/10/2026', profissionalId: 'p1', servicoId: 's1' }), e => e.code === 'DATE_REQUIRED');
  assert.throws(() => validateSlotsQuery({ data: SEG, servicoId: 's1' }), e => e.code === 'PROFESSIONAL_REQUIRED');
  assert.throws(() => validateSlotsQuery({ data: SEG, profissionalId: 'p1' }), e => e.code === 'SERVICE_ID_REQUIRED');
  assert.throws(() => validateSlotsQuery({ data: SEG, profissionalId: 'p1', servicoId: S_UUID, duracaoMin: '2' }), e => e.code === 'INVALID_DURATION');
});

test('18 query não aceita empresa_id: o tenant não faz parte da entrada do motor', () => {
  const r = validateSlotsQuery({ data: SEG, profissionalId: P_UUID, servicoId: S_UUID, empresa_id: 'attacker' });
  assert.ok(!('empresa_id' in r));
});

(async () => {
  let passed = 0;
  for (const t of tests) {
    try { await t.fn(); passed++; console.log(`OK ${t.name}`); }
    catch (err) { console.error(`FAIL ${t.name}\n  ${err.message}`); }
  }
  console.log(`\nSchedule Slots Gate: ${passed}/${tests.length} testes verdes.`);
  if (passed !== tests.length) process.exit(1);
})();

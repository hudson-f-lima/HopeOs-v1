// Gate da 027 no backend (D-063): a chave do número é a mesma do banco (chave_numero_br) e os
// erros das RPCs de agenda viram erros da API — inclusive o HS412 de agendamento_criar, que antes
// da D-063 saía como 500 no banco real (só o espelho em memória traduzia).
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'gate-atomico';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';
const assert = require('assert');
const { chaveNumeroBr } = require('../src/engines/ReminderEngine');
const { chaveNumero } = require('../src/routes/publicBooking');
const { normalizarWhatsapp } = require('../src/engines/ReminderEngine');
const { SupabaseRepository, erroDaAgenda } = require('../src/repositories/SupabaseRepository');

const tests = [];
const test = (n, f) => tests.push({ n, f });

// Mesma tabela do bloco 1 de supabase/tests/gate_027.sql (valores escritos à mão).
const TABELA = [
  ['(21) 99999-0001', '5521999990001'], ['+55 21 99999-0001', '5521999990001'], ['5521999990001', '5521999990001'],
  ['21 9999-0001', '5521999990001'], ['21 3333-4444', '552133334444'], ['123', null], [null, null], ['55 21 3333-4444', '552133334444']
];

test('A01 chaveNumeroBr = chave_numero_br do banco (tabela do gate_027)', () => {
  for (const [entrada, esperado] of TABELA) assert.strictEqual(chaveNumeroBr(entrada), esperado, String(entrada));
});

test('A02 chaveNumeroBr = regra que o link público já usava (chaveNumero ∘ normalizarWhatsapp)', () => {
  for (const [entrada] of TABELA) {
    const antes = normalizarWhatsapp(entrada);
    assert.strictEqual(chaveNumeroBr(entrada), antes ? chaveNumero(antes) : null, String(entrada));
  }
});

test('A03 erros das RPCs: HS409 conflito (com detalhes), HS412 escala mudou, HS410 agendamento mudou, outros passam', () => {
  const c = erroDaAgenda({ code: 'HS409', details: '[{"id":"x"}]' });
  assert.strictEqual(c.code, 'SCHEDULE_CONFLICT'); assert.strictEqual(c.statusCode, 409); assert.deepStrictEqual(c.details.conflitos, [{ id: 'x' }]);
  const e = erroDaAgenda({ code: 'HS412' });
  assert.strictEqual(e.code, 'ESCALA_MUDOU'); assert.strictEqual(e.statusCode, 409);
  const m = erroDaAgenda({ code: 'HS410' });
  assert.strictEqual(m.code, 'AGENDAMENTO_MUDOU'); assert.strictEqual(m.statusCode, 409);
  const outro = { code: 'P0001', message: 'x' };
  assert.strictEqual(erroDaAgenda(outro), outro);
});

// Repositório com um cliente Supabase falso: só a chamada rpc() importa aqui.
function repoCom(resposta) {
  const repo = Object.create(SupabaseRepository.prototype);
  repo.empresaId = 'e0000000-0000-4000-8000-000000000001';
  repo.chamadas = [];
  repo.supabase = { rpc: async (nome, args) => { repo.chamadas.push({ nome, args }); return resposta; } };
  return repo;
}

test('A04 criarAgendamento no banco real: HS412 vira 409 ESCALA_MUDOU (antes: 500)', async () => {
  const repo = repoCom({ data: null, error: { code: 'HS412', message: 'ESCALA_MUDOU' } });
  await assert.rejects(repo.criarAgendamento({ agendamento: {} }), e => e.code === 'ESCALA_MUDOU' && e.statusCode === 409);
});

test('A05 RPCs da 027 ausentes (PGRST202 / 42883): devolvem null para a rota usar o caminho anterior', async () => {
  for (const code of ['PGRST202', '42883']) {
    assert.strictEqual(await repoCom({ data: null, error: { code } }).criarAgendamentoPublico({ numero: '5521999990001', agendamento: {}, evento: {} }), null);
    assert.strictEqual(await repoCom({ data: null, error: { code } }).remarcarAgendamento({ originalId: 'x', deStatus: ['agendado'], agendamento: {} }), null);
  }
});

test('A06 RPCs da 027: parâmetros com a empresa do repositório e resposta traduzida', async () => {
  const pub = repoCom({ data: { agendamento: { id: 'ag1' }, cliente_id: 'c1', cliente_criado: true, cliente_concorrente: false }, error: null });
  const r = await pub.criarAgendamentoPublico({ numero: '5521999990001', clienteNovo: { nome: 'N' }, agendamento: { horario: '10:00' }, evento: { tipo: 't' } });
  assert.deepStrictEqual(r, { agendamento: { id: 'ag1' }, clienteId: 'c1', clienteCriado: true, clienteConcorrente: false });
  assert.strictEqual(pub.chamadas[0].nome, 'agendamento_publico_criar');
  assert.strictEqual(pub.chamadas[0].args.p_empresa_id, pub.empresaId);
  assert.strictEqual(pub.chamadas[0].args.p_cliente_id, null);
  const rem = repoCom({ data: null, error: { code: 'HS410' } });
  await assert.rejects(rem.remarcarAgendamento({ originalId: 'o1', deStatus: ['agendado'], agendamento: {} }), e => e.code === 'AGENDAMENTO_MUDOU');
  assert.deepStrictEqual(rem.chamadas[0].args.p_de_status, ['agendado']);
});

(async () => {
  let ok = 0;
  for (const t of tests) {
    try { await t.f(); ok++; console.log('✓ ' + t.n); } catch (err) { console.log('✗ ' + t.n + '\n  ' + (err && err.message)); }
  }
  console.log(`\nAgendamento Atômico Gate: ${ok}/${tests.length} testes verdes.`);
  if (ok !== tests.length) process.exit(1);
})();

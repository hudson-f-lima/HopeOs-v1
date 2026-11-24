process.env.SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = 'gate-retencao';
process.env.APP_TIMEZONE = 'America/Sao_Paulo';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const { before, after, test } = require('node:test');
const clock = require('../src/config/clock');
const { setAuthProvider } = require('../src/auth/provider');
const { createMemoryIdentityStore, setIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { createAppError } = require('../src/errors');
const { computeChurnRisk, prepararIntervaloPorServico } = require('../src/engines/insights/retention');
const { app } = require('../src/app');

const empresa = 'f1000000-0000-4000-8000-000000000001';
const outraEmpresa = 'f1000000-0000-4000-8000-000000000002';
const unidade = 'f1000000-0000-4000-8000-000000000003';
const roles = ['admin', 'gestor', 'recepcao', 'recepcaoComFinanceiro', 'profissional'];
const usuarios = roles.map((papel, i) => ({
  id: `a1000000-0000-4000-8000-00000000000${i + 1}`,
  email: `${papel}@example.invalid`, nome: papel, ativo: true
}));
const memberships = roles.map((papel, i) => ({
  id: `b1000000-0000-4000-8000-00000000000${i + 1}`,
  empresa_id: empresa, user_id: usuarios[i].id, status: 'ativo',
  role: papel === 'recepcaoComFinanceiro' ? 'recepcao' : papel,
  permissoes_extras: papel === 'recepcaoComFinanceiro' ? ['painel:financeiro'] : []
}));
const clientes = [
  { id: 'cliente-setembro', empresa_id: empresa, nome: 'Cliente Setembro', whatsapp: '11900000001' },
  { id: 'cliente-outubro', empresa_id: empresa, nome: 'Cliente Outubro', whatsapp: '11900000002' },
  { id: 'cliente-outro-salao', empresa_id: outraEmpresa, nome: 'Outro salão', whatsapp: '11900000003' }
];

function semear(valorSetembro, valorOutubro) {
  const vendas = (cliente, mes, dias, valor) => dias.map(dia => ({
    id: `${cliente.id}-${dia}`, cliente_id: cliente.id, empresa_id: cliente.empresa_id,
    data: `2026-${mes}-${dia}`, hora: '10:00:00', status: 'fechado', total_recebido_centavos: valor
  }));
  installMemoryBackend({
    empresas: [{ id: empresa }, { id: outraEmpresa }], clientes,
    comandos: [
      ...vendas(clientes[0], '09', ['01', '08', '15', '22'], valorSetembro),
      ...vendas(clientes[1], '10', ['01', '10', '19', '28'], valorOutubro),
      ...vendas(clientes[2], '09', ['01', '08', '15', '22'], 90000)
    ]
  });
}

let servidor;
let base;
before(async () => {
  clock.definirRelogio(() => new Date('2026-11-24T15:00:00Z'));
  setIdentityStore(createMemoryIdentityStore({
    app_users: usuarios, empresa_memberships: memberships,
    unidades: [{ id: unidade, empresa_id: empresa, nome: 'Unidade', ativo: true }],
    membership_units: memberships.map(membership => ({ membership_id: membership.id, unit_id: unidade }))
  }));
  setAuthProvider({
    async getUser(token) {
      const i = roles.indexOf(token.split('.')[1]);
      if (i === -1) throw createAppError('UNAUTHENTICATED', 'Sessão inválida.', 401);
      return usuarios[i];
    }
  });
  servidor = app.listen(0, '127.0.0.1');
  await once(servidor, 'listening');
  base = `http://127.0.0.1:${servidor.address().port}/api/insights/retention`;
});

after(async () => {
  clock.definirRelogio();
  if (servidor) await new Promise((resolve, reject) => servidor.close(err => err ? reject(err) : resolve()));
});

async function consultar(papel, query = '') {
  const headers = papel ? { authorization: `Bearer h.${papel}.s` } : {};
  const resposta = await fetch(base + query, { headers });
  return { status: resposta.status, ...(await resposta.json()) };
}

test('recepção mantém contato e ordem por atraso, com resposta independente do gasto', async () => {
  semear(0, 12000);
  const operacional = await consultar('recepcao', `?financeiro=true&empresa_id=${outraEmpresa}`);
  assert.equal(operacional.status, 200);
  assert.deepEqual(operacional.data, {
    quemChamar: [
      { clienteId: clientes[0].id, nome: clientes[0].nome, whatsapp: clientes[0].whatsapp,
        diasDesdeUltima: 63, intervaloMedianoDias: 7, risco: 'critico' },
      { clienteId: clientes[1].id, nome: clientes[1].nome, whatsapp: clientes[1].whatsapp,
        diasDesdeUltima: 27, intervaloMedianoDias: 9, risco: 'critico' }
    ],
    novosRetencao: { total1aVisita90d: 2, voltaram: 2, pct: 100 }, rebookingRatePct: 0
  });

  semear(20000, 0);
  assert.deepEqual((await consultar('recepcao')).data, operacional.data);
});

test('admin, gestor e recepção com permissão explícita mantêm o contrato financeiro', async () => {
  semear(1000, 12000);
  const admin = await consultar('admin');
  assert.equal(admin.status, 200);
  assert.equal(admin.data.quemChamar[0].valor180dCentavos, 48000);
  assert.ok(admin.data.quemChamar[0].prioridade > 0);
  assert.equal(admin.data.segmentos.reduce((soma, s) => soma + s.valor180dCentavos, 0), 52000);
  assert.deepEqual(admin.data.assinaturaCandidatos, [{
    clienteId: clientes[1].id, nome: clientes[1].nome, visitas180d: 4, gastoMensalMedioCentavos: 8000
  }]);
  assert.deepEqual(await consultar('gestor'), admin);
  assert.deepEqual(await consultar('recepcaoComFinanceiro'), admin);
});

test('a rota de retenção mantém a guarda de acesso operacional', async () => {
  assert.equal((await consultar()).status, 401);
  const profissional = await consultar('profissional');
  assert.equal(profissional.status, 403);
  assert.equal(profissional.error.code, 'INSUFFICIENT_ROLE');
});

test('históricos curtos reutilizam a mediana do serviço sem alterar a regra para cada cliente', () => {
  const comandos = [
    { id: 'a1', cliente_id: 'a', data: '2026-09-01' }, { id: 'a2', cliente_id: 'a', data: '2026-09-08' },
    { id: 'b1', cliente_id: 'b', data: '2026-09-01' }, { id: 'b2', cliente_id: 'b', data: '2026-09-22' }
  ];
  const linha = (comando_id, servico_id) => ({ comando_id, servico_id, tipo: 'servico' });
  const comandoItens = comandos.map(c => linha(c.id, 'corte')).concat(linha('a1', 'barba'), linha('a2', 'barba'));
  const intervaloPorServico = prepararIntervaloPorServico(comandos, comandoItens);
  for (const cliente of ['a', 'b']) {
    const comandosCliente = comandos.filter(c => c.cliente_id === cliente);
    const dados = { comandosCliente, hoje: '2026-11-24', valor180dCentavos: 6000 };
    const semReuso = computeChurnRisk({ ...dados, comandos, comandoItens });
    const comReuso = computeChurnRisk({ ...dados, intervaloPorServico });
    assert.equal(comReuso.intervaloMedianoDias, 14);
    assert.deepEqual(comReuso, semReuso);
  }

  const alterados = comandos.map(c => c.id === 'b2' ? { ...c, data: '2026-10-06' } : c);
  const dadosA = { comandosCliente: comandos.slice(0, 2), hoje: '2026-11-24' };
  const novaConsulta = prepararIntervaloPorServico(alterados, comandoItens);
  assert.equal(computeChurnRisk({ ...dadosA, intervaloPorServico: novaConsulta }).intervaloMedianoDias, 21);
});

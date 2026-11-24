// Cockpit Gate (D-064): motor puro com números calculados à mão + HTTP (RBAC, isolamento, empresa_id
// da query ignorado). Hoje = domingo 2026-11-22; mês = 2026-11 (22 de 30 dias decorridos).
process.env.API_ACCESS_TOKEN = process.env.API_ACCESS_TOKEN || 'legacy-cockpit-token';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.invalid';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'gate';

const assert = require('assert');
const http = require('http');
const { env } = require('../src/config/env');
const clock = require('../src/config/clock');
const { setAuthProvider } = require('../src/auth/provider');
const { setIdentityStore, createMemoryIdentityStore } = require('../src/auth/identityStore');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
// Conserva o paginador real antes da instalação do repositório em memória.
const { list, listDasComandas } = SupabaseRepository.prototype;
const { computeCockpit } = require('../src/engines/insights/cockpit');
const { createAppError } = require('../src/errors');
const { app } = require('../src/app');

const tests = [];
const test = (n, f) => tests.push({ n, f });

const E = env.DEFAULT_EMPRESA_ID;
const EB = 'e0000000-0000-4000-8000-0000000000dd';
const P1 = 'a0000000-0000-4000-8000-0000000000d1';
const P2 = 'a0000000-0000-4000-8000-0000000000d2';
const UNIT = 'f0000000-0000-4000-8000-0000000000d1';
const HOJE = '2026-11-22';
const C = n => `d0000000-0000-4000-8000-00000000000${n}`;

// Comandas (itens líquidos / receita do salão / recebido / taxa):
//   k1 05/11 C1 10000/6000/10000/300   k2 10/11 C1 5000/3000/5000/200   k3 20/11 C2 8000/5000/8000/400
//   k4 15/10 C3 20000/12000/20000/200 (mês anterior, dentro de 1–22)   k5 25/10 9999 (fora de 1–22 de outubro)
//   kb: empresa B (não pode aparecer).
// Estorno e1 em 21/11 de parte de k3 (item de P1): itens 2000, receita 1200, reembolso 2000.
// Novembro: receita 10000+5000+8000−2000 = 21000; receita do salão 6000+3000+5000−1200 = 12800 → 61,0%.
//   Recebido 23000−2000 = 21000; taxas 900 → 4,3%. Outubro 1–22: receita 20000; taxas 200/20000 = 1,0%.
//   Variação (21000−20000)/20000 = 5,0%. Projeção 21000/22×30 = 28636.
// Metas de novembro: P1 faturamento 15000 + P1 produtos 5000 + P2 faturamento 10000 = 30000 → 70,0%.
//   P1: serviços 10000 (k1) + 8000 (k3) − 2000 (estorno de 21/11) = 16000 / 15000 = 106,7%. P2: 5000/10000 = 50,0%.
const comanda = (id, data, cliente, itens, receita, recebido, taxa, empresa_id = E) => ({ id, empresa_id, data, cliente_id: cliente, itens_liquidos_centavos: itens, receita_empresa_centavos: receita, total_recebido_centavos: recebido, taxa_total_centavos: taxa });
const COMANDOS = [
  comanda('k1', '2026-11-05', C(1), 10000, 6000, 10000, 300), comanda('k2', '2026-11-10', C(1), 5000, 3000, 5000, 200),
  comanda('k3', '2026-11-20', C(2), 8000, 5000, 8000, 400), comanda('k4', '2026-10-15', C(3), 20000, 12000, 20000, 200),
  comanda('k5', '2026-10-25', C(3), 9999, 5000, 9999, 0), comanda('kb', '2026-11-05', C(9), 77700, 50000, 77700, 0, EB)
];
const ITENS = [
  { id: 'i1', empresa_id: E, comando_id: 'k1', tipo: 'servico', profissional_id: P1, valor_liquido_centavos: 10000 },
  { id: 'i2', empresa_id: E, comando_id: 'k2', tipo: 'servico', profissional_id: P2, valor_liquido_centavos: 5000 },
  { id: 'i3', empresa_id: E, comando_id: 'k3', tipo: 'servico', profissional_id: P1, valor_liquido_centavos: 8000 }
];
const ESTORNOS = [{ id: 'e1', empresa_id: E, comando_id: 'k3', data: '2026-11-21', itens_centavos: 2000, receita_empresa_centavos: 1200, reembolso_centavos: 2000 }];
const ESTORNO_ITENS = [{ id: 'x1', empresa_id: E, estorno_id: 'e1', comando_item_id: 'i3', valor_liquido_centavos: 2000 }];
const METAS = [
  { empresa_id: E, profissional_id: P1, mes: '2026-11', tipo: 'faturamento', valor_alvo: 15000 },
  { empresa_id: E, profissional_id: P1, mes: '2026-11', tipo: 'produtos', valor_alvo: 5000 },
  { empresa_id: E, profissional_id: P2, mes: '2026-11', tipo: 'faturamento', valor_alvo: 10000 },
  { empresa_id: E, profissional_id: P1, mes: '2026-10', tipo: 'faturamento', valor_alvo: 99999 }
];
// Agenda: só terça aberta, 13h–18h (300 min) × 2 profissionais. Janela 25/10–21/11 tem 4 terças → 2400 min.
//   P1 às 13h (60 min, concluído) nas 4 terças = 240 vendidos → 10,0%. Tarde (13–17h): hora 13 = 240/480 = 50%,
//   14–17 = 0% → média 10% (< 50%: gargalo). Ociosos 2160 → 540 por semana (9 h).
//   Receita da janela: 10000+5000+8000+9999−2000 = 30999 / 240 min = 129,1625 c/min → 540 × = 69748 por semana.
//   Faltas em 30 dias: 10/11 e 17/11, 60 min cada = 120 min → 120 × 129,1625 = 15500 (arredondado).
const TER = { ativo: true, inicio: '13:00', fim: '18:00' };
const fechado = { ativo: false };
const EMPRESA = { id: E, nome: 'A', slot_padrao: 30, horario_por_dia: { dom: fechado, seg: fechado, ter: TER, qua: fechado, qui: fechado, sex: fechado, sab: fechado } };
const ag = (id, prof, data, horario, status, cliente = C(1)) => ({ id, empresa_id: E, profissional_id: prof, cliente_id: cliente, data, horario, duracao_min: 60, status });
const AGENDA = [
  ...['2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17'].map((d, i) => ag('g' + i, P1, d, '13:00:00', 'concluido')),
  ag('f1', P1, '2026-11-10', '15:00:00', 'no_show'), ag('f2', P1, '2026-11-17', '14:00:00', 'no_show')
];
// Assinaturas. PL1 mensal 9490; PL2 anual 120000 (10000/mês); PL3 arquivado 5000 (não conta como "à venda").
//   A1 (C4, PL1, desde 01/11, paga) e A2 (C5, PL2, desde 10/01, paga) vigentes → 2 ativos, MRR 9490+10000 = 19490.
//   A3 (C6, PL1, desde 01/10, outubro pago, novembro não): 21 dias de atraso > tolerância 7 → suspensa; 9490 em aberto.
//   A4 (C7) cancelada em 05/11 → churn 1/(2+1) = 33,3%. Recorrência / receita = 19490/21000 = 92,8%.
// Avulsos frequentes (2+ comandas em 30 dias, sem assinatura vigente): só C1 → 1 × 9490 (PL1 é o mais barato à venda).
const plano = (id, preco, periodicidade, extra = {}) => ({ id, empresa_id: E, nome: id, preco_centavos: preco, periodicidade, tipo_vencimento: 'base_contratacao', dia_vencimento: null, cobranca: 'manual', tolerancia_dias: 7, disponivel_venda: true, arquivado_em: null, ...extra });
const PLANOS = [plano('PL1', 9490, 'mensal'), plano('PL2', 120000, 'anual'), plano('PL3', 5000, 'mensal', { arquivado_em: '2026-09-01T00:00:00Z' })];
const ass = (id, cliente, plano_id, inicio, extra = {}) => ({ id, empresa_id: E, cliente_id: cliente, plano_id, status: 'ativa', inicio, pausada_em: null, cancelar_no_fim_do_ciclo: false, cancelada_em: null, ...extra });
const ASSINATURAS = [ass('A1', C(4), 'PL1', '2026-11-01'), ass('A2', C(5), 'PL2', '2026-01-10'), ass('A3', C(6), 'PL1', '2026-10-01'), ass('A4', C(7), 'PL1', '2026-09-01', { status: 'cancelada', cancelada_em: '2026-11-05' })];
const paga = (assinatura_id, ciclo_inicio, valor) => ({ id: assinatura_id + ciclo_inicio, empresa_id: E, assinatura_id, ciclo_inicio, vencimento: ciclo_inicio, valor_centavos: valor, estado: 'paga', pago_em: ciclo_inicio });
const COBRANCAS = [paga('A1', '2026-11-01', 9490), paga('A2', '2026-01-10', 120000), paga('A3', '2026-10-01', 9490),
  paga('A4', '2026-09-01', 9490), paga('A4', '2026-10-01', 9490)];
const CLIENTES = [1, 2, 3, 4, 5, 6, 7].map(n => ({ id: C(n), empresa_id: E, nome: 'Cliente ' + n, ativo: true }));
const PROFS = [{ id: P1, empresa_id: E, nome: 'Ana', ativo: true }, { id: P2, empresa_id: E, nome: 'Bia', ativo: true }];

const dados = {
  hoje: HOJE, comandos: COMANDOS.filter(c => c.empresa_id === E), estornos: ESTORNOS, estornoItens: ESTORNO_ITENS, metas: METAS,
  agendamentos: AGENDA, profissionais: PROFS, empresa: EMPRESA, assinaturas: ASSINATURAS, planos: PLANOS, cobrancas: COBRANCAS,
  clientes: CLIENTES, listaEspera: [], comandoItens: ITENS
};

test('K01 faturamento × meta: 210,00 de 300,00 (70%), +5% vs. outubro 1–22, projeção 286,36', () => {
  const r = computeCockpit(dados);
  assert.deepStrictEqual([r.faturamento.realizadoCentavos, r.faturamento.metaCentavos, r.faturamento.metaPct], [21000, 30000, 70]);
  assert.deepStrictEqual([r.faturamento.mesmoPeriodoAnteriorCentavos, r.faturamento.variacaoPct, r.faturamento.projecaoCentavos], [20000, 5, 28636]);
});

test('K02 margem real 128,00 (61,0%) e taxas 4,3% do recebido (antes 1,0%)', () => {
  const r = computeCockpit(dados);
  assert.deepStrictEqual([r.margem.margemCentavos, r.margem.margemPct, r.margem.taxasPctDoRecebido, r.margem.taxasPctAnterior], [12800, 61, 4.3, 1]);
});

test('K03 ocupação 10,0% nas 4 semanas; terça à tarde 10% (gargalo); 2160 min ociosos', () => {
  const r = computeCockpit(dados);
  assert.deepStrictEqual([r.ocupacao.ocupacaoPct, r.ocupacao.minutosDisponiveis, r.ocupacao.minutosVendidos, r.ocupacao.minutosOciosos], [10, 2400, 240, 2160]);
  const ter = r.ocupacao.porDia.find(d => d.dow === 2);
  assert.deepStrictEqual([ter.aberto, ter.ocupacaoPct, ter.tardePct], [true, 10, 10]);
  assert.ok(r.ocupacao.porDia.filter(d => d.dow !== 2).every(d => d.aberto === false && d.ocupacaoPct === null), 'dia fechado não vira 0%');
});

test('K03b salão que só abre de manhã: o gargalo usa o dia inteiro (antes: sumia sem a tarde)', () => {
  // Terça 09h–12h (180 min) × 2 profissionais × 4 terças = 1440; P1 às 09h 60 min × 4 = 240 → 16,7%.
  const manha = { ...EMPRESA, horario_por_dia: { ...EMPRESA.horario_por_dia, ter: { ativo: true, inicio: '09:00', fim: '12:00' } } };
  const agenda = ['2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17'].map((d, i) => ag('m' + i, P1, d, '09:00:00', 'concluido'));
  const r = computeCockpit({ ...dados, empresa: manha, agendamentos: agenda });
  const ter = r.ocupacao.porDia.find(d => d.dow === 2);
  assert.deepStrictEqual([ter.ocupacaoPct, ter.tardePct], [16.7, null]);
  const g = r.alertas.find(a => a.id === 'gargalo_ocupacao');
  assert.ok(g, 'gargalo ausente');
  assert.strictEqual(g.titulo, 'Terça: 16,7% ocupada');
  assert.match(g.porque, /o dia inteiro/);
});

test('K04 recorrência: 2 ativos, MRR 194,90, 1 suspenso (94,90 em aberto), churn 33,3%, 92,8% da receita', () => {
  const r = computeCockpit(dados).recorrencia;
  assert.deepStrictEqual([r.ativos, r.mrrCentavos, r.atrasados, r.valorEmAbertoCentavos, r.canceladasNoMes, r.churnPct, r.pctDaReceita], [2, 19490, 1, 9490, 1, 33.3, 92.8]);
});

test('K05 alertas na ordem certa, com impacto calculado e ação real', () => {
  const r = computeCockpit(dados);
  assert.deepStrictEqual(r.alertas.map(a => a.id), ['gargalo_ocupacao', 'assinantes_atrasados', 'avulsos_frequentes', 'taxas_subiram', 'faltas']);
  const [gargalo, atrasados, avulsos, , faltas] = r.alertas;
  assert.deepStrictEqual([gargalo.nivel, gargalo.impactoCentavos, gargalo.acao.destino, gargalo.acao.dow], ['alta', 69748, 'agenda', 2]);
  assert.match(gargalo.titulo, /^Terça à tarde: 10% ocupada$/);
  assert.match(gargalo.porque, /9 h livres por semana/);
  assert.deepStrictEqual([atrasados.nivel, atrasados.impactoCentavos, atrasados.clientes.map(c => c.nome)], ['alta', 9490, ['Cliente 6']]);
  assert.deepStrictEqual([avulsos.impactoCentavos, avulsos.clientes.map(c => [c.nome, c.visitas])], [9490, [['Cliente 1', 2]]]);
  assert.match(avulsos.porque, /PL1/, 'plano arquivado (mais barato) não é oferecido');
  assert.deepStrictEqual([faltas.nivel, faltas.impactoCentavos], ['info', 15500]);
  assert.strictEqual(r.saude, 'atencao');
});

test('K06 equipe: meta de P1 106,7% (estorno do mês descontado), P2 50,0%; simulador com as bases', () => {
  const r = computeCockpit(dados);
  assert.deepStrictEqual(r.equipe.map(e => [e.nome, e.ocupacaoPct, e.metaPct]), [['Ana', 20, 106.7], ['Bia', 0, 50]]);
  assert.deepStrictEqual(r.simulador, { avulsosFrequentes: 1, planoMaisBaratoMensalCentavos: 9490, minutosOciosos28d: 2160, minutosFalta30d: 120, receitaPorMinutoCentavos: 129.16 });
});

test('K07 profissional saturado: 90%+ e alguém esperando por ele → alerta para a escala', () => {
  const cheia = ['2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17'].flatMap((d, i) => ['13', '14', '15', '16', '17'].map(h => ag(`p2${i}${h}`, P2, d, `${h}:00:00`, 'concluido')));
  const r = computeCockpit({ ...dados, agendamentos: AGENDA.concat(cheia), listaEspera: [{ id: 'w1', empresa_id: E, profissional_id: P2, status: 'aguardando' }] });
  const a = r.alertas.find(x => x.id === 'profissional_saturado:' + P2);
  assert.ok(a, 'alerta ausente');
  assert.deepStrictEqual([a.titulo, a.acao.destino], ['Bia: 100% ocupado e 1 na espera', 'escalas']);
  const semEspera = computeCockpit({ ...dados, agendamentos: AGENDA.concat(cheia) });
  assert.ok(!semEspera.alertas.some(x => x.id.startsWith('profissional_saturado')), 'sem espera não há alerta');
});

test('K08 sem dados: nada inventado — sem alertas, sem meta, ocupação e churn nulos, saúde "ok"', () => {
  const r = computeCockpit({ hoje: HOJE });
  assert.deepStrictEqual(r.alertas, []);
  assert.strictEqual(r.saude, 'ok');
  assert.deepStrictEqual([r.faturamento.metaCentavos, r.faturamento.metaPct, r.faturamento.variacaoPct, r.ocupacao.ocupacaoPct, r.recorrencia.churnPct, r.margem.margemPct], [null, null, null, null, null, null]);
  assert.strictEqual(r.simulador.receitaPorMinutoCentavos, null);
  const cedo = computeCockpit({ ...dados, hoje: '2026-11-05' });
  assert.strictEqual(cedo.faturamento.projecaoCentavos, null, 'antes do dia 7 não projeta');
  assert.match(cedo.faturamento.projecaoNota, /amostra pequena/);
});

// ---------- HTTP ----------
const U = { admin: 'c0000000-0000-4000-8000-0000000000d1', gestor: 'c0000000-0000-4000-8000-0000000000d2', recep: 'c0000000-0000-4000-8000-0000000000d3', prof: 'c0000000-0000-4000-8000-0000000000d4', adminB: 'c0000000-0000-4000-8000-0000000000d5' };
setIdentityStore(createMemoryIdentityStore({
  app_users: Object.values(U).map(id => ({ id, email: `${id}@t`, nome: id, ativo: true })),
  unidades: [{ id: UNIT, empresa_id: E, nome: 'U', ativo: true }],
  empresa_memberships: [
    { id: 'm1', empresa_id: E, user_id: U.admin, role: 'admin', status: 'ativo' },
    { id: 'm2', empresa_id: E, user_id: U.gestor, role: 'gestor', status: 'ativo' },
    { id: 'm3', empresa_id: E, user_id: U.recep, role: 'recepcao', status: 'ativo' },
    { id: 'm4', empresa_id: E, user_id: U.prof, role: 'profissional', status: 'ativo', profissional_id: P1 },
    { id: 'm5', empresa_id: EB, user_id: U.adminB, role: 'admin', status: 'ativo' }
  ],
  membership_units: ['m2', 'm3', 'm4'].map(membership_id => ({ membership_id, unit_id: UNIT }))
}));
const tokens = { 'h.admin.s': U.admin, 'h.gestor.s': U.gestor, 'h.recep.s': U.recep, 'h.prof.s': U.prof, 'h.adminb.s': U.adminB };
setAuthProvider({ async getUser(t) { if (!tokens[t]) throw createAppError('UNAUTHENTICATED', 'x', 401); return { id: tokens[t] }; } });
installMemoryBackend({
  empresas: [EMPRESA, { id: EB, nome: 'B' }],
  profissionais: PROFS.concat([{ id: 'a0000000-0000-4000-8000-0000000000db', empresa_id: EB, nome: 'Zeca', ativo: true }]),
  comandos: COMANDOS, comando_itens: ITENS, comanda_estornos: ESTORNOS, comanda_estorno_itens: ESTORNO_ITENS, metas: METAS,
  agendamentos: AGENDA, assinatura_planos: PLANOS, assinaturas: ASSINATURAS, assinatura_cobrancas: COBRANCAS, clientes: CLIENTES, lista_espera: []
});
clock.definirRelogio(() => new Date('2026-11-22T15:00:00Z')); // 12h em São Paulo

let base;
function request(path, token = 'h.admin.s') {
  return new Promise((resolve, reject) => {
    http.get(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {} }, res => {
      let raw = ''; res.on('data', c => { raw += c; });
      res.on('end', () => { let data = null; try { data = JSON.parse(raw); } catch (_) {} resolve({ status: res.statusCode, data }); });
    }).on('error', reject);
  });
}

test('K09 HTTP: admin e gestor recebem o mesmo cockpit do motor', async () => {
  for (const t of ['h.admin.s', 'h.gestor.s']) {
    const r = await request('/api/cockpit', t);
    assert.strictEqual(r.status, 200, t);
    assert.deepStrictEqual([r.data.data.hoje, r.data.data.faturamento.realizadoCentavos, r.data.data.alertas.length], [HOJE, 21000, 5], t);
  }
});

test('K10 isolamento: empresa B não vê A; empresa_id na query é ignorado', async () => {
  const b = await request(`/api/cockpit?empresa_id=${E}`, 'h.adminb.s');
  assert.strictEqual(b.status, 200);
  assert.strictEqual(b.data.data.faturamento.realizadoCentavos, 77700, 'só a comanda da própria empresa');
  assert.ok(!JSON.stringify(b.data).includes('Cliente 1'), 'nenhum nome de cliente de A');
});

test('K11 RBAC: recepção e profissional 403; sem token 401', async () => {
  assert.strictEqual((await request('/api/cockpit', 'h.recep.s')).status, 403);
  assert.strictEqual((await request('/api/cockpit', 'h.prof.s')).status, 403);
  assert.strictEqual((await request('/api/cockpit', null)).status, 401);
});

const pathDesempenho = '/api/cockpit/desempenho';

test('D01 desempenho: RBAC, tenant do token, mês até hoje local e limites de período', async () => {
  clock.definirRelogio(() => new Date('2026-12-01T01:15:00Z')); // ainda é 30/11 em São Paulo
  try {
    for (const token of ['h.admin.s', 'h.gestor.s']) {
      const r = await request(pathDesempenho, token);
      assert.strictEqual(r.status, 200);
      assert.deepStrictEqual([r.data.data.inicio, r.data.data.fim], ['2026-11-01', '2026-11-30']);
    }
    const b = await request(pathDesempenho + '?empresa_id=' + E, 'h.adminb.s');
    assert.strictEqual(b.data.data.faturamentoCentavos, 77700);
    assert.strictEqual(b.data.data.resultadoFinanceiro.diferencaConciliacaoCentavos, 27700, 'divergência preservada em vez de inventar um custo');
    assert.strictEqual((await request(pathDesempenho, null)).status, 401);
    for (const token of ['h.recep.s', 'h.prof.s']) assert.strictEqual((await request(pathDesempenho, token)).status, 403);
    for (const q of ['fim=2026-02-30', 'inicio=2026-11-20&fim=2026-11-19', 'fim=2026-12-01', 'inicio=2024-01-01']) {
      assert.strictEqual((await request(pathDesempenho + '?' + q)).status, 422, q);
    }
  } finally { clock.definirRelogio(() => new Date('2026-11-22T15:00:00Z')); }
});

test('D02 desempenho reconcilia o ledger misto, conta visitas identificadas e divide pelas horas de toda a escala', async () => {
  const dia = '2026-11-17'; // terça, 5 horas por profissional
  const venda = (id, cliente_id, valor, comissao, taxa, custo) => ({
    id, empresa_id: E, cliente_id, data: dia, status: 'fechado', itens_liquidos_centavos: valor,
    total_comissao_centavos: comissao, taxa_servico_centavos: taxa, total_custo_produtos_centavos: custo,
    receita_empresa_centavos: valor - comissao - taxa - custo, gorjeta_bruta_centavos: 100, taxa_gorjeta_centavos: 8
  });
  const item = (id, comando_id, tipo, quantidade, receita_empresa_centavos) =>
    ({ id, empresa_id: E, comando_id, tipo, quantidade, receita_empresa_centavos });
  const visita = (id, data, cliente, status, minutos) => ({ ...ag(id, P1, data, '13:00:00', status, cliente), duracao_min: minutos });
  installMemoryBackend({
    empresas: [EMPRESA], profissionais: PROFS, agendamentos: [
      visita('anterior', '2025-11-18', C(1), 'concluido', 20), visita('recente', '2026-11-01', C(1), 'fechado', 20),
      visita('fora-da-janela', '2025-11-17', C(2), 'concluido', 20), visita('dentro', '2026-09-11', C(2), 'fechado', 20),
      visita('primeiro', dia, C(1), 'concluido', 20), visita('segundo', dia, C(1), 'fechado', 30),
      visita('outro', dia, C(2), 'concluido', 30), visita('marcado', dia, C(3), 'confirmado', 15),
      visita('faltou', dia, C(4), 'no_show', 60)
    ],
    comandos: [venda('mista', C(1), 16000, 3400, 300, 1500), venda('sem-cliente', null, 0, 0, 0, 0),
      venda('assinante', C(4), 0, 0, 0, 0), venda('so-produto', C(3), 2000, 0, 0, 500), { ...venda('antiga', C(4), 2000, 400, 0, 500), data: '2025-01-01' }],
    comando_itens: [item('s', 'mista', 'servico', 1, 6800), item('p', 'mista', 'produto', 3, 4000),
      item('s0', 'sem-cliente', 'servico', 1, 0), item('coberto', 'assinante', 'servico', 1, 0), item('p1', 'so-produto', 'produto', 1, 1500), item('p2', 'antiga', 'produto', 1, 1100)],
    comanda_estornos: [
      { id: 'es', empresa_id: E, comando_id: 'mista', tipo: 'parcial', data: dia, itens_centavos: 4000, comissao_centavos: 1200, receita_empresa_centavos: 2800 },
      { id: 'ep', empresa_id: E, comando_id: 'antiga', tipo: 'total', data: dia, itens_centavos: 2000, comissao_centavos: 400, receita_empresa_centavos: 1600 },
      { id: 'ef', empresa_id: E, comando_id: 'so-produto', tipo: 'total', data: '2026-11-18', itens_centavos: 2000, comissao_centavos: 0, receita_empresa_centavos: 2000 }
    ],
    comanda_estorno_itens: [
      { id: 'xs', empresa_id: E, estorno_id: 'es', comando_id: 'mista', comando_item_id: 's', quantidade: 1, receita_empresa_centavos: 2800 },
      { id: 'xp', empresa_id: E, estorno_id: 'ep', comando_id: 'antiga', comando_item_id: 'p2', quantidade: 1, receita_empresa_centavos: 1600, devolve_estoque: false },
      { id: 'xf', empresa_id: E, estorno_id: 'ef', comando_id: 'so-produto', comando_item_id: 'p1', quantidade: 1, receita_empresa_centavos: 2000 }
    ]
  });
  const relatorio = async (inicio, fim) => {
    const r = await request(pathDesempenho + '?inicio=' + inicio + '&fim=' + fim);
    assert.strictEqual(r.status, 200);
    return r.data.data;
  };
  const r = await relatorio(dia, dia);
  assert.deepStrictEqual(r, {
    inicio: dia, fim: dia, faturamentoCentavos: 12000, comandas: 4, ticketMedioCentavos: 3000,
    visitasIdentificadas: 3, atendimentosSemCliente: true, produtosUnidades: 3,
    minutosOcupados: 95, minutosDisponiveis: 600, clientesIdentificados: 3, clientesFieis: 1,
    parteSalaoServicosCentavos: 4000, parteSalaoServicosPorHoraCentavos: 400,
    resultadoFinanceiro: { faturamentoCentavos: 12000, parteSalaoCentavos: 7900, comissoesCentavos: 1800,
      taxasItensCentavos: 300, custoProdutosVendidosCentavos: 2000, diferencaConciliacaoCentavos: 0 }
  });
  const soEstorno = await relatorio('2026-11-18', '2026-11-18');
  assert.deepStrictEqual([soEstorno.faturamentoCentavos, soEstorno.produtosUnidades, soEstorno.comandas, soEstorno.ticketMedioCentavos,
    soEstorno.minutosDisponiveis, soEstorno.parteSalaoServicosPorHoraCentavos, soEstorno.atendimentosSemCliente],
    [-2000, -1, 0, null, 0, null, false]);
  const incluiEstornoTotal = await relatorio(dia, '2026-11-18');
  assert.deepStrictEqual([incluiEstornoTotal.faturamentoCentavos, incluiEstornoTotal.comandas, incluiEstornoTotal.ticketMedioCentavos], [10000, 3, 3333]);
});

test('D03 o repositório pagina mais de 1000 itens do mesmo lote, em ordem e com tenant', async () => {
  const itens = Array.from({ length: 1207 }, (_, id) => ({ id, empresa_id: E, comando_id: 'k' }));
  const paginas = [];
  const supabase = { from(t) {
    assert.strictEqual(t, 'comando_itens');
    return {
      select(campos) { assert.strictEqual(campos, 'id,comando_id'); return this; },
      eq(coluna, valor) { assert.deepStrictEqual([coluna, valor], ['empresa_id', E]); return this; },
      in(coluna, ids) { assert.deepStrictEqual([coluna, ids], ['comando_id', ['k']]); return this; },
      order(coluna) { assert.strictEqual(coluna, 'id'); return this; },
      range(de, ate) { paginas.push([de, ate]); return { data: itens.slice(de, ate + 1) }; }
    };
  } };
  const resultado = await listDasComandas.call({ empresaId: E, supabase, list }, 'comando_itens', ['k', 'k'], 'id,comando_id');
  assert.deepStrictEqual(paginas, [[0, 999], [1000, 1999]]);
  assert.deepStrictEqual(resultado, itens);
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
  console.log(`\nCockpit Gate: ${passed}/${tests.length} testes verdes.`);
  if (failed) process.exit(1);
})();

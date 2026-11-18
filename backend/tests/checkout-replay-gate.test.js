const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const http = require('node:http');
const { once } = require('node:events');
const { app } = require('../src/app');
const { installMemoryBackend } = require('../src/dev/memoryBackend');
const { createMemoryIdentityStore, setIdentityStore } = require('../src/auth/identityStore');
const { setAuthProvider } = require('../src/auth/provider');
const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
const { comandoIdDoAgendamento } = require('../src/services/CheckoutReplay');
const E = randomUUID(), B = randomUUID(), U = randomUUID(), U2 = randomUUID(), UB = randomUUID(), P = randomUUID(), PROF = randomUUID(), S = randomUUID(), G = randomUUID();
let server, base, saved, originalPreview;
const body = { idempotencyKey: randomUUID(), itens: [{ tipo: 'produto', produtoId: P, quantidade: 1 }], payments: [{ formaCode: 'pix', valorCentavos: 1000 }], gorjetaCentavos: 0 };
const db = installMemoryBackend({
  empresas: [{ id: E, nome: 'A' }, { id: B, nome: 'B' }],
  produtos: [{ id: P, empresa_id: E, nome: 'Produto', ativo: true, controla_estoque: true, estoque_atual: 1, preco_venda_centavos: 1000, custo_unitario_centavos: 200 }],
  servicos: [{ id: S, empresa_id: E, nome: 'Corte', ativo: true, valor_centavos: 1000, duracao_min: 30 }],
  profissionais: [{ id: PROF, empresa_id: E, nome: 'Profissional', ativo: true, comissao_padrao_pct: 50 }],
  agendamentos: [{ id: G, empresa_id: E, profissional_id: PROF, servico_id: S, data: '2026-11-17', horario: '10:00:00', status: 'confirmado' }],
  agendamento_eventos: [],
  formas_pagamento: [{ empresa_id: E, code: 'pix', label: 'Pix', taxa_pct: 0, taxa_fixa_centavos: 0, dias_recebimento: 0, ativo: true }]
});
before(async () => {
  setIdentityStore(createMemoryIdentityStore({
    app_users: [U, U2, UB].map(id => ({ id, email: id+'@example.test', ativo: true })),
    empresa_memberships: [[U,E],[U2,E],[UB,B]].map(([user_id,empresa_id]) => ({ id: randomUUID(), user_id, empresa_id, role: 'admin', status: 'ativo' }))
  }));
  setAuthProvider({ getUser: async jwt => ({ id: jwt === 'h.other.s' ? U2 : jwt === 'h.b.s' ? UB : U }) });
  server=http.createServer(app);server.listen(0,'127.0.0.1');await once(server,'listening');base='http://127.0.0.1:'+server.address().port;
});
after(async () => { setIdentityStore();setAuthProvider();server.close();await once(server,'close'); });
async function post(payload, token='h.a.s', action='close') {
  const r=await fetch(base+`/api/checkout/${action}`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(payload)});
  return { status:r.status, body:await r.json() };
}

test('fecha a última unidade e confirma o mesmo comando após estoque/preço mudarem', async () => {
  const first=await post(body);
  assert.equal(first.status,201,JSON.stringify(first.body));
  saved=first.body.data.saved.comandoId;originalPreview=first.body.data.preview;
  assert.equal(db.produtos[0].estoque_atual,0);
  db.produtos[0].preco_venda_centavos=5000;db.produtos[0].ativo=false;
  const retry=await post(body);
  assert.equal(retry.status,201,JSON.stringify(retry.body));
  assert.equal(retry.body.data.saved.comandoId,saved);
  assert.equal(retry.body.data.saved.idempotent,true);
  assert.deepEqual(retry.body.data.preview,originalPreview);
  assert.equal(db.comandos.length,1);assert.equal(db.comando_pagamentos.length,1);
  assert.equal(db.caixa_movimentos.length,1);assert.equal(db.produto_estoque_movimentos.length,1);
});
test('mesma chave não confirma outra intenção, outro ator nem outra empresa', async () => {
  const changed=await post({...body,payments:[{formaCode:'pix',valorCentavos:5000}]});
  assert.equal(changed.status,409);assert.equal(changed.body.error.code,'IDEMPOTENCY_MISMATCH');
  assert.notEqual(changed.body.error.details?.checkoutNotCommitted,true);
  const other=await post(body,'h.other.s');assert.equal(other.status,409);
  assert.equal(other.body.error.code,'IDEMPOTENCY_MISMATCH');
  const foreign=await post(body,'h.b.s');
  assert.notEqual(foreign.status,201);assert.equal(JSON.stringify(foreign.body).includes(saved),false);
  assert.equal(db.comandos.length,1);assert.equal(db.caixa_movimentos.length,1);
});

const linked = { idempotencyKey: randomUUID(), agendamentoId: G, itens: [{ tipo: 'servico', servicoId: S, profissionalId: PROF }], payments: [{ formaCode: 'pix', valorCentavos: 1000 }] };
test('retoma o vínculo da agenda após interrupção e recusa trocar o agendamento', async () => {
  const original=SupabaseRepository.prototype.atualizarStatusAgendamentoSe;
  SupabaseRepository.prototype.atualizarStatusAgendamentoSe=async()=>{throw new Error('interrupção simulada depois do financeiro');};
  let first;
  try { first=await post(linked); } finally { SupabaseRepository.prototype.atualizarStatusAgendamentoSe=original; }
  assert.equal(first.status,201,JSON.stringify(first.body));
  assert.equal(first.body.data.vinculoAgenda.aplicado,false);
  assert.equal(db.agendamentos[0].status,'confirmado');
  const retry=await post(linked);
  assert.equal(retry.status,201,JSON.stringify(retry.body));
  assert.equal(retry.body.data.saved.comandoId,first.body.data.saved.comandoId);
  assert.equal(retry.body.data.vinculoAgenda.aplicado,true);
  assert.equal(db.agendamentos[0].status,'concluido');
  assert.equal(db.agendamento_eventos.length,1);
  const changed=await post({...linked,agendamentoId:randomUUID()});
  assert.equal(changed.status,409);assert.equal(changed.body.error.code,'IDEMPOTENCY_MISMATCH');
  assert.equal(db.comandos.length,2);
});
test('vencedor idempotente da RPC é relido antes de confirmar intenção ou alterar agenda', async () => {
  const race={...linked,idempotencyKey:randomUUID(),agendamentoId:undefined};
  const winner={id:randomUUID(),empresa_id:E,actor_id:U2,idempotency_key:race.idempotencyKey,status:'fechado',snapshot:{request:{raw:race},preview:originalPreview}};
  db.comandos.push(winner);
  const original=SupabaseRepository.prototype.list;
  let firstRead=true;
  SupabaseRepository.prototype.list=async function(table,filters){
    if(table==='comandos'&&filters.idempotency_key===race.idempotencyKey&&firstRead){firstRead=false;return [];}
    return original.call(this,table,filters);
  };
  let result;
  try { result=await post(race); } finally { SupabaseRepository.prototype.list=original; }
  assert.equal(result.status,409,JSON.stringify(result.body));
  assert.equal(result.body.error.code,'IDEMPOTENCY_MISMATCH');
  assert.equal(JSON.stringify(result.body).includes(winner.id),false);
  assert.equal(db.caixa_movimentos.length,2);
});
test('recusa de pedido novo antes da RPC é marcada sem confundir fechamento confirmado', async () => {
  const before=db.comandos.length;
  const rejected=await post({...body,idempotencyKey:randomUUID()});
  assert.equal(rejected.status,422);
  assert.equal(rejected.body.error.details.checkoutNotCommitted,true);
  assert.equal(db.comandos.length,before);
});

function novoAgendamento(status = 'confirmado') {
  const agendamento = { ...db.agendamentos[0], id: randomUUID(), status };
  db.agendamentos.push(agendamento);
  return agendamento;
}

test('duas chaves de operadores diferentes chegam à RPC, mas liquidam o agendamento uma só vez', async () => {
  const agendamento = novoAgendamento();
  Object.assign(db.produtos[0], { ativo: true, estoque_atual: 1, preco_venda_centavos: 1000 });
  const pedido = {
    ...linked, idempotencyKey: randomUUID(), agendamentoId: agendamento.id, id: randomUUID(),
    itens: [...linked.itens, ...body.itens], payments: [{ formaCode: 'pix', valorCentavos: 2000 }]
  };
  const concorrente = { ...pedido, idempotencyKey: randomUUID(), id: randomUUID(), agendamentoId: ` ${agendamento.id.toUpperCase()} ` };
  const original = SupabaseRepository.prototype.saveCheckoutClose;
  const recebidos = [];
  let liberar;
  let abortar;
  const ambosNaRpc = new Promise((resolve, reject) => { liberar = resolve; abortar = reject; });
  const timer = setTimeout(() => abortar(new Error('Os dois pedidos não chegaram à RPC.')), 5000);
  SupabaseRepository.prototype.saveCheckoutClose = async function (args) {
    recebidos.push([args.payload.id, args.payload.idempotencyKey]);
    if (recebidos.length === 2) liberar();
    await ambosNaRpc;
    return original.call(this, args);
  };
  let respostas;
  try { respostas = await Promise.all([post(pedido), post(concorrente, 'h.other.s')]); }
  finally {
    clearTimeout(timer);
    SupabaseRepository.prototype.saveCheckoutClose = original;
  }

  const id = comandoIdDoAgendamento(E, agendamento.id);
  assert.deepEqual(recebidos.map(([comandoId]) => comandoId), [id, id]);
  assert.deepEqual(new Set(recebidos.map(([, key]) => key)), new Set([pedido.idempotencyKey, concorrente.idempotencyKey]));
  assert.deepEqual(respostas.map(r => r.status).sort(), [201, 409]);
  const vencedora = respostas.find(r => r.status === 201);
  const perdedora = respostas.find(r => r.status === 409);
  assert.equal(vencedora.body.data.saved.comandoId, id);
  assert.equal(perdedora.body.error.code, 'AGENDAMENTO_COMANDA_JA_FECHADA');
  assert.equal(perdedora.body.error.details, null);
  assert.equal(JSON.stringify(perdedora.body).includes(id), false);
  assert.equal(db.comandos.filter(c => c.id === id).length, 1);
  assert.equal(db.comando_itens.filter(i => i.comando_id === id).length, 2);
  for (const tabela of ['comando_pagamentos', 'caixa_movimentos', 'produto_estoque_movimentos']) {
    assert.equal(db[tabela].filter(linha => linha.comando_id === id).length, 1, tabela);
  }
  assert.equal(db.produtos[0].estoque_atual, 0);
  assert.equal(agendamento.status, 'concluido');
  assert.equal(db.agendamento_eventos.filter(e => e.agendamento_id === agendamento.id).length, 1);
  const [originalPedido, token] = respostas[0].status === 201 ? [pedido, 'h.a.s'] : [concorrente, 'h.other.s'];
  const repeticao = await post(originalPedido, token);
  assert.equal(repeticao.status, 201);
  assert.equal(repeticao.body.data.saved.comandoId, id);
  assert.equal(repeticao.body.data.saved.idempotent, true);
  assert.equal(db.comandos.find(c => c.id === id).idempotency_key, originalPedido.idempotencyKey);
  const previa = await post(pedido, 'h.other.s', 'preview');
  assert.equal(previa.body.error.code, 'AGENDAMENTO_COMANDA_JA_FECHADA');
});

test('resposta da RPC perdida após o commit: outra chave não reabre e a original retoma a agenda', async () => {
  const agendamento = novoAgendamento();
  const pedido = { ...linked, idempotencyKey: randomUUID(), agendamentoId: agendamento.id };
  const original = SupabaseRepository.prototype.saveCheckoutClose;
  SupabaseRepository.prototype.saveCheckoutClose = async function (args) {
    await original.call(this, args);
    throw new Error('Resposta perdida antes de reconciliar agenda');
  };
  let interrompido;
  try { interrompido = await post(pedido); }
  finally { SupabaseRepository.prototype.saveCheckoutClose = original; }

  assert.equal(interrompido.status, 500);
  assert.equal(agendamento.status, 'confirmado');
  const comanda = db.comandos.find(c => c.idempotency_key === pedido.idempotencyKey);
  const outro = await post({ ...pedido, idempotencyKey: randomUUID() }, 'h.other.s');
  assert.equal(outro.status, 409);
  assert.equal(outro.body.error.code, 'AGENDAMENTO_COMANDA_JA_FECHADA');
  assert.equal(outro.body.error.details, null);
  assert.equal(agendamento.status, 'confirmado');
  const retoma = await post(pedido);
  assert.equal(retoma.status, 201);
  assert.equal(retoma.body.data.saved.comandoId, comanda.id);
  assert.equal(retoma.body.data.saved.idempotent, true);
  assert.equal(agendamento.status, 'concluido');
  assert.equal(db.caixa_movimentos.filter(m => m.comando_id === comanda.id).length, 1);
});

test('respeita comprovante histórico com ID aleatório, inclusive grafia antiga do vínculo', async () => {
  const agendamento = novoAgendamento();
  const pedido = { ...linked, idempotencyKey: randomUUID(), agendamentoId: agendamento.id };
  const id = randomUUID();
  db.comandos.push({ id, empresa_id: E, actor_id: U, idempotency_key: pedido.idempotencyKey, status: 'fechado',
    snapshot: { request: { raw: { ...pedido, agendamentoId: ` ${agendamento.id.toUpperCase()} ` } }, preview: originalPreview } });

  const outro = await post({ ...pedido, idempotencyKey: randomUUID() }, 'h.other.s');
  assert.equal(outro.status, 409);
  assert.equal(outro.body.error.code, 'AGENDAMENTO_COMANDA_JA_FECHADA');
  assert.equal(agendamento.status, 'confirmado');
  assert.equal((await post(pedido, 'h.b.s')).status, 404);
  const anterior = await post(pedido);
  assert.equal(anterior.status, 201);
  assert.equal(anterior.body.data.saved.comandoId, id);
  assert.equal(agendamento.status, 'concluido');
});

test('agendamento já finalizado sem comprovante de vínculo exige conferência e avulsa respeita a reserva do UUID', async () => {
  const finalizado = novoAgendamento('fechado');
  const ativo = novoAgendamento();
  const antes = db.comandos.length;
  const finalizadoPedido = { ...linked, idempotencyKey: randomUUID(), agendamentoId: finalizado.id };
  const finalizadoResposta = await post(finalizadoPedido);
  assert.equal(finalizadoResposta.status, 409);
  assert.equal(finalizadoResposta.body.error.code, 'AGENDAMENTO_COMANDA_JA_FECHADA');
  assert.equal(finalizadoResposta.body.error.details, null);

  const avulso = { ...linked, idempotencyKey: randomUUID(), agendamentoId: null };
  const reservado = await post({ ...avulso, id: comandoIdDoAgendamento(E, ativo.id) });
  assert.equal(reservado.status, 422);
  assert.equal(reservado.body.error.code, 'FORBIDDEN_FIELD');
  assert.equal(db.comandos.length, antes);
  const id = randomUUID();
  const aceito = await post({ ...avulso, id });
  assert.equal(aceito.status, 201);
  assert.equal(aceito.body.data.saved.comandoId, id);
  assert.equal(ativo.status, 'confirmado');
});

test('mudança de taxa com mesmo total exige nova revisão antes de gravar', async () => {
  const pedido = { ...linked, agendamentoId: undefined, idempotencyKey: randomUUID() };
  const forma = db.formas_pagamento[0];
  const taxaOriginal = forma.taxa_fixa_centavos;
  const tamanho = db.comandos.length;
  try {
    const anterior = await post(pedido, 'h.a.s', 'preview');
    assert.equal(anterior.status, 200);
    const revisao = anterior.body.data.revisaoFinanceira;
    assert.match(revisao, /^[0-9a-f]{64}$/);
    forma.taxa_fixa_centavos = 50;
    const vencido = await post({ ...pedido, revisaoFinanceira: revisao });
    assert.equal(vencido.body.error.code, 'CHECKOUT_REVISAO_ALTERADA');
    assert.equal(db.comandos.length, tamanho);
    const atual = await post(pedido, 'h.a.s', 'preview');
    assert.notEqual(atual.body.data.revisaoFinanceira, revisao);
    const aceito = await post({ ...pedido, revisaoFinanceira: atual.body.data.revisaoFinanceira });
    assert.equal(aceito.status, 201, JSON.stringify(aceito.body));
  } finally { forma.taxa_fixa_centavos = taxaOriginal; }
});

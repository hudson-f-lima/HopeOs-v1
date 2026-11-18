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
async function post(payload, token='h.a.s') {
  const r=await fetch(base+'/api/checkout/close',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(payload)});
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

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');

const raiz = resolve(__dirname, '../..');
const journalUrl = pathToFileURL(resolve(raiz, 'js/checkout-pending.js')).href;
const checkoutSource = readFileSync(resolve(raiz, 'js/ui/checkout.js'), 'utf8');
const sessao = { principal: 'user', user_id: 'prof-a', empresa_id: 'salao-a' };
const comanda = {
  idempotencyKey: 'tentativa-01',
  clienteId: 'cliente-1',
  clienteNome: 'Nome a excluir',
  access_token: 'token a excluir',
  itens: [
    { tipo: 'servico', servicoId: 'serv-1', profissionalId: 'prof-1', assinaturaId: 'plano-1', planoTexto: 'nome do plano a excluir' },
    { tipo: 'produto', produtoId: 'prod-1', quantidade: 2 }
  ],
  payments: [{ formaCode: 'pix', valorCentavos: 4000, telefone: 'telefone a excluir' }],
  gorjetaCentavos: 500,
  agendamentoId: 'agenda-1'
};

function armazenamentoEmMemoria() {
  const valores = new Map();
  let fila = Promise.resolve();
  const transacao = (chave, gravar, decidir) => {
    const acao = fila.then(() => {
      const { retorno, registro } = decidir(valores.get(chave));
      if (registro === null) valores.delete(chave);
      else if (registro !== undefined) valores.set(chave, registro);
      return retorno;
    });
    fila = acao.catch(() => {});
    return acao;
  };
  return { valores, transacao };
}

test('duas abas disputam uma pendência e contas/empresas diferentes ficam isoladas', async () => {
  const a = await import(journalUrl + '?aba=a');
  const b = await import(journalUrl + '?aba=b');
  const armazenamento = armazenamentoEmMemoria();
  const primeira = a.criarRegistroDeFechamentos(armazenamento.transacao);
  const segunda = b.criarRegistroDeFechamentos(armazenamento.transacao);
  const outroPedido = { ...comanda, idempotencyKey: 'tentativa-02' };
  const [salvou, encontrou] = await Promise.all([primeira.iniciar(sessao, comanda), segunda.iniciar(sessao, outroPedido)]);
  assert.equal(salvou.iniciou, true);
  assert.equal(encontrou.iniciou, false);
  assert.deepEqual(encontrou.payload, salvou.payload);
  const gravado = armazenamento.valores.get('checkout:prof-a:salao-a');
  assert.doesNotMatch(gravado, /excluir|access_token|clienteNome|telefone|planoTexto/);
  assert.equal(await segunda.ler({ ...sessao, user_id: 'prof-b' }), null);
  assert.equal(await segunda.ler({ ...sessao, empresa_id: 'salao-b' }), null);
  await primeira.confirmar(sessao, outroPedido);
  assert.equal(await segunda.ler(sessao).then(x => x.idempotencyKey), 'tentativa-01');
  await primeira.confirmar(sessao, salvou.payload);
  assert.equal(await segunda.ler(sessao), null);
});

test('recusas simultâneas liberam só após todas as tentativas, e cada tentativa conta uma vez', async () => {
  const { criarRegistroDeFechamentos } = await import(journalUrl);
  const { transacao } = armazenamentoEmMemoria();
  const abaA = criarRegistroDeFechamentos(transacao);
  const abaB = criarRegistroDeFechamentos(transacao);
  const a = await abaA.iniciar(sessao, comanda);
  const b = await abaB.iniciar(sessao, a.payload, true);
  assert.equal(b.iniciou, true);
  assert.equal(await b.recusar(), false);
  assert.equal(await b.recusar(), false, 'repetir a classificação não consome o envio da outra aba');
  assert.equal((await abaA.ler(sessao)).idempotencyKey, comanda.idempotencyKey);
  assert.equal(await a.recusar(), true);
  assert.equal(await abaB.ler(sessao), null);

  const antiga = await abaA.iniciar(sessao, comanda);
  await abaB.confirmar(sessao, antiga.payload);
  await abaB.iniciar(sessao, comanda);
  assert.equal(await antiga.recusar(), false, 'resposta de um registro anterior não altera o sucessor');
  assert.equal((await abaB.ler(sessao)).idempotencyKey, comanda.idempotencyKey);
});

function criaTela() {
  const elementos = new Map();
  function elemento() {
    const classes = new Set(['hidden']);
    const listeners = new Map();
    return {
      classList: {
        add: c => classes.add(c),
        remove: c => classes.delete(c),
        contains: c => classes.has(c),
        toggle: (c, sim) => (sim ? classes.add(c) : classes.delete(c))
      },
      before: node => elementos.set(node.id, node),
      setAttribute() {},
      querySelectorAll: () => [],
      addEventListener: (nome, callback) => listeners.set(nome, callback),
      click: event => listeners.get('click')?.(event),
      input: () => listeners.get('input')?.(),
      dataset: {}
    };
  }
  const document = {
    getElementById(id) {
      if (!elementos.has(id)) elementos.set(id, elemento());
      return elementos.get(id);
    },
    createElement: elemento,
    querySelector: () => null
  };
  return document;
}

let montagem = 0;
const previewDe = (payload, revisaoFinanceira = 'revisao-1') => ({
  revisaoFinanceira,
  totals: { totalRecebidoCentavos: payload.payments.reduce((soma, p) => soma + p.valorCentavos, 0) }
});

async function montarCheckout(contexto, storage, enviar, opcoes = {}) {
  const { criarRegistroDeFechamentos, dadosDoFechamento } = await import(journalUrl);
  const document = criaTela();
  const campo = (value = null) => ({
    getValue: () => value,
    setValue: novo => { value = novo; }
  });
  const state = {
    session: contexto,
    currentPayload: null,
    comandaItens: opcoes.vazia ? [] : [{ tipo: 'servico', servicoId: 'serv-1', profissionalId: 'prof-1' }],
    catalog: {
      clientes: [{ id: 'cliente-1', nome: 'Joana' }, { id: 'cliente-2', nome: 'Maria' }],
      profissionais: [{ id: 'prof-1', nome: 'Ana' }, { id: 'prof-2', nome: 'Bruno' }],
      servicos: [{ id: 'serv-1', nome: 'Corte', valor_centavos: 1000 }],
      produtos: [{ id: 'prod-1', nome: 'Pomada', preco_venda_centavos: 500 }],
      formas_pagamento: [{ code: 'pix', label: 'Pix' }, { code: 'dinheiro', label: 'Dinheiro' }]
    },
    tip: 0,
    splitEnabled: false,
    splits: [{ id: 's1', method: '', amount: '' }],
    fuzzyServico: campo(),
    fuzzyProduto: campo(),
    fuzzyProfissional: campo(),
    fuzzyCliente: campo(),
    fuzzyForma: campo(opcoes.vazia ? null : 'pix')
  };
  let ativa = { instance: 'sessao-' + contexto.user_id, empresa_id: contexto.empresa_id };
  const chamadas = [];
  const avisos = [];
  let chaves = 0;
  const fixture = {
    document, state, chamadas, avisos,
    stateBus: new EventTarget(),
    sessionIdentity: s => s?.instance,
    getSession: () => ativa,
    onAuthContextChanged: fn => { fixture.limpar = fn; },
    podeFecharAtendimento: () => true,
    sessionPode: codigo => codigo === 'assinatura:ver' && Boolean(opcoes.cobertura),
    genIdempotencyKey: () => 'nova-chave-' + (++chaves),
    findAgendaItemById: () => null,
    formatDDMM: value => value,
    window: { confirm: opcoes.confirmar || (() => true) },
    centsToBRL: value => String(value),
    escapeHtml: String,
    clearBanner() {},
    showBanner: (...args) => avisos.push(args),
    criarRegistroDeFechamentos: () => criarRegistroDeFechamentos(storage),
    dadosDoFechamento,
    api: async (rota, opcoes) => {
      chamadas.push({ rota, opcoes });
      if (rota === '/checkout/close') return enviar(opcoes.body);
      if (rota.endsWith('/reconciliar-agenda')) return fixture.reparar(rota, opcoes);
      if (rota === '/checkout/preview') return (fixture.preview || previewDe)(opcoes.body);
      if (rota.startsWith('/assinaturas/cobertura?')) return fixture.cobertura(rota);
      return { servicos: [], produtos: [] };
    }
  };
  fixture.preview = opcoes.preview;
  fixture.cobertura = opcoes.cobertura;
  globalThis.__checkoutRecoveryFixture = fixture;
  try {
    // Troca apenas dependências de ambiente e transporte. A UI e o journal são módulos reais.
    const source = checkoutSource.replace(/^import[\s\S]*?;\n/gm, '');
    const deps = Object.keys(fixture).join(', ');
    const script = `const {${deps}} = globalThis.__checkoutRecoveryFixture;\n${source}\n// montagem ${++montagem}`;
    fixture.mod = await import('data:text/javascript;base64,' + Buffer.from(script).toString('base64'));
    fixture.mod.initCheckout();
  } finally {
    delete globalThis.__checkoutRecoveryFixture;
  }
  fixture.sair = () => {
    state.session = null;
    ativa = null;
    fixture.limpar();
  };
  return fixture;
}

test('logout após aceite, reabertura e retomada explícita reenviam o mesmo corpo sem segunda comanda', async () => {
  const armazenamento = armazenamentoEmMemoria();
  const liquidacoes = new Map();
  let foiAceito;
  let perdeuResposta;
  const aceito = new Promise(resolve => { foiAceito = resolve; });
  const primeira = await montarCheckout(sessao, armazenamento.transacao, payload => {
    assert.ok(armazenamento.valores.size, 'a tentativa precisa estar gravada antes da chamada');
    liquidacoes.set(payload.idempotencyKey, payload);
    foiAceito(payload);
    return new Promise((_, reject) => { perdeuResposta = reject; });
  });
  await primeira.mod.simular();
  const primeiraResposta = primeira.mod.fechar();
  const original = await Promise.race([aceito, primeiraResposta.then(() => assert.fail('nenhum fechamento foi aceito com a pendência gravada'))]);
  primeira.sair();
  perdeuResposta(new Error('A sessão mudou antes de receber a resposta.'));
  await primeiraResposta;

  for (const outro of [{ ...sessao, user_id: 'prof-b' }, { ...sessao, empresa_id: 'salao-b' }]) {
    const outroContexto = await montarCheckout(outro, armazenamento.transacao, () => assert.fail('envio automático'));
    await outroContexto.mod.simular();
    assert.equal(outroContexto.document.getElementById('checkoutPendente').classList.contains('hidden'), true);
    assert.equal(outroContexto.chamadas.filter(c => c.rota === '/checkout/preview').length, 1);
  }

  const reaberta = await montarCheckout(sessao, armazenamento.transacao, payload => {
    assert.deepEqual(payload, original, 'nenhuma edição ou nova chave pode chegar ao servidor');
    assert.ok(liquidacoes.has(payload.idempotencyKey));
    return { saved: { comandoId: 'fechada-01', idempotent: true } };
  }, { vazia: true });
  await reaberta.mod.simular();
  assert.equal(reaberta.document.getElementById('checkoutPendente').classList.contains('hidden'), false);
  assert.equal(reaberta.chamadas.length, 0, 'simular só consulta o journal nesta etapa');
  reaberta.state.currentPayload = { ...comanda, idempotencyKey: 'duplicada' };
  await reaberta.mod.fechar();
  assert.equal(reaberta.chamadas.length, 0, 'fechar com uma comanda nova não sobrepõe a pendente');
  await reaberta.document.getElementById('btnRetomarFechamento').click();
  assert.equal(reaberta.chamadas.filter(c => c.rota === '/checkout/close').length, 1);
  assert.equal(reaberta.document.getElementById('resComandaId').textContent, 'fechada-01');
  assert.equal(liquidacoes.size, 1);
  assert.equal(armazenamento.valores.size, 0, 'a confirmação remove a pendência desta tentativa');
});

test('armazenamento sem gravação impede o POST de fechamento', async () => {
  const storage = armazenamentoEmMemoria();
  const fixture = await montarCheckout(sessao, (chave, gravar, decidir) => {
    if (gravar) throw new Error('QuotaExceeded');
    return storage.transacao(chave, gravar, decidir);
  }, () => assert.fail('POST sem journal durável'));
  await fixture.mod.simular();
  await fixture.mod.fechar();
  assert.equal(fixture.chamadas.filter(c => c.rota === '/checkout/close').length, 0);
  assert.match(fixture.avisos.at(-1)[0], /armazenamento/);
});

const estoqueInsuficiente = () => Object.assign(new Error('Estoque insuficiente.'), {
  status: 422, details: { checkoutNotCommitted: true }
});

test('recusa comprovada do primeiro envio libera o operador para corrigir e simular', async () => {
  const storage = armazenamentoEmMemoria();
  const fixture = await montarCheckout(sessao, storage.transacao, () => { throw estoqueInsuficiente(); });
  await fixture.mod.simular();
  await fixture.mod.fechar();
  assert.equal(storage.valores.size, 0);
  assert.equal(fixture.chamadas.find(c => c.rota === '/checkout/close').opcoes.retryOnAuth, false);
  assert.match(fixture.avisos.at(-1)[0], /Corrija a comanda/);
  assert.equal(fixture.document.getElementById('checkoutPendente').classList.contains('hidden'), true);
  await fixture.mod.simular();
  assert.equal(fixture.state.currentPayload.idempotencyKey, 'nova-chave-2');
});

test('recusa comprovada da retomada preserva o primeiro envio incerto', async () => {
  const storage = armazenamentoEmMemoria();
  const primeira = await montarCheckout(sessao, storage.transacao, () => { throw new Error('Sem resposta do servidor.'); });
  await primeira.mod.simular();
  const chave = primeira.state.currentPayload.idempotencyKey;
  await primeira.mod.fechar();
  primeira.sair();

  let tentativas = 0;
  const reaberta = await montarCheckout(sessao, storage.transacao, payload => {
    assert.equal(payload.idempotencyKey, chave);
    if (++tentativas === 1) throw estoqueInsuficiente();
    return { saved: { comandoId: 'fechada-01', idempotent: true } };
  });
  await reaberta.mod.simular();
  await reaberta.document.getElementById('btnRetomarFechamento').click();
  assert.equal(storage.valores.size, 1);
  assert.equal(reaberta.document.getElementById('checkoutPendente').classList.contains('hidden'), false);
  await reaberta.document.getElementById('btnRetomarFechamento').click();
  assert.equal(storage.valores.size, 0);
});

test('comprovante permite reparar a agenda pela mesma intenção e mantém o caixa confirmado durante falhas', async () => {
  const storage = armazenamentoEmMemoria();
  const salvo = { saved: { comandoId: 'comanda-registrada', status: 'fechado' } };
  const pendente = { ...salvo, vinculoAgenda: { aplicado: false, motivo: 'FALHA_ATUALIZACAO' } };
  const fixture = await montarCheckout(sessao, storage.transacao, () => pendente);
  fixture.state.agendamentoIdParaCheckout = 'agenda-1';
  await fixture.mod.simular();
  await fixture.mod.fechar();
  const post = fixture.chamadas.find(c => c.rota === '/checkout/close');
  const btn = fixture.document.getElementById('btnRepararVinculo');
  const status = fixture.document.getElementById('resVinculoAgenda');
  assert.equal(fixture.document.getElementById('resComandaId').textContent, 'comanda-registrada');
  assert.equal(btn.classList.contains('hidden'), false);
  assert.equal(fixture.document.getElementById('cardResultado').classList.contains('hidden'), false);
  assert.match(fixture.avisos.at(-1)[0], /conclusão do agendamento ficou pendente/);
  assert.equal(storage.valores.size, 0);
  assert.match(status.textContent, /pendente/);
  let vezes = 0;
  const resposta = adiar();
  fixture.reparar = (rota, opcoes) => {
    assert.equal(rota, '/checkout/comandas/comanda-registrada/reconciliar-agenda');
    assert.deepEqual(opcoes.body, post.opcoes.body);
    assert.equal(opcoes.retryOnAuth, false);
    vezes++;
    if (vezes === 1) throw Error('sem rede');
    if (vezes === 2) return pendente;
    return resposta.promise;
  };
  await btn.click();
  assert.match(status.textContent, /Não foi possível confirmar/);
  assert.equal(btn.disabled, false);
  await btn.click();
  assert.match(status.textContent, /continua pendente/);
  const tentativa = btn.click();
  await btn.click();
  assert.equal(vezes, 3);
  resposta.resolve({ ...salvo, vinculoAgenda: { aplicado: true } });
  await tentativa;
  assert.match(status.textContent, /Agendamento concluído/);
  assert.equal(btn.classList.contains('hidden'), true);
  await btn.click();
  await fixture.mod.fechar();
  await fixture.document.getElementById('btnRetomarFechamento').click();
  assert.equal(storage.valores.size, 0);
  assert.equal(fixture.chamadas.filter(c => c.rota === '/checkout/close').length, 1);
  assert.equal(vezes, 3);
});

test('resposta tardia do reparo não altera o rascunho seguinte nem bloqueia nova simulação', async () => {
  const storage = armazenamentoEmMemoria();
  const salvo = { saved: { comandoId: 'comanda-anterior' }, vinculoAgenda: { aplicado: false } };
  const fixture = await montarCheckout(sessao, storage.transacao, () => salvo);
  fixture.state.agendamentoIdParaCheckout = 'agenda-1';
  await fixture.mod.simular();
  await fixture.mod.fechar();
  const resposta = adiar();
  fixture.reparar = () => resposta.promise;
  const btn = fixture.document.getElementById('btnRepararVinculo');
  const reparo = btn.click();
  await fixture.mod.prefillCheckoutFromAgendamento(agendaB);
  fixture.state.fuzzyForma.setValue('pix');
  await fixture.mod.simular();
  resposta.resolve({ ...salvo, vinculoAgenda: { aplicado: true } });
  await reparo;
  assert.equal(fixture.state.currentPayload.agendamentoId, agendaB.id);
  assert.equal(fixture.document.getElementById('btnFechar').disabled, false);
  assert.equal(fixture.document.getElementById('cardResultado').classList.contains('hidden'), true);
  await btn.click();
  assert.equal(fixture.chamadas.filter(c => c.rota.endsWith('/reconciliar-agenda')).length, 1);
});

function adiar() {
  let resolve;
  const promise = new Promise(f => { resolve = f; });
  return { resolve, promise };
}

const agendaA = { id: 'agenda-1', cliente_id: 'cliente-1', servico_id: 'serv-1', profissional_id: 'prof-1', data: '2026-11-25', horario: '10:00' };
const agendaB = { ...agendaA, id: 'agenda-2', cliente_id: 'cliente-2', profissional_id: 'prof-2', horario: '11:00' };
const visivel = (fixture, id) => !fixture.document.getElementById(id).classList.contains('hidden');
const chamadasClose = fixture => fixture.chamadas.filter(c => c.rota === '/checkout/close');

test('resposta antiga do preview não revalida o resumo após alterar forma e gorjeta', async () => {
  const storage = armazenamentoEmMemoria();
  const chegou = adiar();
  const antiga = adiar();
  let pedidos = 0;
  const fixture = await montarCheckout(sessao, storage.transacao, () => assert.fail('o resumo antigo não pode fechar'), {
    preview(payload) {
      if (++pedidos === 1) {
        chegou.resolve(payload);
        return antiga.promise;
      }
      return previewDe(payload, 'revisao-2');
    }
  });
  const simularPrimeira = fixture.mod.simular();
  const corpoAntigo = await chegou.promise;
  fixture.state.fuzzyForma.setValue('dinheiro');
  fixture.document.getElementById('coForma').input();
  fixture.mod.incrementTip();
  await fixture.mod.simular();
  antiga.resolve(previewDe(corpoAntigo));
  await simularPrimeira;
  assert.equal(fixture.document.getElementById('pvRecebido').textContent, '1100');
  assert.deepEqual(fixture.state.currentPayload.payments, [{ formaCode: 'dinheiro', valorCentavos: 1100 }]);
  assert.equal(fixture.state.currentPayload.revisaoFinanceira, 'revisao-2');
  fixture.state.fuzzyProduto.setValue('prod-1');
  fixture.document.getElementById('coProduto').input();
  assert.equal(visivel(fixture, 'cardPreview'), false);
  await fixture.mod.fechar();
  assert.equal(chamadasClose(fixture).length, 0);
});

test('protege edição no retorno ao mesmo atendimento e isola dados quando confirma a troca', async () => {
  const storage = armazenamentoEmMemoria();
  let autorizaTroca = false;
  let confirmacoes = 0;
  const fixture = await montarCheckout(sessao, storage.transacao, () => assert.fail('nenhuma tentativa de fechamento'), {
    vazia: true,
    confirmar() { confirmacoes++; return autorizaTroca; }
  });
  await fixture.mod.prefillCheckoutFromAgendamento(agendaA);
  fixture.document.getElementById('btnAddItem').click();
  fixture.state.comandaItens[0].assinaturaId = 'plano-a';
  fixture.state.fuzzyForma.setValue('pix');
  fixture.mod.incrementTip();
  fixture.mod.toggleSplitPayment();
  fixture.state.splits[0].amount = '2';

  await fixture.mod.prefillCheckoutFromAgendamento(agendaA);
  assert.equal(confirmacoes, 0);
  assert.equal(fixture.state.comandaItens.length, 1);
  await fixture.mod.prefillCheckoutFromAgendamento(agendaB);
  assert.equal(confirmacoes, 1);
  assert.equal(fixture.state.agendamentoIdParaCheckout, 'agenda-1');
  assert.equal(fixture.state.comandaItens[0].assinaturaId, 'plano-a');
  assert.equal(fixture.state.tip, 100);

  autorizaTroca = true;
  await fixture.mod.prefillCheckoutFromAgendamento(agendaB);
  assert.equal(fixture.state.fuzzyCliente.getValue(), 'cliente-2');
  assert.equal(fixture.state.fuzzyProfissional.getValue(), 'prof-2');
  assert.equal(fixture.state.agendamentoIdParaCheckout, 'agenda-2');
  assert.deepEqual(fixture.state.comandaItens, []);
  assert.equal(fixture.state.tip, 0);
  assert.equal(fixture.state.splitEnabled, false);
  assert.deepEqual(fixture.state.splits, [{ id: 's1', method: '', amount: '' }]);
  assert.equal(fixture.state.fuzzyForma.getValue(), null);
});

test('consulta de plano que começou para A não altera B nem dispara preview tardio', async () => {
  const storage = armazenamentoEmMemoria();
  const chegou = adiar();
  const cobertura = adiar();
  const fixture = await montarCheckout(sessao, storage.transacao, () => assert.fail('nenhuma tentativa de fechamento'), {
    vazia: true,
    cobertura(rota) { chegou.resolve(rota); return cobertura.promise; }
  });
  await fixture.mod.prefillCheckoutFromAgendamento(agendaA);
  fixture.state.fuzzyForma.setValue('pix');
  const aguardandoA = fixture.mod.simular();
  const params = new URL(await chegou.promise, 'https://teste.local').searchParams;
  assert.equal(params.get('clienteId'), 'cliente-1');
  assert.equal(params.get('data'), agendaA.data, 'usa o dia do atendimento mesmo fora da semana da agenda');
  assert.equal(params.get('horario'), agendaA.horario);
  await fixture.mod.prefillCheckoutFromAgendamento(agendaB);
  cobertura.resolve({ melhor: {
    assinaturaId: 'plano-a', situacaoUso: 'coberto', planoNome: 'Plano A', cobrarCentavos: 0
  } });
  await aguardandoA;
  assert.equal(fixture.chamadas.filter(c => c.rota === '/checkout/preview').length, 0);
  assert.equal(fixture.state.fuzzyCliente.getValue(), 'cliente-2');
  assert.deepEqual(fixture.state.comandaItens, []);
  assert.equal(fixture.state.currentPayload, null);
  assert.equal(visivel(fixture, 'coPlanoAviso'), false);
});

test('subtotal e primeiro pedido de preview usam o preço específico do profissional', async () => {
  const storage = armazenamentoEmMemoria();
  const fixture = await montarCheckout(sessao, storage.transacao, () => assert.fail('só simula'), {
    preview(payload) {
      assert.equal(payload.payments[0].valorCentavos, 1800);
      assert.equal('precoCentavos' in payload.itens[0], false);
      return previewDe(payload);
    }
  });
  fixture.state.catalog.profissionais[0].overrides = '{"serv-1":{"valor_centavos":1800}}';
  fixture.mod.renderComandaItens();
  assert.equal(fixture.document.getElementById('coItensSubtotal').dataset.subtotal, '1800');
  await fixture.mod.simular();
  assert.equal(fixture.chamadas.filter(c => c.rota === '/checkout/preview').length, 1);
  assert.equal(visivel(fixture, 'cardPreview'), true);
  assert.equal(fixture.document.getElementById('pvFormas').textContent, 'Pix · 1800');
});

test('fechamento transmite a intenção revisada e a resposta anterior preserva outro atendimento', async () => {
  const storage = armazenamentoEmMemoria();
  const começou = adiar();
  const resposta = adiar();
  const fixture = await montarCheckout(sessao, storage.transacao, payload => {
    começou.resolve(payload);
    return resposta.promise;
  }, { vazia: true });
  await fixture.mod.prefillCheckoutFromAgendamento(agendaA);
  fixture.state.fuzzyForma.setValue('pix');
  await fixture.mod.simular();
  const revisada = fixture.state.currentPayload;
  const fechamento = fixture.mod.fechar();
  const enviada = await começou.promise;

  await fixture.mod.prefillCheckoutFromAgendamento(agendaB);
  fixture.document.getElementById('btnAddItem').click();
  fixture.state.fuzzyForma.setValue('dinheiro');
  fixture.mod.incrementTip();
  resposta.resolve({ saved: { comandoId: 'comanda-a' } });
  await fechamento;
  assert.equal(fixture.state.agendamentoIdParaCheckout, 'agenda-2');
  assert.equal(fixture.state.fuzzyCliente.getValue(), 'cliente-2');
  assert.equal(fixture.state.comandaItens[0].profissionalId, 'prof-2');
  assert.equal(fixture.state.tip, 100);
  assert.equal(fixture.state.fuzzyForma.getValue(), 'dinheiro');
  assert.equal(visivel(fixture, 'cardResultado'), false);
  assert.deepEqual(enviada, revisada);
  assert.equal(enviada.revisaoFinanceira, 'revisao-1');
  assert.equal(enviada.agendamentoId, 'agenda-1');
  assert.equal(chamadasClose(fixture).length, 1);
  assert.equal(storage.valores.size, 0);
});

test('recusa de revisão financeira desabilita o fechamento até exibir um novo resumo', async () => {
  const storage = armazenamentoEmMemoria();
  const fixture = await montarCheckout(sessao, storage.transacao, () => {
    throw Object.assign(new Error('O cálculo da comanda mudou.'), {
      status: 409, code: 'CHECKOUT_REVISAO_ALTERADA', details: { checkoutNotCommitted: true }
    });
  });
  await fixture.mod.simular();
  await fixture.mod.fechar();
  assert.equal(storage.valores.size, 0);
  assert.equal(visivel(fixture, 'cardPreview'), false);
  assert.equal(fixture.document.getElementById('btnFechar').disabled, true);
  await fixture.mod.fechar();
  assert.equal(chamadasClose(fixture).length, 1);
  await fixture.mod.simular();
  assert.equal(fixture.document.getElementById('btnFechar').disabled, false);
});

test('ao reconciliar o total do servidor, conserva cada valor fixo do pagamento dividido', async () => {
  const storage = armazenamentoEmMemoria();
  const valores = [];
  const fixture = await montarCheckout(sessao, storage.transacao, () => assert.fail('só simula'), {
    preview(payload) {
      // Captura os valores transmitidos, mesmo quando o cliente prepara nova tentativa.
      valores.push(payload.payments.map(p => p.valorCentavos));
      if (valores.length === 1) {
        throw Object.assign(new Error('Pagamento inconsistente'), {
          code: 'PAYMENT_TOTAL_MISMATCH', details: { expectedTotal: 1200 }
        });
      }
      return previewDe(payload);
    }
  });
  fixture.mod.toggleSplitPayment();
  fixture.state.splits[0].amount = '3';
  fixture.state.splits[1].method = 'dinheiro';
  await fixture.mod.simular();
  assert.deepEqual(valores, [[300, 700], [300, 900]]);
  assert.equal(fixture.document.getElementById('pvFormas').textContent, 'Pix · 300 | Dinheiro · 900');
  fixture.state.splits[0].amount = '4';
  fixture.mod.onCheckoutFieldChanged('forma');
  await fixture.mod.simular();
  assert.deepEqual(valores.at(-1), [400, 800], 'a base confirmada se mantém quando só muda o pagamento');
});

test('falha na cobertura bloqueia a cobrança, com nova consulta e opção explícita de não usar plano conhecido', async () => {
  const storage = armazenamentoEmMemoria();
  let falha = true;
  let consultas = 0;
  const fixture = await montarCheckout(sessao, storage.transacao, () => assert.fail('ninguém confirmou o fechamento'), {
    vazia: true,
    cobertura() {
      consultas++;
      if (falha) throw new Error('Conexão indisponível');
      return { melhor: { assinaturaId: 'plano-a', situacaoUso: 'coberto', planoNome: 'Plano A', cobrarCentavos: 0 } };
    }
  });
  await fixture.mod.prefillCheckoutFromAgendamento(agendaA);
  fixture.state.fuzzyForma.setValue('pix');
  await fixture.mod.simular();
  assert.equal(fixture.chamadas.filter(c => c.rota === '/checkout/preview').length, 0);
  assert.equal(fixture.state.comandaItens.length, 1);
  assert.equal(visivel(fixture, 'coPlanoAviso'), true);
  assert.match(fixture.document.getElementById('coPlanoAviso').textContent, /consultar a cobertura/);
  await fixture.mod.fechar();
  assert.equal(chamadasClose(fixture).length, 0);
  assert.equal(storage.valores.size, 0);

  falha = false;
  fixture.mod.toggleSplitPayment();
  await fixture.mod.simular();
  assert.equal(fixture.state.currentPayload.itens[0].assinaturaId, 'plano-a');
  assert.deepEqual(fixture.state.currentPayload.payments, []);
  assert.equal(visivel(fixture, 'cardPreview'), true);
  assert.equal(fixture.document.getElementById('btnFechar').disabled, false);
  assert.match(fixture.document.getElementById('splitDica').textContent, /coberta pelo plano/);

  falha = true;
  fixture.mod.toggleSplitPayment();
  fixture.document.getElementById('coItensLista').click({
    target: { closest: seletor => seletor === '[data-sem-plano]' ? { dataset: { semPlano: '0' } } : null }
  });
  await fixture.mod.simular();
  assert.equal(consultas, 2, 'a opção explícita de não usar o plano dispensa a consulta');
  assert.equal(fixture.state.currentPayload.itens[0].assinaturaId, undefined);
  assert.deepEqual(fixture.state.currentPayload.payments, [{ formaCode: 'pix', valorCentavos: 1000 }]);
});

test('prévia sem revisão financeira preserva o carrinho e exige uma simulação válida para fechar', async () => {
  const storage = armazenamentoEmMemoria();
  const fixture = await montarCheckout(sessao, storage.transacao, () => ({ saved: { comandoId: 'fechada-01' } }));
  for (const revisao of [undefined, '', '  ', {}]) {
    fixture.preview = payload => ({ ...previewDe(payload), revisaoFinanceira: revisao });
    await fixture.mod.simular();
    assert.equal(fixture.document.getElementById('btnFechar').disabled, true);
    assert.equal(fixture.state.currentPayload, null);
    assert.equal(fixture.state.comandaItens.length, 1);
    assert.match(fixture.avisos.at(-1)[0], /revisão financeira/i);
    await fixture.mod.fechar();
  }
  assert.equal(fixture.chamadas.filter(c => c.rota === '/checkout/close').length, 0);
  fixture.preview = previewDe;
  await fixture.mod.simular();
  await fixture.mod.fechar();
  const feitos = fixture.chamadas.filter(c => c.rota === '/checkout/close');
  assert.equal(feitos.length, 1);
  assert.equal(feitos[0].opcoes.body.revisaoFinanceira, 'revisao-1');
});

test('pendência de versão anterior sem revisão ainda pode ser retomada pela chave original', async () => {
  const storage = armazenamentoEmMemoria();
  const { criarRegistroDeFechamentos } = await import(journalUrl);
  const registro = criarRegistroDeFechamentos(storage.transacao);
  const anterior = await registro.iniciar(sessao, comanda);
  const fixture = await montarCheckout(sessao, storage.transacao, payload => {
    assert.deepEqual(payload, anterior.payload);
    return { saved: { comandoId: 'fechada-01', idempotent: true } };
  });
  await fixture.mod.simular();
  await fixture.document.getElementById('btnRetomarFechamento').click();
  assert.equal(await registro.ler(sessao), null);
  assert.deepEqual(fixture.chamadas.map(c => c.rota), ['/checkout/close']);
});

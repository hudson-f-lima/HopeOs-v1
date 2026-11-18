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
      click: () => listeners.get('click')?.(),
      dataset: {}
    };
  }
  const document = {
    getElementById(id) {
      if (!elementos.has(id)) elementos.set(id, elemento());
      return elementos.get(id);
    },
    createElement: elemento
  };
  return document;
}

let montagem = 0;
async function montarCheckout(contexto, storage, enviar) {
  const { criarRegistroDeFechamentos, dadosDoFechamento } = await import(journalUrl);
  const document = criaTela();
  const state = {
    session: contexto,
    currentPayload: null,
    comandaItens: [{ tipo: 'servico', servicoId: 'serv-1', profissionalId: 'prof-1' }],
    catalog: { profissionais: [], servicos: [{ id: 'serv-1', nome: 'Corte', valor_centavos: 1000 }], produtos: [] },
    fuzzyServico: { getValue: () => null, setValue() {} },
    fuzzyProduto: { getValue: () => null, setValue() {} },
    fuzzyProfissional: { getValue: () => null, setValue() {} },
    fuzzyCliente: { getValue: () => null },
    fuzzyForma: { getValue: () => 'pix' }
  };
  let ativa = { instance: 'sessao-' + contexto.user_id, empresa_id: contexto.empresa_id };
  const chamadas = [];
  const avisos = [];
  const fixture = {
    document, state, chamadas, avisos,
    stateBus: new EventTarget(),
    sessionIdentity: s => s?.instance,
    getSession: () => ativa,
    onAuthContextChanged: fn => { fixture.limpar = fn; },
    sessionPode: () => false,
    genIdempotencyKey: () => 'nova-chave',
    centsToBRL: value => String(value),
    escapeHtml: String,
    clearBanner() {},
    showBanner: (...args) => avisos.push(args),
    criarRegistroDeFechamentos: () => criarRegistroDeFechamentos(storage),
    dadosDoFechamento,
    api: async (rota, opcoes) => {
      chamadas.push({ rota, opcoes });
      if (rota === '/checkout/close') return enviar(opcoes.body);
      if (rota === '/checkout/preview') return { totals: {} };
      return { servicos: [], produtos: [] };
    }
  };
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
  primeira.state.currentPayload = comanda;
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
  });
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
  const fixture = await montarCheckout(sessao, async () => { throw new Error('QuotaExceeded'); }, () => assert.fail('POST sem journal durável'));
  fixture.state.currentPayload = comanda;
  await fixture.mod.fechar();
  assert.equal(fixture.chamadas.length, 0);
  assert.match(fixture.avisos.at(-1)[0], /armazenamento/);
});

const estoqueInsuficiente = () => Object.assign(new Error('Estoque insuficiente.'), {
  status: 422, details: { checkoutNotCommitted: true }
});

test('recusa comprovada do primeiro envio libera o operador para corrigir e simular', async () => {
  const storage = armazenamentoEmMemoria();
  const fixture = await montarCheckout(sessao, storage.transacao, () => { throw estoqueInsuficiente(); });
  fixture.state.currentPayload = comanda;
  await fixture.mod.fechar();
  assert.equal(storage.valores.size, 0);
  assert.equal(fixture.chamadas[0].opcoes.retryOnAuth, false);
  assert.match(fixture.avisos.at(-1)[0], /Corrija a comanda/);
  assert.equal(fixture.document.getElementById('checkoutPendente').classList.contains('hidden'), true);
  await fixture.mod.simular();
  assert.equal(fixture.state.currentPayload.idempotencyKey, 'nova-chave');
});

test('recusa comprovada da retomada preserva o primeiro envio incerto', async () => {
  const storage = armazenamentoEmMemoria();
  const primeira = await montarCheckout(sessao, storage.transacao, () => { throw new Error('Sem resposta do servidor.'); });
  primeira.state.currentPayload = comanda;
  await primeira.mod.fechar();
  primeira.sair();

  let tentativas = 0;
  const reaberta = await montarCheckout(sessao, storage.transacao, payload => {
    assert.equal(payload.idempotencyKey, comanda.idempotencyKey);
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

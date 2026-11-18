const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');

const raiz = resolve(__dirname, '../..');
const source = readFileSync(resolve(raiz, 'js/ui/comandas.js'), 'utf8').replace(/^import .*;\n/gm, '');
const DATA = '2026-11-18';
const agenda = (status, horario, profissional_id = 'prof-a') => ({
  id: status, status, horario, profissional_id, data: DATA, cliente_id: 'cli-a', servico_id: 'serv-a'
});
const fechada = {
  id: 'comanda-a', clienteNome: '<Nome>', data: DATA, hora: '11:00:00', status: 'estornado_parcial',
  totalRecebidoCentavos: 5500, itens: [{ descricao: 'Corte & barba', quantidade: 1, valorLiquidoCentavos: 5500 }],
  estornos: [{ tipo: 'parcial', data: DATA, reembolsoCentavos: 1000 }]
};

function elemento(aoFocar) {
  const classes = new Set(['hidden']);
  const atributos = new Map();
  const listeners = new Map();
  return {
    value: '',
    innerHTML: '',
    classList: {
      contains: c => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c))
    },
    setAttribute: (chave, valor) => atributos.set(chave, valor),
    addEventListener: (tipo, fn) => listeners.set(tipo, fn),
    focus(opcoes) { aoFocar(this); this.opcoesDeFoco = opcoes; },
    replaceChildren() { this.innerHTML = ''; },
    change: () => listeners.get('change')(),
    click: alvo => listeners.get('click')({ target: { closest: () => alvo } })
  };
}

let montagem = 0;
async function montar(permissoes, responder) {
  const utils = await import(pathToFileURL(resolve(raiz, 'js/utils.js')));
  const { alcanceDaPermissao, podeFecharAtendimento } = await import(pathToFileURL(resolve(raiz, 'js/state.js')));
  const els = new Map();
  const document = {
    getElementById(id) {
      if (!els.has(id)) els.set(id, elemento(no => { document.activeElement = no; }));
      return els.get(id);
    }
  };
  const lista = document.getElementById('comandasRegistros');
  lista.querySelectorAll = seletor => {
    const atributo = seletor.slice('button['.length, -1);
    return [...lista.innerHTML.matchAll(new RegExp(`${atributo}="([^"]+)"`, 'g'))].map(([, id]) => {
      const linha = document.getElementById(`linha-${id}`);
      linha.getAttribute = () => id;
      return linha;
    });
  };
  const window = {
    scrollX: 0,
    scrollY: 0,
    scrollTo(x, y) { this.scrollX = x; this.scrollY = y; }
  };
  const chamadas = [];
  const fixture = {
    document, window, alcanceDaPermissao, podeFecharAtendimento,
    state: { session: { principal: 'user', role: 'profissional', profissional_id: 'prof-a', permissoes }, activeTab: 'checkout' },
    stateBus: new EventTarget(),
    findClienteNome: () => '<Nome>',
    findProfissionalNome: () => 'Profissional',
    findServicoNome: () => 'Corte',
    centsToBRL: utils.centsToBRL,
    escapeHtml: utils.escapeHtml,
    todayStr: () => DATA,
    temRascunhoCheckout: () => false,
    onAuthContextChanged: callback => { fixture.limpar = callback; },
    api: rota => {
      chamadas.push(rota);
      return responder(rota);
    }
  };
  globalThis.__comandasListFixture = fixture;
  let mod;
  try {
    const script = `const {${Object.keys(fixture).join(', ')} } = globalThis.__comandasListFixture;\n${source}\n// montagem ${++montagem}`;
    mod = await import('data:text/javascript;base64,' + Buffer.from(script).toString('base64'));
    mod.initComandas(() => { fixture.state.activeTab = 'checkout'; });
  } finally {
    delete globalThis.__comandasListFixture;
  }
  return { ...fixture, ...mod, chamadas, el: document.getElementById };
}

test('Agenda ordena horários aptos, abre detalhe e encaminha checkout próprio após a ação explícita', async () => {
  const meu = agenda('aguardando', '09:00:00');
  const colega = agenda('confirmado', '13:00:00', 'prof-b');
  const fixture = await montar(
    { 'agenda:ver': 'total', 'comanda:fechar': 'proprio' },
    () => [colega, agenda('concluido', '08:00:00'), meu, agenda('cancelado', '11:00:00')]
  );
  const { el, stateBus } = fixture;
  const prefill = [];
  stateBus.addEventListener('checkout:prefill', e => prefill.push(e.detail));
  await fixture.abrirComandas();
  assert.deepEqual(fixture.chamadas, [`/agenda?data=${DATA}`]);
  assert.equal(el('comandasModos').classList.contains('hidden'), true);
  const lista = el('comandasRegistros').innerHTML;
  assert.doesNotMatch(lista, /cancelado|concluido|<Nome>/);
  assert.match(lista, /aguardando[\s\S]*confirmado/);
  el('comandasRegistros').click({ getAttribute: () => colega.id });
  assert.doesNotMatch(el('comandasDetalheConteudo').innerHTML, /btnComandaDoAtendimento/);
  el('comandasDetalhe').click({});
  assert.deepEqual(prefill, []);
  el('comandasRegistros').click({ getAttribute: () => meu.id });
  assert.match(el('comandasDetalheConteudo').innerHTML, /&lt;Nome&gt;[\s\S]*btnComandaDoAtendimento/);
  assert.deepEqual(prefill, []);
  el('comandasDetalhe').click({});
  assert.deepEqual(prefill, [meu]);
  stateBus.dispatchEvent(new Event('checkout:draft-open'));
  assert.equal(el('comandasHome').classList.contains('hidden'), true);
  assert.equal(el('comandasCheckout').classList.contains('hidden'), false);
});

test('Histórico autorizado lista só registros da rota financeira e detalhe preserva venda e estorno', async () => {
  const fixture = await montar({ 'comanda:historico': 'total' }, () => ({ comandas: [fechada] }));
  const { el } = fixture;
  await fixture.abrirComandas();
  assert.deepEqual(fixture.chamadas, [`/comandas?data=${DATA}`]);
  assert.equal(el('btnNovaComanda').classList.contains('hidden'), true);
  assert.match(el('comandasRegistros').innerHTML, /data-comandas-historico="comanda-a"/);
  el('comandasRegistros').click({ getAttribute: () => fechada.id });
  const detalhe = el('comandasDetalheConteudo').innerHTML;
  assert.match(detalhe, /&lt;Nome&gt;[\s\S]*Estorno parcial[\s\S]*R\$ 55,00[\s\S]*Corte &amp; barba[\s\S]*R\$ 10,00/);
  assert.doesNotMatch(detalhe, /btnComandaDoAtendimento/);
});

test('Respostas atrasadas não substituem outra lista nem exibem dados após mudança de contexto', async () => {
  let concluir;
  const aguardar = new Promise(resolve => { concluir = resolve; });
  const fixture = await montar(
    { 'agenda:ver': 'total', 'comanda:historico': 'total' },
    rota => rota.startsWith('/agenda') ? aguardar : { comandas: [fechada] }
  );
  const { el } = fixture;
  const primeiro = fixture.abrirComandas();
  await el('btnComandasHistorico').click();
  concluir([agenda('agendado', '11:00:00')]);
  await primeiro;
  assert.match(el('comandasRegistros').innerHTML, /data-comandas-historico="comanda-a"/);
  assert.doesNotMatch(el('comandasRegistros').innerHTML, /data-comandas-agenda/);
  el('comandasRegistros').click({ getAttribute: () => fechada.id });
  fixture.limpar();
  assert.equal(el('comandasRegistros').innerHTML, '');
  assert.equal(el('comandasDetalheConteudo').innerHTML, '');
});

test('Voltar de um detalhe mantém data, lista, foco e posição sem consultar o servidor novamente', async () => {
  const fixture = await montar(
    { 'agenda:ver': 'total', 'comanda:historico': 'total' },
    rota => rota.startsWith('/agenda') ? [] : { comandas: [fechada] }
  );
  const { el, document, window } = fixture;
  await fixture.abrirComandas();
  await el('btnComandasHistorico').click();
  const outraData = '2026-11-17';
  el('comandasData').value = outraData;
  await el('comandasData').change();
  window.scrollTo(0, 744);
  el('comandasRegistros').click({ getAttribute: () => fechada.id });
  window.scrollTo(0, 0);
  await el('btnVoltarComandas').click();
  assert.deepEqual(fixture.chamadas, [`/agenda?data=${DATA}`, `/comandas?data=${DATA}`, `/comandas?data=${outraData}`]);
  assert.equal(el('comandasData').value, outraData);
  assert.equal(document.activeElement, el(`linha-${fechada.id}`));
  assert.deepEqual(document.activeElement.opcoesDeFoco, { preventScroll: true });
  assert.equal(window.scrollY, 744);
});

test('Voltar atualiza apenas se agenda, caixa ou estorno invalidaram a lista enquanto o detalhe estava aberto', async () => {
  const meu = agenda('aguardando', '09:00:00');
  let itens = [meu];
  const fixture = await montar(
    { 'agenda:ver': 'total', 'comanda:fechar': 'proprio', 'comanda:historico': 'total' },
    rota => rota.startsWith('/agenda') ? itens : { comandas: [fechada] }
  );
  const { el, stateBus, document } = fixture;
  await fixture.abrirComandas();
  el('comandasRegistros').click({ getAttribute: () => meu.id });
  stateBus.dispatchEvent(new Event('agenda:updated'));
  assert.equal(fixture.chamadas.length, 1);
  await el('btnVoltarComandas').click();
  assert.equal(fixture.chamadas.length, 2);
  assert.equal(document.activeElement, el(`linha-${meu.id}`));
  el('comandasRegistros').click({ getAttribute: () => meu.id });
  stateBus.dispatchEvent(new Event('checkout:draft-open'));
  itens = [];
  stateBus.dispatchEvent(new CustomEvent('checkout:closed', { detail: { comandoId: fechada.id } }));
  assert.equal(fixture.chamadas.length, 2);
  await el('btnVoltarCheckoutComandas').click();
  assert.equal(fixture.chamadas.length, 3);
  assert.equal(document.activeElement, el('comandasTitulo'));
  await el('btnComandasHistorico').click();
  el('comandasRegistros').click({ getAttribute: () => fechada.id });
  stateBus.dispatchEvent(new Event('estorno:feito'));
  assert.equal(fixture.chamadas.length, 4);
  await el('btnVoltarComandas').click();
  assert.deepEqual(fixture.chamadas.slice(-2), [`/comandas?data=${DATA}`, `/comandas?data=${DATA}`]);
  assert.equal(document.activeElement, el(`linha-${fechada.id}`));
});

test('voltar da venda avulsa conserva filtro e foco no botão de retomada, sem repetir a consulta', async () => {
  const fixture = await montar({ 'agenda:ver': 'total', 'comanda:fechar': 'total' }, () => []);
  const { el, stateBus, document, window } = fixture;
  stateBus.addEventListener('checkout:new', () => stateBus.dispatchEvent(new Event('checkout:draft-open')));
  await fixture.abrirComandas();
  el('comandasData').value = '2026-11-12';
  await el('comandasData').change();
  const antes = fixture.chamadas.length;
  window.scrollTo(0, 117);
  el('btnNovaComanda').click();
  window.scrollTo(0, 0);
  await el('btnVoltarCheckoutComandas').click();
  assert.equal(fixture.chamadas.length - antes, 0, 'consultas ao voltar ao filtro já carregado');
  assert.equal(document.activeElement, el('btnNovaComanda'));
  assert.equal(window.scrollY, 117);
  assert.equal(el('comandasData').value, '2026-11-12');
});

test('atalho direto consulta a fila apenas ao exibi-la e retorna ao registro na data do atendimento', async () => {
  const item = { ...agenda('confirmado', '14:00:00'), data: '2026-11-20' };
  const fixture = await montar({ 'agenda:ver': 'total', 'comanda:fechar': 'proprio' }, () => [item]);
  fixture.state.activeTab = 'agenda';
  fixture.stateBus.dispatchEvent(new CustomEvent('checkout:draft-open', { detail: item }));
  assert.equal(fixture.state.activeTab, 'checkout');
  assert.deepEqual(fixture.chamadas, []);
  await fixture.el('btnVoltarCheckoutComandas').click();
  assert.deepEqual(fixture.chamadas, ['/agenda?data=2026-11-20']);
  assert.equal(fixture.document.activeElement, fixture.el('linha-confirmado'));
});

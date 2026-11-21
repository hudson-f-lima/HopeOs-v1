// Módulo real, armazenamento e DOM simulados: marcadores distintos e resposta antiga.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

test('marcadores separados por usuário/empresa, sem chave global', async () => {
  const { chaveDoContexto } = await import(moduleUrl(fs.readFileSync(path.join(root, 'js/context-storage.js'), 'utf8')));
  const s = { principal: 'user', user_id: 'u1', empresa_id: 'a' };
  assert.notEqual(chaveDoContexto('visto', s), chaveDoContexto('visto', { ...s, empresa_id: 'b' }));
  assert.notEqual(chaveDoContexto('visto', s), chaveDoContexto('visto', { ...s, user_id: 'u2' }));
  assert.equal(chaveDoContexto('visto', null), null);
  assert.equal(chaveDoContexto('visto', { ...s, user_id: null }), null);
});

test('novidades não reutilizam marcador global nem resposta atrasada de outra empresa', async () => {
  const source = fs.readFileSync(path.join(root, 'js/ui/onlineNovos.js'), 'utf8');
  const helper = fs.readFileSync(path.join(root, 'js/context-storage.js'), 'utf8').replace('export function', 'function');
  const values = new Map([['hopeos.onlineVistoAte', '2099-01-01T00:00:00Z']]);
  const events = {};
  const elements = new Map();
  const node = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', classList: { toggle() {} }, addEventListener: (name, fn) => { events[id + ':' + name] = fn; }, close() {}, showModal() {} });
    return elements.get(id);
  };
  const previous = { document: global.document, localStorage: global.localStorage, setInterval: global.setInterval };
  global.document = { visibilityState: 'visible', getElementById: node, addEventListener: (name, fn) => { events[name] = fn; } };
  global.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  global.setInterval = () => 0;
  const fixture = { state: { session: { principal: 'user', user_id: 'u1', empresa_id: 'a' } }, calls: [], pending: [] };
  global.__onlineContextFixture = fixture;
  let rewritten = source.replace(/^import .*;\n/gm, '');
  rewritten = `const {state} = globalThis.__onlineContextFixture;\nconst sessionPode = () => true;\nconst api = url => new Promise(resolve => { globalThis.__onlineContextFixture.calls.push(url); globalThis.__onlineContextFixture.pending.push(resolve); });\nconst escapeHtml = String; const formatDDMM = String;\n${helper}\n${rewritten}`;
  try {
    const mod = await import(moduleUrl(rewritten));
    mod.initOnlineNovos();
    assert.equal(fixture.calls[0], '/agenda/online-novos', 'marcador global antigo deve ser ignorado');
    fixture.state.session = { ...fixture.state.session, empresa_id: 'b' };
    fixture.pending.shift()({ total: 5, agora: '2026-11-17T12:00:00Z', itens: [] });
    await Promise.resolve();
    assert.notEqual(node('btnOnlineNovos').textContent, '5 novos online', 'resposta antiga não pode alterar B');
    events.visibilitychange();
    fixture.pending.shift()({ total: 2, agora: '2026-11-17T13:00:00Z', itens: [] });
    await Promise.resolve();
    assert.equal(node('btnOnlineNovos').textContent, '2 novos online');
    events['btnOnlineVistos:click']();
    assert.equal(values.get('hopeos.onlineVistoAte:u1:b'), '2026-11-17T13:00:00Z');
    assert.equal(values.has('hopeos.onlineVistoAte:u1:a'), false);
  } finally {
    Object.assign(global, previous);
    delete global.__onlineContextFixture;
  }
});

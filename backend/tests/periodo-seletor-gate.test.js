// Seletor de período (D-088): funções puras de js/ui/periodo.js e o seletor reutilizável com um DOM mínimo.
// Hoje fixo = 2026-11-27 (sexta-feira).
//   P01 atalhos para trás (Comandas, Estornos) continuam como na D-082;
//   P02 atalhos para frente (escala, folga): amanhã, esta semana até sábado, próxima semana dom–sáb,
//       resto do mês, próximo mês;
//   P03 calendário: sem min/max, nada depois de hoje (como antes); com min/max, fora fica desligado;
//   P04 seletor: começa em "Hoje" sem consultar; o primeiro toque do Personalizado não consulta; o segundo
//       consulta o intervalo em ordem; acima de 92 dias corta em 92;
//   P05 seletor para frente: ontem fica desligado no calendário e "Próxima semana" consulta dom–sáb.
const assert = require('assert');
const { resolve } = require('path');
const { pathToFileURL } = require('url');
const raiz = resolve(__dirname, '../..');
const HOJE = '2026-11-27';

const tests = [];
const test = (n, f) => tests.push({ n, f });

function raizFalsa() {
  let ouvinte = null;
  const r = {
    innerHTML: '',
    addEventListener: (tipo, f) => { if (tipo === 'click') ouvinte = f; },
    contains: () => true,
    clicar(dataset, disabled = false) { ouvinte({ target: { closest: () => ({ dataset, disabled }) } }); }
  };
  return r;
}

(async () => {
  const P = await import(pathToFileURL(resolve(raiz, 'js/ui/periodo.js')));

  test('P01 atalhos para trás (Comandas e Estornos) como na D-082', () => {
    assert.deepStrictEqual(P.ATALHOS_POR_TIPO.passado, ['hoje', 'ontem', 'semana', 'mes', 'mesant', 'pers']);
    assert.deepStrictEqual(P.intervaloDoAtalho('ontem', HOJE), { inicio: '2026-11-26', fim: '2026-11-26' });
    assert.deepStrictEqual(P.intervaloDoAtalho('semana', HOJE), { inicio: '2026-11-22', fim: HOJE });
    assert.deepStrictEqual(P.intervaloDoAtalho('mesant', HOJE), { inicio: '2026-10-01', fim: '2026-10-31' });
  });

  test('P02 atalhos para frente', () => {
    assert.deepStrictEqual(P.ATALHOS_POR_TIPO.futuro, ['hoje', 'amanha', 'semanaToda', 'proxSemana', 'mesResto', 'proxMes', 'pers']);
    assert.deepStrictEqual(P.intervaloDoAtalho('amanha', HOJE), { inicio: '2026-11-28', fim: '2026-11-28' });
    assert.deepStrictEqual(P.intervaloDoAtalho('semanaToda', HOJE), { inicio: HOJE, fim: '2026-11-28' });
    assert.deepStrictEqual(P.intervaloDoAtalho('proxSemana', HOJE), { inicio: '2026-11-29', fim: '2026-12-05' });
    assert.deepStrictEqual(P.intervaloDoAtalho('mesResto', HOJE), { inicio: HOJE, fim: '2026-11-30' });
    assert.deepStrictEqual(P.intervaloDoAtalho('proxMes', HOJE), { inicio: '2026-12-01', fim: '2026-12-31' });
    assert.deepStrictEqual(P.intervaloDoAtalho('proxMes', '2026-12-15'), { inicio: '2027-01-01', fim: '2027-01-31' }, 'virada de ano');
  });

  test('P03 calendário: padrão desliga o futuro; min/max desligam fora do intervalo', () => {
    const padrao = P.htmlCalendario('2026-11', { inicio: HOJE, fim: HOJE, hoje: HOJE });
    assert.match(padrao, /data-dia="2026-11-28" disabled/);
    assert.doesNotMatch(padrao, /data-dia="2026-11-26" disabled/);
    const futuro = P.htmlCalendario('2026-11', { inicio: HOJE, fim: HOJE, hoje: HOJE, min: HOJE, max: '2027-02-25' });
    assert.match(futuro, /data-dia="2026-11-26" disabled/);
    assert.doesNotMatch(futuro, /data-dia="2026-11-28" disabled/);
  });

  test('P04 seletor para trás: começa em Hoje; primeiro toque espera; segundo consulta; corta em 92 dias', () => {
    const r = raizFalsa(); const chamadas = [];
    const s = P.criarSeletorPeriodo(r, { tipo: 'passado', hoje: () => HOJE, aoMudar: x => chamadas.push(x) });
    assert.deepStrictEqual(s.periodo(), { inicio: HOJE, fim: HOJE });
    assert.strictEqual(chamadas.length, 0, 'montar não consulta: quem usa carrega o primeiro');
    assert.match(r.innerHTML, /data-atalho="hoje"[^>]*aria-pressed="true"/);
    r.clicar({ atalho: 'ontem' });
    assert.deepStrictEqual(chamadas.pop(), { inicio: '2026-11-26', fim: '2026-11-26' });
    r.clicar({ atalho: 'pers' });
    assert.match(r.innerHTML, /per-cal/);
    r.clicar({ dia: '2026-11-25' });
    assert.strictEqual(chamadas.length, 0, 'o primeiro toque não consulta');
    assert.match(r.innerHTML, /A partir de 25\/11/);
    r.clicar({ dia: '2026-11-20' });
    assert.deepStrictEqual(chamadas.pop(), { inicio: '2026-11-20', fim: '2026-11-25' }, 'em ordem, mesmo tocando o fim antes');
    assert.match(r.innerHTML, /20\/11 a 25\/11 · 6 dias/);
    r.clicar({ dia: '2026-01-01' }); r.clicar({ dia: '2026-11-27' });
    assert.deepStrictEqual(chamadas.pop(), { inicio: '2026-01-01', fim: '2026-04-02' }, 'corta em 92 dias');
    r.clicar({ dia: '2026-11-26' }, true);
    assert.strictEqual(chamadas.length, 0, 'dia desligado não faz nada');
  });

  test('P05 seletor para frente: ontem desligado e "Próxima semana" dom–sáb', () => {
    const r = raizFalsa(); const chamadas = [];
    P.criarSeletorPeriodo(r, { tipo: 'futuro', hoje: () => HOJE, aoMudar: x => chamadas.push(x) });
    assert.doesNotMatch(r.innerHTML, /data-atalho="ontem"|data-atalho="mesant"/);
    r.clicar({ atalho: 'proxSemana' });
    assert.deepStrictEqual(chamadas.pop(), { inicio: '2026-11-29', fim: '2026-12-05' });
    r.clicar({ atalho: 'pers' });
    assert.match(r.innerHTML, /dezembro de 2026/, 'abre no mês do fim do período');
    r.clicar({ calNav: '-1' });
    assert.match(r.innerHTML, /data-dia="2026-11-26" disabled/);
    assert.doesNotMatch(r.innerHTML, /data-dia="2026-11-27" disabled/, 'hoje vale');
  });

  let ok = 0;
  for (const { n, f } of tests) {
    try { await f(); ok++; console.log(`✓ ${n}`); } catch (err) { console.log(`✗ ${n}\n   ${err.message}`); }
  }
  console.log(`\nSeletor de período Gate: ${ok}/${tests.length} testes verdes.`);
  process.exit(ok === tests.length ? 0 : 1);
})();

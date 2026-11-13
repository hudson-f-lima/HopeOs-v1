// Roda todos os E2E da PWA como o CI: servidor estático com os headers do
// render.yaml (CSP incluída) + uma dev-memory-api NOVA por script (cada E2E
// assume o seed recém-criado). Reprova se o script sair ≠ 0 ou se imprimir uma
// lista de erros/violações não vazia (ex.: `ERROS: ["..."]`).
//
// Uso (na raiz do repo): node backend/tests/e2e/run-all.js [nome ...]
//   Playwright vem de NODE_PATH (CI: diretório temporário; local: `npm root -g`).
//   E2E_API_SCRIPT troca o script da API (ex.: wrapper de medição).
// Servidores são parados pelo PID do processo filho (nada de pkill -f).
const { spawn, execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..', '..');
const API_SCRIPT = process.env.E2E_API_SCRIPT || path.join(ROOT, 'backend/scripts/dev-memory-api.js');
const NODE_PATH = process.env.NODE_PATH || execSync('npm root -g').toString().trim();
const amanha = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
// O navegador do teste roda no fuso do salão, como o aparelho de quem usa o app. A PWA
// calcula "hoje" pelo relógio do aparelho; num runner em UTC, entre 21h e meia-noite de
// Brasília, "hoje" do navegador já era o dia seguinte e os roteiros de agenda falhavam.
const FUSO_DO_SALAO = 'America/Sao_Paulo';

const CASOS = [
  { nome: 'csp' },
  { nome: 'login' },
  { nome: 'equipe' },
  { nome: 'convite' },
  { nome: 'onboarding', env: { DEV_EMPRESA_VAZIA: '1' } },
  { nome: 'onda-b' },
  { nome: 'slots', env: { E2E_DATE: amanha } },
  { nome: 'lembretes' },
  { nome: 'presenca' },
  { nome: 'caixa' },
  { nome: 'agendar', env: { DEV_PUBLIC_SLUG: 'salao-dev' } },
  { nome: 'estorno' },
  { nome: 'ganhos' },
  { nome: 'finops' },
  { nome: 'metas' },
  { nome: 'comanda' },
  { nome: 'agora' },
  { nome: 'dashboard' }
];
// Linha "ROTULO erros: [...]" / "ERROS: [...]" / "ERRS: [...]" / "VIOLAÇÕES CSP: [...]" com conteúdo.
const LISTA_NAO_VAZIA = /(erros|ERROS|ERRS|VIOLAÇÕES CSP):\s*\[(?!\])/;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function esperar(url, ms = 20000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    try { if ((await fetch(url)).ok) return; } catch { /* ainda subindo */ }
    await sleep(200);
  }
  throw new Error(`timeout esperando ${url}`);
}
function parar(filho) {
  return new Promise(resolve => {
    if (!filho || filho.exitCode !== null || filho.signalCode) return resolve();
    filho.once('exit', resolve);
    try { process.kill(filho.pid, 'SIGTERM'); } catch { resolve(); }
  });
}
function rodar(cmd, args, opts, prefixo) {
  const filho = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  filho.saida = '';
  const eco = chunk => {
    filho.saida += chunk;
    if (prefixo) process.stdout.write(String(chunk).split('\n').filter(Boolean).map(l => `${prefixo} ${l}\n`).join(''));
  };
  filho.stdout.on('data', eco); filho.stderr.on('data', eco);
  return filho;
}

async function portaLivre(porta) {
  try { await fetch(`http://127.0.0.1:${porta}/`); } catch { return true; }
  return false;
}

(async () => {
  // Os E2E têm 5599/3399 fixos: com outro servidor nessas portas o resultado seria de outro processo.
  for (const porta of [5599, 3399]) if (!(await portaLivre(porta))) throw new Error(`porta ${porta} já está em uso; pare o servidor antigo antes`);
  const filtro = process.argv.slice(2);
  const casos = filtro.length ? CASOS.filter(c => filtro.includes(c.nome)) : CASOS;
  const estatico = rodar('python3', ['-I', 'backend/tests/e2e/static-server.py', '--port', '5599', '--connect-extra', 'http://127.0.0.1:3399'], {}, '[static]');
  const resultados = [];
  try {
    await esperar('http://127.0.0.1:5599/index.html');
    for (const caso of casos) {
      console.log(`\n=== ${caso.nome}.e2e.js ${caso.env ? JSON.stringify(caso.env) : ''}`);
      const api = rodar('node', [API_SCRIPT], { env: { ...process.env, ...caso.env } }, null);
      let codigo; let motivo = '';
      try {
        await esperar('http://127.0.0.1:3399/api/health');
        const e2e = rodar('node', [path.join('backend/tests/e2e', `${caso.nome}.e2e.js`)], { env: { ...process.env, ...caso.env, NODE_PATH, TZ: FUSO_DO_SALAO } }, `[${caso.nome}]`);
        codigo = await new Promise(r => e2e.on('exit', c => r(c)));
        if (codigo !== 0) motivo = `saiu com código ${codigo}`;
        const linha = e2e.saida.split('\n').find(l => LISTA_NAO_VAZIA.test(l));
        if (linha) motivo = motivo || `lista de erros não vazia: ${linha.trim().slice(0, 200)}`;
      } catch (e) { motivo = e.message; }
      await parar(api);
      if (motivo && api.saida) console.log(`[api ${caso.nome}] últimas linhas:\n${api.saida.split('\n').slice(-15).join('\n')}`);
      resultados.push({ nome: caso.nome, ok: !motivo, motivo });
    }
  } finally {
    await parar(estatico);
  }
  console.log('\n=== RESUMO E2E');
  for (const r of resultados) console.log(`${r.ok ? 'OK   ' : 'FALHA'} ${r.nome}${r.motivo ? ' — ' + r.motivo : ''}`);
  const falhas = resultados.filter(r => !r.ok).length;
  console.log(`${resultados.length - falhas}/${resultados.length} E2E verdes.`);
  process.exit(falhas || resultados.length !== casos.length ? 1 : 0);
})().catch(e => { console.error('run-all FALHOU', e); process.exit(1); });

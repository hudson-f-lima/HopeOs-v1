#!/usr/bin/env node
// Passo 7 do docs/RUNBOOK_MIGRATION_007.md, idempotente: empresa + "Unidade principal"
// + vínculo admin para um usuário que JÁ existe em app_users (convidado pelo Supabase
// Auth). Usa o acesso do próprio backend (SupabaseRepository / identityStore) com a
// chave secreta do ambiente. --dry-run é o padrão: só grava com --apply.
// Rode `node backend/scripts/ops/bootstrap-admin.js --help`.
const path = require('path');
const {
  PROD_REF, EXIT, UUID_RE, EMAIL_RE, UsageError,
  parseArgs, checkSupabaseTarget, createReport, runCli, envSecrets
} = require('./lib');

const UNIDADE_PADRAO = 'Unidade principal';

const HELP = `bootstrap-admin — primeiro admin de um salão (passo 7 do runbook), idempotente

Uso:
  node backend/scripts/ops/bootstrap-admin.js --empresa-id UUID --empresa-nome "Nome" \\
       --admin-email dono@exemplo.com [--apply] [--json]

Pré-requisito: o e-mail já foi convidado em Supabase → Authentication → Users →
Invite user (o trigger da 007 cria a linha em app_users). Sem isso, nada é gravado.

O que faz (cada item só se faltar):
  1. empresas: insere (id, nome). Empresa existente NÃO é renomeada.
  2. unidades: cria "${UNIDADE_PADRAO}" se a empresa não tiver unidade.
  3. empresa_memberships: vínculo admin ativo do usuário (cria, ou promove/reativa).

Segurança:
  - PADRÃO = simulação (--dry-run): só lê e mostra o plano. Grava só com --apply.
  - Recusa (código 3) se SUPABASE_URL ou a chave forem do kortex-os-v2-staging,
    ou de qualquer projeto diferente de --expected-ref (padrão ${PROD_REF}).
  - A chave vem de SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY e nunca é impressa.

Opções:
  --empresa-id UUID      id da empresa (use o DEFAULT_EMPRESA_ID do Render)
  --empresa-nome TEXTO   nome do salão (usado só se a empresa ainda não existir)
  --admin-email EMAIL    e-mail do dono, já convidado no Supabase Auth
  --unidade-nome TEXTO   nome da unidade criada (padrão "${UNIDADE_PADRAO}")
  --apply                grava de verdade
  --dry-run              simula (padrão; explícito para scripts)
  --expected-ref REF     projeto Supabase esperado (padrão ${PROD_REF})
  --no-dotenv            não carregar backend/.env
  --json                 saída JSON
  --help

Saída: 0 = ok (plano mostrado ou aplicado); 1 = falhou (usuário não convidado,
erro do banco); 2 = uso incorreto; 3 = recusado por segurança.
`;

// Acesso real: o mesmo cliente Supabase do backend (chave secreta, só servidor).
// Carregado sob demanda, depois das checagens de segurança.
function createSupabaseBootstrapStore() {
  const { SupabaseRepository } = require('../../src/repositories/SupabaseRepository');
  const { supabaseStore } = require('../../src/auth/identityStore');
  return {
    async getEmpresa(id) { return (await new SupabaseRepository(id).list('empresas', { id }))[0] || null; },
    async insertEmpresa({ id, nome }) {
      // empresas não tem empresa_id: SupabaseRepository.insert não serve; mesmo cliente.
      const { data, error } = await new SupabaseRepository(id).supabase.from('empresas').insert({ id, nome }).select('*').single();
      if (error) throw error;
      return data;
    },
    findAppUserByEmail: email => supabaseStore.findAppUserByEmail(email),
    listUnidades: empresaId => supabaseStore.listUnidades(empresaId),
    insertUnidade: row => supabaseStore.insertUnidade(row),
    listMembershipsByEmpresa: empresaId => supabaseStore.listMembershipsByEmpresa(empresaId),
    insertMembership: row => supabaseStore.insertMembership(row),
    updateMembership: (id, patch) => supabaseStore.updateMembership(id, patch)
  };
}

async function readState(store, { empresaId, email }) {
  const empresa = await store.getEmpresa(empresaId);
  const found = await store.findAppUserByEmail(email);
  // findAppUserByEmail usa ilike (onde "_" e "%" são curinga): exige igualdade exata.
  const user = found && String(found.email || '').toLowerCase() === email.toLowerCase() ? found : null;
  const unidades = empresa ? await store.listUnidades(empresaId) : [];
  const memberships = empresa ? await store.listMembershipsByEmpresa(empresaId) : [];
  const membership = user ? memberships.find(m => m.user_id === user.id) || null : null;
  return { empresa, user, unidades, memberships, membership };
}

function plan(state, { empresaId, empresaNome, unidadeNome }) {
  const steps = [];
  steps.push(state.empresa
    ? { alvo: 'empresa', acao: 'existe', detalhe: `${empresaId} "${state.empresa.nome}"` }
    : { alvo: 'empresa', acao: 'criar', detalhe: `${empresaId} "${empresaNome}"` });
  const ativas = state.unidades.filter(u => u.ativo !== false);
  steps.push(ativas.length
    ? { alvo: 'unidade', acao: 'existe', detalhe: ativas.map(u => `"${u.nome}"`).join(', ') }
    : { alvo: 'unidade', acao: 'criar', detalhe: `"${unidadeNome}"` });
  const m = state.membership;
  if (!state.user) steps.push({ alvo: 'membership', acao: 'bloqueado', detalhe: 'usuário não encontrado em app_users' });
  else if (!m) steps.push({ alvo: 'membership', acao: 'criar', detalhe: `admin ativo para ${state.user.email}` });
  else if (m.role === 'admin' && m.status === 'ativo') steps.push({ alvo: 'membership', acao: 'existe', detalhe: `admin ativo (${m.id})` });
  else steps.push({ alvo: 'membership', acao: 'atualizar', detalhe: `${m.role}/${m.status} → admin/ativo (${m.id})` });
  return steps;
}

async function apply(store, state, steps, { empresaId, empresaNome, unidadeNome }) {
  const writes = [];
  const acao = alvo => steps.find(s => s.alvo === alvo).acao;
  if (acao('empresa') === 'criar') { await store.insertEmpresa({ id: empresaId, nome: empresaNome }); writes.push('empresa'); }
  if (acao('unidade') === 'criar') { await store.insertUnidade({ empresa_id: empresaId, nome: unidadeNome }); writes.push('unidade'); }
  if (acao('membership') === 'criar') {
    try {
      await store.insertMembership({ empresa_id: empresaId, user_id: state.user.id, role: 'admin', status: 'ativo' });
    } catch (err) {
      // Corrida com outra execução: o unique (empresa_id, user_id) decide; segue como atualização.
      if (err && err.code !== '23505') throw err;
      const m = (await store.listMembershipsByEmpresa(empresaId)).find(x => x.user_id === state.user.id);
      await store.updateMembership(m.id, { role: 'admin', status: 'ativo' });
    }
    writes.push('membership');
  }
  if (acao('membership') === 'atualizar') { await store.updateMembership(state.membership.id, { role: 'admin', status: 'ativo' }); writes.push('membership'); }
  return writes;
}

async function runBootstrap({ env, empresaId, empresaNome, email, unidadeNome = UNIDADE_PADRAO, doApply = false, expectedRef = PROD_REF, store }) {
  const report = createReport('bootstrap-admin');
  const result = { modo: doApply ? 'apply' : 'dry-run', passos: [], gravados: [] };
  const target = checkSupabaseTarget(env, report, { expectedRef, mismatchIsRefusal: true });
  if (report.refused || !target.usable) {
    report.skip('bootstrap', report.refused ? 'recusado: nenhuma conexão foi aberta' : 'SUPABASE_URL/chave inválidos');
    return { report, result };
  }
  if (env.DEFAULT_EMPRESA_ID && env.DEFAULT_EMPRESA_ID.toLowerCase() !== empresaId.toLowerCase()) {
    report.warn('env.DEFAULT_EMPRESA_ID', `${env.DEFAULT_EMPRESA_ID} ≠ --empresa-id: o token legado continuará apontando para outra empresa`);
  }

  const s = store || createSupabaseBootstrapStore();
  const ctx = { empresaId, empresaNome, unidadeNome };
  let state;
  try { state = await readState(s, { empresaId, email }); } catch (err) {
    report.fail('db.leitura', `falha ao ler o banco: ${err.message || err.code || err}`);
    return { report, result };
  }
  const steps = plan(state, ctx);
  result.passos = steps;
  for (const st of steps) {
    const msg = `${st.acao.toUpperCase()}: ${st.detalhe}`;
    if (st.acao === 'bloqueado') report.fail(`plano.${st.alvo}`, msg);
    else if (st.acao === 'existe') report.ok(`plano.${st.alvo}`, msg);
    else report.info(`plano.${st.alvo}`, `${doApply ? '' : '(simulação) '}${msg}`);
  }
  if (state.empresa && state.empresa.nome !== empresaNome) report.warn('plano.empresa.nome', `empresa já existe com nome "${state.empresa.nome}"; não renomeio (ajuste pela PWA)`);
  if (state.user && state.user.ativo === false) report.warn('usuario.ativo', 'app_users.ativo = false: o login vai falhar até reativar');
  if (!state.user) {
    report.fail('usuario', `${email} não está em app_users: convide antes em Supabase → Authentication → Users → Invite user. Nada foi gravado.`);
    return { report, result };
  }
  report.ok('usuario', `${state.user.email} (${state.user.id})`);
  const pendentes = steps.filter(st => st.acao === 'criar' || st.acao === 'atualizar').length;

  if (!doApply) {
    report.info('modo', pendentes ? `SIMULAÇÃO: ${pendentes} gravação(ões) pendente(s). Rode de novo com --apply.` : 'SIMULAÇÃO: nada a fazer, já está configurado.');
    return { report, result };
  }
  try {
    result.gravados = await apply(s, state, steps, ctx);
  } catch (err) {
    report.fail('apply', `falha ao gravar: ${err.message || err.code || err} (gravados até aqui: ${result.gravados.join(', ') || 'nada'}; rode de novo — é idempotente)`);
    return { report, result };
  }
  // Releitura: confere o estado final em vez de confiar no retorno das escritas.
  const fim = await readState(s, { empresaId, email });
  const ok = fim.empresa && fim.unidades.some(u => u.ativo !== false) && fim.membership && fim.membership.role === 'admin' && fim.membership.status === 'ativo';
  if (ok) report.ok('apply', result.gravados.length ? `aplicado: ${result.gravados.join(', ')}. Próximo: login na PWA com ${email}.` : 'nada a gravar: já estava configurado');
  else report.fail('apply', 'estado final não confere (empresa/unidade/vínculo admin); verifique no banco');
  return { report, result };
}

async function main(argv, processEnv, deps = {}) {
  let opts;
  try {
    opts = parseArgs(argv, {
      boolean: ['help', 'json', 'apply', 'dry-run', 'no-dotenv'],
      string: ['empresa-id', 'empresa-nome', 'admin-email', 'unidade-nome', 'expected-ref']
    });
    if (opts.help) return { code: EXIT.OK, stdout: HELP };
    if (opts.apply && opts['dry-run']) throw new UsageError('use --apply OU --dry-run, não os dois');
    if (!opts['empresa-id'] || !UUID_RE.test(opts['empresa-id'])) throw new UsageError('--empresa-id precisa ser um UUID');
    if (!opts['empresa-nome'] || !opts['empresa-nome'].trim()) throw new UsageError('--empresa-nome é obrigatório');
    if (!opts['admin-email'] || !EMAIL_RE.test(opts['admin-email'])) throw new UsageError('--admin-email precisa ser um e-mail');
  } catch (err) {
    if (err instanceof UsageError) return { code: EXIT.USAGE, stderr: `${err.message}\n\nVeja --help.` };
    throw err;
  }
  if (!opts['no-dotenv']) require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  const { report, result } = await runBootstrap({
    env: processEnv,
    empresaId: opts['empresa-id'].toLowerCase(),
    empresaNome: opts['empresa-nome'].trim(),
    email: opts['admin-email'].trim(),
    unidadeNome: (opts['unidade-nome'] || UNIDADE_PADRAO).trim(),
    doApply: opts.apply,
    expectedRef: opts['expected-ref'] || PROD_REF,
    store: deps.store
  });
  const code = report.exitCode();
  if (opts.json) return { code, stdout: JSON.stringify(report.toJSON({ data: result }), null, 2) };
  const head = `HOPE OS bootstrap-admin — modo ${result.modo.toUpperCase()}${opts.apply ? '' : ' (nada é gravado; use --apply)'}`;
  return { code, stdout: `${head}\n\n${report.render()}` };
}

module.exports = { main, runBootstrap, UNIDADE_PADRAO };
if (require.main === module) runCli(main, envSecrets);

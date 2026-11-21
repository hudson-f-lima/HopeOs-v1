const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { once } = require('node:events');
const http = require('node:http');
const { after, before, beforeEach, test } = require('node:test');
const { env } = require('../src/config/env');
const { app } = require('../src/app');
const { getSupabase } = require('../src/db/supabaseClient');
const { setAuthProvider } = require('../src/auth/provider');
const { createMemoryIdentityStore, setIdentityStore, supabaseStore } = require('../src/auth/identityStore');

const empresaId = randomUUID();
const adminId = randomUUID();
const adminMembershipId = randomUUID();
const adminUser = { id: adminId, email: 'admin@example.test', ativo: true };
const adminMembership = { id: adminMembershipId, empresa_id: empresaId, user_id: adminId, role: 'admin', status: 'ativo' };

function account(email) {
  return { id: randomUUID(), email, ativo: true };
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return 'http://127.0.0.1:' + server.address().port;
}

async function close(server) {
  const closed = once(server, 'close');
  server.close();
  await closed;
}

let server;
let base;
let store;
let provider;

before(async () => {
  server = http.createServer(app);
  base = await listen(server);
});

beforeEach(() => {
  store = createMemoryIdentityStore({ app_users: [{ ...adminUser }], empresa_memberships: [{ ...adminMembership }] });
  provider = {
    async getUser() { return adminUser; },
    async inviteUser(email) {
      const user = account(email);
      store.db.app_users.push(user);
      return user;
    }
  };
  setIdentityStore(store);
  setAuthProvider(provider);
});

after(async () => {
  setIdentityStore();
  setAuthProvider();
  await close(server);
});

async function request(path, body, method = 'POST') {
  const res = await fetch(base + '/api/admin/' + path, {
    method,
    headers: { authorization: 'Bearer header.admin.signature', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(3000)
  });
  return { status: res.status, body: await res.json() };
}

function assertOnlyAdminMembership() {
  assert.deepEqual(store.db.empresa_memberships, [adminMembership]);
}

function useTestSupabaseUrl(url) {
  const originalUrl = env.SUPABASE_URL;
  const originalKey = env.SUPABASE_SECRET_KEY;
  env.SUPABASE_URL = url;
  env.SUPABASE_SECRET_KEY = 'identity-exact-gate';
  return () => {
    env.SUPABASE_URL = originalUrl;
    env.SUPABASE_SECRET_KEY = originalKey;
  };
}

test('C01: o cliente Supabase envia imatch ancorado com caracteres literais e limite de duas contas', async () => {
  const email = 'A._%*+(B)[C]\\?{$}^|@Example.test';
  const user = account(email.toLowerCase());
  const requests = [];
  let rows = [user];
  const rest = http.createServer((req, res) => {
    requests.push(new URL(req.url, 'http://127.0.0.1'));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(rows));
  });
  const restore = useTestSupabaseUrl(await listen(rest));
  try {
    assert.deepEqual(await supabaseStore.findAppUserByEmail(email), user);
    assert.equal(requests[0].pathname, '/rest/v1/app_users');
    assert.equal(requests[0].searchParams.get('email'), 'imatch.^A\\._%\\*\\+\\(B\\)\\[C\\]\\\\\\?\\{\\$\\}\\^\\|@Example\\.test$');
    assert.equal(requests[0].searchParams.get('limit'), '2');

    rows = [];
    assert.equal(await supabaseStore.findAppUserByEmail(email), null);
    rows = [account('parecido@example.test')];
    await assert.rejects(supabaseStore.findAppUserByEmail(email), { code: 'IDENTITY_EMAIL_MISMATCH' });
    rows = [user, account(email)];
    await assert.rejects(supabaseStore.findAppUserByEmail(email), { code: 'AMBIGUOUS_IDENTITY' });
  } finally {
    restore();
    await close(rest);
  }
});

const localPostgrestUrl = process.env.IDENTITY_EXACT_TEST_POSTGREST_URL;
test('C01: PostgreSQL/PostgREST preservam a busca literal e a unicidade do e-mail', {
  skip: !localPostgrestUrl
}, async () => {
  const url = new URL(localPostgrestUrl);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  const restore = useTestSupabaseUrl(url.origin);
  const client = getSupabase();
  const domain = randomUUID() + '.example.test';
  const users = [
    'A_B%+Tag@' + domain.toUpperCase(),
    'A.*%+Tag@' + domain,
    'É_[B]\\?{$}^|"D",<E>:!@' + domain,
    'axb123+tag@' + domain,
    'a.b%+tag@' + domain,
    'a.X%+tag@' + domain,
    'a_b%+tag@' + domain + '.extra'
  ].map(email => ({ ...account(email), nome: 'Identity gate fixture' }));
  const duplicate = { ...users[0], id: randomUUID(), email: users[0].email.toLowerCase() };
  try {
    assert.ifError((await client.from('app_users').insert(users)).error);
    for (const user of users) {
      const actual = await supabaseStore.findAppUserByEmail(user.email.toLowerCase());
      assert.equal(actual?.id, user.id);
    }
    for (const email of ['a_b%+outro@' + domain, 'a.b@' + domain, 'a.*%+tag@' + domain + '.extra']) {
      assert.equal(await supabaseStore.findAppUserByEmail(email), null);
    }
    assert.equal((await client.from('app_users').insert(duplicate)).error?.code, '23505');
  } finally {
    const { error } = await client.from('app_users').delete().in('id', [...users.map(user => user.id), duplicate.id]);
    restore();
    assert.ifError(error);
  }
});

test('C01: membership resolve caixa mista e distingue _, %, +, pontos e contas semelhantes', async () => {
  const target = account('A_B%+Etiqueta@Example.test');
  store.db.app_users.push(
    account('axb123+etiqueta@example.test'),
    account('ab@example.test'),
    account('a.b+etiqueta@example.test'),
    account('a_b%+etiqueta@example.test.extra'),
    target
  );
  const linked = await request('memberships', { email: '  a_b%+ETIQUETA@example.test  ', role: 'recepcao' });
  assert.equal(linked.status, 201);
  assert.equal(linked.body.data.user_id, target.id);
  const absent = await request('memberships', { email: 'a_b%+outro@example.test', role: 'recepcao' });
  assert.equal(absent.status, 422);
  assert.equal(absent.body.error.code, 'USER_NOT_FOUND');
  const differentAddress = await request('memberships', { email: 'a.b@example.test', role: 'recepcao' });
  assert.equal(differentAddress.body.error.code, 'USER_NOT_FOUND');
  assert.equal(store.db.empresa_memberships.length, 2);
});

test('C01: identidade ambígua bloqueia vínculo e não inicia convite', async () => {
  store.db.app_users.push(account('Ambíguo_%@example.test'), account('AMBÍGUO_%@Example.test'));
  let invitations = 0;
  provider.inviteUser = async () => { invitations++; };
  for (const path of ['memberships', 'invites']) {
    const result = await request(path, { email: 'ambíguo_%@example.test', role: 'recepcao' });
    assert.equal(result.status, 409);
    assert.equal(result.body.error.code, 'AMBIGUOUS_IDENTITY');
  }
  assert.equal(invitations, 0);
  assertOnlyAdminMembership();
});

test('C01: email inválido, destinatário divergente e id inválido não gravam membership', async () => {
  const email = 'destino_%@example.test';
  for (const path of ['memberships', 'invites']) {
    const invalid = await request(path, { email: [email], role: 'recepcao' });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.error.code, 'INVALID_EMAIL');

    store.findAppUserByEmail = async () => account('destinoX123@example.test');
    const mismatch = await request(path, { email, role: 'recepcao' });
    assert.equal(mismatch.status, 503);
    assert.equal(mismatch.body.error.code, 'IDENTITY_EMAIL_MISMATCH');

    store.findAppUserByEmail = async () => ({ email, id: 'not-a-uuid' });
    const badId = await request(path, { email, role: 'recepcao' });
    assert.equal(badId.status, 422);
    assert.equal(badId.body.error.code, 'INVALID_UUID');
  }
  assertOnlyAdminMembership();
});

test('C01: convite usa a conta literal existente ou vincula a conta criada e confirmada', async () => {
  const existing = account('Existente.+Sem_Remover%@Example.test');
  const similar = account('novoX123+tag@example.test');
  store.db.app_users.push(existing, similar);
  const linked = await request('invites', { email: existing.email.toLowerCase(), role: 'gestor' });
  assert.equal(linked.status, 201);
  assert.equal(linked.body.data.convidado, false);
  assert.equal(linked.body.data.user_id, existing.id);

  const invited = await request('invites', { email: 'Novo_%+TAG@Example.test', role: 'recepcao' });
  assert.equal(invited.status, 201);
  assert.equal(invited.body.data.convidado, true);
  const user = await store.getAppUser(invited.body.data.user_id);
  assert.equal(user.email, 'novo_%+tag@example.test');
  assert.notEqual(user.id, similar.id);
});

test('C01: convite exige e-mail do provedor e UUID do espelho local compatíveis', async () => {
  const email = 'novo_%+tag@example.test';
  const id = randomUUID();
  provider.inviteUser = async () => ({ id, email: 'outro@example.test' });
  const providerMismatch = await request('invites', { email, role: 'recepcao' });
  assert.equal(providerMismatch.status, 503);
  assert.equal(providerMismatch.body.error.code, 'IDENTITY_EMAIL_MISMATCH');

  provider.inviteUser = async () => ({ id: 'not-a-uuid', email });
  const providerBadId = await request('invites', { email, role: 'recepcao' });
  assert.equal(providerBadId.status, 422);
  assert.equal(providerBadId.body.error.code, 'INVALID_UUID');

  provider.inviteUser = async () => ({ id, email });
  const originalGetAppUser = store.getAppUser;
  store.getAppUser = async userId => userId === id ? { id, email: 'outro@example.test' } : originalGetAppUser(userId);
  const mirrorEmailMismatch = await request('invites', { email, role: 'recepcao' });
  assert.equal(mirrorEmailMismatch.status, 503);
  assert.equal(mirrorEmailMismatch.body.error.code, 'IDENTITY_EMAIL_MISMATCH');

  store.getAppUser = async userId => userId === id ? account(email) : originalGetAppUser(userId);
  const mirrorIdMismatch = await request('invites', { email, role: 'recepcao' });
  assert.equal(mirrorIdMismatch.status, 503);
  assert.equal(mirrorIdMismatch.body.error.code, 'IDENTITY_USER_MISMATCH');
  assertOnlyAdminMembership();
});

test('C08: rebaixamento e desativação concorrentes de administradores ativos são bloqueados', async () => {
  const other = { ...adminMembership, id: randomUUID(), user_id: randomUUID() };
  store.db.empresa_memberships.push(other);

  const outcomes = await Promise.all([
    request('memberships/' + adminMembershipId, { role: 'gestor' }, 'PATCH'),
    request('memberships/' + other.id, { status: 'inativo' }, 'PATCH')
  ]);
  for (const outcome of outcomes) {
    assert.equal(outcome.status, 409);
    assert.equal(outcome.body.error.code, 'ADMIN_CHANGE_REQUIRES_ATOMIC_SUPPORT');
  }
  assert.deepEqual(store.db.empresa_memberships, [adminMembership, other]);
});

test('C08: promoções, reativações e alterações de não administradores continuam disponíveis', async () => {
  const inactiveAdmin = { ...adminMembership, id: randomUUID(), user_id: randomUUID(), status: 'inativo' };
  const staff = { ...adminMembership, id: randomUUID(), user_id: randomUUID(), role: 'recepcao' };
  store.db.empresa_memberships.push(inactiveAdmin, staff);

  const lastAdmin = await request('memberships/' + adminMembershipId, { status: 'inativo' }, 'PATCH');
  assert.equal(lastAdmin.status, 409);
  assert.equal(lastAdmin.body.error.code, 'LAST_ADMIN');
  const reactivated = await request('memberships/' + inactiveAdmin.id, { status: 'ativo' }, 'PATCH');
  assert.equal(reactivated.status, 200);
  assert.equal(reactivated.body.data.status, 'ativo');
  const changed = await request('memberships/' + staff.id, { role: 'gestor' }, 'PATCH');
  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.role, 'gestor');
  const promoted = await request('memberships/' + staff.id, { role: 'admin' }, 'PATCH');
  assert.equal(promoted.status, 200);
  assert.equal(promoted.body.data.role, 'admin');
});

test('C08: gravação obsoleta não desativa um administrador recém-promovido', async () => {
  const staff = { ...adminMembership, id: randomUUID(), user_id: randomUUID(), role: 'gestor' };
  store.db.empresa_memberships.push(staff);
  const updateMembership = store.updateMembership;
  store.updateMembership = async (id, patch, expected) => {
    staff.role = 'admin';
    return updateMembership(id, patch, expected);
  };
  const stale = await request('memberships/' + staff.id, { status: 'inativo' }, 'PATCH');
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'MEMBERSHIP_CHANGED');
  assert.equal(staff.status, 'ativo');
  assert.equal(staff.role, 'admin');
});

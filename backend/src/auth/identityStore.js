// Acesso às tabelas de identidade da migration 007. Toda leitura é fresca
// (sem cache): suspender membership/unidade/role vale na próxima requisição.
// Injetável (setIdentityStore) para testes e para o dev-memory-api.
const { randomUUID } = require('crypto');
const { getSupabase } = require('../db/supabaseClient');

async function q(promise) {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

const supabaseStore = {
  async getAppUser(id) {
    return (await q(getSupabase().from('app_users').select('*').eq('id', id).limit(1)))[0] || null;
  },
  async findAppUserByEmail(email) {
    return (await q(getSupabase().from('app_users').select('*').ilike('email', email).limit(1)))[0] || null;
  },
  async listMembershipsByUser(userId) {
    return q(getSupabase().from('empresa_memberships').select('*').eq('user_id', userId));
  },
  async listMembershipsByEmpresa(empresaId) {
    return q(getSupabase().from('empresa_memberships').select('*').eq('empresa_id', empresaId));
  },
  async getMembership(id) {
    return (await q(getSupabase().from('empresa_memberships').select('*').eq('id', id).limit(1)))[0] || null;
  },
  async insertMembership(row) {
    return (await q(getSupabase().from('empresa_memberships').insert({ id: randomUUID(), ...row }).select('*')))[0];
  },
  async updateMembership(id, patch) {
    return (await q(getSupabase().from('empresa_memberships').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('*')))[0];
  },
  async listMembershipUnits(membershipId) {
    return q(getSupabase().from('membership_units').select('*').eq('membership_id', membershipId));
  },
  async replaceMembershipUnits(membershipId, unitIds) {
    await q(getSupabase().from('membership_units').delete().eq('membership_id', membershipId));
    if (unitIds.length) await q(getSupabase().from('membership_units').insert(unitIds.map(unit_id => ({ membership_id: membershipId, unit_id }))));
  },
  async listUnidades(empresaId) {
    return q(getSupabase().from('unidades').select('*').eq('empresa_id', empresaId));
  },
  async insertUnidade(row) {
    return (await q(getSupabase().from('unidades').insert({ id: randomUUID(), ...row }).select('*')))[0];
  },
  async updateUnidade(id, empresaId, patch) {
    return (await q(getSupabase().from('unidades').update(patch).eq('id', id).eq('empresa_id', empresaId).select('*')))[0] || null;
  },
  async getCredential(id) {
    return (await q(getSupabase().from('integration_credentials').select('*').eq('id', id).limit(1)))[0] || null;
  },
  async listCredentials(integrationId) {
    return q(getSupabase().from('integration_credentials').select('id, integration_id, expires_at, revoked_at, created_at').eq('integration_id', integrationId));
  },
  async insertCredential(row) {
    return (await q(getSupabase().from('integration_credentials').insert(row).select('id, integration_id, expires_at, revoked_at, created_at')))[0];
  },
  async updateCredential(id, patch) {
    return (await q(getSupabase().from('integration_credentials').update(patch).eq('id', id).select('id, integration_id, expires_at, revoked_at, created_at')))[0] || null;
  },
  async getIntegration(id) {
    return (await q(getSupabase().from('integrations').select('*').eq('id', id).limit(1)))[0] || null;
  },
  async listIntegrations(empresaId) {
    return q(getSupabase().from('integrations').select('*').eq('empresa_id', empresaId));
  },
  async insertIntegration(row) {
    return (await q(getSupabase().from('integrations').insert({ id: randomUUID(), ...row }).select('*')))[0];
  },
  async updateIntegration(id, empresaId, patch) {
    return (await q(getSupabase().from('integrations').update(patch).eq('id', id).eq('empresa_id', empresaId).select('*')))[0] || null;
  },
  async listScopes(integrationId) {
    return (await q(getSupabase().from('integration_scopes').select('scope').eq('integration_id', integrationId))).map(r => r.scope);
  },
  async replaceScopes(integrationId, scopes) {
    await q(getSupabase().from('integration_scopes').delete().eq('integration_id', integrationId));
    if (scopes.length) await q(getSupabase().from('integration_scopes').insert(scopes.map(scope => ({ integration_id: integrationId, scope }))));
  },
  async insertAudit(row) {
    await q(getSupabase().from('integration_audit_events').insert(row));
  },
  async listAudit(integrationId, limit = 100) {
    return q(getSupabase().from('integration_audit_events').select('*').eq('integration_id', integrationId).order('created_at', { ascending: false }).limit(limit));
  }
};

// Implementação em memória com a mesma interface (testes e dev).
function createMemoryIdentityStore(seed = {}) {
  const db = {
    app_users: [], empresa_memberships: [], membership_units: [], unidades: [],
    integrations: [], integration_credentials: [], integration_scopes: [], integration_audit_events: [],
    ...seed
  };
  const pub = c => { const { secret_hash, ...rest } = c; return rest; };
  const now = () => new Date().toISOString();
  return {
    db,
    async getAppUser(id) { return db.app_users.find(u => u.id === id) || null; },
    async findAppUserByEmail(email) { return db.app_users.find(u => String(u.email).toLowerCase() === String(email).toLowerCase()) || null; },
    async listMembershipsByUser(userId) { return db.empresa_memberships.filter(m => m.user_id === userId); },
    async listMembershipsByEmpresa(empresaId) { return db.empresa_memberships.filter(m => m.empresa_id === empresaId); },
    async getMembership(id) { return db.empresa_memberships.find(m => m.id === id) || null; },
    async insertMembership(row) {
      if (db.empresa_memberships.some(m => m.empresa_id === row.empresa_id && m.user_id === row.user_id)) {
        const err = new Error('duplicate key'); err.code = '23505'; throw err;
      }
      const m = { id: randomUUID(), status: 'ativo', profissional_id: null, created_at: now(), ...row };
      db.empresa_memberships.push(m); return m;
    },
    async updateMembership(id, patch) { const m = db.empresa_memberships.find(x => x.id === id); if (m) Object.assign(m, patch); return m || null; },
    async listMembershipUnits(membershipId) { return db.membership_units.filter(x => x.membership_id === membershipId); },
    async replaceMembershipUnits(membershipId, unitIds) {
      db.membership_units = db.membership_units.filter(x => x.membership_id !== membershipId).concat(unitIds.map(unit_id => ({ membership_id: membershipId, unit_id })));
    },
    async listUnidades(empresaId) { return db.unidades.filter(u => u.empresa_id === empresaId); },
    async insertUnidade(row) { const u = { id: randomUUID(), ativo: true, ...row }; db.unidades.push(u); return u; },
    async updateUnidade(id, empresaId, patch) { const u = db.unidades.find(x => x.id === id && x.empresa_id === empresaId); if (u) Object.assign(u, patch); return u || null; },
    async getCredential(id) { return db.integration_credentials.find(c => c.id === id) || null; },
    async listCredentials(integrationId) { return db.integration_credentials.filter(c => c.integration_id === integrationId).map(pub); },
    async insertCredential(row) { const c = { revoked_at: null, expires_at: null, created_at: now(), ...row }; db.integration_credentials.push(c); return pub(c); },
    async updateCredential(id, patch) { const c = db.integration_credentials.find(x => x.id === id); if (c) Object.assign(c, patch); return c ? pub(c) : null; },
    async getIntegration(id) { return db.integrations.find(i => i.id === id) || null; },
    async listIntegrations(empresaId) { return db.integrations.filter(i => i.empresa_id === empresaId); },
    async insertIntegration(row) { const i = { id: randomUUID(), status: 'ativo', created_at: now(), ...row }; db.integrations.push(i); return i; },
    async updateIntegration(id, empresaId, patch) { const i = db.integrations.find(x => x.id === id && x.empresa_id === empresaId); if (i) Object.assign(i, patch); return i || null; },
    async listScopes(integrationId) { return db.integration_scopes.filter(s => s.integration_id === integrationId).map(s => s.scope); },
    async replaceScopes(integrationId, scopes) {
      db.integration_scopes = db.integration_scopes.filter(s => s.integration_id !== integrationId).concat(scopes.map(scope => ({ integration_id: integrationId, scope })));
    },
    async insertAudit(row) { db.integration_audit_events.push({ id: randomUUID(), created_at: now(), ...row }); },
    async listAudit(integrationId) { return db.integration_audit_events.filter(e => e.integration_id === integrationId).reverse(); }
  };
}

let current = supabaseStore;
function getIdentityStore() { return current; }
function setIdentityStore(store) { current = store || supabaseStore; }

module.exports = { getIdentityStore, setIdentityStore, createMemoryIdentityStore, supabaseStore };

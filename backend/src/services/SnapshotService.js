const { SupabaseRepository } = require('../repositories/SupabaseRepository');

// empresaId sempre explícito (req.auth.empresa_id): sem default de tenant.
async function getSnapshot(empresaId) {
  if (!empresaId) throw new Error('getSnapshot exige empresaId');
  const repo = new SupabaseRepository(empresaId);
  return repo.loadSnapshot();
}

module.exports = { getSnapshot };

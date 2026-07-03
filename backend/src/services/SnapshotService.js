const { SupabaseRepository } = require('../repositories/SupabaseRepository');

async function getSnapshot() {
  const repo = new SupabaseRepository();
  return repo.loadSnapshot();
}

module.exports = { getSnapshot };

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { SupabaseRepository } = require('../src/repositories/SupabaseRepository');
const { env } = require('../src/config/env');

async function main() {
  const repo = new SupabaseRepository();
  const snapshot = await repo.loadSnapshot();
  const target = path.resolve(__dirname, '../../data/backups', `export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(target, JSON.stringify(snapshot, null, 2));
  console.log(`Export salvo em ${target}`);
}

main().catch(err => { console.error(err); process.exit(1); });

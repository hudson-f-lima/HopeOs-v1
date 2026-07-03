const fs = require('fs');
const path = require('path');
const assert = require('assert');

const migrationPath = path.resolve(__dirname, '../../supabase/migrations/003_lock_rpc_permissions.sql');
const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase().replace(/\s+/g, ' ').trim();

function mustContain(label, fragment) {
  assert(sql.includes(fragment.toLowerCase()), `${label} ausente na migration 003`);
  console.log(`✓ ${label}`);
}

mustContain(
  '11.1 revoke public na RPC checkout_close',
  'revoke all on function public.checkout_close(uuid, jsonb, jsonb) from public;'
);
mustContain(
  '11.2 revoke anon na RPC checkout_close',
  'revoke all on function public.checkout_close(uuid, jsonb, jsonb) from anon;'
);
mustContain(
  '11.3 revoke authenticated na RPC checkout_close',
  'revoke all on function public.checkout_close(uuid, jsonb, jsonb) from authenticated;'
);
mustContain(
  '11.4 grant apenas service_role na RPC checkout_close',
  'grant execute on function public.checkout_close(uuid, jsonb, jsonb) to service_role;'
);
mustContain(
  '11.5 função continua SECURITY DEFINER',
  'security definer'
);
mustContain(
  '11.6 corrida de idempotência captura unique_violation',
  'exception when unique_violation then'
);
mustContain(
  '11.7 resposta idempotente graciosa preservada',
  "'idempotent', true"
);

assert(!sql.includes('grant execute on function public.checkout_close(uuid, jsonb, jsonb) to anon'), 'RPC não pode dar GRANT para anon');
assert(!sql.includes('grant execute on function public.checkout_close(uuid, jsonb, jsonb) to authenticated'), 'RPC não pode dar GRANT para authenticated');
console.log('✓ 11.8 sem GRANT para anon/authenticated');

console.log('\nRPC Permission Gate: 8/8 checks verdes.');

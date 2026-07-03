const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');

function getSupabase() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    const err = new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios no backend/.env');
    err.statusCode = 500;
    throw err;
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

module.exports = { getSupabase };

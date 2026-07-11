const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');

function getSupabase() {
  const serverKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !serverKey) {
    const err = new Error('SUPABASE_URL e SUPABASE_SECRET_KEY sao obrigatorios no backend/.env');
    err.statusCode = 500;
    throw err;
  }
  return createClient(env.SUPABASE_URL, serverKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

module.exports = { getSupabase };

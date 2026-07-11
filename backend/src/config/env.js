require('dotenv').config();
const path = require('path');

function splitCsv(value, fallback = []) {
  return String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
    .concat(fallback)
    .filter((v, i, arr) => arr.indexOf(v) === i);
}

const env = {
  PORT: Number(process.env.PORT || 3333),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATA_DIR: path.resolve(__dirname, '../../', process.env.DATA_DIR || '../data'),
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '',
  DEFAULT_EMPRESA_ID: process.env.DEFAULT_EMPRESA_ID || '00000000-0000-0000-0000-000000000001',
  API_ACCESS_TOKEN: process.env.API_ACCESS_TOKEN || '',
  CORS_ORIGIN: splitCsv(process.env.CORS_ORIGIN || 'null,http://localhost:5173,http://127.0.0.1:5500')
};

module.exports = { env };

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
  // ADR-005: desliga o Bearer legado (API_ACCESS_TOKEN) sem remover o código.
  LEGACY_TOKEN_AUTH_ENABLED: String(process.env.LEGACY_TOKEN_AUTH_ENABLED ?? 'true').toLowerCase() !== 'false',
  AUTH_TIMEOUT_MS: Number(process.env.AUTH_TIMEOUT_MS || 5000),
  // Janela em que a credencial antiga de integração continua válida após rotação.
  INTEGRATION_ROTATION_OVERLAP_MIN: Number(process.env.INTEGRATION_ROTATION_OVERLAP_MIN || 60),
  // URL pública da PWA: destino dos links de convite e de recuperação de senha.
  APP_PUBLIC_URL: process.env.APP_PUBLIC_URL || '',
  LOGIN_RATE_LIMIT_MAX: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
  LOGIN_RATE_LIMIT_WINDOW_MIN: Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MIN || 15),
  APP_TIMEZONE: process.env.APP_TIMEZONE || 'America/Sao_Paulo',
  CORS_ORIGIN: splitCsv(process.env.CORS_ORIGIN || 'null,http://localhost:5173,http://127.0.0.1:5500')
};

module.exports = { env };

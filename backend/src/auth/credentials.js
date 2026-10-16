// Credenciais de integração servidor-a-servidor (ADR-005).
// Formato entregue ao admin uma única vez: kxi_<credentialId>_<segredo>.
// No banco só fica secret_hash (scrypt). Comparação em tempo constante.
const crypto = require('crypto');

const PREFIX = 'kxi_';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const FORMAT = new RegExp(`^${PREFIX}(${UUID})_([A-Za-z0-9_-]{43})$`);
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };

function scrypt(secret, salt) {
  return crypto.scryptSync(secret, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
}

function hashSecret(secret) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('base64url')}$${scrypt(secret, salt).toString('base64url')}`;
}

// Hash fixo para gastar o mesmo trabalho quando a credencial não existe:
// o tempo de resposta não distingue "não existe" de "existe mas está errada".
const DUMMY_HASH = hashSecret(crypto.randomBytes(32).toString('base64url'));

function verifySecret(secret, storedHash) {
  const parts = String(storedHash || DUMMY_HASH).split('$');
  const [algo, saltB64, hashB64] = parts.length === 3 ? parts : DUMMY_HASH.split('$');
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = scrypt(String(secret), Buffer.from(saltB64, 'base64url'));
  return algo === 'scrypt' && expected.length === actual.length && crypto.timingSafeEqual(expected, actual) && Boolean(storedHash);
}

function generateCredential(credentialId) {
  const secret = crypto.randomBytes(32).toString('base64url');
  return { token: `${PREFIX}${credentialId}_${secret}`, secretHash: hashSecret(secret) };
}

function parseCredential(token) {
  const m = FORMAT.exec(String(token || ''));
  return m ? { credentialId: m[1], secret: m[2] } : null;
}

function looksLikeIntegrationToken(token) {
  return String(token || '').startsWith(PREFIX);
}

module.exports = { generateCredential, parseCredential, verifySecret, hashSecret, looksLikeIntegrationToken, DUMMY_HASH };

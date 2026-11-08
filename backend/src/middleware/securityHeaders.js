// Headers de segurança da API, escritos à mão (sem helmet: nada de dependência
// nova de produção). Aplicado antes de tudo, então vale também para 404, 413,
// erros e preflight de CORS.
//
// - nosniff: o navegador não "adivinha" tipo de conteúdo (JSON nunca vira HTML/JS).
// - X-Frame-Options DENY: a API não deve ser embutida em <iframe> (clickjacking).
// - Referrer-Policy no-referrer: respostas da API não vazam URL de origem.
// - Cross-Origin-Resource-Policy same-site: bloqueia só carregamento "no-cors"
//   (<img>, <script>, <link>) de outro site. fetch() em modo CORS — como a PWA faz
//   a partir de outro host — não passa por essa checagem; quem governa é o CORS.
// - HSTS só em produção: em dev/LAN a API roda em http:// e o header seria ignorado
//   ou, pior, "grudaria" HTTPS em localhost no navegador.
const { env } = require('../config/env');

const HSTS = 'max-age=31536000; includeSubDomains';

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  // Lido a cada requisição (não no require) para o teste conseguir alternar o modo.
  if (env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', HSTS);
  next();
}

module.exports = { securityHeaders, HSTS };

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { env } = require('./config/env');
const routes = require('./routes');
const { authRouter } = require('./routes/auth');
const { adminRouter } = require('./routes/admin');
const { onboardingRouter } = require('./routes/onboarding');
const { estruturaRouter } = require('./routes/estrutura');
const { caixaRouter } = require('./routes/caixa');
const { pilotoRouter } = require('./routes/piloto');
const { publicBookingRouter } = require('./routes/publicBooking');
const { requireAuth } = require('./middleware/auth');
const { securityHeaders } = require('./middleware/securityHeaders');
const { mapErrorForResponse } = require('./errors');

const app = express();
app.disable('x-powered-by'); // não anunciar Express/versão
app.use(securityHeaders); // primeiro: vale para 404, erros e preflight

// Celular na mesma Wi-Fi acessa o frontend por um IP de rede local (192.168.x.x, 10.x.x.x,
// 172.16-31.x.x) cuja porta muda a cada sessao de teste; nao da pra fixar no CORS_ORIGIN.
const LAN_ORIGIN = /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

const GITHUB_PAGES_ORIGIN = 'https://hudson-f-lima.github.io';
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const corsOptions = {
  origin(origin, callback) {
    // Permitir arquivos locais (file://) que enviam origin nula ou indefinida
    if (!origin || origin === 'null') return callback(null, true);

    // Permitir origens configuradas nas variaveis de ambiente
    if (env.CORS_ORIGIN.includes('*') || env.CORS_ORIGIN.includes(origin)) return callback(null, true);

    // GitHub Pages do usuario, localhost e rede local LAN — comparação exata
    // (antes era substring: https://hudson-f-lima.github.io.atacante.com passava).
    if (origin === GITHUB_PAGES_ORIGIN || LOCAL_ORIGIN.test(origin) || LAN_ORIGIN.test(origin)) return callback(null, true);

    return callback(null, false);
  }
};

app.use(cors(corsOptions));
app.set('trust proxy', 1); // Render: req.ip do cliente real (rate limit de login)
// Maior corpo legítimo medido nos E2E: 777 B (POST /api/onboarding/servicos). Pior
// caso previsto: lista do onboarding (teto de 50 itens) ≈ 30 KB; comanda grande
// (100 itens) ≈ 15 KB. Não há upload/importação por HTTP (import-xlsx é CLI).
// 100kb dá folga de 3x sobre o pior caso e corta corpos de 5 MB (DoS barato).
const JSON_BODY_LIMIT = '100kb';
app.use(morgan('dev'));
// Agendamento online (público, sem login): antes do parser global (tem o seu, de
// 10 kB) e do requireAuth. Tenant só pelo mapa slug → empresa do servidor; sem o
// mapa (PUBLIC_BOOKING_LINKS) responde 404 em tudo. Nunca cria req.auth.
app.use('/api/public', publicBookingRouter);
app.use(express.json({ limit: JSON_BODY_LIMIT }));

app.get('/', (req, res) => {
  res.redirect('/api/health');
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'HOPE OS V1 API', time: new Date().toISOString() });
});

// Sessão (login/refresh/logout/me) antes do perímetro; o resto exige principal.
app.use('/api', authRouter);
app.use('/api', requireAuth);
app.use('/api', adminRouter);
app.use('/api', onboardingRouter);
app.use('/api', estruturaRouter);
app.use('/api', caixaRouter);
app.use('/api', pilotoRouter);
app.use('/api', routes);

app.use((err, req, res, next) => {
  const { statusCode, body } = mapErrorForResponse(err);
  // 4xx e esperado (sem token, validacao): uma linha, sem pilha, para nao afogar os erros reais.
  if (statusCode >= 500) console.error(err);
  else console.warn(`[${statusCode}] ${body.error.code}: ${body.error.message}`);
  res.status(statusCode).json(body);
});

module.exports = { app, JSON_BODY_LIMIT };

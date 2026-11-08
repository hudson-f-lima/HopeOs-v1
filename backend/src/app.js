const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { env } = require('./config/env');
const routes = require('./routes');
const { authRouter } = require('./routes/auth');
const { adminRouter } = require('./routes/admin');
const { onboardingRouter } = require('./routes/onboarding');
const { estruturaRouter } = require('./routes/estrutura');
const { requireAuth } = require('./middleware/auth');
const { mapErrorForResponse } = require('./errors');

const app = express();

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
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

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
app.use('/api', routes);

app.use((err, req, res, next) => {
  console.error(err);
  const { statusCode, body } = mapErrorForResponse(err);
  res.status(statusCode).json(body);
});

module.exports = { app };

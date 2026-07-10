const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { env } = require('./config/env');
const routes = require('./routes');
const { requireAuth } = require('./middleware/auth');
const { mapErrorForResponse } = require('./errors');

const app = express();

// Celular na mesma Wi-Fi acessa o frontend por um IP de rede local (192.168.x.x, 10.x.x.x,
// 172.16-31.x.x) cuja porta muda a cada sessão de teste — não dá pra fixar no CORS_ORIGIN.
const LAN_ORIGIN = /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

const corsOptions = {
  origin(origin, callback) {
    // Permitir arquivos locais (file://) que enviam origin nula ou indefinida
    if (!origin || origin === 'null') return callback(null, true);
    
    // Permitir origens configuradas nas variáveis de ambiente
    if (env.CORS_ORIGIN.includes('*') || env.CORS_ORIGIN.includes(origin)) return callback(null, true);
    
    // Permitir GitHub Pages do usuário
    if (origin.includes('hudson-f-lima.github.io')) return callback(null, true);
    
    // Permitir localhost e rede local LAN
    if (LAN_ORIGIN.test(origin) || origin.includes('localhost') || origin.includes('127.0.0.1')) return callback(null, true);
    
    return callback(null, false);
  }
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/', (req, res) => {
  res.redirect('/api/health');
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, app: 'HOPE OS V1 API', time: new Date().toISOString() });
});

// Tudo abaixo desta linha exige credencial. `/` e `/api/health` ficam acima de proposito.
app.use('/api', requireAuth);
app.use('/api', routes);

app.use((err, req, res, next) => {
  console.error(err);
  const { statusCode, body } = mapErrorForResponse(err);
  res.status(statusCode).json(body);
});

module.exports = { app };

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { env } = require('./config/env');
const routes = require('./routes');

const app = express();

// Celular na mesma Wi-Fi acessa o frontend por um IP de rede local (192.168.x.x, 10.x.x.x,
// 172.16-31.x.x) cuja porta muda a cada sessão de teste — não dá pra fixar no CORS_ORIGIN.
const LAN_ORIGIN = /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

const corsOptions = {
  origin(origin, callback) {
    if (!origin && env.CORS_ORIGIN.includes('null')) return callback(null, true);
    if (env.CORS_ORIGIN.includes('*') || env.CORS_ORIGIN.includes(origin)) return callback(null, true);
    if (origin && LAN_ORIGIN.test(origin)) return callback(null, true);
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

app.use('/api', routes);

app.use((err, req, res, next) => {
  console.error(err);
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Erro interno';
  res.status(err.statusCode || err.status || 500).json({
    ok: false,
    error: {
      code,
      message,
      details: err.details || null
    }
  });
});

module.exports = { app };

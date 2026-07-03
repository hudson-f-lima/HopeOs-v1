const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { env } = require('./config/env');
const routes = require('./routes');

const app = express();

const corsOptions = {
  origin(origin, callback) {
    if (!origin && env.CORS_ORIGIN.includes('null')) return callback(null, true);
    if (env.CORS_ORIGIN.includes('*') || env.CORS_ORIGIN.includes(origin)) return callback(null, true);
    return callback(null, false);
  }
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

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

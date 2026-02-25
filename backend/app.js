const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const healthRoutes = require('./src/routes/health.routes');
const errorMiddleware = require('./src/middleware/error.middleware');

const env = require('./src/config/env');

const app = express();

app.use(helmet());
app.use(cors({ origin: env.frontendUrl, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (env.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

app.use('/api/health', healthRoutes);

// Placeholder — feature routes will be added here phase by phase

app.use(errorMiddleware);

module.exports = app;

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const healthRoutes = require('./src/routes/health.routes');
const authRoutes = require('./src/routes/auth.routes');
const workflowRoutes = require('./src/routes/workflow.routes');
const documentRoutes = require('./src/routes/document.routes');
const runRoutes = require('./src/routes/run.routes');
const splittingRoutes = require('./src/routes/splitting.routes');
const categorisationRoutes = require('./src/routes/categorisation.routes');
const documentFolderRoutes = require('./src/routes/documentFolder.routes');
const extractorRoutes = require('./src/routes/extractor.routes');
const { setsRouter: dataMapSetsRoutes, rulesRouter: dataMapRulesRoutes } = require('./src/routes/dataMapper.routes');
const reconciliationRoutes = require('./src/routes/reconciliation.routes');
const webhookRoutes = require('./src/routes/webhook.routes');
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
app.use('/api/auth', authRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/runs', runRoutes);
app.use('/api/splitting-instructions', splittingRoutes);
app.use('/api/categorisation-prompts', categorisationRoutes);
app.use('/api/document-folders', documentFolderRoutes);
app.use('/api/extractors', extractorRoutes);
app.use('/api/data-map-sets', dataMapSetsRoutes);
app.use('/api/data-map-rules', dataMapRulesRoutes);
app.use('/api/reconciliation-rules', reconciliationRoutes);
app.use('/api/webhooks', webhookRoutes);

app.use(errorMiddleware);

module.exports = app;

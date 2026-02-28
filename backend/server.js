const app = require('./app');
const env = require('./src/config/env');
const documentExecutionModel = require('./src/models/documentExecution.model');

app.listen(env.port, async () => {
  // Clean up any executions/runs left in processing/running state by a previous server
  // session that was killed mid-execution (e.g. deploy restart, crash).
  try {
    await documentExecutionModel.cleanupStaleProcessing();
  } catch (err) {
    console.error('Startup cleanup failed:', err);
  }
  console.log(`Fibula backend running on port ${env.port} [${env.nodeEnv}]`);
});

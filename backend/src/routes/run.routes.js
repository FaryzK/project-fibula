const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const dbUserMiddleware = require('../middleware/dbUser.middleware');
const runController = require('../controllers/run.controller');

const router = express.Router();

router.use(authMiddleware, dbUserMiddleware);

// Standalone run routes (not nested under workflow)
router.get('/:runId', runController.getRun);
router.get('/:runId/executions', runController.getExecutions);
router.get('/:runId/node-statuses', runController.getNodeStatuses);

module.exports = router;

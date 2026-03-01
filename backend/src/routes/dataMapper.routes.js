const express = require('express');
const multer = require('multer');
const authMiddleware = require('../middleware/auth.middleware');
const dbUserMiddleware = require('../middleware/dbUser.middleware');
const controller = require('../controllers/dataMapper.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Shared middleware on the parent app
const withAuth = [authMiddleware, dbUserMiddleware];

// Data Map Sets
const setsRouter = express.Router();
setsRouter.use(withAuth);
setsRouter.get('/', controller.listSets);
setsRouter.post('/', controller.createSet);
setsRouter.post('/upload', upload.single('file'), controller.createSetFromUpload);
setsRouter.get('/:id', controller.getSet);
setsRouter.patch('/:id', controller.updateSet);
setsRouter.delete('/:id', controller.removeSet);
setsRouter.get('/:id/download', controller.downloadSet);
setsRouter.get('/:id/usage', controller.getSetUsage);
setsRouter.post('/:id/records', upload.single('file'), controller.addRecords);
setsRouter.patch('/:id/records/:recordId', controller.updateRecord);
setsRouter.delete('/:id/records/:recordId', controller.removeRecord);

// Data Map Rules
const rulesRouter = express.Router();
rulesRouter.use(withAuth);
rulesRouter.get('/', controller.listRules);
rulesRouter.post('/', controller.createRule);
rulesRouter.get('/:id', controller.getRule);
rulesRouter.get('/:id/usage', controller.getRuleUsage);
rulesRouter.patch('/:id', controller.updateRule);
rulesRouter.delete('/:id', controller.removeRule);

module.exports = { setsRouter, rulesRouter };

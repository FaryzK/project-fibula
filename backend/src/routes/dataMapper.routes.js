const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const dbUserMiddleware = require('../middleware/dbUser.middleware');
const controller = require('../controllers/dataMapper.controller');

const router = express.Router({ mergeParams: true });

// Shared middleware on the parent app
const withAuth = [authMiddleware, dbUserMiddleware];

// Data Map Sets
const setsRouter = express.Router();
setsRouter.use(withAuth);
setsRouter.get('/', controller.listSets);
setsRouter.post('/', controller.createSet);
setsRouter.get('/:id', controller.getSet);
setsRouter.patch('/:id', controller.updateSet);
setsRouter.delete('/:id', controller.removeSet);

// Data Map Rules
const rulesRouter = express.Router();
rulesRouter.use(withAuth);
rulesRouter.get('/', controller.listRules);
rulesRouter.post('/', controller.createRule);
rulesRouter.get('/:id', controller.getRule);
rulesRouter.patch('/:id', controller.updateRule);
rulesRouter.delete('/:id', controller.removeRule);

module.exports = { setsRouter, rulesRouter };

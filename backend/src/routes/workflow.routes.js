const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const dbUserMiddleware = require('../middleware/dbUser.middleware');
const workflowController = require('../controllers/workflow.controller');
const nodeController = require('../controllers/node.controller');
const edgeController = require('../controllers/edge.controller');

router.use(authMiddleware, dbUserMiddleware);

// Workflows
router.get('/', workflowController.list);
router.post('/', workflowController.create);
router.get('/:id', workflowController.getOne);
router.patch('/:id', workflowController.update);
router.delete('/:id', workflowController.remove);
router.patch('/:id/publish', workflowController.publish);
router.patch('/:id/unpublish', workflowController.unpublish);

// Nodes (nested under workflow)
router.get('/:workflowId/nodes', nodeController.list);
router.post('/:workflowId/nodes', nodeController.create);
router.patch('/:workflowId/nodes/:nodeId', nodeController.update);
router.delete('/:workflowId/nodes/:nodeId', nodeController.remove);

// Edges (nested under workflow)
router.get('/:workflowId/edges', edgeController.list);
router.post('/:workflowId/edges', edgeController.create);
router.delete('/:workflowId/edges/:edgeId', edgeController.remove);

module.exports = router;

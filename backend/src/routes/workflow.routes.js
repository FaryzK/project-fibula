const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const dbUserMiddleware = require('../middleware/dbUser.middleware');
const workflowController = require('../controllers/workflow.controller');
const nodeController = require('../controllers/node.controller');
const edgeController = require('../controllers/edge.controller');
const runController = require('../controllers/run.controller');
const flowInspectorController = require('../controllers/flowInspector.controller');

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

// Runs (nested under workflow)
router.post('/:id/runs', runController.createRun);
router.get('/:id/runs', runController.listRuns);

// Flow Inspector
router.get('/:workflowId/flow-inspector/summary', flowInspectorController.getSummary);
router.get('/:workflowId/flow-inspector/nodes/:nodeId/documents', flowInspectorController.getNodeDocuments);
router.get('/:workflowId/flow-inspector/orphaned', flowInspectorController.getOrphaned);
router.delete('/:workflowId/flow-inspector/documents/:execId', flowInspectorController.deleteDocument);
router.post('/:workflowId/flow-inspector/retrigger', flowInspectorController.retrigger);

module.exports = router;

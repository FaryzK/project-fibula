const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const dbUserMiddleware = require('../middleware/dbUser.middleware');
const controller = require('../controllers/reconciliation.controller');

const router = express.Router();
router.use(authMiddleware, dbUserMiddleware);

router.get('/', controller.list);
router.post('/', controller.create);
// Specific routes before /:id to avoid param conflicts
router.get('/documents', controller.listHeldDocs);
router.post('/documents/:heldDocId/reject', controller.rejectDoc);
router.delete('/documents/:heldDocId', controller.deleteDoc);
router.get('/:id', controller.getOne);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);
router.get('/:id/anchor-docs', controller.listAnchorDocs);
router.post('/:id/anchor-docs/:anchorDocExecId/send-out', controller.sendOutAnchor);
router.get('/:id/matching-sets', controller.listMatchingSets);
router.get('/:id/matching-sets/:setId', controller.getMatchingSet);
router.get('/:id/matching-sets/:setId/comparisons', controller.listComparisonResults);
router.post('/:id/matching-sets/:setId/comparisons/:compId/force-reconcile', controller.forceReconcileComparison);
router.post('/:id/matching-sets/:setId/rerun-comparisons', controller.rerunComparisons);
router.post('/:id/matching-sets/:setId/force-reconcile', controller.forceReconcile);
router.post('/:id/matching-sets/:setId/reject', controller.reject);

module.exports = router;

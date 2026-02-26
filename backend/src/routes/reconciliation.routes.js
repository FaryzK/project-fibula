const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const dbUserMiddleware = require('../middleware/dbUser.middleware');
const controller = require('../controllers/reconciliation.controller');

const router = express.Router();
router.use(authMiddleware, dbUserMiddleware);

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/all-matching-sets', controller.listAllMatchingSets);
router.get('/:id', controller.getOne);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);
router.get('/:id/matching-sets', controller.listMatchingSets);
router.get('/:id/matching-sets/:setId', controller.getMatchingSet);
router.post('/:id/matching-sets/:setId/force-reconcile', controller.forceReconcile);
router.post('/:id/matching-sets/:setId/reject', controller.reject);

module.exports = router;

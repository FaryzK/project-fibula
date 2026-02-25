const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const dbUserMiddleware = require('../middleware/dbUser.middleware');
const controller = require('../controllers/documentFolder.controller');

const router = express.Router();
router.use(authMiddleware, dbUserMiddleware);

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.getOne);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);
router.get('/:id/documents', controller.listDocuments);
router.post('/:id/documents/:heldId/send-out', controller.sendOut);

module.exports = router;

const express = require('express');
const multer = require('multer');
const authMiddleware = require('../middleware/auth.middleware');
const dbUserMiddleware = require('../middleware/dbUser.middleware');
const controller = require('../controllers/extractor.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });
router.use(authMiddleware, dbUserMiddleware);

router.get('/', controller.list);
router.post('/', controller.create);
router.get('/:id', controller.getOne);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);
router.get('/:id/held', controller.listHeld);
router.post('/:id/held/:heldId/send-out', controller.sendOut);
router.post('/:id/test-extract', upload.single('file'), controller.testExtract);
router.get('/:id/feedback', controller.listFeedback);
router.post('/:id/feedback', controller.createFeedback);

module.exports = router;

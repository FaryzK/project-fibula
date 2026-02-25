const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const dbUserMiddleware = require('../middleware/dbUser.middleware');
const splittingController = require('../controllers/splitting.controller');

const router = express.Router();

router.use(authMiddleware, dbUserMiddleware);

router.get('/', splittingController.list);
router.post('/', splittingController.create);
router.get('/:id', splittingController.getOne);
router.patch('/:id', splittingController.update);
router.delete('/:id', splittingController.remove);

module.exports = router;

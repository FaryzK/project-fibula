const express = require('express');
const authMiddleware = require('../middleware/auth.middleware');
const dbUserMiddleware = require('../middleware/dbUser.middleware');
const categorisationController = require('../controllers/categorisation.controller');

const router = express.Router();

router.use(authMiddleware, dbUserMiddleware);

router.get('/', categorisationController.list);
router.post('/', categorisationController.create);
router.get('/:id', categorisationController.getOne);
router.patch('/:id', categorisationController.update);
router.delete('/:id', categorisationController.remove);

module.exports = router;

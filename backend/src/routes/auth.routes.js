const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const authController = require('../controllers/auth.controller');

router.get('/me', authMiddleware, authController.getMe);
router.post('/logout', authMiddleware, authController.logout);

module.exports = router;

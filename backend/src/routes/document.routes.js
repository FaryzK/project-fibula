const express = require('express');
const multer = require('multer');
const authMiddleware = require('../middleware/auth.middleware');
const dbUserMiddleware = require('../middleware/dbUser.middleware');
const documentController = require('../controllers/document.controller');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.use(authMiddleware, dbUserMiddleware);

router.post('/upload', upload.single('file'), documentController.upload);

module.exports = router;

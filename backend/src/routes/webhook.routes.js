const express = require('express');
const controller = require('../controllers/webhook.controller');

const router = express.Router();

// No auth middleware — inbound webhooks are public endpoints
router.post('/:nodeId/trigger', controller.trigger);

module.exports = router;

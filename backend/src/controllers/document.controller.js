const storageService = require('../services/storage.service');
const documentModel = require('../models/document.model');

module.exports = {
  async upload(req, res, next) {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file attached' });

      const { originalname, mimetype, buffer } = req.file;

      const { url } = await storageService.upload(buffer, originalname, mimetype);

      const doc = await documentModel.create({
        userId: req.dbUser.id,
        fileName: originalname,
        fileUrl: url,
        fileType: mimetype,
      });

      return res.status(201).json(doc);
    } catch (err) {
      next(err);
    }
  },
};

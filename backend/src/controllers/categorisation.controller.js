const categorisationModel = require('../models/categorisationPrompt.model');

module.exports = {
  async list(req, res, next) {
    try {
      const prompts = await categorisationModel.findByUserId(req.dbUser.id);
      return res.json(prompts);
    } catch (err) {
      next(err);
    }
  },

  async create(req, res, next) {
    try {
      const { name, labels } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      if (!labels || !Array.isArray(labels) || labels.length === 0) {
        return res.status(400).json({ error: 'labels must be a non-empty array' });
      }

      const prompt = await categorisationModel.create({ userId: req.dbUser.id, name, labels });
      return res.status(201).json(prompt);
    } catch (err) {
      next(err);
    }
  },

  async getOne(req, res, next) {
    try {
      const prompt = await categorisationModel.findById(req.params.id);
      if (!prompt) return res.status(404).json({ error: 'Not found' });
      if (prompt.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      const usage = await categorisationModel.findUsage(req.params.id);
      return res.json({ prompt, usage });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const prompt = await categorisationModel.findById(req.params.id);
      if (!prompt) return res.status(404).json({ error: 'Not found' });
      if (prompt.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      const updated = await categorisationModel.update(req.params.id, req.body);
      return res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async remove(req, res, next) {
    try {
      const prompt = await categorisationModel.findById(req.params.id);
      if (!prompt) return res.status(404).json({ error: 'Not found' });
      if (prompt.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      const usage = await categorisationModel.findUsage(req.params.id);
      if (usage.length > 0) {
        return res.status(409).json({
          error: 'Cannot delete: prompt is used by workflow nodes',
          usage,
        });
      }

      await categorisationModel.remove(req.params.id);
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};

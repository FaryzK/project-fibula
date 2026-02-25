const splittingModel = require('../models/splittingInstruction.model');

module.exports = {
  async list(req, res, next) {
    try {
      const instructions = await splittingModel.findByUserId(req.dbUser.id);
      return res.json(instructions);
    } catch (err) {
      next(err);
    }
  },

  async create(req, res, next) {
    try {
      const { name, instructions } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      if (!instructions) return res.status(400).json({ error: 'instructions is required' });

      const row = await splittingModel.create({ userId: req.dbUser.id, name, instructions });
      return res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },

  async getOne(req, res, next) {
    try {
      const instruction = await splittingModel.findById(req.params.id);
      if (!instruction) return res.status(404).json({ error: 'Not found' });
      if (instruction.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      const usage = await splittingModel.findUsage(req.params.id);
      return res.json({ instruction, usage });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const instruction = await splittingModel.findById(req.params.id);
      if (!instruction) return res.status(404).json({ error: 'Not found' });
      if (instruction.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      const updated = await splittingModel.update(req.params.id, req.body);
      return res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async remove(req, res, next) {
    try {
      const instruction = await splittingModel.findById(req.params.id);
      if (!instruction) return res.status(404).json({ error: 'Not found' });
      if (instruction.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      const usage = await splittingModel.findUsage(req.params.id);
      if (usage.length > 0) {
        return res.status(409).json({
          error: 'Cannot delete: instruction is used by workflow nodes',
          usage,
        });
      }

      await splittingModel.remove(req.params.id);
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};

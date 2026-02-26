const reconciliationModel = require('../models/reconciliation.model');

module.exports = {
  async list(req, res, next) {
    try {
      const rules = await reconciliationModel.findByUserId(req.dbUser.id);
      return res.json(rules);
    } catch (err) {
      next(err);
    }
  },

  async create(req, res, next) {
    try {
      const { name, anchor_extractor_id, target_extractors, variations } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      if (!anchor_extractor_id) return res.status(400).json({ error: 'anchor_extractor_id is required' });
      const rule = await reconciliationModel.create({
        userId: req.dbUser.id,
        name,
        anchorExtractorId: anchor_extractor_id,
        targetExtractors: target_extractors || [],
        variations: variations || [],
      });
      return res.status(201).json(rule);
    } catch (err) {
      next(err);
    }
  },

  async getOne(req, res, next) {
    try {
      const rule = await reconciliationModel.findById(req.params.id);
      if (!rule) return res.status(404).json({ error: 'Not found' });
      if (rule.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const usage = await reconciliationModel.findUsage(req.params.id);
      return res.json({ rule, usage });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const rule = await reconciliationModel.findById(req.params.id);
      if (!rule) return res.status(404).json({ error: 'Not found' });
      if (rule.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const updated = await reconciliationModel.update(req.params.id, req.body);
      return res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async remove(req, res, next) {
    try {
      const rule = await reconciliationModel.findById(req.params.id);
      if (!rule) return res.status(404).json({ error: 'Not found' });
      if (rule.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const usage = await reconciliationModel.findUsage(req.params.id);
      if (usage.length > 0) {
        return res.status(409).json({ error: 'Cannot delete: rule is used by workflow nodes', usage });
      }
      await reconciliationModel.remove(req.params.id);
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async listAllMatchingSets(req, res, next) {
    try {
      const { status } = req.query;
      const sets = await reconciliationModel.findAllMatchingSets(req.dbUser.id, { status });
      return res.json(sets);
    } catch (err) {
      next(err);
    }
  },

  async listMatchingSets(req, res, next) {
    try {
      const rule = await reconciliationModel.findById(req.params.id);
      if (!rule) return res.status(404).json({ error: 'Not found' });
      if (rule.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const sets = await reconciliationModel.findMatchingSets(req.params.id);
      return res.json(sets);
    } catch (err) {
      next(err);
    }
  },

  async getMatchingSet(req, res, next) {
    try {
      const rule = await reconciliationModel.findById(req.params.id);
      if (!rule) return res.status(404).json({ error: 'Not found' });
      if (rule.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const set = await reconciliationModel.findMatchingSetById(req.params.setId);
      if (!set) return res.status(404).json({ error: 'Matching set not found' });
      return res.json(set);
    } catch (err) {
      next(err);
    }
  },

  async forceReconcile(req, res, next) {
    try {
      const rule = await reconciliationModel.findById(req.params.id);
      if (!rule) return res.status(404).json({ error: 'Not found' });
      if (rule.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const set = await reconciliationModel.findMatchingSetById(req.params.setId);
      if (!set) return res.status(404).json({ error: 'Matching set not found' });
      const updated = await reconciliationModel.updateMatchingSetStatus(req.params.setId, 'force_reconciled');
      return res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async reject(req, res, next) {
    try {
      const rule = await reconciliationModel.findById(req.params.id);
      if (!rule) return res.status(404).json({ error: 'Not found' });
      if (rule.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const set = await reconciliationModel.findMatchingSetById(req.params.setId);
      if (!set) return res.status(404).json({ error: 'Matching set not found' });
      const updated = await reconciliationModel.updateMatchingSetStatus(req.params.setId, 'rejected');
      return res.json(updated);
    } catch (err) {
      next(err);
    }
  },
};

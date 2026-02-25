const dataMapperModel = require('../models/dataMapper.model');

module.exports = {
  // ── Data Map Sets ─────────────────────────────────────────────────────────

  async listSets(req, res, next) {
    try {
      const sets = await dataMapperModel.findSetsByUserId(req.dbUser.id);
      return res.json(sets);
    } catch (err) {
      next(err);
    }
  },

  async createSet(req, res, next) {
    try {
      const { name, headers, records } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const set = await dataMapperModel.createSet({
        userId: req.dbUser.id,
        name,
        headers: headers || [],
        records: records || [],
      });
      return res.status(201).json(set);
    } catch (err) {
      next(err);
    }
  },

  async getSet(req, res, next) {
    try {
      const set = await dataMapperModel.findSetById(req.params.id);
      if (!set) return res.status(404).json({ error: 'Not found' });
      if (set.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      return res.json(set);
    } catch (err) {
      next(err);
    }
  },

  async updateSet(req, res, next) {
    try {
      const set = await dataMapperModel.findSetById(req.params.id);
      if (!set) return res.status(404).json({ error: 'Not found' });
      if (set.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const updated = await dataMapperModel.updateSet(req.params.id, req.body);
      return res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async removeSet(req, res, next) {
    try {
      const set = await dataMapperModel.findSetById(req.params.id);
      if (!set) return res.status(404).json({ error: 'Not found' });
      if (set.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      await dataMapperModel.removeSet(req.params.id);
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  // ── Data Map Rules ────────────────────────────────────────────────────────

  async listRules(req, res, next) {
    try {
      const rules = await dataMapperModel.findRulesByUserId(req.dbUser.id);
      return res.json(rules);
    } catch (err) {
      next(err);
    }
  },

  async createRule(req, res, next) {
    try {
      const { name, extractor_id, lookups, targets } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      if (!extractor_id) return res.status(400).json({ error: 'extractor_id is required' });
      const rule = await dataMapperModel.createRule({
        userId: req.dbUser.id,
        name,
        extractorId: extractor_id,
        lookups: lookups || [],
        targets: targets || [],
      });
      return res.status(201).json(rule);
    } catch (err) {
      next(err);
    }
  },

  async getRule(req, res, next) {
    try {
      const rule = await dataMapperModel.findRuleById(req.params.id);
      if (!rule) return res.status(404).json({ error: 'Not found' });
      if (rule.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const usage = await dataMapperModel.findRuleUsage(req.params.id);
      return res.json({ rule, usage });
    } catch (err) {
      next(err);
    }
  },

  async updateRule(req, res, next) {
    try {
      const rule = await dataMapperModel.findRuleById(req.params.id);
      if (!rule) return res.status(404).json({ error: 'Not found' });
      if (rule.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const updated = await dataMapperModel.updateRule(req.params.id, req.body);
      return res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async removeRule(req, res, next) {
    try {
      const rule = await dataMapperModel.findRuleById(req.params.id);
      if (!rule) return res.status(404).json({ error: 'Not found' });
      if (rule.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const usage = await dataMapperModel.findRuleUsage(req.params.id);
      if (usage.length > 0) {
        return res.status(409).json({ error: 'Cannot delete: rule is used by workflow nodes', usage });
      }
      await dataMapperModel.removeRule(req.params.id);
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};

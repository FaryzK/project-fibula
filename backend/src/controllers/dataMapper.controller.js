const dataMapperModel = require('../models/dataMapper.model');
const dataMapSetService = require('../services/dataMapSet.service');

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

  async createSetFromUpload(req, res, next) {
    try {
      if (!req.file) return res.status(400).json({ error: 'file is required' });
      const name = req.body.name;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const typedHeaders = req.body.headers ? JSON.parse(req.body.headers) : null;
      if (!typedHeaders || !Array.isArray(typedHeaders)) {
        return res.status(400).json({ error: 'headers (JSON array of {name, data_type}) is required' });
      }

      const { headers: fileHeaders, rows } = dataMapSetService.parseFile(req.file.buffer, req.file.mimetype);

      // Verify file headers match declared typed headers
      const declaredNames = typedHeaders.map((h) => h.name);
      const missingInFile = declaredNames.filter((n) => !fileHeaders.includes(n));
      if (missingInFile.length > 0) {
        return res.status(400).json({ error: `Columns not found in file: ${missingInFile.join(', ')}` });
      }

      const { valid, errors, duplicatesRemoved } = dataMapSetService.validateAndCoerceRows(rows, typedHeaders);

      const set = await dataMapperModel.createSet({
        userId: req.dbUser.id,
        name,
        headers: typedHeaders,
        records: valid,
      });

      return res.status(201).json({ ...set, validationErrors: errors, duplicatesRemoved });
    } catch (err) {
      if (err.message && (err.message.includes('JSON') || err.message.includes('CSV'))) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  },

  async getSet(req, res, next) {
    try {
      const { page, pageSize, filters } = req.query;
      const opts = {};
      if (page) opts.page = parseInt(page, 10);
      if (pageSize) opts.pageSize = parseInt(pageSize, 10);
      if (filters) {
        try { opts.filters = JSON.parse(filters); } catch { opts.filters = {}; }
      }

      const set = await dataMapperModel.findSetById(req.params.id, opts);
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

      const usage = await dataMapperModel.findSetUsage(req.params.id);
      if (usage.length > 0) {
        return res.status(409).json({ error: 'Cannot delete: set is referenced by rules', usage });
      }

      await dataMapperModel.removeSet(req.params.id);
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async getSetUsage(req, res, next) {
    try {
      const set = await dataMapperModel.findSetById(req.params.id);
      if (!set) return res.status(404).json({ error: 'Not found' });
      if (set.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const usage = await dataMapperModel.findSetUsage(req.params.id);
      return res.json(usage);
    } catch (err) {
      next(err);
    }
  },

  async downloadSet(req, res, next) {
    try {
      const set = await dataMapperModel.findSetById(req.params.id);
      if (!set) return res.status(404).json({ error: 'Not found' });
      if (set.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      const headers = typeof set.headers === 'string' ? JSON.parse(set.headers) : set.headers || [];
      const csv = dataMapSetService.generateCsv(headers, set.records);

      const safeName = (set.name || 'data-map-set').replace(/[^a-zA-Z0-9_-]/g, '_');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${safeName}.csv"`);
      return res.send(csv);
    } catch (err) {
      next(err);
    }
  },

  async addRecords(req, res, next) {
    try {
      const set = await dataMapperModel.findSetById(req.params.id);
      if (!set) return res.status(404).json({ error: 'Not found' });
      if (set.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      const headers = typeof set.headers === 'string' ? JSON.parse(set.headers) : set.headers || [];
      let rows;

      if (req.file) {
        // File upload (bulk add)
        const parsed = dataMapSetService.parseFile(req.file.buffer, req.file.mimetype);
        rows = parsed.rows;
      } else if (req.body.records) {
        // JSON body
        rows = req.body.records;
      } else {
        return res.status(400).json({ error: 'records or file is required' });
      }

      const { valid, errors, duplicatesRemoved } = dataMapSetService.validateAndCoerceRows(rows, headers);

      // Also deduplicate against existing records
      const existingRecords = set.records || [];
      const existingKeys = new Set(
        existingRecords.map((r) => {
          const vals = typeof r.values === 'string' ? JSON.parse(r.values) : r.values || r;
          return JSON.stringify(vals);
        })
      );

      const newUnique = valid.filter((r) => !existingKeys.has(JSON.stringify(r)));
      const existingDuplicates = valid.length - newUnique.length;

      const added = await dataMapperModel.addRecords(req.params.id, newUnique);

      return res.status(201).json({
        added: added.length,
        validationErrors: errors,
        duplicatesRemoved: duplicatesRemoved + existingDuplicates,
      });
    } catch (err) {
      if (err.message && (err.message.includes('JSON') || err.message.includes('CSV'))) {
        return res.status(400).json({ error: err.message });
      }
      next(err);
    }
  },

  async removeRecord(req, res, next) {
    try {
      const set = await dataMapperModel.findSetById(req.params.id);
      if (!set) return res.status(404).json({ error: 'Not found' });
      if (set.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      await dataMapperModel.removeRecord(req.params.recordId);
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async updateRecord(req, res, next) {
    try {
      const set = await dataMapperModel.findSetById(req.params.id);
      if (!set) return res.status(404).json({ error: 'Not found' });
      if (set.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const row = await dataMapperModel.updateRecord(req.params.recordId, req.body.values);
      return res.json(row);
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

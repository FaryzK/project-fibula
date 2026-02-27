const reconciliationModel = require('../models/reconciliation.model');
const documentExecutionModel = require('../models/documentExecution.model');
const extractorModel = require('../models/extractor.model');
const { db } = require('../config/db');
const { resumeDocumentExecution } = require('../services/execution.service');
const { runAndRecordComparisons } = require('../services/reconciliation.service');

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
      const { name, anchor_extractor_id, auto_send_out, target_extractors, variations } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      if (!anchor_extractor_id) return res.status(400).json({ error: 'anchor_extractor_id is required' });
      const rule = await reconciliationModel.create({
        userId: req.dbUser.id,
        name,
        anchorExtractorId: anchor_extractor_id,
        autoSendOut: auto_send_out || false,
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

  // ── New Phase 10 endpoints ──────────────────────────────────────────────

  // GET /reconciliation-rules/documents
  async listHeldDocs(req, res, next) {
    try {
      const heldDocs = await reconciliationModel.findHeldDocs(req.dbUser.id);
      const enriched = await Promise.all(
        heldDocs.map(async (doc) => {
          const matchingSets = await reconciliationModel.findHeldDocMatchingSets(doc.document_execution_id);
          return { ...doc, matching_sets: matchingSets };
        })
      );
      return res.json(enriched);
    } catch (err) {
      next(err);
    }
  },

  // POST /reconciliation-rules/documents/:heldDocId/reject
  async rejectDoc(req, res, next) {
    try {
      const heldDoc = await db('reconciliation_held_documents')
        .where({ document_execution_id: req.params.heldDocId, user_id: req.dbUser.id })
        .first();
      if (!heldDoc) return res.status(404).json({ error: 'Not found' });

      await reconciliationModel.updateHeldDocStatus(heldDoc.id, 'rejected');

      // Remove from all matching sets globally
      await db('reconciliation_matching_set_docs')
        .where({ document_execution_id: heldDoc.document_execution_id })
        .delete();

      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  },

  // DELETE /reconciliation-rules/documents/:heldDocId
  async deleteDoc(req, res, next) {
    try {
      const heldDoc = await db('reconciliation_held_documents')
        .where({ document_execution_id: req.params.heldDocId, user_id: req.dbUser.id })
        .first();
      if (!heldDoc) return res.status(404).json({ error: 'Not found' });

      // Delete any matching sets where this doc is the anchor
      // (CASCADE removes set_docs + comparison_results within those sets)
      await db('reconciliation_matching_sets')
        .where({ anchor_document_execution_id: heldDoc.document_execution_id })
        .delete();

      // Remove this doc from any matching sets where it was a target
      await db('reconciliation_matching_set_docs')
        .where({ document_execution_id: heldDoc.document_execution_id })
        .delete();

      // Hard delete the held doc record
      await db('reconciliation_held_documents')
        .where({ id: heldDoc.id })
        .delete();

      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  },

  // GET /reconciliation-rules/:id/anchor-docs
  async listAnchorDocs(req, res, next) {
    try {
      const rule = await reconciliationModel.findById(req.params.id);
      if (!rule) return res.status(404).json({ error: 'Not found' });
      if (rule.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const anchorDocs = await reconciliationModel.findAnchorDocs(req.dbUser.id, req.params.id);
      return res.json(anchorDocs);
    } catch (err) {
      next(err);
    }
  },

  // POST /reconciliation-rules/:id/anchor-docs/:anchorDocExecId/send-out
  async sendOutAnchor(req, res, next) {
    try {
      const rule = await reconciliationModel.findById(req.params.id);
      if (!rule) return res.status(404).json({ error: 'Not found' });
      if (rule.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      const anchorHeld = await reconciliationModel.findHeldDocByDocExecId(req.params.anchorDocExecId);
      if (!anchorHeld || anchorHeld.user_id !== req.dbUser.id) {
        return res.status(404).json({ error: 'Held document not found' });
      }

      // Find the first reconciled matching set for this anchor
      const sets = await reconciliationModel.findMatchingSetsByAnchor(req.params.anchorDocExecId);
      const reconciledSet = sets.find((s) => s.status === 'reconciled');
      if (!reconciledSet) return res.status(400).json({ error: 'No fully reconciled variation found' });

      const setDocs = await reconciliationModel.findSetDocs(reconciledSet.id);
      const nodeId = anchorHeld.node_id;

      for (const doc of setDocs) {
        const hd = await reconciliationModel.findHeldDocByDocExecId(doc.document_execution_id);
        if (hd) await reconciliationModel.updateHeldDocStatus(hd.id, 'reconciled');

        const docExec = await documentExecutionModel.findById(doc.document_execution_id);
        if (docExec && docExec.status === 'held' && docExec.workflow_run_id && nodeId) {
          await resumeDocumentExecution(
            doc.document_execution_id,
            nodeId,
            docExec.workflow_run_id,
            hd?.slot_id || null,
          );
        }
      }

      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  },

  // GET /reconciliation-rules/:id/matching-sets/:setId/comparisons
  async listComparisonResults(req, res, next) {
    try {
      const rule = await reconciliationModel.findById(req.params.id);
      if (!rule) return res.status(404).json({ error: 'Not found' });
      if (rule.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const results = await reconciliationModel.findComparisonResults(req.params.setId);
      return res.json(results);
    } catch (err) {
      next(err);
    }
  },

  // POST /reconciliation-rules/:id/matching-sets/:setId/comparisons/:compId/force-reconcile
  async forceReconcileComparison(req, res, next) {
    try {
      const rule = await reconciliationModel.findById(req.params.id);
      if (!rule) return res.status(404).json({ error: 'Not found' });
      if (rule.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      await reconciliationModel.upsertComparisonResult({
        matchingSetId: req.params.setId,
        comparisonRuleId: req.params.compId,
        status: 'force',
      });

      // Check if now fully reconciled
      const set = await reconciliationModel.findMatchingSetById(req.params.setId);
      if (set && set.variation_id) {
        const fullyReconciled = await reconciliationModel.isVariationFullyReconciled(req.params.setId, set.variation_id);
        if (fullyReconciled) {
          await reconciliationModel.updateMatchingSetStatus(req.params.setId, 'reconciled');
          const anchorHeld = await reconciliationModel.findHeldDocByDocExecId(set.anchor_document_execution_id);
          if (anchorHeld) await reconciliationModel.updateHeldDocStatus(anchorHeld.id, 'reconciled');

          if (rule.auto_send_out && anchorHeld) {
            const setDocs = await reconciliationModel.findSetDocs(req.params.setId);
            const nodeId = anchorHeld.node_id;
            for (const doc of setDocs) {
              const hd = await reconciliationModel.findHeldDocByDocExecId(doc.document_execution_id);
              if (hd) await reconciliationModel.updateHeldDocStatus(hd.id, 'reconciled');
              const docExec = await documentExecutionModel.findById(doc.document_execution_id);
              if (docExec && docExec.status === 'held' && docExec.workflow_run_id && nodeId) {
                await resumeDocumentExecution(
                  doc.document_execution_id,
                  nodeId,
                  docExec.workflow_run_id,
                  hd?.slot_id || null,
                );
              }
            }
          }
        }
      }

      const updatedResults = await reconciliationModel.findComparisonResults(req.params.setId);
      return res.json(updatedResults);
    } catch (err) {
      next(err);
    }
  },

  // POST /reconciliation-rules/:id/matching-sets/:setId/rerun-comparisons
  async rerunComparisons(req, res, next) {
    try {
      const rule = await reconciliationModel.findById(req.params.id);
      if (!rule) return res.status(404).json({ error: 'Not found' });
      if (rule.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      const set = await reconciliationModel.findMatchingSetById(req.params.setId);
      if (!set) return res.status(404).json({ error: 'Matching set not found' });

      const variation = rule.variations.find((v) => v.id === set.variation_id);
      if (!variation) return res.status(404).json({ error: 'Variation not found' });

      const allExtractorIds = [rule.anchor_extractor_id, ...rule.target_extractors.map((t) => t.extractor_id)];
      const allExtractors = await Promise.all(
        allExtractorIds.map(async (eid) => {
          const ex = await extractorModel.findById(eid);
          return { id: eid, name: ex?.name || eid };
        })
      );

      const setDocsWithMeta = await reconciliationModel.findSetDocsWithMetadata(req.params.setId);
      await runAndRecordComparisons(req.params.setId, rule, variation, setDocsWithMeta, allExtractors);

      // Check if now fully reconciled
      const fullyReconciled = await reconciliationModel.isVariationFullyReconciled(req.params.setId, variation.id);
      if (fullyReconciled) {
        await reconciliationModel.updateMatchingSetStatus(req.params.setId, 'reconciled');
        const anchorHeld = await reconciliationModel.findHeldDocByDocExecId(set.anchor_document_execution_id);
        if (anchorHeld) await reconciliationModel.updateHeldDocStatus(anchorHeld.id, 'reconciled');
      }

      const updatedResults = await reconciliationModel.findComparisonResults(req.params.setId);
      return res.json(updatedResults);
    } catch (err) {
      next(err);
    }
  },
};

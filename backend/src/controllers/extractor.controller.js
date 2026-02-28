const extractorModel = require('../models/extractor.model');
const documentModel = require('../models/document.model');
const documentExecutionModel = require('../models/documentExecution.model');
const workflowRunModel = require('../models/workflowRun.model');
const storageService = require('../services/storage.service');
const { db } = require('../config/db');
const { resumeDocumentExecution } = require('../services/execution.service');
const { testExtractFromBuffer, generateEmbedding } = require('../services/extractor.service');

function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

async function cleanupDocument(docId, parentDocumentId) {
  const doc = await documentModel.findById(docId);
  if (!doc) return;
  await documentModel.remove(doc.id);
  try {
    const path = doc.file_url.split('/documents/').pop();
    await storageService.remove(path);
  } catch (e) {
    console.error(`Storage cleanup failed for doc ${doc.id}:`, e.message);
  }
  if (parentDocumentId) {
    const sibling = await db('document_executions')
      .whereRaw(`metadata->>'parent_document_id' = ?`, [parentDocumentId])
      .whereNot({ document_id: docId })
      .first();
    if (!sibling) {
      const parent = await documentModel.findById(parentDocumentId);
      if (parent) {
        await documentModel.remove(parent.id);
        try {
          const parentPath = parent.file_url.split('/documents/').pop();
          await storageService.remove(parentPath);
        } catch (e) {
          console.error(`Parent storage cleanup failed for doc ${parent.id}:`, e.message);
        }
      }
    }
  }
}

module.exports = {
  async list(req, res, next) {
    try {
      const extractors = await extractorModel.findByUserId(req.dbUser.id);
      return res.json(extractors);
    } catch (err) {
      next(err);
    }
  },

  async create(req, res, next) {
    try {
      const { name, header_fields, table_types, hold_all } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const extractor = await extractorModel.create({
        userId: req.dbUser.id,
        name,
        holdAll: hold_all || false,
        headerFields: header_fields || [],
        tableTypes: table_types || [],
      });
      return res.status(201).json(extractor);
    } catch (err) {
      next(err);
    }
  },

  async getOne(req, res, next) {
    try {
      const extractor = await extractorModel.findById(req.params.id);
      if (!extractor) return res.status(404).json({ error: 'Not found' });
      if (extractor.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const usage = await extractorModel.findUsage(req.params.id);
      return res.json({ extractor, usage });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const extractor = await extractorModel.findById(req.params.id);
      if (!extractor) return res.status(404).json({ error: 'Not found' });
      if (extractor.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const updated = await extractorModel.update(req.params.id, req.body);
      return res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async remove(req, res, next) {
    try {
      const extractor = await extractorModel.findById(req.params.id);
      if (!extractor) return res.status(404).json({ error: 'Not found' });
      if (extractor.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const usage = await extractorModel.findUsage(req.params.id);
      if (usage.length > 0) {
        return res.status(409).json({ error: 'Cannot delete: extractor is used by workflow nodes', usage });
      }
      // Clean up storage files for training feedback documents before removing the extractor
      const trainingDocs = await extractorModel.findTrainingDocuments(req.params.id);
      for (const doc of trainingDocs) {
        try {
          const path = doc.file_url.split('/documents/').pop();
          await storageService.remove(path);
        } catch (e) {
          console.error(`Storage cleanup failed for training doc ${doc.id}:`, e.message);
        }
        await documentModel.remove(doc.id);
      }
      await extractorModel.remove(req.params.id);
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async listHeld(req, res, next) {
    try {
      const extractor = await extractorModel.findById(req.params.id);
      if (!extractor) return res.status(404).json({ error: 'Not found' });
      if (extractor.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const held = await extractorModel.findHeld(req.params.id);
      return res.json(held);
    } catch (err) {
      next(err);
    }
  },

  async sendOut(req, res, next) {
    try {
      const extractor = await extractorModel.findById(req.params.id);
      if (!extractor) return res.status(404).json({ error: 'Not found' });
      if (extractor.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      const held = await extractorModel.findHeldById(req.params.heldId);
      if (!held || held.extractor_id !== req.params.id) {
        return res.status(404).json({ error: 'Held document not found' });
      }

      const updated = await extractorModel.sendOut(req.params.heldId);

      // Resume execution from the extractor node
      const docExec = await documentExecutionModel.findById(held.document_execution_id);
      if (docExec) {
        // Find the node_id from the execution log
        const run = await workflowRunModel.findById(docExec.workflow_run_id);
        if (run && docExec.current_node_id) {
          resumeDocumentExecution(
            held.document_execution_id,
            docExec.current_node_id,
            docExec.workflow_run_id
          ).catch((err) => console.error('Failed to resume execution after extractor send-out:', err));
        }
      }

      return res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async testExtract(req, res, next) {
    try {
      if (!req.file) return res.status(400).json({ error: 'file is required' });
      const extractor = await extractorModel.findById(req.params.id);
      if (!extractor) return res.status(404).json({ error: 'Not found' });
      if (extractor.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      // Upload file to storage and create a documents record so feedback can reference it.
      // Non-fatal: if storage is not configured, extraction still proceeds without a document_id.
      let docMeta = {};
      try {
        const { url } = await storageService.upload(req.file.buffer, req.file.originalname, req.file.mimetype);
        const doc = await documentModel.create({
          userId: req.dbUser.id,
          fileName: req.file.originalname,
          fileUrl: url,
          fileType: req.file.mimetype,
        });
        docMeta = { document_id: doc.id, document_file_url: url, document_file_name: doc.file_name };
      } catch (uploadErr) {
        console.warn('Test extract: storage upload skipped —', uploadErr.message);
      }

      const result = await testExtractFromBuffer(req.file.buffer, req.file.mimetype, extractor);
      return res.json({ ...result, ...docMeta });
    } catch (err) {
      next(err);
    }
  },

  async createFeedback(req, res, next) {
    try {
      const extractor = await extractorModel.findById(req.params.id);
      if (!extractor) return res.status(404).json({ error: 'Not found' });
      if (extractor.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      const { document_id, target_type, target_id, feedback_text, document_description } = req.body;
      if (!target_type || !target_id || !feedback_text) {
        return res.status(400).json({ error: 'target_type, target_id, and feedback_text are required' });
      }

      // Generate embedding from document_description if provided
      const imageEmbedding = document_description
        ? await generateEmbedding(document_description)
        : null;

      const feedback = await extractorModel.createFeedback({
        extractorId: req.params.id,
        documentId: document_id || null,
        targetType: target_type,
        targetId: target_id,
        feedbackText: feedback_text,
        imageEmbedding,
      });
      return res.status(201).json(feedback);
    } catch (err) {
      next(err);
    }
  },

  async deleteHeld(req, res, next) {
    try {
      const extractor = await extractorModel.findById(req.params.id);
      if (!extractor || extractor.user_id !== req.dbUser.id) return res.status(404).json({ error: 'Not found' });

      const held = await extractorModel.findHeldById(req.params.heldId);
      if (!held || held.extractor_id !== req.params.id) {
        return res.status(404).json({ error: 'Held document not found' });
      }

      const docExec = await documentExecutionModel.findById(held.document_execution_id);
      const meta = docExec ? parseMeta(docExec.metadata) : {};

      await extractorModel.deleteHeld(req.params.heldId, req.params.id);

      // Sync document_execution out of held state so Flow Inspector doesn't show it as held
      await documentExecutionModel.updateStatus(held.document_execution_id, {
        status: 'completed',
        currentNodeId: null,
      });

      if (docExec) {
        await cleanupDocument(docExec.document_id, meta.parent_document_id || null);
      }

      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  },

  async deleteFeedback(req, res, next) {
    try {
      const extractor = await extractorModel.findById(req.params.id);
      if (!extractor || extractor.user_id !== req.dbUser.id) return res.status(404).json({ error: 'Not found' });
      await extractorModel.deleteFeedback(req.params.feedbackId, req.params.id);
      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  },

  async listFeedback(req, res, next) {
    try {
      const extractor = await extractorModel.findById(req.params.id);
      if (!extractor) return res.status(404).json({ error: 'Not found' });
      if (extractor.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const feedback = await extractorModel.findFeedback(req.params.id);
      return res.json(feedback);
    } catch (err) {
      next(err);
    }
  },
};

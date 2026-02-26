const documentFolderModel = require('../models/documentFolder.model');
const documentExecutionModel = require('../models/documentExecution.model');
const documentModel = require('../models/document.model');
const workflowRunModel = require('../models/workflowRun.model');
const storageService = require('../services/storage.service');
const { db } = require('../config/db');
const { resumeDocumentExecution } = require('../services/execution.service');

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
      const folders = await documentFolderModel.findByUserId(req.dbUser.id);
      return res.json(folders);
    } catch (err) {
      next(err);
    }
  },

  async create(req, res, next) {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const folder = await documentFolderModel.create({ userId: req.dbUser.id, name });
      return res.status(201).json(folder);
    } catch (err) {
      next(err);
    }
  },

  async getOne(req, res, next) {
    try {
      const folder = await documentFolderModel.findById(req.params.id);
      if (!folder) return res.status(404).json({ error: 'Not found' });
      if (folder.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const usage = await documentFolderModel.findUsage(req.params.id);
      return res.json({ folder, usage });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const folder = await documentFolderModel.findById(req.params.id);
      if (!folder) return res.status(404).json({ error: 'Not found' });
      if (folder.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const updated = await documentFolderModel.update(req.params.id, req.body);
      return res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async remove(req, res, next) {
    try {
      const folder = await documentFolderModel.findById(req.params.id);
      if (!folder) return res.status(404).json({ error: 'Not found' });
      if (folder.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const usage = await documentFolderModel.findUsage(req.params.id);
      if (usage.length > 0) {
        return res.status(409).json({ error: 'Cannot delete: folder is used by workflow nodes', usage });
      }
      await documentFolderModel.remove(req.params.id);
      return res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async listDocuments(req, res, next) {
    try {
      const folder = await documentFolderModel.findById(req.params.id);
      if (!folder) return res.status(404).json({ error: 'Not found' });
      if (folder.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });
      const held = await documentFolderModel.findHeld(req.params.id);
      return res.json(held);
    } catch (err) {
      next(err);
    }
  },

  async sendOut(req, res, next) {
    try {
      const folder = await documentFolderModel.findById(req.params.id);
      if (!folder) return res.status(404).json({ error: 'Not found' });
      if (folder.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      const held = await documentFolderModel.findHeldById(req.params.heldId);
      if (!held || held.folder_instance_id !== req.params.id) {
        return res.status(404).json({ error: 'Held document not found' });
      }

      const updated = await documentFolderModel.sendOut(req.params.heldId);

      // Resume execution from the folder node
      const docExec = await documentExecutionModel.findById(held.document_execution_id);
      if (docExec) {
        const run = await workflowRunModel.findById(docExec.workflow_run_id);
        if (run) {
          resumeDocumentExecution(held.document_execution_id, held.node_id, docExec.workflow_run_id).catch(
            (err) => console.error('Failed to resume execution after folder send-out:', err)
          );
        }
      }

      return res.json(updated);
    } catch (err) {
      next(err);
    }
  },

  async deleteHeldDoc(req, res, next) {
    try {
      const folder = await documentFolderModel.findById(req.params.id);
      if (!folder || folder.user_id !== req.dbUser.id) return res.status(404).json({ error: 'Not found' });

      const held = await documentFolderModel.findHeldById(req.params.heldId);
      if (!held || held.folder_instance_id !== req.params.id) {
        return res.status(404).json({ error: 'Held document not found' });
      }

      const docExec = await documentExecutionModel.findById(held.document_execution_id);
      const meta = docExec ? parseMeta(docExec.metadata) : {};

      await documentFolderModel.deleteHeld(req.params.heldId);

      if (docExec) {
        await cleanupDocument(docExec.document_id, meta.parent_document_id || null);
      }

      return res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
};

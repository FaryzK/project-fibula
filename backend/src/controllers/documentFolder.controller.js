const documentFolderModel = require('../models/documentFolder.model');
const documentExecutionModel = require('../models/documentExecution.model');
const workflowRunModel = require('../models/workflowRun.model');
const { resumeDocumentExecution } = require('../services/execution.service');

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
};

const workflowModel = require('../models/workflow.model');
const workflowRunModel = require('../models/workflowRun.model');
const documentExecutionModel = require('../models/documentExecution.model');
const executionService = require('../services/execution.service');

module.exports = {
  // POST /api/workflows/:id/runs
  async createRun(req, res, next) {
    try {
      const { id: workflowId } = req.params;
      const { document_ids } = req.body;

      if (!document_ids || !Array.isArray(document_ids) || document_ids.length === 0) {
        return res.status(400).json({ error: 'document_ids must be a non-empty array' });
      }

      const workflow = await workflowModel.findById(workflowId);
      if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
      if (workflow.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      const run = await workflowRunModel.create({ workflowId, triggeredBy: 'MANUAL' });
      await documentExecutionModel.createMany(run.id, document_ids);

      // Fire execution asynchronously — don't await so the response returns immediately
      executionService.runWorkflow(run.id).catch((err) => {
        console.error(`Execution error for run ${run.id}:`, err);
      });

      return res.status(201).json(run);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/workflows/:id/runs
  async listRuns(req, res, next) {
    try {
      const workflow = await workflowModel.findById(req.params.id);
      if (!workflow) return res.status(404).json({ error: 'Workflow not found' });
      if (workflow.user_id !== req.dbUser.id) return res.status(403).json({ error: 'Forbidden' });

      const runs = await workflowRunModel.findByWorkflowId(req.params.id);
      return res.json(runs);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/runs/:runId
  async getRun(req, res, next) {
    try {
      const run = await workflowRunModel.findById(req.params.runId);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      return res.json(run);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/runs/:runId/executions
  async getExecutions(req, res, next) {
    try {
      const run = await workflowRunModel.findById(req.params.runId);
      if (!run) return res.status(404).json({ error: 'Run not found' });

      const executions = await documentExecutionModel.findByRunId(req.params.runId);
      return res.json(executions);
    } catch (err) {
      next(err);
    }
  },

  // GET /api/runs/:runId/node-statuses
  async getNodeStatuses(req, res, next) {
    try {
      const run = await workflowRunModel.findById(req.params.runId);
      if (!run) return res.status(404).json({ error: 'Run not found' });

      const statuses = await documentExecutionModel.getNodeStatusSummary(req.params.runId);
      return res.json(statuses);
    } catch (err) {
      next(err);
    }
  },
};

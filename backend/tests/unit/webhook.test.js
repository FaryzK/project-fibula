process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.DATABASE_URL = 'postgresql://test';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const app = require('../../app');

jest.mock('../../src/config/db', () => ({
  db: jest.fn(),
  supabase: { auth: { getUser: jest.fn() } },
}));

jest.mock('../../src/models/node.model');
jest.mock('../../src/models/workflowRun.model');
jest.mock('../../src/models/documentExecution.model');
jest.mock('../../src/models/document.model');
jest.mock('../../src/services/execution.service', () => ({
  resumeDocumentExecution: jest.fn().mockResolvedValue(),
  runWorkflow: jest.fn().mockResolvedValue(),
}));

const nodeModel = require('../../src/models/node.model');
const workflowRunModel = require('../../src/models/workflowRun.model');
const documentExecutionModel = require('../../src/models/documentExecution.model');
const documentModel = require('../../src/models/document.model');
const { runWorkflow } = require('../../src/services/execution.service');

const FAKE_NODE = {
  id: 'node-webhook-1',
  workflow_id: 'wf-1',
  node_type: 'WEBHOOK',
  name: 'My Webhook',
  config: { description: 'Inbound orders' },
};

const FAKE_RUN = {
  id: 'run-1',
  workflow_id: 'wf-1',
  status: 'running',
};

const FAKE_EXEC = {
  id: 'exec-1',
  workflow_run_id: 'run-1',
  document_id: null,
  status: 'pending',
  metadata: '{}',
};

beforeEach(() => {
  jest.clearAllMocks();
  nodeModel.findById.mockResolvedValue(FAKE_NODE);
  workflowRunModel.create.mockResolvedValue(FAKE_RUN);
  documentExecutionModel.create.mockResolvedValue(FAKE_EXEC);
  documentModel.create.mockResolvedValue(null);
});

describe('Webhook routes', () => {
  describe('POST /api/webhooks/:nodeId/trigger', () => {
    it('returns 404 when node not found', async () => {
      nodeModel.findById.mockResolvedValue(null);
      const res = await request(app)
        .post('/api/webhooks/missing/trigger')
        .send({ foo: 'bar' });
      expect(res.statusCode).toBe(404);
    });

    it('returns 400 when node is not a WEBHOOK type', async () => {
      nodeModel.findById.mockResolvedValue({ ...FAKE_NODE, node_type: 'IF' });
      const res = await request(app)
        .post('/api/webhooks/node-webhook-1/trigger')
        .send({ foo: 'bar' });
      expect(res.statusCode).toBe(400);
    });

    it('accepts JSON payload and triggers workflow (202)', async () => {
      const res = await request(app)
        .post('/api/webhooks/node-webhook-1/trigger')
        .send({ invoiceNumber: 'INV-001', amount: 100 });
      expect(res.statusCode).toBe(202);
      expect(workflowRunModel.create).toHaveBeenCalledWith({
        workflowId: 'wf-1',
        triggeredBy: 'WEBHOOK',
      });
      expect(runWorkflow).toHaveBeenCalledWith('run-1');
    });

    it('accepts empty body and triggers workflow (202)', async () => {
      const res = await request(app)
        .post('/api/webhooks/node-webhook-1/trigger')
        .send();
      expect(res.statusCode).toBe(202);
    });
  });
});

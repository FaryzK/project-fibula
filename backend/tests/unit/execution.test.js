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

jest.mock('../../src/models/workflow.model');
jest.mock('../../src/models/user.model');
jest.mock('../../src/models/document.model');
jest.mock('../../src/models/workflowRun.model');
jest.mock('../../src/models/documentExecution.model');
jest.mock('../../src/models/node.model');
jest.mock('../../src/models/edge.model');
jest.mock('../../src/middleware/dbUser.middleware', () => (req, res, next) => {
  req.dbUser = { id: 'db-uuid-1', supabase_auth_id: 'supabase-uid-1' };
  next();
});
jest.mock('../../src/services/storage.service');
jest.mock('../../src/services/execution.service');

const { supabase } = require('../../src/config/db');
const workflowModel = require('../../src/models/workflow.model');
const userModel = require('../../src/models/user.model');
const documentModel = require('../../src/models/document.model');
const workflowRunModel = require('../../src/models/workflowRun.model');
const documentExecutionModel = require('../../src/models/documentExecution.model');
const nodeModel = require('../../src/models/node.model');
const edgeModel = require('../../src/models/edge.model');
const storageService = require('../../src/services/storage.service');
const executionService = require('../../src/services/execution.service');

const FAKE_USER = { id: 'supabase-uid-1' };
const FAKE_DB_USER = { id: 'db-uuid-1', supabase_auth_id: 'supabase-uid-1' };
const FAKE_WORKFLOW = { id: 'wf-1', user_id: 'db-uuid-1', is_published: false };
const FAKE_WORKFLOW_PUBLISHED = { id: 'wf-1', user_id: 'db-uuid-1', is_published: true };

function authHeaders() {
  return { Authorization: 'Bearer valid-token' };
}

beforeEach(() => {
  jest.clearAllMocks();
  supabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });
  userModel.findBySupabaseId.mockResolvedValue(FAKE_DB_USER);
  workflowModel.findById.mockResolvedValue(FAKE_WORKFLOW);
});

// ─── Document Upload ────────────────────────────────────────────────────────

describe('POST /api/documents/upload', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).post('/api/documents/upload');
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when no file is attached', async () => {
    const res = await request(app)
      .post('/api/documents/upload')
      .set(authHeaders());
    expect(res.statusCode).toBe(400);
  });

  it('uploads a file and returns document record', async () => {
    storageService.upload.mockResolvedValue({ url: 'https://storage.example.com/file.pdf' });
    documentModel.create.mockResolvedValue({
      id: 'doc-1',
      user_id: 'db-uuid-1',
      file_name: 'invoice.pdf',
      file_url: 'https://storage.example.com/file.pdf',
      file_type: 'application/pdf',
    });

    const res = await request(app)
      .post('/api/documents/upload')
      .set(authHeaders())
      .attach('file', Buffer.from('fake pdf content'), { filename: 'invoice.pdf', contentType: 'application/pdf' });

    expect(res.statusCode).toBe(201);
    expect(res.body.file_name).toBe('invoice.pdf');
    expect(res.body.file_url).toBeDefined();
  });
});

// ─── Workflow Runs ──────────────────────────────────────────────────────────

describe('POST /api/workflows/:id/runs', () => {
  it('returns 400 when no document_ids provided', async () => {
    const res = await request(app)
      .post('/api/workflows/wf-1/runs')
      .set(authHeaders())
      .send({});
    expect(res.statusCode).toBe(400);
  });

  it('creates a run and triggers execution (unpublished — no auto exec)', async () => {
    const fakeRun = { id: 'run-1', workflow_id: 'wf-1', status: 'running', triggered_by: 'MANUAL' };
    workflowRunModel.create.mockResolvedValue(fakeRun);
    documentExecutionModel.createMany.mockResolvedValue([
      { id: 'de-1', workflow_run_id: 'run-1', document_id: 'doc-1', status: 'pending' },
    ]);
    executionService.runWorkflow.mockResolvedValue();

    const res = await request(app)
      .post('/api/workflows/wf-1/runs')
      .set(authHeaders())
      .send({ document_ids: ['doc-1'] });

    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe('run-1');
    expect(executionService.runWorkflow).toHaveBeenCalledWith('run-1');
  });

  it('returns 404 when workflow not found', async () => {
    workflowModel.findById.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/workflows/missing/runs')
      .set(authHeaders())
      .send({ document_ids: ['doc-1'] });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/workflows/:id/runs', () => {
  it('returns list of runs for a workflow', async () => {
    workflowRunModel.findByWorkflowId.mockResolvedValue([
      { id: 'run-1', workflow_id: 'wf-1', status: 'completed' },
    ]);
    const res = await request(app).get('/api/workflows/wf-1/runs').set(authHeaders());
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /api/runs/:runId', () => {
  it('returns a single run', async () => {
    workflowRunModel.findById.mockResolvedValue({ id: 'run-1', status: 'completed' });
    const res = await request(app).get('/api/runs/run-1').set(authHeaders());
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe('run-1');
  });

  it('returns 404 when run not found', async () => {
    workflowRunModel.findById.mockResolvedValue(null);
    const res = await request(app).get('/api/runs/missing').set(authHeaders());
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /api/runs/:runId/executions', () => {
  it('returns document executions for a run', async () => {
    workflowRunModel.findById.mockResolvedValue({ id: 'run-1' });
    documentExecutionModel.findByRunId.mockResolvedValue([
      { id: 'de-1', workflow_run_id: 'run-1', document_id: 'doc-1', status: 'completed' },
      { id: 'de-2', workflow_run_id: 'run-1', document_id: 'doc-2', status: 'processing' },
    ]);
    const res = await request(app).get('/api/runs/run-1/executions').set(authHeaders());
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

// ─── Node Execution Status (for canvas overlay) ─────────────────────────────

describe('GET /api/runs/:runId/node-statuses', () => {
  it('returns per-node status summary for the run', async () => {
    workflowRunModel.findById.mockResolvedValue({ id: 'run-1' });
    documentExecutionModel.getNodeStatusSummary.mockResolvedValue([
      { node_id: 'n-1', status: 'completed', count: 3 },
      { node_id: 'n-2', status: 'processing', count: 1 },
    ]);
    const res = await request(app).get('/api/runs/run-1/node-statuses').set(authHeaders());
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

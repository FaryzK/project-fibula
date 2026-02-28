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
jest.mock('../../src/models/node.model');
jest.mock('../../src/models/edge.model');
jest.mock('../../src/models/documentExecution.model');
jest.mock('../../src/middleware/dbUser.middleware', () => (req, res, next) => {
  req.dbUser = { id: 'db-uuid-1', supabase_auth_id: 'supabase-uid-1' };
  next();
});

const { supabase } = require('../../src/config/db');
const workflowModel = require('../../src/models/workflow.model');
const userModel = require('../../src/models/user.model');
const nodeModel = require('../../src/models/node.model');
const edgeModel = require('../../src/models/edge.model');
const documentExecutionModel = require('../../src/models/documentExecution.model');

const FAKE_USER = { id: 'supabase-uid-1' };
const FAKE_DB_USER = { id: 'db-uuid-1', supabase_auth_id: 'supabase-uid-1' };
const FAKE_WORKFLOW = { id: 'wf-1', user_id: 'db-uuid-1' };

function authHeaders() {
  return { Authorization: 'Bearer valid-token' };
}

beforeEach(() => {
  jest.clearAllMocks();
  supabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });
  userModel.findBySupabaseId.mockResolvedValue(FAKE_DB_USER);
  workflowModel.findById.mockResolvedValue(FAKE_WORKFLOW);
  documentExecutionModel.countHeldAtNode.mockResolvedValue(0);
  documentExecutionModel.orphanHeldDocs.mockResolvedValue();
});

describe('Node routes', () => {
  describe('GET /api/workflows/:id/nodes', () => {
    it('returns nodes for a workflow', async () => {
      nodeModel.findByWorkflowId.mockResolvedValue([
        { id: 'n-1', node_type: 'MANUAL_UPLOAD', name: 'Upload', position_x: 0, position_y: 0 },
      ]);
      const res = await request(app).get('/api/workflows/wf-1/nodes').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('POST /api/workflows/:id/nodes', () => {
    it('creates a node', async () => {
      const created = { id: 'n-new', node_type: 'IF', name: 'IF', position_x: 100, position_y: 50 };
      nodeModel.create.mockResolvedValue(created);
      const res = await request(app)
        .post('/api/workflows/wf-1/nodes')
        .set(authHeaders())
        .send({ node_type: 'IF', name: 'IF', position_x: 100, position_y: 50 });
      expect(res.statusCode).toBe(201);
      expect(res.body.node_type).toBe('IF');
    });

    it('returns 400 when node_type is missing', async () => {
      const res = await request(app)
        .post('/api/workflows/wf-1/nodes')
        .set(authHeaders())
        .send({ name: 'No type' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/workflows/:id/nodes/:nodeId', () => {
    it('updates a node position and name', async () => {
      nodeModel.update.mockResolvedValue({ id: 'n-1', position_x: 200, position_y: 100, name: 'Renamed' });
      const res = await request(app)
        .patch('/api/workflows/wf-1/nodes/n-1')
        .set(authHeaders())
        .send({ position_x: 200, position_y: 100, name: 'Renamed' });
      expect(res.statusCode).toBe(200);
      expect(res.body.position_x).toBe(200);
    });
  });

  describe('DELETE /api/workflows/:id/nodes/:nodeId', () => {
    it('deletes a node', async () => {
      nodeModel.remove.mockResolvedValue();
      const res = await request(app)
        .delete('/api/workflows/wf-1/nodes/n-1')
        .set(authHeaders());
      expect(res.statusCode).toBe(204);
    });
  });
});

describe('Edge routes', () => {
  describe('GET /api/workflows/:id/edges', () => {
    it('returns edges for a workflow', async () => {
      edgeModel.findByWorkflowId.mockResolvedValue([
        { id: 'e-1', source_node_id: 'n-1', target_node_id: 'n-2', source_port: 'default', target_port: 'default' },
      ]);
      const res = await request(app).get('/api/workflows/wf-1/edges').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('POST /api/workflows/:id/edges', () => {
    it('creates an edge', async () => {
      const created = { id: 'e-new', source_node_id: 'n-1', target_node_id: 'n-2', source_port: 'default', target_port: 'default' };
      edgeModel.create.mockResolvedValue(created);
      const res = await request(app)
        .post('/api/workflows/wf-1/edges')
        .set(authHeaders())
        .send({ source_node_id: 'n-1', target_node_id: 'n-2', source_port: 'default', target_port: 'default' });
      expect(res.statusCode).toBe(201);
      expect(res.body.source_node_id).toBe('n-1');
    });

    it('returns 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/workflows/wf-1/edges')
        .set(authHeaders())
        .send({ source_node_id: 'n-1' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/workflows/:id/edges/:edgeId', () => {
    it('deletes an edge', async () => {
      edgeModel.remove.mockResolvedValue();
      const res = await request(app)
        .delete('/api/workflows/wf-1/edges/e-1')
        .set(authHeaders());
      expect(res.statusCode).toBe(204);
    });
  });
});

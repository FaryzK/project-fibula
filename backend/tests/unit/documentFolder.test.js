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

jest.mock('../../src/models/documentFolder.model');
jest.mock('../../src/models/user.model');
jest.mock('../../src/models/documentExecution.model');
jest.mock('../../src/models/workflowRun.model');
jest.mock('../../src/services/execution.service', () => ({
  resumeDocumentExecution: jest.fn().mockResolvedValue(),
  runWorkflow: jest.fn().mockResolvedValue(),
}));
jest.mock('../../src/middleware/dbUser.middleware', () => (req, res, next) => {
  req.dbUser = { id: 'db-uuid-1' };
  next();
});

const { supabase } = require('../../src/config/db');
const documentFolderModel = require('../../src/models/documentFolder.model');
const userModel = require('../../src/models/user.model');
const documentExecutionModel = require('../../src/models/documentExecution.model');

const FAKE_USER = { id: 'supabase-uid-1' };
const FAKE_DB_USER = { id: 'db-uuid-1' };

const FAKE_FOLDER = {
  id: 'folder-1',
  user_id: 'db-uuid-1',
  name: 'Review Queue',
  held_count: 0,
};

const FAKE_HELD = {
  id: 'held-1',
  folder_instance_id: 'folder-1',
  document_execution_id: 'exec-1',
  file_name: 'invoice.pdf',
  file_url: 'https://example.com/invoice.pdf',
  metadata: '{}',
  workflow_id: 'wf-1',
  workflow_name: 'My Workflow',
  node_id: 'node-1',
  node_name: 'Review Queue Node',
  arrived_at: '2024-06-01T00:00:00Z',
  status: 'held',
};

function authHeaders() {
  return { Authorization: 'Bearer valid-token' };
}

beforeEach(() => {
  jest.clearAllMocks();
  supabase.auth.getUser.mockResolvedValue({ data: { user: FAKE_USER }, error: null });
  userModel.findBySupabaseId.mockResolvedValue(FAKE_DB_USER);
  documentExecutionModel.findById.mockResolvedValue(null);
});

describe('Document Folder routes', () => {
  describe('GET /api/document-folders', () => {
    it('returns 401 without auth', async () => {
      const res = await request(app).get('/api/document-folders');
      expect(res.statusCode).toBe(401);
    });

    it('returns list of folders with held_count', async () => {
      documentFolderModel.findByUserId.mockResolvedValue([FAKE_FOLDER]);
      const res = await request(app).get('/api/document-folders').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Review Queue');
    });
  });

  describe('POST /api/document-folders', () => {
    it('creates a folder', async () => {
      documentFolderModel.create.mockResolvedValue(FAKE_FOLDER);
      const res = await request(app)
        .post('/api/document-folders')
        .set(authHeaders())
        .send({ name: 'Review Queue' });
      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Review Queue');
    });

    it('returns 400 when name is missing', async () => {
      const res = await request(app).post('/api/document-folders').set(authHeaders()).send({});
      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/document-folders/:id', () => {
    it('returns folder with usage info', async () => {
      documentFolderModel.findById.mockResolvedValue(FAKE_FOLDER);
      documentFolderModel.findUsage.mockResolvedValue([
        { workflow_id: 'wf-1', workflow_name: 'My Workflow', node_id: 'n-1', node_name: 'Review' },
      ]);
      const res = await request(app).get('/api/document-folders/folder-1').set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body.folder.id).toBe('folder-1');
      expect(res.body.usage).toHaveLength(1);
    });

    it('returns 404 when not found', async () => {
      documentFolderModel.findById.mockResolvedValue(null);
      const res = await request(app).get('/api/document-folders/missing').set(authHeaders());
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/document-folders/:id', () => {
    it('updates a folder', async () => {
      documentFolderModel.findById.mockResolvedValue(FAKE_FOLDER);
      documentFolderModel.update.mockResolvedValue({ ...FAKE_FOLDER, name: 'Updated' });
      const res = await request(app)
        .patch('/api/document-folders/folder-1')
        .set(authHeaders())
        .send({ name: 'Updated' });
      expect(res.statusCode).toBe(200);
      expect(res.body.name).toBe('Updated');
    });
  });

  describe('DELETE /api/document-folders/:id', () => {
    it('deletes when no nodes are using it', async () => {
      documentFolderModel.findById.mockResolvedValue(FAKE_FOLDER);
      documentFolderModel.findUsage.mockResolvedValue([]);
      documentFolderModel.remove.mockResolvedValue();
      const res = await request(app).delete('/api/document-folders/folder-1').set(authHeaders());
      expect(res.statusCode).toBe(204);
    });

    it('returns 409 when nodes are using it', async () => {
      documentFolderModel.findById.mockResolvedValue(FAKE_FOLDER);
      documentFolderModel.findUsage.mockResolvedValue([{ workflow_id: 'wf-1', node_id: 'n-1', node_name: 'X' }]);
      const res = await request(app).delete('/api/document-folders/folder-1').set(authHeaders());
      expect(res.statusCode).toBe(409);
    });
  });

  describe('GET /api/document-folders/:id/documents', () => {
    it('returns held documents for the folder', async () => {
      documentFolderModel.findById.mockResolvedValue(FAKE_FOLDER);
      documentFolderModel.findHeld.mockResolvedValue([FAKE_HELD]);
      const res = await request(app)
        .get('/api/document-folders/folder-1/documents')
        .set(authHeaders());
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].file_name).toBe('invoice.pdf');
    });

    it('returns 404 when folder not found', async () => {
      documentFolderModel.findById.mockResolvedValue(null);
      const res = await request(app)
        .get('/api/document-folders/missing/documents')
        .set(authHeaders());
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/document-folders/:id/documents/:heldId/send-out', () => {
    it('sends out a held document', async () => {
      documentFolderModel.findById.mockResolvedValue(FAKE_FOLDER);
      documentFolderModel.findHeldById.mockResolvedValue({ ...FAKE_HELD, folder_instance_id: 'folder-1' });
      documentFolderModel.sendOut.mockResolvedValue({ ...FAKE_HELD, status: 'sent_out' });
      const res = await request(app)
        .post('/api/document-folders/folder-1/documents/held-1/send-out')
        .set(authHeaders());
      expect(res.statusCode).toBe(200);
    });

    it('returns 404 when held doc not found', async () => {
      documentFolderModel.findById.mockResolvedValue(FAKE_FOLDER);
      documentFolderModel.findHeldById.mockResolvedValue(null);
      const res = await request(app)
        .post('/api/document-folders/folder-1/documents/missing/send-out')
        .set(authHeaders());
      expect(res.statusCode).toBe(404);
    });
  });
});

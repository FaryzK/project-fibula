process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.DATABASE_URL = 'postgresql://test';
process.env.OPENAI_API_KEY = 'test-openai-key';
process.env.NODE_ENV = 'test';

// Unit tests for the HTTP node logic in execution.service
// We test processNode indirectly by mocking axios.

jest.mock('axios');
jest.mock('../../src/config/db', () => ({
  db: jest.fn(),
  supabase: { auth: { getUser: jest.fn() } },
}));
jest.mock('../../src/models/workflowRun.model');
jest.mock('../../src/models/documentExecution.model');
jest.mock('../../src/models/document.model');
jest.mock('../../src/models/node.model');
jest.mock('../../src/models/edge.model');
jest.mock('../../src/models/splittingInstruction.model');
jest.mock('../../src/models/categorisationPrompt.model');
jest.mock('../../src/models/documentFolder.model');
jest.mock('../../src/models/extractor.model');
jest.mock('../../src/models/dataMapper.model');
jest.mock('../../src/services/splitting.service');
jest.mock('../../src/services/categorisation.service');
jest.mock('../../src/services/extractor.service');
jest.mock('../../src/services/dataMapper.service');
jest.mock('../../src/services/reconciliation.service');

const axios = require('axios');

// Access processNode by loading the module and running runWorkflow in a controlled way.
// Easier to test via runWorkflow with a minimal single-node graph.
const workflowRunModel = require('../../src/models/workflowRun.model');
const documentExecutionModel = require('../../src/models/documentExecution.model');
const nodeModel = require('../../src/models/node.model');
const edgeModel = require('../../src/models/edge.model');
const { runWorkflow } = require('../../src/services/execution.service');

const FAKE_NODE = {
  id: 'n1',
  node_type: 'HTTP',
  config: {
    url: 'https://example.com/api',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { invoiceNumber: '{{ $document.invoiceNumber }}', amount: '$document.amount' },
  },
};

const FAKE_RUN = { id: 'run-1', workflow_id: 'wf-1', status: 'running' };
const FAKE_EXEC = {
  id: 'exec-1',
  workflow_run_id: 'run-1',
  document_id: 'doc-1',
  status: 'pending',
  metadata: JSON.stringify({ document_id: 'doc-1', invoiceNumber: 'INV-001', amount: 99.5 }),
};
const FAKE_LOG = { id: 'log-1' };

beforeEach(() => {
  jest.clearAllMocks();
  workflowRunModel.findById.mockResolvedValue(FAKE_RUN);
  documentExecutionModel.findByRunId.mockResolvedValue([FAKE_EXEC]);
  nodeModel.findByWorkflowId.mockResolvedValue([FAKE_NODE]);
  edgeModel.findByWorkflowId.mockResolvedValue([]); // no outgoing edges
  documentExecutionModel.createLog.mockResolvedValue(FAKE_LOG);
  documentExecutionModel.updateLog.mockResolvedValue(FAKE_LOG);
  documentExecutionModel.updateStatus.mockResolvedValue(FAKE_EXEC);
  workflowRunModel.updateStatus.mockResolvedValue(FAKE_RUN);
});

describe('HTTP node execution', () => {
  it('makes outbound request and continues on 2xx', async () => {
    axios.mockResolvedValue({ status: 200, data: { ok: true } });
    await runWorkflow('run-1');

    expect(axios).toHaveBeenCalledWith(expect.objectContaining({
      method: 'POST',
      url: 'https://example.com/api',
      data: { invoiceNumber: 'INV-001', amount: 99.5 },
    }));

    // Log should be completed
    expect(documentExecutionModel.updateLog).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('marks execution failed on non-2xx response', async () => {
    axios.mockResolvedValue({ status: 422, data: { error: 'Unprocessable' } });
    await runWorkflow('run-1');

    expect(documentExecutionModel.updateLog).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('marks execution failed on network error', async () => {
    axios.mockRejectedValue(new Error('ECONNREFUSED'));
    await runWorkflow('run-1');

    expect(documentExecutionModel.updateLog).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('resolves expressions in headers and body', async () => {
    axios.mockResolvedValue({ status: 200, data: {} });

    const nodeWithExprs = {
      ...FAKE_NODE,
      config: {
        url: '$document.webhook_url',
        method: 'POST',
        headers: { 'X-Invoice': '$document.invoiceNumber' },
        body: { total: '{{ $document.amount * 2 }}' },
      },
    };
    nodeModel.findByWorkflowId.mockResolvedValue([nodeWithExprs]);

    await runWorkflow('run-1');

    expect(axios).toHaveBeenCalledWith(expect.objectContaining({
      url: undefined, // $document.webhook_url is not in metadata so resolves to undefined
      headers: { 'X-Invoice': 'INV-001' },
      data: { total: 199 },
    }));
  });
});

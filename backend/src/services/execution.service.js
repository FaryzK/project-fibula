const workflowRunModel = require('../models/workflowRun.model');
const workflowModel = require('../models/workflow.model');
const documentExecutionModel = require('../models/documentExecution.model');
const documentModel = require('../models/document.model');
const nodeModel = require('../models/node.model');
const edgeModel = require('../models/edge.model');
const splittingInstructionModel = require('../models/splittingInstruction.model');
const categorisationPromptModel = require('../models/categorisationPrompt.model');
const documentFolderModel = require('../models/documentFolder.model');
const extractorModel = require('../models/extractor.model');
const dataMapperModel = require('../models/dataMapper.model');
const splittingService = require('./splitting.service');
const categorisationService = require('./categorisation.service');
const extractorService = require('./extractor.service');
const dataMapperService = require('./dataMapper.service');
const reconciliationService = require('./reconciliation.service');
const { evaluateConditions, applyAssignments, resolveValue } = require('../utils/expression');
const axios = require('axios');

/**
 * Safe metadata parser — handles both raw JSON strings (TEXT column) and
 * already-parsed objects (JSONB column auto-parsed by the Postgres driver).
 */
function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  return JSON.parse(raw);
}

/**
 * Build an adjacency map: { sourceNodeId: [{ targetNodeId, sourcePort, targetPort }] }
 */
function buildGraph(edges) {
  const graph = {};
  for (const edge of edges) {
    if (!graph[edge.source_node_id]) graph[edge.source_node_id] = [];
    graph[edge.source_node_id].push({
      targetNodeId: edge.target_node_id,
      sourcePort: edge.source_port,
      targetPort: edge.target_port,
    });
  }
  return graph;
}

function findEntryNodes(nodes, edges) {
  const hasIncoming = new Set(edges.map((e) => e.target_node_id));
  return nodes.filter((n) => !hasIncoming.has(n.id));
}

/**
 * Process a single node.
 * Returns one of:
 *   { type: 'continue', outputMetadata, outputPort, setDocExecIds? }
 *   { type: 'fanout', subDocuments: [{file_url, file_name, file_type, label}] }
 *   { type: 'hold' }
 */
async function processNode(node, metadata, workflowRunId, docExecutionId, workflowId) {
  const config = node.config || {};

  switch (node.node_type) {
    case 'SPLITTING': {
      if (!config.splitting_instruction_id) {
        return { type: 'continue', outputMetadata: { ...metadata }, outputPort: 'default' };
      }
      const instruction = await splittingInstructionModel.findById(config.splitting_instruction_id);
      if (!instruction) {
        throw new Error(`Splitting instruction ${config.splitting_instruction_id} not found`);
      }
      const document = await documentModel.findById(metadata.document_id);
      if (!document) {
        throw new Error(`Document ${metadata.document_id} not found`);
      }
      const subDocuments = await splittingService.processDocument(document, instruction.instructions);
      return { type: 'fanout', subDocuments };
    }

    case 'CATEGORISATION': {
      if (!config.categorisation_prompt_id) {
        return { type: 'continue', outputMetadata: { ...metadata }, outputPort: 'default' };
      }
      const prompt = await categorisationPromptModel.findById(config.categorisation_prompt_id);
      if (!prompt || !prompt.labels || prompt.labels.length === 0) {
        throw new Error(`Categorisation prompt ${config.categorisation_prompt_id} not found or has no labels`);
      }
      const document = await documentModel.findById(metadata.document_id);
      if (!document) {
        throw new Error(`Document ${metadata.document_id} not found`);
      }
      const category = await categorisationService.classifyDocument(document, prompt.labels);
      return {
        type: 'continue',
        outputMetadata: { ...metadata, category },
        outputPort: category,
      };
    }

    case 'IF': {
      const conditions = config.conditions || [];
      const logic = config.logic || 'AND';
      const result = evaluateConditions(conditions, logic, metadata);
      return {
        type: 'continue',
        outputMetadata: { ...metadata },
        outputPort: result ? 'true' : 'false',
      };
    }

    case 'SWITCH': {
      const cases = config.cases || [];
      for (const switchCase of cases) {
        const condition = {
          field: switchCase.field,
          operator: switchCase.operator,
          value: switchCase.value,
          type: switchCase.type,
        };
        if (evaluateConditions([condition], 'AND', metadata)) {
          return {
            type: 'continue',
            outputMetadata: { ...metadata },
            outputPort: switchCase.id,
          };
        }
      }
      return { type: 'continue', outputMetadata: { ...metadata }, outputPort: 'fallback' };
    }

    case 'SET_VALUE': {
      const assignments = config.assignments || [];
      const enrichedMetadata = applyAssignments(assignments, metadata);
      return { type: 'continue', outputMetadata: enrichedMetadata, outputPort: 'default' };
    }

    case 'DOCUMENT_FOLDER': {
      if (!config.folder_instance_id) {
        return { type: 'continue', outputMetadata: { ...metadata }, outputPort: 'default' };
      }
      await documentFolderModel.createHeld({
        folderInstanceId: config.folder_instance_id,
        documentExecutionId: docExecutionId,
        workflowId,
        nodeId: node.id,
      });
      return { type: 'hold' };
    }

    case 'EXTRACTOR': {
      if (!config.extractor_id) {
        return { type: 'continue', outputMetadata: { ...metadata }, outputPort: 'default' };
      }
      const extractor = await extractorModel.findById(config.extractor_id);
      if (!extractor) throw new Error(`Extractor ${config.extractor_id} not found`);

      const document = await documentModel.findById(metadata.document_id);
      if (!document) throw new Error(`Document ${metadata.document_id} not found`);

      const extracted = await extractorService.extractData(document, extractor);
      const enrichedMetadata = {
        ...metadata,
        header: extracted.header,
        tables: extracted.tables,
        _extractor_id: extractor.id,
        _extractor_name: extractor.name,
      };

      const isMissingMandatory = extractorService.hasMissingMandatory(extractor, extracted);
      const shouldHold = extractor.hold_all || isMissingMandatory;
      if (shouldHold) {
        const heldReason = extractor.hold_all ? 'hold_all' : 'missing_mandatory';
        await extractorModel.createHeld({ extractorId: extractor.id, documentExecutionId: docExecutionId, heldReason });
        await documentExecutionModel.updateStatus(docExecutionId, { metadata: enrichedMetadata });
        return { type: 'hold' };
      }

      return { type: 'continue', outputMetadata: enrichedMetadata, outputPort: 'default' };
    }

    case 'DATA_MAPPER': {
      if (!config.rule_id) {
        return { type: 'continue', outputMetadata: { ...metadata }, outputPort: 'default' };
      }
      const rule = await dataMapperModel.findRuleById(config.rule_id);
      if (!rule) throw new Error(`Data map rule ${config.rule_id} not found`);
      const enrichedMetadata = await dataMapperService.applyRule(rule, metadata);
      return { type: 'continue', outputMetadata: enrichedMetadata, outputPort: 'default' };
    }

    case 'RECONCILIATION': {
      if (!config.reconciliation_rule_id) {
        return { type: 'continue', outputMetadata: { ...metadata }, outputPort: 'default' };
      }
      const result = await reconciliationService.processDocument({
        ruleId: config.reconciliation_rule_id,
        docExecutionId,
        metadata,
        workflowId,
        nodeId: node.id,
      });
      return result;
    }

    case 'HTTP': {
      const url = resolveValue(config.url, metadata);
      const method = (config.method || 'POST').toUpperCase();

      // Resolve headers
      const resolvedHeaders = {};
      for (const [k, v] of Object.entries(config.headers || {})) {
        resolvedHeaders[k] = resolveValue(v, metadata);
      }

      // Resolve body (recursively resolve string values within JSON body)
      function resolveBody(obj) {
        if (typeof obj === 'string') return resolveValue(obj, metadata);
        if (Array.isArray(obj)) return obj.map(resolveBody);
        if (obj && typeof obj === 'object') {
          const out = {};
          for (const [k, v] of Object.entries(obj)) out[k] = resolveBody(v);
          return out;
        }
        return obj;
      }
      const resolvedBody = config.body ? resolveBody(config.body) : undefined;

      let responseStatus;
      let responseBody;
      try {
        const response = await axios({
          method,
          url,
          headers: resolvedHeaders,
          data: resolvedBody,
          validateStatus: null, // don't throw on non-2xx
        });
        responseStatus = response.status;
        responseBody = response.data;

        if (responseStatus < 200 || responseStatus >= 300) {
          throw new Error(`HTTP ${responseStatus}: ${JSON.stringify(responseBody)}`);
        }
      } catch (err) {
        throw new Error(`HTTP node request failed: ${err.message}`);
      }

      return {
        type: 'continue',
        outputMetadata: {
          ...metadata,
          _http_response: { status: responseStatus, body: responseBody },
        },
        outputPort: 'default',
      };
    }

    default:
      return { type: 'continue', outputMetadata: { ...metadata }, outputPort: 'default' };
  }
}

/**
 * Run a single document execution through the workflow graph.
 * startQueue: optional array of { nodeId, metadata } to override entry nodes.
 * pendingExecQueue is mutable — fan-outs and reconciliation push new items into it.
 */
async function runDocument(docExecution, nodes, edges, graph, workflowRunId, pendingExecQueue, startQueue = null) {
  const nodeMap = Object.fromEntries(nodes.map((n) => [n.id, n]));

  let workflowId = null;
  let workflowUserId = null;
  try {
    const run = await workflowRunModel.findById(workflowRunId);
    workflowId = run ? run.workflow_id : null;
    if (workflowId) {
      const wf = await workflowModel.findById(workflowId);
      workflowUserId = wf ? wf.user_id : null;
    }
  } catch (_) { /* pass */ }

  const initialMetadata = { ...parseMeta(docExecution.metadata) };
  // Seed document_id from the execution row so SPLITTING/EXTRACTOR can read it
  if (docExecution.document_id && !initialMetadata.document_id) {
    initialMetadata.document_id = docExecution.document_id;
  }

  const entryNodes = docExecution.start_node_id
    ? [{ id: docExecution.start_node_id }]
    : findEntryNodes(nodes, edges);

  const queue = startQueue
    ? startQueue.map((item) => ({ ...item }))
    : entryNodes.map((n) => ({ nodeId: n.id, metadata: initialMetadata }));

  while (queue.length > 0) {
    const { nodeId, metadata } = queue.shift();
    const node = nodeMap[nodeId];
    if (!node) continue;

    const log = await documentExecutionModel.createLog({
      documentExecutionId: docExecution.id,
      nodeId,
      status: 'processing',
      inputMetadata: metadata,
    });

    await documentExecutionModel.updateStatus(docExecution.id, {
      status: 'processing',
      currentNodeId: nodeId,
    });

    let result;
    let logStatus = 'completed';
    let logError = null;

    try {
      result = await processNode(node, metadata, workflowRunId, docExecution.id, workflowId);
    } catch (err) {
      logStatus = 'failed';
      logError = err.message;
      result = { type: 'continue', outputMetadata: metadata, outputPort: 'default' };
    }

    if (result.type === 'hold') {
      await documentExecutionModel.updateLog(log.id, { status: 'held', outputMetadata: metadata });
      await documentExecutionModel.updateStatus(docExecution.id, { status: 'held', currentNodeId: nodeId });
      return;
    }

    await documentExecutionModel.updateLog(log.id, {
      status: logStatus,
      outputMetadata: result.outputMetadata || metadata,
      error: logError,
    });

    if (logStatus === 'failed') {
      await documentExecutionModel.updateStatus(docExecution.id, { status: 'failed', currentNodeId: null });
      return;
    }

    if (result.type === 'fanout') {
      await documentExecutionModel.updateStatus(docExecution.id, {
        status: 'completed',
        currentNodeId: null,
      });

      for (const subDoc of result.subDocuments) {
        const newDoc = await documentModel.create({
          userId: workflowUserId,
          fileName: subDoc.file_name,
          fileUrl: subDoc.file_url,
          fileType: subDoc.file_type,
        });

        const newExec = await documentExecutionModel.createMany(workflowRunId, [newDoc.id]);

        const nextNodes = (graph[nodeId] || []).map((e) => ({
          nodeId: e.targetNodeId,
          metadata: { document_id: newDoc.id, label: subDoc.label, parent_document_id: metadata.document_id },
        }));

        pendingExecQueue.push({
          docExecution: newExec[0],
          startQueue: nextNodes,
        });
      }
      return;
    }

    // Normal continue — follow output port edges
    const { outputMetadata, outputPort, setDocExecIds } = result;
    const nextEdges = (graph[nodeId] || []).filter(
      (e) => e.sourcePort === outputPort || outputPort === 'default'
    );
    for (const edge of nextEdges) {
      queue.push({ nodeId: edge.targetNodeId, metadata: outputMetadata });
    }

    // For reconciliation: also advance other docs in the matching set
    if (setDocExecIds && setDocExecIds.length > 0) {
      for (const otherId of setDocExecIds) {
        const otherExec = await documentExecutionModel.findById(otherId);
        if (otherExec && otherExec.status === 'held') {
          const otherMeta = parseMeta(otherExec.metadata);
          const startQ = nextEdges.map((e) => ({ nodeId: e.targetNodeId, metadata: otherMeta }));
          pendingExecQueue.push({ docExecution: otherExec, startQueue: startQ });
        }
      }
    }
  }

  await documentExecutionModel.updateStatus(docExecution.id, {
    status: 'completed',
    currentNodeId: null,
  });
}

/**
 * Main entry point. Handles fan-outs from splitting nodes.
 */
async function runWorkflow(workflowRunId) {
  const run = await workflowRunModel.findById(workflowRunId);
  if (!run) throw new Error(`Run ${workflowRunId} not found`);

  const [nodes, edges, initialExecs] = await Promise.all([
    nodeModel.findByWorkflowId(run.workflow_id),
    edgeModel.findByWorkflowId(run.workflow_id),
    documentExecutionModel.findByRunId(workflowRunId),
  ]);

  const graph = buildGraph(edges);

  const pendingExecQueue = initialExecs.map((e) => ({ docExecution: e, startQueue: null }));

  while (pendingExecQueue.length > 0) {
    const { docExecution, startQueue } = pendingExecQueue.shift();
    await runDocument(docExecution, nodes, edges, graph, workflowRunId, pendingExecQueue, startQueue);
  }

  const allExecs = await documentExecutionModel.findByRunId(workflowRunId);
  const anyFailed = allExecs.some((e) => e.status === 'failed');
  const anyRunning = allExecs.some((e) => ['pending', 'processing'].includes(e.status));
  const status = anyFailed ? 'failed' : anyRunning ? 'running' : 'completed';
  await workflowRunModel.updateStatus(workflowRunId, status, new Date());
}

/**
 * Resume a single document execution from a specific node (after hold is released).
 */
async function resumeDocumentExecution(docExecutionId, fromNodeId, workflowRunId) {
  const [docExec, run] = await Promise.all([
    documentExecutionModel.findById(docExecutionId),
    workflowRunModel.findById(workflowRunId),
  ]);
  if (!docExec || !run) return;

  const [nodes, edges] = await Promise.all([
    nodeModel.findByWorkflowId(run.workflow_id),
    edgeModel.findByWorkflowId(run.workflow_id),
  ]);

  const graph = buildGraph(edges);
  const meta = parseMeta(docExec.metadata);

  const startQueue = (graph[fromNodeId] || []).map((e) => ({
    nodeId: e.targetNodeId,
    metadata: meta,
  }));

  await documentExecutionModel.updateStatus(docExecutionId, { status: 'processing' });

  const pendingExecQueue = [];
  await runDocument(docExec, nodes, edges, graph, workflowRunId, pendingExecQueue, startQueue);

  while (pendingExecQueue.length > 0) {
    const { docExecution, startQueue: subStartQueue } = pendingExecQueue.shift();
    await runDocument(docExecution, nodes, edges, graph, workflowRunId, pendingExecQueue, subStartQueue);
  }
}

module.exports = { runWorkflow, resumeDocumentExecution };

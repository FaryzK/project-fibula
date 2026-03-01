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
const storageService = require('./storage.service');
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
async function processNode(node, metadata, workflowRunId, docExecutionId, workflowId, userId) {
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
      const dmRuleId = config.rule_id || config.data_map_rule_id;
      if (!dmRuleId) {
        return { type: 'continue', outputMetadata: { ...metadata }, outputPort: 'default' };
      }
      const rule = await dataMapperModel.findRuleById(dmRuleId);
      if (!rule) throw new Error(`Data map rule ${dmRuleId} not found`);
      const enrichedMetadata = await dataMapperService.applyRule(rule, metadata);
      return { type: 'continue', outputMetadata: enrichedMetadata, outputPort: 'default' };
    }

    case 'RECONCILIATION': {
      const recon_inputs = config.recon_inputs || [];
      if (recon_inputs.length === 0) {
        return { type: 'continue', outputMetadata: { ...metadata }, outputPort: 'default' };
      }
      const extractorId = metadata._extractor_id;
      const slot = recon_inputs.find((s) => s.extractor_id === extractorId);
      if (!slot) {
        return { type: 'continue', outputMetadata: { ...metadata }, outputPort: 'default' };
      }
      return reconciliationService.processDocument({
        docExecutionId,
        metadata,
        workflowId,
        nodeId: node.id,
        userId,
        slotId: slot.id,
        slotLabel: slot.label,
        extractorId,
      });
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

    // Reuse a pre-created log (e.g. from a fanout block) if one exists for this node,
    // otherwise create a fresh one. This prevents duplicate log rows.
    let log = await documentExecutionModel.findLog(docExecution.id, nodeId);
    if (!log) {
      log = await documentExecutionModel.createLog({
        documentExecutionId: docExecution.id,
        nodeId,
        status: 'processing',
        inputMetadata: metadata,
      });
    }

    await documentExecutionModel.updateStatus(docExecution.id, {
      status: 'processing',
      currentNodeId: nodeId,
    });

    let result;
    let logStatus = 'completed';
    let logError = null;

    try {
      result = await processNode(node, metadata, workflowRunId, docExecution.id, workflowId, workflowUserId);
    } catch (err) {
      logStatus = 'failed';
      logError = err.message;
      result = { type: 'continue', outputMetadata: metadata, outputPort: 'default' };
    }

    if (result.type === 'hold') {
      await documentExecutionModel.updateLog(log.id, { status: 'held', outputMetadata: metadata });
      await documentExecutionModel.updateStatus(docExecution.id, { status: 'held', currentNodeId: nodeId });

      // Reconciliation: arriving doc stays held, but anchor docs in now-completed matching sets
      // need to be released on their own output ports.
      if (result.setDocExecIds && result.setDocExecIds.length > 0) {
        for (const item of result.setDocExecIds) {
          const otherId = typeof item === 'object' ? item.docExecutionId : item;
          const otherPort = typeof item === 'object' ? item.outputPort : null;
          const otherExec = await documentExecutionModel.findById(otherId);
          if (otherExec && otherExec.status === 'held') {
            const otherMeta = parseMeta(otherExec.metadata);
            const otherEdges = (graph[nodeId] || []).filter((e) => e.sourcePort === otherPort);
            const otherReconLog = await documentExecutionModel.findLog(otherId, nodeId);
            if (otherReconLog) {
              await documentExecutionModel.updateLog(otherReconLog.id, {
                status: otherEdges.length === 0 ? 'unrouted' : 'completed',
                outputPort: otherPort,
                outputMetadata: otherMeta,
              });
            }
            if (otherEdges.length === 0) {
              // No downstream edge from this recon port — doc is unrouted after release
              await documentExecutionModel.updateStatus(otherExec.id, {
                status: 'unrouted',
                currentNodeId: nodeId,
                unroutedPort: otherPort,
              });
            } else {
              const startQ = otherEdges.map((e) => ({ nodeId: e.targetNodeId, metadata: otherMeta }));
              pendingExecQueue.push({ docExecution: otherExec, startQueue: startQ });
            }
          }
        }
      }

      return;
    }

    // For fanout, skip the generic log update — the fanout block writes its own richer output.
    if (result.type !== 'fanout') {
      await documentExecutionModel.updateLog(log.id, {
        status: logStatus,
        outputMetadata: result.outputMetadata || metadata,
        error: logError,
        outputPort: logStatus === 'completed' ? (result.outputPort || null) : null,
      });
    }

    if (logStatus === 'failed') {
      await documentExecutionModel.updateStatus(docExecution.id, { status: 'failed', currentNodeId: null });
      return;
    }

    if (result.type === 'fanout') {
      const childDocIds = [];
      const fanoutRuns = [];
      const splitEdges = graph[nodeId] || [];

      // SPLITTING fan-out: sub-document file names come from the splitting service.
      // When the SPLITTING node has 2+ outgoing edges, each sub-document must be sent
      // independently down each branch — one separate exec (and file copy) per edge —
      // so that a hold/unrouted/fail in one branch cannot terminate another branch's processing.
      for (const subDoc of result.subDocuments) {
        if (splitEdges.length === 0) {
          // No downstream edges — persist the sub-doc but mark it unrouted.
          const newDoc = await documentModel.create({
            userId: workflowUserId,
            fileName: subDoc.file_name,
            fileUrl: subDoc.file_url,
            fileType: subDoc.file_type,
          });
          childDocIds.push(newDoc.id);
          const [unroutedExec] = await documentExecutionModel.createMany(workflowRunId, [newDoc.id]);
          await documentExecutionModel.updateStatus(unroutedExec.id, { status: 'unrouted', currentNodeId: nodeId });

        } else if (splitEdges.length === 1) {
          // Single edge — existing behaviour: one doc, one exec, one downstream node.
          const newDoc = await documentModel.create({
            userId: workflowUserId,
            fileName: subDoc.file_name,
            fileUrl: subDoc.file_url,
            fileType: subDoc.file_type,
          });
          childDocIds.push(newDoc.id);
          const [newExec] = await documentExecutionModel.createMany(workflowRunId, [newDoc.id]);
          const subMeta = { document_id: newDoc.id, split_label: subDoc.label, parent_document_id: metadata.document_id };
          // Pre-create processing log so the canvas shows the next node as 'processing'
          // in the same poll that shows the splitting node as 'completed'.
          await documentExecutionModel.createLog({
            documentExecutionId: newExec.id,
            nodeId: splitEdges[0].targetNodeId,
            status: 'processing',
            inputMetadata: subMeta,
          });
          await documentExecutionModel.updateStatus(newExec.id, { status: 'processing', currentNodeId: splitEdges[0].targetNodeId });
          fanoutRuns.push({ childExec: newExec, nextNodes: [{ nodeId: splitEdges[0].targetNodeId, metadata: subMeta }] });

        } else {
          // 2+ edges: create one independent branch copy per edge so each branch has
          // its own document_id, file URL, and execution lifecycle.
          // Branch 0 reuses the splitting service's file URL directly (no extra copy).
          // Branches 1+ get storage copies so their files are truly independent.
          const baseName = subDoc.file_name;
          const lastDot = baseName.lastIndexOf('.');
          for (let i = 0; i < splitEdges.length; i++) {
            const edge = splitEdges[i];
            const branchNum = i + 1;
            const branchFileName = lastDot !== -1
              ? `${baseName.slice(0, lastDot)}(${branchNum})${baseName.slice(lastDot)}`
              : `${baseName}(${branchNum})`;

            let branchFileUrl;
            if (i === 0) {
              branchFileUrl = subDoc.file_url; // reuse original upload, avoid redundant copy
            } else {
              const sourcePath = subDoc.file_url.split('/documents/').pop();
              ({ url: branchFileUrl } = await storageService.copy(sourcePath));
            }

            const branchDoc = await documentModel.create({
              userId: workflowUserId,
              fileName: branchFileName,
              fileUrl: branchFileUrl,
              fileType: subDoc.file_type,
            });
            childDocIds.push(branchDoc.id);

            const branchMeta = {
              document_id: branchDoc.id,
              split_label: subDoc.label,
              parent_document_id: metadata.document_id,
              parent_document_execution_id: docExecution.id,
            };
            const branchExec = await documentExecutionModel.create({
              workflowRunId,
              documentId: branchDoc.id,
              metadata: branchMeta,
            });
            await documentExecutionModel.createLog({
              documentExecutionId: branchExec.id,
              nodeId: edge.targetNodeId,
              status: 'processing',
              inputMetadata: branchMeta,
            });
            await documentExecutionModel.updateStatus(branchExec.id, { status: 'processing', currentNodeId: edge.targetNodeId });
            fanoutRuns.push({ childExec: branchExec, nextNodes: [{ nodeId: edge.targetNodeId, metadata: branchMeta }] });
          }
        }
      }

      // Update the log with child document IDs (no parent doc_id — parent stops here)
      await documentExecutionModel.updateLog(log.id, {
        status: 'completed',
        outputMetadata: { split_count: childDocIds.length, child_document_ids: childDocIds },
        outputPort: 'default',
      });

      // Mark parent as completed
      await documentExecutionModel.updateStatus(docExecution.id, {
        status: 'completed',
        currentNodeId: null,
      });

      // Run fanout siblings sequentially — if sub-documents converge at a reconciliation node
      // downstream, parallel execution would cause a TOCTOU race: the "trigger" sub-doc checks
      // siblings' held status before they've written it. Sequential guarantees each sub-doc
      // is fully held before the next one runs.
      for (const { childExec, nextNodes } of fanoutRuns) {
        try {
          await runDocument(childExec, nodes, edges, graph, workflowRunId, pendingExecQueue, nextNodes);
        } catch (err) {
          console.error(`runDocument failed for fanout exec ${childExec?.id}:`, err);
          await documentExecutionModel.updateStatus(childExec.id, { status: 'failed', currentNodeId: null }).catch(() => {});
        }
      }

      return;
    }

    // Normal continue — follow output port edges
    const { outputMetadata, outputPort, setDocExecIds } = result;
    const nextEdges = (graph[nodeId] || []).filter(
      (e) => e.sourcePort === outputPort || outputPort === 'default'
    );

    // No outgoing edge for this port → document is unrouted.
    // We still fall through to process any setDocExecIds (reconciliation sibling releases)
    // before returning, so sibling docs are not left stranded.
    if (nextEdges.length === 0) {
      await documentExecutionModel.updateLog(log.id, {
        status: 'unrouted',
        outputMetadata: outputMetadata || metadata,
        outputPort,
      });
      await documentExecutionModel.updateStatus(docExecution.id, {
        status: 'unrouted',
        currentNodeId: nodeId,
        unroutedPort: outputPort,
      });
      if (!setDocExecIds?.length) return;
      // else: fall through to setDocExecIds block below, then return at end of loop body.
    }

    // 2+ edges from the same output port → multi-edge fan-out.
    // Create one independent child DOCUMENT (storage copy + new documents row) per branch so
    // each branch is a fully autonomous object: different document_id, different file URL,
    // independent lifecycle (deleting one branch never touches siblings or the source).
    // (Skipped when unrouted — we already handled that path above.)
    if (nextEdges.length > 1 && !setDocExecIds?.length) {
      await documentExecutionModel.updateLog(log.id, {
        status: 'completed',
        outputMetadata: outputMetadata || metadata,
        outputPort,
      });
      await documentExecutionModel.updateStatus(docExecution.id, {
        status: 'completed',
        currentNodeId: null,
      });

      // Read source document once — we need its file_name, file_url, file_type
      const sourceDoc = await documentModel.findById(docExecution.document_id);

      for (let i = 0; i < nextEdges.length; i++) {
        const edge = nextEdges[i];
        const branchNum = i + 1;

        // Compute branch file name: insert (N) before the extension of the source file
        const sourceName = sourceDoc?.file_name || 'document';
        const lastDot = sourceName.lastIndexOf('.');
        const branchFileName = lastDot !== -1
          ? `${sourceName.slice(0, lastDot)}(${branchNum})${sourceName.slice(lastDot)}`
          : `${sourceName}(${branchNum})`;

        // Copy the file in storage → gives this branch its own independent file URL
        const sourcePath = sourceDoc?.file_url?.split('/documents/').pop();
        const { url: branchFileUrl } = await storageService.copy(sourcePath);

        // Create a new document record for this branch
        const branchDoc = await documentModel.create({
          userId: workflowUserId,
          fileName: branchFileName,
          fileUrl: branchFileUrl,
          fileType: sourceDoc?.file_type,
        });

        // Branch metadata: update document_id to the new branch doc.
        // parent_document_execution_id records lineage back to the source exec.
        // No _branch_index/_branch_path — the name is the ground truth.
        const branchMeta = {
          ...(outputMetadata || metadata),
          document_id: branchDoc.id,
          parent_document_execution_id: docExecution.id,
        };

        const childExec = await documentExecutionModel.create({
          workflowRunId,
          documentId: branchDoc.id,
          metadata: branchMeta,
        });

        await runDocument(
          childExec, nodes, edges, graph, workflowRunId, pendingExecQueue,
          [{ nodeId: edge.targetNodeId, metadata: branchMeta }],
        );
      }
      return;
    }

    // Single edge: continue with the same exec (most common path)
    for (const edge of nextEdges) {
      queue.push({ nodeId: edge.targetNodeId, metadata: outputMetadata });
    }

    // For reconciliation: also advance other docs in the matching set, each on their slot port
    if (setDocExecIds && setDocExecIds.length > 0) {
      for (const item of setDocExecIds) {
        const otherId = typeof item === 'object' ? item.docExecutionId : item;
        const otherPort = typeof item === 'object' ? item.outputPort : outputPort;
        const otherExec = await documentExecutionModel.findById(otherId);
        if (otherExec && otherExec.status === 'held') {
          const otherMeta = parseMeta(otherExec.metadata);

          // Update this doc's recon log from 'held' → correct status with the output port.
          // Use 'unrouted' when no downstream edge exists so canvas badges reflect the real state.
          const otherEdges = (graph[nodeId] || []).filter((e) => e.sourcePort === otherPort);
          const otherReconLog = await documentExecutionModel.findLog(otherId, nodeId);
          if (otherReconLog) {
            await documentExecutionModel.updateLog(otherReconLog.id, {
              status: otherEdges.length === 0 ? 'unrouted' : 'completed',
              outputPort: otherPort,
              outputMetadata: otherMeta,
            });
          }
          if (otherEdges.length === 0) {
            // No downstream edge from this recon port — doc is unrouted after release
            await documentExecutionModel.updateStatus(otherExec.id, {
              status: 'unrouted',
              currentNodeId: nodeId,
              unroutedPort: otherPort,
            });
          } else {
            const startQ = otherEdges.map((e) => ({ nodeId: e.targetNodeId, metadata: otherMeta }));
            pendingExecQueue.push({ docExecution: otherExec, startQueue: startQ });
          }
        }
      }
    }

    // If the current doc's own port was unrouted, we've now processed any sibling releases.
    // Return here to avoid the final updateStatus('completed') below, which would overwrite
    // the unrouted status we already wrote.
    if (nextEdges.length === 0) return;
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

  // Run initial trigger-path docs in parallel — looks good on demo and is safe in production
  // (each doc is its own workflow run). The theoretical TOCTOU at a reconciliation node exists
  // if two trigger paths converge there in the same manual run, but that is rare in practice.
  // Fanout siblings are sequential (see runDocument) to handle the split-then-reconcile case.
  const pendingExecQueue = [];
  await Promise.all(
    initialExecs.map((e) =>
      runDocument(e, nodes, edges, graph, workflowRunId, pendingExecQueue, null).catch((err) => {
        console.error(`runDocument failed for exec ${e?.id}:`, err);
        return documentExecutionModel.updateStatus(e.id, { status: 'failed', currentNodeId: null }).catch(() => {});
      })
    )
  );

  // Drain any docs released by reconciliation during the parallel phase (sequential is fine
  // here — they've already passed through the recon node and won't interact with each other).
  while (pendingExecQueue.length > 0) {
    const { docExecution, startQueue } = pendingExecQueue.shift();
    try {
      await runDocument(docExecution, nodes, edges, graph, workflowRunId, pendingExecQueue, startQueue);
    } catch (err) {
      console.error(`runDocument failed for exec ${docExecution?.id}:`, err);
      if (docExecution?.id) {
        await documentExecutionModel.updateStatus(docExecution.id, { status: 'failed', currentNodeId: null }).catch(() => {});
      }
    }
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
async function resumeDocumentExecution(docExecutionId, fromNodeId, workflowRunId, outputPort = null) {
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

  const startQueue = (graph[fromNodeId] || [])
    .filter((e) => !outputPort || outputPort === 'default' || e.sourcePort === outputPort)
    .map((e) => ({ nodeId: e.targetNodeId, metadata: meta }));

  await documentExecutionModel.updateStatus(docExecutionId, { status: 'processing' });

  const pendingExecQueue = [];
  await runDocument(docExec, nodes, edges, graph, workflowRunId, pendingExecQueue, startQueue);

  while (pendingExecQueue.length > 0) {
    const { docExecution, startQueue: subStartQueue } = pendingExecQueue.shift();
    await runDocument(docExecution, nodes, edges, graph, workflowRunId, pendingExecQueue, subStartQueue);
  }
}

module.exports = { runWorkflow, resumeDocumentExecution };

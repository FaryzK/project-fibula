import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import useCanvasStore from '../../stores/useCanvasStore';
import nodeTypes from '../../utils/nodeTypes';
import NodePalette from '../../components/canvas/NodePalette';
import NodePanel from '../../components/canvas/NodePanel';
import RunModal from '../../components/canvas/RunModal';
import FlowInspector from '../../components/canvas/FlowInspector';

const RUN_STATUS_BANNER = {
  running:   { bg: 'bg-amber-50 border-amber-200 text-amber-800', label: '⟳ Running…' },
  completed: { bg: 'bg-green-50 border-green-200 text-green-800', label: '✓ Run completed' },
  failed:    { bg: 'bg-red-50 border-red-200 text-red-800',       label: '✕ Run failed' },
};

function CanvasInner() {
  const { id: workflowId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getViewport, setCenter, screenToFlowPosition } = useReactFlow();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null); // node open in NodePanel
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [pendingConnection, setPendingConnection] = useState(null); // { fromNodeId, fromHandleId, fromHandleType, position }
  const connectingNodeRef = useRef(null);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [inspectorMode, setInspectorMode] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState(null); // { nodeId, heldCount } | null

  const {
    workflowName, isPublished, nodes, edges, loading,
    loadWorkflow, onNodesChange, onEdgesChange, onNodeDragStop,
    onConnect, addNode, deleteEdge, deleteNode, renameWorkflow, togglePublish,
    triggerRun, clearRun, runStatus, uploading, uploadError, nodeStatuses,
  } = useCanvasStore();

  // Colour edges green (animated) only when docs have actually exited through that specific port
  const styledEdges = edges.map((edge) => {
    const srcStatuses = nodeStatuses[edge.source] || [];
    const portId = edge.sourceHandle || 'default';
    const hasCompleted = srcStatuses.some(
      (s) => s.status === 'completed' && s.count > 0 && s.output_port === portId
    );
    if (hasCompleted) {
      return { ...edge, style: { stroke: '#22c55e', strokeWidth: 2 }, animated: true };
    }
    return edge;
  });

  useEffect(() => {
    loadWorkflow(workflowId);
    return () => clearRun();
  }, [workflowId, loadWorkflow, clearRun]);

  useEffect(() => {
    setTitleValue(workflowName);
  }, [workflowName]);

  // Deep link: ?node=:nodeId — centre on that node and open its panel
  useEffect(() => {
    const targetNodeId = searchParams.get('node');
    if (!targetNodeId || nodes.length === 0) return;

    const target = nodes.find((n) => n.id === targetNodeId);
    if (!target) return;

    // Centre viewport on the node
    setCenter(target.position.x + 80, target.position.y + 40, { zoom: 1.2, duration: 600 });
    setSelectedNode(target);
  }, [searchParams, nodes, setCenter]);

  const handleAddNode = useCallback(async (nodeType, label) => {
    let position;
    if (pendingConnection) {
      position = pendingConnection.position;
    } else {
      const { x, y, zoom } = getViewport();
      position = { x: (-x + window.innerWidth / 2) / zoom, y: (-y + window.innerHeight / 2) / zoom };
    }

    const dbNode = await addNode(nodeType, label, position);

    if (pendingConnection && dbNode) {
      const conn = pendingConnection.fromHandleType === 'target'
        ? { source: dbNode.id, sourceHandle: 'default', target: pendingConnection.fromNodeId, targetHandle: pendingConnection.fromHandleId || 'default' }
        : { source: pendingConnection.fromNodeId, sourceHandle: pendingConnection.fromHandleId || 'default', target: dbNode.id, targetHandle: 'default' };
      await onConnect(conn);
      setPendingConnection(null);
      setPaletteOpen(false);
    }
  }, [getViewport, addNode, pendingConnection, onConnect]);

  const handleConnectStart = useCallback((_, { nodeId, handleId, handleType }) => {
    connectingNodeRef.current = { nodeId, handleId, handleType };
  }, []);

  const handleConnectEnd = useCallback((event) => {
    const ref = connectingNodeRef.current;
    connectingNodeRef.current = null;
    if (!ref?.nodeId) return;
    const targetIsPane = event.target.classList.contains('react-flow__pane');
    if (targetIsPane) {
      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setPendingConnection({ fromNodeId: ref.nodeId, fromHandleId: ref.handleId, fromHandleType: ref.handleType, position });
      setPaletteOpen(true);
      setSelectedNode(null);
    }
  }, [screenToFlowPosition]);

  const handleEdgeClick = useCallback((_, edge) => {
    if (window.confirm('Delete this connection?')) deleteEdge(edge.id);
  }, [deleteEdge]);

  const handleKeyDown = useCallback(async (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      for (const n of nodes.filter((node) => node.selected)) {
        const result = await deleteNode(n.id);
        if (result?.heldCount) {
          setDeleteWarning({ nodeId: n.id, heldCount: result.heldCount });
          return;
        }
      }
    }
  }, [nodes, deleteNode]);

  // Double-click a node → open NodePanel
  const handleNodeDoubleClick = useCallback((_, node) => {
    setSelectedNode(node);
    setPaletteOpen(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('application/nodetype');
    const label = e.dataTransfer.getData('application/nodelabel');
    if (!nodeType) return;
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    await addNode(nodeType, label, position);
  }, [screenToFlowPosition, addNode]);

  async function commitTitle() {
    if (titleValue.trim() && titleValue.trim() !== workflowName) {
      await renameWorkflow(titleValue.trim());
    }
    setRenamingTitle(false);
  }

  function handleRunModalSubmit(entries) {
    triggerRun(entries);
    setRunModalOpen(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-400">Loading canvas…</p>
      </div>
    );
  }

  const banner = runStatus ? RUN_STATUS_BANNER[runStatus] : null;

  return (
    <>
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900" onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/app')}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
          >
            ← Back
          </button>
          {renamingTitle ? (
            <input
              autoFocus
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => e.key === 'Enter' && commitTitle()}
              className="text-sm font-semibold text-gray-900 dark:text-white bg-transparent border-b border-indigo-500 outline-none w-48"
            />
          ) : (
            <button
              onClick={() => setRenamingTitle(true)}
              className="text-sm font-semibold text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition"
            >
              {workflowName || 'Untitled workflow'}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Canvas / Flow Inspector toggle */}
          <div className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden text-xs font-medium">
            <button
              onClick={() => setInspectorMode(false)}
              className={`px-3 py-1.5 transition ${
                !inspectorMode
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Canvas
            </button>
            <button
              onClick={() => setInspectorMode(true)}
              className={`px-3 py-1.5 transition ${
                inspectorMode
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              Flow Inspector
            </button>
          </div>

          <button
            onClick={() => setRunModalOpen(true)}
            disabled={uploading || runStatus === 'running'}
            className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading…' : '▶ Run'}
          </button>

          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isPublished
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
            }`}
          >
            {isPublished ? 'Published' : 'Unpublished'}
          </span>
          <button
            onClick={togglePublish}
            className="text-sm px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition"
          >
            {isPublished ? 'Unpublish' : 'Publish'}
          </button>
          {!inspectorMode && (
            <button
              onClick={() => { setPaletteOpen((o) => !o); setSelectedNode(null); setPendingConnection(null); }}
              className="w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-lg font-bold transition"
              title="Add node"
            >
              +
            </button>
          )}
        </div>
      </div>

      {/* Run status banner */}
      {(banner || uploadError) && (
        <div
          className={`flex items-center justify-between px-4 py-1.5 border-b text-sm ${
            uploadError ? 'bg-red-50 border-red-200 text-red-800' : banner.bg
          }`}
        >
          <span>{uploadError || banner.label}</span>
          <button onClick={clearRun} className="text-xs underline ml-4 opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Main area: canvas or flow inspector */}
      {inspectorMode ? (
        <div className="flex flex-1 overflow-hidden bg-white dark:bg-gray-900">
          <FlowInspector workflowId={workflowId} />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1" onDragOver={handleDragOver} onDrop={handleDrop}>
            <ReactFlow
              nodes={nodes}
              edges={styledEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDragStop={onNodeDragStop}
              onConnect={onConnect}
              onConnectStart={handleConnectStart}
              onConnectEnd={handleConnectEnd}
              onEdgeClick={handleEdgeClick}
              onNodeDoubleClick={handleNodeDoubleClick}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
              <MiniMap nodeStrokeWidth={3} />
            </ReactFlow>
          </div>

          {selectedNode && (
            <NodePanel
              key={selectedNode.id}
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
            />
          )}

          {paletteOpen && !selectedNode && (
            <NodePalette
              onAddNode={handleAddNode}
              onClose={() => { setPaletteOpen(false); setPendingConnection(null); }}
              connectingFrom={pendingConnection ? nodes.find((n) => n.id === pendingConnection.fromNodeId)?.data?.label : null}
            />
          )}
        </div>
      )}
    </div>

    {runModalOpen && (
      <RunModal
        nodes={nodes}
        onRun={handleRunModalSubmit}
        onClose={() => setRunModalOpen(false)}
        uploading={uploading}
      />
    )}

    {deleteWarning && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm mx-4">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Delete node</h2>
          </div>
          <div className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300 space-y-2">
            <p>
              This node has <strong>{deleteWarning.heldCount}</strong> held document{deleteWarning.heldCount !== 1 ? 's' : ''}.
            </p>
            <p>
              Processing documents will be allowed to complete naturally. If they later reach the deleted node, they will fail and appear in the Failed tab of the orphaned section.
            </p>
            <p>If you proceed, all held documents will be moved to Orphaned Documents.</p>
          </div>
          <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
            <button
              onClick={() => setDeleteWarning(null)}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await deleteNode(deleteWarning.nodeId, true);
                setDeleteWarning(null);
              }}
              className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition"
            >
              Proceed
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

export default WorkflowCanvas;

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
  const fileInputRef = useRef(null);

  const {
    workflowName, isPublished, nodes, edges, loading,
    loadWorkflow, onNodesChange, onEdgesChange, onNodeDragStop,
    onConnect, addNode, deleteEdge, deleteNode, renameWorkflow, togglePublish,
    triggerRun, clearRun, runStatus, uploading, uploadError,
  } = useCanvasStore();

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

  const handleKeyDown = useCallback((e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.tagName !== 'INPUT') {
      nodes.filter((n) => n.selected).forEach((n) => deleteNode(n.id));
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

  function handleFileChange(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
      triggerRun(files);
      e.target.value = '';
    }
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
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || runStatus === 'running'}
            className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? 'Uploading…' : '↑ Upload & Run'}
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
          <button
            onClick={() => { setPaletteOpen((o) => !o); setSelectedNode(null); setPendingConnection(null); }}
            className="w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-lg font-bold transition"
            title="Add node"
          >
            +
          </button>
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

      {/* Canvas + sidebars */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1" onDragOver={handleDragOver} onDrop={handleDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
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
    </div>
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

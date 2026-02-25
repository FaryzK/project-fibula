import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

function CanvasInner() {
  const { id: workflowId } = useParams();
  const navigate = useNavigate();
  const { getViewport } = useReactFlow();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [renamingTitle, setRenamingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');

  const {
    workflowName, isPublished, nodes, edges, loading,
    loadWorkflow, onNodesChange, onEdgesChange, onNodeDragStop,
    onConnect, addNode, deleteEdge, deleteNode, renameWorkflow, togglePublish,
  } = useCanvasStore();

  useEffect(() => {
    loadWorkflow(workflowId);
  }, [workflowId, loadWorkflow]);

  useEffect(() => {
    setTitleValue(workflowName);
  }, [workflowName]);

  const handleAddNode = useCallback(async (nodeType, label) => {
    const { x, y, zoom } = getViewport();
    // Convert viewport centre to flow coordinates
    const centerX = (-x + window.innerWidth / 2) / zoom;
    const centerY = (-y + window.innerHeight / 2) / zoom;
    await addNode(nodeType, label, { x: centerX, y: centerY });
  }, [getViewport, addNode]);

  const handleEdgeClick = useCallback((_, edge) => {
    if (window.confirm('Delete this connection?')) deleteEdge(edge.id);
  }, [deleteEdge]);

  const handleKeyDown = useCallback((e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.tagName !== 'INPUT') {
      nodes.filter((n) => n.selected).forEach((n) => deleteNode(n.id));
    }
  }, [nodes, deleteNode]);

  async function commitTitle() {
    if (titleValue.trim() && titleValue.trim() !== workflowName) {
      await renameWorkflow(titleValue.trim());
    }
    setRenamingTitle(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-400">Loading canvas…</p>
      </div>
    );
  }

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
            onClick={() => setPaletteOpen((o) => !o)}
            className="w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-lg font-bold transition"
            title="Add node"
          >
            +
          </button>
        </div>
      </div>

      {/* Canvas + Palette */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onEdgeClick={handleEdgeClick}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls />
            <MiniMap nodeStrokeWidth={3} />
          </ReactFlow>
        </div>

        {paletteOpen && (
          <NodePalette
            onAddNode={handleAddNode}
            onClose={() => setPaletteOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// ReactFlowProvider must wrap any component that uses useReactFlow()
function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

export default WorkflowCanvas;

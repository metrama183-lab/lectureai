// components/KnowledgeGraph.jsx — ReactFlow + d3-force, animated nodes

import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import useLectureStore from '../store/lectureStore';

// Custom node component with glassmorphism
function ConceptNode({ data }) {
  return (
    <div className="concept-node">
      <div className="concept-node-label">{data.label}</div>
    </div>
  );
}

const nodeTypes = { custom: ConceptNode };

const EDGE_STYLE = {
  type: 'default',
  animated: true,
  style: { stroke: 'rgba(99, 102, 241, 0.6)', strokeWidth: 2 },
  labelStyle: { fill: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 500 },
  labelBgStyle: { fill: 'rgba(15, 23, 42, 0.8)', fillOpacity: 0.8 },
  labelBgPadding: [6, 4],
  labelBgBorderRadius: 4,
};

export default function KnowledgeGraph() {
  const storeNodes = useLectureStore((s) => s.nodes);
  const storeEdges = useLectureStore((s) => s.edges);
  const updateNodePositions = useLectureStore((s) => s.updateNodePositions);
  const status = useLectureStore((s) => s.status);

  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);

  // Sync new nodes from store without overwriting existing drag positions
  useEffect(() => {
    setNodes((current) => {
      const byId = Object.fromEntries(current.map((n) => [n.id, n]));
      return storeNodes.map((n) => {
        const existing = byId[n.id];
        if (existing) {
          return { ...existing, data: n.data };
        }
        return n;
      });
    });
  }, [storeNodes, setNodes]);

  // Sync edges from store
  useEffect(() => {
    setEdges(storeEdges.map((e) => ({ ...e, ...EDGE_STYLE })));
  }, [storeEdges, setEdges]);

  const onNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      // Persist final drag position back to store
      const dropped = changes.filter((c) => c.type === 'position' && c.dragging === false && c.position);
      if (dropped.length > 0) {
        const positions = {};
        dropped.forEach((c) => { positions[c.id] = c.position; });
        updateNodePositions(positions);
      }
    },
    [setNodes, updateNodePositions]
  );

  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges]
  );

  return (
    <div className="knowledge-graph" id="knowledge-graph">
      <div className="graph-header">
        <div className="graph-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <circle cx="4" cy="6" r="2" />
            <circle cx="20" cy="6" r="2" />
            <circle cx="4" cy="18" r="2" />
            <circle cx="20" cy="18" r="2" />
            <line x1="6" y1="7" x2="10" y2="10" />
            <line x1="18" y1="7" x2="14" y2="10" />
            <line x1="6" y1="17" x2="10" y2="14" />
            <line x1="18" y1="17" x2="14" y2="14" />
          </svg>
        </div>
        <h2>Knowledge Map</h2>
        {storeNodes.length > 0 && (
          <span className="node-count">{storeNodes.length} concepts</span>
        )}
      </div>

      <div className="graph-canvas">
        {storeNodes.length === 0 ? (
          <div className="graph-empty">
            <div className="graph-empty-visual">
              <div className="orbit-ring">
                <div className="orbit-dot" />
              </div>
              <div className="orbit-ring orbit-ring-2">
                <div className="orbit-dot" />
              </div>
              <div className="center-dot" />
            </div>
            <p>
              {status === 'recording'
                ? 'Concepts will appear here as the lecture progresses...'
                : 'Knowledge graph will grow as you record a lecture'}
            </p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.2}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              color="rgba(99, 102, 241, 0.08)"
              gap={24}
              size={1}
            />
            <Controls
              showInteractive={false}
              position="bottom-right"
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
            <MiniMap
              nodeColor={() => 'rgba(99, 102, 241, 0.8)'}
              maskColor="rgba(15, 23, 42, 0.85)"
              style={{
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
              position="top-right"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

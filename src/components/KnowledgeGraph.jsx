// components/KnowledgeGraph.jsx — ReactFlow + d3-force, premium animated nodes

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import useLectureStore from '../store/lectureStore';

// Color palette for node categories — cycles through these
const NODE_COLORS = [
  { bg: 'rgba(99, 102, 241, 0.12)', border: 'rgba(99, 102, 241, 0.5)',  glow: 'rgba(99,  102, 241, 0.25)', text: '#a5b4fc', ring: '#6366f1' },  // indigo
  { bg: 'rgba(139, 92, 246, 0.12)', border: 'rgba(139, 92, 246, 0.5)',  glow: 'rgba(139, 92,  246, 0.25)', text: '#c4b5fd', ring: '#8b5cf6' },  // violet
  { bg: 'rgba(6, 182, 212, 0.12)',  border: 'rgba(6, 182, 212, 0.5)',   glow: 'rgba(6,   182, 212, 0.25)', text: '#67e8f9', ring: '#06b6d4' },  // cyan
  { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.5)',  glow: 'rgba(16,  185, 129, 0.25)', text: '#6ee7b7', ring: '#10b981' },  // emerald
  { bg: 'rgba(244, 114, 182, 0.12)',border: 'rgba(244, 114, 182, 0.5)', glow: 'rgba(244, 114, 182, 0.25)', text: '#f9a8d4', ring: '#ec4899' },  // pink
  { bg: 'rgba(251, 146, 60, 0.12)', border: 'rgba(251, 146, 60, 0.5)',  glow: 'rgba(251, 146, 60,  0.25)', text: '#fdba74', ring: '#f97316' },  // orange
];

function getNodeColor(index) {
  return NODE_COLORS[index % NODE_COLORS.length];
}

// Premium custom node with gradient border glow and handles
function ConceptNode({ data }) {
  const color = data.color || NODE_COLORS[0];
  const connectionCount = data.connections || 0;
  // Moderate scaling: hub nodes clearly bigger but not absurd
  // 0 conn = 1.0x, 2 conn = 1.35x, 5 conn = 1.56x, 9 conn = 1.75x
  const scale = 1 + 0.25 * Math.sqrt(connectionCount);

  return (
    <div className="concept-node-wrapper" style={{
      '--node-glow': color.glow,
      '--node-border': color.border,
      '--node-ring': color.ring,
      transform: `scale(${scale})`,
    }}>
      {/* Glow layer behind the node */}
      <div className="concept-node-glow" />

      {/* Main node */}
      <div className="concept-node">
        <Handle type="target" position={Position.Top} className="concept-handle" />

        {/* Accent dot based on importance */}
        <div className="concept-node-dot" style={{ background: color.ring }} />
        <div className="concept-node-label" style={{ color: color.text }}>
          {data.label}
        </div>
        {connectionCount > 0 && (
          <div className="concept-node-badge" style={{
            background: color.bg,
            color: color.text,
            borderColor: color.border,
          }}>
            {connectionCount}
          </div>
        )}

        <Handle type="source" position={Position.Bottom} className="concept-handle" />
      </div>
    </div>
  );
}

const nodeTypes = { custom: ConceptNode };

const EDGE_STYLE = {
  type: 'default',
  animated: false,
  style: { stroke: 'rgba(148, 163, 184, 0.35)', strokeWidth: 1.5 },
  labelStyle: { fill: 'rgba(203, 213, 225, 0.7)', fontSize: 9, fontWeight: 500 },
  labelBgStyle: { fill: 'rgba(15, 23, 42, 0.75)', rx: 4, ry: 4 },
  labelBgPadding: [6, 3],
  labelBgBorderRadius: 4,
};

// SVG gradient definitions for edges
function EdgeGradientDefs() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        <linearGradient id="edge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
          <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function KnowledgeGraph() {
  return (
    <ReactFlowProvider>
      <KnowledgeGraphInner />
    </ReactFlowProvider>
  );
}

function KnowledgeGraphInner() {
  const storeNodes = useLectureStore((s) => s.nodes);
  const storeEdges = useLectureStore((s) => s.edges);
  const updateNodePositions = useLectureStore((s) => s.updateNodePositions);
  const status = useLectureStore((s) => s.status);
  const { fitView } = useReactFlow();
  const prevNodeCountRef = useRef(0);

  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);

  // Compute connection counts per node for badge display
  const connectionCounts = useMemo(() => {
    const counts = {};
    storeEdges.forEach((e) => {
      counts[e.source] = (counts[e.source] || 0) + 1;
      counts[e.target] = (counts[e.target] || 0) + 1;
    });
    return counts;
  }, [storeEdges]);

  // Sync new nodes from store — add color and connection count
  useEffect(() => {
    setNodes((current) => {
      const byId = Object.fromEntries(current.map((n) => [n.id, n]));
      return storeNodes.map((n, i) => {
        const existing = byId[n.id];
        const color = getNodeColor(i);
        const connections = connectionCounts[n.id] || 0;
        if (existing) {
          return { ...existing, data: { ...n.data, color, connections } };
        }
        return { ...n, data: { ...n.data, color, connections } };
      });
    });
  }, [storeNodes, connectionCounts, setNodes]);

  // Auto-fit view when new nodes are added
  useEffect(() => {
    if (storeNodes.length > 0 && storeNodes.length !== prevNodeCountRef.current) {
      prevNodeCountRef.current = storeNodes.length;
      // Small delay to let positions settle
      const timer = setTimeout(() => fitView({ padding: 0.3, duration: 400 }), 200);
      return () => clearTimeout(timer);
    }
  }, [storeNodes.length, fitView]);

  // Sync edges from store
  useEffect(() => {
    setEdges(storeEdges.map((e) => ({ ...e, ...EDGE_STYLE })));
  }, [storeEdges, setEdges]);

  const onNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
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
      <EdgeGradientDefs />

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
            fitViewOptions={{ padding: 0.4 }}
            minZoom={0.15}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
          >
            <Background
              color="rgba(99, 102, 241, 0.05)"
              gap={30}
              size={1.5}
              variant="dots"
            />
            <Controls
              showInteractive={false}
              position="bottom-right"
              style={{
                background: 'rgba(15, 23, 42, 0.85)',
                borderRadius: '12px',
                border: '1px solid rgba(99, 102, 241, 0.15)',
                backdropFilter: 'blur(12px)',
              }}
            />
            <MiniMap
              nodeColor={(node) => {
                const color = node.data?.color;
                return color?.ring || 'rgba(99, 102, 241, 0.8)';
              }}
              maskColor="rgba(10, 14, 26, 0.88)"
              style={{
                background: 'rgba(15, 23, 42, 0.7)',
                borderRadius: '12px',
                border: '1px solid rgba(99, 102, 241, 0.12)',
                backdropFilter: 'blur(12px)',
              }}
              position="top-right"
            />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}


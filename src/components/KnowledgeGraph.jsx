// components/KnowledgeGraph.jsx — ReactFlow radial mind-map

import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
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

// Color palette per level
const LEVEL_COLORS = {
  0: { bg: 'rgba(99, 102, 241, 0.15)', border: '#6366f1', text: '#f1f5f9', ring: '#6366f1' },  // root - indigo
  1: [
    { bg: 'rgba(6, 182, 212, 0.12)',   border: '#06b6d4', text: '#a5f3fc', ring: '#06b6d4' },   // cyan
    { bg: 'rgba(16, 185, 129, 0.12)',  border: '#10b981', text: '#a7f3d0', ring: '#10b981' },   // emerald
    { bg: 'rgba(244, 114, 182, 0.12)', border: '#ec4899', text: '#fbcfe8', ring: '#ec4899' },   // pink
    { bg: 'rgba(251, 146, 60, 0.12)',  border: '#f97316', text: '#fed7aa', ring: '#f97316' },   // orange
    { bg: 'rgba(139, 92, 246, 0.12)',  border: '#8b5cf6', text: '#ddd6fe', ring: '#8b5cf6' },   // violet
  ],
  2: { bg: 'rgba(148, 163, 184, 0.08)', border: 'rgba(148, 163, 184, 0.35)', text: '#cbd5e1', ring: 'rgba(148,163,184,0.5)' },
};

function getNodeColor(node, index) {
  const level = node.data?.level;
  if (level === 0) return LEVEL_COLORS[0];
  if (level === 1) return LEVEL_COLORS[1][index % LEVEL_COLORS[1].length];
  return LEVEL_COLORS[2];
}

// Root node — large, centered, prominent
function RootNode({ data }) {
  const color = LEVEL_COLORS[0];
  return (
    <div className="root-node-wrapper">
      <div className="root-node" style={{ borderColor: color.border }}>
        <Handle type="source" position={Position.Top} className="concept-handle" id="top" />
        <Handle type="source" position={Position.Right} className="concept-handle" id="right" />
        <Handle type="source" position={Position.Bottom} className="concept-handle" id="bottom" />
        <Handle type="source" position={Position.Left} className="concept-handle" id="left" />
        <div className="root-node-label">{data.label}</div>
      </div>
    </div>
  );
}

// Level 1 node — medium, colored
function Level1Node({ data }) {
  const color = data.color || LEVEL_COLORS[1][0];
  return (
    <div className="level1-node-wrapper">
      <div className="level1-node" style={{
        borderColor: color.border,
        boxShadow: `0 2px 12px ${color.border}22`,
      }}>
        <Handle type="target" position={Position.Top} className="concept-handle" id="top" />
        <Handle type="target" position={Position.Right} className="concept-handle" id="right" />
        <Handle type="target" position={Position.Bottom} className="concept-handle" id="bottom" />
        <Handle type="target" position={Position.Left} className="concept-handle" id="left" />
        <Handle type="source" position={Position.Top} className="concept-handle" id="src-top" />
        <Handle type="source" position={Position.Right} className="concept-handle" id="src-right" />
        <Handle type="source" position={Position.Bottom} className="concept-handle" id="src-bottom" />
        <Handle type="source" position={Position.Left} className="concept-handle" id="src-left" />
        <div className="concept-node-dot" style={{ background: color.ring }} />
        <div className="level1-node-label" style={{ color: color.text }}>{data.label}</div>
      </div>
    </div>
  );
}

// Level 2 node — small leaf
function Level2Node({ data }) {
  const color = data.color || LEVEL_COLORS[2];
  return (
    <div className="level2-node-wrapper">
      <div className="level2-node" style={{
        borderColor: color.border,
      }}>
        <Handle type="target" position={Position.Top} className="concept-handle" id="top" />
        <Handle type="target" position={Position.Right} className="concept-handle" id="right" />
        <Handle type="target" position={Position.Bottom} className="concept-handle" id="bottom" />
        <Handle type="target" position={Position.Left} className="concept-handle" id="left" />
        <div className="level2-node-label" style={{ color: color.text }}>{data.label}</div>
      </div>
    </div>
  );
}

const nodeTypes = { root: RootNode, level1: Level1Node, level2: Level2Node, custom: Level1Node };

const EDGE_STYLE = {
  type: 'smoothstep',
  animated: false,
  style: { stroke: 'rgba(148, 163, 184, 0.35)', strokeWidth: 1.5 },
  labelStyle: { fill: 'rgba(203, 213, 225, 0.8)', fontSize: 10, fontWeight: 500 },
  labelBgStyle: { fill: 'rgba(15, 23, 42, 0.85)', rx: 6, ry: 6 },
  labelBgPadding: [6, 4],
  labelBgBorderRadius: 6,
};

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
  const layoutVersion = useLectureStore((s) => s.layoutVersion);
  const { fitView } = useReactFlow();
  const prevNodeCountRef = useRef(0);

  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);

  // Track level-1 indices for color assignment
  const level1Indices = useMemo(() => {
    const indices = {};
    let idx = 0;
    storeNodes.forEach((n) => {
      const level = n.data?.level;
      if (level === 1) {
        indices[n.id] = idx++;
      }
    });
    return indices;
  }, [storeNodes]);

  // Map each level-2 node to its parent's color index
  const nodeColorMap = useMemo(() => {
    const map = {};
    storeNodes.forEach((n) => {
      const level = n.data?.level;
      if (level === 0) {
        map[n.id] = LEVEL_COLORS[0];
      } else if (level === 1) {
        const idx = level1Indices[n.id] || 0;
        map[n.id] = LEVEL_COLORS[1][idx % LEVEL_COLORS[1].length];
      } else {
        // Level 2: inherit color from parent
        const parentId = n.data?.parent;
        if (parentId && level1Indices[parentId] !== undefined) {
          const idx = level1Indices[parentId];
          map[n.id] = LEVEL_COLORS[1][idx % LEVEL_COLORS[1].length];
        } else {
          map[n.id] = LEVEL_COLORS[2];
        }
      }
    });
    return map;
  }, [storeNodes, level1Indices]);

  // Sync nodes from store
  useEffect(() => {
    setNodes((current) => {
      const byId = Object.fromEntries(current.map((n) => [n.id, n]));
      return storeNodes.map((n) => {
        const existing = byId[n.id];
        const level = n.data?.level ?? 1;
        const color = nodeColorMap[n.id] || LEVEL_COLORS[2];
        let nodeType = 'custom';
        if (level === 0) nodeType = 'root';
        else if (level === 1) nodeType = 'level1';
        else nodeType = 'level2';

        const newData = { ...n.data, color, level };

        if (existing) {
          // USA n.position dallo store (posizione Dagre), non quella di React Flow
          return { ...existing, position: n.position, type: nodeType, data: newData };
        }
        return { ...n, type: nodeType, data: newData };
      });
    });
  }, [storeNodes, nodeColorMap, setNodes]);

  // Auto-fit view whenever node count changes (50ms lets React Flow settle DOM first)
  useEffect(() => {
    if (storeNodes.length > 0) {
      const timer = setTimeout(() => fitView({ padding: 0.18, duration: 500 }), 50);
      return () => clearTimeout(timer);
    }
  }, [storeNodes.length, layoutVersion, fitView]);

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
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.1}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
            colorMode="dark"
          >
            <Background
              color="rgba(99, 102, 241, 0.04)"
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
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

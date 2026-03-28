// lib/graphBuilder.js — Dagre layout, clean rewrite
import dagre from '@dagrejs/dagre';

const NODE_W = 170;
const NODE_H = 44;

export function computeLayout(nodes, edges) {
  if (nodes.length === 0) return {};

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'TB',      // top → bottom
    ranksep: 90,        // vertical space between levels
    nodesep: 55,        // horizontal space between same-level nodes
    ranker: 'tight-tree',
  });

  nodes.forEach((n) => g.setNode(n.id, { width: NODE_W, height: NODE_H }));

  // Only add legitimate parent→child edges (with robust fallback)
  edges.forEach((e) => {
    const src = typeof e.source === 'object' ? e.source.id : e.source;
    const tgt = typeof e.target === 'object' ? e.target.id : e.target;
    if (!src || !tgt) return;

    const targetNode = nodes.find((n) => n.id === tgt);
    
    // Controlla parent in tutti i posti possibili
    const parentId = targetNode?.data?.parent 
      ?? targetNode?.parent 
      ?? null;
      
    // Fallback: se non hai parent field, accetta comunque l'edge se va da livello basso ad alto
    const srcNode = nodes.find((n) => n.id === src);
    const srcLevel = srcNode?.data?.level ?? srcNode?.level ?? 0;
    const tgtLevel = targetNode?.data?.level ?? targetNode?.level ?? 1;
    
    const isValidTreeEdge = parentId === src || 
      (parentId === null && tgtLevel > srcLevel);
      
    if (isValidTreeEdge && src && tgt) {
      g.setEdge(src, tgt);
    }
  });

  dagre.layout(g);

  const positions = {};
  nodes.forEach((n) => {
    const pos = g.node(n.id);
    if (pos) {
      positions[n.id] = {
        x: pos.x - NODE_W / 2,
        y: pos.y - NODE_H / 2,
      };
    }
  });

  return positions;
}

// Kept for API compatibility with RecordButton.jsx
export function resetLayout() {}

export function processDelta(delta, addGraphDelta, updateNodePositions, existingNodes, existingEdges) {
  const newNodes = (delta.nodes_to_add || [])
    .filter((n) => !existingNodes.some((en) => en.id === n.id))
    .map((n) => ({
      id: n.id,
      data: { label: n.label, level: n.level, parent: n.parent },
      position: { x: 0, y: 0 },
    }));

  const newEdges = (delta.edges_to_add || [])
    .filter((e) => !existingEdges.some((ee) => ee.id === `${e.source}->${e.target}`))
    .map((e) => ({
      id: `${e.source}->${e.target}`,
      source: e.source,
      target: e.target,
      label: e.label,
    }));

  const allNodes = [...existingNodes, ...newNodes];
  const allEdges = [...existingEdges, ...newEdges];

  // Compute layout BEFORE updating store
  const positions = computeLayout(allNodes, allEdges);

  // Then update store
  addGraphDelta(delta);
  updateNodePositions(positions);
}

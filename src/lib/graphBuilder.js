// lib/graphBuilder.js — transforms { nodes_to_add, edges_to_add }
// into positioned nodes using d3-force simulation
// Uses forceX/forceY (NOT forceCenter) to avoid center-of-mass drift

import { forceSimulation, forceLink, forceManyBody, forceCollide, forceX, forceY } from 'd3-force';

// Canvas logical center
const CX = 400;
const CY = 300;

/**
 * Compute degree (connection count) for each node
 */
function computeDegrees(allEdges) {
  const degrees = {};
  allEdges.forEach((e) => {
    const src = typeof e.source === 'object' ? e.source.id : e.source;
    const tgt = typeof e.target === 'object' ? e.target.id : e.target;
    degrees[src] = (degrees[src] || 0) + 1;
    degrees[tgt] = (degrees[tgt] || 0) + 1;
  });
  return degrees;
}

/**
 * Run d3-force simulation on all nodes (existing + new) to compute positions.
 * - Root node (first ever node) is fixed at center with fx/fy
 * - forceX/forceY provide centripetal pull (NO forceCenter — it causes drift)
 * - forceCollide radius scales dynamically with node degree
 */
export function computeLayout(allNodes, allEdges) {
  if (allNodes.length === 0) return {};

  const degrees = computeDegrees(allEdges);

  // Create simulation nodes
  const simNodes = allNodes.map((node, index) => {
    const px = node.position?.x;
    const py = node.position?.y;
    const hasRealPosition = px !== undefined && py !== undefined && (px !== 0 || py !== 0);
    const degree = degrees[node.id] || 0;

    // First node = root: always fixed at center
    if (index === 0) {
      return {
        id: node.id,
        x: CX,
        y: CY,
        fx: CX,
        fy: CY,
        degree,
      };
    }

    return {
      id: node.id,
      x: hasRealPosition ? px : (CX + (Math.random() * 400 - 200)),
      y: hasRealPosition ? py : (CY + (Math.random() * 300 - 150)),
      // Lock existing nodes so only new ones move
      fx: hasRealPosition ? px : undefined,
      fy: hasRealPosition ? py : undefined,
      degree,
    };
  });

  // Create simulation links
  const nodeIds = new Set(simNodes.map((n) => n.id));
  const simLinks = allEdges
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
    }));

  // Run force simulation — NO forceCenter!
  // forceX/forceY pull each node individually toward center (true gravity)
  // forceCenter would translate the center of mass, causing drift with orphan nodes
  const simulation = forceSimulation(simNodes)
    .force('link', forceLink(simLinks).id((d) => d.id).distance(250).strength(0.35))
    .force('charge', forceManyBody().strength(-800).distanceMax(350))
    .force('x', forceX(CX).strength(0.25))
    .force('y', forceY(CY).strength(0.25))
    .force('collide', forceCollide((d) => {
      // Dynamic collision radius scaled with degree
      // Hub nodes get much more breathing room
      return 55 + 20 * Math.sqrt(d.degree || 0);
    }))
    .stop();

  // Run 250 ticks for stronger convergence
  for (let i = 0; i < 250; i++) {
    simulation.tick();
  }

  // Extract final positions
  const positions = {};
  simNodes.forEach((node) => {
    positions[node.id] = { x: node.x, y: node.y };
  });

  return positions;
}

/**
 * Process a Mistral delta: add nodes to store and recompute layout
 */
export function processDelta(delta, addGraphDelta, updateNodePositions, existingNodes, existingEdges) {
  // First add the new nodes/edges to the store
  addGraphDelta(delta);

  // Build the full node/edge list after addition
  const allNodes = [
    ...existingNodes,
    ...(delta.nodes_to_add || [])
      .filter((n) => !existingNodes.some((en) => en.id === n.id))
      .map((n) => ({
        id: n.id,
        data: { label: n.label },
        position: { x: 0, y: 0 },
      })),
  ];

  const allEdges = [
    ...existingEdges,
    ...(delta.edges_to_add || [])
      .filter((e) => !existingEdges.some((ee) => ee.id === `${e.source}->${e.target}`))
      .map((e) => ({
        id: `${e.source}->${e.target}`,
        source: e.source,
        target: e.target,
        label: e.label,
      })),
  ];

  // Compute new layout
  const positions = computeLayout(allNodes, allEdges);
  updateNodePositions(positions);
}


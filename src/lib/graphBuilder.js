// lib/graphBuilder.js — transforms { nodes_to_add, edges_to_add }
// into positioned nodes using d3-force simulation

import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY } from 'd3-force';

/**
 * Run d3-force simulation on all nodes (existing + new) to compute positions.
 * Existing nodes with real positions are fixed so only new nodes float into place.
 * @param {Array} allNodes - All nodes (existing with positions + new without)
 * @param {Array} allEdges - All edges
 * @returns {Object} Map of nodeId → { x, y }
 */
export function computeLayout(allNodes, allEdges) {
  if (allNodes.length === 0) return {};

  // Create simulation nodes — fix existing positioned nodes, randomise new ones
  const simNodes = allNodes.map((node) => {
    const px = node.position?.x;
    const py = node.position?.y;
    const hasRealPosition = px !== undefined && py !== undefined && (px !== 0 || py !== 0);
    return {
      id: node.id,
      x: hasRealPosition ? px : (Math.random() * 600 - 300),
      y: hasRealPosition ? py : (Math.random() * 400 - 200),
      // Lock existing nodes so only new ones move
      fx: hasRealPosition ? px : undefined,
      fy: hasRealPosition ? py : undefined,
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

  // Run force simulation synchronously
  const simulation = forceSimulation(simNodes)
    .force('link', forceLink(simLinks).id((d) => d.id).distance(280).strength(0.3))
    .force('charge', forceManyBody().strength(-1200).distanceMax(800))
    .force('center', forceCenter(400, 300).strength(0.05))
    .force('x', forceX(400).strength(0.08))
    .force('y', forceY(300).strength(0.08))
    .force('collide', forceCollide(100))
    .stop();

  // Run 200 ticks for better convergence with stronger forces
  for (let i = 0; i < 200; i++) {
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
 * @param {Object} delta - { nodes_to_add, edges_to_add }
 * @param {Function} addGraphDelta - Zustand action
 * @param {Function} updateNodePositions - Zustand action
 * @param {Array} existingNodes - Current nodes in store
 * @param {Array} existingEdges - Current edges in store
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

// store/lectureStore.js — Zustand: single source of truth
// { transcript, nodes, edges, summary, status }

import { create } from 'zustand';

const useLectureStore = create((set, get) => ({
  // Status: 'idle' | 'recording' | 'processing'
  status: 'idle',
  setStatus: (status) => set({ status }),

  // Timestamp when recording started (for live timer)
  recordingStartedAt: null,
  setRecordingStartedAt: (ts) => set({ recordingStartedAt: ts }),

  // Full accumulated transcript text
  transcript: '',
  // Index of last character sent to Mistral for analysis
  lastAnalyzedIndex: 0,

  // Append new transcribed text
  appendTranscript: (text) =>
    set((state) => ({
      transcript: state.transcript + (state.transcript ? ' ' : '') + text,
    })),

  // ReactFlow-compatible nodes and edges
  nodes: [],
  edges: [],

  // Add new nodes and edges from Mistral delta
  addGraphDelta: (delta) =>
    set((state) => {
      const existingNodeIds = new Set(state.nodes.map((n) => n.id));
      const existingEdgeIds = new Set(state.edges.map((e) => e.id));

      const newNodes = (delta.nodes_to_add || [])
        .filter((n) => !existingNodeIds.has(n.id))
        .map((n) => ({
          id: n.id,
          type: 'custom',
          data: { label: n.label },
          position: n.position || { x: 0, y: 0 },
        }));

      const newEdges = (delta.edges_to_add || [])
        .map((e) => {
          const id = `${e.source}->${e.target}`;
          if (existingEdgeIds.has(id)) return null;
          return {
            id,
            source: e.source,
            target: e.target,
            label: e.label,
            animated: true,
            style: { stroke: 'var(--accent)', strokeWidth: 2 },
            labelStyle: { fill: 'var(--text-secondary)', fontSize: 11 },
          };
        })
        .filter(Boolean);

      return {
        nodes: [...state.nodes, ...newNodes],
        edges: [...state.edges, ...newEdges],
      };
    }),

  // Update node positions after d3-force simulation
  updateNodePositions: (positions) =>
    set((state) => ({
      nodes: state.nodes.map((node) => {
        const pos = positions[node.id];
        if (pos) {
          return { ...node, position: { x: pos.x, y: pos.y } };
        }
        return node;
      }),
    })),

  // Mark how much transcript has been analyzed
  markAnalyzed: () =>
    set((state) => ({
      lastAnalyzedIndex: state.transcript.length,
    })),

  // Get unanalyzed text
  getNewText: () => {
    const state = get();
    return state.transcript.slice(state.lastAnalyzedIndex);
  },

  // Summary data
  summary: null, // { keyPoints: [], questions: [] }
  setSummary: (summary) => set({ summary }),

  // Reset everything
  reset: () =>
    set({
      status: 'idle',
      transcript: '',
      lastAnalyzedIndex: 0,
      nodes: [],
      edges: [],
      summary: null,
      recordingStartedAt: null,
    }),
}));

export default useLectureStore;

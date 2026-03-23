// lib/mistralClient.js — calls /api/analyze, fallback Cerebras on 429
// Sends new text + current graph state → receives JSON delta

/**
 * Analyze new transcript text and get knowledge graph delta
 * @param {string} newText - New unanalyzed transcript text
 * @param {Array} currentNodes - Current graph nodes
 * @param {Array} currentEdges - Current graph edges
 * @returns {Promise<{nodes_to_add: Array, edges_to_add: Array}>}
 */
export async function analyzeText(newText, currentNodes = [], currentEdges = []) {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      newText,
      currentNodes,
      currentEdges,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Analysis failed (${response.status})`);
  }

  const data = await response.json();
  return {
    nodes_to_add: data.nodes_to_add || [],
    edges_to_add: data.edges_to_add || [],
  };
}

/**
 * Generate a summary of the full lecture transcript
 * @param {string} fullTranscript - Complete transcript text
 * @returns {Promise<{keyPoints: Array, questions: Array}>}
 */
export async function generateSummary(fullTranscript) {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      newText: fullTranscript,
      mode: 'summary',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Summary generation failed (${response.status})`);
  }

  const data = await response.json();
  return {
    keyPoints: data.keyPoints || [],
    questions: data.questions || [],
  };
}

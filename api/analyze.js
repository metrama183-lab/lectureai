// api/analyze.js — Vercel Serverless Function
// Receives transcript text + current graph state → Mistral Large → JSON delta
// Falls back to Cerebras on HTTP 429

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = 'mistral-large-latest';

const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const CEREBRAS_MODEL = 'llama-3.3-70b';

const SYSTEM_PROMPT = `You are an expert knowledge mapper. Your job is to extract concepts and relationships from lecture text and return ONLY the NEW elements to add to an existing knowledge graph.

You receive:
1. The current state of the knowledge graph (existing nodes and edges)
2. New transcript text that hasn't been analyzed yet

You must return ONLY the delta — new concepts and new connections. Never repeat existing nodes or edges.

RULES:
- Each node must have a unique "id" (lowercase, snake_case, descriptive) and a "label" (short, clear, max 4 words)
- Each edge must have "source" and "target" (node ids) and a "label" (relationship description, max 4 words)
- Do NOT create duplicate nodes — check existing nodes first
- If a new concept relates to an existing node, create an edge to that existing node's id
- Keep labels concise and meaningful
- Return valid JSON only, no text outside the JSON

Response format:
{
  "nodes_to_add": [
    { "id": "concept_name", "label": "Concept Name" }
  ],
  "edges_to_add": [
    { "source": "node_id_1", "target": "node_id_2", "label": "relates to" }
  ]
}

If the new text contains no meaningful new concepts, return:
{ "nodes_to_add": [], "edges_to_add": [] }`;

const SUMMARY_SYSTEM_PROMPT = `You are an expert academic summarizer. Given a full lecture transcript, generate:
1. A list of key points (the most important concepts and takeaways)
2. A list of probable exam/review questions a student should prepare for

Return valid JSON only:
{
  "keyPoints": ["point 1", "point 2", ...],
  "questions": ["question 1?", "question 2?", ...]
}

Keep each point concise (1-2 sentences max). Generate 5-8 key points and 4-6 questions.`;

function buildAnalyzePrompt(newText, currentNodes, currentEdges) {
  const nodesDesc = currentNodes.length > 0
    ? `Existing nodes: ${JSON.stringify(currentNodes.map(n => ({ id: n.id, label: n.data?.label || n.label })))}`
    : 'No existing nodes yet.';

  const edgesDesc = currentEdges.length > 0
    ? `Existing edges: ${JSON.stringify(currentEdges.map(e => ({ source: e.source, target: e.target, label: e.label })))}`
    : 'No existing edges yet.';

  return `${nodesDesc}

${edgesDesc}

New transcript text to analyze:
"${newText}"

Return ONLY the delta JSON with new nodes and edges to add.`;
}

async function callLLM(apiUrl, model, apiKey, messages, retryWithCerebras = true) {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    if (res.status === 429 && retryWithCerebras) {
      return null; // signal to retry with Cerebras
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error (${res.status})`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error('Empty response from AI.');

  return extractJSON(raw);
}

function extractJSON(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(stripped); } catch { /* fall through */ }

  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch { /* fall through */ }
  }

  try { return JSON.parse(text.trim()); } catch { /* fall through */ }

  throw new Error('Could not extract valid JSON from AI response.');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const mistralKey = process.env.MISTRAL_API_KEY;
  const cerebrasKey = process.env.CEREBRAS_API_KEY;

  if (!mistralKey) {
    return res.status(500).json({ error: 'MISTRAL_API_KEY not configured on server.' });
  }

  const { newText, currentNodes, currentEdges, mode } = req.body || {};

  try {
    // Summary mode — generate key points and questions from full transcript
    if (mode === 'summary') {
      const messages = [
        { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
        { role: 'user', content: `Full lecture transcript:\n"${newText}"\n\nGenerate key points and review questions as JSON.` },
      ];

      let result = await callLLM(MISTRAL_API_URL, MISTRAL_MODEL, mistralKey, messages, true);
      if (result === null && cerebrasKey) {
        result = await callLLM(CEREBRAS_API_URL, CEREBRAS_MODEL, cerebrasKey, messages, false);
      }
      if (result === null) {
        return res.status(429).json({ error: 'Rate limited — try again in a moment.' });
      }
      return res.status(200).json(result);
    }

    // Graph analysis mode — extract concept delta
    if (!newText || typeof newText !== 'string') {
      return res.status(400).json({ error: 'Missing "newText" field.' });
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildAnalyzePrompt(newText, currentNodes || [], currentEdges || []) },
    ];

    let result = await callLLM(MISTRAL_API_URL, MISTRAL_MODEL, mistralKey, messages, true);

    // Fallback to Cerebras on 429
    if (result === null && cerebrasKey) {
      result = await callLLM(CEREBRAS_API_URL, CEREBRAS_MODEL, cerebrasKey, messages, false);
    }

    if (result === null) {
      return res.status(429).json({ error: 'Rate limited — try again in a moment.' });
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
}

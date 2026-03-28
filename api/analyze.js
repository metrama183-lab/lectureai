// api/analyze.js — Vercel Serverless Function
// Receives transcript text + current graph state → Mistral Large → JSON delta
// Falls back to Cerebras on HTTP 429

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = 'mistral-large-latest';

const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const CEREBRAS_MODEL = 'llama-3.3-70b';

function getSystemPrompt(language) {
  const langInstruction = language === 'it'
    ? 'IMPORTANT: All node labels and edge labels MUST be in Italian.'
    : 'All node labels and edge labels must be in English.';

  return `You are a knowledge extraction engine. ${langInstruction}

OUTPUT RULES — follow in order, do not skip:

STEP 1 — Build nodes:
  - Assign each new node: { "id", "label" (max 4 words), "level" (0/1/2), "parent" }
  - level 0 = root (only 1, parent: null)
  - level 1 = category (parent must be root id)
  - level 2 = detail (parent must be a level-1 id)
  - No level 3 or deeper.

STEP 2 — Build edges:
  - For EACH node you created, create EXACTLY ONE edge: { source: node.parent, target: node.id }
  - The root node gets NO incoming edge.
  - VALIDATION CHECK: for every edge you write, verify that edge.source === nodes_to_add[edge.target].parent
  - If the check fails, DELETE that edge. Do not add it.
  - DO NOT create any other edges. No cross-links, no skip-level links, no sibling links.

STEP 3 — Deduplication:
  - If a concept already exists in "Existing nodes", reuse its id. Do NOT create it again.

First call (empty graph): create 1 root + 3-5 level-1 + 2-3 level-2 per category. Total 10-16 nodes.
Subsequent calls: add MAX 4 new nodes as children of existing nodes only.

Return ONLY valid JSON:
{
  "nodes_to_add": [
    { "id": "root_id", "label": "Main Topic", "level": 0, "parent": null },
    { "id": "cat_1", "label": "Category One", "level": 1, "parent": "root_id" },
    { "id": "det_1a", "label": "Detail A", "level": 2, "parent": "cat_1" }
  ],
  "edges_to_add": [
    { "source": "root_id", "target": "cat_1", "label": "include" },
    { "source": "cat_1", "target": "det_1a", "label": "example" }
  ]
}

If nothing new to add: { "nodes_to_add": [], "edges_to_add": [] }`;
}

function getSummaryPrompt(language) {
  const langInstruction = language === 'it'
    ? 'IMPORTANT: Write all key points and questions in Italian.'
    : 'Write all key points and questions in English.';

  return `You are an expert academic summarizer. Given a full lecture transcript, generate:
1. A list of key points — the most important concepts and takeaways from the lecture. Each point should be 2-4 sentences with context, not just a single line. Explain WHY a concept matters, its historical/theoretical context, and its connections to other concepts in the lecture.
2. A list of review questions at graduated difficulty levels — from basic comprehension to critical analysis. Include 5-7 questions.

${langInstruction}

Return valid JSON only:
{
  "keyPoints": ["Detailed point 1 with context and reasoning (2-4 sentences)", "Detailed point 2...", ...],
  "questions": ["[Comprehension] Basic question...", "[Analysis] Deeper question...", "[Critical] Advanced question...", ...]
}

Generate 5-8 detailed key points and 5-7 graduated questions. Each key point MUST be substantive — not a single sentence but a mini-paragraph that would help a student understand and remember the concept.`;
}

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

async function callLLM(apiUrl, model, apiKey, messages, retryWithCerebras = true, maxTokens = 2000) {
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
      max_tokens: maxTokens,
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

  const { newText, currentNodes, currentEdges, mode, language } = req.body || {};
  const lang = language === 'en' ? 'en' : 'it'; // default to Italian

  try {
    // Summary mode — generate key points and questions from full transcript
    if (mode === 'summary') {
      const messages = [
        { role: 'system', content: getSummaryPrompt(lang) },
        { role: 'user', content: `Full lecture transcript:\n"${newText}"\n\nGenerate key points and review questions as JSON.` },
      ];

      let result = await callLLM(MISTRAL_API_URL, MISTRAL_MODEL, mistralKey, messages, true, 4000);
      if (result === null && cerebrasKey) {
        result = await callLLM(CEREBRAS_API_URL, CEREBRAS_MODEL, cerebrasKey, messages, false, 4000);
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
      { role: 'system', content: getSystemPrompt(lang) },
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


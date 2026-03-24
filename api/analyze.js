// api/analyze.js — Vercel Serverless Function
// Receives transcript text + current graph state → Mistral Large → JSON delta
// Falls back to Cerebras on HTTP 429

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = 'mistral-large-latest';

const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const CEREBRAS_MODEL = 'llama-3.3-70b';

function getSystemPrompt(language) {
  const langInstruction = language === 'it'
    ? 'IMPORTANT: All node labels and edge labels MUST be in Italian. The transcript is in Italian.'
    : 'All node labels and edge labels must be in English.';

  return `You are an expert knowledge mapper. Your job is to extract concepts and relationships from lecture text and return ONLY the NEW elements to add to an existing knowledge graph.

You receive:
1. The current state of the knowledge graph (existing nodes and edges)
2. New transcript text that hasn't been analyzed yet

You must return ONLY the delta — new concepts and new connections. Never repeat existing nodes or edges.

${langInstruction}

RULES:
- Each node must have a unique "id" (lowercase, snake_case, descriptive) and a "label" (short, clear, max 4 words)
- Each edge must have "source" and "target" (node ids) and a "label" (relationship description, max 4 words)
- Do NOT create duplicate nodes — check existing nodes first
- DEDUPLICATION: If a concept is the same as an existing node but with a slightly different name (e.g. "Giuseppe Parini" vs "Parini", or "Neoclassicismo" vs "Il Neoclassicismo"), do NOT create a new node — use the existing node's id instead.
- TRANSCRIPTION ERRORS: The transcript may contain speech recognition errors. Correct obvious errors in node labels (e.g. "Virgilio Traccio" should be "Virgilio" if that's the intended reference). Do NOT create nodes from clearly garbled text.
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

  const { newText, currentNodes, currentEdges, mode, language } = req.body || {};
  const lang = language === 'en' ? 'en' : 'it'; // default to Italian

  try {
    // Summary mode — generate key points and questions from full transcript
    if (mode === 'summary') {
      const messages = [
        { role: 'system', content: getSummaryPrompt(lang) },
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


// api/transcribe.js — Vercel Serverless Function
// Receives audio blob → forwards to Groq Whisper → returns transcribed text
// API key stays server-side only (no VITE_ prefix)

export const config = {
  api: {
    bodyParser: false, // we need raw multipart/form-data
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY not configured on server.' });
  }

  try {
    // Collect raw body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    // Parse multipart boundary from Content-Type
    const contentType = req.headers['content-type'] || '';

    // Forward the raw multipart request to Groq Whisper
    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': contentType,
      },
      body: body,
    });

    if (!groqRes.ok) {
      const err = await groqRes.json().catch(() => ({}));
      if (groqRes.status === 429) {
        return res.status(429).json({ error: 'Too many requests — wait a few seconds and try again.' });
      }
      return res.status(502).json({
        error: err?.error?.message || `Groq error (${groqRes.status})`,
      });
    }

    const data = await groqRes.json();
    return res.status(200).json({ text: data.text || '' });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error.' });
  }
}

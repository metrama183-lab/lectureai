# LectureAI

> Transform any spoken lecture into an interactive knowledge map — in real time, directly in the browser.

## What it does

Press **Start Lecture**, speak, and watch:
1. **Live transcript** — Whisper (via Groq) transcribes every voice segment in under a second.
2. **Knowledge graph** — Mistral Large extracts concepts and relationships every 30 seconds and builds an interactive node graph with d3-force layout.
3. **Auto summary** — When you stop, the app generates key points and probable exam questions.
4. **Export** — Download the full transcript + graph + summary as PDF or Markdown.

No installation, no accounts, no data leaving European servers.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Zustand, ReactFlow, d3-force, Vite |
| Transcription | Groq Whisper (`whisper-large-v3-turbo`) |
| Analysis | Mistral Large (`mistral-large-latest`), fallback Cerebras (`llama-3.3-70b`) |
| Deployment | Vercel (serverless API + static frontend) |

## Local setup

```bash
# 1. Clone and install
npm install

# 2. Add API keys
cp .env.example .env
# Edit .env and fill in your keys

# 3. Run dev server (Vite frontend only — APIs need Vercel)
npm run dev

# 4. To test APIs locally, use Vercel CLI
npx vercel dev
```

### Required environment variables (server-side only)

```
GROQ_API_KEY=       # https://console.groq.com
MISTRAL_API_KEY=    # https://console.mistral.ai
CEREBRAS_API_KEY=   # https://cloud.cerebras.ai  (optional fallback on 429)
```

## Deploy to Vercel

```bash
npx vercel --prod
```

Set the three environment variables in the Vercel dashboard under **Settings → Environment Variables**.

## Architecture

```
audioManager  →  whisperClient  →  store.transcript
                                        ↓ (every 30s)
                                   mistralClient  →  graphBuilder  →  store.nodes/edges
                                        ↓
                                   KnowledgeGraph (ReactFlow + d3-force)
```

- **VAD** — energy-based voice activity detection with auto-calibration; only real voice segments are sent for transcription.
- **Incremental graph** — Mistral only receives new text and the current graph state, returning only the delta (new nodes/edges). Existing node positions are preserved across updates.
- **Fallback** — on HTTP 429 from Mistral, the serverless function automatically retries with Cerebras.

## Keyboard shortcut

**Space** — start / stop recording (when no input is focused)

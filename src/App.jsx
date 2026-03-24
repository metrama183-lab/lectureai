// App.jsx — layout: TranscriptPanel | KnowledgeGraph

import { useRef } from 'react';
import RecordButton from './components/RecordButton';
import TranscriptPanel from './components/TranscriptPanel';
import KnowledgeGraph from './components/KnowledgeGraph';
import SummaryPanel from './components/SummaryPanel';
import ExportBar from './components/ExportBar';
import Toast from './components/Toast';
import StatsBar from './components/StatsBar';
import useLectureStore from './store/lectureStore';
import useToastStore from './store/toastStore';
import { transcribeAudio } from './lib/whisperClient';
import { analyzeText, generateSummary } from './lib/mistralClient';
import { processDelta } from './lib/graphBuilder';

// Target sample rate for Whisper — 16kHz mono keeps chunks small (~800KB per 25s)
const TARGET_SAMPLE_RATE = 16000;
const CHUNK_DURATION_S = 25;

export default function App() {
  const language = useLectureStore((s) => s.language);
  const setLanguage = useLectureStore((s) => s.setLanguage);
  const status = useLectureStore((s) => s.status);
  const addToast = useToastStore((s) => s.addToast);
  const fileInputRef = useRef(null);

  const handleAudioUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const store = useLectureStore.getState();
    if (store.status !== 'idle') {
      addToast('warning', 'Stop the current recording before uploading a file');
      return;
    }

    useLectureStore.getState().setStatus('processing');

    try {
      // Decode the full audio file
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      await audioContext.close();

      // Downsample to 16kHz mono via OfflineAudioContext
      const monoBuffer = await downsampleToMono(audioBuffer, TARGET_SAMPLE_RATE);

      const totalChunks = Math.ceil(monoBuffer.duration / CHUNK_DURATION_S);
      addToast('info', `Processing ${file.name} — ${totalChunks} chunks (${Math.round(monoBuffer.duration / 60)}min)`);

      // Process each chunk sequentially
      for (let i = 0; i < totalChunks; i++) {
        const startSample = Math.floor(i * CHUNK_DURATION_S * monoBuffer.sampleRate);
        const endSample = Math.min(
          Math.floor((i + 1) * CHUNK_DURATION_S * monoBuffer.sampleRate),
          monoBuffer.length
        );
        const chunkLength = endSample - startSample;

        // Create a single-chunk OfflineAudioContext to extract the buffer
        const chunkCtx = new OfflineAudioContext(1, chunkLength, monoBuffer.sampleRate);
        const chunkBuffer = chunkCtx.createBuffer(1, chunkLength, monoBuffer.sampleRate);
        chunkBuffer.copyToChannel(
          monoBuffer.getChannelData(0).slice(startSample, endSample),
          0
        );
        await chunkCtx.startRendering();

        // Encode to WAV (mono 16kHz 16-bit = ~800KB per 25s chunk)
        const wavBlob = encodeWav(chunkBuffer);

        addToast('info', `Transcribing chunk ${i + 1}/${totalChunks}...`);

        const currentStore = useLectureStore.getState();
        const text = await transcribeAudio(wavBlob, currentStore.transcript, currentStore.language);
        if (text && text.trim()) {
          useLectureStore.getState().appendTranscript(text.trim());
        }
      }

      // Run analysis on the complete transcript
      const finalStore = useLectureStore.getState();
      const newText = finalStore.getNewText();
      if (newText && newText.length >= 40) {
        addToast('info', 'Analyzing concepts...');
        const delta = await analyzeText(newText, finalStore.nodes, finalStore.edges, finalStore.language);
        if (delta.nodes_to_add.length > 0 || delta.edges_to_add.length > 0) {
          const s = useLectureStore.getState();
          processDelta(delta, s.addGraphDelta, s.updateNodePositions, s.nodes, s.edges);
        }
        useLectureStore.getState().markAnalyzed();
      }

      // Generate summary if enough text
      const afterAnalysis = useLectureStore.getState();
      if (afterAnalysis.transcript.length >= 100) {
        addToast('info', 'Generating summary...');
        const summary = await generateSummary(afterAnalysis.transcript, afterAnalysis.language);
        useLectureStore.getState().setSummary(summary);
        addToast('success', 'Audio processed — summary ready!');
      } else {
        addToast('success', 'Audio transcribed successfully');
      }
    } catch (err) {
      console.error('Audio upload error:', err);
      addToast('error', `Upload failed: ${err.message}`);
    } finally {
      useLectureStore.getState().setStatus('idle');
    }
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <svg viewBox="0 0 32 32" fill="none">
              <defs>
                <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#818cf8" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
              </defs>
              <circle cx="16" cy="16" r="14" stroke="url(#logo-grad)" strokeWidth="2.5" fill="none" />
              <circle cx="16" cy="16" r="4" fill="url(#logo-grad)" />
              <circle cx="8" cy="10" r="2.5" fill="url(#logo-grad)" opacity="0.7" />
              <circle cx="24" cy="10" r="2.5" fill="url(#logo-grad)" opacity="0.7" />
              <circle cx="10" cy="22" r="2.5" fill="url(#logo-grad)" opacity="0.7" />
              <circle cx="22" cy="22" r="2.5" fill="url(#logo-grad)" opacity="0.7" />
              <line x1="10" y1="11.5" x2="14" y2="14" stroke="url(#logo-grad)" strokeWidth="1.2" opacity="0.5" />
              <line x1="22" y1="11.5" x2="18" y2="14" stroke="url(#logo-grad)" strokeWidth="1.2" opacity="0.5" />
              <line x1="11.5" y1="20.5" x2="14" y2="18" stroke="url(#logo-grad)" strokeWidth="1.2" opacity="0.5" />
              <line x1="20.5" y1="20.5" x2="18" y2="18" stroke="url(#logo-grad)" strokeWidth="1.2" opacity="0.5" />
            </svg>
          </div>
          <span className="logo-text">
            Lecture<span className="logo-accent">AI</span>
          </span>
        </div>

        <div className="header-controls">
          {/* Language selector */}
          <div className="language-selector">
            <button
              className={`lang-btn ${language === 'it' ? 'active' : ''}`}
              onClick={() => setLanguage('it')}
              disabled={status !== 'idle'}
              title="Italiano"
            >
              🇮🇹 IT
            </button>
            <button
              className={`lang-btn ${language === 'en' ? 'active' : ''}`}
              onClick={() => setLanguage('en')}
              disabled={status !== 'idle'}
              title="English"
            >
              🇬🇧 EN
            </button>
          </div>

          <RecordButton />

          {/* Audio file upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleAudioUpload}
            style={{ display: 'none' }}
          />
          <button
            className="upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={status !== 'idle'}
            title="Upload audio file"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </button>
        </div>

        <StatsBar />
      </header>

      {/* Main content: split panels */}
      <main className="app-main">
        <TranscriptPanel />
        <div className="panel-divider" />
        <KnowledgeGraph />
      </main>

      {/* Summary overlay (appears when lecture ends) */}
      <SummaryPanel />

      {/* Export bar (appears when transcript exists) */}
      <ExportBar />

      {/* Toast notifications */}
      <Toast />
    </div>
  );
}

/**
 * Downsample and mix to mono using OfflineAudioContext.
 * This properly resamples (no aliasing) and merges channels.
 */
async function downsampleToMono(audioBuffer, targetRate) {
  const duration = audioBuffer.duration;
  const targetLength = Math.ceil(duration * targetRate);
  const offlineCtx = new OfflineAudioContext(1, targetLength, targetRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  return await offlineCtx.startRendering();
}

/**
 * Encode a mono AudioBuffer to a WAV Blob (16-bit PCM).
 * Always outputs mono regardless of input channel count.
 */
function encodeWav(buffer) {
  const sampleRate = buffer.sampleRate;
  const samples = buffer.getChannelData(0);
  const numSamples = samples.length;
  const bytesPerSample = 2; // 16-bit
  const dataLength = numSamples * bytesPerSample;
  const headerLength = 44;
  const totalLength = headerLength + dataLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // RIFF header
  writeStr(view, 0, 'RIFF');
  view.setUint32(4, totalLength - 8, true);
  writeStr(view, 8, 'WAVE');

  // fmt chunk
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);        // chunk size
  view.setUint16(20, 1, true);         // PCM format
  view.setUint16(22, 1, true);         // mono
  view.setUint32(24, sampleRate, true); // sample rate
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true);              // block align
  view.setUint16(34, 16, true);        // bits per sample

  // data chunk
  writeStr(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // PCM samples
  let offset = headerLength;
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}



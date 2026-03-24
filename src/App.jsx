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

export default function App() {
  const language = useLectureStore((s) => s.language);
  const setLanguage = useLectureStore((s) => s.setLanguage);
  const status = useLectureStore((s) => s.status);
  const appendTranscript = useLectureStore((s) => s.appendTranscript);
  const addToast = useToastStore((s) => s.addToast);
  const fileInputRef = useRef(null);

  const handleAudioUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input for re-upload
    e.target.value = '';

    const store = useLectureStore.getState();
    if (store.status !== 'idle') {
      addToast('warning', 'Stop the current recording before uploading a file');
      return;
    }

    useLectureStore.getState().setStatus('processing');
    addToast('info', `Processing ${file.name}...`);

    try {
      // Split large files into ~25s chunks (Whisper has a limit)
      const CHUNK_DURATION_MS = 25000;
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const totalDuration = audioBuffer.duration * 1000;
      const chunks = Math.ceil(totalDuration / CHUNK_DURATION_MS);

      for (let i = 0; i < chunks; i++) {
        const startSec = (i * CHUNK_DURATION_MS) / 1000;
        const endSec = Math.min(((i + 1) * CHUNK_DURATION_MS) / 1000, audioBuffer.duration);

        // Create a new buffer for this chunk
        const chunkLength = Math.ceil((endSec - startSec) * audioBuffer.sampleRate);
        const chunkBuffer = audioContext.createBuffer(
          audioBuffer.numberOfChannels,
          chunkLength,
          audioBuffer.sampleRate
        );

        for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
          const channelData = audioBuffer.getChannelData(ch);
          const startSample = Math.floor(startSec * audioBuffer.sampleRate);
          chunkBuffer.copyToChannel(channelData.slice(startSample, startSample + chunkLength), ch);
        }

        // Encode chunk to WAV blob
        const wavBlob = audioBufferToWav(chunkBuffer);
        const currentStore = useLectureStore.getState();
        const text = await transcribeAudio(wavBlob, currentStore.transcript, currentStore.language);
        if (text && text.trim()) {
          useLectureStore.getState().appendTranscript(text.trim());
        }
      }

      await audioContext.close();

      // Run analysis on the uploaded transcript
      const finalStore = useLectureStore.getState();
      const newText = finalStore.getNewText();
      if (newText && newText.length >= 40) {
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

/** Convert AudioBuffer to WAV Blob */
function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const samples = buffer.getChannelData(0);
  const dataLength = samples.length * blockAlign;
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // WAV header
  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, bufferLength - 8, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}


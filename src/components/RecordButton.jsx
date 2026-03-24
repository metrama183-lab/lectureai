// components/RecordButton.jsx — idle / recording / processing states

import { useCallback, useRef, useEffect, useState } from 'react';
import useLectureStore from '../store/lectureStore';
import useToastStore from '../store/toastStore';
import { AudioManager } from '../lib/audioManager';
import { transcribeAudio } from '../lib/whisperClient';
import { analyzeText, generateSummary } from '../lib/mistralClient';
import { processDelta } from '../lib/graphBuilder';

const ANALYSIS_INTERVAL_MS = 30000; // 30 seconds — faster feedback during demo
const MIN_TEXT_FOR_ANALYSIS = 40;    // chars

export default function RecordButton() {
  const status = useLectureStore((s) => s.status);
  const setStatus = useLectureStore((s) => s.setStatus);
  const appendTranscript = useLectureStore((s) => s.appendTranscript);
  const addGraphDelta = useLectureStore((s) => s.addGraphDelta);
  const updateNodePositions = useLectureStore((s) => s.updateNodePositions);
  const markAnalyzed = useLectureStore((s) => s.markAnalyzed);
  const setSummary = useLectureStore((s) => s.setSummary);
  const reset = useLectureStore((s) => s.reset);
  const setRecordingStartedAt = useLectureStore((s) => s.setRecordingStartedAt);
  const addToast = useToastStore((s) => s.addToast);

  const audioManagerRef = useRef(null);
  const analyzeIntervalRef = useRef(null);
  const pendingTranscriptionsRef = useRef(0);

  // Audio level for visualization (0–1)
  const [audioLevel, setAudioLevel] = useState(0);
  const [isVoiceActive, setIsVoiceActive] = useState(false);

  const runAnalysis = useCallback(async () => {
    const store = useLectureStore.getState();
    const newText = store.getNewText();
    if (!newText || newText.length < MIN_TEXT_FOR_ANALYSIS) return;

    try {
      const delta = await analyzeText(newText, store.nodes, store.edges, store.language);
      if (delta.nodes_to_add.length > 0 || delta.edges_to_add.length > 0) {
        const currentStore = useLectureStore.getState();
        processDelta(delta, addGraphDelta, updateNodePositions, currentStore.nodes, currentStore.edges);
        addToast('success', `+${delta.nodes_to_add.length} concepts added to graph`);
      }
      markAnalyzed();
    } catch (err) {
      console.error('Analysis error:', err);
      addToast('warning', 'Graph update delayed — will retry');
    }
  }, [addGraphDelta, updateNodePositions, markAnalyzed, addToast]);

  const startAnalyzeLoop = useCallback(() => {
    analyzeIntervalRef.current = setInterval(runAnalysis, ANALYSIS_INTERVAL_MS);
  }, [runAnalysis]);

  const stopAnalyzeLoop = useCallback(() => {
    if (analyzeIntervalRef.current) {
      clearInterval(analyzeIntervalRef.current);
      analyzeIntervalRef.current = null;
    }
  }, []);

  // Wait for all in-flight transcription requests to settle (max 8s)
  const waitForPendingTranscriptions = useCallback(async () => {
    const deadline = Date.now() + 8000;
    while (pendingTranscriptionsRef.current > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }, []);

  const handleClick = useCallback(async () => {
    if (status === 'idle') {
      reset();
      setStatus('recording');
      setRecordingStartedAt(Date.now());

      const manager = new AudioManager();
      audioManagerRef.current = manager;

      // Live audio level for visualization
      manager.onLevel((level, voiceActive) => {
        setAudioLevel(level);
        setIsVoiceActive(voiceActive);
      });

      manager.onChunk(async (blob) => {
        pendingTranscriptionsRef.current++;
        try {
          const store = useLectureStore.getState();
          const text = await transcribeAudio(blob, store.transcript, store.language);
          if (text && text.trim()) {
            appendTranscript(text.trim());
          }
        } catch (err) {
          console.error('Transcription error:', err);
          addToast('error', 'Transcription failed — check your connection');
        } finally {
          pendingTranscriptionsRef.current--;
        }
      });

      try {
        await manager.start();
        startAnalyzeLoop();
      } catch (err) {
        console.error('Mic access error:', err);
        setStatus('idle');
        setRecordingStartedAt(null);
        addToast('error', 'Microphone access denied — please allow microphone and retry');
      }
    } else if (status === 'recording') {
      setStatus('processing');
      stopAnalyzeLoop();
      setAudioLevel(0);
      setIsVoiceActive(false);

      if (audioManagerRef.current) {
        audioManagerRef.current.stop();
        audioManagerRef.current = null;
      }

      // Wait for any in-flight transcriptions to finish before final analysis
      await waitForPendingTranscriptions();

      const store = useLectureStore.getState();
      const newText = store.getNewText();

      try {
        if (newText && newText.length >= 20) {
          const delta = await analyzeText(newText, store.nodes, store.edges, store.language);
          if (delta.nodes_to_add.length > 0 || delta.edges_to_add.length > 0) {
            const currentStore = useLectureStore.getState();
            processDelta(delta, addGraphDelta, updateNodePositions, currentStore.nodes, currentStore.edges);
          }
          markAnalyzed();
        }

        if (store.transcript && store.transcript.length >= 100) {
          const summary = await generateSummary(store.transcript, store.language);
          setSummary(summary);
          addToast('success', 'Summary ready!');
        }
      } catch (err) {
        console.error('Final analysis error:', err);
        addToast('error', 'Final analysis failed — transcript is still available');
      }

      setStatus('idle');
      setRecordingStartedAt(null);
    }
  }, [
    status, setStatus, reset, appendTranscript, addGraphDelta,
    updateNodePositions, markAnalyzed, setSummary, setRecordingStartedAt,
    startAnalyzeLoop, stopAnalyzeLoop, waitForPendingTranscriptions, addToast,
  ]);

  // Keyboard shortcut: Space to start/stop (when not focused on input)
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' && e.target === document.body && status !== 'processing') {
        e.preventDefault();
        handleClick();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClick, status]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAnalyzeLoop();
      if (audioManagerRef.current) {
        audioManagerRef.current.stop();
      }
    };
  }, [stopAnalyzeLoop]);

  return (
    <button
      className={`record-button ${status}`}
      onClick={handleClick}
      title={
        status === 'idle' ? 'Start recording (or press Space)'
        : status === 'recording' ? 'Stop recording (or press Space)'
        : 'Processing...'
      }
      disabled={status === 'processing'}
    >
      <div className="record-button-inner">
        {status === 'idle' && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        )}
        {status === 'recording' && (
          <div className="recording-pulse">
            <div className="pulse-ring" />
            <div className="pulse-ring delay-1" />
            <div className="pulse-ring delay-2" />
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </div>
        )}
        {status === 'processing' && (
          <div className="processing-spinner" />
        )}
      </div>

      <span className="record-button-label">
        {status === 'idle' && 'Start Lecture'}
        {status === 'recording' && 'Stop & Analyze'}
        {status === 'processing' && 'Processing...'}
      </span>

      {/* Live audio level bars */}
      {status === 'recording' && (
        <div className={`audio-level-bars ${isVoiceActive ? 'active' : ''}`}>
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="audio-bar"
              style={{ '--bar-scale': Math.max(0.15, audioLevel * (0.6 + i * 0.15)) }}
            />
          ))}
        </div>
      )}
    </button>
  );
}

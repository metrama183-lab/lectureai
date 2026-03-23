// components/TranscriptPanel.jsx — live streaming transcript, auto-scroll

import { useEffect, useRef } from 'react';
import useLectureStore from '../store/lectureStore';

export default function TranscriptPanel() {
  const transcript = useLectureStore((s) => s.transcript);
  const status = useLectureStore((s) => s.status);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);

  // Auto-scroll to bottom when new text arrives
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcript]);

  // Split transcript into sentences for visual paragraphs
  const sentences = transcript
    ? transcript.split(/(?<=[.!?])\s+/).filter(Boolean)
    : [];

  return (
    <div className="transcript-panel" ref={scrollRef}>
      <div className="transcript-header">
        <div className="transcript-header-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <h2>Live Transcript</h2>
        {status === 'recording' && (
          <div className="recording-indicator">
            <span className="recording-dot" />
            LIVE
          </div>
        )}
      </div>

      <div className="transcript-content">
        {sentences.length === 0 && status === 'idle' && (
          <div className="transcript-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="empty-icon">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
            <p>Press <strong>Start Lecture</strong> to begin transcribing</p>
            <button
              className="transcript-start-btn"
              onClick={() => document.querySelector('.record-button')?.click()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
              Start Lecture
            </button>
            <span className="empty-hint">Audio is processed locally — only voice segments are sent for transcription</span>
          </div>
        )}

        {sentences.length === 0 && status === 'recording' && (
          <div className="transcript-listening">
            <div className="listening-wave">
              <span /><span /><span /><span /><span />
            </div>
            <p>Listening for speech...</p>
          </div>
        )}

        {sentences.map((sentence, i) => (
          <span
            key={i}
            className={`transcript-sentence ${i === sentences.length - 1 ? 'latest' : ''}`}
          >
            {sentence}{' '}
          </span>
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

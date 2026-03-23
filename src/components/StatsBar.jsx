// components/StatsBar.jsx — live stats: timer, word count, concept count

import { useEffect, useState } from 'react';
import useLectureStore from '../store/lectureStore';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function StatsBar() {
  const status = useLectureStore((s) => s.status);
  const recordingStartedAt = useLectureStore((s) => s.recordingStartedAt);
  const transcript = useLectureStore((s) => s.transcript);
  const nodes = useLectureStore((s) => s.nodes);

  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (status !== 'recording' || !recordingStartedAt) return;
    const id = setInterval(() => {
      setElapsedMs(Date.now() - recordingStartedAt);
    }, 1000);
    return () => clearInterval(id);
  }, [status, recordingStartedAt]);

  const elapsed = status === 'recording' ? Math.floor(elapsedMs / 1000) : 0;

  const wordCount = transcript ? transcript.trim().split(/\s+/).filter(Boolean).length : 0;
  const conceptCount = nodes.length;

  if (status === 'idle' && wordCount === 0) return null;

  return (
    <div className="stats-bar">
      {status === 'recording' && (
        <div className="stat-item stat-timer">
          <span className="stat-dot recording" />
          <span className="stat-value">{formatTime(elapsed)}</span>
        </div>
      )}
      {wordCount > 0 && (
        <div className="stat-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="21" y1="10" x2="3" y2="10" />
            <line x1="21" y1="6" x2="3" y2="6" />
            <line x1="21" y1="14" x2="3" y2="14" />
            <line x1="21" y1="18" x2="9" y2="18" />
          </svg>
          <span className="stat-value">{wordCount.toLocaleString()}</span>
          <span className="stat-label">words</span>
        </div>
      )}
      {conceptCount > 0 && (
        <div className="stat-item">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <circle cx="4" cy="6" r="2" />
            <circle cx="20" cy="6" r="2" />
            <line x1="6" y1="7" x2="10" y2="10" />
            <line x1="18" y1="7" x2="14" y2="10" />
          </svg>
          <span className="stat-value">{conceptCount}</span>
          <span className="stat-label">concepts</span>
        </div>
      )}
    </div>
  );
}

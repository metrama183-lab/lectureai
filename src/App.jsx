// App.jsx — layout: TranscriptPanel | KnowledgeGraph

import RecordButton from './components/RecordButton';
import TranscriptPanel from './components/TranscriptPanel';
import KnowledgeGraph from './components/KnowledgeGraph';
import SummaryPanel from './components/SummaryPanel';
import ExportBar from './components/ExportBar';
import Toast from './components/Toast';
import StatsBar from './components/StatsBar';

export default function App() {
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
        <RecordButton />
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

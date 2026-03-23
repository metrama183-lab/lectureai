// components/SummaryPanel.jsx — key points + probable review questions

import useLectureStore from '../store/lectureStore';

export default function SummaryPanel() {
  const summary = useLectureStore((s) => s.summary);
  const showSummary = useLectureStore((s) => s.showSummary);

  if (!summary || !showSummary) return null;

  return (
    <div className="summary-overlay">
      <div className="summary-panel">
        <div className="summary-header">
          <div className="summary-header-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <h2>Lecture Summary</h2>
          <button
            className="summary-close"
            onClick={() => useLectureStore.getState().setShowSummary(false)}
            title="Close summary"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="summary-body">
          {summary.keyPoints && summary.keyPoints.length > 0 && (
            <section className="summary-section">
              <h3>
                <span className="section-icon">📌</span>
                Key Points
              </h3>
              <ul className="key-points-list">
                {summary.keyPoints.map((point, i) => (
                  <li key={i} className="key-point" style={{ animationDelay: `${i * 0.08}s` }}>
                    <span className="key-point-marker">{i + 1}</span>
                    <span className="key-point-text">{point}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {summary.questions && summary.questions.length > 0 && (
            <section className="summary-section">
              <h3>
                <span className="section-icon">❓</span>
                Review Questions
              </h3>
              <ul className="questions-list">
                {summary.questions.map((question, i) => (
                  <li key={i} className="question-item" style={{ animationDelay: `${i * 0.08 + 0.3}s` }}>
                    <span className="question-text">{question}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// components/ExportBar.jsx — PDF (html-to-image + jspdf) + Markdown blob

import { useState } from 'react';
import useLectureStore from '../store/lectureStore';

export default function ExportBar() {
  const transcript = useLectureStore((s) => s.transcript);
  const nodes = useLectureStore((s) => s.nodes);
  const edges = useLectureStore((s) => s.edges);
  const summary = useLectureStore((s) => s.summary);
  const [exporting, setExporting] = useState(false);

  const hasContent = transcript && transcript.length > 0;

  const exportMarkdown = () => {
    let md = '# LectureAI — Lecture Notes\n\n';
    md += `_Exported on ${new Date().toLocaleString()}_\n\n`;

    md += '---\n\n## Transcript\n\n';
    md += transcript + '\n\n';

    if (nodes.length > 0) {
      md += '---\n\n## Knowledge Map — Concepts\n\n';
      nodes.forEach((n) => {
        md += `- **${n.data?.label || n.id}**\n`;
      });
      md += '\n';
    }

    if (edges.length > 0) {
      md += '## Knowledge Map — Relationships\n\n';
      edges.forEach((e) => {
        const sourceNode = nodes.find((n) => n.id === e.source);
        const targetNode = nodes.find((n) => n.id === e.target);
        const sourceLabel = sourceNode?.data?.label || e.source;
        const targetLabel = targetNode?.data?.label || e.target;
        md += `- ${sourceLabel} → _${e.label || 'relates to'}_ → ${targetLabel}\n`;
      });
      md += '\n';
    }

    if (summary) {
      md += '---\n\n## Summary\n\n';
      if (summary.keyPoints?.length) {
        md += '### Key Points\n\n';
        summary.keyPoints.forEach((p, i) => {
          md += `${i + 1}. ${p}\n`;
        });
        md += '\n';
      }
      if (summary.questions?.length) {
        md += '### Review Questions\n\n';
        summary.questions.forEach((q, i) => {
          md += `${i + 1}. ${q}\n`;
        });
        md += '\n';
      }
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lectureai-notes.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    setExporting(true);
    try {
      const { toPng } = await import('html-to-image');
      const { jsPDF } = await import('jspdf');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      // Title
      pdf.setFontSize(22);
      pdf.setFont(undefined, 'bold');
      pdf.text('LectureAI — Lecture Notes', margin, y + 8);
      y += 16;

      pdf.setFontSize(10);
      pdf.setFont(undefined, 'normal');
      pdf.setTextColor(128);
      pdf.text(`Exported on ${new Date().toLocaleString()}`, margin, y);
      y += 10;
      pdf.setTextColor(0);

      // Transcript section
      pdf.setFontSize(16);
      pdf.setFont(undefined, 'bold');
      pdf.text('Transcript', margin, y);
      y += 8;

      pdf.setFontSize(10);
      pdf.setFont(undefined, 'normal');
      const transcriptLines = pdf.splitTextToSize(transcript, contentWidth);
      for (const line of transcriptLines) {
        if (y > 270) { pdf.addPage(); y = margin; }
        pdf.text(line, margin, y);
        y += 5;
      }
      y += 5;

      // Knowledge graph screenshot
      const graphEl = document.getElementById('knowledge-graph');
      if (graphEl && nodes.length > 0) {
        try {
          const dataUrl = await toPng(graphEl, {
            backgroundColor: '#0f172a',
            pixelRatio: 2,
          });

          pdf.addPage();
          y = margin;
          pdf.setFontSize(16);
          pdf.setFont(undefined, 'bold');
          pdf.text('Knowledge Map', margin, y);
          y += 8;

          const img = new Image();
          img.src = dataUrl;
          await new Promise((resolve) => { img.onload = resolve; });

          const imgAspect = img.width / img.height;
          const imgWidth = contentWidth;
          const imgHeight = imgWidth / imgAspect;

          pdf.addImage(dataUrl, 'PNG', margin, y, imgWidth, Math.min(imgHeight, 200));
          y += Math.min(imgHeight, 200) + 10;
        } catch (imgErr) {
          console.warn('Could not capture graph:', imgErr);
        }
      }

      // Summary
      if (summary) {
        pdf.addPage();
        y = margin;
        pdf.setFontSize(16);
        pdf.setFont(undefined, 'bold');
        pdf.text('Summary', margin, y);
        y += 10;

        if (summary.keyPoints?.length) {
          pdf.setFontSize(13);
          pdf.text('Key Points', margin, y);
          y += 7;
          pdf.setFontSize(10);
          pdf.setFont(undefined, 'normal');
          summary.keyPoints.forEach((p, i) => {
            if (y > 270) { pdf.addPage(); y = margin; }
            const lines = pdf.splitTextToSize(`${i + 1}. ${p}`, contentWidth);
            lines.forEach((l) => {
              pdf.text(l, margin, y);
              y += 5;
            });
            y += 2;
          });
          y += 5;
        }

        if (summary.questions?.length) {
          pdf.setFontSize(13);
          pdf.setFont(undefined, 'bold');
          pdf.text('Review Questions', margin, y);
          y += 7;
          pdf.setFontSize(10);
          pdf.setFont(undefined, 'normal');
          summary.questions.forEach((q, i) => {
            if (y > 270) { pdf.addPage(); y = margin; }
            const lines = pdf.splitTextToSize(`${i + 1}. ${q}`, contentWidth);
            lines.forEach((l) => {
              pdf.text(l, margin, y);
              y += 5;
            });
            y += 2;
          });
        }
      }

      pdf.save('lectureai-notes.pdf');
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setExporting(false);
    }
  };

  if (!hasContent) return null;

  return (
    <div className="export-bar">
      <button className="export-btn export-md" onClick={exportMarkdown} disabled={exporting}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        Export Markdown
      </button>
      <button className="export-btn export-pdf" onClick={exportPDF} disabled={exporting}>
        {exporting ? (
          <div className="export-spinner" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <polyline points="9 15 12 18 15 15" />
          </svg>
        )}
        Export PDF
      </button>
    </div>
  );
}

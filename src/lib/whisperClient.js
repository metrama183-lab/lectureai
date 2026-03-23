// lib/whisperClient.js — calls /api/transcribe, passes prompt context
// Sends audio blob to the serverless proxy and returns transcribed text

/**
 * Transcribe an audio Blob via the Groq Whisper proxy
 * @param {Blob} audioBlob - Audio blob from MediaRecorder
 * @param {string} previousContext - Previous transcript text for Whisper prompt context
 * @returns {Promise<string>} Transcribed text
 */
export async function transcribeAudio(audioBlob, previousContext = '') {
  const formData = new FormData();

  // Whisper expects a file with a proper name and extension
  const file = new File([audioBlob], 'audio.webm', { type: audioBlob.type });
  formData.append('file', file);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('response_format', 'json');

  // Pass previous context so Whisper maintains continuity between chunks
  if (previousContext) {
    // Whisper prompt accepts up to ~224 tokens — use the last ~500 chars
    const contextSnippet = previousContext.slice(-500);
    formData.append('prompt', contextSnippet);
  }

  const response = await fetch('/api/transcribe', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Transcription failed (${response.status})`);
  }

  const data = await response.json();
  return data.text || '';
}

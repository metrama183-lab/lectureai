// lib/audioManager.js — VAD + MediaRecorder
// Energy-based Voice Activity Detection using AnalyserNode
// Emits audio Blob chunks only when voice is detected
// Includes auto-calibration and real-time level reporting

export class AudioManager {
  constructor() {
    this.stream = null;
    this.audioContext = null;
    this.analyser = null;
    this.mediaRecorder = null;
    this.isListening = false;
    this.isRecordingChunk = false;
    this.onChunkCallback = null;
    this.onLevelCallback = null;
    this.chunks = [];
    this.vadInterval = null;

    // VAD parameters — threshold auto-calibrated on start
    this.silenceThreshold = 0.015;
    this.silenceDuration = 700;    // ms of silence before closing a chunk
    this.silenceStart = null;
    this.minChunkDuration = 500;   // don't send chunks shorter than 500ms
    this.chunkStartTime = null;
  }

  /**
   * Register callback for when a valid audio chunk is ready
   */
  onChunk(callback) {
    this.onChunkCallback = callback;
  }

  /**
   * Register callback for real-time audio level (0–1, normalized)
   * Called every ~50ms while listening
   */
  onLevel(callback) {
    this.onLevelCallback = callback;
  }

  /**
   * Start listening to the microphone.
   * Auto-calibrates noise floor in the first 600ms.
   */
  async start() {
    if (this.isListening) return;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      },
    });

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = this.audioContext.createMediaStreamSource(this.stream);

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.3;
    source.connect(this.analyser);

    this.isListening = true;

    // Auto-calibrate: sample ambient noise for 600ms, set threshold slightly above it
    await this._calibrate();

    this._startVAD();
  }

  /**
   * Sample ambient noise for 600ms and set a dynamic silence threshold
   */
  async _calibrate() {
    const samples = [];
    const start = Date.now();
    while (Date.now() - start < 600) {
      samples.push(this._getRMS());
      await new Promise((r) => setTimeout(r, 50));
    }
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    // Threshold = ambient floor * 3 (at least 0.010, at most 0.040)
    this.silenceThreshold = Math.min(Math.max(avg * 3, 0.010), 0.040);
  }

  /**
   * Stop everything and clean up
   */
  stop() {
    this.isListening = false;

    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }

    // If currently recording, finalize the chunk
    if (this.isRecordingChunk && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }

    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }

  /**
   * Compute RMS energy from the analyser
   */
  _getRMS() {
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  }

  /**
   * Run VAD loop every 50ms
   */
  _startVAD() {
    this.vadInterval = setInterval(() => {
      if (!this.isListening || !this.analyser) return;

      const rms = this._getRMS();
      const voiceDetected = rms > this.silenceThreshold;

      // Emit normalized level (0–1) for UI visualization
      if (this.onLevelCallback) {
        const level = Math.min(rms / (this.silenceThreshold * 4), 1);
        this.onLevelCallback(level, voiceDetected);
      }

      if (voiceDetected) {
        this.silenceStart = null;

        if (!this.isRecordingChunk) {
          this._startChunkRecording();
        }
      } else {
        // Silence detected
        if (this.isRecordingChunk) {
          if (!this.silenceStart) {
            this.silenceStart = Date.now();
          } else if (Date.now() - this.silenceStart >= this.silenceDuration) {
            this._stopChunkRecording();
            this.silenceStart = null;
          }
        }
      }
    }, 50);
  }

  /**
   * Start recording a new audio chunk
   */
  _startChunkRecording() {
    if (!this.stream || this.isRecordingChunk) return;

    this.chunks = [];
    this.isRecordingChunk = true;
    this.chunkStartTime = Date.now();

    // Use webm/opus for best browser compat and small file size
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      this.isRecordingChunk = false;
      const duration = Date.now() - (this.chunkStartTime || 0);

      if (duration >= this.minChunkDuration && this.chunks.length > 0) {
        const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType });
        if (this.onChunkCallback) {
          this.onChunkCallback(blob);
        }
      }

      this.chunks = [];
    };

    this.mediaRecorder.start(100); // timeslice: collect data every 100ms
  }

  /**
   * Stop current chunk recording
   */
  _stopChunkRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }
}

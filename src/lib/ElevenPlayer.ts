// Plays mp3 chunks through MediaSource (Chrome/Edge). Falls back to WebAudio decode if needed.
export class ElevenPlayer {
  private mediaSource?: MediaSource;
  private sourceBuffer?: SourceBuffer;
  private queue: Uint8Array[] = [];
  private updating = false;
  private audioEl: HTMLAudioElement;

  constructor(audioEl: HTMLAudioElement) {
    this.audioEl = audioEl;
  }

  start(mime = "audio/mpeg") {
    if (!("MediaSource" in window) || !MediaSource.isTypeSupported(mime)) {
      // Fallback can decode via AudioContext per-chunk (heavier). Keep simple here.
      console.warn("MSE not supported, consider PCM+WebAudio fallback");
      return;
    }
    this.mediaSource = new MediaSource();
    this.audioEl.src = URL.createObjectURL(this.mediaSource);
    this.mediaSource.addEventListener("sourceopen", () => {
      if (!this.mediaSource) return;
      this.sourceBuffer = this.mediaSource.addSourceBuffer(mime);
      this.sourceBuffer.addEventListener("updateend", () => this.drain());
      this.drain();
      this.audioEl.play().catch(() => {
        /* user gesture might be needed */
      });
    });
  }

  pushBase64(b64: string) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    this.queue.push(bytes);
    this.drain();
  }

  private drain() {
    if (!this.sourceBuffer || !this.queue.length || this.sourceBuffer.updating)
      return;
    const chunk = this.queue.shift()!;
    this.sourceBuffer.appendBuffer(chunk);
  }

  stop() {
    try {
      this.sourceBuffer?.abort();
    } catch {}
    try {
      this.mediaSource?.endOfStream();
    } catch {}
    this.queue = [];
    this.audioEl.pause();
    this.audioEl.src = "";
  }
}


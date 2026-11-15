interface VideoScrubOptions {
  frames: number;
  fps: number;
  onFirstFrame?(): void;
  onProgress?(pct: number | null): void;
  onError?(): void;
}

/** Paused-video scrubbing with a single seek in flight and no queued scroll positions. */
export class VideoScrub {
  private target = 0;
  private shown = -1;
  private inFlight = -1;
  private metadata = false;
  private failed = false;
  private firstFrame = false;
  private abort?: AbortController;
  private objectUrl?: string;
  private watchdog = 0;
  private loadTimer = 0;
  private stalls = 0;

  constructor(private readonly video: HTMLVideoElement, private readonly opts: VideoScrubOptions) {
    video.addEventListener('loadedmetadata', this.onLoadedMetadata);
    video.addEventListener('seeked', this.onSeeked);
    video.addEventListener('error', this.onVideoError);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  seek(frame: number): void {
    this.target = Math.min(this.opts.frames - 1, Math.max(0, frame));
    this.pump();
  }

  /** Downloads the MP4 once into a Blob; direct Range-based playback is the network/CORS fallback. */
  async load(url: string, timeoutMs = 15000): Promise<void> {
    this.video.muted = true;
    this.video.defaultMuted = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    // iOS: a slow network, a lost event or a decoder that never paints must not leave the hero frozen; the caller falls back to frames.
    this.loadTimer = window.setTimeout(() => { if (!this.firstFrame) this.fail(); }, timeoutMs);
    const controller = new AbortController();
    this.abort = controller;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Video download failed: ${response.status}`);
      const total = Number(response.headers.get('Content-Length'));
      const measurable = Number.isFinite(total) && total > 0;
      if (!measurable) this.opts.onProgress?.(null);
      let blob: Blob;
      if (response.body) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              received += value.byteLength;
              if (measurable) this.opts.onProgress?.(Math.min(100, Math.round((received / total) * 100)));
            }
          }
        } finally {
          reader.releaseLock();
        }
        blob = new Blob(chunks as BlobPart[], { type: 'video/mp4' });
      } else {
        blob = new Blob([await response.blob()], { type: 'video/mp4' });
      }
      if (controller.signal.aborted) return;
      this.opts.onProgress?.(100);
      this.objectUrl = URL.createObjectURL(blob);
      this.setSrc(this.objectUrl);
    } catch {
      if (controller.signal.aborted || this.failed) return;
      this.opts.onProgress?.(null);
      try {
        this.setSrc(url);
      } catch {
        this.fail();
      }
    }
  }

  /** iOS Safari ignores `preload` on a src set from script until load() is called. */
  private setSrc(src: string): void {
    this.video.src = src;
    this.video.load();
  }

  destroy(): void {
    this.abort?.abort();
    clearTimeout(this.watchdog);
    clearTimeout(this.loadTimer);
    this.video.removeEventListener('loadedmetadata', this.onLoadedMetadata);
    this.video.removeEventListener('seeked', this.onSeeked);
    this.video.removeEventListener('error', this.onVideoError);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.video.removeAttribute('src');
    this.video.load();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }

  private readonly onLoadedMetadata = () => {
    if (this.metadata || this.failed) return;
    // iOS Safari may not paint seeks of a video that never played: one muted play()/pause() wakes the decoder.
    // Low Power Mode rejects it; seeking still works then, so the result is ignored (bounded by a timeout).
    let done = false;
    const ready = () => {
      if (done) return;
      done = true;
      this.video.pause();
      this.metadata = true;
      this.shown = -1;
      this.pump();
    };
    try {
      const played = this.video.play();
      if (played) played.then(() => { this.video.pause(); ready(); }, ready);
      else ready();
    } catch {
      ready();
    }
    window.setTimeout(ready, 600);
  };

  private readonly onSeeked = () => {
    if (this.failed || this.inFlight < 0) return;
    clearTimeout(this.watchdog);
    this.stalls = 0;
    this.shown = this.inFlight;
    this.inFlight = -1;
    if (!this.firstFrame) {
      this.firstFrame = true;
      clearTimeout(this.loadTimer);
      this.opts.onFirstFrame?.();
    }
    this.pump();
  };

  private readonly onVideoError = () => this.fail();

  private readonly onVisibility = () => {
    if (document.visibilityState !== 'visible' || this.failed || !this.metadata) return;
    // A suspended decoder can leave a seek pending: restart it at the latest scroll position.
    if (this.inFlight >= 0) {
      this.inFlight = -1;
      this.shown = -1;
    }
    this.pump();
  };

  /** Seeks to the centre of the latest target frame, with at most one request in flight. */
  private pump(): void {
    if (!this.metadata || this.failed || this.inFlight >= 0 || this.target === this.shown) return;
    this.inFlight = this.target;
    clearTimeout(this.watchdog);
    // WebKit can drop a `seeked` (target equal to the current time, decoder reclaimed): retry, and give up after 3 in a row.
    this.watchdog = window.setTimeout(() => {
      if (this.inFlight < 0 || this.failed) return;
      if (++this.stalls >= 3) return this.fail();
      this.inFlight = -1;
      this.shown = -1;
      this.pump();
    }, 1200);
    try {
      this.video.currentTime = (this.inFlight + 0.5) / this.opts.fps;
    } catch {
      this.inFlight = -1;
      this.fail();
    }
  }

  private fail(): void {
    if (this.failed) return;
    this.failed = true;
    this.inFlight = -1;
    clearTimeout(this.watchdog);
    clearTimeout(this.loadTimer);
    this.abort?.abort();
    this.opts.onError?.();
  }
}

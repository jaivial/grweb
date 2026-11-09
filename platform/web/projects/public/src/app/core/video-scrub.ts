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
  async load(url: string): Promise<void> {
    this.video.muted = true;
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
      this.video.src = this.objectUrl;
    } catch {
      if (controller.signal.aborted || this.failed) return;
      this.opts.onProgress?.(null);
      try {
        this.video.src = url;
      } catch {
        this.fail();
      }
    }
  }

  destroy(): void {
    this.abort?.abort();
    this.video.removeEventListener('loadedmetadata', this.onLoadedMetadata);
    this.video.removeEventListener('seeked', this.onSeeked);
    this.video.removeEventListener('error', this.onVideoError);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.video.removeAttribute('src');
    this.video.load();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }

  private readonly onLoadedMetadata = () => {
    this.metadata = true;
    this.pump();
  };

  private readonly onSeeked = () => {
    if (this.failed || this.inFlight < 0) return;
    this.shown = this.inFlight;
    this.inFlight = -1;
    if (!this.firstFrame) {
      this.firstFrame = true;
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
    this.opts.onError?.();
  }
}

import { Injectable, computed, inject, signal } from '@angular/core';
import { EventStreamContentType, fetchEventSource } from '@microsoft/fetch-event-source';
import { Subject } from 'rxjs';
import { Auth } from './auth';

export interface LiveEvent {
  id: string;
  tipo: string;
  entidad?: string;
  datos?: Record<string, unknown>;
  actor?: string;
  origen?: string;
  fecha: string;
}

class Retry extends Error {}

/** Connection state shown by `bo-live-status` (Figma 48/50): offline after 3 failed attempts or without network. */
export type RealtimeStatus = 'connected' | 'reconnecting' | 'offline' | 'paused';

/**
 * Admin real-time channel: GET /api/admin/competiciones/{cid}/stream (SSE over fetch so the bearer token can be sent).
 * Resumes with Last-Event-ID; control events: `reautenticar` (token expiring → refresh and reconnect),
 * `reconectar`, `resync` (history lost → screens reload their data).
 */
@Injectable({ providedIn: 'root' })
export class Realtime {
  private readonly auth = inject(Auth);
  private ctrl: AbortController | null = null;
  private lastId = '';
  private cid = '';
  private readonly fallos = signal(0);
  private readonly activo = signal(false);
  /** Browser network state (window online/offline): offline is shown at once, coming back reconnects at once. */
  private readonly online = signal(typeof navigator === 'undefined' || navigator.onLine !== false);
  private wake: (() => void) | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('offline', () => {
      this.online.set(false);
      this.connected.set(false);
    });
    window.addEventListener('online', () => {
      this.online.set(true);
      if (this.cid && this.activo() && !this.connected()) this.reconnect();
    });
  }

  readonly connected = signal(false);
  /** Failed reconnection attempts since the last successful open. */
  readonly intentos = this.fallos.asReadonly();
  readonly status = computed<RealtimeStatus>(() =>
    !this.activo() ? 'paused' : !this.online() ? 'offline' : this.connected() ? 'connected' : this.fallos() >= 3 ? 'offline' : 'reconnecting');
  readonly events = new Subject<LiveEvent>();
  readonly resync = new Subject<void>();

  connect(cid: string): void {
    if (this.cid === cid && this.ctrl) return;
    this.disconnect();
    this.cid = cid;
    this.lastId = '';
    this.fallos.set(0);
    void this.run();
  }

  disconnect(): void {
    this.ctrl?.abort();
    this.ctrl = null;
    this.wake?.();
    this.connected.set(false);
    this.activo.set(false);
  }

  /** Forces a reconnection (the «Conexión en vivo perdida» banner of the screens). */
  reconnect(): void {
    if (!this.cid) return;
    this.disconnect();
    this.lastId = '';
    this.fallos.set(0);
    void this.run();
  }

  private async run(): Promise<void> {
    const ctrl = new AbortController();
    this.ctrl = ctrl;
    this.activo.set(true);
    while (!ctrl.signal.aborted) {
      const token = await this.auth.freshToken();
      if (!token) {
        // no session: stop and show «paused» instead of an endless «Reconectando…»
        this.connected.set(false);
        this.activo.set(false);
        if (this.ctrl === ctrl) this.ctrl = null;
        return;
      }
      try {
        await fetchEventSource(`/api/admin/competiciones/${this.cid}/stream`, {
          signal: ctrl.signal,
          openWhenHidden: true,
          headers: { Authorization: `Bearer ${token}`, ...(this.lastId ? { 'Last-Event-ID': this.lastId } : {}) },
          onopen: async (res) => {
            if (res.ok && res.headers.get('content-type')?.startsWith(EventStreamContentType)) {
              this.connected.set(true);
              this.fallos.set(0);
              return;
            }
            throw new Retry(String(res.status));
          },
          onmessage: (m) => {
            if (m.event === 'reautenticar' || m.event === 'reconectar') throw new Retry(m.event);
            if (m.event === 'resync') {
              this.resync.next();
              return;
            }
            if (m.id) this.lastId = m.id;
            if (!m.data) return;
            try {
              this.events.next(JSON.parse(m.data) as LiveEvent);
            } catch {
              /* ignore malformed */
            }
          },
          onclose: () => {
            throw new Retry('cerrado');
          },
          onerror: (err) => {
            throw err; // handled by the loop below (we control the back-off)
          },
        });
      } catch {
        this.connected.set(false);
        if (ctrl.signal.aborted) return;
        this.fallos.update((n) => n + 1);
        // exponential back-off with jitter, capped at 30 s
        const base = Math.min(30000, 2000 * 2 ** Math.min(this.fallos() - 1, 4));
        await new Promise<void>((r) => {
          const t = setTimeout(r, base + Math.random() * 2000);
          this.wake = () => {
            clearTimeout(t);
            r();
          };
        });
        this.wake = null;
      }
    }
  }
}

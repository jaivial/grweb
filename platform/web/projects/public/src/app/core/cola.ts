import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { retry, tap, timer } from 'rxjs';

/**
 * Waiting room (perf-20261115): over its limit of active fans the gateway answers 503 `EN_COLA` with the position.
 * The request is retried on its own after `reintentarEn` seconds while the page shows «Estás en la cola»; when
 * it gets in the overlay goes away. Saturation (`SERVICIO_SATURADO`) is retried the same way, without the overlay.
 */
@Injectable({ providedIn: 'root' })
export class ColaEspera {
  /** Position in the queue, null when the fan is not waiting. */
  readonly posicion = signal<number | null>(null);
}

const MAX_REINTENTOS = 40;

export const colaInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/')) return next(req);
  const cola = inject(ColaEspera);
  return next(req).pipe(
    retry({
      count: MAX_REINTENTOS,
      delay: (e: unknown) => {
        if (!(e instanceof HttpErrorResponse) || e.status !== 503) throw e;
        const code = e.error?.code;
        if (code === 'EN_COLA') {
          cola.posicion.set(Number(e.error?.posicion) || 1);
          return timer(Math.max(1, Number(e.error?.reintentarEn) || 5) * 1000 * (0.8 + Math.random() * 0.4));
        }
        if (code === 'SERVICIO_SATURADO') return timer((1 + Math.random() * 2) * 1000);
        throw e;
      },
    }),
    // any answer that is not EN_COLA means the fan got in
    tap({ next: () => cola.posicion.set(null), error: () => cola.posicion.set(null) }),
  );
};

@Component({
  selector: 'gr-cola-espera',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (cola.posicion(); as pos) {
    <div class="cola" role="status" aria-live="polite">
      <p class="titulo">Estás en la cola</p>
      <p>Hay mucha gente conectada ahora mismo. Entrarás en cuanto quede sitio, no cierres la página.</p>
      <p class="pos">Posición {{ pos }}</p>
    </div>
  }`,
  styles: `.cola{position:fixed;inset:auto 16px 16px 16px;z-index:1000;max-width:420px;margin:0 auto;padding:16px 20px;border-radius:16px;background:#111;color:#fff;box-shadow:0 8px 32px rgba(0,0,0,.35);text-align:center}
    .titulo{font-weight:700;font-size:1.1rem;margin:0 0 4px}.pos{margin:8px 0 0;font-variant-numeric:tabular-nums;opacity:.85}p{margin:0}`,
})
export class GrColaEspera {
  protected readonly cola = inject(ColaEspera);
}

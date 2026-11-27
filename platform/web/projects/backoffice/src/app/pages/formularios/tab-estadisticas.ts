import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { GrButton, GrCard, GrEmpty, GrAlert, GrKpi, GrSkeleton, fmtNumber } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { FormulariosApi, type Estadisticas, type Formulario } from './api';
import { BoEntregasBarra } from './entregas-barra';
import { BoGraficoDiario } from './grafico-diario';
import { porcentaje } from './formato';
import { BoResultadosCampo } from './resultados-campo';

/**
 * «Estadísticas» tab: the form's KPIs, delivery per channel, origin of the answers (web or email), the last 30 days of
 * responses and the results question by question. Read-only; «Actualizar» reloads.
 */
@Component({
  selector: 'bo-form-estadisticas',
  imports: [BoEntregasBarra, BoGraficoDiario, BoResultadosCampo, GrAlert, GrButton, GrCard, GrEmpty, GrKpi, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-5">
      <div class="flex flex-wrap items-center gap-3">
        <p class="min-w-0 flex-1 basis-72 text-body-s text-text-tertiary">Cómo llega el formulario a los atletas y cómo responden.</p>
        <button type="button" grButton variant="secondary" icon="refresh" [loading]="cargando()" (click)="cargar()">Actualizar</button>
      </div>

      @if (error()) { <gr-alert tone="danger" title="No hemos podido cargar las estadísticas"><button grButton size="s" (click)="cargar()">Reintentar</button></gr-alert> }

      @if (est(); as e) {
        <div class="grid grid-cols-2 gap-3 md:grid-cols-5">
          <gr-kpi label="Destinatarios" [value]="n(e.destinatarios)" [caption]="e.destinatarios === 1 ? 'atleta' : 'atletas'" />
          <gr-kpi label="Abiertos" [value]="n(e.abiertos)" [caption]="pct(e.abiertos, e.destinatarios) + ' % del total'" />
          <gr-kpi label="Respuestas" [value]="n(e.respuestas)" [caption]="n(e.parciales) + ' parciales'" />
          <gr-kpi label="Completas" [value]="e.porcentajeCompletas + ' %'" [caption]="n(e.completas) + ' de las respuestas'" />
          <gr-kpi label="Respuesta" [value]="e.porcentajeRespuesta + ' %'" [caption]="n(e.respuestas) + ' de ' + n(e.destinatarios)" />
        </div>

        <div class="grid gap-5 lg:grid-cols-2">
          <gr-card title="Entregas por canal" subtitle="Mensajes de este formulario en la cola y enviados">
            <div class="flex flex-col gap-5">
              <div class="flex flex-col gap-2"><p class="text-label-s text-text-secondary">Email</p><bo-entregas-barra [canal]="e.porCanal.email" /></div>
              <div class="flex flex-col gap-2"><p class="text-label-s text-text-secondary">WhatsApp</p><bo-entregas-barra [canal]="e.porCanal.whatsapp" /></div>
            </div>
          </gr-card>
          <gr-card title="Origen de las respuestas" subtitle="Desde la web o desde el propio email">
            <ul class="flex flex-col gap-4">
              @for (o of origen(); track o.clave) {
                <li class="flex flex-col gap-1.5">
                  <div class="flex items-baseline justify-between gap-3 text-body-s"><span class="text-text-secondary">{{ o.label }}</span><span class="font-mono text-mono-xs tabular-nums text-text-tertiary">{{ n(o.valor) }} · {{ o.pct }} %</span></div>
                  <span class="block h-2 overflow-hidden rounded-pill bg-bg-raised" aria-hidden="true"><span class="block h-full rounded-pill" [class]="o.clase" [style.width.%]="o.pct"></span></span>
                </li>
              }
            </ul>
          </gr-card>
        </div>

        @if (e.respuestas === 0) {
          <gr-empty icon="inbox" title="Aún no hay respuestas">Las estadísticas aparecen cuando los atletas empiecen a responder. Envía el formulario desde la pestaña Envíos.</gr-empty>
        } @else {
          <gr-card title="Respuestas por día" subtitle="Últimos 30 días">
            <bo-grafico-diario [datos]="e.diario" />
          </gr-card>

          <section class="flex flex-col gap-3" aria-labelledby="resultados-titulo">
            <h2 id="resultados-titulo" class="text-ui-h5">Resultados por pregunta</h2>
            <div class="grid gap-3 md:grid-cols-2">
              @for (c of e.porCampo; track c.campoId) { <bo-resultados-campo [campo]="c" /> }
            </div>
          </section>
        }
      } @else if (est() === undefined) {
        <gr-skeleton class="h-96 rounded-lg" />
      }
    </div>
  `,
})
export class BoFormEstadisticas {
  readonly formulario = input.required<Formulario>();
  private readonly api = inject(FormulariosApi);
  private readonly comps = inject(Competitions);
  protected readonly n = fmtNumber;
  protected readonly est = signal<Estadisticas | null | undefined>(undefined);
  protected readonly error = signal(false);
  protected readonly cargando = signal(false);
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  /** Web and email origin, with shares over their sum (0 when no answer has an origin yet). */
  protected readonly origen = computed(() => {
    const o = this.est()?.porOrigen;
    const total = (o?.web ?? 0) + (o?.email ?? 0);
    return [
      { clave: 'web', label: 'Web', valor: o?.web ?? 0, pct: porcentaje(o?.web ?? 0, total), clase: 'bg-accent' },
      { clave: 'email', label: 'Email', valor: o?.email ?? 0, pct: porcentaje(o?.email ?? 0, total), clase: 'bg-info' },
    ];
  });

  /** Tracks the form id only, so saves of the same form do not reload the statistics. */
  private readonly formularioId = computed(() => this.formulario().id);

  constructor() {
    effect(() => {
      const id = this.formularioId();
      if (!this.cid() || !id) return;
      untracked(() => void this.cargar());
    });
  }

  protected pct(parte: number, total: number): number {
    return porcentaje(parte, total);
  }

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      this.est.set(await this.api.estadisticas(this.cid(), this.formulario().id));
      this.error.set(false);
    } catch {
      this.error.set(true);
      if (!this.est()) this.est.set(null);
    } finally {
      this.cargando.set(false);
    }
  }
}

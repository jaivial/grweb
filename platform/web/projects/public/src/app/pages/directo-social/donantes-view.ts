import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { GrIcon, GrSkeleton } from '@grcup/ui';
import { Donaciones } from '../../core/donaciones';
import { etiquetaDia } from '../../core/chat';
import { COMPETITION_SLUG } from '../../core/competition';
import type { Premio } from '../../core/juegos';

/** «1.480 €» (sin decimales: los totales del día). */
const euros0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
/** «4,74 €» */
const euros2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Pestaña «Donantes» del panel del directo (Figma 70): el premio como gancho, lo recaudado hoy y el ranking del día.
 */
@Component({
  selector: 'gr-donantes-view',
  imports: [GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      @if (cargando() && !ranking()) {
        <div class="flex flex-col gap-3 p-3"><gr-skeleton class="h-32 rounded-md" /><gr-skeleton class="h-24 rounded-md" /><gr-skeleton class="h-64 rounded-md" /></div>
      } @else if (error()) {
        <p class="flex items-center gap-2 px-3 py-6 text-body-s text-text-tertiary"><gr-icon name="circle-alert" [size]="16" />{{ error() }}</p>
      } @else {
        <!-- premios de donantes -->
        @if (premios().length) {
          <div class="border-b border-line-subtle p-3">
            <div class="rounded-md border border-line-subtle bg-bg-raised p-3">
              <div class="flex items-center gap-3">
                @if (primero(); as p) {
                  @if (imagenPremio(p); as img) { <img [src]="img" [alt]="p.titulo" class="size-16 shrink-0 rounded-md object-cover" loading="lazy" (error)="falloImagen(p.id)" /> }
                  @else { <span class="flex size-16 shrink-0 items-center justify-center rounded-md bg-[linear-gradient(135deg,#4c111b,#170c0e)]"><gr-icon name="gift" [size]="20" class="text-accent-text" /></span> }
                  <div class="min-w-0">
                    <p class="text-mono-xs text-accent-text uppercase">Premio · {{ eyebrow() }}</p>
                    <p class="mt-1 text-label-l break-words [overflow-wrap:anywhere]">{{ p.titulo }}</p>
                    @if (p.patrocinador) { <p class="text-body-xs text-text-tertiary">Patrocina {{ p.patrocinador }}</p> }
                  </div>
                }
              </div>
            </div>
            @for (p of premios().slice(1, 3); track p.id) {
              <div class="mt-2 flex items-center gap-3 rounded-md bg-bg-raised px-3 py-2">
                <span class="flex size-6 shrink-0 items-center justify-center rounded-pill border border-line-strong text-mono-xs">{{ p.puestoDesde }}.º</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-label-s break-words [overflow-wrap:anywhere]">{{ p.titulo }}</span>
                  @if (p.patrocinador) { <span class="block truncate text-body-xs text-text-tertiary">Patrocina {{ p.patrocinador }}</span> }
                </span>
              </div>
            }
          </div>
        }

        <!-- recaudado -->
        <div class="border-b border-line-subtle p-3">
          <div class="rounded-md bg-accent-deep/45 p-4">
            <p class="text-mono-xs text-accent-text uppercase">Recaudado hoy</p>
            <p class="mt-1 font-display text-[32px] leading-none text-text-primary italic">{{ euros0(ranking()?.totalRecaudado ?? 0) }}</p>
            <p class="mt-1.5 text-body-xs text-text-secondary">{{ ranking()?.items?.length ?? 0 }} {{ (ranking()?.items?.length ?? 0) === 1 ? 'donante' : 'donantes' }} en el ranking · media {{ media() }}</p>
          </div>
        </div>

        <!-- ranking -->
        <div class="p-3">
          <p class="text-label-s text-text-primary">Ranking del día<span class="text-text-tertiary"> · {{ dia() }}</span></p>
          @if (!ranking()?.items?.length) {
            <p class="mt-3 text-body-s text-text-tertiary">Todavía no hay donativos en esta jornada. ¡Sé el primero!</p>
          } @else {
            <ul class="mt-2 flex flex-col">
              @for (d of ranking()!.items; track d.puesto) {
                <li class="flex items-center gap-3 py-2">
                  <span class="flex size-6 shrink-0 items-center justify-center rounded-pill text-mono-xs" [class]="d.puesto === 1 ? 'bg-accent text-white' : 'border border-line-strong text-text-tertiary'">{{ d.puesto }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-label-s">{{ d.alias }}</span>
                    <span class="block text-body-xs text-text-tertiary">{{ d.donativos }} {{ d.donativos === 1 ? 'donativo' : 'donativos' }}</span>
                  </span>
                  <span class="font-mono text-mono-s text-text-primary">{{ euros0(d.total) }}</span>
                </li>
              }
            </ul>
          }
        </div>
      }
    </div>
  `,
})
export class DonantesView {
  private readonly don = inject(Donaciones);
  private readonly http = inject(HttpClient);

  /** Day of the ranking (the day shown in the panel). */
  readonly diaSala = input<string>('');
  /** Id of the jornada shown (for the prizes of the donors). */
  readonly jornadaId = input<string>('');

  protected readonly ranking = computed(() => this.don.ranking());
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly premios = signal<Premio[]>([]);
  protected readonly primero = computed(() => this.premios()[0]);
  protected readonly dia = computed(() => (this.diaSala() ? etiquetaDia(this.diaSala()) : ''));
  /** Average donation (from the ranking: the API only returns the top 20). */
  protected readonly media = computed(() => {
    const r = this.ranking();
    const donativos = (r?.items ?? []).reduce((s, d) => s + d.donativos, 0);
    return donativos ? euros2.format((r?.totalRecaudado ?? 0) / donativos) : euros2.format(0);
  });
  /** The image of the prize failed: the brand block is shown instead. */
  private readonly imagenFalla = signal<ReadonlySet<string>>(new Set());

  constructor() {
    effect(() => {
      const dia = this.diaSala();
      this.cargando.set(true);
      void this.don.cargarRanking(dia || undefined).then((r) => {
        this.error.set(r ? null : 'No hemos podido cargar el ranking de donantes.');
        this.cargando.set(false);
      });
    });
    effect(() => {
      void this.cargarPremios(this.jornadaId());
    });
  }

  /** Los premios de los donantes (`?ranking=donantes`); con el backend antiguo, se filtran en el cliente. */
  private async cargarPremios(jornadaId: string): Promise<void> {
    const base = `/api/competiciones/${COMPETITION_SLUG}/juegos/premios`;
    const con = new URLSearchParams();
    if (jornadaId) con.set('jornada', jornadaId);
    con.set('ranking', 'donantes');
    try {
      const r = await firstValueFrom(this.http.get<{ premios: Premio[] }>(`${base}?${con.toString()}`));
      this.premios.set(r.premios ?? []);
    } catch {
      const sin = new URLSearchParams();
      if (jornadaId) sin.set('jornada', jornadaId);
      try {
        const r = await firstValueFrom(this.http.get<{ premios: Premio[] }>(`${base}?${sin.toString()}`));
        this.premios.set((r.premios ?? []).filter((p) => p.ranking === 'donantes'));
      } catch {
        this.premios.set([]);
      }
    }
  }

  protected falloImagen(id: string): void {
    this.imagenFalla.update((s) => (s.has(id) ? s : new Set(s).add(id)));
  }

  /** La imagen del premio (undefined si no hay o si falló): se dibuja el bloque de marca. */
  protected imagenPremio(p: Premio): string | undefined {
    if (!p.imagenUrl || this.imagenFalla().has(p.id)) return undefined;
    return p.imagenUrl;
  }

  /** «1.er donante» / «2.º donante» */
  protected eyebrow(): string {
    const p = this.primero();
    if (!p) return '';
    return p.puestoDesde === 1 ? '1.er donante' : `${p.puestoDesde}.º donante`;
  }

  protected euros0(v: number): string {
    return euros0.format(v);
  }
}

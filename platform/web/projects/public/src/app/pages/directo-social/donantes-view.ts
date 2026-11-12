import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { Donaciones } from '../../core/donaciones';
import { etiquetaDia } from '../../core/chat';
import { COMPETITION_SLUG } from '../../core/competition';
import type { Premio } from '../../core/juegos';
import { MEDALLA } from './ui';

/** «1.480 €» (sin decimales: los totales del día). */
const euros0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
/** «4,74 €» */
const euros2 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Pestaña «Donantes» del panel del directo (Figma 70): el premio como gancho, lo recaudado hoy y el ranking del día.
 */
@Component({
  selector: 'gr-donantes-view',
  imports: [GrIcon, GrButton, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-3 pb-4 [scrollbar-color:var(--color-line-strong)_transparent] [scrollbar-width:thin]">
      @if (cargando() && !ranking()) {
        <gr-skeleton class="h-44 shrink-0 rounded-lg" /><gr-skeleton class="h-24 shrink-0 rounded-md" /><gr-skeleton class="h-64 shrink-0 rounded-md" />
      } @else if (error()) {
        <div class="flex flex-col items-center gap-2 py-10 text-center">
          <span class="flex size-11 items-center justify-center rounded-full border border-line-strong bg-bg-raised text-text-tertiary"><gr-icon name="circle-alert" [size]="18" /></span>
          <p class="text-label-s text-text-primary">{{ error() }}</p>
          <p class="text-body-xs text-text-tertiary">Vuelve a intentarlo en unos segundos.</p>
        </div>
      } @else {
        <!-- gancho: el premio del 1.er donante (o la invitación si la jornada no tiene premios) -->
        @if (primero(); as p) {
          <article class="shrink-0 overflow-hidden rounded-lg border border-[#d4af37]/35 bg-bg-card">
            <div class="relative flex min-h-[184px] flex-col justify-between overflow-hidden bg-[linear-gradient(135deg,#4c111b,#281112_55%,#170c0e)] p-4">
              @if (imagenPremio(p); as img) { <img [src]="img" alt="" class="absolute inset-0 size-full object-cover" loading="lazy" (error)="falloImagen(p.id)" /> }
              @else { <gr-icon name="gift" [size]="96" class="absolute top-1/2 right-5 -translate-y-1/2 text-accent-text/25" /> }
              <span class="absolute inset-0 bg-[linear-gradient(90deg,rgb(14_12_13/0.95),rgb(23_12_14/0.7)_50%,rgb(23_12_14/0.05))]" aria-hidden="true"></span>
              <span class="relative inline-flex h-6 w-fit items-center gap-1.5 rounded-pill border border-[#d4af37]/50 bg-[#d4af37]/15 pr-2.5 pl-2 font-mono text-[11px] leading-none font-medium tracking-[0.08em] text-[#e3c25a] uppercase">
                <gr-icon name="trophy" [size]="12" />Premio · {{ eyebrow() }}</span>
              <div class="relative mt-6 max-w-[240px]">
                <p class="font-display text-[24px] leading-[1.1] break-words text-text-primary uppercase italic [overflow-wrap:anywhere]">{{ p.titulo }}</p>
                @if (p.patrocinador) { <p class="mt-1 text-body-xs text-text-secondary">Patrocina {{ p.patrocinador }}</p> }
              </div>
            </div>
            @if (premios().length > 1) {
              <ul class="flex flex-col gap-1 px-3 pt-2 pb-3">
                @for (q of premios().slice(1, 3); track q.id) {
                  <li class="flex items-center gap-2.5 px-1 py-1.5">
                    <span class="flex size-6 shrink-0 items-center justify-center rounded-full border text-[12px] font-medium" [class]="medalla(q.puestoDesde)">{{ q.puestoDesde }}</span>
                    <span class="min-w-0 flex-1">
                      <span class="block text-label-s break-words text-text-primary [overflow-wrap:anywhere]">{{ q.titulo }}</span>
                      @if (q.patrocinador) { <span class="block truncate text-body-xs text-text-tertiary">Patrocina {{ q.patrocinador }}</span> }
                    </span>
                  </li>
                }
              </ul>
            }
          </article>
        } @else {
          <article class="flex shrink-0 items-center gap-3 rounded-lg border border-accent/35 bg-[linear-gradient(135deg,#4c111b,#281112_55%,#170c0e)] p-4">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-full border border-[#d4af37]/50 bg-[#d4af37]/15 text-[#e3c25a]"><gr-icon name="trophy" [size]="20" /></span>
            <div class="min-w-0">
              <p class="text-label-m text-text-primary">Entra en el ranking del día</p>
              <p class="mt-0.5 text-body-xs text-text-secondary">Cada donativo sale en el chat y suma en el ranking. Apoya a la GR Strength Cup.</p>
            </div>
          </article>
        }

        <!-- recaudado -->
        <div class="flex shrink-0 items-center gap-3 rounded-md border border-accent/35 bg-[linear-gradient(135deg,#4c111b,#281112_55%,#170c0e)] p-4">
          <div class="min-w-0 flex-1">
            <p class="font-mono text-[11px] font-medium tracking-[0.08em] text-accent-text uppercase">Recaudado hoy</p>
            <p class="mt-1 font-display text-[36px] leading-none text-text-primary italic">{{ euros0(ranking()?.totalRecaudado ?? 0) }}</p>
            <p class="mt-1.5 text-body-xs text-text-secondary">{{ donativos() }} {{ donativos() === 1 ? 'donativo' : 'donativos' }} · media {{ media() }}</p>
          </div>
          <p class="flex w-[104px] shrink-0 flex-col items-center gap-1 rounded-sm bg-black/25 px-3 py-2.5 text-center text-body-xs text-text-secondary">
            <gr-icon name="heart" [size]="18" class="text-accent-text" />Apoya a la GR Strength Cup
          </p>
        </div>

        <!-- ranking -->
        <div class="shrink-0">
          <p class="flex items-center justify-between gap-2 pt-1"><span class="text-label-s text-text-primary">Ranking del día</span><span class="font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">{{ dia() }}</span></p>
          @if (!ranking()?.items?.length) {
            <div class="mt-3 flex flex-col items-center gap-1.5 rounded-md border border-dashed border-line-strong px-4 py-6 text-center">
              <p class="text-label-s text-text-primary">Todavía no hay donativos hoy</p>
              <p class="text-body-xs text-text-tertiary">El primero en donar encabeza el ranking.</p>
            </div>
          } @else {
            <ol class="mt-2 flex flex-col gap-0.5">
              @for (d of ranking()!.items; track d.puesto) {
                <li class="flex min-h-14 items-center gap-3 rounded-md px-3 py-2" [class]="d.puesto === 1 ? 'border border-[#d4af37]/25 bg-[#d4af37]/7' : ''">
                  <span class="flex size-8 shrink-0 items-center justify-center rounded-full border" [class]="d.puesto <= 3 ? medalla(d.puesto) + ' text-label-s' : 'border-line-strong font-mono text-[13px] text-text-tertiary'">{{ d.puesto }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-label-s text-text-primary">{{ d.alias }}</span>
                    <span class="block text-body-xs text-text-tertiary">{{ d.donativos }} {{ d.donativos === 1 ? 'donativo' : 'donativos' }}</span>
                  </span>
                  <span [class]="d.puesto === 1 ? 'text-label-m text-[#e3c25a]' : 'font-mono text-[13px] text-text-primary'">{{ euros0(d.total) }}</span>
                </li>
              }
            </ol>
          }
        </div>
      }
    </div>
    <div class="shrink-0 border-t border-line-subtle bg-bg-card px-4 pt-3 pb-4">
      <button type="button" grButton variant="primary" size="l" [block]="true" icon="heart" (click)="donar.emit()">Donar y entrar en el ranking</button>
      <p class="mt-2 flex items-center justify-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="lock" [size]="12" />Pago seguro · no guardamos tu tarjeta</p>
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
  /** The fan wants to donate (the panel opens the dialog). */
  readonly donar = output<void>();

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
    return donativos ? euros2.format((r?.totalRecaudado ?? 0) / 100 / donativos) : euros2.format(0);
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
    return p.puestoDesde === 1 ? '1.er donante del día' : `${p.puestoDesde}.º donante del día`;
  }

  /** Number of donations of the day (from the ranking: the API only returns the top 20). */
  protected readonly donativos = computed(() => (this.ranking()?.items ?? []).reduce((s, d) => s + d.donativos, 0));

  protected medalla(puesto: number): string {
    return MEDALLA[puesto] ?? 'border-line-strong text-text-tertiary';
  }

  protected euros0(v: number): string {
    return euros0.format(v / 100); // the API answers in cents
  }
}

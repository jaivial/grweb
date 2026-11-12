import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { FanSession } from '../../core/fan';
import { Juegos, monedas, cuota, type Cartera, type Mercado } from '../../core/juegos';
import { GrCoin } from './ui';

/**
 * Pestaña «Porra» del panel del directo (Figma 70): mi saldo de la jornada, los mercados abiertos con sus cuotas y
 * las llamadas a /porra y /fantasy.
 */
@Component({
  selector: 'gr-porra-view',
  imports: [RouterLink, GrIcon, GrButton, GrSkeleton, GrCoin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-3 pb-4 [scrollbar-color:var(--color-line-strong)_transparent] [scrollbar-width:thin]">
      <!-- saldo -->
      @if (!fan.conSesion()) {
        <div class="shrink-0 rounded-md border border-accent/35 bg-[linear-gradient(135deg,#4c111b,#281112_55%,#170c0e)] p-3.5">
          <p class="text-label-m text-text-primary">Entra para jugar con tus monedas</p>
          <p class="mt-1 text-body-xs text-text-secondary">Las monedas de porra y de GRS Fantasy se crean al entrar y nunca se compran con dinero.</p>
          <button type="button" grButton variant="primary" [block]="true" class="mt-3" (click)="fan.abrirAcceso('porra')">Entrar y jugar</button>
        </div>
      } @else if (cargandoCartera()) {
        <gr-skeleton class="h-28 shrink-0 rounded-md" />
      } @else if (cartera(); as c) {
        <div class="shrink-0 rounded-md border border-accent/30 bg-[linear-gradient(135deg,#4c111b,#281112_55%,#170c0e)] p-3.5">
          <p class="flex items-center justify-between gap-2 font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
            <span class="text-accent-text">Tu saldo de la jornada</span>@if (jornada(); as j) { <span class="truncate text-text-tertiary">{{ j.nombre }}</span> }
          </p>
          <p class="mt-2.5 flex flex-wrap gap-2">
            <gr-coin>{{ monedas(c.porra) }} porra</gr-coin>
            <gr-coin tipo="fantasy">{{ monedas(c.fantasy) }} fantasy</gr-coin>
          </p>
          <p class="mt-2.5 flex items-center gap-1.5 text-body-xs text-text-tertiary"><gr-icon name="lock" [size]="12" class="shrink-0" />Monedas de juego: nunca se compran con dinero.</p>
        </div>
      }

      <!-- mercados -->
      <div class="shrink-0">
        <p class="flex items-center justify-between gap-2 pt-1">
          <span class="text-label-s text-text-primary">Mercados abiertos</span>
          @if (!cargando() && !error() && mercados().length) { <span class="font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">{{ mercados().length }} {{ mercados().length === 1 ? 'abierto' : 'abiertos' }}</span> }
        </p>
        @if (cargando()) {
          <div class="mt-2 flex flex-col gap-2"><gr-skeleton class="h-40 rounded-md" /><gr-skeleton class="h-40 rounded-md" /></div>
        } @else if (error()) {
          <p class="mt-3 flex items-center gap-2 rounded-md border border-line-subtle bg-bg-raised p-3 text-body-s text-text-tertiary"><gr-icon name="circle-alert" [size]="16" class="shrink-0" />{{ error() }}</p>
        } @else if (!mercados().length) {
          <div class="mt-2 flex flex-col items-center gap-1.5 rounded-md border border-dashed border-line-strong px-4 py-6 text-center">
            <p class="text-label-s text-text-primary">No hay mercados abiertos ahora</p>
            <p class="text-body-xs text-text-tertiary">Se abren antes de cada categoría: vuelve en un rato.</p>
          </div>
        } @else {
          <div class="mt-2 flex flex-col gap-2">
            @for (m of mercados().slice(0, 3); track m.id) {
              <article class="rounded-md border border-line-subtle bg-bg-surface p-3.5">
                <p class="flex items-start justify-between gap-2">
                  <span class="text-label-m break-words text-text-primary [overflow-wrap:anywhere]">{{ m.titulo }}</span>
                  <span class="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-pill border border-success/35 bg-success/10 px-2 font-mono text-[11px] tracking-[0.08em] text-success uppercase"><span class="size-1.5 rounded-full bg-success"></span>Abierto</span>
                </p>
                <p class="mt-1 text-body-xs text-text-tertiary">Bote {{ monedas(m.bote) }} · {{ m.apuestas }} {{ m.apuestas === 1 ? 'apuesta' : 'apuestas' }}</p>
                <ul class="mt-2.5 flex flex-col gap-1.5">
                  @for (o of m.opciones.slice(0, 4); track o.atletaId) {
                    <li class="flex h-10 items-center justify-between gap-3 rounded-sm bg-bg-raised pr-2 pl-3">
                      <span class="min-w-0 flex-1 truncate text-body-s text-text-secondary">{{ o.nombre }}</span>
                      <span class="rounded-xs px-2 py-0.5 font-mono text-[13px]" [class]="o.cuota ? 'bg-accent-deep/35 text-accent-text' : 'text-text-muted'" [attr.title]="o.cuota ? 'Cuota orientativa en vivo' : 'Sin apuestas todavía'">{{ cuota(o.cuota) }}</span>
                    </li>
                  }
                </ul>
                @if (m.opciones.length > 4) { <p class="mt-2 text-body-xs text-text-tertiary">y {{ m.opciones.length - 4 }} más en la porra</p> }
              </article>
            }
          </div>
        }
      </div>
    </div>

    <!-- llamadas -->
    <div class="flex shrink-0 flex-col gap-2 border-t border-line-subtle bg-bg-card px-4 pt-3 pb-4">
      <a grButton variant="primary" size="l" [block]="true" routerLink="/porra" iconRight="arrow-right">Ir a la porra</a>
      <a class="flex min-h-14 items-center gap-3 rounded-md border border-info/40 bg-info/6 px-3 py-2.5 transition-colors hover:border-info/70" routerLink="/fantasy">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-info/14 text-info"><gr-icon name="star" [size]="18" /></span>
        <span class="min-w-0 flex-1">
          <span class="block text-label-s text-text-primary">GRS Fantasy</span>
          <span class="block text-body-xs text-text-tertiary">Ficha 5 titulares con 1.000.000 de monedas</span>
        </span>
        <span class="inline-flex shrink-0 items-center gap-1 text-label-s text-info">Abrir <gr-icon name="arrow-right" [size]="14" /></span>
      </a>
    </div>
  `,
})
export class PorraView {
  private readonly juegos = inject(Juegos);
  protected readonly fan = inject(FanSession);

  /** Id of the jornada shown (the day selected in the panel). */
  readonly jornadaId = input<string>('');
  /** Name of the jornada shown. */
  readonly jornadaNombre = input<string>('');
  /** The panel has the list of jornadas (until then nothing is asked). */
  readonly cargada = input<boolean>(true);

  protected readonly mercados = signal<Mercado[]>([]);
  protected readonly cartera = signal<Cartera | null>(null);
  protected readonly cargando = signal(true);
  protected readonly cargandoCartera = signal(false);
  protected readonly error = signal<string | null>(null);
  /** La jornada que contesta la API (la activa si no se pide ninguna). */
  protected readonly jornadaApi = signal<{ nombre: string; dia: string } | null>(null);
  protected readonly jornada = computed(() => this.jornadaApi() ?? (this.jornadaNombre() ? { nombre: this.jornadaNombre(), dia: '' } : null));

  constructor() {
    effect(() => {
      const jid = this.jornadaId();
      if (!this.cargada()) return;
      if (!jid) {
        // no jornada today nor an open one: empty state, without asking the API (it answers 404)
        this.mercados.set([]);
        this.error.set(null);
        this.cargando.set(false);
        return;
      }
      this.cargando.set(true);
      void this.juegos
        .porraMercados(jid)
        .then((r) => {
          this.mercados.set((r.mercados ?? []).filter((m) => m.estado === 'abierto'));
          this.jornadaApi.set(r.jornada ? { nombre: r.jornada.nombre, dia: r.jornada.dia } : null);
          this.error.set(null);
        })
        .catch(() => this.error.set('No hemos podido cargar los mercados.'))
        .finally(() => this.cargando.set(false));
    });
    effect(() => {
      if (!this.fan.conSesion() || !this.jornadaId()) {
        this.cartera.set(null);
        return;
      }
      const jid = this.jornadaId();
      this.cargandoCartera.set(true);
      void this.juegos
        .cartera(jid)
        .then((c) => this.cartera.set(c))
        .catch(() => this.cartera.set(null))
        .finally(() => this.cargandoCartera.set(false));
    });
  }

  protected readonly monedas = monedas;
  protected readonly cuota = cuota;
}

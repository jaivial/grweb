import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { FanSession } from '../../core/fan';
import { Juegos, monedas, cuota, type Cartera, type Mercado } from '../../core/juegos';

/**
 * Pestaña «Porra» del panel del directo (Figma 70): mi saldo de la jornada, los mercados abiertos con sus cuotas y
 * las llamadas a /porra y /fantasy.
 */
@Component({
  selector: 'gr-porra-view',
  imports: [GrIcon, GrButton, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <!-- saldo -->
      @if (!fan.conSesion()) {
        <div class="m-3 rounded-md border border-line-subtle bg-bg-raised p-3">
          <p class="text-label-s text-text-primary">Entra para jugar con tus monedas</p>
          <p class="mt-1 text-body-xs text-text-tertiary">Las monedas de porra y de GRS Fantasy se crean al entrar y nunca se compran con dinero.</p>
          <button type="button" grButton variant="primary" size="s" class="mt-2" (click)="fan.abrirAcceso('porra')">Entrar</button>
        </div>
      } @else if (cargandoCartera()) {
        <div class="p-3"><gr-skeleton class="h-20 rounded-md" /></div>
      } @else if (cartera(); as c) {
        <div class="m-3 rounded-md bg-bg-raised p-3">
          <p class="flex flex-wrap items-center gap-2">
            <span class="inline-flex items-center gap-1.5 rounded-pill bg-bg-raised px-2.5 py-1 font-mono text-mono-s"><span class="size-2 rounded-full bg-warning"></span>{{ monedas(c.porra) }} porra</span>
            <span class="inline-flex items-center gap-1.5 rounded-pill bg-bg-raised px-2.5 py-1 font-mono text-mono-s"><span class="size-2 rounded-full bg-info"></span>{{ monedas(c.fantasy) }} fantasy</span>
          </p>
          <p class="mt-2 text-body-xs text-text-tertiary">Monedas de la jornada{{ jornada() ? ' ' + jornada()!.nombre : '' }} · nunca se compran con dinero.</p>
        </div>
      }

      <!-- mercados -->
      <div class="px-3">
        <p class="text-label-s text-text-primary">Mercados abiertos</p>
        @if (cargando()) {
          <div class="mt-2 flex flex-col gap-2"><gr-skeleton class="h-32 rounded-md" /><gr-skeleton class="h-32 rounded-md" /></div>
        } @else if (error()) {
          <p class="mt-3 flex items-center gap-2 text-body-s text-text-tertiary"><gr-icon name="circle-alert" [size]="16" />{{ error() }}</p>
        } @else if (!mercados().length) {
          <p class="mt-3 text-body-s text-text-tertiary">No hay mercados abiertos en esta jornada.</p>
        } @else {
          <div class="mt-2 flex flex-col gap-2">
            @for (m of mercados().slice(0, 3); track m.id) {
              <div class="rounded-md border border-line-subtle bg-bg-card p-3">
                <p class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-label-l">{{ m.titulo }}</span>
                  <span class="text-mono-xs uppercase" [class]="m.estado === 'abierto' ? 'text-success' : 'text-text-tertiary'">{{ m.estado }}</span>
                </p>
                <p class="mt-1 text-body-xs text-text-tertiary">Bote {{ monedas(m.bote) }} · {{ m.apuestas }} {{ m.apuestas === 1 ? 'apuesta' : 'apuestas' }}</p>
                <ul class="mt-2 flex flex-col gap-1.5">
                  @for (o of m.opciones.slice(0, 4); track o.atletaId) {
                    <li class="flex items-center justify-between gap-3 rounded-sm bg-bg-raised px-3 py-2">
                      <span class="min-w-0 flex-1 truncate text-body-s text-text-secondary">{{ o.nombre }}</span>
                      <span class="font-mono text-mono-s text-accent-text">{{ cuota(o.cuota) }}</span>
                    </li>
                  }
                </ul>
              </div>
            }
          </div>
        }
      </div>

      <!-- llamadas -->
      <div class="mt-4 flex flex-col gap-2 p-3">
        <a grButton variant="primary" [block]="true" href="/porra" iconRight="arrow-right">Ir a la porra</a>
        <a class="flex items-center gap-3 rounded-md border border-info/40 bg-info/5 p-3 hover:border-info/70" href="/fantasy">
          <gr-icon name="star" [size]="20" class="shrink-0 text-info" />
          <span class="min-w-0 flex-1">
            <span class="block text-label-s text-text-primary">GRS Fantasy</span>
            <span class="block text-body-xs text-text-tertiary">Ficha 5 titulares con 1.000.000 de monedas de la jornada.</span>
          </span>
          <span class="inline-flex shrink-0 items-center gap-1 text-label-s text-info">Abrir <gr-icon name="arrow-right" [size]="14" /></span>
        </a>
      </div>
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
      this.cargando.set(true);
      void this.juegos
        .porraMercados(jid || undefined)
        .then((r) => {
          this.mercados.set((r.mercados ?? []).filter((m) => m.estado === 'abierto'));
          this.jornadaApi.set(r.jornada ? { nombre: r.jornada.nombre, dia: r.jornada.dia } : null);
          this.error.set(null);
        })
        .catch(() => this.error.set('No hemos podido cargar los mercados.'))
        .finally(() => this.cargando.set(false));
    });
    effect(() => {
      if (!this.fan.conSesion()) {
        this.cartera.set(null);
        return;
      }
      const jid = this.jornadaId();
      this.cargandoCartera.set(true);
      void this.juegos
        .cartera(jid || undefined)
        .then((c) => this.cartera.set(c))
        .catch(() => this.cartera.set(null))
        .finally(() => this.cargandoCartera.set(false));
    });
  }

  protected readonly monedas = monedas;
  protected readonly cuota = cuota;
}

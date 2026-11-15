import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, input, signal, untracked, viewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrButton, GrInput, GrToasts } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { errText } from '../../shared/ui';
import { SolicitudesApi, type CupoPrueba, type CuposOut } from './solicitudes-api';

/** Highest value of a quota (same limit as the server). */
const MAX_CUPO = 100000;

/** «Plazas y cupos»: global places of the event (approving needs a free one) and seats per competition of the alta. */
@Component({
  selector: 'bo-solicitudes-cupos',
  imports: [FormsModule, RouterLink, GrButton, GrInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
@if (cupos().length) {
  <section id="plazas-evento" class="flex scroll-mt-24 flex-col gap-4 rounded-lg border border-line-subtle bg-bg-card p-5" aria-labelledby="cupos-t">
    <div class="flex min-w-0 flex-col gap-1">
      <h2 id="cupos-t" class="text-ui-h5">Plazas y cupo por competición</h2>
      <p class="text-body-xs text-text-tertiary">Aprobar necesita una plaza libre del evento. Sin cupo propio se reparten las plazas totales entre las competiciones; una competición llena se muestra «Completa». 0 = sin límite.</p>
    </div>
    <div class="flex flex-wrap items-end gap-4">
    @if (global(); as g) {
      <label class="flex w-40 flex-col gap-1.5">
        <span class="text-label-s">Plazas del evento</span>
        <span class="text-body-xs" [class]="lleno() ? 'text-warning' : 'text-text-tertiary'">{{ g.ocupadas }} ocupadas{{ lleno() ? ' · completo' : '' }}</span>
        <input grInput type="number" min="0" [max]="max" aria-label="Plazas del evento" [disabled]="!puedeEvento()" [ngModel]="plazasEdit()" (ngModelChange)="plazasEdit.set($event)" />
      </label>
    }
    @for (c of cupos(); track c.codigo) {
      <label class="flex w-36 flex-col gap-1.5">
        <span class="truncate text-label-s">Cupo {{ c.nombre }}</span>
        <span class="truncate text-body-xs text-text-tertiary">{{ c.ocupadas }} {{ c.ocupadas === 1 ? 'ocupada' : 'ocupadas' }}{{ c.plazas === 0 ? ' · sin límite' : '' }}{{ c.porDefecto ? ' · por defecto' : '' }}</span>
        <input grInput type="number" min="0" [max]="max" #cupoIn [attr.data-codigo]="c.codigo" [attr.aria-label]="'Cupo ' + c.nombre" [disabled]="!puede()" [ngModel]="cupoEdit()[c.codigo]"
          (ngModelChange)="ponCupo(c.codigo, $event)" />
      </label>
    }
    @if (puede()) {
      <button grButton variant="secondary" type="button" [loading]="guardandoCupos()" [disabled]="guardandoCupos()" (click)="guardarCupos()">Guardar</button>
    }
    <a class="inline-flex h-11 items-center text-label-s text-accent-text hover:underline" [routerLink]="['/', comps.current()?.slug, 'atletas', 'inscripcion']">Más ajustes en Inscripción</a>
    </div>
  </section>
}
  `,
})
export class SolicitudesCupos {
  private readonly api = inject(SolicitudesApi);
  private readonly toasts = inject(GrToasts);
  private readonly live = inject(Realtime);
  private readonly auth = inject(Auth);
  protected readonly comps = inject(Competitions);
  readonly cid = input.required<string>();
  readonly puede = input(false);
  protected readonly max = MAX_CUPO;

  protected readonly cupos = signal<CupoPrueba[]>([]);
  protected readonly cupoEdit = signal<Record<string, number | string | null>>({});
  protected readonly global = signal<CuposOut['global'] | null>(null);
  protected readonly plazasEdit = signal<number | string | null>(null);
  protected readonly guardandoCupos = signal(false);
  /** The DOM value is the truth when saving: an emptied number input may not reach ngModel (U33: empty AEP-3 saved). */
  private readonly cupoIns = viewChildren<ElementRef<HTMLInputElement>>('cupoIn');
  /** The global places live in the competition: changing them needs evento.editar. */
  protected readonly puedeEvento = computed(() => this.auth.can(this.cid(), 'evento.editar'));
  protected readonly lleno = computed(() => {
    const g = this.global();
    return !!g && g.plazas > 0 && g.ocupadas >= g.plazas;
  });

  constructor() {
    effect(() => {
      if (this.cid() && this.puede()) untracked(() => void this.cargarCupos());
    });
    const sub = this.live.events.subscribe((e) => { if (e.tipo.startsWith('athletes.solicitud_')) void this.refrescarOcupadas(); });
    const rs = this.live.resync.subscribe(() => void this.refrescarOcupadas());
    inject(DestroyRef).onDestroy(() => { sub.unsubscribe(); rs.unsubscribe(); });
  }


  private ponCupos(r: CuposOut): void {
    this.cupos.set(r.cupos);
    this.global.set(r.global ?? null);
    this.plazasEdit.set(r.global?.plazas ?? null);
    this.cupoEdit.set(Object.fromEntries(r.cupos.map((x) => [x.codigo, x.plazas])));
  }

  protected ponCupo(codigo: string, v: number | string): void {
    this.cupoEdit.update((m) => ({ ...m, [codigo]: v }));
  }

  async cargarCupos(): Promise<void> {
    if (!this.puede()) return;
    try {
      this.ponCupos(await this.api.cupos(this.cid()));
    } catch {
      this.cupos.set([]);
    }
  }

  /** Live (SSE): refresh only the occupied counts; keeps any unsaved value the admin is typing. */
  private async refrescarOcupadas(): Promise<void> {
    if (!this.cid() || !this.puede()) return;
    try {
      const r = await this.api.cupos(this.cid());
      this.cupos.set(r.cupos);
      this.global.set(r.global ?? null);
    } catch {
      // keep the last known counts
    }
  }

  /** Empty means «not typed», never «0 = no limit» (U33-R1-9). */
  private numero(v: number | string | null | undefined): number | null {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= MAX_CUPO ? n : NaN;
  }

  async guardarCupos(): Promise<void> {
    const v: Record<string, number> = {};
    const dom = Object.fromEntries(this.cupoIns().map((r) => [r.nativeElement.dataset['codigo'], r.nativeElement]));
    for (const c of this.cupos()) {
      const el = dom[c.codigo];
      const n = this.numero(el ? (el.validity.badInput ? 'x' : el.value) : this.cupoEdit()[c.codigo]);
      if (n === null) {
        this.toasts.error('Falta el cupo', `Escribe las plazas de ${c.nombre} (0 = sin límite).`);
        return;
      }
      if (Number.isNaN(n)) {
        this.toasts.error('Cupo no válido', `${c.nombre}: escribe un número entero entre 0 y ${MAX_CUPO.toLocaleString('es-ES')}.`);
        return;
      }
      v[c.codigo] = n;
    }
    const bajo = this.cupos().find((c) => v[c.codigo] > 0 && v[c.codigo] < c.ocupadas);
    if (bajo) {
      this.toasts.error('Cupo demasiado bajo', `${bajo.nombre} ya tiene ${bajo.ocupadas} plazas ocupadas: el cupo no puede ser menor (o pon 0 = sin límite).`);
      return;
    }
    const g = this.global();
    const plazas = g && this.puedeEvento() ? this.numero(this.plazasEdit()) : null;
    if (g && this.puedeEvento() && (plazas === null || Number.isNaN(plazas))) {
      this.toasts.error('Plazas del evento no válidas', `Escribe un número entero entre 0 y ${MAX_CUPO.toLocaleString('es-ES')} (0 = sin límite).`);
      return;
    }
    this.guardandoCupos.set(true);
    try {
      if (g && plazas !== null && plazas !== g.plazas) {
        await this.api.guardarPlazas(this.cid(), plazas);
        void this.comps.load(true);
      }
      this.ponCupos(await this.api.guardarCupos(this.cid(), v));
      this.toasts.success('Plazas guardadas', 'El formulario de alta y las aprobaciones ya usan las plazas nuevas.');
    } catch (e) {
      this.toasts.error('No se pudieron guardar las plazas', errText(e));
    } finally {
      this.guardandoCupos.set(false);
    }
  }
}

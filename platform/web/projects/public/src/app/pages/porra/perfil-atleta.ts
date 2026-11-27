/**
 * porra/perfil-atleta.ts — perfil rápido de un atleta de la porra (gr-sheet): la ficha pública (foto, club, frase,
 * historial y marcas) y el bloque «En directo» (intentos, mejores marcas, total y GL). El bloque en directo se vuelve a
 * pedir con cada intento o veredicto del directo, con un rebote de 300 ms.
 */
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal, untracked, computed } from '@angular/core';
import { GrIcon, GrSheet, GrSkeleton } from '@grcup/ui';
import { AtletasPublic, type FichaPub } from '../../core/atletas';
import { I18n } from '../../core/i18n';
import { type AtletaEnDirecto, Juegos, JuegosEnVivo, horaTxt, nota1, nota2, type IntentoEnDirecto, type Mov, type OpcionMercado } from '../../core/juegos';
import { iniciales } from './componentes';
import { kg } from './ranking';

const T = {
  es: {
    cerrar: 'Cerrar',
    enDirecto: 'En directo',
    compite: (h: string) => `Compite a las ${h}`,
    porPublicar: 'Hora de competición por publicar',
    sinDirecto: 'No hemos podido cargar el directo. Se actualiza solo.',
    intento: 'Intento',
    mejor: 'Mejor',
    total: 'Total',
    gl: 'GL IPF',
    sq: 'Sentadilla',
    bp: 'Press banca',
    dl: 'Peso muerto',
    valido: 'válido',
    nulo: 'nulo',
    renuncia: 'no intentado',
    pendiente: 'pendiente',
    porDeclarar: 'Por declarar',
    marcas: 'Marcas',
    historial: 'Historial',
    entrenador: 'Entrenador',
    club: 'Club',
    ciudad: 'Ciudad',
    aep2: 'AEP-2',
    aep3: 'AEP-3',
  },
  en: {
    cerrar: 'Close',
    enDirecto: 'Live',
    compite: (h: string) => `Competes at ${h}`,
    porPublicar: 'Competition time to be announced',
    sinDirecto: 'We could not load the live data. It updates by itself.',
    intento: 'Attempt',
    mejor: 'Best',
    total: 'Total',
    gl: 'IPF GL',
    sq: 'Squat',
    bp: 'Bench press',
    dl: 'Deadlift',
    valido: 'good lift',
    nulo: 'no lift',
    renuncia: 'not attempted',
    pendiente: 'pending',
    porDeclarar: 'To be declared',
    marcas: 'Best lifts',
    historial: 'History',
    entrenador: 'Coach',
    club: 'Club',
    ciudad: 'City',
    aep2: 'AEP-2',
    aep3: 'AEP-3',
  },
};

/** Lo que el perfil necesita de la opción del mercado (la fila pulsada). */
export type OpcionPerfil = Pick<OpcionMercado, 'atletaId' | 'nombre' | 'slug' | 'fotoUrl' | 'categoria'>;

@Component({
  selector: 'gr-perfil-atleta',
  imports: [GrSheet, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <gr-sheet [abierto]="!!opcion()" [titulo]="opcion()?.nombre ?? ''" [cerrarTxt]="t().cerrar" (cerrar)="cerrar.emit()">
      @if (opcion(); as o) {
        <div class="flex flex-col gap-6">
          <div class="flex items-center gap-4">
            @if (foto()) {
              <img [src]="foto()" [alt]="o.nombre" class="size-20 shrink-0 rounded-md object-cover" loading="lazy" />
            } @else {
              <span class="flex size-20 shrink-0 items-center justify-center rounded-md border border-line-strong bg-bg-card font-display text-[1.5rem] text-text-primary italic" aria-hidden="true">{{ ini() }}</span>
            }
            <div class="flex min-w-0 flex-col gap-1">
              <p class="font-display text-[1.25rem] leading-tight text-text-primary">{{ o.nombre }}</p>
              <p class="text-body-xs text-text-tertiary">{{ subtitulo() }}</p>
            </div>
          </div>

          @if (ficha(); as f) {
            @if (f.frase) { <p class="text-body-s text-text-secondary italic">«{{ f.frase }}»</p> }
            @if (f.bio) { <p class="text-body-s text-text-secondary">{{ f.bio }}</p> }
            <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-body-xs">
              @if (f.club) { <div><dt class="text-text-tertiary">{{ t().club }}</dt><dd class="text-text-primary">{{ f.club }}</dd></div> }
              @if (f.ciudad) { <div><dt class="text-text-tertiary">{{ t().ciudad }}</dt><dd class="text-text-primary">{{ f.ciudad }}</dd></div> }
              @if (f.entrenador) { <div><dt class="text-text-tertiary">{{ t().entrenador }}</dt><dd class="text-text-primary">{{ f.entrenador }}</dd></div> }
              @if (f.instagram) { <div><dt class="text-text-tertiary">Instagram</dt><dd class="text-text-primary">@{{ f.instagram.replace('@', '') }}</dd></div> }
            </dl>
            @if (f.marcas && (f.marcas.sq || f.marcas.bp || f.marcas.dl)) {
              <section class="flex flex-col gap-2" aria-labelledby="gr-perfil-marcas">
                <h3 id="gr-perfil-marcas" class="font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">{{ t().marcas }}</h3>
                <p class="font-mono text-body-s text-text-primary tabular-nums">{{ marcas() }}</p>
              </section>
            }
            @if (f.historial && f.historial.length) {
              <section class="flex flex-col gap-2" aria-labelledby="gr-perfil-historial">
                <h3 id="gr-perfil-historial" class="font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">{{ t().historial }}</h3>
                <ul class="flex flex-col gap-1 text-body-s text-text-secondary">
                  @for (h of f.historial; track $index) { <li>{{ h.anio ? h.anio + ' · ' : '' }}{{ h.competicion }}@if (h.total) { · {{ h.total }} kg }</li> }
                </ul>
              </section>
            }
          } @else if (cargandoFicha()) {
            <div class="flex flex-col gap-2" aria-busy="true"><gr-skeleton class="h-4 w-3/4" /><gr-skeleton class="h-4 w-1/2" /></div>
          }

          <section class="flex flex-col gap-3" aria-labelledby="gr-perfil-directo">
            <h3 id="gr-perfil-directo" class="font-mono text-[11px] tracking-[0.08em] text-text-tertiary uppercase">{{ t().enDirecto }}</h3>
            @if (fallo()) {
              <p class="text-body-s text-text-tertiary" role="status">{{ t().sinDirecto }}</p>
            } @else if (!directo()) {
              <div class="flex flex-col gap-2" aria-busy="true"><gr-skeleton class="h-10 w-full" /><gr-skeleton class="h-10 w-full" /></div>
            } @else if (!enCurso()) {
              <p class="flex items-center gap-2 text-body-s text-text-secondary"><gr-icon name="clock" [size]="16" class="shrink-0 text-text-tertiary" />{{ horaCompite() ? t().compite(horaCompite()) : t().porPublicar }}</p>
            } @else {
              <div class="grid grid-cols-[4.5rem_repeat(3,minmax(0,1fr))_3.5rem] gap-1.5 text-body-xs">
                <span></span>
                @for (n of [1, 2, 3]; track n) { <span class="text-center text-text-tertiary">{{ t().intento }} {{ n }}</span> }
                <span class="text-center text-text-tertiary">{{ t().mejor }}</span>
                @for (mov of movs; track mov) {
                  <span class="flex items-center text-label-s text-text-secondary">{{ nombreMov(mov) }}</span>
                  @for (n of [0, 1, 2]; track n) {
                    <span class="flex min-h-11 flex-col items-center justify-center rounded-sm border font-mono tabular-nums" [class]="clase(intento(mov, n))">
                      <span class="text-[13px]">{{ peso(intento(mov, n)) }}</span>
                      <span class="sr-only">{{ estado(intento(mov, n)) }}</span>
                    </span>
                  }
                  <span class="flex min-h-11 items-center justify-center font-mono font-bold text-text-primary tabular-nums">{{ mejor(mov) }}</span>
                }
              </div>
              <dl class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-0.5 rounded-md border border-line-subtle bg-bg-card px-3 py-2.5">
                  <dt class="text-mono-xs text-text-tertiary">{{ t().total }}</dt>
                  <dd class="font-mono text-[1.125rem] font-bold text-text-primary tabular-nums">{{ directo()?.total != null ? nota1(directo()!.total) + ' kg' : '—' }}</dd>
                </div>
                <div class="flex flex-col gap-0.5 rounded-md border border-line-subtle bg-bg-card px-3 py-2.5">
                  <dt class="text-mono-xs text-text-tertiary">{{ t().gl }}</dt>
                  <dd class="font-mono text-[1.125rem] font-bold text-text-primary tabular-nums">{{ nota2(directo()?.gl) }}</dd>
                </div>
              </dl>
            }
          </section>
        </div>
      }
    </gr-sheet>
  `,
})
export class PerfilAtleta {
  readonly opcion = input<OpcionPerfil | null>(null);
  /** La jornada de la porra (para la ficha en directo). */
  readonly jornada = input('');
  readonly cerrar = output<void>();

  protected readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly nota1 = (v: number | null | undefined) => nota1(v, this.i18n.lang());
  protected readonly nota2 = (v: number | null | undefined) => nota2(v, this.i18n.lang());
  protected readonly movs: Mov[] = ['sq', 'bp', 'dl'];
  private readonly atletas = inject(AtletasPublic);
  private readonly juegos = inject(Juegos);
  private readonly vivo = inject(JuegosEnVivo);

  protected readonly ficha = signal<FichaPub | null>(null);
  protected readonly cargandoFicha = signal(false);
  protected readonly directo = signal<AtletaEnDirecto | null>(null);
  protected readonly fallo = signal(false);
  private visto = 0;
  private refresco: ReturnType<typeof setTimeout> | undefined;

  protected readonly ini = computed(() => iniciales(this.opcion()?.nombre));
  protected readonly foto = computed(() => this.ficha()?.fotoUrl || this.opcion()?.fotoUrl || '');
  protected readonly subtitulo = computed(() => {
    const o = this.opcion();
    const f = this.ficha();
    const partes = [f?.club, f?.ciudad, kg(this.directo()?.categoria ?? o?.categoria)].filter(Boolean);
    return partes.join(' · ');
  });
  protected readonly marcas = computed(() => {
    const m = this.ficha()?.marcas;
    if (!m) return '';
    return [m.sq && 'S ' + nota1(m.sq), m.bp && 'B ' + nota1(m.bp), m.dl && 'PM ' + nota1(m.dl)].filter(Boolean).join(' · ');
  });
  /** La competición ya ha empezado (sesión en curso, terminado o pasada la hora de salida). */
  protected readonly enCurso = computed(() => {
    const d = this.directo();
    if (!d) return false;
    return d.sesionEnCurso || d.terminado || (!!d.horaInicio && Date.parse(d.horaInicio) <= Date.now());
  });
  protected readonly horaCompite = computed(() => horaTxt(this.directo()?.horaInicio, this.i18n.lang()));

  constructor() {
    this.visto = this.vivo.versionDirecto();
    effect(() => {
      const o = this.opcion();
      untracked(() => this.abrir(o));
    });
    effect(() => {
      const v = this.vivo.versionDirecto();
      untracked(() => {
        if (v === this.visto) return;
        this.visto = v;
        clearTimeout(this.refresco);
        this.refresco = setTimeout(() => void this.cargarDirecto(), 300);
      });
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.refresco));
  }

  protected nombreMov(m: Mov): string {
    return this.t()[m];
  }

  protected intento(m: Mov, i: number): IntentoEnDirecto | undefined {
    return this.directo()?.intentos?.[m]?.[i];
  }

  protected peso(i: IntentoEnDirecto | undefined): string {
    return i && i.peso > 0 ? nota1(i.peso, this.i18n.lang()) : '—';
  }

  protected estado(i: IntentoEnDirecto | undefined): string {
    return i ? this.t()[i.resultado] : this.t().pendiente;
  }

  protected clase(i: IntentoEnDirecto | undefined): string {
    if (i?.resultado === 'valido') return 'border-success/50 bg-success/12 text-success';
    if (i?.resultado === 'nulo') return 'border-accent/50 bg-accent/12 text-accent-text';
    if (i?.resultado === 'renuncia') return 'border-line-subtle text-text-muted';
    return 'border-dashed border-line-strong text-text-tertiary';
  }

  protected mejor(m: Mov): string {
    const v = this.directo()?.mejor?.[m];
    return v ? nota1(v, this.i18n.lang()) : '—';
  }

  private abrir(o: OpcionPerfil | null): void {
    this.ficha.set(null);
    this.directo.set(null);
    this.fallo.set(false);
    if (!o) return;
    if (o.slug) {
      this.cargandoFicha.set(true);
      this.atletas
        .ficha(o.slug)
        .then((f) => {
          if (this.opcion()?.atletaId === o.atletaId) this.ficha.set(f);
        })
        .catch(() => undefined)
        .finally(() => this.cargandoFicha.set(false));
    }
    void this.cargarDirecto();
  }

  private async cargarDirecto(): Promise<void> {
    const o = this.opcion();
    if (!o) return;
    try {
      const d = await this.juegos.porraAtleta(o.atletaId, this.jornada() || undefined);
      if (this.opcion()?.atletaId === o.atletaId) {
        this.directo.set(d);
        this.fallo.set(false);
      }
    } catch {
      if (this.opcion()?.atletaId === o.atletaId && !this.directo()) this.fallo.set(true);
    }
  }
}

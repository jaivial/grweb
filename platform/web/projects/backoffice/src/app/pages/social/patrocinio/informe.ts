import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrKpi, GrSkeleton, GrToasts } from '@grcup/ui';
import { problemOf } from '../../../core/api';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { BoPageHeader, BoToggle, errText } from '../../../shared/ui';
import { SoNumber, SoTier, TIERS, diaCorto, num } from '../ui';
import { PatrocinioApi, type ConfigPatrocinio, type Informe, type InformeFila } from './api';

interface FormConfig {
  intervaloSeg: number;
  pesoOro: number;
  pesoPlata: number;
  pesoBronce: number;
  soloEnDirecto: boolean;
  activo: boolean;
}

interface Barra {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  valor: number;
  nombre: string;
}

const VACIO: FormConfig = { intervaloSeg: 90, pesoOro: 3, pesoPlata: 2, pesoBronce: 1, soloEnDirecto: true, activo: true };
const ANCHO = 620;
const ALTO = 200;

/**
 * «Patrocinio · Configuración e informe» (Figma 73 · «BO · Patrocinio · Configuración e informe»).
 * Configuración del worker (intervalo mínimo 15 s, pesos por tier, solo en directo) e informe del día con las
 * apariciones y los clics por banner, el CTR y la cola de pendientes.
 */
@Component({
  selector: 'bo-patrocinio-informe',
  imports: [FormsModule, RouterLink, BoPageHeader, BoToggle, GrAlert, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrKpi, GrSkeleton, SoNumber, SoTier],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Patrocinio · Configuración e informe" [badge]="config()?.activo ? 'Worker activo' : 'Worker parado'" [badgeTone]="config()?.activo ? 'accent' : 'neutral'"
        [subtitle]="'Un tic cada ' + (config()?.intervaloSeg ?? 90) + ' s mientras el directo está en juego · cola y registro de apariciones (§7)'"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Directo social', 'Patrocinio', 'Informe']">
        <ng-container actions>
          <a grButton icon="layout" [routerLink]="['/', comps.current()?.slug, 'patrocinio']">Banners</a>
          <button grButton variant="primary" icon="check" [loading]="guardando()" [disabled]="!sucio()" (click)="guardar()">Guardar configuración</button>
        </ng-container>
      </bo-page-header>

      @if (!puede()) {
        <gr-alert tone="warning" title="Tu rol no puede gestionar el patrocinio">Hace falta el permiso «web.editar».</gr-alert>
      }

      @if (cargando()) {
        <gr-skeleton class="h-64 rounded-lg" />
      } @else if (error()) {
        <gr-empty icon="wifi-off" title="No hemos podido cargar el patrocinio" [text]="error()">
          <button grButton (click)="cargar()">Reintentar</button>
        </gr-empty>
      } @else {
        @if (estimacion()) {
          <gr-alert tone="warning" [title]="estimacion()">
            Garantía: todos aparecen al menos 1 vez por jornada — primero los pendientes del día (oro > plata > bronce y orden). Aviso si la duración de los flights no da para una ronda completa.
            <span class="mt-2 block"><a [routerLink]="['/', comps.current()?.slug, 'patrocinio']" class="text-accent-text hover:underline">Revisar filas →</a></span>
          </gr-alert>
        }

        <div class="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <!-- ===== Configuración ===== -->
          <section class="flex flex-col gap-5">
            <div class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <h2 class="text-label-xs text-text-tertiary">Configuración del patrocinio</h2>

              <div class="mt-4 flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-label-s">Activo</p>
                  <p class="text-body-xs text-text-tertiary">El worker hace tics y publica patrocinio.banner</p>
                </div>
                <bo-toggle [value]="form().activo" label="Patrocinio activo" [disabled]="!puede()" (changed)="set({ activo: $event })" />
              </div>

              <div class="mt-4 flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-label-s">Solo durante el directo</p>
                  <p class="text-body-xs text-text-tertiary">Tics solo con la fase de live en_directo (caché 10 s)</p>
                </div>
                <bo-toggle [value]="form().soloEnDirecto" label="Solo durante el directo" [disabled]="!puede()" (changed)="set({ soloEnDirecto: $event })" />
              </div>

              <gr-field class="mt-5" label="Intervalo (segundos)" hint="Mínimo 15 s (§7)" [error]="errorIntervalo()">
                <so-number label="Intervalo entre banners en segundos" [disabled]="!puede()" [valor]="form().intervaloSeg" (changed)="set({ intervaloSeg: $event })" />
              </gr-field>

              <div class="mt-4 grid gap-3 sm:grid-cols-3">
                <gr-field label="Peso oro"><input grInput type="number" min="0" max="10" [ngModel]="form().pesoOro" (ngModelChange)="set({ pesoOro: +$event })" [disabled]="!puede()" /></gr-field>
                <gr-field label="Peso plata"><input grInput type="number" min="0" max="10" [ngModel]="form().pesoPlata" (ngModelChange)="set({ pesoPlata: +$event })" [disabled]="!puede()" /></gr-field>
                <gr-field label="Peso bronce"><input grInput type="number" min="0" max="10" [ngModel]="form().pesoBronce" (ngModelChange)="set({ pesoBronce: +$event })" [disabled]="!puede()" /></gr-field>
              </div>

              <div class="mt-6 flex items-center gap-3 rounded-md border border-success/30 bg-success/5 p-4">
                <gr-icon name="circle-check" [size]="20" class="text-success" />
                <div class="min-w-0 flex-1">
                  <p class="text-label-s">Configuración guardada</p>
                  <p class="text-body-xs text-text-tertiary">Versión {{ config()?.version ?? 1 }} · aplica al siguiente tic</p>
                </div>
                <a grButton size="s" variant="secondary" [routerLink]="['/', comps.current()?.slug, 'patrocinio']">Ver en la web</a>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <gr-kpi label="Banners activos" [value]="num(activos())" caption="en la cola" />
              <gr-kpi label="Pendientes hoy" [value]="num(pendientes().length)" caption="aún sin aparecer" />
            </div>
          </section>

          <!-- ===== Informe ===== -->
          <section class="flex flex-col gap-5">
            <div class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <header class="flex flex-wrap items-center justify-between gap-2">
                <h2 class="text-label-xs text-text-tertiary">Informe · {{ diaCorto(informe()?.dia) }}</h2>
                <span class="text-body-xs text-text-tertiary">{{ activos() }} activos · {{ pendientes().length }} pendientes</span>
              </header>

              @if (!barras().length) {
                <gr-empty icon="activity" title="Todavía no hay apariciones" text="Cuando el worker reparta banners verás aquí las apariciones y los clics del día." />
              } @else {
                <div class="mt-4 rounded-md border border-line-subtle bg-bg-raised p-4">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <p class="text-label-s">Apariciones por banner · hoy</p>
                    <div class="flex flex-wrap items-center gap-3 text-body-xs text-text-tertiary">
                      @for (t of tiers; track t) {
                        <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-pill" [style.background]="TIERS[t].color"></span>{{ TIERS[t].l }} × {{ cuenta(t) }}</span>
                      }
                    </div>
                  </div>
                  <svg class="mt-3 w-full" [attr.viewBox]="'0 0 ' + ancho + ' ' + alto" role="img" aria-label="Apariciones por banner">
                    <line [attr.x1]="0" [attr.y1]="alto - 1" [attr.x2]="ancho" [attr.y2]="alto - 1" stroke="#2e2729" stroke-width="1" />
                    @for (b of barras(); track b.x) {
                      <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" rx="3" [attr.fill]="b.color" />
                      <text [attr.x]="b.x + b.w / 2" [attr.y]="b.y - 6" text-anchor="middle" fill="#d1d5db" font-size="11" font-family="Roboto Mono, monospace">{{ b.valor }}</text>
                      @if (b.nombre) { <text [attr.x]="b.x + b.w / 2" [attr.y]="alto - 8" text-anchor="middle" fill="#9ca3af" font-size="9" font-family="Inter, sans-serif">{{ b.nombre }}</text> }
                    }
                  </svg>
                </div>

                <div class="mt-4 overflow-x-auto">
                  <table class="w-full min-w-[420px] text-left text-body-s">
                    <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary">
                      <tr><th class="py-2 pr-3">Banner</th><th class="px-3 py-2 text-right">Apar.</th><th class="px-3 py-2 text-right">Clics</th><th class="py-2 pl-3 text-right">CTR</th></tr>
                    </thead>
                    <tbody>
                      @for (f of informe()?.banners ?? []; track f.id) {
                        <tr class="border-b border-line-subtle last:border-0">
                          <td class="py-2 pr-3">
                            <span class="inline-flex items-center gap-2">
                              <span class="text-label-s">{{ f.patrocinador }}</span>
                              <so-tier [tier]="f.tier" />
                            </span>
                          </td>
                          <td class="px-3 py-2 text-right font-mono">{{ f.apariciones }}</td>
                          <td class="px-3 py-2 text-right font-mono">{{ f.clics }}</td>
                          <td class="py-2 pl-3 text-right font-mono">{{ ctr(f) }}</td>
                        </tr>
                      } @empty { <tr><td colspan="4" class="py-6 text-center text-text-tertiary">Sin banners.</td></tr> }
                    </tbody>
                  </table>
                </div>
              }
            </div>

            <div class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <h2 class="text-label-xs text-text-tertiary">Cola de pendientes del día</h2>
              @if (!pendientes().length) {
                <p class="mt-3 text-body-s text-text-tertiary">Todos los banners activos ya han salido al menos una vez hoy.</p>
              } @else {
                <ul class="mt-3 flex flex-col gap-2">
                  @for (p of pendientes(); track p.id) {
                    <li class="flex items-center gap-3 rounded-sm border border-line-subtle bg-bg-raised p-3">
                      <so-tier [tier]="p.tier" />
                      <span class="min-w-0 flex-1 truncate text-label-s">{{ p.patrocinador }}</span>
                      <span class="shrink-0 text-body-xs text-text-tertiary">espera 1.ª aparición</span>
                    </li>
                  }
                </ul>
              }
            </div>
          </section>
        </div>
      }
    </div>
  `,
})
export class PatrocinioInformePage {
  private readonly api = inject(PatrocinioApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);

  protected readonly config = signal<ConfigPatrocinio | null>(null);
  protected readonly informe = signal<Informe | null>(null);
  protected readonly form = signal<FormConfig>({ ...VACIO });
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');

  protected readonly ancho = ANCHO;
  protected readonly alto = ALTO;
  protected readonly TIERS = TIERS;
  protected readonly tiers: (keyof typeof TIERS)[] = ['oro', 'plata', 'bronce'];
  protected readonly num = num;
  protected readonly diaCorto = diaCorto;

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'web.editar'));
  protected readonly activos = computed(() => this.informe()?.banners.filter((b) => b.activo).length ?? 0);
  protected readonly pendientes = computed<InformeFila[]>(() => {
    const inf = this.informe();
    if (!inf) return [];
    return inf.pendientes.map((id) => inf.banners.find((b) => b.id === id)).filter((b): b is InformeFila => !!b);
  });
  protected readonly errorIntervalo = computed(() => (this.form().intervaloSeg < 15 ? 'El intervalo mínimo es de 15 segundos.' : ''));
  protected readonly sucio = computed(() => {
    const c = this.config();
    const f = this.form();
    if (!c) return false;
    return (
      f.activo !== c.activo ||
      f.soloEnDirecto !== c.soloEnDirecto ||
      f.intervaloSeg !== c.intervaloSeg ||
      f.pesoOro !== c.pesoOro ||
      f.pesoPlata !== c.pesoPlata ||
      f.pesoBronce !== c.pesoBronce
    );
  });
  /** «Con N banners cada X s, la primera ronda completa tarda Y min» (§7): se calcula en el cliente. */
  protected readonly estimacion = computed(() => {
    const n = this.activos();
    const x = this.form().intervaloSeg;
    if (n <= 0 || x <= 0) return '';
    const min = (n * x) / 60;
    const texto = `Con ${n} banners cada ${x} s, la primera ronda completa tarda ${min >= 10 ? Math.round(min) : Math.round(min * 10) / 10} min`;
    const aviso = this.informe()?.aviso;
    return aviso ? `${texto}. ${aviso}` : texto;
  });
  protected readonly barras = computed<Barra[]>(() => {
    const filas = this.informe()?.banners ?? [];
    if (!filas.length) return [];
    const max = Math.max(...filas.map((f) => f.apariciones), 1);
    const hueco = 14;
    const w = Math.min(46, (ANCHO - 8) / filas.length - hueco);
    const paso = (ANCHO - 8) / filas.length;
    // Con muchas barras el nombre no cabe: se acorta y, si no hay sitio, se omite.
    const caben = paso >= 34;
    return filas.map((f, i) => {
      const h = Math.round(((f.apariciones / max) * (ALTO - 34)) / 1);
      const nombre = caben ? (f.patrocinador.length > 7 ? f.patrocinador.slice(0, 6) + '…' : f.patrocinador) : '';
      return {
        x: 4 + i * paso + (paso - w) / 2,
        y: ALTO - 1 - h,
        w,
        h,
        color: TIERS[f.tier].color,
        valor: f.apariciones,
        nombre,
      };
    });
  });

  constructor() {
    effect(() => {
      const cid = this.cid();
      if (!cid) return;
      untracked(() => void this.cargar());
    });
  }

  protected async cargar(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    this.cargando.set(true);
    this.error.set('');
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const [config, informe] = await Promise.all([this.api.config(cid), this.api.informe(cid, hoy)]);
      this.config.set(config);
      this.informe.set(informe);
      this.form.set({
        intervaloSeg: config.intervaloSeg,
        pesoOro: config.pesoOro,
        pesoPlata: config.pesoPlata,
        pesoBronce: config.pesoBronce,
        soloEnDirecto: config.soloEnDirecto,
        activo: config.activo,
      });
    } catch (e) {
      this.error.set(errText(e, 'No se pudo cargar el patrocinio.'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected set(p: Partial<FormConfig>): void {
    this.form.update((f) => ({ ...f, ...p }));
  }

  protected cuenta(t: keyof typeof TIERS): number {
    return this.informe()?.banners.filter((b) => b.tier === t && b.activo).length ?? 0;
  }

  protected ctr(f: InformeFila): string {
    if (!f.apariciones) return '—';
    return `${((f.clics / f.apariciones) * 100).toFixed(1).replace('.', ',')} %`;
  }

  protected async guardar(): Promise<void> {
    const cid = this.cid();
    const c = this.config();
    if (!cid || !c || this.errorIntervalo()) return;
    this.guardando.set(true);
    try {
      const f = this.form();
      const guardado = await this.api.guardarConfig(cid, f, c.version);
      this.config.set(guardado);
      this.toasts.success('Configuración guardada');
      await this.cargar();
    } catch (e) {
      const p = problemOf(e);
      this.toasts.error(p.code === 'CONFLICTO_EDICION' ? 'Otra persona ha cambiado la configuración' : errText(e, 'No se pudo guardar.'));
      if (p.code === 'CONFLICTO_EDICION') await this.cargar();
    } finally {
      this.guardando.set(false);
    }
  }
}

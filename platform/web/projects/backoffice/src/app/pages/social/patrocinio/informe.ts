import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrEmpty, GrIcon, GrToasts } from '@grcup/ui';
import { problemOf } from '../../../core/api';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { BoPageHeader, BoToggle, errText } from '../../../shared/ui';
import { SoAjuste, SoCard, SoGrupo, SoNumber, SoSkelFilas, SoTier, TIERS, TIER_LIST, diaCorto, num, pct, rangoError, type Tier } from '../ui';
import { PatrocinioApi, type ConfigPatrocinio, type Informe, type InformeFila } from './api';

interface FormConfig {
  intervaloSeg: number;
  pesoOro: number;
  pesoPlata: number;
  pesoBronce: number;
  soloEnDirecto: boolean;
  activo: boolean;
}

const VACIO: FormConfig = { intervaloSeg: 90, pesoOro: 3, pesoPlata: 2, pesoBronce: 1, soloEnDirecto: true, activo: true };
/** Banners visibles en la gráfica antes de «Ver todos». */
const TOP = 10;
const PESO: Record<Tier, keyof FormConfig> = { oro: 'pesoOro', plata: 'pesoPlata', bronce: 'pesoBronce' };

/**
 * «Patrocinio · Configuración e informe» (Figma 73 · «BO · Patrocinio · Configuración e informe», UI v2).
 * Configuración del worker (intervalo mínimo 15 s, pesos por tier, solo en directo) e informe del día: ranking
 * horizontal de apariciones (color del tier, clics debajo y CTR), resumen y cola de pendientes. La gráfica es
 * legible con 3 o con 40 banners: se muestran los 10 primeros y el resto con «Ver todos».
 */
@Component({
  selector: 'bo-patrocinio-informe',
  imports: [FormsModule, RouterLink, BoPageHeader, BoToggle, GrAlert, GrButton, GrEmpty, GrIcon, SoAjuste, SoCard, SoGrupo, SoNumber, SoSkelFilas, SoTier],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header title="Patrocinio · Configuración e informe" [badge]="config()?.activo ? 'Worker activo' : 'Worker parado'" [badgeTone]="config()?.activo ? 'accent' : 'neutral'"
        [subtitle]="'Un tic cada ' + (config()?.intervaloSeg ?? 90) + ' s mientras el directo está en juego · cola y registro de apariciones (§7)'"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Directo social', 'Patrocinio', 'Informe']">
        <ng-container actions>
          <a grButton icon="layout" [routerLink]="['/', comps.current()?.slug, 'patrocinio']">Banners</a>
          <button grButton variant="primary" icon="check" [loading]="guardando()" [disabled]="!sucio() || !!errorIntervalo() || pesoFuera() || !puede()" (click)="guardar()">Guardar configuración</button>
        </ng-container>
      </bo-page-header>

      @if (!puede()) {
        <gr-alert tone="warning" title="Tu rol no puede gestionar el patrocinio">Hace falta el permiso «web.editar». Puedes ver el informe, pero no guardar la configuración.
          <a alertAction [routerLink]="['/', comps.current()?.slug, 'equipo']" class="mt-2 inline-flex items-center gap-1 text-label-s hover:underline">Pedir acceso a un admin <gr-icon name="arrow-right" [size]="14" /></a>
        </gr-alert>
      }

      @if (cargando()) {
        <div class="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
          <div class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card"><so-skel-filas [n]="5" [avatar]="false" /></div>
          <div class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card"><so-skel-filas [n]="8" [avatar]="false" /></div>
        </div>
      } @else if (error()) {
        <div class="rounded-lg border border-line-subtle bg-bg-card">
          <gr-empty icon="wifi-off" title="No hemos podido cargar el patrocinio" [text]="error()">
            <button grButton variant="primary" icon="refresh" (click)="cargar()">Reintentar</button>
          </gr-empty>
        </div>
      } @else {
        @if (estimacion()) {
          <gr-alert [tone]="informe()?.aviso ? 'warning' : 'info'" [title]="estimacion()">
            Todos salen al menos una vez por jornada: primero los pendientes del día (oro → plata → bronce y orden) y después según su peso.
            @if (informe()?.aviso; as aviso) { <span class="mt-1 block text-warning">{{ aviso }}</span> }
            <a alertAction [routerLink]="['/', comps.current()?.slug, 'patrocinio']" class="mt-2 inline-flex items-center gap-1 text-label-s text-info hover:underline">Revisar banners <gr-icon name="arrow-right" [size]="14" /></a>
          </gr-alert>
        }

        <div class="grid gap-6 lg:grid-cols-[400px_minmax(0,1fr)]">
          <!-- ===== Configuración ===== -->
          <div class="flex min-w-0 flex-col gap-6">
            <so-card titulo="Reparto de banners" ayuda="Cómo y cuándo publica el worker en el chat">
              <so-ajuste label="Patrocinio activo" ayuda="El worker hace tics y publica patrocinio.banner">
                <bo-toggle [value]="form().activo" label="Patrocinio activo" [disabled]="!puede()" (changed)="set({ activo: $event })" />
              </so-ajuste>
              <so-ajuste label="Solo durante el directo" ayuda="Tics solo con la fase en directo (caché 10 s)">
                <bo-toggle [value]="form().soloEnDirecto" label="Solo durante el directo" [disabled]="!puede()" (changed)="set({ soloEnDirecto: $event })" />
              </so-ajuste>
              <hr class="border-line-subtle" />
              <so-ajuste label="Intervalo entre banners" ayuda="Mínimo 15 s · cuanto menor, más apariciones">
                <so-number ancho="xs" unidad="s" label="Intervalo entre banners en segundos" [disabled]="!puede()" [valor]="form().intervaloSeg" [cambiado]="form().intervaloSeg !== config()?.intervaloSeg" (changed)="set({ intervaloSeg: $event })" />
              </so-ajuste>
              @if (errorIntervalo()) { <p class="-mt-2 flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="14" />{{ errorIntervalo() }}</p> }
              <hr class="border-line-subtle" />
              <so-grupo>PESO POR TIER · REPARTO ESPERADO</so-grupo>
              @for (t of tiers; track t) {
                <div class="flex items-center gap-3">
                  <span class="size-2.5 shrink-0 rounded-pill" [style.background]="TIERS[t].color" aria-hidden="true"></span>
                  <span class="flex-1 text-label-s">{{ TIERS[t].l }}</span>
                  <span class="font-mono text-mono-s text-text-tertiary">{{ reparto()[t] }} %</span>
                  <so-number ancho="xs" unidad="× peso" [label]="'Peso ' + TIERS[t].l" [min]="0" [max]="10" [disabled]="!puede()" [valor]="peso(t)" [cambiado]="peso(t) !== pesoGuardado(t)" (changed)="setPeso(t, $event)" />
                </div>
              }
              <div class="flex h-2 gap-0.5 overflow-hidden rounded-2xs" aria-hidden="true">
                @for (t of tiers; track t) { <span class="h-full" [style.width.%]="reparto()[t]" [style.background]="TIERS[t].color"></span> }
              </div>
              <footer class="flex items-center gap-2 border-t border-line-subtle pt-4">
                <gr-icon [name]="sucio() ? 'pencil' : 'circle-check'" [size]="16" [class]="sucio() ? 'text-warning' : 'text-success'" />
                <div class="min-w-0 flex-1">
                  <p class="text-label-s">{{ sucio() ? 'Cambios sin guardar' : 'Todo guardado' }}</p>
                  <p class="text-body-xs text-text-tertiary">Versión {{ config()?.version ?? 1 }} · aplica al siguiente tic</p>
                </div>
                @if (sucio()) { <button grButton size="s" variant="ghost" (click)="descartar()">Descartar</button> }
              </footer>
            </so-card>

            <so-card titulo="Cola de pendientes del día" ayuda="Banners activos que aún no han salido hoy">
              @if (!pendientes().length) {
                <p class="flex items-center gap-2 text-body-s text-text-tertiary"><gr-icon name="circle-check" [size]="16" class="text-success" />Todos los banners activos ya han salido al menos una vez hoy.</p>
              } @else {
                <ul class="flex flex-col gap-2">
                  @for (p of pendientes(); track p.id; let i = $index) {
                    <li class="flex items-center gap-3 rounded-md bg-bg-raised px-3 py-2.5">
                      <so-tier [tier]="p.tier" />
                      <span class="min-w-0 flex-1 truncate text-label-s">{{ p.patrocinador }}</span>
                      <span class="shrink-0 text-body-xs text-text-tertiary">{{ i === 0 ? 'siguiente' : 'en cola · ' + (i + 1) + '.º' }}</span>
                    </li>
                  }
                </ul>
              }
            </so-card>
          </div>

          <!-- ===== Informe ===== -->
          <so-card titulo="Informe del día" [ayuda]="diaCorto(informe()?.dia) + ' · ' + activos() + ' activos · ' + pendientes().length + ' pendientes'" class="self-start">
            <div class="grid grid-cols-3 gap-3">
              @for (d of resumen(); track d.l) {
                <div class="min-w-0 rounded-md bg-bg-raised px-3.5 py-3">
                  <p class="font-mono text-mono-xs text-text-tertiary">{{ d.l }}</p>
                  <p class="mt-1 truncate text-ui-h4 md:text-ui-h3">{{ d.v }}</p>
                  <p class="hidden text-body-xs text-text-tertiary sm:block">{{ d.c }}</p>
                </div>
              }
            </div>

            @if (!ranking().length || !totApariciones()) {
              <gr-empty icon="activity" title="Todavía no hay apariciones" text="Cuando el worker reparta banners verás aquí el ranking de apariciones, los clics y el CTR del día." />
            } @else {
              <figure class="flex flex-col gap-3">
                <figcaption class="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span class="mr-auto text-label-s">Apariciones por banner · hoy</span>
                  @for (t of tiers; track t) {
                    <span class="inline-flex items-center gap-1.5 text-body-xs text-text-tertiary"><span class="size-2 rounded-pill" [style.background]="TIERS[t].color"></span>{{ TIERS[t].l }}</span>
                  }
                  <span class="inline-flex items-center gap-1.5 text-body-xs text-text-tertiary"><span class="h-1 w-3 rounded-pill bg-text-primary/55"></span>Clics</span>
                </figcaption>
                <div class="hidden grid-cols-[minmax(0,150px)_minmax(0,1fr)_150px] gap-3 font-mono text-mono-xs text-text-tertiary sm:grid">
                  <span>Banner</span><span></span><span class="text-right">Apar. · clics · CTR</span>
                </div>
                <ol class="flex flex-col gap-2.5" aria-label="Ranking de apariciones">
                  @for (f of rankingVisible(); track f.id) {
                    <li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,150px)_minmax(0,1fr)_150px]">
                      <span class="truncate text-body-s" [class]="f.activo ? 'text-text-secondary' : 'text-text-muted'" [title]="f.patrocinador">{{ f.patrocinador }}</span>
                      <span class="order-last col-span-2 flex flex-col gap-[3px] sm:order-none sm:col-span-1" aria-hidden="true">
                        <span class="h-3 rounded-[3px]" [style.width.%]="ancho(f.apariciones)" [style.background]="TIERS[f.tier].color"></span>
                        <span class="h-1 rounded-pill bg-text-primary/55" [style.width.%]="ancho(f.clics)"></span>
                      </span>
                      <span class="text-right font-mono text-mono-s whitespace-nowrap">
                        {{ f.apariciones }} <span class="text-text-tertiary">· {{ f.clics }} · {{ pct(f.clics, f.apariciones) }}</span>
                      </span>
                    </li>
                  }
                </ol>
                @if (ranking().length > top) {
                  <button grButton size="s" variant="ghost" class="self-start" [iconRight]="todos() ? 'chevron-down' : 'chevron-right'" (click)="todos.update(v => !v)">
                    {{ todos() ? 'Ver solo los ' + top + ' primeros' : 'Ver todos (' + ranking().length + ')' }}
                  </button>
                }
              </figure>
            }
          </so-card>
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

  protected readonly todos = signal(false);
  protected readonly top = TOP;
  protected readonly TIERS = TIERS;
  protected readonly tiers = TIER_LIST;
  protected readonly num = num;
  protected readonly pct = pct;
  protected readonly diaCorto = diaCorto;

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'web.editar'));
  protected readonly activos = computed(() => this.informe()?.banners.filter((b) => b.activo).length ?? 0);
  protected readonly pendientes = computed<InformeFila[]>(() => {
    const inf = this.informe();
    if (!inf) return [];
    return inf.pendientes.map((id) => inf.banners.find((b) => b.id === id)).filter((b): b is InformeFila => !!b);
  });
  protected readonly pesoFuera = computed(() => this.tiers.some((t) => !!rangoError(this.peso(t), 0, 10)));
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
    const cifra = new Intl.NumberFormat('es-ES', { maximumFractionDigits: min >= 10 ? 0 : 1 }).format(min);
    return `Con ${n} banners cada ${x} s, la primera ronda completa tarda ${cifra} min`;
  });
  /** Ranking por apariciones (desc); la barra más larga es el 100 %. */
  protected readonly ranking = computed(() => [...(this.informe()?.banners ?? [])].sort((x, y) => y.apariciones - x.apariciones || x.orden - y.orden));
  protected readonly rankingVisible = computed(() => (this.todos() ? this.ranking() : this.ranking().slice(0, TOP)));
  private readonly maxAp = computed(() => Math.max(1, ...this.ranking().map((f) => f.apariciones)));
  protected readonly totApariciones = computed(() => this.ranking().reduce((a, f) => a + f.apariciones, 0));
  protected readonly totClics = computed(() => this.ranking().reduce((a, f) => a + f.clics, 0));
  protected readonly resumen = computed(() => [
    { l: 'APARICIONES', v: num(this.totApariciones()), c: 'hoy en el chat' },
    { l: 'CLICS', v: num(this.totClics()), c: 'hoy' },
    { l: 'CTR MEDIO', v: pct(this.totClics(), this.totApariciones()), c: 'clics / apariciones' },
  ]);
  /** Reparto esperado por tier (peso × banners activos del tier), en %. */
  protected readonly reparto = computed(() => {
    const f = this.form();
    const n = (t: Tier) => this.informe()?.banners.filter((b) => b.tier === t && b.activo).length ?? 0;
    const w = { oro: f.pesoOro * n('oro'), plata: f.pesoPlata * n('plata'), bronce: f.pesoBronce * n('bronce') };
    const tot = w.oro + w.plata + w.bronce || 1;
    return { oro: Math.round((w.oro / tot) * 100), plata: Math.round((w.plata / tot) * 100), bronce: Math.round((w.bronce / tot) * 100) } as Record<Tier, number>;
  });

  protected ancho(v: number): number {
    return v ? Math.max(1.5, (v / this.maxAp()) * 100) : 0;
  }
  protected peso(t: Tier): number {
    return this.form()[PESO[t]] as number;
  }
  protected pesoGuardado(t: Tier): number | undefined {
    const c = this.config();
    return c ? (c[PESO[t] as keyof ConfigPatrocinio] as number) : undefined;
  }
  protected setPeso(t: Tier, v: number): void {
    this.set({ [PESO[t]]: v } as Partial<FormConfig>);
  }
  protected descartar(): void {
    const c = this.config();
    if (c) this.form.set({ intervaloSeg: c.intervaloSeg, pesoOro: c.pesoOro, pesoPlata: c.pesoPlata, pesoBronce: c.pesoBronce, soloEnDirecto: c.soloEnDirecto, activo: c.activo });
  }

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
      this.toasts.error(p.code === 'CONFLICTO_EDICION' ? 'Otra persona guardó antes. Hemos recargado los valores guardados: revisa y vuelve a aplicar tus cambios antes de guardar.' : errText(e, 'No se pudo guardar.'));
      if (p.code === 'CONFLICTO_EDICION') await this.cargar();
    } finally {
      this.guardando.set(false);
    }
  }
}

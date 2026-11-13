import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, GrToasts } from '@grcup/ui';
import { problemOf } from '../../../core/api';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { BoDrawer, BoPageHeader, BoToggle, Confirm, Media, errText } from '../../../shared/ui';
import { SoFecha, SoSegmented, SoSkelFilas, SoSkelKpis, SoThumb, SoTier, TIER_LIST, TIERS, diaMes, num, pct, urlSegura, type SoOpcion } from '../ui';
import { PatrocinioApi, type Banner, type BannerBorrador, type Informe } from './api';

interface FormBanner {
  patrocinador: string;
  imagenUrl: string;
  imagenMovilUrl: string;
  urlDestino: string;
  tier: Banner['tier'];
  activo: boolean;
  desde: string;
  hasta: string;
  orden: number;
}

const VACIO: FormBanner = { patrocinador: '', imagenUrl: '', imagenMovilUrl: '', urlDestino: '', tier: 'oro', activo: true, desde: '', hasta: '', orden: 0 };
const aIso = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : null);
/** ISO (UTC) → «aaaa-mm-dd» del día en Madrid, la misma fecha que pinta la tabla. */
const diaMadrid = (iso?: string | null) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(iso)) : '');

/**
 * «Patrocinio · Banners» (Figma 73 · «BO · Patrocinio · Banners» y «… · Editar», UI v2).
 * Lista de banners con su tier, su vigencia, su estado y las apariciones, clics y CTR del día (endpoint
 * /patrocinio/informe). En móvil cada banner es una tarjeta; en escritorio, una tabla.
 */
@Component({
  selector: 'bo-patrocinio',
  imports: [FormsModule, RouterLink, BoDrawer, BoPageHeader, BoToggle, GrAlert, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrKpi, SoFecha, SoSegmented, SoSkelFilas, SoSkelKpis, SoThumb, SoTier],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-6 pb-24">
      <bo-page-header title="Patrocinio · Banners" [badge]="activos() + ' activos'" [badgeTone]="activos() ? 'accent' : 'neutral'"
        [subtitle]="'Aparecen en el chat cada ' + (config()?.intervaloSeg ?? 90) + ' s · todos salen al menos una vez por jornada (§7)'"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Directo social', 'Patrocinio']">
        <ng-container actions>
          <a grButton icon="activity" [routerLink]="['/', comps.current()?.slug, 'patrocinio', 'informe']">Informe del día</a>
          <button grButton variant="primary" icon="plus" [disabled]="!puede()" (click)="nuevo()">Nuevo banner</button>
        </ng-container>
      </bo-page-header>

      @if (!puede()) {
        <gr-alert tone="warning" title="Tu rol no puede gestionar el patrocinio">Hace falta el permiso «web.editar» para tocar los banners. Puedes verlos, pero los botones de crear, pausar y eliminar quedan desactivados.
          <a alertAction [routerLink]="['/', comps.current()?.slug, 'equipo']" class="mt-2 inline-flex items-center gap-1 text-label-s hover:underline">Pedir acceso a un admin <gr-icon name="arrow-right" [size]="14" /></a>
        </gr-alert>
      }

      @if (cargando()) {
        <so-skel-kpis />
        <div class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card"><so-skel-filas [n]="6" [avatar]="false" /></div>
      } @else if (error()) {
        <div class="rounded-lg border border-line-subtle bg-bg-card">
          <gr-empty icon="wifi-off" title="No hemos podido cargar los banners" [text]="error()">
            <button grButton variant="primary" icon="refresh" (click)="cargar()">Reintentar</button>
          </gr-empty>
        </div>
      } @else if (!banners().length) {
        <div class="rounded-lg border border-line-subtle bg-bg-card">
          <gr-empty icon="sparkles" title="Todavía no hay banners" text="Crea el primer banner para que aparezca en el chat de la sala. Todos salen al menos una vez por jornada.">
            <button grButton variant="primary" icon="plus" [disabled]="!puede()" (click)="nuevo()">Nuevo banner</button>
          </gr-empty>
        </div>
      } @else {
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <gr-kpi label="Banners activos" [value]="num(activos())" [caption]="'de ' + banners().length + ' en la cola'" />
          <gr-kpi label="Apariciones hoy" [value]="num(totApariciones())" caption="en el chat de la sala" />
          <gr-kpi label="Clics hoy" [value]="num(totClics())" caption="en los banners" />
          <gr-kpi label="CTR medio" [value]="pct(totClics(), totApariciones())" caption="clics / apariciones" />
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <label class="relative min-w-0 flex-1 basis-64 md:max-w-xs">
            <span class="sr-only">Buscar</span>
            <gr-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
            <input grInput class="pl-9" placeholder="Buscar por patrocinador o URL…" [ngModel]="q()" (ngModelChange)="q.set($event)" />
          </label>
          <so-segmented label="Tier" [opciones]="tiersOpc()" [value]="tier()" (valueChange)="tier.set($event)" />
          <button type="button" class="inline-flex h-11 items-center gap-2 rounded-sm border px-3 text-label-s transition-colors md:h-10" [attr.aria-pressed]="soloPausados()"
            [class]="soloPausados() ? 'border-accent bg-accent/10 text-accent-text' : 'border-line-strong text-text-secondary hover:border-text-muted hover:text-text-primary'"
            (click)="soloPausados.update(v => !v)">
            <gr-icon [name]="soloPausados() ? 'check' : 'pause'" [size]="16" />Solo pausados
          </button>
          <span class="ml-auto hidden text-body-xs text-text-tertiary xl:inline">Orden de la cola: tier → orden</span>
        </div>

        <section class="min-w-0 overflow-hidden rounded-lg border border-line-subtle bg-bg-card" aria-label="Banners">
          @if (!visibles().length) {
            <gr-empty icon="search" title="Ningún banner coincide" text="Prueba con otro nombre o quita los filtros de tier y estado.">
              <button grButton (click)="limpiar()">Quitar filtros</button>
            </gr-empty>
          } @else {
            <!-- escritorio: tabla -->
            <div class="hidden overflow-x-auto md:block">
              <table class="w-full min-w-[940px] text-left text-body-s">
                <thead class="border-b border-line-subtle bg-bg-surface font-mono text-mono-xs text-text-tertiary">
                  <tr>
                    <th class="px-5 py-3 font-medium">Patrocinador</th><th class="px-3 py-3 font-medium">Tier</th><th class="px-3 py-3 font-medium">Vigencia</th>
                    <th class="px-3 py-3 text-right font-medium">Hoy</th><th class="px-3 py-3 text-right font-medium">Clics</th><th class="px-3 py-3 text-right font-medium">CTR</th>
                    <th class="px-3 py-3 font-medium">Estado</th><th class="px-5 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  @for (b of visibles(); track b.id) {
                    <tr class="border-b border-line-subtle transition-colors last:border-0 hover:bg-bg-raised/40">
                      <td class="px-5 py-3">
                        <div class="flex items-center gap-3">
                          <so-thumb class="h-10 w-[72px]" [src]="b.imagenUrl" [nombre]="b.patrocinador" />
                          <div class="min-w-0 max-w-[220px]">
                            <p class="truncate text-label-s" [class.text-text-secondary]="!b.activo" [title]="b.patrocinador">{{ b.patrocinador }}</p>
                            <p class="truncate text-body-xs text-text-tertiary" [title]="b.urlDestino">{{ b.urlDestino }}</p>
                          </div>
                        </div>
                      </td>
                      <td class="px-3 py-3"><so-tier [tier]="b.tier" /></td>
                      <td class="px-3 py-3 font-mono text-mono-s whitespace-nowrap" [class]="b.desde || b.hasta ? 'text-text-secondary' : 'text-text-tertiary'">{{ vigencia(b) }}</td>
                      <td class="px-3 py-3 text-right font-mono text-mono-s" [class]="b.activo ? 'text-text-primary' : 'text-text-muted'">{{ apariciones(b.id) }}</td>
                      <td class="px-3 py-3 text-right font-mono text-mono-s" [class]="b.activo ? 'text-text-primary' : 'text-text-muted'">{{ clics(b.id) }}</td>
                      <td class="px-3 py-3 text-right font-mono text-mono-s" [class]="b.activo ? 'text-text-primary' : 'text-text-muted'">{{ pct(clics(b.id), apariciones(b.id)) }}</td>
                      <td class="px-3 py-3">
                        <span class="flex items-center gap-1">
                          <bo-toggle [value]="b.activo" [label]="(b.activo ? 'Pausar' : 'Activar') + ' el banner de ' + b.patrocinador" [disabled]="!puede() || guardandoId() === b.id" (changed)="alternar(b, $event)" />
                          <span class="text-label-s" [class]="b.activo ? 'text-success' : 'text-text-tertiary'">{{ b.activo ? 'Activo' : 'Pausado' }}</span>
                        </span>
                      </td>
                      <td class="px-5 py-3">
                        <div class="flex items-center justify-end gap-1">
                          <button grIconButton icon="pencil" [label]="'Editar ' + b.patrocinador" (click)="editar(b)"></button>
                          <button grIconButton icon="trash" class="hover:!text-accent-text" [label]="'Eliminar ' + b.patrocinador" [disabled]="!puede()" (click)="eliminar(b)"></button>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <!-- móvil: tarjetas -->
            <ul class="divide-y divide-line-subtle md:hidden">
              @for (b of visibles(); track b.id) {
                <li class="flex flex-col gap-3 p-4">
                  <div class="flex items-center gap-3">
                    <so-thumb class="h-10 w-16" [src]="b.imagenUrl" [nombre]="b.patrocinador" />
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-label-s">{{ b.patrocinador }}</p>
                      <p class="truncate text-body-xs text-text-tertiary">{{ b.urlDestino }}</p>
                    </div>
                    <so-tier [tier]="b.tier" />
                  </div>
                  <dl class="grid grid-cols-3 gap-2 rounded-md bg-bg-raised/60 px-3 py-2 text-center">
                    <div><dt class="font-mono text-mono-xs text-text-tertiary">Hoy</dt><dd class="font-mono text-mono-s">{{ apariciones(b.id) }}</dd></div>
                    <div><dt class="font-mono text-mono-xs text-text-tertiary">Clics</dt><dd class="font-mono text-mono-s">{{ clics(b.id) }}</dd></div>
                    <div><dt class="font-mono text-mono-xs text-text-tertiary">CTR</dt><dd class="font-mono text-mono-s">{{ pct(clics(b.id), apariciones(b.id)) }}</dd></div>
                  </dl>
                  <div class="flex items-center gap-1">
                    <bo-toggle [value]="b.activo" [label]="(b.activo ? 'Pausar' : 'Activar') + ' el banner de ' + b.patrocinador" [disabled]="!puede() || guardandoId() === b.id" (changed)="alternar(b, $event)" />
                    <span class="text-label-s" [class]="b.activo ? 'text-success' : 'text-text-tertiary'">{{ b.activo ? 'Activo' : 'Pausado' }}</span>
                    <span class="ml-2 truncate font-mono text-mono-xs text-text-tertiary">{{ vigencia(b) }}</span>
                    <span class="ml-auto flex gap-1">
                      <button grIconButton icon="pencil" [label]="'Editar ' + b.patrocinador" (click)="editar(b)"></button>
                      <button grIconButton icon="trash" [label]="'Eliminar ' + b.patrocinador" [disabled]="!puede()" (click)="eliminar(b)"></button>
                    </span>
                  </div>
                </li>
              }
            </ul>
          }
          <footer class="flex flex-wrap items-center gap-3 border-t border-line-subtle px-5 py-3.5 text-body-xs text-text-tertiary">
            <span>{{ banners().length }} banners · {{ activos() }} activos · {{ informe()?.pendientes?.length ?? 0 }} pendientes de su primera aparición hoy</span>
            <a class="ml-auto inline-flex items-center gap-1 text-label-s text-accent-text hover:underline" [routerLink]="['/', comps.current()?.slug, 'patrocinio', 'informe']">Ver informe del día<gr-icon name="chevron-right" [size]="16" /></a>
          </footer>
        </section>
      }
    </div>

    <!-- ===== Drawer de edición ===== -->
    <bo-drawer [(open)]="abierto" [title]="editando() ? 'Editar banner' : 'Nuevo banner'">
      <div class="flex flex-col gap-6">
        <p class="-mt-1 flex items-center gap-2 text-body-xs text-text-tertiary">
          <span class="size-2 rounded-pill" [class]="form().activo ? 'bg-success' : 'bg-text-muted'" aria-hidden="true"></span>
          {{ form().activo ? 'Activo' : 'Pausado' }}@if (editando(); as e) { · versión {{ e.version }} }
        </p>
        <gr-field label="Patrocinador" hint="Nombre público en el chat y en el informe" [error]="errorPatrocinador()">
          <input grInput [ngModel]="form().patrocinador" (ngModelChange)="set({ patrocinador: $event })" maxlength="120" placeholder="Eleiko" />
        </gr-field>

        <div class="flex flex-col gap-3">
          <p class="text-label-s">Creatividades</p>
          <div class="grid grid-cols-[minmax(0,1fr)_76px] items-start gap-3">
            <figure class="flex min-w-0 flex-col gap-2">
              <so-thumb class="aspect-[1200/630] w-full rounded-md" [src]="form().imagenUrl" [nombre]="form().patrocinador" alt="Vista previa del banner de escritorio" />
              <figcaption class="text-body-xs text-text-tertiary"><span class="block text-label-s text-text-secondary">Escritorio</span>1200 × 630 · PNG o WebP</figcaption>
            </figure>
            <figure class="flex flex-col gap-2">
              <so-thumb class="aspect-[9/16] w-full rounded-md" [src]="form().imagenMovilUrl" [nombre]="form().patrocinador" alt="Vista previa del banner de móvil" />
              <figcaption class="text-body-xs text-text-tertiary"><span class="block text-label-s text-text-secondary">Móvil</span>1080 × 1920</figcaption>
            </figure>
          </div>
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <label class="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-sm border border-line-strong px-3 text-label-s text-text-secondary hover:border-text-muted hover:text-text-primary md:h-10">
                <gr-icon name="camera" [size]="16" />Escritorio
                <input type="file" accept="image/*" class="sr-only" (change)="subir($event, 'imagenUrl')" />
              </label>
              <input grInput aria-label="URL de la imagen de escritorio" placeholder="https://…/banner.png" [ngModel]="form().imagenUrl" (ngModelChange)="set({ imagenUrl: $event })" />
            </div>
            <div class="flex items-center gap-2">
              <label class="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-sm border border-line-strong px-3 text-label-s text-text-secondary hover:border-text-muted hover:text-text-primary md:h-10">
                <gr-icon name="smartphone" [size]="16" />Móvil
                <input type="file" accept="image/*" class="sr-only" (change)="subir($event, 'imagenMovilUrl')" />
              </label>
              <input grInput aria-label="URL de la imagen de móvil" placeholder="https://…/banner-movil.png" [ngModel]="form().imagenMovilUrl" (ngModelChange)="set({ imagenMovilUrl: $event })" />
            </div>
            <p class="text-body-xs text-text-tertiary">PNG o WebP · se sube a /medios o pega una URL https</p>
          </div>
        </div>

        <gr-field label="URL de destino" hint="Solo enlaces http o https completos (§7)" [error]="errorDestino()">
          <span class="relative block">
            <gr-icon name="link" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
            <input grInput class="pl-9" [invalid]="!!errorDestino()" [ngModel]="form().urlDestino" (ngModelChange)="set({ urlDestino: $event })" placeholder="https://eleiko.com/grcup2026" />
          </span>
        </gr-field>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-label-s">Tier y peso en la cola</legend>
          <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tier del banner">
            @for (t of tiers; track t) {
              <button type="button" role="radio" [attr.aria-checked]="form().tier === t" (click)="set({ tier: t })"
                class="flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors"
                [class]="form().tier === t ? 'border-accent bg-accent-deep/30' : 'border-line-strong bg-bg-field hover:border-text-muted'">
                <span class="flex items-center gap-2 text-label-s"><span class="size-2.5 rounded-pill" [style.background]="TIERS[t].color"></span>{{ TIERS[t].l }}</span>
                <span class="text-body-xs text-text-tertiary">peso {{ TIERS[t].peso }}</span>
              </button>
            }
          </div>
          <p class="text-body-xs text-text-tertiary">Todos salen al menos una vez por jornada; el peso reparte el resto de apariciones.</p>
        </fieldset>

        <fieldset class="flex flex-col gap-2">
          <legend class="mb-2 text-label-s">Vigencia</legend>
          <div class="flex items-center gap-2">
            <so-fecha class="min-w-0 flex-1" formato="num" label="Vigente desde" [bloque]="true" [value]="form().desde" (changed)="set({ desde: $event })" />
            <gr-icon name="arrow-right" [size]="16" class="shrink-0 text-text-tertiary" />
            <so-fecha class="min-w-0 flex-1" formato="num" label="Vigente hasta" [bloque]="true" [value]="form().hasta" (changed)="set({ hasta: $event })" />
          </div>
          <p class="text-body-xs text-text-tertiary">Vacío = siempre vigente</p>
        </fieldset>

        <div class="flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-raised p-4">
          <div class="min-w-0">
            <p class="text-label-s">Activo</p>
            <p class="text-body-xs text-text-tertiary">Entra en la cola del día en que se activa</p>
          </div>
          <bo-toggle [value]="form().activo" label="Banner activo" (changed)="set({ activo: $event })" />
        </div>
      </div>
      <ng-container drawerActions>
        <button grButton variant="ghost" (click)="cerrar()">Cancelar</button>
        <button grButton variant="primary" [loading]="guardando()" [disabled]="!valido() || !puede()" (click)="guardar()">{{ editando() ? 'Guardar banner' : 'Crear banner' }}</button>
      </ng-container>
    </bo-drawer>
  `,
})
export class PatrocinioPage {
  private readonly api = inject(PatrocinioApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly media = inject(Media);

  protected readonly banners = signal<Banner[]>([]);
  protected readonly informe = signal<Informe | null>(null);
  protected readonly config = signal<{ intervaloSeg: number } | null>(null);
  protected readonly q = signal('');
  protected readonly tier = signal('');
  protected readonly soloPausados = signal(false);
  protected readonly abierto = signal(false);
  protected readonly editando = signal<Banner | null>(null);
  protected readonly form = signal<FormBanner>({ ...VACIO });
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly guardandoId = signal('');
  protected readonly error = signal('');

  protected readonly tiers = TIER_LIST;
  protected readonly TIERS = TIERS;
  protected readonly num = num;
  protected readonly pct = pct;

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'web.editar'));
  protected readonly activos = computed(() => this.banners().filter((b) => b.activo).length);
  protected readonly totApariciones = computed(() => (this.informe()?.banners ?? []).reduce((a, f) => a + f.apariciones, 0));
  protected readonly totClics = computed(() => (this.informe()?.banners ?? []).reduce((a, f) => a + f.clics, 0));
  protected readonly tiersOpc = computed<SoOpcion[]>(() => [
    { v: '', l: 'Todos', n: this.banners().length },
    ...TIER_LIST.map((t) => ({ v: t, l: TIERS[t].l, n: this.banners().filter((b) => b.tier === t).length })),
  ]);
  protected readonly visibles = computed(() => {
    const q = this.q().trim().toLowerCase();
    const t = this.tier();
    return this.banners().filter((b) => {
      if (t && b.tier !== t) return false;
      if (this.soloPausados() && b.activo) return false;
      if (!q) return true;
      return b.patrocinador.toLowerCase().includes(q) || b.urlDestino.toLowerCase().includes(q);
    });
  });
  protected readonly errorPatrocinador = computed(() => (this.editando() && !this.form().patrocinador.trim() ? 'Indica el patrocinador.' : ''));
  protected readonly errorDestino = computed(() => (this.editando() && this.form().urlDestino.trim() && !urlSegura(this.form().urlDestino) ? 'El destino debe ser un enlace http o https completo.' : ''));
  protected readonly valido = computed(() => this.form().patrocinador.trim().length > 0 && urlSegura(this.form().urlDestino) && !this.errorDestino());

  constructor() {
    effect(() => {
      const cid = this.cid();
      if (!cid) return;
      untracked(() => void this.cargar());
    });
    // Al cerrar el drawer (X, fondo o Cancelar) se forgets el banner en edición.
    effect(() => {
      if (!this.abierto()) this.editando.set(null);
    });
    inject(DestroyRef).onDestroy(() => undefined);
  }

  protected async cargar(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    this.cargando.set(true);
    this.error.set('');
    try {
      const hoy = new Date().toISOString().slice(0, 10);
      const [banners, config, informe] = await Promise.all([this.api.banners(cid), this.api.config(cid), this.api.informe(cid, hoy)]);
      this.banners.set(banners.items);
      this.config.set(config);
      this.informe.set(informe);
    } catch (e) {
      this.error.set(errText(e, 'No se pudieron cargar los banners.'));
    } finally {
      this.cargando.set(false);
    }
  }

  /** «1 nov → 31 dic», «desde 1 nov», «hasta 31 dic» o «Siempre». */
  protected vigencia(b: Banner): string {
    if (b.desde && b.hasta) return `${diaMes(b.desde)} → ${diaMes(b.hasta)}`;
    if (b.desde) return `desde ${diaMes(b.desde)}`;
    if (b.hasta) return `hasta ${diaMes(b.hasta)}`;
    return 'Siempre';
  }

  protected limpiar(): void {
    this.q.set('');
    this.tier.set('');
    this.soloPausados.set(false);
  }

  protected apariciones(id: string): number {
    return this.informe()?.banners.find((x) => x.id === id)?.apariciones ?? 0;
  }
  protected clics(id: string): number {
    return this.informe()?.banners.find((x) => x.id === id)?.clics ?? 0;
  }

  protected set(p: Partial<FormBanner>): void {
    this.form.update((f) => ({ ...f, ...p }));
  }

  protected nuevo(): void {
    this.editando.set(null);
    this.form.set({ ...VACIO, orden: this.banners().length + 1 });
    this.abierto.set(true);
  }

  protected editar(b: Banner): void {
    this.editando.set(b);
    this.form.set({
      patrocinador: b.patrocinador,
      imagenUrl: b.imagenUrl,
      imagenMovilUrl: b.imagenMovilUrl ?? '',
      urlDestino: b.urlDestino,
      tier: b.tier,
      activo: b.activo,
      desde: diaMadrid(b.desde),
      hasta: diaMadrid(b.hasta),
      orden: b.orden,
    });
    this.abierto.set(true);
  }

  protected cerrar(): void {
    this.abierto.set(false);
    this.editando.set(null);
  }

  protected async subir(ev: Event, campo: 'imagenUrl' | 'imagenMovilUrl'): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const url = await this.media.upload(file, this.form().patrocinador);
      this.set({ [campo]: url } as Partial<FormBanner>);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo subir la imagen.'));
    }
  }

  protected async guardar(): Promise<void> {
    const cid = this.cid();
    if (!cid || !this.valido()) return;
    this.guardando.set(true);
    try {
      const f = this.form();
      const cuerpo: BannerBorrador = {
        patrocinador: f.patrocinador.trim(),
        imagenUrl: f.imagenUrl.trim(),
        imagenMovilUrl: f.imagenMovilUrl.trim(),
        urlDestino: f.urlDestino.trim(),
        tier: f.tier,
        activo: f.activo,
        desde: aIso(f.desde),
        hasta: aIso(f.hasta),
        orden: f.orden,
      };
      const edit = this.editando();
      const guardado = edit ? await this.api.guardarBanner(cid, edit.id, cuerpo, edit.version) : await this.api.crearBanner(cid, cuerpo);
      this.banners.update((l) => (edit ? l.map((b) => (b.id === guardado.id ? guardado : b)) : [...l, guardado]));
      this.cerrar();
      this.toasts.success(edit ? 'Banner guardado' : 'Banner creado');
      await this.cargar();
    } catch (e) {
      const p = problemOf(e);
      this.toasts.error(p.code === 'CONFLICTO_EDICION' ? 'Otra persona ha cambiado el banner' : errText(e, 'No se pudo guardar el banner.'));
      if (p.code === 'CONFLICTO_EDICION') await this.cargar();
    } finally {
      this.guardando.set(false);
    }
  }

  protected async alternar(b: Banner, activo: boolean): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    this.guardandoId.set(b.id);
    try {
      const guardado = await this.api.guardarBanner(
        cid,
        b.id,
        {
          patrocinador: b.patrocinador,
          imagenUrl: b.imagenUrl,
          imagenMovilUrl: b.imagenMovilUrl ?? '',
          urlDestino: b.urlDestino,
          tier: b.tier,
          activo,
          desde: b.desde ?? null,
          hasta: b.hasta ?? null,
          orden: b.orden,
        },
        b.version,
      );
      this.banners.update((l) => l.map((x) => (x.id === guardado.id ? guardado : x)));
      this.toasts.success(activo ? 'Banner activado' : 'Banner pausado');
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo cambiar el estado del banner.'));
    } finally {
      this.guardandoId.set('');
    }
  }

  protected async eliminar(b: Banner): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    const ok = await this.confirm.ask({
      title: '¿Eliminar el banner?',
      text: `«${b.patrocinador}» dejará de aparecer en el chat. No se puede deshacer.`,
      confirm: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.borrarBanner(cid, b.id);
      this.banners.update((l) => l.filter((x) => x.id !== b.id));
      this.toasts.success('Banner eliminado');
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo eliminar el banner.'));
    }
  }
}

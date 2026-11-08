import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSelect, GrSkeleton, GrToasts } from '@grcup/ui';
import { problemOf } from '../../../core/api';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { BoDrawer, BoPageHeader, BoToggle, Confirm, Media, errText } from '../../../shared/ui';
import { TIER_LIST, TIERS, SoTier, num, urlSegura } from '../ui';
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

/**
 * «Patrocinio · Banners» (Figma 73 · «BO · Patrocinio · Banners» y «… · Editar»).
 * Lista de banners con su tier, su estado y las apariciones y clics del día (endpoint /patrocinio/informe).
 */
@Component({
  selector: 'bo-patrocinio',
  imports: [FormsModule, RouterLink, BoDrawer, BoPageHeader, BoToggle, GrAlert, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSelect, GrSkeleton, SoTier],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="Patrocinio · Banners" [badge]="activos() + ' activos'" [badgeTone]="activos() ? 'accent' : 'neutral'"
        [subtitle]="'Aparecen en el chat cada ' + (config()?.intervaloSeg ?? 90) + ' s · todos salen al menos una vez por jornada (§7)'"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Directo social', 'Patrocinio']">
        <ng-container actions>
          <a grButton icon="activity" [routerLink]="['/', comps.current()?.slug, 'patrocinio', 'informe']">Informe del día</a>
          <button grButton variant="primary" icon="plus" (click)="nuevo()">Nuevo banner</button>
        </ng-container>
      </bo-page-header>

      @if (!puede()) {
        <gr-alert tone="warning" title="Tu rol no puede gestionar el patrocinio">Hace falta el permiso «web.editar» para tocar los banners.</gr-alert>
      }

      <div class="flex flex-wrap items-center gap-2">
        <label class="relative min-w-0 flex-1 basis-64 md:max-w-xs">
          <span class="sr-only">Buscar</span>
          <gr-icon name="search" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
          <input grInput class="pl-9" placeholder="Buscar por patrocinador o URL…" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        </label>
        <gr-select tipo="filtro" etiqueta="Tier" [ngModel]="tier()" (ngModelChange)="tier.set($event)">
          <option value="">Todos</option>
          @for (t of tiers; track t) { <option [value]="t">{{ TIERS[t].l }}</option> }
        </gr-select>
        <button type="button" class="inline-flex h-11 items-center gap-1.5 rounded-sm border px-3 text-label-s md:h-10"
          [class]="soloPausados() ? 'border-accent bg-accent/10 text-accent-text' : 'border-line-strong text-text-secondary hover:border-text-muted hover:text-text-primary'"
          (click)="soloPausados.update(v => !v)">
          <gr-icon name="plus" [size]="16" />Pausados
        </button>
      </div>

      @if (cargando()) {
        <gr-skeleton class="h-96 rounded-lg" />
      } @else if (error()) {
        <gr-empty icon="wifi-off" title="No hemos podido cargar los banners" [text]="error()">
          <button grButton (click)="cargar()">Reintentar</button>
        </gr-empty>
      } @else if (!visibles().length) {
        <gr-empty icon="layout" title="Todavía no hay banners" text="Crea el primer banner para que aparezca en el chat de la sala.">
          <button grButton variant="primary" icon="plus" (click)="nuevo()">Nuevo banner</button>
        </gr-empty>
      } @else {
        <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
          <table class="w-full min-w-[860px] text-left text-body-s">
            <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary">
              <tr><th class="px-4 py-3">Patrocinador</th><th class="px-3 py-3">Tier</th><th class="px-3 py-3">Activo</th><th class="px-3 py-3 text-right">Hoy</th><th class="px-3 py-3 text-right">Clics</th><th class="px-4 py-3 text-right">Acciones</th></tr>
            </thead>
            <tbody>
              @for (b of visibles(); track b.id) {
                <tr class="border-b border-line-subtle last:border-0">
                  <td class="px-4 py-2.5">
                    <div class="flex items-center gap-3">
                      @if (b.imagenUrl) {
                        <img [src]="b.imagenUrl" alt="" class="size-10 shrink-0 rounded-sm border border-line-subtle bg-bg-raised object-contain" />
                      } @else {
                        <span class="flex size-10 shrink-0 items-center justify-center rounded-sm border border-line-subtle bg-bg-raised text-text-tertiary"><gr-icon name="monitor" [size]="18" /></span>
                      }
                      <div class="min-w-0">
                        <p class="truncate text-label-s">{{ b.patrocinador }}</p>
                        <p class="truncate text-body-xs text-text-tertiary">{{ b.urlDestino }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="px-3 py-2.5"><so-tier [tier]="b.tier" /></td>
                  <td class="px-3 py-2.5">
                    <bo-toggle [value]="b.activo" [label]="'Activar el banner de ' + b.patrocinador" [disabled]="!puede() || guardandoId() === b.id" (changed)="alternar(b, $event)" />
                  </td>
                  <td class="px-3 py-2.5 text-right font-mono">{{ apariciones(b.id) }}</td>
                  <td class="px-3 py-2.5 text-right font-mono">{{ clics(b.id) }}</td>
                  <td class="px-4 py-2.5">
                    <div class="flex items-center justify-end gap-1">
                      <button grIconButton icon="pencil" [label]="'Editar ' + b.patrocinador" (click)="editar(b)"></button>
                      <button grIconButton icon="trash" [label]="'Eliminar ' + b.patrocinador" [disabled]="!puede()" (click)="eliminar(b)"></button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </section>
      }
    </div>

    <!-- ===== Drawer de edición ===== -->
    <bo-drawer [(open)]="abierto" [title]="editando() ? 'Editar banner' : 'Nuevo banner'" [badge]="form().activo ? 'Activo' : 'Pausado'">
      @if (editando()) {
        <p class="-mt-2 mb-5 text-body-xs text-text-tertiary">{{ form().patrocinador }} · {{ comps.current()?.nombreCorto }}</p>
      }
      <div class="flex flex-col gap-4">
        <gr-field label="Patrocinador" [error]="errorPatrocinador()">
          <input grInput [ngModel]="form().patrocinador" (ngModelChange)="set({ patrocinador: $event })" maxlength="120" placeholder="Eleiko" />
        </gr-field>

        <gr-field label="Imagen de escritorio" hint="PNG o WebP · 1200 × 630 · https o ruta del propio sitio">
          <div class="flex flex-col gap-2">
            @if (form().imagenUrl) {
              <img [src]="form().imagenUrl" alt="Vista previa del banner de escritorio" class="h-24 w-full rounded-sm border border-line-strong bg-bg-raised object-contain" />
            }
            <div class="flex flex-wrap items-center gap-2">
              <label class="inline-flex h-11 cursor-pointer items-center gap-2 rounded-sm border border-line-strong px-4 text-label-s text-text-secondary hover:border-text-muted hover:text-text-primary md:h-10">
                <gr-icon name="camera" [size]="16" />Subir imagen
                <input type="file" accept="image/*" class="sr-only" (change)="subir($event, 'imagenUrl')" />
              </label>
              <input grInput class="flex-1" placeholder="https://…/banner.png" [ngModel]="form().imagenUrl" (ngModelChange)="set({ imagenUrl: $event })" />
            </div>
          </div>
        </gr-field>

        <gr-field label="Imagen de móvil" hint="PNG o WebP · 1080 × 1920">
          <div class="flex flex-col gap-2">
            @if (form().imagenMovilUrl) {
              <img [src]="form().imagenMovilUrl" alt="Vista previa del banner de móvil" class="h-24 w-full rounded-sm border border-line-strong bg-bg-raised object-contain" />
            }
            <div class="flex flex-wrap items-center gap-2">
              <label class="inline-flex h-11 cursor-pointer items-center gap-2 rounded-sm border border-line-strong px-4 text-label-s text-text-secondary hover:border-text-muted hover:text-text-primary md:h-10">
                <gr-icon name="camera" [size]="16" />Subir imagen
                <input type="file" accept="image/*" class="sr-only" (change)="subir($event, 'imagenMovilUrl')" />
              </label>
              <input grInput class="flex-1" placeholder="https://…/banner-movil.png" [ngModel]="form().imagenMovilUrl" (ngModelChange)="set({ imagenMovilUrl: $event })" />
            </div>
          </div>
        </gr-field>

        <gr-field label="URL de destino" hint="Solo http/https (§7)" [error]="errorDestino()">
          <input grInput [ngModel]="form().urlDestino" (ngModelChange)="set({ urlDestino: $event })" placeholder="https://eleiko.com/grcup2026" />
        </gr-field>

        <gr-field label="Tier">
          <gr-select [ngModel]="form().tier" (ngModelChange)="set({ tier: $event })" aria-label="Tier del banner">
            @for (t of tiers; track t) { <option [value]="t">{{ TIERS[t].l }} · peso {{ TIERS[t].peso }}</option> }
          </gr-select>
        </gr-field>

        <gr-field label="Vigencia" hint="Vacío = siempre vigente">
          <div class="flex items-center gap-2">
            <input grInput type="date" [ngModel]="form().desde" (ngModelChange)="set({ desde: $event })" aria-label="Vigente desde" />
            <span class="text-text-tertiary">→</span>
            <input grInput type="date" [ngModel]="form().hasta" (ngModelChange)="set({ hasta: $event })" aria-label="Vigente hasta" />
          </div>
        </gr-field>

        <div class="flex items-start justify-between gap-3 rounded-md border border-line-subtle bg-bg-raised p-4">
          <div class="min-w-0">
            <p class="text-label-s">Activo</p>
            <p class="text-body-xs text-text-tertiary">Entra en la cola del día en que se activa</p>
          </div>
          <bo-toggle [value]="form().activo" label="Banner activo" (changed)="set({ activo: $event })" />
        </div>
      </div>
      <ng-container drawerActions>
        <button grButton variant="ghost" (click)="cerrar()">Cancelar</button>
        <button grButton variant="primary" [loading]="guardando()" [disabled]="!valido()" (click)="guardar()">Guardar</button>
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

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'web.editar'));
  protected readonly activos = computed(() => this.banners().filter((b) => b.activo).length);
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
      desde: b.desde ? b.desde.slice(0, 10) : '',
      hasta: b.hasta ? b.hasta.slice(0, 10) : '',
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

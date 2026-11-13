import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSelect, GrToasts, type GrTone } from '@grcup/ui';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { webPublica } from '../../../core/web';
import { BoPageHeader, BoToggle, Confirm, Media, errText } from '../../../shared/ui';
import { MEDALLAS, SoThumb, ordinal } from '../ui';
import { PremiosApi, type Jornada, type Premio, type PremioBorrador, type RankingPremio } from './api';

const RANKINGS: { v: RankingPremio; l: string; tone: GrTone; ayuda: string }[] = [
  { v: 'porra', l: 'Porra', tone: 'danger', ayuda: 'Saldo de la jornada' },
  { v: 'fantasy', l: 'Fantasy', tone: 'info', ayuda: 'Puntos del día' },
  { v: 'donantes', l: 'Donantes', tone: 'warning', ayuda: 'Total donado en la jornada' },
];

interface FormPremio {
  ranking: RankingPremio;
  puestoDesde: number;
  puestoHasta: number;
  titulo: string;
  descripcion: string;
  imagenUrl: string;
  valorTexto: string;
  patrocinador: string;
  jornada: string;
  activo: boolean;
}

const VACIO: FormPremio = { ranking: 'porra', puestoDesde: 1, puestoHasta: 1, titulo: '', descripcion: '', imagenUrl: '', valorTexto: '', patrocinador: '', jornada: '', activo: true };

/**
 * «Premios» (Figma 73 · «BO · Premios» y «BO / Prize card»).
 * Tarjetas agrupadas por ranking; alta y edición en un modal y borrado con confirmación.
 */
/**
 * «Premios» (Figma 73 · «BO · Premios» y «BO / Prize card», UI v2).
 * Tarjetas agrupadas por ranking con el puesto en color de medalla; alta y edición en un modal y borrado con
 * confirmación.
 */
@Component({
  selector: 'bo-premios',
  imports: [RouterLink, A11yModule, FormsModule, BoPageHeader, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSelect, SoThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'modal.set(false)' },
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-8 pb-24">
      <bo-page-header [title]="'Premios' + (jornada() ? ' · ' + jornada() : '')"
        subtitle="Imagen y datos que se anuncian en las clasificaciones en vivo (§6.5)"
        [crumbs]="[comps.current()?.nombreCorto || '', 'Directo social', 'Premios']">
        <ng-container actions>
          <gr-select tipo="filtro" etiqueta="Jornada" [ngModel]="filtroJornada()" (ngModelChange)="cambiarJornada($event)">
            <option value="">Todas las jornadas</option>
            @for (j of jornadasLista(); track j.id) { <option [value]="j.id">{{ j.nombre }}</option> }
          </gr-select>
          <a grButton icon="external-link" [href]="web + '/fantasy'" target="_blank" rel="noopener">Ver en público</a>
          <button grButton variant="primary" icon="plus" [disabled]="!puede()" (click)="nuevo()">Nuevo premio</button>
        </ng-container>
      </bo-page-header>

      @if (!puede()) {
        <gr-alert tone="warning" title="Tu rol no puede gestionar los premios">Hace falta el permiso «directo.operar». Puedes ver los premios, pero los botones de crear, editar y eliminar quedan desactivados.
          <a alertAction [routerLink]="['/', comps.current()?.slug, 'equipo']" class="mt-2 inline-flex items-center gap-1 text-label-s hover:underline">Pedir acceso a un admin <gr-icon name="arrow-right" [size]="14" /></a>
        </gr-alert>
      }

      @if (cargando()) {
        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
          @for (i of [0, 1, 2]; track i) {
            <div class="animate-pulse overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
              <div class="h-40 bg-bg-raised"></div>
              <div class="flex flex-col gap-2 p-4"><span class="h-3 w-24 rounded-2xs bg-bg-raised"></span><span class="h-4 w-40 rounded-2xs bg-bg-raised"></span><span class="h-3 w-32 rounded-2xs bg-bg-raised"></span></div>
            </div>
          }
        </div>
      } @else if (error()) {
        <div class="rounded-lg border border-line-subtle bg-bg-card">
          <gr-empty icon="wifi-off" title="No hemos podido cargar los premios" [text]="error()">
            <button grButton variant="primary" icon="refresh" (click)="cargar()">Reintentar</button>
          </gr-empty>
        </div>
      } @else if (!premios().length) {
        <div class="rounded-lg border border-line-subtle bg-bg-card">
          <gr-empty icon="trophy" title="Todavía no hay premios" text="Crea el primer premio para que aparezca en las clasificaciones en vivo de porra, fantasy o donantes.">
            <button grButton variant="primary" icon="plus" [disabled]="!puede()" (click)="nuevo()">Nuevo premio</button>
          </gr-empty>
        </div>
      } @else {
        @for (r of rankings; track r.v) {
          <section class="flex flex-col gap-4" [attr.aria-labelledby]="'rk-' + r.v">
            <header class="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 [id]="'rk-' + r.v" class="text-ui-h4">{{ r.l }}</h2>
              <gr-badge>{{ grupo(r.v).length }} {{ grupo(r.v).length === 1 ? 'premio' : 'premios' }}</gr-badge>
              <p class="text-body-xs text-text-tertiary">{{ r.ayuda }} · se anuncian en la clasificación en vivo</p>
              <button grButton size="s" icon="plus" class="ml-auto" [disabled]="!puede()" (click)="nuevo(r.v)">Añadir a {{ r.l.toLowerCase() }}</button>
            </header>
            @if (grupo(r.v).length) {
              <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                @for (p of grupo(r.v); track p.id) {
                  <article class="flex flex-col overflow-hidden rounded-lg border border-line-subtle bg-bg-card transition-colors hover:border-line-strong" [class.opacity-60]="p.activo === false">
                    <div class="relative h-44 bg-[linear-gradient(135deg,var(--color-accent-deep),var(--color-bg-surface)_75%)]">
                      @if (p.imagenUrl) {
                        <so-thumb class="size-full rounded-none border-0 bg-transparent" [src]="p.imagenUrl" [nombre]="p.titulo" [alt]="p.titulo" />
                      } @else {
                        <span class="absolute inset-0 flex items-center justify-center text-text-primary/35"><gr-icon name="trophy" [size]="40" /></span>
                      }
                      <span class="absolute top-3 left-3 inline-flex h-6 items-center gap-1.5 rounded-2xs border bg-bg-deep/75 px-2 font-mono text-mono-xs backdrop-blur" [class]="medalla(p)">
                        <span class="size-2 rounded-pill bg-current" aria-hidden="true"></span>{{ rango(p) }}
                      </span>
                      <span class="absolute top-2 right-2 flex gap-0.5 rounded-[10px] border border-line-strong bg-bg-deep/75 p-0.5 backdrop-blur">
                        <button grIconButton icon="pencil" [label]="'Editar ' + p.titulo" (click)="editar(p)"></button>
                        <button grIconButton icon="trash" [label]="'Eliminar ' + p.titulo" [disabled]="!puede()" (click)="eliminar(p)"></button>
                      </span>
                    </div>
                    <div class="flex flex-1 flex-col gap-2 p-4">
                      <div class="flex flex-wrap items-center gap-2">
                        <gr-badge [tone]="tono(p.ranking)">{{ etiqueta(p.ranking) }}</gr-badge>
                        <span class="text-body-xs text-text-tertiary">{{ nombreJornada(p.jornadaId) }}</span>
                        @if (p.activo === false) { <gr-badge class="ml-auto">Inactivo</gr-badge> }
                      </div>
                      <h3 class="text-label-m">{{ p.titulo }}</h3>
                      @if (p.valorTexto) { <p class="text-body-s text-text-secondary">{{ p.valorTexto }}</p> }
                      @if (p.descripcion) { <p class="line-clamp-2 text-body-xs text-text-tertiary">{{ p.descripcion }}</p> }
                      @if (p.patrocinador) {
                        <p class="mt-auto flex items-center gap-1.5 border-t border-line-subtle pt-2 text-body-xs text-text-tertiary">Patrocina <span class="text-label-s text-text-secondary">{{ p.patrocinador }}</span></p>
                      }
                    </div>
                  </article>
                }
              </div>
            } @else {
              <button type="button" class="flex items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-4 py-8 text-label-s text-text-tertiary transition-colors hover:border-text-muted hover:text-text-primary disabled:opacity-50"
                [disabled]="!puede()" (click)="nuevo(r.v)">
                <gr-icon name="plus" [size]="16" />Sin premios en {{ r.l.toLowerCase() }} · añadir el primero
              </button>
            }
          </section>
        }
      }
    </div>

    <!-- ===== Modal de alta / edición ===== -->
    @if (modal()) {
      <div class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:px-4 sm:py-6" (click)="modal.set(false)">
        <form class="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-xl border border-line-strong bg-bg-card shadow-card sm:rounded-lg" role="dialog" aria-modal="true" aria-labelledby="pr-titulo"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()" (ngSubmit)="guardar()">
          <header class="flex items-center gap-3 border-b border-line-subtle px-5 py-4">
            <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent-deep/50 text-accent-text"><gr-icon name="trophy" [size]="20" /></span>
            <div class="min-w-0 flex-1">
              <h2 id="pr-titulo" class="text-ui-h5">{{ editando() ? 'Editar premio' : 'Nuevo premio' }}</h2>
              <p class="truncate text-body-xs text-text-tertiary">{{ etiqueta(form().ranking) }} · {{ rangoForm() }} · {{ form().jornada ? nombreJornada(form().jornada) : 'todas las jornadas' }}</p>
            </div>
            <button type="button" grIconButton icon="x" label="Cerrar" (click)="modal.set(false)"></button>
          </header>

          <div class="flex flex-col gap-5 overflow-y-auto px-5 py-5">
            <div class="flex flex-col gap-3 rounded-md border border-line-subtle bg-bg-raised p-3 sm:flex-row sm:items-center">
              <span class="relative flex h-[68px] w-32 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-[linear-gradient(135deg,var(--color-accent-deep),var(--color-bg-surface)_75%)]">
                @if (form().imagenUrl) { <so-thumb class="size-full rounded-none border-0" [src]="form().imagenUrl" [nombre]="form().titulo" alt="Vista previa del premio" /> }
                @else { <gr-icon name="trophy" [size]="24" class="text-text-primary/35" /> }
              </span>
              <div class="flex min-w-0 flex-1 flex-col gap-2">
                <input grInput name="imagenUrl" aria-label="URL de la imagen del premio" placeholder="https://…/premio.png" [ngModel]="form().imagenUrl" (ngModelChange)="set({ imagenUrl: $event })" />
                <p class="text-body-xs text-text-tertiary">PNG o WebP · 1200 × 630</p>
              </div>
              <label class="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm border border-line-strong px-3 text-label-s text-text-secondary hover:border-text-muted hover:text-text-primary md:h-10">
                <gr-icon name="camera" [size]="16" />Subir
                <input type="file" accept="image/*" class="sr-only" (change)="subir($event)" />
              </label>
            </div>

            <gr-field label="Título" hint="Se muestra en las clasificaciones en vivo" [error]="tituloTocado() && !form().titulo.trim() ? 'Indica el título del premio.' : ''">
              <input grInput name="titulo" [ngModel]="form().titulo" (ngModelChange)="set({ titulo: $event }); tituloTocado.set(true)" maxlength="120" placeholder="Podio absoluto" />
            </gr-field>

            <div class="grid gap-4 sm:grid-cols-2">
              <gr-field label="Ranking" [hint]="editando() ? 'No se cambia al editar' : ''">
                <gr-select name="ranking" [ngModel]="form().ranking" (ngModelChange)="set({ ranking: $event })" aria-label="Ranking del premio" [disabled]="!!editando()">
                  @for (r of rankings; track r.v) { <option [value]="r.v">{{ r.l }}</option> }
                </gr-select>
              </gr-field>
              <gr-field label="Jornada" hint="Vacío = todas las jornadas">
                <gr-select name="jornada" [ngModel]="form().jornada" (ngModelChange)="set({ jornada: $event })" aria-label="Jornada del premio">
                  <option value="">Todas las jornadas</option>
                  @for (j of jornadasLista(); track j.id) { <option [value]="j.id">{{ j.nombre }} · {{ j.dia }}</option> }
                </gr-select>
              </gr-field>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <gr-field label="Desde el puesto">
                <gr-select name="puestoDesde" [ngModel]="form().puestoDesde" (ngModelChange)="set({ puestoDesde: +$event })" aria-label="Puesto desde">
                  @for (n of puestos; track n) { <option [value]="n">{{ ordinal(n) }} puesto</option> }
                </gr-select>
              </gr-field>
              <gr-field label="Hasta el puesto" [error]="form().puestoHasta < form().puestoDesde ? 'Debe ser igual o posterior al primero.' : ''">
                <gr-select name="puestoHasta" [ngModel]="form().puestoHasta" (ngModelChange)="set({ puestoHasta: +$event })" aria-label="Puesto hasta">
                  @for (n of puestos; track n) { <option [value]="n">{{ ordinal(n) }} puesto</option> }
                </gr-select>
              </gr-field>
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <gr-field label="Valor" hint="Texto corto · se anuncia en vivo">
                <input grInput name="valorTexto" [ngModel]="form().valorTexto" (ngModelChange)="set({ valorTexto: $event })" maxlength="60" placeholder="500 € en material Eleiko" />
              </gr-field>
              <gr-field label="Patrocinador" hint="Aparece bajo el valor del premio">
                <input grInput name="patrocinador" [ngModel]="form().patrocinador" (ngModelChange)="set({ patrocinador: $event })" maxlength="80" placeholder="Eleiko" />
              </gr-field>
            </div>

            <gr-field label="Descripción" [optional]="true" [hint]="form().descripcion.length + ' / 140'">
              <textarea grInput name="descripcion" rows="2" [ngModel]="form().descripcion" (ngModelChange)="set({ descripcion: $event })" maxlength="400"></textarea>
            </gr-field>

            <div class="flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-raised p-4">
              <div class="min-w-0">
                <p class="text-label-s">Activo</p>
                <p class="text-body-xs text-text-tertiary">{{ editando() ? 'Se anuncia en las clasificaciones en vivo' : 'Se crea activo; después se puede desactivar' }}</p>
              </div>
              <bo-toggle [value]="form().activo" label="Premio activo" [disabled]="!editando()" (changed)="set({ activo: $event })" />
            </div>
          </div>

          <footer class="flex justify-end gap-2 border-t border-line-subtle px-5 py-4">
            <button type="button" grButton variant="ghost" (click)="modal.set(false)">Cancelar</button>
            <button type="submit" grButton variant="primary" [loading]="ocupado()" [disabled]="!valido() || !puede()">{{ editando() ? 'Guardar premio' : 'Crear premio' }}</button>
          </footer>
        </form>
      </div>
    }
  `,
})
export class PremiosPage {
  private readonly api = inject(PremiosApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly media = inject(Media);

  protected readonly premios = signal<Premio[]>([]);
  protected readonly jornadasLista = signal<Jornada[]>([]);
  protected readonly filtroJornada = signal('');
  protected readonly modal = signal(false);
  protected readonly editando = signal<Premio | null>(null);
  protected readonly form = signal<FormPremio>({ ...VACIO });
  protected readonly cargando = signal(true);
  protected readonly ocupado = signal(false);
  protected readonly tituloTocado = signal(false);
  protected readonly error = signal('');

  protected readonly rankings = RANKINGS;
  protected readonly puestos = Array.from({ length: 20 }, (_, i) => i + 1);
  protected readonly ordinal = ordinal;
  protected readonly web = webPublica();

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'directo.operar'));
  protected readonly jornada = computed(() => this.jornadasLista().find((x) => x.id === this.filtroJornada())?.nombre ?? '');
  protected readonly valido = computed(() => this.form().titulo.trim().length > 0 && this.form().puestoHasta >= this.form().puestoDesde);

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
      const [p, j] = await Promise.all([this.api.premios(cid, this.filtroJornada()), this.api.jornadas(cid)]);
      this.premios.set(p.premios);
      this.jornadasLista.set(j.jornadas);
    } catch (e) {
      this.error.set(errText(e, 'No se pudieron cargar los premios.'));
    } finally {
      this.cargando.set(false);
    }
  }

  protected grupo(r: RankingPremio): Premio[] {
    return this.premios().filter((p) => p.ranking === r);
  }
  protected etiqueta(r: RankingPremio): string {
    return RANKINGS.find((x) => x.v === r)?.l ?? r;
  }
  protected tono(r: RankingPremio): GrTone {
    return RANKINGS.find((x) => x.v === r)?.tone ?? 'neutral';
  }
  /** Color de medalla del puesto (1.º oro, 2.º plata, 3.º bronce; el resto neutro). */
  protected medalla(p: Premio): string {
    const m = MEDALLAS[p.puestoDesde - 1];
    return m ? m.split(' ').filter((c) => !c.startsWith('bg-')).join(' ') : 'border-line-strong text-text-secondary';
  }
  protected nombreJornada(id?: string | null): string {
    if (!id) return 'Todas las jornadas';
    return this.jornadasLista().find((j) => j.id === id)?.nombre ?? 'Jornada';
  }
  protected rangoForm(): string {
    const f = this.form();
    return f.puestoDesde === f.puestoHasta ? `${ordinal(f.puestoDesde)} puesto` : `${ordinal(f.puestoDesde)}–${ordinal(f.puestoHasta)} puesto`;
  }
  protected rango(p: Premio): string {
    return p.puestoDesde === p.puestoHasta ? `${ordinal(p.puestoDesde)} puesto` : `${ordinal(p.puestoDesde)}–${ordinal(p.puestoHasta)} puesto`;
  }

  protected set(p: Partial<FormPremio>): void {
    this.form.update((f) => ({ ...f, ...p }));
  }

  protected async cambiarJornada(j: string): Promise<void> {
    this.filtroJornada.set(j);
    await this.cargar();
  }

  protected nuevo(ranking?: RankingPremio): void {
    this.editando.set(null);
    this.tituloTocado.set(false);
    this.form.set({ ...VACIO, ranking: ranking ?? VACIO.ranking, jornada: this.filtroJornada() });
    this.modal.set(true);
  }

  protected editar(p: Premio): void {
    this.editando.set(p);
    this.form.set({
      ranking: p.ranking,
      puestoDesde: p.puestoDesde,
      puestoHasta: p.puestoHasta,
      titulo: p.titulo,
      descripcion: p.descripcion ?? '',
      imagenUrl: p.imagenUrl ?? '',
      valorTexto: p.valorTexto ?? '',
      patrocinador: p.patrocinador ?? '',
      jornada: p.jornadaId ?? '',
      activo: p.activo ?? true,
    });
    this.modal.set(true);
  }

  protected async subir(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const url = await this.media.upload(file, this.form().titulo);
      this.set({ imagenUrl: url });
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo subir la imagen.'));
    }
  }

  protected async guardar(): Promise<void> {
    const cid = this.cid();
    if (!cid || !this.valido()) return;
    this.ocupado.set(true);
    try {
      const f = this.form();
      const edit = this.editando();
      if (edit) {
        await this.api.editar(cid, edit.id, {
          titulo: f.titulo.trim(),
          descripcion: f.descripcion.trim(),
          imagenUrl: f.imagenUrl.trim(),
          valorTexto: f.valorTexto.trim(),
          patrocinador: f.patrocinador.trim(),
          activo: f.activo,
          puestoDesde: f.puestoDesde,
          puestoHasta: f.puestoHasta,
          // "" = premio común a todas las jornadas (el backend lo interpreta así).
          jornadaId: f.jornada,
        });
        this.toasts.success('Premio guardado');
      } else {
        const cuerpo: PremioBorrador = {
          ranking: f.ranking,
          puestoDesde: f.puestoDesde,
          puestoHasta: f.puestoHasta,
          titulo: f.titulo.trim(),
          descripcion: f.descripcion.trim(),
          imagenUrl: f.imagenUrl.trim(),
          valorTexto: f.valorTexto.trim(),
          patrocinador: f.patrocinador.trim(),
          orden: this.premios().length + 1,
        };
        if (f.jornada) cuerpo.jornada = f.jornada;
        await this.api.crear(cid, cuerpo);
        this.toasts.success('Premio creado');
      }
      this.modal.set(false);
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo guardar el premio.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async eliminar(p: Premio): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    const ok = await this.confirm.ask({
      title: '¿Eliminar el premio?',
      text: `«${p.titulo}» dejará de anunciarse en las clasificaciones. No se puede deshacer.`,
      confirm: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.ocupado.set(true);
    try {
      await this.api.borrar(cid, p.id);
      this.toasts.success('Premio eliminado');
      await this.cargar();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo eliminar el premio.'));
    } finally {
      this.ocupado.set(false);
    }
  }
}

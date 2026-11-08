import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSelect, GrSkeleton, GrToasts, type GrTone } from '@grcup/ui';
import { Auth } from '../../../core/auth';
import { Competitions } from '../../../core/competitions';
import { webPublica } from '../../../core/web';
import { BoPageHeader, BoToggle, Confirm, Media, errText } from '../../../shared/ui';
import { ordinal } from '../ui';
import { PremiosApi, type Jornada, type Premio, type PremioBorrador, type RankingPremio } from './api';

const RANKINGS: { v: RankingPremio; l: string; tone: GrTone }[] = [
  { v: 'porra', l: 'Porra', tone: 'danger' },
  { v: 'fantasy', l: 'Fantasy', tone: 'info' },
  { v: 'donantes', l: 'Donantes', tone: 'warning' },
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
@Component({
  selector: 'bo-premios',
  imports: [FormsModule, BoPageHeader, BoToggle, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrIconButton, GrInput, GrSelect, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
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
        <gr-alert tone="warning" title="Tu rol no puede gestionar los premios">Hace falta el permiso «directo.operar».</gr-alert>
      }

      @if (cargando()) {
        <gr-skeleton class="h-72 rounded-lg" />
      } @else if (error()) {
        <gr-empty icon="wifi-off" title="No hemos podido cargar los premios" [text]="error()">
          <button grButton (click)="cargar()">Reintentar</button>
        </gr-empty>
      } @else if (!premios().length) {
        <gr-empty icon="trophy" title="Todavía no hay premios" text="Crea el primer premio para que aparezca en las clasificaciones en vivo.">
          <button grButton variant="primary" icon="plus" (click)="nuevo()">Nuevo premio</button>
        </gr-empty>
      } @else {
        @for (r of rankings; track r.v) {
          <section class="flex flex-col gap-3">
            <h2 class="text-label-xs text-text-tertiary">{{ r.l }} · {{ grupo(r.v).length }} {{ grupo(r.v).length === 1 ? 'premio' : 'premios' }}</h2>
            @if (grupo(r.v).length) {
              <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                @for (p of grupo(r.v); track p.id) {
                  <article class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
                    <div class="relative flex h-40 items-center justify-center bg-accent-deep/25">
                      @if (p.imagenUrl) {
                        <img [src]="p.imagenUrl" [alt]="p.titulo" class="h-full w-full object-cover" />
                      } @else {
                        <gr-icon name="trophy" [size]="28" class="text-text-tertiary" />
                      }
                      <div class="absolute top-2 right-2 flex gap-1">
                        <button grIconButton icon="pencil" [label]="'Editar ' + p.titulo" (click)="editar(p)"></button>
                        <button grIconButton icon="trash" [label]="'Eliminar ' + p.titulo" [disabled]="!puede()" (click)="eliminar(p)"></button>
                      </div>
                    </div>
                    <div class="flex flex-col gap-1.5 p-4">
                      <div class="flex flex-wrap items-center gap-2">
                        <gr-badge [tone]="tono(p.ranking)">{{ etiqueta(p.ranking) }}</gr-badge>
                        <span class="text-body-s text-text-secondary">{{ rango(p) }}</span>
                        @if (p.activo === false) { <gr-badge tone="danger">Inactivo</gr-badge> }
                      </div>
                      <p class="text-label-s">{{ p.titulo }}</p>
                      @if (p.valorTexto) { <p class="text-body-s text-text-secondary">{{ p.valorTexto }}</p> }
                      @if (p.patrocinador) { <p class="text-body-xs text-text-tertiary">Patrocina <span class="text-text-secondary">{{ p.patrocinador }}</span></p> }
                      @if (p.descripcion) { <p class="text-body-xs text-text-tertiary">{{ p.descripcion }}</p> }
                    </div>
                  </article>
                }
              </div>
            } @else {
              <p class="text-body-s text-text-tertiary">Sin premios en este ranking.</p>
            }
          </section>
        }
      }
    </div>

    <!-- ===== Modal de alta / edición ===== -->
    @if (modal()) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-black/60 px-4 py-6" (click)="modal.set(false)" (keydown.escape)="modal.set(false)">
        <form class="w-full max-w-lg rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" [attr.aria-label]="editando() ? 'Editar premio' : 'Nuevo premio'"
          (click)="$event.stopPropagation()" (ngSubmit)="guardar()">
          <header class="flex items-start justify-between gap-3">
            <h2 class="text-ui-h5">{{ editando() ? 'Editar premio' : 'Nuevo premio' }}</h2>
            <button type="button" grIconButton icon="x" label="Cerrar" (click)="modal.set(false)"></button>
          </header>

          <div class="mt-4 flex flex-col gap-4">
            <gr-field label="Imagen del premio" hint="PNG o WebP · 1200 × 630">
              <div class="flex flex-col gap-2">
                @if (form().imagenUrl) {
                  <img [src]="form().imagenUrl" alt="Vista previa del premio" class="h-28 w-full rounded-sm border border-line-strong bg-bg-raised object-contain" />
                }
                <div class="flex flex-wrap items-center gap-2">
                  <label class="inline-flex h-11 cursor-pointer items-center gap-2 rounded-sm border border-line-strong px-4 text-label-s text-text-secondary hover:border-text-muted hover:text-text-primary md:h-10">
                    <gr-icon name="camera" [size]="16" />Subir imagen
                    <input type="file" accept="image/*" class="sr-only" (change)="subir($event)" />
                  </label>
                  <input grInput name="imagenUrl" class="flex-1" placeholder="https://…/premio.png" [ngModel]="form().imagenUrl" (ngModelChange)="set({ imagenUrl: $event })" />
                </div>
              </div>
            </gr-field>

            <gr-field label="Título" hint="Se muestra en las clasificaciones en vivo">
              <input grInput name="titulo" [ngModel]="form().titulo" (ngModelChange)="set({ titulo: $event })" maxlength="120" placeholder="Podio absoluto" />
            </gr-field>

            <div class="grid gap-3 sm:grid-cols-2">
              <gr-field label="Ranking">
                <gr-select name="ranking" [ngModel]="form().ranking" (ngModelChange)="set({ ranking: $event })" aria-label="Ranking del premio">
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

            <div class="grid gap-3 sm:grid-cols-2">
              <gr-field label="Puesto desde">
                <gr-select name="puestoDesde" [ngModel]="form().puestoDesde" (ngModelChange)="set({ puestoDesde: +$event })" aria-label="Puesto desde">
                  @for (n of puestos; track n) { <option [value]="n">{{ ordinal(n) }} puesto</option> }
                </gr-select>
              </gr-field>
              <gr-field label="Puesto hasta">
                <gr-select name="puestoHasta" [ngModel]="form().puestoHasta" (ngModelChange)="set({ puestoHasta: +$event })" aria-label="Puesto hasta">
                  @for (n of puestos; track n) { <option [value]="n">{{ ordinal(n) }} puesto</option> }
                </gr-select>
              </gr-field>
            </div>

            <gr-field label="Valor" hint="Texto corto · se anuncia en vivo">
              <input grInput name="valorTexto" [ngModel]="form().valorTexto" (ngModelChange)="set({ valorTexto: $event })" maxlength="60" placeholder="500 € en material Eleiko" />
            </gr-field>

            <gr-field label="Patrocinador" hint="Aparece bajo el valor del premio">
              <input grInput name="patrocinador" [ngModel]="form().patrocinador" (ngModelChange)="set({ patrocinador: $event })" maxlength="80" placeholder="Eleiko" />
            </gr-field>

            <gr-field label="Descripción" [optional]="true" hint="Máx. 140 caracteres">
              <textarea grInput name="descripcion" rows="2" [ngModel]="form().descripcion" (ngModelChange)="set({ descripcion: $event })" maxlength="400"></textarea>
            </gr-field>

            <div class="flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-card p-4">
              <div class="min-w-0">
                <p class="text-label-s">Activo</p>
                <p class="text-body-xs text-text-tertiary">{{ editando() ? 'Se anuncia en las clasificaciones en vivo' : 'Se crea activo; después se puede desactivar' }}</p>
              </div>
              <bo-toggle [value]="form().activo" label="Premio activo" [disabled]="!editando()" (changed)="set({ activo: $event })" />
            </div>
          </div>

          <div class="mt-6 flex justify-end gap-2">
            <button type="button" grButton variant="ghost" (click)="modal.set(false)">Cancelar</button>
            <button type="submit" grButton variant="primary" [loading]="ocupado()" [disabled]="!valido()">Guardar premio</button>
          </div>
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
  }  protected etiqueta(r: RankingPremio): string {
    return RANKINGS.find((x) => x.v === r)?.l ?? r;
  }
  protected tono(r: RankingPremio): GrTone {
    return RANKINGS.find((x) => x.v === r)?.tone ?? 'neutral';
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

  protected nuevo(): void {
    this.editando.set(null);
    this.form.set({ ...VACIO });
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

import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrSkeleton, GrToasts, type GrTone } from '@grcup/ui';
import { Auth } from '../core/auth';
import { Competitions } from '../core/competitions';
import { webPublica } from '../core/web';
import { BoFocal } from '../shared/focal';
import { Resource } from '../shared/resource';
import { BoSchemaForm, pick, type FieldDef } from '../shared/schema-form';
import { Confirm, errText } from '../shared/ui';

interface Patro {
  id: string;
  nombre: string;
  nivel: string;
  logoUrl: string;
  url: string;
  activo: boolean;
  descripcion: string;
  mostrarEnHero: boolean;
  fotoUrl: string;
  focalX: number;
  focalY: number;
  alt: string;
}

const NIVELES: { value: string; label: string; tone: GrTone }[] = [
  { value: 'organizador', label: 'Organizador', tone: 'neutral' },
  { value: 'federacion', label: 'Federación', tone: 'neutral' },
  { value: 'institucional', label: 'Institución', tone: 'neutral' },
  { value: 'principal', label: 'Principal', tone: 'accent' },
  { value: 'oro', label: 'Oro', tone: 'warning' },
  { value: 'plata', label: 'Plata', tone: 'neutral' },
  { value: 'colaborador', label: 'Colaborador', tone: 'neutral' },
];
/** Figma 54 «Web · patrocinadores»: three groups of cards. */
const GRUPOS = [
  { titulo: 'Organizadores y afiliaciones', niveles: ['organizador', 'federacion', 'institucional'] },
  { titulo: 'Patrocinador principal', niveles: ['principal'] },
  { titulo: 'Colaboradores', niveles: ['oro', 'plata', 'colaborador'] },
];

/** Figma 54 «Web · patrocinadores»: cards grouped by level and a fixed side editor (logo, photo with focal point and crops, link with UTM, level, alt). */
@Component({
  selector: 'bo-web-sponsors',
  imports: [GrAlert, GrBadge, GrButton, GrEmpty, GrSkeleton, BoSchemaForm, BoFocal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
      <div class="flex min-w-0 flex-col gap-6">
        <div class="flex items-center justify-between gap-3">
          <p class="text-body-s text-text-tertiary">Logos de la home y de /patrocinadores, en este orden</p>
          @if (canEdit()) { <button grButton variant="primary" icon="plus" (click)="edit(null)">Añadir patrocinador</button> }
        </div>
        @if (res().error()) { <gr-alert tone="danger" title="Error">{{ res().error() }}</gr-alert> }
        @if (res().items() === null) {
          <div class="grid gap-3 sm:grid-cols-3">@for (i of [1, 2, 3]; track i) { <gr-skeleton class="h-32 rounded-lg" /> }</div>
        } @else if (!res().items()!.length) {
          <gr-empty icon="layout" title="Sin patrocinadores" text="Añade marcas y entidades con su logo y enlace." />
        } @else {
          @for (g of grupos(); track g.titulo) {
            <section>
              <h2 class="text-ui-h5">{{ g.titulo }}</h2>
              <p class="mt-0.5 mb-3 text-body-xs text-text-tertiary">{{ g.items.length }} {{ g.items.length === 1 ? 'elemento' : 'elementos' }}</p>
              <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                @for (p of g.items; track p.id) {
                  <li>
                    <button type="button" class="flex w-full flex-col gap-3 rounded-lg border bg-bg-card p-4 text-left hover:border-line-strong focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]"
                      [class]="editing()?.id === p.id ? 'border-accent' : 'border-line-subtle'" [attr.aria-label]="'Editar ' + p.nombre" [attr.aria-pressed]="editing()?.id === p.id" (click)="edit(p)">
                      <span class="flex h-16 items-center justify-center rounded-md bg-bg-surface px-3 text-center text-label-s">
                        @if (p.logoUrl) { <img [src]="vista(p.logoUrl)" [alt]="p.nombre" class="max-h-12 w-auto max-w-full object-contain" loading="lazy" /> } @else { {{ p.nombre }} }
                      </span>
                      <span class="flex items-center justify-between gap-2">
                        <gr-badge [tone]="nivel(p.nivel).tone">{{ nivel(p.nivel).label }}</gr-badge>
                        @if (!p.activo) { <span class="text-body-xs text-text-tertiary">Oculto</span> }
                      </span>
                    </button>
                  </li>
                }
              </ul>
            </section>
          }
        }
      </div>
      <aside class="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6" aria-label="Editor de patrocinador">
        @if (abierto()) {
          <div>
            <h2 class="text-ui-h5 break-words [overflow-wrap:anywhere]">{{ editing() ? (draft()['nombre'] || editing()!.nombre) + ' · ' + nivel(str('nivel')).label.toLowerCase() : 'Nuevo patrocinador' }}</h2>
            <p class="mt-0.5 text-body-xs text-text-tertiary">Logo, foto del equipo y enlace</p>
          </div>
          @if (error()) { <gr-alert tone="danger" title="No se pudo guardar">{{ error() }}</gr-alert> }
          <bo-schema-form [fields]="fields1" [(value)]="draft" prefix="patro-" />
          @if (str('fotoUrl')) {
            <bo-focal [src]="str('fotoUrl')" [alt]="str('alt')" [x]="num('focalX')" [y]="num('focalY')" (xChange)="set('focalX', $event)" (yChange)="set('focalY', $event)" />
          }
          <bo-schema-form [fields]="fields2()" [(value)]="draft" prefix="patro2-" />
          <div class="flex flex-wrap justify-end gap-2">
            @if (editing() && canEdit()) { <button grButton variant="danger" class="mr-auto" (click)="remove()">Borrar</button> }
            <button grButton variant="ghost" (click)="close()">Cancelar</button>
            @if (canEdit()) { <button grButton variant="primary" [loading]="saving()" (click)="save()">Guardar</button> }
          </div>
        } @else {
          <gr-empty icon="layout" title="Elige un patrocinador" text="Toca una tarjeta para editar su logo, foto, enlace y nivel." />
        }
      </aside>
    </div>
  `,
})
export class WebSponsorsTab {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly comps = inject(Competitions);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  protected readonly res = signal(new Resource<Patro>(this.http, ''));
  protected readonly editing = signal<Patro | null>(null);
  protected readonly abierto = signal(false);
  protected readonly draft = signal<Record<string, unknown>>({});
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly canEdit = computed(() => this.auth.can(this.comps.current()?.id, 'web.editar'));
  protected readonly grupos = computed(() => {
    const items = this.res().items() ?? [];
    return GRUPOS.map((g) => ({ ...g, items: items.filter((p) => g.niveles.includes(p.nivel)) })).filter((g) => g.items.length);
  });
  protected readonly fields1: FieldDef[] = [
    { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', max: 120 },
    { clave: 'logoUrl', etiqueta: 'Logo', tipo: 'imagen', ayuda: 'SVG recomendado · fondo transparente' },
    { clave: 'fotoUrl', etiqueta: 'Foto del equipo', tipo: 'imagen', ayuda: 'Opcional · elige el punto focal para los recortes' },
  ];
  protected readonly fields2 = computed<FieldDef[]>(() => [
    { clave: 'url', etiqueta: 'Enlace', tipo: 'url', ayuda: `Se añade ?utm_source=${this.comps.current()?.slug ?? ''}&utm_medium=web` },
    { clave: 'nivel', etiqueta: 'Nivel', tipo: 'select', ancho: 'mitad', opciones: NIVELES.map(({ value, label }) => ({ value, label })) },
    { clave: 'alt', etiqueta: 'Texto alternativo', tipo: 'texto', max: 200, ancho: 'mitad' },
    { clave: 'descripcion', etiqueta: 'Descripción', tipo: 'texto', max: 200, ayuda: 'Una línea bajo el nombre en /patrocinadores (opcional)' },
    { clave: 'activo', etiqueta: 'Mostrar en la web', tipo: 'bool' },
    { clave: 'mostrarEnHero', etiqueta: 'Mostrar en hero', tipo: 'bool', ayuda: 'Fila de logos bajo las fechas en la portada' },
  ]);

  constructor() {
    effect(() => {
      const c = this.comps.current();
      if (!c) return;
      const r = new Resource<Patro>(this.http, '/web/patrocinadores').at(c.id);
      this.res.set(r);
      void r.load();
    });
  }

  protected nivel(v: string) { return NIVELES.find((n) => n.value === v) ?? { value: v, label: v, tone: 'neutral' as GrTone }; }
  protected vista(u: string): string { return u.startsWith('/') && !u.startsWith('//') ? webPublica() + u : u; }
  protected str(k: string): string { const v = this.draft()[k]; return typeof v === 'string' ? v : ''; }
  protected num(k: string): number { const v = this.draft()[k]; return typeof v === 'number' ? v : 50; }
  protected set(k: string, v: unknown): void { this.draft.update((d) => ({ ...d, [k]: v })); }

  protected edit(p: Patro | null): void {
    this.editing.set(p);
    this.error.set('');
    this.draft.set(pick(p as Record<string, unknown> | null, [...this.fields1, ...this.fields2(), { clave: 'focalX', etiqueta: '', tipo: 'numero' }, { clave: 'focalY', etiqueta: '', tipo: 'numero' }],
      p ? {} : { nivel: 'colaborador', activo: true, mostrarEnHero: false, focalX: 50, focalY: 50 }));
    this.abierto.set(true);
  }
  protected close(): void {
    this.abierto.set(false);
    this.editing.set(null);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    try {
      const p = this.editing();
      const saved = p ? await this.res().update(p.id, this.draft()) : await this.res().create(this.draft());
      this.editing.set(saved);
      this.toasts.success(p ? 'Cambios guardados' : 'Patrocinador creado');
    } catch (e) {
      this.error.set(errText(e));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const p = this.editing();
    if (!p) return;
    const ok = await this.confirm.ask({ title: `¿Borrar ${p.nombre}?`, text: 'Desaparecerá de la web al momento. Queda registrado en la auditoría.', confirm: 'Borrar', danger: true });
    if (!ok) return;
    try {
      await this.res().remove(p.id);
      this.close();
      this.toasts.success('Borrado');
    } catch (e) {
      this.error.set(errText(e, 'No se pudo borrar.'));
    }
  }
}


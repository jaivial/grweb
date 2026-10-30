import { webPublica } from '../core/web';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, Injectable, computed, effect, inject, input, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrIcon, GrSkeleton, GrToasts, fmtAgo, type GrTone } from '@grcup/ui';
import { Auth } from '../core/auth';
import { Competitions } from '../core/competitions';
import { BoCollection, type CollectionConfig } from '../shared/collection';
import { BoSchemaForm, type FieldDef } from '../shared/schema-form';
import { BoDrawer, BoPageHeader, BoTabs, BoToggle, Confirm, errText } from '../shared/ui';

export interface Seccion {
  id: string;
  clave: string;
  nombre: string;
  descripcion: string;
  orden: number;
  visible: boolean;
  borrador: Record<string, unknown>;
  publicado: Record<string, unknown> | null;
  publicadoAt?: string;
  version: number;
  updatedAt: string;
  estado: 'publicada' | 'cambios' | 'sin_publicar';
  /** Draft revision: sent as If-Match so two editors do not overwrite each other. */
  rev: number;
  campos: FieldDef[];
}

const ESTADO: Record<Seccion['estado'], { label: string; tone: GrTone }> = {
  publicada: { label: 'Publicado', tone: 'success' },
  cambios: { label: 'Cambios sin publicar', tone: 'warning' },
  sin_publicar: { label: 'Sin publicar', tone: 'neutral' },
};

export type Pagina = 'home' | 'publico' | 'en';
export const PAGINAS: { value: Pagina; label: string; ruta: string }[] = [
  { value: 'home', label: 'Home', ruta: '/' },
  { value: 'publico', label: 'Ven a verlo', ruta: '/publico' },
  { value: 'en', label: 'English', ruta: '/en' },
];

/** Sections of the page being edited (home, /publico or /en), shared by the layout (publish button) and the Home tab. */
@Injectable({ providedIn: 'root' })
export class WebSections {
  private readonly http = inject(HttpClient);
  readonly items = signal<Seccion[] | null>(null);
  readonly pending = computed(() => (this.items() ?? []).filter((s) => s.estado !== 'publicada').length);
  /** Page being edited: the home or one of the landings built from sections. */
  readonly pagina = signal<Pagina>('home');
  private cid = '';

  private seq = 0;

  async load(cid: string, pagina = this.pagina()): Promise<void> {
    this.cid = cid;
    if (pagina !== this.pagina()) {
      this.pagina.set(pagina);
      this.items.set(null);
    }
    const n = ++this.seq;
    const list = await firstValueFrom(this.http.get<Seccion[]>(`/api/admin/competiciones/${cid}/web/secciones`, { params: { pagina } }));
    if (n === this.seq) this.items.set(list); // a later load (another page) wins: never show a stale page
  }
  async save(id: string, body: { borrador?: unknown; visible?: boolean }, rev?: number): Promise<Seccion> {
    const headers = rev ? { 'If-Match': `W/"${rev}"` } : undefined;
    const s = await firstValueFrom(this.http.put<Seccion>(`/api/admin/competiciones/${this.cid}/web/secciones/${id}`, body, { headers }));
    this.items.update((l) => (l ?? []).map((x) => (x.id === id ? s : x)));
    return s;
  }
  async reorder(ids: string[]): Promise<void> {
    const byId = new Map((this.items() ?? []).map((x) => [x.id, x]));
    this.items.set(ids.map((id) => byId.get(id)!));
    try {
      await firstValueFrom(this.http.put(`/api/admin/competiciones/${this.cid}/web/secciones/orden`, { ids }));
    } finally {
      await this.load(this.cid); // order is part of the draft: refresh the «cambios» badges (or undo on error)
    }
  }
  async publish(claves: string[] = []): Promise<string[]> {
    const r = await firstValueFrom(this.http.post<{ publicadas: string[] }>(`/api/admin/competiciones/${this.cid}/web/publicar`, { pagina: this.pagina(), claves }));
    await this.load(this.cid);
    return r.publicadas;
  }
}

/** «Web y contenidos» (Figma page 54): header, publish action and tabs. */
@Component({
  selector: 'bo-web',
  imports: [RouterOutlet, BoPageHeader, BoTabs, GrButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1180px] flex-col gap-6">
      <bo-page-header title="Web y contenidos" [crumbs]="[comps.current()?.nombreCorto || '', 'Evento', 'Web y contenidos']"
        [badge]="secs.pending() ? 'Cambios sin publicar' : ''">
        <a actions grButton icon="external-link" [href]="previewUrl()" target="_blank" rel="noopener">Vista previa</a>
        @if (canPublish()) {
          <button actions grButton variant="primary" [disabled]="!secs.pending()" [loading]="publishing()" (click)="publish()">
            {{ secs.pending() ? 'Publicar ' + secs.pending() + (secs.pending() === 1 ? ' cambio' : ' cambios') : 'Todo publicado' }}
          </button>
        }
      </bo-page-header>
      <bo-tabs [tabs]="tabs" />
      <router-outlet />
    </div>
  `,
})
export class WebPage {
  protected readonly comps = inject(Competitions);
  protected readonly secs = inject(WebSections);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  protected readonly publishing = signal(false);
  protected readonly previewUrl = computed(() => webPublica() + (PAGINAS.find((p) => p.value === this.secs.pagina())?.ruta ?? '/'));
  protected readonly canPublish = computed(() => this.auth.can(this.comps.current()?.id, 'web.publicar'));
  protected readonly tabs = [
    { label: 'Home y landings', path: 'home' },
    { label: 'FAQ', path: 'faq' },
    { label: 'Patrocinadores y clubs', path: 'patrocinadores' },
    { label: 'Páginas y SEO', path: 'seo' },
    { label: 'Blog y galería', path: 'blog' },
    { label: 'Textos legales', path: 'legal' },
    { label: 'Voluntarios', path: 'voluntarios' },
  ];

  constructor() {
    effect(() => {
      const cid = this.comps.current()?.id;
      if (cid) void this.secs.load(cid);
    });
  }

  protected async publish(): Promise<void> {
    const n = this.secs.pending();
    const ruta = PAGINAS.find((p) => p.value === this.secs.pagina())?.ruta ?? '/';
    const ok = await this.confirm.ask({ title: `¿Publicar ${n} ${n === 1 ? 'cambio' : 'cambios'} en ${ruta}?`, text: 'La web pública mostrará los borradores al momento (la caché se renueva sola).', confirm: 'Publicar' });
    if (!ok) return;
    this.publishing.set(true);
    try {
      const done = await this.secs.publish();
      this.toasts.success('Web publicada', `${done.length} ${done.length === 1 ? 'sección' : 'secciones'}`);
    } catch (e) {
      this.toasts.error('No se pudo publicar', errText(e));
    } finally {
      this.publishing.set(false);
    }
  }
}

/** Figma «Web · home» + «Web · editar hero». */
@Component({
  selector: 'bo-web-home',
  imports: [CdkDropList, CdkDrag, CdkDragHandle, GrBadge, GrButton, GrIcon, GrSkeleton, GrAlert, BoToggle, BoDrawer, BoSchemaForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-lg border border-line-subtle bg-bg-card">
      <div class="flex flex-wrap gap-2 border-b border-line-subtle px-5 py-3" role="group" aria-label="Página">
        @for (p of paginas; track p.value) {
          <button type="button" (click)="cambiar(p.value)" [attr.aria-pressed]="secs.pagina() === p.value" class="inline-flex h-9 items-center gap-1.5 rounded-pill border px-3 text-label-s"
            [class]="secs.pagina() === p.value ? 'border-accent-text bg-accent-deep/30 text-text-primary' : 'border-line-strong text-text-secondary hover:text-text-primary'">
            {{ p.label }} <span class="text-mono-xs text-text-tertiary">{{ p.ruta }}</span>
          </button>
        }
      </div>
      <header class="border-b border-line-subtle px-5 py-4">
        <h2 class="text-ui-h5">Secciones de {{ paginaLabel() }}</h2>
        <p class="mt-0.5 text-body-xs text-text-tertiary">{{ secs.items()?.length ?? 0 }} secciones · {{ visibles() }} visibles · arrastra para cambiar el orden · el orden y la visibilidad se aplican al publicar</p>
      </header>
      @if (secs.items() === null) {
        <div class="flex flex-col gap-2 p-5">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-16" /> }</div>
      } @else {
        <ul class="flex flex-col gap-2 p-3" cdkDropList [cdkDropListDisabled]="!canEdit()" (cdkDropListDropped)="drop($event)">
          @for (s of secs.items(); track s.id) {
            <li cdkDrag class="flex items-center gap-3 rounded-md border border-line-subtle bg-bg-surface p-2.5 md:p-3">
              <span cdkDragHandle class="hidden size-8 cursor-grab items-center justify-center text-text-muted sm:flex" aria-label="Arrastrar"><gr-icon name="menu" [size]="16" /></span>
              <span class="hidden h-11 w-16 shrink-0 rounded-sm bg-[linear-gradient(135deg,#5a1520,#1b1718)] sm:block" aria-hidden="true"></span>
              <button type="button" class="min-w-0 flex-1 text-left" (click)="open(s)">
                <span class="block truncate text-label-s">{{ s.nombre }}</span>
                <span class="block truncate text-body-xs text-text-tertiary">{{ s.descripcion }}{{ s.publicadoAt ? ' · publicada ' + ago(s.publicadoAt) : '' }}</span>
              </button>
              <gr-badge [tone]="estado[s.estado].tone" class="hidden md:inline-flex">{{ estado[s.estado].label }}</gr-badge>
              <bo-toggle [value]="s.visible" [label]="'Mostrar ' + s.nombre" [disabled]="!canEdit()" (changed)="visible(s, $event)" />
            </li>
          }
        </ul>
      }
    </section>

    <bo-drawer [(open)]="drawer" [title]="current()?.nombre ?? ''" [badge]="current() && current()!.estado !== 'publicada' ? estado[current()!.estado].label : ''">
      @if (error()) {
        <gr-alert class="mb-4" tone="danger" [title]="conflict() ? 'Otra persona ha guardado antes' : 'No se pudo guardar'">
          {{ error() }}
          @if (conflict()) { <button grButton size="s" class="mt-3" (click)="reload()">Recargar sus cambios</button> }
        </gr-alert>
      }
      @if (current(); as s) {
        <p class="mb-4 text-body-s text-text-tertiary">{{ s.descripcion }}. Se guarda como borrador; la web no cambia hasta publicar.</p>
        <bo-schema-form [fields]="s.campos" [(value)]="draft" [prefix]="s.clave + '-'" />
      }
      <ng-container drawerActions>
        <button grButton variant="ghost" (click)="drawer.set(false)">Cancelar</button>
        @if (canEdit()) { <button grButton [loading]="saving()" (click)="save(false)">Guardar borrador</button> }
        @if (canPublish()) { <button grButton variant="primary" [loading]="saving()" (click)="save(true)">Publicar</button> }
      </ng-container>
    </bo-drawer>
  `,
})
export class WebHomeTab {
  protected readonly secs = inject(WebSections);
  private readonly auth = inject(Auth);
  private readonly comps = inject(Competitions);
  private readonly toasts = inject(GrToasts);
  protected readonly estado = ESTADO;
  protected readonly ago = fmtAgo;
  protected readonly drawer = signal(false);
  protected readonly current = signal<Seccion | null>(null);
  protected readonly draft = signal<Record<string, unknown>>({});
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly visibles = computed(() => (this.secs.items() ?? []).filter((s) => s.visible).length);
  protected readonly canEdit = computed(() => this.auth.can(this.comps.current()?.id, 'web.editar'));
  protected readonly canPublish = computed(() => this.auth.can(this.comps.current()?.id, 'web.publicar'));

  protected readonly conflict = signal(false);
  protected readonly paginas = PAGINAS;
  protected readonly paginaLabel = computed(() => ({ home: 'la home', publico: '/publico', en: '/en (inglés)' })[this.secs.pagina()]);

  protected cambiar(p: Pagina): void {
    const cid = this.comps.current()?.id;
    if (cid && p !== this.secs.pagina()) void this.secs.load(cid, p);
  }

  protected open(s: Seccion): void {
    this.current.set(s);
    this.draft.set(structuredClone(s.borrador ?? {}));
    this.error.set('');
    this.conflict.set(false);
    this.drawer.set(true);
  }

  /** After a 409: load the other editor's version into the drawer (local edits are discarded). */
  protected async reload(): Promise<void> {
    const id = this.current()?.id;
    await this.secs.load(this.comps.current()!.id, this.secs.pagina());
    const s = (this.secs.items() ?? []).find((x) => x.id === id);
    if (s) this.open(s);
  }

  protected async save(publish: boolean): Promise<void> {
    const s = this.current();
    if (!s) return;
    this.saving.set(true);
    this.error.set('');
    this.conflict.set(false);
    try {
      const saved = await this.secs.save(s.id, { borrador: this.draft() }, s.rev);
      this.current.set(saved);
      if (publish) await this.secs.publish([s.clave]);
      this.drawer.set(false);
      this.toasts.success(publish ? 'Sección publicada' : 'Borrador guardado', publish ? 'Ya se ve en la web.' : 'La web no cambia hasta publicar.');
    } catch (e) {
      this.conflict.set(e instanceof HttpErrorResponse && e.error?.code === 'CONFLICTO_EDICION');
      this.error.set(errText(e));
    } finally {
      this.saving.set(false);
    }
  }

  protected async visible(s: Seccion, v: boolean): Promise<void> {
    try {
      await this.secs.save(s.id, { visible: v });
      this.toasts.success(v ? 'Sección visible en el borrador' : 'Sección oculta en el borrador', 'Se aplica a la web al publicar.');
    } catch (e) {
      this.toasts.error('No se pudo cambiar', errText(e));
    }
  }

  protected async drop(e: CdkDragDrop<Seccion[]>): Promise<void> {
    const ids = (this.secs.items() ?? []).map((s) => s.id);
    moveItemInArray(ids, e.previousIndex, e.currentIndex);
    try {
      await this.secs.reorder(ids);
    } catch {
      this.toasts.error('No se pudo guardar el orden');
    }
  }
}

interface LegalVersion {
  id: string;
  tipo: string;
  version: string;
  titulo: string;
  contenido: string;
  publicadoAt?: string;
  createdAt: string;
}
interface LegalGroup {
  tipo: string;
  nombre: string;
  ruta: string;
  vigente?: LegalVersion;
  versiones: LegalVersion[];
}

/** Figma «Web · textos legales»: versioned, immutable once published. */
@Component({
  selector: 'bo-web-legal',
  imports: [GrBadge, GrButton, GrSkeleton, GrAlert, GrEmpty, BoDrawer, BoSchemaForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (groups() === null) {
      <div class="grid gap-4 md:grid-cols-2">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-40 rounded-lg" /> }</div>
    } @else {
      <div class="grid gap-4 md:grid-cols-2">
        @for (g of groups(); track g.tipo) {
          <section class="flex flex-col rounded-lg border border-line-subtle bg-bg-card p-5">
            <div class="flex items-start justify-between gap-3">
              <div><h2 class="text-ui-h5">{{ g.nombre }}</h2><p class="mt-0.5 text-mono-xs text-text-tertiary">{{ g.ruta }}</p></div>
              @if (g.vigente) { <gr-badge tone="success">v{{ g.vigente.version }}</gr-badge> } @else { <gr-badge tone="warning">Sin publicar</gr-badge> }
            </div>
            <ul class="mt-4 flex flex-1 flex-col gap-2">
              @for (v of g.versiones.slice(0, 3); track v.id) {
                <li class="flex items-center justify-between gap-3 rounded-sm border border-line-subtle bg-bg-surface px-3 py-2">
                  <span class="flex min-w-0 items-baseline gap-2"><span class="text-mono-s">v{{ v.version }}</span><span class="text-body-xs text-text-tertiary">{{ v.publicadoAt ? 'publicada ' + date(v.publicadoAt) : 'borrador' }}</span></span>
                  @if (!v.publicadoAt && canEdit()) { <button grButton size="s" (click)="edit(g, v)">Editar</button> }
                  @if (!v.publicadoAt && canPublish()) { <button grButton size="s" variant="primary" (click)="publish(g, v)">Publicar</button> }
                </li>
              } @empty { <li><gr-empty icon="shield" title="Sin versiones" text="Crea la primera versión del texto." /></li> }
            </ul>
            @if (canEdit()) { <button grButton size="s" icon="plus" class="mt-4 self-start" (click)="edit(g, null)">Nueva versión</button> }
          </section>
        }
      </div>
    }
    <bo-drawer [(open)]="drawer" [title]="(editing() ? 'Editar ' : 'Nueva versión · ') + (group()?.nombre ?? '')">
      @if (error()) { <gr-alert class="mb-4" tone="danger" title="No se pudo guardar">{{ error() }}</gr-alert> }
      <gr-alert class="mb-4" tone="info" title="Versiones inmutables">Una versión publicada no cambia: los consentimientos guardan la versión aceptada. Para corregir, crea otra.</gr-alert>
      <bo-schema-form [fields]="fields" [(value)]="draft" prefix="legal-" />
      <ng-container drawerActions>
        <button grButton variant="ghost" (click)="drawer.set(false)">Cancelar</button>
        <button grButton variant="primary" [loading]="saving()" (click)="save()">Guardar borrador</button>
      </ng-container>
    </bo-drawer>
  `,
})
export class WebLegalTab {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly comps = inject(Competitions);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  protected readonly groups = signal<LegalGroup[] | null>(null);
  protected readonly drawer = signal(false);
  protected readonly group = signal<LegalGroup | null>(null);
  protected readonly editing = signal<LegalVersion | null>(null);
  protected readonly draft = signal<Record<string, unknown>>({});
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly canEdit = computed(() => this.auth.can(this.comps.current()?.id, 'web.editar'));
  protected readonly canPublish = computed(() => this.auth.can(this.comps.current()?.id, 'web.publicar'));
  protected readonly fields: FieldDef[] = [
    { clave: 'version', etiqueta: 'Versión', tipo: 'texto', ayuda: 'p. ej. 2026-11', max: 20, ancho: 'mitad' },
    { clave: 'titulo', etiqueta: 'Título', tipo: 'texto', max: 140, ancho: 'mitad' },
    { clave: 'contenido', etiqueta: 'Contenido', tipo: 'markdown', ayuda: 'Markdown: títulos ##, listas, negrita y enlaces.' },
  ];
  private base = computed(() => `/api/admin/competiciones/${this.comps.current()?.id}/legal`);

  constructor() {
    effect(() => {
      if (this.comps.current()) void this.load();
    });
  }

  protected date(v: string): string {
    return new Date(v).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  private async load(): Promise<void> {
    this.groups.set(await firstValueFrom(this.http.get<LegalGroup[]>(this.base())));
  }

  protected edit(g: LegalGroup, v: LegalVersion | null): void {
    this.group.set(g);
    this.editing.set(v);
    this.error.set('');
    const d = new Date();
    this.draft.set(v ? { version: v.version, titulo: v.titulo, contenido: v.contenido } : { version: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, titulo: g.nombre, contenido: g.vigente?.contenido ?? '' });
    this.drawer.set(true);
  }

  protected async save(): Promise<void> {
    const g = this.group();
    if (!g) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const v = this.editing();
      if (v) await firstValueFrom(this.http.put(`${this.base()}/${g.tipo}/versiones/${v.id}`, this.draft()));
      else await firstValueFrom(this.http.post(`${this.base()}/${g.tipo}/versiones`, this.draft()));
      this.drawer.set(false);
      this.toasts.success('Borrador guardado');
      await this.load();
    } catch (e) {
      this.error.set(errText(e));
    } finally {
      this.saving.set(false);
    }
  }

  protected async publish(g: LegalGroup, v: LegalVersion): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Publicar ${g.nombre.toLowerCase()} v${v.version}`,
      text: 'La web mostrará la nueva versión al momento. Las aceptaciones anteriores se conservan como prueba; cada persona aceptará esta versión en su próxima reserva o compra. No se envía ningún email masivo.',
      confirm: 'Publicar versión',
    });
    if (!ok) return;
    try {
      await firstValueFrom(this.http.post(`${this.base()}/${g.tipo}/versiones/${v.id}/publicar`, {}));
      this.toasts.success('Versión publicada');
      await this.load();
    } catch (e) {
      this.toasts.error('No se pudo publicar', errText(e));
    }
  }
}

const si = (v: unknown) => (v ? 'Sí' : 'No');

/** Collections configured from the CMS API (Figma «Web · FAQ», «patrocinadores», «SEO», «blog y galería», «voluntarios»). */
export const COLLECTIONS: Record<string, CollectionConfig[]> = {
  faq: [{
    title: 'Preguntas frecuentes', subtitle: 'Las destacadas aparecen en la home', path: '/web/faq', item: 'pregunta', reorder: true, filterBy: 'categoria',
    columns: [{ key: 'pregunta', label: 'Pregunta' }, { key: 'categoria', label: 'Categoría', hideMobile: true }, { key: 'destacada', label: 'Home', kind: 'badge', value: (r) => (r['destacada'] ? 'Destacada' : '—'), tone: (r) => (r['destacada'] ? 'accent' : 'neutral'), hideMobile: true },
      { key: 'publicada', label: 'Estado', kind: 'badge', value: (r) => (r['publicada'] ? 'Publicada' : 'Borrador'), tone: (r) => (r['publicada'] ? 'success' : 'neutral') }],
    fields: [{ clave: 'pregunta', etiqueta: 'Pregunta', tipo: 'texto', max: 200 }, { clave: 'respuesta', etiqueta: 'Respuesta', tipo: 'markdown', ayuda: 'Admite negrita y enlaces' },
      { clave: 'categoria', etiqueta: 'Categoría', tipo: 'select', ancho: 'mitad', opciones: ['General', 'Entradas', 'Competición', 'Sorteo', 'Llegar', 'Accesibilidad'].map((v) => ({ value: v, label: v })) },
      { clave: 'destacada', etiqueta: 'Destacar en la home', tipo: 'bool', ayuda: 'Aparece en «Preguntas frecuentes» de la home' }, { clave: 'publicada', etiqueta: 'Publicada', tipo: 'bool' }],
    defaults: { categoria: 'General', publicada: true, destacada: false },
    empty: { title: 'Sin preguntas', text: 'Añade las dudas más habituales: entradas, horarios, sorteo, cómo llegar.' },
  }],
  patrocinadores: [{
    title: 'Patrocinadores', subtitle: 'Logos de la home y de /patrocinadores, en este orden', path: '/web/patrocinadores', item: 'patrocinador', reorder: true, filterBy: 'nivel',
    columns: [{ key: 'logoUrl', label: 'Logo', kind: 'image' }, { key: 'nombre', label: 'Nombre' }, { key: 'nivel', label: 'Nivel', kind: 'badge', hideMobile: true }, { key: 'activo', label: 'Activo', kind: 'bool' }],
    fields: [{ clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', max: 120 }, { clave: 'nivel', etiqueta: 'Nivel', tipo: 'select', ancho: 'mitad', opciones: [['principal', 'Principal'], ['oro', 'Oro'], ['plata', 'Plata'], ['colaborador', 'Colaborador'], ['institucional', 'Institucional']].map(([value, label]) => ({ value, label })) },
      { clave: 'url', etiqueta: 'Web', tipo: 'url', ancho: 'mitad' }, { clave: 'logoUrl', etiqueta: 'Logo', tipo: 'imagen', ayuda: 'PNG o WebP con fondo transparente' }, { clave: 'activo', etiqueta: 'Mostrar en la web', tipo: 'bool' }],
    defaults: { nivel: 'colaborador', activo: true },
    empty: { title: 'Sin patrocinadores', text: 'Añade marcas y entidades con su logo y enlace.' },
  }, {
    title: 'Clubs', subtitle: 'Directorio de /clubs · las propuestas del formulario público llegan como «Pendiente»', path: '/web/clubs', item: 'club', reorder: true, filterBy: 'estado',
    columns: [{ key: 'logoUrl', label: 'Logo', kind: 'image' }, { key: 'nombre', label: 'Club' }, { key: 'ciudad', label: 'Ciudad', hideMobile: true, value: (r) => [r['ciudad'], r['provincia']].filter(Boolean).join(' · ') },
      { key: 'contactoEmail', label: 'Contacto', hideMobile: true },
      { key: 'estado', label: 'Estado', kind: 'badge', value: (r) => ({ publicado: 'Publicado', pendiente: 'Pendiente', oculto: 'Oculto' })[r['estado'] as string] ?? String(r['estado']),
        tone: (r) => (r['estado'] === 'publicado' ? 'success' : r['estado'] === 'pendiente' ? 'warning' : 'neutral') }],
    fields: [{ clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', max: 120 },
      { clave: 'ciudad', etiqueta: 'Ciudad', tipo: 'texto', max: 80, ancho: 'mitad' },
      { clave: 'provincia', etiqueta: 'Provincia', tipo: 'select', ancho: 'mitad', opciones: ['Valencia', 'Alicante', 'Castellón', 'Murcia', 'Baleares', 'Otra'].map((v) => ({ value: v, label: v })) },
      { clave: 'rol', etiqueta: 'Papel', tipo: 'select', ancho: 'mitad', opciones: [['organizador', 'Club organizador'], ['colaborador', 'Club colaborador'], ['club', 'Club']].map(([value, label]) => ({ value, label })) },
      { clave: 'estado', etiqueta: 'Estado', tipo: 'select', ancho: 'mitad', opciones: [['publicado', 'Publicado'], ['pendiente', 'Pendiente de revisar'], ['oculto', 'Oculto']].map(([value, label]) => ({ value, label })) },
      { clave: 'etiquetas', etiqueta: 'Etiquetas', tipo: 'texto', max: 120, ayuda: 'Separadas por comas: «Powerlifting, AEP»' },
      { clave: 'logoUrl', etiqueta: 'Logo', tipo: 'imagen' },
      { clave: 'web', etiqueta: 'Web', tipo: 'url', ancho: 'mitad' }, { clave: 'instagram', etiqueta: 'Instagram', tipo: 'url', ancho: 'mitad' },
      { clave: 'afiliadoAep', etiqueta: 'Afiliado a la AEP', tipo: 'bool' }],
    defaults: { rol: 'club', estado: 'publicado', provincia: 'Valencia' },
    empty: { title: 'Sin clubs', text: 'Añade clubs a mano o espera propuestas desde /clubs.' },
  }],
  seo: [
    {
      title: 'Páginas de contenido', subtitle: 'Reglamento, categorías, marcas mínimas… (/{slug})', path: '/web/paginas', item: 'página', reorder: true,
      columns: [{ key: 'titulo', label: 'Página' }, { key: 'slug', label: 'Ruta', kind: 'mono', value: (r) => '/' + r['slug'] }, { key: 'publicada', label: 'Estado', kind: 'badge', value: (r) => (r['publicada'] ? 'Publicada' : 'Borrador'), tone: (r) => (r['publicada'] ? 'success' : 'neutral') }],
      fields: [{ clave: 'titulo', etiqueta: 'Título', tipo: 'texto', max: 140 }, { clave: 'slug', etiqueta: 'Ruta', tipo: 'texto', ayuda: 'Minúsculas y guiones', ancho: 'mitad' }, { clave: 'portadaUrl', etiqueta: 'Portada', tipo: 'imagen' },
        { clave: 'resumen', etiqueta: 'Resumen', tipo: 'area', max: 300 }, { clave: 'cuerpo', etiqueta: 'Contenido', tipo: 'markdown' }, { clave: 'publicada', etiqueta: 'Publicada', tipo: 'bool' }],
      defaults: { publicada: false },
      empty: { title: 'Sin páginas', text: 'Crea páginas como el reglamento o las categorías de peso.' },
    },
    {
      title: 'SEO por ruta', subtitle: 'Title y description que ve Google', path: '/web/seo', item: 'ruta',
      columns: [{ key: 'ruta', label: 'Ruta', kind: 'mono' }, { key: 'title', label: 'Title' }, { key: 'indexable', label: 'Indexable', kind: 'badge', value: (r) => si(r['indexable']), tone: (r) => (r['indexable'] ? 'success' : 'warning'), hideMobile: true }],
      fields: [{ clave: 'ruta', etiqueta: 'Ruta', tipo: 'texto', ayuda: 'Empieza por /' }, { clave: 'title', etiqueta: 'Title', tipo: 'texto', max: 70 }, { clave: 'description', etiqueta: 'Description', tipo: 'area', max: 170 },
        { clave: 'imagenUrl', etiqueta: 'Imagen para redes', tipo: 'imagen', ayuda: '1200 × 630' }, { clave: 'indexable', etiqueta: 'Indexable en buscadores', tipo: 'bool' }],
      defaults: { indexable: true },
      empty: { title: 'Sin SEO a medida', text: 'Las páginas usan textos automáticos hasta que los definas aquí.' },
    },
    {
      title: 'Redirecciones', subtitle: 'Enlaces antiguos que llevan a la página nueva', path: '/web/redirecciones', item: 'redirección',
      columns: [{ key: 'desde', label: 'Desde', kind: 'mono' }, { key: 'hacia', label: 'Hacia', kind: 'mono' }, { key: 'codigo', label: 'Código', kind: 'badge', hideMobile: true }],
      fields: [{ clave: 'desde', etiqueta: 'Desde', tipo: 'texto', ayuda: '/ruta-antigua', ancho: 'mitad' }, { clave: 'hacia', etiqueta: 'Hacia', tipo: 'texto', ayuda: '/ruta-nueva o https://…', ancho: 'mitad' },
        { clave: 'codigo', etiqueta: 'Tipo', tipo: 'select', opciones: [{ value: '301', label: '301 · permanente' }, { value: '302', label: '302 · temporal' }] }],
      defaults: { codigo: '301' },
      empty: { title: 'Sin redirecciones', text: 'Útiles al cambiar de dominio o de ruta.' },
    },
  ],
  blog: [
    {
      title: 'Blog', subtitle: 'Noticias de la competición', path: '/web/blog', item: 'entrada',
      columns: [{ key: 'titulo', label: 'Entrada' }, { key: 'publicarAt', label: 'Programada', kind: 'date', hideMobile: true }, { key: 'publicada', label: 'Estado', kind: 'badge', value: (r) => (r['publicada'] ? 'Publicada' : 'Borrador'), tone: (r) => (r['publicada'] ? 'success' : 'neutral') }],
      fields: [{ clave: 'titulo', etiqueta: 'Título', tipo: 'texto', max: 140 }, { clave: 'slug', etiqueta: 'Ruta', tipo: 'texto', ayuda: '/blog/{ruta}', ancho: 'mitad' }, { clave: 'publicarAt', etiqueta: 'Programar publicación', tipo: 'fecha', ancho: 'mitad' },
        { clave: 'portadaUrl', etiqueta: 'Portada', tipo: 'imagen' }, { clave: 'resumen', etiqueta: 'Resumen', tipo: 'area', max: 300 }, { clave: 'cuerpo', etiqueta: 'Contenido', tipo: 'markdown' }, { clave: 'publicada', etiqueta: 'Publicada', tipo: 'bool' }],
      defaults: { publicada: false },
      empty: { title: 'Sin entradas', text: 'Publica novedades: apertura de reservas, horarios, resultados.' },
    },
    {
      title: 'Galería', subtitle: 'Álbumes de fotos (con consentimiento de imagen)', path: '/web/albumes', item: 'álbum', reorder: true,
      columns: [{ key: 'titulo', label: 'Álbum' }, { key: 'fotos', label: 'Fotos', kind: 'mono', value: (r) => String((r['fotos'] as unknown[] | null)?.length ?? 0) + ' fotos' }, { key: 'publicado', label: 'Estado', kind: 'badge', value: (r) => (r['publicado'] ? 'Publicado' : 'Borrador'), tone: (r) => (r['publicado'] ? 'success' : 'neutral') }],
      fields: [{ clave: 'titulo', etiqueta: 'Título', tipo: 'texto', max: 120, ancho: 'mitad' }, { clave: 'slug', etiqueta: 'Ruta', tipo: 'texto', ancho: 'mitad' },
        { clave: 'fotos', etiqueta: 'Fotos', tipo: 'lista', max: 300, campos: [{ clave: 'url', etiqueta: 'Foto', tipo: 'imagen' }, { clave: 'alt', etiqueta: 'Texto alternativo', tipo: 'texto', max: 200 },
          { clave: 'etiqueta', etiqueta: 'Filtro en /galeria', tipo: 'select', opciones: [['', 'Sin filtro'], ['plataforma', 'Plataforma'], ['calentamiento', 'Calentamiento'], ['podio', 'Podios'], ['ambiente', 'Ambiente']].map(([value, label]) => ({ value, label })) },
          { clave: 'focalX', etiqueta: 'Punto focal X (%)', tipo: 'numero', ancho: 'mitad' }, { clave: 'focalY', etiqueta: 'Punto focal Y (%)', tipo: 'numero', ancho: 'mitad' }] },
        { clave: 'publicado', etiqueta: 'Publicado', tipo: 'bool' }],
      defaults: { publicado: false, fotos: [] },
      empty: { title: 'Sin álbumes', text: 'Sube las fotos de la competición.' },
    },
  ],
  voluntarios: [{
    title: 'Solicitudes de voluntariado', subtitle: 'Llegan desde /voluntarios · los menores necesitan autorización del tutor', path: '/voluntarios', item: 'voluntario', noCreate: true, noDelete: false, filterBy: 'estado',
    columns: [{ key: 'nombre', label: 'Nombre' }, { key: 'email', label: 'Email', hideMobile: true }, { key: 'disponibilidad', label: 'Disponibilidad', hideMobile: true },
      { key: 'esMenor', label: 'Edad', kind: 'badge', value: (r) => (r['esMenor'] ? 'Menor' : 'Adulto'), tone: (r) => (r['esMenor'] ? 'warning' : 'neutral'), hideMobile: true },
      { key: 'estado', label: 'Estado', kind: 'badge', tone: (r) => (r['estado'] === 'confirmado' ? 'success' : r['estado'] === 'descartado' ? 'neutral' : 'warning') }],
    fields: [{ clave: 'puesto', etiqueta: 'Puesto', tipo: 'texto', max: 80, ancho: 'mitad' }, { clave: 'estado', etiqueta: 'Estado', tipo: 'select', ancho: 'mitad', opciones: [['pendiente', 'Pendiente'], ['confirmado', 'Confirmado'], ['descartado', 'Descartado']].map(([value, label]) => ({ value, label })) },
      { clave: 'autorizacionUrl', etiqueta: 'Autorización del tutor (menores)', tipo: 'imagen', ayuda: 'Foto o PDF firmado' }, { clave: 'notas', etiqueta: 'Notas internas', tipo: 'area', max: 1000 }],
    empty: { title: 'Sin solicitudes', text: 'Cuando alguien se apunte desde /voluntarios aparecerá aquí.' },
  }],
};

/** A tab made of one or more collections (route param `coleccion`). */
@Component({
  selector: 'bo-web-collections',
  imports: [BoCollection],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-6' },
  template: `@for (c of configs(); track c.path) { <bo-collection [config]="c" /> } @empty { <p class="text-body-s text-text-tertiary">Sección desconocida.</p> }`,
})
export class WebCollectionsTab {
  readonly coleccion = input('');
  protected readonly configs = computed(() => COLLECTIONS[this.coleccion()] ?? []);
}

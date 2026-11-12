import { webPublica } from '../core/web';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, Injectable, computed, effect, inject, input, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrIcon, GrSkeleton, GrToasts, fmtAgo, type GrTone } from '@grcup/ui';
import { Auth } from '../core/auth';
import { Competitions } from '../core/competitions';
import { Realtime } from '../core/realtime';
import { BoCollection, type CollectionConfig } from '../shared/collection';
import { BoSchemaForm, type FieldDef } from '../shared/schema-form';
import { BoDrawer, BoPageHeader, BoTabs, BoToggle, Confirm, errText } from '../shared/ui';
import { WebHeroEditor } from './web-hero';
import { WebSponsorsTab } from './web-sponsors';
import { WebSeoExtra } from './web-seo';

/** Static routes of the public app (projects/public/src/app/app.routes.ts); a redirect from one of them hides that page. */
const RUTAS_PUBLICAS = new Set(['/preguntas-frecuentes', '/patrocinadores', '/galeria', '/voluntarios', '/como-llegar', '/donde-dormir-y-comer', '/mapa-de-accesos',
  '/categorias-de-peso', '/marcas-minimas', '/reglamento', '/atletas', '/participantes', '/horarios', '/novedades/confirmar', '/entradas', '/entradas/confirmacion',
  '/entradas/oferta', '/mi-entrada', '/baja', '/sorteo', '/en-directo', '/acceso', '/directo', '/porra', '/porra/mis-apuestas',
  '/porra/clasificacion', '/fantasy', '/fantasy/mercado', '/fantasy/clasificacion', '/fantasy/como-se-juega', '/resultados', '/area-atleta', '/alta-atleta',
  '/inscripcion', '/inscripcion/estado', '/pago/simulado', '/publico', '/clubs', '/en', '/blog', '/privacidad', '/terminos', '/cookies', '/consentimiento-datos',
  '/texto-whatsapp', '/politica-concurso', '/_styleguide']);

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
  /** «Programar»: publication scheduled at this time. */
  programadaAt?: string;
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
    if (n === this.seq) this.items.set(list.map(campos)); // a later load (another page) wins: never show a stale page
  }
  async save(id: string, body: { borrador?: unknown; visible?: boolean }, rev?: number): Promise<Seccion> {
    const headers = rev ? { 'If-Match': `W/"${rev}"` } : undefined;
    const s = campos(await firstValueFrom(this.http.put<Seccion>(`/api/admin/competiciones/${this.cid}/web/secciones/${id}`, body, { headers })));
    this.items.update((l) => (l ?? []).map((x) => (x.id === id ? s : x)));
    return s;
  }
  /** «Descartar borrador»: back to the published content, schedule cancelled. */
  async discard(id: string): Promise<Seccion> {
    const s = campos(await firstValueFrom(this.http.post<Seccion>(`/api/admin/competiciones/${this.cid}/web/secciones/${id}/descartar`, {})));
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
  /** Publishes now, or at programadaAt («Programar»). */
  async publish(claves: string[] = [], programadaAt?: string): Promise<string[]> {
    const r = await firstValueFrom(this.http.post<{ publicadas: string[] }>(`/api/admin/competiciones/${this.cid}/web/publicar`, { pagina: this.pagina(), claves, programadaAt }));
    await this.load(this.cid);
    return r.publicadas;
  }
}

/** The API sends select options as plain values; the form wants { value, label }. */
function campos(s: Seccion): Seccion {
  const fix = (l: FieldDef[]): FieldDef[] => l.map((c) => ({ ...c, opciones: c.opciones?.map((o) => (typeof o === 'object' ? o : { value: o, label: o })), campos: c.campos && fix(c.campos) }));
  return { ...s, campos: fix(s.campos ?? []) };
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
      <bo-tabs [tabs]="tabs()" />
      <div><router-outlet /></div>
    </div>
  `,
})
export class WebPage {
  private readonly http = inject(HttpClient);
  protected readonly comps = inject(Competitions);
  protected readonly secs = inject(WebSections);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  protected readonly publishing = signal(false);
  protected readonly previewUrl = computed(() => webPublica() + (PAGINAS.find((p) => p.value === this.secs.pagina())?.ruta ?? '/'));
  protected readonly canPublish = computed(() => this.auth.can(this.comps.current()?.id, 'web.publicar'));
  /** Figma «Web · home»: FAQ 24 · Patrocinadores 9 · Páginas y SEO 28 · Voluntarios 7 (null while loading or on error). */
  private readonly counts = signal<Record<string, number | null>>({});
  protected readonly tabs = computed(() => {
    const n = this.counts();
    return [
      { label: 'Home y landings', path: 'home' },
      { label: 'FAQ', path: 'faq', count: n['faq'] },
      { label: 'Patrocinadores', path: 'patrocinadores', count: n['patrocinadores'] },
      { label: 'Clubs', path: 'clubs', count: n['clubs'] },
      { label: 'Páginas y SEO', path: 'seo', count: n['seo'] },
      { label: 'Blog y galería', path: 'blog' },
      { label: 'Mapas de acceso', path: 'mapas' },
      { label: 'Textos legales', path: 'legal' },
      // its own page (Figma 68); /:comp/web/voluntarios redirects there
      { label: 'Voluntarios', path: 'voluntarios', count: n['voluntarios'] },
    ];
  });

  constructor() {
    effect(() => {
      const cid = this.comps.current()?.id;
      if (!cid) return;
      void this.secs.load(cid);
      void this.loadCounts(cid);
    });
    // Another editor saved, published or scheduled a section: reload the list (U30-R2-3).
    let t: ReturnType<typeof setTimeout> | undefined;
    const sub = inject(Realtime).events.subscribe((e) => {
      if (!e.tipo.startsWith('cms.secci') && !e.tipo.startsWith('cms.web_') && e.tipo !== 'web.publicada') return;
      clearTimeout(t);
      t = setTimeout(() => { const cid = this.comps.current()?.id; if (cid) void this.secs.load(cid, this.secs.pagina()); }, 300);
    });
    inject(DestroyRef).onDestroy(() => { clearTimeout(t); sub.unsubscribe(); });
  }

  private async loadCounts(cid: string): Promise<void> {
    const paths = { faq: '/web/faq', patrocinadores: '/web/patrocinadores', clubs: '/web/clubs', seo: '/web/seo', voluntarios: '/voluntarios' };
    const res = await Promise.allSettled(Object.values(paths).map((p) => firstValueFrom(this.http.get<unknown[]>(`/api/admin/competiciones/${cid}${p}`))));
    this.counts.set(Object.fromEntries(Object.keys(paths).map((k, i) => { const r = res[i]; return [k, r.status === 'fulfilled' && Array.isArray(r.value) ? r.value.length : null]; })));
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
  imports: [CdkDropList, CdkDrag, CdkDragHandle, GrBadge, GrButton, GrIcon, GrSkeleton, GrAlert, BoToggle, BoDrawer, BoSchemaForm, WebHeroEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (heroSec(); as h) {
      <bo-web-hero [seccion]="h" (closed)="heroId.set('')" />
    } @else {
    <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
    <section class="min-w-0 rounded-lg border border-line-subtle bg-bg-card">
      <header class="px-5 pt-5 pb-3 md:px-6 md:pt-6">
        <h2 class="text-ui-h5">Secciones de {{ paginaLabel() }}</h2>
        <p class="mt-0.5 text-body-xs text-text-tertiary">{{ secs.items()?.length ?? 0 }} secciones · {{ visibles() }} visibles · arrastra para cambiar el orden · el orden y la visibilidad se aplican al publicar</p>
        <div class="mt-4 inline-flex max-w-full flex-wrap gap-1 rounded-md border border-line-subtle bg-bg-surface p-1" role="group" aria-label="Página">
          @for (p of paginas; track p.value) {
            <button type="button" (click)="cambiar(p.value)" [attr.aria-pressed]="secs.pagina() === p.value"
              class="inline-flex h-9 items-center gap-1.5 rounded-sm px-4 text-label-s transition-colors focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] motion-reduce:transition-none"
              [class]="secs.pagina() === p.value ? 'bg-bg-raised text-text-primary' : 'text-text-secondary hover:text-text-primary'">
              {{ p.label }} <span>{{ p.ruta }}</span>
            </button>
          }
        </div>
      </header>
      @if (secs.items() === null) {
        <div class="flex flex-col gap-2 p-5">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-16" /> }</div>
      } @else {
        <ul class="flex flex-col gap-2 p-3" cdkDropList [cdkDropListDisabled]="!canEdit()" (cdkDropListDropped)="drop($event)">
          @for (s of secs.items(); track s.id) {
            <li cdkDrag class="flex items-center gap-3 rounded-md border border-line-subtle bg-bg-surface p-2.5 md:p-3">
              <span cdkDragHandle class="hidden size-8 cursor-grab items-center justify-center text-text-muted sm:flex" aria-label="Arrastrar"><gr-icon name="grip" [size]="16" /></span>
              <span class="hidden h-11 w-16 shrink-0 rounded-sm bg-[linear-gradient(135deg,#5a1520,#1b1718)] sm:block" aria-hidden="true"></span>
              <button type="button" class="min-w-0 flex-1 text-left" (click)="open(s)">
                <span class="block truncate text-label-s">{{ s.nombre }}</span>
                <span class="block truncate text-body-xs text-text-tertiary">{{ s.descripcion }}{{ s.publicadoAt ? ' · publicada ' + ago(s.publicadoAt) : '' }}</span>
              </button>
              <gr-badge [tone]="estado[s.estado].tone" class="hidden md:inline-flex">{{ estado[s.estado].label }}</gr-badge>
              <bo-toggle [value]="s.visible" [label]="'Mostrar ' + s.nombre" [disabled]="!canEdit()" (changed)="visible(s, $event)" />
              <button type="button" class="hidden size-9 items-center justify-center rounded-sm text-text-tertiary hover:bg-bg-raised hover:text-text-primary focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)] sm:flex"
                [attr.aria-label]="'Editar ' + s.nombre" (click)="open(s)"><gr-icon name="more" [size]="16" /></button>
            </li>
          }
        </ul>
      }
    </section>
    <!-- Figma «Web · home» › Vista previa: draft of the page in a phone frame (desktop only) -->
    <aside class="hidden xl:block" aria-label="Vista previa">
      <h2 class="text-ui-h5">Vista previa</h2>
      <p class="mt-0.5 text-body-xs text-text-tertiary">Borrador · móvil</p>
      <div class="mt-3 rounded-[28px] border-4 border-line-strong bg-bg-base p-4">
        <div class="mx-auto mb-3 h-1.5 w-16 rounded-pill bg-line-strong"></div>
        @if (hero(); as h) {
          <div class="rounded-md bg-[linear-gradient(180deg,#5a1520,#1b1718)] px-3 py-5 text-center">
            @if (h.antetitulo) { <p class="text-mono-xs uppercase tracking-wider text-text-secondary">{{ h.antetitulo }}</p> }
            <p class="mt-2 font-display text-[26px] leading-tight uppercase">{{ h.titulo || comps.current()?.nombre }}</p>
            @if (h.subtitulo) { <p class="mt-2 text-body-xs text-text-secondary">{{ h.subtitulo }}</p> }
            @if (h.cta) { <span class="mt-3 inline-flex h-8 items-center rounded-sm bg-accent px-3 text-label-s">{{ h.cta }}</span> }
          </div>
        }
        <ul class="mt-2 flex flex-col gap-2">
          @for (s of resto(); track s.id) {
            <li class="rounded-md bg-bg-card px-3 py-2.5"><p class="text-mono-xs uppercase tracking-wider text-accent-text">{{ s.nombre }}</p><p class="mt-0.5 truncate text-body-xs text-text-secondary">{{ s.descripcion }}</p></li>
          }
        </ul>
      </div>
    </aside>
    </div>
    }

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
  protected readonly comps = inject(Competitions);
  private readonly toasts = inject(GrToasts);
  protected readonly estado = ESTADO;
  protected readonly ago = fmtAgo;
  protected readonly drawer = signal(false);
  protected readonly current = signal<Seccion | null>(null);
  protected readonly draft = signal<Record<string, unknown>>({});
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly visibles = computed(() => (this.secs.items() ?? []).filter((s) => s.visible).length);
  /** Phone preview: the first visible section as hero (draft texts), then the next three. */
  protected readonly hero = computed(() => {
    const s = (this.secs.items() ?? []).find((x) => x.visible);
    if (!s) return null;
    const b = s.borrador ?? {};
    const t = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : '');
    const cta = b['cta'] as { texto?: string } | undefined;
    return { antetitulo: t('eyebrow') || t('antetitulo'), titulo: t('titulo'), subtitulo: t('subtitulo') || t('fecha'), cta: cta?.texto || t('ctaTexto') || t('cta') || 'Reserva tu entrada gratis' };
  });
  protected readonly resto = computed(() => (this.secs.items() ?? []).filter((x) => x.visible).slice(1, 4));
  protected readonly canEdit = computed(() => this.auth.can(this.comps.current()?.id, 'web.editar'));
  protected readonly canPublish = computed(() => this.auth.can(this.comps.current()?.id, 'web.publicar'));

  protected readonly conflict = signal(false);
  /** Figma 54 «Web · editar hero»: the home hero opens its own editor instead of the drawer. */
  protected readonly heroId = signal('');
  protected readonly heroSec = computed(() => (this.heroId() ? (this.secs.items() ?? []).find((s) => s.id === this.heroId()) ?? null : null));
  protected readonly paginas = PAGINAS;
  protected readonly paginaLabel = computed(() => ({ home: 'la home', publico: '/publico', en: '/en (inglés)' })[this.secs.pagina()]);

  protected cambiar(p: Pagina): void {
    const cid = this.comps.current()?.id;
    if (cid && p !== this.secs.pagina()) void this.secs.load(cid, p);
  }

  protected open(s: Seccion): void {
    if (s.clave === 'hero' && this.secs.pagina() === 'home') {
      this.heroId.set(s.id);
      return;
    }
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
  /** Acceptances recorded under this version (cms forms). */
  aceptaciones: number;
  pedirAceptacion: boolean;
}
interface LegalGroup {
  tipo: string;
  nombre: string;
  ruta: string;
  vigente?: LegalVersion;
  versiones: LegalVersion[];
}

type Linea = { tipo: 'igual' | 'mas' | 'menos'; texto: string };
/** Line diff (LCS) of two texts, ignoring blank lines: Figma «Cambios vX → vY». */
function diffLineas(a: string, b: string): Linea[] {
  const x = a.split('\n').map((l) => l.trim()).filter(Boolean);
  const y = b.split('\n').map((l) => l.trim()).filter(Boolean);
  const m = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) m[i][j] = x[i] === y[j] ? m[i + 1][j + 1] + 1 : Math.max(m[i + 1][j], m[i][j + 1]);
  const out: Linea[] = [];
  let i = 0, j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { out.push({ tipo: 'igual', texto: x[i] }); i++; j++; }
    else if (m[i + 1][j] >= m[i][j + 1]) out.push({ tipo: 'menos', texto: x[i++] });
    else out.push({ tipo: 'mas', texto: y[j++] });
  }
  while (i < x.length) out.push({ tipo: 'menos', texto: x[i++] });
  while (j < y.length) out.push({ tipo: 'mas', texto: y[j++] });
  return out;
}

/** Figma «Web · textos legales»: versioned, immutable once published; changes vX → vY and «Pedir nueva aceptación» on publish. */
@Component({
  selector: 'bo-web-legal',
  imports: [GrBadge, GrButton, GrSkeleton, GrAlert, GrEmpty, BoDrawer, BoSchemaForm, BoToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'pub.set(null)' },
  template: `
    @if (cmp(); as c) {
      <section class="mb-4 rounded-lg border border-line-subtle bg-bg-card p-5" aria-live="polite">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 class="text-ui-h5">Cambios {{ ver(c.de.version) }} → {{ ver(c.a.version) }}</h2>
            <p class="mt-0.5 text-body-xs text-text-tertiary">{{ c.g.nombre }} · {{ c.cambios }} {{ c.cambios === 1 ? 'párrafo modificado' : 'párrafos modificados' }}{{ c.cambios ? ' · se requiere nueva aceptación' : '' }}</p>
          </div>
          <button grButton size="s" variant="ghost" (click)="cmp.set(null)">Cerrar</button>
        </div>
        <ul class="mt-4 flex flex-col gap-1.5">
          @for (l of c.lineas; track $index) {
            <li class="rounded-sm px-3 py-2 text-body-s"
              [class]="l.tipo === 'mas' ? 'bg-success/10 text-text-primary' : l.tipo === 'menos' ? 'bg-danger/10 text-text-secondary line-through' : 'text-text-tertiary'">
              <span class="sr-only">{{ l.tipo === 'mas' ? 'Añadido: ' : l.tipo === 'menos' ? 'Quitado: ' : '' }}</span>{{ l.texto }}</li>
          }
        </ul>
      </section>
    }
    @if (groups() === null) {
      <div class="grid gap-4 md:grid-cols-2">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-40 rounded-lg" /> }</div>
    } @else {
      <div class="grid gap-4 md:grid-cols-2">
        @for (g of groups(); track g.tipo) {
          <section class="flex flex-col rounded-lg border border-line-subtle bg-bg-card p-5">
            <div class="flex items-start justify-between gap-3">
              <div><h2 class="text-ui-h5">{{ g.nombre }}</h2><p class="mt-0.5 text-mono-xs text-text-tertiary">{{ g.ruta }}</p></div>
              @if (g.vigente) { <gr-badge tone="success">{{ ver(g.vigente.version) }}</gr-badge> } @else { <gr-badge tone="warning">Sin publicar</gr-badge> }
            </div>
            <ul class="mt-4 flex flex-1 flex-col gap-2">
              @for (v of g.versiones.slice(0, 3); track v.id) {
                <li class="flex items-center justify-between gap-3 rounded-sm border border-line-subtle bg-bg-surface px-3 py-2">
                  <span class="flex min-w-0 items-baseline gap-2"><span class="text-mono-s">{{ ver(v.version) }}</span><span class="text-body-xs text-text-tertiary">{{ v.publicadoAt ? (v.id === g.vigente?.id ? 'publicada ' : 'archivada · ') + date(v.publicadoAt) + ' · ' + v.aceptaciones + ' aceptaciones' : 'borrador' }}</span></span>
                  @if (anterior(g, v); as de) { <button grButton size="s" variant="ghost" (click)="comparar(g, de, v)">Comparar</button> }
                  @if (!v.publicadoAt && canEdit()) { <button grButton size="s" (click)="edit(g, v)">Editar</button> }
                  @if (!v.publicadoAt && canPublish()) { <button grButton size="s" variant="primary" (click)="pedir.set(true); pub.set({ g, v })">Publicar</button> }
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
    @if (pub(); as p) {
      <div class="fixed inset-0 z-40 bg-black/60" (click)="pub.set(null)"></div>
      <div class="fixed top-1/2 left-1/2 z-50 w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line-strong bg-bg-card p-6 shadow-card" role="dialog" aria-modal="true" aria-labelledby="legal-pub-t">
        <h2 id="legal-pub-t" class="text-ui-h5">Publicar {{ p.g.tipo }} {{ ver(p.v.version) }}</h2>
        <p class="mt-3 text-body-s text-text-secondary">La web mostrará la nueva versión al momento.
          @if (p.g.vigente) { Las {{ p.g.vigente.aceptaciones }} aceptaciones de {{ ver(p.g.vigente.version) }} se conservan como prueba; }
          @if (pedir()) { cada persona aceptará {{ ver(p.v.version) }} en su próxima reserva o compra. } No se envía email masivo.</p>
        <div class="mt-5 flex items-center justify-between gap-4">
          <div><p class="text-label-s">Pedir nueva aceptación</p><p class="text-body-xs text-text-tertiary">En la próxima reserva, compra o acceso al área del atleta</p></div>
          <bo-toggle [value]="pedir()" label="Pedir nueva aceptación" (changed)="pedir.set($event)" />
        </div>
        <div class="mt-6 flex justify-end gap-2">
          <button grButton variant="ghost" (click)="pub.set(null)">Cancelar</button>
          <button grButton variant="primary" [loading]="publishing()" (click)="publish(p.g, p.v)">Publicar versión</button>
        </div>
      </div>
    }
  `,
})
export class WebLegalTab {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly comps = inject(Competitions);
  private readonly toasts = inject(GrToasts);
  protected readonly groups = signal<LegalGroup[] | null>(null);
  protected readonly cmp = signal<{ g: LegalGroup; de: LegalVersion; a: LegalVersion; lineas: Linea[]; cambios: number } | null>(null);
  protected readonly pub = signal<{ g: LegalGroup; v: LegalVersion } | null>(null);
  protected readonly pedir = signal(true);
  protected readonly publishing = signal(false);
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

  /** «v2026-11», but «whatsapp-2026-11»: a version that names itself does not need the prefix. */
  protected ver(version: string): string {
    return /^\d/.test(version) ? 'v' + version : version;
  }

  /** The version a draft is compared with: the one in force; for published ones, the previous published one. */
  protected anterior(g: LegalGroup, v: LegalVersion): LegalVersion | undefined {
    if (!v.publicadoAt) return g.vigente;
    return g.versiones.filter((x) => x.publicadoAt && x.publicadoAt < v.publicadoAt!).sort((a, b) => b.publicadoAt!.localeCompare(a.publicadoAt!))[0];
  }
  protected comparar(g: LegalGroup, de: LegalVersion, a: LegalVersion): void {
    const lineas = diffLineas(de.contenido, a.contenido);
    this.cmp.set({ g, de, a, lineas, cambios: Math.max(lineas.filter((l) => l.tipo === 'mas').length, lineas.filter((l) => l.tipo === 'menos').length) });
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
    this.publishing.set(true);
    try {
      await firstValueFrom(this.http.post(`${this.base()}/${g.tipo}/versiones/${v.id}/publicar`, { pedirAceptacion: this.pedir() }));
      this.pub.set(null);
      this.cmp.set(null);
      this.toasts.success('Versión publicada');
      await this.load();
    } catch (e) {
      this.toasts.error('No se pudo publicar', errText(e));
    } finally {
      this.publishing.set(false);
    }
  }
}

/** «20/06 10:00» (Figma «Web · blog y galería»), «—» without a date. */
const fechaCorta = (v: unknown): string => {
  if (!v) return '—';
  const d = new Date(String(v));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
/** A published post with a future date is «Programada». */
const estadoBlog = (r: Record<string, unknown>): { label: string; tone: GrTone } =>
  !r['publicada'] ? { label: 'Borrador', tone: 'neutral' } : r['publicarAt'] && new Date(String(r['publicarAt'])) > new Date() ? { label: 'Programada', tone: 'info' } : { label: 'Publicada', tone: 'success' };

/** Collections configured from the CMS API (Figma «Web · FAQ», «patrocinadores», «SEO», «blog y galería»). */
export const COLLECTIONS: Record<string, CollectionConfig[]> = {
  faq: [{
    title: 'Preguntas frecuentes', subtitle: 'Las destacadas aparecen en la home', path: '/web/faq', item: 'pregunta', femenino: true, reorder: true, filterBy: 'categoria', filterStyle: 'select', publishKey: 'publicada',
    columns: [{ key: 'pregunta', label: 'Pregunta' }, { key: 'categoria', label: 'Categoría', hideMobile: true }, { key: 'destacada', label: 'Home', kind: 'badge', value: (r) => (r['destacada'] ? 'Destacada' : '—'), tone: (r) => (r['destacada'] ? 'accent' : 'neutral'), hideMobile: true },
      { key: 'publicada', label: 'Estado', kind: 'badge', value: (r) => (r['publicada'] ? 'Publicada' : 'Borrador'), tone: (r) => (r['publicada'] ? 'success' : 'neutral') }],
    fields: [{ clave: 'pregunta', etiqueta: 'Pregunta', tipo: 'texto', max: 90 }, { clave: 'respuesta', etiqueta: 'Respuesta', tipo: 'markdown', max: 600, ayuda: 'Admite negrita y enlaces' },
      { clave: 'categoria', etiqueta: 'Categoría', tipo: 'select', ancho: 'mitad', opciones: ['General', 'Entradas', 'Competición', 'Atletas', 'Sorteo', 'Llegar', 'Accesibilidad'].map((v) => ({ value: v, label: v })),
        aviso: (v) => (v === 'Sorteo' ? 'Aviso legal: lo que digas del sorteo debe coincidir con las bases publicadas (/politica-concurso).' : null) },
      { clave: 'destacada', etiqueta: 'Destacar en la home', tipo: 'bool', ayuda: 'Aparece en «Preguntas frecuentes» de la home' }],
    defaults: { categoria: 'General', publicada: true, destacada: false },
    empty: { title: 'Sin preguntas', text: 'Añade las dudas más habituales: entradas, horarios, sorteo, cómo llegar.' },
  }],
  clubs: [{
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
      title: 'SEO por ruta', subtitle: 'Title y description que ve Google', path: '/web/seo', item: 'ruta', femenino: true,
      columns: [{ key: 'ruta', label: 'URL', kind: 'mono' }, { key: 'title', label: 'Title', kind: 'meter', max: 60, hideMobile: true },
        { key: 'description', label: 'Description', kind: 'meter', max: 160, hideMobile: true },
        { key: 'indexable', label: 'Índice', kind: 'badge', value: (r) => (r['indexable'] ? 'Index' : 'Noindex'), tone: (r) => (r['indexable'] ? 'success' : 'neutral') },
        { key: 'imagenUrl', label: 'Imagen social', kind: 'badge', value: (r) => (r['imagenUrl'] ? 'OK' : 'Falta'), tone: (r) => (r['imagenUrl'] ? 'success' : 'warning'), hideMobile: true }],
      fields: [{ clave: 'ruta', etiqueta: 'Ruta', tipo: 'texto', ayuda: 'Empieza por /' }, { clave: 'title', etiqueta: 'Title', tipo: 'texto', max: 70 }, { clave: 'description', etiqueta: 'Description', tipo: 'area', max: 170 },
        { clave: 'imagenUrl', etiqueta: 'Imagen para redes', tipo: 'imagen', ayuda: '1200 × 630' }, { clave: 'indexable', etiqueta: 'Indexable en buscadores', tipo: 'bool' }],
      defaults: { indexable: true },
      empty: { title: 'Sin SEO a medida', text: 'Las páginas usan textos automáticos hasta que los definas aquí.' },
    },
    {
      title: 'Redirecciones 301', subtitle: 'Enlaces antiguos que llevan a la página nueva', path: '/web/redirecciones', item: 'redirección', femenino: true,
      columns: [{ key: 'desde', label: 'Desde', kind: 'mono' }, { key: 'hacia', label: 'Hacia', kind: 'mono' }, { key: 'codigo', label: 'Código', kind: 'badge', hideMobile: true }],
      fields: [{ clave: 'desde', etiqueta: 'Desde', tipo: 'texto', ayuda: '/ruta-antigua', ancho: 'mitad',
        aviso: (v) => (RUTAS_PUBLICAS.has(v.trim().toLowerCase().replace(/(.)\/+$/, '$1')) ? 'Es una página de la web: la redirección la tapará.' : null) }, { clave: 'hacia', etiqueta: 'Hacia', tipo: 'texto', ayuda: '/ruta-nueva o https://…', ancho: 'mitad' },
        { clave: 'codigo', etiqueta: 'Tipo', tipo: 'select', opciones: [{ value: 301, label: '301 · permanente' }, { value: 302, label: '302 · temporal' }] }],
      defaults: { codigo: 301 },
      empty: { title: 'Sin redirecciones', text: 'Útiles al cambiar de dominio o de ruta.' },
    },
    {
      title: 'Páginas de contenido', subtitle: 'Reglamento, categorías, marcas mínimas… (/{slug})', path: '/web/paginas', item: 'página', femenino: true, reorder: true,
      columns: [{ key: 'titulo', label: 'Página' }, { key: 'slug', label: 'Ruta', kind: 'mono', value: (r) => '/' + r['slug'] }, { key: 'publicada', label: 'Estado', kind: 'badge', value: (r) => (r['publicada'] ? 'Publicada' : 'Borrador'), tone: (r) => (r['publicada'] ? 'success' : 'neutral') }],
      fields: [{ clave: 'titulo', etiqueta: 'Título', tipo: 'texto', max: 140 }, { clave: 'slug', etiqueta: 'Ruta', tipo: 'texto', ayuda: 'Minúsculas y guiones', ancho: 'mitad' }, { clave: 'portadaUrl', etiqueta: 'Portada', tipo: 'imagen' },
        { clave: 'resumen', etiqueta: 'Resumen', tipo: 'area', max: 300 }, { clave: 'cuerpo', etiqueta: 'Contenido', tipo: 'markdown' }, { clave: 'publicada', etiqueta: 'Publicada', tipo: 'bool' }],
      defaults: { publicada: false },
      empty: { title: 'Sin páginas', text: 'Crea páginas como el reglamento o las categorías de peso.' },
    },
  ],
  blog: [
    {
      title: 'Blog', subtitle: 'Noticias de la competición', path: '/web/blog', item: 'entrada', femenino: true,
      columns: [{ key: 'titulo', label: 'Artículo' }, { key: 'publicarAt', label: 'Fecha', kind: 'mono', value: (r) => fechaCorta(r['publicarAt'] ?? r['publicadaAt']), hideMobile: true },
        { key: 'publicada', label: 'Estado', kind: 'badge', value: (r) => estadoBlog(r).label, tone: (r) => estadoBlog(r).tone }],
      fields: [{ clave: 'titulo', etiqueta: 'Título', tipo: 'texto', max: 140 }, { clave: 'slug', etiqueta: 'Ruta', tipo: 'texto', ayuda: '/blog/{ruta}', ancho: 'mitad' }, { clave: 'publicarAt', etiqueta: 'Programar publicación', tipo: 'fecha', ancho: 'mitad' },
        { clave: 'categoria', etiqueta: 'Categoría', tipo: 'select', ancho: 'mitad', opciones: [['', 'Sin categoría'], ['noticias', 'Noticias'], ['calendario', 'Calendario'], ['guia', 'Guía'], ['normativa', 'Normativa'], ['marcas', 'Marcas'], ['cronica', 'Crónica'], ['entrenamiento', 'Entrenamiento']].map(([value, label]) => ({ value, label })) },
        { clave: 'fuente', etiqueta: 'Fuente', tipo: 'texto', max: 200, ancho: 'mitad', ayuda: 'Línea bajo el título, p. ej. «Calendario de competiciones AEP 2026»' },
        { clave: 'portadaUrl', etiqueta: 'Portada', tipo: 'imagen' }, { clave: 'resumen', etiqueta: 'Resumen', tipo: 'area', max: 300 }, { clave: 'cuerpo', etiqueta: 'Contenido', tipo: 'markdown', ayuda: 'Cajas: «> [!resumen] En resumen», «> [!dato] Título», «> [!importante] Título» (también consejo y aviso)' }, { clave: 'publicada', etiqueta: 'Publicada', tipo: 'bool' }],
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
  mapas: [{
    title: 'Mapas de acceso', subtitle: 'Planos para atletas y público de /mapa-de-accesos, en este orden (arrastra para ordenar)', path: '/web/mapas', item: 'mapa', reorder: true,
    columns: [{ key: 'imagenUrl', label: 'Imagen', kind: 'image' }, { key: 'titulo', label: 'Título', value: (r) => String(r['titulo'] || 'Sin título') }, { key: 'subtitulo', label: 'Subtítulo', hideMobile: true }],
    fields: [{ clave: 'imagenUrl', etiqueta: 'Imagen', tipo: 'imagen', subida: '/web/mapas/imagen', ayuda: 'JPG, PNG o WebP de hasta 10 MB. Se publica en el CDN.' },
      { clave: 'titulo', etiqueta: 'Título (opcional)', tipo: 'texto', max: 120 }, { clave: 'subtitulo', etiqueta: 'Subtítulo (opcional)', tipo: 'texto', max: 160 },
      { clave: 'descripcion', etiqueta: 'Descripción (opcional)', tipo: 'area', max: 1000 }],
    empty: { title: 'Sin mapas', text: 'Sube los planos de acceso al pabellón para atletas y público.' },
  }],
};

/** A tab made of one or more collections (route param `coleccion`). */
@Component({
  selector: 'bo-web-collections',
  imports: [BoCollection, WebSponsorsTab, WebSeoExtra],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-6' },
  template: `
    @if (coleccion() === 'patrocinadores') { <bo-web-sponsors /> }
    @for (c of configs(); track c.path; let first = $first) {
      <bo-collection [config]="c" />
      @if (first && coleccion() === 'seo') { <bo-web-seo-extra /> }
    } @empty { @if (coleccion() !== 'patrocinadores') { <p class="text-body-s text-text-tertiary">Sección desconocida.</p> } }
  `,
})
export class WebCollectionsTab {
  readonly coleccion = input('');
  protected readonly configs = computed(() => COLLECTIONS[this.coleccion()] ?? []);
}

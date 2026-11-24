import { textoError } from '../core/errores';
import { ChangeDetectionStrategy, Component, ElementRef, PLATFORM_ID, PendingTasks, DestroyRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrIcon, GrSkeleton, GrSelect } from '@grcup/ui';
import { AtletasPublic, Favoritos, cat, hora, iniciales, kg, type AtletaPub, type FichaPub, type ListaPub, type Participantes } from '../core/atletas';
import { Cms } from '../core/cms';
import { COMPETITION_SLUG, Competition, FalloApi } from '../core/competition';
import { FanSession } from '../core/fan';
import { ICS_URL } from '../core/horarios';
import { DivisionPipe, I18n, LocPipe, divisionEn } from '../core/i18n';
import { Seo } from '../core/seo';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';

const sexoTxt = { F: 'Femenino', M: 'Masculino' };

const T = {
  es: {
    seguir: (on: boolean, n: string) => (on ? 'Dejar de seguir a ' : 'Seguir a ') + n,
    sexoTxt, titulo: 'Los atletas de la', crumb: 'Atletas', comp: 'Competición 2026', buscar: 'Buscar atleta', ph: 'Nombre o club', borrar: 'Borrar búsqueda',
    filtros: 'Filtros', sexo: 'Sexo', categoria: 'Categoría', club: 'Club', division: 'División', orden: 'Orden', todas: 'Todas', todos: 'Todos', sinCat: 'Sin categoría',
    oHorario: 'horario', oNombre: 'nombre', oCat: 'categoría', mis: 'Mis atletas', atletas: 'atletas', mh: 'mujeres · hombres', clubs: 'clubs', cargando: 'Cargando atletas',
    falloT: 'No hemos podido cargar los atletas', falloD: 'Estamos teniendo un problema temporal. Vuelve a intentarlo en unos minutos.', reintentar: 'Reintentar',
    ninguno: (q: string) => 'Ningún atleta coincide' + (q ? ' con "' + q + '"' : ''), ningunoD: 'Prueba con el apellido o el club. Si compites y no apareces, revisa tu alta en el área de atleta.',
    quitar: 'Quitar filtros', independiente: 'Independiente', porPublicar: 'Horario por publicar', mostrando: (a: number, b: number) => 'Mostrando ' + a + ' de ' + b, mas24: 'Cargar 24 más',
    compites: '¿Compites? Completa tu perfil', compitesD: 'Entra con el email con el que te inscribiste: sube tu foto, revisa tu club y añade tus mejores marcas y alturas de rack para agilizar el pesaje.',
    area: 'Área de atleta', eyebrowDir: 'En directo · Comunidad', vive: 'Vive la GRS Cup 2 ', enDirecto: 'en directo', viveD: 'Sigue cada intento en tiempo real y participa en el chat, la porra y el fantasy con el resto del público.',
    verDirecto: 'Ver en directo', participa: 'Participa', porra: 'Porra',
    rel: [{ titulo: 'Horarios en directo', texto: 'Horarios por hora', ruta: '/horarios' }, { titulo: 'Categorías de peso', texto: 'Pesos y divisiones', ruta: '/categorias-de-peso' }, { titulo: 'Entradas', texto: 'Gratis con reserva', ruta: '/entradas' }] as RelatedLink[],
    seoT: 'Atletas · GRS Cup 2', seoD: (n: number | string) => 'Los ' + n + ' atletas de la GRS Cup 2: categoría, club y horario de cada uno.',
  },
  en: {
    seguir: (on: boolean, n: string) => (on ? 'Unfollow ' : 'Follow ') + n,
    sexoTxt: { F: 'Women', M: 'Men' }, titulo: 'The athletes of the', crumb: 'Athletes', comp: '2026 competition', buscar: 'Search athlete', ph: 'Name or club', borrar: 'Clear search',
    filtros: 'Filters', sexo: 'Sex', categoria: 'Class', club: 'Club', division: 'Division', orden: 'Sort', todas: 'All', todos: 'All', sinCat: 'No class',
    oHorario: 'schedule', oNombre: 'name', oCat: 'class', mis: 'My athletes', atletas: 'athletes', mh: 'women · men', clubs: 'clubs', cargando: 'Loading athletes',
    falloT: 'We couldn’t load the athletes', falloD: 'We’re having a temporary problem. Please try again in a few minutes.', reintentar: 'Try again',
    ninguno: (q: string) => 'No athlete matches' + (q ? ' "' + q + '"' : ''), ningunoD: 'Try the surname or the club. If you’re competing and don’t appear, check your registration in the athlete area.',
    quitar: 'Clear filters', independiente: 'Independent', porPublicar: 'Schedule to be published', mostrando: (a: number, b: number) => 'Showing ' + a + ' of ' + b, mas24: 'Load 24 more',
    compites: 'Competing? Complete your profile', compitesD: 'Sign in with the email you registered with: upload your photo, check your club and add your best lifts and rack heights to speed up the weigh-in.',
    area: 'Athlete area', eyebrowDir: 'Live · Community', vive: 'Experience GRS Cup 2 ', enDirecto: 'live', viveD: 'Follow every attempt in real time and join the chat, the predictions and the fantasy with the rest of the crowd.',
    verDirecto: 'Watch live', participa: 'Take part', porra: 'Predictions',
    rel: [{ titulo: 'Live schedule', texto: 'Schedule by time', ruta: '/horarios' }, { titulo: 'Weight classes', texto: 'Weights and divisions', ruta: '/categorias-de-peso' }, { titulo: 'Tickets', texto: 'Free with booking', ruta: '/entradas' }] as RelatedLink[],
    seoT: 'Athletes · GRS Cup 2', seoD: (n: number | string) => 'The ' + n + ' athletes of GRS Cup 2: class, club and schedule for each one.',
  },
};

/** Star button: follows an athlete on this device (personal schedule). */
@Component({
  selector: 'gr-fav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="$event.preventDefault(); $event.stopPropagation(); fav.seguir(slug())" [attr.aria-pressed]="on()" [attr.aria-label]="t().seguir(on(), nombre())"
      class="flex size-11 items-center justify-center rounded-full transition-colors" [class]="plano() ? (on() ? 'text-accent-text' : 'text-text-tertiary hover:text-text-primary') : on() ? 'bg-accent text-white shadow-glow' : 'bg-black/40 text-white backdrop-blur hover:bg-black/60'">
      <svg viewBox="0 0 24 24" [attr.width]="plano() ? 16 : 18" [attr.height]="plano() ? 16 : 18" [attr.fill]="on() ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></svg>
    </button>
  `,
})
export class Fav {
  readonly slug = input.required<string>();
  readonly nombre = input('');
  /** Bare star (Figma flight lists): no disc, 16 px, the 44 px hit area stays. */
  readonly plano = input(false);
  protected readonly fav = inject(Favoritos);
  protected readonly t = inject(I18n).dict(T);
  protected readonly on = computed(() => this.fav.slugs().includes(this.slug()));
}

// ============================================================ /atletas ===

/** /atletas (Figma page 39): search, filters, athlete cards (list grouped by class on mobile), load more. */
@Component({
  selector: 'gr-atletas-page',
  imports: [RouterLink, LocPipe, DivisionPipe, GrSelect, Page, FormsModule, GrAlert, GrIcon, GrButton, GrSkeleton, Fav, Related],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = lista();
    <gr-page [title]="t().titulo" accent="GRS Cup 2" [crumb]="t().crumb" [migasMovil]="!vacioMovil()">
      <p class="sr-only">{{ t().comp }}</p>

      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <label class="relative min-w-0 flex-1 lg:max-w-[400px]">
            <span class="sr-only">{{ t().buscar }}</span>
            <gr-icon name="search" [size]="18" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
            <input type="search" [placeholder]="t().ph" [ngModel]="q()" (ngModelChange)="q.set($event); limite.set(24)"
              class="h-12 w-full rounded-md border border-line-strong bg-bg-field pr-11 pl-10 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none [&::-webkit-search-cancel-button]:hidden" />
            @if (q()) { <button type="button" (click)="q.set(''); limite.set(24)" [attr.aria-label]="t().borrar" class="absolute top-1/2 right-2.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-text-tertiary hover:bg-white/15 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent-text"><gr-icon name="x" [size]="14" /></button> }
          </label>
          <button type="button" class="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-pill border border-line-strong px-3.5 text-label-s md:hidden" (click)="filtros.set(!filtros())" [attr.aria-expanded]="filtros()">
            <gr-icon name="sliders" [size]="14" />{{ t().filtros }}@if (nFiltros()) { <span class="text-accent-text">· {{ nFiltros() }}</span> }
          </button>
        </div>
        <div class="flex-wrap gap-2" [class]="filtros() ? 'flex' : 'hidden md:flex'">
          <gr-select tipo="filtro" [etiqueta]="t().sexo" [attr.aria-label]="t().sexo" [ngModel]="sexo()" (ngModelChange)="sexo.set($event); limite.set(24)">
            @for (s of sexos(); track s.v) { <option [value]="s.v">{{ s.label }}</option> }
          </gr-select>
          <gr-select tipo="filtro" [etiqueta]="t().categoria" [attr.aria-label]="t().categoria" [ngModel]="categoria()" (ngModelChange)="categoria.set($event); limite.set(24)">
            <option value="">{{ t().todas }}</option>@for (c of categorias(); track c) { <option [value]="c">{{ c.slice(2) ? c[0] + ' ' + cat(c.slice(2)) + ' kg' : t().sinCat }}</option> }
          </gr-select>
          <gr-select tipo="filtro" [etiqueta]="t().club" [attr.aria-label]="t().club" class="max-w-64" [ngModel]="club()" (ngModelChange)="club.set($event); limite.set(24)">
            <option value="">{{ t().todos }}</option>@for (c of clubs(); track c) { <option [value]="c">{{ c }}</option> }
          </gr-select>
          <gr-select tipo="filtro" [etiqueta]="t().division" [attr.aria-label]="t().division" class="md:max-lg:hidden" [ngModel]="division()" (ngModelChange)="division.set($event); limite.set(24)">
            <option value="">{{ t().todas }}</option>@for (d of divisiones(); track d) { <option [value]="d">{{ d | division }}</option> }
          </gr-select>
          <gr-select tipo="filtro" [etiqueta]="t().orden" [resaltar]="false" [attr.aria-label]="t().orden" class="md:max-lg:hidden" [ngModel]="orden()" (ngModelChange)="orden.set($event)">
            <option value="horario">{{ t().oHorario }}</option><option value="nombre">{{ t().oNombre }}</option><option value="categoria">{{ t().oCat }}</option>
          </gr-select>
          @if (fav.slugs().length) {
            <button type="button" (click)="soloFav.set(!soloFav())" [attr.aria-pressed]="soloFav()" class="inline-flex h-11 items-center gap-1.5 rounded-pill border px-3 text-label-s pointer-fine:h-10" [class]="soloFav() ? 'border-accent-text bg-accent-deep/40' : 'border-line-strong'">
              {{ t().mis }} · {{ fav.slugs().length }}
            </button>
          }
        </div>
      </div>

      @if (l) {
        <ul class="mt-[88px] hidden grid-cols-3 gap-2 md:grid lg:gap-4">
          <li class="rounded-md border border-line-subtle bg-bg-card px-4 py-[18px]"><p class="text-ui-h3">{{ l.resumen.total }}</p><p class="text-body-xs text-text-tertiary">{{ t().atletas }}</p></li>
          <li class="rounded-md border border-line-subtle bg-bg-card px-4 py-[18px]"><p class="text-ui-h3">{{ l.resumen.mujeres }} · {{ l.resumen.hombres }}</p><p class="text-body-xs text-text-tertiary">{{ t().mh }}</p></li>
          <li class="rounded-md border border-line-subtle bg-bg-card px-4 py-[18px]"><p class="text-ui-h3">{{ l.resumen.clubs }}</p><p class="text-body-xs text-text-tertiary">{{ t().clubs }}</p></li>
        </ul>
      }

      @if (l === undefined) {
        <div class="mt-6 grid grid-cols-1 gap-4 md:mt-20 md:grid-cols-2 lg:grid-cols-4" aria-busy="true" [attr.aria-label]="t().cargando">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-4"><gr-skeleton class="size-10 rounded-sm" /><gr-skeleton class="h-3 w-1/2" /><gr-skeleton class="h-3 w-full" /><gr-skeleton class="h-3 w-4/5" /></div>
          }
        </div>
      } @else if (error()) {
        <div class="mt-8 flex flex-col items-start gap-4"><gr-alert tone="warning" [title]="t().falloT">{{ t().falloD }}</gr-alert><button grButton icon="refresh" (click)="cargar()">{{ t().reintentar }}</button></div>
      } @else if (!filtrados().length) {
        <div class="mt-[-5px] flex flex-col items-center gap-3 py-8 text-center md:mt-12" role="status">
          <gr-icon name="search" [size]="28" class="text-text-tertiary" />
          <p class="text-ui-h5">{{ t().ninguno(q()) }}</p>
          <p class="max-w-sm text-body-s text-text-tertiary">{{ t().ningunoD }}</p>
          <button grButton (click)="limpiar()">{{ t().quitar }}</button>
        </div>
      } @else {
        <!-- Desktop / tablet: cards -->
        <ul class="mt-20 hidden grid-cols-2 gap-4 md:grid lg:grid-cols-4">
          @for (a of visibles(); track a.slug) {
            <li>
              <a [routerLink]="'/atletas/' + a.slug | loc" class="group relative flex h-full flex-col overflow-hidden rounded-lg border bg-bg-card transition-colors hover:border-line-strong" [class]="fav.slugs().includes(a.slug) ? 'border-accent/60' : 'border-line-subtle'">
                <span class="relative block aspect-[4/3] overflow-hidden bg-[linear-gradient(160deg,#3a0f17,#171213)]">
                  @if (a.fotoUrl) { <img [src]="a.fotoUrl" [alt]="a.nombre + ' ' + a.apellidos" class="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" [style.object-position]="a.focalX + '% ' + a.focalY + '%'" loading="lazy" /> }
                  @else { <span class="absolute inset-0 flex items-center justify-center font-display text-[64px] text-white/90 italic">{{ ini(a) }}</span> }
                  <span class="absolute top-3 right-3"><gr-fav [slug]="a.slug" [nombre]="a.nombre" /></span>
                </span>
                <span class="flex flex-1 flex-col p-4">
                  <span class="text-label-m">{{ a.nombre }} {{ a.apellidos }}</span>
                  <span class="mt-1.5 text-body-xs text-text-tertiary">{{ a.club || t().independiente }}{{ a.ciudad ? ' · ' + a.ciudad : '' }}</span>
                  <span class="mt-3 mb-3 flex flex-wrap gap-1.5">
                    <span class="inline-flex h-6 items-center rounded-pill border border-accent/50 bg-accent/10 px-2 text-label-xs text-accent-text">{{ a.categoria.trim() ? a.sexo + ' ' + cat(a.categoria) + ' kg' : t().sinCat }}</span>
                    @if (a.divisionNombre) { <span class="inline-flex h-6 items-center rounded-pill border border-line-strong bg-white/5 px-2 text-label-xs text-text-tertiary">{{ a.divisionNombre | division }}</span> }
                  </span>
                  <span class="mt-auto flex items-center gap-1.5 border-t border-line-subtle pt-3 text-body-xs text-text-secondary"><gr-icon name="clock" [size]="12" />{{ a.horaInicio ? hora(a.horaInicio) : t().porPublicar }}</span>
                </span>
              </a>
            </li>
          }
        </ul>
        <!-- Mobile: list grouped by class -->
        <div class="mt-6 flex flex-col gap-5 md:hidden">
          @for (g of grupos(); track g.titulo) {
            <section>
              <h2 class="text-label-xs text-text-muted">{{ g.titulo }}</h2>
              <ul class="mt-2 flex flex-col">
                @for (a of g.items; track a.slug) {
                  <li class="border-b border-line-subtle last:border-0">
                    <a [routerLink]="'/atletas/' + a.slug | loc" class="flex min-h-16 items-center gap-3 py-2.5">
                      @if (a.fotoUrl) { <img [src]="a.fotoUrl" [alt]="a.nombre + ' ' + a.apellidos" class="size-11 shrink-0 rounded-full object-cover" [style.object-position]="a.focalX + '% ' + a.focalY + '%'" loading="lazy" /> }
                      @else { <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-deep/50 text-label-m">{{ ini(a) }}</span> }
                      <span class="min-w-0 flex-1"><span class="block text-label-m break-words">{{ a.nombre }} {{ a.apellidos }}</span><span class="line-clamp-2 block text-body-xs text-text-tertiary">{{ a.club || t().independiente }} · {{ a.categoria.trim() ? a.sexo + ' ' + cat(a.categoria) + ' kg' : t().sinCat }}{{ a.divisionNombre ? ' · ' + (a.divisionNombre | division) : '' }}</span></span>
                      <span class="font-mono text-[13px] text-text-secondary">{{ a.horaInicio ? hora(a.horaInicio) : '' }}</span>
                      <gr-fav [slug]="a.slug" [nombre]="a.nombre" />
                    </a>
                  </li>
                }
              </ul>
            </section>
          }
        </div>
        <div class="mt-12 flex flex-col items-center gap-3 md:mt-16">
          <p class="text-body-s text-text-tertiary">{{ t().mostrando(visibles().length, filtrados().length) }}</p>
          @if (visibles().length < filtrados().length) { <button grButton (click)="limite.set(limite() + 24)">{{ t().mas24 }}</button> }
        </div>
      }

      <div class="mt-18 flex flex-col gap-18 md:mt-24 md:gap-24">
        <section class="flex flex-col gap-4 rounded-xl border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_60%)] p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div><h2 class="text-ui-h5">{{ t().compites }}</h2><p class="mt-1 text-body-s text-text-secondary">{{ t().compitesD }}</p></div>
          <a grButton iconRight="arrow-right" [routerLink]="'/area-atleta' | loc" class="shrink-0">{{ t().area }}</a>
        </section>
        <gr-related [items]="t().rel" />
        <!-- Figma «Vive la GRS Cup 2 en directo»: replaces the Instagram band on /atletas -->
        <section class="flex flex-col gap-4 rounded-xl border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_60%)] p-5 md:p-8">
          <p class="text-label-xs text-text-tertiary uppercase">{{ t().eyebrowDir }}</p>
          <h2 class="text-display-xs md:text-display-m">{{ t().vive }}<span class="whitespace-nowrap text-accent-text">{{ t().enDirecto }}</span></h2>
          <p class="text-body-m text-text-secondary">{{ t().viveD }}</p>
          <a grButton variant="primary" size="l" [routerLink]="'/en-directo' | loc" iconRight="arrow-right" class="w-full md:w-auto md:self-start">{{ t().verDirecto }}</a>
          <nav class="grid grid-cols-3 gap-2 md:flex" [attr.aria-label]="t().participa">
            <a [routerLink]="'/en-directo' | loc" class="inline-flex h-11 items-center justify-center rounded-pill border border-line-strong px-4 text-label-s hover:bg-white/5">Chat</a>
            <a [routerLink]="'/porra' | loc" class="inline-flex h-11 items-center justify-center rounded-pill border border-line-strong px-4 text-label-s hover:bg-white/5">{{ t().porra }}</a>
            <a [routerLink]="'/fantasy' | loc" class="inline-flex h-11 items-center justify-center rounded-pill border border-line-strong px-4 text-label-s hover:bg-white/5">Fantasy</a>
          </nav>
        </section>
      </div>
    </gr-page>
  `,
})
export class AtletasPage {
  private readonly api = inject(AtletasPublic);
  protected readonly fav = inject(Favoritos);
  private readonly lang = inject(I18n).lang;
  protected readonly t = inject(I18n).dict(T);
  protected readonly cat = cat;
  protected readonly hora = (iso?: string) => hora(iso, this.lang());
  protected readonly sexoTxt = sexoTxt;
  protected readonly ini = iniciales;
  protected readonly lista = signal<ListaPub | null | undefined>(undefined);
  protected readonly error = signal(false);
  protected readonly q = signal('');
  protected readonly sexo = signal<'' | 'F' | 'M'>('');
  protected readonly categoria = signal('');
  protected readonly club = signal('');
  protected readonly division = signal('');
  protected readonly orden = signal<'horario' | 'nombre' | 'categoria'>('horario');
  protected readonly soloFav = signal(false);
  protected readonly filtros = signal(false);
  protected readonly limite = signal(24);
  protected readonly sexos = computed(() => [{ v: '' as const, label: this.t().todos }, { v: 'F' as const, label: this.t().sexoTxt.F }, { v: 'M' as const, label: this.t().sexoTxt.M }]);
  protected readonly nFiltros = computed(() => [this.sexo(), this.categoria(), this.club(), this.division()].filter(Boolean).length + (this.soloFav() ? 1 : 0));
  protected readonly categorias = computed(() => [...new Set((this.lista()?.atletas ?? []).map((a) => a.sexo + ' ' + a.categoria.trim()))].sort(catSort));
  protected readonly clubs = computed(() => [...new Set((this.lista()?.atletas ?? []).map((a) => a.club).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')));
  protected readonly divisiones = computed(() => [...new Set((this.lista()?.atletas ?? []).map((a) => a.divisionNombre))]);
  protected readonly filtrados = computed(() => {
    const q = norm(this.q());
    const list = (this.lista()?.atletas ?? []).filter((a) =>
      (!this.sexo() || a.sexo === this.sexo()) && (!this.categoria() || a.sexo + ' ' + a.categoria.trim() === this.categoria()) && (!this.club() || a.club === this.club()) &&
      (!this.division() || a.divisionNombre === this.division()) && (!this.soloFav() || this.fav.slugs().includes(a.slug)) && (!q || norm(`${a.nombre} ${a.apellidos} ${a.club}`).includes(q)));
    const o = this.orden();
    if (o === 'nombre') return [...list].sort((a, b) => (a.apellidos + a.nombre).localeCompare(b.apellidos + b.nombre, 'es'));
    if (o === 'categoria') return [...list].sort((a, b) => catSort(a.sexo + ' ' + a.categoria, b.sexo + ' ' + b.categoria) || a.apellidos.localeCompare(b.apellidos, 'es'));
    return list; // the API already sorts by start time, then class
  });
  private readonly movil = signal(false);
  protected readonly vacioMovil = computed(() => this.movil() && !!this.q() && !!this.lista() && !this.filtrados().length);
  protected readonly visibles = computed(() => this.filtrados().slice(0, this.limite()));
  protected readonly grupos = computed(() => {
    const out: { titulo: string; items: AtletaPub[] }[] = [];
    for (const a of this.visibles()) {
      const tx = this.t();
      const catTxt = a.categoria.trim() ? `${tx.sexoTxt[a.sexo]} ${cat(a.categoria)} kg` : `${tx.sexoTxt[a.sexo]} · ${tx.sinCat}`;
      const t = catTxt;
      const g = out.at(-1);
      if (g && g.titulo === t) g.items.push(a);
      else out.push({ titulo: t, items: [a] });
    }
    return out;
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    const competition = inject(Competition);
    const route = inject(ActivatedRoute);
    const router = inject(Router);
    // Filters and search live in the query params: back from a profile, reload and share keep them (U09-R1-3).
    const qp = route.snapshot.queryParamMap;
    this.q.set(qp.get('q') ?? '');
    const sx = qp.get('sexo');
    if (sx === 'F' || sx === 'M') this.sexo.set(sx);
    this.categoria.set(qp.get('categoria') ?? '');
    this.club.set(qp.get('club') ?? '');
    this.division.set(qp.get('division') ?? '');
    const od = qp.get('orden');
    if (od === 'nombre' || od === 'categoria') this.orden.set(od);
    this.soloFav.set(qp.get('mis') === '1');
    const browser = isPlatformBrowser(inject(PLATFORM_ID));
    if (browser) {
      effect(() => {
        const o = this.orden();
        const queryParams = { q: this.q().trim() || null, sexo: this.sexo() || null, categoria: this.categoria() || null, club: this.club() || null,
          division: this.division() || null, orden: o === 'horario' ? null : o, mis: this.soloFav() ? '1' : null };
        void router.navigate([], { queryParams, replaceUrl: true, preserveFragment: true });
      });
      // Mobile: an empty search compacts the header so the message sits in view (Figma 39 · 390 vacío).
      const mq = matchMedia('(max-width: 767px)');
      this.movil.set(mq.matches);
      mq.addEventListener('change', (e) => this.movil.set(e.matches));
    }
    void inject(PendingTasks).run(async () => {
      const [l] = await Promise.all([this.cargar(), competition.load()]);
      await applySeo(cms, seo, '/atletas', this.t().seoT, this.t().seoD(l?.resumen.total ?? ''));
    });
    if (browser) {
      // Live: a published schedule changes flights and start times (public SSE).
      const es = new EventSource(`/api/competiciones/${COMPETITION_SLUG}/stream`);
      let t: ReturnType<typeof setTimeout> | undefined;
      es.addEventListener('horarios.publicados', () => {
        clearTimeout(t);
        t = setTimeout(async () => { const l = await this.api.lista(); if (l) this.lista.set(l); }, 400);
      });
      inject(DestroyRef).onDestroy(() => { clearTimeout(t); es.close(); });
    }
  }

  protected async cargar(): Promise<ListaPub | null> {
    this.error.set(false);
    this.lista.set(undefined);
    const l = await this.api.lista();
    this.error.set(!l && this.api.failed());
    this.lista.set(l ?? { resumen: { total: 0, mujeres: 0, hombres: 0, clubs: 0, jornadas: 0 }, atletas: [], actualizado: '' });
    return l;
  }

  protected limpiar(): void {
    this.q.set(''); this.sexo.set(''); this.categoria.set(''); this.club.set(''); this.division.set(''); this.soloFav.set(false); this.limite.set(24);
  }

}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/** «F -47» before «F -52» … «M +120» (sex, then weight, «+» classes last). */
function catSort(a: string, b: string): number {
  const k = (s: string) => {
    const [sexo, c] = s.split(' ');
    // Numeric weight («-47» → 47); «+» classes after every «-» one; «Sin categoría» last.
    return [sexo, c ? Math.abs(parseFloat(c.replace('+', ''))) + (c.startsWith('+') ? 1000 : 0) : Infinity] as const;
  };
  const [sa, wa] = k(a);
  const [sb, wb] = k(b);
  return sa === sb ? wa - wb : sa.localeCompare(sb);
}

const T2 = {
  es: {
    entrenador: 'Entrenador/a:', historial: 'Historial:',
    ...T.es, noEncontrado: 'Atleta no encontrado', seccion: 'Atletas', atleta: 'Atleta', atletaGrs: 'Atleta · GRS Cup 2',
    confT: 'Aviso confirmado', confD: (n: string) => 'Te escribiremos 30 minutos antes de que ' + n + ' salga a competir.',
    bajaT: 'Aviso desactivado', bajaD: (n: string) => 'Ya no te escribiremos sobre ' + (n || 'este atleta') + '. Puedes volver a activarlo cuando quieras.',
    bajaErrT: 'No hemos podido desactivar el aviso', bajaErrD: 'El enlace no es válido o ya se usó. Si sigues recibiendo emails, responde a cualquiera de ellos.',
    noExiste: 'Este atleta no existe o ya no está inscrito.', verTodos: 'Ver todos los atletas', falloAtleta: 'No hemos podido cargar el atleta',
    compite: (dia: string, h: string) => 'Compite ' + (dia ? dia + ' ' : '') + 'a las ' + h, siguiendo: 'Siguiendo', seguirB: 'Seguir', compartir: 'Compartir', copiado: 'Enlace copiado',
    primeros: 'Primeros intentos', primerosD: 'Se confirman en el pesaje. Los siguientes se deciden durante la competición.', suDia: 'Su día', pesaje: 'Pesaje', traeDni: 'trae DNI y licencia',
    empieza: 'Empieza a competir', calendario: 'Añadir a mi calendario', recalculan: 'Las horas se recalculan solas si la competición va con retraso.',
    sinHorario: 'El horario se publica cuando la organización cierre los horarios. Si le sigues, lo verás aquí y en tu horario.',
    mejores: 'Mejores marcas', declaradas: 'Declaradas por el atleta', avisame: 'Avísame cuando compita', avisameD: 'Un email 30 min antes de que le toque competir.',
    revisa: 'Revisa tu email', revisaD: 'Te hemos enviado un enlace para confirmar el aviso.', tuEmail: 'Tu email', phEmail: 'tu@email.com', avisarme: 'Avisarme', acepto: 'Acepto recibir este aviso. ', privacidad: 'Privacidad',
    tambien: (c: string) => 'También en ' + (c || 'la misma categoría'),
    lifts: [{ k: 'sq', label: 'Sentadilla', short: 'SQ' }, { k: 'bp', label: 'Press de banca', short: 'BP' }, { k: 'dl', label: 'Peso muerto', short: 'DL' }] as { k: 'sq' | 'bp' | 'dl'; label: string; short: string }[],
    noDisp: 'Contenido no disponible ahora mismo.', seoNoT: 'Atleta no encontrado · GRS Cup',
    desc: (n: string, club: string, sexo: string, c: string, div: string) => c ? n + ' (' + (club || 'independiente') + ') compite en ' + (sexo === 'F' ? 'femenino' : 'masculino') + ' ' + c + ' kg ' + div + ' en la GRS Cup.' : n + ' (' + (club || 'independiente') + ') compite en la GRS Cup.',
    previsto: 'Total previsto: ', emailMal: 'Escribe un email válido.', aceptaMal: 'Marca la casilla para recibir el aviso.', reintenta: 'Inténtalo de nuevo en unos minutos.',
  },
  en: {
    entrenador: 'Coach:', historial: 'History:',
    ...T.en, noEncontrado: 'Athlete not found', seccion: 'Athletes', atleta: 'Athlete', atletaGrs: 'Athlete · GRS Cup 2',
    confT: 'Alert confirmed', confD: (n: string) => 'We’ll email you 30 minutes before ' + n + ' competes.',
    bajaT: 'Alert turned off', bajaD: (n: string) => 'We won’t email you about ' + (n || 'this athlete') + ' any more. You can turn it back on whenever you like.',
    bajaErrT: 'We couldn’t turn off the alert', bajaErrD: 'The link isn’t valid or has already been used. If you keep getting emails, reply to any of them.',
    noExiste: 'This athlete doesn’t exist or is no longer registered.', verTodos: 'See all athletes', falloAtleta: 'We couldn’t load the athlete',
    compite: (dia: string, h: string) => 'Competes ' + (dia ? dia + ' ' : '') + 'at ' + h, siguiendo: 'Following', seguirB: 'Follow', compartir: 'Share', copiado: 'Link copied',
    primeros: 'Opening attempts', primerosD: 'Confirmed at the weigh-in. The next ones are decided during the competition.', suDia: 'Their day', pesaje: 'Weigh-in', traeDni: 'bring ID and licence',
    empieza: 'Starts competing', calendario: 'Add to my calendar', recalculan: 'Times update automatically if the competition runs late.',
    sinHorario: 'The schedule is published once the organisers close the timetable. If you follow this athlete, you’ll see it here and in your schedule.',
    mejores: 'Best lifts', declaradas: 'Declared by the athlete', avisame: 'Alert me when they compete', avisameD: 'An email 30 min before they’re up.',
    revisa: 'Check your email', revisaD: 'We’ve sent you a link to confirm the alert.', tuEmail: 'Your email', phEmail: 'you@email.com', avisarme: 'Alert me', acepto: 'I agree to receive this alert. ', privacidad: 'Privacy',
    tambien: (c: string) => 'Also in ' + (c || 'the same class'),
    lifts: [{ k: 'sq', label: 'Squat', short: 'SQ' }, { k: 'bp', label: 'Bench press', short: 'BP' }, { k: 'dl', label: 'Deadlift', short: 'DL' }] as { k: 'sq' | 'bp' | 'dl'; label: string; short: string }[],
    noDisp: 'Content not available right now.', seoNoT: 'Athlete not found · GRS Cup',
    desc: (n: string, club: string, sexo: string, c: string, div: string) => c ? n + ' (' + (club || 'independent') + ') competes in ' + (sexo === 'F' ? 'women’s' : 'men’s') + ' ' + c + ' kg ' + div + ' at GRS Cup.' : n + ' (' + (club || 'independent') + ') competes at GRS Cup.',
    previsto: 'Projected total: ', emailMal: 'Enter a valid email.', aceptaMal: 'Tick the box to receive the alert.', reintenta: 'Please try again in a few minutes.',
  },
};

// ====================================================== /atletas/:slug ===

/** /atletas/:slug (Figma page 40): profile, «Avísame cuando compita», openers, day, best lifts, others in the class. */
@Component({
  selector: 'gr-atleta-page',
  imports: [RouterLink, LocPipe, DivisionPipe, Page, FormsModule, GrAlert, GrButton, GrIcon, GrSkeleton, Fav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = ficha();
    <gr-page [title]="a ? a.nombre + ' ' + a.apellidos : a === null && !api.failed() ? t().noEncontrado : ''" [hideTitle]="!!a" [section]="t().seccion" [crumb]="a ? a.nombre + ' ' + a.apellidos : t().atleta">
      <!-- Figma 40: the hero sits closer to the breadcrumbs than a titled page (U10-R1-3) -->
      <p class="sr-only">{{ t().atletaGrs }}</p>
      <div [class]="a !== null ? '-mt-8 md:-mt-10' : ''">
      @if (avisoConfirmado()) { <gr-alert tone="success" class="-mt-4 mb-8" [title]="t().confT">{{ t().confD(avisoConfirmado()) }}</gr-alert> }
      @if (baja() === 'ok') { <gr-alert tone="success" class="-mt-4 mb-8" [title]="t().bajaT">{{ t().bajaD(a?.nombre || '') }}</gr-alert> }
      @if (baja() === 'error') { <gr-alert tone="warning" class="-mt-4 mb-8" [title]="t().bajaErrT">{{ t().bajaErrD }}</gr-alert> }
      @if (a === undefined) {
        <div class="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]"><gr-skeleton class="h-[520px] rounded-lg" /><gr-skeleton class="h-96 rounded-lg" /></div>
      } @else if (a === null) {
        @if (!api.failed()) { <p class="text-body-m text-text-tertiary">{{ t().noExiste }} <a [routerLink]="'/atletas' | loc" class="text-accent-text underline">{{ t().verTodos }}</a></p> }
        @else if (!fallo.limitado()) { <gr-alert tone="warning" [title]="t().falloAtleta">{{ t().falloD }}</gr-alert> }
      } @else {
        <div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div class="flex flex-col gap-6">
            <section class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
              <!-- Without photo, mobile keeps the Figma ≈300 px card instead of a 4:5 block of initials (U10-R2-4). -->
              <div class="relative bg-[linear-gradient(160deg,#3a0f17,#171213)]" [class]="a.fotoUrl ? 'aspect-[4/5]' : 'min-h-[184px] lg:aspect-[4/5]'">
                @if (a.fotoUrl) { <img [src]="a.fotoUrl" [alt]="a.nombre + ' ' + a.apellidos" class="size-full object-cover" [style.object-position]="a.focalX + '% ' + a.focalY + '%'" fetchpriority="high" /> }
                @else { <span class="absolute top-5 left-5 flex size-[72px] items-center justify-center rounded-full border border-white/15 bg-white/5 font-display text-[32px] leading-none text-white/85 not-italic [text-box:trim-both_cap_alphabetic] lg:inset-0 lg:size-auto lg:rounded-none lg:border-0 lg:bg-transparent lg:text-[96px]" aria-hidden="true">{{ ini(a) }}</span> }
                <div class="absolute inset-x-0 bottom-0 bg-[linear-gradient(transparent,rgb(14_12_13/0.95))] p-5" [class]="a.fotoUrl ? 'pt-16' : 'pt-[108px] max-lg:relative lg:pt-16'"><p class="font-display leading-[0.95] uppercase italic" [class]="a.fotoUrl ? 'text-[40px]' : 'text-[32px] lg:text-[40px]'">{{ a.nombre }} {{ a.apellidos }}</p></div>
              </div>
              <div class="p-5">
                @if (a.categoria || a.divisionNombre) { <p class="text-label-m text-text-secondary">{{ a.categoria ? a.sexo + ' ' + cat(a.categoria) + ' kg' : '' }}{{ a.categoria && a.divisionNombre ? ' · ' : '' }}{{ a.divisionNombre | division }}</p> }
                <ul class="mt-3 flex flex-col gap-2 text-body-s text-text-secondary">
                  <li class="flex items-center gap-2"><gr-icon name="users" [size]="16" class="shrink-0 text-text-tertiary" />{{ a.club || t().independiente }}{{ a.ciudad ? ' · ' + a.ciudad : '' }}</li>
                  <li class="flex items-center gap-2"><gr-icon name="clock" [size]="16" class="shrink-0 text-text-tertiary" />@if (a.horaInicio) { {{ t().compite(diaTxt(), hora(a.horaInicio)) }} } @else { {{ t().porPublicar }} }</li>
                </ul>
                <div class="mt-4 flex items-center gap-2">
                  <button type="button" (click)="fav.seguir(a.slug)" [attr.aria-pressed]="fav.slugs().includes(a.slug)" class="flex h-11 w-fit items-center gap-2 rounded-pill border bg-bg-raised px-4 text-label-m hover:border-text-tertiary focus-visible:outline-2 focus-visible:outline-accent-text"
                    [class]="fav.slugs().includes(a.slug) ? 'border-accent bg-accent-deep/40 text-accent-text' : 'border-line-strong'">
                    <svg viewBox="0 0 24 24" width="16" height="16" [attr.fill]="fav.slugs().includes(a.slug) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></svg>
                    {{ fav.slugs().includes(a.slug) ? t().siguiendo : t().seguirB }}
                  </button>
                  <button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong hover:border-text-tertiary focus-visible:outline-2 focus-visible:outline-accent-text" [attr.aria-label]="t().compartir" (click)="compartir(a)"><gr-icon name="share" [size]="16" /></button>
                </div>
                @if (copiado()) { <p class="mt-2 text-body-xs text-success" aria-live="polite">{{ t().copiado }}</p> }
              </div>
            </section>
          </div>

          <div class="flex min-w-0 flex-col gap-6">
            <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <h2 class="text-ui-h5">{{ t().primeros }}</h2>
              <p class="text-body-xs text-text-tertiary">{{ t().primerosD }}</p>
              <ul class="mt-3">
                @for (m of t().lifts; track m.k) {
                  <li class="flex flex-col items-start gap-2 border-b border-line-subtle py-3 last:border-0 md:flex-row md:items-center md:gap-3">
                    <span class="text-label-m md:w-32 md:shrink-0">{{ m.label }}</span>
                    <span class="flex gap-2">
                      <span class="flex h-9 w-16 items-center justify-center rounded-sm border border-line-strong text-mono-s">{{ a.primerosIntentos[m.k] ? kg(a.primerosIntentos[m.k]) : '–' }}</span>
                      <span class="flex h-9 w-16 items-center justify-center rounded-sm border border-line-subtle text-mono-s text-text-muted">–</span>
                      <span class="flex h-9 w-16 items-center justify-center rounded-sm border border-line-subtle text-mono-s text-text-muted">–</span>
                    </span>
                  </li>
                }
              </ul>
            </section>
            <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <div class="flex items-center justify-between gap-3"><h2 class="text-ui-h5">{{ t().suDia }}</h2>@if (diaTxt()) { <span class="text-body-xs text-text-tertiary">{{ diaTxt() }}</span> }</div>
              @if (a.horaInicio || a.pesajeInicio) {
                <ol class="mt-3">
                  @if (a.pesajeInicio) { <li class="flex items-center gap-4 border-b border-line-subtle py-3"><span class="w-12 text-mono-s">{{ hora(a.pesajeInicio) }}</span><span class="flex size-8 shrink-0 items-center justify-center rounded-sm bg-bg-raised"><gr-icon name="scale" [size]="16" /></span><span><span class="block text-label-m">{{ t().pesaje }}</span><span class="block text-body-xs text-text-tertiary">{{ hora(a.pesajeInicio) }}–{{ hora(a.pesajeFin) }} · {{ t().traeDni }}</span></span></li> }
                  @if (a.horaInicio) { <li class="flex items-center gap-4 py-3"><span class="w-12 text-mono-s">{{ hora(a.horaInicio) }}</span><span class="flex size-8 shrink-0 items-center justify-center rounded-sm bg-bg-raised"><gr-icon name="zap" [size]="16" /></span><span><span class="block text-label-m">{{ t().empieza }}</span></span></li> }
                </ol>
                <a [href]="ics + '?atletas=' + a.slug" download class="mt-4 flex h-11 items-center justify-center gap-2 rounded-md border border-line-strong bg-bg-raised text-label-m hover:border-text-tertiary focus-visible:outline-2 focus-visible:outline-accent-text">{{ t().calendario }} <gr-icon name="arrow-right" [size]="16" /></a>
                <p class="mt-2 text-body-xs text-text-tertiary">{{ t().recalculan }}</p>
              } @else {
                <p class="mt-3 text-body-s text-text-secondary">{{ t().sinHorario }}</p>
              }
            </section>
            @if (a.marcas) {
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <div class="flex flex-wrap items-center justify-between gap-2"><h2 class="text-ui-h5">{{ t().mejores }}</h2><span class="text-body-xs text-text-tertiary">{{ t().declaradas }}</span></div>
                <ul class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  @for (m of t().lifts; track m.k) { <li class="rounded-md bg-bg-raised p-3"><p class="text-mono-xs text-text-tertiary">{{ m.short }}</p><p class="text-ui-h3">{{ kg(a.marcas[m.k]) }}</p></li> }
                  <li class="rounded-md bg-bg-raised p-3"><p class="text-mono-xs text-text-tertiary">Total</p><p class="text-ui-h3 text-accent-text">{{ kg(a.totalPrevisto) }}</p></li>
                </ul>
              </section>
            }
            @if (a.permiteSeguir) {
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <div class="flex gap-3"><span class="flex size-10 shrink-0 items-center justify-center rounded-sm bg-accent-deep/40 text-accent-text"><gr-icon name="bell" [size]="18" /></span>
                  <div><h2 class="text-ui-h5">{{ t().avisame }}</h2><p class="text-body-xs text-text-tertiary">{{ t().avisameD }}</p></div></div>
                @if (avisoEnviado()) {
                  <gr-alert tone="success" class="mt-4" [title]="t().revisa">{{ t().revisaD }}</gr-alert>
                } @else {
                  <form class="mt-4 flex flex-col gap-3" (ngSubmit)="avisar(a)" novalidate>
                    <div class="flex gap-2">
                      <label class="relative min-w-0 flex-1"><span class="sr-only">{{ t().tuEmail }}</span><gr-icon name="mail" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
                        <input type="email" name="email" autocomplete="email" [placeholder]="t().phEmail" [(ngModel)]="email" #avisoEmail
                          [attr.aria-invalid]="avisoCampo() === 'email' || null" [attr.aria-describedby]="avisoCampo() === 'email' ? 'aviso-error' : null"
                          class="h-11 w-full rounded-md border bg-bg-field pr-3 pl-9 text-body-m focus:border-accent-text focus:outline-none md:text-body-s" [class]="avisoCampo() === 'email' ? 'border-error' : 'border-line-strong'" /></label>
                      <button grButton variant="primary" type="submit" [loading]="enviando()">{{ t().avisarme }}</button>
                    </div>
                    @if (avisoError() && avisoCampo() === 'email') { <p id="aviso-error" class="-mt-1 text-body-xs text-error" role="alert">{{ avisoError() }}</p> }
                    <label class="flex min-h-11 items-start gap-3 text-body-xs text-text-secondary"><input type="checkbox" name="acepta" [(ngModel)]="acepta" #avisoAcepta
                      [attr.aria-invalid]="avisoCampo() === 'acepta' || null" [attr.aria-describedby]="avisoCampo() === 'acepta' ? 'aviso-error' : null" class="size-6 shrink-0 accent-[#C42B3E]" />{{ t().acepto }}<a [routerLink]="'/privacidad' | loc" class="text-accent-text underline">{{ t().privacidad }}</a></label>
                    @if (avisoError() && avisoCampo() !== 'email') { <p id="aviso-error" class="text-body-xs text-error" role="alert">{{ avisoError() }}</p> }
                  </form>
                }
              </section>
            }
            @if (a.bio || a.frase || a.entrenador || a.instagram || a.historial.length) {
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <h2 class="text-ui-h5">Sobre {{ a.nombre }}</h2>
                @if (a.bio || a.frase) { <p class="mt-3 text-body-m text-text-secondary">{{ a.bio || a.frase }}</p> }
                <dl class="mt-4 flex flex-col gap-2 text-body-s">
                  @if (a.entrenador) { <div class="flex gap-2"><gr-icon name="user" [size]="16" class="mt-0.5 text-accent-text" /><dt class="text-text-tertiary">{{ t().entrenador }}</dt><dd>{{ a.entrenador }}</dd></div> }
                  @if (a.instagram) { <div class="flex gap-2"><gr-icon name="instagram" [size]="16" class="mt-0.5 text-accent-text" /><dt class="text-text-tertiary">Instagram:</dt><dd><a [href]="'https://www.instagram.com/' + a.instagram.replace('@', '') + '/'" target="_blank" rel="noopener nofollow" class="hover:text-accent-text">{{ a.instagram }}</a></dd></div> }
                  @if (a.historial.length) { <div class="flex gap-2"><gr-icon name="trophy" [size]="16" class="mt-0.5 text-accent-text" /><dt class="text-text-tertiary">{{ t().historial }}</dt><dd>@for (h of a.historial; track $index) { <span class="block">{{ h.competicion }}</span> }</dd></div> }
                </dl>
              </section>
            }
            @if (a.tambien.length) {
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <h2 class="text-ui-h5">{{ t().tambien(a.categoria ? a.sexo + ' ' + cat(a.categoria) + ' kg' : '') }}</h2>
                <ul class="mt-2">
                  @for (o of a.tambien; track o.slug) {
                    <li class="flex items-center gap-3 border-b border-line-subtle py-2 last:border-0">
                      <a [routerLink]="'/atletas/' + o.slug | loc" class="flex min-w-0 flex-1 items-center gap-3">
                        @if (o.fotoUrl) { <img [src]="o.fotoUrl" [alt]="o.nombre + ' ' + o.apellidos" class="size-11 rounded-full object-cover" [style.object-position]="o.focalX + '% ' + o.focalY + '%'" loading="lazy" /> }
                        @else { <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-deep/50 text-label-s leading-none [text-box:trim-both_cap_alphabetic]">{{ ini(o) }}</span> }
                        <span class="min-w-0 break-words"><span class="block text-label-m">{{ o.nombre }} {{ o.apellidos }}</span><span class="block text-body-xs text-text-tertiary">{{ o.club || t().independiente }} · {{ o.divisionNombre | division }}</span></span>
                      </a>
                      @if (o.horaInicio) { <span class="text-mono-s">{{ hora(o.horaInicio) }}</span> }
                      <gr-fav [slug]="o.slug" [nombre]="o.nombre" />
                    </li>
                  }
                </ul>
              </section>
            }
          </div>
        </div>
      }
      </div>
    </gr-page>
  `,
})
export class AtletaPage {
  readonly slug = input.required<string>();
  protected readonly api = inject(AtletasPublic);
  protected readonly fallo = inject(FalloApi);
  protected readonly fav = inject(Favoritos);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly cat = cat;
  protected readonly kg = (n?: number | null) => kg(n, this.i18n.lang());
  protected readonly hora = (iso?: string) => hora(iso, this.i18n.lang());
  protected readonly ini = iniciales;
  protected readonly ics = ICS_URL;
  private readonly fan = inject(FanSession);
  protected readonly t = inject(I18n).dict(T2);
  private readonly i18n = inject(I18n);
  protected readonly ficha = signal<FichaPub | null | undefined>(undefined);
  protected readonly diaTxt = signal('');
  protected readonly copiado = signal(false);
  protected email = '';
  protected acepta = false;
  protected readonly enviando = signal(false);
  protected readonly avisoEnviado = signal(false);
  protected readonly avisoError = signal('');
  /** field the aviso error belongs to: marks it invalid and gets the focus back */
  protected readonly avisoCampo = signal<'' | 'email' | 'acepta'>('');
  private readonly avisoEmail = viewChild<ElementRef<HTMLInputElement>>('avisoEmail');
  private readonly avisoAcepta = viewChild<ElementRef<HTMLInputElement>>('avisoAcepta');
  protected readonly avisoConfirmado = signal('');
  protected readonly baja = signal<'' | 'ok' | 'error'>('');

  constructor() {
    const seo = inject(Seo);
    const competition = inject(Competition);
    const route = inject(ActivatedRoute);
    const tasks = inject(PendingTasks);
    // The component is reused between /atletas/A → /atletas/B («También en…»): reload whenever the slug changes.
    let primera = true;
    effect(() => {
      const slug = this.slug();
      untracked(() => {
        if (!primera) {
          this.ficha.set(undefined);
          this.copiado.set(false);
          this.avisoEnviado.set(false);
          this.avisoError.set('');
          this.avisoCampo.set('');
          if (this.browser) window.scrollTo({ top: 0 });
        }
        primera = false;
        void tasks.run(() => this.cargar(slug, seo, competition, route));
      });
    });
  }

  private async cargar(slug: string, seo: Seo, competition: Competition, route: ActivatedRoute): Promise<void> {
      const [f, c] = await Promise.all([this.api.ficha(slug), competition.load()]);
      if (slug !== this.slug()) return; // a newer profile was opened meanwhile
      this.ficha.set(f);
      if (!f) {
        this.api.notFound();
        seo.set(this.api.failed()
          ? { title: 'GRS Cup', description: this.t().noDisp, path: '/atletas/' + slug }
          : { title: this.t().seoNoT, description: this.t().noExiste, path: '/atletas/' + slug, robots: 'noindex' });
        return;
      }
      if (c?.fechaInicio) this.diaTxt.set(new Intl.DateTimeFormat(this.i18n.locale(), { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(c.fechaInicio)));
      const nombre = `${f.nombre} ${f.apellidos}`;
      // Sin categoría (atleta recién creado desde una solicitud) no se pinta «M  kg».
      const catTxt = f.categoria ? `${f.sexo} ${cat(f.categoria)} kg` : '';
      const desc = this.t().desc(nombre, f.club, f.sexo, f.categoria ? cat(f.categoria) : '', divisionEn(f.divisionNombre));
      seo.set({
        title: catTxt ? `${nombre} · ${catTxt} · GRS Cup` : `${nombre} · GRS Cup`,
        description: `${desc}${f.totalPrevisto ? ' ' + this.t().previsto + kg(f.totalPrevisto, this.i18n.lang()) + ' kg.' : ''}`,
        path: '/atletas/' + f.slug, image: f.fotoUrl || undefined,
        jsonLd: { '@context': 'https://schema.org', '@type': 'Person', name: nombre, ...(f.club ? { memberOf: { '@type': 'SportsTeam', name: f.club } } : {}), knowsAbout: 'Powerlifting' },
      });
      const bajaTok = route.snapshot.queryParamMap.get('baja');
      if (bajaTok && this.browser) {
        try {
          await this.api.bajaAviso(bajaTok);
          this.baja.set('ok');
        } catch {
          this.baja.set('error');
        }
      }
      const token = route.snapshot.queryParamMap.get('aviso');
      if (token && this.browser) {
        try {
          this.avisoConfirmado.set(await this.api.confirmarAviso(token));
        } catch {
          /* expired or used link: the form is still there */
        }
      }
      if (this.browser) void this.retomar(f);
  }

  /** Back from the email link: finishes the follow / alert started by an explicit click. Local stars are never sent (U10-R2-1). */
  private async retomar(a: FichaPub): Promise<void> {
    if (!(await this.fan.cargar())) return; // no session yet: keep the intention for when they come back logged in
    const i = this.fav.intencion(a.slug);
    if (i?.accion === 'seguir' && !this.fav.has(a.slug)) await this.fav.seguir(a.slug);
    if (i?.accion === 'avisar' && i.email) {
      this.email = i.email;
      this.acepta = true;
      await this.avisar(a);
    }
  }

  protected async avisar(a: FichaPub): Promise<void> {
    if (this.enviando()) return; // double tap: one request
    this.avisoError.set('');
    this.avisoCampo.set('');
    const mal = (campo: 'email' | 'acepta', msg: string) => {
      this.avisoCampo.set(campo);
      this.avisoError.set(msg);
      (campo === 'email' ? this.avisoEmail() : this.avisoAcepta())?.nativeElement.focus();
    };
    this.email = this.email.trim();
    if (this.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) return mal('email', this.t().emailMal);
    if (!this.acepta) return mal('acepta', this.t().aceptaMal);
    // Seguir needs the fan (or athlete) session: without it, the login modal opens and brings the person back here.
    this.enviando.set(true);
    try {
      if (!(await this.fan.cargar())) return this.fav.pedirAcceso({ accion: 'avisar', slug: a.slug, email: this.email });
      await this.api.seguir(a.slug, this.email);
      this.avisoEnviado.set(true);
    } catch (e) {
      if ((e as { status?: number }).status === 401) { this.fan.sesionPerdida(); return this.fav.pedirAcceso({ accion: 'avisar', slug: a.slug, email: this.email }); }
      this.avisoError.set(textoError(e, this.t().reintenta));
    } finally {
      this.enviando.set(false);
    }
  }

  protected async compartir(a: FichaPub): Promise<void> {
    const url = location.origin + this.i18n.path('/atletas/' + a.slug);
    if (navigator.share) {
      await navigator.share({ title: `${a.nombre} ${a.apellidos} · GRS Cup`, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url);
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 2500);
  }
}

const T3 = {
  es: {
    titulo: 'Participantes', accent: 'y flights', eyebrow: 'La plantilla', seccion: 'El evento',
    sub: 'Lista de atletas por bloque de competición. Busca tu nombre para ver tu hora de pesaje y tu flight.', alta: 'Atletas dados de alta en esta web', ejemplo: 'Datos de ejemplo',
    plazas: 'Plazas ocupadas', completa: 'Plantilla completa', reserva: (n: number) => n + ' en reserva', bloque: 'Bloque completo', mujeres: 'Mujeres', hombres: 'Hombres',
    buscar: 'Buscar atleta o club', ph: 'Buscar atleta o club…', atleta: 'Atleta', club: 'Club', cat: 'Categoría', inicio: 'Inicio', pesaje: 'Pesaje', independiente: 'Independiente', porPublicar: 'Por publicar',
    nadie: (q: string) => 'Nadie coincide con «' + q + '».', error: '¿No apareces en la lista o hay un error en tus datos? Escríbenos y lo corregimos.', contactar: 'Contactar',
    sexos: [{ v: '' as const, label: 'Todas' }, { v: 'F' as const, label: 'Femenino' }, { v: 'M' as const, label: 'Masculino' }] as { v: '' | 'F' | 'M'; label: string }[],
    rel: [{ titulo: 'Horarios', texto: 'Bloques por categoría', ruta: '/horarios' }, { titulo: 'En directo', texto: 'Sigue la competición', ruta: '/en-directo' }, { titulo: 'Reglamento', texto: 'Cómo funciona el pesaje', ruta: '/reglamento' }] as RelatedLink[],
    seoT: 'Participantes y flights · GRS Cup', seoD: 'Lista de atletas por bloque de competición: busca tu nombre para ver tu hora de pesaje y tu flight.',
  },
  en: {
    titulo: 'Participants', accent: 'and flights', eyebrow: 'The line-up', seccion: 'The event',
    sub: 'List of athletes by competition block. Search for your name to see your weigh-in time and your flight.', alta: 'Athletes registered on this site', ejemplo: 'Sample data',
    plazas: 'Places taken', completa: 'Line-up full', reserva: (n: number) => n + ' on the reserve list', bloque: 'Block full', mujeres: 'Women', hombres: 'Men',
    buscar: 'Search athlete or club', ph: 'Search athlete or club…', atleta: 'Athlete', club: 'Club', cat: 'Class', inicio: 'Start', pesaje: 'Weigh-in', independiente: 'Independent', porPublicar: 'To be published',
    nadie: (q: string) => 'Nobody matches “' + q + '”.', error: 'Not on the list or is there a mistake in your details? Write to us and we’ll fix it.', contactar: 'Contact',
    sexos: [{ v: '' as const, label: 'All' }, { v: 'F' as const, label: 'Women' }, { v: 'M' as const, label: 'Men' }] as { v: '' | 'F' | 'M'; label: string }[],
    rel: [{ titulo: 'Schedule', texto: 'Blocks by class', ruta: '/horarios' }, { titulo: 'Live', texto: 'Follow the competition', ruta: '/en-directo' }, { titulo: 'Rules', texto: 'How the weigh-in works', ruta: '/reglamento' }] as RelatedLink[],
    seoT: 'Participants and flights · GRS Cup', seoD: 'List of athletes by competition block: search for your name to see your weigh-in time and your flight.',
  },
};

// ======================================================= /participantes ===

/** /participantes (Figma page 26): confirmed athletes by block (flight once published), searchable. */
@Component({
  selector: 'gr-participantes-page',
  imports: [RouterLink, LocPipe, Page, FormsModule, GrIcon, GrSkeleton, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = data();
    <gr-page [title]="t().titulo" [accent]="t().accent" [eyebrow]="t().eyebrow" [section]="t().seccion" [crumb]="t().titulo"
      [subtitle]="t().sub">
      <p pageStamps class="flex flex-wrap gap-2">
        <span class="inline-flex items-center gap-2 rounded-sm border border-line-subtle px-3 py-2 text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="14" />{{ t().alta }}</span>
        <span class="inline-flex h-7 items-center rounded-full border border-info bg-info/12 px-3 text-label-xs text-info uppercase">{{ t().ejemplo }}</span>
      </p>
      @if (p === undefined) { <gr-skeleton class="h-40 rounded-lg" /> }
      @else if (p) {
        <!-- Figma «Resumen»: places with the bar, then women and men with the big number under the label -->
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          <div class="col-span-2 rounded-2xl border border-line-subtle bg-bg-card p-5 md:col-span-1">
            <p class="flex items-center justify-between text-label-s">{{ t().plazas }} @if (p.plazas) { <span class="text-mono-xs text-accent-text">{{ p.ocupadas }} / {{ p.plazas }}</span> }</p>
            @if (p.plazas) { <div class="mt-3 h-1.5 rounded-pill bg-bg-raised"><div class="h-full rounded-pill bg-accent" [style.width.%]="pct()"></div></div> }
            <p class="mt-2 text-body-xs text-text-tertiary">{{ p.plazas && p.ocupadas >= p.plazas ? t().completa : (p.reserva ? t().reserva(p.reserva) : t().bloque) }}</p>
          </div>
          <div class="flex flex-col gap-1 rounded-2xl border border-line-subtle bg-bg-card p-5"><span class="text-label-s text-text-secondary">{{ t().mujeres }}</span><span class="font-display text-[44px] leading-none italic">{{ p.mujeres }}</span></div>
          <div class="flex flex-col gap-1 rounded-2xl border border-line-subtle bg-bg-card p-5"><span class="text-label-s text-text-secondary">{{ t().hombres }}</span><span class="font-display text-[44px] leading-none italic">{{ p.hombres }}</span></div>
        </div>

        <div class="mt-8 flex flex-wrap items-center gap-2">
          <label class="relative min-w-0 flex-1 basis-64 md:max-w-sm">
            <span class="sr-only">{{ t().buscar }}</span>
            <gr-icon name="search" [size]="18" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
            <input type="search" [placeholder]="t().ph" [ngModel]="q()" (ngModelChange)="q.set($event)" class="h-12 w-full rounded-md border border-line-strong bg-bg-field pr-3 pl-10 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" />
          </label>
          <!-- mobile: the chips in one sideways row under the search (Figma 26) -->
          <div class="-mx-5 flex w-[calc(100%+40px)] gap-2 overflow-x-auto px-5 [scrollbar-width:none] md:contents">
          @for (s of t().sexos; track s.v) {
            <button type="button" (click)="sexo.set(s.v)" [attr.aria-pressed]="sexo() === s.v" class="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-label-s md:h-10"
              [class]="sexo() === s.v ? 'border-accent bg-accent/16 text-text-primary' : 'border-line-strong text-text-secondary hover:text-text-primary'"><gr-icon [name]="sexo() === s.v ? 'check' : 'plus'" [size]="14" />{{ s.label }}</button>
          }
          </div>
        </div>

        <div class="mt-8 flex flex-col gap-10">
          @for (g of grupos(); track g.titulo) {
            <section>
              <h2 class="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span class="text-display-2xs md:text-display-xs">{{ g.titulo }}</span>
                <span class="flex items-center gap-1.5 text-body-s text-text-secondary"><gr-icon name="clock" [size]="14" class="text-accent-text" />{{ g.subtitulo }}</span></h2>
              <div class="mt-3 hidden overflow-hidden rounded-2xl border border-line-subtle bg-bg-card md:block">
                <table class="w-full table-fixed text-left">
                  <thead class="border-b border-line-subtle text-label-xs text-text-muted uppercase"><tr><th class="px-4 py-3 font-medium">{{ t().atleta }}</th><th class="px-4 py-3 font-medium">{{ t().club }}</th><th class="w-28 px-4 py-3 font-medium">{{ t().cat }}</th><th class="w-20 px-4 py-3 font-medium">{{ t().inicio }}</th><th class="w-36 px-4 py-3 font-medium">{{ t().pesaje }}</th></tr></thead>
                  <tbody>
                    @for (f of g.filas; track f.slug) {
                      <tr class="border-b border-line-subtle last:border-0"><td class="px-4 py-3.5"><a [routerLink]="'/atletas/' + f.slug | loc" class="text-label-m hover:text-accent-text">{{ f.nombre }}</a></td><td class="truncate px-4 py-3 text-body-s text-text-secondary">{{ f.club || t().independiente }}</td>
                        <td class="px-4 py-3 text-label-s text-accent-text">{{ cat(f.categoria) }} kg</td><td class="px-4 py-3 text-mono-s">{{ f.horaInicio ? hora(f.horaInicio) : '–' }}</td><td class="px-4 py-3 text-mono-s">{{ f.pesajeInicio ? hora(f.pesajeInicio) + ' – ' + hora(f.pesajeFin) : t().porPublicar }}</td></tr>
                    }
                  </tbody>
                </table>
              </div>
              <ul class="mt-3 overflow-hidden rounded-2xl border border-line-subtle bg-bg-card md:hidden">
                @for (f of g.filas; track f.slug) {
                  <li class="border-b border-line-subtle last:border-0"><a [routerLink]="'/atletas/' + f.slug | loc" class="flex min-h-14 items-center gap-3 px-4 py-2">
                    <span class="min-w-0 flex-1"><span class="block truncate text-label-m">{{ f.nombre }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ f.club || t().independiente }}</span></span>
                    <span class="rounded-pill bg-accent-deep/40 px-2 py-0.5 text-mono-xs text-accent-text">{{ cat(f.categoria) }} kg</span>
                  </a></li>
                }
              </ul>
            </section>
          } @empty { <p class="rounded-lg border border-line-subtle bg-bg-card p-8 text-center text-body-m text-text-tertiary">{{ t().nadie(q()) }}</p> }
        </div>

        @if (contacto()) {
          <div class="mt-10 flex flex-col gap-3 rounded-xl border border-info/40 bg-info/8 p-4 md:flex-row md:items-center">
            <gr-icon name="info" [size]="18" class="text-info" />
            <p class="flex-1 text-body-s text-text-secondary">{{ t().error }}</p>
            <a [href]="'mailto:' + contacto()" class="inline-flex h-10 items-center justify-center rounded-sm bg-info/15 px-3 text-label-s text-info hover:bg-info/25">{{ t().contactar }}</a>
          </div>
        }
      }
      <div class="mt-18 flex flex-col gap-18 md:mt-24 md:gap-24">
        <gr-related [items]="t().rel" />
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class ParticipantesPage {
  private readonly api = inject(AtletasPublic);
  private readonly lang = inject(I18n).lang;
  protected readonly cat = cat;
  protected readonly hora = (iso?: string) => hora(iso, this.lang());
  protected readonly data = signal<Participantes | null | undefined>(undefined);
  protected readonly contacto = signal('');
  protected readonly q = signal('');
  protected readonly sexo = signal<'' | 'F' | 'M'>('');
  protected readonly t = inject(I18n).dict(T3);
  protected readonly pct = computed(() => {
    const p = this.data();
    return p?.plazas ? Math.min(100, Math.round((p.ocupadas * 100) / p.plazas)) : 0;
  });
  protected readonly grupos = computed(() => {
    const q = norm(this.q());
    return (this.data()?.grupos ?? [])
      .map((g) => ({ ...g, filas: g.filas.filter((f) => (!this.sexo() || f.sexo === this.sexo()) && (!q || norm(f.nombre + ' ' + f.club).includes(q))) }))
      .filter((g) => g.filas.length);
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    const competition = inject(Competition);
    void inject(PendingTasks).run(async () => {
      const [p, c] = await Promise.all([this.api.participantes(), competition.load()]);
      this.data.set(p);
      this.contacto.set(c?.evento.emailContacto ?? '');
      await applySeo(cms, seo, '/participantes', this.t().seoT, this.t().seoD);
    });
  }
}

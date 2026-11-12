import { ChangeDetectionStrategy, Component, PLATFORM_ID, PendingTasks, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrIcon, GrSkeleton, GrSelect } from '@grcup/ui';
import { AtletasPublic, Favoritos, cat, hora, iniciales, kg, type AtletaPub, type FichaPub, type ListaPub, type Participantes } from '../core/atletas';
import { Cms } from '../core/cms';
import { COMPETITION_SLUG, Competition, FalloApi, type CompeticionPublica } from '../core/competition';
import { FanSession } from '../core/fan';
import { ICS_URL } from '../core/horarios';
import { Seo } from '../core/seo';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';

const sexoTxt = { F: 'Femenino', M: 'Masculino' };

/** Star button: follows an athlete on this device (personal schedule). */
@Component({
  selector: 'gr-fav',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="$event.preventDefault(); $event.stopPropagation(); fav.seguir(slug())" [attr.aria-pressed]="on()" [attr.aria-label]="(on() ? 'Dejar de seguir a ' : 'Seguir a ') + nombre()"
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
  protected readonly on = computed(() => this.fav.slugs().includes(this.slug()));
}

// ============================================================ /atletas ===

/** /atletas (Figma page 39): search, filters, athlete cards (list grouped by class on mobile), load more. */
@Component({
  selector: 'gr-atletas-page',
  imports: [RouterLink, GrSelect, Page, FormsModule, GrAlert, GrIcon, GrButton, GrSkeleton, Fav, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = lista();
    <gr-page title="Los" [accent]="(l?.resumen?.total || '') + ' atletas'" suffix="de la GR Cup" eyebrow="Competición 2026" crumb="Atletas" [migasMovil]="!vacioMovil()"
      [subtitle]="vacioMovil() ? '' : 'Busca a quien vienes a animar, mira su categoría y a qué hora compite. Sigue a tus atletas y tendrás tu propio horario.'">
      <p pageStamps class="flex-wrap gap-2" [class]="vacioMovil() ? 'hidden' : 'flex'">
        @if (l?.actualizado) { <span class="inline-flex min-h-8 items-center gap-2 rounded-pill border border-line-strong px-3 text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="14" />Actualizado el {{ fecha(l!.actualizado) }} · Fuente: inscritos AEP</span> }
        @if (plazas() && l?.resumen?.total) { <span class="inline-flex h-8 items-center rounded-pill border border-line-strong bg-white/5 px-3 text-label-xs text-text-tertiary">Inscripciones {{ l!.resumen.total >= plazas()! ? 'completas' : 'abiertas' }} · {{ Math.min(l!.resumen.total, plazas()!) }}/{{ plazas() }}</span> }
      </p>

      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <label class="relative min-w-0 flex-1 basis-full lg:max-w-[400px] lg:basis-72">
            <span class="sr-only">Buscar atleta</span>
            <gr-icon name="search" [size]="18" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
            <input type="search" placeholder="Busca por nombre o club" [ngModel]="q()" (ngModelChange)="q.set($event); limite.set(24)"
              class="h-12 w-full rounded-md border border-line-strong bg-bg-field pr-11 pl-10 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none [&::-webkit-search-cancel-button]:hidden" />
            @if (q()) { <button type="button" (click)="q.set(''); limite.set(24)" aria-label="Borrar búsqueda" class="absolute top-1/2 right-2.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-text-tertiary hover:bg-white/15 hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent-text"><gr-icon name="x" [size]="14" /></button> }
          </label>
          @for (s of sexos; track s.v) {
            <button type="button" (click)="sexo.set(s.v); limite.set(24)" [attr.aria-pressed]="sexo() === s.v" class="inline-flex h-11 items-center gap-1.5 rounded-pill border px-3.5 text-label-s"
              [class]="sexo() === s.v ? 'border-accent-text bg-accent-deep/40 text-text-primary' : 'border-line-strong text-text-secondary hover:text-text-primary'">
              <gr-icon [name]="sexo() === s.v ? 'check' : 'plus'" [size]="14" />{{ s.label }}
            </button>
          }
          <button type="button" class="inline-flex h-11 items-center gap-1.5 rounded-pill border border-line-strong px-3.5 text-label-s md:hidden" (click)="filtros.set(!filtros())" [attr.aria-expanded]="filtros()">
            <gr-icon name="sliders" [size]="14" />Filtros
          </button>
        </div>
        <div class="flex-wrap gap-2" [class]="filtros() ? 'flex' : 'hidden md:flex'">
          <gr-select tipo="filtro" etiqueta="Categoría" aria-label="Categoría" [ngModel]="categoria()" (ngModelChange)="categoria.set($event); limite.set(24)">
            <option value="">Todas</option>@for (c of categorias(); track c) { <option [value]="c">{{ c.slice(2) ? c[0] + ' ' + cat(c.slice(2)) + ' kg' : 'Sin categoría' }}</option> }
          </gr-select>
          <gr-select tipo="filtro" etiqueta="Club" aria-label="Club" class="max-w-64" [ngModel]="club()" (ngModelChange)="club.set($event); limite.set(24)">
            <option value="">Todos</option>@for (c of clubs(); track c) { <option [value]="c">{{ c }}</option> }
          </gr-select>
          <gr-select tipo="filtro" etiqueta="División" aria-label="División" class="md:max-lg:hidden" [ngModel]="division()" (ngModelChange)="division.set($event); limite.set(24)">
            <option value="">Todas</option>@for (d of divisiones(); track d) { <option [value]="d">{{ d }}</option> }
          </gr-select>
          <gr-select tipo="filtro" etiqueta="Orden" [resaltar]="false" aria-label="Orden" class="md:max-lg:hidden" [ngModel]="orden()" (ngModelChange)="orden.set($event)">
            <option value="horario">horario</option><option value="nombre">nombre</option><option value="categoria">categoría</option>
          </gr-select>
          @if (fav.slugs().length) {
            <button type="button" (click)="soloFav.set(!soloFav())" [attr.aria-pressed]="soloFav()" class="inline-flex h-10 items-center gap-1.5 rounded-pill border px-3 text-label-s" [class]="soloFav() ? 'border-accent-text bg-accent-deep/40' : 'border-line-strong'">
              Mis atletas · {{ fav.slugs().length }}
            </button>
          }
        </div>
      </div>

      @if (l) {
        <ul class="mt-[88px] hidden grid-cols-4 gap-2 md:grid lg:gap-4">
          <li class="rounded-md border border-line-subtle bg-bg-card px-4 py-[18px]"><p class="text-ui-h3">{{ l.resumen.total }}</p><p class="text-body-xs text-text-tertiary">atletas</p></li>
          <li class="rounded-md border border-line-subtle bg-bg-card px-4 py-[18px]"><p class="text-ui-h3">{{ l.resumen.mujeres }} · {{ l.resumen.hombres }}</p><p class="text-body-xs text-text-tertiary">mujeres · hombres</p></li>
          <li class="rounded-md border border-line-subtle bg-bg-card px-4 py-[18px]"><p class="text-ui-h3">{{ l.resumen.clubs }}</p><p class="text-body-xs text-text-tertiary">clubs</p></li>
          <li class="rounded-md border border-line-subtle bg-bg-card px-4 py-[18px]"><p class="text-ui-h3">{{ l.resumen.flights || '–' }}</p><p class="text-body-xs text-text-tertiary">{{ l.resumen.flights ? 'flights · ' + l.resumen.plataformas + (l.resumen.plataformas === 1 ? ' plataforma' : ' plataformas') : 'flights por publicar' }}</p></li>
        </ul>
      }

      @if (l === undefined) {
        <div class="mt-6 grid grid-cols-1 gap-4 md:mt-20 md:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Cargando atletas">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-4"><gr-skeleton class="size-10 rounded-sm" /><gr-skeleton class="h-3 w-1/2" /><gr-skeleton class="h-3 w-full" /><gr-skeleton class="h-3 w-4/5" /></div>
          }
        </div>
      } @else if (error()) {
        <div class="mt-8 flex flex-col items-start gap-4"><gr-alert tone="warning" title="No hemos podido cargar los atletas">Estamos teniendo un problema temporal. Vuelve a intentarlo en unos minutos.</gr-alert><button grButton icon="refresh" (click)="cargar()">Reintentar</button></div>
      } @else if (!filtrados().length) {
        <div class="mt-[-5px] flex flex-col items-center gap-3 py-8 text-center md:mt-12" role="status">
          <gr-icon name="search" [size]="28" class="text-text-tertiary" />
          <p class="text-ui-h5">Ningún atleta coincide{{ q() ? ' con "' + q() + '"' : '' }}</p>
          <p class="max-w-sm text-body-s text-text-tertiary">Prueba con el apellido o el club. Si compites y no apareces, avisa a la organización: el listado sale de la AEP.</p>
          <button grButton (click)="limpiar()">Quitar filtros</button>
        </div>
      } @else {
        <!-- Desktop / tablet: cards -->
        <ul class="mt-20 hidden grid-cols-2 gap-4 md:grid lg:grid-cols-4">
          @for (a of visibles(); track a.slug) {
            <li>
              <a [routerLink]="'/atletas/' + a.slug" class="group relative flex h-full flex-col overflow-hidden rounded-lg border bg-bg-card transition-colors hover:border-line-strong" [class]="fav.slugs().includes(a.slug) ? 'border-accent/60' : 'border-line-subtle'">
                <span class="relative block aspect-[4/3] overflow-hidden bg-[linear-gradient(160deg,#3a0f17,#171213)]">
                  @if (a.fotoUrl) { <img [src]="a.fotoUrl" [alt]="a.nombre + ' ' + a.apellidos" class="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" [style.object-position]="a.focalX + '% ' + a.focalY + '%'" loading="lazy" /> }
                  @else { <span class="absolute inset-0 flex items-center justify-center font-display text-[64px] text-white/90 italic">{{ ini(a) }}</span> }
                  <span class="absolute top-3 right-3"><gr-fav [slug]="a.slug" [nombre]="a.nombre" /></span>
                </span>
                <span class="flex flex-1 flex-col p-4">
                  <span class="text-label-m">{{ a.nombre }} {{ a.apellidos }}</span>
                  <span class="mt-1.5 text-body-xs text-text-tertiary">{{ a.club || 'Independiente' }}{{ a.ciudad ? ' · ' + a.ciudad : '' }}</span>
                  <span class="mt-3 mb-3 flex flex-wrap gap-1.5">
                    <span class="inline-flex h-6 items-center rounded-pill border border-accent/50 bg-accent/10 px-2 text-label-xs text-accent-text">{{ a.categoria.trim() ? a.sexo + ' ' + cat(a.categoria) + ' kg' : 'Sin categoría' }}</span>
                    @if (a.divisionNombre) { <span class="inline-flex h-6 items-center rounded-pill border border-line-strong bg-white/5 px-2 text-label-xs text-text-tertiary">{{ a.divisionNombre }}</span> }
                  </span>
                  <span class="mt-auto flex items-center gap-1.5 border-t border-line-subtle pt-3 text-body-xs text-text-secondary"><gr-icon name="clock" [size]="12" />{{ a.flight ? 'Flight ' + a.flight + (a.plataforma ? ' · Plataforma ' + a.plataforma : '') + (a.horaInicio ? ' · ' + hora(a.horaInicio) : '') : 'Horario por publicar' }}</span>
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
                    <a [routerLink]="'/atletas/' + a.slug" class="flex min-h-16 items-center gap-3 py-2.5">
                      @if (a.fotoUrl) { <img [src]="a.fotoUrl" alt="" class="size-11 shrink-0 rounded-full object-cover" [style.object-position]="a.focalX + '% ' + a.focalY + '%'" loading="lazy" /> }
                      @else { <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-deep/50 text-label-m">{{ ini(a) }}</span> }
                      <span class="min-w-0 flex-1"><span class="block text-label-m break-words">{{ a.nombre }} {{ a.apellidos }}</span><span class="line-clamp-2 block text-body-xs text-text-tertiary">{{ a.club || 'Independiente' }} · {{ a.categoria.trim() ? a.sexo + ' ' + cat(a.categoria) + ' kg' : 'Sin categoría' }}{{ a.divisionNombre ? ' · ' + a.divisionNombre : '' }}</span></span>
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
          <p class="text-body-s text-text-tertiary">Mostrando {{ visibles().length }} de {{ filtrados().length }}</p>
          @if (visibles().length < filtrados().length) { <button grButton (click)="limite.set(limite() + 24)">Cargar 24 más</button> }
        </div>
      }

      <div class="mt-18 flex flex-col gap-18 md:mt-24 md:gap-24">
        <section class="flex flex-col gap-4 rounded-xl border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_60%)] p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div class="flex gap-4">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-sm bg-accent-deep/60 text-accent-text"><gr-icon name="user" [size]="18" /></span>
            <div><h2 class="text-ui-h5">¿Compites? Completa tu perfil</h2><p class="mt-1 text-body-s text-text-secondary">Entra con el email de tu inscripción en la AEP: foto, club, mejores marcas y tus alturas de rack para agilizar el pesaje.</p></div>
          </div>
          <a grButton iconRight="arrow-right" routerLink="/area-atleta" class="shrink-0">Área de atleta</a>
        </section>
        <gr-related [items]="relacionados" />
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class AtletasPage {
  private readonly api = inject(AtletasPublic);
  protected readonly fav = inject(Favoritos);
  protected readonly cat = cat;
  protected readonly hora = hora;
  protected readonly sexoTxt = sexoTxt;
  protected readonly Math = Math;
  protected readonly ini = iniciales;
  protected readonly lista = signal<ListaPub | null | undefined>(undefined);
  protected readonly error = signal(false);
  protected readonly comp = signal<CompeticionPublica | null>(null);
  protected readonly q = signal('');
  protected readonly sexo = signal<'' | 'F' | 'M'>('');
  protected readonly categoria = signal('');
  protected readonly club = signal('');
  protected readonly division = signal('');
  protected readonly orden = signal<'horario' | 'nombre' | 'categoria'>('horario');
  protected readonly soloFav = signal(false);
  protected readonly filtros = signal(false);
  protected readonly limite = signal(24);
  protected readonly sexos = [{ v: '' as const, label: 'Todos' }, { v: 'F' as const, label: 'Femenino' }, { v: 'M' as const, label: 'Masculino' }];
  protected readonly relacionados: RelatedLink[] = [
    { titulo: 'Horarios en directo', texto: 'Flights y plataforma', ruta: '/horarios' },
    { titulo: 'Categorías de peso', texto: 'Pesos y divisiones', ruta: '/categorias-de-peso' },
    { titulo: 'Entradas', texto: 'Gratis con reserva', ruta: '/entradas' },
  ];
  protected readonly plazas = computed(() => this.comp()?.inscripcion?.plazas);
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
      const catTxt = a.categoria.trim() ? `${sexoTxt[a.sexo]} ${cat(a.categoria)} kg` : `${sexoTxt[a.sexo]} · Sin categoría`;
      const t = `${catTxt}${a.flight ? ' · Flight ' + a.flight : ''}`;
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
      const [l, c] = await Promise.all([this.cargar(), competition.load()]);
      this.comp.set(c);
      await applySeo(cms, seo, '/atletas', 'Atletas · GR Strength Cup', `Los ${l?.resumen.total ?? ''} atletas de la GR Strength Cup: categoría, club y horario de cada uno.`);
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
    this.lista.set(l ?? { resumen: { total: 0, mujeres: 0, hombres: 0, clubs: 0, flights: 0, plataformas: 0 }, atletas: [], actualizado: '' });
    return l;
  }

  protected limpiar(): void {
    this.q.set(''); this.sexo.set(''); this.categoria.set(''); this.club.set(''); this.division.set(''); this.soloFav.set(false); this.limite.set(24);
  }

  protected fecha(iso: string): string {
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Madrid' }).format(new Date(iso));
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

// ====================================================== /atletas/:slug ===

/** /atletas/:slug (Figma page 40): profile, «Avísame cuando compita», openers, day, best lifts, others in the class. */
@Component({
  selector: 'gr-atleta-page',
  imports: [RouterLink, Page, FormsModule, GrAlert, GrButton, GrIcon, GrSkeleton, Fav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = ficha();
    <gr-page [title]="a ? a.nombre + ' ' + a.apellidos : a === null && !api.failed() ? 'Atleta no encontrado' : ''" [hideTitle]="!!a" section="Atletas" [crumb]="a ? a.nombre + ' ' + a.apellidos : 'Atleta'">
      <!-- Figma 40: the hero sits closer to the breadcrumbs than a titled page (U10-R1-3) -->
      <div [class]="a !== null ? '-mt-8 md:-mt-10' : ''">
      @if (avisoConfirmado()) { <gr-alert tone="success" class="-mt-4 mb-8" title="Aviso confirmado">Te escribiremos 30 minutos antes de que {{ avisoConfirmado() }} salga a la plataforma.</gr-alert> }
      @if (baja() === 'ok') { <gr-alert tone="success" class="-mt-4 mb-8" title="Aviso desactivado">Ya no te escribiremos sobre {{ a?.nombre || 'este atleta' }}. Puedes volver a activarlo cuando quieras.</gr-alert> }
      @if (baja() === 'error') { <gr-alert tone="warning" class="-mt-4 mb-8" title="No hemos podido desactivar el aviso">El enlace no es válido o ya se usó. Si sigues recibiendo emails, responde a cualquiera de ellos.</gr-alert> }
      @if (a === undefined) {
        <div class="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]"><gr-skeleton class="h-[520px] rounded-lg" /><gr-skeleton class="h-96 rounded-lg" /></div>
      } @else if (a === null) {
        @if (!api.failed()) { <p class="text-body-m text-text-tertiary">Este atleta no existe o ya no está inscrito. <a routerLink="/atletas" class="text-accent-text underline">Ver todos los atletas</a></p> }
        @else if (!fallo.limitado()) { <gr-alert tone="warning" title="No hemos podido cargar el atleta">Estamos teniendo un problema temporal. Vuelve a intentarlo en unos minutos.</gr-alert> }
      } @else {
        <div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div class="flex flex-col gap-6">
            <section class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
              <!-- Without photo, mobile keeps the Figma ≈300 px card instead of a 4:5 block of initials (U10-R2-4). -->
              <div class="relative bg-[linear-gradient(160deg,#3a0f17,#171213)]" [class]="a.fotoUrl ? 'aspect-[4/5]' : 'min-h-[300px] lg:aspect-[4/5]'">
                @if (a.fotoUrl) { <img [src]="a.fotoUrl" [alt]="a.nombre + ' ' + a.apellidos" class="size-full object-cover" [style.object-position]="a.focalX + '% ' + a.focalY + '%'" fetchpriority="high" /> }
                @else { <span class="absolute inset-x-0 top-0 bottom-1/3 flex items-center justify-center font-display text-[64px] text-white/85 italic lg:inset-0 lg:text-[96px]">{{ ini(a) }}</span> }
                <div class="absolute inset-x-0 bottom-0 bg-[linear-gradient(transparent,rgb(14_12_13/0.95))] p-5 pt-16"><p class="font-display text-[40px] leading-[0.95] uppercase italic">{{ a.nombre }} {{ a.apellidos }}</p></div>
              </div>
              <div class="p-5">
                <p class="flex flex-wrap gap-1.5">
                  @if (a.categoria) { <span class="inline-flex h-7 items-center rounded-pill border border-accent/50 bg-accent-deep/30 px-2.5 text-mono-xs text-accent-text uppercase">{{ a.sexo }} {{ cat(a.categoria) }} kg</span> }
                  @if (a.divisionNombre) { <span class="inline-flex h-7 items-center rounded-pill border border-line-strong px-2.5 text-mono-xs uppercase">{{ a.divisionNombre }}</span> }
                  <span class="inline-flex h-7 items-center gap-1 rounded-pill border border-line-strong px-2.5 text-mono-xs uppercase"><gr-icon name="clock" [size]="12" />{{ a.flight ? 'Flight ' + a.flight + (a.plataforma ? ' · Plataforma ' + a.plataforma : '') : 'Horario por publicar' }}</span>
                </p>
                <p class="mt-3 flex items-center gap-2 text-body-s text-text-secondary"><gr-icon name="users" [size]="16" />{{ a.club || 'Independiente' }}{{ a.ciudad ? ' · ' + a.ciudad : '' }}</p>
                <div class="mt-4 flex gap-2">
                  <button type="button" (click)="fav.seguir(a.slug)" [attr.aria-pressed]="fav.slugs().includes(a.slug)" class="flex h-11 flex-1 items-center gap-2 rounded-pill border bg-bg-raised px-4 text-label-m hover:border-text-tertiary focus-visible:outline-2 focus-visible:outline-accent-text"
                    [class]="fav.slugs().includes(a.slug) ? 'border-accent bg-accent-deep/40 text-accent-text' : 'border-line-strong'">
                    <svg viewBox="0 0 24 24" width="16" height="16" [attr.fill]="fav.slugs().includes(a.slug) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></svg>
                    {{ fav.slugs().includes(a.slug) ? 'Siguiendo' : 'Seguir' }}
                  </button>
                  <button type="button" class="flex size-11 items-center justify-center rounded-full border border-line-strong hover:border-text-tertiary focus-visible:outline-2 focus-visible:outline-accent-text" aria-label="Compartir" (click)="compartir(a)"><gr-icon name="share" [size]="16" /></button>
                </div>
                @if (copiado()) { <p class="mt-2 text-body-xs text-success" aria-live="polite">Enlace copiado</p> }
              </div>
            </section>
            @if (a.permiteSeguir) {
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <div class="flex gap-3"><span class="flex size-10 shrink-0 items-center justify-center rounded-sm bg-accent-deep/40 text-accent-text"><gr-icon name="bell" [size]="18" /></span>
                  <div><h2 class="text-ui-h5">Avísame cuando compita</h2><p class="text-body-xs text-text-tertiary">Un email 30 min antes de que salga a la plataforma.</p></div></div>
                @if (avisoEnviado()) {
                  <gr-alert tone="success" class="mt-4" title="Revisa tu email">Te hemos enviado un enlace para confirmar el aviso.</gr-alert>
                } @else {
                  <form class="mt-4 flex flex-col gap-3" (ngSubmit)="avisar(a)" novalidate>
                    <div class="flex gap-2">
                      <label class="relative min-w-0 flex-1"><span class="sr-only">Tu email</span><gr-icon name="mail" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
                        <input type="email" name="email" autocomplete="email" placeholder="tu@email.com" [(ngModel)]="email" class="h-11 w-full rounded-md border border-line-strong bg-bg-field pr-3 pl-9 text-body-s focus:border-accent-text focus:outline-none" /></label>
                      <button grButton variant="primary" type="submit" [loading]="enviando()">Avisarme</button>
                    </div>
                    <label class="flex min-h-11 items-start gap-3 text-body-xs text-text-secondary"><input type="checkbox" name="acepta" [(ngModel)]="acepta" class="mt-0.5 size-5 accent-[#C42B3E]" />Acepto recibir este aviso. <a routerLink="/privacidad" class="text-accent-text underline">Privacidad</a></label>
                    @if (avisoError()) { <p class="text-body-xs text-accent-text" role="alert">{{ avisoError() }}</p> }
                  </form>
                }
              </section>
            }
          </div>

          <div class="flex min-w-0 flex-col gap-6">
            <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <h2 class="text-ui-h5">Primeros intentos</h2>
              <p class="text-body-xs text-text-tertiary">Se confirman en el pesaje. Los siguientes se deciden en la plataforma.</p>
              <ul class="mt-3">
                @for (m of lifts; track m.k) {
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
              <div class="flex items-center justify-between gap-3"><h2 class="text-ui-h5">Su día</h2>@if (diaTxt()) { <span class="text-body-xs text-text-tertiary">{{ diaTxt() }}</span> }</div>
              @if (a.horaInicio || a.pesajeInicio) {
                <ol class="mt-3">
                  @if (a.pesajeInicio) { <li class="flex items-center gap-4 border-b border-line-subtle py-3"><span class="w-12 text-mono-s">{{ hora(a.pesajeInicio) }}</span><span class="flex size-8 shrink-0 items-center justify-center rounded-sm bg-bg-raised"><gr-icon name="scale" [size]="16" /></span><span><span class="block text-label-m">Pesaje</span><span class="block text-body-xs text-text-tertiary">{{ hora(a.pesajeInicio) }}–{{ hora(a.pesajeFin) }} · trae DNI y licencia</span></span></li> }
                  @if (a.horaInicio) { <li class="flex items-center gap-4 py-3"><span class="w-12 text-mono-s">{{ hora(a.horaInicio) }}</span><span class="flex size-8 shrink-0 items-center justify-center rounded-sm bg-bg-raised"><gr-icon name="zap" [size]="16" /></span><span><span class="block text-label-m">Empieza su flight</span><span class="block text-body-xs text-text-tertiary">Flight {{ a.flight }}{{ a.plataforma ? ' · Plataforma ' + a.plataforma : '' }}</span></span></li> }
                </ol>
                <a [href]="ics + '?atletas=' + a.slug" download class="mt-4 flex h-11 items-center justify-center gap-2 rounded-md border border-line-strong bg-bg-raised text-label-m hover:border-text-tertiary focus-visible:outline-2 focus-visible:outline-accent-text">Añadir a mi calendario <gr-icon name="arrow-right" [size]="16" /></a>
                <p class="mt-2 text-body-xs text-text-tertiary">Las horas se recalculan solas si el flight va con retraso.</p>
              } @else {
                <p class="mt-3 text-body-s text-text-secondary">El horario se publica cuando la organización cierre los flights. Si le sigues, lo verás aquí y en tu horario.</p>
              }
            </section>
            @if (a.marcas) {
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <div class="flex flex-wrap items-center justify-between gap-2"><h2 class="text-ui-h5">Mejores marcas</h2><span class="rounded-pill border border-line-strong px-2.5 py-1 text-mono-xs text-text-tertiary">Declaradas por el atleta</span></div>
                <ul class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  @for (m of lifts; track m.k) { <li class="rounded-md bg-bg-raised p-3"><p class="text-mono-xs text-text-tertiary">{{ m.short }}</p><p class="text-ui-h3">{{ kg(a.marcas[m.k]) }}</p></li> }
                  <li class="rounded-md bg-bg-raised p-3"><p class="text-mono-xs text-text-tertiary">Total</p><p class="text-ui-h3 text-accent-text">{{ kg(a.totalPrevisto) }}</p></li>
                </ul>
              </section>
            }
            @if (a.bio || a.frase || a.entrenador || a.instagram || a.historial.length) {
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <h2 class="text-ui-h5">Sobre {{ a.nombre }}</h2>
                @if (a.bio || a.frase) { <p class="mt-3 text-body-m text-text-secondary">{{ a.bio || a.frase }}</p> }
                <dl class="mt-4 flex flex-col gap-2 text-body-s">
                  @if (a.entrenador) { <div class="flex gap-2"><gr-icon name="user" [size]="16" class="mt-0.5 text-accent-text" /><dt class="text-text-tertiary">Entrenador/a:</dt><dd>{{ a.entrenador }}</dd></div> }
                  @if (a.instagram) { <div class="flex gap-2"><gr-icon name="instagram" [size]="16" class="mt-0.5 text-accent-text" /><dt class="text-text-tertiary">Instagram:</dt><dd><a [href]="'https://www.instagram.com/' + a.instagram.replace('@', '') + '/'" target="_blank" rel="noopener nofollow" class="hover:text-accent-text">{{ a.instagram }}</a></dd></div> }
                  @if (a.historial.length) { <div class="flex gap-2"><gr-icon name="trophy" [size]="16" class="mt-0.5 text-accent-text" /><dt class="text-text-tertiary">Historial:</dt><dd>@for (h of a.historial; track $index) { <span class="block">{{ h.competicion }}</span> }</dd></div> }
                </dl>
              </section>
            }
            @if (a.tambien.length) {
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <h2 class="text-ui-h5">También en {{ a.categoria ? a.sexo + ' ' + cat(a.categoria) + ' kg' : 'la misma categoría' }}</h2>
                <ul class="mt-2">
                  @for (o of a.tambien; track o.slug) {
                    <li class="flex items-center gap-3 border-b border-line-subtle py-2 last:border-0">
                      <a [routerLink]="'/atletas/' + o.slug" class="flex min-w-0 flex-1 items-center gap-3">
                        @if (o.fotoUrl) { <img [src]="o.fotoUrl" alt="" class="size-11 rounded-full object-cover" [style.object-position]="o.focalX + '% ' + o.focalY + '%'" loading="lazy" /> }
                        @else { <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-deep/50 text-label-s">{{ ini(o) }}</span> }
                        <span class="min-w-0 break-words"><span class="block text-label-m">{{ o.nombre }} {{ o.apellidos }}</span><span class="block text-body-xs text-text-tertiary">{{ o.club || 'Independiente' }} · {{ o.divisionNombre }}</span></span>
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
  protected readonly kg = kg;
  protected readonly hora = hora;
  protected readonly ini = iniciales;
  protected readonly ics = ICS_URL;
  private readonly fan = inject(FanSession);
  protected readonly lifts: { k: 'sq' | 'bp' | 'dl'; label: string; short: string }[] = [{ k: 'sq', label: 'Sentadilla', short: 'SQ' }, { k: 'bp', label: 'Press de banca', short: 'BP' }, { k: 'dl', label: 'Peso muerto', short: 'DL' }];
  protected readonly ficha = signal<FichaPub | null | undefined>(undefined);
  protected readonly diaTxt = signal('');
  protected readonly copiado = signal(false);
  protected email = '';
  protected acepta = false;
  protected readonly enviando = signal(false);
  protected readonly avisoEnviado = signal(false);
  protected readonly avisoError = signal('');
  protected readonly avisoConfirmado = signal('');
  protected readonly baja = signal<'' | 'ok' | 'error'>('');

  constructor() {
    const seo = inject(Seo);
    const competition = inject(Competition);
    const route = inject(ActivatedRoute);
    void inject(PendingTasks).run(async () => {
      await Promise.resolve(); // route inputs are set after construction
      const [f, c] = await Promise.all([this.api.ficha(this.slug()), competition.load()]);
      this.ficha.set(f);
      if (!f) {
        this.api.notFound();
        seo.set(this.api.failed()
          ? { title: 'GR Strength Cup', description: 'Contenido no disponible ahora mismo.', path: '/atletas/' + this.slug() }
          : { title: 'Atleta no encontrado · GR Strength Cup', description: 'Este atleta no existe o ya no está inscrito.', path: '/atletas/' + this.slug(), robots: 'noindex' });
        return;
      }
      if (c?.fechaInicio) this.diaTxt.set(new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(c.fechaInicio)));
      const nombre = `${f.nombre} ${f.apellidos}`;
      // Sin categoría (atleta recién creado desde una solicitud) no se pinta «M  kg».
      const catTxt = f.categoria ? `${f.sexo} ${cat(f.categoria)} kg` : '';
      const desc = catTxt
        ? `${nombre} (${f.club || 'independiente'}) compite en ${f.sexo === 'F' ? 'femenino' : 'masculino'} ${cat(f.categoria)} kg ${f.divisionNombre} en la GR Strength Cup.`
        : `${nombre} (${f.club || 'independiente'}) compite en la GR Strength Cup.`;
      seo.set({
        title: catTxt ? `${nombre} · ${catTxt} · GR Strength Cup` : `${nombre} · GR Strength Cup`,
        description: `${desc}${f.totalPrevisto ? ' Total previsto: ' + kg(f.totalPrevisto) + ' kg.' : ''}`,
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
    });
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
    this.avisoError.set('');
    if (!this.email.includes('@')) return this.avisoError.set('Escribe un email válido.');
    if (!this.acepta) return this.avisoError.set('Marca la casilla para recibir el aviso.');
    // Seguir needs the fan (or athlete) session: without it, the login modal opens and brings the person back here.
    if (!(await this.fan.cargar())) return this.fav.pedirAcceso({ accion: 'avisar', slug: a.slug, email: this.email });
    this.enviando.set(true);
    try {
      await this.api.seguir(a.slug, this.email);
      this.avisoEnviado.set(true);
    } catch (e) {
      if ((e as { status?: number }).status === 401) { this.fan.sesionPerdida(); return this.fav.pedirAcceso({ accion: 'avisar', slug: a.slug, email: this.email }); }
      this.avisoError.set((e as { error?: { detail?: string } }).error?.detail ?? 'Inténtalo de nuevo en unos minutos.');
    } finally {
      this.enviando.set(false);
    }
  }

  protected async compartir(a: FichaPub): Promise<void> {
    const url = location.origin + '/atletas/' + a.slug;
    if (navigator.share) {
      await navigator.share({ title: `${a.nombre} ${a.apellidos} · GR Strength Cup`, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(url);
    this.copiado.set(true);
    setTimeout(() => this.copiado.set(false), 2500);
  }
}

// ======================================================= /participantes ===

/** /participantes (Figma page 26): confirmed athletes by block (flight once published), searchable. */
@Component({
  selector: 'gr-participantes-page',
  imports: [RouterLink, Page, FormsModule, GrIcon, GrSkeleton, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = data();
    <gr-page title="Participantes" accent="y flights" eyebrow="La plantilla" section="El evento" crumb="Participantes"
      subtitle="Lista de atletas por bloque de competición. Busca tu nombre para ver tu hora de pesaje y tu flight.">
      <p pageStamps class="flex flex-wrap gap-2">
        <span class="inline-flex items-center gap-2 rounded-sm border border-line-subtle px-3 py-2 text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="14" />Actualizado automáticamente desde la lista de la AEP</span>
        <span class="inline-flex h-7 items-center rounded-full border border-info bg-info/12 px-3 text-label-xs text-info uppercase">Datos de ejemplo</span>
      </p>
      @if (p === undefined) { <gr-skeleton class="h-40 rounded-lg" /> }
      @else if (p) {
        <!-- Figma «Resumen»: places with the bar, then women and men with the big number under the label -->
        <div class="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          <div class="col-span-2 rounded-2xl border border-line-subtle bg-bg-card p-5 md:col-span-1">
            <p class="flex items-center justify-between text-label-s">Plazas ocupadas @if (p.plazas) { <span class="text-mono-xs text-accent-text">{{ p.ocupadas }} / {{ p.plazas }}</span> }</p>
            @if (p.plazas) { <div class="mt-3 h-1.5 rounded-pill bg-bg-raised"><div class="h-full rounded-pill bg-accent" [style.width.%]="pct()"></div></div> }
            <p class="mt-2 text-body-xs text-text-tertiary">{{ p.plazas && p.ocupadas >= p.plazas ? 'Plantilla completa' : (p.reserva ? p.reserva + ' en reserva' : 'Bloque completo') }}</p>
          </div>
          <div class="flex flex-col gap-1 rounded-2xl border border-line-subtle bg-bg-card p-5"><span class="text-label-s text-text-secondary">Mujeres</span><span class="font-display text-[44px] leading-none italic">{{ p.mujeres }}</span></div>
          <div class="flex flex-col gap-1 rounded-2xl border border-line-subtle bg-bg-card p-5"><span class="text-label-s text-text-secondary">Hombres</span><span class="font-display text-[44px] leading-none italic">{{ p.hombres }}</span></div>
        </div>

        <div class="mt-8 flex flex-wrap items-center gap-2">
          <label class="relative min-w-0 flex-1 basis-64 md:max-w-sm">
            <span class="sr-only">Buscar atleta o club</span>
            <gr-icon name="search" [size]="18" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
            <input type="search" placeholder="Buscar atleta o club…" [ngModel]="q()" (ngModelChange)="q.set($event)" class="h-12 w-full rounded-md border border-line-strong bg-bg-field pr-3 pl-10 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" />
          </label>
          <!-- mobile: the chips in one sideways row under the search (Figma 26) -->
          <div class="-mx-5 flex w-[calc(100%+40px)] gap-2 overflow-x-auto px-5 [scrollbar-width:none] md:contents">
          @for (s of sexos; track s.v) {
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
                  <thead class="border-b border-line-subtle text-label-xs text-text-muted uppercase"><tr><th class="px-4 py-3 font-medium">Atleta</th><th class="px-4 py-3 font-medium">Club</th><th class="w-28 px-4 py-3 font-medium">Categoría</th><th class="w-20 px-4 py-3 font-medium">Flight</th><th class="w-36 px-4 py-3 font-medium">Pesaje</th></tr></thead>
                  <tbody>
                    @for (f of g.filas; track f.slug) {
                      <tr class="border-b border-line-subtle last:border-0"><td class="px-4 py-3.5"><a [routerLink]="'/atletas/' + f.slug" class="text-label-m hover:text-accent-text">{{ f.nombre }}</a></td><td class="truncate px-4 py-3 text-body-s text-text-secondary">{{ f.club || 'Independiente' }}</td>
                        <td class="px-4 py-3 text-label-s text-accent-text">{{ cat(f.categoria) }} kg</td><td class="px-4 py-3 text-mono-s">{{ f.flight || '–' }}</td><td class="px-4 py-3 text-mono-s">{{ f.pesajeInicio ? hora(f.pesajeInicio) + ' – ' + hora(f.pesajeFin) : 'Por publicar' }}</td></tr>
                    }
                  </tbody>
                </table>
              </div>
              <ul class="mt-3 overflow-hidden rounded-2xl border border-line-subtle bg-bg-card md:hidden">
                @for (f of g.filas; track f.slug) {
                  <li class="border-b border-line-subtle last:border-0"><a [routerLink]="'/atletas/' + f.slug" class="flex min-h-14 items-center gap-3 px-4 py-2">
                    <span class="min-w-0 flex-1"><span class="block truncate text-label-m">{{ f.nombre }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ f.club || 'Independiente' }}</span></span>
                    <span class="rounded-pill bg-accent-deep/40 px-2 py-0.5 text-mono-xs text-accent-text">{{ cat(f.categoria) }} kg</span>
                  </a></li>
                }
              </ul>
            </section>
          } @empty { <p class="rounded-lg border border-line-subtle bg-bg-card p-8 text-center text-body-m text-text-tertiary">Nadie coincide con «{{ q() }}».</p> }
        </div>

        @if (contacto()) {
          <div class="mt-10 flex flex-col gap-3 rounded-xl border border-info/40 bg-info/8 p-4 md:flex-row md:items-center">
            <gr-icon name="info" [size]="18" class="text-info" />
            <p class="flex-1 text-body-s text-text-secondary">¿No apareces en la lista o hay un error en tus datos? Escríbenos y lo corregimos.</p>
            <a [href]="'mailto:' + contacto()" class="inline-flex h-10 items-center justify-center rounded-sm bg-info/15 px-3 text-label-s text-info hover:bg-info/25">Contactar</a>
          </div>
        }
      }
      <div class="mt-18 flex flex-col gap-18 md:mt-24 md:gap-24">
        <gr-related [items]="relacionados" />
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class ParticipantesPage {
  private readonly api = inject(AtletasPublic);
  protected readonly cat = cat;
  protected readonly hora = hora;
  protected readonly data = signal<Participantes | null | undefined>(undefined);
  protected readonly contacto = signal('');
  protected readonly q = signal('');
  protected readonly sexo = signal<'' | 'F' | 'M'>('');
  protected readonly sexos = [{ v: '' as const, label: 'Todas' }, { v: 'F' as const, label: 'Femenino' }, { v: 'M' as const, label: 'Masculino' }];
  protected readonly relacionados: RelatedLink[] = [
    { titulo: 'Horarios', texto: 'Bloques por categoría', ruta: '/horarios' },
    { titulo: 'En directo', texto: 'Sigue la competición', ruta: '/en-directo' },
    { titulo: 'Reglamento', texto: 'Cómo funciona el pesaje', ruta: '/reglamento' },
  ];
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
      await applySeo(cms, seo, '/participantes', 'Participantes y flights · GR Strength Cup', 'Lista de atletas por bloque de competición: busca tu nombre para ver tu hora de pesaje y tu flight.');
    });
  }
}

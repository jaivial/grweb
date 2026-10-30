import { ChangeDetectionStrategy, Component, PLATFORM_ID, PendingTasks, computed, inject, input, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { GrAlert, GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { AtletasPublic, Favoritos, cat, hora, iniciales, kg, type AtletaPub, type FichaPub, type ListaPub, type Participantes } from '../core/atletas';
import { Cms } from '../core/cms';
import { Competition, type CompeticionPublica } from '../core/competition';
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
    <button type="button" (click)="$event.preventDefault(); $event.stopPropagation(); fav.toggle(slug())" [attr.aria-pressed]="on()" [attr.aria-label]="(on() ? 'Dejar de seguir a ' : 'Seguir a ') + nombre()"
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
  imports: [Page, FormsModule, GrIcon, GrButton, GrSkeleton, Fav, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let l = lista();
    <gr-page title="Los" [accent]="(plazas() || l?.resumen?.total || '') + ' atletas'" suffix="de la GR Cup" eyebrow="Competición 2026" crumb="Atletas"
      subtitle="Busca a quien vienes a animar, mira su categoría y a qué hora compite. Sigue a tus atletas y tendrás tu propio horario.">
      <p pageStamps class="mt-5 flex flex-wrap gap-2">
        @if (l?.actualizado) { <span class="inline-flex h-8 items-center gap-2 rounded-pill border border-line-strong px-3 text-mono-xs text-text-tertiary"><gr-icon name="clock" [size]="14" />Actualizado el {{ fecha(l!.actualizado) }} · Fuente: inscritos AEP</span> }
        <span class="inline-flex h-8 items-center rounded-pill border border-info/30 bg-info/10 px-3 text-mono-xs text-info">Datos de ejemplo</span>
        @if (inscripcion(); as i) { <span class="inline-flex h-8 items-center rounded-pill border border-line-strong px-3 text-mono-xs text-text-secondary">{{ i }}</span> }
      </p>

      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <label class="relative min-w-0 flex-1 basis-72 md:max-w-sm">
            <span class="sr-only">Buscar atleta</span>
            <gr-icon name="search" [size]="18" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
            <input type="search" placeholder="Busca por nombre o club" [ngModel]="q()" (ngModelChange)="q.set($event); limite.set(24)"
              class="h-12 w-full rounded-md border border-line-strong bg-bg-field pr-3 pl-10 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" />
          </label>
          @for (s of sexos; track s.v) {
            <button type="button" (click)="sexo.set(s.v); limite.set(24)" [attr.aria-pressed]="sexo() === s.v" class="inline-flex h-11 items-center gap-1.5 rounded-pill border px-3.5 text-label-s"
              [class]="sexo() === s.v ? 'border-accent-text bg-accent-deep/40 text-text-primary' : 'border-line-strong text-text-secondary hover:text-text-primary'">
              <gr-icon [name]="sexo() === s.v ? 'check' : 'plus'" [size]="14" />{{ s.label }}
            </button>
          }
          <button type="button" class="inline-flex h-11 items-center gap-1.5 rounded-pill border border-line-strong px-3.5 text-label-s md:hidden" (click)="filtros.set(!filtros())" [attr.aria-expanded]="filtros()">
            <gr-icon name="menu" [size]="14" />Filtros
          </button>
        </div>
        <div class="flex-wrap gap-2" [class]="filtros() ? 'flex' : 'hidden md:flex'">
          <select [ngModel]="categoria()" (ngModelChange)="categoria.set($event); limite.set(24)" aria-label="Categoría" class="h-10 rounded-md border border-line-strong bg-bg-field px-3 text-label-s">
            <option value="">Categoría</option>@for (c of categorias(); track c) { <option [value]="c">{{ c[0] }} {{ cat(c.slice(2)) }} kg</option> }
          </select>
          <select [ngModel]="club()" (ngModelChange)="club.set($event); limite.set(24)" aria-label="Club" class="h-10 max-w-52 rounded-md border border-line-strong bg-bg-field px-3 text-label-s">
            <option value="">Club</option>@for (c of clubs(); track c) { <option [value]="c">{{ c }}</option> }
          </select>
          <select [ngModel]="division()" (ngModelChange)="division.set($event); limite.set(24)" aria-label="División" class="h-10 rounded-md border border-line-strong bg-bg-field px-3 text-label-s">
            <option value="">División</option>@for (d of divisiones(); track d) { <option [value]="d">{{ d }}</option> }
          </select>
          <select [ngModel]="orden()" (ngModelChange)="orden.set($event)" aria-label="Orden" class="h-10 rounded-md border border-line-strong bg-bg-field px-3 text-label-s">
            <option value="horario">Orden: horario</option><option value="nombre">Orden: nombre</option><option value="categoria">Orden: categoría</option>
          </select>
          @if (fav.slugs().length) {
            <button type="button" (click)="soloFav.set(!soloFav())" [attr.aria-pressed]="soloFav()" class="inline-flex h-10 items-center gap-1.5 rounded-pill border px-3 text-label-s" [class]="soloFav() ? 'border-accent-text bg-accent-deep/40' : 'border-line-strong'">
              Mis atletas · {{ fav.slugs().length }}
            </button>
          }
        </div>
      </div>

      @if (l) {
        <ul class="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <li class="rounded-md border border-line-subtle bg-bg-card p-4"><p class="text-ui-h3">{{ l.resumen.total }}</p><p class="text-body-xs text-text-tertiary">atletas</p></li>
          <li class="rounded-md border border-line-subtle bg-bg-card p-4"><p class="text-ui-h3">{{ l.resumen.mujeres }} · {{ l.resumen.hombres }}</p><p class="text-body-xs text-text-tertiary">mujeres · hombres</p></li>
          <li class="rounded-md border border-line-subtle bg-bg-card p-4"><p class="text-ui-h3">{{ l.resumen.clubs }}</p><p class="text-body-xs text-text-tertiary">clubs</p></li>
          <li class="rounded-md border border-line-subtle bg-bg-card p-4"><p class="text-ui-h3">{{ l.resumen.flights || '–' }}</p><p class="text-body-xs text-text-tertiary">{{ l.resumen.flights ? 'flights · ' + l.resumen.plataformas + ' plataforma' : 'flights por publicar' }}</p></li>
        </ul>
      }

      @if (l === undefined) {
        <div class="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">@for (i of [1, 2, 3, 4]; track i) { <gr-skeleton class="h-72 rounded-lg" /> }</div>
      } @else {
        <!-- Desktop / tablet: cards -->
        <ul class="mt-8 hidden grid-cols-2 gap-4 md:grid lg:grid-cols-4">
          @for (a of visibles(); track a.slug) {
            <li>
              <a [href]="'/atletas/' + a.slug" class="group relative flex h-full flex-col overflow-hidden rounded-lg border bg-bg-card transition-colors hover:border-line-strong" [class]="fav.slugs().includes(a.slug) ? 'border-accent/60' : 'border-line-subtle'">
                <span class="relative block aspect-[4/3] overflow-hidden bg-[linear-gradient(160deg,#3a0f17,#171213)]">
                  @if (a.fotoUrl) { <img [src]="a.fotoUrl" [alt]="a.nombre + ' ' + a.apellidos" class="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" [style.object-position]="a.focalX + '% ' + a.focalY + '%'" loading="lazy" /> }
                  @else { <span class="absolute inset-0 flex items-center justify-center font-display text-[64px] text-white/90 italic">{{ ini(a) }}</span> }
                  <span class="absolute top-3 right-3"><gr-fav [slug]="a.slug" [nombre]="a.nombre" /></span>
                </span>
                <span class="flex flex-1 flex-col p-4">
                  <span class="text-label-l">{{ a.nombre }} {{ a.apellidos }}</span>
                  <span class="text-body-xs text-text-tertiary">{{ a.club || 'Independiente' }}{{ a.ciudad ? ' · ' + a.ciudad : '' }}</span>
                  <span class="mt-3 flex flex-wrap gap-1.5">
                    <span class="inline-flex h-6 items-center rounded-pill border border-accent/50 px-2 text-mono-xs text-accent-text">{{ a.sexo }} {{ cat(a.categoria) }} kg</span>
                    <span class="inline-flex h-6 items-center rounded-pill border border-line-strong px-2 text-mono-xs text-text-secondary">{{ a.divisionNombre }}</span>
                  </span>
                  <span class="mt-auto flex items-center gap-1.5 pt-3 text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="12" />{{ a.flight ? 'Flight ' + a.flight + (a.plataforma ? ' · Plataforma ' + a.plataforma : '') + (a.horaInicio ? ' · ' + hora(a.horaInicio) : '') : 'Horario por publicar' }}</span>
                </span>
              </a>
            </li>
          } @empty { <li class="col-span-full rounded-lg border border-line-subtle bg-bg-card p-10 text-center text-body-m text-text-tertiary">Nadie coincide con la búsqueda.</li> }
        </ul>
        <!-- Mobile: list grouped by class -->
        <div class="mt-6 flex flex-col gap-5 md:hidden">
          @for (g of grupos(); track g.titulo) {
            <section>
              <h2 class="text-mono-xs text-text-tertiary">{{ g.titulo }}</h2>
              <ul class="mt-2 flex flex-col">
                @for (a of g.items; track a.slug) {
                  <li class="border-b border-line-subtle last:border-0">
                    <a [href]="'/atletas/' + a.slug" class="flex min-h-16 items-center gap-3 py-2">
                      @if (a.fotoUrl) { <img [src]="a.fotoUrl" alt="" class="size-10 shrink-0 rounded-full object-cover" [style.object-position]="a.focalX + '% ' + a.focalY + '%'" loading="lazy" /> }
                      @else { <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-deep/50 text-label-s">{{ ini(a) }}</span> }
                      <span class="min-w-0 flex-1"><span class="block truncate text-label-m">{{ a.nombre }} {{ a.apellidos }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ a.club || 'Independiente' }} · {{ a.sexo }} {{ cat(a.categoria) }} kg · {{ a.divisionNombre }}</span></span>
                      <span class="text-mono-xs text-text-secondary">{{ a.horaInicio ? hora(a.horaInicio) : '' }}</span>
                      <gr-fav [slug]="a.slug" [nombre]="a.nombre" />
                    </a>
                  </li>
                }
              </ul>
            </section>
          } @empty { <p class="rounded-lg border border-line-subtle bg-bg-card p-8 text-center text-body-m text-text-tertiary">Nadie coincide con la búsqueda.</p> }
        </div>
        @if (filtrados().length) {
          <div class="mt-8 flex flex-col items-center gap-3">
            <p class="text-body-xs text-text-tertiary">Mostrando {{ visibles().length }} de {{ filtrados().length }}</p>
            @if (visibles().length < filtrados().length) { <button grButton (click)="limite.set(limite() + 24)">Cargar 24 más</button> }
          </div>
        }
      }

      <div class="mt-18 flex flex-col gap-18 md:mt-24 md:gap-24">
        <section class="flex flex-col gap-4 rounded-xl border border-accent/40 bg-[linear-gradient(120deg,#3a0f17,#1b1112_60%)] p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <div class="flex gap-4">
            <span class="flex size-11 shrink-0 items-center justify-center rounded-sm bg-accent-deep/60 text-accent-text"><gr-icon name="user" [size]="18" /></span>
            <div><h2 class="text-ui-h5">¿Compites? Completa tu perfil</h2><p class="mt-1 text-body-s text-text-secondary">Entra con el email de tu inscripción en la AEP: foto, club, mejores marcas y tus alturas de rack para agilizar el pesaje.</p></div>
          </div>
          <a grButton iconRight="arrow-right" href="/area-atleta" class="shrink-0">Área de atleta</a>
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
  protected readonly ini = iniciales;
  protected readonly lista = signal<ListaPub | null | undefined>(undefined);
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
  protected readonly inscripcion = computed(() => {
    const c = this.comp();
    const n = this.lista()?.resumen.total ?? 0;
    const p = this.plazas();
    if (!c) return '';
    const e = { abierta: 'Inscripciones abiertas', completa: 'Inscripciones completas', cerrada: 'Inscripciones cerradas', proximamente: 'Inscripciones próximamente' }[c.inscripcion.estado] ?? '';
    return p ? `${e} · ${n}/${p}` : e;
  });
  protected readonly categorias = computed(() => [...new Set((this.lista()?.atletas ?? []).map((a) => a.sexo + ' ' + a.categoria))].sort(catSort));
  protected readonly clubs = computed(() => [...new Set((this.lista()?.atletas ?? []).map((a) => a.club).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')));
  protected readonly divisiones = computed(() => [...new Set((this.lista()?.atletas ?? []).map((a) => a.divisionNombre))]);
  protected readonly filtrados = computed(() => {
    const q = norm(this.q());
    const list = (this.lista()?.atletas ?? []).filter((a) =>
      (!this.sexo() || a.sexo === this.sexo()) && (!this.categoria() || a.sexo + ' ' + a.categoria === this.categoria()) && (!this.club() || a.club === this.club()) &&
      (!this.division() || a.divisionNombre === this.division()) && (!this.soloFav() || this.fav.slugs().includes(a.slug)) && (!q || norm(`${a.nombre} ${a.apellidos} ${a.club}`).includes(q)));
    const o = this.orden();
    if (o === 'nombre') return [...list].sort((a, b) => (a.apellidos + a.nombre).localeCompare(b.apellidos + b.nombre, 'es'));
    if (o === 'categoria') return [...list].sort((a, b) => catSort(a.sexo + ' ' + a.categoria, b.sexo + ' ' + b.categoria) || a.apellidos.localeCompare(b.apellidos, 'es'));
    return list; // the API already sorts by start time, then class
  });
  protected readonly visibles = computed(() => this.filtrados().slice(0, this.limite()));
  protected readonly grupos = computed(() => {
    const out: { titulo: string; items: AtletaPub[] }[] = [];
    for (const a of this.visibles()) {
      const t = `${sexoTxt[a.sexo]} ${cat(a.categoria)} kg${a.flight ? ' · Flight ' + a.flight : ''}`;
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
    void inject(PendingTasks).run(async () => {
      const [l, c] = await Promise.all([this.api.lista(), competition.load()]);
      this.lista.set(l ?? { resumen: { total: 0, mujeres: 0, hombres: 0, clubs: 0, flights: 0, plataformas: 0 }, atletas: [], actualizado: '' });
      this.comp.set(c);
      await applySeo(cms, seo, '/atletas', 'Atletas · GR Strength Cup', `Los ${l?.resumen.total ?? ''} atletas de la GR Strength Cup: categoría, club y horario de cada uno.`);
    });
  }

  protected fecha(iso: string): string {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeZone: 'Europe/Madrid' }).format(new Date(iso));
  }
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/** «F -47» before «F -52» … «M +120» (sex, then weight, «+» classes last). */
function catSort(a: string, b: string): number {
  const k = (s: string) => {
    const [sexo, c] = s.split(' ');
    return [sexo, Number(c.replace('+', '')) + (c.startsWith('+') ? 0.5 : 0)] as const;
  };
  const [sa, wa] = k(a);
  const [sb, wb] = k(b);
  return sa === sb ? wa - wb : sa.localeCompare(sb);
}

// ====================================================== /atletas/:slug ===

/** /atletas/:slug (Figma page 40): profile, «Avísame cuando compita», openers, day, best lifts, others in the class. */
@Component({
  selector: 'gr-atleta-page',
  imports: [Page, FormsModule, GrAlert, GrButton, GrIcon, GrSkeleton, Fav],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = ficha();
    <gr-page [title]="a ? a.nombre + ' ' + a.apellidos : a === null ? 'Atleta no encontrado' : ''" [hideTitle]="!!a" section="Atletas" [crumb]="a ? a.nombre + ' ' + a.apellidos : 'Atleta'">
      @if (avisoConfirmado()) { <gr-alert tone="success" class="-mt-4 mb-8" title="Aviso confirmado">Te escribiremos 30 minutos antes de que {{ avisoConfirmado() }} salga a la plataforma.</gr-alert> }
      @if (baja() === 'ok') { <gr-alert tone="success" class="-mt-4 mb-8" title="Aviso desactivado">Ya no te escribiremos sobre {{ a?.nombre || 'este atleta' }}. Puedes volver a activarlo cuando quieras.</gr-alert> }
      @if (baja() === 'error') { <gr-alert tone="warning" class="-mt-4 mb-8" title="No hemos podido desactivar el aviso">El enlace no es válido o ya se usó. Si sigues recibiendo emails, responde a cualquiera de ellos.</gr-alert> }
      @if (a === undefined) {
        <div class="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]"><gr-skeleton class="h-[520px] rounded-lg" /><gr-skeleton class="h-96 rounded-lg" /></div>
      } @else if (a === null) {
        @if (!api.failed()) { <p class="text-body-m text-text-tertiary">Este atleta no existe o ya no está inscrito. <a href="/atletas" class="text-accent-text underline">Ver todos los atletas</a></p> }
      } @else {
        <div class="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div class="flex flex-col gap-6">
            <section class="overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
              <div class="relative aspect-[4/5] bg-[linear-gradient(160deg,#3a0f17,#171213)]">
                @if (a.fotoUrl) { <img [src]="a.fotoUrl" [alt]="a.nombre + ' ' + a.apellidos" class="size-full object-cover" [style.object-position]="a.focalX + '% ' + a.focalY + '%'" fetchpriority="high" /> }
                @else { <span class="absolute inset-0 flex items-center justify-center font-display text-[96px] text-white/85 italic">{{ ini(a) }}</span> }
                <div class="absolute inset-x-0 bottom-0 bg-[linear-gradient(transparent,rgb(14_12_13/0.95))] p-5 pt-16"><p class="font-display text-[40px] leading-[0.95] uppercase italic">{{ a.nombre }} {{ a.apellidos }}</p></div>
              </div>
              <div class="p-5">
                <p class="flex flex-wrap gap-1.5">
                  <span class="inline-flex h-7 items-center rounded-pill border border-accent/50 bg-accent-deep/30 px-2.5 text-mono-xs text-accent-text">{{ a.sexo }} {{ cat(a.categoria) }} kg</span>
                  <span class="inline-flex h-7 items-center rounded-pill border border-line-strong px-2.5 text-mono-xs">{{ a.divisionNombre }}</span>
                  <span class="inline-flex h-7 items-center gap-1 rounded-pill border border-line-strong px-2.5 text-mono-xs"><gr-icon name="clock" [size]="12" />{{ a.flight ? 'Flight ' + a.flight + (a.plataforma ? ' · Plataforma ' + a.plataforma : '') : 'Horario por publicar' }}</span>
                </p>
                <p class="mt-3 flex items-center gap-2 text-body-s text-text-secondary"><gr-icon name="users" [size]="16" />{{ a.club || 'Independiente' }}{{ a.ciudad ? ' · ' + a.ciudad : '' }}</p>
                <div class="mt-4 flex gap-2">
                  <button type="button" (click)="fav.toggle(a.slug)" [attr.aria-pressed]="fav.slugs().includes(a.slug)" class="flex h-11 flex-1 items-center justify-center gap-2 rounded-md border text-label-m"
                    [class]="fav.slugs().includes(a.slug) ? 'border-accent bg-accent-deep/40 text-accent-text' : 'border-line-strong'">
                    <svg viewBox="0 0 24 24" width="16" height="16" [attr.fill]="fav.slugs().includes(a.slug) ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></svg>
                    {{ fav.slugs().includes(a.slug) ? 'Siguiendo' : 'Seguir' }}
                  </button>
                  <button type="button" class="flex size-11 items-center justify-center rounded-md border border-line-strong" aria-label="Compartir" (click)="compartir(a)"><gr-icon name="send" [size]="16" /></button>
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
                    <label class="flex min-h-11 items-start gap-3 text-body-xs text-text-secondary"><input type="checkbox" name="acepta" [(ngModel)]="acepta" class="mt-0.5 size-5 accent-[#C42B3E]" />Acepto recibir este aviso. <a href="/privacidad" class="text-accent-text underline">Privacidad</a></label>
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
                  <li class="flex items-center gap-3 border-b border-line-subtle py-3 last:border-0">
                    <span class="w-32 text-label-m">{{ m.label }}</span>
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
                  @if (a.pesajeInicio) { <li class="flex gap-4 border-b border-line-subtle py-3"><span class="w-12 text-mono-s">{{ hora(a.pesajeInicio) }}</span><span><span class="block text-label-m">Pesaje</span><span class="block text-body-xs text-text-tertiary">{{ hora(a.pesajeInicio) }}–{{ hora(a.pesajeFin) }} · trae DNI y licencia</span></span></li> }
                  @if (a.horaInicio) { <li class="flex gap-4 py-3"><span class="w-12 text-mono-s">{{ hora(a.horaInicio) }}</span><span><span class="block text-label-m">Empieza su flight</span><span class="block text-body-xs text-text-tertiary">Flight {{ a.flight }}{{ a.plataforma ? ' · Plataforma ' + a.plataforma : '' }}</span></span></li> }
                </ol>
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
            @if (a.bio || a.frase || a.entrenador || a.instagram || a.historial) {
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <h2 class="text-ui-h5">Sobre {{ a.nombre }}</h2>
                @if (a.bio || a.frase) { <p class="mt-3 text-body-m text-text-secondary">{{ a.bio || a.frase }}</p> }
                <dl class="mt-4 flex flex-col gap-2 text-body-s">
                  @if (a.entrenador) { <div class="flex gap-2"><gr-icon name="user" [size]="16" class="mt-0.5 text-accent-text" /><dt class="text-text-tertiary">Entrenador/a:</dt><dd>{{ a.entrenador }}</dd></div> }
                  @if (a.instagram) { <div class="flex gap-2"><gr-icon name="camera" [size]="16" class="mt-0.5 text-accent-text" /><dt class="text-text-tertiary">Instagram:</dt><dd><a [href]="'https://www.instagram.com/' + a.instagram.replace('@', '') + '/'" target="_blank" rel="noopener nofollow" class="hover:text-accent-text">{{ a.instagram }}</a></dd></div> }
                  @if (a.historial) { <div class="flex gap-2"><gr-icon name="trophy" [size]="16" class="mt-0.5 text-accent-text" /><dt class="text-text-tertiary">Historial:</dt><dd>{{ a.historial }}</dd></div> }
                </dl>
              </section>
            }
            @if (a.tambien.length) {
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <h2 class="text-ui-h5">También en {{ a.sexo }} {{ cat(a.categoria) }} kg</h2>
                <ul class="mt-2">
                  @for (o of a.tambien; track o.slug) {
                    <li class="flex items-center gap-3 border-b border-line-subtle py-2 last:border-0">
                      <a [href]="'/atletas/' + o.slug" class="flex min-w-0 flex-1 items-center gap-3">
                        @if (o.fotoUrl) { <img [src]="o.fotoUrl" alt="" class="size-11 rounded-full object-cover" [style.object-position]="o.focalX + '% ' + o.focalY + '%'" loading="lazy" /> }
                        @else { <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-deep/50 text-label-s">{{ ini(o) }}</span> }
                        <span class="min-w-0"><span class="block truncate text-label-m">{{ o.nombre }} {{ o.apellidos }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ o.club || 'Independiente' }} · {{ o.divisionNombre }}</span></span>
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
    </gr-page>
  `,
})
export class AtletaPage {
  readonly slug = input.required<string>();
  protected readonly api = inject(AtletasPublic);
  protected readonly fav = inject(Favoritos);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly cat = cat;
  protected readonly kg = kg;
  protected readonly hora = hora;
  protected readonly ini = iniciales;
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
        seo.set({ title: 'Atleta no encontrado · GR Strength Cup', description: 'Este atleta no existe o ya no está inscrito.', path: '/atletas/' + this.slug() });
        return;
      }
      if (c?.fechaInicio) this.diaTxt.set(new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(new Date(c.fechaInicio)));
      const nombre = `${f.nombre} ${f.apellidos}`;
      seo.set({
        title: `${nombre} · ${f.sexo} ${cat(f.categoria)} kg · GR Strength Cup`,
        description: `${nombre} (${f.club || 'independiente'}) compite en ${f.sexo === 'F' ? 'femenino' : 'masculino'} ${cat(f.categoria)} kg ${f.divisionNombre} en la GR Strength Cup.${f.totalPrevisto ? ' Total previsto: ' + kg(f.totalPrevisto) + ' kg.' : ''}`,
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
    });
  }

  protected async avisar(a: FichaPub): Promise<void> {
    this.avisoError.set('');
    if (!this.email.includes('@')) return this.avisoError.set('Escribe un email válido.');
    if (!this.acepta) return this.avisoError.set('Marca la casilla para recibir el aviso.');
    this.enviando.set(true);
    try {
      await this.api.seguir(a.slug, this.email);
      this.avisoEnviado.set(true);
    } catch (e) {
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
  imports: [Page, FormsModule, GrIcon, GrSkeleton, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = data();
    <gr-page title="Participantes" accent="y flights" eyebrow="Inscritos" section="El evento" crumb="Participantes"
      subtitle="Lista de atletas inscritos por bloque de competición. Busca tu nombre para ver tu hora de pesaje y tu flight.">
      <p pageStamps class="mt-5 flex flex-wrap gap-2">
        <span class="inline-flex h-8 items-center gap-2 rounded-pill border border-line-strong px-3 text-mono-xs text-text-tertiary"><gr-icon name="clock" [size]="14" />Actualizado automáticamente desde las inscripciones</span>
        <span class="inline-flex h-8 items-center rounded-pill border border-info/30 bg-info/10 px-3 text-mono-xs text-info">Datos de ejemplo</span>
      </p>
      @if (p === undefined) { <gr-skeleton class="h-40 rounded-lg" /> }
      @else if (p) {
        <div class="grid gap-3 md:grid-cols-3">
          <div class="rounded-lg border border-line-subtle bg-bg-card p-5">
            <p class="flex items-center justify-between text-label-s">Plazas ocupadas @if (p.plazas) { <span class="text-mono-xs text-accent-text">{{ p.ocupadas }} / {{ p.plazas }}</span> }</p>
            @if (p.plazas) { <div class="mt-3 h-1.5 rounded-pill bg-bg-raised"><div class="h-full rounded-pill bg-accent" [style.width.%]="pct()"></div></div> }
            <p class="mt-2 text-body-xs text-text-tertiary">{{ p.plazas && p.ocupadas >= p.plazas ? 'Completo · lista de espera en la AEP' : (p.reserva ? p.reserva + ' en reserva' : 'Inscripción en la AEP') }}</p>
          </div>
          <div class="flex items-center justify-between rounded-lg border border-line-subtle bg-bg-card p-5"><span class="text-label-s">Mujeres</span><span class="font-display text-[40px] italic">{{ p.mujeres }}</span></div>
          <div class="flex items-center justify-between rounded-lg border border-line-subtle bg-bg-card p-5"><span class="text-label-s">Hombres</span><span class="font-display text-[40px] italic">{{ p.hombres }}</span></div>
        </div>

        <div class="mt-8 flex flex-wrap items-center gap-2">
          <label class="relative min-w-0 flex-1 basis-64 md:max-w-sm">
            <span class="sr-only">Buscar atleta o club</span>
            <gr-icon name="search" [size]="18" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
            <input type="search" placeholder="Buscar atleta o club…" [ngModel]="q()" (ngModelChange)="q.set($event)" class="h-12 w-full rounded-md border border-line-strong bg-bg-field pr-3 pl-10 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" />
          </label>
          @for (s of sexos; track s.v) {
            <button type="button" (click)="sexo.set(s.v)" [attr.aria-pressed]="sexo() === s.v" class="inline-flex h-11 items-center gap-1.5 rounded-pill border px-3.5 text-label-s"
              [class]="sexo() === s.v ? 'border-accent-text bg-accent-deep/40 text-text-primary' : 'border-line-strong text-text-secondary hover:text-text-primary'"><gr-icon [name]="sexo() === s.v ? 'check' : 'plus'" [size]="14" />{{ s.label }}</button>
          }
        </div>

        <div class="mt-8 flex flex-col gap-10">
          @for (g of grupos(); track g.titulo) {
            <section>
              <h2 class="text-display-2xs md:text-display-xs">{{ g.titulo }}</h2>
              <p class="mt-1 flex items-center gap-1.5 text-body-s text-text-secondary"><gr-icon name="clock" [size]="14" class="text-accent-text" />{{ g.subtitulo }}</p>
              <div class="mt-4 hidden overflow-hidden rounded-lg border border-line-subtle bg-bg-card md:block">
                <table class="w-full table-fixed text-left">
                  <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3 font-normal">Atleta</th><th class="px-4 py-3 font-normal">Club</th><th class="w-28 px-4 py-3 font-normal">Categoría</th><th class="w-20 px-4 py-3 font-normal">Flight</th><th class="w-36 px-4 py-3 font-normal">Pesaje</th></tr></thead>
                  <tbody>
                    @for (f of g.filas; track f.slug) {
                      <tr class="border-b border-line-subtle last:border-0"><td class="px-4 py-3"><a [href]="'/atletas/' + f.slug" class="text-label-m hover:text-accent-text">{{ f.nombre }}</a></td><td class="truncate px-4 py-3 text-body-s text-text-secondary">{{ f.club || 'Independiente' }}</td>
                        <td class="px-4 py-3 text-mono-s text-accent-text">{{ cat(f.categoria) }} kg</td><td class="px-4 py-3 text-mono-s">{{ f.flight || '–' }}</td><td class="px-4 py-3 text-mono-s">{{ f.pesajeInicio ? hora(f.pesajeInicio) + ' – ' + hora(f.pesajeFin) : 'Por publicar' }}</td></tr>
                    }
                  </tbody>
                </table>
              </div>
              <ul class="mt-3 overflow-hidden rounded-lg border border-line-subtle bg-bg-card md:hidden">
                @for (f of g.filas; track f.slug) {
                  <li class="border-b border-line-subtle last:border-0"><a [href]="'/atletas/' + f.slug" class="flex min-h-14 items-center gap-3 px-4 py-2">
                    <span class="min-w-0 flex-1"><span class="block truncate text-label-m">{{ f.nombre }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ f.club || 'Independiente' }}</span></span>
                    <span class="rounded-pill bg-accent-deep/40 px-2 py-0.5 text-mono-xs text-accent-text">{{ cat(f.categoria) }} kg</span>
                  </a></li>
                }
              </ul>
            </section>
          } @empty { <p class="rounded-lg border border-line-subtle bg-bg-card p-8 text-center text-body-m text-text-tertiary">Nadie coincide con «{{ q() }}».</p> }
        </div>

        @if (contacto()) {
          <div class="mt-10 flex flex-col gap-3 rounded-md border border-info/30 bg-info/5 p-4 md:flex-row md:items-center">
            <gr-icon name="info" [size]="18" class="text-info" />
            <p class="flex-1 text-body-s text-text-secondary">¿No apareces en la lista o hay un error en tus datos? Escríbenos antes del cierre de inscripciones.</p>
            <a [href]="'mailto:' + contacto()" class="inline-flex h-10 items-center justify-center rounded-sm border border-info/40 px-3 text-label-s text-info">Contactar</a>
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
      await applySeo(cms, seo, '/participantes', 'Participantes y flights · GR Strength Cup', 'Lista de atletas inscritos por bloque: busca tu nombre para ver tu hora de pesaje y tu flight.');
    });
  }
}

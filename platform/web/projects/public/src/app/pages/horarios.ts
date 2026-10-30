import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GrAlert, GrIcon, GrSkeleton, type GrIconName } from '@grcup/ui';
import { Favoritos, cat } from '../core/atletas';
import { Cms } from '../core/cms';
import { COMPETITION_SLUG, Competition } from '../core/competition';
import { HorariosPublic, ICS_URL, type Horarios, type PubAtleta, type PubDia, type PubFlight } from '../core/horarios';
import { Seo } from '../core/seo';
import { Newsletter } from '../layout/newsletter';
import { Page } from '../layout/page';
import { Fav } from './atletas';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';

const TZ = 'Europe/Madrid';
const hora = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso)) : '');
const diaTab = (f: string) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')).replace(',', '').replace('.', '');
const diaLargo = (f: string) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')).replace(',', '');
const ini = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const ICONOS: Record<string, GrIconName> = { door: 'door', trophy: 'trophy', gift: 'gift', clock: 'clock', ticket: 'ticket', users: 'users', info: 'info', camera: 'camera' };

interface Fila { t: string; flight?: PubFlight; item?: { hora: string; titulo: string; icono: GrIconName } }
/** The part of /directo the «Ahora» line needs. */
interface Vivo { fase: string; flight?: { codigo: string }; actual?: { nombre: string; movimiento: string; numero: number; peso: number } }
const MOV: Record<string, string> = { sq: 'Sentadilla', bp: 'Press de banca', dl: 'Peso muerto' };
interface MiAtleta { a: PubAtleta; f: PubFlight; dia: string }

/** /horarios (Figma page 41 · «Horarios v2 interactivo»): flights by day with live state, «Mi horario» with .ics, search. */
@Component({
  selector: 'gr-horarios-page',
  imports: [Page, FormsModule, GrAlert, GrIcon, GrSkeleton, Fav, Related, Community, Newsletter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let h = data();
    <gr-page title="Horarios" accent="en directo" [eyebrow]="eyebrow()" crumb="Horarios"
      subtitle="Cuándo compite cada atleta, en qué plataforma y si va con retraso. Se actualiza solo: no hace falta recargar.">
      <p pageStamps class="flex flex-wrap gap-2">
        @if (h?.publicado) { <span class="inline-flex h-8 items-center gap-2 rounded-pill border border-line-strong px-3 text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="14" />{{ actualizado() }} · retrasos incluidos</span> }
        <span class="inline-flex h-8 items-center rounded-pill border border-info/30 bg-info/10 px-3 text-label-xs text-info uppercase">Datos de ejemplo</span>
      </p>

      @if (h === undefined) {
        <div class="flex flex-col gap-3"><gr-skeleton class="h-12 rounded-md" />@for (i of [1, 2, 3]; track i) { <gr-skeleton class="h-24 rounded-lg" /> }</div>
      } @else if (!h?.publicado) {
        @if (!api.failed()) {
          <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section class="flex flex-col items-center gap-3 rounded-xl border border-line-subtle bg-bg-card px-6 py-14 text-center">
              <span class="flex size-14 items-center justify-center rounded-full border border-accent/40 bg-accent-deep/30 text-accent-text"><gr-icon name="clock" [size]="24" /></span>
              <h2 class="text-display-xs md:text-display-s">Próximamente</h2>
              <p class="max-w-md text-body-m text-text-secondary">Publicaremos los flights cuando cerremos el listado de la AEP (unas 2 semanas antes). Mientras, puedes ver quién compite y seguir a tus atletas.</p>
              <a href="/atletas" class="mt-2 inline-flex h-11 items-center gap-2 rounded-sm bg-accent-grain px-5 text-label-s text-white">Ver los atletas<gr-icon name="arrow-right" [size]="16" /></a>
            </section>
            <gr-newsletter titulo="Te avisamos de lo importante" texto="Horarios, sorteo y próximas competiciones de GRStrength. Como mucho un email al mes." origen="/horarios" [compacta]="true" />
          </div>
        } @else {
          <gr-alert tone="warning" title="No hemos podido cargar los horarios">Estamos teniendo un problema temporal. Vuelve a intentarlo en unos minutos; los horarios no han cambiado.</gr-alert>
        }
      } @else {
        @if (enDirecto(); as d) {
          <p class="mb-5 flex flex-wrap items-center gap-2 text-body-s text-text-secondary">
            <span class="inline-flex h-7 items-center gap-1.5 rounded-pill border border-accent bg-accent/12 px-2.5 text-label-xs text-accent-text uppercase"><gr-icon name="radio" [size]="12" />En directo</span>{{ d }}
          </p>
        }
        <div class="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
          <nav class="-mx-5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:px-0" aria-label="Días">
            @for (d of h.dias; track d.fecha) {
              <button type="button" (click)="dia.set(d.fecha)" [attr.aria-current]="diaSel()?.fecha === d.fecha ? 'date' : null"
                class="relative h-11 shrink-0 px-3 font-display text-[18px] uppercase italic" [class]="diaSel()?.fecha === d.fecha ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'">
                {{ diaTab(d.fecha) }}@if (diaSel()?.fecha === d.fecha) { <span class="absolute inset-x-3 bottom-0 h-0.5 bg-accent"></span> }
              </button>
            }
          </nav>
          <div class="inline-flex rounded-md border border-line-subtle bg-bg-surface p-1" role="radiogroup" aria-label="Vista">
            <button type="button" role="radio" [attr.aria-checked]="!mio()" (click)="mio.set(false)" class="h-9 rounded-sm px-4 text-label-s" [class]="!mio() ? 'bg-accent text-white' : 'text-text-secondary'">Todos los flights</button>
            <button type="button" role="radio" [attr.aria-checked]="mio()" (click)="mio.set(true)" class="h-9 rounded-sm px-4 text-label-s" [class]="mio() ? 'bg-accent text-white' : 'text-text-secondary'">Mi horario ({{ misAtletas().length }})</button>
          </div>
          <label class="relative min-w-0 md:w-72">
            <span class="sr-only">Buscar atleta</span>
            <gr-icon name="search" [size]="18" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
            <input type="search" placeholder="¿Cuándo compite…?" [ngModel]="q()" (ngModelChange)="q.set($event)"
              class="h-11 w-full rounded-md border border-line-strong bg-bg-field pr-3 pl-10 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" />
          </label>
        </div>
        @if (q().length > 1) { <p class="mt-3 text-body-s text-text-tertiary" aria-live="polite">{{ coincidencias() ? coincidencias() + ' atletas coinciden con «' + q() + '»' : 'Nadie coincide con «' + q() + '» (solo salen los perfiles públicos).' }}</p> }

        <div class="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div class="flex flex-col gap-3">
            @if (mio() && !misAtletas().length) {
              <!-- Figma 41 «Mi horario vacío» -->
              <section class="flex flex-col gap-3 rounded-xl border border-line-subtle bg-bg-card p-5">
                <h2 class="flex items-center gap-2 text-ui-h5"><gr-icon name="star" [size]="18" class="text-accent-text" />Mi horario<span class="ml-auto text-body-xs text-text-muted">0 atletas</span></h2>
                <p class="text-body-s text-text-secondary">Sigue a atletas (☆) y aquí verás cuándo compiten, con los retrasos ya aplicados. Se guarda en este navegador, sin registrarte.</p>
                <a href="/atletas" class="flex h-11 items-center justify-center gap-2 rounded-sm border border-line-strong bg-bg-raised text-label-s hover:border-white">Buscar atletas<gr-icon name="arrow-right" [size]="16" /></a>
              </section>
            }
            @for (r of filas(); track r.flight?.id ?? r.t + r.item?.titulo) {
              @if (r.flight; as f) {
                @let abierto = abiertos().has(f.id) || q().length > 1 || mio();
                @let fin = f.estado === 'finalizado';
                <article [id]="'flight-' + f.codigo" class="relative overflow-hidden rounded-2xl border bg-bg-card" [class]="f.estado === 'en_curso' ? 'border-accent' : 'border-line-subtle'">
                  @if (f.estado === 'en_curso') { <span class="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden="true"></span> }
                  <!-- Figma «Flight block»: one row on desktop; time + pill on top and the title below on mobile -->
                  <button type="button" class="grid w-full grid-cols-[minmax(0,1fr)_auto_18px] items-center gap-x-2.5 gap-y-2 p-4 text-left md:grid-cols-[72px_minmax(0,1fr)_auto_18px] md:gap-x-4 md:p-5" (click)="toggle(f.id)" [attr.aria-expanded]="abierto">
                    <span class="flex items-end gap-2 md:flex-col md:items-start md:gap-1">
                      <span class="text-ui-h3 leading-none tabular-nums" [class.text-text-muted]="fin">{{ hora(f.inicioEstimado) }}</span>
                      @if (f.retrasoMin) { <span class="text-mono-s text-text-muted line-through">{{ hora(f.inicio) }}</span> } @else { <span class="text-mono-s text-text-muted">Plat. {{ f.plataforma }}</span> }
                    </span>
                    <span class="col-span-3 row-start-2 flex min-w-0 flex-col gap-1 md:col-span-1 md:row-start-auto">
                      <span class="text-label-m" [class.text-text-secondary]="fin">Flight {{ f.codigo }} · {{ f.titulo }}</span>
                      <span class="text-body-xs text-text-tertiary">Plataforma {{ f.plataforma }} · {{ f.total }} atletas · Pesaje {{ hora(f.pesajeInicio) }}–{{ hora(f.pesajeFin) }}</span>
                    </span>
                    @switch (f.estado) {
                      @case ('en_curso') { <span [class]="pill + ' border-accent bg-accent/12 text-accent-text'"><gr-icon name="radio" [size]="12" />En curso</span> }
                      @case ('finalizado') { <span [class]="pill + ' border-text-muted bg-text-muted/12 text-text-muted'"><gr-icon name="check" [size]="12" />Finalizado</span> }
                      @default {
                        @if (f.retrasoMin) { <span [class]="pill + ' border-warning bg-warning/12 text-warning'"><gr-icon name="clock" [size]="12" />+{{ f.retrasoMin }} min</span> }
                        @else { <span [class]="pill + ' border-line-strong text-text-tertiary'">Programado</span> }
                      }
                    }
                    <gr-icon name="chevron-down" [size]="18" class="text-text-tertiary transition-transform" [class.rotate-180]="abierto" />
                  </button>
                  @if (f.retrasoMin && f.estado === 'programado') {
                    <p class="flex items-center gap-2 border-t border-warning/30 bg-warning/10 px-5 py-2.5 text-body-s text-warning"><gr-icon name="circle-alert" [size]="16" />Va con {{ f.retrasoMin }} min de retraso: nuevo inicio estimado {{ hora(f.inicioEstimado) }}.</p>
                  }
                  @if (abierto) {
                    @let lista = atletasDe(f);
                    @if (f.estado === 'en_curso' && ahoraTxt(f); as t) {
                      <!-- Figma «Ahora»: the attempt on the platform right now (live) -->
                      <p class="flex items-start gap-2 bg-accent/8 px-4 py-3 text-body-s md:px-5" aria-live="polite"><gr-icon name="activity" [size]="16" class="mt-0.5 shrink-0 text-accent-text" />{{ t }}</p>
                    }
                    <ul class="border-t border-line-subtle px-4 pb-1 md:px-5">
                      @for (a of lista.slice(0, todos().has(f.id) ? 99 : 6); track a.slug) {
                        <li class="flex min-h-[55px] items-center gap-3 border-b border-line-subtle last:border-0">
                          <span class="w-6 shrink-0 text-mono-s text-text-muted">{{ a.lote.toString().padStart(2, '0') }}</span>
                          <a [href]="'/atletas/' + a.slug" class="flex min-w-0 flex-1 flex-col gap-1 py-2">
                            <span class="truncate text-label-s" [class.text-accent-text]="fav.slugs().includes(a.slug)">{{ a.nombre }}</span>
                            <span class="truncate text-body-xs text-text-tertiary">{{ a.club || 'Independiente' }} · {{ a.divisionNombre }}</span>
                          </a>
                          <span class="shrink-0 text-mono-s text-text-secondary">{{ a.sexo }} {{ cat(a.categoria) }} kg</span>
                          <gr-fav class="-mr-3" [slug]="a.slug" [nombre]="a.nombre" [plano]="true" />
                        </li>
                      }
                    </ul>
                    @if (lista.length < f.total && !mio() && q().length < 2) { <p class="border-t border-line-subtle px-5 py-2 text-body-xs text-text-muted">{{ f.total - lista.length }} {{ f.total - lista.length === 1 ? 'atleta sin perfil público' : 'atletas sin perfil público' }}.</p> }
                    @if (lista.length > 6 && !todos().has(f.id)) {
                      <button type="button" class="flex min-h-11 w-full items-center gap-1.5 px-4 pb-3 text-left text-label-s text-accent-text hover:underline md:px-5" (click)="verTodos(f.id)">Ver los {{ lista.length }} atletas<gr-icon name="arrow-right" [size]="14" /></button>
                    }
                  }
                </article>
              } @else {
                <p class="flex min-h-12 items-center gap-3 rounded-md border border-line-subtle bg-bg-surface px-4 text-body-s text-text-secondary">
                  <span class="w-12 font-mono text-mono-xs text-accent-text">{{ r.item!.hora }}</span><gr-icon [name]="r.item!.icono" [size]="16" class="text-text-tertiary" />{{ r.item!.titulo }}
                </p>
              }
            }
          </div>

          <!-- «Mi horario» tab on mobile: the followed athletes come first (Figma 41) -->
          <aside class="flex flex-col gap-4" [class.order-first]="mio() && misAtletas().length" [class.lg:order-none]="true">
            <section class="rounded-xl border border-line-subtle bg-bg-card p-5">
              <h2 class="flex items-center gap-2 text-ui-h5"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" class="text-accent-text" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></svg>Mi horario<span class="ml-auto text-body-xs text-text-muted">{{ misAtletas().length }} {{ misAtletas().length === 1 ? 'atleta' : 'atletas' }}</span></h2>
              @if (misAtletas().length) {
                <ul class="mt-3 flex flex-col">
                  @for (m of misAtletas(); track m.a.slug) {
                    <li class="flex items-center gap-3 border-b border-line-subtle py-2.5 last:border-0">
                      <span class="flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong text-label-s">{{ ini(m.a.nombre) }}</span>
                      <a [href]="'/atletas/' + m.a.slug" class="min-w-0 flex-1">
                        <span class="block truncate text-label-m">{{ m.a.nombre }}</span>
                        <span class="block truncate text-body-xs text-text-tertiary">Flight {{ m.f.codigo }} · {{ m.a.sexo }} {{ cat(m.a.categoria) }} kg{{ m.dia !== diaSel()?.fecha ? ' · ' + diaTab(m.dia) : '' }}</span>
                        @if (m.f.estado === 'en_curso') { <span class="mt-1 inline-flex h-6 items-center gap-1 rounded-pill border border-accent/60 px-2 text-mono-xs text-accent-text"><gr-icon name="radio" [size]="10" />En plataforma</span> }
                      </a>
                      @if (m.f.estado !== 'en_curso') { <span class="font-mono text-label-s" [class.text-text-muted]="m.f.estado === 'finalizado'">{{ hora(m.f.inicioEstimado) }}</span> }
                      <gr-fav [slug]="m.a.slug" [nombre]="m.a.nombre" />
                    </li>
                  }
                </ul>
                <a [href]="icsUrl()" class="mt-4 flex h-11 items-center justify-center gap-2 rounded-sm bg-accent-grain text-label-s text-white"><gr-icon name="calendar-plus" [size]="16" />Añadir mi horario al calendario</a>
                <p class="mt-2 text-body-xs text-text-muted">Archivo .ics con las horas de tus atletas y un aviso 30 min antes. Si hay retrasos, vuelve a descargarlo.</p>
              } @else {
                <p class="mt-2 text-body-s text-text-secondary">Toca la ★ junto a un atleta para seguirlo: aquí verás su hora y podrás añadirla a tu calendario.</p>
              }
            </section>
            @if (diaSel()?.notas?.length) {
              <section class="rounded-xl border border-line-subtle bg-bg-card p-5">
                <h2 class="text-ui-h5">Info del día</h2>
                <ul class="mt-3 flex flex-col gap-2 text-body-s text-text-secondary">
                  @for (n of diaSel()!.notas; track n) { <li class="flex gap-2"><gr-icon name="chevron-right" [size]="16" class="mt-0.5 shrink-0 text-accent-text" />{{ n }}</li> }
                </ul>
              </section>
            }
            <a [href]="icsTodos" class="flex items-center gap-3 rounded-xl border border-line-subtle bg-bg-card p-4 text-body-s text-text-secondary hover:border-line-strong">
              <gr-icon name="calendar-days" [size]="18" class="text-accent-text" /><span class="flex-1">Todos los flights en tu calendario</span><gr-icon name="download" [size]="16" />
            </a>
          </aside>
        </div>
      }

      <div class="mt-18 flex flex-col gap-18 md:mt-24 md:gap-24">
        <gr-related [items]="relacionados" />
        <gr-community />
      </div>
    </gr-page>
  `,
})
export class HorariosPage {
  protected readonly api = inject(HorariosPublic);
  protected readonly fav = inject(Favoritos);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly hora = hora;
  protected readonly cat = cat;
  protected readonly ini = ini;
  protected readonly diaTab = diaTab;
  protected readonly icsTodos = ICS_URL;
  protected readonly data = signal<Horarios | null | undefined>(undefined);
  protected readonly dia = signal('');
  protected readonly mio = signal(false);
  protected readonly q = signal('');
  protected readonly abiertos = signal(new Set<string>());
  protected readonly pill = 'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill border px-2.5 text-label-xs uppercase';
  /** What is on the platform now (from /directo, browser only). */
  private readonly vivo = signal<Vivo | null>(null);
  protected readonly todos = signal(new Set<string>());
  private readonly cargadoAt = signal(Date.now());
  private readonly ahora = signal(Date.now());
  protected readonly relacionados: RelatedLink[] = [
    { titulo: 'Atletas', texto: 'Busca y sigue a atletas', ruta: '/atletas' },
    { titulo: 'En directo', texto: 'Streaming y marcador', ruta: '/directo' },
    { titulo: 'Entradas', texto: 'Gratis con reserva', ruta: '/entradas' },
  ];

  protected readonly diaSel = computed<PubDia | undefined>(() => {
    const d = this.data()?.dias ?? [];
    return d.find((x) => x.fecha === this.dia()) ?? d[0];
  });
  protected readonly eyebrow = computed(() => {
    const d = this.diaSel();
    return d ? diaLargo(d.fecha).toUpperCase() + ' · EJEMPLO' : 'Competición 2026';
  });
  protected readonly actualizado = computed(() => {
    const s = Math.max(0, Math.round((this.ahora() - this.cargadoAt()) / 1000));
    return s < 60 ? `Actualizado hace ${Math.max(s, 1)} s` : `Actualizado hace ${Math.round(s / 60)} min`;
  });
  protected readonly enDirecto = computed(() => {
    const fl = (this.data()?.dias ?? []).flatMap((d) => d.flights);
    const parts = [
      ...fl.filter((f) => f.estado === 'en_curso').map((f) => `Flight ${f.codigo} en la plataforma`),
      ...fl.filter((f) => f.estado === 'programado' && f.retrasoMin).map((f) => `Flight ${f.codigo} con +${f.retrasoMin} min`),
    ];
    return parts.join(' · ');
  });
  protected readonly misAtletas = computed<MiAtleta[]>(() => {
    const favs = new Set(this.fav.slugs());
    const out: MiAtleta[] = [];
    for (const d of this.data()?.dias ?? []) for (const f of d.flights) for (const a of f.atletas) if (favs.has(a.slug)) out.push({ a, f, dia: d.fecha });
    return out;
  });
  protected readonly icsUrl = computed(() => `${ICS_URL}?atletas=${encodeURIComponent(this.misAtletas().map((m) => m.a.slug).join(','))}`);
  protected readonly coincidencias = computed(() => {
    const q = norm(this.q());
    return (this.diaSel()?.flights ?? []).reduce((n, f) => n + f.atletas.filter((a) => norm(a.nombre + ' ' + a.club).includes(q)).length, 0);
  });
  protected readonly filas = computed<Fila[]>(() => {
    const d = this.diaSel();
    if (!d) return [];
    const q = norm(this.q());
    const favs = new Set(this.fav.slugs());
    let flights = d.flights;
    if (this.mio()) flights = flights.filter((f) => f.atletas.some((a) => favs.has(a.slug)));
    if (q.length > 1) flights = flights.filter((f) => f.atletas.some((a) => norm(a.nombre + ' ' + a.club).includes(q)));
    const rows: Fila[] = flights.map((f) => ({ t: hora(f.inicio), flight: f }));
    if (!this.mio() && q.length < 2) rows.push(...d.agenda.map((a) => ({ t: a.hora, item: { hora: a.hora, titulo: a.titulo, icono: ICONOS[a.icono ?? ''] ?? ('clock' as GrIconName) } })));
    return rows.sort((a, b) => a.t.localeCompare(b.t));
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    const competition = inject(Competition);
    void inject(PendingTasks).run(async () => {
      const [h, c] = await Promise.all([this.api.get(), competition.load()]);
      this.aplicar(h);
      const flights = (h?.dias ?? []).flatMap((d) => d.flights);
      await applySeo(cms, seo, '/horarios', 'Horarios en directo · GR Strength Cup',
        h?.publicado ? `Hora de los ${flights.length} flights de la GR Strength Cup, plataforma y pesaje de cada atleta, con retrasos en directo. Añade tu horario al calendario.`
          : 'Los horarios de la GR Strength Cup se publican unas 2 semanas antes. Consulta los atletas inscritos y síguelos.', undefined,
        h?.publicado && c ? {
          jsonLd: {
            '@context': 'https://schema.org', '@type': 'SportsEvent', name: c.nombre, sport: 'Powerlifting', startDate: c.fechaInicio, endDate: c.fechaFin,
            location: { '@type': 'Place', name: c.sede.nombre, address: `${c.sede.direccion}, ${c.sede.cp} ${c.sede.ciudad}` },
            subEvent: flights.map((f) => ({ '@type': 'SportsEvent', name: `Flight ${f.codigo} · ${f.titulo}`, startDate: f.inicio, endDate: f.fin, sport: 'Powerlifting' })),
          },
        } : {});
    });
    if (this.browser) {
      const tick = setInterval(() => this.ahora.set(Date.now()), 10_000);
      // Live: reload when a version is published or a flight changes state (public SSE, no personal data).
      const es = new EventSource(`/api/competiciones/${COMPETITION_SLUG}/stream`);
      let t: ReturnType<typeof setTimeout> | undefined;
      const recargar = () => {
        clearTimeout(t);
        t = setTimeout(async () => this.aplicar(await this.api.get()), 400);
      };
      for (const ev of ['horarios.publicados', 'horarios.retirados', 'horarios.flight']) es.addEventListener(ev, recargar);
      // the «Ahora» line follows the competition desk — only while a flight of the schedule is on the platform
      let tv: ReturnType<typeof setTimeout> | undefined;
      const vivo = () => {
        clearTimeout(tv);
        if (this.hayEnCurso()) tv = setTimeout(() => void this.cargarVivo(), 300);
        else this.vivo.set(null);
      };
      this.alAplicar = vivo;
      for (const ev of ['directo.estado', 'directo.intento', 'directo.veredicto', 'directo.correccion']) es.addEventListener(ev, vivo);
      inject(DestroyRef).onDestroy(() => clearTimeout(tv));
      inject(DestroyRef).onDestroy(() => {
        clearInterval(tick);
        clearTimeout(t);
        es.close();
      });
    }
  }

  /** «Ahora: Sentadilla · 2.º intento · Laura Gómez · 135 kg» for the flight on the platform. */
  protected ahoraTxt(f: PubFlight): string {
    const v = this.vivo();
    if (!v?.actual || v.flight?.codigo !== f.codigo || v.fase !== 'en_directo') return '';
    const a = v.actual;
    return `Ahora: ${MOV[a.movimiento] ?? a.movimiento} · ${a.numero}.º intento · ${a.nombre} · ${a.peso.toLocaleString('es-ES')} kg`;
  }

  private async cargarVivo(): Promise<void> {
    try {
      const r = await fetch(`/api/competiciones/${COMPETITION_SLUG}/directo`, { headers: { Accept: 'application/json' } });
      this.vivo.set(r.ok ? ((await r.json()) as Vivo) : null);
    } catch {
      this.vivo.set(null);
    }
  }

  /** Called after each (re)load of the schedule: starts or stops the «Ahora» line. */
  private alAplicar: () => void = () => undefined;
  private hayEnCurso(): boolean {
    return (this.data()?.dias ?? []).some((d) => d.flights.some((f) => f.estado === 'en_curso'));
  }

  private aplicar(h: Horarios | null): void {
    if (h === null && this.data()) return; // keep what we had if a reload fails
    this.data.set(h);
    this.alAplicar();
    this.cargadoAt.set(Date.now());
    this.ahora.set(Date.now());
    if (!h?.publicado) return;
    const dias = h.dias;
    if (!dias.some((d) => d.fecha === this.dia())) {
      // The day with something live, else today, else the first one.
      const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
      const vivo = dias.find((d) => d.flights.some((f) => f.estado === 'en_curso'));
      this.dia.set((vivo ?? dias.find((d) => d.fecha === hoy) ?? dias[0])?.fecha ?? '');
    }
    const abiertos = new Set(this.abiertos());
    for (const d of dias) for (const f of d.flights) if (f.estado === 'en_curso') abiertos.add(f.id);
    this.abiertos.set(abiertos);
  }

  protected toggle(id: string): void {
    const s = new Set(this.abiertos());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    this.abiertos.set(s);
  }
  protected verTodos(id: string): void {
    this.todos.set(new Set(this.todos()).add(id));
  }
  protected atletasDe(f: PubFlight): PubAtleta[] {
    const q = norm(this.q());
    if (this.mio()) {
      const favs = new Set(this.fav.slugs());
      return f.atletas.filter((a) => favs.has(a.slug));
    }
    return q.length > 1 ? f.atletas.filter((a) => norm(a.nombre + ' ' + a.club).includes(q)) : f.atletas;
  }
}

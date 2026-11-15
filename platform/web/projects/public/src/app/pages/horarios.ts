import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GrAlert, GrIcon, GrSkeleton, type GrIconName } from '@grcup/ui';
import { Favoritos, cat } from '../core/atletas';
import { Cms } from '../core/cms';
import { COMPETITION_SLUG, Competition, FalloApi } from '../core/competition';
import { HorariosPublic, ICS_URL, type Horarios, type PubAtleta, type PubDia, type PubHorario } from '../core/horarios';
import { Seo } from '../core/seo';
import { Newsletter } from '../layout/newsletter';
import { Page } from '../layout/page';
import { Fav } from './atletas';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';

const TZ = 'Europe/Madrid';
const hora = (iso?: string) => (iso ? new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso)) : '');
const diaTab = (f: string) => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')).replace(',', '').replace('.', '');
const ini = (n: string) => n.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
const ICONOS: Record<string, GrIconName> = { door: 'door', trophy: 'trophy', gift: 'gift', clock: 'clock', ticket: 'ticket', users: 'users', info: 'info', camera: 'camera' };
/** «Femenino −47 / −52 kg» → «−47 / −52 kg» (the sex goes in its own label). */
const pesos = (h: PubHorario) => {
  const p = (h.titulo.match(/[−+-]\s?\d+/g) ?? []).map((x) => x.replace('-', '−').replace(/\s/g, ''));
  return p.length ? p.join(' / ') + ' kg' : h.titulo;
};
const sexo = (s: string) => (s === 'F' ? 'Femenino' : s === 'M' ? 'Masculino' : 'Mixto');
const POR_PAGINA = 6;

type Vista = 'todos' | 'detallado' | 'favs';
interface Fila { t: string; h?: PubHorario; item?: { hora: string; titulo: string; icono: GrIconName } }
interface Pagina { page: number; items: PubAtleta[]; total: number; cargando: boolean }

/**
 * /horarios (Figma «Web · /horarios» 11:83, frames «/horarios · Mobile · Todos | Detallado | Favs»). One platform, no flights:
 * three views of the same day — Todos (time slots, no accordion), Detallado (each slot opens its athletes, paginated by the API)
 * and Favs (slots with the starred athletes). The header (breadcrumb only, sr-only h1) never changes between views. The page
 * reloads in silence when the back office publishes a change: no toasts, no live badges, no delays.
 */
@Component({
  selector: 'gr-horarios-page',
  imports: [RouterLink, Page, FormsModule, GrAlert, GrIcon, GrSkeleton, Fav, Related, Community, Newsletter],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let h = data();
    <gr-page title="Horarios GRS Cup 2" [hideTitle]="true" crumb="Horarios" separacion="mt-6 block md:mt-10">
      @if (h === undefined) {
        <div class="flex flex-col gap-3"><gr-skeleton class="h-12 rounded-md" />@for (i of [1, 2, 3]; track i) { <gr-skeleton class="h-24 rounded-lg" /> }</div>
      } @else if (!h?.publicado) {
        @if (!api.failed()) {
          <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section class="flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-6 py-14 text-center">
              <span class="flex size-14 items-center justify-center rounded-full border border-accent/40 bg-accent-deep/30 text-accent-text"><gr-icon name="clock" [size]="24" /></span>
              <h2 class="text-display-xs md:text-display-s">Próximamente</h2>
              <p class="max-w-md text-body-m text-text-secondary">Publicaremos los horarios cuando cerremos el listado de atletas (unas 2 semanas antes). Mientras, puedes ver quién compite y seguir a tus atletas.</p>
              <a routerLink="/atletas" class="mt-2 inline-flex h-11 items-center gap-2 rounded-sm bg-accent-grain px-5 text-label-s text-white">Ver los atletas<gr-icon name="arrow-right" [size]="16" /></a>
            </section>
            <gr-newsletter titulo="Te avisamos de lo importante" texto="Horarios, sorteo y novedades de la GRS Cup 2. Como mucho un email al mes." origen="/horarios" [compacta]="true" />
          </div>
        } @else if (!fallo.limitado()) {
          <!-- on a 429 the page header already shows «Demasiadas visitas desde tu red» -->
          <gr-alert tone="warning" title="No hemos podido cargar los horarios">Estamos teniendo un problema temporal. Vuelve a intentarlo en unos minutos.</gr-alert>
        }
      } @else {
        <div class="flex max-w-[880px] flex-col gap-3">
          @if (h.dias.length > 1) {
            <nav class="-mx-5 flex gap-1 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:px-0" aria-label="Días">
              @for (d of h.dias; track d.fecha) {
                <button type="button" (click)="dia.set(d.fecha)" [attr.aria-current]="diaSel()?.fecha === d.fecha ? 'date' : null"
                  class="relative h-11 shrink-0 px-3 font-display text-[18px] uppercase italic" [class]="diaSel()?.fecha === d.fecha ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'">
                  {{ diaTab(d.fecha) }}@if (diaSel()?.fecha === d.fecha) { <span class="absolute inset-x-3 bottom-0 h-0.5 bg-accent"></span> }
                </button>
              }
            </nav>
          } @else if (diaSel(); as d) {
            <p class="relative h-11 self-start px-3 font-display text-[18px] leading-[44px] uppercase italic">{{ diaTab(d.fecha) }}<span class="absolute inset-x-3 bottom-0 h-0.5 bg-accent"></span></p>
          }
          <!-- Figma «Vista · Todos / Detallado / Favs»: three ways to read the same schedule, no dropdowns -->
          <div class="grid grid-cols-3 rounded-md border border-line-subtle bg-bg-surface p-1 md:max-w-md" role="radiogroup" aria-label="Vista">
            @for (v of vistas; track v.id) {
              <button type="button" role="radio" [attr.aria-checked]="vista() === v.id" (click)="cambiarVista(v.id)" class="h-11 rounded-sm px-2 text-label-s transition-colors duration-150" [class]="vista() === v.id ? 'bg-accent text-white' : 'text-text-secondary hover:text-text-primary'">
                {{ v.texto }}@if (v.id === 'favs' && fav.slugs().length) { <span class="ml-1 tabular-nums opacity-80">({{ fav.slugs().length }})</span> }
              </button>
            }
          </div>
          @if (vista() !== 'favs') {
            <label class="relative min-w-0 md:max-w-md">
              <span class="sr-only">Buscar atleta</span>
              <gr-icon name="search" [size]="18" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
              <input type="search" enterkeyhint="search" autocomplete="off" (keydown.enter)="$any($event.target).blur()" placeholder="¿Cuándo compite…?" [ngModel]="q()" (ngModelChange)="q.set($event)"
                class="h-11 w-full rounded-md border border-line-strong bg-bg-field pr-3 pl-10 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" />
            </label>
            @if (q().length > 1) { <p class="text-body-s text-text-tertiary" aria-live="polite">{{ coincidencias() ? coincidencias() + (coincidencias() === 1 ? ' atleta coincide' : ' atletas coinciden') + ' con «' + q() + '»' : 'Nadie coincide con «' + q() + '» (solo salen los perfiles públicos).' }}</p> }
          }

          <div class="mt-3 flex flex-col gap-3">
            @if (diaSel()?.puertas && q().length < 2 && vista() !== 'favs') {
              <p class="flex min-h-12 items-center gap-3 rounded-md border border-line-subtle bg-bg-surface px-4 text-body-s text-text-secondary">
                <gr-icon name="door" [size]="16" class="text-text-tertiary" />Puertas {{ diaSel()!.puertas }}
              </p>
            }
            @if (vista() === 'favs' && !filas().length) {
              <!-- Figma «Favs vacío» -->
              <section class="flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-6 py-10 text-center">
                <span class="flex size-12 items-center justify-center rounded-full border border-line-strong text-accent-text"><gr-icon name="star" [size]="20" /></span>
                <h2 class="text-ui-h5">{{ fav.slugs().length ? 'Tus favoritos no compiten este día' : 'Aún no tienes favoritos' }}</h2>
                <p class="max-w-sm text-body-s text-text-secondary">Marca atletas con la estrella y aquí verás a qué hora compiten.</p>
                <a routerLink="/atletas" class="mt-1 flex h-11 items-center justify-center gap-2 rounded-sm border border-line-strong px-5 text-label-s hover:border-accent/60">Buscar atletas<gr-icon name="arrow-right" [size]="16" /></a>
              </section>
            }
            @for (r of filas(); track r.h?.id ?? r.t + r.item?.titulo) {
              @if (r.h; as f) {
                @if (vista() === 'todos') {
                  <!-- Figma «Horario · fila» (same block as the home): no accordion, the time big on the right -->
                  <article class="flex items-center gap-4 rounded-lg border border-line-subtle bg-bg-card p-4 md:px-5">
                    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                      <p class="flex items-center gap-2"><span class="text-label-xs text-white uppercase">{{ sexo(f.sexo) }}</span>@if (f.ep) { <span class="inline-flex h-5 items-center rounded-sm border border-accent/50 px-1.5 text-mono-xs text-accent-text">{{ f.ep }}</span> }</p>
                      <p class="text-display-2xs">{{ pesos(f) }}</p>
                      <p class="text-body-xs text-text-tertiary">{{ f.total }} {{ f.total === 1 ? 'atleta' : 'atletas' }} · Pesaje {{ hora(f.pesajeInicio) }}–{{ hora(f.pesajeFin) }}</p>
                    </div>
                    <p class="flex shrink-0 items-center gap-2 self-center text-ui-h3 tabular-nums"><gr-icon name="clock" [size]="22" class="text-text-tertiary" />{{ hora(f.inicio) }}</p>
                  </article>
                } @else {
                  @let abierto = vista() === 'favs' || abiertos().has(f.id) || q().length > 1;
                  <article class="overflow-hidden rounded-lg border bg-bg-card" [class]="abierto && vista() === 'detallado' ? 'border-accent/50' : 'border-line-subtle'">
                    <button type="button" class="flex w-full items-center gap-3 p-4 text-left md:px-5" (click)="toggle(f.id)" [disabled]="vista() === 'favs'" [attr.aria-expanded]="abierto" [attr.aria-controls]="'panel-' + f.id">
                      <span class="flex min-w-0 flex-1 flex-col gap-1">
                        <span class="flex items-center gap-2.5"><span class="text-ui-h3 leading-none tabular-nums">{{ hora(f.inicio) }}</span><span class="text-label-xs text-white uppercase">{{ sexo(f.sexo) }}</span></span>
                        <span class="text-label-m">{{ pesos(f) }}</span>
                        <span class="text-body-xs text-text-tertiary">{{ f.total }} {{ f.total === 1 ? 'atleta' : 'atletas' }} · Pesaje {{ hora(f.pesajeInicio) }}–{{ hora(f.pesajeFin) }}</span>
                      </span>
                      @if (f.ep) { <span class="inline-flex h-5 shrink-0 items-center rounded-sm border border-accent/50 px-1.5 text-mono-xs text-accent-text">{{ f.ep }}</span> }
                      @if (vista() === 'detallado') { <gr-icon name="chevron-down" [size]="18" class="shrink-0 text-text-tertiary transition-transform duration-200" [class.rotate-180]="abierto" /> }
                    </button>
                    @if (abierto) {
                      @let pg = pagina(f);
                      <div [id]="'panel-' + f.id" class="border-t border-line-subtle px-4 md:px-5">
                        <p class="flex items-center justify-between pt-3 pb-1 text-label-s">
                          {{ vista() === 'favs' ? 'Tus favoritos' : 'Atletas' }}
                          @if (pg.total > pg.items.length) { <span class="text-body-xs text-text-tertiary tabular-nums">{{ (pg.page - 1) * porPagina + 1 }}–{{ (pg.page - 1) * porPagina + pg.items.length }} de {{ pg.total }}</span> }
                        </p>
                        <ul class="transition-opacity duration-150" [class.opacity-50]="pg.cargando" [attr.aria-busy]="pg.cargando">
                          @for (a of pg.items; track a.slug) {
                            <li class="flex min-h-[60px] items-center gap-3 border-b border-line-subtle last:border-0">
                              <span class="flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong text-label-s" aria-hidden="true">{{ ini(a.nombre) }}</span>
                              <a [href]="'/atletas/' + a.slug" class="flex min-w-0 flex-1 flex-col gap-0.5 py-2">
                                <span class="truncate text-label-m" [class.text-accent-text]="fav.slugs().includes(a.slug)">{{ a.nombre }}</span>
                                <span class="truncate text-body-xs text-text-tertiary">{{ a.club || 'Independiente' }} · {{ a.divisionNombre }} · {{ cat(a.categoria) }} kg</span>
                              </a>
                              <gr-fav class="-mr-3" [slug]="a.slug" [nombre]="a.nombre" [plano]="true" />
                            </li>
                          } @empty {
                            @if (pg.cargando) { @for (i of [1, 2, 3]; track i) { <li class="py-2"><gr-skeleton class="h-11 rounded-md" /></li> } }
                            @else { <li class="py-3 text-body-s text-text-tertiary">Ningún atleta de este horario tiene el perfil público.</li> }
                          }
                        </ul>
                        @if (pg.total > porPagina && vista() === 'detallado' && q().length < 2) {
                          @let n = paginas(pg.total);
                          <nav class="flex items-center justify-center gap-1.5 py-3" [attr.aria-label]="'Páginas de atletas de las ' + hora(f.inicio)">
                            <button type="button" class="flex size-11 items-center justify-center rounded-md border border-line-subtle disabled:opacity-40" [disabled]="pg.page <= 1" (click)="irA(f, pg.page - 1)" aria-label="Página anterior"><gr-icon name="chevron-left" [size]="16" /></button>
                            @for (p of n; track p) {
                              <button type="button" class="flex size-11 items-center justify-center rounded-md border text-label-s tabular-nums" [class]="p === pg.page ? 'border-accent bg-accent-grain text-white' : 'border-line-subtle text-text-secondary'" [attr.aria-current]="p === pg.page ? 'page' : null" (click)="irA(f, p)">{{ p }}</button>
                            }
                            <button type="button" class="flex size-11 items-center justify-center rounded-md border border-line-subtle disabled:opacity-40" [disabled]="pg.page >= n.length" (click)="irA(f, pg.page + 1)" aria-label="Página siguiente"><gr-icon name="chevron-right" [size]="16" /></button>
                          </nav>
                        }
                      </div>
                    }
                  </article>
                }
              } @else {
                <p class="flex min-h-12 items-center gap-3 rounded-md border border-line-subtle bg-bg-surface px-4 text-body-s text-text-secondary">
                  <span class="w-12 font-mono text-mono-xs text-accent-text">{{ r.item!.hora }}</span><gr-icon [name]="r.item!.icono" [size]="16" class="text-text-tertiary" />{{ r.item!.titulo }}
                </p>
              }
            }
          </div>

          <!-- Figma «Calendario»: the .ics follows changes of the schedule -->
          <section class="mt-3 flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-5">
            <h2 class="text-ui-h5">{{ vista() === 'favs' && fav.slugs().length ? 'Guarda los horarios de tus favoritos en tu calendario' : 'Guarda todos los horarios en tu calendario' }}</h2>
            <p class="text-body-s text-text-secondary">Archivo .ics con {{ vista() === 'favs' && fav.slugs().length ? 'las horas de tus atletas' : 'todos los horarios del día' }} y un aviso 30 min antes. Si la organización cambia algún horario, vuelve a descargarlo.</p>
            <a [href]="vista() === 'favs' && fav.slugs().length ? icsFavs() : icsTodos" class="flex h-11 items-center justify-center gap-2 rounded-sm bg-accent-grain text-label-s text-white"><gr-icon name="calendar-plus" [size]="16" />Añadir al calendario (.ics)</a>
          </section>
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
  protected readonly fallo = inject(FalloApi);
  protected readonly fav = inject(Favoritos);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly hora = hora;
  protected readonly cat = cat;
  protected readonly ini = ini;
  protected readonly diaTab = diaTab;
  protected readonly pesos = pesos;
  protected readonly sexo = sexo;
  protected readonly porPagina = POR_PAGINA;
  protected readonly icsTodos = ICS_URL;
  protected readonly vistas: { id: Vista; texto: string }[] = [
    { id: 'todos', texto: 'Todos' },
    { id: 'detallado', texto: 'Detallado' },
    { id: 'favs', texto: 'Favs' },
  ];
  protected readonly data = signal<Horarios | null | undefined>(undefined);
  protected readonly dia = signal('');
  protected readonly vista = signal<Vista>('todos');
  protected readonly q = signal('');
  protected readonly abiertos = signal(new Set<string>());
  /** Pages fetched from the API per time slot (id → page). */
  private readonly paginas$ = signal(new Map<string, Pagina>());
  private readonly completos = signal(new Map<string, PubAtleta[]>());
  private readonly pidiendo = new Set<string>();
  protected readonly relacionados: RelatedLink[] = [
    { titulo: 'Atletas', texto: 'Busca y sigue a atletas', ruta: '/atletas' },
    { titulo: 'En directo', texto: 'Streaming y marcador', ruta: '/en-directo' },
    { titulo: 'Entradas', texto: 'Gratis con reserva', ruta: '/entradas' },
  ];

  protected readonly diaSel = computed<PubDia | undefined>(() => {
    const d = this.data()?.dias ?? [];
    return d.find((x) => x.fecha === this.dia()) ?? d[0];
  });
  protected readonly icsFavs = computed(() => `${ICS_URL}?atletas=${encodeURIComponent(this.fav.slugs().join(','))}`);
  protected readonly coincidencias = computed(() => {
    const q = norm(this.q());
    return (this.diaSel()?.horarios ?? []).reduce((n, f) => n + this.lista(f).filter((a) => norm(a.nombre + ' ' + a.club).includes(q)).length, 0);
  });
  protected readonly filas = computed<Fila[]>(() => {
    const d = this.diaSel();
    if (!d) return [];
    const q = norm(this.q());
    const favs = new Set(this.fav.slugs());
    let hs = d.horarios;
    if (this.vista() === 'favs') hs = hs.filter((f) => this.lista(f).some((a) => favs.has(a.slug)));
    else if (q.length > 1) hs = hs.filter((f) => this.lista(f).some((a) => norm(a.nombre + ' ' + a.club).includes(q)));
    const rows: Fila[] = hs.map((f) => ({ t: hora(f.inicio), h: f }));
    // the doors line is already shown on top («Puertas 08:30», short text): skip its agenda twin
    if (this.vista() !== 'favs' && q.length < 2) rows.push(...d.agenda.filter((a) => !(d.puertas && a.icono === 'door')).map((a) => ({ t: a.hora, item: { hora: a.hora, titulo: a.titulo, icono: ICONOS[a.icono ?? ''] ?? ('clock' as GrIconName) } })));
    return rows.sort((a, b) => a.t.localeCompare(b.t));
  });

  constructor() {
    const seo = inject(Seo);
    const cms = inject(Cms);
    const competition = inject(Competition);
    const v = this.route.snapshot.queryParamMap.get('vista');
    if (v === 'detallado' || v === 'favs') this.vista.set(v);
    void inject(PendingTasks).run(async () => {
      const [h, c] = await Promise.all([this.api.get(), competition.load()]);
      this.aplicar(h);
      const hs = (h?.dias ?? []).flatMap((d) => d.horarios);
      await applySeo(cms, seo, '/horarios', 'Horarios · GRS Cup 2',
        h?.publicado ? `Horarios de la GRS Cup 2: a qué hora compite cada categoría de peso, femenina y masculina, y el pesaje de cada atleta. Añádelos a tu calendario.`
          : 'Los horarios de la GRS Cup 2 se publican unas 2 semanas antes. Consulta los atletas inscritos y síguelos.', undefined,
        h?.publicado && c ? {
          jsonLd: {
            '@context': 'https://schema.org', '@type': 'SportsEvent', name: c.nombre, sport: 'Powerlifting', startDate: c.fechaInicio, endDate: c.fechaFin,
            location: { '@type': 'Place', name: c.sede.nombre, address: `${c.sede.direccion}, ${c.sede.cp} ${c.sede.ciudad}` },
            subEvent: hs.map((f) => ({ '@type': 'SportsEvent', name: `${sexo(f.sexo)} ${pesos(f)}`, startDate: f.inicio, endDate: f.fin, sport: 'Powerlifting' })),
          },
        } : {});
    });
    effect(() => {
      const d = this.diaSel();
      if (this.browser && d && (this.vista() === 'favs' || this.q().length > 1)) void this.cargarCompletos(d.horarios);
    });
    if (this.browser) {
      // Real time without notices: when the back office publishes or withdraws the schedule, reload in silence.
      const es = new EventSource(`/api/competiciones/${COMPETITION_SLUG}/stream`);
      let t: ReturnType<typeof setTimeout> | undefined;
      const recargar = () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          this.paginas$.set(new Map());
          this.completos.set(new Map());
          this.aplicar(await this.api.get(true));
        }, 400);
      };
      for (const ev of ['horarios.publicados', 'horarios.retirados', 'horarios.cambiados']) es.addEventListener(ev, recargar);
      inject(DestroyRef).onDestroy(() => {
        clearTimeout(t);
        es.close();
      });
    }
  }

  private aplicar(h: Horarios | null): void {
    if (h === null && this.data()) return; // keep what we had if a reload fails
    this.data.set(h);
    if (!h?.publicado) return;
    const dias = h.dias;
    if (!dias.some((d) => d.fecha === this.dia())) {
      const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
      this.dia.set((dias.find((d) => d.fecha === hoy) ?? dias[0])?.fecha ?? '');
    }
  }

  protected cambiarVista(v: Vista): void {
    this.vista.set(v);
    if (v === 'favs') this.q.set('');
    void this.router.navigate([], { queryParams: { vista: v === 'todos' ? null : v }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected toggle(id: string): void {
    const s = new Set(this.abiertos());
    if (s.has(id)) s.delete(id);
    else {
      s.add(id);
      const f = this.diaSel()?.horarios.find((x) => x.id === id);
      if (f && !f.atletas.length && !this.paginas$().has(id)) void this.irA(f, 1);
    }
    this.abiertos.set(s);
  }

  /** Public athletes of a slot: from the payload (old API) or fetched whole for search and Favs (new API). */
  protected lista(f: PubHorario): PubAtleta[] {
    return f.atletas.length ? f.atletas : (this.completos().get(f.id) ?? []);
  }

  /** Search and Favs need every athlete of the day: fetch the lists the payload does not bring (once per slot). */
  private async cargarCompletos(hs: PubHorario[]): Promise<void> {
    for (const f of hs) {
      if (f.atletas.length || !f.total || this.completos().has(f.id) || this.pidiendo.has(f.id)) continue;
      this.pidiendo.add(f.id);
      const items: PubAtleta[] = [];
      for (let page = 1; page <= 20; page++) {
        const r = await this.api.atletas(f.id, page, 100);
        if (!r) break;
        items.push(...r.items);
        if (items.length >= r.total || !r.items.length) break;
      }
      this.pidiendo.delete(f.id);
      this.completos.update((m) => new Map(m).set(f.id, items));
    }
  }

  protected paginas(total: number): number[] {
    return Array.from({ length: Math.ceil(total / POR_PAGINA) }, (_, i) => i + 1);
  }

  /** What the open slot shows: the favourites (Favs), the search hits, or one page of its athletes. */
  protected pagina(f: PubHorario): Pagina {
    if (this.vista() === 'favs') {
      const favs = new Set(this.fav.slugs());
      const items = this.lista(f).filter((a) => favs.has(a.slug));
      return { page: 1, items, total: items.length, cargando: false };
    }
    const q = norm(this.q());
    if (q.length > 1) {
      const items = this.lista(f).filter((a) => norm(a.nombre + ' ' + a.club).includes(q));
      return { page: 1, items, total: items.length, cargando: false };
    }
    const p = this.paginas$().get(f.id);
    if (p) return p;
    // old payloads bring the athletes: first page straight from them; the new API sends none (irA(f, 1) runs on open)
    if (f.atletas.length) return { page: 1, items: f.atletas.slice(0, POR_PAGINA), total: f.atletas.length, cargando: false };
    return { page: 1, items: [], total: f.total, cargando: true };
  }

  /** Next pages come from GET …/horarios/{id}/atletas?page&pageSize; without that endpoint, from the list already loaded. */
  protected async irA(f: PubHorario, page: number): Promise<void> {
    const actual = this.pagina(f);
    const set = (p: Pagina) => this.paginas$.update((m) => new Map(m).set(f.id, p));
    set({ ...actual, cargando: true });
    const r = await this.api.atletas(f.id, page, POR_PAGINA);
    if (r) set({ page: r.page, items: r.items, total: r.total, cargando: false });
    else set({ page, items: this.lista(f).slice((page - 1) * POR_PAGINA, page * POR_PAGINA), total: this.lista(f).length, cargando: false });
  }
}

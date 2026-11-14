import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, PendingTasks, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon, GrSelect, type GrIconName } from '@grcup/ui';
import { Cms } from '../core/cms';
import { Competition, type CompeticionPublica } from '../core/competition';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Lightbox } from '../layout/lightbox';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';
import { GIMNASIOS, mapaDe } from './donde-dormir-y-comer';

type Vista = 'mapa' | 'transporte' | 'aparcamiento' | 'fotos' | 'alojamiento';

/** /como-llegar (Figma page 11, «ampliada»): address and map, transport, parking and accessibility, venue photos, where to stay. */
@Component({
  selector: 'gr-como-llegar-page',
  imports: [RouterLink, FormsModule, Page, GrIcon, GrButton, GrSelect, GrCabecera, Related, Community, Lightbox],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .vista { animation: vista-in 180ms ease-out; }
    @keyframes vista-in { from { opacity: 0; } to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .vista { animation: none; } }
  `,
  template: `
    @let c = comp();
    <gr-page title="Cómo llegar al" [accent]="c ? 'Pabellón de ' + c.sede.ciudad : 'pabellón'" eyebrow="Sede" crumb="Cómo llegar"
      subtitle="Dirección, mapa, transporte desde Valencia y todo lo práctico para el día de la competición." [stamp]="c ? 'Ubicación: OpenStreetMap · ' + c.sede.nombre : ''">
      @if (c) {
        <!-- Figma «Vista» selector (393:129069): not sticky, one ?vista= per view -->
        <div class="mb-8 flex max-w-sm flex-col gap-2 md:mb-12">
          <label class="text-label-s text-text-secondary" for="vista-como-llegar">Vista</label>
          <gr-select id="vista-como-llegar" aria-label="Vista" [ngModel]="vista()" (ngModelChange)="cambiar($event)">
            @for (s of vistas(); track s.id) { <option [value]="s.id">{{ s.t }}</option> }
          </gr-select>
        </div>
        <div class="flex flex-col gap-12 md:gap-20">
          @switch (vista()) {
          @case ('mapa') {
          <!-- 01 · Dirección y mapa -->
          <section id="mapa" class="vista flex flex-col gap-5 md:gap-7">
            <gr-cabecera eyebrow="Ubicación" titulo="Dirección y *mapa*" [centro]="false" tam="m" />
            <div class="grid gap-6 lg:grid-cols-2">
              <article class="flex flex-col overflow-hidden rounded-lg border border-line-subtle bg-bg-card">
                <div class="relative aspect-[348/220] md:aspect-auto md:h-[300px]">
                  <img src="/img/home/mapa.webp" [alt]="'Mapa de ' + c.sede.nombre" class="absolute inset-0 size-full object-cover" loading="lazy" />
                  <span class="absolute right-2 bottom-2 rounded-[4px] bg-black/50 px-1.5 py-0.5 text-body-xs text-text-tertiary">© OpenStreetMap</span>
                </div>
                <div class="flex flex-col gap-3 p-5 md:p-7">
                  <h3 class="text-display-xs">{{ c.sede.nombre }}</h3>
                  <p class="flex items-center gap-2 text-body-s text-text-secondary"><gr-icon name="map-pin" [size]="16" class="shrink-0 text-accent-text" />{{ direccion() }}</p>
                  <div class="flex flex-col gap-2 sm:flex-row">
                    <a grButton variant="display-gradient" [href]="c.sede.mapsUrl" target="_blank" rel="noopener" icon="map-pin">Abrir en Google Maps</a>
                    <button grButton variant="outline" type="button" (click)="copiar()">{{ copiado() ? 'Dirección copiada' : 'Copiar dirección' }}</button>
                  </div>
                </div>
              </article>
              <dl class="flex flex-col gap-3 self-start rounded-lg border border-line-subtle bg-bg-card p-6 lg:self-stretch">
                <div class="flex flex-col gap-1"><dt class="text-label-xs text-text-muted uppercase">Dirección</dt><dd class="text-label-m">{{ direccion() }}</dd></div>
                @if (c.sede.lat && c.sede.lng) { <div class="flex flex-col gap-1"><dt class="text-label-xs text-text-muted uppercase">Coordenadas</dt><dd class="text-label-m tabular-nums">{{ coord(c.sede.lat) }}, {{ coord(c.sede.lng) }}</dd></div> }
                @if (distancia()) { <div class="flex flex-col gap-1"><dt class="text-label-xs text-text-muted uppercase">Distancia</dt><dd class="text-label-m">{{ distancia() }}</dd></div> }
                @if (c.evento.puertas) { <div class="flex flex-col gap-1"><dt class="text-label-xs text-text-muted uppercase">Apertura de puertas</dt><dd class="text-label-m">{{ c.evento.puertas }}</dd></div> }
                @if (c.sede.lat && c.sede.lng) {
                  <div class="mt-1 flex flex-wrap gap-2">
                    <a grButton variant="outline" [href]="'https://maps.apple.com/?daddr=' + c.sede.lat + ',' + c.sede.lng + '&q=' + enc(c.sede.nombre)" target="_blank" rel="noopener">Apple Maps</a>
                    <a grButton variant="outline" [href]="'https://waze.com/ul?ll=' + c.sede.lat + ',' + c.sede.lng + '&navigate=yes'" target="_blank" rel="noopener">Waze</a>
                  </div>
                }
              </dl>
            </div>
          </section>
          }

          <!-- 02 · Cómo llegar -->
          @case ('transporte') {
            <section id="transporte" class="vista flex flex-col gap-5 md:gap-7">
              <gr-cabecera eyebrow="Transporte" titulo="Cómo *llegar*" [centro]="false" tam="m" />
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                @for (t of transporte(); track $index) {
                  <article class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-5">
                    <div class="flex items-center gap-3">
                      <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon [name]="icono(t.tipo)" [size]="20" /></span>
                      <h3 class="text-label-m">{{ t.titulo }}</h3>
                    </div>
                    <p class="text-body-s text-text-tertiary">{{ t.detalle }}</p>
                    @if (t.nota || t.estado === 'por_confirmar') {
                      <p class="mt-auto flex items-center gap-1.5 pt-1 text-[13px] text-text-tertiary" [class.italic]="!t.nota"><gr-icon name="clock" [size]="13" class="shrink-0" />{{ t.nota || 'Por confirmar' }}</p>
                    }
                  </article>
                }
              </div>
            </section>
          }

          <!-- 03 · Aparcamiento y accesibilidad -->
          @case ('aparcamiento') {
          <section id="aparcamiento" class="vista flex flex-col gap-5 md:gap-7">
            <gr-cabecera eyebrow="Información práctica" titulo="Aparcamiento *y accesibilidad*" [centro]="false" tam="m" />
            <div class="grid gap-4 lg:grid-cols-2">
              @for (t of practica(); track $index) {
                <article class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-6">
                  <div class="flex items-center gap-3">
                    <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon [name]="icono(t.tipo)" [size]="20" /></span>
                    <h3 class="text-ui-h5">{{ t.titulo }}</h3>
                  </div>
                  <p class="text-body-s text-text-tertiary">{{ t.detalle }}</p>
                  @if (t.estado === 'por_confirmar') { <p class="flex items-center gap-1.5 text-[13px] text-text-tertiary italic"><gr-icon name="clock" [size]="13" class="shrink-0" />Por confirmar</p> }
                  @if (t.nota) { <p class="text-body-xs text-text-secondary">{{ t.nota }}</p> }
                </article>
              }
            </div>
          </section>
          }

          <!-- 04 · Fotos del pabellón -->
          @case ('fotos') {
          <section id="fotos" class="vista flex flex-col gap-5 md:gap-7">
            <gr-cabecera eyebrow="La sede" titulo="Fotos del *pabellón*" [centro]="false" tam="m" />
            <ul class="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0" (scroll)="alDesplazar($event)">
              @for (f of fotos(); track f.imagen; let i = $index) {
                <li class="relative aspect-[300/220] w-[300px] shrink-0 snap-center overflow-hidden rounded-lg border border-white/8 md:aspect-[288/190] md:w-auto">
                  <button type="button" class="group absolute inset-0 cursor-zoom-in" [attr.aria-label]="'Ampliar: ' + f.alt" (click)="ver.set(i)">
                    <img [src]="f.imagen" [alt]="f.alt" class="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" loading="lazy" />
                  </button>
                </li>
              }
            </ul>
            <gr-lightbox [fotos]="fotos()" [(indice)]="ver" />
            <div class="flex items-center gap-1.5 md:hidden" aria-hidden="true">
              @for (f of fotos(); track f.imagen; let i = $index) { <span class="h-1.5 rounded-pill transition-all" [class]="i === foto() ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'"></span> }
            </div>
          </section>
          }

          <!-- 05 · Alojamiento (Figma 393:130556) -->
          @case ('alojamiento') {
          <div class="vista flex flex-col gap-12 md:gap-20">
          <section id="alojamiento" class="flex flex-col gap-5 md:gap-7">
            <gr-cabecera eyebrow="Alojamiento" titulo="Dónde *dormir y comer*" [centro]="false" tam="m" />
            <article class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-5 md:p-6">
              <div class="flex items-center gap-3">
                <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon name="building" [size]="20" /></span>
                <h3 class="text-label-m">Alojamientos y gimnasios cerca</h3>
              </div>
              <p class="text-body-s text-text-tertiary">Infórmate acerca de los mejores alojamientos y gimnasios para entrenar cerca del lugar de competición.</p>
              <a grButton variant="outline" size="l" class="mt-1 w-full sm:w-auto sm:self-start" routerLink="/donde-dormir-y-comer">Ver alojamientos cerca</a>
            </article>
          </section>
          <section id="entrenar" class="flex flex-col gap-5 md:gap-7">
            <gr-cabecera eyebrow="Entrenar" titulo="Dónde *entrenar*" [centro]="false" tam="m" />
            <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              @for (g of gimnasios; track g.nombre) {
                <li class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-5">
                  <div class="flex items-center gap-3">
                    <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon name="trophy" [size]="20" /></span>
                    <h3 class="text-label-m">{{ g.nombre }}</h3>
                  </div>
                  <p class="text-body-s text-text-tertiary">{{ g.detalle }}</p>
                  <a [href]="g.web || mapa(g)" target="_blank" rel="noopener nofollow" class="mt-auto inline-flex items-center gap-1.5 pt-1 text-label-s text-accent-text hover:underline">{{ g.web ? 'Ver web' : 'Ver en el mapa' }}<gr-icon name="external-link" [size]="14" /></a>
                </li>
              }
            </ul>
          </section>
          </div>
          }
          }

          <gr-related [items]="relacionados" />
          <gr-community />
        </div>
      }
    </gr-page>
  `,
})
export class ComoLlegarPage {
  protected readonly comp = signal<CompeticionPublica | null>(null);
  protected readonly copiado = signal(false);
  protected readonly foto = signal(0);
  /** Photo open in the lightbox (−1: closed). */
  protected readonly ver = signal(-1);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly qp = toSignal(this.ruta.queryParamMap);
  protected readonly gimnasios = GIMNASIOS;
  protected readonly mapa = mapaDe;
  protected readonly enc = encodeURIComponent;
  /** Views of the «Vista» selector (one without data is hidden). */
  protected readonly vistas = computed(() => [
    { id: 'mapa', t: 'Mapa' },
    ...(this.transporte().length ? [{ id: 'transporte', t: 'Transporte' }] : []),
    ...(this.practica().length ? [{ id: 'aparcamiento', t: 'Aparcamiento y accesibilidad' }] : []),
    { id: 'fotos', t: 'Fotos del pabellón' },
    { id: 'alojamiento', t: 'Alojamiento' },
  ]);
  protected readonly vista = computed<Vista>(() => {
    const v = this.qp()?.get('vista');
    return (this.vistas().some((x) => x.id === v) ? v : 'mapa') as Vista;
  });
  protected readonly relacionados: RelatedLink[] = [
    { titulo: 'Público', texto: 'Entrada y normas', ruta: '/publico' },
    { titulo: 'Horarios', texto: 'Bloques por categoría', ruta: '/horarios' },
    { titulo: 'Preguntas frecuentes', texto: 'Resolvemos tus dudas', ruta: '/preguntas-frecuentes' },
  ];
  private readonly fotosCms = signal<{ imagen: string; alt: string }[]>([]);
  protected readonly fotos = computed(() => (this.fotosCms().length ? this.fotosCms() : FOTOS_SEDE));
  protected readonly direccion = computed(() => {
    const s = this.comp()?.sede;
    return s ? [s.direccion, [s.cp, s.ciudad].filter(Boolean).join(' ') + (s.provincia ? ` (${s.provincia})` : '')].filter(Boolean).join(' · ') : '';
  });
  /** «≈ 16 km al sur de Valencia» (straight line from the city centre). */
  protected readonly distancia = computed(() => {
    const s = this.comp()?.sede;
    if (!s?.lat || !s?.lng) return '';
    const [la1, lo1, la2, lo2] = [VALENCIA[0], VALENCIA[1], s.lat, s.lng].map((x) => (x * Math.PI) / 180);
    const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
    const km = Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
    if (km < 3) return 'En Valencia';
    const ang = (Math.atan2(Math.sin(lo2 - lo1) * Math.cos(la2), Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(lo2 - lo1)) * 180) / Math.PI;
    const rumbo = ['norte', 'noreste', 'este', 'sureste', 'sur', 'suroeste', 'oeste', 'noroeste'][Math.round(((ang + 360) % 360) / 45) % 8];
    return `≈ ${km} km al ${rumbo} de Valencia`;
  });
  protected readonly transporte = computed(() => (this.comp()?.comoLlegar ?? []).filter((t) => !PRACTICA.includes(t.tipo)));
  protected readonly practica = computed(() => {
    return (this.comp()?.comoLlegar ?? []).filter((t) => PRACTICA.includes(t.tipo));
  });
  constructor() {
    const competition = inject(Competition);
    const cms = inject(Cms);
    const seo = inject(Seo);
    void inject(PendingTasks).run(async () => {
      const [c, home] = await Promise.all([competition.load(), cms.home().catch(() => null)]);
      this.comp.set(c);
      // the venue photos are the ones of the home «Localización» section (one place to edit them)
      const loc = home?.secciones?.['localizacion'];
      const imgs = (loc?.['imagenes'] as { imagen?: string; alt?: string }[] | undefined) ?? [];
      this.fotosCms.set(imgs.filter((x) => x?.imagen).map((x) => ({ imagen: x.imagen!, alt: x.alt || 'El pabellón' })).slice(0, 4));
      await applySeo(cms, seo, '/como-llegar', 'Cómo llegar · GRS Cup 2', `Cómo llegar al ${c?.sede.nombre ?? 'pabellón'} de ${c?.sede.ciudad ?? 'Almussafes'}: mapa, coche, transporte público, aparcamiento y alojamiento.`);
    });
  }
  /** Same URL with ?vista= (replaceUrl, no scroll jump); the canonical stays on the base URL. */
  protected cambiar(v: string): void {
    void this.router.navigate([], { relativeTo: this.ruta, queryParams: { vista: v === 'mapa' ? null : v }, replaceUrl: true, preserveFragment: false });
  }
  protected icono(tipo: string): GrIconName {
    return ({ coche: 'car', tren: 'train', metro: 'train', avion: 'plane', bus: 'bus', bici: 'bike', parking: 'parking', accesibilidad: 'accessibility' } as Record<string, GrIconName>)[tipo] ?? 'map-pin';
  }
  protected coord(n: number): string {
    return n.toFixed(4).replace('-', '−');
  }
  protected alDesplazar(e: Event): void {
    this.foto.set(Math.round((e.target as HTMLElement).scrollLeft / 312));
  }
  protected copiar(): void {
    const c = this.comp();
    void navigator.clipboard?.writeText(`${c?.sede.nombre}, ${this.direccion().replace(' · ', ', ')}`).then(() => {
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2500);
    });
  }
}

const VALENCIA = [39.4699, -0.3763];
const PRACTICA = ['parking', 'accesibilidad'];
export const FOTOS_SEDE = [
  { imagen: '/img/home/sede-exterior-s.webp', alt: 'Entrada del pabellón' },
  { imagen: '/img/home/sede-grada.webp', alt: 'La grada' },
  { imagen: '/img/home/sede-instalaciones.webp', alt: 'Instalaciones' },
  { imagen: '/img/home/sede-pista.webp', alt: 'La pista central' },
];

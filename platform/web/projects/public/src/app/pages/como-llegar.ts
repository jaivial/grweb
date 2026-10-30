import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { GrButton, GrIcon, type GrIconName } from '@grcup/ui';
import { Cms } from '../core/cms';
import { Competition, type CompeticionPublica } from '../core/competition';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Community, Related, type RelatedLink } from './landings';

/** /como-llegar (Figma page 11, «ampliada»): address and map, transport, parking and accessibility, venue photos, where to stay. */
@Component({
  selector: 'gr-como-llegar-page',
  imports: [Page, GrIcon, GrButton, GrCabecera, Related, Community],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = comp();
    <gr-page title="Cómo llegar al" [accent]="c ? 'Pabellón de ' + c.sede.ciudad : 'pabellón'" eyebrow="Sede" crumb="Cómo llegar"
      subtitle="Dirección, mapa, transporte desde Valencia y todo lo práctico para el día de la competición." [stamp]="c ? 'Ubicación: OpenStreetMap · ' + c.sede.nombre : ''">
      @if (c) {
        <!-- Figma «Anchor chips» (mobile) -->
        <nav class="sticky top-[76px] z-20 -mx-5 -mt-4 mb-6 flex gap-2 overflow-x-auto border-b border-line-subtle bg-bg-base/95 px-5 py-3 backdrop-blur [scrollbar-width:none] md:hidden" aria-label="Secciones">
          @for (s of anclas; track s.id) {
            <a [href]="'#' + s.id" class="flex h-9 shrink-0 items-center rounded-full border px-4 text-label-s" [class]="activa() === s.id ? 'border-accent bg-accent/16 text-text-primary' : 'border-line-strong text-text-secondary'">{{ s.t }}</a>
          }
        </nav>
        <div class="flex flex-col gap-12 md:gap-20">
          <!-- 01 · Dirección y mapa -->
          <section id="mapa" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
            <gr-cabecera eyebrow="01 · Ubicación" titulo="Dirección y *mapa*" [centro]="false" tam="m" />
            <div class="grid gap-6 lg:grid-cols-2">
              <article class="flex flex-col overflow-hidden rounded-2xl border border-line-subtle bg-bg-card">
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
              <dl class="flex flex-col gap-3 self-start rounded-2xl border border-line-subtle bg-bg-card p-6 lg:self-stretch">
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

          <!-- 02 · Cómo llegar -->
          @if (transporte().length) {
            <section id="transporte" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
              <gr-cabecera eyebrow="02 · Transporte" titulo="Cómo *llegar*" [centro]="false" tam="m" />
              <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                @for (t of transporte(); track $index) {
                  <article class="flex flex-col gap-2 rounded-2xl border border-line-subtle bg-bg-card p-5">
                    <span class="mb-1 flex size-11 items-center justify-center rounded-xl bg-accent/12 text-accent-text"><gr-icon [name]="icono(t.tipo)" [size]="22" /></span>
                    <h3 class="text-label-m">{{ t.titulo }}</h3>
                    <p class="text-body-s text-text-tertiary">{{ t.detalle }}</p>
                    @if (t.nota || t.estado === 'por_confirmar') {
                      <p class="mt-auto flex items-center gap-1.5 pt-1 text-body-xs" [class]="t.nota ? 'text-text-secondary' : 'text-info'"><gr-icon name="clock" [size]="13" class="shrink-0" />{{ t.nota || 'Por confirmar' }}</p>
                    }
                  </article>
                }
              </div>
            </section>
          }

          <!-- 03 · Aparcamiento y accesibilidad -->
          <section id="aparcamiento" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
            <gr-cabecera eyebrow="03 · Información práctica" titulo="Aparcamiento *y accesibilidad*" [centro]="false" tam="m" />
            <div class="grid gap-4 lg:grid-cols-2">
              @for (t of practica(); track $index) {
                <article class="flex flex-col gap-2 rounded-2xl border border-line-subtle bg-bg-card p-6">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="flex size-10 items-center justify-center rounded-xl bg-accent/12 text-accent-text"><gr-icon [name]="icono(t.tipo)" [size]="20" /></span>
                    <h3 class="text-ui-h5">{{ t.titulo }}</h3>
                    @if (t.estado === 'por_confirmar') { <span class="ml-auto inline-flex h-7 items-center rounded-full border border-info bg-info/12 px-3 text-label-xs text-info uppercase">Por confirmar</span> }
                  </div>
                  <p class="text-body-s text-text-tertiary">{{ t.detalle }}</p>
                  @if (t.nota) { <p class="text-body-xs text-text-secondary">{{ t.nota }}</p> }
                </article>
              }
            </div>
          </section>

          <!-- 04 · Fotos del pabellón -->
          <section id="fotos" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
            <gr-cabecera eyebrow="04 · La sede" titulo="Fotos del *pabellón*" [centro]="false" tam="m" />
            <ul class="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0" (scroll)="alDesplazar($event)">
              @for (f of fotos(); track f.imagen) {
                <li class="relative aspect-[300/220] w-[300px] shrink-0 snap-center overflow-hidden rounded-2xl border border-white/8 md:aspect-[288/190] md:w-auto">
                  <img [src]="f.imagen" [alt]="f.alt" class="absolute inset-0 size-full object-cover" loading="lazy" />
                </li>
              }
            </ul>
            <div class="flex items-center gap-1.5 md:hidden" aria-hidden="true">
              @for (f of fotos(); track f.imagen; let i = $index) { <span class="h-1.5 rounded-pill transition-all" [class]="i === foto() ? 'w-5 bg-accent' : 'w-1.5 bg-line-strong'"></span> }
            </div>
          </section>

          <!-- 05 · Dónde dormir y comer -->
          <section id="alojamiento" class="flex scroll-mt-36 flex-col gap-5 md:scroll-mt-28 md:gap-7">
            <gr-cabecera eyebrow="05 · Alojamiento" titulo="Dónde *dormir y comer*" [centro]="false" tam="m" />
            <div class="relative flex gap-3 overflow-hidden rounded-2xl bg-success/8 p-4">
              <span class="absolute top-3.5 bottom-3.5 left-0 w-[3px] rounded-full bg-success" aria-hidden="true"></span>
              <gr-icon name="circle-check" [size]="20" class="ml-2 shrink-0 text-success" />
              <div class="flex flex-col gap-1"><p class="text-label-s text-success">Consejo</p>
                <p class="text-body-m text-text-secondary">Si vienes de fuera, alójate en Valencia o en la Ribera Baixa ({{ c.sede.ciudad }}, Benifaió, Silla). Publicaremos aquí los acuerdos con alojamientos cercanos.</p></div>
            </div>
            <a grButton variant="outline" size="l" class="w-full sm:w-auto sm:self-start" [href]="hoteles()" target="_blank" rel="noopener">Ver alojamientos cerca</a>
          </section>

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
  protected readonly activa = signal('mapa');
  protected readonly enc = encodeURIComponent;
  protected readonly anclas = [{ id: 'mapa', t: 'Mapa' }, { id: 'transporte', t: 'Transporte' }, { id: 'aparcamiento', t: 'Aparcamiento' }, { id: 'fotos', t: 'Fotos' }, { id: 'alojamiento', t: 'Alojamiento' }];
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
    const l = (this.comp()?.comoLlegar ?? []).filter((t) => PRACTICA.includes(t.tipo));
    if (!l.some((t) => t.tipo === 'parking')) l.unshift({ tipo: 'parking', titulo: 'Aparcamiento', detalle: 'Te confirmaremos dónde aparcar cerca del pabellón.', estado: 'por_confirmar' });
    if (!l.some((t) => t.tipo === 'accesibilidad')) l.push({ tipo: 'accesibilidad', titulo: 'Accesibilidad', detalle: 'Te confirmaremos los accesos y las zonas para personas con movilidad reducida.', estado: 'por_confirmar' });
    return l;
  });
  protected readonly hoteles = computed(() => {
    const s = this.comp()?.sede;
    return s?.lat && s?.lng ? `https://www.google.com/maps/search/alojamiento/@${s.lat},${s.lng},12z` : 'https://www.google.com/maps/search/alojamiento+Almussafes';
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
      await applySeo(cms, seo, '/como-llegar', 'Cómo llegar · GR Strength Cup', `Cómo llegar al ${c?.sede.nombre ?? 'pabellón'} de ${c?.sede.ciudad ?? 'Almussafes'}: mapa, coche, transporte público, aparcamiento y alojamiento.`);
    });
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      // highlight the chip of the section on screen (mobile)
      const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) this.activa.set(e.target.id); }, { rootMargin: '-40% 0px -55% 0px' });
      const t = setTimeout(() => this.anclas.forEach((a) => { const el = document.getElementById(a.id); if (el) io.observe(el); }), 500);
      inject(DestroyRef).onDestroy(() => { clearTimeout(t); io.disconnect(); });
    }
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
const FOTOS_SEDE = [
  { imagen: '/img/home/sede-exterior-s.webp', alt: 'Entrada del pabellón' },
  { imagen: '/img/home/sede-grada.webp', alt: 'La grada' },
  { imagen: '/img/home/sede-instalaciones.webp', alt: 'Instalaciones' },
  { imagen: '/img/home/sede-pista.webp', alt: 'La pista central' },
];

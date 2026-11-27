import { RouterLink } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, inject, signal, type WritableSignal } from '@angular/core';
import { GrButton, GrIcon, esConReanudacion, type GrIconName } from '@grcup/ui';
import { Cms, type Sitio } from '../core/cms';
import { COMPETITION_SLUG } from '../core/competition';
import { I18n, LocPipe, type Lang } from '../core/i18n';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Page } from '../layout/page';
import { applySeo } from './content';
import { Related, type RelatedLink } from './landings';
import { Sitios } from './sitios';

export type { Sitio } from '../core/cms';
interface Seccion {
  id: string;
  eyebrow: Record<Lang, string>;
  titulo: Record<Lang, string>;
  texto: Record<Lang, string>;
  icono: GrIconName;
  sitios: Sitio[];
}

/** Google Maps search of a place (the «Mapa» link). */
export function mapaDe(s: Sitio): string {
  return s.maps || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${s.nombre}, ${s.detalle}`);
}

/**
 * Hotels/restaurants and gyms of the backoffice (Colaboradores Refugio): loaded by REST with `cargar()` (inside the
 * page's PendingTasks, so SSR renders them) and reloaded on their public SSE events while the page is open.
 * Lists are null until the first load. Call it in an injection context.
 */
export function sitiosDelCms() {
  const cms = inject(Cms);
  const hoteles = signal<Sitio[] | null>(null);
  const gimnasios = signal<Sitio[] | null>(null);
  if (isPlatformBrowser(inject(PLATFORM_ID))) {
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Reopened on every come-back: iOS Safari leaves the stream dead after a freeze.
    const cerrar = esConReanudacion(() => {
      const es = new EventSource(`/api/competiciones/${COMPETITION_SLUG}/stream`);
      const seguir = (ev: string, i: number, get: () => Promise<Sitio[] | null>, lista: WritableSignal<Sitio[] | null>) =>
        es.addEventListener(ev, () => {
          clearTimeout(timers[i]);
          timers[i] = setTimeout(async () => {
            const l = await get();
            if (l) lista.set(l);
          }, 400);
        });
      seguir('web.hoteles_restaurantes', 0, () => cms.hotelesRestaurantes(), hoteles);
      seguir('web.gimnasios', 1, () => cms.gimnasios(), gimnasios);
      return es;
    });
    inject(DestroyRef).onDestroy(() => { timers.forEach(clearTimeout); cerrar(); });
  }
  return {
    hoteles: hoteles.asReadonly(),
    gimnasios: gimnasios.asReadonly(),
    cargar: async () => {
      const [h, g] = await Promise.all([cms.hotelesRestaurantes(), cms.gimnasios()]);
      hoteles.set(h ?? []);
      gimnasios.set(g ?? []);
    },
  };
}

const T = {
  es: {
    titulo: 'Alojamientos cerca', acento: 'del pabellón', visita: 'Visita', seccion: 'Cómo llegar',
    preparando: 'Estamos preparando la guía',
    pronto: 'Pronto publicaremos alojamientos, restaurantes y gimnasios cerca del pabellón. Mientras tanto, mira cómo llegar.', verComo: 'Ver cómo llegar',
    relacionados: [
      { titulo: 'Público', texto: 'Entrada y normas', ruta: '/publico' },
      { titulo: 'Horarios', texto: 'Bloques por categoría', ruta: '/horarios' },
      { titulo: 'Preguntas frecuentes', texto: 'Resolvemos tus dudas', ruta: '/preguntas-frecuentes' },
    ] as RelatedLink[],
    seoTitulo: 'Alojamientos cerca del pabellón · GRS Cup 2',
    seoDesc: 'Hoteles, apartamentos y restaurantes cerca del Pabellón Municipal de Almussafes y gimnasios de fuerza en Valencia para atletas y público de la GRS Cup 2.',
  },
  en: {
    titulo: 'Accommodation near', acento: 'the sports hall', visita: 'Visit', seccion: 'Getting there',
    preparando: 'We’re putting the guide together',
    pronto: 'We’ll soon publish places to stay, restaurants and gyms near the sports hall. In the meantime, see how to get there.', verComo: 'See how to get there',
    relacionados: [
      { titulo: 'Spectators', texto: 'Tickets and rules', ruta: '/publico' },
      { titulo: 'Schedule', texto: 'Sessions by category', ruta: '/horarios' },
      { titulo: 'FAQ', texto: 'Answers to your questions', ruta: '/preguntas-frecuentes' },
    ] as RelatedLink[],
    seoTitulo: 'Accommodation near the sports hall · GRS Cup 2',
    seoDesc: 'Hotels, apartments and restaurants near the Almussafes sports hall, and strength gyms in Valencia, for GRS Cup 2 athletes and spectators.',
  },
};

/**
 * /donde-dormir-y-comer (Figma 393:132672; without sections 393:136197): hotels, apartments, where to eat and gyms near
 * the venue, linked from /como-llegar?vista=alojamiento. An empty section is not painted.
 */
@Component({
  selector: 'gr-donde-dormir-page',
  imports: [RouterLink, LocPipe, Page, GrIcon, GrButton, GrCabecera, Related, Sitios],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().titulo" [accent]="t().acento" [eyebrow]="t().visita" [section]="t().seccion" [crumb]="t().titulo">
      <div class="flex flex-col gap-12 md:gap-20">
        @for (b of secciones() ?? []; track b.id) {
          <section [id]="b.id" class="flex scroll-mt-28 flex-col gap-6 md:gap-8">
            <gr-cabecera [eyebrow]="b.eyebrow[lang()]" [titulo]="b.titulo[lang()]" [texto]="b.texto[lang()]" [centro]="false" tam="m" />
            <gr-sitios [sitios]="b.sitios" [icono]="b.icono" [conLogo]="b.id === 'gimnasios'" />
          </section>
        } @empty { @if (secciones()) {
          <!-- Figma 393:136197 -->
          <div class="flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-6 py-12 text-center">
            <gr-icon name="building" [size]="28" class="text-text-tertiary" />
            <h2 class="text-ui-h4">{{ t().preparando }}</h2>
            <p class="max-w-md text-body-s text-text-tertiary">{{ t().pronto }}</p>
            <a grButton variant="outline" [routerLink]="'/como-llegar' | loc" icon="map-pin" class="mt-2">{{ t().verComo }}</a>
          </div>
        } }
        <gr-related [items]="t().relacionados" />
      </div>
    </gr-page>
  `,
})
export class DondeDormirPage {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly lang = this.i18n.lang;
  private readonly sitios = sitiosDelCms();
  /** null while loading (the «preparando la guía» notice only shows once the lists are known to be empty). */
  protected readonly secciones = computed(() => {
    const h = this.sitios.hoteles(), g = this.sitios.gimnasios();
    if (!h || !g) return null;
    const lista: Record<string, Sitio[]> = { hoteles: h.filter((s) => s.tipo === 'hotel'), apartamentos: h.filter((s) => s.tipo === 'apartamento'), comer: h.filter((s) => s.tipo === 'restaurante'), gimnasios: g };
    return SECCIONES.map((s) => ({ ...s, sitios: lista[s.id] ?? [] })).filter((s) => s.sitios.length);
  });

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    void inject(PendingTasks).run(() => Promise.all([
      this.sitios.cargar(),
      applySeo(cms, seo, '/donde-dormir-y-comer', this.t().seoTitulo, this.t().seoDesc),
    ]));
  }
}

/** Sections of the page, in order; their places come from the backoffice (hotels by «tipo»). */
const SECCIONES: Omit<Seccion, 'sitios'>[] = [
  { id: 'hoteles', eyebrow: { es: 'Dormir', en: 'Stay' }, titulo: { es: 'Hoteles *cerca*', en: 'Hotels *nearby*' }, texto: { es: 'Hoteles de Almussafes con tarifa especial para el grupo GRS.', en: 'Hotels in Almussafes with a special rate for the GRS group.' }, icono: 'building' },
  { id: 'apartamentos', eyebrow: { es: 'Dormir', en: 'Stay' }, titulo: { es: 'Apartamentos *turísticos*', en: 'Holiday *apartments*' }, texto: { es: 'Para equipos y grupos que vienen varios días.', en: 'For teams and groups staying several days.' }, icono: 'home' },
  { id: 'comer', eyebrow: { es: 'Comer', en: 'Eat' }, titulo: { es: 'Dónde *comer*', en: 'Where to *eat*' }, texto: { es: 'Restaurantes y bares cerca del pabellón para antes y después de la competición.', en: 'Restaurants and bars near the sports hall for before and after the competition.' }, icono: 'star' },
  { id: 'gimnasios', eyebrow: { es: 'Entrenar', en: 'Train' }, titulo: { es: 'Gimnasios de powerlifting *donde entrenar*', en: 'Powerlifting gyms *to train at*' }, texto: { es: 'Gimnasios en Almussafes, Picassent, Benifaió y Valencia para entrenar los días previos.', en: 'Gyms in Almussafes, Picassent, Benifaió and Valencia to train at in the days before.' }, icono: 'trophy' },
];

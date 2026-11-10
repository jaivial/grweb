import { RouterLink } from '@angular/router';
import { ChangeDetectionStrategy, Component, PendingTasks, inject } from '@angular/core';
import { GrButton, GrIcon, type GrIconName } from '@grcup/ui';
import { Cms } from '../core/cms';
import { Seo } from '../core/seo';
import { GrCabecera } from '../home/bloques';
import { Page } from '../layout/page';
import { applySeo } from './content';

/** A place of the page: the lists below are data, change them there. */
interface Sitio {
  nombre: string;
  tipo: string;
  direccion: string;
  /** Own website; without it the link is a Google Maps search of the name. */
  web?: string;
}
interface Grupo {
  id: string;
  titulo: string;
  icono: GrIconName;
  sitios: Sitio[];
}

/**
 * /donde-dormir-y-comer: where to sleep and eat in Almussafes and where to train in Valencia, linked from
 * /como-llegar (Figma page 11, «Dónde dormir y comer»). SEO: one h1, two h2 and three h3 (the names of the
 * places are not headings).
 */
@Component({
  selector: 'gr-donde-dormir-page',
  imports: [RouterLink, Page, GrIcon, GrButton, GrCabecera],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Dónde dormir y comer en" accent="Almussafes" eyebrow="Visita" section="Cómo llegar" crumb="Dónde dormir y comer"
      subtitle="Hoteles y restaurantes en Almussafes, a pocos minutos del pabellón, y gimnasios de powerlifting en Valencia para entrenar los días previos a la competición.">
      <div class="flex flex-col gap-12 md:gap-20">
        @for (b of bloques; track b.id) {
          <section [id]="b.id" class="flex scroll-mt-28 flex-col gap-6 md:gap-8">
            <gr-cabecera [eyebrow]="b.eyebrow" [titulo]="b.titulo" [texto]="b.texto" [centro]="false" tam="m" />
            @for (g of b.grupos; track g.id) {
              <div [id]="g.id" class="flex scroll-mt-28 flex-col gap-4">
                <div class="flex items-center gap-3">
                  <span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent/12 text-accent-text"><gr-icon [name]="g.icono" [size]="20" /></span>
                  <h3 class="text-ui-h5 md:text-ui-h4">{{ g.titulo }}</h3>
                </div>
                <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  @for (s of g.sitios; track s.nombre) {
                    <li class="flex flex-col gap-2 rounded-lg border border-line-subtle bg-bg-card p-5">
                      <p class="text-label-xs text-text-muted uppercase">{{ s.tipo }}</p>
                      <p class="text-label-m">{{ s.nombre }}</p>
                      <p class="flex items-start gap-2 text-body-s text-text-tertiary"><gr-icon name="map-pin" [size]="16" class="mt-0.5 shrink-0 text-accent-text" />{{ s.direccion }}</p>
                      <a [href]="s.web || mapa(s)" target="_blank" rel="noopener nofollow" class="mt-auto inline-flex items-center gap-1.5 pt-2 text-label-s text-accent-text hover:underline">
                        {{ s.web ? 'Ver web' : 'Ver en Google Maps' }}<gr-icon name="external-link" [size]="14" /></a>
                    </li>
                  }
                </ul>
              </div>
            }
          </section>
        }

        <!-- Figma «Callout» (success) of «Dónde dormir y comer» -->
        <div class="relative flex gap-3 overflow-hidden rounded-lg bg-success/8 p-4">
          <gr-icon name="circle-check" [size]="20" class="ml-2 shrink-0 text-success" />
          <div class="flex flex-col gap-1"><p class="text-label-s text-success">Consejo</p>
            <p class="text-body-m text-text-secondary">Es una selección orientativa: reserva con tiempo y confirma horarios, precios y condiciones con cada establecimiento. El fin de semana de la competición la zona se llena.</p></div>
        </div>
        <div class="flex flex-col gap-3 sm:flex-row">
          <a grButton variant="outline" size="l" routerLink="/como-llegar" icon="map-pin">Cómo llegar al pabellón</a>
          <a grButton variant="outline" size="l" routerLink="/mapa-de-accesos">Mapa de accesos</a>
        </div>
      </div>
    </gr-page>
  `,
})
export class DondeDormirPage {
  protected readonly bloques = BLOQUES;

  constructor() {
    const cms = inject(Cms);
    const seo = inject(Seo);
    void inject(PendingTasks).run(() =>
      applySeo(cms, seo, '/donde-dormir-y-comer', 'Dónde dormir y comer en Almussafes · GR Strength Cup',
        'Hoteles y restaurantes en Almussafes cerca del pabellón y gimnasios de powerlifting y culturismo en Valencia para atletas y público de la GR Strength Cup.'));
  }

  protected mapa(s: Sitio): string {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${s.nombre}, ${s.direccion}`);
  }
}

// Provisional places (a simple search: OpenStreetMap and the web of each club, November 2026). The final
// selection is still to be decided: edit these three lists.
const ALOJAMIENTOS: Sitio[] = [
  { nombre: 'Hotel Bartos', tipo: 'Hotel', direccion: 'Carrer del Mestre Medina, 46440 Almussafes', web: 'https://www.hotelbartos.com/' },
  { nombre: 'Ramada by Wyndham Valencia Almussafes', tipo: 'Hotel', direccion: 'Avinguda de la Foia, 46440 Almussafes', web: 'https://www.wyndhamhotels.com/es-xl/ramada/almussafes-spain/ramada-valencia-almussafes/overview' },
  { nombre: 'Hotel Isabel', tipo: 'Hotel', direccion: 'Carrer de Salvador Botella, 46440 Almussafes' },
  { nombre: 'Pensión Nadal', tipo: 'Pensión', direccion: 'Carrer de la Lira Almussafense, 6, 46440 Almussafes' },
];
const RESTAURANTES: Sitio[] = [
  { nombre: 'Casa La Cuesta', tipo: 'Restaurante', direccion: "Carrer d'Ausiàs March, 46440 Almussafes" },
  { nombre: 'Cervecería Enjoy', tipo: 'Cervecería', direccion: "Ronda de l'Historiador Lluís Duart Alabarta, Almussafes" },
  { nombre: 'Bar Polideportivo', tipo: 'Bar restaurante', direccion: 'Ronda Antoni Ludeña, 46440 Almussafes' },
];
const GIMNASIOS: Sitio[] = [
  { nombre: 'GR Strength Powerlifting Club', tipo: 'Club de powerlifting', direccion: 'P. I. Canyada dels Codonyers, calle 13, n.º 11, nave 9, 46220 Picassent', web: 'https://www.grteam.net/grs-powerlifting-club-valencia' },
  { nombre: 'Anvil Strength', tipo: 'Club de powerlifting', direccion: 'Puerto de Sagunto (Valencia)', web: 'https://anvilstrength.es/powerlifting-valencia' },
  { nombre: 'Titan Fitness Valencia', tipo: 'Fuerza y alto rendimiento', direccion: 'Valencia', web: 'https://www.instagram.com/titanfitnessvalencia' },
  { nombre: 'Fitness Park Valencia', tipo: 'Musculación y culturismo', direccion: 'Valencia y área metropolitana', web: 'https://www.fitnesspark.es/valencia' },
];

const BLOQUES: { id: string; eyebrow: string; titulo: string; texto: string; grupos: Grupo[] }[] = [
  {
    id: 'almussafes', eyebrow: 'Alojamiento y restaurantes', titulo: 'Hoteles y restaurantes *cerca del pabellón*',
    texto: 'Todo queda a pocos minutos a pie o en coche del Pabellón de Almussafes.',
    grupos: [
      { id: 'hoteles', titulo: 'Hoteles en Almussafes', icono: 'building', sitios: ALOJAMIENTOS },
      { id: 'restaurantes', titulo: 'Restaurantes en Almussafes', icono: 'star', sitios: RESTAURANTES },
    ],
  },
  {
    id: 'entrenar', eyebrow: 'Dónde entrenar', titulo: 'Gimnasios de powerlifting *en Valencia*',
    texto: 'Para el último entrenamiento antes de subir a la tarima. Pregunta antes por el pase de día.',
    grupos: [{ id: 'gimnasios', titulo: 'Powerlifting y culturismo en Valencia', icono: 'trophy', sitios: GIMNASIOS }],
  },
];

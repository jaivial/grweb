import { HorariosPage } from './pages/horarios';
import { BajaPage, NovedadesConfirmarPage } from './pages/novedades';
import { ConfirmacionPage, EntradasPage, MiEntradaPage, OfertaPage } from './pages/entradas';
import { SorteoConfirmacionPage, SorteoPage } from './pages/sorteo';
import { EdicionPage, EnDirectoPage, PantallaPublicaPage, ResultadosEdicionPage, ResultadosIndexPage } from './pages/directo';
import { AccesoPage } from './pages/acceso';
import { PorraPage } from './pages/porra/porra';
import { MisApuestasPage } from './pages/porra/mis-apuestas';
import { PorraClasificacionPage } from './pages/porra/clasificacion';
import { MiEquipoPage } from './pages/fantasy/mi-equipo';
import { MercadoFantasyPage } from './pages/fantasy/mercado';
import { FantasyClasificacionPage } from './pages/fantasy/clasificacion';
import { ComoSeJuegaPage } from './pages/fantasy/como-se-juega';
import type { Routes } from '@angular/router';
import { HomePage, NotFoundPage } from './home/home';
import { ClubsPage, EnPage, PublicoPage } from './pages/landings';
import { AreaAtletaPage } from './pages/area';
import { InscripcionEstadoPage, InscripcionPage, PagoSimuladoPage } from './pages/inscripcion';
import { AtletaPage, AtletasPage, ParticipantesPage } from './pages/atletas';
import { ContentPage, LegalPage } from './pages/content';
import { BlogPage, BlogPostPage } from './pages/blog';
import { VoluntariosPage } from './pages/voluntarios';
import { PatrocinadoresPage } from './pages/patrocinadores';
import { GaleriaPage } from './pages/galeria';
import { ComoLlegarPage } from './pages/como-llegar';
import { DondeDormirPage } from './pages/donde-dormir-y-comer';
import { MapaAccesosPage } from './pages/mapa-de-accesos';
import { CategoriasPage } from './pages/categorias';
import { MarcasPage } from './pages/marcas';
import { FaqPage } from './pages/faq';
import { ReglamentoPage } from './pages/reglamento';
import { AltaAtletaPage } from './pages/alta-atleta';
import { StyleguidePage } from './pages/styleguide';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'preguntas-frecuentes', component: FaqPage },
  { path: 'patrocinadores', component: PatrocinadoresPage },
  { path: 'galeria', component: GaleriaPage },
  { path: 'voluntarios', component: VoluntariosPage },
  { path: 'como-llegar', component: ComoLlegarPage },
  { path: 'donde-dormir-y-comer', component: DondeDormirPage },
  { path: 'mapa-de-accesos', component: MapaAccesosPage },
  { path: 'categorias-de-peso', component: CategoriasPage },
  { path: 'marcas-minimas', component: MarcasPage },
  { path: 'reglamento', component: ReglamentoPage },
  { path: 'atletas', component: AtletasPage },
  { path: 'atletas/:slug', component: AtletaPage },
  { path: 'participantes', component: ParticipantesPage },
  { path: 'horarios', component: HorariosPage },
  { path: 'novedades/confirmar', component: NovedadesConfirmarPage },
  { path: 'entradas', component: EntradasPage },
  { path: 'entradas/confirmacion', component: ConfirmacionPage },
  { path: 'entradas/oferta', component: OfertaPage },
  { path: 'mi-entrada', component: MiEntradaPage },
  { path: 'baja', component: BajaPage },
  { path: 'sorteo', component: SorteoPage },
  { path: 'sorteo/confirmacion', component: SorteoConfirmacionPage },
  // Figma links «Rifa presencial» to /rifa; until U13 builds the item showcase it lives on /sorteo.
  { path: 'rifa', pathMatch: 'full', redirectTo: 'sorteo' },
  { path: 'en-directo', component: EnDirectoPage },
  { path: 'acceso', component: AccesoPage },
  { path: 'directo', pathMatch: 'full', redirectTo: 'en-directo' },
  // Juegos: porra y GRS Fantasy (Figma 71 y 72).
  { path: 'porra', component: PorraPage },
  { path: 'porra/mis-apuestas', component: MisApuestasPage },
  { path: 'porra/clasificacion', component: PorraClasificacionPage },
  { path: 'fantasy', component: MiEquipoPage },
  { path: 'fantasy/mercado', component: MercadoFantasyPage },
  { path: 'fantasy/clasificacion', component: FantasyClasificacionPage },
  { path: 'fantasy/como-se-juega', component: ComoSeJuegaPage },
  { path: 'resultados', component: ResultadosIndexPage },
  { path: 'resultados/:anio', component: ResultadosEdicionPage },
  { path: 'ediciones/:anio', component: EdicionPage },
  { path: 'pantalla/:slug', component: PantallaPublicaPage },
  { path: 'area-atleta', component: AreaAtletaPage },
  { path: 'alta-atleta', component: AltaAtletaPage },
  { path: 'inscripcion', component: InscripcionPage },
  { path: 'inscripcion/estado', component: InscripcionEstadoPage },
  { path: 'pago/simulado', component: PagoSimuladoPage },
  { path: 'publico', component: PublicoPage },
  { path: 'clubs', component: ClubsPage },
  { path: 'en', component: EnPage },
  { path: 'blog', component: BlogPage },
  { path: 'blog/:pslug', component: BlogPostPage },
  { path: 'privacidad', component: LegalPage, data: { tipo: 'privacidad', titulo: 'Política de privacidad' } },
  { path: 'terminos', component: LegalPage, data: { tipo: 'terminos', titulo: 'Términos y condiciones' } },
  { path: 'cookies', component: LegalPage, data: { tipo: 'cookies', titulo: 'Política de cookies' } },
  { path: 'consentimiento-datos', component: LegalPage, data: { tipo: 'consentimiento', titulo: 'Consentimiento de datos e imagen' } },
  { path: 'texto-whatsapp', component: LegalPage, data: { tipo: 'whatsapp', titulo: 'Texto de avisos por WhatsApp' } },
  { path: 'politica-concurso', component: LegalPage, data: { tipo: 'bases-sorteo', titulo: 'Bases del sorteo' } },
  // Internal token sheet for visual QA (Figma 01 · Fundamentos); noindex and not in the sitemap.
  { path: '_styleguide', component: StyleguidePage },
  // Internal component sheet for visual QA (Figma 02 · Componentes); noindex and not in the sitemap.
  { path: '_componentes', loadComponent: () => import('./pages/componentes').then((m) => m.ComponentesPage) },
  // CMS content pages (reglamento, categorias-de-peso, marcas-minimas…); unknown slugs answer 404.
  { path: ':pslug', component: ContentPage },
  { path: '**', component: NotFoundPage },
];

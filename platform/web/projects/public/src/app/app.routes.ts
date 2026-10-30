import { HorariosPage } from './pages/horarios';
import { BajaPage, NovedadesConfirmarPage } from './pages/novedades';
import { ConfirmacionPage, EntradasPage, MiEntradaPage, OfertaPage } from './pages/entradas';
import { SorteoConfirmacionPage, SorteoPage } from './pages/sorteo';
import { EdicionPage, EnDirectoPage, PantallaPublicaPage, ResultadosEdicionPage, ResultadosIndexPage } from './pages/directo';
import type { Routes } from '@angular/router';
import { HomePage, NotFoundPage } from './home/home';
import { ClubsPage, EnPage, PublicoPage } from './pages/landings';
import { AreaAtletaPage } from './pages/area';
import { InscripcionEstadoPage, InscripcionPage, PagoSimuladoPage } from './pages/inscripcion';
import { AtletaPage, AtletasPage, ParticipantesPage } from './pages/atletas';
import { BlogPage, ContentPage, LegalPage, PatrocinadoresPage, VoluntariosPage } from './pages/content';
import { GaleriaPage } from './pages/galeria';
import { ComoLlegarPage } from './pages/como-llegar';
import { CategoriasPage } from './pages/categorias';
import { MarcasPage } from './pages/marcas';
import { FaqPage } from './pages/faq';
import { ReglamentoPage } from './pages/reglamento';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'preguntas-frecuentes', component: FaqPage },
  { path: 'patrocinadores', component: PatrocinadoresPage },
  { path: 'galeria', component: GaleriaPage },
  { path: 'voluntarios', component: VoluntariosPage },
  { path: 'como-llegar', component: ComoLlegarPage },
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
  { path: 'en-directo', component: EnDirectoPage },
  { path: 'directo', pathMatch: 'full', redirectTo: 'en-directo' },
  { path: 'resultados', component: ResultadosIndexPage },
  { path: 'resultados/:anio', component: ResultadosEdicionPage },
  { path: 'ediciones/:anio', component: EdicionPage },
  { path: 'pantalla/:slug', component: PantallaPublicaPage },
  { path: 'area-atleta', component: AreaAtletaPage },
  { path: 'inscripcion', component: InscripcionPage },
  { path: 'inscripcion/estado', component: InscripcionEstadoPage },
  { path: 'pago/simulado', component: PagoSimuladoPage },
  { path: 'publico', component: PublicoPage },
  { path: 'clubs', component: ClubsPage },
  { path: 'en', component: EnPage },
  { path: 'blog', component: BlogPage },
  { path: 'blog/:pslug', component: ContentPage, data: { tipo: 'blog' } },
  { path: 'privacidad', component: LegalPage, data: { tipo: 'privacidad', titulo: 'Política de privacidad' } },
  { path: 'terminos', component: LegalPage, data: { tipo: 'terminos', titulo: 'Términos y condiciones' } },
  { path: 'cookies', component: LegalPage, data: { tipo: 'cookies', titulo: 'Política de cookies' } },
  { path: 'consentimiento-datos', component: LegalPage, data: { tipo: 'consentimiento', titulo: 'Consentimiento de datos e imagen' } },
  { path: 'politica-concurso', component: LegalPage, data: { tipo: 'bases-sorteo', titulo: 'Bases del sorteo' } },
  // CMS content pages (reglamento, categorias-de-peso, marcas-minimas…); unknown slugs answer 404.
  { path: ':pslug', component: ContentPage },
  { path: '**', component: NotFoundPage },
];

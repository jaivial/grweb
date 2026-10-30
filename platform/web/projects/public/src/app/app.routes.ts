import { HorariosPage } from './pages/horarios';
import type { Routes } from '@angular/router';
import { HomePage, NotFoundPage } from './home/home';
import { ClubsPage, EnPage, PublicoPage } from './pages/landings';
import { AreaAtletaPage } from './pages/area';
import { InscripcionEstadoPage, InscripcionPage, PagoSimuladoPage } from './pages/inscripcion';
import { AtletaPage, AtletasPage, ParticipantesPage } from './pages/atletas';
import { BlogPage, ComoLlegarPage, ContentPage, FaqPage, GaleriaPage, LegalPage, PatrocinadoresPage, VoluntariosPage } from './pages/content';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'preguntas-frecuentes', component: FaqPage },
  { path: 'patrocinadores', component: PatrocinadoresPage },
  { path: 'galeria', component: GaleriaPage },
  { path: 'voluntarios', component: VoluntariosPage },
  { path: 'como-llegar', component: ComoLlegarPage },
  { path: 'atletas', component: AtletasPage },
  { path: 'atletas/:slug', component: AtletaPage },
  { path: 'participantes', component: ParticipantesPage },
  { path: 'horarios', component: HorariosPage },
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

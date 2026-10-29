import type { Routes } from '@angular/router';
import { HomePage, NotFoundPage } from './home/home';
import { BlogPage, ComoLlegarPage, ContentPage, FaqPage, GaleriaPage, LegalPage, PatrocinadoresPage, VoluntariosPage } from './pages/content';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'preguntas-frecuentes', component: FaqPage },
  { path: 'patrocinadores', component: PatrocinadoresPage },
  { path: 'galeria', component: GaleriaPage },
  { path: 'voluntarios', component: VoluntariosPage },
  { path: 'como-llegar', component: ComoLlegarPage },
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

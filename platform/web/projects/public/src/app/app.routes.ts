import type { Routes } from '@angular/router';
import { areaGuard } from './core/area-guard';
import { HomePage, NotFoundPage } from './home/home';

/** Pages (Spanish paths); the same tree is mounted again under /en (one UI, texts from core/i18n dictionaries). */
const paginas: Routes = [
  { path: '', component: HomePage },
  { path: 'preguntas-frecuentes', loadComponent: () => import('./pages/faq').then((m) => m.FaqPage) },
  { path: 'patrocinadores', loadComponent: () => import('./pages/patrocinadores').then((m) => m.PatrocinadoresPage) },
  { path: 'galeria', loadComponent: () => import('./pages/galeria').then((m) => m.GaleriaPage) },
  { path: 'voluntarios', loadComponent: () => import('./pages/voluntarios').then((m) => m.VoluntariosPage) },
  { path: 'como-llegar', loadComponent: () => import('./pages/como-llegar').then((m) => m.ComoLlegarPage) },
  { path: 'donde-dormir-y-comer', loadComponent: () => import('./pages/donde-dormir-y-comer').then((m) => m.DondeDormirPage) },
  { path: 'mapa-de-accesos', loadComponent: () => import('./pages/mapa-de-accesos').then((m) => m.MapaAccesosPage) },
  { path: 'categorias-de-peso', loadComponent: () => import('./pages/categorias').then((m) => m.CategoriasPage) },
  { path: 'marcas-minimas', loadComponent: () => import('./pages/marcas').then((m) => m.MarcasPage) },
  { path: 'reglamento', loadComponent: () => import('./pages/reglamento').then((m) => m.ReglamentoPage) },
  { path: 'atletas', loadComponent: () => import('./pages/atletas').then((m) => m.AtletasPage) },
  { path: 'atletas/:slug', loadComponent: () => import('./pages/atletas').then((m) => m.AtletaPage) },
  { path: 'participantes', loadComponent: () => import('./pages/atletas').then((m) => m.ParticipantesPage) },
  { path: 'horarios', loadComponent: () => import('./pages/horarios').then((m) => m.HorariosPage) },
  { path: 'novedades/confirmar', loadComponent: () => import('./pages/novedades').then((m) => m.NovedadesConfirmarPage) },
  { path: 'entradas', loadComponent: () => import('./pages/entradas').then((m) => m.EntradasPage) },
  { path: 'entradas/confirmacion', loadComponent: () => import('./pages/entradas').then((m) => m.ConfirmacionPage) },
  { path: 'entradas/oferta', loadComponent: () => import('./pages/entradas').then((m) => m.OfertaPage) },
  { path: 'mi-entrada', loadComponent: () => import('./pages/entradas').then((m) => m.MiEntradaPage) },
  { path: 'baja', loadComponent: () => import('./pages/novedades').then((m) => m.BajaPage) },
  { path: 'sorteo', loadComponent: () => import('./pages/sorteo').then((m) => m.SorteoPage) },
  // D-RIFA: no online sale any more; old purchase links land on the showcase.
  { path: 'sorteo/confirmacion', pathMatch: 'full', redirectTo: 'sorteo' },
  { path: 'rifa', pathMatch: 'full', redirectTo: 'sorteo' },
  { path: 'en-directo', loadComponent: () => import('./pages/directo').then((m) => m.EnDirectoPage) },
  { path: 'acceso', loadComponent: () => import('./pages/acceso').then((m) => m.AccesoPage) },
  { path: 'directo', pathMatch: 'full', redirectTo: 'en-directo' },
  // Juegos: porra y GRS Fantasy (Figma 71 y 72). «Cómo se juega» se ve siempre; el resto pasa por la puerta de
  // «Activar juegos» (backoffice): apagado, enseña que los juegos aún no están abiertos.
  { path: 'fantasy/como-se-juega', loadComponent: () => import('./pages/fantasy/como-se-juega').then((m) => m.ComoSeJuegaPage) },
  {
    path: '',
    loadComponent: () => import('./pages/juegos-cerrados').then((m) => m.JuegosPuerta),
    children: [
      { path: 'porra', loadComponent: () => import('./pages/porra/porra').then((m) => m.PorraPage) },
      { path: 'porra/mis-apuestas', loadComponent: () => import('./pages/porra/mis-apuestas').then((m) => m.MisApuestasPage) },
      { path: 'porra/clasificacion', loadComponent: () => import('./pages/porra/clasificacion').then((m) => m.PorraClasificacionPage) },
      { path: 'fantasy', loadComponent: () => import('./pages/fantasy/mi-equipo').then((m) => m.MiEquipoPage) },
      { path: 'fantasy/mercado', loadComponent: () => import('./pages/fantasy/mercado').then((m) => m.MercadoFantasyPage) },
      { path: 'fantasy/clasificacion', loadComponent: () => import('./pages/fantasy/clasificacion').then((m) => m.FantasyClasificacionPage) },
      // Salas de GRS Fantasy (Figma 81): lobby, sala, unirse con el enlace del anfitrión y palmarés. Mi equipo, el
      // mercado y la clasificación van por sala (sin :id, la mía del día). Las pantallas nuevas se cargan bajo demanda
      // para no engordar el bundle inicial.
      { path: 'fantasy/salas', loadComponent: () => import('./pages/fantasy/salas').then((m) => m.SalasPage) },
      { path: 'fantasy/salas/:id', loadComponent: () => import('./pages/fantasy/sala').then((m) => m.SalaPage) },
      { path: 'fantasy/salas/:id/equipo', loadComponent: () => import('./pages/fantasy/mi-equipo').then((m) => m.MiEquipoPage) },
      { path: 'fantasy/salas/:id/mercado', loadComponent: () => import('./pages/fantasy/mercado').then((m) => m.MercadoFantasyPage) },
      { path: 'fantasy/salas/:id/clasificacion', loadComponent: () => import('./pages/fantasy/clasificacion').then((m) => m.FantasyClasificacionPage) },
      { path: 'fantasy/unirse/:codigo', loadComponent: () => import('./pages/fantasy/unirse').then((m) => m.UnirsePage) },
      { path: 'fantasy/palmares', loadComponent: () => import('./pages/fantasy/palmares').then((m) => m.PalmaresPage) },
    ],
  },
  { path: 'resultados', loadComponent: () => import('./pages/directo').then((m) => m.ResultadosIndexPage) },
  { path: 'resultados/:anio', loadComponent: () => import('./pages/directo').then((m) => m.ResultadosEdicionPage) },
  { path: 'ediciones/:anio', loadComponent: () => import('./pages/directo').then((m) => m.EdicionPage) },
  { path: 'pantalla/:slug', loadComponent: () => import('./pages/directo').then((m) => m.PantallaPublicaPage) },
  // Área de atleta: el panel y sus subpáginas (`?vista=perfil|horarios|acreditacion|pesaje`); la guarda manda al
  // acceso a quien no tiene sesión y le devuelve a la subpágina después de entrar.
  { path: 'area-atleta', canActivate: [areaGuard], loadComponent: () => import('./pages/area').then((m) => m.AreaAtletaPage) },
  // «Comparte tu cuenta atrás» (Figma 83): story 1080×1920 para atletas con sesión de área.
  { path: 'area-atleta/compartir', loadComponent: () => import('./pages/area-compartir').then((m) => m.AreaCompartirPage) },
  { path: 'alta-atleta', loadComponent: () => import('./pages/alta-atleta').then((m) => m.AltaAtletaPage) },
  { path: 'inscripcion', loadComponent: () => import('./pages/inscripcion').then((m) => m.InscripcionPage) },
  { path: 'inscripcion/estado', loadComponent: () => import('./pages/inscripcion').then((m) => m.InscripcionEstadoPage) },
  { path: 'pago/simulado', loadComponent: () => import('./pages/inscripcion').then((m) => m.PagoSimuladoPage) },
  { path: 'publico', loadComponent: () => import('./pages/landings').then((m) => m.PublicoPage) },
  { path: 'clubs', redirectTo: '/', pathMatch: 'full' }, // página retirada (Jaime 14-nov): solo queda el campo «club» del atleta
  { path: 'blog', loadComponent: () => import('./pages/blog').then((m) => m.BlogPage) },
  { path: 'blog/:pslug', loadComponent: () => import('./pages/blog').then((m) => m.BlogPostPage) },
  { path: 'privacidad', loadComponent: () => import('./pages/content').then((m) => m.LegalPage), data: { tipo: 'privacidad', titulo: 'Política de privacidad' } },
  { path: 'terminos', loadComponent: () => import('./pages/content').then((m) => m.LegalPage), data: { tipo: 'terminos', titulo: 'Términos y condiciones' } },
  { path: 'cookies', loadComponent: () => import('./pages/content').then((m) => m.LegalPage), data: { tipo: 'cookies', titulo: 'Política de cookies' } },
  { path: 'consentimiento-datos', loadComponent: () => import('./pages/content').then((m) => m.LegalPage), data: { tipo: 'consentimiento', titulo: 'Consentimiento de datos e imagen' } },
  { path: 'texto-whatsapp', loadComponent: () => import('./pages/content').then((m) => m.LegalPage), data: { tipo: 'whatsapp', titulo: 'Texto de avisos por WhatsApp' } },
  { path: 'politica-concurso', loadComponent: () => import('./pages/content').then((m) => m.LegalPage), data: { tipo: 'bases-sorteo', titulo: 'Bases del sorteo' } },
  // Internal token sheet for visual QA (Figma 01 · Fundamentos); noindex and not in the sitemap.
  { path: '_styleguide', loadComponent: () => import('./pages/styleguide').then((m) => m.StyleguidePage) },
  // Internal component sheet for visual QA (Figma 02 · Componentes); noindex and not in the sitemap.
  { path: '_componentes', loadComponent: () => import('./pages/componentes').then((m) => m.ComponentesPage) },
  // Internal overlay / global state sheet for visual QA (Figma 17); noindex and not in the sitemap.
  { path: '_overlays', loadComponent: () => import('./pages/overlays').then((m) => m.OverlaysPage) },
];
// CMS content pages (reglamento, categorias-de-peso, marcas-minimas…); unknown slugs answer 404.
const cola: Routes = [
  { path: ':pslug', loadComponent: () => import('./pages/content').then((m) => m.ContentPage) },
  { path: '**', component: NotFoundPage },
];

export const routes: Routes = [{ path: 'en', children: [...paginas, ...cola] }, ...paginas, ...cola];

import { inject } from '@angular/core';
import { type ActivatedRouteSnapshot, type CanActivateChildFn, type CanActivateFn, Router, type Routes } from '@angular/router';
import { Auth } from './core/auth';
import { Competitions } from './core/competitions';
import { ALL_ITEMS } from './layout/nav';
import { Shell } from './layout/shell';
import { DevicePage, InvitationPage } from './pages/access';
import { InicioPage } from './pages/inicio';
import { LoginPage, SessionExpiredPage } from './pages/login';
import { ComingSoonPage, ErrorPage } from './pages/misc';
import { WebCollectionsTab, WebHomeTab, WebLegalTab, WebPage } from './pages/web';
import { AtletaFichaPage } from './pages/atletas/ficha';
import { AtletasImportarPage } from './pages/atletas/importar';
import { AtletasPage } from './pages/atletas/list';
import { PesajePage } from './pages/atletas/pesaje';
import { InscripcionPage } from './pages/atletas/inscripcion';

// Guards inject everything before the first await: inject() only works synchronously in the injection context
// (after an await it throws NG0203 and the redirect to /login never happens).

/** Requires a session (restored from the refresh cookie on first navigation). */
const authGuard: CanActivateFn = async (_r, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.bootstrap();
  return auth.isLoggedIn() ? true : router.createUrlTree(['/login'], { queryParams: { siguiente: state.url } });
};

const guestGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.bootstrap();
  return auth.isLoggedIn() ? router.createUrlTree(['/']) : true;
};

/** `/` → login, or the first competition of the user (guards of one route run in parallel: one guard, in order). */
const homeRedirect: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(Auth);
  const comps = inject(Competitions);
  await auth.bootstrap();
  if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);
  const list = await comps.load();
  return list.length ? router.createUrlTree(['/', list[0].slug, 'inicio']) : router.createUrlTree(['/404']);
};

/** Resolves /:comp against the user's competitions and checks the section permission. */
const compGuard: CanActivateChildFn = async (child) => {
  const router = inject(Router);
  const auth = inject(Auth);
  const comps = inject(Competitions);
  const list = await comps.load();
  // Nested routes (e.g. /grcup/web/faq): walk up to the :comp route; the section is its direct child.
  let r: ActivatedRouteSnapshot | null = child;
  while (r?.parent && !r.parent.paramMap.has('comp')) r = r.parent;
  const slug = r?.parent?.paramMap.get('comp');
  const c = list.find((x) => x.slug === slug);
  if (!c) return router.createUrlTree(['/404']);
  comps.slug.set(c.slug);
  const path = r?.routeConfig?.path ?? '';
  const seccion = path === ':seccion' ? (r?.paramMap.get('seccion') ?? '') : path;
  const item = ALL_ITEMS.find((i) => i.path === seccion);
  if (item?.perm && !auth.can(c.id, item.perm)) return router.createUrlTree(['/403']);
  return true;
};

export const routes: Routes = [
  { path: 'login', component: LoginPage, canActivate: [guestGuard], title: 'Entrar · Backoffice GR Cup' },
  { path: 'sesion-caducada', component: SessionExpiredPage, title: 'Sesión caducada · Backoffice GR Cup' },
  { path: 'invitacion/:token', component: InvitationPage, title: 'Invitación · Backoffice GR Cup' },
  { path: 'dispositivo', component: DevicePage, canActivate: [authGuard], title: 'Autorizar dispositivo · Backoffice GR Cup' },
  { path: '403', component: ErrorPage, data: { code: 403 }, title: 'Sin permiso' },
  { path: '404', component: ErrorPage, data: { code: 404 }, title: 'No encontrado' },
  { path: '500', component: ErrorPage, data: { code: 500 }, title: 'Error' },
  { path: '', pathMatch: 'full', canActivate: [homeRedirect], children: [] },
  {
    path: ':comp',
    component: Shell,
    canActivate: [authGuard],
    canActivateChild: [compGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      { path: 'inicio', component: InicioPage, title: 'Inicio · Backoffice GR Cup' },
      {
        path: 'web',
        component: WebPage,
        title: 'Web y contenidos · Backoffice GR Cup',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'home' },
          { path: 'home', component: WebHomeTab },
          { path: 'legal', component: WebLegalTab },
          { path: ':coleccion', component: WebCollectionsTab },
        ],
      },
      { path: 'atletas', component: AtletasPage, title: 'Atletas · Backoffice GR Cup' },
      { path: 'atletas/importar', component: AtletasImportarPage, title: 'Importar acta AEP · Backoffice GR Cup' },
      { path: 'atletas/pesaje', component: PesajePage, title: 'Pesaje · Backoffice GR Cup' },
      { path: 'atletas/inscripcion', component: InscripcionPage, title: 'Inscripción · Backoffice GR Cup' },
      { path: 'atletas/:id', component: AtletaFichaPage, title: 'Atleta · Backoffice GR Cup' },
      { path: 'horarios', loadComponent: () => import('./pages/horarios/horarios').then((m) => m.HorariosPage), title: 'Horarios y flights · Backoffice GR Cup' },
      { path: 'contactos', loadComponent: () => import('./pages/contactos/contactos').then((m) => m.ContactosPage), data: { tab: 'contactos' }, title: 'Contactos · Backoffice GR Cup' },
      { path: 'contactos/segmentos', loadComponent: () => import('./pages/contactos/contactos').then((m) => m.ContactosPage), data: { tab: 'segmentos' }, title: 'Segmentos · Backoffice GR Cup' },
      { path: 'contactos/bajas', loadComponent: () => import('./pages/contactos/contactos').then((m) => m.ContactosPage), data: { tab: 'bajas' }, title: 'Bajas y supresiones · Backoffice GR Cup' },
      { path: 'contactos/:id', loadComponent: () => import('./pages/contactos/contactos').then((m) => m.ContactoFichaPage), title: 'Contacto · Backoffice GR Cup' },
      { path: 'emails', loadComponent: () => import('./pages/emails/emails').then((m) => m.EmailsPage), data: { tab: 'plantillas' }, title: 'Emails y avisos · Backoffice GR Cup' },
      { path: 'emails/salida', loadComponent: () => import('./pages/emails/emails').then((m) => m.EmailsPage), data: { tab: 'salida' }, title: 'Bandeja de salida · Backoffice GR Cup' },
      { path: 'emails/automatizaciones', loadComponent: () => import('./pages/emails/emails').then((m) => m.EmailsPage), data: { tab: 'automatizaciones' }, title: 'Automatizaciones · Backoffice GR Cup' },
      { path: 'emails/plantillas/:clave', loadComponent: () => import('./pages/emails/emails').then((m) => m.PlantillaEditorPage), title: 'Plantilla · Backoffice GR Cup' },
      { path: 'entradas', loadComponent: () => import('./pages/entradas/entradas').then((m) => m.EntradasPage), data: { tab: 'sesiones' }, title: 'Entradas y aforo · Backoffice GR Cup' },
      { path: 'entradas/reservas', loadComponent: () => import('./pages/entradas/entradas').then((m) => m.EntradasPage), data: { tab: 'reservas' }, title: 'Reservas · Backoffice GR Cup' },
      { path: 'entradas/espera', loadComponent: () => import('./pages/entradas/entradas').then((m) => m.EntradasPage), data: { tab: 'espera' }, title: 'Lista de espera · Backoffice GR Cup' },
      { path: 'checkin', loadComponent: () => import('./pages/checkin/checkin').then((m) => m.TaquillaPage), title: 'Check-in y taquilla · Backoffice GR Cup' },
      { path: 'checkin/escaner', loadComponent: () => import('./pages/checkin/checkin').then((m) => m.EscanerPage), title: 'Escáner · Backoffice GR Cup' },
      { path: 'directo', loadComponent: () => import('./pages/directo/directo').then((m) => m.DirectoPage), title: 'Directo · Backoffice GR Cup' },
      { path: 'directo/pantalla', loadComponent: () => import('./pages/directo/pantalla').then((m) => m.PantallaPage), title: 'Pantalla del pabellón · Backoffice GR Cup' },
      { path: 'resultados', loadComponent: () => import('./pages/directo/resultados').then((m) => m.ResultadosPage), title: 'Resultados · Backoffice GR Cup' },
      { path: 'campanas', loadComponent: () => import('./pages/campanas/campanas').then((m) => m.CampanasPage), title: 'Campañas · Backoffice GR Cup' },
      { path: 'campanas/whatsapp', loadComponent: () => import('./pages/campanas/campanas').then((m) => m.WhatsAppPage), title: 'WhatsApp · Backoffice GR Cup' },
      { path: 'campanas/:id', loadComponent: () => import('./pages/campanas/editor').then((m) => m.CampanaEditorPage), title: 'Campaña · Backoffice GR Cup' },
      { path: 'sorteo', loadComponent: () => import('./pages/sorteo/sorteo').then((m) => m.SorteoPage), title: 'Sorteo · Backoffice GR Cup' },
      { path: ':seccion', component: ComingSoonPage, title: 'Backoffice GR Cup' },
    ],
  },
  { path: '**', component: ErrorPage, data: { code: 404 }, title: 'No encontrado' },
];

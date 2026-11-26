import { inject } from '@angular/core';
import { type ActivatedRouteSnapshot, type CanActivateChildFn, type CanActivateFn, Router, type Routes } from '@angular/router';
import { Auth } from './core/auth';
import { Competitions } from './core/competitions';
import { GrToasts } from '@grcup/ui';
import { ALL_ITEMS, moduloActivo } from './layout/nav';
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

/** Admin-only (root) pages, e.g. the /_componentes visual QA catalogue. */
const rootGuard: CanActivateFn = async (_r, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  await auth.bootstrap();
  if (!auth.isLoggedIn()) return router.createUrlTree(['/login'], { queryParams: { siguiente: state.url } });
  return auth.user()?.root ? true : router.createUrlTree(['/403']);
};

/** `/` → login, or the first competition of the user (guards of one route run in parallel: one guard, in order). */
const homeRedirect: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(Auth);
  const comps = inject(Competitions);
  await auth.bootstrap();
  if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);
  const list = await comps.load();
  // No membership: Figma 51 «Error · 403» (never /404, whose «Ir al Inicio» would loop back here).
  return list.length ? router.createUrlTree(['/', list[0].slug, 'inicio']) : router.createUrlTree(['/403'], { queryParams: { motivo: 'sin-competicion' } });
};

/** `/oauth/google?gmail=…[&c=slug]`: landing of the Google OAuth callback when it cannot name the competition (expired
 * or tampered link). Sends to Integraciones of that competition, or of the first one, keeping the result for the notice. */
const oauthGoogle: CanActivateFn = async (route) => {
  const router = inject(Router);
  const auth = inject(Auth);
  const comps = inject(Competitions);
  await auth.bootstrap();
  if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);
  const list = await comps.load();
  const c = list.find((x) => x.slug === route.queryParamMap.get('c')) ?? list[0];
  if (!c) return router.createUrlTree(['/403'], { queryParams: { motivo: 'sin-competicion' } });
  return router.createUrlTree(['/', c.slug, 'sistema', 'integraciones'], { queryParams: { gmail: route.queryParamMap.get('gmail') || 'caducado' } });
};

/** Old list URL → the tab that now holds it, keeping the competition (string redirects drop the query). */
const aPestana = (seccion: string, queryParams: Record<string, string>): CanActivateFn => (route) =>
  inject(Router).createUrlTree(['/', route.parent?.paramMap.get('comp') ?? '', seccion], { queryParams });

/** Resolves /:comp against the user's competitions and checks the section permission. */
const compGuard: CanActivateChildFn = async (child) => {
  const router = inject(Router);
  const auth = inject(Auth);
  const comps = inject(Competitions);
  const toasts = inject(GrToasts); // injected before the first await (no injection context after it)
  const list = await comps.load();
  // Nested routes (e.g. /grcup/web/faq): walk up to the :comp route; the section is its direct child.
  let r: ActivatedRouteSnapshot | null = child;
  while (r?.parent && !r.parent.paramMap.has('comp')) r = r.parent;
  const slug = r?.parent?.paramMap.get('comp');
  const c = list.find((x) => x.slug === slug);
  if (!c) {
    if (auth.user()?.root) return router.createUrlTree(['/404']);
    return router.createUrlTree(['/403'], list.length ? {} : { queryParams: { motivo: 'sin-competicion' } });
  }
  comps.slug.set(c.slug);
  const path = r?.routeConfig?.path ?? '';
  const seccion = path === ':seccion' ? (r?.paramMap.get('seccion') ?? '') : path;
  const item = ALL_ITEMS.find((i) => i.path === seccion);
  if (path === ':seccion' && !item) return router.createUrlTree(['/404']);
  // a BO module switched off for this edition (Evento y módulos › Módulos): back to Inicio, saying why
  if (!moduloActivo(c.modulos, item?.modulo)) {
    toasts.info(`${item?.label} está desactivado en esta edición`, 'Se reactiva en Evento y módulos › Módulos.');
    return router.createUrlTree(['/', c.slug, 'inicio']);
  }
  // a role that requires 2FA grants nothing until it is on: send to Inicio, where the shell explains it and offers to turn it on
  if (item?.perm && auth.user()?.competiciones.find((m) => m.competitionId === c.id)?.exige2fa) return router.createUrlTree(['/', c.slug, 'inicio']);
  if (item?.perm && !item.lectura && !auth.can(c.id, item.perm)) return router.createUrlTree(['/403'], { queryParams: { seccion: item.path } });
  return true;
};

/** On phones the check-in goes straight to the scanner: the taquilla (KPIs, accesos) is never loaded first. */
const checkinMovil: CanActivateFn = (route) =>
  typeof window !== 'undefined' && window.innerWidth < 768 ? inject(Router).createUrlTree(['/', route.parent?.paramMap.get('comp') ?? '', 'checkin', 'escaner']) : true;

export const routes: Routes = [
  { path: 'login', component: LoginPage, canActivate: [guestGuard], title: 'Entrar · Backoffice GR Cup' },
  { path: 'sesion-caducada', component: SessionExpiredPage, title: 'Sesión caducada · Backoffice GR Cup' },
  { path: 'invitacion/:token', component: InvitationPage, title: 'Invitación · Backoffice GR Cup' },
  { path: 'dispositivo', component: DevicePage, canActivate: [authGuard], title: 'Autorizar dispositivo · Backoffice GR Cup' },
  { path: '403', component: ErrorPage, data: { code: 403 }, title: 'Sin permiso' },
  { path: '404', component: ErrorPage, data: { code: 404 }, title: 'No encontrado' },
  { path: '500', component: ErrorPage, data: { code: 500 }, title: 'Error' },
  { path: '_componentes', canActivate: [rootGuard], loadComponent: () => import('./pages/componentes').then((m) => m.ComponentesPage), title: 'Componentes base · Backoffice GR Cup' },
  { path: 'oauth/google', canActivate: [oauthGoogle], children: [] },
  { path: '', pathMatch: 'full', canActivate: [homeRedirect], children: [] },
  {
    path: ':comp',
    component: Shell,
    canActivate: [authGuard],
    canActivateChild: [compGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      { path: 'inicio', component: InicioPage, title: 'Inicio · Backoffice GR Cup' },
      // the volunteers moved from Web › Voluntarios to their own page (Figma 68)
      { path: 'web/voluntarios', pathMatch: 'full', redirectTo: 'voluntarios' },
      { path: 'evento/web/voluntarios', pathMatch: 'full', redirectTo: 'voluntarios' },
      // «Web y contenidos» is a tab of Evento y módulos (orden 15-nov 13:05): the old /web/… links keep working
      { path: 'web', pathMatch: 'full', redirectTo: 'evento/web' },
      { path: 'web/:tab', redirectTo: 'evento/web/:tab' },
      {
        path: 'evento/web',
        component: WebPage,
        title: 'Web y contenidos · Evento · Backoffice GR Cup',
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
      { path: 'atletas/solicitudes', loadComponent: () => import('./pages/atletas/solicitudes').then((m) => m.SolicitudesPage), title: 'Solicitudes de atleta · Backoffice GR Cup' },
      { path: 'atletas/solicitudes/:id', loadComponent: () => import('./pages/atletas/solicitudes').then((m) => m.SolicitudesPage), title: 'Solicitud de atleta · Backoffice GR Cup' },
      { path: 'atletas/:id', component: AtletaFichaPage, title: 'Atleta · Backoffice GR Cup' },
      { path: 'horarios', loadComponent: () => import('./pages/horarios/horarios').then((m) => m.HorariosPage), title: 'Horarios · Backoffice GR Cup' },
      // Contactos and Campañas are tabs of Emails y avisos (orden 15-nov 13:05): the lists redirect, cards and editors stay
      { path: 'contactos', pathMatch: 'full', canActivate: [aPestana('emails', { tab: 'contactos' })], children: [] },
      { path: 'contactos/segmentos', pathMatch: 'full', canActivate: [aPestana('emails', { tab: 'contactos', vista: 'segmentos' })], children: [] },
      { path: 'contactos/bajas', pathMatch: 'full', canActivate: [aPestana('emails', { tab: 'contactos', vista: 'bajas' })], children: [] },
      { path: 'contactos/:id', loadComponent: () => import('./pages/contactos/contactos').then((m) => m.ContactoFichaPage), title: 'Contacto · Backoffice GR Cup' },
      { path: 'emails', loadComponent: () => import('./pages/emails/emails').then((m) => m.EmailsPage), data: { tab: 'plantillas' }, title: 'Emails y avisos · Backoffice GR Cup' },
      // The WhatsApp template designer was merged into the campaign editor (email + WhatsApp in one place).
      { path: 'emails/whatsapp', pathMatch: 'full', canActivate: [aPestana('emails', { tab: 'campanas' })], children: [] },
      { path: 'emails/salida', loadComponent: () => import('./pages/emails/emails').then((m) => m.EmailsPage), data: { tab: 'salida' }, title: 'Bandeja de salida · Backoffice GR Cup' },
      { path: 'emails/automatizaciones', loadComponent: () => import('./pages/emails/emails').then((m) => m.EmailsPage), data: { tab: 'automatizaciones' }, title: 'Automatizaciones · Backoffice GR Cup' },
      { path: 'emails/plantillas/:clave', loadComponent: () => import('./pages/emails/editor').then((m) => m.PlantillaEditorPage), title: 'Plantilla · Backoffice GR Cup' },
      { path: 'entradas', loadComponent: () => import('./pages/entradas/entradas').then((m) => m.EntradasPage), data: { tab: 'sesiones' }, title: 'Entradas y aforo · Backoffice GR Cup' },
      { path: 'entradas/reservas', loadComponent: () => import('./pages/entradas/entradas').then((m) => m.EntradasPage), data: { tab: 'reservas' }, title: 'Reservas · Backoffice GR Cup' },
      { path: 'entradas/espera', loadComponent: () => import('./pages/entradas/entradas').then((m) => m.EntradasPage), data: { tab: 'espera' }, title: 'Lista de espera · Backoffice GR Cup' },
      { path: 'entradas/ajustes', loadComponent: () => import('./pages/entradas/entradas').then((m) => m.EntradasPage), data: { tab: 'ajustes' }, title: 'Ajustes de entradas · Backoffice GR Cup' },
      { path: 'checkin', canActivate: [checkinMovil], loadComponent: () => import('./pages/checkin/checkin').then((m) => m.TaquillaPage), title: 'Check-in y taquilla · Backoffice GR Cup' },
      { path: 'checkin/escaner', loadComponent: () => import('./pages/checkin/checkin').then((m) => m.EscanerPage), title: 'Escáner · Backoffice GR Cup' },
      { path: 'directo', loadComponent: () => import('./pages/directo/directo').then((m) => m.DirectoPage), title: 'Directo · Backoffice GR Cup' },
      { path: 'directo/pantalla', loadComponent: () => import('./pages/directo/pantalla').then((m) => m.PantallaPage), title: 'Pantalla del pabellón · Backoffice GR Cup' },
      { path: 'voluntarios', loadComponent: () => import('./pages/voluntarios').then((m) => m.VoluntariosPage), title: 'Voluntarios · Backoffice GR Cup' },
      { path: 'refugio', loadComponent: () => import('./pages/refugio').then((m) => m.RefugioPage), title: 'Colaboradores Refugio · Backoffice GR Cup' },
      { path: 'refugio/donde-dormir-y-comer', loadComponent: () => import('./pages/refugio').then((m) => m.RefugioListaPage), data: { lista: 'hoteles' }, title: 'Dónde dormir y comer · Colaboradores Refugio · Backoffice GR Cup' },
      { path: 'refugio/gimnasios', loadComponent: () => import('./pages/refugio').then((m) => m.RefugioListaPage), data: { lista: 'gimnasios' }, title: 'Gimnasios de powerlifting · Colaboradores Refugio · Backoffice GR Cup' },
      { path: 'clubs', loadComponent: () => import('./pages/clubs').then((m) => m.ClubsPage), title: 'Clubs · Backoffice GR Cup' },
      { path: 'directo/retransmision', loadComponent: () => import('./pages/directo/retransmision').then((m) => m.RetransmisionPage), title: 'Retransmisión · Backoffice GR Cup' },
      { path: 'resultados', loadComponent: () => import('./pages/directo/resultados').then((m) => m.ResultadosPage), title: 'Resultados · Backoffice GR Cup' },
      { path: 'campanas', pathMatch: 'full', canActivate: [aPestana('emails', { tab: 'campanas' })], children: [] },
      { path: 'campanas/whatsapp', loadComponent: () => import('./pages/campanas/campanas').then((m) => m.WhatsAppPage), title: 'WhatsApp · Backoffice GR Cup' },
      { path: 'campanas/:id', loadComponent: () => import('./pages/campanas/editor').then((m) => m.CampanaEditorPage), title: 'Campaña · Backoffice GR Cup' },
      { path: 'sorteo', loadComponent: () => import('./pages/sorteo/sorteo').then((m) => m.SorteoPage), title: 'Sorteo · Backoffice GR Cup' },
      { path: 'chat', loadComponent: () => import('./pages/social/chat/chat').then((m) => m.ChatPage), title: 'Chat · Moderación · Backoffice GR Cup' },
      { path: 'patrocinio/informe', loadComponent: () => import('./pages/social/patrocinio/informe').then((m) => m.PatrocinioInformePage), data: { vista: 'informe' }, title: 'Patrocinio · Informe del día · Backoffice GR Cup' },
      { path: 'patrocinio/configuracion', loadComponent: () => import('./pages/social/patrocinio/informe').then((m) => m.PatrocinioInformePage), data: { vista: 'config' }, title: 'Patrocinio · Configuración · Backoffice GR Cup' },
      { path: 'patrocinio', pathMatch: 'full', redirectTo: 'patrocinio/banners' },
      { path: 'patrocinio/banners', loadComponent: () => import('./pages/social/patrocinio/patrocinio').then((m) => m.PatrocinioPage), title: 'Patrocinio · Banners · Backoffice GR Cup' },
      { path: 'juegos/config', loadComponent: () => import('./pages/social/juegos/config').then((m) => m.JuegosConfigPage), title: 'Juegos · Configuración · Backoffice GR Cup' },
      { path: 'juegos', loadComponent: () => import('./pages/social/juegos/juegos').then((m) => m.JuegosPage), title: 'Juegos · Backoffice GR Cup' },
      { path: 'donaciones', loadComponent: () => import('./pages/social/donaciones/donaciones').then((m) => m.DonacionesPage), title: 'Donaciones · Backoffice GR Cup' },
      // Premios is a tab of Sorteo (orden 15-nov 13:05, #380)
      { path: 'premios', pathMatch: 'full', canActivate: [aPestana('sorteo', { tab: 'premios' })], children: [] },
      { path: 'fans', loadComponent: () => import('./pages/social/fans/fans').then((m) => m.FansPage), title: 'Fans · Backoffice GR Cup' },
      { path: 'evento', loadComponent: () => import('./pages/evento').then((m) => m.EventoPage), title: 'Evento y módulos · Backoffice GR Cup' },
      {
        path: 'equipo',
        children: [
          { path: '', loadComponent: () => import('./pages/equipo/equipo').then((m) => m.EquipoPage), title: 'Equipo y permisos · Backoffice GR Cup' },
          { path: ':uid', loadComponent: () => import('./pages/equipo/ficha').then((m) => m.EquipoFichaPage), title: 'Ficha de miembro · Backoffice GR Cup' },
        ],
      },
      { path: 'auditoria', loadComponent: () => import('./pages/equipo/auditoria').then((m) => m.AuditoriaPage), title: 'Auditoría · Backoffice GR Cup' },
      { path: 'sistema', pathMatch: 'full', redirectTo: 'sistema/competiciones' },
      { path: 'sistema/competiciones', loadComponent: () => import('./pages/sistema').then((m) => m.SistemaPage), data: { vista: 'competiciones' }, title: 'Sistema e integraciones · Backoffice GR Cup' },
      { path: 'sistema/integraciones', loadComponent: () => import('./pages/sistema').then((m) => m.SistemaPage), data: { vista: 'integraciones' }, title: 'Integraciones · Sistema e integraciones · Backoffice GR Cup' },
      { path: 'sistema/salud', loadComponent: () => import('./pages/sistema').then((m) => m.SistemaPage), data: { vista: 'salud' }, title: 'Salud · Sistema e integraciones · Backoffice GR Cup' },
      { path: 'sistema/zona-peligrosa', loadComponent: () => import('./pages/sistema').then((m) => m.SistemaPage), data: { vista: 'peligro' }, title: 'Zona peligrosa · Sistema e integraciones · Backoffice GR Cup' },
      { path: 'sistema/email', loadComponent: () => import('./pages/sistema/email').then((m) => m.SistemaEmailPage), title: 'Email · Sistema e integraciones · Backoffice GR Cup' },
      { path: 'sistema/nueva', loadComponent: () => import('./pages/sistema/nueva').then((m) => m.SistemaNuevaPage), title: 'Nueva competición · Sistema e integraciones · Backoffice GR Cup' },
      { path: 'sistema/whatsapp', loadComponent: () => import('./pages/sistema/whatsapp').then((m) => m.WhatsAppSistemaPage), title: 'WhatsApp · Backoffice GR Cup' },
      { path: ':seccion', component: ComingSoonPage, title: 'Backoffice GR Cup' },
    ],
  },
  { path: '**', component: ErrorPage, data: { code: 404 }, title: 'No encontrado' },
];

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

/** Requires a session (restored from the refresh cookie on first navigation). */
const authGuard: CanActivateFn = async (_r, state) => {
  const auth = inject(Auth);
  await auth.bootstrap();
  return auth.isLoggedIn() ? true : inject(Router).createUrlTree(['/login'], { queryParams: { siguiente: state.url } });
};

const guestGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  await auth.bootstrap();
  return auth.isLoggedIn() ? inject(Router).createUrlTree(['/']) : true;
};

/** `/` → login, or the first competition of the user (guards of one route run in parallel: one guard, in order). */
const homeRedirect: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(Auth);
  await auth.bootstrap();
  if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);
  const list = await inject(Competitions).load();
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
      { path: ':seccion', component: ComingSoonPage, title: 'Backoffice GR Cup' },
    ],
  },
  { path: '**', component: ErrorPage, data: { code: 404 }, title: 'No encontrado' },
];

import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { AreaSesion, esVista } from './area';
import { I18n } from './i18n';

/**
 * Guard of the athlete area subpages (`/area-atleta?vista=…`): without an area session the athlete lands on the area
 * login with the requested subpage as return target, and the page sends them there after signing in.
 *
 * It only guards subpages: the area itself has to be reachable to sign in. On the server it always passes (the session
 * cookie is HttpOnly and only the browser has it), so SSR keeps rendering the shell and the browser decides.
 */
export const areaGuard: CanActivateFn = async (route) => {
  const vista = route.queryParamMap.get('vista');
  // Sin subpágina, o con el enlace de un solo uso del email, la guarda no se mete: el área tiene que abrirse para entrar.
  if (!esVista(vista) || route.queryParamMap.has('acceso')) return true;
  const browser = isPlatformBrowser(inject(PLATFORM_ID));
  const sesion = inject(AreaSesion);
  const router = inject(Router);
  const i18n = inject(I18n);
  if (!browser) return true;
  if (await sesion.haySesion()) return true;
  const login = router.parseUrl(i18n.path('/area-atleta'));
  login.queryParams = { volver: vista };
  return login;
};

import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { AreaSesion, esVista } from './area';

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
  if (!browser) return true;
  if (await sesion.haySesion()) return true;
  // El idioma sale del árbol de rutas (/en/area-atleta), no del estado de i18n: la guarda puede ser su primer lector.
  const en = route.pathFromRoot.some((s) => s.url.length === 1 && s.url[0].path === 'en');
  const login = router.parseUrl(en ? '/en/area-atleta' : '/area-atleta');
  login.queryParams = { volver: vista };
  return login;
};

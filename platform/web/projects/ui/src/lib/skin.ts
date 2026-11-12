import { InjectionToken } from '@angular/core';

/**
 * Visual skin of the shared controls. The backoffice provides `'bo'` (Figma page 48 «BO · Componentes · base»):
 * GrButton, GrIconButton, GrBadge and GrInput then render the BO variants; the public web keeps `'web'`.
 */
export type GrSkin = 'web' | 'bo';
export const GR_SKIN = new InjectionToken<GrSkin>('GR_SKIN', { providedIn: 'root', factory: () => 'web' });

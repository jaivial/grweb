import { InjectionToken, type Signal, computed, inject, signal } from '@angular/core';

/** Site language for the lib texts. The public app provides it from its I18n service; default Spanish. */
export type GrLang = 'es' | 'en';
export const GR_LANG = new InjectionToken<Signal<GrLang>>('GR_LANG', { factory: () => signal<GrLang>('es') });

/** Reactive dictionary of the current GR_LANG (call in an injection context). */
export function grDict<T>(d: { es: T; en: NoInfer<T> }): Signal<T> {
  const lang = inject(GR_LANG);
  return computed(() => d[lang()]);
}

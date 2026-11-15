import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Competitions } from '../core/competitions';
import { BoTabsMovil } from '../shared/ui';

/** Tabs of «Evento y módulos». «Web y contenidos» is one of them (orden 15-nov 13:05) and lives at /evento/web/… */
export const EVENTO_TABS = [
  { v: 'datos', l: 'Datos' }, { v: 'estado', l: 'Estado del evento' }, { v: 'modulos', l: 'Módulos' },
  { v: 'web', l: 'Web y contenidos' }, { v: 'llegar', l: 'Cómo llegar' },
] as const;

/** The Evento tab bar as router links, for the pages under /evento/… (Web y contenidos). Phones: selector. */
@Component({
  selector: 'bo-evento-tabs',
  imports: [RouterLink, BoTabsMovil],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <bo-tabs-movil label="Sección">
      <nav class="flex gap-1 border-b border-line-subtle" aria-label="Evento">
        @for (t of tabs; track t.v) {
          <a class="relative flex h-11 shrink-0 items-center px-3 text-label-s" [class]="activa() === t.v ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'"
            [attr.aria-current]="activa() === t.v ? 'page' : null"
            [routerLink]="t.v === 'web' ? ['/', comps.current()?.slug, 'evento', 'web'] : ['/', comps.current()?.slug, 'evento']" [queryParams]="t.v === 'web' ? null : { tab: t.v }">
            {{ t.l }}@if (activa() === t.v) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }</a>
        }
      </nav>
    </bo-tabs-movil>
  `,
})
export class BoEventoTabs {
  protected readonly comps = inject(Competitions);
  protected readonly tabs = EVENTO_TABS;
  readonly activa = input.required<string>();
}

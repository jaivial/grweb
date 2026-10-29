import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GrButton, GrEmpty, GrIcon } from '@grcup/ui';
import { Competitions } from '../core/competitions';
import { ALL_ITEMS } from '../layout/nav';

/** Sections whose service arrives in a later step of the roadmap: an honest placeholder, never a dead link. */
@Component({
  selector: 'bo-coming-soon',
  imports: [GrEmpty, GrButton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-3xl">
      <h1 class="text-ui-h3">{{ item()?.label ?? 'Sección' }}</h1>
      <div class="mt-6 rounded-lg border border-line-subtle bg-bg-card">
        <gr-empty [icon]="item()?.icon ?? 'info'" title="En construcción" text="Esta sección del nuevo backoffice todavía no está disponible en este entorno. El resto de la plataforma funciona con normalidad.">
          <a grButton [routerLink]="['/', comps.current()?.slug, 'inicio']">Volver al Inicio</a>
        </gr-empty>
      </div>
    </div>
  `,
})
export class ComingSoonPage {
  protected readonly comps = inject(Competitions);
  readonly seccion = input('');
  protected readonly item = computed(() => ALL_ITEMS.find((i) => i.path === this.seccion()));
}

const ERRORS = {
  403: { icon: 'shield-alert', title: 'No tienes permiso para ver esto', text: 'Tu rol en esta competición no incluye esta sección. Pide acceso a un administrador del equipo.' },
  404: { icon: 'search', title: 'Esta página no existe', text: 'Puede que el enlace esté mal escrito o que la sección se haya movido.' },
  500: { icon: 'triangle-alert', title: 'Algo ha fallado', text: 'Hemos registrado el error. Vuelve a intentarlo en unos segundos.' },
} as const;

/** Figma «Error · 403» and «Error · 404 y 500». */
@Component({
  selector: 'bo-error',
  imports: [GrEmpty, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-[70dvh] items-center justify-center px-4' },
  template: `
    <div class="w-full max-w-lg rounded-xl border border-line-subtle bg-bg-card">
      <p class="pt-8 text-center font-mono text-[56px] leading-none font-medium text-text-disabled">{{ code() }}</p>
      <gr-empty [icon]="e().icon" [title]="e().title" [text]="e().text">
        <button grButton (click)="back()"><gr-icon name="chevron-left" [size]="16" />Volver</button>
        <button grButton variant="primary" (click)="home()">Ir al Inicio</button>
      </gr-empty>
    </div>
  `,
})
export class ErrorPage {
  private readonly router = inject(Router);
  readonly code = input<403 | 404 | 500>(404);
  protected readonly e = computed(() => ERRORS[this.code()]);
  protected back(): void {
    history.length > 1 ? history.back() : this.home();
  }
  protected home(): void {
    void this.router.navigateByUrl('/');
  }
}

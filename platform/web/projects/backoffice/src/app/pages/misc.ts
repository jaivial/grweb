import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GrButton, GrEmpty, GrIcon, type GrIconName } from '@grcup/ui';
import { Competitions } from '../core/competitions';
import { Auth } from '../core/auth';
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

/** Figma «Error · 403» and «Error · 404 y 500». */
@Component({
  selector: 'bo-error',
  imports: [GrEmpty, GrButton, GrIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-[70dvh] items-center justify-center px-4' },
  template: `
    <div class="w-full max-w-lg rounded-xl border border-line-subtle bg-bg-card">
      <gr-empty [icon]="e().icon" [title]="e().title" [text]="e().text">
        @switch (code()) {
          @case (403) {
            @if (motivo() === 'sin-competicion') {
              <button grButton (click)="logout()"><gr-icon name="log-out" [size]="16" />Salir</button>
            } @else {
              <button grButton (click)="back()"><gr-icon name="chevron-left" [size]="16" />Volver</button>
            }
            <a grButton variant="primary" [href]="solicitar()">Solicitar acceso</a>
          }
          @case (500) {
            <button grButton variant="primary" (click)="retry()">Reintentar</button>
            <a grButton [routerLink]="['/']">Ver estado</a>
          }
          @default {
            <button grButton (click)="back()"><gr-icon name="chevron-left" [size]="16" />Volver</button>
            <button grButton variant="primary" (click)="home()">Ir al Inicio</button>
          }
        }
      </gr-empty>
    </div>
  `,
})
export class ErrorPage {
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  private readonly comps = inject(Competitions);
  readonly code = input<403 | 404 | 500>(404);
  /** 403: section + permission that were denied (compGuard); 500: X-Request-Id of the failed request. */
  readonly seccion = input('');
  readonly motivo = input('');
  readonly ref = input('');
  private readonly item = computed(() => ALL_ITEMS.find((i) => i.path === this.seccion()));
  protected readonly e = computed((): { icon: GrIconName; title: string; text: string } => {
    const it = this.item();
    const rol = this.auth.rolEn(this.comps.current()?.id) || 'actual';
    switch (this.code()) {
      case 403:
        if (this.motivo() === 'sin-competicion')
          return { icon: 'shield-alert', title: 'No tienes acceso a ninguna competición', text: 'Tu cuenta todavía no pertenece al equipo de ninguna competición. Pídeselo a un Admin de la competición.' };
        return it
          ? { icon: 'shield-alert', title: `No tienes acceso a ${it.label}`, text: `Tu rol (${rol}) no incluye ${it.perm}. Pídeselo a un Admin de la competición.` }
          : { icon: 'shield-alert', title: 'No tienes acceso a esta sección', text: `Tu rol (${rol}) no incluye este permiso. Pídeselo a un Admin de la competición.` };
      case 500:
        return { icon: 'triangle-alert', title: 'Algo ha fallado en el servidor (500)', text: `Lo hemos registrado${this.ref() ? ' con la incidencia #' + this.ref().slice(0, 8) : ''}. Tus datos no se han perdido.` };
      default:
        return { icon: 'search', title: 'Esta página ya no existe (404)', text: 'Puede que el enlace esté mal escrito o que la sección se haya movido.' };
    }
  });
  protected readonly solicitar = computed(
    () =>
      'mailto:admin@grstrength.com?subject=' +
      encodeURIComponent(this.item() ? `Acceso a ${this.item()!.label} (${this.item()!.perm ?? ''})` : this.motivo() === 'sin-competicion' ? 'Acceso al backoffice (sin competición)' : 'Acceso a una sección'),
  );
  protected retry(): void {
    history.length > 1 ? history.back() : location.reload();
  }
  protected back(): void {
    history.length > 1 ? history.back() : this.home();
  }
  protected home(): void {
    void this.router.navigateByUrl('/');
  }
  protected async logout(): Promise<void> {
    await this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}

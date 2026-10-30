import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GrIcon } from '@grcup/ui';
import { Novedades, mensajeError } from '../core/novedades';

/** «Novedades de la GRStrength Cup» (Figma «Footer» and «Próximamente» pages): email + unticked consent → double opt-in. */
@Component({
  selector: 'gr-newsletter',
  imports: [FormsModule, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="grid gap-5 rounded-xl border border-accent/40 bg-[linear-gradient(110deg,#3a0f17,#1d1214_70%)] p-5 md:p-6" [class]="compacta() ? '' : 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:items-center lg:p-8'"
      [attr.aria-labelledby]="id + '-t'">
      <div>
        <h2 [id]="id + '-t'" class="text-display-2xs md:text-display-xs">{{ titulo() }}</h2>
        <p class="mt-2 text-body-s text-text-secondary">{{ texto() }}</p>
      </div>
      @if (enviado()) {
        <div class="flex items-start gap-3 rounded-md border border-success/40 bg-success/10 p-4" role="status">
          <gr-icon name="mail" [size]="20" class="mt-0.5 text-success" />
          <div><p class="text-label-m">Revisa tu email</p><p class="text-body-s text-text-secondary">Te hemos enviado un enlace para confirmar la suscripción. Si no llega, mira en spam.</p></div>
        </div>
      } @else {
        <form class="flex flex-col gap-3" (submit)="$event.preventDefault(); enviar()" novalidate>
          <div class="flex flex-col gap-2" [class.sm:flex-row]="!compacta()">
            <label class="relative min-w-0 flex-1">
              <span class="sr-only">Tu email</span>
              <gr-icon name="mail" [size]="16" class="absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary" />
              <input type="email" name="email" autocomplete="email" placeholder="tu@email.com" [(ngModel)]="email" required
                class="h-12 w-full rounded-md border border-line-strong bg-bg-field pr-3 pl-9 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none" />
            </label>
            <button type="submit" class="h-12 shrink-0 rounded-sm bg-accent-grain px-6 text-label-m text-white disabled:opacity-60" [disabled]="enviando()">{{ enviando() ? 'Enviando…' : 'Suscribirme' }}</button>
          </div>
          <label class="flex items-start gap-2.5 text-body-xs text-text-secondary">
            <input type="checkbox" name="acepta" class="mt-0.5 size-4 shrink-0 accent-[#c42b3e]" [(ngModel)]="acepta" />
            <span>Quiero recibir novedades de GRStrength. Te enviaremos un email para confirmarlo y puedes darte de baja en 1 clic. <a href="/privacidad" class="text-accent-text underline-offset-2 hover:underline">Política de privacidad</a></span>
          </label>
          @if (error()) { <p class="text-body-xs text-accent-text" role="alert">{{ error() }}</p> }
        </form>
      }
    </section>
  `,
})
export class Newsletter {
  private readonly api = inject(Novedades);
  private readonly router = inject(Router);
  readonly titulo = input('Novedades de la GRStrength Cup');
  readonly texto = input('Fechas, horarios, sorteo y próximas competiciones. Un email al mes como mucho.');
  readonly origen = input('');
  /** Narrow columns (sidebars): one column, stacked button. */
  readonly compacta = input(false);
  protected readonly id = 'nl-' + Math.random().toString(36).slice(2, 8);
  protected readonly enviando = signal(false);
  protected readonly enviado = signal(false);
  protected readonly error = signal('');
  protected email = '';
  protected acepta = false;

  protected async enviar(): Promise<void> {
    this.error.set('');
    const e = this.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return this.error.set('Escribe un email válido.');
    if (!this.acepta) return this.error.set('Marca la casilla para recibir las novedades.');
    this.enviando.set(true);
    try {
      await this.api.suscribir(e, true, this.origen() || this.router.url.split('?')[0] || '/');
      this.enviado.set(true);
    } catch (err) {
      this.error.set(mensajeError(err));
    } finally {
      this.enviando.set(false);
    }
  }
}

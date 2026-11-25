import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { GrButton, GrIcon, GrToasts } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { BoToggleRow } from '../../shared/kit';
import { errText } from '../../shared/ui';
import { AtletasApi } from './api';

/**
 * «Enviar acceso al perfil» (Figma «BO · Atletas · Enviar acceso al perfil»): email «Tu perfil de atleta en la GRS Cup 2
 * ya existe» with the athlete's email and a NEW initial password (first name + 4 digits). From the selection of the
 * list, the «Acciones» panel (all athletes) or the athlete's page. The password never comes back to the backoffice.
 */
@Component({
  selector: 'bo-perfil-existe',
  imports: [A11yModule, BoToggleRow, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="cerrar.emit()" (keydown.escape)="cerrar.emit()">
      <div class="w-full max-w-[520px] rounded-xl border border-line-strong bg-bg-card p-6 shadow-card" role="dialog" aria-modal="true" aria-labelledby="pe-titulo"
        cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
        <div class="flex items-start justify-between gap-3">
          <h2 id="pe-titulo" class="text-[20px] leading-[26px] font-semibold">Enviar acceso al perfil {{ destino() }}</h2>
          <button type="button" class="-mt-2 -mr-2 flex size-11 items-center justify-center text-text-tertiary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="18" /></button>
        </div>
        <p class="mt-3 text-body-s text-text-secondary">Cada atleta recibe el email «Tu perfil de atleta en la GRS Cup 2 ya existe» con su email y una contraseña inicial nueva (nombre + 4 cifras, p. ej. jaime4589). La contraseña anterior deja de valer. A quien no tenga email no se le envía.</p>
        <div class="mt-4"><bo-toggle-row label="También por WhatsApp" description="A quien tenga teléfono (si «WhatsApp al atleta» está activo)" [(value)]="whatsapp" /></div>
        <div class="mt-6 flex justify-end gap-2">
          <button type="button" grButton variant="ghost" (click)="cerrar.emit()">Cancelar</button>
          <button type="button" grButton variant="primary" icon="send" [loading]="busy()" (click)="enviar()">Enviar {{ destino() }}</button>
        </div>
      </div>
    </div>
  `,
})
export class PerfilExisteDialogo {
  /** Athletes to send it to; empty with «todos» = every athlete with email. */
  readonly ids = input<string[]>([]);
  readonly todos = input(false);
  readonly nombre = input('');
  readonly cerrar = output<void>();
  readonly enviado = output<void>();
  private readonly api = inject(AtletasApi);
  private readonly comps = inject(Competitions);
  private readonly toasts = inject(GrToasts);
  protected readonly whatsapp = signal(false);
  protected readonly busy = signal(false);

  protected destino(): string {
    if (this.todos()) return 'a todos los atletas';
    const n = this.ids().length;
    return n === 1 && this.nombre() ? 'a ' + this.nombre() : `a ${n} atleta${n === 1 ? '' : 's'}`;
  }

  protected async enviar(): Promise<void> {
    const cid = this.comps.current()?.id;
    if (!cid) return;
    this.busy.set(true);
    try {
      const r = await this.api.perfilExiste(cid, this.todos() ? { todos: true, whatsapp: this.whatsapp() } : { ids: this.ids(), whatsapp: this.whatsapp() });
      const extra = r.sinEmail ? ` · ${r.sinEmail} sin email` : '';
      this.toasts.success('Acceso al perfil enviado', `${r.emails} email${r.emails === 1 ? '' : 's'} y ${r.whatsapps} WhatsApp${extra}.`);
      this.enviado.emit();
    } catch (e) {
      this.toasts.error('No se pudo enviar', errText(e));
    } finally {
      this.busy.set(false);
    }
  }
}

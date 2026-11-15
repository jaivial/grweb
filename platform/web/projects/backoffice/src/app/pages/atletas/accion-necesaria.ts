import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrButton, GrField, GrIcon, GrInput, GrToasts } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { errText } from '../../shared/ui';
import { AtletasApi } from './api';

/**
 * «Pedir una acción» (email + WhatsApp «Acción necesaria»): se abre desde la ficha (un atleta) o desde la selección
 * de la lista (varios). Sin enlace propio, cada atleta recibe un enlace a su área.
 */
@Component({
  selector: 'bo-accion-necesaria',
  imports: [A11yModule, FormsModule, GrButton, GrField, GrIcon, GrInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="cerrar.emit()" (keydown.escape)="cerrar.emit()">
      <form class="w-full max-w-lg rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" aria-labelledby="an-titulo"
        cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()" (ngSubmit)="enviar()">
        <div class="flex items-start justify-between gap-3">
          <h2 id="an-titulo" class="text-ui-h5">Pedir una acción{{ ids().length > 1 ? ' a ' + ids().length + ' atletas' : nombre() ? ' a ' + nombre() : '' }}</h2>
          <button type="button" class="-mt-2 -mr-2 flex size-11 items-center justify-center text-text-tertiary" aria-label="Cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="18" /></button>
        </div>
        <p class="mt-2 text-body-s text-text-secondary">Le llega el email «Acción necesaria» y, si tiene teléfono, un WhatsApp con un botón para resolverlo.</p>
        <div class="mt-4 flex flex-col gap-4">
          <gr-field label="Qué tiene que hacer" for="an-accion"><input grInput id="an-accion" name="accion" [(ngModel)]="accion" maxlength="120" required placeholder="p. ej. Sube tu licencia AEP" /></gr-field>
          <gr-field label="Detalle (opcional)" for="an-detalle"><textarea grInput id="an-detalle" name="detalle" rows="3" maxlength="400" [(ngModel)]="detalle" placeholder="p. ej. Necesitamos una foto de tu licencia en vigor para validar tu inscripción."></textarea></gr-field>
          <gr-field label="Fecha límite (opcional)" for="an-fecha"><input grInput id="an-fecha" name="fecha" type="date" [(ngModel)]="fecha" /></gr-field>
          <gr-field label="Enlace (opcional · vacío = su área de atleta)" for="an-enlace"><input grInput id="an-enlace" name="enlace" type="url" maxlength="300" [(ngModel)]="enlace" placeholder="https://…" /></gr-field>
        </div>
        <div class="mt-6 flex justify-end gap-2">
          <button type="button" grButton variant="ghost" (click)="cerrar.emit()">Cancelar</button>
          <button type="submit" grButton variant="primary" icon="send" [loading]="busy()" [disabled]="accion.trim().length < 3">Enviar</button>
        </div>
      </form>
    </div>
  `,
})
export class AccionNecesariaDialogo {
  readonly ids = input.required<string[]>();
  readonly nombre = input('');
  readonly cerrar = output<void>();
  readonly enviado = output<void>();
  private readonly api = inject(AtletasApi);
  private readonly comps = inject(Competitions);
  private readonly toasts = inject(GrToasts);
  protected accion = '';
  protected detalle = '';
  protected fecha = '';
  protected enlace = '';
  protected readonly busy = signal(false);

  /** «2026-12-11» → «viernes 11 de diciembre». */
  private fechaTexto(f: string): string {
    if (!f) return '';
    const d = new Date(f + 'T12:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  protected async enviar(): Promise<void> {
    const cid = this.comps.current()?.id;
    if (!cid || this.accion.trim().length < 3) return;
    this.busy.set(true);
    try {
      const r = await this.api.accionNecesaria(cid, { ids: this.ids(), accion: this.accion.trim(), detalle: this.detalle.trim(), fecha: this.fechaTexto(this.fecha), enlace: this.enlace.trim() });
      const extra = r.sinEmail ? ` · ${r.sinEmail} sin email` : '';
      this.toasts.success('Acción pedida', `${r.emails} email${r.emails === 1 ? '' : 's'} y ${r.whatsapps} WhatsApp${extra}.`);
      this.enviado.emit();
    } catch (e) {
      this.toasts.error('No se pudo enviar', errText(e));
    } finally {
      this.busy.set(false);
    }
  }
}

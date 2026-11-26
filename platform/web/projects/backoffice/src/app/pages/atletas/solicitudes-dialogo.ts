import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrButton, GrField, GrIcon, GrInput } from '@grcup/ui';
import { BoToggle } from '../../shared/ui';

/** Confirmation dialogs of a request: approve, reject (with reason) and RGPD delete (type BORRAR). */
@Component({
  selector: 'bo-solicitudes-dialogo',
  imports: [A11yModule, FormsModule, BoToggle, GrButton, GrField, GrIcon, GrInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- ===== Approve ===== -->
    @if (tipo() === 'aprobar') {
      <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4" (click)="cerrar.emit()" (keydown.escape)="cerrar.emit()">
        <div class="w-full max-w-lg rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" aria-label="Aprobar (ficha privada)"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-ui-h5">{{ autorizacion() ? 'Aprobar autorización del tutor' : cambio() ? 'Aprobar cambio de perfil' : 'Aprobar (ficha privada)' }}</h2>
            <button type="button" class="-mt-2 -mr-2 flex size-11 items-center justify-center text-text-tertiary" aria-label="Cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="18" /></button>
          </div>
          @if (autorizacion()) {
            <p class="mt-3 text-body-s text-text-secondary">La autorización firmada se guarda en la ficha de {{ nombre() }} y su perfil pasa a mostrarse en la web (atletas, porra, fantasy, horarios y directo).</p>
          } @else if (cambio()) {
            <p class="mt-3 text-body-s text-text-secondary">{{ destino() }}. Los cambios se aplican en cuanto confirmes (solo esos campos) y la solicitud queda en el historial del atleta y en la auditoría.</p>
            @if (cambiaEmail()) {
              <p class="mt-2 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/8 p-3 text-body-s text-text-secondary"><gr-icon name="circle-alert" [size]="18" class="mt-0.5 shrink-0 text-warning" />El email cambia: desde ese momento entra al área de atleta con el nuevo. Comprueba que esté bien escrito.</p>
            }
          } @else {
            <p class="mt-3 text-body-s text-text-secondary">{{ destino() }}. El perfil queda privado: no aparece en /atletas hasta que el atleta active su publicación desde el área de atleta{{ imagenAceptada() ? '.' : ' (sin consentimiento de imagen, la foto no se publica).' }}</p>
          }
          <div class="mt-5 flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-surface px-4 py-3">
            <span class="min-w-0"><span class="block text-label-s">Avisar por email</span><span class="block text-body-xs text-text-tertiary">{{ autorizacion() ? 'Le llegará un email: autorización aprobada' : cambio() ? 'Le llegará un email con los cambios aplicados' : 'Le llegará el acceso a su área de atleta' }}</span></span>
            <bo-toggle [(value)]="avisarEmail" label="Avisar por email" />
          </div>
          <div class="mt-3 flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-surface px-4 py-3">
            <span class="min-w-0"><span class="block text-label-s">Avisar por WhatsApp</span><span class="block text-body-xs text-text-tertiary">Solo si el atleta lo consintió · con el número de la competición vinculado</span></span>
            <bo-toggle [(value)]="avisarWhatsApp" label="Avisar por WhatsApp" />
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button grButton variant="ghost" (click)="cerrar.emit()">Cancelar</button>
            <button grButton variant="primary" [loading]="ocupado()" (click)="aprobar.emit()">{{ autorizacion() ? 'Aprobar autorización' : cambio() ? 'Aprobar cambios' : 'Aprobar (ficha privada)' }}</button>
          </div>
        </div>
      </div>
    }

    <!-- ===== Reject ===== -->
    @if (tipo() === 'rechazar') {
      <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4" (click)="cerrar.emit()" (keydown.escape)="cerrar.emit()">
        <div class="w-full max-w-lg rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" aria-label="Rechazar solicitud"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-ui-h5">{{ autorizacion() ? 'Rechazar autorización del tutor' : cambio() ? 'Rechazar cambio de perfil' : 'Rechazar solicitud' }}</h2>
            <button type="button" class="-mt-2 -mr-2 flex size-11 items-center justify-center text-text-tertiary" aria-label="Cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="18" /></button>
          </div>
          <p class="mt-3 text-body-s text-text-secondary">{{ autorizacion() ? 'Explica el motivo (mínimo 3 caracteres): el atleta lo recibe por email y WhatsApp con el enlace para subir otra.' : cambio() ? 'Explica el motivo (opcional): lo verá el atleta si le avisas. Su ficha no cambia.' : 'Explica el motivo (mínimo 3 caracteres): queda en el registro de auditoría y se borra la foto privada.' }}</p>
          <div class="mt-4">
            <gr-field [label]="cambio() ? 'Motivo (opcional)' : 'Motivo (obligatorio)'" [error]="motivoError()">
              <textarea grInput rows="3" maxlength="400" [ngModel]="motivo" (ngModelChange)="motivo = $event" [placeholder]="autorizacion() ? 'p. ej. Falta la firma del tutor o no se lee bien la fecha' : cambio() ? 'p. ej. El nuevo club no consta en el directorio' : 'p. ej. Los datos de club y licencia no coinciden con la AEP'"></textarea>
            </gr-field>
            <p class="mt-1 text-body-xs text-text-tertiary">{{ cambio() ? 'Opcional · si lo escribes, mínimo 3 caracteres y el atleta lo verá en el aviso' : 'Mínimo 3 caracteres' }} · el motivo queda en el registro de auditoría</p>
          </div>
          <div class="mt-4 flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-surface px-4 py-3">
            <span class="min-w-0"><span class="block text-label-s">Avisar por email</span><span class="block text-body-xs text-text-tertiary">Le llegará un email con el motivo del rechazo</span></span>
            <bo-toggle [(value)]="avisarEmail" label="Avisar del rechazo por email" />
          </div>
          <div class="mt-3 flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-surface px-4 py-3">
            <span class="min-w-0"><span class="block text-label-s">Avisar por WhatsApp</span><span class="block text-body-xs text-text-tertiary">Solo si el atleta lo consintió · con el número de la competición vinculado</span></span>
            <bo-toggle [(value)]="avisarWhatsApp" label="Avisar del rechazo por WhatsApp" />
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button grButton variant="ghost" (click)="cerrar.emit()">Cancelar</button>
            <button grButton variant="danger" [loading]="ocupado()" [disabled]="!motivoListo()" (click)="rechazar.emit(motivo.trim())">{{ autorizacion() ? 'Rechazar autorización' : cambio() ? 'Rechazar cambios' : 'Rechazar solicitud' }}</button>
          </div>
        </div>
      </div>
    }

    <!-- ===== Delete (RGPD) ===== -->
    @if (tipo() === 'borrar') {
      <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4" (click)="cerrar.emit()" (keydown.escape)="cerrar.emit()">
        <div class="w-full max-w-lg rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" aria-label="Borrar solicitud"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-ui-h5">Borrar solicitud de {{ nombre() }}</h2>
            <button type="button" class="-mt-2 -mr-2 flex size-11 items-center justify-center text-text-tertiary" aria-label="Cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="18" /></button>
          </div>
          <p class="mt-3 text-body-s text-text-secondary">Se eliminarán la solicitud, la foto privada y los consentimientos. Esta acción no se puede deshacer.</p>
          <div class="mt-4">
            <gr-field label="Escribe BORRAR para confirmar" [error]="borrarError()">
              <input grInput maxlength="6" [ngModel]="borrarTexto" (ngModelChange)="borrarTexto = $event" placeholder="BORRAR" />
            </gr-field>
            <p class="mt-1 text-body-xs text-text-tertiary">La acción queda en el registro de auditoría · la foto se retira también de la web</p>
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button grButton variant="ghost" (click)="cerrar.emit()">Cancelar</button>
            <button grButton variant="danger" [loading]="ocupado()" [disabled]="borrarTexto.trim() !== 'BORRAR'" (click)="!ocupado() && borrar.emit()">Borrar definitivamente</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class SolicitudesDialogo {
  readonly tipo = input.required<'aprobar' | 'rechazar' | 'borrar'>();
  readonly nombre = input('');
  readonly imagenAceptada = input(false);
  /** A profile-change request: nothing is created, its snapshot is applied on approval. */
  readonly cambio = input(false);
  /** A guardian authorisation uploaded from the public link: the reason to reject is required. */
  readonly autorizacion = input(false);
  /** The approval moves the athlete's email (also their login address). */
  readonly cambiaEmail = input(false);
  readonly destino = input('');
  readonly ocupado = input(false);
  readonly avisarEmail = model(true);
  readonly avisarWhatsApp = model(false);
  readonly cerrar = output();
  readonly aprobar = output();
  readonly rechazar = output<string>();
  readonly borrar = output();

  protected motivo = '';
  protected borrarTexto = '';
  /** Empty is fine in a change of profile (nothing to correct); when written, it needs at least 3 characters. */
  protected motivoListo(): boolean {
    if (!this.motivo.length) return this.cambio();
    return this.motivo.trim().length >= 3;
  }
  protected motivoError(): string | null {
    return this.motivo.length > 0 && this.motivo.trim().length < 3 ? 'Escribe al menos 3 caracteres' : null;
  }
  protected borrarError(): string | null {
    return this.borrarTexto.length > 0 && this.borrarTexto.trim() !== 'BORRAR' ? 'Escribe BORRAR en mayúsculas' : null;
  }
}

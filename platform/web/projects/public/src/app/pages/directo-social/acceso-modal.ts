import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon } from '@grcup/ui';
import { FanSession, codigoError, detalleError } from '../../core/fan';

type Estado = 'formulario' | 'enviado' | 'atleta';

/**
 * Modal global «Entrar al directo» (Figma 70): atleta o público, alias y email; el backend manda un enlace mágico.
 * Se monta una sola vez (en el layout) y se abre cuando `FanSession.accesoAbierto()` es true.
 */
@Component({
  selector: 'gr-acceso-modal',
  imports: [FormsModule, A11yModule, GrButton, GrIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (fan.accesoAbierto()) {
      <div class="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 md:items-center md:px-4" (click)="cerrar()" (keydown.escape)="cerrar()">
        <div class="max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-line-strong bg-bg-raised p-5 shadow-card md:max-w-[440px] md:rounded-xl md:p-6"
          role="dialog" aria-modal="true" aria-label="Entrar al directo" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-ui-h4">{{ titulo() }}</h2>
            <button type="button" class="-mt-2 -mr-2 flex size-11 items-center justify-center text-text-tertiary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar()"><gr-icon name="x" [size]="18" /></button>
          </div>
          <p class="mt-2 text-body-s text-text-secondary">{{ subtitulo() }}</p>

          @switch (estado()) {
            @case ('enviado') {
              <p class="mt-5 flex items-center gap-2 text-body-s text-text-secondary"><gr-icon name="mail" [size]="18" class="text-accent-text" />Hemos enviado un enlace mágico a {{ email() }}. Ábrelo en este dispositivo para entrar como {{ tipo() === 'atleta' ? 'ATLETA' : 'PÚBLICO' }}.</p>
              <p class="mt-3 text-body-xs text-text-tertiary">El enlace caduca en 30 minutos · máx. 5 enlaces por hora y 20 por IP</p>
              <div class="mt-5 flex flex-col gap-2">
                <button type="button" grButton variant="primary" size="l" [block]="true" (click)="cerrar()">Ya lo he abierto</button>
                <button type="button" grButton variant="secondary" size="l" [block]="true" (click)="volver()">Usar otro email</button>
              </div>
            }
            @case ('atleta') {
              <label class="mt-5 block">
                <span class="text-label-s text-text-primary">Email con el que te inscribiste en la AEP *</span>
                <input grInput type="email" autocomplete="email" class="mt-1.5" placeholder="carlos@otroclub.com" aria-label="Email de inscripción" [ngModel]="email()" (ngModelChange)="email.set($event)" />
              </label>
              @if (error(); as e) { <p class="mt-1.5 text-body-xs text-accent-text" role="alert">{{ e }}</p> }
              <p class="mt-3 text-body-xs text-text-tertiary">La insignia «Atleta» solo se acredita con el email de inscripción · código ATLETA_NO_ENCONTRADO</p>
              <div class="mt-5 flex flex-col gap-2">
                <button type="button" grButton variant="primary" size="l" [block]="true" [loading]="enviando()" (click)="entrarComoPublico()">Entrar como público</button>
                <button type="button" grButton variant="secondary" size="l" [block]="true" (click)="estado.set('formulario')">Reintentar</button>
              </div>
            }
            @default {
              <!-- atleta o público -->
              <div class="mt-5 grid grid-cols-2 gap-1 rounded-md border border-line-subtle bg-bg-surface p-1" role="radiogroup" aria-label="Tipo de cuenta">
                <button type="button" role="radio" [attr.aria-checked]="tipo() === 'atleta'" class="h-11 rounded-sm px-4 text-label-s md:h-10" [class]="tipo() === 'atleta' ? 'bg-bg-raised text-text-primary shadow-[0_1px_0_rgb(255_255_255/0.06)_inset]' : 'text-text-tertiary hover:text-text-primary'" (click)="tipo.set('atleta')">Atleta</button>
                <button type="button" role="radio" [attr.aria-checked]="tipo() === 'publico'" class="h-11 rounded-sm px-4 text-label-s md:h-10" [class]="tipo() === 'publico' ? 'bg-bg-raised text-text-primary shadow-[0_1px_0_rgb(255_255_255/0.06)_inset]' : 'text-text-tertiary hover:text-text-primary'" (click)="tipo.set('publico')">Público</button>
              </div>

              <label class="mt-5 block">
                <span class="text-label-s text-text-primary">Alias *</span>
                <input grInput type="text" autocomplete="nickname" class="mt-1.5" placeholder="tu alias en el directo" aria-label="Alias" [attr.aria-invalid]="errorAlias() ? 'true' : null" [ngModel]="alias()" (ngModelChange)="alias.set($event)" />
                @if (errorAlias(); as e) { <p class="mt-1.5 text-body-xs text-accent-text" role="alert">{{ e }}</p> }
                @else { <p class="mt-1 text-body-xs text-text-tertiary">3–20 caracteres: letras, números, espacios o _ . -</p> }
              </label>

              <label class="mt-4 block">
                <span class="text-label-s text-text-primary">{{ tipo() === 'atleta' ? 'Email con el que te inscribiste en la AEP *' : 'Email *' }}</span>
                <input grInput type="email" autocomplete="email" class="mt-1.5" placeholder="email@ejemplo.com" aria-label="Email" [ngModel]="email()" (ngModelChange)="email.set($event)" />
                @if (error(); as e) { <p class="mt-1.5 text-body-xs text-accent-text" role="alert">{{ e }}</p> }
              </label>

              <label class="mt-4 flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" class="mt-0.5 size-4 shrink-0 accent-[#c42b3e]" [ngModel]="normas()" (ngModelChange)="normas.set($event)" />
                <span class="text-body-xs text-text-secondary">Acepto las normas del chat: sin enlaces, sin insultos, sin spam.</span>
              </label>

              <button type="button" grButton variant="primary" size="l" [block]="true" class="mt-5" [loading]="enviando()" [disabled]="!puedeEnviar()" (click)="enviar()">Enviarme el enlace</button>
              <p class="mt-3 text-center text-body-xs text-text-tertiary">Sin contraseñas · el enlace caduca en 30 min · máx. 5 enlaces por hora</p>
            }
          }
        </div>
      </div>
    }
  `,
})
export class AccesoModal {
  protected readonly fan = inject(FanSession);

  protected readonly estado = signal<Estado>('formulario');
  protected readonly tipo = signal<'atleta' | 'publico'>('publico');
  protected readonly alias = signal('');
  protected readonly email = signal('');
  protected readonly normas = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errorAlias = signal<string | null>(null);
  protected readonly enviando = signal(false);

  protected readonly titulo = computed(() => (this.estado() === 'enviado' ? 'Revisa tu correo' : this.estado() === 'atleta' ? 'Entrar como atleta' : 'Entrar al directo'));
  protected readonly subtitulo = computed(() => {
    if (this.estado() === 'enviado') return 'Sin contraseñas: te enviamos un enlace mágico al email.';
    if (this.estado() === 'atleta') return 'Comprobamos tu email contra la inscripción de la AEP.';
    return 'Elige cómo entrar. Sin contraseñas: te enviamos un enlace mágico al email.';
  });
  protected readonly puedeEnviar = computed(() => this.alias().trim().length >= 3 && this.alias().trim().length <= 20 && this.email().includes('@') && this.normas());

  constructor() {
    // The modal opens on every request of access: it always starts clean.
    effect(() => {
      if (!this.fan.accesoAbierto()) return;
      this.estado.set('formulario');
      this.error.set(null);
      this.errorAlias.set(null);
    });
  }

  protected cerrar(): void {
    this.fan.cerrarAcceso();
  }

  protected volver(): void {
    this.estado.set('formulario');
    this.email.set('');
    this.error.set(null);
  }

  protected async enviar(): Promise<void> {
    if (!this.puedeEnviar() || this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    this.errorAlias.set(null);
    try {
      await this.fan.pedirAcceso({ email: this.email().trim(), tipo: this.tipo(), alias: this.alias().trim(), aceptaNormas: this.normas() });
      this.estado.set('enviado');
    } catch (e) {
      const codigo = codigoError(e);
      if (codigo === 'ALIAS_NO_VALIDO' || codigo === 'ALIAS_OCUPADO') this.errorAlias.set(detalleError(e));
      else if (codigo === 'ATLETA_NO_ENCONTRADO') {
        this.estado.set('atleta');
        this.error.set('No encontramos ningún atleta inscrito con ese email');
      } else this.error.set(detalleError(e));
    } finally {
      this.enviando.set(false);
    }
  }

  /** From the «atleta no encontrado» state: the same email enters as público. */
  protected async entrarComoPublico(): Promise<void> {
    this.tipo.set('publico');
    const anterior = this.estado();
    this.estado.set('formulario');
    await this.enviar();
    if (this.estado() !== 'enviado') this.estado.set(anterior);
  }
}

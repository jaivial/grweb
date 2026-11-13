import { A11yModule } from '@angular/cdk/a11y';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { GrAlert, GrButton, GrIcon, GrInput, GrSpinner, GrToasts } from '@grcup/ui';
import { Auth } from '../core/auth';
import { errText } from './ui';

/** Opens the «Verificación en dos pasos» dialog from anywhere (user menu, member card, 2FA banner). */
@Injectable({ providedIn: 'root' })
export class DosFactoresUi {
  readonly open = signal(false);
}

interface Estado {
  activado: boolean;
  activadoAt?: string;
  codigosRecuperacion: number;
}

/** Two-step verification of the signed-in user (TOTP, Figma 63): turn on with QR + first code, recovery codes, turn off with a code. */
@Component({
  selector: 'bo-dos-factores',
  imports: [A11yModule, FormsModule, GrAlert, GrButton, GrIcon, GrInput, GrSpinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ui.open()) {
      <div
        class="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center sm:px-4"
        (click)="cerrar()"
        (keydown.escape)="cerrar()"
      >
        <div
          class="flex max-h-[92dvh] w-full max-w-[520px] flex-col gap-5 overflow-y-auto rounded-t-2xl border border-line-strong bg-bg-card p-6 shadow-card sm:rounded-xl"
          role="dialog"
          aria-modal="true"
          aria-label="Verificación en dos pasos"
          cdkTrapFocus
          [cdkTrapFocusAutoCapture]="true"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-start gap-3">
            <h2 class="min-w-0 flex-1 text-[20px] leading-[26px] font-semibold">
              Verificación en dos pasos
            </h2>
            <button
              type="button"
              class="-m-1 rounded-xs p-1 text-text-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]"
              aria-label="Cerrar"
              (click)="cerrar()"
            >
              <gr-icon name="x" [size]="18" />
            </button>
          </div>
          @if (error()) {
            <gr-alert tone="danger" title="No se pudo completar">{{ error() }}</gr-alert>
          }
          @switch (paso()) {
            @case ('cargando') {
              <div class="flex justify-center py-8"><gr-spinner /></div>
            }
            @case ('estado') {
              @if (estado()?.activado) {
                <gr-alert tone="success" title="Activada"
                  >Te pedimos un código de tu app cada vez que entras con contraseña. Te quedan
                  {{ estado()!.codigosRecuperacion }} códigos de recuperación.</gr-alert
                >
                <form class="flex flex-col gap-2" (ngSubmit)="desactivar()">
                  <label for="tfa-off" class="text-label-s text-text-secondary"
                    >Para desactivarla, escribe un código de la app o de recuperación</label
                  >
                  <input
                    grInput
                    id="tfa-off"
                    name="codigo"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    maxlength="12"
                    [(ngModel)]="codigo"
                  />
                  <div class="mt-3 flex justify-end gap-2">
                    <button type="button" grButton variant="ghost" (click)="cerrar()">Cerrar</button
                    ><button
                      type="submit"
                      grButton
                      variant="danger"
                      [loading]="busy()"
                      [disabled]="codigo.trim().length < 6"
                    >
                      Desactivar
                    </button>
                  </div>
                </form>
              } @else {
                <p class="text-body-s text-text-secondary">
                  Además de la contraseña, al entrar te pediremos un código de 6 cifras de una app
                  como Google Authenticator, 1Password o Authy. Recomendado para la mesa y la
                  taquilla el día del evento.
                </p>
                <div class="flex justify-end gap-2">
                  <button grButton variant="ghost" (click)="cerrar()">Ahora no</button
                  ><button
                    grButton
                    variant="primary"
                    icon="shield"
                    [loading]="busy()"
                    (click)="empezar()"
                  >
                    Activar
                  </button>
                </div>
              }
            }
            @case ('qr') {
              <ol class="flex flex-col gap-4 text-body-s text-text-secondary">
                <li>
                  1. Escanea el código con tu app de verificación.
                  <div
                    class="mt-3 flex flex-col items-center gap-3 rounded-md border border-line-subtle bg-bg-raised p-4 sm:flex-row"
                  >
                    @if (qr()) {
                      <img
                        [src]="qr()"
                        alt="Código QR para la app de verificación"
                        width="160"
                        height="160"
                        class="rounded-sm bg-white p-1"
                      />
                    }
                    <div class="min-w-0 text-body-xs text-text-tertiary">
                      ¿No puedes escanearlo? Escribe esta clave:
                      <p class="mt-1 font-mono text-mono-s break-all text-text-primary">
                        {{ secreto() }}
                      </p>
                      <button
                        type="button"
                        class="mt-2 inline-flex items-center gap-1 text-label-s text-accent-text hover:underline"
                        (click)="copiar(secreto())"
                      >
                        <gr-icon name="copy" [size]="14" />Copiar clave
                      </button>
                    </div>
                  </div>
                </li>
                <li>
                  <form class="flex flex-col gap-2" (ngSubmit)="confirmar()">
                    <label for="tfa-on">2. Escribe el código de 6 cifras que muestra la app</label>
                    <input
                      grInput
                      id="tfa-on"
                      name="codigo"
                      inputmode="numeric"
                      autocomplete="one-time-code"
                      maxlength="6"
                      placeholder="000000"
                      class="font-mono tracking-[0.3em]"
                      [(ngModel)]="codigo"
                    />
                    <div class="mt-3 flex justify-end gap-2">
                      <button type="button" grButton variant="ghost" (click)="cerrar()">
                        Cancelar</button
                      ><button
                        type="submit"
                        grButton
                        variant="primary"
                        [loading]="busy()"
                        [disabled]="!valido()"
                      >
                        Activar
                      </button>
                    </div>
                  </form>
                </li>
              </ol>
            }
            @case ('codigos') {
              <gr-alert tone="warning" title="Guarda tus códigos de recuperación"
                >Cada uno sirve una vez si pierdes el móvil. No los volveremos a mostrar.</gr-alert
              >
              <ul
                class="grid grid-cols-2 gap-2 rounded-md border border-line-subtle bg-bg-raised p-4 font-mono text-mono-s"
              >
                @for (c of codigos(); track c) {
                  <li>{{ c }}</li>
                }
              </ul>
              <div class="flex flex-wrap justify-end gap-2">
                <button grButton icon="copy" (click)="copiar(codigos().join('\\n'))">Copiar</button
                ><button grButton variant="primary" (click)="cerrar()">Hecho</button>
              </div>
            }
          }
        </div>
      </div>
    }
  `,
})
export class BoDosFactores {
  protected readonly ui = inject(DosFactoresUi);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(Auth);
  private readonly toasts = inject(GrToasts);
  protected readonly paso = signal<'cargando' | 'estado' | 'qr' | 'codigos'>('cargando');
  protected readonly estado = signal<Estado | null>(null);
  protected readonly qr = signal('');
  protected readonly secreto = signal('');
  protected readonly codigos = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected codigo = '';

  constructor() {
    effect(() => {
      if (this.ui.open()) untracked(() => void this.cargar());
    });
  }

  protected valido(): boolean {
    return /^\d{6}$/.test(this.codigo.replace(/\s/g, ''));
  }

  private async cargar(): Promise<void> {
    this.paso.set('cargando');
    this.error.set('');
    this.codigo = '';
    try {
      this.estado.set(await firstValueFrom(this.http.get<Estado>('/api/auth/2fa')));
    } catch (e) {
      this.error.set(errText(e, 'No se pudo leer el estado.'));
    }
    this.paso.set('estado');
  }

  protected async empezar(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await firstValueFrom(
        this.http.post<{ otpauthUrl: string; secreto: string }>('/api/auth/2fa/activar', {}),
      );
      this.secreto.set(r.secreto.replace(/(.{4})/g, '$1 ').trim());
      // qrcode is CommonJS: the dynamic import exposes it as `default`.
      const mod = await import('qrcode');
      const QR = (mod as unknown as { default?: typeof mod }).default ?? mod;
      this.qr.set(
        await QR.toDataURL(r.otpauthUrl, { margin: 1, width: 320, errorCorrectionLevel: 'M' }),
      );
      this.codigo = '';
      this.paso.set('qr');
    } catch (e) {
      this.error.set(errText(e, 'No se pudo empezar.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async confirmar(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await firstValueFrom(
        this.http.post<{ codigosRecuperacion: string[] }>('/api/auth/2fa/confirmar', {
          codigo: this.codigo.replace(/\s/g, ''),
        }),
      );
      this.codigos.set(r.codigosRecuperacion);
      this.paso.set('codigos');
      await this.auth.refresh();
      this.toasts.success('Verificación en dos pasos activada');
    } catch (e) {
      this.error.set(errText(e, 'El código no es correcto.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async desactivar(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await firstValueFrom(
        this.http.delete('/api/auth/2fa', { body: { codigo: this.codigo.trim() } }),
      );
      await this.auth.refresh();
      this.toasts.success('Verificación en dos pasos desactivada');
      this.ui.open.set(false);
    } catch (e) {
      this.error.set(errText(e, 'El código no es correcto.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected copiar(t: string): void {
    void navigator.clipboard
      ?.writeText(t.replace(/ /g, ''))
      .then(() => this.toasts.success('Copiado'));
  }

  protected cerrar(): void {
    this.ui.open.set(false);
  }
}

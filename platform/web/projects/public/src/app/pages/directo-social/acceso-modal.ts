import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon, GrInput, type GrIconName } from '@grcup/ui';
import { FanSession, codigoError, detalleError } from '../../core/fan';

type Estado = 'formulario' | 'enviado' | 'atleta';

/**
 * Modal global «Entrar al directo» (Figma 70): atleta o público, alias y email; el backend manda un enlace mágico.
 * Se monta una sola vez (en el layout) y se abre cuando `FanSession.accesoAbierto()` es true.
 */
@Component({
  selector: 'gr-acceso-modal',
  imports: [FormsModule, A11yModule, GrButton, GrIcon, GrInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @keyframes gr-velo { from { opacity: 0; } to { opacity: 1; } }
    @keyframes gr-sube { from { opacity: 0; transform: translateY(32px); } to { opacity: 1; transform: none; } }
    @keyframes gr-aparece { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
    .gr-velo { animation: gr-velo 180ms ease-out both; }
    .gr-hoja { animation: gr-sube 260ms var(--ease-out-soft) both; }
    @media (min-width: 768px) { .gr-hoja { animation-name: gr-aparece; } }
    @media (prefers-reduced-motion: reduce) { .gr-velo, .gr-hoja { animation: none; } }
  `,
  template: `
    @if (fan.accesoAbierto()) {
      <div class="gr-velo fixed inset-0 z-[70] flex items-end justify-center bg-black/65 backdrop-blur-[2px] md:items-center md:px-4" (click)="cerrar()" (keydown.escape)="cerrar()">
        <div class="gr-hoja relative max-h-[92dvh] w-full overflow-y-auto overscroll-contain rounded-t-xl border border-line-strong bg-bg-card bg-[linear-gradient(180deg,rgb(110_20_32/0.5),transparent_240px)] px-5 pt-2.5 pb-7 shadow-card md:max-w-[440px] md:rounded-xl md:p-6"
          role="dialog" aria-modal="true" aria-labelledby="acceso-titulo" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <span class="mx-auto mb-4 block h-1 w-10 rounded-full bg-line-strong md:hidden" aria-hidden="true"></span>
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <h2 id="acceso-titulo" class="font-display text-[24px] leading-tight uppercase italic">{{ titulo() }}</h2>
              <p class="mt-1.5 text-body-s text-text-secondary">{{ subtitulo() }}</p>
            </div>
            <button type="button" class="flex size-10 shrink-0 items-center justify-center rounded-full border border-line-subtle bg-bg-raised text-text-secondary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar()"><gr-icon name="x" [size]="16" /></button>
          </div>

          @switch (estado()) {
            @case ('enviado') {
              <div class="mt-5 flex flex-col items-center gap-2.5 rounded-lg border border-line-subtle bg-bg-surface px-4 py-5 text-center">
                <span class="flex size-14 items-center justify-center rounded-full bg-accent-grain text-white shadow-glow"><gr-icon name="mail" [size]="24" /></span>
                <p class="text-label-s break-all text-text-primary">Enviado a {{ email() }}</p>
                <p class="text-body-s text-text-secondary">{{ fan.destino() ? 'Puedes abrirlo en otro dispositivo: te lleva igualmente a la sala.' : 'Ábrelo en este dispositivo para entrar como ' + (tipo() === 'atleta' ? 'ATLETA' : 'PÚBLICO') + '.' }}</p>
              </div>
              <ol class="mt-4 flex flex-col gap-2.5">
                @for (p of pasos(); track p; let i = $index) {
                  <li class="flex items-center gap-2.5 text-body-s text-text-secondary"><span class="flex size-6 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-accent/18 text-[12px] font-medium text-accent-text">{{ i + 1 }}</span>{{ p }}</li>
                }
              </ol>
              <div class="mt-5 flex flex-col gap-2">
                <button type="button" grButton variant="primary" size="l" [block]="true" (click)="cerrar()">Ya lo he abierto</button>
                <button type="button" grButton variant="outline" [block]="true" (click)="volver()">Usar otro email</button>
              </div>
              <p class="mt-3 flex items-center justify-center gap-1.5 text-center text-body-xs text-text-tertiary"><gr-icon name="clock" [size]="12" />El enlace caduca en 30 min · máx. 5 enlaces por hora</p>
            }
            @case ('atleta') {
              <div class="mt-5 flex items-start gap-3 rounded-md border border-accent/50 bg-accent-deep/30 p-3" role="alert">
                <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent-text"><gr-icon name="circle-alert" [size]="16" /></span>
                <div class="min-w-0">
                  <p class="text-label-s text-accent-text">{{ error() || 'No encontramos ningún atleta inscrito con ese email' }}</p>
                  <p class="mt-0.5 text-body-xs text-text-secondary">Usa el email de tu inscripción en la AEP o entra como público: podrás chatear igual.</p>
                </div>
              </div>
              <label class="mt-4 block">
                <span class="text-label-s text-text-primary">Email con el que te inscribiste en la AEP *</span>
                <input grInput type="email" autocomplete="email" class="mt-1.5" placeholder="carlos@otroclub.com" aria-label="Email de inscripción" [invalid]="true" [ngModel]="email()" (ngModelChange)="email.set($event)" />
                <span class="mt-1.5 block text-body-xs text-text-tertiary">La insignia «Atleta» solo se acredita con el email de inscripción.</span>
              </label>
              <div class="mt-5 flex flex-col gap-2">
                <button type="button" grButton variant="primary" size="l" [block]="true" [loading]="enviando()" (click)="entrarComoPublico()">Entrar como público</button>
                <button type="button" grButton variant="outline" [block]="true" (click)="estado.set('formulario')">Reintentar como atleta</button>
              </div>
            }
            @default {
              <ul class="mt-4 flex flex-wrap gap-1.5" aria-label="Cómo funciona">
                @for (g of garantias; track g.t) {
                  <li class="inline-flex h-6 items-center gap-1.5 rounded-pill border border-line-subtle bg-bg-raised pr-2 pl-1.5 font-mono text-[11px] tracking-[0.08em] text-text-secondary uppercase"><gr-icon [name]="g.i" [size]="12" class="text-success" />{{ g.t }}</li>
                }
              </ul>

              <!-- atleta o público -->
              <p class="mt-5 text-label-s text-text-primary" id="acceso-tipo">¿Cómo entras?</p>
              <div class="mt-2 grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="acceso-tipo">
                @for (o of tipos; track o.v) {
                  <button type="button" role="radio" [attr.aria-checked]="tipo() === o.v" class="flex flex-col gap-1.5 rounded-md border p-3 text-left transition-[border-color,background]"
                    [class]="tipo() === o.v ? 'border-accent bg-accent-deep/28 ring-1 ring-accent/40' : 'border-line-strong bg-bg-surface hover:border-text-muted'" (click)="tipo.set(o.v)">
                    <span class="flex w-full items-center gap-2">
                      <span class="flex size-7 shrink-0 items-center justify-center rounded-full" [class]="tipo() === o.v ? 'bg-accent/25 text-accent-text' : 'bg-bg-raised text-text-secondary'"><gr-icon [name]="o.i" [size]="14" /></span>
                      <span class="flex-1 text-label-s text-text-primary">{{ o.l }}</span>
                      <span class="size-[18px] shrink-0 rounded-full" [class]="tipo() === o.v ? 'border-[5px] border-accent' : 'border-[1.5px] border-line-strong'" aria-hidden="true"></span>
                    </span>
                    <span class="text-body-xs text-text-tertiary">{{ o.d }}</span>
                  </button>
                }
              </div>

              <label class="mt-4 block">
                <span class="text-label-s text-text-primary">Alias *</span>
                <input grInput type="text" autocomplete="nickname" class="mt-1.5" placeholder="tu alias en el directo" aria-label="Alias" [invalid]="!!errorAlias()" [ngModel]="alias()" (ngModelChange)="alias.set($event)" />
                @if (errorAlias(); as e) { <span class="mt-1.5 flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ e }}</span> }
                @else { <span class="mt-1.5 block text-body-xs text-text-tertiary">3–20 caracteres: letras, números, espacios o _ . -</span> }
              </label>

              <label class="mt-4 block">
                <span class="text-label-s text-text-primary">{{ tipo() === 'atleta' ? 'Email con el que te inscribiste en la AEP *' : 'Email *' }}</span>
                <input grInput type="email" autocomplete="email" class="mt-1.5" placeholder="email@ejemplo.com" aria-label="Email" [invalid]="!!error()" [ngModel]="email()" (ngModelChange)="email.set($event)" />
                @if (error(); as e) { <span class="mt-1.5 flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ e }}</span> }
                @else { <span class="mt-1.5 block text-body-xs text-text-tertiary">Te enviaremos un enlace mágico para entrar.</span> }
              </label>

              <label class="mt-3 flex min-h-11 cursor-pointer items-center gap-3">
                <input type="checkbox" class="size-5 shrink-0 accent-[#c42b3e]" [ngModel]="normas()" (ngModelChange)="normas.set($event)" />
                <span class="text-body-s text-text-secondary">Acepto las normas del chat: sin enlaces, sin insultos, sin spam.</span>
              </label>

              <button type="button" grButton variant="primary" size="l" [block]="true" class="mt-4" [loading]="enviando()" [disabled]="!puedeEnviar()" (click)="enviar()">Enviarme el enlace</button>
              <p class="mt-3 flex items-center justify-center gap-1.5 text-center text-body-xs text-text-tertiary"><gr-icon name="lock" [size]="12" />Sin contraseñas · el enlace caduca en 30 min</p>
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

  protected readonly garantias: { i: GrIconName; t: string }[] = [
    { i: 'check', t: 'Gratis' },
    { i: 'key', t: 'Sin contraseña' },
    { i: 'clock', t: '1 minuto' },
  ];
  protected readonly tipos: { v: 'atleta' | 'publico'; l: string; d: string; i: GrIconName }[] = [
    { v: 'atleta', l: 'Atleta', d: 'Insignia ATLETA con tu email de la AEP', i: 'trophy' },
    { v: 'publico', l: 'Público', d: 'Familia, clubs y afición', i: 'users' },
  ];
  /** With a saved destination (an invitation to a fantasy room) the link brings the fan back there, on any device. */
  protected readonly pasos = computed(() => ['Abre el email de GR Strength Cup', 'Pulsa «Entrar al directo»', this.fan.destino() ? 'Vuelves a la sala con tu alias' : 'Vuelves al chat con tu alias']);

  protected readonly titulo = computed(() => (this.estado() === 'enviado' ? 'Revisa tu correo' : this.estado() === 'atleta' ? 'Entrar como atleta' : 'Entrar al directo'));
  protected readonly subtitulo = computed(() => {
    if (this.estado() === 'enviado') return 'Te hemos enviado un enlace mágico para entrar.';
    if (this.estado() === 'atleta') return 'Comprobamos tu email contra la inscripción de la AEP.';
    return 'Chatea, dona y juega con tu cuenta de directo.';
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

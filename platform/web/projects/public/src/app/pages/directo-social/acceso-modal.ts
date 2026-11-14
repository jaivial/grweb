import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GrButton, GrIcon, GrInput, type GrIconName } from '@grcup/ui';
import { FanSession, codigoError, detalleError } from '../../core/fan';

type Estado = 'formulario' | 'enviado' | 'atleta';
type Modo = 'entrar' | 'crear' | 'recuperar';

/**
 * Modal global de acceso (Figma 70): «Entrar» con email y contraseña, o «Crear cuenta» (atleta o público, alias, email y
 * contraseña), que manda un enlace para verificar el email; al canjearlo queda fijada la contraseña. El título depende
 * del motivo con que se abre (porra, fantasy, chat, donar…).
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
                <input grInput grSize="l" type="email" autocomplete="email" class="mt-1.5" placeholder="carlos@otroclub.com" aria-label="Email de inscripción" [invalid]="true" [ngModel]="email()" (ngModelChange)="email.set($event)" />
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

              @if (modo() !== 'recuperar') {
              <div class="mt-5 grid grid-cols-2 gap-1 rounded-md border border-line-subtle bg-bg-surface p-1" role="tablist" aria-label="Entrar o crear cuenta">
                @for (m of modos; track m.v) {
                  <button type="button" role="tab" [attr.aria-selected]="modo() === m.v" class="min-h-11 rounded-sm text-label-s transition-colors"
                    [class]="modo() === m.v ? 'bg-bg-raised text-text-primary shadow-card' : 'text-text-secondary hover:text-text-primary'" (click)="cambiarModo(m.v)">{{ m.l }}</button>
                }
              </div>
              }

              @if (modo() === 'crear') {
              <!-- atleta o público -->
              @if (!inscripcion()) {
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
              }

              <label class="mt-4 block">
                <span class="text-label-s text-text-primary">Alias *</span>
                <input grInput grSize="l" type="text" autocomplete="nickname" class="mt-1.5" placeholder="tu alias en el directo" aria-label="Alias" [invalid]="!!errorAlias()" [ngModel]="alias()" (ngModelChange)="alias.set($event)" />
                @if (errorAlias(); as e) { <span class="mt-1.5 flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ e }}</span> }
                @else { <span class="mt-1.5 block text-body-xs text-text-tertiary">3–20 caracteres: letras, números, espacios o _ . -</span> }
              </label>
              }

              <label class="mt-4 block">
                <span class="text-label-s text-text-primary">{{ modo() === 'crear' && tipo() === 'atleta' ? 'Email con el que te inscribiste en la AEP *' : 'Email *' }}</span>
                <input grInput grSize="l" type="email" autocomplete="email" class="mt-1.5" placeholder="email@ejemplo.com" aria-label="Email" [invalid]="!!error()" [ngModel]="email()" (ngModelChange)="email.set($event)" />
                @if (error(); as e) { <span class="mt-1.5 flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ e }}</span> }
                @else if (modo() !== 'entrar') { <span class="mt-1.5 block text-body-xs text-text-tertiary">Te enviaremos un enlace para verificar tu email.</span> }
              </label>

              <label class="mt-4 block">
                <span class="text-label-s text-text-primary">{{ modo() === 'recuperar' ? 'Nueva contraseña *' : 'Contraseña *' }}</span>
                <span class="relative mt-1.5 block">
                  <input grInput grSize="l" [type]="verClave() ? 'text' : 'password'" [attr.autocomplete]="modo() === 'entrar' ? 'current-password' : 'new-password'" class="pr-24" placeholder="••••••••" aria-label="Contraseña" [invalid]="!!errorClave()" [ngModel]="clave()" (ngModelChange)="clave.set($event)" (keydown.enter)="enviar()" />
                  <button type="button" class="absolute inset-y-0 right-1 my-auto flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-body-xs text-text-secondary hover:text-text-primary" [attr.aria-pressed]="verClave()" (click)="verClave.set(!verClave())"><gr-icon name="eye" [size]="14" />{{ verClave() ? 'Ocultar' : 'Mostrar' }}</button>
                </span>
                @if (errorClave(); as e) { <span class="mt-1.5 flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />{{ e }}</span> }
                @else if (modo() !== 'entrar') { <span class="mt-1.5 block text-body-xs text-text-tertiary">Mínimo 8 caracteres. Queda guardada cifrada al abrir el enlace.</span> }
              </label>
              @if (modo() === 'entrar') {
                <button type="button" class="mt-2 min-h-11 text-body-s text-accent-text underline-offset-4 hover:underline" (click)="cambiarModo('recuperar')">¿Has olvidado tu contraseña?</button>
              }

              @if (modo() === 'crear') {
              <label class="mt-3 flex min-h-11 cursor-pointer items-center gap-3">
                <input type="checkbox" class="size-5 shrink-0 accent-[#c42b3e]" [ngModel]="normas()" (ngModelChange)="normas.set($event)" />
                <span class="text-body-s text-text-secondary">{{ inscripcion() || entradas() || seguir() || formulario() ? 'Acepto las normas de participación de GR Strength Cup.' : 'Acepto las normas del chat: sin enlaces, sin insultos, sin spam.' }}</span>
              </label>
              @if (errorNormas()) { <span class="mt-1 flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="13" />Marca la casilla para continuar.</span> }
              }

              <button type="button" grButton variant="primary" size="l" [block]="true" class="mt-4" [loading]="enviando()" (click)="enviar()">{{ modo() === 'entrar' ? 'Entrar' : modo() === 'crear' ? 'Crear cuenta' : 'Enviarme el enlace' }}</button>
              @if (modo() === 'recuperar') {
                <button type="button" grButton variant="outline" [block]="true" class="mt-2" (click)="cambiarModo('entrar')">Volver a entrar</button>
              }
              <p class="mt-3 flex items-center justify-center gap-1.5 text-center text-body-xs text-text-tertiary"><gr-icon name="lock" [size]="12" />{{ modo() === 'entrar' ? 'Contraseña cifrada · sesión de 30 días' : 'Verificamos tu email · el enlace caduca en 30 min' }}</p>
            }
          }
        </div>
      </div>
    }
  `,
})
export class AccesoModal {
  protected readonly fan = inject(FanSession);

  private readonly router = inject(Router);
  protected readonly estado = signal<Estado>('formulario');
  protected readonly modo = signal<Modo>('entrar');
  protected readonly clave = signal('');
  protected readonly verClave = signal(false);
  protected readonly errorClave = signal<string | null>(null);
  protected readonly tipo = signal<'atleta' | 'publico'>('publico');
  protected readonly alias = signal('');
  protected readonly email = signal('');
  protected readonly normas = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly errorAlias = signal<string | null>(null);
  protected readonly errorNormas = signal(false);
  protected readonly enviando = signal(false);

  protected readonly garantias: { i: GrIconName; t: string }[] = [
    { i: 'check', t: 'Gratis' },
    { i: 'clock', t: '1 minuto' },
  ];
  protected readonly tipos: { v: 'atleta' | 'publico'; l: string; d: string; i: GrIconName }[] = [
    { v: 'atleta', l: 'Atleta', d: 'Insignia ATLETA con tu email de la AEP', i: 'trophy' },
    { v: 'publico', l: 'Público', d: 'Familia, clubs y afición', i: 'users' },
  ];
  protected readonly modos: { v: Modo; l: string }[] = [
    { v: 'entrar', l: 'Entrar' },
    { v: 'crear', l: 'Crear cuenta' },
  ];
  /** Title and subtitle of each place that opens the modal (motivo of `abrirAcceso`). */
  private readonly textos: Record<string, [string, string]> = {
    porra: ['Entra para jugar a la porra', 'Apuesta en la porra del directo con tu cuenta de GRS Cup.'],
    fantasy: ['Entra para jugar al GRS Fantasy', 'Crea tu equipo y compite en salas con tu cuenta de GRS Cup.'],
    chat: ['Entra al chat del directo', 'Chatea con el público y los atletas durante el directo.'],
    donar: ['Entra para donar', 'Tu donación aparece con tu alias en el directo.'],
  };
  protected readonly inscripcion = computed(() => this.fan.motivoAcceso() === 'inscripcion');
  protected readonly entradas = computed(() => this.fan.motivoAcceso() === 'entradas');
  protected readonly seguir = computed(() => this.fan.motivoAcceso() === 'seguir');
  protected readonly formulario = computed(() => this.fan.motivoAcceso() === 'formulario');
  protected readonly pasos = computed(() => ['Abre el email de GR Strength Cup',
    ...(this.inscripcion() ? ['Pulsa «Continuar la inscripción»', 'Vuelves al formulario de inscripción'] : this.entradas() ? ['Pulsa el enlace del email', 'Vuelves a tu reserva con lo que ya has rellenado']
      : this.seguir() ? ['Pulsa el enlace del email', 'Vuelves a la ficha y le sigues sin repetir nada'] : this.formulario() ? ['Pulsa el enlace del email', 'Vuelves al formulario y lo envías'] : ['Pulsa «Entrar al directo»', this.fan.destino() ? 'Vuelves a la sala con tu alias' : 'Vuelves al chat con tu alias'])]);

  protected readonly titulo = computed(() => (this.estado() === 'enviado' ? 'Revisa tu correo' : this.estado() === 'atleta' ? 'Entrar como atleta' : this.modo() === 'recuperar' ? 'Crea o cambia tu contraseña'
    : this.textos[this.fan.motivoAcceso() ?? '']?.[0] ?? this.inscripcion() ? 'Entra para inscribirte' : this.entradas() ? 'Entra para reservar' : this.seguir() ? 'Entra para seguir al atleta' : this.formulario() ? 'Entra para enviar la solicitud' : 'Entrar al directo'));
  protected readonly subtitulo = computed(() => {
    if (this.estado() === 'enviado') return this.modo() === 'recuperar' ? 'Abre el enlace para guardar tu nueva contraseña.' : 'Abre el enlace para verificar tu email y activar tu cuenta.';
    if (this.modo() === 'recuperar') return 'Te enviamos un enlace a tu email: al abrirlo queda guardada la contraseña nueva. Sirve también para cuentas antiguas sin contraseña.';
    if (this.estado() === 'atleta') return 'Comprobamos tu email contra la inscripción de la AEP.';
    return this.inscripcion() ? 'Necesitas tu cuenta de GR Strength Cup para inscribirte. Vuelves al formulario con lo que ya has rellenado.' : this.entradas() ? 'Tu entrada va asociada a tu cuenta de GR Strength Cup. Vuelves a la reserva con lo que ya has rellenado.'
      : this.formulario() ? 'La solicitud va asociada a tu cuenta de GR Strength Cup. Vuelves al formulario para enviarla.'
      : this.seguir() ? 'Sigue a tus atletas con tu cuenta de GR Strength Cup: te avisamos por email antes de que compitan.' : this.textos[this.fan.motivoAcceso() ?? '']?.[1] ?? 'Chatea, dona y juega con tu cuenta de directo.';
  });
  protected readonly puedeEnviar = computed(() => this.email().includes('@') && (this.modo() === 'entrar' ? this.clave().length > 0 : this.clave().length >= 8)
    && (this.modo() !== 'crear' || (this.alias().trim().length >= 3 && this.alias().trim().length <= 20 && this.normas())));

  constructor() {
    // The modal opens on every request of access: it always starts clean.
    effect(() => {
      if (!this.fan.accesoAbierto()) return;
      this.estado.set('formulario');
      this.modo.set('entrar');
      this.clave.set('');
      this.verClave.set(false);
      this.errorClave.set(null);
      // Always preselect «Público» (U10-R2-2); registering has no athlete yet, so it stays público.
      this.tipo.set('publico');
      if (this.fan.emailAcceso()) this.email.set(this.fan.emailAcceso());
      this.error.set(null);
      this.errorAlias.set(null);
      this.errorNormas.set(false);
    });
  }

  protected cerrar(): void {
    this.fan.cerrarAcceso();
  }

  protected cambiarModo(m: Modo): void {
    this.modo.set(m);
    this.clave.set('');
    this.error.set(null);
    this.errorAlias.set(null);
    this.errorClave.set(null);
    this.errorNormas.set(false);
  }

  protected volver(): void {
    this.estado.set('formulario');
    this.email.set('');
    this.error.set(null);
  }

  protected async enviar(): Promise<void> {
    if (this.enviando()) return;
    if (!this.puedeEnviar()) {
      // Field errors instead of a silent no-op (U10-R2-2).
      const crear = this.modo() === 'crear';
      const a = this.alias().trim().length;
      this.errorAlias.set(crear && (a < 3 || a > 20) ? 'El alias debe tener entre 3 y 20 caracteres.' : null);
      this.error.set(this.email().includes('@') ? null : 'Escribe un email válido.');
      const c = this.clave().length;
      this.errorClave.set(c === 0 ? 'Escribe tu contraseña.' : this.modo() !== 'entrar' && c < 8 ? 'La contraseña debe tener al menos 8 caracteres.' : null);
      this.errorNormas.set(crear && !this.normas());
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    this.errorAlias.set(null);
    this.errorClave.set(null);
    this.errorNormas.set(false);
    try {
      if (this.modo() === 'entrar') {
        await this.fan.entrar(this.email().trim(), this.clave());
        const volverA = this.fan.volverA();
        this.cerrar();
        if (volverA && volverA !== this.router.url) await this.router.navigateByUrl(volverA);
        return;
      }
      const crear = this.modo() === 'crear';
      await this.fan.pedirAcceso({ email: this.email().trim(), password: this.clave(), tipo: crear ? this.tipo() : 'publico', alias: crear ? this.alias().trim() : '',
        aceptaNormas: crear && this.normas(), next: this.fan.volverA() ?? undefined });
      this.estado.set('enviado');
    } catch (e) {
      const codigo = codigoError(e);
      if (codigo === 'CREDENCIALES_INVALIDAS') this.errorClave.set(detalleError(e));
      else if (codigo === 'ALIAS_NO_VALIDO' || codigo === 'ALIAS_OCUPADO') this.errorAlias.set(detalleError(e));
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

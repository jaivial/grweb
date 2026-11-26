import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, output, signal } from '@angular/core';
import { GrAlert, GrButton, GrIcon, GrSkeleton, GrToasts } from '@grcup/ui';
import { Competitions } from '../../core/competitions';
import { BoToggleRow } from '../../shared/kit';
import { errText } from '../../shared/ui';
import { AtletasApi, type PerfilExisteIn, type PerfilExisteOut } from './api';

/**
 * «Enviar acceso al perfil» (Figma «BO · Atletas · Enviar acceso al perfil»): email «Tu perfil de atleta en la GRS Cup 2
 * ya existe» with the athlete's email and a NEW initial password (first name + 4 digits, temporary: the area asks to
 * change it). From the selection of the list, the «Acciones» panel (all athletes) or the athlete's page. It first
 * counts (simular) and shows who is skipped: already notified, own password, minors (excluded by default). The
 * password never comes back to the backoffice.
 */
@Component({
  selector: 'bo-perfil-existe',
  imports: [A11yModule, BoToggleRow, GrAlert, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="cerrar.emit()" (keydown.escape)="cerrar.emit()">
      <div class="flex max-h-[90dvh] w-full max-w-[560px] flex-col overflow-y-auto rounded-xl border border-line-strong bg-bg-card p-6 shadow-card" role="dialog" aria-modal="true" aria-labelledby="pe-titulo"
        cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
        <div class="flex items-start justify-between gap-3">
          <h2 id="pe-titulo" class="text-[20px] leading-[26px] font-semibold">Enviar acceso al perfil {{ destino() }}</h2>
          <button type="button" class="-mt-2 -mr-2 flex size-11 items-center justify-center text-text-tertiary hover:text-text-primary" aria-label="Cerrar" (click)="cerrar.emit()"><gr-icon name="x" [size]="18" /></button>
        </div>
        <p class="mt-3 text-body-s text-text-secondary">Cada atleta recibe el email «&#123;nombre&#125;, bienvenido a la GRS Cup 2» con su email y una contraseña inicial nueva (nombre + 4 cifras, p. ej. jaime4589). Es temporal: al entrar por primera vez su área le pide una nueva de al menos 10 caracteres.</p>

        <div class="mt-4 flex flex-col gap-2 rounded-md border border-line-subtle bg-bg-surface p-4" aria-live="polite">
          @if (cuenta(); as c) {
            <p class="text-label-m text-text-primary">{{ c.enviables }} {{ c.enviables === 1 ? 'atleta lo recibirá' : 'atletas lo recibirán' }}</p>
            <ul class="flex flex-col gap-1 text-body-xs text-text-secondary">
              @if (c.yaEnviados) { <li>{{ c.yaEnviados }} ya lo recibieron: no se reenvía ni cambia su contraseña.</li> }
              @if (c.conContrasena) { <li>{{ c.conContrasena }} ya tienen su propia contraseña: no se cambia.</li> }
              @if (c.sinEmail) { <li>{{ c.sinEmail }} sin email: no se les puede enviar.</li> }
              @if (c.menoresIncluidos) { <li>{{ c.menoresIncluidos }} menores incluidos.</li> }
            </ul>
          } @else if (error()) {
            <p class="text-body-s text-error">{{ error() }}</p>
          } @else {
            <gr-skeleton class="h-5 w-48" /><gr-skeleton class="h-4 w-64" />
          }
        </div>

        @if (cuenta()?.menores; as n) {
          <gr-alert class="mt-4" tone="warning" [title]="n + (n === 1 ? ' menor excluido' : ' menores excluidos') + ' (sub-júnior)'">
            {{ cuenta()!.menoresNombres.join(' · ') }}. Por defecto no se les envía: la cuenta de un menor necesita la autorización firmada de su madre, padre o tutor.
          </gr-alert>
        }

        <div class="mt-4 flex flex-col gap-1">
          <bo-toggle-row label="También por WhatsApp" description="A quien tenga teléfono (si «WhatsApp al atleta» está activo)" [value]="op().whatsapp" (valueChange)="cambiar({ whatsapp: $event })" />
          <bo-toggle-row label="Incluir menores" description="Solo si ya tienes la autorización de su tutor" [value]="op().incluirMenores" (valueChange)="cambiar({ incluirMenores: $event })" />
          <bo-toggle-row label="Reenviar a quien ya lo recibió o ya tiene contraseña" description="Se les genera una contraseña nueva y la anterior deja de valer" [value]="op().reenviar" (valueChange)="cambiar({ reenviar: $event })" />
        </div>
        <div class="mt-6 flex justify-end gap-2">
          <button type="button" grButton variant="ghost" (click)="cerrar.emit()">Cancelar</button>
          <button type="button" grButton variant="primary" icon="send" [loading]="busy()" [disabled]="!cuenta()?.enviables" (click)="enviar()">Enviar a {{ cuenta()?.enviables ?? 0 }}</button>
        </div>
      </div>
    </div>
  `,
})
export class PerfilExisteDialogo implements OnInit {
  /** Athletes to send it to; empty with «todos» = every athlete with email. */
  readonly ids = input<string[]>([]);
  readonly todos = input(false);
  readonly nombre = input('');
  readonly cerrar = output<void>();
  readonly enviado = output<void>();
  private readonly api = inject(AtletasApi);
  private readonly comps = inject(Competitions);
  private readonly toasts = inject(GrToasts);
  protected readonly op = signal({ whatsapp: false, incluirMenores: false, reenviar: false });
  protected readonly cuenta = signal<PerfilExisteOut | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  ngOnInit(): void {
    void this.contar();
  }

  protected destino(): string {
    if (this.todos()) return 'a todos los atletas';
    const n = this.ids().length;
    return n === 1 && this.nombre() ? 'a ' + this.nombre() : `a ${n} atleta${n === 1 ? '' : 's'}`;
  }

  private body(simular: boolean): PerfilExisteIn {
    return { ...(this.todos() ? { todos: true } : { ids: this.ids() }), ...this.op(), simular };
  }

  protected cambiar(p: Partial<{ whatsapp: boolean; incluirMenores: boolean; reenviar: boolean }>): void {
    this.op.update((o) => ({ ...o, ...p }));
    void this.contar();
  }

  private async contar(): Promise<void> {
    const cid = this.comps.current()?.id;
    if (!cid) return;
    this.cuenta.set(null);
    this.error.set('');
    try {
      this.cuenta.set(await this.api.perfilExiste(cid, this.body(true)));
    } catch (e) {
      this.error.set(errText(e, 'No se pudo calcular a quién se envía.'));
    }
  }

  protected async enviar(): Promise<void> {
    const cid = this.comps.current()?.id;
    if (!cid) return;
    this.busy.set(true);
    try {
      const r = await this.api.perfilExiste(cid, this.body(false));
      const extra = [r.yaEnviados && `${r.yaEnviados} ya enviados`, r.menores && `${r.menores} menores excluidos`, r.sinEmail && `${r.sinEmail} sin email`].filter(Boolean).join(' · ');
      this.toasts.success('Acceso al perfil enviado', `${r.emails} email${r.emails === 1 ? '' : 's'} y ${r.whatsapps} WhatsApp${extra ? ' · ' + extra : ''}.`);
      this.enviado.emit();
    } catch (e) {
      this.toasts.error('No se pudo enviar', errText(e));
    } finally {
      this.busy.set(false);
    }
  }
}

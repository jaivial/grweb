import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrIcon, GrSkeleton, GrToasts, fmtNumber } from '@grcup/ui';
import { TimeoutError } from 'rxjs';
import { Competitions } from '../../core/competitions';
import { problemOf, type Problem } from '../../core/api';
import { BoCheckbox } from '../../shared/kit';
import { Confirm, errText } from '../../shared/ui';
import { nuevoUuid } from '../../shared/uuid';
import { FormulariosApi, type Audiencia, type CanalFormulario, type Envio, type Filtro, type Formulario } from './api';

type Estado = 'confirmado' | 'reserva';
const ESTADOS: { v: Estado; label: string }[] = [
  { v: 'confirmado', label: 'Confirmados' },
  { v: 'reserva', label: 'En reserva' },
];
const DEBOUNCE_MS = 300;
const COLA_RITMO = 'Los mensajes entran en la Cola de envío y salen al ritmo anti-spam: WhatsApp 1 cada 30–60 s, 40/h, 150/día, nunca de 22:00 a 09:00.';
const hora = (iso: string): string => (iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '');

/**
 * «Nuevo envío» dialog: channels, filter and a live audience (per channel). Confirms before creating the send: the
 * messages then wait in the Cola de envío. Emits `enviado` with the created send; the parent reloads its table.
 */
@Component({
  selector: 'bo-envio-dialogo',
  imports: [A11yModule, RouterLink, BoCheckbox, GrAlert, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" (click)="alCerrar()" (keydown.escape)="alCerrar()">
      <div class="flex max-h-[90dvh] w-full max-w-[560px] flex-col gap-5 overflow-y-auto rounded-xl border border-line-strong bg-bg-card p-6 shadow-card"
        role="dialog" aria-modal="true" aria-labelledby="envio-titulo" cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <h2 id="envio-titulo" class="text-ui-h5">Nuevo envío</h2>
            <p class="mt-1 text-body-xs text-text-tertiary">«{{ formulario().nombre }}» · el enlace lleva a la web del formulario</p>
          </div>
          <button type="button" class="-m-1 rounded-xs p-1 text-text-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_rgb(230_96_107/0.9)]" aria-label="Cerrar" (click)="alCerrar()"><gr-icon name="x" [size]="18" /></button>
        </div>

        <fieldset class="flex flex-col gap-1">
          <legend class="mb-1 text-label-s text-text-secondary">Canales</legend>
          <div class="flex flex-col gap-1">
            <bo-checkbox label="Email" [value]="email()" (valueChange)="email.set($event === true)" />
            @if (formulario().soloWeb) { <p class="pl-7 text-body-xs text-text-tertiary">El email lleva solo el botón a la web (el formulario tiene archivos).</p> }
            <bo-checkbox label="WhatsApp" [value]="whatsapp()" (valueChange)="whatsapp.set($event === true)" />
            <p class="pl-7 text-body-xs text-text-tertiary">Solo con consentimiento: sin consentimiento de WhatsApp no se envía.</p>
          </div>
        </fieldset>

        <fieldset class="flex flex-col gap-1">
          <legend class="mb-1 text-label-s text-text-secondary">A quién</legend>
          <div class="flex flex-wrap gap-x-6 gap-y-1">
            @for (e of estados; track e.v) {
              <bo-checkbox [label]="e.label" [value]="tiene(e.v)" (valueChange)="marcarEstado(e.v, $event === true)" />
            }
          </div>
          <bo-checkbox class="mt-1" label="Solo a quien no ha respondido" [value]="soloSinResponder()" (valueChange)="soloSinResponder.set($event === true); actualizarAudiencia()" />
        </fieldset>

        <section class="rounded-md border border-line-subtle bg-bg-raised p-4" aria-labelledby="audiencia-titulo" aria-live="polite">
          <h3 id="audiencia-titulo" class="text-label-s text-text-secondary">Audiencia</h3>
          @if (audiencia(); as a) {
            <dl class="mt-2 grid grid-cols-3 gap-3">
              <div><dt class="text-body-xs text-text-tertiary">Total</dt><dd class="font-mono text-mono-l tabular-nums">{{ n(a.total) }}</dd></div>
              <div [class.opacity-40]="!email()"><dt class="text-body-xs text-text-tertiary">Email</dt><dd class="font-mono text-mono-l tabular-nums">{{ n(a.email) }}</dd></div>
              <div [class.opacity-40]="!whatsapp()"><dt class="text-body-xs text-text-tertiary">WhatsApp</dt><dd class="font-mono text-mono-l tabular-nums">{{ n(a.whatsapp) }}</dd></div>
            </dl>
          } @else if (audiencia() === null) {
            <p class="mt-2 text-body-s text-text-tertiary">No se ha podido calcular la audiencia.</p>
          } @else { <gr-skeleton class="mt-2 h-12 rounded-sm" /> }
        </section>

        <gr-alert tone="info" icon="clock" title="Ritmo anti-spam">
          {{ ritmo }}
          <a alertAction [routerLink]="['/', comps.current()?.slug, 'sistema', 'cola-envio']" class="mt-2 inline-flex h-9 items-center gap-1 text-label-s text-info">Ver la Cola de envío <gr-icon name="arrow-right" [size]="14" /></a>
        </gr-alert>

        @if (error()) { <gr-alert tone="danger" icon="circle-alert" title="No se ha podido crear el envío">{{ error() }}</gr-alert> }

        <div class="flex flex-wrap justify-end gap-2">
          <button type="button" grButton variant="ghost" (click)="alCerrar()">Cancelar</button>
          <button type="button" grButton variant="primary" icon="send" [loading]="enviando()" [disabled]="!puedeEnviar()" (click)="enviar()">Enviar</button>
        </div>
      </div>
    </div>
  `,
})
export class BoEnvioDialogo {
  readonly formulario = input.required<Formulario>();
  readonly cerrar = output<void>();
  readonly enviado = output<Envio>();
  protected readonly comps = inject(Competitions);
  private readonly api = inject(FormulariosApi);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(GrToasts);
  protected readonly estados = ESTADOS;
  protected readonly ritmo = COLA_RITMO;
  protected readonly n = fmtNumber;
  protected readonly email = signal(true);
  protected readonly whatsapp = signal(true);
  protected readonly soloSinResponder = signal(false);
  private readonly estadosSel = signal<Estado[]>(['confirmado', 'reserva']);
  /** undefined = loading, null = failed. */
  protected readonly audiencia = signal<Audiencia | null | undefined>(undefined);
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  /** At least one channel and one status: an empty filter would be ambiguous. */
  protected readonly puedeEnviar = computed(() => (this.email() || this.whatsapp()) && this.estadosSel().length > 0 && !this.enviando());
  private t: ReturnType<typeof setTimeout> | undefined;
  private seq = 0;
  /**
   * Idempotency-Key del envío en curso. Cambia cuando cambian los canales o el filtro (otro envío) y al reintentar tras
   * el aviso de duplicado; mientras no cambien, un reintento (doble clic, corte de red) reutiliza la misma clave.
   */
  private clave = nuevoUuid();
  /** Canales y filtro a los que corresponde la clave actual. */
  private claveFirma = '';

  constructor() {
    this.actualizarAudiencia();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.t));
  }

  protected tiene(e: Estado): boolean {
    return this.estadosSel().includes(e);
  }

  protected marcarEstado(e: Estado, on: boolean): void {
    const sig = this.estadosSel();
    const next = on ? [...sig.filter((x) => x !== e), e] : sig.filter((x) => x !== e);
    // Keep at least one status: unticking the last one is ignored.
    if (!next.length) return;
    this.estadosSel.set(next);
    this.actualizarAudiencia();
  }

  /** Debounced: the audience follows the filter without a request per click. */
  protected actualizarAudiencia(): void {
    clearTimeout(this.t);
    this.t = setTimeout(() => void this.cargarAudiencia(), DEBOUNCE_MS);
  }

  private filtro(): Filtro {
    return { estados: this.estadosSel(), soloSinResponder: this.soloSinResponder() };
  }

  private async cargarAudiencia(): Promise<Audiencia | null> {
    const mine = ++this.seq;
    try {
      const a = await this.api.audiencia(this.cid(), this.formulario().id, this.filtro());
      if (mine === this.seq) this.audiencia.set(a);
      return a;
    } catch {
      if (mine === this.seq) this.audiencia.set(null);
      return null;
    }
  }

  protected canales(): CanalFormulario[] {
    return [...(this.email() ? (['email'] as CanalFormulario[]) : []), ...(this.whatsapp() ? (['whatsapp'] as CanalFormulario[]) : [])];
  }

  /** Closing (backdrop, Escape, buttons) waits for a send in flight: its result must not go to a closed dialog. */
  protected alCerrar(): void {
    if (!this.enviando()) this.cerrar.emit();
  }

  protected async enviar(): Promise<void> {
    // Fresh count: the debounced audience may still be pending, so the confirmation asks for the current filter.
    clearTimeout(this.t);
    const a = await this.cargarAudiencia();
    const canales = this.canales();
    const filtro = this.filtro();
    const mensajes = a ? (this.email() ? a.email : 0) + (this.whatsapp() ? a.whatsapp : 0) : null;
    const ok = await this.confirm.ask({
      title: `¿Enviar «${this.formulario().nombre}»?`,
      text: mensajes === null ? 'Los mensajes entran en la Cola de envío y salen al ritmo anti-spam.'
        : `Se crearán ${this.n(mensajes)} mensajes (${this.n(this.email() ? a!.email : 0)} por email${this.whatsapp() ? ' · ' + this.n(a!.whatsapp) + ' por WhatsApp' : ''}). Entran en la Cola de envío y salen al ritmo anti-spam.`,
      confirm: 'Enviar',
    });
    if (!ok) return;
    // Otro envío (canales o filtro distintos) lleva otra clave: con la misma, el servidor respondería 422 CLAVE_REUTILIZADA.
    const firma = JSON.stringify([[...canales].sort(), [...(filtro.estados ?? [])].sort(), !!filtro.soloSinResponder]);
    if (firma !== this.claveFirma) {
      this.clave = nuevoUuid();
      this.claveFirma = firma;
    }
    await this.enviarCon(canales, filtro, false);
  }

  /** Crea el envío. `confirmado`: el usuario ya aceptó el aviso de envío duplicado (se envía con confirmarDuplicado). */
  private async enviarCon(canales: CanalFormulario[], filtro: Filtro, confirmado: boolean): Promise<void> {
    this.enviando.set(true);
    this.error.set('');
    let duplicadoA: string | null = null;
    try {
      const envio = await this.api.crearEnvio(this.cid(), this.formulario().id, { canales, filtro, confirmarDuplicado: confirmado }, this.clave);
      this.toasts.success('Envío creado', 'Los mensajes están en la Cola de envío');
      this.enviado.emit(envio);
    } catch (e) {
      const p = problemOf(e) as Problem & { createdAt?: string };
      if (p.code === 'ENVIO_DUPLICADO') {
        duplicadoA = p.createdAt ?? '';
      } else {
        // Clave reutilizada con otros canales o filtro: se renueva; el usuario vuelve a pulsar Enviar.
        if (p.code === 'CLAVE_REUTILIZADA') this.clave = nuevoUuid();
        this.error.set(this.textoError(e, p));
      }
    } finally {
      this.enviando.set(false);
    }
    // Fuera del try: el aviso de confirmación no debe quedar con el envío «en curso».
    if (duplicadoA !== null) await this.preguntarDuplicado(canales, filtro, duplicadoA);
  }

  /** 409 ENVIO_DUPLICADO: ya hay un envío igual hace menos de dos minutos. Se confirma antes de crear otro (clave nueva). */
  private async preguntarDuplicado(canales: CanalFormulario[], filtro: Filtro, creadoAt: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: '¿Enviar otra vez?',
      text: `Ya se ha creado un envío igual a las ${hora(creadoAt)}. ¿Quieres enviarlo otra vez?`,
      confirm: 'Enviar otra vez',
    });
    if (!ok) return;
    this.clave = nuevoUuid();
    await this.enviarCon(canales, filtro, true);
  }

  private textoError(e: unknown, p: Problem): string {
    if (e instanceof TimeoutError) return 'Tarda más de lo normal. Vuelve a pulsar Enviar: si ya se creó, no se duplicará.';
    if (p.code === 'CLAVE_REUTILIZADA') return 'Este envío ha cambiado mientras lo preparabas. Vuelve a pulsar Enviar para confirmarlo.';
    if (p.status === 409) return 'El formulario está cerrado y no admite envíos. Cámbialo a activo desde la cabecera para enviarlo.';
    return errText(e, 'Prueba de nuevo en unos segundos.');
  }
}

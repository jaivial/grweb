import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrField, GrIcon, GrInput, GrSegmented, GrSkeleton, GrToasts, fmtNumber } from '@grcup/ui';
import { TimeoutError } from 'rxjs';
import { Competitions } from '../../core/competitions';
import { problemOf, type Problem } from '../../core/api';
import { BoCheckbox } from '../../shared/kit';
import { Confirm, errText } from '../../shared/ui';
import { nuevoUuid } from '../../shared/uuid';
import { FormulariosApi, type AtletaCandidato, type Audiencia, type CanalFormulario, type Envio, type Filtro, type Formulario } from './api';

type Estado = 'confirmado' | 'reserva';
type Destinatarios = 'todos' | 'concretos';
const ESTADOS: { v: Estado; label: string }[] = [
  { v: 'confirmado', label: 'Confirmados' },
  { v: 'reserva', label: 'En reserva' },
];
const MODOS: { value: Destinatarios; label: string }[] = [
  { value: 'todos', label: 'Todos (por estado)' },
  { value: 'concretos', label: 'Atletas concretos' },
];
/** Tope de atletas elegidos a mano: más de esto se envía por filtro de estado. */
const MAX_ATLETAS = 500;
const DEBOUNCE_MS = 300;
const COLA_RITMO = 'Los mensajes entran en la Cola de envío y salen al ritmo anti-spam: WhatsApp 1 cada 30–60 s, 40/h, 150/día, nunca de 22:00 a 09:00.';
const hora = (iso: string): string => (iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '');
const nombreDe = (a: { nombre: string; apellidos: string }): string => `${a.nombre} ${a.apellidos}`.trim();
const NOTA_WHATSAPP = 'Solo con consentimiento: sin consentimiento de WhatsApp no se envía.';
/** Same text as the server's 503 WHATSAPP_NO_COMPROBADO (FORMULARIOS.md §4). */
const msgWaNoComprobado = 'No se ha podido comprobar WhatsApp. Inténtalo de nuevo o envía solo por email.';
/** Concrete mode without chosen athletes: WhatsApp has no recipients to check. */
const MOTIVO_SIN_ATLETAS = 'Elige al menos un atleta.';

/**
 * «Nuevo envío» dialog: channels, recipients (every athlete of a status, or chosen athletes) and a live audience (per
 * channel). Confirms before creating the send: the messages then wait in the Cola de envío. Emits `enviado` with the
 * created send; the parent reloads its table.
 */
@Component({
  selector: 'bo-envio-dialogo',
  imports: [A11yModule, RouterLink, BoCheckbox, GrAlert, GrButton, GrField, GrIcon, GrInput, GrSegmented, GrSkeleton],
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
            <bo-checkbox label="WhatsApp" [value]="whatsapp()" [disabled]="!waDisponible()" describedBy="motivo-whatsapp" (valueChange)="marcarWhatsapp($event === true)" />
            <p id="motivo-whatsapp" class="pl-7 text-body-xs" [class.text-warning]="!waDisponible()" [class.text-text-tertiary]="waDisponible()" data-motivo-whatsapp>{{ motivoWa() || notaWa }}</p>
          </div>
        </fieldset>

        <fieldset class="flex flex-col gap-3">
          <legend class="mb-1 text-label-s text-text-secondary">A quién</legend>
          <div class="flex flex-col gap-3">
            <gr-segmented [options]="modos" [value]="modo()" (valueChange)="cambiarModo($any($event))" label="Destinatarios" />

            @if (modo() === 'todos') {
              <div class="flex flex-wrap gap-x-6 gap-y-1">
                @for (e of estados; track e.v) {
                  <bo-checkbox [label]="e.label" [value]="tiene(e.v)" (valueChange)="marcarEstado(e.v, $event === true)" />
                }
              </div>
            } @else {
              <div class="flex flex-col gap-3">
                <gr-field label="Buscar atleta" hint="Por nombre, apellidos o club. Vacío = primeros 20">
                  <input grInput type="search" autocomplete="off" maxlength="80" [value]="q()" (input)="buscar($any($event.target).value)" />
                </gr-field>

                @if (elegidos().length) {
                  <ul class="flex flex-wrap gap-1.5" aria-label="Atletas elegidos">
                    @for (a of elegidos(); track a.id) {
                      <li class="inline-flex h-8 items-center gap-1 rounded-pill border border-line-strong bg-bg-raised pl-3 pr-1 text-body-xs">
                        <span class="max-w-[220px] truncate">{{ nombre(a) }}</span>
                        <button type="button" class="flex size-6 items-center justify-center rounded-pill text-text-tertiary hover:bg-bg-hover hover:text-text-primary" [attr.aria-label]="'Quitar a ' + nombre(a)" (click)="quitar(a.id)"><gr-icon name="x" [size]="12" /></button>
                      </li>
                    }
                  </ul>
                }

                <div class="flex flex-col rounded-sm border border-line-subtle" aria-live="polite">
                  @if (resultados() === undefined) {
                    <gr-skeleton class="m-2 h-24 rounded-sm" />
                  } @else if (resultados() === null) {
                    <div class="flex flex-wrap items-center justify-between gap-3 p-3">
                      <p class="text-body-s text-text-tertiary">No se ha podido buscar atletas. Inténtalo de nuevo.</p>
                      <button type="button" grButton variant="ghost" data-reintentar-busqueda (click)="reintentarBusqueda()">Reintentar</button>
                    </div>
                  } @else if (!resultados()!.length) {
                    <p class="p-3 text-body-s text-text-tertiary">Ningún atleta coincide con la búsqueda.</p>
                  } @else {
                    <ul class="max-h-60 divide-y divide-line-subtle overflow-y-auto" aria-label="Resultados de la búsqueda">
                      @for (a of resultados()!; track a.id) {
                        <li>
                          <button type="button" class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-raised disabled:opacity-40"
                            [attr.aria-pressed]="estaElegido(a.id)" [disabled]="!estaElegido(a.id) && elegidos().length >= MAX" (click)="alternarAtleta(a)">
                            <span class="flex size-4 shrink-0 items-center justify-center rounded-xs border" [class]="estaElegido(a.id) ? 'border-accent bg-accent text-white' : 'border-line-strong'" aria-hidden="true">
                              @if (estaElegido(a.id)) { <gr-icon name="check" [size]="12" /> }
                            </span>
                            <span class="min-w-0 flex-1">
                              <span class="block truncate text-label-s">{{ nombre(a) }}</span>
                              <span class="block truncate text-body-xs text-text-tertiary">{{ a.club || 'Sin club' }}</span>
                            </span>
                            <span class="flex shrink-0 items-center gap-2 text-text-tertiary">
                              <span class="flex items-center gap-1 text-body-xs" [class.opacity-30]="!a.email"><gr-icon name="mail" [size]="14" />{{ a.email ? 'Email' : 'Sin email' }}</span>
                              <span class="flex items-center gap-1 text-body-xs" [class.opacity-30]="!a.whatsapp"><gr-icon name="smartphone" [size]="14" />{{ a.whatsapp ? 'WhatsApp' : 'Sin WhatsApp' }}</span>
                            </span>
                          </button>
                        </li>
                      }
                    </ul>
                  }
                </div>
                <p class="font-mono text-mono-xs text-text-muted" data-contador-atletas>{{ elegidos().length }} / {{ MAX }} atletas elegidos</p>
              </div>
            }

            <bo-checkbox label="Solo a quien no ha respondido" [value]="soloSinResponder()" (valueChange)="soloSinResponder.set($event === true); actualizarAudiencia()" />
          </div>
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
  protected readonly modos = MODOS;
  protected readonly ritmo = COLA_RITMO;
  protected readonly MAX = MAX_ATLETAS;
  protected readonly n = fmtNumber;
  protected readonly nombre = nombreDe;
  protected readonly email = signal(true);
  /** WhatsApp starts unticked and disabled: it is only enabled once the audience answers that messaging has it available. */
  protected readonly whatsapp = signal(false);
  protected readonly soloSinResponder = signal(false);
  protected readonly modo = signal<Destinatarios>('todos');
  private readonly estadosSel = signal<Estado[]>(['confirmado', 'reserva']);
  /** Chosen athletes (mode «Atletas concretos»), kept as objects so the chips show their names. */
  protected readonly elegidos = signal<AtletaCandidato[]>([]);
  protected readonly q = signal('');
  /** undefined = loading, null = failed. */
  protected readonly resultados = signal<AtletaCandidato[] | null | undefined>(undefined);
  /** undefined = loading, null = failed. */
  protected readonly audiencia = signal<Audiencia | null | undefined>(undefined);
  /** WhatsApp availability from the last audience answer. undefined = not answered yet, null = could not be checked. */
  private readonly waEstado = signal<Pick<Audiencia, 'whatsappDisponible' | 'whatsappMotivo'> | null | undefined>(undefined);
  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly notaWa = NOTA_WHATSAPP;
  /** Concrete mode with no chips: there is no recipient to check WhatsApp for, so it is disabled at once (no waiting for the audience). */
  private readonly sinElegidos = computed(() => this.modo() === 'concretos' && !this.elegidos().length);
  protected readonly waDisponible = computed(() => !this.sinElegidos() && this.waEstado()?.whatsappDisponible === true);
  /** Why WhatsApp cannot be sent now (or that it is being checked); empty when it is available. */
  protected readonly motivoWa = computed(() => {
    if (this.sinElegidos()) return MOTIVO_SIN_ATLETAS;
    const w = this.waEstado();
    if (w === undefined) return 'Comprobando si WhatsApp está disponible…';
    if (w === null) return msgWaNoComprobado;
    return w.whatsappDisponible ? '' : w.whatsappMotivo || 'WhatsApp no está disponible ahora.';
  });
  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  /** At least one channel and a recipient set: an empty filter would be ambiguous. */
  protected readonly puedeEnviar = computed(() => {
    const hayDestinatarios = this.modo() === 'concretos' ? this.elegidos().length > 0 : this.estadosSel().length > 0;
    return (this.email() || this.whatsapp()) && hayDestinatarios && !this.enviando();
  });
  private t: ReturnType<typeof setTimeout> | undefined;
  private tBusqueda: ReturnType<typeof setTimeout> | undefined;
  private seq = 0;
  private seqBusqueda = 0;
  /**
   * Idempotency-Key del envío en curso. Cambia cuando cambian los canales o el filtro (otro envío) y al reintentar tras
   * el aviso de duplicado; mientras no cambien, un reintento (doble clic, corte de red) reutiliza la misma clave.
   */
  private clave = nuevoUuid();
  /** Canales y filtro a los que corresponde la clave actual. */
  private claveFirma = '';

  constructor() {
    this.actualizarAudiencia();
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.t);
      clearTimeout(this.tBusqueda);
    });
  }

  protected tiene(e: Estado): boolean {
    return this.estadosSel().includes(e);
  }

  protected estaElegido(id: string): boolean {
    return this.elegidos().some((a) => a.id === id);
  }

  protected marcarEstado(e: Estado, on: boolean): void {
    const sig = this.estadosSel();
    const next = on ? [...sig.filter((x) => x !== e), e] : sig.filter((x) => x !== e);
    // Keep at least one status: unticking the last one is ignored.
    if (!next.length) return;
    this.estadosSel.set(next);
    this.actualizarAudiencia();
  }

  /** WhatsApp cannot be ticked until the server says it is available. */
  protected marcarWhatsapp(on: boolean): void {
    if (on && !this.waDisponible()) return;
    this.whatsapp.set(on);
  }

  protected reintentarBusqueda(): void {
    this.resultados.set(undefined);
    void this.buscarAtletas();
  }

  protected cambiarModo(m: Destinatarios): void {
    if (m === this.modo()) return;
    this.modo.set(m);
    if (m === 'concretos' && this.resultados() === undefined) void this.buscarAtletas();
    this.actualizarAudiencia();
  }

  /** Search box: debounced, the list shows the latest answer only. */
  protected buscar(texto: string): void {
    this.q.set(texto);
    clearTimeout(this.tBusqueda);
    this.tBusqueda = setTimeout(() => void this.buscarAtletas(), DEBOUNCE_MS);
  }

  private async buscarAtletas(): Promise<void> {
    const mine = ++this.seqBusqueda;
    try {
      const r = await this.api.candidatos(this.cid(), this.formulario().id, this.q().trim(), 20);
      if (mine === this.seqBusqueda) this.resultados.set(r);
    } catch {
      if (mine === this.seqBusqueda) this.resultados.set(null);
    }
  }

  protected alternarAtleta(a: AtletaCandidato): void {
    const sel = this.elegidos();
    if (sel.some((x) => x.id === a.id)) {
      this.elegidos.set(sel.filter((x) => x.id !== a.id));
    } else {
      if (sel.length >= MAX_ATLETAS) return;
      this.elegidos.set([...sel, a]);
    }
    this.actualizarAudiencia();
  }

  protected quitar(id: string): void {
    this.elegidos.update((sel) => sel.filter((x) => x.id !== id));
    this.actualizarAudiencia();
  }

  /** Debounced: the audience follows the filter without a request per click. */
  protected actualizarAudiencia(): void {
    clearTimeout(this.t);
    this.t = setTimeout(() => void this.cargarAudiencia(), DEBOUNCE_MS);
  }

  private filtro(): Filtro {
    if (this.modo() === 'concretos') return { atletas: this.elegidos().map((a) => a.id), soloSinResponder: this.soloSinResponder() };
    return { estados: this.estadosSel(), soloSinResponder: this.soloSinResponder() };
  }

  private async cargarAudiencia(): Promise<Audiencia | null> {
    const mine = ++this.seq;
    // Chosen athletes but none picked yet: nothing to count (an empty filter would mean everybody).
    if (this.modo() === 'concretos' && !this.elegidos().length) {
      const vacia: Audiencia = { total: 0, email: 0, whatsapp: 0, whatsappDisponible: false, whatsappMotivo: '' };
      if (mine === this.seq) {
        this.audiencia.set(vacia);
        // Nada que consultar: WhatsApp queda desmarcado y sin estado previo. Al volver a elegir un atleta, su estado es
        // «Comprobando…» hasta la siguiente respuesta (motivoWa y waDisponible ya muestran lo de «sin atletas» al instante).
        this.waEstado.set(undefined);
        this.whatsapp.set(false);
      }
      return vacia;
    }
    try {
      const a = await this.api.audiencia(this.cid(), this.formulario().id, this.filtro());
      if (mine === this.seq) {
        this.audiencia.set(a);
        this.waEstado.set({ whatsappDisponible: a.whatsappDisponible, whatsappMotivo: a.whatsappMotivo });
        if (!a.whatsappDisponible) this.whatsapp.set(false);
      }
      return a;
    } catch {
      // Audience failed: WhatsApp stays disabled and unticked (the server would refuse it anyway).
      if (mine === this.seq) {
        this.audiencia.set(null);
        this.waEstado.set(null);
        this.whatsapp.set(false);
      }
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
    const concretos = this.modo() === 'concretos';
    const alcance = concretos ? ` a ${this.n(this.elegidos().length)} ${this.elegidos().length === 1 ? 'atleta' : 'atletas'}` : '';
    const ok = await this.confirm.ask({
      title: `¿Enviar «${this.formulario().nombre}»${alcance}?`,
      text: mensajes === null ? 'Los mensajes entran en la Cola de envío y salen al ritmo anti-spam.'
        : `Se crearán ${this.n(mensajes)} mensajes (${this.n(this.email() ? a!.email : 0)} por email${this.whatsapp() ? ' · ' + this.n(a!.whatsapp) + ' por WhatsApp' : ''}). Entran en la Cola de envío y salen al ritmo anti-spam.`,
      confirm: 'Enviar',
    });
    if (!ok) return;
    // Otro envío (canales o filtro distintos) lleva otra clave: con la misma, el servidor respondería 422 CLAVE_REUTILIZADA.
    const firma = JSON.stringify([[...canales].sort(), [...(filtro.estados ?? [])].sort(), [...(filtro.atletas ?? [])].sort(), !!filtro.soloSinResponder]);
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
        // WhatsApp rechazado por messaging: se desmarca y se vuelve a preguntar la disponibilidad.
        if (p.code === 'WHATSAPP_NO_DISPONIBLE' || p.code === 'WHATSAPP_NO_COMPROBADO') {
          this.whatsapp.set(false);
          this.actualizarAudiencia();
        }
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
    if (p.code === 'ENVIO_EN_CURSO') return 'Ya se está preparando un envío de este formulario. Espera unos segundos.';
    if (p.code === 'FORMULARIO_CAMBIADO') return 'El formulario ha cambiado mientras se preparaba el envío. Vuelve a enviarlo.';
    if (p.status === 409) return 'El formulario está cerrado y no admite envíos. Cámbialo a activo desde la cabecera para enviarlo.';
    return errText(e, 'Prueba de nuevo en unos segundos.');
  }
}

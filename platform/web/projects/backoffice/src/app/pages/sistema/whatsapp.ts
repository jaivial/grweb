import { A11yModule } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrField, GrIcon, GrIconButton, GrInput, GrSelect, GrSkeleton, GrToasts, type GrTone } from '@grcup/ui';
import { Auth } from '../../core/auth';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { problemOf } from '../../core/api';
import { BoPageHeader, BoToggle } from '../../shared/ui';
import { WhatsAppApi, type EstadoWa, type EstadoWaInfo, type TelefonoAviso } from './whatsapp-api';

type Tab = 'vinculacion' | 'avisos';
type Dialogo = 'desconectar' | null;

/**
 * «Sistema › WhatsApp» (Figma D4): the WhatsApp service of the competition, the linking of the number
 * (QR or pairing code, live) and the phone list that receives the athlete-request notices.
 */
@Component({
  selector: 'bo-whatsapp-sistema',
  imports: [A11yModule, FormsModule, RouterLink, BoPageHeader, BoToggle, GrAlert, GrBadge, GrButton, GrField, GrIcon, GrIconButton, GrInput, GrSelect, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-[1280px] flex-col gap-5 pb-24">
      <bo-page-header title="WhatsApp" [crumbs]="[comps.current()?.nombreCorto || '', 'Sistema', 'WhatsApp']">
        @if (puede()) {
          <ng-container actions>
            @if (servicioCaido()) {
              <span class="inline-flex h-8 items-center gap-2 rounded-pill border border-warning/40 bg-warning/10 px-3 text-label-s text-warning"><gr-icon name="loader" [size]="16" [spin]="true" />Reconectando…</span>
            } @else {
              <span class="inline-flex h-8 items-center gap-2 rounded-pill border border-success/40 bg-success/10 px-3 text-label-s text-success"><gr-icon name="radio" [size]="16" />Conexión en vivo</span>
            }
          </ng-container>
        }
      </bo-page-header>

      @if (!puede()) {
        <section class="mx-auto w-full max-w-2xl rounded-lg border border-line-subtle bg-bg-card p-8 text-center">
          <span class="mx-auto flex size-12 items-center justify-center rounded-md bg-accent-deep/40 text-accent-text"><gr-icon name="lock" [size]="22" /></span>
          <h2 class="mt-4 text-ui-h4">No tienes acceso a Sistema › WhatsApp</h2>
          <p class="mt-2 text-body-s text-text-tertiary">Este panel lo gestiona quien administra las integraciones de la competición. Aquí se crea el servicio de WhatsApp, se vincula el número y se configuran los avisos de solicitudes.</p>
          <div class="mt-5 flex justify-center"><button grButton variant="primary" (click)="pedirPermiso()">Solicitar el permiso</button></div>
        </section>
      } @else {
        <nav class="flex gap-1 overflow-x-auto border-b border-line-subtle [scrollbar-width:none]" aria-label="WhatsApp">
          @for (t of tabs; track t.k) {
            <button type="button" (click)="tab.set(t.k)" [attr.aria-current]="tab() === t.k ? 'page' : null"
              class="relative flex h-11 shrink-0 items-center px-3 text-label-s whitespace-nowrap" [class]="tab() === t.k ? 'text-text-primary' : 'text-text-tertiary hover:text-text-primary'">
              {{ t.l }}
              @if (tab() === t.k) { <span class="absolute inset-x-2 bottom-0 h-0.5 rounded-t-2xs bg-accent"></span> }
            </button>
          }
        </nav>

        @if (cargando()) {
          <gr-skeleton class="h-40 rounded-lg" />
          <gr-skeleton class="h-96 rounded-lg" />
        } @else {
          @if (tab() === 'vinculacion') {
            <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <h2 class="text-ui-h5">Servicio de WhatsApp</h2>
                  <p class="mt-1 text-body-xs text-text-tertiary">Servidor de WhatsApp · {{ comps.current()?.nombre || comps.current()?.nombreCorto }}</p>
                </div>
                <gr-badge [tone]="estadoTone()">{{ estadoLabel() }}</gr-badge>
              </div>
              @if (servicioCaido()) {
                <p class="mt-3 text-body-xs text-text-tertiary">El servidor de WhatsApp no responde</p>
                <p class="text-body-xs text-text-tertiary">Los avisos en cola no se pierden: salen cuando el servicio vuelva</p>
              } @else if (estado() === 'desconectado') {
                <p class="mt-3 text-body-xs text-text-tertiary">Última conexión · {{ hace(conectadoDesdeIso()) }}</p>
                <p class="text-body-xs text-text-tertiary">Los avisos en cola esperan: se envían al volver a vincular el número</p>
              } @else if (estado() === 'sin_instancia') {
                <p class="mt-3 text-body-xs text-text-tertiary">El servidor de WhatsApp de la competición. Mientras no haya número vinculado, los mensajes se registran sin enviarse.</p>
                <p class="text-body-xs text-text-tertiary">Número · todavía sin vincular</p>
                <p class="text-body-xs text-text-tertiary">Los avisos del alta saldrán en cuanto se vincule</p>
              } @else if (modo() === 'simulado') {
                <p class="mt-3 text-body-xs text-text-tertiary">Modo simulado: los mensajes se registran sin salir de la plataforma.</p>
              }
              <p class="mt-1 text-body-xs text-text-tertiary">La pantalla se actualiza sola</p>
            </section>

            @if (estado() === 'sin_instancia') {
              <section class="rounded-lg border border-line-subtle bg-bg-card p-6">
                <div class="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-raised p-8 text-center">
                  <span class="flex size-12 items-center justify-center rounded-md bg-accent-deep/40 text-accent-text"><gr-icon name="plug" [size]="22" /></span>
                  <h2 class="text-ui-h4">Todavía no hay número vinculado</h2>
                  <p class="text-body-s text-text-tertiary">Prepara el servicio de WhatsApp para esta competición. Cuando exista, vincularás el número con un QR o un código y los avisos del alta saldrán por aquí.</p>
                  <div class="mt-2 flex flex-wrap justify-center gap-2">
                    <button grButton variant="primary" [loading]="ocupado()" (click)="crearInstancia()">Crear instancia</button>
                    <button grButton variant="ghost" (click)="ayuda.set(!ayuda())">Cómo funciona la vinculación</button>
                  </div>
                  @if (ayuda()) {
                    <ul class="mt-2 flex flex-col gap-1 text-left text-body-xs text-text-tertiary">
                      <li>1 · El servicio de WhatsApp de la competición se prepara una sola vez.</li>
                      <li>2 · Enlazas el número con un QR (desde el móvil) o con un código de 8 caracteres.</li>
                      <li>3 · A partir de ahí, los avisos de las solicitudes de atleta salen por ese número.</li>
                    </ul>
                  }
                </div>
              </section>
            } @else if (estado() === 'conectado') {
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <div class="flex flex-wrap items-center gap-3">
                  <p class="text-ui-h5">{{ numeroVinculado() }}</p>
                  <gr-badge tone="success">Vinculado</gr-badge>
                  <div class="ml-auto flex flex-wrap gap-2">
                    <button grButton [loading]="ocupado()" (click)="reiniciar()">Reiniciar la conexión</button>
                    <button grButton variant="danger" (click)="dialogo.set('desconectar')">Desconectar este número</button>
                  </div>
                </div>
                <p class="mt-1 text-body-xs text-text-tertiary">Conectado desde {{ conectadoDesde() }}</p>
              </section>
              <gr-alert tone="success" title="Número vinculado">Los avisos de solicitudes salen por aquí. El QR y el código se retiran de la pantalla al conectar.</gr-alert>
            } @else {
              @if (estado() === 'desconectado') {
                <gr-alert tone="info" title="WhatsApp desconectado">
                  El canal quedó cerrado a propósito. Los emails del alta siguen saliendo; los avisos de WhatsApp quedan en cola.
                  <a alertAction [routerLink]="['/', comps.current()?.slug, 'emails', 'salida']" class="mt-2 inline-flex h-9 items-center gap-1 text-label-s text-accent-text">Revisar cola de mensajes <gr-icon name="arrow-right" [size]="14" /></a>
                </gr-alert>
              }
              @if (servicioCaido()) {
                <gr-alert tone="danger" title="No se puede contactar con el servidor de WhatsApp">
                  No se puede vincular el número ni enviar mensajes. Los envíos se reintentan cuando el servicio vuelva; el resto del panel sigue funcionando.
                  <button alertAction type="button" class="mt-2 inline-flex h-9 items-center gap-1 text-label-s text-accent-text" (click)="cargarEstado()">Reintentar ahora <gr-icon name="arrow-right" [size]="14" /></button>
                </gr-alert>
              }
              <div class="grid gap-4 lg:grid-cols-2">
                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Vincular con QR</h2>
                  <p class="mt-1 text-body-xs text-text-tertiary">Abre WhatsApp en el móvil › Dispositivos vinculados y escanea. La pantalla se actualiza sola.</p>
                  <div class="mt-5 flex flex-col items-center gap-3">
                    @if (qr(); as q) {
                      <img [src]="q" alt="Código QR para vincular el número de WhatsApp" class="h-[300px] w-[240px] rounded-md bg-white p-2 object-contain" />
                      <span class="h-1 w-full max-w-[240px] overflow-hidden rounded-pill bg-bg-raised"><span class="block h-full w-1/3 rounded-pill bg-success"></span></span>
                      <p class="text-body-xs text-text-tertiary">El QR se renueva solo hasta que lo escanees</p>
                      <div class="flex w-full items-center justify-between gap-2">
                        <p class="text-body-xs text-text-tertiary">{{ esperando() ? 'Esperando a que escanees el QR' : 'Conectando…' }}</p>
                        <button type="button" class="text-label-s text-accent-text hover:underline" (click)="actualizarQr()">Actualizar</button>
                      </div>
                    } @else if (qrCaducado()) {
                      <div class="flex h-[300px] w-[240px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-warning/60 p-4 text-center">
                        <gr-icon name="scan" [size]="24" class="text-warning" />
                        <p class="text-label-s text-warning">El QR ha caducado</p>
                        <p class="text-body-xs text-text-tertiary">no se escaneó a tiempo</p>
                      </div>
                      <p class="text-body-xs text-text-tertiary">Generar otro no rompe nada: el intento sigue abierto.</p>
                      <div class="flex w-full items-center justify-between gap-2">
                        <p class="text-body-xs text-text-tertiary">QR nuevo listo</p>
                        <button grButton variant="primary" [loading]="ocupado()" (click)="generarQr()">Generar otro</button>
                      </div>
                    } @else {
                      <div class="flex h-[300px] w-[240px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong p-4 text-center">
                        <gr-icon name="scan" [size]="24" class="text-text-tertiary" />
                        <p class="text-label-s text-text-tertiary">Código QR</p>
                        <p class="text-body-xs text-text-tertiary">Pulsa «Generar QR»</p>
                      </div>
                      <div class="flex w-full items-center justify-between gap-2">
                        <p class="text-body-xs text-text-tertiary">Todavía no hay QR ni código</p>
                        <button grButton variant="primary" [loading]="ocupado()" (click)="generarQr()">Generar QR</button>
                      </div>
                    }
                  </div>
                </section>

                <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                  <h2 class="text-ui-h5">Vincular con código</h2>
                  <p class="mt-1 text-body-xs text-text-tertiary">Si no puedes escanear, vincula con tu número: WhatsApp › Dispositivos vinculados › Vincular con número de teléfono.</p>
                  <div class="mt-5 flex flex-col gap-3">
                    <gr-field label="País">
                      <gr-select [ngModel]="pais()" (ngModelChange)="pais.set($event)" aria-label="País">
                        @for (p of paises; track p.prefijo) { <option [value]="p.prefijo">{{ p.nombre }} {{ p.prefijo }}</option> }
                      </gr-select>
                    </gr-field>
                    <gr-field label="Número de móvil" hint="Se guarda con el prefijo del país (+34 por defecto)">
                      <input grInput id="gr-whatsapp-nuevo" inputmode="tel" placeholder="612 345 678" [ngModel]="numeroEnlace()" (ngModelChange)="numeroEnlace.set($event)" />
                    </gr-field>
                    @if (codigo(); as c) {
                      <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-success/40 bg-success/5 px-4 py-3">
                        <p class="font-mono text-[24px] leading-none tracking-[0.25em]">{{ grupo(c, 0) }} · {{ grupo(c, 1) }}</p>
                        <button grButton size="s" icon="copy" (click)="copiar(c)">Copiar</button>
                      </div>
                      <ol class="flex flex-col gap-1 text-body-xs text-text-tertiary">
                        <li>1 · Abre WhatsApp en el móvil</li>
                        <li>2 · Ajustes › Dispositivos vinculados</li>
                        <li>3 · Toca «Vincular con número de teléfono»</li>
                      </ol>
                      <div class="flex justify-end"><button grButton variant="primary" [loading]="ocupado()" (click)="generarCodigo()">Generar otro código</button></div>
                    } @else {
                      <p class="text-body-xs text-text-tertiary">Escribe tu número para pedir el código</p>
                      <div class="flex justify-end">
                        <button grButton variant="primary" [loading]="ocupado()" [disabled]="!numeroEnlace().trim()" (click)="generarCodigo()">Generar código</button>
                      </div>
                    }
                  </div>
                </section>
              </div>
            }
          } @else {
            @if (avisos() === null) {
              <gr-skeleton class="h-96 rounded-lg" />
            } @else {
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <h2 class="text-ui-h5">Avisos de solicitudes de atleta</h2>
                <p class="mt-1 text-body-s text-text-tertiary">Cuando entra una solicitud nueva: un WhatsApp al atleta (si consintió) y uno por cada teléfono de organizador. Los dos mensajes usan plantillas distintas y quedan en auditoría.</p>
                <div class="mt-5 flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-surface px-4 py-3">
                  <span class="min-w-0"><span class="block text-label-s">WhatsApp al atleta</span><span class="block text-body-xs text-text-tertiary">Confirmación de solicitud recibida. Solo si el atleta aceptó recibir avisos por WhatsApp.</span></span>
                  <bo-toggle [(value)]="alAtleta" label="WhatsApp al atleta" (changed)="guardar()" />
                </div>
                <div class="mt-3 flex items-center justify-between gap-3 rounded-md border border-line-subtle bg-bg-surface px-4 py-3">
                  <span class="min-w-0"><span class="block text-label-s">WhatsApp a organizadores</span><span class="block text-body-xs text-text-tertiary">Un mensaje por cada teléfono de la lista, con la foto de la solicitud.</span></span>
                  <bo-toggle [(value)]="aOrganizadores" label="WhatsApp a organizadores" (changed)="guardar()" />
                </div>

                <div class="mt-6">
                  <div class="flex items-center justify-between gap-3">
                    <h3 class="text-label-s">Teléfonos de organizadores</h3>
                    <span class="text-body-xs text-text-tertiary">{{ telefonos().length }} de 10</span>
                  </div>
                  @if (telefonos().length) {
                    <ul class="mt-2 flex flex-col gap-2">
                      @for (t of telefonos(); track t.numero) {
                        <li class="flex items-center justify-between gap-3 rounded-md bg-bg-raised px-4 py-3">
                          <span class="min-w-0 truncate text-body-s">{{ telefonoLegible(t.numero) }}<span class="text-text-tertiary"> · {{ t.nombre || 'Sin nombre' }}</span></span>
                          <button grIconButton icon="trash" [label]="'Quitar ' + t.numero" (click)="quitar(t)"></button>
                        </li>
                      }
                    </ul>
                  }
                  <div class="mt-4">
                    <gr-field label="Número nuevo" [error]="telError()" hint="Se guarda con el prefijo del país (+34 por defecto)">
                      <div class="flex gap-2">
                        <input grInput id="gr-whatsapp-telefono" inputmode="tel" placeholder="+34 600 000 000" [ngModel]="nuevo()" (ngModelChange)="nuevo.set($event)" (keydown.enter)="anadir()" />
                        <button grButton [disabled]="ocupado()" (click)="anadir()">Añadir</button>
                      </div>
                    </gr-field>
                  </div>
                  @if (!telefonos().length) {
                    <section class="mt-4 rounded-lg border border-line-subtle bg-bg-raised p-5">
                      <h3 class="text-label-s">Sin teléfonos</h3>
                      <p class="mt-1 text-body-s text-text-secondary">Sin teléfonos en la lista, el aviso a organizadores no se envía: la solicitud solo llega por email.</p>
                      <gr-alert tone="info" title="No hay teléfonos de organizador" class="mt-3">
                        Añade al menos uno antes de abrir el alta: de momento los avisos a organizados no se envían.
                        <button alertAction type="button" class="mt-2 inline-flex h-9 items-center gap-1 text-label-s text-accent-text" (click)="enfocarNumero()">Añadir teléfono <gr-icon name="arrow-right" [size]="14" /></button>
                      </gr-alert>
                    </section>
                  }
                  <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <p class="text-body-xs text-text-tertiary">Enviar prueba · manda un mensaje real a los teléfonos de la lista, sin crear solicitud.</p>
                    <button grButton [loading]="probando()" [disabled]="!telefonos().length" (click)="probar()">Enviar prueba</button>
                  </div>
                </div>
              </section>
              @if (guardado()) {
                <gr-alert tone="success" title="Configuración guardada">Los cambios se aplican al guardarlos. La prueba confirma que los avisos llegan antes de que haya una solicitud real.</gr-alert>
              }
            }
          }
        }
      }
    </div>

    <!-- ===== Disconnect ===== -->
    @if (dialogo() === 'desconectar') {
      <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4" (click)="dialogo.set(null)" (keydown.escape)="dialogo.set(null)">
        <div class="w-full max-w-lg rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" aria-label="Desconectar WhatsApp"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()">
          <div class="flex items-start justify-between gap-3">
            <h2 class="text-ui-h5">Desconectar WhatsApp</h2>
            <button type="button" class="-mt-2 -mr-2 flex size-11 items-center justify-center text-text-tertiary" aria-label="Cerrar" (click)="dialogo.set(null)"><gr-icon name="x" [size]="18" /></button>
          </div>
          <p class="mt-3 text-body-s text-text-secondary">El número deja de enviar y recibir mensajes y se cierra su sesión. Los avisos de solicitudes en cola esperan a que vincules otro número.</p>
          <div class="mt-4">
            <gr-field label="Escribe DESCONECTAR para confirmar">
              <input grInput maxlength="11" [ngModel]="desconectarTexto()" (ngModelChange)="desconectarTexto.set($event)" />
            </gr-field>
            <p class="mt-1 text-body-xs text-text-tertiary">La desconexión queda en el registro de auditoría con tu usuario.</p>
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button grButton variant="ghost" (click)="dialogo.set(null)">Cancelar</button>
            <button grButton variant="danger" [loading]="ocupado()" [disabled]="desconectarTexto().trim().toUpperCase() !== 'DESCONECTAR'" (click)="desconectar()">Sí, desconectar</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class WhatsAppSistemaPage {
  private readonly api = inject(WhatsAppApi);
  protected readonly comps = inject(Competitions);
  private readonly auth = inject(Auth);
  private readonly live = inject(Realtime);
  private readonly toasts = inject(GrToasts);

  protected readonly tab = signal<Tab>('vinculacion');
  protected readonly estadoInfo = signal<EstadoWaInfo | null>(null);
  protected readonly avisos = signal<{ telefonos: TelefonoAviso[]; alAtleta: boolean; aOrganizadores: boolean } | null>(null);
  protected readonly qr = signal<string | null>(null);
  protected readonly qrCaducado = signal(false);
  protected readonly codigo = signal<string | null>(null);
  protected readonly esperando = signal(false);
  protected readonly numeroEnlace = signal('');
  protected readonly pais = signal('+34');
  protected readonly nuevo = signal('');
  protected readonly telError = signal<string | null>(null);
  protected readonly alAtleta = signal(true);
  protected readonly aOrganizadores = signal(true);
  protected readonly guardado = signal(false);
  protected readonly probando = signal(false);
  protected readonly ocupado = signal(false);
  protected readonly ayuda = signal(false);
  protected readonly dialogo = signal<Dialogo>(null);
  protected readonly desconectarTexto = signal('');

  protected readonly tabs: { k: Tab; l: string }[] = [{ k: 'vinculacion', l: 'Vinculación' }, { k: 'avisos', l: 'Avisos de solicitudes' }];
  protected readonly paises = [
    { nombre: 'España', prefijo: '+34' }, { nombre: 'Portugal', prefijo: '+351' }, { nombre: 'Francia', prefijo: '+33' },
    { nombre: 'Italia', prefijo: '+39' }, { nombre: 'Alemania', prefijo: '+49' }, { nombre: 'Reino Unido', prefijo: '+44' },
  ];

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  protected readonly puede = computed(() => this.auth.can(this.cid(), 'integraciones.config'));
  protected readonly cargando = computed(() => this.estadoInfo() === null);
  protected readonly estado = computed<EstadoWa>(() => this.estadoInfo()?.estado ?? 'sin_instancia');
  protected readonly modo = computed(() => this.estadoInfo()?.modo ?? '');
  protected readonly numeroVinculado = computed(() => this.estadoInfo()?.numero ?? '');
  /** Legible name of the service (the technical id is never shown). */
  protected readonly instancia = computed(() => this.estadoInfo()?.instancia || this.comps.current()?.nombre || this.comps.current()?.nombreCorto || 'WhatsApp');
  protected readonly telefonos = computed(() => this.avisos()?.telefonos ?? []);
  protected readonly servicioCaido = computed(() => this.estadoInfo()?.servicio === 'caido' || this.estado() === 'error');

  constructor() {
    effect(() => {
      const cid = this.cid();
      if (cid) untracked(() => void this.cargar());
    });
    const sub = this.live.events.subscribe((e) => {
      if (e.tipo === 'whatsapp.conexion') {
        void this.cargarEstado();
        return;
      }
      if (e.tipo === 'whatsapp.qr_nuevo') {
        void this.actualizarQr();
      }
    });
    const rs = this.live.resync.subscribe(() => void this.cargar());
    inject(DestroyRef).onDestroy(() => {
      sub.unsubscribe();
      rs.unsubscribe();
    });
  }

  // ---------------------------------------------------------------- data

  async cargar(): Promise<void> {
    if (!this.puede()) return;
    await this.cargarEstado();
    try {
      const a = await this.api.avisos(this.cid());
      this.avisos.set(a);
      this.alAtleta.set(a.alAtleta);
      this.aOrganizadores.set(a.aOrganizadores);
    } catch {
      this.avisos.set({ telefonos: [], alAtleta: false, aOrganizadores: false });
    }
  }

  /** Change of tab: coming back to «Vinculación» while it is connecting asks again for the QR. */
  protected irTab(k: Tab): void {
    this.tab.set(k);
    if (k === 'vinculacion' && this.estado() === 'conectando') void this.actualizarQr();
  }

  async cargarEstado(): Promise<void> {
    const cid = this.cid();
    if (!cid) return;
    try {
      this.estadoInfo.set(await this.api.estado(cid));
    } catch {
      this.estadoInfo.set({ servicio: 'caido', instancia: '', estado: 'error', numero: '', conectadoDesde: '', modo: '' });
    }
  }

  // ---------------------------------------------------------------- state

  protected estadoLabel(): string {
    switch (this.estado()) {
      case 'conectado': return 'Conectado';
      case 'conectando': return 'Conectando';
      case 'desconectado': return 'Desconectado';
      case 'error': return 'Caído';
      default: return 'Sin configurar';
    }
  }

  protected estadoTone(): GrTone {
    switch (this.estado()) {
      case 'conectado': return 'success';
      case 'conectando': return 'info';
      case 'desconectado': return 'neutral';
      case 'error': return 'danger';
      default: return 'neutral';
    }
  }

  protected conectadoDesdeIso(): string {
    return this.estadoInfo()?.conectadoDesde ?? '';
  }

  protected conectadoDesde(): string {
    const iso = this.conectadoDesdeIso();
    if (!iso) return 'hace un momento';
    const d = new Date(iso);
    const dia = new Intl.DateTimeFormat('es-ES', { weekday: 'long', timeZone: 'Europe/Madrid' }).format(d);
    const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(d);
    return `el ${dia} a las ${hora}`;
  }

  protected hace(iso?: string): string {
    if (!iso) return 'hace un momento';
    const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
    if (min < 60) return `hace ${min} minutos`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
    const d = Math.round(h / 24);
    return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  }

  protected grupo(codigo: string, i: number): string {
    return codigo.slice(i * 4, i * 4 + 4);
  }

  protected pedirPermiso(): void {
    const c = this.comps.current();
    const asunto = encodeURIComponent('Acceso a Sistema › WhatsApp');
    const cuerpo = encodeURIComponent(`Hola,\n\nNecesito acceso a la configuración de WhatsApp de ${c?.nombre ?? 'la competición'}.\n\nGracias.`);
    window.location.href = `mailto:${c?.evento?.emailContacto ?? ''}?subject=${asunto}&body=${cuerpo}`;
  }

  // ---------------------------------------------------------------- linking

  protected async crearInstancia(): Promise<void> {
    this.ocupado.set(true);
    try {
      this.estadoInfo.set(await this.api.crearInstancia(this.cid()));
      this.toasts.success('Servicio de WhatsApp preparado');
    } catch (e) {
      this.toasts.error('No se pudo preparar el servicio', this.waError(e, 'No se pudo preparar el servicio de WhatsApp. Inténtalo de nuevo.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async generarQr(): Promise<void> {
    this.ocupado.set(true);
    this.qrCaducado.set(false);
    try {
      const r = await this.api.conectar(this.cid(), '');
      this.codigo.set(null);
      if (r.qr) {
        this.qr.set(r.qr);
        this.esperando.set(true);
      } else {
        this.toasts.info('El servicio todavía no ha devuelto el QR', 'Vuelve a intentarlo en unos segundos.');
      }
      await this.cargarEstado();
    } catch (e) {
      this.toasts.error('No se pudo generar el QR', this.waError(e, 'No se pudo generar el QR. Inténtalo de nuevo.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async actualizarQr(): Promise<void> {
    try {
      const r = await this.api.qr(this.cid());
      if (r.qr) {
        this.qr.set(r.qr);
        this.qrCaducado.set(false);
        this.esperando.set(true);
      } else {
        this.qr.set(null);
        this.qrCaducado.set(true);
      }
    } catch {
      this.qr.set(null);
      this.qrCaducado.set(true);
    }
  }

  protected async generarCodigo(): Promise<void> {
    this.ocupado.set(true);
    try {
      const numero = this.normalizar(this.numeroEnlace(), this.pais());
      if (!numero) {
        this.toasts.error('El número no es válido', 'Ejemplo: +34 612 345 678');
        return;
      }
      const r = await this.api.conectar(this.cid(), numero);
      this.qr.set(null);
      this.codigo.set(r.codigo ?? null);
      if (!r.codigo) this.toasts.info('El servicio no ha devuelto un código', 'Vuelve a intentarlo en unos segundos.');
      await this.cargarEstado();
    } catch (e) {
      this.toasts.error('No se pudo generar el código', this.waError(e, 'No se pudo generar el código. Inténtalo de nuevo.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async copiar(codigo: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(codigo);
      this.toasts.success('Código copiado', 'Pégalo en WhatsApp para vincular el número.');
    } catch {
      this.toasts.info('Copia el código a mano', codigo);
    }
  }

  protected async reiniciar(): Promise<void> {
    this.ocupado.set(true);
    try {
      this.estadoInfo.set(await this.api.reiniciar(this.cid()));
      this.toasts.success('Conexión reiniciada');
    } catch (e) {
      this.toasts.error('No se pudo reiniciar', this.waError(e, 'No se pudo reiniciar la conexión. Inténtalo de nuevo.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async desconectar(): Promise<void> {
    this.ocupado.set(true);
    try {
      this.estadoInfo.set(await this.api.desconectar(this.cid()));
      this.dialogo.set(null);
      this.desconectarTexto.set('');
      this.qr.set(null);
      this.codigo.set(null);
      this.toasts.success('WhatsApp desconectado');
    } catch (e) {
      this.toasts.error('No se pudo desconectar', this.waError(e, 'No se pudo desconectar WhatsApp. Inténtalo de nuevo.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  // ---------------------------------------------------------------- notices

  protected async guardar(): Promise<void> {
    const cid = this.cid();
    const a = this.avisos();
    if (!cid || !a) return;
    try {
      this.avisos.set(await this.api.guardarAvisos(cid, { ...a, alAtleta: this.alAtleta(), aOrganizadores: this.aOrganizadores() }));
      this.guardado.set(true);
    } catch (e) {
      this.toasts.error('No se pudo guardar la configuración', this.waError(e, 'No se pudo guardar la configuración. Inténtalo de nuevo.'));
    }
  }

  protected async anadir(): Promise<void> {
    const numero = this.normalizar(this.nuevo(), '+34');
    if (!numero) {
      this.telError.set('El formato no es válido. Ejemplo: +34 612 345 678');
      return;
    }
    this.telError.set(null);
    const a = this.avisos();
    if (!a) return;
    if (a.telefonos.length >= 10) {
      this.toasts.error('Ya hay 10 teléfonos', 'Quita alguno antes de añadir otro.');
      return;
    }
    if (a.telefonos.some((t) => t.numero === numero)) {
      this.toasts.error('Ese teléfono ya está en la lista');
      return;
    }
    this.ocupado.set(true);
    try {
      const lista = [...a.telefonos, { numero, nombre: '' }];
      this.avisos.set(await this.api.guardarAvisos(this.cid(), { ...a, telefonos: lista, alAtleta: this.alAtleta(), aOrganizadores: this.aOrganizadores() }));
      this.nuevo.set('');
      this.guardado.set(true);
    } catch (e) {
      this.toasts.error('No se pudo añadir el teléfono', this.waError(e, 'No se pudo guardar la lista de teléfonos. Inténtalo de nuevo.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async quitar(t: TelefonoAviso): Promise<void> {
    const a = this.avisos();
    if (!a) return;
    this.ocupado.set(true);
    try {
      this.avisos.set(await this.api.guardarAvisos(this.cid(), { ...a, telefonos: a.telefonos.filter((x) => x.numero !== t.numero), alAtleta: this.alAtleta(), aOrganizadores: this.aOrganizadores() }));
      this.guardado.set(true);
    } catch (e) {
      this.toasts.error('No se pudo quitar el teléfono', this.waError(e, 'No se pudo guardar la lista de teléfonos. Inténtalo de nuevo.'));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async probar(): Promise<void> {
    this.probando.set(true);
    try {
      const r = await this.api.prueba(this.cid());
      if (r.enviados > 0) {
        const primero = this.telefonos()[0]?.numero ?? '';
        this.toasts.success(`Prueba enviada · ${primero}`, 'Entregado en 2 segundos');
      } else {
        const err = r.errores?.[0];
        this.toasts.error('No se pudo enviar la prueba', this.waTexto(err?.error ?? '', 'WhatsApp desconectado · vincula el número en Vinculación'));
      }
    } catch (e) {
      this.toasts.error('No se pudo enviar la prueba', this.waError(e, 'WhatsApp desconectado · vincula el número en Vinculación'));
    } finally {
      this.probando.set(false);
    }
  }

  protected enfocarNumero(): void {
    document.getElementById('gr-whatsapp-telefono')?.focus();
  }

  /** «+34 600 123 456»: the number as it is stored, with the digits in groups of three. */
  protected telefonoLegible(numero: string): string {
    if (!numero) return '';
    if (!numero.startsWith('+')) return numero;
    const d = numero.slice(1);
    const grupos: string[] = [];
    for (let i = d.length; i > 0; i -= 3) grupos.unshift(d.slice(Math.max(0, i - 3), i));
    return '+' + grupos.join(' ');
  }

  /** The errors of the WhatsApp provider arrive in English or as raw JSON: the panel shows Spanish. */
  protected waError(e: unknown, porDefecto: string): string {
    return this.waTexto(problemOf(e).detail ?? '', porDefecto);
  }

  /** Cleans the text of a failure of the WhatsApp service: no raw JSON and no technical instance name. */
  protected waTexto(texto: string, porDefecto: string): string {
    let t = (texto ?? '').trim();
    const tecnico = this.estadoInfo()?.instanciaId;
    const legible = this.estadoInfo()?.instancia;
    if (tecnico && legible) t = t.split(tecnico).join(legible);
    if (!t) return porDefecto;
    if (t.startsWith('{') || t.startsWith('[') || /"message"\s*:/.test(t)) return porDefecto;
    return t;
  }

  /** E.164 with the country prefix of the picker (+34 by default). */
  private normalizar(valor: string, prefijo: string): string | null {
    const limpio = (valor ?? '').replace(/[\s().-]/g, '');
    if (!limpio) return null;
    const completo = limpio.startsWith('+') ? limpio : prefijo + limpio;
    return /^\+[1-9]\d{7,14}$/.test(completo) ? completo : null;
  }
}

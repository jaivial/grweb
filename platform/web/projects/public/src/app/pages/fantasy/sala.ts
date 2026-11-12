/**
 * fantasy/sala.ts — /fantasy/salas/:id (Figma «81 · /fantasy/salas» · Sala, anfitrión e invitado): los jugadores de
 * la sala con su nota media, las solicitudes de unión (el anfitrión acepta o rechaza), el enlace de invitación
 * (entra directo), las acciones del anfitrión y el mercado de la sala. Todo se actualiza en tiempo real.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, PendingTasks, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { FanSession, codigoError } from '../../core/fan';
import { Juegos, JuegosEnVivo, mensajeError, nota2, type FilaSala, type SalaDetalle } from '../../core/juegos';
import { monedas } from '../porra/formato';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { JuegosNav, MEDALLA, iniciales } from '../porra/componentes';
import { AvisoConexion, BarraSala, FantasyCabecera, GrAviso, colorNota } from './componentes';
import { CrearSalaModal, PopoverAlineacion, TarjetaEstado, type SalaEditable } from './salas-ui';

@Component({
  selector: 'gr-sala-page',
  imports: [Page, GrButton, GrIcon, GrSkeleton, AvisoConexion, BarraSala, CrearSalaModal, FantasyCabecera, GrAviso, JuegosNav, PopoverAlineacion, TarjetaEstado],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="sala()?.nombre ?? 'Sala'" [juego]="true">
      <gr-fantasy-cabecera [titulo]="sala()?.nombre ?? 'Sala'" [migas]="['Salas', sala()?.nombre ?? 'Sala']" [descripcion]="subtitulo()" />
      <div class="flex flex-col gap-4 md:gap-6">
        <gr-juegos-nav juego="fantasy" activa="salas" />

        @if (cargando()) {
          <div class="flex flex-col gap-3" aria-busy="true">
            <gr-skeleton class="h-[76px] rounded-lg" />
            @for (i of [1, 2, 3]; track i) { <gr-skeleton class="h-[66px] rounded-lg" /> }
          </div>
        } @else if (noExiste()) {
          <gr-tarjeta-estado class="max-w-[410px]" tono="error" icono="circle-alert" titulo="Esta sala no existe o ya no está activa">Puede que el anfitrión la haya cerrado o que el enlace no sea correcto.
            <a acciones grButton variant="primary" [block]="true" href="/fantasy/salas">Ver salas abiertas</a>
          </gr-tarjeta-estado>
        } @else if (errorCarga()) {
          <gr-aviso tono="error" titulo="No se pudo cargar la sala">Comprueba tu conexión e inténtalo de nuevo.</gr-aviso>
          <button type="button" grButton variant="outline" class="self-start" (click)="cargar()">Reintentar</button>
        } @else if (detalle(); as d) {
          <gr-barra-sala [salaId]="d.sala.id" [nombre]="d.sala.nombre" [estado]="d.sala.estado === 'lista' ? 'abierta' : d.sala.estado" [miembros]="d.sala.miembros" [plazas]="d.sala.plazas" activa="resumen" />

          @if (vivo.caida()) { <gr-aviso-conexion /> }
          @if (error(); as e) { <gr-aviso tono="error" titulo="No hemos podido completar la operación">{{ e }}</gr-aviso> }
          @if (aviso(); as a) { <gr-aviso [tono]="a.tono" [titulo]="a.titulo">{{ a.texto }}</gr-aviso> }

          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
            <section class="flex min-w-0 flex-col gap-3 lg:flex-1" aria-labelledby="sala-jugadores">
              <h2 id="sala-jugadores" class="text-ui-h5 text-text-primary">Jugadores · {{ d.sala.miembros }}/{{ d.sala.plazas }}</h2>
              <ul class="flex flex-col gap-3">
                @for (f of d.filas; track f.miembroId) {
                  <li class="relative flex flex-wrap items-center gap-3 rounded-lg border bg-bg-card px-4 py-3" [class]="f.esYo ? 'border-line-accent' : 'border-line-subtle'">
                    @if (d.empezada) {
                      <span class="flex size-8 shrink-0 items-center justify-center rounded-full text-mono-s text-text-primary tabular-nums" [class]="medalla(f.puesto)">{{ f.puesto }}</span>
                    }
                    <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-700 text-display-label text-text-primary">{{ ini(f.alias) }}</span>
                    <p class="flex min-w-0 flex-1 flex-col gap-1">
                      <span class="flex flex-wrap items-center gap-2">
                        <span class="truncate text-label-s text-text-primary">&#64;{{ f.alias }}{{ f.esYo ? ' · tú' : '' }}</span>
                        @if (f.esAnfitrion) { <span class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill border border-warning bg-warning/12 px-2.5 text-label-xs text-warning">Anfitrión</span> }
                      </span>
                      <span class="text-body-xs text-text-tertiary">{{ d.empezada ? 'Alineación ' + f.conNota + '/5 con nota' : f.alineacion.length >= 5 ? 'Alineación completa 5/5' : 'Alineación ' + f.alineacion.length + '/5' }}</span>
                    </p>
                    @if (d.empezada) {
                      <p class="flex shrink-0 flex-col gap-0.5 text-right"><span class="text-mono-s tabular-nums" [class]="color(f)">{{ n2(f.nota) }}</span><span class="text-mono-xs text-text-muted">nota media</span></p>
                    } @else {
                      <p class="flex shrink-0 flex-col gap-0.5 text-right"><span class="text-mono-s text-accent-text tabular-nums">{{ monedas(f.saldo) }}</span><span class="text-mono-xs text-text-muted">monedas</span></p>
                    }
                    <button type="button" class="-m-2 flex size-11 shrink-0 items-center justify-center rounded-full text-text-tertiary hover:text-text-primary" aria-haspopup="dialog" [attr.aria-expanded]="popover() === f.miembroId" [attr.aria-label]="'Ver la alineación de @' + f.alias" (click)="alternarPopover(f.miembroId, $event)">
                      <gr-icon name="eye" [size]="16" />
                    </button>
                    @if (puedeExpulsar(f)) {
                      <button type="button" class="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-crimson px-3 text-label-xs text-crimson disabled:opacity-40 md:h-[30px]" [disabled]="operando() === f.miembroId" (click)="expulsar(f)">
                        <gr-icon name="x" [size]="16" />Expulsar
                      </button>
                    }
                    @if (popover() === f.miembroId) {
                      <gr-popover-alineacion [fila]="f" [sala]="d.sala.nombre" [final]="d.sala.estado === 'finalizada'" (cerrar)="cerrarPopover()" />
                    }
                  </li>
                }
                @if (!d.empezada && d.sala.miembros < d.sala.plazas && abierta()) {
                  <li class="flex items-center gap-3 rounded-[14px] border border-dashed border-line-strong px-4 py-3 text-body-s text-text-muted"><gr-icon name="plus" [size]="16" class="shrink-0" />Plaza libre · comparte el enlace</li>
                }
              </ul>
            </section>

            <aside class="flex min-w-0 flex-col gap-4 lg:w-[420px] lg:shrink-0">
              @if (esAnfitrion() && !d.empezada && abierta()) {
                <section id="solicitudes" class="flex flex-col gap-3 rounded-lg border border-line-accent bg-bg-surface p-5" aria-labelledby="sala-solicitudes">
                  <div class="flex items-center gap-2">
                    <h2 id="sala-solicitudes" class="min-w-0 flex-1 text-ui-h5 text-text-primary">Solicitudes de unión</h2>
                    @if (d.solicitudes.length) { <span class="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill border border-warning bg-warning/12 px-2.5 text-label-xs text-warning">{{ d.solicitudes.length }} {{ d.solicitudes.length === 1 ? 'pendiente' : 'pendientes' }}</span> }
                  </div>
                  <p class="text-body-xs text-text-tertiary">{{ textoSolicitudes() }}</p>
                  <ul class="flex flex-col gap-3 empty:hidden" aria-live="polite">
                    @for (s of d.solicitudes; track s.id) {
                      <li class="flex flex-col gap-3 rounded-md bg-bg-card p-3">
                        <p class="flex items-center gap-3">
                          <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-700 text-display-label text-text-primary">{{ ini(s.alias) }}</span>
                          <span class="flex min-w-0 flex-col gap-0.5"><span class="truncate text-label-s text-text-primary">&#64;{{ s.alias }}</span><span class="text-body-xs text-text-tertiary">Solicitud {{ hace(s.createdAt) }}</span></span>
                        </p>
                        <div class="grid grid-cols-2 gap-2">
                          <button type="button" grButton variant="primary" [block]="true" [loading]="operando() === s.id" [disabled]="llena()" (click)="responder(s.id, true)">Aceptar</button>
                          <button type="button" grButton variant="outline" [block]="true" [disabled]="operando() === s.id" (click)="responder(s.id, false)">Rechazar</button>
                        </div>
                      </li>
                    }
                  </ul>
                </section>
              }

              @if (d.codigo && !d.empezada && abierta()) {
                <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-surface p-5" aria-labelledby="sala-invitacion">
                  <h2 id="sala-invitacion" class="text-ui-h5 text-text-primary">Invita a tus amigos</h2>
                  <p class="text-body-s text-text-tertiary">{{ llena() ? 'Sala llena: el enlace no admite a nadie más.' : 'Quien abra el enlace entra directo, sin aprobación, si hay plaza y el día no ha empezado. Sin cuenta: se registra y vuelve aquí.' }}</p>
                  <p class="flex min-h-12 items-center gap-2 rounded-md border border-line-strong bg-bg-field py-1.5 pr-2 pl-4">
                    <span class="min-w-0 flex-1 text-mono-s break-all text-text-secondary">{{ enlaceTxt() }}</span>
                    <button type="button" class="inline-flex h-11 shrink-0 items-center gap-2 rounded-sm bg-accent px-3 text-label-xs text-text-primary md:h-7" (click)="copiar()"><gr-icon [name]="copiado() ? 'check' : 'copy'" [size]="16" />{{ copiado() ? 'Copiado' : 'Copiar' }}</button>
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <a class="inline-flex h-11 items-center gap-2 rounded-pill border border-line-strong px-3 text-label-xs text-text-secondary hover:text-text-primary md:h-[34px]" [href]="whatsapp()" target="_blank" rel="noopener"><gr-icon name="share" [size]="16" />WhatsApp</a>
                    <button type="button" class="inline-flex h-11 items-center gap-2 rounded-pill border border-line-strong px-3 text-label-xs text-text-secondary hover:text-text-primary md:h-[34px]" (click)="compartir()"><gr-icon name="instagram" [size]="16" />Instagram</button>
                    <a class="inline-flex h-11 items-center gap-2 rounded-pill border border-line-strong px-3 text-label-xs text-text-secondary hover:text-text-primary md:h-[34px]" [href]="correo()"><gr-icon name="mail" [size]="16" />Correo</a>
                    <button type="button" class="inline-flex h-11 items-center gap-2 rounded-pill border border-line-strong px-3 text-label-xs text-text-secondary hover:text-text-primary md:h-[34px]" [attr.aria-expanded]="!!qr()" (click)="alternarQr()"><gr-icon name="qr" [size]="16" />QR</button>
                  </div>
                  @if (qr(); as q) { <img [src]="q" width="180" height="180" class="self-start rounded-md" alt="Código QR del enlace de invitación a la sala" /> }
                  @if (esAnfitrion()) {
                    <button type="button" class="inline-flex min-h-11 items-center gap-2 self-start text-body-xs text-text-tertiary hover:text-text-primary md:min-h-0" [disabled]="operando() === 'enlace'" (click)="regenerar()"><gr-icon name="shuffle" [size]="16" />Regenerar enlace (invalida el anterior)</button>
                  }
                </section>
              }

              @if (esAnfitrion() && !d.empezada && abierta()) {
                <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-surface p-5" aria-labelledby="sala-acciones">
                  <h2 id="sala-acciones" class="text-ui-h5 text-text-primary">Acciones del anfitrión</h2>
                  <button type="button" grButton variant="outline" [block]="true" (click)="editando.set(true)">Editar sala</button>
                  <button type="button" class="flex h-11 w-full items-center justify-center rounded-md border border-crimson px-5 text-label-s text-crimson disabled:opacity-40" [disabled]="operando() === 'cerrar'" (click)="cerrarSala()">{{ confirmarCierre() ? 'Pulsa otra vez para cerrar la sala' : 'Cerrar sala' }}</button>
                  <p class="text-body-xs text-text-tertiary">Cerrar sala rechaza las solicitudes, expulsa a todos y libera sus atletas. No se puede si el día ya empezó.</p>
                </section>
              }

              @if (d.sala.esMia) {
                <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-surface p-5" aria-labelledby="sala-participacion">
                  <h2 id="sala-participacion" class="text-ui-h5 text-text-primary">Tu participación</h2>
                  <a grButton variant="primary" [block]="true" [href]="'/fantasy/salas/' + d.sala.id + '/equipo'">Ir a mi alineación</a>
                  <a grButton variant="outline" [block]="true" [href]="'/fantasy/salas/' + d.sala.id + '/mercado'">Ver mercado de la sala</a>
                  @if (d.empezada) {
                    <p class="text-body-xs text-text-tertiary">No puedes salir una vez iniciado el día: tu nota cuenta en el palmarés.</p>
                  } @else if (abierta()) {
                    <button type="button" grButton variant="outline" [block]="true" [disabled]="operando() === 'salir'" (click)="salir()">{{ confirmarSalida() ? 'Pulsa otra vez para salir' : 'Salir de la sala' }}</button>
                    <p class="text-body-xs text-text-tertiary">{{ esAnfitrion() ? 'Si sales, el anfitrión pasa al jugador más antiguo; si eres el único, la sala se cierra.' : 'Podrás salir hasta que empiece el día.' }}</p>
                  }
                </section>
              }

              <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-surface p-5" aria-labelledby="sala-mercado">
                <h2 id="sala-mercado" class="text-ui-h5 text-text-primary">Mercado de la sala</h2>
                @if (mercado(); as m) {
                  <p class="text-mono-s text-accent-text tabular-nums">{{ m.libres }} de {{ m.total }} atletas libres</p>
                  <span class="block h-1.5 overflow-hidden rounded-pill bg-bg-field" aria-hidden="true"><span class="block h-full rounded-pill bg-warning" [style.width.%]="m.total ? (m.libres / m.total) * 100 : 0"></span></span>
                }
                <p class="text-body-xs text-text-tertiary">Cada atleta tiene un solo dueño por sala. Alineación de exactamente 5 atletas{{ mercado()?.total ? ': ' + mercado()!.total + ' ÷ 5 = ' + d.plazasMax + ' plazas' : '' }}.</p>
              </section>
            </aside>
          </div>
        }
      </div>
    </gr-page>

    @if (toast(); as t) {
      <div class="fixed inset-x-4 top-20 z-40 flex items-center gap-3 rounded-md border border-line-accent bg-bg-deep px-4 py-3 shadow-card md:inset-x-auto md:top-24 md:right-6 md:w-[380px]" role="status" aria-live="polite">
        <gr-icon name="bell" [size]="20" class="shrink-0 text-text-secondary" />
        <p class="flex min-w-0 flex-1 flex-col gap-0.5"><span class="truncate text-label-s text-text-primary">Nueva solicitud de &#64;{{ t }}</span><span class="text-body-xs text-text-tertiary">Quiere unirse a tu sala · ahora</span></p>
        <a href="#solicitudes" class="flex min-h-11 shrink-0 items-center text-label-s text-accent-text hover:underline" (click)="toast.set(null)">Ver</a>
      </div>
    }
    @if (editando() && editable(); as e) {
      <gr-crear-sala-modal [editar]="e" [atletas]="mercado()?.total ?? 0" [plazasMax]="detalle()?.plazasMax ?? e.plazas" [alias]="detalle()?.sala?.anfitrion ?? ''" (cerrar)="editando.set(false)" (hecho)="editada()" />
    }
  `,
})
export class SalaPage {
  protected readonly n2 = nota2;
  protected readonly monedas = monedas;
  private readonly juegos = inject(Juegos);
  private readonly ruta = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seo = inject(Seo);
  protected readonly vivo = inject(JuegosEnVivo);
  protected readonly fan = inject(FanSession);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly id = this.ruta.snapshot.paramMap.get('id') ?? '';

  protected readonly detalle = signal<SalaDetalle | null>(null);
  protected readonly cargando = signal(true);
  protected readonly noExiste = signal(false);
  protected readonly errorCarga = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly operando = signal<string | null>(null);
  protected readonly popover = signal<string | null>(null);
  protected readonly mercado = signal<{ libres: number; total: number } | null>(null);
  protected readonly copiado = signal(false);
  protected readonly qr = signal<string | null>(null);
  protected readonly toast = signal<string | null>(null);
  protected readonly editando = signal(false);
  protected readonly confirmarCierre = signal(false);
  protected readonly confirmarSalida = signal(false);
  protected readonly ahora = signal(Date.now());
  private origenPopover: HTMLElement | null = null;
  private espera: ReturnType<typeof setTimeout> | undefined;
  private esperaToast: ReturnType<typeof setTimeout> | undefined;

  protected readonly sala = computed(() => this.detalle()?.sala ?? null);
  protected readonly esAnfitrion = computed(() => this.detalle()?.filas.some((f) => f.esYo && f.esAnfitrion) ?? false);
  protected readonly abierta = computed(() => ['esperando', 'lista', 'llena'].includes(this.sala()?.estado ?? ''));
  protected readonly llena = computed(() => (this.sala()?.miembros ?? 0) >= (this.sala()?.plazas ?? 0));
  protected readonly subtitulo = computed(() => {
    const d = this.detalle();
    if (!d) return '';
    const dia = d.jornada?.dia ? ' · día ' + new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(d.jornada.dia)) : '';
    return `${this.esAnfitrion() ? 'Eres el anfitrión' : 'Anfitrión @' + d.sala.anfitrion}${dia} · ${d.sala.miembros}/${d.sala.plazas} jugadores`;
  });
  protected readonly editable = computed<SalaEditable | null>(() => {
    const s = this.sala();
    return s ? { id: s.id, nombre: s.nombre, plazas: s.plazas, publica: s.publica, miembros: s.miembros } : null;
  });
  /** El aviso de estado de la sala (Figma «Aviso · …»). */
  protected readonly aviso = computed<{ tono: 'neutro' | 'exito' | 'aviso'; titulo: string; texto: string } | null>(() => {
    const d = this.detalle();
    if (!d) return null;
    const s = d.sala;
    const pend = d.solicitudes.length;
    const libres = s.plazas - s.miembros;
    switch (s.estado) {
      case 'esperando':
        return { tono: 'aviso', titulo: `Esperando mínimo 2 jugadores (${s.miembros}/2)`, texto: 'Con 1 jugador no se puede jugar. Si al empezar la primera sesión del día sigue así, la sala se cancela sin coste y no cuenta en el palmarés.' };
      case 'lista':
        return { tono: 'exito', titulo: `Lista para jugar · ${s.miembros}/${s.plazas}`, texto: `Hay ${s.miembros} jugadores (mín. 2)${pend ? ` y ${pend} ${pend === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'} para ${libres} ${libres === 1 ? 'plaza' : 'plazas'}` : ''}. La sala empieza sola con la primera sesión del día.` };
      case 'llena':
        return { tono: 'aviso', titulo: `Sala llena (${s.miembros}/${s.plazas})`, texto: 'No caben más jugadores: el enlace no admite solicitudes y las pendientes se han cancelado.' };
      case 'en_juego': {
        const yo = d.filas.find((f) => f.esYo);
        const lider = d.filas[0];
        const mio = yo ? (yo.puesto === 1 ? ` Vas 1.º con media ${nota2(yo.nota)}.` : ` Vas ${yo.puesto}.º con media ${nota2(yo.nota)}, a ${nota2(Math.max(0, (lider?.nota ?? 0) - yo.nota))} del líder.`) : '';
        return { tono: 'neutro', titulo: 'En juego', texto: 'La sala está cerrada a nuevos jugadores.' + mio };
      }
      case 'cancelada':
        return { tono: 'neutro', titulo: 'Sala cancelada', texto: 'No llegó al mínimo de 2 jugadores al empezar el día: no puntúa ni cuenta en el palmarés.' };
      case 'cerrada':
        return { tono: 'neutro', titulo: 'Sala cerrada', texto: 'El anfitrión cerró la sala antes de empezar.' };
      default:
        return { tono: 'neutro', titulo: 'Sala finalizada', texto: 'El día ha terminado: la clasificación final está en el palmarés.' };
    }
  });
  protected readonly textoSolicitudes = computed(() => {
    const s = this.sala();
    if (!s) return '';
    const libres = s.plazas - s.miembros;
    // «solo enlace»: no se lista en el lobby ni admite solicitudes; se entra directo con el enlace
    if (!s.publica) return libres <= 0 ? 'La sala está llena: el enlace ya no admite a nadie más.' : `${libres} ${libres === 1 ? 'plaza libre' : 'plazas libres'}. Tu sala no sale en el lobby: comparte el enlace y entran directo, sin solicitud.`;
    if (libres <= 0) return 'La sala está llena: solo puedes rechazar. Las solicitudes pendientes se cancelan solas.';
    if (!this.detalle()?.solicitudes.length) return `${libres} ${libres === 1 ? 'plaza libre' : 'plazas libres'}. Aquí verás a quien solicite unirse desde el lobby.`;
    return `${libres} ${libres === 1 ? 'plaza libre' : 'plazas libres'}. Al aceptar, las demás solicitudes quedan en espera; con la sala llena se cancelan.`;
  });
  protected readonly enlace = computed(() => (this.browser ? location.origin : '') + '/fantasy/unirse/' + (this.detalle()?.codigo ?? ''));
  protected readonly enlaceTxt = computed(() => this.enlace().replace(/^https?:\/\//, ''));
  private readonly mensaje = computed(() => `Únete a mi sala «${this.sala()?.nombre ?? ''}» de GRS Fantasy: ${this.enlace()}`);
  protected readonly whatsapp = computed(() => 'https://wa.me/?text=' + encodeURIComponent(this.mensaje()));
  protected readonly correo = computed(() => `mailto:?subject=${encodeURIComponent('Te invito a mi sala de GRS Fantasy')}&body=${encodeURIComponent(this.mensaje())}`);

  constructor() {
    void inject(PendingTasks).run(() => this.cargar());
    if (this.browser) {
      this.vivo.conectar();
      void this.fan.cargar().then((f) => f && this.recargar());
      const reloj = setInterval(() => this.ahora.set(Date.now()), 30000);
      // Miembros, solicitudes, notas y fichajes cambian en vivo: se recarga la sala agrupando los eventos seguidos.
      let primera = true;
      effect(() => {
        this.vivo.versionSalas();
        this.vivo.versionNotas();
        this.vivo.version();
        untracked(() => {
          if (primera) return void (primera = false);
          clearTimeout(this.espera);
          this.espera = setTimeout(() => void this.recargar(), 800);
        });
      });
      // Aviso en vivo al anfitrión cuando llega una solicitud nueva a esta sala.
      effect(() => {
        const ev = this.vivo.solicitud();
        untracked(() => {
          if (!ev || ev.salaId !== this.id || ev.tipo !== 'pendiente' || !this.esAnfitrion()) return;
          this.toast.set(ev.alias);
          clearTimeout(this.esperaToast);
          this.esperaToast = setTimeout(() => this.toast.set(null), 8000);
        });
      });
      inject(DestroyRef).onDestroy(() => {
        clearInterval(reloj);
        clearTimeout(this.espera);
        clearTimeout(this.esperaToast);
        this.vivo.desconectar();
      });
    }
  }

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    await this.recargar();
    this.cargando.set(false);
  }
  private async recargar(): Promise<void> {
    try {
      const d = await this.juegos.sala(this.id);
      this.detalle.set(d);
      this.noExiste.set(false);
      this.errorCarga.set(false);
      this.seo.set({ title: `${d.sala.nombre} · Salas de GRS Fantasy`, description: `La sala «${d.sala.nombre}» de GRS Fantasy: jugadores, clasificación en directo y mercado.`, path: '/fantasy/salas/' + this.id });
      void this.juegos
        .fantasyMercado(d.jornada?.id, this.id)
        .then((m) => this.mercado.set({ libres: m.atletas.filter((a) => a.libre).length, total: m.atletas.length }))
        .catch(() => undefined);
    } catch (e) {
      if (codigoError(e) === 'HTTP_404' || /NOT_FOUND|NO_ENCONTRAD/.test(codigoError(e))) this.noExiste.set(true);
      else if (!this.detalle()) this.errorCarga.set(true);
    }
  }

  protected ini(alias: string): string {
    return iniciales(alias);
  }
  protected color(f: FilaSala): string {
    return colorNota(f.nota, f.conNota > 0);
  }
  protected medalla(puesto: number): string {
    return puesto >= 1 && puesto <= 3 ? MEDALLA[puesto as 1 | 2 | 3].fondo.replace(/\/\d+$/, '') : 'bg-bg-raised';
  }
  protected puedeExpulsar(f: FilaSala): boolean {
    return this.esAnfitrion() && !f.esYo && !this.detalle()?.empezada && this.abierta();
  }
  /** «hace 2 min» (se refresca cada 30 s). */
  protected hace(iso: string): string {
    const min = Math.max(0, Math.round((this.ahora() - new Date(iso).getTime()) / 60000));
    if (min < 1) return 'ahora';
    return min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h`;
  }

  private async operar(clave: string, f: () => Promise<unknown>): Promise<boolean> {
    this.operando.set(clave);
    this.error.set(null);
    try {
      await f();
      return true;
    } catch (e) {
      this.error.set(mensajeError(e));
      if (codigoError(e).startsWith('SESION_FAN')) this.fan.sesionPerdida();
      return false;
    } finally {
      await this.recargar();
      this.operando.set(null);
    }
  }
  protected responder(solicitudId: string, aceptar: boolean): void {
    void this.operar(solicitudId, () => this.juegos.responderSolicitud(this.id, solicitudId, aceptar));
  }
  protected expulsar(f: FilaSala): void {
    void this.operar(f.miembroId, () => this.juegos.expulsar(this.id, f.miembroId));
  }
  protected regenerar(): void {
    this.qr.set(null);
    void this.operar('enlace', () => this.juegos.editarSala(this.id, { regenerarEnlace: true }));
  }
  /** Cerrar y salir piden un segundo toque (son irreversibles). */
  protected async cerrarSala(): Promise<void> {
    if (!this.confirmarCierre()) return this.confirmarCierre.set(true);
    this.confirmarCierre.set(false);
    if (await this.operar('cerrar', () => this.juegos.cerrarSala(this.id))) void this.router.navigate(['/fantasy/salas']);
  }
  protected async salir(): Promise<void> {
    if (!this.confirmarSalida()) return this.confirmarSalida.set(true);
    this.confirmarSalida.set(false);
    if (await this.operar('salir', () => this.juegos.salirSala(this.id))) void this.router.navigate(['/fantasy/salas']);
  }
  protected editada(): void {
    this.editando.set(false);
    void this.recargar();
  }

  protected async copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.enlace());
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    } catch {
      this.error.set('No se pudo copiar el enlace: selecciónalo y cópialo a mano.');
    }
  }
  /** Instagram no tiene enlace de compartir: se abre la hoja de compartir del sistema o, si no hay, se copia el enlace. */
  protected async compartir(): Promise<void> {
    if (navigator.share) await navigator.share({ title: 'GRS Fantasy', text: this.mensaje() }).catch(() => undefined);
    else await this.copiar();
  }
  protected alternarQr(): void {
    if (this.qr()) return this.qr.set(null);
    void import('qrcode').then(async (m) => this.qr.set(await (m.default ?? m).toDataURL(this.enlace(), { margin: 1, width: 360 })));
  }

  protected alternarPopover(id: string, e: Event): void {
    this.origenPopover = e.currentTarget as HTMLElement;
    this.popover.set(this.popover() === id ? null : id);
  }
  protected cerrarPopover(): void {
    this.popover.set(null);
    const o = this.origenPopover;
    this.origenPopover = null;
    if (o?.isConnected) o.focus({ preventScroll: true });
  }
}

/**
 * fantasy/unirse.ts — /fantasy/unirse/:codigo (Figma «81 · /fantasy/salas» · Unirme con el enlace del anfitrión):
 * el enlace de invitación entra directo, sin aprobación, si hay plaza y el día no ha empezado. Sin cuenta, el fan
 * pide su enlace de acceso (el destino viaja con él) y vuelve aquí. Y los estados del enlace: no válido, sala
 * llena, ya empezada, ya miembro o ya en otra sala.
 */
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, PendingTasks, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { FanSession, codigoError } from '../../core/fan';
import { Juegos, mensajeError, type Invitacion } from '../../core/juegos';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { JuegosNav, iniciales } from '../porra/componentes';
import { FantasyCabecera, GrAviso } from './componentes';
import { TarjetaEstado } from './salas-ui';

@Component({
  selector: 'gr-unirse-page',
  imports: [Page, GrButton, GrIcon, GrSkeleton, FantasyCabecera, GrAviso, JuegosNav, TarjetaEstado],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page title="Te han invitado a una sala" [juego]="true">
      <gr-fantasy-cabecera titulo="Te han invitado a una sala" [migas]="['Unirse']" descripcion="Entras directo con el enlace del anfitrión, sin aprobación. Solo puedes jugar en una sala por día." />
      <div class="flex flex-col gap-4 md:gap-6">
        <gr-juegos-nav juego="fantasy" activa="salas" />

        @if (cargando()) {
          <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]" aria-busy="true"><gr-skeleton class="h-60 rounded-lg" /><gr-skeleton class="h-60 rounded-xl" /></div>
        } @else if (invalido()) {
          <gr-tarjeta-estado class="max-w-[410px]" tono="error" icono="circle-alert" titulo="Enlace no válido, caducado o regenerado">Este enlace no existe, el anfitrión lo regeneró o la sala ya no está activa.
            <a acciones grButton variant="primary" [block]="true" href="/fantasy/salas">Ver salas abiertas</a>
          </gr-tarjeta-estado>
        } @else if (errorCarga()) {
          <gr-aviso tono="error" titulo="No se pudo cargar la invitación">Comprueba tu conexión e inténtalo de nuevo.</gr-aviso>
          <button type="button" grButton variant="outline" class="self-start" (click)="cargar()">Reintentar</button>
        } @else if (inv(); as i) {
          @switch (i.estado) {
            @case ('llena') {
              <gr-tarjeta-estado class="max-w-[410px]" tono="aviso" icono="users" titulo="Sala llena">«{{ i.sala.nombre }}» tiene {{ i.sala.miembros }}/{{ i.sala.plazas }} jugadores: el enlace no admite a nadie más.
                <a acciones grButton variant="primary" [block]="true" href="/fantasy/salas">Ver otras salas abiertas</a>
              </gr-tarjeta-estado>
            }
            @case ('empezada') {
              <gr-tarjeta-estado class="max-w-[410px]" tono="aviso" icono="lock" titulo="La sala ya ha empezado">La primera sesión del día ya empezó y la sala no admite jugadores.
                <a acciones grButton variant="primary" [block]="true" href="/fantasy/palmares">Ver palmarés de hoy</a>
                <a acciones grButton variant="outline" [block]="true" href="/fantasy/salas">Crear una sala para mañana</a>
              </gr-tarjeta-estado>
            }
            @case ('cerrada') {
              <gr-tarjeta-estado class="max-w-[410px]" tono="error" icono="circle-alert" titulo="Enlace no válido, caducado o regenerado">Este enlace no existe, el anfitrión lo regeneró o la sala ya no está activa.
                <a acciones grButton variant="primary" [block]="true" href="/fantasy/salas">Ver salas abiertas</a>
              </gr-tarjeta-estado>
            }
            @case ('expulsado') {
              <gr-tarjeta-estado class="max-w-[410px]" tono="error" icono="x" titulo="No puedes volver a esta sala">El anfitrión te expulsó de «{{ i.sala.nombre }}»: este enlace ya no te deja entrar.
                <a acciones grButton variant="primary" [block]="true" href="/fantasy/salas">Ver otras salas abiertas</a>
              </gr-tarjeta-estado>
            }
            @case ('ya_miembro') {
              <gr-tarjeta-estado class="max-w-[410px]" icono="circle-check" titulo="Ya eres miembro de esta sala">Estás en «{{ i.sala.nombre }}» como &#64;{{ fan.yo()?.alias }}.
                <a acciones grButton variant="primary" [block]="true" [href]="'/fantasy/salas/' + i.sala.id">Ir a la sala</a>
              </gr-tarjeta-estado>
            }
            @case ('otra_sala') {
              <gr-tarjeta-estado class="max-w-[410px]" tono="aviso" icono="circle-alert" titulo="Ya estás en otra sala hoy">Solo puedes jugar en una sala por día: sal de la tuya antes de unirte a «{{ i.sala.nombre }}».
                <a acciones grButton variant="primary" [block]="true" href="/fantasy">Ir a mi sala</a>
                <a acciones grButton variant="outline" [block]="true" href="/fantasy/salas">Cancelar</a>
              </gr-tarjeta-estado>
            }
            @default {
              <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                <section class="flex min-w-0 flex-col gap-3 rounded-lg border border-line-subtle bg-bg-surface p-6 lg:flex-1" aria-label="La invitación">
                  <p class="flex items-center gap-3">
                    <span class="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-700 text-display-label text-text-primary">{{ ini(i.sala.anfitrion) }}</span>
                    <span class="flex min-w-0 flex-col gap-0.5"><span class="text-mono-xs text-text-muted">Te invita &#64;{{ i.sala.anfitrion }}</span><span class="text-ui-h4 text-text-primary">{{ i.sala.nombre }}</span></span>
                  </p>
                  <p class="flex items-center gap-3 text-body-s text-text-secondary"><gr-icon name="users" [size]="16" class="shrink-0" />{{ i.sala.miembros }}/{{ i.sala.plazas }} jugadores · {{ libres() === 1 ? 'queda 1 plaza' : 'quedan ' + libres() + ' plazas' }}</p>
                  @if (dia()) { <p class="flex items-center gap-3 text-body-s text-text-secondary"><gr-icon name="calendar" [size]="16" class="shrink-0" />Día {{ dia() }} · empieza con la primera sesión</p> }
                  <p class="flex items-center gap-3 text-body-s text-text-secondary"><gr-icon name="trophy" [size]="16" class="shrink-0" />Gana quien tenga mejor media de las 5 notas de su alineación</p>
                </section>

                @if (i.estado === 'disponible') {
                  <section class="flex min-w-0 flex-col gap-4 rounded-xl border border-line-accent bg-bg-card p-6 lg:w-[420px] lg:shrink-0" aria-label="Unirme a la sala">
                    <p class="text-mono-xs text-text-muted">Entrarás como</p>
                    <p class="flex items-center gap-3">
                      <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-700 text-display-label text-text-primary">{{ ini(fan.yo()?.alias ?? '') }}</span>
                      <span class="truncate text-label-s text-text-primary">&#64;{{ fan.yo()?.alias }}</span>
                    </p>
                    @if (i.solicitudesPendientes > 0) {
                      <gr-aviso tono="aviso" [titulo]="i.solicitudesPendientes === 1 ? 'Tienes 1 solicitud pendiente' : 'Tienes ' + i.solicitudesPendientes + ' solicitudes pendientes'">Al unirte con el enlace se {{ i.solicitudesPendientes === 1 ? 'cancela' : 'cancelan' }}.</gr-aviso>
                    }
                    @if (error(); as e) { <gr-aviso tono="error" titulo="No has podido entrar">{{ e }}</gr-aviso> }
                    <button type="button" grButton variant="primary" size="l" [block]="true" [loading]="entrando()" (click)="entrar()">{{ i.solicitudesPendientes > 0 ? 'Unirme y cancelar solicitudes' : 'Unirme a la sala' }}</button>
                    <a grButton variant="outline" [block]="true" href="/fantasy/salas">Ahora no</a>
                    <p class="text-body-xs text-text-tertiary">Recibirás 1.000.000 monedas al entrar. Podrás salir hasta que empiece el día.</p>
                  </section>
                }
              </div>

              @if (i.estado === 'sin_sesion') {
                <ol class="grid gap-4 lg:grid-cols-3 lg:items-start" aria-label="Cómo entrar sin cuenta">
                  <li class="flex flex-col gap-3 rounded-xl border border-line-subtle bg-bg-surface p-7">
                    <span class="flex size-8 items-center justify-center rounded-full bg-accent text-mono-s text-text-primary">1</span>
                    <p class="text-ui-h5 text-text-primary">Tu correo y alias</p>
                    <p class="text-body-s text-text-secondary">Te mandamos un enlace de acceso. Si ya tienes cuenta, entras directamente.</p>
                    <p class="text-body-xs text-text-tertiary">El alias es visible en la sala y el palmarés. El destino de la sala viaja en el enlace.</p>
                    <button type="button" grButton variant="primary" [block]="true" (click)="acceder()">Enviarme el enlace de acceso</button>
                  </li>
                  <li class="flex flex-col gap-3 rounded-xl border border-line-subtle bg-bg-surface p-7">
                    <span class="flex size-8 items-center justify-center rounded-full bg-accent text-mono-s text-text-primary">2</span>
                    <p class="text-ui-h5 text-text-primary">Revisa tu correo</p>
                    <p class="text-body-s text-text-secondary">El enlace caduca en 30 minutos y solo funciona una vez.</p>
                    <p class="text-body-xs text-text-tertiary">Puedes abrirlo en otro dispositivo: te lleva igualmente a la sala.</p>
                  </li>
                  <li class="flex flex-col gap-3 rounded-xl border border-success bg-bg-deep p-7">
                    <span class="flex size-8 items-center justify-center rounded-full bg-accent text-mono-s text-text-primary">3</span>
                    <p class="text-ui-h5 text-text-primary">Cuenta lista · entras directo</p>
                    <p class="text-body-s text-text-secondary">Volvemos a «{{ i.sala.nombre }}». Confirma y entras sin esperar aprobación.</p>
                    <p class="text-body-xs text-text-tertiary">Si la sala se llenó o empezó mientras tanto, verás el estado correspondiente.</p>
                  </li>
                </ol>
              }
            }
          }
        }
      </div>
    </gr-page>
  `,
})
export class UnirsePage {
  private readonly juegos = inject(Juegos);
  private readonly router = inject(Router);
  protected readonly fan = inject(FanSession);
  private readonly codigo = inject(ActivatedRoute).snapshot.paramMap.get('codigo') ?? '';

  protected readonly inv = signal<Invitacion | null>(null);
  protected readonly cargando = signal(true);
  protected readonly invalido = signal(false);
  protected readonly errorCarga = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly entrando = signal(false);

  protected readonly libres = computed(() => Math.max(0, (this.inv()?.sala.plazas ?? 0) - (this.inv()?.sala.miembros ?? 0)));
  protected readonly dia = computed(() => {
    const d = this.inv()?.jornada?.dia;
    return d ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(d)) : '';
  });

  constructor() {
    inject(Seo).set({ title: 'Te han invitado a una sala · GRS Fantasy', description: 'Entra en la sala de GRS Fantasy con el enlace de tu anfitrión.', path: '/fantasy/unirse/' + this.codigo });
    void inject(PendingTasks).run(() => this.cargar());
    // Con SSR la invitación se pinta sin sesión: en el navegador se vuelve a pedir ya con la cookie del fan.
    if (isPlatformBrowser(inject(PLATFORM_ID))) void this.fan.cargar().then((f) => f && this.cargar(false));
  }

  protected async cargar(esqueleto = true): Promise<void> {
    if (esqueleto) this.cargando.set(true);
    try {
      this.inv.set(await this.juegos.invitacion(this.codigo));
      this.invalido.set(false);
      this.errorCarga.set(false);
    } catch (e) {
      if (/^HTTP_4/.test(codigoError(e)) || /NOT_FOUND|NO_ENCONTRAD|INVITACION/.test(codigoError(e))) this.invalido.set(true);
      else this.errorCarga.set(true);
    } finally {
      this.cargando.set(false);
    }
  }

  protected ini(alias: string): string {
    return iniciales(alias);
  }
  /** Sin cuenta: el modal de acceso pide correo y alias; el enlace mágico vuelve a esta invitación. */
  protected acceder(): void {
    this.fan.abrirAcceso('fantasy', '/fantasy/unirse/' + this.codigo);
  }
  protected async entrar(): Promise<void> {
    this.entrando.set(true);
    this.error.set(null);
    try {
      const { salaId } = await this.juegos.entrarConInvitacion(this.codigo);
      void this.router.navigate(['/fantasy/salas', salaId]);
    } catch (e) {
      if (codigoError(e).startsWith('SESION_FAN')) this.fan.sesionPerdida();
      // La sala pudo llenarse o empezar mientras tanto: se vuelve a pedir la invitación para pintar su estado.
      await this.cargar(false);
      if (this.inv()?.estado === 'disponible') this.error.set(mensajeError(e));
    } finally {
      this.entrando.set(false);
    }
  }
}

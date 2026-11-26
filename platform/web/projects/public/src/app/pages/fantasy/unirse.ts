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
import { I18n, LocPipe } from '../../core/i18n';
import { Seo } from '../../core/seo';
import { Page } from '../../layout/page';
import { JuegosNav, iniciales } from '../porra/componentes';
import { FantasyCabecera, GrAviso } from './componentes';
import { TarjetaEstado } from './salas-ui';

const T = {
  es: {
    titulo: 'Te han invitado a una sala',
    unirse: 'Unirse',
    desc: 'Entras directo con el enlace del anfitrión, sin aprobación. Solo puedes jugar en una sala por día.',
    invalido: 'Enlace no válido, caducado o regenerado',
    invalidoTxt: 'Este enlace no existe, el anfitrión lo regeneró o la sala ya no está activa.',
    verAbiertas: 'Ver salas abiertas',
    errorCarga: 'No se pudo cargar la invitación',
    errorCargaTxt: 'Comprueba tu conexión e inténtalo de nuevo.',
    reintentar: 'Reintentar',
    llena: 'Sala llena',
    llenaTxt: (n: string, m: number, p: number) => `«${n}» tiene ${m}/${p} jugadores: el enlace no admite a nadie más.`,
    verOtras: 'Ver otras salas abiertas',
    empezada: 'La sala ya ha empezado',
    empezadaTxt: 'La sala ya está jugando y no admite jugadores.',
    palmaresHoy: 'Ver palmarés de hoy',
    crearManana: 'Crear una sala para mañana',
    expulsado: 'No puedes volver a esta sala',
    expulsadoTxt: (n: string) => `El anfitrión te expulsó de «${n}»: este enlace ya no te deja entrar.`,
    yaMiembro: 'Ya eres miembro de esta sala',
    yaMiembroTxt: (n: string, a: string) => `Estás en «${n}» como @${a}.`,
    irSala: 'Ir a la sala',
    otraSala: 'Ya estás en otra sala hoy',
    otraSalaTxt: (n: string) => `Solo puedes jugar en una sala por día: sal de la tuya antes de unirte a «${n}».`,
    irMiSala: 'Ir a mi sala',
    cancelar: 'Cancelar',
    laInvitacion: 'La invitación',
    teInvita: 'Te invita',
    jugadores: (m: number, p: number, l: number) => `${m}/${p} jugadores · ${l === 1 ? 'queda 1 plaza' : 'quedan ' + l + ' plazas'}`,
    dia: (d: string) => `Día ${d} · empieza con la primera sesión`,
    gana: 'Gana quien tenga mejor media de las 5 notas de su alineación',
    unirmeSala: 'Unirme a la sala',
    entraras: 'Entrarás como',
    pendientes: (n: number) => (n === 1 ? 'Tienes 1 solicitud pendiente' : 'Tienes ' + n + ' solicitudes pendientes'),
    alUnirte: (n: number) => `Al unirte con el enlace se ${n === 1 ? 'cancela' : 'cancelan'}.`,
    noEntrar: 'No has podido entrar',
    unirmeCancelar: 'Unirme y cancelar solicitudes',
    ahoraNo: 'Ahora no',
    recibiras: 'Recibirás 1.000.000 monedas al entrar. Podrás salir hasta que empiece el día.',
    sinCuenta: 'Cómo entrar sin cuenta',
    p1: 'Tu correo y alias',
    p1a: 'Te mandamos un enlace de acceso. Si ya tienes cuenta, entras directamente.',
    p1b: 'El alias es visible en la sala y el palmarés. El destino de la sala viaja en el enlace.',
    p1btn: 'Enviarme el enlace de acceso',
    p2: 'Revisa tu correo',
    p2a: 'El enlace caduca en 30 minutos y solo funciona una vez.',
    p2b: 'Puedes abrirlo en otro dispositivo: te lleva igualmente a la sala.',
    p3: 'Cuenta lista · entras directo',
    p3a: (n: string) => `Volvemos a «${n}». Confirma y entras sin esperar aprobación.`,
    p3b: 'Si la sala se llenó o empezó mientras tanto, verás el estado correspondiente.',
    seoTitulo: 'Te han invitado a una sala · GRS Fantasy',
    seoDesc: 'Entra en la sala de GRS Fantasy con el enlace de tu anfitrión.',
  },
  en: {
    titulo: "You've been invited to a league",
    unirse: 'Join',
    desc: "You get straight in with the host's link, no approval needed. You can only play in one league per day.",
    invalido: 'Invalid, expired or regenerated link',
    invalidoTxt: 'This link does not exist, the host regenerated it or the league is no longer active.',
    verAbiertas: 'See open leagues',
    errorCarga: "The invitation couldn't be loaded",
    errorCargaTxt: 'Check your connection and try again.',
    reintentar: 'Try again',
    llena: 'League full',
    llenaTxt: (n: string, m: number, p: number) => `“${n}” has ${m}/${p} players: the link can't admit anyone else.`,
    verOtras: 'See other open leagues',
    empezada: 'The league has already started',
    empezadaTxt: "The league is already playing and isn't admitting players.",
    palmaresHoy: "See today's honours",
    crearManana: 'Create a league for tomorrow',
    expulsado: "You can't return to this league",
    expulsadoTxt: (n: string) => `The host removed you from “${n}”: this link no longer lets you in.`,
    yaMiembro: 'You are already a member of this league',
    yaMiembroTxt: (n: string, a: string) => `You are in “${n}” as @${a}.`,
    irSala: 'Go to the league',
    otraSala: 'You are already in another league today',
    otraSalaTxt: (n: string) => `You can only play in one league per day: leave yours before joining “${n}”.`,
    irMiSala: 'Go to my league',
    cancelar: 'Cancel',
    laInvitacion: 'The invitation',
    teInvita: 'Invited by',
    jugadores: (m: number, p: number, l: number) => `${m}/${p} players · ${l === 1 ? '1 place left' : l + ' places left'}`,
    dia: (d: string) => `Day ${d} · starts with the first session`,
    gana: 'The winner is whoever has the best average of the 5 scores in their line-up',
    unirmeSala: 'Join the league',
    entraras: 'You will join as',
    pendientes: (n: number) => (n === 1 ? 'You have 1 pending request' : 'You have ' + n + ' pending requests'),
    alUnirte: (n: number) => `Joining with the link cancels ${n === 1 ? 'it' : 'them'}.`,
    noEntrar: "You couldn't get in",
    unirmeCancelar: 'Join and cancel requests',
    ahoraNo: 'Not now',
    recibiras: 'You will receive 1,000,000 coins when you join. You can leave until the day starts.',
    sinCuenta: 'How to join without an account',
    p1: 'Your email and alias',
    p1a: 'We send you a sign-in link. If you already have an account, you go straight in.',
    p1b: 'Your alias is visible in the league and the honours. The league destination travels in the link.',
    p1btn: 'Send me the sign-in link',
    p2: 'Check your email',
    p2a: 'The link expires in 30 minutes and only works once.',
    p2b: 'You can open it on another device: it still takes you to the league.',
    p3: 'Account ready · straight in',
    p3a: (n: string) => `We take you back to “${n}”. Confirm and you're in without waiting for approval.`,
    p3b: 'If the league filled up or started in the meantime, you will see the corresponding status.',
    seoTitulo: "You've been invited to a league · GRS Fantasy",
    seoDesc: "Join the GRS Fantasy league with your host's link.",
  },
};

@Component({
  selector: 'gr-unirse-page',
  imports: [LocPipe, Page, GrButton, GrIcon, GrSkeleton, FantasyCabecera, GrAviso, JuegosNav, TarjetaEstado],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page [title]="t().titulo" [juego]="true">
      <gr-fantasy-cabecera [titulo]="t().titulo" [migas]="[t().unirse]" [descripcion]="t().desc" />
      <div class="flex flex-col gap-4 md:gap-6">
        <gr-juegos-nav juego="fantasy" activa="salas" />

        @if (cargando()) {
          <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]" aria-busy="true"><gr-skeleton class="h-60 rounded-lg" /><gr-skeleton class="h-60 rounded-xl" /></div>
        } @else if (invalido()) {
          <gr-tarjeta-estado class="max-w-[410px]" tono="error" icono="circle-alert" [titulo]="t().invalido">{{ t().invalidoTxt }}
            <a acciones grButton variant="primary" [block]="true" [href]="'/fantasy/salas' | loc">{{ t().verAbiertas }}</a>
          </gr-tarjeta-estado>
        } @else if (errorCarga()) {
          <gr-aviso tono="error" [titulo]="t().errorCarga">{{ t().errorCargaTxt }}</gr-aviso>
          <button type="button" grButton variant="outline" class="self-start" (click)="cargar()">{{ t().reintentar }}</button>
        } @else if (inv(); as i) {
          @switch (i.estado) {
            @case ('llena') {
              <gr-tarjeta-estado class="max-w-[410px]" tono="aviso" icono="users" [titulo]="t().llena">{{ t().llenaTxt(i.sala.nombre, i.sala.miembros, i.sala.plazas) }}
                <a acciones grButton variant="primary" [block]="true" [href]="'/fantasy/salas' | loc">{{ t().verOtras }}</a>
              </gr-tarjeta-estado>
            }
            @case ('empezada') {
              <gr-tarjeta-estado class="max-w-[410px]" tono="aviso" icono="lock" [titulo]="t().empezada">{{ t().empezadaTxt }}
                <a acciones grButton variant="primary" [block]="true" [href]="'/fantasy/palmares' | loc">{{ t().palmaresHoy }}</a>
                <a acciones grButton variant="outline" [block]="true" [href]="'/fantasy/salas' | loc">{{ t().crearManana }}</a>
              </gr-tarjeta-estado>
            }
            @case ('cerrada') {
              <gr-tarjeta-estado class="max-w-[410px]" tono="error" icono="circle-alert" [titulo]="t().invalido">{{ t().invalidoTxt }}
                <a acciones grButton variant="primary" [block]="true" [href]="'/fantasy/salas' | loc">{{ t().verAbiertas }}</a>
              </gr-tarjeta-estado>
            }
            @case ('expulsado') {
              <gr-tarjeta-estado class="max-w-[410px]" tono="error" icono="x" [titulo]="t().expulsado">{{ t().expulsadoTxt(i.sala.nombre) }}
                <a acciones grButton variant="primary" [block]="true" [href]="'/fantasy/salas' | loc">{{ t().verOtras }}</a>
              </gr-tarjeta-estado>
            }
            @case ('ya_miembro') {
              <gr-tarjeta-estado class="max-w-[410px]" icono="circle-check" [titulo]="t().yaMiembro">{{ t().yaMiembroTxt(i.sala.nombre, fan.yo()?.alias ?? '') }}
                <a acciones grButton variant="primary" [block]="true" [href]="'/fantasy/salas/' + i.sala.id | loc">{{ t().irSala }}</a>
              </gr-tarjeta-estado>
            }
            @case ('otra_sala') {
              <gr-tarjeta-estado class="max-w-[410px]" tono="aviso" icono="circle-alert" [titulo]="t().otraSala">{{ t().otraSalaTxt(i.sala.nombre) }}
                <a acciones grButton variant="primary" [block]="true" [href]="'/fantasy' | loc">{{ t().irMiSala }}</a>
                <a acciones grButton variant="outline" [block]="true" [href]="'/fantasy/salas' | loc">{{ t().cancelar }}</a>
              </gr-tarjeta-estado>
            }
            @default {
              <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                <section class="flex min-w-0 flex-col gap-3 rounded-lg border border-line-subtle bg-bg-surface p-6 lg:flex-1" [attr.aria-label]="t().laInvitacion">
                  <p class="flex items-center gap-3">
                    <span class="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-700 text-display-label text-text-primary">{{ ini(i.sala.anfitrion) }}</span>
                    <span class="flex min-w-0 flex-col gap-0.5"><span class="text-meta text-text-tertiary">{{ t().teInvita }} &#64;{{ i.sala.anfitrion }}</span><span class="text-ui-h4 text-text-primary">{{ i.sala.nombre }}</span></span>
                  </p>
                  <p class="flex items-center gap-3 text-body-s text-text-secondary"><gr-icon name="users" [size]="16" class="shrink-0" />{{ t().jugadores(i.sala.miembros, i.sala.plazas, libres()) }}</p>
                  @if (dia()) { <p class="flex items-center gap-3 text-body-s text-text-secondary"><gr-icon name="calendar" [size]="16" class="shrink-0" />{{ t().dia(dia()) }}</p> }
                  <p class="flex items-center gap-3 text-body-s text-text-secondary"><gr-icon name="trophy" [size]="16" class="shrink-0" />{{ t().gana }}</p>
                </section>

                @if (i.estado === 'disponible') {
                  <section class="flex min-w-0 flex-col gap-4 rounded-xl border border-line-accent bg-bg-card p-6 lg:w-[420px] lg:shrink-0" [attr.aria-label]="t().unirmeSala">
                    <p class="text-meta text-text-tertiary">{{ t().entraras }}</p>
                    <p class="flex items-center gap-3">
                      <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-700 text-display-label text-text-primary">{{ ini(fan.yo()?.alias ?? '') }}</span>
                      <span class="truncate text-label-s text-text-primary">&#64;{{ fan.yo()?.alias }}</span>
                    </p>
                    @if (i.solicitudesPendientes > 0) {
                      <gr-aviso tono="aviso" [titulo]="t().pendientes(i.solicitudesPendientes)">{{ t().alUnirte(i.solicitudesPendientes) }}</gr-aviso>
                    }
                    @if (error(); as e) { <gr-aviso tono="error" [titulo]="t().noEntrar">{{ e }}</gr-aviso> }
                    <button type="button" grButton variant="primary" size="l" [block]="true" [loading]="entrando()" (click)="entrar()">{{ i.solicitudesPendientes > 0 ? t().unirmeCancelar : t().unirmeSala }}</button>
                    <a grButton variant="outline" [block]="true" [href]="'/fantasy/salas' | loc">{{ t().ahoraNo }}</a>
                    <p class="text-body-s text-text-tertiary">{{ t().recibiras }}</p>
                  </section>
                }
              </div>

              @if (i.estado === 'sin_sesion') {
                <ol class="grid gap-4 lg:grid-cols-3 lg:items-start" [attr.aria-label]="t().sinCuenta">
                  <li class="flex flex-col gap-3 rounded-xl border border-line-subtle bg-bg-surface p-7">
                    <span class="flex size-8 items-center justify-center rounded-full bg-accent text-mono-s text-text-primary">1</span>
                    <p class="text-ui-h5 text-text-primary">{{ t().p1 }}</p>
                    <p class="text-body-s text-text-secondary">{{ t().p1a }}</p>
                    <p class="text-body-s text-text-tertiary">{{ t().p1b }}</p>
                    <button type="button" grButton variant="primary" [block]="true" (click)="acceder()">{{ t().p1btn }}</button>
                  </li>
                  <li class="flex flex-col gap-3 rounded-xl border border-line-subtle bg-bg-surface p-7">
                    <span class="flex size-8 items-center justify-center rounded-full bg-accent text-mono-s text-text-primary">2</span>
                    <p class="text-ui-h5 text-text-primary">{{ t().p2 }}</p>
                    <p class="text-body-s text-text-secondary">{{ t().p2a }}</p>
                    <p class="text-body-s text-text-tertiary">{{ t().p2b }}</p>
                  </li>
                  <li class="flex flex-col gap-3 rounded-xl border border-success bg-bg-deep p-7">
                    <span class="flex size-8 items-center justify-center rounded-full bg-accent text-mono-s text-text-primary">3</span>
                    <p class="text-ui-h5 text-text-primary">{{ t().p3 }}</p>
                    <p class="text-body-s text-text-secondary">{{ t().p3a(i.sala.nombre) }}</p>
                    <p class="text-body-s text-text-tertiary">{{ t().p3b }}</p>
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
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
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
    return d ? new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'short' }).format(new Date(d)) : '';
  });

  constructor() {
    inject(Seo).set({ title: this.t().seoTitulo, description: this.t().seoDesc, path: '/fantasy/unirse/' + this.codigo });
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
    this.fan.abrirAcceso('fantasy', this.i18n.path('/fantasy/unirse/' + this.codigo));
  }
  protected async entrar(): Promise<void> {
    this.entrando.set(true);
    this.error.set(null);
    try {
      const { salaId } = await this.juegos.entrarConInvitacion(this.codigo);
      void this.router.navigate([this.i18n.path('/fantasy/salas'), salaId]);
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

import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrIcon, GrSkeleton, GrStatus, type GrStatusTone } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { AREA_API, type Panel } from '../core/area';
import { hora } from '../core/atletas';
import { I18n, LocPipe } from '../core/i18n';

/** «Mis horarios» of the athlete area: the day, weigh-in, lot and start time the organisation published. */
interface MiHorario {
  publicado: boolean;
  dia?: string;
  lote?: number;
  inicio?: string;
  pesajeInicio?: string;
  pesajeFin?: string;
  sesion?: string;
  sesionNivel?: string;
  zonaHoraria: string;
  ics?: string;
}
/** Live snapshot of the event (live service): only what «Mis horarios» needs to tell where the day is. */
interface Directo {
  fase: 'antes' | 'en_directo' | 'finalizado';
  sesion?: { hora: string; titulo: string };
}

const T = {
  es: {
    volver: 'Mi área', h1: 'Mis horarios',
    sub: 'Tu día en la GRS Cup 2', subFecha: (d: string) => 'Tu día: ' + d,
    sinPublicar: 'Horario por publicar', sinPublicarTxt: 'Cuando la organización publique los horarios verás aquí tu pesaje, tu lote y tu hora de salida. Te avisamos por email.',
    verHorarios: 'Ver los horarios del evento', porPublicar: 'Por publicar',
    pesaje: 'Pesaje', pesajeTxt: 'Llega con tu DNI y tu licencia. Si ya dejaste las alturas y los primeros intentos, solo tendrás que confirmarlos.',
    calentamiento: 'Calentamiento', calentamientoTxt: 'En cuanto cierres el pesaje, pasa a la zona de calentamiento.',
    sesion: 'Tu sesión', sessionTxt: 'Cuando te llamen, entra en la plataforma.', inicio: 'Inicio de tu sesión',
    lote: 'Lote', loteTxt: 'Tu puesto en el orden de salida del día', nivel: 'Nivel',
    cal: 'Añadir a mi calendario', calTxt: 'El calendario se actualiza solo si cambian las horas: no hace falta volver a descargarlo.',
    ahora: 'Ahora en la plataforma', tuSesionAhora: 'Tu sesión está en la plataforma',
    hoy: 'Hoy compites', faltan: (n: number) => (n === 1 ? 'Falta 1 día' : 'Faltan ' + n + ' días'), pasado: 'Competición terminada',
  },
  en: {
    volver: 'My area', h1: 'My schedule',
    sub: 'Your day at GRS Cup 2', subFecha: (d: string) => 'Your day: ' + d,
    sinPublicar: 'Schedule to be announced', sinPublicarTxt: 'Once the organisers publish the schedule you will see your weigh-in, your lot and your start time here. We will email you.',
    verHorarios: 'See the event schedule', porPublicar: 'To be announced',
    pesaje: 'Weigh-in', pesajeTxt: 'Bring your ID and your licence. If you already left your rack heights and openers, you only have to confirm them.',
    calentamiento: 'Warm-up', calentamientoTxt: 'As soon as your weigh-in is closed, go to the warm-up area.',
    sesion: 'Your session', sessionTxt: 'When you are called, step on the platform.', inicio: 'Your session starts',
    lote: 'Lot', loteTxt: 'Your place in the start order of the day', nivel: 'Level',
    cal: 'Add to my calendar', calTxt: 'The calendar follows changes of the times: you never have to download it again.',
    ahora: 'Now on the platform', tuSesionAhora: 'Your session is on the platform',
    hoy: 'You compete today', faltan: (n: number) => (n === 1 ? '1 day to go' : n + ' days to go'), pasado: 'Competition finished',
  },
};

/** Hoy en Madrid (YYYY-MM-DD): el día del atleta se lee en la zona del evento, no en la del navegador. */
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

@Component({
  selector: 'gr-area-horarios',
  imports: [RouterLink, LocPipe, GrIcon, GrStatus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-2xl">
      <a [routerLink]="'/area-atleta' | loc" class="mb-4 inline-flex h-11 items-center gap-1 text-label-s text-text-tertiary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent"><gr-icon name="chevron-left" [size]="16" />{{ t().volver }}</a>
      <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div class="min-w-0">
          <h1 class="text-display-xs outline-none md:text-display-m" tabindex="-1">{{ t().h1 }}</h1>
          <p class="mt-1 text-body-s text-text-tertiary">{{ dia() ? t().subFecha(dia()) : t().sub }}</p>
        </div>
        @if (chip(); as c) { <gr-status [tone]="c.tono" [icon]="c.icono">{{ c.texto }}</gr-status> }
      </div>

      @if (!publicado()) {
        <section class="mt-6 flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-6 py-12 text-center">
          <span class="flex size-12 items-center justify-center rounded-full border border-line-strong text-accent-text"><gr-icon name="hourglass" [size]="20" /></span>
          <h2 class="text-ui-h5 font-avant!">{{ t().sinPublicar }}</h2>
          <p class="max-w-sm text-body-s text-text-secondary">{{ t().sinPublicarTxt }}</p>
          <a [routerLink]="'/horarios' | loc" class="mt-1 inline-flex h-11 items-center gap-2 rounded-sm border border-line-strong px-5 text-label-s hover:border-accent/60 focus-visible:outline-2 focus-visible:outline-accent">{{ t().verHorarios }}<gr-icon name="arrow-right" [size]="16" /></a>
        </section>
      } @else {
        <!-- El día del atleta: pesaje → calentamiento → sesión, en una línea de tiempo (no una tabla). -->
        <section class="mt-6 overflow-hidden rounded-lg border border-accent/40 bg-[linear-gradient(165deg,rgb(110_20_32/0.32),rgb(20_17_18/0.55)_58%)]">
          <!-- Cabecera de la sesión: en móvil la hora y el nivel van juntos y el nombre baja a su propia línea. -->
          <header class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-white/8 px-5 py-4 md:px-6">
            <p class="text-display-2xs tabular-nums">{{ inicio() }}</p>
            <p class="order-2 basis-full text-label-m sm:order-none sm:basis-auto">{{ h().sesion || t().sesion }}</p>
            @if (h().sesionNivel) { <span class="inline-flex h-5 items-center rounded-2xs border border-accent/50 px-1.5 text-mono-xs text-accent-text">{{ h().sesionNivel }}</span> }
          </header>
          <ol class="px-5 py-4 md:px-6">
            <li class="relative flex gap-4 pb-5">
              <span class="absolute top-9 bottom-0 left-[19px] w-px bg-line-strong" aria-hidden="true"></span>
              <span class="flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg-base text-accent-text"><gr-icon name="scale" [size]="18" /></span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p class="text-label-m">{{ t().pesaje }}</p>
                  <p class="text-ui-h5 tabular-nums">{{ ventanaPesaje() }}</p>
                </div>
                <p class="mt-1 text-body-s text-text-tertiary">{{ t().pesajeTxt }}</p>
              </div>
            </li>
            <li class="relative flex gap-4 pb-5">
              <span class="absolute top-9 bottom-0 left-[19px] w-px bg-line-strong" aria-hidden="true"></span>
              <span class="flex size-10 shrink-0 items-center justify-center rounded-full border border-line-strong bg-bg-base text-text-tertiary"><gr-icon name="dumbbell" [size]="18" /></span>
              <div class="min-w-0 flex-1">
                <p class="text-label-m">{{ t().calentamiento }}</p>
                <p class="mt-1 text-body-s text-text-tertiary">{{ t().calentamientoTxt }}</p>
              </div>
            </li>
            <li class="flex gap-4">
              <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-grain text-white"><gr-icon name="dumbbell" [size]="18" /></span>
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p class="text-label-m">{{ t().inicio }}</p>
                  <p class="text-ui-h4 tabular-nums">{{ inicio() }}</p>
                </div>
                <p class="mt-1 text-body-s text-text-tertiary">{{ t().sessionTxt }}</p>
              </div>
            </li>
          </ol>
        </section>

        <div class="mt-4 grid gap-4 sm:grid-cols-2">
          <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
            <p class="text-label-xs tracking-[0.06em] text-text-tertiary uppercase">{{ t().lote }}</p>
            <p class="mt-1 text-display-2xs tabular-nums">{{ h().lote ? t().lote + ' ' + h().lote : t().porPublicar }}</p>
            <p class="mt-1 text-body-s text-text-tertiary">{{ t().loteTxt }}</p>
          </section>
          <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
            <p class="text-label-xs tracking-[0.06em] text-text-tertiary uppercase">{{ t().sesion }}</p>
            <p class="mt-1 text-[17px] leading-tight font-semibold">{{ h().sesion || t().porPublicar }}</p>
            @if (nivel()) { <p class="mt-1 text-body-s text-text-tertiary">{{ nivel() }}</p> }
          </section>
        </div>

        @if (h().ics) {
          <section class="mt-4 flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-5">
            <h2 class="text-ui-h5 font-avant!">{{ t().cal }}</h2>
            <p class="text-body-s text-text-secondary">{{ t().calTxt }}</p>
            <a [href]="h().ics" class="inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-accent-grain px-5 text-label-s text-white focus-visible:outline-2 focus-visible:outline-accent"><gr-icon name="calendar-plus" [size]="16" />{{ t().cal }}</a>
          </section>
        }
      }
    </div>
  `,
})
export class AreaHorariosPage implements OnInit {
  readonly panel = input.required<Panel>();
  protected readonly t = inject(I18n).dict(T);
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly horario = signal<MiHorario | null>(null);
  protected readonly directo = signal<Directo | null>(null);

  protected readonly h = computed<MiHorario>(() => this.horario() ?? this.dePanel());
  protected readonly publicado = computed(() => this.h().publicado);
  protected readonly inicio = computed(() => (this.h().inicio ? hora(this.h().inicio, this.i18n.lang()) : this.t().porPublicar));
  protected readonly ventanaPesaje = computed(() => {
    const x = this.h();
    return x.pesajeInicio ? hora(x.pesajeInicio, this.i18n.lang()) + '–' + hora(x.pesajeFin, this.i18n.lang()) : this.t().porPublicar;
  });
  protected readonly nivel = computed(() => {
    const n = this.h().sesionNivel;
    return n ? this.t().nivel + ' ' + n : '';
  });
  /** «sábado 28 de noviembre» en el idioma de la página. */
  protected readonly dia = computed(() => {
    const d = this.h().dia;
    return d ? new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString(this.i18n.locale(), { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '') : '';
  });

  /** Dónde está el día: en directo, hoy, cuántos días faltan o ya terminó. */
  protected readonly chip = computed<{ tono: GrStatusTone; icono: 'radio' | 'clock' | 'check'; texto: string } | null>(() => {
    const d = this.directo();
    const h = this.h();
    if (!h.publicado) return null;
    if (d?.fase === 'en_directo') {
      const propia = !!h.sesion && !!d.sesion?.titulo && d.sesion.titulo.trim() === h.sesion.trim();
      return { tono: 'directo', icono: 'radio', texto: propia ? this.t().tuSesionAhora : d.sesion?.titulo ? this.t().ahora + ' · ' + d.sesion.titulo : this.t().ahora };
    }
    const dia = h.dia?.slice(0, 10);
    if (!dia) return null;
    const hoy = hoyMadrid();
    if (dia === hoy) return { tono: 'directo', icono: 'radio', texto: this.t().hoy };
    if (dia > hoy) {
      const dias = Math.round((Date.parse(dia + 'T00:00:00Z') - Date.parse(hoy + 'T00:00:00Z')) / 864e5);
      return { tono: 'proximamente', icono: 'clock', texto: this.t().faltan(dias) };
    }
    return { tono: 'finalizado', icono: 'check', texto: this.t().pasado };
  });

  ngOnInit(): void {
    if (!this.browser) return; // private page: datos de la sesión del atleta, en el navegador
    void this.cargar();
  }

  /** La API manda (horas publicadas y enlace al calendario); el panel ya trae lo mismo para pintar al instante. */
  private async cargar(): Promise<void> {
    const [h, d] = await Promise.all([
      firstValueFrom(this.http.get<MiHorario>(`${AREA_API}/horario`)).catch(() => null),
      firstValueFrom(this.http.get<Directo>(`/api/competiciones/${this.panel().competicion.slug}/directo`)).catch(() => null),
    ]);
    if (h) this.horario.set(h);
    if (d) this.directo.set(d);
  }

  /** What the area panel already knows: the timeline shows at once instead of an empty skeleton. */
  private dePanel(): MiHorario {
    const a = this.panel().atleta;
    const publicado = !!a.jornada;
    // El calendario del área es el mismo para todo horario publicado: con el día y una hora ya hay algo que exportar.
    const ics = publicado && (a.horaInicio || a.pesajeInicio) ? AREA_API + '/horario.ics' : undefined;
    return { publicado, dia: a.jornada, lote: a.lote, inicio: a.horaInicio, pesajeInicio: a.pesajeInicio, pesajeFin: a.pesajeFin, sesion: a.sesion, sesionNivel: a.sesionNivel, zonaHoraria: 'Europe/Madrid', ics };
  }
}

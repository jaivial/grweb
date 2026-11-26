import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { AREA_API, type Panel } from '../core/area';
import { cat, hora } from '../core/atletas';
import { I18n, LocPipe, divisionEn } from '../core/i18n';

/** The QR as the API hands it over: the PNG on the CDN and the payload it encodes (what the weigh-in scans). */
interface Acreditacion {
  url: string;
  contenido: string;
}

const T = {
  es: {
    volver: 'Mi área', h1: 'Mi acreditación', ticket: 'Acreditación de atleta',
    categoria: 'Categoría', sesion: 'Sesión', dia: 'Día', licencia: 'Licencia', porPublicar: 'Por publicar',
    pista: 'Sube el brillo de la pantalla al máximo', pistaTxt: 'Enseña este QR en el pesaje y en la puerta. Se escanea mejor si la pantalla se ve nítida.',
    descargar: 'Descargar la imagen', descargando: 'Preparando…',
    cargando: 'Cargando tu acreditación', qrAlt: 'Código QR de tu acreditación',
    noQr: 'No hemos podido cargar tu QR', noQrTxt: 'Revisa tu conexión y vuelve a intentarlo.', reintentar: 'Reintentar',
    aviso: 'Tu QR es personal: no lo compartas.', aviso2: 'Si no puedes abrirlo, en el pesaje podemos buscarte por tu licencia.',
  },
  en: {
    volver: 'My area', h1: 'My accreditation', ticket: 'Athlete accreditation',
    categoria: 'Weight class', sesion: 'Session', dia: 'Day', licencia: 'Licence', porPublicar: 'To be announced',
    pista: 'Turn your screen brightness up', pistaTxt: 'Show this QR at the weigh-in and at the door. It scans best on a bright, sharp screen.',
    descargar: 'Download the image', descargando: 'Preparing…',
    cargando: 'Loading your accreditation', qrAlt: 'QR code of your accreditation',
    noQr: "We couldn't load your QR", noQrTxt: 'Check your connection and try again.', reintentar: 'Try again',
    aviso: 'Your QR is personal: do not share it.', aviso2: 'If you cannot open it, the weigh-in desk can find you by your licence.',
  },
};

@Component({
  selector: 'gr-area-acreditacion',
  imports: [RouterLink, LocPipe, GrAlert, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-md">
      <a [routerLink]="'/area-atleta' | loc" class="mb-4 inline-flex h-11 items-center gap-1 text-label-s text-text-tertiary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-accent"><gr-icon name="chevron-left" [size]="16" />{{ t().volver }}</a>
      <h1 class="text-display-xs outline-none md:text-display-m" tabindex="-1">{{ t().h1 }}</h1>

      <!-- Entrada de acreditación: cabecera del evento, datos del atleta y el QR grande con su zona de silencio blanca. -->
      <article class="mt-5 overflow-hidden rounded-xl border border-accent/40 bg-bg-card shadow-card">
        <header class="grain-acento bg-[linear-gradient(135deg,#c42b3e,#6e1420)] px-5 py-4 text-white">
          <p class="text-label-xs tracking-[0.1em] uppercase opacity-80">{{ t().ticket }}</p>
          <p class="mt-1 font-display text-[24px] leading-none tracking-[0.04em] uppercase">{{ panel().competicion.nombre }}</p>
        </header>

        <div class="px-5 pt-4">
          <p class="text-[22px] leading-tight font-semibold break-words">{{ a().nombreCompleto || a().nombre + ' ' + a().apellidos }}</p>
          <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <div class="min-w-0"><dt class="text-label-xs tracking-wide text-text-tertiary uppercase">{{ t().categoria }}</dt><dd class="text-[15px] font-semibold">{{ categoria() }}</dd></div>
            <div class="min-w-0"><dt class="text-label-xs tracking-wide text-text-tertiary uppercase">{{ t().sesion }}</dt><dd class="text-[15px] font-semibold break-words">{{ a().sesion || t().porPublicar }}</dd></div>
            <div class="min-w-0"><dt class="text-label-xs tracking-wide text-text-tertiary uppercase">{{ t().dia }}</dt><dd class="text-[15px] font-semibold">{{ dia() }}</dd></div>
            <div class="min-w-0"><dt class="text-label-xs tracking-wide text-text-tertiary uppercase">{{ t().licencia }}</dt><dd class="font-mono text-mono-s">{{ a().licencia || '–' }}</dd></div>
          </dl>
        </div>

        <div class="px-2 pt-5">
          @if (qr(); as src) {
            <div class="mx-auto w-full max-w-[340px] rounded-md bg-white p-2.5">
              <img [src]="src" [alt]="t().qrAlt" width="640" height="640" decoding="async" class="block h-auto w-full" />
            </div>
          } @else if (cargando()) {
            <gr-skeleton class="mx-auto aspect-square w-full max-w-[340px] rounded-md" />
            <p class="sr-only" role="status">{{ t().cargando }}</p>
          } @else {
            <gr-alert tone="warning" [title]="t().noQr">
              {{ t().noQrTxt }}
              <button type="button" class="mt-2 inline-flex h-11 items-center text-label-s text-accent-text underline" (click)="reintentar()">{{ t().reintentar }}</button>
            </gr-alert>
          }
        </div>

        <footer class="mt-5 border-t border-dashed border-line-strong px-5 py-4">
          <p class="flex items-start gap-2 text-body-s text-text-primary"><gr-icon name="zap" [size]="18" class="mt-0.5 shrink-0 text-accent-text" />{{ t().pista }}</p>
          <p class="mt-1 text-body-xs text-text-tertiary">{{ t().pistaTxt }}</p>
          @if (qr()) {
            <button grButton variant="secondary" type="button" [block]="true" class="mt-3" [loading]="guardando()" (click)="descargar()"><gr-icon name="download" [size]="16" />{{ guardando() ? t().descargando : t().descargar }}</button>
          }
        </footer>
      </article>

      <p class="mt-4 text-body-xs text-text-tertiary">{{ t().aviso }} {{ t().aviso2 }}</p>
    </div>
  `,
})
export class AreaAcreditacionPage {
  readonly panel = input.required<Panel>();
  protected readonly t = inject(I18n).dict(T);
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18n);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  /** URL of the PNG (CDN) and, while it is missing, the same QR drawn here from the payload. */
  private readonly url = signal('');
  private readonly dibujado = signal('');
  protected readonly qr = computed(() => this.url() || this.dibujado());
  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);

  protected readonly a = computed(() => this.panel().atleta);
  protected readonly categoria = computed(() => {
    const x = this.a();
    if (!x.categoria) return this.t().porPublicar;
    const division = divisionEn(x.divisionNombre, this.i18n.lang());
    return x.sexo + ' ' + cat(x.categoria) + ' kg' + (division ? ' · ' + division : '');
  });
  protected readonly dia = computed(() => {
    const d = this.a().jornada;
    if (!d) return this.t().porPublicar;
    const fecha = new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString(this.i18n.locale(), { weekday: 'short', day: 'numeric', month: 'short' }).replace(/[.,]/g, '');
    const ini = this.a().horaInicio ? hora(this.a().horaInicio, this.i18n.lang()) : '';
    return ini ? fecha + ' · ' + ini : fecha;
  });

  constructor() {
    if (!this.browser) return; // the QR belongs to the athlete session: browser only
    void this.cargar();
  }

  protected reintentar(): void {
    void this.cargar();
  }

  /** The API generates the PNG once, publishes it to Bunny and answers its URL; the panel payload is the last resort. */
  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const r = await firstValueFrom(this.http.get<Acreditacion>(`${AREA_API}/acreditacion`));
      this.url.set(r.url);
      if (!r.url) await this.dibujar(r.contenido);
    } catch {
      this.url.set(this.panel().acreditacionUrl ?? '');
      if (!this.url()) await this.dibujar(this.panel().acreditacion);
    } finally {
      this.cargando.set(false);
    }
  }

  /** Fallback while the PNG is not on the CDN: the same payload, drawn here. */
  private async dibujar(contenido: string): Promise<void> {
    if (!contenido) return;
    const mod = await import('qrcode');
    const QR = (mod as unknown as { default?: typeof mod }).default ?? mod;
    this.dibujado.set(await QR.toDataURL(contenido, { margin: 2, width: 640, errorCorrectionLevel: 'M' }));
  }

  /** Downloads the PNG (same name in any browser); a CDN without CORS still opens it in a tab. */
  protected async descargar(): Promise<void> {
    const src = this.qr();
    if (!src || this.guardando()) return;
    this.guardando.set(true);
    try {
      const blob = await (await fetch(src)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'acreditacion-grs-cup-2.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      window.open(src, '_blank', 'noopener');
    } finally {
      this.guardando.set(false);
    }
  }
}

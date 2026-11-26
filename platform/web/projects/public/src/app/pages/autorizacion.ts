import { HttpClient, HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { COMPETITION_SLUG } from '../core/competition';
import { textoError } from '../core/errores';
import { I18n, LocPipe } from '../core/i18n';
import { Seo } from '../core/seo';
import { Footer, Navbar } from '../layout/layout';

interface Autorizacion {
  estado: 'subir' | 'revision' | 'rechazada' | 'aprobada';
  nombre: string;
  atleta: string;
  competicion: string;
  fecha: string;
  formularioUrl: string;
  motivo?: string;
}
type Vista = 'cargando' | 'invalido' | 'error' | Autorizacion['estado'];

const MAX = 10 << 20;
const TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const T = {
  es: {
    h1: 'Autorización de madre, padre o tutor',
    seoDesc: 'Sube la autorización firmada para que el atleta menor de edad participe en la competición.',
    hola: (n: string) => `Hola, ${n}:`,
    explica: (c: string, a: string) => `Para que ${a} pueda participar en la ${c} y para usar sus datos e imagen (ficha en la web, horarios, resultados y directo), necesitamos una autorización firmada por su madre, padre o tutor legal.`,
    pasos: 'Cómo hacerlo',
    paso1: 'Descarga el formulario. Ya lleva los datos del atleta.',
    paso2: 'Pide a tu madre, padre o tutor que rellene sus datos, ponga la fecha y firme.',
    paso3: 'Haz una foto o escanéalo y súbelo aquí.',
    descargar: 'Descargar el formulario',
    formAlt: 'Vista previa del formulario de autorización',
    subirTitulo: 'Sube la autorización firmada',
    arrastra: 'Arrastra aquí la foto o el PDF',
    toca: 'Toca para elegir un archivo',
    formatos: 'JPG, PNG, WebP o PDF · máx. 10 MB',
    elegir: 'Elegir archivo',
    subiendo: (f: string) => `Subiendo ${f}…`,
    subiendoAria: 'Progreso de la subida',
    noAdmitido: 'Ese archivo no vale: sube una foto (JPG, PNG o WebP) o un PDF de 10 MB como mucho.',
    noSubir: 'No hemos podido subir el archivo. Inténtalo de nuevo.',
    invalidoTitulo: 'Enlace no válido',
    invalido: 'Este enlace no es válido o ha caducado. Pide uno nuevo a la organización.',
    errorTitulo: 'No hemos podido cargar la página',
    error: 'Estamos teniendo un problema temporal. Vuelve a intentarlo en unos minutos.',
    reintentar: 'Reintentar',
    revisionTitulo: 'Autorización recibida',
    revision: 'Hemos recibido la autorización. La estamos revisando; te avisaremos por email y WhatsApp.',
    rechazadaTitulo: 'La autorización no se ha aceptado',
    motivo: 'Motivo:',
    rechazadaTxt: 'Revisa el motivo y sube una nueva.',
    aprobadaTitulo: 'Autorización aprobada',
    aprobada: 'Autorización aprobada. Ya apareces en la web de la GRS Cup 2.',
    verAtletas: 'Ver los atletas',
    anuncioSubida: 'Autorización enviada. La estamos revisando.',
  },
  en: {
    h1: 'Authorisation from a parent or guardian',
    seoDesc: 'Upload the signed authorisation so the under-18 athlete can take part in the competition.',
    hola: (n: string) => `Hi ${n},`,
    explica: (c: string, a: string) => `For ${a} to take part in ${c} and for us to use their data and image (athlete page, schedules, results and live stream), we need an authorisation signed by their parent or legal guardian.`,
    pasos: 'How to do it',
    paso1: 'Download the form. It already has the athlete’s details.',
    paso2: 'Ask your parent or guardian to fill in their details, add the date and sign it.',
    paso3: 'Take a photo or scan it and upload it here.',
    descargar: 'Download the form',
    formAlt: 'Preview of the authorisation form',
    subirTitulo: 'Upload the signed authorisation',
    arrastra: 'Drag the photo or PDF here',
    toca: 'Tap to choose a file',
    formatos: 'JPG, PNG, WebP or PDF · max. 10 MB',
    elegir: 'Choose file',
    subiendo: (f: string) => `Uploading ${f}…`,
    subiendoAria: 'Upload progress',
    noAdmitido: 'That file is not valid: upload a photo (JPG, PNG or WebP) or a PDF of 10 MB at most.',
    noSubir: 'We could not upload the file. Please try again.',
    invalidoTitulo: 'Invalid link',
    invalido: 'This link is not valid or has expired. Ask the organisers for a new one.',
    errorTitulo: 'We could not load the page',
    error: 'We are having a temporary problem. Please try again in a few minutes.',
    reintentar: 'Try again',
    revisionTitulo: 'Authorisation received',
    revision: 'We have received the authorisation. We are reviewing it; we will let you know by email and WhatsApp.',
    rechazadaTitulo: 'The authorisation was not accepted',
    motivo: 'Reason:',
    rechazadaTxt: 'Check the reason and upload a new one.',
    aprobadaTitulo: 'Authorisation approved',
    aprobada: 'Authorisation approved. You now appear on the GRS Cup 2 website.',
    verAtletas: 'See the athletes',
    anuncioSubida: 'Authorisation sent. We are reviewing it.',
  },
};

/** /autorizacion/:token — link sent to an under-18 athlete: the guardian downloads the form, signs it and uploads it. */
@Component({
  selector: 'gr-autorizacion',
  imports: [RouterLink, LocPipe, Navbar, Footer, GrAlert, GrButton, GrIcon, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-navbar />
    <main class="relative mx-auto max-w-[760px] px-5 pt-28 pb-18 md:px-8 md:pt-36">
      <h1 class="text-display-m md:text-display-l">{{ t().h1 }}</h1>
      <div class="sr-only" aria-live="polite">{{ anuncio() }}</div>
      @let d = datos();
      @switch (vista()) {
        @case ('cargando') {
          <div class="mt-8 flex flex-col gap-4" aria-busy="true"><gr-skeleton class="h-24 rounded-lg" /><gr-skeleton class="h-72 rounded-lg" /></div>
        }
        @case ('invalido') {
          <gr-alert class="mt-8 block" tone="warning" [title]="t().invalidoTitulo">{{ t().invalido }}</gr-alert>
        }
        @case ('error') {
          <gr-alert class="mt-8 block" tone="danger" [title]="t().errorTitulo">{{ t().error }} <button type="button" class="underline" (click)="cargar()">{{ t().reintentar }}</button></gr-alert>
        }
        @case ('revision') {
          <section class="mt-8 flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-6 py-10 text-center" role="status">
            <span class="flex size-14 items-center justify-center rounded-full bg-success/15 text-success"><gr-icon name="circle-check" [size]="26" /></span>
            <h2 class="text-display-2xs">{{ t().revisionTitulo }}</h2>
            <p class="max-w-md text-body-m text-text-secondary">{{ t().revision }}</p>
          </section>
        }
        @case ('aprobada') {
          <section class="mt-8 flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-6 py-10 text-center" role="status">
            <span class="flex size-14 items-center justify-center rounded-full bg-success/15 text-success"><gr-icon name="circle-check" [size]="26" /></span>
            <h2 class="text-display-2xs">{{ t().aprobadaTitulo }}</h2>
            <p class="max-w-md text-body-m text-text-secondary">{{ t().aprobada }}</p>
            <a grButton variant="primary" class="mt-2" [routerLink]="'/atletas' | loc" iconRight="arrow-right">{{ t().verAtletas }}</a>
          </section>
        }
        @default {
          @if (d) {
            @if (vista() === 'rechazada') {
              <gr-alert class="mt-6 block" tone="warning" [title]="t().rechazadaTitulo">
                @if (d.motivo) {
                  <strong>{{ t().motivo }}</strong>
                  <blockquote class="my-2 border-l-2 border-warning/60 pl-3 italic">«{{ d.motivo }}»</blockquote>
                }
                <p>{{ t().rechazadaTxt }}</p>
              </gr-alert>
            }
            <p class="mt-6 text-body-l text-text-primary">{{ t().hola(d.nombre) }}</p>
            <p class="mt-2 text-body-m text-text-secondary">{{ t().explica(d.competicion, d.atleta) }}</p>

            <section class="mt-6 rounded-lg border border-line-subtle bg-bg-card p-5 md:p-6" aria-labelledby="aut-pasos">
              <h2 id="aut-pasos" class="text-label-l">{{ t().pasos }}</h2>
              <div class="mt-4 flex flex-col gap-5 sm:flex-row">
                <ol class="flex flex-1 flex-col gap-3 text-body-m text-text-secondary">
                  @for (p of [t().paso1, t().paso2, t().paso3]; track $index) {
                    <li class="flex gap-3"><span class="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-deep/40 text-label-s text-accent-text" aria-hidden="true">{{ $index + 1 }}</span><span class="pt-0.5">{{ p }}</span></li>
                  }
                </ol>
                @if (d.formularioUrl) {
                  <a [href]="d.formularioUrl" target="_blank" rel="noopener" download (click)="descargar($event, d)" class="block w-32 shrink-0 self-center overflow-hidden rounded-md border border-line-strong bg-white sm:self-start" [attr.aria-label]="t().descargar">
                    <img [src]="d.formularioUrl" [alt]="t().formAlt" class="aspect-[1/1.414] w-full object-cover object-top" loading="lazy" />
                  </a>
                }
              </div>
              @if (d.formularioUrl) {
                <a grButton class="mt-5" icon="download" [href]="d.formularioUrl" target="_blank" rel="noopener" download (click)="descargar($event, d)">{{ t().descargar }}</a>
              }
            </section>

            <section class="mt-6 rounded-lg border border-line-subtle bg-bg-card p-5 md:p-6" aria-labelledby="aut-subir">
              <h2 id="aut-subir" class="text-label-l">{{ t().subirTitulo }}</h2>
              @if (subida() !== null) {
                <div class="mt-4">
                  <div class="flex justify-between gap-3 text-label-s"><span class="truncate">{{ t().subiendo(fichero()) }}</span><span>{{ subida() }} %</span></div>
                  <div class="mt-2 h-1 rounded bg-bg-raised" role="progressbar" [attr.aria-valuenow]="subida()" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="t().subiendoAria"><div class="h-full rounded bg-accent" [style.width.%]="subida()"></div></div>
                </div>
              } @else {
                <div class="mt-4 flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center" [class]="arrastrando() ? 'border-accent bg-accent/5' : errorSubida() ? 'border-accent/70' : 'border-line-strong'"
                  (dragover)="$event.preventDefault(); arrastrando.set(true)" (dragleave)="arrastrando.set(false)" (drop)="soltar($event)">
                  <gr-icon name="upload" [size]="20" />
                  <p class="text-label-m">{{ tactil ? t().toca : t().arrastra }}</p>
                  <p class="text-body-xs text-text-tertiary" id="aut-formatos">{{ t().formatos }}</p>
                  <button grButton type="button" variant="primary" class="mt-1 min-h-11" aria-describedby="aut-formatos" (click)="input.click()">{{ t().elegir }}</button>
                </div>
              }
              @if (errorSubida()) { <gr-alert class="mt-3 block" tone="danger" title="" role="alert">{{ errorSubida() }}</gr-alert> }
              <input #input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" class="sr-only" tabindex="-1" aria-hidden="true" (change)="elegir($event)" />
            </section>
          }
        }
      }
    </main>
    <gr-footer />
  `,
})
export class AutorizacionPage {
  protected readonly t = inject(I18n).dict(T);
  private readonly http = inject(HttpClient);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';
  private readonly url = `/api/competiciones/${COMPETITION_SLUG}/autorizacion/${encodeURIComponent(this.token)}`;

  protected readonly vista = signal<Vista>('cargando');
  protected readonly datos = signal<Autorizacion | null>(null);
  protected readonly subida = signal<number | null>(null);
  protected readonly fichero = signal('');
  protected readonly errorSubida = signal('');
  protected readonly arrastrando = signal(false);
  protected readonly anuncio = signal('');
  /** Pantalla táctil: no se puede arrastrar, se invita a tocar. */
  protected tactil = false;

  constructor() {
    inject(Seo).set({ title: this.t().h1 + ' · GRS Cup', description: this.t().seoDesc, path: '/autorizacion', robots: 'noindex' });
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    this.tactil = matchMedia('(pointer: coarse)').matches;
    void this.cargar();
  }

  /** El PNG está en otro origen (Bunny) y ahí el navegador ignora «download»: se baja como blob con nombre propio. Si falla, se abre el enlace. */
  protected async descargar(ev: MouseEvent, d: Autorizacion): Promise<void> {
    if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
    ev.preventDefault();
    const nombre = 'autorizacion-' + (d.competicion.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'formulario') + '.png';
    try {
      const r = await fetch(d.formularioUrl, { mode: 'cors' });
      if (!r.ok) throw new Error(String(r.status));
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      window.open(d.formularioUrl, '_blank', 'noopener');
    }
  }

  protected async cargar(): Promise<void> {
    this.vista.set('cargando');
    try {
      this.mostrar(await firstValueFrom(this.http.get<Autorizacion>(this.url)));
    } catch (e) {
      this.vista.set(e instanceof HttpErrorResponse && e.status === 404 ? 'invalido' : 'error');
    }
  }

  private mostrar(a: Autorizacion): void {
    this.datos.set(a);
    this.vista.set(a.estado);
  }

  protected elegir(ev: Event): void {
    const el = ev.target as HTMLInputElement;
    const f = el.files?.[0];
    el.value = '';
    if (f) this.subir(f);
  }

  protected soltar(ev: DragEvent): void {
    ev.preventDefault();
    this.arrastrando.set(false);
    const f = ev.dataTransfer?.files?.[0];
    if (f) this.subir(f);
  }

  private subir(f: File): void {
    this.errorSubida.set('');
    if (!TIPOS.includes(f.type) || f.size > MAX) {
      this.errorSubida.set(this.t().noAdmitido);
      return;
    }
    const fd = new FormData();
    fd.append('file', f);
    this.fichero.set(f.name);
    this.subida.set(0);
    this.http.post<Autorizacion>(this.url, fd, { reportProgress: true, observe: 'events' }).subscribe({
      next: (ev) => {
        if (ev.type === HttpEventType.UploadProgress) this.subida.set(Math.round((100 * ev.loaded) / (ev.total || f.size)));
        if (ev.type !== HttpEventType.Response || !ev.body) return;
        this.subida.set(null);
        this.mostrar(ev.body);
        this.anuncio.set(this.t().anuncioSubida);
      },
      error: (e: HttpErrorResponse) => {
        this.subida.set(null);
        if (e.status === 404) this.vista.set('invalido');
        else if (e.status === 409) void this.cargar();
        else this.errorSubida.set(e.status === 413 || e.status === 415 || e.status === 422 ? textoError(e, this.t().noAdmitido) : textoError(e, this.t().noSubir));
      },
    });
  }
}

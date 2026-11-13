import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GrAlert, GrButton, GrSkeleton } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { Competition } from '../core/competition';
import { Seo } from '../core/seo';
import { Footer, Navbar } from '../layout/layout';
import { StoryDatos, cargarImagen, componer, diasHasta } from './compartir-story';

interface PanelStory {
  atleta: { nombreCompleto: string; sexo: 'F' | 'M'; categoria: string; perfil: { fotoUrl: string; focalX: number; focalY: number } };
  prueba?: { elegida: string; opciones: { codigo: string; nombre: string; fecha: string }[] };
}
type Vista = 'cargando' | 'acceso' | 'listo' | 'error';
const api = '/api/area-atleta';
const opt = <T extends string>(v: T, l: string) => ({ v, l });

/** /area-atleta/compartir (Figma 83): «Comparte tu cuenta atrás». Only for registered athletes (area session). */
@Component({
  selector: 'gr-area-compartir',
  imports: [RouterLink, Navbar, Footer, GrAlert, GrButton, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.seg{display:flex;gap:4px;border-radius:8px;border:1px solid var(--color-line-subtle);background:var(--color-bg-field);padding:4px}
    .seg button{flex:1;height:40px;border-radius:6px;font-size:14px;font-weight:600;color:var(--color-text-tertiary);transition:color .15s,background .15s}
    .seg button:hover{color:var(--color-text-secondary)} .seg button:focus-visible{outline:none;box-shadow:0 0 0 2px rgb(230 96 107/.9)}
    .seg button[aria-checked=true]{color:#fff;background:linear-gradient(180deg,#c4283a,#8c1422)}
    @media (prefers-reduced-motion:reduce){.seg button{transition:none}}`,
  template: `
    <gr-navbar />
    <main class="relative mx-auto max-w-[1440px] px-5 pt-28 pb-18 md:px-8 md:pt-36 xl:px-[120px]">
      <nav class="text-body-s text-text-tertiary" aria-label="Migas"><a routerLink="/area-atleta" class="hover:text-text-primary">Área de atleta</a> › <span class="text-text-primary">Comparte tu cuenta atrás</span></nav>
      <h1 class="mt-2 text-display-m md:text-display-l">Comparte tu cuenta atrás</h1>
      <p class="mt-3 max-w-xl text-body-l text-text-secondary">Crea tu story para Instagram con tu foto en blanco y negro y los datos de tu inscripción. Se genera en 1080 × 1920 px.</p>
      @switch (vista()) {
        @case ('cargando') { <div class="mt-8 grid gap-6 lg:grid-cols-[1fr_440px]"><gr-skeleton class="h-96 rounded-lg" /><gr-skeleton class="h-[600px] rounded-lg" /></div> }
        @case ('acceso') {
          <div class="mt-8 max-w-md rounded-lg border border-line-subtle bg-bg-card p-6">
            <p class="text-label-l">Solo para atletas inscritos</p>
            <p class="mt-2 text-body-m text-text-tertiary">Entra en tu área de atleta para crear tu story. Si aún no tienes ficha, crea tu perfil de atleta.</p>
            <div class="mt-5 flex flex-wrap gap-3"><a grButton variant="primary" routerLink="/area-atleta">Acceder</a><a grButton routerLink="/alta-atleta">Crear perfil de atleta</a></div>
          </div>
        }
        @case ('error') { <gr-alert class="mt-8 block max-w-md" tone="danger" title="No hemos podido cargar tus datos">Recarga la página en unos minutos. <button class="underline" (click)="cargar()">Reintentar</button></gr-alert> }
        @case ('listo') {
          <div class="mt-8 flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[1fr_440px] lg:items-start">
            <div class="flex flex-col gap-4">
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <h2 class="text-label-l"><span class="mr-2 text-[11px] text-accent-text">01</span>Tu foto</h2>
                @if (p()!.atleta.perfil.fotoUrl) {
                  <div class="mt-4 flex items-center gap-4">
                    <img [src]="p()!.atleta.perfil.fotoUrl" alt="" class="h-20 w-[45px] rounded-xs object-cover grayscale" [style.object-position]="p()!.atleta.perfil.focalX + '% ' + p()!.atleta.perfil.focalY + '%'" />
                    <div><p class="text-body-s text-text-tertiary">Recorte 9:16 · blanco y negro</p><a grButton class="mt-2" routerLink="/area-atleta" [queryParams]="{ vista: 'perfil' }">Cambiar</a></div>
                  </div>
                } @else {
                  <p class="mt-3 text-body-s text-text-tertiary">Aún no tienes foto. Súbela en tu perfil o crea solo el sticker.</p>
                  <a grButton class="mt-3" routerLink="/area-atleta" [queryParams]="{ vista: 'perfil' }">Subir foto</a>
                }
              </section>
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <h2 class="text-label-l"><span class="mr-2 text-[11px] text-accent-text">02</span>Qué quieres mostrar</h2>
                <div class="seg mt-4" role="radiogroup" aria-label="Qué mostrar">@for (o of modos; track o.v) { <button type="button" role="radio" [attr.aria-checked]="modo() === o.v" (click)="modo.set(o.v)">{{ o.l }}</button> }</div>
                <p class="mt-3 text-body-s text-text-muted">La cuenta atrás es estática: muestra los días que faltan el día que generas la imagen (hora de Madrid).</p>
              </section>
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <h2 class="text-label-l"><span class="mr-2 text-[11px] text-accent-text">03</span>Formato</h2>
                <div class="seg mt-4" role="radiogroup" aria-label="Formato">@for (o of formatos; track o.v) { <button type="button" role="radio" [attr.aria-checked]="formato() === o.v" [disabled]="o.v === 'story' && !foto()" (click)="formato.set(o.v)">{{ o.l }}</button> }</div>
                <p class="mt-3 text-body-s text-text-muted">{{ formato() === 'story' ? 'Story completa: tu foto en blanco y negro con el texto y los logos encima.' : 'PNG transparente para pegar como sticker encima de tu propia foto.' }}</p>
              </section>
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <h2 class="text-label-l"><span class="mr-2 text-[11px] text-accent-text">04</span>Alineación del texto</h2>
                <div class="seg mt-4" role="radiogroup" aria-label="Alineación">@for (o of alins; track o.v) { <button type="button" role="radio" [attr.aria-checked]="alin() === o.v" (click)="alin.set(o.v)">{{ o.l }}</button> }</div>
                <p class="mt-3 text-body-s text-text-muted">Coloca el bloque de texto y logos a la izquierda, centrado o a la derecha para que no tape lo importante de tu foto.</p>
              </section>
              <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
                <h2 class="text-label-l"><span class="mr-2 text-[11px] text-accent-text">05</span>Tus datos de inscripción</h2>
                <dl class="mt-2">@for (f of filas(); track f[0]) { <div class="flex justify-between gap-4 border-t border-line-subtle py-3 text-body-s"><dt class="text-text-tertiary">{{ f[0] }}</dt><dd class="text-right font-semibold">{{ f[1] }}</dd></div> }</dl>
                <a routerLink="/area-atleta" class="text-body-s text-accent-text hover:underline">Salen de tu inscripción y no se pueden editar aquí. ¿Algo no cuadra? Edita tu perfil →</a>
              </section>
            </div>
            <div class="flex flex-col gap-3 lg:sticky lg:top-28">
              <div class="rounded-lg border border-line-subtle bg-bg-card px-6 py-8">
                <p class="text-center font-mono text-[11px] tracking-[0.12em] text-text-tertiary uppercase">Vista previa · así se verá en tu story</p>
                <div class="mx-auto mt-5 w-[250px] rounded-[40px] border-[6px] border-[#2a2a2e] bg-black p-2 shadow-2xl">
                  <div class="relative aspect-[9/16] overflow-hidden rounded-[30px]" [class.bg-[#3a3a3e]]="formato() === 'sticker'">
                    @if (url()) { <img [src]="url()" alt="Vista previa de tu story" class="h-full w-full object-cover" /> } @else { <gr-skeleton class="h-full w-full" /> }
                  </div>
                </div>
              </div>
              @if (fallo()) { <p class="text-body-s text-accent-text" role="alert">{{ fallo() }}</p> }
              <button grButton variant="primary" size="l" [block]="true" icon="instagram" [loading]="busy()" [disabled]="!url()" (click)="compartir()">Compartir en Instagram</button>
              <div class="grid grid-cols-2 gap-3">
                <button grButton size="l" [disabled]="!url()" (click)="descargar()">Descargar imagen</button>
                <a grButton size="l" href="https://instagram.com/grstrengthclub" target="_blank" rel="noopener">Síguenos en Instagram</a>
              </div>
              <p class="text-center text-body-s text-text-muted">Compartir abre el menú del móvil (Instagram › Historia). Si tu navegador no puede compartir archivos, descargamos la imagen.</p>
            </div>
          </div>
        }
      }
    </main>
    <gr-footer />
  `,
})
export class AreaCompartirPage {
  private readonly http = inject(HttpClient);
  private readonly comp = inject(Competition);
  protected readonly modos = [opt('cuenta_atras' as const, 'Cuenta atrás'), opt('fecha' as const, 'Fecha')];
  protected readonly formatos = [opt('story' as const, 'Con tu foto'), opt('sticker' as const, 'Solo sticker (PNG)')];
  protected readonly alins = [opt('izq' as const, 'Izquierda'), opt('centro' as const, 'Centro'), opt('der' as const, 'Derecha')];
  protected readonly vista = signal<Vista>('cargando');
  protected readonly p = signal<PanelStory | null>(null);
  protected readonly foto = signal<HTMLImageElement | undefined>(undefined);
  protected readonly modo = signal<StoryDatos['modo']>('cuenta_atras');
  protected readonly formato = signal<StoryDatos['formato']>('story');
  protected readonly alin = signal<StoryDatos['alin']>('izq');
  protected readonly url = signal('');
  protected readonly busy = signal(false);
  protected readonly fallo = signal('');
  private blob?: Blob;

  private readonly prueba = computed(() => {
    const pr = this.p()?.prueba;
    return pr?.opciones.find((o) => o.codigo === pr.elegida);
  });
  private readonly fechaISO = computed(() => this.prueba()?.fecha || this.comp.data()?.fechaInicio || '');
  protected readonly filas = computed(() => {
    const a = this.p()?.atleta;
    if (!a) return [];
    const f = this.fechaISO();
    const larga = f ? new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(f.slice(0, 10))) : '—';
    return [['Competición', this.prueba()?.nombre ?? '—'], ['Categoría de peso', peso(a.categoria)], ['Sexo', a.sexo === 'F' ? 'Femenino' : 'Masculino'], ['Ciudad', 'Almussafes · Valencia'], ['Fecha', larga[0].toUpperCase() + larga.slice(1)]];
  });

  constructor() {
    inject(Seo).set({ title: 'Comparte tu cuenta atrás · GR Cup', description: 'Crea tu story de Instagram con la cuenta atrás de la GRS Cup 2.', path: '/area-atleta/compartir', robots: 'noindex' });
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    void this.cargar();
    effect(() => {
      const a = this.p()?.atleta;
      if (!a) return;
      const f = this.fechaISO();
      const d: StoryDatos = {
        modo: this.modo(), formato: this.formato(), alin: this.alin(), dias: f ? diasHasta(f) : 0,
        fecha: f ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(f.slice(0, 10))).replace('.', '').toUpperCase() : '',
        nombre: a.nombreCompleto, prueba: (this.prueba()?.codigo ?? '').toUpperCase().replace('AEP', 'AEP-'), peso: peso(a.categoria).toUpperCase(),
        sexo: a.sexo === 'F' ? 'FEMENINO' : 'MASCULINO', foto: this.foto(), focalX: a.perfil.focalX, focalY: a.perfil.focalY,
      };
      void this.render(d);
    });
  }

  async cargar() {
    this.vista.set('cargando');
    try {
      const [p] = await Promise.all([firstValueFrom(this.http.get<PanelStory>(`${api}/yo`)), this.comp.load()]);
      this.p.set(p);
      if (p.atleta.perfil.fotoUrl) this.foto.set(await cargarImagen(`${api}/story/foto?v=${encodeURIComponent(p.atleta.perfil.fotoUrl)}`).catch(() => undefined));
      if (!this.foto()) this.formato.set('sticker');
      this.vista.set('listo');
    } catch (e) {
      this.vista.set(e instanceof HttpErrorResponse && e.status === 401 ? 'acceso' : 'error');
    }
  }

  private async render(d: StoryDatos) {
    try {
      const c = await componer(d);
      const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
      if (!b) throw new Error('png');
      this.blob = b;
      if (this.url()) URL.revokeObjectURL(this.url());
      this.url.set(URL.createObjectURL(b));
    } catch {
      this.fallo.set('No hemos podido generar la imagen. Recarga la página.');
    }
  }

  private nombreFichero() {
    return `grscup2-${this.formato() === 'sticker' ? 'sticker' : 'story'}.png`;
  }

  protected async compartir() {
    if (!this.blob) return;
    const file = new File([this.blob], this.nombreFichero(), { type: 'image/png' });
    if (!navigator.canShare?.({ files: [file] })) return this.descargar();
    this.busy.set(true);
    try {
      await navigator.share({ files: [file], title: 'GRS Cup 2' });
      this.registrar('compartir');
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') this.fallo.set('No se ha podido abrir el menú de compartir. Descarga la imagen y súbela a tu historia.');
    } finally {
      this.busy.set(false);
    }
  }

  protected descargar() {
    const a = document.createElement('a');
    a.href = this.url();
    a.download = this.nombreFichero();
    a.click();
    this.registrar('descarga');
  }

  private registrar(canal: 'compartir' | 'descarga') {
    this.http.post(`${api}/story/comparticiones`, { modo: this.modo(), formato: this.formato(), canal }).subscribe({ error: () => undefined });
  }
}

const peso = (c: string) => (c ? (/^\d/.test(c) ? '−' + c.replace(/kg$/i, '').trim() + ' kg' : c.replace('-', '−')) : '—');


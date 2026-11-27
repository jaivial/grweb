import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { GrAlert, GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { lastValueFrom, tap } from 'rxjs';
import { I18n } from '../../core/i18n';
import { Seo } from '../../core/seo';
import { Footer, Navbar } from '../../layout/layout';
import { ArchivoSubido, Campo, Datos, Errores, FormularioPublico, FormulariosPublic, ResultadoGuardado } from './formulario-api';
import { errorArchivo, estiloTema, textoRico, validarCampo, validarTodo } from './formulario-reglas';
import { TEXTOS } from './formulario-textos';
import { FormCampo } from './campos/campo';

type Vista = 'cargando' | 'formulario' | 'gracias' | 'cerrado' | 'invalido' | 'error';
type Aviso = '' | 'revisar' | 'errores' | 'red' | 'cambiado';
type Guardado = 'nada' | 'guardando' | 'ok' | 'error';

const AUTOGUARDADO_MS = 1500;

/** Errores por campo que devuelve el 422 de la API (`errores`). */
function erroresDe(e: HttpErrorResponse): Errores {
  const cuerpo = e.error as { errores?: Errores } | null;
  return cuerpo?.errores ?? {};
}

/**
 * /formularios/:token: formulario que el atleta rellena desde su enlace personal. Autoguardado cada 1,5 s, subida de
 * archivos con progreso, validación al salir de cada campo y envío final. Los datos se piden solo en el navegador
 * (el servidor pinta el esqueleto), como la página de autorización.
 */
@Component({
  selector: 'gr-formulario',
  imports: [GrAlert, GrButton, GrIcon, GrSkeleton, FormCampo, Navbar, Footer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-navbar />
    <main class="relative mx-auto max-w-[760px] px-5 pt-28 pb-18 md:px-8 md:pt-36">
      <div class="sr-only" aria-live="polite">{{ anuncio() }}</div>
      @switch (vista()) {
        @case ('cargando') {
          <div class="flex flex-col gap-4" aria-busy="true" [attr.aria-label]="t().cargando"><gr-skeleton class="h-20 rounded-lg" /><gr-skeleton class="h-96 rounded-lg" /></div>
        }
        @case ('invalido') {
          <gr-alert class="block" tone="warning" [title]="t().invalidoTitulo">{{ t().invalido }}</gr-alert>
        }
        @case ('error') {
          <gr-alert class="block" tone="danger" [title]="t().errorTitulo">{{ t().error }} <button type="button" class="underline" (click)="cargar()">{{ t().reintentar }}</button></gr-alert>
        }
        @case ('cerrado') {
          <gr-alert class="block" tone="warning" [title]="t().cerradoTitulo">{{ t().cerrado }}</gr-alert>
        }
        @case ('gracias') {
          <section class="flex flex-col items-center gap-3 rounded-lg border border-line-subtle bg-bg-card px-6 py-10 text-center" role="status">
            <span class="flex size-14 items-center justify-center rounded-full bg-success/15 text-success"><gr-icon name="circle-check" [size]="26" /></span>
            <h1 class="text-display-2xs">{{ t().graciasTitulo }}</h1>
            <p class="max-w-md text-body-m text-text-secondary">{{ graciasTexto() }}</p>
            @if (form()?.puedeEditar) { <button grButton variant="secondary" class="mt-2" (click)="editar()">{{ t().editar }}</button> }
          </section>
        }
        @case ('formulario') {
          @if (form(); as f) {
            <form novalidate class="rounded-[calc(var(--f-radio)_+_1.5rem)] border border-line-subtle bg-[var(--f-fondo)] p-5 text-[var(--f-texto)] [font-family:var(--f-fuente)] md:p-8"
              [style]="estilo()" (submit)="enviar($event)" aria-labelledby="f-titulo">
              <header class="flex flex-col gap-2">
                <p class="text-[13px] font-semibold tracking-[0.06em] uppercase opacity-70">{{ f.competicion.nombre }}</p>
                <h1 id="f-titulo" class="text-[30px] leading-tight font-bold md:text-[36px]">{{ f.formulario.titulo }}</h1>
                @if (descripcion()) { <div class="text-[16px] leading-relaxed opacity-90" [innerHTML]="descripcion()"></div> }
                <p class="text-[15px] opacity-80">{{ t().hola(f.atleta.nombre) }}</p>
                <p class="text-[14px] opacity-70">{{ t().obligatorios }}</p>
              </header>

              @if (aviso()) {
                <div class="mt-6" role="alert">
                  <gr-alert [tone]="aviso() === 'red' || aviso() === 'cambiado' ? 'danger' : 'warning'" [title]="textoAviso()" />
                </div>
              }

              <div class="mt-8 grid grid-cols-1 gap-x-5 gap-y-[var(--f-gap)] md:grid-cols-2">
                @for (c of campos(); track c.id) {
                  <gr-form-campo [campo]="c" [valor]="valores()[c.id]" [error]="errores()[c.id] ?? null" [subida]="subidas()[c.id] ?? null"
                    (cambio)="cambiar(c, $event)" (salida)="tocar(c)" (elegirArchivos)="subirArchivos(c, $event)" (quitarArchivo)="quitarArchivo(c, $event)" />
                }
              </div>

              <div class="mt-8 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p class="flex min-h-5 items-center gap-1.5 text-[14px] opacity-80" aria-live="polite">
                  @if (puedeGuardar()) {
                    @switch (guardado()) {
                      @case ('guardando') { {{ t().guardando }} }
                      @case ('ok') { <gr-icon name="check" [size]="14" />{{ t().guardado }} }
                      @case ('error') { <gr-icon name="circle-alert" [size]="14" class="text-accent-text" />{{ t().noGuardado }} }
                    }
                  }
                </p>
                <button type="submit" [disabled]="enviando()"
                  class="inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--f-radio)] bg-[var(--f-acento)] px-6 text-[16px] font-semibold text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--f-acento)] focus-visible:outline-none disabled:opacity-60 sm:w-auto motion-reduce:transition-none">
                  @if (enviando()) { <gr-icon name="loader" [size]="18" [spin]="true" />{{ t().enviando }} } @else { {{ boton() }} }
                </button>
              </div>
            </form>
          }
        }
      }
    </main>
    <gr-footer />
  `,
})
export class FormularioPage {
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(TEXTOS);
  private readonly api = inject(FormulariosPublic);
  private readonly seo = inject(Seo);
  private readonly ruta = inject(ActivatedRoute);
  private readonly destruir = inject(DestroyRef);
  private readonly navegador = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly token = this.ruta.snapshot.paramMap.get('token') ?? '';
  private readonly query = this.ruta.snapshot.queryParamMap;

  private temporizador: ReturnType<typeof setTimeout> | undefined;
  /** Las peticiones de guardado van en serie: un envío nunca adelanta a un autoguardado en vuelo. */
  private cola: Promise<void> = Promise.resolve();

  protected readonly vista = signal<Vista>('cargando');
  protected readonly form = signal<FormularioPublico | null>(null);
  protected readonly valores = signal<Datos>({});
  protected readonly errores = signal<Errores>({});
  protected readonly subidas = signal<Record<string, { nombre: string; pct: number }>>({});
  protected readonly guardado = signal<Guardado>('nada');
  protected readonly enviando = signal(false);
  /** La respuesta ya está completa (enviada). */
  protected readonly completa = signal(false);
  /** El atleta ha pulsado «Editar respuestas» tras enviar. */
  protected readonly editando = signal(false);
  protected readonly aviso = signal<Aviso>('');
  protected readonly anuncio = signal('');

  protected readonly campos = computed(() => this.form()?.formulario.esquema.campos ?? []);
  protected readonly ajustes = computed(() => this.form()?.formulario.esquema.ajustes);
  protected readonly estilo = computed(() => estiloTema(this.ajustes()?.tema));
  protected readonly descripcion = computed(() => textoRico(this.ajustes()?.descripcion));
  protected readonly boton = computed(() => this.ajustes()?.botonEnviar || this.t().enviar);
  protected readonly graciasTexto = computed(() => this.ajustes()?.mensajeGracias || this.t().gracias);
  /** Autoguardado solo mientras no esté completa, o si la API permite editarla. */
  protected readonly puedeGuardar = computed(() => !this.completa() || !!this.form()?.puedeEditar);
  protected readonly textoAviso = computed(() => {
    const t = this.t();
    switch (this.aviso()) {
      case 'revisar': return t.revisar;
      case 'errores': return t.avisoErrores;
      case 'red': return t.avisoRed;
      case 'cambiado': return t.avisoCambiado;
      default: return '';
    }
  });

  constructor() {
    this.seo.set({ title: this.t().seo, description: this.t().seoDesc, path: '/formularios', robots: 'noindex' });
    if (!this.navegador) return;
    // Al ocultarse la pestaña se envía el autoguardado pendiente en lugar de perderlo.
    const alOcultar = () => {
      if (document.visibilityState === 'hidden' && this.temporizador !== undefined) this.autoguardarYa();
    };
    document.addEventListener('visibilitychange', alOcultar);
    this.destruir.onDestroy(() => {
      clearTimeout(this.temporizador);
      document.removeEventListener('visibilitychange', alOcultar);
    });
    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    this.vista.set('cargando');
    try {
      this.aplicar(await this.api.obtener(this.token));
    } catch (e) {
      this.vista.set(e instanceof HttpErrorResponse && e.status === 404 ? 'invalido' : 'error');
    }
  }

  protected editar(): void {
    this.editando.set(true);
    this.vista.set('formulario');
  }

  protected cambiar(c: Campo, v: unknown): void {
    this.valores.update((d) => ({ ...d, [c.id]: v }));
    if (this.errores()[c.id]) this.fijarError(c.id, validarCampo(c, v, this.t().val));
    this.programarGuardado();
  }

  /** Validación en vivo: al salir del campo. */
  protected tocar(c: Campo): void {
    this.fijarError(c.id, validarCampo(c, this.valores()[c.id], this.t().val));
  }

  protected async enviar(ev: Event): Promise<void> {
    ev.preventDefault();
    if (this.enviando()) return;
    const e = validarTodo(this.campos(), this.valores(), this.t().val);
    this.errores.set(e);
    if (Object.keys(e).length) {
      this.aviso.set('errores');
      this.enfocarPrimerError();
      return;
    }
    clearTimeout(this.temporizador);
    this.temporizador = undefined;
    this.enviando.set(true);
    this.aviso.set('');
    try {
      await this.encolar(true);
      this.completa.set(true);
      this.editando.set(false);
      this.guardado.set('nada');
      this.vista.set('gracias');
      this.anuncio.set(this.t().anuncioEnviado);
      window.scrollTo(0, 0);
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 422) {
        this.errores.set(erroresDe(err));
        this.aviso.set('errores');
        this.enfocarPrimerError();
      } else if (err instanceof HttpErrorResponse && err.status === 409) {
        this.aviso.set('cambiado');
        await this.cargar();
      } else if (err instanceof HttpErrorResponse && err.status === 404) {
        this.vista.set('invalido');
      } else {
        this.aviso.set('red');
      }
    } finally {
      this.enviando.set(false);
    }
  }

  protected async subirArchivos(c: Campo, lista: File[]): Promise<void> {
    if (this.subidas()[c.id]) return;
    const cfg = c.archivo;
    const max = cfg?.maxArchivos ?? 1;
    const hueco = max - this.archivosDe(c.id).length;
    if (hueco <= 0 || lista.length > hueco) {
      this.fijarError(c.id, this.t().val.maxArchivos(max));
      if (hueco <= 0) return;
    }
    for (const f of lista.slice(0, hueco)) {
      const motivo = errorArchivo(f, cfg);
      if (motivo) {
        this.fijarError(c.id, motivo === 'tipo' ? this.t().val.tipo : this.t().val.tamano(cfg?.maxMb ?? 0));
        continue;
      }
      await this.subirUno(c, f);
    }
  }

  protected quitarArchivo(c: Campo, url: string): void {
    this.valores.update((d) => ({ ...d, [c.id]: this.archivosDe(c.id).filter((a) => a.url !== url) }));
    this.programarGuardado();
  }

  private aplicar(f: FormularioPublico): void {
    this.form.set(f);
    this.seo.set({ title: f.formulario.titulo, description: this.t().seoDesc, path: '/formularios', robots: 'noindex' });
    this.valores.set(this.prefill(f));
    this.completa.set(f.respuesta?.estado === 'completa');
    this.errores.set({});
    this.aviso.set('');
    if (f.cerrado) {
      this.vista.set('cerrado');
      return;
    }
    if (this.query.get('enviado') === '1' || (this.completa() && !this.editando())) {
      this.vista.set('gracias');
      return;
    }
    this.vista.set('formulario');
    // Llegó desde el email con obligatorios pendientes: se marcan ya.
    if (this.query.get('revisar') === '1') {
      const e = validarTodo(f.formulario.esquema.campos, this.valores(), this.t().val);
      this.errores.set(e);
      if (Object.keys(e).length) this.aviso.set('revisar');
    }
  }

  /** Valores de la respuesta; los archivos vienen en `datos` o, si no, en `archivos` por campo. */
  private prefill(f: FormularioPublico): Datos {
    const datos: Datos = { ...(f.respuesta?.datos ?? {}) };
    for (const c of f.formulario.esquema.campos) {
      if (c.tipo === 'archivo' && !Array.isArray(datos[c.id])) {
        datos[c.id] = (f.respuesta?.archivos ?? [])
          .filter((a) => a.campoId === c.id)
          .map(({ url, nombre, tamano, tipo }) => ({ url, nombre, tamano, tipo }));
      }
    }
    return datos;
  }

  private archivosDe(id: string): ArchivoSubido[] {
    const v = this.valores()[id];
    return Array.isArray(v) ? (v as ArchivoSubido[]) : [];
  }

  private fijarError(id: string, msg: string | null): void {
    this.errores.update((e) => {
      const n = { ...e };
      if (msg) n[id] = msg;
      else delete n[id];
      return n;
    });
  }

  private programarGuardado(): void {
    if (!this.puedeGuardar()) return;
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.autoguardarYa(), AUTOGUARDADO_MS);
  }

  private autoguardarYa(): void {
    this.temporizador = undefined;
    void this.autoguardar();
  }

  private async autoguardar(): Promise<void> {
    this.guardado.set('guardando');
    try {
      await this.encolar(false);
      this.guardado.set('ok');
    } catch (e) {
      this.guardado.set('error');
      if (e instanceof HttpErrorResponse && e.status === 409) {
        this.aviso.set('cambiado');
        await this.cargar();
      } else if (e instanceof HttpErrorResponse && e.status === 404) {
        this.vista.set('invalido');
      }
    }
  }

  private encolar(enviar: boolean): Promise<ResultadoGuardado> {
    const paso = this.cola.then(() => this.api.guardar(this.token, this.valores(), enviar));
    this.cola = paso.then(() => undefined, () => undefined);
    return paso;
  }

  private async subirUno(c: Campo, f: File): Promise<void> {
    this.subidas.update((s) => ({ ...s, [c.id]: { nombre: f.name, pct: 0 } }));
    this.fijarError(c.id, null);
    const res: { archivo: ArchivoSubido | null } = { archivo: null };
    try {
      await lastValueFrom(
        this.api.subirArchivo(this.token, c.id, f).pipe(
          tap((ev) => {
            if (ev.tipo === 'progreso') this.subidas.update((s) => ({ ...s, [c.id]: { nombre: f.name, pct: ev.pct } }));
            else res.archivo = ev.archivo;
          }),
        ),
      );
      if (!res.archivo) throw new Error('sin respuesta');
      const nuevo = res.archivo;
      this.valores.update((d) => ({ ...d, [c.id]: [...this.archivosDe(c.id), nuevo] }));
      this.programarGuardado();
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 404) this.vista.set('invalido');
      else this.fijarError(c.id, this.t().noSubir);
    } finally {
      this.subidas.update((s) => {
        const n = { ...s };
        delete n[c.id];
        return n;
      });
    }
  }

  /** Lleva el foco y la vista al primer campo con error. */
  private enfocarPrimerError(): void {
    const id = this.campos().find((c) => this.errores()[c.id])?.id;
    if (!id) return;
    setTimeout(() => {
      const el = document.getElementById('f-' + id);
      el?.focus();
      el?.scrollIntoView({ block: 'center' });
    });
  }
}

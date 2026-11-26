import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isPlatformBrowser } from '@angular/common';
import { GrAlert, GrButton, GrField, GrIcon, GrInput, GrSkeleton, GrTelefono } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { textoError } from '../core/errores';
import { I18n } from '../core/i18n';
import { MAX_BIO, MAX_FRASE, MAX_MARCA, MARCAS_PERFIL, esMenorDe, pruebaEnFoco, pruebaSiguiente, tarjetasPrueba, totalMarcas, validarPerfil, type CamposPerfil, type PruebaOpcion, type PruebaTarjeta } from '../core/perfil-campos';
import { mascaraFecha } from './fecha-mascara';

/** Un campo que cambia: antes → después (lo que el equipo revisa). */
interface CambioCampo {
  clave: string;
  campo: string;
  antes: string;
  despues: string;
}
/** El cambio que espera revisión. */
interface CambioPendiente {
  id: string;
  enviadaAt: string;
  cambios: CambioCampo[];
}
/** Lo que devuelve el servicio: los datos de hoy (para rellenar) y el cambio pendiente. */
interface PerfilEditar {
  datos: Omit<CamposPerfil, 'marcaSQ' | 'marcaBP' | 'marcaDL'> & { marcaSQ?: number; marcaBP?: number; marcaDL?: number };
  opciones: PruebaOpcion[];
  esMenor: boolean;
  pendiente?: CambioPendiente;
}

const api = '/api/area-atleta/perfil-editar';

/**
 * «Editar mi perfil» del área de atleta: el atleta cambia los mismos datos que pidió en el alta y los envía a
 * revisión. Hasta que el equipo los aprueba, su ficha no cambia (y puede cancelar el cambio). Las reglas de
 * validación son las del formulario público (/alta-atleta).
 */
@Component({
  selector: 'gr-area-perfil-editar',
  imports: [FormsModule, GrAlert, GrButton, GrField, GrIcon, GrInput, GrSkeleton, GrTelefono],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (cargando()) {
      <div class="flex flex-col gap-4">
        <gr-skeleton class="h-24 rounded-lg" />
        <gr-skeleton class="h-96 rounded-lg" />
      </div>
    } @else if (!datos()) {
      <div class="flex flex-col items-start gap-3 rounded-lg border border-line-subtle bg-bg-card p-6">
        <p class="text-body-m">{{ t().sinDatos }}</p>
        <button grButton variant="secondary" (click)="cargar()">{{ t().reintentar }}</button>
      </div>
    } @else {
      <div class="mx-auto flex w-full max-w-xl flex-col gap-6">
        @if (pendiente(); as p) {
          <!-- Lo que se ha enviado y espera revisión -->
          <section id="pe-pendiente" tabindex="-1" class="scroll-mt-24 rounded-lg border border-warning/40 bg-warning/8 p-5 outline-none" aria-labelledby="pe-pend-tit">
            <h2 id="pe-pend-tit" class="flex items-center gap-2 text-ui-h5"><gr-icon name="clock" [size]="20" class="text-warning" />{{ t().pendienteTitulo }}</h2>
            <p class="mt-1 text-body-s text-text-secondary">{{ t().pendienteTxt(fecha(p.enviadaAt)) }}</p>
            <dl class="mt-4 flex flex-col gap-2">
              @for (c of p.cambios; track c.clave) {
                <div class="flex flex-col gap-0.5 rounded-md bg-bg-raised px-3 py-2">
                  <dt class="text-label-xs text-text-tertiary uppercase">{{ c.campo }}</dt>
                  <dd class="flex min-w-0 flex-wrap items-baseline gap-2 text-body-s">
                    <span class="text-text-tertiary line-through">{{ c.antes || t().vacio }}</span>
                    <gr-icon name="arrow-right" [size]="12" class="text-text-muted" />
                    <span class="font-semibold text-text-primary">{{ c.despues || t().vacio }}</span>
                  </dd>
                </div>
              }
            </dl>
            <button grButton variant="secondary" class="mt-4" [loading]="cancelando()" [disabled]="cancelando()" (click)="cancelar()">{{ t().cancelar }}</button>
          </section>
        }

        <form class="flex flex-col gap-6" (ngSubmit)="enviar()" novalidate>
          <p class="text-body-s text-text-secondary">{{ t().intro }}</p>

          @if (resumen().length) {
            <div class="rounded-md border border-accent bg-accent/8 p-4" role="alert">
              <p class="flex items-center gap-2 text-label-s"><gr-icon name="circle-alert" [size]="18" class="text-accent-text" />{{ t().revisa(resumen().length) }}</p>
              <ul class="mt-2 flex flex-col gap-1 text-body-s text-text-secondary">
                @for (e of resumen(); track e.campo) { <li>• {{ e.label }}: {{ e.msg }}</li> }
              </ul>
            </div>
          }

          <!-- Tus datos -->
          <fieldset class="flex min-w-0 flex-col gap-4">
            <legend class="mb-4 text-display-2xs italic">{{ t().tusDatos }}</legend>
            <div class="grid gap-4 sm:grid-cols-2">
              <gr-field [label]="t().nombre" for="pe-nombre" [error]="err()['nombre'] ?? null">
                <input grInput id="pe-nombre" name="nombre" autocomplete="given-name" maxlength="60" [(ngModel)]="d.nombre" (ngModelChange)="revalidar()" />
              </gr-field>
              <gr-field [label]="t().apellidos" for="pe-apellidos" [error]="err()['apellidos'] ?? null">
                <input grInput id="pe-apellidos" name="apellidos" autocomplete="family-name" maxlength="60" [(ngModel)]="d.apellidos" (ngModelChange)="revalidar()" />
              </gr-field>
            </div>
            <gr-field [label]="t().email" for="pe-email" [hint]="t().emailAyuda" [error]="err()['email'] ?? null">
              <input grInput id="pe-email" name="email" type="email" autocomplete="email" maxlength="254" [(ngModel)]="d.email" (ngModelChange)="revalidar()" />
            </gr-field>
            <gr-field [label]="t().telefono" for="pe-tel" [error]="err()['telefono'] ?? null">
              <gr-telefono id="pe-tel" name="telefono" [aria-label]="t().telefono" [invalido]="!!err()['telefono']" [(ngModel)]="d.telefono" (ngModelChange)="revalidar()" />
            </gr-field>
            <div class="flex flex-col gap-2">
              <span id="pe-l-sexo" class="text-label-s">{{ t().sexo }}</span>
              <div class="flex gap-2" role="radiogroup" aria-labelledby="pe-l-sexo">
                <button type="button" role="radio" [attr.aria-checked]="d.sexo === 'F'" (click)="d.sexo = 'F'; revalidar()"
                  class="inline-flex h-12 flex-1 items-center justify-center rounded-[10px] border px-4 text-label-m transition-colors"
                  [class]="d.sexo === 'F' ? 'border-accent bg-accent/8 text-text-primary' : 'border-line-strong text-text-secondary hover:text-text-primary'">{{ t().mujer }}</button>
                <button type="button" role="radio" [attr.aria-checked]="d.sexo === 'M'" (click)="d.sexo = 'M'; revalidar()"
                  class="inline-flex h-12 flex-1 items-center justify-center rounded-[10px] border px-4 text-label-m transition-colors"
                  [class]="d.sexo === 'M' ? 'border-accent bg-accent/8 text-text-primary' : 'border-line-strong text-text-secondary hover:text-text-primary'">{{ t().hombre }}</button>
              </div>
              @if (err()['sexo']; as e) { <p class="flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
            </div>
            <gr-field [label]="t().nacimiento" for="pe-nacimiento" [hint]="t().fechaAyuda" [error]="err()['fechaNacimiento'] ?? null">
              <input grInput id="pe-nacimiento" name="fechaNacimiento" inputmode="numeric" autocomplete="bday" [placeholder]="t().fechaPh" [value]="fechaTexto" (input)="fechaCambia($any($event.target))" />
            </gr-field>
            @if (esMenor()) {
              <p class="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/8 p-4 text-body-s text-text-secondary"><gr-icon name="clock" [size]="18" class="mt-0.5 shrink-0 text-warning" />{{ t().menor }}</p>
            }
          </fieldset>

          <!-- Competición y club -->
          <fieldset class="flex min-w-0 flex-col gap-4">
            <legend class="mb-4 text-display-2xs italic">{{ t().competicion }}</legend>
            <div class="flex flex-col gap-2">
              <span id="pe-l-prueba" class="text-label-s">{{ t().tuCompeticion }}</span>
              <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="pe-l-prueba" (keydown)="teclaPrueba($event)">
                @for (o of opcionesPrueba(); track o.codigo) {
                  <button type="button" role="radio" [attr.aria-checked]="d.prueba === o.codigo" (click)="d.prueba = o.codigo; revalidar()"
                    [disabled]="o.completa" [attr.aria-disabled]="o.completa || null" [attr.data-prueba]="o.codigo"
                    [attr.aria-label]="o.titulo + '. ' + o.detalle" [attr.tabindex]="o.codigo === pruebaFoco() ? 0 : -1"
                    class="flex w-full items-center gap-3 rounded-[10px] border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    [class]="d.prueba === o.codigo ? 'border-accent-text bg-accent-deep/30' : 'border-line-subtle bg-bg-card hover:border-line-strong'">
                    <span class="flex size-5 shrink-0 items-center justify-center rounded-full border-2"
                      [class]="d.prueba === o.codigo ? 'border-accent-text' : 'border-line-strong'">
                      @if (d.prueba === o.codigo) { <span class="size-2.5 rounded-full bg-accent-text"></span> }
                    </span>
                    <span class="flex min-w-0 flex-1 flex-col">
                      <span class="text-body-m font-semibold text-text-primary">{{ o.titulo }}</span>
                      <span class="text-body-s text-text-tertiary">{{ o.detalle }}</span>
                    </span>
                  </button>
                }
              </div>
              <p class="text-body-xs text-text-tertiary">{{ t().competicionAyuda }}</p>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <gr-field [label]="t().club" for="pe-club" [error]="err()['club'] ?? null">
                <input grInput id="pe-club" name="club" maxlength="80" [placeholder]="t().clubPh" [(ngModel)]="d.club" (ngModelChange)="revalidar()" />
              </gr-field>
              <gr-field [label]="t().ciudad" for="pe-ciudad" [error]="err()['ciudad'] ?? null">
                <input grInput id="pe-ciudad" name="ciudad" maxlength="80" autocomplete="address-level2" placeholder="Valencia" [(ngModel)]="d.ciudad" (ngModelChange)="revalidar()" />
              </gr-field>
            </div>
            <gr-field [label]="t().entrenador" for="pe-entrenador" [optional]="true" [error]="err()['entrenador'] ?? null">
              <input grInput id="pe-entrenador" name="entrenador" maxlength="80" [placeholder]="t().entrenadorPh" [(ngModel)]="d.entrenador" (ngModelChange)="revalidar()" />
            </gr-field>
          </fieldset>

          <!-- Tu perfil -->
          <fieldset class="flex min-w-0 flex-col gap-4">
            <legend class="mb-4 text-display-2xs italic">{{ t().tuPerfil }}</legend>
            <gr-field [label]="t().frase" for="pe-frase" [optional]="true" [error]="err()['frase'] ?? null">
              <input grInput id="pe-frase" name="frase" maxlength="80" [placeholder]="t().frasePh" [(ngModel)]="d.frase" (ngModelChange)="revalidar()" />
              <span fieldAside class="text-body-xs text-text-tertiary">{{ d.frase.length }} / {{ maxFrase }}</span>
            </gr-field>
            <gr-field [label]="t().bio" for="pe-bio" [optional]="true" [error]="err()['bio'] ?? null">
              <textarea grInput id="pe-bio" name="bio" rows="4" maxlength="280" [placeholder]="t().bioPh" [(ngModel)]="d.bio" (ngModelChange)="revalidar()"></textarea>
              <span fieldAside class="text-body-xs text-text-tertiary">{{ d.bio.length }} / {{ maxBio }}</span>
            </gr-field>
            @if (!esMenor()) {
              <gr-field [label]="t().instagram" for="pe-instagram" [optional]="true" [error]="err()['instagram'] ?? null">
                <input grInput id="pe-instagram" name="instagram" maxlength="31" autocomplete="off" autocapitalize="none" spellcheck="false" [placeholder]="t().instagramPh" [(ngModel)]="d.instagram" (ngModelChange)="revalidar()" />
              </gr-field>
            } @else {
              <p class="text-body-s text-text-tertiary">{{ t().instagramMenor }}</p>
            }
          </fieldset>

          <!-- Mejores marcas -->
          <fieldset class="flex min-w-0 flex-col gap-4">
            <legend class="mb-4 text-display-2xs italic">{{ t().marcas }}</legend>
            <div class="grid grid-cols-3 gap-3">
              @for (m of marcas; track m.k) {
                <label class="flex flex-col gap-1">
                  <span class="text-mono-xs text-text-tertiary">{{ m.corto }} · {{ t().kg }}</span>
                  <input grInput type="number" inputmode="decimal" step="0.5" min="0" [max]="maxMarca" [name]="m.k" [invalid]="!!err()[m.k]"
                    [(ngModel)]="d[m.k]" (ngModelChange)="revalidar()" />
                </label>
              }
            </div>
            @for (m of marcas; track m.k) {
              @if (err()[m.k]; as e) { <p class="flex items-center gap-1.5 text-body-xs text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="14" />{{ m.corto }}: {{ e }}</p> }
            }
            <p class="flex items-center justify-between gap-4 rounded-md bg-bg-raised px-4 py-3">
              <span class="text-label-m">{{ t().total }}</span>
              <span class="text-ui-h4 tabular-nums" [class]="total() === null ? 'text-text-tertiary' : 'text-accent-text'">{{ total() === null ? '—' : total() + ' kg' }}</span>
            </p>
          </fieldset>

          @if (error()) {
            <gr-alert tone="danger" [title]="t().noEnviar">{{ error() }}</gr-alert>
          }
          @if (ok()) { <p class="rounded-md border border-success/40 bg-bg-raised px-4 py-3 text-body-s text-success" role="status">{{ ok() }}</p> }

          <p class="text-body-xs text-text-tertiary">{{ t().aviso }}</p>
          <div class="max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-5 max-md:border-t max-md:border-line-subtle max-md:bg-bg-base/95 max-md:px-5 max-md:pt-3 max-md:pb-[max(12px,env(safe-area-inset-bottom))] max-md:backdrop-blur-[10px]">
            <button grButton variant="primary" size="l" type="submit" [block]="true" [loading]="enviando()" [disabled]="enviando() || cancelando()">{{ t().enviar }}</button>
          </div>
        </form>
      </div>
    }
  `,
})
export class AreaPerfilEditar {
  private readonly http = inject(HttpClient);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);
  protected readonly marcas = MARCAS_PERFIL;
  protected readonly maxFrase = MAX_FRASE;
  protected readonly maxBio = MAX_BIO;
  protected readonly maxMarca = MAX_MARCA;

  /** The session expired: the page shows the access screen instead of a form that cannot be sent. */
  readonly sesionCaducada = output<void>();
  protected readonly cargando = signal(true);
  protected readonly datos = signal<PerfilEditar | null>(null);
  protected readonly opciones = signal<PruebaOpcion[]>([]);
  protected readonly pendiente = signal<CambioPendiente | null>(null);
  protected readonly err = signal<Record<string, string>>({});
  protected readonly error = signal('');
  protected readonly ok = signal('');
  protected readonly enviando = signal(false);
  protected readonly cancelando = signal(false);
  /** dd/mm/aaaa en el campo; d.fechaNacimiento guarda la ISO solo si es una fecha real. */
  protected fechaTexto = '';
  protected d: CamposPerfil = { nombre: '', apellidos: '', email: '', telefono: '', sexo: '', fechaNacimiento: '', prueba: '', club: '', ciudad: '', entrenador: '', frase: '', bio: '', instagram: '', marcaSQ: '', marcaBP: '', marcaDL: '' };
  private intentado = false;

  /** Menor de 18 hoy (aviso y campo de Instagram oculto). */
  protected esMenor(): boolean {
    return esMenorDe(this.d.fechaNacimiento);
  }

  /** Las tarjetas de competición, las mismas que el alta: nombre con su día y «Completa» si no quedan plazas. */
  protected opcionesPrueba(): PruebaTarjeta[] {
    return tarjetasPrueba(this.opciones(), this.i18n.locale(), this.t().completa);
  }

  /** La opción que entra en el recorrido del teclado (radiogroup: un solo tab stop). */
  protected pruebaFoco(): string {
    return pruebaEnFoco(this.opcionesPrueba(), this.d.prueba);
  }

  /** Flechas en el radiogroup: eligen la opción siguiente o anterior (saltando las completas). */
  protected teclaPrueba(ev: KeyboardEvent): void {
    const sig = pruebaSiguiente(this.opcionesPrueba(), this.d.prueba, ev.key);
    if (!sig) return;
    ev.preventDefault();
    this.d.prueba = sig;
    this.revalidar();
    (ev.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-prueba="' + sig + '"]')?.focus();
  }

  /** Total de las marcas en vivo. */
  protected total(): string | null {
    const v = totalMarcas(this.d);
    return v === null ? null : v.toLocaleString(this.i18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  /** Los errores, en el orden del formulario (resumen). */
  protected readonly resumen = computed(() => {
    const e = this.err();
    const etiquetas = this.t().campos;
    return Object.entries(e)
      .filter(([k]) => etiquetas[k] !== undefined)
      .map(([campo, msg]) => ({ campo, label: etiquetas[campo], msg: msg.charAt(0).toLowerCase() + msg.slice(1).replace(/\.$/, '') }));
  });

  /** «12 nov, 10:30». */
  protected fecha(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(this.i18n.locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }).format(d).replace('.', '');
  }

  constructor() {
    if (this.browser) void this.cargar();
    else this.cargando.set(false);
  }

  /** Carga los datos de hoy y el cambio pendiente. */
  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const p = await firstValueFrom(this.http.get<PerfilEditar>(api));
      this.datos.set(p);
      this.opciones.set(p.opciones ?? []);
      this.pendiente.set(p.pendiente ?? null);
      this.rellena(p);
    } catch (e) {
      if (this.caducada(e)) return;
      this.datos.set(null);
      this.error.set(textoError(e, this.t().noCargar));
    } finally {
      this.cargando.set(false);
    }
  }

  /** Copia los datos del servicio al formulario (la fecha se ve dd/mm/aaaa). */
  private rellena(p: PerfilEditar): void {
    const x = p.datos;
    const num = (v?: number) => (v === null || v === undefined ? '' : String(v));
    this.d = {
      nombre: x.nombre, apellidos: x.apellidos, email: x.email, telefono: x.telefono, sexo: x.sexo,
      fechaNacimiento: x.fechaNacimiento ?? '', prueba: x.prueba ?? '', club: x.club, ciudad: x.ciudad, entrenador: x.entrenador, frase: x.frase,
      bio: x.bio, instagram: x.instagram, marcaSQ: num(x.marcaSQ), marcaBP: num(x.marcaBP), marcaDL: num(x.marcaDL),
    };
    this.fechaTexto = (x.fechaNacimiento ?? '').split('-').reverse().join('/');
    this.err.set({});
    this.intentado = false;
  }

  /** Máscara dd/mm/aaaa: la ISO solo se guarda cuando la fecha es real. */
  protected fechaCambia(el: HTMLInputElement): void {
    const { texto, iso } = mascaraFecha(el.value);
    el.value = this.fechaTexto = texto;
    this.d.fechaNacimiento = iso;
    this.revalidar();
  }

  protected revalidar(): void {
    if (this.intentado) this.err.set(this.validar());
  }

  private validar(): Record<string, string> {
    return validarPerfil(this.d, this.t().v, { fechaTexto: this.fechaTexto, esMenor: this.esMenor() });
  }

  /** Envía el cambio: queda pendiente de revisión (la ficha no cambia todavía). */
  protected async enviar(): Promise<void> {
    if (this.enviando()) return;
    this.error.set('');
    this.ok.set('');
    this.intentado = true;
    const e = this.validar();
    this.err.set(e);
    if (Object.keys(e).length) return;
    this.enviando.set(true);
    const numero = (v: string | number) => {
      const s = String(v ?? '').trim();
      return s === '' ? null : Number(s);
    };
    try {
      const p = await firstValueFrom(this.http.post<CambioPendiente>(api, {
        nombre: this.d.nombre.trim(), apellidos: this.d.apellidos.trim(), email: this.d.email.trim(), telefono: this.d.telefono,
        sexo: this.d.sexo, fechaNacimiento: this.d.fechaNacimiento, prueba: this.d.prueba, club: this.d.club.trim(), ciudad: this.d.ciudad.trim(),
        entrenador: this.d.entrenador.trim(), frase: this.d.frase.trim(), bio: this.d.bio.trim(),
        instagram: this.esMenor() ? '' : this.d.instagram.trim(),
        marcaSQ: numero(this.d.marcaSQ), marcaBP: numero(this.d.marcaBP), marcaDL: numero(this.d.marcaDL),
      }));
      this.pendiente.set(p);
      this.intentado = false;
      this.err.set({});
      this.ok.set(this.t().enviadoTxt);
      setTimeout(() => document.getElementById('pe-pendiente')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
    } catch (err) {
      this.error.set(this.msg(err));
    } finally {
      this.enviando.set(false);
    }
  }

  /** Cancela el cambio pendiente: nada se había aplicado. */
  protected async cancelar(): Promise<void> {
    const p = this.pendiente();
    if (!p || this.cancelando()) return;
    this.cancelando.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.http.delete<void>(`${api}/${p.id}`));
      this.pendiente.set(null);
      this.ok.set(this.t().cancelado);
    } catch (e) {
      this.error.set(this.msg(e));
    } finally {
      this.cancelando.set(false);
    }
  }

  /** 401: the area session is gone — the page asks for a new link instead of showing «no se pudo cargar». */
  private caducada(e: unknown): boolean {
    if (e instanceof HttpErrorResponse && e.status === 401) {
      this.sesionCaducada.emit();
      return true;
    }
    return false;
  }

  /** 409 con código (sin cambios, email en uso) se lee en el propio formulario. */
  private msg(e: unknown): string {
    if (this.caducada(e)) return '';
    const code = e instanceof HttpErrorResponse ? (e.error?.code as string | undefined) : undefined;
    if (code === 'EMAIL_EN_USO') {
      this.err.update((x) => ({ ...x, email: this.t().emailEnUso }));
      return '';
    }
    if (code === 'SIN_CAMBIOS') return this.t().sinCambios;
    return textoError(e, this.t().noEnviar2);
  }
}

const T = {
  es: {
    sinDatos: 'No hemos podido cargar tu ficha. Vuelve a intentarlo.',
    reintentar: 'Reintentar',
    pendienteTitulo: 'Cambios pendientes de revisión',
    pendienteTxt: (f: string) => `Enviaste estos cambios el ${f}. El equipo los revisa a mano: hasta que los apruebe, tu ficha sigue como está.`,
    vacio: 'vacío',
    cancelar: 'Cancelar el cambio',
    cancelado: 'Cambio cancelado: tu ficha sigue como estaba.',
    intro: 'Cambia tus datos y envíalos al equipo. Nada se aplica hasta que los revisen y los aprueben.',
    revisa: (n: number) => 'Revisa ' + (n === 1 ? 'un campo' : n + ' campos') + ' antes de enviar',
    tusDatos: 'Tus datos',
    nombre: 'Nombre', apellidos: 'Apellidos', email: 'Email', emailAyuda: 'Es el email con el que entras a tu área: si lo cambias, entrarás con el nuevo.',
    telefono: 'Teléfono móvil', sexo: 'Sexo', mujer: 'Mujer', hombre: 'Hombre',
    nacimiento: 'Fecha de nacimiento', fechaPh: 'dd/mm/aaaa', fechaAyuda: 'Formato dd/mm/aaaa. De 14 a 90 años.',
    menor: 'Eres menor de edad: tu ficha pública no se mostrará hasta que la organización tenga la autorización firmada de tu madre, padre o tutor.',
    competicion: 'Competición', tuCompeticion: 'Elige tu competición',
    completa: 'Completa · sin plazas',
    competicionAyuda: 'Si la aprueban, tu plaza pasa a esa competición. También puedes elegirla en «Tu competición», con su fecha límite.',
    club: 'Club o equipo', clubPh: 'Escribe tu club', ciudad: 'Ciudad', entrenador: 'Entrenador/a', entrenadorPh: 'Tu entrenador/a',
    tuPerfil: 'Tu perfil', frase: 'Frase de presentación', frasePh: 'Una frase para tu ficha',
    bio: 'Sobre ti', bioPh: 'Cuéntale a la gente quién eres en dos líneas', instagram: 'Instagram', instagramPh: '@tuusuario',
    instagramMenor: 'A los menores de 18 no les pedimos Instagram: el campo no se publica nunca.',
    marcas: 'Mejores marcas', kg: 'kg', total: 'Total (SQ + BP + DL)',
    noEnviar: 'No hemos podido enviar los cambios', noEnviar2: 'No hemos podido enviar los cambios. Inténtalo de nuevo.',
    noCargar: 'No hemos podido cargar tu ficha.',
    sinCambios: 'No has cambiado nada: tu ficha ya tiene esos datos.',
    emailEnUso: 'Ese email ya es el de otra persona en la competición.',
    enviadoTxt: 'Cambios enviados: el equipo los revisa y te avisamos por email cuando estén aprobados.',
    aviso: 'Al enviar, tu ficha no cambia: el equipo revisa los cambios y los aplica cuando los aprueba. Puedes cancelarlos mientras esperan.',
    enviar: 'Enviar los cambios',
    campos: { nombre: 'Nombre', apellidos: 'Apellidos', email: 'Email', telefono: 'Teléfono', sexo: 'Sexo', fechaNacimiento: 'Fecha de nacimiento', club: 'Club', ciudad: 'Ciudad', entrenador: 'Entrenador', frase: 'Frase', bio: 'Sobre ti', instagram: 'Instagram', marcaSQ: 'Sentadilla', marcaBP: 'Press de banca', marcaDL: 'Peso muerto' } as Record<string, string>,
    v: {
      oblig: 'Es obligatorio.', nombreLetras: 'El nombre debe contener letras.', largo60: 'Es demasiado largo (60 caracteres como máximo).', obligPl: 'Son obligatorios.',
      apellidosLetras: 'Los apellidos deben contener letras.', largos60: 'Son demasiado largos (60 caracteres como máximo).', email: 'Introduce un email válido.',
      waTel: 'Escribe tu teléfono.', opcion: 'Elige una opción.', anio: 'Escribe el año con 4 cifras (dd/mm/aaaa).', fecha: 'Elige una fecha válida.',
      edad: 'Esa fecha no parece correcta (debe estar entre los 14 y los 90 años).', largo: 'Es demasiado largo.', larga: 'Es demasiado larga.',
      larga80: 'Es demasiado larga (80 caracteres como máximo).', largo280: 'Es demasiado largo (280 caracteres como máximo).',
      ig: 'Solo letras, números, puntos y guiones bajos (30 como máximo).', marca: 'La marca debe estar entre 0 y 600 kg.',
      paso: 'Las marcas van en pasos de 0,5 kg.', telCorto: 'El número de teléfono no está completo.',
    },
  },
  en: {
    sinDatos: "We couldn't load your profile. Try again.",
    reintentar: 'Try again',
    pendienteTitulo: 'Changes pending review',
    pendienteTxt: (f: string) => `You sent these changes on ${f}. The team reviews them by hand: until they approve them, your profile stays as it is.`,
    vacio: 'empty',
    cancelar: 'Cancel the request',
    cancelado: 'Request cancelled: your profile stays as it was.',
    intro: 'Change your details and send them to the team. Nothing is applied until they review and approve them.',
    revisa: (n: number) => (n === 1 ? 'Check one field' : 'Check ' + n + ' fields') + ' before sending',
    tusDatos: 'Your details',
    nombre: 'First name', apellidos: 'Surname', email: 'Email', emailAyuda: 'It is the email you use to enter your area: if you change it, you will use the new one.',
    telefono: 'Mobile phone', sexo: 'Sex', mujer: 'Woman', hombre: 'Man',
    nacimiento: 'Date of birth', fechaPh: 'dd/mm/yyyy', fechaAyuda: 'Format dd/mm/yyyy. From 14 to 90 years old.',
    menor: 'You are under 18: your public profile will not be shown until the organisation has the signed authorisation from your parent or guardian.',
    competicion: 'Competition', tuCompeticion: 'Choose your competition',
    completa: 'Full · no places left',
    competicionAyuda: 'Once it is approved, your place moves to that competition. You can also choose it in «Your competition», with its deadline.',
    club: 'Club or team', clubPh: 'Write your club', ciudad: 'City', entrenador: 'Coach', entrenadorPh: 'Your coach',
    tuPerfil: 'Your profile', frase: 'Presentation line', frasePh: 'One line for your profile',
    bio: 'About you', bioPh: 'Tell people who you are in two lines', instagram: 'Instagram', instagramPh: '@youruser',
    instagramMenor: 'We do not ask under-18s for Instagram: the field is never published.',
    marcas: 'Best lifts', kg: 'kg', total: 'Total (SQ + BP + DL)',
    noEnviar: "We couldn't send the changes", noEnviar2: "We couldn't send the changes. Try again.",
    noCargar: "We couldn't load your profile.",
    sinCambios: 'You have not changed anything: your profile already has those details.',
    emailEnUso: 'That email already belongs to someone else in the competition.',
    enviadoTxt: 'Changes sent: the team reviews them and we will email you when they are approved.',
    aviso: 'When you send them, your profile does not change: the team reviews the changes and applies them on approval. You can cancel them while they wait.',
    enviar: 'Send the changes',
    campos: { nombre: 'First name', apellidos: 'Surname', email: 'Email', telefono: 'Phone', sexo: 'Sex', fechaNacimiento: 'Date of birth', club: 'Club', ciudad: 'City', entrenador: 'Coach', frase: 'Line', bio: 'About you', instagram: 'Instagram', marcaSQ: 'Squat', marcaBP: 'Bench press', marcaDL: 'Deadlift' } as Record<string, string>,
    v: {
      oblig: 'This is required.', nombreLetras: 'Your first name must contain letters.', largo60: 'It is too long (60 characters max).', obligPl: 'This is required.',
      apellidosLetras: 'Your surname must contain letters.', largos60: 'It is too long (60 characters max).', email: 'Enter a valid email.',
      waTel: 'Enter your phone number.', opcion: 'Choose an option.', anio: 'Write the year with 4 digits (dd/mm/yyyy).', fecha: 'Choose a valid date.',
      edad: "That date doesn't look right (you must be between 14 and 90).", largo: 'It is too long.', larga: 'It is too long.',
      larga80: 'It is too long (80 characters max).', largo280: 'It is too long (280 characters max).',
      ig: 'Only letters, numbers, full stops and underscores (30 max).', marca: 'The lift must be between 0 and 600 kg.',
      paso: 'Lifts go in steps of 0.5 kg.', telCorto: 'The phone number is not complete.',
    },
  },
};

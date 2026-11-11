import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, PendingTasks, afterNextRender, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon, GrSkeleton } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { AltchaConfig } from '../core/altcha';
import { Cms } from '../core/cms';
import { Competition, COMPETITION_SLUG } from '../core/competition';
import { Seo } from '../core/seo';
import { Page } from '../layout/page';
import { Community, Related, type RelatedLink } from './landings';
import { GrAltcha } from './alta-atleta-altcha';
import { AltaFoto, type FotoAlta } from './alta-atleta-foto';
import { AltaExito } from './alta-atleta-exito';
import { AltaAviso } from './alta-atleta-aviso';
import { AltaAyuda } from './alta-atleta-ayuda';
import { AltaFaq, FAQS } from './alta-atleta-faq';

/** Configuración del alta (CONTRATOS §1): módulo, textos legales, reto antibots y token de tiempo. */
interface ConfigAlta {
  abierta: boolean;
  /** «cerrada» (el organizador la ha cerrado) o «legal» (faltan textos legales publicados). */
  motivoCierre: string;
  legal: Record<string, string>;
  /** Texto exacto de la casilla «novedades» (el que el servidor hashea como prueba del consentimiento). */
  textoNovedades: string;
  altcha: AltchaConfig;
  tiempo: string;
  /** Opciones de «¿En qué competición compites?» (plazas = cupo por prueba; 0 si no hay cupo). */
  pruebas?: { codigo: string; nombre: string; fecha?: string; nivel: string; plazas: number; ocupadas: number }[];
  /** Último día (AAAA-MM-DD) para elegir la competición desde el área de atleta. */
  limiteEleccion?: string;
}

/** Los datos del formulario (los mismos que viajan al servicio). */
interface DatosAlta {
  nombre: string; apellidos: string; email: string; telefono: string; sexo: '' | 'F' | 'M'; fechaNacimiento: string;
  licencia: string; prueba: string; club: string; ciudad: string; entrenador: string; frase: string; bio: string; instagram: string;
  historial: string; marcaSQ: string | number; marcaBP: string | number; marcaDL: string | number; web: string;
}
/** Las casillas de consentimiento. */
type Aceptos = Record<'terminos' | 'privacidad' | 'imagen' | 'novedades' | 'whatsapp', boolean>;

type Vista = 'cargando' | 'formulario' | 'exito' | 'cerrada' | 'legal' | 'error';
/** Estado de la tarjeta de la izquierda cuando el envío falla. */
type Aviso = 'ninguno' | 'duplicado' | 'limite' | 'red';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BORRADOR = 'grcup:alta-atleta:borrador';
const MAX_NOMBRE = 60;
const MAX_APELLIDOS = 60;
const MAX_BIO = 280;
const MAX_FRASE = 80;
const MAX_HISTORIAL = 300;
const RE_INSTAGRAM = /^@?[A-Za-z0-9._]{1,30}$/;
const MAX_CAMPO = 80;
const MAX_LICENCIA = 20;
const MAX_MARCA = 600;

/**
 * /alta-atleta (Figma 75): la página pública del alta de atleta con revisión humana.
 * Formulario completo (datos, foto, perfil, marcas, consentimientos y envío), estados de error y
 * de éxito en la misma ruta, y el bloque de ayuda con el total de las marcas en vivo.
 */
@Component({
  selector: 'gr-alta-atleta-page',
  imports: [Page, FormsModule, GrButton, GrIcon, GrSkeleton, Related, Community, GrAltcha, AltaFoto, AltaExito, AltaAviso, AltaAyuda, AltaFaq],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page
      [title]="exito() ? 'Solicitud recibida' : 'Alta de atleta de'"
      [accent]="exito() ? '' : 'powerlifting'"
      [suffix]="exito() ? '' : 'para la GR Cup'"
      [eyebrow]="exito() ? 'Solicitud enviada' : 'Atletas · GR Cup 2026'"
      section="Atletas"
      crumb="Alta de atleta"
      [subtitle]="exito() ? (publica() ? introExito : introExitoPrivada) : cerrada() ? introCerrada : intro"
      [subtitleHtml]="exito() || cerrada() ? '' : introHtml"
      [tituloMovilGrande]="!exito()">
      @if (vista() === 'cargando') {
        <gr-skeleton class="h-[560px] rounded-[18px]" />
      } @else if (vista() === 'exito') {
        <!-- Figma 75 «Éxito»: qué pasa ahora, en tres pasos -->
        <gr-alta-exito [contacto]="contacto()" [publica]="publica()" [foto]="fotoExito()" [menor]="menorExito()" />
        <div class="mt-18 flex flex-col gap-18 md:gap-24">
          <gr-related nivel="h3" [items]="relacionados" />
          <gr-community nivel="h3" />
        </div>
      } @else {
        <!-- Contenido útil antes del formulario (Figma 75) -->
        <section class="flex flex-col gap-7">
          <div>
            <p class="flex items-center gap-2.5 text-label-xs text-text-tertiary uppercase"><span class="h-px w-6 bg-accent"></span>El alta de atleta</p>
            <h2 class="mt-3 text-display-m md:text-[38px] md:leading-[1.1] md:tracking-[0.02em]">Crea tu perfil de atleta de <span class="text-accent">powerlifting</span></h2>
            <p class="mt-4 max-w-[800px] text-body-m text-text-secondary max-md:text-[16px] max-md:leading-[24.6px]">{{ introH2 }}</p>
          </div>
          <div class="grid gap-6 lg:grid-cols-3 lg:gap-6">
            @for (b of bloques; track b.t) {
              <article class="flex flex-col gap-2">
                <h3 class="text-ui-h5 lg:text-[17px]">{{ b.t }}</h3>
                <p class="text-body-s text-text-secondary">{{ b.d }}</p>
              </article>
            }
          </div>
          @if (vista() === 'formulario') { <div><a grButton variant="primary" size="m" href="#formulario" iconRight="arrow-down">Ir al formulario</a></div> }
        </section>

        <!-- Formulario + resumen (Figma 75) -->
        <div class="mt-12 grid items-start gap-6 lg:grid-cols-[minmax(0,640fr)_minmax(0,520fr)] lg:gap-10">
          <div id="formulario" class="scroll-mt-24 outline-none" tabindex="-1">
            @switch (vista()) {
              @case ('cerrada') { <gr-alta-aviso tipo="cerrada" [contacto]="contacto()" /> }
              @case ('legal') { <gr-alta-aviso tipo="legal" [contacto]="contacto()" /> }
              @case ('error') { <gr-alta-aviso tipo="error" [contacto]="contacto()" (reintentar)="recargar()" /> }
              @default {
                @if (aviso() === 'duplicado') {
                  <gr-alta-aviso tipo="duplicado" [contacto]="contacto()" />
                } @else {
                  <form class="relative flex flex-col gap-6 rounded-[18px] border border-line-subtle bg-bg-card p-4 md:p-7" method="post" (ngSubmit)="enviar()" novalidate>
                    <div>
                      <h2 class="text-display-xs italic md:text-display-s md:text-[32px]">Solicitud de alta</h2>
                      <p class="mt-1.5 text-body-s text-text-tertiary">Los campos marcados con * son obligatorios. El resto, opcional.</p>
                    </div>

                    @if (resumen().length) {
                      <!-- Resumen de errores: lleva a cada campo -->
                      <div #resumenErr tabindex="-1" class="rounded-md border border-accent bg-accent/8 p-4 outline-none" role="alert">
                        <p class="flex items-center gap-2 text-label-s"><gr-icon name="circle-alert" [size]="18" class="text-accent-text" />Revisa {{ resumen().length === 1 ? 'un campo' : resumen().length + ' campos' }} antes de enviar</p>
                        <ul class="mt-2 flex flex-col gap-1 pl-1 text-body-s text-text-secondary">
                          @for (e of resumen(); track e.campo) { <li>• <a [href]="'#c-' + e.campo" class="hover:text-text-primary hover:underline">{{ e.label }}: {{ e.msg }}</a></li> }
                        </ul>
                      </div>
                    }

                    <!-- Tus datos -->
                    <fieldset class="flex min-w-0 flex-col gap-4">
                      <legend class="mb-5 text-display-2xs italic">Tus datos</legend>
                      <div class="grid gap-4 sm:grid-cols-2">
                        <div class="flex min-w-0 flex-col gap-2">
                          <label class="text-label-s" for="c-nombre">Nombre *</label>
                          <input id="c-nombre" name="nombre" type="text" autocomplete="given-name" maxlength="60" placeholder="Tu nombre"
                            class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                            [class]="err()['nombre'] ? 'border-accent-text' : 'border-line-strong'"
                            [(ngModel)]="d.nombre" (ngModelChange)="revalidar()"
                            [attr.aria-invalid]="!!err()['nombre']" [attr.aria-describedby]="err()['nombre'] ? 'e-nombre' : null" />
                          @if (err()['nombre']; as e) { <p id="e-nombre" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                        </div>
                        <div class="flex min-w-0 flex-col gap-2">
                          <label class="text-label-s" for="c-apellidos">Apellidos *</label>
                          <input id="c-apellidos" name="apellidos" type="text" autocomplete="family-name" maxlength="60" placeholder="Tus apellidos"
                            class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                            [class]="err()['apellidos'] ? 'border-accent-text' : 'border-line-strong'"
                            [(ngModel)]="d.apellidos" (ngModelChange)="revalidar()"
                            [attr.aria-invalid]="!!err()['apellidos']" [attr.aria-describedby]="err()['apellidos'] ? 'e-apellidos' : null" />
                          @if (err()['apellidos']; as e) { <p id="e-apellidos" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                        </div>
                      </div>
                      <div class="flex min-w-0 flex-col gap-2">
                        <label class="text-label-s" for="c-email">Email de tu inscripción en la AEP *</label>
                        <input id="c-email" name="email" type="email" autocomplete="email" maxlength="254" placeholder="tu@email.com"
                          class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                          [class]="err()['email'] ? 'border-accent-text' : 'border-line-strong'"
                          [(ngModel)]="d.email" (ngModelChange)="revalidar()"
                          [attr.aria-invalid]="!!err()['email']" [attr.aria-describedby]="err()['email'] ? 'e-email h-email' : 'h-email'" />
                        <p id="h-email" class="text-body-xs text-text-tertiary">El mismo con el que te inscribiste; así te reconocemos.</p>
                        @if (err()['email']; as e) { <p id="e-email" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                      <div class="flex min-w-0 flex-col gap-2">
                        <label class="text-label-s" for="c-telefono">Teléfono móvil</label>
                        <span class="flex h-12 w-full items-center overflow-hidden rounded-[10px] border bg-bg-field focus-within:border-accent-text"
                          [class]="err()['telefono'] ? 'border-accent-text' : 'border-line-strong'">
                          <span class="flex h-full shrink-0 items-center border-r border-line-subtle px-3.5 text-body-m text-text-secondary">+34</span>
                          <input id="c-telefono" name="telefono" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="600 000 000"
                            class="h-full w-0 min-w-0 flex-1 bg-transparent px-3.5 text-body-m placeholder:text-text-muted focus:outline-none"
                            [(ngModel)]="d.telefono" (ngModelChange)="revalidar()"
                            [attr.aria-invalid]="!!err()['telefono']" [attr.aria-describedby]="err()['telefono'] ? 'e-telefono h-telefono' : 'h-telefono'" />
                        </span>
                        <p id="h-telefono" class="text-body-xs text-text-tertiary">Formato internacional (+34 por defecto). Obligatorio solo si marcas los avisos por WhatsApp.</p>
                        @if (err()['telefono']; as e) { <p id="e-telefono" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                      <div class="flex min-w-0 flex-col gap-2">
                        <span class="text-label-s" id="l-sexo">Sexo *</span>
                        <div id="c-sexo" class="flex gap-2" role="radiogroup" aria-labelledby="l-sexo" aria-required="true" [attr.aria-invalid]="err()['sexo'] ? true : null" [attr.aria-describedby]="err()['sexo'] ? 'e-sexo' : null">
                          <button type="button" role="radio" [attr.aria-checked]="d.sexo === 'F'" (click)="d.sexo = 'F'; revalidar()"
                            class="inline-flex h-10 items-center rounded-pill border px-5 text-label-s transition-colors"
                            [class]="d.sexo === 'F' ? 'border-accent-text bg-accent-deep/30 text-text-primary' : 'border-line-strong text-text-secondary hover:text-text-primary'">Femenino</button>
                          <button type="button" role="radio" [attr.aria-checked]="d.sexo === 'M'" (click)="d.sexo = 'M'; revalidar()"
                            class="inline-flex h-10 items-center rounded-pill border px-5 text-label-s transition-colors"
                            [class]="d.sexo === 'M' ? 'border-accent-text bg-accent-deep/30 text-text-primary' : 'border-line-strong text-text-secondary hover:text-text-primary'">Masculino</button>
                        </div>
                        @if (err()['sexo']; as e) { <p id="e-sexo" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                      <div class="flex min-w-0 flex-col gap-2">
                        <label class="text-label-s" for="c-nacimiento">Fecha de nacimiento *</label>
                        <input id="c-nacimiento" name="fechaNacimiento" type="text" inputmode="numeric" autocomplete="bday" placeholder="dd/mm/aaaa"
                          class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m focus:border-accent-text focus:outline-none"
                          [class]="err()['fechaNacimiento'] ? 'border-accent-text' : 'border-line-strong'"
                          [value]="fechaTexto" (input)="fechaCambia($any($event.target))"
                          [attr.aria-invalid]="!!err()['fechaNacimiento']" [attr.aria-describedby]="err()['fechaNacimiento'] ? 'e-nacimiento h-nacimiento' : 'h-nacimiento'" />
                        <p id="h-nacimiento" class="text-body-xs text-text-tertiary">Formato dd/mm/aaaa. De 14 a 90 años.</p>
                        @if (err()['fechaNacimiento']; as e) { <p id="e-nacimiento" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                      @if (esMenor()) {
                        <p class="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/8 p-4 text-body-s text-text-secondary">
                          <gr-icon name="clock" [size]="18" class="mt-0.5 shrink-0 text-warning" />Como has nacido antes de los 18, necesitaremos la autorización firmada de tu madre, padre o tutor. Te la pediremos por email antes de publicar tu ficha.
                        </p>
                      }
                      <div class="flex min-w-0 flex-col gap-2">
                        <label class="text-label-s" for="c-licencia">Licencia AEP</label>
                        <input id="c-licencia" name="licencia" type="text" maxlength="20" placeholder="E-12345"
                          class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                          [class]="err()['licencia'] ? 'border-accent-text' : 'border-line-strong'"
                          [(ngModel)]="d.licencia" (ngModelChange)="revalidar()"
                          [attr.aria-invalid]="!!err()['licencia']" [attr.aria-describedby]="err()['licencia'] ? 'e-licencia' : null" />
                        @if (err()['licencia']; as e) { <p id="e-licencia" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                    </fieldset>

                    <!-- Competición -->
                    <fieldset class="flex min-w-0 flex-col gap-4">
                      <legend class="mb-5 text-display-2xs italic">Competición</legend>
                      @if (cfg()?.pruebas?.length) {
                        <div id="c-prueba" class="flex min-w-0 flex-col gap-3" role="radiogroup" aria-labelledby="l-prueba" [attr.aria-describedby]="err()['prueba'] ? 'e-prueba' : null" (keydown)="teclaPrueba($event)">
                          <span id="l-prueba" class="font-display text-base uppercase italic tracking-[0.02em]">¿En qué competición compites?</span>
                          @for (o of opcionesPrueba(); track o.codigo) {
                            <button type="button" role="radio" [attr.aria-checked]="d.prueba === o.codigo" (click)="d.prueba = o.codigo; revalidar()"
                              [disabled]="o.completa" [attr.aria-disabled]="o.completa || null" [attr.data-prueba]="o.codigo"
                              [attr.aria-label]="o.titulo + '. ' + o.detalle + '. ' + o.chip" [attr.tabindex]="o.codigo === pruebaFoco() ? 0 : -1"
                              class="flex w-full items-center gap-4 rounded-[10px] border px-4 py-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                              [class]="d.prueba === o.codigo ? 'border-accent-text bg-accent-deep/30' : o.completa ? 'border-line-subtle bg-bg-card' : 'border-line-subtle bg-bg-card hover:border-line-strong'">
                              <span class="flex size-5 shrink-0 items-center justify-center rounded-full border-2"
                                [class]="d.prueba === o.codigo ? 'border-accent-text' : 'border-line-strong'">
                                @if (d.prueba === o.codigo) { <span class="size-2.5 rounded-full bg-accent-text"></span> }
                              </span>
                              <span class="flex min-w-0 flex-1 flex-col">
                                <span class="text-body-m font-semibold text-text-primary">{{ o.titulo }}</span>
                                <span class="text-body-xs text-text-tertiary">{{ o.detalle }}</span>
                              </span>
                              <span class="shrink-0 rounded-full border px-2.5 py-0.5 text-label-xs" [class]="o.tono">{{ o.chip }}</span>
                            </button>
                          }
                          @if (err()['prueba']) { <p id="e-prueba" class="text-body-xs text-accent-text">{{ err()['prueba'] }}</p> }
                        </div>
                      }
                      <div class="grid gap-4 sm:grid-cols-2">
                        <div class="flex min-w-0 flex-col gap-2">
                          <label class="text-label-s" for="c-club">Club (o «independiente»)</label>
                          <input id="c-club" name="club" type="text" maxlength="80" placeholder="Tu club"
                            class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                            [class]="err()['club'] ? 'border-accent-text' : 'border-line-strong'"
                            [(ngModel)]="d.club" (ngModelChange)="revalidar()"
                            [attr.aria-invalid]="!!err()['club']" [attr.aria-describedby]="err()['club'] ? 'e-club' : null" />
                          @if (err()['club']; as e) { <p id="e-club" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                        </div>
                        <div class="flex min-w-0 flex-col gap-2">
                          <label class="text-label-s" for="c-ciudad">Ciudad</label>
                          <input id="c-ciudad" name="ciudad" type="text" maxlength="80" placeholder="Valencia"
                            class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                            [class]="err()['ciudad'] ? 'border-accent-text' : 'border-line-strong'"
                            [(ngModel)]="d.ciudad" (ngModelChange)="revalidar()"
                            [attr.aria-invalid]="!!err()['ciudad']" [attr.aria-describedby]="err()['ciudad'] ? 'e-ciudad' : null" />
                          @if (err()['ciudad']; as e) { <p id="e-ciudad" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                        </div>
                      </div>
                      <div class="flex min-w-0 flex-col gap-2">
                        <label class="text-label-s" for="c-entrenador">Entrenador/a</label>
                        <input id="c-entrenador" name="entrenador" type="text" maxlength="80" placeholder="Opcional"
                          class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                          [class]="err()['entrenador'] ? 'border-accent-text' : 'border-line-strong'"
                          [(ngModel)]="d.entrenador" (ngModelChange)="revalidar()"
                          [attr.aria-invalid]="!!err()['entrenador']" [attr.aria-describedby]="err()['entrenador'] ? 'e-entrenador' : null" />
                        @if (err()['entrenador']; as e) { <p id="e-entrenador" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                    </fieldset>

                    <!-- Tu foto -->
                    <fieldset class="flex min-w-0 flex-col gap-4">
                      <legend class="mb-5 text-display-2xs italic">Tu foto</legend>
                      <gr-alta-foto [subiendo]="subiendo()" [procesando]="procesando()" [progreso]="progreso()" (cambio)="fotoCambia($event)" />
                    </fieldset>

                    <!-- Tu perfil -->
                    <fieldset class="flex min-w-0 flex-col gap-4">
                      <legend class="mb-5 text-display-2xs italic">Tu perfil</legend>
                      <div class="flex min-w-0 flex-col gap-2">
                        <div class="flex items-baseline justify-between gap-3">
                          <label class="text-label-s" for="c-frase">Frase de presentación</label>
                          <span class="text-body-xs text-text-tertiary">{{ d.frase.length }} / {{ maxFrase }}</span>
                        </div>
                        <input id="c-frase" name="frase" type="text" maxlength="80" placeholder="Una frase para tu ficha"
                          class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                          [class]="err()['frase'] ? 'border-accent-text' : 'border-line-strong'"
                          [(ngModel)]="d.frase" (ngModelChange)="revalidar()"
                          [attr.aria-invalid]="!!err()['frase']" [attr.aria-describedby]="err()['frase'] ? 'e-frase' : null" />
                        @if (err()['frase']; as e) { <p id="e-frase" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                      <div class="flex min-w-0 flex-col gap-2">
                        <div class="flex items-baseline justify-between gap-3">
                          <label class="text-label-s" for="c-bio">Sobre ti</label>
                          <span class="text-body-xs text-text-tertiary">{{ d.bio.length }} / {{ maxBio }}</span>
                        </div>
                        <textarea id="c-bio" name="bio" rows="4" maxlength="280" placeholder="Cuéntale a la gente quién eres en dos líneas"
                          class="w-full rounded-[10px] border bg-bg-field px-3.5 py-3 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                          [class]="err()['bio'] ? 'border-accent-text' : 'border-line-strong'"
                          [(ngModel)]="d.bio" (ngModelChange)="revalidar()"
                          [attr.aria-invalid]="!!err()['bio']" [attr.aria-describedby]="err()['bio'] ? 'e-bio' : null"></textarea>
                        @if (err()['bio']; as e) { <p id="e-bio" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                      @if (!esMenor()) {
                        <div class="flex min-w-0 flex-col gap-2">
                          <label class="text-label-s" for="c-instagram">Instagram</label>
                          <input id="c-instagram" name="instagram" type="text" maxlength="31" placeholder="@tuusuario"
                            class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                            [class]="err()['instagram'] ? 'border-accent-text' : 'border-line-strong'"
                            [(ngModel)]="d.instagram" (ngModelChange)="revalidar()"
                            [attr.aria-invalid]="!!err()['instagram']" [attr.aria-describedby]="err()['instagram'] ? 'e-instagram' : null" />
                          @if (err()['instagram']; as e) { <p id="e-instagram" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                        </div>
                      } @else {
                        <p class="text-body-xs text-text-tertiary">A los menores de 18 no les pedimos Instagram: el campo se oculta y no se publica nunca.</p>
                      }
                      <div class="flex min-w-0 flex-col gap-2">
                        <div class="flex items-baseline justify-between gap-3">
                          <label class="text-label-s" for="c-historial">Historial deportivo</label>
                          <span class="text-body-xs text-text-tertiary">{{ d.historial.length }} / {{ maxHistorial }}</span>
                        </div>
                        <textarea id="c-historial" name="historial" rows="3" maxlength="300" placeholder="Competiciones, clubes anteriores, marcas…"
                          class="w-full rounded-[10px] border bg-bg-field px-3.5 py-3 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                          [class]="err()['historial'] ? 'border-accent-text' : 'border-line-strong'"
                          [(ngModel)]="d.historial" (ngModelChange)="revalidar()"
                          [attr.aria-invalid]="!!err()['historial']" [attr.aria-describedby]="err()['historial'] ? 'e-historial' : null"></textarea>
                        @if (err()['historial']; as e) { <p id="e-historial" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                    </fieldset>

                    <!-- Mejores marcas -->
                    <fieldset class="flex min-w-0 flex-col gap-4">
                      <legend class="mb-5 text-display-2xs italic">Mejores marcas</legend>
                      <p class="-mt-2 text-body-xs text-text-tertiary">Opcionales · en kilogramos · paso 0,5 · máximo 600.</p>
                      <div class="grid gap-4 sm:grid-cols-3">
                        @for (m of marcasCampos; track m.k) {
                          <div class="flex min-w-0 flex-col gap-2">
                            <label class="text-label-s" [for]="'c-' + m.k">{{ m.t }}</label>
                            <input [id]="'c-' + m.k" [name]="m.k" type="number" inputmode="decimal" step="0.5" min="0" [max]="maxMarca" placeholder="—"
                              class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                              [class]="err()[m.k] ? 'border-accent-text' : 'border-line-strong'"
                              [(ngModel)]="d[m.k]" (ngModelChange)="revalidar()"
                              [attr.aria-invalid]="!!err()[m.k]" [attr.aria-describedby]="err()[m.k] ? 'e-' + m.k : null" />
                            @if (err()[m.k]; as e) { <p [id]="'e-' + m.k" class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                          </div>
                        }
                      </div>
                      <p class="flex items-center justify-between gap-4 rounded-[10px] bg-bg-raised px-4 py-3">
                        <span class="text-label-m">Total (SQ + BP + DL)</span>
                        <span class="text-ui-h4 tabular-nums" [class]="total() === null ? 'text-text-tertiary' : 'text-accent-text'">{{ total() === null ? '—' : total() + ' kg' }}</span>
                      </p>
                    </fieldset>

                    <!-- Consentimientos -->
                    <fieldset class="flex min-w-0 flex-col gap-3">
                      <legend class="mb-5 text-display-2xs italic">Consentimientos</legend>
                      @for (c of casillas(); track c.k) {
                        <label class="flex min-h-11 items-start gap-2.5 py-1 text-body-s" [class]="c.req ? 'text-text-primary' : 'text-text-secondary'">
                          <span class="relative mt-px flex size-5 shrink-0 items-center justify-center">
                            <input type="checkbox" [name]="'c-' + c.k" [(ngModel)]="acepta[c.k]" (ngModelChange)="revalidar()"
                              class="peer size-[18px] appearance-none rounded-[5px] border bg-bg-base checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                              [class]="c.req && err()['consentimiento'] && !acepta[c.k] ? 'border-accent-text' : 'border-line-strong'" />
                            @if (acepta[c.k]) { <gr-icon name="check" [size]="12" class="pointer-events-none absolute text-white" /> }
                          </span>
                          <span>
                            @switch (c.k) {
                              @case ('terminos') { Acepto los <a href="/terminos" target="_blank" rel="noopener" class="text-accent-text hover:underline">términos de uso</a> y el <a href="/reglamento" target="_blank" rel="noopener" class="text-accent-text hover:underline">reglamento</a>. * }
                              @case ('privacidad') { He leído la <a href="/privacidad" target="_blank" rel="noopener" class="text-accent-text hover:underline">política de privacidad</a> y acepto el tratamiento de mis datos para gestionar mi alta. * }
                              @case ('imagen') { Autorizo publicar mi nombre, datos deportivos y foto en la web, la pantalla y el directo de la GR Cup (ver <a href="/consentimiento-datos" target="_blank" rel="noopener" class="text-accent-text hover:underline">consentimiento de imagen</a>). }
                              @case ('novedades') { {{ cfg()?.textoNovedades }} }
                              @case ('whatsapp') { Quiero recibir avisos de mi alta y de la competición por WhatsApp (ver <a href="/texto-whatsapp" target="_blank" rel="noopener" class="text-accent-text hover:underline">texto de WhatsApp</a>). }
                            }
                          </span>
                        </label>
                      }
                      @if (err()['consentimiento']; as e) { <p class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      <p class="text-body-xs text-text-tertiary">Responsable: GRStrength · Finalidad: gestionar tu alta de atleta y, solo si lo marcas, enviarte novedades y avisos · Legitimación: tu consentimiento · Derechos: acceso, rectificación, supresión y baja desde el área de atleta o cualquier email.</p>
                    </fieldset>

                    <!-- Envío -->
                    <fieldset class="flex min-w-0 flex-col gap-4">
                      <legend class="mb-5 text-display-2xs italic">Envío</legend>
                      <!-- Trampa para robots: fuera de la vista y del recorrido del teclado. -->
                      <span class="absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
                        <label for="c-web">No rellenes este campo</label>
                        <input id="c-web" name="web" type="text" tabindex="-1" autocomplete="off" [(ngModel)]="d.web" />
                      </span>
                      <gr-altcha [cfg]="cfg()?.altcha ?? null" [reiniciar]="reinicioAltcha()" (verificado)="altchaPago.set($event)" (pedirReto)="pedirReto()" />
                      @if (error()) {
                        <p class="flex items-start gap-2 rounded-md border border-accent bg-accent/8 p-4 text-body-s text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="18" class="mt-0.5 shrink-0" />{{ error() }}</p>
                      }
                      @if (aviso() === 'limite' || aviso() === 'red') {
                        <div id="aviso-envio" tabindex="-1" class="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/8 p-4 text-body-s text-text-secondary outline-none" role="alert">
                          <p class="flex items-start gap-2"><gr-icon [name]="aviso() === 'limite' ? 'clock' : 'circle-alert'" [size]="18" class="mt-0.5 shrink-0 text-warning" />
                            @if (aviso() === 'limite') { {{ limiteTexto() || 'Se han enviado muchas solicitudes desde esta conexión.' }} Tus datos{{ foto ? ' y tu foto' : '' }} siguen aquí: {{ bloqueado() ? 'podrás reintentarlo en ' + espera() + '.' : 'ya puedes reintentarlo.' }} }
                            @else { No hemos podido enviar tu solicitud (conexión o servicio ocupado). Tus datos{{ foto ? ' y tu foto' : '' }} siguen aquí: pulsa «Reintentar». }
                          </p>
                          <div><button grButton variant="secondary" size="m" type="button" (click)="enviar()" [disabled]="enviando() || bloqueado()">Reintentar</button></div>
                        </div>
                      }
                      <div><button grButton variant="primary" size="l" type="submit" [loading]="enviando()" [disabled]="!hidratado() || enviando() || bloqueado()">Enviar mi alta</button></div>
                      <p class="text-body-xs text-text-muted">Al enviar, aceptas los términos de uso y la política de privacidad. Te escribimos para confirmar que hemos recibido tu solicitud.</p>
                    </fieldset>
                  </form>
                }
              }
            }
          </div>

          <!-- Resumen y ayuda -->
          <gr-alta-ayuda [contacto]="contacto()" [marcas]="marcasAyuda()" [total]="total()" [abierta]="vista() === 'formulario'" [imagen]="legal('consentimiento')" [whatsapp]="legal('whatsapp')" />
        </div>

        <!-- Preguntas frecuentes -->
        <gr-alta-faq />
        <div class="mt-18 flex flex-col gap-18 md:mt-24 md:gap-24">
          <gr-related nivel="h3" [items]="relacionados" />
          <gr-community nivel="h3" />
        </div>
      }
    </gr-page>
  `,
})
export class AltaAtletaPage {
  private readonly http = inject(HttpClient);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly comp = inject(Competition);
  private readonly seo = inject(Seo);

  /** Configuración del alta (módulo, legales, reto y token de tiempo). */
  protected readonly cfg = signal<ConfigAlta | null>(null);
  protected readonly vista = signal<Vista>('cargando');
  protected readonly aviso = signal<Aviso>('ninguno');
  protected readonly err = signal<Record<string, string>>({});
  protected readonly error = signal('');
  protected readonly exito = signal(false);
  /** The athlete authorised publishing their profile (image consent): only then the success screen promises it. */
  protected readonly publica = signal(false);
  /** Until Angular hydrates, a native submit would send the data by itself: the button stays disabled. */
  protected readonly hidratado = signal(false);
  /** What was sent, for the success screen (the form is reset afterwards). */
  protected readonly fotoExito = signal(false);
  protected readonly menorExito = signal(false);
  protected readonly enviando = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly procesando = signal(false);
  protected readonly progreso = signal(0);
  protected readonly espera = signal('');
  /** Envío pausado hasta que pase el Retry-After de un 429. */
  protected readonly bloqueado = signal(false);
  /** The text of a 429 per email or phone (empty: the limit of the connection). */
  protected readonly limiteTexto = signal('');
  protected readonly reinicioAltcha = signal(0);
  protected readonly altchaPago = signal('');
  /** Lo que se ve en el campo fecha (dd/mm/aaaa); d.fechaNacimiento guarda la ISO solo si es una fecha real. */
  protected fechaTexto = '';

  /**
   * Máscara dd/mm/aaaa. Los dígitos llenan día (2), mes (2) y año (4); un separador que escribe la
   * persona («/», «-», «.», espacio) cierra el campo y lo rellena con cero («3/1/1990» → 03/01/1990).
   * Una ISO pegada o autocompletada (AAAA-MM-DD) se da la vuelta. La ISO se fija cuando la fecha existe.
   */
  protected fechaCambia(el: HTMLInputElement): void {
    const v = el.value.trim();
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
    const fuente = m ? `${m[3]}/${m[2]}/${m[1]}` : v;
    const f = ['', '', ''];
    let i = 0;
    for (const ch of fuente) {
      if (/\d/.test(ch)) {
        if (i < 2 && f[i].length === 2) i++;
        if (f[i].length < (i === 2 ? 4 : 2)) f[i] += ch;
      } else if (i < 2 && f[i].length) {
        f[i] = f[i].padStart(2, '0');
        i++;
      }
    }
    const t = f[0] + (i >= 1 ? '/' + f[1] : '') + (i >= 2 ? '/' + f[2] : '');
    el.value = this.fechaTexto = t;
    let iso = '';
    if (f[0].length === 2 && f[1].length === 2 && f[2].length === 4) {
      const [dd, mm, aa] = [+f[0], +f[1], +f[2]];
      const d = new Date(aa, mm - 1, dd);
      if (d.getFullYear() === aa && d.getMonth() === mm - 1 && d.getDate() === dd) iso = `${f[2]}-${f[1]}-${f[0]}`;
    }
    this.d.fechaNacimiento = iso;
    this.revalidar();
  }

  /** Las tarjetas de «¿En qué competición compites?» con su chip (disponible, últimas plazas, completa). */
  protected opcionesPrueba(): { codigo: string; titulo: string; detalle: string; chip: string; tono: string; completa: boolean }[] {
    const c = this.cfg();
    const dia = (iso?: string) => iso ? new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z')).replace(',', '').replace('.', '') : '';
    const verde = 'border-success/40 bg-success/10 text-success';
    const out = (c?.pruebas ?? []).map((p) => {
      const libre = p.plazas > 0 ? p.plazas - p.ocupadas : Infinity;
      const [chip, tono] = libre <= 0 ? ['Completa', 'border-line-strong text-text-tertiary']
        : libre <= Math.max(5, Math.ceil(p.plazas * 0.1)) ? ['Últimas plazas', 'border-accent-text/40 bg-accent-deep/20 text-accent-text'] : ['Disponible', verde];
      const fecha = dia(p.fecha);
      return {
        codigo: p.codigo, titulo: fecha ? `${p.nombre} · ${fecha}` : p.nombre, chip, tono, completa: libre <= 0,
        detalle: [p.plazas > 0 ? `${Math.min(p.ocupadas, p.plazas)} de ${p.plazas} ${p.plazas === 1 ? 'plaza' : 'plazas'}` : '', p.nivel].filter(Boolean).join(' · '),
      };
    });
    const lim = c?.limiteEleccion ? `, hasta el ${dia(c.limiteEleccion).replace(/^\S+ /, '')} a las 12:00` : '';
    out.push({ codigo: '', titulo: 'Aún no lo sé', detalle: `La eliges luego en tu área de atleta${lim}`, chip: 'Opcional', tono: verde, completa: false });
    return out;
  }

  /** La opción que entra en el recorrido del teclado (radiogroup: un solo tab stop). */
  protected pruebaFoco(): string {
    const ops = this.opcionesPrueba().filter((o) => !o.completa);
    return ops.some((o) => o.codigo === this.d.prueba) ? this.d.prueba : (ops[0]?.codigo ?? '');
  }

  /** Flechas en el radiogroup: mueven y eligen la opción siguiente o anterior (saltando las completas). */
  protected teclaPrueba(ev: KeyboardEvent): void {
    const paso = ev.key === 'ArrowDown' || ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowUp' || ev.key === 'ArrowLeft' ? -1 : 0;
    if (!paso) return;
    ev.preventDefault();
    const ops = this.opcionesPrueba().filter((o) => !o.completa);
    if (!ops.length) return;
    const i = ops.findIndex((o) => o.codigo === this.pruebaFoco());
    const sig = ops[(i + paso + ops.length) % ops.length];
    this.d.prueba = sig.codigo;
    this.revalidar();
    (ev.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-prueba="' + sig.codigo + '"]')?.focus();
  }

  protected readonly d: DatosAlta = {
    nombre: '', apellidos: '', email: '', telefono: '', sexo: '', fechaNacimiento: '',
    licencia: '', prueba: '', club: '', ciudad: '', entrenador: '', frase: '', bio: '', instagram: '', historial: '',
    marcaSQ: '', marcaBP: '', marcaDL: '', web: '',
  };
  protected acepta: Aceptos = {
    terminos: false, privacidad: false, imagen: false, novedades: false, whatsapp: false,
  };
  protected foto: FotoAlta | null = null;
  private intentado = false;
  /** Momento en el que se pidió la configuración (el token de tiempo debe tener al menos 3 s). */
  private configEn = 0;

  protected readonly maxFrase = MAX_FRASE;
  protected readonly maxBio = MAX_BIO;
  protected readonly maxHistorial = MAX_HISTORIAL;
  protected readonly maxMarca = MAX_MARCA;
  protected readonly bloques = [
    { t: 'Qué datos pedimos en el registro de atletas', d: 'El formulario pide solo lo que una ficha de competidor necesita: nombre y apellidos, email (el mismo con el que te inscribiste en la AEP, sirve para reconocerte), club o «independiente», ciudad, sexo y fecha de nacimiento, tus mejores marcas de sentadilla, press de banca y peso muerto, y una foto tuya. La imagen se estandariza para la web: se publica en blanco y negro, recortada y comprimida para que todas las fichas sean uniformes y carguen rápido. Si no tienes marcas homologadas todavía, puedes dejarlas vacías y completarlas después desde el área de atleta. Nada de este formulario es un pago ni una inscripción: la cuota y la licencia de la AEP se gestionaron al inscribirte. Los campos marcados con * son obligatorios; el resto puedes dejarlos para más tarde.' },
    { t: 'Darse de alta como atleta AEP: revisión paso a paso', d: 'Cada alta entra como una solicitud que revisa el equipo de la GR Cup antes de publicarse: envías el formulario, recibes un email de confirmación en tu correo, el equipo aprueba (o pide una corrección) y tu ficha aparece en /atletas. La revisión existe porque el alta es pública y alguien que no compite podría registrarse de broma; comprobamos que tu email consta en la lista de inscritos de la AEP y que los datos de categoría y división cuadran. Si algo no encaja, te escribimos para corregirlo antes de publicar. Cuando tu perfil está aprobado, entras en el área de atleta, donde después podrás editar tu foto, tus marcas y tu frase de presentación.' },
    { t: 'Privacidad: quién ve los datos de tu perfil', d: 'Tu perfil público muestra solo lo deportivo: nombre, club, ciudad, categoría, marcas y foto. Tu email y tu teléfono (si los facilitas para avisos de pesaje) nunca se publican: sirven para que la organización te confirme el alta y te avise de horarios. Al enviar el formulario marcas las casillas de términos de uso, cesión de datos de imagen y política de comunicaciones; guardamos la prueba de cada consentimiento con fecha y versión del texto, como exige el RGPD. Puedes pedir la baja o la corrección de tu ficha en cualquier momento desde el área de atleta o escribiendo al email de contacto; la foto se retira de la web y del CDN cuando pides la baja. La política completa está en la página de privacidad enlazada al pie del formulario.' },
  ];
  protected readonly relacionados: RelatedLink[] = [
    { titulo: 'Atletas', texto: 'La plantilla de la GR Cup', ruta: '/atletas' },
    { titulo: 'Área de atleta', texto: 'Edita tu ficha y tus marcas', ruta: '/area-atleta' },
    { titulo: 'Reglamento', texto: 'Las normas de la competición', ruta: '/reglamento' },
  ];
  protected readonly marcasCampos = [
    { k: 'marcaSQ' as const, t: 'Sentadilla (SQ)', c: 'SQ', n: 'sentadilla' },
    { k: 'marcaBP' as const, t: 'Press de banca (BP)', c: 'BP', n: 'press de banca' },
    { k: 'marcaDL' as const, t: 'Peso muerto (DL)', c: 'DL', n: 'peso muerto' },
  ];

  protected readonly intro =
    'La GR Strength Cup reúne en Almussafes (Valencia) a los atletas de powerlifting seleccionados mediante la AEP. Si compites en esta edición, este es el paso que falta: dar de alta tu atleta para crear tu perfil público. Las plazas de la competición ya están completas y la inscripción la gestionó la AEP, así que el alta no es una inscripción: es la forma de que tu nombre, tu club y tus marcas aparezcan bien en la web, en el marcador y en directo. El formulario toma menos de cinco minutos: foto, datos de competidor y tus mejores marcas. El equipo revisa cada solicitud a mano y te avisamos por email con el resultado. Si ya tienes tu cuenta, entra directamente en el área de atleta.';
  /** The intro when the alta is closed: it never invites to fill in the form. */
  protected readonly introCerrada =
    'La GR Strength Cup reúne en Almussafes (Valencia) a los atletas de powerlifting seleccionados mediante la AEP. El alta de atletas está cerrada ahora mismo: no se pueden enviar solicitudes nuevas. Puedes consultar las fichas publicadas en la lista de atletas y, si ya tienes tu cuenta, entrar en el área de atleta.';
  protected readonly cerrada = computed(() => this.vista() === 'cerrada' || this.vista() === 'legal');
  /** La entradilla con «dar de alta tu atleta» en negrita (Figma 75). */
  protected readonly introHtml = this.intro.replace('dar de alta tu atleta', '<strong class="font-semibold text-text-primary">dar de alta tu atleta</strong>');
  protected readonly introH2 =
    'Tu perfil es la cara pública de tu participación: una ficha con tu foto, tu categoría y tus marcas que vive en /atletas y se proyecta en la pantalla del pabellón. Completarla tiene ventajas directas: los espectadores te encuentran por nombre o club y te siguen para crear su horario personalizado; el streaming y el marcador en directo muestran tus datos completos en cada intento; y entras en la porra y el fantasy de la GR Cup, donde el público pronostica totales y podios con tu ficha como referencia. Sin perfil, apareces solo con el mínimo de la lista AEP y tu flight; con perfil, la competición se cuenta contigo dentro. El alta es gratuita y se hace una sola vez: después podrás editar tu perfil desde el área de atleta.';
  protected readonly introExito =
    'Tu solicitud de alta está ya en revisión: el equipo la repasa a mano y te avisamos por email en cuanto tu ficha esté publicada en la lista de atletas. Si ya tienes tu cuenta, entra en el área de atleta para ver el estado de tu solicitud.';
  protected readonly introExitoPrivada =
    'Tu solicitud de alta está ya en revisión: el equipo la repasa a mano y te avisamos por email con el resultado. Al aprobarla tu ficha quedará privada: podrás activar su publicación desde el área de atleta.';

  /** Casillas de consentimiento: las opcionales solo si su texto legal está publicado. */
  protected readonly casillas = computed(() => {
    const c = this.cfg();
    const out: { k: 'terminos' | 'privacidad' | 'imagen' | 'novedades' | 'whatsapp'; req: boolean }[] = [
      { k: 'terminos', req: true },
      { k: 'privacidad', req: true },
    ];
    if (this.legal('consentimiento')) out.push({ k: 'imagen', req: false });
    if (this.legal('novedades') && c?.textoNovedades) out.push({ k: 'novedades', req: false });
    if (this.legal('whatsapp')) out.push({ k: 'whatsapp', req: false });
    void c;
    return out;
  });

  /** Contacto del organizador. */
  protected readonly contacto = computed(() => this.comp.data()?.evento?.emailContacto || 'contacto@grstrength.com');

  /** Menor de 18 años (aviso de autorización del tutor; Instagram oculto). */
  protected esMenor(): boolean {
    const f = this.d.fechaNacimiento;
    if (!f) return false;
    const n = new Date(f + 'T00:00:00');
    if (isNaN(n.getTime())) return false;
    const h = new Date();
    let edad = h.getFullYear() - n.getFullYear();
    const m = h.getMonth() - n.getMonth();
    if (m < 0 || (m === 0 && h.getDate() < n.getDate())) edad--;
    return edad < 18;
  }

  /** Una marca (o null si está vacía). Los campos numéricos dan número: se normaliza a texto. */
  protected marca(k: 'marcaSQ' | 'marcaBP' | 'marcaDL'): string | null {
    const v = this.texto(k);
    if (!v) return null;
    const n = Number(v);
    if (isNaN(n)) return null;
    return n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  /** El valor de un campo de marca como texto (los <input type=number> devuelven número). */
  private texto(k: 'marcaSQ' | 'marcaBP' | 'marcaDL'): string {
    const v = this.d[k];
    return (v === null || v === undefined ? '' : String(v)).trim();
  }

  /** Las marcas para la columna de ayuda. */
  protected marcasAyuda() {
    return this.marcasCampos.map((m) => ({ ...m, v: this.marca(m.k) }));
  }

  /** Total de las marcas en vivo (null si no hay ninguna). */
  protected total(): string | null {
    let suma = 0;
    let hay = false;
    for (const m of this.marcasCampos) {
      const v = this.texto(m.k);
      if (!v) continue;
      const n = Number(v);
      if (isNaN(n)) continue;
      suma += n;
      hay = true;
    }
    return hay ? suma.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null;
  }

  /** Errores por campo (con el texto corto del resumen). */
  protected readonly resumen = computed(() => {
    const e = this.err();
    const out: { campo: string; label: string; msg: string }[] = [];
    // The summary repeats the real reason of the field (lower case, without the final full stop).
    const add = (campo: string, label: string) => {
      const m = e[campo];
      if (m) out.push({ campo, label, msg: m.charAt(0).toLowerCase() + m.slice(1).replace(/\.$/, '') });
    };
    add('nombre', 'Nombre');
    add('apellidos', 'Apellidos');
    add('email', 'Email');
    add('telefono', 'Teléfono');
    add('sexo', 'Sexo');
    add('fechaNacimiento', 'Fecha de nacimiento');
    add('prueba', 'Competición');
    add('frase', 'Frase');
    add('bio', 'Sobre ti');
    add('instagram', 'Instagram');
    add('historial', 'Historial');
    add('club', 'Club');
    add('ciudad', 'Ciudad');
    add('entrenador', 'Entrenador');
    add('licencia', 'Licencia');
    add('marcaSQ', 'Sentadilla');
    add('marcaBP', 'Press de banca');
    add('marcaDL', 'Peso muerto');
    add('consentimiento', 'Consentimientos');
    return out;
  });

  constructor() {
    afterNextRender(() => this.hidratado.set(true));
    const cms = inject(Cms);
    void inject(PendingTasks).run(async () => {
      const [c, , mapa] = await Promise.all([
        this.cargarConfig().catch(() => null),
        this.comp.load(),
        cms.seoMap(),
      ]);
      this.cfg.set(c);
      const abierta = c?.abierta ?? false;
      this.vista.set(!c ? 'error' : !abierta ? (c.motivoCierre === 'legal' ? 'legal' : 'cerrada') : 'formulario');
      const o = mapa?.paginas.find((p) => p.ruta === '/alta-atleta');
      this.seo.set({
        title: o?.title || 'Alta de atleta de powerlifting | GR Strength Cup',
        description: o?.description || 'Date de alta como atleta de la GR Strength Cup: crea tu perfil, sube tu foto y tus marcas AEP y compite con tu ficha lista para el pesaje.',
        path: '/alta-atleta',
        jsonLd: this.jsonLd(o?.title || 'Alta de atleta de powerlifting | GR Strength Cup', o?.description || 'Date de alta como atleta de la GR Strength Cup: crea tu perfil, sube tu foto y tus marcas AEP y compite con tu ficha lista para el pesaje.'),
      });
    });
    if (this.browser) this.restaurarBorrador();
  }

  /** JSON-LD de la página: WebPage + BreadcrumbList + FAQPage (CONTRATOS §1, R4 §3.4). */
  private jsonLd(titulo: string, descripcion: string): Record<string, unknown> {
    const o = this.seo.origin;
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          '@id': o + '/alta-atleta#webpage',
          url: o + '/alta-atleta',
          name: titulo,
          description: descripcion,
          inLanguage: 'es',
          isPartOf: { '@id': o + '/#website' },
          about: { '@type': 'SportsEvent', name: competicionNombre(this.comp.data()) },
        },
        {
          '@type': 'BreadcrumbList',
          '@id': o + '/alta-atleta#breadcrumbs',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Inicio', item: o + '/' },
            { '@type': 'ListItem', position: 2, name: 'Atletas', item: o + '/atletas' },
            { '@type': 'ListItem', position: 3, name: 'Alta de atleta', item: o + '/alta-atleta' },
          ],
        },
        {
          '@type': 'FAQPage',
          '@id': o + '/alta-atleta#faq',
          mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
        },
      ],
    };
  }

  /** Carga la configuración del alta (reto y token de tiempo nuevos: nunca desde la caché). */
  private async cargarConfig(): Promise<ConfigAlta> {
    const url = `/api/competiciones/${COMPETITION_SLUG}/alta-atleta/config?t=${Date.now()}`;
    const r = await firstValueFrom(this.http.get<ConfigAlta>(url));
    this.configEn = Date.now();
    return r;
  }

  /** ¿Hay versión publicada de un texto legal? */
  protected legal(tipo: string): boolean {
    return !!this.cfg()?.legal?.[tipo];
  }

  /**
   * Pide un reto nuevo a la API (el anterior ya se usó o falló) y regenera también el token de
   * tiempo: el widget vuelve a verificarse con el reto nuevo.
   */
  protected async pedirReto(): Promise<void> {
    try {
      const c = await this.cargarConfig();
      this.cfg.set(c);
      this.reinicioAltcha.update((n) => n + 1);
    } catch {
      this.error.set('No hemos podido pedir una verificación nueva. Vuelve a intentarlo en unos segundos.');
      // Even without a new challenge the widget must leave «Verificado» so the user can retry.
      this.reinicioAltcha.update((n) => n + 1);
    }
  }

  /** La foto cambió (o se quitó). */
  protected fotoCambia(f: FotoAlta | null): void {
    this.foto = f;
  }

  /** Revalida los campos (solo después del primer envío). */
  protected revalidar(): void {
    this.guardarBorrador();
    if (this.intentado) this.err.set(this.validar());
  }

  /** Valida el formulario: devuelve los errores por campo. */
  private validar(): Record<string, string> {
    const d = this.d;
    const e: Record<string, string> = {};
    if (!d.nombre.trim()) e['nombre'] = 'Es obligatorio.';
    else if (d.nombre.trim().length > MAX_NOMBRE) e['nombre'] = 'Es demasiado largo (60 caracteres como máximo).';
    if (!d.apellidos.trim()) e['apellidos'] = 'Son obligatorios.';
    else if (d.apellidos.trim().length > MAX_APELLIDOS) e['apellidos'] = 'Son demasiado largos (60 caracteres como máximo).';
    const mail = d.email.trim();
    if (!mail) e['email'] = 'Es obligatorio.';
    else if (mail.length > 254 || !EMAIL.test(mail)) e['email'] = 'Introduce un email válido.';
    if (this.acepta.whatsapp && !d.telefono.trim()) e['telefono'] = 'Si pides avisos por WhatsApp, necesitas tu teléfono.';
    if (!d.sexo) e['sexo'] = 'Elige una opción.';
    if (!d.fechaNacimiento) e['fechaNacimiento'] = /^\d{2}\/\d{2}\/\d{1,3}$/.test(this.fechaTexto) ? 'Escribe el año con 4 cifras (dd/mm/aaaa).' : 'Elige una fecha válida.';
    else {
      const n = new Date(d.fechaNacimiento + 'T00:00:00');
      if (isNaN(n.getTime())) e['fechaNacimiento'] = 'Elige una fecha válida.';
      else {
        const h = new Date();
        let edad = h.getFullYear() - n.getFullYear();
        const m = h.getMonth() - n.getMonth();
        if (m < 0 || (m === 0 && h.getDate() < n.getDate())) edad--;
        if (edad < 14 || edad > 90) e['fechaNacimiento'] = 'Esa fecha no parece correcta (debe estar entre los 14 y los 90 años).';
      }
    }
    if (d.licencia.trim().length > MAX_LICENCIA) e['licencia'] = 'Es demasiado larga.';
    if (d.club.trim().length > MAX_CAMPO) e['club'] = 'Es demasiado largo.';
    if (d.ciudad.trim().length > MAX_CAMPO) e['ciudad'] = 'Es demasiado larga.';
    if (d.entrenador.trim().length > MAX_CAMPO) e['entrenador'] = 'Es demasiado largo.';
    if (d.frase.length > MAX_FRASE) e['frase'] = 'Es demasiado larga (80 caracteres como máximo).';
    if (d.bio.length > MAX_BIO) e['bio'] = 'Es demasiado largo (280 caracteres como máximo).';
    if (!this.esMenor() && d.instagram.trim() && !RE_INSTAGRAM.test(d.instagram.trim())) e['instagram'] = 'Solo letras, números, puntos y guiones bajos (30 como máximo).';
    if (d.historial.length > MAX_HISTORIAL) e['historial'] = 'Es demasiado largo (300 caracteres como máximo).';
    for (const m of this.marcasCampos) {
      const v = this.texto(m.k);
      if (!v) continue;
      const n = Number(v);
      if (isNaN(n) || n < 0 || n > MAX_MARCA) e[m.k] = 'La marca debe estar entre 0 y 600 kg.';
      else if (!Number.isInteger(n * 2)) e[m.k] = 'Las marcas van en pasos de 0,5 kg.';
    }
    if (!this.acepta.terminos || !this.acepta.privacidad) e['consentimiento'] = 'Acepta los términos de uso y la política de privacidad.';
    return e;
  }

  /** Envía el alta. */
  protected async enviar(): Promise<void> {
    if (this.enviando()) return;
    this.error.set('');
    this.intentado = true;
    const e = this.validar();
    this.err.set(e);
    if (Object.keys(e).length) {
      // El resumen está arriba del formulario: lleva la vista allí.
      setTimeout(() => (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>('[role=alert][tabindex]')?.focus({ preventScroll: false }));
      return;
    }
    if (!this.altchaPago()) {
      this.error.set('Marca la casilla «No soy un robot» antes de enviar.');
      return;
    }
    // El token de tiempo prueba que el formulario lleva al menos 3 s abierto.
    const edad = Date.now() - this.configEn;
    if (edad < 3200) await new Promise((r) => setTimeout(r, 3200 - edad));

    this.enviando.set(true);
    this.aviso.set('ninguno');
    const fd = new FormData();
    fd.append('datos', JSON.stringify({
      nombre: this.d.nombre.trim(),
      apellidos: this.d.apellidos.trim(),
      email: this.d.email.trim(),
      telefono: this.telefono(),
      sexo: this.d.sexo,
      fechaNacimiento: this.d.fechaNacimiento,
      licencia: this.d.licencia.trim(),
      prueba: this.d.prueba,
      club: this.d.club.trim(),
      ciudad: this.d.ciudad.trim(),
      entrenador: this.d.entrenador.trim(),
      frase: this.d.frase.trim(),
      bio: this.d.bio.trim(),
      instagram: this.esMenor() ? '' : this.d.instagram.trim(),
      historial: this.d.historial.trim(),
      marcaSQ: this.numero('marcaSQ'),
      marcaBP: this.numero('marcaBP'),
      marcaDL: this.numero('marcaDL'),
      focalX: this.foto?.focalX ?? 50,
      focalY: this.foto?.focalY ?? 35,
      consentimientos: {
        terminos: this.acepta.terminos,
        privacidad: this.acepta.privacidad,
        imagen: this.legal('consentimiento') ? this.acepta.imagen : false,
        novedades: this.acepta.novedades,
        whatsapp: this.legal('whatsapp') ? this.acepta.whatsapp : false,
      },
      altcha: this.altchaPago(),
      tiempo: this.cfg()?.tiempo ?? '',
      web: this.d.web,
    }));
    if (this.foto) fd.append('foto', this.foto.archivo, this.foto.archivo.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/competiciones/${COMPETITION_SLUG}/alta-atleta`);
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      this.subiendo.set(true);
      this.progreso.set(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.upload.onload = () => {
      this.subiendo.set(false);
      this.procesando.set(true);
      this.progreso.set(100);
    };
    xhr.onload = () => {
      this.subiendo.set(false);
      this.procesando.set(false);
      this.enviando.set(false);
      this.respuesta(xhr);
    };
    xhr.onerror = () => {
      this.subiendo.set(false);
      this.procesando.set(false);
      this.enviando.set(false);
      this.aviso.set('red');
      this.enfocar('#aviso-envio');
    };
    xhr.onabort = xhr.onerror;
    xhr.send(fd);
  }

  /** Traduce la respuesta del servicio a un estado de la página. */
  private respuesta(xhr: XMLHttpRequest): void {
    let cuerpo: { code?: string; detail?: string; errors?: { location?: string; message?: string }[] } = {};
    try {
      cuerpo = JSON.parse(xhr.responseText) as typeof cuerpo;
    } catch {
      cuerpo = {};
    }
    if (xhr.status === 202 || xhr.status === 200) {
      this.exito.set(true);
      this.publica.set(!!this.legal('consentimiento') && this.acepta.imagen && !this.esMenor());
      this.fotoExito.set(!!this.foto);
      this.menorExito.set(this.esMenor());
      this.vista.set('exito');
      this.borrarBorrador();
      this.subiendo.set(false);
      window.scrollTo({ top: 0 });
      // The page changes in place: move the focus to the new title so screen readers announce it.
      setTimeout(() => {
        const h = document.querySelector<HTMLElement>('h1');
        if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
      });
      return;
    }
    const codigo = cuerpo.code ?? '';
    // The server consumes a valid challenge before field/photo validation and processing. A retry needs a new one.
    if (!(xhr.status === 400 && codigo === 'ANTIBOT')) {
      this.altchaPago.set('');
      void this.pedirReto();
    }
    if (xhr.status === 409 || codigo === 'SOLICITUD_EN_CURSO') {
      this.aviso.set('duplicado');
      this.enfocar('#formulario');
      return;
    }
    if (xhr.status === 429) {
      const ra = Number(xhr.getResponseHeader('Retry-After'));
      this.cuentaAtras(ra > 0 ? ra : 60);
      this.limiteTexto.set(codigo === 'LIMITE_EMAIL' || codigo === 'LIMITE_TELEFONO' ? (cuerpo.detail ?? '') : '');
      this.aviso.set('limite');
      this.enfocar('#aviso-envio');
      return;
    }
    if (xhr.status === 503) {
      if (codigo === 'LEGAL_NO_DISPONIBLE') {
        this.vista.set('legal');
        return;
      }
      if (codigo === 'ALTA_CERRADA') {
        this.vista.set('cerrada');
        this.enfocar('#formulario');
        return;
      }
      // busy, a service down or a proxy 503 without code: keep the filled form and offer a retry.
      this.aviso.set('red');
      this.enfocar('#aviso-envio');
      return;
    }
    if (xhr.status === 400 && codigo === 'ANTIBOT') {
      this.error.set(cuerpo.detail || 'No hemos podido verificar que eres una persona.');
      this.altchaPago.set('');
      void this.pedirReto(); // el reto anterior ya se usó: se pide uno nuevo
      return;
    }
    if (xhr.status === 422 && codigo === 'VALIDACION' && cuerpo.errors?.length) {
      const e: Record<string, string> = {};
      for (const det of cuerpo.errors) {
        const campo = (det.location ?? '').replace(/^body\./, '');
        if (campo) e[campo] = det.message ?? 'Revisa este campo.';
      }
      this.err.set(e);
      this.error.set('');
      setTimeout(() => (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>('[role=alert][tabindex]')?.focus({ preventScroll: false }));
      return;
    }
    if (xhr.status === 422 && (codigo === 'CONSENTIMIENTO_OBLIGATORIO' || codigo === 'TELEFONO_OBLIGATORIO')) {
      if (codigo === 'TELEFONO_OBLIGATORIO') this.err.set({ telefono: 'Si pides avisos por WhatsApp, necesitas tu teléfono.' });
      this.error.set(cuerpo.detail || 'Revisa los campos marcados.');
      return;
    }
    // Cualquier otro error: se puede reintentar sin perder los datos.
    this.error.set(cuerpo.detail || 'No hemos podido enviar tu solicitud.');
    this.aviso.set('red');
    this.enfocar('#aviso-envio');
  }

  /** Mueve el foco al bloque que acaba de aparecer (el botón que lo tenía puede quedar deshabilitado). */
  private enfocar(sel: string): void {
    setTimeout(() => (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(sel)?.focus({ preventScroll: false }));
  }

  /** Cuenta atrás del Retry-After de un 429: el texto se actualiza cada segundo y se desbloquea al llegar a 0. */
  private reloj: ReturnType<typeof setInterval> | undefined;
  private readonly paraReloj = inject(DestroyRef).onDestroy(() => clearInterval(this.reloj));
  private cuentaAtras(segundos: number): void {
    clearInterval(this.reloj);
    const fin = Date.now() + segundos * 1000;
    const paso = () => {
      const quedan = Math.ceil((fin - Date.now()) / 1000);
      if (quedan <= 0) {
        clearInterval(this.reloj);
        this.bloqueado.set(false);
        return;
      }
      this.espera.set(this.tiempo(quedan));
    };
    this.bloqueado.set(true);
    paso();
    this.reloj = setInterval(paso, 1000);
  }

  /** Tiempo de espera en texto (segundos por debajo del minuto). */
  private tiempo(s: number): string {
    if (s < 60) return s === 1 ? '1 segundo' : s + ' segundos';
    const m = Math.ceil(s / 60);
    return m === 1 ? '1 minuto' : m + ' minutos';
  }

  /** Teléfono en formato internacional (+34 por defecto). */
  private telefono(): string {
    const t = this.d.telefono.trim();
    if (!t) return '';
    if (t.startsWith('+')) return t.replace(/[\s.-]/g, '');
    const digitos = t.replace(/[^\d]/g, '');
    if (!digitos) return '';
    return '+34' + digitos;
  }

  /** Una marca como número (o null si está vacía). */
  private numero(k: 'marcaSQ' | 'marcaBP' | 'marcaDL'): number | null {
    const v = this.texto(k);
    if (!v) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  /** Vuelve a cargar la página (error de carga o cierre). */
  protected recargar(): void {
    location.reload();
  }

  // ---- borrador en el dispositivo (sin la foto) ----

  private guardarBorrador(): void {
    if (!this.browser) return;
    try {
      sessionStorage.setItem(BORRADOR, JSON.stringify({ d: this.d, acepta: this.acepta }));
    } catch {
      /* el navegador puede tener el almacenamiento bloqueado: no es crítico */
    }
  }

  private borrarBorrador(): void {
    if (!this.browser) return;
    try {
      sessionStorage.removeItem(BORRADOR);
    } catch {
      /* nada que hacer */
    }
  }

  private restaurarBorrador(): void {
    try {
      const raw = sessionStorage.getItem(BORRADOR);
      if (!raw) return;
      const b = JSON.parse(raw) as { d?: Partial<DatosAlta>; acepta?: Partial<Aceptos> };
      if (b.d) Object.assign(this.d, b.d);
      this.fechaTexto = this.d.fechaNacimiento.split('-').reverse().join('/');
      if (b.acepta) Object.assign(this.acepta, b.acepta);
    } catch {
      /* borrador ilegible: se empieza de cero */
    }
  }
}

/** Nombre de la competición (para el JSON-LD). */
function competicionNombre(c: { nombre?: string } | null): string {
  return c?.nombre || 'GR Strength Cup 2026';
}

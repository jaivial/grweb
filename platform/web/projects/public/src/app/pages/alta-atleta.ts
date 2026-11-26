import { HttpClient } from '@angular/common/http';
import { mascaraFecha } from './fecha-mascara';
import { MARCAS_PERFIL, MAX_BIO, MAX_FRASE, MAX_MARCA, esMenorDe, pruebaEnFoco, pruebaSiguiente, tarjetasPrueba, totalMarcas, validarPerfil } from '../core/perfil-campos';
import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, PLATFORM_ID, PendingTasks, afterNextRender, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GrButton, GrIcon, GrSkeleton, GrTelefono } from '@grcup/ui';
import { firstValueFrom } from 'rxjs';
import { AltchaConfig } from '../core/altcha';
import { Cms } from '../core/cms';
import { Competition, COMPETITION_SLUG } from '../core/competition';
import { Seo } from '../core/seo';
import { errorEn } from '../core/errores';
import { I18n, LocPipe, idiomaActual } from '../core/i18n';
import { Page } from '../layout/page';
import { Community, Related, type RelatedLink } from './landings';
import { GrAltcha } from './alta-atleta-altcha';
import { AltaFoto, type FotoAlta } from './alta-atleta-foto';
import { AltaExito } from './alta-atleta-exito';
import { AltaAviso } from './alta-atleta-aviso';
import { AltaFaq, FAQS } from './alta-atleta-faq';
import { HandlerGratis } from './handler-gratis';

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
  pruebas?: { codigo: string; nombre: string; fecha?: string; fechaFin?: string; nivel: string; plazas: number; ocupadas: number }[];
  /** Último día (AAAA-MM-DD) para elegir la competición desde el área de atleta. */
  limiteEleccion?: string;
  /** El evento no tiene plazas libres: solo puede darse de alta quien ya está inscrito en la competición. */
  completa?: boolean;
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
type Aviso = 'ninguno' | 'duplicado' | 'aprobada' | 'limite' | 'red';

const BORRADOR = 'grcup:alta-atleta:borrador';

/**
 * /alta-atleta (Figma 75): la página pública del alta de atleta con revisión humana.
 * Formulario completo (datos, foto, perfil, marcas, consentimientos y envío), estados de error y
 * de éxito en la misma ruta, y las preguntas rápidas (FAQPage).
 */
@Component({
  selector: 'gr-alta-atleta-page',
  imports: [Page, FormsModule, GrButton, GrIcon, GrSkeleton, GrTelefono, Related, Community, GrAltcha, AltaFoto, AltaExito, AltaAviso, AltaFaq, HandlerGratis, LocPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <gr-page
      [title]="exito() ? t().tituloExito : t().titulo"
      [accent]="exito() ? '' : t().acento"
      [suffix]="exito() ? '' : t().sufijo"
      [eyebrow]="exito() ? t().eyebrowExito : t().eyebrow"
      [section]="t().seccion"
      [crumb]="t().miga"
      [subtitle]="exito() ? t().introExito : cerrada() ? t().introCerrada : t().intro"
      [subtitleHtml]="exito() || cerrada() ? '' : introHtml()"
      [tituloMovilGrande]="!exito()"
      [tituloCentrado]="exito()">
      @if (vista() === 'cargando') {
        <gr-skeleton class="h-[560px] rounded-[18px]" />
      } @else if (vista() === 'exito') {
        <!-- Figma 75 «Éxito»: qué pasa ahora, en tres pasos -->
        <gr-alta-exito [contacto]="contacto()" [foto]="fotoExito()" [menor]="menorExito()" />
        <div class="mt-18 flex flex-col gap-18 md:gap-24">
          <gr-related nivel="h3" [items]="t().relacionados" />
          <gr-community nivel="h3" />
        </div>
      } @else {
        <!-- Formulario centrado (Figma 171:89503: 760 px, sin columna de resumen) -->
        <div class="mx-auto w-full max-w-[760px]">
          <div id="formulario" class="min-w-0 scroll-mt-24 outline-none" tabindex="-1">
            @switch (vista()) {
              @case ('cerrada') { <gr-alta-aviso tipo="cerrada" [contacto]="contacto()" /> }
              @case ('legal') { <gr-alta-aviso tipo="legal" [contacto]="contacto()" /> }
              @case ('error') { <gr-alta-aviso tipo="error" [contacto]="contacto()" (reintentar)="recargar()" /> }
              @default {
                @if (aviso() === 'duplicado') {
                  <gr-alta-aviso tipo="duplicado" [contacto]="contacto()" />
                } @else if (aviso() === 'aprobada') {
                  <gr-alta-aviso tipo="aprobada" [contacto]="contacto()" />
                } @else {
                  <form class="relative flex min-w-0 flex-col gap-6 rounded-[18px] border border-line-subtle bg-bg-card p-4 md:p-7" method="post" (ngSubmit)="enviar()" novalidate>
                    <div>
                      <h2 class="text-display-xs italic md:text-display-s md:text-[32px]">{{ t().solicitud }}</h2>
                      <p class="mt-1.5 text-[12px] leading-4 text-text-tertiary">{{ t().obligatorios }}</p>
                    </div>

                    @if (resumen().length) {
                      <!-- Resumen de errores: lleva a cada campo -->
                      <div #resumenErr tabindex="-1" class="scroll-mt-28 rounded-md border border-accent bg-accent/8 p-4 outline-none" role="alert">
                        <p class="flex items-center gap-2 text-label-s"><gr-icon name="circle-alert" [size]="18" class="text-accent-text" />{{ t().revisa(resumen().length) }}</p>
                        <ul class="mt-2 flex flex-col gap-1 pl-1 text-body-s text-text-secondary">
                          @for (e of resumen(); track e.campo) { <li>• <a [href]="'#c-' + idCampo(e.campo)" (click)="$event.preventDefault(); enfocar('#c-' + idCampo(e.campo))" class="hover:text-text-primary hover:underline">{{ e.label }}: {{ e.msg }}</a></li> }
                        </ul>
                      </div>
                    }

                    <!-- Tus datos -->
                    <fieldset class="flex min-w-0 flex-col gap-4">
                      <legend class="mb-5 text-display-2xs italic">{{ t().tusDatos }}</legend>
                      <div class="grid gap-4 sm:grid-cols-2">
                        <div class="flex min-w-0 flex-col gap-2">
                          <label class="text-label-s" for="c-nombre">{{ t().nombre }}</label>
                          <input id="c-nombre" name="nombre" type="text" autocomplete="given-name" maxlength="60" [placeholder]="t().nombrePh"
                            class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                            [class]="err()['nombre'] ? 'border-accent-text' : 'border-line-strong'"
                            [(ngModel)]="d.nombre" (ngModelChange)="revalidar()"
                            [attr.aria-invalid]="!!err()['nombre']" [attr.aria-describedby]="err()['nombre'] ? 'e-nombre' : null" />
                          @if (err()['nombre']; as e) { <p id="e-nombre" class="flex items-center gap-1.5 text-body-s text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                        </div>
                        <div class="flex min-w-0 flex-col gap-2">
                          <label class="text-label-s" for="c-apellidos">{{ t().apellidos }}</label>
                          <input id="c-apellidos" name="apellidos" type="text" autocomplete="family-name" maxlength="60" [placeholder]="t().apellidosPh"
                            class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                            [class]="err()['apellidos'] ? 'border-accent-text' : 'border-line-strong'"
                            [(ngModel)]="d.apellidos" (ngModelChange)="revalidar()"
                            [attr.aria-invalid]="!!err()['apellidos']" [attr.aria-describedby]="err()['apellidos'] ? 'e-apellidos' : null" />
                          @if (err()['apellidos']; as e) { <p id="e-apellidos" class="flex items-center gap-1.5 text-body-s text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                        </div>
                      </div>
                      <div class="flex min-w-0 flex-col gap-2">
                        <label class="text-label-s" for="c-email">{{ t().email }}</label>
                        <input id="c-email" name="email" type="email" autocomplete="email" maxlength="254" [placeholder]="t().emailPh"
                          class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                          [class]="err()['email'] ? 'border-accent-text' : 'border-line-strong'"
                          [(ngModel)]="d.email" (ngModelChange)="revalidar()"
                          [attr.aria-invalid]="!!err()['email']" [attr.aria-describedby]="err()['email'] ? 'e-email h-email' : 'h-email'" />
                        <p id="h-email" class="text-body-s text-text-tertiary">{{ t().emailAyuda }}</p>
                        @if (err()['email']; as e) { <p id="e-email" class="flex items-center gap-1.5 text-body-s text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                      <div class="flex min-w-0 flex-col gap-2">
                        <label class="text-label-s" for="c-telefono">{{ t().telefono }}</label>
                        <gr-telefono id="c-telefono" name="telefono" [aria-label]="t().telefono" [invalido]="!!err()['telefono']" [(ngModel)]="d.telefono" (ngModelChange)="revalidar()" />
                        <p id="h-telefono" class="text-body-s text-text-tertiary">{{ t().telAyuda }}{{ legal('whatsapp') ? t().telWhatsapp : '' }}</p>
                        @if (err()['telefono']; as e) { <p id="e-telefono" class="flex items-center gap-1.5 text-body-s text-accent-text" aria-live="polite"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                      <div class="flex min-w-0 flex-col gap-2">
                        <span class="text-label-s" id="l-sexo">{{ t().sexo }}</span>
                        <div id="c-sexo" tabindex="-1" class="flex gap-2 scroll-mt-28 outline-none" role="radiogroup" aria-labelledby="l-sexo" aria-required="true" [attr.aria-invalid]="err()['sexo'] ? true : null" [attr.aria-describedby]="err()['sexo'] ? 'e-sexo' : null">
                          <button type="button" role="radio" [attr.aria-checked]="d.sexo === 'F'" (click)="d.sexo = 'F'; revalidar()"
                            class="inline-flex h-12 flex-1 items-center justify-center rounded-[10px] border px-4 text-label-m transition-colors"
                            [class]="d.sexo === 'F' ? 'border-accent-text bg-accent-deep/30 text-text-primary' : (err()['sexo'] ? 'border-accent-text' : 'border-line-strong') + ' text-text-secondary hover:text-text-primary'">{{ t().mujer }}</button>
                          <button type="button" role="radio" [attr.aria-checked]="d.sexo === 'M'" (click)="d.sexo = 'M'; revalidar()"
                            class="inline-flex h-12 flex-1 items-center justify-center rounded-[10px] border px-4 text-label-m transition-colors"
                            [class]="d.sexo === 'M' ? 'border-accent-text bg-accent-deep/30 text-text-primary' : (err()['sexo'] ? 'border-accent-text' : 'border-line-strong') + ' text-text-secondary hover:text-text-primary'">{{ t().hombre }}</button>
                        </div>
                        @if (err()['sexo']; as e) { <p id="e-sexo" class="flex items-center gap-1.5 text-body-s text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                      <div class="flex min-w-0 flex-col gap-2">
                        <label class="text-label-s" for="c-nacimiento">{{ t().nacimiento }}</label>
                        <input id="c-nacimiento" name="fechaNacimiento" type="text" inputmode="numeric" autocomplete="bday" [placeholder]="t().fechaPh"
                          class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m focus:border-accent-text focus:outline-none"
                          [class]="err()['fechaNacimiento'] ? 'border-accent-text' : 'border-line-strong'"
                          [value]="fechaTexto" (input)="fechaCambia($any($event.target))"
                          [attr.aria-invalid]="!!err()['fechaNacimiento']" [attr.aria-describedby]="err()['fechaNacimiento'] ? 'e-nacimiento h-nacimiento' : 'h-nacimiento'" />
                        <p id="h-nacimiento" class="text-body-s text-text-tertiary">{{ t().fechaAyuda }}</p>
                        @if (err()['fechaNacimiento']; as e) { <p id="e-nacimiento" class="flex items-center gap-1.5 text-body-s text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                      @if (esMenor()) {
                        <p class="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/8 p-4 text-body-s text-text-secondary">
                          <gr-icon name="clock" [size]="18" class="mt-0.5 shrink-0 text-warning" />{{ t().menor }}
                        </p>
                      }
                    </fieldset>

                    <!-- Competición -->
                    <fieldset class="flex min-w-0 flex-col gap-4">
                      <legend class="mb-5 text-display-2xs italic">{{ t().competicion }}</legend>
                      @if (cfg()?.pruebas?.length) {
                        <div id="c-prueba" class="flex min-w-0 flex-col gap-3" role="radiogroup" aria-labelledby="l-prueba" [attr.aria-describedby]="err()['prueba'] ? 'e-prueba' : null" (keydown)="teclaPrueba($event)">
                          <span id="l-prueba" class="font-display text-base uppercase italic tracking-[0.02em]">{{ t().queCompeticion }}</span>
                          @for (o of opcionesPrueba(); track o.codigo) {
                            <button type="button" role="radio" [attr.aria-checked]="d.prueba === o.codigo" (click)="d.prueba = o.codigo; revalidar()"
                              [disabled]="o.completa" [attr.aria-disabled]="o.completa || null" [attr.data-prueba]="o.codigo"
                              [attr.aria-label]="o.titulo + '. ' + o.detalle" [attr.tabindex]="o.codigo === pruebaFoco() ? 0 : -1"
                              class="flex w-full items-center gap-4 rounded-[10px] border px-4 py-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                              [class]="d.prueba === o.codigo ? 'border-accent-text bg-accent-deep/30' : o.completa ? 'border-line-subtle bg-bg-card' : 'border-line-subtle bg-bg-card hover:border-line-strong'">
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
                          @if (err()['prueba']) { <p id="e-prueba" class="text-body-s text-accent-text">{{ err()['prueba'] }}</p> }
                        </div>
                      }
                      <div class="grid gap-4 sm:grid-cols-2">
                        <div class="flex min-w-0 flex-col gap-2">
                          <label class="text-label-s" for="c-club">Club</label>
                          <input id="c-club" name="club" type="text" maxlength="80" [placeholder]="t().clubPh"
                            class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                            [class]="err()['club'] ? 'border-accent-text' : 'border-line-strong'"
                            [(ngModel)]="d.club" (ngModelChange)="revalidar()"
                            [attr.aria-invalid]="!!err()['club']" [attr.aria-describedby]="err()['club'] ? 'e-club' : null" />
                          @if (err()['club']; as e) { <p id="e-club" class="flex items-center gap-1.5 text-body-s text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                        </div>
                        <div class="flex min-w-0 flex-col gap-2">
                          <label class="text-label-s" for="c-ciudad">{{ t().ciudad }}</label>
                          <input id="c-ciudad" name="ciudad" type="text" maxlength="80" placeholder="Valencia"
                            class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                            [class]="err()['ciudad'] ? 'border-accent-text' : 'border-line-strong'"
                            [(ngModel)]="d.ciudad" (ngModelChange)="revalidar()"
                            [attr.aria-invalid]="!!err()['ciudad']" [attr.aria-describedby]="err()['ciudad'] ? 'e-ciudad' : null" />
                          @if (err()['ciudad']; as e) { <p id="e-ciudad" class="flex items-center gap-1.5 text-body-s text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                        </div>
                      </div>
                      <div class="flex min-w-0 flex-col gap-2">
                        <label class="text-label-s" for="c-entrenador">{{ t().entrenador }}</label>
                        <input id="c-entrenador" name="entrenador" type="text" maxlength="80" [placeholder]="t().entrenadorPh"
                          class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                          [class]="err()['entrenador'] ? 'border-accent-text' : 'border-line-strong'"
                          [(ngModel)]="d.entrenador" (ngModelChange)="revalidar()"
                          [attr.aria-invalid]="!!err()['entrenador']" [attr.aria-describedby]="err()['entrenador'] ? 'e-entrenador' : null" />
                        @if (err()['entrenador']; as e) { <p id="e-entrenador" class="flex items-center gap-1.5 text-body-s text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                      <label class="flex min-h-11 items-start gap-2.5 py-1 text-body-s text-text-secondary">
                        <span class="relative -mt-px flex size-6 shrink-0 items-center justify-center">
                          <input type="checkbox" name="asignarHandler" [(ngModel)]="asignarHandler"
                            class="peer size-[22px] cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-bg-base checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text" />
                          @if (asignarHandler) { <gr-icon name="check" [size]="14" class="pointer-events-none absolute text-white" /> }
                        </span>
                        <span>{{ t().asignarHandler }}</span>
                      </label>
                    </fieldset>

                    <!-- Tu foto -->
                    <fieldset class="flex min-w-0 flex-col gap-4">
                      <legend class="mb-5 text-display-2xs italic">{{ t().tuFoto }}</legend>
                      <gr-alta-foto [subiendo]="subiendo()" [procesando]="procesando()" [progreso]="progreso()" (cambio)="fotoCambia($event)" />
                    </fieldset>

                    <!-- Tu perfil -->
                    <fieldset class="flex min-w-0 flex-col gap-4">
                      <legend class="mb-5 text-display-2xs italic">{{ t().tuPerfil }}</legend>
                      <div class="flex min-w-0 flex-col gap-2">
                        <div class="flex items-baseline justify-between gap-3">
                          <label class="text-label-s" for="c-frase">{{ t().frase }}</label>
                          <span class="text-body-s text-text-tertiary">{{ d.frase.length }} / {{ maxFrase }}</span>
                        </div>
                        <input id="c-frase" name="frase" type="text" maxlength="80" [placeholder]="t().frasePh"
                          class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                          [class]="err()['frase'] ? 'border-accent-text' : 'border-line-strong'"
                          [(ngModel)]="d.frase" (ngModelChange)="revalidar()"
                          [attr.aria-invalid]="!!err()['frase']" [attr.aria-describedby]="err()['frase'] ? 'e-frase' : null" />
                        @if (err()['frase']; as e) { <p id="e-frase" class="flex items-center gap-1.5 text-body-s text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                      <div class="flex min-w-0 flex-col gap-2">
                        <div class="flex items-baseline justify-between gap-3">
                          <label class="text-label-s" for="c-bio">{{ t().bio }}</label>
                          <span class="text-body-s text-text-tertiary">{{ d.bio.length }} / {{ maxBio }}</span>
                        </div>
                        <textarea id="c-bio" name="bio" rows="4" maxlength="280" [placeholder]="t().bioPh"
                          class="w-full rounded-[10px] border bg-bg-field px-3.5 py-3 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                          [class]="err()['bio'] ? 'border-accent-text' : 'border-line-strong'"
                          [(ngModel)]="d.bio" (ngModelChange)="revalidar()"
                          [attr.aria-invalid]="!!err()['bio']" [attr.aria-describedby]="err()['bio'] ? 'e-bio' : null"></textarea>
                        @if (err()['bio']; as e) { <p id="e-bio" class="flex items-center gap-1.5 text-body-s text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      </div>
                      @if (!esMenor()) {
                        <div class="flex min-w-0 flex-col gap-2">
                          <label class="text-label-s" for="c-instagram">{{ t().instagram }}</label>
                          <input id="c-instagram" name="instagram" type="text" maxlength="31" [placeholder]="t().instagramPh"
                            class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                            [class]="err()['instagram'] ? 'border-accent-text' : 'border-line-strong'"
                            [(ngModel)]="d.instagram" (ngModelChange)="revalidar()"
                            [attr.aria-invalid]="!!err()['instagram']" [attr.aria-describedby]="err()['instagram'] ? 'e-instagram' : null" />
                          @if (err()['instagram']; as e) { <p id="e-instagram" class="flex items-center gap-1.5 text-body-s text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                        </div>
                      } @else {
                        <p class="text-body-s text-text-tertiary">{{ t().instagramMenor }}</p>
                      }
                    </fieldset>

                    <!-- Mejores marcas -->
                    <fieldset class="flex min-w-0 flex-col gap-4">
                      <legend class="mb-5 text-display-2xs italic">{{ t().marcas }}</legend>
                      <p class="-mt-2 text-body-s text-text-tertiary">{{ t().opcionales }}</p>
                      <div class="grid gap-4 sm:grid-cols-3">
                        @for (m of marcasCampos; track m.k) {
                          <div class="flex min-w-0 flex-col gap-2">
                            <label class="text-label-s" [for]="'c-' + m.k">{{ t()[m.k] }}</label>
                            <input [id]="'c-' + m.k" [name]="m.k" type="number" inputmode="decimal" step="0.5" min="0" [max]="maxMarca" placeholder="kg"
                              class="h-12 w-full rounded-[10px] border bg-bg-field px-3.5 text-body-m placeholder:text-text-muted focus:border-accent-text focus:outline-none"
                              [class]="err()[m.k] ? 'border-accent-text' : 'border-line-strong'"
                              [(ngModel)]="d[m.k]" (ngModelChange)="revalidar()"
                              [attr.aria-invalid]="!!err()[m.k]" [attr.aria-describedby]="err()[m.k] ? 'e-' + m.k : null" />
                            @if (err()[m.k]; as e) { <p [id]="'e-' + m.k" class="flex items-center gap-1.5 text-body-s text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                          </div>
                        }
                      </div>
                      <p class="flex items-center justify-between gap-4 rounded-[10px] bg-bg-raised px-4 py-3">
                        <span class="text-label-m">Total (SQ + BP + DL)</span>
                        <span class="text-ui-h4 tabular-nums" [class]="total() === null ? 'text-text-tertiary' : 'text-accent-text'">{{ total() === null ? '—' : total() + ' kg' }}</span>
                      </p>
                    </fieldset>

                    <!-- Consentimientos -->
                    <fieldset id="c-consentimiento" tabindex="-1" class="flex min-w-0 scroll-mt-28 flex-col gap-3 outline-none">
                      <legend class="mb-5 text-display-2xs italic">{{ t().consentimientos }}</legend>
                      @for (c of casillas(); track c.k) {
                        <label class="flex min-h-11 items-start gap-2.5 py-1 text-body-s" [class]="c.req ? 'text-text-primary' : 'text-text-secondary'">
                          <span class="relative -mt-px flex size-6 shrink-0 items-center justify-center">
                            <input type="checkbox" [name]="'c-' + c.k" [(ngModel)]="acepta[c.k]" (ngModelChange)="revalidar()"
                              class="peer size-[22px] cursor-pointer appearance-none rounded-[5px] border bg-bg-base checked:border-accent checked:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                              [class]="c.req && err()['consentimiento'] && !acepta[c.k] ? 'border-accent-text' : 'border-line-strong'" />
                            @if (acepta[c.k]) { <gr-icon name="check" [size]="14" class="pointer-events-none absolute text-white" /> }
                          </span>
                          <span>
                            @switch (c.k) {
                              @case ('terminos') { {{ t().acepto }}<a [href]="'/terminos' | loc" target="_blank" rel="noopener" class="text-accent-text hover:underline">{{ t().terminosUso }}</a>{{ t().yEl }}<a [href]="'/reglamento' | loc" target="_blank" rel="noopener" class="text-accent-text hover:underline">{{ t().reglamento }}</a>. * }
                              @case ('privacidad') { {{ t().heLeido }}<a [href]="'/privacidad' | loc" target="_blank" rel="noopener" class="text-accent-text hover:underline">{{ t().politica }}</a>{{ t().tratamiento }} * }
                              @case ('imagen') { {{ t().autorizo }}<a [href]="'/consentimiento-datos' | loc" target="_blank" rel="noopener" class="text-accent-text hover:underline">{{ t().consImagen }}</a>). }
                              @case ('novedades') { {{ cfg()?.textoNovedades }} }
                              @case ('whatsapp') { {{ t().quieroWa }}<a [href]="'/texto-whatsapp' | loc" target="_blank" rel="noopener" class="text-accent-text hover:underline">{{ t().textoWa }}</a>). }
                            }
                          </span>
                        </label>
                      }
                      @if (err()['consentimiento']; as e) { <p class="flex items-center gap-1.5 text-body-s text-accent-text"><gr-icon name="circle-alert" [size]="14" />{{ e }}</p> }
                      <p class="text-body-s text-text-tertiary">{{ t().rgpd }}</p>
                    </fieldset>

                    <!-- Envío -->
                    <fieldset class="flex min-w-0 flex-col gap-4">
                      <legend class="mb-5 text-display-2xs italic">{{ t().envio }}</legend>
                      <!-- Trampa para robots: fuera de la vista y del recorrido del teclado. -->
                      <span class="absolute h-px w-px overflow-hidden opacity-0" aria-hidden="true">
                        <label for="c-web">{{ t().trampa }}</label>
                        <input id="c-web" name="web" type="text" tabindex="-1" autocomplete="off" [(ngModel)]="d.web" />
                      </span>
                      <gr-altcha [cfg]="cfg()?.altcha ?? null" [reiniciar]="reinicioAltcha()" (verificado)="altchaPago.set($event)" (pedirReto)="pedirReto()" />
                      @if (error()) {
                        <p class="flex items-start gap-2 rounded-md border border-accent bg-accent/8 p-4 text-body-s text-accent-text" role="alert"><gr-icon name="circle-alert" [size]="18" class="mt-0.5 shrink-0" />{{ error() }}</p>
                      }
                      @if (aviso() === 'limite' || aviso() === 'red') {
                        <div id="aviso-envio" tabindex="-1" class="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/8 p-4 text-body-s text-text-secondary outline-none" role="alert">
                          <p class="flex items-start gap-2"><gr-icon [name]="aviso() === 'limite' ? 'clock' : 'circle-alert'" [size]="18" class="mt-0.5 shrink-0 text-warning" />
                            @if (aviso() === 'limite') { {{ limiteTexto() || t().limite }} {{ t().siguen(!!foto) }} {{ bloqueado() ? t().reintentaEn(espera()) : t().yaPuedes }} }
                            @else { {{ t().red }} {{ t().siguen(!!foto) }} {{ t().pulsa }} }
                          </p>
                          <div><button grButton variant="secondary" size="m" type="button" (click)="enviar()" [disabled]="enviando() || bloqueado()">{{ t().reintentar }}</button></div>
                        </div>
                      }
                    </fieldset>
                    <!-- UX2-R1-4: en móvil, CTA fijo abajo (zona del pulgar) mientras el formulario está en vista -->
                    <div class="max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-4 max-md:border-t max-md:border-line-subtle max-md:bg-bg-base/95 max-md:px-4 max-md:pt-3 max-md:pb-[max(12px,env(safe-area-inset-bottom))] max-md:backdrop-blur-[10px]"><button grButton variant="primary" size="l" type="submit" class="max-md:w-full" [loading]="enviando()" [disabled]="!hidratado() || enviando() || bloqueado()">{{ t().enviar }}</button></div>
                    <p class="-mt-3 text-body-s text-text-muted">{{ t().alEnviar }}</p>
                  </form>
                }
              }
            }
          </div>
        </div>

        <!-- Preguntas frecuentes -->
        <gr-handler-gratis />
        <gr-alta-faq />
        <div class="mt-18 flex flex-col gap-18 md:mt-24 md:gap-24">
          <gr-related nivel="h3" [items]="t().relacionados" />
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
  private readonly i18n = inject(I18n);
  protected readonly t = this.i18n.dict(T);

  /** Configuración del alta (módulo, legales, reto y token de tiempo). */
  protected readonly cfg = signal<ConfigAlta | null>(null);
  protected readonly vista = signal<Vista>('cargando');
  protected readonly aviso = signal<Aviso>('ninguno');
  protected readonly err = signal<Record<string, string>>({});
  protected readonly error = signal('');
  protected readonly exito = signal(false);
  /** The athlete authorised publishing their profile (image consent): only then the success screen promises it. */
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

  /** Máscara dd/mm/aaaa (compartida con /inscripcion). */
  protected fechaCambia(el: HTMLInputElement): void {
    const { texto, iso } = mascaraFecha(el.value);
    el.value = this.fechaTexto = texto;
    this.d.fechaNacimiento = iso;
    this.revalidar();
  }

  /** Las tarjetas de «¿En qué competición compites?» (Figma 219:169366: sin chips ni contador; completa = deshabilitada). */
  protected opcionesPrueba(): ReturnType<typeof tarjetasPrueba> {
    return tarjetasPrueba(this.cfg()?.pruebas, this.i18n.locale(), this.t().completa);
  }

  /** La opción que entra en el recorrido del teclado (radiogroup: un solo tab stop). */
  protected pruebaFoco(): string {
    return pruebaEnFoco(this.opcionesPrueba(), this.d.prueba);
  }

  /** Flechas en el radiogroup: mueven y eligen la opción siguiente o anterior (saltando las completas). */
  protected teclaPrueba(ev: KeyboardEvent): void {
    const sig = pruebaSiguiente(this.opcionesPrueba(), this.d.prueba, ev.key);
    if (!sig) return;
    ev.preventDefault();
    this.d.prueba = sig;
    this.revalidar();
    (ev.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-prueba="' + sig + '"]')?.focus();
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
  protected asignarHandler = false;
  private intentado = false;
  /** Momento en el que se pidió la configuración (el token de tiempo debe tener al menos 3 s). */
  private configEn = 0;

  protected readonly maxFrase = MAX_FRASE;
  protected readonly maxBio = MAX_BIO;
  protected readonly maxMarca = MAX_MARCA;
  /** Las tres marcas (la misma lista que usa «Editar mi perfil»). */
  protected readonly marcasCampos = MARCAS_PERFIL;

  protected readonly cerrada = computed(() => this.vista() === 'cerrada' || this.vista() === 'legal');
  /** La entradilla con «crea tu perfil de atleta» en negrita (Figma 75). */
  protected readonly introHtml = computed(() => this.t().intro.replace(this.t().negrita, '<strong class="font-semibold text-text-primary">' + this.t().negrita + '</strong>'));

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
    return esMenorDe(this.d.fechaNacimiento);
  }

  /** Una marca (o null si está vacía). Los campos numéricos dan número: se normaliza a texto. */
  protected marca(k: 'marcaSQ' | 'marcaBP' | 'marcaDL'): string | null {
    const v = this.texto(k);
    if (!v) return null;
    const n = Number(v);
    if (isNaN(n)) return null;
    return n.toLocaleString(this.i18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  /** El valor de un campo de marca como texto (los <input type=number> devuelven número). */
  private texto(k: 'marcaSQ' | 'marcaBP' | 'marcaDL'): string {
    const v = this.d[k];
    return (v === null || v === undefined ? '' : String(v)).trim();
  }

  /** Total de las marcas en vivo (null si no hay ninguna). */
  protected total(): string | null {
    const total = totalMarcas(this.d);
    return total === null ? null : total.toLocaleString(this.i18n.locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  /** Errores por campo (con el texto corto del resumen). */
  protected readonly resumen = computed(() => {
    const e = this.err();
    const out: { campo: string; label: string; msg: string }[] = [];
    // The summary repeats the real reason of the field (lower case, without the final full stop).
    const add = (campo: string, label: string) => {
      const m = e[campo];
      label = l[campo as keyof typeof l] ?? label;
      if (m) out.push({ campo, label, msg: m.charAt(0).toLowerCase() + m.slice(1).replace(/\.$/, '') });
    };
    const l = this.t().campos;
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
    add('club', 'Club');
    add('ciudad', 'Ciudad');
    add('entrenador', 'Entrenador');
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
      // the CMS overrides are Spanish: only in ES
      const o = this.i18n.lang() === 'es' ? mapa?.paginas.find((p) => p.ruta === '/alta-atleta') : undefined;
      this.seo.set({
        title: o?.title || this.t().seoTitulo,
        description: o?.description || this.t().seoDesc,
        path: '/alta-atleta',
        jsonLd: this.jsonLd(o?.title || this.t().seoTitulo, o?.description || this.t().seoDesc),
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
          inLanguage: this.i18n.lang(),
          isPartOf: { '@id': o + '/#website' },
          about: { '@type': 'SportsEvent', name: competicionNombre(this.comp.data()) },
        },
        {
          '@type': 'BreadcrumbList',
          '@id': o + '/alta-atleta#breadcrumbs',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: this.t().inicio, item: o + '/' },
            { '@type': 'ListItem', position: 2, name: this.t().seccion, item: o + '/atletas' },
            { '@type': 'ListItem', position: 3, name: this.t().miga, item: o + '/alta-atleta' },
          ],
        },
        {
          '@type': 'FAQPage',
          '@id': o + '/alta-atleta#faq',
          mainEntity: FAQS[this.i18n.lang()].map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
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
      this.error.set(this.t().v.reto);
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
    // The profile fields are validated with the same rules as «Editar mi perfil» of the athlete area.
    const e = validarPerfil(this.d, this.t().v, { fechaTexto: this.fechaTexto, esMenor: this.esMenor(), whatsapp: this.acepta.whatsapp });
    // What only the public form asks: the competition and the consent boxes.
    if (this.cfg()?.pruebas?.length && !this.d.prueba) e['prueba'] = this.t().v.prueba;
    if (!this.acepta.terminos || !this.acepta.privacidad) e['consentimiento'] = this.t().v.acepta;
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
      this.enfocar('[role=alert][tabindex]');
      return;
    }
    if (!this.altchaPago()) {
      this.error.set(this.t().v.robot);
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
      licencia: '',
      prueba: this.d.prueba,
      club: this.d.club.trim(),
      ciudad: this.d.ciudad.trim(),
      entrenador: this.d.entrenador.trim(),
      asignarHandler: this.asignarHandler,
      frase: this.d.frase.trim(),
      bio: this.d.bio.trim(),
      instagram: this.esMenor() ? '' : this.d.instagram.trim(),
      historial: '',
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
    // EN: the API detail is Spanish → English text of the code, or the caller's default below
    if (idiomaActual() === 'en') cuerpo = { ...cuerpo, detail: errorEn(cuerpo.code) };
    // The server consumes a valid challenge before field/photo validation and processing. A retry needs a new one.
    if (!(xhr.status === 400 && codigo === 'ANTIBOT')) {
      this.altchaPago.set('');
      void this.pedirReto();
    }
    if (xhr.status === 409 || codigo === 'SOLICITUD_EN_CURSO') {
      this.aviso.set(codigo === 'SOLICITUD_APROBADA' ? 'aprobada' : 'duplicado');
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
      this.error.set(cuerpo.detail || this.t().v.persona);
      this.altchaPago.set('');
      void this.pedirReto(); // el reto anterior ya se usó: se pide uno nuevo
      return;
    }
    if (xhr.status === 422 && codigo === 'VALIDACION' && cuerpo.errors?.length) {
      const e: Record<string, string> = {};
      for (const det of cuerpo.errors) {
        const campo = (det.location ?? '').replace(/^body\./, '');
        if (campo) e[campo] = (idiomaActual() === 'en' ? undefined : det.message) ?? this.t().v.campo;
      }
      this.err.set(e);
      this.error.set('');
      this.enfocar('[role=alert][tabindex]');
      return;
    }
    if (xhr.status === 422 && (codigo === 'CONSENTIMIENTO_OBLIGATORIO' || codigo === 'TELEFONO_OBLIGATORIO')) {
      if (codigo === 'TELEFONO_OBLIGATORIO') this.err.set({ telefono: this.t().v.waTel });
      this.error.set(cuerpo.detail || this.t().v.marcados);
      return;
    }
    // Event full: retrying the same data never works, so only the message (no «Reintentar»).
    if (codigo === 'INSCRIPCION_COMPLETA') {
      this.error.set(cuerpo.detail || this.t().v.completa);
      this.aviso.set('ninguno');
      this.enfocar('#formulario');
      return;
    }
    // Cualquier otro error: se puede reintentar sin perder los datos.
    this.error.set(cuerpo.detail || this.t().v.envio);
    this.aviso.set('red');
    this.enfocar('#aviso-envio');
  }

  /** Id del control de cada campo del resumen (la fecha usa c-nacimiento). */
  protected idCampo(campo: string): string {
    return campo === 'fechaNacimiento' ? 'nacimiento' : campo;
  }

  /** Mueve el foco al bloque que acaba de aparecer (el botón que lo tenía puede quedar deshabilitado). */
  protected enfocar(sel: string): void {
    setTimeout(() => {
      const el = (this.host.nativeElement as HTMLElement).querySelector<HTMLElement>(sel);
      if (!el) return;
      // scroll-behavior:smooth del html anula el scroll del focus: se desplaza a mano y luego se enfoca (UX2-R1-3).
      const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'center', behavior: quieto ? 'auto' : 'smooth' });
      el.focus({ preventScroll: true });
    });
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
    return this.t().tiempo(s);
  }

  /** Teléfono en E.164, tal y como lo entrega `gr-telefono` (vacío si no hay). */
  private telefono(): string {
    return this.d.telefono.trim();
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
      this.d.telefono = String(this.d.telefono ?? '').trim();
      this.fechaTexto = this.d.fechaNacimiento.split('-').reverse().join('/');
      if (b.acepta) Object.assign(this.acepta, b.acepta);
    } catch {
      /* borrador ilegible: se empieza de cero */
    }
  }
}

/** Nombre de la competición (para el JSON-LD). */
function competicionNombre(c: { nombre?: string } | null): string {
  return c?.nombre || 'GRS Cup 2026';
}

const T_ES = {
  emailPh: 'tu@email.com',
  titulo: 'Alta de atleta de', acento: 'powerlifting', sufijo: 'para la GRS Cup', tituloExito: 'Solicitud recibida',
  eyebrow: 'Atletas · GRS Cup 2026', eyebrowExito: 'Solicitud enviada', seccion: 'Atletas', miga: 'Alta de atleta', inicio: 'Inicio',
  intro: 'Si compites en esta edición, crea tu perfil de atleta: foto, datos de competidor y tus mejores marcas en menos de cinco minutos. No es una inscripción y queda privado hasta que lo publiques.',
  negrita: 'crea tu perfil de atleta',
  introCerrada: 'El alta de atletas de la GRS Cup está cerrada ahora mismo: no se pueden enviar solicitudes nuevas. Puedes consultar las fichas publicadas en la lista de atletas y, si ya tienes tu cuenta, entrar en el área de atleta.',
  introExito: 'Tu solicitud de alta está ya en revisión: el equipo la repasa a mano y te avisamos por email con el resultado. Al aprobarla tu ficha quedará privada: podrás activar su publicación desde el área de atleta.',
  relacionados: [
    { titulo: 'Atletas', texto: 'La plantilla de la GRS Cup', ruta: '/atletas' },
    { titulo: 'Área de atleta', texto: 'Edita tu ficha y tus marcas', ruta: '/area-atleta' },
    { titulo: 'Reglamento', texto: 'Las normas de la competición', ruta: '/reglamento' },
  ] as RelatedLink[],
  seoTitulo: 'Alta de atleta de powerlifting | GRS Cup',
  seoDesc: 'Date de alta como atleta de la GRS Cup: crea tu perfil, sube tu foto y tus mejores marcas y compite con tu ficha lista para el pesaje.',
  solicitud: 'Solicitud de alta', obligatorios: 'Los campos marcados con * son obligatorios, el resto opcional.',
  revisa: (n: number) => 'Revisa ' + (n === 1 ? 'un campo' : n + ' campos') + ' antes de enviar',
  tusDatos: 'Tus datos', nombre: 'Nombre *', nombrePh: 'Tu nombre', apellidos: 'Apellidos *', apellidosPh: 'Tus apellidos',
  email: 'Email de tu inscripción *', emailAyuda: 'El mismo con el que te inscribiste; así te reconocemos.',
  telefono: 'Teléfono móvil', telAyuda: 'Elige el país y escribe el número completo.', telWhatsapp: ' Obligatorio solo si marcas los avisos por WhatsApp.',
  sexo: 'Sexo *', mujer: 'Mujer', hombre: 'Hombre', nacimiento: 'Fecha de nacimiento *', fechaPh: 'dd/mm/aaaa', fechaAyuda: 'Formato dd/mm/aaaa. De 14 a 90 años.',
  menor: 'Como has nacido antes de los 18, necesitaremos la autorización firmada de tu madre, padre o tutor. Te la pediremos por email antes de publicar tu ficha.',
  competicion: 'Competición', queCompeticion: '¿En qué competición compites?', completa: 'Completa · sin plazas',
  clubPh: 'Escribe tu club', ciudad: 'Ciudad', entrenador: 'Entrenador/a (opcional)', entrenadorPh: 'Tu entrenador/a', asignarHandler: 'No tengo handler / Asignadme uno',
  tuFoto: 'Tu foto', tuPerfil: 'Tu perfil', frase: 'Frase de presentación (opcional)', frasePh: 'Una frase para tu ficha',
  bio: 'Sobre ti (opcional)', bioPh: 'Cuéntale a la gente quién eres en dos líneas', instagram: 'Instagram (opcional)', instagramPh: '@tuusuario',
  instagramMenor: 'A los menores de 18 no les pedimos Instagram: el campo se oculta y no se publica nunca.',
  marcas: 'Mejores marcas', opcionales: 'Opcionales.', marcaSQ: 'Sentadilla (SQ)', marcaBP: 'Press de banca (BP)', marcaDL: 'Peso muerto (DL)',
  consentimientos: 'Consentimientos', acepto: 'Acepto los ', terminosUso: 'términos de uso', yEl: ' y el ', reglamento: 'reglamento',
  heLeido: 'He leído la ', politica: 'política de privacidad', tratamiento: ' y acepto el tratamiento de mis datos para gestionar mi alta.',
  autorizo: 'Autorizo publicar mi nombre, datos deportivos y foto en la web, la pantalla y el directo de la GRS Cup (ver ', consImagen: 'consentimiento de imagen',
  quieroWa: 'Quiero recibir avisos de mi alta y de la competición por WhatsApp (ver ', textoWa: 'texto de WhatsApp',
  rgpd: 'Responsable: GRStrength · Finalidad: gestionar tu alta de atleta y, solo si lo marcas, enviarte novedades y avisos · Legitimación: tu consentimiento · Derechos: acceso, rectificación, supresión y baja desde el área de atleta o cualquier email.',
  envio: 'Envío', trampa: 'No rellenes este campo', limite: 'Se han enviado muchas solicitudes desde esta conexión.',
  siguen: (foto: boolean) => 'Tus datos' + (foto ? ' y tu foto' : '') + ' siguen aquí:',
  reintentaEn: (t: string) => 'podrás reintentarlo en ' + t + '.', yaPuedes: 'ya puedes reintentarlo.',
  red: 'No hemos podido enviar tu solicitud (conexión o servicio ocupado).', pulsa: 'pulsa «Reintentar».', reintentar: 'Reintentar', enviar: 'Enviar mi alta',
  alEnviar: 'Al enviar, aceptas los términos de uso y la política de privacidad. Te escribimos para confirmar que hemos recibido tu solicitud.',
  tiempo: (s: number) => s < 60 ? (s === 1 ? '1 segundo' : s + ' segundos') : Math.ceil(s / 60) === 1 ? '1 minuto' : Math.ceil(s / 60) + ' minutos',
  campos: { nombre: 'Nombre', apellidos: 'Apellidos', email: 'Email', telefono: 'Teléfono', sexo: 'Sexo', fechaNacimiento: 'Fecha de nacimiento', prueba: 'Competición', frase: 'Frase', bio: 'Sobre ti', instagram: 'Instagram', club: 'Club', ciudad: 'Ciudad', entrenador: 'Entrenador', marcaSQ: 'Sentadilla', marcaBP: 'Press de banca', marcaDL: 'Peso muerto', consentimiento: 'Consentimientos' },
  v: {
    oblig: 'Es obligatorio.', nombreLetras: 'El nombre debe contener letras.', largo60: 'Es demasiado largo (60 caracteres como máximo).', obligPl: 'Son obligatorios.',
    apellidosLetras: 'Los apellidos deben contener letras.', largos60: 'Son demasiado largos (60 caracteres como máximo).', email: 'Introduce un email válido.',
    waTel: 'Si pides avisos por WhatsApp, necesitas tu teléfono.', opcion: 'Elige una opción.', anio: 'Escribe el año con 4 cifras (dd/mm/aaaa).', fecha: 'Elige una fecha válida.',
    edad: 'Esa fecha no parece correcta (debe estar entre los 14 y los 90 años).', largo: 'Es demasiado largo.', larga: 'Es demasiado larga.',
    larga80: 'Es demasiado larga (80 caracteres como máximo).', largo280: 'Es demasiado largo (280 caracteres como máximo).',
    ig: 'Solo letras, números, puntos y guiones bajos (30 como máximo).', prueba: 'Elige una competición.', marca: 'La marca debe estar entre 0 y 600 kg.',
    paso: 'Las marcas van en pasos de 0,5 kg.', acepta: 'Acepta los términos de uso y la política de privacidad.', telCorto: 'El número de teléfono no está completo.',
    reto: 'No hemos podido pedir una verificación nueva. Vuelve a intentarlo en unos segundos.', robot: 'Marca la casilla «No soy un robot» antes de enviar.',
    persona: 'No hemos podido verificar que eres una persona.', campo: 'Revisa este campo.', marcados: 'Revisa los campos marcados.', completa: 'La competición está completa.', envio: 'No hemos podido enviar tu solicitud.',
  },
};

const T = {
  es: T_ES,
  en: {
    emailPh: 'you@email.com',
    titulo: 'Athlete sign-up for', acento: 'powerlifting', sufijo: 'at the GRS Cup', tituloExito: 'Request received',
    eyebrow: 'Athletes · GRS Cup 2026', eyebrowExito: 'Request sent', seccion: 'Athletes', miga: 'Athlete sign-up', inicio: 'Home',
    intro: "If you're competing in this edition, create your athlete profile: photo, competitor details and your best lifts in under five minutes. It isn't a registration and it stays private until you publish it.",
    negrita: 'create your athlete profile',
    introCerrada: 'GRS Cup athlete sign-up is closed right now: new requests cannot be sent. You can browse the published profiles in the athlete list and, if you already have an account, go to the athlete area.',
    introExito: "Your sign-up request is now under review: the team checks it by hand and we'll email you the outcome. Once approved your profile will stay private: you can publish it from the athlete area.",
    relacionados: [
      { titulo: 'Athletes', texto: 'The GRS Cup line-up', ruta: '/en/atletas' },
      { titulo: 'Athlete area', texto: 'Edit your profile and lifts', ruta: '/en/area-atleta' },
      { titulo: 'Rulebook', texto: 'The competition rules', ruta: '/en/reglamento' },
    ] as RelatedLink[],
    seoTitulo: 'Powerlifting athlete sign-up | GRS Cup',
    seoDesc: 'Sign up as a GRS Cup athlete: create your profile, upload your photo and your best lifts and compete with your profile ready for weigh-in.',
    solicitud: 'Sign-up request', obligatorios: 'Fields marked with * are required; the rest are optional.',
    revisa: (n: number) => 'Check ' + (n === 1 ? 'one field' : n + ' fields') + ' before sending',
    tusDatos: 'Your details', nombre: 'First name *', nombrePh: 'Your first name', apellidos: 'Surname *', apellidosPh: 'Your surname',
    email: 'Email used for your registration *', emailAyuda: 'The same one you registered with, so we can recognise you.',
    telefono: 'Mobile phone', telAyuda: 'Pick the country and type the full number.', telWhatsapp: ' Only required if you tick WhatsApp notifications.',
    sexo: 'Sex *', mujer: 'Female', hombre: 'Male', nacimiento: 'Date of birth *', fechaPh: 'dd/mm/yyyy', fechaAyuda: 'Format dd/mm/yyyy. Aged 14 to 90.',
    menor: "As you're under 18, we'll need a consent form signed by your mother, father or guardian. We'll ask for it by email before publishing your profile.",
    competicion: 'Competition', queCompeticion: 'Which competition are you entering?', completa: 'Full · no places left',
    clubPh: 'Enter your club', ciudad: 'City', entrenador: 'Coach (optional)', entrenadorPh: 'Your coach', asignarHandler: "I don't have a handler / Assign me one",
    tuFoto: 'Your photo', tuPerfil: 'Your profile', frase: 'Tagline (optional)', frasePh: 'A line for your profile',
    bio: 'About you (optional)', bioPh: 'Tell people who you are in two lines', instagram: 'Instagram (optional)', instagramPh: '@yourusername',
    instagramMenor: "We don't ask under-18s for Instagram: the field is hidden and never published.",
    marcas: 'Best lifts', opcionales: 'Optional.', marcaSQ: 'Squat (SQ)', marcaBP: 'Bench press (BP)', marcaDL: 'Deadlift (DL)',
    consentimientos: 'Consents', acepto: 'I accept the ', terminosUso: 'terms of use', yEl: ' and the ', reglamento: 'rulebook',
    heLeido: "I've read the ", politica: 'privacy policy', tratamiento: ' and accept the processing of my data to manage my sign-up.',
    autorizo: 'I authorise publishing my name, sporting details and photo on the website, the screen and the GRS Cup live stream (see ', consImagen: 'image consent',
    quieroWa: 'I want to receive notifications about my sign-up and the competition by WhatsApp (see ', textoWa: 'WhatsApp text',
    rgpd: 'Controller: GRStrength · Purpose: managing your athlete sign-up and, only if you tick it, sending you news and notifications · Legal basis: your consent · Rights: access, rectification, erasure and unsubscribing from the athlete area or any email.',
    envio: 'Submit', trampa: 'Do not fill in this field', limite: 'Too many requests have been sent from this connection.',
    siguen: (foto: boolean) => 'Your details' + (foto ? ' and photo are' : ' are') + ' still here:',
    reintentaEn: (t: string) => 'you can try again in ' + t + '.', yaPuedes: 'you can try again now.',
    red: "We couldn't send your request (connection problem or service busy).", pulsa: 'press “Retry”.', reintentar: 'Retry', enviar: 'Send my sign-up',
    alEnviar: "By sending, you accept the terms of use and the privacy policy. We'll email you to confirm we've received your request.",
    tiempo: (s: number) => s < 60 ? (s === 1 ? '1 second' : s + ' seconds') : Math.ceil(s / 60) === 1 ? '1 minute' : Math.ceil(s / 60) + ' minutes',
    campos: { nombre: 'First name', apellidos: 'Surname', email: 'Email', telefono: 'Phone', sexo: 'Sex', fechaNacimiento: 'Date of birth', prueba: 'Competition', frase: 'Tagline', bio: 'About you', instagram: 'Instagram', club: 'Club', ciudad: 'City', entrenador: 'Coach', marcaSQ: 'Squat', marcaBP: 'Bench press', marcaDL: 'Deadlift', consentimiento: 'Consents' },
    v: {
      oblig: 'This is required.', nombreLetras: 'Your first name must contain letters.', largo60: 'It is too long (60 characters max).', obligPl: 'This is required.',
      apellidosLetras: 'Your surname must contain letters.', largos60: 'It is too long (60 characters max).', email: 'Enter a valid email.',
      waTel: 'If you ask for WhatsApp notifications, we need your phone number.', opcion: 'Choose an option.', anio: 'Write the year with 4 digits (dd/mm/yyyy).', fecha: 'Choose a valid date.',
      edad: "That date doesn't look right (you must be between 14 and 90).", largo: 'It is too long.', larga: 'It is too long.',
      larga80: 'It is too long (80 characters max).', largo280: 'It is too long (280 characters max).',
      ig: 'Only letters, numbers, full stops and underscores (30 max).', prueba: 'Choose a competition.', marca: 'The lift must be between 0 and 600 kg.',
      paso: 'Lifts go in steps of 0.5 kg.', acepta: 'Accept the terms of use and the privacy policy.', telCorto: 'The phone number is not complete.',
      reto: "We couldn't request a new verification. Try again in a few seconds.", robot: 'Tick the “I am not a robot” box before sending.',
      persona: "We couldn't verify that you are a person.", campo: 'Check this field.', marcados: 'Check the highlighted fields.', completa: 'The competition is full.', envio: "We couldn't send your request.",
    },
  },
};

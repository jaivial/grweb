import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton, GrToasts, type GrIconName } from '@grcup/ui';
import { problemOf } from '../../core/api';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { Confirm, Media, errText } from '../../shared/ui';
import {
  CampanasApi, ESTADO, ESTADO_DEST, NOMBRE_TIPO, TIPOS, fecha, hora, n, waHtml,
  type Audiencia, type Bloque, type Campana, type CampanaIn, type CanalBloque, type Destinatarios, type MensajeIA, type Modelo, type Previa, type Segmento, type TipoBloque,
} from './api';

type Tab = 'flujo' | 'diseno' | 'previa' | 'ajustes';
const LOGO = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo.png';
const ENLACES = ['/entradas', '/horarios', '/atletas', '/participantes', '/sorteo', '/en-directo', '/resultados', '/como-llegar'];

function nuevo(tipo: TipoBloque, id: string): Bloque {
  const b: Bloque = { id, tipo, canal: 'ambos' };
  switch (tipo) {
    case 'titulo': return { ...b, texto: 'Nuevo título' };
    case 'texto': return { ...b, texto: 'Escribe aquí el texto. Usa **negrita** para lo importante.' };
    case 'boton': return { ...b, texto: 'Reserva tu entrada', url: '/entradas' };
    case 'portada': case 'imagen': return { ...b, imagen: 'https://jaimedigitalstudio.b-cdn.net/grcup/images/club/alfonso-fernandez/img-3363.webp', alt: '' };
    case 'lista': return { ...b, items: ['Primer punto', 'Segundo punto'] };
    case 'dos_columnas': return { ...b, texto: '**Plataforma 1**\nFlights A–G', texto2: '**Plataforma 2**\nFlights H–K' };
    case 'cuenta_atras': return { ...b, fecha: '2026-12-19T08:30', texto: 'Faltan' };
    case 'horario': return { ...b, fecha: '2026-12-19', canal: 'email' };
    case 'espacio': return { ...b, alto: 24 };
    default: return b;
  }
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const md = (s = '') => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\{\{\s*nombre\s*\}\}/g, '<span style="background:#f6e0e3;border-radius:3px;padding:0 3px">Laura</span>').replace(/\n/g, '<br>');

/** «Campaña» (Figma page 61): Flujo · Diseño (blocks, layers, properties, AI) · Previsualización (email + WhatsApp) · Ajustes and sending. */
@Component({
  selector: 'bo-campana',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`.canvas p { margin: 0 } .canvas strong { color: #141011 }`],
  template: `
    @let c = camp();
    @if (c === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar la campaña"><a grButton [routerLink]="['/', comps.current()?.slug, 'campanas']">Volver</a></gr-empty> }
    @else if (c === undefined) { <gr-skeleton class="h-[600px] rounded-lg" /> }
    @else {
    <div class="mx-auto flex max-w-[1400px] flex-col gap-4 pb-24">
      <!-- Header -->
      <section class="flex flex-col gap-3 rounded-lg border border-line-subtle bg-bg-card p-4 md:flex-row md:items-center">
        <a [routerLink]="['/', comps.current()?.slug, 'campanas']" class="flex size-10 shrink-0 items-center justify-center rounded-md border border-line-strong hover:bg-bg-raised" aria-label="Volver a campañas"><gr-icon name="chevron-left" [size]="18" /></a>
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-ui-h4">{{ f().nombre || 'Sin nombre' }}</h1>
          <p class="truncate text-body-xs text-text-tertiary">Asunto: {{ f().asunto || '—' }}</p>
          <p class="mt-1.5 flex flex-wrap items-center gap-1.5">
            <gr-badge [tone]="est[c.estado].tone">{{ est[c.estado].l }}</gr-badge>
            @for (ch of f().canales; track ch) { <span class="inline-flex h-6 items-center gap-1 rounded-2xs border px-1.5 text-mono-xs" [class]="ch === 'email' ? 'border-info/40 text-info' : 'border-success/40 text-success'"><gr-icon [name]="ch === 'email' ? 'mail' : 'smartphone'" [size]="12" />{{ ch === 'email' ? 'Email' : 'WhatsApp' }}</span> }
            @if (aud(); as a) { <span class="text-body-xs text-text-tertiary">{{ n(destinos()) }} destinos · {{ a.segmento }}</span> }
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="flex items-center gap-1.5 text-label-s" [class]="dirty() ? 'text-warning' : 'text-success'"><gr-icon [name]="dirty() ? 'circle-alert' : 'circle-check'" [size]="14" />{{ dirty() ? 'Cambios sin guardar' : 'Todo guardado' }}</span>
          @if (editable()) { <button grButton [loading]="guardando()" [disabled]="!dirty()" (click)="guardar()">Guardar</button> }
          @if (c.estado === 'borrador' || c.estado === 'programada') { <button grButton variant="primary" icon="send" (click)="abrirEnvio()">Enviar</button> }
          @if (c.estado === 'borrador' || c.estado === 'cancelada') { <button grButton variant="ghost" icon="trash" (click)="borrar()" aria-label="Borrar campaña"></button> }
          @else { <button grButton variant="ghost" icon="copy" (click)="duplicar()" aria-label="Duplicar campaña"></button> }
        </div>
      </section>

      <nav class="mx-auto flex max-w-full gap-1 overflow-x-auto rounded-md border border-line-subtle bg-bg-card p-1 [scrollbar-width:none]" aria-label="Campaña">
        @for (t of tabs; track t.v) {
          <button type="button" class="flex h-9 shrink-0 items-center gap-1.5 rounded-sm px-3 text-label-s" [class]="tab() === t.v ? 'bg-accent-deep/50 text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="tab() === t.v ? 'page' : null" (click)="ir(t.v)"><gr-icon [name]="t.i" [size]="14" />{{ t.l }}</button>
        }
      </nav>
      @if (error()) { <gr-alert tone="danger" title="El diseño tiene un problema">{{ error() }}</gr-alert> }

      @switch (tab()) {
        <!-- ============ FLUJO ============ -->
        @case ('flujo') {
          <section class="relative rounded-lg border border-line-subtle bg-bg-card bg-[radial-gradient(circle,#2a2224_1px,transparent_1px)] [background-size:16px_16px] p-6">
            <p class="flex flex-wrap gap-3 text-mono-xs text-text-tertiary"><span class="flex items-center gap-1"><span class="size-2 rounded-pill bg-success"></span>listo</span><span class="flex items-center gap-1"><span class="size-2 rounded-pill bg-warning"></span>pendiente</span><span class="flex items-center gap-1"><span class="size-2 rounded-pill bg-line-strong"></span>desactivado</span></p>
            <div class="mx-auto mt-4 flex max-w-xl flex-col items-center">
              @for (nd of nodos(); track nd.t; let last = $last) {
                @if (nd.par) {
                  <div class="grid w-full grid-cols-2 gap-4">
                    @for (x of nd.par; track x.t) { <ng-container *ngTemplateOutlet="nodo; context: { $implicit: x }" /> }
                  </div>
                } @else { <ng-container *ngTemplateOutlet="nodo; context: { $implicit: nd }" /> }
                @if (!last) { <span class="h-6 w-px bg-line-strong"></span> }
              }
            </div>
          </section>
        }

        <!-- ============ DISEÑO ============ -->
        @case ('diseno') {
          <div class="flex flex-wrap items-center gap-2 rounded-md border border-line-subtle bg-bg-card p-1.5">
            @for (v of vistasDis; track v.v) { <button type="button" class="h-8 rounded-sm px-3 text-label-s" [class]="vistaDis() === v.v ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary'" (click)="vistaDis.set(v.v); refrescarPrevia()">{{ v.l }}</button> }
            <span class="mx-1 h-5 w-px bg-line-subtle"></span>
            @for (a of anchos; track a.v) { <button type="button" class="flex h-8 items-center gap-1 rounded-sm px-2.5 text-label-s" [class]="ancho() === a.v ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary'" (click)="ancho.set(a.v)"><gr-icon [name]="a.i" [size]="14" />{{ a.l }}</button> }
            <span class="flex-1"></span>
            <button type="button" class="flex size-8 items-center justify-center rounded-sm hover:bg-bg-raised disabled:opacity-30" [disabled]="!hist().length || !editable()" (click)="deshacer()" aria-label="Deshacer"><gr-icon name="undo" [size]="16" /></button>
            <button type="button" class="flex h-8 items-center gap-1.5 rounded-sm px-3 text-label-s" [class]="iaOpen() ? 'bg-[#4b2a7a] text-white' : 'text-text-secondary hover:bg-bg-raised'" (click)="iaOpen.set(!iaOpen())" [disabled]="!editable()"><gr-icon name="sparkles" [size]="14" />IA</button>
          </div>
          <div class="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_320px]">
            <!-- left: add / layers -->
            <aside class="h-fit rounded-lg border border-line-subtle bg-bg-card p-3 lg:sticky lg:top-20">
              <div class="flex gap-1">@for (p of paneles; track p.v) { <button type="button" class="h-8 flex-1 rounded-sm text-label-s" [class]="panel() === p.v ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary'" (click)="panel.set(p.v)">{{ p.l }}</button> }</div>
              @if (panel() === 'anadir') {
                <div class="mt-3 grid grid-cols-2 gap-2">
                  @for (t of tipos; track t.tipo) {
                    <button type="button" class="flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-md border border-line-subtle bg-bg-raised/40 text-label-s hover:border-line-strong disabled:opacity-40" [disabled]="!editable()" (click)="anadir(t.tipo)"><gr-icon [name]="$any(t.icon)" [size]="18" class="text-text-tertiary" />{{ t.l }}</button>
                  }
                </div>
              } @else {
                <ul class="mt-3 flex flex-col gap-1">
                  @for (b of f().diseno; track b.id; let i = $index) {
                    <li><button type="button" class="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-label-s" [class]="sel() === b.id ? 'bg-accent-deep/40 text-text-primary' : 'text-text-secondary hover:bg-bg-raised'" (click)="sel.set(b.id)">
                      <span class="truncate">{{ nombreTipo[b.tipo] }}</span><span class="flex-1 truncate text-body-xs text-text-muted">{{ resumen(b) }}</span>
                      @if (b.canal === 'email') { <span class="rounded-2xs bg-info/15 px-1 text-[10px] text-info">EMAIL</span> } @if (b.canal === 'whatsapp') { <span class="rounded-2xs bg-success/15 px-1 text-[10px] text-success">WA</span> }
                    </button></li>
                  } @empty { <li class="px-2 py-3 text-body-xs text-text-tertiary">Sin bloques.</li> }
                </ul>
              }
            </aside>

            <!-- canvas -->
            <section class="min-w-0 rounded-lg border border-line-subtle bg-[#ece7e7] p-4">
              <p class="mb-3 text-center text-mono-xs text-[#7a7072]">{{ ancho() === 'escritorio' ? 'ESCRITORIO · EMAIL 600 PX' : 'MÓVIL · 375 PX' }}</p>
              @switch (vistaDis()) {
                @case ('diseno') {
                  <div class="canvas mx-auto overflow-hidden rounded-xl bg-white text-[#3d3436] shadow-card" [style.max-width.px]="ancho() === 'escritorio' ? 600 : 375">
                    @for (b of f().diseno; track b.id; let i = $index) {
                      <div class="group relative cursor-pointer outline-offset-[-2px]" [class]="(sel() === b.id ? 'outline-2 outline-[#7c4dff] outline ' : 'hover:outline hover:outline-1 hover:outline-[#7c4dff]/50 ') + (b.canal === 'whatsapp' ? 'opacity-60 outline-dashed outline-1 outline-[#25d366]' : '')" (click)="sel.set(b.id)">
                        @if (sel() === b.id) { <span class="absolute top-0 left-0 z-10 rounded-br-sm bg-[#7c4dff] px-1.5 text-[10px] font-semibold text-white uppercase">{{ nombreTipo[b.tipo] }}</span> }
                        @if (b.canal !== 'ambos' && b.canal) { <span class="absolute top-1 right-1 z-10 rounded-2xs px-1.5 text-[10px] font-semibold" [class]="b.canal === 'email' ? 'bg-[#e1edfb] text-[#245aa8]' : 'bg-[#dcf8e6] text-[#137a3d]'">{{ b.canal === 'email' ? 'SOLO EMAIL' : 'SOLO WHATSAPP' }}</span> }
                        @switch (b.tipo) {
                          @case ('cabecera') { <div class="bg-[#141011] px-8 py-5 text-center"><img [src]="logo" alt="" class="inline-block h-10" /></div> }
                          @case ('portada') { <img [src]="b.imagen" [alt]="b.alt || ''" class="block w-full" /> }
                          @case ('titulo') { <h2 class="px-8 pt-6 pb-1 text-[24px] leading-[30px] font-bold text-[#141011]" [class.text-center]="b.alinear === 'centro'" [innerHTML]="html(b.texto)"></h2> }
                          @case ('texto') { <p class="px-8 pb-4 text-[15px] leading-6" [class.text-center]="b.alinear === 'centro'" [innerHTML]="html(b.texto)"></p> }
                          @case ('boton') { <div class="px-8 pb-4" [class.text-center]="b.alinear === 'centro'"><span class="inline-block rounded-md bg-[#c42b3e] px-6 py-3 text-[15px] font-semibold text-white">{{ b.texto }}</span></div> }
                          @case ('imagen') { <div class="px-8 pb-4"><img [src]="b.imagen" [alt]="b.alt || ''" class="block w-full rounded-lg" /></div> }
                          @case ('lista') { <ul class="list-disc px-8 pb-4 pl-12 text-[15px] leading-6">@for (it of b.items ?? []; track $index) { <li [innerHTML]="html(it)"></li> }</ul> }
                          @case ('dos_columnas') { <div class="grid grid-cols-2 gap-4 px-8 pb-4 text-[14px] leading-[21px]"><p [innerHTML]="html(b.texto)"></p><p [innerHTML]="html(b.texto2)"></p></div> }
                          @case ('cuenta_atras') {
                            <div class="px-8 pb-5 text-center">@if (b.texto) { <p class="mb-2 text-[13px] text-[#7a7072]">{{ b.texto }}</p> }
                              <div class="inline-flex gap-2">@for (x of cuenta(b.fecha); track x.l) { <span class="rounded-lg bg-[#141011] px-4 py-2 text-white"><b class="block text-[24px] leading-7">{{ x.v }}</b><span class="text-[10px] tracking-wider text-[#b8acae]">{{ x.l }}</span></span> }</div></div>
                          }
                          @case ('horario') {
                            <div class="px-8 pb-4"><p class="mb-1 text-[11px] tracking-wider text-[#9a8f91] uppercase">{{ diaLargo(b.fecha) }} · flights</p>
                              @for (x of ['A', 'B', 'C']; track x) { <p class="flex justify-between border-b border-[#eee6e7] py-2 text-[14px]"><span>Flight {{ x }} · categorías del día</span><span class="font-mono text-[#c42b3e]">--:--</span></p> }
                              <p class="mt-1 text-[11px] text-[#9a8f91]">Se rellena con los flights publicados de ese día.</p></div>
                          }
                          @case ('separador') { <div class="px-8 py-3"><div class="border-t border-[#eee6e7]"></div></div> }
                          @case ('espacio') { <div [style.height.px]="b.alto || 24"></div> }
                        }
                      </div>
                    } @empty { <p class="px-8 py-16 text-center text-[14px] text-[#9a8f91]">Añade bloques desde el panel de la izquierda.</p> }
                    <p class="border-t border-[#eee6e7] px-8 py-5 text-center text-[11px] leading-[18px] text-[#9a8f91]">{{ comps.current()?.nombre }} · Recibes este email porque aceptaste recibir novedades · <u>Darme de baja</u></p>
                  </div>
                }
                @case ('previa') {
                  @if (previa(); as p) { <iframe [srcdoc]="seguro(p.emailHtml)" title="Vista previa del email" class="mx-auto block h-[900px] w-full border-0 bg-white" [style.max-width.px]="ancho() === 'escritorio' ? 640 : 390" sandbox=""></iframe> }
                  @else { <gr-skeleton class="mx-auto h-[600px] max-w-[600px]" /> }
                }
                @case ('html') { <pre class="max-h-[900px] overflow-auto rounded-md bg-[#141011] p-4 text-[11px] leading-4 whitespace-pre-wrap text-[#d8cfd1]">{{ previa()?.emailHtml }}</pre> }
              }
            </section>

            <!-- right: properties or AI -->
            <aside class="h-fit rounded-lg border border-line-subtle bg-bg-card p-4 lg:sticky lg:top-20">
              @if (iaOpen()) {
                <header class="flex items-center gap-2"><gr-icon name="sparkles" [size]="16" class="text-[#b39ddb]" /><div class="flex-1"><h2 class="text-ui-h5">Asistente IA</h2><p class="text-body-xs text-text-tertiary">Edita el diseño en tiempo real</p></div>
                  <button type="button" class="flex size-8 items-center justify-center rounded-sm hover:bg-bg-raised" (click)="iaOpen.set(false)" aria-label="Cerrar"><gr-icon name="x" [size]="16" /></button></header>
                <div class="mt-3 flex max-h-[420px] min-h-40 flex-col gap-2 overflow-y-auto" aria-live="polite">
                  @for (m of msgs(); track $index) {
                    <p class="max-w-[90%] rounded-lg px-3 py-2 text-body-s" [class]="m.rol === 'usuario' ? 'self-end bg-[#4b2a7a] text-white' : 'self-start bg-bg-raised'">{{ m.texto }}</p>
                  } @empty { <p class="text-body-xs text-text-tertiary">Ejemplos: «Añade una cuenta atrás encima del botón», «Haz el texto más corto para WhatsApp», «Marca el horario como solo email».</p> }
                  @if (iaAplicada(); as x) {
                    <div class="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-body-xs"><gr-icon name="circle-check" [size]="14" class="text-success" /><span class="flex-1">Cambios aplicados · {{ x.modelo }} · {{ x.hora }}</span><button type="button" class="text-label-s hover:underline" (click)="deshacerIA()">Deshacer</button></div>
                  }
                  @if (iaCargando()) { <p class="flex items-center gap-2 text-body-xs text-text-tertiary"><gr-icon name="loader" [size]="14" class="animate-spin" />Diseñando · {{ iaSeg() }} s</p> }
                </div>
                <gr-field label="Modelo de IA" class="mt-3"><select grInput [(ngModel)]="modelo">@for (m of modelos(); track m.id) { <option [value]="m.id">{{ m.nombre }}</option> } @empty { <option value="">No disponible</option> }</select></gr-field>
                <form class="mt-3 flex gap-2" (ngSubmit)="pedirIA()">
                  <textarea grInput name="ia" rows="2" class="flex-1" [(ngModel)]="iaTexto" placeholder="Describe el cambio que quieres…" (keydown.enter)="$event.preventDefault(); pedirIA()"></textarea>
                  <button type="submit" grButton variant="primary" icon="send" [disabled]="iaCargando() || iaTexto.trim().length < 3 || !modelos().length" aria-label="Enviar a la IA"></button>
                </form>
                <p class="mt-2 text-body-xs text-text-muted">La IA solo ve el diseño y tu petición, nunca contactos ni datos personales.</p>
              } @else if (bloque(); as b) {
                <header class="flex items-center gap-1">
                  <div class="flex-1"><p class="text-mono-xs text-text-tertiary">{{ nombreTipo[b.tipo] }}</p></div>
                  <button type="button" class="flex size-8 items-center justify-center rounded-sm hover:bg-bg-raised" (click)="mover(b.id, -1)" aria-label="Subir"><gr-icon name="arrow-up" [size]="14" /></button>
                  <button type="button" class="flex size-8 items-center justify-center rounded-sm hover:bg-bg-raised" (click)="mover(b.id, 1)" aria-label="Bajar"><gr-icon name="arrow-down" [size]="14" /></button>
                  <button type="button" class="flex size-8 items-center justify-center rounded-sm hover:bg-bg-raised" (click)="duplicarBloque(b.id)" aria-label="Duplicar"><gr-icon name="copy" [size]="14" /></button>
                  <button type="button" class="flex size-8 items-center justify-center rounded-sm text-accent-text hover:bg-bg-raised" (click)="quitar(b.id)" aria-label="Borrar bloque"><gr-icon name="trash" [size]="14" /></button>
                </header>
                <div class="mt-3 flex flex-col gap-3">
                  @switch (b.tipo) {
                    @case ('titulo') { <gr-field label="Texto"><textarea grInput rows="2" [ngModel]="b.texto" (ngModelChange)="editar(b.id, { texto: $event })"></textarea></gr-field> }
                    @case ('texto') { <gr-field label="Texto" hint="**negrita** · {{ '{{nombre}}' }} para el nombre"><textarea grInput rows="6" [ngModel]="b.texto" (ngModelChange)="editar(b.id, { texto: $event })"></textarea></gr-field> }
                    @case ('boton') {
                      <gr-field label="Texto"><input grInput [ngModel]="b.texto" (ngModelChange)="editar(b.id, { texto: $event })" /></gr-field>
                      <gr-field label="Enlace (URL)"><input grInput [ngModel]="b.url" (ngModelChange)="editar(b.id, { url: $event })" /></gr-field>
                      <div class="flex flex-wrap gap-1">@for (e of enlaces; track e) { <button type="button" class="rounded-2xs border border-line-strong px-1.5 py-0.5 font-mono text-[11px] text-text-tertiary hover:text-text-primary" (click)="editar(b.id, { url: e })">{{ e }}</button> }</div>
                    }
                    @case ('portada') { <ng-container *ngTemplateOutlet="imgCampos; context: { $implicit: b }" /> }
                    @case ('imagen') { <ng-container *ngTemplateOutlet="imgCampos; context: { $implicit: b }" /><gr-field label="Enlace al pulsar (opcional)"><input grInput [ngModel]="b.url" (ngModelChange)="editar(b.id, { url: $event })" /></gr-field> }
                    @case ('lista') { <gr-field label="Elementos" hint="Uno por línea"><textarea grInput rows="5" [ngModel]="(b.items ?? []).join('\\n')" (ngModelChange)="editar(b.id, { items: lineas($event) })"></textarea></gr-field> }
                    @case ('dos_columnas') {
                      <gr-field label="Izquierda"><textarea grInput rows="3" [ngModel]="b.texto" (ngModelChange)="editar(b.id, { texto: $event })"></textarea></gr-field>
                      <gr-field label="Derecha"><textarea grInput rows="3" [ngModel]="b.texto2" (ngModelChange)="editar(b.id, { texto2: $event })"></textarea></gr-field>
                    }
                    @case ('cuenta_atras') {
                      <gr-field label="Hasta (hora de Madrid)"><input grInput type="datetime-local" [ngModel]="b.fecha" (ngModelChange)="editar(b.id, { fecha: $event })" /></gr-field>
                      <gr-field label="Texto encima"><input grInput [ngModel]="b.texto" (ngModelChange)="editar(b.id, { texto: $event })" /></gr-field>
                    }
                    @case ('horario') { <gr-field label="Día"><select grInput [ngModel]="b.fecha" (ngModelChange)="editar(b.id, { fecha: $event })">@for (d of dias(); track d) { <option [value]="d">{{ diaLargo(d) }}</option> }</select></gr-field> }
                    @case ('espacio') { <gr-field label="Alto"><select grInput [ngModel]="b.alto" (ngModelChange)="editar(b.id, { alto: +$event })">@for (h of [8, 16, 24, 32, 48, 64]; track h) { <option [value]="h">{{ h }} px</option> }</select></gr-field> }
                    @default { <p class="text-body-s text-text-tertiary">Este bloque no tiene opciones.</p> }
                  }
                  @if (b.tipo === 'titulo' || b.tipo === 'texto' || b.tipo === 'boton') {
                    <div><p class="mb-1.5 text-label-s">Alineación</p><div class="flex gap-1">@for (a of alineaciones; track a.v) { <button type="button" class="h-8 flex-1 rounded-sm border text-label-s" [class]="(b.alinear ?? 'izquierda') === a.v ? 'border-accent bg-accent-deep/40' : 'border-line-strong text-text-tertiary'" (click)="editar(b.id, { alinear: a.v })">{{ a.l }}</button> }</div></div>
                  }
                  <div><p class="mb-1.5 text-label-s">Visibilidad y canal</p><div class="flex gap-1">@for (x of canalesB; track x.v) { <button type="button" class="h-8 flex-1 rounded-sm border text-label-s" [class]="(b.canal ?? 'ambos') === x.v ? 'border-accent bg-accent-deep/40' : 'border-line-strong text-text-tertiary'" (click)="editar(b.id, { canal: x.v })">{{ x.l }}</button> }</div></div>
                </div>
              } @else { <p class="text-body-s text-text-tertiary">Selecciona un bloque en el lienzo o en «Capas» para editarlo.</p> }
            </aside>
          </div>
        }

        <!-- ============ PREVISUALIZACIÓN ============ -->
        @case ('previa') {
          <section class="rounded-lg border border-line-subtle bg-bg-card p-4 md:p-6">
            <div class="flex flex-wrap items-center gap-3"><div class="flex-1"><h2 class="text-ui-h5">Previsualización</h2><p class="text-body-xs text-text-tertiary">El email y el WhatsApp tal y como los recibe el contacto (nombre de ejemplo: Laura)</p></div>
              @for (a of anchos; track a.v) { <button type="button" class="flex h-8 items-center gap-1 rounded-sm px-2.5 text-label-s" [class]="ancho() === a.v ? 'bg-bg-raised' : 'text-text-tertiary'" (click)="ancho.set(a.v)"><gr-icon [name]="a.i" [size]="14" />{{ a.l }}</button> }</div>
            @if (previa(); as p) {
              <div class="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                @if (f().canales.includes('email')) {
                  <div><p class="mb-2 text-center text-label-s">Email</p>
                    <div class="mx-auto overflow-hidden rounded-lg border border-line-strong" [style.max-width.px]="ancho() === 'escritorio' ? 640 : 390">
                      <p class="truncate bg-bg-raised px-3 py-2 font-mono text-mono-xs text-text-tertiary">● ● ●  {{ f().asunto }}</p>
                      <iframe [srcdoc]="seguro(p.emailHtml)" title="Email" class="block h-[760px] w-full border-0 bg-white" sandbox=""></iframe>
                    </div></div>
                }
                @if (f().canales.includes('whatsapp')) {
                  <div><p class="mb-2 text-center text-label-s">WhatsApp</p>
                    <div class="mx-auto w-[320px] rounded-[36px] border-[6px] border-[#1d1a1b] bg-[#0b141a] p-2 shadow-card">
                      <div class="flex items-center gap-2 rounded-t-[28px] bg-[#1f2c34] px-3 py-3"><span class="flex size-8 items-center justify-center rounded-pill bg-white"><img [src]="logo" alt="" class="h-4" /></span><div class="flex-1"><p class="text-[13px] font-semibold text-white">{{ comps.current()?.nombreCorto }}</p><p class="text-[11px] text-[#8696a0]">en línea</p></div></div>
                      <div class="h-[540px] overflow-y-auto bg-[#0b141a] bg-[radial-gradient(circle,#13222b_1px,transparent_1px)] [background-size:14px_14px] p-3">
                        <div class="max-w-[260px] rounded-lg rounded-tl-none bg-[#202c33] p-1.5 text-[13px] leading-[19px] text-[#e9edef]">
                          @if (p.whatsapp.imagen) { <img [src]="p.whatsapp.imagen" alt="" class="mb-1.5 w-full rounded-md" /> }
                          <p class="px-1.5" [innerHTML]="wa(p.whatsapp.texto)"></p>
                          <p class="px-1.5 text-right text-[10px] text-[#8696a0]">18:42 ✓✓</p>
                        </div>
                      </div>
                    </div>
                    <p class="mt-2 text-center text-body-xs text-text-tertiary">{{ p.whatsapp.texto.length }} caracteres · los botones se envían como enlaces</p></div>
                }
              </div>
            } @else { <gr-skeleton class="mt-5 h-[600px] rounded-lg" /> }
          </section>
        }

        <!-- ============ AJUSTES / ENVÍO ============ -->
        @case ('ajustes') {
          @if (c.estado === 'enviando' || c.estado === 'pausada' || c.estado === 'enviada' || c.estado === 'cancelada') {
            <div class="grid gap-3 md:grid-cols-2">
              @for (ch of f().canales; track ch) {
                @if (c.progreso[$any(ch) === 'email' ? 'email' : 'whatsapp']; as p) {
                  <section class="rounded-lg border border-line-subtle bg-bg-card p-4">
                    <p class="flex items-center justify-between"><span class="flex items-center gap-2 text-label-m"><gr-icon [name]="ch === 'email' ? 'mail' : 'smartphone'" [size]="16" />{{ ch === 'email' ? 'Email' : 'WhatsApp' }}</span><span class="font-mono text-mono-s">{{ n(p.enviados + p.fallidos) }} / {{ n(p.total) }}</span></p>
                    <div class="mt-2 h-2 overflow-hidden rounded-pill bg-bg-raised"><div class="h-full rounded-pill bg-accent" [style.width.%]="(p.enviados + p.fallidos) * 100 / (p.total || 1)"></div></div>
                    <p class="mt-2 text-body-xs text-text-tertiary">{{ p.pendientes ? 'Quedan ' + n(p.pendientes) + ' · ' + (ch === 'email' ? f().emailPorMin : f().waPorMin) + '/min' : 'Terminado' }} @if (ch === 'whatsapp') { · {{ n(p.entregados) }} entregados · {{ n(p.leidos) }} leídos } · {{ n(p.fallidos) }} fallidos</p>
                  </section>
                }
              }
            </div>
            <div class="flex flex-wrap gap-2">
              @if (c.estado === 'enviando') { <button grButton icon="pause" (click)="accion('pausar')">Pausar</button> }
              @if (c.estado === 'pausada') { <button grButton variant="primary" icon="play" (click)="accion('reanudar')">Reanudar</button> }
              @if (c.estado === 'enviando' || c.estado === 'pausada') { <button grButton variant="danger" (click)="cancelar()">Cancelar envío</button> }
              <span class="flex-1"></span>
              <select class="h-10 rounded-md border border-line-strong bg-bg-field px-3 text-label-s" aria-label="Canal" [ngModel]="fd().canal" (ngModelChange)="filtrarDest({ canal: $event })"><option value="">Todos los canales</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></select>
              <select class="h-10 rounded-md border border-line-strong bg-bg-field px-3 text-label-s" aria-label="Estado" [ngModel]="fd().estado" (ngModelChange)="filtrarDest({ estado: $event })"><option value="">Todos los estados</option>@for (e of estadosDest; track e.v) { <option [value]="e.v">{{ e.l }}</option> }</select>
            </div>
            @if (dest(); as d) {
              <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
                <table class="w-full min-w-[720px] text-left text-body-s">
                  <thead class="border-b border-line-subtle text-mono-xs text-text-tertiary"><tr><th class="px-4 py-3">Destino</th><th class="px-3 py-3">Canal</th><th class="px-3 py-3">Estado</th><th class="px-3 py-3">Enviado</th><th class="px-4 py-3">Detalle</th></tr></thead>
                  <tbody>
                    @for (x of d.items; track $index) {
                      <tr class="border-b border-line-subtle last:border-0"><td class="px-4 py-2.5 font-mono text-mono-xs">{{ x.destino }}</td>
                        <td class="px-3 py-2.5"><gr-badge [tone]="x.canal === 'email' ? 'info' : 'success'">{{ x.canal === 'email' ? 'Email' : 'WhatsApp' }}</gr-badge></td>
                        <td class="px-3 py-2.5"><gr-badge [tone]="estDest[x.estado]?.tone ?? 'neutral'">{{ estDest[x.estado]?.l ?? x.estado }}</gr-badge></td>
                        <td class="px-3 py-2.5 font-mono text-mono-xs text-text-tertiary">{{ hora(x.enviadoAt) }}</td><td class="px-4 py-2.5 text-body-xs text-text-tertiary">{{ x.detalle }}</td></tr>
                    } @empty { <tr><td colspan="5" class="px-4 py-8 text-center text-text-tertiary">Nada con estos filtros.</td></tr> }
                  </tbody>
                </table>
                <p class="flex items-center justify-between px-4 py-3 text-body-xs text-text-tertiary"><span>{{ n(d.total) }} destinos · se actualiza en vivo</span>
                  <span class="flex gap-1"><button grButton size="s" variant="ghost" icon="chevron-left" [disabled]="d.pagina <= 1" (click)="filtrarDest({ pagina: d.pagina - 1 })" aria-label="Anterior"></button><button grButton size="s" variant="ghost" icon="chevron-right" [disabled]="d.pagina * d.por >= d.total" (click)="filtrarDest({ pagina: d.pagina + 1 })" aria-label="Siguiente"></button></span></p>
              </section>
            }
          } @else {
            <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <h2 class="text-ui-h5">Datos de la campaña</h2><p class="text-body-xs text-text-tertiary">Cómo se guarda y el asunto que lee el cliente</p>
              <div class="mt-4 grid gap-4 md:grid-cols-2">
                <gr-field label="Nombre interno" hint="Solo para el equipo"><input grInput [ngModel]="f().nombre" (ngModelChange)="set({ nombre: $event })" maxlength="160" /></gr-field>
                <gr-field label="Asunto del email" [hint]="f().asunto.length + ' / 60'"><input grInput [ngModel]="f().asunto" (ngModelChange)="set({ asunto: $event })" maxlength="160" /></gr-field>
                <gr-field label="Texto de vista previa (preheader)" class="md:col-span-2"><input grInput [ngModel]="f().preheader" (ngModelChange)="set({ preheader: $event })" maxlength="200" /></gr-field>
              </div>
              <p class="mt-4 mb-2 text-label-s">Canales</p>
              <div class="flex gap-2">@for (ch of ['email', 'whatsapp']; track ch) {
                <label class="flex h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-label-s" [class]="f().canales.includes($any(ch)) ? 'border-accent bg-accent-deep/30' : 'border-line-strong'"><input type="checkbox" class="size-4 accent-[#c42b3e]" [checked]="f().canales.includes($any(ch))" (change)="toggleCanal($any(ch))" />{{ ch === 'email' ? 'Email' : 'WhatsApp' }}</label>
              }</div>
            </section>
            <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <div class="flex items-start justify-between gap-3"><div><h2 class="text-ui-h5">Destinatarios</h2><p class="text-body-xs text-text-tertiary">El consentimiento de cada canal y las bajas se aplican siempre</p></div><button grButton size="s" (click)="calcular()">Calcular</button></div>
              <gr-field label="Segmento" class="mt-4 md:w-1/2"><select grInput [ngModel]="f().segmentoId ?? ''" (ngModelChange)="set({ segmentoId: $event || undefined })"><option value="">Todos con consentimiento</option>@for (s of segs(); track s.id) { <option [value]="s.id">{{ s.nombre }} ({{ n(s.recuento.total) }})</option> }</select></gr-field>
              @if (aud(); as a) { <p class="mt-3 text-body-s">{{ n(destinos()) }} destinos · {{ n(a.email) }} por email / {{ n(a.whatsapp) }} por WhatsApp · {{ n(a.excluidos) }} excluidos (sin consentimiento del canal o con baja)</p> }
            </section>
            <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <h2 class="text-ui-h5">Ritmo de envío</h2><p class="text-body-xs text-text-tertiary">Mensajes por minuto y canal</p>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                @for (r of ritmos; track r.k) {
                  <div class="rounded-md bg-bg-raised p-4"><p class="text-label-s">{{ r.l }}</p>
                    <div class="mt-2 flex items-center gap-3"><button type="button" class="flex size-9 items-center justify-center rounded-pill border border-line-strong" (click)="ritmo(r.k, -r.paso, r.max)" aria-label="Menos"><gr-icon name="minus" [size]="14" /></button>
                      <span class="w-14 text-center font-mono text-ui-h4">{{ f()[r.k] }}</span>
                      <button type="button" class="flex size-9 items-center justify-center rounded-pill border border-line-strong" (click)="ritmo(r.k, r.paso, r.max)" aria-label="Más"><gr-icon name="plus" [size]="14" /></button></div>
                    <p class="mt-2 text-body-xs text-text-tertiary">{{ r.k === 'emailPorMin' ? '≈ ' + mins(aud()?.email, f().emailPorMin) + ' para ' + n(aud()?.email) + ' envíos' : '≈ ' + mins(aud()?.whatsapp, f().waPorMin) + ' · número propio: mejor ≤ 6/min' }}</p></div>
                }
              </div>
            </section>
            @if (f().canales.includes('whatsapp')) {
              <section class="flex flex-wrap items-center gap-3 rounded-lg border border-line-subtle bg-bg-card p-5">
                <div class="flex-1"><h2 class="text-ui-h5">WhatsApp</h2><p class="text-body-xs text-text-tertiary">El texto se deriva del diseño (sin los bloques «Solo email») y termina con «Responde BAJA…»</p></div>
                @if (aud()?.whatsappEstado; as w) { <gr-badge [tone]="w.conexion === 'open' ? 'success' : w.modo === 'simulado' ? 'info' : 'warning'">{{ w.modo === 'simulado' ? 'Simulado' : w.conexion === 'open' ? 'Conectado · ' + w.numero : 'Sin conectar' }}</gr-badge> }
                <a grButton size="s" [routerLink]="['/', comps.current()?.slug, 'campanas', 'whatsapp']">Gestionar</a>
              </section>
            }
            <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <h2 class="text-ui-h5">Envío</h2><p class="text-body-xs text-text-tertiary">Prueba la campaña guardada antes de enviarla</p>
              <form class="mt-4 flex flex-wrap items-end gap-2" (ngSubmit)="probar()">
                <gr-field label="Email o teléfono de prueba" class="min-w-0 flex-1"><input grInput name="dest" [(ngModel)]="pruebaDestino" placeholder="tu@email.com o +34 600 000 000" /></gr-field>
                <button type="submit" grButton [loading]="probando()" [disabled]="pruebaDestino.trim().length < 5">Probar</button>
              </form>
              @if (c.estado === 'programada') { <p class="mt-3 text-body-s text-info">Programada para el {{ fecha(c.programadaAt) }} · <button type="button" class="underline" (click)="accion('desprogramar')">quitar programación</button></p> }
            </section>
          }
        }
      }
    </div>

    <!-- send dialog -->
    @if (envio(); as e) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4" (click)="envio.set(null)" (keydown.escape)="envio.set(null)">
        <div class="w-full max-w-md rounded-lg border border-line-strong bg-bg-raised p-6 shadow-card" role="dialog" aria-modal="true" aria-label="Enviar campaña" (click)="$event.stopPropagation()">
          <h2 class="text-ui-h5">{{ e.soloEmail ? 'Enviar solo por email' : 'Enviar «' + f().nombre + '»' }}</h2>
          <p class="mt-3 text-body-s text-text-secondary">
            @if (e.soloEmail) { WhatsApp no está disponible: se enviará ahora a los {{ n(aud()?.email) }} contactos con email. }
            @else { Se enviará a {{ n(destinos()) }} destinos ({{ n(aud()?.email) }} por email{{ f().canales.includes('whatsapp') ? ' · ' + n(aud()?.whatsapp) + ' por WhatsApp' : '' }}). Cada mensaje lleva su enlace de baja. }
          </p>
          <label class="mt-4 flex items-center gap-2 text-body-s"><input type="checkbox" class="size-4 accent-[#c42b3e]" [(ngModel)]="programar" />Programar el envío</label>
          @if (programar) { <gr-field label="Fecha y hora (Madrid)" class="mt-2"><input grInput type="datetime-local" [(ngModel)]="programadaAt" /></gr-field> }
          <div class="mt-6 flex justify-end gap-2">
            <button grButton variant="ghost" (click)="envio.set(null)">Cancelar</button>
            <button grButton variant="primary" [loading]="enviando()" (click)="enviar(e.soloEmail)">{{ programar ? 'Programar' : e.soloEmail ? 'Enviar email ahora' : 'Enviar ahora' }}</button>
          </div>
        </div>
      </div>
    }
    }

    <ng-template #nodo let-x>
      <button type="button" class="w-full max-w-xs rounded-md border bg-bg-card p-3 text-left hover:bg-bg-raised" [class]="x.estado === 'ok' ? 'border-success/60' : x.estado === 'pendiente' ? 'border-warning/60' : 'border-line-subtle opacity-60'" (click)="ir(x.tab)">
        <p class="flex items-center gap-2 text-label-s"><gr-icon [name]="x.i" [size]="14" />{{ x.t }}</p>
        <p class="mt-1 truncate text-body-xs text-text-tertiary">{{ x.d }}</p>
        <p class="mt-1 font-mono text-[10px] text-text-muted uppercase">{{ x.m }}</p>
      </button>
    </ng-template>
    <ng-template #imgCampos let-b>
      <gr-field label="Imagen (URL)"><input grInput [ngModel]="b.imagen" (ngModelChange)="editar(b.id, { imagen: $event })" /></gr-field>
      <label class="flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-label-s hover:bg-bg-raised"><gr-icon name="camera" [size]="14" />{{ subiendo() ? 'Subiendo…' : 'Subir imagen' }}<input type="file" accept="image/*" class="sr-only" (change)="subir(b.id, $event)" /></label>
      <gr-field label="Texto alternativo"><input grInput [ngModel]="b.alt" (ngModelChange)="editar(b.id, { alt: $event })" /></gr-field>
    </ng-template>
  `,
})
export class CampanaEditorPage {
  private readonly api = inject(CampanasApi);
  protected readonly comps = inject(Competitions);
  private readonly toasts = inject(GrToasts);
  private readonly confirm = inject(Confirm);
  private readonly media = inject(Media);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly san = inject(DomSanitizer);
  protected readonly est = ESTADO;
  protected readonly estDest = ESTADO_DEST;
  protected readonly estadosDest = Object.entries(ESTADO_DEST).map(([v, x]) => ({ v, l: x.l }));
  protected readonly tipos = TIPOS;
  protected readonly nombreTipo = NOMBRE_TIPO;
  protected readonly enlaces = ENLACES;
  protected readonly logo = LOGO;
  protected readonly n = n;
  protected readonly fecha = fecha;
  protected readonly hora = hora;
  protected readonly tabs: { v: Tab; l: string; i: GrIconName }[] = [{ v: 'flujo', l: 'Flujo', i: 'activity' }, { v: 'diseno', l: 'Diseño', i: 'pencil' }, { v: 'previa', l: 'Previsualización', i: 'eye' }, { v: 'ajustes', l: 'Ajustes', i: 'settings' }];
  protected readonly vistasDis = [{ v: 'diseno' as const, l: 'Diseño' }, { v: 'previa' as const, l: 'Vista previa' }, { v: 'html' as const, l: 'HTML' }];
  protected readonly anchos: { v: 'escritorio' | 'movil'; l: string; i: GrIconName }[] = [{ v: 'escritorio', l: 'Escritorio', i: 'monitor' }, { v: 'movil', l: 'Móvil', i: 'smartphone' }];
  protected readonly paneles = [{ v: 'anadir' as const, l: '+ Añadir' }, { v: 'capas' as const, l: 'Capas' }];
  protected readonly alineaciones = [{ v: 'izquierda' as const, l: 'Izquierda' }, { v: 'centro' as const, l: 'Centro' }];
  protected readonly canalesB: { v: CanalBloque; l: string }[] = [{ v: 'ambos', l: 'Ambos' }, { v: 'email', l: 'Solo email' }, { v: 'whatsapp', l: 'Solo WA' }];
  protected readonly ritmos: { k: 'emailPorMin' | 'waPorMin'; l: string; paso: number; max: number }[] = [{ k: 'emailPorMin', l: 'Emails por minuto (máx 600)', paso: 10, max: 600 }, { k: 'waPorMin', l: 'WhatsApp por minuto (máx 60)', paso: 1, max: 60 }];

  protected readonly camp = signal<Campana | null | undefined>(undefined);
  protected readonly f = signal<CampanaIn>({ nombre: '', asunto: '', preheader: '', canales: ['email'], diseno: [], emailPorMin: 120, waPorMin: 6 });
  private readonly base = signal('');
  protected readonly tab = signal<Tab>((this.route.snapshot.queryParamMap.get('tab') as Tab) || 'flujo');
  protected readonly sel = signal('');
  protected readonly vistaDis = signal<'diseno' | 'previa' | 'html'>('diseno');
  protected readonly ancho = signal<'escritorio' | 'movil'>('escritorio');
  protected readonly panel = signal<'anadir' | 'capas'>('anadir');
  protected readonly hist = signal<Bloque[][]>([]);
  protected readonly previa = signal<Previa | null>(null);
  protected readonly error = signal('');
  protected readonly aud = signal<Audiencia | null>(null);
  protected readonly segs = signal<Segmento[]>([]);
  protected readonly dest = signal<Destinatarios | null>(null);
  protected readonly fd = signal<{ canal: string; estado: string; pagina: number }>({ canal: '', estado: '', pagina: 1 });
  protected readonly guardando = signal(false);
  protected readonly enviando = signal(false);
  protected readonly probando = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly envio = signal<{ soloEmail: boolean } | null>(null);
  protected programar = false;
  protected programadaAt = '';
  protected pruebaDestino = '';
  // AI
  protected readonly iaOpen = signal(false);
  protected readonly msgs = signal<MensajeIA[]>([]);
  protected readonly modelos = signal<Modelo[]>([]);
  protected modelo = '';
  protected iaTexto = '';
  protected readonly iaCargando = signal(false);
  protected readonly iaSeg = signal(0);
  protected readonly iaAplicada = signal<{ modelo: string; hora: string; antes: Bloque[]; nota: string } | null>(null);
  private iaMeta: { modelo: string; nota: string } | null = null;

  private readonly cid = computed(() => this.comps.current()?.id ?? '');
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  protected readonly dirty = computed(() => this.base() !== '' && JSON.stringify(this.f()) !== this.base());
  protected readonly editable = computed(() => ['borrador', 'programada', 'pausada'].includes(this.camp()?.estado ?? ''));
  protected readonly bloque = computed(() => this.f().diseno.find((b) => b.id === this.sel()));
  protected readonly destinos = computed(() => {
    const a = this.aud();
    if (!a) return 0;
    return (this.f().canales.includes('email') ? a.email : 0) + (this.f().canales.includes('whatsapp') ? a.whatsapp : 0);
  });
  protected readonly dias = computed(() => {
    const c = this.comps.current() as unknown as { fechaInicio?: string; fechaFin?: string } | null;
    const out: string[] = [];
    if (c?.fechaInicio) {
      const d = new Date(c.fechaInicio + 'T12:00:00Z');
      const fin = new Date((c.fechaFin || c.fechaInicio) + 'T12:00:00Z');
      while (d <= fin && out.length < 7) {
        out.push(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }
    return out.length ? out : ['2026-12-19'];
  });
  protected readonly nodos = computed(() => {
    const f = this.f();
    const a = this.aud();
    const c = this.camp();
    const em = f.canales.includes('email');
    const wa = f.canales.includes('whatsapp');
    const soloE = f.diseno.filter((b) => b.canal === 'email').length;
    const soloW = f.diseno.filter((b) => b.canal === 'whatsapp').length;
    type N = { t: string; d: string; m: string; i: GrIconName; tab: Tab; estado: 'ok' | 'pendiente' | 'off'; par?: N[] };
    const out: N[] = [
      { t: 'Campaña', d: f.nombre, m: f.asunto ? 'asunto listo' : 'falta el asunto', i: 'send', tab: 'ajustes', estado: f.asunto ? 'ok' : 'pendiente' },
      { t: 'Audiencia', d: a ? a.segmento : 'Sin calcular', m: a ? `${n(a.total)} · ${n(a.email)} email / ${n(a.whatsapp)} WA` : 'pulsa calcular', i: 'users', tab: 'ajustes', estado: a && this.destinos() ? 'ok' : 'pendiente' },
      { t: 'Mensaje', d: f.asunto || 'Sin asunto', m: wa ? 'texto WhatsApp derivado del diseño' : 'solo email', i: 'mail', tab: 'previa', estado: f.diseno.length ? 'ok' : 'pendiente' },
      { t: 'Diseño del email', d: `${f.diseno.length} bloques`, m: `${soloE} solo email · ${soloW} solo WA`, i: 'pencil', tab: 'diseno', estado: f.diseno.length ? 'ok' : 'pendiente' },
    ];
    out.push({ t: 'Canales', d: '', m: '', i: 'send', tab: 'ajustes', estado: 'ok', par: [
      { t: 'Canal Email', d: `${f.emailPorMin}/min`, m: em ? `≈ ${this.mins(a?.email, f.emailPorMin)}` : 'desactivado', i: 'mail', tab: 'ajustes', estado: em ? 'ok' : 'off' },
      { t: 'Canal WhatsApp', d: `${f.waPorMin}/min`, m: wa ? (a?.whatsappEstado.modo === 'simulado' ? 'simulado (sin número)' : a?.whatsappEstado.conexion === 'open' ? 'conectado' : 'sin conectar') : 'desactivado', i: 'smartphone', tab: 'ajustes', estado: !wa ? 'off' : a?.whatsappEstado.conexion === 'open' || a?.whatsappEstado.modo === 'simulado' ? 'ok' : 'pendiente' },
    ] });
    out.push({ t: 'Envío', d: c ? ESTADO[c.estado].l : '', m: c?.estado === 'borrador' ? 'guarda y envía o programa' : c?.estado === 'programada' ? fecha(c.programadaAt) : '', i: 'send', tab: 'ajustes', estado: c?.estado === 'enviada' ? 'ok' : 'pendiente' });
    return out;
  });

  private tp: ReturnType<typeof setTimeout> | undefined;
  private tr: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      if (!this.cid()) return;
      untracked(() => void this.cargar());
    });
    // live preview (debounced) while editing or on the preview tab
    effect(() => {
      const f = this.f();
      const t = this.tab();
      const v = this.vistaDis();
      if (!this.camp() || !(t === 'previa' || (t === 'diseno' && v !== 'diseno'))) return;
      clearTimeout(this.tp);
      this.tp = setTimeout(() => void untracked(() => this.refrescarPrevia(f)), 400);
    });
    const sub = inject(Realtime).events.subscribe((e) => {
      if (e.tipo.startsWith('campana.') && e.entidad === 'campana:' + this.id) {
        clearTimeout(this.tr);
        this.tr = setTimeout(() => void this.recargarEstado(), 600);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.tp);
      clearTimeout(this.tr);
      sub.unsubscribe();
    });
  }

  private async cargar(): Promise<void> {
    try {
      const c = await this.api.get(this.cid(), this.id);
      this.aplicar(c);
      void this.api.segmentos(this.cid()).then((s) => this.segs.set(s)).catch(() => undefined);
      void this.api.modelos(this.cid()).then((m) => { this.modelos.set(m); this.modelo = m[0]?.id ?? ''; }).catch(() => undefined);
      void this.calcular();
      if (['enviando', 'pausada', 'enviada', 'cancelada'].includes(c.estado)) void this.cargarDest();
    } catch {
      this.camp.set(null);
    }
  }

  private aplicar(c: Campana): void {
    this.camp.set(c);
    const f: CampanaIn = { nombre: c.nombre, asunto: c.asunto, preheader: c.preheader, canales: c.canales, diseno: c.diseno, segmentoId: c.segmentoId, emailPorMin: c.emailPorMin, waPorMin: c.waPorMin };
    this.f.set(f);
    this.base.set(JSON.stringify(f));
    if (!this.sel() && c.diseno.length) this.sel.set(c.diseno[Math.min(2, c.diseno.length - 1)].id);
  }

  private async recargarEstado(): Promise<void> {
    const c = await this.api.get(this.cid(), this.id).catch(() => null);
    if (!c) return;
    if (this.dirty()) this.camp.set(c);
    else this.aplicar(c);
    if (['enviando', 'pausada', 'enviada', 'cancelada'].includes(c.estado)) void this.cargarDest();
  }

  protected ir(t: Tab): void {
    this.tab.set(t);
    void this.router.navigate([], { queryParams: { tab: t }, replaceUrl: true });
  }

  protected set(p: Partial<CampanaIn>): void { this.f.update((f) => ({ ...f, ...p })); }
  private snapshot(): void { this.hist.update((h) => [...h.slice(-29), this.f().diseno]); }
  protected editar(id: string, p: Partial<Bloque>): void {
    if (!this.editable()) return;
    this.snapshot();
    this.f.update((f) => ({ ...f, diseno: f.diseno.map((b) => (b.id === id ? { ...b, ...p } : b)) }));
  }
  private nuevoId(): string {
    let i = this.f().diseno.length + 1;
    while (this.f().diseno.some((b) => b.id === 'b' + i)) i++;
    return 'b' + i;
  }
  protected anadir(tipo: TipoBloque): void {
    this.snapshot();
    const b = nuevo(tipo, this.nuevoId());
    const d = [...this.f().diseno];
    const i = d.findIndex((x) => x.id === this.sel());
    d.splice(i >= 0 ? i + 1 : d.length, 0, b);
    this.set({ diseno: d });
    this.sel.set(b.id);
  }
  protected mover(id: string, dir: number): void {
    const d = [...this.f().diseno];
    const i = d.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.length) return;
    this.snapshot();
    [d[i], d[j]] = [d[j], d[i]];
    this.set({ diseno: d });
  }
  protected duplicarBloque(id: string): void {
    const d = [...this.f().diseno];
    const i = d.findIndex((x) => x.id === id);
    if (i < 0) return;
    this.snapshot();
    const b = { ...d[i], id: this.nuevoId() };
    d.splice(i + 1, 0, b);
    this.set({ diseno: d });
    this.sel.set(b.id);
  }
  protected quitar(id: string): void {
    this.snapshot();
    this.set({ diseno: this.f().diseno.filter((b) => b.id !== id) });
    this.sel.set('');
  }
  protected deshacer(): void {
    const h = this.hist();
    if (!h.length) return;
    this.set({ diseno: h[h.length - 1] });
    this.hist.set(h.slice(0, -1));
  }
  protected lineas(v: string): string[] { return v.split('\n').map((x) => x.trimEnd()).filter((x, i, a) => x || i < a.length - 1).slice(0, 12); }
  protected resumen(b: Bloque): string { return (b.texto ?? b.alt ?? b.fecha ?? '').replace(/\*\*/g, '').slice(0, 40); }
  protected html(s?: string): SafeHtml { return this.san.bypassSecurityTrustHtml(md(s ?? '')); }
  protected seguro(h: string): SafeHtml { return this.san.bypassSecurityTrustHtml(h); }
  protected wa(t: string): SafeHtml { return this.san.bypassSecurityTrustHtml(waHtml(t)); }
  protected diaLargo(f?: string): string {
    if (!f) return '';
    return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z')).replace(',', '');
  }
  protected cuenta(f?: string): { v: string; l: string }[] {
    const ms = f ? new Date(f).getTime() - Date.now() : 0;
    const h = Math.max(0, Math.floor(ms / 3_600_000));
    return [{ v: String(Math.floor(h / 24)).padStart(2, '0'), l: 'DÍAS' }, { v: String(h % 24).padStart(2, '0'), l: 'HORAS' }];
  }
  protected mins(total: number | undefined, porMin: number): string {
    const m = Math.ceil((total ?? 0) / Math.max(1, porMin));
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  }
  protected toggleCanal(ch: 'email' | 'whatsapp'): void {
    const c = this.f().canales;
    const nx = c.includes(ch) ? c.filter((x) => x !== ch) : [...c, ch];
    if (nx.length) this.set({ canales: (['email', 'whatsapp'] as const).filter((x) => nx.includes(x)) });
  }
  protected ritmo(k: 'emailPorMin' | 'waPorMin', d: number, max: number): void { this.set({ [k]: Math.min(max, Math.max(1, this.f()[k] + d)) }); }

  async refrescarPrevia(f = this.f()): Promise<void> {
    try {
      const p = await this.api.previsualizar(this.cid(), { nombre: f.nombre, asunto: f.asunto, preheader: f.preheader, diseno: f.diseno });
      this.previa.set(p);
      this.error.set(p.error ?? '');
    } catch { /* keep the last preview */ }
  }

  protected async calcular(): Promise<void> {
    if (this.dirty() && this.f().segmentoId !== this.camp()?.segmentoId) await this.guardar();
    try { this.aud.set(await this.api.audiencia(this.cid(), this.id)); } catch (e) { this.toasts.error(errText(e, 'No se pudo calcular la audiencia.')); }
  }

  async guardar(): Promise<boolean> {
    const c = this.camp();
    if (!c) return false;
    this.guardando.set(true);
    try {
      const body: CampanaIn = { ...this.f(), ...(this.iaMeta ? { autor: 'ia' as const, modelo: this.iaMeta.modelo, nota: this.iaMeta.nota } : {}) };
      const nc = await this.api.guardar(this.cid(), this.id, c.version, body);
      this.iaMeta = null;
      this.aplicar(nc);
      this.error.set('');
      void this.api.audiencia(this.cid(), this.id).then((a) => this.aud.set(a)).catch(() => undefined);
      return true;
    } catch (e) {
      const p = problemOf(e);
      if (p.code === 'DISENO_NO_VALIDO') this.error.set(p.detail ?? '');
      this.toasts.error(errText(e, 'No se pudo guardar.'));
      return false;
    } finally {
      this.guardando.set(false);
    }
  }

  protected async abrirEnvio(): Promise<void> {
    if (this.dirty() && !(await this.guardar())) return;
    await this.calcular();
    this.programar = this.camp()?.estado === 'programada';
    this.envio.set({ soloEmail: false });
  }

  protected async enviar(soloEmail: boolean): Promise<void> {
    const c = this.camp();
    if (!c) return;
    this.enviando.set(true);
    try {
      const r = await this.api.enviar(this.cid(), this.id, c.version, { soloEmail, programadaAt: this.programar && this.programadaAt ? new Date(this.programadaAt).toISOString() : undefined });
      this.envio.set(null);
      this.toasts.success(r.estado === 'programada' ? 'Campaña programada' : `Enviando a ${n(r.encolados)} destinos`);
      await this.recargarEstado();
      this.ir('ajustes');
    } catch (e) {
      if (problemOf(e).code === 'WHATSAPP_NO_DISPONIBLE') this.envio.set({ soloEmail: true });
      else this.toasts.error(errText(e, 'No se pudo enviar.'));
    } finally {
      this.enviando.set(false);
    }
  }

  protected async probar(): Promise<void> {
    if (this.dirty() && !(await this.guardar())) return;
    this.probando.set(true);
    try {
      const r = await this.api.prueba(this.cid(), this.id, this.pruebaDestino.trim());
      this.toasts.success(r.detalle);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo enviar la prueba.'));
    } finally {
      this.probando.set(false);
    }
  }

  protected async accion(a: 'pausar' | 'reanudar' | 'cancelar' | 'desprogramar'): Promise<void> {
    try {
      this.aplicar(await this.api.accion(this.cid(), this.id, a));
      void this.cargarDest();
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo cambiar el estado.'));
    }
  }
  protected async cancelar(): Promise<void> {
    if (await this.confirm.ask({ title: '¿Cancelar el envío?', text: 'Los destinos pendientes no recibirán la campaña. Lo enviado no se puede deshacer.', confirm: 'Cancelar envío', danger: true })) await this.accion('cancelar');
  }
  protected async borrar(): Promise<void> {
    if (!(await this.confirm.ask({ title: '¿Borrar la campaña?', text: 'Se borra el borrador y su historial de diseño.', confirm: 'Borrar', danger: true }))) return;
    try {
      await this.api.borrar(this.cid(), this.id);
      void this.router.navigate(['/', this.comps.current()?.slug, 'campanas']);
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo borrar.'));
    }
  }
  protected async duplicar(): Promise<void> {
    try {
      const c = await this.api.duplicar(this.cid(), this.id);
      void this.router.navigate(['/', this.comps.current()?.slug, 'campanas', c.id], { queryParams: { tab: 'diseno' } });
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo duplicar.'));
    }
  }

  protected filtrarDest(p: Partial<{ canal: string; estado: string; pagina: number }>): void {
    this.fd.update((f) => ({ ...f, pagina: 1, ...p }));
    void this.cargarDest();
  }
  private async cargarDest(): Promise<void> {
    try { this.dest.set(await this.api.destinatarios(this.cid(), this.id, this.fd())); } catch { /* keep */ }
  }

  protected async subir(id: string, ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.subiendo.set(true);
    try {
      const url = await this.media.upload(file, file.name);
      this.editar(id, { imagen: url });
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo subir la imagen.'));
    } finally {
      this.subiendo.set(false);
    }
  }

  protected async pedirIA(): Promise<void> {
    const texto = this.iaTexto.trim();
    if (texto.length < 3 || this.iaCargando()) return;
    const antes = this.f().diseno;
    this.msgs.update((m) => [...m, { rol: 'usuario', texto }]);
    this.iaTexto = '';
    this.iaCargando.set(true);
    this.iaSeg.set(0);
    const t = setInterval(() => this.iaSeg.update((s) => s + 1), 1000);
    try {
      const r = await this.api.ia(this.cid(), { instruccion: texto, diseno: antes, seleccion: this.sel() || undefined, historial: this.msgs().slice(-7, -1), campana: this.f().nombre });
      this.snapshot();
      this.set({ diseno: r.diseno });
      this.msgs.update((m) => [...m, { rol: 'asistente', texto: r.respuesta || 'Hecho.' }]);
      this.iaAplicada.set({ modelo: r.modelo, hora: new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date()), antes, nota: texto });
      this.iaMeta = { modelo: r.modelo, nota: texto.slice(0, 300) };
      if (!r.diseno.some((b) => b.id === this.sel())) this.sel.set('');
    } catch (e) {
      this.msgs.update((m) => [...m, { rol: 'asistente', texto: errText(e, 'La IA no ha podido hacerlo.') }]);
    } finally {
      clearInterval(t);
      this.iaCargando.set(false);
    }
  }
  protected deshacerIA(): void {
    const x = this.iaAplicada();
    if (!x) return;
    this.set({ diseno: x.antes });
    this.iaAplicada.set(null);
    this.iaMeta = null;
  }
}

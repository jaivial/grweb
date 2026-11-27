import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton, GrToasts, type GrIconName, GrSelect, GrPopover } from '@grcup/ui';
import { problemOf } from '../../core/api';
import { Competitions } from '../../core/competitions';
import { Realtime } from '../../core/realtime';
import { Confirm, Media, errText, BoTablaMovil } from '../../shared/ui';
import { BoDatePicker } from '../../shared/kit';
import {
  CampanasApi, ESTADO, ESTADO_DEST, NOMBRE_TIPO, TIPOS, fecha, hora, n, waHtml,
  type Audiencia, type Bloque, type Campana, type CampanaIn, type CanalBloque, type Destinatarios, type MensajeIA, type Modelo, type Previa, type Segmento, type TipoBloque, type WhatsApp,
} from './api';

type Tab = 'flujo' | 'diseno' | 'previa' | 'ajustes';
const LOGO = 'https://jaimedigitalstudio.b-cdn.net/grcup/logos/grcuplogo-2026.png';
const ENLACES = ['/entradas', '/horarios', '/atletas', '/participantes', '/sorteo', '/en-directo', '/resultados', '/como-llegar'];

function nuevo(tipo: TipoBloque, id: string): Bloque {
  const b: Bloque = { id, tipo, canal: 'ambos' };
  switch (tipo) {
    case 'titulo': return { ...b, texto: 'Nuevo título' };
    case 'texto': return { ...b, texto: 'Escribe aquí el texto. Usa **negrita** para lo importante.' };
    case 'boton': return { ...b, texto: 'Reserva tu entrada', url: '/entradas' };
    case 'portada': case 'imagen': return { ...b, imagen: 'https://jaimedigitalstudio.b-cdn.net/grcup/images/club/alfonso-fernandez/img-3363.webp', alt: '' };
    case 'lista': return { ...b, items: ['Primer punto', 'Segundo punto'] };
    case 'dos_columnas': return { ...b, texto: '**Sábado**\nSesiones de AEP-2', texto2: '**Domingo**\nSesiones de AEP-3' };
    case 'cuenta_atras': return { ...b, fecha: '2026-12-18T08:30', texto: 'Faltan' };
    case 'horario': return { ...b, fecha: '2026-12-18', canal: 'email' };
    case 'espacio': return { ...b, alto: 24 };
    default: return b;
  }
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const VARIABLES = [
  { k: 'nombre', l: 'Nombre', d: 'Nombre de pila de quien lo recibe («hola» si no lo tenemos)' },
  { k: 'competicion', l: 'Competición', d: 'Nombre de la competición' },
  { k: 'fechas', l: 'Fechas', d: 'Días de la competición' },
  { k: 'sede', l: 'Sede', d: 'Pabellón y ciudad' },
  { k: 'web', l: 'Web', d: 'Dirección de la web pública' },
];
const chip = (t: string) => `<span style="background:#f6e0e3;border-radius:3px;padding:0 3px">${t}</span>`;
const md = (s = '', vars: Record<string, string> = {}) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\{\{\s*([a-z]+)\s*\}\}/g, (m, k: string) => (k === 'nombre' ? chip('Laura') : k in vars ? chip(esc(vars[k])) : m)).replace(/\n/g, '<br>');

/** «Campaña» (Figma page 61): Flujo · Diseño (blocks, layers, properties, AI) · Previsualización (email + WhatsApp) · Ajustes and sending. */
@Component({
  selector: 'bo-campana',
  imports: [BoDatePicker, BoTablaMovil, GrSelect, GrPopover, FormsModule, NgTemplateOutlet, RouterLink, GrAlert, GrBadge, GrButton, GrEmpty, GrField, GrIcon, GrInput, GrSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`.canvas p { margin: 0 } .canvas strong { color: #141011 }`],
  template: `
    @let c = camp();
    @if (c === null) { <gr-empty icon="wifi-off" title="No hemos podido cargar la campaña"><a grButton [routerLink]="['/', comps.current()?.slug, 'campanas']">Volver</a></gr-empty> }
    @else if (c === undefined) { <gr-skeleton class="h-[600px] rounded-lg" /> }
    @else {
    <div class="mx-auto flex max-w-[1400px] flex-col gap-4 pb-24">
      <!-- Header -->
      <section class="flex items-center gap-2 rounded-lg border border-line-subtle bg-bg-card p-2 lg:gap-3 lg:p-4">
        <a [routerLink]="['/', comps.current()?.slug, 'campanas']" class="hidden size-10 shrink-0 items-center justify-center rounded-md border border-line-strong hover:bg-bg-raised lg:flex" aria-label="Volver a campañas"><gr-icon name="chevron-left" [size]="18" /></a>
        <div class="flex min-w-0 flex-1 items-center gap-2 lg:block">
          <h1 class="min-w-0 truncate text-ui-h5 lg:text-ui-h4">{{ f().nombre || 'Sin nombre' }}</h1>
          <gr-badge class="shrink-0 lg:hidden" [tone]="est[c.estado].tone">{{ est[c.estado].l }}</gr-badge>
          <p class="hidden truncate text-body-xs text-text-tertiary lg:block">Asunto: {{ f().asunto || '—' }}</p>
          <p class="mt-1.5 hidden flex-wrap items-center gap-1.5 lg:flex">
            <gr-badge [tone]="est[c.estado].tone">{{ est[c.estado].l }}</gr-badge>
            @for (ch of f().canales; track ch) { <span class="inline-flex h-6 items-center gap-1 rounded-2xs border px-1.5 text-mono-xs" [class]="ch === 'email' ? 'border-info/40 text-info' : 'border-success/40 text-success'"><gr-icon [name]="ch === 'email' ? 'mail' : 'smartphone'" [size]="12" />{{ ch === 'email' ? 'Email' : 'WhatsApp' }}</span> }
            @if (aud(); as a) { <span class="text-body-xs text-text-tertiary">{{ n(destinos()) }} destinos · {{ a.segmento }}</span> }
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-1 lg:flex-wrap lg:gap-2">
          <span class="hidden items-center gap-1.5 text-label-s lg:flex" [class]="dirty() ? 'text-warning' : 'text-success'"><gr-icon [name]="dirty() ? 'circle-alert' : 'circle-check'" [size]="14" />{{ dirty() ? 'Cambios sin guardar' : 'Todo guardado' }}</span>
          @if (editable()) { <button grButton class="max-lg:size-10 max-lg:px-0" icon="save" [loading]="guardando()" [disabled]="!dirty()" (click)="guardar()" aria-label="Guardar"><span class="hidden lg:inline">Guardar</span></button> }
          @if (c.estado === 'borrador' || c.estado === 'programada') { <button grButton class="max-lg:size-10 max-lg:px-0" variant="primary" icon="send" (click)="abrirEnvio()" aria-label="Enviar"><span class="hidden lg:inline">Enviar</span></button> }
          @if (c.estado === 'borrador' || c.estado === 'cancelada') { <button grButton class="max-lg:size-10 max-lg:px-0" variant="ghost" icon="trash" (click)="borrar()" aria-label="Borrar campaña"></button> }
          @else { <button grButton class="max-lg:size-10 max-lg:px-0" variant="ghost" icon="copy" (click)="duplicar()" aria-label="Duplicar campaña"></button> }
        </div>
      </section>

      <nav class="mx-auto grid w-full grid-cols-4 gap-1 rounded-md md:flex md:w-auto md:max-w-full md:overflow-x-auto border border-line-subtle bg-bg-card p-1 [scrollbar-width:none]" aria-label="Campaña">
        @for (t of tabs; track t.v) {
          <button type="button" class="flex h-9 min-w-0 shrink-0 items-center justify-center gap-1 rounded-sm px-1 text-[13px] font-semibold md:gap-1.5 md:px-3 md:text-label-s" [class]="tab() === t.v ? 'bg-accent-deep/50 text-text-primary' : 'text-text-tertiary hover:text-text-primary'" [attr.aria-current]="tab() === t.v ? 'page' : null" (click)="ir(t.v)"><gr-icon [name]="t.i" [size]="14" class="hidden shrink-0 min-[400px]:block md:block" /><span class="truncate md:hidden">{{ t.c }}</span><span class="hidden md:inline">{{ t.l }}</span></button>
        }
      </nav>
      @if (error()) { <gr-alert tone="danger" title="El diseño tiene un problema">{{ error() }}</gr-alert> }

      @switch (tab()) {
        <!-- ============ FLUJO ============ -->
        @case ('flujo') {
          <section class="relative rounded-lg border border-line-subtle bg-bg-card bg-[radial-gradient(circle,#2a2224_1px,transparent_1px)] [background-size:16px_16px] p-6">
            <p class="flex flex-wrap gap-3 text-mono-xs text-text-tertiary"><span class="flex items-center gap-1"><span class="size-2 rounded-pill bg-success"></span>listo</span><span class="flex items-center gap-1"><span class="size-2 rounded-pill bg-warning"></span>pendiente</span><span class="flex items-center gap-1"><span class="size-2 rounded-pill bg-line-strong"></span>desactivado</span><span class="ml-auto inline-flex h-7 items-center gap-1.5 rounded-sm border border-info/40 bg-info/10 px-2 font-sans text-body-xs normal-case text-info"><gr-icon name="info" [size]="12" />Pulsa un nodo para editar esa parte</span></p>
            <div class="mx-auto mt-4 flex max-w-xl flex-col items-center">
              @for (nd of nodos(); track nd.t; let last = $last) {
                @if (nd.par) {
                  <div class="grid w-full grid-cols-2 gap-4">
                    @for (x of nd.par; track x.t) { <ng-container *ngTemplateOutlet="nodo; context: { $implicit: x }" /> }
                  </div>
                } @else { <ng-container *ngTemplateOutlet="nodo; context: { $implicit: nd }" /> }
                @if (!last) { <span class="flex flex-col items-center text-line-strong" aria-hidden="true"><span class="h-5 w-px bg-line-strong"></span><gr-icon name="chevron-down" [size]="12" class="-mt-1" /></span> }
              }
            </div>
          </section>
        }

        <!-- ============ DISEÑO ============ -->
        @case ('diseno') {
          <div class="flex flex-nowrap items-center gap-1 rounded-md border border-line-subtle bg-bg-card p-1.5 lg:flex-wrap lg:gap-2">
            @for (v of vistasDis; track v.v) { <button type="button" class="h-8 shrink-0 rounded-sm px-3 text-label-s" [class]="(vistaDis() === v.v ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary') + (v.v === 'previa' ? ' hidden lg:block' : '')" (click)="vistaDis.set(v.v); refrescarPrevia()">{{ v.l }}</button> }
            @if (vistaDis() !== 'whatsapp') { <span class="mx-1 hidden h-5 w-px bg-line-subtle md:block"></span> }
            @for (a of anchos; track a.v) { <button type="button" class="hidden h-8 shrink-0 items-center gap-1 rounded-sm px-2.5 text-label-s" [class]="(ancho() === a.v ? 'bg-bg-raised text-text-primary' : 'text-text-tertiary') + (vistaDis() === 'whatsapp' ? '' : ' md:flex')" (click)="ancho.set(a.v)" [attr.aria-label]="a.l"><gr-icon [name]="a.i" [size]="14" /><span class="hidden lg:inline">{{ a.l }}</span></button> }
            <span class="flex-1"></span>
            <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-sm hover:bg-bg-raised disabled:opacity-30" [disabled]="!hist().length || !editable()" (click)="deshacer()" aria-label="Deshacer"><gr-icon name="undo" [size]="16" /></button>
            <button type="button" class="flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-3 text-label-s" [class]="iaOpen() ? 'bg-text-primary text-bg-base' : 'text-text-secondary hover:bg-bg-raised'" (click)="iaOpen.set(!iaOpen())" [disabled]="!editable()"><gr-icon name="sparkles" [size]="14" />IA</button>
          </div>
          <div class="grid gap-4" [class]="vistaDis() === 'whatsapp' ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : 'lg:grid-cols-[240px_minmax(0,1fr)_320px]'">
            <!-- left: add / layers (below the canvas on tablet and phone, where each tab opens a bottom sheet) -->
            @if (vistaDis() !== 'whatsapp') {
            <aside class="order-2 h-fit rounded-lg border border-line-subtle bg-bg-card p-1.5 lg:order-none lg:sticky lg:top-20 lg:p-3">
              <div class="flex gap-1">@for (p of paneles; track p.v) { <button type="button" class="h-8 flex-1 rounded-sm text-label-s" [class]="escritorio() && panel() === p.v ? 'bg-bg-raised text-text-primary' : escritorio() ? 'text-text-tertiary' : 'text-text-secondary hover:bg-bg-raised'" (click)="panel.set(p.v); hoja.set(!escritorio())">{{ p.l }}</button> }</div>
              @if (escritorio()) { <div class="mt-3"><ng-container *ngTemplateOutlet="panelCont" /></div> }
            </aside>
            }
            @if (hoja() && !escritorio() && vistaDis() !== 'whatsapp') {
              <div class="fixed inset-0 z-[60] flex flex-col justify-end bg-black/55" (click)="hoja.set(false)" (keydown.escape)="hoja.set(false)">
                <div role="dialog" aria-modal="true" [attr.aria-label]="panel() === 'anadir' ? 'Añadir bloque' : 'Capas'" class="flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-[20px] border-t border-line-strong bg-bg-raised px-4 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-16px_40px_rgb(0_0_0/0.5)]" (click)="$event.stopPropagation()">
                  <div class="flex items-center justify-between gap-3 pt-4 pb-3"><span class="text-ui-h5">{{ panel() === 'anadir' ? 'Añadir bloque' : 'Capas' }}</span>
                    <button type="button" class="-mr-2 flex size-11 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary" aria-label="Cerrar" (click)="hoja.set(false)"><gr-icon name="x" [size]="22" /></button></div>
                  <ng-container *ngTemplateOutlet="panelCont" />
                </div>
              </div>
            }
            <ng-template #panelCont>
              @if (panel() === 'anadir') {
                <div class="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-2">
                  @for (t of tipos; track t.tipo) {
                    <button type="button" class="flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-md border border-line-subtle bg-bg-raised/40 text-label-s hover:border-line-strong disabled:opacity-40" [disabled]="!editable()" (click)="anadir(t.tipo); hoja.set(false)"><gr-icon [name]="$any(t.icon)" [size]="18" class="text-text-tertiary" />{{ t.l }}</button>
                  }
                </div>
              } @else {
                <ul class="flex flex-col gap-1">
                  @for (b of f().diseno; track b.id; let i = $index) {
                    <li><button type="button" class="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-label-s" [class]="sel() === b.id ? 'bg-accent-deep/40 text-text-primary' : 'text-text-secondary hover:bg-bg-raised'" (click)="sel.set(b.id); hoja.set(false)">
                      <span class="truncate">{{ nombreTipo[b.tipo] }}</span><span class="flex-1 truncate text-body-xs text-text-muted">{{ resumen(b) }}</span>
                      @if (b.canal === 'email') { <span class="rounded-2xs bg-info/15 px-1 text-[10px] text-info">EMAIL</span> } @if (b.canal === 'whatsapp') { <span class="rounded-2xs bg-success/15 px-1 text-[10px] text-success">WA</span> }
                    </button></li>
                  } @empty { <li class="px-2 py-3 text-body-xs text-text-tertiary">Sin bloques.</li> }
                </ul>
              }
            </ng-template>

            <!-- canvas -->
            <section class="order-1 min-w-0 rounded-lg border border-line-subtle bg-[#ece7e7] p-4 lg:order-none">
              @if (vistaDis() !== 'whatsapp') { <p class="mb-3 text-center text-mono-xs text-[#7a7072]">{{ ancho() === 'escritorio' ? 'ESCRITORIO · EMAIL 600 PX' : 'MÓVIL · 375 PX' }}</p> }
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
                            <div class="px-8 pb-4"><p class="mb-1 text-[11px] tracking-wider text-[#9a8f91] uppercase">{{ diaLargo(b.fecha) }} · horario</p>
                              @for (x of ['Femenino', 'Masculino', 'Femenino']; track $index) { <p class="flex justify-between border-b border-[#eee6e7] py-2 text-[14px]"><span>{{ x }} · categorías de la sesión</span><span class="font-mono text-[#c42b3e]">--:--</span></p> }
                              <p class="mt-1 text-[11px] text-[#9a8f91]">Se rellena con las sesiones publicadas de ese día.</p></div>
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
                  @if (previa(); as p) { <iframe [srcdoc]="emailSeguro()" title="Vista previa del email" class="mx-auto block h-[900px] w-full border-0 bg-white" [style.max-width.px]="ancho() === 'escritorio' ? 640 : 390" sandbox=""></iframe> }
                  @else { <gr-skeleton class="mx-auto h-[600px] max-w-[600px]" /> }
                }
                @case ('html') { <pre class="max-h-[900px] overflow-auto rounded-md bg-[#141011] p-4 text-[11px] leading-4 whitespace-pre-wrap text-[#d8cfd1]">{{ previa()?.emailHtml }}</pre> }
                @case ('whatsapp') {
                  <p class="mb-3 text-center text-mono-xs text-[#7a7072]">WHATSAPP · {{ f().whatsapp ? 'MENSAJE PROPIO' : 'DERIVADO DEL EMAIL' }}</p>
                  @if (previa(); as p) { <ng-container *ngTemplateOutlet="waTel; context: { $implicit: p.whatsapp }" /> }
                  @else { <gr-skeleton class="mx-auto h-[520px] max-w-[340px] rounded-[36px]" /> }
                }
              }
            </section>

            <!-- right: properties or AI (the assistant goes first on phones) -->
            <aside [class]="iaOpen() ? 'order-first' : 'order-3'" class="lg:order-none h-fit rounded-lg border border-line-subtle bg-bg-card p-4 lg:sticky lg:top-20">
              @if (iaOpen()) {
                <header class="flex items-start gap-2"><span class="flex size-7 shrink-0 items-center justify-center rounded-pill bg-bg-raised text-text-secondary"><gr-icon name="sparkles" [size]="14" /></span><div class="flex-1"><h2 class="text-ui-h5">Asistente IA</h2><p class="text-body-xs text-text-tertiary">Cambia cualquier parte de la campaña: textos, bloques, asunto, canales, destinatarios o ritmo</p></div>
                  <button type="button" class="flex size-8 items-center justify-center rounded-sm hover:bg-bg-raised" (click)="iaOpen.set(false)" aria-label="Cerrar"><gr-icon name="x" [size]="16" /></button></header>
                <div class="mt-3 flex max-h-[420px] min-h-32 flex-col gap-3 overflow-y-auto" aria-live="polite">
                  @for (m of msgs(); track $index) {
                    @if (m.rol === 'usuario') { <p class="max-w-[88%] self-end rounded-[14px] rounded-br-[4px] bg-bg-raised px-3 py-2 text-body-s text-text-primary [overflow-wrap:anywhere]">{{ m.texto }}</p> }
                    @else { <p class="text-body-s text-text-secondary [overflow-wrap:anywhere]">{{ m.texto }}</p> }
                  } @empty {
                    <div class="flex flex-col gap-1.5">
                      @for (e of ejemplosIA; track e) { <button type="button" class="rounded-[10px] border border-line-subtle px-3 py-2 text-left text-body-xs text-text-secondary transition-colors hover:border-line-strong hover:bg-bg-raised hover:text-text-primary" (click)="iaTexto = e">{{ e }}</button> }
                    </div>
                  }
                  @if (iaAplicada(); as x) {
                    <div class="flex items-center gap-2 rounded-[10px] border border-line-subtle bg-bg-raised/60 px-3 py-2 text-body-xs"><gr-icon name="circle-check" [size]="14" class="shrink-0 text-success" /><span class="min-w-0 flex-1">Aplicado{{ x.cambios.length ? ' · ' + x.cambios.join(', ') : '' }} · {{ x.hora }}</span><button type="button" class="shrink-0 text-label-s hover:underline" (click)="deshacerIA()">Deshacer</button></div>
                  }
                  @if (iaCargando()) { <p class="flex items-center gap-2 text-body-xs text-text-tertiary"><gr-icon name="loader" [size]="14" class="animate-spin" />Pensando y editando · {{ iaSeg() }} s</p> }
                </div>
                <!-- Prompt bar (Neural «PromptBar»: one surface, autosized field, model chip and round send) -->
                <form class="mt-3 rounded-[14px] border border-line-strong bg-bg-raised p-2 shadow-card transition-colors focus-within:border-text-tertiary" (ngSubmit)="pedirIA()">
                  <textarea name="ia" rows="1" class="block max-h-[120px] min-h-[44px] w-full resize-none bg-transparent px-1.5 py-1 text-[16px] leading-6 text-text-primary outline-none [field-sizing:content] placeholder:text-text-tertiary" [(ngModel)]="iaTexto" placeholder="Pide un cambio a la campaña…" aria-label="Petición a la IA" (keydown.enter)="enter($any($event))"></textarea>
                  <div class="mt-1 flex items-center gap-1">
                    @if (modelos().length > 1) { <gr-select tipo="filtro" name="modelo" aria-label="Modelo de IA" [(ngModel)]="modelo">@for (m of modelos(); track m.id) { <option [value]="m.id">{{ m.nombre }}</option> }</gr-select> }
                    @else { <span class="flex h-7 items-center gap-1 px-1.5 text-[12px] font-medium text-text-tertiary">{{ modelos()[0]?.id ?? 'IA no disponible' }}</span> }
                    <span class="flex-1"></span>
                    <button type="submit" class="flex size-8 shrink-0 items-center justify-center rounded-pill transition-[background-color,transform] duration-150 enabled:active:scale-[0.94]" [class]="puedeIA() ? 'bg-text-primary text-bg-base' : 'bg-line-strong text-text-tertiary'" [disabled]="!puedeIA()" aria-label="Enviar a la IA"><gr-icon name="arrow-up" [size]="16" /></button>
                  </div>
                </form>
                <p class="mt-2 text-body-xs text-text-muted">Enter envía · Mayús+Enter salto de línea. Los cambios no se guardan hasta que pulses «Guardar». La IA nunca ve contactos ni datos personales.</p>
              } @else if (vistaDis() === 'whatsapp') {
                <ng-container *ngTemplateOutlet="waEditor" />
              } @else if (bloque(); as b) {
                <header class="flex items-center gap-1">
                  <div class="min-w-0 flex-1"><p class="truncate text-mono-xs text-text-tertiary">{{ nombreTipo[b.tipo] }}</p></div>
                  @if (conTexto(b)) {
                    <span class="relative">
                      <button type="button" class="flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-2 font-mono text-[12px] text-text-secondary hover:bg-bg-raised" [attr.aria-expanded]="varsOpen()" (mousedown)="$event.preventDefault()" (click)="varsOpen.set(!varsOpen())" aria-label="Insertar variable">&#123;&#125; Variables</button>
                      @if (varsOpen()) {
                        <gr-popover etiqueta="Insertar variable" (cerrar)="varsOpen.set(false)">
                          <p class="text-label-s">Insertar variable</p>
                          <p class="-mt-2 text-body-xs text-text-tertiary">Se añade donde está el cursor del último campo de texto que has tocado.</p>
                          <ul class="flex flex-col gap-1">
                            @for (v of variables; track v.k) {
                              <li><button type="button" class="flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left hover:bg-bg-card" (click)="insertarVar(v.k)">
                                <code class="shrink-0 rounded-2xs bg-accent-deep/40 px-1.5 py-0.5 font-mono text-[12px] text-accent-text">{{ tok(v.k) }}</code>
                                <span class="min-w-0 flex-1"><span class="block text-label-s">{{ v.l }}</span><span class="block truncate text-body-xs text-text-tertiary">{{ v.d }}</span></span>
                              </button></li>
                            }
                          </ul>
                        </gr-popover>
                      }
                    </span>
                  }
                  <button type="button" class="flex size-8 items-center justify-center rounded-sm hover:bg-bg-raised" (click)="mover(b.id, -1)" aria-label="Subir"><gr-icon name="arrow-up" [size]="14" /></button>
                  <button type="button" class="flex size-8 items-center justify-center rounded-sm hover:bg-bg-raised" (click)="mover(b.id, 1)" aria-label="Bajar"><gr-icon name="arrow-down" [size]="14" /></button>
                  <button type="button" class="flex size-8 items-center justify-center rounded-sm hover:bg-bg-raised" (click)="duplicarBloque(b.id)" aria-label="Duplicar"><gr-icon name="copy" [size]="14" /></button>
                  <button type="button" class="flex size-8 items-center justify-center rounded-sm text-accent-text hover:bg-bg-raised" (click)="quitar(b.id)" aria-label="Borrar bloque"><gr-icon name="trash" [size]="14" /></button>
                </header>
                <div class="mt-3 flex flex-col gap-3" (focusin)="campo($event)">
                  @switch (b.tipo) {
                    @case ('titulo') { <gr-field label="Texto"><textarea grInput rows="2" [ngModel]="b.texto" (ngModelChange)="editar(b.id, { texto: $event })"></textarea></gr-field> }
                    @case ('texto') { <gr-field label="Texto" hint="**negrita** · «Variables» para el nombre, la fecha…"><textarea grInput rows="6" [ngModel]="b.texto" (ngModelChange)="editar(b.id, { texto: $event })"></textarea></gr-field> }
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
                      <gr-field label="Hasta (hora de Madrid)"><bo-date-picker tipo="datetime" [ngModel]="b.fecha" (ngModelChange)="editar(b.id, { fecha: $event })" /></gr-field>
                      <gr-field label="Texto encima"><input grInput [ngModel]="b.texto" (ngModelChange)="editar(b.id, { texto: $event })" /></gr-field>
                    }
                    @case ('horario') { <gr-field label="Día"><gr-select [ngModel]="b.fecha" (ngModelChange)="editar(b.id, { fecha: $event })">@for (d of dias(); track d) { <option [value]="d">{{ diaLargo(d) }}</option> }</gr-select></gr-field> }
                    @case ('espacio') { <gr-field label="Alto"><gr-select [ngModel]="b.alto" (ngModelChange)="editar(b.id, { alto: +$event })">@for (h of [8, 16, 24, 32, 48, 64]; track h) { <option [value]="h">{{ h }} px</option> }</gr-select></gr-field> }
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
            @if (escritorio()) { <div class="flex justify-end"><span class="flex gap-1">@for (a of anchos; track a.v) { <button type="button" class="flex h-8 items-center gap-1 rounded-sm px-2.5 text-label-s" [class]="ancho() === a.v ? 'bg-bg-raised' : 'text-text-tertiary'" (click)="ancho.set(a.v)"><gr-icon [name]="a.i" [size]="14" />{{ a.l }}</button> }</span></div> }
            @if (previa(); as p) {
              <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]" [class.mt-5]="escritorio()">
                @if (f().canales.includes('email')) {
                  <div class="min-w-0">@if (escritorio()) { <p class="mb-2 text-center text-label-s">Email</p> }
                    <div class="mx-auto overflow-hidden rounded-lg border border-line-strong" [style.max-width.px]="escritorio() && ancho() === 'escritorio' ? 640 : 390">
                      <p class="truncate bg-bg-raised px-3 py-2 font-mono text-mono-xs text-text-tertiary">● ● ●  {{ f().asunto }}</p>
                      <iframe #frEmail [srcdoc]="emailSeguro()" title="Email" class="block w-full border-0 bg-white" scrolling="no" sandbox="allow-same-origin" (load)="ajustarAlto()"></iframe>
                    </div></div>
                }
                @if (f().canales.includes('whatsapp')) {
                  <div class="min-w-0"><p class="mb-2 text-center text-label-s">WhatsApp{{ f().whatsapp ? ' · mensaje propio' : '' }}</p>
                    <ng-container *ngTemplateOutlet="waTel; context: { $implicit: p.whatsapp }" />
                    <p class="mt-2 text-center text-body-xs text-text-tertiary">{{ p.whatsapp.texto.length }} caracteres{{ p.whatsapp.enlaces.length ? ' · ' + p.whatsapp.enlaces.length + (p.whatsapp.enlaces.length === 1 ? ' botón' : ' botones') : '' }}</p></div>
                } @else {
                  <div class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-strong p-6 text-center">
                    <gr-icon name="message" [size]="22" class="text-text-tertiary" />
                    <p class="text-body-s text-text-secondary">Esta campaña solo sale por email. Actívala también por WhatsApp para ver aquí cómo llega.</p>
                    <button grButton size="s" icon="plus" [disabled]="!editable()" (click)="toggleCanal('whatsapp')">Activar WhatsApp</button>
                  </div>
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
              <gr-select tipo="filtro" aria-label="Canal" [ngModel]="fd().canal" (ngModelChange)="filtrarDest({ canal: $event })"><option value="">Todos los canales</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option></gr-select>
              <gr-select tipo="filtro" aria-label="Estado" [ngModel]="fd().estado" (ngModelChange)="filtrarDest({ estado: $event })"><option value="">Todos los estados</option>@for (e of estadosDest; track e.v) { <option [value]="e.v">{{ e.l }}</option> }</gr-select>
            </div>
            @if (dest(); as d) {
              <section class="overflow-x-auto rounded-lg border border-line-subtle bg-bg-card">
                <table boTablaMovil class="w-full min-w-[720px] text-left text-body-s">
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
              <gr-field label="Segmento" class="mt-4 md:w-1/2"><gr-select [ngModel]="f().segmentoId ?? ''" (ngModelChange)="set({ segmentoId: $event || undefined })"><option value="">Todos con consentimiento</option>@for (s of segs(); track s.id) { <option [value]="s.id">{{ s.nombre }} ({{ n(s.recuento.total) }})</option> }</gr-select></gr-field>
              @if (aud(); as a) { <p class="mt-3 text-body-s">{{ n(destinos()) }} destinos · {{ n(a.email) }} por email / {{ n(a.whatsapp) }} por WhatsApp · {{ n(a.excluidos) }} excluidos (sin consentimiento del canal o con baja)</p> }
            </section>
            <section class="rounded-lg border border-line-subtle bg-bg-card p-5">
              <h2 class="text-ui-h5">Ritmo de envío</h2><p class="text-body-xs text-text-tertiary">Mensajes por minuto y canal</p>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                @for (r of ritmos; track r.k) {
                  <div class="flex flex-col items-center rounded-md bg-bg-raised p-4 text-center"><p class="text-label-s">{{ r.l }}</p>
                    <div class="mt-2 flex items-center justify-center gap-3"><button type="button" class="flex size-9 items-center justify-center rounded-pill border border-line-strong" (click)="ritmo(r.k, -r.paso, r.max)" aria-label="Menos"><gr-icon name="minus" [size]="14" /></button>
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
          @if (programar) { <gr-field label="Fecha y hora (Madrid)" class="mt-2"><bo-date-picker tipo="datetime" [(ngModel)]="programadaAt" /></gr-field> }
          <div class="mt-6 flex justify-end gap-2">
            <button grButton variant="ghost" (click)="envio.set(null)">Cancelar</button>
            <button grButton variant="primary" [loading]="enviando()" (click)="enviar(e.soloEmail)">{{ programar ? 'Programar' : e.soloEmail ? 'Enviar email ahora' : 'Enviar ahora' }}</button>
          </div>
        </div>
      </div>
    }
    }

    <ng-template #nodo let-x>
      <button type="button" class="flex w-full max-w-xs items-center gap-3 rounded-md border border-l-[3px] bg-bg-card p-3 text-left hover:bg-bg-raised focus-visible:outline-2 focus-visible:outline-accent" [class]="x.estado === 'ok' ? 'border-success/60' : x.estado === 'pendiente' ? 'border-warning/60' : 'border-line-subtle opacity-60'" [attr.aria-label]="x.t + ' · ' + (x.estado === 'ok' ? 'listo' : x.estado === 'pendiente' ? 'pendiente' : 'desactivado')" (click)="ir(x.tab)">
        <span class="flex size-8 shrink-0 items-center justify-center rounded-sm" [class]="x.estado === 'ok' ? 'bg-success/15 text-success' : x.estado === 'pendiente' ? 'bg-warning/15 text-warning' : 'bg-bg-raised text-text-tertiary'"><gr-icon [name]="x.i" [size]="14" /></span>
        <span class="min-w-0 flex-1">
          <span class="block text-label-s">{{ x.t }}</span>
          <span class="mt-0.5 block truncate text-body-xs text-text-tertiary">{{ x.d }}</span>
          <span class="mt-1 block font-mono text-[10px] text-text-muted uppercase">{{ x.m }}</span>
        </span>
        <gr-icon name="chevron-right" [size]="14" class="shrink-0 text-text-tertiary" />
      </button>
    </ng-template>
    <!-- WhatsApp chat (newvillacarmen «WhatsAppPreview»): photo as media, the text as its caption, URL buttons as the last strips of the bubble -->
    <ng-template #waTel let-w>
      <div class="mx-auto w-full max-w-[340px] overflow-hidden rounded-[36px] border-[6px] border-[#1d1a1b] bg-[#ECE5DD] shadow-card" role="img" [attr.aria-label]="'Vista previa del WhatsApp: ' + w.texto">
        <div class="flex items-center gap-2 bg-[#075E54] px-3 py-2.5 text-white">
          <gr-icon name="arrow-left" [size]="16" />
          <span class="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-pill bg-white"><img [src]="logo" alt="" class="h-4" /></span>
          <span class="min-w-0 flex-1 leading-tight"><span class="block truncate text-[14px] font-semibold">{{ comps.current()?.nombreCorto || comps.current()?.nombre }}</span><span class="block text-[11px] text-white/70">en línea</span></span>
          <gr-icon name="more" [size]="16" />
        </div>
        <div class="flex flex-col gap-2 px-3 py-3">
          <span class="mx-auto rounded-md bg-white/70 px-2 py-0.5 text-[10px] tracking-wide text-neutral-500 uppercase">hoy</span>
          <div class="relative ml-2 max-w-[90%] self-start rounded-lg bg-white px-2.5 pt-1.5 pb-1.5 text-[13px] leading-[18px] text-[#111b21] shadow-sm">
            <span aria-hidden="true" class="absolute top-0 -left-[7px] h-0 w-0 border-t-[10px] border-r-[8px] border-t-white border-r-transparent"></span>
            @if (w.imagen) { <img [src]="w.imagen" alt="" class="-mx-2.5 -mt-1.5 mb-1.5 block aspect-[4/3] w-[calc(100%+20px)] max-w-none rounded-t-lg object-cover" /> }
            <p class="[overflow-wrap:anywhere]" [innerHTML]="wa(w.texto)"></p>
            <p class="mt-0.5 flex justify-end text-[10px] text-neutral-400">18:42 ✓✓</p>
            @for (e of w.enlaces.slice(0, 3); track $index) {
              <a [href]="e.url" target="_blank" rel="noopener" class="-mx-2.5 flex items-center justify-center gap-1.5 border-t border-black/10 py-2 text-[13px] font-medium text-[#027eb5]" [class.-mb-1.5]="$last"><gr-icon name="external-link" [size]="13" />{{ e.texto }}</a>
            }
          </div>
        </div>
        <div class="flex items-center gap-2 px-2 pb-2.5"><span class="flex-1 rounded-pill bg-white px-3 py-1.5 text-[13px] text-neutral-400">Mensaje</span><span class="flex size-8 items-center justify-center rounded-pill bg-[#075E54] text-white"><gr-icon name="send" [size]="14" /></span></div>
      </div>
    </ng-template>

    <!-- WhatsApp message editor (right panel of «Diseño › WhatsApp») -->
    <ng-template #waEditor>
      @let w = f().whatsapp;
      <header class="flex items-center gap-2"><h2 class="min-w-0 flex-1 text-ui-h5">Mensaje de WhatsApp</h2><gr-badge [tone]="w ? 'accent' : 'neutral'">{{ w ? 'Propio' : 'Automático' }}</gr-badge></header>
      <p class="mt-1 text-body-xs text-text-tertiary">{{ w ? 'Escrito para WhatsApp: los cambios del email ya no lo modifican.' : 'Se genera solo a partir del diseño del email (bloques «Ambos» y «Solo WA»): la primera imagen va como foto y los botones como botones de enlace.' }}</p>
      @if (!f().canales.includes('whatsapp')) {
        <p class="mt-3 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-body-xs text-warning"><gr-icon name="triangle-alert" [size]="14" class="shrink-0" /><span class="flex-1">Esta campaña no sale por WhatsApp.</span><button type="button" class="text-label-s underline disabled:opacity-40" [disabled]="!editable()" (click)="toggleCanal('whatsapp')">Activar</button></p>
      }
      <div class="mt-3 grid grid-cols-2 gap-2">
        <button grButton size="s" [icon]="w ? 'refresh' : 'pencil'" [disabled]="!editable()" (click)="waDesdeEmail()">{{ w ? 'Rehacer del email' : 'Personalizar' }}</button>
        <button grButton size="s" icon="code" [disabled]="!editable()" (click)="htmlTexto = ''; htmlOpen.set(true)">Desde HTML</button>
      </div>
      @if (w) {
        <div class="mt-4 flex flex-col gap-3">
          <gr-field label="Texto" [hint]="waHint(w.texto)"><textarea grInput rows="9" maxlength="4000" [ngModel]="w.texto" (ngModelChange)="setWA({ texto: $event })" [disabled]="!editable()"></textarea></gr-field>
          <gr-field label="Foto (opcional)"><input grInput placeholder="https://" [ngModel]="w.imagen ?? ''" (ngModelChange)="setWA({ imagen: $event })" [disabled]="!editable()" /></gr-field>
          <label class="-mt-1 flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-label-s hover:bg-bg-raised"><gr-icon name="camera" [size]="14" />{{ subiendo() ? 'Subiendo…' : 'Subir foto' }}<input type="file" accept="image/*" class="sr-only" (change)="subirWA($event)" [disabled]="!editable()" /></label>
          <div>
            <p class="mb-1.5 flex items-center justify-between text-label-s">Botones <span class="text-body-xs text-text-tertiary">los 3 primeros como botones</span></p>
            <ul class="flex flex-col gap-2">
              @for (e of w.enlaces; track $index; let i = $index) {
                <li class="flex flex-col gap-1.5 rounded-md border border-line-subtle p-2" [class.opacity-70]="i >= 3">
                  <div class="flex items-center gap-1.5"><input grInput class="min-w-0 flex-1" maxlength="25" placeholder="Texto del botón" [attr.aria-label]="'Texto del botón ' + (i + 1)" [ngModel]="e.texto" (ngModelChange)="setBoton(i, { texto: $event })" [disabled]="!editable()" />
                    <button type="button" class="flex size-9 shrink-0 items-center justify-center rounded-sm text-accent-text hover:bg-bg-raised" (click)="quitarBoton(i)" [attr.aria-label]="'Quitar botón ' + (i + 1)" [disabled]="!editable()"><gr-icon name="trash" [size]="14" /></button></div>
                  <input grInput placeholder="/entradas o https://" [attr.aria-label]="'Enlace del botón ' + (i + 1)" [ngModel]="e.url" (ngModelChange)="setBoton(i, { url: $event })" [disabled]="!editable()" />
                  @if (i >= 3) { <span class="text-body-xs text-text-tertiary">Se envía como línea «texto: enlace»</span> }
                </li>
              }
            </ul>
            @if (w.enlaces.length < 10) { <button type="button" class="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong text-label-s hover:bg-bg-raised disabled:opacity-40" [disabled]="!editable()" (click)="anadirBoton()"><gr-icon name="plus" [size]="14" />Añadir botón</button> }
            <div class="mt-2 flex flex-wrap gap-1">@for (e of enlaces; track e) { <span class="rounded-2xs border border-line-strong px-1.5 py-0.5 font-mono text-[11px] text-text-tertiary">{{ e }}</span> }</div>
          </div>
          <button type="button" class="self-start text-label-s text-text-secondary underline hover:text-text-primary disabled:opacity-40" [disabled]="!editable()" (click)="waAuto()">Volver al automático (derivado del email)</button>
        </div>
      } @else if (previa(); as p) {
        <dl class="mt-4 flex flex-col gap-2 text-body-s">
          <div class="flex justify-between gap-3"><dt class="text-text-tertiary">Foto</dt><dd>{{ p.whatsappAuto.imagen ? 'La primera imagen del email' : 'Sin foto' }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-text-tertiary">Botones</dt><dd>{{ p.whatsappAuto.enlaces.length || 'Ninguno' }}</dd></div>
          <div class="flex justify-between gap-3"><dt class="text-text-tertiary">Longitud</dt><dd>{{ p.whatsapp.texto.length }} caracteres</dd></div>
        </dl>
      }
    </ng-template>

    <!-- HTML → WhatsApp (bottom sheet on phones, dialog on larger screens) -->
    @if (htmlOpen()) {
      <div class="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60 sm:items-center sm:justify-center sm:px-4" (click)="htmlOpen.set(false)" (keydown.escape)="htmlOpen.set(false)">
        <form class="flex max-h-[90dvh] w-full flex-col gap-3 overflow-y-auto rounded-t-[20px] border-t border-line-strong bg-bg-raised p-5 pb-[max(20px,env(safe-area-inset-bottom))] shadow-card sm:max-w-xl sm:rounded-lg sm:border" role="dialog" aria-modal="true" aria-label="WhatsApp desde HTML" (click)="$event.stopPropagation()" (ngSubmit)="convertirHTML()">
          <div class="flex items-start gap-3"><div class="flex-1"><h2 class="text-ui-h5">WhatsApp desde HTML</h2><p class="text-body-xs text-text-tertiary">Pega un email o cualquier HTML: los títulos pasan a *negrita*, la primera foto va como imagen y los botones como botones de enlace.</p></div>
            <button type="button" class="-mt-1 -mr-2 flex size-10 items-center justify-center rounded-sm text-text-tertiary hover:text-text-primary" aria-label="Cerrar" (click)="htmlOpen.set(false)"><gr-icon name="x" [size]="20" /></button></div>
          <textarea grInput name="html" rows="10" class="font-mono text-[16px]" placeholder="<html>…" aria-label="HTML" [(ngModel)]="htmlTexto"></textarea>
          <div class="flex justify-end gap-2"><button type="button" grButton variant="ghost" (click)="htmlOpen.set(false)">Cancelar</button><button type="submit" grButton variant="primary" [loading]="convirtiendo()" [disabled]="!htmlTexto.trim()">Convertir</button></div>
        </form>
      </div>
    }

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
  protected readonly tabs: { v: Tab; l: string; c: string; i: GrIconName }[] = [{ v: 'flujo', l: 'Flujo', c: 'Flujo', i: 'activity' }, { v: 'diseno', l: 'Diseño', c: 'Diseño', i: 'pencil' }, { v: 'previa', l: 'Previsualización', c: 'Vista', i: 'eye' }, { v: 'ajustes', l: 'Ajustes', c: 'Ajustes', i: 'settings' }];
  protected readonly vistasDis = [{ v: 'diseno' as const, l: 'Diseño' }, { v: 'previa' as const, l: 'Vista previa' }, { v: 'html' as const, l: 'HTML' }, { v: 'whatsapp' as const, l: 'WhatsApp' }];
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
  protected readonly vistaDis = signal<'diseno' | 'previa' | 'html' | 'whatsapp'>('diseno');
  // WhatsApp from HTML
  protected readonly htmlOpen = signal(false);
  protected readonly convirtiendo = signal(false);
  protected htmlTexto = '';
  protected readonly ancho = signal<'escritorio' | 'movil'>(typeof matchMedia !== 'undefined' && matchMedia('(max-width: 767px)').matches ? 'movil' : 'escritorio');
  protected readonly panel = signal<'anadir' | 'capas'>('anadir');
  /** Desktop (≥ 1024 px): side panels inline; tablet and phone: «Añadir» / «Capas» open in a bottom sheet. */
  protected readonly escritorio = signal(typeof matchMedia === 'undefined' || matchMedia('(min-width: 1024px)').matches);
  protected readonly hoja = signal(false);
  private readonly frEmail = viewChild<ElementRef<HTMLIFrameElement>>('frEmail');
  protected readonly hist = signal<Bloque[][]>([]);
  protected readonly previa = signal<Previa | null>(null);
  // stable SafeHtml per HTML string: a fresh object on every change detection reloads the iframe in a loop
  private readonly emailHtml = computed(() => this.previa()?.emailHtml ?? '');
  protected readonly emailSeguro = computed(() => this.san.bypassSecurityTrustHtml(this.emailHtml()));
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
  protected readonly iaAplicada = signal<{ cambios: string[]; hora: string; antes: CampanaIn } | null>(null);
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
    return out.length ? out : ['2026-12-18'];
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
      { t: 'Mensaje', d: f.asunto || 'Sin asunto', m: wa ? (f.whatsapp ? 'WhatsApp propio' : 'WhatsApp derivado del diseño') : 'solo email', i: 'mail', tab: 'previa', estado: f.diseno.length ? 'ok' : 'pendiente' },
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
    // breakpoints: phones always preview at mobile width; tablet/phone hide the «Vista previa» view of the design tab
    const mqD = typeof matchMedia === 'undefined' ? null : matchMedia('(min-width: 1024px)');
    const mqM = typeof matchMedia === 'undefined' ? null : matchMedia('(max-width: 767px)');
    const alCambiar = () => {
      this.escritorio.set(!!mqD?.matches);
      if (mqD?.matches) this.hoja.set(false);
      else if (this.vistaDis() === 'previa') this.vistaDis.set('diseno');
      if (mqM?.matches) this.ancho.set('movil');
    };
    mqD?.addEventListener('change', alCambiar);
    mqM?.addEventListener('change', alCambiar);
    // re-measure the preview iframe when its width changes
    effect(() => {
      this.ancho();
      this.escritorio();
      requestAnimationFrame(() => this.ajustarAlto());
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
      mqD?.removeEventListener('change', alCambiar);
      mqM?.removeEventListener('change', alCambiar);
    });
  }

  /** The preview iframe grows with its content, so it never scrolls inside. */
  protected ajustarAlto(): void {
    const fr = this.frEmail()?.nativeElement;
    const doc = fr?.contentDocument;
    if (!fr || !doc?.documentElement) return;
    fr.style.height = '0px';
    fr.style.height = doc.documentElement.scrollHeight + 'px';
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
    const f: CampanaIn = { nombre: c.nombre, asunto: c.asunto, preheader: c.preheader, canales: c.canales, diseno: c.diseno, whatsapp: c.whatsapp ?? undefined, segmentoId: c.segmentoId, emailPorMin: c.emailPorMin, waPorMin: c.waPorMin };
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
  protected html(s?: string): SafeHtml { return this.san.bypassSecurityTrustHtml(md(s ?? '', this.varsComp())); }
  private readonly varsComp = computed(() => {
    const c = this.comps.current() as unknown as { nombre?: string; fechaInicio?: string; fechaFin?: string; sede?: { nombre?: string; ciudad?: string } } | null;
    const fin = c?.fechaFin && c.fechaFin !== c.fechaInicio ? ' y ' + this.diaLargo(c.fechaFin) : '';
    return { competicion: c?.nombre ?? '', fechas: c?.fechaInicio ? this.diaLargo(c.fechaInicio) + fin : 'fecha por confirmar', sede: [c?.sede?.nombre, c?.sede?.ciudad].filter(Boolean).join(', ') };
  });
  protected readonly variables = VARIABLES;
  protected tok(k: string): string { return '{{' + k + '}}'; }
  protected readonly varsOpen = signal(false);
  private ultimo: HTMLInputElement | HTMLTextAreaElement | null = null;
  protected conTexto(b: Bloque): boolean { return ['titulo', 'texto', 'boton', 'lista', 'dos_columnas', 'cuenta_atras'].includes(b.tipo); }
  protected campo(e: FocusEvent): void {
    const t = e.target;
    if (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type === 'text')) this.ultimo = t;
  }
  /** Inserts {{k}} at the cursor of the last text field touched (or at the end of the first one) and fires its ngModel. */
  protected insertarVar(k: string): void {
    this.varsOpen.set(false);
    const el = this.ultimo?.isConnected ? this.ultimo : document.querySelector<HTMLTextAreaElement | HTMLInputElement>('bo-campana aside textarea, bo-campana aside input[type=text], bo-campana aside input:not([type])');
    if (!el) return;
    const tok = this.tok(k);
    const ini = el.selectionStart ?? el.value.length;
    el.setRangeText(tok, ini, el.selectionEnd ?? ini, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.focus();
  }
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

  // ---- WhatsApp message ----
  protected waHint(t: string): string { return `${t.length} / 4000 · *negrita* · _cursiva_ · {{nombre}} · «Responde BAJA…» se añade solo`; }
  /** Edits the own WhatsApp message (starting from the one derived from the email when there is none). */
  protected setWA(p: Partial<WhatsApp>): void {
    if (!this.editable()) return;
    const base = this.f().whatsapp ?? this.copiaAuto();
    this.set({ whatsapp: { ...base, ...p } });
  }
  private copiaAuto(): WhatsApp {
    const a = this.previa()?.whatsappAuto;
    return { texto: a?.texto ?? '', imagen: a?.imagen || undefined, enlaces: (a?.enlaces ?? []).map((e) => ({ ...e })) };
  }
  protected setBoton(i: number, p: Partial<{ texto: string; url: string }>): void {
    const w = this.f().whatsapp;
    if (w) this.setWA({ enlaces: w.enlaces.map((e, k) => (k === i ? { ...e, ...p } : e)) });
  }
  protected quitarBoton(i: number): void {
    const w = this.f().whatsapp;
    if (w) this.setWA({ enlaces: w.enlaces.filter((_, k) => k !== i) });
  }
  protected anadirBoton(): void {
    const w = this.f().whatsapp;
    if (w && w.enlaces.length < 10) this.setWA({ enlaces: [...w.enlaces, { texto: '', url: '/entradas' }] });
  }
  /** Copies the WhatsApp derived from the email design as an own message, to retouch it. */
  protected async waDesdeEmail(): Promise<void> {
    if (!this.editable()) return;
    // the derived version is the one of the design as it is now (unsaved changes included)
    await this.refrescarPrevia({ ...this.f(), whatsapp: undefined });
    this.set({ whatsapp: this.copiaAuto() });
  }
  protected waAuto(): void {
    if (this.editable()) this.set({ whatsapp: undefined });
  }
  protected async convertirHTML(): Promise<void> {
    const h = this.htmlTexto.trim();
    if (!h) return;
    this.convirtiendo.set(true);
    try {
      const w = await this.api.whatsappDesdeHtml(this.cid(), h);
      this.set({ whatsapp: { texto: w.texto, imagen: w.imagen || undefined, enlaces: w.enlaces ?? [] } });
      this.htmlOpen.set(false);
      this.toasts.success('WhatsApp creado desde el HTML', 'Revísalo y guarda la campaña.');
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo convertir el HTML.'));
    } finally {
      this.convirtiendo.set(false);
    }
  }
  protected async subirWA(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.subiendo.set(true);
    try {
      this.setWA({ imagen: await this.media.upload(file, file.name) });
    } catch (e) {
      this.toasts.error(errText(e, 'No se pudo subir la imagen.'));
    } finally {
      this.subiendo.set(false);
    }
  }

  async refrescarPrevia(f = this.f()): Promise<void> {
    try {
      const p = await this.api.previsualizar(this.cid(), { nombre: f.nombre, asunto: f.asunto, preheader: f.preheader, diseno: f.diseno, whatsapp: f.whatsapp });
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
      if (p.code === 'DISENO_NO_VALIDO' || p.code === 'WHATSAPP_NO_VALIDO' || p.code === 'WHATSAPP_VACIO') this.error.set(p.detail ?? '');
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

  protected readonly ejemplosIA = ['Escribe un asunto corto para la última semana de entradas', 'Añade una cuenta atrás encima del botón', 'Escribe un WhatsApp propio más corto con un botón a /entradas', 'Envíala solo por email a 60 por minuto'];
  protected puedeIA(): boolean { return !this.iaCargando() && this.iaTexto.trim().length >= 3 && this.modelos().length > 0; }
  protected enter(e: KeyboardEvent): void {
    if (e.shiftKey || e.isComposing) return;
    e.preventDefault();
    void this.pedirIA();
  }
  protected async pedirIA(): Promise<void> {
    const texto = this.iaTexto.trim();
    if (!this.puedeIA()) return;
    const antes = this.f();
    this.msgs.update((m) => [...m, { rol: 'usuario', texto }]);
    this.iaTexto = '';
    this.iaCargando.set(true);
    this.iaSeg.set(0);
    const t = setInterval(() => this.iaSeg.update((s) => s + 1), 1000);
    try {
      const r = await this.api.ia(this.cid(), { instruccion: texto, campana: antes, seleccion: this.sel() || undefined, historial: this.msgs().slice(-7, -1), segmentos: this.segs().map((s) => ({ id: s.id, nombre: s.nombre })) });
      this.snapshot();
      const c = r.campana;
      this.set({ nombre: c.nombre, asunto: c.asunto, preheader: c.preheader ?? '', canales: c.canales, diseno: c.diseno, whatsapp: c.whatsapp ? { ...c.whatsapp, enlaces: c.whatsapp.enlaces ?? [] } : undefined, segmentoId: c.segmentoId || undefined, emailPorMin: c.emailPorMin, waPorMin: c.waPorMin });
      this.msgs.update((m) => [...m, { rol: 'asistente', texto: r.respuesta || 'Hecho.' }]);
      this.iaAplicada.set({ cambios: r.cambios, hora: new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(new Date()), antes });
      this.iaMeta = { modelo: r.modelo, nota: texto.slice(0, 300) };
      if (!c.diseno.some((b) => b.id === this.sel())) this.sel.set('');
      if (c.segmentoId !== antes.segmentoId) this.aud.set(null);
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
    this.f.set(x.antes);
    this.iaAplicada.set(null);
    this.iaMeta = null;
  }
}

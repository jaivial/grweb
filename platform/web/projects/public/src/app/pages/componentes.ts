import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  GrAlert, GrButton, GrCheckbox, GrCountdown, GrIcon, GrIconButton, GrInput, GrLiveStatus, GrLogo, GrRaffleItem, GrRaffleNotice, GrSelect, GrStatus, GrStepNumber,
  GrToastCard, GrWeightChip, GR_ICONS, type GrButtonVariant, type GrIconName, type GrLiveEstado, type GrStatusTone, type GrTone,
} from '@grcup/ui';
import { Seo } from '../core/seo';
import { Footer, Navbar } from '../layout/layout';
import { Newsletter } from '../layout/newsletter';
import { ETIQUETAS, SETS } from './componentes-figma';
import { TicketCard } from './entradas';

/** «Variant=Primary, State=Hover, Size=M» → { Variant: 'Primary', State: 'Hover', Size: 'M' }. */
const props = (n: string): Record<string, string> => Object.fromEntries(n.split(', ').map((p) => p.split('=') as [string, string]));
const variantes = (k: string) => SETS[k].v.map(([n, x, y]) => ({ p: props(n), x, y }));

const BOTON: Record<string, { v: GrButtonVariant; t: string; hover: string; icon?: GrIconName; right?: GrIconName }> = {
  Primary: { v: 'primary', t: 'Inscribirse', hover: 'shadow-glow' },
  Glass: { v: 'glass', t: 'Ver marcas', hover: 'bg-white/10', right: 'arrow-right' },
  Outline: { v: 'outline', t: 'Volver al inicio', hover: 'border-accent! text-text-primary!' },
  Display: { v: 'display', t: 'Participa ya', hover: 'bg-accent-deep!' },
  DisplayGradient: { v: 'display-gradient', t: 'Abrir en Google Maps', hover: 'shadow-glow!', icon: 'map-pin' },
  Pill: { v: 'pill', t: 'Compra ya', hover: 'shadow-glow' },
  Instagram: { v: 'instagram', t: 'Síguenos en Instagram', hover: '' },
};

/** Figma «Icon» names → the platform icon set. */
const ICONOS: Record<string, GrIconName> = {
  mapPin: 'map-pin', arrowRight: 'arrow-right', arrowDown: 'arrow-down', checkCircle: 'circle-check', alert: 'circle-alert', creditCard: 'credit-card',
  chevronDown: 'chevron-down', chevronRight: 'chevron-right', external: 'external-link', edit: 'pencil', logout: 'log-out',
};

const BADGE: Record<string, [GrStatusTone, string]> = {
  Abierto: ['abierto', 'Inscripciones abiertas'], Próximamente: ['proximamente', 'Próximamente'], 'Últimas plazas': ['ultimas', 'Últimas 10 plazas'],
  Agotado: ['agotado', 'Plazas agotadas'], 'En directo': ['directo', 'En directo'], Finalizado: ['finalizado', 'Finalizado'], 'Por confirmar': ['confirmar', 'Fecha por confirmar'],
};
const CHIP_STATUS: Record<string, [GrStatusTone, string]> = {
  'Status open': ['abierto', 'Inscripciones abiertas'], 'Status soon': ['proximamente', 'Próximamente'], 'Status closed': ['ultimas', 'Sorteo cerrado'],
};
const LIVE: Record<string, GrLiveEstado> = { 'En directo': 'en-directo', Reconectando: 'reconectando', 'Sin conexión': 'sin-conexion' };
const ALERTA: Record<string, { tone: GrTone; icon: GrIconName; t: string; accion: string; bg: string; fg: string }> = {
  Info: { tone: 'info', icon: 'circle-alert', t: 'La fecha y el nivel AEP de la edición 2026 están pendientes de confirmar.', accion: 'Más info', bg: 'bg-info/15', fg: 'text-info' },
  Success: { tone: 'success', icon: 'circle-check', t: 'Pago completado. Te hemos enviado un correo de confirmación.', accion: 'Más info', bg: 'bg-success/15', fg: 'text-success' },
  Warning: { tone: 'warning', icon: 'clock', t: 'Quedan 10 plazas. Las inscripciones cierran pronto.', accion: 'Más info', bg: 'bg-warning/15', fg: 'text-warning' },
  Error: { tone: 'danger', icon: 'circle-alert', t: 'El sorteo está cerrado. No se pueden comprar más boletos.', accion: 'Ver resultados', bg: 'bg-accent/15', fg: 'text-accent-text' },
};
const LOGO: Record<string, number> = { L: 145, M: 97, S: 44 };
/** Fixed «now» of the countdown states (Figma: 84 d 09 h 41 min 17 s before 19 Dec 2026 08:30). */
const AHORA = { 'Cuenta atrás': Date.parse('2026-12-19T08:30:00+01:00') - ((84 * 24 + 9) * 3600 + 41 * 60 + 17) * 1000, Hoy: Date.parse('2026-12-19T12:00:00+01:00'), Finalizado: Date.parse('2026-12-22T12:00:00+01:00') } as Record<string, number>;

/** Components of the Figma page that are not shared code (yet): where they live. */
const DONDE: Record<string, string> = {
  '80:155418': 'layout/layout.ts · gr-navbar (abajo, en su contenedor)',
  '80:155489': 'layout/layout.ts · menú móvil de gr-navbar (≤ 1024 px, botón ☰)',
  '80:156649': 'layout/layout.ts · gr-navbar (ruta activa con indicador)',
  '80:156725': 'layout/layout.ts · menú móvil de gr-navbar',
  '80:156963': 'layout/layout.ts · «Competición ▾» de gr-navbar',
  '80:157030': 'layout/layout.ts · barra inferior de gr-footer (móvil)',
  '80:157268': 'home/secciones.ts · gr-sec-cifras (datos del CMS)',
  '80:158159': 'layout/lightbox.ts · gr-lightbox',
  '80:159090': 'pages/seo-bloques.ts · gr-callout, gr-hechos',
  '80:158378': 'pages/seo-bloques.ts · gr-chips-ancla',
  '80:161680': 'pages/horarios.ts',
  '80:158850': 'pages/directo.ts',
  '80:158689': 'pages/directo.ts · gr-clasificacion',
  '80:158650': 'pages/directo.ts · gr-luces',
  '80:158995': 'pages/directo.ts · gr-edicion, pages/blog.ts',
  '80:160265': 'pages/entradas.ts',
  '80:159958': 'pages/entradas.ts',
  '80:160012': 'pages/entradas.ts',
  '80:160049': 'pages/entradas.ts',
  '80:161557': 'pages/atletas.ts',
  '80:157805': 'pages/alta-atleta.ts',
};

/** Component-set frame of the Figma page: its size, bg/base, Figma's dashed outline; scrolls sideways on narrow screens. */
@Component({
  selector: 'gr-cs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block max-w-full overflow-x-auto' },
  template: `<div class="relative shrink-0 rounded-sm border border-dashed border-[#9747ff] bg-bg-base" [style.width.px]="w()" [style.height.px]="h()"><ng-content /></div>`,
})
class Cs {
  readonly w = input.required<number>();
  readonly h = input.required<number>();
}

/** /_componentes (internal, noindex, not in the sitemap): the shared components laid out as Figma page 02 · Componentes, for visual QA. */
@Component({
  selector: 'gr-componentes-page',
  imports: [
    FormsModule, Cs, GrAlert, GrButton, GrCheckbox, GrCountdown, GrIcon, GrIconButton, GrInput, GrLiveStatus, GrLogo, GrRaffleItem, GrRaffleNotice, GrSelect, GrStatus,
    GrStepNumber, GrToastCard, GrWeightChip, Navbar, Footer, Newsletter, TicketCard,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto flex max-w-[1600px] flex-col min-[1700px]:max-w-none gap-24 px-5 py-20 md:px-8 xl:px-20">
      <header class="flex flex-col gap-3">
        <h1 class="text-display-m md:text-display-xl">Componentes</h1>
        <p class="max-w-[1100px] text-body-l text-text-tertiary">Componentes compartidos con la disposición de la página de Figma «02 · Componentes». Los marcados OBSOLETO no se implementan.</p>
      </header>

      @for (e of etiquetas; track e[0]) {
        @if (e[1]) {
          <h2 class="mt-36 -mb-14 text-display-l text-accent-text">{{ e[1] }}</h2>
        } @else {
          <section class="flex flex-col gap-[30px]" [attr.aria-label]="e[2]">
            <div class="flex max-w-[1200px] flex-col gap-2">
              <h2 class="text-ui-h3">{{ e[2] }}</h2>
              <p class="text-mono-s text-text-muted">{{ e[3] }}</p>
            </div>
            <div class="flex flex-col items-start gap-24">
              @switch (e[0]) {
                @case ('80:155152') {
                  <gr-cs id="cs-button" [w]="sets['button'].w" [h]="sets['button'].h">
                    @for (b of botones; track $index) {
                      @let c = boton[b.p['Variant']];
                      <button grButton class="absolute!" [style.left.px]="b.x" [style.top.px]="b.y" [variant]="c.v" [size]="b.p['Size'] === 'L' ? 'l' : 'm'" [icon]="c.icon ?? null" [iconRight]="c.right ?? null"
                        [disabled]="b.p['State'] === 'Disabled'" [loading]="b.p['State'] === 'Loading'" [class]="b.p['State'] === 'Hover' ? c.hover : ''">{{ c.t }}</button>
                    }
                  </gr-cs>
                }
                @case ('80:155408') {
                  <gr-cs id="cs-logo" [w]="sets['logo'].w" [h]="sets['logo'].h">
                    @for (l of logos; track $index) { <gr-logo class="absolute" [style.left.px]="l.x" [style.top.px]="l.y" [height]="logo[l.p['Size']]" /> }
                  </gr-cs>
                }
                @case ('80:155418') {
                  <!-- transform: the fixed navbar is positioned against this box -->
                  <div class="relative h-[88px] w-full max-w-[1440px] translate-x-0 overflow-hidden rounded-sm border border-dashed border-[#9747ff] bg-bg-base"><gr-navbar /></div>
                }
                @case ('80:155513') {
                  <div class="w-full translate-x-0 overflow-hidden rounded-sm border border-dashed border-[#9747ff]"><gr-footer /></div>
                }
                @case ('80:155864') {
                  <gr-cs id="cs-field" [w]="sets['field'].w" [h]="sets['field'].h">
                    @for (f of campos; track $index) {
                      <div class="absolute flex w-80 flex-col gap-2" [style.left.px]="f.x" [style.top.px]="f.y" [class.opacity-45]="f.p['State'] === 'Disabled'">
                        @if (f.p['Type'] === 'Text') {
                          <label class="text-label-s text-text-secondary" [for]="'cf' + $index">Email *</label>
                          <input grInput grSize="l" [id]="'cf' + $index" type="email" placeholder="email@ejemplo.com" [value]="f.p['State'] === 'Default' || f.p['State'] === 'Disabled' ? '' : 'atleta@grstrength.com'"
                            [invalid]="f.p['State'] === 'Error'" [disabled]="f.p['State'] === 'Disabled'" [class]="f.p['State'] === 'Focus' ? 'border-accent! shadow-[0_0_0_3px_rgb(196_43_62/0.25)]' : ''" />
                          @if (f.p['State'] === 'Error') { <p class="flex items-center gap-1.5 text-body-xs text-accent-text"><gr-icon name="circle-alert" [size]="14" />Introduce un email válido</p> }
                        } @else {
                          <label class="text-label-s text-text-secondary" [for]="'cf' + $index">Teléfono</label>
                          <span class="flex h-12 items-center gap-2 rounded-sm border border-line-strong bg-bg-field px-3 focus-within:border-accent focus-within:shadow-[0_0_0_3px_rgb(196_43_62/0.25)]">
                            <span class="text-body-m text-text-secondary">+34</span><span class="h-6 w-px bg-line-strong"></span>
                            <input [id]="'cf' + $index" type="tel" placeholder="123 456 789" [value]="f.p['State'] === 'Filled' ? '612 345 678' : ''" class="h-full min-w-0 flex-1 bg-transparent text-body-m outline-none placeholder:text-text-muted" />
                          </span>
                        }
                      </div>
                    }
                  </gr-cs>
                  <gr-cs id="cs-checkbox" [w]="sets['checkbox'].w" [h]="sets['checkbox'].h">
                    @for (c of checks; track $index) {
                      <gr-checkbox class="absolute w-[360px]" [style.left.px]="c.x" [style.top.px]="c.y" [kind]="c.p['Kind'] === 'Instagram' ? 'instagram' : 'legal'" [checked]="c.p['Checked'] === 'On'">
                        @if (c.p['Kind'] === 'Instagram') { Os sigo en Instagram <span class="text-accent-text">&#64;grstrength</span> }
                        @else { He leído y acepto la <a href="/privacidad" class="text-accent-text">política de tratamiento de mis datos</a> }
                      </gr-checkbox>
                    }
                  </gr-cs>
                }
                @case ('80:156017') {
                  <gr-cs id="cs-chip" [w]="sets['chip'].w" [h]="sets['chip'].h">
                    @for (c of chips; track $index) {
                      <div class="absolute" [style.left.px]="c.x" [style.top.px]="c.y">
                        @switch (c.p['Type']) {
                          @case ('Weight') { <span grWeightChip>−83kg</span> }
                          @case ('Weight active') { <span grWeightChip [active]="true">−83kg</span> }
                          @case ('Step 1') { <gr-step-number>1</gr-step-number> }
                          @case ('Step 2') { <gr-step-number>2</gr-step-number> }
                          @default { <gr-status [tone]="chipStatus[c.p['Type']][0]">{{ chipStatus[c.p['Type']][1] }}</gr-status> }
                        }
                      </div>
                    }
                  </gr-cs>
                }
                @case ('80:156099') {
                  <gr-cs id="cs-toast" [w]="sets['toast'].w" [h]="sets['toast'].h">
                    <gr-toast class="absolute" [style.left.px]="sets['toast'].v[0][1]" [style.top.px]="sets['toast'].v[0][2]" tone="success" title="Inscripción enviada correctamente" [closable]="false" />
                    <gr-toast class="absolute" [style.left.px]="sets['toast'].v[1][1]" [style.top.px]="sets['toast'].v[1][2]" tone="error" title="No se pudo procesar el pago. Inténtalo de nuevo." [closable]="false" />
                  </gr-cs>
                }
                @case ('80:156124') {
                  <gr-cs id="cs-icon" [w]="sets['icon'].w" [h]="sets['icon'].h">
                    @for (i of iconos; track $index) {
                      @if (icono(i.p['Name']); as n) { <gr-icon class="absolute text-white" [style.left.px]="i.x" [style.top.px]="i.y" [name]="n" [size]="24" [label]="i.p['Name']" /> }
                    }
                  </gr-cs>
                }
                @case ('80:156509') {
                  <gr-cs id="cs-iconButton" [w]="sets['iconButton'].w" [h]="sets['iconButton'].h">
                    @for (b of iconBotones; track $index) {
                      <button grIconButton class="absolute!" [style.left.px]="b.x" [style.top.px]="b.y" icon="menu" label="Abrir menú" [kind]="$any(b.p['Kind'].toLowerCase())" [size]="b.p['Size'] === 'L' ? 'l' : 'm'"
                        [disabled]="b.p['State'] === 'Disabled'" [class]="b.p['State'] === 'Hover' ? (b.p['Kind'] === 'Ghost' ? 'bg-white/6' : b.p['Kind'] === 'Glass' ? 'bg-white/10' : '') : b.p['State'] === 'Focus' ? 'shadow-[0_0_0_3px_rgb(196_43_62/0.6)]' : ''"></button>
                    }
                  </gr-cs>
                }
                @case ('80:157214') {
                  <gr-cs id="cs-countdown" [w]="sets['countdown'].w" [h]="sets['countdown'].h">
                    @for (c of cuentas; track $index) {
                      <gr-countdown class="absolute" [style.left.px]="c.x" [style.top.px]="c.y" target="2026-12-19" fin="2026-12-20" [size]="c.p['Size'] === 'L' ? 'l' : 's'" [ahora]="ahora[c.p['State']]" />
                    }
                  </gr-cs>
                }
                @case ('80:157469') {
                  <gr-cs id="cs-badge" [w]="sets['badge'].w" [h]="sets['badge'].h">
                    @for (b of badges; track $index) { <gr-status class="absolute!" [style.left.px]="b.x" [style.top.px]="b.y" [tone]="badge[b.p['Tone']][0]">{{ badge[b.p['Tone']][1] }}</gr-status> }
                  </gr-cs>
                }
                @case ('80:157910') {
                  <gr-cs id="cs-alert" [w]="sets['alert'].w" [h]="sets['alert'].h">
                    @for (a of alertas; track $index) {
                      @let t = alerta[a.p['Tone']];
                      <gr-alert class="absolute! w-[520px]" [style.left.px]="a.x" [style.top.px]="a.y" [tone]="t.tone" [icon]="t.icon">{{ t.t }}
                        @if (a.p['Action'] === 'Sí') {
                          <span alertEnd class="flex shrink-0 items-start gap-3">
                            <a href="#" class="rounded-sm px-2.5 py-1.5 text-label-s" [class]="t.bg + ' ' + t.fg">{{ t.accion }}</a>
                            <button type="button" class="mt-1.5 text-text-tertiary hover:text-text-primary" aria-label="Cerrar"><gr-icon name="x" [size]="16" /></button>
                          </span>
                        }
                      </gr-alert>
                    }
                  </gr-cs>
                }
                @case ('80:158207') {
                  <gr-cs id="cs-rifa" [w]="sets['rifa'].w" [h]="sets['rifa'].h">
                    <gr-raffle-item class="absolute w-80" [style.left.px]="sets['rifa'].v[0][1]" [style.top.px]="sets['rifa'].v[0][2]" nombre="Cinturón SBD 13 mm" descripcion="Cinturón de palanca homologado IPF, talla a elegir."
                      imagen="/img/componentes/rifa-cinturon.webp" [unidades]="1" valor="120 €" donante="SBD España" />
                    <gr-raffle-item class="absolute w-80" [style.left.px]="sets['rifa'].v[1][1]" [style.top.px]="sets['rifa'].v[1][2]" nombre="Lote de suplementos" descripcion="Proteína, creatina y shaker. Sin foto todavía: se muestra este marcador."
                      [unidades]="3" valor="60 €" donante="Nutri Sport" />
                  </gr-cs>
                  <gr-raffle-item class="w-80" nombre="Cinturón SBD 13 mm" descripcion="Cinturón de palanca homologado IPF, talla a elegir." imagen="/img/componentes/rifa-cinturon.webp" [unidades]="1" valor="120 €" donante="SBD España" ganador="0457" />
                  <gr-raffle-notice class="w-[454px] max-w-full">Los boletos se compran en el recinto el día del evento. Aquí no se paga nada: consulta los objetos que se rifan.</gr-raffle-notice>
                }
                @case ('80:159764') {
                  <gr-cs id="cs-ticket" [w]="sets['ticket'].w" [h]="sets['ticket'].h">
                    <gr-ticket class="absolute w-[350px]" [style.left.px]="sets['ticket'].v[0][1]" [style.top.px]="sets['ticket'].v[0][2]" linea1="Sábado 25 jul · Sesión de mañana" linea2="Puertas 8:30 · hasta las 14:30"
                      lugar="Pabellón Municipal de Almussafes" titular="Laura Gómez + 2 acompañantes" codigo="GRC-7K3P" qr="E:GRC-7K3P:ejemplo" />
                    <gr-ticket class="absolute w-[350px]" [style.left.px]="sets['ticket'].v[3][1]" [style.top.px]="sets['ticket'].v[3][2]" linea1="Sábado 25 jul · Sesión de mañana" linea2="Puertas 8:30 · hasta las 14:30"
                      lugar="Pabellón Municipal de Almussafes" titular="Laura Gómez + 2 acompañantes" codigo="GRC-7K3P" qr="E:GRC-7K3P:ejemplo" estado="anulada" />
                    <gr-ticket class="absolute w-[350px]" [style.left.px]="sets['ticket'].v[2][1]" [style.top.px]="sets['ticket'].v[2][2]" linea1="Sábado 25 jul · Sesión de mañana" linea2="Puertas 8:30 · hasta las 14:30"
                      lugar="Pabellón Municipal de Almussafes" titular="Laura Gómez + 2 acompañantes" codigo="GRC-7K3P" qr="E:GRC-7K3P:ejemplo" estado="usada" validadaEn="25/07 · 10:12" />
                  </gr-cs>
                }
                @case ('80:160240') {
                  <gr-cs id="cs-live" [w]="sets['live'].w" [h]="sets['live'].h">
                    @for (l of lives; track $index) { <gr-live-status class="absolute!" [style.left.px]="l.x" [style.top.px]="l.y" [estado]="live[l.p['Estado']]" /> }
                  </gr-cs>
                }
                @case ('80:162564') {
                  <div class="w-full max-w-[1200px]"><gr-newsletter nivel="p" /></div>
                }
                @case ('138:66754') {
                  <gr-cs id="cs-select" [w]="sets['select'].w" [h]="sets['select'].h">
                    @for (s of selects; track $index) {
                      @if (s.p['Estado'] !== 'Abierto' && s.p['Estado'] !== 'Foco') {
                        <div class="absolute flex flex-col gap-2" [class.w-80]="s.p['Tipo'] === 'Campo'" [style.left.px]="s.x" [style.top.px]="s.y" [class.opacity-45]="s.p['Estado'] === 'Deshabilitado'">
                          @if (s.p['Tipo'] === 'Campo') {
                            <label class="text-label-s text-text-secondary" [for]="'cs' + $index">Categoría de peso *</label>
                            <gr-select tam="l" [id]="'cs' + $index" [ngModel]="s.p['Estado'] === 'Valor' || s.p['Estado'] === 'Error' ? '-83' : ''" [invalido]="s.p['Estado'] === 'Error'" [disabled]="s.p['Estado'] === 'Deshabilitado'">
                              <option value="">Seleccionar categoría</option><option value="-66">−66 kg</option><option value="-74">−74 kg</option><option value="-83">−83 kg</option><option value="-93">−93 kg</option><option value="-105">−105 kg</option>
                            </gr-select>
                            <p class="text-body-xs" [class]="s.p['Estado'] === 'Error' ? 'text-accent-text' : 'text-text-tertiary'">{{ s.p['Estado'] === 'Error' ? 'Selecciona tu categoría' : 'Según tu peso corporal el día del pesaje' }}</p>
                          } @else {
                            <gr-select tipo="filtro" etiqueta="Categoría" aria-label="Categoría" [ngModel]="s.p['Estado'] === 'Valor' ? '-83' : ''">
                              <option value="">Todas</option><option value="-66">−66 kg</option><option value="-74">−74 kg</option><option value="-83">−83 kg</option>
                            </gr-select>
                          }
                        </div>
                      }
                    }
                  </gr-cs>
                }
                @default {
                  @if (donde[e[0]]; as d) { <p class="text-body-s text-text-tertiary">En código: {{ d }}</p> }
                  @else { <p class="text-body-s text-text-tertiary">Sin componente compartido: vive en la página que lo usa.</p> }
                }
              }
            </div>
          </section>
        }
      }
    </main>
  `,
})
export class ComponentesPage {
  /** «Raffle upsell» is obsolete (rifa solo presencial): its label goes too. */
  protected readonly etiquetas = ETIQUETAS.filter((e) => e[0] !== '80:160095');
  protected readonly sets = SETS;
  protected readonly boton = BOTON;
  protected readonly botones = variantes('button');
  protected readonly logo = LOGO;
  protected readonly logos = variantes('logo');
  protected readonly campos = variantes('field');
  protected readonly checks = variantes('checkbox');
  protected readonly chips = variantes('chip');
  protected readonly chipStatus = CHIP_STATUS;
  protected readonly iconos = variantes('icon');
  protected readonly iconBotones = variantes('iconButton');
  protected readonly cuentas = variantes('countdown');
  protected readonly ahora = AHORA;
  protected readonly badges = variantes('badge');
  protected readonly badge = BADGE;
  protected readonly alertas = variantes('alert');
  protected readonly alerta = ALERTA;
  protected readonly lives = variantes('live');
  protected readonly live = LIVE;
  protected readonly selects = variantes('select');
  protected readonly donde = DONDE;
  /** Icons of the Figma set the platform does not ship (nobody uses them yet) leave their slot empty. */
  protected icono(n: string): GrIconName | null {
    return ICONOS[n] ?? (n in GR_ICONS ? (n as GrIconName) : null);
  }

  constructor() {
    inject(Seo).set({ title: 'Componentes · GR Strength Cup', description: 'Componentes compartidos (uso interno).', path: '/_componentes', robots: 'noindex, nofollow' });
  }
}
